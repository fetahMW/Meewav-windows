import * as T from 'three';

// Overlay text keeps its pixel size and ignores territory depth. Only the
// actual annular volume between the camera and its text footprint can hide it.
export function createRingLabelOcclusion(matrixWorld, innerRadius, outerRadius, thickness, ribbons = null) {
  const inverseRing = matrixWorld.clone().invert(), localCameraMatrix = new T.Matrix4();
  const origin = new T.Vector3(), anchor = new T.Vector3(), viewAnchor = new T.Vector3();
  const right = new T.Vector3(), up = new T.Vector3(), endpoint = new T.Vector3();
  const samples = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  const innerSq = innerRadius * innerRadius;
  const volumes = (ribbons || [{ innerRadius, outerRadius, bottom: -thickness / 2, top: thickness / 2 }])
    .map(volume => ({ ...volume, innerSq: volume.innerRadius ** 2, outerSq: volume.outerRadius ** 2 }));

  function intersectsAnnulus(target, volume) {
    const dx = target.x - origin.x, dy = target.y - origin.y, dz = target.z - origin.z;
    let near = 0, far = 1 - 1e-7;
    // Clip the sightline to the ring's thickness. This handles views from
    // above, below and along its edge, without raycasting thousands of faces.
    if (Math.abs(dy) < 1e-10) {
      if (origin.y < volume.bottom || origin.y > volume.top) return false;
    } else {
      const a = (volume.bottom - origin.y) / dy, b = (volume.top - origin.y) / dy;
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near >= far) return false;
    }
    const x0 = origin.x + dx * near, z0 = origin.z + dz * near;
    const x1 = origin.x + dx * far, z1 = origin.z + dz * far;
    const radialSpeedSq = dx * dx + dz * dz;
    const closest = radialSpeedSq > 1e-12
      ? Math.max(near, Math.min(far, -(origin.x * dx + origin.z * dz) / radialSpeedSq)) : near;
    const xc = origin.x + dx * closest, zc = origin.z + dz * closest;
    return xc * xc + zc * zc <= volume.outerSq && Math.max(x0 * x0 + z0 * z0, x1 * x1 + z1 * z1) >= volume.innerSq;
  }

  return (camera, worldAnchor, width, height, viewportHeight, offsetY = 0) => {
    viewAnchor.copy(worldAnchor).applyMatrix4(camera.matrixWorldInverse);
    if (viewAnchor.z >= 0) return false;
    const worldPerPixel = -2 * viewAnchor.z / (camera.projectionMatrix.elements[5] * Math.max(1, viewportHeight));
    localCameraMatrix.multiplyMatrices(inverseRing, camera.matrixWorld);
    origin.setFromMatrixPosition(localCameraMatrix);
    anchor.copy(worldAnchor).applyMatrix4(inverseRing);
    const footprintRadius = Math.hypot(width / 2, height / 2 + Math.abs(offsetY)) * worldPerPixel;
    // Local map views usually sit entirely inside the central opening.
    if (origin.lengthSq() < innerSq && anchor.length() + footprintRadius < innerRadius) return false;
    right.setFromMatrixColumn(localCameraMatrix, 0);
    up.setFromMatrixColumn(localCameraMatrix, 1);
    for (const [x, y] of samples) {
      endpoint.copy(anchor).addScaledVector(right, x * width * 0.5 * worldPerPixel)
        .addScaledVector(up, -(offsetY + y * height * 0.5) * worldPerPixel);
      for (const volume of volumes) if (intersectsAnnulus(endpoint, volume)) return true;
    }
    return false;
  };
}
