import { createTerritoryPlates } from './territory-plates.mjs';
import { createGeographicLabels } from './geographic-labels.mjs';
import { territoryStyle, territoryReveal } from './territory-style.mjs';
import { boundsIntersect } from './geo-index.mjs';
import { unpackFeature } from './feature-pack.mjs';
import { lonlat } from './geo.mjs';

// One municipal asset per request; never upload a national neighbourhood mesh.
export function createQuarterStream(scene, index, prepare, invalidate, focus = null, occludesLabel = null, onQuartiers = null, compileObjects = null, platesParent = scene, toGeo = lonlat, align = null) {
  const cache = new Map(), loading = new Set(), failedUntil = new Map(), pinned = new Set();
  let wanted = new Set(), alive = true, lastCheck = -Infinity, selected = null;
  function disposeItem(item) {
    item.surfaces.dispose();
    scene.remove(item.labels.mesh); item.labels.dispose();
  }
  function loadAsset(asset) {
    if (!asset || cache.has(asset.cityCode) || loading.has(asset.cityCode)) return;
    if ((failedUntil.get(asset.cityCode) || 0) > performance.now()) return;
    if (loading.size >= 2) return;
    loading.add(asset.cityCode);
    prepare({ url: new URL('data/' + asset.path, document.baseURI).href, kind: 'quartier', plates: true, surfacesOnly: true })
      .then(async data => {
        if (!alive || !wanted.has(asset.cityCode)) return;
        const features = data.packed.features.map(f => unpackFeature(data.packed, f));
        onQuartiers?.(features);
        const parent = territoryStyle({ properties: { kind: 'commune', code: asset.cityCode, name: asset.name } });
        const surfaces = createTerritoryPlates(platesParent, data.plates, features, parent.nearColor, focus, toGeo);
        surfaces.setSelected(selected);
        // Each bounded city atlas is independent of the nationwide search
        // catalogue. No 10,000-name texture or per-frame rasterization.
        const labels = createGeographicLabels(features.slice(0, 200).map(f => ({
          id: f.id, name: f.properties.name, center: f.properties.center, cityCode: f.properties.cityCode,
          kind: 'quartier', rank: 4 })), [], focus, occludesLabel, align);
        const item = { surfaces, labels, used: performance.now() };
        try {
          // Keep these objects out of the rendered set while shaders compile.
          await compileObjects?.([...surfaces.objects(), labels.mesh]);
          if (!alive || !wanted.has(asset.cityCode)) { disposeItem(item); return; }
          scene.add(labels.mesh);
          cache.set(asset.cityCode, item);
        } catch (error) {
          disposeItem(item);
          throw error;
        }
      }).catch(error => {
        if (alive) { failedUntil.set(asset.cityCode, performance.now() + 30000); console.warn('Quartiers indisponibles :', asset.name, error.message); }
      }).finally(() => { loading.delete(asset.cityCode); if (alive) invalidate(); });
  }
  return {
    prefetch(cityCode) {
      if (!cityCode) return;
      // Only the current destination needs protection. Keeping every visited
      // city pinned made the eight-city GPU cache grow without a limit.
      pinned.clear();
      const asset = index.assets.find(item => item.cityCode === cityCode);
      if (!asset) return;
      pinned.add(cityCode);
      wanted.add(cityCode);
      loadAsset(asset);
    },
    updateRequests(now, view, viewport) {
      if (now - lastCheck < 180) return;
      lastCheck = now;
      const assets = view.height < 1.1 ? index.assets.filter(a => boundsIntersect(a.bounds, viewport))
        .sort((a, b) => ((a.center[0] - view.lon) * Math.cos(view.lat * Math.PI / 180)) ** 2 + (a.center[1] - view.lat) ** 2
          - ((b.center[0] - view.lon) * Math.cos(view.lat * Math.PI / 180)) ** 2 - (b.center[1] - view.lat) ** 2).slice(0, 6) : [];
      const next = new Set([...pinned, ...assets.map(a => a.cityCode)]);
      if (next.size !== wanted.size || [...next].some(id => !wanted.has(id))) invalidate();
      wanted = next;
      // Retry the latest destination first when the two loading slots free up.
      for (const cityCode of pinned) loadAsset(index.assets.find(a => a.cityCode === cityCode));
      for (const asset of assets) {
        if (cache.has(asset.cityCode)) { cache.get(asset.cityCode).used = now; continue; }
        loadAsset(asset);
      }
      if (cache.size > 8) for (const [id, item] of [...cache].filter(([id]) => !wanted.has(id)).sort((a, b) => a[1].used - b[1].used)) {
        if (cache.size <= 8) break;
        disposeItem(item); cache.delete(id);
      }
    },
    update(view, hoveredId, camera, width, height, options = {}) {
      for (const [id, item] of cache) {
        const enabled = wanted.has(id);
        item.surfaces.update(view, hoveredId, enabled);
        if (enabled && !options.hold && territoryReveal(view.height).quartier > 0.08) item.labels.update(camera, view.height, width, height);
        else item.labels.mesh.visible = false;
      }
    },
    pick(ray, view) {
      for (const [id, item] of cache) if (wanted.has(id)) {
        const feature = item.surfaces.pick(ray, view);
        if (feature) return feature;
      }
      return null;
    },
    setSelected(id) { selected = id; for (const item of cache.values()) item.surfaces.setSelected(id); },
    dispose() { alive = false; for (const item of cache.values()) disposeItem(item); cache.clear(); },
  };
}
