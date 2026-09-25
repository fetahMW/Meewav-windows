import fs from 'node:fs';
import path from 'node:path';

import { PATHS, REPO_ROOT } from './constants.mjs';
import { createDatabasePool, loadProfiles } from './database.mjs';
import {
  bboxContains,
  featureBbox,
  normalizeParisZoneId,
  pointInFeature,
  slugify,
} from './geometry.mjs';

const OUTPUT_DIR = path.resolve(REPO_ROOT, '.codex-artifacts');
const JSON_OUTPUT = path.resolve(OUTPUT_DIR, 'grand-paris-avatar-audit.json');
const CSV_OUTPUT = path.resolve(OUTPUT_DIR, 'grand-paris-avatar-audit-zones.csv');
const AVATAR_ZOOM = 17.05;
const ADAPTIVE_CAMERA_MIN_ZOOM = 12.5;
const ADAPTIVE_CAMERA_MAX_ZOOM = 18.2;
const ADAPTIVE_CAMERA_TARGET_RATIO = 0.45;
const AUDIT_VIEWPORT = { width: 1920, height: 1080, horizontalPadding: 192, verticalPadding: 202 };

function readGeoJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLookupKey(value) {
  return slugify(String(value ?? '')).replace(/_+/g, '_');
}

function getZoneLookupAliases(value) {
  const key = normalizeLookupKey(value);
  if (!key) return [];
  const aliases = new Set([key]);
  const structuralKey = key.replace(/_(?:district|quartier|commune|zone)$/, '');
  aliases.add(structuralKey);
  for (const candidate of [key, structuralKey]) {
    const parisMatch = candidate.match(/^paris_(?:\d{1,2}e_)?(.+)$/);
    if (parisMatch?.[1]) aliases.add(parisMatch[1]);
    const grandParisMatch = candidate.match(/^(?:grand_paris|metropole_du_grand_paris|mgp)_(.+)$/);
    if (grandParisMatch?.[1]) aliases.add(grandParisMatch[1]);
  }
  return [...aliases];
}

