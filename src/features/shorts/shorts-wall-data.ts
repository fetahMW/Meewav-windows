import { SCENE_DEMO_ARTISTS } from "./sceneArtistPortraits";
import type { MediaDistributionUse, MusicCredit } from "../scene/mediaGovernance";

export type ShortsVideoFormat = "landscape" | "portrait";
export type ScenePresentationFormat = "landscape" | "vertical" | "square" | "audio_visualizer";
export type ShortsMulticamLayout = "pip" | "duo" | "instrument" | "rear";
export type ShortsContentTypeLabel =
  | "Clip"
  | "Performance"
  | "Session"
  | "DJ set"
  | "Freestyle"
  | "Danse"
  | "Cover"
  | "Studio"
  | "Coulisses"
  | "Interview"
  | "Documentaire"
  | "Collaboration"
  | "Replay de Room"
  | "MeeWav Original";

export type ShortsPublicationGovernance = {
  validation: "local-preflight";
  requestedUses: readonly MediaDistributionUse[];
  credits: readonly MusicCredit[];
  confirmations: {
    musicRights: boolean;
    imageRights: boolean;
  };
};

export type ShortsPublisher = {
  type: "artist";
  artistId: string;
  name: string;
};

export type ShortsPublicationLink = {
  label: string;
  url: string;
};

export type ShortsPublicationCredit = {
  name: string;
  role?: string;
};

export type ShortsAssociatedContent = {
  type: "track" | "project" | "room";
  label: string;
  url?: string;
};

export type ShortsVideoItem = {
  id: string;
  artistId: string;
  mockArtistId: string;
  profileId?: string;
  title: string;
  artist: string;
  /** Explicit publication credit; editorial selection never replaces authorship. */
  publisher?: ShortsPublisher;
  /** Stable artist identity image, deliberately distinct from the video poster. */
  artistPortrait?: string;
  /** Public disclosure for a virtual or AI artist identity. */
  isAiArtist?: boolean;
  image: string;
  video: string;
  audioUrl?: string;
  format: ShortsVideoFormat;
  presentationFormat?: ScenePresentationFormat;
  aspectRatio?: "16:9" | "9:16" | "1:1";
  sourceFormat?: ShortsVideoFormat;
  linkedDesktopVersion?: boolean;
  secondaryVideo?: string;
  multicamLayout?: ShortsMulticamLayout;
  alt: string;
  duration: string;
  contentTypeLabel?: ShortsContentTypeLabel;
  meta: string;
  role: string;
  city: string;
  views: string;
  gradeLevel: 1 | 2 | 3 | 4 | 5 | 6;
  likeCount: number;
  goldenLikeCount: number;
  badge?: string;
  availability?: string;
  collabAvailable?: boolean;
  description?: string;
  publishedAt?: string;
  publicationLinks?: ShortsPublicationLink[];
  credits?: ShortsPublicationCredit[];
  associatedContent?: ShortsAssociatedContent;
  hashtags?: string[];
  verified?: boolean;
  publicationGovernance?: ShortsPublicationGovernance;
};

export type ShortsWallId =
  | "trending"
  | "for-you"
  | "vertical"
  | "collaborations"
  | "tv"
  | "replays"
  | "showreels";

export type ShortsWallDefinition = {
  id: ShortsWallId;
  eyebrow: string;
  title: string;
  description: string;
  wallDescription: string;
  homeLimit: number;
  tone: "default" | "collaboration" | "tv" | "portrait";
  items: ShortsVideoItem[];
};

type ThumbnailSeed = {
  image: string;
  format: ShortsVideoFormat;
};

type WallSeed = Omit<ShortsWallDefinition, "items"> & {
  titles: readonly string[];
  disciplines: readonly string[];
  contentTypes: readonly ShortsContentTypeLabel[];
  thumbnails: ThumbnailSeed[];
};

const LANDSCAPE_DEMO_VIDEOS = [
  "/media/shorts-demo/landscape-dj.mp4",
  "/media/shorts-demo/landscape-guitar.mp4",
  "/media/shorts-demo/landscape-roundtable.mp4",
] as const;

