import { normalizeGradeLevel, type GradeLevel } from "../grades/gradeBadges";

export type PublicProfileRegistrationStatus = "not_registered" | "registered";

export type PublicTalentTokenStatus =
  | "observation"
  | "eligible"
  | "verification"
  | "comingSoon"
  | "active"
  | "suspended";

type PublicTalentTokenBaseDto = {
  status: PublicTalentTokenStatus;
  label: string;
  helper: string;
  ticker: string | null;
  statusUpdatedAt: string;
};

export type PublicTalentTokenActiveDto = PublicTalentTokenBaseDto & {
  status: "active";
  ticker: string;
  currentValueMinor: number;
  currency: "EUR";
  change24hBasisPoints: number;
  marketUpdatedAt: string;
};

export type PublicTalentTokenInactiveDto = PublicTalentTokenBaseDto & {
  status: Exclude<PublicTalentTokenStatus, "active">;
};

/** A discriminated public DTO: market values only exist for an active token. */
export type PublicTalentTokenDto =
  | PublicTalentTokenActiveDto
  | PublicTalentTokenInactiveDto;

export type PublicProfileProjectMilestoneDto = {
  id: string;
  title: string;
  detail: string;
  state: "completed" | "current" | "upcoming";
  dateLabel: string | null;
};

export type PublicProfileProjectDto = {
  id: string;
  title: string;
  summary: string;
  statusLabel: string;
  currentStage: string;
  updatedAt: string;
  coverUrl: string;
  milestones: PublicProfileProjectMilestoneDto[];
};

export type PublicProfileStatsDto = {
  period: "30d";
  profileViews: number;
  creationPlays: number;
  followersCount: number;
  projectUpdates: number;
  publicCollaborations: number;
  roomsHosted: number;
  updatedAt: string;
};

export type PublicProfileRoomDto = {
  id: string;
  title: string;
  startsAt: string;
  timezone: "Europe/Paris";
  access: "free";
  formatLabel: string;
  interestedCount: number;
  href: string;
};

export type PublicProfileMarketplaceListingDto = {
  id: string;
  title: string;
  kind: "service" | "rental" | "product";
  description: string;
  imageUrl: string;
  price: {
    amountMinor: number;
    currency: "EUR";
    unitLabel: string;
  };
  availabilityLabel: string;
  href: string;
};

export type PublicProfileMediaItemDto = {
  id: string;
  kind: "audio" | "video";
  title: string;
  description: string;
  sourceUrl: string;
  posterUrl: string | null;
  durationLabel: string;
  isDemoAsset: true;
  creditLabel: "Média local de démonstration — non attribué à l’artiste";
};

export type PublicProfileMediaLibraryDto = {
  videos: PublicProfileMediaItemDto[];
  audios: PublicProfileMediaItemDto[];
};

export type PublicProfileFixtureSeed = {
  profileId: string;
  name: string;
  grade: GradeLevel | number;
  role: string;
  location: string;
  registrationStatus: PublicProfileRegistrationStatus;
  statsPublished: boolean;
};

export type PublicProfileViewerDto = {
  fixtureKind: "demo";
  fixtureNotice: "Données de démonstration — aucune donnée privée ou transactionnelle";
  profileId: string;
  name: string;
  role: string;
  location: string;
  grade: GradeLevel;
  registrationStatus: PublicProfileRegistrationStatus;
  canViewStats: boolean;
  portraitUrl: string;
  editorialImageUrl: string;
  isRichVariant: boolean;
  project: PublicProfileProjectDto;
  token: PublicTalentTokenDto;
  stats: PublicProfileStatsDto | null;
  nextRoom: PublicProfileRoomDto | null;
  marketplaceListings: PublicProfileMarketplaceListingDto[];
  media: PublicProfileMediaLibraryDto;
};

const PARIS_SINGER_PRODUCER_EDITORIAL_IMAGE =
  "/images/profile-viewer/paris-singer-producer-studio-v1.webp";

const PUBLIC_PORTRAITS = {
  producer: "/images/tremplin/artists/generated/miko-reve-productrice-hyperpop-paris-v1.webp",
  dj: "/images/tremplin/artists/wall-2026/lou-sato-uk-garage-dj-paris-v1.webp",
  jazz: "/images/tremplin/artists/generated/nils-bensaid-trompettiste-jazz-paris-v1.webp",
  soul: "/images/tremplin/artists/wall-2026/idris-velour-neo-soul-paris-v1.webp",
  electronic: "/images/tremplin/artists/generated/noa-prism-live-coding-nonbinary-paris-v1.webp",
  default: "/images/tremplin/artists/wall-2026/alex-serein-art-pop-paris-v1.webp",
} as const;

