import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importTypeScriptModule(filePath) {
  const source = await readFile(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const policyPath = "src/features/globe/maplibre/stableGeographicLabelPolicy.ts";

test("resolves exactly one geographic label authority at every France zoom tier", async () => {
  const policy = await importTypeScriptModule(policyPath);

  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 8, hasRegionHubFocus: false }), "openfreemap");
  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 8, hasRegionHubFocus: true }), "region-hubs");
  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 11.449, hasRegionHubFocus: false }), "openfreemap");
  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 11.45, hasRegionHubFocus: false }), "national-communes");
  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 12.2, hasRegionHubFocus: true }), "national-communes");
  assert.equal(policy.resolveFranceGeographicLabelAuthority({ zoom: 13.45, hasRegionHubFocus: true }), "local-product");

  assert.equal(policy.shouldShowOpenFreeMapPlaceLabels({ zoom: 8, hasRegionHubFocus: false }), true);
  assert.equal(policy.shouldShowOpenFreeMapPlaceLabels({ zoom: 8, hasRegionHubFocus: true }), false);
  assert.equal(policy.shouldShowOpenFreeMapPlaceLabels({ zoom: 12.2, hasRegionHubFocus: false }), false);
});

test("never refreshes a stable label source for rotate or idle", async () => {
  const policy = await importTypeScriptModule(policyPath);
  const camera = { center: [2.3522, 48.8566], zoom: 12.2 };

  assert.equal(policy.shouldRefreshStableLabelSource(camera, camera, "rotateend"), false);
  assert.equal(policy.shouldRefreshStableLabelSource(camera, camera, "idle"), false);
  assert.equal(policy.shouldRefreshStableLabelSource(camera, camera, "moveend"), false);
  assert.equal(policy.shouldRefreshStableLabelSource(camera, { ...camera, center: [2.36, 48.8566] }, "moveend"), true);
  assert.equal(policy.shouldRefreshStableLabelSource(camera, { ...camera, zoom: 12.4 }, "zoomend"), true);
  assert.equal(policy.shouldRefreshStableLabelSource(camera, camera, "style.load"), true);
});

test("uses a fixed point anchor and deterministic pre-decluttering instead of MapLibre collision placement", async () => {
  const policy = await importTypeScriptModule(policyPath);
  const layout = policy.createStablePointLabelLayout({ anchor: "left" });
  assert.equal(layout["symbol-placement"], "point");
  assert.equal(layout["text-anchor"], "left");
  assert.equal(layout["text-allow-overlap"], true);
  assert.equal(layout["text-ignore-placement"], true);
  assert.equal("text-variable-anchor" in layout, false);

  const features = [
    { id: "local", geometry: { type: "Point", coordinates: [2.3522, 48.8566] }, properties: { importance: 10, pointLevel: "local" } },
    { id: "major", geometry: { type: "Point", coordinates: [2.3523, 48.8567] }, properties: { importance: 90, pointLevel: "major" } },
    { id: "far", geometry: { type: "Point", coordinates: [2.42, 48.88] }, properties: { importance: 20, pointLevel: "secondary" } },
  ];
  const selected = [...policy.selectStablePointLabelIds(features, 12.2, 120)].sort();
  const reversed = [...policy.selectStablePointLabelIds([...features].reverse(), 12.2, 120)].sort();
  assert.deepEqual(selected, reversed);
  assert.deepEqual(selected, ["far", "major"]);
});

test("removes every official or semantic Paris duplicate from the product label authority", async () => {
  const policy = await importTypeScriptModule(policyPath);
  assert.deepEqual(
    [...policy.PARIS_PRODUCT_LABEL_IDS_OWNED_BY_OFFICIAL_ZONES].sort(),
    [
      "auteuil", "batignolles", "belleville", "bercy", "champs-elysees", "charonne",
      "grenelle", "invalides", "la-villette", "les-halles", "madeleine", "maison-blanche",
      "monceau", "montparnasse", "palais-royal", "picpus", "plaisance", "saint-germain",
      "saint-lambert", "ternes",
    ],
  );
});

test("wires the static style and runtime to the stable-label contract", async () => {
  const [styleSource, componentSource, selectedLayerSource] = await Promise.all([
    readFile("src/features/globe/maplibre/meewavMapLibreStyle.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionLayers.ts", "utf8"),
  ]);

  assert.doesNotMatch(styleSource, /text-variable-anchor/);
  assert.match(styleSource, /PARIS_PRODUCT_LABEL_IDS_OWNED_BY_OFFICIAL_ZONES\.has\(id\)/);
  assert.match(styleSource, /id:\s*"labels_cities"[\s\S]{0,220}maxzoom:\s*FRANCE_REGIONAL_LABEL_MAX_ZOOM/);
  assert.match(componentSource, /shouldShowOpenFreeMapPlaceLabels\(\{[\s\S]{0,180}hasRegionHubFocus:[\s\S]{0,120}zoom:/);
  assert.match(componentSource, /selectStablePointLabelIds\(visibleCandidates, zoom\)/);
  assert.match(componentSource, /shouldRefreshStableLabelSource\(/);

  const effectStart = componentSource.indexOf("const syncVisibleCommuneNavigationHubs = (");
  const effectEnd = componentSource.indexOf("}, [franceCommuneNavigationHubIndex, mapInstance]);", effectStart);
  const effectSource = componentSource.slice(effectStart, effectEnd);
  assert.ok(effectStart >= 0 && effectEnd > effectStart, "stable nationwide label effect must remain explicit");
  assert.doesNotMatch(effectSource, /\.on\("rotateend"/);
  assert.doesNotMatch(effectSource, /\.on\("idle"/);
  assert.doesNotMatch(effectSource, /mapInstance\.project\(/);
  assert.match(selectedLayerSource, /SELECTED_ZONE_LABEL_LAYER_ID[\s\S]{0,650}createStablePointLabelLayout/);
  assert.match(
    await readFile("src/features/globe/selectedExtrusion/selectedZoneExtrusionController.ts", "utf8"),
    /selectStablePointLabelIds\(features, zoom, 100\)/,
  );
});
