export const ORBIT_INERTIA_FRAME_MS = 1000 / 60;
export const ORBIT_INERTIA_DECAY_PER_FRAME = 0.91;
export const ORBIT_INERTIA_STOP_VELOCITY = 0.0025;

export function getEllipsePointerAngleDeg(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
) {
  if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) return 0;
  return Math.atan2((y - cy) / ry, (x - cx) / rx) * 180 / Math.PI;
}

export function getShortestSignedAngleDeg(nextAngleDeg: number, previousAngleDeg: number) {
  return ((nextAngleDeg - previousAngleDeg + 540) % 360) - 180;
}

export function getOrbitDepth(angleDeg: number) {
  return clamp01((Math.sin(angleDeg * Math.PI / 180) + 1) / 2);
}

export function getOrbitPerspectiveScale(depth: number) {
  return 0.84 + clamp01(depth) * 0.16;
}

export function getOrbitPerspectiveOpacity(depth: number) {
  return 0.58 + clamp01(depth) * 0.42;
}

export function dampOrbitVelocity(velocityDegPerMs: number, deltaMs: number) {
  const safeDeltaMs = Math.max(0, Math.min(deltaMs, 50));
  return velocityDegPerMs * Math.pow(
    ORBIT_INERTIA_DECAY_PER_FRAME,
    safeDeltaMs / ORBIT_INERTIA_FRAME_MS,
  );
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}
