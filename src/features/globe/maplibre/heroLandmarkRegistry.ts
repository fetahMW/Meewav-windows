import type { Map as MapLibreMap } from "maplibre-gl";

export const PARIS_HERO_LANDMARK_LAYER_IDS = [
  "eiffel-tower-glb-landmark",
  "notre-dame-glb-landmark",
  "montparnasse-tower-glb-landmark",
] as const;

export const HERO_LANDMARK_LAYER_IDS = [
  ...PARIS_HERO_LANDMARK_LAYER_IDS,
  "stade-de-france-glb-landmark",
  "saint-claude-bonneville-glb-landmark",
] as const;

export const RETIRED_PARIS_HERO_LANDMARK_LAYER_IDS = [
  "invalides-glb-landmark",
  "louvre-pyramid-glb-landmark",
  "arc-triomphe-glb-landmark",
  "obelisk-louxor-glb-landmark",
  "sacre-coeur-glb-landmark",
  "palais-garnier-glb-landmark",
  "pantheon-glb-landmark",
] as const;

export type HeroLandmarkLayerId = typeof HERO_LANDMARK_LAYER_IDS[number];

export const HERO_LANDMARK_CITY_OVERVIEW_MAX_ZOOM = 13.25;

const HERO_LANDMARK_ZONE_IDS: Partial<Record<HeroLandmarkLayerId, readonly string[]>> = {
  "eiffel-tower-glb-landmark": ["paris_07e_gros_caillou"],
  "notre-dame-glb-landmark": ["paris_04e_notre_dame"],
  "stade-de-france-glb-landmark": [
    "saint_denis_stade_de_france",
    "saint_denis_stade",
    "grand_paris_saint_denis_stade_de_france",
    "grand_paris_saint_denis_stade",
    "grand_paris_commune_93066",
  ],
  "montparnasse-tower-glb-landmark": ["paris_15e_necker"],
  "saint-claude-bonneville-glb-landmark": ["commune-39478", "saint_claude_jura"],
};

export function areHeroLandmarkLayersDisabled() {
  return typeof window !== "undefined" && (window as any).__MEEWAV_DISABLE_HERO_GLB_LANDMARKS__ === true;
}

function areHeroLandmarkLayersPreloading() {
  return typeof window !== "undefined" && (window as any).__MEEWAV_PRELOAD_HERO_GLB_LANDMARKS__ === true;
}

export function shouldRenderHeroLandmarkForSelectedZone(map: MapLibreMap, layerId?: string) {
  if (!layerId || typeof window === "undefined") return true;

  // Paris deliberately exposes only its three approved landmarks in the city
  // overview. Non-Paris landmarks remain available solely for their own city.
  if (
    map.getZoom() <= HERO_LANDMARK_CITY_OVERVIEW_MAX_ZOOM
    && PARIS_HERO_LANDMARK_LAYER_IDS.includes(
      layerId as typeof PARIS_HERO_LANDMARK_LAYER_IDS[number],
    )
  ) return true;

  const selectedDebug = (window as any).__MEEWAV_SELECTED_ZONE_EXTRUSION__;
  const selectedZoneId = typeof selectedDebug?.selectedZoneId === "string"
    ? selectedDebug.selectedZoneId
    : null;
  const allowedZoneIds = HERO_LANDMARK_ZONE_IDS[layerId as HeroLandmarkLayerId] ?? [];
  if (selectedZoneId) {
    if (layerId === "stade-de-france-glb-landmark" && isStadeDeFranceZoneId(selectedZoneId)) {
      return true;
    }
    return allowedZoneIds.includes(selectedZoneId);
  }

  const flyTargetName = (window as any).__MEEWAV_PREMIUM_FLY_TARGET__?.name;
  return typeof flyTargetName === "string" && allowedZoneIds.includes(flyTargetName);
}

function isStadeDeFranceZoneId(zoneId: string) {
  const normalized = zoneId
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  return (
    normalized === "grand_paris_commune_93066" ||
    normalized.startsWith("saint_denis_") ||
    normalized.startsWith("grand_paris_saint_denis_")
  );
}

export function removeHeroLandmarkLayers(map: MapLibreMap) {
  for (const layerId of [...HERO_LANDMARK_LAYER_IDS, ...RETIRED_PARIS_HERO_LANDMARK_LAYER_IDS]) {
    if (!map.getLayer(layerId)) continue;

    try {
      map.removeLayer(layerId);
    } catch {
      // Ignore transient style states; the next style pass retries.
    }
  }
}

export function removeRetiredParisHeroLandmarkLayers(map: MapLibreMap) {
  for (const layerId of RETIRED_PARIS_HERO_LANDMARK_LAYER_IDS) {
    if (!map.getLayer(layerId)) continue;

    try {
      map.removeLayer(layerId);
    } catch {
      // Ignore transient style states; the next style pass retries.
    }
  }
}

export function shouldSkipHeroLandmarkLayer(map: MapLibreMap, layerId: string) {
  const disabled = areHeroLandmarkLayersDisabled();
  // Keep an already decoded landmark resident while its rendering is disabled.
  // The custom layer render guard still returns before issuing any Three draw.
  // During the one-time hidden preload, decode only the three Paris landmarks;
  // city-specific assets such as Saint-Denis and Saint-Claude load on demand.
  if (disabled) {
    if (!areHeroLandmarkLayersPreloading()) return true;
    return !PARIS_HERO_LANDMARK_LAYER_IDS.includes(
      layerId as typeof PARIS_HERO_LANDMARK_LAYER_IDS[number],
    );
  }
  if (!disabled && shouldRenderHeroLandmarkForSelectedZone(map, layerId)) return false;
  return !shouldRenderHeroLandmarkForSelectedZone(map, layerId);
}
