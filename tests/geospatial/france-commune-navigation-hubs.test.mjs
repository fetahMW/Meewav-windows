import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createFranceCommuneNavigationHubFeature,
  createFranceSearchResultFromCommuneNavigationHub,
  FranceCommuneNavigationHubIndex,
  padFranceCommuneNavigationBounds,
} from "../../src/features/globe/maplibre/franceCommuneNavigationHubs.ts";
import { FRANCE_REGION_CITY_CATALOG } from "../../src/features/globe/maplibre/franceRegionCityCatalog.ts";
import { FRANCE_COMMUNE_SUBDIVISION_BY_CODE } from "../../src/features/globe/geography/franceGuideAlphaCities.generated.ts";

const searchIndexPromise = readFile("public/search/france-communes-index.json", "utf8")
  .then(JSON.parse)
  .then((payload) => payload.results);

test("viewport navigation hubs expose Saint-Brice and a true single-plate neighbour", async () => {
  const results = await searchIndexPromise;
  const saintBrice = results.find((result) => result.id === "commune-95539");
  const leThillay = results.find((result) => result.id === "commune-95612");
  assert.ok(saintBrice);
  assert.ok(leThillay);

  const allowedIds = new Set([saintBrice.id, leThillay.id]);
  const index = new FranceCommuneNavigationHubIndex(results, { allowedIds });
  const collection = index.query([2.15, 48.9, 2.6, 49.15]);
  assert.equal(index.size, 2);
  assert.deepEqual(collection.features.map((feature) => feature.id).sort(), [
    "commune-95539",
    "commune-95612",
  ]);

  const saintBriceFeature = collection.features.find((feature) => feature.id === saintBrice.id);
  const leThillayFeature = collection.features.find((feature) => feature.id === leThillay.id);
  assert.deepEqual(saintBriceFeature.geometry.coordinates, [2.3453, 49.0034]);
  assert.deepEqual(leThillayFeature.geometry.coordinates, [2.4673, 49.003]);
  for (const feature of collection.features) {
    assert.equal(feature.geometry.type, "Point");
    assert.equal(feature.properties.navigationHub, true);
    assert.match(feature.properties.pointColor, /^#(?:72F5A7|A8FFCA|D8FFE8)$/u);
    assert.match(feature.properties.glowColor, /^#(?:16C965|24F982|33FF91)$/u);
    assert.ok(feature.properties.circleRadius >= 3.15);
  }
});

test("the dedicated navigation source covers all 34,746 metropolitan commune destinations exactly once", async () => {
  const [results, runtimeIndex] = await Promise.all([
    searchIndexPromise,
    readFile("public/map/france-single-plate/2026/runtime-index.json", "utf8").then(JSON.parse),
  ]);
  const allowedIds = new Set([
    ...Object.keys(runtimeIndex.communes).map((communeCode) => `commune-${communeCode}`),
    ...[...FRANCE_COMMUNE_SUBDIVISION_BY_CODE.keys()].map((communeCode) => `commune-${communeCode}`),
    ...FRANCE_REGION_CITY_CATALOG
      .map((city) => city.id)
      .filter((id) => /^commune-[0-9A-Z]{5}$/iu.test(id)),
  ]);
  const searchableCommuneIds = new Set(
    results
      .map((result) => result.id)
      .filter((id) => /^commune-[0-9A-Z]{5}$/iu.test(id)),
  );
  const historicalIds = new Set(
    FRANCE_REGION_CITY_CATALOG
      .map((city) => city.id)
      .filter((id) => searchableCommuneIds.has(id)),
  );
  const completeNavigationIds = new Set(
    [...allowedIds].filter((id) => searchableCommuneIds.has(id)),
  );
  const historicalSinglePlateIds = [...historicalIds].filter((id) => (
    Object.hasOwn(runtimeIndex.communes, id.slice("commune-".length))
  ));
  const index = new FranceCommuneNavigationHubIndex(results, { allowedIds });

  assert.equal(allowedIds.size, 34_748);
  assert.equal(historicalIds.size, 768);
  assert.equal(index.size, 34_746);
  assert.equal(completeNavigationIds.size, 34_746);
  assert.equal(historicalSinglePlateIds.length, 108);
  assert.ok(allowedIds.has("commune-95539"));
  assert.ok(allowedIds.has("commune-95612"));
  assert.equal(index.size, completeNavigationIds.size);
});

test("hub properties round-trip through the one-click France search flow", async () => {
  const results = await searchIndexPromise;
  for (const id of ["commune-95539", "commune-95612"]) {
    const sourceResult = results.find((result) => result.id === id);
    const feature = createFranceCommuneNavigationHubFeature(sourceResult);
    assert.ok(feature);
    const restoredResult = createFranceSearchResultFromCommuneNavigationHub(feature);
    assert.equal(restoredResult.id, sourceResult.id);
    assert.equal(restoredResult.label, sourceResult.label);
    assert.deepEqual(restoredResult.center, sourceResult.center);
    assert.equal(restoredResult.type, sourceResult.type);
  }
});

test("Saint-Brice routes to Guide Alpha while Le Thillay routes to the single-plate registry", async () => {
  const [inventory, runtimeIndex] = await Promise.all([
    readFile("geo/work/france-iris-national-inventory.json", "utf8").then(JSON.parse),
    readFile("public/map/france-single-plate/2026/runtime-index.json", "utf8").then(JSON.parse),
  ]);
  const saintBrice = inventory.communes.find((commune) => commune.communeCode === "95539");
  const leThillay = inventory.communes.find((commune) => commune.communeCode === "95612");
  assert.equal(saintBrice.mode, "standalone_split");
  assert.equal(saintBrice.distinctOfficialIrisCount, 7);
  assert.equal(leThillay.mode, "single_plate");
  assert.equal(Object.hasOwn(runtimeIndex.communes, "95539"), false);
  assert.equal(Number.isInteger(runtimeIndex.communes["95612"]), true);
});

test("the spatial index scans only requested cells and enforces navigation membership", async () => {
  const results = await searchIndexPromise;
  const navigableIds = new Set(["commune-95539", "commune-95612", "commune-13055"]);
  const index = new FranceCommuneNavigationHubIndex(results, { allowedIds: navigableIds });
  const parisNorth = index.query([2.15, 48.9, 2.6, 49.15]);
  assert.equal(parisNorth.features.length, 2);
  assert.ok(!parisNorth.features.some((feature) => feature.id === "commune-13055"));
  assert.equal(index.query([5.2, 43.1, 5.5, 43.4]).features[0]?.id, "commune-13055");

  const excluded = new FranceCommuneNavigationHubIndex(results, {
    allowedIds: navigableIds,
    excludedIds: new Set(["commune-95539"]),
  });
  assert.ok(!excluded.query([2.15, 48.9, 2.6, 49.15]).features.some((feature) => feature.id === "commune-95539"));
});

test("camera bounds are padded but capped to a viewport-sized navigation window", () => {
  const padded = padFranceCommuneNavigationBounds([2.2, 48.9, 2.5, 49.1], 0.5);
  [2.05, 48.8, 2.65, 49.2].forEach((expected, index) => {
    assert.ok(Math.abs(padded[index] - expected) < 1e-9);
  });
  const capped = padFranceCommuneNavigationBounds([-20, 30, 30, 60], 1);
  assert.ok(capped[2] - capped[0] <= 4.8 + 1e-9);
  assert.ok(capped[3] - capped[1] <= 3.6 + 1e-9);
});
