import {
  SCENE_ARTIST_ROLE_OPTIONS,
  type SceneArtistRoleId,
} from "../../components/shared/avatar/profileIconCatalog";
import { GRADE_BADGES, type GradeLevel } from "../grades/gradeBadges";
import type { ShortsVideoItem } from "../shorts/shorts-wall-data";

export { SCENE_ARTIST_ROLE_OPTIONS };
export type SceneArtistRole = SceneArtistRoleId;

export const SCENE_CONTENT_TYPE_OPTIONS = [
  { id: "clip", label: "Clip" },
  { id: "performance", label: "Performance" },
  { id: "session", label: "Session" },
  { id: "dj-set", label: "DJ set" },
  { id: "freestyle", label: "Freestyle" },
  { id: "dance", label: "Danse" },
  { id: "cover", label: "Cover" },
  { id: "studio", label: "Studio" },
  { id: "behind-scenes", label: "Coulisses" },
  { id: "interview", label: "Interview" },
  { id: "documentary", label: "Documentaire" },
  { id: "collaboration", label: "Collaboration" },
  { id: "room-replay", label: "Replay de Room" },
  { id: "meewav-original", label: "MeeWav Original" },
] as const;

export type SceneContentType = (typeof SCENE_CONTENT_TYPE_OPTIONS)[number]["id"];

export const SCENE_STYLE_OPTIONS = [
  { id: "rap", label: "Rap" },
  { id: "hip-hop", label: "Hip-hop" },
  { id: "trap", label: "Trap" },
  { id: "rnb", label: "R&B" },
  { id: "soul", label: "Soul" },
  { id: "jazz", label: "Jazz" },
  { id: "afrobeat", label: "Afrobeat" },
  { id: "amapiano", label: "Amapiano" },
  { id: "rai", label: "Raï" },
  { id: "chaabi", label: "Chaâbi" },
  { id: "gnawa", label: "Gnawa" },
  { id: "pop", label: "Pop" },
  { id: "rock", label: "Rock" },
  { id: "metal", label: "Metal" },
  { id: "electro", label: "Électro" },
  { id: "house", label: "House" },
  { id: "techno", label: "Techno" },
  { id: "drum-and-bass", label: "Drum & Bass" },
  { id: "reggae", label: "Reggae" },
  { id: "reggaeton", label: "Reggaeton" },
  { id: "classical", label: "Classique" },
  { id: "neo-classical", label: "Néo-classique" },
  { id: "funk", label: "Funk" },
  { id: "blues", label: "Blues" },
  { id: "indie", label: "Indie" },
] as const;

export type SceneStyle = (typeof SCENE_STYLE_OPTIONS)[number]["id"];

export const SCENE_DURATION_OPTIONS = [
  { id: "under-1", label: "Moins de 1 min", minimumSeconds: 0, maximumSeconds: 60 },
  { id: "1-5", label: "1 à 5 min", minimumSeconds: 60, maximumSeconds: 300 },
  { id: "5-20", label: "5 à 20 min", minimumSeconds: 300, maximumSeconds: 1_200 },
  { id: "20-60", label: "20 à 60 min", minimumSeconds: 1_200, maximumSeconds: 3_600 },
  { id: "over-60", label: "Plus d’une heure", minimumSeconds: 3_600, maximumSeconds: null },
] as const;

export type SceneDuration = (typeof SCENE_DURATION_OPTIONS)[number]["id"];

export const SCENE_DATE_OPTIONS = [
  { id: "all", label: "Toutes les dates" },
  { id: "today", label: "Aujourd’hui" },
  { id: "week", label: "Cette semaine" },
  { id: "month", label: "Ce mois" },
  { id: "year", label: "Cette année" },
] as const;

export type SceneDate = (typeof SCENE_DATE_OPTIONS)[number]["id"];

export const SCENE_SORT_OPTIONS = [
  { id: "relevance", label: "Pertinence" },
  { id: "for-you", label: "Pour toi" },
  { id: "recent", label: "Récent" },
  { id: "most-viewed", label: "Plus regardé" },
  { id: "most-liked", label: "Plus apprécié" },
] as const;

export type SceneSort = (typeof SCENE_SORT_OPTIONS)[number]["id"];

export const SCENE_GRADE_OPTIONS = ([1, 2, 3, 4, 5, 6] as const).map((level) => ({
  id: level,
  label: GRADE_BADGES[level].label,
}));

export type ScenePublicationState = "published" | "draft" | "removed";

/**
 * Public video contract consumed by La Scène.
 *
 * A published replay is represented by `contentType: "room-replay"`. A Room
 * that is currently live does not belong to this contract: it stays in Rooms
 * until an explicit replay publication exists.
 */
