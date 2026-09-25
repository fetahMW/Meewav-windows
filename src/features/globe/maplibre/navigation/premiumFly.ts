import type { Map as MapLibreMap } from "maplibre-gl";
import { getMaxPitchForZoom, MAPLIBRE_ABSOLUTE_MAX_PITCH, MAPLIBRE_STANDARD_MAX_PITCH } from "../../../../map/renderModeManager";
import { CITY_CAMERA_PRESETS } from "../../mapMechanics/flyMechanicsReference";
import type { CitySubdivisionId } from "../../selectedExtrusion/citySubdivisionConfig";
import {
  beginMeewavCameraTransition,
  endMeewavCameraTransition,
} from "../../perf/cameraTransitionGate";
import { perfWarn } from "../../perf/perfFlags";

export type PremiumFlyPresetName = CitySubdivisionId;

export type PremiumFlyVisualMode = "country" | "city-approach" | "city-descent" | "landing" | "landed";

export type PremiumFlyTarget = {
  name?: PremiumFlyPresetName | string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
  speed?: number;
  curve?: number;
};

export type PremiumFlyOptions = {
  speed?: number;
};

export type PremiumFlyDebugState = {
  flyActive: boolean;
  activePreset: string | null;
  speed: number | null;
  zoom: number | null;
  pitch: number | null;
  bearing: number | null;
  center: [number, number] | null;
  visualMode: PremiumFlyVisualMode;
  customControllersDisabled: boolean;
  tourRunning: boolean;
  blackoutDetected: boolean;
};

type PremiumFlyRuntime = {
  disableCustomCameraControllers?: () => void;
  enableCustomCameraControllers?: () => void;
  onBeforeFly?: (target: PremiumFlyTarget) => void;
  applyPostLandingMode?: (target: PremiumFlyTarget) => void;
  onStateChange?: (state: PremiumFlyDebugState) => void;
};

type ActiveTourState = {
  running: boolean;
  timeoutId: number | null;
  moveEndHandler: (() => void) | null;
  map: MapLibreMap | null;
};

export const PREMIUM_FLY_PRESETS: Record<PremiumFlyPresetName, PremiumFlyTarget> = CITY_CAMERA_PRESETS;

export const INITIAL_PREMIUM_FLY_DEBUG_STATE: PremiumFlyDebugState = {
  flyActive: false,
  activePreset: null,
  speed: null,
  zoom: null,
  pitch: null,
  bearing: null,
  center: null,
  visualMode: "landed",
  customControllersDisabled: false,
  tourRunning: false,
  blackoutDetected: false,
};

const PREMIUM_CITY_TOUR_PRESETS: PremiumFlyPresetName[] = [
  "paris",
  "nice",
  "marseille",
  "lyon",
  "nantes",
  "lille",
];
const FLY_DIAGNOSTIC_INTERVAL_MS = 250;

let activeMap: MapLibreMap | null = null;
let runtime: PremiumFlyRuntime = {};
let activeFlyId = 0;
let activeMoveHandler: (() => void) | null = null;
let activeMoveEndHandler: (() => void) | null = null;
let activeTarget: PremiumFlyTarget | null = null;
let activeSpeed: number | null = null;
let customControllersDisabled = false;
let blackoutDetected = false;
let blackoutLoggedForFly = false;
let lastFlyDiagnosticsAt = 0;
let lastDebugState: PremiumFlyDebugState = INITIAL_PREMIUM_FLY_DEBUG_STATE;

let activeTour: ActiveTourState = {
  running: false,
  timeoutId: null,
  moveEndHandler: null,
  map: null,
};

function getVisualMode(zoom: number | null, flyActive: boolean): PremiumFlyVisualMode {
  if (zoom === null || !Number.isFinite(zoom)) return flyActive ? "country" : "landed";
  if (zoom < 8) return "country";
  if (zoom < 13.2) return "city-approach";
  if (zoom < 14.7) return "city-descent";
  return flyActive ? "landing" : "landed";
}

function isLayerVisible(map: MapLibreMap, layerId: string) {
  return Boolean(map.getLayer(layerId)) && map.getLayoutProperty(layerId, "visibility") !== "none";
}

function hasActiveBlackOverlay() {
  return false;
}

function detectBlackout(map: MapLibreMap) {
  const canvas = map.getCanvas();
  const canvasOpacity = Number(window.getComputedStyle(canvas).opacity || "1");
  const baseMapVisible = isLayerVisible(map, "background");
  const waterVisible = isLayerVisible(map, "water");
  const landVisible = baseMapVisible || isLayerVisible(map, "landcover_green_areas") || isLayerVisible(map, "landuse_park");
  const overlayBlackActive = hasActiveBlackOverlay();

  return {
    blackout: canvasOpacity <= 0.01 || overlayBlackActive || (!baseMapVisible && !waterVisible && !landVisible),
    baseMapVisible,
    waterVisible,
    landVisible,
    canvasOpacity,
    overlayBlackActive,
  };
}

