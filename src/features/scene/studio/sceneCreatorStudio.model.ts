export type SceneStudioSectionId =
  | "dashboard"
  | "content"
  | "analytics"
  | "comments"
  | "playlists"
  | "rights"
  | "tv";

export type SceneStudioPublicationStatus =
  | "published"
  | "draft"
  | "uploading"
  | "processing"
  | "review"
  | "scheduled"
  | "limited"
  | "blocked"
  | "removed"
  | "error";

export type SceneStudioVisibility = "Public" | "Non répertorié" | "Privé" | "Programmé";

export type SceneStudioContentItem = {
  id: string;
  publicSlug?: string;
  title: string;
  format: string;
  durationLabel: string;
  thumbnailUrl: string;
  status: SceneStudioPublicationStatus;
  statusLabel: string;
  publishedLabel: string;
  visibility: SceneStudioVisibility;
  views: number;
  comments: number;
  completionPercent: number | null;
  rightsReady: boolean;
  tvStatus?: "requested" | "scheduled" | "broadcast";
  isRoomReplay?: boolean;
  isVertical?: boolean;
};

export type SceneStudioComment = {
  id: string;
  author: string;
  avatarUrl: string;
  body: string;
  contentTitle: string;
  dateLabel: string;
  likes: number;
  replied: boolean;
  pinned?: boolean;
  reported?: boolean;
  question?: boolean;
};

export const SCENE_STUDIO_SECTIONS: readonly {
  id: SceneStudioSectionId;
  label: string;
  path: string;
}[] = [
  { id: "dashboard", label: "Vue d’ensemble", path: "/scene/studio" },
  { id: "content", label: "Contenus", path: "/scene/studio/content" },
  { id: "analytics", label: "Analyses", path: "/scene/studio/analytics" },
  { id: "comments", label: "Commentaires", path: "/scene/studio/comments" },
  { id: "playlists", label: "Playlists", path: "/scene/studio/playlists" },
  { id: "rights", label: "Droits & collaborations", path: "/scene/studio/rights" },
  { id: "tv", label: "MeeWav TV", path: "/scene/studio/tv" },
] as const;

const thumbnails = [
  "/images/shorts/catalog-v2/vocal-pop-urbaine-blue-hour.webp",
  "/images/shorts/community/community-producer-bedroom.webp",
  "/images/shorts/community/community-purple-performance.webp",
  "/images/shorts/catalog/live-maeva-acoustic.webp",
  "/images/shorts/community/community-vocal-booth.webp",
  "/images/shorts/community/community-songwriter-night.webp",
  "/images/shorts/catalog-v2/tv-performance-multicam.webp",
  "/images/shorts/catalog/live-azur-band.webp",
  "/images/shorts/community/community-acoustic-guitar.webp",
  "/images/shorts/community/community-urban-rap.webp",
] as const;

function content(
  id: string,
  title: string,
  format: string,
  status: SceneStudioPublicationStatus,
  statusLabel: string,
  publishedLabel: string,
  views: number,
  comments: number,
  completionPercent: number | null,
  thumbnailIndex: number,
  options: Partial<SceneStudioContentItem> = {},
): SceneStudioContentItem {
  return {
    id,
    title,
    format,
    durationLabel: "3:42",
    thumbnailUrl: thumbnails[thumbnailIndex % thumbnails.length],
    status,
    statusLabel,
    publishedLabel,
    visibility: status === "scheduled" ? "Programmé" : status === "draft" ? "Privé" : "Public",
    views,
    comments,
    completionPercent,
    rightsReady: true,
    ...options,
  };
}

