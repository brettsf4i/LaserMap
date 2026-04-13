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
  /** Which layers to include in the export — mirrors the store's visible state */
  visible: { cut: boolean; engrave: boolean; topCut: boolean };
}

export async function exportLayersAsZip(
  layers: ProcessedLayers,
  bbox: BBox,
  opts: ExportOptions,
  filename = "laser-map"
): Promise<void> {
  const { widthMm, border, visible } = opts;
  const proj = createProjection({ bbox, widthMm });

  // Auto-size border to 5 % of map width so it scales proportionally
  // regardless of the project dimensions.  The stored thicknessMm is ignored.
  const effectiveBorder: typeof border = border.enabled
    ? { ...border, thicknessMm: widthMm * 0.05 }
    : border;
  const zip = new JSZip();
  const folder = zip.folder("layers")!;

  const layerReadmeLines: string[] = ["Layers included in this export:"];

  if (visible.cut && layers.cutLayer) {
    folder.file(
      "01_cut_layer.svg",
      generateCutLayerSVG(layers.cutLayer, proj, effectiveBorder)
    );
    layerReadmeLines.push("  01_cut_layer.svg      - Land/water boundary. CUT with full power (red, filled).");
  }
  if (visible.engrave && layers.engraveLayer) {
    folder.file(
      "02_engrave_layer.svg",
      generateEngraveLayerSVG(layers.engraveLayer, proj, effectiveBorder)
    );
    layerReadmeLines.push("  02_engrave_layer.svg  - Local roads hairline etch. ENGRAVE (black, stroke only). Road classes adapt to map scale.");
  }
  if (visible.topCut && layers.topCutLayer) {
    folder.file(
      "03_top_cut_layer.svg",
      generateTopCutLayerSVG(layers.topCutLayer, proj, effectiveBorder)
    );
    layerReadmeLines.push("  03_top_cut_layer.svg  - Major Roads buffered to uniform width. CUT (red, filled). Road classes adapt to map scale.");
  }

  const borderNote = effectiveBorder.enabled
    ? [
        "",
        "Border / Registration:",
        `  Frame thickness: ${effectiveBorder.thicknessMm.toFixed(2)} mm (${(effectiveBorder.thicknessMm / 25.4).toFixed(3)} in) — auto-sized to 5% of map width`,
        `  Corner marks: ${effectiveBorder.cornerMarks ? "yes (3 mm dowel-pin holes in frame)" : "no"}`,
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
    ...layerReadmeLines,
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
