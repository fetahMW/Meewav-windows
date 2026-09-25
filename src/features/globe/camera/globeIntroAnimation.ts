import type { Map as MapLibreMap } from "maplibre-gl";
import {
  GLOBE_INTRO_START_CAMERA,
  PARIS_FINAL_CAMERA,
} from "./globeCameraConfig";

const INTRO_CAMERA_DURATION_MS = 3000;
const PARIS_REVEAL_START_MS = 1350;

type GlobeIntroOptions = {
  force?: boolean;
  onStart?: () => void;
  onParisRevealStart?: () => void;
  onComplete?: () => void;
};

export function easeInOutCubic(t: number) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setIntroInteractions(map: MapLibreMap, enabled: boolean) {
  if (enabled) {
    map.dragPan.enable();
    map.dragRotate.enable();
    map.keyboard.enable();
    map.doubleClickZoom.enable();
    map.touchZoomRotate.enable();
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    map.boxZoom.enable();
  } else {
    map.dragPan.disable();
    map.dragRotate.disable();
    map.keyboard.disable();
    map.doubleClickZoom.disable();
    map.touchZoomRotate.disable();
    map.touchPitch.disable();
    map.boxZoom.disable();
  }

  if (enabled) {
    map.scrollZoom.enable();
  } else {
    map.scrollZoom.disable();
  }
}

function markIntroComplete(map: MapLibreMap, options?: GlobeIntroOptions) {
  setIntroInteractions(map, true);
  options?.onComplete?.();
}

export function runTwoStepGlobeIntroToParis(
  map: MapLibreMap,
  options?: GlobeIntroOptions,
) {
  let cancelled = false;
  let revealTimer: number | null = null;

  const clearRevealTimer = () => {
    if (revealTimer === null) return;
    window.clearTimeout(revealTimer);
    revealTimer = null;
  };

  const complete = () => {
    if (cancelled) return;
    clearRevealTimer();
    markIntroComplete(map, options);
  };

  const runParisReveal = () => {
    if (cancelled) return;

    revealTimer = window.setTimeout(() => {
      if (!cancelled) options?.onParisRevealStart?.();
    }, PARIS_REVEAL_START_MS);

    map.easeTo({
      center: PARIS_FINAL_CAMERA.center,
      zoom: PARIS_FINAL_CAMERA.zoom,
      pitch: PARIS_FINAL_CAMERA.pitch,
      bearing: PARIS_FINAL_CAMERA.bearing,
      duration: INTRO_CAMERA_DURATION_MS,
      easing: easeInOutCubic,
      essential: true,
    });
    map.once("moveend", complete);
  };

  options?.onStart?.();
  setIntroInteractions(map, false);
  map.stop();
  map.jumpTo(GLOBE_INTRO_START_CAMERA);

  runParisReveal();

  return () => {
    cancelled = true;
    clearRevealTimer();
    map.off("moveend", complete);
  };
}
