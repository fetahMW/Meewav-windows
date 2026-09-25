import RailEdgeNavigation from "../../components/shared/rail/RailEdgeNavigation";
import {
  ArrowRight,
  ChartNoAxesCombined,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  Headphones,
  Heart,
  MapPin,
  Pause,
  Play,
  Search,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import {
  MeewavActiveFilterChips,
  MeewavFilterPanel,
  MeewavFilterSection,
  MeewavSearchFilterBar,
  type MeewavActiveFilter,
} from "../../components/shared/search-filter/MeewavSearchFilter";
import { tremplinArtists, tremplinStyles, type TremplinArtist } from "./tremplinArtistData";
import { getTremplinProjectSnapshot } from "./tremplinProjectData";
import {
  artistMatchesTremplinRole,
  getTremplinProfessionLabel,
  getTremplinRoleProfile,
  type TremplinRoleId,
} from "./tremplinRoleData";
import {
  getTremplinTokenLifecycleStage,
  isPublicTremplinTalent,
  matchesTalentCategory,
  TREMPLIN_GRADE_EXPERIENCE,
  TREMPLIN_TALENT_CATEGORIES,
  type TremplinTalentCategoryId,
  type TremplinTokenLifecycleStage,
} from "./tremplinProductModel";
import { getTremplinArtistToken, type TremplinArtistToken } from "./tremplinTokenData";
import MeewavTokenIcon from "./MeewavTokenIcon";
import TremplinTokenChange24h from "./TremplinTokenChange24h";
import {
  formatTremplinTokenPrice,
  formatTremplinTokenUpdatedAt,
  getTremplinToken24hSnapshot,
  TREMPLIN_DISCOVERY_TOKEN_UI,
} from "./tremplinDiscoveryToken";
import "./tremplin-home-experience.css";
import "./tremplin-discovery-premium.css";
import "./tremplin-discovery-rails.css";

export type TalentFilterId = "all" | TremplinRoleId;
export type WallSort = "relevance" | "editorial" | "recent" | "alphabetical" | "gradeAscending" | "gradeDescending";
export type GradeFilter = "all" | "1" | "2" | "3" | "4" | "5" | "6";
export type TokenPresenceFilter = "all" | "with" | "without";
export type TokenAvailabilityFilter = "all" | TremplinTokenLifecycleStage;
export type TremplinDiscoveryRailId =
  | "weekly"
  | "watchlist"
  | "emerging"
  | "verified"
  | "progress"
  | "followed"
  | "nearby"
  | "editorial";

type ProfilePalette = {
  accent: string;
  secondary: string;
  highlight: string;
};

type TalentEntry = {
  artist: TremplinArtist;
  token?: TremplinArtistToken;
  palette: ProfilePalette;
};

type DiscoveryRail = {
  id: TremplinDiscoveryRailId;
  eyebrow: string;
  title: string;
  description: string;
  entries: readonly TalentEntry[];
};

export type TremplinHomeExperienceProps = {
  playingArtistId?: string | null;
  followedArtistIds?: ReadonlySet<string>;
  onToggleArtistAudio?: (artistId: string) => void;
  onToggleFollow?: (artistId: string) => void;
  onOpenArtist?: (artist: TremplinArtist) => void;
  onOpenArtistToken?: (artist: TremplinArtist) => void;
  onOpenArtistStatistics?: (artist: TremplinArtist) => void;
  externalTalentFilterId?: TalentFilterId;
  wallRailId: TremplinDiscoveryRailId | null;
  onWallRailIdChange: (railId: TremplinDiscoveryRailId | null) => void;
  initialState?: TremplinDiscoveryState;
  onStateChange?: (state: TremplinDiscoveryState) => void;
};

export type TremplinDiscoveryState = {
  query: string;
  styleFilter: string;
  categoryFilter: TremplinTalentCategoryId;
  gradeFilter: GradeFilter;
  tokenPresenceFilter: TokenPresenceFilter;
  tokenAvailabilityFilter: TokenAvailabilityFilter;
  newOnly: boolean;
  verifiedOnly: boolean;
  nearMeOnly: boolean;
  showAdvancedFilters: boolean;
  regionFilter: string;
  cityFilter: string;
  wallCategoryFilter: TremplinTalentCategoryId;
  sort: WallSort;
  visibleCount: number;
  wallScrollTop: number;
};

// Exact graph families already shared with Profile statistics.
const PROFILE_PALETTES: readonly ProfilePalette[] = [
  { accent: "#8b5cff", secondary: "#6b7cff", highlight: "#c7adff" },
  { accent: "#d946ef", secondary: "#8b5cff", highlight: "#ff7bf2" },
  { accent: "#34d399", secondary: "#19b8ff", highlight: "#8af1c8" },
  { accent: "#19b8ff", secondary: "#8b5cff", highlight: "#75dcff" },
] as const;

const INITIAL_WALL_COUNT = 24;
const WALL_PAGE_SIZE = 24;
const WALL_SESSION_STORAGE_KEY = "meewav:tremplin:project-wall-session";

type WallSessionSnapshot = {
  railId: TremplinDiscoveryRailId;
  visibleCount: number;
  scrollTop: number;
};

type WallFilterDraft = {
  region: string;
  city: string;
  category: TremplinTalentCategoryId;
  style: string;
  grade: GradeFilter;
  tokenStatus: TokenAvailabilityFilter;
  sort: WallSort;
};

type DiscoveryFilterDraft = {
  category: TremplinTalentCategoryId;
  style: string;
  grade: GradeFilter;
  tokenPresence: TokenPresenceFilter;
  tokenStatus: TokenAvailabilityFilter;
};

const TOKEN_STATUS_FILTER_VALUES: readonly TremplinTokenLifecycleStage[] = [
  "observation",
  "eligible",
  "review",
  "upcoming",
  "active",
  "suspended",
];

const WALL_SORT_VALUES: readonly WallSort[] = [
  "relevance",
  "recent",
  "gradeAscending",
  "gradeDescending",
];

function isGradeFilter(value: string | null): value is GradeFilter {
  return value === "all" || ["1", "2", "3", "4", "5", "6"].includes(value ?? "");
}

function isTokenStatusFilter(value: string | null): value is TokenAvailabilityFilter {
  return value === "all" || TOKEN_STATUS_FILTER_VALUES.includes(value as TremplinTokenLifecycleStage);
}

function isWallSort(value: string | null): value is WallSort {
  return WALL_SORT_VALUES.includes(value as WallSort);
}

function readWallFiltersFromUrl(fallback: TremplinDiscoveryState) {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");
  const grade = params.get("grade");
  const tokenStatus = params.get("tokenStatus");
  const sort = params.get("sort");
  return {
    query: params.get("q") ?? fallback.query,
    region: params.get("region") ?? fallback.regionFilter,
    city: params.get("city") ?? fallback.cityFilter,
    category: TREMPLIN_TALENT_CATEGORIES.some(({ id }) => id === category)
      ? category as TremplinTalentCategoryId
      : fallback.wallCategoryFilter,
    style: params.get("style") ?? fallback.styleFilter,
    grade: isGradeFilter(grade) ? grade : fallback.gradeFilter,
    tokenStatus: isTokenStatusFilter(tokenStatus) ? tokenStatus : fallback.tokenAvailabilityFilter,
    sort: isWallSort(sort) ? sort : fallback.sort,
  };
}

function writeWallFiltersToUrl(filters: {
  query: string;
  region: string;
  city: string;
  category: TremplinTalentCategoryId;
  style: string;
  grade: GradeFilter;
  tokenStatus: TokenAvailabilityFilter;
  sort: WallSort;
}, mode: "push" | "replace" = "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const setOptional = (key: string, value: string, defaultValue = "all") => {
    if (!value || value === defaultValue) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  };
  setOptional("q", filters.query.trim(), "");
  setOptional("region", filters.region);
  setOptional("city", filters.city);
  setOptional("category", filters.category);
  setOptional("style", filters.style);
  setOptional("grade", filters.grade);
  setOptional("tokenStatus", filters.tokenStatus);
  setOptional("sort", filters.sort, "relevance");
  window.history[mode === "push" ? "pushState" : "replaceState"]({}, "", url);
}

function writeDiscoveryQueryToUrl(query: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const normalized = query.trim();
  if (normalized) url.searchParams.set("q", normalized);
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
}

function readWallSessionSnapshot(): WallSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(WALL_SESSION_STORAGE_KEY) ?? "null") as Partial<WallSessionSnapshot> | null;
    if (!parsed || typeof parsed.railId !== "string" || typeof parsed.visibleCount !== "number" || typeof parsed.scrollTop !== "number") return null;
    return {
      railId: parsed.railId as TremplinDiscoveryRailId,
      visibleCount: Math.max(INITIAL_WALL_COUNT, Math.floor(parsed.visibleCount)),
      scrollTop: Math.max(0, parsed.scrollTop),
    };
  } catch {
    return null;
  }
}

function writeWallSessionSnapshot(snapshot: WallSessionSnapshot) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(WALL_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
}

export const DEFAULT_TREMPLIN_DISCOVERY_STATE: TremplinDiscoveryState = {
  query: "",
  styleFilter: "all",
  categoryFilter: "all",
  gradeFilter: "all",
  tokenPresenceFilter: "all",
  tokenAvailabilityFilter: "all",
  newOnly: false,
  verifiedOnly: false,
  nearMeOnly: false,
  showAdvancedFilters: false,
  regionFilter: "all",
  cityFilter: "all",
  wallCategoryFilter: "all",
  sort: "relevance",
  visibleCount: INITIAL_WALL_COUNT,
  wallScrollTop: 0,
};

function stableHash(value: string) {
  return [...value].reduce((hash, character, index) => (
    (hash * 31 + character.charCodeAt(0) * (index + 3)) % 100_003
  ), 17);
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR");
}

function matchesTalentFilter(artist: TremplinArtist, filterId: TalentFilterId) {
  if (filterId === "all") return true;
  return artistMatchesTremplinRole(artist, filterId);
}

function getTalentCardBadge(entry: TalentEntry, railId: TremplinDiscoveryRailId) {
  if (railId === "weekly") return null;
  if (railId === "watchlist") return null;
  if (railId === "emerging") return "Nouveau parcours";
  if (railId === "verified") return "Parcours documenté";
  if (railId === "progress") return "En mouvement";
  if (railId === "followed") return "Room bientôt";
  if (railId === "nearby") return entry.artist.city;
  return null;
}

