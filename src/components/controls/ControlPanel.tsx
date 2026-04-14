"use client";

import { useRef, useState, useEffect, type RefObject } from "react";
import { useAppStore } from "@/lib/store";
import { buildCombinedQuery, roadFetchNote } from "@/lib/overpass/queries";
import {
  parseCombinedResponse,
  type CombinedLayers,
  type OverpassResponse,
} from "@/lib/overpass/parser";
import { fetchOverpass } from "@/lib/overpass/client";
import { runGeometryPipeline } from "@/lib/geometry/pipeline";
import { exportLayersAsZip } from "@/lib/export/zip";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";
import DrawControls from "./DrawControls";
import LayerToggles from "./LayerToggles";
import RoadControls from "./RoadControls";
import BorderControls from "./BorderControls";
import StatusBar from "./StatusBar";

interface Props {
  mapRef: RefObject<MapCanvasHandle | null>;
}

// Cache parsed OSM features so slider changes only re-run geometry, not network
let cachedLayers: CombinedLayers | null = null;
let cachedBboxKey: string | null = null;

const MAX_AREA_KM2 = 500;   // hard limit — server will reject above this
const WARN_AREA_KM2 = 150;  // soft warning — processing may take 30-60 s

/** Convert raw Overpass / network errors into friendly plain-English messages */
function friendlyError(err: unknown): string {
  const msg = ((err as Error).message ?? String(err)).toLowerCase();
  if (msg.includes("429") || msg.includes("too many requests"))
    return "The map data server is busy — wait 30 seconds then try again.";
  if (msg.includes("timeout") || msg.includes("timed out"))
    return "Request timed out. Try selecting a smaller area.";
  if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("network"))
    return "No internet connection detected. Check your network and try again.";
  if (msg.includes("all overpass endpoints failed"))
    return "Map data is temporarily unavailable. Try again in a moment.";
  return (err as Error).message ?? String(err);
}

// ── Workflow stepper ──────────────────────────────────────────────────────────

interface StepProps {
  n: number;
  label: string;
  done: boolean;
  active: boolean;
  isLast?: boolean;
}

