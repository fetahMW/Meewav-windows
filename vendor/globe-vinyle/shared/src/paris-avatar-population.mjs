import { CHARONNE_ID } from './navigation-presets.mjs';
import { bounds, contains, polygons, seedRandom } from './geo.mjs';
import { EIFFEL_LOCATION, EIFFEL_AVATAR_LAYOUT, eiffelPlacementConstraint } from './eiffel-location.mjs';

export const CHARONNE_ZONE_ID = 'paris_charonne';
export const CHARONNE_AVATAR_COUNT = 450;
export const PARIS_CITY_ID = 'fr-commune-75056';
export const PARIS_PROFILE_TARGET = 80_000;
export const GRAND_PARIS_PROFILE_TARGET = 120_000;
const DISPATCH_SEED = 'meewav-avatar-dispatch-paris-grand-paris-v1-2026-07-11';
const ZONE_QUOTA_MINIMUM = 12;
const ZONE_QUOTA_HARD_CAP = 700;
const CHARONNE_SPACING_M = 54;
const CHARONNE_EDGE_M = 26;
const HOST_EXCLUSION_M = 125;
const PLASTIC = 1.324717957244746;
const ALPHA_X = 1 / PLASTIC;
const ALPHA_Y = 1 / (PLASTIC * PLASTIC);
const SPACING_FACTORS = [0.82, 0.74, 0.66, 0.56, 0.46, 0.34, 0.22, 0];
const HOST_SIZE_SCALE = 2.5;
const METERS_PER_DEGREE_LAT = 110574;

const PREFIXES = [
  'Noor', 'Lina', 'Mila', 'Naya', 'Sora', 'K-Melo', 'Axel', 'Echo',
  'Sam', 'Kiro', 'Zoe', 'Mina', 'Rafik', 'Yann', 'Aya', 'Nero',
  'Lou', 'Romy', 'Tess', 'Nox', 'Bloom', 'Vibe', 'Jay', 'Swan',
  'Rina', 'Kali', 'Dina', 'Nova', 'Ari', 'Kaya', 'Malo', 'Lio',
  'Eden', 'Rayan', 'Ilyes', 'Mael', 'Sacha', 'Nael', 'Luna', 'Ines',
  'Mira', 'Yuna', 'Sami', 'Nassim', 'Iman', 'Lea', 'Selma', 'Alya',
  'Eli', 'Tao', 'Sol', 'Rox', 'Naim', 'Noam', 'Iris', 'Lenny',
  'Rhea', 'Tina', 'Lyam', 'Amin', 'Sia', 'Maya', 'Nolan', 'Elya',
];
const SUFFIXES = [
  'Flow', 'Beats', 'Keys', 'Mix', 'Vox', 'Wave', 'Loop', 'Drums',
  'Groove', 'Voice', 'Son', 'Pulse', 'Mood', 'Bass', 'Line', 'Lab',
  'Sound', 'Room', 'Glow', 'Tune', 'Verse', 'Nova', 'Echo', 'Mode',
  'Chord', 'Tempo', 'Soul', 'Patch', 'Muse', 'Riff', 'Cloud', 'Tape',
];
const ROLE_SUFFIXES = {
  dj: ['Mix', 'Decks', 'Pulse', 'Room', 'Wave', 'Loop'],
  beatmaker: ['Beats', 'Drums', 'Keys', 'Loop', 'Bass', 'Patch'],
  voice: ['Vox', 'Voice', 'Flow', 'Verse', 'Soul', 'Mood'],
  guitar: ['Riff', 'Guitar', 'Chord', 'Line', 'Wave', 'Tune'],
  piano: ['Keys', 'Chord', 'Muse', 'Room', 'Sound', 'Glow'],
  mix: ['Mix', 'Sound', 'Lab', 'Room', 'Tape', 'Mode'],
  dance: ['Move', 'Flow', 'Pulse', 'Groove', 'Step', 'Wave'],
};

