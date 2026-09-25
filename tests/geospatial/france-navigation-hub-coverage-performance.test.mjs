import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const globeMapUrl = new URL(
  "../../src/features/globe/components/GlobeMapV2.tsx",
  import.meta.url,
);

test("navigation-hub mosaic coverage never performs one rendered-feature GPU readback per hub", async () => {
  const source = await readFile(globeMapUrl, "utf8");
  const start = source.indexOf("function createFranceNavigationHubMosaicCoverageTest");
  const end = source.indexOf("function refreshFranceNavigationHubMosaicCoverage", start);

  assert.ok(start >= 0 && end > start, "coverage implementation must remain explicit and auditable");
  const implementation = source.slice(start, end);

  assert.doesNotMatch(
    implementation,
    /queryRenderedFeatures\s*\(/u,
    "coverage must not synchronously read the GPU for every navigation hub",
  );
  assert.match(
    implementation,
    /querySourceFeatures\(sourceId\)/u,
    "coverage should read each visible mosaic source once and test points on the CPU",
  );
  assert.match(implementation, /isLngLatInRegionGeometry/u);
});

test("mosaic-dependent labels refresh only for a translated/zoomed settled camera", async () => {
  const source = await readFile(globeMapUrl, "utf8");
  const start = source.indexOf("const syncVisibleCommuneNavigationHubs = (");
  const end = source.indexOf("}, [franceCommuneNavigationHubIndex, mapInstance]);", start);
  const implementation = source.slice(start, end);

  assert.doesNotMatch(source, /FRANCE_NAVIGATION_HUB_MOSAIC_SOURCE_IDS/u);
  assert.doesNotMatch(source, /on\("sourcedata", handleMosaicSourceData/u);
  assert.ok(start >= 0 && end > start, "stable nationwide label effect must remain explicit");
  assert.match(implementation, /shouldRefreshStableLabelSource/u);
  assert.doesNotMatch(implementation, /on\("idle"/u);
  assert.doesNotMatch(implementation, /on\("rotateend"/u);
  assert.match(implementation, /on\("moveend", handleMoveEnd\)/u);
  assert.match(implementation, /on\("zoomend", handleZoomEnd\)/u);
});
