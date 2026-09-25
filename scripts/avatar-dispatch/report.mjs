import fs from 'node:fs';
import path from 'node:path';

import {
  AVATAR_ASSET_URLS,
  AVATAR_STYLES,
  CHARONNE_PROFILE_COUNT,
  CHARONNE_ZONE_ID,
  EXPECTED_PROFILE_COUNT,
  FAMILY_ORDER,
  MIN_DIVERSE_ZONE_SIZE,
  PARIS_PROFILE_TARGET,
  PATHS,
  STYLE_FAMILIES,
  STYLE_IDS,
} from './constants.mjs';
import { coordinateKey, pointInFeature, sha256 } from './geometry.mjs';

function countByStyle(assignments) {
  const counts = Object.fromEntries(STYLE_IDS.map((style) => [style, 0]));
  for (const assignment of assignments) counts[assignment.avatarId] = (counts[assignment.avatarId] ?? 0) + 1;
  return counts;
}

function sumStyleCounts(counts) {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

function leadingStyle(counts, total) {
  const [style, count] = Object.entries(counts).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
  return { style, label: AVATAR_STYLES[style], count, share: total ? count / total : 0 };
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function expectedClusterId(scope, level, precision, lng, lat) {
  return `${scope}_${level}_${Math.floor(Number(lng) * precision)}_${Math.floor(Number(lat) * precision)}`;
}

function coordinateDistanceMeters(leftLng, leftLat, rightLng, rightLat) {
  const meanLatitude = (Number(leftLat) + Number(rightLat)) / 2;
  const dx = (Number(rightLng) - Number(leftLng)) * 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  const dy = (Number(rightLat) - Number(leftLat)) * 110_574;
  return Math.sqrt(dx * dx + dy * dy);
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return null;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * ratio) - 1));
  return sortedValues[index];
}

function distanceSummary(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const preferred = sorted.filter((value) => value >= 70 && value <= 330).length;
  return {
    min: Number(sorted[0]?.toFixed(2)),
    median: Number(percentile(sorted, 0.5)?.toFixed(2)),
    p95: Number(percentile(sorted, 0.95)?.toFixed(2)),
    max: Number(sorted.at(-1)?.toFixed(2)),
    preferredRangeCount: preferred,
    preferredRangePercent: Number(((preferred / Math.max(1, sorted.length)) * 100).toFixed(2)),
    toleratedRangeCount: sorted.length - preferred,
    toleratedRangePercent: Number((((sorted.length - preferred) / Math.max(1, sorted.length)) * 100).toFixed(2)),
  };
}

function toCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n') + '\n';
}

function validateCharonne(charonneAssignments) {
  const errors = [];
  if (charonneAssignments.length !== CHARONNE_PROFILE_COUNT) {
    errors.push(`Charonne contient ${charonneAssignments.length}/450 UUID reserves`);
    return errors;
  }
  for (const assignment of charonneAssignments) {
    const fields = [
      ['anchor_type', assignment.anchorType, 'zone_blue_noise'],
      ['source_quality', assignment.sourceQuality, 'zone_blue_noise_deterministic'],
      ['placement_quality', assignment.placementQuality, 'zone_blue_noise_pip_verified'],
      ['address_id', assignment.addressId, null],
      ['city', assignment.city, 'Paris'],
      ['city_id', assignment.cityId, 'city_paris'],
      ['district_id', assignment.districtId, CHARONNE_ZONE_ID],
    ];
    for (const [field, actual, expected] of fields) {
      if (actual !== expected) errors.push(`${assignment.anchorId}: ${field} differe du fixture`);
    }
  }
  return errors;
}

