import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import zlib from 'node:zlib';
import express from 'express';
import Pbf from 'pbf';
import mapboxVectorTile from '@mapbox/vector-tile';
import { getCharonneStressTestArtists } from './charonneStressTest.js';
import {
  getParisLandmarkAvatarDistanceMeters,
  PARIS_LANDMARK_AVATAR_SAFETY_ZONES,
} from './parisLandmarkAvatarSafety.js';
import { __testables } from './index.js';

const { VectorTile } = mapboxVectorTile;

const {
  avatarPayloadFromArtist,
  buildArtistFacetAggregate,
  buildArtistFacetPayload,
  buildArtistFacetPayloadFromAggregate,
  buildCanonicalMockArtistRows,
  buildMockArtistSelectList,
  buildVisibleProfileCatalogueQuery,
  buildVisibleProfileSelectList,
  buildScopedArtistHierarchy,
  deriveCanonicalArtistGeography,
  encodeMvtPayloadForResponse,
  geographySearchPayload,
  EMPTY_MVT_TILE,
  filterArtistsOutsideHostReservation,
  generateDeterministic50K,
  getDemoAvatarContainmentAudit,
  getDemoGeometryBoundaryDistanceMeters,
  getGlobalCharonneOverlayArtists,
  getStableArtistLabelPriority,
  getStableArtistLabelTier,
  getSearchPrefixKeys,
  getZoneLookupAliases,
  resolveZoneFacetContextKeys,
  isArtistInsideBounds,
  isPointInsideDemoGeometry,
  lngLatToTileCoord,
  loadVisibleProfileRows,
  normalizeSearchQuery,
  profileRowToAvatar,
  resolveGeographyPoint,
  sendMvtPayload,
  selectAllCloseViewArtists
} = __testables;

