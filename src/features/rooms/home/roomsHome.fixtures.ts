import { SCENE_DEMO_ARTISTS } from "../../shorts/sceneArtistPortraits";
import type {
  RoomsHomeCollectionDefinition,
  RoomsHomeRoom,
  RoomsHomeRoomType,
} from "./roomsHome.types";

export const ROOMS_HOME_COLLECTIONS = [
  {
    id: "buzz-maintenant",
    slug: "buzz-maintenant",
    title: "Ça fait le buzz maintenant",
    description: "Les Rooms qui concentrent le plus d'énergie en ce moment.",
    homeLimit: 10,
    cardSize: "featured",
  },
  {
    id: "pour-toi",
    slug: "pour-toi",
    title: "Pour toi",
    description: "Une sélection accordée à tes artistes, tes styles et ta région.",
    homeLimit: 10,
    cardSize: "compact",
  },
  {
    id: "artistes-en-room",
    slug: "artistes-en-room",
    title: "Tes artistes sont en Room",
    description: "Les artistes que tu suis et qui sont disponibles maintenant.",
    homeLimit: 10,
    cardSize: "compact",
  },
  {
    id: "battles-qui-chauffent",
    slug: "battles-qui-chauffent",
    title: "Battles qui chauffent",
    description: "Les duels et défis qui font réagir La Cage.",
    homeLimit: 10,
    cardSize: "compact",
  },
  {
    id: "creations-collaborations",
    slug: "creations-collaborations",
    title: "Créations & collaborations en direct",
    description: "Des morceaux prennent forme ensemble dans La Wave et La Place.",
    homeLimit: 10,
    cardSize: "compact",
  },
  {
    id: "apprendre-avec-les-artistes",
    slug: "apprendre-avec-les-artistes",
    title: "Apprendre avec les artistes",
    description: "Cours, analyses et conseils concrets proposés dans La Classe.",
    homeLimit: 10,
    cardSize: "compact",
  },
  {
    id: "grands-rendez-vous",
    slug: "grands-rendez-vous",
    title: "Les grands rendez-vous",
    description: "Les rencontres rares de La Loge et les grandes performances de La Scène.",
    homeLimit: 10,
    cardSize: "compact",
  },
] as const satisfies readonly RoomsHomeCollectionDefinition[];

type RoomBatchSeed = {
  roomType: RoomsHomeRoomType;
  titles: readonly string[];
  horizontalWall: "trending" | "collaborations" | "tv" | "replays";
  horizontalStart: number;
  verticalOffset: number;
  artistOffset: number;
  viewerBase: number;
  buzzBase: number;
  recommendationBase: number;
  engagementBase: number;
  countries: readonly string[];
  tags: readonly string[];
};

const VERTICAL_ROOM_THUMBNAILS = [
  ...Array.from({ length: 30 }, (_, index) => (
    `/images/shorts/walls/vertical/vertical-${String(index + 1).padStart(2, "0")}.webp`
  )),
  "/images/shorts/walls/vertical-premium/vertical-backstage-guitar.webp",
  "/images/shorts/walls/vertical-premium/vertical-beatmaker-pads.webp",
  "/images/shorts/walls/vertical-premium/vertical-contemporary-dance.webp",
  "/images/shorts/walls/vertical-premium/vertical-jazz-saxophone.webp",
  "/images/shorts/walls/vertical-premium/vertical-percussion-duo.webp",
  "/images/shorts/walls/vertical-premium/vertical-violin-rooftop.webp",
  "/images/shorts/walls/vertical-premium/vertical-vocal-booth.webp",
  "/images/shorts/walls/vertical-premium/vertical-warehouse-dj.webp",
  ...[3, 6, 9, 12, 15, 18, 21, 24, 27, 30].map((index) => (
    `/images/shorts/walls/for-you/for-you-${String(index).padStart(2, "0")}.webp`
  )),
  ...[2, 3, 4, 6, 8, 9, 10, 12, 14, 15, 16, 18].map((index) => (
    `/images/shorts/walls/showreels/showreels-${String(index).padStart(2, "0")}.webp`
  )),
] as const;

