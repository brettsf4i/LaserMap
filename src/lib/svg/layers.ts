import type { Feature, MultiPolygon, MultiLineString, Position } from "geojson";
import type { Projection } from "./projection";
import { buildSVGDocument } from "./builder";

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

export function generateCutLayerSVG(
  feature: Feature<MultiPolygon>,
  proj: Projection
): string {
  const d = multiPolygonToPath(feature.geometry, proj);
  return buildSVGDocument(
    [{ id: "cut-layer", pathData: d, style: "cut" }],
    proj.width,
    proj.height
  );
}

export function generateEngraveLayerSVG(
  feature: Feature<MultiLineString>,
  proj: Projection
): string {
  const d = multiLineStringToPath(feature.geometry, proj);
  return buildSVGDocument(
    [{ id: "engrave-layer", pathData: d, style: "engrave" }],
    proj.width,
    proj.height
  );
}

export function generateTopCutLayerSVG(
  feature: Feature<MultiPolygon>,
  proj: Projection
): string {
  const d = multiPolygonToPath(feature.geometry, proj);
  return buildSVGDocument(
    [{ id: "topcut-layer", pathData: d, style: "topcut" }],
    proj.width,
    proj.height
  );
}
