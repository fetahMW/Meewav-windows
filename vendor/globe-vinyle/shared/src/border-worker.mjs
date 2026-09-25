import { prepareBorders } from "./border-tiles.mjs";
import { packFeatures } from "./feature-pack.mjs";
import { prepareTerritories } from "./territory-geometry.mjs";
self.onmessage = async ({ data }) => {
  const { id, kind, sharedOnly, url, excludedIds = [] } = data;
  try {
    let features = data.features;
    if (url) {
      const response = await fetch(url);
      if (!response.ok) throw Error(`Contours indisponibles (${response.status})`);
      const excluded = new Set(excludedIds);
      features = (await response.json()).features.filter((f) => !excluded.has(f.id));
    }
    const start = performance.now();
    const tiles = data.surfacesOnly ? [] : prepareBorders(features, kind, sharedOnly);
    const plates = data.plates ? prepareTerritories(features, kind, { outlines: false }) : [];
    const packed = url ? packFeatures(features) : null;
    self.postMessage(
      {
        id,
        tiles,
        plates,
        packed,
        preparationMs: performance.now() - start,
      },
      [
        ...plates.flatMap(plate => [...Object.values(plate.top), ...Object.values(plate.edge)].map(array => array.buffer)),
        ...tiles.flatMap((tile) => tile.levels.map((level) => level.buffer)),
        ...(packed ? [packed.coordinates.buffer, packed.rings.buffer, packed.parts.buffer] : []),
      ],
    );
  } catch (error) {
    self.postMessage({ id, error: error.message });
  }
};
