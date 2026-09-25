import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = path.resolve(HERE, '../..');
export const DEFAULT_SEED = 'meewav-avatar-dispatch-paris-grand-paris-v1-2026-07-11';
export const EXPECTED_PROFILE_COUNT = 200_000;
export const PARIS_PROFILE_TARGET = 80_000;
export const CHARONNE_PROFILE_COUNT = 450;
export const CHARONNE_ZONE_ID = 'paris_20e_charonne';
export const CHARONNE_FIXTURE_ZONE_ID = 'paris_charonne';
export const USER_STYLE_TARGET = 20_000;
export const MIN_DIVERSE_ZONE_SIZE = 8;

export const PATHS = Object.freeze({
  parisQuartiers: path.resolve(REPO_ROOT, 'src/features/globe/data/paris-quartiers.geojson'),
  grandParisCommunes: path.resolve(REPO_ROOT, 'public/map/grand-paris-communes-overview.geojson'),
  grandParisSubzones: path.resolve(REPO_ROOT, 'public/map/grand-paris-subzones.geojson'),
  charonneFixture: path.resolve(REPO_ROOT, 'server/mvt-tile-server/charonneStressTest.js'),
  reports: path.resolve(HERE, 'reports'),
  backups: path.resolve(HERE, 'backups'),
});

export const AVATAR_STYLES = Object.freeze({
  avatar_1: 'Violoniste',
  avatar_2: 'Videaste clipper',
  avatar_3: 'Utilisatrice',
  avatar_4: 'Utilisateur',
  avatar_5: 'Studio',
  avatar_6: 'Sound designer',
  avatar_7: 'Pianiste',
  avatar_8: 'Percussionniste',
  avatar_9: 'Organisation scenique',
  avatar_10: 'Management',
  avatar_11: 'Label',
  avatar_12: 'Cuivres',
  avatar_13: 'Instruments a vent',
  avatar_14: 'Ingenieur du son',
  avatar_15: 'Guitariste electrique',
  avatar_16: 'Guitariste acoustique',
  avatar_17: 'DJ',
  avatar_18: 'Direction artistique',
  avatar_19: 'Danseuse',
  avatar_20: 'Danseur',
  avatar_21: 'Compositeur',
  avatar_22: 'Coach vocal',
  avatar_23: 'Chanteuse / rappeuse',
  avatar_24: 'Chanteur / rappeur',
  avatar_25: 'Beatmaker',
  avatar_26: 'Beatboxer',
  avatar_27: 'Batteur / batteuse',
  avatar_28: 'Bassiste',
  avatar_29: 'Auteur / parolier',
  avatar_30: 'Accordeoniste',
});

export const STYLE_IDS = Object.freeze(Object.keys(AVATAR_STYLES));

const AVATAR_ASSET_SLUGS = [
  'violoniste',
  'videaste-clipper',
  'utilisatrice',
  'utilisateur',
  'studio-enregistrement',
  'sound-designer',
  'pianiste',
  'percussionniste',
  'organisateur-evenements',
  'management',
  'label',
  'instrumentiste-cuivre',
  'instrumentiste-a-vent',
  'ingenieur-son',
  'guitariste-electrique',
  'guitariste-acoustique',
  'dj',
  'directeur-artistique',
  'danseuse',
  'danseur',
  'compositeur',
  'coach-vocal',
  'chanteuse-rappeuse',
  'chanteur-rappeur',
  'beatmaker',
  'beatboxer',
  'batteur-batteuse',
  'bassiste',
  'auteur-parolier',
  'accordeoniste',
];

export const AVATAR_ASSET_URLS = Object.freeze(Object.fromEntries(
  AVATAR_ASSET_SLUGS.map((slug, index) => [`avatar_${index + 1}`, `/avatar/web/carousel/${slug}.webp`]),
));

export const STYLE_FAMILIES = Object.freeze({
  vocal: ['avatar_23', 'avatar_24'],
  instrumental: [
    'avatar_1', 'avatar_7', 'avatar_8', 'avatar_12', 'avatar_13',
    'avatar_15', 'avatar_16', 'avatar_27', 'avatar_28', 'avatar_30',
  ],
  dance: ['avatar_19', 'avatar_20'],
  production: ['avatar_6', 'avatar_17', 'avatar_21', 'avatar_25'],
  video: ['avatar_2'],
  technical: ['avatar_5', 'avatar_14'],
});

export const FAMILY_ORDER = Object.freeze([
  'vocal',
  'instrumental',
  'dance',
  'production',
  'video',
  'technical',
]);

export const ARCHETYPE_BOOSTS = Object.freeze({
  north_east_urban: {
    avatar_2: 1.55,
    avatar_6: 1.35,
    avatar_14: 1.3,
    avatar_17: 1.5,
    avatar_19: 1.55,
    avatar_20: 1.55,
    avatar_23: 1.55,
    avatar_24: 1.55,
    avatar_25: 1.65,
  },
  central_east: {
    avatar_1: 1.4,
    avatar_5: 1.4,
    avatar_7: 1.5,
    avatar_8: 1.3,
    avatar_9: 1.25,
    avatar_12: 1.3,
    avatar_13: 1.3,
    avatar_15: 1.3,
    avatar_16: 1.35,
    avatar_18: 1.5,
    avatar_21: 1.55,
    avatar_27: 1.25,
    avatar_28: 1.25,
    avatar_30: 1.25,
  },
  west_professional: {
    avatar_2: 1.55,
    avatar_5: 1.45,
    avatar_6: 1.3,
    avatar_10: 1.7,
    avatar_11: 1.65,
    avatar_14: 1.55,
    avatar_18: 1.6,
    avatar_21: 1.35,
    avatar_25: 1.2,
  },
  south_balanced: {
    avatar_1: 1.1,
    avatar_2: 1.1,
    avatar_7: 1.1,
    avatar_14: 1.1,
    avatar_17: 1.1,
    avatar_19: 1.1,
    avatar_20: 1.1,
    avatar_21: 1.1,
    avatar_23: 1.1,
    avatar_24: 1.1,
    avatar_25: 1.1,
  },
});

export function canonicalAvatarId(avatarId) {
  if (avatarId === 'avatar_31' || avatarId === 'avatar_32') return 'avatar_1';
  return STYLE_IDS.includes(avatarId) ? avatarId : null;
}
