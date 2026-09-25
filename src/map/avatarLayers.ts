import type { Map as MapLibreMap } from "maplibre-gl";
import {
  AVATAR_GROUND_REPERE_INNER_RADIUS,
  AVATAR_GROUND_REPERE_OUTER_RADIUS,
  AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
  AVATAR_GROUND_REPERE_PITCH_SCALE,
  AVATAR_VISIBLE_MIN_ZOOM,
  HOST_AVATAR_SIZE_MULTIPLIER,
  MVT_STANDARD_AVATAR_ICON_SIZE,
} from "./avatarVisualContract";
import { isMapMechanicsOnlyEnabled } from "../features/globe/mapMechanics/flyMechanicsReference";
import {
  areAvatarsDisabledByDiag,
  getAvatarDiagCapabilities,
} from "./avatarDiag";
import {
  deferUntilCameraIdle,
  isMeewavCameraBusy,
} from "../features/globe/perf/cameraTransitionGate";
import { perfWarn } from "../features/globe/perf/perfFlags";
import { applyParisLandmarkSafetyToAvatarGeoJson } from "./parisLandmarkAvatarSafety";
import { getRuntimeApiUrl } from "../lib/runtimeApiUrl";
import {
  PROFILE_ICON_BASE_PATH as AVATAR_BASE_PATH,
  PROFILE_ICON_FILES as AVATAR_MAP,
} from "../components/shared/avatar/profileIconAssets";

export {
  applyParisLandmarkSafetyToAvatarGeoJson,
  getParisLandmarkSafeAvatarLngLat,
} from "./parisLandmarkAvatarSafety";
export { getProfileIconImageUrl } from "../components/shared/avatar/profileIconAssets";

const AVATAR_SOURCE_ID = "meewav-avatars";
const CLUSTERS_LAYER_ID = "meewav-avatar-clusters";
const CLUSTER_COUNT_LAYER_ID = "meewav-avatar-cluster-count";
const AVATAR_POINTS_LAYER_ID = "meewav-avatar-points-normal";
const AVATAR_POINTS_SELECTED_LAYER_ID = "meewav-avatar-points-selected";
const AVATAR_NAMES_LAYER_ID = "artist-names-layer";
export const AVATAR_VISIBLE_LABELS_SOURCE_ID = "avatars-labels-source";
export const AVATAR_VISIBLE_LABELS_LAYER_ID = "avatar-labels-layer";
export const AVATAR_PREPROFILE_LABEL_HIDDEN_STATE = "preprofileLabelHidden";
export type AvatarLabelMode = "all" | "collision";
export const AVATAR_LABEL_MODE: AvatarLabelMode =
  import.meta.env.VITE_AVATAR_LABEL_MODE === "collision" ? "collision" : "all";

export function getAvatarLabelTextOpacityExpression(mode: AvatarLabelMode = AVATAR_LABEL_MODE) {
  const visibleOpacity = mode === "collision"
    ? 1
    : ["to-number", ["coalesce", ["get", "labelOpacity"], 1]];

  return [
    "case",
    ["boolean", ["feature-state", AVATAR_PREPROFILE_LABEL_HIDDEN_STATE], false],
    0,
    visibleOpacity,
  ];
}
const AVATAR_HOVER_SOURCE_ID = "artist-hover-avatar-source";
const AVATAR_HOVER_POINTS_LAYER_ID = "artist-hover-avatar-layer";
const AVATAR_HOVER_NAME_LAYER_ID = "artist-hover-name-layer";
const AVATAR_HOVER_VERTICAL_OFFSET_PX = 60;
const CURRENT_USER_AURA_LAYER_ID = "meewav-avatar-current-user-aura";
const CURRENT_USER_AURA_INNER_LAYER_ID = "meewav-avatar-current-user-aura-inner";
const AVATAR_POINTS_HIT_LAYER_ID = "artist-hit-layer";
const AVATAR_POINTS_LEGACY_HIT_LAYER_ID = "meewav-avatar-points-hit";
const ENABLE_PACK5_AVATAR_LAYER = false;
const AVATAR_ICON_SIZE_MULTIPLIER = 3;
const CHARONNE_STRESS_MVT_BUFFER = 128;
const CHARONNE_STRESS_AVATAR_ICON_SIZE = MVT_STANDARD_AVATAR_ICON_SIZE;
const ENABLE_CHARONNE_ARTIST_ICONS_BY_DEFAULT = false;
const AVATAR_DEFAULT_ICON_ID = "artist-avatar-default";
const AVATAR_DIAG_SHARED_ICON_ID = "avatar_4";
// Bump this identifier whenever the deterministic/local catalogue layout
// changes. MapLibre otherwise keeps a previously valid (but empty) vector
// tile in the browser cache after the avatar service has recovered.
const AVATAR_TILE_CATALOG_VERSION = "2026-08-08-polygon-contained-zones-v7";
const CONSULTED_AVATAR_ICON_SUFFIX = "-consulted";
const CONSULTED_AVATAR_OPACITY = 0.5;
export { AVATAR_VISIBLE_MIN_ZOOM } from "./avatarVisualContract";
const AVATAR_WATCHDOG_VISIBLE_ZOOM = 15.8;
const avatarWatchdogTimers = new WeakMap<MapLibreMap, number>();

function isAvatarDebugEnabled() {
  return typeof window !== "undefined" && (window as any).__MEEWAV_AVATAR_DEBUG__ === true;
}

function avatarDebugLog(...args: unknown[]) {
  if (isAvatarDebugEnabled()) console.log(...args);
}

export const ENABLE_HORIZON_IMPOSTOR_LAYER = true;
export const HORIZON_IMPOSTOR_SOURCE_ID = "meewav-horizon-impostors";
export const HORIZON_IMPOSTOR_LAYER_ID = "meewav-horizon-impostor-points";


export type MeewavVisualTestMode = "current" | "social_stable" | "depth_soft";

if (typeof window !== "undefined") {
  if (!(window as any).__MEEWAV_VISUAL_TEST_MODE__) {
    (window as any).__MEEWAV_VISUAL_TEST_MODE__ = "social_stable";
  }
}

export function getVisualTestMode(): MeewavVisualTestMode {
  if (typeof window !== "undefined" && (window as any).__MEEWAV_VISUAL_TEST_MODE__) {
    return (window as any).__MEEWAV_VISUAL_TEST_MODE__;
  }
  return "social_stable";
}

// Configuration de basculement d'architecture via variables d'environnement Vite :
export const USE_VECTOR_TILE_SERVER = import.meta.env.VITE_USE_VECTOR_TILE_SERVER !== "false";
export const VECTOR_TILE_URL = getRuntimeApiUrl(
  import.meta.env.VITE_MVT_TILE_URL,
  "/musicians_clustered/{z}/{x}/{y}",
);
// Shared by the native wheel gesture and the click-wheel continuous zoom.
// Keep the legacy export as an alias because avatar runtime guards import it.
export const isContinuousZoomingRef = { current: false };
export const isWheelZoomingRef = isContinuousZoomingRef;
export type AvatarSourceMode = "env" | "mvt" | "geojson";

export function areAvatarsDisabledForDiag(): boolean {
  if (typeof window === "undefined") return false;
  return areAvatarsDisabledByDiag();
}

function getRuntimeVectorTileUrl(): string {
  if (typeof window === "undefined") return VECTOR_TILE_URL;

  const params = new URLSearchParams();
  params.set("catalog", AVATAR_TILE_CATALOG_VERSION);
  if (isCharonneAvatarStressEnabled() || getAvatarDiagCapabilities().forceMvt) {
    params.set("stress", "charonne");
  }

  const avatarDiag = getAvatarDiagCapabilities();
  if (avatarDiag.featureLimit) {
    params.set("limit", String(avatarDiag.featureLimit));
    params.set("avatarDiag", avatarDiag.stage);
  }

  const query = params.toString();
  if (query) {
    const separator = VECTOR_TILE_URL.includes("?") ? "&" : "?";
    return `${VECTOR_TILE_URL}${separator}${query}`;
  }

  return VECTOR_TILE_URL;
}

export function isCharonneAvatarStressEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const mode = new URLSearchParams(window.location.search).get("avatarStress");
  if (mode === "off" || mode === "0") return false;
  return ENABLE_CHARONNE_ARTIST_ICONS_BY_DEFAULT || mode === "charonne";
}

function isAvatarPipelineSuppressed(): boolean {
  return areAvatarsDisabledForDiag() || (
    isMapMechanicsOnlyEnabled() &&
    !isCharonneAvatarStressEnabled() &&
    !USE_VECTOR_TILE_SERVER
  );
}

function getRuntimeAvatarSourceMode(): AvatarSourceMode {
  if (typeof window === "undefined") {
    return "env";
  }

  if (getAvatarDiagCapabilities().forceMvt) {
    return "mvt";
  }

  if (isCharonneAvatarStressEnabled()) {
    return "mvt";
  }

  if (isMapMechanicsOnlyEnabled()) {
    return USE_VECTOR_TILE_SERVER ? "mvt" : "env";
  }

  const forcedMode = (window as any).__MEEWAV_AVATAR_SOURCE_MODE__;
  if (forcedMode === "mvt" || forcedMode === "geojson") {
    return forcedMode;
  }

  const queryMode = new URLSearchParams(window.location.search).get("avatarSource");
  if (queryMode === "mvt" || queryMode === "geojson") {
    return queryMode;
  }

  return "env";
}

export function shouldUseVectorTileServer(): boolean {
  let result: boolean;
  if (areAvatarsDisabledForDiag()) {
    result = false;
  } else if (getAvatarDiagCapabilities().forceMvt) {
    result = true;
  } else if (isCharonneAvatarStressEnabled()) {
    result = true;
  } else if (isMapMechanicsOnlyEnabled()) {
    result = USE_VECTOR_TILE_SERVER;
  } else {
    const mode = getRuntimeAvatarSourceMode();
    if (mode === "mvt") {
      result = true;
    } else if (mode === "geojson") {
      result = false;
    } else {
      result = USE_VECTOR_TILE_SERVER;
    }
  }

  if (typeof window !== "undefined") {
    (window as any).__MEEWAV_SHOULD_USE_VECTOR_TILE_SERVER__ = result;
  }

  return result;
}

export function isForcedGeoJsonAvatarSource(): boolean {
  return getRuntimeAvatarSourceMode() === "geojson";
}

export function isForcedMvtAvatarSource(): boolean {
  if (getAvatarDiagCapabilities().forceMvt) return true;
  return getRuntimeAvatarSourceMode() === "mvt";
}

export function safeQueryRenderedFeatures(map: MapLibreMap, layerIds: string[]): any[] {
  const existingLayers = layerIds.filter((id) => !!map.getLayer(id));

  if (existingLayers.length === 0) {
    return [];
  }

  try {
    return map.queryRenderedFeatures({
      layers: existingLayers
    });
  } catch (err) {
    perfWarn("[Meewav safeQueryRenderedFeatures] query error:", err);
    return [];
  }
}


let latestAvatarData: any = {
  type: "FeatureCollection",
  features: []
};

const initializedMaps = new WeakSet<MapLibreMap>();
const avatarRepairHandlersInstalled = new WeakSet<MapLibreMap>();

function emptyFeatureCollection() {
  return { type: "FeatureCollection" as const, features: [] };
}

