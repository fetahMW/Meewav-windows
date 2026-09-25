import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { PreProfileFrame } from "./PreProfileFrame";
import type { LngLatLike, Map as MapLibreMap } from "maplibre-gl";

import "./HoverPreProfileBubble.css";

type Placement = "left" | "right";

type ScreenPoint = {
  x: number;
  y: number;
  clearanceX?: number;
  trackingX?: number;
  trackingY?: number;
};

type HoverPreProfileBubbleProps = {
  map: MapLibreMap | null;
  visible: boolean;
  anchorScreenPoint?: ScreenPoint | null;
  anchorLngLat?: LngLatLike | null;
  cameraActive?: boolean;
  hideDuringCamera?: boolean;
  width?: number;
  height?: number;
  safeMargin?: number;
  children?: ReactNode;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
};

type BubbleLayout = {
  placement: Placement;
  left: number;
  top: number;
  arrowY: number;
};

const DEFAULT_WIDTH = 413;
const DEFAULT_HEIGHT = 588;
const DEFAULT_SAFE_MARGIN = 24;
const GAP_FROM_AVATAR = -20;
const ARROW_SIZE = 8;
const ARROW_SAFE_PADDING = 34;
const RIGHT_CONTROLS_GUARD_WIDTH = 118;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getAnchorViewportPoint(params: {
  map: MapLibreMap | null;
  anchorScreenPoint?: ScreenPoint | null;
  anchorLngLat?: LngLatLike | null;
}): ScreenPoint | null {
  const { map, anchorScreenPoint, anchorLngLat } = params;

  if (map && anchorScreenPoint) {
    const containerRect = map.getContainer().getBoundingClientRect();
    return {
      x: containerRect.left + anchorScreenPoint.x,
      y: containerRect.top + anchorScreenPoint.y,
      clearanceX: anchorScreenPoint.clearanceX,
    };
  }

  if (map && anchorLngLat) {
    const projected = map.project(anchorLngLat);
    const containerRect = map.getContainer().getBoundingClientRect();
    return {
      x: containerRect.left + projected.x,
      y: containerRect.top + projected.y,
    };
  }

  return null;
}

function computeBubbleLayout(params: {
  map: MapLibreMap | null;
  anchorScreenPoint?: ScreenPoint | null;
  anchorLngLat?: LngLatLike | null;
  width: number;
  height: number;
  safeMargin: number;
}): BubbleLayout | null {
  const {
    map,
    anchorScreenPoint,
    anchorLngLat,
    width,
    height,
    safeMargin,
  } = params;

  const originalAnchor = anchorScreenPoint
    ? getAnchorViewportPoint({ map, anchorScreenPoint })
    : null;
  const originalTrackingAnchor = map && anchorScreenPoint
    ? (() => {
        const containerRect = map.getContainer().getBoundingClientRect();
        return {
          x: containerRect.left + (anchorScreenPoint.trackingX ?? anchorScreenPoint.x),
          y: containerRect.top + (anchorScreenPoint.trackingY ?? anchorScreenPoint.y),
        };
      })()
    : originalAnchor;
  const liveAnchor = anchorLngLat
    ? getAnchorViewportPoint({ map, anchorLngLat })
    : null;
  const anchor = originalAnchor ?? liveAnchor;
  if (!anchor) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (
    anchor.x < -160 ||
    anchor.y < -160 ||
    anchor.x > viewportWidth + 160 ||
    anchor.y > viewportHeight + 160
  ) {
    return null;
  }

  const minLeft = safeMargin;
  const maxLeft = Math.max(minLeft, viewportWidth - safeMargin - width);
  const minTop = safeMargin;
  const maxTop = Math.max(minTop, viewportHeight - safeMargin - height);

  const rightControlsSafeLeft = viewportWidth - RIGHT_CONTROLS_GUARD_WIDTH;
  const anchorClearanceX = clamp(Number(anchor.clearanceX ?? 0), 0, 260);
  const rawRightLeft = anchor.x + anchorClearanceX + GAP_FROM_AVATAR + ARROW_SIZE;
  const rawLeftLeft = anchor.x - anchorClearanceX - GAP_FROM_AVATAR - ARROW_SIZE - width;
  const rightSpace = rightControlsSafeLeft - rawRightLeft;
  const leftSpace = rawLeftLeft - minLeft + width;
  const placement: Placement =
    rightSpace >= width || leftSpace < width * 0.64
      ? "right"
      : "left";
  const rawLeft = placement === "right" ? rawRightLeft : rawLeftLeft;
  const left = clamp(rawLeft, minLeft, maxLeft);
  const top = clamp(anchor.y - height / 2, minTop, maxTop);

  const initialLayout: BubbleLayout = {
    placement,
    left: Math.round(left),
    top: Math.round(top),
    arrowY: Math.round(clamp(anchor.y - top, ARROW_SAFE_PADDING, height - ARROW_SAFE_PADDING)),
  };

  if (!originalAnchor || !originalTrackingAnchor || !liveAnchor) return initialLayout;

  // Lock the popup's initial side and spacing to the selected avatar. Camera
  // movement only translates the whole layout by the avatar's exact screen
  // delta: there is no viewport clamping, side switching or auto-recentering.
  return {
    ...initialLayout,
    left: initialLayout.left + liveAnchor.x - originalTrackingAnchor.x,
    top: initialLayout.top + liveAnchor.y - originalTrackingAnchor.y,
  };
}