const VIDEO_FIXTURES = [
  {
    slug: "dj-session",
    title: "Session DJ — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer le lecteur public.",
    sourceUrl: "/media/shorts-demo/landscape-dj.mp4",
    posterUrl: "/images/shorts/catalog-v2/creator-dj-club.webp",
    durationLabel: "0:12",
  },
  {
    slug: "guitar-session",
    title: "Session guitare — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer le lecteur public.",
    sourceUrl: "/media/shorts-demo/landscape-guitar.mp4",
    posterUrl: "/images/shorts/catalog/performance-anouk-guitar.webp",
    durationLabel: "0:12",
  },
  {
    slug: "roundtable-session",
    title: "Conversation en studio — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer un contenu éditorial.",
    sourceUrl: "/media/shorts-demo/landscape-roundtable.mp4",
    posterUrl: "/images/shorts/catalog-v2/tv-interview-composer.webp",
    durationLabel: "0:14",
  },
  {
    slug: "producer-session",
    title: "Session de production — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer le lecteur public.",
    sourceUrl: "/media/shorts-demo/portrait-producer.mp4",
    posterUrl: "/images/shorts/catalog-v2/creator-beatmaker-studio.webp",
    durationLabel: "0:12",
  },
  {
    slug: "rap-session",
    title: "Prise studio rap — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer le lecteur public.",
    sourceUrl: "/media/shorts-demo/portrait-studio-rap.mp4",
    posterUrl: "/images/shorts/community/community-rap-one-take.webp",
    durationLabel: "0:10",
  },
  {
    slug: "vocal-session",
    title: "Session vocale — extrait de démonstration",
    description: "Un aperçu local destiné à démontrer le lecteur public.",
    sourceUrl: "/media/shorts-demo/portrait-vocal-session.mp4",
    posterUrl: "/images/shorts/community/community-vocal-booth.webp",
    durationLabel: "0:12",
  },
] as const;

const AUDIO_FIXTURES = [
  {
    slug: "hazy-after-hours",
    title: "Hazy After Hours — piste audio de démonstration",
    description: "Fichier local de démonstration, sans attribution à l’artiste affiché.",
    sourceUrl: "/media/preprofile-demo/hazy-after-hours.mp3",
    durationLabel: "2:07",
  },
  {
    slug: "tech-house-vibes",
    title: "Tech House Vibes — piste audio de démonstration",
    description: "Fichier local de démonstration, sans attribution à l’artiste affiché.",
    sourceUrl: "/media/preprofile-demo/tech-house-vibes.mp3",
    durationLabel: "1:42",
  },
  {
    slug: "guitar-session-audio",
    title: "Session guitare — extrait audio de démonstration",
    description: "Extrait sonore issu d’un média local de démonstration, sans attribution à l’artiste affiché.",
    sourceUrl: "/media/profile-demo/guitar-session-audio.mp3",
    durationLabel: "0:12",
  },
  {
    slug: "vocal-session-audio",
    title: "Session vocale — extrait audio de démonstration",
    description: "Extrait sonore issu d’un média local de démonstration, sans attribution à l’artiste affiché.",
    sourceUrl: "/media/profile-demo/vocal-session-audio.mp3",
    durationLabel: "0:12",
  },
] as const;

const PROJECT_VARIANTS = [
  {
    title: "Premier EP en production",
    summary: "Un projet documenté de l’enregistrement au mixage, puis à sa première présentation publique.",
    stage: "Maquettes finalisées, sessions voix en préparation",
  },
  {
    title: "Live immersif en construction",
    summary: "Une forme scénique conçue autour de la lumière, du son et d’une interprétation sans artifice.",
    stage: "Résidence technique et répétitions publiques",
  },
  {
    title: "Session collaborative à Paris",
    summary: "Plusieurs artistes réunissent leurs pratiques pour créer une performance originale et documentée.",
    stage: "Casting des collaborateurs et préproduction",
  },
  {
    title: "Série de créations en studio",
    summary: "Un cycle court pour publier régulièrement, recueillir des retours et faire évoluer une direction artistique.",
    stage: "Troisième création en finalisation",
  },
  {
    title: "Performance audiovisuelle",
    summary: "Une création qui relie musique, scénographie et image dans un format pensé pour les Rooms.",
    stage: "Prototype visuel validé, répétition générale à venir",
  },
  {
    title: "Répertoire live en évolution",
    summary: "Un parcours public qui montre comment les arrangements et l’interprétation mûrissent dans le temps.",
    stage: "Six titres prêts, deux arrangements en cours",
  },
] as const;

