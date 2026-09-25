#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  computeBbox,
  findRepresentativePoint,
  getPolygons,
  isFinitePosition,
  pointOnSegment,
  pointInGeometryInterior,
  positionsEqual,
  signedRingArea,
} from "./lib/geometry.mjs";
import { repairOfficialGeometry } from "./lib/generate-city-iris.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_ROOT_DIRECTORY = path.resolve(path.dirname(SCRIPT_PATH), "..", "..");
const DEFAULT_INVENTORY_PATH = "geo/work/france-iris-national-inventory.json";
const DEFAULT_OUTPUT_DIRECTORY = "public/map/france-single-plate/2026";
const DEFAULT_MANIFEST_NAME = "manifest.json";
const DEFAULT_RUNTIME_INDEX_NAME = "runtime-index.json";
const MAX_RUNTIME_INDEX_BYTES = 1_048_576;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const EXPECTED_RUNTIME_MODE = "single_plate";
const ACTIVE_COMMUNE_GROUND_COLOR = "#1B1234";
const CAMERA_PITCH = 60;
const CAMERA_BEARING = 0;
const CAMERA_SPEED = 0.85;
const CAMERA_CURVE = 1.4;
const CAMERA_MIN_ZOOM = 8.5;
const CAMERA_MAX_ZOOM = 15.2;
const CAMERA_ZOOM_CALIBRATION = 8.2;
const CAMERA_ZOOM_STEP = 0.05;

function readOption(argumentsList, name, fallback) {
  const prefix = `--${name}=`;
  return argumentsList.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

function readPositiveIntegerOption(argumentsList, name, fallback, maximum) {
  const value = Number(readOption(argumentsList, name, fallback));
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid --${name}=${value}; expected an integer between 1 and ${maximum}`);
  }
  return value;
}

function compareText(first, second) {
  return first < second ? -1 : first > second ? 1 : 0;
}

function requiredText(value, context) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${context} is required`);
  return text;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
}

