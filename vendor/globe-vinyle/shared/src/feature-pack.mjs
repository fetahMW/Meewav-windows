import { bounds, polygons } from "./geo.mjs";
// The coordinate buffers transfer ownership to the render thread. GeoJSON nested
// arrays stay in the worker; only the polygon actually clicked is reconstructed.
export function packFeatures(features) {
  const coordinates = [],
    rings = [],
    parts = [],
    metadata = [];
  for (const f of features) {
    const firstPart = parts.length / 2;
    for (const polygon of polygons(f)) {
      const firstRing = rings.length / 2;
      for (const ring of polygon) {
        rings.push(coordinates.length / 2, ring.length);
        for (const p of ring) coordinates.push(p[0], p[1]);
      }
      parts.push(firstRing, polygon.length);
    }
    const b = bounds(f);
    metadata.push({
      id: f.id,
      properties: f.properties,
      bbox: [b.west, b.south, b.east, b.north],
      firstPart,
      partCount: parts.length / 2 - firstPart,
      type: f.geometry.type,
    });
  }
  return {
    features: metadata,
    coordinates: new Float64Array(coordinates),
    rings: new Uint32Array(rings),
    parts: new Uint32Array(parts),
  };
}
function inRing(pack, ring, point) {
  const start = pack.rings[ring * 2],
    count = pack.rings[ring * 2 + 1],
    coords = pack.coordinates;
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i++) {
    const xi = coords[(start + i) * 2],
      yi = coords[(start + i) * 2 + 1],
      xj = coords[(start + j) * 2],
      yj = coords[(start + j) * 2 + 1];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function packedContains(pack, feature, point) {
  for (let i = feature.firstPart; i < feature.firstPart + feature.partCount; i++) {
    const start = pack.parts[i * 2],
      count = pack.parts[i * 2 + 1];
    if (!inRing(pack, start, point)) continue;
    let hole = false;
    for (let j = 1; j < count; j++)
      if (inRing(pack, start + j, point)) {
        hole = true;
        break;
      }
    if (!hole) return true;
  }
  return false;
}
export function unpackFeature(pack, feature) {
  const polygons = [];
  for (let i = feature.firstPart; i < feature.firstPart + feature.partCount; i++) {
    const first = pack.parts[i * 2],
      count = pack.parts[i * 2 + 1],
      polygon = [];
    for (let j = first; j < first + count; j++) {
      const start = pack.rings[j * 2],
        n = pack.rings[j * 2 + 1],
        ring = [];
      for (let k = start; k < start + n; k++)
        ring.push([pack.coordinates[k * 2], pack.coordinates[k * 2 + 1]]);
      polygon.push(ring);
    }
    polygons.push(polygon);
  }
  return {
    id: feature.id,
    properties: feature.properties,
    bbox: feature.bbox,
    geometry: {
      type: feature.type,
      coordinates: feature.type === "Polygon" ? polygons[0] : polygons,
    },
  };
}
