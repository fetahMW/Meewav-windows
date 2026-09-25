import {
  cloneElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  type Ref,
} from "react";
import { createPortal } from "react-dom";
import { Sparkles } from "lucide-react";
import "./meewav-tooltip.css";

type TooltipPlacement = "top" | "bottom";

type TooltipTriggerProps = {
  "aria-describedby"?: string;
  onBlur?: FocusEventHandler<HTMLElement>;
  onFocus?: FocusEventHandler<HTMLElement>;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
  onMouseEnter?: MouseEventHandler<HTMLElement>;
  onMouseLeave?: MouseEventHandler<HTMLElement>;
  ref?: Ref<HTMLElement>;
  title?: string;
};

type MeewavTooltipProps = {
  children: ReactElement<TooltipTriggerProps>;
  content: ReactNode;
  hoverDelay?: number;
  placement?: TooltipPlacement;
};

type TooltipPosition = {
  arrowLeft: number;
  left: number;
  placement: TooltipPlacement;
  top: number;
};

type TooltipStyle = CSSProperties & {
  "--meewav-tooltip-arrow-left": string;
};

const VIEWPORT_GAP = 12;
const TRIGGER_GAP = 12;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) ref.current = value;
}

export default function MeewavTooltip({
  children,
  content,
  hoverDelay = 320,
  placement: preferredPlacement = "top",
}: MeewavTooltipProps) {
  const generatedId = useId().replace(/:/g, "");
  const tooltipId = `meewav-tooltip-${generatedId}`;
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const childProps = children.props;

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current === null) return;
    window.clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const closeTooltip = useCallback(() => {
    clearHoverTimer();
    setOpen(false);
  }, [clearHoverTimer]);

  const setTriggerRef = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
    assignRef(childProps.ref, node);
  }, [childProps.ref]);

  const handleMouseEnter: MouseEventHandler<HTMLElement> = (event) => {
    childProps.onMouseEnter?.(event);
    hoveredRef.current = true;
    clearHoverTimer();
    hoverTimerRef.current = window.setTimeout(() => {
      hoverTimerRef.current = null;
      if (hoveredRef.current) setOpen(true);
    }, hoverDelay);
  };

  const handleMouseLeave: MouseEventHandler<HTMLElement> = (event) => {
    childProps.onMouseLeave?.(event);
    hoveredRef.current = false;
    clearHoverTimer();
    if (!focusedRef.current) setOpen(false);
  };

  const handleFocus: FocusEventHandler<HTMLElement> = (event) => {
    childProps.onFocus?.(event);
    focusedRef.current = true;
    clearHoverTimer();
    setOpen(true);
  };

  const handleBlur: FocusEventHandler<HTMLElement> = (event) => {
    childProps.onBlur?.(event);
    focusedRef.current = false;
    if (!hoveredRef.current) closeTooltip();
  };

  const handleKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    childProps.onKeyDown?.(event);
    if (event.key !== "Escape") return;
    hoveredRef.current = false;
    closeTooltip();
  };

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  useEffect(() => {
    if (!open) return undefined;
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      hoveredRef.current = false;
      closeTooltip();
    };
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [closeTooltip, open]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }

    let animationFrame = 0;

    const updatePosition = () => {
      animationFrame = 0;
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      if (
        triggerRect.bottom < 0
        || triggerRect.top > window.innerHeight
        || triggerRect.right < 0
        || triggerRect.left > window.innerWidth
      ) {
        closeTooltip();
        return;
      }

      const tooltipRect = tooltip.getBoundingClientRect();
      const tooltipWidth = tooltip.offsetWidth || tooltipRect.width || 280;
      const tooltipHeight = tooltip.offsetHeight || tooltipRect.height || 52;
      const spaceAbove = triggerRect.top - VIEWPORT_GAP;
      const spaceBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_GAP;
      let placement = preferredPlacement;

      if (
        preferredPlacement === "top"
        && spaceAbove < tooltipHeight + TRIGGER_GAP
        && spaceBelow > spaceAbove
      ) {
        placement = "bottom";
      } else if (
        preferredPlacement === "bottom"
        && spaceBelow < tooltipHeight + TRIGGER_GAP
        && spaceAbove > spaceBelow
      ) {
        placement = "top";
      }

      const triggerCenter = triggerRect.left + triggerRect.width / 2;
      const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - tooltipWidth - VIEWPORT_GAP);
      const left = Math.min(
        Math.max(VIEWPORT_GAP, triggerCenter - tooltipWidth / 2),
        maxLeft,
      );
      const maxTop = Math.max(VIEWPORT_GAP, window.innerHeight - tooltipHeight - VIEWPORT_GAP);
      const desiredTop = placement === "top"
        ? triggerRect.top - tooltipHeight - TRIGGER_GAP
        : triggerRect.bottom + TRIGGER_GAP;
      const top = Math.min(Math.max(VIEWPORT_GAP, desiredTop), maxTop);
      const arrowInset = Math.min(22, tooltipWidth / 2);
      const arrowLeft = Math.min(
        Math.max(triggerCenter - left, arrowInset),
        tooltipWidth - arrowInset,
      );

      setPosition((current) => {
        if (
          current
          && current.arrowLeft === arrowLeft
          && current.left === left
          && current.placement === placement
          && current.top === top
        ) {
          return current;
        }
        return { arrowLeft, left, placement, top };
      });
    };

    const schedulePositionUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updatePosition);
    };

    updatePosition();
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, { capture: true, passive: true });
    window.visualViewport?.addEventListener("resize", schedulePositionUpdate);
    window.visualViewport?.addEventListener("scroll", schedulePositionUpdate);

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(schedulePositionUpdate);
    if (triggerRef.current) resizeObserver?.observe(triggerRef.current);
    if (tooltipRef.current) resizeObserver?.observe(tooltipRef.current);

    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
      window.visualViewport?.removeEventListener("resize", schedulePositionUpdate);
      window.visualViewport?.removeEventListener("scroll", schedulePositionUpdate);
    };
  }, [closeTooltip, open, preferredPlacement]);

  const existingDescription = childProps["aria-describedby"];
  const describedBy = open
    ? [existingDescription, tooltipId].filter(Boolean).join(" ")
    : existingDescription;
  const tooltipStyle = position ? {
    top: position.top,
    left: position.left,
    "--meewav-tooltip-arrow-left": `${position.arrowLeft}px`,
  } as TooltipStyle : undefined;

  return (
    <>
      {cloneElement(children, {
        "aria-describedby": describedBy,
        onBlur: handleBlur,
        onFocus: handleFocus,
        onKeyDown: handleKeyDown,
        onMouseEnter: handleMouseEnter,
        onMouseLeave: handleMouseLeave,
        ref: setTriggerRef,
        title: undefined,
      })}
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          className="meewav-tooltip"
          role="tooltip"
          data-placement={position?.placement ?? preferredPlacement}
          style={tooltipStyle}
        >
          <span className="meewav-tooltip__icon" aria-hidden="true">
            <Sparkles />
          </span>
          <span className="meewav-tooltip__copy">{content}</span>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
