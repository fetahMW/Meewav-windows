import assert from "node:assert/strict";
import test from "node:test";
import {
  createStableAdministrativeZoneId,
  createStableDatasetId,
  createStableZoneId,
} from "../../scripts/geo/lib/id.mjs";
import { validateDataset } from "../../scripts/geo/lib/validate.mjs";

function createDataset() {
  const sourceId = createStableAdministrativeZoneId("test:iris:001");
  const zoneId = createStableZoneId("test:music-zone:001");
  const geometry = {
    type: "Polygon",
    coordinates: [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]],
  };

  return {
    datasetId: createStableDatasetId("test"),
    version: "test.1",
    scope: "test",
    status: "validated",
    createdAt: "2026-07-13T00:00:00.000Z",
    publishedAt: null,
    sources: [{ provider: "Test provider", sourceType: "iris", vintage: "2026", license: "Test only", url: null }],
    administrativeZones: [{
      id: sourceId,
      sourceType: "iris",
      sourceProvider: "Test provider",
      sourceCode: "001",
      sourceVintage: "2026",
      officialName: "Zone source",
      parentId: null,
      communeCode: "00001",
      geometry,
    }],
    musicZones: [{
      zoneId,
      displayName: "Zone test",
      aliases: ["Test"],
      communeCode: "00001",
      communeName: "Testville",
      parentZoneId: null,
      sourceZoneIds: [sourceId],
      sourceType: "official",
      sourceVintage: "2026",
      geometry,
      bbox: [2, 48, 3, 49],
      center: [2.5, 48.5],
      labelPoint: [2.5, 48.5],
      status: "validated",
      quality: "official",
    }],
  };
}

test("accepts a valid canonical dataset", () => {
  const result = validateDataset(createDataset());
  assert.equal(result.valid, true, JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.metrics, { administrativeZoneCount: 1, musicZoneCount: 1, sourceCount: 1 });
});

test("rejects duplicate IDs, missing sources and an outside label point", () => {
  const dataset = createDataset();
  dataset.musicZones[0].labelPoint = [4, 50];
  dataset.musicZones[0].sourceZoneIds = [createStableAdministrativeZoneId("missing")];
  dataset.musicZones.push({ ...dataset.musicZones[0] });
  const result = validateDataset(dataset);
  const codes = new Set(result.errors.map((entry) => entry.code));
  assert.equal(result.valid, false);
  assert.equal(codes.has("music.label_point.outside"), true);
  assert.equal(codes.has("dataset.music.source_missing"), true);
  assert.equal(codes.has("dataset.music.duplicate"), true);
});

test("published datasets cannot contain draft zones", () => {
  const dataset = createDataset();
  dataset.status = "published";
  dataset.publishedAt = "2026-07-13T00:00:00.000Z";
  dataset.musicZones[0].status = "draft";
  const result = validateDataset(dataset);
  assert.equal(result.errors.some((entry) => entry.code === "dataset.music.unpublished"), true);
});

test("rejects missing and cyclic administrative parents", () => {
  const missingParent = createDataset();
  missingParent.administrativeZones[0].parentId = "bfb93465-dbb4-5297-9fde-b38dc314eebe";
  assert.ok(validateDataset(missingParent).errors.some((entry) => entry.code === "dataset.administrative.parent_missing"));

  const cyclic = createDataset();
  const second = structuredClone(cyclic.administrativeZones[0]);
  second.id = "bfb93465-dbb4-5297-9fde-b38dc314eebe";
  cyclic.administrativeZones[0].parentId = second.id;
  second.parentId = cyclic.administrativeZones[0].id;
  cyclic.administrativeZones.push(second);
  assert.ok(validateDataset(cyclic).errors.some((entry) => entry.code === "dataset.administrative.parent_cycle"));
});
