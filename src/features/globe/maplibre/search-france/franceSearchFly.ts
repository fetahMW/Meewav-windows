import type { PremiumFlyTarget } from "../navigation/premiumFly";
import type { FranceSearchResult } from "./franceSearchTypes";

const IN_CITY_ARRIVAL_PITCH = 60;

export function getFranceDefaultZoom(result: FranceSearchResult) {
  if (result.type === "region") return result.zoom ?? 8;
  if (result.type === "department") return 9.8;
  if (result.type === "district") return Math.max(result.zoom ?? 15.7, 15.7);

  if (result.type === "city" || result.type === "commune") {
    return Math.max(result.zoom ?? 15.35, 15.2);
  }

  if (typeof result.zoom === "number") return result.zoom;

  return 15.4;
}

export function getArrivalBearing(result: FranceSearchResult) {
  if (typeof result.bearing === "number") return result.bearing;

  if (result.type === "region" || result.type === "department") {
    return result.center[0] >= 4 ? 35 : -25;
  }

  return result.center[0] >= 5 ? 125 : result.center[0] <= -1 ? -35 : 40;
}

export function getFranceDefaultPitch(result: FranceSearchResult) {
  if (result.type === "region") return 8;
  if (result.type === "department") return 18;
  if (result.type === "city" || result.type === "commune" || result.type === "district") {
    return IN_CITY_ARRIVAL_PITCH;
  }
  if (typeof result.pitch === "number") return result.pitch;

  return IN_CITY_ARRIVAL_PITCH;
}

export function createFranceSearchFlyTarget(result: FranceSearchResult): PremiumFlyTarget {
  return {
    name: result.id,
    center: result.center,
    zoom: getFranceDefaultZoom(result),
    pitch: getFranceDefaultPitch(result),
    bearing: getArrivalBearing(result),
    speed: result.speed ?? 1.2,
  };
}
