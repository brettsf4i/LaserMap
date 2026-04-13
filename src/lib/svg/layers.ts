import type { Feature, MultiPolygon, MultiLineString, Position } from "geojson";
import polygonClipping from "polygon-clipping";
import * as turf from "@turf/turf";
import type { Projection } from "./projection";
import type { BorderOptions } from "./border";
import { buildSVGDocument } from "./builder";

/**
 * Geometrically clip a MultiPolygon to the inner map area (bbox inset by
 * border thickness) so that laser software sees no path data inside the frame
 * band.  SVG clipPath alone is insufficient — laser software reads raw coords.
 *
 * The inset is computed in geographic degrees from the mm border thickness
 * using the same scale factors as the projection.
 */
function clipToInnerBbox(
  feature: Feature<MultiPolygon>,
  proj: Projection,
  thicknessMm: number
): Feature<MultiPolygon> {
  const [west, south, east, north] = proj.bbox;

  // Convert mm thickness → geographic degrees using projection scales
  const insetX = thicknessMm * (east - west) / proj.width;   // longitude degrees
  const insetY = thicknessMm * (north - south) / proj.height; // latitude degrees

  const innerW = proj.width  - 2 * thicknessMm;
  const innerH = proj.height - 2 * thicknessMm;
  if (innerW <= 0 || innerH <= 0) return feature;

  const innerRing: Position[] = [
    [west + insetX, south + insetY],
    [east - insetX, south + insetY],
    [east - insetX, north - insetY],
    [west + insetX, north - insetY],
    [west + insetX, south + insetY],
  ];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clipped = polygonClipping.intersection(
      feature.geometry.coordinates as unknown as Parameters<typeof polygonClipping.intersection>[0],
      [[innerRing]] as unknown as Parameters<typeof polygonClipping.intersection>[1]
    );
    if (!clipped?.length) return feature;
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: clipped as Position[][][] },
    };
  } catch {
    return feature;
  }
}

/**
 * Weld the clipped road MultiPolygon into the border frame by unioning them
 * in geographic space.
 *
 * After clipping roads to the inner bbox, each road that crosses the border
 * has a straight edge running exactly along the inner bbox boundary.  That
 * edge is also the inner boundary of the frame polygon.  When we union the
 * two shapes, the shared edges cancel out — the roads and the frame become
 * one continuous polygon with no cut line at their junctions.
 *
 * The result path is used as the sole SVG path; the builder is told to skip
 * its separate frame element (it's already baked in).
 */
function weldWithBorderFrame(
  feature: Feature<MultiPolygon>,
  proj: Projection,
  thicknessMm: number
): Feature<MultiPolygon> {
  const [west, south, east, north] = proj.bbox;

  const insetX = thicknessMm * (east - west) / proj.width;
  const insetY = thicknessMm * (north - south) / proj.height;

  const innerW = proj.width  - 2 * thicknessMm;
  const innerH = proj.height - 2 * thicknessMm;
  if (innerW <= 0 || innerH <= 0) return feature;

  // Border frame polygon in geographic coords:
  //   outer ring  = full map bbox  (CW → exterior)
  //   inner ring  = inset bbox     (CCW → hole / the open map area)
  const outerRing: [number, number][] = [
    [west,  south], [east,  south], [east,  north], [west,  north], [west, south],
  ];
  const innerRing: [number, number][] = [
    [west + insetX, south + insetY],
    [east - insetX, south + insetY],
    [east - insetX, north - insetY],
    [west + insetX, north - insetY],
    [west + insetX, south + insetY],
  ];

  const borderFrame = [[outerRing, innerRing]] as unknown as Parameters<typeof polygonClipping.union>[1];

  try {
    const welded = polygonClipping.union(
      feature.geometry.coordinates as unknown as Parameters<typeof polygonClipping.union>[0],
      borderFrame
    );
    if (!welded?.length) return feature;
    return {
      type: "Feature",
      properties: {},
      geometry: { type: "MultiPolygon", coordinates: welded as Position[][][] },
    };
  } catch {
    return feature;
  }
}

function polygonRingToPath(ring: Position[], proj: Projection): string {
  return (
    ring
      .map((pt, i) => {
        const [x, y] = proj.project(pt[0], pt[1]);
        return `${i === 0 ? "M" : "L"}${x.toFixed(4)},${y.toFixed(4)}`;
      })
      .join(" ") + " Z"
  );
}

