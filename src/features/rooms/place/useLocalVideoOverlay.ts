import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";

type Position = { x: number; y: number };
type Bounds = { width: number; height: number; itemWidth: number; itemHeight: number };
const inset = 10;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const endPosition = { x: 1, y: 1 };

function readPosition(key: string): Position {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) return { x: clamp(value.x), y: clamp(value.y) };
  } catch { /* A restricted browser may refuse local preferences. */ }
  return endPosition;
}

/** A viewer preference only. Never sends layout changes to the room director. */
export function useLocalVideoOverlay(container: RefObject<HTMLElement | null>, item: RefObject<HTMLElement | null>, enabled: boolean, viewerId: string) {
  const key = `meewav:cage:host-overlay:v1:${viewerId}`;
  const [position, setPosition] = useState<Position>(() => readPosition(key));
  const positionRef = useRef(position);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const update = (next: Position, persist = false) => {
    positionRef.current = next;
    setPosition(next);
    if (persist) try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Keep the in-memory preference. */ }
  };
  useLayoutEffect(() => { positionRef.current = readPosition(key); setPosition(positionRef.current); drag.current = null; setDragging(false); }, [key]);
  useLayoutEffect(() => {
    if (!enabled || !container.current || !item.current) { setBounds(null); drag.current = null; setDragging(false); return; }
    const measure = () => {
      const area = container.current?.getBoundingClientRect();
      const tile = item.current?.getBoundingClientRect();
      if (area && tile) setBounds({ width: area.width, height: area.height, itemWidth: tile.width, itemHeight: tile.height });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container.current);
    observer.observe(item.current);
    return () => observer.disconnect();
  }, [container, item, enabled]);
  const paddingX = bounds ? Math.min(inset, Math.max(0, (bounds.width - bounds.itemWidth) / 2)) : inset;
  const paddingY = bounds ? Math.min(inset, Math.max(0, (bounds.height - bounds.itemHeight) / 2)) : inset;
  const rangeX = bounds ? Math.max(0, bounds.width - bounds.itemWidth - paddingX * 2) : 0;
  const rangeY = bounds ? Math.max(0, bounds.height - bounds.itemHeight - paddingY * 2) : 0;
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    update(positionRef.current, true);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return {
    dragging,
    style: enabled && bounds ? { left: paddingX + position.x * rangeX, top: paddingY + position.y * rangeY, right: "auto", bottom: "auto" } as CSSProperties : undefined,
    handleProps: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (!enabled || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, x: positionRef.current.x, y: positionRef.current.y };
        setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const start = drag.current;
        if (!start || start.id !== event.pointerId) return;
        update({ x: rangeX ? clamp(start.x + (event.clientX - start.startX) / rangeX) : 0, y: rangeY ? clamp(start.y + (event.clientY - start.startY) / rangeY) : 0 });
      },
      onPointerUp: finish,
      onPointerCancel: finish,
      onLostPointerCapture: finish,
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        const step = event.shiftKey ? 40 : 10;
        const offsets: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        const offset = offsets[event.key];
        if (!offset || !enabled) return;
        event.preventDefault();
        update({ x: rangeX ? clamp(positionRef.current.x + offset[0] / rangeX) : 0, y: rangeY ? clamp(positionRef.current.y + offset[1] / rangeY) : 0 }, true);
      },
    },
  };
}
