import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

// ── Road class definitions ────────────────────────────────────────────────────
// Single source of truth for the 5 major road classes.
// Used by the Overpass query builder, the geometry pipeline, and the UI.

export interface RoadClassDef {
  key: string;
  label: string;
  /** Standard OSM rendering colour for this road class */
  osmColor: string;
  /** All OSM highway= values that belong to this class */
  types: string[];
}

export const ROAD_CLASS_DEFS: RoadClassDef[] = [
  { key: "motorway",  label: "Motorway",  osmColor: "#6b80c8", types: ["motorway",  "motorway_link"]  },
  { key: "trunk",     label: "Trunk",     osmColor: "#7db87d", types: ["trunk",     "trunk_link"]     },
  { key: "primary",   label: "Primary",   osmColor: "#d45b5b", types: ["primary",   "primary_link"]   },
  { key: "secondary", label: "Secondary", osmColor: "#d9892b", types: ["secondary", "secondary_link"] },
  { key: "tertiary",  label: "Tertiary",  osmColor: "#c8b74a", types: ["tertiary",  "tertiary_link"]  },
];

// All OSM types that can appear on the Major Roads cut layer
export const MAJOR_ROAD_TYPES = new Set<string>(
  ROAD_CLASS_DEFS.flatMap((d) => d.types)
);

// Roads rendered as engraved hairlines (not buffered/cut)
export const MINOR_ROAD_TYPES = new Set([
  "residential", "unclassified",
  "service", "living_street",
  "pedestrian", "footway", "cycleway", "path", "track",
]);

export const WATER_TAGS: Record<string, string | null> = {
  "natural": "water",
  "landuse": "reservoir",
};

// ── Query builder ─────────────────────────────────────────────────────────────
// Always fetches ALL five named major-road classes so that changing which
// classes are rendered only re-runs geometry (no extra network round-trip).
// The ["name"] filter eliminates unnamed link ramps, parking-lot connectors,
// and short stubs that cause isolated blobs in the cut layer.

export function buildCombinedQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);
  const majorRegex = ROAD_CLASS_DEFS.flatMap((d) => d.types).join("|");
  const minorRegex = [...MINOR_ROAD_TYPES].join("|");

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
  way["highway"~"^(${majorRegex})$"]["name"](${bb});
  way["highway"~"^(${minorRegex})$"](${bb});
);
out body;
>;
out skel qt;
`.trim();
}
