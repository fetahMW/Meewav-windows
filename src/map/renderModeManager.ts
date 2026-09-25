import type { Map } from "maplibre-gl";

const HILLSHADE_SOURCE_ID = "terrain-dem-source";
const HILLSHADE_LAYER_ID = "meewav-hillshade";

const TERRAIN_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

const ZOOM = {
  MACRO_MAX: 8.5,
  REGION_MAX: 12.5,
  CITY_MIN: 13.2,
};

export const MAPLIBRE_STANDARD_MAX_PITCH = 60;
export const MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH = 69.2;
export const MAPLIBRE_NEAR_GROUND_MAX_PITCH = 75;
export const MAPLIBRE_ABSOLUTE_MAX_PITCH = MAPLIBRE_NEAR_GROUND_MAX_PITCH;

const MAPLIBRE_DEFAULT_FOV_RAD = 0.6435011087932844;
const EQUATOR_METERS_PER_PIXEL_ZOOM_0 = 156543.03392804097;
const NEAR_GROUND_HIGH_PITCH_ZOOM = 16.15;
const HIGH_ALTITUDE_PITCH_UNLOCK_ZOOM = 15.35;
const NEAR_GROUND_HIGH_PITCH_ALTITUDE_METERS = 1200;
const HIGH_ALTITUDE_PITCH_UNLOCK_METERS = 3200;

interface Area {
  id: string;
  label: string;
  bbox: [number, number, number, number];
}

interface RenderMode {
  id: string;
  label: string;
  hillshade: boolean;
  hillshadePower?: number;
  maxPitch: number;
  reason: string;
}

declare global {
  interface Window {
    __MEEWAV_RENDER_MODE__?: RenderMode;
  }
}

const RELIEF_ALLOWED_AREAS: Area[] = [
  {
    id: "nice",
    label: "Nice / Côte d’Azur",
    bbox: [7.12, 43.60, 7.38, 43.82]
  },
  {
    id: "alpes_sud",
    label: "Alpes du Sud",
    bbox: [5.2, 43.7, 7.9, 46.4]
  },
  {
    id: "jura",
    label: "Jura",
    bbox: [5.2, 46.0, 7.2, 47.5]
  }
];

const FLAT_PRIORITY_AREAS: Area[] = [
  {
    id: "paris",
    label: "Paris",
    bbox: [2.20, 48.78, 2.48, 48.93]
  }
];

function inBbox(lngLat: { lng: number; lat: number }, bbox: [number, number, number, number]): boolean {
  const lng = lngLat.lng;
  const lat = lngLat.lat;
  return lng >= bbox[0] && lat >= bbox[1] && lng <= bbox[2] && lat <= bbox[3];
}

function getArea(lngLat: { lng: number; lat: number }, areas: Area[]): Area | null {
  return areas.find((area) => inBbox(lngLat, area.bbox)) || null;
}

function safeSetLayoutVisibility(map: Map, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return;
  const nextVisibility = visible ? "visible" : "none";
  const currentVisibility = map.getLayoutProperty(layerId, "visibility") ?? "visible";
  if (currentVisibility === nextVisibility) return;
  map.setLayoutProperty(layerId, "visibility", nextVisibility);
}

function mapStyleValueEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function safeSetPaint(map: Map, layerId: string, prop: string, value: any) {
  if (!map.getLayer(layerId)) return;
  if (mapStyleValueEquals(map.getPaintProperty(layerId, prop), value)) return;
  map.setPaintProperty(layerId, prop, value);
}

function findFirstSymbolLayerId(map: Map): string | undefined {
  const layers = map.getStyle().layers || [];
  const symbol = layers.find((layer) => layer.type === "symbol");
  return symbol ? symbol.id : undefined;
}

export function ensureHillshadeSource(map: Map) {
  if (!map.getSource(HILLSHADE_SOURCE_ID)) {
    map.addSource(HILLSHADE_SOURCE_ID, {
      type: "raster-dem",
      tiles: TERRAIN_TILES,
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15
    });
  }
}

export function ensureHillshadeLayer(map: Map) {
  if (map.getLayer(HILLSHADE_LAYER_ID)) return;

  const beforeId = findFirstSymbolLayerId(map);

  map.addLayer(
    {
      id: HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: HILLSHADE_SOURCE_ID,
      minzoom: 5,
      maxzoom: 16,
      layout: {
        visibility: "none"
      },
      paint: {
        "hillshade-exaggeration": 0.12,
        "hillshade-shadow-color": "#13081f",
        "hillshade-highlight-color": "#30204a",
        "hillshade-accent-color": "#7c55c7",
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-anchor": "viewport"
      }
    },
    beforeId
  );
}

export function getMaxPitchForZoom(zoom: number): number {
  if (Number.isFinite(zoom)) {
    if (zoom >= NEAR_GROUND_HIGH_PITCH_ZOOM) return MAPLIBRE_NEAR_GROUND_MAX_PITCH;
    if (zoom <= HIGH_ALTITUDE_PITCH_UNLOCK_ZOOM) return MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH;
  }

  return MAPLIBRE_STANDARD_MAX_PITCH;
}

export function getEstimatedCameraAltitudeMetersForPitch(map: Pick<Map, "getCenter" | "getPitch" | "getZoom" | "getCanvas">): number {
  const center = map.getCenter();
  const latitudeRad = center.lat * Math.PI / 180;
  const pitchRad = map.getPitch() * Math.PI / 180;
  const zoomScale = 2 ** map.getZoom();
  const metersPerPixel = (EQUATOR_METERS_PER_PIXEL_ZOOM_0 * Math.cos(latitudeRad)) / zoomScale;
  const canvasHeight = Math.max(map.getCanvas().clientHeight, 1);
  const cameraToCenterPixels = (canvasHeight / 2) / Math.tan(MAPLIBRE_DEFAULT_FOV_RAD / 2);

  return Math.max(0, Math.cos(pitchRad) * cameraToCenterPixels * metersPerPixel);
}

