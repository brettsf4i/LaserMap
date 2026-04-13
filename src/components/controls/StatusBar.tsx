"use client";

import { useAppStore } from "@/lib/store";
import type { LayerStatus } from "@/lib/store/types";

const STATUS_CONFIG: Record<
  LayerStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  idle:       { label: "Search for a location, then draw a rectangle on the map to get started.", color: "text-gray-400",   bg: "",              border: ""                  },
  fetching:   { label: "Fetching map data…",     color: "text-blue-600",   bg: "bg-blue-50",    border: "border-blue-100"   },
  processing: { label: "Building layers…",       color: "text-indigo-600", bg: "bg-indigo-50",  border: "border-indigo-100" },
  ready:      { label: "Layers ready — click Download Files to export.", color: "text-green-700", bg: "bg-green-50", border: "border-green-100" },
  error:      { label: "",                       color: "text-red-700",    bg: "bg-red-50",     border: "border-red-100"    },
};

export default function StatusBar() {
  const { status, error } = useAppStore();
  const config = STATUS_CONFIG[status];
  const label = status === "error" ? error ?? "An error occurred." : config.label;

  if (status === "idle") {
    return <p className="text-xs text-gray-400 leading-snug">{label}</p>;
  }

  return (
    <div
      className={`rounded-lg border px-3 py-2 text-xs font-medium leading-snug ${config.color} ${config.bg} ${config.border}`}
    >
      {status === "fetching" || status === "processing" ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {label}
        </span>
      ) : status === "error" ? (
        <span className="flex items-start gap-2">
          <svg className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {label}
        </span>
      ) : (
        <span className="flex items-center gap-2">
          <svg className="h-3.5 w-3.5 flex-shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {label}
        </span>
      )}
    </div>
  );
}
