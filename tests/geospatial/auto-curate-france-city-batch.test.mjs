import assert from "node:assert/strict";
import test from "node:test";

import {
  curatePlan,
  fold,
  getLabelRisks,
} from "../../scripts/auto-curate-france-city-batch.mjs";

function slugify(value) {
  return fold(value).replaceAll(" ", "_");
}

function makeCity(code, name, labels) {
  return {
    rank: Number(code.slice(-2)),
    id: slugify(name),
    name,
    communeCode: code,
    population: 1_000,
    mode: "standalone_split",
    classificationReason: "multiple_official_iris",
    eligibleForSplitCityWave: true,
    status: "pending_semantic_review",
    sourceFeatureCount: labels.length,
    distinctOfficialIrisCount: labels.length,
    sourceIris: labels.map((label, index) => ({
      id: `${code}${String(index + 1).padStart(4, "0")}`,
      label,
      type: "H",
    })),
    lexicalRisks: {
      technical: [],
      numbered: [],
      duplicates: [],
      operational: [],
      directional: [],
    },
  };
}

function makePlan(cities) {
  return {
    schemaVersion: 1,
    wave: 99,
    generatedAt: "2026-07-14T00:00:00.000Z",
    selection: { requestedCount: cities.length },
    source: { provider: "fixture" },
    totals: { cities: cities.length },
    deferredCandidates: [],
    cities,
  };
}

test("strict auto-curation accepts only unchanged, unique human exact-ID inventories", () => {
  const cities = [
    makeCity("99991", "Ville sûre", ["Les Tilleuls", "Saint-Roch"]),
    makeCity("99992", "Ville activités", ["Zone d’Activités du Moulin", "Les Prés"]),
    makeCity("99993", "Ville direction", ["Nord-Ouest", "Les Sources"]),
    makeCity("99994", "Ville numérotée", ["Bellevue 2", "Les Pins"]),
    makeCity("99995", "Ville doublon", ["Églantiers", "Eglantiers"]),
    makeCity("99996", "Ville générique", ["Centre Historique", "Les Vignes"]),
    makeCity("99997", "Ville équipement", ["Université", "Les Jardins"]),
  ];

  const { curation, safePlan, exceptions } = curatePlan(makePlan(cities), {
    inputPath: "fixture-plan.json",
    inputSha256: "fixture-sha",
    generatedAt: "2026-07-14T01:00:00.000Z",
  });

  assert.deepEqual(curation.cities.map((city) => city.id), ["ville_sure"]);
  assert.deepEqual(safePlan.cities.map((city) => city.id), ["ville_sure"]);
  assert.equal(curation.cities[0].status, "ready");
  assert.equal(curation.cities[0].guideAlphaRule.type, "none");
  assert.deepEqual(curation.cities[0].officialLabels, [
    { sourceId: "999910001", label: "Les Tilleuls", irisType: "H" },
    { sourceId: "999910002", label: "Saint-Roch", irisType: "H" },
  ]);
  assert.equal(safePlan.totals.cities, 1);
  assert.equal(safePlan.totals.officialIris, 2);
  assert.equal(safePlan.autoCuration.provenance.inputSha256, "fixture-sha");
  assert.equal(exceptions.cities.length, 6);

  const reasonsByCity = new Map(exceptions.cities.map((city) => [
    city.id,
    new Set(city.reasons.map((reason) => reason.code)),
  ]));
  assert.equal(reasonsByCity.get("ville_activites").has("operational_label"), true);
  assert.equal(reasonsByCity.get("ville_direction").has("direction_only_label"), true);
  assert.equal(reasonsByCity.get("ville_numerotee").has("numbered_label"), true);
  assert.equal(reasonsByCity.get("ville_doublon").has("duplicate_normalized_label"), true);
  assert.equal(reasonsByCity.get("ville_generique").has("generic_territorial_label"), true);
  assert.equal(reasonsByCity.get("ville_equipement").has("generic_facility_label"), true);
});

test("accent and apostrophe folding cannot hide operational wording", () => {
  assert.equal(fold("Zone Périurbaine d’Activités"), "zone periurbaine d activites");
  const riskCodes = new Set(getLabelRisks("Zone Périurbaine d’Activités", "Test", "123450001").map((risk) => risk.code));
  assert.equal(riskCodes.has("operational_label"), true);
  assert.equal(riskCodes.has("generic_territorial_label"), true);
});

test("limit keeps the safe plan and curation identical while recording uninspected cities", () => {
  const cities = [
    makeCity("99981", "Alpha", ["Les Pins", "Saint-Paul"]),
    makeCity("99982", "Bravo", ["Les Prés", "Bellevue"]),
    makeCity("99983", "Charlie", ["Les Sources", "Montjoie"]),
  ];
  const { curation, safePlan, exceptions } = curatePlan(makePlan(cities), { limit: 2 });

  assert.deepEqual(curation.cities.map((city) => city.code), safePlan.cities.map((city) => city.communeCode));
  assert.equal(curation.cities.length, 2);
  assert.equal(exceptions.cities.length, 0);
  assert.equal(exceptions.deferredCities.length, 1);
  assert.equal(exceptions.deferredCities[0].status, "not_inspected_due_to_limit");
});
