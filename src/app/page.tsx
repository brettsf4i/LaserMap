"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import GeocoderSearch from "@/components/map/GeocoderSearch";
import LayerPreview from "@/components/map/LayerPreview";
import ControlPanel from "@/components/controls/ControlPanel";
import type { MapCanvasHandle } from "@/components/map/MapCanvas";

// Leaflet requires browser APIs — must disable SSR
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
      Loading map…
    </div>
  ),
});

export default function Home() {
  const mapCanvasRef = useRef<MapCanvasHandle>(null);

  return (
    <main className="flex h-screen w-screen overflow-hidden">
      {/* Map area */}
      <div className="flex-1 relative">
        <MapCanvas ref={mapCanvasRef} />
        <GeocoderSearch mapRef={mapCanvasRef} />
        <LayerPreview mapCanvasRef={mapCanvasRef} />
      </div>

      {/* Control sidebar */}
      <ControlPanel mapRef={mapCanvasRef} />
    </main>
  );
}
