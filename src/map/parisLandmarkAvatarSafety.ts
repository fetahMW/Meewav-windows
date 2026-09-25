import {
  applyParisLandmarkAvatarSafetyToFeatureCollection,
  getParisLandmarkSafeAvatarPosition,
} from "../../server/mvt-tile-server/parisLandmarkAvatarSafety.js";

export function applyParisLandmarkSafetyToAvatarGeoJson<T>(featureCollection: T): T {
  return applyParisLandmarkAvatarSafetyToFeatureCollection(featureCollection);
}

export function getParisLandmarkSafeAvatarLngLat(
  lng: number,
  lat: number,
  stableId: unknown,
): [number, number] {
  const safePosition = getParisLandmarkSafeAvatarPosition(lng, lat, stableId);
  return [safePosition.lng, safePosition.lat];
}
