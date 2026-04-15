import polygonClipping from "polygon-clipping";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, LineString, Position } from "geojson";
import type { BBox } from "@/lib/store/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClipMulti = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function featureToClipCoords(f: Feature<Polygon | MultiPolygon>): any {
  if (f.geometry.type === "Polygon") {
    return [f.geometry.coordinates];
  }
  return f.geometry.coordinates;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clipResultToFeature(result: any): Feature<MultiPolygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: result as Position[][][] },
  };
}

/**
 * Remove rings from a MultiPolygon that are smaller than the threshold.
 * - Outer rings (index 0): tiny land islands below threshold are dropped entirely
 * - Inner rings (index > 0): tiny water holes below threshold are dropped (no hole punched)
 */
function cleanMultiPolygon(
  mp: Feature<MultiPolygon>,
  minOuterAreaM2: number,
  minHoleAreaM2: number
): Feature<MultiPolygon> {
  const cleaned: Position[][][] = [];

  for (const polygon of mp.geometry.coordinates) {
    const [outerRing, ...holeRings] = polygon;

    // Evaluate outer ring area
    let outerAreaM2 = 0;
    try {
      outerAreaM2 = turf.area({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [outerRing] },
      });
    } catch {
      continue; // skip degenerate ring
    }
    if (outerAreaM2 < minOuterAreaM2) continue;

    // Keep only holes large enough to matter
    const filteredHoles = holeRings.filter((hole) => {
      try {
        const holeAreaM2 = turf.area({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [hole] },
        });
        return holeAreaM2 >= minHoleAreaM2;
      } catch {
        return false;
      }
    });

    cleaned.push([outerRing, ...filteredHoles]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: cleaned },
  };
}

// After difference: minimum outer land-island and minimum water hole to keep
const MIN_LAND_ISLAND_M2 = 500;   // discard tiny land specks
const MIN_WATER_HOLE_M2  = 1000;  // discard tiny water holes (noise)

/**
 * Scale water-area thresholds and pre-simplification tolerance with the
 * selected map area so large-city queries don't spend time on tiny ponds
 * or hyper-detailed coastline vertices that aren't visible at laser scale.
 */
function waterParamsForArea(areaKm2: number) {
  if (areaKm2 < 50) {
    return { minWaterAreaM2: 2_500,  simplifyTolerance: 0 };          // ~50×50 m
  }
  if (areaKm2 < 150) {
    return { minWaterAreaM2: 10_000, simplifyTolerance: 0.0001 };     // ~100×100 m, ~10 m tol
  }
  if (areaKm2 < 350) {
    return { minWaterAreaM2: 40_000, simplifyTolerance: 0.0003 };     // ~200×200 m, ~30 m tol
  }
  return   { minWaterAreaM2: 100_000, simplifyTolerance: 0.0006 };    // ~316×316 m, ~60 m tol
}

