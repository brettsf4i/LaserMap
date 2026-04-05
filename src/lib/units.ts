export type Unit = "mm" | "in";

const MM_PER_IN = 25.4;
const M_PER_FT = 0.3048;

/** Convert internal mm value to display value */
export function mmToDisplay(mm: number, unit: Unit): number {
  return unit === "in" ? mm / MM_PER_IN : mm;
}

/** Convert display value to internal mm */
export function displayToMm(val: number, unit: Unit): number {
  return unit === "in" ? val * MM_PER_IN : val;
}

/** Convert internal metres to display distance (m or ft) */
export function metersToDisplay(m: number, unit: Unit): string {
  if (unit === "in") {
    const ft = m / M_PER_FT;
    return `${ft.toFixed(1)} ft`;
  }
  return `${m} m`;
}

/** Format a display-unit mm value for rendering */
export function formatMm(mm: number, unit: Unit): string {
  if (unit === "in") return (mm / MM_PER_IN).toFixed(2) + " in";
  return mm.toFixed(1) + " mm";
}

/** Input step size for the unit */
export function widthStep(unit: Unit): number {
  return unit === "in" ? 0.25 : 5;
}

/** Min/max width in display units */
export function widthRange(unit: Unit): { min: number; max: number } {
  return unit === "in"
    ? { min: 2, max: 40 }        // ≈ 51 mm – 1016 mm
    : { min: 50, max: 1000 };
}
