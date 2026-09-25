import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CityDefinition = {
  bearing: number;
  center: [number, number];
  codes: string[];
  fillColor: string;
  id: string;
  name: string;
  pitch: number;
  presetName?: string;
  rank: number;
  zoom: number;
};

type Point = [number, number];

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_PATH = path.join(ROOT_DIR, "public", "map", "france-urban-areas.geojson");
const CACHE_PATH = path.join(ROOT_DIR, "tmp", "france-urban-area-communes-cache.json");
const GEO_API_URL = "https://geo.api.gouv.fr/communes";
const METERS_PER_LAT_DEGREE = 110_540;
const UX_METRO_DISPLAY_METHOD = "official-commune-contours-ux-amplified-radial-hull-v2";

const CITY_DEFINITIONS: CityDefinition[] = [
  {
    id: "city-paris",
    name: "Paris",
    presetName: "paris",
    center: [2.3522, 48.8566],
    codes: ["75056", "92012", "92024", "92040", "92044", "92046", "92049", "92051", "92075", "93001", "93006", "93045", "93048", "93055", "93066", "93070", "94018", "94028", "94037", "94041", "94043", "94080"],
    fillColor: "#4B3972",
    rank: 1,
    zoom: 11.8,
    pitch: 38,
    bearing: 0,
  },
  {
    id: "city-marseille",
    name: "Marseille",
    presetName: "marseille",
    center: [5.3698, 43.2965],
    codes: ["13055", "13002", "13005", "13007", "13028", "13075", "13097", "13106"],
    fillColor: "#413066",
    rank: 2,
    zoom: 11.8,
    pitch: 35,
    bearing: 0,
  },
  {
    id: "city-lyon",
    name: "Lyon",
    presetName: "lyon",
    center: [4.8357, 45.7640],
    codes: ["69123", "69266", "69259", "69256", "69029", "69034", "69290", "69149", "69202", "69244", "69081", "69199", "69271"],
    fillColor: "#402F65",
    rank: 3,
    zoom: 12,
    pitch: 35,
    bearing: 0,
  },
  {
    id: "city-lille",
    name: "Lille",
    presetName: "lille",
    center: [3.0573, 50.6292],
    codes: ["59350", "59512", "59599", "59009", "59650", "59378", "59163", "59646", "59368", "59328", "59360", "59410"],
    fillColor: "#35245B",
    rank: 4,
    zoom: 12,
    pitch: 35,
    bearing: 0,
  },
  {
    id: "city-toulouse",
    name: "Toulouse",
    center: [1.4442, 43.6047],
    codes: ["31555", "31044", "31069", "31149", "31557", "31446", "31561", "31157", "31186", "31282", "31506", "31541"],
    fillColor: "#35235D",
    rank: 5,
    zoom: 11.9,
    pitch: 36,
    bearing: 118,
  },
  {
    id: "city-bordeaux",
    name: "Bordeaux",
    center: [-0.5792, 44.8378],
    codes: ["33063", "33281", "33318", "33522", "33039", "33119", "33249", "33167", "33075", "33069", "33162", "33550"],
    fillColor: "#36245E",
    rank: 6,
    zoom: 11.9,
    pitch: 36,
    bearing: -28,
  },
  {
    id: "city-nantes",
    name: "Nantes",
    presetName: "nantes",
    center: [-1.5536, 47.2184],
    codes: ["44109", "44162", "44143", "44114", "44215", "44172", "44026", "44020", "44047", "44190", "44035"],
    fillColor: "#4B3972",
    rank: 7,
    zoom: 12,
    pitch: 35,
    bearing: 0,
  },
  {
    id: "city-nice",
    name: "Nice",
    presetName: "nice",
    center: [7.2619, 43.7102],
    codes: ["06088", "06027", "06123", "06159", "06011", "06149", "06114", "06060", "06059"],
    fillColor: "#413066",
    rank: 8,
    zoom: 12.2,
    pitch: 35,
    bearing: 0,
  },
  {
    id: "city-strasbourg",
    name: "Strasbourg",
    center: [7.7521, 48.5734],
    codes: ["67482", "67447", "67218", "67043", "67204", "67365", "67267", "67343", "67296", "67118"],
    fillColor: "#402F65",
    rank: 9,
    zoom: 11.9,
    pitch: 36,
    bearing: 42,
  },
  {
    id: "city-montpellier",
    name: "Montpellier",
    center: [3.8767, 43.6108],
    codes: ["34172", "34057", "34129", "34123", "34270", "34198", "34154", "34077", "34120", "34116"],
    fillColor: "#35245B",
    rank: 10,
    zoom: 11.9,
    pitch: 36,
    bearing: 132,
  },
  {
    id: "city-rennes",
    name: "Rennes",
    center: [-1.6778, 48.1173],
    codes: ["35238", "35051", "35278", "35055", "35047", "35024", "35281", "35066", "35210"],
    fillColor: "#35235D",
    rank: 11,
    zoom: 11.8,
    pitch: 36,
    bearing: -42,
  },
  {
    id: "city-grenoble",
    name: "Grenoble",
    center: [5.7245, 45.1885],
    codes: ["38185", "38421", "38151", "38169", "38229", "38382", "38474", "38485", "38516", "38158"],
    fillColor: "#36245E",
    rank: 12,
    zoom: 11.8,
    pitch: 38,
    bearing: 125,
  },
  {
    id: "city-rouen",
    name: "Rouen",
    center: [1.0993, 49.4432],
    codes: ["76540", "76681", "76322", "76498", "76451", "76575", "76108", "76157", "76410", "76216"],
    fillColor: "#4B3972",
    rank: 13,
    zoom: 11.8,
    pitch: 36,
    bearing: -12,
  },
  {
    id: "city-toulon",
    name: "Toulon",
    center: [5.9280, 43.1242],
    codes: ["83137", "83126", "83144", "83062", "83090", "83129", "83153", "83103", "83047", "83054"],
    fillColor: "#413066",
    rank: 14,
    zoom: 11.8,
    pitch: 36,
    bearing: 145,
  },
  {
    id: "city-reims",
    name: "Reims",
    center: [4.0317, 49.2583],
    codes: ["51454", "51573", "51172", "51055", "51474", "51562", "51058"],
    fillColor: "#402F65",
    rank: 15,
    zoom: 11.8,
    pitch: 36,
    bearing: 24,
  },
];

