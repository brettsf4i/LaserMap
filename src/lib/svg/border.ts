/**
 * Border & registration-mark helpers.
 *
 * The border is a solid filled frame — an outer rectangle with a rectangular
 * hole cut out of the centre (fill-rule="evenodd").  It is identical on every
 * exported layer so the pieces stack with perfectly aligned edges.
 *
 * Corner registration marks (optional) are circular holes punched through
 * the frame band.  Use 3 mm dowel pins for precise layer stacking.
 */

export interface BorderOptions {
  /** Whether to add the border at all */
  enabled: boolean;
  /** Frame band width in mm (the solid area between the outer and inner edges) */
  thicknessMm: number;
  /** Whether to punch registration circles at the four inner corners */
  cornerMarks: boolean;
}

/**
 * Builds an SVG <path> for a solid frame using the even-odd fill rule.
 *
 * Outer ring  = full SVG canvas (0,0 → width,height)
 * Inner hole  = inset by thicknessMm on all sides
 * Corner holes = circles centred at each inner corner, radius = thicknessMm/4
 *                (clamped to 3 mm max so they always fit within the band)
 */
export function buildBorderSVGElements(
  width: number,
  height: number,
  opts: BorderOptions
): string {
  const { thicknessMm, cornerMarks } = opts;
  const T = thicknessMm;

  const innerX = T;
  const innerY = T;
  const innerW = width - 2 * T;
  const innerH = height - 2 * T;

  if (innerW <= 0 || innerH <= 0) return "";

  // ── Outer rectangle (clockwise) ──────────────────────────────────────────
  const outer = [
    `M 0,0`,
    `L ${f(width)},0`,
    `L ${f(width)},${f(height)}`,
    `L 0,${f(height)}`,
    `Z`,
  ].join(" ");

  // ── Inner rectangle / hole (counter-clockwise for evenodd) ───────────────
  const ix = f(innerX);
  const iy = f(innerY);
  const ix2 = f(innerX + innerW);
  const iy2 = f(innerY + innerH);

  const inner = [
    `M ${ix},${iy}`,
    `L ${ix},${iy2}`,
    `L ${ix2},${iy2}`,
    `L ${ix2},${iy}`,
    `Z`,
  ].join(" ");

  // ── Corner registration holes (circles as arc paths, evenodd = holes) ────
  let cornerPaths = "";
  if (cornerMarks) {
    const r = Math.min(T / 4, 3); // radius capped at 3 mm

    // Circle centres sit at each inner-rectangle corner
    const centres: [number, number][] = [
      [innerX,          innerY],           // top-left
      [innerX + innerW, innerY],           // top-right
      [innerX,          innerY + innerH],  // bottom-left
      [innerX + innerW, innerY + innerH],  // bottom-right
    ];

    for (const [cx, cy] of centres) {
      // Full circle as two half-arcs (sweep-flag 0 = counter-clockwise → hole)
      cornerPaths +=
        ` M ${f(cx + r)},${f(cy)}` +
        ` A ${r},${r} 0 1 0 ${f(cx - r)},${f(cy)}` +
        ` A ${r},${r} 0 1 0 ${f(cx + r)},${f(cy)} Z`;
    }
  }

  const d = `${outer} ${inner}${cornerPaths}`.trim();

  return [
    `  <!-- Solid border frame — identical on all layers (fill-rule evenodd) -->`,
    `  <path`,
    `    id="border-frame"`,
    `    d="${d}"`,
    `    fill="#FF0000"`,
    `    stroke="none"`,
    `    fill-rule="evenodd"`,
    `  />`,
  ].join("\n");
}

/** Fixed-decimal formatter (4 dp, trims trailing zeros) */
function f(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}
