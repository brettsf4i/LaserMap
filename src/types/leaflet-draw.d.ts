// Augment leaflet-draw types for draw events
import type { Layer, LatLngBounds } from "leaflet";

declare module "leaflet" {
  namespace Draw {
    interface Event {
      CREATED: string;
      EDITED: string;
      DELETED: string;
    }
  }

  interface DrawEvents {
    Created: {
      layer: Layer;
      layerType: string;
    };
  }
}

export {};
