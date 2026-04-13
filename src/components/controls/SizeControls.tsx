"use client";

import { useAppStore } from "@/lib/store";
import { createProjection } from "@/lib/svg/projection";
import {
  mmToDisplay,
  displayToMm,
  widthStep,
  widthRange,
  type Unit,
} from "@/lib/units";

// Common laser cutter bed widths (mm) with friendly labels
const BED_PRESETS: { label: string; mm: number }[] = [
  { label: "200 mm", mm: 200 },
  { label: "300 mm", mm: 300 },
  { label: "A4",     mm: 210 },
  { label: "Letter", mm: 216 },
  { label: "400 mm", mm: 400 },
];

export default function SizeControls() {
  const { widthMm, bbox, setWidthMm, unit, setUnit } = useAppStore();

  let heightMm: number | null = null;
  if (bbox) {
    const proj = createProjection({ bbox, widthMm });
    heightMm = proj.height;
  }

  const { min, max } = widthRange(unit);
  const displayWidth = parseFloat(mmToDisplay(widthMm, unit).toFixed(unit === "in" ? 2 : 0));
  const displayHeight =
    heightMm !== null
      ? parseFloat(mmToDisplay(heightMm, unit).toFixed(unit === "in" ? 2 : 1))
      : null;

  const handleWidthChange = (raw: number) => {
    if (isNaN(raw)) return;
    const clamped = Math.max(min, Math.min(max, raw));
    setWidthMm(Math.round(displayToMm(clamped, unit)));
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header row with unit toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Output Size
        </h3>
        <div className="flex rounded border border-gray-200 overflow-hidden text-xs font-medium">
          {(["mm", "in"] as Unit[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className={
                unit === u
                  ? "bg-blue-600 text-white px-2.5 py-0.5"
                  : "bg-white text-gray-500 px-2.5 py-0.5 hover:bg-gray-50 transition-colors"
              }
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* ── Laser bed presets ── */}
      <div>
        <p className="text-xs text-gray-400 mb-1.5">Common laser bed widths:</p>
        <div className="flex flex-wrap gap-1.5">
          {BED_PRESETS.map(({ label, mm }) => (
            <button
              key={label}
              onClick={() => setWidthMm(mm)}
              title={`${mm} mm`}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                widthMm === mm
                  ? "border-blue-400 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Width / Height inputs ── */}
      <div className="flex items-center gap-2">
        {/* Width input */}
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">Width ({unit})</label>
          <input
            type="number"
            min={min}
            max={max}
            step={widthStep(unit)}
            value={displayWidth}
            onChange={(e) => {
              const raw = Number(e.target.value);
              if (!isNaN(raw) && raw >= min) {
                setWidthMm(Math.round(displayToMm(raw, unit)));
              }
            }}
            onBlur={(e) => handleWidthChange(Number(e.target.value))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Height (read-only) */}
        {displayHeight !== null && (
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Height ({unit})</label>
            <div className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-500 select-none">
              {displayHeight}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Height is calculated automatically from your selected area's shape.
        {unit === "mm" && widthMm > 600 && (
          <span className="text-amber-500 ml-1">
            Check your laser bed fits {widthMm} mm.
          </span>
        )}
      </p>
    </div>
  );
}
