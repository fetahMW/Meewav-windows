import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  computeBbox,
  findRepresentativePoint,
  isFinitePosition,
  pointInGeometry,
  signedRingArea,
} from "./geometry.mjs";
import {
  createStableAdministrativeZoneId,
  createStableDatasetId,
  createStableZoneId,
  MEEWAV_GEOGRAPHY_NAMESPACE,
} from "./id.mjs";
import { validateDataset } from "./validate.mjs";
import {
  getCrepusculeGroundColor,
  getGrandParisCrepusculeGroundColor,
} from "../../../src/features/globe/maplibre/crepusculeUrbainPalette.ts";

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

function normalizeCoordinateNode(node) {
  if (typeof node === "string") {
    const values = node.trim().split(/[\s,]+/).map(Number);
    if (values.length >= 2 && values.every(Number.isFinite)) return values.slice(0, 3);
    return node;
  }
  if (!Array.isArray(node)) return node;
  if (node.length >= 2 && node.length <= 3 && node.every(Number.isFinite)) return [...node];
  return node.map(normalizeCoordinateNode);
}

function removeDegenerateRings(polygon, onCorrection) {
  if (!Array.isArray(polygon) || polygon.length === 0) return null;
  if (Math.abs(signedRingArea(polygon[0])) <= 1e-15) {
    onCorrection("geometry.degenerate_polygon_removed");
    return null;
  }
  const holes = polygon.slice(1).filter((ring) => {
    const keep = Math.abs(signedRingArea(ring)) > 1e-15;
    if (!keep) onCorrection("geometry.degenerate_hole_removed");
    return keep;
  });
  return [polygon[0], ...holes];
}

export function normalizeLegacyGeometry(geometry, onCorrection = () => {}) {
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    throw new Error(`Unsupported legacy geometry type: ${String(geometry?.type)}`);
  }
  const coordinates = normalizeCoordinateNode(geometry.coordinates);
  if (geometry.type === "Polygon") {
    const polygon = removeDegenerateRings(coordinates, onCorrection);
    if (!polygon) throw new Error("Legacy Polygon has a degenerate exterior ring");
    return { type: "Polygon", coordinates: polygon };
  }
  const polygons = coordinates
    .map((polygon) => removeDegenerateRings(polygon, onCorrection))
    .filter(Boolean);
  if (polygons.length === 0) throw new Error("Legacy MultiPolygon has no non-degenerate polygon");
  return { type: "MultiPolygon", coordinates: polygons };
}

function getParisLegacyZoneId(properties) {
  const arrondissement = Number(properties.c_ar);
  const arrondissementPart = Number.isFinite(arrondissement) ? `${String(arrondissement).padStart(2, "0")}e` : "00e";
  return `paris_${arrondissementPart}_${slugify(properties.l_qu ?? "quartier")}`;
}

export function getLegacyZoneId(feature, configuration) {
  const properties = feature?.properties ?? {};
  if (configuration.id === "paris-districts") return getParisLegacyZoneId(properties);
  const value = feature?.id ?? properties.zoneId ?? properties.id;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Feature in ${configuration.inputPath} has no legacy zone ID`);
  }
  return value;
}

function getDisplayName(feature, configuration) {
  const properties = feature.properties ?? {};
  const value = configuration.id === "paris-districts"
    ? String(properties.l_qu ?? "Quartier").replace(/-/g, " ")
    : properties.label ?? properties.name ?? properties.officialLabel;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Feature ${getLegacyZoneId(feature, configuration)} has no display name`);
  }
  return value.trim();
}

function getCommuneCode(feature, configuration) {
  if (configuration.communeCode) return configuration.communeCode;
  const properties = feature.properties ?? {};
  const candidates = configuration.role === "communes"
    ? [properties.communeCode, properties.code, properties.parentCode]
    : [properties.communeCode, properties.parentCode, properties.code];
  const value = candidates.find((candidate) => /^\d{5}$/.test(String(candidate ?? "")));
  if (!value) throw new Error(`Feature ${getLegacyZoneId(feature, configuration)} has no five-digit commune code`);
  return String(value);
}

