import { useEffect, type MutableRefObject, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ORBIT_NODE_ANGLES_DEG } from "./defaults";
import {
  clamp,
  ellipseArcPath,
  ellipsePoint,
  fullEllipsePath,
  lerp,
} from "./math";
import type {
  OrbitCalibration,
  OrbitLayoutSnapshot,
  OrbitProfile,
  ResolvedOrbitQuality,
} from "./types";
import { buildProjectedLandPath, type LandRing } from "./landMask";

export interface OrbitSvgRefs {
  svg: RefObject<SVGSVGElement | null>;
  ringGroup: RefObject<SVGGElement | null>;
  backOuter: RefObject<SVGPathElement | null>;
  backBlue: RefObject<SVGPathElement | null>;
  backPurple: RefObject<SVGPathElement | null>;
  frontOuter: RefObject<SVGPathElement | null>;
  frontBlue: RefObject<SVGPathElement | null>;
  frontPurple: RefObject<SVGPathElement | null>;
  secondaryFront: RefObject<SVGPathElement | null>;
  tertiaryFront: RefObject<SVGPathElement | null>;
  quaternaryFront: RefObject<SVGPathElement | null>;
  globeMaskHole: RefObject<SVGEllipseElement | null>;
  globeLandClip: RefObject<SVGEllipseElement | null>;
  globeLandMask: RefObject<SVGPathElement | null>;
  globeHalo: RefObject<SVGEllipseElement | null>;
  globeRimGlow: RefObject<SVGEllipseElement | null>;
  globeSurfaceLight: RefObject<SVGEllipseElement | null>;
  globeSurfaceLeftLight: RefObject<SVGEllipseElement | null>;
  globeSurfaceBlueAmbient: RefObject<SVGEllipseElement | null>;
  globeSurfaceChroma: RefObject<SVGEllipseElement | null>;
  globeSurfaceCoreShadow: RefObject<SVGEllipseElement | null>;
  globeSurfaceShadow: RefObject<SVGEllipseElement | null>;
  globeSurfaceBottomVignette: RefObject<SVGEllipseElement | null>;
  globeSurfaceTexture: RefObject<SVGEllipseElement | null>;
  nodeElements: MutableRefObject<Map<number, SVGCircleElement>>;
}

interface UseMapOrbitSyncOptions {
  map: MapLibreMap | null;
  visible: boolean;
  profiles: readonly OrbitProfile[];
  calibration: OrbitCalibration;
  quality: ResolvedOrbitQuality;
  ambientMotion: boolean;
  ambientDegreesPerSecond: number;
  rootRef: RefObject<HTMLDivElement | null>;
  svgRefs: OrbitSvgRefs;
  profileElements: MutableRefObject<Map<string, HTMLElement>>;
  countryLabels: readonly { id: string; coordinates: readonly [number, number] }[];
  countryLabelElements: MutableRefObject<Map<string, HTMLElement>>;
  landRings: readonly LandRing[];
  onLayout?: (snapshot: OrbitLayoutSnapshot) => void;
}

function setAttribute(element: Element | null, name: string, value: string | number): void {
  if (!element) return;
  element.setAttribute(name, String(value));
}

function computeLayout(
  map: MapLibreMap,
  calibration: OrbitCalibration,
): OrbitLayoutSnapshot {
  const canvas = map.getCanvas();
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  const projectedCenter = map.project(map.getCenter());
  const pitchRatio = clamp(map.getPitch() / 60, 0, 1.25);

  const zoomScale = clamp(
    1 + (map.getZoom() - calibration.referenceZoom) * calibration.zoomScalePerLevel,
    calibration.minZoomScale,
    calibration.maxZoomScale,
  );

  const baseRadius = Math.min(
    width * calibration.globeRadiusViewportWidth,
    height * calibration.globeRadiusViewportHeight,
  );
  const globeRadius = baseRadius * zoomScale * calibration.sceneScale;

  return {
    width,
    height,
    centerX: projectedCenter.x + calibration.centerOffsetX,
    centerY:
      projectedCenter.y +
      calibration.centerOffsetY +
      pitchRatio * calibration.pitchCenterShiftPx,
    globeRadius,
    orbitRx: globeRadius * calibration.orbitRxMultiplier,
    orbitRy: globeRadius * calibration.orbitRyMultiplier,
    orbitRotationDeg: calibration.orbitRotationDeg,
  };
}

