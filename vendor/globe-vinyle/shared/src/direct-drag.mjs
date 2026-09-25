import { shortestLongitudeDelta } from "./camera.mjs";

// Client coordinates are accepted, as in existing pickPoint()/keepPoint().
// The gesture is resolved synchronously. Substeps are geometry calculations,
// not animation frames, and introduce no easing or delayed movement.
export function applyDirectDrag({
  view,
  motion,
  dragState,
  from,
  to,
  pickPoint,
  keepPoint,
  updateCamera,
}) {
  const dx = to.x - from.x,
    dy = to.y - from.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0))
    return { steps: 0, solved: 0, fallback: 0 };
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 8));
  let previous = from,
    solved = 0,
    fallback = 0;
  for (let step = 1; step <= steps; step++) {
    const next = {
      x: from.x + (dx * step) / steps,
      y: from.y + (dy * step) / steps,
    };
    const anchor = dragState.anchor || pickPoint(previous.x, previous.y);
    dragState.anchor = anchor;
    const originalLon = view.lon,
      originalLat = view.lat;
    let dl,
      dp,
      didAnchor = false;
    if (anchor && keepPoint({ x: next.x, y: next.y, point: anchor })) {
      dl = shortestLongitudeDelta(originalLon, view.lon);
      dp = view.lat - originalLat;
      solved++;
      didAnchor = true;
    } else {
      // Continuous fallback consumes every CSS pixel, including off-globe drags.
      // No event-dependent angular cap: the same distance gives the same motion.
      const speed = Math.min(0.22, (view.height / 100) * 0.3);
      const bearing = (view.bearing || 0) * Math.PI / 180;
      const sx = next.x - previous.x, sy = next.y - previous.y;
      dl = (-sx * Math.cos(bearing) + sy * Math.sin(bearing)) * speed;
      dp = (sy * Math.cos(bearing) + sx * Math.sin(bearing)) * speed;
      fallback++;
    }
    view.lon = originalLon;
    view.lat = originalLat;
    motion.drag(dl, dp);
    updateCamera();
    if (!didAnchor) {
      dragState.anchor = pickPoint(next.x, next.y);
    }
    previous = next;
  }
  return { steps, solved, fallback };
}
