import simplify from "simplify-js";
import * as turf from "@turf/turf";
import polygonClipping from "polygon-clipping";
import type { Feature, Polygon, MultiPolygon, LineString, Position } from "geojson";

// ── Cleanup thresholds ───────────────────────────────────────────────────────

/** Road segments shorter than this are discarded before buffering.
 *  Eliminates point-like stubs that become isolated blobs in the output. */
const MIN_ROAD_LENGTH_KM = 0.025; // 25 m

/** Polygon pieces smaller than this are removed from the final union result.
 *  Catches any tiny islands left after clipping to the bbox. */
const MIN_POLYGON_AREA_M2 = 800;

// ── Simplification ───────────────────────────────────────────────────────────

interface SimplifyPoint { x: number; y: number }

function coordsToPoints(coords: Position[]): SimplifyPoint[] {
  return coords.map(([lon, lat]) => ({ x: lon, y: lat }));
}
function pointsToCoords(pts: SimplifyPoint[]): Position[] {
  return pts.map(({ x, y }) => [x, y]);
}

export function simplifyRoads(
  features: Feature<LineString>[],
  tolerance: number
): Feature<LineString>[] {
  return features
    .map((f) => {
      const simplified = simplify(coordsToPoints(f.geometry.coordinates), tolerance, true);
      if (simplified.length < 2) return null;
      return { ...f, geometry: { type: "LineString" as const, coordinates: pointsToCoords(simplified) } };
    })
    .filter((f): f is Feature<LineString> => f !== null);
}

// ── Buffering & union ────────────────────────────────────────────────────────

export function bufferMajorRoads(
  features: Feature<LineString>[],
  bufferMeters: number,
  clipBounds: Feature<Polygon>,
  tolerance: number
): Feature<MultiPolygon> | null {
  if (features.length === 0) return null;

  // 1. Simplify + remove stubs that are too short to produce meaningful shapes
  const candidates = simplifyRoads(features, tolerance).filter((road) => {
    try {
      return turf.length(road, { units: "kilometers" }) >= MIN_ROAD_LENGTH_KM;
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) return null;

  // 2. Buffer every segment by the same radius (uniform thickness across layer)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bufferedPolys: any[] = [];

  for (const road of candidates) {
    try {
      const buf = turf.buffer(road, bufferMeters / 1000, {
        units: "kilometers",
        steps: 6, // slightly more than 4 for smoother curves on smaller roads
      });
      if (!buf) continue;

      if (buf.geometry.type === "Polygon") {
        bufferedPolys.push(buf.geometry.coordinates);
      } else if (buf.geometry.type === "MultiPolygon") {
        for (const poly of buf.geometry.coordinates) bufferedPolys.push(poly);
      }
    } catch {
      // skip malformed geometry
    }
  }

  if (bufferedPolys.length === 0) return null;

  // 3. Progressive union — merge all buffered shapes into one MultiPolygon
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = [bufferedPolys[0]];
  for (let i = 1; i < bufferedPolys.length; i++) {
    try {
      result = polygonClipping.union(result, [bufferedPolys[i]]);
    } catch {
      // continue — one bad segment won't ruin the whole result
    }
  }

  // 4. Clip to bbox, then filter out small isolated fragments
  try {
    const bboxCoords = [clipBounds.geometry.coordinates];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clipped = polygonClipping.intersection(result, bboxCoords as any) as Position[][][];

    // Remove tiny polygon pieces (isolated dots / road stubs after clipping)
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
  } catch {
    // Fallback: return unclipped result without fragment filtering
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: result as Position[][][] },
    };
  }
}