function readDebugState(map: MapLibreMap | null, flyActive: boolean): PremiumFlyDebugState {
  const center = map?.getCenter();
  const zoom = map ? map.getZoom() : null;
  return {
    flyActive,
    activePreset: activeTarget?.name ?? null,
    speed: activeSpeed,
    zoom,
    pitch: map ? map.getPitch() : null,
    bearing: map ? map.getBearing() : null,
    center: center ? [Number(center.lng.toFixed(5)), Number(center.lat.toFixed(5))] : null,
    visualMode: getVisualMode(zoom, flyActive),
    customControllersDisabled,
    tourRunning: activeTour.running,
    blackoutDetected,
  };
}

function publishDebugState(flyActive: boolean) {
  lastDebugState = readDebugState(activeMap, flyActive);
  runtime.onStateChange?.(lastDebugState);
}

function updateFlyReadState(force = false) {
  if (!activeMap) return;
  const now = performance.now();
  if (!force && now - lastFlyDiagnosticsAt < FLY_DIAGNOSTIC_INTERVAL_MS) return;
  lastFlyDiagnosticsAt = now;

  const blackout = detectBlackout(activeMap);
  blackoutDetected = blackoutDetected || blackout.blackout;

  if (blackout.blackout && !blackoutLoggedForFly) {
    blackoutLoggedForFly = true;
    console.error("[PremiumFly] BLACKOUT DETECTED", {
      preset: activeTarget?.name ?? null,
      speed: activeSpeed,
      zoom: activeMap.getZoom(),
      pitch: activeMap.getPitch(),
      bearing: activeMap.getBearing(),
      center: [activeMap.getCenter().lng, activeMap.getCenter().lat],
      ...blackout,
    });
  }

  publishDebugState(true);
}

function shouldTrackFlyDiagnosticsDuringMove() {
  return Boolean(
    runtime.onStateChange
    || (typeof window !== "undefined" && (window as any).__MEEWAV_CAMERA_DEBUG__ === true),
  );
}

function disableCustomCameraControllers() {
  customControllersDisabled = true;
  runtime.disableCustomCameraControllers?.();
  publishDebugState(true);
}

function enableCustomCameraControllers() {
  customControllersDisabled = false;
  runtime.enableCustomCameraControllers?.();
  publishDebugState(false);
}

function cleanupActiveFly() {
  if (activeMap && activeMoveHandler) {
    activeMap.off("move", activeMoveHandler);
  }
  if (activeMap && activeMoveEndHandler) {
    activeMap.off("moveend", activeMoveEndHandler);
  }

  activeMoveHandler = null;
  activeMoveEndHandler = null;
}

function stopMapAnimationSafely(map: MapLibreMap) {
  try {
    if (map.isMoving()) {
      map.stop();
    }
  } catch (error) {
    perfWarn("[PremiumFly] Map stop ignored during transition handoff.", error);
  }
}

function clampToMapLibreStandardPitch(pitch: number) {
  if (!Number.isFinite(pitch)) return 0;
  return Math.max(0, Math.min(MAPLIBRE_ABSOLUTE_MAX_PITCH, pitch));
}

function clampToMapLibreStandardMaxPitch(pitch: number) {
  if (!Number.isFinite(pitch)) return MAPLIBRE_STANDARD_MAX_PITCH;
  return Math.max(0, Math.min(MAPLIBRE_ABSOLUTE_MAX_PITCH, pitch));
}

function getTargetClampedToMapLimits(target: PremiumFlyTarget): PremiumFlyTarget {
  return {
    ...target,
    pitch: clampToMapLibreStandardPitch(target.pitch),
  };
}

function startFlyToSafely(map: MapLibreMap, target: PremiumFlyTarget, speed: number, flyId: number, retry = true) {
  window.requestAnimationFrame(() => {
    if (flyId !== activeFlyId || activeMap !== map) return;

    try {
      map.flyTo({
        center: target.center,
        zoom: target.zoom,
        pitch: clampToMapLibreStandardPitch(target.pitch),
        bearing: target.bearing,
        speed,
        ...(target.curve === undefined ? {} : { curve: target.curve }),
        essential: true,
      });
    } catch (error) {
      if (retry) {
        window.setTimeout(() => startFlyToSafely(map, target, speed, flyId, false), 80);
        return;
      }

      perfWarn("[PremiumFly] Fly start ignored after retry.", error);
      endMeewavCameraTransition("premiumFly:start-failed");
      enableCustomCameraControllers();
      publishDebugState(false);
    }
  });
}

function prepareFlyPitchLimit(map: MapLibreMap, target: PremiumFlyTarget) {
  const requiredMaxPitch = Math.max(target.pitch, getMaxPitchForZoom(target.zoom));
  const safeRequiredMaxPitch = clampToMapLibreStandardMaxPitch(requiredMaxPitch);

  try {
    if (Math.abs(map.getMaxPitch() - safeRequiredMaxPitch) >= 0.1) {
      map.setMaxPitch(safeRequiredMaxPitch);
    }
  } catch (error) {
    perfWarn("[PremiumFly] Pitch limit preparation ignored.", error);
  }
}

