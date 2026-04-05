import { buildBorderSVGElements, type BorderOptions } from "./border";

export type LayerStyle = "cut" | "engrave" | "topcut";

export interface SVGLayer {
  id: string;
  pathData: string;
  style: LayerStyle;
}

const STYLE_MAP: Record<
  LayerStyle,
  { fill: string; stroke: string; strokeWidth: string; fillRule: string }
> = {
  cut: {
    fill: "#FF0000",
    stroke: "none",
    strokeWidth: "0",
    fillRule: "evenodd",
  },
  topcut: {
    fill: "#FF0000",
    stroke: "none",
    strokeWidth: "0",
    fillRule: "evenodd",
  },
  engrave: {
    fill: "none",
    stroke: "#000000",
    strokeWidth: "0.1",
    fillRule: "nonzero",
  },
};

export function buildSVGDocument(
  layers: SVGLayer[],
  width: number,
  height: number,
  border?: BorderOptions
): string {
  const paths = layers
    .map((layer) => {
      const s = STYLE_MAP[layer.style];
      return `  <path
    id="${layer.id}"
    d="${layer.pathData}"
    fill="${s.fill}"
    stroke="${s.stroke}"
    stroke-width="${s.strokeWidth}"
    fill-rule="${s.fillRule}"
    vector-effect="non-scaling-stroke"
  />`;
    })
    .join("\n");

  // Border elements sit after the map content so they render on top
  const borderElements =
    border?.enabled
      ? "\n" + buildBorderSVGElements(width, height, border)
      : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width.toFixed(4)}mm"
  height="${height.toFixed(4)}mm"
  viewBox="0 0 ${width.toFixed(4)} ${height.toFixed(4)}"
>
${paths}${borderElements}
</svg>`;
}