const TOKEN_LABELS: Record<Exclude<PublicTalentTokenStatus, "active">, { label: string; helper: string }> = {
  observation: { label: "Parcours en observation", helper: "Aucun jeton actif" },
  eligible: { label: "Demande possible", helper: "L’artiste peut demander l’étude de son jeton" },
  verification: { label: "Vérification en cours", helper: "Aucun prix affiché avant activation" },
  comingSoon: { label: "Lancement prochain", helper: "Aucune opération disponible" },
  suspended: { label: "Opérations suspendues", helper: "Consulte les informations publiées" },
};

function stableHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clean(value: string, fallback: string) {
  return value.trim() || fallback;
}

function normalizedText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

function slugify(value: string) {
  return normalizedText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "artiste";
}

function isParisLocation(location: string) {
  const normalized = normalizedText(location);
  return normalized.includes("paris")
    || normalized.includes("ile-de-france")
    || normalized.includes("saint-denis");
}

function roleFamily(role: string): keyof typeof PUBLIC_PORTRAITS {
  const normalized = normalizedText(role);
  if (/(product|beatmaker|composit)/.test(normalized)) return "producer";
  if (/\bdj\b/.test(normalized)) return "dj";
  if (/(jazz|trompet|sax)/.test(normalized)) return "jazz";
  if (/(soul|r&b)/.test(normalized)) return "soul";
  if (/(coding|electron|techno|hyperpop)/.test(normalized)) return "electronic";
  return "default";
}

export function canAccessPublicProfileStats(
  gradeInput: GradeLevel | number,
  registrationStatus: PublicProfileRegistrationStatus,
  statsPublished = true,
) {
  const grade = normalizeGradeLevel(gradeInput);
  return registrationStatus === "registered" && grade >= 2 && statsPublished;
}

function tokenStatusForGrade(grade: GradeLevel, hash: number): PublicTalentTokenStatus {
  if (grade === 1) return "observation";
  if (grade === 2) return "eligible";
  if (grade === 3) return hash % 2 === 0 ? "verification" : "comingSoon";
  if (grade === 6 && hash % 4 === 0) return "suspended";
  return "active";
}

function tickerFor(name: string) {
  const ticker = normalizedText(name).replace(/[^a-z0-9]/g, "").toUpperCase();
  return (ticker || "MWART").slice(0, 6);
}

function buildToken(name: string, grade: GradeLevel, hash: number): PublicTalentTokenDto {
  const status = tokenStatusForGrade(grade, hash);
  const ticker = tickerFor(name);
  if (status === "active") {
    return {
      status,
      label: "Jeton de talent actif",
      helper: "Valeur et variation publiques à titre de démonstration",
      ticker,
      statusUpdatedAt: "2026-08-05T10:00:00+02:00",
      currentValueMinor: 72 + (hash % 164),
      currency: "EUR",
      change24hBasisPoints: (hash % 901) - 300,
      marketUpdatedAt: "2026-08-07T09:30:00+02:00",
    };
  }

  const labels = TOKEN_LABELS[status];
  return {
    status,
    ...labels,
    ticker: status === "observation" || status === "eligible" ? null : ticker,
    statusUpdatedAt: "2026-08-05T10:00:00+02:00",
  };
}