test('demo geometry containment supports holes and multipolygons', () => {
  const polygonWithHole = {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
      [[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]],
    ],
  };
  const multiPolygon = {
    type: 'MultiPolygon',
    coordinates: [
      [[[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]],
      [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
    ],
  };

  assert.equal(isPointInsideDemoGeometry([0.5, 0.5], polygonWithHole), true);
  assert.equal(isPointInsideDemoGeometry([1.5, 1.5], polygonWithHole), false);
  assert.equal(isPointInsideDemoGeometry([12, 12], polygonWithHole), false);
  assert.equal(isPointInsideDemoGeometry([10.5, 10.5], multiPolygon), true);
  assert.equal(isPointInsideDemoGeometry([20.5, 20.5], multiPolygon), true);
  assert.ok(getDemoGeometryBoundaryDistanceMeters([0.5, 0.5], polygonWithHole) > 50_000);
});

test('deterministic Paris and Grand Paris fallback avatars stay inside their assigned polygons', () => {
  generateDeterministic50K();
  const audit = getDemoAvatarContainmentAudit();

  assert.ok(audit.checked >= 50_000, `expected complete catalogue audit, checked=${audit.checked}`);
  assert.equal(audit.withoutZone, 0);
  assert.deepEqual(audit.outside, []);
  assert.equal(audit.outsideCount, 0);
});

function requestRawHttp(server, acceptEncoding) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/tile',
      method: 'GET',
      headers: {
        'Accept-Encoding': acceptEncoding,
        Origin: 'https://app.meewav.test',
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        body: Buffer.concat(chunks),
        headers: response.headers,
        statusCode: response.statusCode,
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('MVT delivery negotiates and caches compact Brotli or gzip payloads', () => {
  const source = Buffer.from('meewav-avatar-tile\n'.repeat(12000));
  const brotli = encodeMvtPayloadForResponse(source, 'br, gzip');
  const brotliAgain = encodeMvtPayloadForResponse(source, 'br, gzip');
  const gzip = encodeMvtPayloadForResponse(source, 'gzip');
  const weightedGzip = encodeMvtPayloadForResponse(source, 'br;q=0.4, gzip;q=1');
  const explicitBrotliRejection = encodeMvtPayloadForResponse(source, 'br;q=0, *;q=1');
  const identity = encodeMvtPayloadForResponse(source, 'identity');
  const noHeader = encodeMvtPayloadForResponse(source, undefined);
  const noRepresentation = encodeMvtPayloadForResponse(
    source,
    'br;q=0, gzip;q=0, identity;q=0',
  );
  const wildcardRejection = encodeMvtPayloadForResponse(source, '*;q=0');
  const tinyBrotliOnly = encodeMvtPayloadForResponse(
    Buffer.from('tiny-mvt'),
    'br;q=1, identity;q=0',
  );

  assert.equal(brotli.encoding, 'br');
  assert.ok(brotli.buffer.length < source.length);
  assert.equal(brotliAgain.buffer, brotli.buffer, 'the same tile buffer must reuse its compressed variant');
  assert.deepEqual(zlib.brotliDecompressSync(brotli.buffer), source);
  assert.equal(gzip.encoding, 'gzip');
  assert.deepEqual(zlib.gunzipSync(gzip.buffer), source);
  assert.equal(weightedGzip.encoding, 'gzip');
  assert.equal(explicitBrotliRejection.encoding, 'gzip');
  assert.equal(identity.encoding, null);
  assert.equal(identity.buffer, source);
  assert.equal(noHeader.encoding, null);
  assert.equal(noHeader.buffer, source);
  assert.equal(noRepresentation.acceptable, false);
  assert.equal(noRepresentation.buffer, null);
  assert.equal(wildcardRejection.acceptable, false);
  assert.equal(tinyBrotliOnly.encoding, 'br');
  assert.deepEqual(zlib.brotliDecompressSync(tinyBrotliOnly.buffer), Buffer.from('tiny-mvt'));
});

test('HTTP MVT delivery emits transport headers and rejects impossible negotiation', async (t) => {
  const source = Buffer.from('representative-meewav-mvt\n'.repeat(8000));
  const testApp = express();
  testApp.get('/tile', (req, res) => {
    res.vary('Origin');
    res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
    res.setHeader('Cache-Control', 'public, max-age=30');
    return sendMvtPayload(req, res, source);
  });

  const server = await new Promise((resolve, reject) => {
    const nextServer = testApp.listen(0, '127.0.0.1', () => resolve(nextServer));
    nextServer.once('error', reject);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const brotli = await requestRawHttp(server, 'br, gzip');
  assert.equal(brotli.statusCode, 200);
  assert.equal(brotli.headers['content-encoding'], 'br');
  assert.match(brotli.headers.vary ?? '', /Origin/i);
  assert.match(brotli.headers.vary ?? '', /Accept-Encoding/i);
  assert.equal(Number(brotli.headers['content-length']), brotli.body.length);
  assert.deepEqual(zlib.brotliDecompressSync(brotli.body), source);

  const weightedGzip = await requestRawHttp(server, 'br;q=.2, gzip;q=1, identity;q=.1');
  assert.equal(weightedGzip.statusCode, 200);
  assert.equal(weightedGzip.headers['content-encoding'], 'gzip');
  assert.deepEqual(zlib.gunzipSync(weightedGzip.body), source);

  const impossible = await requestRawHttp(server, 'br;q=0, gzip;q=0, identity;q=0');
  assert.equal(impossible.statusCode, 406);
  assert.equal(impossible.headers['content-encoding'], undefined);
  assert.equal(impossible.headers['content-type'], undefined);
  assert.equal(impossible.headers['cache-control'], 'no-store');
  assert.equal(impossible.body.length, 0);
});

test('real signup profiles become grade-one MVT avatars in their selected scene', () => {
  const avatar = profileRowToAvatar({
    id: '0a11f92c-b0b4-41d1-9fe4-3bc2cd7c1744',
    display_name: 'Qa Carnas',
    handle: 'qa_carnas',
    avatar_name: 'DJ.png',
    avatar_icon_id: 'avatar_17',
    artist_type: 'DJ',
    city: 'Carnas',
    commune_code: '30069',
    zone_id: 'commune_30069',
    district_id: 'commune_30069',
    district_name: 'Carnas',
    scene_name: 'Carnas',
    scene_source: 'single-plate',
    lat: 43.8334,
    lng: 3.9886,
    grade_level: 1,
    golden_likes_count: 0,
    updated_at: '2026-07-15T02:30:00.000Z',
  });

  assert.equal(avatar.id, '0a11f92c-b0b4-41d1-9fe4-3bc2cd7c1744');
  assert.equal(avatar.is_mock, false);
  assert.equal(avatar.grade_level, 1);
  assert.equal(avatar.grade_stars, 1);
  assert.equal(avatar.grade_tier, 'rookie');
  assert.equal(avatar.grade_color, '#FFFFFF');
  assert.equal(avatar.golden_likes_count, 0);
  assert.equal(avatar.city, 'Carnas');
  assert.equal(avatar.commune_id, 'commune-30069');
  assert.equal(avatar.zone_id, 'commune_30069');
  assert.equal(avatar.avatar_icon_id, 'avatar_17');
  assert.equal(avatar.lat, 43.8334);
  assert.equal(avatar.lng, 3.9886);
});

test('real signup profiles are indexed outside every retained Paris landmark', () => {
  for (const [index, zone] of PARIS_LANDMARK_AVATAR_SAFETY_ZONES.entries()) {
    const avatar = profileRowToAvatar({
      id: `landmark-profile-${index}`,
      display_name: `Landmark profile ${index}`,
      avatar_icon_id: 'avatar_4',
      artist_type: 'Artiste',
      city: 'Paris',
      commune_code: '75056',
      zone_id: 'paris-test-zone',
      district_name: 'Paris test zone',
      lat: zone.center[1],
      lng: zone.center[0],
      grade_level: 1,
    });

    assert.ok(
      getParisLandmarkAvatarDistanceMeters(avatar.lng, avatar.lat, zone)
        >= zone.radiusMeters,
      `${zone.id} profile remained inside its safety zone`,
    );
  }
});

test('real profile catalogue reads only the safe public projection and visible coarse markers', () => {
  const profileColumns = new Set([
    'id',
    'username',
    'display_name',
    'avatar_style_key',
    'avatar_icon_id',
    'primary_role_key',
    'city',
    'commune_code',
    'zone_id',
    'zone_name',
    'scene_name',
    'grade',
    'golden_likes_count',
    'updated_at',
  ]);
  const markerColumns = new Set([
    'profile_id',
    'city',
    'commune_code',
    'zone_id',
    'zone_name',
    'avatar_icon_id',
    'scene_name',
    'latitude',
    'longitude',
    'is_visible',
    'updated_at',
  ]);
  const selectList = buildVisibleProfileSelectList(profileColumns, markerColumns);
  const query = buildVisibleProfileCatalogueQuery(profileColumns, markerColumns);

  assert.match(selectList, /p\."display_name" AS "display_name"/);
  assert.match(selectList, /m\."latitude" AS "lat"/);
  assert.match(selectList, /m\."longitude" AS "lng"/);
  assert.match(selectList, /m\."zone_id" AS "zone_id"/);
  assert.match(selectList, /p\."grade" AS "grade_level"/);
  assert.match(selectList, /p\."golden_likes_count" AS "golden_likes_count"/);
  assert.match(query, /FROM public\.public_profiles AS p/);
  assert.match(query, /INNER JOIN public\.profile_public_markers AS m/);
  assert.match(query, /m\.is_visible IS TRUE/);
  assert.doesNotMatch(query, /FROM public\.profiles\b/);
  assert.doesNotMatch(query, /p\."(?:latitude|longitude|email|street)"/i);
  assert.doesNotMatch(query, /is_ghost_mode/i);
});

test('safe public profile rows preserve the real profile id, marker zone, grade and zero Golden Likes', async () => {
  const queries = [];
  const profileColumns = [
    'id', 'username', 'display_name', 'avatar_icon_id', 'primary_role_key',
    'city', 'commune_code', 'zone_id', 'zone_name', 'scene_name', 'grade',
    'golden_likes_count', 'updated_at',
  ];
  const markerColumns = [
    'profile_id', 'city', 'commune_code', 'zone_id', 'zone_name',
    'avatar_icon_id', 'scene_name', 'latitude', 'longitude', 'is_visible', 'updated_at',
  ];
  const database = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (parameters?.[0] === 'public_profiles') {
        return { rows: profileColumns.map((column_name) => ({ column_name })) };
      }
      if (parameters?.[0] === 'profile_public_markers') {
        return { rows: markerColumns.map((column_name) => ({ column_name })) };
      }
      return {
        rows: [{
          id: '20000000-0000-0000-0000-000000000001',
          display_name: 'Nox Amani',
          handle: 'noxamani',
          avatar_icon_id: 'avatar_12',
          artist_type: 'producer',
          city: 'Paris',
          commune_code: '75056',
          zone_id: 'iris-751204412',
          district_id: 'iris-751204412',
          district_name: 'Charonne',
          scene_name: 'Paris Est',
          lat: 48.86,
          lng: 2.41,
          grade_level: 4,
          golden_likes_count: 0,
          updated_at: '2026-07-16T12:00:00.000Z',
        }],
      };
    },
  };

  const result = await loadVisibleProfileRows(database);
  assert.equal(result.available, true);
  assert.equal(result.rows.length, 1);
  const avatar = profileRowToAvatar(result.rows[0]);
  assert.equal(avatar.id, '20000000-0000-0000-0000-000000000001');
  assert.equal(avatar.zone_id, 'iris-751204412');
  assert.equal(avatar.grade_level, 4);
  assert.equal(avatar.golden_likes_count, 0);
  const mvtPayload = avatarPayloadFromArtist(avatar);
  assert.equal(mvtPayload.id, '20000000-0000-0000-0000-000000000001');
  assert.equal(mvtPayload.zone_id, 'iris-751204412');
  assert.equal(mvtPayload.golden_likes_count, 0);
  assert.ok(queries.some(({ sql }) => /m\.is_visible IS TRUE/.test(sql)));
});

test('missing safe profile views keep the mock-only fallback without querying profiles or PII', async () => {
  const queries = [];
  const database = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      return { rows: [] };
    },
  };

  const result = await loadVisibleProfileRows(database);
  assert.deepEqual(result, { available: false, rows: [] });
  assert.deepEqual(
    queries.map(({ parameters }) => parameters?.[0]).sort(),
    ['profile_public_markers', 'public_profiles'],
  );
  const sql = queries.map((query) => query.sql).join('\n');
  assert.doesNotMatch(sql, /FROM public\.profiles\b/);
  assert.doesNotMatch(sql, /\b(?:email|street|latitude|longitude)\b/i);
});

