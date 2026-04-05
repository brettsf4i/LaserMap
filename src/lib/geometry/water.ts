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

// Minimum closed water polygon to be included (filters swimming pools, tiny ponds)
const MIN_WATER_AREA_M2 = 2500; // ~50m × 50m

// After difference: minimum outer land-island and minimum water hole to keep
const MIN_LAND_ISLAND_M2 = 500;   // discard tiny land specks
const MIN_WATER_HOLE_M2  = 1000;  // discard tiny water holes (noise)

export function unionWaterPolygons(
  features: Feature<Polygon | MultiPolygon | LineString>[],
  bboxPolygon: Feature<Polygon>
): Feature<MultiPolygon> | null {
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
      // Closed water polygon — filter out anything too small to matter
      try {
        if (turf.area(f) < MIN_WATER_AREA_M2) continue;
      } catch {
        // if area check fails, include it anyway
      }
      polygonFeatures.push(f as Feature<Polygon | MultiPolygon>);
    }
  }

  if (polygonFeatures.length === 0) return null;

  // Progressive union of all water polygons
  let result: ClipMulti = featureToClipCoords(polygonFeatures[0]);
  for (let i = 1; i < polygonFeatures.length; i++) {
    try {
      result = polygonClipping.union(result, featureToClipCoords(polygonFeatures[i]));
    } catch {
      // skip malformed geometry
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

export function subtractWaterFromLand(
  bboxPolygon: Feature<Polygon>,
  water: Feature<MultiPolygon> | null
): Feature<MultiPolygon> {
  const bboxCoords: ClipMulti = [bboxPolygon.geometry.coordinates];

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