function getTalentLatestProgression(artist: TremplinArtist, fallback: string) {
  return (artist.updates[0]?.title ?? artist.stageLabel ?? fallback)
    .replace(/\s*·\s*nouvelle étape\s*$/i, "")
    .trim();
}

function buildCatalog(): TalentEntry[] {
  return tremplinArtists.map((artist, index) => ({
      artist,
      token: getTremplinArtistToken(artist.id),
      palette: PROFILE_PALETTES[index % PROFILE_PALETTES.length],
    }));
}

const TREMPLIN_FRENCH_MONTHS: Readonly<Record<string, number>> = {
  janvier: 0, fevrier: 1, février: 1, mars: 2, avril: 3, mai: 4, juin: 5,
  juillet: 6, aout: 7, août: 7, septembre: 8, octobre: 9, novembre: 10,
  decembre: 11, décembre: 11,
};

function getLatestArtistActivityValue(artist: TremplinArtist) {
  const match = normalize(artist.updates[0]?.dateLabel ?? "").match(/(\d{1,2})\s+([a-z]+)/);
  if (!match) return 0;
  return new Date(2026, TREMPLIN_FRENCH_MONTHS[match[2]] ?? 0, Number(match[1])).getTime();
}

function getArtisticMomentumScore(artist: TremplinArtist) {
  const project = getTremplinProjectSnapshot(artist);
  return (
    artist.metrics.length * 16
    + artist.updates.length * 12
    + (project?.proofPoints.length ?? 0) * 10
    + (stableHash(artist.id) % 17) / 100
  );
}

function buildRails(catalog: readonly TalentEntry[]): DiscoveryRail[] {
  const usedArtistIds = new Set<string>();
  const takeUnseen = (entries: readonly TalentEntry[], limit = 10) => {
    const selection: TalentEntry[] = [];
    for (const entry of entries) {
      if (usedArtistIds.has(entry.artist.id)) continue;
      usedArtistIds.add(entry.artist.id);
      selection.push(entry);
      if (selection.length === limit) break;
    }
    return selection;
  };
  const byProgress = [...catalog].sort((a, b) => getArtisticMomentumScore(b.artist) - getArtisticMomentumScore(a.artist));
  const weeklyRanking = [...catalog].sort((a, b) => Number(b.artist.editorialSelection) - Number(a.artist.editorialSelection) || stableHash(a.artist.id) - stableHash(b.artist.id));
  const byVerification = [...catalog].sort((a, b) => (
    b.artist.metrics.length - a.artist.metrics.length
    || b.artist.updates.length - a.artist.updates.length
    || stableHash(b.artist.id) - stableHash(a.artist.id)
  ));
  const byNextRoom = [...catalog].filter((entry) => entry.token && new Date(entry.token.nextRoom.startsAt).getTime() > Date.now()).sort((a, b) => (
    a.token!.nextRoom.startsAt.localeCompare(b.token!.nextRoom.startsAt)
  ));
  const nearby = [...catalog].sort((a, b) => a.artist.city.localeCompare(b.artist.city, "fr") || a.artist.name.localeCompare(b.artist.name, "fr"));
  const editorial = [...catalog].sort((a, b) => {
    const score = (entry: TalentEntry) => (
      (entry.artist.editorialSelection ? 1_000 : 0) - stableHash(entry.artist.id) / 1_000_000
    );
    return score(b) - score(a);
  });
  const emerging = catalog
    .filter(({ artist }) => artist.gradeLevel <= 2)
    .sort((a, b) => getArtisticMomentumScore(b.artist) - getArtisticMomentumScore(a.artist));
  const watchlist = catalog
    .filter(({ artist }) => Boolean(getTremplinProjectSnapshot(artist)))
    .sort((a, b) => stableHash(a.artist.id) - stableHash(b.artist.id));

  return [
    { id: "weekly", eyebrow: "Sélection MeeWav", title: "Projets et jetons de talent à découvrir", description: "Consulte les projets mis en avant, leur grade et l’état réel de leur jeton de talent.", entries: takeUnseen(weeklyRanking, 10) },
    { id: "watchlist", eyebrow: "Nouveaux projets", title: "À découvrir aussi", description: "Des créations en cours, racontées par celles et ceux qui les construisent.", entries: takeUnseen(watchlist) },
    { id: "emerging", eyebrow: "Premiers pas", title: "Premiers projets sur MeeWav", description: "Une place réservée aux nouveaux profils, quelle que soit leur audience.", entries: takeUnseen(emerging) },
    { id: "verified", eyebrow: "Parcours documentés", title: "Profils à explorer", description: "Des profils qui présentent leurs créations, leurs étapes et leur projet en cours.", entries: takeUnseen(byVerification) },
    { id: "progress", eyebrow: "Création en cours", title: "Projets en mouvement", description: "Des artistes qui publient, collaborent et documentent leurs prochaines étapes.", entries: takeUnseen(byProgress) },
    { id: "followed", eyebrow: "En direct", title: "Prochaines Rooms", description: "Entre dans les espaces live annoncés à venir.", entries: takeUnseen(byNextRoom) },
    { id: "nearby", eyebrow: "Par ville", title: "Explorer les scènes locales", description: "Parcours les artistes par ville, sans supposer ta position.", entries: takeUnseen(nearby) },
    { id: "editorial", eyebrow: "Sélection MeeWav", title: "Univers à explorer", description: "Une sélection humaine et diverse, sans classement financier.", entries: takeUnseen(editorial) },
  ];
}

type ProjectWallFamily = "voice" | "instrument" | "dj";

function getProjectWallFamily(entry: TalentEntry): ProjectWallFamily | null {
  const role = getTremplinRoleProfile(entry.artist);
  if (role.familyId === "voix") return "voice";
  if (role.id === "dj") return "dj";
  if (role.familyId === "instruments") return "instrument";
  return null;
}

/**
 * The project wall is not the ten-card rail teaser. It is a stable, complete
 * editorial collection whose mix reflects the Tremplin intake: voices first,
 * then a smaller number of instrumentalists and DJs. Financial signals are
 * deliberately absent from the ordering.
 */
function buildProjectWallCollection(catalog: readonly TalentEntry[]) {
  const byEditorialRelevance = (left: TalentEntry, right: TalentEntry) => (
    Number(right.artist.editorialSelection) - Number(left.artist.editorialSelection)
    || getArtisticMomentumScore(right.artist) - getArtisticMomentumScore(left.artist)
    || stableHash(left.artist.id) - stableHash(right.artist.id)
  );
  const queues: Record<ProjectWallFamily, TalentEntry[]> = {
    voice: catalog.filter((entry) => getProjectWallFamily(entry) === "voice").sort(byEditorialRelevance),
    instrument: catalog.filter((entry) => getProjectWallFamily(entry) === "instrument").sort(byEditorialRelevance),
    dj: catalog.filter((entry) => getProjectWallFamily(entry) === "dj").sort(byEditorialRelevance),
  };
  const sequence: readonly ProjectWallFamily[] = ["voice", "voice", "instrument", "voice", "voice", "dj", "voice", "voice"];
  const result: TalentEntry[] = [];
  while (queues.voice.length > 0) {
    for (const family of sequence) {
      const next = queues[family].shift();
      if (next) result.push(next);
    }
  }
  return result;
}

type ProjectCardProps = {
  entry: TalentEntry;
  railId: TremplinDiscoveryRailId;
  variant?: "rail" | "wall";
  playing: boolean;
  followed: boolean;
  eager?: boolean;
  instanceId: string;
  controlsTabIndex?: number;
  decorativeImage?: boolean;
  onOpen: () => void;
  onOpenToken: () => void;
  onOpenStatistics: () => void;
  onToggleAudio: () => void;
  onToggleFollow: () => void;
};