test('geography resolver returns a music zone without echoing precise coordinates', async () => {
  const queries = [];
  const database = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      return {
        rows: [{
          zone_id: '5fb2d651-38bd-5a6f-8673-665f6e131ddd',
          display_name: 'Charonne',
          commune_code: '75056',
          commune_name: 'Paris',
          quality: 'curated',
          source_vintage: '2026'
        }]
      };
    }
  };
  const result = await resolveGeographyPoint(database, { latitude: 48.854, longitude: 2.407 });

  assert.equal(result.status, 200);
  assert.equal(result.body.displayName, 'Charonne');
  assert.equal(result.body.resolution, 'music_zone');
  assert.equal('latitude' in result.body, false);
  assert.equal('longitude' in result.body, false);
  assert.deepEqual(queries[0].parameters, [2.407, 48.854]);
});

test('geography resolver falls back to a commune and never blocks registration', async () => {
  let call = 0;
  const database = {
    async query() {
      call += 1;
      if (call === 1) return { rows: [] };
      return {
        rows: [{
          zone_id: null,
          display_name: 'Trappes',
          commune_code: '78621',
          commune_name: 'Trappes',
          quality: 'fallback',
          source_vintage: '2026'
        }]
      };
    }
  };
  const result = await resolveGeographyPoint(database, { latitude: 48.77, longitude: 2.0 });
  assert.equal(result.status, 200);
  assert.equal(result.body.zoneId, null);
  assert.equal(result.body.resolution, 'sector_selection_required');
});

