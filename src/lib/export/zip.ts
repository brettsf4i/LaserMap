import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { ProcessedLayers, BBox } from "@/lib/store/types";
import { createProjection } from "@/lib/svg/projection";
import type { BorderOptions } from "@/lib/svg/border";
import {
  generateCutLayerSVG,
  generateEngraveLayerSVG,
  generateTopCutLayerSVG,
} from "@/lib/svg/layers";

export interface ExportOptions {
  widthMm: number;
  border: BorderOptions;
}

export async function exportLayersAsZip(
  layers: ProcessedLayers,
  bbox: BBox,
  opts: ExportOptions,
  filename = "laser-map"
): Promise<void> {
  const { widthMm, border } = opts;
  const proj = createProjection({ bbox, widthMm });
  const zip = new JSZip();
  const folder = zip.folder("layers")!;

  if (layers.cutLayer) {
    folder.file(
      "01_cut_layer.svg",
      generateCutLayerSVG(layers.cutLayer, proj, border)
    );
  }
  if (layers.engraveLayer) {
    folder.file(
      "02_engrave_layer.svg",
      generateEngraveLayerSVG(layers.engraveLayer, proj, border)
    );
  }
  if (layers.topCutLayer) {
    folder.file(
      "03_top_cut_layer.svg",
      generateTopCutLayerSVG(layers.topCutLayer, proj, border)
    );
  }

  const borderNote = border.enabled
    ? [
        "",
        "Border / Registration:",
        `  Frame thickness: ${border.thicknessMm.toFixed(2)} mm (${(border.thicknessMm / 25.4).toFixed(3)} in)`,
        `  Corner marks: ${border.cornerMarks ? "yes (3 mm dowel-pin holes in frame)" : "no"}`,
        "  The solid frame is identical on all layers — stack and align edges for registration.",
      ].join("\n")
    : "";

  const readme = [
    "Laser Map Export",
    `Generated: ${new Date().toISOString()}`,
    "",
    `Physical dimensions: ${widthMm}mm wide x ${proj.height.toFixed(1)}mm tall`,
    `Bounding box: W=${bbox[0].toFixed(5)} S=${bbox[1].toFixed(5)} E=${bbox[2].toFixed(5)} N=${bbox[3].toFixed(5)}`,
    "",
    "Layers:",
    "  01_cut_layer.svg      - Land/water boundary. CUT with full power (red, filled).",
    "  02_engrave_layer.svg  - Residential & unclassified roads. ENGRAVE as hairline (black, stroke only).",
    "  03_top_cut_layer.svg  - Major Roads: all non-residential roads buffered to uniform width. CUT (red, filled).",
    borderNote,
    "",
    "Import each SVG separately into your laser software (LightBurn, RDWorks, etc.).",
    "Set SVG document units to mm. Do NOT scale when importing.",
    "Use fill-rule=evenodd for correct hole handling in cut layers.",
  ].join("\n");

  folder.file("README.txt", readme);

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  saveAs(blob, `${filename}.zip`);
}