export type SceneVideoRecord = {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  contentType: SceneContentType;
  presentationFormat: NonNullable<ShortsVideoItem["presentationFormat"]>;
  artistRoles: readonly SceneArtistRole[];
  styles: readonly SceneStyle[];
  durationSeconds: number;
  publicationState: ScenePublicationState;
  publishedAt?: string;
  country?: string;
  region?: string;
  city?: string;
  grade: GradeLevel;
  viewCount: number;
  likeCount: number;
  relevanceScore?: number;
  personalizationScore?: number;
  tags?: readonly string[];
};

export type SceneFilterState = {
  query: string;
  contentTypes: readonly SceneContentType[];
  artistRoles: readonly SceneArtistRole[];
  styles: readonly SceneStyle[];
  durations: readonly SceneDuration[];
  country: string;
  region: string;
  city: string;
  grades: readonly GradeLevel[];
  date: SceneDate;
  sort: SceneSort;
};

export type SceneRecommendationContext = {
  followedArtistIds?: readonly string[];
  preferredStyles?: readonly SceneStyle[];
  preferredCities?: readonly string[];
  recentlyViewedArtistIds?: readonly string[];
};

export type SceneFilterParseOptions = {
  defaultSort?: Extract<SceneSort, "relevance" | "for-you">;
};

export const SCENE_GUEST_DEFAULT_FILTERS: SceneFilterState = {
  query: "",
  contentTypes: [],
  artistRoles: [],
  styles: [],
  durations: [],
  country: "",
  region: "",
  city: "",
  grades: [],
  date: "all",
  sort: "relevance",
};

export const SCENE_PERSONALIZED_DEFAULT_FILTERS: SceneFilterState = {
  ...SCENE_GUEST_DEFAULT_FILTERS,
  sort: "for-you",
};

const CONTENT_TYPE_IDS = new Set<SceneContentType>(SCENE_CONTENT_TYPE_OPTIONS.map(({ id }) => id));
const ARTIST_ROLE_IDS = new Set<SceneArtistRole>(SCENE_ARTIST_ROLE_OPTIONS.map(({ key }) => key));
const STYLE_IDS = new Set<SceneStyle>(SCENE_STYLE_OPTIONS.map(({ id }) => id));
const DURATION_IDS = new Set<SceneDuration>(SCENE_DURATION_OPTIONS.map(({ id }) => id));
const DATE_IDS = new Set<SceneDate>(SCENE_DATE_OPTIONS.map(({ id }) => id));
const SORT_IDS = new Set<SceneSort>(SCENE_SORT_OPTIONS.map(({ id }) => id));
const GRADE_IDS = new Set<GradeLevel>(SCENE_GRADE_OPTIONS.map(({ id }) => id));

const SCENE_QUERY_KEYS = [
  "q",
  "type",
  "role",
  "style",
  "duration",
  "country",
  "region",
  "city",
  "grade",
  "date",
  "sort",
] as const;

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr");
}

function asSearchParams(input: string | URLSearchParams) {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  const queryStart = input.indexOf("?");
  const source = queryStart >= 0 ? input.slice(queryStart + 1) : input;
  return new URLSearchParams(source.split("#", 1)[0]);
}

