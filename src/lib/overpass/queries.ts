import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

export const MINOR_ROAD_TYPES = new Set([
  "residential", "unclassified", "service", "living_street",
  "pedestrian", "footway", "cycleway", "path", "track",
]);

export const MAJOR_ROAD_TYPES = new Set([
  "motorway", "motorway_link", "trunk", "trunk_link",
  "primary", "primary_link", "secondary", "secondary_link",
  "tertiary", "tertiary_link",
]);

export const WATER_TAGS: Record<string, string | null> = {
  "natural": "water",
  "landuse": "reservoir",
};

// Single combined query fetching all layers at once — avoids rate limiting
export function buildCombinedQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  return `
[out:json][timeout:60];
(
  way["natural"="water"](${bb});
  way["waterway"~"^(river|canal)$"](${bb});
  way["landuse"="reservoir"](${bb});
  way["natural"="wetland"](${bb});
  way["water"~"."](${bb});
  way["highway"~"^(residential|unclassified|service|living_street|pedestrian|footway|cycleway|path|track)$"](${bb});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}
