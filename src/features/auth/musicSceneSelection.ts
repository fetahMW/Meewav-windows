import { loadFranceCommunesIndex } from "../globe/maplibre/search-france/loadFranceCommunesIndex";
import type { FranceSearchResult } from "../globe/maplibre/search-france/franceSearchTypes";
import { findInteriorVisualCenter } from "./musicSceneVisualCenter";
import { loadGlobeData, loadGlobeCityFeatures, resolveGlobeCommune, containsGlobePoint, type GlobeCity } from "./vinylGlobeGeography";

export type MusicSceneSource = "iris" | "single-plate";

export type MusicSceneCity = {
  communeCode: string;
  result: FranceSearchResult;
};

export type MusicScene = {
  zoneId: string;
  label: string;
  communeCode: string;
  communeName: string;
  center: [number, number];
  bbox: [number, number, number, number] | null;
  source: MusicSceneSource;
  irisCode?: string;
  geographyVersion?: "vinyl-v1";
};

export type ResolvedMusicScene = {
  city: MusicSceneCity;
  scene: MusicScene;
};

type ZoneGeoJsonFeature = {
  id?: string | number;
  properties?: Record<string, unknown>;
  geometry?: unknown;
};

type ZoneGeoJsonCollection = {
  features?: ZoneGeoJsonFeature[];
};

let cityIndexPromise: Promise<MusicSceneCity[]> | null = null;
const sceneCache = new Map<string, Promise<MusicScene[]>>();
const citySearchValuesCache = new WeakMap<MusicSceneCity, {
  normalizedLabel: string;
  normalizedCommuneCode: string;
  normalizedPostalCodes: string[];
  normalizedAliases: string[];
  searchableValues: string[];
}>();

export function normalizeMusicSceneSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function loadMusicSceneCityIndex() {
  if (cityIndexPromise) return cityIndexPromise;
  cityIndexPromise = Promise.all([
    loadGlobeData<{ cities: GlobeCity[] }>("cities.json"),
    // Postal codes and aliases enrich search only; the globe owns membership,
    // city names, positions and all subdivision identifiers.
    loadFranceCommunesIndex().catch(() => [] as FranceSearchResult[]),
  ]).then(([data, extras]) => {
    const enrichment = new Map(extras.map(item => [item.id.replace(/^commune-/, ""), item]));
    const cities = data.cities.map(item => {
      const extra = enrichment.get(item.code);
      return { communeCode: item.code, result: {
        ...extra, id: item.id, label: item.name, type: "commune" as const,
        subtitle: extra?.subtitle || 'Département ' + item.department,
        center: item.center, departmentCode: item.department, population: item.population,
        source: "MeeWav · globe vinyle",
      } };
    }).sort((a,b) => (b.result.population ?? 0) - (a.result.population ?? 0) || a.result.label.localeCompare(b.result.label, "fr"));
    cities.forEach(getCitySearchValues);
    return cities;
  }).catch(error => { cityIndexPromise = null; throw error; });
  return cityIndexPromise;
}

function getCitySearchValues(city: MusicSceneCity) {
  let indexedCity = citySearchValuesCache.get(city);
  if (!indexedCity) {
    const normalizedLabel = normalizeMusicSceneSearch(city.result.label);
    const normalizedCommuneCode = normalizeMusicSceneSearch(city.communeCode);
    const normalizedPostalCodes = (city.result.postalCodes ?? []).map(normalizeMusicSceneSearch);
    const normalizedAliases = (city.result.aliases ?? []).map(normalizeMusicSceneSearch);
    indexedCity = {
      normalizedLabel,
      normalizedCommuneCode,
      normalizedPostalCodes,
      normalizedAliases,
      searchableValues: [
        normalizedLabel,
        normalizeMusicSceneSearch(city.result.subtitle),
        normalizeMusicSceneSearch(city.result.departmentName ?? ""),
        normalizeMusicSceneSearch(city.result.regionName ?? ""),
        normalizedCommuneCode,
        ...normalizedPostalCodes,
        ...normalizedAliases,
      ].filter(Boolean),
    };
    citySearchValuesCache.set(city, indexedCity);
  }
  return indexedCity;
}

