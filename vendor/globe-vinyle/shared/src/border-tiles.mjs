import { borderPaths, borderPositions } from "./border-geometry.mjs";
import { bounds, xyz } from "./geo.mjs";

export const borderTolerances = {
  country: [0.1, 0.04, 0.015, 0.004, 0],
  region: [0.015, 0.004, 0],
  commune: [0.0008, 0],
  quartier: [0],
};
export function borderLevel(kind, height) {
  if (kind === "country")
    return height > 250 ? 0 : height > 100 ? 1 : height > 35 ? 2 : height > 8 ? 3 : 4;
  if (kind === "region") return height > 12 ? 0 : height > 3 ? 1 : 2;
  if (kind === "commune") return height > 0.3 ? 0 : 1;
  return 0;
}
// Partition existing arcs without changing their source vertices. Neighbouring cells
// retain the common endpoint, so switching visible cells never cuts a boundary short.
export function tilePaths(paths, size = 0.25) {
  const tiles = new Map();
  for (const path of paths) {
    let previousKey = null,
      run;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1],
        b = path[i];
      const key = `${Math.floor(((a[0] + b[0]) * 0.5) / size)},${Math.floor(((a[1] + b[1]) * 0.5) / size)}`;
      if (!tiles.has(key)) tiles.set(key, { paths: [], bounds: [180, 90, -180, -90] });
      const tile = tiles.get(key);
      if (key !== previousKey) {
        run = [a];
        tile.paths.push(run);
      }
      run.push(b);
      previousKey = key;
      for (const p of [a, b]) {
        tile.bounds[0] = Math.min(tile.bounds[0], p[0]);
        tile.bounds[1] = Math.min(tile.bounds[1], p[1]);
        tile.bounds[2] = Math.max(tile.bounds[2], p[0]);
        tile.bounds[3] = Math.max(tile.bounds[3], p[1]);
      }
    }
  }
  return [...tiles.values()];
}
function localTile(tile, tolerances, extra = {}) {
  const [w, s, e, n] = tile.bounds;
  const origin = xyz((w + e) * 0.5, (s + n) * 0.5);
  return {
    bounds: tile.bounds,
    origin,
    ...extra,
    levels: tolerances.map((t) => {
      const positions = borderPositions(tile.paths, t);
      for (let i = 0; i < positions.length; i++) positions[i] -= origin[i % 3];
      return new Float32Array(positions);
    }),
  };
}
export function prepareBorders(features, kind, sharedOnly = false) {
  const paths = borderPaths(features, sharedOnly);
  if (kind === "country" || kind === "region") {
    const global = {
      bounds: [-180, -90, 180, 90],
      origin: [0, 0, 0],
      minHeight: 8,
      levels: borderTolerances[kind].map((t) => new Float32Array(borderPositions(paths, t))),
    };
    return [
      global,
      ...tilePaths(paths, kind === "country" ? 5 : 1).map((tile) =>
        localTile(tile, [0], { maxHeight: 8, fixedLevel: true }),
      ),
    ];
  }
  return tilePaths(paths, kind === "commune" ? 0.25 : 0.1).map((tile) =>
    localTile(tile, borderTolerances[kind]),
  );
}
export function indexFeatures(features) {
  return features.map((feature) => {
    const b = bounds(feature);
    return { ...feature, bbox: [b.west, b.south, b.east, b.north] };
  });
}