// Same métier mix as Meewav-Web's Charonne fixture (450 people).
export const PROFILE_SPECS = Object.freeze([
  { key: 'rap_mc', count: 50, role: 'Rappeur / MC', icon: 'avatar_24', instrument: 'voice' },
  { key: 'rnb_soul_pop', count: 35, role: 'Chanteur R&B / soul', icon: 'avatar_23', instrument: 'voice' },
  { key: 'topliner', count: 12, role: 'Topliner / songwriter', icon: 'avatar_29', instrument: 'voice' },
  { key: 'afro_singer', count: 8, role: 'Chanteur afro / dancehall', icon: 'avatar_24', instrument: 'voice' },
  { key: 'beatmaker_rap', count: 32, role: 'Beatmaker rap / trap', icon: 'avatar_25', instrument: 'producer' },
  { key: 'producer_afro', count: 14, role: 'Producteur afro / pop', icon: 'avatar_25', instrument: 'producer' },
  { key: 'producer_electro', count: 8, role: 'Producteur electro / house', icon: 'avatar_21', instrument: 'producer' },
  { key: 'mao', count: 6, role: 'Arrangeur MAO', icon: 'avatar_6', instrument: 'producer' },
  { key: 'dj_urban', count: 18, role: 'DJ urbain / club', icon: 'avatar_17', instrument: 'dj' },
  { key: 'dj_afro', count: 8, role: 'DJ afro / dancehall', icon: 'avatar_17', instrument: 'dj' },
  { key: 'dj_electro', count: 7, role: 'DJ electro / house', icon: 'avatar_17', instrument: 'dj' },
  { key: 'dj_general', count: 5, role: 'DJ généraliste', icon: 'avatar_17', instrument: 'dj' },
  { key: 'dance_hiphop', count: 22, role: 'Danseur hip-hop', icon: 'avatar_20', instrument: 'dance' },
  { key: 'dance_afro', count: 10, role: 'Danseur afro', icon: 'avatar_19', instrument: 'dance' },
  { key: 'dance_dancehall', count: 7, role: 'Danseur dancehall', icon: 'avatar_20', instrument: 'dance' },
  { key: 'dance_contemporary', count: 6, role: 'Performer contemporain', icon: 'avatar_19', instrument: 'dance' },
  { key: 'dance_breaker', count: 5, role: 'Breaker', icon: 'avatar_20', instrument: 'dance' },
  { key: 'guitarist', count: 16, role: 'Guitariste', icon: 'avatar_16', instrument: 'guitar' },
  { key: 'pianist', count: 16, role: 'Pianiste / clavier', icon: 'avatar_7', instrument: 'piano' },
  { key: 'bassist', count: 7, role: 'Bassiste', icon: 'avatar_28', instrument: 'bass' },
  { key: 'drummer', count: 8, role: 'Batteur', icon: 'avatar_27', instrument: 'drums' },
  { key: 'percussion', count: 5, role: 'Percussionniste', icon: 'avatar_8', instrument: 'drums' },
  { key: 'brass', count: 3, role: 'Sax / cuivres', icon: 'avatar_12', instrument: 'winds' },
  { key: 'strings', count: 3, role: 'Violon / cordes', icon: 'avatar_1', instrument: 'strings' },
  { key: 'recording', count: 10, role: 'Ingénieur recording', icon: 'avatar_14', instrument: 'crew' },
  { key: 'mix', count: 8, role: 'Mix engineer', icon: 'avatar_14', instrument: 'crew' },
  { key: 'mastering', count: 4, role: 'Mastering engineer', icon: 'avatar_5', instrument: 'crew' },
  { key: 'studio_assist', count: 6, role: 'Assistant studio', icon: 'avatar_5', instrument: 'crew' },
  { key: 'video', count: 10, role: 'Vidéaste', icon: 'avatar_2', instrument: 'crew' },
  { key: 'photo', count: 7, role: 'Photographe', icon: 'avatar_2', instrument: 'crew' },
  { key: 'editor', count: 5, role: 'Monteur vidéo', icon: 'avatar_2', instrument: 'crew' },
  { key: 'art_dir', count: 5, role: 'Direction artistique', icon: 'avatar_18', instrument: 'crew' },
  { key: 'manager', count: 7, role: 'Manager', icon: 'avatar_10', instrument: 'crew' },
  { key: 'booker', count: 4, role: 'Booker', icon: 'avatar_9', instrument: 'crew' },
  { key: 'event', count: 5, role: 'Organisateur', icon: 'avatar_9', instrument: 'crew' },
  { key: 'label', count: 3, role: 'Label / promo', icon: 'avatar_11', instrument: 'crew' },
  { key: 'fan', count: 30, role: 'Fan musique', icon: 'avatar_4', instrument: 'crew' },
  { key: 'listener', count: 18, role: 'Auditeur actif', icon: 'avatar_3', instrument: 'crew' },
  { key: 'night', count: 10, role: 'Sortie / concert', icon: 'avatar_4', instrument: 'crew' },
  { key: 'curious', count: 7, role: 'Nouvel inscrit', icon: 'avatar_3', instrument: 'crew' },
]);

