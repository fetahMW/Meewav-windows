import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  computeBbox,
  findRepresentativePoint,
  pointInGeometry,
} from "./geometry.mjs";

function stripAccents(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function requiredString(value, context) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} must be a non-empty string`);
  }
  return value.trim();
}

function validateGeometry(geometry, context) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`${context} must contain a Polygon or MultiPolygon geometry`);
  }
  const bbox = computeBbox(geometry);
  const labelPoint = findRepresentativePoint(geometry);
  if (!bbox || !labelPoint || !pointInGeometry(labelPoint, geometry)) {
    throw new Error(`${context} has no valid bbox or interior label point`);
  }
  return { bbox, labelPoint };
}

function readMappedProperty(properties, propertyName, context) {
  return requiredString(properties?.[propertyName], `${context}.${propertyName}`);
}

export function createLocalDistrictCollection(input, configuration) {
  if (input?.type !== "FeatureCollection" || !Array.isArray(input.features)) {
    throw new Error("Official local source is not a GeoJSON FeatureCollection");
  }
  const propertyMap = configuration.propertyMap ?? {};
  const labelProperty = requiredString(propertyMap.label, "propertyMap.label");
  const parentProperty = requiredString(propertyMap.parentLabel, "propertyMap.parentLabel");
  const communeProperty = requiredString(propertyMap.communeName, "propertyMap.communeName");
  const zoneIdPrefix = requiredString(configuration.zoneIdPrefix, "zoneIdPrefix");
  const expectedCommune = requiredString(configuration.sourceCommuneValue, "sourceCommuneValue");

  const records = input.features
    .filter((feature) => String(feature?.properties?.[communeProperty] ?? "").trim() === expectedCommune)
    .map((feature, sourceIndex) => {
      const context = `feature[${sourceIndex}]`;
      const label = readMappedProperty(feature.properties, labelProperty, context);
      const parentLabel = readMappedProperty(feature.properties, parentProperty, context);
      const communeName = readMappedProperty(feature.properties, communeProperty, context);
      const labelSlug = slugify(label);
      const parentSlug = slugify(parentLabel);
      if (!labelSlug || !parentSlug) throw new Error(`${context} cannot produce a stable source key`);
      const sourceCode = `${parentSlug}:${labelSlug}`;
      const zoneId = `${zoneIdPrefix}_${parentSlug}_${labelSlug}`;
      const { bbox, labelPoint } = validateGeometry(feature.geometry, context);
      return {
        zoneId,
        label,
        parentLabel,
        communeName,
        sourceCode,
        bbox,
        labelPoint,
        geometry: feature.geometry,
      };
    })
    .sort((first, second) => (
      first.parentLabel.localeCompare(second.parentLabel, "fr")
      || first.label.localeCompare(second.label, "fr")
      || first.zoneId.localeCompare(second.zoneId)
    ));

  if (records.length !== Number(configuration.expectedFeatureCount)) {
    throw new Error(`Expected ${configuration.expectedFeatureCount} local districts, received ${records.length}`);
  }
  const duplicateIds = records.filter((record, index) => records.findIndex((candidate) => candidate.zoneId === record.zoneId) !== index);
  if (duplicateIds.length > 0) throw new Error(`Duplicate generated zone ID: ${duplicateIds[0].zoneId}`);

  return {
    type: "FeatureCollection",
    metadata: {
      id: configuration.id,
      title: configuration.title,
      datasetUrl: configuration.datasetUrl,
      sourceFileUrl: configuration.sourceUrl,
      sourceProvider: configuration.sourceProvider,
      sourceYear: configuration.sourceVintage,
      sourceUpdatedAt: configuration.sourceUpdatedAt,
      generatedAt: configuration.generatedAt,
      license: configuration.license,
      communeCode: configuration.communeCode,
      communeName: configuration.communeName,
      runtimeMode: "national",
      featureCount: records.length,
      sourceCodeContract: "parent-label-slug:district-label-slug",
    },
    features: records.map((record, index) => ({
      type: "Feature",
      id: record.zoneId,
      properties: {
        zoneId: record.zoneId,
        label: record.label,
        officialLabel: record.label,
        parentLabel: record.parentLabel,
        communeName: configuration.communeName,
        communeCode: configuration.communeCode,
        sourceCode: record.sourceCode,
        source: configuration.sourceProvider,
        sourceYear: configuration.sourceVintage,
        territoryType: "quartier",
        runtimeMode: "national",
        colorIndex: index % 8,
        labelLng: record.labelPoint[0],
        labelLat: record.labelPoint[1],
        bbox: record.bbox,
      },
      geometry: record.geometry,
    })),
  };
}

export async function importLocalDistricts(rootDirectory, configPath) {
  const absoluteConfigPath = path.resolve(rootDirectory, configPath);
  const configuration = JSON.parse(await readFile(absoluteConfigPath, "utf8"));
  const response = await fetch(configuration.sourceUrl, {
    headers: { accept: "application/geo+json, application/json" },
  });
  if (!response.ok) throw new Error(`Unable to fetch official local districts: HTTP ${response.status}`);
  const collection = createLocalDistrictCollection(await response.json(), configuration);
  const outputPath = path.resolve(rootDirectory, configuration.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(collection)}\n`);
  return { configuration, collection, outputPath };
}