export function HoverPreProfileBubble({
  map,
  visible,
  anchorScreenPoint,
  anchorLngLat,
  cameraActive = false,
  hideDuringCamera = true,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  safeMargin = DEFAULT_SAFE_MARGIN,
  children,
  onPointerEnter,
  onPointerLeave,
}: HoverPreProfileBubbleProps) {
  const [mounted, setMounted] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const shouldShow = Boolean(
    mounted &&
    visible &&
    (anchorScreenPoint || anchorLngLat) &&
    !(hideDuringCamera && cameraActive),
  );
  const layout = shouldShow
    ? computeBubbleLayout({
      map,
      anchorScreenPoint,
      anchorLngLat,
      width,
      height,
      safeMargin,
    })
    : null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!map || !visible || !anchorScreenPoint || !anchorLngLat) return;

    let baseLayout = computeBubbleLayout({
      map,
      anchorScreenPoint,
      anchorLngLat: null,
      width,
      height,
      safeMargin,
    });
    let lastLeft: number | null = null;
    let lastTop: number | null = null;
    let lastArrowY: number | null = null;
    let lastPlacement: Placement | null = null;

    const followSelectedAvatar = () => {
      const bubble = bubbleRef.current;
      if (!bubble || !baseLayout) return;

      // Camera movement only changes the projected map point. Reusing the
      // initial clamped layout avoids a forced DOM measurement and a complete
      // popup layout calculation on every rendered MapLibre frame.
      const projected = map.project(anchorLngLat);
      const trackingX = anchorScreenPoint.trackingX ?? anchorScreenPoint.x;
      const trackingY = anchorScreenPoint.trackingY ?? anchorScreenPoint.y;
      const nextLeft = Math.round(baseLayout.left + projected.x - trackingX);
      const nextTop = Math.round(baseLayout.top + projected.y - trackingY);

      if (nextLeft !== lastLeft) {
        bubble.style.setProperty("--mw-bubble-x", `${nextLeft}px`);
        lastLeft = nextLeft;
      }
      if (nextTop !== lastTop) {
        bubble.style.setProperty("--mw-bubble-y", `${nextTop}px`);
        lastTop = nextTop;
      }
      if (baseLayout.arrowY !== lastArrowY) {
        bubble.style.setProperty("--mw-arrow-y", `${baseLayout.arrowY}px`);
        lastArrowY = baseLayout.arrowY;
      }
      if (baseLayout.placement !== lastPlacement) {
        bubble.dataset.placement = baseLayout.placement;
        lastPlacement = baseLayout.placement;
      }
    };

    const refreshBaseLayout = () => {
      baseLayout = computeBubbleLayout({
        map,
        anchorScreenPoint,
        anchorLngLat: null,
        width,
        height,
        safeMargin,
      });
      lastLeft = null;
      lastTop = null;
      lastArrowY = null;
      lastPlacement = null;
      followSelectedAvatar();
    };

    map.on("move", followSelectedAvatar);
    map.on("resize", refreshBaseLayout);
    followSelectedAvatar();

    return () => {
      map.off("move", followSelectedAvatar);
      map.off("resize", refreshBaseLayout);
    };
  }, [anchorLngLat, anchorScreenPoint, height, map, safeMargin, visible, width]);

  if (!mounted) return null;

  const placement = layout?.placement ?? "right";
  const style = {
    "--mw-bubble-x": `${layout?.left ?? -9999}px`,
    "--mw-bubble-y": `${layout?.top ?? -9999}px`,
    "--mw-bubble-w": `${width}px`,
    "--mw-bubble-h": `${height}px`,
    "--mw-arrow-y": `${layout?.arrowY ?? height / 2}px`,
  } as CSSProperties;

  return createPortal(
    <div
      ref={bubbleRef}
      className={[
        "mw-hover-preprofile-bubble",
        shouldShow && layout ? "is-visible" : "is-hidden",
      ].join(" ")}
      data-placement={placement}
      style={style}
      aria-hidden={!shouldShow || !layout}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <PreProfileFrame arrow>{children}</PreProfileFrame>
    </div>,
    document.body,
  );
}