export function validateAndSummarize({ assignments, zones, fixtures }) {
  const errors = [];
  const warnings = [
    'Les inscriptions et leurs quotas par quartier sont conserves depuis la base; seules les coordonnees publiques sont redistribuees.',
    'Le placement public utilise une loi blue-noise deterministe bornee par chaque polygone de quartier, sans adresse ni ancrage routier.',
    "Aucun masque hydrologique polygonal distinct des geometries de quartier n'est disponible dans le depot.",
  ];
  const assignmentIds = new Set();
  const coordinateKeys = new Set();
  const privateCoordinateKeys = new Set();
  const districtIds = new Set();
  const byZone = new Map(zones.map((zone) => [zone.id, []]));
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  let duplicateIds = 0;
  let duplicateCoordinates = 0;
  let outsideZone = 0;
  let outsideCommune = 0;
  let missingAvatar = 0;
  let missingInstrument = 0;
  let invalidCity = 0;
  let invalidCityId = 0;
  let invalidDistrictId = 0;
  let parisCityProfiles = 0;
  let grandParisCityProfiles = 0;
  let invalidDerivedMetadata = 0;
  let publicCoordinateMismatch = 0;
  let samePrivatePublic = 0;
  let duplicatePrivateCoordinates = 0;
  let privateOutsideZone = 0;
  let privateOutsideCommune = 0;
  let privacyTooClose = 0;
  let privacyTooFar = 0;
  let privacyBelowPreferred = 0;
  let privacyAbovePreferred = 0;
  let missingPrivateCoordinates = 0;
  const privateDistances = [];
  const privatePlacementQualityCounts = {};

  for (const assignment of assignments) {
    if (assignmentIds.has(assignment.id)) duplicateIds += 1;
    assignmentIds.add(assignment.id);
    const coordKey = coordinateKey(assignment.lng, assignment.lat);
    if (coordinateKeys.has(coordKey)) duplicateCoordinates += 1;
    coordinateKeys.add(coordKey);
    if (!Number.isFinite(assignment.privateLng) || !Number.isFinite(assignment.privateLat)) {
      missingPrivateCoordinates += 1;
    }
    const privateKey = coordinateKey(assignment.privateLng, assignment.privateLat);
    if (privateCoordinateKeys.has(privateKey)) duplicatePrivateCoordinates += 1;
    privateCoordinateKeys.add(privateKey);
    const zone = zoneById.get(assignment.zoneId);
    if (!zone) {
      errors.push(`${assignment.id}: zone inconnue ${assignment.zoneId}`);
      continue;
    }
    byZone.get(zone.id).push(assignment);
    districtIds.add(assignment.districtId);
    const expectedCity = zone.region === 'paris' ? 'Paris' : 'Grand Paris';
    const expectedCityId = zone.region === 'paris' ? 'city_paris' : zone.parentId;
    const expectedClusterScope = zone.region === 'paris' ? 'paris' : zone.parentId;
    if (assignment.city !== expectedCity) invalidCity += 1;
    if (assignment.city === 'Paris') parisCityProfiles += 1;
    if (assignment.city === 'Grand Paris') grandParisCityProfiles += 1;
    if (assignment.cityId !== expectedCityId) invalidCityId += 1;
    if (assignment.districtId !== zone.id) invalidDistrictId += 1;
    if (assignment.publicLng !== assignment.lng || assignment.publicLat !== assignment.lat) {
      publicCoordinateMismatch += 1;
    }
    if (privateKey === coordKey) samePrivatePublic += 1;
    if (!pointInFeature([assignment.privateLng, assignment.privateLat], zone.feature)) privateOutsideZone += 1;
    if (zone.communeFeature
      && !pointInFeature([assignment.privateLng, assignment.privateLat], zone.communeFeature)) {
      privateOutsideCommune += 1;
    }
    const privateDistance = coordinateDistanceMeters(
      assignment.lng,
      assignment.lat,
      assignment.privateLng,
      assignment.privateLat,
    );
    privateDistances.push(privateDistance);
    if (privateDistance < 45) privacyTooClose += 1;
    if (privateDistance > 650) privacyTooFar += 1;
    if (privateDistance >= 45 && privateDistance < 70) privacyBelowPreferred += 1;
    if (privateDistance > 330 && privateDistance <= 650) privacyAbovePreferred += 1;
    privatePlacementQualityCounts[assignment.privatePlacementQuality] = (
      privatePlacementQualityCounts[assignment.privatePlacementQuality] ?? 0
    ) + 1;
    if (assignment.countryClusterId !== 'country_france'
      || assignment.cityClusterId !== expectedCityId
      || assignment.macroClusterId !== expectedClusterId(expectedClusterScope, 'macro', 18, assignment.lng, assignment.lat)
      || assignment.midClusterId !== expectedClusterId(expectedClusterScope, 'mid', 35, assignment.lng, assignment.lat)
      || assignment.localClusterId !== expectedClusterId(expectedClusterScope, 'local', 75, assignment.lng, assignment.lat)
      || assignment.microClusterId !== expectedClusterId(expectedClusterScope, 'micro', 160, assignment.lng, assignment.lat)
      || assignment.nanoClusterId !== expectedClusterId(expectedClusterScope, 'nano', 420, assignment.lng, assignment.lat)
      || assignment.densityTier !== zone.densityTier
      || assignment.densityWeight !== zone.densityWeight
      || assignment.avatarUrl !== AVATAR_ASSET_URLS[assignment.avatarId]
      || (zone.region === 'grand_paris' && [
        assignment.macroClusterId,
        assignment.midClusterId,
        assignment.localClusterId,
        assignment.microClusterId,
        assignment.nanoClusterId,
      ].some((clusterId) => clusterId.startsWith('paris_')))) {
      invalidDerivedMetadata += 1;
    }
    if (!pointInFeature([assignment.lng, assignment.lat], zone.feature)) outsideZone += 1;
    if (zone.communeFeature && !pointInFeature([assignment.lng, assignment.lat], zone.communeFeature)) outsideCommune += 1;
    if (!STYLE_IDS.includes(assignment.avatarId)) missingAvatar += 1;
    if (!assignment.instrument) missingInstrument += 1;
  }

  if (assignments.length !== EXPECTED_PROFILE_COUNT) errors.push(`Plan: ${assignments.length}/200000 profils`);
  if (assignmentIds.size !== EXPECTED_PROFILE_COUNT || duplicateIds) errors.push(`UUID uniques: ${assignmentIds.size}/200000`);
  if (coordinateKeys.size !== EXPECTED_PROFILE_COUNT || duplicateCoordinates) {
    errors.push(`Coordonnees uniques a 7 decimales: ${coordinateKeys.size}/200000`);
  }
  if (privateCoordinateKeys.size !== EXPECTED_PROFILE_COUNT || duplicatePrivateCoordinates) {
    errors.push(`Coordonnees privees uniques a 7 decimales: ${privateCoordinateKeys.size}/200000`);
  }
  const privatePublicCoordinateCollisions = [...privateCoordinateKeys]
    .filter((key) => coordinateKeys.has(key)).length;
  if (outsideZone) errors.push(`${outsideZone} coordonnees hors zone officielle`);
  if (outsideCommune) errors.push(`${outsideCommune} coordonnees Grand Paris hors commune officielle`);
  if (missingAvatar) errors.push(`${missingAvatar} profils sans avatar canonique`);
  if (missingInstrument) errors.push(`${missingInstrument} profils sans instrument/metier`);
  if (invalidCity) errors.push(`${invalidCity} profils avec city incoherent`);
  if (invalidCityId) errors.push(`${invalidCityId} profils avec city_id incoherent`);
  if (invalidDistrictId) errors.push(`${invalidDistrictId} profils avec district_id non canonique`);
  if (parisCityProfiles !== PARIS_PROFILE_TARGET) errors.push(`city=Paris: ${parisCityProfiles}/${PARIS_PROFILE_TARGET}`);
  if (grandParisCityProfiles !== EXPECTED_PROFILE_COUNT - PARIS_PROFILE_TARGET) {
    errors.push(`city=Grand Paris: ${grandParisCityProfiles}/${EXPECTED_PROFILE_COUNT - PARIS_PROFILE_TARGET}`);
  }
  if (districtIds.size !== zones.length) errors.push(`district_id distincts: ${districtIds.size}/${zones.length}`);
  if (invalidDerivedMetadata) errors.push(`${invalidDerivedMetadata} profils avec metadata cluster/density/avatar_url invalide`);
  if (publicCoordinateMismatch) errors.push(`${publicCoordinateMismatch} profils avec lat/lng != public_display`);
  if (samePrivatePublic) errors.push(`${samePrivatePublic} profils avec coordonnees privees egales au public`);
  if (privateOutsideZone) errors.push(`${privateOutsideZone} coordonnees privees hors feuille`);
  if (privateOutsideCommune) errors.push(`${privateOutsideCommune} coordonnees privees hors commune`);
  if (privacyTooClose) errors.push(`${privacyTooClose} distances privees < 45m`);
  if (privacyTooFar) errors.push(`${privacyTooFar} distances privees > 650m`);
  if (missingPrivateCoordinates) errors.push(`${missingPrivateCoordinates} profils sans coordonnees privees`);
  if (privatePublicCoordinateCollisions) {
    errors.push(`${privatePublicCoordinateCollisions} coordonnees privees en collision avec une coordonnee publique`);
  }
  if (privacyBelowPreferred) warnings.push(`${privacyBelowPreferred} distances privees entre 45m et 70m`);
  if (privacyAbovePreferred) warnings.push(`${privacyAbovePreferred} distances privees entre 330m et 650m`);

  const anomalies = {
    emptyZones: [],
    missingUtilisateur: [],
    missingUtilisatrice: [],
    lowDiversity: [],
    dominantStyle: [],
    privacyTooClose: privacyTooClose ? [`profiles:${privacyTooClose}`] : [],
    privacyTooFar: privacyTooFar ? [`profiles:${privacyTooFar}`] : [],
    privacyOutsideZone: privateOutsideZone ? [`profiles:${privateOutsideZone}`] : [],
    privacyOutsideCommune: privateOutsideCommune ? [`profiles:${privateOutsideCommune}`] : [],
    duplicatePrivateCoordinates: duplicatePrivateCoordinates ? [`profiles:${duplicatePrivateCoordinates}`] : [],
    samePrivatePublic: samePrivatePublic ? [`profiles:${samePrivatePublic}`] : [],
    privatePublicCoordinateCollisions: privatePublicCoordinateCollisions
      ? [`coordinates:${privatePublicCoordinateCollisions}`]
      : [],
  };
  const zoneRows = [];
  for (const zone of zones) {
    const zoneAssignments = byZone.get(zone.id);
    const styles = countByStyle(zoneAssignments);
    const differentStyles = Object.values(styles).filter((count) => count > 0).length;
    const leading = leadingStyle(styles, zoneAssignments.length);
    const zonePrivateDistances = zoneAssignments.map((assignment) => coordinateDistanceMeters(
      assignment.lng,
      assignment.lat,
      assignment.privateLng,
      assignment.privateLat,
    ));
    const zonePrivateDistanceStats = distanceSummary(zonePrivateDistances);
    const familyCoverage = Object.fromEntries(
      FAMILY_ORDER.map((family) => [family, STYLE_FAMILIES[family].some((style) => styles[style] > 0)]),
    );
    if (!zoneAssignments.length) anomalies.emptyZones.push(zone.id);
    if (!styles.avatar_4) anomalies.missingUtilisateur.push(zone.id);
    if (!styles.avatar_3) anomalies.missingUtilisatrice.push(zone.id);
    if (zoneAssignments.length >= MIN_DIVERSE_ZONE_SIZE
      && (differentStyles < 8 || Object.values(familyCoverage).some((present) => !present))) {
      anomalies.lowDiversity.push(zone.id);
    }
    if (zoneAssignments.length >= 4 && leading.share > 0.3) anomalies.dominantStyle.push(zone.id);
    if (zoneAssignments.length !== zone.quota) errors.push(`${zone.id}: ${zoneAssignments.length}/${zone.quota} profils`);
    zoneRows.push({
      zoneId: zone.id,
      zoneLabel: zone.label,
      region: zone.region,
      parentId: zone.parentId,
      parentLabel: zone.parentLabel,
      archetype: zone.archetype,
      city: zone.region === 'paris' ? 'Paris' : 'Grand Paris',
      cityId: zone.region === 'paris' ? 'city_paris' : zone.parentId,
      districtId: zone.id,
      parentPopulation: zone.parentPopulation ?? null,
      surfaceSquareKilometers: Number(zone.surfaceSquareKilometers.toFixed(4)),
      profilesPerSquareKilometer: Number(zone.profilesPerSquareKilometer.toFixed(2)),
      capacityUtilization: Number(zone.capacityUtilization.toFixed(6)),
      densityTier: zone.densityTier,
      densityWeight: zone.densityWeight,
      privateDistanceMedian: zonePrivateDistanceStats.median,
      privateDistanceP95: zonePrivateDistanceStats.p95,
      total: zoneAssignments.length,
      anchorCapacity: zone.anchorCount,
      differentStyles,
      utilisateur: styles.avatar_4,
      utilisatrice: styles.avatar_3,
      leadingStyle: leading.style,
      leadingStyleLabel: leading.label,
      leadingStyleCount: leading.count,
      leadingStylePercent: Number((leading.share * 100).toFixed(2)),
      styles,
    });
  }

  for (const [name, values] of Object.entries(anomalies)) {
    if (values.length) errors.push(`${name}: ${values.length} zone(s)`);
  }

  const charonneAssignments = byZone.get(CHARONNE_ZONE_ID) ?? [];
  errors.push(...validateCharonne(charonneAssignments));

  const communeMap = new Map();
  for (const row of zoneRows.filter((zone) => zone.region === 'grand_paris')) {
    const aggregate = communeMap.get(row.parentId) ?? {
      communeId: row.parentId,
      communeCode: row.parentId.replace('grand_paris_commune_', ''),
      communeLabel: row.parentLabel,
      subzoneCount: 0,
      total: 0,
      styles: Object.fromEntries(STYLE_IDS.map((style) => [style, 0])),
      population: row.parentPopulation,
      surfaceSquareKilometers: 0,
    };
    aggregate.subzoneCount += 1;
    aggregate.total += row.total;
    aggregate.surfaceSquareKilometers += row.surfaceSquareKilometers;
    for (const style of STYLE_IDS) aggregate.styles[style] += row.styles[style];
    communeMap.set(row.parentId, aggregate);
  }
  const communeRows = [...communeMap.values()].sort((left, right) => left.communeCode.localeCompare(right.communeCode));
  for (const row of communeRows) {
    row.differentStyles = Object.values(row.styles).filter((count) => count > 0).length;
    row.utilisateur = row.styles.avatar_4;
    row.utilisatrice = row.styles.avatar_3;
    const leading = leadingStyle(row.styles, row.total);
    row.leadingStyle = leading.style;
    row.leadingStyleLabel = leading.label;
    row.leadingStyleCount = leading.count;
    row.leadingStylePercent = Number((leading.share * 100).toFixed(2));
    row.profilesPerSquareKilometer = Number((row.total / row.surfaceSquareKilometers).toFixed(2));
  }

  const globalStyles = countByStyle(assignments);
  for (const style of STYLE_IDS) {
    if (!globalStyles[style]) errors.push(`${style} (${AVATAR_STYLES[style]}) absent globalement`);
  }
  if (sumStyleCounts(globalStyles) !== EXPECTED_PROFILE_COUNT) errors.push('Somme globale des styles invalide');

  return {
    errors: [...new Set(errors)],
    warnings,
    anomalies,
    totals: {
      profiles: assignments.length,
      uniqueUuids: assignmentIds.size,
      uniqueCoordinates: coordinateKeys.size,
      uniquePrivateCoordinates: privateCoordinateKeys.size,
      paris: zoneRows.filter((row) => row.region === 'paris').reduce((total, row) => total + row.total, 0),
      grandParis: zoneRows.filter((row) => row.region === 'grand_paris').reduce((total, row) => total + row.total, 0),
      parisQuarters: zoneRows.filter((row) => row.region === 'paris').length,
      grandParisSubzones: zoneRows.filter((row) => row.region === 'grand_paris').length,
      grandParisCommunes: communeRows.length,
      leafDistrictIds: districtIds.size,
      parisCityProfiles,
      grandParisCityProfiles,
      utilisateur: globalStyles.avatar_4,
      utilisatrice: globalStyles.avatar_3,
      charonneReserved: charonneAssignments.length,
      outsideZone,
      outsideCommune,
      duplicateIds,
      duplicateCoordinates,
      missingAvatar,
      missingInstrument,
      invalidCity,
      invalidCityId,
      invalidDistrictId,
      invalidDerivedMetadata,
      publicCoordinateMismatch,
      samePrivatePublic,
      duplicatePrivateCoordinates,
      privateOutsideZone,
      privateOutsideCommune,
      privacyTooClose,
      privacyTooFar,
      privacyBelowPreferred,
      privacyAbovePreferred,
      missingPrivateCoordinates,
      privatePublicCoordinateCollisions,
    },
    privateDistanceStats: {
      ...distanceSummary(privateDistances),
      placementQualityCounts: privatePlacementQualityCounts,
    },
    globalStyles,
    zoneRows,
    communeRows,
  };
}

