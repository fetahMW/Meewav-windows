#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT_DIRECTORY = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_OUTPUT_PATH = "src/features/globe/geography/franceGuideAlphaCities.generated.ts";

const CAMERA_QUANTILE_LOW = 0.1;
const CAMERA_QUANTILE_HIGH = 0.9;
const CAMERA_MIN_FULL_EXTENT_RATIO = 0.25;
const CAMERA_MIN_GEOGRAPHIC_SPAN = 0.004;
const CAMERA_ZOOM_CALIBRATION = 9.4;
const CAMERA_MIN_ZOOM = 11.8;
const CAMERA_MAX_ZOOM = 13.6;
const CAMERA_ZOOM_STEP = 0.05;

const GUIDE_ALPHA_FLY = Object.freeze({
  pitch: 60,
  bearing: 0,
  speed: 0.85,
  curve: 1.4,
});

const TERRITORIAL_SOURCES = Object.freeze([
  {
    owner: "metropolitan",
    ownerId: "nice",
    overviewPath: "public/map/nice-metropole-communes.geojson",
    subdivisionsPath: "public/map/nice-metropole-subzones.geojson",
  },
  {
    owner: "metropolitan",
    ownerId: "lyon",
    overviewPath: "public/map/lyon-metropole-communes.geojson",
    subdivisionsPath: "public/map/lyon-metropole-subzones.geojson",
  },
  {
    owner: "metropolitan",
    ownerId: "nantes",
    overviewPath: "public/map/nantes-metropole-communes.geojson",
    subdivisionsPath: "public/map/nantes-metropole-subzones.geojson",
  },
  {
    owner: "metropolitan",
    ownerId: "marseille",
    overviewPath: "public/map/marseille-metropole-communes.geojson",
    subdivisionsPath: "public/map/marseille-metropole-subzones.geojson",
  },
  {
    owner: "metropolitan",
    ownerId: "lille",
    overviewPath: "public/map/lille-metropole-communes.geojson",
    subdivisionsPath: "public/map/lille-metropole-subzones.geojson",
  },
  {
    owner: "grand_paris",
    ownerId: "grand_paris",
    overviewPath: "public/map/grand-paris-communes-overview.geojson",
    subdivisionsPath: "public/map/grand-paris-subzones.geojson",
  },
]);

