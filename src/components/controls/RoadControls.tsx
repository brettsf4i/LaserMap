"use client";

import { useAppStore } from "@/lib/store";

const LOG_MIN = Math.log10(0.000005);
const LOG_MAX = Math.log10(0.001);

function toleranceToSlider(t: number): number {
  return Math.round(((Math.log10(t) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100);
}

function sliderToTolerance(v: number): number {
  return Math.pow(10, LOG_MIN + (v / 100) * (LOG_MAX - LOG_MIN));
}

export default function RoadControls() {
  const {
    roadBufferMeters,
    simplificationTolerance,
    setRoadBuffer,
    setSimplification,
  } = useAppStore();

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Road Settings
      </h3>

      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            Major Road Width
          </label>
          <span className="text-sm text-gray-500">{roadBufferMeters}m</span>
        </div>
        <input
          type="range"
          min={3}
          max={50}
          step={1}
          value={roadBufferMeters}
          onChange={(e) => setRoadBuffer(Number(e.target.value))}
          className="w-full accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>3m</span>
          <span>50m</span>
        </div>
      </div>

      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">
            Simplification
          </label>
          <span className="text-sm text-gray-500">
            {simplificationTolerance < 0.0001
              ? "Fine"
              : simplificationTolerance < 0.0005
              ? "Medium"
              : "Coarse"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={toleranceToSlider(simplificationTolerance)}
          onChange={(e) => setSimplification(sliderToTolerance(Number(e.target.value)))}
          className="w-full accent-gray-600"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>Fine</span>
          <span>Coarse</span>
        </div>
      </div>
    </div>
  );
}
