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

export async function subtractWaterFromLand(
  bboxPolygon: Feature<Polygon>,
  water: Feature<MultiPolygon> | null
): Promise<Feature<MultiPolygon>> {
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
