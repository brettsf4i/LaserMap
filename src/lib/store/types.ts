import type { Feature, MultiPolygon, MultiLineString, Polygon } from "geojson";
import type { Unit } from "@/lib/units";

export type BBox = [west: number, south: number, east: number, north: number];

export interface ProcessedLayers {
  cutLayer: Feature<MultiPolygon> | null;
  engraveLayer: Feature<MultiLineString> | null;
  topCutLayer: Feature<MultiPolygon> | null;
}

export type LayerStatus =
  | "idle"
  | "fetching"
  | "processing"
  | "ready"
  | "error";

export interface AppStore {
  // Selection
  bbox: BBox | null;
  polygonFeature: Feature<Polygon> | null;
  setBbox: (bbox: BBox) => void;
  setPolygonFeature: (f: Feature<Polygon>) => void;
  clearSelection: () => void;

  // Processing
  status: LayerStatus;
  error: string | null;
  processed: ProcessedLayers;
  setStatus: (status: LayerStatus, error?: string | null) => void;
  setProcessed: (layers: ProcessedLayers) => void;

  // Visibility
  visible: { cut: boolean; engrave: boolean; topCut: boolean };
  toggleVisible: (layer: "cut" | "engrave" | "topCut") => void;

  // Export config
  widthMm: number;
  roadBufferMeters: number;
  isExporting: boolean;
  unit: Unit;
  /** Keys from ROAD_CLASS_DEFS that are currently enabled for the cut layer */
  majorRoadClasses: string[];
  setWidthMm: (mm: number) => void;
  setRoadBuffer: (meters: number) => void;
  setIsExporting: (v: boolean) => void;
  setUnit: (unit: Unit) => void;
  setMajorRoadClasses: (classes: string[]) => void;

  // Border / registration
  borderEnabled: boolean;
  borderThicknessMm: number;
  borderShape: "rectangle" | "circle";
  cornerMarksEnabled: boolean;
  setBorderEnabled: (v: boolean) => void;
  setBorderThicknessMm: (mm: number) => void;
  setBorderShape: (shape: "rectangle" | "circle") => void;
  setCornerMarksEnabled: (v: boolean) => void;
}
