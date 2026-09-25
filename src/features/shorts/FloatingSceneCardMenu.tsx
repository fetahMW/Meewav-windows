import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

type FloatingSceneCardMenuProps = {
  anchorRef: RefObject<HTMLButtonElement | null>;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
  id: string;
  open: boolean;
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onRequestClose: () => void;
  preferredMaxHeight?: number;
  preferredWidth?: number;
};

const VIEWPORT_GAP = 12;

export default function FloatingSceneCardMenu({
  anchorRef,
  ariaLabel,
  children,
  className,
  id,
  open,
  onKeyDown,
  onRequestClose,
  preferredMaxHeight = 390,
  preferredWidth = 260,
}: FloatingSceneCardMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closingForScrollRef = useRef(false);
  const onRequestCloseRef = useRef(onRequestClose);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  useLayoutEffect(() => {
    onRequestCloseRef.current = onRequestClose;
  }, [onRequestClose]);

  useLayoutEffect(() => {
    if (!open) {
      closingForScrollRef.current = false;
      setPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const width = Math.min(preferredWidth, window.innerWidth - VIEWPORT_GAP * 2);
      const desiredHeight = Math.min(
        preferredMaxHeight,
        window.innerHeight - VIEWPORT_GAP * 2,
      );
      const measuredHeight = Math.min(
        menuRef.current?.scrollHeight || desiredHeight,
        desiredHeight,
      );
      const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP;
      const spaceAbove = rect.top - VIEWPORT_GAP;
      const opensAbove = spaceBelow < Math.min(240, measuredHeight) && spaceAbove > spaceBelow;
      const availableHeight = Math.max(120, opensAbove ? spaceAbove : spaceBelow);
      const maxHeight = Math.min(desiredHeight, availableHeight);
      const renderedHeight = Math.min(measuredHeight, maxHeight);
      const top = opensAbove
        ? Math.max(VIEWPORT_GAP, rect.top - renderedHeight - 8)
        : Math.min(rect.bottom + 8, window.innerHeight - renderedHeight - VIEWPORT_GAP);
      const left = Math.min(
        Math.max(VIEWPORT_GAP, rect.right - width),
        window.innerWidth - width - VIEWPORT_GAP,
      );

      setPosition((current) => {
        if (
          current
          && current.top === top
          && current.left === left
          && current.width === width
          && current.maxHeight === maxHeight
        ) {
          return current;
        }
        return { top, left, width, maxHeight };
      });
    };

    const closeWhenPageMoves = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      if (closingForScrollRef.current) return;
      closingForScrollRef.current = true;
      onRequestCloseRef.current();
    };

    closingForScrollRef.current = false;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", closeWhenPageMoves, { capture: true, passive: true });

    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", closeWhenPageMoves, true);
    };
  }, [anchorRef, open, preferredMaxHeight, preferredWidth]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={menuRef}
      id={id}
      className={`shorts-card-menu is-floating scene-card-floating-menu${className ? ` ${className}` : ""}`}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      style={position ?? { visibility: "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
