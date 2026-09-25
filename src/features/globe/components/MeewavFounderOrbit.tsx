import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import {
  buildOrbitAnnulusArcPath,
  buildOutsideCircleClipPath,
  collectOrbitDiscBoundaryPoints,
  fitOrbitCircleToBoundaryPoints,
  type OrbitSurfaceTester,
} from "./founderOrbitGeometry";
import {
  dampOrbitVelocity,
  getEllipsePointerAngleDeg,
  getOrbitDepth,
  getOrbitPerspectiveOpacity,
  getOrbitPerspectiveScale,
  getShortestSignedAngleDeg,
  ORBIT_INERTIA_STOP_VELOCITY,
} from "./founderOrbitMotion";

type OrbitMember = {
  id: string;
  name: string;
  role: string;
  imageUrl: string;
  angleDeg: number;
  sizeScale: number;
  imageTransform?: string;
  gradeLevel?: 6;
  frontZIndex?: number;
  dateLabel?: string;
};

type OrbitTrack = {
  id: string;
  radiusScale: number;
  widthScale: number;
  minWidth: number;
  maxWidth: number;
  stroke: string;
};

type OrbitTrackSide = "back" | "front";
type OrbitTrackElements = Partial<Record<OrbitTrackSide, SVGPathElement>>;

type OrbitLayoutGeometry = {
  cx: number;
  cy: number;
  globeRadius: number;
  nodeRx: number;
  nodeRy: number;
  avatarSize: number;
};

type OrbitDragState = {
  pointerId: number;
  lastAngleDeg: number;
  lastTime: number;
  velocityDegPerMs: number;
};

const ORBIT_MEMBERS: OrbitMember[] = [
  {
    id: "puff",
    name: "Puff",
    role: "Fondateur",
    imageUrl: "/assets/orbit/founder-puff.png",
    angleDeg: 130,
    sizeScale: 0.92,
    dateLabel: "10 juillet 2026",
  },
  {
    id: "nadir",
    name: "Nadir",
    role: "Co-fondateur",
    imageUrl: "/assets/orbit/cofounder-nadir.png",
    angleDeg: 50,
    sizeScale: 0.92,
    imageTransform: "translateX(-7%) scale(1.16)",
    frontZIndex: 24,
    dateLabel: "10 juillet 2026",
  },
  {
    id: "mc-pao",
    name: "MC Pao",
    role: "Investisseur",
    imageUrl: "/assets/orbit/investor-mc-pao.png",
    angleDeg: 90,
    sizeScale: 1,
  },
  {
    id: "gazo",
    name: "Gazo",
    role: "Artiste légendaire",
    imageUrl: "/assets/orbit/legendary-gazo.png",
    angleDeg: 172,
    sizeScale: 0.8,
    gradeLevel: 6,
  },
  {
    id: "gims",
    name: "Gims",
    role: "Artiste légendaire",
    imageUrl: "/assets/orbit/legendary-gims.png",
    angleDeg: 8,
    sizeScale: 0.8,
    gradeLevel: 6,
    frontZIndex: 23,
  },
];

export const MEEWAV_FOUNDER_ORBIT_IMAGE_URLS = ORBIT_MEMBERS.map((member) => member.imageUrl);

const ORBIT_EDGE_SEARCH_STEP = 10;
const ORBIT_TRACK_ROTATION_DEG = 0;
const ORBIT_NODE_ROTATION_DEG = 0;
const ORBIT_PLANE_RATIO = 0.31;
const ORBIT_NODE_RADIUS_SCALE = 1.575;
const ORBIT_MAX_GLOBE_RADIUS_RATIO = 0.53;
const ORBIT_HIT_INNER_RADIUS_SCALE = 1.08;
const ORBIT_HIT_OUTER_RADIUS_SCALE = 1.62;

