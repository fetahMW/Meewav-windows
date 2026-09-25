import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import test from 'node:test';

import {
  allocateStyleMatrix,
  buildPrivatePlacements,
  buildCharonneAssignments,
  derivedPlacementFields,
  reserveCharonneProfiles,
  validateStyleTargetFeasibility,
} from '../allocator.mjs';
import {
  AVATAR_ASSET_URLS,
  FAMILY_ORDER,
  STYLE_FAMILIES,
  STYLE_IDS,
  canonicalAvatarId,
} from '../constants.mjs';
import {
  coordinateKey,
  normalizeParisZoneId,
  pointInFeature,
  representativePoint,
  stableSortByHash,
} from '../geometry.mjs';
import {
  PROFILE_COLUMNS,
  PROFILE_COLUMN_DEFINITIONS,
  TEMP_COLUMNS,
  createBackupSnapshot,
  fingerprintAssignments,
  fingerprintProfiles,
  fingerprintStagedRows,
  readBackupSnapshot,
  resolveDatabaseConfig,
  restoreProfilesTransaction,
} from '../database.mjs';
import { parseArguments } from '../index.mjs';
import { readAssignmentArtifact, writeAssignmentArtifact } from '../artifact.mjs';
import { featureAreaMeters, generateZoneBlueNoisePoints } from '../blue-noise.mjs';
import { getCharonneStressTestArtists } from '../../../server/mvt-tile-server/charonneStressTest.js';

test('canonicalAvatarId conserve 1..30 et remappe 31/32', () => {
  assert.equal(canonicalAvatarId('avatar_1'), 'avatar_1');
  assert.equal(canonicalAvatarId('avatar_30'), 'avatar_30');
  assert.equal(canonicalAvatarId('avatar_31'), 'avatar_1');
  assert.equal(canonicalAvatarId('avatar_32'), 'avatar_1');
  assert.equal(canonicalAvatarId('avatar_99'), null);
});

test('pointInFeature respecte les trous et representativePoint reste interieur', () => {
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    },
  };
  assert.equal(pointInFeature([2, 2], feature), true);
  assert.equal(pointInFeature([5, 5], feature), false);
  assert.equal(pointInFeature([11, 5], feature), false);
  const point = representativePoint(feature);
  assert.ok(point);
  assert.equal(pointInFeature(point, feature), true);
});

