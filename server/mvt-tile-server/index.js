import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fromGeojsonVt } from '@maplibre/vt-pbf';
import { getCharonneStressTestArtists } from './charonneStressTest.js';
import { applyParisLandmarkAvatarSafetyToRecord } from './parisLandmarkAvatarSafety.js';
import {
  geographySearchPayload,
  normalizeSearchQuery,
  resolveGeographyPoint,
  SEARCH_MUSIC_ZONES_SQL,
} from './geography.js';

// Resolve directory names for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isMainModule = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;

// Load .env file from local directory or fall back to workspace root
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });
const sharedCheckoutEnv = path.resolve(__dirname, '../../../../.env.local');
if (fs.existsSync(sharedCheckoutEnv)) {
  dotenv.config({ path: sharedCheckoutEnv });
}

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool setup
const localOnlyMode = process.env.MEEWAV_MVT_LOCAL_ONLY === '1';
const connectionString = localOnlyMode
  ? undefined
  : process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!localOnlyMode && !connectionString && isMainModule) {
  console.warn("=====================================================================");
  console.warn("WARNING: DATABASE_URL or SUPABASE_DB_URL environment variable is missing!");
  console.warn("Please create a .env file inside this folder or ensure the system");
  console.warn("environment variables are set.");
  console.warn("=====================================================================");
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 3500,
  query_timeout: 12000,
  ssl: connectionString && !connectionString.includes('127.0.0.1') && !connectionString.includes('localhost')
    ? { rejectUnauthorized: false }
    : false
});

const TILE_CACHE_TTL_MS = 30_000;
const TILE_HARD_TIMEOUT_MS = 1200;
const ENCODE_MVT_IN_PROCESS = true;
const EMPTY_MVT_TILE = Buffer.from(fromGeojsonVt(
  { musicians: { features: [] } },
  { version: 2, extent: 4096 }
));
const tileCache = new Map();
const compressedMvtCache = new WeakMap();
const MVT_COMPRESSION_MIN_BYTES = 1024;

function getTileCacheKey(req) {
  const stress = req.query.stress || req.query.avatarStress || '';
  const limit = req.query.limit || '';
  return `${req.params.z}/${req.params.x}/${req.params.y}?stress=${stress}&limit=${limit}`;
}

function getCachedTile(key, ttlMs = TILE_CACHE_TTL_MS) {
  const item = tileCache.get(key);
  if (!item) return null;

  if (Date.now() - item.createdAt > ttlMs) {
    tileCache.delete(key);
    return null;
  }

  return item.buffer;
}

function setCachedTile(key, buffer) {
  tileCache.set(key, {
    createdAt: Date.now(),
    buffer,
  });

  if (tileCache.size > 512) {
    const firstKey = tileCache.keys().next().value;
    if (firstKey) tileCache.delete(firstKey);
  }
}

function setMvtHeaders(res, cacheable = true, maxAgeSeconds = 30) {
  res.setHeader('Content-Type', 'application/vnd.mapbox-vector-tile');
  if (cacheable) {
    res.setHeader('Cache-Control', `public, max-age=${maxAgeSeconds}`);
  } else {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}

function parseAcceptEncodingQuality(rawParameters) {
  const qualityParameter = rawParameters.find((parameter) => /^\s*q\s*=/i.test(parameter));
  if (!qualityParameter) return 1;

  const quality = Number(qualityParameter.replace(/^\s*q\s*=\s*/i, '').trim());
  return Number.isFinite(quality) && quality >= 0 && quality <= 1 ? quality : 0;
}

function parseAcceptEncodingPreferences(acceptEncoding) {
  const headerPresent = acceptEncoding !== undefined && acceptEncoding !== null;
  const qualities = new Map();

  if (headerPresent) {
    for (const rawEntry of String(acceptEncoding).split(',')) {
      const [rawName, ...parameters] = rawEntry.trim().toLowerCase().split(';');
      const name = rawName.trim();
      if (!name) continue;

      const quality = parseAcceptEncodingQuality(parameters);
      const previousQuality = qualities.get(name);
      // Duplicate values can be produced by merged proxy headers. Keep the
      // most permissive explicit value deterministically.
      qualities.set(name, previousQuality === undefined
        ? quality
        : Math.max(previousQuality, quality));
    }
  }

  return { headerPresent, qualities };
}

function getAcceptedEncodingQuality(preferences, encoding) {
  const { headerPresent, qualities } = preferences;

  // Keep the conservative historical behavior when no header is present.
  if (!headerPresent) return encoding === 'identity' ? 1 : 0;

  // A specific token always overrides the wildcard, including q=0.
  if (qualities.has(encoding)) return qualities.get(encoding);

  if (encoding !== 'identity') return qualities.get('*') ?? 0;

  // RFC 9110: identity is acceptable by default, except when *;q=0 rejects
  // every unspecified representation.
  if (qualities.has('*')) return qualities.get('*');

  // Implicit identity gets the lowest positive client preference. This makes
  // `gzip;q=.5` prefer gzip on a server-preference tie while preserving a
  // legal identity fallback. Explicit q=0 values alone do not reject it.
  const positiveQualities = [...qualities.values()].filter((quality) => quality > 0);
  return positiveQualities.length > 0 ? Math.min(...positiveQualities) : 1;
}

function getPreferredMvtEncodings(acceptEncoding) {
  const preferences = parseAcceptEncodingPreferences(acceptEncoding);
  const serverPreference = new Map([
    ['br', 0],
    ['gzip', 1],
    ['identity', 2],
  ]);

  return ['br', 'gzip', 'identity']
    .map((encoding) => ({
      encoding,
      quality: getAcceptedEncodingQuality(preferences, encoding),
    }))
    .filter(({ quality }) => quality > 0)
    .sort((left, right) => (
      right.quality - left.quality
      || serverPreference.get(left.encoding) - serverPreference.get(right.encoding)
    ));
}

function encodeMvtPayloadForResponse(buffer, acceptEncoding) {
  const rawBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || EMPTY_MVT_TILE);
  const preferredEncodings = getPreferredMvtEncodings(acceptEncoding);
  if (preferredEncodings.length === 0) {
    return { buffer: null, encoding: null, acceptable: false };
  }

  const identityAcceptable = preferredEncodings.some(({ encoding }) => encoding === 'identity');
  if (rawBuffer.length < MVT_COMPRESSION_MIN_BYTES && identityAcceptable) {
    return { buffer: rawBuffer, encoding: null, acceptable: true };
  }
  if (preferredEncodings[0]?.encoding === 'identity') {
    return { buffer: rawBuffer, encoding: null, acceptable: true };
  }

  let variants = compressedMvtCache.get(rawBuffer);
  if (!variants) {
    variants = {};
    compressedMvtCache.set(rawBuffer, variants);
  }

  let firstEncodedVariant = null;
  for (const { encoding } of preferredEncodings) {
    if (encoding === 'identity') {
      return { buffer: rawBuffer, encoding: null, acceptable: true };
    }

    if (encoding === 'br') {
      variants.br ??= zlib.brotliCompressSync(rawBuffer, {
        params: {
          [zlib.constants.BROTLI_PARAM_QUALITY]: 4,
        },
      });
      firstEncodedVariant ??= { buffer: variants.br, encoding: 'br', acceptable: true };
      if (variants.br.length < rawBuffer.length) {
        return { buffer: variants.br, encoding: 'br', acceptable: true };
      }
      continue;
    }

    if (encoding === 'gzip') {
      variants.gzip ??= zlib.gzipSync(rawBuffer, { level: 6 });
      firstEncodedVariant ??= { buffer: variants.gzip, encoding: 'gzip', acceptable: true };
      if (variants.gzip.length < rawBuffer.length) {
        return { buffer: variants.gzip, encoding: 'gzip', acceptable: true };
      }
    }
  }

  // If identity was rejected, an accepted encoded representation remains
  // valid even when compression grows a very small payload.
  return firstEncodedVariant ?? { buffer: null, encoding: null, acceptable: false };
}

function sendMvtPayload(req, res, buffer, statusCode = 200) {
  const payload = encodeMvtPayloadForResponse(buffer, req.headers['accept-encoding']);
  res.vary('Accept-Encoding');
  if (!payload.acceptable || !payload.buffer) {
    res.removeHeader('Content-Encoding');
    res.removeHeader('Content-Type');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(406).end();
  }
  if (payload.encoding) res.setHeader('Content-Encoding', payload.encoding);
  return res.status(statusCode).send(payload.buffer);
}

function withHardTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`tile_timeout_${ms}ms`)), ms);
    }),
  ]);
}

// Root welcome page with status and metrics
app.get('/', async (req, res) => {
  let dbStatus = localOnlyMode ? "local-memory" : "disconnected";
  if (!localOnlyMode) {
    try {
      await pool.query('SELECT 1');
      dbStatus = "connected";
    } catch (err) {
      dbStatus = `error: ${err.message}`;
    }
  }

  res.send(`
    <html>
      <head>
        <title>Meewav MVT Server</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background: #0f0c1b;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
          }
          .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 40px;
            width: 450px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            text-align: center;
          }
          h1 {
            margin-top: 0;
            background: linear-gradient(135deg, #ff007f, #7f00ff);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            font-size: 28px;
          }
          .status {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: 600;
            margin: 15px 0;
          }
          .online {
            background: rgba(46, 204, 113, 0.15);
            color: #2ecc71;
            border: 1px solid rgba(46, 204, 113, 0.3);
          }
          .offline {
            background: rgba(231, 76, 60, 0.15);
            color: #e74c3c;
            border: 1px solid rgba(231, 76, 60, 0.3);
          }
          ul {
            text-align: left;
            list-style: none;
            padding: 0;
          }
          li {
            padding: 10px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          }
          a {
            color: #ff007f;
            text-decoration: none;
          }
          a:hover {
            text-decoration: underline;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Meewav MVT Server</h1>
          <div class="status online">Service Active</div>
          <ul>
            <li><strong>Database Status:</strong> ${dbStatus === 'connected' ? '<span style="color:#2ecc71">Connected</span>' : `<span style="color:#e74c3c">${dbStatus}</span>`}</li>
            <li><strong>Port:</strong> ${PORT}</li>
            <li><strong>Health Check:</strong> <a href="/health">/health</a></li>
            <li><strong>API Endpoint:</strong> <a href="/api/musicians_api">/api/musicians_api</a></li>
            <li><strong>MVT Tile Route:</strong> <code>/musicians_clustered/{z}/{x}/{y}</code></li>
          </ul>
        </div>
      </body>
    </html>
  `);
});

// 1. Healthcheck Route
app.get('/health', async (req, res) => {
  let dbStatus = localOnlyMode ? "local-memory" : "disconnected";
  if (!localOnlyMode) {
    try {
      await pool.query('SELECT 1');
      dbStatus = "connected";
    } catch (err) {
      dbStatus = `error: ${err.message}`;
    }
  }

  res.json({
    ok: true,
    service: "meewav-mvt-server",
    database: dbStatus,
    dataReady: mockArtists.length > 0,
    avatarCount: getSearchableAvatarCount(),
    dataMode: localOnlyMode ? "deterministic-local" : "database-with-fallback"
  });
});

// 2. Parallel JSON API
app.post('/api/geography/resolve-zone', async (req, res) => {
  try {
    const result = await resolveGeographyPoint(pool, req.body);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error('Error in /api/geography/resolve-zone:', error);
    return res.status(503).json({ error: 'geography_not_ready' });
  }
});

app.get('/api/geography/search', async (req, res) => {
  try {
    const { query, limit } = normalizeSearchQuery(req.query.q, req.query.limit);
    if (query.length < 2) return res.status(400).json({ error: 'query_too_short' });
    const result = await pool.query(SEARCH_MUSIC_ZONES_SQL, [`%${query}%`, query, limit]);
    return res.json({ zones: geographySearchPayload(result.rows) });
  } catch (error) {
    console.error('Error in /api/geography/search:', error);
    return res.status(503).json({ error: 'geography_not_ready' });
  }
});

