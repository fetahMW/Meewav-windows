import {
  ARCHETYPE_BOOSTS,
  AVATAR_ASSET_URLS,
  CHARONNE_PROFILE_COUNT,
  CHARONNE_ZONE_ID,
  EXPECTED_PROFILE_COUNT,
  FAMILY_ORDER,
  MIN_DIVERSE_ZONE_SIZE,
  PARIS_PROFILE_TARGET,
  STYLE_FAMILIES,
  STYLE_IDS,
  USER_STYLE_TARGET,
  canonicalAvatarId,
} from './constants.mjs';
import { coordinateKey, getPolygons, hash32, pointInFeature, stableSortByHash } from './geometry.mjs';
import { generateZoneBlueNoisePoints } from './blue-noise.mjs';

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function dominanceCap(quota) {
  return quota >= 4 ? Math.max(1, Math.floor(quota * 0.3)) : quota;
}

function allocateWeightedWithCaps(entries, target, seed) {
  const result = new Map();
  for (const entry of entries) result.set(entry.id, entry.fixed ?? entry.minimum);
  const minimumTotal = sum([...result.values()]);
  const maximumTotal = sum(entries.map((entry) => entry.fixed ?? entry.maximum));
  if (target < minimumTotal || target > maximumTotal) {
    throw new Error(`Quota regional infaisable: cible=${target}, min=${minimumTotal}, max=${maximumTotal}`);
  }

  let remaining = target - minimumTotal;
  while (remaining > 0) {
    const active = entries.filter((entry) => entry.fixed == null && result.get(entry.id) < entry.maximum);
    if (!active.length) throw new Error(`Capacite epuisee avec ${remaining} profils non alloues`);
    const totalWeight = sum(active.map((entry) => entry.weight));
    const proposals = active.map((entry) => {
      const room = entry.maximum - result.get(entry.id);
      const ideal = remaining * (entry.weight / totalWeight);
      return {
        entry,
        room,
        ideal,
        grant: Math.min(room, Math.floor(ideal)),
        fraction: ideal - Math.floor(ideal),
      };
    });
    let granted = sum(proposals.map((proposal) => proposal.grant));
    if (granted === 0) {
      proposals.sort((left, right) => right.fraction - left.fraction
        || hash32(`${seed}:quota-remainder:${left.entry.id}`) - hash32(`${seed}:quota-remainder:${right.entry.id}`)
        || left.entry.id.localeCompare(right.entry.id));
      const count = Math.min(remaining, proposals.length);
      for (let index = 0; index < count; index += 1) proposals[index].grant = 1;
      granted = count;
    }
    if (granted > remaining) {
      proposals.sort((left, right) => left.fraction - right.fraction
        || left.entry.id.localeCompare(right.entry.id));
      let excess = granted - remaining;
      for (const proposal of proposals) {
        const reduction = Math.min(excess, proposal.grant);
        proposal.grant -= reduction;
        excess -= reduction;
        if (!excess) break;
      }
      granted = remaining;
    }
    for (const proposal of proposals) {
      if (proposal.grant) result.set(proposal.entry.id, result.get(proposal.entry.id) + proposal.grant);
    }
    remaining -= granted;
  }
  return result;
}

function leafQuotaEntries(zones) {
  return zones.map((zone) => {
    const surfaceWeight = featureAreaSquareKilometers(zone.feature);
    const maximum = EXPECTED_PROFILE_COUNT;
    if (zone.id === CHARONNE_ZONE_ID) {
      return { id: zone.id, fixed: CHARONNE_PROFILE_COUNT, maximum, minimum: CHARONNE_PROFILE_COUNT, weight: 1 };
    }
    return {
      id: zone.id,
      minimum: 12,
      maximum,
      weight: surfaceWeight,
    };
  });
}

function ringAreaSquareMeters(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  const meanLatitude = ring.reduce((total, point) => total + Number(point[1]), 0) / ring.length;
  const metersPerDegreeLng = 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  const metersPerDegreeLat = 110_574;
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    twiceArea += (Number(current[0]) * metersPerDegreeLng) * (Number(next[1]) * metersPerDegreeLat)
      - (Number(next[0]) * metersPerDegreeLng) * (Number(current[1]) * metersPerDegreeLat);
  }
  return Math.abs(twiceArea) / 2;
}

function featureAreaSquareKilometers(feature) {
  const squareMeters = getPolygons(feature).reduce((total, polygon) => {
    const [outer, ...holes] = polygon;
    return total + ringAreaSquareMeters(outer) - sum(holes.map(ringAreaSquareMeters));
  }, 0);
  return Math.max(squareMeters / 1_000_000, 1e-6);
}

function assignDensityMetadata(zones) {
  const tiers = [
    { name: 'high', weight: 1 },
    { name: 'medium', weight: 0.7 },
    { name: 'low', weight: 0.35 },
    { name: 'very_low', weight: 0.12 },
  ];
  for (const region of ['paris', 'grand_paris']) {
    const regionZones = zones
      .filter((zone) => zone.region === region)
      .sort((left, right) => {
        left.surfaceSquareKilometers ??= featureAreaSquareKilometers(left.feature);
        right.surfaceSquareKilometers ??= featureAreaSquareKilometers(right.feature);
        const ratioDelta = (right.quota / right.surfaceSquareKilometers)
          - (left.quota / left.surfaceSquareKilometers);
        return ratioDelta || left.id.localeCompare(right.id);
      });
    for (let index = 0; index < regionZones.length; index += 1) {
      const tier = tiers[Math.min(3, Math.floor((index / regionZones.length) * 4))];
      regionZones[index].surfaceSquareKilometers ??= featureAreaSquareKilometers(regionZones[index].feature);
      regionZones[index].densityTier = tier.name;
      regionZones[index].densityWeight = tier.weight;
      regionZones[index].capacityUtilization = 1;
      regionZones[index].profilesPerSquareKilometer = regionZones[index].quota
        / regionZones[index].surfaceSquareKilometers;
    }
  }
}

