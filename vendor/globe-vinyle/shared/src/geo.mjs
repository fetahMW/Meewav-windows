export const RADIUS = 100;
export const degrees = Math.PI / 180;
export function xyz(lon, lat, radius = RADIUS) {
  const p = lat * degrees,
    t = lon * degrees;
  return [
    radius * Math.cos(p) * Math.sin(t),
    radius * Math.sin(p),
    radius * Math.cos(p) * Math.cos(t),
  ];
}
export function lonlat(x, y, z) {
  return [Math.atan2(x, z) / degrees, Math.atan2(y, Math.hypot(x, z)) / degrees];
}
export function polygons(feature) {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}
export function bounds(feature) {
  let west = 180,
    south = 90,
    east = -180,
    north = -90;
  for (const poly of polygons(feature))
    for (const ring of poly)
      for (const [x, y] of ring) {
        west = Math.min(west, x);
        east = Math.max(east, x);
        south = Math.min(south, y);
        north = Math.max(north, y);
      }
  return { west, south, east, north };
}
export function insideRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi
    )
      inside = !inside;
  }
  return inside;
}
export function contains(feature, point) {
  return polygons(feature).some(
    (poly) => insideRing(point, poly[0]) && !poly.slice(1).some((r) => insideRing(point, r)),
  );
}
export function seedRandom(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n += 0x6d2b79f5;
    let t = n;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const names = [
  "Alma",
  "Noé",
  "Sasha",
  "Mila",
  "Léo",
  "Jade",
  "Eden",
  "Lou",
  "Nina",
  "Ezra",
  "Inès",
  "Iris",
  "Lina",
  "Adam",
  "Malo",
  "Zoé",
];
const jobs = ["Chant", "Guitare", "Piano", "Production", "Danse", "Management"];
export function profilesFor(feature, count) {
  const random = seedRandom(feature.id || feature.properties.id),
    b = bounds(feature),
    points = [];
  let tries = 0;
  while (points.length < count && tries < count * 1000) {
    tries++;
    const p = [b.west + random() * (b.east - b.west), b.south + random() * (b.north - b.south)];
    if (!contains(feature, p)) continue;
    const i = points.length;
    points.push({
      id: `${feature.id}-${i}`,
      name:
        names[i % names.length] +
        (i >= names.length ? " " + (Math.floor(i / names.length) + 1) : ""),
      job: jobs[i % jobs.length],
      role: i % jobs.length,
      position: p,
    });
  }
  return points;
}
export function targetFor(feature) {
  const b = bounds(feature),
    center = feature.properties.center || [(b.west + b.east) / 2, (b.south + b.north) / 2];
  return {
    lon: center[0],
    lat: center[1],
    height: Math.max(
      0.006,
      Math.max((b.east - b.west) * Math.cos(center[1] * degrees), b.north - b.south) *
        degrees *
        RADIUS *
        1.65,
    ),
  };
}
export function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