export function getMaxPitchForCameraAltitude(altitudeMeters: number): number {
  if (!Number.isFinite(altitudeMeters)) return MAPLIBRE_STANDARD_MAX_PITCH;
  if (altitudeMeters <= NEAR_GROUND_HIGH_PITCH_ALTITUDE_METERS) return MAPLIBRE_NEAR_GROUND_MAX_PITCH;
  if (altitudeMeters >= HIGH_ALTITUDE_PITCH_UNLOCK_METERS) return MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH;
  return MAPLIBRE_STANDARD_MAX_PITCH;
}

export function hasHighAltitudePitchLimit(zoom: number, altitudeMeters: number): boolean {
  return getMaxPitchForZoom(zoom) === MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH
    || getMaxPitchForCameraAltitude(altitudeMeters) === MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH;
}

function clampToMapLibreAbsolutePitch(pitch: number): number {
  if (!Number.isFinite(pitch)) return MAPLIBRE_STANDARD_MAX_PITCH;
  return Math.max(0, Math.min(MAPLIBRE_ABSOLUTE_MAX_PITCH, pitch));
}

function computeRenderMode(map: Map): RenderMode {
  const zoom = map.getZoom();
  const center = map.getCenter();

  const flatArea = getArea(center, FLAT_PRIORITY_AREAS);
  const reliefArea = getArea(center, RELIEF_ALLOWED_AREAS);

  const altitudeMeters = getEstimatedCameraAltitudeMetersForPitch(map);
  const maxPitch = hasHighAltitudePitchLimit(zoom, altitudeMeters)
    ? MAPLIBRE_HIGH_ALTITUDE_MAX_PITCH
    : Math.max(
        getMaxPitchForZoom(zoom),
        getMaxPitchForCameraAltitude(altitudeMeters),
      );

  if (zoom <= ZOOM.MACRO_MAX) {
    return {
      id: "macro",
      label: "France / macro",
      hillshade: false,
      hillshadePower: 0,
      maxPitch,
      reason: "Vue macro : pas de relief, carte épurée."
    };
  }

  if (zoom <= ZOOM.REGION_MAX) {
    return {
      id: "region",
      label: "Région",
      hillshade: true,
      hillshadePower: 0.08,
      maxPitch,
      reason: "Vue région : hillshade léger pour suggérer les reliefs."
    };
  }

  if (flatArea) {
    return {
      id: "flat-city",
      label: flatArea.label,
      hillshade: false,
      hillshadePower: 0,
      maxPitch,
      reason: "Ville plate : relief désactivé."
    };
  }

  if (reliefArea && zoom >= ZOOM.CITY_MIN) {
    return {
      id: "landscape-city",
      label: reliefArea.label,
      hillshade: true,
      hillshadePower: 0.18, // Légèrement accentué pour une belle présence visuelle 2.5D
      maxPitch,
      reason: "Zone paysage : hillshade 2.5D premium actif."
    };
  }

  return {
    id: "default-city",
    label: "Ville standard",
    hillshade: true,
    hillshadePower: 0.06,
    maxPitch,
    reason: "Ville standard : relief discret."
  };
}

function applyHillshadeMode(map: Map, mode: RenderMode) {
  safeSetLayoutVisibility(map, HILLSHADE_LAYER_ID, mode.hillshade);
  safeSetPaint(map, HILLSHADE_LAYER_ID, "hillshade-exaggeration", mode.hillshadePower || 0);
}

function applyCameraLimits(map: Map, mode: RenderMode) {
  if ((window as any).__MEEWAV_DRONE_ACTIVE__) return;
  if ((window as any).__MEEWAV_SELECTED_EXTRUSION_POC_ACTIVE__) return;
  const maxPitch = clampToMapLibreAbsolutePitch(mode.maxPitch);

  if (Math.abs(map.getMaxPitch() - maxPitch) >= 0.15) {
    map.setMaxPitch(maxPitch);
  }
}

let lastModeId: string | null = null;

export function updateMeewavRenderMode(map: Map) {
  if (!map.isStyleLoaded()) return;

  const mode = computeRenderMode(map);

  applyHillshadeMode(map, mode);
  applyCameraLimits(map, mode);

  if (mode.id !== lastModeId) {
    lastModeId = mode.id;
    if ((window as any).__MEEWAV_RENDER_MODE_DEBUG__ === true) {
      console.log("[Meewav render mode]", mode);
    }
  }

  window.__MEEWAV_RENDER_MODE__ = mode;
}

export function installMeewavRenderModeManager(map: Map) {
  const initialize = () => {
    // S'assurer que le terrain physique 3D est définitivement désactivé
    try {
      map.setTerrain(null);
    } catch {
      // Ignorer si déjà nul
    }
    ensureHillshadeSource(map);
    ensureHillshadeLayer(map);
    updateMeewavRenderMode(map);
  };

  map.on("load", initialize);

  map.on("styledata", () => {
    if (!map.isStyleLoaded()) return;
    try {
      map.setTerrain(null);
    } catch {
      // Ignorer if already null
    }
    ensureHillshadeSource(map);
    ensureHillshadeLayer(map);
    updateMeewavRenderMode(map);
  });

  map.on("moveend", () => updateMeewavRenderMode(map));
  map.on("zoomend", () => updateMeewavRenderMode(map));
  map.on("rotateend", () => updateMeewavRenderMode(map));
}
