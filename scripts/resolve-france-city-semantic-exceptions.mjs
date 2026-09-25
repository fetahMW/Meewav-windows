#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import union from "@turf/union";
import { feature, featureCollection } from "@turf/helpers";
import {
  findRepresentativePoint,
  getPolygons,
  pointInGeometryInterior,
} from "./geo/lib/geometry.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const WFS_URL = "https://data.geopf.fr/wfs/ows";
const IRIS_LAYER = "STATISTICALUNITS.IRIS:contours_iris";
const HABITATION_LAYER = "BDTOPO_V3:zone_d_habitation";
const ROAD_LAYER = "BDTOPO_V3:voie_nommee";
const PAGE_SIZE = 5_000;
const POLICY_VERSION = 1;

const DIRECTION_ONLY_PATTERN = /^(?:centre(?: ville| urbain)?|nord|sud|est|ouest|nord (?:est|ouest)|sud (?:est|ouest)|peripherie)$/u;
const GENERIC_STANDALONE_PATTERN = /^(?:(?:la|le|les|l|un|une) )?(?:ville|commune|bourg|village|agglomeration|banlieue|couronne|centre|centre ville|centre urbain|peripherie|quartier|secteur|zone|habitat collectif|ecarts? ruraux)$/u;
const GENERIC_TERRITORY_PATTERN = /\b(?:periurbain(?:e|es|s)?|rural(?:e|es|s)?|ecarts? ruraux|collectif(?:s|ive|ives)?|historique(?:s)?|peripherie)\b/u;
const GENERIC_FACILITY_PATTERN = /^(?:(?:la|le|les|l) )?(?:gare|aeroport|aerodrome|port|hopital|universite|campus|caserne|stade|cimetiere|chaufferie|technopole|centre commercial|usine)$/u;
const OPERATIONAL_PATTERN = /(?:\b(?:z a|z i|zac|zup)\b|\bzone\b|\b(?:activite|activites|industriel|industrielle|industriels|industrielles|artisanal|artisanale|artisanaux|artisanales|commercial|commerciale|commerciaux|commerciales|economique|economiques)\b)/u;
const PLACEHOLDER_PATTERN = /^(?:n a|na|neant|inconnu|inconnue|sans nom|non renseigne|non renseignee|a definir|indetermine|indeterminee)$/u;

export function fold(value) {
  return String(value ?? "")
    .replace(/œ/giu, (match) => (match === match.toUpperCase() ? "OE" : "oe"))
    .replace(/æ/giu, (match) => (match === match.toUpperCase() ? "AE" : "ae"))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(value) {
  return fold(value).replace(/ /g, "-");
}

export function getSemanticLabelRisks(label, cityName = "") {
  const raw = String(label ?? "").trim();
  const normalized = fold(raw);
  const normalizedCity = fold(cityName);
  const escapedCity = normalizedCity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const risks = [];
  if (!raw) risks.push("empty_label");
  if (raw && !/\p{L}/u.test(raw)) risks.push("non_human_label");
  if (/[\u0000-\u001f\u007f\ufffd]/u.test(raw)) risks.push("invalid_label_encoding");
  if (/\d/u.test(raw)) risks.push("numbered_label");
  if (
    /^(?:iris|quartier|secteur|zone|s)\s*(?:\d+|[a-z])?$/u.test(normalized)
    || /^(?:iris|quartier|secteur|zone|s)\s+\d+(?:\s+.*)?$/u.test(normalized)
  ) risks.push("technical_inventory_label");
  if (DIRECTION_ONLY_PATTERN.test(normalized)) risks.push("direction_only_label");
  if (GENERIC_STANDALONE_PATTERN.test(normalized) || GENERIC_TERRITORY_PATTERN.test(normalized)) {
    risks.push("generic_territorial_label");
  }
  if (GENERIC_FACILITY_PATTERN.test(normalized)) risks.push("generic_facility_label");
  if (OPERATIONAL_PATTERN.test(normalized)) risks.push("operational_label");
  if (PLACEHOLDER_PATTERN.test(normalized)) risks.push("placeholder_label");
  if (normalizedCity && normalized === normalizedCity) risks.push("commune_name_only_label");
  if (
    normalizedCity
    && normalized.startsWith(`${normalizedCity} `)
    && DIRECTION_ONLY_PATTERN.test(normalized.slice(normalizedCity.length + 1))
  ) risks.push("technical_directional_label");
  if (escapedCity && new RegExp(`^${escapedCity}\\s+\\d+(?:\\s+.+)?$`, "u").test(normalized)) {
    risks.push("technical_inventory_label");
  }
  return [...new Set(risks)];
}

function isSafeOutputLabel(label, cityName) {
  return getSemanticLabelRisks(label, cityName).length === 0;
}

function parseNumberedLabel(label) {
  const match = String(label ?? "").trim().match(/^(.*?\p{L})(?:[\s-]+)(\d+)$/u);
  if (!match?.[1]?.trim()) return null;
  return { base: match[1].trim(), number: Number(match[2]) };
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
    const holes = polygon.slice(1).reduce((result, ring) => result + Math.abs(ringAreaSquareMeters(ring)), 0);
    return sum + Math.max(0, exterior - holes);
  }, 0);
}

function lineStrings(geometry) {
  if (geometry?.type === "LineString") return [geometry.coordinates];
  if (geometry?.type === "MultiLineString") return geometry.coordinates;
  return [];
}

function distanceMeters(first, second) {
  const latitude = (Number(first[1]) + Number(second[1])) / 2;
  const x = (Number(second[0]) - Number(first[0])) * 111_320 * Math.cos(latitude * Math.PI / 180);
  const y = (Number(second[1]) - Number(first[1])) * 110_540;
  return Math.hypot(x, y);
}

