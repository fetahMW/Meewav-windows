import * as T from 'three';
import { RADIUS, xyz, lonlat } from './geo.mjs';

// The globe uses a turntable gesture. A geographic screen anchor becomes
// ill-conditioned at the silhouette and poles, so reserve it for local maps.
export const AXIS_GLOBE_MIN_HEIGHT = 70;

export function globeDragSpeed(camera, viewportHeight) {
  const distance = Math.max(RADIUS + 0.01, camera.position.length());
  const focalLength = Math.max(1, viewportHeight) / (2 * Math.tan(camera.fov * Math.PI / 360));
  const projectedRadius = focalLength * RADIUS / Math.sqrt(distance * distance - RADIUS * RADIUS);
  return Math.max(0.02, Math.min(0.4, 180 / (Math.PI * Math.max(1, projectedRadius))));
}

export function createGlobeDrag({ motion, axis, updateCamera, align = null }) {
  // One fixed axle for the globe and its physical ring. Rotating geographical
  // longitude alone or rebuilding camera.up from north makes the tilted ring roll.
  const axle = new T.Vector3().fromArray(axis).normalize();
  const radial = new T.Vector3(), heading = new T.Vector3();
  const east = new T.Vector3(), north = new T.Vector3(), tiltAxis = new T.Vector3();
  const rotation = new T.Quaternion();
  const alignInv = align ? align.clone().invert() : null;
  const radians = Math.PI / 180;
  function geographicBasis(lon, lat) {
    east.set(Math.cos(lon), 0, -Math.sin(lon));
    north.set(-Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon));
  }
  return ({ from, to, speed }) => {
    const dx = to.x - from.x, dy = to.y - from.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    const view = motion.view;
    radial.fromArray(xyz(view.lon, view.lat, 1));
    geographicBasis(view.lon * radians, view.lat * radians);
    const bearing = (view.bearing || 0) * radians;
    heading.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
    if (align) {
      radial.applyQuaternion(align);
      heading.applyQuaternion(align);
    }

    // Transport the entire camera frame, including its up vector. A horizontal
    // revolution preserves the ring's inclination and returns to the same pose.
    rotation.setFromAxisAngle(axle, -dx * speed * radians);
    radial.applyQuaternion(rotation);
    heading.applyQuaternion(rotation);
    const elevation = Math.asin(T.MathUtils.clamp(radial.dot(axle), -1, 1));
    const limit = Math.max(80 * radians, Math.abs(elevation));
    const nextElevation = T.MathUtils.clamp(elevation + dy * speed * radians, -limit, limit);
    tiltAxis.crossVectors(axle, radial);
    if (tiltAxis.lengthSq() > 1e-12 && nextElevation !== elevation) {
      rotation.setFromAxisAngle(tiltAxis.normalize(), elevation - nextElevation);
      radial.applyQuaternion(rotation);
      heading.applyQuaternion(rotation);
    }
    if (alignInv) {
      radial.applyQuaternion(alignInv);
      heading.applyQuaternion(alignInv);
    }
    const [lon, lat] = lonlat(radial.x, radial.y, radial.z);
    geographicBasis(lon * radians, lat * radians);
    motion.rotateTo({ lon, lat, bearing: Math.atan2(heading.dot(east), heading.dot(north)) / radians });
    updateCamera();
  };
}
