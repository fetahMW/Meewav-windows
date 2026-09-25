import * as T from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { polygons, xyz, RADIUS } from './geo.mjs';
import { territoryStyle, METRES_TO_WORLD } from './territory-style.mjs';

// Keep only the hovered boundary on the GPU, including islands and holes.
export function createQuarterHoverOutline(parent, features) {
  const quarters = new Map(features.filter(f => f.properties.kind === 'quartier').map(f => [f.id, f]));
  if (!quarters.size) return null;
  const material = new LineMaterial({ color: 0xffffff, linewidth: 1.5,
    transparent: true, opacity: 0.9, depthTest: false, depthWrite: false, toneMapped: false });
  const line = new LineSegments2(new LineSegmentsGeometry(), material);
  line.visible = false;
  line.renderOrder = 3.1;
  parent.add(line);
  let previous = null, previousReveal = -1;
  return {
    update(id, reveal) {
      const feature = quarters.get(id);
      line.visible = !!feature && reveal > 0.01;
      if (!line.visible || (feature === previous && reveal === previousReveal)) return;
      const origin = xyz(...feature.properties.center);
      const radius = RADIUS + territoryStyle(feature).height * METRES_TO_WORLD * reveal + 0.000003;
      const positions = [];
      for (const polygon of polygons(feature)) for (const ring of polygon) {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const pa = xyz(...a), pb = xyz(...b);
          const length = Math.hypot(...pa.map((v, j) => v - pb[j]));
          if (length === 0) continue;
          const steps = 2 ** Math.max(0, Math.ceil(Math.log2(length / (500 * METRES_TO_WORLD))));
          for (let step = 0; step < steps; step++) for (const t of [step / steps, (step + 1) / steps]) {
            const point = xyz(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, radius);
            positions.push(...point.map((v, j) => v - origin[j]));
          }
        }
      }
      line.geometry.dispose();
      line.geometry = new LineSegmentsGeometry().setPositions(positions);
      line.position.fromArray(origin);
      previous = feature;
      previousReveal = reveal;
    },
    dispose() {
      line.removeFromParent();
      line.geometry.dispose();
      material.dispose();
    },
  };
}