function inspectRoadInsideGeometry(roadGeometry, irisGeometry) {
  let totalLength = 0;
  let insideLength = 0;
  let evidencePoint = null;
  for (const line of lineStrings(roadGeometry)) {
    for (let index = 0; index < line.length - 1; index += 1) {
      const start = line[index];
      const end = line[index + 1];
      const length = distanceMeters(start, end);
      if (!Number.isFinite(length) || length <= 0) continue;
      totalLength += length;
      const samples = [0.125, 0.375, 0.625, 0.875].map((fraction) => [
        Number(start[0]) + (Number(end[0]) - Number(start[0])) * fraction,
        Number(start[1]) + (Number(end[1]) - Number(start[1])) * fraction,
      ]);
      const inside = samples.filter((point) => pointInGeometryInterior(point, irisGeometry));
      insideLength += length * inside.length / samples.length;
      if (!evidencePoint && inside.length > 0) evidencePoint = inside[0];
    }
  }
  return {
    totalLength,
    insideLength,
    insideRatio: totalLength > 0 ? insideLength / totalLength : 0,
    evidencePoint,
  };
}

function roundCoordinate(point) {
  return point.slice(0, 2).map((value) => Number(Number(value).toFixed(8)));
}

function getDepartmentKey(city) {
  const explicit = String(city?.departmentCode ?? "").trim().toUpperCase();
  if (explicit) return explicit;
  const code = String(city?.communeCode ?? "").trim().toUpperCase();
  return code.startsWith("2A") || code.startsWith("2B") ? code.slice(0, 2) : code.slice(0, 2);
}

function groupCitiesByDepartment(cities) {
  const groups = new Map();
  for (const city of cities) {
    const key = getDepartmentKey(city);
    groups.set(key, [...(groups.get(key) ?? []), city]);
  }
  return [...groups.entries()].sort(([first], [second]) => first.localeCompare(second, "fr"));
}

async function mapConcurrent(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function createWfsUrl({ layer, codeProperty, codes, startIndex = 0 }) {
  const safeCodes = [...new Set(codes.map((value) => String(value).trim().toUpperCase()))]
    .filter((code) => /^[0-9A-Z]{5}$/u.test(code))
    .sort();
  if (safeCodes.length !== new Set(codes.map(String)).size) throw new Error(`Invalid or duplicate commune code in ${layer} request`);
  const url = new URL(WFS_URL);
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", layer);
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("SRSNAME", "EPSG:4326");
  url.searchParams.set("COUNT", String(PAGE_SIZE));
  url.searchParams.set("STARTINDEX", String(startIndex));
  url.searchParams.set("CQL_FILTER", `${codeProperty} IN (${safeCodes.map((code) => `'${code}'`).join(",")})`);
  return url;
}

async function readCachedPayload(cachePath) {
  try {
    const payload = JSON.parse(await readFile(cachePath, "utf8"));
    if (payload?.type === "FeatureCollection" && Array.isArray(payload.features)) return payload;
  } catch {
    // A missing or incomplete cache entry is fetched again and atomically replaced.
  }
  return null;
}

async function writeCachedPayload(cachePath, payload) {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
  await rename(temporaryPath, cachePath);
}

async function fetchWfsPage(url, { cacheDirectory, retryCount = 7 }) {
  const cacheKey = createHash("sha256").update(url.href).digest("hex");
  const cachePath = path.join(cacheDirectory, `${cacheKey}.json`);
  const cached = await readCachedPayload(cachePath);
  if (cached) return cached;

  let lastError = null;
  for (let attempt = 1; attempt <= retryCount; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "Meewav-Web Guide Alpha semantic exception resolver/1.0",
          "x-meewav-fetch-attempt": String(attempt),
        },
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        error.retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1_000 : 0;
        throw error;
      }
      const payload = JSON.parse(await response.text());
      if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
        throw new Error("response is not a GeoJSON FeatureCollection");
      }
      await writeCachedPayload(cachePath, payload);
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt < retryCount) {
        const backoff = Math.min(30_000, 1_500 * 2 ** (attempt - 1));
        await new Promise((resolve) => setTimeout(resolve, Math.max(backoff, Number(error?.retryAfterMs ?? 0))));
      }
    }
  }
  throw new Error(`WFS request failed after ${retryCount} attempts (${url.searchParams.get("TYPENAMES")}): ${lastError?.message ?? lastError}`);
}

async function fetchLayerForCities({ layer, codeProperty, cities, cacheDirectory }) {
  const departmentGroups = groupCitiesByDepartment(cities);
  // Géoplateforme throttles parallel WFS consumers aggressively. Keep every
  // network page strictly sequential even if a future caller parallelizes
  // local geometry processing through another option.
  const batches = await mapConcurrent(departmentGroups, 1, async ([department, departmentCities]) => {
    const codes = departmentCities.map((city) => city.communeCode);
    try {
      const features = [];
      let startIndex = 0;
      let expectedCount = null;
      while (true) {
        const url = createWfsUrl({ layer, codeProperty, codes, startIndex });
        const page = await fetchWfsPage(url, { cacheDirectory });
        features.push(...page.features);
        const matched = Number(page.numberMatched);
        if (Number.isFinite(matched)) expectedCount = matched;
        if (page.features.length < PAGE_SIZE || (expectedCount !== null && features.length >= expectedCount)) break;
        startIndex += page.features.length;
        if (page.features.length === 0) break;
      }
      if (expectedCount !== null && features.length !== expectedCount) {
        throw new Error(`${layer} department ${department} returned ${features.length}/${expectedCount} features`);
      }
      return { features, codes, department, error: null };
    } catch (error) {
      return {
        features: [],
        codes,
        department,
        error: `${layer} department ${department}: ${error?.message ?? error}`,
      };
    }
  });
  const errorsByCode = new Map();
  for (const batch of batches) {
    if (!batch.error) continue;
    for (const code of batch.codes) errorsByCode.set(String(code), batch.error);
  }
  return { features: batches.flatMap((batch) => batch.features), errorsByCode };
}