function markdownReport(report) {
  const verdict = report.applyEligible ? 'PASS' : 'FAIL';
  const styleLines = STYLE_IDS.map((style) => `| ${style} | ${AVATAR_STYLES[style]} | ${report.globalStyles[style]} |`);
  return `# Dispatch avatars Paris + Grand Paris

- Verdict dry-run: **${verdict}**
- Seed: \`${report.seed}\`
- Snapshot DB: \`${report.databaseFingerprint}\`
- Assignment plan SHA-256: \`${report.assignmentPlanHash}\`
- Profils: ${report.totals.profiles}
- Quartiers Paris: ${report.totals.parisQuarters} (${report.totals.paris} profils)
- Sous-zones Grand Paris: ${report.totals.grandParisSubzones} (${report.totals.grandParis} profils)
- Communes Grand Paris: ${report.totals.grandParisCommunes}
- Feuilles district_id: ${report.totals.leafDistrictIds}
- Utilisateur: ${report.totals.utilisateur}
- Utilisatrice: ${report.totals.utilisatrice}
- Charonne reserve exact: ${report.totals.charonneReserved}/450
- Coordonnees uniques: ${report.totals.uniqueCoordinates}/${report.totals.profiles}
- Coordonnees privees uniques: ${report.totals.uniquePrivateCoordinates}/${report.totals.profiles}
- Coordonnees hors zone/commune: ${report.totals.outsideZone}/${report.totals.outsideCommune}
- Distance privee min/mediane/p95/max: ${report.privateDistanceStats.min} / ${report.privateDistanceStats.median} / ${report.privateDistanceStats.p95} / ${report.privateDistanceStats.max} m
- Distance privee 70-330m: ${report.privateDistanceStats.preferredRangeCount} (${report.privateDistanceStats.preferredRangePercent}%)

## Blocages application

${report.blockers.length ? report.blockers.map((blocker) => `- ${blocker}`).join('\n') : '- Aucun.'}

## Erreurs dry-run

${report.errors.length ? report.errors.map((error) => `- ${error}`).join('\n') : '- Aucune.'}

## Avertissements

${report.warnings.map((warning) => `- ${warning}`).join('\n')}

## Anomalies de distribution

| Controle | Zones signalees |
| --- | ---: |
| Zones vides | ${report.anomalies.emptyZones.length} |
| Sans Utilisateur | ${report.anomalies.missingUtilisateur.length} |
| Sans Utilisatrice | ${report.anomalies.missingUtilisatrice.length} |
| Diversite insuffisante | ${report.anomalies.lowDiversity.length} |
| Style dominant > 30% | ${report.anomalies.dominantStyle.length} |
| Privacy < 45m | ${report.totals.privacyTooClose} |
| Privacy > 650m | ${report.totals.privacyTooFar} |
| Privacy hors feuille/commune | ${report.totals.privateOutsideZone}/${report.totals.privateOutsideCommune} |
| Coordonnees privees dupliquees | ${report.totals.duplicatePrivateCoordinates} |
| Collisions prive/public | ${report.totals.privatePublicCoordinateCollisions} |

## Styles

| ID | Style | Total |
| --- | --- | ---: |
${styleLines.join('\n')}

Les details complets par quartier/sous-zone et par commune sont dans \`zones.csv\` et \`communes.csv\`.
`;
}