function rotate<T>(items: readonly T[], offset: number) {
  const start = offset % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

function buildMedia(profileId: string, hash: number, rich: boolean): PublicProfileMediaLibraryDto {
  const videoCount = rich ? 5 + (hash % 2) : 3;
  const videos = rotate(VIDEO_FIXTURES, hash % VIDEO_FIXTURES.length)
    .slice(0, videoCount)
    .map((item, index): PublicProfileMediaItemDto => ({
      id: `${profileId}-video-${index + 1}-${item.slug}`,
      kind: "video",
      title: item.title,
      description: item.description,
      sourceUrl: item.sourceUrl,
      posterUrl: item.posterUrl,
      durationLabel: item.durationLabel,
      isDemoAsset: true,
      creditLabel: "Média local de démonstration — non attribué à l’artiste",
    }));
  const audios = rotate(AUDIO_FIXTURES, hash % AUDIO_FIXTURES.length)
    .slice(0, rich ? 4 : 1)
    .map((item, index): PublicProfileMediaItemDto => ({
      id: `${profileId}-audio-${index + 1}-${item.slug}`,
      kind: "audio",
      title: item.title,
      description: item.description,
      sourceUrl: item.sourceUrl,
      posterUrl: null,
      durationLabel: item.durationLabel,
      isDemoAsset: true,
      creditLabel: "Média local de démonstration — non attribué à l’artiste",
    }));

  return { videos, audios };
}

function buildProject(
  profileId: string,
  hash: number,
  coverUrl: string,
): PublicProfileProjectDto {
  const variant = PROJECT_VARIANTS[hash % PROJECT_VARIANTS.length];
  return {
    id: `${profileId}-project`,
    title: variant.title,
    summary: variant.summary,
    statusLabel: "Projet documenté",
    currentStage: variant.stage,
    updatedAt: "2026-08-04T18:00:00+02:00",
    coverUrl,
    milestones: [
      {
        id: `${profileId}-milestone-direction`,
        title: "Direction artistique définie",
        detail: "L’intention, les références et le format du projet sont documentés.",
        state: "completed",
        dateLabel: "Juin 2026",
      },
      {
        id: `${profileId}-milestone-production`,
        title: variant.stage,
        detail: "Cette étape est actuellement visible dans le parcours public.",
        state: "current",
        dateLabel: "Août 2026",
      },
      {
        id: `${profileId}-milestone-public`,
        title: "Présentation au public",
        detail: "Une publication ou une Room viendra conclure ce cycle.",
        state: "upcoming",
        dateLabel: "Automne 2026",
      },
    ],
  };
}

function buildStats(hash: number): PublicProfileStatsDto {
  return {
    period: "30d",
    profileViews: 1_200 + (hash % 8_800),
    creationPlays: 3_400 + (hash % 24_000),
    followersCount: 480 + (hash % 12_500),
    projectUpdates: 2 + (hash % 7),
    publicCollaborations: 1 + (hash % 6),
    roomsHosted: hash % 5,
    updatedAt: "2026-08-07T09:00:00+02:00",
  };
}

function buildRoom(profileId: string, name: string, hash: number): PublicProfileRoomDto {
  return {
    id: `${profileId}-room-next`,
    title: hash % 2 === 0 ? "Session de création en direct" : "Le projet, étape par étape",
    startsAt: hash % 2 === 0
      ? "2026-08-20T20:00:00+02:00"
      : "2026-08-27T19:30:00+02:00",
    timezone: "Europe/Paris",
    access: "free",
    formatLabel: `Room publique avec ${name}`,
    interestedCount: 24 + (hash % 240),
    href: `/rooms?artist=${encodeURIComponent(profileId)}`,
  };
}

function buildMarketplaceListings(
  profileId: string,
  role: string,
  hash: number,
  imageUrl: string,
): PublicProfileMarketplaceListingDto[] {
  return [{
    id: `${profileId}-market-service`,
    title: `Session ${role}`,
    kind: "service",
    description: "Une annonce publique de démonstration reliée au profil Marketplace.",
    imageUrl,
    price: {
      amountMinor: 4_500 + ((hash % 12) * 500),
      currency: "EUR",
      unitLabel: "la session",
    },
    availabilityLabel: "Créneaux sur demande",
    // The demo offer is not persisted in Marketplace yet. Keep the route
    // honest and generic instead of deep-linking to a listing that does not
    // exist in the Marketplace source of truth.
    href: "/market",
  }];
}

export function resolvePublicProfileViewerFixture(
  seed: PublicProfileFixtureSeed,
): PublicProfileViewerDto {
  const profileId = slugify(clean(seed.profileId, seed.name));
  const name = clean(seed.name, "Artiste MeeWav");
  const role = clean(seed.role, "Artiste");
  const location = clean(seed.location, "France");
  const grade = normalizeGradeLevel(seed.grade);
  const registrationStatus = seed.registrationStatus;
  const hash = stableHash(`${profileId}|${normalizedText(name)}|${grade}|${normalizedText(role)}|${normalizedText(location)}`);
  const rich = isParisLocation(location) && grade >= 2;
  const family = roleFamily(role);
  const portraitUrl = rich
    ? PUBLIC_PORTRAITS[family]
    : `/images/preprofile/portraits/profile-${String((hash % 38) + 1).padStart(2, "0")}.webp`;
  const singerProducerVariant = rich && (family === "producer" || /chant/.test(normalizedText(role)));
  const editorialImageUrl = singerProducerVariant
    ? PARIS_SINGER_PRODUCER_EDITORIAL_IMAGE
    : portraitUrl;
  const canViewStats = canAccessPublicProfileStats(
    grade,
    registrationStatus,
    seed.statsPublished,
  );

  return {
    fixtureKind: "demo",
    fixtureNotice: "Données de démonstration — aucune donnée privée ou transactionnelle",
    profileId,
    name,
    role,
    location,
    grade,
    registrationStatus,
    canViewStats,
    portraitUrl,
    editorialImageUrl,
    isRichVariant: rich,
    project: buildProject(profileId, hash, editorialImageUrl),
    token: buildToken(name, grade, hash),
    stats: canViewStats ? buildStats(hash) : null,
    nextRoom: registrationStatus === "registered" ? buildRoom(profileId, name, hash) : null,
    marketplaceListings: registrationStatus === "registered"
      ? buildMarketplaceListings(profileId, role, hash, editorialImageUrl)
      : [],
    media: buildMedia(profileId, hash, rich),
  };
}