const HORIZONTAL_ROOM_VIDEOS = [
  "/media/shorts-demo/landscape-roundtable.mp4",
  "/media/shorts-demo/landscape-guitar.mp4",
  "/media/shorts-demo/landscape-dj.mp4",
  "/media/preprofile-demo/female-guitarist.mp4",
  "/media/preprofile-demo/dj-turntable.mp4",
] as const;

const VERTICAL_ROOM_VIDEOS = [
  "/media/shorts-demo/portrait-vocal-session.mp4",
  "/media/shorts-demo/portrait-studio-rap.mp4",
  "/media/shorts-demo/portrait-producer.mp4",
] as const;

const ROOM_BATCHES = [
  {
    roomType: "cage",
    titles: [
      "Le cercle des punchlines",
      "Duel d'écriture : dernier couplet",
      "Battle rap sans filet",
      "Producteurs face au sample mystère",
      "Freestyle 90 secondes",
      "Équipe Nord contre Équipe Sud",
      "Voix puissantes : le défi",
      "Rimes imposées par le public",
      "Beat battle : une seule prise",
      "Flow contre mélodie",
      "Le dernier refrain gagne",
      "Cypher nouvelle génération",
      "Défi topline sous pression",
      "Quart de finale des crews",
      "Duel chant contre rap",
      "Beatmakers : contrainte vinyle",
      "Improvisation en équipes",
      "Finale des nouveaux flows",
      "Défi refrain en dix minutes",
      "Confrontation des collectifs",
    ],
    horizontalWall: "trending",
    horizontalStart: 11,
    verticalOffset: 0,
    artistOffset: 0,
    viewerBase: 7_400,
    buzzBase: 72,
    recommendationBase: 54,
    engagementBase: 78,
    countries: ["FR", "BE", "CH"],
    tags: ["battle", "rap", "freestyle", "duel"],
  },
  {
    roomType: "wave",
    titles: [
      "On construit le drop ensemble",
      "Open verse sur une prod inédite",
      "De la boucle au morceau",
      "Topline nocturne en direct",
      "La communauté choisit les accords",
      "Beatmaking analogique",
      "Un refrain avant minuit",
      "Laboratoire de textures vocales",
      "Composer sans regarder l'écran",
      "Session basse et batterie",
      "Remix collectif : Éclipse",
      "Une prod, six artistes",
      "Créer une intro cinématique",
      "Chœurs ouverts à la communauté",
      "Le public construit la rythmique",
      "Session synthés modulaires",
      "Topline à distance entre deux villes",
      "Réinventer un classique ensemble",
      "Composition guidée par les émotions",
      "Finaliser le morceau avant minuit",
    ],
    horizontalWall: "trending",
    horizontalStart: 21,
    verticalOffset: 10,
    artistOffset: 14,
    viewerBase: 4_900,
    buzzBase: 62,
    recommendationBase: 66,
    engagementBase: 72,
    countries: ["FR", "BE", "SN"],
    tags: ["création", "beatmaking", "composition", "open-verse"],
  },
  {
    roomType: "place",
    titles: [
      "Studio ouvert : trouve ta place",
      "Jam soul entre inconnus",
      "Recherche voix pour le deuxième couplet",
      "Session live : cuivres et machines",
      "Écriture collective sans thème",
      "Un morceau en deux heures",
      "Guitares ouvertes aux collaborations",
      "Chorale urbaine improvisée",
      "Répétition avant la scène",
      "Producteurs et chanteurs se rencontrent",
      "Open mic des nouveaux talents",
      "Arrangement collectif en studio",
      "Rencontre cordes et machines",
      "Atelier harmonies à plusieurs voix",
      "Studio ouvert aux instrumentistes",
      "Écriture d'un titre pour la scène",
      "Jam acoustique sans répétition",
      "Composer avec des artistes du monde",
      "Session producteurs et interprètes",
      "Une idée devient un morceau",
    ],
    horizontalWall: "collaborations",
    horizontalStart: 11,
    verticalOffset: 20,
    artistOffset: 26,
    viewerBase: 3_800,
    buzzBase: 58,
    recommendationBase: 70,
    engagementBase: 68,
    countries: ["FR", "BE", "CA"],
    tags: ["collaboration", "studio", "jam", "écriture"],
  },
  {
    roomType: "classe",
    titles: [
      "Placer sa voix sans forcer",
      "Écrire un refrain mémorable",
      "Comprendre un mix moderne",
      "Beatmaking : donner du mouvement",
      "Préparer sa première scène",
      "Analyser une production comme un pro",
      "Trouver son identité artistique",
      "Les bases d'une topline forte",
      "Respiration et endurance vocale",
      "Construire son dossier professionnel",
      "Masterclass : présence scénique",
      "Transformer une maquette en titre fini",
      "Maîtriser les dynamiques vocales",
      "Écrire des couplets plus visuels",
      "Sculpter une basse dans le mix",
      "Préparer une session studio efficace",
      "Construire une identité sonore",
      "Comprendre les contrats musicaux",
      "Diriger ses répétitions comme un pro",
      "Analyser son interprétation en direct",
    ],
    horizontalWall: "collaborations",
    horizontalStart: 21,
    verticalOffset: 30,
    artistOffset: 38,
    viewerBase: 2_300,
    buzzBase: 48,
    recommendationBase: 72,
    engagementBase: 62,
    countries: ["FR", "CH", "BE"],
    tags: ["cours", "masterclass", "coaching", "analyse"],
  },
  {
    roomType: "loge",
    titles: [
      "Dans les coulisses du prochain album",
      "Écoute privée : trois titres inédits",
      "Une heure avec Nova Keys",
      "Le récit derrière Clair-obscur",
      "Rencontre sans filtre avec Maïa Soul",
      "Avant-première réservée à La Loge",
      "Conversation intime après le concert",
      "Les archives personnelles de Nils Arco",
      "Backstage : la veille du grand retour",
      "Questions rares, réponses sincères",
      "Session acoustique en petit comité",
      "Carte blanche à une étoile légendaire",
      "Confidences avant la tournée mondiale",
      "Le studio privé d'une voix iconique",
      "Histoires inédites derrière les succès",
      "Duo surprise réservé aux membres",
      "Journal intime d'une création",
      "Après-scène avec les proches",
      "Les inspirations secrètes du prochain EP",
      "Rencontre privée avec une légende",
    ],
    horizontalWall: "tv",
    horizontalStart: 11,
    verticalOffset: 40,
    artistOffset: 48,
    viewerBase: 5_700,
    buzzBase: 68,
    recommendationBase: 64,
    engagementBase: 74,
    countries: ["FR", "BE", "CH"],
    tags: ["rencontre", "backstage", "avant-première", "exclusif"],
  },
  {
    roomType: "scene",
    titles: [
      "Showcase sur le toit de Paris",
      "Orchestre moderne : nuit électrique",
      "Performance spéciale en multicam",
      "Le concert secret du Studio 17",
      "Live acoustique au lever du jour",
      "Carte blanche : mouvement et lumière",
      "Session jazz filmée en une prise",
      "Rooftop replay avec le public",
      "Grand format : les voix de demain",
      "Performance audiovisuelle immersive",
      "Concert de minuit sans public",
      "MeeWav Original : Fréquences fantômes",
      "Showcase orchestral en direct",
      "Performance urbaine sous les néons",
      "Concert immersif à trois scènes",
      "Session live au coucher du soleil",
      "Création chorégraphique et musique",
      "Grand concert des talents MeeWav",
      "Scène ouverte aux invités surprise",
      "Finale acoustique en lumière naturelle",
    ],
    horizontalWall: "replays",
    horizontalStart: 1,
    verticalOffset: 50,
    artistOffset: 6,
    viewerBase: 6_300,
    buzzBase: 66,
    recommendationBase: 62,
    engagementBase: 70,
    countries: ["FR", "BE", "SN"],
    tags: ["showcase", "performance", "concert", "replay"],
  },
] as const satisfies readonly RoomBatchSeed[];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function score(base: number, index: number, batchIndex: number, step: number) {
  const availableRange = 101 - base;
  return base + ((index * step + batchIndex * 7) % availableRange);
}

