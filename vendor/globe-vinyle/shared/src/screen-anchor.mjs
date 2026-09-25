import * as T from "three";
import { xyz, RADIUS } from "./geo.mjs";
import { wrapLongitude } from "./camera.mjs";
const clamp = T.MathUtils.clamp;
export function solveScreenAnchor({ view, camera, point, x, y, width, height, updateCamera, align = null }) {
  const entry = { lon: view.lon, lat: view.lat };
  const rollback = () => {
    view.lon = entry.lon;
    view.lat = entry.lat;
    updateCamera();
    return false;
  };
  const target = new T.Vector2(x, y);
  const worldPoint = new T.Vector3(...xyz(point[0], point[1], RADIUS));
  if (align) worldPoint.applyQuaternion(align);
  const project = () => {
    const p = worldPoint.clone().project(camera);
    return new T.Vector2(((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2);
  };
  // Solve in screen space, which stays continuous when an anchor passes over a pole.
  for (let i = 0; i < 5; i++) {
    const current = project(),
      error = target.clone().sub(current);
    if (error.length() < 0.15) return true;
    const original = { lon: view.lon, lat: view.lat },
      epsilon = Math.min(0.001, view.height * 0.01);
    view.lon = original.lon + epsilon;
    updateCamera();
    const lonDerivative = project()
      .sub(current)
      .multiplyScalar(1 / epsilon);
    view.lon = original.lon;
    view.lat = original.lat + epsilon;
    updateCamera();
    const latDerivative = project()
      .sub(current)
      .multiplyScalar(1 / epsilon);
    view.lat = original.lat;
    updateCamera();
    const determinant = lonDerivative.x * latDerivative.y - latDerivative.x * lonDerivative.y;
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-8) return rollback();
    const dl = clamp((error.x * latDerivative.y - error.y * latDerivative.x) / determinant, -4, 4);
    const dp = clamp((lonDerivative.x * error.y - lonDerivative.y * error.x) / determinant, -3, 3);
    let improved = false;
    for (const step of [1, 0.5, 0.25]) {
      view.lon = wrapLongitude(original.lon + dl * step);
      view.lat = clamp(original.lat + dp * step, -85, 85);
      updateCamera();
      if (project().distanceTo(target) < error.length()) {
        improved = true;
        break;
      }
    }
    if (!improved) return rollback();
  }
  return project().distanceTo(target) < 1 || rollback();
}
