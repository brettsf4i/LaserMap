"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useAppStore } from "@/lib/store";
import type { BBox } from "@/lib/store/types";

export interface MapCanvasHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  getMap: () => LeafletMap | null;
}

const MapCanvas = forwardRef<MapCanvasHandle>(function MapCanvas(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const { setBbox } = useAppStore();

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom = 13) => {
      mapRef.current?.setView([lat, lon], zoom, { animate: true });
    },
    getMap: () => mapRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Dynamically import Leaflet (browser-only)
    let map: LeafletMap;
    let cleanup = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet-draw");

      if (cleanup || !containerRef.current) return;

      map = L.map(containerRef.current, {
        center: [40.7128, -74.006],
        zoom: 12,
        zoomControl: false,
      });

      // OSM tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Zoom control top-right
      L.control.zoom({ position: "topright" }).addTo(map);

      // Draw control
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);

      const drawControl = new (L.Control as any).Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
          rectangle: {
            shapeOptions: { color: "#3b82f6", weight: 2, fillOpacity: 0.1 },
          },
          polygon: {
            allowIntersection: false,
            shapeOptions: { color: "#3b82f6", weight: 2, fillOpacity: 0.1 },
          },
          circle: false,
          circlemarker: false,
          marker: false,
          polyline: false,
        },
      });
      map.addControl(drawControl);

      // Handle draw:created
      map.on((L as any).Draw.Event.CREATED, (e: any) => {
        const layer = e.layer;
        // Remove previous selection
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);

        const bounds = layer.getBounds();
        const bbox: BBox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];
        setBbox(bbox);
      });

      // Handle edit
      map.on((L as any).Draw.Event.EDITED, (e: any) => {
        e.layers.eachLayer((layer: any) => {
          const bounds = layer.getBounds();
          const bbox: BBox = [
            bounds.getWest(),
            bounds.getSouth(),
            bounds.getEast(),
            bounds.getNorth(),
          ];
          setBbox(bbox);
        });
      });

      // Handle delete
      map.on((L as any).Draw.Event.DELETED, () => {
        useAppStore.getState().clearSelection();
      });

      mapRef.current = map;
    })();

    return () => {
      cleanup = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" />;
});

export default MapCanvas;