test('geography API helpers validate coordinates and constrain search payloads', async () => {
  const invalid = await resolveGeographyPoint({ query: async () => ({ rows: [] }) }, {
    latitude: 120,
    longitude: 2
  });
  assert.deepEqual(invalid, { status: 400, body: { error: 'invalid_latitude' } });
  assert.deepEqual(normalizeSearchQuery('  Charonne  ', 200), { query: 'Charonne', limit: 30 });
  assert.deepEqual(geographySearchPayload([{
    zone_id: 'zone-id',
    display_name: 'Charonne',
    aliases: [],
    commune_code: '75056',
    commune_name: 'Paris',
    quality: 'curated',
    source_vintage: '2026',
    bbox: [2, 48, 3, 49],
    label_lng: 2.4,
    label_lat: 48.85
  }])[0].labelPoint, [2.4, 48.85]);
});

test('empty MVT is a non-empty decodable PBF with the canonical source-layer', () => {
  assert.ok(EMPTY_MVT_TILE.length > 0);
  const tile = new VectorTile(new Pbf(EMPTY_MVT_TILE));
  assert.ok(EMPTY_MVT_TILE.includes(Buffer.from('musicians')));
  assert.deepEqual(Object.keys(tile.layers), []);
});

test('live empty tile keeps MVT headers and a decodable canonical layer', {
  skip: !process.env.MEEWAV_LIVE_BASE_URL
}, async () => {
  const response = await fetch(`${process.env.MEEWAV_LIVE_BASE_URL}/musicians_clustered/2/2/1`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /application\/vnd\.mapbox-vector-tile/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length > 0);
  const tile = new VectorTile(new Pbf(bytes));
  assert.ok(bytes.includes(Buffer.from('musicians')));
  assert.deepEqual(Object.keys(tile.layers), []);
});

test('Charonne fixture keeps its canonical identity and position hash', () => {
  const fixture = getCharonneStressTestArtists();
  const hashPayload = fixture.map(({
    id,
    lng,
    lat,
    avatar_id,
    display_name,
    instrument,
    zone_id
  }) => ({
    id,
    lng,
    lat,
    avatar_id,
    display_name,
    instrument,
    zone_id
  }));
  const hash = crypto.createHash('sha256')
    .update(JSON.stringify(hashPayload))
    .digest('hex');

  assert.equal(fixture.length, 451);
  assert.equal(fixture.filter((artist) => artist.is_mock).length, 450);
  assert.equal(fixture.filter((artist) => artist.is_current_user).length, 1);
  assert.equal(hash, '3bdccf57bc7c80fbaa174d5439ad605edac5138cfffd4458165701d4edd10a9b');
});

test('normal MVT catalogue never publishes the legacy Charonne host fixture', () => {
  const normalOverlay = getGlobalCharonneOverlayArtists();
  assert.deepEqual(normalOverlay, []);
  assert.equal(normalOverlay.some((artist) => artist.id === 'current_user_fetah'), false);
});

test('live stress MVT returns all 451 canonical Charonne profiles and filter properties', {
  skip: !process.env.MEEWAV_LIVE_BASE_URL
}, async () => {
  const z = 17;
  const tileCount = 2 ** z;
  const tileCoordinates = new Map(getCharonneStressTestArtists().map((artist) => {
    const x = Math.floor(((artist.lng + 180) / 360) * tileCount);
    const radians = (artist.lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * tileCount
    );
    return [`${x}/${y}`, [x, y]];
  }));
  const ids = new Set();
  let sample = null;

  for (const [x, y] of tileCoordinates.values()) {
    const response = await fetch(
      `${process.env.MEEWAV_LIVE_BASE_URL}/musicians_clustered/${z}/${x}/${y}?stress=charonne`
    );
    assert.equal(response.status, 200);
    const tile = new VectorTile(new Pbf(Buffer.from(await response.arrayBuffer())));
    const layer = tile.layers.musicians;
    for (let index = 0; index < (layer?.length ?? 0); index += 1) {
      const properties = layer.feature(index).properties;
      ids.add(String(properties.id));
      sample ??= properties;
    }
  }

  assert.equal(ids.size, 451);
  assert.ok(ids.has('current_user_fetah'));
  for (const property of [
    'display_name',
    'avatar_id',
    'grade_level',
    'grade_tier',
    'primary_role_key',
    'role_keys_index',
    'labelPriority',
    'labelTier'
  ]) {
    assert.notEqual(sample?.[property], undefined, `missing MVT property ${property}`);
  }
});

