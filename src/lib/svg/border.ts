/**
 * Border & registration-mark helpers.
 *
 * Supports two border shapes:
 *  - "rectangle": solid filled frame with outer rect + inner rect hole (evenodd)
 *  - "circle":    solid filled ring — outer circle + inner circle hole (evenodd)
 *                 The circle is inscribed in the map dimensions (radius = min(w,h)/2)
 *                 and the inner circle is inset by thicknessMm.
 *
 * The clipPath is used in the SVG to prevent map content from rendering inside
 * the frame band. Laser software reads raw coordinates, so geometric clipping
 * is also applied separately in layers.ts.
 */

export interface BorderOptions {
  /** Whether the border is active at all */
  enabled: boolean;
  /** Solid band width in mm */
  thicknessMm: number;
  /** Shape of the border frame */
  shape: "rectangle" | "circle";
  /** Whether to punch registration circles at the four inner corners (rectangle only) */
  cornerMarks: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fixed-decimal formatter — strips trailing zeros for compact output */
export function f(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

/**
 * SVG arc path for a full circle using two half-arcs (SVG can't draw a full
 * circle with a single arc command).
 */
function circlePath(cx: number, cy: number, r: number): string {
  return (
    `M ${f(cx + r)},${f(cy)} ` +
    `A ${f(r)},${f(r)} 0 1 0 ${f(cx - r)},${f(cy)} ` +
    `A ${f(r)},${f(r)} 0 1 0 ${f(cx + r)},${f(cy)} Z`
  );
}

// ── Clip path ─────────────────────────────────────────────────────────────────

/**
 * Returns a <defs> block with a <clipPath id="map-clip"> that restricts map
 * content to the inner area (inside the frame band).
 */
export function buildClipPathDefs(
  width: number,
  height: number,
  thicknessMm: number,
  shape: "rectangle" | "circle" = "rectangle"
): string {
  const T = thicknessMm;

  if (shape === "circle") {
    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.min(width, height) / 2;
    const innerR = outerR - T;
    if (innerR <= 0) return "";
    return [
      `  <defs>`,
      `    <clipPath id="map-clip">`,
      `      <circle cx="${f(cx)}" cy="${f(cy)}" r="${f(innerR)}" />`,
      `    </clipPath>`,
      `  </defs>`,
    ].join("\n");
  }

  // rectangle
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
 * Returns a single red filled <path> that forms the solid frame.
 * Uses fill-rule="evenodd" so the inner shape becomes a hole.
 */
export function buildBorderFrameElement(
  width: number,
  height: number,
  opts: BorderOptions
): string {
  const { thicknessMm, cornerMarks, shape } = opts;
  const T = thicknessMm;

  if (shape === "circle") {
    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.min(width, height) / 2;
    const innerR = outerR - T;
    if (innerR <= 0) return "";

    // Outer circle (CW) + inner circle (CCW via second arc direction) → evenodd hole
    const outer = circlePath(cx, cy, outerR);
    const inner = circlePath(cx, cy, innerR);
    const d = `${outer} ${inner}`.trim();

    return [
      `  <!-- Circular border frame — fill-rule evenodd creates ring -->`,
      `  <path`,
      `    id="border-frame"`,
      `    d="${d}"`,
      `    fill="#FF0000"`,
      `    stroke="none"`,
      `    fill-rule="evenodd"`,
      `  />`,
    ].join("\n");
  }

  // ── Rectangle ──────────────────────────────────────────────────────────────
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