function indexFeaturesByCommune(features, propertyName) {
  const result = new Map();
  for (const item of features) {
    const code = String(item?.properties?.[propertyName] ?? "").trim().toUpperCase();
    if (!code) continue;
    result.set(code, [...(result.get(code) ?? []), item]);
  }
  return result;
}

function getInputCities(plan) {
  for (const key of ["cities", "candidates", "communes"]) {
    if (Array.isArray(plan?.[key])) return plan[key];
  }
  return [];
}

function hasExactInventory(city) {
  return Array.isArray(city?.sourceIris) && city.sourceIris.length > 0;
}

async function loadResolutionInput(input, inputPath) {
  const listedCities = getInputCities(input);
  let sourcePlan = input;
  if (!listedCities.some(hasExactInventory)) {
    const candidates = [
      input?.provenance?.inputPath,
      input?.wave ? `geo/work/france-wave-${input.wave}-plan.json` : null,
    ].filter(Boolean);
    let loaded = null;
    for (const candidate of candidates) {
      const absolutePath = path.resolve(rootDirectory, candidate);
      try {
        loaded = JSON.parse(await readFile(absolutePath, "utf8"));
        break;
      } catch {
        // Try the deterministic wave-plan fallback before failing.
      }
    }
    if (!loaded) throw new Error(`${inputPath} is an exception queue without sourceIris and its source plan cannot be loaded`);
    sourcePlan = loaded;
  }

  const sourceCities = getInputCities(sourcePlan);
  if (!sourceCities.length) throw new Error("The source plan has no cities array");
  const listedKeys = new Set(listedCities.map((city) => String(city?.communeCode ?? city?.code ?? city?.id ?? "")));
  const isExceptionQueue = input?.kind === "guide_alpha_auto_curation_exceptions" || !listedCities.some(hasExactInventory);
  const targetCities = isExceptionQueue
    ? sourceCities.filter((city) => listedKeys.has(String(city.communeCode)) || listedKeys.has(String(city.id)))
    : sourceCities.filter((city) => analyzeRiskSources(city).riskSourceIds.size > 0);
  return { sourcePlan, targetCities };
}

export function analyzeRiskSources(city) {
  const risksBySourceId = new Map();
  const sources = Array.isArray(city?.sourceIris) ? city.sourceIris : [];
  const normalizedCounts = new Map();
  for (const source of sources) {
    const key = fold(source.label);
    normalizedCounts.set(key, (normalizedCounts.get(key) ?? 0) + 1);
  }
  for (const source of sources) {
    const sourceId = String(source.id);
    const risks = getSemanticLabelRisks(source.label, city.name);
    if ((normalizedCounts.get(fold(source.label)) ?? 0) > 1) risks.push("duplicate_normalized_label");
    if (risks.length) risksBySourceId.set(sourceId, [...new Set(risks)]);
  }
  return { risksBySourceId, riskSourceIds: new Set(risksBySourceId.keys()) };
}

function validateExactIrisInventory(city, features) {
  const byId = new Map();
  for (const item of features) {
    const sourceId = String(item?.properties?.code_iris ?? "");
    if (!sourceId || byId.has(sourceId)) continue;
    byId.set(sourceId, item);
  }
  const errors = [];
  for (const source of city.sourceIris ?? []) {
    const featureItem = byId.get(String(source.id));
    if (!featureItem) {
      errors.push(`missing exact WFS IRIS ${source.id}`);
      continue;
    }
    if (String(featureItem.properties?.nom_iris ?? "").trim() !== String(source.label ?? "").trim()) {
      errors.push(`label drift on ${source.id}`);
    }
    if (!getPolygons(featureItem.geometry).length) errors.push(`invalid polygon geometry on ${source.id}`);
  }
  if (byId.size !== city.sourceIris.length) errors.push(`WFS inventory ${byId.size}/${city.sourceIris.length}`);
  return { byId, errors };
}

function geometryConnected(firstGeometry, secondGeometry) {
  try {
    const result = union(featureCollection([feature(firstGeometry), feature(secondGeometry)]));
    return result?.geometry?.type === "Polygon"
      || (result?.geometry?.type === "MultiPolygon" && result.geometry.coordinates.length === 1);
  } catch {
    return false;
  }
}

export function inspectConnectedGeometryGraph(sourceIds, geometryBySourceId) {
  const edges = [];
  const adjacency = new Map(sourceIds.map((sourceId) => [sourceId, new Set()]));
  for (let firstIndex = 0; firstIndex < sourceIds.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < sourceIds.length; secondIndex += 1) {
      const firstId = sourceIds[firstIndex];
      const secondId = sourceIds[secondIndex];
      if (!geometryConnected(geometryBySourceId.get(firstId), geometryBySourceId.get(secondId))) continue;
      adjacency.get(firstId).add(secondId);
      adjacency.get(secondId).add(firstId);
      edges.push([firstId, secondId]);
    }
  }
  const visited = new Set();
  const queue = sourceIds.length ? [sourceIds[0]] : [];
  while (queue.length) {
    const sourceId = queue.shift();
    if (visited.has(sourceId)) continue;
    visited.add(sourceId);
    queue.push(...adjacency.get(sourceId));
  }
  let unionGeometryType = null;
  let connectedComponentCount = null;
  try {
    const result = union(featureCollection(sourceIds.map((sourceId) => feature(geometryBySourceId.get(sourceId)))));
    unionGeometryType = result?.geometry?.type ?? null;
    connectedComponentCount = unionGeometryType === "Polygon" ? 1 : result?.geometry?.coordinates?.length ?? null;
  } catch {
    connectedComponentCount = null;
  }
  return {
    connected: visited.size === sourceIds.length && connectedComponentCount === 1,
    connectedVertexCount: visited.size,
    connectedComponentCount,
    unionGeometryType,
    adjacencyEdges: edges,
  };
}

function buildNumberedFamilies(city) {
  const families = new Map();
  for (const source of city.sourceIris ?? []) {
    const parsed = parseNumberedLabel(source.label);
    if (!parsed) continue;
    const key = fold(parsed.base);
    const family = families.get(key) ?? { base: parsed.base, members: [] };
    family.members.push({ source, number: parsed.number });
    families.set(key, family);
  }
  return [...families.values()].filter((family) => family.members.length >= 2);
}

