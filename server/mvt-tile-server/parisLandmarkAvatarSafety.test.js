import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyParisLandmarkAvatarSafetyToFeatureCollection,
  applyParisLandmarkAvatarSafetyToRecord,
  getParisLandmarkAvatarDistanceMeters,
  getParisLandmarkSafeAvatarPosition,
  isParisLandmarkAvatarPositionSafe,
  PARIS_LANDMARK_AVATAR_SAFETY_ZONES,
} from './parisLandmarkAvatarSafety.js';

test('publishes the three retained Paris landmark safety zones', () => {
  assert.deepEqual(
    PARIS_LANDMARK_AVATAR_SAFETY_ZONES.map(({ id, center, radiusMeters }) => ({
      id,
      center: [...center],
      radiusMeters,
    })),
    [
      { id: 'eiffel-tower', center: [2.294694, 48.858093], radiusMeters: 140 },
      { id: 'montparnasse-tower', center: [2.32195, 48.84205], radiusMeters: 65 },
      { id: 'notre-dame-paris', center: [2.349902, 48.852968], radiusMeters: 80 },
    ],
  );
});

test('moves every interior point beyond its landmark radius with deterministic clearance', () => {
  for (const zone of PARIS_LANDMARK_AVATAR_SAFETY_ZONES) {
    const first = getParisLandmarkSafeAvatarPosition(
      zone.center[0],
      zone.center[1],
      `profile-at-${zone.id}`,
    );
    const repeated = getParisLandmarkSafeAvatarPosition(
      zone.center[0],
      zone.center[1],
      `profile-at-${zone.id}`,
    );

    assert.deepEqual(repeated, first);
    assert.equal(first.moved, true);
    assert.equal(first.zoneId, zone.id);
    assert.ok(
      getParisLandmarkAvatarDistanceMeters(first.lng, first.lat, zone)
        >= zone.radiusMeters + 7.9,
    );
    assert.equal(isParisLandmarkAvatarPositionSafe(first.lng, first.lat), true);
  }
});

test('is idempotent and leaves already safe records untouched by reference', () => {
  const unsafeRecord = {
    id: 'montparnasse-profile',
    lng: 2.32195,
    lat: 48.84205,
    display_name: 'Test Montparnasse',
  };
  const safeRecord = applyParisLandmarkAvatarSafetyToRecord(unsafeRecord);
  const secondPass = applyParisLandmarkAvatarSafetyToRecord(safeRecord);
  const outsideRecord = { id: 'charonne-profile', lng: 2.3945, lat: 48.8555 };

  assert.notStrictEqual(safeRecord, unsafeRecord);
  assert.strictEqual(secondPass, safeRecord);
  assert.strictEqual(applyParisLandmarkAvatarSafetyToRecord(outsideRecord), outsideRecord);
  assert.equal(isParisLandmarkAvatarPositionSafe(safeRecord.lng, safeRecord.lat), true);
});

test('uses stable identities to distribute profiles placed at one landmark center', () => {
  const zone = PARIS_LANDMARK_AVATAR_SAFETY_ZONES[2];
  const positions = new Set(
    Array.from({ length: 16 }, (_, index) => {
      const position = getParisLandmarkSafeAvatarPosition(
        zone.center[0],
        zone.center[1],
        `notre-dame-profile-${index}`,
      );
      return `${position.lng},${position.lat}`;
    }),
  );

  assert.equal(positions.size, 16);
});

test('preserves GeoJSON count, order, properties and higher coordinate dimensions', () => {
  const source = {
    type: 'FeatureCollection',
    metadata: { fixture: true },
    features: [
      {
        type: 'Feature',
        id: 'unsafe-feature',
        geometry: { type: 'Point', coordinates: [2.349902, 48.852968, 35] },
        properties: { id: 'unsafe-feature', name: 'Notre-Dame fixture' },
      },
      {
        type: 'Feature',
        id: 'safe-feature',
        geometry: { type: 'Point', coordinates: [2.3945, 48.8555] },
        properties: { id: 'safe-feature', name: 'Charonne fixture' },
      },
    ],
  };
  const result = applyParisLandmarkAvatarSafetyToFeatureCollection(source);

  assert.notStrictEqual(result, source);
  assert.equal(result.features.length, source.features.length);
  assert.deepEqual(result.features.map((feature) => feature.id), ['unsafe-feature', 'safe-feature']);
  assert.strictEqual(result.features[1], source.features[1]);
  assert.strictEqual(result.features[0].properties, source.features[0].properties);
  assert.equal(result.features[0].geometry.coordinates[2], 35);
  assert.equal(
    isParisLandmarkAvatarPositionSafe(
      result.features[0].geometry.coordinates[0],
      result.features[0].geometry.coordinates[1],
    ),
    true,
  );
});
