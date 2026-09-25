import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { pointInGeometry, pointInGeometryInterior } from "../../scripts/geo/lib/geometry.mjs";
import { createCityIrisCollection } from "../../scripts/geo/lib/generate-city-iris.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const [cityCatalog, curationCatalog] = await Promise.all([
  readFile(path.join(rootDirectory, "geo", "catalog", "france-city-iris.json"), "utf8").then(JSON.parse),
  readFile(path.join(rootDirectory, "geo", "catalog", "france-city-curation.json"), "utf8").then(JSON.parse),
]);
const curationByCityId = new Map(curationCatalog.cities.map((city) => [city.cityId, city]));
const expectedVisibleFeatureCount = (city) => (
  curationByCityId.get(city.id)?.expectedFeatureCount
  ?? city.expectedOutputFeatureCount
  ?? city.humanZoneGrouping?.expectedFeatureCount
  ?? city.expectedFeatureCount
);
const cityOutputPath = (city) => path.resolve(rootDirectory, city.outputPath);

for (const city of cityCatalog.cities) {
  test(`${city.id} official human-zone output satisfies the Guide Alpha data contract`, async () => {
    const collection = JSON.parse(await readFile(cityOutputPath(city), "utf8"));
    const expectedCount = expectedVisibleFeatureCount(city);
    const curation = curationByCityId.get(city.id);
    assert.equal(collection.type, "FeatureCollection");
    assert.equal(collection.metadata.communeCode, city.communeCode);
    assert.equal(collection.metadata.featureCount, expectedCount);
    assert.equal(
      collection.metadata.sourceFeatureCount ?? collection.metadata.featureCount,
      city.expectedFeatureCount,
    );
    assert.equal(collection.features.length, expectedCount);
    assert.equal(new Set(collection.features.map((feature) => feature.id)).size, expectedCount);
    assert.equal(new Set(collection.features.map((feature) => feature.properties.label)).size, expectedCount);
    if (curation) {
      assert.equal(collection.metadata.curationStatus, curation.status);
      assert.equal(collection.metadata.curationRevision, curation.revision);
    }

    for (const feature of collection.features) {
      const properties = feature.properties;
      assert.equal(feature.id, properties.zoneId);
      assert.match(feature.id, new RegExp(`^${city.id}_(?:${city.communeCode}\\d{4}|${city.communeCode}_group)_[a-z0-9_]+$`));
      assert.equal(properties.communeCode, city.communeCode);
      assert.ok(properties.territoryType === "iris" || properties.territoryType === "quartier");
      if (properties.territoryType === "quartier") {
        assert.ok(Array.isArray(properties.sourceIrisIds) && properties.sourceIrisIds.length > 1);
        assert.ok(Array.isArray(properties.sourceIrisLabels) && properties.sourceIrisLabels.length > 1);
        assert.match(properties.groupingRule, /^(?:shared-|curated-)/);
      }
      assert.equal(properties.parentZoneId, `${city.id}_parent_${city.communeCode}_${city.id}`);
      assert.ok(Number.isFinite(properties.officialAreaM2) && properties.officialAreaM2 > 0);
      assert.ok(pointInGeometryInterior(
        [properties.labelLng, properties.labelLat],
        feature.geometry,
      ));
    }
  });
}

test("Fleury-les-Aubrais published label points are strictly inside their geometries", async () => {
  const city = cityCatalog.cities.find((candidate) => candidate.id === "fleury_les_aubrais");
  assert.ok(city, "Fleury-les-Aubrais must remain in the official city catalog");
  const collection = JSON.parse(await readFile(cityOutputPath(city), "utf8"));

  for (const feature of collection.features) {
    const labelPoint = [feature.properties.labelLng, feature.properties.labelLat];
    assert.equal(
      pointInGeometryInterior(labelPoint, feature.geometry),
      true,
      `${feature.id} label point must not lie on or outside its boundary`,
    );
    assert.equal(
      booleanPointInPolygon(point(labelPoint), feature, { ignoreBoundary: true }),
      true,
      `${feature.id} label point must pass the independent strict GeoJSON check`,
    );
  }
});

