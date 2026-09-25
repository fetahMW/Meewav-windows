import type { Map as MapLibreMap } from "maplibre-gl";

export type OrbitQualityMode = "auto" | "high" | "standard" | "economy";
export type ResolvedOrbitQuality = Exclude<OrbitQualityMode, "auto">;

export interface OrbitProfile {
  id: string;
  name: string;
  subtitle: string;
  imageUrl: string;
  /** Optional small badge displayed on the medallion. */
  badgeImageUrl?: string;
  badgeText?: string;
  gradeLevel?: 6;
  /** Position on the orbital ellipse, in degrees. */
  angleDeg: number;
  /** Moves the profile away from or toward the ellipse, in CSS pixels. */
  radialOffsetPx?: number;
  /** Fine pixel calibration. */
  offsetX?: number;
  offsetY?: number;
  /** Per-profile size multiplier. */
  scale?: number;
  /** Optional CSS color used for the halo. */
  accent?: string;
  /** Disables clicks without hiding the profile. */
  disabled?: boolean;
  /** Optional payload consumed by the host app. */
  payload?: unknown;
}

export interface OrbitCalibration {
  /** Additional offset applied to the projected map centre. */
  centerOffsetX: number;
  centerOffsetY: number;

  /** Globe radius is the minimum of these width/height ratios. */
  globeRadiusViewportWidth: number;
  globeRadiusViewportHeight: number;

  /** Orbital ellipse relative to the inferred globe radius. */
  orbitRxMultiplier: number;
  orbitRyMultiplier: number;
  orbitRotationDeg: number;

  /** Front arc visible over the globe. Angles use SVG coordinates. */
  frontArcStartDeg: number;
  frontArcEndDeg: number;

  /** How much the orbit follows MapLibre's bearing. */
  bearingInfluence: number;
  phaseDeg: number;

  /** Pitch can move the apparent centre slightly downward. */
  pitchCenterShiftPx: number;

  /** Radius adjustment as the country globe zoom changes. */
  referenceZoom: number;
  zoomScalePerLevel: number;
  minZoomScale: number;
  maxZoomScale: number;

  /** Visibility guard. The overlay is hidden outside this range. */
  minVisibleZoom: number;
  maxVisibleZoom: number;

  /** Portrait sizing and depth simulation. */
  profileBaseSizePx: number;
  profileBackScale: number;
  profileFrontScale: number;
  profileBackOpacity: number;
  profileFrontOpacity: number;

  /** Slightly enlarges the visual scene without touching the map. */
  sceneScale: number;
}

export interface PremiumGlobeOrbitProps {
  map: MapLibreMap | null;
  profiles: readonly OrbitProfile[];
  visible: boolean;
  quality?: OrbitQualityMode;
  calibration?: Partial<OrbitCalibration>;
  className?: string;
  /** Off by default: zero continuous frames while idle. */
  ambientMotion?: boolean;
  ambientDegreesPerSecond?: number;
  /** Called when a profile card is clicked. */
  onProfileClick?: (profile: OrbitProfile) => void;
  onProfileEnter?: (profile: OrbitProfile) => void;
  onProfileLeave?: (profile: OrbitProfile) => void;
  /** Used to describe the overlay to assistive technologies. */
  ariaLabel?: string;
}

export interface OrbitLayoutSnapshot {
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  globeRadius: number;
  orbitRx: number;
  orbitRy: number;
  orbitRotationDeg: number;
}