test('tri et reservation Charonne sont reproductibles', () => {
  const profiles = Array.from({ length: 600 }, (_, index) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  const first = reserveCharonneProfiles(profiles, 'seed-test').selected.map((profile) => profile.id);
  const second = reserveCharonneProfiles([...profiles].reverse(), 'seed-test').selected.map((profile) => profile.id);
  assert.equal(first.length, 450);
  assert.deepEqual(first, second);
  assert.deepEqual(
    stableSortByHash(['b', 'a', 'c'], 'x'),
    stableSortByHash(['c', 'b', 'a'], 'x'),
  );
});

test('matrice styles conserve exactement les marges et les familles', () => {
  const zones = Array.from({ length: 4 }, (_, index) => ({
    id: `zone_${index}`,
    quota: 20,
    archetype: ['central_east', 'north_east_urban', 'south_balanced', 'west_professional'][index],
  }));
  const targets = Object.fromEntries(STYLE_IDS.map((style) => [style, 0]));
  Object.assign(targets, {
    avatar_1: 8,
    avatar_2: 4,
    avatar_3: 5,
    avatar_4: 5,
    avatar_7: 8,
    avatar_14: 8,
    avatar_17: 8,
    avatar_19: 8,
    avatar_23: 8,
    avatar_24: 10,
    avatar_25: 8,
  });
  const matrix = allocateStyleMatrix(zones, targets, 'matrix-seed');
  const again = allocateStyleMatrix(zones, targets, 'matrix-seed');
  assert.deepEqual([...matrix.entries()], [...again.entries()]);
  for (const zone of zones) {
    const row = matrix.get(zone.id);
    assert.equal(Object.values(row).reduce((total, count) => total + count, 0), zone.quota);
    assert.ok(row.avatar_3 >= 1);
    assert.ok(row.avatar_4 >= 1);
    for (const family of FAMILY_ORDER) {
      assert.ok(STYLE_FAMILIES[family].some((style) => row[style] > 0), `${zone.id}/${family}`);
    }
  }
  for (const style of STYLE_IDS) {
    assert.equal(zones.reduce((total, zone) => total + matrix.get(zone.id)[style], 0), targets[style], style);
  }
});

test('faisabilite styles echoue globalement avant matrice si video est insuffisant', () => {
  const zones = Array.from({ length: 4 }, (_, index) => ({ id: `zone_${index}`, quota: 20 }));
  const targets = Object.fromEntries(STYLE_IDS.map((style) => [style, 100]));
  targets.avatar_2 = 3;
  assert.throws(
    () => validateStyleTargetFeasibility(zones, targets),
    /Minima globaux styles infaisables: video 3\/4/,
  );
});

test('coordinateKey detecte les doublons au centimetre', () => {
  assert.equal(coordinateKey(2.123456789, 48.123456789), '2.1234568,48.1234568');
  assert.equal(coordinateKey(2.123456781, 48.123456781), '2.1234568,48.1234568');
});

test('blue-noise est deterministe, PIP, regulier et sans grille visible', () => {
  const feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [
        [[2.34, 48.84], [2.37, 48.84], [2.37, 48.87], [2.34, 48.87], [2.34, 48.84]],
        [[2.351, 48.851], [2.359, 48.851], [2.359, 48.859], [2.351, 48.859], [2.351, 48.851]],
      ],
    },
  };
  const options = {
    feature,
    count: 240,
    seed: 'blue-noise-test',
    zoneId: 'quartier_test',
    label: 'Quartier test',
  };
  const first = generateZoneBlueNoisePoints(options);
  const second = generateZoneBlueNoisePoints(options);
  assert.deepEqual(first, second);
  assert.equal(first.length, 240);
  assert.equal(new Set(first.map((point) => coordinateKey(point.lng, point.lat))).size, 240);
  assert.ok(new Set(first.map((point) => point.lng)).size > 220);
  assert.ok(new Set(first.map((point) => point.lat)).size > 220);
  for (const point of first) assert.equal(pointInFeature([point.lng, point.lat], feature), true);

  const nearestDistances = first.map((point, index) => {
    let nearest = Infinity;
    for (let otherIndex = 0; otherIndex < first.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = first[otherIndex];
      const meanLatitude = (point.lat + other.lat) / 2;
      const dx = (other.lng - point.lng) * 111_320 * Math.cos(meanLatitude * Math.PI / 180);
      const dy = (other.lat - point.lat) * 110_574;
      nearest = Math.min(nearest, Math.sqrt(dx * dx + dy * dy));
    }
    return nearest;
  });
  const average = nearestDistances.reduce((total, distance) => total + distance, 0) / nearestDistances.length;
  const deviation = Math.sqrt(nearestDistances.reduce(
    (total, distance) => total + (distance - average) ** 2,
    0,
  ) / nearestDistances.length);
  const idealSpacing = Math.sqrt(featureAreaMeters(feature) / first.length);
  assert.ok(Math.min(...nearestDistances) > idealSpacing * 0.4);
  assert.ok(deviation / average < 0.35);
});

test('assignmentPlanHash est ordonne et sensible aux champs stages', () => {
  const first = { id: '00000000-0000-4000-8000-000000000001', city: 'Paris', lat: 48.1, lng: 2.1 };
  const second = { id: '00000000-0000-4000-8000-000000000002', city: 'Grand Paris', lat: 48.2, lng: 2.2 };
  const expected = fingerprintAssignments([first, second]);
  assert.equal(fingerprintAssignments([second, first]), expected);
  assert.notEqual(fingerprintAssignments([first, { ...second, city: 'Paris' }]), expected);
  assert.notEqual(fingerprintAssignments([first, { ...second, lat: 48.20001 }]), expected);
  assert.notEqual(fingerprintAssignments([first, { ...second, privateLat: 48.20001 }]), expected);
});