export function writeReports({
  summary,
  seed,
  databaseFingerprint,
  assignmentPlanHash,
  assets,
  stylePlan,
  blockers,
  reportRoot = PATHS.reports,
}) {
  const runId = `dry-run-${sha256(`${seed}:${databaseFingerprint}:${assignmentPlanHash}`).slice(0, 12)}`;
  const reportDir = path.resolve(reportRoot, runId);
  fs.mkdirSync(reportDir, { recursive: true });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runId,
    seed,
    databaseFingerprint,
    assignmentPlanHash,
    assets,
    applyEligible: summary.errors.length === 0 && blockers.length === 0,
    blockers,
    errors: summary.errors,
    warnings: summary.warnings,
    anomalies: summary.anomalies,
    totals: summary.totals,
    privateDistanceStats: summary.privateDistanceStats,
    globalStyles: summary.globalStyles,
    stylePlan: {
      sourceCanonicalCounts: stylePlan.sourceCanonicalCounts,
      effectiveCurrent: stylePlan.effectiveCurrent,
      fixtureCounts: stylePlan.fixtureCounts,
      targets: stylePlan.globalTargets,
      legacyAvatarRemapCount: stylePlan.legacyAvatarRemapCount,
      minimumRequirements: stylePlan.minimumRequirements,
    },
    zones: summary.zoneRows,
    communes: summary.communeRows,
  };

  const zoneHeaders = [
    'zoneId', 'zoneLabel', 'region', 'parentId', 'parentLabel', 'parentPopulation', 'archetype', 'city', 'cityId',
    'districtId', 'total', 'anchorCapacity', 'surfaceSquareKilometers', 'profilesPerSquareKilometer',
    'capacityUtilization', 'densityTier', 'densityWeight', 'privateDistanceMedian', 'privateDistanceP95',
    'differentStyles', 'utilisateur', 'utilisatrice', 'leadingStyle', 'leadingStyleLabel',
    'leadingStyleCount', 'leadingStylePercent', ...STYLE_IDS,
  ];
  const zoneCsvRows = summary.zoneRows.map((row) => ({ ...row, ...row.styles }));
  const communeHeaders = [
    'communeId', 'communeCode', 'communeLabel', 'population', 'subzoneCount', 'total',
    'surfaceSquareKilometers', 'profilesPerSquareKilometer', 'differentStyles',
    'utilisateur', 'utilisatrice', 'leadingStyle', 'leadingStyleLabel', 'leadingStyleCount',
    'leadingStylePercent', ...STYLE_IDS,
  ];
  const communeCsvRows = summary.communeRows.map((row) => ({ ...row, ...row.styles }));
  const styleRows = STYLE_IDS.map((style) => ({
    style,
    label: AVATAR_STYLES[style],
    sourceEffective: stylePlan.effectiveCurrent[style],
    charonneFixture: stylePlan.fixtureCounts[style],
    target: stylePlan.globalTargets[style],
    final: summary.globalStyles[style],
  }));

  fs.writeFileSync(path.join(reportDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(reportDir, 'report.md'), markdownReport(report));
  fs.writeFileSync(path.join(reportDir, 'zones.csv'), toCsv(zoneHeaders, zoneCsvRows));
  fs.writeFileSync(path.join(reportDir, 'communes.csv'), toCsv(communeHeaders, communeCsvRows));
  fs.writeFileSync(
    path.join(reportDir, 'styles.csv'),
    toCsv(['style', 'label', 'sourceEffective', 'charonneFixture', 'target', 'final'], styleRows),
  );
  return { report, reportDir };
}