export function adoptExistingZoneQuotas(zones, profiles) {
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const counts = new Map(zones.map((zone) => [zone.id, 0]));
  const unknown = new Map();
  for (const profile of profiles) {
    const zoneId = String(profile.district_id ?? '');
    if (!zoneById.has(zoneId)) {
      unknown.set(zoneId || '(vide)', (unknown.get(zoneId || '(vide)') ?? 0) + 1);
      continue;
    }
    counts.set(zoneId, counts.get(zoneId) + 1);
  }
  if (unknown.size) {
    throw new Error(`Quartiers existants non reconnus: ${JSON.stringify(Object.fromEntries(unknown))}`);
  }
  const emptyZones = zones.filter((zone) => !counts.get(zone.id));
  if (emptyZones.length) throw new Error(`${emptyZones.length} quartiers existants sans inscription`);

  for (const zone of zones) zone.quota = counts.get(zone.id);
  const paris = zones.filter((zone) => zone.region === 'paris').reduce((total, zone) => total + zone.quota, 0);
  const grandParis = zones.filter((zone) => zone.region === 'grand_paris').reduce((total, zone) => total + zone.quota, 0);
  if (paris !== PARIS_PROFILE_TARGET || paris + grandParis !== EXPECTED_PROFILE_COUNT) {
    throw new Error(`Adhesions existantes incoherentes: Paris=${paris}, Grand Paris=${grandParis}`);
  }
  if (counts.get(CHARONNE_ZONE_ID) !== CHARONNE_PROFILE_COUNT) {
    throw new Error(`Charonne existant: ${counts.get(CHARONNE_ZONE_ID)}/${CHARONNE_PROFILE_COUNT}`);
  }
  assignDensityMetadata(zones);

  const grandParisParentQuotas = {};
  for (const zone of zones.filter((candidate) => candidate.region === 'grand_paris')) {
    grandParisParentQuotas[zone.parentId] = (grandParisParentQuotas[zone.parentId] ?? 0) + zone.quota;
  }
  return { paris, grandParis, total: paris + grandParis, grandParisParentQuotas };
}

export function allocateZoneQuotas(zones, seed) {
  const paris = zones.filter((zone) => zone.region === 'paris');
  const grandParis = zones.filter((zone) => zone.region === 'grand_paris');
  const parisQuotas = allocateWeightedWithCaps(leafQuotaEntries(paris), PARIS_PROFILE_TARGET, `${seed}:paris-ban`);

  const grandParisByParent = new Map();
  for (const zone of grandParis) {
    const bucket = grandParisByParent.get(zone.parentId) ?? [];
    bucket.push(zone);
    grandParisByParent.set(zone.parentId, bucket);
  }
  if (grandParisByParent.size !== 123) {
    throw new Error(`Parents Grand Paris: ${grandParisByParent.size}/123`);
  }
  const parentEntries = [...grandParisByParent.entries()].map(([parentId, parentZones]) => {
    const populations = new Set(parentZones.map((zone) => zone.parentPopulation));
    if (populations.size !== 1 || !Number.isFinite(parentZones[0].parentPopulation) || parentZones[0].parentPopulation <= 0) {
      throw new Error(`${parentId}: population officielle absente ou incoherente`);
    }
    const leaves = leafQuotaEntries(parentZones);
    return {
      id: parentId,
      minimum: sum(leaves.map((entry) => entry.minimum)),
      maximum: sum(leaves.map((entry) => entry.maximum)),
      weight: parentZones[0].parentPopulation,
    };
  });
  const grandParisTarget = EXPECTED_PROFILE_COUNT - PARIS_PROFILE_TARGET;
  const parentQuotas = allocateWeightedWithCaps(
    parentEntries,
    grandParisTarget,
    `${seed}:grand-paris-population`,
  );
  const grandParisQuotas = new Map();
  for (const [parentId, parentZones] of grandParisByParent) {
    const leafQuotas = allocateWeightedWithCaps(
      leafQuotaEntries(parentZones),
      parentQuotas.get(parentId),
      `${seed}:grand-paris-polygon-area:${parentId}`,
    );
    for (const [zoneId, quota] of leafQuotas) grandParisQuotas.set(zoneId, quota);
  }

  for (const zone of zones) zone.quota = parisQuotas.get(zone.id) ?? grandParisQuotas.get(zone.id);
  const total = sum(zones.map((zone) => zone.quota));
  if (total !== EXPECTED_PROFILE_COUNT) throw new Error(`Total quotas invalide: ${total}`);
  assignDensityMetadata(zones);
  return {
    paris: PARIS_PROFILE_TARGET,
    grandParis: grandParisTarget,
    total,
    grandParisParentQuotas: Object.fromEntries(parentQuotas),
  };
}

function countStyles(profiles, excludedIds) {
  const counts = Object.fromEntries(STYLE_IDS.map((style) => [style, 0]));
  let remappedLegacy = 0;
  for (const profile of profiles) {
    if (excludedIds.has(profile.id)) continue;
    const canonical = canonicalAvatarId(profile.avatar_id);
    if (!canonical) throw new Error(`${profile.id}: avatar_id non canonique ${profile.avatar_id}`);
    if (canonical !== profile.avatar_id) remappedLegacy += 1;
    counts[canonical] += 1;
  }
  return { counts, remappedLegacy };
}

function countFixtureStyles(fixtures) {
  const counts = Object.fromEntries(STYLE_IDS.map((style) => [style, 0]));
  for (const fixture of fixtures) {
    const style = canonicalAvatarId(fixture.avatar_id);
    if (!style) throw new Error(`${fixture.id}: style Charonne non canonique ${fixture.avatar_id}`);
    counts[style] += 1;
  }
  return counts;
}