test("unreviewed numbered statistical cells never leak into visible human quartier labels", async () => {
  for (const city of cityCatalog.cities) {
    const collection = JSON.parse(await readFile(cityOutputPath(city), "utf8"));
    const labels = collection.features.map((feature) => String(feature.properties?.label ?? ""));
    const unreviewedLabels = collection.features
      .filter((feature) => !feature.properties?.semanticLabelReviewed)
      .map((feature) => String(feature.properties?.label ?? ""));
    assert.equal(new Set(labels).size, labels.length, `${city.id} contains duplicate visible labels`);
    assert.deepEqual(
      unreviewedLabels.filter((label) => /\p{L}[\s-]*\d+$/u.test(label)),
      [],
      `${city.id} contains a residual numbered statistical label`,
    );
    const numberedFamilies = new Map();
    for (const label of unreviewedLabels) {
      const match = label.match(/^(.*?\p{L})(?:[\s-]*)\d+$/u);
      if (!match?.[1]) continue;
      const baseLabel = match[1].trim();
      numberedFamilies.set(baseLabel, [...(numberedFamilies.get(baseLabel) ?? []), label]);
    }
    assert.deepEqual(
      [...numberedFamilies.values()].filter((family) => family.length > 1),
      [],
      `${city.id} contains a numbered statistical label family`,
    );
  }
});

test("IRIS normalization is deterministic independently of source order", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 2,
  };
  const makeFeature = (code, label, offset) => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: code,
      iris: code.slice(-4),
      nom_iris: label,
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[offset, 45], [offset + 0.01, 45], [offset + 0.01, 45.01], [offset, 45.01], [offset, 45]]],
    },
  });
  const features = [
    makeFeature("999990102", "Deuxième", 2.02),
    makeFeature("999990101", "Première", 2),
  ];
  const options = { generatedAt: "2026-07-14T00:00:00.000Z", sourceUrl: "https://example.test/wfs?query=1" };
  const first = createCityIrisCollection({ type: "FeatureCollection", features }, city, source, options);
  const second = createCityIrisCollection({ type: "FeatureCollection", features: [...features].reverse() }, city, source, options);
  assert.deepEqual(first, second);
  assert.deepEqual(first.features.map((feature) => feature.id), [
    "testville_999990101_premiere",
    "testville_999990102_deuxieme",
  ]);
});

test("IRIS generation replaces a concave boundary fallback with a strictly interior label point", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 1,
  };
  const collection = createCityIrisCollection({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        code_insee: "99999",
        nom_commune: "Testville",
        code_iris: "999990101",
        iris: "0101",
        nom_iris: "Concave",
        type_iris: "H",
      },
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[
          [0, 0],
          [4, 0],
          [4, 4],
          [3, 4],
          [3, 1],
          [1, 1],
          [1, 4],
          [0, 4],
          [0, 0],
        ]]],
      },
    }],
  }, city, source, { generatedAt: "2026-07-14T00:00:00.000Z" });

  const feature = collection.features[0];
  const labelPoint = [feature.properties.labelLng, feature.properties.labelLat];
  assert.deepEqual(labelPoint, [0.5, 2]);
  assert.equal(pointInGeometry(labelPoint, feature.geometry), true);
  assert.equal(pointInGeometryInterior(labelPoint, feature.geometry), true);
});

test("human grouping deterministically dissolves adjacent numbered IRIS", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 3,
    humanZoneGrouping: {
      stripTrailingNumber: true,
      expectedFeatureCount: 2,
    },
  };
  const makeFeature = (code, label, offset) => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: code,
      iris: code.slice(-4),
      nom_iris: label,
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[offset, 45], [offset + 0.01, 45], [offset + 0.01, 45.01], [offset, 45.01], [offset, 45]]],
    },
  });
  const features = [
    makeFeature("999990101", "Centre 1", 2),
    makeFeature("999990102", "Centre 2", 2.01),
    makeFeature("999990201", "Gare", 2.03),
  ];
  const collection = createCityIrisCollection(
    { type: "FeatureCollection", features: [...features].reverse() },
    city,
    source,
    { generatedAt: "2026-07-14T00:00:00.000Z" },
  );
  assert.equal(collection.metadata.sourceFeatureCount, 3);
  assert.deepEqual(collection.features.map((feature) => feature.properties.label), ["Centre", "Gare"]);
  assert.equal(collection.features[0].properties.sourceZoneCount, 2);
  assert.equal(collection.features[0].properties.territoryType, "quartier");
});

