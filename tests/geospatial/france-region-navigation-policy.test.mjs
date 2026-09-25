import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  shouldReleaseFranceRegionFocus,
  shouldResolveAutomaticFranceRegionCityHubs,
  shouldReturnLocalViewToFranceRegion,
} from "../../src/features/globe/maplibre/franceRegionNavigationPolicy.ts";

const baseInput = {
  focusedRegionId: null,
  minZoom: 6.85,
  nationwideCommuneMinZoom: 11.45,
  zoom: 8.46,
};

test("Paris returns to the same regional fly-point mode as every other city", async () => {
  const [componentSource, styleSource] = await Promise.all([
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/maplibre/meewavMapLibreStyle.ts", "utf8"),
  ]);

  assert.match(styleSource, /PARIS_LOCAL_MOSAIC_MIN_ZOOM\s*=\s*11\.45/);
  for (const layerId of [
    "grand-paris-commune-fill",
    "grand-paris-commune-outline",
    "paris-overview-boundary-halo",
    "paris-overview-boundary-line",
  ]) {
    const layer = styleSource.match(new RegExp(`id: "${layerId}"[\\s\\S]{0,180}`))?.[0] ?? "";
    assert.match(layer, /minzoom:\s*PARIS_LOCAL_MOSAIC_MIN_ZOOM/, `${layerId} must stay in the local tier`);
  }

  const regionalReturn = componentSource.match(
    /const maybeReturnToRegionalNavigation = \(\) => \{[\s\S]+?\n\s*};\n\n\s*const scheduleRegionalReturn/,
  )?.[0] ?? "";
  assert.match(regionalReturn, /cityHubMode:\s*"region"/);
  assert.match(regionalReturn, /clearSelectedZoneFromUi\(\)/);
  assert.doesNotMatch(regionalReturn, /restoreCitySubdivisions/);
  assert.doesNotMatch(componentSource, /shouldUseParisMosaicCityHubMode/);
});

test("fly points, including Paris, are removed wherever a visible mosaic already covers the map", async () => {
  const componentSource = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const coverageTargets = componentSource.match(
    /const FRANCE_NAVIGATION_HUB_MOSAIC_COVERAGE_TARGETS = \[[\s\S]+?\] as const;/,
  )?.[0] ?? "";

  assert.match(coverageTargets, /GRAND_PARIS_OVERVIEW_SOURCE_ID/);
  assert.match(coverageTargets, /SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID/);
  assert.match(componentSource, /function getFranceRegionCityHubOverlayModeForCamera[\s\S]{0,220}return "region"/);
});

test("regional city hubs depend on camera tier, not the navigation path", () => {
  for (const view of ["country", "city", "position"]) {
    assert.equal(
      shouldResolveAutomaticFranceRegionCityHubs({ ...baseInput, view }),
      true,
      `${view} must expose the same regional navigation tier`,
    );
  }

  assert.equal(
    shouldResolveAutomaticFranceRegionCityHubs({ ...baseInput, view: "globe" }),
    false,
  );
  assert.equal(
    shouldResolveAutomaticFranceRegionCityHubs({ ...baseInput, view: "city", zoom: 11.45 }),
    false,
    "nationwide commune hubs take over without an overlap",
  );
  assert.equal(
    shouldResolveAutomaticFranceRegionCityHubs({
      ...baseInput,
      focusedRegionId: "provence-alpes-cote-d-azur",
      view: "city",
    }),
    false,
    "an explicit region focus remains authoritative",
  );
});

