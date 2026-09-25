import { useEffect, useRef } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";

interface RawAvatar {
  id: string;
  lng: number;
  lat: number;
  instrument: string;
  avatar_id?: string | number;
  avatarId?: string | number;
  render_rank?: number;
  renderRank?: number;

  parent_cluster_id?: string | null;
  parent_nano_id?: string | null;
  parent_micro_id?: string | null;
  parent_local_id?: string | null;
  parent_mid_id?: string | null;
  parent_macro_id?: string | null;
  parent_count?: number | null;
  sibling_count?: number | null;
  sibling_index?: number | null;

  representative_of_nano?: string | null;
  representative_mode?: string | null;

  opened_nano_id?: string | null;
  opened_nano_point_count?: number | null;
}

interface OverlayCandidate {
  id: string;
  lng: number;
  lat: number;
  instrument: string;
  avatarId: string;
  renderRank: number;
  distanceMeters: number;
  isSelected: boolean;
  pt: { x: number; y: number };
}

interface NanoCluster {
  id: string;
  cluster_id: string;
  cluster_level: "nano";
  point_count: number;
  display_count: number;
  display_count_text: string;
  lng: number;
  lat: number;
  parent_micro_id?: string | null;
  parent_local_id?: string | null;
  parent_mid_id?: string | null;
  parent_macro_id?: string | null;
  pt?: { x: number; y: number };
}

const AVATAR_BASE_PATH = "/images/V4";
const SCREEN_MARGIN = 160;
const MAX_OVERLAY_AVATARS = 120;

const EXPERIMENTAL_AVATAR_MODES_DISABLED = true;

const AVATAR_RENDER_CONTRACT = {
  pack5MiniEnabled: false,
  pack5MediumEnabled: false,
  distributedNanoEnabled: false,
  multiNanoOpeningEnabled: false,
  screenSpaceRepulsionEnabled: false,
  spiderfyEnabled: false,
  domOverlayEnabled: true,
  domOnlyNearRooftops: true
} as const;

type MeewavRenderMode = "VECTOR_CLUSTER" | "OPEN_PREMIUM_CLUSTER";

const EQUATOR_METERS_PER_PIXEL_ZOOM_0 = 156543.03392804097;
const MAPLIBRE_DEFAULT_FOV_RAD = 0.6435011087932844;

const AVATAR_PACK_LOD = {
  maxScreenAvatars: 120,
  premiumSpriteScale: 1.0,
  rooftopSpriteScale: 0.85
} as const;

export function getViewportFootprintMeters(map: MapLibreMap): number {
  const bounds = map.getBounds();

  const west = bounds.getWest();
  const east = bounds.getEast();
  const south = bounds.getSouth();
  const north = bounds.getNorth();

  const centerLat = (south + north) / 2;

  const widthMeters =
    Math.abs(east - west) *
    Math.cos(centerLat * Math.PI / 180) *
    111_320;

  const heightMeters = Math.abs(north - south) * 110_540;

  return Math.max(widthMeters, heightMeters);
}

function getApproxCameraAltitudeKm(map: any): number {
  if (!map) return 0;
  const center = map.getCenter();
  const latitudeRad = center.lat * Math.PI / 180;
  const pitchRad = map.getPitch() * Math.PI / 180;
  const zoomScale = Math.pow(2, map.getZoom());
  const metersPerPixel = (EQUATOR_METERS_PER_PIXEL_ZOOM_0 * Math.cos(latitudeRad)) / zoomScale;
  const canvasHeight = Math.max(map.getCanvas()?.clientHeight || 600, 1);
  const cameraToCenterPixels = (canvasHeight / 2) / Math.tan(MAPLIBRE_DEFAULT_FOV_RAD / 2);

  const altitudeMeters = Math.max(0, Math.cos(pitchRad) * cameraToCenterPixels * metersPerPixel);
  return altitudeMeters / 1000;
}

export function getRenderMode(map: MapLibreMap): MeewavRenderMode {
  const zoom = map.getZoom();
  const pitch = map.getPitch();
  const altitudeKm = getApproxCameraAltitudeKm(map as any);
  const state = map as any;

  /**
   * Transition à 1 km d'altitude :
   * - Si altitude <= 1.0 km -> avatars (OPEN_PREMIUM_CLUSTER)
   * - Si altitude > 1.1 km -> clusters (VECTOR_CLUSTER) (avec hystérésis pour la stabilité visuelle)
   */
  const ENTER_PREMIUM_ALTITUDE = 1.8;
  const EXIT_PREMIUM_ALTITUDE = 2.0;

  const previousMode = state.__meewav_render_mode as MeewavRenderMode | undefined;
  const previousWasPremium = previousMode === "OPEN_PREMIUM_CLUSTER";
  const selectedZoneId = typeof window !== "undefined"
    ? (window as any).__MEEWAV_SELECTED_ZONE_EXTRUSION__?.selectedZoneId
    : null;

  let nextMode: MeewavRenderMode;

  if (selectedZoneId) {
    // A selected quartier is authoritative: its filtered avatars must not
    // disappear merely because pitch changes the estimated camera altitude.
    nextMode = "OPEN_PREMIUM_CLUSTER";
  } else if (previousWasPremium) {
    nextMode = altitudeKm > EXIT_PREMIUM_ALTITUDE ? "VECTOR_CLUSTER" : "OPEN_PREMIUM_CLUSTER";
  } else {
    nextMode = altitudeKm <= ENTER_PREMIUM_ALTITUDE ? "OPEN_PREMIUM_CLUSTER" : "VECTOR_CLUSTER";
  }

  state.__meewav_render_mode = nextMode;
  state.__meewav_render_mode_debug = {
    renderMode: nextMode,
    previousMode: previousMode ?? "none",
    zoom,
    pitch,
    altitudeKm,
    enterPremiumAltitude: ENTER_PREMIUM_ALTITUDE,
    exitPremiumAltitude: EXIT_PREMIUM_ALTITUDE,
    sourceOfTruth: selectedZoneId ? "selected_zone" : "altitude_based_transition",
    timestamp: Date.now()
  };

  return nextMode;
}

function getAvatarBudgetForRenderMode(mode: MeewavRenderMode): number {
  if (mode === "OPEN_PREMIUM_CLUSTER") return 120;
  return 0;
}

function getAvatarLodSpriteScale(mode: MeewavRenderMode): number {
  if (mode === "OPEN_PREMIUM_CLUSTER") return AVATAR_PACK_LOD.premiumSpriteScale;
  return 0;
}

function getAvatarSizePolicy(renderMode: MeewavRenderMode, isSelected: boolean) {
  if (renderMode === "OPEN_PREMIUM_CLUSTER") {
    return {
      minHeight: isSelected ? 112 : 88,
      minWidth: isSelected ? 80 : 63,
      maxHeight: isSelected ? 190 : 158,
      maxWidth: isSelected ? 137 : 114,
      lodScale: 1.0
    };
  }

  return {
    minHeight: 0,
    minWidth: 0,
    maxHeight: 0,
    maxWidth: 0,
    lodScale: 0
  };
}

const BBOX_FETCH_LIMIT = 1000;
const BBOX_DEBOUNCE_MS = 220;

const GRID_COLS = 12;
const GRID_ROWS = 7;
const MAX_PER_CELL = 2;
const HUD_EXCLUSION_WIDTH = 280;

type DepthBand = "horizon" | "far" | "mid" | "near";

const VISIBLE_SET_SETTLE_MS = 900;

const SURVIVAL_BUFFER_X_RATIO = 0.65;
const SURVIVAL_BUFFER_TOP_RATIO = 1.10;
const SURVIVAL_BUFFER_BOTTOM_RATIO = 0.75;

const MAX_PER_CELL_DEFAULT = 2;
const MAX_PER_CELL_CLOSE = 3;

const LAST_VISIBLE_CLEANUP_MS = 30000;

const ACTIVE_NANO_CLUSTER_MODE = false;
const DISTRIBUTED_NANO_AVATAR_MODE = false;
const MAX_AVATARS_PER_NANO_CLUSTER = 2;
const MAX_PRIMARY_AVATARS_PER_NANO_CLUSTER = 1;
const DISTRIBUTED_NANO_CLUSTER_LIMIT = 180;
const DISTRIBUTED_AVATAR_FETCH_LIMIT = 420;

const AVATAR_FADE_IN_START_ZOOM = 16.00;
const AVATAR_FULL_START_ZOOM = 16.30;

function getScreenCell(entry: OverlayCandidate, width: number, height: number): string {
  const col = Math.max(0, Math.min(GRID_COLS - 1, Math.floor((entry.pt.x / width) * GRID_COLS)));
  const row = Math.max(0, Math.min(GRID_ROWS - 1, Math.floor((entry.pt.y / height) * GRID_ROWS)));
  return `${row}:${col}`;
}