function tryCreateMerge(city, family, geometryBySourceId, reservedLabels) {
  const numbers = family.members.map((member) => member.number).sort((first, second) => first - second);
  const exhaustive = numbers.every((number, index) => number === index + 1)
    && new Set(numbers).size === numbers.length
    && !(city.sourceIris ?? []).some((source) => fold(source.label) === fold(family.base));
  if (!exhaustive) return { operation: null, reason: "numbered family is not an exhaustive contiguous 1..N family" };
  if (!isSafeOutputLabel(family.base, city.name)) return { operation: null, reason: `family base “${family.base}” is not a human-qualified label` };
  if (reservedLabels.has(fold(family.base))) return { operation: null, reason: `family base “${family.base}” collides with another visible label` };
  const sourceIds = family.members.map((member) => String(member.source.id));
  if (sourceIds.some((sourceId) => !geometryBySourceId.has(sourceId))) {
    return { operation: null, reason: "one or more exact source geometries are missing" };
  }
  const graph = inspectConnectedGeometryGraph(sourceIds, geometryBySourceId);
  if (!graph.connected) return { operation: null, reason: "exact source geometry graph is not connected" };
  return {
    operation: {
      id: `${city.id}-${slugify(family.base)}-merge`,
      type: "merge",
      sourceIds,
      expectedLabels: family.members.map((member) => String(member.source.label)),
      label: family.base,
      outputId: `${city.id}_${city.communeCode}_group_${slugify(family.base).replace(/-/g, "_")}`,
      evidenceRefs: ["ign-insee-contours-iris-2026", "guide-alpha-semantic-resolver-v1"],
      topology: {
        source: "IGN/INSEE Contours IRIS WFS exact geometries",
        method: "Exhaustive numbered-base family plus exact-geometry adjacency graph and Turf union",
        unionGeometryType: graph.unionGeometryType,
        connectedComponentCount: graph.connectedComponentCount,
        connected: true,
        adjacencyEdges: graph.adjacencyEdges,
      },
      rationale: `All exact “${family.base} N” cells form the exhaustive contiguous numbered family and one connected geometry graph. The operation removes only the statistical suffix; it does not invent, split or drop a place.`,
    },
    reason: null,
  };
}

function habitationPriority(properties) {
  const nature = fold(properties?.nature);
  const detailed = fold(properties?.nature_detaillee);
  if (detailed === "quartier urbain") return 4;
  if (nature === "quartier") return 3;
  if (nature === "lieu dit habite") return 2;
  return 1;
}

