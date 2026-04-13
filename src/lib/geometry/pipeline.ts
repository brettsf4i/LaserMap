import type { Feature, Polygon, MultiPolygon, LineString, MultiLineString } from "geojson";
import * as turf from "@turf/turf";
import type { BBox, ProcessedLayers } from "@/lib/store/types";
import { ROAD_CLASS_DEFS, getRoadClassification } from "@/lib/overpass/queries";
import { buildBBoxPolygon } from "./clip";
import { unionWaterPolygons, subtractWaterFromLand } from "./water";
import { simplifyRoads, bufferMajorRoads } from "./roads";

export interface PipelineInput {
  bbox: BBox;
  waterFeatures: Feature<Polygon | MultiPolygon | LineString>[];
  /** All road features returned by the Overpass query — classified here. */
  allRoadFeatures: Feature<LineString>[];
  roadBufferMeters: number;
  /** Keys from ROAD_CLASS_DEFS the user wants in the cut layer. */
  majorRoadClasses: string[];
}

function yieldToUI(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function bboxAreaKm2(bbox: BBox): number {
  const [west, south, east, north] = bbox;
  const cosLat = Math.cos(((south + north) / 2 * Math.PI) / 180);
  return Math.abs(east - west) * 111.32 * cosLat * Math.abs(north - south) * 110.574;
}

export async function runGeometryPipeline(
  input: PipelineInput
): Promise<ProcessedLayers> {
  const bboxPolygon = buildBBoxPolygon(input.bbox);
  const areaKm2 = bboxAreaKm2(input.bbox);

  // ── Road classification (area-adaptive) ──────────────────────────────────
  const {
    cutTypes,
    engraveTypes,
    cutMinLengthM,
    engraveMinLengthM,
    engraveSimplifyTolerance,
  } = getRoadClassification(areaKm2);

  // User-selected cut classes further filter the area tier's cut set
  const userEnabledTypes = new Set<string>(
    ROAD_CLASS_DEFS
      .filter((d) => input.majorRoadClasses.includes(d.key))
      .flatMap((d) => d.types)
  );

  const cutMinLenKm     = cutMinLengthM     / 1000;
  const engraveMinLenKm = engraveMinLengthM / 1000;

  const cutRoads: Feature<LineString>[]     = [];
  const engraveRoads: Feature<LineString>[] = [];

  for (const f of input.allRoadFeatures) {
    const hw = f.properties?.["highway"] ?? "";
    if (cutTypes.has(hw) && userEnabledTypes.has(hw)) {
      if (cutMinLenKm === 0) { cutRoads.push(f); continue; }
      try {
        if (turf.length(f, { units: "kilometers" }) >= cutMinLenKm) cutRoads.push(f);
      } catch { cutRoads.push(f); }
    } else if (engraveTypes.has(hw)) {
      if (engraveMinLenKm === 0) { engraveRoads.push(f); continue; }
      try {
        if (turf.length(f, { units: "kilometers" }) >= engraveMinLenKm) engraveRoads.push(f);
      } catch { engraveRoads.push(f); }
    }
  }

  await yieldToUI();

  // ── 1. CUT LAYER: land minus water ───────────────────────────────────────
  const water = await unionWaterPolygons(input.waterFeatures, bboxPolygon, areaKm2);
  await yieldToUI();
  const cutLayer = await subtractWaterFromLand(bboxPolygon, water);
  await yieldToUI();

  // ── 2. ENGRAVE LAYER: simplified local roads ──────────────────────────────
  const simplifiedEngrave = simplifyRoads(engraveRoads, engraveSimplifyTolerance);
  const engraveLayer: Feature<MultiLineString> | null =
    simplifiedEngrave.length > 0
      ? {
          type: "Feature",
          properties: {},
          geometry: {
            type: "MultiLineString",
            coordinates: simplifiedEngrave.map((f) => f.geometry.coordinates),
          },
        }
      : null;
  await yieldToUI();

  // ── 3. TOP CUT LAYER: buffered major roads ────────────────────────────────
  const topCutLayer = await bufferMajorRoads(
    cutRoads,
    input.roadBufferMeters,
    bboxPolygon,
    input.bbox
  );

  return { cutLayer, engraveLayer, topCutLayer };
}
