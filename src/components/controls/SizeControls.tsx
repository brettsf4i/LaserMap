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

      <div className="flex items-center gap-2">
        {/* Width input */}
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">
            Width ({unit})
          </label>
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
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Height (read-only) */}
        {displayHeight !== null && (
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">
              Height ({unit})
            </label>
            <div className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-600">
              {displayHeight}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Height is computed from the aspect ratio of your selected area.
      </p>
    </div>
  );
}
