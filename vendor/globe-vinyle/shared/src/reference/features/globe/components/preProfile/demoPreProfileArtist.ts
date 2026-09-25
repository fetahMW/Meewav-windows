const shortLivePulseUrl = new URL("ui/preprofile-demo/short-live-pulse.webp", document.baseURI).href;
const shortStudioSessionUrl = new URL("ui/preprofile-demo/short-studio-session.webp", document.baseURI).href;

export type PreProfileDemoArtist = {
  id: string;
  name: string;
  verified: boolean;
  role: string;
  location: string;
  online: boolean;
  followersLabel: string;
  portraitUrl: string;
  portraitFallback: string;
  gradeLevel?: number | null;
  grade_level?: number | null;
  gradeStars: number | null;
  grade_stars?: number | null;
  gradeTier: string;
  gradeColor: string;
  tremplinRegistered?: boolean;
  publicStatsPublished?: boolean;
  goldenLikesCount?: number;
  golden_likes_count?: number;
  bio: string;
  pinColors: string[];
  shorts: Array<{
    id: string;
    mediaUrl: string;
    thumbnailUrl: string;
    duration: string;
    title: string;
  }>;
  audios: Array<{
    id: string;
    mediaUrl: string;
    title: string;
    subtitle: string;
    duration: string;
    color: "purple" | "cyan";
  }>;
  stats: {
    shorts: number;
    audios: number;
    collabAvailable: boolean;
  };
};

export const DEMO_PREPROFILE_SHORTS: PreProfileDemoArtist["shorts"] = [
  {
    id: "dj-turntable",
    mediaUrl: new URL("ui/preprofile-demo/dj-turntable.mp4", document.baseURI).href,
    thumbnailUrl: shortStudioSessionUrl,
    duration: "0:12",
    title: "DJ turntable",
  },
  {
    id: "female-guitarist",
    mediaUrl: new URL("ui/preprofile-demo/female-guitarist.mp4", document.baseURI).href,
    thumbnailUrl: shortLivePulseUrl,
    duration: "0:08",
    title: "Session guitare",
  },
];

export const DEMO_PREPROFILE_AUDIOS: PreProfileDemoArtist["audios"] = [
  {
    id: "tech-house-vibes",
    mediaUrl: new URL("ui/preprofile-demo/tech-house-vibes.mp3", document.baseURI).href,
    title: "Tech House Vibes",
    subtitle: "Alejandro Magaña",
    duration: "1:42",
    color: "purple",
  },
  {
    id: "hazy-after-hours",
    mediaUrl: new URL("ui/preprofile-demo/hazy-after-hours.mp3", document.baseURI).href,
    title: "Hazy After Hours",
    subtitle: "Alejandro Magaña",
    duration: "2:07",
    color: "cyan",
  },
];

export type PreProfileArtistSeed = {
  profileId?: string;
  displayName?: string;
  handle?: string;
  iconId?: string;
  mainRole?: string;
  zoneName?: string;
  gradeLevel?: number | null;
  grade_level?: number | null;
  gradeStars?: number | null;
  grade_stars?: number | null;
  gradeTier?: string | null;
  gradeColor?: string | null;
  goldenLikesCount?: number | null;
  golden_likes_count?: number | null;
  tremplinRegistered?: boolean;
  publicStatsPublished?: boolean;
};

type ArtistFamily =
  | "producer"
  | "guitar"
  | "voice"
  | "drums"
  | "piano"
  | "bass"
  | "strings"
  | "winds"
  | "dance"
  | "crew";

const FAMILY_BY_ICON_ID: Record<string, ArtistFamily> = {
  avatar_1: "strings",
  avatar_2: "crew",
  avatar_3: "voice",
  avatar_4: "producer",
  avatar_5: "crew",
  avatar_6: "producer",
  avatar_7: "piano",
  avatar_8: "drums",
  avatar_9: "crew",
  avatar_10: "crew",
  avatar_11: "crew",
  avatar_12: "winds",
  avatar_13: "winds",
  avatar_14: "crew",
  avatar_15: "guitar",
  avatar_16: "guitar",
  avatar_17: "producer",
  avatar_18: "crew",
  avatar_19: "dance",
  avatar_20: "dance",
  avatar_21: "producer",
  avatar_22: "voice",
  avatar_23: "voice",
  avatar_24: "voice",
  avatar_25: "producer",
  avatar_26: "voice",
  avatar_27: "drums",
  avatar_28: "bass",
  avatar_29: "voice",
  avatar_30: "winds",
  avatar_31: "strings",
  avatar_32: "strings",
  avatar_33: "producer",
};

