import { getDesktopApplicationMode } from "../../runtime/applicationMode";
import {
  AlertTriangle,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ChartNoAxesColumnIncreasing,
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Heart,
  History,
  Home,
  Info,
  ChartNoAxesCombined,
  LineChart,
  LockKeyhole,
  MapPin,
  MousePointerClick,
  Music2,
  Pause,
  Play,
  Radio,
  Rocket,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs from "../../components/navigation/MeewavPillarTabs";
import { useAuth } from "../auth/AuthContext";
import { isLocalAuthPreviewEnabled } from "../auth/localAuthPreview";
import { isCanonicalProfileId } from "../globe/api/preProfile.api";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import TremplinGradeSystem from "./TremplinGradeSystem";
import TremplinDemoBanner from "./TremplinDemoBanner";
import MeewavTokenIcon from "./MeewavTokenIcon";
import TremplinHomeExperience, {
  DEFAULT_TREMPLIN_DISCOVERY_STATE,
  type TremplinDiscoveryState,
  type TremplinDiscoveryRailId,
} from "./TremplinHomeExperience";
import { trackTremplinEvent } from "./tremplinAnalytics";
import { TREMPLIN_FEATURE_FLAGS } from "./tremplinFeatureFlags";
import { loadConnectedTremplinFollows, persistTremplinFollow } from "./tremplinFollowService";
import { readTremplinPersistedSet, writeTremplinPersistedSet } from "./tremplinPersistence";
import TremplinPublicHome from "./TremplinPublicHome";
import TremplinTokenEducation, { TremplinCurveExplainer } from "./TremplinTokenEducation";
import TremplinTokenFlow from "./TremplinTokenFlow";
import TremplinTokenChange24h from "./TremplinTokenChange24h";
import TremplinTokenWorkspace from "./TremplinTokenWorkspace";
import {
  formatTremplinTokenPrice,
  formatTremplinTokenUpdatedAt,
  getTremplinToken24hSnapshot,
  TREMPLIN_DISCOVERY_TOKEN_UI,
} from "./tremplinDiscoveryToken";
import {
  getTremplinContextAction,
  getTremplinTokenLifecycleStage,
  type TremplinTokenLifecycleStage,
  type TremplinUserState,
} from "./tremplinProductModel";
import {
  tremplinArtists,
  tremplinRegions,
  tremplinStyles,
  type TremplinArtist,
} from "./tremplinArtistData";
import { getTremplinProjectSnapshot } from "./tremplinProjectData";
import { buildMyArtistsFixtureFromFollows, getMyArtistsFixture } from "./tremplinMyArtistsFixtures";
import {
  getTremplinArtistToken,
  tremplinMockTransactions,
  type TremplinArtistToken,
  type TremplinTokenPeriod,
} from "./tremplinTokenData";
import { resolveTremplinViewer } from "./tremplinViewer";
import "./tremplin-page.css";
import "./tremplin-shell.css";
import "./tremplin-token-page.css";
import "./tremplin-my-artists-premium.css";

type TremplinView = "home" | "discover" | "understand" | "myArtists" | "application" | "dashboard";
type TokenOperationMode = "buy" | "sell";
type MyArtistsTab = "overview" | "tokens" | "followed" | "rooms" | "activity" | "now" | "mw";
type MyArtistsMwTab = "holdings" | "history" | "documents";
type MyArtistsSessionState = {
  artistFilter: string;
  activityFilter: "all" | "room" | "grade";
  readUpdateIds: Set<string>;
  roomReminderIds: Set<string>;
};

const TREMPLIN_DISCOVERY_RAIL_IDS: readonly TremplinDiscoveryRailId[] = ["weekly", "watchlist", "emerging", "verified", "progress", "followed", "nearby", "editorial"];

function getDiscoveryRailFromSearch(search: string): TremplinDiscoveryRailId | null {
  const value = new URLSearchParams(search).get("collection");
  return TREMPLIN_DISCOVERY_RAIL_IDS.includes(value as TremplinDiscoveryRailId) ? value as TremplinDiscoveryRailId : null;
}

type ViewDefinition = {
  id: TremplinView;
  label: string;
  icon: LucideIcon;
  accent: string;
};

type ArtistTokenPair = {
  artist: TremplinArtist;
  token: TremplinArtistToken;
};

const TOKEN_LIFECYCLE_PRESENTATION: Readonly<Record<
  TremplinTokenLifecycleStage,
  { eyebrow: string; title: string; description: string; availability: string }
>> = {
  observation: {
    eyebrow: "Artiste en observation",
    title: "Le jeton de talent n’est pas encore disponible.",
    description: "Le parcours artistique continue de se construire avant toute possibilité de demande.",
    availability: "Non disponible",
  },
  eligible: {
    eyebrow: "Éligible au jeton",
    title: "Une demande peut être déposée.",
    description: "Le niveau requis est atteint, mais l’activation dépend encore d’une étude humaine par MeeWav.",
    availability: "Demande possible",
  },
  review: {
    eyebrow: "Demande en étude",
    title: "L’équipe MeeWav vérifie actuellement ce profil.",
    description: "Aucun jeton, prix ou achat n’est proposé avant la fin de cette vérification.",
    availability: "Étude en cours",
  },
  upcoming: {
    eyebrow: "Lancement prochain",
    title: "Le jeton de talent prépare son activation.",
    description: "Sa valeur et les possibilités d’achat apparaîtront uniquement après son lancement officiel.",
    availability: "Bientôt disponible",
  },
  active: {
    eyebrow: "Jeton de talent actif",
    title: "Le jeton de talent est disponible.",
    description: "La valeur, les règles d’achat et les protections sont consultables.",
    availability: "Disponible",
  },
  suspended: {
    eyebrow: "Jeton de talent suspendu",
    title: "Les opérations sont temporairement indisponibles.",
    description: "Le profil artistique reste accessible. MeeWav affiche la raison et les prochaines étapes dans l’espace du jeton.",
    availability: "Suspendu",
  },
} as const;

const TREMPLIN_NAV_ITEMS: readonly ViewDefinition[] = [
  { id: "home", label: "Accueil", icon: Home, accent: "#b79cff" },
  { id: "discover", label: "Découvrir", icon: Sparkles, accent: "#b79cff" },
  { id: "understand", label: "Comment ça marche", icon: Info, accent: "#b79cff" },
  { id: "myArtists", label: "Mes artistes", icon: Heart, accent: "#b79cff" },
];

const TREMPLIN_VIEW_ROUTES: Readonly<Record<TremplinView, string>> = {
  home: "/tremplin",
  discover: "/tremplin/decouvrir",
  understand: "/tremplin/comprendre",
  myArtists: "/tremplin/mes-artistes",
  application: "/tremplin/demande",
  dashboard: "/tremplin/mon-jeton",
};
const TREMPLIN_FLOW_ROUTE_PREFIX = "/tremplin/soutien-mw";
const TREMPLIN_ARTIST_ROUTE_PREFIX = "/tremplin/artistes";

function getMyArtistsNavigation(search: string): { tab: MyArtistsTab; mwTab: MyArtistsMwTab } {
  const params = new URLSearchParams(search);
  const requestedTab = params.get("tab");
  const requestedMwTab = params.get("section");
  const normalizedTab = requestedTab === "now" ? "overview" : requestedTab === "mw" ? "tokens" : requestedTab;
  const tab: MyArtistsTab = normalizedTab === "tokens" || normalizedTab === "followed" || normalizedTab === "rooms" || normalizedTab === "activity" ? normalizedTab : "overview";
  const mwTab: MyArtistsMwTab = requestedMwTab === "history" || requestedMwTab === "documents" ? requestedMwTab : "holdings";
  return { tab, mwTab };
}

type TremplinNavigationState = {
  tremplinReturnTo?: string;
  tremplinReturnedFromRooms?: boolean;
  tremplinSessionSnapshot?: TremplinSessionSnapshot;
};

type TremplinSessionSnapshot = {
  discoveryState: TremplinDiscoveryState;
  homeWallRailId: TremplinDiscoveryRailId | null;
  myArtistsSessionState: Omit<MyArtistsSessionState, "readUpdateIds" | "roomReminderIds"> & {
    readUpdateIds: string[];
    roomReminderIds: string[];
  };
  scrollPositions: Array<[string, number]>;
};

function getTremplinReturnTo(state: unknown) {
  if (!state || typeof state !== "object" || !("tremplinReturnTo" in state)) return null;
  const returnTo = (state as TremplinNavigationState).tremplinReturnTo;
  return typeof returnTo === "string" && returnTo.startsWith("/tremplin") ? returnTo : null;
}

function getTremplinSessionSnapshot(state: unknown): TremplinSessionSnapshot | null {
  if (!state || typeof state !== "object" || !("tremplinSessionSnapshot" in state)) return null;
  const snapshot = (state as TremplinNavigationState).tremplinSessionSnapshot;
  if (!snapshot || typeof snapshot !== "object") return null;
  return snapshot;
}

function didReturnFromRooms(state: unknown) {
  return Boolean(state && typeof state === "object" && (state as TremplinNavigationState).tremplinReturnedFromRooms);
}

function getTremplinReturnLabel(state: unknown) {
  const returnTo = getTremplinReturnTo(state);
  if (returnTo?.startsWith(TREMPLIN_ARTIST_ROUTE_PREFIX)) return "Retour au profil artiste";
  if (returnTo?.startsWith(TREMPLIN_VIEW_ROUTES.myArtists)) return "Retour à Mes artistes";
  if (returnTo?.startsWith(TREMPLIN_VIEW_ROUTES.discover)) return "Retour à Découvrir";
  if (returnTo === TREMPLIN_VIEW_ROUTES.home) return "Retour à l’accueil du Tremplin";
  return "Retour au Tremplin";
}

function getArtistReturnLabel(state: unknown) {
  const returnTo = getTremplinReturnTo(state);
  if (returnTo?.startsWith(TREMPLIN_VIEW_ROUTES.myArtists)) return "Retour à Mes artistes";
  if (returnTo?.startsWith(TREMPLIN_VIEW_ROUTES.discover)) return "Retour à Découvrir";
  if (returnTo === TREMPLIN_VIEW_ROUTES.home) return "Retour à l’accueil du Tremplin";
  return "Retour à Découvrir";
}

function getArtistFromPath(pathname: string) {
  const match = pathname.match(/^\/tremplin\/artistes\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    const artistId = decodeURIComponent(match[1]);
    return tremplinArtists.find(({ id }) => id === artistId) ?? null;
  } catch {
    return null;
  }
}

function isArtistRoutePath(pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, "");
  return normalizedPath === TREMPLIN_ARTIST_ROUTE_PREFIX
    || normalizedPath.startsWith(`${TREMPLIN_ARTIST_ROUTE_PREFIX}/`);
}

function getTremplinViewFromPath(pathname: string): TremplinView {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/tremplin";
  if (normalizedPath.startsWith(TREMPLIN_FLOW_ROUTE_PREFIX)) return "myArtists";
  if (normalizedPath.startsWith(TREMPLIN_ARTIST_ROUTE_PREFIX)) return "discover";
  const matchedView = (Object.entries(TREMPLIN_VIEW_ROUTES) as [TremplinView, string][])
    .find(([, route]) => route === normalizedPath);
  return matchedView?.[0] ?? "home";
}

const ARTIST_TOKEN_PAIRS: readonly ArtistTokenPair[] = tremplinArtists.flatMap((artist) => {
  const token = getTremplinArtistToken(artist.id);
  return token ? [{ artist, token }] : [];
});

function getFlowFromPath(pathname: string) {
  const match = pathname.match(/^\/tremplin\/soutien-mw\/([^/]+)\/(achat|revente)\/?$/);
  if (!match) return null;
  const artist = tremplinArtists.find(({ id }) => id === decodeURIComponent(match[1]));
  const token = artist ? getTremplinArtistToken(artist.id) : undefined;
  if (!artist || !token || getTremplinTokenLifecycleStage(artist) !== "active") return null;
  return { artist, token, mode: (match[2] === "achat" ? "buy" : "sell") as TokenOperationMode };
}

const PERIOD_LABELS: Record<TremplinTokenPeriod, string> = {
  "24h": "24 h",
  "7d": "7 j",
  "30d": "30 j",
  "3m": "3 mois",
  "1y": "1 an",
  all: "Depuis l’activation",
};

const PUBLIC_TOKEN_PERIODS: readonly TremplinTokenPeriod[] = ["30d", "3m", "1y", "all"];

