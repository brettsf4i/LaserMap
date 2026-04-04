import type { Feature, Polygon } from "geojson";
import type { BBox } from "@/lib/store/types";

export function buildBBoxPolygon(bbox: BBox): Feature<Polygon> {
  const [west, south, east, north] = bbox;
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}