function runPremiumFly(target: PremiumFlyTarget, options: PremiumFlyOptions = {}, partOfTour = false) {
  const map = activeMap;
  if (!map) return false;

  if (!partOfTour) {
    stopPremiumCityTour();
  }

  activeFlyId += 1;
  const flyId = activeFlyId;
  cleanupActiveFly();

  const safeTarget = getTargetClampedToMapLimits(target);
  activeTarget = safeTarget;
  activeSpeed = options.speed ?? safeTarget.speed ?? 1.2;
  blackoutDetected = false;
  blackoutLoggedForFly = false;
  lastFlyDiagnosticsAt = 0;

  if (typeof window !== "undefined") {
    const targetDetail = {
      name: safeTarget.name ?? null,
      center: safeTarget.center,
    };
    (window as any).__MEEWAV_PREMIUM_FLY_TARGET__ = targetDetail;
    window.dispatchEvent(new CustomEvent("meewav:premium-fly-target-change", { detail: targetDetail }));
  }

  runtime.onBeforeFly?.(safeTarget);
  prepareFlyPitchLimit(map, safeTarget);
  stopMapAnimationSafely(map);
  beginMeewavCameraTransition(`premiumFly:${safeTarget.name ?? "target"}`);
  disableCustomCameraControllers();

  activeMoveHandler = shouldTrackFlyDiagnosticsDuringMove()
    ? () => updateFlyReadState()
    : null;
  activeMoveEndHandler = () => {
    if (flyId !== activeFlyId) return;

    cleanupActiveFly();
    updateFlyReadState(true);
    enableCustomCameraControllers();
    runtime.applyPostLandingMode?.(safeTarget);
    if ((window as any).__MEEWAV_CAMERA_DEBUG__ === true) {
      console.log("[Fly end camera]", {
        pitch: map.getPitch(),
        bearing: map.getBearing(),
        zoom: map.getZoom(),
        center: map.getCenter(),
      });
    }
    endMeewavCameraTransition(`premiumFly:${safeTarget.name ?? "target"}:moveend`);
    publishDebugState(false);
  };

  if (activeMoveHandler) {
    map.on("move", activeMoveHandler);
  }
  map.once("moveend", activeMoveEndHandler);
  publishDebugState(true);

  startFlyToSafely(map, safeTarget, activeSpeed, flyId);

  return true;
}

export function configurePremiumFly(map: MapLibreMap, callbacks: PremiumFlyRuntime = {}) {
  activeMap = map;
  runtime = callbacks;
  publishDebugState(false);

  return () => {
    stopPremiumCityTour();
    cleanupActiveFly();
    if (activeMap === map) {
      activeMap = null;
    }
    runtime = {};
  };
}

export function premiumFlyToTarget(target: PremiumFlyTarget, options: PremiumFlyOptions = {}) {
  return runPremiumFly(target, options, false);
}

export function premiumFlyToPreset(cityName: string, options: PremiumFlyOptions = {}) {
  const presetName = cityName.toLowerCase() as PremiumFlyPresetName;
  const preset = PREMIUM_FLY_PRESETS[presetName];
  if (!preset) {
    perfWarn("[PremiumFly] Unknown preset", cityName, Object.keys(PREMIUM_FLY_PRESETS));
    return false;
  }

  return premiumFlyToTarget(preset, options);
}

export function stopPremiumCityTour() {
  const map = activeTour.map ?? activeMap;

  activeTour.running = false;
  if (activeTour.timeoutId !== null) {
    window.clearTimeout(activeTour.timeoutId);
  }
  if (map && activeTour.moveEndHandler) {
    map.off("moveend", activeTour.moveEndHandler);
  }

  activeTour = {
    running: false,
    timeoutId: null,
    moveEndHandler: null,
    map: null,
  };

  if (map) {
    stopMapAnimationSafely(map);
  }

  cleanupActiveFly();
  endMeewavCameraTransition("premiumFly:stop-tour");
  enableCustomCameraControllers();
  publishDebugState(false);
}

export function startPremiumCityTour() {
  const map = activeMap;
  if (!map) return false;

  stopPremiumCityTour();

  let presetIndex = 0;
  activeTour = {
    running: true,
    timeoutId: null,
    moveEndHandler: null,
    map,
  };
  publishDebugState(false);

  const runNext = () => {
    if (!activeTour.running) return;

    const presetName = PREMIUM_CITY_TOUR_PRESETS[presetIndex % PREMIUM_CITY_TOUR_PRESETS.length];
    presetIndex += 1;
    const preset = PREMIUM_FLY_PRESETS[presetName];

    const started = runPremiumFly(preset, {}, true);
    if (!started) {
      stopPremiumCityTour();
      return;
    }

    activeTour.moveEndHandler = () => {
      if (!activeTour.running) return;
      activeTour.moveEndHandler = null;
      activeTour.timeoutId = window.setTimeout(runNext, 1800);
    };

    map.once("moveend", activeTour.moveEndHandler);
  };

  runNext();
  return true;
}

export function getPremiumFlyDebugState() {
  return lastDebugState;
}
