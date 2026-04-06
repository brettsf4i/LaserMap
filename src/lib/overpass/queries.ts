import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

// Only the two lowest-detail classes stay on the engrave layer.
// Everything else is buffered and cut on the Major Roads layer.
export const MINOR_ROAD_TYPES = new Set([
  "residential", "unclassified",
]);

export const MAJOR_ROAD_TYPES = new Set([
  // Classified roads
  "motorway", "motorway_link",
  "trunk", "trunk_link",
  "primary", "primary_link",
  "secondary", "secondary_link",
  "tertiary", "tertiary_link",
  // Local access & paths — included so the cut layer shows full detail
  "service", "living_street",
  "pedestrian", "footway", "cycleway", "path", "track",
]);

export const WATER_TAGS: Record<string, string | null> = {
  "natural": "water",
  "landuse": "reservoir",
};

// Single combined query fetching all layers at once — avoids rate limiting.
// Relations are included so that large rivers/lakes (stored as OSM multipolygons)
// are captured as full-surface polygons rather than just centerlines.
export function buildCombinedQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  return `
[out:json][timeout:60];
(
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["waterway"~"^(river|canal)$"](${bb});
  relation["waterway"="riverbank"](${bb});
  way["landuse"="reservoir"](${bb});
  relation["landuse"="reservoir"](${bb});
  way["natural"="wetland"](${bb});
  way["water"~"."](${bb});
  relation["water"~"."](${bb});
  way["highway"~"^(residential|unclassified)$"](${bb});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|service|living_street|pedestrian|footway|cycleway|path|track)$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}