function metersPerLngDegree(latitude: number) {
  return Math.max(1, 111_320 * Math.cos(latitude * Math.PI / 180));
}

function projectPoint(point: Point, center: Point): Point {
  const metersPerLng = metersPerLngDegree(center[1]);
  return [
    (point[0] - center[0]) * metersPerLng,
    (point[1] - center[1]) * METERS_PER_LAT_DEGREE,
  ];
}

function unprojectPoint(point: Point, center: Point): Point {
  const metersPerLng = metersPerLngDegree(center[1]);
  return [
    Number((center[0] + point[0] / metersPerLng).toFixed(6)),
    Number((center[1] + point[1] / METERS_PER_LAT_DEGREE).toFixed(6)),
  ];
}

function collectOuterRingPoints(geometry: GeoJSON.Geometry | null | undefined, output: Point[] = []) {
  if (!geometry) return output;

  if (geometry.type === "Polygon") {
    const exterior = geometry.coordinates[0] ?? [];
    for (const point of exterior) {
      output.push([point[0], point[1]]);
    }
  }

  if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      const exterior = polygon[0] ?? [];
      for (const point of exterior) {
        output.push([point[0], point[1]]);
      }
    }
  }

  return output;
}

function smoothRadii(radii: number[]) {
  let current = radii;
  for (let pass = 0; pass < 3; pass += 1) {
    current = current.map((radius, index) => {
      const previous = current[(index - 1 + current.length) % current.length] ?? radius;
      const next = current[(index + 1) % current.length] ?? radius;
      return previous * 0.22 + radius * 0.56 + next * 0.22;
    });
  }
  return current;
}

function fillMissingRadii(radii: Array<number | null>) {
  const fallback = radii.find((radius): radius is number => typeof radius === "number") ?? 1200;
  return radii.map((radius, index) => {
    if (typeof radius === "number") return radius;

    for (let offset = 1; offset < radii.length; offset += 1) {
      const previous = radii[(index - offset + radii.length) % radii.length];
      const next = radii[(index + offset) % radii.length];
      if (typeof previous === "number" && typeof next === "number") return (previous + next) / 2;
      if (typeof previous === "number") return previous;
      if (typeof next === "number") return next;
    }

    return fallback;
  });
}

function getUxScale(definition: CityDefinition) {
  if (definition.rank <= 3) return 2.65;
  if (definition.rank <= 8) return 3.1;
  return 3.45;
}

function getUxPaddingMeters(definition: CityDefinition) {
  if (definition.rank <= 3) return 14_000;
  if (definition.rank <= 8) return 12_500;
  return 11_000;
}

function getUxMinRadiusMeters(definition: CityDefinition) {
  if (definition.rank <= 3) return 42_000;
  if (definition.rank <= 8) return 36_000;
  return 31_000;
}

function getUxMaxRadiusMeters(definition: CityDefinition) {
  if (definition.rank <= 3) return 68_000;
  if (definition.rank <= 8) return 58_000;
  return 50_000;
}