test("resolved semantic curation applies exact rename, merge and acceptance decisions", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 4,
    humanZoneCuration: {
      status: "resolved",
      revision: 1,
      expectedFeatureCount: 3,
      sources: [{
        id: "official-local-evidence",
        provider: "Official local authority",
        datasetUrl: "https://example.test/local-places",
      }],
      operations: [
        {
          id: "rename-technical-place",
          type: "rename",
          sourceId: "999990101",
          expectedLabel: "2002",
          label: "Les 2002",
          evidenceRefs: ["official-local-evidence"],
          rationale: "The number is the source spelling of a named housing estate.",
        },
        {
          id: "merge-centre",
          type: "merge",
          sourceIds: ["999990201", "999990202"],
          expectedLabels: ["Centre 1", "Centre 2"],
          label: "Centre",
          outputId: "testville_99999_group_centre",
          evidenceRefs: ["official-local-evidence"],
          rationale: "Both exact statistical cells form the same named district.",
        },
        {
          id: "accept-historic-number",
          type: "accept",
          sourceId: "999990301",
          expectedLabel: "Saint-Jacques 2 et 3",
          evidenceRefs: ["official-local-evidence"],
          rationale: "The numbers are part of the established place name, not a trailing statistical family.",
        },
      ],
    },
  };
  const makeFeature = (code, label, offset) => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: code,
      iris: code.slice(-4),
      nom_iris: label,
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[offset, 45], [offset + 0.01, 45], [offset + 0.01, 45.01], [offset, 45.01], [offset, 45]]],
    },
  });
  const payload = {
    type: "FeatureCollection",
    features: [
      makeFeature("999990301", "Saint-Jacques 2 et 3", 2.04),
      makeFeature("999990202", "Centre 2", 2.02),
      makeFeature("999990101", "2002", 2),
      makeFeature("999990201", "Centre 1", 2.01),
    ],
  };
  const collection = createCityIrisCollection(payload, city, source, { generatedAt: "2026-07-14T00:00:00.000Z" });

  assert.deepEqual(collection.features.map((feature) => feature.properties.label), [
    "Les 2002",
    "Centre",
    "Saint-Jacques 2 et 3",
  ]);
  assert.equal(collection.metadata.curationStatus, "resolved");
  assert.equal(collection.metadata.curationRevision, 1);
  assert.equal(collection.metadata.sourceCorrections.length, 3);
  assert.deepEqual(collection.features[1].properties.sourceIrisIds, ["999990201", "999990202"]);
  assert.equal(collection.features[2].properties.semanticLabelAccepted, true);
  assert.throws(() => createCityIrisCollection(payload, {
    ...city,
    humanZoneCuration: {
      ...city.humanZoneCuration,
      operations: city.humanZoneCuration.operations.map((operation) => (
        operation.type === "merge" ? { ...operation, label: "Ouest" } : operation
      )),
    },
  }, source), /must resolve the technical label Ouest to a human place name/);
});

