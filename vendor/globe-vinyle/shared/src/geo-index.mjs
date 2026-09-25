export const CITY_PREFETCH_HEIGHT = 2.8;

export function viewportBounds(view, width, height, margin = 1.25) {
  const radians = Math.PI / 180;
  const short = Math.max(1, Math.min(width, height));
  const span = ((view.height * Math.tan(19 * radians)) / 100 / radians) * margin;
  const dy = (span * height) / short;
  const dx = (span * width) / short / Math.max(0.08, Math.cos(view.lat * radians));
  return [view.lon - dx, view.lat - dy, view.lon + dx, view.lat + dy];
}
export function boundsIntersect(a, b) {
  if (a[1] > b[3] || a[3] < b[1]) return false;
  return [-360, 0, 360].some((offset) => a[2] + offset >= b[0] && a[0] + offset <= b[2]);
}
export function visibleDepartments(index, view, width, height, visibleBounds = null) {
  if (view.height >= CITY_PREFETCH_HEIGHT) return [];
  const viewport = visibleBounds || viewportBounds(view, width, height);
  const distance = (asset) => {
    const dl = ((asset.center[0] - view.lon + 540) % 360) - 180;
    return (dl * Math.cos((view.lat * Math.PI) / 180)) ** 2 + (asset.center[1] - view.lat) ** 2;
  };
  return index.assets
    .filter((asset) => boundsIntersect(asset.bounds, viewport))
    .sort((a, b) => distance(a) - distance(b));
}

const fade = (h, near, far) => {
  const t = Math.max(
    0,
    Math.min(1, (Math.log(h) - Math.log(near)) / (Math.log(far) - Math.log(near))),
  );
  return 1 - t * t * (3 - 2 * t);
};
export function geographyLevels(height) {
  const region = fade(height, 14, 42);
  const commune = fade(height, 0.7, 2.2);
  const quartier = fade(height, 0.2, 0.55);
  return {
    country: 1,
    region,
    commune,
    quartier,
    level:
      quartier > 0.2 ? "quartier" : commune > 0.2 ? "commune" : region > 0.2 ? "region" : "country",
  };
}