function getCitySearchScore(city: MusicSceneCity, normalizedQuery: string) {
  if (!normalizedQuery) return 100 - Math.min(90, (city.result.population ?? 0) / 50_000);
  const {
    normalizedLabel,
    normalizedCommuneCode,
    normalizedPostalCodes,
    normalizedAliases,
    searchableValues,
  } = getCitySearchValues(city);
  const terms = normalizedQuery.split(/\s+/);
  if (!terms.every((term) => searchableValues.some((value) => value.includes(term)))) return null;

  // An exact INSEE code must always win over an identical postal code.
  if (normalizedCommuneCode === normalizedQuery) return -20;
  if (normalizedLabel === normalizedQuery) return 0;
  if (normalizedAliases.includes(normalizedQuery)) return 6;
  if (normalizedPostalCodes.includes(normalizedQuery)) return 8;
  if (normalizedLabel.startsWith(normalizedQuery)) return 10;
  if (searchableValues.some((value) => value === normalizedQuery)) return 18;
  if (searchableValues.some((value) => value.startsWith(normalizedQuery))) return 24;
  return 40;
}

export function searchMusicSceneCities(
  cities: readonly MusicSceneCity[],
  query: string,
  limit = 7,
) {
  return searchMusicSceneCityCatalog(cities, query, limit).items;
}

export function searchMusicSceneCityCatalog(
  cities: readonly MusicSceneCity[],
  query: string,
  limit = 10,
) {
  const normalizedQuery = normalizeMusicSceneSearch(query);
  const safeLimit = Math.max(1, Math.min(60, Math.trunc(limit)));
  if (!normalizedQuery) {
    return {
      items: cities.slice(0, safeLimit),
      total: cities.length,
    };
  }

  const matches = cities
    .map((city) => ({ city, score: getCitySearchScore(city, normalizedQuery) }))
    .filter((candidate): candidate is { city: MusicSceneCity; score: number } => candidate.score !== null)
    .sort((first, second) => (
      first.score - second.score
      || (second.city.result.population ?? 0) - (first.city.result.population ?? 0)
      || first.city.result.label.localeCompare(second.city.result.label, "fr")
    ));
  return {
    items: matches.slice(0, safeLimit).map((candidate) => candidate.city),
    total: matches.length,
  };
}

function asFiniteNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asBbox(value: unknown): [number, number, number, number] | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const values = value.slice(0, 4).map(asFiniteNumber);
  if (values.some((entry) => entry === null)) return null;
  return values as [number, number, number, number];
}

function getGeometryBbox(geometry: unknown): [number, number, number, number] | null {
  if (!geometry || typeof geometry !== "object") return null;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2
      && typeof value[0] === "number"
      && typeof value[1] === "number"
      && Number.isFinite(value[0])
      && Number.isFinite(value[1])
    ) {
      west = Math.min(west, value[0]);
      south = Math.min(south, value[1]);
      east = Math.max(east, value[0]);
      north = Math.max(north, value[1]);
      return;
    }
    value.forEach(visit);
  };

  visit(coordinates);
  return [west, south, east, north].every(Number.isFinite)
    ? [west, south, east, north]
    : null;
}

function getFeatureCenter(
  properties: Record<string, unknown>,
  geometry: unknown,
  bbox: [number, number, number, number] | null,
  fallback: [number, number],
): [number, number] {
  const polygonGeometry = geometry && typeof geometry === "object"
    && (
      (geometry as { type?: unknown }).type === "Polygon"
      || (geometry as { type?: unknown }).type === "MultiPolygon"
    )
    ? geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon
    : null;
  const visualCenter = findInteriorVisualCenter(polygonGeometry);
  if (visualCenter) return visualCenter;

  // Source label points remain a safe fallback for malformed legacy data, but
  // they are not necessarily visually central (Bellecour was only ~23 m from
  // an edge). Hosts use the pole of inaccessibility whenever geometry exists.
  const legacyCenter = properties.geom_x_y && typeof properties.geom_x_y === "object"
    ? properties.geom_x_y as Record<string, unknown>
    : null;
  const longitude = asFiniteNumber(
    properties.labelLng
    ?? properties.label_lng
    ?? properties.longitude
    ?? legacyCenter?.lon,
  );
  const latitude = asFiniteNumber(
    properties.labelLat
    ?? properties.label_lat
    ?? properties.latitude
    ?? legacyCenter?.lat,
  );
  if (longitude !== null && latitude !== null) return [longitude, latitude];
  if (bbox) return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
  return fallback;
}

