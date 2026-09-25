import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PARIS_QUARTIERS_PATH = path.resolve(__dirname, '../../src/features/globe/data/paris-quartiers.geojson');
const CHARONNE_SELECTED_ZONE_ID = 'paris_20e_charonne';
const CHARONNE_DATA_ZONE_ID = 'paris_charonne';
const CHARONNE_MOCK_COUNT = 450;
const CHARONNE_MIN_AVATAR_SPACING_METERS = 54;
const CHARONNE_EDGE_PADDING_METERS = 26;
const CHARONNE_CURRENT_USER_EXCLUSION_METERS = 125;
const METERS_PER_DEGREE_LAT = 110574;

let cachedArtists = null;

const STAGE_NAME_PREFIXES = [
  'Noor', 'Lina', 'Mila', 'Naya', 'Sora', 'K-Melo', 'Axel', 'Echo',
  'Sam', 'Kiro', 'Zoe', 'Mina', 'Rafik', 'Yann', 'Aya', 'Nero',
  'Lou', 'Romy', 'Tess', 'Nox', 'Bloom', 'Vibe', 'Jay', 'Swan',
  'Rina', 'Kali', 'Dina', 'Nova', 'Ari', 'Kaya', 'Malo', 'Lio',
  'Eden', 'Rayan', 'Ilyes', 'Mael', 'Sacha', 'Nael', 'Luna', 'Ines',
  'Mira', 'Yuna', 'Sami', 'Nassim', 'Iman', 'Lea', 'Selma', 'Alya',
  'Eli', 'Tao', 'Sol', 'Rox', 'Naim', 'Noam', 'Iris', 'Lenny',
  'Rhea', 'Tina', 'Lyam', 'Amin', 'Sia', 'Maya', 'Nolan', 'Elya'
];

const STAGE_NAME_SUFFIXES = [
  'Flow', 'Beats', 'Keys', 'Mix', 'Vox', 'Wave', 'Loop', 'Drums',
  'Groove', 'Voice', 'Son', 'Pulse', 'Mood', 'Bass', 'Line', 'Lab',
  'Sound', 'Room', 'Glow', 'Tune', 'Verse', 'Nova', 'Echo', 'Mode',
  'Chord', 'Tempo', 'Soul', 'Patch', 'Muse', 'Riff', 'Cloud', 'Tape'
];

const ROLE_STAGE_SUFFIXES = {
  dj: ['Mix', 'Decks', 'Pulse', 'Room', 'Wave', 'Loop'],
  beatmaker: ['Beats', 'Drums', 'Keys', 'Loop', 'Bass', 'Patch'],
  voice: ['Vox', 'Voice', 'Flow', 'Verse', 'Soul', 'Mood'],
  guitar: ['Riff', 'Guitar', 'Chord', 'Line', 'Wave', 'Tune'],
  piano: ['Keys', 'Chord', 'Muse', 'Room', 'Sound', 'Glow'],
  mix: ['Mix', 'Sound', 'Lab', 'Room', 'Tape', 'Mode'],
  dance: ['Move', 'Flow', 'Pulse', 'Groove', 'Step', 'Wave'],
};

