import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { DEFAULT_ORBIT_CALIBRATION, QUALITY_SETTINGS } from "./defaults";
import { useAdaptiveOrbitQuality } from "./useAdaptiveOrbitQuality";
import { useMapOrbitSync, type OrbitSvgRefs } from "./useMapOrbitSync";
import type {
  OrbitCalibration,
  OrbitProfile,
  PremiumGlobeOrbitProps,
} from "./types";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { loadPremiumLandRings, type LandRing } from "./landMask";
import "./PremiumGlobeOrbit.css";

const PREMIUM_GLOBE_COUNTRY_LABELS = [
  { id: "canada", name: "Canada", coordinates: [-105, 57] as const },
  { id: "usa", name: "États-Unis", coordinates: [-98, 39.4] as const },
  { id: "uk", name: "Royaume-Uni", coordinates: [-2.5, 54.6] as const },
  { id: "norway", name: "Norvège", coordinates: [8.4, 61.3] as const },
  { id: "belgium", name: "Belgique", coordinates: [4.7, 50.6] as const },
  { id: "france", name: "France", coordinates: [2.2, 46.2] as const },
  { id: "spain", name: "Espagne", coordinates: [-3.7, 40.4] as const },
  { id: "italy", name: "Italie", coordinates: [12.5, 42.8] as const },
  { id: "poland", name: "Pologne", coordinates: [19.1, 52] as const },
  { id: "austria", name: "Autriche", coordinates: [14.5, 47.6] as const },
  { id: "croatia", name: "Croatie", coordinates: [16.4, 45.2] as const },
  { id: "ukraine", name: "Ukraine", coordinates: [31.2, 49] as const },
  { id: "turkey", name: "Turquie", coordinates: [35.2, 39] as const },
  { id: "morocco", name: "Maroc", coordinates: [-6.4, 31.8] as const },
  { id: "tunisia", name: "Tunisie", coordinates: [9.5, 34] as const },
  { id: "algeria", name: "Algérie", coordinates: [2.6, 28] as const },
  { id: "russia", name: "Russie", coordinates: [90, 61] as const },
  { id: "india", name: "Inde", coordinates: [78.9, 22.8] as const },
] as const;

function mergeCalibration(
  override: Partial<OrbitCalibration> | undefined,
): OrbitCalibration {
  return {
    ...DEFAULT_ORBIT_CALIBRATION,
    ...override,
  };
}

function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

const OrbitProfileCard = memo(function OrbitProfileCard({
  profile,
  register,
  onClick,
  onEnter,
  onLeave,
}: {
  profile: OrbitProfile;
  register: (id: string, element: HTMLButtonElement | null) => void;
  onClick?: (profile: OrbitProfile) => void;
  onEnter?: (profile: OrbitProfile) => void;
  onLeave?: (profile: OrbitProfile) => void;
}) {
  const activate = () => {
    if (!profile.disabled) onClick?.(profile);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate();
    }
  };

  const style = {
    "--mw-profile-accent": profile.accent ?? "#8b5cf6",
  } as CSSProperties;

  return (
    <button
      ref={(element) => register(profile.id, element)}
      type="button"
      className="mw-premium-orbit__profile"
      data-orbit-profile-id={profile.id}
      data-disabled={profile.disabled ? "true" : "false"}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        activate();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onMouseEnter={() => onEnter?.(profile)}
      onMouseLeave={() => onLeave?.(profile)}
      onFocus={() => onEnter?.(profile)}
      onBlur={() => onLeave?.(profile)}
      onKeyDown={onKeyDown}
      aria-label={`${profile.name}, ${profile.subtitle}`}
      disabled={profile.disabled}
    >
      <span className="mw-premium-orbit__profile-card">
        <span className="mw-premium-orbit__medallion-shell">
          <span className="mw-premium-orbit__medallion-glow" aria-hidden="true" />
          <span className="mw-premium-orbit__medallion">
            <img
              className="mw-premium-orbit__photo"
              src={profile.imageUrl}
              alt=""
              draggable={false}
              loading="eager"
              decoding="async"
            />
          </span>

          {(profile.gradeLevel || profile.badgeImageUrl || profile.badgeText) && (
            <span className="mw-premium-orbit__badge" aria-hidden="true">
              {profile.gradeLevel ? (
                <MeewavGradeBadge level={profile.gradeLevel} size="xs" />
              ) : profile.badgeImageUrl ? (
                <img src={profile.badgeImageUrl} alt="" draggable={false} />
              ) : (
                <span>{profile.badgeText}</span>
              )}
            </span>
          )}
        </span>

        {!profile.gradeLevel && (
          <span className="mw-premium-orbit__anchor" aria-hidden="true">
            <span className="mw-premium-orbit__anchor-dot" />
          </span>
        )}

        <span className="mw-premium-orbit__label">
          <strong>{profile.name}</strong>
          <small>{profile.subtitle}</small>
        </span>
      </span>
    </button>
  );
});