const formatCurrency = (amount: number, maximumFractionDigits = 2) => new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: maximumFractionDigits,
  maximumFractionDigits,
}).format(amount);

const formatQuantity = (quantity: number) => new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 4,
}).format(quantity);

function buildLinePoints(values: readonly number[], width: number, height: number, padding = 4) {
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(0.000001, maximum - minimum);
  return values.map((value, index) => {
    const x = padding + (index / Math.max(1, values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - minimum) / spread) * (height - padding * 2);
    return { x, y, value };
  });
}

function buildSmoothChartPath(points: readonly { x: number; y: number }[]) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  return points.slice(0, -1).reduce((path, point, index) => {
    const next = points[index + 1];
    const span = next.x - point.x;
    return `${path} C${point.x + span * 0.4} ${point.y} ${next.x - span * 0.4} ${next.y} ${next.x} ${next.y}`;
  }, `M${points[0].x} ${points[0].y}`);
}

function TrendLabel({ token }: { token: TremplinArtistToken }) {
  const Icon = token.trend7d.direction === "up" ? TrendingUp : token.trend7d.direction === "down" ? TrendingDown : ArrowDownUp;
  return <span className={`tremplin-token-trend is-${token.trend7d.direction}`}><Icon /> {token.trend7d.text}</span>;
}

function TokenMiniChart({ token }: { token: TremplinArtistToken }) {
  const chartId = useId().replace(/:/g, "");
  const points = buildLinePoints(token.valueHistory["7d"].map((point) => point.valueEur), 180, 54, 3);
  const path = buildSmoothChartPath(points);
  const end = points[points.length - 1];
  return (
    <svg className="tremplin-token-mini-chart" viewBox="0 0 180 54" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`${chartId}-mini-line`} x1="0" x2="1"><stop offset="0" stopColor="var(--artist-secondary, #6b7cff)" stopOpacity=".45" /><stop offset=".68" stopColor="var(--artist-accent, #8b5cff)" /><stop offset="1" stopColor="#e5dcff" /></linearGradient>
        <linearGradient id={`${chartId}-mini-area`} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--artist-accent, #8b5cff)" stopOpacity=".2" /><stop offset="1" stopColor="var(--artist-accent, #8b5cff)" stopOpacity="0" /></linearGradient>
      </defs>
      <path className="tremplin-token-mini-chart__area" d={`${path} L177 53 L3 53 Z`} fill={`url(#${chartId}-mini-area)`} />
      <path className="tremplin-token-mini-chart__line" d={path} stroke={`url(#${chartId}-mini-line)`} />
      {end ? <circle cx={end.x} cy={end.y} r="3" /> : null}
    </svg>
  );
}

function TokenArtistCard({
  artist,
  token,
  favorite,
  playing,
  onOpen,
  onFavorite,
  onToggleAudio,
}: ArtistTokenPair & {
  favorite: boolean;
  playing: boolean;
  onOpen: () => void;
  onFavorite: () => void;
  onToggleAudio: () => void;
}) {
  return (
    <article className="tremplin-token-card" style={{ "--artist-accent": artist.accent.primary, "--artist-secondary": artist.accent.secondary } as CSSProperties}>
      <button type="button" className="tremplin-token-card__cover" onClick={onOpen} aria-label={`Découvrir ${artist.name}`}>
        <img src={artist.artwork} alt="" />
        <span className="tremplin-token-card__shade" />
        <span className="tremplin-token-card__stage">{artist.stageLabel}</span>
      </button>
      <button type="button" className={`tremplin-token-card__favorite ${favorite ? "is-active" : ""}`} aria-label={favorite ? `Ne plus suivre ${artist.name}` : `Suivre ${artist.name}`} aria-pressed={favorite} onClick={onFavorite}><Heart /></button>
      <div className="tremplin-token-card__body">
        <div className="tremplin-token-card__identity">
          <span><img src={artist.portrait} alt="" /></span>
          <div><strong>{artist.name}<MeewavGradeBadge level={artist.gradeLevel} size="xs" variant="icon" /><em title="Identité et admission au Tremplin vérifiées"><CheckCircle2 /> Vérifié</em></strong><p>{artist.disciplines.join(" · ")} · {artist.city}</p></div>
        </div>
        <div className="tremplin-token-card__audio">
          <button type="button" onClick={onToggleAudio} aria-label={playing ? `Mettre ${artist.audio.title} en pause` : `Écouter ${artist.audio.title}`}>{playing ? <Pause /> : <Play />}</button>
          <div><strong>{artist.audio.title}</strong><span>{artist.audio.subtitle}</span></div>
          <div className={playing ? "is-playing" : ""} aria-hidden="true">{artist.audio.waveform.slice(0, 28).map((height, index) => <i key={index} style={{ height: `${Math.round(height * 100)}%` }} />)}</div>
        </div>
        <div className="tremplin-token-card__community">
          <span><UsersRound /> {artist.community.memberCount.toLocaleString("fr-FR")} membres dans la communauté</span>
          <span><Radio /> {token.nextRoom.dateLabel}</span>
        </div>
        <div className="tremplin-token-card__economy">
          <div><small>Jeton {token.symbol}</small><strong>{formatCurrency(token.currentValueEur, 2)}</strong><TrendLabel token={token} /></div>
          <TokenMiniChart token={token} />
        </div>
        <button type="button" className="tremplin-token-card__discover" onClick={onOpen}>Découvrir l’artiste <ChevronRight /></button>
      </div>
    </article>
  );
}

