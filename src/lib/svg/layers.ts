import type { Feature, MultiPolygon, MultiLineString, Position } from "geojson";
import polygonClipping from "polygon-clipping";
import * as turf from "@turf/turf";
import type { Projection } from "./projection";
import type { BorderOptions } from "./border";
import { buildSVGDocument } from "./builder";


// ── Rectangle clipping (geographic space — no Y-flip issue) ──────────────────

/**
 * Geometrically clip a MultiPolygon to the inner map area (bbox inset by
 * border thickness) so that laser software sees no path data inside the frame.
 */
function clipToInnerBbox(
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

  const innerRing: Position[] = [
    [west + insetX, south + insetY],
    [east - insetX, south + insetY],
    [east - insetX, north - insetY],
    [west + insetX, north - insetY],
    [west + insetX, south + insetY],
  ];

  try {
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

// ── Geographic-space circle helpers ──────────────────────────────────────────

/**
 * Build a CCW geographic ring (ellipse) that maps exactly to the SVG inner
 * circle when projected.  Works entirely in geo space — same pipeline that
 * already works correctly for the rectangle border.
 *
 * Derivation: proj maps (lon, lat) → (x, y) as
 *   x = (lon − west) * scaleX,   y = (north − lat) * scaleY
 * Inverting: lon = west + x/scaleX, lat = north − y/scaleY.
 * The SVG circle x=cx+r·cos a, y=cy+r·sin a inverts to
 *   lon = lonCen + lonR·cos(a)
 *   lat = latCen − latR·sin(a)       ← minus because y flip
 * Going a from 2π→0 makes lat trace north→south→north = CCW in geo (Y-up). ✓
 */
function geoEllipseForSVGCircle(
  proj: Projection,
  svgRadiusMm: number,
  segments = 128
): Position[] {
  const [west, south, east, north] = proj.bbox;
  const scaleX = proj.width  / (east - west);
  const scaleY = proj.height / (north - south);

  const cx = proj.width  / 2;
  const cy = proj.height / 2;
  const lonCen = west  + cx / scaleX;
  const latCen = north - cy / scaleY;
  const lonR   = svgRadiusMm / scaleX;
  const latR   = svgRadiusMm / scaleY;

  const ring: Position[] = [];
  // Decreasing angle → CCW in geographic space (Y-up)
  for (let i = 0; i <= segments; i++) {
    const a = (2 * Math.PI * (segments - i)) / segments;
    ring.push([lonCen + lonR * Math.cos(a), latCen - latR * Math.sin(a)]);
  }
  return ring;
}

/**
 * Clip a MultiPolygon to the inner SVG circle — entirely in geographic space.
 * Creates a geographic ellipse matching the SVG circle, clips with it, then
 * projects the result to SVG using the standard multiPolygonToPath pipeline.
 * Falls back to the full projected polygon if clipping fails.
 */
function clipMultiPolygonToCircle(
  geom: MultiPolygon,
  proj: Projection,
  innerRadiusMm: number
): string {
  const geoRing = geoEllipseForSVGCircle(proj, innerRadiusMm);

  try {
    const clipped = polygonClipping.intersection(
      geom.coordinates as unknown as Parameters<typeof polygonClipping.intersection>[0],
      [[geoRing]] as unknown as Parameters<typeof polygonClipping.intersection>[1]
    );
    if (!clipped?.length) return multiPolygonToPath(geom, proj);
    return multiPolygonToPath(
      { type: "MultiPolygon", coordinates: clipped as Position[][][] },
      proj
    );
  } catch {
    return multiPolygonToPath(geom, proj);
  }
}

/**
 * Weld a MultiPolygon (major roads) with the circular border frame — entirely
 * in geographic space.  Clips roads to the inner geo ellipse, builds the
 * annular frame polygon, unions them, and projects to SVG.
 */
function weldWithCircleFrameGeo(
  geom: MultiPolygon,
  proj: Projection,
  thicknessMm: number
): string {
  const outerR = Math.min(proj.width, proj.height) / 2;
  const innerR = outerR - thicknessMm;
  if (innerR <= 0) return "";

  const outerRing = geoEllipseForSVGCircle(proj, outerR);
  const innerRing = geoEllipseForSVGCircle(proj, innerR);
  // Inner ring must be a hole (CW in geo) — reverse the CCW ring
  const innerHole = [...innerRing].reverse();

  // Frame = outer geo ellipse with inner as hole
  const frame = [[outerRing, innerHole]];

  try {
    // Clip roads to inner ellipse first
    const roadsClipped = polygonClipping.intersection(
      geom.coordinates as unknown as Parameters<typeof polygonClipping.intersection>[0],
      [[innerRing]] as unknown as Parameters<typeof polygonClipping.intersection>[1]
    );

    const roadsInput = roadsClipped?.length
      ? roadsClipped
      : ([] as typeof roadsClipped);

    const welded = polygonClipping.union(
      frame as unknown as Parameters<typeof polygonClipping.union>[0],
      ...(roadsInput.length
        ? [roadsInput as unknown as Parameters<typeof polygonClipping.union>[1]]
        : [])
    );

    if (!welded?.length) return "";
    return multiPolygonToPath(
      { type: "MultiPolygon", coordinates: welded as Position[][][] },
      proj
    );
  } catch {
    return "";
  }
}

// ── Rectangle weld (geographic space) ────────────────────────────────────────

/**
 * Weld the clipped road MultiPolygon into the rectangular border frame by
 * unioning them in geographic space. Shared edges at the inner bbox cancel.
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

  const outerRing: [number, number][] = [
    [west, south], [east, south], [east, north], [west, north], [west, south],
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

// ── SVG path converters (geographic → SVG via projection) ─────────────────────

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

/** Clip line strings to the inner bbox so the laser doesn't engrave into the border band. */
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

/**
 * Project MultiLineString to SVG mm space, clip to the inner circle there,
 * and return SVG path data directly.
 *
 * Working in SVG mm space means the clip boundary is a perfect circle.
 * We solve the standard line-circle intersection quadratic and walk each road
 * segment to build runs of points inside the circle.
 */
function clipAndPathLinesCircle(
  geom: MultiLineString,
  proj: Projection,
  innerRadiusMm: number
): string {
  const cx = proj.width / 2;
  const cy = proj.height / 2;
  const r = innerRadiusMm;
  const fp = (n: number) => n.toFixed(4);

  const inside = (x: number, y: number) =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

  function crossingTs(x1: number, y1: number, x2: number, y2: number): number[] {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const A = dx * dx + dy * dy;
    if (A === 0) return [];
    const B = 2 * (fx * dx + fy * dy);
    const C = fx * fx + fy * fy - r * r;
    const disc = B * B - 4 * A * C;
    if (disc < 0) return [];
    const sq = Math.sqrt(disc);
    return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]
      .filter((t) => t > 1e-10 && t < 1 - 1e-10);
  }

  const lerpXY = (x1: number, y1: number, x2: number, y2: number, t: number): [number, number] =>
    [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];

  const parts: string[] = [];

  for (const coords of geom.coordinates) {
    if (coords.length < 2) continue;

    const svgPts = coords.map((c) => proj.project(c[0], c[1]) as [number, number]);
    let run: [number, number][] = [];

    const flushRun = () => {
      if (run.length >= 2) {
        parts.push(
          run.map(([x, y], i) => `${i === 0 ? "M" : "L"}${fp(x)},${fp(y)}`).join(" ")
        );
      }
      run = [];
    };

    for (let i = 0; i < svgPts.length; i++) {
      const [x, y] = svgPts[i];
      const isInside = inside(x, y);

      if (i === 0) {
        if (isInside) run.push([x, y]);
        continue;
      }

      const [px, py] = svgPts[i - 1];
      const prevIsInside = inside(px, py);
      const ts = crossingTs(px, py, x, y);

      if (prevIsInside && isInside) {
        run.push([x, y]);
      } else if (prevIsInside && !isInside) {
        if (ts.length > 0) run.push(lerpXY(px, py, x, y, ts[ts.length - 1]));
        flushRun();
      } else if (!prevIsInside && isInside) {
        flushRun();
        run = ts.length > 0 ? [lerpXY(px, py, x, y, ts[0])] : [];
        run.push([x, y]);
      } else {
        flushRun();
        if (ts.length === 2) {
          const p1 = lerpXY(px, py, x, y, ts[0]);
          const p2 = lerpXY(px, py, x, y, ts[1]);
          parts.push(`M${fp(p1[0])},${fp(p1[1])} L${fp(p2[0])},${fp(p2[1])}`);
        }
      }
    }

    flushRun();
  }

  return parts.join(" ");
}

// ── Layer generators ──────────────────────────────────────────────────────────

export function generateCutLayerSVG(
  feature: Feature<MultiPolygon>,
  proj: Projection,
  border?: BorderOptions
): string {
  let d: string;

  if (border?.enabled && border.thicknessMm > 0 && border.shape === "circle") {
    const outerR = Math.min(proj.width, proj.height) / 2;
    const innerR = outerR - border.thicknessMm;
    d = innerR > 0 ? clipMultiPolygonToCircle(feature.geometry, proj, innerR) : "";
  } else {
    const clipped =
      border?.enabled && border.thicknessMm > 0
        ? clipToInnerBbox(feature, proj, border.thicknessMm)
        : feature;
    d = multiPolygonToPath(clipped.geometry, proj);
  }

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
  let d: string;

  if (border?.enabled && border.thicknessMm > 0 && border.shape === "circle") {
    const outerR = Math.min(proj.width, proj.height) / 2;
    const innerR = outerR - border.thicknessMm;
    d = innerR > 0 ? clipAndPathLinesCircle(feature.geometry, proj, innerR) : "";
  } else {
    const clipped =
      border?.enabled && border.thicknessMm > 0
        ? clipLinesToInnerBbox(feature, proj, border.thicknessMm)
        : feature;
    d = multiLineStringToPath(clipped.geometry, proj);
  }

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
  let d: string;
  let borderForDoc: BorderOptions | undefined = border;

  if (border?.enabled && border.thicknessMm > 0) {
    if (border.shape === "circle") {
      // Clip roads to inner circle then weld with circular frame — all in SVG space
      const outerR = Math.min(proj.width, proj.height) / 2;
      const innerR = outerR - border.thicknessMm;
      if (innerR > 0) {
        // First clip to inner circle (returns path string), but we need the geometry
        // for welding — so clip in SVG space and get a welded path directly
        d = weldWithCircleFrameGeo(feature.geometry, proj, border.thicknessMm);
      } else {
        d = "";
      }
    } else {
      const clipped = clipToInnerBbox(feature, proj, border.thicknessMm);
      const welded = weldWithBorderFrame(clipped, proj, border.thicknessMm);
      d = multiPolygonToPath(welded.geometry, proj);
    }
    borderForDoc = undefined; // frame is baked into the unified path
  } else {
    d = multiPolygonToPath(feature.geometry, proj);
  }

  return buildSVGDocument(
    [{ id: "topcut-layer", pathData: d, style: "topcut" }],
    proj.width,
    proj.height,
    borderForDoc
  );
}
