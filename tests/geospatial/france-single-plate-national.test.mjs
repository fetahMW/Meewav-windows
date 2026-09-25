import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import {
  buildSinglePlateDepartmentProduct,
  buildSinglePlateManifest,
  buildSinglePlateRuntimeIndex,
  canonicalizePolygonGeometry,
  collectExistingCommuneOwnership,
  computeSinglePlateCamera,
  assertFastOfficialGeometry,
  ringHasSelfIntersectionFast,
  selectEligibleSinglePlateCommunes,
  validateSinglePlatePublication,
} from "../../scripts/geo/generate-france-single-plate-national.mjs";
import {
  computeFranceSinglePlateRuntimeCamera,
  FranceSinglePlateRegistry,
  resolveFranceSinglePlateSearchSelection,
} from "../../src/features/globe/geography/franceSinglePlateRegistry.ts";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = {
  provider: "IGN / INSEE test",
  datasetUrl: "https://example.test/iris",
  wfsUrl: "https://example.test/wfs",
  typeName: "test:iris",
  vintage: "2026",
  license: "Licence Ouverte 2.0",
};

function inventoryCommune({ code, name, departmentCode, irisCode }) {
  return {
    id: name.toLocaleLowerCase("fr"),
    name,
    communeCode: code,
    departmentCode,
    mode: "single_plate",
    classificationReason: "single_iris_type_z_and_code_0000",
    sourceIris: [{ id: irisCode, label: name, type: "Z" }],
  };
}

function sourceFeature({ code, name, irisCode, geometry }) {
  return {
    type: "Feature",
    properties: {
      code_insee: code,
      nom_commune: name,
      code_iris: irisCode,
      nom_iris: name,
      iris: "0000",
      type_iris: "Z",
    },
    geometry,
  };
}

const square = {
  type: "Polygon",
  coordinates: [[[1, 45], [1.1, 45], [1.1, 45.1], [1, 45.1], [1, 45]]],
};
const concaveMultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [[[2, 46], [2.2, 46], [2.2, 46.05], [2.05, 46.05], [2.05, 46.2], [2, 46.2], [2, 46]]],
    [[[2.3, 46.3], [2.32, 46.3], [2.32, 46.32], [2.3, 46.32], [2.3, 46.3]]],
  ],
};

function buildFixture() {
  const communes = [
    inventoryCommune({ code: "01001", name: "Alpha", departmentCode: "01", irisCode: "010010000" }),
    inventoryCommune({ code: "01002", name: "Bêta", departmentCode: "01", irisCode: "010020000" }),
  ];
  const payload = {
    type: "FeatureCollection",
    features: [
      sourceFeature({ code: "01002", name: "Bêta", irisCode: "010020000", geometry: concaveMultiPolygon }),
      sourceFeature({ code: "01001", name: "Alpha", irisCode: "010010000", geometry: square }),
    ],
  };
  const product = buildSinglePlateDepartmentProduct({
    departmentCode: "01",
    communes,
    payload,
    source,
    inputFingerprint: "fixture-fingerprint",
    outputUrl: "/map/france-single-plate/2026/01.geojson",
  });
  const inventory = {
    inputFingerprint: "fixture-fingerprint",
    source,
    summary: { singlePlate: 2 },
    communes,
  };
  const manifest = buildSinglePlateManifest({
    inventory,
    source,
    products: [product],
    outputDirectoryUrl: "/map/france-single-plate/2026",
  });
  const runtimeIndex = buildSinglePlateRuntimeIndex({
    manifest,
    outputDirectoryUrl: "/map/france-single-plate/2026",
  });
  return { communes, payload, product, inventory, manifest, runtimeIndex };
}