function createRoomBatch(seed: RoomBatchSeed, batchIndex: number): RoomsHomeRoom[] {
  const cities = ["Paris", "Lyon", "Marseille", "Bordeaux", "Lille", "Nantes", "Toulouse", "Strasbourg", "Rennes", "Montpellier", "Nice", "Rouen"];
  return Array.from({ length: 48 }, (_, index) => {
    const originalIndex = index % seed.titles.length;
    const city = cities[(index + batchIndex * 2) % cities.length];
    const title = seed.titles[originalIndex];
    const artist = SCENE_DEMO_ARTISTS[(seed.artistOffset + index) % SCENE_DEMO_ARTISTS.length];
    const mediaFormat = index % 2 === 1 ? "vertical" : "horizontal";
    const thumbnail = mediaFormat === "vertical"
      ? VERTICAL_ROOM_THUMBNAILS[(seed.verticalOffset + Math.floor(index / 2)) % VERTICAL_ROOM_THUMBNAILS.length]
      : `/images/shorts/walls/${seed.horizontalWall}/${seed.horizontalWall}-${String(seed.horizontalStart + Math.floor(originalIndex / 2)).padStart(2, "0")}.webp`;
    const videoSources = mediaFormat === "vertical" ? VERTICAL_ROOM_VIDEOS : HORIZONTAL_ROOM_VIDEOS;
    const videoSource = videoSources[(batchIndex * 3 + index) % videoSources.length]
      ?? HORIZONTAL_ROOM_VIDEOS[0];
    const globalIndex = seed.artistOffset + index + batchIndex;
    const elapsedMinutes = 8 + ((batchIndex * 29 + index * 11) % 172);

    return {
      id: `room-home-${seed.roomType}-${String(index + 1).padStart(2, "0")}`,
      slug: `${seed.roomType}-${slugify(title)}-${index + 1}`,
      title,
      roomType: seed.roomType,
      hostId: artist.artistId,
      hostName: artist.name,
      hostAvatar: artist.portrait,
      hostRole: artist.role,
      musicStyle: artist.style,
      thumbnail,
      videoSource,
      mediaFormat,
      viewerCount: seed.viewerBase + ((index * 1_271 + batchIndex * 883) % 12_800),
      buzzScore: score(seed.buzzBase, index, batchIndex, 17),
      recommendationScore: score(seed.recommendationBase, index, batchIndex, 19),
      engagementScore: score(seed.engagementBase, index, batchIndex, 13),
      language: index % 7 === 5 ? "en" : "fr",
      country: "FR",
      city,
      tags: [...seed.tags, artist.style.toLocaleLowerCase("fr")],
      startedAt: new Date(Date.now() - elapsedMinutes * 60_000).toISOString(),
      isFollowedHost: globalIndex % 3 !== 2,
      accessType: seed.roomType === "loge" ? "members" : "public",
      isJoinable: true,
      gradeLevel: artist.gradeLevel,
    };
  });
}

/**
 * The single deterministic source used by all seven Rooms home collections.
 * Every room is currently open and every poster/portrait points to a checked-in
 * local asset, so refreshing the investor demo never changes its identities.
 */
export const ROOMS_HOME_CATALOG: readonly RoomsHomeRoom[] = ROOM_BATCHES.flatMap(createRoomBatch);

export const ROOMS_HOME_FALLBACK_THUMBNAIL = "/images/shorts/catalog-v3/daily-01-soul-singer.webp";