const FAMILY_PRESETS: Record<ArtistFamily, Pick<PreProfileDemoArtist, "role" | "bio" | "audios" | "stats">> = {
  producer: {
    role: "Producteur",
    bio: "Producteur orienté afro-house, edits live et toplines. Cherche collabs guitare, voix et percussions.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 3, audios: 2, collabAvailable: true },
  },
  guitar: {
    role: "Guitariste",
    bio: "Guitares clean, riffs afro-pop et textures indie. Disponible pour sessions et hooks rapides.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 4, audios: 2, collabAvailable: true },
  },
  voice: {
    role: "Chant / Rap",
    bio: "Voix mélodique, toplines et refrains. Aime les prods club, soul et afro fusion.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 5, audios: 2, collabAvailable: true },
  },
  drums: {
    role: "Batterie / Percussions",
    bio: "Grooves organiques, breaks courts et prises live. Cherche beatmakers pour sessions rapides.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 3, audios: 3, collabAvailable: true },
  },
  piano: {
    role: "Pianiste / Keys",
    bio: "Chords neo-soul, piano house et couleurs RnB. Partant pour composer autour d'une voix.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 2, audios: 3, collabAvailable: true },
  },
  bass: {
    role: "Bassiste",
    bio: "Lignes basses rondes, slap discret et pocket. Disponible pour renforcer des maquettes.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 2, audios: 2, collabAvailable: true },
  },
  strings: {
    role: "Cordes",
    bio: "Cordes modernes, motifs courts et arrangements émotionnels pour prods pop et cinéma.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 2, audios: 2, collabAvailable: true },
  },
  winds: {
    role: "Vents / Cuivres",
    bio: "Hooks de cuivres, phrases soufflées et textures live. Parfait pour refrains qui ressortent.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 2, audios: 2, collabAvailable: true },
  },
  dance: {
    role: "Danse / Performance",
    bio: "Mouvements courts, challenges et direction scene. Disponible pour clips, teasers et live.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 6, audios: 1, collabAvailable: true },
  },
  crew: {
    role: "Création / Studio",
    bio: "Profil creator avec studio, image et direction artistique. Ouvert aux projets courts et collabs.",
    audios: DEMO_PREPROFILE_AUDIOS,
    stats: { shorts: 3, audios: 2, collabAvailable: true },
  },
};

const PREPROFILE_PORTRAIT_FILES = [
  "adrien-kora-afro-jazz-saint-denis-v1.webp",
  "ai-afrofuturist-artist-amina-sola.webp",
  "ai-ambient-composer-naoko-serein.webp",
  "ai-beatmaker-kairo-grid.webp",
  "aicha-sol-coach-vocal-gospel-nimes-v1.webp",
  "ai-film-composer-nabil-orsen.webp",
  "aina-sol-dj-productrice-afro-house-bordeaux-v1.webp",
  "ai-rap-artist-samra-flux.webp",
  "ai-synth-rnb-singer-luma-vale.webp",
  "alex-serein-art-pop-paris-v1.webp",
  "anjali-veyra-danseuse-choregraphe-nice-v1.webp",
  "artist-afrobeat-trumpeter-jonas-reef.webp",
  "artist-alt-metal-drummer-kenji-ravel.webp",
  "artist-folk-songwriter-alba-roche.webp",
  "artist-modern-rai-singer-nassim-halim.webp",
  "artist-reggae-dub-singer-noah-belair.webp",
  "artist-tuareg-rock-singer-bilal-dune.webp",
  "cassandre-bleu-harp-strasbourg-v1.webp",
  "clara-volt-sound-design-v1.webp",
  "dario-silva-latin-pop-perpignan-v1.webp",
  "elio-serra-ingenieur-son-montpellier-v1.webp",
  "eliott-marek-modular-producer-poitiers-v1.webp",
  "gael-ferran-guitariste-flamenco-jazz-perpignan-v1.webp",
  "hugo-quartz-chanteur-shoegaze-le-mans-v1.webp",
  "idriss-ngoma-percussionniste-world-rennes-v1.webp",
  "idriss-noor-oud-compositeur-paris-v1.webp",
  "ilyes-pulse-beatboxer-cergy-v1.webp",
  "ilyne-k-rappeuse-drill-lille-v1.webp",
  "imani-kader-saxophonist-montpellier-v1.webp",
  "ines-raku-drummer-marseille-v1.webp",
  "june-kairo-dj-drum-bass-amiens-v1.webp",
  "kelya-v-urban-pop-toulouse-v1.webp",
  "kenza-loba-dj-amapiano-aubervilliers-v1.webp",
  "leila-nouri-rai-pop-lyon-v1.webp",
  "leon-vasseur-music-director-rouen-v1.webp",
  "liora-fado-rappeuse-drill-toulouse-v1.webp",
  "louna-saphir-violoncelliste-neo-classique-metz-v1.webp",
  "mael-nox-beatmaker-saint-denis-v1.webp",
  "maia-kuroda-violoniste-neo-classique-nantes-v1.webp",
  "malik-soren-chanteur-soul-strasbourg-v1.webp",
  "mariam-delta-productrice-gqom-roubaix-v1.webp",
  "maya-chen-studio-v1.webp",
  "meryem-kaal-indie-rai-montpellier-v1.webp",
  "miko-reve-productrice-hyperpop-paris-v1.webp",
  "milo-kanza-double-bassist-dijon-v1.webp",
  "mina-roze-pop-soul-lyon-v1.webp",
  "naya-oris-boom-bap-rapper-grenoble-v1.webp",
  "nils-bensaid-trompettiste-jazz-paris-v1.webp",
  "noa-prism-live-coding-nonbinary-paris-v1.webp",
  "nora-valen-art-director-lille-v1.webp",
  "oumar-lines-reggae-bassist-fort-de-france-v1.webp",
  "rania-vox-lyric-electro-singer-avignon-v1.webp",
  "rayan-sable-chanson-soul-toulouse-v1.webp",
  "samir-octave-chanteur-funk-orleans-v1.webp",
  "tess-aoki-music-video-director-vj-rennes-v1.webp",
  "thea-novak-pianist-nancy-v2.webp",
  "theo-lune-alt-pop-angers-v1.webp",
  "valerie-dias-soul-jazz-nancy-v1.webp",
  "yacine-kermor-accordeoniste-electro-clermont-ferrand-v1.webp",
  "yasmine-dune-amapiano-dj-lyon-v1.webp",
];
const PREPROFILE_PORTRAIT_URLS = PREPROFILE_PORTRAIT_FILES.map(
  (file) => new URL(`ui/ring-portraits/${file}`, document.baseURI).href,
);
const FOUNDER_HOST_PORTRAIT_URL = new URL(
  "ui/orbit/founder-puff.png",
  document.baseURI,
).href;

