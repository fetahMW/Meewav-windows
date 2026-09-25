import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";

export type MessagingTab = "messages" | "collabs" | "projects" | "groups";
export type MessagingSpace = "all" | MessagingTab;

export type MessagingSidebarItem = {
  key: string;
  id: string;
  space: MessagingTab;
  name: string;
  avatar: string;
  role: string;
  status: string;
  preview: string;
  time: string;
  online?: boolean;
  unread?: number;
  gradeLevel?: number;
};

export type DemoMessageKind =
  | "text"
  | "audio"
  | "audio-file"
  | "track-pack"
  | "brief"
  | "image"
  | "video"
  | "file";

export type DemoMessage = {
  id: string;
  sourceId?: string;
  author: "me" | "them";
  kind: DemoMessageKind;
  body: string;
  time: string;
  duration?: string;
  bpm?: number;
  musicalKey?: string;
  tracks?: string[];
  trackDurations?: string[];
  trackMediaUrls?: string[];
  size?: string;
  reactions?: string[];
  replyToId?: string;
  pinned?: boolean;
  deleted?: boolean;
  forwardedFrom?: string;
  fileName?: string;
  fileType?: string;
  mediaUrl?: string;
  dayLabel?: string;
  previewProgress?: number;
  compactAudio?: boolean;
  showcaseRole?: "sent" | "reply" | "voice" | "feature";
  /** Private server files. Their URL is deliberately resolved only on demand. */
  attachments?: MessagingAttachmentViewModel[];
};

export type DemoContact = {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  online: boolean;
  role: string;
  status?: string;
  gradeLevel?: number;
};

export type DemoConversation = {
  collaborationRequestId?: string | null;
  id: string;
  name: string;
  handle: string;
  role: string;
  avatar: string;
  status: string;
  online: boolean;
  gradeLevel?: number;
  pinned?: boolean;
  muted?: boolean;
  unread: number;
  preview: string;
  time: string;
  messages: DemoMessage[];
  showcaseMessageIds?: string[];
  conversationKind?: "direct" | "group" | "project";
  /**
   * Present only when the thread is intentionally kept as readable history
   * but can no longer receive new messages (for example, a deleted account).
   */
  readOnlyReason?: string;
};

export type DemoCollabAttachmentType = "audio" | "image" | "video" | "pdf" | "file";

export type DemoCollabAttachment = {
  id: string;
  type: DemoCollabAttachmentType;
  url: string;
  fileName: string;
  fileSize: number;
  durationSeconds?: number;
  thumbnailUrl?: string;
  bpm?: number;
  musicalKey?: string;
  /** Present for a live attachment; `url` then stays empty until user intent. */
  serverAttachment?: MessagingAttachmentViewModel;
};

export type DemoCollabSentState = "unread" | "read" | "accepted" | "rejected";
export type DemoCollabAcceptedState = "inProgress" | "completed" | "cancelled";

export type DemoCollab = {
  id: string;
  userId: string;
  name: string;
  role: string;
  avatar: string;
  verified: boolean;
  message: string;
  meta: string;
  rank: number;
  gradeLevel?: number;
  genre?: string;
  mood?: string;
  status: "pending" | "sent" | "accepted";
  isReceived: boolean;
  requestStatus: "pending" | "accepted" | "rejected";
  sentState?: DemoCollabSentState;
  acceptedState?: DemoCollabAcceptedState;
  attachments: DemoCollabAttachment[];
  origin?: "globe" | "demo";
  requestSource?: import("./messaging.route").MessagingOriginSource;
  senderProfileId?: string;
  recipientProfileId?: string;
  createdAt?: string;
};

const avatarsRoot = "/images/messaging/avatars";

type RelativeMessageTime = {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
};