test('live global MVT resolves a searched DB profile with city and district metadata', {
  skip: !process.env.MEEWAV_LIVE_BASE_URL
}, async () => {
  const debugResponse = await fetch(`${process.env.MEEWAV_LIVE_BASE_URL}/api/debug/avatars?limit=10`);
  const debugPayload = await debugResponse.json();
  const sourceAvatar = debugPayload.avatars.find((avatar) => !avatar.is_current_user);
  assert.ok(sourceAvatar?.display_name);

  const searchResponse = await fetch(
    `${process.env.MEEWAV_LIVE_BASE_URL}/api/avatars/search?q=${encodeURIComponent(sourceAvatar.display_name)}&limit=5`
  );
  const searchPayload = await searchResponse.json();
  const searchedAvatar = searchPayload.avatars.find((avatar) => avatar.id === sourceAvatar.id);
  assert.ok(searchedAvatar);

  const z = 18;
  const tileCount = 2 ** z;
  const x = Math.floor(((searchedAvatar.lng + 180) / 360) * tileCount);
  const radians = (searchedAvatar.lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) * tileCount
  );
  const tileResponse = await fetch(
    `${process.env.MEEWAV_LIVE_BASE_URL}/musicians_clustered/${z}/${x}/${y}`
  );
  assert.equal(tileResponse.status, 200);
  const tile = new VectorTile(new Pbf(Buffer.from(await tileResponse.arrayBuffer())));
  const layer = tile.layers.musicians;
  let properties = null;
  for (let index = 0; index < (layer?.length ?? 0); index += 1) {
    const candidate = layer.feature(index).properties;
    if (String(candidate.id) === String(sourceAvatar.id)) {
      properties = candidate;
      break;
    }
  }

  assert.ok(properties, `profile ${sourceAvatar.id} missing from its z18 tile`);
  assert.equal(properties.display_name, sourceAvatar.display_name);
  assert.equal(properties.city_id, sourceAvatar.city_id);
  assert.equal(properties.district_id, sourceAvatar.district_id);
  for (const property of [
    'avatar_id',
    'grade_level',
    'grade_tier',
    'primary_role_key',
    'role_keys_index',
    'labelPriority',
    'labelTier'
  ]) {
    assert.notEqual(properties[property], undefined, `missing global MVT property ${property}`);
  }
});

test('global catalogue does not add the 450 fixture mocks before reservation migration', () => {
  const dbRows = [
    { id: 'db-1', anchor_type: null, anchor_id: null },
    { id: 'db-2', anchor_type: 'another_anchor', anchor_id: 'other' }
  ];
  const result = buildCanonicalMockArtistRows(dbRows);

  assert.equal(result.replacementActive, false);
  assert.equal(result.reason, 'reservation_not_migrated');
  assert.deepEqual(result.rows, dbRows);
});

test('host avatar reserves its ground footprint from nearby profiles', () => {
  const host = {
    id: 'current-user',
    lng: 2.40743,
    lat: 48.85476,
    is_current_user: true,
    is_host_avatar: true
  };
  const singerUnderFoot = {
    id: 'singer-under-foot',
    lng: 2.4074756,
    lat: 48.854742,
    is_current_user: false
  };
  const visibleNeighbour = {
    id: 'visible-neighbour',
    lng: 2.4066412,
    lat: 48.854329,
    is_current_user: false
  };

  const filtered = filterArtistsOutsideHostReservation(
    [singerUnderFoot, host, visibleNeighbour],
    [host]
  );

  assert.deepEqual(filtered.map((artist) => artist.id), ['current-user', 'visible-neighbour']);
});

test('global catalogue atomically replaces exactly 450 reserved rows', () => {
  const fixtureMocks = getCharonneStressTestArtists().filter((artist) => artist.is_mock);
  const reservedRows = fixtureMocks.map((artist, index) => ({
    id: `db-reserved-${index}`,
    anchor_type: 'charonne_stress_fixture',
    anchor_id: artist.id,
    district_id: 'paris_20e_charonne',
    district_name: 'Charonne',
    parent_zone_id: 'paris_20e',
    parent_code: '20'
  }));
  const ordinaryRow = { id: 'db-ordinary', anchor_type: null, anchor_id: null };
  const result = buildCanonicalMockArtistRows([...reservedRows, ordinaryRow]);

  assert.equal(result.replacementActive, true);
  assert.equal(result.reservedCount, 450);
  assert.equal(result.rows.length, 451);
  assert.ok(result.rows.some((row) => row.id === ordinaryRow.id));
  assert.ok(fixtureMocks.every((artist) => result.rows.some((row) => row.id === artist.id)));
  assert.ok(reservedRows.every((row) => !result.rows.some((candidate) => candidate.id === row.id)));
  const replacedFixture = result.rows.find((row) => row.id === fixtureMocks[0].id);
  assert.equal(replacedFixture.zone_id, 'paris_charonne');
  assert.equal(replacedFixture.district_id, 'paris_20e_charonne');
  assert.equal(replacedFixture.parent_zone_id, 'paris_20e');
  assert.equal(replacedFixture.parent_code, '20');
});

