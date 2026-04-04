"use client";

import { useRef } from "react";
import { useAppStore } from "@/lib/store";
import { buildWaterQuery, buildMinorRoadsQuery, buildMajorRoadsQuery } from "@/lib/overpass/queries";
import {
  parseOverpassToPolygons,
  parseOverpassToLines,
  type OverpassResponse,
} from "@/lib/overpass/parser";
import { runGeometryPipeline } from "@/lib/geometry/pipeline";
import { exportLayersAsZip } from "@/lib/export/zip";
import LayerToggles from "./LayerToggles";
import RoadControls from "./RoadControls";
import SizeControls from "./SizeControls";
import StatusBar from "./StatusBar";
import type { Feature, MultiPolygon, LineString, Polygon } from "geojson";

// Cache raw Overpass responses so slider changes only re-run geometry
const osmCache = {
  water: null as OverpassResponse | null,
  minorRoads: null as OverpassResponse | null,
  majorRoads: null as OverpassResponse | null,
  bbox: null as string | null,
};

export default function ControlPanel() {
  const store = useAppStore();
  const regenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const MAX_AREA_KM2 = 25;

  function computeAreaKm2(): number | null {
    if (!store.bbox) return null;
    const [west, south, east, north] = store.bbox;
    const midLat = (south + north) / 2;
    const cosLat = Math.cos((midLat * Math.PI) / 180);
    return Math.abs(east - west) * 111.32 * cosLat * Math.abs(north - south) * 110.574;
  }

  async function runPipeline(
    water: OverpassResponse,
    minorRoads: OverpassResponse,
    majorRoads: OverpassResponse
  ) {
    if (!store.bbox) return;
    store.setStatus("processing");
    try {
      const layers = await runGeometryPipeline({
        bbox: store.bbox,
        waterFeatures: parseOverpassToPolygons(water) as Feature<Polygon | MultiPolygon>[],
        minorRoadFeatures: parseOverpassToLines(minorRoads) as Feature<LineString>[],
        majorRoadFeatures: parseOverpassToLines(majorRoads) as Feature<LineString>[],
        simplificationTolerance: store.simplificationTolerance,
        roadBufferMeters: store.roadBufferMeters,
      });
      store.setProcessed(layers);
      store.setStatus("ready");
    } catch (err) {
      store.setStatus("error", (err as Error).message);
    }
  }

  const handleGenerate = async () => {
    if (!store.bbox) return;

    const area = computeAreaKm2();
    if (area !== null && area > MAX_AREA_KM2) {
      store.setStatus(
        "error",
        `Area too large (${area.toFixed(1)} km²). Draw a smaller selection (max ${MAX_AREA_KM2} km²).`
      );
      return;
    }

    const bboxKey = store.bbox.join(",");
    const cacheValid = osmCache.bbox === bboxKey && osmCache.water && osmCache.minorRoads && osmCache.majorRoads;

    if (cacheValid) {
      await runPipeline(osmCache.water!, osmCache.minorRoads!, osmCache.majorRoads!);
      return;
    }

    store.setStatus("fetching");

    try {
      const [waterRes, minorRes, majorRes] = await Promise.all([
        fetch("/api/overpass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: buildWaterQuery(store.bbox), bbox: store.bbox }),
        }),
        fetch("/api/overpass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: buildMinorRoadsQuery(store.bbox), bbox: store.bbox }),
        }),
        fetch("/api/overpass", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: buildMajorRoadsQuery(store.bbox), bbox: store.bbox }),
        }),
      ]);

      // Check for errors
      for (const res of [waterRes, minorRes, majorRes]) {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
      }

      const [waterData, minorData, majorData] = await Promise.all([
        waterRes.json(),
        minorRes.json(),
        majorRes.json(),
      ]);

      osmCache.water = waterData;
      osmCache.minorRoads = minorData;
      osmCache.majorRoads = majorData;
      osmCache.bbox = bboxKey;

      await runPipeline(waterData, minorData, majorData);
    } catch (err) {
      store.setStatus("error", (err as Error).message);
    }
  };

  // Debounced regeneration for slider changes
  const handleSliderRegen = () => {
    if (regenTimerRef.current) clearTimeout(regenTimerRef.current);
    regenTimerRef.current = setTimeout(() => {
      if (osmCache.water && osmCache.minorRoads && osmCache.majorRoads) {
        runPipeline(osmCache.water, osmCache.minorRoads, osmCache.majorRoads);
      }
    }, 300);
  };

  const handleExport = async () => {
    if (!store.bbox || store.status !== "ready") return;
    store.setIsExporting(true);
    try {
      await exportLayersAsZip(store.processed, store.bbox, store.widthMm);
    } finally {
      store.setIsExporting(false);
    }
  };

  const area = computeAreaKm2();
  const areaWarning = area !== null && area > MAX_AREA_KM2;

  return (
    <aside className="w-80 bg-white shadow-xl flex flex-col gap-5 p-5 overflow-y-auto border-l border-gray-100 z-10">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Laser Map Maker</h1>
        <p className="text-xs text-gray-400 mt-0.5">
          OSM → SVG layers for laser cutting
        </p>
      </div>

      {/* Selection info */}
      <div className="text-xs">
        {store.bbox ? (
          <div className="space-y-0.5">
            <p className="text-gray-600 font-medium">Area selected</p>
            <p className="text-gray-400 font-mono">
              {store.bbox[0].toFixed(4)}°W → {store.bbox[2].toFixed(4)}°E
            </p>
            <p className="text-gray-400 font-mono">
              {store.bbox[1].toFixed(4)}°S → {store.bbox[3].toFixed(4)}°N
            </p>
            {area !== null && (
              <p className={areaWarning ? "text-red-500 font-medium" : "text-gray-400"}>
                ≈ {area.toFixed(1)} km²{areaWarning ? " — too large!" : ""}
              </p>
            )}
          </div>
        ) : (
          <p className="text-gray-400">
            Use the rectangle or polygon tool on the map to select an area.
          </p>
        )}
      </div>

      <div className="border-t border-gray-100" />

      <LayerToggles />

      <div className="border-t border-gray-100" />

      {/* Road controls with regen on change */}
      <div onChange={handleSliderRegen}>
        <RoadControls />
      </div>

      <div className="border-t border-gray-100" />

      <SizeControls />

      <div className="border-t border-gray-100" />

      <StatusBar />

      {/* Actions */}
      <div className="flex flex-col gap-2 mt-auto">
        <button
          onClick={handleGenerate}
          disabled={
            !store.bbox ||
            areaWarning ||
            store.status === "fetching" ||
            store.status === "processing"
          }
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {store.status === "fetching"
            ? "Fetching OSM data…"
            : store.status === "processing"
            ? "Processing geometry…"
            : "Generate Layers"}
        </button>

        <button
          onClick={handleExport}
          disabled={store.status !== "ready" || store.isExporting}
          className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
        >
          {store.isExporting ? "Creating ZIP…" : "Export ZIP (3 SVG files)"}
        </button>
      </div>

      <p className="text-xs text-gray-300 text-center">
        Data © OpenStreetMap contributors
      </p>
    </aside>
  );
}
