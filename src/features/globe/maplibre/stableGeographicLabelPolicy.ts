export const FRANCE_REGIONAL_LABEL_MAX_ZOOM = 11.45;
export const FRANCE_NATIONAL_LABEL_MIN_ZOOM = FRANCE_REGIONAL_LABEL_MAX_ZOOM;
export const FRANCE_NATIONAL_LABEL_MAX_ZOOM = 13.45;

export const PARIS_PRODUCT_LABEL_IDS_OWNED_BY_OFFICIAL_ZONES = new Set<string>([
  "auteuil",
  "batignolles",
  "belleville",
  "bercy",
  "champs-elysees",
  "charonne",
  "grenelle",
  "invalides",
  "la-villette",
  "les-halles",
  "madeleine",
  "maison-blanche",
  "monceau",
  "montparnasse",
  "palais-royal",
  "picpus",
  "plaisance",
  "saint-germain",
  "saint-lambert",
  "ternes",
] as const);

export type FranceGeographicLabelAuthority =
  | "openfreemap"
  | "region-hubs"
  | "national-communes"
  | "local-product";

export function resolveFranceGeographicLabelAuthority({
  hasRegionHubFocus,
  zoom,
}: {
  hasRegionHubFocus: boolean;
  zoom: number;
}): FranceGeographicLabelAuthority {
  if (zoom >= FRANCE_NATIONAL_LABEL_MAX_ZOOM) return "local-product";
  if (zoom >= FRANCE_NATIONAL_LABEL_MIN_ZOOM) return "national-communes";
  if (hasRegionHubFocus) return "region-hubs";
  return "openfreemap";
}

export function shouldShowOpenFreeMapPlaceLabels(options: {
  hasRegionHubFocus: boolean;
  zoom: number;
}) {
  return resolveFranceGeographicLabelAuthority(options) === "openfreemap";
}

type StablePointLabelAnchor = "center" | "left" | "right" | "top" | "bottom";

export function createStablePointLabelLayout({
  anchor = "center",
  justify = anchor === "left" ? "left" : anchor === "right" ? "right" : "center",
}: {
  anchor?: StablePointLabelAnchor;
  justify?: "auto" | "center" | "left" | "right";
} = {}) {
  return {
    "symbol-placement": "point",
    "symbol-z-order": "source",
    "text-anchor": anchor,
    "text-justify": justify,
    "text-pitch-alignment": "viewport",
    "text-rotation-alignment": "viewport",
    // The catalogue is decluttered deterministically before setData. Asking
    // MapLibre to solve the same collisions again would make labels pop or
    // change anchor whenever bearing/pitch changes.
    "text-allow-overlap": true,
    "text-ignore-placement": true,
    "text-optional": false,
  } as const;
}

export type StableLabelCameraSnapshot = {
  center: readonly [number, number];
  zoom: number;
};

export type StableLabelRefreshReason =
  | "initial"
  | "moveend"
  | "zoomend"
  | "rotateend"
  | "idle"
  | "style.load";

const CAMERA_CENTER_EPSILON_DEGREES = 1e-5;
const CAMERA_ZOOM_EPSILON = 1e-3;

export function shouldRefreshStableLabelSource(
  previous: StableLabelCameraSnapshot | null,
  next: StableLabelCameraSnapshot,
  reason: StableLabelRefreshReason,
) {
  if (!previous || reason === "initial" || reason === "style.load") return true;
  if (reason === "rotateend" || reason === "idle") return false;

  const centerChanged = Math.abs(previous.center[0] - next.center[0]) > CAMERA_CENTER_EPSILON_DEGREES
    || Math.abs(previous.center[1] - next.center[1]) > CAMERA_CENTER_EPSILON_DEGREES;
  const zoomChanged = Math.abs(previous.zoom - next.zoom) > CAMERA_ZOOM_EPSILON;
  return centerChanged || zoomChanged;
}