test('placements prives sont distincts, PIP, uniques et deterministes', () => {
  const zone = {
    id: 'zone_privacy',
    region: 'paris',
    feature: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [2.34, 48.84], [2.37, 48.84], [2.37, 48.87], [2.34, 48.87], [2.34, 48.84],
        ]],
      },
    },
    communeFeature: null,
  };
  const publicPoints = [
    { id: 'p1', lng: 2.35, lat: 48.85 },
    { id: 'p2', lng: 2.355, lat: 48.855 },
  ];
  const candidates = [
    ...publicPoints,
    { id: 'a1', lng: 2.3525, lat: 48.85 },
    { id: 'a2', lng: 2.3575, lat: 48.855 },
  ];
  const first = buildPrivatePlacements({
    zone,
    publicPoints,
    candidateAnchors: candidates,
    usedPrivateCoordinateKeys: new Set(),
    seed: 'privacy-seed',
  });
  const second = buildPrivatePlacements({
    zone,
    publicPoints,
    candidateAnchors: candidates,
    usedPrivateCoordinateKeys: new Set(),
    seed: 'privacy-seed',
  });
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((placement) => coordinateKey(placement.privateLng, placement.privateLat))).size, 2);
  for (let index = 0; index < first.length; index += 1) {
    assert.notEqual(
      coordinateKey(first[index].privateLng, first[index].privateLat),
      coordinateKey(publicPoints[index].lng, publicPoints[index].lat),
    );
    assert.equal(pointInFeature([first[index].privateLng, first[index].privateLat], zone.feature), true);
    assert.ok(first[index].privateDistanceMeters >= 45 && first[index].privateDistanceMeters <= 650);
  }
});

test('zone etroite utilise un jitter PIP distinct dans la tolerance privacy', () => {
  const zone = {
    id: 'zone_etroite',
    region: 'paris',
    feature: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [2.35, 48.84], [2.351, 48.84], [2.351, 48.86], [2.35, 48.86], [2.35, 48.84],
        ]],
      },
    },
    communeFeature: null,
  };
  const publicPoint = { id: 'narrow-public', lng: 2.3505, lat: 48.85 };
  const publicKeys = new Set([coordinateKey(publicPoint.lng, publicPoint.lat)]);
  const placements = buildPrivatePlacements({
    zone,
    publicPoints: [publicPoint],
    candidateAnchors: [publicPoint],
    usedPrivateCoordinateKeys: new Set(),
    forbiddenPublicCoordinateKeys: publicKeys,
    seed: 'narrow-seed',
  });
  assert.match(placements[0].privatePlacementQuality, /^pip_jitter_/);
  assert.ok(placements[0].privateDistanceMeters >= 45 && placements[0].privateDistanceMeters <= 650);
  assert.equal(pointInFeature([placements[0].privateLng, placements[0].privateLat], zone.feature), true);
  assert.equal(publicKeys.has(coordinateKey(placements[0].privateLng, placements[0].privateLat)), false);
});