function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function fraction(value) {
  return value - Math.floor(value);
}

function coordinateKey(lng, lat) {
  return `${Number(lng).toFixed(7)},${Number(lat).toFixed(7)}`;
}

function allocateWeightedWithCaps(entries, target, seed) {
  const result = new Map();
  for (const entry of entries) result.set(entry.id, entry.fixed ?? entry.minimum);
  const minimumTotal = sum([...result.values()]);
  const maximumTotal = sum(entries.map(entry => entry.fixed ?? entry.maximum));
  if (target < minimumTotal || target > maximumTotal) {
    throw new Error(`Quota infaisable: cible=${target}, min=${minimumTotal}, max=${maximumTotal}`);
  }
  let remaining = target - minimumTotal;
  while (remaining > 0) {
    const active = entries.filter(entry => entry.fixed == null && result.get(entry.id) < entry.maximum);
    if (!active.length) throw new Error(`Capacité épuisée avec ${remaining} profils non alloués`);
    const totalWeight = sum(active.map(entry => entry.weight));
    const proposals = active.map(entry => {
      const room = entry.maximum - result.get(entry.id);
      const ideal = remaining * (entry.weight / totalWeight);
      return {
        entry, room, ideal,
        grant: Math.min(room, Math.floor(ideal)),
        fraction: ideal - Math.floor(ideal),
      };
    });
    let granted = sum(proposals.map(proposal => proposal.grant));
    if (granted === 0) {
      proposals.sort((left, right) => right.fraction - left.fraction
        || hash(`${seed}:quota-remainder:${left.entry.id}`) - hash(`${seed}:quota-remainder:${right.entry.id}`)
        || left.entry.id.localeCompare(right.entry.id));
      const count = Math.min(remaining, proposals.length);
      for (let index = 0; index < count; index++) proposals[index].grant = 1;
      granted = count;
    }
    if (granted > remaining) {
      proposals.sort((left, right) => left.fraction - right.fraction || left.entry.id.localeCompare(right.entry.id));
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

function buildGrid(points, minimumDistance) {
  const cellSize = Math.max(0.01, minimumDistance / Math.SQRT2);
  const buckets = new Map();
  for (const point of points) {
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return { buckets, cellSize };
}

function hasNeighbourWithin(point, grid, minimumDistance) {
  if (minimumDistance <= 0) return false;
  const cellX = Math.floor(point.x / grid.cellSize);
  const cellY = Math.floor(point.y / grid.cellSize);
  const radius = Math.ceil(minimumDistance / grid.cellSize);
  const squaredMinimum = minimumDistance * minimumDistance;
  for (let xOffset = -radius; xOffset <= radius; xOffset++) {
    for (let yOffset = -radius; yOffset <= radius; yOffset++) {
      for (const candidate of grid.buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? []) {
        const dx = point.x - candidate.x, dy = point.y - candidate.y;
        if (dx * dx + dy * dy < squaredMinimum) return true;
      }
    }
  }
  return false;
}

function addToGrid(point, grid) {
  const key = `${Math.floor(point.x / grid.cellSize)}:${Math.floor(point.y / grid.cellSize)}`;
  const bucket = grid.buckets.get(key) ?? [];
  bucket.push(point);
  grid.buckets.set(key, bucket);
}

function generateZoneBlueNoisePoints(feature, count, zoneId, seed = DISPATCH_SEED) {
  if (!Number.isInteger(count) || count <= 0) return [];
  const b = bounds(feature);
  const allowed = eiffelPlacementConstraint(b);
  const metersLng = 111320 * Math.cos(((b.south + b.north) / 2) * Math.PI / 180);
  const area = areaSquareMeters(feature);
  const bboxArea = (b.east - b.west) * metersLng * (b.north - b.south) * METERS_PER_DEGREE_LAT;
  const rejectionMultiplier = Math.min(30, Math.max(1, bboxArea / Math.max(area, 1)));
  const idealSpacing = Math.sqrt(Math.max(area, 1) / count);
  const offsetX = hash(`${seed}:${zoneId}:blue-noise:x`) / 0x100000000;
  const offsetY = hash(`${seed}:${zoneId}:blue-noise:y`) / 0x100000000;
  const accepted = [];
  const localKeys = new Set();
  let candidateIndex = 0;
  for (const factor of SPACING_FACTORS) {
    if (accepted.length >= count) break;
    const minimumDistance = idealSpacing * factor;
    const grid = buildGrid(accepted, minimumDistance || 1);
    const missing = count - accepted.length;
    const attemptBudget = Math.max(500, Math.ceil(missing * (factor === 0 ? 120 : 36) * rejectionMultiplier));
    for (let attempt = 0; attempt < attemptBudget && accepted.length < count; attempt++) {
      candidateIndex++;
      const lng = Number((b.west + fraction(offsetX + candidateIndex * ALPHA_X) * (b.east - b.west)).toFixed(7));
      const lat = Number((b.south + fraction(offsetY + candidateIndex * ALPHA_Y) * (b.north - b.south)).toFixed(7));
      // Reject before insertion, so replacements spread throughout the usable
      // quarter with the same blue-noise spacing, rather than piling on a rim.
      if (allowed && !allowed(lng, lat)) continue;
      const key = coordinateKey(lng, lat);
      if (localKeys.has(key) || !contains(feature, [lng, lat])) continue;
      const point = { lng, lat, x: lng * metersLng, y: lat * METERS_PER_DEGREE_LAT };
      if (hasNeighbourWithin(point, grid, minimumDistance)) continue;
      localKeys.add(key);
      accepted.push(point);
      addToGrid(point, grid);
    }
  }
  return accepted.slice(0, count).map(point => [point.lng, point.lat]);
}

function quotaEntries(features, fixedId, fixedCount, weightOf, capOf) {
  return features.map(feature => {
    const weight = (weightOf ? weightOf(feature) : Math.max(areaSquareMeters(feature) / 1e6, 1e-6)) || 1e-6;
    if (fixedId && feature.id === fixedId) {
      return { id: feature.id, fixed: fixedCount, maximum: fixedCount, minimum: fixedCount, weight: 1 };
    }
    const maximum = capOf
      ? capOf(feature)
      : PARIS_PROFILE_TARGET + GRAND_PARIS_PROFILE_TARGET;
    return {
      id: feature.id,
      minimum: ZONE_QUOTA_MINIMUM,
      maximum: Math.max(ZONE_QUOTA_MINIMUM, maximum),
      weight,
    };
  });
}

function charonneDensityCap(feature, charonneArea) {
  const density = CHARONNE_AVATAR_COUNT / Math.max(charonneArea, 1);
  return Math.max(
    ZONE_QUOTA_MINIMUM,
    Math.min(ZONE_QUOTA_HARD_CAP, Math.round(areaSquareMeters(feature) * density)),
  );
}

function isParisQuarter(feature) {
  if (feature.properties?.kind !== 'quartier') return false;
  if (feature.id === CHARONNE_ID) return true;
  const code = String(feature.properties.cityCode || feature.properties.code || '');
  return code === '75056' || String(feature.id).startsWith('fr-paris-');
}

function projection(feature) {
  const b = bounds(feature);
  const metersLng = 111320 * Math.cos(((b.south + b.north) / 2) * Math.PI / 180);
  return {
    meters(point) { return [point[0] * metersLng, point[1] * METERS_PER_DEGREE_LAT]; },
  };
}

function distance2(a, b, project) {
  const [ax, ay] = project.meters(a), [bx, by] = project.meters(b);
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function distanceToSegment2(point, a, b, project) {
  const [px, py] = project.meters(point);
  const [ax, ay] = project.meters(a);
  const [bx, by] = project.meters(b);
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
}

function distanceToBoundary(point, feature, project) {
  let min = Infinity;
  for (const poly of polygons(feature)) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        min = Math.min(min, distanceToSegment2(point, ring[i], ring[i + 1], project));
      }
    }
  }
  return Math.sqrt(min);
}

export function areaSquareMeters(feature) {
  if (Number.isFinite(feature.properties?.areaSquareMeters)) return feature.properties.areaSquareMeters;
  const project = projection(feature);
  let area = 0;
  for (const poly of polygons(feature)) {
    const ring = poly[0];
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = project.meters(ring[i]);
      const [x1, y1] = project.meters(ring[i + 1]);
      area += x0 * y1 - x1 * y0;
    }
  }
  return Math.abs(area) / 2;
}

function stageName(index, role, instrument) {
  const text = `${role} ${instrument}`.toLowerCase();
  const prefix = PREFIXES[index % PREFIXES.length];
  const suffixIndex = Math.floor(index / PREFIXES.length);
  if (text.includes('dj')) {
    const suffix = ROLE_SUFFIXES.dj[suffixIndex % ROLE_SUFFIXES.dj.length];
    return suffixIndex % 2 === 0 ? `DJ ${prefix}` : `${prefix}${suffix}`;
  }
  const family = Object.keys(ROLE_SUFFIXES).find(key => text.includes(key)) || 'voice';
  const bank = ROLE_SUFFIXES[family] || SUFFIXES;
  return `${prefix}${bank[suffixIndex % bank.length]}`;
}

function interiorPoint(feature) {
  const center = feature.properties?.center;
  if (Array.isArray(center) && contains(feature, center)) return center;
  const b = bounds(feature);
  return [(b.west + b.east) / 2, (b.south + b.north) / 2];
}

function candidatesIn(feature, target, options = {}) {
  const b = bounds(feature);
  const allowed = eiffelPlacementConstraint(b);
  const project = projection(feature);
  const random = seedRandom(`${feature.id}:blue-noise`);
  const columns = options.columns ?? 72;
  const rows = options.rows ?? 64;
  const edge = options.edge ?? 16;
  const host = options.host;
  const list = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const point = [
        b.west + ((column + 0.5 + (random() - 0.5) * 0.72) / columns) * (b.east - b.west),
        b.south + ((row + 0.5 + (random() - 0.5) * 0.72) / rows) * (b.north - b.south),
      ];
      if ((allowed && !allowed(point[0], point[1])) || !contains(feature, point)) continue;
      if (edge > 0 && distanceToBoundary(point, feature, project) < edge) continue;
      if (host && distance2(point, host, project) < HOST_EXCLUSION_M * HOST_EXCLUSION_M) continue;
      list.push(point);
    }
  }
  const ordered = list.sort((a, b) => hash(a.join(',')) - hash(b.join(',')));
  const spacings = options.spacing
    ? [options.spacing, options.spacing * 0.92, options.spacing * 0.84, options.spacing * 0.76]
    : [54];
  for (const spacing of spacings) {
    const selected = [];
    const gap = spacing * spacing;
    for (const point of ordered) {
      if (selected.some(existing => distance2(point, existing, project) < gap)) continue;
      selected.push(point);
      if (selected.length === target) return selected;
    }
  }
  return ordered.slice(0, target);
}

