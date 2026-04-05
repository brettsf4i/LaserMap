/**
 * Border & registration-mark helpers.
 *
 * The border is always rendered as a cut line (red stroke, no fill) so it
 * is physically cut on every layer — giving perfectly aligned edges when
 * the pieces are stacked.
 */

export interface BorderOptions {
  /** Whether to add the border at all */
  enabled: boolean;
  /** Distance in mm from the SVG edge to the border rectangle */
  insetMm: number;
  /** Whether to add small circles at the border corners for pin registration */
  cornerMarks: boolean;
}

/** Radius of corner-mark circles in mm (fits a standard 3 mm dowel pin) */
const CORNER_MARK_RADIUS_MM = 1.5;

/** Stroke style shared by all border / registration elements */
const BORDER_STROKE = `fill="none" stroke="#FF0000" stroke-width="0.1" vector-effect="non-scaling-stroke"`;

/**
 * Returns SVG element strings (ready to embed inside <svg>) that represent
 * the border rectangle and, optionally, four corner registration circles.
 *
 * @param width  SVG viewport width in mm
 * @param height SVG viewport height in mm
 * @param opts   Border configuration
 */
export function buildBorderSVGElements(
  width: number,
  height: number,
  opts: BorderOptions
): string {
  const { insetMm, cornerMarks } = opts;

  const x = insetMm;
  const y = insetMm;
  const w = width - 2 * insetMm;
  const h = height - 2 * insetMm;

  if (w <= 0 || h <= 0) return "";

  const fx = x.toFixed(4);
  const fy = y.toFixed(4);
  const fw = w.toFixed(4);
  const fh = h.toFixed(4);

  const lines: string[] = [
    `  <!-- Border / alignment frame — identical on all layers -->`,
    `  <rect id="border" x="${fx}" y="${fy}" width="${fw}" height="${fh}" ${BORDER_STROKE} />`,
  ];

  if (cornerMarks) {
    const r = CORNER_MARK_RADIUS_MM;
    const corners: [number, number, string][] = [
      [x, y, "tl"],
      [x + w, y, "tr"],
      [x, y + h, "bl"],
      [x + w, y + h, "br"],
    ];
    lines.push(`  <!-- Corner registration marks (r=${r}mm — 3 mm dowel pins) -->`);
    for (const [cx, cy, id] of corners) {
      lines.push(
        `  <circle id="corner-${id}" cx="${cx.toFixed(4)}" cy="${cy.toFixed(4)}" r="${r}" ${BORDER_STROKE} />`
      );
    }
  }

  return lines.join("\n");
}