function normalizeOfficialName(value) {
  return String(value ?? "")
    .replace(/[’']/gu, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

function stableColorIndex(communeCode) {
  let hash = 0;
  for (const character of String(communeCode)) {
    hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  }
  return hash % 8;
}

function hashContents(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function serializeJson(value) {
  return `${JSON.stringify(value)}\n`;
}

function comparePosition(first, second) {
  const longitudeDifference = Number(first[0]) - Number(second[0]);
  if (longitudeDifference) return longitudeDifference;
  const latitudeDifference = Number(first[1]) - Number(second[1]);
  if (latitudeDifference) return latitudeDifference;
  return Number(first[2] ?? 0) - Number(second[2] ?? 0);
}

function compareRotations(sequence, firstStart, secondStart) {
  for (let offset = 0; offset < sequence.length; offset += 1) {
    const difference = comparePosition(
      sequence[(firstStart + offset) % sequence.length],
      sequence[(secondStart + offset) % sequence.length],
    );
    if (difference) return difference;
  }
  return 0;
}

function canonicalRingDirection(sequence) {
  let bestStart = 0;
  for (let index = 1; index < sequence.length; index += 1) {
    if (compareRotations(sequence, index, bestStart) < 0) bestStart = index;
  }
  return sequence.map((_, offset) => sequence[(bestStart + offset) % sequence.length]);
}

function canonicalizeRing(ring) {
  const openRing = ring.slice(0, -1).map((position) => [...position]);
  const forward = canonicalRingDirection(openRing);
  const reverse = canonicalRingDirection([...openRing].reverse());
  let selected = forward;
  for (let index = 0; index < forward.length; index += 1) {
    const difference = comparePosition(forward[index], reverse[index]);
    if (difference < 0) break;
    if (difference > 0) {
      selected = reverse;
      break;
    }
  }
  return [...selected, [...selected[0]]];
}

function canonicalizePolygon(polygon) {
  const [exterior, ...holes] = polygon;
  return [
    canonicalizeRing(exterior),
    ...holes
      .map(canonicalizeRing)
      .sort((first, second) => compareText(JSON.stringify(first), JSON.stringify(second))),
  ];
}

export function canonicalizePolygonGeometry(geometry) {
  if (geometry?.type === "Polygon") {
    return { type: "Polygon", coordinates: canonicalizePolygon(geometry.coordinates) };
  }
  if (geometry?.type === "MultiPolygon") {
    const coordinates = geometry.coordinates
      .map(canonicalizePolygon)
      .sort((first, second) => compareText(JSON.stringify(first), JSON.stringify(second)));
    return { type: "MultiPolygon", coordinates };
  }
  return geometry;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const orientation = (start, end, pointValue) => {
    const cross = (end[1] - start[1]) * (pointValue[0] - end[0])
      - (end[0] - start[0]) * (pointValue[1] - end[1]);
    if (cross === 0) return 0;
    return cross > 0 ? 1 : 2;
  };
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) return true;
  return (
    (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd))
    || (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd))
    || (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd))
    || (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

/** Spatial buckets retain the strict self-intersection guard without the O(n²)
 * cost of comparing every pair in large rural commune boundaries. */
export function ringHasSelfIntersectionFast(ring) {
  const segmentCount = Array.isArray(ring) ? ring.length - 1 : 0;
  if (segmentCount < 3) return false;
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [longitude, latitude] of ring) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }
  const longitudeSpan = Math.max(east - west, Number.EPSILON);
  const latitudeSpan = Math.max(north - south, Number.EPSILON);
  const gridSize = Math.max(1, Math.ceil(Math.sqrt(segmentCount)));
  const buckets = new Map();
  const checkedPairs = new Set();
  const cellIndex = (value, minimum, span) => Math.max(
    0,
    Math.min(gridSize - 1, Math.floor(((value - minimum) / span) * gridSize)),
  );

  for (let index = 0; index < segmentCount; index += 1) {
    const start = ring[index];
    const end = ring[index + 1];
    const minX = cellIndex(Math.min(start[0], end[0]), west, longitudeSpan);
    const maxX = cellIndex(Math.max(start[0], end[0]), west, longitudeSpan);
    const minY = cellIndex(Math.min(start[1], end[1]), south, latitudeSpan);
    const maxY = cellIndex(Math.max(start[1], end[1]), south, latitudeSpan);
    const candidates = new Set();
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        for (const candidate of buckets.get(key) ?? []) candidates.add(candidate);
      }
    }
    for (const candidate of candidates) {
      const adjacent = Math.abs(index - candidate) <= 1;
      const closingAdjacent = index === segmentCount - 1 && candidate === 0;
      if (adjacent || closingAdjacent) continue;
      const pairKey = `${candidate}:${index}`;
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);
      if (segmentsIntersect(ring[candidate], ring[candidate + 1], start, end)) return true;
    }
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        const key = `${x}:${y}`;
        const bucket = buckets.get(key) ?? [];
        bucket.push(index);
        buckets.set(key, bucket);
      }
    }
  }
  return false;
}

async function readJson(rootDirectory, relativeOrAbsolutePath) {
  const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
    ? relativeOrAbsolutePath
    : path.resolve(rootDirectory, relativeOrAbsolutePath);
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

function getFeatureCommuneCode(feature) {
  const properties = feature?.properties ?? {};
  return String(properties.communeCode ?? properties.code ?? properties.districtCode ?? "").trim();
}

export function assertFastOfficialGeometry(geometry, context = "geometry") {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`${context} must be a Polygon or MultiPolygon`);
  }
  const polygons = getPolygons(geometry);
  if (polygons.length === 0) throw new Error(`${context} has no polygons`);
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) {
    const polygon = polygons[polygonIndex];
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(`${context} polygon ${polygonIndex} has no rings`);
    }
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex];
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new Error(`${context} polygon ${polygonIndex} ring ${ringIndex} is too short`);
      }
      if (ring.some((position) => !isFinitePosition(position))) {
        throw new Error(`${context} polygon ${polygonIndex} ring ${ringIndex} has invalid coordinates`);
      }
      if (!positionsEqual(ring[0], ring.at(-1))) {
        throw new Error(`${context} polygon ${polygonIndex} ring ${ringIndex} is open`);
      }
      if (Math.abs(signedRingArea(ring)) <= 1e-15) {
        throw new Error(`${context} polygon ${polygonIndex} ring ${ringIndex} has zero area`);
      }
      if (ringHasSelfIntersectionFast(ring)) {
        throw new Error(`${context} polygon ${polygonIndex} ring ${ringIndex} self-intersects`);
      }
    }
  }
  return geometry;
}

