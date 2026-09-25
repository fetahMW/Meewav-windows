import * as T from "three";
import { RADIUS, xyz, lonlat } from "./geo.mjs";
import { shortestLongitudeDelta, wrapLongitude } from "./camera.mjs";
const radians = Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Orbit the screen-centre ground point, preserving the camera-to-target distance.
export function createOrbitCameraUpdater(camera, view, align = null) {
  const up = new T.Vector3(), north = new T.Vector3(), east = new T.Vector3();
  const heading = new T.Vector3(), target = new T.Vector3();
  return () => {
    const latitude = view.lat * radians, longitude = view.lon * radians;
    const pitch = (view.pitch || 0) * radians, bearing = (view.bearing || 0) * radians;
    up.fromArray(xyz(view.lon, view.lat, 1));
    east.set(Math.cos(longitude), 0, -Math.sin(longitude));
    north.set(-Math.sin(latitude) * Math.sin(longitude), Math.cos(latitude), -Math.sin(latitude) * Math.cos(longitude));
    heading.copy(north).multiplyScalar(Math.cos(bearing)).addScaledVector(east, Math.sin(bearing));
    target.copy(up).multiplyScalar(RADIUS);
    camera.position.copy(target).addScaledVector(up, view.height * Math.cos(pitch))
      .addScaledVector(heading, -view.height * Math.sin(pitch));
    camera.up.copy(heading).multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch));
    if (align) {
      camera.position.applyQuaternion(align);
      camera.up.applyQuaternion(align);
      target.applyQuaternion(align);
    }
    const clearance = RADIUS + 0.0004;
    if (camera.position.length() < clearance) camera.position.setLength(clearance);
    const altitude = Math.max(0.00002, view.height * Math.cos(pitch));
    // Include the physical outer ring on the far side of the planet, even from ground level.
    const near = Math.max(0.00002, altitude * 0.05), far = camera.position.length() + RADIUS * 2;
    if (camera.near !== near || camera.far !== far) {
      camera.near = near; camera.far = far; camera.updateProjectionMatrix();
    }
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
}

export function isOrbitPointer(event) {
  return event.pointerType === "mouse" && (event.button === 2 || (event.button === 0 && event.ctrlKey === true));
}

// getSmoothRightDragSettings from Meewav-Web, with scene-to-map scale conversion.
export function orbitSettings(view, shortSide = 1000) {
  const worldPerPixel = 2 * view.height * Math.tan(19 * radians) / Math.max(1, shortSide);
  const zoom = Math.log2(2 * Math.PI * RADIUS * Math.cos(view.lat * radians) / (512 * worldPerPixel));
  const t = clamp((zoom - 16.2) / (17.35 - 16.2), 0, 1);
  return { rotation: 0.088 + (0.052 - 0.088) * t, pitch: 0.064 + (0.036 - 0.064) * t, tau: 105 + 40 * t };
}

export function createOrbitGesture(view, reducedMotion = false) {
  let targetPitch = view.pitch, targetBearing = view.bearing;
  let held = false, active = false, shortSide = 1000;
  function cancel() { held = active = false; targetPitch = view.pitch; targetBearing = view.bearing; }
  return {
    cancel,
    setAngles(pitch, bearing) {
      cancel();
      if (Number.isFinite(pitch)) view.pitch = clamp(pitch, 0, 75);
      if (Number.isFinite(bearing)) view.bearing = wrapLongitude(bearing);
      cancel();
    },
    begin(size) { cancel(); held = active = true; shortSide = size; },
    move(dx, dy) {
      if (!held || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
      const settings = orbitSettings(view, shortSide);
      targetBearing = wrapLongitude(targetBearing + dx * settings.rotation);
      targetPitch = clamp(targetPitch - dy * settings.pitch, 0, 75);
      if (reducedMotion) { view.pitch = targetPitch; view.bearing = targetBearing; }
    },
    end() { held = false; },
    reset() {
      held = false; targetPitch = targetBearing = 0; active = true;
      if (reducedMotion) { view.pitch = view.bearing = 0; active = false; }
    },
    tick(seconds) {
      if (!active) return;
      if (seconds > 0.25) { cancel(); return; }
      const alpha = 1 - Math.exp(-Math.max(0, seconds) * 1000 / orbitSettings(view, shortSide).tau);
      const db = shortestLongitudeDelta(view.bearing, targetBearing), dp = targetPitch - view.pitch;
      view.bearing = wrapLongitude(view.bearing + db * alpha); view.pitch += dp * alpha;
      if (!held && Math.abs(db) < 0.015 && Math.abs(dp) < 0.015) {
        view.pitch = targetPitch; view.bearing = targetBearing; active = false;
      }
    },
    isMoving: () => active,
  };
}

// Expanded viewport plus visible spherical horizon; scratch objects are reused.
export function createOrbitViewport(camera, view, unalign = null, align = null) {
  const ray = new T.Raycaster(), hit = new T.Vector3(), screen = new T.Vector2();
  const sphere = new T.Sphere(new T.Vector3(), RADIUS);
  const normal = new T.Vector3(), axis = new T.Vector3(), tangent = new T.Vector3();
  const point = new T.Vector3(), projected = new T.Vector3(), geo = new T.Vector3();
  return () => {
    let west = view.lon, east = view.lon, south = view.lat, north = view.lat;
    const include = p => {
      geo.copy(p);
      if (unalign) geo.applyQuaternion(unalign);
      const [lon, lat] = lonlat(geo.x, geo.y, geo.z);
      const unwrapped = view.lon + shortestLongitudeDelta(view.lon, lon);
      west = Math.min(west, unwrapped); east = Math.max(east, unwrapped);
      south = Math.min(south, lat); north = Math.max(north, lat);
    };
    for (let y = 0; y <= 8; y++) for (let x = 0; x <= 8; x++) {
      ray.setFromCamera(screen.set((x / 4 - 1) * 1.15, (y / 4 - 1) * 1.15), camera);
      sphere.radius = RADIUS;
      if (ray.ray.intersectSphere(sphere, hit)) {
        include(hit);
      }
    }
    const distance = camera.position.length();
    normal.copy(camera.position).normalize(); axis.set(0, 1, 0);
    if (Math.abs(normal.y) > 0.95) axis.set(1, 0, 0);
    axis.cross(normal).normalize(); tangent.crossVectors(normal, axis);
    const capCenter = RADIUS * RADIUS / distance;
    const capRadius = Math.sqrt(Math.max(0, RADIUS * RADIUS - capCenter * capCenter));
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      point.copy(normal).multiplyScalar(capCenter)
        .addScaledVector(axis, capRadius * Math.cos(a)).addScaledVector(tangent, capRadius * Math.sin(a));
      projected.copy(point).project(camera);
      if (projected.z >= -1 && projected.z <= 1 && Math.abs(projected.x) <= 1.15 && Math.abs(projected.y) <= 1.15) include(point);
    }
    for (const pole of [-1, 1]) {
      point.set(0, pole * RADIUS, 0);
      if (align) point.applyQuaternion(align);
      projected.copy(point).project(camera);
      if (point.dot(camera.position) >= RADIUS * RADIUS && Math.abs(projected.x) <= 1.15
        && Math.abs(projected.y) <= 1.15 && projected.z >= -1 && projected.z <= 1) {
        west = view.lon - 180; east = view.lon + 180;
        if (pole > 0) north = 90; else south = -90;
      }
    }
    const padX = Math.max(0.002, (east - west) * 0.08), padY = Math.max(0.002, (north - south) * 0.08);
    return [west - padX, Math.max(-90, south - padY), east + padX, Math.min(90, north + padY)];
  };
}
