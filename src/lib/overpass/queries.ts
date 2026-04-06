import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

// Major Roads cut layer: primary (red) and secondary (orange) roads only.
// Keeping this set small avoids the buffer+union timeout on dense urban areas.
export const MAJOR_ROAD_TYPES = new Set([
  "primary", "primary_link",
  "secondary", "secondary_link",
]);

// Engrave layer: everything else worth showing as a hairline.
export const MINOR_ROAD_TYPES = new Set([
  "motorway", "motorway_link",
  "trunk", "trunk_link",
  "tertiary", "tertiary_link",
  "residential", "unclassified",
  "service", "living_street",
  "pedestrian", "footway", "cycleway", "path", "track",
]);

export const WATER_TAGS: Record<string, string | null> = {
  "natural": "water",
  "landuse": "reservoir",
};

// Single combined query — avoids rate limiting.
// Relations fetch large rivers/lakes as full-surface polygons.
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
  way["highway"~"^(primary|primary_link|secondary|secondary_link)$"](${bb});
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|tertiary|tertiary_link|residential|unclassified|service|living_street|pedestrian|footway|cycleway|path|track)$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}
