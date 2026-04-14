import type { Feature, Polygon, LineString, MultiPolygon, Position } from "geojson";
// Road classification now happens in the pipeline (area-adaptive).
// The parser simply collects all highway-tagged ways.

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
 *
 * Uses an endpoint lookup Map for O(1) neighbour search instead of the
 * previous O(m) linear scan, reducing overall complexity from O(m²) to O(m).
 * This matters for complex water relations with 100+ member ways.
 */
function stitchWaysIntoRings(
  wayIds: number[],
  wayMap: Map<number, Position[]>
): Position[][] {
  const segments: Position[][] = [];
  for (const id of wayIds) {
    const way = wayMap.get(id);
    if (way && way.length >= 2) segments.push(way);
  }
  if (segments.length === 0) return [];

  // Build endpoint → [segment indices] map so we can find connecting segments
  // in O(1) rather than scanning all segments on every step.
  function epKey(p: Position): string {
    // Round to 7 decimal places (~1 cm) to handle floating-point fuzz
    return `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
  }

  const endpointMap = new Map<string, number[]>();
  function addToMap(key: string, idx: number) {
    const list = endpointMap.get(key);
    if (list) list.push(idx);
    else endpointMap.set(key, [idx]);
  }
  function removeFromMap(key: string, idx: number) {
    const list = endpointMap.get(key);
    if (!list) return;
    const pos = list.indexOf(idx);
    if (pos !== -1) list.splice(pos, 1);
  }

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    addToMap(epKey(seg[0]), i);
    addToMap(epKey(seg[seg.length - 1]), i);
  }

  const used = new Array(segments.length).fill(false);
  const rings: Position[][] = [];

  function markUsed(idx: number) {
    used[idx] = true;
    const seg = segments[idx];
    removeFromMap(epKey(seg[0]), idx);
    removeFromMap(epKey(seg[seg.length - 1]), idx);
  }

  /** Find an unused segment whose start or end matches `pt`. Returns index and
   *  whether the segment needs to be reversed to connect forward. */
  function findNext(pt: Position): { idx: number; reverse: boolean } | null {
    const key = epKey(pt);
    const candidates = endpointMap.get(key) ?? [];
    for (const idx of candidates) {
      if (used[idx]) continue;
      const seg = segments[idx];
      if (posEq(pt, seg[0])) return { idx, reverse: false };
      if (posEq(pt, seg[seg.length - 1])) return { idx, reverse: true };
    }
    return null;
  }

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    markUsed(s);

    let ring = [...segments[s]];

    // Extend from the tail of the ring
    for (;;) {
      const match = findNext(ring[ring.length - 1]);
      if (!match) break;
      markUsed(match.idx);
      const seg = segments[match.idx];
      ring = ring.concat(match.reverse ? [...seg].reverse().slice(1) : seg.slice(1));
    }

    // Extend from the head of the ring (handles reversed starts)
    for (;;) {
      const match = findNext(ring[0]);
      if (!match) break;
      markUsed(match.idx);
      const seg = segments[match.idx];
      ring = (match.reverse ? seg : [...seg].reverse()).concat(ring.slice(1));
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
  /** All road features returned by the query — pipeline classifies into cut/engrave */
  allRoadFeatures: Feature<LineString>[];
  /** OSM coastline ways as open LineStrings — used to synthesize ocean polygons */
  coastlineFeatures: Feature<LineString>[];
}

export function parseCombinedResponse(data: OverpassResponse): CombinedLayers {
  const nodeMap = buildNodeMap(data);
  const wayMap = buildWayMap(data, nodeMap);

  const waterFeatures: Feature<Polygon | MultiPolygon | LineString>[] = [];
  const allRoadFeatures: Feature<LineString>[] = [];
  const coastlineFeatures: Feature<LineString>[] = [];

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
    } else if (tags["natural"] === "coastline") {
      // Coastline ways — open line segments used to build ocean polygons
      if (coords.length >= 2) {
        coastlineFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    } else if (tags["highway"]) {
      if (coords.length >= 2) {
        allRoadFeatures.push({
          type: "Feature",
          properties: tags,
          geometry: { type: "LineString", coordinates: coords },
        });
      }
    }
  }

  return { waterFeatures, allRoadFeatures, coastlineFeatures };
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
