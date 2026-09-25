import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  existingOutputIsUsable,
  indexCachedIrisFeatures,
  validateCachedInventory,
} from "../../scripts/generate-france-city-batch-from-wfs-cache.mjs";

const feature = (communeCode, irisCode, label = "Human Place") => ({
  type: "Feature",
  properties: { code_insee: communeCode, code_iris: irisCode, nom_iris: label },
  geometry: {
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  },
});

async function withCache(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "meewav-wfs-cache-batch-"));
  try {
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("indexes only requested official IRIS and deduplicates identical cached pages", async () => {
  await withCache(async (directory) => {
    const requested = feature("12345", "123450101");
    await writeFile(path.join(directory, "a.json"), JSON.stringify({
      type: "FeatureCollection",
      features: [requested, feature("99999", "999990101")],
    }));
    await writeFile(path.join(directory, "b.json"), JSON.stringify({
      type: "FeatureCollection",
      features: [requested, { type: "Feature", properties: { code_insee: "12345" }, geometry: null }],
    }));
    const result = await indexCachedIrisFeatures(directory, new Set(["12345"]));
    assert.equal(result.inspectedFiles, 2);
    assert.equal(result.irisCacheFiles, 2);
    assert.deepEqual([...result.featuresByCommune.get("12345")], [["123450101", requested]]);
  });
});

test("rejects conflicting copies of one exact official IRIS", async () => {
  await withCache(async (directory) => {
    await writeFile(path.join(directory, "a.json"), JSON.stringify({
      type: "FeatureCollection",
      features: [feature("12345", "123450101", "First")],
    }));
    await writeFile(path.join(directory, "b.json"), JSON.stringify({
      type: "FeatureCollection",
      features: [feature("12345", "123450101", "Second")],
    }));
    await assert.rejects(
      indexCachedIrisFeatures(directory, new Set(["12345"])),
      /conflicting copies of IRIS 123450101/u,
    );
  });
});

test("requires the cache to match the plan's exact IDs, labels and types", () => {
  const city = {
    id: "ville_test",
    communeCode: "12345",
    sourceFeatureCount: 2,
    sourceIris: [
      { id: "123450101", label: "Les Fleurs", type: "H" },
      { id: "123450102", label: "La Gare", type: "A" },
    ],
  };
  const exact = new Map([
    ["123450101", feature("12345", "123450101", "Les Fleurs")],
    ["123450102", feature("12345", "123450102", "La Gare")],
  ]);
  exact.get("123450101").properties.type_iris = "H";
  exact.get("123450102").properties.type_iris = "A";
  assert.equal(validateCachedInventory(city, exact).valid, true);

  const wrongId = new Map(exact);
  wrongId.delete("123450102");
  wrongId.set("123450103", feature("12345", "123450103", "La Gare"));
  assert.equal(validateCachedInventory(city, wrongId).valid, false);

  const wrongLabel = new Map(exact);
  wrongLabel.set("123450102", feature("12345", "123450102", "Autre nom"));
  wrongLabel.get("123450102").properties.type_iris = "A";
  assert.match(validateCachedInventory(city, wrongLabel).detail, /label drift/u);

  const wrongType = new Map(exact);
  wrongType.set("123450102", feature("12345", "123450102", "La Gare"));
  wrongType.get("123450102").properties.type_iris = "H";
  assert.match(validateCachedInventory(city, wrongType).detail, /type drift/u);
});

test("resume accepts only a complete output covering every exact source once", async () => {
  await withCache(async (root) => {
    const outputPath = "ville-test-quartiers.geojson";
    const catalogCity = {
      communeCode: "12345",
      outputPath,
      expectedOutputFeatureCount: 1,
    };
    const plannedCity = {
      id: "ville_test",
      communeCode: "12345",
      sourceFeatureCount: 2,
      sourceIris: [
        { id: "123450101", label: "Les Fleurs", type: "H" },
        { id: "123450102", label: "La Gare", type: "H" },
      ],
    };
    const collection = {
      type: "FeatureCollection",
      metadata: {
        communeCode: "12345",
        featureCount: 1,
        sourceFeatureCount: 2,
      },
      features: [{
        type: "Feature",
        properties: { sourceIrisIds: ["123450101", "123450102"] },
        geometry: null,
      }],
    };
    await writeFile(path.join(root, outputPath), JSON.stringify(collection));
    assert.equal(await existingOutputIsUsable(root, catalogCity, plannedCity), true);

    collection.features[0].properties.sourceIrisIds = ["123450101", "123450101"];
    await writeFile(path.join(root, outputPath), JSON.stringify(collection));
    assert.equal(await existingOutputIsUsable(root, catalogCity, plannedCity), false);

    collection.features[0].properties.sourceIrisIds = ["123450101", "123450102"];
    collection.metadata.sourceFeatureCount = 1;
    await writeFile(path.join(root, outputPath), JSON.stringify(collection));
    assert.equal(await existingOutputIsUsable(root, catalogCity, plannedCity), false);
  });
});
