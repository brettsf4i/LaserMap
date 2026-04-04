import polygonClipping from "polygon-clipping";
import * as turf from "@turf/turf";
import type { Feature, Polygon, MultiPolygon, LineString, Position } from "geojson";

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

export function unionWaterPolygons(
  features: Feature<Polygon | MultiPolygon | LineString>[],
  bboxPolygon: Feature<Polygon>
): Feature<MultiPolygon> | null {
  // Buffer open LineString waterways (rivers, streams) into polygons
  const polygonFeatures: Feature<Polygon | MultiPolygon>[] = [];

  for (const f of features) {
    if (f.geometry.type === "LineString") {
      try {
        const buffered = turf.buffer(f as Feature<LineString>, 0.015, {
          units: "kilometers",
          steps: 4,
        });
        if (buffered) polygonFeatures.push(buffered as Feature<Polygon>);
      } catch {
        // skip malformed
      }
    } else {
      polygonFeatures.push(f as Feature<Polygon | MultiPolygon>);
    }
  }

  if (polygonFeatures.length === 0) return null;

  // Progressive union
  let result: ClipMulti = featureToClipCoords(polygonFeatures[0]);
  for (let i = 1; i < polygonFeatures.length; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result = polygonClipping.union(result as any, featureToClipCoords(polygonFeatures[i]) as any);
    } catch {
      // skip malformed geometry
    }
  }

  // Clip to bbox boundary
  try {
    const bboxCoords = featureToClipCoords(bboxPolygon);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clipped = polygonClipping.intersection(result as any, bboxCoords as any);
    if (clipped.length === 0) return null;
    return clipResultToFeature(clipped);
  } catch {
    return clipResultToFeature(result);
  }
}

export function subtractWaterFromLand(
  bboxPolygon: Feature<Polygon>,
  water: Feature<MultiPolygon> | null
): Feature<MultiPolygon> {
  const bboxCoords: ClipMulti = [bboxPolygon.geometry.coordinates as Position[][]];

  if (!water) {
    return clipResultToFeature(bboxCoords);
  }

  try {
    const waterCoords = featureToClipCoords(water);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = polygonClipping.difference(bboxCoords as any, waterCoords as any);
    return clipResultToFeature(result);
  } catch {
    return clipResultToFeature(bboxCoords);
  }
}
