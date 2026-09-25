import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalDistrictCollection } from "../../scripts/geo/lib/import-local-districts.mjs";

const configuration = {
  id: "test-local-districts",
  title: "Test districts",
  datasetUrl: "https://example.test/dataset",
  sourceUrl: "https://example.test/districts.geojson",
  sourceProvider: "Official test portal",
  sourceVintage: "2026",
  sourceUpdatedAt: "2026-01-01",
  generatedAt: "2026-07-13T00:00:00.000Z",
  license: "Open",
  communeCode: "12345",
  communeName: "Testville",
  sourceCommuneValue: "TESTVILLE",
  zoneIdPrefix: "testville",
  expectedFeatureCount: 2,
  propertyMap: { label: "name", parentLabel: "parent", communeName: "commune" },
};

function square(west, south, east, north) {
  return {
    type: "Polygon",
    coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
  };
}

test("imports a local official source with stable data-only identifiers", () => {
  const source = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Zone B", parent: "Nord", commune: "TESTVILLE" }, geometry: square(2.1, 48, 2.2, 48.1) },
      { type: "Feature", properties: { name: "Zone À", parent: "Centre", commune: "TESTVILLE" }, geometry: square(2, 48, 2.1, 48.1) },
      { type: "Feature", properties: { name: "Outside", parent: "Autre", commune: "OTHER" }, geometry: square(3, 49, 3.1, 49.1) },
    ],
  };
  const first = createLocalDistrictCollection(source, configuration);
  const second = createLocalDistrictCollection(source, configuration);
  assert.deepEqual(first, second);
  assert.deepEqual(first.features.map((feature) => feature.id), ["testville_centre_zone_a", "testville_nord_zone_b"]);
  assert.equal(first.features.every((feature) => feature.properties.runtimeMode === "national"), true);
  assert.equal(first.features.every((feature) => feature.properties.labelLng && feature.properties.labelLat), true);
});

test("the Montpellier test corpus contains 31 official subdistricts", async () => {
  const collection = JSON.parse(await readFile("public/map/montpellier-quartiers.geojson", "utf8"));
  assert.equal(collection.features.length, 31);
  assert.equal(new Set(collection.features.map((feature) => feature.id)).size, 31);
  assert.equal(collection.features.every((feature) => feature.properties.communeCode === "34172"), true);
  assert.equal(collection.metadata.runtimeMode, "national");
});
