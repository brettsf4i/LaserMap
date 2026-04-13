"use client";

import { useAppStore } from "@/lib/store";

// A tiny inline SVG that mimics each layer's visual style
function LayerSwatch({ type }: { type: "cut" | "engrave" | "topCut" }) {
  if (type === "engrave") {
    return (
      <svg width="28" height="14" viewBox="0 0 28 14" className="flex-shrink-0">
        <path d="M2 7 Q8 3 14 7 Q20 11 26 7" stroke="#000000" strokeWidth="1" fill="none" strokeLinecap="round" />
        <path d="M2 10 Q10 6 18 10" stroke="#000000" strokeWidth="1" fill="none" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === "topCut") {
    // Thick road bands
    return (
      <svg width="28" height="14" viewBox="0 0 28 14" className="flex-shrink-0">
        <rect x="2" y="4" width="24" height="5" rx="2.5" fill="#fb923c" opacity="0.8" />
        <rect x="2" y="1" width="10" height="4" rx="2" fill="#fb923c" opacity="0.5" />
      </svg>
    );
  }
  // cut — land with water hole
  return (
    <svg width="28" height="14" viewBox="0 0 28 14" className="flex-shrink-0">
      <rect x="1" y="1" width="26" height="12" rx="2" fill="#60a5fa" opacity="0.35" />
      <ellipse cx="14" cy="7" rx="6" ry="3.5" fill="white" opacity="0.85" />
    </svg>
  );
}

export default function LayerToggles() {
  const { visible, toggleVisible } = useAppStore();

  const layers: {
    key: "cut" | "engrave" | "topCut";
    label: string;
    sublabel: string;
    laserNote: string;
    color: string;
  }[] = [
    {
      key: "cut",
      label: "Land & Water",
      sublabel: "Cut Layer",
      laserNote: "Full cut — separates land from water",
      color: "bg-blue-400",
    },
    {
      key: "engrave",
      label: "Local Roads",
      sublabel: "Engrave Layer",
      laserNote: "Light etch — road texture (adapts to map scale)",
      color: "bg-gray-900",
    },
    {
      key: "topCut",
      label: "Major Roads",
      sublabel: "Cut Layer",
      laserNote: "Full cut — raised road bands (adapts to map scale)",
      color: "bg-orange-400",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Layer Preview
      </h3>
      <p className="text-xs text-gray-400 -mt-1">
        Select the layers to render and include in the downloaded files.
      </p>
      {layers.map(({ key, label, sublabel, laserNote, color }) => (
        <label
          key={key}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <input
            type="checkbox"
            checked={visible[key]}
            onChange={() => toggleVisible(key as "cut" | "engrave" | "topCut")}
            className="sr-only"
          />

          {/* Custom checkbox */}
          <span
            className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${
              visible[key] ? `${color} border-transparent` : "bg-white border-gray-300"
            }`}
          >
            {visible[key] && (
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            )}
          </span>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-medium text-gray-700">{label}</span>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">
                {sublabel}
              </span>
            </div>
            <p className="text-[11px] text-gray-400 leading-tight mt-0.5">{laserNote}</p>
          </div>

          {/* Mini preview swatch */}
          <LayerSwatch type={key} />
        </label>
      ))}
    </div>
  );
}
