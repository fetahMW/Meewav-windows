import {
  ALL_SHORTS_VIDEOS,
  SHORTS_WALLS,
  type ShortsVideoItem,
} from "../../shorts/shorts-wall-data";
import type {
  SceneTvChannel,
  SceneTvGuide,
  SceneTvGuideProgram,
  SceneTvProgramFormat,
  SceneTvProgramSource,
  SceneTvProgramSourceKind,
  SceneTvSourceFormat,
} from "./sceneTvGuide.models";
import {
  addDaysToDateKey,
  getDateKeyInTimeZone,
  zonedDateTimeToTimestamp,
} from "./sceneTvGuide.engine";

export const SCENE_TV_MAIN_CHANNEL_ID = "meewav-main" as const;
export const SCENE_TV_TIME_ZONE = "Europe/Paris";

const FIXTURE_REFERENCE_NOW = new Date();
const FIXTURE_TODAY_KEY = getDateKeyInTimeZone(
  FIXTURE_REFERENCE_NOW,
  SCENE_TV_TIME_ZONE,
) ?? "2026-08-08";

export const SCENE_TV_GUIDE_START_DATE = FIXTURE_TODAY_KEY;
export const SCENE_TV_GUIDE_DEMO_NOW = new Date(
  zonedDateTimeToTimestamp(FIXTURE_TODAY_KEY, "20:12:00", SCENE_TV_TIME_ZONE)
    ?? FIXTURE_REFERENCE_NOW.getTime(),
);

const SLOT_BLUEPRINTS = [
  { startsAt: "00:00", durationMinutes: 120, label: "Sélection nocturne", format: "documentary_night" },
  { startsAt: "02:00", durationMinutes: 120, label: "Best of MeeWav", format: "best_of" },
  { startsAt: "04:00", durationMinutes: 120, label: "Sessions nocturnes", format: "replay" },
  { startsAt: "06:00", durationMinutes: 120, label: "Morning Selection", format: "session" },
  { startsAt: "08:00", durationMinutes: 75, label: "Session du matin", format: "session" },
  { startsAt: "09:15", durationMinutes: 60, label: "La Relève", format: "la_releve" },
  { startsAt: "10:15", durationMinutes: 105, label: "Focus style", format: "style_focus" },
  { startsAt: "12:00", durationMinutes: 60, label: "Carte blanche", format: "carte_blanche" },
  { startsAt: "13:00", durationMinutes: 90, label: "Connexion", format: "connexion" },
  { startsAt: "14:30", durationMinutes: 90, label: "Focus ville", format: "city_focus" },
  { startsAt: "16:00", durationMinutes: 120, label: "MeeWav Info", format: "meewav_info" },
  { startsAt: "18:00", durationMinutes: 120, label: "Replay publié", format: "replay" },
  { startsAt: "20:00", durationMinutes: 90, label: "Première", format: "premiere" },
  { startsAt: "21:30", durationMinutes: 30, label: "Official Statement", format: "official_statement" },
  { startsAt: "22:00", durationMinutes: 120, label: "Nuit documentaire", format: "documentary_night" },
] as const satisfies readonly {
  startsAt: string;
  durationMinutes: number;
  label: string;
  format: SceneTvProgramFormat;
}[];

const CITY_THEMES = [
  "Casablanca",
  "Dakar",
  "Paris",
  "Marseille",
  "Bruxelles",
  "Montréal",
  "Rabat",
] as const;

const STYLE_THEMES = [
  "Soul contemporaine",
  "Rap Maghreb",
  "Amapiano",
  "Jazz moderne",
  "Électro hybride",
  "Raï nouvelle génération",
  "Afrobeat",
] as const;

function programmeTitle(
  format: SceneTvProgramFormat,
  source: SceneTvProgramSource,
  dayIndex: number,
) {
  if (source.kind === "room-simulcast") {
    return `MeeWav Sessions en direct — ${source.artistName}`;
  }
  const city = CITY_THEMES[dayIndex % CITY_THEMES.length];
  const style = STYLE_THEMES[dayIndex % STYLE_THEMES.length];
  switch (format) {
    case "session": return `MeeWav Sessions — ${source.artistName}`;
    case "la_releve": return `La Relève — ${city}`;
    case "style_focus": return `Focus style — ${style}`;
    case "carte_blanche": return `Carte blanche à ${source.artistName}`;
    case "connexion": return `Connexions — ${source.artistName}`;
    case "city_focus": return `${city}, une scène`;
    case "meewav_info": return "MeeWav Info — Le point sur l’infrastructure";
    case "replay": return `Replay sélectionné — ${source.title}`;
    case "premiere": return `Première — ${source.title}`;
    case "official_statement": return "Déclaration MeeWav";
    case "documentary_night": return `Portrait de nuit — ${source.artistName}`;
    case "best_of": return `Best of MeeWav — ${source.artistName}`;
    case "filler": return `La Scène en continu — ${source.artistName}`;
  }
}