function WorkflowStep({ n, label, done, active, isLast }: StepProps) {
  return (
    <div className="flex items-center gap-1 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <span
          className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
            done
              ? "bg-green-500 text-white"
              : active
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          {done ? (
            <svg width="9" height="9" viewBox="0 0 20 20" fill="currentColor">
              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
            </svg>
          ) : (
            n
          )}
        </span>
        <span
          className={`text-[11px] font-medium truncate leading-tight ${
            done ? "text-green-600" : active ? "text-blue-600" : "text-gray-400"
          }`}
        >
          {label}
        </span>
      </div>
      {!isLast && (
        <div className={`h-px w-3 flex-shrink-0 ${done ? "bg-green-300" : "bg-gray-200"}`} />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ControlPanel({ mapRef }: Props) {
  const store = useAppStore();
  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [exportDone, setExportDone] = useState(false);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  function computeAreaKm2(): number | null {
    if (!store.bbox) return null;
    const [west, south, east, north] = store.bbox;
    const midLat = (south + north) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    return (
      Math.abs(east - west) * 111.32 * cosLat * Math.abs(north - south) * 110.574
    );
  }

  async function runPipeline(layers: CombinedLayers) {
    if (!store.bbox) return;
    store.setStatus("processing");
    try {
      const processed = await runGeometryPipeline({
        bbox: store.bbox,
        waterFeatures: layers.waterFeatures,
        allRoadFeatures: layers.allRoadFeatures,
        roadBufferMeters: store.roadBufferMeters,
        majorRoadClasses: store.majorRoadClasses,
      });
      store.setProcessed(processed);
      store.setStatus("ready");
    } catch (err) {
      store.setStatus("error", friendlyError(err));
    }
  }

  const handleGenerate = async () => {
    if (!store.bbox) return;
    setExportDone(false);

    const area = computeAreaKm2();
    if (area !== null && area > MAX_AREA_KM2) {
      store.setStatus(
        "error",
        `Selection too large (${area.toFixed(1)} km²). Draw a smaller area — max ${MAX_AREA_KM2} km².`
      );
      return;
    }

    const bboxKey = store.bbox.join(",");
    if (cachedBboxKey === bboxKey && cachedLayers) {
      await runPipeline(cachedLayers);
      return;
    }

    store.setStatus("fetching");
    try {
      const raw = (await fetchOverpass(
        buildCombinedQuery(store.bbox),
        store.bbox
      )) as OverpassResponse;
      const parsed = parseCombinedResponse(raw);
      cachedLayers = parsed;
      cachedBboxKey = bboxKey;
      await runPipeline(parsed);
    } catch (err) {
      store.setStatus("error", friendlyError(err));
    }
  };

  const handleSliderRegen = () => {
    if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    regenTimerRef.current = setTimeout(() => {
      if (cachedLayers) runPipeline(cachedLayers);
    }, 300);
  };

  const handleExport = async () => {
    if (!store.bbox || store.status !== "ready") return;
    store.setIsExporting(true);
    setExportDone(false);
    try {
      await exportLayersAsZip(store.processed, store.bbox, {
        widthMm: store.widthMm,
        border: {
          enabled: store.borderEnabled,
          thicknessMm: store.borderThicknessMm,
          shape: store.borderShape,
          cornerMarks: store.cornerMarksEnabled,
        },
        visible: store.visible,
      });
      setExportDone(true);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setExportDone(false), 6000);
    } finally {
      store.setIsExporting(false);
    }
  };

  const handleClear = () => {
    store.clearSelection();
    setExportDone(false);
    cachedLayers = null;
    cachedBboxKey = null;
  };

  const area = computeAreaKm2();
  const areaWarning = area !== null && area > MAX_AREA_KM2;
  const areaLarge  = area !== null && area > WARN_AREA_KM2 && !areaWarning;
  const isReady = store.status === "ready";
  const isBusy = store.status === "fetching" || store.status === "processing";

  return (
    <aside className="w-80 bg-white shadow-xl flex flex-col gap-5 p-5 overflow-y-auto border-l border-gray-100 z-10">

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Laser Map Maker</h1>
        <p className="text-xs text-gray-400 mt-0.5">Turn any city into laser-cut SVG layers</p>
      </div>

      {/* ── Workflow progress ── */}
      <div className="flex items-center">
        <WorkflowStep n={1} label="Find location"  done={!!store.bbox} active={!store.bbox} />
        <WorkflowStep n={2} label="Draw area"       done={!!store.bbox} active={!store.bbox} />
        <WorkflowStep n={3} label="Build & export"  done={isReady}      active={!!store.bbox && !isReady} isLast />
      </div>

      {/* ── Selected area info ── */}
      {store.bbox ? (
        <div
          className={`rounded-lg px-3 py-2.5 text-xs space-y-1 border ${
            areaWarning
              ? "bg-red-50 border-red-200"
              : areaLarge
              ? "bg-amber-50 border-amber-200"
              : "bg-gray-50 border-gray-100"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className={`font-semibold ${areaWarning ? "text-red-600" : areaLarge ? "text-amber-700" : "text-gray-700"}`}>
              Area selected
              {area !== null && (
                <span className="font-normal ml-1 tabular-nums">
                  ≈ {area.toFixed(1)} km²
                </span>
              )}
            </p>
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-red-500 text-xs transition-colors ml-2 flex-shrink-0"
              title="Clear selection and start over"
            >
              ✕ Clear
            </button>
          </div>
          {areaWarning && (
            <p className="text-red-500 leading-snug">
              Too large — max {MAX_AREA_KM2} km². Zoom out and draw a smaller rectangle.
            </p>
          )}
          {areaLarge && (
            <p className="text-amber-600 leading-snug">
              Large area — processing may take 30–60 s.
            </p>
          )}
          {area !== null && roadFetchNote(area) && (
            <p className="text-blue-500 leading-snug">
              ℹ︎ {roadFetchNote(area)}
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-400 -mt-2">
          Search for a city above, then draw a rectangle on the map.
        </p>
      )}

      <div className="border-t border-gray-100" />
      <DrawControls mapRef={mapRef} />
      <div className="border-t border-gray-100" />
      <LayerToggles />
      <div className="border-t border-gray-100" />

      <div onChange={handleSliderRegen}>
        <RoadControls />
      </div>

      <div className="border-t border-gray-100" />
      <BorderControls />
      <div className="border-t border-gray-100" />
      <StatusBar />

      {/* ── Action buttons ── */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          onClick={handleGenerate}
          disabled={!store.bbox || areaWarning || isBusy}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {store.status === "fetching"
            ? "Fetching map data…"
            : store.status === "processing"
            ? "Building layers…"
            : isReady
            ? "Rebuild Layers"
            : "Build Layers"}
        </button>

        <button
          onClick={handleExport}
          disabled={!isReady || store.isExporting}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {store.isExporting ? "Preparing download…" : "Download Files"}
        </button>

        {/* ── Export success confirmation ── */}
        {exportDone && (
          <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2.5 text-xs text-green-700 animate-fade-in">
            <svg
              className="w-4 h-4 flex-shrink-0 mt-0.5 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold">Files downloaded!</p>
              <p className="text-green-600 mt-0.5">
                Open <code className="font-mono bg-green-100 px-0.5 rounded">laser-map.zip</code> and import the SVG files into your laser software.
              </p>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-300 text-center">
        Map data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-gray-400 transition-colors"
        >
          OpenStreetMap contributors
        </a>
      </p>
    </aside>
  );
}