function readMultiValue(params: URLSearchParams, key: string) {
  return params
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function uniqueValid<T extends string>(values: readonly string[], allowed: ReadonlySet<T>): T[] {
  return [...new Set(values.filter((value): value is T => allowed.has(value as T)))];
}

function validGrades(values: readonly string[]) {
  const grades = values
    .map(Number)
    .filter((value): value is GradeLevel => GRADE_IDS.has(value as GradeLevel));
  return [...new Set(grades)];
}

export function getSceneDefaultFilters(personalized = false): SceneFilterState {
  const defaults = personalized ? SCENE_PERSONALIZED_DEFAULT_FILTERS : SCENE_GUEST_DEFAULT_FILTERS;
  return {
    ...defaults,
    contentTypes: [],
    artistRoles: [],
    styles: [],
    durations: [],
    grades: [],
  };
}

export function parseSceneFilterSearch(
  input: string | URLSearchParams,
  options: SceneFilterParseOptions = {},
): SceneFilterState {
  const params = asSearchParams(input);
  const defaultSort = options.defaultSort ?? "relevance";
  const requestedDate = params.get("date") ?? "all";
  const requestedSort = params.get("sort") ?? defaultSort;

  return {
    query: (params.get("q") ?? "").trim(),
    contentTypes: uniqueValid(readMultiValue(params, "type"), CONTENT_TYPE_IDS),
    artistRoles: uniqueValid(readMultiValue(params, "role"), ARTIST_ROLE_IDS),
    styles: uniqueValid(readMultiValue(params, "style"), STYLE_IDS),
    durations: uniqueValid(readMultiValue(params, "duration"), DURATION_IDS),
    country: (params.get("country") ?? "").trim(),
    region: (params.get("region") ?? "").trim(),
    city: (params.get("city") ?? "").trim(),
    grades: validGrades(readMultiValue(params, "grade")),
    date: DATE_IDS.has(requestedDate as SceneDate) ? requestedDate as SceneDate : "all",
    sort: SORT_IDS.has(requestedSort as SceneSort) ? requestedSort as SceneSort : defaultSort,
  };
}

function appendValues(params: URLSearchParams, key: string, values: readonly string[]) {
  for (const value of values) params.append(key, value);
}

export function sceneFiltersToSearchParams(
  filters: SceneFilterState,
  options: SceneFilterParseOptions = {},
) {
  const params = new URLSearchParams();
  const defaultSort = options.defaultSort ?? "relevance";
  if (filters.query.trim()) params.set("q", filters.query.trim());
  appendValues(params, "type", filters.contentTypes);
  appendValues(params, "role", filters.artistRoles);
  appendValues(params, "style", filters.styles);
  appendValues(params, "duration", filters.durations);
  if (filters.country.trim()) params.set("country", filters.country.trim());
  if (filters.region.trim()) params.set("region", filters.region.trim());
  if (filters.city.trim()) params.set("city", filters.city.trim());
  appendValues(params, "grade", filters.grades.map(String));
  if (filters.date !== "all") params.set("date", filters.date);
  if (filters.sort !== defaultSort) params.set("sort", filters.sort);
  return params;
}

/** Preserves route parameters owned by the shell while replacing La Scène filters. */
export function mergeSceneFiltersIntoSearch(
  input: string | URLSearchParams,
  filters: SceneFilterState,
  options: SceneFilterParseOptions = {},
) {
  const params = asSearchParams(input);
  for (const key of SCENE_QUERY_KEYS) params.delete(key);
  const sceneParams = sceneFiltersToSearchParams(filters, options);
  sceneParams.forEach((value, key) => params.append(key, value));
  return params;
}

export function countActiveSceneFilters(
  filters: SceneFilterState,
  options: SceneFilterParseOptions = {},
) {
  const defaultSort = options.defaultSort ?? "relevance";
  return Number(Boolean(filters.query.trim()))
    + filters.contentTypes.length
    + filters.artistRoles.length
    + filters.styles.length
    + filters.durations.length
    + Number(Boolean(filters.country))
    + Number(Boolean(filters.region))
    + Number(Boolean(filters.city))
    + filters.grades.length
    + Number(filters.date !== "all")
    + Number(filters.sort !== defaultSort);
}

function durationMatches(durationSeconds: number, duration: SceneDuration) {
  const option = SCENE_DURATION_OPTIONS.find(({ id }) => id === duration);
  if (!option) return false;
  return durationSeconds >= option.minimumSeconds
    && (option.maximumSeconds === null || durationSeconds < option.maximumSeconds);
}

function dateCutoff(date: SceneDate, now: Date) {
  if (date === "all") return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (date === "today") return start.getTime();
  if (date === "week") {
    const daysSinceMonday = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - daysSinceMonday);
    return start.getTime();
  }
  if (date === "month") {
    start.setDate(1);
    return start.getTime();
  }
  start.setMonth(0, 1);
  return start.getTime();
}

function searchableText(video: SceneVideoRecord) {
  return normalizeText([
    video.title,
    video.artistName,
    video.contentType,
    ...video.artistRoles.flatMap((role) => {
      const option = SCENE_ARTIST_ROLE_OPTIONS.find(({ key }) => key === role);
      return option ? [option.label, ...option.filterTokens] : [role];
    }),
    ...video.styles,
    video.country ?? "",
    video.region ?? "",
    video.city ?? "",
    ...(video.tags ?? []),
  ].join(" "));
}

function locationMatches(actual: string | undefined, expected: string) {
  return !expected || normalizeText(actual ?? "") === normalizeText(expected);
}