export function computeSinglePlateCamera(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    throw new Error("A finite four-number bbox is required to compute a single-plate camera");
  }
  const [west, south, east, north] = bbox;
  if (west >= east || south >= north) throw new Error("Single-plate camera bbox is empty");
  const center = [(west + east) / 2, (south + north) / 2];
  const latitudeScale = Math.max(0.15, Math.cos(center[1] * Math.PI / 180));
  const geographicSpan = Math.max((east - west) * latitudeScale, north - south, 0.00008);
  const rawZoom = CAMERA_ZOOM_CALIBRATION - Math.log2(geographicSpan);
  const steppedZoom = Math.round(rawZoom / CAMERA_ZOOM_STEP) * CAMERA_ZOOM_STEP;
  return {
    center: center.map((value) => round(value)),
    zoom: round(Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, steppedZoom)), 2),
    pitch: CAMERA_PITCH,
    bearing: CAMERA_BEARING,
    speed: CAMERA_SPEED,
    curve: CAMERA_CURVE,
    bbox: bbox.map((value) => round(value)),
  };
}

export function collectExistingCommuneOwnership(cityCatalog, existingDatasets, loadedCollections = new Map()) {
  const ownership = new Map();
  const register = (codeValue, owner) => {
    const code = String(codeValue ?? "").trim().toUpperCase();
    if (!code) return;
    const previous = ownership.get(code) ?? [];
    if (!previous.some((candidate) => candidate === owner)) previous.push(owner);
    ownership.set(code, previous);
  };

  for (const city of cityCatalog?.cities ?? []) register(city.communeCode, `standalone:${city.id}`);
  for (const dataset of existingDatasets?.datasets ?? []) {
    if (dataset.communeCode) register(dataset.communeCode, `${dataset.role ?? "dataset"}:${dataset.id}`);
    const collection = loadedCollections.get(dataset.inputPath);
    if (dataset.role !== "communes" || !collection) continue;
    for (const feature of collection.features ?? []) {
      register(getFeatureCommuneCode(feature), `communes:${dataset.id}`);
    }
  }
  return ownership;
}

export function selectEligibleSinglePlateCommunes(inventory, ownership = new Map()) {
  if (!Array.isArray(inventory?.communes)) throw new Error("National IRIS inventory has no communes array");
  const declaredCount = Number(inventory?.summary?.singlePlate);
  const candidates = inventory.communes
    .filter((commune) => commune.mode === EXPECTED_RUNTIME_MODE)
    .sort((first, second) => compareText(String(first.communeCode), String(second.communeCode)));
  if (!Number.isInteger(declaredCount) || candidates.length !== declaredCount) {
    throw new Error(`Single-plate inventory count drift: ${candidates.length}/${declaredCount}`);
  }

  const codes = new Set();
  const irisCodes = new Set();
  for (const commune of candidates) {
    const code = requiredText(commune.communeCode, "single-plate communeCode").toUpperCase();
    const name = requiredText(commune.name, `${code} official name`);
    const departmentCode = requiredText(commune.departmentCode, `${code} departmentCode`).toUpperCase();
    if (!/^(?:\d{2}|2[AB])$/u.test(departmentCode)) {
      throw new Error(`${code} has invalid metropolitan department ${departmentCode}`);
    }
    if (codes.has(code)) throw new Error(`Duplicate single-plate commune ${code}`);
    codes.add(code);
    const sourceIris = Array.isArray(commune.sourceIris) ? commune.sourceIris : [];
    if (sourceIris.length !== 1) throw new Error(`${code} single-plate inventory must contain exactly one IRIS`);
    const officialIrisCode = requiredText(sourceIris[0].id, `${code} official IRIS code`);
    const irisType = String(sourceIris[0].type ?? "").trim().toUpperCase();
    if (irisType !== "Z" && !officialIrisCode.endsWith("0000")) {
      throw new Error(`${code} does not satisfy the official Z/0000 single-plate rule`);
    }
    if (irisCodes.has(officialIrisCode)) throw new Error(`Duplicate official IRIS ${officialIrisCode}`);
    irisCodes.add(officialIrisCode);
    const expectedReason = irisType === "Z" && officialIrisCode.endsWith("0000")
      ? "single_iris_type_z_and_code_0000"
      : irisType === "Z"
        ? "single_iris_type_z"
        : "single_iris_code_0000";
    if (commune.classificationReason !== expectedReason) {
      throw new Error(
        `${code} classification reason drift: ${commune.classificationReason} / ${expectedReason}`,
      );
    }
    if (ownership.has(code)) {
      throw new Error(`${code} ${name} is already owned by ${ownership.get(code).join(", ")}`);
    }
  }
  return candidates;
}

