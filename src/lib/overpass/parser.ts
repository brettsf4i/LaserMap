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
  waterFeatures: Feature<Polygon>[];
  minorRoadFeatures: Feature<LineString>[];
  majorRoadFeatures: Feature<LineString>[];
}

function isWaterWay(tags: Record<string, string> = {}): boolean {
  return (
    tags["natural"] === "water" ||
    tags["natural"] === "wetland" ||
    tags["landuse"] === "reservoir" ||
    !!tags["water"] ||
    ["river", "stream", "canal", "drain", "ditch"].includes(tags["waterway"] ?? "")
  );
}

export function parseCombinedResponse(data: OverpassResponse): CombinedLayers {
  const nodeMap = buildNodeMap(data);

  const waterFeatures: Feature<Polygon>[] = [];
  const minorRoadFeatures: Feature<LineString>[] = [];
  const majorRoadFeatures: Feature<LineString>[] = [];

  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const tags = el.tags ?? {};

    const coords: Position[] = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);

    if (isWaterWay(tags)) {
      if (coords.length < 4) continue;
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) coords.push([first[0], first[1]]);
      waterFeatures.push({
        type: "Feature", properties: tags,
        geometry: { type: "Polygon", coordinates: [coords] },
      });
    } else if (tags["highway"] && MINOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length < 2) continue;
      minorRoadFeatures.push({
        type: "Feature", properties: tags,
        geometry: { type: "LineString", coordinates: coords },
      });
    } else if (tags["highway"] && MAJOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length < 2) continue;
      majorRoadFeatures.push({
        type: "Feature", properties: tags,
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