const PORTRAIT_DEMO_VIDEOS = [
  "/media/shorts-demo/portrait-studio-rap.mp4",
  "/media/shorts-demo/portrait-producer.mp4",
  "/media/shorts-demo/portrait-vocal-session.mp4",
  "/assets/shortfictive/shortf2.mp4",
  "/assets/shortfictive/shortf3.mp4",
] as const;

const AVAILABILITIES = [
  "Ouvert aux collaborations",
  "Recherche un projet",
  "Disponible pour une session",
  "Recherche une scène",
  "Disponible pour un clip",
  "Ouvert aux featurings",
] as const;

const VIEWS = [
  "1,2 k vues",
  "2,8 k vues",
  "4,6 k vues",
  "7,9 k vues",
  "12 k vues",
  "18 k vues",
  "24 k vues",
  "38 k vues",
  "52 k vues",
] as const;

const PORTRAIT_DURATIONS = ["0:09", "0:12", "0:18", "0:24", "0:34", "0:48", "1:04", "1:18"] as const;
const LANDSCAPE_DURATIONS = ["2:18", "2:42", "3:06", "3:28", "4:12", "5:04"] as const;

function catalogV3(prefix: string, count: number): ThumbnailSeed[] {
  return Array.from({ length: count }, (_, index) => ({
    image: `/images/shorts/catalog-v3/${prefix}-${String(index + 1).padStart(2, "0")}.webp`,
    format: "landscape",
  }));
}

function namedCatalogV3(files: readonly string[]): ThumbnailSeed[] {
  return files.map((file) => ({
    image: `/images/shorts/catalog-v3/${file}`,
    format: "landscape",
  }));
}

function numberedWallImages(
  wall: ShortsWallId,
  start: number,
  end: number,
  formatFor: (slot: number) => ShortsVideoFormat,
): ThumbnailSeed[] {
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const slot = start + index;
    return {
      image: `/images/shorts/walls/${wall}/${wall}-${String(slot).padStart(2, "0")}.webp`,
      format: formatFor(slot),
    };
  });
}

const LANDSCAPE = () => "landscape" as const;
const PORTRAIT = () => "portrait" as const;
const FOR_YOU_FORMAT = (slot: number): ShortsVideoFormat => slot % 3 === 0 ? "portrait" : "landscape";
const SHOWREEL_FORMAT = (slot: number): ShortsVideoFormat => (
  slot % 2 === 0 || slot % 3 === 0 ? "portrait" : "landscape"
);