function relativeMessageTime({ days = 0, hours = 0, minutes = 0, seconds = 0 }: RelativeMessageTime) {
  const elapsed = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  return new Date(Date.now() - elapsed).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// Reprise exacte de `mockUsers` dans le prototype Flutter. Les conversations
// de groupe n'appartiennent volontairement pas à ce carnet de contacts.
export const demoContacts: DemoContact[] = [
  { id: "user_1", username: "echo_flow", displayName: "Echo Flow", avatar: `${avatarsRoot}/avatar_1.png`, online: true, role: "Artiste", status: "En studio", gradeLevel: 4 },
  { id: "user_2", username: "neon_pulse", displayName: "Neon Pulse", avatar: `${avatarsRoot}/avatar_2.png`, online: false, role: "Beatmaker", status: "Dispo pour collab", gradeLevel: 3 },
  { id: "user_3", username: "stellar_vibe", displayName: "Stellar Vibe", avatar: `${avatarsRoot}/avatar_3.png`, online: true, role: "DJ / Producteur", gradeLevel: 4 },
  { id: "user_4", username: "lisa_music", displayName: "Lisa Music", avatar: `${avatarsRoot}/avatar_4.png`, online: false, role: "Mixeur", gradeLevel: 2 },
  { id: "user_5", username: "the_producer", displayName: "The Producer", avatar: `${avatarsRoot}/avatar_5.png`, online: true, role: "Producteur", status: "En mix", gradeLevel: 5 },
  { id: "user_6", username: "vocal_queen", displayName: "Vocal Queen", avatar: `${avatarsRoot}/avatar_6.png`, online: false, role: "Artiste / Auteur", gradeLevel: 3 },
];

const baseDemoConversations: DemoConversation[] = [
  {
    id: "echo-flow",
    name: "Echo Flow",
    handle: "@echo_flow",
    role: "Artiste",
    avatar: `${avatarsRoot}/avatar_1.png`,
    status: "En ligne sur le Globe",
    online: true,
    gradeLevel: 4,
    pinned: true,
    unread: 2,
    preview: "Merci ! J'ai encore quelques ajustements à faire sur le mix.",
    time: "5 min",
    showcaseMessageIds: ["msg_6", "msg_7", "msg_5", "msg_8"],
    messages: [
      { id: "msg_old_1", author: "them", kind: "text", body: "Yo ! T'es dispo pour bosser sur un projet ?", time: relativeMessageTime({ days: 3, hours: 14 }), dayLabel: "Il y a 3 jours" },
      { id: "msg_old_2", author: "me", kind: "text", body: "Salut ! Ouais carrément, c'est quoi le délire ?", time: relativeMessageTime({ days: 3, hours: 13, minutes: 50 }) },
      { id: "msg_old_3", author: "them", kind: "text", body: "J'ai un artiste qui cherche un beat trap/drill, ambiance sombre", time: relativeMessageTime({ days: 3, hours: 13, minutes: 45 }) },
      { id: "msg_old_4", author: "them", kind: "text", body: "Tu penses pouvoir faire quelque chose ?", time: relativeMessageTime({ days: 3, hours: 13, minutes: 44 }) },
      { id: "msg_old_5", author: "me", kind: "text", body: "Ah ouais ça me parle ! Tu veux quel BPM à peu près ?", time: relativeMessageTime({ days: 3, hours: 13, minutes: 30 }) },
      { id: "msg_old_6", author: "them", kind: "text", body: "Autour de 140 BPM, avec des 808 bien lourdes", time: relativeMessageTime({ days: 3, hours: 13, minutes: 25 }) },
      { id: "msg_old_7", author: "me", kind: "text", body: "Ok, je m'occupe de ça demain matin !", time: relativeMessageTime({ days: 3, hours: 13, minutes: 20 }) },

      { id: "msg_mid_1", author: "me", kind: "text", body: "J'ai avancé sur le squelette de la prod, je t'envoie ça", time: relativeMessageTime({ days: 1, hours: 10 }), dayLabel: "Hier" },
      { id: "msg_mid_2", author: "them", kind: "text", body: "Lourd ! Hâte d'entendre ça.", time: relativeMessageTime({ days: 1, hours: 9, minutes: 55 }) },
      { id: "msg_mid_3", author: "me", kind: "text", body: "Est-ce qu'on ajoute une guitare mélancolique en fond ?", time: relativeMessageTime({ days: 1, hours: 9, minutes: 30 }) },
      { id: "msg_mid_4", author: "them", kind: "text", body: "Pourquoi pas, faut voir si ça surcharge pas trop le mix.", time: relativeMessageTime({ days: 1, hours: 9, minutes: 15 }) },
      { id: "msg_mid_5", author: "me", kind: "text", body: "Je vais tester deux versions, une avec et une sans.", time: relativeMessageTime({ days: 1, hours: 8, minutes: 45 }) },
      { id: "msg_mid_6", author: "them", kind: "text", body: "Ça marche ! Tiens-moi au jus dès que t'as un export.", time: relativeMessageTime({ days: 1, hours: 8, minutes: 30 }) },

      { id: "msg_today_1", author: "me", kind: "text", body: "Finalement la guitare c'est une tuerie ! Ça change tout.", time: relativeMessageTime({ hours: 4 }), dayLabel: "Aujourd’hui" },
      { id: "msg_today_2", author: "them", kind: "text", body: "Ah ouais ? Carrément alors !", time: relativeMessageTime({ hours: 3, minutes: 55 }) },
      { id: "msg_today_3", author: "them", kind: "text", body: "T'as pu boucler le mixage des drums ?", time: relativeMessageTime({ hours: 3, minutes: 40 }) },
      { id: "msg_today_4", author: "me", kind: "text", body: "Presque, je finalise les kicks là.", time: relativeMessageTime({ hours: 3, minutes: 30 }) },
      { id: "msg_today_5", author: "me", kind: "text", body: "C'est vraiment lourd ce que ça donne.", time: relativeMessageTime({ hours: 3, minutes: 20 }) },
      { id: "msg_today_6", author: "them", kind: "text", body: "Parfait, on est dans les temps.", time: relativeMessageTime({ hours: 3, minutes: 10 }) },
      { id: "msg_today_7", author: "them", kind: "text", body: "On se fait une petite session d'écoute ce soir ?", time: relativeMessageTime({ hours: 2, minutes: 50 }) },
      { id: "msg_today_8", author: "me", kind: "text", body: "Yes vers 21h c'est bon pour moi.", time: relativeMessageTime({ hours: 2, minutes: 40 }) },
      { id: "msg_today_9", author: "them", kind: "text", body: "Vendu ! Je t'envoie le lien Zoom tout à l'heure.", time: relativeMessageTime({ hours: 2, minutes: 30 }) },
      { id: "msg_today_10", author: "me", kind: "text", body: "Ça roule.", time: relativeMessageTime({ hours: 2, minutes: 10 }) },

      // Le prototype Flutter réutilise ces deux IDs. Une clé React unique est
      // conservée tout en gardant l'ID source pour la parité des données.
      { id: "msg_old_6_duplicate", sourceId: "msg_old_6", author: "them", kind: "text", body: "Entre 140 et 150, il aime bien quand ça tape", time: relativeMessageTime({ days: 3, hours: 13, minutes: 25 }), dayLabel: "Il y a 3 jours" },
      { id: "msg_old_7_duplicate", sourceId: "msg_old_7", author: "me", kind: "text", body: "Nickel je vais te faire un truc de malade 🔥", time: relativeMessageTime({ days: 3, hours: 13, minutes: 20 }) },

      { id: "msg_old_8", author: "me", kind: "text", body: "J'ai commencé à bosser dessus hier soir", time: relativeMessageTime({ days: 2, hours: 10 }), dayLabel: "Il y a 2 jours" },
      { id: "msg_old_9", author: "me", kind: "audio-file", body: "beat_draft_v1.wav", duration: "2:15", bpm: 142, musicalKey: "Dm", time: relativeMessageTime({ days: 2, hours: 9, minutes: 55 }) },
      { id: "msg_old_10", author: "me", kind: "text", body: "C'est juste un premier jet, dis-moi ce que t'en penses", time: relativeMessageTime({ days: 2, hours: 9, minutes: 50 }) },
      { id: "msg_old_11", author: "them", kind: "text", body: "Frère c'est déjà lourd 😍", time: relativeMessageTime({ days: 2, hours: 8 }) },
      { id: "msg_old_12", author: "them", kind: "text", body: "Par contre tu peux rajouter un peu plus de basse ?", time: relativeMessageTime({ days: 2, hours: 7, minutes: 55 }) },
      { id: "msg_old_13", author: "them", kind: "audio", body: "voice_feedback.m4a", duration: "0:45", time: relativeMessageTime({ days: 2, hours: 7, minutes: 50 }) },
      { id: "msg_old_14", author: "me", kind: "text", body: "Ok je vois ce que tu veux dire, je m'en occupe", time: relativeMessageTime({ days: 2, hours: 6 }) },

      { id: "msg_old_15", author: "me", kind: "text", body: "Yo ! J'ai retravaillé le beat", time: relativeMessageTime({ days: 1, hours: 15 }), dayLabel: "Hier" },
      { id: "msg_old_16", author: "me", kind: "audio-file", body: "beat_v2_bass_boost.wav", duration: "2:30", bpm: 142, musicalKey: "Dm", time: relativeMessageTime({ days: 1, hours: 14, minutes: 55 }) },
      { id: "msg_old_17", author: "them", kind: "text", body: "Oooh la basse maintenant elle claque !", time: relativeMessageTime({ days: 1, hours: 12 }), replyToId: "msg_old_16", reactions: ["🎧 1"] },
      { id: "msg_old_18", author: "them", kind: "text", body: "L'artiste a validé, il kiffe grave", time: relativeMessageTime({ days: 1, hours: 11, minutes: 50 }) },
      { id: "msg_old_19", author: "them", kind: "text", body: "Il veut juste un petit changement sur le drop", time: relativeMessageTime({ days: 1, hours: 11, minutes: 45 }) },
      { id: "msg_old_20", author: "me", kind: "text", body: "Ah cool ! C'est quoi le changement ?", time: relativeMessageTime({ days: 1, hours: 10 }) },
      { id: "msg_old_21", author: "them", kind: "text", body: "Il voudrait un effet de montée plus long avant le drop, genre 8 mesures", time: relativeMessageTime({ days: 1, hours: 9, minutes: 50 }) },
      { id: "msg_old_22", author: "me", kind: "text", body: "Ça marche je fais ça ce soir", time: relativeMessageTime({ days: 1, hours: 9 }) },
      { id: "msg_old_23", author: "them", kind: "text", body: "T'es un boss 💪", time: relativeMessageTime({ days: 1, hours: 8, minutes: 55 }), reactions: ["🔥 1"] },

      { id: "msg_1", author: "them", kind: "text", body: "Salut ! Tu as avancé sur le projet ?", time: relativeMessageTime({ hours: 2 }), dayLabel: "Aujourd’hui" },
      { id: "msg_2", author: "me", kind: "text", body: "Hey ! Oui, j'ai bossé sur le beat hier soir. Je t'envoie ça.", time: relativeMessageTime({ hours: 1, minutes: 55 }) },
      { id: "msg_3", author: "me", kind: "audio-file", body: "beat_v3_master.wav", duration: "3:28", bpm: 145, musicalKey: "Fm", time: relativeMessageTime({ hours: 1, minutes: 50 }) },
      { id: "msg_4", author: "them", kind: "text", body: "Écoute à 1:32, le drop est incroyable 🔥", time: relativeMessageTime({ hours: 1, minutes: 30 }), replyToId: "msg_3", reactions: ["🔥 1"] },
      { id: "msg_5", author: "them", kind: "audio", body: "voice_note.m4a", duration: "0:18", time: "01:41", previewProgress: 44, compactAudio: true, showcaseRole: "voice" },
      { id: "msg_6", author: "me", kind: "text", body: "Merci ! J'ai encore quelques ajustements à faire sur le mix. Je te renvoie la version finale demain.", time: "01:14", showcaseRole: "sent" },
      { id: "msg_7", author: "them", kind: "text", body: "Parfait, j'ai hâte d'entendre ça ! 👀", time: "01:39", replyToId: "msg_6", reactions: ["🎧 1"], showcaseRole: "reply" },
      { id: "msg_8", author: "them", kind: "track-pack", body: "Track Pack", tracks: ["kick.wav", "synth_lead.wav", "vocals.wav"], trackDurations: ["2:45", "2:45", "2:30"], duration: "2:45", bpm: 128, musicalKey: "Am", time: "10:42", dayLabel: "Aujourd’hui", previewProgress: 48, showcaseRole: "feature" },
      { id: "msg_9", author: "me", kind: "track-pack", body: "Track Pack", tracks: ["drums.wav", "bass.wav", "melody.wav", "pads.wav"], trackDurations: ["3:28", "3:28", "3:28", "3:15"], duration: "3:28", bpm: 145, musicalKey: "Fm", time: relativeMessageTime({ minutes: 2 }) },
      { id: "msg_10", author: "them", kind: "text", body: "Woow les pistes séparées c'est parfait !", time: relativeMessageTime({ minutes: 1, seconds: 50 }), replyToId: "msg_9", reactions: ["✨ 1"] },
      { id: "msg_11", author: "them", kind: "text", body: "L'artiste va pouvoir mixer comme il veut", time: relativeMessageTime({ minutes: 1, seconds: 45 }) },
      { id: "msg_12", author: "me", kind: "text", body: "Ouais c'était le but ! Tu veux que je t'envoie aussi la version avec les FX ?", time: relativeMessageTime({ minutes: 1, seconds: 30 }) },
      { id: "msg_13", author: "them", kind: "audio", body: "voice_yes.m4a", duration: "0:08", time: relativeMessageTime({ minutes: 1, seconds: 20 }) },
      { id: "msg_14", author: "them", kind: "text", body: "Grave envoie tout ce que t'as", time: relativeMessageTime({ minutes: 1, seconds: 10 }) },
      { id: "msg_15", author: "me", kind: "audio", body: "voice_ok.m4a", duration: "0:05", time: relativeMessageTime({ minutes: 1 }) },
      { id: "msg_16", author: "me", kind: "text", body: "Je te prépare ça", time: relativeMessageTime({ seconds: 55 }) },
      { id: "msg_17", author: "me", kind: "audio-file", body: "beat_fx_version.wav", duration: "3:45", bpm: 145, musicalKey: "Fm", time: relativeMessageTime({ seconds: 50 }) },
      { id: "msg_18", author: "them", kind: "text", body: "Reçu ! 🙏", time: relativeMessageTime({ seconds: 40 }), reactions: ["✅ 1"] },
      { id: "msg_19", author: "them", kind: "text", body: "Au fait, t'es dispo samedi pour une session studio ?", time: relativeMessageTime({ seconds: 35 }) },
      { id: "msg_20", author: "me", kind: "text", body: "Samedi ça peut le faire, c'est où ?", time: relativeMessageTime({ seconds: 30 }) },
      { id: "msg_21", author: "them", kind: "text", body: "Au studio de Nova, tu connais ?", time: relativeMessageTime({ seconds: 25 }) },
      { id: "msg_22", author: "me", kind: "text", body: "Ah ouais le studio dans le 11ème ?", time: relativeMessageTime({ seconds: 20 }) },
      { id: "msg_23", author: "them", kind: "text", body: "Exactement ! On commence à 14h", time: relativeMessageTime({ seconds: 15 }) },
      { id: "msg_24", author: "me", kind: "text", body: "Parfait je serai là 👊", time: relativeMessageTime({ seconds: 10 }), reactions: ["✅ 1"] },
      { id: "msg_25", author: "them", kind: "audio", body: "voice_cool.m4a", duration: "0:03", time: relativeMessageTime({ seconds: 5 }) },
    ],
  },
  {
    id: "neon-pulse",
    name: "Neon Pulse",
    handle: "@neon_pulse",
    role: "Beatmaker",
    avatar: `${avatarsRoot}/avatar_2.png`,
    status: "En ligne sur La Scène",
    online: true,
    gradeLevel: 3,
    unread: 1,
    preview: "beat_v2_final.wav",
    time: "1 h",
    messages: [
      { id: "neon-1", author: "them", kind: "audio", body: "beat_v2_final.wav", duration: "3:45", bpm: 140, musicalKey: "Am", time: "13:06" },
    ],
  },
  {
    id: "album-2025",
    name: "Projet Album 2025",
    handle: "3 membres",
    role: "Groupe de production",
    avatar: `${avatarsRoot}/avatar_3.png`,
    status: "Session active dans Projets",
    online: true,
    pinned: true,
    unread: 0,
    preview: "Le mix est prêt, je t'envoie ça demain matin",
    time: "3 h",
    messages: [
      { id: "album-1", author: "them", kind: "text", body: "Le mix est prêt, je t'envoie ça demain matin", time: "11:24" },
    ],
  },
  {
    id: "lisa-music",
    name: "Lisa Music",
    handle: "@lisa_music",
    role: "Mixeur",
    avatar: `${avatarsRoot}/avatar_4.png`,
    status: "Vue hier à 23:18",
    online: false,
    gradeLevel: 2,
    unread: 0,
    preview: "voice_note.m4a",
    time: "Hier",
    messages: [
      { id: "lisa-1", author: "them", kind: "audio", body: "Note vocale", duration: "0:32", time: "Hier, 23:18" },
    ],
  },
  {
    id: "the-producer",
    name: "The Producer",
    handle: "@the_producer",
    role: "Producteur",
    avatar: `${avatarsRoot}/avatar_5.png`,
    status: "En live dans les Rooms",
    online: true,
    gradeLevel: 5,
    unread: 0,
    preview: "On se fait une session studio la semaine prochaine ?",
    time: "2 j",
    messages: [
      { id: "producer-1", author: "them", kind: "text", body: "On se fait une session studio la semaine prochaine ?", time: "Mardi, 18:40" },
    ],
  },
  {
    id: "cover-design",
    name: "Cover Design",
    handle: "2 membres",
    role: "Groupe créatif",
    avatar: `${avatarsRoot}/avatar_6.png`,
    status: "En ligne sur le Marketplace",
    online: true,
    muted: true,
    unread: 0,
    preview: "cover_artwork.jpg",
    time: "3 j",
    messages: [
      { id: "cover-1", author: "them", kind: "image", body: "cover_artwork.jpg", fileName: "cover_artwork.jpg", fileType: "Image", time: "Dimanche, 16:12" },
    ],
  },
  {
    id: "mix-master-club",
    name: "Mix & Master Club",
    handle: "6 membres",
    role: "Groupe",
    avatar: "/images/messaging/groups/group_5.png",
    status: "Équipe active dans Groupes",
    online: true,
    unread: 0,
    preview: "Nouveau : Guide mastering analogique",
    time: "5 j",
    messages: [
      { id: "mix-master-1", author: "them", kind: "text", body: "Nouveau : Guide mastering analogique", time: "Vendredi, 19:42" },
    ],
  },
  {
    id: "nova-beats",
    name: "Nova Beats",
    handle: "@nova_beats",
    role: "Beatmaker",
    avatar: `${avatarsRoot}/avatar_7.png`,
    status: "En ligne sur le Globe",
    online: true,
    gradeLevel: 3,
    unread: 3,
    preview: "J'ai chopé un sample de fou pour le prochain beat",
    time: "12 min",
    messages: [
      { id: "nova-1", author: "them", kind: "text", body: "J'ai chopé un sample de fou pour le prochain beat", time: "12:04" },
    ],
  },
  {
    id: "kira-wave",
    name: "Kira Wave",
    handle: "@kira_wave",
    role: "Chanteuse / Topline",
    avatar: `${avatarsRoot}/avatar_3.png`,
    status: "Vue il y a 20 min",
    online: false,
    gradeLevel: 4,
    unread: 1,
    preview: "voice_topline_v2.m4a",
    time: "40 min",
    messages: [
      { id: "kira-1", author: "them", kind: "audio", body: "voice_topline_v2.m4a", duration: "0:41", time: "11:52" },
    ],
  },
  {
    id: "deep-delay",
    name: "Deep Delay",
    handle: "@deep_delay",
    role: "Ingénieur son",
    avatar: `${avatarsRoot}/avatar_5.png`,
    status: "En session dans les Rooms",
    online: true,
    gradeLevel: 5,
    unread: 0,
    preview: "Le stem de batterie est prêt, je te l'envoie",
    time: "2 h",
    messages: [
      { id: "delay-1", author: "them", kind: "text", body: "Le stem de batterie est prêt, je te l'envoie", time: "10:37" },
    ],
  },
  {
    id: "session-drill",
    name: "Session Drill",
    handle: "4 membres",
    role: "Groupe de travail",
    avatar: "/images/messaging/groups/group_2.png",
    status: "Session prévue dans Projets",
    online: true,
    unread: 5,
    preview: "On calle la session à 18h vendredi ?",
    time: "4 h",
    messages: [
      { id: "drill-1", author: "them", kind: "text", body: "On calle la session à 18h vendredi ?", time: "08:41" },
    ],
  },
  {
    id: "velvet-keys",
    name: "Velvet Keys",
    handle: "@velvet_keys",
    role: "Claviériste",
    avatar: `${avatarsRoot}/avatar_1.png`,
    status: "Vue hier à 21:02",
    online: false,
    gradeLevel: 2,
    unread: 0,
    preview: "J'ai enregistré trois accords Rhodes pour ton morceau",
    time: "Hier",
    messages: [
      { id: "velvet-1", author: "them", kind: "audio-file", body: "rhodes_chords_v1.wav", duration: "1:12", bpm: 92, musicalKey: "Cm", time: "Hier, 21:02" },
    ],
  },
  {
    id: "solar-drift",
    name: "Solar Drift",
    handle: "@solar_drift",
    role: "DJ / Producteur",
    avatar: "/images/messaging/groups/group_4.png",
    status: "En ligne sur La Scène",
    online: true,
    gradeLevel: 4,
    unread: 0,
    preview: "Ton set de vendredi était lourd, on en refait un ?",
    time: "1 j",
    messages: [
      { id: "solar-1", author: "them", kind: "text", body: "Ton set de vendredi était lourd, on en refait un ?", time: "Dimanche, 22:15" },
    ],
  },
];

type PremiumConversationContent = Pick<
  DemoConversation,
  "messages" | "preview" | "time" | "unread" | "showcaseMessageIds"
>;

const premiumConversationContent: Partial<Record<string, PremiumConversationContent>> = {
  "album-2025": {
    unread: 0,
    preview: "Le mix est prêt, je t’envoie ça demain matin",
    time: "3 h",
    messages: [
      { id: "album-01", author: "them", kind: "text", body: "Point rapide : il nous reste trois titres à verrouiller avant la session d’écoute.", time: "09:18", dayLabel: "Lundi" },
      { id: "album-02", author: "me", kind: "text", body: "Je peux finaliser les transitions de deux titres aujourd’hui. Le troisième mérite encore une décision sur le tempo.", time: "09:24" },
      { id: "album-03", author: "them", kind: "brief", body: "Objectif album : cohérence nocturne, voix au premier plan, basses profondes mais lisibles. Chaque morceau doit garder sa personnalité sans casser le voyage global.", time: "09:31" },
      { id: "album-04", author: "me", kind: "file", body: "Roadmap_Album_2025.pdf", fileName: "Roadmap_Album_2025.pdf", fileType: "PDF · 2,4 Mo", time: "09:42", reactions: ["✅ 2"] },
      { id: "album-05", author: "them", kind: "text", body: "La roadmap est claire. On valide l’ordre proposé et on garde l’interlude avant le dernier titre.", time: "10:03", replyToId: "album-04" },
      { id: "album-06", author: "me", kind: "track-pack", body: "Album 2025 — Direction A", tracks: ["drums.wav", "bass.wav", "violin.wav", "vocals.wav", "fx.wav"], trackDurations: ["4:12", "4:12", "4:12", "4:08", "4:12"], duration: "4:12", bpm: 118, musicalKey: "Cm", size: "176,3 Mo", time: "10:16", previewProgress: 52 },
      { id: "album-07", author: "them", kind: "audio", body: "retour_ecoute_collective.m4a", duration: "0:31", time: "10:39", compactAudio: true, previewProgress: 47 },
      { id: "album-08", author: "me", kind: "text", body: "Je note : moins de largeur sur les chœurs et une fin plus courte. Je vous renvoie un bounce avant 18 h.", time: "10:48", replyToId: "album-07" },
      { id: "album-09", author: "them", kind: "text", body: "Le nouveau bounce tient beaucoup mieux avec le reste de l’album.", time: "11:02", dayLabel: "Aujourd’hui" },
      { id: "album-10", author: "them", kind: "image", body: "sequence_album_v4.png", fileName: "Sequence_Album_V4.png", fileType: "PNG · 2,1 Mo", mediaUrl: "/images/messaging/groups/group_3.png", time: "11:08" },
      { id: "album-11", author: "me", kind: "text", body: "Validé pour la séquence. Je garde le silence de deux secondes entre les pistes 7 et 8.", time: "11:16", reactions: ["🎧 2"] },
      { id: "album-12", author: "them", kind: "text", body: "Le mix est prêt, je t’envoie ça demain matin.", time: "11:24", reactions: ["✨ 1"] },
    ],
  },
  "neon-pulse": {
    unread: 1,
    preview: "beat_v2_final.wav",
    time: "1 h",
    messages: [
      { id: "neon-01", author: "them", kind: "text", body: "J’ai refait les drums en gardant plus d’air autour de la caisse claire.", time: "12:42", dayLabel: "Hier" },
      { id: "neon-02", author: "them", kind: "audio-file", body: "beat_v2_final.wav", fileName: "beat_v2_final.wav", duration: "3:45", bpm: 140, musicalKey: "Am", size: "64,2 Mo", time: "13:06", previewProgress: 54 },
      { id: "neon-03", author: "me", kind: "text", body: "Le rebond est meilleur. La 808 prend encore un peu trop de place sur les notes longues.", time: "13:18", replyToId: "neon-02" },
      { id: "neon-04", author: "them", kind: "text", body: "Je peux raccourcir la release et laisser le sub uniquement sur le refrain.", time: "13:24" },
      { id: "neon-05", author: "me", kind: "audio", body: "idee_placement_808.m4a", duration: "0:17", time: "13:31", compactAudio: true, previewProgress: 39 },
      { id: "neon-06", author: "them", kind: "track-pack", body: "Neon Pulse — Drum Kit V2", tracks: ["kick.wav", "snare.wav", "hats.wav", "perc.wav", "808.wav"], trackDurations: ["3:45", "3:45", "3:45", "3:45", "3:45"], duration: "3:45", bpm: 140, musicalKey: "Am", size: "92,7 Mo", time: "13:46", previewProgress: 61 },
      { id: "neon-07", author: "me", kind: "text", body: "Le kit est propre. Je prends la deuxième snare et le hat ouvert du dernier refrain.", time: "14:02", reactions: ["🎧 1"] },
      { id: "neon-08", author: "them", kind: "file", body: "notes_808_v2.txt", fileName: "Notes_808_V2.txt", fileType: "TXT · 18 Ko", time: "14:11" },
      { id: "neon-09", author: "me", kind: "text", body: "Parfait, les notes sont claires. Je teste la version courte cet après-midi.", time: "14:18", replyToId: "neon-08" },
      { id: "neon-10", author: "them", kind: "text", body: "Je reste dispo si tu veux une variation plus sèche sur le pont 🔊", time: "14:26", reactions: ["✅ 1"] },
    ],
  },
  "the-producer": {
    unread: 0,
    preview: "On se fait une session studio la semaine prochaine ?",
    time: "2 j",
    messages: [
      { id: "producer-01", author: "them", kind: "text", body: "On se fait une session studio la semaine prochaine ?", time: "18:40", dayLabel: "Mardi" },
      { id: "producer-02", author: "me", kind: "text", body: "Oui. Mardi ou jeudi après 14 h, avec une préférence pour jeudi.", time: "18:46" },
      { id: "producer-03", author: "them", kind: "brief", body: "Session : écrire un refrain, enregistrer une guide et repartir avec une structure complète. Couleur soul électronique, tempo entre 108 et 114 BPM.", time: "18:53" },
      { id: "producer-04", author: "me", kind: "text", body: "Je prépare deux suites d’accords et une banque de textures pour ne pas perdre de temps en arrivant.", time: "19:02" },
      { id: "producer-05", author: "them", kind: "audio", body: "idee_session_studio.m4a", duration: "0:24", time: "19:08", compactAudio: true, previewProgress: 49 },
      { id: "producer-06", author: "me", kind: "file", body: "Session_Plan_Thursday.pdf", fileName: "Session_Plan_Thursday.pdf", fileType: "PDF · 640 Ko", time: "19:16", reactions: ["✅ 1"] },
      { id: "producer-07", author: "them", kind: "image", body: "studio_room_reference.jpg", fileName: "Studio_Room_Reference.jpg", fileType: "JPG · 2,7 Mo", mediaUrl: "/images/messaging/groups/group_1.png", time: "19:24" },
      { id: "producer-08", author: "me", kind: "text", body: "Jeudi 15 h est bloqué. J’apporte le contrôleur et les deux synthés compacts.", time: "19:31", replyToId: "producer-03", reactions: ["🎹 1"] },
    ],
  },
  "cover-design": {
    unread: 0,
    preview: "cover_artwork.jpg",
    time: "3 j",
    messages: [
      { id: "cover-01", author: "them", kind: "image", body: "cover_artwork.jpg", fileName: "cover_artwork.jpg", fileType: "JPG · 3,4 Mo", mediaUrl: "/images/V4/Direction artistique V2.png", time: "16:12", dayLabel: "Dimanche" },
      { id: "cover-02", author: "me", kind: "text", body: "La composition est forte. Le titre concurrence encore trop le portrait.", time: "16:18", replyToId: "cover-01" },
      { id: "cover-03", author: "them", kind: "image", body: "cover_artwork_type_small.jpg", fileName: "Cover_Artwork_Type_Small.jpg", fileType: "JPG · 3,2 Mo", mediaUrl: "/images/messaging/groups/group_2.png", time: "16:34" },
      { id: "cover-04", author: "me", kind: "text", body: "Cette échelle fonctionne mieux. Décale simplement le bloc de cinq pixels vers le bas.", time: "16:39", replyToId: "cover-03" },
      { id: "cover-05", author: "them", kind: "file", body: "Typography_Tests.pdf", fileName: "Typography_Tests.pdf", fileType: "PDF · 5,8 Mo", time: "16:52" },
      { id: "cover-06", author: "me", kind: "text", body: "Je choisis la variante 03. Elle reste lisible en miniature sans perdre le côté éditorial.", time: "17:01", reactions: ["✨ 1"] },
      { id: "cover-07", author: "them", kind: "text", body: "Parfait. Je prépare les exports streaming, presse et réseaux.", time: "17:09" },
      { id: "cover-08", author: "me", kind: "text", body: "Validé. Garde aussi une version sans texte pour les teasers.", time: "17:16", reactions: ["✅ 2"] },
    ],
  },
  "mix-master-club": {
    unread: 0,
    preview: "Nouveau : Guide mastering analogique",
    time: "5 j",
    messages: [
      { id: "mix-master-01", author: "them", kind: "text", body: "Nouveau : guide mastering analogique. J’ai résumé la chaîne et les niveaux de référence.", time: "19:42", dayLabel: "Vendredi" },
      { id: "mix-master-02", author: "them", kind: "file", body: "Guide_Mastering_Analogique.pdf", fileName: "Guide_Mastering_Analogique.pdf", fileType: "PDF · 6,3 Mo", time: "19:44", reactions: ["🎧 3"] },
      { id: "mix-master-03", author: "me", kind: "text", body: "La partie sur le headroom est très claire. Tu peux ajouter un exemple avant/après ?", time: "19:56", replyToId: "mix-master-02" },
      { id: "mix-master-04", author: "them", kind: "audio-file", body: "master_before_after.wav", fileName: "Master_Before_After.wav", duration: "1:36", bpm: 122, musicalKey: "Dm", size: "31,8 Mo", time: "20:08", previewProgress: 50 },
      { id: "mix-master-05", author: "me", kind: "text", body: "La différence est nette sans être spectaculaire artificiellement. C’est exactement le bon exemple.", time: "20:17", replyToId: "mix-master-04", reactions: ["✅ 1"] },
      { id: "mix-master-06", author: "them", kind: "track-pack", body: "Mastering A/B — Analog Chain", tracks: ["premaster.wav", "master_a.wav", "master_b.wav"], trackDurations: ["3:32", "3:32", "3:32"], duration: "3:32", bpm: 122, musicalKey: "Dm", size: "148,5 Mo", time: "20:25", previewProgress: 50 },
      { id: "mix-master-07", author: "me", kind: "text", body: "Je préfère le master B : transitoires plus propres et bas médium moins encombré.", time: "20:39", replyToId: "mix-master-06" },
      { id: "mix-master-08", author: "them", kind: "brief", body: "Cible du prochain test : -9 LUFS intégré, true peak à -1 dBTP, grave stable en mono et aucun élargissement au-dessus de 12 kHz.", time: "20:47" },
      { id: "mix-master-09", author: "me", kind: "text", body: "Reçu. Je fournis un prémaster sans limiteur et une référence niveau-matched.", time: "20:55" },
      { id: "mix-master-10", author: "them", kind: "text", body: "Parfait. On publie le comparatif dans le groupe après la session de demain.", time: "21:03", reactions: ["✨ 2"] },
    ],
  },
};

export const demoConversations: DemoConversation[] = baseDemoConversations.map((conversation) => {
  const premiumContent = premiumConversationContent[conversation.id];
  return premiumContent ? { ...conversation, ...premiumContent } : conversation;
});

const baseDemoCollabs: DemoCollab[] = [
  {
    id: "collab_1",
    userId: "collab_user_1",
    name: "Ghost Synth",
    role: "Beatmaker",
    avatar: "https://i.pravatar.cc/150?img=11",
    verified: true,
    message: "Salut ! J'ai une prod trap/drill qui collerait parfaitement avec ton flow. 140 BPM, ambiance sombre. Tu serais chaud pour poser dessus ? J'ai déjà quelques idées de structure.",
    meta: "2h",
    rank: 5,
    gradeLevel: 5,
    genre: "Trap / Drill",
    mood: "Ambiance sombre",
    status: "pending",
    isReceived: true,
    requestStatus: "pending",
    attachments: [{ id: "attach_1", type: "audio", url: "https://example.com/beat_drill.wav", fileName: "Drill_Beat_140bpm.wav", fileSize: 8500000, durationSeconds: 204, bpm: 140, musicalKey: "Am" }],
  },
  {
    id: "collab_2",
    userId: "collab_user_2",
    name: "Ruby Resonance",
    role: "Chanteuse",
    avatar: "https://i.pravatar.cc/150?img=12",
    verified: false,
    message: "Hey ! J'adore ton dernier titre. Je suis chanteuse et je pense que ma voix pourrait apporter un truc sur ton prochain projet. Voici une démo de ce que je fais.",
    meta: "5h",
    rank: 3,
    gradeLevel: 3,
    genre: "R&B / Soul",
    mood: "Voix aérienne",
    status: "pending",
    isReceived: true,
    requestStatus: "pending",
    attachments: [
      { id: "attach_2", type: "audio", url: "https://example.com/vocal_demo.mp3", fileName: "Vocal_Demo_Luna.mp3", fileSize: 4200000, durationSeconds: 105, bpm: 95, musicalKey: "F" },
      { id: "attach_3", type: "pdf", url: "https://example.com/portfolio.pdf", fileName: "Portfolio_Luna_Voice.pdf", fileSize: 2100000 },
    ],
  },
  { id: "collab_3", userId: "collab_user_3", name: "Kinetic Flow", role: "Danseur / Chorégraphe", avatar: "https://i.pravatar.cc/150?img=13", verified: true, message: "Yo ! Je suis chorégraphe et ton morceau \"Night Drive\" est parfait pour une chorée. J'ai déjà fait un teaser, regarde !", meta: "1j", rank: 4, gradeLevel: 4, genre: "Dance / Performance", mood: "Énergie nocturne", status: "pending", isReceived: true, requestStatus: "pending", attachments: [{ id: "attach_4", type: "video", url: "assets/shortfictive/shortf2.mp4", fileName: "Choreo_Teaser.mp4", fileSize: 15000000, durationSeconds: 45, thumbnailUrl: "assets/shortfictive/thumb2.jpg" }] },
  { id: "collab_6", userId: "collab_user_6", name: "SkyVox", role: "Rappeur", avatar: "https://i.pravatar.cc/150?img=16", verified: true, message: "Wesh frérot ! J'ai kiffé ta dernière instru. J'ai un projet mixtape en cours, ça te dit de poser un couplet ? On pourrait faire un truc de fou !", meta: "12h", rank: 4, gradeLevel: 4, genre: "Rap / Mixtape", mood: "Session studio", status: "pending", isReceived: true, requestStatus: "pending", attachments: [] },
  { id: "collab_7", userId: "collab_user_7", name: "MixMaster Pro", role: "Ingénieur son", avatar: "https://i.pravatar.cc/150?img=17", verified: true, message: "Salut ! J'ai écouté tes prods et je pense pouvoir les sublimer avec un mix pro. Je te propose une session mix gratuite pour qu'on voit si ça colle.", meta: "2j", rank: 5, gradeLevel: 5, genre: "Mix / Mastering", mood: "Son premium", status: "pending", isReceived: true, requestStatus: "pending", attachments: [{ id: "attach_8", type: "audio", url: "https://example.com/mix_demo.mp3", fileName: "Before_After_Mix.mp3", fileSize: 6800000, durationSeconds: 135 }] },
  { id: "collab_4", userId: "collab_user_4", name: "PixelArt Studio", role: "Graphiste / DA", avatar: "https://i.pravatar.cc/150?img=14", verified: false, message: "Salut ! J'ai vu ton travail et j'aimerais qu'on bosse ensemble sur ma prochaine cover d'album. Tu fais des trucs incroyables.", meta: "8h", rank: 2, status: "sent", isReceived: false, requestStatus: "pending", sentState: "read", attachments: [{ id: "attach_5", type: "image", url: "https://example.com/reference.jpg", fileName: "Reference_Visuelle.jpg", fileSize: 1800000, thumbnailUrl: "https://i.pravatar.cc/300?img=21" }, { id: "attach_6", type: "audio", url: "https://example.com/single.mp3", fileName: "Single_Preview.mp3", fileSize: 5500000, durationSeconds: 178, bpm: 128, musicalKey: "Dm" }] },
  { id: "collab_8", userId: "collab_user_8", name: "Neon Dreams", role: "Producteur électro", avatar: "https://i.pravatar.cc/150?img=18", verified: false, message: "Hey ! Je bosse sur un EP électro et j'adorerais avoir tes voix sur un track. Tu serais dispo pour une session ?", meta: "1j", rank: 3, status: "sent", isReceived: false, requestStatus: "pending", sentState: "unread", attachments: [{ id: "attach_9", type: "audio", url: "https://example.com/electro_demo.mp3", fileName: "Electro_Track_WIP.mp3", fileSize: 7200000, durationSeconds: 252, bpm: 126, musicalKey: "Em" }] },
  { id: "collab_9", userId: "collab_user_9", name: "VibeSetter", role: "Auteur-compositeur", avatar: "https://i.pravatar.cc/150?img=19", verified: false, message: "Salut ! J'ai écrit des textes qui pourraient matcher avec ton style. Ça te dit qu'on se fasse une session d'écriture ?", meta: "3j", rank: 2, status: "sent", isReceived: false, requestStatus: "pending", sentState: "rejected", attachments: [{ id: "attach_10", type: "pdf", url: "https://example.com/lyrics.pdf", fileName: "Paroles_Sample.pdf", fileSize: 450000 }] },
  { id: "collab_10", userId: "collab_user_10", name: "StudioX", role: "Studio d'enregistrement", avatar: "https://i.pravatar.cc/150?img=20", verified: true, message: "Hello ! On a un créneau dispo ce mois-ci pour un enregistrement. Ça t'intéresse de venir poser chez nous ?", meta: "5j", rank: 5, status: "sent", isReceived: false, requestStatus: "pending", sentState: "accepted", attachments: [] },
  { id: "collab_5", userId: "collab_user_5", name: "Bass Monster", role: "Producteur", avatar: "https://i.pravatar.cc/150?img=15", verified: true, message: "Bro, j'ai un projet fou. EP de 5 titres, full bass music. Tu serais partant pour co-prod ?", meta: "3j", rank: 5, status: "accepted", isReceived: true, requestStatus: "accepted", acceptedState: "inProgress", attachments: [{ id: "attach_7", type: "audio", url: "https://example.com/demo_ep.mp3", fileName: "EP_Demo_Preview.mp3", fileSize: 12000000, durationSeconds: 312, bpm: 150, musicalKey: "G#m" }] },
  { id: "collab_11", userId: "collab_user_1", name: "Ghost Synth", role: "Beatmaker", avatar: "https://i.pravatar.cc/150?img=11", verified: true, message: "On avait parlé d'un feat l'année dernière, voilà enfin le beat !", meta: "15j", rank: 5, status: "accepted", isReceived: true, requestStatus: "accepted", acceptedState: "completed", attachments: [{ id: "attach_11", type: "audio", url: "https://example.com/collab_beat.mp3", fileName: "Collab_Beat_Final.mp3", fileSize: 9500000, durationSeconds: 225, bpm: 132, musicalKey: "Cm" }] },
  { id: "collab_12", userId: "collab_user_7", name: "MixMaster Pro", role: "Ingénieur son", avatar: "https://i.pravatar.cc/150?img=17", verified: true, message: "Je te mixe ton prochain single, on avait dit ça !", meta: "7j", rank: 5, status: "accepted", isReceived: false, requestStatus: "accepted", acceptedState: "inProgress", attachments: [] },
  { id: "collab_13", userId: "collab_user_3", name: "Kinetic Flow", role: "Danseur / Chorégraphe", avatar: "https://i.pravatar.cc/150?img=13", verified: true, message: "Chorégraphie pour le clip de \"Midnight\"", meta: "30j", rank: 4, status: "accepted", isReceived: true, requestStatus: "accepted", acceptedState: "cancelled", attachments: [{ id: "attach_12", type: "video", url: "assets/shortfictive/shortf3.mp4", fileName: "Choreo_Final.mp4", fileSize: 22000000, durationSeconds: 90, thumbnailUrl: "assets/shortfictive/thumb3.jpg" }] },
];

// Local showcase only; authenticated responses never include these fixtures.
const collabWallArtists = [
  ["Maya Keys", "Claviériste", "House", "Une boucle au piano, quelques accords suspendus… Il ne manque que ta voix.", "House_124BPM_A_minor", "House_FullMix_A_124BPM_8bars.wav", 124, "Am"],
  ["Nox Avenue", "Producteur", "Drill", "Je te propose cette prod pour un couplet à deux. Écoute le changement sur le refrain.", "Drill_142BPM_F_minor", "Drill_FullMix_A_142BPM_8bars.wav", 142, "Fm"],
  ["Amara Blue", "Auteure-compositrice", "Afro", "Un groove solaire pour notre prochaine session. On construit le refrain ensemble ?", "Afro_100BPM_A_minor", "Afro_FullMix_A_100BPM_8bars.wav", 100, "Am"],
  ["Léo Motion", "DJ / Producteur", "House", "Je prépare un live et je cherche une voix pour cette nouvelle version.", "House_124BPM_A_minor", "House_FullMix_A_124BPM_8bars.wav", 124, "Am"],
  ["Sélène", "Chanteuse", "Zouk", "J’ai une idée de topline sur cette instru. Dis-moi si tu ressens la même ambiance.", "Zouk_92BPM_G_minor", "Zouk_FullMix_A_92BPM_8bars.wav", 92, "Gm"],
  ["Eden Tape", "Beatmaker", "Trap", "Une texture sombre et un refrain très ouvert. J’aimerais te faire essayer dessus.", "Trap_150BPM_C_minor", "Trap_FullMix_A_150BPM_8bars.wav", 150, "Cm"],
  ["Sacha Waves", "Multi-instrumentiste", "Afro", "On part de cette base et on enregistre des instruments ensemble en Room ?", "Afro_100BPM_A_minor", "Afro_FullMix_A_100BPM_8bars.wav", 100, "Am"],
] as const;

const collabWallAudioSizes: Record<string, number> = {
  "House_FullMix_A_124BPM_8bars.wav": 2731396,
  "Drill_FullMix_A_142BPM_8bars.wav": 2385168,
  "Afro_FullMix_A_100BPM_8bars.wav": 3386924,
  "Zouk_FullMix_A_92BPM_8bars.wav": 3681432,
  "Trap_FullMix_A_150BPM_8bars.wav": 2257964
};

export const demoCollabs: DemoCollab[] = [
  ...baseDemoCollabs.map((collab, index) => ({
    ...collab,
    avatar: `/images/preprofile/portraits/profile-${String(index + 1).padStart(2, "0")}.webp`,
  })),
  ...collabWallArtists.map(([name, role, genre, message, folder, fileName, bpm, musicalKey], index): DemoCollab => ({
    id: `collab_wall_${index + 1}`, userId: `collab_wall_artist_${index + 1}`,
    name, role, genre, message, verified: false, rank: 3, gradeLevel: 3,
    avatar: `/images/preprofile/portraits/profile-${index + 15}.webp`,
    meta: `${index + 1} h`, status: "pending", isReceived: true, requestStatus: "pending", origin: "demo",
    attachments: [{ id: `collab_wall_audio_${index + 1}`, type: "audio", fileName,
      url: `/audio/rooms/wave-test-pack/${folder}/Loops_8bars/${fileName}`,
      fileSize: collabWallAudioSizes[fileName], durationSeconds: 32 * 60 / bpm, bpm, musicalKey }],
  })),
];
