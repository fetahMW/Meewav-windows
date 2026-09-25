import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { featureCollection } from "@turf/helpers";
import unionPolygons from "@turf/union";
import {
  computeBbox,
  findRepresentativePoint,
  getPolygons,
  pointInGeometryInterior,
  validateGeometry,
} from "./geometry.mjs";
import { groupHumanNamedZones } from "./group-human-zones.mjs";

function stripAccents(value) {
  return String(value)
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "AE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ringAreaSquareMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const latitude = ring.reduce((sum, coordinate) => sum + Number(coordinate[1]), 0) / ring.length;
  const longitudeScale = 111_320 * Math.cos(latitude * Math.PI / 180);
  const latitudeScale = 110_540;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    twiceArea += current[0] * longitudeScale * next[1] * latitudeScale
      - next[0] * longitudeScale * current[1] * latitudeScale;
  }
  return twiceArea / 2;
}

function geometryAreaSquareMeters(geometry) {
  return getPolygons(geometry).reduce((sum, polygon) => {
    const exterior = Math.abs(ringAreaSquareMeters(polygon[0]));
    const holes = polygon.slice(1).reduce((holeSum, ring) => holeSum + Math.abs(ringAreaSquareMeters(ring)), 0);
    return sum + Math.max(0, exterior - holes);
  }, 0);
}

