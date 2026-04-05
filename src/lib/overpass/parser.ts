import type { Feature, Polygon, LineString, Position } from "geojson";
import { MINOR_ROAD_TYPES, MAJOR_ROAD_TYPES } from "./queries";

interface OverpassNode {
  type: "node";
  id: number;
  lat: number;
  lon: number;
}

interface OverpassWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  elements: Array<OverpassNode | OverpassWay>;
}

function buildNodeMap(data: OverpassResponse): Map<number, Position> {
  const map = new Map<number, Position>();
  for (const el of data.elements) {
    if (el.type === "node") {
      map.set(el.id, [el.lon, el.lat]);
    }
  }
  return map;
}

export function parseOverpassToPolygons(
  data: OverpassResponse
): Feature<Polygon>[] {
  const nodeMap = buildNodeMap(data);
  const features: Feature<Polygon>[] = [];

  for (const el of data.elements) {
    if (el.type !== "way") continue;

    const coords: Position[] = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);

    if (coords.length < 4) continue;

    // Close the ring
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }

    features.push({
      type: "Feature",
      properties: el.tags ?? {},
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }

  return features;
}

export interface CombinedLayers {
  // Closed water bodies (lakes, ponds, reservoirs) → Polygon
  // Open waterways (rivers, streams, canals) → LineString (buffered later)
  waterFeatures: Feature<Polygon | LineString>[];
  minorRoadFeatures: Feature<LineString>[];
  majorRoadFeatures: Feature<LineString>[];
}

const WATER_AREA_TAGS = new Set(["natural", "landuse", "water"]);
const WATERWAY_LINE_TYPES = new Set(["river", "stream", "canal", "drain", "ditch"]);

function classifyWaterWay(tags: Record<string, string>): "polygon" | "line" | null {
  // Closed area water features
  if (
    tags["natural"] === "water" ||
    tags["natural"] === "wetland" ||
    tags["landuse"] === "reservoir" ||
    tags["water"]
  ) {
    return "polygon";
  }
  // Linear waterways — must be buffered into area
  if (tags["waterway"] && WATERWAY_LINE_TYPES.has(tags["waterway"])) {
    return "line";
  }
  return null;
}

function isRingClosed(coords: Position[]): boolean {
  if (coords.length < 4) return false;
  const first = coords[0];
  const last = coords[coords.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

export function parseCombinedResponse(data: OverpassResponse): CombinedLayers {
  const nodeMap = buildNodeMap(data);

  const waterFeatures: Feature<Polygon | LineString>[] = [];
  const minorRoadFeatures: Feature<LineString>[] = [];
  const majorRoadFeatures: Feature<LineString>[] = [];

  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const tags = el.tags ?? {};

    const coords: Position[] = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);

    const waterClass = classifyWaterWay(tags);

    if (waterClass === "polygon") {
      // Only emit as polygon if the way is actually closed (lake, pond, reservoir)
      if (isRingClosed(coords)) {
        waterFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "Polygon", coordinates: [coords] },
        });
      } else if (coords.length >= 2) {
        // Unclosed "area" water tag — treat as line to buffer (rare edge case)
        waterFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    } else if (waterClass === "line") {
      // Rivers, streams etc. are lines — water.ts will buffer them
      if (coords.length >= 2) {
        waterFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    } else if (tags["highway"] && MINOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length < 2) continue;
      minorRoadFeatures.push({
        type: "Feature",
        properties: tags,
        geometry: { type: "LineString", coordinates: coords },
      });
    } else if (tags["highway"] && MAJOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length < 2) continue;
      majorRoadFeatures.push({
        type: "Feature",
        properties: tags,
        geometry: { type: "LineString", coordinates: coords },
      });
    }
  }

  return { waterFeatures, minorRoadFeatures, majorRoadFeatures };
}

export function parseOverpassToLines(
  data: OverpassResponse
): Feature<LineString>[] {
  const nodeMap = buildNodeMap(data);
  const features: Feature<LineString>[] = [];

  for (const el of data.elements) {
    if (el.type !== "way") continue;

    const coords: Position[] = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);

    if (coords.length < 2) continue;

    features.push({
      type: "Feature",
      properties: el.tags ?? {},
      geometry: { type: "LineString", coordinates: coords },
    });
  }

  return features;
}