function takePoint(id, zoneId, points, used, fallback) {
  if (!points.length) return fallback;
  let index = hash(`${id}:${zoneId}`) % points.length;
  for (let attempt = 0; attempt < points.length; attempt++) {
    const next = (index + attempt) % points.length;
    if (used.has(next)) continue;
    used.add(next);
    return points[next];
  }
  return points[used.size % points.length] || fallback;
}

function scaleSpecs(count) {
  const total = PROFILE_SPECS.reduce((sum, spec) => sum + spec.count, 0);
  const rounded = PROFILE_SPECS.map(spec => ({ ...spec, count: Math.floor(count * spec.count / total) }));
  let leftover = count - rounded.reduce((sum, spec) => sum + spec.count, 0);
  const order = PROFILE_SPECS.map((spec, index) => [count * spec.count / total - Math.floor(count * spec.count / total), index])
    .sort((a, b) => b[0] - a[0]);
  for (let i = 0; leftover > 0; leftover--, i++) rounded[order[i % order.length][1]].count++;
  return rounded.filter(spec => spec.count > 0);
}

function fillFeature(feature, specs, options = {}) {
  const zoneName = feature.properties.name;
  const zoneId = feature.id;
  const city = feature.properties.city || feature.properties.cityName || feature.properties.name;
  const cityId = options.cityId;
  const center = interiorPoint(feature);
  const total = specs.reduce((sum, spec) => sum + spec.count, 0);
  const points = options.blueNoise
    ? candidatesIn(feature, total + (options.host ? 8 : 0), {
      host: options.host ? center : null,
      spacing: options.spacing,
      edge: options.edge,
      columns: options.columns,
      rows: options.rows,
    })
    : generateZoneBlueNoisePoints(feature, total, zoneId, options.seed);
  if (!options.blueNoise && points.length < total) {
    const extra = candidatesIn(feature, total, {
      columns: Math.max(48, Math.ceil(Math.sqrt(total) * 6)),
      rows: Math.max(40, Math.ceil(Math.sqrt(total) * 5)),
      spacing: Math.sqrt(Math.max(areaSquareMeters(feature), 1) / Math.max(total, 1)) * 0.22,
      edge: 0,
    });
    const seen = new Set(points.map(point => coordinateKey(point[0], point[1])));
    for (const point of extra) {
      const key = coordinateKey(point[0], point[1]);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push(point);
      if (points.length >= total) break;
    }
  }
  const used = new Set();
  const avatars = [];
  const allowed = eiffelPlacementConstraint(bounds(feature));
  const fallback = allowed && (!allowed(center[0], center[1]) || !contains(feature, center))
    ? null : center;
  let index = 0;
  for (const spec of specs) {
    for (let local = 0; local < spec.count; local++) {
      const id = `${zoneId}:${spec.key}:${String(local + 1).padStart(2, '0')}`;
      const position = takePoint(id, zoneId, points, used, fallback);
      // Even a degenerate polygon must never fall back inside the monument.
      if (!position) continue;
      avatars.push({
        id, name: stageName(index, spec.role, spec.instrument), role: spec.role, icon: spec.icon,
        instrument: spec.instrument, lon: position[0], lat: position[1], zoneId, zoneName, city, cityId,
        grade: 1 + hash(`${zoneId}:${index}:grade`) % 6, isHost: false, scale: 1,
      });
      index++;
    }
  }
  if (options.host) {
    avatars.push({
      id: 'current_user_fetah', name: 'Fetah', role: 'Beatmaker', icon: 'avatar_25',
      instrument: 'producer', lon: center[0], lat: center[1], zoneId, zoneName, city, cityId,
      grade: 4, isHost: true, scale: HOST_SIZE_SCALE,
    });
  }
  return avatars;
}