const PROFILE_SPECS = [
  { key: 'rap_mc', count: 50, mainRole: 'rappeur / MC', secondaryRoles: ['vocaliste'], musicGenres: ['rap', 'trap', 'drill'], instrument: 'chanteur', avatarIcon: 'avatar_24' },
  { key: 'rnb_soul_pop', count: 35, mainRole: 'chanteur R&B / soul / pop', secondaryRoles: ['vocaliste'], musicGenres: ['R&B', 'soul', 'pop urbaine'], instrument: 'chanteur', avatarIcon: 'avatar_23' },
  { key: 'topliner_songwriter', count: 12, mainRole: 'topliner / songwriter', secondaryRoles: ['auteur'], musicGenres: ['pop urbaine', 'R&B', 'rap'], instrument: 'chanteur', avatarIcon: 'avatar_29' },
  { key: 'afro_dancehall_singer', count: 8, mainRole: 'chanteur afro / dancehall / reggaeton', secondaryRoles: ['vocaliste'], musicGenres: ['afro', 'dancehall', 'reggaeton'], instrument: 'chanteur', avatarIcon: 'avatar_24' },
  { key: 'beatmaker_rap_trap_drill', count: 32, mainRole: 'beatmaker rap / trap / drill', secondaryRoles: ['producteur'], musicGenres: ['rap', 'trap', 'drill'], instrument: 'beatmaker', avatarIcon: 'avatar_25' },
  { key: 'producer_afro_pop', count: 14, mainRole: 'producteur afro / pop urbaine', secondaryRoles: ['beatmaker'], musicGenres: ['afro', 'afrobeats', 'pop urbaine'], instrument: 'beatmaker', avatarIcon: 'avatar_25' },
  { key: 'producer_electro_house', count: 8, mainRole: 'producteur electro / house', secondaryRoles: ['compositeur'], musicGenres: ['electro', 'house'], instrument: 'compositeur', avatarIcon: 'avatar_21' },
  { key: 'mao_arranger', count: 6, mainRole: 'arrangeur / compositeur MAO', secondaryRoles: ['producteur'], musicGenres: ['pop urbaine', 'R&B', 'electro'], instrument: 'synthetiseur', avatarIcon: 'avatar_6' },
  { key: 'dj_urban_club', count: 18, mainRole: 'DJ urbain / club', secondaryRoles: ['selecta'], musicGenres: ['rap', 'R&B', 'club'], instrument: 'dj', avatarIcon: 'avatar_17' },
  { key: 'dj_afro_dancehall', count: 8, mainRole: 'DJ afro / dancehall', secondaryRoles: ['selecta'], musicGenres: ['afro', 'dancehall'], instrument: 'dj', avatarIcon: 'avatar_17' },
  { key: 'dj_electro_house', count: 7, mainRole: 'DJ electro / house', secondaryRoles: ['selecta'], musicGenres: ['electro', 'house'], instrument: 'dj', avatarIcon: 'avatar_17' },
  { key: 'dj_generalist', count: 5, mainRole: 'DJ generaliste', secondaryRoles: ['selecta'], musicGenres: ['club', 'pop urbaine'], instrument: 'dj', avatarIcon: 'avatar_17' },
  { key: 'dance_hiphop', count: 22, mainRole: 'danseur hip-hop', secondaryRoles: ['performer'], musicGenres: ['hip-hop dance', 'rap'], instrument: 'danseur', avatarIcon: 'avatar_20' },
  { key: 'dance_afro', count: 10, mainRole: 'danseur afro dance', secondaryRoles: ['performer'], musicGenres: ['afro', 'afrobeats'], instrument: 'danseuse', avatarIcon: 'avatar_19' },
  { key: 'dance_dancehall', count: 7, mainRole: 'danseur dancehall', secondaryRoles: ['performer'], musicGenres: ['dancehall', 'reggaeton'], instrument: 'danseur', avatarIcon: 'avatar_20' },
  { key: 'dance_contemporary', count: 6, mainRole: 'performer contemporain / scene', secondaryRoles: ['danseur'], musicGenres: ['contemporary', 'scene'], instrument: 'danseuse', avatarIcon: 'avatar_19' },
  { key: 'dance_breaker', count: 5, mainRole: 'breaker / battle', secondaryRoles: ['danseur'], musicGenres: ['hip-hop dance', 'battle'], instrument: 'danseur', avatarIcon: 'avatar_20' },
  { key: 'guitarist', count: 16, mainRole: 'guitariste', secondaryRoles: ['instrumentiste'], musicGenres: ['rock', 'indie', 'R&B'], instrument: 'guitariste', avatarIcon: 'avatar_16' },
  { key: 'pianist_keyboard', count: 16, mainRole: 'pianiste / clavier', secondaryRoles: ['instrumentiste'], musicGenres: ['R&B', 'soul', 'jazz'], instrument: 'pianiste', avatarIcon: 'avatar_7' },
  { key: 'bassist', count: 7, mainRole: 'bassiste', secondaryRoles: ['instrumentiste'], musicGenres: ['funk', 'soul', 'rock'], instrument: 'bassiste', avatarIcon: 'avatar_28' },
  { key: 'drummer', count: 8, mainRole: 'batteur', secondaryRoles: ['instrumentiste'], musicGenres: ['funk', 'rock', 'rap'], instrument: 'batteur', avatarIcon: 'avatar_27' },
  { key: 'percussionist', count: 5, mainRole: 'percussionniste', secondaryRoles: ['instrumentiste'], musicGenres: ['afro', 'latin', 'jazz'], instrument: 'percussion', avatarIcon: 'avatar_8' },
  { key: 'brass_sax', count: 3, mainRole: 'sax / cuivres', secondaryRoles: ['instrumentiste'], musicGenres: ['jazz', 'funk'], instrument: 'instr_cuivre', avatarIcon: 'avatar_12' },
  { key: 'strings_violin', count: 3, mainRole: 'violon / cordes', secondaryRoles: ['instrumentiste'], musicGenres: ['classique', 'cordes'], instrument: 'violon', avatarIcon: 'avatar_1' },
  { key: 'recording_engineer', count: 10, mainRole: 'ingenieur son recording', secondaryRoles: ['studio'], musicGenres: ['rap', 'R&B', 'pop urbaine'], instrument: 'inge_son', avatarIcon: 'avatar_14' },
  { key: 'mix_engineer', count: 8, mainRole: 'mix engineer', secondaryRoles: ['studio'], musicGenres: ['rap', 'R&B', 'electro'], instrument: 'inge_son', avatarIcon: 'avatar_14' },
  { key: 'mastering_engineer', count: 4, mainRole: 'mastering engineer', secondaryRoles: ['studio'], musicGenres: ['rap', 'electro', 'pop'], instrument: 'studio', avatarIcon: 'avatar_5' },
  { key: 'studio_assistant', count: 6, mainRole: 'assistant studio', secondaryRoles: ['studio'], musicGenres: ['rap', 'R&B'], instrument: 'studio', avatarIcon: 'avatar_5' },
  { key: 'videographer', count: 10, mainRole: 'videaste', secondaryRoles: ['clip'], musicGenres: ['rap', 'R&B', 'afro'], instrument: 'clippeur', avatarIcon: 'avatar_2' },
  { key: 'photographer', count: 7, mainRole: 'photographe', secondaryRoles: ['image'], musicGenres: ['rap', 'R&B', 'mode'], instrument: 'clippeur', avatarIcon: 'avatar_2' },
  { key: 'video_editor', count: 5, mainRole: 'monteur video', secondaryRoles: ['clip'], musicGenres: ['rap', 'afro', 'pop'], instrument: 'clippeur', avatarIcon: 'avatar_2' },
  { key: 'art_direction', count: 5, mainRole: 'DA / creatif visuel', secondaryRoles: ['image'], musicGenres: ['rap', 'mode', 'pop urbaine'], instrument: 'label', avatarIcon: 'avatar_18' },
  { key: 'manager', count: 7, mainRole: 'manager', secondaryRoles: ['developpement artiste'], musicGenres: ['rap', 'R&B', 'afro'], instrument: 'manager', avatarIcon: 'avatar_10' },
  { key: 'booker', count: 4, mainRole: 'booker', secondaryRoles: ['live'], musicGenres: ['rap', 'club', 'concert'], instrument: 'orga_event', avatarIcon: 'avatar_9' },
  { key: 'event_organizer', count: 5, mainRole: 'organisateur d evenements', secondaryRoles: ['scene'], musicGenres: ['club', 'rap', 'electro'], instrument: 'orga_event', avatarIcon: 'avatar_9' },
  { key: 'label_promo_media', count: 3, mainRole: 'label / promo / media local', secondaryRoles: ['promotion'], musicGenres: ['rap', 'R&B', 'pop urbaine'], instrument: 'label', avatarIcon: 'avatar_11' },
  { key: 'music_fan', count: 30, mainRole: 'fan musique', secondaryRoles: ['auditeur'], musicGenres: ['rap', 'R&B', 'afro'], instrument: 'user', avatarIcon: 'avatar_4' },
  { key: 'active_listener', count: 18, mainRole: 'auditeur actif', secondaryRoles: ['fan'], musicGenres: ['rap', 'R&B', 'electro'], instrument: 'user_f', avatarIcon: 'avatar_3' },
  { key: 'night_out', count: 10, mainRole: 'danse / concert / sortie', secondaryRoles: ['fan'], musicGenres: ['club', 'dancehall', 'afro'], instrument: 'user', avatarIcon: 'avatar_4' },
  { key: 'curious_new_user', count: 7, mainRole: 'curieux / nouvel inscrit', secondaryRoles: ['fan'], musicGenres: ['decouverte', 'pop urbaine'], instrument: 'user_f', avatarIcon: 'avatar_3' },
];

