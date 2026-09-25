const DEFAULT_LANDMARK_CITY_VIEW_SCALE = 6;
const LANDMARK_CITY_VIEW_FULL_SCALE_ZOOM = 12.35;
const LANDMARK_CITY_VIEW_NORMAL_SCALE_ZOOM = 13.3;

export function getLandmarkCityViewScaleMultiplier(
  zoom: number,
  cityViewScale = DEFAULT_LANDMARK_CITY_VIEW_SCALE,
) {
  if (!Number.isFinite(zoom)) return 1;
  if (zoom <= LANDMARK_CITY_VIEW_FULL_SCALE_ZOOM) return cityViewScale;
  if (zoom >= LANDMARK_CITY_VIEW_NORMAL_SCALE_ZOOM) return 1;

  const t = (zoom - LANDMARK_CITY_VIEW_FULL_SCALE_ZOOM)
    / (LANDMARK_CITY_VIEW_NORMAL_SCALE_ZOOM - LANDMARK_CITY_VIEW_FULL_SCALE_ZOOM);
  const eased = t * t * (3 - 2 * t);
  return cityViewScale + (1 - cityViewScale) * eased;
}
