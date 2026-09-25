import { createHash } from "node:crypto";
import { access, copyFile, cp, mkdir, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildGeographySearchIndex } from "./build-search-index.mjs";
import { buildZonesTileset } from "./build-zones.mjs";
import {
  loadCanonicalDataset,
  renderPostgisActivationSql,
  renderPostgisImportSql,
  renderPostgisValidationSql,
} from "./import-postgis.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function assertPublishable(dataset, maximumTileBytes, maximumAllowedTileBytes) {
  if (dataset.status === "draft") throw new Error("Draft datasets cannot be published");
  const draftZones = dataset.musicZones.filter((zone) => zone.status === "draft");
  if (draftZones.length > 0) throw new Error(`Draft zones cannot be published (${draftZones.length} found)`);
  if (maximumTileBytes > maximumAllowedTileBytes) {
    throw new Error(`Largest vector tile is ${maximumTileBytes} bytes; limit is ${maximumAllowedTileBytes}`);
  }
}

export async function prepareGeographyRelease(rootDirectory, options = {}) {
  if (!options.version) throw new Error("publish requires an explicit immutable --version");
  const loaded = await loadCanonicalDataset(rootDirectory, options);
  const scope = loaded.dataset.scope;
  const version = loaded.dataset.version;
  const releasesRoot = options.outputDirectory
    ? path.resolve(rootDirectory, options.outputDirectory)
    : path.join(rootDirectory, "geo", "output", "releases");
  const releaseDirectory = path.join(releasesRoot, version);
  if (await exists(releaseDirectory)) {
    throw new Error(`Release ${version} already exists and is immutable`);
  }
  const maximumAllowedTileBytes = Number(options.maximumAllowedTileBytes ?? 500_000);
  const tiles = await buildZonesTileset(rootDirectory, scope, {
    version,
    minimumZoom: options.minimumZoom,
    maximumZoom: options.maximumZoom,
    dataset: loaded.dataset,
  });
  const search = await buildGeographySearchIndex(rootDirectory, scope, {
    version,
    dataset: loaded.dataset,
  });
  assertPublishable(loaded.dataset, tiles.manifest.maximumTileBytes, maximumAllowedTileBytes);

  await mkdir(releasesRoot, { recursive: true });
  const temporaryDirectory = await mkdtemp(path.join(releasesRoot, `.${version}-`));

  const tileArchiveName = "france-zones.pmtiles";
  const searchIndexName = "music-zones-search.json";
  const importSql = Buffer.from(renderPostgisImportSql(loaded.dataset));
  const validationSql = Buffer.from(renderPostgisValidationSql(loaded.dataset));
  const activationSql = Buffer.from(renderPostgisActivationSql(loaded.dataset));
  const canonicalBytes = Buffer.from(`${JSON.stringify(loaded.dataset)}\n`);
  const releaseManifest = {
    schemaVersion: 1,
    releaseStatus: "candidate",
    version,
    scope,
    datasetId: loaded.dataset.datasetId,
    datasetStatus: loaded.dataset.status,
    createdAt: new Date().toISOString(),
    sourceInput: loaded.inputPath ? path.relative(rootDirectory, loaded.inputPath) : `catalog:${scope}`,
    qualityGates: {
      canonicalValidation: "passed",
      draftZoneCount: 0,
      maximumAllowedTileBytes,
      maximumTileBytes: tiles.manifest.maximumTileBytes,
      legacyRollbackAvailable: true,
    },
    counts: {
      administrativeZones: loaded.dataset.administrativeZones.length,
      musicZones: loaded.dataset.musicZones.length,
      zoneDetails: tiles.manifest.zoneDetailCount,
      vectorTiles: tiles.manifest.tileCount,
      searchRecords: search.manifest.zoneCount,
    },
    artifacts: {
      canonicalDataset: { file: "canonical-dataset.json", bytes: canonicalBytes.length, sha256: sha256(canonicalBytes) },
      zonesPmtiles: { file: tileArchiveName, bytes: tiles.manifest.bytes, sha256: tiles.manifest.sha256 },
      zonesManifest: { file: "tiles-manifest.json" },
      zoneDetails: { directory: "zone-details", count: tiles.manifest.zoneDetailCount },
      searchIndex: { file: searchIndexName, bytes: search.manifest.bytes, sha256: search.manifest.sha256 },
      searchManifest: { file: "search-manifest.json" },
      postgisImport: { file: "postgis-import.sql", bytes: importSql.length, sha256: sha256(importSql) },
      postgisValidation: { file: "postgis-validate.sql", bytes: validationSql.length, sha256: sha256(validationSql) },
      postgisActivation: { file: "postgis-activate.sql", bytes: activationSql.length, sha256: sha256(activationSql) },
    },
    activation: {
      automatic: false,
      requiresExplicitDatabasePromotion: true,
      runtimeModeRemains: "legacy",
    },
  };

  await Promise.all([
    copyFile(tiles.archivePath, path.join(temporaryDirectory, tileArchiveName)),
    copyFile(tiles.manifestPath, path.join(temporaryDirectory, "tiles-manifest.json")),
    cp(tiles.detailDirectory, path.join(temporaryDirectory, "zone-details"), { recursive: true }),
    copyFile(search.indexPath, path.join(temporaryDirectory, searchIndexName)),
    copyFile(search.manifestPath, path.join(temporaryDirectory, "search-manifest.json")),
    writeFile(path.join(temporaryDirectory, "canonical-dataset.json"), canonicalBytes),
    writeFile(path.join(temporaryDirectory, "postgis-import.sql"), importSql),
    writeFile(path.join(temporaryDirectory, "postgis-validate.sql"), validationSql),
    writeFile(path.join(temporaryDirectory, "postgis-activate.sql"), activationSql),
    writeFile(path.join(temporaryDirectory, "release-manifest.json"), `${JSON.stringify(releaseManifest, null, 2)}\n`),
  ]);

  const copiedArchive = await readFile(path.join(temporaryDirectory, tileArchiveName));
  const copiedSearchIndex = await readFile(path.join(temporaryDirectory, searchIndexName));
  if (sha256(copiedArchive) !== tiles.manifest.sha256 || sha256(copiedSearchIndex) !== search.manifest.sha256) {
    throw new Error("Release artifact checksum mismatch before atomic publication");
  }
  await rename(temporaryDirectory, releaseDirectory);
  return { releaseDirectory, releaseManifest, tiles, search };
}