export const demoPreProfileArtist: PreProfileDemoArtist = {
  id: "sia-drums",
  name: "SiaDrums",
  verified: true,
  role: FAMILY_PRESETS.producer.role,
  location: "Paris 20e",
  online: true,
  followersLabel: "1,2K abonnés",
  portraitUrl: PREPROFILE_PORTRAIT_URLS[0],
  portraitFallback: "SD",
  gradeLevel: 4,
  grade_level: 4,
  gradeStars: 4,
  grade_stars: 4,
  gradeTier: "premium",
  gradeColor: "#A66BFF",
  tremplinRegistered: true,
  publicStatsPublished: true,
  goldenLikesCount: 128,
  golden_likes_count: 128,
  bio: FAMILY_PRESETS.producer.bio,
  pinColors: ["#C026FF", "#22D3EE", "#FF2FA6", "#F59E0B", "#22C55E"],
  shorts: DEMO_PREPROFILE_SHORTS,
  audios: DEMO_PREPROFILE_AUDIOS,
  stats: FAMILY_PRESETS.producer.stats,
};

function getInitials(name: string) {
  const compact = name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return compact || "MW";
}

function getFamilyForIcon(iconId?: string): ArtistFamily {
  if (!iconId) return "producer";
  return FAMILY_BY_ICON_ID[iconId] ?? "producer";
}

