import type { Map as MapLibreMap } from "maplibre-gl";
import { areHeroLandmarkLayersDisabled, shouldRenderHeroLandmarkForSelectedZone } from "./heroLandmarkRegistry";

export function shouldRenderLandmarkCustomLayer(
  map: MapLibreMap,
  lngLat: [number, number],
  zoom: number,
  minZoom: number,
  layerId?: string,
) {
  if (areHeroLandmarkLayersDisabled()) return false;
  if (!shouldRenderHeroLandmarkForSelectedZone(map, layerId)) return false;
  if (zoom < minZoom) return false;

  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width || 1;
  const height = canvas.clientHeight || canvas.height || 1;
  const screenPoint = map.project(lngLat);
  const screenPadding = Math.max(width, height) * 0.18 + 180;

  return (
    screenPoint.x >= -screenPadding &&
    screenPoint.x <= width + screenPadding &&
    screenPoint.y >= -screenPadding &&
    screenPoint.y <= height + screenPadding
  );
}