test('partial reservation is rejected without changing the DB catalogue', () => {
  const fixtureArtist = getCharonneStressTestArtists().find((artist) => artist.is_mock);
  const dbRows = [{
    id: 'db-partial',
    anchor_type: 'charonne_stress_fixture',
    anchor_id: fixtureArtist.id
  }];
  const result = buildCanonicalMockArtistRows(dbRows);

  assert.equal(result.replacementActive, false);
  assert.equal(result.reason, 'reservation_contract_invalid');
  assert.deepEqual(result.rows, dbRows);
});

test('global DB select remains compatible before optional migrations', () => {
  const selectList = buildMockArtistSelectList(new Set([
    'id',
    'city',
    'district',
    'district_id',
    'zone_name',
    'address_label',
    'lat',
    'lng',
    'instrument',
    'avatar_id',
    'anchor_type',
    'anchor_id',
    'display_name',
    'profile_slug'
  ]));

  assert.match(selectList, /"district_id" AS "zone_id"/);
  assert.doesNotMatch(selectList, /golden_likes_count/);
  assert.doesNotMatch(selectList, /"city_id"/);
  assert.match(selectList, /"anchor_type" AS "anchor_type"/);
  assert.doesNotMatch(selectList, /WHERE\s+city/i);
});

test('Grand Paris geography derives commune parent metadata from city_id', () => {
  const geography = deriveCanonicalArtistGeography({
    city: 'Grand Paris',
    city_id: 'grand_paris_saint_denis_93066',
    city_name: 'Saint-Denis',
    district: 'Saint-Denis Nord',
    district_id: 'grand_paris_saint_denis_nord',
    district_name: 'Saint-Denis Nord'
  });

  assert.equal(geography.zone_id, 'grand_paris_saint_denis_nord');
  assert.equal(geography.commune_id, 'grand_paris_saint_denis_93066');
  assert.equal(geography.commune_name, 'Saint-Denis');
  assert.equal(geography.parent_zone_id, 'grand_paris_saint_denis_93066');
  assert.equal(geography.parent_code, '93066');
});

test('scoped hierarchy keeps Paris and Grand Paris communes disjoint', () => {
  const makeRows = ({ count, city, cityId, cityName, districtId, lng, lat }) => (
    Array.from({ length: count }, (_, index) => ({
      id: `${districtId}-${index}`,
      city,
      city_id: cityId,
      city_name: cityName,
      district: districtId,
      district_id: districtId,
      district_name: districtId,
      zone_id: districtId,
      zone_name: districtId,
      lng: lng + (index * 0.000001),
      lat: lat + (index * 0.000001)
    }))
  );
  const rows = [
    ...makeRows({
      count: 250,
      city: 'Paris',
      cityId: 'city_paris',
      cityName: 'Paris',
      districtId: 'paris_dense_quartier',
      lng: 2.35,
      lat: 48.86
    }),
    ...makeRows({
      count: 130,
      city: 'Grand Paris',
      cityId: 'grand_paris_alpha_93001',
      cityName: 'Alpha',
      districtId: 'grand_paris_alpha_leaf',
      lng: 2.45,
      lat: 48.91
    }),
    ...makeRows({
      count: 5,
      city: 'Grand Paris',
      cityId: 'grand_paris_beta_94001',
      cityName: 'Beta',
      districtId: 'grand_paris_beta_leaf',
      lng: 2.51,
      lat: 48.79
    })
  ];

  const hierarchy = buildScopedArtistHierarchy(rows);
  assert.equal(hierarchy.country.length, 3);
  assert.equal(hierarchy.country.reduce((sum, cluster) => sum + cluster.point_count, 0), rows.length);
  assert.equal(hierarchy.nano.reduce((sum, cluster) => sum + cluster.point_count, 0), rows.length);
  assert.ok(hierarchy.nano.every((cluster) => cluster.point_count <= 120));
  assert.equal(
    hierarchy.nano.filter((cluster) => cluster.zone_id === 'paris_dense_quartier').length,
    3
  );
  const grandParisMacros = hierarchy.macro.filter((cluster) => cluster.city === 'Grand Paris');
  assert.ok(grandParisMacros.length >= 2);
  assert.ok(grandParisMacros.every((cluster) => cluster.parent_cluster_id !== 'city_paris'));
  assert.deepEqual(
    new Set(grandParisMacros.map((cluster) => cluster.parent_cluster_id)),
    new Set(['grand_paris_alpha_93001', 'grand_paris_beta_94001'])
  );
});

