import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

export type GlobeCity = {
  id: string; code: string; name: string; department: string; region: string;
  center: [number, number]; population: number;
};
export type GlobeAsset = { path: string; cityCode?: string; department?: string; bounds: [number, number, number, number] };
export type GlobeFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, any>>;
export type GlobeCollection = { features: GlobeFeature[] };
const cache = new Map<string, Promise<any>>();

// The renderer and onboarding fetch the very same deployed files. Do not add
// another subdivision registry or fall back to the retired globe's geometry.
export function loadGlobeData<T>(path: string): Promise<T> {
  let promise = cache.get(path);
  if (!promise) {
    promise = fetch(`${import.meta.env.BASE_URL}globe-vinyle/data/${path}`)
      .then(response => {
        if (!response.ok) throw new Error(`Données du globe indisponibles (${path}). Réessaie dans un instant.`);
        return response.json();
      }).catch(error => { cache.delete(path); throw error; });
    cache.set(path, promise);
  }
  return promise;
}

export function containsGlobePoint(feature: GlobeFeature, center: [number, number]) {
  return booleanPointInPolygon(center, feature);
}

export async function loadGlobeCityFeatures(code: string, department?: string): Promise<GlobeFeature[]> {
  if (code === '75056') {
    const data = await loadGlobeData<GlobeCollection>('sectors.geojson');
    return data.features.filter(f => f.properties.kind === 'quartier' && String(f.id).startsWith('fr-paris-'));
  }
  const index = await loadGlobeData<{ assets: GlobeAsset[] }>('quarters/index.json');
  const asset = index.assets.find(item => item.cityCode === code);
  if (asset) return (await loadGlobeData<GlobeCollection>(asset.path)).features;
  const communes = await loadGlobeData<{ assets: GlobeAsset[] }>('communes/index.json');
  const dep = department || (code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2));
  const communeAsset = communes.assets.find(item => item.department === dep);
  if (!communeAsset) throw new Error('Le contour de cette commune est indisponible.');
  return (await loadGlobeData<GlobeCollection>(communeAsset.path)).features
    .filter(f => String(f.properties.code) === code);
}

export async function resolveGlobeCommune(point: [number, number]) {
  const index = await loadGlobeData<{ assets: GlobeAsset[] }>('communes/index.json');
  const candidates = index.assets.filter(({ bounds: b }) => point[0] >= b[0] && point[0] <= b[2] && point[1] >= b[1] && point[1] <= b[3]);
  for (const asset of candidates) {
    const data = await loadGlobeData<GlobeCollection>(asset.path);
    const match = data.features.find(f => containsGlobePoint(f, point));
    if (match) return String(match.properties.code);
  }
  return null;
}