test("single-plate eligibility is exhaustive and rejects existing ownership", () => {
  const { inventory, communes } = buildFixture();
  assert.deepEqual(
    selectEligibleSinglePlateCommunes(inventory).map((commune) => commune.communeCode),
    ["01001", "01002"],
  );

  const ownership = collectExistingCommuneOwnership(
    { cities: [{ id: "alpha", communeCode: "01001" }] },
    { datasets: [] },
  );
  assert.throws(
    () => selectEligibleSinglePlateCommunes(inventory, ownership),
    /01001 Alpha is already owned/u,
  );
  assert.equal(communes.length, 2);

  const codeOnly = {
    ...communes[0],
    classificationReason: "single_iris_code_0000",
    sourceIris: [{ ...communes[0].sourceIris[0], type: "" }],
  };
  assert.equal(selectEligibleSinglePlateCommunes({
    summary: { singlePlate: 1 },
    communes: [codeOnly],
  })[0].communeCode, "01001");
});

test("national cache exposes exactly 32,762 unowned single-plate communes", async () => {
  const [inventory, cityCatalog, existingDatasets] = await Promise.all([
    readFile(path.join(rootDirectory, "geo/work/france-iris-national-inventory.json"), "utf8").then(JSON.parse),
    readFile(path.join(rootDirectory, "geo/catalog/france-city-iris.json"), "utf8").then(JSON.parse),
    readFile(path.join(rootDirectory, "geo/catalog/existing-datasets.json"), "utf8").then(JSON.parse),
  ]);
  const loadedCollections = new Map();
  for (const dataset of existingDatasets.datasets) {
    if (dataset.role !== "communes" || !dataset.inputPath || loadedCollections.has(dataset.inputPath)) continue;
    loadedCollections.set(
      dataset.inputPath,
      JSON.parse(await readFile(path.join(rootDirectory, dataset.inputPath), "utf8")),
    );
  }
  const ownership = collectExistingCommuneOwnership(
    cityCatalog,
    existingDatasets,
    loadedCollections,
  );
  const eligible = selectEligibleSinglePlateCommunes(inventory, ownership);
  assert.equal(eligible.length, 32_762);
  assert.equal(new Set(eligible.map((commune) => commune.communeCode)).size, 32_762);
  assert.equal(new Set(eligible.map((commune) => commune.departmentCode)).size, 92);
});

test("department fragments are deterministic and publish strict interior points", () => {
  const { communes, payload, product, inventory, manifest } = buildFixture();
  const reversed = buildSinglePlateDepartmentProduct({
    departmentCode: "01",
    communes: [...communes].reverse(),
    payload: { ...payload, features: [...payload.features].reverse() },
    source,
    inputFingerprint: "fixture-fingerprint",
    outputUrl: "/map/france-single-plate/2026/01.geojson",
  });
  assert.equal(reversed.serialized, product.serialized);
  assert.equal(reversed.sha256, product.sha256);
  assert.deepEqual(
    product.collection.features.map((feature) => feature.id),
    ["commune_01001", "commune_01002"],
  );

  for (const feature of product.collection.features) {
    const labelPoint = [feature.properties.labelLng, feature.properties.labelLat];
    assert.equal(
      booleanPointInPolygon(point(labelPoint), feature, { ignoreBoundary: true }),
      true,
      `${feature.id} label point must be strictly interior`,
    );
    assert.equal(feature.id, feature.properties.zoneId);
    assert.equal(feature.properties.communeCode, feature.properties.districtCode);
    assert.equal(feature.properties.territoryType, "commune");
  }

  assert.deepEqual(validateSinglePlatePublication(
    manifest,
    [product],
    inventory.communes.map((commune) => commune.communeCode),
  ), {
    communeCount: 2,
    fragmentCount: 1,
    uniqueFeatureIdCount: 2,
  });
});

test("geometry canonicalization is stable across ring start, direction and multipolygon order", () => {
  const first = canonicalizePolygonGeometry({
    type: "MultiPolygon",
    coordinates: [
      [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
      [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]],
    ],
  });
  const second = canonicalizePolygonGeometry({
    type: "MultiPolygon",
    coordinates: [
      [[[2, 2], [2, 1], [1, 1], [1, 2], [2, 2]]],
      [[[6, 6], [6, 5], [5, 5], [5, 6], [6, 6]]],
    ],
  });
  assert.deepEqual(first, second);
});