function HeroProjectCard({
  entry,
  railId,
  variant = "rail",
  playing,
  followed,
  eager = false,
  instanceId,
  controlsTabIndex,
  decorativeImage = false,
  onOpen,
  onOpenToken,
  onOpenStatistics,
  onToggleAudio,
  onToggleFollow,
}: ProjectCardProps) {
  const cardBadge = getTalentCardBadge(entry, railId);
  const professionLabel = getTremplinProfessionLabel(entry.artist);
  const cleanedProfessionLabel = professionLabel.replace(/\s+amateur(?:e)?\b/iu, "").trim();
  const metadata = [cleanedProfessionLabel, entry.artist.styles[0], entry.artist.city]
    .filter((value, index, values) => value && values.findIndex((candidate) => candidate.toLocaleLowerCase("fr-FR") === value.toLocaleLowerCase("fr-FR")) === index);
  const artisticMetadata = metadata.slice(0, -1);
  const locationMetadata = metadata[metadata.length - 1];
  const project = getTremplinProjectSnapshot(entry.artist);
  const recentProof = getTalentLatestProgression(entry.artist, project.proofPoints[0]);
  const projectDescription = [
    recentProof,
    project.nextMilestone ? `Prochaine étape : ${project.nextMilestone}` : null,
  ].find((candidate) => candidate && normalize(candidate) !== normalize(project.headline)) ?? null;
  const tokenStage = getTremplinTokenLifecycleStage(entry.artist);
  const tokenUi = TREMPLIN_DISCOVERY_TOKEN_UI[tokenStage];
  const token24h = getTremplinToken24hSnapshot(entry.token);
  const gradeExperience = TREMPLIN_GRADE_EXPERIENCE[entry.artist.gradeLevel];
  const nonActiveContext = (() => {
    if (tokenStage === "active") return null;
    const latestStep = entry.artist.updates[0]?.title ?? project.proofPoints[0] ?? null;
    const nextStep = project.nextMilestone ?? null;
    if (tokenStage === "observation" && latestStep && normalize(latestStep) !== normalize(project.headline)) return { label: "Dernière étape", value: latestStep };
    if (tokenStage === "eligible" && nextStep) return { label: "Prochaine étape", value: nextStep };
    if (tokenStage === "review" && entry.artist.updates[0]?.dateLabel) return { label: "Dernière mise à jour", value: entry.artist.updates[0].dateLabel };
    if (tokenStage === "upcoming" && nextStep) return { label: "Prochaine étape", value: nextStep };
    if (tokenStage === "suspended" && latestStep) return { label: "Dernière information", value: latestStep };
    return null;
  })();
  const headingId = `tremplin-talent-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <article
      className={`tremplin-home-card tremplin-discovery-card tremplin-home-card--${variant}`}
      style={{
        "--talent-accent": entry.palette.accent,
      } as CSSProperties}
      data-tremplin-card
      data-artist-id={entry.artist.id}
      data-project-family={getProjectWallFamily(entry) ?? "other"}
      data-token-stage={tokenStage}
      aria-labelledby={headingId}
    >
      <div className="tremplin-home-card__visual">
        <img
          src={entry.artist.artwork}
          alt={decorativeImage ? "" : `Portrait de ${entry.artist.name}`}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
        />
        <button type="button" tabIndex={controlsTabIndex} className="tremplin-home-card__media-open" onClick={onOpen} aria-label={`Voir le profil de ${entry.artist.name}`} />
        {cardBadge ? <span className="tremplin-home-card__rank">{cardBadge}</span> : null}
        <button type="button" tabIndex={controlsTabIndex} className={`tremplin-home-card__follow${followed ? " is-followed" : ""}`} aria-label={followed ? `Ne plus suivre ${entry.artist.name}` : `Suivre ${entry.artist.name}`} title={followed ? "Suivi" : "Suivre"} aria-pressed={followed} onClick={onToggleFollow}>
          <Heart size={18} fill={followed ? "currentColor" : "none"} aria-hidden="true" />
        </button>
        <button
          type="button"
          tabIndex={controlsTabIndex}
          className="tremplin-home-card__audio-overlay"
          aria-label={`${playing ? "Mettre en pause" : "Écouter un extrait de"} ${entry.artist.audio.title} par ${entry.artist.name}`}
          aria-pressed={playing}
          onClick={onToggleAudio}
        >
          {playing ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
          <span>{playing ? "Pause" : entry.artist.audio.durationLabel}</span>
        </button>
      </div>
      <div className="tremplin-home-card__body">
        <div className="tremplin-home-card__heading">
          <div>
            <button type="button" tabIndex={controlsTabIndex} className="tremplin-home-card__name" onClick={onOpen}>
              <strong id={headingId}>{entry.artist.name}</strong>
            </button>
            <p className="tremplin-home-card__identity-meta">
              {artisticMetadata.length ? <span>{artisticMetadata.join(" · ")}</span> : null}
              {locationMetadata ? <span><MapPin size={14} aria-hidden="true" />{locationMetadata}</span> : null}
            </p>
          </div>
          <span className="tremplin-home-card__grade">
            <MeewavGradeBadge level={entry.artist.gradeLevel} size="xs" variant="icon" />
            <span>Niveau {entry.artist.gradeLevel} · {gradeExperience.title}</span>
          </span>
        </div>
        <div className="tremplin-home-card__project">
          <small>Projet actuel</small>
          <strong title={project.headline}>{project.headline}</strong>
          {projectDescription ? <p>{projectDescription}</p> : null}
        </div>
        <section className="tremplin-home-card__token-summary" data-token-stage={tokenStage} aria-label={`État du jeton de talent de ${entry.artist.name}`}>
          <header><i className="tremplin-discovery-card__status-icon" aria-hidden="true">{tokenStage === "active" ? <MeewavTokenIcon /> : <span />}</i><span>{tokenUi.label}</span>{tokenStage === "active" && entry.token ? <strong>{entry.token.symbol}</strong> : null}</header>
          <p>{tokenUi.helper}</p>
          {nonActiveContext ? <p className="tremplin-home-card__token-context"><span>{nonActiveContext.label}</span><strong>{nonActiveContext.value}</strong></p> : null}
          {tokenUi.showPrice && entry.token ? <>
            <dl className="tremplin-home-card__token-data">
              <div><dt>Valeur actuelle</dt><dd>{formatTremplinTokenPrice(entry.token.currentValueEur)}</dd></div>
              <div><dt>Évolution</dt><dd><TremplinTokenChange24h value={token24h.changePercent} /></dd></div>
            </dl>
            <small className="tremplin-home-card__updated">{formatTremplinTokenUpdatedAt(token24h.updatedAt)}</small>
          </> : null}
        </section>
      </div>
      <footer className="tremplin-home-card__actions">
        <button type="button" tabIndex={controlsTabIndex} className="tremplin-home-card__primary" onClick={onOpenToken}>{tokenStage === "active" ? <MeewavTokenIcon /> : <FileText aria-hidden="true" />}<span>{tokenUi.primaryAction}</span><ArrowRight size={16} aria-hidden="true" /></button>
        {tokenStage === "active" ? <button type="button" tabIndex={controlsTabIndex} className="tremplin-home-card__stats" aria-label={`Voir les statistiques du jeton de ${entry.artist.name}`} onClick={onOpenStatistics}><ChartNoAxesCombined size={16} aria-hidden="true" /> Statistiques</button> : null}
        <button type="button" tabIndex={controlsTabIndex} className="tremplin-home-card__profile" onClick={onOpen}>Voir le profil <ArrowRight size={15} aria-hidden="true" /></button>
      </footer>
    </article>
  );
}

function ProjectMiniCard({ entry, playing, followed, eager = false, instanceId, controlsTabIndex, decorativeImage = false, onOpen, onToggleAudio, onToggleFollow }: ProjectCardProps) {
  const project = getTremplinProjectSnapshot(entry.artist);
  const headingId = `tremplin-mini-${instanceId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const profession = getTremplinProfessionLabel(entry.artist).replace(/\s+amateur(?:e)?\b/iu, "").trim();
  const discipline = [profession, entry.artist.styles[0]].filter((value, index, values) => value && values.findIndex(candidate => candidate.toLocaleLowerCase("fr-FR") === value.toLocaleLowerCase("fr-FR")) === index).join(" · ");
  return <article className="tremplin-project-mini" data-tremplin-card data-artist-id={entry.artist.id} aria-labelledby={headingId}>
    <div className="tremplin-project-mini__visual">
      <img src={entry.artist.artwork} alt={decorativeImage ? "" : `Portrait de ${entry.artist.name}`} loading={eager ? "eager" : "lazy"} decoding="async" />
      <button className="tremplin-project-mini__portrait" type="button" tabIndex={controlsTabIndex} onClick={onOpen} aria-label={`Voir le profil de ${entry.artist.name}`} />
      <button className="tremplin-project-mini__audio" type="button" tabIndex={controlsTabIndex} onClick={onToggleAudio} aria-pressed={playing} aria-label={`${playing ? "Mettre en pause" : "Écouter un extrait de"} ${entry.artist.name}`}>
        {playing ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}<span>{playing ? "Pause" : entry.artist.audio.durationLabel}</span>
      </button>
    </div>
    <div className="tremplin-project-mini__body">
      <header><button type="button" tabIndex={controlsTabIndex} onClick={onOpen}><strong id={headingId}>{entry.artist.name}</strong></button><span className="tremplin-project-mini__grade" title={`Niveau ${entry.artist.gradeLevel} · ${TREMPLIN_GRADE_EXPERIENCE[entry.artist.gradeLevel].title}`}><MeewavGradeBadge level={entry.artist.gradeLevel} size="xs" variant="icon" /></span></header>
      <p className="tremplin-project-mini__discipline">{discipline}</p>
      <p className="tremplin-project-mini__city"><MapPin size={11} aria-hidden="true" />{entry.artist.city}</p>
      <p className="tremplin-project-mini__project" title={project.headline}>{project.headline}</p>
      <footer><button type="button" tabIndex={controlsTabIndex} onClick={onOpen}>Voir le projet <ArrowRight size={13} /></button><button className="tremplin-project-mini__follow" type="button" tabIndex={controlsTabIndex} onClick={onToggleFollow} aria-label={`${followed ? "Ne plus suivre" : "Suivre"} ${entry.artist.name}`} aria-pressed={followed}><Heart size={14} fill={followed ? "currentColor" : "none"} /></button></footer>
    </div>
  </article>;
}

function TalentRail({
  rail,
  playingArtistId,
  onOpen,
  onOpenToken,
  onOpenStatistics,
  onToggleAudio,
  followedArtistIds,
  onToggleFollow,
  onSeeAll,
  search,
}: {
  rail: DiscoveryRail;
  playingArtistId: string | null;
  onOpen: (entry: TalentEntry, source: readonly TalentEntry[]) => void;
  onOpenToken: (entry: TalentEntry, source: readonly TalentEntry[]) => void;
  onOpenStatistics: (entry: TalentEntry, source: readonly TalentEntry[]) => void;
  onToggleAudio: (artistId: string) => void;
  followedArtistIds: ReadonlySet<string>;
  onToggleFollow: (artistId: string) => void;
  onSeeAll: () => void;
  search?: ReactNode;
}) {
  const Card = rail.id === "weekly" ? HeroProjectCard : ProjectMiniCard;
  const viewportRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const loopCloneCount = Math.min(8, rail.entries.length);
  const loopedEntries = useMemo(() => [
    ...rail.entries.slice(-loopCloneCount).map((entry, index) => ({
      entry,
      entryIndex: rail.entries.length - loopCloneCount + index,
      loopCopy: "before" as const,
      renderKey: `before-${index}-${entry.artist.id}`,
    })),
    ...rail.entries.map((entry, index) => ({
      entry,
      entryIndex: index,
      loopCopy: "original" as const,
      renderKey: `original-${index}-${entry.artist.id}`,
    })),
    ...rail.entries.slice(0, loopCloneCount).map((entry, index) => ({
      entry,
      entryIndex: index,
      loopCopy: "after" as const,
      renderKey: `after-${index}-${entry.artist.id}`,
    })),
  ], [loopCloneCount, rail.entries]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>('[data-tremplin-loop-copy="original"][data-tremplin-entry-index="0"]');
    if (!viewport || !target) return;
    const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
    const previousBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = target.offsetLeft - viewportPadding;
    viewport.style.scrollBehavior = previousBehavior;
  }, [loopedEntries, rail.id]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const updateActiveCard = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport || rail.entries.length <= 1) return;
      const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
      const usefulLeft = viewport.scrollLeft + viewportPadding;
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>("[data-tremplin-rail-card]"));
      const nearest = cards.reduce<HTMLElement | null>((closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.offsetLeft - usefulLeft) < Math.abs(closest.offsetLeft - usefulLeft) ? candidate : closest;
      }, null);
      if (!nearest || nearest.dataset.tremplinLoopCopy === "original") return;
      const entryIndex = nearest.dataset.tremplinEntryIndex;
      const target = cards.find((card) => card.dataset.tremplinLoopCopy === "original" && card.dataset.tremplinEntryIndex === entryIndex);
      if (!target) return;
      const previousBehavior = viewport.style.scrollBehavior;
      viewport.style.scrollBehavior = "auto";
      viewport.scrollLeft = target.offsetLeft - viewportPadding;
      viewport.style.scrollBehavior = previousBehavior;
    }, 96);
  };

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport || rail.entries.length <= 1) return;
    const card = viewport.querySelector<HTMLElement>("[data-tremplin-rail-card]");
    const track = viewport.querySelector<HTMLElement>(".tremplin-home-rail__track");
    if (!card || !track) return;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const stride = card.getBoundingClientRect().width + gap;
    const cardsPerPage = Math.max(1, Math.floor(viewport.clientWidth / stride));
    viewport.scrollBy({ left: direction * cardsPerPage * stride, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section className={`tremplin-home-rail${rail.id === "weekly" ? " is-featured" : ""}${rail.id === "emerging" ? " is-first-projects" : ""}`} aria-labelledby={`tremplin-${rail.id}-title`}>
      <header className="tremplin-home-rail__header">
        <div>
          <span>{rail.eyebrow}</span>
          <h2 id={`tremplin-${rail.id}-title`}>{rail.title}</h2>
          <p>{rail.description}</p>
        </div>
        <div className="tremplin-home-rail__header-actions">
          {search}
          <button type="button" className="tremplin-home-rail__more" onClick={onSeeAll} aria-label={`Voir tous les projets de ${rail.title}`}>
            <span className="tremplin-home-rail__more-long">Voir tous les projets</span>
            <span className="tremplin-home-rail__more-short" aria-hidden="true">Tout voir</span>
            <ArrowRight size={16} />
          </button>

        </div>
      </header>
      <div className="tremplin-home-rail__viewport-shell">
        <div
          ref={viewportRef}
          id={`tremplin-${rail.id}-viewport`}
          className="tremplin-home-rail__viewport"
          data-tremplin-magnetic-rail
          data-tremplin-looping="true"
          onScroll={updateActiveCard}
        >
          <div className="tremplin-home-rail__track">
            {loopedEntries.map(({ entry, entryIndex, loopCopy, renderKey }) => {
              const isLoopClone = loopCopy !== "original";
              return (
              <div
                key={renderKey}
                data-tremplin-rail-card
                data-tremplin-entry-index={entryIndex}
                data-tremplin-loop-copy={loopCopy}
                data-tremplin-loop-clone={isLoopClone ? loopCopy : undefined}
                aria-hidden={isLoopClone || undefined}
                inert={isLoopClone || undefined}
              >
                <Card
                  entry={entry}
                  railId={rail.id}
                  playing={playingArtistId === entry.artist.id}
                  followed={followedArtistIds.has(entry.artist.id)}
                  eager={rail.id === "weekly" && entryIndex < 4}
                  instanceId={`${rail.id}-${renderKey}`}
                  controlsTabIndex={isLoopClone ? -1 : undefined}
                  decorativeImage={isLoopClone}
                  onOpen={() => onOpen(entry, rail.entries)}
                  onOpenToken={() => onOpenToken(entry, rail.entries)}
                  onOpenStatistics={() => onOpenStatistics(entry, rail.entries)}
                  onToggleAudio={() => onToggleAudio(entry.artist.id)}
                  onToggleFollow={() => onToggleFollow(entry.artist.id)}
                />
              </div>
              );
            })}
          </div>
        </div>
        <RailEdgeNavigation title={rail.title} viewportId={`tremplin-${rail.id}-viewport`} disabled={rail.entries.length <= 1} onPrevious={() => scrollByPage(-1)} onNext={() => scrollByPage(1)} />
      </div>
    </section>
  );
}

