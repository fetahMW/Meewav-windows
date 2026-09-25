export type SceneTvChannelId = "meewav-main" | (string & {});

export type SceneTvProgramFormat =
  | "session"
  | "la_releve"
  | "carte_blanche"
  | "connexion"
  | "city_focus"
  | "style_focus"
  | "replay"
  | "premiere"
  | "meewav_info"
  | "official_statement"
  | "documentary_night"
  | "best_of"
  | "filler";

export type SceneTvSourceFormat =
  | "clip"
  | "performance"
  | "session"
  | "dj-set"
  | "freestyle"
  | "dance"
  | "cover"
  | "studio"
  | "behind-the-scenes"
  | "interview"
  | "documentary"
  | "collaboration"
  | "room-replay"
  | "meewav-original"
  | "interstitial";

export type SceneTvProgramSourceKind =
  | "scene-video"
  | "published-room-replay"
  | "meewav-original"
  | "room-simulcast";

export type SceneTvProgramSource = {
  id: string;
  kind: SceneTvProgramSourceKind;
  format: SceneTvSourceFormat;
  /** Identifier of the canonical on-demand publication in La Scène. */
  publishedVideoId: string;
  title: string;
  artistId: string;
  artistName: string;
  mediaUrl: string;
  thumbnailUrl: string;
  imageAlt: string;
  durationSeconds: number;
  gradeLevel: 1 | 2 | 3 | 4 | 5 | 6;
  /** Present only when the TV programme relays a Room owned by the Rooms pillar. */
  roomId?: string;
};

export type SceneTvChannel = {
  id: SceneTvChannelId;
  slug: string;
  name: string;
  description: string;
  timeZone: string;
  fallbackSourceId: string;
  fallbackBlockMinutes: number;
  fallbackFormat: SceneTvProgramFormat;
};

export type SceneTvGuideProgram = {
  id: string;
  channelId: SceneTvChannelId;
  sourceId: string;
  format: SceneTvProgramFormat;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  editorialLabel?: string;
  isPremiere?: boolean;
  isExclusive?: boolean;
  isLive?: boolean;
  /** True only for the synthetic continuity block returned by getFallbackProgram. */
  isFallback?: boolean;
};

export type SceneTvGuide = {
  channels: readonly SceneTvChannel[];
  sources: readonly SceneTvProgramSource[];
  programs: readonly SceneTvGuideProgram[];
};

export type SceneTvProgramQueryOptions = {
  channelId?: SceneTvChannelId;
};

export type SceneTvDayQueryOptions = SceneTvProgramQueryOptions & {
  timeZone?: string;
};
