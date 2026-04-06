"use client";

import { useAppStore } from "@/lib/store";
import { metersToDisplay } from "@/lib/units";
import { ROAD_CLASS_DEFS } from "@/lib/overpass/queries";

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
    majorRoadClasses,
    setRoadBuffer,
    setSimplification,
    setMajorRoadClasses,
    unit,
  } = useAppStore();

  const toggleClass = (key: string) => {
    if (majorRoadClasses.includes(key)) {
      setMajorRoadClasses(majorRoadClasses.filter((k) => k !== key));
    } else {
      setMajorRoadClasses([...majorRoadClasses, key]);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Road Settings
      </h3>

      {/* ── Major road class selection ── */}
      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-medium text-gray-600">
          Major Roads cut layer
        </p>
        <p className="text-xs text-gray-400 -mt-0.5 mb-1">
          Only named roads are fetched. Toggle classes to tune the cut layer.
        </p>

        {ROAD_CLASS_DEFS.map(({ key, label, osmColor }) => {
          const enabled = majorRoadClasses.includes(key);
          return (
            <label
              key={key}
              className="flex items-center gap-2.5 cursor-pointer select-none group"
            >
              {/* Hidden native checkbox — fires onChange for the parent div regen listener */}
              <input
                type="checkbox"
                checked={enabled}
                onChange={() => toggleClass(key)}
                className="sr-only"
              />

              {/* Custom checkbox styled with the OSM colour when active */}
              <span
                className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                  enabled ? "border-transparent" : "bg-white border-gray-300"
                }`}
                style={enabled ? { backgroundColor: osmColor } : {}}
              >
                {enabled && (
                  <svg
                    className="w-2.5 h-2.5 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                  </svg>
                )}
              </span>

              {/* Label */}
              <span className="text-sm text-gray-700 flex-1">{label}</span>

              {/* OSM colour swatch */}
              <span
                className="w-8 h-3 rounded-sm flex-shrink-0 opacity-80"
                style={{ backgroundColor: osmColor }}
              />
            </label>
          );
        })}
      </div>

      {/* ── Road width ── */}
      <div>
        <div className="flex justify-between mb-1">
          <label className="text-sm font-medium text-gray-700">Road Width</label>
          <span className="text-sm text-gray-500">
            {metersToDisplay(roadBufferMeters, unit)}
          </span>
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
          <span>{metersToDisplay(3, unit)}</span>
          <span>{metersToDisplay(50, unit)}</span>
        </div>
      </div>

      {/* ── Simplification ── */}
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
          onChange={(e) =>
            setSimplification(sliderToTolerance(Number(e.target.value)))
          }
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