test('Charonne utilise la meme loi blue-noise que les autres quartiers', () => {
  const collection = JSON.parse(fs.readFileSync(
    path.resolve('src/features/globe/data/paris-quartiers.geojson'),
    'utf8',
  ));
  const feature = collection.features.find((candidate) => normalizeParisZoneId(candidate.properties) === 'paris_20e_charonne');
  const zone = {
    id: 'paris_20e_charonne',
    region: 'paris',
    parentId: 'paris_20e',
    feature,
    communeFeature: null,
    anchors: [],
    densityTier: 'medium',
    densityWeight: 0.7,
  };
  const fixtures = getCharonneStressTestArtists().filter((artist) => artist.is_mock);
  const profiles = fixtures.map((_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    avatar_id: 'avatar_1',
    identity_seed: `identity-${index}`,
  }));
  const publicKeys = new Set();
  const privateKeys = new Set();
  const assignments = buildCharonneAssignments(
    profiles,
    fixtures,
    zone,
    'charonne-privacy-test',
    publicKeys,
    privateKeys,
  );
  const expectedPoints = generateZoneBlueNoisePoints({
    feature,
    count: fixtures.length,
    seed: 'charonne-privacy-test',
    zoneId: 'paris_20e_charonne',
    label: zone.label,
  });
  assert.equal(assignments.length, 450);
  assert.equal(publicKeys.size, 450);
  assert.equal(privateKeys.size, 450);
  for (let index = 0; index < assignments.length; index += 1) {
    const assignment = assignments[index];
    assert.equal(assignment.lng, expectedPoints[index].lng);
    assert.equal(assignment.lat, expectedPoints[index].lat);
    assert.equal(assignment.addressId, null);
    assert.equal(assignment.anchorType, 'zone_blue_noise');
    assert.equal(assignment.sourceQuality, 'zone_blue_noise_deterministic');
    assert.equal(publicKeys.has(coordinateKey(assignment.privateLng, assignment.privateLat)), false);
    assert.equal(pointInFeature([assignment.privateLng, assignment.privateLat], feature), true);
    assert.ok(assignment.privateDistanceMeters >= 45 && assignment.privateDistanceMeters <= 650);
  }
});