function compareScore(first, second) {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const difference = Number(second[index] ?? 0) - Number(first[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

function buildHabitationCandidates(city, sourceGeometryById, features) {
  const candidatesBySourceId = new Map([...sourceGeometryById.keys()].map((sourceId) => [sourceId, []]));
  for (const item of features) {
    const properties = item?.properties ?? {};
    const label = String(properties.toponyme ?? "").trim();
    const explicitlyNonFictive = properties.fictif === false || fold(properties.fictif) === "false";
    const status = fold(properties.statut_du_toponyme);
    const state = fold(properties.etat_de_l_objet);
    if (!label || !explicitlyNonFictive || status !== "valide" || (state && state !== "en service")) continue;
    if (!isSafeOutputLabel(label, city.name)) continue;
    const point = findRepresentativePoint(item.geometry);
    if (!point) continue;
    const matchingSourceIds = [...sourceGeometryById]
      .filter(([, geometry]) => pointInGeometryInterior(point, geometry))
      .map(([sourceId]) => sourceId);
    if (matchingSourceIds.length !== 1) continue;
    const sourceFeatureId = String(properties.cleabs ?? item.id ?? "").trim();
    if (!sourceFeatureId) continue;
    const importance = Number(properties.importance);
    const area = Math.round(geometryAreaSquareMeters(item.geometry));
    candidatesBySourceId.get(matchingSourceIds[0]).push({
      kind: "habitation",
      label,
      sourceFeatureId,
      score: [habitationPriority(properties), Number.isFinite(importance) ? 10 - importance : 0, area],
      evidence: {
        name: label,
        layer: HABITATION_LAYER,
        sourceFeatureId,
        coordinates: roundCoordinate(point),
        nature: properties.nature ?? null,
        detailedNature: properties.nature_detaillee ?? null,
        importance: properties.importance ?? null,
        fictive: false,
        strictContainmentVerified: true,
      },
    });
  }
  return candidatesBySourceId;
}

function roadName(properties) {
  return String(properties?.nom_voie_ban ?? properties?.nom_normalise ?? properties?.nom_collaboratif ?? "").trim();
}

function buildRoadCandidates(city, sourceGeometryById, features, sourceIds) {
  const candidatesBySourceId = new Map(sourceIds.map((sourceId) => [sourceId, []]));
  for (const item of features) {
    const properties = item?.properties ?? {};
    const label = roadName(properties);
    if (!label || !isSafeOutputLabel(label, city.name)) continue;
    const sourceFeatureId = String(properties.cleabs ?? item.id ?? "").trim();
    if (!sourceFeatureId) continue;
    for (const sourceId of sourceIds) {
      const inspection = inspectRoadInsideGeometry(item.geometry, sourceGeometryById.get(sourceId));
      if (!inspection.evidencePoint || inspection.insideLength < 40 || inspection.insideRatio < 0.8) continue;
      candidatesBySourceId.get(sourceId).push({
        kind: "road",
        label,
        sourceFeatureId,
        score: [Math.round(inspection.insideRatio * 10_000), Math.round(inspection.insideLength)],
        evidence: {
          name: label,
          layer: ROAD_LAYER,
          sourceFeatureId,
          coordinates: roundCoordinate(inspection.evidencePoint),
          insideLengthMeters: Number(inspection.insideLength.toFixed(1)),
          insideRatio: Number(inspection.insideRatio.toFixed(4)),
          strictContainmentVerified: true,
        },
      });
    }
  }
  return candidatesBySourceId;
}

function selectUniqueCandidate(candidates, reservedLabels, reservedFeatureIds) {
  const bestByLabel = new Map();
  for (const candidate of candidates) {
    if (reservedLabels.has(fold(candidate.label)) || reservedFeatureIds.has(candidate.sourceFeatureId)) continue;
    const key = fold(candidate.label);
    const current = bestByLabel.get(key);
    if (
      !current
      || compareScore(candidate.score, current.score) < 0
      || (compareScore(candidate.score, current.score) === 0 && candidate.sourceFeatureId.localeCompare(current.sourceFeatureId) < 0)
    ) bestByLabel.set(key, candidate);
  }
  const ranked = [...bestByLabel.values()].sort((first, second) => (
    compareScore(first.score, second.score)
    || first.label.localeCompare(second.label, "fr", { sensitivity: "base" })
    || first.sourceFeatureId.localeCompare(second.sourceFeatureId)
  ));
  if (!ranked.length) return { candidate: null, reason: "no eligible collision-free contained candidate" };
  if (ranked[1] && compareScore(ranked[0].score, ranked[1].score) === 0) {
    return { candidate: null, reason: "the highest substantive evidence score is ambiguous" };
  }
  return { candidate: ranked[0], reason: null };
}

function resolveCandidateRound(sourceIds, candidatesBySourceId, reservedLabels, reservedFeatureIds) {
  const selected = new Map();
  const reasons = new Map();
  for (const sourceId of sourceIds) {
    const result = selectUniqueCandidate(candidatesBySourceId.get(sourceId) ?? [], reservedLabels, reservedFeatureIds);
    if (result.candidate) selected.set(sourceId, result.candidate);
    else reasons.set(sourceId, result.reason);
  }
  const labelOwners = new Map();
  const featureOwners = new Map();
  for (const [sourceId, candidate] of selected) {
    const labelKey = fold(candidate.label);
    labelOwners.set(labelKey, [...(labelOwners.get(labelKey) ?? []), sourceId]);
    featureOwners.set(candidate.sourceFeatureId, [...(featureOwners.get(candidate.sourceFeatureId) ?? []), sourceId]);
  }
  for (const [sourceId, candidate] of [...selected]) {
    if ((labelOwners.get(fold(candidate.label))?.length ?? 0) > 1) {
      selected.delete(sourceId);
      reasons.set(sourceId, `candidate label “${candidate.label}” is not 1:1 inside the commune`);
    } else if ((featureOwners.get(candidate.sourceFeatureId)?.length ?? 0) > 1) {
      selected.delete(sourceId);
      reasons.set(sourceId, `evidence feature ${candidate.sourceFeatureId} is not 1:1`);
    }
  }
  for (const candidate of selected.values()) {
    reservedLabels.add(fold(candidate.label));
    reservedFeatureIds.add(candidate.sourceFeatureId);
  }
  return { selected, reasons };
}

function createRenameOperation(city, source, candidate) {
  const evidenceSource = candidate.kind === "habitation"
    ? "ign-bdtopo-habitation-toponyms-2026"
    : "ign-bdtopo-named-roads-2026";
  return {
    id: `${city.id}-${source.id}-rename-${slugify(candidate.label)}`,
    type: "rename",
    sourceId: String(source.id),
    expectedLabel: String(source.label),
    label: candidate.label,
    evidenceRefs: ["ign-insee-contours-iris-2026", evidenceSource, "guide-alpha-semantic-resolver-v1"],
    containedEvidence: [candidate.evidence],
    containmentRule: "strict_point_in_exact_source_polygon",
    rationale: `The exact official ${candidate.kind === "habitation" ? "IGN BD TOPO habitation toponym" : "IGN BD TOPO named road"} has a deterministic evidence point strictly inside this exact IRIS. The 1:1 label is emitted without nearest assignment, invented geometry, split or dropped source cell.`,
  };
}

function operationSourceIds(operation) {
  return operation.type === "merge" ? operation.sourceIds : [operation.sourceId];
}

function sortOperations(city, operations) {
  const order = new Map((city.sourceIris ?? []).map((source, index) => [String(source.id), index]));
  return operations.sort((first, second) => (
    Math.min(...operationSourceIds(first).map((sourceId) => order.get(String(sourceId))))
    - Math.min(...operationSourceIds(second).map((sourceId) => order.get(String(sourceId))))
  ));
}

function prepareCity(city, irisFeatures, habitationFeatures, fetchErrors = []) {
  const inventory = validateExactIrisInventory(city, irisFeatures);
  inventory.errors.push(...fetchErrors.filter(Boolean));
  const { risksBySourceId, riskSourceIds } = analyzeRiskSources(city);
  if (inventory.errors.length || riskSourceIds.size === 0) {
    return {
      city,
      inventory,
      risksBySourceId,
      operations: [],
      pendingSourceIds: [...riskSourceIds],
      reasons: new Map([...[...riskSourceIds].map((sourceId) => [sourceId, inventory.errors.join("; ")]), ["$city", inventory.errors.join("; ")]].filter(([, reason]) => reason)),
    };
  }

  const sourceGeometryById = new Map([...inventory.byId].map(([sourceId, item]) => [sourceId, item.geometry]));
  const reservedLabels = new Set((city.sourceIris ?? [])
    .filter((source) => !riskSourceIds.has(String(source.id)))
    .map((source) => fold(source.label)));
  const reservedFeatureIds = new Set();
  const resolvedSourceIds = new Set();
  const operations = [];
  const reasons = new Map();

  for (const family of buildNumberedFamilies(city)) {
    if (!family.members.some((member) => riskSourceIds.has(String(member.source.id)))) continue;
    const result = tryCreateMerge(city, family, sourceGeometryById, reservedLabels);
    if (result.operation) {
      operations.push(result.operation);
      reservedLabels.add(fold(result.operation.label));
      result.operation.sourceIds.forEach((sourceId) => resolvedSourceIds.add(sourceId));
    } else {
      for (const member of family.members) reasons.set(String(member.source.id), `merge rejected: ${result.reason}`);
    }
  }

  const pendingAfterMerge = [...riskSourceIds].filter((sourceId) => !resolvedSourceIds.has(sourceId));
  const habitationCandidates = buildHabitationCandidates(city, sourceGeometryById, habitationFeatures);
  const habitationRound = resolveCandidateRound(
    pendingAfterMerge,
    habitationCandidates,
    reservedLabels,
    reservedFeatureIds,
  );
  for (const [sourceId, candidate] of habitationRound.selected) {
    const source = city.sourceIris.find((item) => String(item.id) === sourceId);
    operations.push(createRenameOperation(city, source, candidate));
    resolvedSourceIds.add(sourceId);
    reasons.delete(sourceId);
  }
  for (const [sourceId, reason] of habitationRound.reasons) {
    const previous = reasons.get(sourceId);
    reasons.set(sourceId, [previous, `habitation: ${reason}`].filter(Boolean).join("; "));
  }

  return {
    city,
    inventory,
    risksBySourceId,
    sourceGeometryById,
    operations,
    resolvedSourceIds,
    pendingSourceIds: [...riskSourceIds].filter((sourceId) => !resolvedSourceIds.has(sourceId)),
    reasons,
    reservedLabels,
    reservedFeatureIds,
  };
}

function finalizeCity(prepared, roadFeatures, roadFetchError = null) {
  const { city } = prepared;
  if (prepared.inventory.errors.length) return prepared;
  if (prepared.pendingSourceIds.length > 0) {
    if (roadFetchError) {
      for (const sourceId of prepared.pendingSourceIds) {
        const previous = prepared.reasons.get(sourceId);
        prepared.reasons.set(sourceId, [previous, roadFetchError].filter(Boolean).join("; "));
      }
      return prepared;
    }
    const roadCandidates = buildRoadCandidates(
      city,
      prepared.sourceGeometryById,
      roadFeatures,
      prepared.pendingSourceIds,
    );
    const roadRound = resolveCandidateRound(
      prepared.pendingSourceIds,
      roadCandidates,
      prepared.reservedLabels,
      prepared.reservedFeatureIds,
    );
    for (const [sourceId, candidate] of roadRound.selected) {
      const source = city.sourceIris.find((item) => String(item.id) === sourceId);
      prepared.operations.push(createRenameOperation(city, source, candidate));
      prepared.resolvedSourceIds.add(sourceId);
      prepared.reasons.delete(sourceId);
    }
    for (const [sourceId, reason] of roadRound.reasons) {
      const previous = prepared.reasons.get(sourceId);
      prepared.reasons.set(sourceId, [previous, `named road: ${reason}`].filter(Boolean).join("; "));
    }
  }
  prepared.pendingSourceIds = [...prepared.risksBySourceId.keys()]
    .filter((sourceId) => !prepared.resolvedSourceIds.has(sourceId));
  prepared.operations = sortOperations(city, prepared.operations);
  return prepared;
}

function makeCurationCity(prepared) {
  const { city, operations, risksBySourceId } = prepared;
  const sourceRefs = new Set(["ign-insee-contours-iris-2026", "guide-alpha-semantic-resolver-v1"]);
  for (const operation of operations) operation.evidenceRefs.forEach((reference) => sourceRefs.add(reference));
  return {
    id: city.id,
    name: city.name,
    code: String(city.communeCode),
    population: Number(city.population ?? 0),
    sourceFeatureCount: city.sourceIris.length,
    officialLabels: city.sourceIris.map((source) => ({
      sourceId: String(source.id),
      label: String(source.label).trim(),
      irisType: String(source.type).trim().toUpperCase(),
    })),
    anomalies: operations.map((operation) => ({
      type: "semantic_exception",
      severity: "error",
      sourceIds: operationSourceIds(operation),
      labels: operationSourceIds(operation).map((sourceId) => String(city.sourceIris.find((source) => String(source.id) === sourceId)?.label ?? "")),
      riskCodes: [...new Set(operationSourceIds(operation).flatMap((sourceId) => risksBySourceId.get(sourceId) ?? []))],
      detail: operation.rationale,
      resolved: true,
      resolutionOperationIds: [operation.id],
    })),
    guideAlphaRule: {
      type: "curation",
      revision: 1,
      sourceRefs: [...sourceRefs],
      expectedFeatureCount: city.sourceIris.length,
      operations,
      justification: "Every semantic exception is resolved by an exhaustive connected numbered-family merge or by distinct strict-contained official IGN evidence. No source cell is invented, assigned by proximity, split, dropped or targeted twice.",
    },
    status: "ready",
  };
}

function makeUnresolvedCity(prepared) {
  const { city } = prepared;
  const sourceReasons = prepared.pendingSourceIds.map((sourceId) => {
    const source = city.sourceIris.find((item) => String(item.id) === sourceId);
    return {
      code: "no_high_confidence_1_to_1_resolution",
      detail: prepared.reasons.get(sourceId) || "No deterministic strict-contained evidence was found.",
      sourceIds: [sourceId],
      labels: [String(source?.label ?? "")],
      semanticRisks: prepared.risksBySourceId.get(sourceId) ?? [],
    };
  });
  const cityReason = prepared.reasons.get("$city");
  return {
    id: city.id,
    name: city.name,
    communeCode: String(city.communeCode),
    rank: city.rank ?? null,
    sourceFeatureCount: city.sourceIris.length,
    status: "manual_curation_required",
    reasons: [
      ...(cityReason ? [{ code: "exact_inventory_validation_failed", detail: cityReason, sourceIds: [], labels: [] }] : []),
      ...sourceReasons,
    ],
    partialOperations: prepared.operations,
  };
}

function summarizeResolvedPlan(cities) {
  const officialIris = cities.reduce((sum, city) => sum + city.sourceIris.length, 0);
  return {
    cities: cities.length,
    officialIris,
    split: cities.length,
    splitWaveEligible: cities.length,
    singlePlate: 0,
    singlePlateOutsideSplitWave: 0,
    inventoryResolutionRequired: 0,
    missingOfficialSplit: 0,
    classificationReasons: { multiple_official_iris: cities.length },
    semanticResolutionRequired: 0,
    pendingSemanticReview: 0,
    semanticExceptionsResolved: cities.length,
  };
}

export async function resolveSemanticExceptions({
  input,
  inputPath = "<memory>",
  inputSha256 = null,
  concurrency = 1,
  cacheDirectory,
  limit = Number.POSITIVE_INFINITY,
  generatedAt = new Date().toISOString(),
}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Input must be a JSON object");
  if (concurrency !== 1) throw new Error("concurrency must be 1: IGN WFS requests are deliberately serialized to prevent HTTP 429 responses");
  if (!(limit === Number.POSITIVE_INFINITY || (Number.isInteger(limit) && limit > 0))) throw new Error("limit must be a positive integer");
  if (!cacheDirectory) throw new Error("cacheDirectory is required");

  const loaded = await loadResolutionInput(input, inputPath);
  const targetCities = loaded.targetCities.slice(0, limit);
  if (!targetCities.length) throw new Error("Input contains no semantic exception city to resolve");
  const provenance = {
    inputPath,
    ...(inputSha256 ? { inputSha256 } : {}),
    inputWave: input.wave ?? loaded.sourcePlan.wave ?? null,
    inputGeneratedAt: input.generatedAt ?? null,
    sourcePlanGeneratedAt: loaded.sourcePlan.generatedAt ?? null,
    inspectedCityCount: targetCities.length,
  };

  const irisResult = await fetchLayerForCities({
    layer: IRIS_LAYER,
    codeProperty: "code_insee",
    cities: targetCities,
    cacheDirectory,
  });
  const habitationResult = await fetchLayerForCities({
    layer: HABITATION_LAYER,
    codeProperty: "insee_commune",
    cities: targetCities,
    cacheDirectory,
  });
  const irisByCode = indexFeaturesByCommune(irisResult.features, "code_insee");
  const habitationByCode = indexFeaturesByCommune(habitationResult.features, "insee_commune");
  const prepared = targetCities.map((city) => prepareCity(
    city,
    irisByCode.get(String(city.communeCode)) ?? [],
    habitationByCode.get(String(city.communeCode)) ?? [],
    [
      irisResult.errorsByCode.get(String(city.communeCode)),
      habitationResult.errorsByCode.get(String(city.communeCode)),
    ],
  ));

  const roadCities = prepared.filter((state) => state.pendingSourceIds.length > 0 && state.inventory.errors.length === 0).map((state) => state.city);
  const roadResult = roadCities.length
    ? await fetchLayerForCities({
        layer: ROAD_LAYER,
        codeProperty: "insee_commune",
        cities: roadCities,
        cacheDirectory,
      })
    : { features: [], errorsByCode: new Map() };
  const roadByCode = indexFeaturesByCommune(roadResult.features, "insee_commune");
  const finalized = prepared.map((state) => finalizeCity(
    state,
    roadByCode.get(String(state.city.communeCode)) ?? [],
    roadResult.errorsByCode.get(String(state.city.communeCode)) ?? null,
  ));
  const readyStates = finalized.filter((state) => state.pendingSourceIds.length === 0 && state.inventory.errors.length === 0);
  const unresolvedStates = finalized.filter((state) => !readyStates.includes(state));
  const operations = readyStates.flatMap((state) => state.operations);
  const readyCities = readyStates.map((state) => state.city);

  const evidenceSources = [
    {
      id: "ign-insee-contours-iris-2026",
      provider: "IGN / INSEE - Contours IRIS WFS Géoplateforme",
      datasetUrl: "https://geoservices.ign.fr/contoursiris",
      wfsUrl: WFS_URL,
      layers: [IRIS_LAYER],
      role: "Exact official IRIS IDs, labels and geometries",
      vintage: "2026",
      license: "Licence Ouverte / Open Licence 2.0",
    },
    {
      id: "ign-bdtopo-habitation-toponyms-2026",
      provider: "IGN - BD TOPO WFS Géoplateforme",
      datasetUrl: "https://geoservices.ign.fr/bdtopo",
      wfsUrl: WFS_URL,
      layers: [HABITATION_LAYER],
      role: "Validated non-fictive habitation toponyms with exact strict-contained evidence points",
      vintage: "2026",
      license: "Licence Ouverte / Open Licence 2.0",
    },
    {
      id: "ign-bdtopo-named-roads-2026",
      provider: "IGN - BD TOPO WFS Géoplateforme",
      datasetUrl: "https://geoservices.ign.fr/bdtopo",
      wfsUrl: WFS_URL,
      layers: [ROAD_LAYER],
      role: "Fallback official named roads predominantly contained in one exact IRIS",
      vintage: "2026",
      license: "Licence Ouverte / Open Licence 2.0",
    },
    {
      id: "guide-alpha-semantic-resolver-v1",
      provider: "Meewav deterministic Guide Alpha resolver",
      datasetUrl: "scripts/resolve-france-city-semantic-exceptions.mjs",
      role: "High-confidence 1:1 evidence ranking, collision gate and connected exhaustive-family merge proof",
      vintage: generatedAt.slice(0, 10),
    },
  ];
  const summary = {
    inputCities: targetCities.length,
    readyCities: readyStates.length,
    unresolvedCities: unresolvedStates.length,
    sourceFeatures: readyCities.reduce((sum, city) => sum + city.sourceIris.length, 0),
    expectedOutputFeatures: readyCities.reduce((sum, city) => sum + city.sourceIris.length, 0)
      - operations.filter((operation) => operation.type === "merge").reduce((sum, operation) => sum + operation.sourceIds.length - 1, 0),
    operations: {
      accept: 0,
      rename: operations.filter((operation) => operation.type === "rename").length,
      merge: operations.filter((operation) => operation.type === "merge").length,
    },
  };
  const policy = {
    version: POLICY_VERSION,
    noInvention: true,
    decision: "Resolve only deterministic 1:1 strict-contained official evidence or exhaustive connected numbered families; otherwise quarantine.",
    habitationPriority: "Validated non-fictive Quartier urbain, then other quartier/inhabited-place evidence; importance then area.",
    roadFallback: "An official named road is eligible only when at least 80% and 40 m of its sampled geometry lie strictly inside the exact IRIS.",
    collisionRule: "A visible normalized label and an evidence feature may each resolve at most one source IRIS per commune.",
    mergeRule: "Only exhaustive contiguous 1..N semantic-base families whose exact geometry adjacency graph and union are connected.",
  };
  const curation = {
    schemaVersion: 1,
    kind: "guide_alpha_high_confidence_semantic_curation",
    wave: input.wave ?? loaded.sourcePlan.wave ?? null,
    batch: "semantic-auto-high-confidence",
    generatedAt,
    provenance,
    auditPolicy: policy,
    source: loaded.sourcePlan.source ?? null,
    evidenceSources,
    summary,
    cities: readyStates.map(makeCurationCity),
  };
  const unresolved = {
    schemaVersion: 1,
    kind: "guide_alpha_semantic_resolution_unresolved",
    wave: curation.wave,
    generatedAt,
    provenance,
    auditPolicy: policy,
    summary: {
      inputCities: targetCities.length,
      resolvedCities: readyStates.length,
      manualCurationRequired: unresolvedStates.length,
      unresolvedSourceIris: unresolvedStates.reduce((sum, state) => sum + state.pendingSourceIds.length, 0),
    },
    cities: unresolvedStates.map(makeUnresolvedCity),
  };
  const resolvedPlan = {
    ...loaded.sourcePlan,
    generatedAt,
    selection: {
      ...(loaded.sourcePlan.selection ?? {}),
      requestedCount: readyCities.length,
      scannedCandidateCount: targetCities.length,
      semanticResolverReadyCount: readyCities.length,
      semanticResolverUnresolvedCount: unresolvedStates.length,
      sourcePlanRequestedCount: loaded.sourcePlan.selection?.requestedCount ?? getInputCities(loaded.sourcePlan).length,
    },
    totals: summarizeResolvedPlan(readyCities),
    deferredCandidates: [],
    semanticExceptionResolution: { policyVersion: POLICY_VERSION, generatedAt, provenance },
    cities: readyCities.map((city) => ({ ...city, status: "ready" })),
  };
  return { curation, unresolved, resolvedPlan };
}

function getArgument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function resolveUserPath(value) {
  return path.resolve(rootDirectory, value);
}

function displayPath(absolutePath) {
  const relativePath = path.relative(rootDirectory, absolutePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath.replaceAll(path.sep, "/") : absolutePath;
}

async function writeJson(absolutePath, value) {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, absolutePath);
}

export async function runCli() {
  const inputArgument = getArgument("input");
  const outputArgument = getArgument("output");
  const unresolvedArgument = getArgument("unresolved");
  const resolvedPlanArgument = getArgument("resolved-plan");
  const cacheArgument = getArgument("cache") ?? ".tmp/france-city-semantic-wfs-cache";
  const concurrency = Number(getArgument("concurrency") ?? 1);
  const limitArgument = getArgument("limit");
  const limit = limitArgument === undefined ? Number.POSITIVE_INFINITY : Number(limitArgument);
  if (!inputArgument || !outputArgument || !unresolvedArgument || !resolvedPlanArgument) {
    throw new Error("Usage: node scripts/resolve-france-city-semantic-exceptions.mjs --input=<plan-or-exceptions.json> --output=<partial-curation.json> --unresolved=<queue.json> --resolved-plan=<filtered-plan.json> [--concurrency=1] [--cache=<directory>] [--limit=<positive integer>]");
  }
  const inputPath = resolveUserPath(inputArgument);
  const outputPath = resolveUserPath(outputArgument);
  const unresolvedPath = resolveUserPath(unresolvedArgument);
  const resolvedPlanPath = resolveUserPath(resolvedPlanArgument);
  const cacheDirectory = resolveUserPath(cacheArgument);
  const distinctPaths = new Set([inputPath, outputPath, unresolvedPath, resolvedPlanPath]
    .map((value) => value.toLocaleLowerCase("en-US")));
  if (distinctPaths.size !== 4) throw new Error("Input, curation, unresolved and resolved-plan paths must be distinct");
  const inputText = await readFile(inputPath, "utf8");
  const inputSha256 = createHash("sha256").update(inputText).digest("hex");
  const result = await resolveSemanticExceptions({
    input: JSON.parse(inputText),
    inputPath: displayPath(inputPath),
    inputSha256,
    concurrency,
    cacheDirectory,
    limit,
  });
  await Promise.all([
    writeJson(outputPath, result.curation),
    writeJson(unresolvedPath, result.unresolved),
    writeJson(resolvedPlanPath, result.resolvedPlan),
  ]);
  console.log("Guide Alpha high-confidence semantic exception resolver: PASS");
  console.log(`${result.curation.summary.readyCities}/${result.curation.summary.inputCities} cities resolved automatically`);
  console.log(`${result.curation.summary.operations.rename} renames, ${result.curation.summary.operations.merge} connected exhaustive-family merges`);
  console.log(`${result.unresolved.summary.manualCurationRequired} cities remain explicitly unresolved`);
  console.log(`Curation: ${displayPath(outputPath)}`);
  console.log(`Resolved plan: ${displayPath(resolvedPlanPath)}`);
  console.log(`Unresolved queue: ${displayPath(unresolvedPath)}`);
}

const isDirectExecution = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectExecution) await runCli();
