import profilePortrait from "../../assets/preprofile/demo/profile-sia-drums.webp";
import shortLivePulse from "../../assets/preprofile/demo/short-live-pulse.webp";
import shortStudioSession from "../../assets/preprofile/demo/short-studio-session.webp";
import { LOCAL_PREVIEW_FETAH_HOST } from "../auth/localAuthPreview";
import type { GradeLevel } from "../grades/gradeBadges";
import { SCENE_NAME } from "../shorts/sceneContract";

export type ProfileTabId = "home" | "stats" | "media" | "space";
export type StatsPeriod = "7d" | "30d" | "12m";
export type MediaSectionId = "library" | "studio" | "badges";
export type MediaKind = "audio" | "video" | "image" | "document";
export type SpaceModuleId =
  | "wallet"
  | "transactions"
  | "contracts"
  | "hardware"
  | "security"
  | "organization";

export type DemoProfile = {
  displayName: string;
  username: string;
  role: string;
  roleKey: string | null;
  city: string;
  country: string;
  bio: string;
  avatarUrl: string;
  followers: string;
  following: string;
  grade: GradeLevel;
  gradeProgress: number;
  pointsToNextGrade: number;
  tokenValue: string;
  profileCompletion: number;
  isVerified: boolean;
  visibility: {
    role: boolean;
    grade: boolean;
    collab: boolean;
    viewerMenu: boolean;
    showOnPublicProfile: boolean;
    isGhostMode: boolean;
  };
  publicProfilePreferences: Record<string, unknown>;
};

export type ProfileNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  type: string;
};

export type ActivityItem = {
  id: string;
  type: "growth" | "golden" | "sale" | "collab";
  title: string;
  detail: string;
  time: string;
};

export type MediaItem = {
  id: string;
  title: string;
  kind: MediaKind;
  meta: string;
  status: "Publié" | "Brouillon" | "Programmé";
  accent: string;
  cover?: string;
  plays?: string;
  duration?: string;
  fileSize?: string;
  likes?: string;
  sourceUrl?: string;
  previewLines?: string[];
  producedOnMeewav?: boolean;
};

export type SearchEntry = {
  id: string;
  label: string;
  detail: string;
  tab: ProfileTabId;
  section?: MediaSectionId;
  module?: SpaceModuleId | "edit-profile" | "viewer";
  keywords: string;
};

export const demoProfile: DemoProfile = {
  displayName: "Nox Amani",
  username: "@noxamani",
  role: "Producteur · Pianiste",
  roleKey: "producer",
  city: "Paris",
  country: "France",
  bio: "Piano nocturne, textures analogiques et sessions cinématiques. Je transforme les silences en paysages sonores.",
  avatarUrl: profilePortrait,
  followers: "34,5 k",
  following: "248",
  grade: 4,
  gradeProgress: 74,
  pointsToNextGrade: 260,
  tokenValue: "2,84 €",
  profileCompletion: 86,
  isVerified: true,
  visibility: {
    role: true,
    grade: true,
    collab: true,
    viewerMenu: false,
    showOnPublicProfile: true,
    isGhostMode: false,
  },
  publicProfilePreferences: {},
};

/** Rich owner profile displayed only by the authentication-free local preview. */
export const fetahDemoProfile: DemoProfile = {
  ...demoProfile,
  displayName: LOCAL_PREVIEW_FETAH_HOST.displayName,
  username: LOCAL_PREVIEW_FETAH_HOST.handle,
  role: "Fondateur · Beatmaker",
  roleKey: LOCAL_PREVIEW_FETAH_HOST.roleKey,
  avatarUrl: LOCAL_PREVIEW_FETAH_HOST.portraitUrl,
};

export const emptyProfile: DemoProfile = {
  displayName: "Profil Meewav",
  username: "@profil",
  role: "Créateur Meewav",
  roleKey: null,
  city: "Ville non renseignée",
  country: "Pays non renseigné",
  bio: "Ajoute une bio pour présenter ton parcours et tes collaborations.",
  avatarUrl: "/avatars/utilisateur.png",
  followers: "0",
  following: "0",
  grade: 1,
  gradeProgress: 0,
  pointsToNextGrade: 1_000,
  tokenValue: "0,00 €",
  profileCompletion: 0,
  isVerified: false,
  visibility: {
    role: true,
    grade: true,
    collab: true,
    viewerMenu: false,
    showOnPublicProfile: false,
    isGhostMode: true,
  },
  publicProfilePreferences: {},
};

