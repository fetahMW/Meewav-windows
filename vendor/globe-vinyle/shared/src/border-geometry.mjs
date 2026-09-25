import { polygons, xyz, RADIUS } from "./geo.mjs";

// Stitch unique edges into shared arcs before simplifying: adjacent countries keep one border.
export function borderPaths(features, sharedOnly = false) {
  const edges = new Map(),
    points = new Map();
  const key = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
  for (let owner = 0; owner < features.length; owner++)
    for (const poly of polygons(features[owner]))
      for (const ring of poly)
        for (let i = 1; i < ring.length; i++) {
          const a = key(ring[i - 1]),
            b = key(ring[i]);
          if (a === b) continue;
          points.set(a, ring[i - 1]);
          points.set(b, ring[i]);
          const id = a < b ? a + "|" + b : b + "|" + a;
          const edge = edges.get(id);
          if (edge) edge.owners.add(owner);
          else edges.set(id, { a, b, owners: new Set([owner]) });
        }
  const graph = new Map();
  const connect = (a, b) => {
    if (!graph.has(a)) graph.set(a, new Set());
    graph.get(a).add(b);
  };
  for (const edge of edges.values())
    if (!sharedOnly || edge.owners.size > 1) {
      connect(edge.a, edge.b);
      connect(edge.b, edge.a);
    }
  const visited = new Set(),
    paths = [];
  const edgeKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
  function walk(start, next) {
    const path = [points.get(start)];
    let previous = start,
      current = next;
    for (;;) {
      const id = edgeKey(previous, current);
      if (visited.has(id)) break;
      visited.add(id);
      path.push(points.get(current));
      const neighbours = graph.get(current);
      if (current === start || neighbours.size !== 2) break;
      const following = [...neighbours].find((p) => p !== previous);
      previous = current;
      current = following;
    }
    if (path.length > 1) paths.push(path);
  }
  for (const [point, neighbours] of graph)
    if (neighbours.size !== 2)
      for (const next of neighbours) if (!visited.has(edgeKey(point, next))) walk(point, next);
  for (const [point, neighbours] of graph)
    for (const next of neighbours) if (!visited.has(edgeKey(point, next))) walk(point, next);
  return paths;
}
export function simplifyBorder(path, toleranceDegrees) {
  if (toleranceDegrees <= 0 || path.length <= 2) return path;
  const points = path.map((p) => xyz(p[0], p[1], 1));
  const tolerance = ((toleranceDegrees * Math.PI) / 180) ** 2;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop(),
      a = points[start],
      b = points[end],
      ab = b.map((v, i) => v - a[i]);
    const length = ab.reduce((sum, v) => sum + v * v, 0);
    let best = tolerance,
      index = -1;
    for (let i = start + 1; i < end; i++) {
      const ap = points[i].map((v, j) => v - a[j]);
      const t = length
        ? Math.max(0, Math.min(1, ap.reduce((sum, v, j) => sum + v * ab[j], 0) / length))
        : 0;
      const distance = ap.reduce((sum, v, j) => sum + (v - t * ab[j]) ** 2, 0);
      if (distance > best) {
        best = distance;
        index = i;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return path.filter((_, i) => keep[i]);
}
export function borderPositions(paths, toleranceDegrees = 0) {
  const vertices = [];
  for (const raw of paths) {
    const path = simplifyBorder(raw, toleranceDegrees);
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      const steps = Math.max(
        1,
        Math.ceil(Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) / 0.5),
      );
      for (let n = 0; n < steps; n++)
        for (const t of [n / steps, (n + 1) / steps])
          vertices.push(
            ...xyz(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t,
              RADIUS + 0.00006),
          );
    }
  }
  return vertices;
}