const ORBIT_TRACKS: OrbitTrack[] = [
  {
    id: "inner-rail",
    radiusScale: 1.105,
    widthScale: 0.009,
    minWidth: 1.5,
    maxWidth: 3.4,
    stroke: "url(#meewav-founder-orbit-signal-gradient)",
  },
  {
    id: "inner-band",
    radiusScale: 1.19,
    widthScale: 0.075,
    minWidth: 11,
    maxWidth: 29,
    stroke: "url(#meewav-founder-orbit-inner-gradient)",
  },
  {
    id: "core-band",
    radiusScale: 1.33,
    widthScale: 0.13,
    minWidth: 19,
    maxWidth: 48,
    stroke: "url(#meewav-founder-orbit-core-gradient)",
  },
  {
    id: "outer-band",
    radiusScale: 1.485,
    widthScale: 0.085,
    minWidth: 13,
    maxWidth: 32,
    stroke: "url(#meewav-founder-orbit-outer-gradient)",
  },
  {
    id: "outer-rail",
    radiusScale: 1.575,
    widthScale: 0.01,
    minWidth: 1.6,
    maxWidth: 3.8,
    stroke: "url(#meewav-founder-orbit-signal-gradient)",
  },
];

type MeewavFounderOrbitProps = {
  map: MapLibreMap | null;
  visible: boolean;
  interactive?: boolean;
};

