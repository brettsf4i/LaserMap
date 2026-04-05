"use client";

import { useState, useEffect, useRef, type RefObject } from "react";
import { useAppStore } from "@/lib/store";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";

interface Props {
  mapRef: RefObject<MapCanvasHandle | null>;
}

const PRESETS = [
  { label: "1∶1",  w: 1,   h: 1   },
  { label: "4∶3",  w: 4,   h: 3   },
  { label: "3∶2",  w: 3,   h: 2   },
  { label: "16∶9", w: 16,  h: 9   },
  { label: "A4",   w: 210, h: 297 },
  { label: "Letter", w: 17, h: 22 },
];

export default function DrawControls({ mapRef }: Props) {
  const { bbox } = useAppStore();
  const [ratioW, setRatioW] = useState(1);
  const [ratioH, setRatioH] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);

  // Auto-reset when draw:created fires (bbox changes)
  const prevBboxRef = useRef(bbox);
  useEffect(() => {
    if (bbox !== prevBboxRef.current && isDrawing) setIsDrawing(false);
    prevBboxRef.current = bbox;
  }, [bbox, isDrawing]);

  const swap = () => { setRatioW(ratioH); setRatioH(ratioW); };

  const applyPreset = (w: number, h: number) => {
    setRatioW(w);
    setRatioH(h);
  };

  const activePreset = PRESETS.find((p) => p.w === ratioW && p.h === ratioH) ?? null;

  const handleDraw = () => {
    const ratio = ratioW / ratioH;
    if (!isFinite(ratio) || ratio <= 0) return;
    mapRef.current?.startAspectDraw(ratio);
    setIsDrawing(true);
  };

  const handleCancel = () => {
    mapRef.current?.cancelDraw();
    setIsDrawing(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Draw Selection
      </h3>

      {/* ── Aspect ratio heading ── */}
      <p className="text-xs text-gray-400 text-center tracking-wide -mb-1">
        Aspect Ratio
      </p>

      {/* ── Control pill ── */}
      <div className="flex items-stretch h-10 rounded-full border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Swap */}
        <button
          onClick={swap}
          title="Swap width ↔ height"
          className="flex items-center justify-center w-10 shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-200"
        >
          <SwapIcon />
        </button>

        {/* Width */}
        <input
          type="number"
          min={1}
          max={999}
          value={ratioW}
          onChange={(e) => setRatioW(Math.max(1, Math.round(Number(e.target.value))))}
          className="flex-1 min-w-0 text-center text-sm font-semibold text-gray-800 bg-transparent focus:outline-none"
        />

        {/* Linked indicator */}
        <div className="flex items-center justify-center w-9 shrink-0 bg-gray-800 text-white">
          <LinkIcon />
        </div>

        {/* Height */}
        <input
          type="number"
          min={1}
          max={999}
          value={ratioH}
          onChange={(e) => setRatioH(Math.max(1, Math.round(Number(e.target.value))))}
          className="flex-1 min-w-0 text-center text-sm font-semibold text-gray-800 bg-transparent focus:outline-none"
        />

        {/* Flip (same as swap, portrait ↔ landscape) */}
        <button
          onClick={swap}
          title="Flip orientation"
          className="flex items-center justify-center w-10 shrink-0 text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-l border-gray-200"
        >
          <FlipIcon />
        </button>
      </div>

      {/* ── Preset chips ── */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(({ label, w, h }) => (
          <button
            key={label}
            onClick={() => applyPreset(w, h)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium border transition-colors ${
              activePreset?.label === label
                ? "border-blue-400 bg-blue-50 text-blue-600"
                : "border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Draw / Cancel button ── */}
      <button
        onClick={isDrawing ? handleCancel : handleDraw}
        disabled={ratioW <= 0 || ratioH <= 0}
        className={`w-full py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isDrawing
            ? "bg-blue-600 hover:bg-blue-700 text-white"
            : "bg-gray-800 hover:bg-gray-700 text-white"
        }`}
      >
        {isDrawing ? "Drag to draw… (Esc to cancel)" : "Draw on Map"}
      </button>

      <p className="text-xs text-gray-400 -mt-1">
        {isDrawing
          ? "Release the mouse to confirm your selection."
          : "Use the polygon tool on the map for freeform areas."}
      </p>
    </div>
  );
}

// ── Inline SVG icons ───────────────────────────────────────────────

function SwapIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 4.5h11M10 2l3 2.5-3 2.5" />
      <path d="M13 10.5H2M5 8l-3 2.5 3 2.5" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5.5 8.5a3 3 0 004.243 0l1.5-1.5a3 3 0 00-4.243-4.243L6 3.75" />
      <path d="M8.5 5.5a3 3 0 00-4.243 0l-1.5 1.5a3 3 0 004.243 4.243L8 10.25" />
    </svg>
  );
}

function FlipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7.5 2v11M4.5 5L2 7.5l2.5 2.5" />
      <path d="M10.5 5L13 7.5l-2.5 2.5" />
    </svg>
  );
}