export function createDepartmentWfsUrl(source, departmentCode) {
  const url = new URL(requiredText(source?.wfsUrl, "IRIS WFS URL"));
  url.searchParams.set("SERVICE", "WFS");
  url.searchParams.set("VERSION", "2.0.0");
  url.searchParams.set("REQUEST", "GetFeature");
  url.searchParams.set("TYPENAMES", requiredText(source?.typeName, "IRIS WFS typeName"));
  url.searchParams.set("OUTPUTFORMAT", "application/json");
  url.searchParams.set("COUNT", "10000");
  url.searchParams.set(
    "CQL_FILTER",
    `code_insee LIKE '${departmentCode}%'`,
  );
  url.searchParams.set("SRSNAME", "EPSG:4326");
  return url;
}

function normalizeOfficialFeature(sourceFeature, commune, source) {
  const sourceProperties = sourceFeature?.properties ?? {};
  const communeCode = requiredText(sourceProperties.code_insee, "WFS code_insee").toUpperCase();
  const sourceCommuneName = requiredText(sourceProperties.nom_commune, `${communeCode} WFS nom_commune`);
  const officialIrisCode = requiredText(sourceProperties.code_iris, `${communeCode} WFS code_iris`);
  const expectedIris = commune.sourceIris[0];
  if (communeCode !== String(commune.communeCode).toUpperCase()) {
    throw new Error(`WFS feature ${officialIrisCode} belongs to ${communeCode}, expected ${commune.communeCode}`);
  }
  if (officialIrisCode !== String(expectedIris.id)) {
    throw new Error(`${communeCode} WFS IRIS ${officialIrisCode} differs from cached ${expectedIris.id}`);
  }
  let officialGeometry = sourceFeature.geometry;
  let sourceGeometryRepair = sourceProperties.source_geometry_repair ?? null;
  if (sourceGeometryRepair !== null && sourceGeometryRepair !== "polygonal_self_union") {
    throw new Error(`${communeCode} has unsupported source geometry repair ${sourceGeometryRepair}`);
  }
  try {
    assertFastOfficialGeometry(officialGeometry, `${communeCode} geometry`);
  } catch (error) {
    if (!String(error?.message ?? error).includes("self-intersects")) throw error;
    const repaired = repairOfficialGeometry(officialGeometry, `${communeCode} geometry`);
    officialGeometry = repaired.geometry;
    sourceGeometryRepair = repaired.method;
    assertFastOfficialGeometry(officialGeometry, `${communeCode} repaired geometry`);
  }
  const geometry = canonicalizePolygonGeometry(officialGeometry);
  const bbox = computeBbox(geometry);
  const labelPoint = findRepresentativePoint(geometry);
  if (!bbox || !labelPoint || !pointInGeometryInterior(labelPoint, geometry)) {
    throw new Error(`${communeCode} has no strictly interior label point`);
  }
  const zoneId = `commune_${communeCode}`;
  // The geometry-bearing WFS is authoritative for the published official
  // label. The search snapshot label remains provenance for drift audits.
  const label = sourceCommuneName;
  return {
    type: "Feature",
    id: zoneId,
    properties: {
      zoneId,
      label,
      searchLabel: requiredText(commune.name, `${communeCode} search label`),
      sourceNameMatchesSearch: normalizeOfficialName(sourceCommuneName)
        === normalizeOfficialName(commune.name),
      communeCode,
      districtCode: communeCode,
      territoryType: "commune",
      runtimeMode: EXPECTED_RUNTIME_MODE,
      classificationReason: commune.classificationReason,
      colorIndex: stableColorIndex(communeCode),
      groundColor: ACTIVE_COMMUNE_GROUND_COLOR,
      labelLng: round(labelPoint[0]),
      labelLat: round(labelPoint[1]),
      bbox: bbox.map((value) => round(value)),
      officialId: officialIrisCode,
      irisCode: String(sourceProperties.iris ?? "").trim(),
      irisType: String(sourceProperties.type_iris ?? expectedIris.type).trim().toUpperCase(),
      sourceCommuneName,
      source: requiredText(source.provider, "source provider"),
      sourceDataset: requiredText(source.typeName, "source typeName"),
      sourceYear: requiredText(source.vintage, "source vintage"),
      sourceLicense: requiredText(source.license, "source license"),
      ...(sourceGeometryRepair ? { sourceGeometryRepair } : {}),
    },
    geometry,
  };
}

