import GoldenLikeConfirmationDialog from "../goldenLikes/GoldenLikeConfirmationDialog";
import AppRouteLoading from "../../components/shared/AppRouteLoading";
import { readSceneRecommendationPreferences } from "../scene/recommendations/sceneRecommendationPreferences";
import { useSceneListWindow } from "../scene/watch/useSceneListWindow";
import { getScenePrivateScope, setScenePrivateScope } from "../scene/scenePrivateStorage";
import { sceneVideoSlug } from "../scene/watch/sceneVideoLink";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bell,
  BellRing,
  Bookmark,
  CheckCheck,
  CheckCircle2,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  Home,
  Clock3,
  EyeOff,
  Flag,
  Grid2X2,
  LayoutDashboard,
  ListPlus,
  MoreVertical,
  Menu,
  Play,
  Plus,
  Search,
  Share2,
  Rows3,
  SlidersHorizontal,
  Tv,
  UserMinus,
  UserRound,
  X,
} from "lucide-react";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs, { type MeewavPillarTabItem } from "../../components/navigation/MeewavPillarTabs";
import {
  MeewavActiveFilterChips,
  MeewavFilterPanel,
  MeewavFilterSection,
  MeewavIllustratedFilterGrid,
  type MeewavActiveFilter,
} from "../../components/shared/search-filter/MeewavSearchFilter";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import { useAuth } from "../auth/AuthContext";
import { isLocalAuthPreviewEnabled } from "../auth/localAuthPreview";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import { getPreProfileArtistForSeed } from "../globe/components/preProfile/demoPreProfileArtist";
import { getFollowStates, setFollowState } from "../globe/api/preProfile.api";
import {
  ALL_SHORTS_VIDEOS,
  SHORTS_WALLS,
  type ShortsVideoFormat,
  type ShortsVideoItem,
  type ShortsWallDefinition,
  type ShortsWallId,
} from "./shorts-wall-data";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import FloatingSceneCardMenu from "./FloatingSceneCardMenu";
import {
  SCENE_CONTENT_TYPE_OPTIONS,
  SCENE_DATE_OPTIONS,
  SCENE_DURATION_OPTIONS,
  SCENE_GRADE_OPTIONS,
  SCENE_ARTIST_ROLE_OPTIONS,
  SCENE_SORT_OPTIONS,
  SCENE_STYLE_OPTIONS,
  countActiveSceneFilters,
  discoverSceneVideos,
  getSceneDefaultFilters,
  mergeSceneFiltersIntoSearch,
  parseSceneFilterSearch,
  sceneVideoFromShortsItem,
  type SceneContentType,
  type SceneArtistRole,
  type SceneDate,
  type SceneDuration,
  type SceneFilterState,
  type SceneSort,
  type SceneStyle,
} from "../scene/sceneDiscoveryModel";
import {
  evaluateSceneTvAvailability,
  SceneTvSchedule,
  SCENE_TV_GUIDE_FIXTURE,
  SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS,
  SCENE_TV_MAIN_CHANNEL_ID,
} from "../scene/tv";
import {
  sceneWatchHistoryRepository,
  type SceneWatchHistoryEntry,
} from "../scene/sceneWatchHistory";
import {
  SCENE_WATCH_LATER_PLAYLIST_ID,
  scenePlaylistRepository,
} from "../scene/scenePlaylists";
import SceneCreatorStudio from "../scene/studio/SceneCreatorStudio";
import ScenePlaylistsView from "../scene/playlists/ScenePlaylistsView";
import SceneRecommendationSettings from "../scene/recommendations/SceneRecommendationSettings";
import { trackSceneAnalytics } from "../scene/sceneAnalytics";
import { getPublishedSceneCatalogPage, searchPublishedSceneCatalogPage } from "../scene/sceneCatalog.service";
import {
  getProfileArtistDeepLink,
  safeProfileArtistReference,
} from "../profile/profileArtistDeepLink";
import {
  buildMessagingRoute,
  isMessagingUuid,
} from "../messaging/messaging.route";
import ShortsCollaborationDialog from "./ShortsCollaborationDialog";
import ShortsCreatorDrawer from "./ShortsCreatorDrawer";
import SceneSearch from "../scene/SceneSearch";
import SceneBrowseNavigation from "../scene/SceneBrowseNavigation";
import SceneWatchMenu from "../scene/SceneWatchMenu";
import SceneBrowseChips from "../scene/SceneBrowseChips";
import SceneHomeFeed from "../scene/SceneHomeFeed";
import SceneNavigationProgress from "../scene/SceneNavigationProgress";
import { canAdvancePlayback, initialWatchTime, resolveNextPlayback } from "../scene/watch/scenePlaybackPolicy";
import SceneWatchSidebar from "../scene/watch/SceneWatchSidebar";
import SceneCommentsSection from "../scene/comments/SceneCommentsSection";
import { watchRecommendations } from "../scene/watch/watchRecommendations";
import { useSceneDocumentScroll } from "../scene/watch/useSceneDocumentScroll";
import { useScenePlaybackQueue } from "../scene/watch/useScenePlaybackQueue";
import { type ShortsPlaybackProgress } from "./ShortsVideoPlayer";
import SceneVideoPlayback from "../scene/SceneVideoPlayback";
import VerticalMediaCard from "./VerticalMediaCard";
import { resolveSceneCanonicalProfileId } from "./shortsArtistIdentity";
import {
  getScenePathForTab,
  getSceneArtistReference,
  getScenePlaylistId,
  getScenePlaylistPath,
  getSceneTabFromPathname,
  getSceneVerticalPath,
  getSceneVerticalVideoId,
  getSceneWatchPath,
  getSceneWatchSlug,
  SCENE_NAME,
  SCENE_HISTORY_ROUTE,
  SCENE_PLAYLISTS_ROUTE,
  SCENE_RECOMMENDATION_SETTINGS_ROUTE,
  SCENE_ROUTE,
  SCENE_SIGNATURE,
  SCENE_STUDIO_ROUTE,
  SCENE_SUBSIGNATURE,
  SCENE_UPLOAD_ROUTE,
  type SceneRouteTab,
} from "./sceneContract";
import { canDisplayScenePublishing } from "./scenePublishingAccess";
import { useShortsDialog } from "./useShortsDialog";
import { useShortsEngagement } from "./useShortsEngagement";
import "./shorts-page.css";
import "./shorts-product-polish.css";
import "../scene/scene-watch.css";
import "../scene/scene-browse.css";
import "../scene/scene-header.css";
import "../scene/scene-card-surfaces.css";
import "../rooms/home/rooms-home-filter-lacquer.css";
import "../../components/shared/rail/rail-edge-navigation.css";

type SceneTabId = SceneRouteTab;
type ShortsNotification = {
  id: string;
  title: string;
  detail: string;
  videoId: string;
  read: boolean;
};

type LegacyVideoItem = {
  id: string;
  title: string;
  artist: string;
  image: string;
  video?: string;
  format?: ShortsVideoFormat;
  sourceFormat?: ShortsVideoFormat;
  linkedDesktopVersion?: boolean;
  secondaryVideo?: string;
  multicamLayout?: "pip" | "duo" | "instrument" | "rear";
  alt: string;
  duration: string;
  meta: string;
  role: string;
  city: string;
  views: string;
  badge?: string;
  availability?: string;
  description?: string;
  verified?: boolean;
};

type VideoItem = ShortsVideoItem;

function isShortItem(item: VideoItem) {
  return item.presentationFormat === "vertical" || item.format === "portrait";
}

const SCENE_TV_LAUNCH_DECISION = evaluateSceneTvAvailability({
  guide: SCENE_TV_GUIDE_FIXTURE,
  rightsGrants: SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS,
  options: {
    channelId: SCENE_TV_MAIN_CHANNEL_ID,
    startDay: new Date(),
    days: 14,
    territory: "WORLDWIDE",
  },
});

const SCENE_TV_LAUNCH_READY = SCENE_TV_LAUNCH_DECISION.available;

const SCENE_TABS: readonly MeewavPillarTabItem<SceneTabId>[] = [
  { id: "home", label: "Accueil", icon: Home, accent: "#f7f5ff" },
  { id: "explore", label: "Explorer", icon: Compass, accent: "#f7f5ff" },
  { id: "following", label: "Suivis", icon: Heart, accent: "#c56cff" },
  ...(SCENE_TV_LAUNCH_READY
    ? [{ id: "tv" as const, label: "TV", icon: Tv, accent: "#f7f5ff" }]
    : []),
];

const SCENE_SIGNATURE_ACCENT = "algorithme.";

const _FEATURED_VIDEO: LegacyVideoItem = {
  id: "maya-blue-hour-showreel",
  title: "Une voix dans la ville",
  artist: "MAYA N.",
  image: "/images/shorts/catalog-v2/vocal-pop-urbaine-blue-hour.webp",
  alt: "Maya interprète un titre pop urbaine à l’heure bleue",
  duration: "3:12",
  meta: "Showreel · Pop urbaine",
  role: "Chanteuse · Interprète",
  city: "Nanterre",
  views: "52 k vues",
  badge: "Showreel de la semaine",
  availability: "Recherche une direction artistique",
  description: "Une voix précise, une présence caméra et un univers déjà immédiatement lisible.",
  verified: true,
};

const _ROOM_REPLAYS: LegacyVideoItem[] = [
  {
    id: "room-replay-transatlantic",
    title: "Cordes sans frontières",
    artist: "Room Transatlantique",
    image: "/images/shorts/catalog-v2/tv-room-replay.webp",
    alt: "Quatre musiciens collaborent dans une Room circulaire",
    duration: "28:14",
    meta: "Replay de la Room · 12 juillet",
    role: "Session collaborative",
    city: "Paris · Dakar",
    views: "18 k vues",
    badge: "Replay Room",
  },
  {
    id: "room-replay-maeva",
    title: "Écrire une topline en direct",
    artist: "Maeva Sol & sa Room",
    image: "/images/shorts/catalog/live-maeva-acoustic.webp",
    alt: "Maeva Sol partage une session acoustique enregistrée",
    duration: "34:08",
    meta: "Replay de la Room · 9 juillet",
    role: "Chanteuse · Guitariste",
    city: "Bordeaux",
    views: "11 k vues",
    badge: "Replay Room",
    verified: true,
  },
  {
    id: "room-replay-azur",
    title: "Du sample à la scène",
    artist: "AZUR",
    image: "/images/shorts/catalog/live-azur-band.webp",
    alt: "Le duo Azur rejoue sa Room consacrée à la production",
    duration: "41:32",
    meta: "Replay de la Room · 4 juillet",
    role: "Duo électronique",
    city: "Lyon",
    views: "8,6 k vues",
    badge: "Replay Room",
    verified: true,
  },
];

const _FOR_YOU: LegacyVideoItem[] = [
  {
    id: "ines-club-transition",
    title: "Une transition, trois énergies",
    artist: "Inès K.",
    image: "/images/shorts/catalog-v2/creator-dj-club.webp",
    alt: "Une DJ réalise une transition dans un club",
    duration: "1:16",
    meta: "Sélectionnée selon tes écoutes",
    role: "DJ · Curatrice",
    city: "Marseille",
    views: "24 k vues",
    availability: "Disponible pour une date",
    verified: true,
  },
  {
    id: "malik-window-sax",
    title: "Le sax entre deux mesures",
    artist: "Malik Nox",
    image: "/images/shorts/community/community-saxophone-session.webp",
    alt: "Un saxophoniste interprète une session depuis son studio",
    duration: "0:54",
    meta: "Jazz contemporain · Improvisation",
    role: "Saxophoniste",
    city: "Montreuil",
    views: "9,8 k vues",
    availability: "Ouvert aux featurings",
  },
  {
    id: "lina-vocal-booth",
    title: "Une topline en une prise",
    artist: "Lina V.",
    image: "/images/shorts/community/community-vocal-booth.webp",
    alt: "Une chanteuse enregistre une topline dans son home studio",
    duration: "1:08",
    meta: "Pop urbaine · One take",
    role: "Chanteuse · Topliner",
    city: "Lille",
    views: "17 k vues",
    availability: "Recherche un beatmaker",
  },
  {
    id: "amira-sitar-fusion",
    title: "Raga sur une boucle soul",
    artist: "Amira Sen",
    image: "/images/shorts/community/community-sitar-fusion.webp",
    alt: "Une musicienne joue du sitar dans son studio",
    duration: "1:43",
    meta: "Fusion · Cordes",
    role: "Sitariste · Compositrice",
    city: "Nantes",
    views: "13 k vues",
    availability: "Ouverte aux collaborations",
    verified: true,
  },
];

const _OPEN_COLLABORATIONS: LegacyVideoItem[] = [
  {
    id: "yassine-pocket-drums",
    title: "Je cherche une voix pour ce refrain",
    artist: "Yassine B.",
    image: "/images/shorts/catalog-v2/creator-beatmaker-studio.webp",
    alt: "Un beatmaker compose dans un studio mansardé",
    duration: "1:28",
    meta: "Afro soul · 96 BPM",
    role: "Beatmaker · Producteur",
    city: "Roubaix",
    views: "21 k vues",
    availability: "Recherche chanteuse ou chanteur",
    verified: true,
  },
  {
    id: "noam-rooftop-violin",
    title: "Violon électrique disponible",
    artist: "Noam A.",
    image: "/images/shorts/catalog-v2/creator-violin-rooftop.webp",
    alt: "Un violoniste contemporain joue sur un toit au crépuscule",
    duration: "0:47",
    meta: "Néo-classique · Cinématique",
    role: "Violoniste · Arrangeur",
    city: "Paris",
    views: "12 k vues",
    availability: "Disponible pour clip et scène",
  },
  {
    id: "alya-choreography",
    title: "Une chorégraphie cherche son titre",
    artist: "Alya Flow",
    image: "/images/shorts/catalog-v2/creator-choreographer-rehearsal.webp",
    alt: "Une chorégraphe répète dans un grand studio industriel",
    duration: "0:36",
    meta: "Contemporain · Afro fusion",
    role: "Danseuse · Chorégraphe",
    city: "Lyon",
    views: "32 k vues",
    availability: "Recherche artiste pour un clip",
    verified: true,
  },
  {
    id: "rhea-drummer",
    title: "Batterie live, sans quantification",
    artist: "Rhea Das",
    image: "/images/shorts/catalog-v2/creator-drummer-live.webp",
    alt: "Une batteuse joue sur une scène alternative",
    duration: "1:02",
    meta: "Rock alternatif · Live",
    role: "Batteuse · Directrice live",
    city: "Rennes",
    views: "19 k vues",
    availability: "Disponible pour une tournée",
  },
];

const _MEEWAV_TV: LegacyVideoItem[] = [
  {
    id: "tv-composer-interview",
    title: "Composer avant d’entendre",
    artist: "Le Grand Entretien",
    image: "/images/shorts/catalog-v2/tv-interview-composer.webp",
    alt: "Une compositrice échange avec un journaliste sur le plateau MeeWav TV",
    duration: "18:42",
    meta: "MeeWav TV · Entretien",
    role: "Composition · Direction",
    city: "Studio MeeWav",
    views: "37 k vues",
    badge: "MeeWav TV",
    verified: true,
  },
  {
    id: "tv-backstage-documentary",
    title: "Cinq minutes avant la scène",
    artist: "Dans les coulisses",
    image: "/images/shorts/catalog-v2/tv-documentary-backstage.webp",
    alt: "Deux artistes se préparent dans les coulisses avant une scène",
    duration: "12:09",
    meta: "MeeWav TV · Documentaire",
    role: "Danse · Percussions",
    city: "Toulouse",
    views: "29 k vues",
    badge: "MeeWav TV",
  },
  {
    id: "tv-production-masterclass",
    title: "Donner du mouvement à un son",
    artist: "La Masterclass",
    image: "/images/shorts/catalog-v2/tv-masterclass-production.webp",
    alt: "Une productrice anime une masterclass de synthèse sonore",
    duration: "24:31",
    meta: "MeeWav TV · Masterclass",
    role: "Production électronique",
    city: "Studio MeeWav",
    views: "46 k vues",
    badge: "MeeWav TV",
    verified: true,
  },
  {
    id: "tv-multicam-performance",
    title: "Deux angles, une alchimie",
    artist: "MeeWav Sessions",
    image: "/images/shorts/catalog-v2/tv-performance-multicam.webp",
    alt: "Un violoncelliste et une batteuse sont filmés par plusieurs caméras",
    duration: "9:18",
    meta: "MeeWav TV · Performance",
    role: "Violoncelle · Batterie",
    city: "Bruxelles",
    views: "52 k vues",
    badge: "Multi-cam",
  },
];

const _SHOWREELS: LegacyVideoItem[] = [
  {
    id: "eliott-production-showreel",
    title: "Trois prods, trois identités",
    artist: "Eliott B.",
    image: "/images/shorts/community/community-producer-bedroom.webp",
    alt: "Un producteur présente ses créations depuis son studio",
    duration: "2:26",
    meta: "Showreel 2026 · Production",
    role: "Producteur · Mixeur",
    city: "Paris",
    views: "15 k vues",
    availability: "Prend deux nouveaux projets",
  },
  {
    id: "sam-rap-showreel",
    title: "Mon écriture en 90 secondes",
    artist: "Sam D.",
    image: "/images/shorts/community/community-rapper-bedroom.webp",
    alt: "Un rappeur présente son écriture dans un home studio",
    duration: "1:30",
    meta: "Showreel · Rap conscient",
    role: "Rappeur · Auteur",
    city: "Saint-Denis",
    views: "22 k vues",
    availability: "Ouvert aux collaborations",
    verified: true,
  },
  {
    id: "theo-acoustic-showreel",
    title: "Voix, guitare, rien à cacher",
    artist: "Théo M.",
    image: "/images/shorts/community/community-acoustic-guitar.webp",
    alt: "Un guitariste chante une session acoustique",
    duration: "2:04",
    meta: "Showreel · Folk",
    role: "Auteur · Compositeur",
    city: "Angers",
    views: "8,4 k vues",
    availability: "Recherche des premières parties",
  },
  {
    id: "leo-alt-rap-showreel",
    title: "Quatre flows, une minute",
    artist: "Léo S.",
    image: "/images/shorts/community/community-alt-rap-take.webp",
    alt: "Un artiste présente plusieurs flows devant son micro",
    duration: "1:00",
    meta: "Showreel · Rap alternatif",
    role: "Rappeur · Interprète",
    city: "Brest",
    views: "10 k vues",
    availability: "Recherche compositeur",
  },
];

const _CREATOR_STUDIO: LegacyVideoItem[] = [
  {
    id: "sana-one-take",
    title: "La fragilité du premier take",
    artist: "Sana Rei",
    image: "/images/shorts/catalog-v2/vocal-rnb-one-take-studio.webp",
    alt: "Une chanteuse R&B enregistre un titre en une prise",
    duration: "2:18",
    meta: "R&B · Studio",
    role: "Chanteuse · Autrice",
    city: "Paris",
    views: "31 k vues",
    verified: true,
  },
  {
    id: "demba-rooftop",
    title: "Le refrain qui rassemble",
    artist: "Demba K.",
    image: "/images/shorts/catalog-v2/vocal-afrobeat-rooftop-session.webp",
    alt: "Trois artistes jouent une session afrobeat sur un toit",
    duration: "2:43",
    meta: "Afrobeat · Session",
    role: "Chanteur · Musicien",
    city: "Dakar",
    views: "44 k vues",
  },
  {
    id: "naya-keo-sol-cypher",
    title: "Trois voix, un seul micro",
    artist: "NAYA × KÉO × SOL",
    image: "/images/shorts/catalog-v2/vocal-rap-cypher-basement.webp",
    alt: "Trois artistes interprètent un cypher dans un studio brut",
    duration: "6:24",
    meta: "Rap · Session collective",
    role: "Rappeurs · Auteurs",
    city: "Paris",
    views: "42 k vues",
    verified: true,
  },
  {
    id: "clara-rainy-loft",
    title: "Écrire quand la ville ralentit",
    artist: "Clara W.",
    image: "/images/shorts/catalog-v2/vocal-acoustic-rainy-loft.webp",
    alt: "Une autrice compositrice joue de la guitare près d’une fenêtre",
    duration: "2:37",
    meta: "Folk · Écriture",
    role: "Autrice · Guitariste",
    city: "Paris",
    views: "14 k vues",
  },
];

const _FREESTYLES: LegacyVideoItem[] = [
  {
    id: "idris-one-take",
    title: "16 mesures sans coupe",
    artist: "Idris",
    image: "/images/shorts/community/community-rap-one-take.webp",
    alt: "Un rappeur interprète un freestyle devant son micro",
    duration: "0:58",
    meta: "Freestyle · One take",
    role: "Rappeur",
    city: "Évry",
    views: "28 k vues",
  },
  {
    id: "joel-purple-take",
    title: "Freestyle violet #08",
    artist: "Joël K.",
    image: "/images/shorts/community/community-purple-performance.webp",
    alt: "Un artiste rappe sous une lumière violette",
    duration: "1:11",
    meta: "Freestyle · Trap",
    role: "Rappeur · Interprète",
    city: "Cergy",
    views: "36 k vues",
  },
  {
    id: "nassim-wall-session",
    title: "Le texte face au mur",
    artist: "Nassim",
    image: "/images/shorts/community/community-urban-rap.webp",
    alt: "Un rappeur interprète son texte devant un mur peint",
    duration: "1:24",
    meta: "Freestyle · Rap",
    role: "Rappeur · Auteur",
    city: "Aubervilliers",
    views: "19 k vues",
  },
  {
    id: "ghost-drill-take",
    title: "Plan séquence #17",
    artist: "GHOST",
    image: "/images/shorts/community/community-drill-mask.webp",
    alt: "Un artiste masqué interprète une performance nocturne",
    duration: "0:49",
    meta: "Freestyle · Drill",
    role: "Rappeur",
    city: "Londres",
    views: "63 k vues",
  },
];