export async function unionWaterPolygons(
  features: Feature<Polygon | MultiPolygon | LineString>[],
  bboxPolygon: Feature<Polygon>,
  areaKm2 = 0
): Promise<Feature<MultiPolygon> | null> {
  const { minWaterAreaM2, simplifyTolerance } = waterParamsForArea(areaKm2);
  const polygonFeatures: Feature<Polygon | MultiPolygon>[] = [];

  for (const f of features) {
    if (f.geometry.type === "LineString") {
      // Rivers/canals: buffer into a polygon. Use a meaningful width for each type.
      const waterway = (f.properties as Record<string, string>)?.waterway ?? "";
      const bufferKm = waterway === "river" ? 0.06 : 0.04; // 60m river, 40m canal
      try {
        const buffered = turf.buffer(f as Feature<LineString>, bufferKm, {
          units: "kilometers",
          steps: 8,
        });
        if (buffered) polygonFeatures.push(buffered as Feature<Polygon>);
      } catch {
        // skip malformed
      }
    } else {
      // Closed water polygon — filter out anything too small to matter at this scale
      try {
        if (turf.area(f) < minWaterAreaM2) continue;
      } catch {
        // if area check fails, include it anyway
      }
      // Pre-simplify for large areas — reduces vertex count before the union loop,
      // which is the most expensive step for complex coastlines and river systems.
      if (simplifyTolerance > 0) {
        try {
          const simplified = turf.simplify(f as Feature<Polygon | MultiPolygon>, {
            tolerance: simplifyTolerance,
            highQuality: false,
            mutate: false,
          });
          polygonFeatures.push(simplified as Feature<Polygon | MultiPolygon>);
          continue;
        } catch { /* fall through to push original */ }
      }
      polygonFeatures.push(f as Feature<Polygon | MultiPolygon>);
    }
  }

  if (polygonFeatures.length === 0) return null;

  // Progressive union of all water polygons.
  // Yield every 20 features so the browser stays responsive during large datasets.
  let result: ClipMulti = featureToClipCoords(polygonFeatures[0]);
  for (let i = 1; i < polygonFeatures.length; i++) {
    try {
      result = polygonClipping.union(result, featureToClipCoords(polygonFeatures[i]));
    } catch {
      // skip malformed geometry
    }
    if (i % 20 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  // Clip water union to bbox boundary
  try {
    const bboxCoords = featureToClipCoords(bboxPolygon);
    const clipped = polygonClipping.intersection(result, bboxCoords);
    if (clipped.length === 0) return null;
    return clipResultToFeature(clipped);
  } catch {
    return clipResultToFeature(result);
  }
}

// ---------------------------------------------------------------------------
// Ocean synthesis from OSM coastline ways
// ---------------------------------------------------------------------------

/**
 * Given the t-parameter (0–4, CCW around bbox boundary) for two endpoints,
 * return the corners visited going CCW from t_A to t_B (exclusive of endpoints).
 * bbox = [west, south, east, north]
 */
function cornersBetweenCCW(t_A: number, t_B: number, bbox: BBox): Position[] {
  const [west, south, east, north] = bbox;
  // Corners in CCW order starting from SW corner (t=0)
  const corners: Position[] = [
    [west, south],  // t=0 SW
    [east, south],  // t=1 SE
    [east, north],  // t=2 NE
    [west, north],  // t=3 NW
  ];

  const result: Position[] = [];
  // Normalise so we always go forward
  let t = t_A;
  // Step through corners at integer t values
  for (let steps = 0; steps < 4; steps++) {
    // Next integer corner index in CCW direction
    const nextT = Math.floor(t) + 1;
    if (nextT >= t_A + 4) break; // full loop — shouldn't happen for open chains

    // Going CCW: we pass corner index (nextT mod 4)
    const normalised = ((nextT - t_A) % 4 + 4) % 4;
    const tFromA = normalised === 0 ? 4 : normalised;

    // Check if this corner is between t_A and t_B (CCW)
    let dist = t_B - t_A;
    if (dist <= 0) dist += 4;
    if (tFromA < dist) {
      result.push(corners[Math.floor(nextT) % 4]);
    }
    t = nextT;
  }
  return result;
}

/**
 * Map a point on the bbox boundary to the CCW parameter t ∈ [0,4).
 * bbox = [west, south, east, north]
 * Returns -1 if not on boundary (within tolerance).
 */
function pointToT(p: Position, bbox: BBox): number {
  const [west, south, east, north] = bbox;
  const tol = 1e-5;
  const [lon, lat] = p;

  // South edge SW→SE: t ∈ [0,1)
  if (Math.abs(lat - south) < tol && lon >= west - tol && lon <= east + tol) {
    return ((lon - west) / (east - west));
  }
  // East edge SE→NE: t ∈ [1,2)
  if (Math.abs(lon - east) < tol && lat >= south - tol && lat <= north + tol) {
    return 1 + (lat - south) / (north - south);
  }
  // North edge NE→NW: t ∈ [2,3)
  if (Math.abs(lat - north) < tol && lon >= west - tol && lon <= east + tol) {
    return 2 + (east - lon) / (east - west);
  }
  // West edge NW→SW: t ∈ [3,4)
  if (Math.abs(lon - west) < tol && lat >= south - tol && lat <= north + tol) {
    return 3 + (north - lat) / (north - south);
  }
  return -1;
}

/**
 * Compute the signed area (shoelace) of a ring. Positive = CCW, negative = CW.
 */
function signedArea(ring: Position[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return area / 2;
}

/**
 * Stitch coordinate arrays into open chains (and closed rings).
 * Returns each chain as a Position[]. Chains that are closed (start===end)
 * are included as-is.
 */
function stitchIntoChains(coordArrays: Position[][]): Position[][] {
  if (coordArrays.length === 0) return [];

  function epKey(p: Position): string {
    return `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  }

  const segments = coordArrays.map((c) => [...c]);
  const used = new Array(segments.length).fill(false);

  // endpoint → [segment indices]
  const endpointMap = new Map<string, number[]>();
  function addEp(key: string, idx: number) {
    const list = endpointMap.get(key);
    if (list) list.push(idx);
    else endpointMap.set(key, [idx]);
  }
  function removeEp(key: string, idx: number) {
    const list = endpointMap.get(key);
    if (!list) return;
    const pos = list.indexOf(idx);
    if (pos !== -1) list.splice(pos, 1);
  }

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    addEp(epKey(s[0]), i);
    addEp(epKey(s[s.length - 1]), i);
  }

  function markUsed(idx: number) {
    used[idx] = true;
    const s = segments[idx];
    removeEp(epKey(s[0]), idx);
    removeEp(epKey(s[s.length - 1]), idx);
  }

  function findNext(pt: Position): { idx: number; reverse: boolean } | null {
    const key = epKey(pt);
    const candidates = endpointMap.get(key) ?? [];
    for (const idx of candidates) {
      if (used[idx]) continue;
      const s = segments[idx];
      if (Math.abs(s[0][0] - pt[0]) < 1e-9 && Math.abs(s[0][1] - pt[1]) < 1e-9) {
        return { idx, reverse: false };
      }
      if (Math.abs(s[s.length - 1][0] - pt[0]) < 1e-9 && Math.abs(s[s.length - 1][1] - pt[1]) < 1e-9) {
        return { idx, reverse: true };
      }
    }
    return null;
  }

  const chains: Position[][] = [];
  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    markUsed(s);
    let chain = [...segments[s]];

    // Extend from tail
    for (;;) {
      const m = findNext(chain[chain.length - 1]);
      if (!m) break;
      markUsed(m.idx);
      const seg = segments[m.idx];
      chain = chain.concat(m.reverse ? [...seg].reverse().slice(1) : seg.slice(1));
    }
    // Extend from head
    for (;;) {
      const m = findNext(chain[0]);
      if (!m) break;
      markUsed(m.idx);
      const seg = segments[m.idx];
      chain = (m.reverse ? seg : [...seg].reverse()).concat(chain.slice(1));
    }

    if (chain.length >= 2) chains.push(chain);
  }
  return chains;
}

/**
 * Build land polygon(s) directly from OSM coastline ways.
 *
 * OSM convention: land is to the LEFT of coastline direction, sea is to the RIGHT.
 *
 * For each open chain crossing the bbox boundary:
 *   land ring = A → chain → B → cornersBetweenCCW(tB, tA, bbox) → A
 *
 * Going CCW from B to A picks up the bbox corners on the LAND side (verified by
 * the signed-area check — the resulting ring must be CCW = positive area).
 *
 * Multiple chains are intersected to produce the actual land area (each chain
 * constrains land from one side — e.g. Gulf coast from the south, bay coast
 * from the north, together yielding the peninsula).
 *
 * Closed CCW rings in the data are islands (land); they are unioned into the result.
 */
export function buildLandFromCoastlines(
  coastlineCoords: Position[][],
  bbox: BBox
): Feature<MultiPolygon> | null {
  if (coastlineCoords.length === 0) return null;

  const chains = stitchIntoChains(coastlineCoords);
  if (chains.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openLandPolys: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const islandPolys: any[] = [];

  for (const chain of chains) {
    const start = chain[0];
    const end = chain[chain.length - 1];
    const isClosed =
      Math.abs(start[0] - end[0]) < 1e-9 &&
      Math.abs(start[1] - end[1]) < 1e-9;

    if (isClosed) {
      // In OSM coastline convention, a closed ring where land is to the LEFT
      // means a CCW ring = the interior is land = an island.
      const area = signedArea(chain);
      if (area > 0 && chain.length >= 4) {
        // CCW closed ring = island (interior is land)
        const ring = [...chain];
        // Ensure ring is properly closed
        if (
          Math.abs(ring[0][0] - ring[ring.length - 1][0]) > 1e-9 ||
          Math.abs(ring[0][1] - ring[ring.length - 1][1]) > 1e-9
        ) {
          ring.push([ring[0][0], ring[0][1]]);
        }
        islandPolys.push([ring]);
      }
      // CW ring = enclosed sea — skip (we don't need to model it explicitly)
      continue;
    }

    // Open chain: clip to bbox
    let clipped: Position[];
    try {
      const lineFeature: Feature<LineString> = {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: chain },
      };
      const result = turf.bboxClip(lineFeature, bbox);
      if (!result || result.geometry.type !== "LineString") continue;
      clipped = result.geometry.coordinates as Position[];
    } catch {
      clipped = chain;
    }

    if (clipped.length < 2) continue;

    const A = clipped[0];
    const B = clipped[clipped.length - 1];
    const tA = pointToT(A, bbox);
    const tB = pointToT(B, bbox);

    // Both endpoints must be on the bbox boundary
    if (tA < 0 || tB < 0) continue;
    // Degenerate: A and B are the same boundary point
    if (Math.abs(tA - tB) < 1e-9) continue;

    // Land corners: go CCW from B to A — this traverses the bbox edge on the LAND side.
    // (OSM: land is LEFT of direction A→B, so the land boundary from B back to A is
    //  the CCW arc around the bbox.)
    const landCorners = cornersBetweenCCW(tB, tA, bbox);

    // Build ring: A → chain interior → B → land corners → A
    const ring: Position[] = [A, ...clipped.slice(1, -1), B, ...landCorners, A];
    if (ring.length < 4) continue;

    const area = signedArea(ring);
    if (Math.abs(area) < 1e-10) continue; // degenerate

    // GeoJSON exterior ring must be CCW (positive area).
    // For a correctly directed OSM coastline this will already be CCW;
    // the reversal is a safety net for any edge cases.
    const finalRing = area > 0 ? ring : [...ring].reverse();
    openLandPolys.push([finalRing]);
  }

  if (openLandPolys.length === 0 && islandPolys.length === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let landResult: any;

  if (openLandPolys.length === 0) {
    // Only closed island rings — union them together
    landResult = islandPolys[0];
    for (let i = 1; i < islandPolys.length; i++) {
      try {
        const uni = polygonClipping.union(landResult, islandPolys[i]);
        if (uni && uni.length > 0) landResult = uni;
      } catch { /* skip */ }
    }
  } else {
    // Start with the first open-chain land polygon, then intersect each additional
    // chain's land polygon.  Each chain constrains the land from one side; the
    // intersection of all constraints is the actual land area.
    landResult = openLandPolys[0];
    for (let i = 1; i < openLandPolys.length; i++) {
      try {
        const inter = polygonClipping.intersection(landResult, openLandPolys[i]);
        if (inter && inter.length > 0) {
          landResult = inter;
        }
        // If intersection is empty (chains bound separate land masses), keep
        // the existing result — better to show more land than none.
      } catch { /* keep what we have */ }
    }
  }

  // Union in any island polygons
  for (const island of islandPolys) {
    try {
      const uni = polygonClipping.union(landResult, island);
      if (uni && uni.length > 0) landResult = uni;
    } catch { /* skip */ }
  }

  if (!landResult || !landResult.length) return null;

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: landResult },
  };
}

export async function subtractWaterFromLand(
  landBase: Feature<Polygon | MultiPolygon>,
  water: Feature<MultiPolygon> | null
): Promise<Feature<MultiPolygon>> {
  const bboxCoords: ClipMulti = featureToClipCoords(landBase);

  if (!water) {
    return clipResultToFeature(bboxCoords);
  }

  let result: Feature<MultiPolygon>;
  try {
    const waterCoords = featureToClipCoords(water);
    const diff = polygonClipping.difference(bboxCoords, waterCoords);
    result = clipResultToFeature(diff);
  } catch {
    result = clipResultToFeature(bboxCoords);
  }

  // Remove tiny land islands and tiny water holes from the final polygon
  return cleanMultiPolygon(result, MIN_LAND_ISLAND_M2, MIN_WATER_HOLE_M2);
}