export const profileTabs: Array<{
  id: ProfileTabId;
  label: string;
}> = [
  { id: "home", label: "Accueil" },
  { id: "stats", label: "Statistique" },
  { id: "media", label: "Médias" },
  { id: "space", label: "Espace privé" },
];

export const activityItems: ActivityItem[] = [
  {
    id: "activity-growth",
    type: "growth",
    title: "126 personnes ont découvert ton profil",
    detail: "La croissance vient surtout de ta dernière vidéo.",
    time: "Il y a 18 min",
  },
  {
    id: "activity-golden",
    type: "golden",
    title: "Golden Like reçu de Lila North",
    detail: "Sur « Minuit Bleu — Live Room ».",
    time: "Il y a 2 h",
  },
  {
    id: "activity-sale",
    type: "sale",
    title: "Pack Ambient Keys vendu",
    detail: "49 € ajoutés au solde en attente.",
    time: "Il y a 4 h",
  },
  {
    id: "activity-collab",
    type: "collab",
    title: "Nouvelle proposition de collaboration",
    detail: "Maya Sol souhaite ouvrir une session privée.",
    time: "Hier, 22:14",
  },
];

export const statsSeries: Record<StatsPeriod, {
  label: string;
  range: string;
  values: number[];
  revenue: string;
  reach: string;
  engagement: string;
  growth: string;
}> = {
  "7d": {
    label: "7 jours",
    range: "9–15 juillet",
    values: [28, 42, 36, 58, 52, 76, 88],
    revenue: "1 240 €",
    reach: "48,2 k",
    engagement: "13,6 %",
    growth: "+8,4 %",
  },
  "30d": {
    label: "30 jours",
    range: "16 juin–15 juillet",
    values: [18, 25, 21, 34, 31, 46, 42, 55, 51, 64, 68, 82],
    revenue: "2 940 €",
    reach: "128,4 k",
    engagement: "12,8 %",
    growth: "+18,7 %",
  },
  "12m": {
    label: "12 mois",
    range: "Août 2025–juillet 2026",
    values: [12, 17, 24, 28, 36, 42, 48, 53, 62, 70, 78, 92],
    revenue: "28 460 €",
    reach: "1,42 M",
    engagement: "11,9 %",
    growth: "+72,1 %",
  },
};

export const audienceSources = [
  { label: SCENE_NAME, value: 54, color: "#d946ef" },
  { label: "Globe", value: 18, color: "#8b5cff" },
  { label: "Recherche", value: 10, color: "#6b7cff" },
  { label: "Rooms", value: 7, color: "#19b8ff" },
  { label: "Partages", value: 5, color: "#34d399" },
  { label: "Tremplin", value: 3, color: "#ffd45e" },
  { label: "Marketplace", value: 2, color: "#ff8c69" },
  { label: "Accès direct", value: 1, color: "#a7afc1" },
];

export const mediaItems: MediaItem[] = [
  {
    id: "media-midnight",
    title: "Nocturne 01",
    kind: "audio",
    meta: "MP3 · 24 juin 2024",
    status: "Publié",
    accent: "#8b5cff",
    duration: "02:07",
    plays: "1,2 k",
    likes: "342",
    sourceUrl: "/media/preprofile-demo/hazy-after-hours.mp3",
    producedOnMeewav: true,
  },
  {
    id: "media-live-room",
    title: "Live Session – Paris",
    kind: "video",
    meta: "MP4 · 18 juin 2024",
    status: "Publié",
    accent: "#d946ef",
    cover: shortStudioSession,
    duration: "00:12",
    plays: "2,7 k",
    likes: "634",
    sourceUrl: "/media/preprofile-demo/dj-turntable.mp4",
    producedOnMeewav: true,
  },
  {
    id: "media-analog",
    title: "Concept Album.pdf",
    kind: "document",
    meta: "PDF · 10 juin 2024",
    status: "Publié",
    accent: "#19b8ff",
    fileSize: "2,4 Mo",
    plays: "856",
    likes: "120",
    sourceUrl: "/media/demo/concept-album.txt",
    previewLines: [
      "NOCTURNE 01 · LA MINEUR · 82 BPM",
      "Intro — piano feutré, respiration large",
      "Couplet — texture analogique et voix proche",
      "Refrain — ouvrir l’espace stéréo",
    ],
  },
  {
    id: "media-session",
    title: "Studio Setup",
    kind: "image",
    meta: "JPG · 8 juin 2024",
    status: "Publié",
    accent: "#ff5aa5",
    cover: shortStudioSession,
    fileSize: "1,8 Mo",
    plays: "642",
    likes: "98",
  },
  {
    id: "media-cover",
    title: "Minuit Bleu",
    kind: "audio",
    meta: "WAV · 2 juin 2024",
    status: "Brouillon",
    accent: "#6b7cff",
    duration: "01:42",
    plays: "984",
    likes: "206",
    sourceUrl: "/media/preprofile-demo/tech-house-vibes.mp3",
    producedOnMeewav: true,
  },
  {
    id: "media-rider",
    title: "Aurora – Teaser",
    kind: "video",
    meta: "MP4 · 28 mai 2024",
    status: "Programmé",
    accent: "#ffb86b",
    cover: shortLivePulse,
    duration: "00:08",
    plays: "3,1 k",
    likes: "418",
    sourceUrl: "/media/preprofile-demo/female-guitarist.mp4",
    producedOnMeewav: true,
  },
];