const OWNER_PRIORITY = Object.freeze({
  standalone: 0,
  metropolitan: 1,
  grand_paris: 2,
});

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function requiredText(value, context) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${context} is required`);
  return text;
}

function assertFeatureCollection(collection, context) {
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`${context} must be a GeoJSON FeatureCollection`);
  }
}

async function readJson(rootDirectory, relativePath) {
  const absolutePath = path.resolve(rootDirectory, relativePath);
  const source = await readFile(absolutePath, "utf8");
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`Invalid JSON in ${relativePath}: ${error.message}`);
  }
}

function publicUrl(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (!normalized.startsWith("public/")) {
    throw new Error(`Runtime GeoJSON must live below public/: ${relativePath}`);
  }
  return `/${normalized.slice("public/".length)}`;
}

function visitCoordinates(coordinates, visitor) {
  if (!Array.isArray(coordinates)) return;
  if (
    coordinates.length >= 2
    && Number.isFinite(Number(coordinates[0]))
    && Number.isFinite(Number(coordinates[1]))
  ) {
    visitor(Number(coordinates[0]), Number(coordinates[1]));
    return;
  }
  for (const child of coordinates) visitCoordinates(child, visitor);
}

export function computeCollectionBbox(collection) {
  assertFeatureCollection(collection, "GeoJSON collection");
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;

  const include = (longitude, latitude) => {
    west = Math.min(west, longitude);
    south = Math.min(south, latitude);
    east = Math.max(east, longitude);
    north = Math.max(north, latitude);
  };

  for (const feature of collection.features) {
    const bbox = feature?.properties?.bbox ?? feature?.bbox;
    if (
      Array.isArray(bbox)
      && bbox.length >= 4
      && bbox.slice(0, 4).every((value) => Number.isFinite(Number(value)))
    ) {
      include(Number(bbox[0]), Number(bbox[1]));
      include(Number(bbox[2]), Number(bbox[3]));
      continue;
    }
    visitCoordinates(feature?.geometry?.coordinates, include);
  }

  if (![west, south, east, north].every(Number.isFinite) || west > east || south > north) {
    throw new Error("GeoJSON collection has no finite geometry extent");
  }
  return [west, south, east, north].map((value) => round(value));
}

export function quantile(values, ratio) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("quantile requires at least one finite value");
  }
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) throw new Error("quantile requires at least one finite value");
  const position = (sorted.length - 1) * Math.min(1, Math.max(0, ratio));
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const fraction = position - lowerIndex;
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * fraction;
}

function getLabelPoints(collection) {
  return collection.features.flatMap((feature) => {
    const longitude = Number(feature?.properties?.labelLng);
    const latitude = Number(feature?.properties?.labelLat);
    return Number.isFinite(longitude) && Number.isFinite(latitude)
      ? [[longitude, latitude]]
      : [];
  });
}

export function computeRobustCamera(collection, bbox = computeCollectionBbox(collection)) {
  const labelPoints = getLabelPoints(collection);
  const [west, south, east, north] = bbox;
  const longitudeValues = labelPoints.map(([longitude]) => longitude);
  const latitudeValues = labelPoints.map(([, latitude]) => latitude);
  const center = labelPoints.length
    ? [quantile(longitudeValues, 0.5), quantile(latitudeValues, 0.5)]
    : [(west + east) / 2, (south + north) / 2];

  const useQuantileExtent = labelPoints.length >= 5;
  const centralWest = useQuantileExtent ? quantile(longitudeValues, CAMERA_QUANTILE_LOW) : west;
  const centralSouth = useQuantileExtent ? quantile(latitudeValues, CAMERA_QUANTILE_LOW) : south;
  const centralEast = useQuantileExtent ? quantile(longitudeValues, CAMERA_QUANTILE_HIGH) : east;
  const centralNorth = useQuantileExtent ? quantile(latitudeValues, CAMERA_QUANTILE_HIGH) : north;

  // Quantiles remove remote islands and oversized rural tails. The ratio guard keeps
  // a dense cluster from producing a camera that is too close to be usable.
  const guardedLongitudeSpan = Math.max(
    centralEast - centralWest,
    (east - west) * CAMERA_MIN_FULL_EXTENT_RATIO,
  );
  const guardedLatitudeSpan = Math.max(
    centralNorth - centralSouth,
    (north - south) * CAMERA_MIN_FULL_EXTENT_RATIO,
  );
  const latitudeScale = Math.max(0.15, Math.cos(center[1] * Math.PI / 180));
  const geographicSpan = Math.max(
    guardedLongitudeSpan * latitudeScale,
    guardedLatitudeSpan,
    CAMERA_MIN_GEOGRAPHIC_SPAN,
  );
  const rawZoom = CAMERA_ZOOM_CALIBRATION - Math.log2(geographicSpan);
  const steppedZoom = Math.round(rawZoom / CAMERA_ZOOM_STEP) * CAMERA_ZOOM_STEP;
  const zoom = Math.min(CAMERA_MAX_ZOOM, Math.max(CAMERA_MIN_ZOOM, steppedZoom));
  const fitExtentInsideBounds = (coordinate, requestedSpan, minimum, maximum) => {
    const span = Math.min(requestedSpan, maximum - minimum);
    let lower = coordinate - span / 2;
    let upper = coordinate + span / 2;
    if (lower < minimum) {
      upper += minimum - lower;
      lower = minimum;
    }
    if (upper > maximum) {
      lower -= upper - maximum;
      upper = maximum;
    }
    return [Math.max(minimum, lower), Math.min(maximum, upper)];
  };
  const [robustWest, robustEast] = fitExtentInsideBounds(
    center[0],
    guardedLongitudeSpan,
    west,
    east,
  );
  const [robustSouth, robustNorth] = fitExtentInsideBounds(
    center[1],
    guardedLatitudeSpan,
    south,
    north,
  );
  const robustBbox = [robustWest, robustSouth, robustEast, robustNorth];

  return {
    center: center.map((value) => round(value)),
    zoom: round(zoom, 2),
    robustBbox: robustBbox.map((value) => round(value)),
    labelPointCount: labelPoints.length,
  };
}

function stripAccents(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function createSearchFeatureId(value) {
  const slug = stripAccents(value)
    .toLocaleLowerCase("fr")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `city-${slug}`;
}

function createSearchMetadata(city) {
  const aliases = [];
  const folded = stripAccents(city.name);
  const spaced = city.name.replace(/[’'\-]+/g, " ").replace(/\s+/g, " ").trim();
  const identifier = city.id.replaceAll("_", " ");
  for (const alias of [folded, spaced, identifier]) {
    if (
      alias
      && alias.toLocaleLowerCase("fr") !== city.name.toLocaleLowerCase("fr")
      && !aliases.some((candidate) => candidate.toLocaleLowerCase("fr") === alias.toLocaleLowerCase("fr"))
    ) {
      aliases.push(alias);
    }
  }
  return aliases.length ? { label: city.name, aliases } : { label: city.name };
}

function getOverviewCommuneCode(feature, context) {
  return requiredText(
    feature?.properties?.communeCode
      ?? feature?.properties?.code
      ?? feature?.properties?.officialId,
    `${context} commune code`,
  );
}

function getSubdivisionCommuneCode(feature, context) {
  return requiredText(
    feature?.properties?.communeCode
      ?? feature?.properties?.parentCode
      ?? feature?.properties?.arrondissementCode,
    `${context} parent commune code`,
  );
}

function getFeatureId(feature, context) {
  return requiredText(
    feature?.id ?? feature?.properties?.zoneId ?? feature?.properties?.id,
    `${context} feature id`,
  );
}

async function buildStandaloneCities(rootDirectory, catalog) {
  const seenIds = new Set();
  const seenCommuneCodes = new Set();
  const cities = [];

  for (const catalogCity of catalog.cities) {
    const id = requiredText(catalogCity.id, "catalog city id");
    const name = requiredText(catalogCity.name, `${id} name`);
    const communeCode = requiredText(catalogCity.communeCode, `${id} communeCode`);
    const outputPath = requiredText(catalogCity.outputPath, `${id} outputPath`).replaceAll("\\", "/");
    if (seenIds.has(id)) throw new Error(`Duplicate catalog city id: ${id}`);
    if (seenCommuneCodes.has(communeCode)) throw new Error(`Duplicate standalone commune code: ${communeCode}`);
    seenIds.add(id);
    seenCommuneCodes.add(communeCode);

    const collection = await readJson(rootDirectory, outputPath);
    assertFeatureCollection(collection, outputPath);
    if (collection.features.length === 0) throw new Error(`${outputPath} has no subdivisions`);
    const mismatchedFeature = collection.features.find((feature) => (
      String(feature?.properties?.communeCode ?? "") !== communeCode
    ));
    if (mismatchedFeature) {
      throw new Error(`${outputPath} contains a feature outside commune ${communeCode}`);
    }

    const bbox = computeCollectionBbox(collection);
    const camera = computeRobustCamera(collection, bbox);
    const featureId = `city-${id.replaceAll("_", "-")}`;
    cities.push({
      id,
      featureId,
      communeCode,
      sourceUrl: publicUrl(outputPath),
      zoneIdPrefix: `${id}_`,
      bbox,
      center: camera.center,
      zoom: camera.zoom,
      cameraExtent: camera.robustBbox,
      subdivisionCount: collection.features.length,
      search: createSearchMetadata({ id, name }),
      fly: GUIDE_ALPHA_FLY,
    });
  }

  return cities.sort((left, right) => compareText(left.id, right.id));
}

async function buildTerritorialEntries(rootDirectory, source) {
  const [overview, subdivisions] = await Promise.all([
    readJson(rootDirectory, source.overviewPath),
    readJson(rootDirectory, source.subdivisionsPath),
  ]);
  assertFeatureCollection(overview, source.overviewPath);
  assertFeatureCollection(subdivisions, source.subdivisionsPath);

  const subdivisionCounts = new Map();
  for (const feature of subdivisions.features) {
    const communeCode = getSubdivisionCommuneCode(feature, source.subdivisionsPath);
    subdivisionCounts.set(communeCode, (subdivisionCounts.get(communeCode) ?? 0) + 1);
  }

  const seenCodes = new Set();
  const entries = overview.features.map((feature) => {
    const communeCode = getOverviewCommuneCode(feature, source.overviewPath);
    if (seenCodes.has(communeCode)) {
      throw new Error(`${source.overviewPath} contains duplicate commune ${communeCode}`);
    }
    seenCodes.add(communeCode);
    const subdivisionCount = subdivisionCounts.get(communeCode) ?? 0;
    if (subdivisionCount < 1) {
      throw new Error(`${source.subdivisionsPath} has no subdivision for commune ${communeCode}`);
    }
    return {
      communeCode,
      label: requiredText(
        feature?.properties?.label ?? feature?.properties?.name,
        `${source.overviewPath} ${communeCode} label`,
      ),
      owner: source.owner,
      ownerId: source.ownerId,
      searchFeatureId: createSearchFeatureId(
        feature?.properties?.label ?? feature?.properties?.name,
      ),
      overviewFeatureId: getFeatureId(feature, `${source.overviewPath} ${communeCode}`),
      overviewSourceUrl: publicUrl(source.overviewPath),
      subdivisionSourceUrl: publicUrl(source.subdivisionsPath),
      subdivisionCount,
    };
  });

  const unknownSubdivisionCodes = [...subdivisionCounts.keys()].filter((code) => !seenCodes.has(code));
  if (unknownSubdivisionCodes.length) {
    throw new Error(
      `${source.subdivisionsPath} references missing overview communes: ${unknownSubdivisionCodes.join(", ")}`,
    );
  }
  return entries;
}

function chooseRegistryEntry(candidates) {
  return [...candidates].sort((left, right) => (
    OWNER_PRIORITY[left.owner] - OWNER_PRIORITY[right.owner]
      || compareText(left.ownerId, right.ownerId)
  ))[0];
}

async function buildSubdivisionRegistry(rootDirectory, cities) {
  const candidatesByCode = new Map();
  const addCandidate = (entry) => {
    const current = candidatesByCode.get(entry.communeCode) ?? [];
    current.push(entry);
    candidatesByCode.set(entry.communeCode, current);
  };

  for (const city of cities) {
    addCandidate({
      communeCode: city.communeCode,
      label: city.search.label,
      owner: "standalone",
      ownerId: city.id,
      searchFeatureId: city.featureId,
      overviewFeatureId: city.featureId,
      overviewSourceUrl: null,
      subdivisionSourceUrl: city.sourceUrl,
      subdivisionCount: city.subdivisionCount,
    });
  }

  const territorialEntryGroups = await Promise.all(
    TERRITORIAL_SOURCES.map((source) => buildTerritorialEntries(rootDirectory, source)),
  );
  for (const entry of territorialEntryGroups.flat()) addCandidate(entry);

  return [...candidatesByCode.entries()]
    .map(([communeCode, candidates]) => ({
      ...chooseRegistryEntry(candidates),
      availableOwners: candidates
        .map(({ owner, ownerId }) => ({ owner, ownerId }))
        .sort((left, right) => (
          OWNER_PRIORITY[left.owner] - OWNER_PRIORITY[right.owner]
            || compareText(left.ownerId, right.ownerId)
        )),
      communeCode,
    }))
    .sort((left, right) => compareText(left.communeCode, right.communeCode));
}

export async function buildCityRuntimeManifest(rootDirectory = DEFAULT_ROOT_DIRECTORY) {
  const catalog = await readJson(rootDirectory, "geo/catalog/france-city-iris.json");
  if (!Array.isArray(catalog?.cities)) {
    throw new Error("geo/catalog/france-city-iris.json must expose a cities array");
  }
  const cities = await buildStandaloneCities(rootDirectory, catalog);
  const subdivisionRegistry = await buildSubdivisionRegistry(rootDirectory, cities);
  return { cities, subdivisionRegistry };
}

function serialize(value, indentation = 2) {
  return JSON.stringify(value, null, indentation);
}

export function renderCityRuntimeModule({ cities, subdivisionRegistry }) {
  const cityJson = serialize(cities);
  const registryJson = serialize(subdivisionRegistry);
  return `// This file is generated. Do not edit it by hand.