test('scoped hierarchy IDs and counts do not depend on PostgreSQL row order', () => {
  const rows = Array.from({ length: 260 }, (_, index) => ({
    id: `stable-row-${String(index).padStart(3, '0')}`,
    city: 'Paris',
    city_id: 'city_paris',
    city_name: 'Paris',
    district: index < 130 ? 'Zone A' : 'Zone B',
    district_id: index < 130 ? 'paris_zone_a' : 'paris_zone_b',
    district_name: index < 130 ? 'Zone A' : 'Zone B',
    zone_id: index < 130 ? 'paris_zone_a' : 'paris_zone_b',
    zone_name: index < 130 ? 'Zone A' : 'Zone B',
    lng: 2.31 + ((index % 20) * 0.0001),
    lat: 48.82 + (Math.floor(index / 20) * 0.0001)
  }));
  const summarize = (hierarchy) => hierarchy.nano.map((cluster) => ({
    id: cluster.id,
    count: cluster.point_count,
    zone_id: cluster.zone_id,
    lng: cluster.lng,
    lat: cluster.lat
  }));
  const forward = buildScopedArtistHierarchy(rows.map((row) => ({ ...row })));
  const reversed = buildScopedArtistHierarchy(rows.slice().reverse().map((row) => ({ ...row })));

  assert.deepEqual(summarize(forward), summarize(reversed));
  assert.deepEqual(
    forward.country.map(({ id, point_count }) => ({ id, point_count })),
    reversed.country.map(({ id, point_count }) => ({ id, point_count }))
  );
});

test('artist facets expose exact role and grade intersections', () => {
  const avatars = [
    { id: 'voice-2', avatar_id: 'avatar_24', grade_level: 2 },
    { id: 'voice-5', avatar_id: 'avatar_24', grade_level: 5 },
    { id: 'dj-2', avatar_id: 'avatar_17', grade_level: 2 },
    { id: 'user-2', avatar_id: 'avatar_4', grade_level: 2 }
  ];
  const payload = buildArtistFacetPayload(avatars, {
    selectedRoleKeys: ['avatar_24', 'avatar_17'],
    selectedGradeLevels: [2]
  });

  assert.equal(payload.totalArtists, 4);
  assert.equal(payload.selectionLimit, 30);
  assert.equal(payload.filteredTotal, 2);
  assert.equal(payload.roleGradeCounts.avatar_24['2'], 1);
  assert.equal(payload.roleGradeCounts.avatar_24['5'], 1);
  assert.equal(payload.roleGradeCounts.avatar_17['2'], 1);
  assert.equal(payload.roleGradeCounts.avatar_4['2'], 1);

  assert.equal(buildArtistFacetPayload(Array.from({ length: 500 }, (_, index) => ({
    id: `medium-${index}`,
    avatar_id: 'avatar_25',
    grade_level: 1
  }))).selectionLimit, 10);
  assert.equal(buildArtistFacetPayload(Array.from({ length: 1500 }, (_, index) => ({
    id: `dense-${index}`,
    avatar_id: 'avatar_25',
    grade_level: 1
  }))).selectionLimit, 5);
});

test('MVT avatar payload preserves global zone metadata and golden likes', () => {
  const payload = avatarPayloadFromArtist({
    id: 'artist-1',
    lat: 48.9,
    lng: 2.4,
    avatar_id: 'avatar_3',
    city: 'Saint-Denis',
    city_id: 'grand_paris',
    district: 'grand_paris_saint_denis',
    district_id: 'grand_paris_saint_denis',
    district_name: 'Saint-Denis',
    commune_id: '93066',
    commune_name: 'Saint-Denis',
    parent_zone_id: 'grand_paris_93',
    parent_code: '93',
    zone_id: 'grand_paris_saint_denis',
    zone_name: 'Saint-Denis',
    address_label: 'Saint-Denis, Grand Paris',
    golden_likes_count: 87
  });

  assert.equal(payload.city, 'Saint-Denis');
  assert.equal(payload.city_id, 'grand_paris');
  assert.equal(payload.district, 'grand_paris_saint_denis');
  assert.equal(payload.district_id, 'grand_paris_saint_denis');
  assert.equal(payload.district_name, 'Saint-Denis');
  assert.equal(payload.commune_id, '93066');
  assert.equal(payload.parent_zone_id, 'grand_paris_93');
  assert.equal(payload.parent_code, '93');
  assert.equal(payload.zone_id, 'grand_paris_saint_denis');
  assert.equal(payload.address_label, 'Saint-Denis, Grand Paris');
  assert.equal(payload.golden_likes_count, 87);
});

test('zone aliases are generic for Paris and Grand Paris identifiers', () => {
  assert.deepEqual(getZoneLookupAliases('paris_20e_charonne'), ['paris_20e_charonne', 'charonne']);
  assert.deepEqual(
    getZoneLookupAliases('paris_19e_combat_district'),
    ['paris_19e_combat_district', 'paris_19e_combat', 'combat_district', 'combat']
  );
  assert.deepEqual(
    getZoneLookupAliases('grand_paris_saint_denis'),
    ['grand_paris_saint_denis', 'saint_denis']
  );
});

