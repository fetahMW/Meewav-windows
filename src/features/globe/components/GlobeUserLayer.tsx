import { useEffect } from "react";
import type { Map } from "maplibre-gl";
import { GLOBE_SOURCE_ID } from "./GlobeClusterLayer";

const POINT_HALO_LAYER_ID = "meewav-globe-point-halos";
const POINT_LAYER_ID = "meewav-globe-points";
const POINT_LABEL_LAYER_ID = "meewav-globe-point-labels";

type GlobeUserLayerProps = {
  map: Map | null;
};

export default function GlobeUserLayer({ map }: GlobeUserLayerProps) {
  useEffect(() => {
    if (!map || !map.isStyleLoaded() || !map.getSource(GLOBE_SOURCE_ID)) return;

    if (!map.getLayer(POINT_HALO_LAYER_ID)) {
      map.addLayer({
        id: POINT_HALO_LAYER_ID,
        type: "circle",
        source: GLOBE_SOURCE_ID,
        filter: ["==", ["get", "kind"], "point"],
        paint: {
          "circle-radius": ["case", ["get", "isOnline"], 18, 15],
          "circle-color": [
            "case",
            ["get", "isOnline"],
            "rgba(126, 76, 255, 0.18)",
            "rgba(126, 76, 255, 0.1)",
          ],
        },
      });
    }

    if (!map.getLayer(POINT_LAYER_ID)) {
      map.addLayer({
        id: POINT_LAYER_ID,
        type: "circle",
        source: GLOBE_SOURCE_ID,
        filter: ["==", ["get", "kind"], "point"],
        paint: {
          "circle-radius": 8,
          "circle-color": [
            "match",
            ["get", "pointType"],
            "studio",
            "#47bfff",
            "event",
            "#ff52d3",
            "room",
            "#d8b4fe",
            "user",
            "#9f9aaa",
            "#794cff",
          ],
          "circle-stroke-color": "rgba(255, 255, 255, 0.92)",
          "circle-stroke-width": 1.4,
        },
      });
    }

    if (!map.getLayer(POINT_LABEL_LAYER_ID)) {
      map.addLayer({
        id: POINT_LABEL_LAYER_ID,
        type: "symbol",
        source: GLOBE_SOURCE_ID,
        filter: ["==", ["get", "kind"], "point"],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.55],
          "text-anchor": "top",
          "text-optional": true,
        },
        paint: {
          "text-color": "rgba(255, 255, 255, 0.92)",
          "text-halo-color": "rgba(8, 5, 18, 0.92)",
          "text-halo-width": 1,
        },
      });
    }
  }, [map]);

  return null;
}