const _INSTRUMENTALISTS: LegacyVideoItem[] = [
  {
    id: "kaori-volt",
    title: "Volt",
    artist: "Kaori",
    image: "/images/shorts/catalog/now-kaori-violin.webp",
    alt: "Kaori joue du violon sous une lumière turquoise",
    duration: "2:45",
    meta: "Néo-classique · Performance",
    role: "Violoniste",
    city: "Strasbourg",
    views: "21 k vues",
    availability: "Disponible pour un arrangement",
    verified: true,
  },
  {
    id: "lena-copper",
    title: "Impro cuivre",
    artist: "Lena V.",
    image: "/images/shorts/catalog/now-lena-cello.webp",
    alt: "Lena improvise au violoncelle sous une lumière cuivrée",
    duration: "3:16",
    meta: "Cordes · Improvisation",
    role: "Violoncelliste",
    city: "Strasbourg",
    views: "16 k vues",
    availability: "Ouverte aux sessions studio",
  },
  {
    id: "anouk-indigo",
    title: "Indigo",
    artist: "Anouk",
    image: "/images/shorts/catalog/performance-anouk-guitar.webp",
    alt: "Anouk joue de la guitare sur une scène indigo",
    duration: "2:50",
    meta: "Rock alternatif · Live",
    role: "Guitariste",
    city: "Lille",
    views: "12 k vues",
    availability: "Recherche un groupe",
  },
  {
    id: "nael-minuit",
    title: "Minuit aux touches",
    artist: "Naël",
    image: "/images/shorts/catalog/studio-nael-piano.webp",
    alt: "Naël improvise au piano dans un studio boisé",
    duration: "4:08",
    meta: "Piano jazz · Session",
    role: "Pianiste · Compositeur",
    city: "Nancy",
    views: "18 k vues",
    availability: "Disponible pour studio",
  },
];

const _NEW_PORTFOLIOS: LegacyVideoItem[] = [
  {
    id: "yael-winter-vocal",
    title: "Première démo publique",
    artist: "Yaël",
    image: "/images/shorts/community/community-winter-vocal.webp",
    alt: "Un chanteur enregistre sa première démo près d’une fenêtre",
    duration: "1:37",
    meta: "Indie · Démo",
    role: "Chanteur · Auteur",
    city: "Grenoble",
    views: "3,2 k vues",
    availability: "Recherche un producteur",
  },
  {
    id: "kemi-afro-portrait",
    title: "Mon univers en 60 secondes",
    artist: "Kemi A.",
    image: "/images/shorts/community/community-afro-portrait.webp",
    alt: "Un jeune artiste présente son univers face caméra",
    duration: "1:00",
    meta: "Afro pop · Présentation",
    role: "Chanteur · Danseur",
    city: "Tours",
    views: "5,9 k vues",
    availability: "Ouvert aux collaborations",
  },
  {
    id: "ilyes-songwriter",
    title: "Le couplet avant la prod",
    artist: "Ilyes T.",
    image: "/images/shorts/community/community-songwriter-night.webp",
    alt: "Un auteur travaille un texte dans un studio sombre",
    duration: "1:19",
    meta: "Écriture · Démo",
    role: "Auteur · Parolier",
    city: "Metz",
    views: "4,7 k vues",
    availability: "Recherche compositeur",
  },
  {
    id: "arno-experimental",
    title: "La voix comme matière",
    artist: "Arno X.",
    image: "/images/shorts/community/community-experimental-vocal.webp",
    alt: "Un interprète expérimental chante devant un micro",
    duration: "1:42",
    meta: "Expérimental · Voix",
    role: "Interprète · Sound designer",
    city: "Bruxelles",
    views: "6,8 k vues",
    availability: "Ouvert aux projets audiovisuels",
  },
];

const SCENE_FILTER_OPTIONS = { defaultSort: "relevance" as const };
const SCENE_FIXTURE_NOW = Date.parse("2026-08-07T12:00:00+02:00");
const SCENE_EXPLORE_BATCH_SIZE = 24;
const SCENE_DAY_MS = 24 * 60 * 60 * 1_000;
const SCENE_DEFAULT_PLAYLIST_TITLE = "Ma playlist";

const SCENE_EXPLORE_QUICK_CONTENT_TYPES: readonly SceneContentType[] = [
  "room-replay",
  "meewav-original",
];

type SceneFollowingFilter = "all" | "unseen" | "today" | "week";
type SceneExploreView = "grid" | "compact";
type SceneExploreMediaMode = "landscape" | "vertical";
type SceneVerticalQuickFilter =
  | "all"
  | "performance"
  | "studio"
  | "freestyle"
  | "dance"
  | "voice"
  | "dj"
  | "instrument"
  | "backstage"
  | "collaboration";
type SceneVerticalDurationFilter = "all" | "under-15" | "15-30" | "30-60" | "over-60";

const SCENE_VERTICAL_QUICK_FILTERS: readonly { id: SceneVerticalQuickFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "performance", label: "Performance" },
  { id: "studio", label: "Studio" },
  { id: "freestyle", label: "Freestyle" },
  { id: "dance", label: "Danse" },
  { id: "voice", label: "Voix" },
  { id: "dj", label: "DJ" },
  { id: "instrument", label: "Instrument" },
  { id: "backstage", label: "Coulisses" },
  { id: "collaboration", label: "Collaboration" },
];

const SCENE_VERTICAL_DURATION_FILTERS: readonly { id: SceneVerticalDurationFilter; label: string }[] = [
  { id: "all", label: "Toutes les durées" },
  { id: "under-15", label: "Moins de 15 s" },
  { id: "15-30", label: "15–30 s" },
  { id: "30-60", label: "30–60 s" },
  { id: "over-60", label: "Plus de 60 s" },
];

function verticalQuickFilterFromSearch(params: URLSearchParams): SceneVerticalQuickFilter {
  const value = params.get("verticalType");
  return SCENE_VERTICAL_QUICK_FILTERS.some(({ id }) => id === value)
    ? value as SceneVerticalQuickFilter
    : "all";
}

function verticalDurationFilterFromSearch(params: URLSearchParams): SceneVerticalDurationFilter {
  const value = params.get("verticalDuration");
  return SCENE_VERTICAL_DURATION_FILTERS.some(({ id }) => id === value)
    ? value as SceneVerticalDurationFilter
    : "all";
}

const SCENE_FOLLOWING_FILTERS: readonly { id: SceneFollowingFilter; label: string }[] = [
  { id: "all", label: "Tout" },
  { id: "unseen", label: "Non vues" },
  { id: "today", label: "Aujourd’hui" },
  { id: "week", label: "Cette semaine" },
];

function filtersFromSearchParams(params: URLSearchParams): SceneFilterState {
  return parseSceneFilterSearch(params, SCENE_FILTER_OPTIONS);
}

const ALL_VIDEOS = ALL_SHORTS_VIDEOS;

const TAB_WALLS: Record<SceneTabId, ShortsWallId | null> = {
  home: null,
  following: null,
  tv: null,
  explore: null,
};

const WALL_TABS: Partial<Record<ShortsWallId, SceneTabId>> = {
  tv: "tv",
  replays: "explore",
  showreels: "explore",
  collaborations: "explore",
  vertical: "explore",
};

function sceneTabFromParams(params: URLSearchParams, pathname = SCENE_ROUTE): SceneTabId {
  const routeTab = getSceneTabFromPathname(pathname);
  if (routeTab && routeTab !== "home") return routeTab;
  const view = params.get("view");
  if (view === "following" || view === "tv" || view === "explore") return view;
  if (view === "talents" || view === "showreels" || view === "replays") return "explore";
  return "home";
}

const INITIAL_NOTIFICATIONS: ShortsNotification[] = [
  {
    id: "notification-trending",
    title: "Nouveau coup de cœur",
    detail: "NAYA K. entre dans la sélection des dernières 24 h.",
    videoId: "trending-01",
    read: false,
  },
  {
    id: "notification-collaboration",
    title: "Projet compatible",
    detail: "Un producteur recherche actuellement une voix.",
    videoId: "collaborations-01",
    read: false,
  },
  {
    id: "notification-replay",
    title: "Replay disponible",
    detail: "L’artiste a publié le replay de la Room « Cordes sans frontières ».",
    videoId: "replays-01",
    read: false,
  },
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr");
}

function readSavedSelection() {
  return new Set(
    scenePlaylistRepository.get(SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds ?? [],
  );
}


function sceneArtistHref(item: VideoItem) {
  const reference = resolveSceneCanonicalProfileId(item) ?? safeProfileArtistReference(item.profileId) ?? safeProfileArtistReference(item.mockArtistId) ?? safeProfileArtistReference(item.artistId);
  if (!reference) return undefined;
  const params = resolveSceneCanonicalProfileId(item) ? "" : `?${new URLSearchParams({ name: item.artist, role: item.role, city: item.city, portrait: item.artistPortrait ?? item.image, grade: String(item.gradeLevel) })}`;
  return `/profile/view/${encodeURIComponent(reference)}${params}`;
}

function getOrCreateDefaultScenePlaylist() {
  const existing = scenePlaylistRepository.read().find((playlist) => (
    playlist.kind === "custom" && playlist.title === SCENE_DEFAULT_PLAYLIST_TITLE
  ));
  return existing ?? scenePlaylistRepository.create(SCENE_DEFAULT_PLAYLIST_TITLE);
}

async function copyToClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy-failed");
}

function scenePublishedLabel(item: VideoItem) {
  const checksum = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
  const dayOffset = (checksum % 18) + 1;
  if (dayOffset === 1) return "aujourd’hui";
  if (dayOffset < 7) return `il y a ${dayOffset} jours`;
  if (dayOffset < 14) return "il y a 1 semaine";
  return "il y a 2 semaines";
}

function appendScenePreference(storageKey: string, value: string) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    const values = new Set<string>(
      Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [],
    );
    values.add(value);
    window.localStorage.setItem(storageKey, JSON.stringify([...values]));
  } catch {
    // The preference remains acknowledged for the current interaction when storage is unavailable.
  }
}

function scenePublishedLabelFromTimestamp(publishedAt: number, now: number) {
  const dayOffset = Math.max(0, Math.floor((now - publishedAt) / SCENE_DAY_MS));
  if (dayOffset === 0) return "aujourd’hui";
  if (dayOffset === 1) return "hier";
  if (dayOffset < 7) return `il y a ${dayOffset} jours`;
  if (dayOffset < 14) return "il y a 1 semaine";
  return `il y a ${Math.floor(dayOffset / 7)} semaines`;
}

function sceneContentLabel(item: VideoItem) {
  const contentType = sceneVideoFromShortsItem(item).contentType;
  return SCENE_CONTENT_TYPE_OPTIONS.find(({ id }) => id === contentType)?.label
    ?? "Création musicale";
}

function matchesVerticalQuickFilter(item: VideoItem, filter: SceneVerticalQuickFilter) {
  if (filter === "all") return true;
  const content = normalizeText(item.contentTypeLabel ?? sceneContentLabel(item));
  const identity = normalizeText(`${item.role} ${item.meta} ${item.title}`);
  if (filter === "performance") return content.includes("performance") || content.includes("session");
  if (filter === "studio") return content.includes("studio") || identity.includes("studio");
  if (filter === "freestyle") return content.includes("freestyle") || identity.includes("rappeur");
  if (filter === "dance") return content.includes("danse") || identity.includes("danse");
  if (filter === "voice") {
    return ["chant", "voix", "vocal", "topliner", "interprete"].some((term) => identity.includes(term));
  }
  if (filter === "dj") return content.includes("dj") || identity.includes("dj");
  if (filter === "instrument") {
    return [
      "instrument",
      "piano",
      "guitare",
      "violon",
      "basse",
      "batter",
      "sax",
      "percussion",
    ].some((term) => identity.includes(term));
  }
  if (filter === "backstage") return content.includes("coulisse") || identity.includes("coulisse");
  return content.includes("collaboration") || Boolean(item.collabAvailable);
}

function sceneDurationSeconds(duration: string) {
  const parts = duration.split(":").map((part) => Number.parseInt(part, 10));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function matchesVerticalDuration(item: VideoItem, filter: SceneVerticalDurationFilter) {
  if (filter === "all") return true;
  const seconds = sceneDurationSeconds(item.duration);
  if (filter === "under-15") return seconds < 15;
  if (filter === "15-30") return seconds >= 15 && seconds < 30;
  if (filter === "30-60") return seconds >= 30 && seconds <= 60;
  return seconds > 60;
}

function toggleSceneFilterValue<T extends string | number>(values: readonly T[], value: T) {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

function SectionHeading({
  eyebrow,
  title,
  description,
  headingId,
  actionLabel = "Voir tout",
  onSeeAll,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  headingId?: string;
  actionLabel?: string;
  onSeeAll: () => void;
}) {
  const resolvedActionLabel = actionLabel ?? "Tout voir";
  const isBackAction = resolvedActionLabel.toLocaleLowerCase("fr").startsWith("retour");
  return (
    <header className="shorts-section-heading">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2 id={headingId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <button type="button" className={isBackAction ? "is-back" : undefined} onClick={onSeeAll}>
        {isBackAction ? <ChevronLeft /> : null}
        {resolvedActionLabel}
        {isBackAction ? null : <ChevronRight />}
      </button>
    </header>
  );
}

type ShortsCardActions = {
  isLiked: (item: VideoItem) => boolean;
  hasGoldenLike: (item: VideoItem) => boolean;
  goldenUnavailableFor: (item: VideoItem) => boolean;
  likeCountFor: (item: VideoItem) => number;
  goldenLikeCountFor: (item: VideoItem) => number;
  onToggleLike: (item: VideoItem) => void;
  onRequestGoldenLike: (item: VideoItem) => void;
  onContact: (item: VideoItem) => void;
  onCollaborate: (item: VideoItem) => void;
  onAddToPlaylist: (item: VideoItem) => void;
  onExplainRecommendation: (item: VideoItem) => void;
  onOpenRecommendationSettings: (item: VideoItem) => void;
  onNotInterested: (item: VideoItem) => void;
  onMuteArtist: (item: VideoItem) => void;
  onReport: (item: VideoItem) => void;
};

function shortsMessagingIdentity(item: VideoItem) {
  const canonicalProfileId = resolveSceneCanonicalProfileId(item);
  if (canonicalProfileId) {
    return {
      mode: "real" as const,
      profileId: canonicalProfileId,
      mockArtistId: null,
    };
  }
  return {
    mode: "demo" as const,
    profileId: null,
    mockArtistId: item.mockArtistId || item.artistId,
    mockArtistName: item.artist,
    mockArtistRole: item.role,
    mockArtistAvatar: item.artistPortrait ?? item.image,
    mockArtistGradeLevel: item.gradeLevel,
  };
}

function shortsProfileViewerArtist(item: VideoItem) {
  const artist = getPreProfileArtistForSeed({
    profileId: item.profileId || item.mockArtistId || item.artistId,
    displayName: item.artist,
    mainRole: item.role,
    zoneName: item.city,
    gradeLevel: item.gradeLevel,
    tremplinRegistered: item.gradeLevel >= 2,
    publicStatsPublished: item.gradeLevel >= 2,
  });
  return {
    ...artist,
    portraitUrl: item.artistPortrait ?? item.image,
    gradeLevel: item.gradeLevel,
    grade_level: item.gradeLevel,
    gradeStars: item.gradeLevel,
    grade_stars: item.gradeLevel,
  };
}

function VideoCard({
  item,
  onSelect,
  isSaved,
  menuOpen,
  onToggleMenu,
  onToggleSaved,
  onShare,
  onViewProfile,
  progressPercent,
  publishedLabel,
  viewingState,
  instanceId,
  actions,
}: {
  item: VideoItem;
  onSelect: (item: VideoItem) => void;
  isSaved: boolean;
  menuOpen: boolean;
  onToggleMenu: (item: VideoItem) => void;
  onToggleSaved: (item: VideoItem) => void;
  onShare: (item: VideoItem) => void;
  onViewProfile: (item: VideoItem) => void;
  actions: ShortsCardActions;
  progressPercent?: number;
  publishedLabel?: string;
  viewingState?: "Non vue" | "À reprendre" | "Vue";
  instanceId?: string;
}) {
  const format = item.format ?? "landscape";
  const menuId = `shorts-card-menu-${instanceId ?? item.id}`;
  const optionsRef = useRef<HTMLButtonElement>(null);
  const previewTimerRef = useRef<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const contentLabel = sceneContentLabel(item);
  const showEditorialType = contentLabel === "Replay de Room" || contentLabel === "MeeWav Original";

  const stopPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewReady(false);
  };

  const schedulePreview = () => {
    if (item.presentationFormat === "audio_visualizer") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(hover: none), (pointer: coarse)").matches) return;
    if (previewTimerRef.current !== null || previewReady) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewReady(true);
    }, 720);
  };

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      onToggleMenu(item);
      window.requestAnimationFrame(() => optionsRef.current?.focus());
      return;
    }
    if (nextIndex !== null && items.length > 0) {
      event.preventDefault();
      items[nextIndex]?.focus();
    }
  };

  return (
    <article
      className={`shorts-landscape-card shorts-video-card scene-video-card is-${format}${menuOpen ? " has-open-menu" : ""}${isSaved ? " is-saved" : ""}`}
      data-format={format}
    >
      <div
        className="shorts-landscape-card__media scene-video-card__media"
        onPointerEnter={schedulePreview}
        onPointerLeave={stopPreview}
      >
        <a
          href={item.format === "portrait" || item.presentationFormat === "vertical" ? getSceneVerticalPath(item.id) : getSceneWatchPath(sceneVideoSlug(item))}
          className="scene-video-card__media-hit"
          aria-label={`Regarder ${item.title} de ${item.artist}`}
          onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(item); }}
        >
          {previewReady ? (
            <video
              src={item.audioUrl ?? item.video}
              poster={item.image}
              autoPlay
              loop
              muted
              playsInline
              preload="metadata"
              aria-hidden="true"
            />
          ) : (
            <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
          )}
        </a>
        {item.isAiArtist ? <span className="shorts-card-badge">Artiste IA</span> : null}
        {isSaved ? <span className="shorts-card-saved"><Bookmark fill="currentColor" /> Sélection</span> : null}
        {showEditorialType ? <span className="scene-video-card__type">{contentLabel}</span> : null}
        {!previewReady ? <span className="shorts-card-play"><Play fill="currentColor" /></span> : null}

        <small>{item.duration}</small>
        {typeof progressPercent === "number" ? (
          <span
            className="scene-video-card__watch-progress"
            aria-label={`Lecture reprise à ${progressPercent} %`}
          >
            <i style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
          </span>
        ) : null}
        {viewingState ? (
          <span className={`scene-video-card__viewing-state is-${viewingState === "Non vue" ? "new" : viewingState === "Vue" ? "seen" : "resume"}`}>
            {viewingState}
          </span>
        ) : null}
      </div>
      <div className="shorts-landscape-card__copy scene-video-card__body">
        <div className="scene-video-card__avatar-slot">
          <a
            href={sceneArtistHref(item)}
            className="scene-video-card__avatar"
            aria-label={`Voir le profil de ${item.artist}`}
            onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onViewProfile(item); }}
          >
            <img src={item.artistPortrait ?? item.image} alt="" loading="lazy" decoding="async" />
          </a>
        </div>
        <div className="scene-video-card__details">
          <h3>{item.title}</h3>
          <p className="shorts-video-card__identity">
            <a
              href={sceneArtistHref(item)}
              className="scene-video-card__artist-link"
              onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onViewProfile(item); }}
            >
              {item.artist}
            </a>
            <MeewavGradeBadge
              level={item.gradeLevel}
              size="xs"
              variant="icon"
              labelMode="none"
              className="shorts-video-card__grade"
              title={`Grade MeeWav de ${item.artist}`}
            />
          </p>
          <span className="shorts-video-card__meta">
            <i>{item.views}</i>
            <i>{publishedLabel ?? scenePublishedLabel(item)}</i>
          </span>
        </div>
        <button
          ref={optionsRef}
          type="button"
          className="shorts-card-options"
          aria-label={`Actions pour ${item.title}`}
          title="Plus d’options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => onToggleMenu(item)}
        >
          <MoreVertical />
        </button>
        <FloatingSceneCardMenu
          anchorRef={optionsRef}
          id={menuId}
          open={menuOpen}
          ariaLabel={`Actions pour ${item.title}`}
          onKeyDown={onMenuKeyDown}
          onRequestClose={() => onToggleMenu(item)}
        >
          <button type="button" role="menuitem" onClick={() => onToggleSaved(item)}>
            <Clock3 />
            {isSaved ? "Retirer des vidéos à regarder" : "À regarder plus tard"}
          </button>
          <button type="button" role="menuitem" onClick={() => actions.onAddToPlaylist(item)}>
            <ListPlus /> Ajouter à une playlist
          </button>
          <button type="button" role="menuitem" onClick={() => onShare(item)}>
            <Share2 /> Partager la vidéo
          </button>
          <button type="button" role="menuitem" onClick={() => onViewProfile(item)}>
            <UserRound /> Voir le profil
          </button>
          <span className="shorts-card-menu__separator" aria-hidden="true" />
          <button type="button" role="menuitem" onClick={() => actions.onExplainRecommendation(item)}>
            <CircleHelp /> Pourquoi cette vidéo ?
          </button>
          <button type="button" role="menuitem" onClick={() => actions.onOpenRecommendationSettings(item)}>
            <SlidersHorizontal /> Régler mes recommandations
          </button>
          <button type="button" role="menuitem" onClick={() => actions.onNotInterested(item)}>
            <EyeOff /> Pas intéressé
          </button>
          <button type="button" role="menuitem" onClick={() => actions.onMuteArtist(item)}>
            <UserMinus /> Ne plus recommander cet artiste
          </button>
          <button type="button" role="menuitem" onClick={() => actions.onReport(item)}>
            <Flag /> Signaler
          </button>
        </FloatingSceneCardMenu>
      </div>
    </article>
  );
}