/** Investor-ready creator account. Counts intentionally match every Studio surface. */
export const SCENE_STUDIO_DEMO_CONTENT: readonly SceneStudioContentItem[] = [
  content("sous-la-lumiere-naya-k", "Sous la lumière | MeeWav Session", "Session · Soul contemporaine", "published", "Publié", "7 août 2026 · 20:00", 48_200, 328, 76, 0, { publicSlug: "sous-la-lumiere-naya-k", tvStatus: "scheduled" }),
  content("a-contretemps", "À contretemps", "Clip · Paysage", "published", "Publié", "4 août 2026 · 18:15", 31_840, 214, 72, 1),
  content("sans-filet-live", "Sans filet — Live Session", "Performance · Paysage", "published", "Publié", "29 juillet 2026", 22_760, 167, 69, 2, { tvStatus: "broadcast" }),
  content("journal-studio-03", "Journal studio — Épisode 03", "Coulisses · Paysage", "published", "Publié", "24 juillet 2026", 16_420, 96, 64, 3),
  content("room-minuit-replay", "Session minuit — Replay de Room", "Replay de Room · Paysage", "published", "Publié", "18 juillet 2026", 13_880, 132, 61, 4, { isRoomReplay: true, tvStatus: "broadcast" }),
  content("refrain-vertical", "Le refrain avant la scène", "Short · Soul", "published", "Publié", "12 juillet 2026", 11_690, 84, 81, 5, { durationLabel: "0:48", isVertical: true }),
  content("voix-nue-vertical", "Voix nue — une prise", "Short · A cappella", "published", "Publié", "8 juillet 2026", 9_470, 61, 79, 6, { durationLabel: "0:57", isVertical: true }),
  content("lignes-de-fuite", "Lignes de fuite", "Clip · Paysage", "published", "Publié", "1 juillet 2026", 7_920, 49, 66, 7),
  content("maquettes-01", "Premières maquettes", "Studio · Paysage", "published", "Publié", "21 juin 2026", 6_540, 41, 63, 8),
  content("derriere-le-texte", "Derrière le texte", "Interview · Paysage", "published", "Publié", "14 juin 2026", 4_860, 32, 58, 9),
  content("passage-suspendu", "Passage suspendu", "Performance · Paysage", "published", "Publié", "8 juin 2026", 3_920, 27, 62, 0),
  content("nuit-grenoble", "Nuit sur Grenoble", "Clip · Paysage", "published", "Publié", "30 mai 2026", 2_880, 22, 55, 1),
  content("acoustique-lumiere", "Sous la lumière — acoustique", "Session · Acoustique", "published", "Publié", "17 mai 2026", 2_120, 19, 73, 2),
  content("carnet-01", "Carnet de création — 01", "Coulisses · Paysage", "published", "Publié", "2 mai 2026", 1_760, 14, 60, 3),
  content("trois-maquettes", "Trois maquettes, une direction", "Studio · Paysage", "scheduled", "Programmé", "10 août 2026 · 19:00", 0, 0, null, 4),
  content("live-toit", "Live sur les toits", "Performance · Paysage", "scheduled", "Programmé", "14 août 2026 · 20:30", 0, 0, null, 5, { tvStatus: "requested" }),
  content("demo-04", "Démo 04 — à renommer", "Brouillon · Audio visualizer", "draft", "Brouillon", "Modifié il y a 2 h", 0, 0, null, 6, { visibility: "Privé", rightsReady: false }),
  content("lignes-croisees", "Lignes croisées — avec Maeva Sol", "Collaboration · Brouillon", "draft", "Brouillon", "Modifié hier", 0, 0, null, 7, { visibility: "Privé", rightsReady: false }),
  content("repetition-08", "Répétition 08", "Performance · Brouillon", "draft", "Brouillon", "Modifié vendredi", 0, 0, null, 8, { visibility: "Privé" }),
  content("avant-la-scene", "Une minute avant la scène", "Short · Coulisses", "processing", "Traitement 72 %", "Qualités HD en préparation", 0, 0, null, 9, { durationLabel: "0:58", visibility: "Privé", rightsReady: false, isVertical: true }),
] as const;

