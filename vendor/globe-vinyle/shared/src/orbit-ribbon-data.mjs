import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

// Polished lamella: almost flat middle, gently rounded shoulders, thin sides.
export function ribbonTop(band, radialSegments) {
  const top = [];
  for (let i = 0; i <= radialSegments; i++) {
    const u = i / radialSegments;
    top.push([T.MathUtils.lerp(band.inner, band.outer, u),
      band.height + band.crown * Math.sin(Math.PI * u), u]);
  }
  return top;
}

export function createOrbitRibbonGeometry(band, angularSegments, radialSegments) {
  const top = ribbonTop(band, radialSegments);
  const bottom = band.height - band.thickness;
  // A closed cross-section. Separate vertices across each strip retain crisp
  // tranche normals; top normals use the analytic derivative of the crown.
  const profile = [[band.inner, bottom, 0], [band.outer, bottom, 1],
    ...top.slice().reverse(), [band.inner, bottom, 0]];
  const positions = [], normals = [], uv = [], bandIds = [], faces = [], indices = [];
  for (let row = 0; row < profile.length - 1; row++) {
    const a = profile[row], b = profile[row + 1];
    const dr = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dr, dy);
    const isTop = row >= 2 && row < 2 + radialSegments;
    const face = isTop ? 1 : row === 0 ? -1 : 0;
    const offset = positions.length / 3;
    for (let j = 0; j <= angularSegments; j++) {
      const angle = j === angularSegments ? 0 : j / angularSegments * TAU;
      const c = Math.cos(angle), s = Math.sin(angle);
      for (const [r, y, u] of [a, b]) {
        positions.push(r * c, y, r * s);
        if (isTop) {
          const slope = band.crown * Math.PI * Math.cos(Math.PI * u) / (band.outer - band.inner);
          const norm = Math.hypot(slope, 1);
          normals.push(-slope * c / norm, 1 / norm, -slope * s / norm);
        } else normals.push(dy / length * c, -dr / length, dy / length * s);
        uv.push(j / angularSegments, u); bandIds.push(band.id); faces.push(face);
      }
    }
    for (let j = 0; j < angularSegments; j++) {
      const a0 = offset + j * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      indices.push(a0, b0, b1, a0, b1, a1);
    }
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  geometry.setAttribute('orbitBand', new T.Float32BufferAttribute(bandIds, 1));
  geometry.setAttribute('orbitFace', new T.Float32BufferAttribute(faces, 1));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

export function createOrbitRibbons(layout) {
  const geometries = layout.bands.map(band => createOrbitRibbonGeometry(band, layout.angularSegments, layout.radialSegments));
  // Keep disconnected real ribbons in one draw; no floor bridges the gaps.
  const geometry = mergeGeometries(geometries, false);
  for (const source of geometries) source.dispose();
  return geometry;
}

export function createOrbitContour(layout) {
  const radius = layout.outerRadius, width = layout.scale * 0.011;
  return createOrbitRibbonGeometry({ inner: radius - width, outer: radius,
    height: layout.contourHeight, crown: 0, thickness: layout.scale * 0.012, id: 4 }, layout.angularSegments, 2);
}

// Exact contact on a crown triangle. Navigation crosses the empty gaps along
// a virtual interpolated route; that route never creates a visible surface.
export function createOrbitSurfaceSampler(layout) {
  const profiles = layout.bands.map(band => ribbonTop(band, layout.radialSegments));
  return (angle, radius) => {
    const bandIndex = layout.bands.findIndex(band => radius >= band.inner && radius <= band.outer);
    let a, b;
    if (bandIndex >= 0) {
      const profile = profiles[bandIndex];
      let row = 0;
      while (row < profile.length - 2 && radius > profile[row + 1][0]) row++;
      a = profile[row]; b = profile[row + 1];
    } else {
      let next = layout.bands.findIndex(band => radius < band.inner);
      if (next === 0) a = b = profiles[0][0];
      else if (next < 0) a = b = profiles.at(-1).at(-1);
      else { a = profiles[next - 1].at(-1); b = profiles[next][0]; }
    }
    const wrapped = T.MathUtils.euclideanModulo(angle, TAU);
    const step = wrapped / TAU * layout.angularSegments, segment = Math.floor(step), t = step - segment;
    const angle0 = segment / layout.angularSegments * TAU, angle1 = (segment + 1) / layout.angularSegments * TAU;
    const at = ([r, y], theta) => new T.Vector3(r * Math.cos(theta), y, r * Math.sin(theta));
    if (a === b) return { position: at([radius, a[1]], wrapped), normal: new T.Vector3(0, 1, 0), onBand: false };
    const u = T.MathUtils.clamp((radius - a[0]) / (b[0] - a[0]), 0, 1);
    const p00 = at(a, angle0), p10 = at(b, angle0), p01 = at(a, angle1), p11 = at(b, angle1);
    const position = new T.Vector3(), normal = new T.Vector3();
    if (u + t <= 1) {
      position.addScaledVector(p00, 1 - u - t).addScaledVector(p10, u).addScaledVector(p01, t);
      normal.copy(p01).sub(p00).cross(p10.clone().sub(p00)).normalize();
    } else {
      position.addScaledVector(p10, 1 - t).addScaledVector(p01, 1 - u).addScaledVector(p11, u + t - 1);
      normal.copy(p01).sub(p10).cross(p11.clone().sub(p10)).normalize();
    }
    return { position, normal, onBand: bandIndex >= 0 };
  };
}
