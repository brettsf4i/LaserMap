import type { Feature, Polygon, MultiPolygon, LineString } from "geojson";
import type { BBox, ProcessedLayers } from "@/lib/store/types";
import { ROAD_CLASS_DEFS } from "@/lib/overpass/queries";
import { buildBBoxPolygon } from "./clip";
import { unionWaterPolygons, subtractWaterFromLand } from "./water";
import { simplifyRoads, bufferMajorRoads } from "./roads";

export interface PipelineInput {
  bbox: BBox;
  waterFeatures: Feature<Polygon | MultiPolygon | LineString>[];
  minorRoadFeatures: Feature<LineString>[];
  majorRoadFeatures: Feature<LineString>[];
  simplificationTolerance: number;
  roadBufferMeters: number;
  /** Keys from ROAD_CLASS_DEFS that should be included in the cut layer */
  majorRoadClasses: string[];
}

export async function runGeometryPipeline(
  input: PipelineInput
): Promise<ProcessedLayers> {
  const bboxPolygon = buildBBoxPolygon(input.bbox);

  // 1. CUT LAYER: land = bbox minus water
  const water = unionWaterPolygons(input.waterFeatures, bboxPolygon);
  const cutLayer = subtractWaterFromLand(bboxPolygon, water);

  // 2. ENGRAVE LAYER: simplified minor roads
  const simplifiedMinorRoads = simplifyRoads(
    input.minorRoadFeatures,
    input.simplificationTolerance
  );

  const engraveLayer =
    simplifiedMinorRoads.length > 0
      ? {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "MultiLineString" as const,
            coordinates: simplifiedMinorRoads.map((f) => f.geometry.coordinates),
          },
        }
      : null;

  // 3. TOP CUT LAYER: buffered major roads filtered to the enabled classes.
  //    Filtering happens here (not at fetch time) so toggling road classes
  //    re-runs only geometry — no extra Overpass round-trip needed.
  const enabledTypes = new Set<string>(
    ROAD_CLASS_DEFS
      .filter((d) => input.majorRoadClasses.includes(d.key))
      .flatMap((d) => d.types)
  );

  const filteredMajorRoads = input.majorRoadFeatures.filter(
    (f) => enabledTypes.has(f.properties?.["highway"] ?? "")
  );

  const topCutLayer = bufferMajorRoads(
    filteredMajorRoads,
    input.roadBufferMeters,
    bboxPolygon,
    input.simplificationTolerance
  );

  return { cutLayer, engraveLayer, topCutLayer };
}
