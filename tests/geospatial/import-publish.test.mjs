import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildPostgisImport,
  renderPostgisActivationSql,
  renderPostgisImportSql,
  renderPostgisValidationSql,
} from "../../scripts/geo/lib/import-postgis.mjs";
import { prepareGeographyRelease } from "../../scripts/geo/lib/publish.mjs";

const rootDirectory = process.cwd();
const TEST_ZONE_ID = "5fb2d651-38bd-5a6f-8673-665f6e131ddd";
const polygon = {
  type: "Polygon",
  coordinates: [[[2, 48], [2.02, 48], [2.02, 48.02], [2, 48.02], [2, 48]]],
};
const canonicalDataset = {
  datasetId: "69925efc-87d1-5cb0-aa83-9acee887d424",
  version: "test-release-1",
  scope: "test-scope",
  status: "validated",
  createdAt: "2026-07-13T00:00:00.000Z",
  publishedAt: null,
  sources: [{ provider: "Test", sourceType: "iris", vintage: "2026", license: "Test only" }],
  administrativeZones: [{
    id: "3bb61ade-9dbc-5f8e-9621-df9b9da37e2e",
    sourceType: "iris",
    sourceProvider: "Test",
    sourceCode: "TEST001",
    sourceVintage: "2026",
    officialName: "Zone test",
    parentId: null,
    communeCode: "99999",
    geometry: polygon,
  }],
  musicZones: [{
    zoneId: TEST_ZONE_ID,
    displayName: "Zone test",
    aliases: ["Test musical"],
    communeCode: "99999",
    communeName: "Commune test",
    parentZoneId: null,
    sourceZoneIds: ["3bb61ade-9dbc-5f8e-9621-df9b9da37e2e"],
    sourceType: "official",
    sourceVintage: "2026",
    geometry: polygon,
    bbox: [2, 48, 2.02, 48.02],
    center: [2.01, 48.01],
    labelPoint: [2.01, 48.01],
    status: "validated",
    quality: "official",
  }],
};

test("renders a transactional, versioned and non-activating PostGIS import", () => {
  const sql = renderPostgisImportSql(canonicalDataset);
  assert.match(sql, /BEGIN;/);
  assert.match(sql, /active_dataset_is_immutable/);
  assert.match(sql, /ST_GeomFromGeoJSON/);
  assert.match(sql, /COMMIT;/);
  assert.doesNotMatch(sql, /geography_active_datasets \(scope/);

  const activationSql = renderPostgisActivationSql(canonicalDataset);
  assert.match(activationSql, /draft_zone_cannot_be_published/);
  assert.match(activationSql, /INSERT INTO geography_active_datasets/);

  const validationSql = renderPostgisValidationSql(canonicalDataset);
  assert.match(validationSql, /problematic_music_zone_overlaps/);
  assert.match(validationSql, /insufficient_commune_coverage/);
  assert.match(validationSql, /unstable_zone_ids_between_versions/);
});

test("builds a reviewable PostGIS import without opening a database", async () => {
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "meewav-geo-import-"));
  const inputPath = path.join(outputDirectory, "canonical.json");
  await writeFile(inputPath, `${JSON.stringify(canonicalDataset)}\n`);
  const result = await buildPostgisImport(rootDirectory, {
    scope: canonicalDataset.scope,
    version: canonicalDataset.version,
    inputPath,
    outputDirectory,
  });
  assert.equal(result.manifest.musicZoneCount, 1);
  assert.ok(result.manifest.sqlBytes > 1_000);
  assert.match(await readFile(result.sqlPath, "utf8"), /Zone test/);
});

test("prepares an immutable checksummed release without activating national mode", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "meewav-geo-release-"));
  const inputPath = path.join(temporaryRoot, "canonical.json");
  const releasesPath = path.join(temporaryRoot, "releases");
  await writeFile(inputPath, `${JSON.stringify(canonicalDataset)}\n`);
  const result = await prepareGeographyRelease(rootDirectory, {
    scope: canonicalDataset.scope,
    version: canonicalDataset.version,
    inputPath,
    outputDirectory: releasesPath,
    minimumZoom: 8,
    maximumZoom: 8,
  });
  assert.equal(result.releaseManifest.releaseStatus, "candidate");
  assert.equal(result.releaseManifest.activation.automatic, false);
  assert.equal(result.releaseManifest.activation.runtimeModeRemains, "legacy");
  assert.equal(result.releaseManifest.counts.musicZones, 1);
  assert.equal(result.releaseManifest.counts.zoneDetails, 1);
  assert.deepEqual(
    await readdir(path.join(result.releaseDirectory, "zone-details")),
    [`${TEST_ZONE_ID}.geojson`],
  );
  const diskManifest = JSON.parse(await readFile(path.join(result.releaseDirectory, "release-manifest.json"), "utf8"));
  assert.equal(diskManifest.artifacts.zonesPmtiles.sha256, result.tiles.manifest.sha256);
  assert.ok(diskManifest.artifacts.postgisValidation.bytes > 1_000);
  await assert.rejects(
    prepareGeographyRelease(rootDirectory, {
      scope: canonicalDataset.scope,
      version: canonicalDataset.version,
      inputPath,
      outputDirectory: releasesPath,
      minimumZoom: 8,
      maximumZoom: 8,
    }),
    /already exists and is immutable/,
  );
});