const MAP_ICON_SIZE = 256;
const MAP_ICON_PIXEL_RATIO = 1;

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Impossible de charger ${url}`));
    img.src = url;
  });
}

function imageToMapIconData(img: HTMLImageElement, size = MAP_ICON_SIZE): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Impossible de créer le canvas avatar");
  }
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const scale = Math.min(size / img.width, size / img.height);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const x = Math.round((size - width) / 2);
  const y = Math.round((size - height) / 2);
  ctx.drawImage(img, x, y, width, height);
  return ctx.getImageData(0, 0, size, size);
}

function createConsultedAvatarIconData(iconData: ImageData): ImageData {
  const grayscalePixels = new Uint8ClampedArray(iconData.data);
  for (let offset = 0; offset < grayscalePixels.length; offset += 4) {
    const luminance = Math.round(
      grayscalePixels[offset] * 0.2126
      + grayscalePixels[offset + 1] * 0.7152
      + grayscalePixels[offset + 2] * 0.0722,
    );
    grayscalePixels[offset] = luminance;
    grayscalePixels[offset + 1] = luminance;
    grayscalePixels[offset + 2] = luminance;
  }
  return new ImageData(grayscalePixels, iconData.width, iconData.height);
}

async function preloadAvatarImages(map: MapLibreMap) {
  if (isAvatarPipelineSuppressed()) return;

  avatarDebugLog("[Meewav] Préchargement avatars lancé");
  const avatarDiag = getAvatarDiagCapabilities();
  const avatarEntries = avatarDiag.sharedIcon
    ? Object.entries(AVATAR_MAP).filter(([iconId]) => iconId === AVATAR_DIAG_SHARED_ICON_ID)
    : Object.entries(AVATAR_MAP);

  await Promise.allSettled(avatarEntries.map(async ([iconId, fileName]) => {
    const consultedIconId = `${iconId}${CONSULTED_AVATAR_ICON_SUFFIX}`;
    if (map.hasImage(iconId) && map.hasImage(consultedIconId)) {
      avatarDebugLog("[Meewav] Déjà présent :", iconId);
      return;
    }

    const url = `${AVATAR_BASE_PATH}/${fileName}`;

    try {
      const img = await loadHtmlImage(url);

      avatarDebugLog("[Meewav] Image chargée :", iconId, img.width, img.height, url);

      const iconData = imageToMapIconData(img, MAP_ICON_SIZE);
      if (!map.hasImage(iconId)) {
        map.addImage(iconId, iconData, { pixelRatio: MAP_ICON_PIXEL_RATIO });
        avatarDebugLog("[Meewav] ADD SUCCESS :", iconId, MAP_ICON_SIZE, img.width, img.height);
      }
      if (!map.hasImage(consultedIconId)) {
        map.addImage(
          consultedIconId,
          createConsultedAvatarIconData(iconData),
          { pixelRatio: MAP_ICON_PIXEL_RATIO },
        );
      }
    } catch (error) {
      console.error("[Meewav] ADD/LOAD ERROR :", iconId, url, error);
    }
  }));

  avatarDebugLog("[Meewav] Préchargement avatars terminé");
}

type HorizonImpostorFeature = {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    kind: "horizon_impostor";
    impostor_id: string;
    impostor_avatar_key: string;
    rank: number;
    screen_x: number;
    screen_y: number;
    source: "screen_horizon_band";
  };
};

const HORIZON_IMPOSTOR_MIN_PITCH = 48;
const HORIZON_IMPOSTOR_MAX_FEATURES = 48;
const HORIZON_IMPOSTOR_UPDATE_MS = 600;
const HORIZON_IMPOSTOR_REAL_AVATAR_MARGIN_PX = 34;

const REAL_AVATAR_RENDER_LAYERS = [
  AVATAR_POINTS_LAYER_ID,
  AVATAR_POINTS_SELECTED_LAYER_ID,
  "meewav-avatar-points-far",
  "meewav-avatar-points-mid",
  "meewav-avatar-points-near"
];

const horizonImpostorInitializedMaps = new WeakSet<MapLibreMap>();
const horizonImpostorStates = new WeakMap<MapLibreMap, {
  timer: number | null;
  lastSignature: string;
  lastBoundaryY: number | null;
  updateCount: number;
}>();

function emptyHorizonImpostorData() {
  return { type: "FeatureCollection" as const, features: [] as HorizonImpostorFeature[] };
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(input: string): number {
  return stableHash(input) / 4294967295;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getHorizonState(map: MapLibreMap) {
  let state = horizonImpostorStates.get(map);
  if (!state) {
    state = {
      timer: null,
      lastSignature: "",
      lastBoundaryY: null,
      updateCount: 0
    };
    horizonImpostorStates.set(map, state);
  }
  return state;
}

function getExistingRealAvatarLayers(map: MapLibreMap): string[] {
  return REAL_AVATAR_RENDER_LAYERS.filter((layerId) => !!map.getLayer(layerId));
}

function getRenderedRealAvatarBoundaryY(map: MapLibreMap): number | null {
  const layers = getExistingRealAvatarLayers(map);
  if (layers.length === 0) return null;

  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width || 0;
  const height = canvas.clientHeight || canvas.height || 0;
  if (width <= 0 || height <= 0) return null;

  let features: any[] = [];
  try {
    features = map.queryRenderedFeatures({ layers });
  } catch {
    return null;
  }

  let topMostY = Number.POSITIVE_INFINITY;

  for (const feature of features) {
    const geometry: any = feature.geometry;
    const coordinates = geometry?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;

    try {
      const point = map.project([Number(coordinates[0]), Number(coordinates[1])] as any);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      if (point.x < -64 || point.x > width + 64 || point.y < -64 || point.y > height + 64) continue;
      topMostY = Math.min(topMostY, point.y);
    } catch {
      // Ignore features whose geometry cannot be projected.
    }
  }

  if (!Number.isFinite(topMostY)) return null;
  return topMostY;
}

function buildHorizonImpostorData(map: MapLibreMap, reason: string, auditRealAvatarBoundary: boolean) {
  const pitch = map.getPitch();
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width || 0;
  const height = canvas.clientHeight || canvas.height || 0;
  const state = getHorizonState(map);

  if (!ENABLE_HORIZON_IMPOSTOR_LAYER || width <= 0 || height <= 0 || pitch < HORIZON_IMPOSTOR_MIN_PITCH) {
    return {
      data: emptyHorizonImpostorData(),
      boundaryY: state.lastBoundaryY,
      active: false,
      reason: pitch < HORIZON_IMPOSTOR_MIN_PITCH ? "pitch-too-low" : reason
    };
  }

  let boundaryY = state.lastBoundaryY;
  if (auditRealAvatarBoundary || boundaryY === null) {
    boundaryY = getRenderedRealAvatarBoundaryY(map);
    if (boundaryY !== null) {
      state.lastBoundaryY = boundaryY;
    }
  }

  // Si aucun vrai avatar n'est encore rendu, on place le fond dans la partie haute.
  // Dès que des vrais avatars existent, l'impostor reste strictement au-dessus
  // de la ligne la plus lointaine de ces vrais avatars.
  const safeTop = clampNumber(height * 0.07, 24, 90);
  const proposedBottom = boundaryY === null
    ? height * 0.43
    : boundaryY - HORIZON_IMPOSTOR_REAL_AVATAR_MARGIN_PX;

  if (boundaryY !== null && proposedBottom - safeTop < 48) {
    return {
      data: emptyHorizonImpostorData(),
      boundaryY,
      active: false,
      reason: "real-avatar-line-too-close-to-horizon"
    };
  }

  const bandBottom = boundaryY === null
    ? clampNumber(proposedBottom, safeTop + 56, height * 0.5)
    : Math.min(proposedBottom, height * 0.6);
  const bandHeight = bandBottom - safeTop;

  if (bandHeight < 48) {
    return {
      data: emptyHorizonImpostorData(),
      boundaryY,
      active: false,
      reason: "no-screen-space-behind-real-avatars"
    };
  }

  const columns = 24;
  const rows = clampNumber(Math.round(bandHeight / 58), 2, 7);
  const features: HorizonImpostorFeature[] = [];
  const center = map.getCenter();
  const coarseCenterKey = `${Math.round(center.lng * 200)}:${Math.round(center.lat * 200)}:${Math.round(map.getBearing() / 8)}`;

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (features.length >= HORIZON_IMPOSTOR_MAX_FEATURES) break;

      const key = `${coarseCenterKey}:${row}:${column}`;
      const fill = stableUnit(`${key}:fill`);
      if (fill < 0.16) continue;

      const xBase = width * (0.055 + ((column + 0.5) / columns) * 0.89);
      const yBase = safeTop + ((row + 0.5) / rows) * bandHeight;
      const jitterX = (stableUnit(`${key}:jx`) - 0.5) * (width / columns) * 0.58;
      const jitterY = (stableUnit(`${key}:jy`) - 0.5) * (bandHeight / rows) * 0.52;
      const screenX = clampNumber(xBase + jitterX, width * 0.035, width * 0.965);
      const screenY = clampNumber(yBase + jitterY, safeTop, bandBottom);

      try {
        const lngLat = map.unproject([screenX, screenY] as any);
        const avatarIndex = 1 + (stableHash(`${key}:avatar`) % 32);
        const rank = features.length + 1;

        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lngLat.lng, lngLat.lat]
          },
          properties: {
            kind: "horizon_impostor",
            impostor_id: `horizon_${row}_${column}`,
            impostor_avatar_key: `avatar_${avatarIndex}`,
            rank,
            screen_x: Math.round(screenX),
            screen_y: Math.round(screenY),
            source: "screen_horizon_band"
          }
        });
      } catch {
        // Ignore unproject failures during transient camera states.
      }
    }
  }

  return {
    data: {
      type: "FeatureCollection" as const,
      features
    },
    boundaryY,
    active: features.length > 0,
    reason
  };
}

function setHorizonImpostorDebug(map: MapLibreMap, payload: Record<string, any>) {
  if (typeof window === "undefined") return;
  (window as any).__MEEWAV_HORIZON_IMPOSTOR_DEBUG__ = {
    ...(window as any).__MEEWAV_HORIZON_IMPOSTOR_DEBUG__,
    layerId: HORIZON_IMPOSTOR_LAYER_ID,
    pitch: Number(map.getPitch().toFixed(2)),
    zoom: Number(map.getZoom().toFixed(2)),
    updatedAt: Date.now(),
    ...payload
  };
}

function updateHorizonImpostorLayerData(map: MapLibreMap, reason: string, auditRealAvatarBoundary = false): void {
  if (!ENABLE_HORIZON_IMPOSTOR_LAYER) return;

  if (typeof window !== "undefined" && (window as any).__MEEWAV_NAVIGATION_DEBUG__?.isUserNavigating3D === true) {
    return;
  }

  const source = map.getSource(HORIZON_IMPOSTOR_SOURCE_ID) as any;
  if (!source || typeof source.setData !== "function") return;

  const state = getHorizonState(map);
  const result = buildHorizonImpostorData(map, reason, auditRealAvatarBoundary);
  const features = result.data.features || [];
  const signature = `${features.length}:${features.slice(0, 8).map((feature) => `${feature.properties.impostor_id}:${feature.properties.screen_x}:${feature.properties.screen_y}`).join("|")}`;

  if (signature !== state.lastSignature) {
    source.setData(result.data);
    state.lastSignature = signature;
    state.updateCount += 1;
  }

  setHorizonImpostorDebug(map, {
    active: result.active,
    reason: result.reason,
    impostorCount: features.length,
    realAvatarBoundaryY: result.boundaryY === null ? null : Math.round(result.boundaryY),
    startsBehindRealAvatarLine: result.boundaryY !== null,
    updateCount: state.updateCount
  });
}

function scheduleHorizonImpostorUpdate(map: MapLibreMap, reason: string, auditRealAvatarBoundary = false): void {
  if (!ENABLE_HORIZON_IMPOSTOR_LAYER) return;

  const state = getHorizonState(map);
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
  }

  state.timer = window.setTimeout(() => {
    state.timer = null;
    updateHorizonImpostorLayerData(map, reason, auditRealAvatarBoundary);
  }, HORIZON_IMPOSTOR_UPDATE_MS);
}

function installHorizonImpostorHandlers(map: MapLibreMap): void {
  if (horizonImpostorInitializedMaps.has(map)) return;
  horizonImpostorInitializedMaps.add(map);

  // Fixed decor layer: do not recompute on move/pitch/rotate.
  // Reprojected geo points stay stable while the user navigates.
}
export function ensureHorizonImpostorLayer(map: MapLibreMap) {
  if (!ENABLE_HORIZON_IMPOSTOR_LAYER) return;
  if (isCharonneAvatarStressEnabled()) {
    if (map.getLayer(HORIZON_IMPOSTOR_LAYER_ID)) {
      try { map.setLayoutProperty(HORIZON_IMPOSTOR_LAYER_ID, "visibility", "none"); } catch { /* ignore */ }
      try { map.setPaintProperty(HORIZON_IMPOSTOR_LAYER_ID, "icon-opacity", 0); } catch { /* ignore */ }
    }
    return;
  }

  if (!map.getSource(HORIZON_IMPOSTOR_SOURCE_ID)) {
    map.addSource(HORIZON_IMPOSTOR_SOURCE_ID, {
      type: "geojson",
      data: emptyHorizonImpostorData()
    });
    avatarDebugLog("[Meewav] Source impostors horizon initialisée client-side");
  }

  if (!map.getLayer(HORIZON_IMPOSTOR_LAYER_ID)) {
    map.addLayer({
      id: HORIZON_IMPOSTOR_LAYER_ID,
      type: "symbol",
      source: HORIZON_IMPOSTOR_SOURCE_ID,
      minzoom: 12.0,
      maxzoom: 19.4,
      layout: {
        "icon-image": ["get", "impostor_avatar_key"],
        "icon-size": 0.052,
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-optional": true,
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
        "symbol-placement": "point",
        "symbol-z-order": "source",
        "visibility": "visible"
      },
      paint: {
        "icon-opacity": 0.72
      }
    } as any);
    avatarDebugLog("[Meewav] Couche horizon impostor initialisée");
  }

  installHorizonImpostorHandlers(map);
  updateHorizonImpostorLayerData(map, "ensure-layer", true);
}

function ensureAvatarSource(map: MapLibreMap) {
  if (isAvatarPipelineSuppressed()) return;

  if (shouldUseVectorTileServer()) {
    if (!map.getSource(AVATAR_SOURCE_ID)) {
      const vectorTileUrl = getRuntimeVectorTileUrl();
      map.addSource(AVATAR_SOURCE_ID, {
        type: "vector",
        tiles: [vectorTileUrl],
        minzoom: 0,
        maxzoom: 22,
        promoteId: { musicians: "profile_id" },
        buffer: isCharonneAvatarStressEnabled() ? CHARONNE_STRESS_MVT_BUFFER : 128
      } as any);
      avatarDebugLog("[Meewav] Source vectorielle branchée sur :", vectorTileUrl);
    }
  } else {
    if (!map.getSource(AVATAR_SOURCE_ID)) {
      map.addSource(AVATAR_SOURCE_ID, {
        type: "geojson",
        data: latestAvatarData || emptyFeatureCollection(),
        promoteId: "profile_id",
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50
      });
      avatarDebugLog("[Meewav] Source GeoJSON locale propre initialisée");
    }
  }
}

const avatarVectorTileRefreshAt = new WeakMap<MapLibreMap, number>();

type AvatarTileRefreshOptions = {
  reloadSource?: boolean;
};

export function refreshAvatarTilesAfterViewSwitch(
  map: MapLibreMap,
  reason = "view-switch",
  options: AvatarTileRefreshOptions = {},
): void {
  if (isAvatarPipelineSuppressed() || areAvatarsDisabledForDiag()) return;

  const reloadSource = options.reloadSource !== false;
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const previous = avatarVectorTileRefreshAt.get(map) ?? 0;
  if (reloadSource) {
    if (now - previous < 650) return;
    avatarVectorTileRefreshAt.set(map, now);
  }

  try {
    ensureAvatarSource(map);
  } catch (error) {
    console.warn("[Meewav avatars] source refresh skipped", { reason, error });
    return;
  }

  if (!map.getLayer(AVATAR_POINTS_LAYER_ID)) {
    ensureAvatarLayers(map);
  }

  for (const layerId of [
    AVATAR_POINTS_LAYER_ID,
    AVATAR_POINTS_HIT_LAYER_ID,
    AVATAR_POINTS_LEGACY_HIT_LAYER_ID,
  ]) {
    if (!map.getLayer(layerId)) continue;
    try {
      if (map.getLayoutProperty(layerId, "visibility") !== "visible") {
        map.setLayoutProperty(layerId, "visibility", "visible");
      }
    } catch {
      // Best effort: a style reload can temporarily reject runtime layer writes.
    }
  }

  const source = map.getSource(AVATAR_SOURCE_ID) as any;
  if (reloadSource && source && typeof source.reload === "function") {
    try {
      source.reload();
    } catch {
      // Some MapLibre source implementations do not support reload while tiles are parsing.
    }
  }

  try {
    moveAvatarLayersToTop(map);
  } catch {
    // Layer ordering is best effort during style changes.
  }

  if (isAvatarDebugEnabled() && typeof window !== "undefined") {
    console.log("[Meewav avatars] refreshed after view switch", {
      reason,
      source: Boolean(map.getSource(AVATAR_SOURCE_ID)),
      layer: Boolean(map.getLayer(AVATAR_POINTS_LAYER_ID)),
      zoom: map.getZoom(),
    });
  }
}

function removeAvatarRuntimeLayersForDiag(map: MapLibreMap) {
  const styleLayers = [...(map.getStyle()?.layers ?? [])].reverse();
  const layerIds = new Set([
    CLUSTERS_LAYER_ID,
    CLUSTER_COUNT_LAYER_ID,
    "meewav-clusters-country",
    "meewav-cluster-count-country",
    "meewav-cluster-city-name-country",
    "meewav-clusters-macro",
    "meewav-cluster-count-macro",
    "meewav-clusters-mid",
    "meewav-cluster-count-mid",
    "meewav-clusters-local",
    "meewav-cluster-count-local",
    "meewav-clusters-micro",
    "meewav-cluster-count-micro",
    "meewav-clusters-nano",
    "meewav-cluster-count-nano",
    "meewav-avatar-ground-shadow",
    "meewav-avatar-points",
    HORIZON_IMPOSTOR_LAYER_ID,
    CURRENT_USER_AURA_LAYER_ID,
    CURRENT_USER_AURA_INNER_LAYER_ID,
    AVATAR_POINTS_LAYER_ID,
    AVATAR_POINTS_SELECTED_LAYER_ID,
    AVATAR_NAMES_LAYER_ID,
    AVATAR_VISIBLE_LABELS_LAYER_ID,
    AVATAR_HOVER_POINTS_LAYER_ID,
    AVATAR_HOVER_NAME_LAYER_ID,
    AVATAR_POINTS_HIT_LAYER_ID,
    AVATAR_POINTS_LEGACY_HIT_LAYER_ID,
    "meewav-avatar-points-far",
    "meewav-avatar-points-mid",
    "meewav-avatar-points-near",
    "meewav-avatar-tile-carrier",
    "meewav-pack5-avatar-symbols",
  ]);

  for (const layer of styleLayers) {
    if (!layerIds.has(layer.id) && (layer as any).source !== AVATAR_SOURCE_ID && (layer as any).source !== HORIZON_IMPOSTOR_SOURCE_ID) {
      continue;
    }
    try {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id);
    } catch {
      // Retried on the next style pass.
    }
  }

  for (const sourceId of [AVATAR_SOURCE_ID, AVATAR_HOVER_SOURCE_ID, AVATAR_VISIBLE_LABELS_SOURCE_ID, HORIZON_IMPOSTOR_SOURCE_ID, "meewav-pack5-avatars"]) {
    try {
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      // A layer can still reference the source during style churn.
    }
  }
}

function ensurePack5Source(map: MapLibreMap) {
  if (!map.getSource("meewav-pack5-avatars")) {
    map.addSource("meewav-pack5-avatars", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: []
      }
    });
    avatarDebugLog("[Meewav] Pack5 GeoJSON source initialisée");
  }
}


const avatarRoleIconMatchCases = [
  "accordeon", "avatar_30",
  "accordeoniste", "avatar_30",
  "bassiste", "avatar_28",
  "basse", "avatar_28",
  "batteur", "avatar_27",
  "batteuse", "avatar_27",
  "batteurs", "avatar_27",
  "batteuses", "avatar_27",
  "batteurs, batteuses", "avatar_27",
  "batteurs batteuses", "avatar_27",
  "batteurs_batteuses", "avatar_27",
  "batteurs-batteuses", "avatar_27",
  "drummer", "avatar_27",
  "drums", "avatar_27",
  "beatboxer", "avatar_26",
  "beatmaker", "avatar_25",
  "producteur", "avatar_25",
  "producer", "avatar_25",
  "compositeur", "avatar_21",
  "composer", "avatar_21",
  "danseur", "avatar_20",
  "danseurs", "avatar_20",
  "danseuse", "avatar_19",
  "dj", "avatar_17",
  "deejay", "avatar_17",
  "guitare_elec", "avatar_15",
  "guitariste_electrique", "avatar_15",
  "guitariste", "avatar_16",
  "guitare", "avatar_16",
  "guitarist", "avatar_16",
  "inge_son", "avatar_14",
  "ingenieur_son", "avatar_14",
  "ing_son", "avatar_14",
  "sound_engineer", "avatar_14",
  "instr_cordes", "avatar_1",
  "cordes", "avatar_1",
  "instr_cuivre", "avatar_12",
  "cuivre", "avatar_12",
  "saxo", "avatar_12",
  "trompettiste", "avatar_12",
  "instr_vent", "avatar_13",
  "vent", "avatar_13",
  "label", "avatar_11",
  "manager", "avatar_10",
  "management", "avatar_10",
  "booker", "avatar_10",
  "chanteur", "avatar_24",
  "chanteuse", "avatar_23",
  "chanteur, rappeur", "avatar_24",
  "chanteuse, rappeuse", "avatar_23",
  "chanteur rappeur", "avatar_24",
  "chanteuse rappeuse", "avatar_23",
  "chanteur_rappeur", "avatar_24",
  "chanteuse_rappeuse", "avatar_23",
  "chanteur-rappeur", "avatar_24",
  "chanteuse-rappeuse", "avatar_23",
  "rappeur", "avatar_24",
  "rappeuse", "avatar_23",
  "chanteurs", "avatar_24",
  "chanteuses", "avatar_23",
  "micro", "avatar_24",
  "microphone", "avatar_24",
  "mic", "avatar_24",
  "voix", "avatar_24",
  "vox", "avatar_24",
  "voice", "avatar_24",
  "vocal", "avatar_24",
  "vocaliste", "avatar_24",
  "chant", "avatar_24",
  "singer", "avatar_24",
  "orga_event", "avatar_9",
  "percussion", "avatar_8",
  "percussionniste", "avatar_8",
  "pianiste", "avatar_7",
  "piano", "avatar_7",
  "professeur", "avatar_22",
  "studio", "avatar_5",
  "synthetiseur", "avatar_6",
  "synthétiseur", "avatar_6",
  "synth", "avatar_6",
  "clavier", "avatar_6",
  "clavieriste", "avatar_6",
  "claviériste", "avatar_6",
  "clipper", "avatar_2",
  "clippeur", "avatar_2",
  "creeper", "avatar_2",
  "vidéaste clipper", "avatar_2",
  "videaste clipper", "avatar_2",
  "vidéaste clippeur", "avatar_2",
  "videaste clippeur", "avatar_2",
  "vidéaste_clipper", "avatar_2",
  "videaste_clipper", "avatar_2",
  "vidéaste_clippeur", "avatar_2",
  "videaste_clippeur", "avatar_2",
  "vidéaste-clipper", "avatar_2",
  "videaste-clipper", "avatar_2",
  "vidéaste-clippeur", "avatar_2",
  "videaste-clippeur", "avatar_2",
  "videaste", "avatar_2",
  "vidéaste", "avatar_2",
  "user", "avatar_4",
  "user_f", "avatar_3",
  "violon", "avatar_1",
];

const avatarRoleIconFromExpression = (roleExpression: any) => [
  "match",
  ["downcase", ["to-string", roleExpression]],
  ...avatarRoleIconMatchCases,
  ""
];

const avatarRoleIconCandidates = [
  avatarRoleIconFromExpression(["get", "instrument"]),
  avatarRoleIconFromExpression(["get", "main_role"]),
  avatarRoleIconFromExpression(["get", "role"]),
  avatarRoleIconFromExpression(["get", "artist_rank"]),
  avatarRoleIconFromExpression(["get", "primary_role"]),
  avatarRoleIconFromExpression(["get", "secondary_roles"]),
  avatarRoleIconFromExpression(["get", "secondaryRoles"]),
  avatarRoleIconFromExpression(["get", "roles"]),
  avatarRoleIconFromExpression(["get", "avatarRole"]),
  avatarRoleIconFromExpression(["get", "avatar_role"]),
  avatarRoleIconFromExpression(["get", "avatarIcon"]),
  avatarRoleIconFromExpression(["get", "avatar_icon"])
];

const avatarRoleIconExpression = [
  "case",
  ...avatarRoleIconCandidates.flatMap((candidate) => [
    ["all", ["!=", candidate, ""], ["!=", candidate, "avatar_4"]],
    candidate
  ]),
  ...avatarRoleIconCandidates.flatMap((candidate) => [
    ["!=", candidate, ""],
    candidate
  ]),
  ""
];

const rawAvatarIconIdExpression = [
  "to-string",
  [
    "coalesce",
    ["get", "avatar_icon_id"],
    ["get", "avatarIconId"],
    ["get", "avatar_id"],
    ["get", "avatarId"],
    ["get", "avatar_icon"],
    ["get", "avatarIcon"],
    ["get", "avatar"],
    ["get", "cluster_avatar_id"],
    ["get", "icon_id"],
    ["get", "iconId"],
    ["get", "icon_image"],
    ["get", "iconImage"],
    ["get", "icon"],
    ""
  ]
];

const avatarIconIdMatchCases = [
  AVATAR_DEFAULT_ICON_ID, AVATAR_DEFAULT_ICON_ID,
  ...Array.from({ length: 33 }, (_, index) => {
    const iconId = `avatar_${index + 1}`;
    return [`${index + 1}`, iconId, iconId, iconId];
  }).flat()
];

const avatarIdIconExpression = [
  "match",
  rawAvatarIconIdExpression,
  ...avatarIconIdMatchCases,
  ""
];

// Expression de correspondance robuste entre instruments serveur et identifiants d'avatars V4.
export const iconImageExpression = [
  "case",
  [
    "all",
    ["!=", avatarRoleIconExpression, ""],
    ["!=", avatarRoleIconExpression, "avatar_4"],
    [
      "any",
      ["==", avatarIdIconExpression, "avatar_4"],
      ["==", avatarIdIconExpression, AVATAR_DEFAULT_ICON_ID]
    ]
  ],
  avatarRoleIconExpression,
  ["!=", avatarIdIconExpression, ""],
  avatarIdIconExpression,
  ["!=", avatarRoleIconExpression, ""],
  avatarRoleIconExpression,
  AVATAR_DEFAULT_ICON_ID
];

const avatarFeatureProfileIdExpression = [
  "to-string",
  [
    "coalesce",
    ["get", "profile_id"],
    ["get", "musician_id"],
    ["get", "id"],
    ["get", "feature_id"],
    ["id"],
    "",
  ],
];
let consultedAvatarProfileIds: string[] = [];

function buildRuntimeAvatarIconImageExpression(baseIconExpression: unknown) {
  if (consultedAvatarProfileIds.length === 0) return baseIconExpression;
  return [
    "case",
    [
      "all",
      ["!=", ["get", "is_current_user"], true],
      ["in", avatarFeatureProfileIdExpression, ["literal", consultedAvatarProfileIds]],
    ],
    ["concat", baseIconExpression, CONSULTED_AVATAR_ICON_SUFFIX],
    baseIconExpression,
  ];
}

function buildRuntimeAvatarIconOpacityExpression(baseOpacity: unknown = 1) {
  if (consultedAvatarProfileIds.length === 0) return baseOpacity;
  return [
    "case",
    [
      "all",
      ["!=", ["get", "is_current_user"], true],
      ["in", avatarFeatureProfileIdExpression, ["literal", consultedAvatarProfileIds]],
    ],
    CONSULTED_AVATAR_OPACITY,
    baseOpacity,
  ];
}

function getRuntimeAvatarIconImageExpression() {
  const avatarDiag = getAvatarDiagCapabilities();
  const baseIconExpression = avatarDiag.sharedIcon
    ? AVATAR_DIAG_SHARED_ICON_ID
    : iconImageExpression;
  return buildRuntimeAvatarIconImageExpression(baseIconExpression);
}

export function syncConsultedAvatarVisualState(
  map: MapLibreMap,
  consultedProfileIds: readonly string[],
  pinnedProfileIds: readonly string[],
) {
  const pinnedIds = new Set(pinnedProfileIds.map(String));
  consultedAvatarProfileIds = [...new Set(consultedProfileIds.map(String))]
    .filter((profileId) => profileId && !pinnedIds.has(profileId));

  const iconExpression = getRuntimeAvatarIconImageExpression();
  const opacityExpression = buildRuntimeAvatarIconOpacityExpression();
  for (const layerId of [
    AVATAR_POINTS_LAYER_ID,
    AVATAR_POINTS_SELECTED_LAYER_ID,
    "meewav-avatar-points-far",
    "meewav-avatar-points-mid",
    "meewav-avatar-points-near",
    AVATAR_HOVER_POINTS_LAYER_ID,
  ]) {
    if (!map.getLayer(layerId)) continue;
    try {
      map.setLayoutProperty(layerId, "icon-image", iconExpression as any);
      map.setPaintProperty(layerId, "icon-opacity", opacityExpression as any);
    } catch {
      // The layer can disappear while the style is being rebuilt.
    }
  }
  map.triggerRepaint?.();
}

// ==========================================
// SMART GROUND ANCHORING SYSTEM (CLIENT-SIDE)
// ==========================================

function metersPerLngDegree(latitude: number): number {
  return Math.max(1, 111320 * Math.cos((latitude * Math.PI) / 180));
}

function addMetersToLngLat(lngLat: [number, number], dxMeters: number, dyMeters: number): [number, number] {
  const lng = lngLat[0] + dxMeters / metersPerLngDegree(lngLat[1]);
  const lat = lngLat[1] + dyMeters / 110540;
  return [lng, lat];
}

export function getDistanceMeters(a: [number, number], b: [number, number]): number {
  const midLat = (a[1] + b[1]) / 2;
  const dx = (a[0] - b[0]) * metersPerLngDegree(midLat);
  const dy = (a[1] - b[1]) * 110540;
  return Math.hypot(dx, dy);
}

export function isInsideWater(map: MapLibreMap, lngLat: [number, number]): boolean {
  const pixel = map.project(lngLat);
  const canvas = map.getCanvas();
  if (pixel.x < 0 || pixel.x > canvas.clientWidth || pixel.y < 0 || pixel.y > canvas.clientHeight) {
    return false;
  }
  const features = map.queryRenderedFeatures(pixel, {
    layers: ["water", "waterway_canal"]
  });
  return features.length > 0;
}

export function isInsidePark(map: MapLibreMap, lngLat: [number, number]): boolean {
  const pixel = map.project(lngLat);
  const canvas = map.getCanvas();
  if (pixel.x < 0 || pixel.x > canvas.clientWidth || pixel.y < 0 || pixel.y > canvas.clientHeight) {
    return false;
  }
  const features = map.queryRenderedFeatures(pixel, {
    layers: [
      "landuse_park",
      "landcover_green_areas",
      "landcover_small_green_grounds",
      "landuse_small_green_grounds",
      "stadium_pitch"
    ]
  });
  return features.length > 0;
}

export const anchorCacheMap = new Map<string, {
  real_lng: number;
  real_lat: number;
  display_lng: number;
  display_lat: number;
  score: number;
}>();

export function findNearestGroundAnchor(
  map: MapLibreMap,
  id: string,
  lngLat: [number, number]
): [number, number] {
  // 1. Check cache to avoid recalculation per frame
  if (anchorCacheMap.has(id)) {
    const cached = anchorCacheMap.get(id)!;
    if (cached.score !== -999) {
      return [cached.display_lng, cached.display_lat];
    }
  }

  // 2. If map is not fully loaded, return coordinates with temporary cache
  if (!map.isStyleLoaded()) {
    anchorCacheMap.set(id, {
      real_lng: lngLat[0],
      real_lat: lngLat[1],
      display_lng: lngLat[0],
      display_lat: lngLat[1],
      score: -999
    });
    return lngLat;
  }

  const pixel = map.project(lngLat);
  const canvas = map.getCanvas();

  // 3. If off-screen, return original coordinates without permanent cache
  if (pixel.x < 0 || pixel.x > canvas.clientWidth || pixel.y < 0 || pixel.y > canvas.clientHeight) {
    return lngLat;
  }

  // 4. Verify that tiles are actually rendered at this pixel (avoid false open space detection on blank map)
  const allFeatures = map.queryRenderedFeatures(pixel);
  if (allFeatures.length === 0) {
    anchorCacheMap.set(id, {
      real_lng: lngLat[0],
      real_lat: lngLat[1],
      display_lng: lngLat[0],
      display_lat: lngLat[1],
      score: -999
    });
    return lngLat;
  }

  // 5. Keep avatars off water and parks; legacy structure collision queries
  // were removed with the procedural volume renderer.
  const initialWater = map.queryRenderedFeatures(pixel, {
    layers: ["water", "waterway_canal"]
  }).length > 0;

  const initialPark = map.queryRenderedFeatures(pixel, {
    layers: [
      "landuse_park",
      "landcover_green_areas",
      "landcover_small_green_grounds",
      "landuse_small_green_grounds",
      "stadium_pitch"
    ]
  }).length > 0;

  if (!initialWater && !initialPark) {
    anchorCacheMap.set(id, {
      real_lng: lngLat[0],
      real_lat: lngLat[1],
      display_lng: lngLat[0],
      display_lat: lngLat[1],
      score: 100 // Maximum score since it is already on urban ground
    });
    return lngLat;
  }

  // 6. Concentric spiral search: scan around 2m to 30m
  const steps = [2, 4, 6, 8, 10, 15, 20, 25, 30]; // Distance in meters
  const angles = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, 202.5, 225, 247.5, 270, 292.5, 315, 337.5];

  let bestCoords = lngLat;
  let bestScore = -Infinity;

  for (const radius of steps) {
    for (const angle of angles) {
      const rad = (angle * Math.PI) / 180;
      const dx = radius * Math.cos(rad);
      const dy = radius * Math.sin(rad);

      const candidateLngLat = addMetersToLngLat(lngLat, dx, dy);
      const testPixel = map.project(candidateLngLat);

      if (testPixel.x < 0 || testPixel.x > canvas.clientWidth || testPixel.y < 0 || testPixel.y > canvas.clientHeight) {
        continue;
      }

      const isWater = map.queryRenderedFeatures(testPixel, {
        layers: ["water", "waterway_canal"]
      }).length > 0;

      const isPark = map.queryRenderedFeatures(testPixel, {
        layers: [
          "landuse_park",
          "landcover_green_areas",
          "landcover_small_green_grounds",
          "landuse_small_green_grounds",
          "stadium_pitch"
        ]
      }).length > 0;

      if (isWater || isPark) {
        continue; // Excluded ground types
      }

      // Evaluate score of matching landcover/roads
      let score = 10; // Base score for default paved grounds

      const isMinorRoad = map.queryRenderedFeatures(testPixel, {
        layers: ["roads_minor"]
      }).length > 0;

      const isLocalRoad = map.queryRenderedFeatures(testPixel, {
        layers: ["roads_local_inner", "roads_local_casing"]
      }).length > 0;

      const isMajorRoad = map.queryRenderedFeatures(testPixel, {
        layers: ["roads_major_inner", "roads_major_casing"]
      }).length > 0;

      if (isMinorRoad) {
        score = 100; // Prefer minor pedestrian roads/sidewalks
      } else if (isLocalRoad) {
        score = 80;
      } else if (isMajorRoad) {
        score = 60;
      }

      const distancePenalty = (radius / 30.0) * 5;
      const finalScore = score - distancePenalty;

      if (finalScore > bestScore) {
        bestScore = finalScore;
        bestCoords = candidateLngLat;
      }
    }

    // Early break if a high quality minor road is found close by
    if (bestScore >= 75) {
      break;
    }
  }

  // 7. Store final score in cache (even if we fallback to lngLat, to avoid repeating calculation)
  anchorCacheMap.set(id, {
    real_lng: lngLat[0],
    real_lat: lngLat[1],
    display_lng: bestCoords[0],
    display_lat: bestCoords[1],
    score: bestScore === -Infinity ? 0 : bestScore
  });

  return bestCoords;
}

let updateTimeout: any = null;
export function triggerAnchorUpdate(map: MapLibreMap) {
  return;
  if (shouldUseVectorTileServer()) return;
  if (typeof window !== "undefined" && (window as any).__MEEWAV_DISABLE_AVATAR_RECALC__ === true) {
    return;
  }
  if (typeof window !== "undefined" && (window as any).__MEEWAV_PERF_CLEAN_MODE__ === true) {
    return;
  }
  if (updateTimeout) clearTimeout(updateTimeout);
  updateTimeout = setTimeout(() => {
    updateAnchors(map);
  }, 200);
}

export function updateAnchors(map: MapLibreMap) {
  if (!latestAvatarData || !latestAvatarData.features || latestAvatarData.features.length === 0) {
    return;
  }

  let anyNewAnchor = false;
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  for (const feature of latestAvatarData.features) {
    const properties = feature.properties || {};
    const id = properties.id || properties.musician_id;
    if (!id) continue;

    // Get original position
    let real_lng = properties.real_lng;
    let real_lat = properties.real_lat;
    
    // If not saved in properties yet, save them now
    if (real_lng === undefined || real_lat === undefined) {
      real_lng = feature.geometry.coordinates[0];
      real_lat = feature.geometry.coordinates[1];
      properties.real_lng = real_lng;
      properties.real_lat = real_lat;
    }

    const real_coords: [number, number] = [real_lng, real_lat];

    // Check if cached
    if (anchorCacheMap.has(id)) {
      const cached = anchorCacheMap.get(id)!;
      // Ensure the feature geometry has the display anchor coordinates
      if (feature.geometry.coordinates[0] !== cached.display_lng || feature.geometry.coordinates[1] !== cached.display_lat) {
        feature.geometry.coordinates = [cached.display_lng, cached.display_lat];
        anyNewAnchor = true;
      }
      continue;
    }

    // Not cached yet. Check if real coordinates are inside the viewport
    const pixel = map.project(real_coords);
    if (pixel.x < 0 || pixel.x > width || pixel.y < 0 || pixel.y > height) {
      // Off-screen, skip for now. We will calculate when it comes on-screen
      continue;
    }

    // Style must be loaded to run queryRenderedFeatures
    if (!map.isStyleLoaded()) {
      continue;
    }

    // Run the anchoring search!
    const displayCoords = findNearestGroundAnchor(map, id, real_coords);
    
    // Save in geometry
    feature.geometry.coordinates = displayCoords;
    anyNewAnchor = true;
  }

  if (anyNewAnchor) {
    // Update the source
    const source: any = map.getSource(AVATAR_SOURCE_ID);
    if (source && !shouldUseVectorTileServer()) {
      source.setData(latestAvatarData);
    }
  }

  // Also update debug layers if active
  if ((window as any).__MEEWAV_ANCHOR_DEBUG__ === true) {
    // Debug layers completely disabled
  }
}

// ==========================================
// 3D OCCLUSION AND MASKING SYSTEM
// ==========================================

export function triggerOcclusionUpdate(map: MapLibreMap) {
  void map;
}

export function updateOcclusions(map: MapLibreMap) {
  void map;
}

// ==========================================
// VISUAL DEBUG MODE (ÉTAPE 8)
// ==========================================

export function updateDebugLayers(_map: MapLibreMap) {
  // Visual debug layers are completely disabled
}

function buildSpiderfyOffsetExpression(): any {
  const zoomRadii = { 14: 36, 15: 48, 16: 60, 17: 72 };
  const interpExpr: any[] = ["interpolate", ["linear"], ["zoom"]];
  
  Object.entries(zoomRadii).forEach(([zoomStr, baseRadius]) => {
    const zoom = parseFloat(zoomStr);
    const matchExpression: any[] = ["match", ["coalesce", ["get", "sibling_index"], 0]];
    
    for (let sibling_index = 0; sibling_index < 24; sibling_index++) {
      const circleIndex = Math.floor(sibling_index / 12);
      const indexInCircle = sibling_index % 12;
      const theta = (indexInCircle * 2 * Math.PI) / 12;
      const radiusFactor = 1 + circleIndex * 0.5;
      const r = baseRadius * radiusFactor;
      const ox = Math.round(r * Math.sin(theta));
      const oy = Math.round(-r * Math.cos(theta));
      matchExpression.push(sibling_index, ["literal", [ox, oy]]);
    }
    
    matchExpression.push(["literal", [0, 0]]);
    
    const caseExpression = [
      "case",
      ["coalesce", ["get", "needs_spiderfy"], false],
      matchExpression,
      ["literal", [0, 0]]
    ];
    
    interpExpr.push(zoom, caseExpression);
  });
  
  return interpExpr;
}
export function addAvatarLayers(map: MapLibreMap) {
  if (areAvatarsDisabledForDiag()) {
    removeAvatarRuntimeLayersForDiag(map);
    return;
  }
  if (isAvatarPipelineSuppressed()) return;

  // Always ensure source is created first!
  ensureAvatarSource(map);
  const avatarDiag = getAvatarDiagCapabilities();
  if (typeof window !== "undefined") {
    (window as any).__MEEWAV_AVATAR_DIAG__ = avatarDiag;
  }

  if (typeof window !== "undefined" && (window as any).__MEEWAV_USE_LEGACY_FLUID_CIRCLES__ === true) {
    addLegacyFluidCircleLayers(map);
    return;
  }

  if (ENABLE_PACK5_AVATAR_LAYER) {
    ensurePack5Source(map);
  }

  if (avatarDiag.hover && !map.getSource(AVATAR_HOVER_SOURCE_ID)) {
    map.addSource(AVATAR_HOVER_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
    } as any);
  }

  if (AVATAR_LABEL_MODE === "all" && !map.getSource(AVATAR_VISIBLE_LABELS_SOURCE_ID)) {
    map.addSource(AVATAR_VISIBLE_LABELS_SOURCE_ID, {
      type: "geojson",
      data: emptyFeatureCollection(),
      promoteId: "profile_id",
    } as any);
  }

  const isOverlayEnabled = () => {
    if (typeof window === "undefined") return false;
    const params = new URLSearchParams(window.location.search);

    // MapLibre/MVT is the canonical renderer. DOM overlay is opt-in debug only,
    // never enabled by localhost or old localStorage flags.
    return params.get("domAvatarOverlay") === "1" || params.get("forceRawOverlay") === "1";
  };
  const overlayActive = isOverlayEnabled();
  const avatarIconImageExpression = getRuntimeAvatarIconImageExpression();

  const clusterLayers = [
    "meewav-clusters-country",
    "meewav-cluster-count-country",
    "meewav-cluster-city-name-country",
    "meewav-clusters-macro",
    "meewav-cluster-count-macro",
    "meewav-clusters-mid",
    "meewav-cluster-count-mid",
    "meewav-clusters-local",
    "meewav-cluster-count-local",
    "meewav-clusters-micro",
    "meewav-cluster-count-micro",
    "meewav-clusters-nano",
    "meewav-cluster-count-nano",
    "meewav-avatar-ground-shadow",
    "meewav-avatar-points",
    "meewav-horizon-impostor-points",
    CURRENT_USER_AURA_LAYER_ID,
    CURRENT_USER_AURA_INNER_LAYER_ID,
    "meewav-avatar-points-normal",
    "artist-names-layer",
    AVATAR_VISIBLE_LABELS_LAYER_ID,
    AVATAR_HOVER_POINTS_LAYER_ID,
    AVATAR_HOVER_NAME_LAYER_ID,
    "artist-hit-layer",
    "meewav-avatar-points-selected",
    "meewav-avatar-points-hit",
    "meewav-avatar-points-far",
    "meewav-avatar-points-mid",
    "meewav-avatar-points-near",
    "meewav-avatar-tile-carrier",
    "meewav-pack5-avatar-symbols"
  ];

  const forceAvatarLayerRecreation =
    typeof window !== "undefined" &&
    (window as any).__MEEWAV_FORCE_AVATAR_LAYER_RECREATE__ === true;

  if (forceAvatarLayerRecreation) {
    clusterLayers.forEach(l => {
      if (map.getLayer(l)) {
        map.removeLayer(l);
      }
    });
  }

  const sourceLayerConfig = shouldUseVectorTileServer()
    ? { "source-layer": "musicians" }
    : {};

  const forbiddenClusterLayerIds = [
    "meewav-clusters-country",
    "meewav-cluster-count-country",
    "meewav-cluster-city-name-country",
    "meewav-clusters-macro",
    "meewav-cluster-count-macro",
    "meewav-clusters-mid",
    "meewav-cluster-count-mid",
    "meewav-clusters-local",
    "meewav-cluster-count-local",
    "meewav-clusters-micro",
    "meewav-cluster-count-micro",
    "meewav-clusters-nano",
    "meewav-cluster-count-nano",
  ];
  for (const layerId of forbiddenClusterLayerIds) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, "visibility", "none");
    }
  }

  // Product contract: distant views show geographic zones only. Avatar
  // aggregation is never represented by circles or numbered clusters.
  const disableClusters = true;
  const disableAvatars = typeof window !== "undefined" && (window as any).__MEEWAV_DISABLE_AVATARS_TEST__ === true;
  const useCanvasAvatarOverlay = typeof window !== "undefined" && (window as any).__MEEWAV_AVATAR_RENDER_MODE__ === "canvas";

  if (!disableClusters) {
    // 1. COUNTRY LAYER (crossfades into macro around z 8.5)
    if (!map.getLayer("meewav-clusters-country")) {
      map.addLayer({
        id: "meewav-clusters-country",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "country"],
        paint: {
          "circle-radius": [
            "step",
            ["coalesce", ["get", "point_count"], 0],
            18,
            1000, 21,
            3000, 24,
            6000, 27,
            10000, 30
          ],
          "circle-color": "#7E4CFF",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.92, 8.35, 0.92, 9.05, 0],
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8.35, 1, 9.05, 0]
        }
      } as any);

      map.addLayer({
        id: "meewav-cluster-count-country",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "country"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [0, 0],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8.35, 1, 9.05, 0]
        }
      } as any);

      // Dedicated city name label layer underneath the circle
      map.addLayer({
        id: "meewav-cluster-city-name-country",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "country"],
        layout: {
          "text-field": ["coalesce", ["get", "city_name"], ["get", "name"], ""],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-anchor": "top",
          "text-offset": [
            "step",
            ["coalesce", ["get", "point_count"], 0],
            ["literal", [0, 1.6]],
            1000, ["literal", [0, 1.8]],
            3000, ["literal", [0, 2.0]],
            6000, ["literal", [0, 2.2]],
            10000, ["literal", [0, 2.4]]
          ],
          "symbol-sort-key": ["-", ["coalesce", ["get", "point_count"], 0]],
          "text-allow-overlap": true,
          "text-ignore-placement": true
        },
        paint: {
          "text-color": "#D8C8FF",
          "text-halo-color": "#160A28",
          "text-halo-width": 2.0,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 0, 1, 8.35, 1, 9.05, 0]
        }
      } as any);
    }

    // 2. MACRO LAYER (premium split overlap with country and mid)
    if (!map.getLayer("meewav-clusters-macro")) {
      map.addLayer({
        id: "meewav-clusters-macro",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "macro"],
        paint: {
          "circle-radius": 30,
          "circle-color": "#7E4CFF",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 8.15, 0, 8.5, 0.92, 10.25, 0.92, 10.85, 0],
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 8.15, 0, 8.5, 1.0, 10.25, 1.0, 10.85, 0]
        }
      } as any);

      map.addLayer({
        id: "meewav-cluster-count-macro",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "macro"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [0, 0],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.15, 0, 8.5, 1.0, 10.25, 1.0, 10.85, 0]
        }
      } as any);
    }

    // 3. MID LAYER (premium split overlap with macro and local)
    if (!map.getLayer("meewav-clusters-mid")) {
      map.addLayer({
        id: "meewav-clusters-mid",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "mid"],
        paint: {
          "circle-radius": 25,
          "circle-color": "#7E4CFF",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10.15, 0, 10.5, 0.92, 12.25, 0.92, 12.85, 0],
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 10.15, 0, 10.5, 1.0, 12.25, 1.0, 12.85, 0]
        }
      } as any);

      map.addLayer({
        id: "meewav-cluster-count-mid",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "mid"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [0, 0],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
          "text-opacity": ["interpolate", ["linear"], ["zoom"], 10.15, 0, 10.5, 1.0, 12.25, 1.0, 12.85, 0]
        }
      } as any);
    }

    // 4. LOCAL LAYER (premium split overlap with mid and micro)
    if (!map.getLayer("meewav-clusters-local")) {
      map.addLayer({
        id: "meewav-clusters-local",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 14.75,
        maxzoom: 15.20,
        ...sourceLayerConfig,
        filter: ["all", ["==", ["get", "cluster_level"], "local"], [">=", ["get", "point_count"], 3500]],
        paint: {
          "circle-radius": 20,
          "circle-color": "#7E4CFF",
          "circle-opacity": 0.92,
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 1.0
        }
      } as any);

      map.addLayer({
        id: "meewav-cluster-count-local",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "local"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 13,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-offset": [0, 0],
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            12.50, 0,
            13.00, 1.0,
            14.75, 1.0,
            15.00, 0
          ]
        }
      } as any);
    }

    // 5. MICRO LAYER (premium split overlap with local and nano)
    if (!map.getLayer("meewav-clusters-micro")) {
      map.addLayer({
        id: "meewav-clusters-micro",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "micro"],
        paint: {
          "circle-radius": 17,
          "circle-color": "#7E4CFF",
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 13.15, 0, 13.5, 0.92, 13.85, 0.92, 14.15, 0],
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 13.15, 0, 13.5, 1.0, 13.85, 1.0, 14.15, 0]
        }
      } as any);

      map.addLayer({
        id: "meewav-cluster-count-micro",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 24,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "micro"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": 11,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
        }
      } as any);
    }

    // 6. NANO LAYER (split bridge between micro clusters and avatars)
    if (!map.getLayer("meewav-clusters-nano")) {
      map.addLayer({
        id: "meewav-clusters-nano",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        minzoom: 15.20,
        maxzoom: 15.20,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "nano"],
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13.5, 28, // 56px diameter
            15.5, 36  // 72px diameter
          ],
          "circle-color": "#7E4CFF",
          "circle-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.20, 0.92,
            15.50, 0.92,
            15.80, 0
          ],
          "circle-stroke-color": "#D8C8FF",
          "circle-stroke-width": 1.5,
          "circle-stroke-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.20, 1.0,
            15.50, 1.0,
            15.80, 0
          ]
        }
      } as any);
 
      map.addLayer({
        id: "meewav-cluster-count-nano",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        minzoom: 15.20,
        maxzoom: 15.20,
        ...sourceLayerConfig,
        filter: ["==", ["get", "cluster_level"], "nano"],
        layout: {
          "text-field": [
            "coalesce",
            ["get", "display_count_text"],
            ["to-string", ["get", "point_count"]]
          ],
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            13.5, 12,
            15.5, 15
          ],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-anchor": "center"
        },
        paint: {
          "text-color": "#FFFFFF",
          "text-halo-color": "#160A28",
          "text-halo-width": 1.5,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.20, 1.0,
            15.50, 1.0,
            15.80, 0
          ]
        }
      } as any);
    }
  }

  if (useCanvasAvatarOverlay && !map.getLayer("meewav-avatar-tile-carrier")) {
    map.addLayer({
      id: "meewav-avatar-tile-carrier",
      type: "circle",
      source: AVATAR_SOURCE_ID,
      ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
      filter: ["==", ["get", "cluster_level"], "avatar"],
      paint: {
        "circle-radius": 0.01,
        "circle-color": "rgba(0,0,0,0)",
        "circle-opacity": 0,
        "circle-stroke-opacity": 0
      }
    } as any);
  }

  if (!disableAvatars && !useCanvasAvatarOverlay) {
    const pointsFilter = ["==", ["get", "cluster_level"], "avatar"];

    if (!isCharonneAvatarStressEnabled() && !map.getLayer("meewav-avatar-ground-shadow")) {
      map.addLayer({
        id: "meewav-avatar-ground-shadow",
        type: "circle",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: pointsFilter as any,
        layout: {
          visibility: overlayActive || isCharonneAvatarStressEnabled() ? "none" : "visible"
        },
        paint: {
          "circle-radius": isCharonneAvatarStressEnabled() ? 0 : 5,
          "circle-color": "rgba(0,0,0,0.35)",
          "circle-blur": 0.6,
          "circle-opacity": isCharonneAvatarStressEnabled() ? 0 : [
            "interpolate",
            ["linear"],
            ["zoom"],
            16.00, 0,
            17.60, 0.45,
            20, 0.65
          ]
        }
      } as any);
    }

    const rawArtistNameExpression = [
      "to-string",
      [
        "coalesce",
        ["get", "display_name"],
        ["get", "displayName"],
        ["get", "username"],
        ["get", "artist_name"],
        ["get", "artistName"],
        ["get", "name"],
        ["get", "handle"],
        ["get", "profile_slug"],
        ""
      ]
    ];
    const normalizedArtistNameExpression = ["downcase", rawArtistNameExpression];
    const generatedArtistNameExpression = [
      "concat",
      "Guitare Rig ",
      ["to-string", ["coalesce", ["get", "avatar_render_rank"], ["get", "render_rank"], ["get", "id"], 33]]
    ];
    const artistNameExpression = [
      "case",
      [
        "any",
        ["==", rawArtistNameExpression, ""],
        ["==", ["slice", normalizedArtistNameExpression, 0, 8], "charonne"],
        ["==", ["slice", normalizedArtistNameExpression, 0, 6], "avatar"],
        ["==", ["slice", normalizedArtistNameExpression, 0, 6], "profil"],
        ["==", ["slice", normalizedArtistNameExpression, 0, 4], "mock"]
      ],
      generatedArtistNameExpression,
      ["coalesce", rawArtistNameExpression, generatedArtistNameExpression]
    ];
    const normalFilter = [
      "all",
      ["==", ["get", "cluster_level"], "avatar"],
      ["!", ["coalesce", ["get", "selected"], ["get", "active"], ["get", "is_selected"], ["get", "is_active"], false]]
    ];

    const selectedFilter = [
      "all",
      ["==", ["get", "cluster_level"], "avatar"],
      ["coalesce", ["get", "selected"], ["get", "active"], ["get", "is_selected"], ["get", "is_active"], false]
    ];
    const hitFilter = [
      "all",
      ["==", ["get", "cluster_level"], "avatar"],
      ["!", ["has", "point_count"]],
      ["!=", ["get", "cluster"], true]
    ];
    const currentUserVisibilityFilter = avatarDiag.enabled && !avatarDiag.currentUser
      ? ["!=", ["coalesce", ["get", "is_current_user"], false], true]
      : true;

    normalFilter.push(currentUserVisibilityFilter as any);
    hitFilter.push(currentUserVisibilityFilter as any);
    const collisionLabelFilter = [
      "all",
      ...hitFilter.slice(1),
      [
        "any",
        ["==", ["get", "is_current_user"], true],
        ["coalesce", ["get", "selected"], ["get", "active"], ["get", "is_selected"], ["get", "is_active"], false],
        ["coalesce", ["get", "alwaysShowLabel"], ["get", "always_show_label"], false],
        [
          "<=",
          ["to-number", ["coalesce", ["get", "labelTier"], 1]],
          ["step", ["zoom"], 1, 16.4, 2, 17.4, 3]
        ]
      ]
    ];

    const avatarSizeScaleExpression = [
      "case",
      ["==", ["get", "is_current_user"], true],
      1,
      ["to-number", ["coalesce", ["get", "size_scale"], 1]],
    ];
    const currentUserScaleExpression = [
      "case",
      ["==", ["get", "is_current_user"], true],
      HOST_AVATAR_SIZE_MULTIPLIER,
      1,
    ];
    const charonneStressSizeExpression = [
      "*",
      CHARONNE_STRESS_AVATAR_ICON_SIZE,
      avatarSizeScaleExpression,
      currentUserScaleExpression,
    ];
    const avatarSortKeyExpression = [
      "case",
      ["==", ["get", "is_current_user"], true],
      999999,
      ["to-number", ["coalesce", ["get", "avatar_render_rank"], ["get", "render_rank"], 0]]
    ];
    const normalSizeExpression = isCharonneAvatarStressEnabled()
      ? charonneStressSizeExpression
      : ["*", 0.135 * AVATAR_ICON_SIZE_MULTIPLIER, avatarSizeScaleExpression, currentUserScaleExpression];
    const hoverSizeExpression = ["min", ["*", normalSizeExpression, 4], 0.68];
    const selectedSizeExpression = isCharonneAvatarStressEnabled()
      ? charonneStressSizeExpression
      : ["*", 0.145 * AVATAR_ICON_SIZE_MULTIPLIER, avatarSizeScaleExpression, currentUserScaleExpression];
    const paintExpression = buildRuntimeAvatarIconOpacityExpression();

    // Real avatars setup:

    if (!map.getLayer(AVATAR_POINTS_HIT_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_POINTS_HIT_LAYER_ID,
        type: "circle",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: hitFilter as any,
        layout: {
          visibility: "visible"
        },
        paint: {
          "circle-radius": 19,
          "circle-color": "rgba(0,0,0,0)",
          "circle-opacity": 0,
          "circle-stroke-opacity": 0,
          "circle-translate": [0, -28],
          "circle-translate-anchor": "viewport",
          "circle-pitch-alignment": "viewport",
          "circle-pitch-scale": "viewport"
        }
      } as any);
    }

    if (map.getLayer(AVATAR_POINTS_LEGACY_HIT_LAYER_ID)) {
      map.removeLayer(AVATAR_POINTS_LEGACY_HIT_LAYER_ID);
    }

    if (avatarDiag.currentUser && !map.getLayer(CURRENT_USER_AURA_LAYER_ID)) {
      map.addLayer({
        id: CURRENT_USER_AURA_LAYER_ID,
        type: "circle",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: [
          "all",
          ["==", ["get", "cluster_level"], "avatar"],
          ["==", ["get", "is_current_user"], true]
        ] as any,
        layout: {
          visibility: overlayActive ? "none" : "visible"
        },
        paint: {
          "circle-radius": AVATAR_GROUND_REPERE_OUTER_RADIUS,
          "circle-color": "rgba(126, 76, 255, 0.04)",
          "circle-opacity": 1,
          "circle-blur": 0,
          "circle-stroke-color": "rgba(190, 164, 255, 0.92)",
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0.92,
          "circle-pitch-alignment": AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
          "circle-pitch-scale": AVATAR_GROUND_REPERE_PITCH_SCALE
        }
      } as any);
    }

    if (avatarDiag.currentUser && !map.getLayer(CURRENT_USER_AURA_INNER_LAYER_ID)) {
      map.addLayer({
        id: CURRENT_USER_AURA_INNER_LAYER_ID,
        type: "circle",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: [
          "all",
          ["==", ["get", "cluster_level"], "avatar"],
          ["==", ["get", "is_current_user"], true]
        ] as any,
        layout: {
          visibility: overlayActive ? "none" : "visible"
        },
        paint: {
          "circle-radius": AVATAR_GROUND_REPERE_INNER_RADIUS,
          "circle-color": "rgba(126, 76, 255, 0.08)",
          "circle-opacity": 1,
          "circle-blur": 0,
          "circle-stroke-color": "rgba(190, 164, 255, 0.82)",
          "circle-stroke-width": 1.35,
          "circle-stroke-opacity": 0.72,
          "circle-pitch-alignment": AVATAR_GROUND_REPERE_PITCH_ALIGNMENT,
          "circle-pitch-scale": AVATAR_GROUND_REPERE_PITCH_SCALE
        }
      } as any);
    }

    if (!map.getLayer(AVATAR_POINTS_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_POINTS_LAYER_ID,
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: normalFilter as any,
        layout: {
          visibility: overlayActive ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": normalSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 0]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source",
          "symbol-sort-key": avatarSortKeyExpression
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);

      avatarDebugLog("avatar overlap normal", map.getLayoutProperty(AVATAR_POINTS_LAYER_ID, "icon-allow-overlap"));
    }

    if (!avatarDiag.enabled && !isCharonneAvatarStressEnabled() && !map.getLayer(AVATAR_POINTS_SELECTED_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_POINTS_SELECTED_LAYER_ID,
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: selectedFilter as any,
        layout: {
          visibility: overlayActive || isCharonneAvatarStressEnabled() ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": selectedSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 0]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source",
          "symbol-sort-key": avatarSortKeyExpression
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);

      avatarDebugLog("avatar overlap selected", map.getLayoutProperty(AVATAR_POINTS_SELECTED_LAYER_ID, "icon-allow-overlap"));
    }

    if (map.getLayer(AVATAR_NAMES_LAYER_ID)) {
      map.removeLayer(AVATAR_NAMES_LAYER_ID);
    }

    const collisionLabelMode = AVATAR_LABEL_MODE === "collision";
    const expectedLabelSourceId = collisionLabelMode ? AVATAR_SOURCE_ID : AVATAR_VISIBLE_LABELS_SOURCE_ID;
    const existingLabelLayer = map.getLayer(AVATAR_VISIBLE_LABELS_LAYER_ID) as { source?: string } | undefined;

    if (existingLabelLayer && existingLabelLayer.source !== expectedLabelSourceId) {
      try {
        map.removeLayer(AVATAR_VISIBLE_LABELS_LAYER_ID);
      } catch {
        // The style can be mid-reload; the next ensure pass retries the repair.
      }
    }

    if (!map.getLayer(AVATAR_VISIBLE_LABELS_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_VISIBLE_LABELS_LAYER_ID,
        type: "symbol",
        source: expectedLabelSourceId,
        ...(collisionLabelMode ? sourceLayerConfig : {}),
        ...(collisionLabelMode ? { filter: collisionLabelFilter as any } : {}),
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        layout: {
          visibility: overlayActive ? "none" : "visible",
          "text-field": artistNameExpression,
          "text-font": ["Noto Sans Regular"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.0, ["case", ["==", ["get", "is_current_user"], true], 11.7, 9.6],
            16.2, ["case", ["==", ["get", "is_current_user"], true], 12.6, 10.6],
            17.2, ["case", ["==", ["get", "is_current_user"], true], 13.2, 11.6],
            18.2, ["case", ["==", ["get", "is_current_user"], true], 14.6, 13.0]
          ],
          "text-anchor": "top",
          "text-offset": [
            "case",
            ["==", ["get", "is_current_user"], true],
            ["literal", [0, 0.24]],
            ["literal", [0, 0.18]]
          ],
          "text-max-width": collisionLabelMode ? 12 : 24,
          "text-line-height": collisionLabelMode ? 1 : 1.2,
          "text-letter-spacing": 0,
          "text-allow-overlap": !collisionLabelMode,
          "text-ignore-placement": !collisionLabelMode,
          "text-optional": collisionLabelMode,
          "text-padding": collisionLabelMode ? 5 : 0,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source",
          "symbol-sort-key": collisionLabelMode
            ? [
                "case",
                ["==", ["get", "is_current_user"], true],
                -3000000,
                ["coalesce", ["get", "selected"], ["get", "active"], ["get", "is_selected"], ["get", "is_active"], false],
                -2000000,
                ["coalesce", ["get", "alwaysShowLabel"], ["get", "always_show_label"], false],
                -1000000,
                [
                  "to-number",
                  ["coalesce", ["get", "labelPriority"], ["get", "avatar_render_rank"], ["get", "render_rank"], 1000000]
                ]
              ]
            : ["to-number", ["coalesce", ["get", "sortKey"], 0]]
        },
        paint: {
          "text-color": collisionLabelMode
            ? ["case", ["==", ["get", "is_current_user"], true], "#ffffff", "rgba(255, 255, 255, 0.92)"]
            : ["case", ["==", ["get", "is_current_user"], true], "#ffffff", "#f7f0ff"],
          "text-halo-color": collisionLabelMode ? "rgba(5, 3, 18, 0.9)" : "#120426",
          "text-halo-width": collisionLabelMode
            ? ["case", ["==", ["get", "is_current_user"], true], 1.45, 1.2]
            : [
                "interpolate",
                ["linear"],
                ["zoom"],
                15.0, ["case", ["==", ["get", "is_current_user"], true], 2.1, 1.35],
                16.8, ["case", ["==", ["get", "is_current_user"], true], 2.7, 1.95],
                17.8, ["case", ["==", ["get", "is_current_user"], true], 3.0, 2.4]
              ],
          "text-halo-blur": collisionLabelMode ? 0.25 : 0.35,
          "text-opacity": getAvatarLabelTextOpacityExpression(
            collisionLabelMode ? "collision" : "all",
          )
        }
      } as any);
    }

    if (avatarDiag.hover && !map.getLayer(AVATAR_HOVER_POINTS_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_HOVER_POINTS_LAYER_ID,
        type: "symbol",
        source: AVATAR_HOVER_SOURCE_ID,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        layout: {
          visibility: overlayActive ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": hoverSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 58 + AVATAR_HOVER_VERTICAL_OFFSET_PX]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": false,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source",
          "symbol-sort-key": 9999999
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);
    }

    if (avatarDiag.hover && !map.getLayer(AVATAR_HOVER_NAME_LAYER_ID)) {
      map.addLayer({
        id: AVATAR_HOVER_NAME_LAYER_ID,
        type: "symbol",
        source: AVATAR_HOVER_SOURCE_ID,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        layout: {
          visibility: overlayActive ? "none" : "visible",
          "text-field": artistNameExpression,
          "text-font": ["Noto Sans Bold"],
          "text-size": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.0, 12.0,
            16.4, 13.5,
            17.6, 15.0,
            18.6, 16.0
          ],
          "text-anchor": "top",
          "text-offset": [
            "case",
            ["==", ["get", "is_current_user"], true],
            ["literal", [0, 2.45]],
            ["literal", [0, 2.2]]
          ],
          "text-max-width": 24,
          "text-letter-spacing": 0,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-optional": false,
          "text-padding": 10,
          "text-pitch-alignment": "viewport",
          "text-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source",
          "symbol-sort-key": 10000000
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#120426",
          "text-halo-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            15.0, 2.25,
            16.4, 2.75,
            17.6, 3.15
          ],
          "text-halo-blur": 0.35,
          "text-opacity": 1
        }
      } as any);
    }

    const buildFixedDepthSizeExpression = (depthScale: number) => [
      "*",
      [
        "case",
        ["coalesce", ["get", "selected"], ["get", "active"], ["get", "is_selected"], ["get", "is_active"], false],
        0.17 * depthScale,
        0.14 * depthScale,
      ],
      avatarSizeScaleExpression,
      currentUserScaleExpression,
    ];
    const farSizeExpression = isCharonneAvatarStressEnabled()
      ? charonneStressSizeExpression
      : buildFixedDepthSizeExpression(0.65);
    const midSizeExpression = isCharonneAvatarStressEnabled()
      ? charonneStressSizeExpression
      : buildFixedDepthSizeExpression(1);
    const nearSizeExpression = isCharonneAvatarStressEnabled()
      ? charonneStressSizeExpression
      : buildFixedDepthSizeExpression(1.05);

    if (!avatarDiag.enabled && !isCharonneAvatarStressEnabled() && !map.getLayer("meewav-avatar-points-far")) {
      map.addLayer({
        id: "meewav-avatar-points-far",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: ["==", ["get", "__never__"], "__never__"],
        layout: {
          visibility: overlayActive || isCharonneAvatarStressEnabled() ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": farSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 0]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source"
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);
    }

    if (!avatarDiag.enabled && !isCharonneAvatarStressEnabled() && !map.getLayer("meewav-avatar-points-mid")) {
      map.addLayer({
        id: "meewav-avatar-points-mid",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: ["==", ["get", "__never__"], "__never__"],
        layout: {
          visibility: overlayActive || isCharonneAvatarStressEnabled() ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": midSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 0]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source"
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);
    }

    if (!avatarDiag.enabled && !isCharonneAvatarStressEnabled() && !map.getLayer("meewav-avatar-points-near")) {
      map.addLayer({
        id: "meewav-avatar-points-near",
        type: "symbol",
        source: AVATAR_SOURCE_ID,
        ...sourceLayerConfig,
        minzoom: AVATAR_VISIBLE_MIN_ZOOM,
        filter: ["==", ["get", "__never__"], "__never__"],
        layout: {
          visibility: overlayActive || isCharonneAvatarStressEnabled() ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": nearSizeExpression,
          "icon-anchor": "bottom",
          "icon-offset": ["literal", [0, 0]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source"
        },
        paint: {
          "icon-opacity": paintExpression
        }
      } as any);
    }

    if (ENABLE_PACK5_AVATAR_LAYER && !map.getLayer("meewav-pack5-avatar-symbols")) {
      map.addLayer({
        id: "meewav-pack5-avatar-symbols",
        type: "symbol",
        source: "meewav-pack5-avatars",
        minzoom: 13.5,
        layout: {
          visibility: overlayActive ? "none" : "visible",
          "icon-image": avatarIconImageExpression,
          "icon-size": 0.28,
          "icon-anchor": "bottom",
          "icon-offset": [
            "match",
            ["coalesce", ["get", "packIndex"], 0],
            0, ["literal", [0, 0]],
            1, ["literal", [-10, -4]],
            2, ["literal", [10, -4]],
            3, ["literal", [-6, 8]],
            4, ["literal", [6, 8]],
            ["literal", [0, 0]]
          ],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-optional": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-placement": "point",
          "symbol-z-order": "source"
        },
        paint: {
          "icon-opacity": 0.72
        }
      } as any);
      avatarDebugLog("[Meewav] Layer meewav-pack5-avatar-symbols initialisé");
    }
  }

  if (!avatarDiag.enabled) {
    ensureHorizonImpostorLayer(map);
  }
  moveAvatarLayersToTop(map);

  if (typeof window !== "undefined" && ((window as any).__MEEWAV_PERF_CLEAN_MODE__ === true || isCharonneAvatarStressEnabled())) {
    if (typeof (window as any).__MEEWAV_DISABLE_AVATAR_PERF_COST_LAYERS__ === "function") {
      (window as any).__MEEWAV_DISABLE_AVATAR_PERF_COST_LAYERS__(map);
    }
  }

  if (typeof window !== "undefined") {
    (window as any).__MEEWAV_AVATAR_PIPELINE_DEBUG__ = {
      ...((window as any).__MEEWAV_AVATAR_PIPELINE_DEBUG__ || {}),
      mode: avatarDiag.enabled ? `AVATAR_DIAG_${avatarDiag.stage}` : "MAPLIBRE_AVATAR_LAYERS",
      avatarDiagStage: avatarDiag.stage,
      sourceId: AVATAR_SOURCE_ID,
      sourceLayer: shouldUseVectorTileServer() ? "musicians" : null,
      featureLimit: avatarDiag.featureLimit,
      sharedIcon: avatarDiag.sharedIcon,
      realImages: avatarDiag.realImages,
      currentUser: avatarDiag.currentUser,
      names: avatarDiag.names,
      hitLayer: avatarDiag.hitLayer,
      hover: avatarDiag.hover,
      prepopup: avatarDiag.prepopup,
      pinnedProfileSource: avatarDiag.pinnedProfileSource,
      activeLayer: map.getLayer(AVATAR_POINTS_LAYER_ID) ? AVATAR_POINTS_LAYER_ID : "none",
      updatedAt: Date.now(),
    };
    (window as any).__MEEWAV_LOG_AVATAR_PIPELINE_CHANGE__?.(
      avatarDiag.enabled ? `AVATAR_DIAG_${avatarDiag.stage}` : "MAPLIBRE_AVATAR_LAYERS",
      "avatarLayers.addAvatarLayers"
    );
  }

  avatarDebugLog("[Meewav layer check]", {
    source: !!map.getSource(AVATAR_SOURCE_ID),
    country: !!map.getLayer("meewav-clusters-country"),
    macro: !!map.getLayer("meewav-clusters-macro"),
    mid: !!map.getLayer("meewav-clusters-mid"),
    local: !!map.getLayer("meewav-clusters-local"),
    micro: !!map.getLayer("meewav-clusters-micro"),
    nano: !!map.getLayer("meewav-clusters-nano"),
    avatarsNormal: !!map.getLayer(AVATAR_POINTS_LAYER_ID),
    avatarsSelected: !!map.getLayer(AVATAR_POINTS_SELECTED_LAYER_ID)
  });
}

export function loadAvatarImagesToMap(map: MapLibreMap) {
  void preloadAvatarImages(map);
}

export function moveAvatarLayersToTop(map: MapLibreMap): boolean {
  const clusterLayers = [
    "meewav-clusters-country",
    "meewav-cluster-count-country",
    "meewav-cluster-city-name-country",
    "meewav-clusters-macro",
    "meewav-cluster-count-macro",
    "meewav-clusters-mid",
    "meewav-cluster-count-mid",
    "meewav-clusters-local",
    "meewav-cluster-count-local",
    "meewav-clusters-micro",
    "meewav-cluster-count-micro",
    "meewav-clusters-nano",
    "meewav-cluster-count-nano",
    "meewav-pack5-avatar-symbols"
  ];

  // Keep avatar symbols above the geographic selection guides and labels.
  const avatarLayers = [
    "meewav-profile-pin-repere-glow",
    "meewav-profile-pin-repere-outer",
    "meewav-profile-pin-repere-inner",
    "meewav-profile-pin-repere-center",
    "meewav-avatar-ground-shadow",
    CURRENT_USER_AURA_LAYER_ID,
    CURRENT_USER_AURA_INNER_LAYER_ID,
    "meewav-pinned-profile-halos",
    "meewav-pinned-profile-rings",
    "meewav-horizon-impostor-points",
    AVATAR_POINTS_LAYER_ID,
    AVATAR_POINTS_SELECTED_LAYER_ID,
    "meewav-avatar-points-far",
    "meewav-avatar-points-mid",
    "meewav-avatar-points-near",
    AVATAR_VISIBLE_LABELS_LAYER_ID,
    "meewav-profile-pin-repere-label",
    AVATAR_HOVER_POINTS_LAYER_ID,
    AVATAR_HOVER_NAME_LAYER_ID,
    "meewav-pinned-profile-labels",
    AVATAR_POINTS_HIT_LAYER_ID
  ];

  const layerIds = (map.getStyle().layers ?? []).map((layer) => layer.id);
  const orderedLayers = [...clusterLayers, ...avatarLayers].filter((layerId) => map.getLayer(layerId) && layerIds.includes(layerId));
  if (!orderedLayers.length) return false;

  const referenceLayerIds = [
    "selected-zone-hover-glow",
    "selected-zone-outline",
    "selected-zone-labels"
  ];
  const maxReferenceIndex = Math.max(
    -1,
    ...referenceLayerIds
      .map((layerId) => layerIds.indexOf(layerId))
      .filter((index) => index >= 0)
  );

  let lastLayerIndex = -1;
  const alreadyOrderedAboveReferences = orderedLayers.every((layerId) => {
    const layerIndex = layerIds.indexOf(layerId);
    const inOrder = layerIndex > lastLayerIndex;
    lastLayerIndex = layerIndex;
    return inOrder;
  }) && layerIds.indexOf(orderedLayers[0]) > maxReferenceIndex;

  if (alreadyOrderedAboveReferences) return false;

  orderedLayers.forEach(l => {
    if (map.getLayer(l)) {
      map.moveLayer(l);
    }
  });
  return true;
}

function scheduleAvatarWatchdog(map: MapLibreMap) {
  const existingTimer = avatarWatchdogTimers.get(map);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }

  const timer = window.setTimeout(() => {
    avatarWatchdogTimers.delete(map);
    runAvatarWatchdog(map);
  }, 850);

  avatarWatchdogTimers.set(map, timer);
}

function scheduleAvatarWatchdogWhenStable(map: MapLibreMap, reason: string) {
  if (isMeewavCameraBusy() || map.isMoving() || map.isZooming() || map.isRotating()) {
    deferUntilCameraIdle({
      id: "avatar-watchdog",
      run: () => scheduleAvatarWatchdog(map),
      timeoutMs: 1500,
    });
    return;
  }

  avatarDebugLog("[Meewav avatar watchdog scheduled]", reason);
  scheduleAvatarWatchdog(map);
}

function runAvatarWatchdog(map: MapLibreMap) {
  if (isAvatarPipelineSuppressed() || areAvatarsDisabledForDiag()) return;
  if (map.isMoving() || map.isZooming() || map.isRotating()) return;
  if (map.getZoom() < AVATAR_WATCHDOG_VISIBLE_ZOOM) return;
  if (!map.getSource(AVATAR_SOURCE_ID) || !map.getLayer(AVATAR_POINTS_LAYER_ID)) return;

  const renderedCount = safeQueryRenderedFeatures(map, [AVATAR_POINTS_LAYER_ID]).length;
  if (renderedCount > 0) return;

  moveAvatarLayersToTop(map);
  map.triggerRepaint?.();

  avatarDebugLog("[MEEWAV_AVATAR_WATCHDOG_REPAINT_ONLY]", {
    zoom: map.getZoom(),
    renderedCount,
  });
}

function installAvatarLayerRepairHandlers(map: MapLibreMap) {
  if (avatarRepairHandlersInstalled.has(map)) return;
  avatarRepairHandlersInstalled.add(map);

  map.on("idle", () => {
    if (isAvatarPipelineSuppressed() || areAvatarsDisabledForDiag()) return;

    if (!map.getSource(AVATAR_SOURCE_ID) || !map.getLayer(AVATAR_POINTS_LAYER_ID)) {
      addAvatarLayers(map);
    }
    scheduleAvatarWatchdogWhenStable(map, "idle");
  });

  map.on("styledata", () => {
    if (isAvatarPipelineSuppressed() || areAvatarsDisabledForDiag()) return;

    if (map.getSource(AVATAR_SOURCE_ID) && !map.getLayer(AVATAR_POINTS_LAYER_ID)) {
      addAvatarLayers(map);
    }
    if (!map.isMoving() && !map.isZooming() && !map.isRotating()) {
      moveAvatarLayersToTop(map);
    }
  });

  map.on("moveend", () => {
    if (isAvatarPipelineSuppressed() || areAvatarsDisabledForDiag()) return;
    if (isContinuousZoomingRef.current) return;

    const updateAfterCamera = () => {
      if (!(typeof window !== "undefined" && (window as any).__MEEWAV_DISABLE_AVATAR_RECALC__ === true)) {
        triggerOcclusionUpdate(map);
      }
      scheduleAvatarWatchdogWhenStable(map, "moveend");
    };

    if (isMeewavCameraBusy() || map.isMoving() || map.isZooming() || map.isRotating()) {
      deferUntilCameraIdle({
        id: "avatar-moveend-refresh",
        run: updateAfterCamera,
        timeoutMs: 1500,
      });
    } else {
      updateAfterCamera();
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MEEWAV_CONSERVATION === true) {
      avatarDebugLog("[Meewav anchor/occlusion recalculated]", {
        zoom: map.getZoom(),
        time: performance.now()
      });
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MEEWAV_CONSERVATION === true) {
      avatarDebugLog("[Meewav camera]", {
        zoom: map.getZoom(),
        center: map.getCenter(),
        pitch: map.getPitch(),
        bearing: map.getBearing()
      });
    }
  });
}

export function ensureAvatarLayers(map: MapLibreMap) {
  if (areAvatarsDisabledForDiag()) {
    removeAvatarRuntimeLayersForDiag(map);
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_AVATAR_PIPELINE_DEBUG__ = {
        mode: "DISABLED_FOR_DIAG",
        sourceFeatureCount: 0,
        renderedIdsCount: 0,
        lockedIdsCount: 0,
        activeLayer: "none",
        updatedAt: Date.now()
      };
      (window as any).__MEEWAV_LOG_AVATAR_PIPELINE_CHANGE__?.(
        "DISABLED_FOR_DIAG",
        "avatarLayers.ensureAvatarLayers.avatarDiag.none"
      );
    }
    return;
  }

  if (isAvatarPipelineSuppressed()) {
    if (typeof window !== "undefined") {
      (window as any).__MEEWAV_AVATAR_PIPELINE_DEBUG__ = {
        mode: "MAP_MECHANICS_ONLY",
        sourceFeatureCount: 0,
        renderedIdsCount: 0,
        lockedIdsCount: 0,
        activeLayer: "none",
        updatedAt: Date.now()
      };
      (window as any).__MEEWAV_LOG_AVATAR_PIPELINE_CHANGE__?.(
        "MAP_MECHANICS_ONLY",
        "avatarLayers.ensureAvatarLayers.suppressed"
      );
    }
    return;
  }

  ensureAvatarSource(map);

  if (typeof window !== 'undefined') {
    (window as any).map = map;
    (window as any).__MEEWAV_MAP__ = map;
    
    // Automatically disable anchor debug mode by default on startup
    if ((window as any).__MEEWAV_ANCHOR_DEBUG__ === undefined) {
      (window as any).__MEEWAV_ANCHOR_DEBUG__ = false;
    }

    (window as any).toggleAnchorDebug = (enable?: boolean) => {
      const current = (window as any).__MEEWAV_ANCHOR_DEBUG__ === true;
      const next = enable !== undefined ? enable : !current;
      (window as any).__MEEWAV_ANCHOR_DEBUG__ = next;
      avatarDebugLog(`[Meewav] Anchor Debug Mode: ${next ? "ENABLED" : "DISABLED"}`);
      
      const debugLines = map.getLayer("debug-anchors-lines");
      const realPoints = map.getLayer("debug-real-points");
      const anchorPoints = map.getLayer("debug-anchor-points");

      const visibility = next ? "visible" : "none";
      if (debugLines) map.setLayoutProperty("debug-anchors-lines", "visibility", visibility);
      if (realPoints) map.setLayoutProperty("debug-real-points", "visibility", visibility);
      if (anchorPoints) map.setLayoutProperty("debug-anchor-points", "visibility", visibility);

      if (next) {
        updateDebugLayers(map);
      }
    };

    (window as any).__MEEWAV_SET_VISUAL_TEST_MODE__ = (mode: MeewavVisualTestMode) => {
      (window as any).__MEEWAV_VISUAL_TEST_MODE__ = mode;
      avatarDebugLog(`[Meewav] Visual Test Mode set to: ${mode}`);
      
      const normalSizeExpression = 0.135 * AVATAR_ICON_SIZE_MULTIPLIER;
      const selectedSizeExpression = 0.145 * AVATAR_ICON_SIZE_MULTIPLIER;
      let baseExpr;
      if (mode === "depth_soft") {
        baseExpr = normalSizeExpression;
      } else {
        // current
        baseExpr = normalSizeExpression;
      }
      
      if (map.getLayer(AVATAR_POINTS_LAYER_ID)) {
        const expr = mode === "social_stable" ? normalSizeExpression : baseExpr;
        map.setLayoutProperty(AVATAR_POINTS_LAYER_ID, "icon-size", expr);
        avatarDebugLog(`[Meewav] Dynamic layout property applied to layer: ${AVATAR_POINTS_LAYER_ID}`);
      }
      if (map.getLayer(AVATAR_POINTS_SELECTED_LAYER_ID)) {
        const expr = mode === "social_stable" ? selectedSizeExpression : baseExpr;
        map.setLayoutProperty(AVATAR_POINTS_SELECTED_LAYER_ID, "icon-size", expr);
        avatarDebugLog(`[Meewav] Dynamic layout property applied to layer: ${AVATAR_POINTS_SELECTED_LAYER_ID}`);
      }
    };

    (window as any).debugAvatars = () => {
      const sourceId = "meewav-avatars";
      const hasSource = !!map.getSource(sourceId);
      console.log("=== MEEWAV AVATARS DEBUG AUDIT ===");
      console.log("Source active :", sourceId, "(Existe :", hasSource, ")");
      console.log("Zoom actuel :", map.getZoom());
      console.log("Projection actuelle :", (map.getProjection() as any)?.name);
      
      console.log("HAS avatar_7", map.hasImage("avatar_7"));
      if (map.getLayer(AVATAR_POINTS_LAYER_ID)) {
        console.log("avatar layer normal icon-image", map.getLayoutProperty(AVATAR_POINTS_LAYER_ID, "icon-image"));
      }
      if (map.getLayer(AVATAR_POINTS_SELECTED_LAYER_ID)) {
        console.log("avatar layer selected icon-image", map.getLayoutProperty(AVATAR_POINTS_SELECTED_LAYER_ID, "icon-image"));
      }
      
      const normalCount = map.getLayer(AVATAR_POINTS_LAYER_ID) ? safeQueryRenderedFeatures(map, [AVATAR_POINTS_LAYER_ID]).length : 0;
      const selectedCount = map.getLayer(AVATAR_POINTS_SELECTED_LAYER_ID) ? safeQueryRenderedFeatures(map, [AVATAR_POINTS_SELECTED_LAYER_ID]).length : 0;
      console.log("avatar features", normalCount + selectedCount, `(normal: ${normalCount}, selected: ${selectedCount})`);
      
      if (hasSource) {
        const queryOpts = shouldUseVectorTileServer() ? { sourceLayer: "musicians" } : undefined;
        const features = map.querySourceFeatures(sourceId, queryOpts);
        console.log("Nombre total de features chargées dans la source :", features.length);
        console.log("Features détaillées :", features.map(f => ({
          id: f.id,
          type: f.type,
          properties: f.properties,
          geometry: f.geometry
        })));
        
        const clusters = features.filter(f => f.properties?.cluster === true || f.properties?.point_count !== undefined);
        const points = features.filter(f => f.properties?.cluster !== true && f.properties?.point_count === undefined);
        console.log(`- Clusterisés : ${clusters.length}`);
        console.log(`- Individuels (points) : ${points.length}`);
      }
      
      const layers = [
        AVATAR_POINTS_LAYER_ID,
        AVATAR_POINTS_SELECTED_LAYER_ID,
        "meewav-clusters-country",
        "meewav-cluster-count-country",
        "meewav-clusters-macro",
        "meewav-cluster-count-macro",
        "meewav-clusters-mid",
        "meewav-cluster-count-mid",
        "meewav-clusters-local",
        "meewav-cluster-count-local"
      ];
      layers.forEach(layerId => {
        const layer = map.getLayer(layerId);
        console.log(`Couche "${layerId}" :`, layer ? "Présente" : "Absente", layer ? {
          visible: map.getLayoutProperty(layerId, "visibility") !== "none",
          minzoom: (layer as any).minzoom,
          maxzoom: (layer as any).maxzoom
        } : {});
      });
      console.log("==================================");
    };

    (window as any).__MEEWAV_AUDIT_ARTIST_GRADES__ = () => {
      const sourceId = AVATAR_SOURCE_ID;
      const queryOpts = shouldUseVectorTileServer() ? { sourceLayer: "musicians" } : undefined;
      const byId = new Map<string, any>();
      const collect = (feature: any) => {
        const properties = feature?.properties ?? {};
        const id = String(properties.profile_id ?? properties.id ?? feature?.id ?? "");
        if (!id) return;
        if (properties.cluster === true || properties.cluster === "true" || properties.point_count !== undefined) return;
        byId.set(id, properties);
      };

      try {
        if (map.getSource(sourceId)) {
          map.querySourceFeatures(sourceId, queryOpts as any).forEach(collect);
        }
      } catch {
        // Source queries can fail transiently while vector tiles are loading.
      }

      try {
        safeQueryRenderedFeatures(map, [
          AVATAR_POINTS_LAYER_ID,
          AVATAR_POINTS_SELECTED_LAYER_ID
        ]).forEach(collect);
      } catch {
        // Rendered queries are best-effort for a dev audit.
      }

      const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0
      };
      let missingGradeCount = 0;

      byId.forEach((properties) => {
        const grade = Number(properties.grade_stars);
        if (Number.isInteger(grade) && grade >= 1 && grade <= 5) {
          distribution[grade as 1 | 2 | 3 | 4 | 5] += 1;
        } else {
          missingGradeCount += 1;
        }
      });

      const audit = {
        totalArtists: byId.size,
        missingGradeCount,
        distribution,
        sourceMode: shouldUseVectorTileServer() ? "mvt" : "geojson",
        updatedAt: new Date().toISOString()
      };

      console.log("[MEEWAV_ARTIST_GRADES_AUDIT]", audit);
      return audit;
    };
  }

  if (initializedMaps.has(map)) {
    addAvatarLayers(map);
    return;
  }

  initializedMaps.add(map);

  if (isForcedMvtAvatarSource()) {
    installAvatarLayerRepairHandlers(map);
    addAvatarLayers(map);
    moveAvatarLayersToTop(map);
    map.triggerRepaint?.();

    if (typeof window !== "undefined" && (window as any).__MEEWAV_AVATAR_RENDER_MODE__ === "canvas") {
      void preloadAvatarImages(map).then(() => {
        map.triggerRepaint?.();
      });
      return;
    }

    void preloadAvatarImages(map).then(() => {
      moveAvatarLayersToTop(map);
      map.triggerRepaint?.();
    });
    return;
  }

  if (isCharonneAvatarStressEnabled()) {
    installAvatarLayerRepairHandlers(map);
    addAvatarLayers(map);
    moveAvatarLayersToTop(map);
    map.triggerRepaint?.();

    void preloadAvatarImages(map).then(() => {
      moveAvatarLayersToTop(map);
      map.triggerRepaint?.();
    });
    return;
  }

  // Runtime anchor/occlusion rewrites are disabled; avatars stay on fixed source coordinates.
  map.on("idle", () => {
    if (!map.getSource(AVATAR_SOURCE_ID) || !map.getLayer(AVATAR_POINTS_LAYER_ID)) {
      ensureAvatarLayers(map);
    }
    moveAvatarLayersToTop(map);
  });

  map.on("styledata", () => {
    moveAvatarLayersToTop(map);
  });

  map.on("moveend", () => {
    if (isContinuousZoomingRef.current) return;

    if (!(typeof window !== "undefined" && (window as any).__MEEWAV_DISABLE_AVATAR_RECALC__ === true)) {
        triggerOcclusionUpdate(map);

      if (typeof window !== "undefined" && (window as any).DEBUG_MEEWAV_CONSERVATION === true) {
        avatarDebugLog("[Meewav anchor/occlusion recalculated]", {
          zoom: map.getZoom(),
          time: performance.now()
        });
      }
    }

    // Temporary debug table for rendered clusters
    try {
      if (typeof window !== "undefined" && (window as any).DEBUG_MEEWAV_CONSERVATION === true) {
        const clusters = safeQueryRenderedFeatures(map, [
          "meewav-clusters-country",
          "meewav-clusters-macro",
          "meewav-clusters-mid",
          "meewav-clusters-local"
        ]);

        avatarDebugLog("[Meewav clusters rendered]", clusters.length);
        if (clusters.length > 0) {
          console.table(clusters.slice(0, 10).map((f: any) => ({
            id: f.properties?.id || f.properties?.cluster_id || f.id,
            point_count: f.properties?.point_count || f.properties?.display_count || 0
          })));
        }
      }
    } catch (e) {
      // Ignore query errors during map styles swapping
    }

    if (typeof window !== "undefined" && (window as any).DEBUG_MEEWAV_CONSERVATION === true) {
      avatarDebugLog("[Meewav camera]", {
        zoom: map.getZoom(),
        center: map.getCenter(),
        pitch: map.getPitch(),
        bearing: map.getBearing()
      });
    }
  });

  if (typeof window !== "undefined") {
    (window as any).updateHorizonImpostorsAfterNavigation = (_m: MapLibreMap, _reason: string) => {
      // Fixed impostor: no post-navigation recompute.
    };
  }

  void preloadAvatarImages(map).then(() => {
    addAvatarLayers(map);
    map.triggerRepaint?.();
  });
}


export function setAvatarData(map: MapLibreMap, geojson: any) {
  if (isAvatarPipelineSuppressed()) {
    latestAvatarData = emptyFeatureCollection();
    if (areAvatarsDisabledForDiag()) {
      removeAvatarRuntimeLayersForDiag(map);
    }
    return;
  }

  const landmarkSafeGeojson = applyParisLandmarkSafetyToAvatarGeoJson(geojson);
  const normalizedGeojson = isForcedGeoJsonAvatarSource()
    ? normalizeGeoJsonAvatarFeatures(landmarkSafeGeojson)
    : landmarkSafeGeojson;
  latestAvatarData = normalizedGeojson;

  if (shouldUseVectorTileServer()) {
    // En mode vectoriel, l'injection de GeoJSON local n'est pas indispensable car les tuiles se chargent dynamiquement.
    // Cependant, nous laissons setAvatarData s'exécuter si on veut forcer le mode fallback en cours d'utilisation.
    return;
  }

  const source: any = map.getSource(AVATAR_SOURCE_ID);
  if (!source) return;

  source.setData(normalizedGeojson);
  
  // Keep source coordinates fixed; avoid expensive anchor rewrites after data load.
}

function stableAvatarLabelHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeGeoJsonAvatarFeatures(geojson: any) {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
    return geojson;
  }

  return {
    ...geojson,
    features: geojson.features.map((feature: any, index: number) => {
      const properties = feature?.properties || {};
      const id = String(properties.profile_id ?? properties.id ?? properties.musician_id ?? `geojson-avatar-${index}`);
      const avatarId = Number(properties.avatar_id ?? ((index % 32) + 1));
      const configuredLabelPriority = Number(properties.labelPriority);
      const configuredLabelTier = Number(properties.labelTier);
      const labelHash = stableAvatarLabelHash(id);

      return {
        ...feature,
        properties: {
          ...properties,
          id,
          musician_id: String(properties.musician_id ?? id),
          avatar_id: Number.isFinite(avatarId) ? avatarId : ((index % 32) + 1),
          cluster_level: properties.cluster_level ?? "avatar",
          selected: properties.selected ?? false,
          active: properties.active ?? false,
          instrument: properties.instrument ?? properties.role ?? "user",
          labelPriority: Number.isFinite(configuredLabelPriority)
            ? configuredLabelPriority
            : 100 + (labelHash % 10000),
          labelTier: Number.isInteger(configuredLabelTier) && configuredLabelTier >= 1 && configuredLabelTier <= 3
            ? configuredLabelTier
            : 1 + (labelHash % 3)
        }
      };
    })
  };
}

export function addLegacyFluidCircleLayers(map: MapLibreMap) {
  const legacyLayers = [
    "meewav-avatar-clusters",
    "meewav-avatar-cluster-count",
    "meewav-avatar-points"
  ];

  // FORCE RECREATION of layers to apply changes instantly on refresh:
  legacyLayers.forEach(l => {
    if (map.getLayer(l)) {
      map.removeLayer(l);
    }
  });

  // 1. Clusters layer
  map.addLayer({
    id: "meewav-avatar-clusters",
    type: "circle",
    source: AVATAR_SOURCE_ID,
    filter: ["has", "point_count"],
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#9b6cff",  // < 10
        10,
        "#b68cff",  // 10 - 50
        50,
        "#ff7bd5",  // 50 - 200
        200,
        "#ff46b1"   // > 200
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        18, 10, 22, 50, 28, 200, 36
      ],
      "circle-opacity": 0.94,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.9,
      "circle-pitch-alignment": "viewport"
    }
  } as any);

  // 2. Compteur textuel pour chaque cluster
  map.addLayer({
    id: "meewav-avatar-cluster-count",
    type: "symbol",
    source: AVATAR_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": [
        "coalesce",
        ["get", "point_count_abbreviated"],
        ["to-string", ["get", "point_count"]]
      ],
      "text-font": ["Noto Sans Bold"],
      "text-size": 12,
      "text-allow-overlap": true,
      "text-ignore-placement": true
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#160a28",
      "text-halo-width": 1.5
    }
  } as any);

  // 3. Couche des points d'avatars individuels (avec occlusion 3D par draping map)
  map.addLayer({
    id: "meewav-avatar-points",
    type: "circle",
    source: AVATAR_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    minzoom: 13,
    paint: {
      "circle-color": [
        "interpolate",
        ["linear"],
        ["coalesce", ["get", "avatar_id"], 1],
        1, "#ff7bd5",   // Rose Meewav
        16, "#b68cff",  // Violet clair
        32, "#9b6cff"   // Violet profond
      ],
      "circle-radius": 8,
      "circle-opacity": 0.96,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
      "circle-stroke-opacity": 0.92,
      "circle-pitch-alignment": "viewport",
      "circle-pitch-scale": "viewport"
    }
  } as any);

  // Move layers to top
  legacyLayers.forEach(l => {
    if (map.getLayer(l)) {
      map.moveLayer(l);
    }
  });
}