export const earnedBadges = [
  { id: "badge-regular", label: "Créateur régulier", detail: "14 jours actifs", accent: "#8b5cff", earned: true },
  { id: "badge-golden", label: "Golden Pulse", detail: "25 Golden Likes", accent: "#ffd45e", earned: true },
  { id: "badge-live", label: "Live magnet", detail: "10 Rooms complètes", accent: "#d946ef", earned: true },
  { id: "badge-collab", label: "Maître des collaborations", detail: "18 / 25 collabs", accent: "#19b8ff", earned: false },
];

export const spaceModules: Array<{
  id: SpaceModuleId;
  label: string;
  detail: string;
  metric: string;
  status: string;
  accent: string;
}> = [
  { id: "wallet", label: "Portefeuille", detail: "Solde disponible", metric: "3 842 €", status: "+420 € ce mois", accent: "#6b7cff" },
  { id: "transactions", label: "Transactions", detail: "Historique et paiements", metric: "126", status: "+12,2 % sur 30 j", accent: "#34d399" },
  { id: "contracts", label: "Contrats", detail: "Droits et signatures", metric: "8 contrats", status: "2 à signer", accent: "#a7afc1" },
  { id: "hardware", label: "Matériel", detail: "Inventaire du studio", metric: "14 éléments", status: "12 disponibles", accent: "#ffb86b" },
  { id: "security", label: "Sécurité", detail: "Protection et accès", metric: "92 / 100", status: "Aucune alerte", accent: "#8b5cff" },
  { id: "organization", label: "Organisation", detail: "Rôles et permissions", metric: "6 membres", status: "1 invitation", accent: "#19b8ff" },
];

export const profileNotifications: ProfileNotification[] = [
  { id: "notification-1", title: "Maya Sol t’invite dans une Cage", detail: "Session privée · vendredi 22:00", time: "12 min", unread: true, type: "collaboration" },
  { id: "notification-2", title: "Ta vidéo accélère", detail: "+18 % de portée sur les deux dernières heures", time: "1 h", unread: true, type: "grade" },
  { id: "notification-3", title: "Paiement libéré", detail: "320 € sont disponibles dans ton portefeuille", time: "3 h", unread: false, type: "payment" },
  { id: "notification-4", title: "Nouveau contrat à signer", detail: "Aurora Tapes · partage de droits", time: "Hier", unread: false, type: "contract" },
];

export const searchEntries: SearchEntry[] = [
  { id: "search-home", label: "Accueil du profil", detail: "Pulse, activité et progression", tab: "home", keywords: "accueil home pulse activité progression" },
  { id: "search-stats", label: "Statistiques", detail: "Portée, engagement et revenus", tab: "stats", keywords: "stats statistique portée audience engagement revenu monnaie" },
  { id: "search-library", label: "Médiathèque", detail: "Audios, vidéos, images et documents", tab: "media", section: "library", keywords: "media médiathèque audio video image document contenu" },
  { id: "search-studio", label: "Studio", detail: "La Cage, Setlist et Cadeaux", tab: "media", section: "studio", keywords: "studio cage setlist cadeaux live room" },
  { id: "search-badges", label: "Badges", detail: "Récompenses et prochains paliers", tab: "media", section: "badges", keywords: "badge récompense niveau palier" },
  { id: "search-public", label: "Profil public", detail: "Modifier les informations visibles", tab: "space", module: "edit-profile", keywords: "profil public modifier éditer bio photo identité" },
  { id: "search-viewer", label: "Vue Viewer", detail: "Prévisualiser le profil public", tab: "space", module: "viewer", keywords: "viewer aperçu public globe visiteur" },
  ...spaceModules.map((module) => ({
    id: `search-${module.id}`,
    label: module.label,
    detail: module.detail,
    tab: "space" as const,
    module: module.id,
    keywords: `${module.label} ${module.detail}`.toLowerCase(),
  })),
];