export function filterSceneVideos(
  videos: readonly SceneVideoRecord[],
  filters: SceneFilterState,
  now = new Date(),
) {
  const queryTokens = normalizeText(filters.query).split(/\s+/).filter(Boolean);
  const cutoff = dateCutoff(filters.date, now);

  return videos.filter((video) => {
    if (video.publicationState !== "published") return false;
    const searchable = searchableText(video);
    if (queryTokens.some((token) => !searchable.includes(token))) return false;
    if (filters.contentTypes.length > 0 && !filters.contentTypes.includes(video.contentType)) return false;
    if (filters.artistRoles.length > 0 && !video.artistRoles.some((role) => filters.artistRoles.includes(role))) return false;
    if (filters.styles.length > 0 && !video.styles.some((style) => filters.styles.includes(style))) return false;
    if (filters.durations.length > 0 && !filters.durations.some((duration) => durationMatches(video.durationSeconds, duration))) return false;
    if (!locationMatches(video.country, filters.country)) return false;
    if (!locationMatches(video.region, filters.region)) return false;
    if (!locationMatches(video.city, filters.city)) return false;
    if (filters.grades.length > 0 && !filters.grades.includes(video.grade)) return false;
    if (cutoff !== null) {
      const publishedAt = video.publishedAt ? Date.parse(video.publishedAt) : Number.NaN;
      if (!Number.isFinite(publishedAt) || publishedAt < cutoff || publishedAt > now.getTime()) return false;
    }
    return true;
  });
}

function timestamp(video: SceneVideoRecord) {
  if (!video.publishedAt) return 0;
  const parsed = Date.parse(video.publishedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function queryRelevance(video: SceneVideoRecord, query: string) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return 0;
  const title = normalizeText(video.title);
  const artist = normalizeText(video.artistName);
  if (title === normalizedQuery) return 120;
  if (artist === normalizedQuery) return 110;
  if (title.startsWith(normalizedQuery)) return 80;
  if (artist.startsWith(normalizedQuery)) return 70;
  if (title.includes(normalizedQuery)) return 55;
  if (artist.includes(normalizedQuery)) return 45;
  return 10;
}

function personalizedScore(video: SceneVideoRecord, context: SceneRecommendationContext) {
  const followed = new Set(context.followedArtistIds ?? []);
  const recent = new Set(context.recentlyViewedArtistIds ?? []);
  const styles = new Set(context.preferredStyles ?? []);
  const cities = new Set((context.preferredCities ?? []).map(normalizeText));
  return (video.personalizationScore ?? 0)
    + (video.relevanceScore ?? 0)
    + (followed.has(video.artistId) ? 100 : 0)
    + (recent.has(video.artistId) ? 24 : 0)
    + (video.styles.some((style) => styles.has(style)) ? 36 : 0)
    + (video.city && cities.has(normalizeText(video.city)) ? 16 : 0);
}

function compareNumberDescending(left: number, right: number) {
  return right - left;
}

function diversifyAdjacentArtists(videos: readonly SceneVideoRecord[]) {
  const remaining = [...videos];
  const result: SceneVideoRecord[] = [];
  while (remaining.length > 0) {
    const previousArtist = result[result.length - 1]?.artistId;
    const nextIndex = previousArtist
      ? remaining.findIndex((video) => video.artistId !== previousArtist)
      : 0;
    result.push(...remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1));
  }
  return result;
}

export function sortSceneVideos(
  videos: readonly SceneVideoRecord[],
  filters: Pick<SceneFilterState, "query" | "sort">,
  context: SceneRecommendationContext = {},
) {
  const indexed = videos.map((video, index) => ({ video, index }));
  indexed.sort((left, right) => {
    let difference: number;
    if (filters.sort === "recent") {
      difference = compareNumberDescending(timestamp(left.video), timestamp(right.video));
    } else if (filters.sort === "most-viewed") {
      difference = compareNumberDescending(left.video.viewCount, right.video.viewCount);
    } else if (filters.sort === "most-liked") {
      difference = compareNumberDescending(left.video.likeCount, right.video.likeCount);
    } else if (filters.sort === "for-you") {
      difference = compareNumberDescending(
        personalizedScore(left.video, context),
        personalizedScore(right.video, context),
      );
    } else {
      difference = compareNumberDescending(
        (left.video.relevanceScore ?? 0) + queryRelevance(left.video, filters.query),
        (right.video.relevanceScore ?? 0) + queryRelevance(right.video, filters.query),
      );
    }
    if (difference !== 0) return difference;
    const recentDifference = compareNumberDescending(timestamp(left.video), timestamp(right.video));
    return recentDifference || left.index - right.index;
  });

  const sorted = indexed.map(({ video }) => video);
  return filters.sort === "relevance" || filters.sort === "for-you"
    ? diversifyAdjacentArtists(sorted)
    : sorted;
}

export function discoverSceneVideos(
  videos: readonly SceneVideoRecord[],
  filters: SceneFilterState,
  context: SceneRecommendationContext = {},
  now = new Date(),
) {
  return sortSceneVideos(filterSceneVideos(videos, filters, now), filters, context);
}