function createDisplayHull(points: Point[], center: Point, definition: CityDefinition) {
  const binCount = 112;
  const radii: Array<number | null> = Array.from({ length: binCount }, () => null);

  for (const lonLatPoint of points) {
    const [x, y] = projectPoint(lonLatPoint, center);
    const distance = Math.hypot(x, y);
    if (distance < 80) continue;

    const angle = Math.atan2(y, x);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    const index = Math.floor(normalized / (Math.PI * 2) * binCount) % binCount;
    radii[index] = Math.max(radii[index] ?? 0, distance);
  }

  const uxScale = getUxScale(definition);
  const uxPaddingMeters = getUxPaddingMeters(definition);
  const uxMinRadiusMeters = getUxMinRadiusMeters(definition);
  const uxMaxRadiusMeters = getUxMaxRadiusMeters(definition);
  const smoothed = smoothRadii(fillMissingRadii(radii)).map((radius) => (
    Math.min(Math.max(radius * uxScale + uxPaddingMeters, uxMinRadiusMeters), uxMaxRadiusMeters)
  ));
  const ring = smoothed.map((radius, index) => {
    const angle = index / binCount * Math.PI * 2;
    return unprojectPoint([
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    ], center);
  });
  ring.push(ring[0]);

  return {
    type: "Polygon",
    coordinates: [ring],
  } as GeoJSON.Polygon;
}

function getFeatureCollectionBbox(features: Array<GeoJSON.Feature<GeoJSON.Geometry, any>>) {
  const points = features.flatMap((feature) => collectOuterRingPoints(feature.geometry));
  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    Math.min(...lngs),
    Math.min(...lats),
    Math.max(...lngs),
    Math.max(...lats),
  ];
}

async function readCache() {
  try {
    return JSON.parse(await readFile(CACHE_PATH, "utf8")) as Record<string, GeoJSON.Feature<GeoJSON.Geometry, any>>;
  } catch {
    return {};
  }
}

async function writeCache(cache: Record<string, GeoJSON.Feature<GeoJSON.Geometry, any>>) {
  await mkdir(path.dirname(CACHE_PATH), { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(cache)}\n`);
}

async function fetchCommuneFeature(code: string, cache: Record<string, GeoJSON.Feature<GeoJSON.Geometry, any>>) {
  if (cache[code]) return cache[code];

  const url = new URL(GEO_API_URL);
  url.searchParams.set("code", code);
  url.searchParams.set("fields", "nom,code,departement,population");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("geometry", "contour");

  const response = await fetch(url, {
    headers: {
      "user-agent": "Meewav-Web france urban areas generator/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`geo.api.gouv.fr failed for commune ${code}: ${response.status}`);
  }

  const collection = await response.json();
  const feature = collection?.features?.[0];
  if (!feature?.geometry) {
    throw new Error(`Missing commune contour for ${code}`);
  }

  cache[code] = feature;
  return feature;
}

async function createUrbanAreaFeature(definition: CityDefinition, cache: Record<string, GeoJSON.Feature<GeoJSON.Geometry, any>>) {
  const communeFeatures = await Promise.all(definition.codes.map((code) => fetchCommuneFeature(code, cache)));
  const sourcePoints = communeFeatures.flatMap((feature) => collectOuterRingPoints(feature.geometry));
  const bbox = getFeatureCollectionBbox(communeFeatures);
  const geometry = createDisplayHull(sourcePoints, definition.center, definition);

  return {
    type: "Feature",
    id: definition.id,
    properties: {
      id: definition.id,
      name: definition.name,
      presetName: definition.presetName ?? null,
      fillColor: definition.fillColor,
      rank: definition.rank,
      labelLng: definition.center[0],
      labelLat: definition.center[1],
      targetLng: definition.center[0],
      targetLat: definition.center[1],
      targetZoom: definition.zoom,
      targetPitch: definition.pitch,
      targetBearing: definition.bearing,
      targetSpeed: 0.9,
      targetCurve: 1.35,
      artistCount: 0,
      hoverCountLabel: "0",
      zoneType: "metro",
      source: "geo.api.gouv.fr communes",
      sourceCommuneCodes: definition.codes,
      sourceCommuneCount: communeFeatures.length,
      sourceBbox: bbox,
      displayGeometryMethod: UX_METRO_DISPLAY_METHOD,
      displayUxScale: getUxScale(definition),
      displayUxPaddingMeters: getUxPaddingMeters(definition),
      displayUxMinRadiusMeters: getUxMinRadiusMeters(definition),
      displayUxMaxRadiusMeters: getUxMaxRadiusMeters(definition),
    },
    geometry,
  } satisfies GeoJSON.Feature<GeoJSON.Polygon, Record<string, unknown>>;
}

async function main() {
  const cache = await readCache();
  const features = [];

  for (const definition of CITY_DEFINITIONS) {
    features.push(await createUrbanAreaFeature(definition, cache));
    console.log(`Generated ${definition.name} from ${definition.codes.length} communes`);
  }

  await writeCache(cache);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    type: "FeatureCollection",
    metadata: {
      generatedBy: "scripts/generate-france-urban-areas.ts",
      source: "geo.api.gouv.fr commune contours",
      displayGeometryMethod: UX_METRO_DISPLAY_METHOD,
      featureCount: features.length,
    },
    features,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