export default function MeewavFounderOrbit({
  map,
  visible,
  interactive = true,
}: MeewavFounderOrbitProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const maskCircleRef = useRef<SVGCircleElement | null>(null);
  const backHitClipPathRef = useRef<SVGPathElement | null>(null);
  const trackRefs = useRef(new Map<string, OrbitTrackElements>());
  const hitTargetRefs = useRef<OrbitTrackElements>({});
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const orbitLayoutRef = useRef<OrbitLayoutGeometry | null>(null);
  const orbitRotationRef = useRef(0);
  const renderOrbitPhaseRef = useRef<(rotationDeg: number) => void>(() => undefined);
  const dragRef = useRef<OrbitDragState | null>(null);
  const inertiaFrameRef = useRef(0);

  const setTrackRef = (trackId: string, side: OrbitTrackSide, node: SVGPathElement | null) => {
    const elements = trackRefs.current.get(trackId) ?? {};
    if (node) {
      elements[side] = node;
      trackRefs.current.set(trackId, elements);
      return;
    }

    delete elements[side];
    if (elements.back || elements.front) trackRefs.current.set(trackId, elements);
    else trackRefs.current.delete(trackId);
  };

  const setHitTargetRef = (side: OrbitTrackSide, node: SVGPathElement | null) => {
    if (node) hitTargetRefs.current[side] = node;
    else delete hitTargetRefs.current[side];
  };

  const stopOrbitInertia = () => {
    if (!inertiaFrameRef.current) return;
    window.cancelAnimationFrame(inertiaFrameRef.current);
    inertiaFrameRef.current = 0;
  };

  const applyOrbitRotation = (rotationDeg: number) => {
    orbitRotationRef.current = positiveModulo(rotationDeg, 360);
    renderOrbitPhaseRef.current(orbitRotationRef.current);
  };

  const startOrbitInertia = (initialVelocityDegPerMs: number) => {
    stopOrbitInertia();
    if (
      Math.abs(initialVelocityDegPerMs) < ORBIT_INERTIA_STOP_VELOCITY
      || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) return;

    let velocityDegPerMs = initialVelocityDegPerMs;
    let previousTime = window.performance.now();
    const step = (time: number) => {
      const deltaMs = Math.max(0, Math.min(time - previousTime, 34));
      previousTime = time;
      velocityDegPerMs = dampOrbitVelocity(velocityDegPerMs, deltaMs);
      if (Math.abs(velocityDegPerMs) < ORBIT_INERTIA_STOP_VELOCITY) {
        inertiaFrameRef.current = 0;
        return;
      }
      applyOrbitRotation(orbitRotationRef.current + velocityDegPerMs * deltaMs);
      inertiaFrameRef.current = window.requestAnimationFrame(step);
    };
    inertiaFrameRef.current = window.requestAnimationFrame(step);
  };

  const pointerAngleForEvent = (event: ReactPointerEvent<SVGPathElement>) => {
    const overlay = overlayRef.current;
    const layout = orbitLayoutRef.current;
    if (!overlay || !layout) return null;
    const bounds = overlay.getBoundingClientRect();
    return getEllipsePointerAngleDeg(
      event.clientX - bounds.left,
      event.clientY - bounds.top,
      layout.cx,
      layout.cy,
      layout.nodeRx,
      layout.nodeRy,
    );
  };

  const handleOrbitPointerDown = (event: ReactPointerEvent<SVGPathElement>) => {
    if (!interactive || !visible) return;
    const angleDeg = pointerAngleForEvent(event);
    if (angleDeg === null) return;
    event.preventDefault();
    event.stopPropagation();
    stopOrbitInertia();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      lastAngleDeg: angleDeg,
      lastTime: event.timeStamp,
      velocityDegPerMs: 0,
    };
    overlayRef.current?.classList.add("is-dragging");
  };

  const handleOrbitPointerMove = (event: ReactPointerEvent<SVGPathElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const angleDeg = pointerAngleForEvent(event);
    if (angleDeg === null) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaDeg = getShortestSignedAngleDeg(angleDeg, drag.lastAngleDeg);
    const deltaMs = Math.max(4, Math.min(event.timeStamp - drag.lastTime, 50));
    const instantaneousVelocity = deltaDeg / deltaMs;
    drag.velocityDegPerMs = drag.velocityDegPerMs * 0.58 + instantaneousVelocity * 0.42;
    drag.lastAngleDeg = angleDeg;
    drag.lastTime = event.timeStamp;
    applyOrbitRotation(orbitRotationRef.current + deltaDeg);
  };

  const handleOrbitPointerEnd = (event: ReactPointerEvent<SVGPathElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    overlayRef.current?.classList.remove("is-dragging");
    startOrbitInertia(drag.velocityDegPerMs);
  };

  useEffect(() => {
    // Do not keep MapLibre camera/style listeners alive while the orbit is
    // hidden. The React class already controls the hidden presentation, so
    // subscribing here would only schedule useless work during every city fly.
    if (!map || !visible) return;

    const overlay = overlayRef.current;
    const svg = svgRef.current;
    const maskCircle = maskCircleRef.current;
    const backHitClipPath = backHitClipPathRef.current;

    if (!overlay || !svg || !maskCircle || !backHitClipPath) {
      return;
    }

    let frameId = 0;
    let disposed = false;
    let layoutKey = "";

    const renderOrbitPhase = (rotationDeg: number) => {
      const layout = orbitLayoutRef.current;
      if (!layout) return;

      for (const track of ORBIT_TRACKS) {
        if (!track.id.includes("rail")) continue;
        const elements = trackRefs.current.get(track.id);
        for (const element of [elements?.back, elements?.front]) {
          if (element) element.setAttribute("stroke-dashoffset", String(round(-rotationDeg * 0.22)));
        }
      }

      for (const member of ORBIT_MEMBERS) {
        const node = nodeRefs.current.get(member.id);
        if (!node) continue;

        const memberAngle = member.angleDeg + rotationDeg;
        const normalizedAngle = positiveModulo(memberAngle, 360);
        const point = ellipsePoint(
          layout.cx,
          layout.cy,
          layout.nodeRx,
          layout.nodeRy,
          ORBIT_NODE_ROTATION_DEG,
          memberAngle,
        );
        const depth = getOrbitDepth(normalizedAngle);
        const isFront = normalizedAngle >= 0 && normalizedAngle <= 180;
        const memberLayoutSize = Math.round(layout.avatarSize * member.sizeScale);
        const memberAvatarSize = Math.round(memberLayoutSize * 0.5);

        node.style.left = `${point.x}px`;
        node.style.top = `${point.y}px`;
        node.style.opacity = String(getOrbitPerspectiveOpacity(depth));
        node.style.zIndex = isFront ? String(member.frontZIndex ?? Math.round(12 + depth * 10)) : "1";
        node.style.setProperty("--meewav-founder-avatar-size", `${memberAvatarSize}px`);
        node.style.setProperty("--meewav-founder-label-anchor-size", `${memberLayoutSize}px`);
        node.style.setProperty("--meewav-founder-depth-scale", String(getOrbitPerspectiveScale(depth)));
        node.style.setProperty(
          "--meewav-founder-globe-mask-x",
          `calc(50% + ${round(layout.cx - point.x)}px)`,
        );
        node.style.setProperty(
          "--meewav-founder-globe-mask-y",
          `calc(50% + ${round(layout.cy - point.y)}px)`,
        );
        node.style.setProperty(
          "--meewav-founder-globe-mask-radius",
          `${round(layout.globeRadius)}px`,
        );
        node.classList.toggle("is-front", isFront);
        node.classList.toggle("is-back", !isFront);
        node.dataset.orbitSide = isFront ? "front" : "back";
      }
    };
    renderOrbitPhaseRef.current = renderOrbitPhase;

    const schedule = () => {
      if (disposed || frameId) return;
      frameId = window.requestAnimationFrame(update);
    };

    const update = () => {
      frameId = 0;
      if (disposed) return;

      const canvas = map.getCanvas();
      // Layout dimensions stay stable while the entire orbit is scaled during
      // startup. getBoundingClientRect() would include that visual transform
      // and make the geometry shrink a second time.
      const width = canvas.clientWidth || overlay.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || overlay.clientHeight || window.innerHeight;
      if (!width || !height) return;

      const globe = estimateGlobeGeometry(map, width, height);
      const cx = globe.cx;
      const cy = globe.cy;
      const globeRadius = globe.radius;
      overlay.style.setProperty("--meewav-globe-cx", `${cx}px`);
      overlay.style.setProperty("--meewav-globe-cy", `${cy}px`);
      overlay.style.setProperty("--meewav-globe-diameter", `${globeRadius * 2}px`);
      const nextLayoutKey = [
        Math.round(width),
        Math.round(height),
        Math.round(cx * 2),
        Math.round(cy * 2),
        Math.round(globeRadius * 2),
      ].join(":");
      if (nextLayoutKey === layoutKey) return;
      layoutKey = nextLayoutKey;

      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      maskCircle.setAttribute("cx", String(cx));
      maskCircle.setAttribute("cy", String(cy));
      maskCircle.setAttribute("r", String(globeRadius * 1.008));
      backHitClipPath.setAttribute(
        "d",
        buildOutsideCircleClipPath(width, height, cx, cy, globeRadius * 1.008),
      );

      for (const track of ORBIT_TRACKS) {
        const elements = trackRefs.current.get(track.id);
        const back = elements?.back;
        const front = elements?.front;
        if (!back || !front) continue;

        const rx = globeRadius * track.radiusScale;
        const ry = rx * ORBIT_PLANE_RATIO;
        const strokeWidth = clamp(globeRadius * track.widthScale, track.minWidth, track.maxWidth);
        back.setAttribute("d", ellipseArcPath(cx, cy, rx, ry, ORBIT_TRACK_ROTATION_DEG, 180, 360));
        front.setAttribute("d", ellipseArcPath(cx, cy, rx, ry, ORBIT_TRACK_ROTATION_DEG, 0, 180));
        back.setAttribute("stroke-width", String(strokeWidth));
        front.setAttribute("stroke-width", String(strokeWidth));
      }

      const nodeRx = globeRadius * ORBIT_NODE_RADIUS_SCALE;
      const nodeRy = nodeRx * ORBIT_PLANE_RATIO;
      const avatarSize = Math.round(clamp(globeRadius * 0.18, 52, 96));
      orbitLayoutRef.current = { cx, cy, globeRadius, nodeRx, nodeRy, avatarSize };

      const hitInnerRx = globeRadius * ORBIT_HIT_INNER_RADIUS_SCALE;
      const hitInnerRy = hitInnerRx * ORBIT_PLANE_RATIO;
      const hitOuterRx = globeRadius * ORBIT_HIT_OUTER_RADIUS_SCALE;
      const hitOuterRy = hitOuterRx * ORBIT_PLANE_RATIO;
      const backHitTarget = hitTargetRefs.current.back;
      const frontHitTarget = hitTargetRefs.current.front;
      if (backHitTarget) {
        backHitTarget.setAttribute("d", buildOrbitAnnulusArcPath({
          cx,
          cy,
          innerRx: hitInnerRx,
          innerRy: hitInnerRy,
          outerRx: hitOuterRx,
          outerRy: hitOuterRy,
          startAngleDeg: 180,
          endAngleDeg: 360,
        }));
      }
      if (frontHitTarget) {
        frontHitTarget.setAttribute("d", buildOrbitAnnulusArcPath({
          cx,
          cy,
          innerRx: hitInnerRx,
          innerRy: hitInnerRy,
          outerRx: hitOuterRx,
          outerRy: hitOuterRy,
          startAngleDeg: 0,
          endAngleDeg: 180,
        }));
      }

      renderOrbitPhase(orbitRotationRef.current);
    };

    const eventNames = ["load", "style.load", "styledata", "move", "moveend", "zoom", "zoomend", "rotate", "pitch", "resize"] as const;
    eventNames.forEach((eventName) => map.on(eventName as any, schedule));
    window.addEventListener("resize", schedule);
    schedule();

    return () => {
      disposed = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      eventNames.forEach((eventName) => map.off(eventName as any, schedule));
      window.removeEventListener("resize", schedule);
      stopOrbitInertia();
      dragRef.current = null;
      overlay.classList.remove("is-dragging");
      orbitLayoutRef.current = null;
      renderOrbitPhaseRef.current = () => undefined;
    };
  }, [map, visible]);

  return (
    <div
      ref={overlayRef}
      className={`meewav-founder-orbit ${visible ? "" : "is-hidden"}`}
      aria-hidden={!visible || !interactive}
    >
      <div className="meewav-founder-orbit__atmosphere" />
      <svg ref={svgRef} className="meewav-founder-orbit__svg" role="presentation">
        <defs>
          <linearGradient id="meewav-founder-orbit-inner-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5D22D6" stopOpacity="0.16" />
            <stop offset="22%" stopColor="#7B38FF" stopOpacity="0.74" />
            <stop offset="48%" stopColor="#B48CFF" stopOpacity="0.9" />
            <stop offset="72%" stopColor="#7843FF" stopOpacity="0.78" />
            <stop offset="100%" stopColor="#3A35C9" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="meewav-founder-orbit-core-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4B19B8" stopOpacity="0.1" />
            <stop offset="16%" stopColor="#6F2DFF" stopOpacity="0.56" />
            <stop offset="34%" stopColor="#914CFF" stopOpacity="0.82" />
            <stop offset="50%" stopColor="#E0C7FF" stopOpacity="0.92" />
            <stop offset="66%" stopColor="#A65CFF" stopOpacity="0.84" />
            <stop offset="84%" stopColor="#5D55F2" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#4D22C9" stopOpacity="0.1" />
          </linearGradient>
          <linearGradient id="meewav-founder-orbit-outer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4A18B5" stopOpacity="0.12" />
            <stop offset="25%" stopColor="#7A31EA" stopOpacity="0.68" />
            <stop offset="46%" stopColor="#9454FF" stopOpacity="0.86" />
            <stop offset="58%" stopColor="#CFAAFF" stopOpacity="0.9" />
            <stop offset="78%" stopColor="#7F3CF5" stopOpacity="0.72" />
            <stop offset="100%" stopColor="#3F2BCA" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="meewav-founder-orbit-signal-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4D24C7" stopOpacity="0.28" />
            <stop offset="24%" stopColor="#7B35FF" stopOpacity="0.88" />
            <stop offset="50%" stopColor="#C6A7FF" stopOpacity="0.98" />
            <stop offset="76%" stopColor="#8A3DFF" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#5525D9" stopOpacity="0.28" />
          </linearGradient>
          <mask
            id="meewav-founder-orbit-outside-globe-mask"
            x="0"
            y="0"
            width="100%"
            height="100%"
            maskUnits="userSpaceOnUse"
            maskContentUnits="userSpaceOnUse"
          >
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <circle ref={maskCircleRef} cx="0" cy="0" r="0" fill="black" />
          </mask>
          <clipPath
            id="meewav-founder-orbit-outside-globe-hit-clip"
            clipPathUnits="userSpaceOnUse"
          >
            <path
              ref={backHitClipPathRef}
              clipRule="evenodd"
              fillRule="evenodd"
            />
          </clipPath>
        </defs>
        {ORBIT_TRACKS.map((track) => (
          <path
            key={`${track.id}-back`}
            ref={(node) => setTrackRef(track.id, "back", node)}
            className={`meewav-founder-orbit__track meewav-founder-orbit__track--${track.id} is-back`}
            fill="none"
            stroke={track.stroke}
            strokeLinecap="round"
            mask="url(#meewav-founder-orbit-outside-globe-mask)"
          />
        ))}
        {ORBIT_TRACKS.map((track) => (
          <path
            key={`${track.id}-front`}
            ref={(node) => setTrackRef(track.id, "front", node)}
            className={`meewav-founder-orbit__track meewav-founder-orbit__track--${track.id} is-front`}
            fill="none"
            stroke={track.stroke}
            strokeLinecap="round"
          />
        ))}
        <path
          ref={(node) => setHitTargetRef("back", node)}
          className="meewav-founder-orbit__hit-target is-back"
          fill="rgba(255,255,255,0.001)"
          fillRule="evenodd"
          mask="url(#meewav-founder-orbit-outside-globe-mask)"
          clipPath="url(#meewav-founder-orbit-outside-globe-hit-clip)"
          onPointerDown={handleOrbitPointerDown}
          onPointerMove={handleOrbitPointerMove}
          onPointerUp={handleOrbitPointerEnd}
          onPointerCancel={handleOrbitPointerEnd}
        />
        <path
          ref={(node) => setHitTargetRef("front", node)}
          className="meewav-founder-orbit__hit-target is-front"
          fill="rgba(255,255,255,0.001)"
          fillRule="evenodd"
          onPointerDown={handleOrbitPointerDown}
          onPointerMove={handleOrbitPointerMove}
          onPointerUp={handleOrbitPointerEnd}
          onPointerCancel={handleOrbitPointerEnd}
        />
      </svg>

      <div className="meewav-founder-orbit__nodes">
        {ORBIT_MEMBERS.map((member) => (
          <button
            key={member.id}
            ref={(node) => {
              if (node) nodeRefs.current.set(member.id, node);
              else nodeRefs.current.delete(member.id);
            }}
            type="button"
            className="meewav-founder-orbit__node"
            aria-label={`${member.name}, ${member.role}${member.dateLabel ? `, ${member.dateLabel}` : ""}`}
            tabIndex={interactive ? 0 : -1}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="meewav-founder-orbit__avatar-wrap">
              <span className="meewav-founder-orbit__avatar-shell">
                <img
                  className="meewav-founder-orbit__avatar"
                  src={member.imageUrl}
                  alt={member.name}
                  draggable={false}
                  loading="eager"
                  decoding="async"
                  style={member.imageTransform ? { transform: member.imageTransform } : undefined}
                />
              </span>
            </span>
            <span className={`meewav-founder-orbit__label${member.gradeLevel === 6 ? " has-grade-badge" : ""}`}>
              <strong>{member.name}</strong>
              <span className="meewav-founder-orbit__role-line">
                <em>{member.role}</em>
                {member.gradeLevel === 6 && (
                  <MeewavGradeBadge
                    level={6}
                    size="xs"
                    variant="icon"
                    className="meewav-founder-orbit__grade-badge"
                    title={`${member.name} — Artiste légendaire`}
                  />
                )}
              </span>
              {member.dateLabel && (
                <time className="meewav-founder-orbit__date" dateTime="2026-07-10">
                  {member.dateLabel}
                </time>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function estimateGlobeGeometry(map: MapLibreMap, width: number, height: number) {
  const center = getProjectedGlobeCenter(map, width, height);
  // The rendered silhouette is the source of truth. In a pitched perspective
  // camera, map.project(map.getCenter()) points at the globe surface rather
  // than at the optical centre of the sphere, which used to place the DOM arc
  // too high and make it too large during a manual dezoom.
  const surfaceGeometry = estimateSurfaceDiscGeometry(map, width, height, center);
  if (surfaceGeometry) return surfaceGeometry;

  // Keep the analytical projection as a no-readback fallback while MapLibre's
  // globe transform is settling. Normal globe frames use the measured disc.
  const transformRadius = getProjectedTransformGlobeRadius(map, height);
  if (transformRadius) {
    return {
      cx: center.x,
      cy: center.y,
      radius: transformRadius,
    };
  }

  const baseRadius = getVisualGlobeRadius(map, width, height);
  const radius = clamp(baseRadius, Math.min(width, height) * 0.28, Math.max(width, height) * 4);

  return {
    cx: center.x,
    cy: center.y,
    radius,
  };
}

function getProjectedGlobeCenter(map: MapLibreMap, width: number, height: number) {
  const transform = (map as MapLibreMap & {
    transform?: {
      modelViewProjectionMatrix?: ArrayLike<number>;
    };
  }).transform;
  const matrix = transform?.modelViewProjectionMatrix;
  if (matrix && matrix.length >= 16) {
    const clipW = safeNumber(matrix[15], 0);
    if (Math.abs(clipW) > 0.000001) {
      const clipX = safeNumber(matrix[12], Number.NaN) / clipW;
      const clipY = safeNumber(matrix[13], Number.NaN) / clipW;
      const x = (clipX * 0.5 + 0.5) * width;
      const y = (-clipY * 0.5 + 0.5) * height;
      if (Number.isFinite(x) && Number.isFinite(y)) {
        return { x, y };
      }
    }
  }

  try {
    const center = map.getCenter();
    const centerPoint = map.project([center.lng, center.lat]);
    if (Number.isFinite(centerPoint.x) && Number.isFinite(centerPoint.y)) {
      return { x: centerPoint.x, y: centerPoint.y };
    }
  } catch {
    // Fall back to the viewport center while the map projection is settling.
  }

  return {
    x: width / 2,
    y: height / 2,
  };
}

function estimateSurfaceDiscGeometry(
  map: MapLibreMap,
  width: number,
  height: number,
  center: { x: number; y: number },
) {
  const surfaceTester = getGlobeSurfaceTester(map);
  if (!surfaceTester) return null;

  const projectedCenterIsVisible = center.x >= 0
    && center.x <= width
    && center.y >= 0
    && center.y <= height;
  let searchCenter = {
    x: clamp(center.x, 0, width),
    y: clamp(center.y, 0, height),
  };

  if (!surfaceTester(searchCenter.x, searchCenter.y)) {
    const viewportCenter = { x: width / 2, y: height / 2 };
    if (surfaceTester(viewportCenter.x, viewportCenter.y)) searchCenter = viewportCenter;
  }

  if (projectedCenterIsVisible && surfaceTester(searchCenter.x, searchCenter.y)) {
    const left = findSurfaceEdge(surfaceTester, searchCenter, { x: -1, y: 0 }, width, height);
    const right = findSurfaceEdge(surfaceTester, searchCenter, { x: 1, y: 0 }, width, height);
    const top = findSurfaceEdge(surfaceTester, searchCenter, { x: 0, y: -1 }, width, height);
    const bottom = findSurfaceEdge(surfaceTester, searchCenter, { x: 0, y: 1 }, width, height);
    if (left && right && top && bottom) {
      const radiusX = (right.x - left.x) / 2;
      const radiusY = (bottom.y - top.y) / 2;
      if (radiusX >= 24 && radiusY >= 24) {
        return {
          cx: (left.x + right.x) / 2,
          cy: (top.y + bottom.y) / 2,
          radius: (radiusX + radiusY) / 2,
        };
      }
    }
  }

  // When the tilted globe is larger than the viewport, one or several
  // cardinal edges are off-screen. Fit the actual visible silhouette instead
  // of falling back to a viewport-centred approximation.
  const boundaryPoints = collectOrbitDiscBoundaryPoints(surfaceTester, width, height);
  const fittedCircle = fitOrbitCircleToBoundaryPoints(boundaryPoints);
  if (!fittedCircle) return null;
  const maxResidual = Math.max(2.5, fittedCircle.radius * 0.012);
  if (
    fittedCircle.radius < 24
    || fittedCircle.radius > Math.max(width, height) * 6
    || fittedCircle.residual > maxResidual
  ) return null;

  return {
    cx: fittedCircle.cx,
    cy: fittedCircle.cy,
    radius: fittedCircle.radius,
  };
}

function getGlobeSurfaceTester(map: MapLibreMap): OrbitSurfaceTester | null {
  const transform = (map as MapLibreMap & {
    transform?: {
      isPointOnMapSurface?: (point: { x: number; y: number }) => boolean;
    };
  }).transform;
  const isPointOnMapSurface = transform?.isPointOnMapSurface;
  if (typeof isPointOnMapSurface !== "function" || !transform) return null;

  return (x: number, y: number) => {
    try {
      return Boolean(isPointOnMapSurface.call(transform, { x, y }));
    } catch {
      return false;
    }
  };
}

function findSurfaceEdge(
  surfaceTester: OrbitSurfaceTester,
  start: { x: number; y: number },
  direction: { x: number; y: number },
  width: number,
  height: number,
) {
  let inside = start;
  let outside: { x: number; y: number } | null = null;
  const maxDistance = Math.hypot(width, height) + ORBIT_EDGE_SEARCH_STEP;

  for (let distance = ORBIT_EDGE_SEARCH_STEP; distance <= maxDistance; distance += ORBIT_EDGE_SEARCH_STEP) {
    const point = {
      x: start.x + direction.x * distance,
      y: start.y + direction.y * distance,
    };

    if (point.x < -1 || point.x > width + 1 || point.y < -1 || point.y > height + 1) {
      return null;
    }

    if (surfaceTester(point.x, point.y)) {
      inside = point;
    } else {
      outside = point;
      break;
    }
  }

  if (!outside) return null;
  let outsidePoint: { x: number; y: number } = outside;

  for (let i = 0; i < 14; i += 1) {
    const midpoint: { x: number; y: number } = {
      x: (inside.x + outsidePoint.x) / 2,
      y: (inside.y + outsidePoint.y) / 2,
    };

    if (surfaceTester(midpoint.x, midpoint.y)) {
      inside = midpoint;
    } else {
      outsidePoint = midpoint;
    }
  }

  return {
    x: (inside.x + outsidePoint.x) / 2,
    y: (inside.y + outsidePoint.y) / 2,
  };
}

function getProjectedTransformGlobeRadius(map: MapLibreMap, viewportHeight: number) {
  const transform = (map as MapLibreMap & {
    transform?: {
      worldSize?: number;
      cameraToCenterDistance?: number;
      fovInRadians?: number;
      pitchInRadians?: number;
      height?: number;
    };
  }).transform;
  const worldSize = safeNumber(transform?.worldSize, 0);
  if (!worldSize) return null;

  let centerLatitude = 0;
  try {
    centerLatitude = safeNumber(map.getCenter().lat, 0);
  } catch {
    // The center can be temporarily unavailable while the projection settles.
  }

  const latitudeScale = Math.cos(toRad(centerLatitude));
  if (!Number.isFinite(latitudeScale) || Math.abs(latitudeScale) < 0.000001) return null;

  const globeRadius = Math.abs(worldSize / (2 * Math.PI) / latitudeScale);
  const cameraToSurface = safeNumber(transform?.cameraToCenterDistance, 0);
  if (!cameraToSurface) return null;

  const pitch = safeNumber(transform?.pitchInRadians, toRad(safeNumber(map.getPitch(), 0)));
  const screenHeight = safeNumber(transform?.height, viewportHeight) || viewportHeight;
  const fov = safeNumber(transform?.fovInRadians, 0);
  const focalLength = fov > 0 && fov < Math.PI
    ? screenHeight / (2 * Math.tan(fov / 2))
    : cameraToSurface;

  // The globe center sits one radius behind the map-center surface point.
  // After pitch, its camera distance follows the same triangle MapLibre uses
  // for its horizon/clipping plane. Projecting the tangent cone gives the
  // exact on-screen silhouette radius.
  const tangentDistanceSquared = (
    cameraToSurface * cameraToSurface
    + 2 * cameraToSurface * globeRadius * Math.cos(pitch)
  );
  if (!Number.isFinite(tangentDistanceSquared) || tangentDistanceSquared <= 0) return null;

  const projectedRadius = focalLength * globeRadius / Math.sqrt(tangentDistanceSquared);
  return Number.isFinite(projectedRadius) && projectedRadius > 0 ? projectedRadius : null;
}

function getVisualGlobeRadius(map: MapLibreMap, width: number, height: number) {
  const zoom = safeNumber(map.getZoom(), 2);
  const base = Math.min(width, height);
  const ratio = clamp(0.32 + (zoom - 1.45) * 0.2, 0.28, ORBIT_MAX_GLOBE_RADIUS_RATIO);
  return base * ratio;
}

function ellipsePoint(cx: number, cy: number, rx: number, ry: number, rotationDeg: number, angleDeg: number) {
  const angle = toRad(angleDeg);
  const rotation = toRad(rotationDeg);
  const cosAngle = Math.cos(angle);
  const sinAngle = Math.sin(angle);
  const cosRotation = Math.cos(rotation);
  const sinRotation = Math.sin(rotation);

  return {
    x: cx + rx * cosAngle * cosRotation - ry * sinAngle * sinRotation,
    y: cy + rx * cosAngle * sinRotation + ry * sinAngle * cosRotation,
  };
}

function ellipseArcPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotationDeg: number,
  startAngleDeg: number,
  endAngleDeg: number,
) {
  const start = ellipsePoint(cx, cy, rx, ry, rotationDeg, startAngleDeg);
  const end = ellipsePoint(cx, cy, rx, ry, rotationDeg, endAngleDeg);
  const delta = positiveModulo(endAngleDeg - startAngleDeg, 360);
  const largeArcFlag = delta > 180 ? 1 : 0;

  return [
    `M ${round(start.x)} ${round(start.y)}`,
    `A ${round(rx)} ${round(ry)} ${round(rotationDeg)} ${largeArcFlag} 1 ${round(end.x)} ${round(end.y)}`,
  ].join(" ");
}

function safeNumber(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function toRad(deg: number) {
  return deg * Math.PI / 180;
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}
