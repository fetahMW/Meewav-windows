import { useEffect } from "react";
import type { GeoJSONSource, Map } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { GlobeItem } from "../types/globe.types";

export const GLOBE_SOURCE_ID = "meewav-globe-items";
const CLUSTER_LAYER_ID = "meewav-globe-clusters";
const CLUSTER_COUNT_LAYER_ID = "meewav-globe-cluster-counts";

export function toGlobeFeatureCollection(items: GlobeItem[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: items.map((item) => ({
      type: "Feature",
      id: item.id,
      geometry: {
        type: "Point",
        coordinates: [item.longitude, item.latitude],
      },
      properties: item.type === "cluster"
        ? {
            id: item.id,
            kind: "cluster",
            count: item.count,
            avatarPreviewUrls: JSON.stringify(item.avatarPreviewUrls || []),
          }
        : {
            id: item.id,
            kind: "point",
            pointType: item.type,
            name: item.name,
            avatarUrl: item.avatarUrl,
            city: item.city || "",
            role: item.role || "",
            isOnline: Boolean(item.isOnline),
            isLive: Boolean(item.isLive),
          },
    })),
  };
}

type GlobeClusterLayerProps = {
  map: Map | null;
  data: FeatureCollection<Point>;
};

export default function GlobeClusterLayer({ map, data }: GlobeClusterLayerProps) {
  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;

    if (!map.getSource(GLOBE_SOURCE_ID)) {
      map.addSource(GLOBE_SOURCE_ID, {
        type: "geojson",
        data,
      });
    }

    if (!map.getLayer(CLUSTER_LAYER_ID)) {
      map.addLayer({
        id: CLUSTER_LAYER_ID,
        type: "circle",
        source: GLOBE_SOURCE_ID,
        filter: ["==", ["get", "kind"], "cluster"],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["get", "count"],
            8,
            24,
            30,
            34,
            80,
            46,
          ],
          "circle-color": "rgba(126, 76, 255, 0.42)",
          "circle-stroke-color": "rgba(216, 180, 254, 0.88)",
          "circle-stroke-width": 1.4,
        },
      });
    }

    if (!map.getLayer(CLUSTER_COUNT_LAYER_ID)) {
      map.addLayer({
        id: CLUSTER_COUNT_LAYER_ID,
        type: "symbol",
        source: GLOBE_SOURCE_ID,
        filter: ["==", ["get", "kind"], "cluster"],
        layout: {
          "text-field": ["to-string", ["get", "count"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 14,
          "text-allow-overlap": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "rgba(45, 22, 91, 0.95)",
          "text-halo-width": 1.2,
        },
      });
    }

    const source = map.getSource(GLOBE_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data, map]);

  return null;
}