test("camera framing uses the complete bbox, including remote multipolygon parts", () => {
  const camera = computeSinglePlateCamera([2, 46, 2.32, 46.32]);
  assert.deepEqual(camera.center, [2.16, 46.16]);
  assert.deepEqual(camera.bbox, [2, 46, 2.32, 46.32]);
  assert.ok(camera.zoom >= 8.5 && camera.zoom <= 15.2);
  assert.equal(camera.pitch, 60);
});

test("runtime commune landing derives a tight zoom from the real geographic extent", () => {
  const compact = computeFranceSinglePlateRuntimeCamera([2.3, 48.8, 2.312, 48.809]);
  const extended = computeFranceSinglePlateRuntimeCamera([2.1, 48.7, 2.42, 49.02]);
  const estreesSaintDenis = computeFranceSinglePlateRuntimeCamera([
    2.599264,
    49.409083,
    2.661639,
    49.442977,
  ]);

  assert.deepEqual(compact.center, [2.306, 48.8045]);
  assert.deepEqual(extended.center, [2.26, 48.86]);
  assert.ok(compact.zoom > extended.zoom, "a smaller commune must land closer than a larger one");
  assert.equal(compact.zoom, 16.2, "a compact commune must fill most of the viewport on landing");
  assert.equal(extended.zoom, 11.05, "a broad commune must keep a proportional but close landing");
  assert.equal(estreesSaintDenis.zoom, 14, "the reviewed Estrées-Saint-Denis landing must match the close framing reference");
  assert.ok(extended.zoom < 12, "a broad commune must remain entirely framed");
  assert.deepEqual(compact.bbox, [2.3, 48.8, 2.312, 48.809]);
  assert.deepEqual(extended.bbox, [2.1, 48.7, 2.42, 49.02]);
  assert.equal(compact.pitch, 60);
  assert.equal(compact.bearing, 0);
});

test("the scalable geometry guard rejects a self-intersecting official ring", () => {
  assert.throws(() => assertFastOfficialGeometry({
    type: "Polygon",
    coordinates: [[[0, 0], [3, 3], [0, 3], [2, 0], [0, 0]]],
  }, "bowtie"), /self-intersects/u);
});

test("the geometry guard remains linear enough for a large commune boundary", () => {
  const vertexCount = 5_000;
  const ring = Array.from({ length: vertexCount }, (_, index) => {
    const angle = index / vertexCount * Math.PI * 2;
    return [2 + Math.cos(angle), 46 + Math.sin(angle)];
  });
  ring.push(ring[0]);
  const startedAt = performance.now();
  assert.equal(ringHasSelfIntersectionFast(ring), false);
  assert.ok(performance.now() - startedAt < 1_000);
});

