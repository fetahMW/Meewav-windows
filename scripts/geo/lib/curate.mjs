import union from "@turf/union";
import { feature, featureCollection } from "@turf/helpers";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeBbox, findRepresentativePoint, pointInGeometry } from "./geometry.mjs";
import { createStableZoneId, isUuid } from "./id.mjs";
import { validateDataset } from "./validate.mjs";

function uniqueStrings(values) {
  return [...new Map(values
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => [value.trim().toLocaleLowerCase("fr"), value.trim()])).values()];
}

function validateOverrideHeader(dataset, override) {
  if (override?.schemaVersion !== 1 || !Array.isArray(override.decisions)) {
    throw new Error("Invalid curation override contract");
  }
  if (override.scope !== dataset.scope) throw new Error(`Override scope ${override.scope} does not match ${dataset.scope}`);
}

function applyUpdate(zone, decision) {
  const next = { ...zone };
  if (decision.displayName !== undefined) next.displayName = String(decision.displayName).trim();
  if (decision.aliases !== undefined) next.aliases = uniqueStrings(decision.aliases);
  if (decision.labelPoint !== undefined) next.labelPoint = decision.labelPoint;
  if (decision.cameraOverride !== undefined) next.cameraOverride = decision.cameraOverride;
  if (decision.status !== undefined) next.status = decision.status;
  if (decision.quality !== undefined) next.quality = decision.quality;
  return next;
}

function mergeZones(dataset, decision, zonesById) {
  if (!Array.isArray(decision.zoneIds) || decision.zoneIds.length < 2) {
    throw new Error("A merge decision requires at least two zoneIds");
  }
  const sourceZones = decision.zoneIds.map((zoneId) => {
    const zone = zonesById.get(zoneId);
    if (!zone) throw new Error(`Merge source zone does not exist: ${zoneId}`);
    return zone;
  });
  const communeCodes = new Set(sourceZones.map((zone) => zone.communeCode));
  if (communeCodes.size !== 1) throw new Error("Merged zones must belong to the same commune");
  const mergedFeature = union(featureCollection(sourceZones.map((zone) => feature(zone.geometry))));
  if (!mergedFeature?.geometry || !["Polygon", "MultiPolygon"].includes(mergedFeature.geometry.type)) {
    throw new Error("Unable to union selected curation zones");
  }
  const geometry = mergedFeature.geometry;
  const bbox = computeBbox(geometry);
  const fallbackLabelPoint = findRepresentativePoint(geometry);
  if (!bbox || !fallbackLabelPoint) throw new Error("Unable to derive merged zone bounds and label point");
  const requestedLabelPoint = decision.labelPoint;
  const labelPoint = Array.isArray(requestedLabelPoint) && pointInGeometry(requestedLabelPoint, geometry)
    ? requestedLabelPoint
    : fallbackLabelPoint;
  const decisionKey = String(decision.decisionId ?? decision.displayName ?? decision.zoneIds.join("+"));
  const zoneId = decision.zoneId ?? createStableZoneId(`curation:${dataset.scope}:${decisionKey}`);
  if (!isUuid(zoneId)) throw new Error(`Merged zoneId must be a UUID: ${zoneId}`);
  const parentIds = new Set(sourceZones.map((zone) => zone.parentZoneId).filter(Boolean));
  const first = sourceZones[0];
  return {
    ...first,
    zoneId,
    displayName: String(decision.displayName ?? first.displayName).trim(),
    aliases: uniqueStrings(decision.aliases ?? sourceZones.flatMap((zone) => [zone.displayName, ...zone.aliases])),
    parentZoneId: parentIds.size === 1 ? [...parentIds][0] : null,
    sourceZoneIds: [...new Set(sourceZones.flatMap((zone) => zone.sourceZoneIds))],
    sourceType: "merged",
    geometry,
    bbox,
    center: labelPoint,
    labelPoint,
    status: decision.status ?? "validated",
    quality: decision.quality ?? "curated",
    cameraOverride: decision.cameraOverride,
  };
}