// Run: node scripts/geo/generate-city-runtime-manifest.mjs

export type FranceGuideAlphaGeneratedBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type FranceGuideAlphaGeneratedSearchMetadata = {
  readonly label: string;
  readonly aliases?: readonly string[];
};

export type FranceGuideAlphaGeneratedCity = {
  readonly id: string;
  readonly featureId: \`city-\${string}\`;
  readonly communeCode: string;
  readonly sourceUrl: \`/map/\${string}.geojson\`;
  readonly zoneIdPrefix: \`\${string}_\`;
  readonly bbox: FranceGuideAlphaGeneratedBounds;
  readonly center: readonly [longitude: number, latitude: number];
  readonly zoom: number;
  readonly cameraExtent: FranceGuideAlphaGeneratedBounds;
  readonly subdivisionCount: number;
  readonly search: FranceGuideAlphaGeneratedSearchMetadata;
  readonly fly: {
    readonly pitch: 60;
    readonly bearing: 0;
    readonly speed: 0.85;
    readonly curve: 1.4;
  };
};

export type FranceCommuneSubdivisionOwner = "standalone" | "metropolitan" | "grand_paris";

export type FranceCommuneSubdivisionRegistryEntry = {
  readonly communeCode: string;
  readonly label: string;
  readonly owner: FranceCommuneSubdivisionOwner;
  readonly ownerId: string;
  readonly searchFeatureId: \`city-\${string}\`;
  readonly overviewFeatureId: string;
  readonly overviewSourceUrl: \`/map/\${string}.geojson\` | null;
  readonly subdivisionSourceUrl: \`/map/\${string}.geojson\`;
  readonly subdivisionCount: number;
  readonly availableOwners: readonly {
    readonly owner: FranceCommuneSubdivisionOwner;
    readonly ownerId: string;
  }[];
};

export const FRANCE_GUIDE_ALPHA_GENERATED_CITIES = ${cityJson} as const satisfies readonly FranceGuideAlphaGeneratedCity[];

export const GUIDE_ALPHA_GENERATED_CITIES = FRANCE_GUIDE_ALPHA_GENERATED_CITIES;

export type FranceGuideAlphaGeneratedCityId =
  (typeof FRANCE_GUIDE_ALPHA_GENERATED_CITIES)[number]["id"];

export const FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_ID = new Map(
  FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [city.id, city] as const),
);

export const FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_FEATURE_ID = new Map(
  FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [city.featureId, city] as const),
);

export const FRANCE_GUIDE_ALPHA_GENERATED_CITY_BY_COMMUNE_CODE = new Map(
  FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [city.communeCode, city] as const),
);

export const GUIDE_ALPHA_GENERATED_PRESET_BY_FEATURE_ID = Object.freeze(
  Object.fromEntries(
    FRANCE_GUIDE_ALPHA_GENERATED_CITIES.flatMap((city) => [
      [city.featureId, city.id],
      [\`commune-\${city.communeCode}\`, city.id],
    ]),
  ) as Readonly<Record<string, FranceGuideAlphaGeneratedCityId>>,
);

export const GUIDE_ALPHA_GENERATED_CAMERA_PRESETS = Object.freeze(
  Object.fromEntries(
    FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [
      city.id,
      {
        name: city.id,
        center: [...city.center] as [number, number],
        zoom: city.zoom,
        ...city.fly,
      },
    ]),
  ) as Readonly<Record<FranceGuideAlphaGeneratedCityId, {
    readonly name: FranceGuideAlphaGeneratedCityId;
    readonly center: [number, number];
    readonly zoom: number;
    readonly pitch: 60;
    readonly bearing: 0;
    readonly speed: 0.85;
    readonly curve: 1.4;
  }>>,
);

export const FRANCE_COMMUNE_SUBDIVISION_REGISTRY = ${registryJson} as const satisfies readonly FranceCommuneSubdivisionRegistryEntry[];

export const FRANCE_COMMUNE_SUBDIVISION_BY_CODE: ReadonlyMap<
  string,
  FranceCommuneSubdivisionRegistryEntry
> = new Map(
  FRANCE_COMMUNE_SUBDIVISION_REGISTRY.map((entry) => [entry.communeCode, entry] as const),
);

export const FRANCE_COMMUNE_SUBDIVISION_BY_FEATURE_ID: ReadonlyMap<
  string,
  FranceCommuneSubdivisionRegistryEntry
> = new Map(
  FRANCE_COMMUNE_SUBDIVISION_REGISTRY.flatMap((entry) => [
    [entry.searchFeatureId, entry] as const,
    [\`commune-\${entry.communeCode}\`, entry] as const,
  ]),
);
`;
}

export async function generateCityRuntimeManifest(
  rootDirectory = DEFAULT_ROOT_DIRECTORY,
  outputPath = DEFAULT_OUTPUT_PATH,
) {
  const manifest = await buildCityRuntimeManifest(rootDirectory);
  const source = renderCityRuntimeModule(manifest);
  const absoluteOutputPath = path.resolve(rootDirectory, outputPath);
  await writeFile(absoluteOutputPath, source, "utf8");
  return { ...manifest, outputPath: absoluteOutputPath, source };
}

async function main() {
  const rootArgument = process.argv.find((argument) => argument.startsWith("--root="));
  const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
  const rootDirectory = rootArgument
    ? path.resolve(rootArgument.slice("--root=".length))
    : DEFAULT_ROOT_DIRECTORY;
  const outputPath = outputArgument?.slice("--output=".length) || DEFAULT_OUTPUT_PATH;
  const result = await generateCityRuntimeManifest(rootDirectory, outputPath);
  console.log(
    `Generated ${result.cities.length} city runtime records and ${result.subdivisionRegistry.length} commune ownership records at ${result.outputPath}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