export const PremiumGlobeOrbit = memo(function PremiumGlobeOrbit({
  map,
  profiles,
  visible,
  quality = "auto",
  calibration: calibrationOverride,
  className,
  ambientMotion = false,
  ambientDegreesPerSecond = 0.7,
  onProfileClick,
  onProfileEnter,
  onProfileLeave,
  ariaLabel = "Profils en orbite autour du globe",
}: PremiumGlobeOrbitProps) {
  const calibration = useMemo(
    () => mergeCalibration(calibrationOverride),
    [calibrationOverride],
  );
  const resolvedQuality = useAdaptiveOrbitQuality(map, quality);
  const qualitySettings = QUALITY_SETTINGS[resolvedQuality];

  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const ringGroupRef = useRef<SVGGElement>(null);
  const backOuterRef = useRef<SVGPathElement>(null);
  const backBlueRef = useRef<SVGPathElement>(null);
  const backPurpleRef = useRef<SVGPathElement>(null);
  const frontOuterRef = useRef<SVGPathElement>(null);
  const frontBlueRef = useRef<SVGPathElement>(null);
  const frontPurpleRef = useRef<SVGPathElement>(null);
  const secondaryFrontRef = useRef<SVGPathElement>(null);
  const tertiaryFrontRef = useRef<SVGPathElement>(null);
  const quaternaryFrontRef = useRef<SVGPathElement>(null);
  const globeMaskHoleRef = useRef<SVGEllipseElement>(null);
  const globeLandClipRef = useRef<SVGEllipseElement>(null);
  const globeLandMaskRef = useRef<SVGPathElement>(null);
  const globeHaloRef = useRef<SVGEllipseElement>(null);
  const globeRimGlowRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceLightRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceLeftLightRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceBlueAmbientRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceChromaRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceCoreShadowRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceShadowRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceBottomVignetteRef = useRef<SVGEllipseElement>(null);
  const globeSurfaceTextureRef = useRef<SVGEllipseElement>(null);
  const nodeElementsRef = useRef<Map<number, SVGCircleElement>>(new Map());
  const profileElementsRef = useRef<Map<string, HTMLElement>>(new Map());
  const countryLabelElementsRef = useRef<Map<string, HTMLElement>>(new Map());

  const generatedId = safeId(useId());
  const maskId = `mw-orbit-mask-${generatedId}`;
  const landClipId = `mw-orbit-land-clip-${generatedId}`;
  const blueGradientId = `mw-orbit-blue-${generatedId}`;
  const purpleGradientId = `mw-orbit-purple-${generatedId}`;
  const haloGradientId = `mw-orbit-halo-${generatedId}`;
  const surfaceLightGradientId = `mw-orbit-surface-light-${generatedId}`;
  const surfaceLeftLightGradientId = `mw-orbit-surface-left-light-${generatedId}`;
  const surfaceBlueAmbientGradientId = `mw-orbit-surface-blue-ambient-${generatedId}`;
  const surfaceCoreShadowGradientId = `mw-orbit-surface-core-shadow-${generatedId}`;
  const surfaceShadowGradientId = `mw-orbit-surface-shadow-${generatedId}`;
  const surfaceBottomVignetteGradientId = `mw-orbit-surface-bottom-${generatedId}`;
  const surfaceTextureId = `mw-orbit-surface-texture-${generatedId}`;
  const rimGradientId = `mw-orbit-rim-${generatedId}`;

  const svgRefs = useMemo<OrbitSvgRefs>(
    () => ({
      svg: svgRef,
      ringGroup: ringGroupRef,
      backOuter: backOuterRef,
      backBlue: backBlueRef,
      backPurple: backPurpleRef,
      frontOuter: frontOuterRef,
      frontBlue: frontBlueRef,
      frontPurple: frontPurpleRef,
      secondaryFront: secondaryFrontRef,
      tertiaryFront: tertiaryFrontRef,
      quaternaryFront: quaternaryFrontRef,
      globeMaskHole: globeMaskHoleRef,
      globeLandClip: globeLandClipRef,
      globeLandMask: globeLandMaskRef,
      globeHalo: globeHaloRef,
      globeRimGlow: globeRimGlowRef,
      globeSurfaceLight: globeSurfaceLightRef,
      globeSurfaceLeftLight: globeSurfaceLeftLightRef,
      globeSurfaceBlueAmbient: globeSurfaceBlueAmbientRef,
      globeSurfaceChroma: globeSurfaceChromaRef,
      globeSurfaceCoreShadow: globeSurfaceCoreShadowRef,
      globeSurfaceShadow: globeSurfaceShadowRef,
      globeSurfaceBottomVignette: globeSurfaceBottomVignetteRef,
      globeSurfaceTexture: globeSurfaceTextureRef,
      nodeElements: nodeElementsRef,
    }),
    [],
  );

  const registerProfile = useCallback(
    (id: string, element: HTMLButtonElement | null) => {
      if (element) profileElementsRef.current.set(id, element);
      else profileElementsRef.current.delete(id);
    },
    [],
  );

  const [landRings, setLandRings] = useState<readonly LandRing[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    loadPremiumLandRings(controller.signal)
      .then(setLandRings)
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          console.warn("[PremiumGlobeOrbit] Land mask unavailable", error);
        }
      });
    return () => controller.abort();
  }, []);

  useMapOrbitSync({
    map,
    visible,
    profiles,
    calibration,
    quality: resolvedQuality,
    ambientMotion,
    ambientDegreesPerSecond,
    rootRef,
    svgRefs,
    profileElements: profileElementsRef,
    countryLabels: PREMIUM_GLOBE_COUNTRY_LABELS,
    countryLabelElements: countryLabelElementsRef,
    landRings,
  });

  return (
    <div
      ref={rootRef}
      className={[
        "mw-premium-orbit",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-active="false"
      data-quality={resolvedQuality}
      style={
        {
          "--mw-ring-opacity": qualitySettings.ringOpacity,
          "--mw-profile-shadow-strength": qualitySettings.profileShadowStrength,
        } as CSSProperties
      }
      role="group"
      aria-label={ariaLabel}
      aria-hidden="true"
    >
      <svg
        ref={svgRef}
        className="mw-premium-orbit__svg"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={blueGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#263FFF" stopOpacity="0.12" />
            <stop offset="28%" stopColor="#397CFF" stopOpacity="0.84" />
            <stop offset="58%" stopColor="#7A5BFF" stopOpacity="0.96" />
            <stop offset="78%" stopColor="#B98CFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5F2CFF" stopOpacity="0.14" />
          </linearGradient>

          <linearGradient id={purpleGradientId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5420FF" stopOpacity="0.18" />
            <stop offset="38%" stopColor="#8A43FF" stopOpacity="0.96" />
            <stop offset="68%" stopColor="#D18CFF" stopOpacity="0.96" />
            <stop offset="100%" stopColor="#6C29FF" stopOpacity="0.2" />
          </linearGradient>

          <radialGradient id={haloGradientId} cx="50%" cy="48%" r="54%">
            <stop offset="84%" stopColor="#8b5cf6" stopOpacity="0" />
            <stop offset="94%" stopColor="#8b5cf6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#c084fc" stopOpacity="0.44" />
          </radialGradient>

          <radialGradient id={surfaceLightGradientId} cx="40%" cy="0%" r="72%">
            <stop offset="0%" stopColor="#7435FF" stopOpacity="0.9" />
            <stop offset="32%" stopColor="#6740FF" stopOpacity="0.96" />
            <stop offset="55%" stopColor="#4828EE" stopOpacity="0.3" />
            <stop offset="70%" stopColor="#32118F" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#240A68" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={surfaceLeftLightGradientId} cx="0%" cy="48%" r="76%">
            <stop offset="0%" stopColor="#542BFF" stopOpacity="0.82" />
            <stop offset="34%" stopColor="#4829F2" stopOpacity="0.58" />
            <stop offset="62%" stopColor="#3A16AD" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#160548" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={surfaceBlueAmbientGradientId} cx="42%" cy="12%" r="62%">
            <stop offset="0%" stopColor="#3A00FF" stopOpacity="1" />
            <stop offset="30%" stopColor="#3A08FF" stopOpacity="0.96" />
            <stop offset="60%" stopColor="#4210FF" stopOpacity="0.58" />
            <stop offset="75%" stopColor="#3A10D8" stopOpacity="0.3" />
            <stop offset="90%" stopColor="#17065B" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#080020" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={surfaceCoreShadowGradientId} cx="51%" cy="53%" r="34%">
            <stop offset="0%" stopColor="#190E57" stopOpacity="1" />
            <stop offset="48%" stopColor="#190E57" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#190E57" stopOpacity="0" />
          </radialGradient>

          <linearGradient id={rimGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#CEB3FF" stopOpacity="0.9" />
            <stop offset="28%" stopColor="#9B4FFF" stopOpacity="0.78" />
            <stop offset="68%" stopColor="#702AFF" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#3E10A8" stopOpacity="0.05" />
          </linearGradient>

          <linearGradient id={surfaceShadowGradientId} x1="18%" y1="5%" x2="82%" y2="100%">
            <stop offset="0%" stopColor="#050015" stopOpacity="0" />
            <stop offset="42%" stopColor="#050015" stopOpacity="0.12" />
            <stop offset="68%" stopColor="#030012" stopOpacity="0.22" />
            <stop offset="84%" stopColor="#02000D" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.995" />
          </linearGradient>

          <linearGradient id={surfaceBottomVignetteGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#03031C" stopOpacity="0" />
            <stop offset="68%" stopColor="#03031C" stopOpacity="0" />
            <stop offset="82%" stopColor="#03031C" stopOpacity="0.55" />
            <stop offset="90%" stopColor="#03031C" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#03031C" stopOpacity="1" />
          </linearGradient>

          <pattern id={surfaceTextureId} width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(24)">
            <path d="M 0 0 L 0 3" stroke="#DCC6FF" strokeOpacity="0.11" strokeWidth="0.5" />
          </pattern>

          <mask id={maskId} maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <ellipse ref={globeMaskHoleRef} fill="black" />
          </mask>
          <clipPath id={landClipId} clipPathUnits="userSpaceOnUse">
            <ellipse ref={globeLandClipRef} />
          </clipPath>
        </defs>

        <ellipse
          ref={globeRimGlowRef}
          className="mw-premium-orbit__globe-rim-glow"
          fill="none"
          stroke={`url(#${rimGradientId})`}
          strokeWidth="8"
        />

        <ellipse
          ref={globeHaloRef}
          className="mw-premium-orbit__globe-halo"
          fill={`url(#${haloGradientId})`}
          stroke={`url(#${rimGradientId})`}
          strokeWidth="0.95"
        />

        <ellipse
          ref={globeSurfaceLightRef}
          className="mw-premium-orbit__globe-surface-light"
          fill={`url(#${surfaceLightGradientId})`}
        />
        <ellipse
          ref={globeSurfaceLeftLightRef}
          className="mw-premium-orbit__globe-surface-left-light"
          fill={`url(#${surfaceLeftLightGradientId})`}
        />
        <ellipse
          ref={globeSurfaceBlueAmbientRef}
          className="mw-premium-orbit__globe-surface-blue-ambient"
          fill={`url(#${surfaceBlueAmbientGradientId})`}
        />
        <ellipse
          ref={globeSurfaceChromaRef}
          className="mw-premium-orbit__globe-surface-chroma"
          fill={`url(#${surfaceBlueAmbientGradientId})`}
        />
        <ellipse
          ref={globeSurfaceCoreShadowRef}
          className="mw-premium-orbit__globe-surface-core-shadow"
          fill={`url(#${surfaceCoreShadowGradientId})`}
        />
        <ellipse
          ref={globeSurfaceShadowRef}
          className="mw-premium-orbit__globe-surface-shadow"
          fill={`url(#${surfaceShadowGradientId})`}
        />
        <ellipse
          ref={globeSurfaceBottomVignetteRef}
          className="mw-premium-orbit__globe-surface-bottom-vignette"
          fill={`url(#${surfaceBottomVignetteGradientId})`}
        />
        <ellipse
          ref={globeSurfaceTextureRef}
          className="mw-premium-orbit__globe-surface-texture"
          fill={`url(#${surfaceTextureId})`}
        />

        <path
          ref={globeLandMaskRef}
          className="mw-premium-orbit__globe-land-mask"
          clipPath={`url(#${landClipId})`}
          fillRule="evenodd"
        />

        <g ref={ringGroupRef} className="mw-premium-orbit__ring-group">
          <g mask={`url(#${maskId})`}>
            <path ref={backOuterRef} className="mw-premium-orbit__ring-back-outer" />
            <path
              ref={backBlueRef}
              className="mw-premium-orbit__ring-back-blue"
              stroke={`url(#${blueGradientId})`}
            />
            <path
              ref={backPurpleRef}
              className="mw-premium-orbit__ring-back-purple"
              stroke={`url(#${purpleGradientId})`}
            />
          </g>

          <path ref={frontOuterRef} className="mw-premium-orbit__ring-front-outer" />
          <path
            ref={frontBlueRef}
            className="mw-premium-orbit__ring-front-blue"
            stroke={`url(#${blueGradientId})`}
          />
          <path
            ref={frontPurpleRef}
            className="mw-premium-orbit__ring-front-purple"
            stroke={`url(#${purpleGradientId})`}
          />

          {qualitySettings.showSecondaryRing && (
            <>
              <path
                ref={secondaryFrontRef}
                className="mw-premium-orbit__ring-front-secondary"
                stroke={`url(#${purpleGradientId})`}
              />
              <path
                ref={tertiaryFrontRef}
                className="mw-premium-orbit__ring-front-tertiary"
                stroke={`url(#${purpleGradientId})`}
              />
              <path
                ref={quaternaryFrontRef}
                className="mw-premium-orbit__ring-front-quaternary"
                stroke={`url(#${purpleGradientId})`}
              />
            </>
          )}
        </g>

        {qualitySettings.showPulseNodes && (
          <g className="mw-premium-orbit__nodes">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <circle
                key={index}
                ref={(element) => {
                  if (element) nodeElementsRef.current.set(index, element);
                  else nodeElementsRef.current.delete(index);
                }}
                className="mw-premium-orbit__node"
                r={index % 2 === 0 ? 3.2 : 2.1}
                style={{ animationDelay: `${index * -0.72}s` }}
              />
            ))}
          </g>
        )}
      </svg>

      <div className="mw-premium-orbit__globe-composite-contrast" aria-hidden="true" />

      <div className="mw-premium-orbit__country-labels" aria-hidden="true">
        {PREMIUM_GLOBE_COUNTRY_LABELS.map((label) => (
          <span
            key={label.id}
            ref={(element) => {
              if (element) countryLabelElementsRef.current.set(label.id, element);
              else countryLabelElementsRef.current.delete(label.id);
            }}
            className="mw-premium-orbit__country-label"
          >
            {label.name}
          </span>
        ))}
      </div>

      <div className="mw-premium-orbit__profiles">
        {profiles.map((profile) => (
          <OrbitProfileCard
            key={profile.id}
            profile={profile}
            register={registerProfile}
            onClick={onProfileClick}
            onEnter={onProfileEnter}
            onLeave={onProfileLeave}
          />
        ))}
      </div>
    </div>
  );
});
