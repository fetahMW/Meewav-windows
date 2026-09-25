import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { buildZonesTileset, NATIONAL_SOURCE_LAYERS } from "../../scripts/geo/lib/build-zones.mjs";

test("builds and decodes a generic Trappes PMTiles prototype", async () => {
  const result = await buildZonesTileset(process.cwd(), "trappes", {
    version: "test-trappes",
    minimumZoom: 8,
    maximumZoom: 10,
  });
  assert.equal(result.manifest.canonicalZoneCount, 12);
  assert.deepEqual(result.manifest.sourceLayers, NATIONAL_SOURCE_LAYERS);
  assert.equal(result.manifest.tileCount > 0, true);
  assert.equal(result.manifest.maximumTileBytes < 500_000, true);
  assert.equal(result.inspection.layerNames.includes("music_zones"), true);
  assert.equal(result.inspection.header.specVersion, 3);
  assert.equal(result.inspection.header.tileType, 1);
  assert.equal(result.manifest.physicalSourceLayers.music_zones.sampleLegacyZoneId, "trappes_786210101_centre_ouest");
  const musicZoneMetadata = result.inspection.metadata.vector_layers.find((layer) => layer.id === "music_zones");
  assert.equal(musicZoneMetadata.fields.overview_visible, "Boolean");
  assert.equal(musicZoneMetadata.fields.ground_color, "String");
});

test("publishes one complete detail geometry per national-runtime zone", async () => {
  const result = await buildZonesTileset(process.cwd(), "montpellier", {
    version: "test-montpellier-details",
    minimumZoom: 8,
    maximumZoom: 10,
  });
  assert.equal(result.manifest.zoneDetailCount, 31);
  const files = await readdir(result.detailDirectory);
  assert.equal(files.length, 31);
  const feature = JSON.parse(await readFile(`${result.detailDirectory}/${files[0]}`, "utf8"));
  assert.equal(feature.type, "Feature");
  assert.equal(typeof feature.properties.zone_id, "string");
  assert.equal(["Polygon", "MultiPolygon"].includes(feature.geometry.type), true);
});
