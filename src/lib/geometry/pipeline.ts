import type { Feature, Polygon, MultiPolygon, LineString } from "geojson";
import type { BBox, ProcessedLayers } from "@/lib/store/types";
import { buildBBoxPolygon } from "./clip";
import { unionWaterPolygons, subtractWaterFromLand } from "./water";
import { simplifyRoads, bufferMajorRoads } from "./roads";

export interface PipelineInput {
  bbox: BBox;
  waterFeatures: Feature<Polygon | MultiPolygon>[];
  minorRoadFeatures: Feature<LineString>[];
  majorRoadFeatures: Feature<LineString>[];
  simplificationTolerance: number;
  roadBufferMeters: number;
}

export async function runGeometryPipeline(
  input: PipelineInput
): Promise<ProcessedLayers> {
  const bboxPolygon = buildBBoxPolygon(input.bbox);

  // 1. CUT LAYER: land = bbox minus water
  const water = unionWaterPolygons(
    input.waterFeatures as Feature<Polygon | MultiPolygon>[],
    bboxPolygon
  );
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

  // 3. TOP CUT LAYER: buffered major roads
  const topCutLayer = bufferMajorRoads(
    input.majorRoadFeatures,
    input.roadBufferMeters,
    bboxPolygon,
    input.simplificationTolerance
  );

  return { cutLayer, engraveLayer, topCutLayer };
}
