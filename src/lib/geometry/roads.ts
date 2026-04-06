import simplify from "simplify-js";
import * as turf from "@turf/turf";
import polygonClipping from "polygon-clipping";
import type {
  Feature, Polygon, MultiPolygon, MultiLineString, LineString, Position,
} from "geojson";

// ── Cleanup thresholds ───────────────────────────────────────────────────────

/** Road segments shorter than this are discarded before buffering.
 *  Prevents point-like stubs from becoming isolated blobs in the output. */
const MIN_ROAD_LENGTH_KM = 0.025; // 25 m

/** Polygon pieces smaller than this are removed from the clipped result.
 *  Catches any tiny island fragments left at the bbox boundary. */
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
      const simplified = simplify(
        coordsToPoints(f.geometry.coordinates),
        tolerance,
        true
      );
      if (simplified.length < 2) return null;
      return {
        ...f,
        geometry: {
          type: "LineString" as const,
          coordinates: pointsToCoords(simplified),
        },
      };
    })
    .filter((f): f is Feature<LineString> => f !== null);
}

// ── Buffering ────────────────────────────────────────────────────────────────

/**
 * Buffer the major-road network and return a clean, clipped MultiPolygon.
 *
 * Key approach: combine all road LineStrings into a single MultiLineString
 * and buffer the whole network in ONE operation.  JSTS (the engine inside
 * @turf/turf) resolves junction geometry topologically when given the full
 * network, producing perfectly connected roads with no thin slivers or gaps
 * at intersections — unlike the old approach of buffering each segment
 * separately and then trying to union the results.
 */
export function bufferMajorRoads(
  features: Feature<LineString>[],
  bufferMeters: number,
  clipBounds: Feature<Polygon>,
  tolerance: number
): Feature<MultiPolygon> | null {
  if (features.length === 0) return null;

  // 1. Simplify, then drop stubs too short to matter
  const candidates = simplifyRoads(features, tolerance).filter((road) => {
    try {
      return turf.length(road, { units: "kilometers" }) >= MIN_ROAD_LENGTH_KM;
    } catch {
      return false;
    }
  });

  if (candidates.length === 0) return null;

  // 2. Merge all road lines into a single MultiLineString so that JSTS can
  //    resolve intersections topologically in one pass — this is what produces
  //    fully-merged, uniformly-wide roads with clean junctions.
  const network: Feature<MultiLineString> = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "MultiLineString",
      coordinates: candidates.map((r) => r.geometry.coordinates),
    },
  };

  // 3. Buffer the entire network at once with generous steps for smooth curves
  let buffered: Feature<Polygon | MultiPolygon>;
  try {
    const result = turf.buffer(network, bufferMeters / 1000, {
      units: "kilometers",
      steps: 16,
    });
    if (!result) return null;
    buffered = result as Feature<Polygon | MultiPolygon>;
  } catch {
    return null;
  }

  // 4. Normalise to Position[][][] for polygon-clipping
  const bufCoords: Position[][][] =
    buffered.geometry.type === "Polygon"
      ? [buffered.geometry.coordinates as Position[][]]
      : (buffered.geometry.coordinates as Position[][][]);

  // 5. Clip to the selection bbox
  let clipped: Position[][][];
  try {
    clipped = polygonClipping.intersection(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bufCoords as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [clipBounds.geometry.coordinates] as any
    ) as Position[][][];
  } catch {
    clipped = bufCoords;
  }

  // 6. Drop tiny fragment polygons that can appear at the clipping boundary
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
