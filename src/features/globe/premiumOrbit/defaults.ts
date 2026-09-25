import type { OrbitCalibration, ResolvedOrbitQuality } from "./types";

export const DEFAULT_ORBIT_CALIBRATION: OrbitCalibration = {
  centerOffsetX: 0,
  centerOffsetY: -4,
  globeRadiusViewportWidth: 0.325,
  globeRadiusViewportHeight: 0.455,
  orbitRxMultiplier: 1.58,
  orbitRyMultiplier: 0.39,
  orbitRotationDeg: -4.5,
  frontArcStartDeg: 7,
  frontArcEndDeg: 173,
  bearingInfluence: -0.13,
  phaseDeg: 0,
  pitchCenterShiftPx: 32,
  referenceZoom: 2.15,
  zoomScalePerLevel: 0.065,
  minZoomScale: 0.72,
  maxZoomScale: 1.18,
  minVisibleZoom: 0,
  maxVisibleZoom: 6.7,
  profileBaseSizePx: 78,
  profileBackScale: 0.82,
  profileFrontScale: 1.08,
  profileBackOpacity: 0.9,
  profileFrontOpacity: 1,
  sceneScale: 1,
};

export const QUALITY_SETTINGS: Record<
  ResolvedOrbitQuality,
  {
    showPulseNodes: boolean;
    showSecondaryRing: boolean;
    profileShadowStrength: number;
    ringOpacity: number;
  }
> = {
  high: {
    showPulseNodes: true,
    showSecondaryRing: true,
    profileShadowStrength: 1,
    ringOpacity: 1,
  },
  standard: {
    showPulseNodes: false,
    showSecondaryRing: true,
    profileShadowStrength: 0.72,
    ringOpacity: 0.88,
  },
  economy: {
    showPulseNodes: false,
    showSecondaryRing: false,
    profileShadowStrength: 0.45,
    ringOpacity: 0.72,
  },
};

export const ORBIT_NODE_ANGLES_DEG = [12, 39, 70, 106, 139, 166] as const;
