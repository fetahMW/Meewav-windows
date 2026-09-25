import assert from "node:assert/strict";
import test from "node:test";
import { createSearchIndex } from "../../scripts/geo/lib/build-search-index.mjs";
import { convertExistingGroup } from "../../scripts/geo/lib/migrate-existing.mjs";
import { searchNationalGeoRecords } from "../../src/features/globe/geography/nationalGeoSearch.ts";

test("builds and searches a city-agnostic geography index", async () => {
  const conversion = await convertExistingGroup(process.cwd(), "trappes");
  const records = createSearchIndex(conversion.dataset);
  const matches = searchNationalGeoRecords(records, "Centre Ouest", 5);

  assert.equal(records.length, 12);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].displayName, "Centre Ouest");
  assert.equal(matches[0].communeName, "Trappes");
  assert.match(matches[0].zoneId, /^[0-9a-f-]{36}$/);
  assert.equal(matches[0].cameraOverride, null);
});

test("publishes a data-driven camera override in the search index", async () => {
  const conversion = await convertExistingGroup(process.cwd(), "trappes");
  conversion.dataset.musicZones[0].cameraOverride = { zoom: 16, pitch: 57, bearing: -14 };
  const records = createSearchIndex(conversion.dataset);
  assert.deepEqual(records.find((record) => record.zoneId === conversion.dataset.musicZones[0].zoneId).cameraOverride, {
    zoom: 16,
    pitch: 57,
    bearing: -14,
  });
});

test("search normalization is accent and case insensitive", async () => {
  const conversion = await convertExistingGroup(process.cwd(), "trappes");
  const records = createSearchIndex(conversion.dataset);
  assert.equal(searchNationalGeoRecords(records, "MACÉ", 5)[0].displayName.includes("Macé"), true);
});
