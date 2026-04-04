import simplify from "simplify-js";
import * as turf from "@turf/turf";
import polygonClipping from "polygon-clipping";
import type { Feature, Polygon, MultiPolygon, LineString, Position } from "geojson";

interface SimplifyPoint {
  x: number;
  y: number;
}

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

export function bufferMajorRoads(
  features: Feature<LineString>[],
  bufferMeters: number,
  clipBounds: Feature<Polygon>,
  tolerance: number
): Feature<MultiPolygon> | null {
  if (features.length === 0) return null;

  const simplified = simplifyRoads(features, tolerance);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bufferedPolys: any[] = [];

  for (const road of simplified) {
    try {
      const buf = turf.buffer(road, bufferMeters / 1000, {
        units: "kilometers",
        steps: 4,
      });
      if (!buf) continue;

      if (buf.geometry.type === "Polygon") {
        bufferedPolys.push(buf.geometry.coordinates);
      } else if (buf.geometry.type === "MultiPolygon") {
        for (const poly of buf.geometry.coordinates) {
          bufferedPolys.push(poly);
        }
      }
    } catch {
      // skip malformed road
    }
  }

  if (bufferedPolys.length === 0) return null;

  // Progressive union
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let result: any = [bufferedPolys[0]];
  for (let i = 1; i < bufferedPolys.length; i++) {
    try {
      result = polygonClipping.union(result, [bufferedPolys[i]]);
    } catch {
      // continue
    }
  }

  // Clip to bbox
  try {
    const bboxCoords = [clipBounds.geometry.coordinates];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clipped = polygonClipping.intersection(result, bboxCoords as any);
    if (clipped.length === 0) return null;
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: clipped as Position[][][] },
    };
  } catch {
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: result as Position[][][] },
    };
  }
}
