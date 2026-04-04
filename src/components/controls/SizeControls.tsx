"use client";

import { useAppStore } from "@/lib/store";
import { createProjection } from "@/lib/svg/projection";

export default function SizeControls() {
  const { widthMm, bbox, setWidthMm } = useAppStore();

  let heightMm: number | null = null;
  if (bbox) {
    const proj = createProjection({ bbox, widthMm });
    heightMm = proj.height;
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Output Size
      </h3>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-500 mb-1 block">Width (mm)</label>
          <input
            type="number"
            min={50}
            max={1000}
            step={10}
            value={widthMm}
            onChange={(e) => setWidthMm(Math.max(50, Number(e.target.value)))}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {heightMm !== null && (
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Height (mm)</label>
            <div className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm bg-gray-50 text-gray-600">
              {heightMm.toFixed(1)}
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
