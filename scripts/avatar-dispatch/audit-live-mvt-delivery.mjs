import fs from 'node:fs';
import path from 'node:path';

import Pbf from 'pbf';
import { VectorTile } from '@mapbox/vector-tile';

import { PATHS, REPO_ROOT } from './constants.mjs';
import { normalizeParisZoneId } from './geometry.mjs';

const DEFAULT_BASE_URL = 'http://localhost:5000';
const DEFAULT_ZOOM = 15;
const DEFAULT_CONCURRENCY = 12;
const AUDIT_PATH = path.resolve(REPO_ROOT, '.codex-artifacts/grand-paris-avatar-audit.json');
const OUTPUT_PATH = path.resolve(REPO_ROOT, '.codex-artifacts/live-mvt-avatar-delivery-audit.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getArgument(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function featureBbox(feature) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (coordinates) => {
    if (!Array.isArray(coordinates)) return;
    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      bbox[0] = Math.min(bbox[0], coordinates[0]);
      bbox[1] = Math.min(bbox[1], coordinates[1]);
      bbox[2] = Math.max(bbox[2], coordinates[0]);
      bbox[3] = Math.max(bbox[3], coordinates[1]);
      return;
    }
    for (const child of coordinates) visit(child);
  };
  visit(feature?.geometry?.coordinates);
  return bbox;
}

function lngLatToTile(lng, lat, zoom) {
  const scale = 2 ** zoom;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  return {
    x: Math.floor(((Number(lng) + 180) / 360) * scale),
    y: Math.floor(
      ((1 - Math.asinh(Math.tan((clampedLat * Math.PI) / 180)) / Math.PI) / 2) * scale,
    ),
  };
}

function getZoneCatalogue(scope) {
  const zones = [];
  if (scope === 'all' || scope === 'paris') {
    for (const feature of readJson(PATHS.parisQuartiers).features) {
      zones.push({
        zoneId: normalizeParisZoneId(feature.properties),
        region: 'paris',
        feature,
      });
    }
  }
  if (scope === 'all' || scope === 'grand_paris') {
    for (const feature of readJson(PATHS.grandParisSubzones).features) {
      zones.push({
        zoneId: String(feature.properties?.zoneId ?? ''),
        region: 'grand_paris',
        feature,
      });
    }
  }
  return zones.filter((zone) => zone.zoneId);
}

function enumerateTileKeys(zones, zoom) {
  const tileKeys = new Set();
  for (const zone of zones) {
    const [west, south, east, north] = featureBbox(zone.feature);
    const topLeft = lngLatToTile(west, north, zoom);
    const bottomRight = lngLatToTile(east, south, zoom);
    for (let x = topLeft.x; x <= bottomRight.x; x += 1) {
      for (let y = topLeft.y; y <= bottomRight.y; y += 1) {
        tileKeys.add(`${zoom}/${x}/${y}`);
      }
    }
  }
  return [...tileKeys];
}

async function mapConcurrent(values, concurrency, task) {
  let cursor = 0;
  const results = new Array(values.length);
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function getFeatureIdentity(properties, fallback) {
  return String(
    properties.musician_id
      ?? properties.profile_id
      ?? properties.id
      ?? properties.avatar_id
      ?? fallback,
  );
}

function canonicalizeDeliveredZoneId(zoneId) {
  return zoneId === 'paris_charonne' ? 'paris_20e_charonne' : zoneId;
}

async function readTile(baseUrl, tileKey) {
  const response = await fetch(`${baseUrl}/musicians_clustered/${tileKey}?perf=1`);
  if (!response.ok) throw new Error(`${tileKey}: HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const tile = new VectorTile(new Pbf(buffer));
  const layer = tile.layers.musicians;
  const avatars = [];
  if (!layer) return avatars;
  for (let index = 0; index < layer.length; index += 1) {
    const feature = layer.feature(index);
    const properties = feature.properties ?? {};
    if (properties.cluster_level !== 'avatar') continue;
    // The dedicated current-user marker is an overlay, not part of a zone label total.
    if (properties.is_current_user === true || properties.is_current_user === 1) continue;
    const zoneId = canonicalizeDeliveredZoneId(
      String(properties.zone_id ?? properties.district_id ?? properties.sector_id ?? ''),
    );
    if (!zoneId) continue;
    avatars.push({
      zoneId,
      identity: getFeatureIdentity(properties, `${tileKey}:${index}`),
    });
  }
  return avatars;
}

async function main() {
  const scope = getArgument('scope', 'all');
  if (!['all', 'paris', 'grand_paris'].includes(scope)) {
    throw new Error(`Unsupported scope "${scope}".`);
  }
  const baseUrl = getArgument('base-url', DEFAULT_BASE_URL).replace(/\/$/, '');
  const zoom = Number(getArgument('zoom', DEFAULT_ZOOM));
  const concurrency = Math.max(1, Number(getArgument('concurrency', DEFAULT_CONCURRENCY)) || DEFAULT_CONCURRENCY);
  const zones = getZoneCatalogue(scope);
  const zoneIds = new Set(zones.map((zone) => zone.zoneId));
  const expectedRows = readJson(AUDIT_PATH).rows.filter((row) => zoneIds.has(row.zoneId));
  const expectedByZone = new Map(expectedRows.map((row) => [row.zoneId, Number(row.exactCount)]));
  const deliveredIdsByZone = new Map(zones.map((zone) => [zone.zoneId, new Set()]));
  const tileKeys = enumerateTileKeys(zones, zoom);
  const startedAt = Date.now();

  console.log(`[live-mvt-audit] ${zones.length} zones, ${tileKeys.length} z${zoom} tiles, concurrency=${concurrency}`);
  await mapConcurrent(tileKeys, concurrency, async (tileKey, index) => {
    const avatars = await readTile(baseUrl, tileKey);
    for (const avatar of avatars) {
      deliveredIdsByZone.get(avatar.zoneId)?.add(avatar.identity);
    }
    if ((index + 1) % 100 === 0 || index + 1 === tileKeys.length) {
      console.log(`[live-mvt-audit] ${index + 1}/${tileKeys.length} tiles`);
    }
  });

  const rows = zones.map((zone) => {
    const expected = expectedByZone.get(zone.zoneId) ?? 0;
    const delivered = deliveredIdsByZone.get(zone.zoneId)?.size ?? 0;
    return {
      zoneId: zone.zoneId,
      region: zone.region,
      expected,
      delivered,
      delta: delivered - expected,
      ok: delivered === expected,
    };
  });
  const failures = rows.filter((row) => !row.ok);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    scope,
    zoom,
    zoneCount: zones.length,
    tileCount: tileKeys.length,
    durationMs: Date.now() - startedAt,
    passed: rows.length - failures.length,
    failed: failures.length,
    failures,
    rows,
  };
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[live-mvt-audit] ${report.passed}/${report.zoneCount} zones exactes en ${report.durationMs} ms`);
  console.log(`[live-mvt-audit] report: ${OUTPUT_PATH}`);
  if (failures.length > 0) process.exitCode = 1;
}

await main();