export function parseSceneDuration(duration: string) {
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3_600 + parts[1] * 60 + parts[2];
  return 0;
}

export function parseSceneViewCount(label: string) {
  const normalized = normalizeText(label).replace(/\s+/g, "");
  const match = normalized.match(/([0-9]+(?:[.,][0-9]+)?)([km])?/);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  const multiplier = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return Number.isFinite(value) ? Math.round(value * multiplier) : 0;
}

const STYLE_ALIASES: Record<string, SceneStyle> = {
  afro: "afrobeat",
  electro: "electro",
  metal: "metal",
  neoclassique: "neo-classical",
  classique: "classical",
  "r&b": "rnb",
};

function inferArtistRoles(value: string) {
  const searchable = normalizeText(value);
  return SCENE_ARTIST_ROLE_OPTIONS
    .filter(({ label, filterTokens }) => (
      searchable.includes(normalizeText(label))
      || filterTokens.some((token) => searchable.includes(normalizeText(token)))
    ))
    .map(({ key }) => key);
}

function inferStyles(value: string) {
  const segments = normalizeText(value)
    .split(/[·,;|]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const matchesSegment = (candidate: string) => {
    const normalizedCandidate = normalizeText(candidate);
    return segments.some((segment) => (
      segment === normalizedCandidate
      || segment.startsWith(`${normalizedCandidate} `)
    ));
  };
  const inferred = SCENE_STYLE_OPTIONS
    .filter(({ id, label }) => matchesSegment(label) || matchesSegment(id))
    .map(({ id }) => id);
  for (const [alias, style] of Object.entries(STYLE_ALIASES)) {
    if (matchesSegment(alias)) inferred.push(style);
  }
  return [...new Set(inferred)];
}

function inferContentType(item: ShortsVideoItem): SceneContentType {
  const searchable = normalizeText(
    `${item.contentTypeLabel ?? ""} ${item.badge ?? ""} ${item.meta} ${item.title}`,
  );
  if (searchable.includes("replay room") || searchable.includes("replay de room")) {
    return "room-replay";
  }
  if (searchable.includes("meewav original")) return "meewav-original";
  if (searchable.includes("documentaire")) return "documentary";
  if (searchable.includes("interview")) return "interview";
  if (searchable.includes("coulisse") || searchable.includes("making-of")) return "behind-scenes";
  if (searchable.includes("collab")) return "collaboration";
  if (searchable.includes("dj set")) return "dj-set";
  if (searchable.includes("freestyle")) return "freestyle";
  if (searchable.includes("danse")) return "dance";
  if (searchable.includes("cover")) return "cover";
  if (searchable.includes("studio")) return "studio";
  if (searchable.includes("session")) return "session";
  if (searchable.includes("clip")) return "clip";
  return "performance";
}

function inferCountry(city: string) {
  const normalizedCity = normalizeText(city);
  if (normalizedCity === "bruxelles") return "Belgique";
  if (normalizedCity === "dakar") return "Sénégal";
  if (normalizedCity === "geneve") return "Suisse";
  return "France";
}

export type SceneVideoFromShortsOptions = {
  contentType?: SceneContentType;
  artistRoles?: readonly SceneArtistRole[];
  styles?: readonly SceneStyle[];
  country?: string;
  region?: string;
  publishedAt?: string;
  relevanceScore?: number;
  personalizationScore?: number;
};

/** Temporary adapter while the backend still returns the legacy Shorts DTO. */
export function sceneVideoFromShortsItem(
  item: ShortsVideoItem,
  options: SceneVideoFromShortsOptions = {},
): SceneVideoRecord {
  return {
    id: item.id,
    title: item.title,
    artistId: item.artistId,
    artistName: item.artist,
    contentType: options.contentType ?? inferContentType(item),
    presentationFormat: item.presentationFormat
      ?? (item.format === "portrait" ? "vertical" : "landscape"),
    artistRoles: options.artistRoles ?? inferArtistRoles(item.role),
    styles: options.styles ?? inferStyles(item.meta),
    durationSeconds: parseSceneDuration(item.duration),
    publicationState: "published",
    publishedAt: options.publishedAt,
    country: options.country ?? inferCountry(item.city),
    region: options.region,
    city: item.city,
    grade: item.gradeLevel,
    viewCount: parseSceneViewCount(item.views),
    likeCount: item.likeCount,
    relevanceScore: options.relevanceScore,
    personalizationScore: options.personalizationScore,
    tags: [item.meta, item.role, item.badge ?? ""].filter(Boolean),
  };
}