function getCommuneName(feature, configuration, displayName) {
  if (configuration.communeName) return configuration.communeName;
  const properties = feature.properties ?? {};
  if (configuration.role === "communes") return displayName;
  const value = properties.parentLabel ?? properties.communeName;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Feature ${getLegacyZoneId(feature, configuration)} has no commune name`);
  }
  return value.trim();
}

function getSourceCode(feature, configuration, legacyZoneId) {
  const properties = feature.properties ?? {};
  if (configuration.id === "paris-districts") return String(properties.c_quinsee ?? properties.c_qu ?? legacyZoneId);
  return String(properties.officialId ?? properties.sourceCode ?? properties.districtCode ?? properties.code ?? legacyZoneId);
}

function getLabelPoint(feature, geometry) {
  const properties = feature.properties ?? {};
  const candidates = [
    [Number(properties.labelLng), Number(properties.labelLat)],
    [Number(properties.geom_x_y?.lon), Number(properties.geom_x_y?.lat)],
  ];
  for (const candidate of candidates) {
    if (isFinitePosition(candidate) && pointInGeometry(candidate, geometry)) {
      return { point: candidate, fallbackUsed: false };
    }
  }
  const point = findRepresentativePoint(geometry);
  if (!point) throw new Error("Unable to calculate an interior label point");
  return { point, fallbackUsed: true };
}

function uniqueAliases(displayName, properties) {
  const candidates = [properties.officialLabel, properties.name, properties.label, properties.l_qu]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .filter((value) => value.toLocaleLowerCase("fr") !== displayName.toLocaleLowerCase("fr"));
  return [...new Map(candidates.map((value) => [value.toLocaleLowerCase("fr"), value])).values()];
}

const CANONICAL_TERRITORY_TYPES = new Set([
  "department",
  "commune",
  "commune_deleguee",
  "quartier",
  "iris",
  "qpv",
]);

function getCanonicalTerritoryType(properties, configuration) {
  if (configuration.role === "communes") return "commune";
  if (CANONICAL_TERRITORY_TYPES.has(properties.territoryType)) return properties.territoryType;
  if (configuration.administrativeSourceType === "iris") return "iris";
  return "quartier";
}

function getPresentation(feature, configuration, legacyZoneId, sourceFeatureIndex, displayName) {
  const properties = feature.properties ?? {};
  const rawColorIndex = Number(properties.colorIndex);
  const parisDistrictIndex = configuration.id === "paris-districts"
    ? Number(properties.c_qu) - 1
    : sourceFeatureIndex;
  const colorIndex = Math.abs(Math.trunc(
    Number.isFinite(rawColorIndex) ? rawColorIndex : Number.isFinite(parisDistrictIndex) ? parisDistrictIndex : 0,
  )) % 8;
  const isGrandParisPalette = legacyZoneId.startsWith("grand_paris_");
  const explicitGroundColor = typeof properties.groundColor === "string" && /^#[0-9a-f]{6}$/i.test(properties.groundColor)
    ? properties.groundColor.toUpperCase()
    : null;
  const groundColor = isGrandParisPalette
    ? getGrandParisCrepusculeGroundColor({
        label: displayName,
        zoneId: legacyZoneId,
        colorIndex,
        legacyGroundColor: explicitGroundColor,
      })
    : explicitGroundColor ?? getCrepusculeGroundColor({
        label: displayName,
        zoneId: legacyZoneId,
        colorIndex,
      });

  return {
    colorIndex,
    groundColor,
    territoryType: getCanonicalTerritoryType(properties, configuration),
    paletteFamily: configuration.role === "districts" ? "city" : "metropolitan",
    overviewVisible: configuration.role !== "subzones",
  };
}

async function loadCatalog(rootDirectory) {
  const catalogPath = path.join(rootDirectory, "geo", "catalog", "existing-datasets.json");
  return JSON.parse(await readFile(catalogPath, "utf8"));
}

async function loadConfiguredSources(rootDirectory, group) {
  const catalog = await loadCatalog(rootDirectory);
  const configurations = catalog.datasets.filter((entry) => group === "all" || entry.group === group);
  if (configurations.length === 0) throw new Error(`Unknown existing-city group: ${group}`);

  const sources = [];
  for (const configuration of configurations) {
    const input = JSON.parse(await readFile(path.join(rootDirectory, configuration.inputPath), "utf8"));
    if (input.type !== "FeatureCollection" || !Array.isArray(input.features)) {
      throw new Error(`${configuration.inputPath} is not a GeoJSON FeatureCollection`);
    }
    sources.push({ configuration, input });
  }
  return sources;
}

function buildSourceMetadata(sources) {
  const records = sources.map(({ configuration, input }) => ({
    provider: configuration.sourceProvider,
    sourceType: configuration.administrativeSourceType,
    vintage: configuration.sourceVintage,
    license: configuration.license,
    url: input.metadata?.datasetUrl ?? input.metadata?.sourceFileUrl ?? null,
  }));
  const byKey = new Map(records.map((record) => [JSON.stringify(record), record]));
  return [...byKey.values()];
}

function getCreatedAt(sources) {
  const timestamps = sources
    .map(({ input }) => input.metadata?.generatedAt)
    .filter((value) => Number.isFinite(Date.parse(value)))
    .sort();
  return timestamps.at(-1) ?? "2026-07-13T00:00:00.000Z";
}

export async function convertExistingGroup(rootDirectory, group, options = {}) {
  const sources = await loadConfiguredSources(rootDirectory, group);
  const version = options.version ?? `existing-${group}-2026.07.13`;
  const legacyToStable = new Map();
  const allFeatures = [];

  for (const source of sources) {
    for (const [sourceFeatureIndex, feature] of source.input.features.entries()) {
      const legacyZoneId = getLegacyZoneId(feature, source.configuration);
      if (legacyToStable.has(legacyZoneId)) {
        throw new Error(`Duplicate legacy zone ID across selected sources: ${legacyZoneId}`);
      }
      const stableZoneId = createStableZoneId(`legacy:${legacyZoneId}`);
      legacyToStable.set(legacyZoneId, stableZoneId);
      allFeatures.push({ ...source, feature, legacyZoneId, stableZoneId, sourceFeatureIndex });
    }
  }

  const administrativeZones = [];
  const musicZones = [];
  const mappingEntries = [];
  const warnings = [];

  for (const entry of allFeatures) {
    const { configuration, feature, legacyZoneId, stableZoneId, sourceFeatureIndex } = entry;
    const properties = feature.properties ?? {};
    const geometry = normalizeLegacyGeometry(feature.geometry, (code) => warnings.push({ code, legacyZoneId }));
    const bbox = computeBbox(geometry);
    if (!bbox) throw new Error(`Unable to compute bbox for ${legacyZoneId}`);
    const displayName = getDisplayName(feature, configuration);
    const communeCode = getCommuneCode(feature, configuration);
    const communeName = getCommuneName(feature, configuration, displayName);
    const sourceCode = getSourceCode(feature, configuration, legacyZoneId);
    const administrativeZoneId = createStableAdministrativeZoneId(`${configuration.id}:${sourceCode}`);
    const sourceVintage = String(properties.sourceYear ?? configuration.sourceVintage);
    const label = getLabelPoint(feature, geometry);
    if (label.fallbackUsed) warnings.push({ code: "label_point.recomputed", legacyZoneId });

    const legacyParentZoneId = typeof properties.parentZoneId === "string" ? properties.parentZoneId : null;
    const parentZoneId = legacyParentZoneId ? legacyToStable.get(legacyParentZoneId) ?? null : null;
    if (legacyParentZoneId && !parentZoneId) {
      warnings.push({ code: "parent.not_materialized", legacyZoneId, legacyParentZoneId });
    }

    administrativeZones.push({
      id: administrativeZoneId,
      sourceType: configuration.administrativeSourceType,
      sourceProvider: String(properties.source ?? configuration.sourceProvider),
      sourceCode,
      sourceVintage,
      officialName: String(properties.officialLabel ?? displayName),
      parentId: null,
      communeCode,
      geometry,
    });

    musicZones.push({
      zoneId: stableZoneId,
      displayName,
      aliases: uniqueAliases(displayName, properties),
      communeCode,
      communeName,
      parentZoneId,
      sourceZoneIds: [administrativeZoneId],
      sourceType: configuration.musicSourceType,
      sourceVintage,
      geometry,
      bbox,
      center: label.point,
      labelPoint: label.point,
      status: configuration.status,
      quality: configuration.quality,
      presentation: getPresentation(feature, configuration, legacyZoneId, sourceFeatureIndex, displayName),
    });

    mappingEntries.push({
      legacyZoneId,
      stableZoneId,
      sourceDataset: configuration.id,
      ...(configuration.runtimeMode === "national" ? { runtimeMode: "national" } : {}),
      legacyParentZoneId,
      stableParentZoneId: parentZoneId,
    });
  }

  const dataset = {
    datasetId: createStableDatasetId(`existing:${group}`),
    version,
    scope: group,
    status: musicZones.every((zone) => zone.status !== "draft") ? "validated" : "draft",
    createdAt: getCreatedAt(sources),
    publishedAt: null,
    sources: buildSourceMetadata(sources),
    administrativeZones,
    musicZones,
  };
  const validation = validateDataset(dataset);

  return {
    dataset,
    validation,
    mapping: {
      schemaVersion: 1,
      scope: group,
      namespace: MEEWAV_GEOGRAPHY_NAMESPACE,
      entries: mappingEntries.sort((first, second) => first.legacyZoneId.localeCompare(second.legacyZoneId)),
    },
    report: {
      scope: group,
      sourceFiles: sources.map(({ configuration, input }) => ({
        id: configuration.id,
        inputPath: configuration.inputPath,
        featureCount: input.features.length,
      })),
      warningCount: warnings.length,
      warnings,
      administrativeZoneCount: administrativeZones.length,
      musicZoneCount: musicZones.length,
      validationErrorCount: validation.errors.length,
      validationWarningCount: validation.warnings.length,
    },
  };
}

function renderMigrationReport(result) {
  const { report, validation } = result;
  const sourceRows = report.sourceFiles
    .map((source) => `| \`${source.inputPath}\` | ${source.featureCount} |`)
    .join("\n");
  const warningGroups = new Map();
  for (const warning of report.warnings) warningGroups.set(warning.code, (warningGroups.get(warning.code) ?? 0) + 1);
  const warningRows = [...warningGroups.entries()].map(([code, count]) => `| \`${code}\` | ${count} |`).join("\n") || "| Aucun | 0 |";

  return `# Migration canonique — ${report.scope}\n\nDate : 2026-07-13\n\n## Résultat\n\n- Zones administratives : ${report.administrativeZoneCount}\n- Music zones : ${report.musicZoneCount}\n- Erreurs bloquantes : ${report.validationErrorCount}\n- Avertissements de validation : ${report.validationWarningCount}\n- Avertissements de conversion : ${report.warningCount}\n- Dataset valide : ${validation.valid ? "oui" : "non"}\n\n## Sources converties\n\n| Fichier legacy | Features |\n| --- | ---: |\n${sourceRows}\n\n## Avertissements de conversion\n\n| Code | Nombre |\n| --- | ---: |\n${warningRows}\n\n## Garanties\n\n- Les géométries existantes sont conservées ; seules les coordonnées legacy encodées en chaînes sont normalisées en positions GeoJSON numériques.\n- Chaque ancien ID possède un UUID produit stable.\n- Les parents réellement présents dans le corpus sont convertis ; les groupes de présentation sans géométrie restent documentés comme non matérialisés.\n- Aucun fichier frontend n'est modifié par cette migration.\n`;
}

export async function writeExistingGroupArtifacts(rootDirectory, group, options = {}) {
  const result = await convertExistingGroup(rootDirectory, group, options);
  const outputDirectory = path.join(rootDirectory, "geo", "output");
  const mappingDirectory = path.join(rootDirectory, "geo", "mappings", "legacy-zone-ids");
  const reportDirectory = path.join(rootDirectory, "docs", "geospatial", "migrations");
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    mkdir(mappingDirectory, { recursive: true }),
    mkdir(reportDirectory, { recursive: true }),
  ]);
  const outputPath = path.join(outputDirectory, `${group}.canonical.json`);
  const mappingPath = path.join(mappingDirectory, `${group}.json`);
  const reportPath = path.join(reportDirectory, `${group}.md`);
  await Promise.all([
    writeFile(outputPath, `${JSON.stringify(result.dataset)}\n`),
    writeFile(mappingPath, `${JSON.stringify(result.mapping, null, 2)}\n`),
    writeFile(reportPath, renderMigrationReport(result)),
  ]);
  return { ...result, outputPath, mappingPath, reportPath };
}