function parseDurationSeconds(duration: string) {
  const parts = duration.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function sourceKind(video: ShortsVideoItem): SceneTvProgramSourceKind {
  if (video.id.startsWith("replays-")) return "published-room-replay";
  if (video.id.startsWith("tv-")) return "meewav-original";
  return "scene-video";
}

function toSource(
  video: ShortsVideoItem,
  format: SceneTvSourceFormat,
  kind = sourceKind(video),
  roomId?: string,
): SceneTvProgramSource {
  return {
    id: `scene-source-${video.id}`,
    kind,
    format,
    publishedVideoId: video.id,
    title: video.title,
    artistId: video.artistId,
    artistName: video.artist,
    mediaUrl: video.video,
    thumbnailUrl: video.image,
    imageAlt: video.alt,
    durationSeconds: parseDurationSeconds(video.duration),
    gradeLevel: video.gradeLevel,
    roomId,
  };
}

const ORIGINAL_FORMATS: readonly SceneTvSourceFormat[] = [
  "session",
  "meewav-original",
  "documentary",
  "interview",
  "studio",
  "collaboration",
  "dance",
  "dj-set",
];

const TRENDING_FORMATS: readonly SceneTvSourceFormat[] = [
  "clip",
  "performance",
  "freestyle",
  "dance",
  "cover",
];

const COLLABORATION_FORMATS: readonly SceneTvSourceFormat[] = [
  "collaboration",
  "studio",
  "behind-the-scenes",
  "session",
];

const DISCOVERY_FORMATS: readonly SceneTvSourceFormat[] = [
  "clip",
  "performance",
  "session",
  "dj-set",
  "interview",
  "documentary",
];

function cycleFormat(formats: readonly SceneTvSourceFormat[], index: number) {
  return formats[index % formats.length];
}

const originalSources = SHORTS_WALLS.tv.items.slice(0, 30).map((video, index) => (
  toSource(video, cycleFormat(ORIGINAL_FORMATS, index), "meewav-original")
));

const replaySources = SHORTS_WALLS.replays.items.slice(0, 30).map((video) => (
  toSource(video, "room-replay", "published-room-replay")
));

const trendingSources = SHORTS_WALLS.trending.items.slice(0, 30).map((video, index) => (
  toSource(video, cycleFormat(TRENDING_FORMATS, index), "scene-video")
));

const collaborationSources = SHORTS_WALLS.collaborations.items.slice(0, 30).map((video, index) => (
  toSource(video, cycleFormat(COLLABORATION_FORMATS, index), "scene-video")
));

const discoverySources = SHORTS_WALLS["for-you"].items.slice(0, 30).map((video, index) => (
  index === 0
    ? toSource(video, "session", "room-simulcast", "room-tv-session-cuivres")
    : toSource(video, cycleFormat(DISCOVERY_FORMATS, index), "scene-video")
));

export const SCENE_TV_GUIDE_SOURCES_FIXTURE: readonly SceneTvProgramSource[] = [
  ...originalSources,
  ...replaySources,
  ...trendingSources,
  ...collaborationSources,
  ...discoverySources,
];

const fallbackSource = SCENE_TV_GUIDE_SOURCES_FIXTURE[0];

export const SCENE_TV_CHANNELS_FIXTURE: readonly SceneTvChannel[] = [{
  id: SCENE_TV_MAIN_CHANNEL_ID,
  slug: "meewav-main",
  name: "MeeWav TV",
  description: "La chaîne éditoriale 100 % musique de La Scène.",
  timeZone: SCENE_TV_TIME_ZONE,
  fallbackSourceId: fallbackSource.id,
  fallbackBlockMinutes: 30,
  fallbackFormat: "filler",
}];

function localParisIso(dateKey: string, time: string) {
  const timestamp = zonedDateTimeToTimestamp(
    dateKey,
    `${time}:00`,
    SCENE_TV_TIME_ZONE,
  );
  if (timestamp === null) throw new Error(`Invalid MeeWav TV local slot: ${dateKey} ${time}`);
  return new Date(timestamp).toISOString();
}

function sourceForSlot(dayIndex: number, slotIndex: number, format: SceneTvProgramFormat) {
  if (dayIndex === 5 && format === "premiere") {
    return SCENE_TV_GUIDE_SOURCES_FIXTURE.find((source) => source.kind === "room-simulcast")
      ?? SCENE_TV_GUIDE_SOURCES_FIXTURE[0];
  }
  const matchingSources = SCENE_TV_GUIDE_SOURCES_FIXTURE.filter((source) => {
    if (format === "replay") return source.kind === "published-room-replay";
    if (
      format === "premiere"
      || format === "meewav_info"
      || format === "official_statement"
      || format === "documentary_night"
      || format === "best_of"
      || format === "filler"
    ) {
      return source.kind === "meewav-original";
    }
    if (format === "carte_blanche" || format === "connexion") {
      return source.publishedVideoId.startsWith("collaborations-");
    }
    if (format === "session") return source.format === "session" || source.format === "performance";
    return source.kind === "scene-video";
  });
  const pool = matchingSources.length > 0 ? matchingSources : SCENE_TV_GUIDE_SOURCES_FIXTURE;
  return pool[(dayIndex * 3 + slotIndex) % pool.length];
}

function formatForSlot(format: SceneTvProgramFormat, dayIndex: number) {
  // A declaration officielle is exceptional. The same short slot carries
  // MeeWav Info on ordinary days so the antenna never fabricates a daily crisis.
  if (format === "official_statement" && dayIndex % 7 !== 4) return "meewav_info";
  return format;
}

export function createSceneTvGuidePrograms(
  startDate = SCENE_TV_GUIDE_START_DATE,
  dayCount = 14,
): SceneTvGuideProgram[] {
  return Array.from({ length: Math.max(0, Math.floor(dayCount)) }, (_, dayIndex) => {
    const dateKey = addDaysToDateKey(startDate, dayIndex) ?? startDate;
    return SLOT_BLUEPRINTS.map((slot, slotIndex): SceneTvGuideProgram => {
      const format = formatForSlot(slot.format, dayIndex);
      const source = sourceForSlot(dayIndex, slotIndex, format);
      const startsAt = localParisIso(dateKey, slot.startsAt);
      const nextSlot = SLOT_BLUEPRINTS[slotIndex + 1];
      const nextDateKey = addDaysToDateKey(dateKey, 1) ?? dateKey;
      const endsAt = nextSlot
        ? localParisIso(dateKey, nextSlot.startsAt)
        : localParisIso(nextDateKey, "00:00");
      return {
        id: `${SCENE_TV_MAIN_CHANNEL_ID}-${dateKey}-${String(slotIndex + 1).padStart(2, "0")}`,
        channelId: SCENE_TV_MAIN_CHANNEL_ID,
        sourceId: source.id,
        format,
        title: programmeTitle(format, source, dayIndex),
        description: source.kind === "room-simulcast"
          ? `${source.title}. Une Room spéciale retransmise temporairement sur l’antenne officielle MeeWav TV.`
          : `${source.title}. Une sélection éditoriale publiée dans La Scène avec ${source.artistName}.`,
        startsAt,
        endsAt,
        editorialLabel: source.kind === "room-simulcast"
          ? "Événement en direct"
          : (format === slot.format ? slot.label : "MeeWav Info"),
        isPremiere: format === "premiere" && dayIndex % 2 === 0,
        isExclusive: source.kind === "meewav-original",
        isLive: source.kind === "room-simulcast",
      };
    });
  }).flat();
}

export function createSceneTvGuideProgramsAround(
  referenceNow: Date | string | number,
  dayCount = 14,
  daysBefore = 0,
) {
  const referenceDateKey = getDateKeyInTimeZone(referenceNow, SCENE_TV_TIME_ZONE);
  if (!referenceDateKey) return [];
  const startDate = addDaysToDateKey(referenceDateKey, -Math.max(0, Math.floor(daysBefore)))
    ?? referenceDateKey;
  return createSceneTvGuidePrograms(startDate, dayCount);
}

export const SCENE_TV_PROGRAMS_14_DAY_FIXTURE = createSceneTvGuideProgramsAround(
  FIXTURE_REFERENCE_NOW,
);

export const SCENE_TV_GUIDE_FIXTURE: SceneTvGuide = {
  channels: SCENE_TV_CHANNELS_FIXTURE,
  sources: SCENE_TV_GUIDE_SOURCES_FIXTURE,
  programs: SCENE_TV_PROGRAMS_14_DAY_FIXTURE,
};

/** Ensures fixture sources remain backed by the canonical La Scène catalog. */
export const SCENE_TV_PUBLISHED_VIDEO_IDS = new Set(
  ALL_SHORTS_VIDEOS.map((video) => video.id),
);