function proportionalIntegerTargets(currentCounts, styles, targetTotal, seed) {
  const currentTotal = sum(styles.map((style) => currentCounts[style]));
  const entries = styles.map((style) => {
    const exact = currentCounts[style] * targetTotal / currentTotal;
    return { style, value: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remainder = targetTotal - sum(entries.map((entry) => entry.value));
  entries.sort((left, right) => right.fraction - left.fraction
    || hash32(`${seed}:style-target:${left.style}`) - hash32(`${seed}:style-target:${right.style}`));
  for (let index = 0; index < remainder; index += 1) entries[index].value += 1;
  return Object.fromEntries(entries.map((entry) => [entry.style, entry.value]));
}

function requiredFamilyCounts(zones) {
  const requirements = Object.fromEntries(FAMILY_ORDER.map((family) => [family, 0]));
  for (const zone of zones) {
    const familyCount = zone.quota >= MIN_DIVERSE_ZONE_SIZE
      ? FAMILY_ORDER.length
      : Math.min(FAMILY_ORDER.length, Math.max(0, zone.quota - 2));
    for (const family of FAMILY_ORDER.slice(0, familyCount)) requirements[family] += 1;
  }
  return requirements;
}

function reduceFrequentTargets(targets, styleMinimums, familyMinimums, reduction, seed) {
  const frequentStyles = [
    'avatar_23', 'avatar_24', 'avatar_25', 'avatar_5', 'avatar_14', 'avatar_17',
    'avatar_21', 'avatar_6', 'avatar_16', 'avatar_15', 'avatar_7',
  ];
  const familyForStyle = new Map();
  for (const [family, styles] of Object.entries(STYLE_FAMILIES)) {
    for (const style of styles) familyForStyle.set(style, family);
  }
  let remaining = reduction;
  while (remaining > 0) {
    const active = frequentStyles.filter((style) => {
      if (targets[style] <= (styleMinimums[style] ?? 0)) return false;
      const family = familyForStyle.get(style);
      if (!family) return true;
      const familyTotal = sum(STYLE_FAMILIES[family].map((member) => targets[member]));
      return familyTotal > familyMinimums[family];
    });
    if (!active.length) throw new Error(`Impossible de compenser ${remaining} profils apres minima styles`);
    const totalWeight = sum(active.map((style) => targets[style]));
    const proposals = active.map((style) => {
      const family = familyForStyle.get(style);
      const familyRoom = family
        ? sum(STYLE_FAMILIES[family].map((member) => targets[member])) - familyMinimums[family]
        : Infinity;
      const capacity = Math.min(targets[style] - (styleMinimums[style] ?? 0), familyRoom);
      const exact = remaining * targets[style] / totalWeight;
      return { style, capacity, grant: Math.min(capacity, Math.floor(exact)), fraction: exact - Math.floor(exact) };
    });
    let granted = sum(proposals.map((proposal) => proposal.grant));
    if (!granted) {
      proposals.sort((left, right) => right.fraction - left.fraction
        || hash32(`${seed}:minimum-rebalance:${left.style}`) - hash32(`${seed}:minimum-rebalance:${right.style}`));
      const proposal = proposals.find((candidate) => candidate.capacity > 0);
      if (!proposal) throw new Error('Aucun donneur frequent disponible pour les minima styles');
      proposal.grant = 1;
      granted = 1;
    }
    if (granted > remaining) {
      let excess = granted - remaining;
      for (const proposal of proposals.sort((left, right) => left.fraction - right.fraction)) {
        const removed = Math.min(excess, proposal.grant);
        proposal.grant -= removed;
        excess -= removed;
        if (!excess) break;
      }
      granted = remaining;
    }
    for (const proposal of proposals) targets[proposal.style] -= proposal.grant;
    remaining -= granted;
  }
}

export function buildStyleTargets(profiles, reservedIds, fixtures, zones, seed) {
  const source = countStyles(profiles, reservedIds);
  const fixtureCounts = countFixtureStyles(fixtures);
  const effectiveCurrent = Object.fromEntries(
    STYLE_IDS.map((style) => [style, source.counts[style] + fixtureCounts[style]]),
  );
  const nonUserStyles = STYLE_IDS.filter((style) => style !== 'avatar_3' && style !== 'avatar_4');
  const nonUserTargets = proportionalIntegerTargets(
    effectiveCurrent,
    nonUserStyles,
    EXPECTED_PROFILE_COUNT - 2 * USER_STYLE_TARGET,
    seed,
  );
  const globalTargets = {
    ...nonUserTargets,
    avatar_3: USER_STYLE_TARGET,
    avatar_4: USER_STYLE_TARGET,
  };
  const familyRequirements = requiredFamilyCounts(zones);
  const styleMinimums = Object.fromEntries(STYLE_IDS.map((style) => [style, 0]));
  styleMinimums.avatar_3 = zones.length + fixtureCounts.avatar_3;
  styleMinimums.avatar_4 = zones.length + fixtureCounts.avatar_4;
  for (const family of FAMILY_ORDER) {
    const styles = STYLE_FAMILIES[family];
    if (styles.length === 1) {
      const style = styles[0];
      styleMinimums[style] = familyRequirements[family] + fixtureCounts[style];
    }
  }
  const familyMinimums = Object.fromEntries(FAMILY_ORDER.map((family) => [
    family,
    familyRequirements[family] + sum(STYLE_FAMILIES[family].map((style) => fixtureCounts[style])),
  ]));
  let raised = 0;
  for (const style of STYLE_IDS) {
    if (globalTargets[style] < styleMinimums[style]) {
      raised += styleMinimums[style] - globalTargets[style];
      globalTargets[style] = styleMinimums[style];
    }
  }
  for (const family of FAMILY_ORDER) {
    const styles = STYLE_FAMILIES[family];
    const current = sum(styles.map((style) => globalTargets[style]));
    const deficit = Math.max(0, familyMinimums[family] - current);
    for (let index = 0; index < deficit; index += 1) {
      const style = styles
        .filter((candidate) => effectiveCurrent[candidate] > 0)
        .sort((left, right) => effectiveCurrent[right] - effectiveCurrent[left]
          || hash32(`${seed}:family-minimum:${family}:${left}`) - hash32(`${seed}:family-minimum:${family}:${right}`))[0];
      if (!style) throw new Error(`Famille ${family}: aucune cible disponible pour le minimum`);
      globalTargets[style] += 1;
      raised += 1;
    }
  }
  if (raised) reduceFrequentTargets(globalTargets, styleMinimums, familyMinimums, raised, seed);
  const remainingTargets = Object.fromEntries(
    STYLE_IDS.map((style) => [style, globalTargets[style] - fixtureCounts[style]]),
  );
  for (const style of STYLE_IDS) {
    if (remainingTargets[style] < 0) throw new Error(`Fixture Charonne depasse la cible ${style}`);
  }
  if (sum(Object.values(globalTargets)) !== EXPECTED_PROFILE_COUNT) throw new Error('Marges styles globales invalides');
  return {
    sourceCanonicalCounts: source.counts,
    fixtureCounts,
    effectiveCurrent,
    globalTargets,
    remainingTargets,
    legacyAvatarRemapCount: source.remappedLegacy,
    minimumRequirements: {
      styles: styleMinimums,
      families: familyMinimums,
      raisedAndRebalanced: raised,
    },
  };
}

export function validateStyleTargetFeasibility(zones, targetColumns) {
  const errors = [];
  const familyRequirements = requiredFamilyCounts(zones);
  if (targetColumns.avatar_3 < zones.length) {
    errors.push(`Utilisatrice ${targetColumns.avatar_3}/${zones.length}`);
  }
  if (targetColumns.avatar_4 < zones.length) {
    errors.push(`Utilisateur ${targetColumns.avatar_4}/${zones.length}`);
  }
  for (const family of FAMILY_ORDER) {
    const available = sum(STYLE_FAMILIES[family].map((style) => targetColumns[style] ?? 0));
    if (available < familyRequirements[family]) {
      errors.push(`${family} ${available}/${familyRequirements[family]}`);
    }
  }
  if (errors.length) throw new Error(`Minima globaux styles infaisables: ${errors.join(', ')}`);
  return { familyRequirements, zoneCount: zones.length };
}

function styleBoost(zone, style) {
  return ARCHETYPE_BOOSTS[zone.archetype]?.[style] ?? 1;
}

function chooseFamilyStyle(zone, familyStyles, remaining, seed) {
  const available = familyStyles.filter((style) => remaining[style] > 0);
  if (!available.length) return null;
  return available.sort((left, right) => {
    const leftScore = remaining[left] * styleBoost(zone, left)
      * (0.96 + (hash32(`${seed}:family:${zone.id}:${left}`) / 0xffffffff) * 0.08);
    const rightScore = remaining[right] * styleBoost(zone, right)
      * (0.96 + (hash32(`${seed}:family:${zone.id}:${right}`) / 0xffffffff) * 0.08);
    return rightScore - leftScore || left.localeCompare(right);
  })[0];
}

function assertMatrixMargins(zones, matrix, targetColumns) {
  for (const zone of zones) {
    const rowTotal = sum(STYLE_IDS.map((style) => matrix.get(zone.id)[style]));
    if (rowTotal !== zone.quota) throw new Error(`${zone.id}: marge ligne ${rowTotal}/${zone.quota}`);
  }
  for (const style of STYLE_IDS) {
    const columnTotal = sum(zones.map((zone) => matrix.get(zone.id)[style]));
    if (columnTotal !== targetColumns[style]) {
      throw new Error(`${style}: marge colonne ${columnTotal}/${targetColumns[style]}`);
    }
  }
}

export function allocateStyleMatrix(zones, targetColumns, seed) {
  validateStyleTargetFeasibility(zones, targetColumns);
  const orderedZones = stableSortByHash(zones, `${seed}:style-zone-order`, (zone) => zone.id);
  const matrix = new Map(
    zones.map((zone) => [zone.id, Object.fromEntries(STYLE_IDS.map((style) => [style, 0]))]),
  );
  const remainingColumns = { ...targetColumns };
  const remainingRows = new Map(zones.map((zone) => [zone.id, zone.quota]));

  function add(zone, style) {
    if (remainingRows.get(zone.id) <= 0 || remainingColumns[style] <= 0) return false;
    matrix.get(zone.id)[style] += 1;
    remainingRows.set(zone.id, remainingRows.get(zone.id) - 1);
    remainingColumns[style] -= 1;
    return true;
  }

  for (const zone of orderedZones) {
    if (!add(zone, 'avatar_3') || !add(zone, 'avatar_4')) {
      throw new Error(`${zone.id}: impossible de garantir Utilisatrice + Utilisateur`);
    }
  }

  for (const zone of orderedZones) {
    const familyCount = zone.quota >= MIN_DIVERSE_ZONE_SIZE
      ? FAMILY_ORDER.length
      : Math.min(FAMILY_ORDER.length, remainingRows.get(zone.id));
    for (const family of FAMILY_ORDER.slice(0, familyCount)) {
      const style = chooseFamilyStyle(zone, STYLE_FAMILIES[family], remainingColumns, seed);
      if (!style || !add(zone, style)) throw new Error(`${zone.id}: minimum famille ${family} infaisable`);
    }
  }

  const activeZones = zones.filter((zone) => remainingRows.get(zone.id) > 0);
  const values = new Map();
  for (const zone of activeZones) {
    const row = {};
    for (const style of STYLE_IDS) {
      row[style] = remainingColumns[style] > 0
        ? styleBoost(zone, style) * (0.97 + (hash32(`${seed}:matrix:${zone.id}:${style}`) / 0xffffffff) * 0.06)
        : 0;
    }
    values.set(zone.id, row);
  }

  for (let iteration = 0; iteration < 90; iteration += 1) {
    for (const zone of activeZones) {
      const row = values.get(zone.id);
      const current = sum(STYLE_IDS.map((style) => row[style]));
      const factor = remainingRows.get(zone.id) / current;
      for (const style of STYLE_IDS) row[style] *= factor;
    }
    for (const style of STYLE_IDS) {
      if (!remainingColumns[style]) continue;
      const current = sum(activeZones.map((zone) => values.get(zone.id)[style]));
      const factor = remainingColumns[style] / current;
      for (const zone of activeZones) values.get(zone.id)[style] *= factor;
    }
  }

  const rowDeficits = new Map();
  const columnDeficits = { ...remainingColumns };
  for (const zone of activeZones) {
    let floorTotal = 0;
    for (const style of STYLE_IDS) {
      const value = Math.floor(values.get(zone.id)[style]);
      const styleCap = dominanceCap(zone.quota);
      if (value > styleCap) {
        throw new Error(`${zone.id}/${style}: plan continu au-dessus du plafond de dominance (${value}/${styleCap})`);
      }
      matrix.get(zone.id)[style] += value;
      floorTotal += value;
      columnDeficits[style] -= value;
    }
    rowDeficits.set(zone.id, remainingRows.get(zone.id) - floorTotal);
  }
  if (Object.values(columnDeficits).some((value) => value < 0)) {
    throw new Error('Arrondi matrice: deficit colonne negatif');
  }

  let cellsToFill = sum([...rowDeficits.values()]);
  if (cellsToFill !== sum(Object.values(columnDeficits))) throw new Error('Arrondi matrice: deficits incompatibles');
  const remainderZoneOrder = stableSortByHash(activeZones, `${seed}:matrix-remainders`, (zone) => zone.id);
  let cursor = 0;
  while (cellsToFill > 0) {
    const zone = remainderZoneOrder[cursor % remainderZoneOrder.length];
    cursor += 1;
    if (rowDeficits.get(zone.id) <= 0) continue;
    const styleCap = dominanceCap(zone.quota);
    const candidates = STYLE_IDS.filter(
      (style) => columnDeficits[style] > 0 && matrix.get(zone.id)[style] < styleCap,
    );
    if (!candidates.length) throw new Error('Arrondi matrice: aucune colonne disponible');
    candidates.sort((left, right) => {
      const leftFraction = values.get(zone.id)[left] - Math.floor(values.get(zone.id)[left]);
      const rightFraction = values.get(zone.id)[right] - Math.floor(values.get(zone.id)[right]);
      const leftShare = matrix.get(zone.id)[left] / zone.quota;
      const rightShare = matrix.get(zone.id)[right] / zone.quota;
      const leftScore = leftFraction + Math.log(styleBoost(zone, left)) * 0.03 - leftShare * 0.05
        + (hash32(`${seed}:remainder:${zone.id}:${left}`) / 0xffffffff) * 0.0001;
      const rightScore = rightFraction + Math.log(styleBoost(zone, right)) * 0.03 - rightShare * 0.05
        + (hash32(`${seed}:remainder:${zone.id}:${right}`) / 0xffffffff) * 0.0001;
      return rightScore - leftScore || left.localeCompare(right);
    });
    const style = candidates[0];
    matrix.get(zone.id)[style] += 1;
    rowDeficits.set(zone.id, rowDeficits.get(zone.id) - 1);
    columnDeficits[style] -= 1;
    cellsToFill -= 1;
  }

  assertMatrixMargins(zones, matrix, targetColumns);
  return matrix;
}

export function reserveCharonneProfiles(profiles, seed) {
  const ordered = stableSortByHash(profiles, `${seed}:charonne-reservation`, (profile) => profile.id);
  const selected = ordered.slice(0, CHARONNE_PROFILE_COUNT);
  if (selected.length !== CHARONNE_PROFILE_COUNT) throw new Error('Reservation Charonne incomplete');
  return { selected, ids: new Set(selected.map((profile) => profile.id)) };
}

export function assignFinalStyles(profiles, reservedIds, targetCounts, seed) {
  const sourceBuckets = Object.fromEntries(STYLE_IDS.map((style) => [style, []]));
  for (const profile of profiles) {
    if (reservedIds.has(profile.id)) continue;
    const style = canonicalAvatarId(profile.avatar_id);
    if (!style) throw new Error(`${profile.id}: style source invalide ${profile.avatar_id}`);
    sourceBuckets[style].push(profile);
  }

  const finalBuckets = Object.fromEntries(STYLE_IDS.map((style) => [style, []]));
  const surplus = [];
  let unchanged = 0;
  for (const style of STYLE_IDS) {
    const ordered = stableSortByHash(sourceBuckets[style], `${seed}:preserve:${style}`, (profile) => profile.id);
    const keep = Math.min(ordered.length, targetCounts[style]);
    finalBuckets[style].push(...ordered.slice(0, keep));
    surplus.push(...ordered.slice(keep));
    unchanged += keep;
  }

  const orderedSurplus = stableSortByHash(surplus, `${seed}:style-surplus`, (profile) => profile.id);
  let cursor = 0;
  for (const style of stableSortByHash(STYLE_IDS, `${seed}:style-deficits`)) {
    const deficit = targetCounts[style] - finalBuckets[style].length;
    for (let index = 0; index < deficit; index += 1) {
      const profile = orderedSurplus[cursor++];
      if (!profile) throw new Error(`Profils surplus insuffisants pour ${style}`);
      finalBuckets[style].push(profile);
    }
  }
  if (cursor !== orderedSurplus.length) throw new Error(`${orderedSurplus.length - cursor} profils surplus non consommes`);
  for (const style of STYLE_IDS) {
    if (finalBuckets[style].length !== targetCounts[style]) {
      throw new Error(`${style}: ${finalBuckets[style].length}/${targetCounts[style]} profils apres conversion`);
    }
  }
  return { buckets: finalBuckets, unchangedCount: unchanged, changedCount: orderedSurplus.length };
}

export function assignProfilesToZones(zones, matrix, profileBuckets, seed) {
  const byZone = new Map(zones.map((zone) => [zone.id, []]));
  for (const style of STYLE_IDS) {
    const profiles = stableSortByHash(profileBuckets[style], `${seed}:profile-order:${style}`, (profile) => profile.id);
    const zoneSlots = [];
    const orderedZones = stableSortByHash(zones, `${seed}:slot-order:${style}`, (zone) => zone.id);
    for (const zone of orderedZones) {
      for (let index = 0; index < matrix.get(zone.id)[style]; index += 1) zoneSlots.push(zone);
    }
    if (profiles.length !== zoneSlots.length) {
      throw new Error(`${style}: ${profiles.length} profils pour ${zoneSlots.length} places`);
    }
    for (let index = 0; index < profiles.length; index += 1) {
      byZone.get(zoneSlots[index].id).push({ profile: profiles[index], avatarId: style });
    }
  }
  return byZone;
}

function geographicFields(zone, anchor, seed) {
  const isParis = zone.region === 'paris';
  return {
    zoneId: zone.id,
    dataZoneId: zone.id,
    district: zone.parentLabel,
    zoneName: zone.label,
    addressLabel: zone.label,
    districtId: zone.id,
    districtName: zone.label,
    city: isParis ? 'Paris' : 'Grand Paris',
    cityId: isParis ? 'city_paris' : zone.parentId,
    cityName: isParis ? 'Paris' : zone.parentLabel,
    anchorId: anchor.id,
    anchorType: 'zone_blue_noise',
    addressId: null,
    sourceQuality: 'zone_blue_noise_deterministic',
    placementQuality: 'zone_blue_noise_pip_verified',
    mockSeedVersion: seed,
    densityTier: zone.densityTier,
    densityWeight: zone.densityWeight,
  };
}

function distanceMeters(left, right) {
  const meanLatitude = (Number(left.lat) + Number(right.lat)) / 2;
  const dx = (Number(right.lng) - Number(left.lng)) * 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  const dy = (Number(right.lat) - Number(left.lat)) * 110_574;
  return Math.sqrt(dx * dx + dy * dy);
}

function privatePointInsideZone(zone, lng, lat) {
  return pointInFeature([lng, lat], zone.feature)
    && (!zone.communeFeature || pointInFeature([lng, lat], zone.communeFeature));
}

function buildPrivateSpatialGrid(anchors, cellMeters = 70) {
  const meanLatitude = anchors.reduce((total, anchor) => total + anchor.lat, 0) / Math.max(1, anchors.length);
  const metersPerDegreeLng = 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  const metersPerDegreeLat = 110_574;
  const grid = new Map();
  function cellFor(lng, lat) {
    return [
      Math.floor((Number(lng) * metersPerDegreeLng) / cellMeters),
      Math.floor((Number(lat) * metersPerDegreeLat) / cellMeters),
    ];
  }
  for (const anchor of anchors) {
    const [x, y] = cellFor(anchor.lng, anchor.lat);
    const key = `${x}:${y}`;
    const bucket = grid.get(key) ?? [];
    bucket.push(anchor);
    grid.set(key, bucket);
  }
  return { grid, cellFor };
}

function deterministicPrivateJitter({
  zone,
  publicPoint,
  targetDistance,
  usedPrivateCoordinateKeys,
  forbiddenPublicCoordinateKeys,
  seed,
}) {
  const baseAngle = (hash32(`${seed}:private-angle:${publicPoint.id}`) / 0xffffffff) * Math.PI * 2;
  const radii = [targetDistance, 200, 170, 230, 140, 270, 110, 300, 80, 330, 60, 500, 45, 650];
  for (const radius of radii) {
    for (let step = 0; step < 48; step += 1) {
      const angle = baseAngle + step * (Math.PI * 2 / 48);
      const lat = Number((publicPoint.lat + (Math.sin(angle) * radius) / 110_574).toFixed(7));
      const lngScale = 111_320 * Math.cos(publicPoint.lat * Math.PI / 180);
      const lng = Number((publicPoint.lng + (Math.cos(angle) * radius) / lngScale).toFixed(7));
      const key = coordinateKey(lng, lat);
      if (key === coordinateKey(publicPoint.lng, publicPoint.lat)
        || usedPrivateCoordinateKeys.has(key)
        || forbiddenPublicCoordinateKeys.has(key)) continue;
      if (!privatePointInsideZone(zone, lng, lat)) continue;
      const measured = distanceMeters(publicPoint, { lng, lat });
      if (measured < 45 || measured > 650) continue;
      return {
        privateLng: lng,
        privateLat: lat,
        privateDistanceMeters: measured,
        privatePlacementQuality: measured >= 70 && measured <= 330 ? 'pip_jitter_preferred' : 'pip_jitter_tolerated',
      };
    }
  }
  return null;
}

export function buildPrivatePlacements({
  zone,
  publicPoints,
  candidateAnchors,
  usedPrivateCoordinateKeys,
  forbiddenPublicCoordinateKeys = new Set(),
  seed,
}) {
  const normalizedCandidates = [];
  const localKeys = new Set();
  for (const anchor of candidateAnchors) {
    const lng = Number(Number(anchor.lng).toFixed(7));
    const lat = Number(Number(anchor.lat).toFixed(7));
    const key = coordinateKey(lng, lat);
    if (localKeys.has(key) || !privatePointInsideZone(zone, lng, lat)) continue;
    localKeys.add(key);
    normalizedCandidates.push({ ...anchor, lng, lat, key });
  }
  const spatial = buildPrivateSpatialGrid(normalizedCandidates);
  const placements = new Array(publicPoints.length);
  const orderedIndexes = stableSortByHash(
    publicPoints.map((point, index) => ({ point, index })),
    `${seed}:private-profile-order:${zone.id}`,
    (entry) => entry.point.id,
  );

  for (const { point: publicPoint, index } of orderedIndexes) {
    const publicKey = coordinateKey(publicPoint.lng, publicPoint.lat);
    const targetDistance = 170 + (hash32(`${seed}:private-radius:${publicPoint.id}`) % 61);
    const [cellX, cellY] = spatial.cellFor(publicPoint.lng, publicPoint.lat);
    const nearby = [];
    for (let xOffset = -5; xOffset <= 5; xOffset += 1) {
      for (let yOffset = -5; yOffset <= 5; yOffset += 1) {
        nearby.push(...(spatial.grid.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? []));
      }
    }
    const ranked = nearby
      .filter((candidate) => candidate.key !== publicKey
        && !usedPrivateCoordinateKeys.has(candidate.key)
        && !forbiddenPublicCoordinateKeys.has(candidate.key))
      .map((candidate) => ({ candidate, distance: distanceMeters(publicPoint, candidate) }))
      .filter((entry) => entry.distance >= 70 && entry.distance <= 330)
      .sort((left, right) => Math.abs(left.distance - targetDistance) - Math.abs(right.distance - targetDistance)
        || hash32(`${seed}:private-anchor:${publicPoint.id}:${left.candidate.id}`)
          - hash32(`${seed}:private-anchor:${publicPoint.id}:${right.candidate.id}`));

    let placement = ranked[0] ? {
      privateLng: ranked[0].candidate.lng,
      privateLat: ranked[0].candidate.lat,
      privateDistanceMeters: ranked[0].distance,
      privatePlacementQuality: 'alternate_anchor_preferred',
    } : deterministicPrivateJitter({
      zone,
      publicPoint,
      targetDistance,
      usedPrivateCoordinateKeys,
      forbiddenPublicCoordinateKeys,
      seed,
    });

    if (!placement) {
      const tolerated = normalizedCandidates
        .filter((candidate) => candidate.key !== publicKey
          && !usedPrivateCoordinateKeys.has(candidate.key)
          && !forbiddenPublicCoordinateKeys.has(candidate.key))
        .map((candidate) => ({ candidate, distance: distanceMeters(publicPoint, candidate) }))
        .filter((entry) => entry.distance >= 45 && entry.distance <= 650)
        .sort((left, right) => Math.abs(left.distance - targetDistance) - Math.abs(right.distance - targetDistance)
          || left.candidate.key.localeCompare(right.candidate.key))[0];
      if (tolerated) {
        placement = {
          privateLng: tolerated.candidate.lng,
          privateLat: tolerated.candidate.lat,
          privateDistanceMeters: tolerated.distance,
          privatePlacementQuality: 'alternate_anchor_tolerated',
        };
      }
    }
    if (!placement) throw new Error(`${zone.id}/${publicPoint.id}: aucun point prive distinct PIP entre 45 et 650m`);
    const privateKey = coordinateKey(placement.privateLng, placement.privateLat);
    if (privateKey === publicKey
      || usedPrivateCoordinateKeys.has(privateKey)
      || forbiddenPublicCoordinateKeys.has(privateKey)) {
      throw new Error(`${zone.id}/${publicPoint.id}: coordonnee privee non unique`);
    }
    usedPrivateCoordinateKeys.add(privateKey);
    placements[index] = placement;
  }
  return placements;
}

function coordinateGridId(scope, level, precision, lng, lat) {
  return `${scope}_${level}_${Math.floor(Number(lng) * precision)}_${Math.floor(Number(lat) * precision)}`;
}

export function derivedPlacementFields(zone, lng, lat, avatarId) {
  const scope = zone.region === 'paris' ? 'paris' : zone.parentId;
  const cityId = zone.region === 'paris' ? 'city_paris' : zone.parentId;
  return {
    countryClusterId: 'country_france',
    cityClusterId: cityId,
    macroClusterId: coordinateGridId(scope, 'macro', 18, lng, lat),
    midClusterId: coordinateGridId(scope, 'mid', 35, lng, lat),
    localClusterId: coordinateGridId(scope, 'local', 75, lng, lat),
    microClusterId: coordinateGridId(scope, 'micro', 160, lng, lat),
    nanoClusterId: coordinateGridId(scope, 'nano', 420, lng, lat),
    avatarUrl: AVATAR_ASSET_URLS[avatarId],
  };
}

export function placeNonCharonneProfiles(
  zones,
  profilesByZone,
  seed,
  usedCoordinateKeys,
  usedPrivateCoordinateKeys,
) {
  const preparedZones = [];
  const assignments = [];
  const orderedZones = stableSortByHash(zones, `${seed}:anchor-zone-order`, (zone) => zone.id);
  for (const zone of orderedZones) {
    const required = zone.quota;
    const selected = generateZoneBlueNoisePoints({
      feature: zone.feature,
      constraintFeature: zone.communeFeature,
      count: required,
      seed,
      zoneId: zone.id,
      label: zone.label,
      excludedCoordinateKeys: usedCoordinateKeys,
    });
    for (const anchor of selected) usedCoordinateKeys.add(coordinateKey(anchor.lng, anchor.lat));

    const zoneProfiles = stableSortByHash(
      profilesByZone.get(zone.id),
      `${seed}:zone-profile-order:${zone.id}`,
      (entry) => entry.profile.id,
    );
    if (zoneProfiles.length !== required) throw new Error(`${zone.id}: ${zoneProfiles.length}/${required} profils`);
    preparedZones.push({ zone, required, selected, zoneProfiles });
  }

  for (const { zone, required, selected, zoneProfiles } of preparedZones) {
    const privateCandidates = generateZoneBlueNoisePoints({
      feature: zone.feature,
      constraintFeature: zone.communeFeature,
      count: required,
      seed: `${seed}:private-candidates`,
      zoneId: `${zone.id}:private`,
      label: zone.label,
      excludedCoordinateKeys: new Set([...usedCoordinateKeys, ...usedPrivateCoordinateKeys]),
    });
    const privatePlacements = buildPrivatePlacements({
      zone,
      publicPoints: selected.map((anchor, index) => ({
        id: zoneProfiles[index].profile.id,
        lng: anchor.lng,
        lat: anchor.lat,
      })),
      candidateAnchors: privateCandidates,
      usedPrivateCoordinateKeys,
      forbiddenPublicCoordinateKeys: usedCoordinateKeys,
      seed,
    });
    for (let index = 0; index < required; index += 1) {
      const { profile, avatarId } = zoneProfiles[index];
      const anchor = selected[index];
      assignments.push({
        id: profile.id,
        avatarId,
        originalAvatarId: profile.avatar_id,
        instrument: profile.instrument,
        displayName: profile.display_name,
        profileSlug: profile.profile_slug,
        artistRank: profile.artist_rank,
        rankScore: profile.rank_score,
        renderRank: profile.render_rank,
        identitySeed: profile.identity_seed,
        lng: anchor.lng,
        lat: anchor.lat,
        publicLng: anchor.lng,
        publicLat: anchor.lat,
        ...privatePlacements[index],
        isCharonneFixture: false,
        ...geographicFields(zone, anchor, seed),
        ...derivedPlacementFields(zone, anchor.lng, anchor.lat, avatarId),
      });
    }
  }
  return assignments;
}

export function buildCharonneAssignments(
  selectedProfiles,
  fixtures,
  charonneZone,
  seed,
  usedCoordinateKeys,
  usedPrivateCoordinateKeys,
) {
  if (fixtures.length !== CHARONNE_PROFILE_COUNT) throw new Error(`Fixtures Charonne: ${fixtures.length}/450`);
  const profiles = stableSortByHash(selectedProfiles, `${seed}:charonne-profile-map`, (profile) => profile.id);
  const orderedFixtures = stableSortByHash(fixtures, `${seed}:charonne-fixture-map`, (fixture) => fixture.id);
  const publicPoints = generateZoneBlueNoisePoints({
    feature: charonneZone.feature,
    constraintFeature: charonneZone.communeFeature,
    count: orderedFixtures.length,
    seed,
    zoneId: CHARONNE_ZONE_ID,
    label: charonneZone.label,
    excludedCoordinateKeys: usedCoordinateKeys,
  });
  for (const point of publicPoints) usedCoordinateKeys.add(coordinateKey(point.lng, point.lat));
  const privateCandidates = generateZoneBlueNoisePoints({
    feature: charonneZone.feature,
    constraintFeature: charonneZone.communeFeature,
    count: orderedFixtures.length,
    seed: `${seed}:private-candidates`,
    zoneId: `${CHARONNE_ZONE_ID}:private`,
    label: charonneZone.label,
    excludedCoordinateKeys: new Set([...usedCoordinateKeys, ...usedPrivateCoordinateKeys]),
  });
  const privatePlacements = buildPrivatePlacements({
    zone: charonneZone,
    publicPoints,
    candidateAnchors: privateCandidates,
    usedPrivateCoordinateKeys,
    forbiddenPublicCoordinateKeys: usedCoordinateKeys,
    seed,
  });
  return profiles.map((profile, index) => {
    const fixture = orderedFixtures[index];
    const point = publicPoints[index];
    return {
      id: profile.id,
      avatarId: fixture.avatar_id,
      originalAvatarId: profile.avatar_id,
      instrument: fixture.instrument,
      displayName: fixture.display_name,
      profileSlug: fixture.profile_slug,
      artistRank: fixture.artist_rank,
      rankScore: fixture.rank_score,
      renderRank: fixture.render_rank,
      identitySeed: profile.identity_seed,
      lng: point.lng,
      lat: point.lat,
      publicLng: point.lng,
      publicLat: point.lat,
      ...privatePlacements[index],
      isCharonneFixture: true,
      zoneId: CHARONNE_ZONE_ID,
      dataZoneId: fixture.zone_id,
      district: 'Paris 20e',
      zoneName: fixture.zone_name,
      addressLabel: fixture.zone_name,
      districtId: CHARONNE_ZONE_ID,
      districtName: fixture.zone_name,
      city: 'Paris',
      cityId: 'city_paris',
      cityName: 'Paris',
      anchorId: point.id,
      anchorType: 'zone_blue_noise',
      addressId: null,
      sourceQuality: 'zone_blue_noise_deterministic',
      placementQuality: 'zone_blue_noise_pip_verified',
      mockSeedVersion: seed,
      densityTier: charonneZone.densityTier,
      densityWeight: charonneZone.densityWeight,
      ...derivedPlacementFields(charonneZone, point.lng, point.lat, fixture.avatar_id),
    };
  });
}