function multiPolygonToPath(geom: MultiPolygon, proj: Projection): string {
  return geom.coordinates
    .flatMap((polygon) => polygon.map((ring) => polygonRingToPath(ring, proj)))
    .join(" ");
}

function multiLineStringToPath(geom: MultiLineString, proj: Projection): string {
  return geom.coordinates
    .map((line) =>
      line
        .map((pt, i) => {
          const [x, y] = proj.project(pt[0], pt[1]);
          return `${i === 0 ? "M" : "L"}${x.toFixed(4)},${y.toFixed(4)}`;
        })
        .join(" ")
    )
    .join(" ");
}

/** Clip line strings to the inner bbox at coordinate level so the laser
 *  doesn't engrave into the border band. */
function clipLinesToInnerBbox(
  feature: Feature<MultiLineString>,
  proj: Projection,
  thicknessMm: number
): Feature<MultiLineString> {
  const [west, south, east, north] = proj.bbox;
  const insetX = thicknessMm * (east - west) / proj.width;
  const insetY = thicknessMm * (north - south) / proj.height;
  if (proj.width - 2 * thicknessMm <= 0 || proj.height - 2 * thicknessMm <= 0) return feature;

  const clipBbox: [number, number, number, number] = [
    west + insetX, south + insetY, east - insetX, north - insetY,
  ];
  const clippedLines: Position[][] = [];

  for (const coords of feature.geometry.coordinates) {
    if (coords.length < 2) continue;
    try {
      const result = turf.bboxClip(turf.lineString(coords), clipBbox);
      const g = result.geometry;
      if (g.type === "LineString") {
        if (g.coordinates.length >= 2) clippedLines.push(g.coordinates as Position[]);
      } else {
        for (const seg of g.coordinates) {
          if (seg.length >= 2) clippedLines.push(seg as Position[]);
        }
      }
    } catch { /* skip degenerate */ }
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "MultiLineString", coordinates: clippedLines },
  };
}

export function generateCutLayerSVG(
  feature: Feature<MultiPolygon>,
  proj: Projection,
  border?: BorderOptions
): string {
  // Clip geometry to inner area so road/water paths don't extend into the frame band
  const clipped =
    border?.enabled && border.thicknessMm > 0
      ? clipToInnerBbox(feature, proj, border.thicknessMm)
      : feature;
  const d = multiPolygonToPath(clipped.geometry, proj);
  return buildSVGDocument(
    [{ id: "cut-layer", pathData: d, style: "cut" }],
    proj.width,
    proj.height,
    border
  );
}


export function generateEngraveLayerSVG(
  feature: Feature<MultiLineString>,
  proj: Projection,
  border?: BorderOptions
): string {
  const clipped =
    border?.enabled && border.thicknessMm > 0
      ? clipLinesToInnerBbox(feature, proj, border.thicknessMm)
      : feature;
  const d = multiLineStringToPath(clipped.geometry, proj);
  return buildSVGDocument(
    [{ id: "engrave-layer", pathData: d, style: "engrave" }],
    proj.width,
    proj.height,
    border,
    false // frame lives on the top-cut layer
  );
}

export function generateTopCutLayerSVG(
  feature: Feature<MultiPolygon>,
  proj: Projection,
  border?: BorderOptions
): string {
  let geom = feature;
  // When a border is active, the road geometry is processed in two steps:
  //   1. Clip to inner area — eliminates all coordinate data outside the frame
  //   2. Union with border frame polygon — welds road ends into the frame so
  //      there is no laser-cut line at the road-border junction
  // The welded path already contains the frame, so we tell the builder to skip
  // its separate frame element (borderForDoc = undefined → no clipPath / frame).
  let borderForDoc: BorderOptions | undefined = border;
  if (border?.enabled && border.thicknessMm > 0) {
    geom = clipToInnerBbox(feature, proj, border.thicknessMm);
    geom = weldWithBorderFrame(geom, proj, border.thicknessMm);
    borderForDoc = undefined; // frame is baked into the unified path
  }

  const d = multiPolygonToPath(geom.geometry, proj);
  return buildSVGDocument(
    [{ id: "topcut-layer", pathData: d, style: "topcut" }],
    proj.width,
    proj.height,
    borderForDoc
  );
}