export function buildSinglePlateDepartmentProduct({
  departmentCode,
  communes,
  payload,
  source,
  inputFingerprint,
  outputUrl,
}) {
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error(`${departmentCode} WFS response is not a FeatureCollection`);
  }
  const candidates = [...communes].sort(
    (first, second) => compareText(String(first.communeCode), String(second.communeCode)),
  );
  const candidateByCode = new Map(candidates.map((commune) => [String(commune.communeCode), commune]));
  const sourceByCode = new Map();
  for (const feature of payload.features) {
    const code = String(feature?.properties?.code_insee ?? "").trim().toUpperCase();
    if (!candidateByCode.has(code)) continue;
    const current = sourceByCode.get(code) ?? [];
    current.push(feature);
    sourceByCode.set(code, current);
  }

  const features = candidates.map((commune) => {
    const code = String(commune.communeCode).toUpperCase();
    const matching = (sourceByCode.get(code) ?? []).filter(
      (feature) => String(feature?.properties?.code_iris ?? "") === String(commune.sourceIris[0].id),
    );
    if (matching.length !== 1) {
      throw new Error(`${code} expected one exact official geometry, received ${matching.length}`);
    }
    return normalizeOfficialFeature(matching[0], commune, source);
  });

  const collection = {
    type: "FeatureCollection",
    metadata: {
      schemaVersion: 1,
      kind: "france_single_plate_department_fragment",
      runtimeMode: EXPECTED_RUNTIME_MODE,
      departmentCode,
      featureCount: features.length,
      inputFingerprint,
      source: {
        provider: source.provider,
        datasetUrl: source.datasetUrl,
        wfsUrl: source.wfsUrl,
        typeName: source.typeName,
        vintage: source.vintage,
        license: source.license,
      },
    },
    features,
  };
  const serialized = serializeJson(collection);
  const entries = Object.fromEntries(features.map((feature, featureIndex) => {
    const properties = feature.properties;
    const camera = computeSinglePlateCamera(properties.bbox);
    return [properties.communeCode, {
      zoneId: properties.zoneId,
      label: properties.label,
      runtimeMode: EXPECTED_RUNTIME_MODE,
      departmentCode,
      fragmentUrl: outputUrl,
      featureId: properties.zoneId,
      featureIndex,
      labelPoint: [properties.labelLng, properties.labelLat],
      bbox: properties.bbox,
      camera,
      sourceOfficialId: properties.officialId,
      classificationReason: properties.classificationReason,
    }];
  }));
  return {
    departmentCode,
    collection,
    serialized,
    sha256: hashContents(serialized),
    byteLength: Buffer.byteLength(serialized),
    entries,
  };
}

