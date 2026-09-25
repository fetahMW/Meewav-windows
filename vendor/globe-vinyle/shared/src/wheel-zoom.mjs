// Physical mouse-wheel curve ported from Meewav-Web at aaa454b0f4afc979b3d66eecca2ac8b0d137f942:
// camera/criticalWheelZoom.ts and installGoogleEarthWheelInertia in GlobeMapV2.tsx.
// Zoom steps use log2 scale: +1 halves the laboratory camera height.
const RATE = 1 / 320;
const MIN_IMPULSE = 100;
const DRAG = 6.5;
const IMPULSE_VELOCITY = 18;
const MAX_SPEED = 7.5;
const STOP_SPEED = 0.05;
const STALL_MS = 180;
const WHEEL_SIGNATURE = 4.000244140625;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function getSigmoidWheelZoomDelta(delta, rate = RATE) {
  if (!Number.isFinite(delta) || delta === 0 || !Number.isFinite(rate) || rate <= 0) return 0;
  const scale = 2 / (1 + Math.exp(-Math.abs(delta * rate)));
  return Math.sign(delta) * Math.log2(scale);
}

export function stepExponentialWheelCoast(velocity, seconds) {
  const nextVelocity = velocity * Math.exp(-DRAG * seconds);
  return { displacement: (velocity - nextVelocity) / DRAG, velocity: nextVelocity };
}

export function getWheelZoomInput(event) {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return null;
  let delta = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 40 : 1);
  const signature = delta / WHEEL_SIGNATURE;
  const legacy = Math.abs(event.wheelDeltaY ?? event.wheelDelta ?? 0);
  const definiteWheel = event.deltaMode === 1
    || Math.abs(signature - Math.round(signature)) < 0.000001
    || (legacy >= 120 && Math.abs(legacy / 120 - Math.round(legacy / 120)) < 0.000001);
  // Same notch detection as the reference, including high-resolution Windows mice.
  // Ctrl+wheel from a touchpad pinch keeps the direct input path.
  const trackpad = event.ctrlKey === true
    || (!definiteWheel && event.deltaMode === 0 && Math.abs(event.deltaY) < WHEEL_SIGNATURE);
  if (!trackpad) delta = Math.max(delta, MIN_IMPULSE);
  if (event.shiftKey) delta /= 4;
  return { trackpad, impulse: getSigmoidWheelZoomDelta(-Math.sign(event.deltaY) * delta) };
}

// applyZoom returns the actually applied log2 displacement, allowing the coast
// to stop at camera limits. The anchor is supplied by the renderer, not the DOM.
export function createWheelZoom({ applyZoom, reducedMotion = false }) {
  let velocity = 0;
  let pendingImpulse = 0;
  let lastFrameTime = null;
  let anchor = null;

  function cancel() {
    velocity = 0;
    pendingImpulse = 0;
    lastFrameTime = null;
    anchor = null;
  }

  return {
    cancel,
    isMoving: () => velocity !== 0 || pendingImpulse !== 0,
    input(event, nextAnchor, viewportHeight = 1) {
      const input = getWheelZoomInput(event);
      if (!input) return false;
      if (input.trackpad) {
        cancel();
        // Preserve the laboratory's existing direct trackpad/pinch response.
        const delta = clamp(event.deltaY
          * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportHeight : 1), -300, 300);
        applyZoom(Math.exp(delta * 0.0025), nextAnchor);
      } else if (reducedMotion) {
        cancel();
        applyZoom(2 ** (-clamp(input.impulse * IMPULSE_VELOCITY, -MAX_SPEED, MAX_SPEED) / DRAG), nextAnchor);
      } else {
        anchor = nextAnchor;
        // Accumulate per-event impulses; do not lose notches delivered in one frame.
        pendingImpulse += input.impulse;
      }
      return true;
    },
    tick(now) {
      if (velocity === 0 && pendingImpulse === 0) return;
      const elapsed = lastFrameTime === null ? 0 : now - lastFrameTime;
      if (elapsed > STALL_MS) velocity = 0;
      velocity = clamp(velocity + pendingImpulse * IMPULSE_VELOCITY, -MAX_SPEED, MAX_SPEED);
      pendingImpulse = 0;
      if (velocity === 0) {
        cancel();
        return;
      }
      const seconds = lastFrameTime === null || elapsed > STALL_MS
        ? 1 / 60 : clamp(elapsed / 1000, 0.001, STALL_MS / 1000);
      lastFrameTime = now;
      const step = stepExponentialWheelCoast(velocity, seconds);
      const applied = applyZoom(2 ** -step.displacement, anchor);
      velocity = step.velocity;
      if (Math.abs(applied - step.displacement) > 0.000001 || Math.abs(velocity) <= STOP_SPEED) cancel();
    },
  };
}
