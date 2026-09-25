import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generateZoneBlueNoisePoints } from '../blue-noise.mjs';
import {
  generateGrandParisAnchors,
  loadGeoAssets,
} from '../geo-loader.mjs';
import {
  coordinateKey,
  normalizeParisZoneId,
  pointInFeature,
} from '../geometry.mjs';

function rectangleFeature(minLng, minLat, maxLng, maxLat) {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ]],
    },
  };
}

function syntheticGrandParisZones() {
  const communeFeature = rectangleFeature(2.30, 48.80, 2.40, 48.90);
  return [
    {
      id: 'grand_paris_test_ouest',
      label: 'Test Ouest',
      parentLabel: 'Commune test',
      feature: rectangleFeature(2.31, 48.81, 2.35, 48.89),
      communeFeature,
      anchors: [],
      anchorCount: 0,
      rawAnchorCount: 0,
      rejectedAnchorCount: 0,
    },
    {
      id: 'grand_paris_test_est',
      label: 'Test Est',
      parentLabel: 'Commune test',
      feature: rectangleFeature(2.35, 48.81, 2.39, 48.89),
      communeFeature,
      anchors: [],
      anchorCount: 0,
      rawAnchorCount: 0,
      rejectedAnchorCount: 0,
    },
  ];
}

test('les ancres Grand Paris de reference sont deterministes, uniques et PIP', () => {
  const firstZones = syntheticGrandParisZones();
  const secondZones = syntheticGrandParisZones();
  const first = generateGrandParisAnchors(firstZones, 'polygon-anchor-test');
  const second = generateGrandParisAnchors(secondZones, 'polygon-anchor-test');

  assert.deepEqual(first, second);
  assert.deepEqual(
    firstZones.map((zone) => zone.anchors),
    secondZones.map((zone) => zone.anchors),
  );
  assert.equal(first.anchorCount, firstZones.length * 2);
  assert.equal(first.rejectedCount, 0);

  const coordinateKeys = new Set();
  for (const zone of firstZones) {
    assert.equal(zone.rawAnchorCount, 2);
    assert.equal(zone.anchorCount, 2);
    assert.equal(zone.rejectedAnchorCount, 0);
    for (const anchor of zone.anchors) {
      assert.equal(anchor.type, 'zone_blue_noise');
      assert.equal(anchor.label, `${zone.label}, ${zone.parentLabel}`);
      assert.equal(pointInFeature([anchor.lng, anchor.lat], zone.feature), true);
      assert.equal(pointInFeature([anchor.lng, anchor.lat], zone.communeFeature), true);
      const key = coordinateKey(anchor.lng, anchor.lat);
      assert.equal(coordinateKeys.has(key), false);
      coordinateKeys.add(key);
    }
  }

  const otherSeedZones = syntheticGrandParisZones();
  const otherSeed = generateGrandParisAnchors(otherSeedZones, 'polygon-anchor-other-seed');
  assert.notEqual(otherSeed.aggregateHash, first.aggregateHash);
});

test('loadGeoAssets ne lit plus de manifest et conserve le contrat de toutes les zones', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-geo-loader-'));
  const anchorsPath = path.join(directory, 'paris-anchors.json');
  try {
    const parisCollection = JSON.parse(fs.readFileSync(
      path.resolve('src/features/globe/data/paris-quartiers.geojson'),
      'utf8',
    ));
    const parisAnchors = parisCollection.features.map((feature) => {
      const properties = feature.properties ?? {};
      const zoneId = normalizeParisZoneId(properties);
      const [anchor] = generateZoneBlueNoisePoints({
        feature,
        count: 1,
        seed: 'geo-loader-paris-fixture',
        zoneId,
        label: String(properties.l_qu),
      });
      return {
        ...anchor,
        district: `Paris ${Number(properties.c_ar)}e`,
      };
    });
    fs.writeFileSync(anchorsPath, JSON.stringify(parisAnchors));

    const loaded = loadGeoAssets({
      seed: 'geo-loader-integration-test',
      parisAnchorsPath: anchorsPath,
    });
    const grandParisZones = loaded.zones.filter((zone) => zone.region === 'grand_paris');

    assert.equal(loaded.zones.length, 984);
    assert.equal(grandParisZones.length, 904);
    assert.equal(grandParisZones.every((zone) => zone.anchors.length === 2), true);
    assert.equal(loaded.assets.grandParisPolygonAnchorCount, 1_808);
    assert.equal(loaded.assets.grandParisPolygonAnchorRejectedCount, 0);
    assert.equal(Object.keys(loaded.assets).some((key) => /building/i.test(key)), false);

    const loaderSource = fs.readFileSync(
      path.resolve('scripts/avatar-dispatch/geo-loader.mjs'),
      'utf8',
    );
    assert.doesNotMatch(loaderSource, /grandParisBuildings|public[\\/]+buildings|osm_building/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