function getFollowerLabel(profileId?: string) {
  if (!profileId) return demoPreProfileArtist.followersLabel;
  const score = Array.from(profileId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const hundreds = 8 + (score % 9);
  return `${(hundreds / 10).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}K abonnés`;
}

function getGoldenLikesCount(stableKey?: string) {
  if (!stableKey) return demoPreProfileArtist.goldenLikesCount ?? 128;
  const hash = getStableHash(`${stableKey}:golden-likes`);
  return 24 + (hash % 476);
}

function getStableHash(input: string) {
  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function getPortraitUrlForSeed(seed: PreProfileArtistSeed, name: string) {
  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalizedName === "feta" || normalizedName === "fetah") {
    return FOUNDER_HOST_PORTRAIT_URL;
  }

  const stableKey = [
    seed.profileId,
    seed.displayName,
    seed.handle,
    seed.iconId,
    name,
  ].filter(Boolean).join(":");
  const index = getStableHash(stableKey || name) % PREPROFILE_PORTRAIT_URLS.length;

  return PREPROFILE_PORTRAIT_URLS[index];
}

function isFounderHostName(name: string) {
  const normalizedName = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalizedName === "feta" || normalizedName === "fetah";
}

function getFallbackRoleForIcon(iconId: string | undefined, fallback: string) {
  if (iconId === "avatar_17") return "DJ";
  if (iconId === "avatar_21") return "Compositeur";
  if (iconId === "avatar_25") return "Beatmaker";
  return fallback;
}

function formatSeedRole(role: string | undefined, fallback: string) {
  const rawRole = role?.trim();
  if (!rawRole) return fallback;

  const normalized = rawRole
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (normalized === "dj" || normalized.startsWith("dj_") || normalized.includes("_dj") || normalized.includes("deejay")) return "DJ";
  if (normalized.includes("beatmaker")) return "Beatmaker";
  if (normalized.includes("compositeur") || normalized.includes("composer")) return "Compositeur";
  if (normalized.includes("producer") || normalized.includes("producteur")) return "Producteur";
  if (normalized.includes("chanteur") || normalized.includes("chanteuse") || normalized.includes("voix") || normalized.includes("vox")) return "Chant / Rap";
  if (normalized.includes("batter") || normalized.includes("drum")) return "Batterie / Percussions";
  if (normalized.includes("piano") || normalized.includes("keys") || normalized.includes("clavier")) return "Pianiste / Keys";
  if (normalized.includes("guitar") || normalized.includes("guitare")) return "Guitariste";
  if (normalized.includes("bass")) return "Bassiste";
  if (normalized.includes("videaste") || normalized.includes("video") || normalized.includes("clipper")) return "Vidéaste";
  if (normalized.includes("danse")) return "Danse / Performance";

  return rawRole
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function getGradeTier(stars: number) {
  switch (stars) {
    case 1:
      return "rookie";
    case 2:
      return "rising";
    case 3:
      return "confirmed";
    case 4:
      return "premium";
    case 5:
      return "master";
    case 6:
      return "legendary";
    default:
      return "repere";
  }
}

function getDemoGradeStarsForSeed(seed: PreProfileArtistSeed, name: string) {
  const explicitGrade = seed.gradeLevel ?? seed.grade_level ?? seed.gradeStars ?? seed.grade_stars;
  if (Number.isInteger(explicitGrade) && explicitGrade! >= 1 && explicitGrade! <= 6) {
    return explicitGrade!;
  }

  if (Number.isInteger(seed.gradeStars) && seed.gradeStars! >= 1 && seed.gradeStars! <= 5) {
    return seed.gradeStars!;
  }

  const stableKey = [
    seed.profileId,
    seed.displayName,
    seed.handle,
    seed.iconId,
    name,
    "grade",
  ].filter(Boolean).join(":");
  const roll = (getStableHash(stableKey || name) % 10_000) / 10_000;

  if (roll < 0.28) return 1;
  if (roll < 0.56) return 2;
  if (roll < 0.79) return 3;
  if (roll < 0.94) return 4;
  return 5;
}

export function getPreProfileArtistForSeed(seed?: PreProfileArtistSeed | null): PreProfileDemoArtist {
  if (!seed) return demoPreProfileArtist;

  const family = getFamilyForIcon(seed.iconId);
  const preset = FAMILY_PRESETS[family];
  const name = seed.displayName || demoPreProfileArtist.name;
  const fallbackRole = isFounderHostName(name)
    ? "Fondateur"
    : getFallbackRoleForIcon(seed.iconId, preset.role);
  const gradeStars = getDemoGradeStarsForSeed(seed, name);
  const explicitGoldenLikesCount = seed.goldenLikesCount ?? seed.golden_likes_count;
  const goldenLikesCount = Number(explicitGoldenLikesCount);
  const hasExplicitGoldenLikesCount = explicitGoldenLikesCount !== null
    && explicitGoldenLikesCount !== undefined
    && Number.isFinite(goldenLikesCount)
    && goldenLikesCount >= 0;
  const fallbackGoldenLikesCount = getGoldenLikesCount(seed.profileId || seed.displayName || seed.handle || name);

  return {
    ...demoPreProfileArtist,
    ...preset,
    id: seed.profileId || demoPreProfileArtist.id,
    name,
    role: isFounderHostName(name) ? fallbackRole : formatSeedRole(seed.mainRole, fallbackRole),
    location: seed.zoneName || demoPreProfileArtist.location,
    followersLabel: getFollowerLabel(seed.profileId),
    portraitUrl: getPortraitUrlForSeed(seed, name),
    portraitFallback: getInitials(name),
    gradeLevel: gradeStars,
    grade_level: gradeStars,
    gradeStars,
    grade_stars: gradeStars,
    gradeTier: seed.gradeTier || getGradeTier(gradeStars),
    gradeColor: seed.gradeColor || demoPreProfileArtist.gradeColor,
    tremplinRegistered: seed.tremplinRegistered ?? gradeStars >= 2,
    publicStatsPublished: seed.publicStatsPublished ?? gradeStars >= 2,
    shorts: DEMO_PREPROFILE_SHORTS,
    audios: DEMO_PREPROFILE_AUDIOS,
    goldenLikesCount: hasExplicitGoldenLikesCount
      ? Math.round(goldenLikesCount)
      : fallbackGoldenLikesCount,
    golden_likes_count: hasExplicitGoldenLikesCount
      ? Math.round(goldenLikesCount)
      : fallbackGoldenLikesCount,
  };
}
