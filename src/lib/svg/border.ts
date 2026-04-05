/**
 * Border & registration-mark helpers.
 *
 * The border is a solid filled frame — an outer rectangle with a rectangular
 * hole cut out of the centre (fill-rule="evenodd"). It is identical on the
 * cut and top-cut layers. The engrave layer clips its content to the inner
 * area but does not render the frame (it is covered by the top-layer border).
 *
 * A <clipPath> is injected into every SVG that has an active border so that
 * map content (roads, water) never renders inside the frame band.
 */

export interface BorderOptions {
  /** Whether the border is active at all */
  enabled: boolean;
  /** Solid band width in mm */
  thicknessMm: number;
  /** Whether to punch registration circles at the four inner corners */
  cornerMarks: boolean;
}

// ── Clip path ─────────────────────────────────────────────────────────────────

/**
 * Returns a <defs> block containing a <clipPath id="map-clip"> that restricts
 * map content to the inner rectangle (outside the frame band).
 */
export function buildClipPathDefs(
  width: number,
  height: number,
  thicknessMm: number
): string {
  const T = thicknessMm;
  const innerW = width - 2 * T;
  const innerH = height - 2 * T;
  if (innerW <= 0 || innerH <= 0) return "";

  return [
    `  <defs>`,
    `    <clipPath id="map-clip">`,
    `      <rect x="${f(T)}" y="${f(T)}" width="${f(innerW)}" height="${f(innerH)}" />`,
    `    </clipPath>`,
    `  </defs>`,
  ].join("\n");
}

// ── Frame path ────────────────────────────────────────────────────────────────

/**
 * Returns a single red filled <path> (fill-rule evenodd) that forms the solid
 * frame:  outer ring = full canvas, inner ring = hole, corner arcs = pin holes.
 */
export function buildBorderFrameElement(
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

  // Outer rectangle (clockwise)
  const outer =
    `M 0,0 L ${f(width)},0 L ${f(width)},${f(height)} L 0,${f(height)} Z`;

  // Inner rectangle / hole (counter-clockwise → evenodd creates hole)
  const ix  = f(innerX);
  const iy  = f(innerY);
  const ix2 = f(innerX + innerW);
  const iy2 = f(innerY + innerH);
  const inner = `M ${ix},${iy} L ${ix},${iy2} L ${ix2},${iy2} L ${ix2},${iy} Z`;

  // Corner registration holes (circles as arc pairs, also evenodd → holes)
  let cornerPaths = "";
  if (cornerMarks) {
    const r = Math.min(T / 4, 3); // radius capped at 3 mm
    const centres: [number, number][] = [
      [innerX,          innerY],
      [innerX + innerW, innerY],
      [innerX,          innerY + innerH],
      [innerX + innerW, innerY + innerH],
    ];
    for (const [cx, cy] of centres) {
      cornerPaths +=
        ` M ${f(cx + r)},${f(cy)}` +
        ` A ${r},${r} 0 1 0 ${f(cx - r)},${f(cy)}` +
        ` A ${r},${r} 0 1 0 ${f(cx + r)},${f(cy)} Z`;
    }
  }

  const d = `${outer} ${inner}${cornerPaths}`.trim();

  return [
    `  <!-- Solid border frame — identical on cut layers (fill-rule evenodd) -->`,
    `  <path`,
    `    id="border-frame"`,
    `    d="${d}"`,
    `    fill="#FF0000"`,
    `    stroke="none"`,
    `    fill-rule="evenodd"`,
    `  />`,
  ].join("\n");
}

/** Fixed-decimal formatter — strips trailing zeros for compact output */
function f(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}
