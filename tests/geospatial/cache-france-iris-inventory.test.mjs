import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuideAlphaSplitPlan,
  getLexicalRisks,
  hasLexicalRisk,
} from "../../scripts/cache-france-iris-inventory.mjs";

test("national cache lexical preflight folds accents and apostrophes", () => {
  const risks = getLexicalRisks([
    "Zone d’Activités",
    "Zone Urbaine",
    "Zone Périurbaine",
    "Zone Rurale",
    "Économique",
    "Collectif",
    "Historique",
  ], "Ville Test");

  assert.deepEqual(risks.operational, [
    "Zone d’Activités",
    "Zone Urbaine",
    "Zone Périurbaine",
    "Zone Rurale",
    "Économique",
    "Collectif",
    "Historique",
  ]);
  assert.equal(hasLexicalRisk(risks), true);
});

test("national cache lexical preflight flags generic centres and directions", () => {
  const risks = getLexicalRisks([
    "Centre",
    "Centre-ville",
    "Nord",
    "Sud",
    "Est",
    "Ouest",
    "Nord-Ouest",
    "Sud-Est",
  ], "Ville Test");

  assert.equal(risks.directional.length, 8);
  assert.equal(hasLexicalRisk(risks), true);
});

test("national cache lexical preflight flags statistical names after normalization", () => {
  const risks = getLexicalRisks([
    "Évry-Courcouronnes 3 Bois Sauvage",
    "Quartier-12",
    "Les Fleurs 2",
  ], "Évry-Courcouronnes");

  assert.deepEqual(risks.technical, ["Évry-Courcouronnes 3 Bois Sauvage", "Quartier-12"]);
  assert.deepEqual(risks.numbered, ["Quartier-12", "Les Fleurs 2"]);
});

test("descriptive labels remain clean", () => {
  const risks = getLexicalRisks(["Belle-Beille", "La Roseraie", "Monplaisir"], "Angers");

  assert.equal(hasLexicalRisk(risks), false);
});

const cachedCommune = (overrides) => ({
  rank: 99,
  id: "ville-test",
  name: "Ville Test",
  featureId: "commune-12345",
  communeCode: "12345",
  population: 10_000,
  departmentCode: "12",
  departmentName: "Département Test",
  regionName: "Région Test",
  searchCenter: [1, 2],
  sourceFeatureCount: 2,
  distinctOfficialIrisCount: 2,
  mode: "standalone_split",
  classificationReason: "multiple_official_iris",
  eligibleForSplitCityWave: true,
  semanticStatus: "clean",
  sourceIris: [
    { id: "123450101", label: "Les Fleurs", type: "H" },
    { id: "123450102", label: "La Gare", type: "H" },
  ],
  lexicalRisks: { technical: [], numbered: [], duplicates: [], operational: [], directional: [] },
  ...overrides,
});

const inventoryCache = {
  inputFingerprint: "abc123",
  selection: {
    order: "population desc, French label asc, commune code asc",
    geographicScope: "metropolitan France and Corsica",
    coveredMetropolitanCommunesExcluded: 844,
  },
  source: { provider: "IGN", vintage: "2026" },
  summary: { communes: 3, singlePlate: 1, resolutionRequired: 0 },
  communes: [
    cachedCommune({}),
    cachedCommune({
      rank: 100,
      id: "ville-risque",
      name: "Ville Risque",
      featureId: "commune-12346",
      communeCode: "12346",
      semanticStatus: "semantic_risk",
      lexicalRisks: { technical: [], numbered: [], duplicates: [], operational: [], directional: ["Centre"] },
    }),
    cachedCommune({
      rank: 101,
      id: "village",
      name: "Village",
      featureId: "commune-12347",
      communeCode: "12347",
      sourceFeatureCount: 1,
      distinctOfficialIrisCount: 1,
      mode: "single_plate",
      classificationReason: "single_iris_type_z_and_code_0000",
      eligibleForSplitCityWave: false,
      sourceIris: [{ id: "123470000", label: "Village", type: "Z" }],
    }),
  ],
};

test("clean Guide Alpha plan keeps planner-compatible city structure and deterministic ranks", () => {
  const plan = createGuideAlphaSplitPlan(inventoryCache, {
    wave: 9,
    semanticStatus: "clean",
    generatedAt: "2026-06-14T09:12:07.922Z",
  });

  assert.equal(plan.wave, 9);
  assert.equal(plan.generatedAt, "2026-06-14T09:12:07.922Z");
  assert.equal(plan.totals.cities, 1);
  assert.equal(plan.totals.officialIris, 2);
  assert.equal(plan.totals.pendingSemanticReview, 1);
  assert.equal(plan.totals.semanticResolutionRequired, 0);
  assert.equal(plan.cities[0].rank, 1);
  assert.equal(plan.cities[0].status, "pending_semantic_review");
  assert.equal(plan.cities[0].semanticStatus, undefined);
  assert.equal(plan.cities[0].communeCode, "12345");
  assert.equal(plan.selection.sourceCacheFingerprint, "abc123");
  assert.equal(plan.selection.scannedCandidateCount, 2);
  assert.equal(plan.selection.deferredOtherSemanticSubsetCount, 1);
  assert.equal(plan.selection.nationalInventoryContext.singlePlate, 1);
});

test("risk Guide Alpha plan contains only split semantic risks", () => {
  const plan = createGuideAlphaSplitPlan(inventoryCache, {
    wave: 9,
    semanticStatus: "semantic_risk",
    generatedAt: "2026-06-14T09:12:07.922Z",
  });

  assert.equal(plan.totals.cities, 1);
  assert.equal(plan.totals.semanticResolutionRequired, 1);
  assert.equal(plan.totals.pendingSemanticReview, 0);
  assert.equal(plan.cities[0].id, "ville-risque");
  assert.equal(plan.cities[0].status, "resolution_required");
  assert.equal(plan.cities.some((city) => city.id === "village"), false);
});

test("Guide Alpha plan rejects an invalid semantic subset", () => {
  assert.throws(
    () => createGuideAlphaSplitPlan(inventoryCache, { wave: 9, semanticStatus: "unknown" }),
    /Unsupported Guide Alpha semantic subset/,
  );
});

test("Guide Alpha plans resolve homonymous city ids consistently across semantic subsets", () => {
  const homonymousCache = {
    ...inventoryCache,
    summary: { communes: 2, singlePlate: 0, resolutionRequired: 0 },
    communes: [
      cachedCommune({ id: "marly", name: "Marly", communeCode: "57147" }),
      cachedCommune({
        id: "marly",
        name: "Marly",
        communeCode: "59383",
        semanticStatus: "semantic_risk",
      }),
    ],
  };
  const cleanPlan = createGuideAlphaSplitPlan(homonymousCache, {
    wave: 9,
    semanticStatus: "clean",
  });
  const riskPlan = createGuideAlphaSplitPlan(homonymousCache, {
    wave: 9,
    semanticStatus: "semantic_risk",
  });

  assert.equal(cleanPlan.cities[0].id, "marly_57147");
  assert.equal(riskPlan.cities[0].id, "marly_59383");
});