function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function slugifyProfileName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function makeStableStageName(index, mainRole) {
  const role = String(mainRole ?? '').toLowerCase();
  const prefix = STAGE_NAME_PREFIXES[index % STAGE_NAME_PREFIXES.length];
  const suffixIndex = Math.floor(index / STAGE_NAME_PREFIXES.length);

  if (role.includes('dj')) {
    const suffix = ROLE_STAGE_SUFFIXES.dj[suffixIndex % ROLE_STAGE_SUFFIXES.dj.length];
    return suffixIndex % 2 === 0 ? `DJ ${prefix}` : `${prefix}${suffix}`;
  }
  if (role.includes('beatmaker') || role.includes('producteur')) {
    const suffix = ROLE_STAGE_SUFFIXES.beatmaker[suffixIndex % ROLE_STAGE_SUFFIXES.beatmaker.length];
    return `${prefix}${suffix}`;
  }
  if (role.includes('danse')) {
    const suffix = ROLE_STAGE_SUFFIXES.dance[suffixIndex % ROLE_STAGE_SUFFIXES.dance.length];
    return `${prefix}${suffix}`;
  }
  if (role.includes('chanteur') || role.includes('rappeur') || role.includes('mc')) {
    const suffix = ROLE_STAGE_SUFFIXES.voice[suffixIndex % ROLE_STAGE_SUFFIXES.voice.length];
    return `${prefix}${suffix}`;
  }
  if (role.includes('guitar')) {
    const suffix = ROLE_STAGE_SUFFIXES.guitar[suffixIndex % ROLE_STAGE_SUFFIXES.guitar.length];
    return `${prefix}${suffix}`;
  }
  if (role.includes('pian')) {
    const suffix = ROLE_STAGE_SUFFIXES.piano[suffixIndex % ROLE_STAGE_SUFFIXES.piano.length];
    return `${prefix}${suffix}`;
  }
  if (role.includes('ingenieur') || role.includes('mix') || role.includes('mastering')) {
    const suffix = ROLE_STAGE_SUFFIXES.mix[suffixIndex % ROLE_STAGE_SUFFIXES.mix.length];
    return `${prefix}${suffix}`;
  }

  const suffix = STAGE_NAME_SUFFIXES[suffixIndex % STAGE_NAME_SUFFIXES.length];
  return `${prefix}${suffix}`;
}