test("semantic curation refuses stale labels and unknown evidence", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const makeFeature = () => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: "999990101",
      iris: "0101",
      nom_iris: "2002",
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[2, 45], [2.01, 45], [2.01, 45.01], [2, 45.01], [2, 45]]],
    },
  });
  const baseCity = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 1,
  };
  const sources = [{ id: "official-local-evidence", provider: "Authority", datasetUrl: "https://example.test/evidence" }];
  const operation = {
    id: "rename-technical-place",
    type: "rename",
    sourceId: "999990101",
    expectedLabel: "stale label",
    label: "Les 2002",
    evidenceRefs: ["official-local-evidence"],
    rationale: "Exact local place resolution.",
  };
  assert.throws(() => createCityIrisCollection(
    { type: "FeatureCollection", features: [makeFeature()] },
    { ...baseCity, humanZoneCuration: { status: "resolved", revision: 1, expectedFeatureCount: 1, sources, operations: [operation] } },
    source,
  ), /expected 999990101 label stale label, received 2002/);
  assert.throws(() => createCityIrisCollection(
    { type: "FeatureCollection", features: [makeFeature()] },
    {
      ...baseCity,
      humanZoneCuration: {
        status: "resolved",
        revision: 1,
        expectedFeatureCount: 1,
        sources,
        operations: [{ ...operation, expectedLabel: "2002", evidenceRefs: ["missing-source"] }],
      },
    },
    source,
  ), /references unknown evidence source missing-source/);
});

test("Guide Alpha rejects numbered statistical families unless their geometries are explicitly grouped", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 2,
  };
  const makeFeature = (code, label, offset) => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: code,
      iris: code.slice(-4),
      nom_iris: label,
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[offset, 45], [offset + 0.01, 45], [offset + 0.01, 45.01], [offset, 45.01], [offset, 45]]],
    },
  });
  const payload = {
    type: "FeatureCollection",
    features: [
      makeFeature("999990101", "Centre 1", 2),
      makeFeature("999990102", "Centre 2", 2.01),
    ],
  };

  assert.throws(
    () => createCityIrisCollection(payload, city, source),
    /numbered statistical families that require geometry grouping/,
  );
});

test("Guide Alpha rejects city-prefixed statistical numbers even when followed by a direction", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 1,
  };
  const payload = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {
        code_insee: "99999",
        nom_commune: "Testville",
        code_iris: "999990101",
        iris: "0101",
        nom_iris: "Testville 1 Nord-Ouest",
        type_iris: "H",
      },
      geometry: {
        type: "Polygon",
        coordinates: [[[2, 45], [2.01, 45], [2.01, 45.01], [2, 45.01], [2, 45]]],
      },
    }],
  };

  assert.throws(
    () => createCityIrisCollection(payload, city, source),
    /technical labels without a human place name: Testville 1 Nord-Ouest/,
  );
});

test("Guide Alpha also rejects a glued numeric suffix left behind after grouping", () => {
  const source = {
    provider: "Official source",
    datasetUrl: "https://example.test/dataset",
    wfsUrl: "https://example.test/wfs",
    typeName: "official:iris",
    vintage: "2026",
    license: "Open Licence",
  };
  const city = {
    id: "testville",
    name: "Testville",
    communeCode: "99999",
    expectedFeatureCount: 3,
    humanZoneGrouping: {
      stripTrailingNumber: true,
      expectedFeatureCount: 2,
    },
  };
  const makeFeature = (code, label, offset) => ({
    type: "Feature",
    properties: {
      code_insee: "99999",
      nom_commune: "Testville",
      code_iris: code,
      iris: code.slice(-4),
      nom_iris: label,
      type_iris: "H",
    },
    geometry: {
      type: "Polygon",
      coordinates: [[[offset, 45], [offset + 0.01, 45], [offset + 0.01, 45.01], [offset, 45.01], [offset, 45]]],
    },
  });
  const payload = {
    type: "FeatureCollection",
    features: [
      makeFeature("999990101", "Centre 1", 2),
      makeFeature("999990102", "Centre 2", 2.01),
      makeFeature("999990103", "Centre3", 2.02),
    ],
  };

  assert.throws(
    () => createCityIrisCollection(payload, city, source),
    /residual numbered statistical labels after geometry grouping: Centre3/,
  );
});

