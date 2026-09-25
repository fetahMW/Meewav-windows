import { useEffect, useMemo } from "react";
import type { GeoJSONSource, Map, MapLayerMouseEvent } from "maplibre-gl";
import type { FeatureCollection, Point } from "geojson";
import type { StreetDirection } from "../utils/streetNavigation";

const STREET_ARROW_SOURCE_ID = "meewav-street-mode-arrows";
const STREET_ARROW_HIT_LAYER_ID = "meewav-street-mode-arrow-hit";
const STREET_ARROW_SYMBOL_LAYER_ID = "meewav-street-mode-arrow-symbol";
const STREET_ARROW_IMAGE_ID = "meewav-street-mode-arrow";

type GlobeStreetModeLayerProps = {
  map: Map | null;
  active: boolean;
  directions: StreetDirection[];
  onSelectDirection: (direction: StreetDirection) => void;
};

function toFeatureCollection(active: boolean, directions: StreetDirection[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: active
      ? directions.map((direction) => ({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [direction.longitude, direction.latitude],
          },
          properties: {
            directionId: direction.id,
            directionType: direction.directionType,
            targetNodeId: direction.targetNodeId,
            edgeId: direction.edgeId,
            bearing: direction.bearing,
            rotation: direction.rotation,
            relativeAngle: direction.relativeAngle,
            roadName: direction.roadName || "",
          },
        }))
      : [],
  };
}

function ensureArrowImage(map: Map) {
  if (map.hasImage(STREET_ARROW_IMAGE_ID)) return;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, size, size);
  context.fillStyle = "rgba(245, 241, 255, 0.95)";
  context.strokeStyle = "rgba(11, 8, 20, 0.88)";
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(32, 8);
  context.lineTo(51, 36);
  context.lineTo(40, 36);
  context.lineTo(40, 55);
  context.lineTo(24, 55);
  context.lineTo(24, 36);
  context.lineTo(13, 36);
  context.closePath();
  context.stroke();
  context.fill();

  map.addImage(STREET_ARROW_IMAGE_ID, context.getImageData(0, 0, size, size), { pixelRatio: 2 });
}

export default function GlobeStreetModeLayer({
  map,
  active,
  directions,
  onSelectDirection,
}: GlobeStreetModeLayerProps) {
  const data = useMemo(() => toFeatureCollection(active, directions), [active, directions]);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    ensureArrowImage(map);

    if (!map.getSource(STREET_ARROW_SOURCE_ID)) {
      map.addSource(STREET_ARROW_SOURCE_ID, {
        type: "geojson",
        data,
      });
    }

    if (!map.getLayer(STREET_ARROW_HIT_LAYER_ID)) {
      map.addLayer({
        id: STREET_ARROW_HIT_LAYER_ID,
        type: "circle",
        source: STREET_ARROW_SOURCE_ID,
        paint: {
          "circle-radius": 18,
          "circle-color": "rgba(18, 15, 28, 0.74)",
          "circle-stroke-color": "rgba(255, 255, 255, 0.34)",
          "circle-stroke-width": 1.2,
        },
      });
    }

    if (!map.getLayer(STREET_ARROW_SYMBOL_LAYER_ID)) {
      map.addLayer({
        id: STREET_ARROW_SYMBOL_LAYER_ID,
        type: "symbol",
        source: STREET_ARROW_SOURCE_ID,
        layout: {
          "icon-image": STREET_ARROW_IMAGE_ID,
          "icon-size": 0.55,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-rotation-alignment": "map",
          "icon-pitch-alignment": "map",
          "icon-rotate": ["get", "rotation"],
        },
      });
    }

    const source = map.getSource(STREET_ARROW_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(data);
  }, [data, map]);

  useEffect(() => {
    if (!map || !map.getLayer(STREET_ARROW_HIT_LAYER_ID)) return;

    const handleClick = (event: MapLayerMouseEvent) => {
      const directionId = String(event.features?.[0]?.properties?.directionId || "");
      const direction = directions.find((item) => item.id === directionId);
      if (direction) onSelectDirection(direction);
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = active ? "pointer" : "";
    };
    const unsetPointer = () => {
      map.getCanvas().style.cursor = active ? "grab" : "";
    };

    map.on("click", STREET_ARROW_HIT_LAYER_ID, handleClick);
    map.on("mouseenter", STREET_ARROW_HIT_LAYER_ID, setPointer);
    map.on("mouseleave", STREET_ARROW_HIT_LAYER_ID, unsetPointer);

    return () => {
      map.off("click", STREET_ARROW_HIT_LAYER_ID, handleClick);
      map.off("mouseenter", STREET_ARROW_HIT_LAYER_ID, setPointer);
      map.off("mouseleave", STREET_ARROW_HIT_LAYER_ID, unsetPointer);
    };
  }, [active, directions, map, onSelectDirection]);

  return null;
}