function buildMockIdentity(index, mainRole) {
  const displayName = makeStableStageName(index, mainRole);
  const paddedIndex = String(index + 1).padStart(3, '0');
  const slug = `${slugifyProfileName(displayName)}-${paddedIndex}`;

  return {
    displayName,
    handle: `@${slug}`,
    profileSlug: slug
  };
}

function normalizeParisQuartierZoneId(properties = {}) {
  const arrondissement = String(properties.c_ar ?? '').padStart(2, '0');
  const quartier = slugify(properties.l_qu);
  return arrondissement && quartier ? `paris_${arrondissement}e_${quartier}` : quartier;
}

function stressHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableRandom(seed) {
  let state = stressHash(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function getPolygons(feature) {
  if (feature.geometry.type === 'Polygon') return [feature.geometry.coordinates];
  return feature.geometry.coordinates;
}

function pointInRing(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygon) {
  const [outerRing, ...holes] = polygon;
  if (!outerRing || !pointInRing(point, outerRing)) return false;
  return !holes.some((hole) => pointInRing(point, hole));
}

function pointInFeature(point, feature) {
  return getPolygons(feature).some((polygon) => pointInPolygon(point, polygon));
}

function getFeatureBbox(feature) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const polygon of getPolygons(feature)) {
    for (const ring of polygon) {
      for (const coord of ring) {
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
    }
  }

  return [minLng, minLat, maxLng, maxLat];
}

function getRingCentroid(ring) {
  let area = 0;
  let lng = 0;
  let lat = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) continue;
    const x0 = Number(current[0]);
    const y0 = Number(current[1]);
    const x1 = Number(next[0]);
    const y1 = Number(next[1]);
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    lng += (x0 + x1) * cross;
    lat += (y0 + y1) * cross;
  }
  area *= 0.5;
  return Math.abs(area) < 1e-12 ? null : [lng / (6 * area), lat / (6 * area)];
}