export function useMapOrbitSync({
  map,
  visible,
  profiles,
  calibration,
  quality,
  ambientMotion,
  ambientDegreesPerSecond,
  rootRef,
  svgRefs,
  profileElements,
  countryLabels,
  countryLabelElements,
  landRings,
  onLayout,
}: UseMapOrbitSyncOptions): void {
  useEffect(() => {
    if (!map) return;

    let frameId: number | null = null;
    let ambientFrameId: number | null = null;
    let ambientPhaseDeg = 0;
    let lastAmbientTime = performance.now();
    let lastAmbientPaint = 0;
    let destroyed = false;

    const apply = () => {
      frameId = null;
      if (destroyed) return;

      const root = rootRef.current;
      const svg = svgRefs.svg.current;
      if (!root || !svg) return;

      const projectionType = map.getProjection?.().type;
      const zoom = map.getZoom();
      const active =
        visible &&
        projectionType === "globe" &&
        zoom >= calibration.minVisibleZoom &&
        zoom <= calibration.maxVisibleZoom;

      root.dataset.active = active ? "true" : "false";
      root.setAttribute("aria-hidden", active ? "false" : "true");
      if (!active) return;

      const layout = computeLayout(map, calibration);
      onLayout?.(layout);

      root.style.setProperty("--mw-premium-globe-center-x", `${layout.centerX.toFixed(2)}px`);
      root.style.setProperty("--mw-premium-globe-center-y", `${layout.centerY.toFixed(2)}px`);
      root.style.setProperty("--mw-premium-globe-diameter", `${(layout.globeRadius * 1.984).toFixed(2)}px`);

      svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
      svg.setAttribute("width", String(layout.width));
      svg.setAttribute("height", String(layout.height));

      const rotation = layout.orbitRotationDeg;
      const transform = `rotate(${rotation} ${layout.centerX} ${layout.centerY})`;
      setAttribute(svgRefs.ringGroup.current, "transform", transform);

      const backPath = fullEllipsePath(
        layout.centerX,
        layout.centerY,
        layout.orbitRx,
        layout.orbitRy,
      );
      const frontPath = ellipseArcPath(
        layout.centerX,
        layout.centerY,
        layout.orbitRx,
        layout.orbitRy,
        calibration.frontArcStartDeg,
        calibration.frontArcEndDeg,
      );
      const frontUpperPath = ellipseArcPath(
        layout.centerX,
        layout.centerY - 8,
        layout.orbitRx * 0.995,
        layout.orbitRy * 1.015,
        calibration.frontArcStartDeg,
        calibration.frontArcEndDeg,
      );
      const secondaryPath = ellipseArcPath(
        layout.centerX,
        layout.centerY + 16,
        layout.orbitRx * 0.985,
        layout.orbitRy * 0.93,
        calibration.frontArcStartDeg + 2,
        calibration.frontArcEndDeg - 2,
      );
      const tertiaryPath = ellipseArcPath(
        layout.centerX,
        layout.centerY + 31,
        layout.orbitRx * 0.97,
        layout.orbitRy * 0.87,
        calibration.frontArcStartDeg + 3,
        calibration.frontArcEndDeg - 3,
      );
      const quaternaryPath = ellipseArcPath(
        layout.centerX,
        layout.centerY + 42,
        layout.orbitRx * 0.958,
        layout.orbitRy * 0.81,
        calibration.frontArcStartDeg + 4,
        calibration.frontArcEndDeg - 4,
      );

      for (const path of [
        svgRefs.backOuter.current,
        svgRefs.backBlue.current,
        svgRefs.backPurple.current,
      ]) {
        setAttribute(path, "d", backPath);
      }

      for (const path of [svgRefs.frontOuter.current, svgRefs.frontPurple.current]) {
        setAttribute(path, "d", frontPath);
      }
      setAttribute(svgRefs.frontBlue.current, "d", frontUpperPath);
      setAttribute(svgRefs.secondaryFront.current, "d", secondaryPath);
      setAttribute(svgRefs.tertiaryFront.current, "d", tertiaryPath);
      setAttribute(svgRefs.quaternaryFront.current, "d", quaternaryPath);

      const maskRadiusX = layout.globeRadius * 0.985;
      const maskRadiusY = layout.globeRadius * 0.985;
      setAttribute(svgRefs.globeMaskHole.current, "cx", layout.centerX);
      setAttribute(svgRefs.globeMaskHole.current, "cy", layout.centerY);
      setAttribute(svgRefs.globeMaskHole.current, "rx", maskRadiusX);
      setAttribute(svgRefs.globeMaskHole.current, "ry", maskRadiusY);
      setAttribute(svgRefs.globeLandClip.current, "cx", layout.centerX);
      setAttribute(svgRefs.globeLandClip.current, "cy", layout.centerY);
      setAttribute(svgRefs.globeLandClip.current, "rx", maskRadiusX);
      setAttribute(svgRefs.globeLandClip.current, "ry", maskRadiusY);
      const showsLandRelief = zoom <= 3.35;
      setAttribute(svgRefs.globeLandMask.current, "display", showsLandRelief ? "block" : "none");
      if (showsLandRelief) {
        setAttribute(svgRefs.globeLandMask.current, "d", buildProjectedLandPath(map, landRings));
      }

      setAttribute(svgRefs.globeHalo.current, "cx", layout.centerX);
      setAttribute(svgRefs.globeHalo.current, "cy", layout.centerY);
      setAttribute(svgRefs.globeHalo.current, "rx", layout.globeRadius * 1.005);
      setAttribute(svgRefs.globeHalo.current, "ry", layout.globeRadius * 1.005);
      setAttribute(svgRefs.globeRimGlow.current, "cx", layout.centerX);
      setAttribute(svgRefs.globeRimGlow.current, "cy", layout.centerY);
      setAttribute(svgRefs.globeRimGlow.current, "rx", layout.globeRadius * 1.004);
      setAttribute(svgRefs.globeRimGlow.current, "ry", layout.globeRadius * 1.004);

      for (const surface of [
        svgRefs.globeSurfaceLight.current,
        svgRefs.globeSurfaceLeftLight.current,
        svgRefs.globeSurfaceBlueAmbient.current,
        svgRefs.globeSurfaceChroma.current,
        svgRefs.globeSurfaceCoreShadow.current,
        svgRefs.globeSurfaceShadow.current,
        svgRefs.globeSurfaceBottomVignette.current,
        svgRefs.globeSurfaceTexture.current,
      ]) {
        setAttribute(surface, "cx", layout.centerX);
        setAttribute(surface, "cy", layout.centerY);
        setAttribute(surface, "rx", layout.globeRadius * 0.992);
        setAttribute(surface, "ry", layout.globeRadius * 0.992);
      }

      const mapPhase = map.getBearing() * calibration.bearingInfluence;
      const phase = calibration.phaseDeg + mapPhase + ambientPhaseDeg;

      for (const [index, angleDeg] of ORBIT_NODE_ANGLES_DEG.entries()) {
        const node = svgRefs.nodeElements.current.get(index);
        if (!node) continue;
        const point = ellipsePoint(
          layout.centerX,
          layout.centerY,
          layout.orbitRx,
          layout.orbitRy,
          angleDeg + phase,
          rotation,
        );
        setAttribute(node, "cx", point.x);
        setAttribute(node, "cy", point.y);
      }

      for (const profile of profiles) {
        const element = profileElements.current.get(profile.id);
        if (!element) continue;

        const point = ellipsePoint(
          layout.centerX,
          layout.centerY,
          layout.orbitRx,
          layout.orbitRy,
          profile.angleDeg + phase,
          rotation,
        );

        const dx = point.x - layout.centerX;
        const dy = point.y - layout.centerY;
        const length = Math.hypot(dx, dy) || 1;
        const radialOffset = profile.radialOffsetPx ?? 0;
        const x = point.x + (dx / length) * radialOffset + (profile.offsetX ?? 0);
        const y = point.y + (dy / length) * radialOffset + (profile.offsetY ?? 0);

        const depth = clamp(
          (y - (layout.centerY - layout.orbitRy)) / Math.max(1, layout.orbitRy * 2),
          0,
          1,
        );
        const profileScale =
          lerp(calibration.profileBackScale, calibration.profileFrontScale, depth) *
          (profile.scale ?? 1);
        const opacity = lerp(
          calibration.profileBackOpacity,
          calibration.profileFrontOpacity,
          depth,
        );
        const zIndex = 100 + Math.round(depth * 500);

        element.style.transform =
          `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) ` +
          `translate(-50%, -50%) scale(${profileScale.toFixed(4)})`;
        element.style.opacity = opacity.toFixed(3);
        element.style.zIndex = String(zIndex);
        element.style.setProperty("--mw-orbit-profile-size", `${calibration.profileBaseSizePx}px`);
        element.dataset.depth = depth > 0.57 ? "front" : "back";
      }

      for (const label of countryLabels) {
        const element = countryLabelElements.current.get(label.id);
        if (!element) continue;
        const point = map.project(label.coordinates as [number, number]);
        const distance = Math.hypot(point.x - layout.centerX, point.y - layout.centerY);
        const onVisibleDisc = Number.isFinite(point.x)
          && Number.isFinite(point.y)
          && distance <= layout.globeRadius * 0.94;
        element.style.opacity = onVisibleDisc ? "1" : "0";
        element.style.transform = `translate3d(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px, 0) translate(-50%, -50%)`;
      }

      root.style.setProperty("--mw-orbit-quality", quality);
    };

    const schedule = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(apply);
    };

    const onVisibilityChange = () => {
      if (!document.hidden) schedule();
    };

    const startAmbientLoop = () => {
      if (!ambientMotion || quality === "economy") return;

      const tick = (now: number) => {
        if (destroyed) return;
        ambientFrameId = requestAnimationFrame(tick);
        if (document.hidden || !visible) {
          lastAmbientTime = now;
          return;
        }

        // Cap DOM animation to ~24 fps. No MapLibre repaint is requested.
        if (now - lastAmbientPaint < 41) return;
        const deltaSeconds = Math.min(0.1, (now - lastAmbientTime) / 1000);
        lastAmbientTime = now;
        lastAmbientPaint = now;
        ambientPhaseDeg += ambientDegreesPerSecond * deltaSeconds;
        schedule();
      };

      ambientFrameId = requestAnimationFrame(tick);
    };

    map.on("render", schedule);
    map.on("resize", schedule);
    map.on("styledata", schedule);
    document.addEventListener("visibilitychange", onVisibilityChange);

    schedule();
    startAmbientLoop();

    return () => {
      destroyed = true;
      map.off("render", schedule);
      map.off("resize", schedule);
      map.off("styledata", schedule);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frameId !== null) cancelAnimationFrame(frameId);
      if (ambientFrameId !== null) cancelAnimationFrame(ambientFrameId);
    };
  }, [
    map,
    visible,
    profiles,
    calibration,
    quality,
    ambientMotion,
    ambientDegreesPerSecond,
    rootRef,
    svgRefs,
    profileElements,
    countryLabels,
    countryLabelElements,
    landRings,
    onLayout,
  ]);
}