function ArtistRail({
  title,
  description,
  pairs,
  favorites,
  playingArtistId,
  onOpen,
  onFavorite,
  onToggleAudio,
}: {
  title: string;
  description: string;
  pairs: readonly ArtistTokenPair[];
  favorites: Set<string>;
  playingArtistId: string | null;
  onOpen: (artist: TremplinArtist) => void;
  onFavorite: (artistId: string) => void;
  onToggleAudio: (artistId: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const railId = `rail-${title.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  const scrollRail = (direction: -1 | 1) => railRef.current?.scrollBy({ left: direction * Math.max(330, railRef.current.clientWidth * .82), behavior: "smooth" });
  return (
    <section className="tremplin-token-rail" aria-labelledby={railId}>
      <header className="tremplin-section-heading">
        <div><span className="tremplin-kicker">Sélection Tremplin</span><h2 id={railId}>{title}</h2><p>{description}</p></div>
        <div className="tremplin-token-rail__controls"><button type="button" onClick={() => scrollRail(-1)} aria-label={`Voir les artistes précédents dans ${title}`}><ChevronLeft /></button><button type="button" onClick={() => scrollRail(1)} aria-label={`Voir les artistes suivants dans ${title}`}><ChevronRight /></button></div>
      </header>
      <div className="tremplin-token-rail__viewport" ref={railRef}>
        {pairs.map(({ artist, token }) => <TokenArtistCard key={artist.id} artist={artist} token={token} favorite={favorites.has(artist.id)} playing={playingArtistId === artist.id} onOpen={() => onOpen(artist)} onFavorite={() => onFavorite(artist.id)} onToggleAudio={() => onToggleAudio(artist.id)} />)}
      </div>
    </section>
  );
}

function _LegacyHomeView({
  favorites,
  playingArtistId,
  onFavorite,
  onOpen,
  onToggleAudio,
  onNavigate,
}: {
  favorites: Set<string>;
  playingArtistId: string | null;
  onFavorite: (artistId: string) => void;
  onOpen: (artist: TremplinArtist) => void;
  onToggleAudio: (artistId: string) => void;
  onNavigate: (view: TremplinView) => void;
}) {
  const featured = ARTIST_TOKEN_PAIRS[0];
  const favoriteArtists = tremplinArtists.filter((artist) => favorites.has(artist.id));
  const preferredStyles = new Set(favoriteArtists.flatMap((artist) => artist.styles));
  const preferredRegions = new Set(favoriteArtists.map((artist) => artist.region));
  const discoveryScore = ({ artist, token }: ArtistTokenPair) => {
    const matchingStyles = artist.styles.filter((style) => preferredStyles.has(style)).length;
    const sameRegion = preferredRegions.has(artist.region);
    const editorialSignal = artist.editorialSelection;
    const freshnessDays = Math.max(0, (Date.UTC(2026, 6, 19) - Date.parse(token.admittedAt)) / 86_400_000);
    return matchingStyles * 48
      + (sameRegion ? 32 : 0)
      + (editorialSignal ? 24 : 0)
      + artist.community.newMembers30Days * 0.8
      + Math.max(0, 30 - freshnessDays) * 0.6
      + token.nextRoom.interestedCount * 0.08;
  };
  const discoveryPool = ARTIST_TOKEN_PAIRS.filter(({ artist }) => !favorites.has(artist.id));
  const discoveries = [...(discoveryPool.length >= 6 ? discoveryPool : ARTIST_TOKEN_PAIRS)].sort((left, right) => discoveryScore(right) - discoveryScore(left)).slice(0, 6);
  const newTokens = [...ARTIST_TOKEN_PAIRS].sort((left, right) => Date.parse(right.token.admittedAt) - Date.parse(left.token.admittedAt)).slice(0, 7);
  const communityScore = ({ artist, token }: ArtistTokenPair) => artist.community.memberCount
    + artist.community.newMembers30Days * 4
    + artist.updates.length * 24
    + token.nextRoom.interestedCount * 0.35;
  const activeCommunities = [...ARTIST_TOKEN_PAIRS].sort((left, right) => communityScore(right) - communityScore(left)).slice(0, 7);
  const rooms = [...ARTIST_TOKEN_PAIRS].sort((left, right) => left.token.nextRoom.startsAt.localeCompare(right.token.nextRoom.startsAt)).slice(0, 7);

  return (
    <div className="tremplin-token-home">
      <section className="tremplin-token-hero">
        <div className="tremplin-token-hero__copy">
          <div className="tremplin-token-hero__eyebrow"><span><Rocket /></span><b>Tremplin</b></div>
          <h1>Découvre les artistes <em>par leur musique</em></h1>
          <p>Écoute leurs créations, suis gratuitement leur parcours et consulte leur jeton de talent seulement si tu le souhaites.</p>
          <div className="tremplin-token-hero__actions"><button type="button" className="tremplin-primary-cta" onClick={() => onNavigate("discover")}><Sparkles /> Découvrir les artistes</button><button type="button" className="tremplin-secondary-cta" onClick={() => onNavigate("understand")}><Info /> Comprendre le Tremplin</button></div>
          <div className="tremplin-token-risk"><AlertTriangle /><span>Les jetons peuvent prendre ou perdre de la valeur. Aucun résultat financier n’est garanti.</span></div>
        </div>
        <button type="button" className="tremplin-token-hero__visual" onClick={() => onOpen(featured.artist)} aria-label={`Découvrir ${featured.artist.name}`}>
          <img src="/images/tremplin/artists/lunae-hero-v3.webp" alt="Lunaé en création dans un studio" />
          <span className="tremplin-token-hero__scrim" />
          <span className="tremplin-token-hero__live"><i /> Artiste de la semaine</span>
          <span className="tremplin-token-hero__artist"><small>{featured.artist.disciplines.join(" · ")} · {featured.artist.city}</small><strong>{featured.artist.name}<MeewavGradeBadge level={featured.artist.gradeLevel} size="xs" variant="icon" /></strong><em><span><MeewavTokenIcon aria-hidden="true" /> Jeton {featured.token.symbol}</span><b>{formatCurrency(featured.token.currentValueEur)}</b><ChevronRight /></em></span>
        </button>
      </section>

      <ArtistRail title="Artistes à découvrir" description="Des univers choisis selon tes écoutes, ta région et les recommandations éditoriales." pairs={discoveries} favorites={favorites} playingArtistId={playingArtistId} onOpen={onOpen} onFavorite={onFavorite} onToggleAudio={onToggleAudio} />
      <ArtistRail title="Nouveaux jetons d’artistes" description="Les artistes récemment admis au Tremplin, après vérification de leur identité et de leur activité." pairs={newTokens} favorites={favorites} playingArtistId={playingArtistId} onOpen={onOpen} onFavorite={onFavorite} onToggleAudio={onToggleAudio} />
      <ArtistRail title="Communautés actives" description="Des artistes dont la communauté écoute, échange et participe régulièrement aux Rooms." pairs={activeCommunities} favorites={favorites} playingArtistId={playingArtistId} onOpen={onOpen} onFavorite={onFavorite} onToggleAudio={onToggleAudio} />
      <ArtistRail title="En direct ou bientôt en Room" description="Entrez d’abord dans leur univers musical, puis découvrez le fonctionnement de leur jeton." pairs={rooms} favorites={favorites} playingArtistId={playingArtistId} onOpen={onOpen} onFavorite={onFavorite} onToggleAudio={onToggleAudio} />

      <section className="tremplin-token-home__education">
        <div className="tremplin-section-heading"><div><span className="tremplin-kicker">Comprendre avant toute opération</span><h2>Acheter, revendre, comprendre pourquoi la valeur évolue.</h2><p>Une démonstration pédagogique, avec les frais, le risque et les protections visibles.</p></div><button type="button" className="tremplin-section-link" onClick={() => onNavigate("understand")}>Tout comprendre <ChevronRight /></button></div>
        <TremplinCurveExplainer compact />
      </section>

      <section className="tremplin-token-home__final">
        <span><ShieldCheck /></span><div><small>Un environnement transparent et encadré</small><h2>L’artiste et sa musique restent au premier plan.</h2><p>Le mécanisme de valeur travaille en arrière-plan. Avant d’acheter, tu vois la répartition, pourquoi la valeur évolue et ce que tu risques.</p></div><button type="button" className="tremplin-primary-cta" onClick={() => onNavigate("discover")}>Découvrir les artistes <ChevronRight /></button>
      </section>
    </div>
  );
}

function DiscoveryExperience({
  playingArtistId,
  favorites,
  wallRailId,
  onOpen,
  onOpenToken,
  onOpenStatistics,
  onFavorite,
  onToggleAudio,
  onWallRailIdChange,
  discoveryState,
  onDiscoveryStateChange,
}: {
  playingArtistId: string | null;
  favorites: Set<string>;
  wallRailId: TremplinDiscoveryRailId | null;
  onOpen: (artist: TremplinArtist) => void;
  onOpenToken: (artist: TremplinArtist) => void;
  onOpenStatistics: (artist: TremplinArtist) => void;
  onFavorite: (artistId: string) => void;
  onToggleAudio: (artistId: string) => void;
  onWallRailIdChange: (railId: TremplinDiscoveryRailId | null) => void;
  discoveryState: TremplinDiscoveryState;
  onDiscoveryStateChange: (state: TremplinDiscoveryState) => void;
}) {
  return (
    <TremplinHomeExperience
      playingArtistId={playingArtistId}
      followedArtistIds={favorites}
      wallRailId={wallRailId}
      onToggleArtistAudio={onToggleAudio}
      onToggleFollow={onFavorite}
      onOpenArtist={onOpen}
      onOpenArtistToken={onOpenToken}
      onOpenArtistStatistics={onOpenStatistics}
      onWallRailIdChange={onWallRailIdChange}
      initialState={discoveryState}
      onStateChange={onDiscoveryStateChange}
    />
  );
}

function DiscoveryView({
  query,
  favorites,
  playingArtistId,
  onFavorite,
  onOpen,
  onToggleAudio,
}: {
  query: string;
  favorites: Set<string>;
  playingArtistId: string | null;
  onFavorite: (artistId: string) => void;
  onOpen: (artist: TremplinArtist) => void;
  onToggleAudio: (artistId: string) => void;
}) {
  const [style, setStyle] = useState("Tous les styles");
  const [region, setRegion] = useState("Toutes les régions");
  const [activity, setActivity] = useState("Toute l’activité");
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
  const pairs = ARTIST_TOKEN_PAIRS.filter(({ artist, token }) => {
    const searchText = [artist.name, artist.city, artist.region, token.symbol, ...artist.styles, ...artist.disciplines].join(" ").toLocaleLowerCase("fr-FR");
    return (!normalizedQuery || searchText.includes(normalizedQuery))
      && (style === "Tous les styles" || artist.styles.includes(style))
      && (region === "Toutes les régions" || artist.region === region)
      && (activity === "Toute l’activité" || (activity === "Room bientôt" && Boolean(token.nextRoom)) || (activity === "Communauté active" && token.activity.purchases7d + token.activity.resales7d >= 30));
  });
  return (
    <div className="tremplin-token-discovery">
      <header className="tremplin-page-heading"><div><span className="tremplin-kicker">Découverte musicale</span><h1>Écoute l’artiste avant de consulter son jeton de talent.</h1><p>Explore les univers par style, région et activité. La musique reste toujours le premier point d’entrée.</p></div><span>{pairs.length} artiste{pairs.length > 1 ? "s" : ""}</span></header>
      <div className="tremplin-filter-bar">
        <label><Music2 /><span>Style</span><select value={style} onChange={(event) => setStyle(event.target.value)}><option>Tous les styles</option>{tremplinStyles.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><MapPin /><span>Région</span><select value={region} onChange={(event) => setRegion(event.target.value)}><option>Toutes les régions</option>{tremplinRegions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><UsersRound /><span>Activité</span><select value={activity} onChange={(event) => setActivity(event.target.value)}><option>Toute l’activité</option><option>Communauté active</option><option>Room bientôt</option></select></label>
        <button type="button" onClick={() => { setStyle("Tous les styles"); setRegion("Toutes les régions"); setActivity("Toute l’activité"); }}>Réinitialiser</button>
      </div>
      <div className="tremplin-token-discovery__grid">{pairs.map(({ artist, token }) => <TokenArtistCard key={artist.id} artist={artist} token={token} favorite={favorites.has(artist.id)} playing={playingArtistId === artist.id} onOpen={() => onOpen(artist)} onFavorite={() => onFavorite(artist.id)} onToggleAudio={() => onToggleAudio(artist.id)} />)}</div>
      {pairs.length === 0 && <div className="tremplin-empty-state"><Search /><h2>Aucun artiste ne correspond à ces critères</h2><p>Élargis un filtre pour retrouver de nouveaux univers.</p></div>}
    </div>
  );
}

const _legacyDiscoveryView = DiscoveryView;

function TokenValueChart({ token }: { token: TremplinArtistToken }) {
  const [period, setPeriod] = useState<TremplinTokenPeriod>("all");
  const [keyboardPointIndex, setKeyboardPointIndex] = useState(() => Math.max(0, token.valueHistory.all.length - 1));
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const [pinnedPointIndices, setPinnedPointIndices] = useState<number[]>([]);
  const chartId = useId().replace(/:/g, "");
  const history = token.valueHistory[period];
  const values = history.map((point) => point.valueEur);
  const first = values[0] ?? token.currentValueEur;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const spread = Math.max(0.000001, maximum - minimum);
  const plotPoints = history.map((point, index) => ({
    ...point,
    x: 14 + (index / Math.max(1, history.length - 1)) * 832,
    y: 246 - ((point.valueEur - minimum) / spread) * 232,
  }));
  const activePointIndex = hoveredPointIndex ?? keyboardPointIndex;
  const activePoint = plotPoints[activePointIndex] ?? plotPoints[plotPoints.length - 1];
  const activePointLabel = activePoint
    ? `${activePoint.label} : ${formatCurrency(activePoint.valueEur, 4)}${activePoint.event ? `, ${activePoint.event.label} de ${formatCurrency(activePoint.event.amountEur)}` : ""}. ${pinnedPointIndices.length} repère${pinnedPointIndices.length > 1 ? "s" : ""} conservé${pinnedPointIndices.length > 1 ? "s" : ""}.`
    : "Aucune valeur disponible";
  const chartLine = buildSmoothChartPath(plotPoints);
  const chartStart = plotPoints[0];
  const chartEnd = plotPoints[plotPoints.length - 1];
  const chartDirection = "neutral";

  useEffect(() => {
    setKeyboardPointIndex(Math.max(0, history.length - 1));
    setHoveredPointIndex(null);
    setPinnedPointIndices([]);
  }, [period, history.length, token.artistId]);

  const moveActivePoint = (nextIndex: number) => {
    setKeyboardPointIndex(Math.max(0, Math.min(plotPoints.length - 1, nextIndex)));
  };

  const togglePinnedPoint = (pointIndex: number) => {
    setKeyboardPointIndex(pointIndex);
    setPinnedPointIndices((current) => (
      current.includes(pointIndex)
        ? []
        : [pointIndex]
    ));
  };

  const pointChangePercent = (pointValue: number) => first > 0 ? ((pointValue - first) / first) * 100 : 0;
  const pointPosition = (point: (typeof plotPoints)[number]) => ({
    left: `${(point.x / 860) * 100}%`,
    top: `${(point.y / 260) * 100}%`,
  });
  const pointTransform = (pointIndex: number, pointY: number) => {
    const horizontal = pointIndex === 0 ? "0" : pointIndex === plotPoints.length - 1 ? "-100%" : "-50%";
    return pointY < 76
      ? `translate(${horizontal}, 16px)`
      : `translate(${horizontal}, calc(-100% - 14px))`;
  };
  const pointIndexAt = (clientX: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width)));
    return Math.round(ratio * Math.max(0, plotPoints.length - 1));
  };
  const renderPointCard = (pointIndex: number, pinned: boolean) => {
    const point = plotPoints[pointIndex];
    if (!point) return null;
    const pointChange = pointChangePercent(point.valueEur);
    return (
      <span
        key={`${pinned ? "pinned" : "preview"}-${point.timestamp}`}
        className={`tremplin-token-value-chart__active-point ${pinned ? "is-pinned" : "is-preview"} is-neutral`}
        style={{ ...pointPosition(point), transform: pointTransform(pointIndex, point.y) }}
        aria-hidden={!pinned}
      >
        <small>{point.label}</small>
        <strong>{formatCurrency(point.valueEur, 4)}</strong>
        <em>{pointChange >= 0 ? "+" : ""}{pointChange.toFixed(2).replace(".", ",")} % depuis le début</em>
        {point.event ? <i>{point.event.label} · {formatCurrency(point.event.amountEur)}</i> : null}
        {pinned ? <button type="button" aria-label={`Retirer le repère du ${point.label}`} onClick={() => togglePinnedPoint(pointIndex)}>×</button> : null}
      </span>
    );
  };

  return (
    <section className={`tremplin-token-value-chart is-${chartDirection}`} aria-labelledby={`${chartId}-title`}>
      <header><div><span className="tremplin-kicker">Historique replié par défaut</span><h2 id={`${chartId}-title`}>Valeur du jeton {token.symbol}</h2><p>Ce graphe reflète uniquement les achats et les reventes sur MeeWav. Il ne représente ni la qualité artistique, ni le grade, ni une prévision.</p></div><div className="tremplin-token-value-chart__value"><small>Valeur actuelle</small><strong>{formatCurrency(token.currentValueEur)}</strong><span>{PERIOD_LABELS[period]}</span></div></header>
      <div className="tremplin-token-value-chart__periods" aria-label="Période du graphe">{PUBLIC_TOKEN_PERIODS.map((item) => <button type="button" key={item} className={period === item ? "is-active" : ""} aria-pressed={period === item} onClick={() => setPeriod(item)}>{PERIOD_LABELS[item]}</button>)}</div>
      <div
        className={`tremplin-token-value-chart__canvas ${pinnedPointIndices.length > 0 ? "has-pinned-points" : ""}`}
        role="group"
        tabIndex={0}
        aria-describedby={`${chartId}-instructions ${chartId}-active-point`}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            moveActivePoint(keyboardPointIndex - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            moveActivePoint(keyboardPointIndex + 1);
          } else if (event.key === "Home") {
            event.preventDefault();
            moveActivePoint(0);
          } else if (event.key === "End") {
            event.preventDefault();
            moveActivePoint(plotPoints.length - 1);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            togglePinnedPoint(keyboardPointIndex);
          } else if (event.key === "Escape") {
            event.preventDefault();
            setPinnedPointIndices([]);
          }
        }}
      >
        <span id={`${chartId}-instructions`} className="tremplin-visually-hidden">Survolez la courbe pour consulter une date. Au clavier, utilisez les flèches, puis Entrée pour conserver un repère et Échap pour l’effacer.</span>
        <span id={`${chartId}-active-point`} className="tremplin-visually-hidden" aria-live="polite">{activePointLabel}</span>
        <div
          className="tremplin-token-value-chart__plot"
          onPointerMove={(event) => setHoveredPointIndex(pointIndexAt(event.clientX, event.currentTarget))}
          onPointerLeave={() => setHoveredPointIndex(null)}
        >
          <svg viewBox="0 0 860 260" preserveAspectRatio="none" role="img" aria-label={`Évolution de la valeur du jeton ${token.symbol} sur ${PERIOD_LABELS[period]}`}>
            <defs>
              <linearGradient id={`${chartId}-token-line`} x1="0" x2="1"><stop offset="0" stopColor="#6677d9" stopOpacity=".45" /><stop offset=".62" stopColor="#9a7cff" /><stop offset="1" stopColor="#e3daff" /></linearGradient>
              <linearGradient id={`${chartId}-token-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9a7cff" stopOpacity=".2"/><stop offset="1" stopColor="#9a7cff" stopOpacity="0"/></linearGradient>
            </defs>
            <path className="tremplin-token-value-chart__grid" d="M14 58H846 M14 116H846 M14 174H846 M14 232H846" />
            {chartStart ? <line className="tremplin-token-value-chart__baseline" x1="14" x2="846" y1={chartStart.y} y2={chartStart.y} /> : null}
            <path className="tremplin-token-value-chart__area" d={`${chartLine} L846 246 L14 246 Z`} fill={`url(#${chartId}-token-area)`} />
            <path className="tremplin-token-value-chart__line" d={chartLine} stroke={`url(#${chartId}-token-line)`} />
            {pinnedPointIndices.map((pointIndex) => {
              const point = plotPoints[pointIndex];
              return point ? <line key={`pin-line-${point.timestamp}`} className="tremplin-token-value-chart__crosshair is-pinned" x1={point.x} x2={point.x} y1="8" y2="246" /> : null;
            })}
            {activePoint && !pinnedPointIndices.includes(activePointIndex) ? <line className="tremplin-token-value-chart__crosshair is-preview" x1={activePoint.x} x2={activePoint.x} y1="8" y2="246" /> : null}
            {plotPoints.map((point, index) => <circle key={point.timestamp} className={`${point.event ? `is-event is-${point.event.type}` : ""} ${index === activePointIndex ? "is-active" : ""} ${pinnedPointIndices.includes(index) ? "is-pinned" : ""}`} cx={point.x} cy={point.y} r={point.event ? 5.5 : 3.5}><title>{point.label} : {formatCurrency(point.valueEur, 4)}{point.event ? ` · ${point.event.label} de ${formatCurrency(point.event.amountEur)}` : ""}</title></circle>)}
            {chartEnd ? <circle className="tremplin-token-value-chart__halo" cx={chartEnd.x} cy={chartEnd.y} r="11" /> : null}
          </svg>
          {plotPoints.map((point, pointIndex) => <button key={`hit-${point.timestamp}`} type="button" tabIndex={-1} className="tremplin-token-value-chart__point" style={pointPosition(point)} aria-label={`${point.label}, ${formatCurrency(point.valueEur, 4)}. ${pinnedPointIndices.includes(pointIndex) ? "Retirer" : "Conserver"} ce repère.`} aria-pressed={pinnedPointIndices.includes(pointIndex)} onFocus={() => setKeyboardPointIndex(pointIndex)} onPointerEnter={() => setHoveredPointIndex(pointIndex)} onClick={() => togglePinnedPoint(pointIndex)} />)}
          {pinnedPointIndices.map((pointIndex) => renderPointCard(pointIndex, true))}
          {activePoint && !pinnedPointIndices.includes(activePointIndex) ? renderPointCard(activePointIndex, false) : null}
        </div>
        <span className="tremplin-token-value-chart__axis is-y">Valeur d’un jeton en euros</span><span className="tremplin-token-value-chart__axis is-x">Temps</span>
      </div>
      <table className="tremplin-visually-hidden"><caption>Valeurs du jeton {token.symbol} sur {PERIOD_LABELS[period]}</caption><thead><tr><th scope="col">Date</th><th scope="col">Valeur</th><th scope="col">Événement</th></tr></thead><tbody>{history.map((point) => <tr key={point.timestamp}><th scope="row">{point.label}</th><td>{formatCurrency(point.valueEur, 4)}</td><td>{point.event ? `${point.event.label} de ${formatCurrency(point.event.amountEur)}` : "Aucun événement"}</td></tr>)}</tbody></table>
      <div className="tremplin-token-value-chart__summary"><LineChart /><p><strong>Lecture neutre.</strong> La valeur dépend des achats et des reventes sur MeeWav. Elle peut évoluer indépendamment du parcours de l’artiste.</p><span className={pinnedPointIndices.length > 0 ? "is-active" : ""}><MousePointerClick /> {pinnedPointIndices.length > 0 ? "Un repère conservé" : "Survolez pour consulter une date"}</span></div>
    </section>
  );
}

function ArtistNotFound({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  return (
    <section className="tremplin-token-artist__not-found" role="status" aria-labelledby="tremplin-artist-not-found-title">
      <span aria-hidden="true"><Search /></span>
      <div>
        <span className="tremplin-kicker">Profil introuvable</span>
        <h1 id="tremplin-artist-not-found-title">Cet artiste n’est pas disponible.</h1>
        <p>Le profil a peut-être été déplacé, retiré ou l’adresse utilisée est incomplète.</p>
      </div>
      <button type="button" className="tremplin-primary-cta" onClick={onBack}><ArrowLeft /> {backLabel}</button>
    </section>
  );
}

function ArtistDetail({
  artist,
  token,
  favorite,
  playing,
  onBack,
  backLabel,
  onFavorite,
  onTrade,
  onToggleAudio,
  onOpenRoom,
}: ArtistTokenPair & {
  favorite: boolean;
  playing: boolean;
  onBack: () => void;
  backLabel: string;
  onFavorite: () => void;
  onTrade: (mode: TokenOperationMode) => void;
  onToggleAudio: () => void;
  onOpenRoom: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const tokenLifecycleStage = getTremplinTokenLifecycleStage(artist);
  const tokenLifecycle = TOKEN_LIFECYCLE_PRESENTATION[tokenLifecycleStage];
  const tokenDiscoveryUi = TREMPLIN_DISCOVERY_TOKEN_UI[tokenLifecycleStage];
  const token24h = getTremplinToken24hSnapshot(token);
  const isTokenActive = tokenLifecycleStage === "active";
  const project = getTremplinProjectSnapshot(artist);
  const latestUpdate = artist.updates[0];
  const nextRoomIsUpcoming = new Date(token.nextRoom.startsAt).getTime() > Date.now();
  const [supportOpen, setSupportOpen] = useState(location.hash === "#profile-support" || location.hash === "#profile-token-statistics");
  const [statisticsOpen, setStatisticsOpen] = useState(location.hash === "#profile-token-statistics");
  useEffect(() => {
    if (location.hash === "#profile-support" || location.hash === "#profile-token-statistics") setSupportOpen(true);
    if (location.hash === "#profile-token-statistics") setStatisticsOpen(true);
    const sectionId = location.hash.slice(1);
    if (!sectionId) return;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
  }, [location.hash]);
  const navigateToSection = (sectionId: string) => {
    if (sectionId === "profile-support" || sectionId === "profile-token-statistics") {
      setSupportOpen(true);
      trackTremplinEvent("support_tab_opened", { artistId: artist.id });
    }
    if (sectionId === "profile-token-statistics") setStatisticsOpen(true);
    if (sectionId === "profile-grade") trackTremplinEvent("grade_explanation_opened", { artistId: artist.id });
    navigate(`${location.pathname}${location.search}#${sectionId}`, { replace: true, state: location.state });
    requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  const openSection = (sectionId: string) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateToSection(sectionId);
  };

  return (
    <div className="tremplin-token-artist" style={{ "--artist-accent": artist.accent.primary, "--artist-secondary": artist.accent.secondary } as CSSProperties}>
      <button type="button" className="tremplin-back-button" onClick={onBack}><ArrowLeft /> {backLabel}</button>
      <section id="profile-overview" className="tremplin-token-artist__hero">
        <div className="tremplin-token-artist__portrait"><img src={artist.portrait} alt={`Portrait de ${artist.name}`} /><button type="button" className="tremplin-token-artist__portrait-play" onClick={onToggleAudio} aria-label={playing ? `Mettre ${artist.audio.title} en pause` : `Écouter ${artist.audio.title}`}><span>{playing ? <Pause /> : <Play />}</span><strong>{playing ? "En écoute" : `Écouter · ${artist.audio.durationLabel}`}</strong></button><span>{artist.stageLabel}</span></div>
        <div className="tremplin-token-artist__story"><span className="tremplin-kicker">{artist.styles.join(" · ")}</span><div className="tremplin-token-artist__name"><h1>{artist.name}</h1><a className="tremplin-token-artist__grade-link" href="#profile-grade" onClick={openSection("profile-grade")} aria-label={`Comprendre le grade Niveau ${artist.gradeLevel} de ${artist.name}`}><MeewavGradeBadge level={artist.gradeLevel} size="md" variant="compact-pill" labelMode="full" interactive /></a><span><CheckCircle2 /> Profil de démonstration MeeWav</span></div><p className="tremplin-token-artist__meta"><MapPin /> {artist.city} · {artist.disciplines.join(" · ")}</p><p className="tremplin-token-artist__community"><UsersRound /> {artist.community.memberCount.toLocaleString("fr-FR")} abonnés sur MeeWav</p><p className="tremplin-token-artist__bio">{artist.biography}</p><div className="tremplin-token-artist__audio"><button type="button" onClick={onToggleAudio} aria-label={playing ? `Mettre ${artist.audio.title} en pause` : `Écouter ${artist.audio.title}`}>{playing ? <Pause /> : <Play />}</button><div><strong>{artist.audio.title}</strong><span>{artist.audio.subtitle} · {artist.audio.durationLabel}</span></div><div className={playing ? "is-playing" : ""} aria-hidden="true">{artist.audio.waveform.map((height, index) => <i key={index} style={{ height: `${Math.round(height * 100)}%` }} />)}</div></div><div className="tremplin-token-artist__actions"><button type="button" className={`tremplin-primary-cta${favorite ? " is-followed" : ""}`} aria-pressed={favorite} aria-label={favorite ? `Ne plus suivre ${artist.name}` : `Suivre ${artist.name}`} onClick={onFavorite}><Heart fill={favorite ? "currentColor" : "none"} /> {favorite ? "Suivi ✓" : "Suivre gratuitement"}</button><a className="tremplin-secondary-cta" href="#profile-project" onClick={openSection("profile-project")}>Voir son projet <ChevronRight /></a></div></div>
        <aside className="tremplin-token-artist__hero-token" data-token-stage={tokenLifecycleStage} aria-label={`Résumé du jeton de talent de ${artist.name}`}>
          <span className="tremplin-kicker">{tokenDiscoveryUi.label}</span>
          {isTokenActive ? <div className="tremplin-token-artist__hero-token-symbol"><MeewavTokenIcon /><strong>{token.symbol}</strong></div> : null}
          <p>{tokenDiscoveryUi.helper}</p>
          {isTokenActive ? <>
            <dl><div><dt>Valeur actuelle</dt><dd>{formatTremplinTokenPrice(token.currentValueEur)}</dd></div><div><dt>Variation</dt><dd><TremplinTokenChange24h value={token24h.changePercent} /></dd></div></dl>
            <small>{formatTremplinTokenUpdatedAt(token24h.updatedAt)}</small>
            <div><a className="tremplin-primary-cta" href="#profile-support" onClick={openSection("profile-support")}><MeewavTokenIcon /> Voir le jeton</a><a className="tremplin-secondary-cta" href="#profile-token-statistics" onClick={openSection("profile-token-statistics")}><LineChart /> Statistiques</a></div>
          </> : <><small>Aucun prix n’est affiché avant l’activation.</small><a className="tremplin-primary-cta" href="#profile-support" onClick={openSection("profile-support")}>{tokenDiscoveryUi.primaryAction}</a></>}
        </aside>
      </section>

      <nav className="tremplin-token-artist__section-nav" aria-label="Sections du profil">
        <a href="#profile-overview" onClick={openSection("profile-overview")}>Aperçu</a><a href="#profile-creations" onClick={openSection("profile-creations")}>Créations</a><a href="#profile-project" onClick={openSection("profile-project")}>Projet</a><a href="#profile-rooms" onClick={openSection("profile-rooms")}>Rooms</a><a href="#profile-journey" onClick={openSection("profile-journey")}>Parcours</a><a href="#profile-grade" onClick={openSection("profile-grade")}>Grade</a><a href="#profile-support" onClick={openSection("profile-support")}><MeewavTokenIcon aria-hidden="true" /> Jeton de talent</a>
      </nav>

      <section id="profile-creations" className="tremplin-token-artist__creations" aria-labelledby="profile-creations-title">
        <div className="tremplin-section-heading"><div><span className="tremplin-kicker">Créations</span><h2 id="profile-creations-title">Écouter avant d’aller plus loin</h2><p>Une création mise en avant et les dernières publications de ce profil.</p></div></div>
        <div className="tremplin-token-artist__creation-grid">
          <article className="is-featured"><img src={artist.artwork} alt="" /><div><small>Extrait · {artist.audio.durationLabel}</small><h3>{artist.audio.title}</h3><p>{artist.audio.subtitle}</p></div><button type="button" onClick={onToggleAudio} aria-label={playing ? `Mettre ${artist.audio.title} en pause` : `Écouter ${artist.audio.title}`}>{playing ? <Pause /> : <Play />} {playing ? "Mettre en pause" : "Écouter l’extrait"}</button></article>
          {artist.updates.slice(0, 2).map((update) => <article key={`creation-${update.id}`}><span><Sparkles /></span><div><small>{update.dateLabel}</small><h3>{update.title}</h3><p>{update.summary}</p></div></article>)}
        </div>
      </section>

      <section id="profile-project" className="tremplin-token-artist__project">
        <div><span className="tremplin-kicker">Son projet en ce moment</span><h2>{project.headline}</h2><p>{latestUpdate?.summary ?? project.nextMilestone}</p></div>
        <aside><small>Étape en cours</small><strong>{project.nextMilestone}</strong><small>Prochaine étape du projet</small><strong>{project.supportNeed}</strong></aside>
      </section>

      <section id="profile-rooms" className="tremplin-token-artist__room"><span><Radio /></span><div><small>{nextRoomIsUpcoming ? "Prochaine activité dans les espaces live" : "Dernière Room documentée"}</small><h2>{token.nextRoom.title}</h2><p>{token.nextRoom.dateLabel} · {token.nextRoom.accessLabel}{nextRoomIsUpcoming ? ` · ${token.nextRoom.interestedCount.toLocaleString("fr-FR")} personnes intéressées` : " · Cette Room est terminée"}</p></div><button type="button" className="tremplin-secondary-cta" onClick={onOpenRoom}>{nextRoomIsUpcoming ? "Voir sa prochaine Room" : "Découvrir les Rooms"} <ChevronRight /></button></section>

      <section id="profile-journey" className="tremplin-token-artist__updates"><div className="tremplin-section-heading"><div><span className="tremplin-kicker">Journal de parcours</span><h2>Les étapes qui racontent son projet</h2><p>Vidéos de La Scène, Rooms, performances et collaborations sont replacées dans le temps.</p></div></div><div>{artist.updates.map((update) => <article id={`etape-${update.id}`} key={update.id}><span><Rocket /></span><time>{update.dateLabel}</time><h3>{update.title}</h3><p>{update.summary}</p><small><Info /> Étape déclarée par ce profil de démonstration</small></article>)}</div></section>

      <section className="tremplin-token-artist__facts" aria-label="Repères publics du parcours">
        <div><span className="tremplin-kicker">Des faits simples</span><h2>Repères publics du parcours</h2><p>Des éléments compréhensibles, sans score opaque ni courbe d’audience.</p></div>
        <dl><div><dt>Étapes publiées</dt><dd>{artist.updates.length}</dd></div><div><dt>Repères documentés</dt><dd>{project.proofPoints.length}</dd></div><div><dt>Abonnés MeeWav</dt><dd>{artist.community.memberCount.toLocaleString("fr-FR")}</dd></div><div><dt>Dernière publication</dt><dd>{latestUpdate?.dateLabel ?? "À venir"}</dd></div></dl>
      </section>

      <div id="profile-grade"><TremplinGradeSystem artist={artist} /></div>

      <details id="profile-support" className="tremplin-token-artist__support-disclosure" open={supportOpen} onToggle={(event) => setSupportOpen(event.currentTarget.open)}>
        <summary><span><MeewavTokenIcon title="Jeton Meewav" /><span><small>Espace payant et facultatif</small><strong>Jeton de talent</strong></span></span><em>{isTokenActive ? "Consulter les règles et les options" : tokenLifecycle.availability}</em></summary>
        {isTokenActive ? <div className="tremplin-token-artist__support-content">
          <TremplinDemoBanner />
          <section className="tremplin-token-artist__token-section">
            <div className="tremplin-section-heading"><div><span className="tremplin-kicker">Achat payant et facultatif</span><h2>Donner de la force au projet de {artist.name}</h2><p>En achetant des jetons {token.symbol}. Une partie du montant est destinée à l’artiste. La valeur peut monter ou baisser et aucun gain n’est garanti.</p></div></div>
            <div className="tremplin-token-artist__support-purpose"><small>Ce que la part de l’artiste accompagne</small><strong>{project.supportNeed}</strong></div>
            <aside className="tremplin-token-artist__token"><div className="tremplin-token-artist__symbol"><span><MeewavTokenIcon title="Jeton Meewav" /></span><div><small>{token.tokenName}</small><strong>{token.symbol}</strong></div></div><dl><div><dt>Valeur actuelle</dt><dd>{formatCurrency(token.currentValueEur)}</dd></div><div><dt>Plafond de détention</dt><dd>5 % du nombre total de jetons</dd></div><div><dt>Tu détiens</dt><dd>{formatQuantity(token.userPosition.quantity)} {token.symbol}</dd></div><div><dt>Part du nombre total</dt><dd>{token.userPosition.ownershipSharePercent.toFixed(3).replace(".", ",")} %</dd></div></dl><div><button type="button" className="tremplin-primary-cta" onClick={() => onTrade("buy")}><MeewavTokenIcon aria-hidden="true" /> Acheter des jetons {token.symbol}</button><button type="button" className="tremplin-secondary-cta" disabled={token.userPosition.quantity <= 0} onClick={() => onTrade("sell")}><ArrowDownUp /> Revendre mes jetons</button></div><small><AlertTriangle /> Achat payant et facultatif · Valeur variable · Aucun gain garanti</small></aside>
          </section>

          <details id="profile-token-statistics" className="tremplin-token-artist__value-history" open={statisticsOpen} onToggle={(event) => setStatisticsOpen(event.currentTarget.open)}><summary>Consulter les statistiques du jeton</summary><TokenValueChart token={token} /></details>

          <section className="tremplin-token-artist__protections"><div><span className="tremplin-kicker">Des règles concrètes</span><h2>Avant d’acheter ou de revendre</h2><p>MeeWav vérifie automatiquement les limites et les conditions applicables au moment de chaque opération.</p></div><ul><li><UserCheck /> Identité vérifiée avant l’opération</li><li><ShieldCheck /> Détention limitée à 5 % par personne</li><li><History /> Date de revente disponible affichée avant l’achat</li><li><SlidersHorizontal /> Montant, frais et part de l’artiste visibles avant confirmation</li><li><LockKeyhole /> Prochaine période de revente indiquée dans le récapitulatif</li><li><AlertTriangle /> Opérations temporairement suspendues en cas d’activité inhabituelle</li></ul></section>

          <section className="tremplin-token-artist__trade-cta"><div><span className="tremplin-kicker"><MeewavTokenIcon aria-hidden="true" /> Jeton {token.symbol}</span><h2>Vérifie le montant, les frais et les risques avant de confirmer.</h2><p>Le prix du jeton ne représente ni la qualité de l’artiste ni son grade et peut évoluer indépendamment de son parcours.</p></div><div><button type="button" className="tremplin-primary-cta" onClick={() => onTrade("buy")}><MeewavTokenIcon aria-hidden="true" /> Acheter des jetons</button><button type="button" className="tremplin-secondary-cta" disabled={token.userPosition.quantity <= 0} onClick={() => onTrade("sell")}>Revendre mes jetons</button></div></section>
        </div> : <section className="tremplin-token-artist__token-section" data-token-stage={tokenLifecycleStage}><div className="tremplin-section-heading"><div><span className="tremplin-kicker">{tokenLifecycle.eyebrow}</span><h2>{tokenLifecycle.title}</h2><p>{tokenLifecycle.description}</p></div></div><aside className="tremplin-token-artist__token"><span className="tremplin-kicker">Statut du jeton de talent</span><dl><div><dt>Statut</dt><dd>{tokenLifecycle.eyebrow}</dd></div><div><dt>Disponibilité</dt><dd>{tokenLifecycle.availability}</dd></div></dl><small><ShieldCheck /> {tokenLifecycleStage === "suspended" ? "Aucune opération n’est possible pendant la suspension." : "Aucun prix ni achat n’est affiché avant l’activation officielle du jeton."}</small></aside></section>}
      </details>
    </div>
  );
}

function formatFixtureDecimal(value: string, suffix = "€") {
  const [integerPart, decimalPart = "00"] = value.split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${groupedInteger},${decimalPart.padEnd(2, "0").slice(0, 2)}${suffix ? ` ${suffix}` : ""}`;
}

function MyArtistsChange({ value, label = "24 h" }: { value: number; label?: string }) {
  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const formatted = Math.abs(value).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return <span className={`tremplin-my-artists__change is-${direction}`} title="Évolution du prix du jeton sur les dernières 24 heures." aria-label={`${label} : ${value > 0 ? "hausse" : value < 0 ? "baisse" : "stable"} de ${formatted} pour cent`}><span>{label}</span><b aria-hidden="true">{arrow}</b><strong>{value > 0 ? "+" : value < 0 ? "−" : ""}{formatted} %</strong></span>;
}

function MyArtistsView({
  favorites,
  initialTab,
  initialMwTab: _initialMwTab,
  onOpen,
  onTrade,
  onOpenRoom,
  onDiscover,
  onNotify,
  onNavigationChange,
  sessionState,
  onSessionStateChange,
}: {
  favorites: Set<string>;
  initialTab: MyArtistsTab;
  initialMwTab: MyArtistsMwTab;
  onOpen: (artist: TremplinArtist, anchorId?: string) => void;
  onTrade: (artist: TremplinArtist, mode: TokenOperationMode) => void;
  onOpenRoom: (artist: TremplinArtist) => void;
  onDiscover: () => void;
  onNotify: (message: string) => void;
  onNavigationChange: (tab: MyArtistsTab, mwTab: MyArtistsMwTab) => void;
  sessionState: MyArtistsSessionState;
  onSessionStateChange: (state: MyArtistsSessionState) => void;
}) {
  const location = useLocation();
  const fallbackFixture = TREMPLIN_FEATURE_FLAGS.demoMode
    ? "populated"
    : favorites.size > 0 ? "followingOnly" : "empty";
  const configuredFixture = getMyArtistsFixture(location.search, fallbackFixture);
  const fixture = isLocalAuthPreviewEnabled()
    ? configuredFixture
    : buildMyArtistsFixtureFromFollows(tremplinArtists.filter(({ id, profileId }) =>
        favorites.has(id) && Boolean(profileId && isCanonicalProfileId(profileId))));
  const normalizedInitialTab: MyArtistsTab = initialTab === "now" ? "overview" : initialTab === "mw" ? "tokens" : initialTab;
  const [tab, setTab] = useState<MyArtistsTab>(normalizedInitialTab);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { artistFilter, activityFilter, readUpdateIds, roomReminderIds } = sessionState;
  const artistById = (artistId: string) => tremplinArtists.find(({ id }) => id === artistId);
  const holdings = fixture.holdings.flatMap((holding) => {
    const artist = artistById(holding.artistId);
    return artist ? [{ artist, holding }] : [];
  });
  const followedArtists = fixture.followedArtistIds.flatMap((artistId) => {
    const artist = artistById(artistId);
    return artist ? [artist] : [];
  });
  const rooms = fixture.rooms.flatMap((room) => {
    const artist = artistById(room.artistId);
    return artist ? [{ artist, room }] : [];
  });
  const activities = fixture.activities
    .filter((activity) => artistFilter === "all" || activity.artistId === artistFilter)
    .filter((activity) => activityFilter === "all" || (activityFilter === "room" ? activity.type === "room" : activity.type === "grade"))
    .filter((activity) => !unreadOnly || !readUpdateIds.has(activity.id))
    .flatMap((activity) => {
      const artist = artistById(activity.artistId);
      return artist ? [{ artist, activity }] : [];
    });
  const unreadCount = fixture.activities.filter(({ id }) => !readUpdateIds.has(id)).length;
  const changeTab = (nextTab: MyArtistsTab) => {
    setTab(nextTab);
    onNavigationChange(nextTab, "holdings");
  };
  const markRead = (activityId: string) => onSessionStateChange({ ...sessionState, readUpdateIds: new Set(readUpdateIds).add(activityId) });
  const markAllRead = () => onSessionStateChange({ ...sessionState, readUpdateIds: new Set(fixture.activities.map(({ id }) => id)) });

  const renderHoldingCards = (transactionActions = false) => (
    <div className="tremplin-my-token-grid">
      {holdings.map(({ artist, holding }) => <article key={holding.artistId} className="tremplin-my-token-card">
        <header className="tremplin-my-token-card__header">
          <img src={artist.portrait} alt="" />
          <div><small>{holding.ticker}</small><h3>{artist.name}</h3><p>Artiste · {artist.styles[0]}</p></div>
          <MeewavGradeBadge level={artist.gradeLevel} size="xs" variant="icon" />
        </header>
        <div className="tremplin-my-token-card__market">
          <div><span>Valeur actuelle</span><strong>{formatFixtureDecimal(holding.tokenPrice)}</strong></div>
          <MyArtistsChange value={holding.change24hPercent} />
        </div>
        <dl className="tremplin-my-token-card__holding">
          <div><dt>Tu détiens</dt><dd>{formatFixtureDecimal(holding.quantityHeld, holding.ticker)}</dd></div>
          <div><dt>Valeur estimée</dt><dd>{formatFixtureDecimal(holding.estimatedValue)}</dd></div>
          <div title="Différence estimée entre la valeur actuelle et le montant payé, avant les frais de revente." aria-label={`Depuis tes achats : plus ${formatFixtureDecimal(holding.estimatedDifference)}. Différence estimée avant les frais de revente.`}><dt>Depuis tes achats</dt><dd aria-hidden="true">+{formatFixtureDecimal(holding.estimatedDifference)}</dd></div>
        </dl>
        <p className="tremplin-my-token-card__update"><i aria-hidden="true"><MeewavTokenIcon /></i><span><small>Projet</small>{holding.latestProjectUpdate}</span></p>
        <footer>
          <button type="button" className="is-primary" onClick={() => onOpen(artist, "profile-support")}><TrendingUp aria-hidden="true" /> Voir le jeton <ArrowRight aria-hidden="true" /></button>
          <button type="button" className="is-stats" aria-label={`Voir les statistiques du jeton ${holding.ticker}`} onClick={() => onOpen(artist, "profile-token-statistics")}><ChartNoAxesColumnIncreasing size={16} aria-hidden="true" /> Statistiques</button>
          <button type="button" className="is-link" aria-label={`Voir le profil de ${artist.name}`} onClick={() => onOpen(artist)}>Voir le profil <ArrowRight aria-hidden="true" /></button>
          {transactionActions ? <div className="tremplin-my-token-card__transaction-actions"><button type="button" className="is-token-action" onClick={() => onTrade(artist, "buy")}><MeewavTokenIcon aria-hidden="true" /> Acheter d’autres jetons</button><button type="button" onClick={() => onTrade(artist, "sell")}>Revendre mes jetons</button></div> : null}
        </footer>
      </article>)}
    </div>
  );

  const renderActivityFeed = () => <section className="tremplin-my-dashboard__activity" aria-labelledby="my-artists-activity-title">
    <header>
      <div><span className="tremplin-kicker">Activité</span><h2 id="my-artists-activity-title">Ce qui a changé chez tes artistes</h2></div>
      <div className="tremplin-my-dashboard__feed-filters">
        <label>Artiste<select value={artistFilter} onChange={(event) => onSessionStateChange({ ...sessionState, artistFilter: event.target.value })}><option value="all">Tous</option>{followedArtists.map((artist) => <option key={artist.id} value={artist.id}>{artist.name}</option>)}</select></label>
        <label>Type<select value={activityFilter} onChange={(event) => onSessionStateChange({ ...sessionState, activityFilter: event.target.value as MyArtistsSessionState["activityFilter"] })}><option value="all">Toutes</option><option value="room">Rooms</option><option value="grade">Grades</option></select></label>
        <label className="is-checkbox"><input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} /><span>Non lus uniquement</span></label>
        {unreadCount > 0 ? <button type="button" onClick={markAllRead}>Tout marquer comme lu</button> : null}
      </div>
    </header>
    <div>{activities.map(({ artist, activity }) => <article key={activity.id} className={readUpdateIds.has(activity.id) ? "is-read" : "is-unread"}><img src={artist.portrait} alt="" /><div><small>{artist.name} · {activity.dateLabel}</small><h3>{activity.title}</h3><p>{activity.description}</p></div><button type="button" aria-label="Voir cette actualité" onClick={() => { markRead(activity.id); onOpen(artist, activity.anchorId); }}>Voir <ChevronRight aria-hidden="true" /></button></article>)}{activities.length === 0 ? <p className="tremplin-my-dashboard__feed-empty">Aucune actualité ne correspond à ces filtres.</p> : null}</div>
  </section>;

  const renderRooms = () => <section className="tremplin-my-dashboard__rooms" aria-labelledby="my-artists-rooms-title"><header><span className="tremplin-kicker">En direct</span><h2 id="my-artists-rooms-title">Rooms à venir</h2></header><div>{rooms.map(({ artist, room }) => { const reminded = roomReminderIds.has(room.id); return <article key={room.id}><img src={artist.portrait} alt="" /><div><small>{room.dateLabel}</small><h3>{room.title}</h3><p>{artist.name} · {room.interestedCount.toLocaleString("fr-FR")} personnes intéressées</p></div><footer><button type="button" className={reminded ? "is-reminded" : ""} aria-pressed={reminded} onClick={() => { const next = new Set(roomReminderIds); if (reminded) next.delete(room.id); else next.add(room.id); onSessionStateChange({ ...sessionState, roomReminderIds: next }); onNotify(reminded ? `Rappel retiré pour ${room.title}.` : `Rappel ajouté pour ${room.title}.`); }}>{reminded ? "Rappel ajouté ✓" : "Ajouter un rappel"}</button><button type="button" onClick={() => onOpenRoom(artist)}>Voir la Room</button></footer></article>; })}</div></section>;

  if (fixture.id === "empty") {
    return <div className="tremplin-my-artists tremplin-my-dashboard is-empty"><header className="tremplin-my-dashboard__header"><div><span className="tremplin-kicker">Mes artistes</span><h1>Tes artistes <span>et tes jetons de talent</span></h1><p>Retrouve ici les projets et les artistes que tu choisis de suivre.</p></div>{import.meta.env.DEV ? <small className="tremplin-demo-indicator">Données de démonstration</small> : null}</header><section className="tremplin-my-dashboard__empty"><Heart aria-hidden="true" /><span className="tremplin-kicker">Ton espace personnel</span><h2>Commence à construire ton espace</h2><p>Suis gratuitement les artistes qui te plaisent. Leurs nouvelles créations, leurs projets et leurs prochaines Rooms apparaîtront ici.</p><button type="button" onClick={onDiscover}>Découvrir les projets</button></section></div>;
  }

  return <div className="tremplin-my-artists tremplin-my-dashboard" data-fixture={fixture.id}>
    <header className="tremplin-my-dashboard__header">
      <div><span className="tremplin-kicker">Mes artistes</span><h1>Tes artistes <span>et tes jetons de talent</span></h1><p>{fixture.id === "populated" ? "Consulte l’évolution de tes jetons, puis retrouve les créations, les projets et les prochaines Rooms des artistes que tu suis." : "Retrouve les créations, les projets et les prochaines Rooms des artistes que tu suis gratuitement."}</p></div>
      {import.meta.env.DEV ? <small className="tremplin-demo-indicator">Données de démonstration</small> : null}
    </header>

    {fixture.id === "populated" ? <section className="tremplin-my-artists-summary" aria-label="Résumé de tes jetons et artistes">
      <article className="tremplin-my-artists-summary__primary"><span>Valeur estimée actuelle</span><strong>{formatFixtureDecimal(fixture.summary.estimatedCurrentValue)}</strong><small>Valeurs estimées avant les frais. La revente peut ne pas être immédiate.</small></article>
      <article><span>Évolution sur 24 h</span><MyArtistsChange value={fixture.summary.change24hPercent} label="24 h" /></article>
      <article><span>Écart estimé depuis les achats</span><strong>+{formatFixtureDecimal(fixture.summary.estimatedDifference)}</strong></article>
      <article className="is-token-metric"><span><MeewavTokenIcon aria-hidden="true" /> Jetons détenus</span><strong>{fixture.summary.activeTokenCount}</strong></article>
      <article><span>Rooms à venir</span><strong>{fixture.summary.upcomingRoomsCount}</strong></article>
    </section> : <section className="tremplin-my-artists-summary is-following-only" aria-label="Résumé des artistes suivis"><article className="tremplin-my-artists-summary__primary"><span>Artistes suivis</span><strong>{fixture.summary.followedArtistsCount}</strong><small>Le suivi reste gratuit et ne signifie pas que tu possèdes des jetons.</small></article><article><span>Actualités non lues</span><strong>{unreadCount}</strong></article><article><span>Rooms à venir</span><strong>{fixture.summary.upcomingRoomsCount}</strong></article></section>}

    <nav className="tremplin-my-artists__tabs" aria-label="Contenu de Mes artistes">
      {([['overview', 'Aperçu'], ['tokens', 'Mes jetons'], ['followed', 'Artistes suivis'], ['rooms', 'Rooms'], ['activity', 'Activité']] as const).map(([id, label]) => <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => changeTab(id)}>{id === "tokens" ? <MeewavTokenIcon aria-hidden="true" /> : null}{label}</button>)}
    </nav>

    {tab === "overview" ? <div className="tremplin-my-dashboard__overview">
      {fixture.id === "populated" ? <section className="tremplin-my-dashboard__holdings" aria-labelledby="my-holdings-title"><header><div className="tremplin-my-dashboard__holding-art" aria-hidden="true" /><span className="tremplin-kicker">Aujourd’hui</span><h2 id="my-holdings-title">Tes jetons <em>aujourd’hui</em></h2><p>Valeur actuelle, évolution récente et actualités des projets associés.</p></header>{renderHoldingCards()}</section> : <section className="tremplin-my-dashboard__followed-preview"><header><span className="tremplin-kicker">Suivi gratuit</span><h2>Artistes que tu suis</h2></header><div>{followedArtists.slice(0, 4).map((artist) => <button key={artist.id} type="button" onClick={() => onOpen(artist)}><img src={artist.portrait} alt="" /><span><strong>{artist.name}</strong><small>{artist.stageLabel}</small></span><MeewavGradeBadge level={artist.gradeLevel} size="xs" variant="icon" /></button>)}</div></section>}
      {fixture.watch.length > 0 ? <section className="tremplin-my-dashboard__watch"><header><span className="tremplin-kicker">À surveiller</span><h2>Les statuts qui ont évolué</h2></header><div>{fixture.watch.map((item) => { const artist = artistById(item.artistId); return artist ? <article key={item.artistId} data-token-stage={getTremplinTokenLifecycleStage(artist)}><img src={artist.portrait} alt="" /><div><strong>{artist.name}</strong><span>{item.label}</span><p>{item.detail}</p></div><button type="button" onClick={() => onOpen(artist, item.anchorId)}>{item.action}<ArrowRight aria-hidden="true" /></button></article> : null; })}</div></section> : null}
      <div className="tremplin-my-dashboard__lower">{renderActivityFeed()}{renderRooms()}</div>
    </div> : null}

    {tab === "tokens" ? <section className="tremplin-my-dashboard__tokens"><header><span className="tremplin-kicker">Mes jetons</span><h2>Valeurs, opérations et documents</h2><p>{isLocalAuthPreviewEnabled() ? "Les montants restent estimatifs avant les frais et les conditions de revente." : "Les opérations seront disponibles après le lancement du portefeuille."}</p></header>{holdings.length > 0 ? renderHoldingCards(true) : <div className="tremplin-empty-state"><MeewavTokenIcon /><h2>Aucun jeton détenu</h2><p>Tu peux suivre les artistes gratuitement sans acheter de jetons.</p></div>}{isLocalAuthPreviewEnabled() ? <section className="tremplin-my-dashboard__operations"><header><h2>Dernières opérations</h2><button type="button" onClick={() => onNotify("Exemples de reçus de démonstration.")}>Voir les reçus</button></header>{tremplinMockTransactions.slice(0, 5).map((transaction) => <article key={transaction.id}><time>{transaction.dateLabel}</time><strong>{transaction.artistName}</strong><span>{transaction.operation === "purchase" ? "Achat" : "Revente"}</span><span>{formatCurrency(transaction.amountEur)}</span><em>{transaction.statusLabel}</em></article>)}</section> : null}</section> : null}

    {tab === "followed" ? <section className="tremplin-my-dashboard__followed"><header><span className="tremplin-kicker">Suivi gratuit</span><h2>Artistes que tu suis</h2><p>Suivre un artiste ne signifie pas posséder ses jetons.</p></header><div>{followedArtists.map((artist) => { const status = getTremplinTokenLifecycleStage(artist); const latest = artist.updates[0]; return <article key={artist.id}><img src={artist.portrait} alt="" /><div><h3>{artist.name}</h3><span>{artist.stageLabel}</span><p>{latest?.title ?? "Aucune actualité récente"}</p><small>{TREMPLIN_DISCOVERY_TOKEN_UI[status].label}</small></div><MeewavGradeBadge level={artist.gradeLevel} size="xs" variant="icon" /><button type="button" onClick={() => onOpen(artist)}>Voir le profil</button></article>; })}</div></section> : null}
    {tab === "rooms" ? renderRooms() : null}
    {tab === "activity" ? renderActivityFeed() : null}
  </div>;
}

export default function TremplinPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status: authStatus } = useAuth();
  const localPreviewEnabled = isLocalAuthPreviewEnabled();
  const viewer = resolveTremplinViewer({ user, authStatus, localPreviewEnabled });
  const initialSessionSnapshot = getTremplinSessionSnapshot(location.state);
  const [activeView, setActiveView] = useState<TremplinView>(() => getTremplinViewFromPath(location.pathname));
  const [homeWallRailId, setHomeWallRailId] = useState<TremplinDiscoveryRailId | null>(() => initialSessionSnapshot?.homeWallRailId ?? getDiscoveryRailFromSearch(location.search));
  const [discoveryState, setDiscoveryState] = useState<TremplinDiscoveryState>(() => initialSessionSnapshot?.discoveryState ?? {
    ...DEFAULT_TREMPLIN_DISCOVERY_STATE,
    query: new URLSearchParams(location.search).get("q") ?? "",
  });
  const [myArtistsSessionState, setMyArtistsSessionState] = useState<MyArtistsSessionState>(() => initialSessionSnapshot
    ? {
        ...initialSessionSnapshot.myArtistsSessionState,
        readUpdateIds: new Set(initialSessionSnapshot.myArtistsSessionState.readUpdateIds),
        roomReminderIds: new Set(initialSessionSnapshot.myArtistsSessionState.roomReminderIds ?? []),
      }
    : {
        artistFilter: "all",
        activityFilter: "all",
        readUpdateIds: readTremplinPersistedSet("read-updates", viewer.storageScope),
        roomReminderIds: readTremplinPersistedSet("room-reminders", viewer.storageScope),
      });
  const [favorites, setFavorites] = useState<Set<string>>(() => readTremplinPersistedSet("followed-artists", viewer.storageScope));
  const [selectedArtist, setSelectedArtist] = useState<TremplinArtist | null>(() => getArtistFromPath(location.pathname));
  const [flow, setFlow] = useState<{ artist: TremplinArtist; token: TremplinArtistToken; mode: TokenOperationMode } | null>(null);
  const [playingArtistId, setPlayingArtistId] = useState<string | null>(null);
  const [audioProgress, setAudioProgress] = useState({ currentTime: 0, duration: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map(initialSessionSnapshot?.scrollPositions ?? []));
  const persistenceScopeRef = useRef(viewer.storageScope);

  useEffect(() => {
    if (authStatus === "loading" && !localPreviewEnabled) return;
    if (persistenceScopeRef.current === viewer.storageScope) return;
    persistenceScopeRef.current = viewer.storageScope;
    const localFollows = readTremplinPersistedSet("followed-artists", viewer.storageScope);
    setFavorites(localFollows);
    setMyArtistsSessionState((current) => ({
      ...current,
      readUpdateIds: readTremplinPersistedSet("read-updates", viewer.storageScope),
      roomReminderIds: readTremplinPersistedSet("room-reminders", viewer.storageScope),
    }));
  }, [authStatus, localPreviewEnabled, viewer.storageScope]);

  useEffect(() => {
    if (authStatus === "loading" && !localPreviewEnabled) return undefined;
    let cancelled = false;
    void loadConnectedTremplinFollows(tremplinArtists, localPreviewEnabled).then((connected) => {
      if (cancelled) return;
      setFavorites(new Set(connected));
      writeTremplinPersistedSet("followed-artists", viewer.storageScope, connected);
    }).catch(() => {
      if (!cancelled && !localPreviewEnabled) setToast("Impossible de synchroniser tes artistes suivis. Réessaie plus tard.");
    });
    return () => { cancelled = true; };
  }, [authStatus, localPreviewEnabled, viewer.storageScope]);

  useEffect(() => {
    const routeView = getTremplinViewFromPath(location.pathname);
    const routeFlow = getFlowFromPath(location.pathname);
    const routeArtist = getArtistFromPath(location.pathname);
    setActiveView(routeView);
    setFlow(routeFlow);
    setSelectedArtist(routeArtist);
    if (routeView !== "discover") setHomeWallRailId(null);
    if (!location.hash) {
      const locationKey = `${location.pathname}${location.search}`;
      const returnScrollTop = scrollPositionsRef.current.get(locationKey) ?? 0;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: returnScrollTop, behavior: "auto" }));
    }
    // Query parameters encode local tabs; changing one must not reset the page scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (activeView !== "discover") return;
    const railId = getDiscoveryRailFromSearch(location.search);
    setHomeWallRailId(railId);
    if (railId === null) {
      const routeQuery = new URLSearchParams(location.search).get("q") ?? "";
      setDiscoveryState((current) => current.query === routeQuery ? current : { ...current, query: routeQuery });
    }
  }, [activeView, location.search]);

  useEffect(() => {
    if (activeView !== "understand" || !location.hash) return undefined;
    const targetId = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeView, location.hash]);

  useEffect(() => {
    if (!selectedArtist || !location.hash) return undefined;
    const targetId = decodeURIComponent(location.hash.slice(1));
    const frame = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, selectedArtist]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    setAudioProgress({ currentTime: 0, duration: 0 });
    if (!playingArtistId) return;
    const artist = tremplinArtists.find((item) => item.id === playingArtistId);
    if (!artist) return;
    const audio = new Audio(artist.audio.audioSrc);
    audio.preload = "metadata";
    audio.volume = .35;
    audio.onloadedmetadata = () => setAudioProgress({ currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    audio.ontimeupdate = () => setAudioProgress({ currentTime: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : 0 });
    audio.onended = () => {
      trackTremplinEvent("preview_completed", { artistId: artist.id });
      setPlayingArtistId(null);
    };
    audio.onerror = () => {
      setPlayingArtistId(null);
      setToast("Cet extrait audio n’est pas disponible pour le moment.");
    };
    audio.play().catch(() => { setPlayingArtistId(null); setToast("La préécoute audio n’est pas disponible sur cet appareil."); });
    audioRef.current = audio;
    return () => { audio.pause(); audio.onerror = null; audio.onended = null; audio.onloadedmetadata = null; audio.ontimeupdate = null; };
  }, [playingArtistId]);

  useEffect(() => {
    if (activeView === "home" && !selectedArtist && !flow) trackTremplinEvent("tremplin_home_viewed");
  }, [activeView, flow, selectedArtist]);

  const profileOrigin = selectedArtist ? getTremplinReturnTo(location.state) : null;
  const activeToolbarId = selectedArtist && profileOrigin
    ? getTremplinViewFromPath(profileOrigin.split(/[?#]/)[0])
    : selectedArtist ? "discover" : activeView;
  const effectiveUserState: TremplinUserState = activeView === "application"
    ? "application-pending"
    : activeView === "dashboard"
      ? "token-active"
      : viewer.userState;
  const contextAction = getTremplinContextAction(effectiveUserState);
  const toggleFavorite = (artistId: string) => {
    const following = !favorites.has(artistId);
    const artist = tremplinArtists.find(({ id }) => id === artistId);
    const artistName = artist?.name ?? "L’artiste";
    if (!artist || (!localPreviewEnabled && !isCanonicalProfileId(artist.profileId ?? ""))) {
      setToast("Ce profil de démonstration ne peut pas être suivi avec un compte réel.");
      return;
    }
    const previous = new Set(favorites);
    const optimistic = new Set(favorites);
    if (following) optimistic.add(artistId); else optimistic.delete(artistId);
    setFavorites(optimistic);
    writeTremplinPersistedSet("followed-artists", viewer.storageScope, optimistic);
    setToast(following ? `${artistName} a été ajouté à Mes artistes.` : `${artistName} a été retiré de Mes artistes.`);
    trackTremplinEvent(following ? "artist_followed" : "artist_unfollowed", { artistId });
    void persistTremplinFollow({ artist, following, localPreviewEnabled }).then((result) => {
      if (result.following === following) return;
      setFavorites((current) => {
        const next = new Set(current);
        if (result.following) next.add(artistId); else next.delete(artistId);
        writeTremplinPersistedSet("followed-artists", viewer.storageScope, next);
        return next;
      });
    }).catch(() => {
      setFavorites(previous);
      writeTremplinPersistedSet("followed-artists", viewer.storageScope, previous);
      setToast(`Impossible de modifier le suivi de ${artistName} pour le moment.`);
    });
  };
  const currentTremplinLocation = `${location.pathname}${location.search}${location.hash}`;
  const myArtistsNavigation = getMyArtistsNavigation(location.search);
  const updateMyArtistsNavigation = (tab: MyArtistsTab, mwTab: MyArtistsMwTab) => {
    const params = new URLSearchParams(location.search);
    params.delete("tab");
    params.delete("section");
    if (tab !== "overview") params.set("tab", tab);
    if (tab === "tokens" && mwTab !== "holdings") params.set("section", mwTab);
    const query = params.toString();
    navigate(`${TREMPLIN_VIEW_ROUTES.myArtists}${query ? `?${query}` : ""}`, { replace: true });
  };
  const openArtist = (artist: TremplinArtist, anchorId?: string) => {
    scrollPositionsRef.current.set(currentTremplinLocation.split("#")[0], scrollRef.current?.scrollTop ?? 0);
    trackTremplinEvent(anchorId?.startsWith("etape-") ? "project_step_opened" : "artist_card_opened", { artistId: artist.id, anchorId: anchorId ?? null });
    navigate(`${TREMPLIN_ARTIST_ROUTE_PREFIX}/${encodeURIComponent(artist.id)}${anchorId ? `#${anchorId}` : ""}`, {
      state: { tremplinReturnTo: currentTremplinLocation } satisfies TremplinNavigationState,
    });
  };
  const closeArtist = () => {
    const returnTo = getTremplinReturnTo(location.state);
    setSelectedArtist(null);
    if (returnTo && didReturnFromRooms(location.state)) navigate(returnTo, { replace: true });
    else if (returnTo) navigate(-1);
    else navigate(TREMPLIN_VIEW_ROUTES.discover, { replace: true });
  };
  const changeView = (view: TremplinView, anchorId?: string) => {
    setSelectedArtist(null);
    setHomeWallRailId(null);
    setActiveView(view);
    if (view === "understand" || view === "application" || view === "dashboard") setPlayingArtistId(null);
    navigate(`${TREMPLIN_VIEW_ROUTES[view]}${anchorId ? `#${anchorId}` : ""}`);
    if (!anchorId) requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
  };
  const focusHomeSearch = (query = "") => {
    setDiscoveryState((current) => ({ ...current, query }));
    setSelectedArtist(null);
    setHomeWallRailId(null);
    setActiveView("discover");
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    navigate(`${TREMPLIN_VIEW_ROUTES.discover}${params.size ? `?${params.toString()}` : ""}`);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }));
    window.setTimeout(() => document.getElementById("tremplin-home-search")?.focus(), 80);
  };
  const updateMyArtistsSessionState = (next: MyArtistsSessionState) => {
    setMyArtistsSessionState(next);
    writeTremplinPersistedSet("read-updates", viewer.storageScope, next.readUpdateIds);
    writeTremplinPersistedSet("room-reminders", viewer.storageScope, next.roomReminderIds);
  };
  const changeHomeWallRail = (railId: TremplinDiscoveryRailId | null) => {
    setHomeWallRailId(railId);
    setDiscoveryState((current) => ({
      ...current,
      visibleCount: DEFAULT_TREMPLIN_DISCOVERY_STATE.visibleCount,
      wallScrollTop: 0,
    }));
    const route = railId
      ? `${TREMPLIN_VIEW_ROUTES.discover}?collection=${encodeURIComponent(railId)}`
      : TREMPLIN_VIEW_ROUTES.discover;
    navigate(route, { replace: railId === null });
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "auto" }));
  };
  const updateDiscoveryState = useCallback((next: TremplinDiscoveryState) => {
    setDiscoveryState((current) => {
      const sameWallSelection = current.query === next.query
        && current.styleFilter === next.styleFilter
        && current.categoryFilter === next.categoryFilter
        && current.gradeFilter === next.gradeFilter
        && current.tokenPresenceFilter === next.tokenPresenceFilter
        && current.tokenAvailabilityFilter === next.tokenAvailabilityFilter
        && current.newOnly === next.newOnly
        && current.verifiedOnly === next.verifiedOnly
        && current.nearMeOnly === next.nearMeOnly
        && current.regionFilter === next.regionFilter
        && current.cityFilter === next.cityFilter
        && current.wallCategoryFilter === next.wallCategoryFilter
        && current.sort === next.sort;
      if (!sameWallSelection || next.visibleCount >= current.visibleCount) return next;
      return {
        ...next,
        visibleCount: current.visibleCount,
        wallScrollTop: Math.max(current.wallScrollTop, next.wallScrollTop),
      };
    });
  }, []);
  const openFlow = (artist: TremplinArtist, mode: TokenOperationMode) => {
    if (!localPreviewEnabled) {
      setToast("Les opérations sur les jetons ne sont pas encore ouvertes.");
      return;
    }
    const token = getTremplinArtistToken(artist.id);
    if (!token || getTremplinTokenLifecycleStage(artist) !== "active") {
      setToast("Les opérations sur les jetons ne sont disponibles que pour un jeton actif.");
      return;
    }
    trackTremplinEvent(mode === "buy" ? "purchase_flow_started" : "resale_flow_started", { artistId: artist.id });
    setPlayingArtistId(null);
    scrollPositionsRef.current.set(currentTremplinLocation.split("#")[0], scrollRef.current?.scrollTop ?? 0);
    setFlow({ artist, token, mode });
    navigate(`${TREMPLIN_FLOW_ROUTE_PREFIX}/${encodeURIComponent(artist.id)}/${mode === "buy" ? "achat" : "revente"}`, {
      state: { tremplinReturnTo: currentTremplinLocation } satisfies TremplinNavigationState,
    });
  };
  const closeFlow = () => {
    const returnTo = getTremplinReturnTo(location.state);
    setFlow(null);
    if (returnTo) navigate(-1);
    else navigate(TREMPLIN_VIEW_ROUTES.myArtists, { replace: true });
  };
  const closeWorkspace = () => {
    const returnTo = getTremplinReturnTo(location.state);
    if (returnTo) navigate(returnTo, { replace: true });
    else navigate(TREMPLIN_VIEW_ROUTES.home, { replace: true });
  };
  const openRoom = (artist: TremplinArtist) => {
    const token = getTremplinArtistToken(artist.id);
    const profileReturnTo = getTremplinReturnTo(location.state);
    scrollPositionsRef.current.set(currentTremplinLocation.split("#")[0], scrollRef.current?.scrollTop ?? 0);
    const tremplinSessionSnapshot: TremplinSessionSnapshot = {
      discoveryState,
      homeWallRailId,
      myArtistsSessionState: {
        ...myArtistsSessionState,
        readUpdateIds: [...myArtistsSessionState.readUpdateIds],
        roomReminderIds: [...myArtistsSessionState.roomReminderIds],
      },
      scrollPositions: [...scrollPositionsRef.current.entries()],
    };
    trackTremplinEvent("room_opened", { artistId: artist.id });
    navigate("/rooms", { state: {
      tremplinReturnTo: currentTremplinLocation,
      tremplinProfileReturnTo: profileReturnTo,
      tremplinArtistId: artist.id,
      tremplinArtistName: artist.name,
      tremplinRoomTitle: token?.nextRoom.title,
      tremplinRoomDateLabel: token?.nextRoom.dateLabel,
      tremplinSessionSnapshot,
    } });
  };
  const toggleAudio = (artistId: string) => setPlayingArtistId((current) => {
    const next = current === artistId ? null : artistId;
    if (next) trackTremplinEvent("preview_started", { artistId });
    return next;
  });

  const mainContent = (() => {
    if (selectedArtist) {
      const token = getTremplinArtistToken(selectedArtist.id);
      if (token) return <ArtistDetail artist={selectedArtist} token={token} favorite={favorites.has(selectedArtist.id)} playing={playingArtistId === selectedArtist.id} onBack={closeArtist} backLabel={getArtistReturnLabel(location.state)} onFavorite={() => toggleFavorite(selectedArtist.id)} onTrade={(mode) => openFlow(selectedArtist, mode)} onToggleAudio={() => toggleAudio(selectedArtist.id)} onOpenRoom={() => openRoom(selectedArtist)} />;
    }
    if (isArtistRoutePath(location.pathname)) return <ArtistNotFound onBack={closeArtist} backLabel={getArtistReturnLabel(location.state)} />;
    if (activeView === "understand") return (
      <TremplinTokenEducation
        onDiscover={() => changeView("discover")}
        onHome={() => changeView("home")}
        onOpenRoute={(route) => navigate(route)}
      />
    );
    if (activeView === "myArtists") return <MyArtistsView favorites={favorites} initialTab={myArtistsNavigation.tab} initialMwTab={myArtistsNavigation.mwTab} onOpen={openArtist} onTrade={openFlow} onOpenRoom={openRoom} onDiscover={() => changeView("discover")} onNotify={setToast} onNavigationChange={updateMyArtistsNavigation} sessionState={myArtistsSessionState} onSessionStateChange={updateMyArtistsSessionState} />;
    if (activeView === "application") return <TremplinTokenWorkspace mode="application" onClose={closeWorkspace} onApplicationSubmitted={() => setToast("Simulation terminée : aucune demande réelle n’a été envoyée.")} />;
    if (activeView === "dashboard") return <TremplinTokenWorkspace mode="dashboard" onClose={closeWorkspace} />;
    if (activeView === "home") {
      return (
        <TremplinPublicHome
          playingArtistId={playingArtistId}
          followedArtistIds={favorites}
          userState={effectiveUserState}
          onToggleArtistAudio={toggleAudio}
          onOpenArtist={openArtist}
          onOpenArtistSupport={(artist) => openArtist(artist, "profile-support")}
          onMyArtists={() => changeView("myArtists")}
          onUnderstand={() => changeView("understand")}
          onUnderstandGrades={() => changeView("understand", "tremplin-grades")}
          onUnderstandToken={() => changeView("understand", "tremplin-token-mw")}
          onOpenRoute={(route) => navigate(route)}
          onSearch={focusHomeSearch}
          artistActionLabel={contextAction.label}
          artistActionDetail={contextAction.detail}
          onArtistAction={() => changeView(contextAction.destination)}
        />
      );
    }
    return (
      <DiscoveryExperience
        playingArtistId={playingArtistId}
        favorites={favorites}
        wallRailId={homeWallRailId}
        onOpen={openArtist}
        onOpenToken={(artist) => openArtist(artist, "profile-support")}
        onOpenStatistics={(artist) => openArtist(artist, "profile-token-statistics")}
        onFavorite={toggleFavorite}
        onToggleAudio={toggleAudio}
        onWallRailIdChange={changeHomeWallRail}
        discoveryState={discoveryState}
        onDiscoveryStateChange={updateDiscoveryState}
      />
    );
  })();
  const isFocusedFlow = Boolean(flow) || (!selectedArtist && (activeView === "application" || activeView === "dashboard"));
  const notificationCount = tremplinArtists
    .filter(({ id }) => favorites.has(id))
    .flatMap(({ updates }) => updates)
    .filter(({ id }) => !myArtistsSessionState.readUpdateIds.has(id)).length;
  const playingArtist = playingArtistId ? tremplinArtists.find(({ id }) => id === playingArtistId) ?? null : null;
  const audioProgressPercent = audioProgress.duration > 0 ? Math.min(100, Math.max(0, audioProgress.currentTime / audioProgress.duration * 100)) : 0;

  return (
    <main className="tremplin-page" data-tremplin-view={activeToolbarId} data-tremplin-focus={isFocusedFlow ? "true" : "false"}>
      <div className="tremplin-page__background" aria-hidden="true" />
      <aside className="tremplin-primary-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="tremplin"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
          onMessages={() => navigate("/messages")}
        />
      </aside>
      <div className="tremplin-shell">
        <header className="tremplin-topbar">
          <button
            type="button"
            className="tremplin-brand tremplin-brand__home"
            aria-label="Retour à l’accueil du Tremplin"
            onClick={() => changeView("home")}
          >
            <span className="tremplin-brand__copy">
              <MeewavPillarBrand pillar="Tremplin" />
            </span>
          </button>
          <div className="tremplin-contextbar__toolbar">
            <MeewavPillarTabs
              className="tremplin-pillar-tabs is-fine-indicator is-unframed-icons"
              items={TREMPLIN_NAV_ITEMS}
              activeId={activeToolbarId}
              ariaLabel="Navigation du Tremplin"
              onSelect={changeView}
            />
          </div>
          <div className="tremplin-topbar__actions">
            {activeView === "discover" && !selectedArtist && homeWallRailId !== null ? (
              <button type="button" className="tremplin-contextbar__option tremplin-contextbar__back" aria-label="Retour aux sélections" onClick={() => changeHomeWallRail(null)}>
                <ArrowLeft aria-hidden="true" /><span>Retour aux sélections</span>
              </button>
            ) : null}
            <button type="button" className="tremplin-icon-button" aria-label="Voir les activités de Mes artistes" onClick={() => changeView("myArtists")}><Bell />{notificationCount > 0 ? <span>{notificationCount}</span> : null}</button>
            <button type="button" className="tremplin-account-button" aria-label={`Ouvrir Mes artistes pour ${viewer.displayName}`} title={viewer.displayName} onClick={() => changeView("myArtists")}><img src={viewer.avatarUrl} alt="" /><span /></button>
          </div>
        </header>
        <div className={`tremplin-scroll${!selectedArtist && (activeView === "application" || activeView === "dashboard") ? " is-workspace" : ""}${!selectedArtist && activeView === "discover" && homeWallRailId !== null ? " is-home-wall" : ""}${!selectedArtist && activeView === "understand" ? " is-understand" : ""}`} ref={scrollRef}>
          {getDesktopApplicationMode() === "live" ? <p className="tremplin-empty-state" role="status">Le catalogue public du Tremplin n’est pas encore disponible dans cette version.</p> : !localPreviewEnabled ? <TremplinDemoBanner compact context="fixtures" /> : null}
          {flow ? <TremplinTokenFlow artist={flow.artist} token={flow.token} initialMode={flow.mode} backLabel={getTremplinReturnLabel(location.state)} onClose={closeFlow} onConfirm={(operation) => { setToast(`${operation.operation === "purchase" ? "Achat" : "Revente"} simulé pour ${flow.artist.name}. Aucune transaction réelle n’a été effectuée.`); }} /> : mainContent}
        </div>
      </div>
      {playingArtist && !isFocusedFlow ? <aside className="tremplin-now-playing" aria-label={`Lecture en cours : ${playingArtist.audio.title} par ${playingArtist.name}`}><img src={playingArtist.artwork} alt="" /><div><small>En écoute</small><strong>{playingArtist.audio.title}</strong><span>{playingArtist.name} · {playingArtist.styles[0]}</span><i aria-hidden="true"><b style={{ width: `${audioProgressPercent}%` }} /></i></div><button type="button" onClick={() => toggleAudio(playingArtist.id)} aria-label={`Mettre ${playingArtist.audio.title} en pause`}><Pause /></button></aside> : null}
      {toast && <div className="tremplin-toast" role="status"><CheckCircle2 /> {toast}</div>}
    </main>
  );
}
