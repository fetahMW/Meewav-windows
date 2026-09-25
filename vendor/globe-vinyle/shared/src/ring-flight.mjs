import * as T from 'three';

const TAU = Math.PI * 2, FRONT = Math.PI / 2;
const wrap = angle => T.MathUtils.euclideanModulo(angle + Math.PI, TAU) - Math.PI;
const ease = t => t * t * t * (t * (6 * t - 15) + 10);
const smooth = (start, end, t) => T.MathUtils.smoothstep(t, start, end);

// A camera route in the ring's fixed frame. Position and gaze follow the
// planet together, rather than independently interpolating world quaternions.
export function createRingFlight(camera, ring) {
  const normal = new T.Vector3().fromArray(ring.state().normal).normalize();
  const axisX = ring.surfaceAt(0, 0.5).position;
  axisX.addScaledVector(normal, -axisX.dot(normal)).normalize();
  const axisZ = new T.Vector3().crossVectors(axisX, normal).normalize();
  const forward = new T.Vector3(), right = new T.Vector3(), alignedUp = new T.Vector3();
  const actualUp = new T.Vector3(), lookAt = new T.Vector3(), tangent = new T.Vector3();
  let route = null;

  function angleAt(point) {
    const x = point.dot(axisX), z = point.dot(axisZ);
    return x * x + z * z > 1e-12 ? Math.atan2(z, x) : FRONT;
  }
  function sectorAt(point) {
    return T.MathUtils.euclideanModulo(Math.round(wrap(angleAt(point) - FRONT) / (Math.PI / 2)), 4);
  }
  function polar(point) {
    const radius = point.length();
    return { angle: angleAt(point), radius,
      elevation: Math.asin(T.MathUtils.clamp(point.dot(normal) / Math.max(1e-9, radius), -1, 1)) };
  }
  function alignUp() {
    right.crossVectors(forward, normal);
    if (right.lengthSq() < 1e-12) right.copy(axisX).addScaledVector(forward, -axisX.dot(forward));
    right.normalize(); alignedUp.crossVectors(right, forward).normalize();
  }
  function gaze(source) {
    forward.set(0, 0, -1).applyQuaternion(source.quaternion);
    alignUp();
    actualUp.set(0, 1, 0).applyQuaternion(source.quaternion);
    return { yaw: angleAt(forward), pitch: Math.asin(T.MathUtils.clamp(forward.dot(normal), -1, 1)),
      roll: Math.atan2(actualUp.dot(right), actualUp.dot(alignedUp)) };
  }
  return {
    angleAt,
    sectorAt,
    progress: ease,
    get duration() { return route?.duration || 1.8; },
    begin(destination, kind) {
      const from = polar(camera.position), to = polar(destination.position);
      const startGaze = gaze(camera), endGaze = gaze(destination);
      let turn = wrap(to.angle - from.angle);
      // Exactly opposite France, either half-turn is valid. Follow the side
      // already faced by the visitor, instead of picking an arbitrary axis.
      if (Math.abs(Math.abs(turn) - Math.PI) < 1e-5) {
        tangent.copy(axisX).multiplyScalar(-Math.sin(from.angle)).addScaledVector(axisZ, Math.cos(from.angle));
        forward.set(0, 0, -1).applyQuaternion(camera.quaternion);
        turn = (forward.dot(tangent) < -1e-6 ? -1 : 1) * Math.PI;
      }
      const sector = sectorAt(camera.position);
      route = { kind, sector, from, to, turn,
        duration: kind === 'return' ? 2 + Math.abs(turn) / Math.PI * 1.6
          : 1.8 + Math.abs(wrap(from.angle - FRONT)) / Math.PI * 0.35,
        startPosition: camera.position.clone(), startRotation: camera.quaternion.clone(),
        endPosition: destination.position.clone(), endRotation: destination.quaternion.clone(),
        startYawOffset: wrap(startGaze.yaw - from.angle - Math.PI),
        endYawOffset: wrap(endGaze.yaw - to.angle - Math.PI),
        startPitchOffset: startGaze.pitch + from.elevation,
        endPitchOffset: endGaze.pitch + to.elevation,
        startRoll: startGaze.roll, endRoll: endGaze.roll,
        // An approach from underneath clears the plane while still outside
        // the outer edge, then descends onto the upper walking surface.
        lift: kind === 'enter' && from.elevation < 0 ? -from.elevation + Math.PI / 10 : 0,
      };
    },
    sample(progress) {
      if (!route) return;
      if (progress <= 0 || progress >= 1) {
        camera.position.copy(progress <= 0 ? route.startPosition : route.endPosition);
        camera.quaternion.copy(progress <= 0 ? route.startRotation : route.endRotation);
        camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
        return;
      }
      const t = ease(progress), angle = route.from.angle + route.turn * t;
      // The radius always stays outside the globe. The route revolves around
      // the ring's axle, so a rear return goes around a side, never over a pole.
      const radius = T.MathUtils.lerp(route.from.radius, route.to.radius, t);
      const elevation = T.MathUtils.lerp(route.from.elevation, route.to.elevation, t) + route.lift * Math.sin(Math.PI * t);
      camera.position.copy(axisX).multiplyScalar(Math.cos(angle) * Math.cos(elevation) * radius)
        .addScaledVector(axisZ, Math.sin(angle) * Math.cos(elevation) * radius)
        .addScaledVector(normal, Math.sin(elevation) * radius);

      // Acquire the globe early, before the bulk of the travel. Only turn
      // toward the portraits during the final approach onto the ring.
      const acquire = smooth(0, 0.24, progress);
      const land = smooth(route.kind === 'enter' ? 0.52 : 0.8, 1, progress);
      const yaw = angle + Math.PI + route.startYawOffset * (1 - acquire) + route.endYawOffset * land;
      const pitch = -elevation + route.startPitchOffset * (1 - acquire) + route.endPitchOffset * land;
      const roll = route.startRoll * (1 - acquire) + route.endRoll * land;
      forward.copy(axisX).multiplyScalar(Math.cos(yaw) * Math.cos(pitch))
        .addScaledVector(axisZ, Math.sin(yaw) * Math.cos(pitch)).addScaledVector(normal, Math.sin(pitch)).normalize();
      alignUp();
      camera.up.copy(alignedUp).multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll));
      camera.lookAt(lookAt.copy(camera.position).add(forward));
    },
    state: () => route ? { kind: route.kind, sector: ['front', 'left', 'back', 'right'][route.sector],
      turn: route.turn, duration: route.duration } : null,
  };
}
