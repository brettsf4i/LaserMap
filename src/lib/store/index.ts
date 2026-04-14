import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AppStore } from "./types";

export const useAppStore = create<AppStore>()(
  devtools(
    (set) => ({
      // Selection
      bbox: null,
      polygonFeature: null,
      setBbox: (bbox) => set({ bbox }),
      setPolygonFeature: (polygonFeature) => set({ polygonFeature }),
      clearSelection: () =>
        set({ bbox: null, polygonFeature: null, status: "idle" }),

      // Processing
      status: "idle",
      error: null,
      processed: { cutLayer: null, engraveLayer: null, topCutLayer: null },
      setStatus: (status, error = null) => set({ status, error: error ?? null }),
      setProcessed: (processed) => set({ processed }),

      // Visibility
      visible: { cut: true, engrave: true, topCut: true },
      toggleVisible: (layer) =>
        set((s) => ({ visible: { ...s.visible, [layer]: !s.visible[layer] } })),

      // Export config
      widthMm: 200,
      roadBufferMeters: 12,
      isExporting: false,
      unit: "mm",
      // Default: motorway + trunk + primary + secondary (the 4 prominent classes).
      // Tertiary is available but off by default — user can enable per project.
      majorRoadClasses: ["motorway", "trunk", "primary", "secondary"],
      setWidthMm: (widthMm) => set({ widthMm }),
      setRoadBuffer: (roadBufferMeters) => set({ roadBufferMeters }),
      setIsExporting: (isExporting) => set({ isExporting }),
      setUnit: (unit) => set({ unit }),
      setMajorRoadClasses: (majorRoadClasses) => set({ majorRoadClasses }),

      // Border / registration
      borderEnabled: true,
      borderThicknessMm: 12.7, // 0.5 inches default
      borderShape: "rectangle" as const,
      cornerMarksEnabled: false,
      setBorderEnabled: (borderEnabled) => set({ borderEnabled }),
      setBorderThicknessMm: (borderThicknessMm) => set({ borderThicknessMm }),
      setBorderShape: (borderShape) => set({ borderShape }),
      setCornerMarksEnabled: (cornerMarksEnabled) => set({ cornerMarksEnabled }),
    }),
    { name: "LaserMapStore" }
  )
);
