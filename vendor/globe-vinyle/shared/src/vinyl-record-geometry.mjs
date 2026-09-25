import * as T from 'three';
import { RADIUS } from './geo.mjs';
import { RECORD_ARTWORK_INNER } from '../../../meewav-vinyl/src/record-finish.js';

// A single pressed record, with its opening tucked inside the ocean surface.
// The overlap also covers the globe's polygonal silhouette and the lower rim.
export const VINYL_RECORD = Object.freeze({
  innerRadius: RADIUS - 0.08,
  outerRadius: RADIUS * 1.85,
  thickness: RADIUS * 1.85 * 0.0065,
  bevel: RADIUS * 1.85 * 0.0016,
  artworkInnerRatio: RECORD_ARTWORK_INNER,
});

export function vinylRecordLayout(quality = 'high') {
  return { ...VINYL_RECORD, angularSegments: quality === 'low' ? 512 : 1024,
    bevelSegments: quality === 'low' ? 4 : 8,
    bands: [{ id: 0, inner: VINYL_RECORD.innerRadius, outer: VINYL_RECORD.outerRadius,
      height: 0, crown: 0, thickness: VINYL_RECORD.thickness }],
  };
}

export function createVinylRecordGeometry(layout) {
  const { innerRadius: inner, outerRadius: outer, thickness, bevel, angularSegments, bevelSegments } = layout;
  const profile = [];
  const arc = (r, y, from, to) => {
    for (let i = 0; i <= bevelSegments; i++) {
      const angle = T.MathUtils.lerp(from, to, i / bevelSegments);
      const nr = Math.cos(angle), ny = Math.sin(angle);
      profile.push({ r: r + bevel * nr, y: y + bevel * ny, nr, ny });
    }
  };
  // Trace the closed cross-section: inner lip, inner wall, underside, outer
  // wall and outer lip. The broad top and underside are genuinely flat.
  arc(inner + bevel, -bevel, Math.PI / 2, Math.PI);
  arc(inner + bevel, -thickness + bevel, Math.PI, Math.PI * 1.5);
  arc(outer - bevel, -thickness + bevel, Math.PI * 1.5, Math.PI * 2);
  arc(outer - bevel, -bevel, 0, Math.PI / 2);
  profile.push({ ...profile[0] });
  const geometry = new T.LatheGeometry(profile.map(p => new T.Vector2(p.r, p.y)), angularSegments);
  // Analytic normals keep long flat faces from averaging into the tiny bevels.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i <= angularSegments; i++) {
    const angle = i / angularSegments * Math.PI * 2;
    for (let j = 0; j < profile.length; j++) {
      const p = profile[j];
      normals.setXYZ(i * profile.length + j, p.nr * Math.sin(angle), p.ny, p.nr * Math.cos(angle));
    }
  }
  geometry.computeBoundingSphere();
  geometry.name = 'Continuous circular vinyl with a rounded pressed edge';
  return geometry;
}

// Same analytic profile as the visible mesh, for portraits and navigation.
export function sampleVinylRecord(layout, angle, radius) {
  const { innerRadius, outerRadius, bevel } = layout;
  const r = T.MathUtils.clamp(radius, innerRadius, outerRadius);
  let y = 0, nr = 0, ny = 1;
  if (r < innerRadius + bevel || r > outerRadius - bevel) {
    const center = r < innerRadius + bevel ? innerRadius + bevel : outerRadius - bevel;
    nr = (r - center) / bevel;
    ny = Math.sqrt(Math.max(0, 1 - nr * nr));
    y = bevel * (ny - 1);
  }
  const c = Math.cos(angle), s = Math.sin(angle);
  return { position: new T.Vector3(r * c, y, r * s), normal: new T.Vector3(nr * c, ny, nr * s), onBand: true };
}