function getDepthBand(c: OverlayCandidate, height: number): DepthBand {
  const yRatio = Math.max(0, Math.min(1, c.pt.y / height));
  if (yRatio < 0.18) return "horizon";
  if (yRatio < 0.36) return "far";
  if (yRatio < 0.72) return "mid";
  return "near";
}

function getBandLimit(band: DepthBand, zoom: number): number {
  if (band === "horizon") return zoom >= 18 ? 10 : 14;
  if (band === "far") return zoom >= 18 ? 22 : 28;
  if (band === "mid") return 52;
  return 46;
}

function getBandPriority(c: OverlayCandidate, height: number): number {
  const band = getDepthBand(c, height);
  if (band === "mid") return 0;
  if (band === "near") return 1;
  if (band === "far") return 2;
  return 3;
}



const AVATAR_MAP: Record<string, string> = {
  avatar_1: "Violoniste.png",
  avatar_2: "vidéaste clipper.png",
  avatar_3: "Utilisatrice.png",
  avatar_4: "Utilisateur.png",
  avatar_5: "Studio d'enregistrement.png",
  avatar_6: "Sound designer.png",
  avatar_7: "Pianiste..png",
  avatar_8: "percussionniste.png",
  avatar_9: "Organisation Scénique.png",
  avatar_10: "Ménagement.png",
  avatar_11: "Label.png",
  avatar_12: "Instrumentiste à cuivre..png",
  avatar_13: "Instruments a vent.png",
  avatar_14: "Ingénieur du son.png",
  avatar_15: "Guitariste électrique..png",
  avatar_16: "Guitariste acoustique.png",
  avatar_17: "DJ.png",
  avatar_18: "Direction artistique V2.png",
  avatar_19: "danseuse.png",
  avatar_20: "danseurs.png",
  avatar_21: "Compositeur.png",
  avatar_22: "Coatch vocal.png",
  avatar_23: "Chanteuse, rappeuse.png",
  avatar_24: "Chanteur, rappeur..png",
  avatar_25: "Beatmaker.png",
  avatar_26: "Beatboxer.png",
  avatar_27: "batteurs, batteuses.png",
  avatar_28: "Bassiste.png",
  avatar_29: "Auteur parolier.png",
  avatar_30: "accordéoniste.png",
  avatar_31: "Instrumentiste à cordes V2.png",
  avatar_32: "Instrumentiste à cordes.png",
  avatar_33: "Producteur musicalv2.png"
};

const NATIVE_AVATAR_LAYER_IDS = [
  "meewav-avatar-points-normal",
  "meewav-avatar-points-selected",
  "meewav-avatar-ground-shadow",
  "meewav-avatar-points-far",
  "meewav-avatar-points-mid",
  "meewav-avatar-points-near"
];

const NATIVE_CLUSTER_LAYER_IDS = [
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
  "meewav-cluster-count-nano"
];

export function isRealAvatarFeature(featureOrAvatar: any): boolean {
  if (!featureOrAvatar) return false;

  const props = featureOrAvatar.properties || featureOrAvatar;
  const id = String(
    featureOrAvatar.id ??
      props?.id ??
      props?.musician_id ??
      props?.artist_id ??
      props?.avatar_id ??
      ""
  );

  if (
    id.startsWith("paris_local_") ||
    id.startsWith("paris_micro_") ||
    id.startsWith("paris_nano_")
  ) {
    return false;
  }

  if (props && typeof props === "object") {
    if (
      props.isCluster === true ||
      props.isCluster === "true" ||
      props.cluster === true ||
      props.cluster === "true" ||
      props.cluster_level !== undefined ||
      props.children_count !== undefined ||
      props.point_count !== undefined
    ) {
      return false;
    }
  }

  return Boolean(id && Number.isFinite(Number(props?.lng)) && Number.isFinite(Number(props?.lat)));
}

function getApiBase(): string {
  if (typeof window === "undefined") return "http://localhost:5000";
  return `${window.location.protocol}//${window.location.hostname}:5000`;
}

function getOverlayFlags() {
  const params = new URLSearchParams(window.location.search);

  // Production contract: MapLibre/MVT owns the main avatar rendering.
  // The DOM overlay is now an explicit diagnostic fallback only. This prevents
  // stale localStorage/dev-default flags from hiding native MapLibre symbols,
  // creating floating DOM plates, or triggering the red RAW overlay banner.
  const explicitDomOverlay =
    params.get("domAvatarOverlay") === "1" ||
    params.get("forceRawOverlay") === "1";

  const overlayEnabled = explicitDomOverlay;
  const forceRawOverlay = explicitDomOverlay;
  const overlayDebug =
    explicitDomOverlay ||
    params.get("avatarOverlayDebug") === "1" ||
    params.get("debugAvatarOverlay") === "1";

  const showStatsBadge = overlayDebug || params.get("avatarOverlayStats") === "1";

  return {
    overlayEnabled,
    overlayDebug,
    forceRawOverlay,
    showStatsBadge
  };
}