function isPetiteCouronne(feature) {
  const department = String(feature.properties.department || '');
  if (department === '92' || department === '93' || department === '94') return true;
  return /^(fr-commune-)?(92|93|94)\d{3}$/.test(String(feature.properties.code || feature.id || ''));
}

export function formatAvatarCount(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  return n <= 1 ? `${n} avatar` : `${n} avatars`;
}

export function createParisAvatarPopulation(sectors, communes = { features: [] }, { eager = true } = {}) {
  const plans = new Map();
  const cache = new Map();
  const cityTotals = new Map();
  let total = 0;

  function register(feature, specs, options) {
    // Density trial: decide from the original quota, before any doubling.
    // Apply here so initial Paris quarters and streamed cities use one rule.
    const originalCount = specs.reduce((sum, spec) => sum + spec.count, 0) + (options.host ? 1 : 0);
    if (feature.properties.kind === 'quartier' && originalCount <= 400) {
      specs = specs.map((spec, index) => ({ ...spec,
        count: spec.count * 2 + (options.host && index === 0 ? 1 : 0) }));
    }
    if (feature.id === EIFFEL_LOCATION.quartierId) {
      // Apply after the density trial so the displayed quota and the worker
      // agree on the lighter Gros-Caillou population.
      const target = Math.max(ZONE_QUOTA_MINIMUM, Math.round(
        specs.reduce((sum, spec) => sum + spec.count, 0) * EIFFEL_AVATAR_LAYOUT.populationFactor));
      specs = scaleSpecs(target);
    }
    const count = specs.reduce((total, spec) => total + spec.count, 0) + (options.host ? 1 : 0);
    total += count - (plans.get(feature.id)?.count || 0);
    plans.set(feature.id, { feature, specs, options, count, cityId: options.cityId });
    if (options.cityId && options.countCity !== false) {
      cityTotals.set(options.cityId, (cityTotals.get(options.cityId) || 0) + count);
    }
  }

  const quarters = (sectors.features || []).filter(isParisQuarter);
  const charonne = quarters.find(feature => feature.id === CHARONNE_ID);
  const charonneArea = charonne ? areaSquareMeters(charonne) : 2.075e6;
  const parisEntries = quarters.length
    ? quotaEntries(
      quarters,
      CHARONNE_ID,
      CHARONNE_AVATAR_COUNT,
      undefined,
      feature => charonneDensityCap(feature, charonneArea),
    )
    : [];
  const parisCapacity = parisEntries.reduce((total, entry) => total + (entry.fixed ?? entry.maximum), 0);
  const parisQuotas = parisEntries.length
    ? allocateWeightedWithCaps(
      parisEntries,
      Math.min(PARIS_PROFILE_TARGET, parisCapacity),
      `${DISPATCH_SEED}:paris-ban`,
    )
    : new Map();
  for (const quarter of quarters) {
    if (quarter.id === CHARONNE_ID) {
      register(quarter, PROFILE_SPECS, {
        host: true, cityId: PARIS_CITY_ID, spacing: CHARONNE_SPACING_M, edge: CHARONNE_EDGE_M,
        columns: 72, rows: 64, blueNoise: true,
      });
      continue;
    }
    register(quarter, scaleSpecs(parisQuotas.get(quarter.id) || ZONE_QUOTA_MINIMUM), {
      cityId: PARIS_CITY_ID, seed: DISPATCH_SEED,
    });
  }
  const ringCommunes = (communes.features || []).filter(isPetiteCouronne);
  if (ringCommunes.length) {
    const communeQuotas = allocateWeightedWithCaps(
      quotaEntries(ringCommunes, null, 0, feature => {
        const population = Number(feature.properties.population);
        return Number.isFinite(population) && population > 0
          ? population
          : Math.max(areaSquareMeters(feature) / 1e6, 1e-6);
      }),
      GRAND_PARIS_PROFILE_TARGET,
      `${DISPATCH_SEED}:grand-paris-population`,
    );
    for (const commune of ringCommunes) {
      register(commune, scaleSpecs(communeQuotas.get(commune.id) || ZONE_QUOTA_MINIMUM), {
        cityId: commune.id, seed: DISPATCH_SEED,
      });
    }
  }

  function avatarsIn(zoneId) {
    if (cache.has(zoneId)) return cache.get(zoneId);
    const plan = plans.get(zoneId);
    if (!plan || plan.feature?.properties?.kind === 'commune') {
      cache.set(zoneId, []);
      return [];
    }
    const list = fillFeature(plan.feature, plan.specs, plan.options);
    cache.set(zoneId, list);
    return list;
  }

  if (eager && plans.has(CHARONNE_ID)) avatarsIn(CHARONNE_ID);

  return {
    avatarsIn,
    ensureQuartier(feature) {
      if (!feature?.id || plans.has(feature.id)) return plans.get(feature.id)?.count || 0;
      if (feature.properties?.kind !== 'quartier' || isParisQuarter(feature)) return 0;
      const count = charonneDensityCap(feature, charonneArea);
      register(feature, scaleSpecs(count), {
        cityId: feature.properties.cityCode ? `fr-commune-${feature.properties.cityCode}` : undefined,
        seed: DISPATCH_SEED,
        countCity: false,
      });
      return plans.get(feature.id).count;
    },
    quota(zoneId) { return plans.get(zoneId)?.count || 0; },
    total: () => total,
    cityTotal(cityId) { return cityTotals.get(cityId) || 0; },
    zoneIds() { return [...plans.keys()]; },
    hostAvatar() { return (cache.get(CHARONNE_ID) || []).find(avatar => avatar.isHost) || null; },
    allAvatars() {
      const list = [];
      for (const zoneId of plans.keys()) list.push(...avatarsIn(zoneId));
      return list;
    },
  };
}

export function buildParisAvatarPopulation(sectors, communes = { features: [] }) {
  return createParisAvatarPopulation(sectors, communes).allAvatars();
}