test("Guide Alpha documents mandatory semantic recovery and the shared single-plate batch", async () => {
  const [readme, contracts, checklist, singlePlateGuide] = await Promise.all([
    readFile(path.join(rootDirectory, "src", "features", "globe", "guide-alpha", "README.md"), "utf8"),
    readFile(path.join(rootDirectory, "src", "features", "globe", "guide-alpha", "CONTRATS-DONNEES.md"), "utf8"),
    readFile(path.join(rootDirectory, "src", "features", "globe", "guide-alpha", "CHECKLIST.md"), "utf8"),
    readFile(path.join(rootDirectory, "src", "features", "globe", "guide-alpha", "COMMUNES-MONO-PLAQUE.md"), "utf8"),
  ]);

  assert.match(readme, /IRIS officiel n'est pas automatiquement un quartier produit/);
  assert.match(readme, /Nom 1`, `Nom 2/);
  assert.match(contracts, /sourceIrisIds/);
  assert.match(contracts, /sans fusionner sa geometrie/);
  assert.match(checklist, /familles `Nom 1`, `Nom 2`, `Nom 3`/);
  assert.match(checklist, /nom humain unique/);
  assert.match(readme, /ne permet jamais de l'abandonner, de la remplacer/);
  assert.match(readme, /Boucle de resolution semantique obligatoire/);
  assert.match(contracts, /quarantaine temporaire et resolvable/);
  assert.match(checklist, /aucune ville n'a ete remplacee ou abandonnee/);
  assert.match(singlePlateGuide, /une seule execution reproductible/);
  assert.match(singlePlateGuide, /ne doit creer ni un script, ni un controleur, ni des listeners MapLibre par commune/);
  assert.match(singlePlateGuide, /type_iris === "Z"/);
  assert.match(singlePlateGuide, /code_iris` se termine par `0000`/);
  assert.match(singlePlateGuide, /capacite projetee.*ne participent jamais a cette decision/);
  assert.match(contracts, /eligibleForSplitCityWave.*uniquement pour `standalone_split`/);
  assert.match(checklist, /Population, superficie et capacite projetee ne changent jamais le mode/iu);
  assert.match(checklist, /Lot national des communes a plaque unique/);
});

test("all semantic quarantines are resolved by exact source IDs", async () => {
  assert.equal(curationCatalog.schemaVersion, 1);
  const catalogCityIds = new Set(cityCatalog.cities.map((city) => city.id));
  const resolvedCityIds = new Set(curationCatalog.cities.map((city) => city.cityId));
  assert.equal(resolvedCityIds.size, curationCatalog.cities.length, "duplicate city in semantic curation catalog");
  assert.equal(
    [...resolvedCityIds].every((cityId) => catalogCityIds.has(cityId)),
    true,
    "semantic curation references a city outside france-city-iris.json",
  );
  const sourceIds = new Set(curationCatalog.sources.map((source) => source.id));
  const operationIds = new Set();
  for (const city of curationCatalog.cities) {
    assert.equal(city.status, "resolved");
    assert.ok(Number.isInteger(city.revision) && city.revision > 0);
    assert.ok(Number.isInteger(city.expectedFeatureCount) && city.expectedFeatureCount > 0);
    assert.ok(city.sourceRefs.length > 0 && city.sourceRefs.every((sourceRef) => sourceIds.has(sourceRef)));
    for (const operation of city.operations) {
      assert.equal(operationIds.has(operation.id), false, `duplicate curation operation ${operation.id}`);
      operationIds.add(operation.id);
      assert.ok(["accept", "rename", "merge"].includes(operation.type));
      assert.ok(operation.rationale);
      assert.ok(operation.evidenceRefs.length > 0);
      assert.equal(operation.evidenceRefs.every((sourceRef) => city.sourceRefs.includes(sourceRef)), true);
      const exactSourceIds = operation.type === "merge" ? operation.sourceIds : [operation.sourceId];
      // Corsican official IRIS IDs embed the alphanumeric INSEE department
      // codes 2A/2B, while metropolitan IDs elsewhere remain numeric.
      assert.equal(exactSourceIds.every((sourceId) => /^[0-9A-Z]{9}$/.test(sourceId)), true);
    }
  }
  assert.ok(operationIds.size >= 38);
});