export function buildSinglePlateManifest({ inventory, source, products, outputDirectoryUrl }) {
  const sortedProducts = [...products].sort(
    (first, second) => compareText(first.departmentCode, second.departmentCode),
  );
  const communes = {};
  const fragments = {};
  for (const product of sortedProducts) {
    const codes = Object.keys(product.entries).sort(compareText);
    fragments[product.departmentCode] = {
      url: `${outputDirectoryUrl}/${product.departmentCode}.geojson`,
      featureCount: codes.length,
      byteLength: product.byteLength,
      sha256: product.sha256,
    };
    for (const code of codes) {
      if (Object.hasOwn(communes, code)) throw new Error(`Manifest duplicates commune ${code}`);
      communes[code] = product.entries[code];
    }
  }
  const expectedCount = Number(inventory?.summary?.singlePlate);
  if (Object.keys(communes).length !== expectedCount) {
    throw new Error(`Manifest coverage drift: ${Object.keys(communes).length}/${expectedCount}`);
  }
  const classificationReasons = {};
  for (const entry of Object.values(communes)) {
    classificationReasons[entry.classificationReason] =
      (classificationReasons[entry.classificationReason] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    kind: "france_single_plate_national_manifest",
    runtimeMode: EXPECTED_RUNTIME_MODE,
    inputFingerprint: inventory.inputFingerprint,
    source: {
      provider: source.provider,
      datasetUrl: source.datasetUrl,
      wfsUrl: source.wfsUrl,
      typeName: source.typeName,
      vintage: source.vintage,
      license: source.license,
    },
    summary: {
      communeCount: expectedCount,
      fragmentCount: sortedProducts.length,
      geometryLoading: "one_department_fragment_at_a_time",
      activeCollectionFeatureCount: 1,
      classificationReasons,
    },
    fragments,
    communes,
  };
}

export function buildSinglePlateRuntimeIndex({ manifest, outputDirectoryUrl }) {
  const communes = {};
  for (const [code, entry] of Object.entries(manifest.communes).sort(([first], [second]) => compareText(first, second))) {
    if (!Number.isInteger(entry.featureIndex) || entry.featureIndex < 0) {
      throw new Error(`${code} cannot enter the runtime index without a valid feature index`);
    }
    communes[code] = entry.featureIndex;
  }
  return {
    schemaVersion: 1,
    kind: "france_single_plate_runtime_index",
    runtimeMode: EXPECTED_RUNTIME_MODE,
    inputFingerprint: manifest.inputFingerprint,
    fragmentBaseUrl: outputDirectoryUrl,
    summary: {
      communeCount: manifest.summary.communeCount,
      fragmentCount: manifest.summary.fragmentCount,
      activeCollectionFeatureCount: 1,
      lookup: "commune_code_to_feature_index_o1",
      departmentResolution: "first_two_commune_code_characters",
    },
    communes,
  };
}

export function validateSinglePlatePublication(manifest, products, expectedCodes) {
  const manifestCodes = Object.keys(manifest?.communes ?? {}).sort(compareText);
  const expected = [...expectedCodes].map(String).sort(compareText);
  if (JSON.stringify(manifestCodes) !== JSON.stringify(expected)) {
    throw new Error(`Manifest codes differ from eligible inventory (${manifestCodes.length}/${expected.length})`);
  }
  const seenFeatureIds = new Set();
  for (const product of products) {
    for (const [featureIndex, feature] of product.collection.features.entries()) {
      const properties = feature.properties ?? {};
      const code = String(properties.communeCode ?? "");
      const entry = manifest.communes[code];
      if (!entry) throw new Error(`${code} has no manifest entry`);
      if (feature.id !== properties.zoneId || feature.id !== `commune_${code}`) {
        throw new Error(`${code} violates stable feature/zone ID contract`);
      }
      if (properties.districtCode !== code || properties.territoryType !== "commune") {
        throw new Error(`${code} violates commune plate properties`);
      }
      if (properties.runtimeMode !== EXPECTED_RUNTIME_MODE || entry.runtimeMode !== EXPECTED_RUNTIME_MODE) {
        throw new Error(`${code} violates single-plate runtime mode`);
      }
      if (properties.classificationReason !== entry.classificationReason) {
        throw new Error(`${code} classification reason was not preserved`);
      }
      if (seenFeatureIds.has(feature.id)) throw new Error(`Duplicate single-plate feature ID ${feature.id}`);
      seenFeatureIds.add(feature.id);
      if (entry.featureIndex !== featureIndex || entry.featureId !== feature.id) {
        throw new Error(`${code} manifest feature pointer is invalid`);
      }
      const labelPoint = [Number(properties.labelLng), Number(properties.labelLat)];
      if (!pointInGeometryInterior(labelPoint, feature.geometry)) {
        throw new Error(`${code} label point is not strictly inside its geometry`);
      }
    }
  }
  return {
    communeCount: manifestCodes.length,
    fragmentCount: products.length,
    uniqueFeatureIdCount: seenFeatureIds.size,
  };
}

async function collectOwnership(rootDirectory, cityCatalog, existingDatasets) {
  const loadedCollections = new Map();
  for (const dataset of existingDatasets.datasets ?? []) {
    if (dataset.role !== "communes" || !dataset.inputPath || loadedCollections.has(dataset.inputPath)) continue;
    loadedCollections.set(dataset.inputPath, await readJson(rootDirectory, dataset.inputPath));
  }
  return collectExistingCommuneOwnership(cityCatalog, existingDatasets, loadedCollections);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchDepartmentPayload(source, departmentCode, { retries, timeoutMs }) {
  const url = createDepartmentWfsUrl(source, departmentCode);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: {
          accept: "application/geo+json, application/json",
          "user-agent": "Meewav-Web national single-plate generator/1.0",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const error = new Error(`${departmentCode} WFS failed with HTTP ${response.status}`);
        error.status = response.status;
        const retryAfterSeconds = Number(response.headers.get("retry-after"));
        error.retryAfterMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1_000
          : 0;
        if (!RETRYABLE_HTTP_STATUSES.has(response.status)) throw error;
        lastError = error;
      } else {
        const payload = await response.json();
        if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
          throw new Error(`${departmentCode} WFS response is not a FeatureCollection`);
        }
        const numberMatched = Number(payload.numberMatched);
        if (Number.isFinite(numberMatched) && numberMatched > payload.features.length) {
          throw new Error(
            `${departmentCode} WFS response was truncated (${payload.features.length}/${numberMatched})`,
          );
        }
        return payload;
      }
    } catch (error) {
      if (error?.status && !RETRYABLE_HTTP_STATUSES.has(error.status)) throw error;
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < retries) {
      const exponentialBackoffMs = Math.min(30_000, 1_200 * (2 ** attempt));
      await wait(Math.max(exponentialBackoffMs, Number(lastError?.retryAfterMs ?? 0)));
    }
  }
  throw lastError ?? new Error(`${departmentCode} WFS request failed`);
}