function VideoShelf({
  id,
  eyebrow,
  title,
  description,
  items,
  onSelect,
  onSeeAll,
  actionLabel,
  tone,
  savedIds,
  openMenuId,
  onToggleMenu,
  onToggleSaved,
  onShare,
  onViewProfile,
  actions,
  progressById,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  items: VideoItem[];
  onSelect: (item: VideoItem) => void;
  onSeeAll: () => void;
  actionLabel?: string;
  tone?: "tv" | "collaboration" | "default" | "portrait";
  savedIds: Set<string>;
  openMenuId: string | null;
  onToggleMenu: (item: VideoItem) => void;
  onToggleSaved: (item: VideoItem) => void;
  onShare: (item: VideoItem) => void;
  onViewProfile: (item: VideoItem) => void;
  actions: ShortsCardActions;
  progressById?: ReadonlyMap<string, number>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const railItems = useMemo(() => items.slice(0, 10), [items]);
  const railItemKey = railItems.map((item) => item.id).join("|");
  const loopCloneCount = Math.min(3, railItems.length);
  const loopedItems = useMemo(() => [
    ...railItems.slice(-loopCloneCount).map((item, index) => ({
      item,
      itemIndex: railItems.length - loopCloneCount + index,
      loopCopy: "before" as const,
      renderKey: `before-${index}-${item.id}`,
    })),
    ...railItems.map((item, index) => ({
      item,
      itemIndex: index,
      loopCopy: "original" as const,
      renderKey: `original-${index}-${item.id}`,
    })),
    ...railItems.slice(0, loopCloneCount).map((item, index) => ({
      item,
      itemIndex: index,
      loopCopy: "after" as const,
      renderKey: `after-${index}-${item.id}`,
    })),
  ], [loopCloneCount, railItems]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(
      '[data-scene-loop-copy="original"][data-scene-item-index="0"]',
    );
    if (!viewport || !target) return;
    const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
    const previousBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = target.offsetLeft - viewportPadding;
    viewport.style.scrollBehavior = previousBehavior;
  }, [id, railItemKey]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const recenterLoop = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport || railItems.length <= 1) return;
      const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
      const usefulLeft = viewport.scrollLeft + viewportPadding;
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>("[data-scene-rail-card]"));
      const nearest = cards.reduce<HTMLElement | null>((closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.offsetLeft - usefulLeft) < Math.abs(closest.offsetLeft - usefulLeft)
          ? candidate
          : closest;
      }, null);
      if (!nearest || nearest.dataset.sceneLoopCopy === "original") return;
      const itemIndex = nearest.dataset.sceneItemIndex;
      const target = cards.find((card) => (
        card.dataset.sceneLoopCopy === "original" && card.dataset.sceneItemIndex === itemIndex
      ));
      if (!target) return;
      const previousBehavior = viewport.style.scrollBehavior;
      viewport.style.scrollBehavior = "auto";
      viewport.scrollLeft = target.offsetLeft - viewportPadding;
      viewport.style.scrollBehavior = previousBehavior;
    }, 96);
  };

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport || railItems.length <= 1) return;
    viewport.scrollBy({
      left: direction * Math.max(220, viewport.clientWidth * .86),
      behavior: "smooth",
    });
  };

  return (
    <section id={id} className={`shorts-shelf scene-loop-rail is-${tone ?? "default"}`} aria-label={title}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        actionLabel={actionLabel}
        onSeeAll={onSeeAll}
      />
      <div className="scene-loop-rail__viewport-shell meewav-rail-surface">
        <button
          type="button"
          className="scene-loop-rail__arrow is-previous meewav-rail-edge meewav-rail-edge--previous"
          aria-label={`Voir les vidéos précédentes dans ${title}`}
          aria-controls={`${id ?? "scene"}-viewport`}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <div
          ref={viewportRef}
          id={`${id ?? "scene"}-viewport`}
          className="shorts-shelf__grid scene-loop-rail__viewport"
          data-scene-looping="true"
          onScroll={recenterLoop}
        >
          <div className="scene-loop-rail__track">
            {loopedItems.map(({ item, itemIndex, loopCopy, renderKey }) => {
              const isLoopClone = loopCopy !== "original";
              const menuStateId = `${id ?? title}:${item.id}`;
              return (
                <div
                  key={renderKey}
                  data-scene-rail-card
                  data-scene-item-index={itemIndex}
                  data-scene-loop-copy={loopCopy}
                  data-scene-loop-clone={isLoopClone ? loopCopy : undefined}
                  aria-hidden={isLoopClone || undefined}
                  inert={isLoopClone || undefined}
                >
                  <VideoCard
                    item={item}
                    instanceId={renderKey}
                    onSelect={onSelect}
                    isSaved={savedIds.has(item.id)}
                    menuOpen={!isLoopClone && openMenuId === menuStateId}
                    onToggleMenu={() => onToggleMenu({ ...item, id: menuStateId })}
                    onToggleSaved={onToggleSaved}
                    onShare={onShare}
                    onViewProfile={onViewProfile}
                    actions={actions}
                    progressPercent={progressById?.get(item.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="scene-loop-rail__arrow is-next meewav-rail-edge meewav-rail-edge--next"
          aria-label={`Voir les vidéos suivantes dans ${title}`}
          aria-controls={`${id ?? "scene"}-viewport`}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function VerticalMediaRail({
  id,
  eyebrow,
  title,
  description,
  items,
  onSelect,
  onSeeAll,
  savedIds,
  openMenuId,
  onToggleMenu,
  onToggleSaved,
  onShare,
  onViewProfile,
  actions,
  progressById,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
  items: VideoItem[];
  onSelect: (item: VideoItem) => void;
  onSeeAll: () => void;
  savedIds: Set<string>;
  openMenuId: string | null;
  onToggleMenu: (item: VideoItem) => void;
  onToggleSaved: (item: VideoItem) => void;
  onShare: (item: VideoItem) => void;
  onViewProfile: (item: VideoItem) => void;
  actions: ShortsCardActions;
  progressById?: ReadonlyMap<string, number>;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const railItems = useMemo(() => items.slice(0, 10), [items]);
  const cloneCount = Math.min(3, railItems.length);
  const loopedItems = useMemo(() => [
    ...railItems.slice(-cloneCount).map((item, index) => ({
      item,
      itemIndex: railItems.length - cloneCount + index,
      copy: "before" as const,
      key: `vertical-before-${index}-${item.id}`,
    })),
    ...railItems.map((item, index) => ({
      item,
      itemIndex: index,
      copy: "original" as const,
      key: `vertical-original-${index}-${item.id}`,
    })),
    ...railItems.slice(0, cloneCount).map((item, index) => ({
      item,
      itemIndex: index,
      copy: "after" as const,
      key: `vertical-after-${index}-${item.id}`,
    })),
  ], [cloneCount, railItems]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const first = viewport?.querySelector<HTMLElement>(
      '[data-scene-vertical-copy="original"][data-scene-vertical-index="0"]',
    );
    if (!viewport || !first) return;
    viewport.scrollLeft = first.offsetLeft;
  }, [railItems]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const recenter = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport || railItems.length < 2) return;
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>("[data-scene-vertical-card]"));
      const nearest = cards.reduce<HTMLElement | null>((closest, card) => {
        if (!closest) return card;
        return Math.abs(card.offsetLeft - viewport.scrollLeft) < Math.abs(closest.offsetLeft - viewport.scrollLeft)
          ? card
          : closest;
      }, null);
      if (!nearest || nearest.dataset.sceneVerticalCopy === "original") return;
      const target = cards.find((card) => (
        card.dataset.sceneVerticalCopy === "original"
        && card.dataset.sceneVerticalIndex === nearest.dataset.sceneVerticalIndex
      ));
      if (!target) return;
      const behavior = viewport.style.scrollBehavior;
      viewport.style.scrollBehavior = "auto";
      viewport.scrollLeft = target.offsetLeft;
      viewport.style.scrollBehavior = behavior;
    }, 100);
  };

  const scrollByPage = (direction: -1 | 1) => {
    viewportRef.current?.scrollBy({
      left: direction * Math.max(420, (viewportRef.current?.clientWidth ?? 0) * .82),
      behavior: "smooth",
    });
  };

  return (
    <section id={id} className="scene-vertical-rail" aria-labelledby={`${id}-title`}>
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        headingId={`${id}-title`}
        onSeeAll={onSeeAll}
      />
      <div className="scene-vertical-rail__shell meewav-rail-surface">
        <button
          type="button"
          className="scene-vertical-rail__arrow is-previous meewav-rail-edge meewav-rail-edge--previous"
          aria-label="Voir les Shorts précédents"
          aria-controls={`${id}-viewport`}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeft />
        </button>
        <div
          ref={viewportRef}
          id={`${id}-viewport`}
          className="scene-vertical-rail__viewport"
          onScroll={recenter}
        >
          <div className="scene-vertical-rail__track">
            {loopedItems.map(({ item, itemIndex, copy, key }) => {
              const clone = copy !== "original";
              const menuStateId = `${id}:${item.id}`;
              return (
                <div
                  key={key}
                  data-scene-vertical-card
                  data-scene-vertical-index={itemIndex}
                  data-scene-vertical-copy={copy}
                  aria-hidden={clone || undefined}
                  inert={clone || undefined}
                >
                  <VerticalMediaCard
                    item={item}
                    instanceId={key}
                    isSaved={savedIds.has(item.id)}
                    menuOpen={!clone && openMenuId === menuStateId}
                    publishedLabel={scenePublishedLabel(item)}
                    progressPercent={progressById?.get(item.id)}
                    onSelect={onSelect}
                    onToggleMenu={() => onToggleMenu({ ...item, id: menuStateId })}
                    onToggleSaved={onToggleSaved}
                    onShare={onShare}
                    onViewProfile={onViewProfile}
                    actions={actions}
                  />
                </div>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="scene-vertical-rail__arrow is-next meewav-rail-edge meewav-rail-edge--next"
          aria-label="Voir les Shorts suivants"
          aria-controls={`${id}-viewport`}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRight />
        </button>
      </div>
    </section>
  );
}

function FeaturedRailCard({
  item,
  onSelect,
  eager = false,
}: {
  item: VideoItem;
  onSelect: (item: VideoItem) => void;
  eager?: boolean;
}) {
  const previewTimerRef = useRef<number | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  const stopPreview = () => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewReady(false);
  };

  const schedulePreview = () => {
    if (item.presentationFormat === "audio_visualizer") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(hover: none), (pointer: coarse)").matches) return;
    if (previewTimerRef.current !== null || previewReady) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewReady(true);
    }, 720);
  };

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

  return (
    <a
      href={getSceneWatchPath(sceneVideoSlug(item))}
      className="scene-featured-card"
      aria-label={`Regarder ${item.title} de ${item.artist}`}
      onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onSelect(item); }}
      onPointerEnter={schedulePreview}
      onPointerLeave={stopPreview}
      onFocus={schedulePreview}
      onBlur={stopPreview}
    >
      {previewReady ? (
        <video
          src={item.video}
          poster={item.image}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          aria-hidden="true"
          onError={stopPreview}
        />
      ) : (
        <img
          src={item.image}
          alt={item.alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "auto"}
          decoding="async"
        />
      )}
      <span className="scene-featured-card__shade" aria-hidden="true" />
      <span className="scene-featured-card__label">
        {item.contentTypeLabel ?? item.badge ?? "Sélection MeeWav"}
      </span>
      {item.isAiArtist ? (
        <span className="scene-featured-card__label scene-featured-card__ai-label">Artiste IA</span>
      ) : null}
      {!previewReady ? (
        <span className="scene-featured-card__play" aria-hidden="true">
          <Play fill="currentColor" />
        </span>
      ) : null}
      <span className="scene-featured-card__copy">
        <strong>{item.title}</strong>
        <span className="scene-featured-card__identity">
          <span>{item.artist}</span>
          <MeewavGradeBadge
            level={item.gradeLevel}
            size="xs"
            variant="icon"
            labelMode="none"
            title={`Grade MeeWav de ${item.artist}`}
          />
        </span>
        <small>{item.role}</small>
        <em>{item.views} · {item.duration}</em>
      </span>
    </a>
  );
}

function FeaturedRail({
  wall,
  onSelect,
  onSeeAll,
}: {
  wall: ShortsWallDefinition;
  onSelect: (item: VideoItem) => void;
  onSeeAll: () => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const railItems = useMemo(() => wall.items.slice(0, 10), [wall.items]);
  const railItemKey = railItems.map((item) => item.id).join("|");
  const loopCloneCount = Math.min(3, railItems.length);
  const loopedItems = useMemo(() => [
    ...railItems.slice(-loopCloneCount).map((item, index) => ({
      item,
      itemIndex: railItems.length - loopCloneCount + index,
      loopCopy: "before" as const,
      renderKey: `featured-before-${index}-${item.id}`,
    })),
    ...railItems.map((item, index) => ({
      item,
      itemIndex: index,
      loopCopy: "original" as const,
      renderKey: `featured-original-${index}-${item.id}`,
    })),
    ...railItems.slice(0, loopCloneCount).map((item, index) => ({
      item,
      itemIndex: index,
      loopCopy: "after" as const,
      renderKey: `featured-after-${index}-${item.id}`,
    })),
  ], [loopCloneCount, railItems]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const target = viewport?.querySelector<HTMLElement>(
      '[data-scene-loop-copy="original"][data-scene-item-index="0"]',
    );
    if (!viewport || !target) return;
    const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
    const previousBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = target.offsetLeft - viewportPadding;
    viewport.style.scrollBehavior = previousBehavior;
  }, [railItemKey]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const recenterLoop = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      const viewport = viewportRef.current;
      if (!viewport || railItems.length <= 1) return;
      const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
      const usefulLeft = viewport.scrollLeft + viewportPadding;
      const cards = Array.from(viewport.querySelectorAll<HTMLElement>("[data-scene-featured-card]"));
      const nearest = cards.reduce<HTMLElement | null>((closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.offsetLeft - usefulLeft) < Math.abs(closest.offsetLeft - usefulLeft)
          ? candidate
          : closest;
      }, null);
      if (!nearest || nearest.dataset.sceneLoopCopy === "original") return;
      const itemIndex = nearest.dataset.sceneItemIndex;
      const target = cards.find((card) => (
        card.dataset.sceneLoopCopy === "original" && card.dataset.sceneItemIndex === itemIndex
      ));
      if (!target) return;
      const previousBehavior = viewport.style.scrollBehavior;
      viewport.style.scrollBehavior = "auto";
      viewport.scrollLeft = target.offsetLeft - viewportPadding;
      viewport.style.scrollBehavior = previousBehavior;
    }, 96);
  };

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport || railItems.length <= 1) return;
    viewport.scrollBy({
      left: direction * Math.max(360, viewport.clientWidth * .82),
      behavior: "smooth",
    });
  };

  if (railItems.length === 0) return null;

  return (
    <section
      className="scene-featured-hero"
      aria-labelledby="scene-hero-title"
    >
      <header className="scene-featured-hero__identity">
        <div>
          <span>{SCENE_NAME.toLocaleUpperCase("fr")}</span>
          <h1 id="scene-hero-title">
            {SCENE_SIGNATURE.slice(0, -SCENE_SIGNATURE_ACCENT.length)}
            <span>{SCENE_SIGNATURE_ACCENT}</span>
          </h1>
          <p>{SCENE_SUBSIGNATURE}</p>
        </div>
      </header>

      <section className="scene-featured-rail" aria-label="À la une">
        <SectionHeading
          eyebrow="Sélection éditoriale"
          title="À la une"
          description="Créations, performances et formats choisis par la rédaction MeeWav."
          actionLabel="Voir tout"
          onSeeAll={onSeeAll}
        />
        <div className="scene-featured-rail__viewport-shell meewav-rail-surface">
          <button
            type="button"
            className="scene-featured-rail__arrow is-previous meewav-rail-edge meewav-rail-edge--previous"
            aria-label="Voir les sélections précédentes"
            aria-controls="scene-featured-viewport"
            onClick={() => scrollByPage(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <div
            ref={viewportRef}
            id="scene-featured-viewport"
            className="scene-featured-rail__viewport"
            data-scene-looping="true"
            onScroll={recenterLoop}
          >
            <div className="scene-featured-rail__track">
              {loopedItems.map(({ item, itemIndex, loopCopy, renderKey }) => {
                const isLoopClone = loopCopy !== "original";
                return (
                  <div
                    key={renderKey}
                    data-scene-featured-card
                    data-scene-item-index={itemIndex}
                    data-scene-loop-copy={loopCopy}
                    data-scene-loop-clone={isLoopClone ? loopCopy : undefined}
                    aria-hidden={isLoopClone || undefined}
                    inert={isLoopClone || undefined}
                  >
                    <FeaturedRailCard
                      item={item}
                      onSelect={onSelect}
                      eager={!isLoopClone && itemIndex < 2}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <button
            type="button"
            className="scene-featured-rail__arrow is-next meewav-rail-edge meewav-rail-edge--next"
            aria-label="Voir les sélections suivantes"
            aria-controls="scene-featured-viewport"
            onClick={() => scrollByPage(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </section>
    </section>
  );
}

function ShortsWall({
  wall,
  onBack,
  onSelect,
  savedIds,
  openMenuId,
  onToggleMenu,
  onToggleSaved,
  onShare,
  onViewProfile,
  actions,
}: {
  wall: ShortsWallDefinition;
  onBack: () => void;
  onSelect: (item: VideoItem) => void;
  savedIds: Set<string>;
  openMenuId: string | null;
  onToggleMenu: (item: VideoItem) => void;
  onToggleSaved: (item: VideoItem) => void;
  onShare: (item: VideoItem) => void;
  onViewProfile: (item: VideoItem) => void;
  actions: ShortsCardActions;
}) {
  return (
    <section className={`shorts-wall is-${wall.tone}`} aria-label={`Mur ${wall.title}`}>
      <header className="shorts-wall__header">
        <button type="button" onClick={onBack}><ChevronLeft /> Fermer le mur</button>
        <div>
          <span>{wall.eyebrow}</span>
          <h1>{wall.title}</h1>
          <p>{wall.wallDescription}</p>
        </div>
        <strong><b>{wall.items.length}</b> vidéos</strong>
      </header>
      <div className="shorts-wall__rule">
        <span>Catalogue vidéo</span>
        <small>Lecture à la demande</small>
      </div>
      <div className="shorts-wall__grid">
        {wall.items.map((item) => (
          <VideoCard
            key={item.id}
            item={item}
            onSelect={onSelect}
            isSaved={savedIds.has(item.id)}
            menuOpen={openMenuId === item.id}
            onToggleMenu={onToggleMenu}
            onToggleSaved={onToggleSaved}
            onShare={onShare}
            onViewProfile={onViewProfile}
            actions={actions}
          />
        ))}
      </div>
    </section>
  );
}

export default function ShortsPage() {
  const { user, status } = useAuth();
  const identity = user?.id ?? (isLocalAuthPreviewEnabled() ? "local-demo" : "anonymous");
  const [ready, setReady] = useState("");
  useEffect(() => {
    if (status === "loading") return;
    // Old child and media cleanup finish before switching the repository namespace.
    setScenePrivateScope(identity); setReady(identity);
  }, [identity, status]);
  if (status === "loading" || ready !== identity || getScenePrivateScope() !== identity) return <AppRouteLoading />;
  return <SceneWorkspace key={identity} />;
}
function SceneWorkspace() {
  const navigate = useNavigate();
  const location = useLocation();
  const demoScene = isLocalAuthPreviewEnabled();
  const sceneNow = useMemo(() => demoScene ? SCENE_FIXTURE_NOW : Date.now(), [demoScene]);
  const isCreatorStudioRoute = location.pathname === SCENE_STUDIO_ROUTE
    || location.pathname.startsWith(`${SCENE_STUDIO_ROUTE}/`);
  const isHistoryRoute = location.pathname === SCENE_HISTORY_ROUTE;
  const selectedPlaylistRouteId = getScenePlaylistId(location.pathname);
  const isPlaylistsRoute = location.pathname === SCENE_PLAYLISTS_ROUTE
    || selectedPlaylistRouteId !== null;
  const isRecommendationSettingsRoute = location.pathname === SCENE_RECOMMENDATION_SETTINGS_ROUTE;
  const isUploadRoute = location.pathname === SCENE_UPLOAD_ROUTE;
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canPublish = canDisplayScenePublishing({
    userMetadata: user?.user_metadata,
    localArtistPreview: !user && isLocalAuthPreviewEnabled(),
  });
  const [followPending, setFollowPending] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [catalogError, setCatalogError] = useState("");
  const [, setRecommendationRevision] = useState(0);
  const watchRoute = Boolean(getSceneWatchSlug(location.pathname) || new URLSearchParams(location.search).get("video"));
  const verticalRoute = Boolean(getSceneVerticalVideoId(location.pathname));
  const playbackQueue = useScenePlaybackQueue();
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null);
  const [remoteSceneItems, setRemoteSceneItems] = useState<VideoItem[]>([]);
  const [remoteSearch, setRemoteSearch] = useState<{
    query: string; items: VideoItem[]; offset: number; hasMore: boolean; loading: boolean; error: string;
  }>({ query: "", items: [], offset: 0, hasMore: false, loading: false, error: "" });
  const [catalogOffset, setCatalogOffset] = useState(0);
  const [catalogHasMore, setCatalogHasMore] = useState(false);
  const [catalogLoadingMore, setCatalogLoadingMore] = useState(false);
  const catalogRequestVersionRef = useRef(0);
  const [serverFollowedArtistIds, setServerFollowedArtistIds] = useState<Set<string> | null>(null);
  const [browseMenuOpen, setBrowseMenuOpen] = useState(() => typeof window === "undefined" || window.innerWidth > 1100);
  const [watchMenuKey, setWatchMenuKey] = useState<string | null>(null);
  const watchMenuOpen = watchMenuKey === location.key;
  const watchMenuButtonRef = useRef<HTMLButtonElement>(null);
  const closeWatchMenu = () => { setWatchMenuKey(null); watchMenuButtonRef.current?.focus({ preventScroll: true }); };
  useEffect(() => { setWatchMenuKey(null); }, [location.key]);
  useEffect(() => {
    const compactViewport = window.matchMedia("(max-width: 1100px)");
    const collapse = () => { if (compactViewport.matches) setBrowseMenuOpen(false); };
    compactViewport.addEventListener("change", collapse);
    return () => compactViewport.removeEventListener("change", collapse);
  }, []);
  const engagementItems = useMemo(() => [...remoteSearch.items, ...remoteSceneItems, ...(demoScene ? ALL_VIDEOS : [])], [remoteSearch.items, remoteSceneItems, demoScene]);
  useEffect(() => {
    if ((isCreatorStudioRoute || isUploadRoute) && !canPublish) navigate(SCENE_ROUTE, { replace: true });
  }, [canPublish, isCreatorStudioRoute, isUploadRoute, navigate]);
  useEffect(() => {
    if ((!SCENE_TV_LAUNCH_READY || !demoScene) && getSceneTabFromPathname(location.pathname) === "tv") {
      navigate(SCENE_ROUTE, { replace: true });
    }
  }, [location.pathname, navigate, demoScene]);
  const {
    pendingGoldenLike,
    isLiked,
    hasGoldenLike,
    goldenUnavailableFor,
    likeCountFor,
    goldenLikeCountFor,
    toggleLike,
    requestGoldenLike,
    confirmGoldenLike,
    cancelGoldenLike,
    goldenLikeSubmitting,
  } = useShortsEngagement(engagementItems);
  const routeWall = searchParams.get("feed");
  const initialWall = routeWall && Object.prototype.hasOwnProperty.call(SHORTS_WALLS, routeWall)
    ? routeWall as ShortsWallId
    : null;
  const initialActiveWall = initialWall === "vertical" ? null : initialWall;
  const [activeTab, setActiveTab] = useState<SceneTabId>(
    initialWall
      ? WALL_TABS[initialWall] ?? "home"
      : sceneTabFromParams(searchParams, location.pathname),
  );
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [activeWall, setActiveWall] = useState<ShortsWallId | null>(initialActiveWall);
  const [publishedItems, setPublishedItems] = useState<VideoItem[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoItem | null>(() => {
    const videoId = searchParams.get("video");
    return demoScene && videoId ? ALL_VIDEOS.find((item) => item.id === videoId) ?? null : null;
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<SceneFilterState>(
    () => filtersFromSearchParams(searchParams),
  );
  const [draftFilters, setDraftFilters] = useState<SceneFilterState>(
    () => filtersFromSearchParams(searchParams),
  );
  const [exploreVisibleCount, setExploreVisibleCount] = useSceneListWindow(`${location.pathname}${location.search}`, SCENE_EXPLORE_BATCH_SIZE);
  const [exploreView, setExploreView] = useState<SceneExploreView>("grid");
  const [exploreMediaMode, setExploreMediaMode] = useState<SceneExploreMediaMode>(() => (
    searchParams.get("media") === "vertical" || initialWall === "vertical" ? "vertical" : "landscape"
  ));
  const [verticalQuickFilter, setVerticalQuickFilter] = useState<SceneVerticalQuickFilter>(
    () => verticalQuickFilterFromSearch(searchParams),
  );
  const [verticalDurationFilter, setVerticalDurationFilter] = useState<SceneVerticalDurationFilter>(
    () => verticalDurationFilterFromSearch(searchParams),
  );
  const [draftVerticalDurationFilter, setDraftVerticalDurationFilter] = useState<SceneVerticalDurationFilter>(
    () => verticalDurationFilterFromSearch(searchParams),
  );
  const [verticalFollowedOnly, setVerticalFollowedOnly] = useState(() => searchParams.get("followed") === "1");
  const [draftVerticalFollowedOnly, setDraftVerticalFollowedOnly] = useState(() => searchParams.get("followed") === "1");
  const [followingFilter, setFollowingFilter] = useState<SceneFollowingFilter>("all");
  const [toast, setToast] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(readSavedSelection);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<ShortsNotification[]>(demoScene ? INITIAL_NOTIFICATIONS : []);
  const [showSavedOnly, setShowSavedOnly] = useState(isPlaylistsRoute);
  const [showHistoryOnly, setShowHistoryOnly] = useState(isHistoryRoute);
  const [watchHistory, setWatchHistory] = useState<SceneWatchHistoryEntry[]>(
    () => sceneWatchHistoryRepository.read(),
  );
  const [collaborationItem, setCollaborationItem] = useState<VideoItem | null>(null);
  const savedIdsRef = useRef(savedIds);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const exploreLoadMoreRef = useRef<HTMLDivElement>(null);
  const notificationPanelRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<number | null>(null);
  const pageScrollIdleTimerRef = useRef<number | null>(null);
  const publishedObjectUrlsRef = useRef<Set<string>>(new Set());
  const [goldenLikeError, setGoldenLikeError] = useState("");
  const [goldenBurstVideoId, setGoldenBurstVideoId] = useState<string | null>(null);
  useEffect(() => {
    if (!goldenBurstVideoId) return;
    const timer = window.setTimeout(() => setGoldenBurstVideoId(null), 1500);
    return () => window.clearTimeout(timer);
  }, [goldenBurstVideoId]);

  const allVideos = useMemo(
    () => [...publishedItems, ...(remoteSearch.query === searchQuery.trim() ? remoteSearch.items : []), ...remoteSceneItems, ...(demoScene ? ALL_VIDEOS : [])],
    [publishedItems, remoteSearch, remoteSceneItems, demoScene, searchQuery],
  );

  useEffect(() => {
    const query = searchQuery.trim();
    if (demoScene || query.length < 2) {
      setRemoteSearch({ query: "", items: [], offset: 0, hasMore: false, loading: false, error: "" });
      return;
    }
    let active = true;
    setRemoteSearch({ query, items: [], offset: 0, hasMore: false, loading: true, error: "" });
    const timer = window.setTimeout(() => {
      void searchPublishedSceneCatalogPage(query).then((page) => {
        if (active) setRemoteSearch({ query, items: page.items, offset: page.nextOffset, hasMore: page.hasMore, loading: false, error: "" });
      }).catch(() => {
        if (active) setRemoteSearch({ query, items: [], offset: 0, hasMore: false, loading: false, error: "Recherche indisponible. Les vidéos déjà chargées restent visibles." });
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [demoScene, searchQuery]);

  const loadMoreSceneSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (demoScene || !remoteSearch.hasMore || remoteSearch.loading || remoteSearch.query !== query) return;
    setRemoteSearch((current) => ({ ...current, loading: true, error: "" }));
    try {
      const page = await searchPublishedSceneCatalogPage(query, 48, remoteSearch.offset);
      setRemoteSearch((current) => current.query === query ? {
        query, items: [...current.items, ...page.items.filter((item) => !current.items.some((existing) => existing.id === item.id))],
        offset: page.nextOffset, hasMore: page.hasMore, loading: false, error: "",
      } : current);
    } catch {
      setRemoteSearch((current) => current.query === query
        ? { ...current, loading: false, error: "La suite des résultats ne peut pas être chargée." }
        : current);
    }
  }, [demoScene, remoteSearch, searchQuery]);

  useEffect(() => {
    const requestVersion = ++catalogRequestVersionRef.current;
    if (demoScene) { setCatalogLoading(false); return; }
    let active = true; setCatalogLoading(true); setCatalogError("");
    setCatalogHasMore(false); setCatalogOffset(0); setCatalogLoadingMore(false);
    const timer = window.setTimeout(() => { if (active) { active = false; setCatalogLoading(false); setCatalogError("Le catalogue met trop de temps à répondre. Réessaie."); } }, 12000);
    void getPublishedSceneCatalogPage().then((page) => {
      if (!active || requestVersion !== catalogRequestVersionRef.current) return;
      setRemoteSceneItems((current) => [...page.items, ...current.filter((item) => !page.items.some((loaded) => loaded.id === item.id))]);
      setCatalogOffset(page.nextOffset); setCatalogHasMore(page.hasMore);
    })
      .catch(() => { if (active) setCatalogError("Le catalogue ne peut pas être chargé. Réessaie."); })
      .finally(() => { window.clearTimeout(timer); if (active) setCatalogLoading(false); });
    return () => { active = false; ++catalogRequestVersionRef.current; window.clearTimeout(timer); };
  }, [catalogAttempt, demoScene]);

  const loadMoreSceneCatalog = useCallback(async () => {
    if (demoScene || !catalogHasMore || catalogLoading || catalogLoadingMore) return;
    const requestVersion = catalogRequestVersionRef.current;
    setCatalogLoadingMore(true); setCatalogError("");
    try {
      const page = await getPublishedSceneCatalogPage(48, catalogOffset);
      if (requestVersion !== catalogRequestVersionRef.current) return;
      setRemoteSceneItems((current) => [...current, ...page.items.filter((item) => !current.some((loaded) => loaded.id === item.id))]);
      setCatalogOffset(page.nextOffset); setCatalogHasMore(page.hasMore);
    } catch {
      if (requestVersion === catalogRequestVersionRef.current) setCatalogError("La suite du catalogue ne peut pas être chargée. Réessaie.");
    } finally {
      if (requestVersion === catalogRequestVersionRef.current) setCatalogLoadingMore(false);
    }
  }, [catalogHasMore, catalogLoading, catalogLoadingMore, catalogOffset, demoScene]);

  useEffect(() => {
    const targetIds = [...new Set(remoteSceneItems.map(({ profileId }) => profileId).filter((id): id is string => Boolean(id)))];
    if (targetIds.length === 0) return;
    let active = true;
    void getFollowStates(targetIds).then((state) => {
      if (!active) return;
      setServerFollowedArtistIds(state.authenticated ? state.followingProfileIds : null);
    }).catch(() => {
      if (active) setServerFollowedArtistIds(null);
    });
    return () => { active = false; };
  }, [remoteSceneItems]);

  useEffect(() => {
    if (isUploadRoute && canPublish) setCreateOpen(true);
  }, [canPublish, isUploadRoute]);
  useEffect(() => {
    if (demoScene) return;
    const reference = getSceneWatchSlug(location.pathname) || getSceneVerticalVideoId(location.pathname) || searchParams.get("video") || "";
    const id = reference.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)?.[0];
    if (!id || remoteSceneItems.some((item) => item.id === id)) return;
    let active = true;
    void getPublishedSceneCatalogPage(1, 0, id).then((page) => {
      if (active && page.items.length) setRemoteSceneItems((current) => [...current.filter((item) => item.id !== id), ...page.items]);
    }).catch(() => { if (active) setCatalogError("Impossible de charger cette vidéo."); });
    return () => { active = false; };
  }, [demoScene, location.pathname, location.search, catalogAttempt, remoteSceneItems, searchParams]);
  const sceneCities = useMemo(
    () => [...new Set(allVideos.map((item) => item.city))].sort((left, right) => left.localeCompare(right, "fr")),
    [allVideos],
  );
  const sceneCatalog = useMemo(() => allVideos.map((item, index) => sceneVideoFromShortsItem(item, {
    publishedAt: item.publishedAt ?? new Date(sceneNow - (index % 28) * 24 * 60 * 60 * 1_000).toISOString(),
    relevanceScore: Math.max(1, allVideos.length - index),
    personalizationScore: index % 9 === 0 ? 24 : index % 4 === 0 ? 12 : 0,
  })), [allVideos, sceneNow]);
  const sceneCountries = useMemo(() => demoScene
    ? ["France", "Belgique", "Sénégal", "Suisse"]
    : [...new Set(sceneCatalog.map((item) => item.country).filter((country): country is string => Boolean(country)))].sort((left, right) => left.localeCompare(right, "fr")),
  [demoScene, sceneCatalog]);
  const sceneArtistRoleFilterOptions = useMemo(() => SCENE_ARTIST_ROLE_OPTIONS.map(({ key, label, imageUrl }) => {
    const count = sceneCatalog.filter((video) => video.artistRoles.includes(key)).length;
    return {
      id: key,
      label,
      imageUrl,
      count,
      ariaLabel: `${label}, ${count} vidéo${count > 1 ? "s" : ""}`,
    };
  }), [sceneCatalog]);
  const videoById = useMemo(
    () => new Map(allVideos.map((item) => [item.id, item])),
    [allVideos],
  );
  const verticalCollectionIds = useMemo(() => new Set([
    ...(demoScene ? SHORTS_WALLS.vertical.items.map((item) => item.id) : []),
    ...publishedItems
      .filter((item) => item.presentationFormat === "vertical" || item.format === "portrait")
      .map((item) => item.id),
    ...remoteSceneItems
      .filter((item) => item.presentationFormat === "vertical" || item.format === "portrait")
      .map((item) => item.id),
  ]), [publishedItems, remoteSceneItems, demoScene]);
  const historyItems = useMemo(
    () => watchHistory
      .map((entry) => videoById.get(entry.videoId))
      .filter((item): item is VideoItem => Boolean(item)),
    [videoById, watchHistory],
  );
  const continueWatchingEntries = useMemo(
    () => watchHistory.filter((entry) => (
      !entry.completed
      && entry.currentTime >= 3
      && entry.currentTime < entry.duration
    )),
    [watchHistory],
  );
  const continueWatchingItems = useMemo(
    () => continueWatchingEntries
      .map((entry) => videoById.get(entry.videoId))
      .filter((item): item is VideoItem => Boolean(item)),
    [continueWatchingEntries, videoById],
  );
  const continueProgressById = useMemo(
    () => new Map(continueWatchingEntries.map((entry) => [
      entry.videoId,
      Math.round((entry.currentTime / entry.duration) * 100),
    ])),
    [continueWatchingEntries],
  );
  const historyProgressById = useMemo(
    () => new Map(watchHistory.map((entry) => [
      entry.videoId,
      entry.completed ? 100 : Math.round((entry.currentTime / entry.duration) * 100),
    ])),
    [watchHistory],
  );
  const profileArtistReference = getSceneArtistReference(location.pathname)
    ?? getProfileArtistDeepLink(searchParams);
  const profileArtistVideos = useMemo(() => {
    if (!profileArtistReference) return [];
    return allVideos.filter((item) => (
      item.profileId === profileArtistReference
      || item.artistId === profileArtistReference
      || item.mockArtistId === profileArtistReference
    ));
  }, [allVideos, profileArtistReference]);
  const effectiveFilters = useMemo(
    () => ({ ...filters, query: searchQuery }),
    [filters, searchQuery],
  );
  const filteredVideos = useMemo(() => discoverSceneVideos(
    sceneCatalog,
    effectiveFilters,
    {
      followedArtistIds: demoScene ? sceneCatalog.slice(1, 7).map((item) => item.artistId) : [...(serverFollowedArtistIds ?? [])],
      preferredStyles: demoScene ? ["soul", "rap", "jazz"] : [],
      preferredCities: demoScene ? ["Paris", "Montreuil"] : [],
      recentlyViewedArtistIds: demoScene ? sceneCatalog.slice(8, 11).map((item) => item.artistId) : [],
    },
    new Date(sceneNow),
  ).map((record) => videoById.get(record.id)).filter((item): item is VideoItem => Boolean(item)), [
    effectiveFilters,
    sceneCatalog,
    videoById,
    demoScene,
    serverFollowedArtistIds,
    sceneNow,
  ]);
  const followedArtistIds = useMemo(
    () => serverFollowedArtistIds ?? (demoScene ? new Set([
        ...SHORTS_WALLS["for-you"].items.slice(0, 4).map((item) => item.artistId),
        ...SHORTS_WALLS.collaborations.items.slice(0, 2).map((item) => item.artistId),
        ...SHORTS_WALLS.vertical.items.slice(0, 10).map((item) => item.artistId),
      ]) : new Set<string>()),
    [serverFollowedArtistIds, demoScene],
  );
  const draftResultCount = useMemo(() => {
    const records = discoverSceneVideos(
      sceneCatalog,
      { ...draftFilters, query: searchQuery },
      {},
      new Date(sceneNow),
    );
    if (activeTab !== "explore" || exploreMediaMode !== "vertical") return records.length;
    return records.filter((record) => {
      const item = videoById.get(record.id);
      return item
        && verticalCollectionIds.has(item.id)
        && (item.presentationFormat === "vertical" || item.format === "portrait")
        && matchesVerticalQuickFilter(item, verticalQuickFilter)
        && matchesVerticalDuration(item, draftVerticalDurationFilter)
        && (!draftVerticalFollowedOnly || followedArtistIds.has(item.artistId));
    }).length;
  }, [
    activeTab,
    draftFilters,
    draftVerticalFollowedOnly,
    draftVerticalDurationFilter,
    exploreMediaMode,
    followedArtistIds,
    sceneCatalog,
    searchQuery,
    verticalCollectionIds,
    verticalQuickFilter,
    videoById,
    sceneNow,
  ]);
  const normalizedQuery = normalizeText(searchQuery.trim());
  const searchResults = useMemo(() => {
    if (!normalizedQuery) return [];
    return filteredVideos;
  }, [filteredVideos, normalizedQuery]);
  const savedItems = useMemo(
    () => allVideos.filter((item) => savedIds.has(item.id)),
    [allVideos, savedIds],
  );
  const heroVideoIds = useMemo(
    () => new Set((demoScene ? SHORTS_WALLS.trending.items : allVideos).slice(0, 3).map((item) => item.id)),
    [allVideos, demoScene],
  );
  const publishedAtById = useMemo(
    () => new Map(sceneCatalog.map((record) => [
      record.id,
      record.publishedAt ? Date.parse(record.publishedAt) : 0,
    ])),
    [sceneCatalog],
  );
  const followingFeedVideos = useMemo(
    () => allVideos
      .filter((item) => followedArtistIds.has(item.artistId))
      .sort((left, right) => (
        (publishedAtById.get(right.id) ?? 0) - (publishedAtById.get(left.id) ?? 0)
      )),
    [allVideos, followedArtistIds, publishedAtById],
  );
  const homeFollowedVideos = useMemo(
    () => followingFeedVideos
      .filter((item) => !heroVideoIds.has(item.id) && item.presentationFormat !== "vertical" && item.format !== "portrait")
      .slice(0, 10),
    [followingFeedVideos, heroVideoIds],
  );
  const homeFollowedShorts = useMemo(
    () => followingFeedVideos
      .filter((item) => !heroVideoIds.has(item.id) && (item.presentationFormat === "vertical" || item.format === "portrait"))
      .slice(0, 12),
    [followingFeedVideos, heroVideoIds],
  );
  const watchHistoryById = useMemo(
    () => new Map(watchHistory.map((entry) => [entry.videoId, entry])),
    [watchHistory],
  );
  const filteredFollowingVideos = useMemo(() => followingFeedVideos.filter((item) => {
    const publishedAt = publishedAtById.get(item.id) ?? 0;
    const age = sceneNow - publishedAt;
    if (followingFilter === "unseen" && watchHistoryById.has(item.id)) return false;
    if (followingFilter === "today") return age >= 0 && age < SCENE_DAY_MS;
    if (followingFilter === "week") return age >= 0 && age < 7 * SCENE_DAY_MS;
    return true;
  }), [followingFeedVideos, followingFilter, publishedAtById, watchHistoryById, sceneNow]);
  const followingGroups = useMemo(() => {
    const today: VideoItem[] = [];
    const week: VideoItem[] = [];
    const earlier: VideoItem[] = [];
    filteredFollowingVideos.forEach((item) => {
      const age = sceneNow - (publishedAtById.get(item.id) ?? 0);
      if (age >= 0 && age < SCENE_DAY_MS) today.push(item);
      else if (age >= 0 && age < 7 * SCENE_DAY_MS) week.push(item);
      else earlier.push(item);
    });
    return [
      { id: "today", title: "Aujourd’hui", items: today },
      { id: "week", title: "Cette semaine", items: week },
      { id: "earlier", title: "Plus tôt", items: earlier },
    ].filter((group) => group.items.length > 0).map((group) => ({
      ...group,
      shorts: group.items.filter(isShortItem),
      videos: group.items.filter((item) => !isShortItem(item)),
    }));
  }, [filteredFollowingVideos, publishedAtById, sceneNow]);
  const unseenFollowingCount = useMemo(
    () => followingFeedVideos.filter((item) => !watchHistoryById.has(item.id)).length,
    [followingFeedVideos, watchHistoryById],
  );
  const visibleSearchResults = useMemo(
    () => activeTab === "following"
      ? searchResults
        .filter((item) => followedArtistIds.has(item.artistId))
        .sort((left, right) => (
          (publishedAtById.get(right.id) ?? 0) - (publishedAtById.get(left.id) ?? 0)
        ))
      : activeTab === "explore"
        ? searchResults.filter((item) => {
            const vertical = item.presentationFormat === "vertical" || item.format === "portrait";
            return exploreMediaMode === "vertical" ? vertical : !vertical;
          })
        : searchResults,
    [activeTab, exploreMediaMode, followedArtistIds, publishedAtById, searchResults],
  );
  const visibleFilteredVideos = useMemo(
    () => activeTab === "following"
      ? filteredVideos.filter((item) => followedArtistIds.has(item.artistId))
      : filteredVideos,
    [activeTab, filteredVideos, followedArtistIds],
  );
  const nearbyVideos = useMemo(
    () => allVideos
      .filter((item) => (
        ["Paris", "Montreuil", "Nanterre", "Saint-Denis"].includes(item.city)
        && !heroVideoIds.has(item.id)
      ))
      .slice(0, 10),
    [allVideos, heroVideoIds],
  );
  const unreadNotificationCount = notifications.filter((notification) => !notification.read).length;

  const searchHasMore = !demoScene && remoteSearch.query === searchQuery.trim() && remoteSearch.hasMore;
  const searchLabel = searchQuery.trim()
    ? `${visibleSearchResults.length}${searchHasMore ? "+" : ""} résultat${visibleSearchResults.length > 1 ? "s" : ""} pour ${searchQuery.trim()}`
    : "Rechercher une vidéo, un artiste, un morceau ou un style";

  const activeFilterCount = countActiveSceneFilters(
    { ...filters, query: "" },
    SCENE_FILTER_OPTIONS,
  )
    + (activeTab === "explore" && exploreMediaMode === "vertical" && verticalDurationFilter !== "all" ? 1 : 0)
    + (activeTab === "explore" && exploreMediaMode === "vertical" && verticalFollowedOnly ? 1 : 0);

  const exploreCatalogVideos = useMemo(() => {
    const source = activeFilterCount > 0 ? filteredVideos : allVideos;
    return source.filter((item) => {
      if (searchParams.get("liked") === "1" && !isLiked(item)) return false;
      const vertical = item.presentationFormat === "vertical" || item.format === "portrait";
      if (exploreMediaMode === "vertical") {
        return verticalCollectionIds.has(item.id)
          && vertical
          && matchesVerticalQuickFilter(item, verticalQuickFilter)
          && matchesVerticalDuration(item, verticalDurationFilter)
          && (!verticalFollowedOnly || followedArtistIds.has(item.artistId));
      }
      return !vertical;
    });
  }, [
    activeFilterCount,
    allVideos,
    exploreMediaMode,
    filteredVideos,
    followedArtistIds,
    verticalCollectionIds,
    verticalDurationFilter,
    verticalFollowedOnly,
    verticalQuickFilter,
    searchParams,
    isLiked,
  ]);
  const exploreRenderedVideos = useMemo(
    () => exploreMediaMode === "vertical"
      ? exploreCatalogVideos
      : exploreCatalogVideos.slice(0, exploreVisibleCount),
    [exploreCatalogVideos, exploreMediaMode, exploreVisibleCount],
  );
  const exploreRenderedCount = exploreRenderedVideos.length;

  const verticalSearchResults = useMemo(
    () => visibleSearchResults.filter((item) => (
      verticalCollectionIds.has(item.id)
      && matchesVerticalQuickFilter(item, verticalQuickFilter)
      && matchesVerticalDuration(item, verticalDurationFilter)
      && (!verticalFollowedOnly || followedArtistIds.has(item.artistId))
    )),
    [
      followedArtistIds,
      verticalCollectionIds,
      verticalDurationFilter,
      verticalFollowedOnly,
      verticalQuickFilter,
      visibleSearchResults,
    ],
  );

  const verticalPlaylist = useMemo(
    () => activeTab === "explore" && exploreMediaMode === "vertical"
      ? (normalizedQuery ? verticalSearchResults : exploreCatalogVideos)
      : allVideos.filter((item) => item.presentationFormat === "vertical" || item.format === "portrait"),
    [activeTab, allVideos, exploreCatalogVideos, exploreMediaMode, normalizedQuery, verticalSearchResults],
  );
  const selectedVerticalIndex = selectedVideo
    ? verticalPlaylist.findIndex((item) => item.id === selectedVideo.id)
    : -1;
  const previousVerticalVideo = selectedVerticalIndex >= 0 && verticalPlaylist.length > 1
    ? verticalPlaylist[(selectedVerticalIndex - 1 + verticalPlaylist.length) % verticalPlaylist.length]
    : undefined;
  const nextVerticalVideo = selectedVerticalIndex >= 0 && verticalPlaylist.length > 1
    ? verticalPlaylist[(selectedVerticalIndex + 1) % verticalPlaylist.length]
    : undefined;


  useEffect(() => {
    if (
      activeTab !== "explore"
      || activeWall
      || exploreMediaMode === "vertical"
      || normalizedQuery
      || activeFilterCount > 0
      || (!catalogHasMore && exploreVisibleCount >= exploreCatalogVideos.length)
    ) return undefined;

    const sentinel = exploreLoadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return undefined;

    const scrollRoot = document.querySelector(".shorts-home");
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.unobserve(sentinel);
      if (exploreVisibleCount < exploreCatalogVideos.length) {
        setExploreVisibleCount((current) => Math.min(current + SCENE_EXPLORE_BATCH_SIZE, exploreCatalogVideos.length));
      } else void loadMoreSceneCatalog();
    }, {
      root: document.querySelector(".scene-page.is-document") ? null : scrollRoot,
      rootMargin: "600px 0px",
    });

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    activeFilterCount,
    activeTab,
    activeWall,
    catalogHasMore,
    exploreCatalogVideos.length,
    exploreMediaMode,
    exploreVisibleCount,
    loadMoreSceneCatalog,
    normalizedQuery,
  ]);

  const writeRouteState = useCallback((
    updates: Record<string, string | null>,
    replace = false,
  ) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace });
  }, [setSearchParams]);

  const writeSceneRouteState = useCallback((
    nextFilters: SceneFilterState,
    updates: Record<string, string | null> = {},
    replace = false,
  ) => {
    setSearchParams((current) => {
      const next = mergeSceneFiltersIntoSearch(current, nextFilters, SCENE_FILTER_OPTIONS);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    }, { replace });
  }, [setSearchParams]);

  const scrollHomeToTop = useCallback(() => {
    window.requestAnimationFrame(() => {
      if (document.querySelector(".scene-page.is-document")) window.scrollTo({ top: 0, behavior: "smooth" });
      else document.querySelector(".shorts-home")?.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, []);

  const updateSearchQuery = useCallback((value: string) => {
    setSearchQuery(value);
    setShowSavedOnly(false);
    setShowHistoryOnly(false);
    writeRouteState({ artist: null, q: value.trim() ? value : null }, true);
  }, [writeRouteState]);

  const showTab = useCallback((tab: SceneTabId) => {
    const wall = TAB_WALLS[tab];
    const resetFilters = getSceneDefaultFilters(false);
    setActiveTab(tab);
    setActiveWall(wall);
    setShowSavedOnly(false);
    setShowHistoryOnly(false);
    setSearchQuery("");
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    setExploreMediaMode("landscape");
    setVerticalQuickFilter("all");
    setVerticalDurationFilter("all");
    setDraftVerticalDurationFilter("all");
    setVerticalFollowedOnly(false);
    setDraftVerticalFollowedOnly(false);
    navigate(getScenePathForTab(tab));
    scrollHomeToTop();
  }, [navigate, scrollHomeToTop]);

  const openWall = useCallback((wallId: ShortsWallId) => {
    const resetFilters = getSceneDefaultFilters(false);
    const isVerticalCollection = wallId === "vertical";
    setActiveWall(isVerticalCollection ? null : wallId);
    setActiveTab(isVerticalCollection ? "explore" : WALL_TABS[wallId] ?? "home");
    if (isVerticalCollection) {
      setExploreMediaMode("vertical");
      setExploreView("grid");
      setVerticalQuickFilter("all");
      setVerticalDurationFilter("all");
      setDraftVerticalDurationFilter("all");
      setVerticalFollowedOnly(false);
      setDraftVerticalFollowedOnly(false);
    }
    setShowSavedOnly(false);
    setShowHistoryOnly(false);
    setSearchQuery("");
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    writeSceneRouteState(resetFilters, {
      feed: isVerticalCollection ? null : wallId,
      view: isVerticalCollection ? "explore" : null,
      video: null,
      artist: null,
      media: isVerticalCollection ? "vertical" : null,
      verticalType: null,
      verticalDuration: null,
      followed: null,
    });
    scrollHomeToTop();
  }, [scrollHomeToTop, writeSceneRouteState]);

  const notify = useCallback((message: string) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  const openVideo = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    setAutoplayCountdown(null);
    setSelectedVideo(item);
    const target = item.presentationFormat === "vertical" || item.format === "portrait"
      ? getSceneVerticalPath(item.id)
      : getSceneWatchPath(sceneVideoSlug(item));
    const sceneScrollTop = window.scrollY || document.querySelector<HTMLElement>(".shorts-home")?.scrollTop || 0;
    const navigateToVideo = () => navigate(target, {
      state: {
        sceneReturnTo: `${location.pathname}${location.search}`,
        sceneReturnScrollTop: sceneScrollTop,
      },
    });
    const transitionDocument = document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (!reduceMotion && transitionDocument.startViewTransition) {
      transitionDocument.startViewTransition(navigateToVideo);
    } else {
      navigateToVideo();
    }
  }, [location.pathname, location.search, navigate]);

  const continueVerticalPlayback = useCallback((item: VideoItem | undefined) => {
    if (!item) return;
    setOpenMenuId(null);
    setSelectedVideo(item);
    navigate(getSceneVerticalPath(item.id), {
      replace: true,
      state: location.state,
    });
  }, [location.state, navigate]);

  const refreshWatchHistory = useCallback(() => {
    setWatchHistory(sceneWatchHistoryRepository.read());
  }, []);

  const markPageScrolling = useCallback((scrollRoot: HTMLElement) => {
    scrollRoot.dataset.scrollActive = "true";
    if (pageScrollIdleTimerRef.current !== null) window.clearTimeout(pageScrollIdleTimerRef.current);
    pageScrollIdleTimerRef.current = window.setTimeout(() => {
      delete scrollRoot.dataset.scrollActive;
      pageScrollIdleTimerRef.current = null;
    }, 140);
  }, []);

  const recordPlaybackProgress = useCallback((progress: ShortsPlaybackProgress) => {
    if (!readSceneRecommendationPreferences().historyEnabled) return;
    sceneWatchHistoryRepository.upsertProgress({
      videoId: progress.itemId,
      currentTime: progress.currentTime,
      duration: progress.duration,
      completed: progress.completed,
    });
    refreshWatchHistory();
  }, [refreshWatchHistory]);

  const recordPlaybackCompleted = useCallback((progress: ShortsPlaybackProgress) => {
    if (!readSceneRecommendationPreferences().historyEnabled) return;
    sceneWatchHistoryRepository.markCompleted(progress.itemId, progress.duration);
    refreshWatchHistory();
  }, [refreshWatchHistory]);

  const playTvVideo = useCallback((publishedVideoId: string) => {
    const video = videoById.get(publishedVideoId);
    if (!video) {
      notify("Cette vidéo publiée n’est pas encore disponible dans le catalogue local.");
      return;
    }
    openVideo(video);
  }, [notify, openVideo, videoById]);

  const openTvRoom = useCallback((roomId: string) => {
    navigate(`/rooms?room=${encodeURIComponent(roomId)}`);
  }, [navigate]);

  const closeVideo = useCallback(() => {
    setSelectedVideo(null);
    if (!getSceneWatchSlug(location.pathname) && !getSceneVerticalVideoId(location.pathname) && !searchParams.has("video")) return;
    const stateReturnTo = typeof location.state === "object"
      && location.state
      && "sceneReturnTo" in location.state
      && typeof location.state.sceneReturnTo === "string"
      ? location.state.sceneReturnTo
      : null;
    const legacyVideoParams = new URLSearchParams(location.search);
    const isLegacyVideoRoute = legacyVideoParams.has("video");
    legacyVideoParams.delete("video");
    const legacySearch = legacyVideoParams.toString();
    const returnTo = stateReturnTo
      ?? (isLegacyVideoRoute
        ? `${location.pathname}${legacySearch ? `?${legacySearch}` : ""}`
        : getScenePathForTab(activeTab));
    const returnScrollTop = typeof location.state === "object"
      && location.state
      && "sceneReturnScrollTop" in location.state
      && typeof location.state.sceneReturnScrollTop === "number"
      ? location.state.sceneReturnScrollTop
      : null;
    navigate(returnTo, { replace: true });
    if (returnScrollTop !== null) {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: returnScrollTop, behavior: "instant" });
          document.querySelector<HTMLElement>(".shorts-home")?.scrollTo({
            top: returnScrollTop,
            behavior: "auto",
          });
        });
      });
    }
  }, [activeTab, location.pathname, location.search, location.state, navigate]);

  const openFilters = () => {
    if (filtersOpen) { setFiltersOpen(false); return; }
    setDraftFilters(activeTab === "explore" ? filters : { ...filters, sort: "relevance" });
    setDraftVerticalDurationFilter(verticalDurationFilter);
    setDraftVerticalFollowedOnly(verticalFollowedOnly);
    setFiltersOpen(true);
    setNotificationsOpen(false);
    setOpenMenuId(null);
  };

  const applyFilters = () => {
    const nextFilters = { ...draftFilters, query: searchQuery };
    const count = countActiveSceneFilters(
      { ...nextFilters, query: "" },
      SCENE_FILTER_OPTIONS,
    )
      + (exploreMediaMode === "vertical" && draftVerticalDurationFilter !== "all" ? 1 : 0)
      + (exploreMediaMode === "vertical" && draftVerticalFollowedOnly ? 1 : 0);
    setFilters(nextFilters);
    setVerticalDurationFilter(draftVerticalDurationFilter);
    setVerticalFollowedOnly(draftVerticalFollowedOnly);
    setFiltersOpen(false);
    setShowSavedOnly(false);
    setShowHistoryOnly(false);
    setActiveWall(null);
    writeSceneRouteState(nextFilters, {
      feed: null,
      view: "explore",
      artist: null,
      verticalDuration: exploreMediaMode === "vertical" && draftVerticalDurationFilter !== "all"
        ? draftVerticalDurationFilter
        : null,
      followed: exploreMediaMode === "vertical" && draftVerticalFollowedOnly ? "1" : null,
    });
    trackSceneAnalytics({ event: "filter_applied", filterCount: count });
    notify(count > 0
      ? `${draftResultCount} contenu${draftResultCount > 1 ? "s" : ""} correspond${draftResultCount > 1 ? "ent" : ""} à tes ${count} filtre${count > 1 ? "s" : ""}.`
      : "Tous les contenus sont de nouveau affichés.");
  };

  const clearFilters = useCallback(() => {
    const resetFilters = { ...getSceneDefaultFilters(false), query: searchQuery };
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    setVerticalQuickFilter("all");
    setVerticalDurationFilter("all");
    setDraftVerticalDurationFilter("all");
    setVerticalFollowedOnly(false);
    setDraftVerticalFollowedOnly(false);
    writeSceneRouteState(resetFilters, {
      verticalType: null,
      verticalDuration: null,
      followed: null,
    }, true);
    notify("Tous les contenus sont de nouveau affichés.");
  }, [notify, searchQuery, writeSceneRouteState]);

  const commitSceneFilters = useCallback((nextFilters: SceneFilterState) => {
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setActiveWall(null);
    setActiveTab("explore");
    setShowHistoryOnly(false);
    writeSceneRouteState(nextFilters, { feed: null, view: "explore", artist: null, liked: null }, true);
  }, [writeSceneRouteState]);

  const selectExploreMediaMode = useCallback((mode: SceneExploreMediaMode) => {
    const nextFilters = mode === "vertical"
      ? {
          ...filters,
          contentTypes: [],
          durations: [],
          sort: filters.sort === "for-you" ? "relevance" as const : filters.sort,
        }
      : filters;
    setExploreMediaMode(mode);
    setExploreView("grid");
    setVerticalQuickFilter("all");
    setVerticalDurationFilter("all");
    setDraftVerticalDurationFilter("all");
    setVerticalFollowedOnly(false);
    setDraftVerticalFollowedOnly(false);
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setActiveWall(null);
    setActiveTab("explore");
    writeSceneRouteState(nextFilters, {
      feed: null,
      view: "explore",
      artist: null,
      media: mode === "vertical" ? "vertical" : null,
      verticalType: null,
      verticalDuration: null,
      followed: null,
    }, true);
  }, [filters, writeSceneRouteState]);

  const toggleExploreEditorialType = useCallback((contentType: SceneContentType) => {
    const active = filters.contentTypes.length === 1 && filters.contentTypes[0] === contentType;
    const nextFilters = { ...filters, contentTypes: active ? [] : [contentType] };
    setExploreMediaMode("landscape");
    setExploreView("grid");
    setVerticalQuickFilter("all");
    setVerticalDurationFilter("all");
    setDraftVerticalDurationFilter("all");
    setVerticalFollowedOnly(false);
    setDraftVerticalFollowedOnly(false);
    setFilters(nextFilters);
    setDraftFilters(nextFilters);
    setActiveWall(null);
    setActiveTab("explore");
    writeSceneRouteState(nextFilters, {
      feed: null,
      view: "explore",
      artist: null,
      media: null,
      verticalType: null,
      verticalDuration: null,
      followed: null,
    }, true);
  }, [filters, writeSceneRouteState]);

  const activeSceneFilterChips = useMemo<MeewavActiveFilter[]>(() => {
    const chips: MeewavActiveFilter[] = [];
    const contentLabels = new Map(SCENE_CONTENT_TYPE_OPTIONS.map((option) => [option.id, option.label]));
    const artistRoleLabels = new Map(SCENE_ARTIST_ROLE_OPTIONS.map((option) => [option.key, option.label]));
    const styleLabels = new Map(SCENE_STYLE_OPTIONS.map((option) => [option.id, option.label]));
    const durationLabels = new Map(SCENE_DURATION_OPTIONS.map((option) => [option.id, option.label]));
    const gradeLabels = new Map(SCENE_GRADE_OPTIONS.map((option) => [option.id, option.label]));
    const dateLabels = new Map(SCENE_DATE_OPTIONS.map((option) => [option.id, option.label]));
    const sortLabels = new Map(SCENE_SORT_OPTIONS.map((option) => [option.id, option.label]));

    for (const contentType of filters.contentTypes) {
      chips.push({
        id: `type-${contentType}`,
        label: contentLabels.get(contentType) ?? contentType,
        onRemove: () => commitSceneFilters({
          ...filters,
          contentTypes: filters.contentTypes.filter((value) => value !== contentType),
        }),
      });
    }
    for (const artistRole of filters.artistRoles) {
      chips.push({
        id: `role-${artistRole}`,
        label: artistRoleLabels.get(artistRole) ?? artistRole,
        onRemove: () => commitSceneFilters({
          ...filters,
          artistRoles: filters.artistRoles.filter((value) => value !== artistRole),
        }),
      });
    }
    for (const style of filters.styles) {
      chips.push({
        id: `style-${style}`,
        label: styleLabels.get(style) ?? style,
        onRemove: () => commitSceneFilters({
          ...filters,
          styles: filters.styles.filter((value) => value !== style),
        }),
      });
    }
    for (const duration of filters.durations) {
      chips.push({
        id: `duration-${duration}`,
        label: durationLabels.get(duration) ?? duration,
        onRemove: () => commitSceneFilters({
          ...filters,
          durations: filters.durations.filter((value) => value !== duration),
        }),
      });
    }
    for (const grade of filters.grades) {
      chips.push({
        id: `grade-${grade}`,
        label: gradeLabels.get(grade) ?? `Niveau ${grade}`,
        onRemove: () => commitSceneFilters({
          ...filters,
          grades: filters.grades.filter((value) => value !== grade),
        }),
      });
    }
    for (const [key, label] of [
      ["country", filters.country],
      ["region", filters.region],
      ["city", filters.city],
    ] as const) {
      if (!label) continue;
      chips.push({
        id: `${key}-${label}`,
        label,
        onRemove: () => commitSceneFilters({ ...filters, [key]: "" }),
      });
    }
    if (filters.date !== "all") {
      chips.push({
        id: `date-${filters.date}`,
        label: dateLabels.get(filters.date) ?? filters.date,
        onRemove: () => commitSceneFilters({ ...filters, date: "all" }),
      });
    }
    if (filters.sort !== SCENE_FILTER_OPTIONS.defaultSort) {
      chips.push({
        id: `sort-${filters.sort}`,
        label: `Tri : ${sortLabels.get(filters.sort) ?? filters.sort}`,
        onRemove: () => commitSceneFilters({
          ...filters,
          sort: SCENE_FILTER_OPTIONS.defaultSort,
        }),
      });
    }
    if (activeTab === "explore" && exploreMediaMode === "vertical" && verticalDurationFilter !== "all") {
      chips.push({
        id: `vertical-duration-${verticalDurationFilter}`,
        label: SCENE_VERTICAL_DURATION_FILTERS.find(({ id }) => id === verticalDurationFilter)?.label
          ?? "Durée du Short",
        onRemove: () => {
          setVerticalDurationFilter("all");
          setDraftVerticalDurationFilter("all");
          writeRouteState({ verticalDuration: null }, true);
        },
      });
    }
    if (activeTab === "explore" && exploreMediaMode === "vertical" && verticalFollowedOnly) {
      chips.push({
        id: "vertical-followed-artists",
        label: "Artistes suivis",
        onRemove: () => {
          setVerticalFollowedOnly(false);
          setDraftVerticalFollowedOnly(false);
          writeRouteState({ followed: null }, true);
        },
      });
    }
    return chips;
  }, [
    activeTab,
    commitSceneFilters,
    exploreMediaMode,
    filters,
    verticalDurationFilter,
    verticalFollowedOnly,
    writeRouteState,
  ]);

  const toggleSaved = useCallback((item: VideoItem) => {
    const wasSaved = savedIdsRef.current.has(item.id);
    const playlist = scenePlaylistRepository.toggleVideo(
      SCENE_WATCH_LATER_PLAYLIST_ID,
      item.id,
    );
    if (!playlist) {
      setOpenMenuId(null);
      notify("À regarder plus tard est momentanément indisponible.");
      return;
    }
    const next = new Set(playlist.videoIds);
    savedIdsRef.current = next;
    setSavedIds(next);
    setOpenMenuId(null);
    notify(wasSaved
      ? `${item.title} retiré de À regarder plus tard.`
      : `${item.title} ajouté à À regarder plus tard.`);
    if (!wasSaved) trackSceneAnalytics({ event: "video_saved", mediaId: item.id });
  }, [notify]);

  const shareVideo = useCallback(async (item: VideoItem) => {
    setOpenMenuId(null);
    const route = item.presentationFormat === "vertical" || item.format === "portrait"
      ? getSceneVerticalPath(item.id)
      : getSceneWatchPath(sceneVideoSlug(item));
    const url = `${window.location.origin}${route}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${item.title} · ${item.artist}`, text: item.role, url });
        notify("Vidéo partagée.");
      } else {
        await copyToClipboard(url);
        notify("Lien de la vidéo copié.");
      }
      trackSceneAnalytics({ event: "video_shared", mediaId: item.id });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      notify("Le partage n’a pas pu être ouvert. Réessaie.");
    }
  }, [notify]);

  const viewProfile = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    setSelectedVideo(null);
    const profileReference = resolveSceneCanonicalProfileId(item)
      ?? safeProfileArtistReference(item.profileId)
      ?? safeProfileArtistReference(item.mockArtistId)
      ?? safeProfileArtistReference(item.artistId);
    if (!profileReference) {
      notify(`Le profil de ${item.artist} n’est pas encore disponible.`);
      return;
    }
    trackSceneAnalytics({
      event: "artist_profile_opened",
      mediaId: item.id,
      artistId: item.artistId,
    });
    const demoParams = resolveSceneCanonicalProfileId(item) ? "" : `?${new URLSearchParams({
      name: item.artist,
      role: item.role,
      city: item.city,
      portrait: item.artistPortrait ?? item.image,
      grade: String(item.gradeLevel),
    }).toString()}`;
    navigate(`/profile/view/${encodeURIComponent(profileReference)}${demoParams}`, {
      state: {
        from: `${location.pathname}${location.search}`,
        artist: shortsProfileViewerArtist(item),
        source: "shorts",
        videoId: item.id,
      },
    });
  }, [location.pathname, location.search, navigate, notify]);

  const contactArtist = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    navigate(buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "shorts",
      ...shortsMessagingIdentity(item),
    }));
  }, [navigate]);

  const proposeCollaboration = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    if (!item.collabAvailable) {
      notify(`${item.artist} n’accepte pas encore de demande de collaboration.`);
      return;
    }
    setCollaborationItem(item);
  }, [notify]);

  const addToPlaylist = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    const playlist = getOrCreateDefaultScenePlaylist();
    const updatedPlaylist = playlist
      ? scenePlaylistRepository.addVideo(playlist.id, item.id)
      : null;
    if (!updatedPlaylist) {
      notify("La playlist est momentanément indisponible.");
      return;
    }
    notify(`${item.title} ajouté à « ${updatedPlaylist.title} ».`);
  }, [notify]);

  const explainRecommendation = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    const record = sceneVideoFromShortsItem(item);
    const styleLabel = SCENE_STYLE_OPTIONS.find(({ id }) => id === record.styles[0])?.label;
    const reason = styleLabel
      ? `Cette vidéo enrichit ton flux autour de ${styleLabel}, avec un équilibre entre affinité, fraîcheur et diversité.`
      : "Cette vidéo enrichit ton flux selon sa pertinence musicale, sa fraîcheur et la diversité des artistes proposés.";
    trackSceneAnalytics({
      event: "recommendation_reason_opened",
      mediaId: item.id,
      artistId: item.artistId,
      reason: styleLabel ? `style:${record.styles[0]}` : "relevance:freshness:diversity",
    });
    notify(`${reason} Le prix d’un jeton n’influence pas cette recommandation.`);
  }, [notify]);

  const openRecommendationSettings = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    setNotificationsOpen(false);
    trackSceneAnalytics({
      event: "recommendation_settings_opened",
      mediaId: item.id,
      artistId: item.artistId,
      reason: "video_menu",
    });
    navigate(SCENE_RECOMMENDATION_SETTINGS_ROUTE, {
      state: { sceneReturnTo: `${location.pathname}${location.search}` },
    });
    scrollHomeToTop();
    notify("Tes réglages de recommandation sont ouverts.");
  }, [location.pathname, location.search, navigate, notify, scrollHomeToTop]);

  const markNotInterested = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    appendScenePreference("meewav:scene:not-interested", item.id);
    trackSceneAnalytics({ event: "not_interested", mediaId: item.id });
    notify("Cette préférence affinera tes prochaines recommandations.");
  }, [notify]);

  const muteArtistRecommendations = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    appendScenePreference("meewav:scene:muted-artists", item.artistId || item.artist);
    notify(`${item.artist} ne sera plus proposé dans tes recommandations.`);
  }, [notify]);

  const reportVideo = useCallback((item: VideoItem) => {
    setOpenMenuId(null);
    appendScenePreference("meewav:scene:reported", item.id);
    notify("Signalement enregistré pour vérification.");
  }, [notify]);

  const handleCollaborationSubmitted = useCallback((requestId: string) => {
    if (!collaborationItem) return;
    const item = collaborationItem;
    setCollaborationItem(null);
    notify(`Demande envoyée à ${item.artist}. Retrouve-la dans Messagerie → Collabs.`);
    navigate(buildMessagingRoute({
      space: "collabs",
      intent: "collaboration",
      source: "shorts",
      requestId: isMessagingUuid(requestId) ? requestId : null,
      ...shortsMessagingIdentity(item),
    }));
  }, [collaborationItem, navigate, notify]);

  const askForGoldenLike = useCallback(async (item: VideoItem) => {
    setGoldenLikeError("");
    const result = await requestGoldenLike(item);
    if (result === "already-given") {
      notify(`Ton Golden Like du jour est déjà attribué à ${item.artist}.`);
    } else if (result === "unavailable") {
      notify("Ton Golden Like du jour a déjà été utilisé. Un nouveau sera disponible demain, heure de Paris.");
    } else if (result === "error") {
      notify("Impossible de vérifier ton Golden Like pour le moment. Réessaie dans un instant.");
    }
  }, [notify, requestGoldenLike]);

  const submitGoldenLike = useCallback(async () => {
    if (!pendingGoldenLike || goldenLikeSubmitting) return;
    setGoldenLikeError("");
    try {
      const confirmed = await confirmGoldenLike();
      if (confirmed) {
        if (confirmed.status === "quota-used") {
          notify("Ton Golden Like du jour a déjà été utilisé. Un nouveau sera disponible demain, heure de Paris.");
        } else if (confirmed.status === "already-sent") {
          notify(`Ton Golden Like du jour est déjà attribué à ${confirmed.item.artist}.`);
        } else {
          setGoldenBurstVideoId(confirmed.item.id);
          notify(`Golden Like offert à ${confirmed.item.artist}. Prochain Golden Like demain, heure de Paris.`);
        }
      }
    } catch {
      setGoldenLikeError("Le Golden Like n’a pas été envoyé. Réessaie.");
    }
  }, [
    confirmGoldenLike,
    goldenLikeSubmitting,
    notify,
    pendingGoldenLike,
  ]);

  const cardActions: ShortsCardActions = {
    isLiked,
    hasGoldenLike,
    goldenUnavailableFor,
    likeCountFor,
    goldenLikeCountFor,
    onToggleLike: toggleLike,
    onRequestGoldenLike: askForGoldenLike,
    onContact: contactArtist,
    onCollaborate: proposeCollaboration,
    onAddToPlaylist: addToPlaylist,
    onExplainRecommendation: explainRecommendation,
    onOpenRecommendationSettings: openRecommendationSettings,
    onNotInterested: markNotInterested,
    onMuteArtist: muteArtistRecommendations,
    onReport: reportVideo,
  };

  const publishPerformance = useCallback((item: VideoItem) => {
    if (item.video?.startsWith("blob:")) {
      publishedObjectUrlsRef.current.add(item.video);
    }
    if (item.secondaryVideo?.startsWith("blob:")) {
      publishedObjectUrlsRef.current.add(item.secondaryVideo);
    }
    setPublishedItems((current) => [item, ...current]);
    setCreateOpen(false);
    setActiveWall(null);
    setActiveTab("home");
    const resetFilters = getSceneDefaultFilters(false);
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    setShowSavedOnly(false);
    setShowHistoryOnly(false);
    navigate(SCENE_ROUTE, { replace: true });
    scrollHomeToTop();
    notify("Vidéo publiée. Elle apparaît maintenant dans La Scène.");
  }, [navigate, notify, scrollHomeToTop]);

  const updateSelectedShortInfo = useCallback((patch: Partial<VideoItem>) => {
    if (!selectedVideo) return;
    const updated = { ...selectedVideo, ...patch };
    setSelectedVideo(updated);
    setPublishedItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    setRemoteSceneItems((current) => current.map((item) => item.id === updated.id ? updated : item));
    notify("Informations du Short enregistrées.");
  }, [notify, selectedVideo]);

  const openNotification = useCallback((notification: ShortsNotification) => {
    setNotifications((current) => current.map((item) => (
      item.id === notification.id ? { ...item, read: true } : item
    )));
    setNotificationsOpen(false);
    const video = allVideos.find((item) => item.id === notification.videoId);
    if (video) openVideo(video);
  }, [allVideos, openVideo]);

  const openSavedSelection = useCallback(() => {
    const resetFilters = getSceneDefaultFilters(false);
    setShowSavedOnly(true);
    setShowHistoryOnly(false);
    setSearchQuery("");
    setActiveWall(null);
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    setNotificationsOpen(false);
    trackSceneAnalytics({ event: "playlists_opened", reason: "notification_panel" });
    navigate(SCENE_PLAYLISTS_ROUTE, {
      state: { sceneReturnTo: `${location.pathname}${location.search}` },
    });
    scrollHomeToTop();
  }, [location.pathname, location.search, navigate, scrollHomeToTop]);

  const openWatchHistory = useCallback(() => {
    const resetFilters = getSceneDefaultFilters(false);
    setShowHistoryOnly(true);
    setShowSavedOnly(false);
    setSearchQuery("");
    setActiveWall(null);
    setFilters(resetFilters);
    setDraftFilters(resetFilters);
    setNotificationsOpen(false);
    navigate(SCENE_HISTORY_ROUTE);
    scrollHomeToTop();
  }, [navigate, scrollHomeToTop]);

  const closeStandaloneSceneView = useCallback(() => {
    const stateReturnTo = typeof location.state === "object"
      && location.state
      && "sceneReturnTo" in location.state
      && typeof location.state.sceneReturnTo === "string"
      ? location.state.sceneReturnTo
      : SCENE_ROUTE;
    navigate(stateReturnTo);
    scrollHomeToTop();
  }, [location.state, navigate, scrollHomeToTop]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${SCENE_NAME} — MeeWav`;
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (
      activeTab === "home"
      && !isCreatorStudioRoute
      && !isPlaylistsRoute
      && !isRecommendationSettingsRoute
    ) {
      trackSceneAnalytics({ event: "scene_home_viewed" });
    }
  }, [activeTab, isCreatorStudioRoute, isPlaylistsRoute, isRecommendationSettingsRoute]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      trackSceneAnalytics({ event: "search_performed", query });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    if (pageScrollIdleTimerRef.current !== null) window.clearTimeout(pageScrollIdleTimerRef.current);
    for (const objectUrl of publishedObjectUrlsRef.current) {
      URL.revokeObjectURL(objectUrl);
    }
    publishedObjectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    setShowHistoryOnly(location.pathname === SCENE_HISTORY_ROUTE);
    setShowSavedOnly(location.pathname === SCENE_PLAYLISTS_ROUTE);
    const routeVideoId = searchParams.get("video");
    const routeWatchSlug = getSceneWatchSlug(location.pathname);
    const routeVerticalVideoId = getSceneVerticalVideoId(location.pathname);
    const routeVideo = routeVideoId
      ? allVideos.find((item) => item.id === routeVideoId) ?? null
      : routeVerticalVideoId
        ? allVideos.find((item) => item.id === routeVerticalVideoId) ?? null
      : routeWatchSlug
        ? allVideos.find((item) => sceneVideoSlug(item) === routeWatchSlug) ?? null
        : null;
    setSelectedVideo((current) => routeVideo
      ? (current?.id === routeVideo.id ? current : routeVideo)
      : routeVideoId || routeWatchSlug || routeVerticalVideoId || getSceneTabFromPathname(location.pathname) === "tv" ? null : current?.format !== "portrait" && current?.presentationFormat !== "vertical" ? current : null);

    if (routeWatchSlug || routeVerticalVideoId) return;

    const feed = searchParams.get("feed");
    const routeQuery = searchParams.get("q") ?? "";
    const routeMediaMode = searchParams.get("media") === "vertical" ? "vertical" : "landscape";
    setExploreMediaMode((current) => current === routeMediaMode ? current : routeMediaMode);
    const routeVerticalFilter = verticalQuickFilterFromSearch(searchParams);
    setVerticalQuickFilter((current) => current === routeVerticalFilter ? current : routeVerticalFilter);
    const routeVerticalDuration = verticalDurationFilterFromSearch(searchParams);
    setVerticalDurationFilter((current) => current === routeVerticalDuration ? current : routeVerticalDuration);
    setDraftVerticalDurationFilter((current) => current === routeVerticalDuration ? current : routeVerticalDuration);
    const routeFollowedOnly = searchParams.get("followed") === "1";
    setVerticalFollowedOnly((current) => current === routeFollowedOnly ? current : routeFollowedOnly);
    setDraftVerticalFollowedOnly((current) => current === routeFollowedOnly ? current : routeFollowedOnly);
    setSearchQuery((current) => current === routeQuery ? current : routeQuery);
    const parsedRouteFilters = filtersFromSearchParams(searchParams);
    const routeFilters = routeMediaMode === "vertical" && parsedRouteFilters.sort === "for-you"
      ? { ...parsedRouteFilters, sort: "relevance" as const }
      : parsedRouteFilters;
    setFilters((current) => (
      JSON.stringify(current) === JSON.stringify(routeFilters) ? current : routeFilters
    ));
    const nextWall = feed && Object.prototype.hasOwnProperty.call(SHORTS_WALLS, feed)
      ? feed as ShortsWallId
      : null;
    const legacyVerticalWall = nextWall === "vertical";
    setActiveWall(legacyVerticalWall ? null : nextWall);
    if (legacyVerticalWall) {
      setExploreMediaMode("vertical");
      setVerticalQuickFilter("all");
      setVerticalDurationFilter("all");
      setDraftVerticalDurationFilter("all");
      setVerticalFollowedOnly(false);
      setDraftVerticalFollowedOnly(false);
      setActiveTab("explore");
    } else if (nextWall) {
      setActiveTab(WALL_TABS[nextWall] ?? "home");
    } else {
      setActiveTab(sceneTabFromParams(searchParams, location.pathname));
    }
  }, [allVideos, location.pathname, searchParams]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        openMenuId
        && !target?.closest(".shorts-video-card, .scene-vertical-card, .scene-card-floating-menu")
      ) {
        setOpenMenuId(null);
      }
      if (notificationsOpen && !notificationPanelRef.current?.contains(target)) {
        setNotificationsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isEditing = Boolean(target?.matches("input, textarea, select, [contenteditable='true']"));
      const isCommandSearch = (
        (event.ctrlKey || event.metaKey)
        && !event.altKey
        && event.key.toLocaleLowerCase("fr") === "k"
      );

      if (event.key === "Escape") {
        setOpenMenuId(null);
        setNotificationsOpen(false);
      }
      if (
        isCommandSearch
        && !filtersOpen
        && !createOpen
        && !selectedVideo
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (
        event.key === "/"
        && !event.ctrlKey
        && !event.metaKey
        && !event.altKey
        && !filtersOpen
        && !createOpen
        && !selectedVideo
        && !isEditing
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [
    createOpen,
    filtersOpen,
    notificationsOpen,
    openMenuId,
    selectedVideo,
  ]);

  const toggleWatchFollow = async () => {
    if (!selectedVideo || followPending) return;
    const canonical = resolveSceneCanonicalProfileId(selectedVideo);
    const artistId = canonical ?? selectedVideo.artistId;
    if (!artistId) return;
    if (canonical && !user) { notify("Connecte-toi pour suivre cet artiste."); return; }
    if (!canonical && !isLocalAuthPreviewEnabled()) { notify("Ce profil n’est pas encore disponible."); return; }
    const before = new Set(followedArtistIds), following = !before.has(artistId);
    const next = new Set(before); if (following) next.add(artistId); else next.delete(artistId);
    setServerFollowedArtistIds(next); setFollowPending(true);
    try {
      if (canonical) await setFollowState(canonical, following);
      notify(following ? `Tu suis ${selectedVideo.artist}.` : `Tu ne suis plus ${selectedVideo.artist}.`);
    } catch { setServerFollowedArtistIds(before); notify("Le suivi n’a pas été enregistré. Réessaie."); }
    finally { setFollowPending(false); }
  };

  useSceneDocumentScroll(`${location.key}:${location.pathname}${location.search}`, activeTab !== "tv" || watchRoute);
  const availableWatchIds = new Set(allVideos.filter((video) => video.format !== "portrait" && video.presentationFormat !== "vertical").map((video) => video.id));
  const playbackPolicy = { currentId: selectedVideo?.id ?? "", queue: playbackQueue.ids, playlist: playbackQueue.playlist, repeat: playbackQueue.repeat, recommendationId: selectedVideo ? watchRecommendations(allVideos, selectedVideo)[0]?.id : undefined, autoplay: playbackQueue.autoplay, available: availableWatchIds };
  const automaticNext = resolveNextPlayback(playbackPolicy);
  const manualNext = resolveNextPlayback({ ...playbackPolicy, manual: true });
  const nextWatchVideo = allVideos.find((video) => video.id === manualNext?.id);
  const advanceWatch = (next: NonNullable<typeof automaticNext>) => {
    const video = videoById.get(next.id); if (!video) return;
    if (next.source === "file") playbackQueue.remove(next.id);
    if (next.source === "playlist") playbackQueue.advancePlaylist(next.id);
    openVideo(video);
  };
  useEffect(() => {
    if (autoplayCountdown === null) return;
    const cancelIfBusy = () => { if (!canAdvancePlayback()) setAutoplayCountdown(null); };
    document.addEventListener("focusin", cancelIfBusy); document.addEventListener("input", cancelIfBusy); window.addEventListener("scroll", cancelIfBusy, { passive: true });
    const timer = window.setTimeout(() => {
      if (!automaticNext || !canAdvancePlayback()) { setAutoplayCountdown(null); return; }
      if (autoplayCountdown <= 1) { setAutoplayCountdown(null); advanceWatch(automaticNext); }
      else setAutoplayCountdown((value) => value === null ? null : value - 1);
    }, 1000);
    return () => { window.clearTimeout(timer); document.removeEventListener("focusin", cancelIfBusy); document.removeEventListener("input", cancelIfBusy); window.removeEventListener("scroll", cancelIfBusy); };
  }, [autoplayCountdown, automaticNext?.id, automaticNext?.source]);
  useEffect(() => {
    setAutoplayCountdown(null);
  }, [location.pathname]);

  const showBrowseNavigation = activeTab !== "tv" && !watchRoute && !isCreatorStudioRoute;
  const subscriptions = Array.from(new Map(allVideos.filter((item) => followedArtistIds.has(item.artistId)).map((item) => [item.artistId, item])).values());
  const browseActive = searchParams.get("liked") === "1" ? "liked"
    : selectedPlaylistRouteId === SCENE_WATCH_LATER_PLAYLIST_ID ? "watch-later"
    : isPlaylistsRoute ? "playlists" : isHistoryRoute ? "history"
    : isCreatorStudioRoute ? "studio" : profileArtistReference ?? (exploreMediaMode === "vertical" && activeTab === "explore" ? "shorts" : activeTab);
  const browseHomeVideos = Array.from(new Map([...publishedItems, ...(demoScene ? SHORTS_WALLS["for-you"].items : []), ...allVideos].filter((item) => item.format !== "portrait" && item.presentationFormat !== "vertical").map((item) => [item.id, item])).values());
  const browseShorts = allVideos.filter((item) => item.format === "portrait" || item.presentationFormat === "vertical");
  const visibleSceneTabs = demoScene ? SCENE_TABS : SCENE_TABS.filter((tab) => tab.id !== "tv");
  const activeWallDefinition = activeWall && (demoScene ? SHORTS_WALLS[activeWall] : {
    ...SHORTS_WALLS[activeWall],
    items: allVideos.filter((item) => {
      if (activeWall === "vertical") return isShortItem(item);
      if (activeWall === "collaborations") return item.collabAvailable === true;
      if (activeWall === "replays") return item.contentTypeLabel === "Replay de Room";
      if (activeWall === "showreels") return /showreel/iu.test(`${item.contentTypeLabel ?? ""} ${item.meta}`);
      if (activeWall === "tv") return false;
      return true;
    }),
  });

  return (
    <main className={`shorts-page scene-page has-unified-header${activeTab !== "tv" || watchRoute ? " is-document" : ""}${watchRoute ? " has-watch-page" : ""}${isCreatorStudioRoute ? " is-creator-studio" : ""}${showBrowseNavigation ? ` has-browse-nav${browseMenuOpen ? "" : " is-browse-collapsed"}` : ""}`} aria-label={SCENE_NAME}>
      <SceneNavigationProgress navigationKey={location.key} pending={catalogLoading} />
      {catalogError && <div role="alert">{catalogError}<button type="button" onClick={() => setCatalogAttempt((value) => value + 1)}>Réessayer</button></div>}
      <div className="shorts-page__background" aria-hidden="true" />

      <aside className="shorts-primary-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="shorts"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
          onMessages={() => navigate("/messages")}
        />
      </aside>

      <div className="shorts-shell">
        <header className="shorts-topbar">
          <div className="shorts-topbar__brand">
          {!showBrowseNavigation && <button ref={watchMenuButtonRef} className="scene-browse-toggle" aria-label={watchMenuOpen ? "Fermer le menu vidéo" : "Ouvrir le menu vidéo"} aria-expanded={watchMenuOpen} aria-controls={watchMenuOpen ? "scene-browse-nav" : undefined} onClick={() => setWatchMenuKey(watchMenuOpen ? null : location.key)}><Menu aria-hidden="true" /></button>}
          {showBrowseNavigation && <button className="scene-browse-toggle" aria-label={browseMenuOpen ? "Réduire le menu vidéo" : "Ouvrir le menu vidéo"} aria-expanded={browseMenuOpen} aria-controls="scene-browse-nav" onClick={() => setBrowseMenuOpen(!browseMenuOpen)}><Menu aria-hidden="true" /></button>}
            <MeewavPillarBrand pillar={SCENE_NAME} />
          {watchRoute && <button className="scene-context-back" aria-label="Retour" title="Retour" onClick={() => location.state?.sceneReturnTo ? navigate(-1) : navigate(SCENE_ROUTE)}><ChevronLeft /><span>Retour</span></button>}
          </div>

          <SceneSearch query={searchQuery} items={allVideos} onSearch={(query) => navigate(`${getScenePathForTab("explore")}${query ? `?q=${encodeURIComponent(query)}` : ""}`)} onFilters={openFilters} filtersOpen={filtersOpen} filterCount={activeFilterCount} inputRef={searchInputRef} filterRef={filterTriggerRef} />

          <MeewavPillarTabs
            className="shorts-pillar-tabs is-fine-indicator"
            items={visibleSceneTabs}
            activeId={isCreatorStudioRoute ? "studio" : activeTab}
            ariaLabel={`Navigation ${SCENE_NAME}`}
            onSelect={showTab}
          />

          <div className="shorts-topbar__actions">
            <div ref={notificationPanelRef} className="shorts-notifications">
              <button
                type="button"
                className={`shorts-icon-button${unreadNotificationCount > 0 ? " has-badge" : ""}${notificationsOpen ? " is-active" : ""}`}
                aria-label={unreadNotificationCount > 0
                  ? `Notifications de La Scène, ${unreadNotificationCount} non lue${unreadNotificationCount > 1 ? "s" : ""}`
                  : "Notifications de La Scène"}
                aria-expanded={notificationsOpen}
                aria-haspopup="dialog"
                aria-controls="shorts-notification-panel"
                onClick={() => {
                  setNotificationsOpen((current) => !current);
                  setOpenMenuId(null);
                }}
              >
                {notificationsOpen ? <BellRing /> : <Bell />}
                {unreadNotificationCount > 0 ? <span>{unreadNotificationCount}</span> : null}
              </button>

              {notificationsOpen ? (
                <section id="shorts-notification-panel" className="shorts-notification-panel" aria-label="Notifications de La Scène">
                  <header>
                    <div><small>Activité</small><strong>Notifications</strong></div>
                    <button
                      type="button"
                      disabled={unreadNotificationCount === 0}
                      onClick={() => setNotifications((current) => (
                        current.map((notification) => ({ ...notification, read: true }))
                      ))}
                    >
                      <CheckCheck /> Tout lire
                    </button>
                  </header>
                  <div>
                    {notifications.map((notification) => (
                      <button
                        key={notification.id}
                        type="button"
                        className={notification.read ? "is-read" : ""}
                        onClick={() => openNotification(notification)}
                      >
                        <span>{notification.read ? <CheckCircle2 /> : <BellRing />}</span>
                        <p><strong>{notification.title}</strong><small>{notification.detail}</small></p>
                        <ChevronRight />
                      </button>
                    ))}
                  </div>
                  <footer>
                    <button type="button" onClick={openSavedSelection}>
                      <Bookmark /> Ma sélection <b>{savedItems.length}</b>
                    </button>
                  </footer>
                </section>
              ) : null}
            </div>
            {canPublish ? (
              <>
                <button
                  type="button"
                  className="shorts-create-button scene-topbar-publish"
                  aria-label="Publier une vidéo dans La Scène"
                  aria-haspopup="dialog"
                  onClick={() => {
                    setCreateOpen(true);
                    setNotificationsOpen(false);
                    setOpenMenuId(null);
                  }}
                >
                  <Plus />
                  <span>Publier</span>
                </button>
                <button
                  type="button"
                  className={`shorts-create-button scene-topbar-studio${isCreatorStudioRoute ? " is-active" : ""}`}
                  aria-label="Ouvrir Mon Studio La Scène"
                  aria-current={isCreatorStudioRoute ? "page" : undefined}
                  onClick={() => navigate(SCENE_STUDIO_ROUTE)}
                >
                  <LayoutDashboard />
                  <span>Mon Studio</span>
                  <b aria-label="3 actions à traiter">3</b>
                </button>
              </>
            ) : null}
          </div>
        </header>


        {watchRoute && <div className="scene-watch-menu-space" aria-hidden="true" />}
      {!showBrowseNavigation && watchMenuOpen && <SceneWatchMenu onClose={closeWatchMenu}>
          <SceneBrowseNavigation active={browseActive} subscriptions={subscriptions} canPublish={canPublish} onNavigate={() => setWatchMenuKey(null)} />
        </SceneWatchMenu>}
        {showBrowseNavigation && <>
          <SceneBrowseNavigation active={browseActive} subscriptions={subscriptions} canPublish={canPublish} onNavigate={() => { if (window.innerWidth <= 1100) setBrowseMenuOpen(false); }} />
          <SceneBrowseChips>
            <button aria-pressed={activeTab === "home" && activeFilterCount === 0 && !profileArtistReference && !showHistoryOnly && !showSavedOnly} onClick={() => showTab("home")}>Tous</button>
            {SCENE_CONTENT_TYPE_OPTIONS.map((option) => <button key={option.id} aria-pressed={filters.contentTypes.length === 1 && filters.contentTypes[0] === option.id} onClick={() => commitSceneFilters({ ...getSceneDefaultFilters(false), contentTypes: [option.id] })}>{option.label}</button>)}
            {SCENE_STYLE_OPTIONS.filter(({ id }) => ["rap", "rnb", "jazz", "pop", "rock", "electro", "soul"].includes(id)).map((option) => <button key={option.id} aria-pressed={filters.styles.length === 1 && filters.styles[0] === option.id} onClick={() => commitSceneFilters({ ...getSceneDefaultFilters(false), styles: [option.id] })}>{option.label}</button>)}
            <button aria-pressed={filters.sort === "recent"} onClick={() => commitSceneFilters({ ...getSceneDefaultFilters(false), sort: "recent" })}>Publiées récemment</button>
            <button aria-pressed={showHistoryOnly} onClick={openWatchHistory}>Regardées</button>
          </SceneBrowseChips>
        </>}

        {watchRoute && !selectedVideo && <section className="scene-watch-unavailable" aria-live="polite"><h1>{catalogLoading ? "Chargement de la vidéo…" : "Cette vidéo n’est pas disponible."}</h1>{!catalogLoading && <><p>Elle est inaccessible ou absente du catalogue public.</p><button onClick={() => setCatalogAttempt((value) => value + 1)}>Réessayer</button><a href={SCENE_ROUTE}>Retour à La Scène</a></>}</section>}
        <section
          id="shorts-top"
          className="shorts-home"
          aria-label="Vidéos musicales de La Scène"
          onScroll={(event) => markPageScrolling(event.currentTarget)}
        >
          <div className="shorts-home__content">
            {activeTab !== "tv"
              && !isCreatorStudioRoute
              && !isPlaylistsRoute
              && !isRecommendationSettingsRoute ? (
              <>
                <section
                  className={`shorts-contentbar scene-contentbar${activeTab === "explore" ? " is-explore" : ""}`}
                  aria-label="Rechercher dans La Scène"
                >

                  {activeTab === "explore" ? (
                    <div className="scene-explore__compact-controls">
                      <div className="scene-explore__media-tabs" role="group" aria-label="Format des créations">
                        <button
                          type="button"
                          aria-pressed={exploreMediaMode === "landscape"}
                          onClick={() => selectExploreMediaMode("landscape")}
                        >
                          Vidéos
                        </button>
                        <button
                          type="button"
                          aria-pressed={exploreMediaMode === "vertical"}
                          onClick={() => selectExploreMediaMode("vertical")}
                        >
                          Short
                        </button>
                      </div>
                      {exploreMediaMode === "landscape" ? (
                        <nav className="scene-explore__editorial-tabs" aria-label="Sélections éditoriales">
                          {SCENE_EXPLORE_QUICK_CONTENT_TYPES.map((contentType) => {
                            const option = SCENE_CONTENT_TYPE_OPTIONS.find(({ id }) => id === contentType);
                            if (!option) return null;
                            const active = filters.contentTypes.length === 1 && filters.contentTypes[0] === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => toggleExploreEditorialType(option.id)}
                              >
                                {contentType === "room-replay" ? "Replay" : "Originals"}
                              </button>
                            );
                          })}
                        </nav>
                      ) : null}
                      <span className="scene-explore__result-count">
                        {normalizedQuery
                          ? (exploreMediaMode === "vertical" ? verticalSearchResults.length : visibleSearchResults.length)
                          : exploreCatalogVideos.length} créations
                      </span>
                      <label className="scene-explore__sort-control">
                        <span className="sr-only">Trier les créations</span>
                        <select
                          value={filters.sort}
                          aria-label="Trier les créations"
                          onChange={(event) => commitSceneFilters({
                            ...filters,
                            sort: event.target.value as SceneSort,
                          })}
                        >
                          {SCENE_SORT_OPTIONS
                            .filter(({ id }) => exploreMediaMode !== "vertical" || id !== "for-you")
                            .map(({ id, label }) => (
                            <option key={id} value={id}>{label}</option>
                            ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <MeewavActiveFilterChips filters={activeSceneFilterChips} onClear={clearFilters} />
                </section>
                {activeTab === "explore" && exploreMediaMode === "vertical" ? (
                  <nav className="scene-vertical-collection__filters" aria-label="Filtrer les Shorts">
                    {SCENE_VERTICAL_QUICK_FILTERS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={verticalQuickFilter === option.id}
                        onClick={() => {
                          setVerticalQuickFilter(option.id);
                          writeRouteState({ verticalType: option.id === "all" ? null : option.id }, true);
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </nav>
                ) : null}
              </>
            ) : null}

            {isCreatorStudioRoute ? (
              <SceneCreatorStudio
                pathname={location.pathname}
                onNavigate={(path) => navigate(path)}
                onPublish={() => setCreateOpen(true)}
              />
            ) : isPlaylistsRoute ? (
              <ScenePlaylistsView
                videos={allVideos}
                selectedPlaylistId={selectedPlaylistRouteId}
                onSelectPlaylist={(playlistId) => navigate(getScenePlaylistPath(playlistId), {
                  state: location.state,
                })}
                onPlay={(videoId, playlist) => {
                  const video = videoById.get(videoId);
                  if (video) { if (playlist) playbackQueue.startPlaylist(playlist.id, playlist.title, playlist.videoIds, videoId); openVideo(video); }
                  else notify("Cette vidéo n’est plus disponible dans le catalogue.");
                }}
                onBack={closeStandaloneSceneView}
                onNotify={notify}
              />
            ) : isRecommendationSettingsRoute ? (
              <SceneRecommendationSettings onBack={closeStandaloneSceneView} />
            ) : activeTab === "tv" ? (
              <div className="scene-tv-page">
                <SceneTvSchedule onPlayVideo={playTvVideo} onOpenRoom={openTvRoom} />
              </div>
            ) : profileArtistReference ? (
              <section className="shorts-search-results" aria-live="polite">
                <SectionHeading
                  eyebrow="Profil artiste"
                  title={profileArtistVideos.length > 0
                    ? `Les créations de ${profileArtistVideos[0].artist}`
                    : "Aucune création publique reliée à ce profil"}
                  description={profileArtistVideos.length > 0
                    ? "Les créations publiques associées à ce profil, sans lecture automatique."
                    : "Ce profil est bien sélectionné, mais La Scène ne dispose pas encore d’une publication publique pour cet identifiant."}
                  actionLabel="Toutes les vidéos"
                  onSeeAll={() => writeRouteState({ artist: null }, true)}
                />
                {profileArtistVideos.length > 0 ? (
                  <div className="shorts-wall__grid">
                    {profileArtistVideos.map((item) => (
                      <VideoCard
                        key={item.id}
                        item={item}
                        onSelect={openVideo}
                        isSaved={savedIds.has(item.id)}
                        menuOpen={openMenuId === item.id}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <UserRound aria-hidden="true" />
                    <strong>Aucune vidéo publiée pour ce profil</strong>
                    <span>Les médias du profil ne sont visibles ici qu’après leur publication dans La Scène.</span>
                    <button type="button" onClick={() => writeRouteState({ artist: null }, true)}>Explorer La Scène</button>
                  </div>
                )}
              </section>
            ) : normalizedQuery ? (
              <section
                className={`shorts-search-results${activeTab === "explore" && exploreMediaMode === "vertical" ? " scene-vertical-search-results" : ""}`}
                aria-live="polite"
              >
                <SectionHeading
                  eyebrow={activeTab === "explore" && exploreMediaMode === "vertical" ? "Shorts" : "Recherche"}
                  title={activeTab === "explore" && exploreMediaMode === "vertical"
                    ? `${verticalSearchResults.length}${searchHasMore ? "+" : ""} création${verticalSearchResults.length > 1 ? "s" : ""} pour « ${searchQuery.trim()} »`
                    : searchLabel}
                  description={activeTab === "explore" && exploreMediaMode === "vertical"
                    ? "Créations pensées pour un écran 9:16."
                    : "Chaque résultat peut mener au profil de l’artiste ou à une proposition de collaboration."}
                  actionLabel="Effacer"
                  onSeeAll={() => updateSearchQuery("")}
                />
                {(activeTab === "explore" && exploreMediaMode === "vertical"
                  ? verticalSearchResults.length > 0
                  : visibleSearchResults.length > 0) ? (
                  <div className={`shorts-wall__grid${activeTab === "explore" ? ` scene-explore__catalog is-${exploreMediaMode}` : ""}`}>
                    {(activeTab === "explore" && exploreMediaMode === "vertical"
                      ? verticalSearchResults
                      : visibleSearchResults).map((item) => (
                      activeTab === "explore" && exploreMediaMode === "vertical" ? (
                        <VerticalMediaCard
                          key={item.id}
                          item={item}
                          isSaved={savedIds.has(item.id)}
                          menuOpen={openMenuId === item.id}
                          publishedLabel={scenePublishedLabel(item)}
                          progressPercent={historyProgressById.get(item.id)}
                          onSelect={openVideo}
                          onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                          onToggleSaved={toggleSaved}
                          onShare={(video) => void shareVideo(video)}
                          onViewProfile={viewProfile}
                          actions={cardActions}
                        />
                      ) : (
                        <VideoCard
                          key={item.id}
                          item={item}
                          onSelect={openVideo}
                          isSaved={savedIds.has(item.id)}
                          menuOpen={openMenuId === item.id}
                          onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                          onToggleSaved={toggleSaved}
                          onShare={(video) => void shareVideo(video)}
                          onViewProfile={viewProfile}
                          actions={cardActions}
                        />
                      )
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <Search />
                    <strong>{remoteSearch.loading && !demoScene ? "Recherche en cours…" : activeTab === "following" ? "Aucun résultat parmi tes suivis" : "Aucune vidéo trouvée"}</strong>
                    <span>{activeTab === "following"
                      ? "Essaie un autre titre ou retrouve tout le catalogue dans Explorer."
                      : "Essaie un titre, un artiste, un style ou une ville."}</span>
                  </div>
                )}
                {!demoScene && remoteSearch.query === searchQuery.trim() && remoteSearch.error && <p role="status">{remoteSearch.error}</p>}
                {!demoScene && remoteSearch.query === searchQuery.trim() && remoteSearch.hasMore && <button type="button" onClick={() => void loadMoreSceneSearch()} disabled={remoteSearch.loading}>{remoteSearch.loading ? "Chargement…" : "Voir plus de résultats"}</button>}
              </section>
            ) : showHistoryOnly ? (
              <section className="shorts-search-results" aria-live="polite">
                <SectionHeading
                  eyebrow="Ton historique"
                  title="Vidéos regardées"
                  description="Reprends une vidéo ou retrouve les publications déjà terminées."
                  actionLabel="Explorer les vidéos"
                  onSeeAll={() => showTab("home")}
                />
                {historyItems.length > 0 ? (
                  <div className="shorts-wall__grid">
                    {historyItems.map((item) => (
                      <VideoCard
                        key={item.id}
                        item={item}
                        onSelect={openVideo}
                        isSaved={savedIds.has(item.id)}
                        menuOpen={openMenuId === item.id}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                        progressPercent={historyProgressById.get(item.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <Play aria-hidden="true" />
                    <strong>Aucune lecture enregistrée</strong>
                    <span>Les vidéos commencées apparaîtront ici automatiquement.</span>
                    <button type="button" onClick={() => showTab("home")}>Découvrir les vidéos</button>
                  </div>
                )}
              </section>
            ) : showSavedOnly ? (
              <section className="shorts-search-results" aria-live="polite">
                <SectionHeading
                  eyebrow="Ton espace"
                  title="Ma sélection"
                  description="Les vidéos gardées pour collaborer ou simplement reprendre leur lecture."
                  actionLabel="Explorer les vidéos"
                  onSeeAll={() => showTab("home")}
                />
                {savedItems.length > 0 ? (
                  <div className="shorts-wall__grid">
                    {savedItems.map((item) => (
                      <VideoCard
                        key={item.id}
                        item={item}
                        onSelect={openVideo}
                        isSaved
                        menuOpen={openMenuId === item.id}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <Bookmark />
                    <strong>Ta sélection est encore vide</strong>
                    <span>Ouvre le menu d’une carte ou le lecteur pour conserver une vidéo.</span>
                  </div>
                )}
              </section>
            ) : activeFilterCount > 0 && activeTab !== "explore" ? (
              <section className="shorts-search-results" aria-live="polite">
                <SectionHeading
                  eyebrow="Découverte affinée"
                  title={`${visibleFilteredVideos.length} résultat${visibleFilteredVideos.length > 1 ? "s" : ""}`}
                  description="Les critères sont combinés sans transformer la popularité en classement par défaut."
                  actionLabel="Réinitialiser"
                  onSeeAll={clearFilters}
                />
                {visibleFilteredVideos.length > 0 ? (
                  <div className="shorts-wall__grid">
                    {visibleFilteredVideos.map((item) => (
                      <VideoCard
                        key={item.id}
                        item={item}
                        onSelect={openVideo}
                        isSaved={savedIds.has(item.id)}
                        menuOpen={openMenuId === item.id}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <Search />
                    <strong>Aucune vidéo ne correspond à ces critères</strong>
                    <span>Élargis la zone ou retire un critère pour relancer la découverte.</span>
                    <button type="button" onClick={clearFilters}>Réinitialiser les filtres</button>
                  </div>
                )}
              </section>
            ) : activeTab === "following" ? (
              <section className="shorts-search-results scene-following" aria-labelledby="scene-following-title">
                <header className="scene-following__header">
                  <div>
                    <span>SUIVIS</span>
                    <h2 id="scene-following-title">Les nouveautés des artistes que tu suis</h2>
                    <p>Retrouve leurs dernières publications, de la plus récente à la plus ancienne.</p>
                  </div>
                  <div className="scene-following__summary" aria-label={`${unseenFollowingCount} nouvelles vidéos`}>
                    <strong>{unseenFollowingCount}</strong>
                    <span>nouvelle{unseenFollowingCount > 1 ? "s" : ""}</span>
                    <small>Plus récent → plus ancien</small>
                  </div>
                </header>
                <nav className="scene-following__filters" aria-label="Filtrer les publications suivies">
                  {SCENE_FOLLOWING_FILTERS.map((filter) => (
                    <button
                      key={filter.id}
                      type="button"
                      aria-pressed={followingFilter === filter.id}
                      onClick={() => setFollowingFilter(filter.id)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </nav>
                {followingGroups.length > 0 ? (
                  <div className="scene-following__timeline">
                    {followingGroups.map((group) => (
                      <section key={group.id} className="scene-following__group" aria-labelledby={`scene-following-${group.id}`}>
                        <header>
                          <h3 id={`scene-following-${group.id}`}>{group.title}</h3>
                          <span>{group.items.length} vidéo{group.items.length > 1 ? "s" : ""}</span>
                        </header>
                        {group.shorts.length > 0 ? (
                          <div className="scene-following__shorts">
                            <div className="scene-following__format-heading"><strong>Shorts</strong><span>{group.shorts.length}</span></div>
                            <div className="scene-following__short-grid">
                              {group.shorts.map((item) => (
                                <VerticalMediaCard
                                  key={item.id}
                                  item={item}
                                  onSelect={openVideo}
                                  isSaved={savedIds.has(item.id)}
                                  menuOpen={openMenuId === item.id}
                                  onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                                  onToggleSaved={toggleSaved}
                                  onShare={(video) => void shareVideo(video)}
                                  onViewProfile={viewProfile}
                                  actions={cardActions}
                                  progressPercent={historyProgressById.get(item.id)}
                                  publishedLabel={scenePublishedLabelFromTimestamp(publishedAtById.get(item.id) ?? 0, sceneNow)}
                                />
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {group.videos.length > 0 ? (
                          <div className="shorts-wall__grid">
                          {group.videos.map((item) => {
                            const progress = historyProgressById.get(item.id);
                            const viewingState = typeof progress !== "number"
                              ? "Non vue" as const
                              : progress >= 95
                                ? "Vue" as const
                                : "À reprendre" as const;
                            return (
                              <VideoCard
                                key={item.id}
                                item={item}
                                onSelect={openVideo}
                                isSaved={savedIds.has(item.id)}
                                menuOpen={openMenuId === item.id}
                                onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                                onToggleSaved={toggleSaved}
                                onShare={(video) => void shareVideo(video)}
                                onViewProfile={viewProfile}
                                actions={cardActions}
                                progressPercent={progress}
                                viewingState={viewingState}
                                publishedLabel={scenePublishedLabelFromTimestamp(publishedAtById.get(item.id) ?? 0, sceneNow)}
                              />
                            );
                          })}
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="shorts-search-results__empty">
                    <Heart aria-hidden="true" />
                    <strong>{followingFeedVideos.length === 0
                      ? "Aucune publication récente"
                      : followingFilter === "unseen"
                        ? "Tu as vu toutes les publications"
                        : followingFilter === "today"
                          ? "Rien de nouveau aujourd’hui"
                          : "Aucune publication cette semaine"}</strong>
                    <span>{followingFeedVideos.length === 0
                      ? "Suis gratuitement des artistes depuis leur profil pour les retrouver ici."
                      : "Choisis Tout pour retrouver l’ensemble des publications."}</span>
                    <button type="button" onClick={() => (
                      followingFeedVideos.length === 0 ? showTab("explore") : setFollowingFilter("all")
                    )}>
                      {followingFeedVideos.length === 0 ? "Explorer les vidéos" : "Afficher tout"}
                    </button>
                  </div>
                )}
              </section>
            ) : activeTab === "explore" && !activeWall ? (
              <section
                className={`shorts-search-results scene-explore${exploreMediaMode === "vertical" ? " is-vertical-collection" : ""}`}
                aria-labelledby="scene-explore-title"
              >
                <header className="scene-explore__header scene-explore__header--compact">
                  <div>
                    <h2 id="scene-explore-title">
                      {searchParams.get("liked") === "1" ? "Vidéos J’aime" : exploreMediaMode === "vertical" ? "Shorts" : "Explore toute La Scène."}
                    </h2>
                    <p>{exploreMediaMode === "vertical"
                      ? "Créations pensées pour un écran 9:16."
                      : "Clips, performances, sessions et créations longues, pensés pour le grand écran."}</p>
                  </div>
                  {exploreMediaMode === "landscape" ? (
                    <div className="scene-explore__meta">
                      <div className="scene-explore__view-switch" role="group" aria-label="Disposition des vidéos">
                      <button
                        type="button"
                        aria-label="Vue grille"
                        aria-pressed={exploreView === "grid"}
                        title="Vue grille"
                        onClick={() => setExploreView("grid")}
                      >
                        <Grid2X2 aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="Vue compacte"
                        aria-pressed={exploreView === "compact"}
                        title="Vue compacte"
                        onClick={() => setExploreView("compact")}
                      >
                        <Rows3 aria-hidden="true" />
                      </button>
                      </div>
                    </div>
                  ) : null}
                </header>
                <div className={`shorts-wall__grid scene-explore__catalog is-${exploreMediaMode} is-${exploreView}`}>
                  {exploreRenderedVideos.map((item) => (
                    exploreMediaMode === "vertical" ? (
                      <VerticalMediaCard
                        key={item.id}
                        item={item}
                        isSaved={savedIds.has(item.id)}
                        menuOpen={openMenuId === item.id}
                        publishedLabel={scenePublishedLabel(item)}
                        progressPercent={historyProgressById.get(item.id)}
                        onSelect={openVideo}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                      />
                    ) : (
                      <VideoCard
                        key={item.id}
                        item={item}
                        onSelect={openVideo}
                        isSaved={savedIds.has(item.id)}
                        menuOpen={openMenuId === item.id}
                        onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                        onToggleSaved={toggleSaved}
                        onShare={(video) => void shareVideo(video)}
                        onViewProfile={viewProfile}
                        actions={cardActions}
                      />
                    )
                  ))}
                </div>
                {exploreCatalogVideos.length === 0 && <div className="shorts-search-results__empty"><Heart aria-hidden="true" /><strong>{searchParams.get("liked") === "1" ? "Aucune vidéo aimée pour le moment" : "Aucune vidéo ne correspond à ces critères"}</strong><span>{searchParams.get("liked") === "1" ? "Les vidéos auxquelles tu donnes un J’aime apparaîtront ici." : "Essaie une autre catégorie ou retrouve toutes les vidéos."}</span><button onClick={() => showTab("home")}>Découvrir les vidéos</button></div>}
                <div
                  ref={exploreLoadMoreRef}
                  className="scene-explore__progress"
                  role="status"
                  aria-live="polite"
                >
                  <span>
                    {exploreRenderedCount} sur {exploreCatalogVideos.length} créations
                  </span>
                  <i aria-hidden="true">
                    <b style={{ width: `${Math.min(100, (exploreRenderedCount / Math.max(1, exploreCatalogVideos.length)) * 100)}%` }} />
                  </i>
                  {(exploreMediaMode !== "vertical" && exploreVisibleCount < exploreCatalogVideos.length) || catalogHasMore ? (
                    <button
                      type="button"
                      disabled={catalogLoadingMore}
                      onClick={() => {
                        if (exploreMediaMode !== "vertical" && exploreVisibleCount < exploreCatalogVideos.length) {
                          setExploreVisibleCount((current) => Math.min(current + SCENE_EXPLORE_BATCH_SIZE, exploreCatalogVideos.length));
                        } else void loadMoreSceneCatalog();
                      }}
                    >
                      {catalogLoadingMore ? "Chargement…" : "Charger la suite"} <ChevronRight />
                    </button>
                  ) : (
                    <small>{exploreMediaMode === "vertical"
                      ? "Tous les Shorts sont affichés."
                      : "Tu as parcouru tout le catalogue grand écran."}</small>
                  )}
                </div>
              </section>
            ) : activeWallDefinition ? (
              <ShortsWall
                wall={activeWallDefinition}
                onBack={() => showTab("home")}
                onSelect={openVideo}
                savedIds={savedIds}
                openMenuId={openMenuId}
                onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                onToggleSaved={toggleSaved}
                onShare={(video) => void shareVideo(video)}
                onViewProfile={viewProfile}
                actions={cardActions}
              />
            ) : (
              <>
                <SceneHomeFeed
                  videos={browseHomeVideos}
                  shorts={browseShorts}
                  renderVideo={(item) => <VideoCard
                    key={item.id} item={item} onSelect={openVideo}
                    isSaved={savedIds.has(item.id)} menuOpen={openMenuId === item.id}
                    onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                    onToggleSaved={toggleSaved} onShare={(video) => void shareVideo(video)}
                    onViewProfile={viewProfile} actions={cardActions}
                    progressPercent={historyProgressById.get(item.id)} publishedLabel={scenePublishedLabel(item)}
                  />}
                  renderShort={(item) => <VerticalMediaCard
                    key={item.id} item={item} onSelect={openVideo}
                    isSaved={savedIds.has(item.id)} menuOpen={openMenuId === item.id}
                    onToggleMenu={(video) => setOpenMenuId((current) => current === video.id ? null : video.id)}
                    onToggleSaved={toggleSaved} onShare={(video) => void shareVideo(video)}
                    onViewProfile={viewProfile} actions={cardActions}
                    progressPercent={historyProgressById.get(item.id)} publishedLabel={scenePublishedLabel(item)}
                  />}
                />
              </>
            )}
          </div>
        </section>
      </div>

      <MeewavFilterPanel
        open={filtersOpen}
        panelId="scene-filter-panel"
        eyebrow="La Scène"
        title={exploreMediaMode === "vertical" ? "Affiner les Shorts" : "Affiner les vidéos"}
        description={exploreMediaMode === "vertical"
          ? "Le format 9:16 est déjà sélectionné. Ajoute seulement les critères utiles."
          : "Choisis un format, un univers ou une durée. La pertinence reste prioritaire."}
        triggerRef={filterTriggerRef}
        belowHeader
        leftBoundarySelector=".shorts-primary-rail"
        onClose={() => {
          setDraftFilters(filters);
          setDraftVerticalDurationFilter(verticalDurationFilter);
          setDraftVerticalFollowedOnly(verticalFollowedOnly);
          setFiltersOpen(false);
        }}
        onReset={() => {
          setDraftFilters({ ...getSceneDefaultFilters(false), query: searchQuery });
          setDraftVerticalDurationFilter("all");
          setDraftVerticalFollowedOnly(false);
        }}
        onApply={applyFilters}
        applyLabel={`Afficher ${draftResultCount} contenu${draftResultCount > 1 ? "s" : ""}`}
        selectionHint={`${draftResultCount.toLocaleString("fr-FR")} vidéo${draftResultCount > 1 ? "s" : ""} correspond${draftResultCount > 1 ? "ent" : ""} aux critères.`}
      >
        {activeTab === "explore" && exploreMediaMode === "vertical" ? (
          <MeewavFilterSection label="Format" summary="Short · 9:16">
            <div className="meewav-filter-choice-grid scene-filter-choice-grid">
              <button type="button" className="meewav-filter-choice is-active" aria-pressed="true">
                Short · 9:16
              </button>
            </div>
          </MeewavFilterSection>
        ) : null}

        <MeewavFilterSection label="Grade MeeWav" summary={draftFilters.grades.length > 0 ? `${draftFilters.grades.length} sélectionné${draftFilters.grades.length > 1 ? "s" : ""}` : "Tous"}>
          <div className="artist-filter-panel__options artist-filter-panel__options--grades">
            {SCENE_GRADE_OPTIONS.map(({ id, label }) => {
              const active = draftFilters.grades.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`artist-filter-grade${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => setDraftFilters((current) => ({
                    ...current,
                    grades: toggleSceneFilterValue(current.grades, id),
                  }))}
                >
                  <MeewavGradeBadge level={id} size="sm" variant="icon" />
                  <span><strong>{label}</strong><small>Niveau {id}</small></span>
                </button>
              );
            })}
          </div>
        </MeewavFilterSection>

        <MeewavFilterSection
          label="Styles d’avatar"
          summary={draftFilters.artistRoles.length > 0 ? `${draftFilters.artistRoles.length} sélectionné${draftFilters.artistRoles.length > 1 ? "s" : ""}` : "Tous"}
        >
          <MeewavIllustratedFilterGrid
            ariaLabel="Sélection multiple des styles d’avatar"
            options={sceneArtistRoleFilterOptions}
            selectedIds={draftFilters.artistRoles}
            onToggle={(key: SceneArtistRole) => setDraftFilters((current) => ({
              ...current,
              artistRoles: toggleSceneFilterValue<SceneArtistRole>(current.artistRoles, key),
            }))}
          />
        </MeewavFilterSection>

        {activeTab === "explore" && exploreMediaMode === "vertical" ? null : (
          <MeewavFilterSection
            label="Type de contenu"
            summary={draftFilters.contentTypes.length > 0 ? `${draftFilters.contentTypes.length} sélectionné${draftFilters.contentTypes.length > 1 ? "s" : ""}` : "Tous"}
          >
            <div className="meewav-filter-choice-grid scene-filter-choice-grid">
              {SCENE_CONTENT_TYPE_OPTIONS.map(({ id, label }) => {
                const active = draftFilters.contentTypes.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`meewav-filter-choice${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setDraftFilters((current) => ({
                      ...current,
                      contentTypes: toggleSceneFilterValue<SceneContentType>(current.contentTypes, id),
                    }))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </MeewavFilterSection>
        )}

        <MeewavFilterSection
          label="Style musical"
          summary={draftFilters.styles.length > 0 ? `${draftFilters.styles.length} sélectionné${draftFilters.styles.length > 1 ? "s" : ""}` : "Tous"}
        >
          <div className="meewav-filter-choice-grid scene-filter-choice-grid" role="group" aria-label="Sélection multiple des styles musicaux">
            {SCENE_STYLE_OPTIONS.map(({ id, label }) => {
              const active = draftFilters.styles.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`meewav-filter-choice${active ? " is-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => setDraftFilters((current) => ({
                    ...current,
                    styles: toggleSceneFilterValue<SceneStyle>(current.styles, id),
                  }))}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </MeewavFilterSection>

        {activeTab === "explore" && exploreMediaMode === "vertical" ? (
          <MeewavFilterSection
            label="Durée"
            summary={SCENE_VERTICAL_DURATION_FILTERS.find(({ id }) => id === draftVerticalDurationFilter)?.label}
          >
            <div className="meewav-filter-choice-grid scene-filter-choice-grid">
              {SCENE_VERTICAL_DURATION_FILTERS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  className={`meewav-filter-choice${draftVerticalDurationFilter === id ? " is-active" : ""}`}
                  aria-pressed={draftVerticalDurationFilter === id}
                  onClick={() => setDraftVerticalDurationFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </MeewavFilterSection>
        ) : (
          <MeewavFilterSection label="Durée" summary={draftFilters.durations.length > 0 ? `${draftFilters.durations.length} sélectionnée${draftFilters.durations.length > 1 ? "s" : ""}` : "Toutes"}>
            <div className="meewav-filter-choice-grid scene-filter-choice-grid">
              {SCENE_DURATION_OPTIONS.map(({ id, label }) => {
                const active = draftFilters.durations.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`meewav-filter-choice${active ? " is-active" : ""}`}
                    aria-pressed={active}
                    onClick={() => setDraftFilters((current) => ({
                      ...current,
                      durations: toggleSceneFilterValue<SceneDuration>(current.durations, id),
                    }))}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </MeewavFilterSection>
        )}

        {activeTab === "explore" && exploreMediaMode === "vertical" ? (
          <MeewavFilterSection label="Artistes suivis" summary={draftVerticalFollowedOnly ? "Uniquement" : "Tous les artistes"}>
            <div className="meewav-filter-choice-grid scene-filter-choice-grid">
              <button
                type="button"
                className={`meewav-filter-choice${draftVerticalFollowedOnly ? " is-active" : ""}`}
                aria-pressed={draftVerticalFollowedOnly}
                onClick={() => setDraftVerticalFollowedOnly((current) => !current)}
              >
                Afficher uniquement les artistes suivis
              </button>
            </div>
          </MeewavFilterSection>
        ) : null}

        <MeewavFilterSection label="Localisation" summary={draftFilters.city || draftFilters.country || "Partout"}>
          <div className="tremplin-wall-filter-fields scene-filter-fields">
            <label className="meewav-filter-field">
              <span>Pays</span>
              <select value={draftFilters.country} onChange={(event) => setDraftFilters((current) => ({ ...current, country: event.target.value }))}>
                <option value="">Tous les pays</option>
                {sceneCountries.map((country) => <option key={country} value={country}>{country}</option>)}
              </select>
            </label>
            <label className="meewav-filter-field">
              <span>Ville</span>
              <select value={draftFilters.city} onChange={(event) => setDraftFilters((current) => ({ ...current, city: event.target.value }))}>
                <option value="">Toutes les villes</option>
                {sceneCities.map((city) => <option key={city} value={city}>{city}</option>)}
              </select>
            </label>
          </div>
        </MeewavFilterSection>

        <MeewavFilterSection label="Date" summary={SCENE_DATE_OPTIONS.find(({ id }) => id === draftFilters.date)?.label}>
          <div className="meewav-filter-choice-grid scene-filter-choice-grid">
            {SCENE_DATE_OPTIONS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`meewav-filter-choice${draftFilters.date === id ? " is-active" : ""}`}
                aria-pressed={draftFilters.date === id}
                onClick={() => setDraftFilters((current) => ({ ...current, date: id as SceneDate }))}
              >
                {label}
              </button>
            ))}
          </div>
        </MeewavFilterSection>

        <MeewavFilterSection label="Tri" summary={SCENE_SORT_OPTIONS.find(({ id }) => id === draftFilters.sort)?.label}>
          <div className="meewav-filter-choice-grid scene-filter-choice-grid">
            {SCENE_SORT_OPTIONS
              .filter(({ id }) => exploreMediaMode !== "vertical" || id !== "for-you")
              .map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`meewav-filter-choice${draftFilters.sort === id ? " is-active" : ""}`}
                aria-pressed={draftFilters.sort === id}
                onClick={() => setDraftFilters((current) => ({ ...current, sort: id as SceneSort }))}
              >
                {label}
              </button>
              ))}
          </div>
        </MeewavFilterSection>
      </MeewavFilterPanel>

      {selectedVideo ? (
        <SceneVideoPlayback
          key={selectedVideo.id}
          presentation={selectedVideo.format !== "portrait" && selectedVideo.presentationFormat !== "vertical" ? "watch" : "modal"}
          collapsed={selectedVideo.format !== "portrait" && selectedVideo.presentationFormat !== "vertical" ? !watchRoute : undefined}
          onMiniplayerChange={(collapsed) => collapsed ? navigate(SCENE_ROUTE) : openVideo(selectedVideo)}
          watchContent={(onSeek) => <SceneCommentsSection key={selectedVideo.id} videoId={selectedVideo.id} targetCommentId={searchParams.get("comment")} demo={isLocalAuthPreviewEnabled() && !resolveSceneCanonicalProfileId(selectedVideo)} onSeek={onSeek} />}
          recommendations={<SceneWatchSidebar key={selectedVideo.id} current={selectedVideo} items={allVideos} queue={playbackQueue} onPlay={openVideo} nextSource={automaticNext?.source} nextTitle={allVideos.find((video) => video.id === automaticNext?.id)?.title} onSave={toggleSaved} savedIds={savedIds} onPreferencesChange={() => setRecommendationRevision((value) => value + 1)} countdown={autoplayCountdown} onCancelAutoplay={() => setAutoplayCountdown(null)} />}
          item={{
            ...selectedVideo,
            likeCount: likeCountFor(selectedVideo),
            goldenLikeCount: goldenLikeCountFor(selectedVideo),
          }}
          previousItem={previousVerticalVideo}
          repeatCurrent={automaticNext?.source === "répétition" && !verticalRoute}
          nextItem={nextVerticalVideo ?? nextWatchVideo}
          verticalPosition={selectedVerticalIndex >= 0
            ? { index: selectedVerticalIndex + 1, total: verticalPlaylist.length }
            : undefined}
          isSaved={savedIds.has(selectedVideo.id)}
          liked={isLiked(selectedVideo)}
          goldenGiven={hasGoldenLike(selectedVideo)}
          goldenBurst={goldenBurstVideoId === selectedVideo.id}
          goldenUnavailable={goldenUnavailableFor(selectedVideo)}
          initialTime={initialWatchTime(searchParams.get("t"), watchHistory.find((entry) => entry.videoId === selectedVideo.id))}
          onClose={closeVideo}
          onNotify={notify}
          onToggleSaved={() => toggleSaved(selectedVideo)}
          onToggleLike={() => toggleLike(selectedVideo)}
          onGiveGoldenLike={() => askForGoldenLike(selectedVideo)}
          onContact={() => contactArtist(selectedVideo)}
          onCollaborate={selectedVideo.collabAvailable
            ? () => proposeCollaboration(selectedVideo)
            : undefined}
          artistHref={sceneArtistHref(selectedVideo)}
          onViewProfile={() => viewProfile(selectedVideo)}
          following={followedArtistIds.has(resolveSceneCanonicalProfileId(selectedVideo) ?? selectedVideo.artistId)}
          followPending={followPending}
          onToggleFollow={() => void toggleWatchFollow()}
          onShare={() => void shareVideo(selectedVideo)}
          canEditInfo={publishedItems.some((item) => item.id === selectedVideo.id) || Boolean(user?.id && (selectedVideo.artistId === user.id || selectedVideo.profileId === user.id))}
          onUpdateInfo={updateSelectedShortInfo}
          onPrevious={previousVerticalVideo
            ? () => continueVerticalPlayback(previousVerticalVideo)
            : undefined}
          onNext={nextVerticalVideo ? () => continueVerticalPlayback(nextVerticalVideo) : manualNext ? () => advanceWatch(manualNext) : undefined}
          onProgress={recordPlaybackProgress}
          onCompleted={(progress) => { recordPlaybackCompleted(progress); if (automaticNext && !verticalRoute && canAdvancePlayback()) setAutoplayCountdown(5); }}
        />
      ) : null}

      {pendingGoldenLike ? <GoldenLikeConfirmationDialog
        artistName={pendingGoldenLike.artist}
        pending={goldenLikeSubmitting}
        error={goldenLikeError}
        onClose={cancelGoldenLike}
        onConfirm={() => void submitGoldenLike()}
      /> : null}

      {collaborationItem ? (
        <ShortsCollaborationDialog
          item={collaborationItem}
          onClose={() => setCollaborationItem(null)}
          onSubmitted={handleCollaborationSubmitted}
        />
      ) : null}

      {createOpen && canPublish ? (
        <ShortsCreatorDrawer
          onClose={() => {
            setCreateOpen(false);
            if (isUploadRoute) navigate(SCENE_ROUTE, { replace: true });
          }}
          onNotify={notify}
          onPublish={publishPerformance}
        />
      ) : null}

      {toast ? <div className="shorts-toast" role="status">{toast}</div> : null}

      <span className="sr-only" aria-live="polite">
        {searchQuery ? `Recherche active : ${searchQuery}` : ""}
      </span>
    </main>
  );
}
