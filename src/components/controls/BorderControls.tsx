"use client";

import { useAppStore } from "@/lib/store";
import { mmToDisplay } from "@/lib/units";

export default function BorderControls() {
  const {
    borderEnabled,
    borderShape,
    cornerMarksEnabled,
    widthMm,
    unit,
    setBorderEnabled,
    setBorderShape,
    setCornerMarksEnabled,
  } = useAppStore();

  // Auto-computed thickness: 5% of map width (matches export logic in zip.ts)
  const autoThicknessMm = widthMm * 0.05;
  const displayThickness = parseFloat(
    mmToDisplay(autoThicknessMm, unit).toFixed(unit === "in" ? 2 : 1)
  );

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

          {/* Shape selector */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Shape</span>
            <div className="grid grid-cols-2 gap-2">
              {/* Rectangle option */}
              <button
                onClick={() => setBorderShape("rectangle")}
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2.5 transition-colors ${
                  borderShape === "rectangle"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
                  {/* Outer rect */}
                  <rect x="1" y="1" width="34" height="26" rx="1"
                    stroke={borderShape === "rectangle" ? "#3B82F6" : "#9CA3AF"}
                    strokeWidth="2" fill="none" />
                  {/* Inner rect (frame thickness representation) */}
                  <rect x="5" y="5" width="26" height="18" rx="0.5"
                    stroke={borderShape === "rectangle" ? "#3B82F6" : "#9CA3AF"}
                    strokeWidth="1" fill={borderShape === "rectangle" ? "#EFF6FF" : "#F9FAFB"} />
                </svg>
                <span className={`text-xs font-medium ${borderShape === "rectangle" ? "text-blue-600" : "text-gray-600"}`}>
                  Rectangle
                </span>
              </button>

              {/* Circle option */}
              <button
                onClick={() => setBorderShape("circle")}
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 px-3 py-2.5 transition-colors ${
                  borderShape === "circle"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
                  {/* Outer circle */}
                  <ellipse cx="18" cy="14" rx="13" ry="13"
                    stroke={borderShape === "circle" ? "#3B82F6" : "#9CA3AF"}
                    strokeWidth="2" fill="none" />
                  {/* Inner circle (frame thickness representation) */}
                  <ellipse cx="18" cy="14" rx="9" ry="9"
                    stroke={borderShape === "circle" ? "#3B82F6" : "#9CA3AF"}
                    strokeWidth="1" fill={borderShape === "circle" ? "#EFF6FF" : "#F9FAFB"} />
                </svg>
                <span className={`text-xs font-medium ${borderShape === "circle" ? "text-blue-600" : "text-gray-600"}`}>
                  Circle
                </span>
              </button>
            </div>

            {borderShape === "circle" && (
              <p className="text-xs text-gray-400 leading-snug">
                Circle is inscribed in the map area — crops to the smaller dimension.
              </p>
            )}
          </div>

          {/* Auto-size info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">Border thickness</span>
            <span className="tabular-nums text-gray-500 font-medium">
              {displayThickness}&thinsp;{unit}
              <span className="text-gray-400 font-normal ml-1">(auto)</span>
            </span>
          </div>
          <p className="text-xs text-gray-400 -mt-1">
            Automatically set to 5% of the map width so it scales with your project size.
          </p>

          {/* Corner registration marks — rectangle only */}
          {borderShape === "rectangle" && (
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
          )}

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