function requiredText(value, context) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${context} is required`);
  return text;
}

export function repairOfficialGeometry(geometry, context = "official geometry") {
  const initialErrors = validateGeometry(geometry, context);
  if (!initialErrors.length) return { geometry, method: null };
  if (initialErrors.some((error) => error.code !== "geometry.ring.self_intersection")) {
    throw new Error(`${initialErrors[0].path}: ${initialErrors[0].message}`);
  }

  let repairedFeature;
  try {
    const sourceFeature = { type: "Feature", properties: {}, geometry };
    // A polygonal self-union runs the official rings through the robust
    // clipping kernel without adding, buffering or simplifying any boundary.
    repairedFeature = unionPolygons(featureCollection([sourceFeature, sourceFeature]));
  } catch (error) {
    throw new Error(`${context} self-union repair failed: ${error?.message ?? error}`);
  }
  if (!repairedFeature?.geometry) throw new Error(`${context} self-union repair returned no geometry`);
  const repairedErrors = validateGeometry(repairedFeature.geometry, `${context} repaired`);
  if (repairedErrors.length) {
    throw new Error(`${repairedErrors[0].path}: ${repairedErrors[0].message}`);
  }

  const beforeBbox = computeBbox(geometry);
  const afterBbox = computeBbox(repairedFeature.geometry);
  if (!beforeBbox || !afterBbox || beforeBbox.some((value, index) => Math.abs(value - afterBbox[index]) > 1e-8)) {
    throw new Error(`${context} self-union repair changed the official geometry extent`);
  }
  return { geometry: repairedFeature.geometry, method: "polygonal_self_union" };
}

function getNumberedLabels(features) {
  return features.flatMap((feature) => {
    const label = String(feature?.properties?.label ?? "").trim();
    const match = label.match(/^(.*?\p{L})(?:[\s-]*)(\d+)$/u);
    return match?.[1]?.trim() ? [{ label, baseLabel: match[1].trim() }] : [];
  });
}

function getNumberedLabelFamilies(features) {
  const families = new Map();
  for (const { label, baseLabel } of getNumberedLabels(features)) {
    families.set(baseLabel, [...(families.get(baseLabel) ?? []), label]);
  }
  return [...families.entries()].filter(([, labels]) => labels.length > 1);
}

function getDuplicateLabels(features) {
  const counts = new Map();
  for (const feature of features) {
    const label = String(feature?.properties?.label ?? "").trim();
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1);
}

function getCuratedSourceIds(city) {
  return new Set((city.humanZoneCuration?.operations ?? []).flatMap((operation) => (
    operation.type === "merge" ? operation.sourceIds ?? [] : [operation.sourceId]
  )).map(String));
}

function assertHumanLabelContract(features, city, { afterGrouping = false } = {}) {
  const curatedSourceIds = getCuratedSourceIds(city);
  const inspectedFeatures = afterGrouping
    ? features.filter((feature) => !feature.properties?.semanticLabelReviewed)
    : features.filter((feature) => !curatedSourceIds.has(String(feature.properties?.officialId ?? "")));
  const numberedLabels = getNumberedLabels(inspectedFeatures);
  const numberedFamilies = getNumberedLabelFamilies(inspectedFeatures);
  const duplicateLabels = getDuplicateLabels(inspectedFeatures);
  const normalizedCity = stripAccents(city.name).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const escapedCity = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const cityPrefixedStatisticalPattern = escapedCity.length > 0
    ? new RegExp(`^${escapedCity}\\s+\\d+(?:\\s+.+)?$`, "u")
    : null;
  const technicalLabels = inspectedFeatures
    .map((feature) => String(feature?.properties?.label ?? "").trim())
    .filter((label) => {
      const normalized = stripAccents(label).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return /^(?:nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest))$/u.test(normalized)
        || /^iris(?:[\s_-]*\d+)?$/iu.test(label)
        || /^\d+$/.test(label)
        || cityPrefixedStatisticalPattern?.test(normalized);
    });
  if (technicalLabels.length) {
    throw new Error(`${city.name} contains technical labels without a human place name: ${technicalLabels.slice(0, 5).join(", ")}`);
  }
  if (numberedFamilies.length && (afterGrouping || !city.humanZoneGrouping?.stripTrailingNumber)) {
    throw new Error(`${city.name} contains numbered statistical families that require geometry grouping: ${numberedFamilies.map(([label]) => label).join(", ")}`);
  }
  if (afterGrouping && numberedLabels.length) {
    throw new Error(`${city.name} contains residual numbered statistical labels after geometry grouping: ${numberedLabels.map(({ label }) => label).join(", ")}`);
  }
  if (duplicateLabels.length && (afterGrouping || !city.humanZoneGrouping?.mergeExactLabels)) {
    throw new Error(`${city.name} contains duplicate human labels that require an explicit grouping rule: ${duplicateLabels.map(([label]) => label).join(", ")}`);
  }
}

function createWfsUrl(source, communeCode) {
  const url = new URL(source.wfsUrl);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", source.typeName);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("COUNT", "1000");
  url.searchParams.set("CQL_FILTER", `code_insee='${communeCode}'`);
  url.searchParams.set("SRSNAME", "EPSG:4326");
  return url;
}

async function fetchOfficialCollection(source, city) {
  const url = createWfsUrl(source, city.communeCode);
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": `Meewav-Web ${city.id} IRIS generator/1.0`,
          "x-meewav-fetch-attempt": String(attempt),
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new Error(`invalid JSON (${response.headers.get("content-type") ?? "unknown content type"})`);
      }
      if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
        throw new Error("response is not a FeatureCollection");
      }
      return { payload, url };
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw new Error(`Unable to download ${city.name} IRIS after 4 attempts: ${lastError?.message ?? lastError}`);
}

function normalizeFeature(feature, city, source, colorIndex) {
  const properties = feature?.properties ?? {};
  const communeCode = requiredText(properties.code_insee, "code_insee");
  const communeName = requiredText(properties.nom_commune, "nom_commune");
  const officialId = requiredText(properties.code_iris, "code_iris");
  const irisCode = requiredText(properties.iris, "iris");
  const label = requiredText(properties.nom_iris, "nom_iris");
  if (communeCode !== city.communeCode) {
    throw new Error(`IRIS ${officialId} belongs to ${communeCode}, expected ${city.communeCode}`);
  }
  if (communeName.toLocaleLowerCase("fr") !== city.name.toLocaleLowerCase("fr")) {
    throw new Error(`IRIS ${officialId} belongs to ${communeName}, expected ${city.name}`);
  }
  const repairedGeometry = repairOfficialGeometry(feature.geometry, `IRIS ${officialId}`);
  const geometry = repairedGeometry.geometry;
  const bbox = computeBbox(geometry);
  const labelPoint = findRepresentativePoint(geometry);
  if (!bbox || !labelPoint || !pointInGeometryInterior(labelPoint, geometry)) {
    throw new Error(`Unable to compute an interior label point for IRIS ${officialId}`);
  }
  const zoneId = `${city.id}_${officialId}_${slugify(label)}`;
  // Use the canonical city ID for the parent suffix as well. Homonymous
  // communes carry their INSEE disambiguator in city.id, while slugifying the
  // display name alone would collapse their parent identities.
  const parentZoneId = `${city.id}_parent_${city.communeCode}_${city.id}`;
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      districtCode: officialId,
      arrondissementCode: city.communeCode,
      colorIndex,
      parentZoneId,
      parentCode: city.communeCode,
      parentLabel: city.name,
      territoryType: "iris",
      source: source.provider,
      sourceYear: source.vintage,
      officialId,
      sourceCleabs: String(properties.cleabs ?? ""),
      communeCode,
      communeName,
      irisCode,
      irisType: String(properties.type_iris ?? ""),
      officialAreaM2: geometryAreaSquareMeters(geometry),
      ...(repairedGeometry.method ? { sourceGeometryRepair: repairedGeometry.method } : {}),
      labelLng: labelPoint[0],
      labelLat: labelPoint[1],
      bbox,
    },
    geometry,
  };
}

export function createCityIrisCollection(payload, city, source, { generatedAt = new Date().toISOString(), sourceUrl = null } = {}) {
  const matchingFeatures = payload.features
    .filter((feature) => String(feature?.properties?.code_insee ?? "") === city.communeCode)
    .sort((first, second) => String(first.properties?.code_iris).localeCompare(String(second.properties?.code_iris)));
  if (matchingFeatures.length !== Number(city.expectedFeatureCount)) {
    throw new Error(`Expected ${city.expectedFeatureCount} ${city.name} IRIS, received ${matchingFeatures.length}`);
  }
  const normalizedFeatures = matchingFeatures.map((feature, index) => normalizeFeature(feature, city, source, index % 8));
  const zoneIds = new Set(normalizedFeatures.map((feature) => feature.properties.zoneId));
  if (zoneIds.size !== normalizedFeatures.length) throw new Error(`Duplicate ${city.name} zone IDs`);
  assertHumanLabelContract(normalizedFeatures, city);
  const baseCollection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt,
      source: source.provider,
      datasetId: source.typeName,
      datasetUrl: source.datasetUrl,
      sourceFileUrl: sourceUrl,
      license: source.license,
      sourceYear: source.vintage,
      communeCode: city.communeCode,
      communeName: city.name,
      featureCount: normalizedFeatures.length,
      parentCount: 1,
      parentContract: "technical commune group; not selectable and not displayed as a district",
    },
    features: normalizedFeatures,
  };
  const collection = city.humanZoneGrouping || city.humanZoneCuration
    ? groupHumanNamedZones(baseCollection, {
        ...(city.humanZoneGrouping ?? {}),
        curation: city.humanZoneCuration,
        expectedFeatureCount: city.humanZoneCuration?.expectedFeatureCount
          ?? city.humanZoneGrouping?.expectedFeatureCount,
        cityId: city.id,
        communeCode: city.communeCode,
        communeName: city.name,
        source: source.provider,
        sourceYear: source.vintage,
      })
    : baseCollection;
  assertHumanLabelContract(collection.features, city, { afterGrouping: true });
  const areas = collection.features.map((feature) => feature.properties.officialAreaM2);
  const bbox = collection.features.reduce((result, feature) => [
    Math.min(result[0], feature.properties.bbox[0]),
    Math.min(result[1], feature.properties.bbox[1]),
    Math.max(result[2], feature.properties.bbox[2]),
    Math.max(result[3], feature.properties.bbox[3]),
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  return {
    ...collection,
    metadata: {
      ...collection.metadata,
      bbox,
      areaStatsM2: {
        minimum: Math.min(...areas),
        average: areas.reduce((sum, area) => sum + area, 0) / areas.length,
        maximum: Math.max(...areas),
      },
    },
  };
}

export async function generateCityIris(rootDirectory, cityId, options = {}) {
  const catalogPath = path.join(rootDirectory, "geo", "catalog", "france-city-iris.json");
  const curationCatalogPath = path.join(rootDirectory, "geo", "catalog", "france-city-curation.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const city = catalog.cities.find((candidate) => candidate.id === cityId);
  if (!city) throw new Error(`Unknown France city IRIS configuration: ${cityId}`);
  const curationCatalog = JSON.parse(await readFile(curationCatalogPath, "utf8"));
  const curation = curationCatalog.cities.find((candidate) => candidate.cityId === cityId);
  const curationSources = new Map(curationCatalog.sources.map((source) => [source.id, source]));
  const configuredCity = curation ? {
    ...city,
    humanZoneCuration: {
      ...curation,
      sources: curation.sourceRefs.map((sourceRef) => {
        const source = curationSources.get(sourceRef);
        if (!source) throw new Error(`${cityId} references unknown catalog curation source ${sourceRef}`);
        return source;
      }),
    },
  } : city;
  const suppliedPayload = options.payload;
  if (
    suppliedPayload !== undefined
    && (suppliedPayload?.type !== "FeatureCollection" || !Array.isArray(suppliedPayload.features))
  ) {
    throw new Error(`${cityId} supplied payload is not a FeatureCollection`);
  }
  const { payload, url } = suppliedPayload === undefined
    ? await fetchOfficialCollection(catalog.source, configuredCity)
    : { payload: suppliedPayload, url: createWfsUrl(catalog.source, configuredCity.communeCode) };
  const collection = createCityIrisCollection(payload, configuredCity, catalog.source, {
    generatedAt: options.generatedAt,
    sourceUrl: options.sourceUrl ?? url.href,
  });
  const outputPath = path.resolve(rootDirectory, configuredCity.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(collection)}\n`, "utf8");
  return { city: configuredCity, collection, outputPath };
}
