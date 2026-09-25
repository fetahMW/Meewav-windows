import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  PARIS_LANDMARK_AVATAR_SAFETY_ZONES,
  applyParisLandmarkAvatarSafetyToFeatureCollection,
  isParisLandmarkAvatarPositionSafe,
} from "../../server/mvt-tile-server/parisLandmarkAvatarSafety.js";

function getFeatureId(feature, index) {
  return String(
    feature?.properties?.profile_id
      ?? feature?.properties?.id
      ?? feature?.properties?.musician_id
      ?? feature?.id
      ?? index,
  );
}

function countMovedPointFeatures(before, after) {
  return before.features.reduce((count, feature, index) => {
    const beforeCoordinates = feature?.geometry?.coordinates;
    const afterCoordinates = after.features[index]?.geometry?.coordinates;
    if (!Array.isArray(beforeCoordinates) || !Array.isArray(afterCoordinates)) return count;
    return beforeCoordinates[0] === afterCoordinates[0] && beforeCoordinates[1] === afterCoordinates[1]
      ? count
      : count + 1;
  }, 0);
}

function assertCollectionIsSafeAndConserved(before, after) {
  assert.equal(after.features.length, before.features.length);
  assert.deepEqual(
    after.features.map(getFeatureId),
    before.features.map(getFeatureId),
  );

  for (const feature of after.features) {
    if (feature?.geometry?.type !== "Point") continue;
    const [lng, lat] = feature.geometry.coordinates;
    assert.equal(
      isParisLandmarkAvatarPositionSafe(Number(lng), Number(lat)),
      true,
      `unsafe avatar ${getFeatureId(feature, -1)} at ${lng},${lat}`,
    );
  }
}

test("clears the known local and stress GeoJSON fixtures without losing profiles", async () => {
  const fixtures = [
    { path: "public/map/meewav-users.geojson", expectedMoved: 3 },
    { path: "public/map/avatars-stress-test.json", expectedMoved: 8 },
  ];

  for (const fixture of fixtures) {
    const source = JSON.parse(await readFile(fixture.path, "utf8"));
    const result = applyParisLandmarkAvatarSafetyToFeatureCollection(source);

    assertCollectionIsSafeAndConserved(source, result);
    assert.equal(countMovedPointFeatures(source, result), fixture.expectedMoved);
  }
});

test("keeps every safety zone centered on its retained GLB landmark", async () => {
  const landmarkFiles = new Map([
    ["eiffel-tower", "src/features/globe/maplibre/eiffelTowerLayer.ts"],
    ["montparnasse-tower", "src/features/globe/maplibre/montparnasseTowerLayer.ts"],
    ["notre-dame-paris", "src/features/globe/maplibre/notreDameLayer.ts"],
  ]);

  for (const zone of PARIS_LANDMARK_AVATAR_SAFETY_ZONES) {
    const source = await readFile(landmarkFiles.get(zone.id), "utf8");
    assert.match(
      source,
      new RegExp(`\\[${zone.center[0]},\\s*${zone.center[1]}\\]`, "u"),
      `${zone.label} safety center must match its GLB anchor`,
    );
  }
});

test("wires landmark safety before every server hierarchy and index path", async () => {
  const source = await readFile("server/mvt-tile-server/index.js", "utf8");
  const canonicalStart = source.indexOf("const canonicalResult = buildCanonicalMockArtistRows(validDbRows)");
  const mockSafety = source.indexOf("applyParisLandmarkAvatarSafetyToRecord(row, row.id)", canonicalStart);
  const hierarchyBuild = source.indexOf("buildScopedArtistHierarchy(validRows)", canonicalStart);

  assert.ok(canonicalStart >= 0);
  assert.ok(mockSafety > canonicalStart && mockSafety < hierarchyBuild);
  assert.match(
    source,
    /function profileRowToAvatar\(row\)[\s\S]*?return applyParisLandmarkAvatarSafetyToRecord\(\{[\s\S]*?\}, profileId\);/,
  );
  assert.match(
    source,
    /mockArtists\.push\(applyParisLandmarkAvatarSafetyToRecord\(artistObj, artistId\)\)/,
  );
});

test("keeps public GeoJSON landmark-safe while the host stays at its scene centre", async () => {
  const [avatarLayers, globeMap, onboarding] = await Promise.all([
    readFile("src/map/avatarLayers.ts", "utf8"),
    readFile("src/features/globe/components/GlobeMapV2.tsx", "utf8"),
    readFile("src/features/globe/onboarding/onboardingCurrentUserOverlay.ts", "utf8"),
  ]);

  assert.match(
    avatarLayers,
    /const landmarkSafeGeojson = applyParisLandmarkSafetyToAvatarGeoJson\(geojson\);[\s\S]{0,180}normalizeGeoJsonAvatarFeatures\(landmarkSafeGeojson\)/,
  );
  assert.match(
    globeMap,
    /const landmarkSafeData = applyParisLandmarkSafetyToAvatarGeoJson\(data\);[\s\S]{0,260}installGeoJsonAvatarBudget\(map, landmarkSafeData\)[\s\S]{0,120}setAvatarData\(map, landmarkSafeData\)/,
  );
  assert.match(
    onboarding,
    /function createSourceData\(payload: MusicSceneOnboardingPayload\)[\s\S]{0,900}const sceneCenter = getOnboardingSceneCenter\(payload\);[\s\S]{0,900}coordinates: sceneCenter/,
  );
  assert.doesNotMatch(onboarding, /getParisLandmarkSafeAvatarLngLat/);
});
