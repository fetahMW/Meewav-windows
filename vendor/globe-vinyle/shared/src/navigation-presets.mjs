import * as T from "three";
import { RADIUS, xyz } from "./geo.mjs";
import { GLOBE_OVERVIEW } from "./saturn-ring.mjs";

export const CHARONNE_ID = "fr-paris-7512004";

// Apply once to the destination, never to the current camera distance.
export function cityArrivalTarget(target) {
  return { ...target, height: Math.max(0.006, target.height * 0.56), pitch: 30 };
}

// Close quarter framing, looking only 15 degrees below the horizon.
// This adjusts the destination only; the main flight controller is unchanged.
export function quarterArrivalTarget(target) {
  return { ...target, height: 0.0046, pitch: 75 };
}

export function countryArrivalTarget(target) {
  return { ...target, height: Math.max(0.006, target.height * 0.72), pitch: 0, bearing: 0, countryFlight: true };
}

// Globe overview uses the reference disc inclination. Country stays north-up.
export function overviewTarget(kind, width, height) {
  const lon = kind === "globe" ? GLOBE_OVERVIEW.lon : 2.4;
  const lat = kind === "globe" ? GLOBE_OVERVIEW.lat : 46.4;
  const up = new T.Vector3(...xyz(lon, lat, 1));
  const east = new T.Vector3(Math.cos(lon * Math.PI / 180), 0, -Math.sin(lon * Math.PI / 180));
  const north = new T.Vector3().crossVectors(up, east);
  const aspect = Math.max(1, width) / Math.max(1, height);
  const tanV = Math.tan(19 * Math.PI / 180) / Math.min(1, aspect);
  const tanH = tanV * aspect;
  if (kind === "globe") {
    // Fit the planet itself tightly, including its existing atmosphere. The
    // reference is almost full viewport height, with a small symmetric margin.
    const padding = Math.max(8, Math.min(16, height * 0.012));
    const vertical = tanV * Math.max(0.45, 1 - 2 * padding / Math.max(1, height));
    const horizontal = tanH * Math.max(0.45, 1 - 2 * padding / Math.max(1, width));
    const distance = RADIUS * 1.007 / Math.sin(Math.atan(Math.min(horizontal, vertical)));
    return { lon, lat, height: Math.min(399, Math.max(0.006, distance - RADIUS)),
      pitch: 0, bearing: GLOBE_OVERVIEW.bearing, globeOverview: true };
  }
  const horizontal = tanH * Math.max(0.45, 1 - 2 * (width <= 760 ? 82 : 112) / width);
  const vertical = tanV * Math.max(0.45, 1 - 2 * 96 / height);
  let distance = RADIUS;
  const include = point => {
    distance = Math.max(distance, point.dot(up) + Math.abs(point.dot(east)) / horizontal,
      point.dot(up) + Math.abs(point.dot(north)) / vertical);
  };
  // Metropolitan France, including Corsica and the height of regional plates.
  for (const x of [-5.2, 2.4, 9.7]) for (const y of [41.3, 46.4, 51.2]) include(new T.Vector3(...xyz(x, y, RADIUS + 0.28)));
  return { lon, lat, height: Math.min(399, Math.max(0.006, (distance - RADIUS) * 1.035)), pitch: 0, bearing: 0 };
}
