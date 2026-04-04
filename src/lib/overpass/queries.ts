import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

export function buildWaterQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  return `
[out:json][timeout:30];
(
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["waterway"~"^(river|stream|canal|drain|ditch)$"](${bb});
  way["landuse"="reservoir"](${bb});
  way["natural"="wetland"](${bb});
  way["water"~"."](${bb});
);
out body;
>;
out skel qt;
`.trim();
}

export function buildMinorRoadsQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  return `
[out:json][timeout:30];
(
  way["highway"~"^(residential|unclassified|service|living_street|pedestrian|footway|cycleway|path|track)$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}

export function buildMajorRoadsQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  return `
[out:json][timeout:30];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link)$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}