function getPointOnSurface(feature) {
  const propsPoint = feature.properties?.geom_x_y;
  if (typeof propsPoint?.lon === 'number' && typeof propsPoint?.lat === 'number') {
    const point = [propsPoint.lon, propsPoint.lat];
    if (pointInFeature(point, feature)) return point;
  }

  for (const polygon of getPolygons(feature)) {
    const centroid = getRingCentroid(polygon[0] ?? []);
    if (centroid && pointInFeature(centroid, feature)) return centroid;
  }

  const [minLng, minLat, maxLng, maxLat] = getFeatureBbox(feature);
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

function getProjectionForFeature(feature) {
  const [, minLat, , maxLat] = getFeatureBbox(feature);
  const centerLat = (minLat + maxLat) / 2;
  const metersPerDegreeLng = 111320 * Math.cos((centerLat * Math.PI) / 180);
  return {
    toMeters(point) {
      return [
        Number(point[0]) * metersPerDegreeLng,
        Number(point[1]) * METERS_PER_DEGREE_LAT,
      ];
    },
  };
}

function distanceSquaredMeters(a, b, projection) {
  const [ax, ay] = projection.toMeters(a);
  const [bx, by] = projection.toMeters(b);
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function distanceToSegmentSquared(point, a, b, projection = null) {
  const projectedPoint = projection ? projection.toMeters(point) : point;
  const projectedA = projection ? projection.toMeters(a) : a;
  const projectedB = projection ? projection.toMeters(b) : b;
  const px = projectedPoint[0];
  const py = projectedPoint[1];
  const ax = Number(projectedA[0]);
  const ay = Number(projectedA[1]);
  const bx = Number(projectedB[0]);
  const by = Number(projectedB[1]);
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return (px - x) * (px - x) + (py - y) * (py - y);
}

function distanceToFeatureBoundary(point, feature, projection = null) {
  let minDistanceSquared = Infinity;
  for (const polygon of getPolygons(feature)) {
    for (const ring of polygon) {
      for (let index = 0; index < ring.length - 1; index += 1) {
        const current = ring[index];
        const next = ring[index + 1];
        if (!current || !next) continue;
        minDistanceSquared = Math.min(minDistanceSquared, distanceToSegmentSquared(point, current, next, projection));
      }
    }
  }
  return Math.sqrt(minDistanceSquared);
}

function findQuartierFeature(collection, expectedZoneId, expectedSlug) {
  return collection.features.find((feature) => {
    if (!feature.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')) return false;
    const properties = feature.properties ?? {};
    return normalizeParisQuartierZoneId(properties) === expectedZoneId || slugify(properties.l_qu) === expectedSlug;
  }) ?? null;
}

function buildBlueNoiseCandidates(feature, targetCount, centerPoint) {
  const [minLng, minLat, maxLng, maxLat] = getFeatureBbox(feature);
  const width = maxLng - minLng;
  const height = maxLat - minLat;
  const projection = getProjectionForFeature(feature);
  const columns = 92;
  const rows = 82;
  const candidates = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const random = stableRandom(`charonne-blue-noise:${column}:${row}`);
      const jitterX = (random() - 0.5) * 0.72;
      const jitterY = (random() - 0.5) * 0.72;
      const point = [
        minLng + ((column + 0.5 + jitterX) / columns) * width,
        minLat + ((row + 0.5 + jitterY) / rows) * height,
      ];
      if (!pointInFeature(point, feature)) continue;
      const marginMeters = distanceToFeatureBoundary(point, feature, projection);
      if (marginMeters < CHARONNE_EDGE_PADDING_METERS) continue;
      if (distanceSquaredMeters(point, centerPoint, projection) < CHARONNE_CURRENT_USER_EXCLUSION_METERS * CHARONNE_CURRENT_USER_EXCLUSION_METERS) {
        continue;
      }
      candidates.push({
        point,
        marginMeters,
        rank: stressHash(`charonne-blue-noise-rank:${column}:${row}`),
      });
    }
  }

  const ordered = candidates.sort((a, b) => a.rank - b.rank);
  const spacingSteps = [
    CHARONNE_MIN_AVATAR_SPACING_METERS,
    CHARONNE_MIN_AVATAR_SPACING_METERS * 0.92,
    CHARONNE_MIN_AVATAR_SPACING_METERS * 0.84,
    CHARONNE_MIN_AVATAR_SPACING_METERS * 0.76,
  ];

  for (const spacingMeters of spacingSteps) {
    const spacingSquared = spacingMeters * spacingMeters;
    const selected = [];

    for (const candidate of ordered) {
      let accepted = true;
      for (const existing of selected) {
        if (distanceSquaredMeters(candidate.point, existing.point, projection) < spacingSquared) {
          accepted = false;
          break;
        }
      }
      if (!accepted) continue;
      selected.push(candidate);
      if (selected.length === targetCount) return selected;
    }
  }

  return ordered.slice(0, targetCount);
}

function getPositionForAvatar(avatarId, zoneId, candidates, usedCandidateIndexes) {
  let index = stressHash(`${avatarId}:${zoneId}`) % candidates.length;
  for (let attempts = 0; attempts < candidates.length; attempts += 1) {
    const nextIndex = (index + attempts) % candidates.length;
    if (usedCandidateIndexes.has(nextIndex)) continue;
    usedCandidateIndexes.add(nextIndex);
    return candidates[nextIndex]?.point ?? candidates[0].point;
  }
  index = usedCandidateIndexes.size % candidates.length;
  return candidates[index]?.point ?? candidates[0].point;
}

function buildArtist(base, extras) {
  const lng = Number(base.lng);
  const lat = Number(base.lat);
  const peerCount = base.isCurrentUser ? 1 : base.zoneId === CHARONNE_DATA_ZONE_ID ? CHARONNE_MOCK_COUNT : 1;
  return {
    id: base.id,
    instrument: extras.instrument,
    lat,
    lng,
    avatar_icon_id: extras.avatarIcon,
    avatar_id: extras.avatarIcon,
    render_rank: extras.renderRank,
    labelPriority: 100 + (stressHash(String(base.id)) % 10000),
    labelTier: 1 + (stressHash(String(base.id)) % 3),
    address_id: null,
    address_label: base.zoneName,
    display_name: base.displayName,
    handle: base.handle,
    profile_slug: base.profileSlug ?? base.handle.replace(/^@/, ''),
    artist_rank: base.mainRole,
    rank_score: Math.max(1, 100000 - extras.renderRank),
    city_name: 'Paris',
    cluster_level: 'avatar',
    sector_id: base.zoneId,
    leaf_id: base.zoneId,
    parent_cluster_id: base.zoneId,
    parent_count: peerCount,
    parent_nano_id: base.zoneId,
    parent_micro_id: null,
    parent_local_id: null,
    parent_mid_id: null,
    parent_macro_id: null,
    sibling_count: peerCount,
    sibling_index: Math.max(0, extras.renderRank),
    needs_spiderfy: false,
    stacked_group_id: base.zoneId,
    stack_radius_m: 0,
    icon_offset_x: 0,
    icon_offset_y: 0,
    is_current_user: Boolean(base.isCurrentUser),
    is_host_avatar: Boolean(base.isHostAvatar),
    is_mock: Boolean(base.isMock),
    size_scale: Number(base.sizeScale ?? 1),
    zone_id: base.zoneId,
    zone_name: base.zoneName,
    main_role: base.mainRole,
    secondary_roles: Array.isArray(base.secondaryRoles) ? base.secondaryRoles.join(', ') : null,
    music_genres: Array.isArray(base.musicGenres) ? base.musicGenres.join(', ') : null,
  };
}

function buildCharonneArtists(charonneFeature) {
  const centerPoint = getPointOnSurface(charonneFeature);
  const candidates = buildBlueNoiseCandidates(charonneFeature, CHARONNE_MOCK_COUNT, centerPoint);
  const usedCandidateIndexes = new Set();
  const artists = [];
  let globalIndex = 0;

  for (const spec of PROFILE_SPECS) {
    for (let localIndex = 1; localIndex <= spec.count; localIndex += 1) {
      globalIndex += 1;
      const paddedLocal = String(localIndex).padStart(2, '0');
      const id = `charonne_${spec.key}_${paddedLocal}`;
      const [lng, lat] = getPositionForAvatar(id, CHARONNE_DATA_ZONE_ID, candidates, usedCandidateIndexes);
      const identity = buildMockIdentity(globalIndex - 1, spec.mainRole);
      artists.push(buildArtist({
        id,
        displayName: identity.displayName,
        handle: identity.handle,
        profileSlug: identity.profileSlug,
        zoneId: CHARONNE_DATA_ZONE_ID,
        zoneName: 'Charonne',
        mainRole: spec.mainRole,
        secondaryRoles: spec.secondaryRoles,
        musicGenres: spec.musicGenres,
        isCurrentUser: false,
        isMock: true,
        sizeScale: 1,
        lng,
        lat,
      }, {
        avatarIcon: spec.avatarIcon,
        instrument: spec.instrument,
        renderRank: globalIndex,
      }));
    }
  }

  return artists;
}

function buildCurrentUserArtist(charonneFeature) {
  const [lng, lat] = getPointOnSurface(charonneFeature);
  return buildArtist({
    id: 'current_user_fetah',
    displayName: 'Fetah',
    handle: '@fetah',
    zoneId: CHARONNE_DATA_ZONE_ID,
    zoneName: 'Charonne',
    mainRole: 'beatmaker',
    secondaryRoles: ['producteur'],
    musicGenres: ['rap', 'trap', 'drill'],
    isCurrentUser: true,
    isHostAvatar: true,
    isMock: false,
    sizeScale: 2,
    lng,
    lat,
  }, {
    avatarIcon: 'avatar_25',
    instrument: 'beatmaker',
    renderRank: -1,
  });
}

export function getCharonneStressTestArtists() {
  if (cachedArtists) return cachedArtists;

  const collection = JSON.parse(fs.readFileSync(PARIS_QUARTIERS_PATH, 'utf8'));
  const charonneFeature = findQuartierFeature(collection, CHARONNE_SELECTED_ZONE_ID, 'charonne');

  if (!charonneFeature) {
    throw new Error("Impossible de trouver Charonne pour le stress test MVT");
  }

  cachedArtists = [
    ...buildCharonneArtists(charonneFeature),
    buildCurrentUserArtist(charonneFeature),
  ];

  if (cachedArtists.length !== 451) {
    throw new Error(`Stress test Charonne invalide: ${cachedArtists.length} avatars generes au lieu de 451`);
  }

  console.log('[MVT Charonne Stress] avatars ready', {
    charonneMocks: cachedArtists.filter((artist) => artist.zone_id === CHARONNE_DATA_ZONE_ID && artist.is_mock).length,
    currentUser: cachedArtists.filter((artist) => artist.is_current_user).length,
  });

  return cachedArtists;
}