const WALL_SEEDS: Record<ShortsWallId, WallSeed> = {
  trending: {
    id: "trending",
    eyebrow: "La sélection commune · dernières 24 heures",
    title: "À la une",
    description: "Une sélection éditoriale renouvelée chaque jour pour ouvrir plusieurs univers musicaux.",
    wallDescription: "Le regard éditorial MeeWav : des créations choisies pour leur qualité musicale, leur singularité et la diversité des artistes.",
    homeLimit: 5,
    tone: "default",
    titles: [
      "Sous la lumière | MeeWav Session",
      "Sans filet (Live Session)",
      "Clair-obscur",
      "Lignes de fuite",
      "Après minuit",
      "Traversées (Rooftop Session)",
      "D’autres soleils",
      "Battements suspendus",
      "Le jour se lève",
      "Nuit sans fin (Live)",
      "Chambre 17 (Acoustic Session)",
      "Fréquences fantômes",
      "Raga de minuit",
      "Bleu électrique",
      "Tout près du silence",
      "Impact doux",
      "Les murs répondent",
      "Avant l’orage",
      "Dernier métro",
      "Danser dans l’écho",
      "Feu calme",
      "Le ciel à l’envers",
      "Sans détour",
      "Une mesure d’avance",
      "Golden Hour (Studio Live)",
      "Parallèles",
      "Entre les lignes",
      "La nuit nous ressemble",
      "Racines nouvelles",
      "Pulsation libre",
    ],
    disciplines: [
      "Chanteuse · Interprète",
      "Rappeur · Auteur",
      "Danseuse · Chorégraphe",
      "Violoniste · Arrangeur",
      "Beatmaker · Producteur",
      "DJ · Curatrice",
      "Saxophoniste · Improvisateur",
      "Guitariste · Compositeur",
      "Percussionniste · Performer",
      "Duo vocal · Auteurs",
    ],
    contentTypes: [
      "Session",
      "Session",
      "Performance",
      "Danse",
      "Studio",
      "DJ set",
      "Performance",
      "Performance",
      "Performance",
      "Session",
    ],
    thumbnails: [
      ...namedCatalogV3([
        "daily-01-soul-singer.webp",
        "daily-02-rap-tunnel.webp",
        "daily-03-contemporary-dance.webp",
        "daily-04-violin-rooftop.webp",
        "daily-05-beatmaker-drop.webp",
        "daily-06-dj-warehouse.webp",
        "daily-07-jazz-sax.webp",
        "daily-08-rock-guitar.webp",
        "daily-09-afro-percussion.webp",
        "daily-10-pop-vocal-duo.webp",
      ]),
      ...numberedWallImages("trending", 11, 30, LANDSCAPE),
    ],
  },
  "for-you": {
    id: "for-you",
    eyebrow: "Selon ce que tu écoutes, suis et construis",
    title: "Pour toi",
    description: "Danse, voix, instruments et production : l’algorithme mélange les disciplines au lieu de les enfermer.",
    wallDescription: "Un mur réellement transversal, recomposé à partir de tes écoutes, des métiers consultés et des projets auxquels tu participes.",
    homeLimit: 5,
    tone: "default",
    titles: [
      "Trois énergies",
      "Entre deux mesures",
      "Topline fantôme",
      "Raga nocturne",
      "Corps refrain",
      "Mémoire basse",
      "Avant le beat",
      "Fil libre",
      "Texture 11",
      "Point de rupture",
    ],
    disciplines: [
      "DJ · Curatrice",
      "Saxophoniste",
      "Chanteuse · Topliner",
      "Sitariste · Compositrice",
      "Danseur · Chorégraphe",
      "Bassiste · Directeur musical",
      "Rappeuse · Autrice",
      "Pianiste · Improvisateur",
      "Ingénieure son",
      "Beatmaker · Producteur",
    ],
    contentTypes: [
      "DJ set",
      "Performance",
      "Session",
      "Performance",
      "Danse",
      "Session",
      "Freestyle",
      "Performance",
      "Coulisses",
      "Studio",
    ],
    thumbnails: [
      { image: "/images/shorts/catalog-v2/creator-dj-club.webp", format: "landscape" },
      { image: "/images/shorts/community/community-saxophone-session.webp", format: "landscape" },
      { image: "/images/shorts/community/community-vocal-booth.webp", format: "landscape" },
      { image: "/images/shorts/community/community-sitar-fusion.webp", format: "landscape" },
      { image: "/images/shorts/catalog-v2/creator-choreographer-rehearsal.webp", format: "landscape" },
      { image: "/images/shorts/community/community-producer-bedroom.webp", format: "landscape" },
      ...numberedWallImages("for-you", 1, 30, FOR_YOU_FORMAT),
    ],
  },
  vertical: {
    id: "vertical",
    eyebrow: "La création pensée pour le mobile",
    title: "Shorts",
    description: "Des preuves de talent pensées pour le mobile, confortables à découvrir aussi sur desktop.",
    wallDescription: "Les Shorts de La Scène réunis dans un vrai mur desktop : danse, freestyle, voix, beatmaking et instruments sans sacrifier le cadrage d’origine.",
    homeLimit: 6,
    tone: "portrait",
    titles: [
      "Voix dans la nuit",
      "Beat à fleur de pads",
      "Corps électrique",
      "Violon sur les toits",
      "Minuit sur le mix",
      "Souffle cuivre",
      "Dernière répétition",
      "Deux peaux, un rythme",
      "Trente secondes",
      "Sans coupe",
    ],
    disciplines: [
      "Chanteuse · Interprète",
      "Beatmaker · Producteur",
      "Danseuse · Chorégraphe",
      "Violoniste · Arrangeur",
      "DJ · Performer",
      "Saxophoniste · Interprète",
      "Autrice · Guitariste",
      "Percussionnistes · Performers",
      "Rappeur · Freestyle",
      "Vocaliste · Topliner",
    ],
    contentTypes: [
      "Performance",
      "Studio",
      "Danse",
      "Performance",
      "DJ set",
      "Session",
      "Coulisses",
      "Performance",
      "Freestyle",
      "Studio",
    ],
    thumbnails: [
      { image: "/images/shorts/walls/vertical-premium/vertical-vocal-booth.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-beatmaker-pads.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-contemporary-dance.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-violin-rooftop.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-warehouse-dj.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-jazz-saxophone.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-backstage-guitar.webp", format: "portrait" },
      { image: "/images/shorts/walls/vertical-premium/vertical-percussion-duo.webp", format: "portrait" },
      ...numberedWallImages("vertical", 1, 30, PORTRAIT),
      ...numberedWallImages("for-you", 1, 30, FOR_YOU_FORMAT)
        .filter(({ format }) => format === "portrait"),
      ...numberedWallImages("showreels", 1, 30, SHOWREEL_FORMAT)
        .filter(({ format }) => format === "portrait"),
    ],
  },
  collaborations: {
    id: "collaborations",
    eyebrow: "Passe de la découverte au projet",
    title: "Talents ouverts aux collaborations",
    description: "Le besoin est lisible dès la vidéo : voix, scène, clip, tournée, arrangement ou production.",
    wallDescription: "Chaque carte est un point de départ concret : une compétence visible, une disponibilité claire et une proposition de projet à portée de clic.",
    homeLimit: 4,
    tone: "collaboration",
    titles: [
      "Je cherche une voix pour ce refrain",
      "Un violon pour ouvrir le second couplet",
      "La chorégraphie attend son morceau",
      "Batterie live disponible pour la scène",
      "Une basse pour solidifier ce groove",
      "Guitare acoustique pour une session",
      "Cordes modernes pour image et scène",
      "Seize mesures ouvertes à un featuring",
      "Set hybride prêt pour une date",
      "Production ouverte aux toplines",
    ],
    disciplines: [
      "Beatmaker · Producteur",
      "Violoniste · Arrangeur",
      "Danseuse · Chorégraphe",
      "Batteur · Directeur musical",
      "Bassiste · Compositeur",
      "Guitariste · Interprète",
      "Ensemble néo-classique",
      "Rappeur · Auteur",
      "DJ · Live performer",
      "Productrice · MAO",
    ],
    contentTypes: ["Collaboration"],
    thumbnails: [
      ...catalogV3("collab", 10),
      ...numberedWallImages("collaborations", 11, 30, LANDSCAPE),
    ],
  },
  tv: {
    id: "tv",
    eyebrow: "Productions originales",
    title: "MeeWav TV",
    description: "Entretiens, documentaires, masterclass et performances pour raconter les artistes et les métiers.",
    wallDescription: "Le regard éditorial MeeWav : des formats produits, montés et pensés pour comprendre la création derrière la performance.",
    homeLimit: 4,
    tone: "tv",
    titles: [
      "Dans les coulisses de la sortie",
      "Composer quand tout le monde dort",
      "Le mix expliqué piste par piste",
      "Une performance, quatre caméras",
      "La Room qui a créé un nouveau duo",
      "Le soundcheck devient masterclass",
      "Déconstruire une production moderne",
      "L’orchestre rencontre la machine",
      "Le métier qui façonne le silence",
      "Le rooftop avant le montage final",
    ],
    disciplines: [
      "Documentaire musical",
      "Entretien · Compositeur",
      "Masterclass · Production",
      "Performance multicam",
      "Replay éditorialisé",
      "Reportage · Scène",
      "Décryptage studio",
      "Session orchestrale",
      "Portrait · Ingénieur son",
      "Live enregistré",
    ],
    contentTypes: [
      "Documentaire",
      "Interview",
      "MeeWav Original",
      "MeeWav Original",
      "Documentaire",
      "Coulisses",
      "MeeWav Original",
      "MeeWav Original",
      "Interview",
      "MeeWav Original",
    ],
    thumbnails: [
      ...namedCatalogV3([
        "tv-01-backstage-documentary.webp",
        "tv-02-composer-interview.webp",
        "tv-03-production-masterclass.webp",
        "tv-04-multicam-performance.webp",
        "tv-05-intimate-room-replay.webp",
        "tv-06-soundcheck.webp",
        "tv-07-studio-breakdown.webp",
        "tv-08-modern-orchestra.webp",
        "tv-09-sound-engineer-portrait.webp",
        "tv-10-rooftop-replay.webp",
      ]),
      ...numberedWallImages("tv", 11, 30, LANDSCAPE),
    ],
  },
  replays: {
    id: "replays",
    eyebrow: "Après le direct, sur publication de l’artiste",
    title: "Replays de Rooms publiés",
    description: "Le direct reste dans Rooms. Lorsqu’un artiste publie son replay, il rejoint La Scène à la demande.",
    wallDescription: "Une Room appartient à Rooms pendant le direct. Une fois terminée, son replay peut être publié par l’artiste dans La Scène, sans créer un nouveau catalogue de directs.",
    homeLimit: 4,
    tone: "default",
    titles: [
      "Cordes sans frontières",
      "Écrire une topline en direct",
      "Du sample à la scène",
      "Quatre angles pour une même prise",
      "Le refrain trouvé à la dernière minute",
      "Une Room devenue morceau",
      "Le public choisit la seconde version",
      "Le beat traverse trois villes",
      "Composer à distance, jouer ensemble",
      "La session complète sans coupure",
    ],
    disciplines: [
      "Session collaborative",
      "Chanteuse · Guitariste",
      "Duo électronique",
      "Performance multicam",
      "Room d’écriture",
      "Création collective",
      "Session interactive",
      "Production à distance",
      "Ensemble hybride",
      "Replay intégral",
    ],
    contentTypes: ["Replay de Room"],
    thumbnails: [
      { image: "/images/shorts/catalog-v2/tv-room-replay.webp", format: "landscape" },
      { image: "/images/shorts/catalog/live-maeva-acoustic.webp", format: "landscape" },
      { image: "/images/shorts/catalog/live-azur-band.webp", format: "landscape" },
      { image: "/images/shorts/catalog-v2/tv-performance-multicam.webp", format: "landscape" },
      ...numberedWallImages("replays", 1, 30, LANDSCAPE),
    ],
  },
  showreels: {
    id: "showreels",
    eyebrow: "La preuve par l’image",
    title: "Showreels et démos",
    description: "Le CV vivant des artistes : savoir-faire, identité et niveau en quelques minutes.",
    wallDescription: "Des portfolios vidéo conçus pour recruter, collaborer ou présenter une signature artistique sans passer par un long dossier.",
    homeLimit: 4,
    tone: "default",
    titles: [
      "Voix dans la ville",
      "Seize mesures",
      "Violon au crépuscule",
      "Pulsation de scène",
      "Saison ouverte",
      "Univers en une minute",
      "Geste, son, présence",
      "Prise directe",
      "Du studio à la scène",
      "Portfolio vivant",
    ],
    disciplines: [
      "Chanteuse · Interprète",
      "Rappeur · Auteur",
      "Violoniste · Arrangeur",
      "Batteur · Performer",
      "Danseuse · Chorégraphe",
      "DJ · Curatrice",
      "Guitariste · Compositeur",
      "Pianiste · Interprète",
      "Beatmaker · Producteur",
      "Artiste pluridisciplinaire",
    ],
    contentTypes: [
      "Clip",
      "Freestyle",
      "Performance",
      "Performance",
      "Danse",
      "DJ set",
      "Cover",
      "Performance",
      "Studio",
      "Performance",
    ],
    thumbnails: [
      { image: "/images/shorts/catalog-v2/vocal-pop-urbaine-blue-hour.webp", format: "landscape" },
      { image: "/images/shorts/catalog-v2/vocal-rap-cypher-basement.webp", format: "landscape" },
      { image: "/images/shorts/catalog-v2/creator-violin-rooftop.webp", format: "landscape" },
      { image: "/images/shorts/catalog-v2/creator-drummer-live.webp", format: "landscape" },
      ...numberedWallImages("showreels", 1, 30, SHOWREEL_FORMAT),
    ],
  },
};

