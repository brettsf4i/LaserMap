"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { useAppStore } from "@/lib/store";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";
import { displayToMm, type Unit } from "@/lib/units";

interface Props {
  mapRef: RefObject<MapCanvasHandle | null>;
}

type DrawMode = "idle" | "square" | "rect";

/** Default dimensions per unit */
function defaultDims(unit: Unit): [number, number] {
  return unit === "in" ? [8, 6] : [200, 150];
}

export default function DrawControls({ mapRef }: Props) {
  const { bbox, unit } = useAppStore();

  const [mode, setMode] = useState<DrawMode>("idle");
  const [[rectW, rectH], setDims] = useState<[number, number]>(() =>
    defaultDims(unit)
  );

  // Convert dims when the unit toggle changes
  const prevUnitRef = useRef<Unit>(unit);
  useEffect(() => {
    if (unit === prevUnitRef.current) return;
    prevUnitRef.current = unit;
    // Convert current display values to mm then back to new unit
    const wMm = displayToMm(rectW, unit === "in" ? "mm" : "in");
    const hMm = displayToMm(rectH, unit === "in" ? "mm" : "in");
    const factor = unit === "in" ? 1 / 25.4 : 25.4;
    setDims([
      parseFloat((wMm * (unit === "in" ? 1 / 25.4 : 1)).toFixed(unit === "in" ? 2 : 0)),
      parseFloat((hMm * (unit === "in" ? 1 / 25.4 : 1)).toFixed(unit === "in" ? 2 : 0)),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit]);

  // Detect draw completion: bbox has changed while we were drawing
  const prevBboxRef = useRef(bbox);
  useEffect(() => {
    if (bbox !== prevBboxRef.current && mode !== "idle") {
      setMode("idle");
    }
    prevBboxRef.current = bbox;
  }, [bbox, mode]);

  // ------- handlers -------

  const activateSquare = () => {
    mapRef.current?.startSquareDraw();
    setMode("square");
  };

  const activateRect = () => {
    if (!rectW || !rectH || rectW <= 0 || rectH <= 0) return;
    // ratio is purely about aspect, so unit doesn't matter
    mapRef.current?.startAspectDraw(rectW / rectH);
    setMode("rect");
  };

  const cancel = () => {
    mapRef.current?.cancelDraw();
    setMode("idle");
  };

  const step = unit === "in" ? 0.25 : 5;
  const isDrawing = mode !== "idle";

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Draw Selection
      </h3>

      {/* ── Square ── */}
      <button
        onClick={mode === "square" ? cancel : activateSquare}
        disabled={isDrawing && mode !== "square"}
        className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          mode === "square"
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
        }`}
      >
        <svg viewBox="0 0 16 16" className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
          <rect x="2" y="2" width="12" height="12" rx="0.5" />
        </svg>
        {mode === "square" ? "Click & drag on map… (Esc to cancel)" : "Draw Square (1 : 1)"}
      </button>

      {/* ── Custom Rectangle ── */}
      <div className="rounded-lg border border-gray-200 p-3 space-y-2.5">
        <p className="text-xs font-medium text-gray-600">Custom Rectangle</p>

        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-0.5 block">
              Width ({unit})
            </label>
            <input
              type="number"
              min={1}
              step={step}
              value={rectW}
              onChange={(e) => setDims([Number(e.target.value), rectH])}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-end pb-1 text-gray-400 text-xs font-medium">×</div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-0.5 block">
              Height ({unit})
            </label>
            <input
              type="number"
              min={1}
              step={step}
              value={rectH}
              onChange={(e) => setDims([rectW, Number(e.target.value)])}
              className="w-full border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          onClick={mode === "rect" ? cancel : activateRect}
          disabled={(isDrawing && mode !== "rect") || rectW <= 0 || rectH <= 0}
          className={`w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === "rect"
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
          }`}
        >
          <svg viewBox="0 0 20 14" className="w-4 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
            <rect x="1" y="1" width="18" height="12" rx="0.5" />
          </svg>
          {mode === "rect"
            ? "Click & drag on map… (Esc to cancel)"
            : `Draw ${rectW} × ${rectH} ${unit}`}
        </button>
      </div>

      {/* Tip */}
      <p className="text-xs text-gray-400 -mt-1">
        {isDrawing
          ? "Drag to size your selection, then release."
          : "Use the polygon tool in the map toolbar for freeform selections."}
      </p>
    </div>
  );
}