type StablePointFeature = {
  id?: string | number;
  geometry?: {
    coordinates?: readonly number[];
    type?: string;
  } | null;
  properties?: Record<string, unknown> | null;
};

function getStableFeatureId(feature: StablePointFeature) {
  const id = feature.id ?? feature.properties?.id ?? feature.properties?.zoneId;
  return id === undefined || id === null ? "" : String(id);
}

function getStableFeaturePriority(feature: StablePointFeature) {
  const level = String(feature.properties?.pointLevel ?? "");
  const levelPriority = level === "major" ? 3 : level === "secondary" ? 2 : 1;
  const importance = Number(feature.properties?.importance ?? 0);
  const population = Number(feature.properties?.population ?? 0);
  const rank = Number(feature.properties?.rank ?? feature.properties?.colorIndex ?? 99);
  return {
    levelPriority,
    importance: Number.isFinite(importance) ? importance : 0,
    population: Number.isFinite(population) ? population : 0,
    rank: Number.isFinite(rank) ? rank : 99,
  };
}

function compareStablePointFeatures(first: StablePointFeature, second: StablePointFeature) {
  const a = getStableFeaturePriority(first);
  const b = getStableFeaturePriority(second);
  return b.levelPriority - a.levelPriority
    || b.importance - a.importance
    || b.population - a.population
    || a.rank - b.rank
    || getStableFeatureId(first).localeCompare(getStableFeatureId(second));
}

function lngLatToWorldPoint(longitude: number, latitude: number) {
  const clampedLatitude = Math.max(-85.051129, Math.min(85.051129, latitude));
  const latitudeRadians = clampedLatitude * Math.PI / 180;
  return {
    x: (longitude + 180) / 360,
    y: (1 - Math.log(Math.tan(latitudeRadians) + 1 / Math.cos(latitudeRadians)) / Math.PI) / 2,
  };
}

export function getStableLabelSeparationPixels(zoom: number) {
  const normalizedZoom = Math.max(0, Math.min(1, (zoom - FRANCE_NATIONAL_LABEL_MIN_ZOOM) / 2));
  return 142 - normalizedZoom * 28;
}

/**
 * Select labels in world coordinates, never screen coordinates. Bearing and
 * pitch therefore cannot change the chosen set. All features remain available
 * to the dot/hitbox layers; only the symbol layer consumes the selected IDs.
 */
export function selectStablePointLabelIds(
  features: readonly StablePointFeature[],
  zoom: number,
  separationPixels = getStableLabelSeparationPixels(zoom),
) {
  const worldSize = 512 * 2 ** Math.max(0, zoom);
  const separationWorld = Math.max(1, separationPixels) / worldSize;
  const selectedIds = new Set<string>();
  const occupiedCells = new Map<string, Array<{ x: number; y: number }>>();
  const candidates = [...features].sort(compareStablePointFeatures);

  for (const feature of candidates) {
    const id = getStableFeatureId(feature);
    const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    const longitude = Number(coordinates?.[0]);
    const latitude = Number(coordinates?.[1]);
    if (!id || !Number.isFinite(longitude) || !Number.isFinite(latitude)) continue;

    const point = lngLatToWorldPoint(longitude, latitude);
    const cellX = Math.floor(point.x / separationWorld);
    const cellY = Math.floor(point.y / separationWorld);
    let collides = false;

    for (let x = cellX - 1; x <= cellX + 1 && !collides; x += 1) {
      for (let y = cellY - 1; y <= cellY + 1 && !collides; y += 1) {
        const neighbours = occupiedCells.get(`${x}:${y}`) ?? [];
        collides = neighbours.some((neighbour) => (
          Math.hypot(point.x - neighbour.x, point.y - neighbour.y) < separationWorld
        ));
      }
    }

    if (collides) continue;
    selectedIds.add(id);
    const cellKey = `${cellX}:${cellY}`;
    const occupants = occupiedCells.get(cellKey) ?? [];
    occupants.push(point);
    occupiedCells.set(cellKey, occupants);
  }

  return selectedIds;
}