test("lazy registry returns one active feature and retains at most one department fragment", async () => {
  const { product, runtimeIndex } = buildFixture();
  const requests = [];
  const fetcher = async (input) => {
    const url = String(input);
    requests.push(url);
    const payload = url.endsWith("runtime-index.json") ? runtimeIndex : product.collection;
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const registry = new FranceSinglePlateRegistry({
    runtimeIndexUrl: "/fixture/runtime-index.json",
    fetcher,
  });
  const first = await registry.loadActiveCollection("01001");
  const second = await registry.loadActiveCollection("01002");
  assert.equal(first?.features.length, 1);
  assert.equal(first?.features[0].id, "commune_01001");
  assert.equal(second?.features.length, 1);
  assert.equal(second?.features[0].id, "commune_01002");
  assert.deepEqual(requests, [
    "/fixture/runtime-index.json",
    "/map/france-single-plate/2026/01.geojson",
  ]);
});

test("direct commune search resolves the plaque and premium fly on the first selection", async () => {
  const { product, manifest, runtimeIndex } = buildFixture();
  const registry = new FranceSinglePlateRegistry({
    runtimeIndexUrl: "/fixture/runtime-index.json",
    fetcher: async (input) => new Response(JSON.stringify(
      String(input).endsWith("runtime-index.json") ? runtimeIndex : product.collection,
    ), { status: 200 }),
  });
  const selection = await resolveFranceSinglePlateSearchSelection({
    id: "commune-01002",
    label: "Bêta",
    subtitle: "Ain",
    type: "commune",
    center: [0, 0],
  }, registry);
  assert.equal(selection?.collection.features.length, 1);
  assert.equal(selection?.eventDetail.zoneId, "commune_01002");
  assert.equal(selection?.eventDetail.communeCode, "01002");
  assert.equal(selection?.eventDetail.runtimeMode, "single_plate");
  assert.deepEqual(selection?.flyTarget.center, manifest.communes["01002"].camera.center);
  assert.equal(selection?.flyTarget.name, "commune_01002");
});

test("GlobeMap uses one data-driven single-plate branch and no per-commune listener", async () => {
  const sourceText = await readFile(
    path.join(rootDirectory, "src/features/globe/components/GlobeMapV2.tsx"),
    "utf8",
  );
  assert.match(sourceText, /resolveFranceSinglePlateSearchSelection\(result\)/u);
  assert.match(sourceText, /publishFranceSinglePlateSearchSelection\(singlePlateSelection\)/u);
  assert.doesNotMatch(sourceText, /addEventListener\([^\n]*single-plate/iu);

  const layerSource = await readFile(
    path.join(rootDirectory, "src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts"),
    "utf8",
  );
  assert.match(layerSource, /singlePlateOutlineState[^\n]*runtimeMode[^\n]*single_plate/u);
  assert.match(layerSource, /strongOutlineState[^\n]*selectedState[^\n]*singlePlateOutlineState/u);
  assert.doesNotMatch(layerSource, /activeSinglePlateOutlineState/u);
  assert.match(
    layerSource,
    /selectedZoneOutlineOpacityHoverOnlyExpression[\s\S]*?singlePlateOutlineState[\s\S]*?0\.98[\s\S]*?hoverUnselectedState/u,
  );
  assert.match(
    layerSource,
    /selectedZoneOutlineWidthHoverOnlyExpression[\s\S]*?singlePlateOutlineState[\s\S]*?selectedZoneOutlineBlurExpression/u,
  );
  assert.match(
    layerSource,
    /selectedZoneOutlineBlurHoverOnlyExpression[\s\S]*?singlePlateOutlineState[\s\S]*?0\.18/u,
  );
  assert.match(
    layerSource,
    /selectedZoneOutlineOpacityExpression[\s\S]*?strongOutlineState[\s\S]*?0\.98/u,
  );
});

test("single-plate landings keep a low-zoom local road network above the active plaque", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile(path.join(rootDirectory, "src/features/globe/components/GlobeMapV2.tsx"), "utf8"),
    readFile(path.join(rootDirectory, "src/features/globe/maplibre/meewavMapLibreStyle.ts"), "utf8"),
  ]);

  const localRoadLayerStart = styleSource.indexOf('id: "roads_local_lowzoom"');
  const localRoadLayerEnd = styleSource.indexOf('id: "roads_neighborhood_lowzoom"', localRoadLayerStart);
  assert.notEqual(localRoadLayerStart, -1);
  assert.notEqual(localRoadLayerEnd, -1);
  const localRoadLayer = styleSource.slice(localRoadLayerStart, localRoadLayerEnd);
  assert.match(localRoadLayer, /minzoom:\s*11\.5/u);
  assert.match(localRoadLayer, /\["tertiary"\]/u);
  assert.doesNotMatch(localRoadLayer, /"track"|"path"|"minor"|"service"/u);
  assert.match(localRoadLayer, /11\.5,\s*0\.9,\s*13,\s*1\.45/u);
  assert.match(localRoadLayer, /visibility:\s*"none"/u);

  const neighborhoodRoadLayerStart = styleSource.indexOf('id: "roads_neighborhood_lowzoom"');
  const neighborhoodRoadLayerEnd = styleSource.indexOf('id: "roads_local_casing"', neighborhoodRoadLayerStart);
  assert.notEqual(neighborhoodRoadLayerStart, -1);
  assert.notEqual(neighborhoodRoadLayerEnd, -1);
  const neighborhoodRoadLayer = styleSource.slice(neighborhoodRoadLayerStart, neighborhoodRoadLayerEnd);
  assert.match(neighborhoodRoadLayer, /minzoom:\s*13\.5/u);
  assert.match(neighborhoodRoadLayer, /"minor",\s*"service",\s*"residential"/u);
  assert.doesNotMatch(neighborhoodRoadLayer, /"track"|"path"/u);

  assert.match(componentSource, /const ROAD_LAYER_IDS = \[[\s\S]*?"roads_local_lowzoom"/u);
  assert.doesNotMatch(componentSource, /ROAD_DETAIL_LAYER_IDS|reduceRoadDetails/u);
  assert.match(componentSource, /resolveCityOverviewTransportPolicy\(\{[\s\S]*?selectedZoneRuntimeMode/u);
  assert.match(
    componentSource,
    /addEventListener\("meewav:selected-zone-extrusion-change",\s*scheduleApplyVisibility\)/u,
  );
  assert.match(componentSource, /CITY_OVERVIEW_TRANSPORT_CAMERA_EVENTS[\s\S]*?mapInstance\.on\(eventName,\s*scheduleApplyVisibility\)/u);
  assert.doesNotMatch(componentSource, /mapInstance\.on\("move",\s*scheduleApplyVisibility\)/u);
  assert.match(componentSource, /handleStyleLoad[\s\S]*?cityOverviewTransportState\.delete\(mapInstance\)/u);
  assert.match(styleSource, /roads_major_lowzoom[\s\S]*?maxzoom:\s*ROADS_POST_AVATAR_REVEAL_END_ZOOM/u);
});

test("pending single-plate lookups are invalidated by competing navigation and component cleanup", async () => {
  const sourceText = await readFile(
    path.join(rootDirectory, "src/features/globe/components/GlobeMapV2.tsx"),
    "utf8",
  );
  const componentConst = (name) => {
    const marker = `  const ${name} = `;
    const start = sourceText.indexOf(marker);
    assert.notEqual(start, -1, `${name} entry point must exist`);
    const end = sourceText.indexOf("\n  const ", start + marker.length);
    return sourceText.slice(start, end === -1 ? sourceText.length : end);
  };

  for (const entryPoint of [
    "goToCity",
    "goToHostPosition",
    "goToCityOverview",
    "goToCountryOverview",
    "goToGlobeOverview",
    "focusAvatarSearchResult",
  ]) {
    assert.match(
      componentConst(entryPoint),
      /invalidatePendingCommuneSubdivisionEntry\(\);/u,
      `${entryPoint} must invalidate an older asynchronous commune selection`,
    );
  }

  const franceSelection = componentConst("selectFranceSearchResult");
  assert.match(franceSelection, /const subdivisionEntryToken = \+\+communeSubdivisionEntryTokenRef\.current;/u);
  assert.ok(
    franceSelection.indexOf("suppressLocalToGlobeAutoExit();")
      < franceSelection.indexOf("resolveFranceSinglePlateSearchSelection(result)"),
    "auto-exit suppression must begin before the asynchronous lookup",
  );
  assert.match(
    sourceText,
    /useEffect\(\(\) => \(\) => \{[\s\S]*?communeSubdivisionEntryTokenRef\.current \+= 1;[\s\S]*?\}, \[\]\);/u,
    "component cleanup must invalidate an in-flight lookup",
  );
});

test("checked-in national publication covers every cached eligible commune", async (context) => {
  const outputDirectory = path.join(rootDirectory, "public/map/france-single-plate/2026");
  let inventory;
  let manifest;
  let runtimeIndexContents;
  let outputNames;
  try {
    [inventory, manifest, runtimeIndexContents, outputNames] = await Promise.all([
      readFile(path.join(rootDirectory, "geo/work/france-iris-national-inventory.json"), "utf8").then(JSON.parse),
      readFile(path.join(outputDirectory, "manifest.json"), "utf8").then(JSON.parse),
      readFile(path.join(outputDirectory, "runtime-index.json"), "utf8"),
      readdir(outputDirectory),
    ]);
  } catch (error) {
    if (error?.code === "ENOENT") {
      context.skip("Run the sequential national generator to materialize the checked-in publication");
      return;
    }
    throw error;
  }
  const eligibleCodes = inventory.communes
    .filter((commune) => commune.mode === "single_plate")
    .map((commune) => commune.communeCode)
    .sort();
  const manifestCodes = Object.keys(manifest.communes).sort();
  const parseStartedAt = performance.now();
  const runtimeIndex = JSON.parse(runtimeIndexContents);
  const runtimeIndexParseDuration = performance.now() - parseStartedAt;
  const runtimeCodes = Object.keys(runtimeIndex.communes).sort();
  assert.equal(manifest.summary.communeCount, 32_762);
  assert.deepEqual(manifestCodes, eligibleCodes);
  assert.deepEqual(runtimeCodes, eligibleCodes);
  assert.equal(new Set(manifestCodes).size, 32_762);
  assert.equal(Buffer.byteLength(runtimeIndexContents), runtimeIndexContents.length);
  assert.ok(Buffer.byteLength(runtimeIndexContents) < 1_048_576, "runtime index must stay below 1 MiB raw");
  assert.ok(runtimeIndexParseDuration < 250, "runtime index must parse inside the startup budget");
  assert.equal(runtimeIndex.kind, "france_single_plate_runtime_index");
  assert.equal(runtimeIndex.summary.lookup, "commune_code_to_feature_index_o1");
  assert.equal(manifest.summary.activeCollectionFeatureCount, 1);
  assert.equal(runtimeIndex.summary.activeCollectionFeatureCount, 1);
  assert.equal(
    Object.values(manifest.summary.classificationReasons).reduce((sum, count) => sum + count, 0),
    32_762,
  );
  assert.equal(
    outputNames.filter((name) => name.endsWith(".geojson")).length,
    manifest.summary.fragmentCount,
  );

  const featureIds = new Set();
  let publishedFeatureCount = 0;
  for (const [departmentCode, fragmentAudit] of Object.entries(manifest.fragments)) {
    const fragmentBuffer = await readFile(path.join(outputDirectory, `${departmentCode}.geojson`));
    assert.equal(fragmentBuffer.byteLength, fragmentAudit.byteLength);
    assert.equal(createHash("sha256").update(fragmentBuffer).digest("hex"), fragmentAudit.sha256);
    const fragment = JSON.parse(fragmentBuffer);
    assert.equal(fragment.features.length, fragmentAudit.featureCount);
    for (const [featureIndex, feature] of fragment.features.entries()) {
      const code = feature.properties.communeCode;
      const auditEntry = manifest.communes[code];
      assert.equal(runtimeIndex.communes[code], featureIndex);
      assert.equal(auditEntry.featureIndex, featureIndex);
      assert.equal(auditEntry.featureId, feature.id);
      assert.equal(auditEntry.departmentCode, departmentCode);
      assert.equal(auditEntry.fragmentUrl, fragmentAudit.url);
      assert.equal(feature.id, `commune_${code}`);
      assert.equal(feature.properties.zoneId, feature.id);
      assert.equal(feature.properties.districtCode, code);
      assert.equal(feature.properties.runtimeMode, "single_plate");
      assert.equal(featureIds.has(feature.id), false);
      featureIds.add(feature.id);
      publishedFeatureCount += 1;
    }
  }
  assert.equal(publishedFeatureCount, 32_762);
  assert.equal(featureIds.size, 32_762);

  const startedAt = performance.now();
  let checksum = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const code of runtimeCodes) checksum += runtimeIndex.communes[code];
  }
  assert.ok(Number.isFinite(checksum));
  assert.ok(performance.now() - startedAt < 1_000, "O(1) registry lookup should remain inexpensive");
});