test('les 30 avatar_url pointent vers les assets carousel existants', () => {
  assert.equal(Object.keys(AVATAR_ASSET_URLS).length, 30);
  for (const url of Object.values(AVATAR_ASSET_URLS)) {
    assert.equal(fs.existsSync(path.resolve('public', url.replace(/^\//, ''))), true, url);
  }
});

test('clusters derives respectent scopes et precisions historiques', () => {
  const paris = derivedPlacementFields({ region: 'paris', parentId: 'paris_11e' }, 2.35, 48.85, 'avatar_3');
  assert.equal(paris.countryClusterId, 'country_france');
  assert.equal(paris.cityClusterId, 'city_paris');
  assert.equal(paris.macroClusterId, `paris_macro_${Math.floor(2.35 * 18)}_${Math.floor(48.85 * 18)}`);
  assert.equal(paris.midClusterId, `paris_mid_${Math.floor(2.35 * 35)}_${Math.floor(48.85 * 35)}`);
  assert.equal(paris.localClusterId, `paris_local_${Math.floor(2.35 * 75)}_${Math.floor(48.85 * 75)}`);
  assert.equal(paris.microClusterId, `paris_micro_${Math.floor(2.35 * 160)}_${Math.floor(48.85 * 160)}`);
  assert.equal(paris.nanoClusterId, `paris_nano_${Math.floor(2.35 * 420)}_${Math.floor(48.85 * 420)}`);
  const grandParis = derivedPlacementFields(
    { region: 'grand_paris', parentId: 'grand_paris_commune_93066' },
    2.36,
    48.93,
    'avatar_4',
  );
  assert.equal(grandParis.cityClusterId, 'grand_paris_commune_93066');
  assert.equal(Object.values(grandParis).some((value) => String(value).startsWith('paris_')), false);
});

test('--apply et --restore exigent leurs doubles cles explicites', () => {
  assert.throws(() => parseArguments(['--apply']), /expected-plan-hash/);
  const apply = parseArguments([
    '--apply',
    '--expected-plan-hash=abc',
    '--expected-project-ref=projectref',
  ]);
  assert.equal(apply.mode, 'apply');
  assert.equal(apply.expectedPlanHash, 'abc');
  assert.throws(
    () => parseArguments(['--apply-artifact=manifest.json', '--expected-plan-hash=abc']),
    /expected-source-fingerprint/,
  );
  const artifactApply = parseArguments([
    '--apply-artifact=manifest.json',
    '--expected-plan-hash=abc',
    '--expected-source-fingerprint=def',
    '--expected-project-ref=projectref',
  ]);
  assert.equal(artifactApply.mode, 'apply-artifact');
  assert.throws(
    () => parseArguments(['--restore=backup.gz', '--restore-sha256=abc', '--expected-project-ref=projectref']),
    /expected-current-plan-hash/,
  );
});

test('artefact assignments gzip est fige par SHA, plan et source', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-dispatch-artifact-'));
  const assignments = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      city: 'Paris',
      lat: 48.1,
      lng: 2.1,
      displayName: '€'.repeat(20_000),
    },
    { id: '00000000-0000-4000-8000-000000000002', city: 'Grand Paris', lat: 48.2, lng: 2.2 },
  ];
  const assignmentPlanHash = fingerprintAssignments(assignments);
  try {
    const written = await writeAssignmentArtifact({
      assignments,
      seed: 'artifact-test-seed',
      databaseFingerprint: 'a'.repeat(64),
      assignmentPlanHash,
      reportRunId: 'dry-run-test',
      reportDir: directory,
      expectedCount: 2,
      auditEvidence: [{ ordinal: 1, assignmentPlanHash }, { ordinal: 2, assignmentPlanHash }],
    });
    assert.equal(written.rowCount, 2);
    const read = await readAssignmentArtifact({
      manifestPath: written.manifestPath,
      expectedPlanHash: assignmentPlanHash,
      expectedDatabaseFingerprint: 'a'.repeat(64),
      expectedCount: 2,
    });
    assert.equal(read.assignments.length, 2);
    assert.equal(fingerprintAssignments(read.assignments), assignmentPlanHash);
    await assert.rejects(
      readAssignmentArtifact({
        manifestPath: written.manifestPath,
        expectedPlanHash: '0'.repeat(64),
        expectedCount: 2,
      }),
      /Plan manifeste/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('--env explicite remplace le process et la cible projet est verifiee', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-dispatch-env-'));
  const envPath = path.join(directory, 'dispatch.env');
  const previous = process.env.DATABASE_URL;
  try {
    fs.writeFileSync(envPath, [
      'DATABASE_URL=postgresql://postgres.projectref:secret@db.projectref.supabase.co/postgres?sslmode=require',
      'VITE_SUPABASE_URL=https://projectref.supabase.co',
    ].join('\n'));
    process.env.DATABASE_URL = 'postgresql://wrong:secret@wrong.example.test/wrong';
    const strict = resolveDatabaseConfig({
      envPath,
      expectedProjectRef: 'projectref',
      writeIntent: true,
    });
    assert.equal(strict.safeTarget.host, 'db.projectref.supabase.co');
    assert.equal(strict.connectionConfig.ssl.rejectUnauthorized, true);
    const explicitException = resolveDatabaseConfig({
      envPath,
      expectedProjectRef: 'projectref',
      writeIntent: true,
      allowUnverifiedTls: true,
    });
    assert.equal(explicitException.connectionConfig.ssl.rejectUnauthorized, false);
    assert.throws(
      () => resolveDatabaseConfig({ envPath, expectedProjectRef: 'another', writeIntent: true }),
      /Projet DB projectref/,
    );
  } finally {
    if (previous == null) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('backup gzip recalcule le fingerprint du contenu decompresse', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-dispatch-backup-'));
  const profiles = [1, 2].map((index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    city: index === 1 ? 'Paris' : 'Grand Paris',
    display_name: index === 1 ? '€'.repeat(20_000) : 'Artiste Deux',
    identity_seed: `seed-${index}`,
  }));
  const databaseFingerprint = fingerprintProfiles(profiles);
  try {
    const snapshot = await createBackupSnapshot({
      profiles,
      databaseFingerprint,
      backupRoot: directory,
      expectedCount: 2,
    });
    assert.equal(snapshot.contentFingerprint, databaseFingerprint);
    const read = await readBackupSnapshot({
      filePath: snapshot.filePath,
      expectedFingerprint: databaseFingerprint,
      expectedSha256: snapshot.sha256,
      expectedCount: 2,
      collectProfiles: true,
    });
    assert.equal(read.rowCount, 2);
    assert.equal(read.contentFingerprint, databaseFingerprint);
    await assert.rejects(
      readBackupSnapshot({ filePath: snapshot.filePath, expectedSha256: '0'.repeat(64), expectedCount: 2 }),
      /SHA-256 backup/,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeRestoreFake({ profiles, currentRows, mismatchCount = 0, commitError = false }) {
  const queries = [];
  const expectedUdt = { uuid: 'uuid', text: 'text', 'double precision': 'float8', integer: 'int4' };
  return {
    queries,
    query(sql) {
      const text = typeof sql === 'string' ? sql : String(sql?.text ?? sql?.query ?? sql);
      queries.push(text);
      if (text.startsWith('COPY ')) return new Writable({ write(_chunk, _encoding, callback) { callback(); } });
      if (text === 'COMMIT' && commitError) throw new Error('simulated commit timeout');
      if (text.includes('information_schema.columns')) {
        return { rows: PROFILE_COLUMN_DEFINITIONS.map(([column_name, type]) => ({ column_name, udt_name: expectedUdt[type] })) };
      }
      if (text.includes('FROM pg_index')) return { rows: [{ attname: 'id' }] };
      if (text.includes('FROM pg_trigger')) return { rows: [] };
      if (text.includes('LEFT JOIN public.mock_artists')) return { rows: [{ count: mismatchCount }] };
      if (text.includes('SELECT count(*)::integer AS count FROM avatar_dispatch_restore')) return { rows: [{ count: profiles.length }] };
      if (text.includes('FROM avatar_dispatch_restore AS source') && text.includes('JOIN public.mock_artists AS target')) {
        return { rows: [{ count: 0 }] };
      }
      if (text.startsWith('\n    UPDATE public.mock_artists')) return { rows: [], rowCount: 0 };
      if (text.includes('FROM public.mock_artists') && text.includes('identity_seed')) return { rows: profiles };
      if (text.includes('FROM public.mock_artists') && text.includes('private_mock_lat')) return { rows: currentRows };
      return { rows: [], rowCount: 0 };
    },
  };
}

test('restore transactionnel compare et COMMIT, ou ROLLBACK sur mismatch', async () => {
  const profiles = [1, 2].map((index) => Object.fromEntries(
    PROFILE_COLUMNS.map((column) => [column, column === 'id'
      ? `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
      : null]),
  ));
  const currentRows = profiles.map((profile) => Object.fromEntries(
    TEMP_COLUMNS.map(([column]) => [column, profile[column]]),
  ));
  const expectedCurrentPlanHash = fingerprintStagedRows(currentRows);
  const backupFingerprint = fingerprintProfiles(profiles);
  const success = makeRestoreFake({ profiles, currentRows });
  const result = await restoreProfilesTransaction({
    client: success,
    profiles,
    backupFingerprint,
    expectedCurrentPlanHash,
    expectedCount: 2,
  });
  assert.equal(result.status, 'committed');
  assert.ok(success.queries.includes('COMMIT'));
  assert.equal(success.queries.includes('ROLLBACK'), false);

  const failure = makeRestoreFake({ profiles, currentRows, mismatchCount: 1 });
  await assert.rejects(
    restoreProfilesTransaction({
      client: failure,
      profiles,
      backupFingerprint,
      expectedCurrentPlanHash,
      expectedCount: 2,
    }),
    /Comparaison staging\/table/,
  );
  assert.ok(failure.queries.includes('ROLLBACK'));

  const ambiguous = makeRestoreFake({ profiles, currentRows, commitError: true });
  const ambiguousResult = await restoreProfilesTransaction({
    client: ambiguous,
    profiles,
    backupFingerprint,
    expectedCurrentPlanHash,
    expectedCount: 2,
  });
  assert.equal(ambiguousResult.status, 'commit_response_unknown');
  assert.equal(ambiguous.queries.includes('ROLLBACK'), false);
});