function parseSceneCollection(
  payload: ZoneGeoJsonCollection,
  city: MusicSceneCity,
  options: { filterByCommune?: boolean } = {},
): MusicScene[] {
  const scenes = (payload.features ?? []).flatMap((feature) => {
    const properties = feature.properties ?? {};
    const featureCommuneCode = String(
      properties.cityCode
      ?? properties.communeCode
      ?? properties.commune_code
      ?? properties.parentCode
      ?? properties.parent_code
      ?? "",
    ).toUpperCase();
    if (options.filterByCommune !== false && featureCommuneCode && featureCommuneCode !== city.communeCode) {
      return [];
    }

    const zoneId = String(
      properties.zoneId
      ?? properties.zone_id
      ?? feature.id
      ?? properties.id
      ?? ""
    ).trim();
    const label = String(
      properties.label
      ?? properties.displayName
      ?? properties.name
      ?? properties.l_qu
      ?? "",
    ).trim();
    if (!zoneId || !label) return [];
    const bbox = asBbox(properties.bbox) ?? getGeometryBbox(feature.geometry);
    return [{
      zoneId,
      label,
      communeCode: city.communeCode,
      communeName: city.result.label,
      center: getFeatureCenter(properties, feature.geometry, bbox, city.result.center),
      bbox,
      source: (properties.kind === "commune" ? "single-plate" : "iris") as MusicSceneSource,
      geographyVersion: "vinyl-v1" as const,
      irisCode: String(
        properties.irisCode
        ?? properties.iris_code
        ?? properties.c_quinsee
        ?? "",
      ).trim() || undefined,
    }];
  });

  const byZoneId = new Map<string, MusicScene>();
  for (const scene of scenes) byZoneId.set(scene.zoneId, scene);
  return [...byZoneId.values()].sort((first, second) => first.label.localeCompare(second.label, "fr"));
}

export function loadMusicScenesForCity(city: MusicSceneCity) {
  const cached = sceneCache.get(city.communeCode);
  if (cached) return cached;
  const promise = loadGlobeCityFeatures(city.communeCode, city.result.departmentCode)
    .then(features => {
      const scenes = parseSceneCollection({ features }, city);
      if (!scenes.length) throw new Error('Aucun quartier disponible pour ' + city.result.label + '. Réessaie dans un instant.');
      return scenes;
    }).catch(error => { sceneCache.delete(city.communeCode); throw error; });
  sceneCache.set(city.communeCode, promise);
  return promise;
}

export async function resolveMusicSceneFromCoordinates(latitude: number, longitude: number): Promise<ResolvedMusicScene> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude)>90 || Math.abs(longitude)>180) throw new Error("Position invalide.");
  const point: [number, number] = [longitude, latitude];
  const cities = await loadMusicSceneCityIndex();
  const code = await resolveGlobeCommune(point);
  const city = cities.find(item => item.communeCode === code);
  if (!city) throw new Error("Cette position n’appartient pas à une commune du globe. Choisis ta ville manuellement.");
  const features = await loadGlobeCityFeatures(city.communeCode, city.result.departmentCode);
  const feature = features.find(item => containsGlobePoint(item, point));
  const scenes = await loadMusicScenesForCity(city);
  const scene = scenes.find(item => item.zoneId === String(feature?.id ?? feature?.properties.id));
  if (!scene) throw new Error("Aucun quartier ne contient cette position dans notre découpe. Choisis ton quartier manuellement.");
  return { city, scene };
}

// Resolve saved selections against current polygons before signup/OAuth writes.
// A matching historical source code or an interior point can survive a merge;
// an unambiguous name can also recover a saved selection without coordinates.
export async function canonicalizeMusicSceneSelection(city: MusicSceneCity, saved: MusicScene): Promise<ResolvedMusicScene> {
  const cities = await loadMusicSceneCityIndex();
  const canonicalCity = cities.find(item => item.communeCode === city.communeCode);
  if (!canonicalCity) throw new Error("Cette ancienne commune n’existe plus dans le globe. Choisis à nouveau ta ville.");
  const scenes = await loadMusicScenesForCity(canonicalCity);
  let scene = scenes.find(item => item.zoneId === saved.zoneId);
  const features = await loadGlobeCityFeatures(city.communeCode, canonicalCity.result.departmentCode);
  if (!scene) {
    const oldCode = saved.irisCode || saved.zoneId.match(/(\d{7,9})$/)?.[1];
    const sourceMatches = oldCode ? features.filter(f => String(f.properties.sourceCode ?? '') === oldCode || (f.properties.sourceIds || []).includes(oldCode)) : [];
    const bySource = sourceMatches.length === 1 ? sourceMatches[0] : undefined;
    const byPoint = Array.isArray(saved.center) && saved.center.every(Number.isFinite)
      ? features.find(f => containsGlobePoint(f, saved.center)) : undefined;
    const names = scenes.filter(item => normalizeMusicSceneSearch(item.label) === normalizeMusicSceneSearch(saved.label));
    scene = scenes.find(item => item.zoneId === String(bySource?.id ?? byPoint?.id))
      ?? (names.length === 1 ? names[0] : undefined);
  }
  if (!scene) throw new Error("Le découpage de ton quartier a changé. Choisis à nouveau ton quartier.");
  return { city: canonicalCity, scene };
}