function normalizeAvatar(raw: any): RawAvatar | null {
  if (!raw) return null;

  const props = raw.properties || raw;
  const id = String(raw.id ?? props.id ?? props.musician_id ?? props.artist_id ?? "");

  const lng = Number(props.lng);
  const lat = Number(props.lat);

  if (!id || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const clusterLevel = props.cluster_level;

  if (
    clusterLevel &&
    clusterLevel !== "avatar" &&
    clusterLevel !== "none"
  ) {
    return null;
  }

  if (
    props.isCluster === true ||
    props.isCluster === "true" ||
    props.cluster === true ||
    props.cluster === "true" ||
    props.children_count !== undefined ||
    (props.point_count !== undefined && props.point_count !== null)
  ) {
    return null;
  }

  return {
    id,
    lng,
    lat,
    instrument: String(props.instrument || "Violoniste"),
    avatar_id: props.avatar_id,
    avatarId: props.avatarId,
    render_rank: Number(props.render_rank ?? props.avatar_render_rank ?? 0),
    renderRank: Number(props.renderRank ?? props.render_rank ?? props.avatar_render_rank ?? 0),

    parent_cluster_id: props.parent_cluster_id ?? props.parent_nano_id ?? null,
    parent_nano_id: props.parent_nano_id ?? props.parent_cluster_id ?? null,
    parent_micro_id: props.parent_micro_id ?? null,
    parent_local_id: props.parent_local_id ?? null,
    parent_mid_id: props.parent_mid_id ?? null,
    parent_macro_id: props.parent_macro_id ?? null,
    parent_count: props.parent_count !== undefined ? Number(props.parent_count) : null,
    sibling_count: props.sibling_count !== undefined ? Number(props.sibling_count) : null,
    sibling_index: props.sibling_index !== undefined ? Number(props.sibling_index) : null,

    representative_of_nano: props.representative_of_nano ?? null,
    representative_mode: props.representative_mode ?? null,

    opened_nano_id: props.opened_nano_id ?? null,
    opened_nano_point_count:
      props.opened_nano_point_count !== undefined
        ? Number(props.opened_nano_point_count)
        : null
  };
}

function avatarImageSrc(avatarId: string): string {
  const avatarKey = avatarId.startsWith("avatar_") ? avatarId : `avatar_${avatarId}`;
  const imgFile = AVATAR_MAP[avatarKey] || "Utilisateur.png";
  // Windows/Vite has issues resolving %2C for literal commas, replace it with a literal comma.
  return `${AVATAR_BASE_PATH}/${encodeURIComponent(imgFile).replace(/%2C/g, ",")}`;
}

export function useHybridAvatarRenderer(map: MapLibreMap | null) {
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Étape 1 — Store persistant pour les avatars
  const avatarStoreRef = useRef<Map<string, RawAvatar & { lastFetchedAt: number }>>(new Map());

  // Étape 2 — Bloquer les réponses réseau obsolètes
  const bboxRequestSeqRef = useRef<number>(0);

  // Étape 3 — Set visible stable
  const activeVisibleIdsRef = useRef<Set<string>>(new Set());

  // Ref stable pour le gel pendant le mouvement (HARD_FREEZE_VISIBLE_SET_DURING_MOVE)
  const frozenVisibleIdsRef = useRef<Set<string>>(new Set());

  // Hysteresis of visibility memory
  const lastVisibleAtRef = useRef<Map<string, number>>(new Map());
  const lastPadFactorRef = useRef<number>(0.6);
  const lastBboxLimitRef = useRef<number>(1000);

  const activeNanoIdRef = useRef<string | null>(null);
  const lastLoadedNanoIdRef = useRef<string | null>(null);
  const nanoClustersRef = useRef<Map<string, NanoCluster>>(new Map());
  const lastNanoSwitchAtRef = useRef<number>(0);
  const lastNanoFetchErrorRef = useRef<string | null>(null);

  useEffect(() => {
    const overlayDebugLogsEnabled =
      typeof window !== "undefined" && (window as any).__MEEWAV_AVATAR_OVERLAY_DEBUG__ === true;
    if (overlayDebugLogsEnabled) {
      console.log("[OVERLAY_HOOK_MOUNT]");
      console.log("[OVERLAY_BUILD_MARKER]", "API_BBOX_PATCH_REAL_BROWSER_001", new Date().toISOString());
      console.log("[OVERLAY_FLAGS]", getOverlayFlags(), typeof window !== "undefined" ? window.location.href : "no-window");
      console.log("[OVERLAY_MAP_READY]", !!map, map?.loaded?.());
    }

    if (!map || typeof window === "undefined") {
      return () => {
        if (overlayDebugLogsEnabled) console.log("[OVERLAY_HOOK_UNMOUNT]");
      };
    }

    const initialOverlayFlags = getOverlayFlags();
    if (!initialOverlayFlags.overlayEnabled && !initialOverlayFlags.overlayDebug && !initialOverlayFlags.showStatsBadge) {
      (window as any).__MEEWAV_AVATAR_CONTINUITY_OVERLAY__ = false;
      (window as any).__MEEWAV_OVERLAY_COUNT__ = 0;
      return () => {
        if (overlayDebugLogsEnabled) console.log("[OVERLAY_HOOK_UNMOUNT]");
      };
    }

    let cancelled = false;
    let fetchTimer: number | null = null;
    let isFetching = false;
    let bboxFetchedCount = 0;
    let rawRejectedFeatures = 0;
    let lastFetchError: string | null = null;
    let nativeLayersHidden = false;
    let lastProjectedCandidates = 0;
    let lastActiveIds: string[] = [];

    // State variables for map freeze and transition limit
    let isMoving = false;
    let lastCycleAddedCount = 0;
    let lastCycleRemovedCount = 0;
    let lastCycleKeptCount = 0;
    let churnRatio = 0;

    let visibleSetLockedUntil = 0;

    const lockVisibleSetForMotion = () => {
      visibleSetLockedUntil = Date.now() + VISIBLE_SET_SETTLE_MS;
    };

    const isVisibleSetLocked = () => {
      return isMoving || Date.now() < visibleSetLockedUntil;
    };

    const rawAvatarsRef: { current: RawAvatar[] } = { current: [] };
    const lastSeenMap = new Map<string, number>();
    const originalVisibility = new Map<string, any>();

    const saveOriginalNativeVisibility = () => {
      for (const layerId of NATIVE_AVATAR_LAYER_IDS) {
        if (!map.getLayer(layerId) || originalVisibility.has(layerId)) continue;
        originalVisibility.set(layerId, map.getLayoutProperty(layerId, "visibility") ?? "visible");
      }
    };

    const hideNativeLayers = () => {
      saveOriginalNativeVisibility();
      for (const layerId of NATIVE_AVATAR_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        if (map.getLayoutProperty(layerId, "visibility") !== "none") {
          map.setLayoutProperty(layerId, "visibility", "none");
        }
      }
      nativeLayersHidden = NATIVE_AVATAR_LAYER_IDS.every(
        layerId => !map.getLayer(layerId) || map.getLayoutProperty(layerId, "visibility") === "none"
      );
    };

    const restoreNativeLayers = () => {
      for (const layerId of NATIVE_AVATAR_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        let original = originalVisibility.get(layerId) ?? "visible";
        if (original === "none") {
          original = "visible";
        }
        map.setLayoutProperty(layerId, "visibility", original);
      }
      nativeLayersHidden = false;
    };

    const showClusterLayers = () => {
      for (const layerId of NATIVE_CLUSTER_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        if (map.getLayoutProperty(layerId, "visibility") !== "none") {
          map.setLayoutProperty(layerId, "visibility", "none");
        }
      }
    };

    const hideClusterLayers = () => {
      for (const layerId of NATIVE_CLUSTER_LAYER_IDS) {
        if (!map.getLayer(layerId)) continue;
        if (map.getLayoutProperty(layerId, "visibility") !== "none") {
          map.setLayoutProperty(layerId, "visibility", "none");
        }
      }
    };

    const setupContainer = (): HTMLDivElement => {
      if (containerRef.current) return containerRef.current;

      const mapContainer = map.getContainer();
      const container = document.createElement("div");
      container.className = "meewav-avatar-continuity-overlay";
      container.setAttribute("data-meewav-avatar-overlay-root", "true");
      container.style.position = "absolute";
      container.style.inset = "0";
      container.style.pointerEvents = "none";
      container.style.zIndex = "9999";
      container.style.overflow = "hidden";
      mapContainer.appendChild(container);
      containerRef.current = container;
      return container;
    };

    const cleanupOverlayDom = () => {
      elementsRef.current.forEach(el => el.remove());
      elementsRef.current.clear();
      if (containerRef.current) {
        containerRef.current.remove();
        containerRef.current = null;
      }
    };

    const setupBadge = (): HTMLDivElement => {
      const mapContainer = map.getContainer();
      let badge = mapContainer.querySelector(".meewav-avatar-overlay-badge-persistent") as HTMLDivElement | null;
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "meewav-avatar-overlay-badge-persistent";
        badge.style.position = "absolute";
        badge.style.top = "110px";
        badge.style.right = "20px";
        badge.style.backgroundColor = "rgba(10,10,15,0.92)";
        badge.style.color = "#00ffcc";
        badge.style.fontFamily = "'Outfit','Inter',monospace";
        badge.style.padding = "10px 14px";
        badge.style.borderRadius = "8px";
        badge.style.fontSize = "11px";
        badge.style.border = "1px solid rgba(0,255,204,0.4)";
        badge.style.boxShadow = "0 4px 12px rgba(0,0,0,0.6)";
        badge.style.zIndex = "10001";
        badge.style.minWidth = "235px";
        badge.style.backdropFilter = "blur(8px)";
        badge.style.pointerEvents = "auto";
        mapContainer.appendChild(badge);
      }
      return badge;
    };

    const updateBadge = (enabled: boolean) => {
      const { showStatsBadge } = getOverlayFlags();

      if (!enabled || !showStatsBadge) {
        const mapContainer = map.getContainer();
        const badge = mapContainer.querySelector(".meewav-avatar-overlay-badge-persistent") as HTMLDivElement | null;
        if (badge) {
          badge.style.display = "none";
        }
        return;
      }

      const badge = setupBadge();
      badge.style.display = "block";

      badge.innerHTML = `
        <div style="font-weight:bold;font-size:13px;color:#39ff14;text-shadow:0 0 5px #39ff14;margin-bottom:6px;">RAW AVATAR OVERLAY ACTIVE</div>
        <div>DATA SOURCE: <b style="color:#39ff14">API_BBOX</b></div>
        <div>BBOX AVATARS TOTAL: <b style="color:#fff">${bboxFetchedCount}</b></div>
        <div>PROJECTED CANDIDATES: <b style="color:#fff">${lastProjectedCandidates}</b></div>
        <div>DOM NODES: <b style="color:#fff">${elementsRef.current.size}</b></div>
        <div>NATIVE AVATAR LAYERS: <b style="color:${nativeLayersHidden ? "#39ff14" : "#ff3366"}">${nativeLayersHidden ? "HIDDEN" : "VISIBLE"}</b></div>
        <div>MVT SOURCE USED FOR OVERLAY: <b style="color:#39ff14">NO</b></div>
        <div>RAW REJECTED FEATURES: <b style="color:#fff">${rawRejectedFeatures}</b></div>
        ${lastFetchError ? `<div style="color:#ff3366;margin-top:4px;">FETCH ERROR: ${lastFetchError}</div>` : ""}
      `;
    };

    const getPaddedBoundsParams = () => {
      const pitch = map.getPitch();
      const pitchFactor = 1 + Math.min(2.0, Math.max(0, (pitch - 45) / 30));

      const basePadFactor = 0.6;
      const padFactor = basePadFactor * pitchFactor;
      lastPadFactorRef.current = padFactor;

      const bounds = map.getBounds();
      const west = bounds.getWest();
      const east = bounds.getEast();
      const south = bounds.getSouth();
      const north = bounds.getNorth();

      const padLng = Math.max(Math.abs(east - west) * padFactor, 0.002);
      const padLat = Math.max(Math.abs(north - south) * padFactor, 0.002);

      return {
        west: west - padLng,
        south: south - padLat,
        east: east + padLng,
        north: north + padLat
      };
    };

    const fetchJson = async (url: URL) => {
      const res = await fetch(url.toString(), {
        cache: "no-store"
      });

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      return res.json();
    };

    const normalizeNanoCluster = (raw: any): NanoCluster | null => {
      const props = raw.properties || raw;

      const id = String(props.id ?? props.cluster_id ?? "");
      const lng = Number(props.lng);
      const lat = Number(props.lat);
      const pointCount = Number(props.point_count ?? props.display_count ?? 0);

      if (!id || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      if (!Number.isFinite(pointCount) || pointCount <= 0) return null;

      return {
        id,
        cluster_id: String(props.cluster_id ?? id),
        cluster_level: "nano",
        point_count: pointCount,
        display_count: Number(props.display_count ?? pointCount),
        display_count_text: String(props.display_count_text ?? pointCount),
        lng,
        lat,
        parent_micro_id: props.parent_micro_id ?? null,
        parent_local_id: props.parent_local_id ?? null,
        parent_mid_id: props.parent_mid_id ?? null,
        parent_macro_id: props.parent_macro_id ?? null
      };
    };

    const chooseActiveNanoCluster = (
      clusters: NanoCluster[],
      width: number,
      height: number
    ): NanoCluster | null => {
      if (clusters.length === 0) return null;

      const focusX = HUD_EXCLUSION_WIDTH + (width - HUD_EXCLUSION_WIDTH) * 0.5;
      const focusY = height * 0.58;

      let best: NanoCluster | null = null;
      let bestScore = Infinity;

      for (const cluster of clusters) {
        let pt: { x: number; y: number };

        try {
          pt = map.project([cluster.lng, cluster.lat]);
        } catch {
          continue;
        }

        const inViewport =
          pt.x >= HUD_EXCLUSION_WIDTH &&
          pt.x <= width &&
          pt.y >= 0 &&
          pt.y <= height;

        const visiblePenalty = inViewport ? 0 : 2500;
        const countPenalty = Math.abs(Number(cluster.point_count || 0) - 120) * 8;

        const dx = pt.x - focusX;
        const dy = pt.y - focusY;

        const score =
          Math.hypot(dx, dy) +
          visiblePenalty +
          countPenalty;

        if (score < bestScore) {
          bestScore = score;
          best = {
            ...cluster,
            pt
          };
        }
      }

      return best;
    };

    const chooseNanoClustersToOpen = (
      clusters: NanoCluster[],
      width: number,
      height: number,
      maxOpen: number
    ): NanoCluster[] => {
      if (maxOpen <= 0 || clusters.length === 0) return [];

      const focusX = HUD_EXCLUSION_WIDTH + (width - HUD_EXCLUSION_WIDTH) * 0.5;
      const focusY = height * 0.58;

      const candidates = clusters
        .map(cluster => {
          let pt: { x: number; y: number };

          try {
            pt = map.project([cluster.lng, cluster.lat]);
          } catch {
            return null;
          }

          const inViewport =
            pt.x >= HUD_EXCLUSION_WIDTH &&
            pt.x <= width &&
            pt.y >= 0 &&
            pt.y <= height;

          if (!inViewport) return null;

          const dx = pt.x - focusX;
          const dy = pt.y - focusY;

          return {
            cluster: {
              ...cluster,
              pt
            },
            score: Math.hypot(dx, dy)
          };
        })
        .filter(Boolean) as Array<{ cluster: NanoCluster; score: number }>;

      candidates.sort((a, b) => a.score - b.score);

      const selected: NanoCluster[] = [];
      const occupiedCells = new Set<string>();

      for (const item of candidates) {
        if (selected.length >= maxOpen) break;

        const pt = item.cluster.pt!;
        const col = Math.floor((pt.x / width) * 4);
        const row = Math.floor((pt.y / height) * 3);
        const cell = `${row}:${col}`;

        // Éviter d'ouvrir 3 clusters collés au même endroit.
        if (occupiedCells.has(cell)) continue;

        occupiedCells.add(cell);
        selected.push(item.cluster);
      }

      // Si la grille empêche trop, compléter par proximité.
      for (const item of candidates) {
        if (selected.length >= maxOpen) break;
        if (selected.some(c => c.id === item.cluster.id)) continue;
        selected.push(item.cluster);
      }

      return selected;
    };

    const fetchBboxAvatars = async () => {
      if (cancelled) return;

      const { overlayEnabled } = getOverlayFlags();
      if (!overlayEnabled) return;

      const requestId = ++bboxRequestSeqRef.current;
      isFetching = true;

      try {
        const renderMode = getRenderMode(map);

        if (renderMode === "VECTOR_CLUSTER") {
          const pack5Source: any = map.getSource("meewav-pack5-avatars");
          if (pack5Source) {
            pack5Source.setData({ type: "FeatureCollection", features: [] });
          }
          avatarStoreRef.current.clear();
          activeVisibleIdsRef.current.clear();
          bboxFetchedCount = 0;
          lastFetchError = null;
          lastNanoFetchErrorRef.current = null;
          return;
        }

        const bbox = getPaddedBoundsParams();
        const budget = getAvatarBudgetForRenderMode(renderMode);

        const avatarsUrl = new URL(`${getApiBase()}/api/avatars/bbox`);
        avatarsUrl.searchParams.set("west", String(bbox.west));
        avatarsUrl.searchParams.set("south", String(bbox.south));
        avatarsUrl.searchParams.set("east", String(bbox.east));
        avatarsUrl.searchParams.set("north", String(bbox.north));
        avatarsUrl.searchParams.set("limit", String(budget));

        const avatarData = await fetchJson(avatarsUrl);

        if (requestId !== bboxRequestSeqRef.current) return;

        // Clear pack5 source
        const pack5Source: any = map.getSource("meewav-pack5-avatars");
        if (pack5Source) {
          pack5Source.setData({ type: "FeatureCollection", features: [] });
        }

        const rows = Array.isArray(avatarData?.avatars)
          ? avatarData.avatars
          : Array.isArray(avatarData)
            ? avatarData
            : [];

        let rejected = 0;
        const normalized = rows
          .map((item: any) => {
            const avatar = normalizeAvatar(item);
            if (!avatar) {
              rejected += 1;
              return null;
            }
            return avatar;
          })
          .filter(Boolean) as RawAvatar[];

        const now = Date.now();
        avatarStoreRef.current.clear();

        for (const avatar of normalized.slice(0, budget)) {
          avatarStoreRef.current.set(avatar.id, {
            ...avatar,
            lastFetchedAt: now
          });
        }

        activeNanoIdRef.current = null;
        lastLoadedNanoIdRef.current = null;
        activeVisibleIdsRef.current = new Set([...avatarStoreRef.current.keys()]);

        bboxFetchedCount = avatarStoreRef.current.size;
        rawRejectedFeatures = rejected;
        lastFetchError = null;
        lastNanoFetchErrorRef.current = null;

        (window as any).__MEEWAV_OPENED_NANO_DEBUG__ = {
          avatarRenderMode: renderMode,
          footprint: getViewportFootprintMeters(map),
          runtimeAvatarBudget: budget,
          fetchedAvatarCount: normalized.length,
          storedAvatarCount: avatarStoreRef.current.size
        };
      } catch (err: any) {
        if (requestId === bboxRequestSeqRef.current) {
          lastFetchError = err?.message || String(err);
          lastNanoFetchErrorRef.current = lastFetchError;
          console.error("[AVATAR_OVERLAY] Footprint LOD fetch failed", err);
        }
      } finally {
        if (requestId === bboxRequestSeqRef.current) {
          isFetching = false;
          scheduleFrame();
        }
      }
    };

    const scheduleFetch = () => {
      if (fetchTimer !== null) window.clearTimeout(fetchTimer);
      fetchTimer = window.setTimeout(fetchBboxAvatars, BBOX_DEBOUNCE_MS);
    };

    const selectActiveEntries = (
      candidates: OverlayCandidate[],
      width: number,
      height: number,
      zoom: number,
      lockVisibleSet: boolean,
      runtimeAvatarBudget: number
    ) => {
      const now = Date.now();
      const previousIds = new Set<string>(activeVisibleIdsRef.current);
      let previousInserted = 0;
      const previousOrder = new Map<string, number>();

      Array.from(previousIds).forEach((id, index) => {
        previousOrder.set(id, index);
      });

      const selectedIds = new Set<string>((window as any).__MEEWAV_SELECTED_AVATAR_IDS__ || []);
      const center = map.getCenter();
      const centerLatRad = center.lat * Math.PI / 180;

      const projectStoredAvatar = (
        raw: RawAvatar,
        useSurvivalBuffer: boolean
      ): OverlayCandidate | null => {
        let pt: { x: number; y: number };

        try {
          pt = map.project([raw.lng, raw.lat]);
        } catch {
          return null;
        }

        const bufferX = useSurvivalBuffer
          ? Math.round(width * SURVIVAL_BUFFER_X_RATIO)
          : Math.round(width * 0.20);

        const bufferTop = useSurvivalBuffer
          ? Math.round(height * SURVIVAL_BUFFER_TOP_RATIO)
          : Math.round(height * (map.getPitch() > 60 ? 0.65 : 0.35));

        const bufferBottom = useSurvivalBuffer
          ? Math.round(height * SURVIVAL_BUFFER_BOTTOM_RATIO)
          : Math.round(height * 0.20);

        if (
          pt.x < -bufferX ||
          pt.x > width + bufferX ||
          pt.y < -bufferTop ||
          pt.y > height + bufferBottom
        ) {
          return null;
        }

        return {
          id: raw.id,
          lng: raw.lng,
          lat: raw.lat,
          instrument: raw.instrument,
          avatarId: String(raw.avatar_id ?? raw.avatarId ?? "7"),
          renderRank: Number(raw.render_rank ?? raw.renderRank ?? 0),
          distanceMeters: Math.hypot(
            (raw.lng - center.lng) * Math.cos(centerLatRad) * 111_320,
            (raw.lat - center.lat) * 110_540
          ),
          isSelected: selectedIds.has(raw.id),
          pt
        };
      };

      const previousKeepAlive: OverlayCandidate[] = [];

      for (const id of previousIds) {
        const raw = avatarStoreRef.current.get(id);
        if (!raw) continue;

        const projected = projectStoredAvatar(raw, true);
        if (projected) {
          previousKeepAlive.push(projected);
        }
      }

      previousKeepAlive.sort((a, b) => {
        return (previousOrder.get(a.id) ?? 999999) - (previousOrder.get(b.id) ?? 999999);
      });

      const maxPerCell = zoom >= 18.5 ? MAX_PER_CELL_CLOSE : MAX_PER_CELL_DEFAULT;

      const distributedNanoMode =
        DISTRIBUTED_NANO_AVATAR_MODE &&
        avatarStoreRef.current.size > 0 &&
        avatarStoreRef.current.size <= runtimeAvatarBudget;

      if (distributedNanoMode) {
        const distributedCandidates = [...candidates].sort((a, b) => {
          if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
          if (a.renderRank !== b.renderRank) return a.renderRank - b.renderRank;
          return a.id.localeCompare(b.id);
        });

        let activeEntries = distributedCandidates.slice(0, runtimeAvatarBudget);

        if (lockVisibleSet && previousKeepAlive.length > 0) {
          const merged = new Map<string, OverlayCandidate>();

          for (const entry of previousKeepAlive) {
            if (merged.size >= runtimeAvatarBudget) break;
            merged.set(entry.id, entry);
          }

          for (const entry of activeEntries) {
            if (merged.size >= runtimeAvatarBudget) break;
            merged.set(entry.id, entry);
          }

          activeEntries = [...merged.values()].slice(0, runtimeAvatarBudget);
        }

        const nextIds = new Set<string>(activeEntries.map(entry => entry.id));

        let kept = 0;
        let added = 0;
        let removed = 0;

        for (const id of nextIds) {
          if (previousIds.has(id)) kept += 1;
          else added += 1;
        }

        for (const id of previousIds) {
          if (!nextIds.has(id)) removed += 1;
        }

        lastCycleKeptCount = kept;
        lastCycleAddedCount = added;
        lastCycleRemovedCount = removed;
        churnRatio = previousIds.size > 0 ? (added + removed) / previousIds.size : 0;

        activeVisibleIdsRef.current = nextIds;
        lastActiveIds = activeEntries.map(entry => entry.id);

        for (const entry of activeEntries) {
          lastVisibleAtRef.current.set(entry.id, now);
        }

        return {
          activeEntries,
          maxPerCell,
          previousKeepAliveCount: previousKeepAlive.length,
          previousInserted: 0,
          newCandidatesCount: candidates.length
        };
      }

      if (lockVisibleSet && previousKeepAlive.length > 0) {
        const activeEntries = previousKeepAlive.slice(0, runtimeAvatarBudget);
        const nextIds = new Set<string>(activeEntries.map(entry => entry.id));

        let kept = 0;
        let added = 0;
        let removed = 0;

        for (const id of nextIds) {
          if (previousIds.has(id)) kept += 1;
          else added += 1;
        }

        for (const id of previousIds) {
          if (!nextIds.has(id)) removed += 1;
        }

        lastCycleKeptCount = kept;
        lastCycleAddedCount = added;
        lastCycleRemovedCount = removed;
        churnRatio = previousIds.size > 0 ? (added + removed) / previousIds.size : 0;

        activeVisibleIdsRef.current = nextIds;
        lastActiveIds = activeEntries.map(entry => entry.id);

        for (const entry of activeEntries) {
          lastVisibleAtRef.current.set(entry.id, now);
        }

        return {
          activeEntries,
          maxPerCell,
          previousKeepAliveCount: previousKeepAlive.length,
          previousInserted: 0,
          newCandidatesCount: 0
        };
      }

      const selected = new Map<string, OverlayCandidate>();
      const cellCounts = new Map<string, number>();
      const bandCounts = new Map<DepthBand, number>();

      const isUnderHUD = (candidate: OverlayCandidate) => {
        if (candidate.isSelected) return false;
        return candidate.pt.x < HUD_EXCLUSION_WIDTH;
      };

      const addEntry = (
        candidate: OverlayCandidate,
        options?: {
          checkCellLimit?: boolean;
          maxCellAllowed?: number;
          checkBandLimit?: boolean;
          allowHudZone?: boolean;
        }
      ) => {
        if (selected.size >= runtimeAvatarBudget) return false;
        if (selected.has(candidate.id)) return true;

        const checkCellLimit = options?.checkCellLimit ?? true;
        const maxCellAllowed = options?.maxCellAllowed ?? maxPerCell;
        const checkBandLimit = options?.checkBandLimit ?? true;
        const allowHudZone = options?.allowHudZone ?? false;

        if (!allowHudZone && isUnderHUD(candidate)) return false;

        const band = getDepthBand(candidate, height);
        const cell = getScreenCell(candidate, width, height);

        if (checkBandLimit && !candidate.isSelected) {
          const currentBandCount = bandCounts.get(band) || 0;
          if (currentBandCount >= getBandLimit(band, zoom)) return false;
        }

        if (checkCellLimit && !candidate.isSelected) {
          const currentCellCount = cellCounts.get(cell) || 0;
          if (currentCellCount >= maxCellAllowed) return false;
        }

        selected.set(candidate.id, candidate);
        cellCounts.set(cell, (cellCounts.get(cell) || 0) + 1);
        bandCounts.set(band, (bandCounts.get(band) || 0) + 1);

        return true;
      };

      const sortStable = (list: OverlayCandidate[]) => {
        list.sort((a, b) => {
          if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;

          const bandDiff = getBandPriority(a, height) - getBandPriority(b, height);
          if (bandDiff !== 0) return bandDiff;

          if (a.renderRank !== b.renderRank) return a.renderRank - b.renderRank;

          return a.id.localeCompare(b.id);
        });
      };

      const selectedCandidates = candidates.filter(candidate => candidate.isSelected);

      const previousCandidateIds = new Set(previousKeepAlive.map(candidate => candidate.id));

      const newCandidates = candidates.filter(candidate =>
        !previousCandidateIds.has(candidate.id) &&
        !selectedIds.has(candidate.id)
      );

      sortStable(selectedCandidates);
      sortStable(newCandidates);

      for (const candidate of selectedCandidates) {
        addEntry(candidate, {
          checkCellLimit: false,
          checkBandLimit: false,
          allowHudZone: true
        });
      }

      for (const candidate of previousKeepAlive) {
        addEntry(candidate, {
          checkCellLimit: false,
          checkBandLimit: false,
          allowHudZone: true
        });
      }

      const buckets = new Map<string, OverlayCandidate[]>();

      for (const candidate of newCandidates) {
        if (selected.has(candidate.id)) continue;
        if (isUnderHUD(candidate)) continue;

        const cell = getScreenCell(candidate, width, height);
        const bucket = buckets.get(cell) || [];
        bucket.push(candidate);
        buckets.set(cell, bucket);
      }

      for (const bucket of buckets.values()) {
        sortStable(bucket);
      }

      const addGridPass = (maxCellAllowed: number) => {
        let addedSomething = true;

        while (selected.size < runtimeAvatarBudget && addedSomething) {
          addedSomething = false;

          const cells = Array.from(buckets.keys()).sort((a, b) => {
            const countA = cellCounts.get(a) || 0;
            const countB = cellCounts.get(b) || 0;
            if (countA !== countB) return countA - countB;
            return a.localeCompare(b);
          });

          for (const cell of cells) {
            if (selected.size >= runtimeAvatarBudget) break;
            if ((cellCounts.get(cell) || 0) >= maxCellAllowed) continue;

            const bucket = buckets.get(cell);
            if (!bucket || bucket.length === 0) continue;

            let candidate: OverlayCandidate | undefined;

            while (bucket.length > 0) {
              const next = bucket.shift();
              if (next && !selected.has(next.id)) {
                candidate = next;
                break;
              }
            }

            if (!candidate) continue;

            const didAdd = addEntry(candidate, {
              checkCellLimit: true,
              maxCellAllowed,
              checkBandLimit: true,
              allowHudZone: false
            });

            if (didAdd) addedSomething = true;
          }
        }
      };

      addGridPass(maxPerCell);

      if (selected.size < Math.min(runtimeAvatarBudget, 96)) {
        addGridPass(maxPerCell + 1);
      }

      const activeEntries = Array.from(selected.values()).slice(0, runtimeAvatarBudget);
      const nextIds = new Set<string>(activeEntries.map(entry => entry.id));

      let kept = 0;
      let added = 0;
      let removed = 0;

      for (const id of nextIds) {
        if (previousIds.has(id)) kept += 1;
        else added += 1;
      }

      for (const id of previousIds) {
        if (!nextIds.has(id)) removed += 1;
      }

      lastCycleKeptCount = kept;
      lastCycleAddedCount = added;
      lastCycleRemovedCount = removed;
      churnRatio = previousIds.size > 0 ? (added + removed) / previousIds.size : 0;

      activeVisibleIdsRef.current = nextIds;
      lastActiveIds = activeEntries.map(entry => entry.id);

      for (const entry of activeEntries) {
        lastVisibleAtRef.current.set(entry.id, now);
      }

      lastVisibleAtRef.current.forEach((value, id) => {
        if (now - value > LAST_VISIBLE_CLEANUP_MS) {
          lastVisibleAtRef.current.delete(id);
        }
      });

      return {
        activeEntries,
        maxPerCell,
        previousKeepAliveCount: previousKeepAlive.length,
        previousInserted,
        newCandidatesCount: newCandidates.length
      };
    };

    const renderOverlay = () => {
      rafRef.current = null;
      if (cancelled) return;

      const { overlayEnabled, overlayDebug, forceRawOverlay } = getOverlayFlags();
      const renderMode = getRenderMode(map);
      (window as any).__MEEWAV_AVATAR_CONTINUITY_OVERLAY__ = overlayEnabled;

      if (!overlayEnabled) {
        restoreNativeLayers();
        showClusterLayers();
        cleanupOverlayDom();
        updateBadge(false);
        (window as any).__MEEWAV_OVERLAY_COUNT__ = 0;

        const distDebug = (map as any).__meewav_avatar_distribution_debug;
        if (distDebug) {
          (window as any).__MEEWAV_AVATAR_OVERLAY_DEBUG__ = {
            enabled: true,
            viewportUniformSamplerEnabled: true,
            cameraCentricSortDisabled: true,
            gridCols: distDebug.gridCols,
            gridRows: distDebug.gridRows,
            maxPerCell: distDebug.maxPerCell,
            bboxCount: distDebug.candidates,
            overlayCount: distDebug.selected,
            avatarsVisible: true,
            clustersVisible: false,
            activeEntries: (map as any).__meewav_avatar_distribution_entries || [],
            timestamp: Date.now()
          };
        } else {
          (window as any).__MEEWAV_AVATAR_OVERLAY_DEBUG__ = {
            enabled: false,
            dataSource: "OFF",
            usesMvtSourceForOverlay: false,
            nativeLayersHidden: false,
            lastFrameAt: performance.now()
          };
        }
        return;
      }

      let runtimeAvatarBudget = renderMode === "VECTOR_CLUSTER" ? 0 : 120;

      if (renderMode === "VECTOR_CLUSTER") {
        showClusterLayers();
        cleanupOverlayDom();
        avatarStoreRef.current.clear();
        activeVisibleIdsRef.current.clear();
        lastActiveIds = [];

        (window as any).__MEEWAV_OVERLAY_COUNT__ = 0;
        (window as any).__MEEWAV_AVATAR_OVERLAY_DEBUG__ = {
          enabled: true,
          renderMode,
          overlayCount: 0,
          domNodes: 0,
          avatarStoreSize: 0,
          reason: "VECTOR_CLUSTER_MODE",
          footprintMeters: getViewportFootprintMeters(map),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          timestamp: Date.now()
        };

        updateBadge(true);
        return;
      }

      hideNativeLayers();
      hideClusterLayers();

      if (map.getLayer("meewav-pack5-avatar-symbols")) {
        if (map.getLayoutProperty("meewav-pack5-avatar-symbols", "visibility") !== "none") {
          map.setLayoutProperty("meewav-pack5-avatar-symbols", "visibility", "none");
        }
      }

      const zoom = map.getZoom();
      const lockVisibleSet = isVisibleSetLocked();

      runtimeAvatarBudget = getAvatarBudgetForRenderMode(renderMode);
      const openLeafClusterLimit = 0;
      const lodSpriteScale = getAvatarLodSpriteScale(renderMode);
      const avatarOpacity = 1.0;
      const avatarLodMode = renderMode;


      const container = setupContainer();
      const { width, height } = container.getBoundingClientRect();
      const now = Date.now();
      const nowMs = now;

      const pitch = map.getPitch();
      const SCREEN_BUFFER_X = Math.round(width * 0.20);
      const SCREEN_BUFFER_TOP = Math.round(height * (pitch > 60 ? 0.65 : 0.35));
      const SCREEN_BUFFER_BOTTOM = Math.round(height * 0.20);

      const selectedIds = new Set<string>((window as any).__MEEWAV_SELECTED_AVATAR_IDS__ || []);
      const candidates: OverlayCandidate[] = [];
      const center = map.getCenter();
      const centerLatRad = center.lat * Math.PI / 180;

      for (const avatar of avatarStoreRef.current.values()) {
        let pt: { x: number; y: number };
        try {
          pt = map.project([avatar.lng, avatar.lat]);
        } catch {
          continue;
        }

        if (
          pt.x < -SCREEN_BUFFER_X ||
          pt.x > width + SCREEN_BUFFER_X ||
          pt.y < -SCREEN_BUFFER_TOP ||
          pt.y > height + SCREEN_BUFFER_BOTTOM
        ) {
          continue;
        }

        candidates.push({
          id: avatar.id,
          lng: avatar.lng,
          lat: avatar.lat,
          instrument: avatar.instrument,
          avatarId: String(avatar.avatar_id ?? avatar.avatarId ?? "7"),
          renderRank: Number(avatar.render_rank ?? avatar.renderRank ?? 0),
          distanceMeters: Math.hypot(
            (avatar.lng - center.lng) * Math.cos(centerLatRad) * 111_320,
            (avatar.lat - center.lat) * 110_540
          ),
          isSelected: selectedIds.has(avatar.id),
          pt
        });
      }

      lastProjectedCandidates = candidates.length;

      const {
        activeEntries,
        maxPerCell,
        previousKeepAliveCount,
        previousInserted,
        newCandidatesCount
      } = selectActiveEntries(
        candidates,
        width,
        height,
        zoom,
        lockVisibleSet,
        runtimeAvatarBudget
      );

      const activeIds = new Set(activeEntries.map(entry => entry.id));

      activeEntries.forEach(entry => {
        lastVisibleAtRef.current.set(entry.id, now);
        lastSeenMap.set(entry.id, now);
      });

      lastVisibleAtRef.current.forEach((val, id) => {
        if (now - val > LAST_VISIBLE_CLEANUP_MS) {
          lastVisibleAtRef.current.delete(id);
        }
      });

      /**
       * Important:
       * Aucun node DOM ne doit rester visible s'il n'est pas reprojeté dans cette frame.
       * Sinon il garde une ancienne transform écran et donne l'effet "manège".
       */
      elementsRef.current.forEach((el, id) => {
        if (!activeIds.has(id)) {
          el.style.display = "none";
          el.remove();
          elementsRef.current.delete(id);
          lastSeenMap.delete(id);
        }
      });

      const clamp = (value: number, min: number, max: number) => {
        return Math.max(min, Math.min(max, value));
      };

      const smoothstep = (edge0: number, edge1: number, value: number) => {
        const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
        return t * t * (3 - 2 * t);
      };

      const zoomScale = clamp(0.92 + (zoom - 14) * 0.20, 0.92, 2.85);

      for (const entry of activeEntries) {
        let baseSpriteHeight = Math.round((entry.isSelected ? 76 : 64) * zoomScale);
        let baseSpriteWidth = Math.round(baseSpriteHeight * 0.72);

        if (zoom >= 18) {
          baseSpriteHeight = Math.max(baseSpriteHeight, entry.isSelected ? 112 : 88);
          baseSpriteWidth = Math.max(baseSpriteWidth, entry.isSelected ? 80 : 63);
        }

        if (zoom >= 19.5) {
          baseSpriteHeight = Math.max(baseSpriteHeight, entry.isSelected ? 154 : 124);
          baseSpriteWidth = Math.max(baseSpriteWidth, entry.isSelected ? 111 : 89);
        }

        baseSpriteHeight = clamp(baseSpriteHeight, 34, entry.isSelected ? 190 : 158);
        baseSpriteWidth = clamp(baseSpriteWidth, 24, entry.isSelected ? 137 : 114);

        const screenYRatio = clamp(entry.pt.y / height, 0, 1);
        const premiumDepth = smoothstep(0.12, 0.88, screenYRatio);
        const foregroundDepth = Math.pow(premiumDepth, 0.95);
        const zoomDepth = smoothstep(16.0, 18.5, zoom);
        const farScale = 0.58 - zoomDepth * 0.18;
        const nearScale = 1.30 + zoomDepth * 0.35;
        const backgroundFade = smoothstep(0.08, 0.28, screenYRatio);
        const depthScale = clamp(farScale + foregroundDepth * (nearScale - farScale), farScale, nearScale);
        const depthOpacity = clamp(0.54 + backgroundFade * 0.46, 0.54, 1.00);
        const depthBrightness = clamp(0.76 + smoothstep(0.06, 0.55, screenYRatio) * 0.28, 0.76, 1.04);

        const sizePolicy = getAvatarSizePolicy(renderMode, entry.isSelected);

        const finalHeight = clamp(
          Math.round(baseSpriteHeight * depthScale * sizePolicy.lodScale),
          sizePolicy.minHeight,
          sizePolicy.maxHeight
        );

        const finalWidth = clamp(
          Math.round(baseSpriteWidth * depthScale * sizePolicy.lodScale),
          sizePolicy.minWidth,
          sizePolicy.maxWidth
        );

        let el = elementsRef.current.get(entry.id);

        if (!el) {
          el = document.createElement("div");
          el.className = "meewav-continuity-avatar";
          el.setAttribute("data-meewav-avatar-overlay-node", "true");
          el.setAttribute("data-avatar-id", entry.id);
          el.style.position = "absolute";
          el.style.pointerEvents = "none";
          el.style.borderRadius = "0";
          el.style.overflow = "visible";
          el.style.background = "transparent";
          el.style.border = "none";
          el.style.outline = "none";
          el.style.boxShadow = "none";
          el.style.display = "flex";
          el.style.alignItems = "center";
          el.style.justifyContent = "center";
          el.style.boxSizing = "border-box";

          const shadow = document.createElement("div");
          shadow.className = "meewav-avatar-shadow";
          shadow.style.position = "absolute";
          shadow.style.left = "50%";
          shadow.style.bottom = "0";
          shadow.style.width = `${Math.round(finalWidth * 0.45)}px`;
          shadow.style.height = `${Math.round(finalHeight * 0.09)}px`;
          shadow.style.transform = "translateX(-50%)";
          shadow.style.borderRadius = "50%";
          shadow.style.background = "rgba(0,0,0,1.0)";
          shadow.style.opacity = String(clamp(0.03 + foregroundDepth * 0.52, 0.03, 0.55));
          shadow.style.filter = `blur(${clamp(1.0 + foregroundDepth * 2.7, 1.0, 3.7)}px)`;
          shadow.style.zIndex = "0";
          el.appendChild(shadow);

          const img = document.createElement("img");
          img.style.position = "absolute";
          img.style.left = "0";
          img.style.top = "0";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "contain";
          img.style.borderRadius = "0";
          img.style.background = "transparent";
          img.style.zIndex = "1";
          img.draggable = false;
          el.appendChild(img);

          container.appendChild(el);
          elementsRef.current.set(entry.id, el);
        }

        // Clean styles in case of cached elements from previous versions
        el.style.display = "flex";
        el.style.borderRadius = "0";
        el.style.overflow = "visible";
        el.style.background = "transparent";
        el.style.border = "none";
        el.style.outline = "none";
        el.style.boxShadow = "none";

        let shadow = el.querySelector(".meewav-avatar-shadow") as HTMLDivElement | null;
        if (!shadow) {
          shadow = document.createElement("div");
          shadow.className = "meewav-avatar-shadow";
          el.insertBefore(shadow, el.firstChild);
        }
        shadow.style.position = "absolute";
        shadow.style.left = "50%";
        shadow.style.bottom = "0";
        shadow.style.width = `${Math.round(finalWidth * 0.45)}px`;
        shadow.style.height = `${Math.round(finalHeight * 0.09)}px`;
        shadow.style.transform = "translateX(-50%)";
        shadow.style.borderRadius = "50%";
        shadow.style.background = "rgba(0,0,0,1.0)";
        shadow.style.opacity = String(clamp(0.03 + foregroundDepth * 0.52, 0.03, 0.55));
        shadow.style.filter = `blur(${clamp(1.0 + foregroundDepth * 2.7, 1.0, 3.7)}px)`;
        shadow.style.zIndex = "0";

        let img = el.querySelector("img") as HTMLImageElement | null;
        if (!img) {
          img = document.createElement("img");
          img.draggable = false;
          el.appendChild(img);
        }
        img.style.position = "absolute";
        img.style.left = "0";
        img.style.top = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.borderRadius = "0";
        img.style.background = "transparent";
        img.style.zIndex = "1";

        img.src = avatarImageSrc(entry.avatarId);
        img.alt = entry.instrument;

        el.style.width = `${finalWidth}px`;
        el.style.height = `${finalHeight}px`;

        const baseZIndex = Math.round(entry.pt.y);
        el.style.zIndex = String(entry.isSelected ? baseZIndex + 10000 : baseZIndex);

        if (overlayDebug) {
          el.style.border = "1px dashed lime";
          el.style.boxShadow = "0 0 8px lime";
          img.style.filter = "none";
        } else if (entry.isSelected) {
          img.style.filter = "drop-shadow(0 0 6px rgba(255, 0, 127, 0.85)) drop-shadow(0 0 12px rgba(255, 0, 127, 0.4))";
        } else {
          img.style.filter = `saturate(${clamp(0.72 + foregroundDepth * 0.40, 0.72, 1.12)})`;
        }

        el.style.transformOrigin = "50% 100%";
        el.style.transform = `translate3d(${entry.pt.x - finalWidth / 2}px, ${entry.pt.y - finalHeight}px, 0)`;
        el.style.opacity = String(depthOpacity * avatarOpacity);
        el.style.filter = `brightness(${depthBrightness})`;
      }

      const failBannerId = "meewav-raw-overlay-fail-banner";
      const SHOW_RAW_OVERLAY_FAIL_BANNER = false;

      if (
        SHOW_RAW_OVERLAY_FAIL_BANNER &&
        forceRawOverlay &&
        !isFetching &&
        bboxFetchedCount === 0 &&
        !lastFetchError
      ) {
        let banner = document.getElementById(failBannerId);
        if (!banner) {
          banner = document.createElement("div");
          banner.id = failBannerId;
          banner.style.position = "absolute";
          banner.style.top = "50%";
          banner.style.left = "50%";
          banner.style.transform = "translate(-50%, -50%)";
          banner.style.background = "rgba(220,20,60,0.95)";
          banner.style.color = "#fff";
          banner.style.font = "bold 32px 'Outfit','Inter',sans-serif";
          banner.style.padding = "24px 40px";
          banner.style.borderRadius = "12px";
          banner.style.zIndex = "20000";
          banner.textContent = "RAW OVERLAY FAILED TO START";
          map.getContainer().appendChild(banner);
        }
      } else {
        document.getElementById(failBannerId)?.remove();
      }

      updateBadge(true);
      (window as any).__MEEWAV_OVERLAY_COUNT__ = activeEntries.length;

      (window as any).__MEEWAV_AVATAR_OVERLAY_DEBUG__ = {
        viewportUniformSamplerEnabled: true,
        cameraCentricSortDisabled: true,
        gridCols: GRID_COLS,
        gridRows: GRID_ROWS,
        maxPerCell,
        hudExclusionWidth: HUD_EXCLUSION_WIDTH,
        bboxCount: bboxFetchedCount,
        activeSetStabilityFixEnabled: true,
        previousVisibleBypassesBandLimit: true,
        visibleKeepaliveMs: 1500,
        pitchAwareBboxPadding: true,
        bboxPadFactor: lastPadFactorRef.current,
        bboxLimit: lastBboxLimitRef.current,
        screenBuffer: {
          x: SCREEN_BUFFER_X,
          top: SCREEN_BUFFER_TOP,
          bottom: SCREEN_BUFFER_BOTTOM
        },
        avatarLodMode,
        runtimeAvatarBudget,
        openLeafClusterLimit,
        lodSpriteScale,
        openedNanoDebug: (window as any).__MEEWAV_OPENED_NANO_DEBUG__ ?? null,
        adaptiveAvatarBudgetEnabled: true,
        depthPerspectivePreserved: true,
        miniAvatarsCanExceedPremium120: true,
        premiumAvatarBudgetStill120: true,
        lodContractEnabled: true,
        clusterOnlyMaxZoom: AVATAR_FADE_IN_START_ZOOM,
        avatarOnlyMinZoom: AVATAR_FULL_START_ZOOM,
        clustersVisible: zoom < AVATAR_FULL_START_ZOOM,
        avatarsVisible: zoom >= AVATAR_FADE_IN_START_ZOOM,
        lodExclusiveRendering: true,
        clustersRenderedWhileSpritesVisible: zoom < AVATAR_FULL_START_ZOOM && zoom > AVATAR_FADE_IN_START_ZOOM,
        visibleClusterFeaturesCount: zoom >= AVATAR_FULL_START_ZOOM ? 0 : lastProjectedCandidates,
        clusterNumberSourceProperty: "point_count",
        clusterMechanicalLinkVerified: true,
        clusterParentChildInvariantVerified: true,
        gridSamplerEnabled: true,
        dataSource: "API_BBOX",
        enabled: true,
        serverEndpoint: "/api/avatars/bbox",
        bboxFetchedCount,
        rawRejectedFeatures,
        projectedCandidates: lastProjectedCandidates,
        overlayCount: activeEntries.length,
        activeEntriesCount: activeEntries.length,
        domNodes: elementsRef.current.size,
        noStaleDomNodes: true,
        staleDomCarouselFix: true,
        nativeLayersHidden,
        depthPremiumEnabled: true,
        depthScaleMin: 0.40,
        depthScaleMax: 1.65,
        depthOpacityEnabled: true,
        depthZIndexEnabled: true,
        // MANDATORY DEBUG KEYS FROM MISSION HARD_FREEZE_VISIBLE_SET_DURING_MOVE
        hardFreezeDuringMove: true,
        visibleSetLocked: lockVisibleSet,
        visibleSetLockedUntil,
        frozenVisibleIdsCount: activeVisibleIdsRef.current.size,
        noDomRemovalDuringMove: true,
        visibleSetSettleMs: VISIBLE_SET_SETTLE_MS,
        lastCycleAddedCount,
        lastCycleRemovedCount,
        lastCycleKeptCount,
        churnRatio,
        selectionMode: "STABLE_PREVIOUS_KEEPALIVE",
        freshViewportAggressiveResamplingDisabled: true,
        depthDebug: activeEntries.slice(0, 20).map(entry => {
          const screenYRatio = clamp(entry.pt.y / height, 0, 1);
          const premiumDepth = smoothstep(0.12, 0.88, screenYRatio);
          const foregroundDepth = Math.pow(premiumDepth, 0.95);
          const zoomDepth = smoothstep(16.0, 18.5, zoom);
          const farScale = 0.58 - zoomDepth * 0.18;
          const nearScale = 1.30 + zoomDepth * 0.35;
          const depthScale = clamp(farScale + foregroundDepth * (nearScale - farScale), farScale, nearScale);
          
          let baseSpriteHeight = Math.round((entry.isSelected ? 76 : 64) * zoomScale);
          if (zoom >= 18) {
            baseSpriteHeight = Math.max(baseSpriteHeight, entry.isSelected ? 112 : 88);
          }
          if (zoom >= 19.5) {
            baseSpriteHeight = Math.max(baseSpriteHeight, entry.isSelected ? 154 : 124);
          }
          baseSpriteHeight = clamp(baseSpriteHeight, 34, entry.isSelected ? 190 : 158);

          let baseSpriteWidth = Math.round(baseSpriteHeight * 0.72);
          if (zoom >= 18) {
            baseSpriteWidth = Math.max(baseSpriteWidth, entry.isSelected ? 80 : 63);
          }
          if (zoom >= 19.5) {
            baseSpriteWidth = Math.max(baseSpriteWidth, entry.isSelected ? 111 : 89);
          }
          baseSpriteWidth = clamp(baseSpriteWidth, 24, entry.isSelected ? 137 : 114);

          const finalWidth = Math.round(baseSpriteWidth * depthScale * lodSpriteScale);
          const finalHeight = Math.round(baseSpriteHeight * depthScale * lodSpriteScale);

          return {
            id: entry.id,
            y: Math.round(entry.pt.y),
            screenYRatio: Number((entry.pt.y / height).toFixed(3)),
            depthScale: Number(depthScale.toFixed(3)),
            finalWidth,
            finalHeight
          };
        }),
        normalVisibility: map.getLayer("meewav-avatar-points-normal")
          ? map.getLayoutProperty("meewav-avatar-points-normal", "visibility")
          : "missing",
        selectedVisibility: map.getLayer("meewav-avatar-points-selected")
          ? map.getLayoutProperty("meewav-avatar-points-selected", "visibility")
          : "missing",
        usesMvtSourceForOverlay: false,
        visibleOverlayIds: lastActiveIds,
        lastFetchError,
        distributedNanoAvatarMode: DISTRIBUTED_NANO_AVATAR_MODE,
        activeNanoClusterMode: false,
        singleNanoChildrenModeDisabled: true,
        distributedNanoFetch: (window as any).__MEEWAV_DISTRIBUTED_NANO_FETCH__ ?? null,
        mechanicalNanoRepresentativeMode: true,
        oneNanoCannotMonopolizeOverlay: true,
        maxAvatarsPerNanoCluster: MAX_AVATARS_PER_NANO_CLUSTER,
        lastFrameAt: performance.now(),
        activeEntries: activeEntries.map(entry => ({
          id: entry.id,
          lng: entry.lng,
          lat: entry.lat,
          x: Math.round(entry.pt.x),
          y: Math.round(entry.pt.y),
          renderRank: entry.renderRank,
          avatarId: entry.avatarId,
          cell: getScreenCell(entry, width, height),
          parent_nano_id: (avatarStoreRef.current.get(entry.id) as any)?.parent_nano_id ?? null,
          opened_nano_id: (avatarStoreRef.current.get(entry.id) as any)?.opened_nano_id ?? null,
          parent_count: (avatarStoreRef.current.get(entry.id) as any)?.parent_count ?? null,
          representative_of_nano: (avatarStoreRef.current.get(entry.id) as any)?.representative_of_nano ?? null
        })),
        storeSize: avatarStoreRef.current.size,
        activeSetStable: true,
        projectedCandidatesSample: candidates.slice(0, 200).map(entry => ({
          id: entry.id,
          lng: entry.lng,
          lat: entry.lat,
          x: Math.round(entry.pt.x),
          y: Math.round(entry.pt.y),
          renderRank: entry.renderRank
        }))
      };
    };

    const scheduleFrame = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(renderOverlay);
    };

    const onMoveStart = () => {
      isMoving = true;
      lockVisibleSetForMotion();
      scheduleFrame();
    };

    const onMoveEnd = () => {
      isMoving = false;
      lockVisibleSetForMotion();
      scheduleFetch();
      scheduleFrame();

      window.setTimeout(() => {
        if (!cancelled) {
          scheduleFrame();
        }
      }, VISIBLE_SET_SETTLE_MS + 50);
    };

    map.on("movestart", onMoveStart);
    map.on("zoomstart", onMoveStart);
    map.on("pitchstart", onMoveStart);
    map.on("rotatestart", onMoveStart);

    map.on("move", scheduleFrame);
    map.on("zoom", scheduleFrame);
    map.on("pitch", scheduleFrame);
    map.on("rotate", scheduleFrame);
    map.on("render", scheduleFrame);

    map.on("moveend", onMoveEnd);
    map.on("zoomend", onMoveEnd);
    map.on("pitchend", onMoveEnd);
    map.on("rotateend", onMoveEnd);

    scheduleFetch();
    scheduleFrame();

    return () => {
      if (overlayDebugLogsEnabled) console.log("[OVERLAY_HOOK_UNMOUNT]");
      cancelled = true;
      if (fetchTimer !== null) window.clearTimeout(fetchTimer);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);

      map.off("movestart", onMoveStart);
      map.off("zoomstart", onMoveStart);
      map.off("pitchstart", onMoveStart);
      map.off("rotatestart", onMoveStart);

      map.off("move", scheduleFrame);
      map.off("zoom", scheduleFrame);
      map.off("pitch", scheduleFrame);
      map.off("rotate", scheduleFrame);
      map.off("render", scheduleFrame);
      map.off("moveend", onMoveEnd);
      map.off("zoomend", onMoveEnd);
      map.off("pitchend", onMoveEnd);
      map.off("rotateend", onMoveEnd);

      document.getElementById("meewav-raw-overlay-fail-banner")?.remove();
      map.getContainer().querySelector(".meewav-avatar-overlay-badge-persistent")?.remove();
      restoreNativeLayers();
      cleanupOverlayDom();
    };
  }, [map]);
}
