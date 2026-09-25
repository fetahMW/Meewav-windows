import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  convertExistingGroup,
  getLegacyZoneId,
  normalizeLegacyGeometry,
} from "../../scripts/geo/lib/migrate-existing.mjs";

test("normalizes legacy coordinate strings without changing polygon topology", () => {
  const geometry = normalizeLegacyGeometry({
    type: "MultiPolygon",
    coordinates: [[["2 48", "3 48", "3 49", "2 49", "2 48"]]],
  });
  assert.deepEqual(geometry, {
    type: "MultiPolygon",
    coordinates: [[[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]]],
  });
});

test("removes only degenerate components from a legacy multipolygon", () => {
  const corrections = [];
  const geometry = normalizeLegacyGeometry(
    {
      type: "MultiPolygon",
      coordinates: [
        [[[2, 48], [3, 48], [3, 49], [2, 49], [2, 48]]],
        [[[2, 48], [2, 48], [2, 48], [2, 48]]],
      ],
    },
    (code) => corrections.push(code),
  );
  assert.equal(geometry.coordinates.length, 1);
  assert.deepEqual(corrections, ["geometry.degenerate_polygon_removed"]);
});

test("reproduces the exact legacy Paris ID contract", () => {
  const feature = { properties: { c_ar: 20, l_qu: "Père-Lachaise & Réunion" } };
  assert.equal(getLegacyZoneId(feature, { id: "paris-districts" }), "paris_20e_pere_lachaise_et_reunion");
});

test("converts the real Trappes corpus with stable IDs and zero validation error", async () => {
  const first = await convertExistingGroup(process.cwd(), "trappes");
  const second = await convertExistingGroup(process.cwd(), "trappes");
  assert.equal(first.validation.valid, true, JSON.stringify(first.validation.errors, null, 2));
  assert.equal(first.dataset.musicZones.length, 12);
  assert.deepEqual(first.mapping, second.mapping);
  assert.equal(first.mapping.entries.every((entry) => !entry.stableZoneId.includes("trappes")), true);
});

test("preserves the Paris golden-master presentation as canonical data", async () => {
  const result = await convertExistingGroup(process.cwd(), "paris");
  const mapping = new Map(result.mapping.entries.map((entry) => [entry.legacyZoneId, entry.stableZoneId]));
  const byId = new Map(result.dataset.musicZones.map((zone) => [zone.zoneId, zone]));
  const charonne = byId.get(mapping.get("paris_20e_charonne"));
  const saintDenis = byId.get(mapping.get("grand_paris_commune_93066"));

  assert.deepEqual(charonne.presentation, {
    colorIndex: 7,
    groundColor: "#43277B",
    territoryType: "quartier",
    paletteFamily: "city",
    overviewVisible: true,
  });
  assert.equal(saintDenis.presentation.territoryType, "commune");
  assert.equal(saintDenis.presentation.paletteFamily, "metropolitan");
  assert.equal(saintDenis.presentation.overviewVisible, true);
});

test("normalizes every completed city with one converter", async () => {
  const [result, checkedInMapping, franceCityCatalog] = await Promise.all([
    convertExistingGroup(process.cwd(), "all"),
    readFile("geo/mappings/legacy-zone-ids/all.json", "utf8").then(JSON.parse),
    readFile("geo/catalog/france-city-iris.json", "utf8").then(JSON.parse),
  ]);
  const communeNames = new Set(result.dataset.musicZones.map((zone) => zone.communeName));

  assert.equal(result.validation.valid, true, JSON.stringify(result.validation.errors, null, 2));
  assert.equal(result.dataset.musicZones.length, result.mapping.entries.length);
  assert.equal(result.mapping.entries.length, checkedInMapping.entries.length);
  assert.ok(result.dataset.musicZones.length >= 6716, "the validated pre-wave corpus must not shrink");
  assert.equal(result.dataset.musicZones.every((zone) => zone.presentation?.groundColor), true);
  const expectedCityNames = [
    "Paris", "Trappes", "Nice", "Lyon", "Marseille", "Lille", "Nantes", "Montpellier",
    ...franceCityCatalog.cities.map((city) => city.name),
  ];
  expectedCityNames.forEach((city) => {
    assert.equal(communeNames.has(city), true, `${city} is missing from the canonical corpus`);
  });
});
