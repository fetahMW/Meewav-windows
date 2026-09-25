import { ShapeUtils, Vector2, Color } from "three";
import { polygons, xyz } from "./geo.mjs";
import { territoryStyle, METRES_TO_WORLD } from "./territory-style.mjs";

// Runs in the existing geographic Worker. Caps follow the globe, with holes
// preserved by earcut; walls follow every original ring, including islands.
export function prepareTerritories(features, kind, { outlines = true } = {}) {
  const groups = kind === "region" ? features.map(f => [f]) : [features];
  return groups.filter(group => group.length).map(group => {
    const origin = xyz(...group[0].properties.center);
    const top = { position: [], surfaceNormal: [], lift: [], territoryId: [], color: [], nearColor: [] };
    const edge = outlines ? { position: [], surfaceNormal: [], lift: [], territoryId: [], color: [], nearColor: [] } : {};
    const limit = (kind === "quartier" ? 500 : kind === "commune" ? 1500 : 10000) * METRES_TO_WORLD;
    function vertex(buffer, point, lift, id, color, nearColor = color) {
      const p = xyz(...point);
      buffer.position.push(...p.map((v, i) => v - origin[i]));
      buffer.surfaceNormal.push(...p.map(v => v / 100));
      buffer.lift.push(lift); buffer.territoryId.push(id); buffer.color.push(...color);
      buffer.nearColor.push(...nearColor);
    }
    group.forEach((feature, id) => {
      const style = territoryStyle(feature), lift = style.height * METRES_TO_WORLD;
      const color = new Color(style.color).toArray();
      const nearColor = new Color(style.nearColor || style.color).toArray();
      const side = color.map(v => v * 0.24);
      const stroke = outlines ? new Color(kind === "quartier" ? "#9B7AE8" : "#B18EFF").toArray() : null;
      for (const raw of polygons(feature)) {
        const rings = raw.map((ring, index) => {
          let points = ring.slice();
          if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
          if (ShapeUtils.isClockWise(points.map(p => new Vector2(...p))) !== (index > 0)) points.reverse();
          return points;
        }).filter(r => r.length >= 3);
        if (!rings.length) continue;
        const points = rings.flat();
        const faces = ShapeUtils.triangulateShape(rings[0].map(p => new Vector2(...p)), rings.slice(1).map(r => r.map(p => new Vector2(...p))));
        const pending = faces.map(face => face.map(i => points[i]));
        while (pending.length) {
          const triangle = pending.pop();
          const distances = triangle.map((a, i) => {
            const p = xyz(...a), q = xyz(...triangle[(i + 1) % 3]);
            return Math.hypot(...p.map((v, j) => v - q[j]));
          });
          const longest = distances.indexOf(Math.max(...distances));
          if (distances[longest] > limit) {
            const a = triangle[longest], b = triangle[(longest + 1) % 3], c = triangle[(longest + 2) % 3];
            const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
            pending.push([a, mid, c], [mid, b, c]);
          } else {
            if (ShapeUtils.isClockWise(triangle.map(p => new Vector2(...p)))) triangle.reverse();
            triangle.forEach(p => vertex(top, p, lift, id, color, nearColor));
          }
        }
        // Commune borders already live in the streamed border tiles. These
        // ground fills need neither duplicate outlines nor extruded side walls.
        if (kind === "commune") continue;
        for (const ring of rings) for (let i = 0; i < ring.length; i++) {
          const a = ring[i], b = ring[(i + 1) % ring.length];
          const pa = xyz(...a), pb = xyz(...b);
          // Keep the cap and contour on the same spherical subdivision.
          const steps = 2 ** Math.max(0, Math.ceil(Math.log2(Math.hypot(...pa.map((v, j) => v - pb[j])) / limit)));
          for (let step = 0; step < steps; step++) {
            const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            const p = at(step / steps), q = at((step + 1) / steps);
            for (const [point, h] of [[p, 0], [q, 0], [p, lift], [q, 0], [q, lift], [p, lift]]) vertex(top, point, h, id, side);
            if (outlines) { vertex(edge, p, lift, id, stroke); vertex(edge, q, lift, id, stroke); }
          }
        }
      }
    });
    const pack = buffer => Object.fromEntries(Object.entries(buffer).map(([name, values]) => [name, new Float32Array(values)]));
    return { kind, origin, features: group.map(f => ({ id: f.id || f.properties.id, properties: f.properties })), top: pack(top), edge: pack(edge) };
  });
}
