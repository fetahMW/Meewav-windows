import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CHARONNE_ZONE_ID,
  PATHS,
  REPO_ROOT,
} from './constants.mjs';
import {
  bboxContains,
  coordinateKey,
  featureBbox,
  hash32,
  normalizeParisZoneId,
  pointInFeature,
  sha256,
  sha256File,
} from './geometry.mjs';
import { generateZoneBlueNoisePoints } from './blue-noise.mjs';

// The quota-aware public/private placements are generated later by allocator.mjs.
// Two reference anchors keep the loader contract and validate both polygon scopes
// without materializing a second, redundant pool of hundreds of thousands of points.
const GRAND_PARIS_REFERENCE_ANCHORS_PER_ZONE = 2;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertFeatureCollection(collection, expectedCount, label) {
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`${label}: FeatureCollection invalide`);
  }
  if (collection.features.length !== expectedCount) {
    throw new Error(`${label}: ${collection.features.length} zones au lieu de ${expectedCount}`);
  }
}

function findParisAnchorsPath(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.PARIS_ANCHORS_PATH,
    path.resolve(REPO_ROOT, 'data/paris_anchors.json'),
    path.resolve(REPO_ROOT, '../../data/paris_anchors.json'),
  ].filter(Boolean);
  const match = candidates.find((candidate) => fs.existsSync(path.resolve(candidate)));
  if (!match) {
    throw new Error(
      `Fichier BAN Paris introuvable. Utiliser --paris-anchors=<path> ou PARIS_ANCHORS_PATH. Candidats: ${candidates.join(', ')}`,
    );
  }
  return path.resolve(match);
}

function retainDeterministicAnchors(anchors, seed, zoneId) {
  return [...anchors]
    .sort((left, right) => {
      const leftKey = `${left.id}:${coordinateKey(left.lng, left.lat)}`;
      const rightKey = `${right.id}:${coordinateKey(right.lng, right.lat)}`;
      return hash32(`${seed}:anchor-retain:${zoneId}:${leftKey}`)
        - hash32(`${seed}:anchor-retain:${zoneId}:${rightKey}`)
        || leftKey.localeCompare(rightKey);
    });
}

function parisArchetype(arrondissement) {
  if ([18, 19, 20].includes(arrondissement)) return 'north_east_urban';
  if ([8, 9, 16, 17].includes(arrondissement)) return 'west_professional';
  if ([13, 14, 15].includes(arrondissement)) return 'south_balanced';
  return 'central_east';
}

function grandParisArchetype(parentCode) {
  const department = String(parentCode).slice(0, 2);
  if (department === '92') return 'west_professional';
  if (department === '93' || department === '95') return 'north_east_urban';
  return 'south_balanced';
}

function buildParisZones(collection) {
  return collection.features.map((feature) => {
    const properties = feature.properties ?? {};
    const arrondissement = Number(properties.c_ar);
    return {
      id: normalizeParisZoneId(properties),
      label: String(properties.l_qu),
      region: 'paris',
      parentId: `paris_${String(arrondissement).padStart(2, '0')}e`,
      parentCode: String(arrondissement).padStart(2, '0'),
      parentLabel: `Paris ${arrondissement}e`,
      archetype: parisArchetype(arrondissement),
      feature,
      communeFeature: null,
      bbox: featureBbox(feature),
      anchors: [],
      anchorCount: 0,
      rawAnchorCount: 0,
      rejectedAnchorCount: 0,
      isCharonne: normalizeParisZoneId(properties) === CHARONNE_ZONE_ID,
    };
  });
}

function loadParisAnchors(zones, anchorsPath, seed) {
  const raw = fs.readFileSync(anchorsPath, 'utf8');
  const addresses = JSON.parse(raw);
  if (!Array.isArray(addresses)) throw new Error('Le fichier BAN Paris doit contenir un tableau');

  const byArrondissement = new Map();
  for (const zone of zones) {
    const key = String(Number(zone.parentCode));
    const bucket = byArrondissement.get(key) ?? [];
    bucket.push(zone);
    byArrondissement.set(key, bucket);
  }

  const uniqueByZone = new Map(zones.map((zone) => [zone.id, new Map()]));
  let rejected = 0;
  for (const address of addresses) {
    const lng = Number(address.lng);
    const lat = Number(address.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      rejected += 1;
      continue;
    }
    const arrondissementMatch = String(address.district ?? '').match(/Paris\s+(\d{1,2})e/i);
    const candidates = arrondissementMatch
      ? byArrondissement.get(String(Number(arrondissementMatch[1]))) ?? zones
      : zones;
    const point = [lng, lat];
    const zone = candidates.find((candidate) => bboxContains(candidate.bbox, point) && pointInFeature(point, candidate.feature));
    if (!zone) {
      rejected += 1;
      continue;
    }
    zone.rawAnchorCount += 1;
    const key = coordinateKey(lng, lat);
    if (!uniqueByZone.get(zone.id).has(key)) {
      uniqueByZone.get(zone.id).set(key, {
        id: String(address.id ?? `ban:${key}`),
        type: String(address.type ?? 'ban_address'),
        label: String(address.label ?? zone.label),
        lng,
        lat,
      });
    }
  }

  for (const zone of zones) {
    const anchors = [...uniqueByZone.get(zone.id).values()];
    zone.anchorCount = anchors.length;
    zone.rejectedAnchorCount = zone.rawAnchorCount - anchors.length;
    zone.anchors = retainDeterministicAnchors(anchors, seed, zone.id);
  }
  return { hash: sha256(raw), sourceCount: addresses.length, rejected };
}

