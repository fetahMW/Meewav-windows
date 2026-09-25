export const ROOMS_HOME_ROOM_TYPES = [
  "cage",
  "wave",
  "place",
  "classe",
  "loge",
  "scene",
] as const;

export type RoomsHomeRoomType = (typeof ROOMS_HOME_ROOM_TYPES)[number];

export const ROOMS_HOME_MEDIA_FORMATS = ["horizontal", "vertical"] as const;

export type RoomsHomeMediaFormat = (typeof ROOMS_HOME_MEDIA_FORMATS)[number];

export const ROOMS_HOME_FORMAT_FILTERS = ["all", ...ROOMS_HOME_MEDIA_FORMATS] as const;

export type RoomsHomeFormatFilter = (typeof ROOMS_HOME_FORMAT_FILTERS)[number];

export type RoomsHomeAccessType = "public" | "members" | "invitation";

export type RoomsHomeRoom = {
  id: string;
  slug: string;
  title: string;
  roomType: RoomsHomeRoomType;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  hostRole: string;
  musicStyle: string;
  thumbnail: string;
  videoSource: string;
  mediaFormat: RoomsHomeMediaFormat;
  viewerCount: number;
  buzzScore: number;
  recommendationScore: number;
  engagementScore: number;
  language: string;
  country: string;
  city?: string;
  tags: readonly string[];
  startedAt: string;
  isFollowedHost: boolean;
  accessType: RoomsHomeAccessType;
  isJoinable: boolean;
  gradeLevel?: 1 | 2 | 3 | 4 | 5 | 6;
};

export const ROOMS_HOME_COLLECTION_SLUGS = [
  "buzz-maintenant",
  "pour-toi",
  "artistes-en-room",
  "battles-qui-chauffent",
  "creations-collaborations",
  "apprendre-avec-les-artistes",
  "grands-rendez-vous",
] as const;

export type RoomsHomeCollectionSlug = (typeof ROOMS_HOME_COLLECTION_SLUGS)[number];

export type RoomsHomeCollectionDefinition = {
  id: RoomsHomeCollectionSlug;
  slug: RoomsHomeCollectionSlug;
  title: string;
  description: string;
  homeLimit: 10;
  cardSize: "featured" | "compact";
};