test("the five PACA camera stages form one deterministic altitude ladder", () => {
  const stages = [
    { name: "clicked region", view: "country", zoom: 7.06, focusedRegionId: "paca", auto: false, returns: false },
    { name: "manual country zoom", view: "country", zoom: 9.14, focusedRegionId: null, auto: true, returns: false },
    { name: "city landing", view: "city", zoom: 11.53, focusedRegionId: null, auto: false, returns: false },
    { name: "city dezoom crosses regional tier", view: "city", zoom: 8.46, focusedRegionId: null, auto: true, returns: true },
    { name: "regional context after handoff", view: "country", zoom: 8.35, focusedRegionId: "paca", auto: false, returns: false },
  ];

  for (const stage of stages) {
    assert.equal(shouldResolveAutomaticFranceRegionCityHubs({
      ...baseInput,
      focusedRegionId: stage.focusedRegionId,
      view: stage.view,
      zoom: stage.zoom,
    }), stage.auto, `${stage.name}: regional hub tier`);
    assert.equal(shouldReturnLocalViewToFranceRegion({
      isParisMetroCityCamera: false,
      regionalHandoffZoom: 11.45,
      view: stage.view,
      zoom: stage.zoom,
    }), stage.returns, `${stage.name}: local-to-region handoff`);
  }

  assert.equal(shouldReturnLocalViewToFranceRegion({
    isParisMetroCityCamera: true,
    regionalHandoffZoom: 11.45,
    view: "city",
    zoom: 10.5,
  }), true, "Paris returns to the same regional fly-point tier");
});

test("a focused region is released in place below the regional country tier", async () => {
  const input = {
    focusedRegionId: "bourgogne-franche-comte",
    regionalTierMinZoom: 6.85,
    view: "country",
    zoom: 5.84,
  };

  assert.equal(shouldReleaseFranceRegionFocus(input), true);
  assert.equal(shouldReleaseFranceRegionFocus({ ...input, zoom: 6.81 }), false);
  assert.equal(shouldReleaseFranceRegionFocus({ ...input, focusedRegionId: null }), false);
  assert.equal(shouldReleaseFranceRegionFocus({ ...input, view: "globe", zoom: 4.35 }), false);
  assert.equal(shouldReleaseFranceRegionFocus({ ...input, view: "city" }), false);

  const source = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const releaseEffect = source.match(
    /const releaseCountryFocusAboveRegionalAltitude = \(\) => \{[\s\S]+?\n\s*};\n\s*const scheduleFocusRelease/,
  )?.[0] ?? "";
  assert.match(releaseEffect, /skipNextCountryOverviewFlyRef\.current = true/);
  assert.match(releaseEffect, /applyFranceRegionFocus\(mapInstance, null\)/);
  assert.doesNotMatch(releaseEffect, /flyMapTo|jumpTo|easeTo/);
});

test("region plates fade through the regional hub handoff instead of disappearing at z8.4", async () => {
  const source = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");

  assert.match(source, /FRANCE_REGION_PLATE_DISPLAY_MAX_ZOOM\s*=\s*9\.25/);
  assert.match(source, /FRANCE_REGION_PLATE_FADE_START_ZOOM\s*=\s*8\.05/);
  assert.match(source, /"fill-extrusion-opacity":\s*\[[\s\S]{0,500}FRANCE_REGION_PLATE_FADE_END_ZOOM[\s\S]{0,100}\]/);
  assert.match(
    source,
    /maybeReturnToRegionalNavigation[\s\S]{0,500}localToGlobeAutoExitSuppressedUntilRef\.current/,
    "a programmatic city landing must not be mistaken for a manual regional dezoom",
  );
});

test("mosaic coverage avoids GPU render reads and never scans at neighbourhood zoom", async () => {
  const source = await readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8");
  const coverageFactory = source.match(
    /function createFranceNavigationHubMosaicCoverageTest\([\s\S]+?\n}\n\nfunction refreshFranceNavigationHubMosaicCoverage/,
  )?.[0] ?? "";
  const visibleHubSync = source.match(
    /const syncVisibleCommuneNavigationHubs = \([^)]*\) => \{[\s\S]+?\n\s*};\n\s*const scheduleSyncVisibleCommuneNavigationHubs/,
  )?.[0] ?? "";

  assert.equal((coverageFactory.match(/queryRenderedFeatures/g) ?? []).length, 0);
  assert.match(coverageFactory, /querySourceFeatures/);
  assert.match(coverageFactory, /coverageGeometries/);
  assert.match(coverageFactory, /zoom < Number\(layer\.minzoom\)/);
  assert.match(coverageFactory, /zoom >= Number\(layer\.maxzoom\)/);
  assert.match(visibleHubSync, /zoom < FRANCE_NATIONWIDE_COMMUNE_LAYER_MAX_ZOOM/);
  assert.match(visibleHubSync, /coverageCandidates/);
  assert.doesNotMatch(visibleHubSync, /handleMosaicSourceData/);
});