async function loadExistingProduct({ absolutePath, departmentCode, communes, source, inventory, outputUrl }) {
  try {
    const collection = JSON.parse(await readFile(absolutePath, "utf8"));
    if (
      collection?.metadata?.kind !== "france_single_plate_department_fragment"
      || collection.metadata.inputFingerprint !== inventory.inputFingerprint
      || collection.metadata.departmentCode !== departmentCode
      || collection.features?.length !== communes.length
    ) return null;
    const payload = {
      type: "FeatureCollection",
      features: collection.features.map((feature) => ({
        ...feature,
        properties: {
          code_insee: feature.properties.communeCode,
          nom_commune: feature.properties.sourceCommuneName,
          code_iris: feature.properties.officialId,
          iris: feature.properties.irisCode,
          type_iris: feature.properties.irisType,
          source_geometry_repair: feature.properties.sourceGeometryRepair ?? null,
        },
      })),
    };
    return buildSinglePlateDepartmentProduct({
      departmentCode,
      communes,
      payload,
      source,
      inputFingerprint: inventory.inputFingerprint,
      outputUrl,
    });
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function runWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function generateFranceSinglePlateNational(rootDirectory = DEFAULT_ROOT_DIRECTORY, options = {}) {
  const inventoryPath = options.inventoryPath ?? DEFAULT_INVENTORY_PATH;
  const outputDirectory = options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY;
  const manifestName = options.manifestName ?? DEFAULT_MANIFEST_NAME;
  const runtimeIndexName = options.runtimeIndexName ?? DEFAULT_RUNTIME_INDEX_NAME;
  const outputDirectoryUrl = `/${outputDirectory.replaceAll("\\", "/").replace(/^public\//u, "")}`;
  const [inventory, cityCatalog, existingDatasets] = await Promise.all([
    readJson(rootDirectory, inventoryPath),
    readJson(rootDirectory, "geo/catalog/france-city-iris.json"),
    readJson(rootDirectory, "geo/catalog/existing-datasets.json"),
  ]);
  const ownership = await collectOwnership(rootDirectory, cityCatalog, existingDatasets);
  const candidates = selectEligibleSinglePlateCommunes(inventory, ownership);
  const candidatesByDepartment = new Map();
  for (const commune of candidates) {
    const code = String(commune.departmentCode).toUpperCase();
    candidatesByDepartment.set(code, [...(candidatesByDepartment.get(code) ?? []), commune]);
  }
  const departmentCodes = [...candidatesByDepartment.keys()].sort(compareText);
  const requestedDepartments = options.departments?.length
    ? new Set(options.departments.map((code) => String(code).toUpperCase()))
    : null;
  const selectedDepartmentCodes = requestedDepartments
    ? departmentCodes.filter((code) => requestedDepartments.has(code))
    : departmentCodes;
  if (requestedDepartments && selectedDepartmentCodes.length !== requestedDepartments.size) {
    const unknown = [...requestedDepartments].filter((code) => !candidatesByDepartment.has(code));
    throw new Error(`Unknown single-plate departments: ${unknown.join(", ")}`);
  }
  if (selectedDepartmentCodes.length !== departmentCodes.length) {
    throw new Error("Partial department generation cannot publish a complete national manifest");
  }

  const absoluteOutputDirectory = path.resolve(rootDirectory, outputDirectory);
  await mkdir(absoluteOutputDirectory, { recursive: true });
  let completed = 0;
  const products = await runWithConcurrency(
    selectedDepartmentCodes,
    options.concurrency ?? 1,
    async (departmentCode) => {
      const communes = candidatesByDepartment.get(departmentCode);
      const outputUrl = `${outputDirectoryUrl}/${departmentCode}.geojson`;
      const absolutePath = path.join(absoluteOutputDirectory, `${departmentCode}.geojson`);
      let product = options.resume
        ? await loadExistingProduct({
            absolutePath,
            departmentCode,
            communes,
            source: inventory.source,
            inventory,
            outputUrl,
          })
        : null;
      if (!product) {
        const payload = await fetchDepartmentPayload(inventory.source, departmentCode, {
          retries: options.retries ?? 6,
          timeoutMs: options.timeoutMs ?? 120_000,
        });
        product = buildSinglePlateDepartmentProduct({
          departmentCode,
          communes,
          payload,
          source: inventory.source,
          inputFingerprint: inventory.inputFingerprint,
          outputUrl,
        });
        await writeFile(absolutePath, product.serialized, "utf8");
      }
      completed += 1;
      console.log(
        `Single plates: ${completed}/${selectedDepartmentCodes.length} departments, ${departmentCode} (${communes.length} communes)`,
      );
      return product;
    },
  );

  const manifest = buildSinglePlateManifest({
    inventory,
    source: inventory.source,
    products,
    outputDirectoryUrl,
  });
  const audit = validateSinglePlatePublication(
    manifest,
    products,
    candidates.map((commune) => commune.communeCode),
  );
  const manifestPath = path.join(absoluteOutputDirectory, manifestName);
  const manifestContents = serializeJson(manifest);
  await writeFile(manifestPath, manifestContents, "utf8");
  const runtimeIndex = buildSinglePlateRuntimeIndex({ manifest, outputDirectoryUrl });
  const runtimeIndexContents = serializeJson(runtimeIndex);
  const runtimeIndexByteLength = Buffer.byteLength(runtimeIndexContents);
  if (runtimeIndexByteLength > MAX_RUNTIME_INDEX_BYTES) {
    throw new Error(
      `Runtime index exceeds ${MAX_RUNTIME_INDEX_BYTES} bytes (${runtimeIndexByteLength})`,
    );
  }
  const runtimeIndexPath = path.join(absoluteOutputDirectory, runtimeIndexName);
  await writeFile(runtimeIndexPath, runtimeIndexContents, "utf8");
  return {
    inventory,
    candidates,
    products,
    manifest,
    manifestPath,
    manifestSha256: hashContents(manifestContents),
    runtimeIndex,
    runtimeIndexPath,
    runtimeIndexByteLength,
    runtimeIndexSha256: hashContents(runtimeIndexContents),
    audit,
  };
}

async function main(argumentsList = process.argv.slice(2)) {
  const result = await generateFranceSinglePlateNational(DEFAULT_ROOT_DIRECTORY, {
    inventoryPath: readOption(argumentsList, "inventory", DEFAULT_INVENTORY_PATH),
    outputDirectory: readOption(argumentsList, "output-directory", DEFAULT_OUTPUT_DIRECTORY),
    manifestName: readOption(argumentsList, "manifest-name", DEFAULT_MANIFEST_NAME),
    runtimeIndexName: readOption(argumentsList, "runtime-index-name", DEFAULT_RUNTIME_INDEX_NAME),
    concurrency: readPositiveIntegerOption(argumentsList, "concurrency", 1, 8),
    retries: readPositiveIntegerOption(argumentsList, "retries", 6, 12),
    timeoutMs: readPositiveIntegerOption(argumentsList, "timeout-ms", 120_000, 300_000),
    resume: argumentsList.includes("--resume"),
  });
  console.log(
    `National single-plate publication complete: ${result.audit.communeCount} communes, ${result.audit.fragmentCount} fragments`,
  );
  console.log(`Manifest SHA-256: ${result.manifestSha256}`);
  console.log(result.manifestPath);
  console.log(
    `Runtime index: ${result.runtimeIndexByteLength} bytes, SHA-256 ${result.runtimeIndexSha256}`,
  );
  console.log(result.runtimeIndexPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await main();
}