export function createCurationTemplate(dataset, communeCode) {
  const zones = dataset.musicZones.filter((zone) => zone.communeCode === communeCode);
  if (zones.length === 0) throw new Error(`No music zone found for commune ${communeCode}`);
  return {
    schemaVersion: 1,
    scope: dataset.scope,
    sourceVintage: [...new Set(zones.map((zone) => zone.sourceVintage))].join(","),
    communeCode,
    communeName: zones[0].communeName,
    decisions: zones.map((zone) => ({
      operation: "update",
      zoneId: zone.zoneId,
      displayName: zone.displayName,
      aliases: zone.aliases,
      labelPoint: zone.labelPoint,
      ...(zone.cameraOverride ? { cameraOverride: zone.cameraOverride } : {}),
      status: zone.status,
    })),
    notes: ["Remove unchanged decisions before commit; add a merge decision with zoneIds when needed."],
  };
}

export function applyCurationOverride(dataset, override, options = {}) {
  validateOverrideHeader(dataset, override);
  let musicZones = dataset.musicZones.map((zone) => structuredClone(zone));
  const applied = [];
  for (const [index, decision] of override.decisions.entries()) {
    if (decision.operation === "update") {
      const zoneIndex = musicZones.findIndex((zone) => zone.zoneId === decision.zoneId);
      if (zoneIndex < 0) throw new Error(`Update zone does not exist: ${decision.zoneId}`);
      musicZones[zoneIndex] = applyUpdate(musicZones[zoneIndex], decision);
      applied.push({ index, operation: "update", zoneId: decision.zoneId });
      continue;
    }
    if (decision.operation === "merge") {
      const zonesById = new Map(musicZones.map((zone) => [zone.zoneId, zone]));
      const merged = mergeZones(dataset, decision, zonesById);
      const removedIds = new Set(decision.zoneIds);
      musicZones = musicZones
        .filter((zone) => !removedIds.has(zone.zoneId))
        .map((zone) => removedIds.has(zone.parentZoneId) ? { ...zone, parentZoneId: merged.zoneId } : zone);
      if (musicZones.some((zone) => zone.zoneId === merged.zoneId)) {
        throw new Error(`Merged zoneId already exists: ${merged.zoneId}`);
      }
      musicZones.push(merged);
      applied.push({ index, operation: "merge", zoneId: merged.zoneId, removedZoneIds: [...removedIds] });
      continue;
    }
    throw new Error(`Unknown curation operation at decisions[${index}]: ${decision.operation}`);
  }
  musicZones.sort((first, second) => first.zoneId.localeCompare(second.zoneId));
  const status = musicZones.some((zone) => zone.status === "draft") ? "draft" : "validated";
  const curated = {
    ...structuredClone(dataset),
    version: options.version ?? dataset.version,
    status,
    publishedAt: null,
    musicZones,
  };
  const validation = validateDataset(curated);
  if (!validation.valid) {
    const summary = validation.errors.slice(0, 5).map((entry) => `${entry.code} ${entry.path}`).join(", ");
    throw new Error(`Curated dataset is invalid: ${summary}`);
  }
  return { dataset: curated, validation, applied };
}

export async function curateDatasetFiles(rootDirectory, options) {
  const inputPath = path.resolve(rootDirectory, options.inputPath);
  const dataset = JSON.parse(await readFile(inputPath, "utf8"));
  if (options.templatePath) {
    const template = createCurationTemplate(dataset, options.communeCode);
    const templatePath = path.resolve(rootDirectory, options.templatePath);
    await mkdir(path.dirname(templatePath), { recursive: true });
    await writeFile(templatePath, `${JSON.stringify(template, null, 2)}\n`);
    return { templatePath, template };
  }
  const overridePath = path.resolve(rootDirectory, options.overridePath);
  const override = JSON.parse(await readFile(overridePath, "utf8"));
  const result = applyCurationOverride(dataset, override, { version: options.version });
  const outputPath = path.resolve(rootDirectory, options.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result.dataset)}\n`);
  return { ...result, outputPath, overridePath };
}
