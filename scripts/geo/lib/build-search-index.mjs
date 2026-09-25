import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { convertExistingGroup } from "./migrate-existing.mjs";
import { validateDataset } from "./validate.mjs";

function normalizeSearchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function createSearchIndex(dataset) {
  return dataset.musicZones
    .map((zone) => ({
      zoneId: zone.zoneId,
      displayName: zone.displayName,
      aliases: zone.aliases,
      communeCode: zone.communeCode,
      communeName: zone.communeName,
      departmentName: null,
      regionName: null,
      bbox: zone.bbox,
      labelPoint: zone.labelPoint,
      quality: zone.quality,
      sourceVintage: zone.sourceVintage,
      cameraOverride: zone.cameraOverride ?? null,
      searchKey: normalizeSearchText([zone.displayName, ...zone.aliases, zone.communeName].join(" ")),
    }))
    .sort((first, second) => (
      first.displayName.localeCompare(second.displayName, "fr")
      || first.communeName.localeCompare(second.communeName, "fr")
      || first.zoneId.localeCompare(second.zoneId)
    ));
}

export async function buildGeographySearchIndex(rootDirectory, scope, options = {}) {
  const version = options.version ?? "2026.1-search-prototype";
  const conversion = options.dataset
    ? { dataset: options.dataset, validation: validateDataset(options.dataset) }
    : await convertExistingGroup(rootDirectory, scope);
  if (!conversion.validation.valid) throw new Error(`Canonical ${scope} dataset is invalid`);
  const zones = createSearchIndex(conversion.dataset);
  const payload = {
    schemaVersion: 1,
    version,
    scope,
    generatedAt: new Date().toISOString(),
    zones,
  };
  const bytes = Buffer.from(`${JSON.stringify(payload)}\n`);
  const manifest = {
    schemaVersion: 1,
    version,
    scope,
    zoneCount: zones.length,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const outputDirectory = path.join(rootDirectory, "geo", "output", "search", version);
  await mkdir(outputDirectory, { recursive: true });
  const indexPath = path.join(outputDirectory, "music-zones-search.json");
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await Promise.all([
    writeFile(indexPath, bytes),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  return { indexPath, manifestPath, manifest, payload };
}
