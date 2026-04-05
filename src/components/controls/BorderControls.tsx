"use client";

import { useAppStore } from "@/lib/store";
import { mmToDisplay, displayToMm } from "@/lib/units";

export default function BorderControls() {
  const {
    borderEnabled,
    borderThicknessMm,
    cornerMarksEnabled,
    unit,
    setBorderEnabled,
    setBorderThicknessMm,
    setCornerMarksEnabled,
  } = useAppStore();

  // Convert internal mm to display unit
  const displayThickness = parseFloat(
    mmToDisplay(borderThicknessMm, unit).toFixed(unit === "in" ? 2 : 1)
  );

  const step = unit === "in" ? 0.05 : 1;
  const min  = unit === "in" ? 0.1  : 2;
  const max  = unit === "in" ? 2    : 50;

  const handleThicknessChange = (raw: number) => {
    if (!isNaN(raw) && raw >= 0) {
      setBorderThicknessMm(displayToMm(raw, unit));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {/* ── Header with toggle ── */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Border &amp; Registration
        </h3>
        <button
          role="switch"
          aria-checked={borderEnabled}
          onClick={() => setBorderEnabled(!borderEnabled)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
            borderEnabled ? "bg-blue-600" : "bg-gray-200"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
              borderEnabled ? "translate-x-[18px]" : "translate-x-[3px]"
            }`}
          />
        </button>
      </div>

      {/* ── Settings (visible only when enabled) ── */}
      {borderEnabled && (
        <div className="flex flex-col gap-3 pl-1">

          {/* Border thickness */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm text-gray-700">Border thickness</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={displayThickness}
                  onChange={(e) => handleThicknessChange(Number(e.target.value))}
                  className="w-16 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-xs text-gray-400 w-5">{unit}</span>
              </div>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={displayThickness}
              onChange={(e) => handleThicknessChange(Number(e.target.value))}
              className="w-full accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>{min} {unit}</span>
              <span>{max} {unit}</span>
            </div>
          </div>

          {/* Corner registration marks */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <span className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={cornerMarksEnabled}
                onChange={(e) => setCornerMarksEnabled(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${
                  cornerMarksEnabled
                    ? "bg-blue-600 border-blue-600"
                    : "bg-white border-gray-300"
                }`}
              >
                {cornerMarksEnabled && (
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                )}
              </span>
            </span>
            <div>
              <p className="text-sm text-gray-700 leading-tight">Corner registration marks</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Circular holes in the frame corners — use with 3 mm dowel pins for precise stacking.
              </p>
            </div>
          </label>

          {/* Info note */}
          <div className="text-xs text-gray-400 bg-gray-50 rounded-md px-3 py-2 leading-snug space-y-1">
            <p>The solid frame band is cut identically on all three layers.</p>
            <p>Stack the pieces and align the outer edges for perfect registration.</p>
          </div>

        </div>
      )}
    </div>
  );
}
