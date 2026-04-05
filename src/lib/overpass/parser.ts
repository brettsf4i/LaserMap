import type { Feature, Polygon, LineString, MultiPolygon, Position } from "geojson";
import { MINOR_ROAD_TYPES, MAJOR_ROAD_TYPES } from "./queries";

// ---------------------------------------------------------------------------
// OSM element types
// ---------------------------------------------------------------------------

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

interface OverpassRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members: Array<{ type: string; ref: number; role: string }>;
}

export interface OverpassResponse {
  elements: Array<OverpassNode | OverpassWay | OverpassRelation>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNodeMap(data: OverpassResponse): Map<number, Position> {
  const map = new Map<number, Position>();
  for (const el of data.elements) {
    if (el.type === "node") map.set(el.id, [el.lon, el.lat]);
  }
  return map;
}

/** Build a map from way-id → coordinate array (no closing) */
function buildWayMap(
  data: OverpassResponse,
  nodeMap: Map<number, Position>
): Map<number, Position[]> {
  const map = new Map<number, Position[]>();
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const coords = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);
    if (coords.length >= 2) map.set(el.id, coords);
  }
  return map;
}

function posEq(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
}

/**
 * Stitch an unordered set of OSM way segments into one or more closed rings.
 * Each ring is returned as a closed Position[] (first === last).
 */
function stitchWaysIntoRings(
  wayIds: number[],
  wayMap: Map<number, Position[]>
): Position[][] {
  // Collect raw segments, try both orientations
  const segments: Position[][] = [];
  for (const id of wayIds) {
    const way = wayMap.get(id);
    if (way && way.length >= 2) segments.push(way);
  }

  const used = new Array(segments.length).fill(false);
  const rings: Position[][] = [];

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = true;

    let ring = [...segments[s]];

    // Extend ring until we can't connect any more unused segment
    let extended = true;
    while (extended) {
      extended = false;
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        const seg = segments[i];
        const rEnd = ring[ring.length - 1];
        const rStart = ring[0];

        if (posEq(rEnd, seg[0])) {
          ring = ring.concat(seg.slice(1));
          used[i] = true; extended = true; break;
        } else if (posEq(rEnd, seg[seg.length - 1])) {
          ring = ring.concat([...seg].reverse().slice(1));
          used[i] = true; extended = true; break;
        } else if (posEq(rStart, seg[seg.length - 1])) {
          ring = seg.concat(ring.slice(1));
          used[i] = true; extended = true; break;
        } else if (posEq(rStart, seg[0])) {
          ring = [...seg].reverse().concat(ring.slice(1));
          used[i] = true; extended = true; break;
        }
      }
    }

    if (ring.length < 3) continue;

    // Close the ring
    if (!posEq(ring[0], ring[ring.length - 1])) ring.push([ring[0][0], ring[0][1]]);
    if (ring.length >= 4) rings.push(ring);
  }

  return rings;
}

/**
 * Build Polygon/MultiPolygon features from an OSM multipolygon relation.
 * Outer roles form the exterior rings; inner roles form holes.
 */
function parseRelationAsPolygons(
  rel: OverpassRelation,
  wayMap: Map<number, Position[]>
): Feature<Polygon | MultiPolygon>[] {
  const outerIds = rel.members
    .filter((m) => m.type === "way" && m.role === "outer")
    .map((m) => m.ref);
  const innerIds = rel.members
    .filter((m) => m.type === "way" && m.role === "inner")
    .map((m) => m.ref);

  if (outerIds.length === 0) return [];

  const outerRings = stitchWaysIntoRings(outerIds, wayMap);
  const innerRings = stitchWaysIntoRings(innerIds, wayMap);

  if (outerRings.length === 0) return [];

  const tags = rel.tags ?? {};

  if (outerRings.length === 1) {
    return [{
      type: "Feature",
      properties: tags,
      geometry: { type: "Polygon", coordinates: [outerRings[0], ...innerRings] },
    }];
  }

  // Multiple outer rings → MultiPolygon (each outer gets all inners; close enough for our purpose)
  return [{
    type: "Feature",
    properties: tags,
    geometry: {
      type: "MultiPolygon",
      coordinates: outerRings.map((outer) => [outer, ...innerRings]),
    },
  }];
}

// ---------------------------------------------------------------------------
// Water classification
// ---------------------------------------------------------------------------

