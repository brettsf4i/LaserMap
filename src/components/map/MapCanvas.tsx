"use client";

import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useAppStore } from "@/lib/store";
import type { BBox } from "@/lib/store/types";

export interface MapCanvasHandle {
  flyTo: (lat: number, lon: number, zoom?: number) => void;
  getMap: () => LeafletMap | null;
  startSquareDraw: () => void;
  startAspectDraw: (widthToHeight: number) => void;
  cancelDraw: () => void;
}

// Physical km per degree constants
const KM_PER_LAT = 110.574;
const KM_PER_LON_BASE = 111.32;

const MapCanvas = forwardRef<MapCanvasHandle>(function MapCanvas(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<any>(null);               // Leaflet library instance
  const drawnItemsRef = useRef<any>(null);       // FeatureGroup for selections
  const activeHandlerRef = useRef<any>(null);    // Currently active draw handler
  const { setBbox } = useAppStore();

  /** Disable and discard any currently-active custom draw handler. */
  function disableActiveHandler() {
    if (activeHandlerRef.current) {
      try {
        activeHandlerRef.current.disable();
      } catch {
        // ignore — handler may already be done
      }
      activeHandlerRef.current = null;
    }
  }

  /**
   * Create a Leaflet.Draw Rectangle handler whose _drawShape is patched to
   * constrain the drawn bounds to a specific physical aspect ratio.
   *
   * widthToHeight = physical_width_km / physical_height_km
   *   → 1.0 produces a perfect square
   *   → 200/150 produces a 4:3 landscape rectangle, etc.
   */
  function createConstrainedHandler(widthToHeight: number): any | null {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return null;

    const handler = new (L as any).Draw.Rectangle(map, {
      shapeOptions: { color: "#3b82f6", weight: 2, fillOpacity: 0.1 },
      showArea: false,
    });

    handler._drawShape = function (latlng: any) {
      const start = this._startLatLng;
      if (!start) return;

      const dLat = Math.abs(latlng.lat - start.lat);
      const dLon = Math.abs(latlng.lng - start.lng);

      if (dLat === 0 && dLon === 0) return;

      const midLat = (start.lat + latlng.lat) / 2;
      const cosLat = Math.cos((midLat * Math.PI) / 180);

      // We want: (newDLon * KM_PER_LON_BASE * cosLat) / (newDLat * KM_PER_LAT) = widthToHeight
      //
      // Option A — fix dLon, derive dLat:
      const newDLatA =
        (dLon * KM_PER_LON_BASE * cosLat) / (widthToHeight * KM_PER_LAT);
      // Option B — fix dLat, derive dLon:
      const newDLonB =
        (dLat * KM_PER_LAT * widthToHeight) / (KM_PER_LON_BASE * cosLat);

      // Pick whichever option gives the larger bounding box (always encloses cursor)
      let newDLat: number, newDLon: number;
      if (newDLatA * dLon >= dLat * newDLonB) {
        newDLat = newDLatA;
        newDLon = dLon;
      } else {
        newDLat = dLat;
        newDLon = newDLonB;
      }

      const dirLat = latlng.lat >= start.lat ? 1 : -1;
      const dirLon = latlng.lng >= start.lng ? 1 : -1;

      const constrained = (L as any).latLng(
        start.lat + dirLat * newDLat,
        start.lng + dirLon * newDLon
      );

      const bounds = new (L as any).LatLngBounds(start, constrained);
      if (this._shape) {
        this._shape.setBounds(bounds);
      } else {
        this._shape = new (L as any).Rectangle(bounds, this.options.shapeOptions);
        this._map.addLayer(this._shape);
      }
    };

    return handler;
  }

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lon, zoom = 13) => {
      mapRef.current?.setView([lat, lon], zoom, { animate: true });
    },
    getMap: () => mapRef.current,

    startSquareDraw: () => {
      disableActiveHandler();
      const handler = createConstrainedHandler(1);
      if (!handler) return;
      handler.enable();
      activeHandlerRef.current = handler;
    },

    startAspectDraw: (widthToHeight: number) => {
      disableActiveHandler();
      const handler = createConstrainedHandler(widthToHeight);
      if (!handler) return;
      handler.enable();
      activeHandlerRef.current = handler;
    },

    cancelDraw: () => {
      disableActiveHandler();
    },
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    let cleanup = false;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet-draw");

      if (cleanup || !containerRef.current) return;

      // Store Leaflet instance so imperative handle methods can use it
      LRef.current = L;

      const map = L.map(containerRef.current, {
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

      // Zoom control — top-right to avoid toolbar clash
      L.control.zoom({ position: "topright" }).addTo(map);

      // Layer that holds completed selections
      const drawnItems = new L.FeatureGroup();
      map.addLayer(drawnItems);
      drawnItemsRef.current = drawnItems;

      // Toolbar: polygon + edit + delete only.
      // Square and custom-rectangle draw modes are handled via the sidebar.
      const drawControl = new (L.Control as any).Draw({
        edit: { featureGroup: drawnItems, remove: true },
        draw: {
          rectangle: false,   // replaced by sidebar controls
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

      // Shared handler for completed shapes (both toolbar polygon and custom handlers)
      map.on((L as any).Draw.Event.CREATED, (e: any) => {
        const layer = e.layer;
        drawnItems.clearLayers();
        drawnItems.addLayer(layer);

        // Custom handler is done — clear the ref
        activeHandlerRef.current = null;

        const bounds = layer.getBounds();
        const bbox: BBox = [
          bounds.getWest(),
          bounds.getSouth(),
          bounds.getEast(),
          bounds.getNorth(),
        ];
        setBbox(bbox);
      });

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

      map.on((L as any).Draw.Event.DELETED, () => {
        useAppStore.getState().clearSelection();
      });

      mapRef.current = map;
    })();

    return () => {
      cleanup = true;
      disableActiveHandler();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="w-full h-full" />;
});

export default MapCanvas;
