import {
  buildClipPathDefs,
  buildBorderFrameElement,
  type BorderOptions,
} from "./border";

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

/**
 * @param border    Border options (undefined = no border)
 * @param showFrame Whether to render the solid frame path.
 *                  Pass false for the engrave layer — its content is clipped
 *                  to the inner area but the top-layer border covers the band.
 */
export function buildSVGDocument(
  layers: SVGLayer[],
  width: number,
  height: number,
  border?: BorderOptions,
  showFrame = true
): string {
  const paths = layers
    .map((layer) => {
      const s = STYLE_MAP[layer.style];
      return `    <path
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

  let defs = "";
  let mapContent = "";
  let frameElement = "";

  if (border?.enabled) {
    // Clip map content to the inner (non-frame) area
    defs = buildClipPathDefs(width, height, border.thicknessMm, border.shape);
    mapContent = `  <g clip-path="url(#map-clip)">\n${paths}\n  </g>`;

    // Solid frame — cut layers only; engrave layer skips this
    if (showFrame) {
      frameElement = "\n" + buildBorderFrameElement(width, height, border);
    }
  } else {
    mapContent = paths;
  }

  const defsBlock = defs ? `\n${defs}` : "";
  const frameBlock = frameElement;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${width.toFixed(4)}mm"
  height="${height.toFixed(4)}mm"
  viewBox="0 0 ${width.toFixed(4)} ${height.toFixed(4)}"
>${defsBlock}
${mapContent}${frameBlock}
</svg>`;
}
