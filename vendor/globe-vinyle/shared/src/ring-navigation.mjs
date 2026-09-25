import * as T from 'three';
import { createRingFlight } from './ring-flight.mjs';
import { RING_PORTRAIT_LANES } from './saturn-ring.mjs';

// A separate navigation mode on the existing ring surface and renderer.
export function createRingNavigation(camera, ring, reducedMotion) {
  const ringState = ring.state();
  const normal = new T.Vector3().fromArray(ringState.normal).normalize();
  const target = new T.PerspectiveCamera();
  const flight = createRingFlight(camera, ring);
  let returning = false, onReturned = null;
  let active = false, angle = Math.PI / 2, across = RING_PORTRAIT_LANES.centers[0], heading = 0, elevation = 2.8;
  let transition = 0, dirty = false, pointer = null;
  function pose() {
    const surface = ring.surfaceAt(angle, across);
    const forward = surface.forward.clone().addScaledVector(normal, -surface.forward.dot(normal)).normalize();
    forward.applyAxisAngle(normal, heading);
    target.position.copy(surface.position).addScaledVector(normal, elevation);
    target.up.copy(normal);
    target.lookAt(surface.position.clone().addScaledVector(forward, 20).addScaledVector(normal, 0.6));
  }
  return {
    get active() { return active; },
    get returning() { return returning; },
    get returnProgress() { return flight.progress(transition); },
    get entryProgress() { return transition; },
    restore(snapshot) {
      angle = T.MathUtils.euclideanModulo(snapshot.angle, Math.PI * 2);
      across = T.MathUtils.clamp(snapshot.across, 0.06, 0.94);
      heading = snapshot.heading; elevation = snapshot.elevation;
      active = true; returning = false; transition = 1; dirty = true;
      pointer = null; onReturned = null;
    },
    enter() {
      // Start on the innermost populated band, including after the visitor
      // previously moved across the disc. Other bands remain freely accessible.
      across = RING_PORTRAIT_LANES.centers[0];
      // Enter the visible side of the ring, not the last visited point on its
      // opposite side. Preserve the familiar forward-facing approach in front.
      angle = T.MathUtils.euclideanModulo(flight.angleAt(camera.position), Math.PI * 2);
      const homeTurn = T.MathUtils.euclideanModulo(Math.PI / 2 - angle + Math.PI, Math.PI * 2) - Math.PI;
      heading = flight.sectorAt(camera.position) === 0 || homeTurn >= 0 ? 0 : Math.PI;
      pose();
      flight.begin(target, 'enter');
      active = true; returning = false; onReturned = null;
      transition = reducedMotion ? 1 : 0; dirty = true; pointer = null;
    },
    returnTo(destinationCamera, complete) {
      if (!active || returning) return;
      flight.begin(destinationCamera, 'return');
      returning = true; onReturned = complete; pointer = null;
      transition = reducedMotion ? 1 : 0; dirty = true;
    },
    exit() { active = returning = false; pointer = null; onReturned = null; },
    cancel() { pointer = null; },
    down(event) {
      if (pointer || returning) return;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moving: false, rotate: event.button === 2 || event.ctrlKey };
    },
    move(event, width, height) {
      if (returning || !pointer || pointer.id !== event.pointerId) return;
      // A press during entry remains usable after landing. Do not accumulate
      // movement from the transition and jump when the camera arrives.
      if (transition < 1) {
        pointer.x = pointer.startX = event.clientX; pointer.y = pointer.startY = event.clientY;
        return;
      }
      if (!pointer.moving && Math.hypot(event.clientX-pointer.startX, event.clientY-pointer.startY) < 6) return;
      pointer.moving = true;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
      if (pointer.rotate) heading = T.MathUtils.euclideanModulo(heading - dx / Math.max(300, width) * Math.PI * 2, Math.PI * 2);
      else {
        // A horizontal pull always travels around the ring, even at a band edge.
        // Vertical dragging chooses a lane independently of the viewing heading.
        const scale = 125 / Math.max(300, Math.min(width, height));
        const radius = T.MathUtils.lerp(ringState.innerRadius, ringState.outerRadius, across);
        angle = T.MathUtils.euclideanModulo(angle + dx*scale/radius, Math.PI*2);
        across = T.MathUtils.clamp(across - dy*0.8/Math.max(300, height), 0.06, 0.94);
      }
      dirty = true;
    },
    up(event) { if (pointer?.id === event.pointerId) pointer = null; },
    wheel(delta) {
      if (transition < 1 || returning) return;
      angle = T.MathUtils.euclideanModulo(angle + T.MathUtils.clamp(delta, -160, 160) * 0.0007, Math.PI * 2);
      dirty = true;
    },
    key(key) {
      if (transition < 1 || returning) return false;
      if (key === 'ArrowUp' || key === 'ArrowDown') angle += key === 'ArrowUp' ? 0.025 : -0.025;
      else if (key === 'ArrowLeft' || key === 'ArrowRight') heading += key === 'ArrowLeft' ? 0.12 : -0.12;
      else return false;
      angle = T.MathUtils.euclideanModulo(angle, Math.PI * 2); dirty = true; return true;
    },
    tick(dt, force = false) {
      if (!active || (!dirty && transition >= 1 && !force)) return false;
      transition = Math.min(1, transition + Math.min(Math.max(dt, 0), 0.05) / flight.duration);
      if (returning || transition < 1) {
        flight.sample(transition);
      } else {
        pose();
        camera.position.copy(target.position);
        camera.quaternion.copy(target.quaternion);
        camera.up.copy(normal);
      }
      camera.near = 0.03; camera.far = 900;
      camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      dirty = false;
      if (returning && transition >= 1) {
        const complete = onReturned;
        active = returning = false; onReturned = null;
        complete?.();
      }
      return true;
    },
    state: () => ({ active, returning, angle, across, heading, elevation,
      flight: active && (returning || transition < 1) ? flight.state() : null }),
  };
}
