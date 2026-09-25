import { useEffect, useRef, useState } from "react";
import type { FilterSpecification, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import { HOST_AVATAR_SIZE_MULTIPLIER } from "../../../map/avatarVisualContract";
import { getRuntimeApiBaseUrl } from "../../../lib/runtimeApiUrl";
import { getOnboardingFlyHiddenProfileId } from "../onboarding/onboardingCurrentUserOverlay";

type CanvasAvatar = {
  id: string;
  lng: number;
  lat: number;
  avatarId: string;
  instrument?: string | null;
  addressLabel?: string | null;
  rank: number;
  displayName: string;
  handle?: string;
  isCurrentUser: boolean;
  mainRole: string;
  zoneName: string;
  gradeLevel?: number | null;
  gradeTier?: string | null;
  gradeColor?: string | null;
  goldenLikesCount?: number | null;
};

export type CanvasAvatarSelection = CanvasAvatar & {
  screenX: number;
  screenY: number;
};

type ScreenAvatar = CanvasAvatar & {
  x: number;
  y: number;
  image: HTMLImageElement;
  baseSize: number;
  size: number;
  currentScale: number;
  opacity: number;
  shadowOpacity: number;
};

const AVATAR_BASE_PATH = "/images/V4";
const CANVAS_AVATAR_CURSOR_LOCK_ATTRIBUTE = "data-meewav-canvas-avatar-cursor-lock";
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

const HIDDEN_MAPLIBRE_AVATAR_LAYERS = [
  "meewav-avatar-ground-shadow",
  "meewav-horizon-impostor-points",
  "meewav-avatar-points-normal",
  "meewav-avatar-points-selected",
  "meewav-avatar-points-far",
  "meewav-avatar-points-mid",
  "meewav-avatar-points-near",
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
  "meewav-avatar-clusters",
  "meewav-avatar-cluster-count"
];

function normalizeAvatarId(value: unknown): string {
  const raw = String(value ?? "4");
  return raw.startsWith("avatar_") ? raw : `avatar_${raw}`;
}

function setCanvasAvatarCursorLock(map: MapLibreMap, locked: boolean) {
  const canvas = map.getCanvas();
  if (locked) {
    canvas.setAttribute(CANVAS_AVATAR_CURSOR_LOCK_ATTRIBUTE, "true");
  } else {
    canvas.removeAttribute(CANVAS_AVATAR_CURSOR_LOCK_ATTRIBUTE);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Unable to load ${src}`));
    image.src = src;
  });
}

async function preloadImages(): Promise<Map<string, HTMLImageElement>> {
  const entries = await Promise.all(
    Object.entries(AVATAR_MAP).map(async ([id, file]) => {
      const image = await loadImage(`${AVATAR_BASE_PATH}/${file}`);
      return [id, image] as const;
    })
  );

  return new Map(entries);
}

function normalizeServerAvatar(raw: any): CanvasAvatar | null {
  const lng = Number(raw?.lng);
  const lat = Number(raw?.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  return {
    id: String(raw?.profile_id ?? raw?.id ?? raw?.musician_id ?? `${lng},${lat}`),
    lng,
    lat,
    avatarId: normalizeAvatarId(raw?.avatar_id),
    instrument: raw?.instrument ?? null,
    addressLabel: raw?.address_label ?? null,
    rank: Number(raw?.render_rank ?? raw?.avatar_render_rank ?? 999999999),
    displayName: String(raw?.display_name ?? raw?.name ?? raw?.handle ?? raw?.instrument ?? "Artiste"),
    handle: raw?.handle ? String(raw.handle) : undefined,
    isCurrentUser: raw?.is_current_user === true || raw?.is_current_user === 1 || raw?.is_current_user === "true",
    mainRole: String(raw?.main_role ?? raw?.instrument ?? raw?.primary_role_label ?? "Artiste"),
    zoneName: String(raw?.zone_name ?? raw?.district_name ?? raw?.address_label ?? ""),
    gradeLevel: Number.isFinite(Number(raw?.grade_level ?? raw?.grade_stars))
      ? Number(raw?.grade_level ?? raw?.grade_stars)
      : null,
    gradeTier: raw?.grade_tier ? String(raw.grade_tier) : null,
    gradeColor: raw?.grade_color ? String(raw.grade_color) : null,
    goldenLikesCount: Number.isFinite(Number(raw?.golden_likes_count ?? raw?.goldenLikesCount))
      ? Number(raw?.golden_likes_count ?? raw?.goldenLikesCount)
      : null,
  };
}

function getCanvasSize(map: MapLibreMap) {
  const container = map.getContainer();
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  return { width, height, pixelRatio };
}

const EQUATOR_METERS_PER_PIXEL_ZOOM_0 = 156543.03392804097;
const MAPLIBRE_DEFAULT_FOV_RAD = 0.6435011087932844;
const CLUSTER_DISK_ALTITUDE_METERS = 4000;

type ClusterSummary = {
  count: number;
  lng: number;
  lat: number;
} | null;

function getEstimatedCameraAltitudeMeters(map: MapLibreMap) {
  const center = map.getCenter();
  const latitudeRad = center.lat * Math.PI / 180;
  const pitchRad = map.getPitch() * Math.PI / 180;
  const zoomScale = 2 ** map.getZoom();
  const metersPerPixel = (EQUATOR_METERS_PER_PIXEL_ZOOM_0 * Math.cos(latitudeRad)) / zoomScale;
  const canvasHeight = Math.max(map.getCanvas().clientHeight, 1);
  const cameraToCenterPixels = (canvasHeight / 2) / Math.tan(MAPLIBRE_DEFAULT_FOV_RAD / 2);
  return Math.max(0, Math.cos(pitchRad) * cameraToCenterPixels * metersPerPixel);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatCompactCount(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(Math.max(0, Math.round(value)));
}

function drawClusterDisk(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  count: number
) {
  const radius = clamp(36 + Math.log10(Math.max(1, count)) * 8, 46, 68);

  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.38)";
  context.shadowBlur = 18;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fillStyle = "rgba(121, 72, 255, 0.92)";
  context.fill();
  context.lineWidth = 3;
  context.strokeStyle = "rgba(255, 255, 255, 0.82)";
  context.stroke();

  context.shadowBlur = 0;
  context.fillStyle = "#ffffff";
  context.font = "700 18px Inter, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(formatCompactCount(count), x, y);
  context.restore();
}

function getVisibleQueryBounds(map: MapLibreMap) {
  const canvas = map.getCanvas();
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const points: number[][] = [];

  for (const xRatio of [-0.04, 0.18, 0.38, 0.5, 0.62, 0.82, 1.04]) {
    for (const yRatio of [-0.04, 0.12, 0.28, 0.44, 0.62, 0.80, 1.04]) {
      points.push([width * xRatio, height * yRatio]);
    }
  }

  const lngLats = points.map(([x, y]) => map.unproject([x, y]));
  const lngs = lngLats.map(point => point.lng);
  const lats = lngLats.map(point => point.lat);

  return {
    west: Math.min(...lngs),
    south: Math.min(...lats),
    east: Math.max(...lngs),
    north: Math.max(...lats),
    centerLng: map.getCenter().lng,
    centerLat: map.getCenter().lat,
    width,
    height
  };
}

function isLowTiltTuning(zoom: number, pitch: number) {
  return zoom >= 18.25 && pitch >= 35;
}

function getAvatarSize(_zoom: number, _screenY: number, _height: number, _pitch: number) {
  // Screen-space size is deliberately invariant: camera zoom, pitch and depth
  // must only move avatars, never resize their raster on every frame.
  return 34;
}

function getAvatarDepthOpacity(zoom: number, pitch: number, screenY: number, height: number) {
  if (!isLowTiltTuning(zoom, pitch)) return 1;
  const ratio = screenY / Math.max(1, height);
  if (ratio < 0.22) return 0.38;
  if (ratio < 0.42) return 0.58;
  if (ratio < 0.66) return 0.82;
  return 1;
}

function getAvatarShadowOpacity(zoom: number, pitch: number, screenY: number, height: number) {
  if (!isLowTiltTuning(zoom, pitch)) return 0;
  const ratio = screenY / Math.max(1, height);
  if (ratio < 0.56) return 0;
  if (ratio < 0.72) return 0.12;
  return 0.25;
}


type ScreenCandidate = {
  avatar: CanvasAvatar;
  point: { x: number; y: number };
  score: number;
};

const AVATAR_HOVER_VERTICAL_OFFSET_PX = 60;

function selectScreenDistributedAvatars(
  candidates: ScreenCandidate[],
  maxAvatars: number,
  width: number,
  height: number,
  pitch: number
) {
  const columns = pitch < 20 ? 18 : 14;
  const rows = pitch < 20 ? 9 : 7;
  const selected: ScreenCandidate[] = [];
  const selectedIds = new Set<string>();
  const columnCounts = Array.from({ length: columns }, () => 0);
  const cellCounts = new Map<string, number>();
  const sorted = [...candidates].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.avatar.rank - b.avatar.rank;
  });
  const softCellLimit = Math.max(3, Math.ceil(maxAvatars / (columns * rows)));

  const getCell = (point: { x: number; y: number }) => {
    const column = Math.max(0, Math.min(columns - 1, Math.floor((point.x / Math.max(1, width)) * columns)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((point.y / Math.max(1, height)) * rows)));
    return { column, row, key: `${column}:${row}` };
  };

  for (const candidate of sorted) {
    if (selected.length >= maxAvatars) break;
    if (selectedIds.has(candidate.avatar.id)) continue;

    const { column, key } = getCell(candidate.point);
    const minColumnCount = Math.min(...columnCounts);
    const cellCount = cellCounts.get(key) ?? 0;

    if (selected.length < maxAvatars * 0.72 && columnCounts[column] > minColumnCount + 10) continue;
    if (selected.length < maxAvatars * 0.82 && cellCount >= softCellLimit) continue;

    selected.push(candidate);
    selectedIds.add(candidate.avatar.id);
    columnCounts[column] += 1;
    cellCounts.set(key, cellCount + 1);
  }

  for (const candidate of sorted) {
    if (selected.length >= maxAvatars) break;
    if (selectedIds.has(candidate.avatar.id)) continue;
    selected.push(candidate);
    selectedIds.add(candidate.avatar.id);
  }

  return selected.map(({ avatar }) => avatar);
}
function scoreScreenCandidate(point: { x: number; y: number }, width: number, height: number, zoom: number, pitch: number) {
  if (!isLowTiltTuning(zoom, pitch)) {
    const centerX = width * 0.5;
    const centerY = height * 0.54;
    const dx = Math.abs(point.x - centerX) / Math.max(1, width * 0.5);
    const dy = Math.abs(point.y - centerY) / Math.max(1, height * 0.5);
    const centerScore = dx * dx + dy * dy;
    const horizonPenalty = point.y < height * 0.12 ? 4 : 0;
    const bottomPenalty = point.y > height * 0.98 ? 2 : 0;
    return centerScore + horizonPenalty + bottomPenalty;
  }

  const centerX = width * 0.5;
  const centerY = height * 0.70;
  const dx = Math.abs(point.x - centerX) / Math.max(1, width * 0.5);
  const dy = Math.abs(point.y - centerY) / Math.max(1, height * 0.5);
  const centerScore = dx * dx + dy * dy;
  const horizonPenalty = point.y < height * 0.30 ? 18 : 0;
  const foregroundBonus = point.y > height * 0.48 && point.y < height * 0.94 ? -0.55 : 0;
  const bottomPenalty = point.y > height * 0.98 ? 3 : 0;
  return centerScore + horizonPenalty + foregroundBonus + bottomPenalty;
}

function findHoveredAvatar(mouseX: number, mouseY: number, projectedAvatars: ScreenAvatar[]) {
  let best: ScreenAvatar | null = null;
  let bestDistance = Infinity;

  for (const item of projectedAvatars) {
    const dx = mouseX - item.x;
    const dy = mouseY - (item.y - item.size / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const hitRadius = Math.max(24, item.size * 0.68);

    if (distance < hitRadius && distance < bestDistance) {
      best = item;
      bestDistance = distance;
    }
  }

  return best;
}

function drawAvatar(
  context: CanvasRenderingContext2D,
  avatar: ScreenAvatar,
  options?: {
    glow?: boolean;
    glowColor?: string;
    glowFill?: string;
    forceOpacity?: number;
  }
) {
  const size = avatar.size;
  const x = avatar.x;
  const y = avatar.y;

  if (avatar.shadowOpacity > 0) {
    context.save();
    context.globalAlpha = avatar.shadowOpacity;
    context.fillStyle = "rgba(0, 0, 0, 0.62)";
    context.filter = "blur(2px)";
    context.beginPath();
    context.ellipse(x, y + 2, size * 0.34, size * 0.10, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  if (options?.glow) {
    context.save();
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(x, y - size * 0.45, size * 0.58, 0, Math.PI * 2);
    context.shadowColor = options.glowColor ?? "rgba(168, 85, 247, 0.75)";
    context.shadowBlur = 24;
    context.fillStyle = options.glowFill ?? "rgba(168, 85, 247, 0.24)";
    context.fill();
    context.restore();
  }

  context.save();
  context.globalAlpha = options?.forceOpacity ?? avatar.opacity;
  context.drawImage(avatar.image, x - size / 2, y - size, size, size);
  context.restore();
}

type AvatarFetchState = {
  centerLng: number;
  centerLat: number;
  zoom: number;
  at: number;
};

function approximateMetersBetweenLngLat(
  lngA: number,
  latA: number,
  lngB: number,
  latB: number
) {
  const metersPerDegreeLat = 111_320;
  const meanLatRad = ((latA + latB) / 2) * Math.PI / 180;
  const metersPerDegreeLng = 111_320 * Math.cos(meanLatRad);

  const dx = (lngA - lngB) * metersPerDegreeLng;
  const dy = (latA - latB) * metersPerDegreeLat;

  return Math.sqrt(dx * dx + dy * dy);
}

function getAvatarRefetchMoveThresholdMeters(zoom: number) {
  if (zoom >= 18) return 90;
  if (zoom >= 17) return 140;
  if (zoom >= 16) return 220;
  return 420;
}

export function useCanvasAvatarOverlay(
  map: MapLibreMap | null,
  enabled: boolean,
  maxAvatars = 2000,
  activeAvatarId: string | null = null,
  onAvatarSelectionChange?: (avatar: CanvasAvatarSelection | null) => void,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredAvatarId, setHoveredAvatarId] = useState<string | null>(null);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(null);
  const hoveredAvatarIdRef = useRef<string | null>(null);
  const selectedAvatarIdRef = useRef<string | null>(null);

  useEffect(() => {
    hoveredAvatarIdRef.current = hoveredAvatarId;
  }, [hoveredAvatarId]);

  useEffect(() => {
    selectedAvatarIdRef.current = selectedAvatarId;
  }, [selectedAvatarId]);

  useEffect(() => {
    selectedAvatarIdRef.current = activeAvatarId;
    setSelectedAvatarId(activeAvatarId);
  }, [activeAvatarId]);

  useEffect(() => {
    if (!map || !enabled || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let cancelled = false;
    let frameId: number | null = null;
    let fetchTimer: number | null = null;
    let fetchController: AbortController | null = null;
    let images = new Map<string, HTMLImageElement>();
    let avatars: CanvasAvatar[] = [];
    let clusterSummary: ClusterSummary = null;
    let screenAvatars: ScreenAvatar[] = [];
    let lastAvatarFetchState: AvatarFetchState | null = null;
    const hiddenNativeLayers = new Set<string>();
    const nativeLayerState = new Map<string, { visibility: unknown; filter: unknown }>();

    const resize = () => {
      const { width, height, pixelRatio } = getCanvasSize(map);
      const targetWidth = Math.round(width * pixelRatio);
      const targetHeight = Math.round(height * pixelRatio);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      return { width, height };
    };

    const hideMapLibreAvatarSymbols = () => {
      for (const layerId of HIDDEN_MAPLIBRE_AVATAR_LAYERS) {
        if (!map.getLayer(layerId)) continue;
        if (hiddenNativeLayers.has(layerId)) continue;
        try {
          nativeLayerState.set(layerId, {
            visibility: map.getLayoutProperty(layerId, "visibility"),
            filter: map.getFilter(layerId),
          });
        } catch {
          nativeLayerState.set(layerId, {
            visibility: undefined,
            filter: undefined,
          });
        }
        try { map.setLayoutProperty(layerId, "visibility", "none"); } catch { /* ignore */ }
        try { map.setFilter(layerId, ["==", ["get", "__canvas_overlay_disabled__"], true]); } catch { /* ignore */ }
        hiddenNativeLayers.add(layerId);
      }
    };

    const restoreMapLibreAvatarSymbols = () => {
      for (const [layerId, state] of nativeLayerState) {
        if (!map.getLayer(layerId)) continue;
        try {
          map.setLayoutProperty(
            layerId,
            "visibility",
            state.visibility === "none" ? "none" : "visible",
          );
        } catch { /* ignore */ }
        try {
          map.setFilter(layerId, Array.isArray(state.filter) ? state.filter as FilterSpecification : null);
        } catch { /* ignore */ }
      }
      hiddenNativeLayers.clear();
      nativeLayerState.clear();
    };

    const drawNow = () => {
      frameId = null;
      if (cancelled) return;

      hideMapLibreAvatarSymbols();

      const { width, height } = resize();
      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "medium";

      const zoom = map.getZoom();
      const pitch = map.getPitch();
      const altitudeMeters = getEstimatedCameraAltitudeMeters(map);
      const hoveredId = hoveredAvatarIdRef.current;
      const selectedId = selectedAvatarIdRef.current;
      const clusterCount = clusterSummary?.count ?? avatars.length;
      const onboardingHiddenProfileId = getOnboardingFlyHiddenProfileId(map);
      const drawableAvatars = onboardingHiddenProfileId
        ? avatars.filter((avatar) => avatar.id !== onboardingHiddenProfileId)
        : avatars;

      if (altitudeMeters >= CLUSTER_DISK_ALTITUDE_METERS && clusterCount > 0 && drawableAvatars.length > 0) {
        const projected = clusterSummary ? map.project([clusterSummary.lng, clusterSummary.lat]) : { x: width / 2, y: height / 2 };
        const diskX = clamp(projected.x, 84, Math.max(84, width - 84));
        const diskY = clamp(projected.y, 120, Math.max(120, height - 120));
        drawClusterDisk(context, diskX, diskY, clusterCount);
        screenAvatars = [];
        map.getCanvas().style.cursor = "";
        (map as any).__meewav_canvas_avatar_overlay_debug = {
          mode: "cluster-disk",
          cached: avatars.length,
          drawn: 0,
          clusterCount,
          maxAvatars,
          altitudeMeters: Math.round(altitudeMeters),
          zoom: Number(zoom.toFixed(2)),
          pitch: Number(pitch.toFixed(1))
        };
        return;
      }

      const nextScreenAvatars: ScreenAvatar[] = [];

      for (const avatar of drawableAvatars) {
        const point = map.project([avatar.lng, avatar.lat]);
        if (point.x < -80 || point.y < -120 || point.x > width + 80 || point.y > height + 80) {
          continue;
        }

        const image = images.get(avatar.avatarId) || images.get("avatar_4");
        if (!image) continue;

        const baseSize = getAvatarSize(zoom, point.y, height, pitch);
        const currentScale = avatar.isCurrentUser ? HOST_AVATAR_SIZE_MULTIPLIER : 1;

        nextScreenAvatars.push({
          ...avatar,
          x: point.x,
          y: point.y,
          image,
          baseSize,
          size: baseSize * currentScale,
          currentScale,
          opacity: getAvatarDepthOpacity(zoom, pitch, point.y, height),
          shadowOpacity: getAvatarShadowOpacity(zoom, pitch, point.y, height)
        });
      }

      const selectedAvatar = selectedId ? nextScreenAvatars.find((avatar) => avatar.id === selectedId) ?? null : null;

      for (const avatar of nextScreenAvatars) {
        if (avatar.id === selectedId) continue;
        drawAvatar(context, avatar);
      }

      if (selectedAvatar) {
        drawAvatar(context, {
          ...selectedAvatar,
          y: selectedAvatar.y + AVATAR_HOVER_VERTICAL_OFFSET_PX,
        }, {
          glow: true,
          glowColor: "rgba(168, 85, 247, 0.85)",
          glowFill: "rgba(168, 85, 247, 0.28)",
          forceOpacity: 1
        });
      }

      screenAvatars = nextScreenAvatars;
      (map as any).__meewav_canvas_avatar_overlay_debug = {
        cached: avatars.length,
        drawn: screenAvatars.length,
        maxAvatars,
        hoveredAvatarId: hoveredId,
        selectedAvatarId: selectedId,
        zoom: Number(zoom.toFixed(2)),
        pitch: Number(pitch.toFixed(1))
      };

    };

    const scheduleDraw = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(drawNow);
    };

    const shouldRefetchAvatars = () => {
      if (!lastAvatarFetchState) return true;

      const center = map.getCenter();
      const zoom = map.getZoom();

      if (Math.abs(zoom - lastAvatarFetchState.zoom) >= 0.35) {
        return true;
      }

      const movedMeters = approximateMetersBetweenLngLat(
        center.lng,
        center.lat,
        lastAvatarFetchState.centerLng,
        lastAvatarFetchState.centerLat
      );

      return movedMeters >= getAvatarRefetchMoveThresholdMeters(zoom);
    };

    const fetchVisibleAvatars = async () => {
      if (cancelled) return;
      fetchController?.abort();
      fetchController = new AbortController();

      const visibleBounds = getVisibleQueryBounds(map);
      const params = new URLSearchParams({
        west: String(visibleBounds.west),
        south: String(visibleBounds.south),
        east: String(visibleBounds.east),
        north: String(visibleBounds.north),
        centerLng: String(visibleBounds.centerLng),
        centerLat: String(visibleBounds.centerLat),
        limit: String(Math.min(16000, Math.max(maxAvatars * 8, maxAvatars)))
      });

      try {
        const response = await fetch(`${getRuntimeApiBaseUrl(import.meta.env.VITE_AVATAR_API_BASE_URL)}/api/avatars/bbox?${params.toString()}`, {
          signal: fetchController.signal,
          cache: "no-store"
        });
        if (!response.ok) return;

        const payload = await response.json();
        const nextAvatars = Array.isArray(payload?.avatars)
          ? payload.avatars.map(normalizeServerAvatar).filter(Boolean) as CanvasAvatar[]
          : [];
        const totalCount = Number(payload?.totalCount ?? payload?.count ?? nextAvatars.length);
        const avgLng = nextAvatars.length > 0
          ? nextAvatars.reduce((sum, avatar) => sum + avatar.lng, 0) / nextAvatars.length
          : visibleBounds.centerLng;
        const avgLat = nextAvatars.length > 0
          ? nextAvatars.reduce((sum, avatar) => sum + avatar.lat, 0) / nextAvatars.length
          : visibleBounds.centerLat;
        clusterSummary = Number.isFinite(totalCount) && totalCount > 0
          ? { count: totalCount, lng: avgLng, lat: avgLat }
          : null;

        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const minScreenY = isLowTiltTuning(zoom, pitch) ? visibleBounds.height * 0.18 : -48;

        const screenCandidates = nextAvatars
          .map((avatar) => ({
            avatar,
            point: map.project([avatar.lng, avatar.lat])
          }))
          .filter(({ point }) => (
            point.x >= -48 &&
            point.x <= visibleBounds.width + 48 &&
            point.y >= minScreenY &&
            point.y <= visibleBounds.height + 48
          ))
          .map(({ avatar, point }) => ({
            avatar,
            point,
            score: scoreScreenCandidate(point, visibleBounds.width, visibleBounds.height, zoom, pitch)
          }));

        avatars = selectScreenDistributedAvatars(
          screenCandidates,
          maxAvatars,
          visibleBounds.width,
          visibleBounds.height,
          pitch
        );

        lastAvatarFetchState = {
          centerLng: visibleBounds.centerLng,
          centerLat: visibleBounds.centerLat,
          zoom: map.getZoom(),
          at: performance.now()
        };

        scheduleDraw();
      } catch (error: any) {
        if (error?.name !== "AbortError") {
          console.warn("[Meewav canvas overlay] avatar bbox fetch failed", error);
        }
      }
    };

    const scheduleFetch = () => {
      if (!shouldRefetchAvatars()) {
        scheduleDraw();
        return;
      }

      if (fetchTimer !== null) window.clearTimeout(fetchTimer);

      fetchTimer = window.setTimeout(() => {
        fetchTimer = null;

        if (!shouldRefetchAvatars()) {
          scheduleDraw();
          return;
        }

        void fetchVisibleAvatars();
      }, 350);
    };

    const handlePointerMove = (event: MapMouseEvent) => {
      const avatar = findHoveredAvatar(event.point.x, event.point.y, screenAvatars);
      const nextHoveredId = avatar?.id ?? null;
      if (nextHoveredId !== hoveredAvatarIdRef.current) {
        hoveredAvatarIdRef.current = nextHoveredId;
        setHoveredAvatarId(nextHoveredId);
        setCanvasAvatarCursorLock(map, Boolean(nextHoveredId));
        map.getCanvas().style.cursor = nextHoveredId ? "pointer" : "";
      }
    };

    const handleClick = (event: MapMouseEvent) => {
      const avatar = findHoveredAvatar(event.point.x, event.point.y, screenAvatars);
      if (!avatar) {
        selectedAvatarIdRef.current = null;
        setSelectedAvatarId(null);
        onAvatarSelectionChange?.(null);
        scheduleDraw();
        return;
      }
      selectedAvatarIdRef.current = avatar.id;
      setSelectedAvatarId(avatar.id);
      (map as any).__meewav_canvas_avatar_overlay_selected = avatar;
      onAvatarSelectionChange?.({
        ...avatar,
        screenX: avatar.x,
        screenY: avatar.y,
      });
      scheduleDraw();
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;

      const rect = map.getCanvas().getBoundingClientRect();
      const avatar = findHoveredAvatar(
        event.clientX - rect.left,
        event.clientY - rect.top,
        screenAvatars,
      );
      if (avatar) return;

      selectedAvatarIdRef.current = null;
      setSelectedAvatarId(null);
      onAvatarSelectionChange?.(null);
      scheduleDraw();
    };

    const handleMouseLeave = () => {
      if (hoveredAvatarIdRef.current === null) return;
      hoveredAvatarIdRef.current = null;
      setHoveredAvatarId(null);
      setCanvasAvatarCursorLock(map, false);
      map.getCanvas().style.cursor = "";
      scheduleDraw();
    };

    const handleOnboardingAvatarVisibility = (event: Event) => {
      const detail = (event as CustomEvent<{ map?: MapLibreMap }>).detail;
      if (detail?.map !== map) return;
      scheduleDraw();
    };

    void preloadImages().then((loadedImages) => {
      if (cancelled) return;
      images = loadedImages;
      scheduleDraw();
    });

    hideMapLibreAvatarSymbols();
    void fetchVisibleAvatars();
    map.on("move", scheduleDraw);
    map.on("zoom", scheduleDraw);
    map.on("rotate", scheduleDraw);
    map.on("pitch", scheduleDraw);
    map.on("resize", scheduleDraw);
    map.on("moveend", scheduleFetch);
    map.on("zoomend", scheduleFetch);
    map.on("mousemove", handlePointerMove);
    map.on("click", handleClick);
    map.getCanvas().addEventListener("pointerdown", handlePointerDown, { capture: true });
    map.getCanvas().addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("meewav:onboarding-avatar-visibility", handleOnboardingAvatarVisibility);
    scheduleDraw();

    return () => {
      cancelled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (fetchTimer !== null) window.clearTimeout(fetchTimer);
      fetchController?.abort();
      context.clearRect(0, 0, canvas.width, canvas.height);
      restoreMapLibreAvatarSymbols();
      setCanvasAvatarCursorLock(map, false);
      map.getCanvas().style.cursor = "";
      map.off("move", scheduleDraw);
      map.off("zoom", scheduleDraw);
      map.off("rotate", scheduleDraw);
      map.off("pitch", scheduleDraw);
      map.off("resize", scheduleDraw);
      map.off("moveend", scheduleFetch);
      map.off("zoomend", scheduleFetch);
      map.off("mousemove", handlePointerMove);
      map.off("click", handleClick);
      map.getCanvas().removeEventListener("pointerdown", handlePointerDown, { capture: true });
      map.getCanvas().removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("meewav:onboarding-avatar-visibility", handleOnboardingAvatarVisibility);
      window.dispatchEvent(new CustomEvent("meewav:avatar-pipeline-changed", {
        detail: {
          source: "canvas-avatar-overlay-cleanup",
          reason: enabled ? "unmount" : "disabled",
        },
      }));
    };
  }, [enabled, map, maxAvatars, onAvatarSelectionChange]);

  if (!enabled) return null;

  return <canvas ref={canvasRef} className="avatar-canvas-overlay" aria-hidden="true" />;
}