export default function TremplinHomeExperience({
  playingArtistId,
  followedArtistIds = new Set<string>(),
  onToggleArtistAudio,
  onToggleFollow,
  onOpenArtist,
  onOpenArtistToken,
  onOpenArtistStatistics,
  externalTalentFilterId = "all",
  wallRailId,
  onWallRailIdChange,
  initialState = DEFAULT_TREMPLIN_DISCOVERY_STATE,
  onStateChange,
}: TremplinHomeExperienceProps) {
  const initialWallUrlFilters = wallRailId ? readWallFiltersFromUrl(initialState) : null;
  const [restoredWallSession] = useState<WallSessionSnapshot | null>(() => readWallSessionSnapshot());
  const restoredWallScrollTop = Math.max(initialState.wallScrollTop ?? 0, restoredWallSession?.scrollTop ?? 0);
  const restoredWallVisibleCount = Math.max(initialState.visibleCount, restoredWallSession?.visibleCount ?? INITIAL_WALL_COUNT);
  const [localPlayingArtistId, setLocalPlayingArtistId] = useState<string | null>(null);
  const [query, setQuery] = useState(initialWallUrlFilters?.query ?? initialState.query);
  const [styleFilter, setStyleFilter] = useState(initialWallUrlFilters?.style ?? initialState.styleFilter ?? "all");
  const [categoryFilter, setCategoryFilter] = useState<TremplinTalentCategoryId>(initialState.categoryFilter);
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>(initialWallUrlFilters?.grade ?? initialState.gradeFilter);
  const [tokenPresenceFilter, setTokenPresenceFilter] = useState<TokenPresenceFilter>(initialState.tokenPresenceFilter);
  const [tokenAvailabilityFilter, setTokenAvailabilityFilter] = useState<TokenAvailabilityFilter>(initialWallUrlFilters?.tokenStatus ?? initialState.tokenAvailabilityFilter);
  const [newOnly, setNewOnly] = useState(initialState.newOnly);
  const [verifiedOnly, setVerifiedOnly] = useState(initialState.verifiedOnly);
  const [nearMeOnly, setNearMeOnly] = useState(initialState.nearMeOnly);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(initialState.showAdvancedFilters);
  const [discoveryFilterDraft, setDiscoveryFilterDraft] = useState<DiscoveryFilterDraft>(() => ({
    category: initialState.categoryFilter,
    style: initialState.styleFilter,
    grade: initialState.gradeFilter,
    tokenPresence: initialState.tokenPresenceFilter,
    tokenStatus: initialState.tokenAvailabilityFilter,
  }));
  const [regionFilter, setRegionFilter] = useState(initialWallUrlFilters?.region ?? initialState.regionFilter);
  const [cityFilter, setCityFilter] = useState(initialWallUrlFilters?.city ?? initialState.cityFilter);
  const [wallCategoryFilter, setWallCategoryFilter] = useState<TremplinTalentCategoryId>(initialWallUrlFilters?.category ?? initialState.wallCategoryFilter);
  const [sort, setSort] = useState<WallSort>(initialWallUrlFilters?.sort ?? initialState.sort);
  const [wallFilterOpen, setWallFilterOpen] = useState(false);
  const [wallFilterDraft, setWallFilterDraft] = useState<WallFilterDraft>(() => ({
    region: initialWallUrlFilters?.region ?? initialState.regionFilter,
    city: initialWallUrlFilters?.city ?? initialState.cityFilter,
    category: initialWallUrlFilters?.category ?? initialState.wallCategoryFilter,
    style: initialWallUrlFilters?.style ?? initialState.styleFilter,
    grade: initialWallUrlFilters?.grade ?? initialState.gradeFilter,
    tokenStatus: initialWallUrlFilters?.tokenStatus ?? initialState.tokenAvailabilityFilter,
    sort: initialWallUrlFilters?.sort ?? initialState.sort,
  }));
  const [visibleCount, setVisibleCount] = useState(() => (
    restoredWallScrollTop > 0
      ? Math.max(restoredWallVisibleCount, INITIAL_WALL_COUNT + (WALL_PAGE_SIZE * 2))
      : restoredWallVisibleCount
  ));
  const [wallScrollTop, setWallScrollTop] = useState(restoredWallScrollTop);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadedAnnouncement, setLoadedAnnouncement] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<TalentEntry | null>(null);
  const [detailSourceIds, setDetailSourceIds] = useState<string[]>([]);
  const detailDialogRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const discoveryFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const wallResultsRef = useRef<HTMLDivElement>(null);
  const wallSentinelRef = useRef<HTMLDivElement>(null);
  const wallFilterTriggerRef = useRef<HTMLButtonElement>(null);
  const hasRestoredWallScrollRef = useRef(false);
  const isLeavingForProfileRef = useRef(false);
  const pendingWallScrollTopRef = useRef(restoredWallScrollTop);
  const wallScrollFrameRef = useRef<number | null>(null);
  const chartId = useId().replace(/:/g, "");

  useEffect(() => {
    if (wallRailId !== null) return undefined;
    const restoreQuery = () => setQuery(new URLSearchParams(window.location.search).get("q") ?? "");
    window.addEventListener("popstate", restoreQuery);
    return () => window.removeEventListener("popstate", restoreQuery);
  }, [wallRailId]);

  const fullCatalog = useMemo(() => (
    buildCatalog().filter(({ artist }) => isPublicTremplinTalent(artist))
  ), []);
  const catalog = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    return fullCatalog.filter((entry) => {
      if (!matchesTalentFilter(entry.artist, externalTalentFilterId)) return false;
      if (!matchesTalentCategory(entry.artist, categoryFilter)) return false;
      if (styleFilter !== "all" && !entry.artist.styles.includes(styleFilter)) return false;
      if (gradeFilter !== "all" && entry.artist.gradeLevel !== Number(gradeFilter)) return false;
      const tokenStage = getTremplinTokenLifecycleStage(entry.artist);
      if (tokenAvailabilityFilter !== "all" && tokenStage !== tokenAvailabilityFilter) return false;
      if (tokenPresenceFilter === "with" && tokenStage !== "active") return false;
      if (tokenPresenceFilter === "without" && tokenStage === "active") return false;
      if (!normalizedQuery) return true;
      const project = getTremplinProjectSnapshot(entry.artist);
      return normalize([
        entry.artist.name,
        getTremplinProfessionLabel(entry.artist),
        ...entry.artist.styles,
        ...entry.artist.disciplines,
        entry.artist.city,
        entry.artist.region,
        entry.artist.audio.title,
        entry.artist.stageLabel,
        entry.artist.biography,
        entry.token?.symbol ?? "",
        project?.headline ?? "",
        project?.nextMilestone ?? "",
        ...entry.artist.updates.flatMap(({ title, summary }) => [title, summary]),
      ].join(" ")).includes(normalizedQuery);
    });
  }, [categoryFilter, externalTalentFilterId, fullCatalog, gradeFilter, query, styleFilter, tokenAvailabilityFilter, tokenPresenceFilter]);
  const rails = useMemo(() => buildRails(catalog), [catalog]);
  const activePlayingArtistId = playingArtistId ?? localPlayingArtistId;
  const publicTalentArtists = useMemo(() => tremplinArtists.filter(isPublicTremplinTalent), []);
  const regions = useMemo(() => [...new Set(publicTalentArtists.map(({ region }) => region))].sort((a, b) => a.localeCompare(b, "fr")), [publicTalentArtists]);
  const cities = useMemo(() => [...new Set(publicTalentArtists
    .filter(({ region }) => regionFilter === "all" || region === regionFilter)
    .map(({ city }) => city))].sort((a, b) => a.localeCompare(b, "fr")), [publicTalentArtists, regionFilter]);
  const wallDraftCities = useMemo(() => [...new Set(publicTalentArtists
    .filter(({ region }) => wallFilterDraft.region === "all" || region === wallFilterDraft.region)
    .map(({ city }) => city))].sort((a, b) => a.localeCompare(b, "fr")), [publicTalentArtists, wallFilterDraft.region]);
  const wallEntries = useMemo(() => {
    const normalizedQuery = normalize(query.trim());
    const wallSource = wallRailId === "watchlist"
      ? buildProjectWallCollection(catalog)
      : [...catalog];
    const filtered = wallSource.filter((entry) => {
      if (regionFilter !== "all" && entry.artist.region !== regionFilter) return false;
      if (cityFilter !== "all" && entry.artist.city !== cityFilter) return false;
      if (!matchesTalentCategory(entry.artist, wallCategoryFilter)) return false;
      if (!normalizedQuery) return true;
      return normalize([
        entry.artist.name,
        getTremplinProfessionLabel(entry.artist),
        ...entry.artist.styles,
        ...entry.artist.disciplines,
        entry.artist.city,
        entry.artist.region,
      ].join(" ")).includes(normalizedQuery);
    });

    if (sort === "relevance") return filtered;
    return [...filtered].sort((left, right) => {
      if (sort === "editorial") return Number(right.artist.editorialSelection) - Number(left.artist.editorialSelection) || stableHash(left.artist.id) - stableHash(right.artist.id);
      if (sort === "recent") return getLatestArtistActivityValue(right.artist) - getLatestArtistActivityValue(left.artist);
      if (sort === "alphabetical") return left.artist.name.localeCompare(right.artist.name, "fr");
      if (sort === "gradeAscending") return left.artist.gradeLevel - right.artist.gradeLevel || left.artist.name.localeCompare(right.artist.name, "fr");
      if (sort === "gradeDescending") return right.artist.gradeLevel - left.artist.gradeLevel || left.artist.name.localeCompare(right.artist.name, "fr");
      return 0;
    });
  }, [catalog, cityFilter, query, regionFilter, sort, wallCategoryFilter, wallRailId]);

  const resetWallPosition = () => {
    setVisibleCount(INITIAL_WALL_COUNT);
    setWallScrollTop(0);
    pendingWallScrollTopRef.current = 0;
    setLoadedAnnouncement("");
    if (wallRailId) writeWallSessionSnapshot({ railId: wallRailId, visibleCount: INITIAL_WALL_COUNT, scrollTop: 0 });
    wallResultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
  };

  const getCurrentWallFilters = (overrides: Partial<WallFilterDraft & { query: string }> = {}) => ({
    query: overrides.query ?? query,
    region: overrides.region ?? regionFilter,
    city: overrides.city ?? cityFilter,
    category: overrides.category ?? wallCategoryFilter,
    style: overrides.style ?? styleFilter,
    grade: overrides.grade ?? gradeFilter,
    tokenStatus: overrides.tokenStatus ?? tokenAvailabilityFilter,
    sort: overrides.sort ?? sort,
  });

  const applyWallFilterValues = (next: WallFilterDraft, historyMode: "push" | "replace" = "push") => {
    writeWallFiltersToUrl(getCurrentWallFilters(next), historyMode);
    setRegionFilter(next.region);
    setCityFilter(next.city);
    setWallCategoryFilter(next.category);
    setStyleFilter(next.style);
    setGradeFilter(next.grade);
    setTokenAvailabilityFilter(next.tokenStatus);
    setSort(next.sort);
    setWallFilterDraft(next);
    setWallFilterOpen(false);
    resetWallPosition();
  };

  const resetWallFilters = (historyMode: "push" | "replace" = "push") => {
    const reset: WallFilterDraft = {
      region: "all",
      city: "all",
      category: "all",
      style: "all",
      grade: "all",
      tokenStatus: "all",
      sort: "relevance",
    };
    setQuery("");
    writeWallFiltersToUrl({ ...reset, query: "" }, historyMode);
    setRegionFilter(reset.region);
    setCityFilter(reset.city);
    setWallCategoryFilter(reset.category);
    setStyleFilter(reset.style);
    setGradeFilter(reset.grade);
    setTokenAvailabilityFilter(reset.tokenStatus);
    setSort(reset.sort);
    setWallFilterDraft(reset);
    setWallFilterOpen(false);
    resetWallPosition();
  };

  useEffect(() => {
    if (!wallRailId) return;
    writeWallFiltersToUrl(getCurrentWallFilters(), "replace");
  }, [cityFilter, gradeFilter, query, regionFilter, sort, styleFilter, tokenAvailabilityFilter, wallCategoryFilter, wallRailId]);

  useEffect(() => {
    if (!wallRailId) return undefined;
    const restoreWallFilters = () => {
      const restored = readWallFiltersFromUrl(DEFAULT_TREMPLIN_DISCOVERY_STATE);
      if (!restored) return;
      setQuery(restored.query);
      setRegionFilter(restored.region);
      setCityFilter(restored.city);
      setWallCategoryFilter(restored.category);
      setStyleFilter(restored.style);
      setGradeFilter(restored.grade);
      setTokenAvailabilityFilter(restored.tokenStatus);
      setSort(restored.sort);
      setWallFilterDraft({
        region: restored.region,
        city: restored.city,
        category: restored.category,
        style: restored.style,
        grade: restored.grade,
        tokenStatus: restored.tokenStatus,
        sort: restored.sort,
      });
      setVisibleCount(INITIAL_WALL_COUNT);
      wallResultsRef.current?.scrollTo({ top: 0, behavior: "auto" });
    };
    window.addEventListener("popstate", restoreWallFilters);
    return () => window.removeEventListener("popstate", restoreWallFilters);
  }, [wallRailId]);
  useEffect(() => {
    if (isLeavingForProfileRef.current) return;
    onStateChange?.({ query, styleFilter, categoryFilter, gradeFilter, tokenPresenceFilter, tokenAvailabilityFilter, newOnly, verifiedOnly, nearMeOnly, showAdvancedFilters, regionFilter, cityFilter, wallCategoryFilter, sort, visibleCount, wallScrollTop });
  }, [categoryFilter, cityFilter, gradeFilter, nearMeOnly, newOnly, onStateChange, query, regionFilter, showAdvancedFilters, sort, styleFilter, tokenAvailabilityFilter, tokenPresenceFilter, verifiedOnly, visibleCount, wallCategoryFilter, wallScrollTop]);
  useEffect(() => {
    if (cityFilter !== "all" && !cities.includes(cityFilter)) setCityFilter("all");
  }, [cities, cityFilter]);

  useEffect(() => {
    const root = wallResultsRef.current;
    const sentinel = wallSentinelRef.current;
    if (!root || !sentinel || visibleCount >= wallEntries.length || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || isLoadingMore) return;
      setIsLoadingMore(true);
      window.requestAnimationFrame(() => {
        setVisibleCount((current) => {
          const next = Math.min(current + WALL_PAGE_SIZE, wallEntries.length);
          setLoadedAnnouncement(`${next - current} artistes supplémentaires chargés — ${next} affichés.`);
          return next;
        });
        setIsLoadingMore(false);
      });
    }, { root, rootMargin: "900px 0px", threshold: 0.01 });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleCount, wallEntries.length]);

  useLayoutEffect(() => {
    if (!wallRailId || hasRestoredWallScrollRef.current || !wallResultsRef.current) return;
    if (restoredWallSession && restoredWallSession.railId !== wallRailId) return;
    hasRestoredWallScrollRef.current = true;
    wallResultsRef.current.scrollTop = restoredWallScrollTop;
  }, [restoredWallScrollTop, restoredWallSession, wallRailId]);

  useEffect(() => () => {
    if (wallScrollFrameRef.current !== null) window.cancelAnimationFrame(wallScrollFrameRef.current);
  }, []);

  const handleWallScroll = (nextScrollTop: number) => {
    pendingWallScrollTopRef.current = nextScrollTop;
    if (wallScrollFrameRef.current !== null) return;
    wallScrollFrameRef.current = window.requestAnimationFrame(() => {
      setWallScrollTop(pendingWallScrollTopRef.current);
      wallScrollFrameRef.current = null;
    });
  };

  useEffect(() => {
    if (!selectedEntry) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => detailDialogRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEntry(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEntry]);

  const toggleArtistAudio = (artistId: string) => {
    if (onToggleArtistAudio) {
      onToggleArtistAudio(artistId);
      return;
    }
    setLocalPlayingArtistId((current) => current === artistId ? null : artistId);
  };

  const persistBeforeProfileNavigation = () => {
    isLeavingForProfileRef.current = true;
    if (wallRailId) {
      writeWallSessionSnapshot({
        railId: wallRailId,
        visibleCount,
        scrollTop: pendingWallScrollTopRef.current,
      });
    }
    onStateChange?.({
      query,
      styleFilter,
      categoryFilter,
      gradeFilter,
      tokenPresenceFilter,
      tokenAvailabilityFilter,
      newOnly,
      verifiedOnly,
      nearMeOnly,
      showAdvancedFilters,
      regionFilter,
      cityFilter,
      wallCategoryFilter,
      sort,
      visibleCount,
      wallScrollTop: pendingWallScrollTopRef.current,
    });
  };

  const openDetail = (entry: TalentEntry, source: readonly TalentEntry[]) => {
    if (onOpenArtist) {
      persistBeforeProfileNavigation();
      window.requestAnimationFrame(() => onOpenArtist(entry.artist));
      return;
    }
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedEntry(entry);
    setDetailSourceIds(source.map(({ artist }) => artist.id));
  };

  const openTokenDetail = (entry: TalentEntry, source: readonly TalentEntry[]) => {
    if (getTremplinTokenLifecycleStage(entry.artist) === "observation" && onOpenArtist) {
      persistBeforeProfileNavigation();
      window.requestAnimationFrame(() => onOpenArtist(entry.artist));
      return;
    }
    if (!onOpenArtistToken) {
      openDetail(entry, source);
      return;
    }
    persistBeforeProfileNavigation();
    window.requestAnimationFrame(() => onOpenArtistToken(entry.artist));
  };

  const openStatistics = (entry: TalentEntry, source: readonly TalentEntry[]) => {
    if (!onOpenArtistStatistics) {
      openDetail(entry, source);
      return;
    }
    persistBeforeProfileNavigation();
    window.requestAnimationFrame(() => onOpenArtistStatistics(entry.artist));
  };

  const closeDetail = () => {
    setSelectedEntry(null);
    window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
  };

  const navigateDetail = (direction: -1 | 1) => {
    if (!selectedEntry || detailSourceIds.length < 2) return;
    const currentIndex = Math.max(0, detailSourceIds.indexOf(selectedEntry.artist.id));
    const nextId = detailSourceIds[(currentIndex + direction + detailSourceIds.length) % detailSourceIds.length];
    const next = catalog.find(({ artist }) => artist.id === nextId);
    if (next) setSelectedEntry(next);
  };

  const selectedPalette = selectedEntry?.palette ?? PROFILE_PALETTES[0];
  const selectedRole = selectedEntry ? getTremplinRoleProfile(selectedEntry.artist) : null;
  const selectedProfession = selectedEntry ? getTremplinProfessionLabel(selectedEntry.artist) : null;
  const selectedProject = selectedEntry ? getTremplinProjectSnapshot(selectedEntry.artist) : null;
  const visibleRails = rails.filter((rail) => rail.entries.length > 0);
  const advancedFilterCount = [
    categoryFilter !== "all",
    styleFilter !== "all",
    gradeFilter !== "all",
    tokenPresenceFilter !== "all",
    tokenAvailabilityFilter !== "all",
  ].filter(Boolean).length;
  const catalogIsFiltered = Boolean(query.trim()) || styleFilter !== "all" || categoryFilter !== "all" || gradeFilter !== "all" || tokenPresenceFilter !== "all" || tokenAvailabilityFilter !== "all";
  const resetCatalogFilters = () => {
    const resetFilters: DiscoveryFilterDraft = {
      category: "all",
      style: "all",
      grade: "all",
      tokenPresence: "all",
      tokenStatus: "all",
    };
    setQuery("");
    setStyleFilter(resetFilters.style);
    setCategoryFilter(resetFilters.category);
    setGradeFilter(resetFilters.grade);
    setTokenPresenceFilter(resetFilters.tokenPresence);
    setTokenAvailabilityFilter(resetFilters.tokenStatus);
    setDiscoveryFilterDraft(resetFilters);
    setShowAdvancedFilters(false);
    setNewOnly(false);
    setVerifiedOnly(false);
    setNearMeOnly(false);
  };

  const appliedDiscoveryFilters: DiscoveryFilterDraft = {
    category: categoryFilter,
    style: styleFilter,
    grade: gradeFilter,
    tokenPresence: tokenPresenceFilter,
    tokenStatus: tokenAvailabilityFilter,
  };
  const applyDiscoveryFilters = (next: DiscoveryFilterDraft) => {
    setCategoryFilter(next.category);
    setStyleFilter(next.style);
    setGradeFilter(next.grade);
    setTokenPresenceFilter(next.tokenPresence);
    setTokenAvailabilityFilter(next.tokenStatus);
    setShowAdvancedFilters(false);
  };
  const activeDiscoveryFilters: MeewavActiveFilter[] = [];
  if (categoryFilter !== "all") activeDiscoveryFilters.push({
    id: "discovery-category",
    label: TREMPLIN_TALENT_CATEGORIES.find(({ id }) => id === categoryFilter)?.label ?? categoryFilter,
    onRemove: () => setCategoryFilter("all"),
  });
  if (styleFilter !== "all") activeDiscoveryFilters.push({ id: "discovery-style", label: styleFilter, onRemove: () => setStyleFilter("all") });
  if (gradeFilter !== "all") activeDiscoveryFilters.push({ id: "discovery-grade", label: `Niveau ${gradeFilter}`, onRemove: () => setGradeFilter("all") });
  if (tokenPresenceFilter !== "all") activeDiscoveryFilters.push({ id: "discovery-presence", label: tokenPresenceFilter === "with" ? "Avec jeton actif" : "Sans jeton actif", onRemove: () => setTokenPresenceFilter("all") });
  if (tokenAvailabilityFilter !== "all") activeDiscoveryFilters.push({
    id: "discovery-status",
    label: TREMPLIN_DISCOVERY_TOKEN_UI[tokenAvailabilityFilter].label,
    onRemove: () => setTokenAvailabilityFilter("all"),
  });

  const appliedWallDraft: WallFilterDraft = {
    region: regionFilter,
    city: cityFilter,
    category: wallCategoryFilter,
    style: styleFilter,
    grade: gradeFilter,
    tokenStatus: tokenAvailabilityFilter,
    sort,
  };
  const wallActiveFilterCount = [
    regionFilter !== "all",
    cityFilter !== "all",
    wallCategoryFilter !== "all",
    styleFilter !== "all",
    gradeFilter !== "all",
    tokenAvailabilityFilter !== "all",
    sort !== "relevance",
  ].filter(Boolean).length;
  const updateOneWallFilter = (updates: Partial<WallFilterDraft>) => {
    applyWallFilterValues({ ...appliedWallDraft, ...updates });
  };
  const activeWallFilters: MeewavActiveFilter[] = [];
  if (regionFilter !== "all") activeWallFilters.push({ id: "region", label: regionFilter, onRemove: () => updateOneWallFilter({ region: "all", city: "all" }) });
  if (cityFilter !== "all") activeWallFilters.push({ id: "city", label: cityFilter, onRemove: () => updateOneWallFilter({ city: "all" }) });
  if (wallCategoryFilter !== "all") activeWallFilters.push({
    id: "category",
    label: TREMPLIN_TALENT_CATEGORIES.find(({ id }) => id === wallCategoryFilter)?.label ?? wallCategoryFilter,
    onRemove: () => updateOneWallFilter({ category: "all" }),
  });
  if (styleFilter !== "all") activeWallFilters.push({ id: "style", label: styleFilter, onRemove: () => updateOneWallFilter({ style: "all" }) });
  if (gradeFilter !== "all") activeWallFilters.push({ id: "grade", label: `Niveau ${gradeFilter}`, onRemove: () => updateOneWallFilter({ grade: "all" }) });
  if (tokenAvailabilityFilter !== "all") activeWallFilters.push({
    id: "tokenStatus",
    label: TREMPLIN_DISCOVERY_TOKEN_UI[tokenAvailabilityFilter].label,
    onRemove: () => updateOneWallFilter({ tokenStatus: "all" }),
  });
  if (sort !== "relevance") activeWallFilters.push({
    id: "sort",
    label: sort === "recent" ? "Activité récente" : sort === "gradeAscending" ? "Grade croissant" : "Grade décroissant",
    onRemove: () => updateOneWallFilter({ sort: "relevance" }),
  });

  const discoverySearch = (<section className="tremplin-home-discovery__hero" aria-label="Rechercher et filtrer les artistes">
            <div className="tremplin-home-discovery__finder">
              <MeewavSearchFilterBar
                placement="flow"
                className="tremplin-home-discovery__globe-search"
                inputId="tremplin-home-search"
                query={query}
                placeholder="Rechercher un artiste, un projet ou un symbole de jeton"
                inputAriaLabel="Rechercher un artiste, un projet ou un symbole de jeton"
                onQueryChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  writeDiscoveryQueryToUrl(nextQuery);
                }}
                onClear={() => {
                  setQuery("");
                  writeDiscoveryQueryToUrl("");
                }}
                onToggleFilters={() => {
                  if (!showAdvancedFilters) setDiscoveryFilterDraft(appliedDiscoveryFilters);
                  setShowAdvancedFilters((visible) => !visible);
                }}
                filterOpen={showAdvancedFilters}
                filterActive={advancedFilterCount > 0}
                activeFilterCount={advancedFilterCount}
                filterPanelId="tremplin-discovery-filter-drawer"
                filterTriggerRef={discoveryFilterTriggerRef}
              />
              <MeewavActiveFilterChips filters={activeDiscoveryFilters} onClear={resetCatalogFilters} />
            </div>
          </section>);

  return (
    <section className="tremplin-home-discovery" aria-label="Découvrir les artistes du Tremplin">
      {wallRailId === null ? (
        <>
          {catalogIsFiltered ? discoverySearch : null}

          <MeewavFilterPanel
            open={showAdvancedFilters}
            panelId="tremplin-discovery-filter-drawer"
            eyebrow="Exploration personnalisée"
            title="Filtres artistes"
            description="Affiche les projets qui correspondent à tes critères."
            triggerRef={discoveryFilterTriggerRef}
            boundarySelector=".tremplin-scroll"
            onClose={() => {
              setDiscoveryFilterDraft(appliedDiscoveryFilters);
              setShowAdvancedFilters(false);
            }}
            onReset={() => setDiscoveryFilterDraft({ category: "all", style: "all", grade: "all", tokenPresence: "all", tokenStatus: "all" })}
            onApply={() => applyDiscoveryFilters(discoveryFilterDraft)}
            selectionHint="Applique ces critères pour mettre à jour la sélection."
          >
            <MeewavFilterSection label="Profil artistique" summary={discoveryFilterDraft.category === "all" && discoveryFilterDraft.style === "all" ? "Tous" : "Affiné"}>
              <div className="tremplin-wall-filter-fields">
                <label className="meewav-filter-field"><span>Métier ou catégorie</span><select value={discoveryFilterDraft.category} onChange={(event) => setDiscoveryFilterDraft((current) => ({ ...current, category: event.target.value as TremplinTalentCategoryId }))}>{TREMPLIN_TALENT_CATEGORIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
                <label className="meewav-filter-field"><span>Style musical</span><select value={discoveryFilterDraft.style} onChange={(event) => setDiscoveryFilterDraft((current) => ({ ...current, style: event.target.value }))}><option value="all">Tous les styles</option>{tremplinStyles.map((style) => <option key={style} value={style}>{style}</option>)}</select></label>
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="Grade MeeWav" summary={discoveryFilterDraft.grade === "all" ? "Tous" : `Niveau ${discoveryFilterDraft.grade}`}>
              <div className="artist-filter-panel__options artist-filter-panel__options--grades">
                {[1, 2, 3, 4, 5, 6].map((level) => {
                  const active = discoveryFilterDraft.grade === String(level);
                  return <button key={level} type="button" className={`artist-filter-grade${active ? " is-active" : ""}`} aria-pressed={active} onClick={() => setDiscoveryFilterDraft((current) => ({ ...current, grade: active ? "all" : String(level) as GradeFilter }))}><MeewavGradeBadge level={level} size="sm" variant="icon" /><span><strong>{TREMPLIN_GRADE_EXPERIENCE[level as keyof typeof TREMPLIN_GRADE_EXPERIENCE].title}</strong><small>Niveau {level}</small></span></button>;
                })}
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="Disponibilité du jeton" summary={discoveryFilterDraft.tokenPresence === "all" ? "Tous" : discoveryFilterDraft.tokenPresence === "with" ? "Actif" : "Sans jeton actif"}>
              <div className="meewav-filter-choice-grid">
                {([['all', 'Tous les artistes'], ['with', 'Avec un jeton actif'], ['without', 'Sans jeton actif']] as const).map(([value, label]) => <button key={value} type="button" className={`meewav-filter-choice${discoveryFilterDraft.tokenPresence === value ? " is-active" : ""}`} aria-pressed={discoveryFilterDraft.tokenPresence === value} onClick={() => setDiscoveryFilterDraft((current) => ({ ...current, tokenPresence: value }))}>{label}</button>)}
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="État du jeton de talent" summary={discoveryFilterDraft.tokenStatus === "all" ? "Tous" : TREMPLIN_DISCOVERY_TOKEN_UI[discoveryFilterDraft.tokenStatus].label}>
              <div className="meewav-filter-choice-grid">
                {TOKEN_STATUS_FILTER_VALUES.map((status) => <button key={status} type="button" className={`meewav-filter-choice${discoveryFilterDraft.tokenStatus === status ? " is-active" : ""}`} aria-pressed={discoveryFilterDraft.tokenStatus === status} onClick={() => setDiscoveryFilterDraft((current) => ({ ...current, tokenStatus: current.tokenStatus === status ? "all" : status }))}>{TREMPLIN_DISCOVERY_TOKEN_UI[status].label}</button>)}
              </div>
            </MeewavFilterSection>
          </MeewavFilterPanel>

          {catalogIsFiltered ? (
            <section className="tremplin-home-discovery__filtered-results" aria-live="polite">
              <header>
                <div><span className="tremplin-home-discovery__eyebrow">Résultats</span><h2>{catalog.length} {catalog.length > 1 ? "artistes correspondent" : "artiste correspond"}</h2><p>Les résultats réunissent les créations et profils liés à ta recherche, sans classement financier.</p></div>
                <button type="button" onClick={resetCatalogFilters}>Tout réinitialiser</button>
              </header>
              {catalog.length > 0 ? <div className="tremplin-home-wall__grid">
                {catalog.map((entry, index) => <ProjectMiniCard
                  key={entry.artist.id}
                  entry={entry}
                  railId="editorial"
                  variant="wall"
                  playing={activePlayingArtistId === entry.artist.id}
                  followed={followedArtistIds.has(entry.artist.id)}
                  eager={index < 4}
                  instanceId={`filtered-${entry.artist.id}`}
                  onOpen={() => openDetail(entry, catalog)}
                  onOpenToken={() => openTokenDetail(entry, catalog)}
                  onOpenStatistics={() => openStatistics(entry, catalog)}
                  onToggleAudio={() => toggleArtistAudio(entry.artist.id)}
                  onToggleFollow={() => onToggleFollow?.(entry.artist.id)}
                />)}
              </div> : <div className="tremplin-home-discovery__empty"><Search /><strong>Aucun artiste trouvé</strong><span>Essaie un autre nom, un autre style ou enlève un filtre.</span></div>}
            </section>
          ) : <div className="tremplin-home-discovery__rails">
              {visibleRails.map((rail) => (
                <TalentRail
                  key={rail.id}
                  rail={rail}
                  search={rail.id === "weekly" ? discoverySearch : undefined}
                  playingArtistId={activePlayingArtistId}
                  followedArtistIds={followedArtistIds}
                  onToggleAudio={toggleArtistAudio}
                  onToggleFollow={(artistId) => onToggleFollow?.(artistId)}
                  onOpen={openDetail}
                  onOpenToken={openTokenDetail}
                  onOpenStatistics={openStatistics}
                  onSeeAll={() => {
                    writeWallSessionSnapshot({ railId: rail.id, visibleCount: INITIAL_WALL_COUNT, scrollTop: 0 });
                    onWallRailIdChange(rail.id);
                    resetWallPosition();
                  }}
                />
              ))}
              {visibleRails.length === 0 ? <div className="tremplin-home-discovery__empty"><Search /><strong>Aucun artiste trouvé</strong><span>Essaie un autre nom, un autre style ou élargis la zone.</span></div> : null}
            </div>}
        </>
      ) : (
        <section className="tremplin-home-wall" aria-label="Sélection complète des artistes Tremplin">
          <div className="tremplin-home-wall__toolbar">
            <MeewavSearchFilterBar
              placement="flow"
              query={query}
              placeholder="Rechercher artiste, projet ou jeton"
              inputAriaLabel="Rechercher un artiste, un projet ou un symbole de jeton"
              onQueryChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                writeWallFiltersToUrl(getCurrentWallFilters({ query: nextQuery }), "replace");
                resetWallPosition();
              }}
              onClear={() => {
                setQuery("");
                writeWallFiltersToUrl(getCurrentWallFilters({ query: "" }), "replace");
                resetWallPosition();
              }}
              onToggleFilters={() => {
                if (!wallFilterOpen) setWallFilterDraft(appliedWallDraft);
                setWallFilterOpen((open) => !open);
              }}
              filterOpen={wallFilterOpen}
              filterActive={wallActiveFilterCount > 0}
              activeFilterCount={wallActiveFilterCount}
              filterPanelId="tremplin-project-filter-drawer"
              filterTriggerRef={wallFilterTriggerRef}
            />
            <MeewavActiveFilterChips filters={activeWallFilters} onClear={() => resetWallFilters()} />
          </div>
          <header className="tremplin-home-wall__heading">
            <div>
              <span>Mur des projets</span>
              <h1>{wallRailId === "watchlist" ? "Tous les projets du Tremplin" : "Tous les projets de la sélection"}</h1>
              <p>{wallRailId === "watchlist" ? "Des voix, quelques instrumentistes et DJ, présentés pour leur projet — jamais classés selon le prix ou les achats." : "Affine la sélection puis explore chaque parcours à ton rythme."}</p>
            </div>
            <strong aria-live="polite">{wallEntries.length} projets</strong>
          </header>

          <MeewavFilterPanel
            open={wallFilterOpen}
            panelId="tremplin-project-filter-drawer"
            eyebrow="Exploration personnalisée"
            title="Filtres des projets"
            description="Affine le mur sans classer les artistes selon les achats."
            triggerRef={wallFilterTriggerRef}
            boundarySelector=".tremplin-scroll"
            onClose={() => {
              setWallFilterDraft(appliedWallDraft);
              setWallFilterOpen(false);
            }}
            onReset={() => setWallFilterDraft({ region: "all", city: "all", category: "all", style: "all", grade: "all", tokenStatus: "all", sort: "relevance" })}
            onApply={() => applyWallFilterValues(wallFilterDraft)}
            selectionHint={`${wallEntries.length.toLocaleString("fr-FR")} projets correspondent aux filtres appliqués.`}
          >
            <MeewavFilterSection label="Localisation" summary={wallFilterDraft.city !== "all" ? wallFilterDraft.city : wallFilterDraft.region !== "all" ? wallFilterDraft.region : "Toute la France"}>
              <div className="tremplin-wall-filter-fields">
                <label className="meewav-filter-field"><span>Région</span><select value={wallFilterDraft.region} onChange={(event) => setWallFilterDraft((current) => ({ ...current, region: event.target.value, city: "all" }))}><option value="all">Toutes les régions</option>{regions.map((region) => <option key={region}>{region}</option>)}</select></label>
                <label className="meewav-filter-field"><span>Ville</span><select value={wallFilterDraft.city} onChange={(event) => setWallFilterDraft((current) => ({ ...current, city: event.target.value }))}><option value="all">Toutes les villes</option>{wallDraftCities.map((city) => <option key={city}>{city}</option>)}</select></label>
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="Profil artistique" summary={wallFilterDraft.category === "all" && wallFilterDraft.style === "all" ? "Tous" : "Affiné"}>
              <div className="tremplin-wall-filter-fields">
                <label className="meewav-filter-field"><span>Métier ou catégorie</span><select value={wallFilterDraft.category} onChange={(event) => setWallFilterDraft((current) => ({ ...current, category: event.target.value as TremplinTalentCategoryId }))}>{TREMPLIN_TALENT_CATEGORIES.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}</select></label>
                <label className="meewav-filter-field"><span>Style musical</span><select value={wallFilterDraft.style} onChange={(event) => setWallFilterDraft((current) => ({ ...current, style: event.target.value }))}><option value="all">Tous les styles</option>{tremplinStyles.map((style) => <option key={style} value={style}>{style}</option>)}</select></label>
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="Grade MeeWav" summary={wallFilterDraft.grade === "all" ? "Tous" : `Niveau ${wallFilterDraft.grade}`}>
              <div className="artist-filter-panel__options artist-filter-panel__options--grades">
                {[1, 2, 3, 4, 5, 6].map((level) => {
                  const active = wallFilterDraft.grade === String(level);
                  return <button key={level} type="button" className={`artist-filter-grade${active ? " is-active" : ""}`} aria-pressed={active} onClick={() => setWallFilterDraft((current) => ({ ...current, grade: active ? "all" : String(level) as GradeFilter }))}><MeewavGradeBadge level={level} size="sm" variant="icon" /><span><strong>{TREMPLIN_GRADE_EXPERIENCE[level as keyof typeof TREMPLIN_GRADE_EXPERIENCE].title}</strong><small>Niveau {level}</small></span></button>;
                })}
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="État du jeton de talent" summary={wallFilterDraft.tokenStatus === "all" ? "Tous" : TREMPLIN_DISCOVERY_TOKEN_UI[wallFilterDraft.tokenStatus].label}>
              <div className="meewav-filter-choice-grid">
                {TOKEN_STATUS_FILTER_VALUES.map((status) => <button key={status} type="button" className={`meewav-filter-choice${wallFilterDraft.tokenStatus === status ? " is-active" : ""}`} aria-pressed={wallFilterDraft.tokenStatus === status} onClick={() => setWallFilterDraft((current) => ({ ...current, tokenStatus: current.tokenStatus === status ? "all" : status }))}>{TREMPLIN_DISCOVERY_TOKEN_UI[status].label}</button>)}
              </div>
            </MeewavFilterSection>

            <MeewavFilterSection label="Tri" summary={wallFilterDraft.sort === "relevance" ? "Pertinence" : wallFilterDraft.sort === "recent" ? "Activité récente" : wallFilterDraft.sort === "gradeAscending" ? "Grade croissant" : "Grade décroissant"}>
              <div className="meewav-filter-choice-grid">
                {([
                  ["relevance", "Pertinence"],
                  ["recent", "Activité récente"],
                  ["gradeAscending", "Grade croissant"],
                  ["gradeDescending", "Grade décroissant"],
                ] as const).map(([value, label]) => <button key={value} type="button" className={`meewav-filter-choice${wallFilterDraft.sort === value ? " is-active" : ""}`} aria-pressed={wallFilterDraft.sort === value} onClick={() => setWallFilterDraft((current) => ({ ...current, sort: value }))}>{label}</button>)}
              </div>
            </MeewavFilterSection>
          </MeewavFilterPanel>

          <div
            ref={wallResultsRef}
            className="tremplin-home-wall__results"
            role="region"
            aria-label="Mur à défilement des projets"
            aria-busy={isLoadingMore}
            tabIndex={0}
            onScroll={(event) => handleWallScroll(event.currentTarget.scrollTop)}
          >
            {wallEntries.length > 0 ? (
              <div className="tremplin-home-wall__grid">
                {wallEntries.slice(0, visibleCount).map((entry, index) => (
                  <ProjectMiniCard
                    key={entry.artist.id}
                    entry={entry}
                    railId={wallRailId}
                    variant="wall"
                    playing={activePlayingArtistId === entry.artist.id}
                    followed={followedArtistIds.has(entry.artist.id)}
                    eager={index < 4}
                    instanceId={`wall-${wallRailId}-${entry.artist.id}`}
                    onOpen={() => openDetail(entry, wallEntries)}
                    onOpenToken={() => openTokenDetail(entry, wallEntries)}
                    onOpenStatistics={() => openStatistics(entry, wallEntries)}
                    onToggleAudio={() => toggleArtistAudio(entry.artist.id)}
                    onToggleFollow={() => onToggleFollow?.(entry.artist.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="tremplin-home-wall__empty" role="status">
                <Search size={26} />
                <strong>Aucun projet ne correspond à ces critères.</strong>
                <span>Modifie les filtres ou réinitialise la sélection.</span>
                <div>
                  <button type="button" onClick={() => {
                    setWallFilterDraft(appliedWallDraft);
                    setWallFilterOpen(true);
                  }}>Modifier les filtres</button>
                  <button type="button" onClick={() => resetWallFilters()}>Tout réinitialiser</button>
                </div>
              </div>
            )}

            {visibleCount < wallEntries.length ? (
              <>
                <div ref={wallSentinelRef} className="tremplin-home-wall__sentinel" aria-hidden="true" />
                <button
                  type="button"
                  className="tremplin-home-wall__load-more"
                  disabled={isLoadingMore}
                  onClick={() => {
                    setVisibleCount((current) => {
                      const next = Math.min(current + WALL_PAGE_SIZE, wallEntries.length);
                      setLoadedAnnouncement(`${next - current} artistes supplémentaires chargés — ${next} affichés.`);
                      return next;
                    });
                  }}
                >
                  {isLoadingMore ? "Chargement des projets…" : "Charger la suite"}
                </button>
              </>
            ) : wallEntries.length > 0 ? <p className="tremplin-home-wall__end">Tous les projets disponibles sont affichés.</p> : null}
            <p className="tremplin-visually-hidden" role="status" aria-live="polite">{loadedAnnouncement}</p>
          </div>
        </section>
      )}

      {selectedEntry ? (
        <div className="tremplin-home-detail" role="presentation">
          <button type="button" className="tremplin-home-detail__backdrop" aria-label="Fermer la fiche" onClick={closeDetail} />
          <article
            ref={detailDialogRef}
            className="tremplin-home-detail__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${chartId}-detail-name`}
            tabIndex={-1}
            style={{ "--talent-accent": selectedPalette.accent } as CSSProperties}
          >
            <button type="button" className="tremplin-home-detail__close" onClick={closeDetail} aria-label="Fermer"><X /></button>
            <div className="tremplin-home-detail__nav" role="group" aria-label="Parcourir les artistes">
              <button type="button" onClick={() => navigateDetail(-1)} aria-label="Artiste précédent"><ChevronLeft /></button>
              <button type="button" onClick={() => navigateDetail(1)} aria-label="Artiste suivant"><ChevronRight /></button>
            </div>

            <div className="tremplin-home-detail__visual">
              <img src={selectedEntry.artist.artwork} alt={`Visuel de ${selectedEntry.artist.name}`} decoding="async" />
              <span>{selectedProfession}</span>
              <div>
                <small>{selectedRole?.familyLabel ?? "Écosystème Tremplin"}</small>
                <strong>{selectedEntry.artist.name}</strong>
                <p>{selectedEntry.artist.city} · {selectedEntry.artist.region}</p>
              </div>
            </div>

            <div className="tremplin-home-detail__content">
              <header className="tremplin-home-detail__identity">
                <span className="tremplin-home-detail__eyebrow"><Sparkles size={14} /> Profil de démonstration</span>
                <div className="tremplin-home-detail__name">
                  <h2 id={`${chartId}-detail-name`}>{selectedEntry.artist.name}</h2>
                  <MeewavGradeBadge level={selectedEntry.artist.gradeLevel} size="sm" />
                </div>
                <p>{selectedProfession} · {selectedEntry.artist.styles.join(" · ")}</p>
                <small><MapPin size={14} /> {selectedEntry.artist.city} · {selectedEntry.artist.region}</small>
              </header>

              <button
                type="button"
                className="tremplin-home-detail__audio"
                aria-label={`${activePlayingArtistId === selectedEntry.artist.id ? "Mettre en pause" : "Écouter"} ${selectedEntry.artist.audio.title}`}
                onClick={() => toggleArtistAudio(selectedEntry.artist.id)}
              >
                <span>{activePlayingArtistId === selectedEntry.artist.id ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</span>
                <div><strong>{selectedEntry.artist.audio.title}</strong><small>{selectedEntry.artist.audio.subtitle}</small></div>
                <i aria-hidden="true">{selectedEntry.artist.audio.waveform.slice(0, 42).map((height, index) => <b key={index} style={{ "--wave-height": `${Math.max(16, height * 100)}%` } as CSSProperties} />)}</i>
                <em><Headphones size={14} /> {selectedEntry.artist.audio.durationLabel}</em>
              </button>

              <section className="tremplin-home-detail__project" aria-label="Ce que l’artiste construit">
                <header>
                  <div><small>Son parcours en ce moment</small><h3>{selectedProject?.headline ?? selectedEntry.artist.stageLabel}</h3></div>
                  <strong>Niveau {selectedEntry.artist.gradeLevel} · {TREMPLIN_GRADE_EXPERIENCE[selectedEntry.artist.gradeLevel].title}</strong>
                </header>
                <p><b>Prochaine étape</b>{selectedProject?.nextMilestone ?? selectedEntry.artist.biography}</p>
                <ul>
                  {(selectedProject?.proofPoints ?? selectedEntry.artist.updates.map(({ title }) => title)).slice(0, 3).map((proof) => <li key={proof}>{proof}</li>)}
                </ul>
              </section>

              <div className="tremplin-home-detail__story">
                <section className="tremplin-home-detail__community">
                  <span><UsersRound size={16} /> Abonnés</span>
                  <h3>{formatCompact(selectedEntry.artist.community.memberCount)} abonnés sur MeeWav</h3>
                  <p>+{selectedEntry.artist.community.newMembers30Days} nouveaux abonnés ces 30 derniers jours.</p>
                </section>
                <section className="tremplin-home-detail__updates">
                  <span><CalendarDays size={16} /> Dernière actualité</span>
                  <h3>{selectedEntry.artist.updates[0]?.title ?? selectedEntry.artist.stageLabel}</h3>
                  <p>{selectedEntry.artist.updates[0]?.summary ?? selectedEntry.artist.biography}</p>
                  <small><Clock3 size={13} /> {selectedEntry.artist.updates[0]?.dateLabel ?? "Actualité du profil"}</small>
                </section>
              </div>

              <div className="tremplin-home-detail__stats" aria-label="Repères de l’artiste">
                <span><small>Grade actuel</small><strong>Niveau {selectedEntry.artist.gradeLevel}</strong><em>{TREMPLIN_GRADE_EXPERIENCE[selectedEntry.artist.gradeLevel].title}</em></span>
                <span><small>Étapes publiées</small><strong>{selectedEntry.artist.updates.length}</strong><em>dans son parcours</em></span>
                <span><small>Abonnés</small><strong>{formatCompact(selectedEntry.artist.community.memberCount)}</strong><em>suivi gratuit</em></span>
                <span><small>Room</small><strong>{selectedEntry.token ? selectedEntry.token.nextRoom.dateLabel : "À venir"}</strong><em>{selectedEntry.token ? selectedEntry.token.nextRoom.title : "Aucune Room annoncée"}</em></span>
              </div>

              <div className="tremplin-home-detail__actions">
                <button type="button" onClick={() => toggleArtistAudio(selectedEntry.artist.id)}><Play size={16} /> Écouter</button>
                <button type="button" className={followedArtistIds.has(selectedEntry.artist.id) ? "is-followed" : ""} aria-pressed={followedArtistIds.has(selectedEntry.artist.id)} onClick={() => onToggleFollow?.(selectedEntry.artist.id)}><Heart size={16} fill={followedArtistIds.has(selectedEntry.artist.id) ? "currentColor" : "none"} /> {followedArtistIds.has(selectedEntry.artist.id) ? "Artiste suivi" : "Suivre gratuitement"}</button>
                <button type="button" className="is-primary" onClick={() => onOpenArtist?.(selectedEntry.artist)}><UserRound size={16} /> Voir le profil</button>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
