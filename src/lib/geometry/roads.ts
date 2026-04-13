import simplify from "simplify-js";
import * as turf from "@turf/turf";
import polygonClipping from "polygon-clipping";
import type {
  Feature, Polygon, MultiPolygon, LineString, Position,
} from "geojson";
import type { BBox } from "@/lib/store/types";

// ── Cleanup thresholds ───────────────────────────────────────────────────────

/** Polygon pieces smaller than this are removed from the clipped result. */
const MIN_POLYGON_AREA_M2 = 1500;

// ── Chaikin smoothing ────────────────────────────────────────────────────────

/**
 * Chaikin's corner-cutting algorithm — rounds real corners without introducing
 * new sharp angles, giving the buffer a near-uniform apparent stroke width.
 * Pre-simplification is applied before this so only genuine bends are smoothed.
 */
function chaikinSmooth(coords: Position[], iterations = 2): Position[] {
  let pts = coords;
  for (let iter = 0; iter < iterations; iter++) {
    const next: Position[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      next.push([0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1]);
      next.push([0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

// ── Engrave-layer simplification ─────────────────────────────────────────────

/** Simplify engrave (hairline) roads using Douglas-Peucker. Tolerance is
 *  passed in from the pipeline — it scales with the selected map area. */
export function simplifyRoads(
  features: Feature<LineString>[],
  tolerance: number
): Feature<LineString>[] {
  return features
    .map((f) => {
      const pts = f.geometry.coordinates.map(([lon, lat]) => ({ x: lon, y: lat }));
      const simplified = simplify(pts, tolerance, true);
      if (simplified.length < 2) return null;
      return {
        ...f,
        geometry: {
          type: "LineString" as const,
          coordinates: simplified.map(({ x, y }) => [x, y] as Position),
        },
      };
    })
    .filter((f): f is Feature<LineString> => f !== null);
}

// ── Isotropic buffer helpers ─────────────────────────────────────────────────

/**
 * Why we pre-scale longitude before buffering
 * ───────────────────────────────────────────
 * turf.buffer() works in geographic (degree) space with a UNIFORM radius in
 * all directions.  But our Mercator projection scales X and Y differently —
 * at 45 °N the vertical scale is ~41 % larger than the horizontal scale.
 * So an unmodified geographic buffer renders as an ellipse on the map:
 * N-S roads appear much wider than E-W roads.
 *
 * Fix: before buffering, scale longitudes so the coordinate space is
 * approximately equal-area (1 unit X ≈ 1 unit Y ≈ 111 km):
 *
 *   lon_scaled = (lon − midLon) × cosLat
 *
 * A circular buffer in this scaled space corresponds to equal VISUAL width
 * in all orientations once projected.  After buffering, un-scale:
 *
 *   lon = lon_scaled / cosLat + midLon
 *
 * Result: roads at every angle — N-S, E-W, diagonal — share the same
 * uniform visual width in the exported SVG.
 */
function makeIsoHelpers(bbox: BBox) {
  const [west, south, east, north] = bbox;
  const midLat = (south + north) / 2;
  const midLon = (west + east) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const scaleLon = (coords: Position[]): Position[] =>
    coords.map(([lon, lat]) => [(lon - midLon) * cosLat, lat]);

  const unscaleLon = (rings: Position[][]): Position[][] =>
    rings.map((ring) =>
      ring.map(([x, lat]) => [x / cosLat + midLon, lat])
    );

  return { scaleLon, unscaleLon };
}

// ── Buffering ────────────────────────────────────────────────────────────────

/**
 * Buffer the major-road network and return a clean, clipped MultiPolygon
 * with visually uniform road widths at all orientations.
 *
 * Performance architecture
 * ────────────────────────
 * Each road is buffered individually (fast: small JSTS call per road ≈ 3 ms),
 * then all buffer polygons are unioned with polygon-clipping in batches.
 * Async yields between batches keep the browser responsive.
 * Typical city with 200 roads: ~1–1.5 s total.
 */
export async function bufferMajorRoads(
  features: Feature<LineString>[],
  bufferMeters: number,
  clipBounds: Feature<Polygon>,
  bbox: BBox
): Promise<Feature<MultiPolygon> | null> {
  if (features.length === 0) return null;

  const { scaleLon, unscaleLon } = makeIsoHelpers(bbox);

  // Adaptive pre-simplification tolerance — relax for larger areas so coordinate
  // counts stay manageable without visible quality loss at the viewing distance
  // a city-scale laser map is used at.
  const [west, south, east, north] = bbox;
  const _cosLat = Math.cos(((south + north) / 2 * Math.PI) / 180);
  const areaKm2 = Math.abs(east - west) * 111.32 * _cosLat * Math.abs(north - south) * 110.574;
  const preSmoothTolerance =
    areaKm2 < 30  ? 0.00002 :  // ~2 m  — fine detail for small neighbourhoods
    areaKm2 < 80  ? 0.00005 :  // ~5 m  — medium detail
                    0.0001;     // ~10 m — city scale (80–150 km²)

  // ── 1. Pre-simplify → Chaikin smooth ──────────────────────────────────────
  const PREP_BATCH = 25;
  const candidates: Feature<LineString>[] = [];

  for (let i = 0; i < features.length; i += PREP_BATCH) {
    const batch = features.slice(i, Math.min(i + PREP_BATCH, features.length));
    for (const road of batch) {
      if (road.geometry.coordinates.length < 2) continue;
      const simplified = simplify(
        road.geometry.coordinates.map(([lon, lat]) => ({ x: lon, y: lat })),
        preSmoothTolerance,
        true
      );
      if (simplified.length < 2) continue;
      candidates.push({
        ...road,
        geometry: {
          ...road.geometry,
          coordinates: chaikinSmooth(simplified.map(({ x, y }) => [x, y])),
        },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (candidates.length === 0) return null;

  // ── 2. Buffer each road individually in iso-scaled space ──────────────────
  // Pre-scale → buffer → un-scale ensures the buffer radius is equal in both
  // the east-west and north-south directions after projection, giving every
  // road the same visual width regardless of its orientation on the map.
  const bufferKm = bufferMeters / 1000;
  const polys: Position[][][] = [];
  const BUFFER_BATCH = 20;

  for (let i = 0; i < candidates.length; i += BUFFER_BATCH) {
    const batch = candidates.slice(i, Math.min(i + BUFFER_BATCH, candidates.length));
    for (const road of batch) {
      try {
        // Scale lon → isotropic space
        const scaledRoad: Feature<LineString> = {
          ...road,
          geometry: {
            ...road.geometry,
            coordinates: scaleLon(road.geometry.coordinates),
          },
        };

        const buf = turf.buffer(scaledRoad, bufferKm, {
          units: "kilometers",
          steps: 10, // smooth end-caps without excessive vertices
        });
        if (!buf) continue;

        // Un-scale lon back to geographic space
        if (buf.geometry.type === "Polygon") {
          const unscaled = unscaleLon(buf.geometry.coordinates as Position[][]);
          polys.push(unscaled);
        } else if (buf.geometry.type === "MultiPolygon") {
          for (const poly of buf.geometry.coordinates as Position[][][]) {
            polys.push(unscaleLon(poly as Position[][]));
          }
        }
      } catch {
        // skip malformed geometry
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  if (polys.length === 0) return null;

  // ── 3. Union all buffer polygons ──────────────────────────────────────────
  // polygon-clipping (Martinez sweep-line) is much faster than JSTS union
  // for many simple shapes and handles junctions cleanly.
  const UNION_BATCH = 15;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = [polys[0]];

  for (let i = 1; i < polys.length; i += UNION_BATCH) {
    const batch = polys
      .slice(i, Math.min(i + UNION_BATCH, polys.length))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p): any => [p]);
    try {
      result = polygonClipping.union(result, ...batch);
    } catch {
      for (const poly of batch) {
        try {
          result = polygonClipping.union(result, poly);
        } catch { /* skip */ }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  // ── 4. Clip to selection bbox ──────────────────────────────────────────────
  let clipped: Position[][][];
  try {
    clipped = polygonClipping.intersection(
      result,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [clipBounds.geometry.coordinates] as any
    ) as Position[][][];
  } catch {
    clipped = result as Position[][][];
  }

  // ── 5. Drop tiny fragment polygons ────────────────────────────────────────
  const cleaned = clipped.filter((poly) => {
    try {
      const area = turf.area({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: poly },
      } as Feature<Polygon>);
      return area >= MIN_POLYGON_AREA_M2;
    } catch {
      return false;
    }
  });

  if (cleaned.length === 0) return null;

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiPolygon", coordinates: cleaned as Position[][][] },
  };
}
