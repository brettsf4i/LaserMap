"use client";

import { useAppStore } from "@/lib/store";
import type { LayerStatus } from "@/lib/store/types";

const STATUS_CONFIG: Record<
  LayerStatus,
  { label: string; color: string; bg: string }
> = {
  idle: { label: "Draw a rectangle on the map to get started", color: "text-gray-500", bg: "" },
  fetching: { label: "Fetching OSM data…", color: "text-blue-600", bg: "bg-blue-50" },
  processing: { label: "Processing geometry…", color: "text-indigo-600", bg: "bg-indigo-50" },
  ready: { label: "Layers ready — click Export to download", color: "text-green-700", bg: "bg-green-50" },
  error: { label: "", color: "text-red-700", bg: "bg-red-50" },
};

export default function StatusBar() {
  const { status, error } = useAppStore();
  const config = STATUS_CONFIG[status];
  const label = status === "error" ? error ?? "An error occurred" : config.label;

  if (status === "idle") {
    return <p className="text-xs text-gray-400">{label}</p>;
  }

  return (
    <div className={`rounded px-3 py-2 text-xs font-medium ${config.color} ${config.bg}`}>
      {status === "fetching" || status === "processing" ? (
        <span className="flex items-center gap-2">
          <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          {label}
        </span>
      ) : (
        label
      )}
    </div>
  );
}