function buildGrandParisZones(subzones, communes) {
  const communesByCode = new Map(
    communes.features.map((feature) => [String(feature.properties?.code), feature]),
  );
  return subzones.features.map((feature) => {
    const properties = feature.properties ?? {};
    const parentCode = String(properties.parentCode);
    const communeFeature = communesByCode.get(parentCode);
    if (!communeFeature) throw new Error(`Commune parente absente pour ${properties.zoneId} (${parentCode})`);
    return {
      id: String(properties.zoneId),
      label: String(properties.label),
      region: 'grand_paris',
      parentId: String(properties.parentZoneId),
      parentCode,
      parentLabel: String(properties.parentLabel),
      parentPopulation: Number(communeFeature.properties?.population ?? 0),
      archetype: grandParisArchetype(parentCode),
      feature,
      communeFeature,
      bbox: featureBbox(feature),
      anchors: [],
      anchorCount: 0,
      rawAnchorCount: 0,
      rejectedAnchorCount: 0,
      isCharonne: false,
    };
  });
}

export function generateGrandParisAnchors(zones, seed, onProgress) {
  const anchorDigest = crypto.createHash('sha256');
  const usedCoordinateKeys = new Set();
  let totalAnchors = 0;

  for (let index = 0; index < zones.length; index += 1) {
    const zone = zones[index];
    const anchors = generateZoneBlueNoisePoints({
      feature: zone.feature,
      constraintFeature: zone.communeFeature,
      count: GRAND_PARIS_REFERENCE_ANCHORS_PER_ZONE,
      seed: `${seed}:grand-paris-reference-anchors`,
      zoneId: zone.id,
      label: `${zone.label}, ${zone.parentLabel}`,
      excludedCoordinateKeys: usedCoordinateKeys,
    });
    for (const anchor of anchors) {
      const key = coordinateKey(anchor.lng, anchor.lat);
      if (!pointInFeature([anchor.lng, anchor.lat], zone.feature)
        || !pointInFeature([anchor.lng, anchor.lat], zone.communeFeature)) {
        throw new Error(`${zone.id}: ancre polygonale hors perimetre`);
      }
      if (usedCoordinateKeys.has(key)) throw new Error(`${zone.id}: ancre polygonale dupliquee ${key}`);
      usedCoordinateKeys.add(key);
      anchorDigest.update(zone.id).update('\0').update(anchor.id).update('\0').update(key).update('\0');
    }
    zone.rawAnchorCount = anchors.length;
    zone.rejectedAnchorCount = 0;
    zone.anchorCount = anchors.length;
    zone.anchors = retainDeterministicAnchors(anchors, seed, zone.id);
    totalAnchors += anchors.length;
    if ((index + 1) % 100 === 0 || index === zones.length - 1) {
      onProgress?.(`Ancres polygonales Grand Paris: ${index + 1}/${zones.length}`);
    }
  }

  return {
    aggregateHash: anchorDigest.digest('hex'),
    anchorCount: totalAnchors,
    rejectedCount: 0,
  };
}

export function loadGeoAssets({ seed, parisAnchorsPath, onProgress } = {}) {
  const resolvedParisAnchorsPath = findParisAnchorsPath(parisAnchorsPath);
  const parisCollection = readJson(PATHS.parisQuartiers);
  const communesCollection = readJson(PATHS.grandParisCommunes);
  const subzonesCollection = readJson(PATHS.grandParisSubzones);

  assertFeatureCollection(parisCollection, 80, 'Quartiers Paris');
  assertFeatureCollection(communesCollection, 123, 'Communes Grand Paris');
  assertFeatureCollection(subzonesCollection, 904, 'Sous-zones Grand Paris');

  const parisZones = buildParisZones(parisCollection);
  onProgress?.(`Lecture de ${resolvedParisAnchorsPath}`);
  const parisAnchors = loadParisAnchors(parisZones, resolvedParisAnchorsPath, seed);

  const grandParisZones = buildGrandParisZones(subzonesCollection, communesCollection);
  const grandParisAnchors = generateGrandParisAnchors(grandParisZones, seed, onProgress);
  const zones = [...parisZones, ...grandParisZones];

  return {
    zones,
    assets: {
      parisQuartiersHash: sha256File(PATHS.parisQuartiers),
      grandParisCommunesHash: sha256File(PATHS.grandParisCommunes),
      grandParisSubzonesHash: sha256File(PATHS.grandParisSubzones),
      grandParisPolygonAnchorAggregateHash: grandParisAnchors.aggregateHash,
      parisAnchorsHash: parisAnchors.hash,
      parisAnchorsPath: resolvedParisAnchorsPath,
      parisAnchorSourceCount: parisAnchors.sourceCount,
      parisAnchorRejectedCount: parisAnchors.rejected,
      grandParisPolygonAnchorCount: grandParisAnchors.anchorCount,
      grandParisPolygonAnchorRejectedCount: grandParisAnchors.rejectedCount,
    },
  };
}
