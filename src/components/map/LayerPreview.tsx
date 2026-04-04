"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { GeoJSON as LeafletGeoJSON } from "leaflet";
import { useAppStore } from "@/lib/store";
import type { MapCanvasHandle } from "./MapCanvas";

interface Props {
  mapCanvasRef: RefObject<MapCanvasHandle | null>;
}

const EMPTY_FC = {
  type: "FeatureCollection" as const,
  features: [],
};

export default function LayerPreview({ mapCanvasRef }: Props) {
  const { processed, visible } = useAppStore();

  const cutLayerRef = useRef<LeafletGeoJSON | null>(null);
  const engraveLayerRef = useRef<LeafletGeoJSON | null>(null);
  const topCutLayerRef = useRef<LeafletGeoJSON | null>(null);
  const initializedRef = useRef(false);

  // Lazy-initialize GeoJSON layers the first time we have a map
  const ensureInitialized = async () => {
    if (initializedRef.current) return;
    const map = mapCanvasRef.current?.getMap();
    if (!map) return;

    const L = (await import("leaflet")).default;

    cutLayerRef.current = L.geoJSON(EMPTY_FC, {
      style: { color: "#3b82f6", fillColor: "#93c5fd", fillOpacity: 0.4, weight: 1 },
    }).addTo(map);

    engraveLayerRef.current = L.geoJSON(EMPTY_FC, {
      style: { color: "#6b7280", weight: 1.5, fillOpacity: 0 },
    }).addTo(map);

    topCutLayerRef.current = L.geoJSON(EMPTY_FC, {
      style: { color: "#f97316", fillColor: "#fdba74", fillOpacity: 0.5, weight: 1 },
    }).addTo(map);

    initializedRef.current = true;
  };

  // Update data when processed layers change
  useEffect(() => {
    const update = async (
      layerRef: React.MutableRefObject<LeafletGeoJSON | null>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: any
    ) => {
      await ensureInitialized();
      if (!layerRef.current) return;
      layerRef.current.clearLayers();
      if (data) layerRef.current.addData(data);
    };

    update(cutLayerRef, processed.cutLayer);
    update(engraveLayerRef, processed.engraveLayer);
    update(topCutLayerRef, processed.topCutLayer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processed]);

  // Toggle visibility
  useEffect(() => {
    const map = mapCanvasRef.current?.getMap();
    if (!map) return;

    const toggle = (
      layerRef: React.MutableRefObject<LeafletGeoJSON | null>,
      show: boolean
    ) => {
      if (!layerRef.current) return;
      if (show) {
        if (!map.hasLayer(layerRef.current)) map.addLayer(layerRef.current);
      } else {
        if (map.hasLayer(layerRef.current)) map.removeLayer(layerRef.current);
      }
    };

    toggle(cutLayerRef, visible.cut);
    toggle(engraveLayerRef, visible.engrave);
    toggle(topCutLayerRef, visible.topCut);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  return null;
}