app.get('/api/musicians_api', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, instrument, latitude, longitude, grade_level, grade_stars, grade_tier, grade_color, golden_likes_count FROM musicians ORDER BY id ASC;');
    res.json(result.rows);
  } catch (err) {
    console.error('Error in /api/musicians_api:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// Debug endpoint only: small sample of raw avatars, not a viewport rendering source.
app.get('/api/debug/avatars', async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '277'), 10) || 277, 1), 5000);
    const rows = getSearchableAvatarPool()
      .sort((a, b) => {
        const rankA = Number.isFinite(Number(a.render_rank)) ? Number(a.render_rank) : 999999999;
        const rankB = Number.isFinite(Number(b.render_rank)) ? Number(b.render_rank) : 999999999;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.id).localeCompare(String(b.id));
      })
      .slice(0, limit)
      .map(avatarPayloadFromArtist);

    res.setHeader('Cache-Control', 'no-store');
    res.json({ source: 'MEMORY_DERIVED_MOCK_ARTISTS', count: rows.length, avatars: rows });
  } catch (err) {
    console.error('Error in /api/debug/avatars:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/debug/artist-grades-audit', async (req, res) => {
  try {
    const rows = await getArtistGradesAuditRows();
    const payload = {
      rows,
      updatedAt: new Date().toISOString()
    };
    console.log('[MEEWAV_ARTIST_GRADES_AUDIT]', payload);
    res.json(payload);
  } catch (err) {
    console.error('Error in /api/debug/artist-grades-audit:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/avatars/bbox', async (req, res) => {
  try {
    const parsed = parseBboxQuery(req);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || '1000'), 10) || 1000, 1),
      20000
    );

    const matchingRows = getSearchableAvatarPool()
      .filter(artist =>
        isLngLatInsideBbox(
          artist,
          parsed.minLng,
          parsed.maxLng,
          parsed.minLat,
          parsed.maxLat
        )
      )
      .map(avatarPayloadFromArtist)
      .sort((a, b) => {
        const rankA = Number.isFinite(Number(a.render_rank)) ? Number(a.render_rank) : 999999999;
        const rankB = Number.isFinite(Number(b.render_rank)) ? Number(b.render_rank) : 999999999;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.id).localeCompare(String(b.id));
      });

    const rows = matchingRows.slice(0, limit);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      source: "MEMORY_DERIVED_MOCK_ARTISTS",
      count: rows.length,
      totalCount: matchingRows.length,
      avatars: rows
    });
  } catch (err) {
    console.error('Error in /api/avatars/bbox:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/avatars/search', (req, res) => {
  try {
    const query = normalizeLookupText(req.query.q);
    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || '8'), 10) || 8, 1),
      24
    );

    if (!query) {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ query: '', count: 0, avatars: [] });
    }

    const avatars = getIndexedAvatarSearchCandidates(query)
      .map(({ avatar, compactIdentityToken }) => ({
        avatar,
        score: scoreAvatarSearchResult(avatar, query, compactIdentityToken)
      }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const rankA = Number.isFinite(Number(a.avatar.render_rank)) ? Number(a.avatar.render_rank) : 999999999;
        const rankB = Number.isFinite(Number(b.avatar.render_rank)) ? Number(b.avatar.render_rank) : 999999999;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.avatar.id).localeCompare(String(b.avatar.id));
      })
      .slice(0, limit)
      .map(({ avatar, score }) => ({
        ...avatarSearchResultPayload(avatar),
        score
      }));

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      query,
      count: avatars.length,
      avatars
    });
  } catch (err) {
    console.error('Error in /api/avatars/search:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/avatars/zone-summary', (req, res) => {
  try {
    const requestedZoneKey = normalizeLookupKey(req.query.zoneId ?? req.query.zone ?? '');
    const requestedName = normalizeLookupText(req.query.name ?? req.query.label ?? '');
    const selectedRoleKeys = parseFacetRoleKeys(req.query.roleKeys ?? req.query.roles ?? req.query.role ?? '');
    const selectedGradeLevels = parseFacetGradeLevels(req.query.gradeLevels ?? req.query.grades ?? req.query.grade ?? '');
    const cacheKey = `${requestedZoneKey}|${requestedName}|${selectedRoleKeys.join(',')}|${selectedGradeLevels.join(',')}`;
    let summary = avatarZoneSummaryCache.get(cacheKey);

    if (!summary) {
      const allAvatars = getFacetCandidateAvatars({
        requestedZoneKey,
        requestedZoneName: requestedName
      });
      const selectedRoleKeySet = new Set(selectedRoleKeys);
      const selectedGradeLevelSet = new Set(selectedGradeLevels);
      const avatars = allAvatars.filter((avatar) => (
        (selectedRoleKeySet.size === 0 || selectedRoleKeySet.has(getArtistPrimaryRoleKey(avatar)))
        && (selectedGradeLevelSet.size === 0 || selectedGradeLevelSet.has(getArtistGradeLevel(avatar)))
      ));
      const styleCounts = getAvatarStyleCounts(avatars);
      const dominantStyle = ARTIST_ROLE_DEFINITIONS
        .map((definition) => ({
          key: definition.key,
          label: definition.label,
          count: styleCounts[definition.key] || 0
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))[0] ?? null;
      summary = {
        total: avatars.length,
        rawTotal: allAvatars.length,
        iconCounts: getAvatarIconCounts(avatars),
        styleCounts,
        distinctStyleCount: Object.values(styleCounts).filter((count) => count > 0).length,
        dominantStyle,
        dominantStylePercentage: avatars.length > 0 && dominantStyle
          ? Math.round((dominantStyle.count / avatars.length) * 10000) / 100
          : 0
      };
      avatarZoneSummaryCache.set(cacheKey, summary);
      if (avatarZoneSummaryCache.size > 512) {
        avatarZoneSummaryCache.delete(avatarZoneSummaryCache.keys().next().value);
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      zone: requestedZoneKey || null,
      name: requestedName || null,
      total: summary.total,
      rawTotal: summary.rawTotal ?? summary.total,
      appliedFilters: {
        roleKeys: selectedRoleKeys,
        gradeLevels: selectedGradeLevels
      },
      iconCounts: summary.iconCounts,
      styleCounts: summary.styleCounts,
      distinctStyleCount: summary.distinctStyleCount,
      dominantStyle: summary.dominantStyle,
      dominantStylePercentage: summary.dominantStylePercentage
    });
  } catch (err) {
    console.error('Error in /api/avatars/zone-summary:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/artist-filter-facets', (req, res) => {
  try {
    const requestedCity = normalizeLookupText(req.query.cityKey ?? req.query.city ?? '');
    const requestedDistrictKey = normalizeLookupKey(req.query.districtId ?? req.query.district ?? req.query.zoneId ?? req.query.zone ?? '');
    const requestedDistrictName = normalizeLookupText(req.query.districtName ?? req.query.name ?? req.query.label ?? '');
    const selectedRoleKeys = parseFacetRoleKeys(
      req.query.roleKeys ?? req.query.roles ?? req.query.role ?? ''
    );
    const selectedGradeLevels = parseFacetGradeLevels(
      req.query.gradeLevels ?? req.query.grades ?? req.query.grade ?? ''
    );
    const aggregate = getFacetAggregateForSelection({
      requestedCity,
      requestedZoneKey: requestedDistrictKey,
      requestedZoneName: requestedDistrictName
    });
    const facets = buildArtistFacetPayloadFromAggregate(aggregate, {
      selectedRoleKeys,
      selectedGradeLevels
    });

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      ok: true,
      source: 'MEMORY_DERIVED_MOCK_ARTISTS',
      zone: requestedDistrictKey || null,
      zoneName: requestedDistrictName || null,
      city: requestedCity || null,
      ...facets
    });
  } catch (err) {
    console.error('Error in /api/artist-filter-facets:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/nano-clusters/bbox', async (req, res) => {
  try {
    const parsed = parseBboxQuery(req);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || '400'), 10) || 400, 1),
      2000
    );

    const centerLng = Number(req.query.centerLng);
    const centerLat = Number(req.query.centerLat);
    const hasCenter = Number.isFinite(centerLng) && Number.isFinite(centerLat);

    const rows = nanoClusters
      .map(clusterPayload)
      .filter(cluster =>
        cluster.cluster_level === "nano" &&
        isLngLatInsideBbox(
          cluster,
          parsed.minLng,
          parsed.maxLng,
          parsed.minLat,
          parsed.maxLat
        )
      )
      .sort((a, b) => {
        if (hasCenter) {
          const da = distanceScoreLngLat(a.lng, a.lat, centerLng, centerLat);
          const db = distanceScoreLngLat(b.lng, b.lat, centerLng, centerLat);
          if (da !== db) return da - db;
        }

        const countA = Math.abs(Number(a.point_count || 0) - 120);
        const countB = Math.abs(Number(b.point_count || 0) - 120);

        if (countA !== countB) return countA - countB;

        return String(a.id).localeCompare(String(b.id));
      })
      .slice(0, limit);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      source: "MEMORY_DERIVED_NANO_CLUSTERS",
      count: rows.length,
      clusters: rows
    });
  } catch (err) {
    console.error('Error in /api/nano-clusters/bbox:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/avatars/by-nano/:nanoId', async (req, res) => {
  try {
    const nanoId = String(req.params.nanoId || "");

    if (!nanoId) {
      return res.status(400).json({ error: "Missing nanoId" });
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || '121'), 10) || 121, 1),
      200
    );

    const cluster = nanoClusterById.get(nanoId) || null;
    const children = nanoChildrenById.get(nanoId) || [];

    const avatars = children.slice(0, limit).map(avatarPayloadFromArtist);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      source: "MEMORY_DERIVED_NANO_CHILDREN",
      nanoId,
      cluster,
      expectedPointCount: cluster?.point_count ?? null,
      childCount: children.length,
      returnedCount: avatars.length,
      avatars
    });
  } catch (err) {
    console.error('Error in /api/avatars/by-nano/:nanoId:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

app.get('/api/avatars/by-nano-ids', async (req, res) => {
  try {
    const idsParam = String(req.query.ids || "");
    const ids = idsParam
      .split(",")
      .map(id => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return res.status(400).json({ error: "Missing ids query param" });
    }

    const maxIds = Math.min(ids.length, 6);
    const safeIds = ids.slice(0, maxIds);

    const avatars = [];
    const clusters = [];

    for (const nanoId of safeIds) {
      const cluster = nanoClusterById.get(nanoId) || null;
      const children = nanoChildrenById.get(nanoId) || [];

      if (!cluster || children.length === 0) continue;

      clusters.push(cluster);

      for (const child of children) {
        avatars.push({
          ...avatarPayloadFromArtist(child),
          opened_nano_id: nanoId,
          opened_nano_point_count: cluster.point_count
        });
      }
    }

    avatars.sort((a, b) => {
      const nanoA = String(a.opened_nano_id || "");
      const nanoB = String(b.opened_nano_id || "");
      if (nanoA !== nanoB) return nanoA.localeCompare(nanoB);

      const siblingA = Number.isFinite(Number(a.sibling_index))
        ? Number(a.sibling_index)
        : 999999;
      const siblingB = Number.isFinite(Number(b.sibling_index))
        ? Number(b.sibling_index)
        : 999999;

      if (siblingA !== siblingB) return siblingA - siblingB;

      return String(a.id).localeCompare(String(b.id));
    });

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "MEMORY_DERIVED_OPENED_NANO_CLUSTERS",
      requestedNanoIds: ids,
      openedNanoIds: clusters.map(c => c.id),
      openedNanoCount: clusters.length,
      returnedCount: avatars.length,
      clusters,
      avatars
    });
  } catch (err) {
    console.error("Error in /api/avatars/by-nano-ids:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get('/api/avatar-packs/bbox', async (req, res) => {
  try {
    const parsed = parseBboxQuery(req);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const cols = Math.min(Math.max(parseInt(String(req.query.cols || '6'), 10) || 6, 1), 20);
    const rows = Math.min(Math.max(parseInt(String(req.query.rows || '4'), 10) || 4, 1), 20);
    const packSize = Math.min(Math.max(parseInt(String(req.query.packSize || '5'), 10) || 5, 1), 10);
    const maxAvatars = Math.min(Math.max(parseInt(String(req.query.maxAvatars || '120'), 10) || 120, 1), 300);

    const cells = new Map();

    for (const artist of mockArtists) {
      if (!isLngLatInsideBbox(artist, parsed.minLng, parsed.maxLng, parsed.minLat, parsed.maxLat)) {
        continue;
      }

      const col = Math.floor(((artist.lng - parsed.minLng) / (parsed.maxLng - parsed.minLng)) * cols);
      const row = Math.floor(((artist.lat - parsed.minLat) / (parsed.maxLat - parsed.minLat)) * rows);

      const safeCol = Math.max(0, Math.min(cols - 1, col));
      const safeRow = Math.max(0, Math.min(rows - 1, row));
      const cellId = `${safeRow}:${safeCol}`;

      if (!cells.has(cellId)) cells.set(cellId, []);
      cells.get(cellId).push(avatarPayloadFromArtist(artist));
    }

    const packs = [];
    let total = 0;

    const sortedCells = [...cells.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [cellId, cellArtists] of sortedCells) {
      if (total >= maxAvatars) break;

      const selected = cellArtists
        .sort((a, b) => {
          const rankA = Number(a.render_rank ?? 999999);
          const rankB = Number(b.render_rank ?? 999999);
          if (rankA !== rankB) return rankA - rankB;
          return String(a.id).localeCompare(String(b.id));
        })
        .slice(0, packSize);

      if (selected.length === 0) continue;

      const anchorLng = selected.reduce((sum, a) => sum + Number(a.lng), 0) / selected.length;
      const anchorLat = selected.reduce((sum, a) => sum + Number(a.lat), 0) / selected.length;

      packs.push({
        packId: `pack_${cellId}`,
        cellId,
        anchorLng,
        anchorLat,
        count: selected.length,
        avatars: selected
      });

      total += selected.length;
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({
      source: "MEMORY_DERIVED_AVATAR_PACKS",
      cols,
      rows,
      packSize,
      maxAvatars,
      returnedPackCount: packs.length,
      returnedAvatarCount: total,
      packs
    });
  } catch (err) {
    console.error("Error in /api/avatar-packs/bbox:", err);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});

app.get('/api/avatars/distributed-by-nanos/bbox', async (req, res) => {
  try {
    const parsed = parseBboxQuery(req);

    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }

    const limit = Math.min(
      Math.max(parseInt(String(req.query.limit || '120'), 10) || 120, 1),
      120
    );

    const maxPerNano = Math.min(
      Math.max(parseInt(String(req.query.maxPerNano || '2'), 10) || 2, 1),
      4
    );

    const centerLng = Number(req.query.centerLng);
    const centerLat = Number(req.query.centerLat);
    const hasCenter = Number.isFinite(centerLng) && Number.isFinite(centerLat);

    const visibleNanoClusters = nanoClusters
      .map(clusterPayload)
      .filter(cluster =>
        cluster.cluster_level === "nano" &&
        isLngLatInsideBbox(
          cluster,
          parsed.minLng,
          parsed.maxLng,
          parsed.minLat,
          parsed.maxLat
        )
      )
      .sort((a, b) => {
        if (hasCenter) {
          const da = distanceScoreLngLat(a.lng, a.lat, centerLng, centerLat);
          const db = distanceScoreLngLat(b.lng, b.lat, centerLng, centerLat);
          if (da !== db) return da - db;
        }

        return String(a.id).localeCompare(String(b.id));
      });

    const selected = [];
    const usedNanoIds = new Set();

    // Pass 1: one representative per visible nano cluster.
    for (const cluster of visibleNanoClusters) {
      if (selected.length >= limit) break;

      const children = nanoChildrenById.get(cluster.id) || [];
      if (children.length === 0) continue;

      const child = children[0];
      selected.push({
        ...avatarPayloadFromArtist(child),
        representative_of_nano: cluster.id,
        representative_mode: "primary"
      });

      usedNanoIds.add(cluster.id);
    }

    // Pass 2: fill remaining slots with second/third representatives, still distributed.
    for (let slot = 1; slot < maxPerNano; slot++) {
      if (selected.length >= limit) break;

      for (const cluster of visibleNanoClusters) {
        if (selected.length >= limit) break;

        const children = nanoChildrenById.get(cluster.id) || [];
        const child = children[slot];

        if (!child) continue;

        selected.push({
          ...avatarPayloadFromArtist(child),
          representative_of_nano: cluster.id,
          representative_mode: `secondary_${slot}`
        });

        usedNanoIds.add(cluster.id);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      source: "MEMORY_DERIVED_DISTRIBUTED_NANO_REPRESENTATIVES",
      visibleNanoClustersCount: visibleNanoClusters.length,
      usedNanoClustersCount: usedNanoIds.size,
      maxPerNano,
      requestedLimit: limit,
      returnedCount: selected.length,
      avatars: selected
    });
  } catch (err) {
    console.error('Error in /api/avatars/distributed-by-nanos/bbox:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});


// Helper functions for Web Mercator and tile pixel projections
function lngLatToTilePixels(lng, lat, z, tx, ty, extent = 4096) {
  const x = (lng + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;

  const numTiles = Math.pow(2, z);
  const worldX = x * numTiles;
  const worldY = y * numTiles;

  const tileX = (worldX - tx) * extent;
  const tileY = (worldY - ty) * extent;

  return { x: tileX, y: tileY };
}

function lngLatToTileCoord(lng, lat, z) {
  const x = (lng + 180) / 360;
  const latRad = (lat * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2;
  const numTiles = Math.pow(2, z);

  return {
    x: Math.floor(x * numTiles),
    y: Math.floor(y * numTiles)
  };
}

function getAvatarTileIndex(z) {
  const indexZoom = Math.max(
    AVATAR_TILE_INDEX_MIN_ZOOM,
    Math.min(AVATAR_TILE_INDEX_MAX_ZOOM, Math.floor(z))
  );

  if (avatarTileIndexByZoom.has(indexZoom)) {
    return avatarTileIndexByZoom.get(indexZoom);
  }

  const index = new Map();
  const indexArtist = (artist) => {
    const lng = Number(artist.lng);
    const lat = Number(artist.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;

    const coord = lngLatToTileCoord(lng, lat, indexZoom);
    const key = `${coord.x}/${coord.y}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(artist);
  };

  mockArtists.forEach(indexArtist);
  realProfileArtists.forEach(indexArtist);

  for (const artists of index.values()) {
    artists.sort((a, b) => getGlobalAvatarRank(a) - getGlobalAvatarRank(b));
  }

  avatarTileIndexByZoom.set(indexZoom, index);
  console.log("[MVT AVATAR TILE INDEX] rebuilt", {
    zoom: indexZoom,
    tiles: index.size,
    avatars: mockArtists.length + realProfileArtists.length,
    realProfiles: realProfileArtists.length
  });

  return index;
}

function getIndexedArtistsForTile(z, x, y) {
  const indexZoom = Math.max(
    AVATAR_TILE_INDEX_MIN_ZOOM,
    Math.min(AVATAR_TILE_INDEX_MAX_ZOOM, Math.floor(z))
  );
  const scale = Math.pow(2, Math.floor(z) - indexZoom);
  const lookupX = scale >= 1 ? Math.floor(x / scale) : x;
  const lookupY = scale >= 1 ? Math.floor(y / scale) : y;
  const index = getAvatarTileIndex(indexZoom);
  const candidates = [];
  const seen = new Set();

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      const bucket = index.get(`${lookupX + dx}/${lookupY + dy}`);
      if (!bucket) continue;

      for (const artist of bucket) {
        const id = String(artist.id);
        if (seen.has(id)) continue;
        seen.add(id);
        candidates.push(artist);
      }
    }
  }

  return candidates;
}

function tilePixelsToLngLat(px, py, z, tx, ty, extent = 4096) {
  const numTiles = Math.pow(2, z);
  const worldX = tx + px / extent;
  const worldY = ty + py / extent;

  const x = worldX / numTiles;
  const y = worldY / numTiles;

  const lng = x * 360 - 180;
  const n = Math.PI - 2 * Math.PI * y;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lng: parseFloat(lng.toFixed(6)), lat: parseFloat(lat.toFixed(6)) };
}

// Helper for calculating real-world distance in meters
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Group musicians within a threshold of maxDistanceMeters
function groupMusiciansByProximity(musicians, maxDistanceMeters = 5.0) {
  const groups = [];
  const visited = new Set();

  for (let i = 0; i < musicians.length; i++) {
    if (visited.has(i)) continue;

    const group = [musicians[i]];
    visited.add(i);

    const queue = [i];
    while (queue.length > 0) {
      const currIdx = queue.shift();
      const curr = musicians[currIdx];

      for (let j = 0; j < musicians.length; j++) {
        if (visited.has(j)) continue;

        const other = musicians[j];
        const dist = getDistanceMeters(curr.lat, curr.lng, other.lat, other.lng);
        if (dist <= maxDistanceMeters) {
          visited.add(j);
          group.push(other);
          queue.push(j);
        }
      }
    }
    groups.push(group);
  }
  return groups;
}

// Calculate visual offset radius in pixels based on zoom
function getSpiderfyRadius(z) {
  if (z <= 13) return 0; // No spiderfy at lower zooms
  if (z === 14) return 36;
  if (z === 15) return 48;
  if (z === 16) return 60;
  return 72; // z >= 17
}

// Touched to reload the database records

const MEEWAV_MACRO_COUNT_TEST_MODE = false;
const MEEWAV_MOCK_HIERARCHY_50K_MODE = false;

function formatCompactCount(value) {
  if (value >= 1000000) return `${Math.round(value / 1000000)}M`;
  if (value >= 10000) return `${Math.round(value / 1000)}K`;
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `${k.toFixed(0)}K` : `${k.toFixed(1)}K`;
  }
  return String(value);
}

// Rebuilt from the canonical Paris city + Grand Paris commune scopes at startup.
const COUNTRY_CITIES = [];

const macroClusters = [];
const midClusters = [];
const localClusters = [];
const microClusters = [];
const nanoClusters = [];
const mockArtists = [];

const nanoClusterById = new Map();
const nanoChildrenById = new Map();
const AVATAR_TILE_INDEX_MIN_ZOOM = 15;
// Higher zooms can reuse their z17 parent bucket and filter by exact tile
// bounds. Materializing z18-z22 indexes duplicated 200k references several
// times and pushed local startup near 700 MB RSS.
const AVATAR_TILE_INDEX_MAX_ZOOM = 17;
const avatarTileIndexByZoom = new Map();
let lastMockTileStats = null;
let startupProfile = {};
let realProfileArtists = [];
let realProfileCatalogueSignature = '';
let searchableExtraAvatars = [];
let avatarSearchIdentityTokens = [];
let avatarSearchPrefixIndex = new Map();
let avatarFacetContextIndex = new Map();
let avatarFacetAggregateIndex = new Map();
const avatarFacetSelectionCache = new Map();
const avatarZoneSummaryCache = new Map();
const zoneLookupAliasCache = new Map();
const avatarCityKeyCache = new Map();
const CHARONNE_RESERVED_ANCHOR_TYPE = 'charonne_stress_fixture';
const HOST_AVATAR_RESERVED_RADIUS_METERS = 20;
const REAL_PROFILE_REFRESH_INTERVAL_MS = 10_000;
let charonneFixtureReplacementActive = false;
let globalCharonneFixtureById = new Map();

function getCharonneFixturePartition() {
  const artists = getCharonneStressTestArtists();
  const mocks = artists.filter((artist) => artist.is_mock === true);
  const currentUsers = artists.filter((artist) => artist.is_current_user === true);

  if (mocks.length !== 450 || currentUsers.length !== 1) {
    throw new Error(
      `Invalid Charonne fixture partition: mocks=${mocks.length}, currentUsers=${currentUsers.length}`
    );
  }

  return { artists, mocks, currentUsers };
}

function buildCanonicalMockArtistRows(dbRows) {
  const { mocks } = getCharonneFixturePartition();
  const fixtureById = new Map(mocks.map((artist) => [String(artist.id), artist]));
  const reservedRows = dbRows.filter(
    (row) => normalizeLookupKey(row.anchor_type) === CHARONNE_RESERVED_ANCHOR_TYPE
  );

  // Compatibility before the dispatcher migration: the explicit stress route remains
  // available, but the normal global catalogue must not gain 450 extra profiles.
  if (reservedRows.length === 0) {
    return {
      rows: dbRows,
      replacementActive: false,
      reservedCount: 0,
      reason: 'reservation_not_migrated'
    };
  }

  const reservedAnchorIds = reservedRows.map((row) => String(row.anchor_id ?? '').trim());
  const uniqueReservedAnchorIds = new Set(reservedAnchorIds.filter(Boolean));
  const missingFixtureIds = Array.from(fixtureById.keys())
    .filter((fixtureId) => !uniqueReservedAnchorIds.has(fixtureId));
  const unexpectedAnchorIds = Array.from(uniqueReservedAnchorIds)
    .filter((anchorId) => !fixtureById.has(anchorId));
  const replacementIsExact = reservedRows.length === 450 &&
    uniqueReservedAnchorIds.size === 450 &&
    missingFixtureIds.length === 0 &&
    unexpectedAnchorIds.length === 0;

  if (!replacementIsExact) {
    return {
      rows: dbRows,
      replacementActive: false,
      reservedCount: reservedRows.length,
      reason: 'reservation_contract_invalid',
      missingFixtureIds,
      unexpectedAnchorIds
    };
  }

  const canonicalById = new Map();
  const reservedRowByAnchorId = new Map(
    reservedRows.map((row) => [String(row.anchor_id), row])
  );
  for (const row of dbRows) {
    if (normalizeLookupKey(row.anchor_type) === CHARONNE_RESERVED_ANCHOR_TYPE) continue;
    canonicalById.set(String(row.id), row);
  }
  for (const fixtureArtist of mocks) {
    const reservedRow = reservedRowByAnchorId.get(String(fixtureArtist.id)) ?? {};
    canonicalById.set(String(fixtureArtist.id), {
      ...reservedRow,
      ...fixtureArtist,
      anchor_type: CHARONNE_RESERVED_ANCHOR_TYPE,
      anchor_id: String(fixtureArtist.id)
    });
  }

  return {
    rows: Array.from(canonicalById.values()),
    replacementActive: true,
    reservedCount: reservedRows.length,
    reason: 'fixture_replaced'
  };
}

function getGlobalCharonneOverlayArtists() {
  const { artists, mocks } = getCharonneFixturePartition();
  // The local catalogue has no authenticated profile projection. Preserve the
  // historical demo owner at the centre of Charonne so "Ma position" never
  // opens a neighbourhood without its Host.
  if (localOnlyMode) return artists;
  // `current_user_fetah` is a legacy stress-test owner. The real/local owner is
  // now rendered by the authenticated onboarding overlay, so publishing the
  // fixture owner in the normal catalogue creates two hosts in Charonne.
  if (!charonneFixtureReplacementActive) return [];

  const hydratedMocks = mocks.map((fixtureArtist) => ({
    ...(globalCharonneFixtureById.get(String(fixtureArtist.id)) ?? {}),
    ...fixtureArtist
  }));
  return hydratedMocks;
}

function filterArtistsOutsideHostReservation(artists, hostArtists, radiusMeters = HOST_AVATAR_RESERVED_RADIUS_METERS) {
  const hosts = hostArtists.filter((artist) => (
    (artist.is_current_user === true || artist.is_host_avatar === true) &&
    Number.isFinite(Number(artist.lng)) &&
    Number.isFinite(Number(artist.lat))
  ));

  if (hosts.length === 0 || radiusMeters <= 0) return artists;

  return artists.filter((artist) => {
    if (artist.is_current_user === true || artist.is_host_avatar === true) return true;
    if (!Number.isFinite(Number(artist.lng)) || !Number.isFinite(Number(artist.lat))) return true;

    return hosts.every((host) => getDistanceMeters(
      Number(artist.lat),
      Number(artist.lng),
      Number(host.lat),
      Number(host.lng)
    ) >= radiusMeters);
  });
}

function avatarPayloadFromArtist(artist) {
  const gradeLevel = getArtistGradeLevel(artist);
  const gradeStars = getArtistGradeStars(artist);
  const primaryRoleKey = getArtistPrimaryRoleKey(artist);
  const primaryRoleLabel = getArtistPrimaryRoleLabel(artist);
  const geography = deriveCanonicalArtistGeography(artist);

  return {
    id: String(artist.id),
    instrument: artist.instrument,
    lat: Number(artist.lat),
    lng: Number(artist.lng),
    avatar_icon_id: artist.avatar_icon_id ?? artist.avatar_id,
    avatar_id: artist.avatar_id,
    render_rank: artist.render_rank,
    identity_seed: artist.identity_seed ?? null,
    anchor_type: artist.anchor_type ?? null,
    anchor_id: artist.anchor_id ?? null,
    address_id: artist.address_id,
    address_label: artist.address_label,
    display_name: getPublicAvatarDisplayName(artist),
    profile_slug: artist.profile_slug,
    artist_rank: artist.artist_rank,
    rank_score: artist.rank_score,
    grade_level: gradeLevel,
    grade_stars: gradeStars,
    grade_tier: artist.grade_tier ?? getArtistGradeTier(gradeLevel),
    grade_color: artist.grade_color ?? '#8B5CF6',
    golden_likes_count: getStableFallbackGoldenLikesCount(artist),
    is_current_user: artist.is_current_user ?? false,
    is_host_avatar: artist.is_host_avatar ?? false,
    is_mock: artist.is_mock ?? true,
    size_scale: artist.size_scale ?? 1,
    city: geography.city,
    city_id: geography.city_id,
    city_name: geography.city_name,
    district: geography.district,
    district_id: geography.district_id,
    district_name: geography.district_name,
    commune_id: geography.commune_id,
    commune_name: geography.commune_name,
    parent_zone_id: geography.parent_zone_id,
    parent_code: geography.parent_code,
    zone_id: geography.zone_id,
    zone_name: geography.zone_name,
    handle: artist.handle ?? null,
    primary_role_key: primaryRoleKey,
    primary_role_label: primaryRoleLabel,
    role_keys_index: getArtistRoleKeysIndex(artist),
    main_role: artist.main_role ?? null,
    secondary_roles: artist.secondary_roles ?? null,
    music_genres: artist.music_genres ?? null,

    sector_id: artist.sector_id ?? artist.parent_nano_id ?? artist.parent_cluster_id ?? null,
    leaf_id: artist.leaf_id ?? artist.parent_nano_id ?? artist.parent_cluster_id ?? null,
    parent_cluster_id: artist.parent_cluster_id ?? artist.parent_nano_id ?? null,
    parent_count: artist.parent_count ?? null,
    parent_nano_id: artist.parent_nano_id ?? artist.parent_cluster_id ?? null,
    parent_micro_id: artist.parent_micro_id ?? null,
    parent_local_id: artist.parent_local_id ?? null,
    parent_mid_id: artist.parent_mid_id ?? null,
    parent_macro_id: artist.parent_macro_id ?? null,
    sibling_count: artist.sibling_count ?? null,
    sibling_index: artist.sibling_index ?? null
  };
}

function clusterPayload(cluster) {
  return {
    id: String(cluster.id),
    cluster_id: String(cluster.cluster_id ?? cluster.id),
    cluster_level: cluster.cluster_level,
    point_count: Number(cluster.point_count ?? 0),
    real_count: Number(cluster.real_count ?? cluster.point_count ?? 0),
    display_count: Number(cluster.display_count ?? cluster.point_count ?? 0),
    display_count_text: cluster.display_count_text ?? formatCompactCount(Number(cluster.point_count ?? 0)),
    sector_id: cluster.sector_id ?? cluster.cluster_id ?? cluster.id ?? null,
    leaf_id: cluster.leaf_id ?? cluster.cluster_id ?? cluster.id ?? null,
    city: cluster.city ?? null,
    city_id: cluster.city_id ?? null,
    city_name: cluster.city_name ?? null,
    commune_id: cluster.commune_id ?? null,
    commune_name: cluster.commune_name ?? null,
    parent_zone_id: cluster.parent_zone_id ?? null,
    parent_code: cluster.parent_code ?? null,
    zone_id: cluster.zone_id ?? null,
    zone_name: cluster.zone_name ?? null,
    district_id: cluster.district_id ?? null,
    district_name: cluster.district_name ?? null,
    lng: Number(cluster.lng),
    lat: Number(cluster.lat),
    parent_cluster_id: cluster.parent_cluster_id ?? null,
    parent_nano_id: cluster.parent_nano_id ?? null,
    parent_micro_id: cluster.parent_micro_id ?? null,
    parent_local_id: cluster.parent_local_id ?? null,
    parent_mid_id: cluster.parent_mid_id ?? null,
    parent_macro_id: cluster.parent_macro_id ?? null
  };
}

function rebuildSearchableExtraAvatars() {
  const knownIds = new Set(mockArtists.map((artist) => String(artist.id)));
  const extrasById = new Map();

  for (const artist of [...realProfileArtists, ...getGlobalCharonneOverlayArtists()]) {
    const id = String(artist.id);
    if (!knownIds.has(id)) extrasById.set(id, artist);
  }

  searchableExtraAvatars = Array.from(extrasById.values());
}

function rebuildNanoIndexes() {
  const indexStartedAt = performance.now();
  nanoClusterById.clear();
  nanoChildrenById.clear();
  avatarTileIndexByZoom.clear();
  avatarSearchPrefixIndex = new Map();
  avatarFacetContextIndex = new Map();
  avatarFacetAggregateIndex = new Map();
  avatarFacetSelectionCache.clear();
  avatarZoneSummaryCache.clear();
  zoneLookupAliasCache.clear();
  avatarCityKeyCache.clear();

  for (const cluster of nanoClusters) {
    nanoClusterById.set(String(cluster.id), clusterPayload(cluster));
  }

  for (const artist of [...mockArtists, ...getGlobalCharonneOverlayArtists()]) {
    const nanoId = String(artist.parent_nano_id ?? artist.parent_cluster_id ?? "");
    if (!nanoId) continue;

    if (!nanoChildrenById.has(nanoId)) {
      nanoChildrenById.set(nanoId, []);
    }

    nanoChildrenById.get(nanoId).push(artist);
  }

  rebuildSearchableExtraAvatars();

  const catalogueBuiltAt = performance.now();
  rebuildAvatarQueryIndexes();
  const queryIndexesBuiltAt = performance.now();

  for (const children of nanoChildrenById.values()) {
    children.sort((a, b) => {
      const siblingA = Number.isFinite(Number(a.sibling_index)) ? Number(a.sibling_index) : 999999;
      const siblingB = Number.isFinite(Number(b.sibling_index)) ? Number(b.sibling_index) : 999999;

      if (siblingA !== siblingB) return siblingA - siblingB;

      const rankA = Number.isFinite(Number(a.render_rank)) ? Number(a.render_rank) : 999999999;
      const rankB = Number.isFinite(Number(b.render_rank)) ? Number(b.render_rank) : 999999999;

      if (rankA !== rankB) return rankA - rankB;

      return String(a.id).localeCompare(String(b.id));
    });
  }

  console.log("[NANO INDEX] rebuilt", {
    nanoClusters: nanoClusterById.size,
    nanoChildrenGroups: nanoChildrenById.size
  });
  const nanoChildrenSortedAt = performance.now();

  for (const zoom of [15, 16, 17]) {
    getAvatarTileIndex(zoom);
  }
  const tileIndexesBuiltAt = performance.now();
  startupProfile = {
    ...startupProfile,
    nanoCatalogueMs: Math.round((catalogueBuiltAt - indexStartedAt) * 10) / 10,
    searchFacetIndexesMs: Math.round((queryIndexesBuiltAt - catalogueBuiltAt) * 10) / 10,
    nanoChildrenSortMs: Math.round((nanoChildrenSortedAt - queryIndexesBuiltAt) * 10) / 10,
    tileIndexesMs: Math.round((tileIndexesBuiltAt - nanoChildrenSortedAt) * 10) / 10,
    indexesTotalMs: Math.round((tileIndexesBuiltAt - indexStartedAt) * 10) / 10
  };
}

function isLngLatInsideBbox(item, minLng, maxLng, minLat, maxLat) {
  const lng = Number(item.lng);
  const lat = Number(item.lat);

  return (
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= minLng &&
    lng <= maxLng &&
    lat >= minLat &&
    lat <= maxLat
  );
}

function parseBboxQuery(req) {
  const { west, south, east, north } = req.query;

  if (west === undefined || south === undefined || east === undefined || north === undefined) {
    return {
      error: "Missing bbox query params: west, south, east, north"
    };
  }

  const w = parseFloat(String(west));
  const s = parseFloat(String(south));
  const e = parseFloat(String(east));
  const n = parseFloat(String(north));

  if (![w, s, e, n].every(Number.isFinite)) {
    return {
      error: "Invalid bbox query params"
    };
  }

  return {
    minLng: Math.min(w, e),
    maxLng: Math.max(w, e),
    minLat: Math.min(s, n),
    maxLat: Math.max(s, n)
  };
}

function distanceScoreLngLat(aLng, aLat, bLng, bLat) {
  const lngScale = Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
  const dx = (aLng - bLng) * lngScale * 111320;
  const dy = (aLat - bLat) * 110540;
  return Math.hypot(dx, dy);
}

function normalizeLookupText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLookupKey(value) {
  return normalizeLookupText(value).replace(/\s+/g, '_');
}

function getPublicAvatarDisplayName(avatar) {
  const displayName = String(avatar?.display_name ?? '').trim();
  if (!displayName) return null;

  const identityPrefix = String(avatar?.identity_seed ?? '')
    .trim()
    .slice(0, 4)
    .toUpperCase();
  const technicalSuffix = displayName.match(/\s+([A-F0-9]{4})$/i);

  if (
    avatar?.is_mock !== false &&
    identityPrefix.length === 4 &&
    technicalSuffix?.[1]?.toUpperCase() === identityPrefix
  ) {
    return displayName.slice(0, technicalSuffix.index).trim() || displayName;
  }

  return displayName;
}

const ARTIST_ROLE_DEFINITIONS = [
  { key: 'avatar_1', label: 'Violoniste', tokens: ['avatar_1', 'instr_cordes', 'violon', 'violoniste', 'cordes'] },
  { key: 'avatar_2', label: 'Vidéaste clipper', tokens: ['avatar_2', 'clipper', 'clippeur', 'videaste', 'videaste_clipper'] },
  { key: 'avatar_3', label: 'Utilisatrice', tokens: ['avatar_3', 'user_f', 'utilisatrice'] },
  { key: 'avatar_4', label: 'Utilisateur', tokens: ['avatar_4', 'user', 'utilisateur', 'fan', 'auditeur'] },
  { key: 'avatar_5', label: 'Studio', tokens: ['avatar_5', 'studio', 'studio_enregistrement'] },
  { key: 'avatar_6', label: 'Sound designer', tokens: ['avatar_6', 'synthetiseur', 'synth', 'clavier', 'clavieriste', 'sound_designer'] },
  { key: 'avatar_7', label: 'Pianiste', tokens: ['avatar_7', 'pianiste', 'piano'] },
  { key: 'avatar_8', label: 'Percussionniste', tokens: ['avatar_8', 'percussion', 'percussionniste'] },
  { key: 'avatar_9', label: 'Organisation scénique', tokens: ['avatar_9', 'orga_event', 'organisation_scenique', 'organisateur'] },
  { key: 'avatar_10', label: 'Management', tokens: ['avatar_10', 'manager', 'management', 'booker'] },
  { key: 'avatar_11', label: 'Label', tokens: ['avatar_11', 'label'] },
  { key: 'avatar_12', label: 'Cuivres', tokens: ['avatar_12', 'instr_cuivre', 'cuivre', 'saxo', 'trompettiste'] },
  { key: 'avatar_13', label: 'Instruments à vent', tokens: ['avatar_13', 'instr_vent', 'vent'] },
  { key: 'avatar_14', label: 'Ingénieur du son', tokens: ['avatar_14', 'inge_son', 'ingenieur_son', 'ing_son', 'sound_engineer'] },
  { key: 'avatar_15', label: 'Guitariste électrique', tokens: ['avatar_15', 'guitare_elec', 'guitariste_electrique'] },
  { key: 'avatar_16', label: 'Guitariste acoustique', tokens: ['avatar_16', 'guitariste', 'guitare', 'guitarist'] },
  { key: 'avatar_17', label: 'DJ', tokens: ['avatar_17', 'dj', 'deejay', 'disc_jockey'] },
  { key: 'avatar_18', label: 'Direction artistique', tokens: ['avatar_18', 'direction_artistique', 'artistic_direction'] },
  { key: 'avatar_19', label: 'Danseuse', tokens: ['avatar_19', 'danseuse'] },
  { key: 'avatar_20', label: 'Danseur', tokens: ['avatar_20', 'danseur', 'danseurs', 'dance'] },
  { key: 'avatar_21', label: 'Compositeur', tokens: ['avatar_21', 'compositeur', 'composer'] },
  { key: 'avatar_22', label: 'Coach vocal', tokens: ['avatar_22', 'coach_vocal', 'coatch_vocal', 'vocal_coach'] },
  { key: 'avatar_23', label: 'Chanteuse / rappeuse', tokens: ['avatar_23', 'chanteuse', 'chanteuse_rappeuse', 'rappeuse'] },
  { key: 'avatar_24', label: 'Chanteur / rappeur', tokens: ['avatar_24', 'chanteur', 'chanteur_rappeur', 'rappeur', 'micro', 'microphone', 'vox', 'voice', 'vocal'] },
  { key: 'avatar_25', label: 'Beatmaker', tokens: ['avatar_25', 'beatmaker', 'producteur', 'producer'] },
  { key: 'avatar_26', label: 'Beatboxer', tokens: ['avatar_26', 'beatboxer', 'beatbox'] },
  { key: 'avatar_27', label: 'Batteur / batteuse', tokens: ['avatar_27', 'batteur', 'batteuse', 'drummer'] },
  { key: 'avatar_28', label: 'Bassiste', tokens: ['avatar_28', 'bassiste', 'basse'] },
  { key: 'avatar_29', label: 'Auteur / parolier', tokens: ['avatar_29', 'auteur', 'parolier', 'songwriter', 'lyrics'] },
  { key: 'avatar_30', label: 'Accordéoniste', tokens: ['avatar_30', 'accordeon', 'accordeoniste'] }
];

const ARTIST_ROLE_DEFINITION_BY_KEY = new Map(
  ARTIST_ROLE_DEFINITIONS.map((definition) => [definition.key, definition])
);
const ARTIST_ROLE_INDEX_BY_KEY = new Map(
  ARTIST_ROLE_DEFINITIONS.map((definition, index) => [definition.key, index])
);

function getArtistRoleSearchBlob(artist) {
  return normalizeLookupKey([
    artist?.primary_role_key,
    artist?.role_key,
    artist?.main_role,
    artist?.primary_role_label,
    artist?.instrument,
    artist?.artist_rank,
    artist?.avatar_icon_id,
    artist?.avatar_id,
    artist?.display_name,
    artist?.profile_slug,
    artist?.handle,
  ].filter(Boolean).join(' '));
}

function getArtistExplicitAvatarRoleKey(artist) {
  const raw = artist?.avatar_icon_id ??
    artist?.avatarIconId ??
    artist?.avatar_id ??
    artist?.avatarId ??
    artist?.avatar_icon ??
    artist?.avatarIcon ??
    artist?.cluster_avatar_id ??
    artist?.icon_id ??
    artist?.iconId ??
    artist?.icon;

  const normalized = normalizeLookupKey(raw);
  if (/^avatar_([1-9]|[12][0-9]|30)$/.test(normalized)) return normalized;
  if (/^([1-9]|[12][0-9]|30)$/.test(normalized)) return `avatar_${normalized}`;
  return null;
}

function getArtistPrimaryRoleKey(artist) {
  const explicitAvatarKey = getArtistExplicitAvatarRoleKey(artist);
  if (explicitAvatarKey && ARTIST_ROLE_DEFINITION_BY_KEY.has(explicitAvatarKey)) return explicitAvatarKey;

  const explicitKey = normalizeLookupKey(artist?.primary_role_key ?? artist?.role_key);
  if (explicitKey && ARTIST_ROLE_DEFINITION_BY_KEY.has(explicitKey)) return explicitKey;

  const roleBlob = getArtistRoleSearchBlob(artist);
  for (const definition of ARTIST_ROLE_DEFINITIONS) {
    if (definition.tokens.some((token) => roleBlob.includes(normalizeLookupKey(token)))) {
      return definition.key;
    }
  }

  return explicitKey || 'artist';
}

function getArtistPrimaryRoleLabel(artist) {
  const key = getArtistPrimaryRoleKey(artist);
  const definition = ARTIST_ROLE_DEFINITION_BY_KEY.get(key);
  if (definition) return definition.label;

  const label = artist?.primary_role_label ?? artist?.main_role ?? artist?.instrument ?? artist?.artist_rank;
  return label ? String(label) : 'Artiste';
}

function getArtistRoleKeysIndex(artist) {
  const keys = new Set([getArtistPrimaryRoleKey(artist)]);
  const existingIndex = String(artist?.role_keys_index ?? '');
  for (const token of existingIndex.split('|')) {
    const normalized = normalizeLookupKey(token);
    if (normalized) keys.add(normalized);
  }

  return `|${Array.from(keys).filter(Boolean).join('|')}|`;
}

function getSearchableAvatarCount() {
  return mockArtists.length + searchableExtraAvatars.length;
}

function getSearchableAvatarByIndex(index) {
  if (index < mockArtists.length) return mockArtists[index];
  return searchableExtraAvatars[index - mockArtists.length];
}

// Only debug JSON routes need a mutable snapshot. Search/facet indexes use the
// canonical artist array directly and never clone all 200k references at startup.
function getSearchableAvatarPool() {
  return searchableExtraAvatars.length > 0
    ? [...mockArtists, ...searchableExtraAvatars]
    : mockArtists.slice();
}

const SEARCH_IDENTITY_SEPARATOR = '\u001f';

function getCompactAvatarIdentitySearchToken(avatar) {
  const normalizedValues = new Set();
  for (const value of getAvatarIdentitySearchValues(avatar)) {
    const original = normalizeLookupText(value);
    const expanded = normalizeLookupText(
      String(value ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    );
    if (original) normalizedValues.add(original);
    if (expanded) normalizedValues.add(expanded);
  }
  return Array.from(normalizedValues).join(SEARCH_IDENTITY_SEPARATOR);
}

function getAvatarSearchTokens(avatar, compactIdentityToken = '') {
  const primaryRoleKey = getArtistPrimaryRoleKey(avatar);
  const primaryRoleLabel = getArtistPrimaryRoleLabel(avatar);
  const geography = deriveCanonicalArtistGeography(avatar);
  const identityTokens = String(
    compactIdentityToken || getCompactAvatarIdentitySearchToken(avatar)
  ).split(SEARCH_IDENTITY_SEPARATOR).filter(Boolean);

  return [
    ...identityTokens,
    avatar.artist_rank,
    primaryRoleKey,
    primaryRoleLabel,
    avatar.main_role,
    avatar.instrument,
    geography.zone_name,
    avatar.address_label,
    geography.district,
    geography.district_id,
    geography.district_name,
    geography.commune_name,
    geography.parent_zone_id,
    geography.parent_code,
    geography.city_id,
    geography.city,
    geography.city_name,
  ]
    .flatMap((value) => {
      const original = normalizeLookupText(value);
      const expanded = normalizeLookupText(
        String(value ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      );
      return original === expanded ? [original] : [original, expanded];
    })
    .filter(Boolean);
}

function getSearchPrefixKeys(value) {
  const camelCaseExpanded = String(value ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const normalizedOriginal = normalizeLookupText(value);
  const normalizedExpanded = normalizeLookupText(camelCaseExpanded);
  if (!normalizedOriginal && !normalizedExpanded) return [];

  const tokens = new Set([
    normalizedOriginal,
    ...normalizedOriginal.split(' '),
    normalizedExpanded,
    ...normalizedExpanded.split(' ')
  ]);
  const prefixes = new Set();
  for (const token of tokens) {
    if (token) prefixes.add(token.slice(0, 3));
  }
  return Array.from(prefixes);
}

function getAvatarIdentitySearchValues(avatar) {
  return [avatar.display_name, avatar.handle, avatar.profile_slug].filter(Boolean);
}

function getCompactIdentityPrefixKeys(compactIdentityToken) {
  const prefixes = new Set();
  for (const normalizedValue of String(compactIdentityToken).split(SEARCH_IDENTITY_SEPARATOR)) {
    if (!normalizedValue) continue;
    prefixes.add(normalizedValue.slice(0, 3));
    for (const word of normalizedValue.split(' ')) {
      if (word) prefixes.add(word.slice(0, 3));
    }
  }
  return prefixes;
}

function getZoneLookupAliases(value) {
  const cacheKey = String(value ?? '');
  const cached = zoneLookupAliasCache.get(cacheKey);
  if (cached) return cached;
  const key = normalizeLookupKey(value);
  if (!key) return [];

  const aliases = new Set([key]);
  const structuralKey = key.replace(/_(?:district|quartier|commune|zone)$/, '');
  aliases.add(structuralKey);

  for (const candidate of [key, structuralKey]) {
    const parisStructuralMatch = candidate.match(/^paris_(?:quartier|district|zone)_(.+)$/);
    if (parisStructuralMatch?.[1]) aliases.add(parisStructuralMatch[1]);

    const parisMatch = candidate.match(/^paris_(?:\d{1,2}e_)?(.+)$/);
    if (parisMatch?.[1]) aliases.add(parisMatch[1]);

    const grandParisMatch = candidate.match(/^(?:grand_paris|metropole_du_grand_paris|mgp)_(.+)$/);
    if (grandParisMatch?.[1]) aliases.add(grandParisMatch[1]);

    const grandParisCommuneMatch = candidate.match(/^(?:grand_paris_)?commune_([0-9a-z]+)$/);
    if (grandParisCommuneMatch?.[1]) aliases.add(grandParisCommuneMatch[1]);
  }

  const result = Array.from(aliases);
  if (zoneLookupAliasCache.size < 10000) zoneLookupAliasCache.set(cacheKey, result);
  return result;
}

function getAvatarCityKeys(avatar) {
  const geography = deriveCanonicalArtistGeography(avatar);
  const cacheKey = `${geography.city_id ?? ''}|${geography.city ?? ''}|${geography.city_name ?? ''}`;
  const cached = avatarCityKeyCache.get(cacheKey);
  if (cached) return cached;
  const keys = Array.from(new Set([
    geography.city_id,
    geography.city,
    geography.city_name,
  ].map(normalizeLookupKey).filter(Boolean)));
  if (avatarCityKeyCache.size < 1000) avatarCityKeyCache.set(cacheKey, keys);
  return keys;
}

function getAvatarFacetContextKeys(avatar) {
  const contexts = new Set(['*']);
  const geography = deriveCanonicalArtistGeography(avatar);
  for (const cityKey of getAvatarCityKeys(avatar)) contexts.add(`city:${cityKey}`);

  for (const zoneValue of [
    geography.zone_id,
    geography.district_id,
    geography.commune_id,
    geography.parent_zone_id,
    geography.parent_code,
    geography.zone_name,
    geography.district_name,
    geography.commune_name,
    geography.city_name
  ]) {
    for (const alias of getZoneLookupAliases(zoneValue)) contexts.add(`zone:${alias}`);
  }

  return contexts;
}

function rebuildAvatarQueryIndexes() {
  const searchIndex = new Map();
  const facetIndex = new Map();
  const facetAggregateIndex = new Map();
  const avatarCount = getSearchableAvatarCount();
  avatarSearchIdentityTokens = new Array(avatarCount);

  for (let avatarIndex = 0; avatarIndex < avatarCount; avatarIndex += 1) {
    const avatar = getSearchableAvatarByIndex(avatarIndex);
    const compactIdentityToken = getCompactAvatarIdentitySearchToken(avatar);
    avatarSearchIdentityTokens[avatarIndex] = compactIdentityToken;
    const avatarPrefixes = getCompactIdentityPrefixKeys(compactIdentityToken);
    for (const prefix of avatarPrefixes) {
      if (!searchIndex.has(prefix)) searchIndex.set(prefix, []);
      searchIndex.get(prefix).push(avatarIndex);
    }

    const primaryRoleKey = getArtistPrimaryRoleKey(avatar);
    const roleIndex = ARTIST_ROLE_INDEX_BY_KEY.get(primaryRoleKey);
    const gradeLevel = getArtistGradeLevel(avatar);
    const gradeIndex = gradeLevel - 1;
    const contextKeys = getAvatarFacetContextKeys(avatar);

    for (const contextKey of contextKeys) {
      if (!facetIndex.has(contextKey)) facetIndex.set(contextKey, []);
      facetIndex.get(contextKey).push(avatarIndex);
      if (!facetAggregateIndex.has(contextKey)) {
        facetAggregateIndex.set(contextKey, createArtistFacetAggregate());
      }
      addFacetValuesToAggregate(facetAggregateIndex.get(contextKey), roleIndex, gradeIndex);
    }
  }

  for (const [prefix, posting] of searchIndex) {
    searchIndex.set(prefix, Uint32Array.from(posting));
  }
  for (const [contextKey, posting] of facetIndex) {
    facetIndex.set(contextKey, Uint32Array.from(posting));
  }
  avatarSearchPrefixIndex = searchIndex;
  avatarFacetContextIndex = facetIndex;
  avatarFacetAggregateIndex = facetAggregateIndex;

  console.log('[Avatar query indexes] rebuilt', {
    avatars: avatarCount,
    searchPrefixes: avatarSearchPrefixIndex.size,
    facetContexts: avatarFacetContextIndex.size
  });
}

function getIndexedAvatarSearchCandidates(normalizedQuery) {
  const normalized = normalizeLookupText(normalizedQuery);
  const queryLength = normalized.length;
  if (queryLength === 0) return [];
  if (queryLength < 3) {
    const candidateIndexes = new Set();
    for (const [prefixKey, posting] of avatarSearchPrefixIndex) {
      if (!prefixKey.startsWith(normalized)) continue;
      for (const avatarIndex of posting) candidateIndexes.add(avatarIndex);
    }
    return Array.from(candidateIndexes, (avatarIndex) => ({
      avatar: getSearchableAvatarByIndex(avatarIndex),
      compactIdentityToken: avatarSearchIdentityTokens[avatarIndex]
    }));
  }

  const prefixKeys = getSearchPrefixKeys(normalizedQuery);
  if (prefixKeys.length === 0 || avatarSearchPrefixIndex.size === 0) return [];

  let smallestPosting = null;
  for (const prefixKey of prefixKeys) {
    const posting = avatarSearchPrefixIndex.get(prefixKey);
    if (!posting) continue;
    if (!smallestPosting || posting.length < smallestPosting.length) smallestPosting = posting;
  }

  if (!smallestPosting) return [];
  return Array.from(smallestPosting, (avatarIndex) => ({
    avatar: getSearchableAvatarByIndex(avatarIndex),
    compactIdentityToken: avatarSearchIdentityTokens[avatarIndex]
  }));
}

function unionFacetPostings(contextKeys) {
  const indexes = new Set();
  for (const contextKey of contextKeys) {
    for (const avatarIndex of avatarFacetContextIndex.get(contextKey) ?? []) {
      indexes.add(avatarIndex);
    }
  }
  return indexes;
}

function resolveZoneFacetContextKeys(
  requestedZoneKey = '',
  requestedZoneName = '',
  contextIndex = avatarFacetContextIndex
) {
  const exactZoneKey = normalizeLookupKey(requestedZoneKey);
  const exactContextKey = exactZoneKey ? `zone:${exactZoneKey}` : '';

  // A canonical zone id must never be widened to a human label alias. For
  // example, paris_12e_bel_air used to resolve both itself and the Bel-Air of
  // Saint-Mandé, producing the false 1,288 total instead of 1,166.
  if (exactContextKey && contextIndex.has(exactContextKey)) {
    return [exactContextKey];
  }

  const fallbackValue = exactZoneKey || requestedZoneName;
  return getZoneLookupAliases(fallbackValue).map((alias) => `zone:${alias}`);
}

function getFacetCandidateAvatars({ requestedCity = '', requestedZoneKey = '', requestedZoneName = '' } = {}) {
  const avatarCount = getSearchableAvatarCount();
  const allIndexes = avatarFacetContextIndex.get('*') ?? Uint32Array.from(
    { length: avatarCount },
    (_, index) => index
  );
  const cityKey = normalizeLookupKey(requestedCity);
  const zoneContextKeys = resolveZoneFacetContextKeys(
    requestedZoneKey,
    requestedZoneName,
    avatarFacetContextIndex
  );
  const zoneIndexes = zoneContextKeys.length > 0
    ? unionFacetPostings(zoneContextKeys)
    : null;

  let candidateIndexes = allIndexes;
  if (zoneIndexes) {
    candidateIndexes = Array.from(zoneIndexes);
    if (cityKey) {
      candidateIndexes = candidateIndexes.filter((avatarIndex) => (
        getAvatarCityKeys(getSearchableAvatarByIndex(avatarIndex)).includes(cityKey)
      ));
    }
  } else if (cityKey) {
    candidateIndexes = avatarFacetContextIndex.get(`city:${cityKey}`) ?? [];
  }

  return Array.from(candidateIndexes, getSearchableAvatarByIndex).filter(Boolean);
}

function getFacetAggregateForSelection({ requestedCity = '', requestedZoneKey = '', requestedZoneName = '' } = {}) {
  const cityKey = normalizeLookupKey(requestedCity);
  const rawZoneKey = normalizeLookupKey(requestedZoneKey);
  const rawZoneName = normalizeLookupKey(requestedZoneName);
  const selectionCacheKey = `${cityKey}|${rawZoneKey}|${rawZoneName}`;
  const cached = avatarFacetSelectionCache.get(selectionCacheKey);
  if (cached) return cached;

  let aggregate = null;
  if (!cityKey && !rawZoneKey && !rawZoneName) {
    aggregate = avatarFacetAggregateIndex.get('*') ?? createArtistFacetAggregate();
  } else if (cityKey && !rawZoneKey && !rawZoneName) {
    aggregate = avatarFacetAggregateIndex.get(`city:${cityKey}`) ?? createArtistFacetAggregate();
  } else if (!cityKey) {
    const preferredAliases = [
      rawZoneKey,
      rawZoneName,
      ...getZoneLookupAliases(rawZoneKey),
      ...getZoneLookupAliases(rawZoneName)
    ].filter(Boolean);
    for (const zoneAlias of preferredAliases) {
      aggregate = avatarFacetAggregateIndex.get(`zone:${zoneAlias}`);
      if (aggregate) break;
    }
    aggregate ??= createArtistFacetAggregate();
  } else {
    // A city + zone intersection is bounded by the indexed zone pool, never by 200k rows.
    aggregate = buildArtistFacetAggregate(getFacetCandidateAvatars({
      requestedCity: cityKey,
      requestedZoneKey: rawZoneKey,
      requestedZoneName: rawZoneName
    }));
  }

  avatarFacetSelectionCache.set(selectionCacheKey, aggregate);
  if (avatarFacetSelectionCache.size > 1024) {
    avatarFacetSelectionCache.delete(avatarFacetSelectionCache.keys().next().value);
  }
  return aggregate;
}

function scoreAvatarSearchResult(avatar, normalizedQuery, compactIdentityToken = '') {
  let bestScore = 0;

  for (const token of getAvatarSearchTokens(avatar, compactIdentityToken)) {
    if (token === normalizedQuery) {
      bestScore = Math.max(bestScore, 1_000_000);
    } else if (token.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 780_000);
    } else if (token.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 520_000);
    }
  }

  if (bestScore === 0) return null;

  const rank = Number.isFinite(Number(avatar.render_rank)) ? Number(avatar.render_rank) : 999999;
  const currentUserBoost = avatar.is_current_user ? 30_000 : 0;
  return bestScore + currentUserBoost - Math.min(rank, 999999);
}

function getAvatarRoleKey(avatar) {
  return normalizeLookupKey([
    avatar.instrument,
    avatar.main_role,
    avatar.artist_rank,
    avatar.avatar_icon_id,
    avatar.avatar_id,
  ].filter(Boolean).join(' '));
}

function getAvatarIconCountBucket(avatar) {
  const role = getAvatarRoleKey(avatar);

  if (
    role.includes('avatar_23') ||
    role.includes('avatar_24') ||
    role.includes('chante') ||
    role.includes('rappe') ||
    role.includes('micro') ||
    role.includes('vocal') ||
    role.includes('voice') ||
    role.includes('vox')
  ) return 'microphone';

  if (
    role.includes('avatar_15') ||
    role.includes('avatar_16') ||
    role.includes('guit')
  ) return 'guitar';

  if (
    role.includes('avatar_6') ||
    role.includes('avatar_7') ||
    role.includes('pian') ||
    role.includes('clavier') ||
    role.includes('synth')
  ) return 'piano';

  if (
    role.includes('avatar_17') ||
    role.includes('avatar_21') ||
    role.includes('avatar_25') ||
    role.includes('beatmaker') ||
    role.includes('producteur') ||
    role.includes('producer') ||
    role.includes('compositeur') ||
    role.includes('dj') ||
    role.includes('inge_son') ||
    role.includes('studio')
  ) return 'producer';

  return null;
}

function getAvatarIconCounts(avatars) {
  const counts = {
    microphone: 0,
    guitar: 0,
    piano: 0,
    producer: 0
  };

  for (const avatar of avatars) {
    const bucket = getAvatarIconCountBucket(avatar);
    if (bucket) counts[bucket] += 1;
  }

  return counts;
}

function getAvatarStyleCounts(avatars) {
  const counts = Object.fromEntries(
    ARTIST_ROLE_DEFINITIONS.map((definition) => [definition.key, 0])
  );

  for (const avatar of avatars) {
    const primaryRoleKey = getArtistPrimaryRoleKey(avatar);
    if (Object.hasOwn(counts, primaryRoleKey)) counts[primaryRoleKey] += 1;
  }

  return counts;
}

function parseFacetList(value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((item) => String(item ?? '').split(/[|,;\s]+/))
    .map(normalizeLookupKey)
    .filter(Boolean);
}

function parseFacetRoleKeys(value) {
  return Array.from(new Set(parseFacetList(value)))
    .filter((roleKey) => ARTIST_ROLE_DEFINITION_BY_KEY.has(roleKey));
}

function parseFacetGradeLevels(value) {
  return Array.from(new Set(parseFacetList(value)
    .map((level) => Number(level))
    .filter((level) => Number.isInteger(level) && level >= 1 && level <= 6)))
    .sort((a, b) => a - b);
}

function createArtistFacetAggregate() {
  return {
    total: 0,
    roleCounts: new Uint32Array(ARTIST_ROLE_DEFINITIONS.length),
    gradeCounts: new Uint32Array(6),
    roleGradeCounts: new Uint32Array(ARTIST_ROLE_DEFINITIONS.length * 6)
  };
}

function addFacetValuesToAggregate(aggregate, roleIndex, gradeIndex) {
  aggregate.total += 1;
  if (gradeIndex >= 0 && gradeIndex < 6) aggregate.gradeCounts[gradeIndex] += 1;
  if (roleIndex === undefined) return;
  aggregate.roleCounts[roleIndex] += 1;
  if (gradeIndex >= 0 && gradeIndex < 6) {
    aggregate.roleGradeCounts[(roleIndex * 6) + gradeIndex] += 1;
  }
}

function addAvatarToFacetAggregate(aggregate, avatar) {
  const roleIndex = ARTIST_ROLE_INDEX_BY_KEY.get(getArtistPrimaryRoleKey(avatar));
  const gradeIndex = getArtistGradeLevel(avatar) - 1;
  addFacetValuesToAggregate(aggregate, roleIndex, gradeIndex);
}

function buildArtistFacetAggregate(avatars) {
  const aggregate = createArtistFacetAggregate();
  for (const avatar of avatars) addAvatarToFacetAggregate(aggregate, avatar);
  return aggregate;
}

function getFacetFilteredTotal(aggregate, selectedRoleKeys, selectedGradeLevels) {
  const roleIndexes = selectedRoleKeys
    .map((roleKey) => ARTIST_ROLE_INDEX_BY_KEY.get(roleKey))
    .filter((roleIndex) => roleIndex !== undefined);
  const gradeIndexes = selectedGradeLevels.map((gradeLevel) => gradeLevel - 1);

  if (roleIndexes.length === 0 && gradeIndexes.length === 0) return aggregate.total;
  if (roleIndexes.length === 0) {
    return gradeIndexes.reduce((total, gradeIndex) => total + aggregate.gradeCounts[gradeIndex], 0);
  }
  if (gradeIndexes.length === 0) {
    return roleIndexes.reduce((total, roleIndex) => total + aggregate.roleCounts[roleIndex], 0);
  }

  let total = 0;
  for (const roleIndex of roleIndexes) {
    for (const gradeIndex of gradeIndexes) {
      total += aggregate.roleGradeCounts[(roleIndex * 6) + gradeIndex];
    }
  }
  return total;
}

function getAutomaticAvatarStyleLimit(totalArtists) {
  const total = Math.max(0, Math.round(Number(totalArtists) || 0));
  if (total < 500) return 30;
  if (total < 1500) return 10;
  return 5;
}

function buildArtistFacetPayloadFromAggregate(aggregate, options = {}) {
  const selectedRoleKeys = Array.from(new Set(options.selectedRoleKeys ?? []));
  const selectedGradeLevels = Array.from(new Set(options.selectedGradeLevels ?? []));
  const readIntersection = (roleIndex, gradeIndex) => (
    aggregate.roleGradeCounts[(roleIndex * 6) + gradeIndex] || 0
  );

  const roles = ARTIST_ROLE_DEFINITIONS.map((definition, roleIndex) => ({
    key: definition.key,
    label: definition.label,
    count: aggregate.roleCounts[roleIndex] || 0,
    sortOrder: (roleIndex + 1) * 10,
    gradeCounts: Object.fromEntries(
      [0, 1, 2, 3, 4, 5].map((gradeIndex) => [
        String(gradeIndex + 1),
        readIntersection(roleIndex, gradeIndex)
      ])
    )
  }));

  const grades = [0, 1, 2, 3, 4, 5].map((gradeIndex) => ({
    level: gradeIndex + 1,
    count: aggregate.gradeCounts[gradeIndex] || 0,
    roleCounts: Object.fromEntries(
      ARTIST_ROLE_DEFINITIONS.map((definition, roleIndex) => [
        definition.key,
        readIntersection(roleIndex, gradeIndex)
      ])
    )
  }));

  const roleGradeCounts = Object.fromEntries(
    ARTIST_ROLE_DEFINITIONS.map((definition, roleIndex) => [
      definition.key,
      Object.fromEntries(
        [0, 1, 2, 3, 4, 5].map((gradeIndex) => [
          String(gradeIndex + 1),
          readIntersection(roleIndex, gradeIndex)
        ])
      )
    ])
  );
  const intersections = ARTIST_ROLE_DEFINITIONS.flatMap((definition, roleIndex) => (
    [0, 1, 2, 3, 4, 5].map((gradeIndex) => ({
      roleKey: definition.key,
      gradeLevel: gradeIndex + 1,
      count: readIntersection(roleIndex, gradeIndex)
    }))
  ));

  return {
    totalArtists: aggregate.total,
    selectionLimit: getAutomaticAvatarStyleLimit(aggregate.total),
    filteredTotal: getFacetFilteredTotal(aggregate, selectedRoleKeys, selectedGradeLevels),
    selected: {
      roleKeys: selectedRoleKeys,
      gradeLevels: selectedGradeLevels
    },
    roles,
    grades,
    roleGradeCounts,
    intersections
  };
}

function buildArtistFacetPayload(avatars, options = {}) {
  return buildArtistFacetPayloadFromAggregate(buildArtistFacetAggregate(avatars), options);
}

function avatarSearchResultPayload(avatar) {
  const gradeLevel = getArtistGradeLevel(avatar);
  const gradeStars = getArtistGradeStars(avatar);
  const primaryRoleKey = getArtistPrimaryRoleKey(avatar);
  const primaryRoleLabel = getArtistPrimaryRoleLabel(avatar);
  const geography = deriveCanonicalArtistGeography(avatar);

  return {
    id: String(avatar.id),
    label: getPublicAvatarDisplayName(avatar) ?? avatar.handle ?? avatar.profile_slug ?? String(avatar.id),
    instrument: avatar.instrument ?? null,
    main_role: avatar.main_role ?? primaryRoleLabel ?? avatar.artist_rank ?? avatar.instrument ?? null,
    primary_role_key: primaryRoleKey,
    primary_role_label: primaryRoleLabel,
    role_keys_index: getArtistRoleKeysIndex(avatar),
    lat: Number(avatar.lat),
    lng: Number(avatar.lng),
    center: [Number(avatar.lng), Number(avatar.lat)],
    avatar_icon_id: avatar.avatar_icon_id ?? avatar.avatar_id ?? null,
    avatar_id: avatar.avatar_id ?? null,
    display_name: getPublicAvatarDisplayName(avatar),
    handle: avatar.handle ?? null,
    profile_slug: avatar.profile_slug ?? null,
    artist_rank: avatar.artist_rank ?? null,
    grade_level: gradeLevel,
    grade_stars: gradeStars,
    grade_tier: avatar.grade_tier ?? getArtistGradeTier(gradeLevel),
    grade_color: avatar.grade_color ?? '#8B5CF6',
    golden_likes_count: getStableFallbackGoldenLikesCount(avatar),
    city: geography.city,
    city_id: geography.city_id,
    city_name: geography.city_name,
    district: geography.district,
    district_id: geography.district_id,
    district_name: geography.district_name,
    commune_id: geography.commune_id,
    commune_name: geography.commune_name,
    parent_zone_id: geography.parent_zone_id,
    parent_code: geography.parent_code,
    address_label: avatar.address_label ?? null,
    zone_id: geography.zone_id ?? avatar.sector_id ?? avatar.parent_nano_id ?? null,
    zone_name: geography.zone_name,
    render_rank: avatar.render_rank ?? null,
    is_current_user: Boolean(avatar.is_current_user),
    size_scale: avatar.size_scale ?? 1
  };
}


const LEAF_CLUSTER_TARGET = 120;
const PARENT_CLUSTER_CHILDREN_PER_GROUP = 3;

function getClusterWeight(item) {
  return Number(item.point_count || 1);
}

function getSpatialBounds(items) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const item of items) {
    const lng = Number(item.lng);
    const lat = Number(item.lat);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return { minLng, maxLng, minLat, maxLat };
}

function spatialSort(items) {
  const bounds = getSpatialBounds(items);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.000001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.000001);

  return items
    .map((item) => {
      const x = Math.floor(((Number(item.lng) - bounds.minLng) / lngSpan) * 65535);
      const y = Math.floor(((Number(item.lat) - bounds.minLat) / latSpan) * 65535);
      return { item, key: morton16(x, y), id: String(item.id) };
    })
    .sort((a, b) => a.key - b.key || a.id.localeCompare(b.id))
    .map((entry) => entry.item);
}

function morton16(x, y) {
  x = Math.max(0, Math.min(65535, x | 0));
  y = Math.max(0, Math.min(65535, y | 0));

  let answer = 0;

  for (let i = 0; i < 16; i++) {
    answer |= ((x >> i) & 1) << (2 * i);
    answer |= ((y >> i) & 1) << (2 * i + 1);
  }

  return answer;
}

function chunkIntoGroupCount(items, groupCount) {
  if (items.length === 0) return [];

  const safeGroupCount = Math.max(1, Math.min(groupCount, items.length));
  const baseSize = Math.floor(items.length / safeGroupCount);
  const remainder = items.length % safeGroupCount;

  const groups = [];
  let cursor = 0;

  for (let i = 0; i < safeGroupCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    groups.push(items.slice(cursor, cursor + size));
    cursor += size;
  }

  return groups.filter(group => group.length > 0);
}

function chunkLeafArtistsBy120(items) {
  if (items.length <= LEAF_CLUSTER_TARGET) {
    return [items];
  }

  // V7: server-authoritative leaf sectors must never exceed 120 avatars.
  // The client may lock an entire sector without hiding users arbitrarily.
  // With 50K rows this produces 417 sectors of 119/120 instead of 416 sectors of 120/121.
  const groupCount = Math.max(1, Math.ceil(items.length / LEAF_CLUSTER_TARGET));
  return chunkIntoGroupCount(items, groupCount);
}

function chunkParentClusters(items) {
  if (items.length <= PARENT_CLUSTER_CHILDREN_PER_GROUP) {
    return [items];
  }

  const groupCount = Math.ceil(items.length / PARENT_CLUSTER_CHILDREN_PER_GROUP);
  return chunkIntoGroupCount(items, groupCount);
}

function weightedClusterCentroid(children) {
  let sumWeight = 0;
  let sumLng = 0;
  let sumLat = 0;

  for (const child of children) {
    const weight = getClusterWeight(child);
    const lng = Number(child.lng);
    const lat = Number(child.lat);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    sumWeight += weight;
    sumLng += lng * weight;
    sumLat += lat * weight;
  }

  if (sumWeight <= 0) {
    return {
      lng: Number(children[0]?.lng || 2.3488),
      lat: Number(children[0]?.lat || 48.8534)
    };
  }

  return {
    lng: Number((sumLng / sumWeight).toFixed(7)),
    lat: Number((sumLat / sumWeight).toFixed(7))
  };
}

function makeDerivedCluster(level, index, children, scope) {
  const id = `${scope.key}_${level}_${String(index).padStart(4, "0")}`;
  const count = children.reduce((sum, child) => sum + getClusterWeight(child), 0);
  const centroid = weightedClusterCentroid(children);

  return {
    id,
    cluster_id: id,
    cluster_level: level,
    point_count: count,
    real_count: count,
    display_count: count,
    display_count_text: formatCompactCount(count),
    parent_cluster_id: null,
    parent_nano_id: null,
    parent_micro_id: null,
    parent_local_id: null,
    parent_mid_id: null,
    parent_macro_id: null,
    city: scope.city,
    city_id: scope.cityId,
    city_name: scope.cityName,
    commune_id: scope.communeId,
    commune_name: scope.communeName,
    parent_zone_id: scope.parentZoneId,
    parent_code: scope.parentCode,
    hierarchy_scope_id: scope.id,
    lng: centroid.lng,
    lat: centroid.lat,
    sibling_count: 1,
    sibling_index: 0,
    needs_spiderfy: false,
    stacked_group_id: null,
    stack_radius_m: 0,
    icon_offset_x: 0,
    icon_offset_y: 0,
    __children: children
  };
}

function buildParentLevel(childClusters, level, scope) {
  const sorted = spatialSort(childClusters);
  const groups = chunkParentClusters(sorted);

  return groups.map((group, index) => {
    return makeDerivedCluster(level, index, group, scope);
  });
}

function stripInternalClusterFields(cluster) {
  const { __children, ...clean } = cluster;
  return clean;
}

async function getPublicTableColumns(tableName, database = pool) {
  const result = await database.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(result.rows.map((row) => String(row.column_name)));
}

function selectFirstAvailableColumn(columns, candidates, alias, fallback = null) {
  const column = candidates.find((candidate) => columns.has(candidate));
  if (column) return `"${column}" AS "${alias}"`;
  return fallback === null ? null : `${fallback} AS "${alias}"`;
}

function buildMockArtistSelectList(columns) {
  for (const requiredColumn of ['id']) {
    if (!columns.has(requiredColumn)) {
      throw new Error(`mock_artists.${requiredColumn} is required by the MVT catalogue`);
    }
  }

  return [
    '"id"::text AS "id"',
    selectFirstAvailableColumn(columns, ['city'], 'city'),
    selectFirstAvailableColumn(columns, ['city_id'], 'city_id'),
    selectFirstAvailableColumn(columns, ['city_name', 'city'], 'city_name'),
    selectFirstAvailableColumn(columns, ['district'], 'district'),
    selectFirstAvailableColumn(columns, ['district_id', 'district'], 'district_id'),
    selectFirstAvailableColumn(columns, ['district_name', 'zone_name'], 'district_name'),
    selectFirstAvailableColumn(columns, ['zone_id', 'district_id', 'district'], 'zone_id'),
    selectFirstAvailableColumn(columns, ['zone_name'], 'zone_name'),
    selectFirstAvailableColumn(columns, ['parent_zone_id'], 'parent_zone_id'),
    selectFirstAvailableColumn(columns, ['parent_code'], 'parent_code'),
    selectFirstAvailableColumn(columns, ['address_label'], 'address_label'),
    selectFirstAvailableColumn(columns, ['commune_id'], 'commune_id'),
    selectFirstAvailableColumn(columns, ['commune_name'], 'commune_name'),
    selectFirstAvailableColumn(columns, ['lat', 'latitude'], 'lat'),
    selectFirstAvailableColumn(columns, ['lng', 'longitude'], 'lng'),
    selectFirstAvailableColumn(columns, ['instrument'], 'instrument'),
    selectFirstAvailableColumn(columns, ['avatar_id', 'avatar_icon_id'], 'avatar_id'),
    selectFirstAvailableColumn(columns, ['render_rank'], 'render_rank'),
    selectFirstAvailableColumn(columns, ['address_id'], 'address_id'),
    selectFirstAvailableColumn(columns, ['identity_seed'], 'identity_seed'),
    selectFirstAvailableColumn(columns, ['anchor_type'], 'anchor_type'),
    selectFirstAvailableColumn(columns, ['anchor_id'], 'anchor_id'),
    selectFirstAvailableColumn(columns, ['display_name'], 'display_name'),
    selectFirstAvailableColumn(columns, ['handle'], 'handle'),
    selectFirstAvailableColumn(columns, ['profile_slug'], 'profile_slug'),
    selectFirstAvailableColumn(columns, ['artist_rank'], 'artist_rank'),
    selectFirstAvailableColumn(columns, ['rank_score'], 'rank_score'),
    selectFirstAvailableColumn(columns, ['primary_role_key'], 'primary_role_key'),
    selectFirstAvailableColumn(columns, ['primary_role_label'], 'primary_role_label'),
    selectFirstAvailableColumn(columns, ['role_keys_index'], 'role_keys_index'),
    selectFirstAvailableColumn(columns, ['main_role'], 'main_role'),
    selectFirstAvailableColumn(columns, ['secondary_roles'], 'secondary_roles'),
    selectFirstAvailableColumn(columns, ['music_genres'], 'music_genres'),
    selectFirstAvailableColumn(columns, ['is_current_user'], 'is_current_user'),
    selectFirstAvailableColumn(columns, ['is_host_avatar'], 'is_host_avatar'),
    selectFirstAvailableColumn(columns, ['is_mock'], 'is_mock'),
    selectFirstAvailableColumn(columns, ['size_scale'], 'size_scale'),
    selectFirstAvailableColumn(columns, ['grade_level'], 'grade_level'),
    selectFirstAvailableColumn(columns, ['grade_stars'], 'grade_stars'),
    selectFirstAvailableColumn(columns, ['grade_tier'], 'grade_tier'),
    selectFirstAvailableColumn(columns, ['grade_color'], 'grade_color'),
    selectFirstAvailableColumn(columns, ['golden_likes_count'], 'golden_likes_count')
  ].filter(Boolean).join(',\n      ');
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function selectFirstAvailableQualifiedColumn(sources, alias, fallback = null) {
  for (const source of sources) {
    const column = source.candidates.find((candidate) => source.columns.has(candidate));
    if (column) return `${source.tableAlias}."${column}" AS "${alias}"`;
  }
  return fallback === null ? null : `${fallback} AS "${alias}"`;
}

function buildVisibleProfileSelectList(profileColumns, markerColumns = new Set()) {
  return [
    'p."id"::text AS "id"',
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['display_name', 'username'] },
    ], 'display_name', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['username'] },
    ], 'handle', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['avatar_style_key'] },
    ], 'avatar_name', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['avatar_icon_id'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['avatar_icon_id', 'avatar_style_key'] },
    ], 'avatar_icon_id', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['primary_role_key'] },
    ], 'artist_type', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['city'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['city'] },
    ], 'city', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['commune_code'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['commune_code'] },
    ], 'commune_code', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['zone_id'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['zone_id'] },
    ], 'zone_id', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['zone_id'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['zone_id'] },
    ], 'district_id', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['zone_name'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['zone_name', 'district_name'] },
    ], 'district_name', 'NULL::text'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['scene_name'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['scene_name'] },
    ], 'scene_name', 'NULL::text'),
    'NULL::text AS "scene_source"',
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['latitude'] },
    ], 'lat', 'NULL::double precision'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['longitude'] },
    ], 'lng', 'NULL::double precision'),
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['grade'] },
    ], 'grade_level', '1::integer'),
    selectFirstAvailableQualifiedColumn([
      { columns: profileColumns, tableAlias: 'p', candidates: ['golden_likes_count'] },
    ], 'golden_likes_count', '0::bigint'),
    selectFirstAvailableQualifiedColumn([
      { columns: markerColumns, tableAlias: 'm', candidates: ['updated_at'] },
      { columns: profileColumns, tableAlias: 'p', candidates: ['updated_at'] },
    ], 'updated_at', 'NULL::timestamptz'),
    "'{}'::jsonb AS \"public_profile_preferences\"",
  ].filter(Boolean).join(',\n      ');
}

function buildVisibleProfileCatalogueQuery(profileColumns, markerColumns) {
  const requiredProfileColumns = ['id'];
  const requiredMarkerColumns = ['profile_id', 'latitude', 'longitude', 'is_visible'];
  if (!requiredProfileColumns.every((column) => profileColumns.has(column))) return null;
  if (!requiredMarkerColumns.every((column) => markerColumns.has(column))) return null;

  return `
      SELECT
        ${buildVisibleProfileSelectList(profileColumns, markerColumns)}
      FROM public.public_profiles AS p
      INNER JOIN public.profile_public_markers AS m
        ON m.profile_id = p.id
      WHERE m.is_visible IS TRUE
        AND m.latitude IS NOT NULL
        AND m.longitude IS NOT NULL
      ORDER BY p.id
    `;
}

function isSafeProfileProjectionUnavailableError(error) {
  return error?.code === '42P01' || error?.code === '42703';
}

async function loadVisibleProfileRows(database = pool) {
  try {
    const [profileColumns, markerColumns] = await Promise.all([
      getPublicTableColumns('public_profiles', database),
      getPublicTableColumns('profile_public_markers', database),
    ]);
    const query = buildVisibleProfileCatalogueQuery(profileColumns, markerColumns);
    if (!query) return { available: false, rows: [] };

    const result = await database.query(query);
    return { available: true, rows: result.rows };
  } catch (error) {
    if (isSafeProfileProjectionUnavailableError(error)) {
      return { available: false, rows: [] };
    }
    throw error;
  }
}

function profileRowToAvatar(row) {
  const preferences = asPlainObject(row.public_profile_preferences);
  const musicScene = asPlainObject(preferences.music_scene);
  const communeCode = String(row.commune_code ?? musicScene.commune_code ?? '').trim().toUpperCase();
  const zoneId = String(
    row.zone_id
    ?? row.district_id
    ?? musicScene.zone_id
    ?? musicScene.district_id
    ?? '',
  ).trim();
  const cityName = String(row.city ?? musicScene.city ?? '').trim() || 'France';
  const districtName = String(
    row.district_name
    ?? row.scene_name
    ?? musicScene.district_name
    ?? musicScene.scene_name
    ?? cityName,
  ).trim();
  const rawGradeLevel = Number(row.grade_level);
  const gradeLevel = Number.isFinite(rawGradeLevel)
    ? Math.max(1, Math.min(6, Math.round(rawGradeLevel)))
    : 1;
  const rawGoldenLikesCount = Number(row.golden_likes_count);
  const goldenLikesCount = Number.isFinite(rawGoldenLikesCount) && rawGoldenLikesCount >= 0
    ? Math.round(rawGoldenLikesCount)
    : 0;
  const profileId = String(row.id);
  const cityId = communeCode ? `commune-${communeCode}` : `city_${normalizeLookupKey(cityName)}`;

  return applyParisLandmarkAvatarSafetyToRecord({
    id: profileId,
    city: cityName,
    city_id: cityId,
    city_name: cityName,
    commune_id: communeCode ? `commune-${communeCode}` : null,
    commune_name: cityName,
    parent_zone_id: zoneId || cityId,
    parent_code: communeCode || null,
    district: districtName,
    district_id: zoneId || cityId,
    district_name: districtName,
    zone_id: zoneId || cityId,
    zone_name: districtName,
    address_label: `${districtName}, ${cityName}`,
    lat: Number(row.lat),
    lng: Number(row.lng),
    instrument: String(row.artist_type ?? 'Artiste').trim() || 'Artiste',
    avatar_id: String(row.avatar_icon_id ?? 'avatar_4').trim() || 'avatar_4',
    avatar_icon_id: String(row.avatar_icon_id ?? 'avatar_4').trim() || 'avatar_4',
    identity_seed: `profile_${profileId}`,
    display_name: String(row.display_name ?? 'Artiste Meewav').trim() || 'Artiste Meewav',
    handle: String(row.handle ?? '').trim() || null,
    profile_slug: String(row.handle ?? profileId).trim(),
    artist_rank: 'member',
    primary_role_key: String(row.artist_type ?? '').trim() || 'artist',
    primary_role_label: String(row.artist_type ?? 'Artiste').trim() || 'Artiste',
    is_current_user: false,
    is_host_avatar: false,
    is_mock: false,
    size_scale: 1,
    grade_level: gradeLevel,
    grade_stars: Math.min(gradeLevel, 5),
    grade_tier: getArtistGradeTier(gradeLevel),
    grade_color: getArtistGradeColor(gradeLevel),
    golden_likes_count: goldenLikesCount,
    render_rank: -1_000_000 + stableHashInt(profileId, 100_000),
    updated_at: row.updated_at ?? null,
  }, profileId);
}

function invalidateRealProfileRuntimeIndexes() {
  avatarTileIndexByZoom.clear();
  tileCache.clear();
  avatarSearchPrefixIndex = new Map();
  avatarFacetContextIndex = new Map();
  avatarFacetAggregateIndex = new Map();
  avatarFacetSelectionCache.clear();
  avatarZoneSummaryCache.clear();
  zoneLookupAliasCache.clear();
  avatarCityKeyCache.clear();
  rebuildSearchableExtraAvatars();
  rebuildAvatarQueryIndexes();
}

let realProfileRefreshPromise = null;
async function refreshVisibleRealProfiles({ force = false } = {}) {
  if (realProfileRefreshPromise) return realProfileRefreshPromise;

  realProfileRefreshPromise = (async () => {
    const result = await loadVisibleProfileRows(pool);
    // During a rolling deployment the two safe projections may not exist yet.
    // Keep the last safe catalogue (or the mock-only startup fallback) instead
    // of ever falling back to the PII-bearing profiles table.
    if (!result.available) return false;
    const nextArtists = result.rows
      .map(profileRowToAvatar)
      .filter((artist) => Number.isFinite(artist.lng) && Number.isFinite(artist.lat));
    const nextSignature = nextArtists
      .map((artist) => [
        artist.id,
        artist.updated_at,
        artist.lng,
        artist.lat,
        artist.zone_id,
        artist.avatar_id,
        artist.display_name,
        artist.grade_level,
      ].join(':'))
      .join('|');

    if (!force && nextSignature === realProfileCatalogueSignature) return false;
    realProfileArtists = nextArtists;
    realProfileCatalogueSignature = nextSignature;
    invalidateRealProfileRuntimeIndexes();
    console.log('[Avatar catalogue] Visible real profiles refreshed', {
      count: realProfileArtists.length,
    });
    return true;
  })().finally(() => {
    realProfileRefreshPromise = null;
  });

  return realProfileRefreshPromise;
}

function deriveCanonicalArtistGeography(row) {
  const city = row.city ?? row.city_name ?? null;
  const cityId = row.city_id ?? null;
  const cityName = row.city_name ?? row.city ?? null;
  const isGrandParis = normalizeLookupKey(city) === 'grand_paris';
  const inferredInseeCode = isGrandParis
    ? String(cityId ?? '').match(/(?:^|[_-])(\d{5})$/)?.[1] ?? null
    : null;

  return {
    city,
    city_id: cityId,
    city_name: cityName,
    district: row.district ?? null,
    district_id: row.district_id ?? row.district ?? null,
    district_name: row.district_name ?? null,
    commune_id: row.commune_id ?? (isGrandParis ? cityId : null),
    commune_name: row.commune_name ?? (isGrandParis ? cityName : null),
    parent_zone_id: row.parent_zone_id ?? (isGrandParis ? cityId : null),
    parent_code: row.parent_code ?? inferredInseeCode,
    zone_id: row.zone_id ?? row.district_id ?? row.district ?? null,
    zone_name: row.zone_name ?? row.district_name ?? row.address_label ?? cityName
  };
}

function getArtistHierarchyScope(row) {
  const geography = deriveCanonicalArtistGeography(row);
  const isGrandParis = normalizeLookupKey(geography.city) === 'grand_paris';
  const rawScopeId = isGrandParis
    ? geography.commune_id ?? geography.parent_zone_id ?? geography.city_id
    : geography.city_id ?? `city_${normalizeLookupKey(geography.city_name ?? geography.city ?? 'paris')}`;
  const id = String(rawScopeId || (isGrandParis ? 'grand_paris_unknown' : 'city_paris'));

  return {
    id,
    key: normalizeLookupKey(id) || 'unknown_scope',
    city: geography.city,
    cityId: id,
    cityName: isGrandParis
      ? geography.commune_name ?? geography.city_name ?? id
      : geography.city_name ?? geography.city ?? id,
    communeId: isGrandParis ? id : null,
    communeName: isGrandParis ? geography.commune_name ?? geography.city_name ?? id : null,
    parentZoneId: isGrandParis ? id : geography.parent_zone_id,
    parentCode: geography.parent_code,
    isGrandParis
  };
}

function buildCountryScopeCluster(scope, rows) {
  const centroid = weightedClusterCentroid(rows);
  const useFixedParisCenter = scope.key === 'city_paris';
  const count = rows.length;
  return {
    id: scope.id,
    cluster_id: scope.id,
    cluster_level: 'country',
    point_count: count,
    real_count: count,
    display_count: count,
    display_count_text: formatCompactCount(count),
    name: scope.cityName,
    city: scope.city,
    city_id: scope.cityId,
    city_name: scope.cityName,
    commune_id: scope.communeId,
    commune_name: scope.communeName,
    parent_zone_id: scope.parentZoneId,
    parent_code: scope.parentCode,
    hierarchy_scope_id: scope.id,
    parent_cluster_id: null,
    lng: useFixedParisCenter ? 2.3488 : centroid.lng,
    lat: useFixedParisCenter ? 48.8534 : centroid.lat
  };
}

function buildScopedArtistHierarchy(rows) {
  const scopeById = new Map();
  for (const row of rows) {
    const scope = getArtistHierarchyScope(row);
    if (!scopeById.has(scope.id)) scopeById.set(scope.id, { scope, rows: [] });
    scopeById.get(scope.id).rows.push(row);
  }

  const scopedGroups = Array.from(scopeById.values()).sort((a, b) => {
    if (a.scope.key === 'city_paris') return -1;
    if (b.scope.key === 'city_paris') return 1;
    return a.scope.cityName.localeCompare(b.scope.cityName) || a.scope.id.localeCompare(b.scope.id);
  });
  const hierarchy = {
    country: [],
    macro: [],
    mid: [],
    local: [],
    micro: [],
    nano: []
  };

  for (const { scope, rows: scopeRows } of scopedGroups) {
    const rowsByProductZone = new Map();
    for (const row of scopeRows) {
      const productZoneId = String(
        deriveCanonicalArtistGeography(row).zone_id ?? scope.id
      );
      if (!rowsByProductZone.has(productZoneId)) rowsByProductZone.set(productZoneId, []);
      rowsByProductZone.get(productZoneId).push(row);
    }
    const productZones = Array.from(rowsByProductZone.entries())
      .sort(([zoneIdA], [zoneIdB]) => zoneIdA.localeCompare(zoneIdB));
    const derivedNanoClusters = [];
    let nanoIndex = 0;
    for (const [productZoneId, productZoneRows] of productZones) {
      const spatialRows = spatialSort(productZoneRows);
      for (const group of chunkLeafArtistsBy120(spatialRows)) {
        const nano = makeDerivedCluster('nano', nanoIndex, group, scope);
        nanoIndex += 1;
        const nanoGeography = deriveCanonicalArtistGeography(group[0] ?? {});
        nano.zone_id = productZoneId;
        nano.zone_name = nanoGeography.zone_name;
        nano.district_id = nanoGeography.district_id ?? productZoneId;
        nano.district_name = nanoGeography.district_name ?? nano.zone_name;
        derivedNanoClusters.push(nano);
      }
    }
    const derivedMicroClusters = buildParentLevel(derivedNanoClusters, 'micro', scope);
    const derivedLocalClusters = buildParentLevel(derivedMicroClusters, 'local', scope);
    const derivedMidClusters = buildParentLevel(derivedLocalClusters, 'mid', scope);
    const derivedMacroClusters = buildParentLevel(derivedMidClusters, 'macro', scope);

    for (const [macroIndex, macro] of derivedMacroClusters.entries()) {
      macro.parent_cluster_id = scope.id;
      macro.parent_macro_id = macro.id;
      macro.sibling_count = derivedMacroClusters.length;
      macro.sibling_index = macroIndex;

      for (const [midIndex, mid] of macro.__children.entries()) {
        mid.parent_cluster_id = macro.id;
        mid.parent_macro_id = macro.id;
        mid.parent_mid_id = mid.id;
        mid.sibling_count = macro.__children.length;
        mid.sibling_index = midIndex;

        for (const [localIndex, local] of mid.__children.entries()) {
          local.parent_cluster_id = mid.id;
          local.parent_macro_id = macro.id;
          local.parent_mid_id = mid.id;
          local.parent_local_id = local.id;
          local.sibling_count = mid.__children.length;
          local.sibling_index = localIndex;

          for (const [microIndex, micro] of local.__children.entries()) {
            micro.parent_cluster_id = local.id;
            micro.parent_macro_id = macro.id;
            micro.parent_mid_id = mid.id;
            micro.parent_local_id = local.id;
            micro.parent_micro_id = micro.id;
            micro.sibling_count = local.__children.length;
            micro.sibling_index = microIndex;

            for (const [nanoIndex, nano] of micro.__children.entries()) {
              nano.parent_cluster_id = micro.id;
              nano.parent_macro_id = macro.id;
              nano.parent_mid_id = mid.id;
              nano.parent_local_id = local.id;
              nano.parent_micro_id = micro.id;
              nano.parent_nano_id = nano.id;
              nano.sibling_count = micro.__children.length;
              nano.sibling_index = nanoIndex;

              for (const [rowIndex, row] of nano.__children.entries()) {
                row.parent_macro_id = macro.id;
                row.parent_mid_id = mid.id;
                row.parent_local_id = local.id;
                row.parent_micro_id = micro.id;
                row.parent_nano_id = nano.id;
                row.parent_cluster_id = nano.id;
                row.parent_count = nano.point_count;
                row.sibling_count = nano.point_count;
                row.sibling_index = rowIndex;
              }
            }
          }
        }
      }
    }

    hierarchy.country.push(buildCountryScopeCluster(scope, scopeRows));
    hierarchy.macro.push(...derivedMacroClusters.map(stripInternalClusterFields));
    hierarchy.mid.push(...derivedMidClusters.map(stripInternalClusterFields));
    hierarchy.local.push(...derivedLocalClusters.map(stripInternalClusterFields));
    hierarchy.micro.push(...derivedMicroClusters.map(stripInternalClusterFields));
    hierarchy.nano.push(...derivedNanoClusters.map(stripInternalClusterFields));
  }

  return hierarchy;
}

async function loadAndAggregateMockArtists() {
  const loadStartedAt = performance.now();
  console.log("[DB] Loading the global Paris + Grand Paris mock_artists catalogue...");
  const columns = await getPublicTableColumns('mock_artists');
  const schemaReadAt = performance.now();
  const selectList = buildMockArtistSelectList(columns);
  const queryStr = `
    SELECT
      ${selectList}
    FROM public.mock_artists
    ORDER BY id
  `;
  
  let dbResult = await pool.query(queryStr);
  let rows = dbResult.rows;
  const dbLoadedAt = performance.now();
  console.log(`[DB] Loaded ${rows.length} rows successfully.`);

  if (rows.length === 0) {
    throw new Error("Loaded 0 rows from mock_artists table.");
  }

  // Clear existing arrays
  COUNTRY_CITIES.length = 0;
  macroClusters.length = 0;
  midClusters.length = 0;
  localClusters.length = 0;
  microClusters.length = 0;
  nanoClusters.length = 0;
  mockArtists.length = 0;

  // 1. Build one deterministic 120-target hierarchy from Paris + Grand Paris rows.
  // Product invariant:
  // - final nano sectors represent a complete geographical leaf group.
  // - each leaf sector must be <= 120 people so the client can open the whole sector.
  // - avatars keep parent_nano_id / sector_id pointing to that final leaf sector.

  const validDbRows = [];
  for (const row of rows) {
    row.lng = Number(row.lng);
    row.lat = Number(row.lat);
    if (row.id && Number.isFinite(row.lng) && Number.isFinite(row.lat)) {
      validDbRows.push(row);
    }
  }
  rows.length = 0;
  dbResult.rows = [];
  rows = null;
  dbResult = null;

  const canonicalResult = buildCanonicalMockArtistRows(validDbRows);
  charonneFixtureReplacementActive = canonicalResult.replacementActive;
  // Apply the display-only landmark clearance before hierarchy construction and
  // tile indexing so MVT, bbox/Canvas and search all expose one coordinate.
  const validRows = canonicalResult.rows.map((row) => (
    applyParisLandmarkAvatarSafetyToRecord(row, row.id)
  ));
  const expectedArtistCount = validRows.length;

  if (canonicalResult.reason === 'reservation_contract_invalid') {
    console.error('[DB] Charonne fixture reservation is invalid; keeping DB rows unchanged', {
      reservedCount: canonicalResult.reservedCount,
      missingFixtureIds: canonicalResult.missingFixtureIds?.slice(0, 10),
      unexpectedAnchorIds: canonicalResult.unexpectedAnchorIds?.slice(0, 10)
    });
  } else {
    console.log('[DB] Charonne fixture reservation', {
      active: canonicalResult.replacementActive,
      reservedCount: canonicalResult.reservedCount,
      reason: canonicalResult.reason
    });
  }

  const rowsPreparedAt = performance.now();
  const hierarchy = buildScopedArtistHierarchy(validRows);
  COUNTRY_CITIES.length = 0;
  COUNTRY_CITIES.push(...hierarchy.country);
  macroClusters.push(...hierarchy.macro);
  midClusters.push(...hierarchy.mid);
  localClusters.push(...hierarchy.local);
  microClusters.push(...hierarchy.micro);
  nanoClusters.push(...hierarchy.nano);
  for (const clusters of Object.values(hierarchy)) clusters.length = 0;
  const hierarchyBuiltAt = performance.now();

  // Hierarchy construction already assigned the only per-avatar technical fields
  // that must be retained. Output-only values are derived when producing payloads.
  for (const row of validRows) {
    mockArtists.push(row);
  }
  globalCharonneFixtureById = charonneFixtureReplacementActive
    ? new Map(
      mockArtists
        .filter((artist) => normalizeLookupKey(artist.anchor_type) === CHARONNE_RESERVED_ANCHOR_TYPE)
        .map((artist) => [String(artist.id), artist])
    )
    : new Map();
  const artistsBuiltAt = performance.now();

  // 7. Hard validation of leaf cluster product invariant.
  const nanoCounts = nanoClusters.map(cluster => Number(cluster.point_count || 0));
  const minNanoCount = Math.min(...nanoCounts);
  const maxNanoCount = Math.max(...nanoCounts);

  console.log("[CLUSTER 120 TARGET] Nano clusters:", {
    totalArtists: expectedArtistCount,
    target: LEAF_CLUSTER_TARGET,
    nanoClusters: nanoClusters.length,
    minNanoCount,
    maxNanoCount
  });

  if (expectedArtistCount >= LEAF_CLUSTER_TARGET && maxNanoCount > LEAF_CLUSTER_TARGET) {
    throw new Error(
      `[CLUSTER 120 TARGET FAILED] max nano point_count=${maxNanoCount}, expected <= ${LEAF_CLUSTER_TARGET}`
    );
  }

  const conservation = Object.fromEntries([
    ['country', COUNTRY_CITIES],
    ['macro', macroClusters],
    ['mid', midClusters],
    ['local', localClusters],
    ['micro', microClusters],
    ['nano', nanoClusters]
  ].map(([level, clusters]) => [
    level,
    clusters.reduce((total, cluster) => total + Number(cluster.point_count || 0), 0)
  ]));
  const brokenLevel = Object.entries(conservation)
    .find(([, total]) => total !== expectedArtistCount);
  if (brokenLevel) {
    throw new Error(
      `[CLUSTER CONSERVATION FAILED] ${brokenLevel[0]} sum=${brokenLevel[1]}, expected=${expectedArtistCount}`
    );
  }
  console.log('[CLUSTER CONSERVATION]', {
    expected: expectedArtistCount,
    ...conservation,
    conservation_ok: true
  });

  console.log(`[DB] Successfully loaded and aggregated:`);
  console.log(`  - COUNTRY SCOPES: ${COUNTRY_CITIES.length}`);
  console.log(`  - COUNTRY TOTAL: ${conservation.country}`);
  console.log(`  - MACRO: ${macroClusters.length} clusters`);
  console.log(`  - MID: ${midClusters.length} clusters`);
  console.log(`  - LOCAL: ${localClusters.length} clusters`);
  console.log(`  - MICRO: ${microClusters.length} clusters`);
  console.log(`  - NANO: ${nanoClusters.length} clusters`);
  console.log(`  - NANO TARGET: ${LEAF_CLUSTER_TARGET}`);
  console.log(`  - NANO MIN COUNT: ${minNanoCount}`);
  console.log(`  - NANO MAX COUNT: ${maxNanoCount}`);
  console.log(`  - AVATARS: ${mockArtists.length} avatars`);

  startupProfile = {
    ...startupProfile,
    schemaMs: Math.round((schemaReadAt - loadStartedAt) * 10) / 10,
    sqlMs: Math.round((dbLoadedAt - schemaReadAt) * 10) / 10,
    prepareAndSpatialSortMs: Math.round((rowsPreparedAt - dbLoadedAt) * 10) / 10,
    hierarchyMs: Math.round((hierarchyBuiltAt - rowsPreparedAt) * 10) / 10,
    artistMaterializationMs: Math.round((artistsBuiltAt - hierarchyBuiltAt) * 10) / 10,
    loadTotalMs: Math.round((artistsBuiltAt - loadStartedAt) * 10) / 10
  };

  validRows.length = 0;
  validDbRows.length = 0;
  canonicalResult.rows = null;
  rebuildNanoIndexes();
}

function seedRandom(seed) {
  var mask = 0xffffffff;
  var m_w = (123456789 + seed) & mask;
  var m_z = (987654321 - seed) & mask;
  return function() {
    m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
    m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
    return (((m_z << 16) + m_w) >>> 0) / 4294967296;
  };
}

const PARIS_DEMO_ZONE_CATALOG_PATH = path.resolve(
  __dirname,
  '../../src/features/globe/data/paris-quartiers.geojson'
);
const GRAND_PARIS_DEMO_ZONE_CATALOG_PATH = path.resolve(
  __dirname,
  '../../public/map/grand-paris-subzones.geojson'
);
const DETERMINISTIC_NANO_CLUSTER_COUNT = 1664;

function getDemoGeometryBbox(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (
      coordinates.length >= 2
      && Number.isFinite(Number(coordinates[0]))
      && Number.isFinite(Number(coordinates[1]))
    ) {
      const lng = Number(coordinates[0]);
      const lat = Number(coordinates[1]);
      bounds[0] = Math.min(bounds[0], lng);
      bounds[1] = Math.min(bounds[1], lat);
      bounds[2] = Math.max(bounds[2], lng);
      bounds[3] = Math.max(bounds[3], lat);
      return;
    }
    for (const child of coordinates) visit(child);
  };
  visit(geometry?.coordinates);
  return bounds.every(Number.isFinite) ? bounds : null;
}

function getDemoGeometryPolygons(geometry) {
  if (geometry?.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }
  if (geometry?.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }
  return [];
}

function isPointInsideDemoRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  const [pointLng, pointLat] = point;
  let inside = false;

  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (!Array.isArray(current) || !Array.isArray(previous)) continue;
    const currentLng = Number(current[0]);
    const currentLat = Number(current[1]);
    const previousLng = Number(previous[0]);
    const previousLat = Number(previous[1]);
    if (![currentLng, currentLat, previousLng, previousLat].every(Number.isFinite)) continue;

    const crossesLatitude = (currentLat > pointLat) !== (previousLat > pointLat);
    if (!crossesLatitude) continue;
    const intersectionLng = (
      ((previousLng - currentLng) * (pointLat - currentLat))
      / (previousLat - currentLat)
    ) + currentLng;
    if (pointLng < intersectionLng) inside = !inside;
  }

  return inside;
}

function isPointInsideDemoGeometry(point, geometry) {
  if (!Array.isArray(point) || point.length < 2) return false;
  const lng = Number(point[0]);
  const lat = Number(point[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;

  return getDemoGeometryPolygons(geometry).some((polygon) => {
    if (!Array.isArray(polygon) || polygon.length === 0) return false;
    if (!isPointInsideDemoRing([lng, lat], polygon[0])) return false;
    return polygon.slice(1).every((hole) => !isPointInsideDemoRing([lng, lat], hole));
  });
}

function getDemoGeometryBoundaryDistanceMeters(point, geometry) {
  if (!isPointInsideDemoGeometry(point, geometry)) return 0;
  const [pointLng, pointLat] = point;
  const longitudeMeters = 111_320 * Math.max(0.2, Math.cos(pointLat * Math.PI / 180));
  const latitudeMeters = 110_540;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;

  for (const polygon of getDemoGeometryPolygons(geometry)) {
    for (const ring of polygon) {
      if (!Array.isArray(ring)) continue;
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        if (!Array.isArray(start) || !Array.isArray(end)) continue;
        const startX = (Number(start[0]) - pointLng) * longitudeMeters;
        const startY = (Number(start[1]) - pointLat) * latitudeMeters;
        const endX = (Number(end[0]) - pointLng) * longitudeMeters;
        const endY = (Number(end[1]) - pointLat) * latitudeMeters;
        if (![startX, startY, endX, endY].every(Number.isFinite)) continue;
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
        const interpolation = segmentLengthSquared > 0
          ? Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / segmentLengthSquared))
          : 0;
        const nearestX = startX + deltaX * interpolation;
        const nearestY = startY + deltaY * interpolation;
        minimumDistanceSquared = Math.min(
          minimumDistanceSquared,
          nearestX * nearestX + nearestY * nearestY,
        );
      }
    }
  }

  return Number.isFinite(minimumDistanceSquared) ? Math.sqrt(minimumDistanceSquared) : 0;
}

function slugifyDemoZone(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' et ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function loadGrandParisDemoZones() {
  try {
    const parisPayload = JSON.parse(fs.readFileSync(PARIS_DEMO_ZONE_CATALOG_PATH, 'utf8'));
    const grandParisPayload = JSON.parse(fs.readFileSync(GRAND_PARIS_DEMO_ZONE_CATALOG_PATH, 'utf8'));
    const parisZones = (Array.isArray(parisPayload?.features) ? parisPayload.features : [])
      .map((feature) => {
        const properties = feature?.properties ?? {};
        const bbox = getDemoGeometryBbox(feature?.geometry);
        const arrondissement = Number(properties.c_ar);
        const arrondissementPart = Number.isFinite(arrondissement)
          ? `${String(arrondissement).padStart(2, '0')}e`
          : '00e';
        const name = String(properties.l_qu ?? 'Quartier');
        const labelLng = Number(properties.geom_x_y?.lon);
        const labelLat = Number(properties.geom_x_y?.lat);
        if (!bbox) return null;
        return {
          id: `paris_${arrondissementPart}_${slugifyDemoZone(name)}`,
          name,
          communeCode: '75056',
          communeName: 'Paris',
          departmentCode: '75',
          parentZoneId: null,
          geometry: feature.geometry,
          bbox,
          labelPoint: Number.isFinite(labelLng) && Number.isFinite(labelLat)
            ? [labelLng, labelLat]
            : [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        };
      });
    const grandParisZones = (Array.isArray(grandParisPayload?.features) ? grandParisPayload.features : [])
      .map((feature) => {
        const properties = feature?.properties ?? {};
        const bbox = getDemoGeometryBbox(feature?.geometry);
        const communeCode = String(properties.parentCode ?? properties.arrondissementCode ?? '').trim();
        if (!bbox || !communeCode) return null;
        return {
          id: String(properties.zoneId),
          name: String(properties.label ?? properties.zoneId),
          communeCode,
          communeName: String(properties.parentLabel ?? 'Grand Paris'),
          departmentCode: communeCode.slice(0, 2),
          parentZoneId: String(properties.parentZoneId ?? `grand_paris_commune_${communeCode}`),
          geometry: feature.geometry,
          bbox,
          labelPoint: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
        };
      });

    return [...parisZones, ...grandParisZones]
      .filter(Boolean)
      .sort((left, right) => (
        left.departmentCode.localeCompare(right.departmentCode)
        || left.communeCode.localeCompare(right.communeCode)
        || left.labelPoint[0] - right.labelPoint[0]
        || left.labelPoint[1] - right.labelPoint[1]
        || left.name.localeCompare(right.name)
      ));
  } catch (error) {
    console.warn('[Deterministic Mock] Grand Paris zone catalogue unavailable:', error.message);
    return [];
  }
}

const GRAND_PARIS_DEMO_ZONES = loadGrandParisDemoZones();
const grandParisDemoZoneAvatarOrdinals = new Map();
const grandParisDemoZoneUsedCells = new Map();

function getGrandParisDemoZoneForNano(nanoIndex) {
  if (GRAND_PARIS_DEMO_ZONES.length === 0) return null;
  const zoneIndex = Math.min(
    GRAND_PARIS_DEMO_ZONES.length - 1,
    Math.floor((nanoIndex * GRAND_PARIS_DEMO_ZONES.length) / DETERMINISTIC_NANO_CLUSTER_COUNT)
  );
  return GRAND_PARIS_DEMO_ZONES[zoneIndex];
}

function getGrandParisDemoZoneGeography(zone) {
  if (!zone) return {};
  const communeCode = String(zone.communeCode ?? '');
  const communeName = String(zone.communeName ?? 'Grand Paris');
  return {
    city: communeName,
    city_id: `commune-${communeCode}`,
    city_name: communeName,
    district: zone.name,
    district_id: zone.id,
    district_name: zone.name,
    commune_id: communeCode,
    commune_name: communeName,
    department_code: zone.departmentCode,
    parent_zone_id: zone.parentZoneId ?? zone.id,
    parent_code: communeCode,
    zone_id: zone.id,
    zone_name: zone.name,
  };
}

function getDispersedGrandParisDemoAvatarPosition(zone) {
  if (!zone) return null;
  const [west, south, east, north] = zone.bbox;
  const longitudeSpan = east - west;
  const latitudeSpan = north - south;
  if (!(longitudeSpan > 0) || !(latitudeSpan > 0)) return null;

  // The local fallback used to scatter points across each zone's rectangular
  // bbox. That made points leak across irregular district boundaries even
  // though their zone_id was correct. Keep the deterministic grid, but accept
  // cells only when their centre is inside the exact Polygon/MultiPolygon and
  // has enough geographic padding for the avatar marker.
  const columns = 64;
  const rows = 48;
  const capacity = columns * rows;
  const ordinal = grandParisDemoZoneAvatarOrdinals.get(zone.id) ?? 0;
  grandParisDemoZoneAvatarOrdinals.set(zone.id, ordinal + 1);
  const usedCells = grandParisDemoZoneUsedCells.get(zone.id) ?? new Set();
  grandParisDemoZoneUsedCells.set(zone.id, usedCells);

  const findCandidate = (minimumBoundaryMeters) => {
    for (let attempt = 0; attempt < capacity; attempt += 1) {
      const shuffledCell = ((ordinal + attempt) * 1543) % capacity;
      if (usedCells.has(shuffledCell)) continue;
      const column = shuffledCell % columns;
      const row = Math.floor(shuffledCell / columns);
      const jitterX = ((stableHash(`${zone.id}:${shuffledCell}:x`) % 1001) / 1000 - 0.5) * 0.56;
      const jitterY = ((stableHash(`${zone.id}:${shuffledCell}:y`) % 1001) / 1000 - 0.5) * 0.56;
      const point = [
        west + longitudeSpan * ((column + 0.5 + jitterX) / columns),
        south + latitudeSpan * ((row + 0.5 + jitterY) / rows),
      ];
      if (!isPointInsideDemoGeometry(point, zone.geometry)) continue;
      if (
        minimumBoundaryMeters > 0
        && getDemoGeometryBoundaryDistanceMeters(point, zone.geometry) < minimumBoundaryMeters
      ) {
        continue;
      }
      usedCells.add(shuffledCell);
      return point;
    }
    return null;
  };

  // Prefer the same 26 m safety inset used by the validated Charonne fixture.
  // Very narrow IRIS polygons may not contain such a point, so retain strict
  // polygon containment as the non-negotiable fallback.
  return findCandidate(26)
    ?? findCandidate(10)
    ?? findCandidate(0)
    ?? (isPointInsideDemoGeometry(zone.labelPoint, zone.geometry) ? zone.labelPoint : null);
}

function getContainedDemoAvatarPosition(zone, stableId) {
  let lastContainedPosition = null;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const position = getDispersedGrandParisDemoAvatarPosition(zone);
    if (!position) break;
    lastContainedPosition = position;
    const safeRecord = applyParisLandmarkAvatarSafetyToRecord({
      lng: position[0],
      lat: position[1],
    }, stableId);
    const safePosition = [Number(safeRecord.lng), Number(safeRecord.lat)];
    if (isPointInsideDemoGeometry(safePosition, zone.geometry)) return safePosition;
  }
  return lastContainedPosition;
}

function getDemoZoneForAvatar(avatar) {
  const zoneId = String(avatar?.zone_id ?? avatar?.district_id ?? '').trim();
  if (!zoneId) return null;
  const exactZone = GRAND_PARIS_DEMO_ZONES.find((zone) => zone.id === zoneId);
  if (exactZone) return exactZone;
  const aliases = getZoneLookupAliases(zoneId);
  return GRAND_PARIS_DEMO_ZONES.find((zone) => (
    aliases.includes(normalizeLookupKey(zone.name))
    || getZoneLookupAliases(zone.id).some((alias) => aliases.includes(alias))
  )) ?? null;
}

function getDemoAvatarContainmentAudit(artists = [...mockArtists, ...getGlobalCharonneOverlayArtists()]) {
  const outside = [];
  let checked = 0;
  let withoutZone = 0;

  for (const avatar of artists) {
    const zone = getDemoZoneForAvatar(avatar);
    if (!zone) {
      withoutZone += 1;
      continue;
    }
    checked += 1;
    const point = [Number(avatar.lng), Number(avatar.lat)];
    if (!isPointInsideDemoGeometry(point, zone.geometry)) {
      outside.push({
        id: String(avatar.id),
        zoneId: zone.id,
        point,
      });
    }
  }

  return {
    checked,
    withoutZone,
    outsideCount: outside.length,
    outside: outside.slice(0, 25),
  };
}

function installLocalCharonneDemoCatalogue() {
  if (!localOnlyMode) return 0;
  const charonneZone = GRAND_PARIS_DEMO_ZONES.find(
    (zone) => normalizeLookupKey(zone.name) === 'charonne'
  );
  if (!charonneZone) return 0;

  const isSyntheticCharonneEntry = (entry) => (
    entry?.is_mock === true
    && (
      normalizeLookupKey(entry.zone_name) === 'charonne'
      || getZoneLookupAliases(entry.zone_id).includes('charonne')
    )
  );
  const retainedArtists = mockArtists.filter((artist) => !isSyntheticCharonneEntry(artist));
  mockArtists.length = 0;
  mockArtists.push(...retainedArtists);

  const retainedNanoClusters = nanoClusters.filter(
    (cluster) => !(
      normalizeLookupKey(cluster.zone_name) === 'charonne'
      || getZoneLookupAliases(cluster.zone_id).includes('charonne')
    )
  );
  nanoClusters.length = 0;
  nanoClusters.push(...retainedNanoClusters);

  const charonneArtists = getCharonneStressTestArtists();
  nanoClusters.push({
    id: 'paris_charonne',
    cluster_id: 'paris_charonne',
    cluster_level: 'nano',
    point_count: charonneArtists.length,
    display_count: charonneArtists.length,
    display_count_text: formatCompactCount(charonneArtists.length),
    lng: charonneZone.labelPoint[0],
    lat: charonneZone.labelPoint[1],
    parent_cluster_id: null,
    parent_micro_id: null,
    parent_local_id: null,
    parent_mid_id: null,
    parent_macro_id: null,
    children_cluster_ids: charonneArtists.map((artist) => String(artist.id)),
    ...getGrandParisDemoZoneGeography(charonneZone),
  });
  return charonneArtists.length;
}

function generateDeterministic50K() {
  COUNTRY_CITIES.length = 0;
  COUNTRY_CITIES.push({
    id: 'city_paris',
    cluster_id: 'city_paris',
    cluster_level: 'country',
    city: 'Paris',
    city_id: 'city_paris',
    city_name: 'Paris',
    name: 'Paris',
    lng: 2.3488,
    lat: 48.8534,
    point_count: 0,
    display_count: 0,
    display_count_text: '0'
  });
  macroClusters.length = 0;
  midClusters.length = 0;
  localClusters.length = 0;
  microClusters.length = 0;
  nanoClusters.length = 0;
  mockArtists.length = 0;
  charonneFixtureReplacementActive = false;
  globalCharonneFixtureById = new Map();
  grandParisDemoZoneAvatarOrdinals.clear();
  grandParisDemoZoneUsedCells.clear();

  const rand = seedRandom(42);

  const centerLng = 2.3488;
  const centerLat = 48.8534;

  // 13 hierarchy branches summing up to exactly 50,000. Their leaf points
  // are distributed across the complete Grand Paris subdivision catalogue.
  const MACRO_COUNTS = [9500, 5800, 4800, 4200, 3800, 3500, 3200, 3000, 2800, 2600, 2400, 2300, 2100];
  const macroCoords = [];
  
  // Center (Paris Notre Dame / Opera)
  macroCoords.push({ lng: centerLng, lat: centerLat });
  // Inner ring: 6 centers (radius ~0.02)
  for (let i = 0; i < 6; i++) {
    const angle = (i * 2 * Math.PI) / 6;
    macroCoords.push({
      lng: centerLng + Math.sin(angle) * 0.025 * 1.3,
      lat: centerLat + Math.cos(angle) * 0.025
    });
  }
  // Outer ring: 6 centers (radius ~0.055)
  for (let i = 0; i < 6; i++) {
    const angle = (i * 2 * Math.PI) / 6 + 0.3;
    macroCoords.push({
      lng: centerLng + Math.sin(angle) * 0.055 * 1.3,
      lat: centerLat + Math.cos(angle) * 0.055
    });
  }

  const instruments = ["guitare_elec", "batteur", "guitariste", "dj", "chanteur", "compositeur", "clavier", "violoniste", "saxo", "trompettiste"];

  let artistIdCounter = 0;

  for (let k = 0; k < 13; k++) {
    const macroId = `mock_macro_${k}`;
    const macroCount = MACRO_COUNTS[k];
    const mCoords = macroCoords[k];

    const midCount1 = Math.round(macroCount * 0.53);
    const midCount2 = macroCount - midCount1;
    const midCounts = [midCount1, midCount2];

    const childMidIds = [];

    for (let mIdx = 0; mIdx < 2; mIdx++) {
      const midId = `mock_mid_${midClusters.length}`;
      const midCount = midCounts[mIdx];
      childMidIds.push(midId);

      const midAngle = k * 1.5 + (mIdx === 0 ? 0 : Math.PI);
      const midLng = mCoords.lng + Math.cos(midAngle) * 0.012;
      const midLat = mCoords.lat + Math.sin(midAngle) * 0.012;

      const locProps = [0.28, 0.26, 0.24, 0.22];
      let locCountSum = 0;
      const locCounts = [];
      for (let i = 0; i < 3; i++) {
        const c = Math.round(midCount * locProps[i]);
        locCounts.push(c);
        locCountSum += c;
      }
      locCounts.push(midCount - locCountSum);

      const childLocalIds = [];

      for (let lIdx = 0; lIdx < 4; lIdx++) {
        const localId = `mock_local_${localClusters.length}`;
        const localCount = locCounts[lIdx];
        childLocalIds.push(localId);

        const localAngle = midAngle + lIdx * Math.PI / 2;
        const localLng = midLng + Math.cos(localAngle) * 0.0062;
        const localLat = midLat + Math.sin(localAngle) * 0.0062;

        const micProps = [0.27, 0.25, 0.24, 0.24];
        let micCountSum = 0;
        const micCounts = [];
        for (let i = 0; i < 3; i++) {
          const c = Math.round(localCount * micProps[i]);
          micCounts.push(c);
          micCountSum += c;
        }
        micCounts.push(localCount - micCountSum);

        const childMicroIds = [];

        for (let mcIdx = 0; mcIdx < 4; mcIdx++) {
          const microId = `mock_micro_${microClusters.length}`;
          const microCount = micCounts[mcIdx];
          childMicroIds.push(microId);

          const microAngle = localAngle + mcIdx * Math.PI / 2;
          const microLng = localLng + Math.cos(microAngle) * 0.0028;
          const microLat = localLat + Math.sin(microAngle) * 0.0028;

          const nanoProps = [0.27, 0.25, 0.24, 0.24];
          let nanoCountSum = 0;
          const nanoCounts = [];
          for (let i = 0; i < 3; i++) {
            const c = Math.round(microCount * nanoProps[i]);
            nanoCounts.push(c);
            nanoCountSum += c;
          }
          nanoCounts.push(microCount - nanoCountSum);

          const childNanoIds = [];

          for (let nIdx = 0; nIdx < 4; nIdx++) {
            const nanoId = `mock_nano_${nanoClusters.length}`;
            const nanoCount = nanoCounts[nIdx];
            childNanoIds.push(nanoId);

            const nanoAngle = microAngle + nIdx * Math.PI / 2;
            const grandParisZone = getGrandParisDemoZoneForNano(nanoClusters.length);
            const [zoneWest, zoneSouth, zoneEast, zoneNorth] = grandParisZone?.bbox ?? [];
            const zoneLngSpan = Number(zoneEast) - Number(zoneWest);
            const zoneLatSpan = Number(zoneNorth) - Number(zoneSouth);
            const hasUsableZoneBounds = grandParisZone
              && Number.isFinite(zoneLngSpan)
              && Number.isFinite(zoneLatSpan)
              && zoneLngSpan > 0
              && zoneLatSpan > 0;
            const nanoPosition = hasUsableZoneBounds
              ? getDispersedGrandParisDemoAvatarPosition(grandParisZone)
              : null;
            const nanoLng = nanoPosition
              ? nanoPosition[0]
              : microLng + Math.cos(nanoAngle) * 0.0012;
            const nanoLat = nanoPosition
              ? nanoPosition[1]
              : microLat + Math.sin(nanoAngle) * 0.0012;
            const zoneGeography = getGrandParisDemoZoneGeography(grandParisZone);

            const nanoObj = {
              id: nanoId,
              cluster_level: 'nano',
              point_count: nanoCount,
              display_count: nanoCount,
              display_count_text: formatCompactCount(nanoCount),
              lng: nanoLng,
              lat: nanoLat,
              parent_cluster_id: microId,
              parent_micro_id: microId,
              parent_local_id: localId,
              parent_mid_id: midId,
              parent_macro_id: macroId,
              children_cluster_ids: [],
              ...zoneGeography
            };
            nanoClusters.push(nanoObj);

            for (let a = 0; a < nanoCount; a++) {
              const artistId = `mock_artist_${artistIdCounter++}`;
              const gradeLevel = getStableFallbackGradeLevel(artistId);
              const gradeStars = Math.min(gradeLevel, 5);
              const role = ARTIST_ROLE_DEFINITIONS[(artistIdCounter - 1) % ARTIST_ROLE_DEFINITIONS.length];
              const avatarId = role?.key ?? 'avatar_4';
              
              const artistAngle = rand() * 2 * Math.PI;
              const artistRadius = 0.0001 + rand() * 0.00035;
              const dispersedPosition = hasUsableZoneBounds
                ? getContainedDemoAvatarPosition(grandParisZone, artistId)
                : null;
              const aLng = dispersedPosition?.[0]
                ?? nanoLng + Math.cos(artistAngle) * artistRadius;
              const aLat = dispersedPosition?.[1]
                ?? nanoLat + Math.sin(artistAngle) * artistRadius;

              const artistObj = {
                id: artistId,
                cluster_level: 'none',
                point_count: null,
                cluster_id: null,
                instrument: role?.label ?? instruments[artistIdCounter % instruments.length],
                musician_id: artistId,
                avatar_id: avatarId,
                avatar_icon_id: avatarId,
                identity_seed: artistId,
                display_name: `Artiste MeeWav ${String(artistIdCounter).padStart(5, '0')}`,
                profile_slug: artistId,
                handle: `@${artistId}`,
                artist_rank: 'member',
                primary_role_key: avatarId,
                primary_role_label: role?.label ?? 'Artiste',
                grade_level: gradeLevel,
                grade_stars: gradeStars,
                grade_tier: getArtistGradeTier(gradeLevel),
                grade_color: '#8B5CF6',
                parent_cluster_id: nanoId,
                parent_count: nanoCount,
                parent_nano_id: nanoId,
                parent_micro_id: microId,
                parent_local_id: localId,
                parent_mid_id: midId,
                parent_macro_id: macroId,
                lng: aLng,
                lat: aLat,
                sibling_count: 1,
                sibling_index: 0,
                needs_spiderfy: false,
                stacked_group_id: null,
                stack_radius_m: 0,
                icon_offset_x: 0,
                icon_offset_y: 0,
                is_mock: true,
                render_rank: artistIdCounter,
                address_label: grandParisZone
                  ? `${grandParisZone.name}, ${grandParisZone.communeName}`
                  : 'Grand Paris',
                ...zoneGeography
              };
              mockArtists.push(hasUsableZoneBounds
                ? artistObj
                : applyParisLandmarkAvatarSafetyToRecord(artistObj, artistId));
              nanoObj.children_cluster_ids.push(artistId);
            }
          }

          microClusters.push({
            id: microId,
            cluster_level: 'micro',
            point_count: microCount,
            display_count: microCount,
            display_count_text: formatCompactCount(microCount),
            lng: microLng,
            lat: microLat,
            parent_cluster_id: localId,
            parent_local_id: localId,
            parent_mid_id: midId,
            parent_macro_id: macroId,
            children_cluster_ids: childNanoIds
          });
        }

        localClusters.push({
          id: localId,
          cluster_level: 'local',
          point_count: localCount,
          display_count: localCount,
          display_count_text: formatCompactCount(localCount),
          lng: localLng,
          lat: localLat,
          parent_cluster_id: midId,
          parent_mid_id: midId,
          parent_macro_id: macroId,
          children_cluster_ids: childMicroIds
        });
      }

      midClusters.push({
        id: midId,
        cluster_level: 'mid',
        point_count: midCount,
        display_count: midCount,
        display_count_text: formatCompactCount(midCount),
        lng: midLng,
        lat: midLat,
        parent_cluster_id: macroId,
        parent_macro_id: macroId,
        children_cluster_ids: childLocalIds
      });
    }

    macroClusters.push({
      id: macroId,
      cluster_level: 'macro',
      point_count: macroCount,
      display_count: macroCount,
      display_count_text: formatCompactCount(macroCount),
      lng: mCoords.lng,
      lat: mCoords.lat,
      parent_cluster_id: null,
      children_cluster_ids: childMidIds
    });
  }

  // Refine coordinates of parents to be exact weighted centroids of their children
  for (const n of nanoClusters) {
    let sumLng = 0, sumLat = 0, count = 0;
    for (const aId of n.children_cluster_ids) {
      const a = mockArtists[parseInt(aId.replace('mock_artist_', ''), 10)];
      if (a) {
        sumLng += a.lng;
        sumLat += a.lat;
        count++;
      }
    }
    if (count > 0) {
      n.lng = sumLng / count;
      n.lat = sumLat / count;
    }
  }

  for (const m of microClusters) {
    let sumLng = 0, sumLat = 0, totalW = 0;
    for (const nId of m.children_cluster_ids) {
      const n = nanoClusters[parseInt(nId.replace('mock_nano_', ''), 10)];
      if (n) {
        sumLng += n.lng * n.point_count;
        sumLat += n.lat * n.point_count;
        totalW += n.point_count;
      }
    }
    if (totalW > 0) {
      m.lng = sumLng / totalW;
      m.lat = sumLat / totalW;
    }
  }

  for (const l of localClusters) {
    let sumLng = 0, sumLat = 0, totalW = 0;
    for (const mId of l.children_cluster_ids) {
      const m = microClusters[parseInt(mId.replace('mock_micro_', ''), 10)];
      if (m) {
        sumLng += m.lng * m.point_count;
        sumLat += m.lat * m.point_count;
        totalW += m.point_count;
      }
    }
    if (totalW > 0) {
      l.lng = sumLng / totalW;
      l.lat = sumLat / totalW;
    }
  }

  for (const mid of midClusters) {
    let sumLng = 0, sumLat = 0, totalW = 0;
    for (const lId of mid.children_cluster_ids) {
      const l = localClusters[parseInt(lId.replace('mock_local_', ''), 10)];
      if (l) {
        sumLng += l.lng * l.point_count;
        sumLat += l.lat * l.point_count;
        totalW += l.point_count;
      }
    }
    if (totalW > 0) {
      mid.lng = sumLng / totalW;
      mid.lat = sumLat / totalW;
    }
  }

  for (const macro of macroClusters) {
    let sumLng = 0, sumLat = 0, totalW = 0;
    for (const midId of macro.children_cluster_ids) {
      const mid = midClusters[parseInt(midId.replace('mock_mid_', ''), 10)];
      if (mid) {
        sumLng += mid.lng * mid.point_count;
        sumLat += mid.lat * mid.point_count;
        totalW += mid.point_count;
      }
    }
    if (totalW > 0) {
      macro.lng = sumLng / totalW;
      macro.lat = sumLat / totalW;
    }
  }

  const localCharonneArtistCount = installLocalCharonneDemoCatalogue();
  const catalogueArtistCount = mockArtists.length + localCharonneArtistCount;
  COUNTRY_CITIES[0].point_count = catalogueArtistCount;
  COUNTRY_CITIES[0].display_count = catalogueArtistCount;
  COUNTRY_CITIES[0].display_count_text = formatCompactCount(catalogueArtistCount);

  console.log(`[Deterministic Mock] Pre-generated ${catalogueArtistCount} artists in 13 macro, 26 mid, 104 local, 416 micro, ${nanoClusters.length} nano clusters.`);
}

// Generate the stable tree on server startup as a fallback template
// generateDeterministic50K();

function stableHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function stableHashInt(input, modulo = 1000000) {
  return stableHash(String(input)) % modulo;
}

function getArtistGradeTier(stars) {
  switch (Number(stars)) {
    case 1: return 'rookie';
    case 2: return 'rising';
    case 3: return 'confirmed';
    case 4: return 'premium';
    case 5: return 'master';
    case 6: return 'legendary';
    default: return null;
  }
}

function getArtistGradeColor(level) {
  switch (Math.max(1, Math.min(6, Math.round(Number(level) || 1)))) {
    case 2: return '#F59E0B';
    case 3: return '#34D399';
    case 4: return '#EC4899';
    case 5: return '#2563FF';
    case 6: return '#6A00FF';
    default: return '#FFFFFF';
  }
}

function getStableFallbackGradeLevel(input) {
  const roll = stableHashInt(input, 10000) / 10000;

  if (roll < 0.28) return 1;
  if (roll < 0.56) return 2;
  if (roll < 0.79) return 3;
  if (roll < 0.93) return 4;
  if (roll < 0.99) return 5;
  return 6;
}

function getStableFallbackGradeStars(input) {
  return Math.min(getStableFallbackGradeLevel(input), 5);
}

function getArtistGradeLevel(artist) {
  const fromLevel = Number(artist?.grade_level);
  if (Number.isInteger(fromLevel) && fromLevel >= 1 && fromLevel <= 6) return fromLevel;

  const fromStars = Number(artist?.grade_stars);
  if (Number.isInteger(fromStars) && fromStars >= 1 && fromStars <= 6) return fromStars;

  return getStableFallbackGradeLevel(artist?.id ?? artist?.profile_id ?? artist?.display_name ?? 'meewav-artist');
}

function getArtistGradeStars(artist) {
  return Math.min(getArtistGradeLevel(artist), 5);
}

function getExplicitGoldenLikesCount(artist) {
  const rawValue = artist?.golden_likes_count ?? artist?.goldenLikesCount;
  if (rawValue === null || rawValue === undefined || rawValue === '') return null;

  const value = Number(rawValue);
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}

function getStableFallbackGoldenLikesCount(artist) {
  const explicitValue = getExplicitGoldenLikesCount(artist);
  if (explicitValue !== null) return explicitValue;

  const hash = stableHashInt(artist?.id ?? artist?.profile_id ?? artist?.display_name ?? 'meewav-artist');
  return 24 + (hash % 476);
}

async function getArtistGradesAuditRows() {
  const functionAudit = await pool.query(`
    SELECT table_name, total_artists, missing_grade_count, grade_1_count, grade_2_count, grade_3_count, grade_4_count, grade_5_count
    FROM public.meewav_artist_grades_audit()
  `).catch(() => null);

  if (functionAudit?.rows?.length) {
    return functionAudit.rows;
  }

  const rows = [];
  for (const tableName of ['mock_artists', 'musicians']) {
    const exists = await pool.query('SELECT to_regclass($1) AS table_regclass', [`public.${tableName}`]).catch(() => null);
    if (!exists?.rows?.[0]?.table_regclass) continue;

    const result = await pool.query(`
      SELECT
        $1::text AS table_name,
        count(*)::integer AS total_artists,
        count(*) FILTER (WHERE grade_stars IS NULL)::integer AS missing_grade_count,
        count(*) FILTER (WHERE grade_stars = 1)::integer AS grade_1_count,
        count(*) FILTER (WHERE grade_stars = 2)::integer AS grade_2_count,
        count(*) FILTER (WHERE grade_stars = 3)::integer AS grade_3_count,
        count(*) FILTER (WHERE grade_stars = 4)::integer AS grade_4_count,
        count(*) FILTER (WHERE grade_stars = 5)::integer AS grade_5_count
      FROM public.${tableName}
    `, [tableName]).catch(() => null);

    if (result?.rows?.length) {
      rows.push(...result.rows);
    }
  }

  if (rows.length === 0 && mockArtists.length > 0) {
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let missingGradeCount = 0;

    for (const artist of mockArtists) {
      const gradeStars = getArtistGradeStars(artist);
      if (gradeStars >= 1 && gradeStars <= 5) {
        distribution[gradeStars] += 1;
      } else {
        missingGradeCount += 1;
      }
    }

    rows.push({
      table_name: 'memory_fallback_artists',
      total_artists: mockArtists.length,
      missing_grade_count: missingGradeCount,
      grade_1_count: distribution[1],
      grade_2_count: distribution[2],
      grade_3_count: distribution[3],
      grade_4_count: distribution[4],
      grade_5_count: distribution[5]
    });
  }

  return rows;
}

function getGlobalAvatarRank(artist) {
  return artist.render_rank ?? stableHashInt(artist.id);
}

function getStableArtistLabelPriority(artist) {
  const explicitPriority = Number(artist?.labelPriority);
  if (Number.isFinite(explicitPriority)) return explicitPriority;

  const rank = Number.isFinite(Number(artist?.render_rank)) ? Number(artist.render_rank) : '';
  return 100 + stableHashInt(`${rank}:${artist?.id ?? ''}`, 10000);
}

function getStableArtistLabelTier(artist) {
  const explicitTier = Number(artist?.labelTier);
  if (Number.isInteger(explicitTier) && explicitTier >= 1 && explicitTier <= 3) return explicitTier;
  return 1 + stableHashInt(artist?.id ?? '', 3);
}

function selectAllCloseViewArtists(insideCandidates) {
  return insideCandidates.sort((a, b) => a.render_rank - b.render_rank);
}

function selectAvatarLodForTile(insideCandidates, _z) {
  // Close-view tiles are exhaustive. Density is controlled by the active role
  // filters in MapLibre, not by silently removing profiles according to zoom.
  // This keeps a zone total stable between z15, z16 and z17.
  return selectAllCloseViewArtists(insideCandidates);
}

function isArtistInsideBounds(p, z, x, y, margin = 64) {
  const pxPy = lngLatToTilePixels(p.lng, p.lat, z, x, y);
  return pxPy.x >= -margin && pxPy.x <= 4096 + margin && pxPy.y >= -margin && pxPy.y <= 4096 + margin;
}

const CLUSTER_V2 = {
  enabled: true,

  // Plus le zoom monte, plus le radius diminue.
  radiusByZ: [
    { maxZ: 9, radiusMeters: 5000 },
    { maxZ: 10, radiusMeters: 3000 },
    { maxZ: 11, radiusMeters: 1800 },
    { maxZ: 12, radiusMeters: 1000 },
    { maxZ: 13, radiusMeters: 650 },
    { maxZ: 14, radiusMeters: 380 },
    { maxZ: 15, radiusMeters: 220 },
    { maxZ: 16, radiusMeters: 120 },
    { maxZ: 17, radiusMeters: 70 }
  ],

  // The city camera reaches the requested avatar view around map zoom 15.2.
  // Serve leaf avatars from canonical z15 so they are already available there.
  minAvatarZoom: 15
};

function getClusterRadiusMetersForZoom(z) {
  const rule = CLUSTER_V2.radiusByZ.find(r => z <= r.maxZ);
  return rule ? rule.radiusMeters : 50;
}

function lngLatToMeters(lng, lat) {
  const x = lng * 111320 * Math.cos(lat * Math.PI / 180);
  const y = lat * 110540;
  return { x, y };
}

function getClusterLevelForZoom(z) {
  if (z <= 9) return "macro";
  if (z <= 11) return "mid";
  if (z <= 13) return "local";
  // V4: from z14 onward, visible clusters are leaf/nano groups.
  // This matches the desired red circles: each circle represents one
  // neighborhood rectangle/group that opens to about 80-130 avatars.
  return "nano";
}

function buildSpatialClustersForZoom(artists, z) {
  const radiusMeters = getClusterRadiusMetersForZoom(z);
  const cells = new Map();

  for (const artist of artists) {
    const lng = Number(artist.lng);
    const lat = Number(artist.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const p = lngLatToMeters(lng, lat);
    const cellX = Math.floor(p.x / radiusMeters);
    const cellY = Math.floor(p.y / radiusMeters);
    const cellId = `${z}:${cellX}:${cellY}`;

    if (!cells.has(cellId)) {
      cells.set(cellId, {
        id: `cluster_v2_${cellId.replaceAll(":", "_")}`,
        z,
        cellX,
        cellY,
        artists: [],
        sumLng: 0,
        sumLat: 0
      });
    }

    const cell = cells.get(cellId);
    cell.artists.push(artist);
    cell.sumLng += lng;
    cell.sumLat += lat;
  }

  const clusters = [];

  for (const cell of cells.values()) {
    const count = cell.artists.length;
    if (count <= 0) continue;

    clusters.push({
      id: cell.id,
      cluster_id: cell.id,
      cluster_level: getClusterLevelForZoom(z),
      point_count: count,
      real_count: count,
      display_count: count,
      display_count_text: formatCompactCount(count),
      lng: Number((cell.sumLng / count).toFixed(7)),
      lat: Number((cell.sumLat / count).toFixed(7)),
      children_count: count,
      z
    });
  }

  return clusters;
}

function getClustersForZoom(z) {
  if (z <= 9) return COUNTRY_CITIES;
  if (z <= 10) return macroClusters;
  if (z <= 12) return midClusters;
  if (z <= 13) return localClusters;
  // V7: high city view opens the final server-authoritative leaf sectors.
  // These are the circles the user sees before zooming into avatars.
  return nanoClusters;
}

function getMockPointsForTile(z, x, y, options = {}) {
  const points = [];
  const stressOnly = options.stressOnly === true;
  const margin = stressOnly ? 128 : 64;
  lastMockTileStats = null;

  const checkAndPrepare = (p) => {
    const pxPy = lngLatToTilePixels(p.lng, p.lat, z, x, y);

    if (
      pxPy.x < -margin ||
      pxPy.x > 4096 + margin ||
      pxPy.y < -margin ||
      pxPy.y > 4096 + margin
    ) {
      return null;
    }

    const isAvatar = (p.cluster_level ?? "avatar") === "avatar";
    const sectorId = p.sector_id ?? p.leaf_id ?? p.parent_nano_id ?? p.parent_cluster_id ?? p.cluster_id ?? null;
    const gradeLevel = isAvatar ? getArtistGradeLevel(p) : null;
    const gradeStars = isAvatar ? Math.min(gradeLevel, 5) : null;
    const primaryRoleKey = isAvatar ? getArtistPrimaryRoleKey(p) : null;
    const primaryRoleLabel = isAvatar ? getArtistPrimaryRoleLabel(p) : null;
    const geography = deriveCanonicalArtistGeography(p);

    return {
      id: String(p.id),
      point_count: p.point_count ?? null,
      real_count: p.real_count ?? p.point_count ?? null,
      display_count: p.display_count ?? p.point_count ?? null,
      display_count_text:
        p.display_count_text ??
        (p.point_count !== undefined && p.point_count !== null
          ? formatCompactCount(p.point_count)
          : null),
      cluster_id: p.cluster_id ?? (isAvatar ? null : String(p.id)),
      cluster_level: p.cluster_level ?? "avatar",
      sector_id: sectorId,
      leaf_id: p.leaf_id ?? sectorId,
      city: geography.city,
      city_id: geography.city_id,
      city_name: geography.city_name,
      district: geography.district,
      district_id: geography.district_id,
      district_name: geography.district_name,
      commune_id: geography.commune_id,
      commune_name: geography.commune_name,
      parent_zone_id: geography.parent_zone_id,
      parent_code: geography.parent_code,
      instrument: p.instrument ?? null,
      musician_id: isAvatar ? String(p.id) : null,
      profile_id: isAvatar ? String(p.id) : null,
      avatar_icon_id: p.avatar_icon_id ?? p.avatar_id ?? null,
      avatar_id: p.avatar_id ?? null,
      identity_seed: p.identity_seed ?? null,
      anchor_type: p.anchor_type ?? null,
      anchor_id: p.anchor_id ?? null,
      address_id: p.address_id ?? null,
      address_label: p.address_label ?? null,
      display_name: getPublicAvatarDisplayName(p),
      profile_slug: p.profile_slug ?? null,
      artist_rank: p.artist_rank ?? null,
      rank_score: p.rank_score ?? null,
      grade_level: gradeLevel,
      grade_stars: gradeStars,
      grade_tier: gradeLevel ? (p.grade_tier ?? getArtistGradeTier(gradeLevel)) : null,
      grade_color: gradeStars ? (p.grade_color ?? '#8B5CF6') : null,
      golden_likes_count: isAvatar ? getExplicitGoldenLikesCount(p) : null,
      is_current_user: p.is_current_user ?? false,
      is_host_avatar: p.is_host_avatar ?? false,
      is_mock: p.is_mock ?? (isAvatar && !p.is_current_user),
      size_scale: p.size_scale ?? 1,
      zone_id: geography.zone_id,
      zone_name: geography.zone_name,
      handle: p.handle ?? null,
      primary_role_key: primaryRoleKey,
      primary_role_label: primaryRoleLabel,
      role_keys_index: isAvatar ? getArtistRoleKeysIndex(p) : null,
      main_role: p.main_role ?? null,
      secondary_roles: p.secondary_roles ?? null,
      music_genres: p.music_genres ?? null,
      parent_cluster_id: p.parent_cluster_id ?? null,
      parent_count: p.parent_count ?? p.children_count ?? p.point_count ?? null,
      parent_nano_id: p.parent_nano_id ?? (isAvatar ? sectorId : null),
      parent_micro_id: p.parent_micro_id ?? null,
      parent_local_id: p.parent_local_id ?? null,
      parent_mid_id: p.parent_mid_id ?? null,
      parent_macro_id: p.parent_macro_id ?? null,
      sibling_count: p.sibling_count ?? null,
      sibling_index: p.sibling_index ?? null,
      needs_spiderfy: p.needs_spiderfy ?? false,
      stacked_group_id: p.stacked_group_id ?? (isAvatar ? sectorId : null),
      stack_radius_m: p.stack_radius_m ?? 0,
      icon_offset_x: p.icon_offset_x ?? 0,
      icon_offset_y: p.icon_offset_y ?? 0,
      lng: p.lng,
      lat: p.lat,
      px: pxPy.x,
      py: pxPy.y,
      render_rank: p.render_rank ?? null,
      avatar_render_rank: p.render_rank ?? null,
      labelPriority: getStableArtistLabelPriority(p),
      labelTier: getStableArtistLabelTier(p)
    };
  };

  if (stressOnly) {
    const stressCandidates = getCharonneStressTestArtists()
      .filter(artist => isArtistInsideBounds(artist, z, x, y, margin))
      .map(artist => ({
        ...artist,
        cluster_level: "avatar",
        point_count: null,
        sector_id: artist.sector_id ?? artist.zone_id,
        leaf_id: artist.leaf_id ?? artist.zone_id,
        render_rank: getGlobalAvatarRank(artist)
      }));

    for (const artist of stressCandidates) {
      const prepared = checkAndPrepare(artist);
      if (prepared) points.push(prepared);
    }

    lastMockTileStats = {
      z,
      x,
      y,
      mode: "stress-charonne",
      candidates: getCharonneStressTestArtists().length,
      inside: stressCandidates.length,
      returned: points.length
    };
    return points;
  }

  // Before the city/avatar threshold: clusters only, using the same final leaf
  // sectors that avatars will open.
  if (z < CLUSTER_V2.minAvatarZoom) {
    for (const cluster of getClustersForZoom(z)) {
      const prepared = checkAndPrepare(cluster);
      if (prepared) points.push(prepared);
    }
    lastMockTileStats = {
      z,
      x,
      y,
      mode: "clusters",
      candidates: getClustersForZoom(z).length,
      inside: points.length,
      returned: points.length
    };
    return points;
  }

  // At the transition tile zoom, carry both final leaf clusters and avatars.
  if (z === CLUSTER_V2.minAvatarZoom) {
    for (const cluster of getClustersForZoom(z)) {
      const prepared = checkAndPrepare(cluster);
      if (prepared) points.push(prepared);
    }
  }

  // Close view: individual avatars. Do not cap per tile here: the selected zone and
  // active role filters control density without silently dropping valid profiles.
  const candidatePool = getIndexedArtistsForTile(z, x, y);
  const charonneOverlayArtists = getGlobalCharonneOverlayArtists();
  const hostOverlayArtists = charonneOverlayArtists.filter(
    (artist) => artist.is_current_user === true || artist.is_host_avatar === true
  );
  const insideCandidates = filterArtistsOutsideHostReservation(candidatePool, hostOverlayArtists)
    .filter(artist => isArtistInsideBounds(artist, z, x, y))
    .map(artist => ({
      ...artist,
      cluster_level: "avatar",
      point_count: null,
      sector_id: artist.sector_id ?? artist.parent_nano_id,
      leaf_id: artist.leaf_id ?? artist.parent_nano_id,
      render_rank: getGlobalAvatarRank(artist)
    }));

  const charonneOverlayCandidates = filterArtistsOutsideHostReservation(
    charonneOverlayArtists,
    hostOverlayArtists
  )
    .filter(artist => isArtistInsideBounds(artist, z, x, y))
    .map(artist => ({
      ...artist,
      cluster_level: "avatar",
      point_count: null,
      sector_id: artist.sector_id ?? artist.zone_id,
      leaf_id: artist.leaf_id ?? artist.zone_id,
      render_rank: getGlobalAvatarRank(artist)
    }));

  const selected = selectAvatarLodForTile(insideCandidates, z);

  const selectedById = new Map(selected.map((artist) => [String(artist.id), artist]));
  for (const artist of charonneOverlayCandidates) {
    selectedById.set(String(artist.id), artist);
  }

  for (const artist of selectedById.values()) {
    const prepared = checkAndPrepare(artist);
    if (prepared) points.push(prepared);
  }

  lastMockTileStats = {
    z,
    x,
    y,
    mode: z === CLUSTER_V2.minAvatarZoom ? "hybrid" : "avatars",
    candidates: candidatePool.length,
    inside: insideCandidates.length,
    selected: selected.length,
    charonneOverlay: charonneOverlayCandidates.length,
    charonneFixtureReplacementActive,
    returned: points.length
  };

  return points;
}

function encodePointsAsMvt(z, x, y, points) {
  if (!Array.isArray(points) || points.length === 0) return EMPTY_MVT_TILE;

  const extent = 4096;
  const tile = {
    features: points
      .filter(point => Number.isFinite(point.lng) && Number.isFinite(point.lat))
      .map(point => {
        const coordinate = lngLatToTilePixels(point.lng, point.lat, z, x, y, extent);
        return {
          type: 1,
          geometry: [[Math.round(coordinate.x), Math.round(coordinate.y)]],
          tags: point,
        };
      }),
  };
  if (tile.features.length === 0) return EMPTY_MVT_TILE;

  return Buffer.from(fromGeojsonVt({ musicians: tile }, { version: 2, extent }));
}


// 3. PostGIS MVT Route
app.get('/musicians_clustered/:z/:x/:y', async (req, res) => {
  const z = parseInt(req.params.z, 10);
  const x = parseInt(req.params.x, 10);
  const y = parseInt(req.params.y, 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) {
    return res.status(400).json({ error: 'Invalid tile coordinates. Parameters z, x, y must be integers.' });
  }

  const debugTile = req.query.debug === '1';
  const perfTile = debugTile || req.query.perf === '1';
  // The local catalogue can be rebuilt while Vite remains open. Never let a
  // browser preserve an old empty tile across that recovery; production DB
  // tiles keep their short public cache.
  const cacheableTile = !localOnlyMode && !debugTile && !perfTile;
  const stressMode = req.query.stress === 'charonne' || req.query.avatarStress === 'charonne';
  const cacheMaxAgeSeconds = stressMode ? 300 : 30;
  const cacheKey = getTileCacheKey(req);
  if (debugTile) {
    console.log(`[MVT Request] z=${z}, x=${x}, y=${y} | IP: ${req.ip}`);
  }

  if (cacheableTile) {
    const cached = getCachedTile(cacheKey, cacheMaxAgeSeconds * 1000);
    if (cached) {
      setMvtHeaders(res, true, cacheMaxAgeSeconds);
      return sendMvtPayload(req, res, cached);
    }
  }

  // Zoom < 9: Return empty tile immediately unless mock hierarchy 50K is active and z >= 3
  if (z < 9) {
    if (!COUNTRY_CITIES || z < 3) {
      if (cacheableTile) setCachedTile(cacheKey, EMPTY_MVT_TILE);
      setMvtHeaders(res, cacheableTile, cacheMaxAgeSeconds);
      return sendMvtPayload(req, res, EMPTY_MVT_TILE);
    }
  }

  try {
    const startedAt = performance.now();
    const points = getMockPointsForTile(z, x, y, { stressOnly: stressMode });
    const selectedAt = performance.now();

    // The selected points are already in memory; encoding them directly avoids
    // a redundant PostGIS round-trip and survives transient DB outages.
    if (ENCODE_MVT_IN_PROCESS) {
      const mvt = encodePointsAsMvt(z, x, y, points);
      const encodedAt = performance.now();

      if (cacheableTile) setCachedTile(cacheKey, mvt || EMPTY_MVT_TILE);
      setMvtHeaders(res, cacheableTile, cacheMaxAgeSeconds);
      if (perfTile) {
        res.setHeader('X-Meewav-Tile-Select-Ms', String(Math.round((selectedAt - startedAt) * 10) / 10));
        res.setHeader('X-Meewav-Tile-Sql-Ms', '0');
        res.setHeader('X-Meewav-Tile-Total-Ms', String(Math.round((encodedAt - startedAt) * 10) / 10));
        res.setHeader('X-Meewav-Tile-Stats', JSON.stringify(lastMockTileStats || {}));
      }
      return sendMvtPayload(req, res, mvt);
    }

    const mvtQuery = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS geom
      ),
      tile AS (
        SELECT
          abs(hashtext(f.id)) AS mvt_id,
          f.id,
          f.point_count,
          f.point_count::text AS point_count_text,
          f.real_count,
          f.display_count,
          f.display_count_text,
          f.cluster_id,
          f.cluster_level,
          f.sector_id,
          f.leaf_id,
          f.city,
          f.city_id,
          f.city_name,
          f.district,
          f.district_id,
          f.district_name,
          f.commune_id,
          f.commune_name,
          f.parent_zone_id,
          f.parent_code,
          f.instrument,
          f.musician_id,
          f.profile_id,
          f.avatar_icon_id,
          f.avatar_id,
          f.identity_seed,
          f.anchor_type,
          f.anchor_id,
          f.address_id,
          f.address_label,
          f.display_name,
          f.profile_slug,
          f.artist_rank,
          f.rank_score,
          f.grade_level,
          f.grade_stars,
          f.grade_tier,
          f.grade_color,
          f.golden_likes_count,
          f.is_current_user,
          f.is_host_avatar,
          f.is_mock,
          f.size_scale,
          f.zone_id,
          f.zone_name,
          f.handle,
          f.primary_role_key,
          f.primary_role_label,
          f.role_keys_index,
          f.main_role,
          f.secondary_roles,
          f.music_genres,
          f.parent_cluster_id,
          f.parent_count,
          f.parent_nano_id,
          f.parent_micro_id,
          f.parent_local_id,
          f.parent_mid_id,
          f.parent_macro_id,
          f.sibling_count,
          f.sibling_index,
          f.needs_spiderfy,
          f.stacked_group_id,
          f.stack_radius_m,
          f.icon_offset_x,
          f.icon_offset_y,
          f.lng,
          f.lat,
          f.render_rank,
          f.avatar_render_rank,
          f."labelPriority",
          f."labelTier",
          ST_AsMVTGeom(
            ST_Transform(ST_SetSRID(ST_MakePoint(f.lng, f.lat), 4326), 3857),
            bounds.geom,
            4096,
            64,
            true
          ) AS geom
        FROM json_to_recordset($4) AS f(
          id text,
          point_count integer,
          real_count integer,
          display_count integer,
          display_count_text text,
          cluster_id text,
          cluster_level text,
          sector_id text,
          leaf_id text,
          city text,
          city_id text,
          city_name text,
          district text,
          district_id text,
          district_name text,
          commune_id text,
          commune_name text,
          parent_zone_id text,
          parent_code text,
          instrument text,
          musician_id text,
          profile_id text,
          avatar_icon_id text,
          avatar_id text,
          identity_seed text,
          anchor_type text,
          anchor_id text,
          address_id text,
          address_label text,
          display_name text,
          profile_slug text,
          artist_rank text,
          rank_score integer,
          grade_level integer,
          grade_stars integer,
          grade_tier text,
          grade_color text,
          golden_likes_count integer,
          is_current_user boolean,
          is_host_avatar boolean,
          is_mock boolean,
          size_scale double precision,
          zone_id text,
          zone_name text,
          handle text,
          primary_role_key text,
          primary_role_label text,
          role_keys_index text,
          main_role text,
          secondary_roles text,
          music_genres text,
          parent_cluster_id text,
          parent_count integer,
          parent_nano_id text,
          parent_micro_id text,
          parent_local_id text,
          parent_mid_id text,
          parent_macro_id text,
          sibling_count integer,
          sibling_index integer,
          needs_spiderfy boolean,
          stacked_group_id text,
          stack_radius_m double precision,
          icon_offset_x integer,
          icon_offset_y integer,
          lng double precision,
          lat double precision,
          render_rank bigint,
          avatar_render_rank bigint,
          "labelPriority" bigint,
          "labelTier" integer
        ), bounds
      )
      SELECT 
        (SELECT ST_AsMVT(tile, 'musicians', 4096, 'geom', 'mvt_id') FROM tile) AS mvt,
        ${debugTile ? `(SELECT json_agg(json_build_object(
          'id', id,
          'point_count', point_count,
          'real_count', real_count,
          'display_count', display_count,
          'display_count_text', display_count_text,
          'cluster_id', cluster_id,
          'cluster_level', cluster_level,
          'sector_id', sector_id,
          'leaf_id', leaf_id,
          'city', city,
          'city_id', city_id,
          'city_name', city_name,
          'district', district,
          'district_id', district_id,
          'district_name', district_name,
          'commune_id', commune_id,
          'commune_name', commune_name,
          'parent_zone_id', parent_zone_id,
          'parent_code', parent_code,
          'instrument', instrument,
          'musician_id', musician_id,
          'profile_id', profile_id,
          'avatar_icon_id', avatar_icon_id,
          'avatar_id', avatar_id,
          'identity_seed', identity_seed,
          'anchor_type', anchor_type,
          'anchor_id', anchor_id,
          'address_id', address_id,
          'address_label', address_label,
          'display_name', display_name,
          'profile_slug', profile_slug,
          'artist_rank', artist_rank,
          'rank_score', rank_score,
          'grade_level', grade_level,
          'grade_stars', grade_stars,
          'grade_tier', grade_tier,
          'grade_color', grade_color,
          'golden_likes_count', golden_likes_count,
          'is_current_user', is_current_user,
          'is_host_avatar', is_host_avatar,
          'is_mock', is_mock,
          'size_scale', size_scale,
          'zone_id', zone_id,
          'zone_name', zone_name,
          'handle', handle,
          'primary_role_key', primary_role_key,
          'primary_role_label', primary_role_label,
          'role_keys_index', role_keys_index,
          'main_role', main_role,
          'secondary_roles', secondary_roles,
          'music_genres', music_genres,
          'parent_cluster_id', parent_cluster_id,
          'parent_count', parent_count,
          'parent_nano_id', parent_nano_id,
          'parent_micro_id', parent_micro_id,
          'parent_local_id', parent_local_id,
          'parent_mid_id', parent_mid_id,
          'parent_macro_id', parent_macro_id,
          'sibling_count', sibling_count,
          'sibling_index', sibling_index,
          'needs_spiderfy', needs_spiderfy,
          'stacked_group_id', stacked_group_id,
          'stack_radius_m', stack_radius_m,
          'icon_offset_x', icon_offset_x,
          'icon_offset_y', icon_offset_y,
          'lng', lng,
          'lat', lat,
          'render_rank', render_rank,
          'avatar_render_rank', avatar_render_rank,
          'labelPriority', "labelPriority",
          'labelTier', "labelTier"
        )) FROM tile)` : `NULL::json`} AS debug_features;
    `;
    const mvtValues = [z, x, y, JSON.stringify(points)];
    const mvtResult = await withHardTimeout(pool.query(mvtQuery, mvtValues), TILE_HARD_TIMEOUT_MS);
    const queriedAt = performance.now();

    const row = mvtResult.rows[0];
    const mvt = row?.mvt;
    const debugFeatures = row?.debug_features || [];

    if (debugTile && Array.isArray(debugFeatures) && debugFeatures.length > 0) {
      console.log(`[Mock MVT Debug Features] z=${z}, x=${x}, y=${y}:`);
      debugFeatures.forEach(f => {
        if (f) {
          console.log(`  z=${z}, x=${x}, y=${y}, id=${f.id}, point_count=${f.point_count || 1}, cluster_level=${f.cluster_level}, city_name=${f.city_name}, parent_cluster_id=${f.parent_cluster_id}, parent_count=${f.parent_count}`);
        }
      });
    }

    setMvtHeaders(res, cacheableTile, cacheMaxAgeSeconds);
    if (perfTile) {
      const selectMs = Math.round((selectedAt - startedAt) * 10) / 10;
      const sqlMs = Math.round((queriedAt - selectedAt) * 10) / 10;
      const totalMs = Math.round((queriedAt - startedAt) * 10) / 10;
      res.setHeader('X-Meewav-Tile-Select-Ms', String(selectMs));
      res.setHeader('X-Meewav-Tile-Sql-Ms', String(sqlMs));
      res.setHeader('X-Meewav-Tile-Total-Ms', String(totalMs));
      res.setHeader('X-Meewav-Tile-Stats', JSON.stringify(lastMockTileStats || {}));
      console.log("[MVT Perf]", {
        z,
        x,
        y,
        selectMs,
        sqlMs,
        totalMs,
        stats: lastMockTileStats
      });
    }

    const responseTile = mvt?.length > 0 ? mvt : EMPTY_MVT_TILE;
    if (cacheableTile) setCachedTile(cacheKey, responseTile);
    return sendMvtPayload(req, res, responseTile);
  } catch (error) {
    console.warn("[MVT_TILE_TIMEOUT_OR_ERROR]", {
      z,
      x,
      y,
      message: error?.message,
      stack: error?.stack,
    });

    if (cacheableTile) setCachedTile(cacheKey, EMPTY_MVT_TILE);
    setMvtHeaders(res, cacheableTile, cacheMaxAgeSeconds);
    return sendMvtPayload(req, res, EMPTY_MVT_TILE);
  }
});

// 4. Fallback PostGIS route for non-mock data
app.get('/musicians_real/:z/:x/:y', async (req, res) => {
  const z = parseInt(req.params.z, 10);
  const x = parseInt(req.params.x, 10);
  const y = parseInt(req.params.y, 10);

  try {
    // Fetch all musicians inside the tile boundary
    const dbQuery = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS geom
      )
      SELECT
        m.id::text AS id,
        m.instrument,
        m.grade_level,
        m.grade_stars,
        m.grade_tier,
        m.grade_color,
        m.golden_likes_count,
        ST_X(ST_Transform(m.geom, 4326)) AS lng,
        ST_Y(ST_Transform(m.geom, 4326)) AS lat
      FROM musicians m, bounds
      WHERE m.geom && ST_Transform(bounds.geom, 4326);
    `;
    const dbResult = await pool.query(dbQuery, [z, x, y]);
    const musicians = dbResult.rows;

    // Run proximity grouping on ALL musicians inside this tile
    const groups = groupMusiciansByProximity(musicians, 5.0);
    const musicianOffsets = new Map();

    for (const group of groups) {
      // Sort group by ID for stability
      group.sort((a, b) => a.id.localeCompare(b.id));

      const sibling_count = group.length;
      const needs_spiderfy = sibling_count > 1;
      const stacked_group_id = needs_spiderfy ? `stack_${group[0].id}` : null;

      // Compute max pairwise distance
      let maxPairwiseDist = 0;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          const d = getDistanceMeters(group[i].lat, group[i].lng, group[j].lat, group[j].lng);
          if (d > maxPairwiseDist) {
            maxPairwiseDist = d;
          }
        }
      }
      const stack_radius_m = parseFloat(maxPairwiseDist.toFixed(2));
      const r = getSpiderfyRadius(z);

      group.forEach((m, sibling_index) => {
        let icon_offset_x = 0;
        let icon_offset_y = 0;

        if (needs_spiderfy && r > 0) {
          const circleIndex = Math.floor(sibling_index / 12);
          const indexInCircle = sibling_index % 12;
          const circleCount = Math.min(12, sibling_count - circleIndex * 12);
          const theta = (indexInCircle * 2 * Math.PI) / circleCount;
          const currentRadius = r * (1 + circleIndex * 0.5);
          icon_offset_x = Math.round(currentRadius * Math.sin(theta));
          icon_offset_y = Math.round(-currentRadius * Math.cos(theta));
        }

        musicianOffsets.set(m.id, {
          sibling_count,
          sibling_index,
          needs_spiderfy,
          stacked_group_id,
          stack_radius_m,
          icon_offset_x,
          icon_offset_y
        });
      });
    }

    let points = [];

    if (z >= 17) {
      // Return individual musicians only (no clustering)
      points = musicians.map(m => {
        const offsets = musicianOffsets.get(m.id) || {
          sibling_count: 1,
          sibling_index: 0,
          needs_spiderfy: false,
          stacked_group_id: null,
          stack_radius_m: 0,
          icon_offset_x: 0,
          icon_offset_y: 0
        };
        return {
          id: m.id,
          point_count: null,
          cluster_id: null,
          instrument: m.instrument,
          musician_id: m.id,
          primary_role_key: getArtistPrimaryRoleKey(m),
          primary_role_label: getArtistPrimaryRoleLabel(m),
          role_keys_index: getArtistRoleKeysIndex(m),
          grade_level: getArtistGradeLevel(m),
          grade_stars: getArtistGradeStars(m),
          grade_tier: m.grade_tier ?? getArtistGradeTier(getArtistGradeLevel(m)),
          grade_color: m.grade_color ?? '#8B5CF6',
          golden_likes_count: getStableFallbackGoldenLikesCount(m),
          parent_cluster_id: null,
          parent_count: null,
          lng: m.lng,
          lat: m.lat,
          ...offsets
        };
      });
    } else {
      // 9 <= z <= 16: Grid-based location-only clustering
      let gridResolution = 8;
      if (z === 9) gridResolution = 6;
      else if (z === 10) gridResolution = 8;
      else if (z === 11) gridResolution = 10;
      else if (z === 12) gridResolution = 12;
      else if (z === 13) gridResolution = 16;
      else if (z === 14) gridResolution = 20;
      else if (z === 15) gridResolution = 24;
      else if (z === 16) gridResolution = 28;

      const gridPixelSize = 4096 / gridResolution;
      const cells = {};

      for (const m of musicians) {
        const pxPy = lngLatToTilePixels(m.lng, m.lat, z, x, y);
        const gridX = Math.floor(pxPy.x / gridPixelSize);
        const gridY = Math.floor(pxPy.y / gridPixelSize);
        const gridKey = `${gridX}_${gridY}`;

        if (!cells[gridKey]) {
          cells[gridKey] = {
            sumPx: 0,
            sumPy: 0,
            count: 0,
            items: []
          };
        }
        cells[gridKey].sumPx += pxPy.x;
        cells[gridKey].sumPy += pxPy.y;
        cells[gridKey].count += 1;
        cells[gridKey].items.push(m);
      }

      for (const [key, cell] of Object.entries(cells)) {
        const px = cell.sumPx / cell.count;
        const py = cell.sumPy / cell.count;
        const firstMusician = cell.items[0];
        const clusterId = `cluster_z${z}_x${x}_y${y}_loc_${key}`;

        if (z <= 15) {
          // Macro, mid, local, micro, and nano clusters only (no individual child avatars returned at these zoom levels)
          points.push({
            id: clusterId,
            point_count: cell.count,
            cluster_id: clusterId,
            instrument: null,
            musician_id: firstMusician.id,
            primary_role_key: null,
            primary_role_label: null,
            role_keys_index: null,
            golden_likes_count: getStableFallbackGoldenLikesCount(firstMusician),
            px: px,
            py: py,
            lng: 0,
            lat: 0,
            parent_cluster_id: null,
            parent_count: null,
            sibling_count: 1,
            sibling_index: 0,
            needs_spiderfy: false,
            stacked_group_id: null,
            stack_radius_m: 0,
            icon_offset_x: 0,
            icon_offset_y: 0
          });
        } else {
          // z === 16: Hybrid transition layer!
          // Return BOTH the cluster and ALL individual children in the tile to support seamless visual cross-fading and tracking.
          points.push({
            id: clusterId,
            point_count: cell.count,
            cluster_id: clusterId,
            instrument: null,
            musician_id: firstMusician.id,
            primary_role_key: null,
            primary_role_label: null,
            role_keys_index: null,
            golden_likes_count: getStableFallbackGoldenLikesCount(firstMusician),
            px: px,
            py: py,
            lng: 0,
            lat: 0,
            parent_cluster_id: null,
            parent_count: null,
            sibling_count: 1,
            sibling_index: 0,
            needs_spiderfy: false,
            stacked_group_id: null,
            stack_radius_m: 0,
            icon_offset_x: 0,
            icon_offset_y: 0
          });

          for (const m of cell.items) {
            const mPxPy = lngLatToTilePixels(m.lng, m.lat, z, x, y);
            const offsets = musicianOffsets.get(m.id) || {
              sibling_count: 1,
              sibling_index: 0,
              needs_spiderfy: false,
              stacked_group_id: null,
              stack_radius_m: 0,
              icon_offset_x: 0,
              icon_offset_y: 0
            };
            points.push({
              id: m.id,
              point_count: null,
              cluster_id: null,
              instrument: m.instrument,
              musician_id: m.id,
              primary_role_key: getArtistPrimaryRoleKey(m),
              primary_role_label: getArtistPrimaryRoleLabel(m),
              role_keys_index: getArtistRoleKeysIndex(m),
              grade_level: getArtistGradeLevel(m),
              grade_stars: getArtistGradeStars(m),
              grade_tier: m.grade_tier ?? getArtistGradeTier(getArtistGradeLevel(m)),
              grade_color: m.grade_color ?? '#8B5CF6',
              golden_likes_count: getStableFallbackGoldenLikesCount(m),
              parent_cluster_id: clusterId,
              parent_count: cell.count,
              px: mPxPy.x,
              py: mPxPy.y,
              lng: 0,
              lat: 0,
              ...offsets
            });
          }
        }
      }

      // Keep vector coordinates geographic: counts represent real descendants,
      // and positions stay at the real weighted cluster/child location.

      if (MEEWAV_MACRO_COUNT_TEST_MODE && z <= 12) {
        points.forEach(c => {
          c.real_count = c.point_count;
          c.display_count = c.point_count;
          c.display_count_text = c.point_count !== null ? formatCompactCount(c.point_count) : null;
        });
      } else {
        points.forEach(c => {
          c.real_count = c.point_count;
          c.display_count = c.point_count;
          c.display_count_text = c.point_count !== null ? formatCompactCount(c.point_count) : null;
        });
      }
    }

    // Compile points into PostGIS MVT
    const mvtQuery = `
      WITH bounds AS (
        SELECT ST_TileEnvelope($1, $2, $3) AS geom
      ),
      tile AS (
        SELECT
          abs(hashtext(f.id)) AS mvt_id,
          f.id,
          f.point_count,
          f.point_count::text AS point_count_text,
          f.real_count,
          f.display_count,
          f.display_count_text,
          f.cluster_id,
          f.cluster_level,
          f.instrument,
          f.musician_id,
          f.primary_role_key,
          f.primary_role_label,
          f.role_keys_index,
          f.avatar_icon_id,
          f.avatar_id,
          f.address_id,
          f.display_name,
          f.profile_slug,
          f.artist_rank,
          f.rank_score,
          f.grade_level,
          f.grade_stars,
          f.grade_tier,
          f.grade_color,
          f.golden_likes_count,
          f.parent_cluster_id,
          f.parent_count,
          f.sibling_count,
          f.sibling_index,
          f.needs_spiderfy,
          f.stacked_group_id,
          f.stack_radius_m,
          f.icon_offset_x,
          f.icon_offset_y,
          f.lng,
          f.lat,
          f.render_rank,
          f.avatar_render_rank,
          f."labelPriority",
          f."labelTier",
          ST_AsMVTGeom(
            ST_Transform(ST_SetSRID(ST_MakePoint(f.lng, f.lat), 4326), 3857),
            bounds.geom,
            4096,
            64,
            true
          ) AS geom
        FROM json_to_recordset($4) AS f(
          id text,
          point_count integer,
          real_count integer,
          display_count integer,
          display_count_text text,
          cluster_id text,
          cluster_level text,
          instrument text,
          musician_id text,
          primary_role_key text,
          primary_role_label text,
          role_keys_index text,
          avatar_icon_id text,
          avatar_id text,
          address_id text,
          display_name text,
          profile_slug text,
          artist_rank text,
          rank_score integer,
          grade_level integer,
          grade_stars integer,
          grade_tier text,
          grade_color text,
          golden_likes_count integer,
          parent_cluster_id text,
          parent_count integer,
          sibling_count integer,
          sibling_index integer,
          needs_spiderfy boolean,
          stacked_group_id text,
          stack_radius_m double precision,
          icon_offset_x integer,
          icon_offset_y integer,
          lng double precision,
          lat double precision,
          render_rank bigint,
          avatar_render_rank bigint,
          "labelPriority" bigint,
          "labelTier" integer
        ), bounds
      )
      SELECT 
        (SELECT ST_AsMVT(tile, 'musicians', 4096, 'geom', 'mvt_id') FROM tile) AS mvt,
        (SELECT json_agg(json_build_object(
          'id', id,
          'point_count', point_count,
          'real_count', real_count,
          'display_count', display_count,
          'display_count_text', display_count_text,
          'cluster_id', cluster_id,
          'cluster_level', cluster_level,
          'instrument', instrument,
          'musician_id', musician_id,
          'primary_role_key', primary_role_key,
          'primary_role_label', primary_role_label,
          'role_keys_index', role_keys_index,
          'avatar_icon_id', avatar_icon_id,
          'avatar_id', avatar_id,
          'address_id', address_id,
          'display_name', display_name,
          'profile_slug', profile_slug,
          'artist_rank', artist_rank,
          'rank_score', rank_score,
          'grade_level', grade_level,
          'grade_stars', grade_stars,
          'grade_tier', grade_tier,
          'grade_color', grade_color,
          'golden_likes_count', golden_likes_count,
          'parent_cluster_id', parent_cluster_id,
          'parent_count', parent_count,
          'sibling_count', sibling_count,
          'sibling_index', sibling_index,
          'needs_spiderfy', needs_spiderfy,
          'stacked_group_id', stacked_group_id,
          'stack_radius_m', stack_radius_m,
          'icon_offset_x', icon_offset_x,
          'icon_offset_y', icon_offset_y,
          'lng', lng,
          'lat', lat,
          'render_rank', render_rank,
          'avatar_render_rank', avatar_render_rank,
          'labelPriority', "labelPriority",
          'labelTier', "labelTier"
        )) FROM tile) AS debug_features;
    `;
    const mvtValues = [z, x, y, JSON.stringify(points)];
    const mvtResult = await pool.query(mvtQuery, mvtValues);

    const row = mvtResult.rows[0];
    const mvt = row?.mvt;
    const debugFeatures = row?.debug_features || [];

    if (Array.isArray(debugFeatures) && debugFeatures.length > 0) {
      console.log(`[MVT Debug Features] z=${z}, x=${x}, y=${y}:`);
      debugFeatures.forEach(f => {
        if (f) {
          console.log(`  z=${z}, x=${x}, y=${y}, id=${f.id}, point_count=${f.point_count || 1}, parent_cluster_id=${f.parent_cluster_id}, parent_count=${f.parent_count}, sibling_count=${f.sibling_count}, sibling_index=${f.sibling_index}, needs_spiderfy=${f.needs_spiderfy}, stacked_group_id=${f.stacked_group_id}, stack_radius_m=${f.stack_radius_m}, offset=(${f.icon_offset_x},${f.icon_offset_y}), lng=${f.lng}, lat=${f.lat}`);
        }
      });
    }

    setMvtHeaders(res, true, 60);
    return sendMvtPayload(req, res, mvt?.length > 0 ? mvt : EMPTY_MVT_TILE);
  } catch (err) {
    console.error(`Error generating tile ${z}/${x}/${y}:`, err);
    return res.status(500).send(`Tile compilation error: ${err.message}`);
  }
});

// Start listening after loading database data
async function startServer() {
  const startupStartedAt = performance.now();
  if (localOnlyMode) {
    console.log('[MVT] Local-only mode: loading deterministic avatar fixtures without waiting for PostGIS.');
    generateDeterministic50K();
    rebuildNanoIndexes();
  } else {
    try {
      await loadAndAggregateMockArtists();
      if (mockArtists.length < 10000 && process.env.MEEWAV_ALLOW_DETERMINISTIC_50K_FALLBACK === '1') {
        console.warn(`[DB] Only ${mockArtists.length} mock artists loaded; using deterministic 50K MVT fallback for local tile testing.`);
        generateDeterministic50K();
        rebuildNanoIndexes();
      }
    } catch (err) {
      console.error("[DB] Failed to load mock_artists from DB at startup:", err.message);
      if (process.env.MEEWAV_ALLOW_DETERMINISTIC_50K_FALLBACK === '1') {
        console.error("[DB] Using explicitly enabled deterministic 50K MVT fallback for local tile testing.");
        generateDeterministic50K();
        rebuildNanoIndexes();
      } else {
        console.error("[DB] Synthetic fallback disabled; refusing to publish misleading territory counts.");
      }
    }
  }

  if (!localOnlyMode) {
    try {
      await refreshVisibleRealProfiles({ force: true });
    } catch (err) {
      console.error('[DB] Failed to load visible real profiles:', err.message);
    }

    const realProfileRefreshTimer = setInterval(() => {
      refreshVisibleRealProfiles().catch((err) => {
        console.error('[DB] Failed to refresh visible real profiles:', err.message);
      });
    }, REAL_PROFILE_REFRESH_INTERVAL_MS);
    realProfileRefreshTimer.unref?.();
  }

  if (typeof global.gc === 'function') global.gc();
  const memory = process.memoryUsage();
  startupProfile = {
    ...startupProfile,
    totalMs: Math.round((performance.now() - startupStartedAt) * 10) / 10,
    rssMb: Math.round((memory.rss / 1024 / 1024) * 10) / 10,
    heapUsedMb: Math.round((memory.heapUsed / 1024 / 1024) * 10) / 10,
    heapTotalMb: Math.round((memory.heapTotal / 1024 / 1024) * 10) / 10,
    gcExposed: typeof global.gc === 'function'
  };
  console.log('[MVT STARTUP PROFILE]', startupProfile);
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Meewav MVT Server] Running beautifully on http://localhost:${PORT}`);
    console.log(`[Meewav MVT Server] Connected using: ${connectionString ? connectionString.replace(/:[^:@/]+@/, ':****@') : 'NONE (set DATABASE_URL)'}`);
  });
}

if (isMainModule) startServer();

export const __testables = {
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
  normalizeSearchQuery,
  resolveGeographyPoint,
  sendMvtPayload,
  filterArtistsOutsideHostReservation,
  getAvatarStyleCounts,
  getDemoAvatarContainmentAudit,
  getDemoGeometryBoundaryDistanceMeters,
  getDispersedGrandParisDemoAvatarPosition,
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
  EMPTY_MVT_TILE,
  parseFacetGradeLevels,
  parseFacetRoleKeys,
  profileRowToAvatar,
  selectAllCloseViewArtists,
  selectAvatarLodForTile,
  generateDeterministic50K,
};

