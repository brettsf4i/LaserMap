import type { BBox } from "@/lib/store/types";

export interface Projection {
  width: number;
  height: number;
  /** Geographic bounding box [west, south, east, north] — used by layers.ts for inner-clip */
  bbox: BBox;
  project: (lon: number, lat: number) => [number, number];
}

export function createProjection(params: {
  bbox: BBox;
  widthMm: number;
}): Projection {
  const { bbox, widthMm } = params;
  const [west, south, east, north] = bbox;

  const midLat = (south + north) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  const bboxWidthDeg = east - west;
  const bboxHeightDeg = north - south;

  // Aspect ratio corrected for latitude distortion
  const mercatorWidth = bboxWidthDeg * cosLat;
  const aspectRatio = bboxHeightDeg / mercatorWidth;

  const heightMm = widthMm * aspectRatio;

  const scaleX = widthMm / bboxWidthDeg;
  const scaleY = heightMm / bboxHeightDeg;

  const project = (lon: number, lat: number): [number, number] => {
    const x = (lon - west) * scaleX;
    const y = (north - lat) * scaleY; // Y flips: SVG Y grows downward
    return [x, y];
  };

  return { width: widthMm, height: heightMm, bbox, project };
}
