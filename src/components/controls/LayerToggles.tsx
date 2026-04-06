"use client";

import { useAppStore } from "@/lib/store";

export default function LayerToggles() {
  const { visible, toggleVisible } = useAppStore();

  const layers = [
    { key: "cut" as const,    label: "Cut Layer",    color: "bg-blue-400",   description: "Land/water boundary" },
    { key: "engrave" as const, label: "Engrave Layer", color: "bg-gray-500", description: "Residential & unclassified roads" },
    { key: "topCut" as const,  label: "Major Roads",  color: "bg-orange-400", description: "All other roads (cut)" },
  ];

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Layer Preview
      </h3>
      {layers.map(({ key, label, color, description }) => (
        <label
          key={key}
          className="flex items-center gap-2 cursor-pointer select-none"
        >
          <input
            type="checkbox"
            checked={visible[key]}
            onChange={() => toggleVisible(key)}
            className="sr-only"
          />
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
          <div>
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <span className="text-xs text-gray-400 ml-1">— {description}</span>
          </div>
        </label>
      ))}
    </div>
  );
}