const WATERWAY_LINE_TYPES = new Set(["river", "stream", "canal", "drain", "ditch"]);

function classifyWater(tags: Record<string, string>): "polygon" | "line" | null {
  if (
    tags["natural"] === "water" ||
    tags["natural"] === "wetland" ||
    tags["landuse"] === "reservoir" ||
    tags["water"] ||
    tags["waterway"] === "riverbank"
  ) return "polygon";

  if (tags["waterway"] && WATERWAY_LINE_TYPES.has(tags["waterway"])) return "line";

  return null;
}

function isWaterRelation(tags: Record<string, string>): boolean {
  return classifyWater(tags) !== null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CombinedLayers {
  waterFeatures: Feature<Polygon | MultiPolygon | LineString>[];
  minorRoadFeatures: Feature<LineString>[];
  majorRoadFeatures: Feature<LineString>[];
}

export function parseCombinedResponse(data: OverpassResponse): CombinedLayers {
  const nodeMap = buildNodeMap(data);
  const wayMap = buildWayMap(data, nodeMap);

  const waterFeatures: Feature<Polygon | MultiPolygon | LineString>[] = [];
  const minorRoadFeatures: Feature<LineString>[] = [];
  const majorRoadFeatures: Feature<LineString>[] = [];

  // Track way IDs that are members of water relations — don't double-count
  const wayIdsInWaterRelations = new Set<number>();

  // ── Pass 1: relations ────────────────────────────────────────────────────
  for (const el of data.elements) {
    if (el.type !== "relation") continue;
    const tags = el.tags ?? {};
    if (!isWaterRelation(tags)) continue;

    const polys = parseRelationAsPolygons(el as OverpassRelation, wayMap);
    waterFeatures.push(...polys);

    // Mark member ways so we skip them in pass 2
    for (const m of (el as OverpassRelation).members) {
      if (m.type === "way") wayIdsInWaterRelations.add(m.ref);
    }
  }

  // ── Pass 2: standalone ways ──────────────────────────────────────────────
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const tags = el.tags ?? {};

    const coords = el.nodes
      .map((id: number) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);

    const waterClass = classifyWater(tags);

    if (waterClass === "polygon") {
      // Skip if already covered by a relation
      if (wayIdsInWaterRelations.has(el.id)) continue;

      // A closed way forms a polygon
      if (coords.length >= 4) {
        const isClosed = posEq(coords[0], coords[coords.length - 1]);
        const ring = isClosed ? coords : [...coords, [coords[0][0], coords[0][1]] as Position];
        waterFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "Polygon", coordinates: [ring] },
        });
      }
    } else if (waterClass === "line") {
      // River/canal centerlines — water.ts will buffer these
      if (coords.length >= 2) {
        waterFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    } else if (tags["highway"] && MINOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length >= 2) {
        minorRoadFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    } else if (tags["highway"] && MAJOR_ROAD_TYPES.has(tags["highway"])) {
      if (coords.length >= 2) {
        majorRoadFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }
  }

  return { waterFeatures, minorRoadFeatures, majorRoadFeatures };
}

// ---------------------------------------------------------------------------
// Legacy helpers (kept for any remaining callers)
// ---------------------------------------------------------------------------

export function parseOverpassToPolygons(data: OverpassResponse): Feature<Polygon>[] {
  const nodeMap = buildNodeMap(data);
  const features: Feature<Polygon>[] = [];
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const coords = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);
    if (coords.length < 4) continue;
    const first = coords[0], last = coords[coords.length - 1];
    if (!posEq(first, last)) coords.push([first[0], first[1]]);
    features.push({ type: "Feature", properties: el.tags ?? {}, geometry: { type: "Polygon", coordinates: [coords] } });
  }
  return features;
}

export function parseOverpassToLines(data: OverpassResponse): Feature<LineString>[] {
  const nodeMap = buildNodeMap(data);
  const features: Feature<LineString>[] = [];
  for (const el of data.elements) {
    if (el.type !== "way") continue;
    const coords = el.nodes
      .map((id) => nodeMap.get(id))
      .filter((c): c is Position => c !== undefined);
    if (coords.length < 2) continue;
    features.push({ type: "Feature", properties: el.tags ?? {}, geometry: { type: "LineString", coordinates: coords } });
  }
  return features;
}