test('canonical zone ids do not widen to homonymous district labels', () => {
  const contexts = new Map([
    ['zone:paris_12e_bel_air', Uint32Array.from([0])],
    ['zone:bel_air', Uint32Array.from([0, 1])],
  ]);

  assert.deepEqual(
    resolveZoneFacetContextKeys('paris_12e_bel_air', 'Bel-Air', contexts),
    ['zone:paris_12e_bel_air']
  );
  assert.deepEqual(
    resolveZoneFacetContextKeys('', 'Bel-Air', contexts),
    ['zone:bel_air']
  );
});

test('MVT label priority and tier stay deterministic without camera state', () => {
  const artist = { id: 'artist-stable-label', render_rank: 42 };
  assert.equal(getStableArtistLabelPriority(artist), getStableArtistLabelPriority({ ...artist }));
  assert.equal(getStableArtistLabelTier(artist), getStableArtistLabelTier({ ...artist }));
  assert.ok(getStableArtistLabelTier(artist) >= 1 && getStableArtistLabelTier(artist) <= 3);
  assert.equal(getStableArtistLabelPriority({ ...artist, labelPriority: 777 }), 777);
  assert.equal(getStableArtistLabelTier({ ...artist, labelTier: 2 }), 2);
});

test('search prefix index keeps original and camel-case identity tokens', () => {
  const prefixes = getSearchPrefixKeys('Iris Brass 3E0B');
  assert.ok(prefixes.includes('iri'));
  assert.ok(prefixes.includes('bra'));
  assert.ok(prefixes.includes('3e0'));
  assert.ok(getSearchPrefixKeys('NoorVox').includes('vox'));
});

test('pre-aggregated 50k facet catalogue answers repeated combinations without rescanning', () => {
  const avatars = Array.from({ length: 50_000 }, (_, index) => ({
    id: `facet-${index}`,
    avatar_id: `avatar_${(index % 30) + 1}`,
    grade_level: (index % 6) + 1
  }));
  const buildStartedAt = performance.now();
  const aggregate = buildArtistFacetAggregate(avatars);
  const buildMs = performance.now() - buildStartedAt;
  const queryStartedAt = performance.now();
  for (let index = 0; index < 50; index += 1) {
    const payload = buildArtistFacetPayloadFromAggregate(aggregate, {
      selectedRoleKeys: ['avatar_17', 'avatar_24', 'avatar_25'],
      selectedGradeLevels: [2, 3, 5]
    });
    assert.ok(payload.filteredTotal > 0);
  }
  const queryMs = performance.now() - queryStartedAt;

  assert.ok(buildMs < 3000, `facet aggregate build took ${buildMs.toFixed(1)}ms`);
  assert.ok(queryMs < 1000, `50 facet payloads took ${queryMs.toFixed(1)}ms`);
});

test('close-view selection never truncates a dense tile', () => {
  const candidates = Array.from({ length: 750 }, (_, index) => ({
    id: `dense-${index}`,
    render_rank: 750 - index
  }));
  const selected = selectAllCloseViewArtists(candidates);
  assert.equal(selected.length, 750);
  assert.equal(selected[0].render_rank, 1);
  assert.equal(selected.at(-1).render_rank, 750);
});

test('close-view tiles keep every profile at city and avatar altitudes', () => {
  const candidates = Array.from({ length: 240 }, (_, index) => ({
    id: `avatar-${index}`,
    parent_nano_id: `leaf-${index % 12}`,
    render_rank: index,
  }));

  const z15 = __testables.selectAvatarLodForTile(candidates.map((row) => ({ ...row })), 15);
  const z17 = __testables.selectAvatarLodForTile(candidates.map((row) => ({ ...row })), 17);

  assert.equal(z15.length, 240);
  assert.equal(new Set(z15.map((row) => row.parent_nano_id)).size, 12);
  assert.equal(z17.length, 240);
});

test('union of dense district tiles keeps 100 percent of profile IDs', () => {
  const profiles = Array.from({ length: 900 }, (_, index) => ({
    id: `dense-zone-${index}`,
    lng: 2.39 + ((index % 30) * 0.0003),
    lat: 48.85 + (Math.floor(index / 30) * 0.0002),
    render_rank: index
  }));
  const z = 17;
  const tiles = new Map();
  for (const profile of profiles) {
    const tile = lngLatToTileCoord(profile.lng, profile.lat, z);
    tiles.set(`${tile.x}/${tile.y}`, tile);
  }
  const renderedIds = new Set();
  for (const tile of tiles.values()) {
    const inside = profiles.filter((profile) => isArtistInsideBounds(profile, z, tile.x, tile.y));
    for (const profile of selectAllCloseViewArtists(inside)) renderedIds.add(profile.id);
  }

  assert.equal(renderedIds.size, profiles.length);
  assert.ok(profiles.every((profile) => renderedIds.has(profile.id)));
});