function mercatorWorldPoint(lng, lat) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, Number(lat)));
  const sin = Math.sin((clampedLat * Math.PI) / 180);
  return {
    x: (Number(lng) + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

function tileKeyForPoint(lng, lat, zoom) {
  const point = mercatorWorldPoint(lng, lat);
  const scale = 2 ** zoom;
  return `${Math.floor(point.x * scale)}/${Math.floor(point.y * scale)}`;
}

function projectedBboxPixels(feature, zoom = AVATAR_ZOOM) {
  const [west, south, east, north] = featureBbox(feature);
  const nw = mercatorWorldPoint(west, north);
  const se = mercatorWorldPoint(east, south);
  const worldSize = 512 * (2 ** zoom);
  return {
    width: Math.abs(se.x - nw.x) * worldSize,
    height: Math.abs(se.y - nw.y) * worldSize,
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildZoneCatalogue() {
  const paris = readGeoJson(PATHS.parisQuartiers).features.map((feature) => ({
    zoneId: normalizeParisZoneId(feature.properties),
    label: feature.properties?.l_qu ?? '',
    region: 'paris',
    parentId: `paris_${String(feature.properties?.c_ar ?? '').padStart(2, '0')}e`,
    parentCode: String(feature.properties?.c_ar ?? ''),
    parentLabel: `Paris ${feature.properties?.c_ar ?? ''}e`,
    feature,
  }));
  const grandParis = readGeoJson(PATHS.grandParisSubzones).features.map((feature) => ({
    zoneId: String(feature.properties?.zoneId ?? ''),
    label: feature.properties?.label ?? '',
    region: 'grand_paris',
    parentId: String(feature.properties?.parentZoneId ?? ''),
    parentCode: String(feature.properties?.parentCode ?? ''),
    parentLabel: feature.properties?.parentLabel ?? '',
    feature,
  }));
  return [...paris, ...grandParis];
}

function buildZoneAliasIndex(zones) {
  const zonesByAlias = new Map();
  for (const zone of zones) {
    const values = [zone.zoneId, zone.label, zone.parentId, zone.parentCode, zone.parentLabel];
    for (const value of values) {
      for (const alias of getZoneLookupAliases(value)) {
        if (!zonesByAlias.has(alias)) zonesByAlias.set(alias, new Set());
        zonesByAlias.get(alias).add(zone.zoneId);
      }
    }
  }
  return zonesByAlias;
}

function getRuntimeSummaryZoneIds(zone, zonesByAlias) {
  const result = new Set();
  for (const alias of getZoneLookupAliases(zone.zoneId)) {
    for (const zoneId of zonesByAlias.get(alias) ?? []) result.add(zoneId);
  }
  return result;
}

async function main() {
  const zones = buildZoneCatalogue();
  const zonesById = new Map(zones.map((zone) => [zone.zoneId, zone]));
  const communes = readGeoJson(PATHS.grandParisCommunes).features;
  const communesById = new Map(communes.map((feature) => [String(feature.id ?? feature.properties?.id), feature]));
  const { pool, safeTarget } = createDatabasePool({ allowUnverifiedTls: true });

  try {
    const { profiles, fingerprint } = await loadProfiles(pool);
    const exactCounts = new Map();
    let missingZone = 0;
    let outsideZone = 0;
    let outsideCommune = 0;
    const outsideZoneSamples = [];
    const outsideCommuneSamples = [];
    const tileCounts = { 15: new Map(), 16: new Map() };
    const zoneTileKeys = new Map();

    for (const profile of profiles) {
      const zoneId = String(profile.district_id ?? '');
      exactCounts.set(zoneId, (exactCounts.get(zoneId) ?? 0) + 1);
      const zone = zonesById.get(zoneId);
      if (!zone) {
        missingZone += 1;
        continue;
      }

      const point = [Number(profile.lng), Number(profile.lat)];
      if (!zoneTileKeys.has(zoneId)) zoneTileKeys.set(zoneId, { 15: new Set(), 16: new Set() });
      for (const zoom of [15, 16]) {
        const tileKey = tileKeyForPoint(point[0], point[1], zoom);
        tileCounts[zoom].set(tileKey, (tileCounts[zoom].get(tileKey) ?? 0) + 1);
        zoneTileKeys.get(zoneId)[zoom].add(tileKey);
      }
      const zoneBbox = featureBbox(zone.feature);
      if (!bboxContains(zoneBbox, point) || !pointInFeature(point, zone.feature)) {
        outsideZone += 1;
        if (outsideZoneSamples.length < 20) outsideZoneSamples.push({ id: profile.id, zoneId, point });
      }

      if (zone.region === 'grand_paris') {
        const commune = communesById.get(String(profile.city_id ?? zone.parentId));
        if (!commune || !bboxContains(featureBbox(commune), point) || !pointInFeature(point, commune)) {
          outsideCommune += 1;
          if (outsideCommuneSamples.length < 20) {
            outsideCommuneSamples.push({ id: profile.id, zoneId, cityId: profile.city_id, point });
          }
        }
      }
    }

    const zonesByAlias = buildZoneAliasIndex(zones);
    const rows = zones.map((zone) => {
      const exactCount = exactCounts.get(zone.zoneId) ?? 0;
      const legacyRuntimeZoneIds = getRuntimeSummaryZoneIds(zone, zonesByAlias);
      const legacyRuntimeSummaryCount = [...legacyRuntimeZoneIds]
        .reduce((sum, zoneId) => sum + (exactCounts.get(zoneId) ?? 0), 0);
      // Patched runtime contract: an existing canonical id is authoritative.
      const runtimeZoneIds = exactCounts.has(zone.zoneId) ? new Set([zone.zoneId]) : legacyRuntimeZoneIds;
      const runtimeSummaryCount = [...runtimeZoneIds]
        .reduce((sum, zoneId) => sum + (exactCounts.get(zoneId) ?? 0), 0);
      const projected = projectedBboxPixels(zone.feature);
      const z15TileLoads = [...(zoneTileKeys.get(zone.zoneId)?.[15] ?? [])]
        .map((tileKey) => tileCounts[15].get(tileKey) ?? 0);
      const z16TileLoads = [...(zoneTileKeys.get(zone.zoneId)?.[16] ?? [])]
        .map((tileKey) => tileCounts[16].get(tileKey) ?? 0);
      const availableWidth = AUDIT_VIEWPORT.width - AUDIT_VIEWPORT.horizontalPadding;
      const availableHeight = AUDIT_VIEWPORT.height - AUDIT_VIEWPORT.verticalPadding;
      const rawAdaptiveZoom = AVATAR_ZOOM + Math.min(
        Math.log2((availableWidth * ADAPTIVE_CAMERA_TARGET_RATIO) / Math.max(projected.width, 1)),
        Math.log2((availableHeight * ADAPTIVE_CAMERA_TARGET_RATIO) / Math.max(projected.height, 1)),
      );
      const adaptiveLandingZoom = Math.max(
        ADAPTIVE_CAMERA_MIN_ZOOM,
        Math.min(ADAPTIVE_CAMERA_MAX_ZOOM, rawAdaptiveZoom),
      );
      const adaptiveScale = 2 ** (adaptiveLandingZoom - AVATAR_ZOOM);
      return {
        zoneId: zone.zoneId,
        label: zone.label,
        region: zone.region,
        parentId: zone.parentId,
        parentLabel: zone.parentLabel,
        exactCount,
        legacyRuntimeSummaryCount,
        legacyInflatedBy: legacyRuntimeSummaryCount - exactCount,
        legacyRuntimeMatchedZoneIds: [...legacyRuntimeZoneIds].sort(),
        runtimeSummaryCount,
        inflatedBy: runtimeSummaryCount - exactCount,
        runtimeMatchedZoneIds: [...runtimeZoneIds].sort(),
        exceedsNano120: exactCount > 120,
        exceedsZ15TileBudget96: exactCount > 96,
        exceedsZ16TileBudget160: exactCount > 160,
        maxProfilesInZ15Tile: Math.max(0, ...z15TileLoads),
        maxProfilesInZ16Tile: Math.max(0, ...z16TileLoads),
        z15TileBudgetPressure: z15TileLoads.some((count) => count > 96),
        z16TileBudgetPressure: z16TileLoads.some((count) => count > 160),
        projectedWidthAtZ17: Math.round(projected.width),
        projectedHeightAtZ17: Math.round(projected.height),
        forcedZ17CannotFit: projected.width > availableWidth || projected.height > availableHeight,
        adaptiveLandingZoom: Number(adaptiveLandingZoom.toFixed(2)),
        adaptiveCameraCannotFit: projected.width * adaptiveScale > availableWidth
          || projected.height * adaptiveScale > availableHeight,
      };
    }).sort((a, b) => b.legacyInflatedBy - a.legacyInflatedBy || b.exactCount - a.exactCount || a.zoneId.localeCompare(b.zoneId));

    const exactZoneIds = new Set(exactCounts.keys());
    const missingCatalogueZoneIds = [...exactZoneIds].filter((zoneId) => !zonesById.has(zoneId)).sort();
    const emptyCatalogueZoneIds = zones.filter((zone) => !exactZoneIds.has(zone.zoneId)).map((zone) => zone.zoneId).sort();
    const legacyInflated = rows.filter((row) => row.legacyInflatedBy > 0);
    const inflated = rows.filter((row) => row.inflatedBy > 0);
    const summary = {
      generatedAt: new Date().toISOString(),
      safeTarget,
      databaseFingerprint: fingerprint,
      profiles: profiles.length,
      zones: zones.length,
      parisZones: zones.filter((zone) => zone.region === 'paris').length,
      grandParisZones: zones.filter((zone) => zone.region === 'grand_paris').length,
      communes: communes.length,
      distinctDatabaseZoneIds: exactCounts.size,
      missingZone,
      outsideZone,
      outsideCommune,
      missingCatalogueZoneIds,
      emptyCatalogueZoneIds,
      inflatedRuntimeSummariesBeforePatch: legacyInflated.length,
      inflatedRuntimeProfilesBeforePatch: legacyInflated.reduce((sum, row) => sum + row.legacyInflatedBy, 0),
      inflatedRuntimeSummariesAfterPatch: inflated.length,
      inflatedRuntimeProfilesAfterPatch: inflated.reduce((sum, row) => sum + row.inflatedBy, 0),
      zonesOverNano120: rows.filter((row) => row.exceedsNano120).length,
      zonesOverZ15TileBudget96: rows.filter((row) => row.exceedsZ15TileBudget96).length,
      zonesOverZ16TileBudget160: rows.filter((row) => row.exceedsZ16TileBudget160).length,
      overBudgetZ15Tiles: [...tileCounts[15].values()].filter((count) => count > 96).length,
      overBudgetZ16Tiles: [...tileCounts[16].values()].filter((count) => count > 160).length,
      zonesTouchingOverBudgetZ15Tiles: rows.filter((row) => row.z15TileBudgetPressure).length,
      zonesTouchingOverBudgetZ16Tiles: rows.filter((row) => row.z16TileBudgetPressure).length,
      zonesCroppedByForcedZ17BeforePatch: rows.filter((row) => row.forcedZ17CannotFit).length,
      zonesCroppedAfterAdaptiveCamera: rows.filter((row) => row.adaptiveCameraCannotFit).length,
    };

    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(JSON_OUTPUT, `${JSON.stringify({ summary, legacyInflatedZones: legacyInflated, inflatedZones: inflated, rows, outsideZoneSamples, outsideCommuneSamples }, null, 2)}\n`);
    const columns = [
      'zoneId', 'label', 'region', 'parentId', 'parentLabel', 'exactCount',
      'legacyRuntimeSummaryCount', 'legacyInflatedBy', 'runtimeSummaryCount', 'inflatedBy', 'exceedsNano120', 'exceedsZ15TileBudget96',
      'exceedsZ16TileBudget160', 'maxProfilesInZ15Tile', 'maxProfilesInZ16Tile',
      'z15TileBudgetPressure', 'z16TileBudgetPressure', 'projectedWidthAtZ17', 'projectedHeightAtZ17',
      'forcedZ17CannotFit', 'adaptiveLandingZoom', 'adaptiveCameraCannotFit', 'runtimeMatchedZoneIds',
    ];
    const csvRows = [columns.join(',')];
    for (const row of rows) {
      csvRows.push(columns.map((column) => csvCell(
        column === 'runtimeMatchedZoneIds' ? row.runtimeMatchedZoneIds.join('|') : row[column]
      )).join(','));
    }
    fs.writeFileSync(CSV_OUTPUT, `${csvRows.join('\n')}\n`);

    console.log(JSON.stringify({ summary, topLegacyInflatedZones: legacyInflated.slice(0, 20), outputs: { json: JSON_OUTPUT, csv: CSV_OUTPUT } }, null, 2));
  } finally {
    await pool.end();
  }
}

await main();
