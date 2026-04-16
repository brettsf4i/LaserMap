import type { BBox } from "@/lib/store/types";

// Overpass uses (south,west,north,east) — opposite of GeoJSON [west,south,east,north]
function toOverpassBBox(bbox: BBox): string {
  return `${bbox[1]},${bbox[0]},${bbox[3]},${bbox[2]}`;
}

// ── Road class definitions ────────────────────────────────────────────────────

export interface RoadClassDef {
  key: string;
  label: string;
  osmColor: string;
  types: string[];
}

export const ROAD_CLASS_DEFS: RoadClassDef[] = [
  { key: "motorway",  label: "Motorway",  osmColor: "#6b80c8", types: ["motorway",  "motorway_link"]  },
  { key: "trunk",     label: "Trunk",     osmColor: "#7db87d", types: ["trunk",     "trunk_link"]     },
  { key: "primary",   label: "Primary",   osmColor: "#d45b5b", types: ["primary",   "primary_link"]   },
  { key: "secondary", label: "Secondary", osmColor: "#d9892b", types: ["secondary", "secondary_link"] },
  { key: "tertiary",  label: "Tertiary",  osmColor: "#c8b74a", types: ["tertiary",  "tertiary_link"]  },
];

export const MAJOR_ROAD_TYPES = new Set<string>(
  ROAD_CLASS_DEFS.flatMap((d) => d.types)
);

export const WATER_TAGS: Record<string, string | null> = {
  "natural": "water",
  "landuse": "reservoir",
};

// ── Adaptive road classification ──────────────────────────────────────────────
//
// As the map area grows, the "significant" road classes shift upward so that:
//   • The cut layer always contains only the most prominent through-routes
//   • The engrave layer always provides texture from the next tier down
//   • Short stubs & connectors are dropped server-side via Overpass length()
//
// ┌──────────────┬──────────────────────────────┬───────────────────────────┐
// │ Area          │ Cut (buffered band)          │ Engrave (hairline)        │
// ├──────────────┼──────────────────────────────┼───────────────────────────┤
// │ < 50 km²     │ motorway–secondary           │ tertiary+residential+svc  │
// │ 50–150 km²   │ motorway–secondary           │ tertiary+residential      │
// │ 150–350 km²  │ motorway–primary             │ secondary+tertiary        │
// │ > 350 km²    │ motorway+trunk               │ primary+secondary         │
// └──────────────┴──────────────────────────────┴───────────────────────────┘

export interface RoadClassification {
  /** OSM highway= values buffered into the cut layer */
  cutTypes: Set<string>;
  /** OSM highway= values rendered as engrave hairlines */
  engraveTypes: Set<string>;
  /** Drop cut roads shorter than this (metres) — 0 = no filter */
  cutMinLengthM: number;
  /** Drop engrave roads shorter than this (metres) — 0 = no filter */
  engraveMinLengthM: number;
  /** Simplification tolerance for engrave roads (degrees) */
  engraveSimplifyTolerance: number;
}

export function getRoadClassification(areaKm2: number): RoadClassification {
  if (areaKm2 < 50) {
    return {
      cutTypes: new Set([
        "motorway","motorway_link","trunk","trunk_link",
        "primary","primary_link","secondary","secondary_link",
      ]),
      engraveTypes: new Set([
        "tertiary","tertiary_link","residential","unclassified",
        "service","living_street","pedestrian","cycleway","path","track",
      ]),
      cutMinLengthM: 0,
      engraveMinLengthM: 0,
      engraveSimplifyTolerance: 0.00005,
    };
  }
  if (areaKm2 < 150) {
    return {
      cutTypes: new Set([
        "motorway","motorway_link","trunk","trunk_link",
        "primary","primary_link","secondary","secondary_link",
      ]),
      engraveTypes: new Set([
        "tertiary","tertiary_link","residential","unclassified",
      ]),
      cutMinLengthM: 100,
      engraveMinLengthM: 100,
      engraveSimplifyTolerance: 0.0001,
    };
  }
  if (areaKm2 < 350) {
    return {
      cutTypes: new Set([
        "motorway","motorway_link","trunk","trunk_link","primary","primary_link",
      ]),
      engraveTypes: new Set([
        "secondary","secondary_link","tertiary","tertiary_link",
      ]),
      cutMinLengthM: 300,
      engraveMinLengthM: 200,
      engraveSimplifyTolerance: 0.0002,
    };
  }
  return {
    cutTypes: new Set([
      "motorway","motorway_link","trunk","trunk_link",
    ]),
    engraveTypes: new Set([
      "primary","primary_link","secondary","secondary_link",
    ]),
    cutMinLengthM: 500,
    engraveMinLengthM: 300,
    engraveSimplifyTolerance: 0.0003,
  };
}

// ── Query builder ─────────────────────────────────────────────────────────────
// Fetches both cut and engrave road sets in a single Overpass query.
// The ["name"] filter applies to cut roads only (keeps quality high).
// Engrave roads have no name filter — local texture roads are often unnamed.
// Server-side length() filters reduce payload for large areas.

export function buildCombinedQuery(bbox: BBox): string {
  const bb = toOverpassBBox(bbox);

  const [west, south, east, north] = bbox;
  const cosLat = Math.cos(((south + north) / 2 * Math.PI) / 180);
  const areaKm2 = Math.abs(east - west) * 111.32 * cosLat * Math.abs(north - south) * 110.574;

  const { cutTypes, engraveTypes, cutMinLengthM, engraveMinLengthM } =
    getRoadClassification(areaKm2);

  const cutRegex     = [...cutTypes].join("|");
  const engraveRegex = [...engraveTypes].join("|");
  const cutLenFilter     = cutMinLengthM     > 0 ? `(if: length() > ${cutMinLengthM})`     : "";
  const engraveLenFilter = engraveMinLengthM > 0 ? `(if: length() > ${engraveMinLengthM})` : "";
  const timeoutSec   = areaKm2 < 50 ? 90 : 120;

  return `
[out:json][timeout:${timeoutSec}][maxsize:536870912];
(
  way["natural"="water"](${bb});
  relation["natural"="water"](${bb});
  way["natural"="coastline"](${bb});
  way["waterway"~"^(river|canal)$"](${bb});
  relation["waterway"="riverbank"](${bb});
  way["landuse"="reservoir"](${bb});
  relation["landuse"="reservoir"](${bb});
  way["natural"="wetland"](${bb});
  way["water"~"."](${bb});
  relation["water"~"."](${bb});
  way["highway"~"^(${cutRegex})$"]["name"](${bb})${cutLenFilter};
  way["highway"~"^(${engraveRegex})$"](${bb})${engraveLenFilter};
);
out body;
>;
out skel qt;
`.trim();
}

/** Human-readable note shown in the UI when road classes are restricted by area. */
export function roadFetchNote(areaKm2: number): string | null {
  if (areaKm2 < 50)  return null;
  if (areaKm2 < 150) return "Roads shorter than 100 m are excluded at this scale.";
  if (areaKm2 < 350) return "Cut layer: Motorway, Trunk & Primary. Engrave layer: Secondary & Tertiary.";
  return "Cut layer: Motorway & Trunk only. Engrave layer: Primary & Secondary.";
}