export const SCENE_STUDIO_COMMENTS: readonly SceneStudioComment[] = [
  { id: "comment-alya", author: "Alya Flow", avatarUrl: "/images/messaging/avatars/avatar_2.png", body: "La prise de voix est magnifique. Une version acoustique est prévue ?", contentTitle: "Sous la lumière", dateLabel: "Il y a 12 min", likes: 42, replied: false, question: true },
  { id: "comment-isaac", author: "Isaac Low", avatarUrl: "/images/messaging/avatars/avatar_4.png", body: "Le passage à 1:42 m’a donné envie de réécouter tout le titre.", contentTitle: "À contretemps", dateLabel: "Il y a 38 min", likes: 18, replied: false },
  { id: "comment-maeva", author: "Maeva Sol", avatarUrl: "/images/messaging/avatars/avatar_3.png", body: "Merci pour les crédits complets 🤍", contentTitle: "Lignes croisées", dateLabel: "Il y a 1 h", likes: 11, replied: true, pinned: true },
  { id: "comment-report", author: "Compte signalé", avatarUrl: "/images/messaging/avatars/avatar_6.png", body: "Commentaire masqué pendant son examen.", contentTitle: "Session minuit", dateLabel: "Hier", likes: 0, replied: false, reported: true },
] as const;

export const SCENE_STUDIO_OVERVIEW = {
  artistName: "Naya K.",
  periodLabel: "28 derniers jours",
  views: 184_200,
  viewsDelta: "+12 %",
  watchHours: 8_420,
  watchHoursDelta: "+8 %",
  newFollowers: 1_284,
  followersDelta: "+19 %",
  completionPercent: 68,
  completionDelta: "+3 pts",
  unansweredComments: 418,
  reportedComments: 3,
  pendingCollaborations: 2,
  playlistCount: 5,
  pastTvBroadcasts: 2,
} as const;

export function getSceneStudioSection(pathname: string): SceneStudioSectionId {
  const normalized = pathname.toLocaleLowerCase("fr-FR").replace(/\/+$/, "");
  if (normalized.includes("/studio/content")) return "content";
  if (normalized.endsWith("/analytics")) return "analytics";
  if (normalized.endsWith("/comments")) return "comments";
  if (normalized.endsWith("/playlists")) return "playlists";
  if (normalized.endsWith("/rights") || normalized.endsWith("/collaborations")) return "rights";
  if (normalized.endsWith("/tv")) return "tv";
  return "dashboard";
}

export function getSceneStudioContentId(pathname: string) {
  const marker = "/scene/studio/content/";
  const normalized = pathname.replace(/\/+$/, "");
  const index = normalized.toLocaleLowerCase("fr-FR").indexOf(marker);
  if (index < 0) return null;
  const value = normalized.slice(index + marker.length).split("/")[0];
  return value ? decodeURIComponent(value) : null;
}

export function getSceneStudioContent(contentId: string | null) {
  return contentId ? SCENE_STUDIO_DEMO_CONTENT.find(({ id }) => id === contentId) ?? null : null;
}

export function getSceneStudioVisibleContent(
  section: SceneStudioSectionId,
  items: readonly SceneStudioContentItem[] = SCENE_STUDIO_DEMO_CONTENT,
) {
  return section === "content" || section === "dashboard" ? items : [];
}

export function getSceneStudioSummary(items: readonly SceneStudioContentItem[] = SCENE_STUDIO_DEMO_CONTENT) {
  return {
    contentCount: items.length,
    publishedCount: items.filter(({ status }) => status === "published").length,
    draftCount: items.filter(({ status }) => status === "draft").length,
    processingCount: items.filter(({ status }) => status === "processing" || status === "uploading").length,
    scheduledCount: items.filter(({ status }) => status === "scheduled").length,
    rightsToCompleteCount: items.filter(({ rightsReady }) => !rightsReady).length,
    totalViews: items.reduce((total, item) => total + item.views, 0),
  };
}