const WALL_ORDER: ShortsWallId[] = [
  "trending",
  "for-you",
  "vertical",
  "collaborations",
  "tv",
  "replays",
  "showreels",
];

const TITLE_EDITION_SUFFIXES: Record<ShortsWallId, readonly string[]> = {
  trending: [""],
  "for-you": ["", " (Live Session)", " (Studio Take)", " (Session nocturne)"],
  vertical: ["", " (Short)", " (Studio Cut)"],
  collaborations: ["", " — Session ouverte", " — Version live"],
  tv: ["", " — Épisode 2", " — Épisode 3"],
  replays: ["", " — Session II", " — Session III", " — Session IV"],
  showreels: ["", " — Édition 2026", " — Live Cut", " — Studio Cut"],
};

function workTitle(seed: WallSeed, index: number) {
  const baseTitle = seed.titles[index % seed.titles.length];
  const edition = Math.floor(index / seed.titles.length);
  return `${baseTitle}${TITLE_EDITION_SUFFIXES[seed.id][edition] ?? ` — Édition ${edition + 1}`}`;
}

function buildWall(seed: WallSeed, wallIndex: number): ShortsWallDefinition {
  const items = seed.thumbnails.map((thumbnail, index): ShortsVideoItem => {
    const artistOffset = seed.id === "for-you" ? 15 : wallIndex * 3;
    const artistIndex = (index * 7 + artistOffset) % SCENE_DEMO_ARTISTS.length;
    const artistProfile = SCENE_DEMO_ARTISTS[artistIndex];
    const {
      artistId,
      name: artist,
      portrait: artistPortrait,
      role,
      style,
      city,
      gradeLevel,
      isAiArtist,
    } = artistProfile;
    const titleStem = workTitle(seed, index);
    const contentTypeLabel = seed.contentTypes[index % seed.contentTypes.length];
    const videoPool = thumbnail.format === "portrait" ? PORTRAIT_DEMO_VIDEOS : LANDSCAPE_DEMO_VIDEOS;
    const isReplay = seed.id === "replays";
    const isTrending = seed.id === "trending";
    const isCollaboration = seed.id === "collaborations";
    const collabAvailable = isCollaboration
      || (seed.id === "for-you" && index % 2 === 0)
      || (isTrending && index < 2)
      || (seed.id === "vertical" && index % 9 === 0);
    const isAudioVisualizer = seed.id === "for-you" && index === 9;
    const hasDemoMulticam = seed.id === "collaborations"
      && index === 0
      && thumbnail.format === "landscape";
    const mediaUrl = isAudioVisualizer
      ? "/media/profile-demo/vocal-session-audio.mp3"
      : videoPool[(index + wallIndex) % videoPool.length];

    return {
      id: `${seed.id}-${String(index + 1).padStart(2, "0")}`,
      artistId,
      mockArtistId: artistId,
      profileId: artistId,
      title: titleStem,
      artist,
      publisher: {
        type: "artist",
        artistId,
        name: artist,
      },
      artistPortrait,
      ...(isAiArtist ? { isAiArtist: true } : {}),
      image: thumbnail.image,
      video: mediaUrl,
      audioUrl: isAudioVisualizer ? mediaUrl : undefined,
      format: thumbnail.format,
      presentationFormat: isAudioVisualizer
        ? "audio_visualizer"
        : thumbnail.format === "portrait" ? "vertical" : "landscape",
      aspectRatio: thumbnail.format === "portrait" ? "9:16" : "16:9",
      sourceFormat: thumbnail.format,
      secondaryVideo: hasDemoMulticam
        ? LANDSCAPE_DEMO_VIDEOS[(index + wallIndex + 1) % LANDSCAPE_DEMO_VIDEOS.length]
        : undefined,
      multicamLayout: hasDemoMulticam ? "duo" : undefined,
      contentTypeLabel,
      alt: `${artist}, ${role.toLocaleLowerCase("fr")}, présente ${titleStem.toLocaleLowerCase("fr")}`,
      duration: thumbnail.format === "portrait"
        ? PORTRAIT_DURATIONS[index % PORTRAIT_DURATIONS.length]
        : LANDSCAPE_DURATIONS[index % LANDSCAPE_DURATIONS.length],
      meta: `${style} · ${isAudioVisualizer ? "Audio visualizer" : thumbnail.format === "portrait" ? "Short" : isReplay ? "Replay de Room" : "Performance"}`,
      role,
      city,
      views: VIEWS[(index * 2 + wallIndex) % VIEWS.length],
      gradeLevel,
      likeCount: 420 + ((index * 617 + wallIndex * 1_391) % 28_000),
      goldenLikeCount: 7 + ((artistIndex * 43) % 1_200),
      badge: thumbnail.format === "portrait"
        ? undefined
        : isTrending
          ? index < 4 ? "Coup de cœur · 24 h" : "À la une · 24 h"
          : isReplay
            ? "Replay de Room"
            : isAudioVisualizer
              ? "Audio + visualizer"
              : index < 2
                ? "Nouveau"
                : undefined,
      availability: collabAvailable
        ? AVAILABILITIES[(index + wallIndex) % AVAILABILITIES.length]
        : undefined,
      collabAvailable,
      description: seed.wallDescription,
      publishedAt: new Date(Date.UTC(2026, 7, 9 - ((index + wallIndex) % 26))).toISOString(),
      publicationLinks: thumbnail.format === "portrait" && index % 3 !== 2
        ? [
            { label: "Écouter le morceau", url: "https://meewav.com/scene/audio" },
            ...(index % 2 === 0 ? [{ label: "Découvrir la Room", url: "https://meewav.com/rooms" }] : []),
          ]
        : undefined,
      credits: thumbnail.format === "portrait"
        ? [
            { name: artist, role: role.split("·")[0]?.trim() },
            { name: SCENE_DEMO_ARTISTS[(artistIndex + 2) % SCENE_DEMO_ARTISTS.length].name, role: "Collaboration" },
          ]
        : undefined,
      associatedContent: thumbnail.format === "portrait"
        ? {
            type: index % 3 === 0 ? "room" : index % 3 === 1 ? "track" : "project",
            label: index % 3 === 0 ? "Room — Session nocturne" : index % 3 === 1 ? titleStem : "Projet — Nouvelles fréquences",
            url: index % 3 === 0 ? "https://meewav.com/rooms" : "https://meewav.com/scene",
          }
        : undefined,
      hashtags: thumbnail.format === "portrait"
        ? [contentTypeLabel.replace(/\s+/g, ""), style.replace(/\s+/g, ""), city.replace(/\s+/g, "")]
        : undefined,
      verified: index % 3 !== 2,
    };
  });

  return {
    id: seed.id,
    eyebrow: seed.eyebrow,
    title: seed.title,
    description: seed.description,
    wallDescription: seed.wallDescription,
    homeLimit: seed.homeLimit,
    tone: seed.tone,
    items,
  };
}

export const SHORTS_WALLS = Object.fromEntries(
  WALL_ORDER.map((wallId, index) => [wallId, buildWall(WALL_SEEDS[wallId], index)]),
) as Record<ShortsWallId, ShortsWallDefinition>;

export const SHORTS_HOME_ORDER = WALL_ORDER;

export const ALL_SHORTS_VIDEOS = WALL_ORDER.flatMap((wallId) => SHORTS_WALLS[wallId].items);

export const SHORTS_WALL_MINIMUM = 30;
