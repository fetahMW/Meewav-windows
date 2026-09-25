import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  CircleDot,
  Copy,
  Eye,
  Headphones,
  MapPin,
  MessageCircle,
  Play,
  Radio,
  Share2,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UsersRound,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import {
  getFollowState,
  getPublicPreProfile,
  getPublishedPreProfileMedia,
  isCanonicalProfileId,
  setFollowState,
  type PublicPreProfile,
  type PublishedPreProfileMedia,
} from "../globe/api/preProfile.api";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import {
  getPreProfileArtistForSeed,
  type PreProfileDemoArtist,
} from "../globe/components/preProfile/demoPreProfileArtist";
import { MON_GLOBE_ROUTE } from "../globe/monGlobeContract";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import {
  getGradeBadgeMeta,
  normalizeOptionalGradeLevel,
  type GradeLevel,
} from "../grades/gradeBadges";
import MeewavTokenIcon from "../tremplin/MeewavTokenIcon";
import { TremplinGradeCard } from "../tremplin/TremplinGradeProgression";
import { SCENE_NAME, SCENE_ROUTE } from "../shorts/sceneContract";
import ShortsCollaborationDialog, {
  type ShortsCollaborationDialogItem,
} from "../shorts/ShortsCollaborationDialog";
import {
  buildMessagingRoute,
  isMessagingUuid,
} from "../messaging/messaging.route";
import {
  resolvePublicProfileViewerFixture,
  type PublicProfileViewerDto,
} from "./profileViewerPublicModel";
import ProfileCertifPublicSummary from "./gifts/ProfileCertifPublicSummary";
import ProfileViewerAudioCard from "./ProfileViewerAudioCard";
import "./profile-viewer.css";

type ViewerMedia = {
  id: string;
  title: string;
  detail: string;
  duration?: string;
  url: string;
  poster?: string;
  credit?: string;
  kind: "audio" | "video" | "image";
};

type ViewerProfile = {
  id: string;
  name: string;
  handle: string;
  role: string;
  location: string;
  bio: string;
  portraitUrl: string;
  portraitFallback: string;
  verified: boolean;
  online: boolean;
  followersLabel: string;
  followingLabel: string;
  grade: GradeLevel | null;
  goldenLikesCount: number;
  collabAvailable: boolean;
  media: ViewerMedia[];
  source: "globe" | "public";
};

type ViewerNavigationState = {
  from?: string;
  artist?: PreProfileDemoArtist;
  isOwner?: boolean;
};

type ProfileHubSection = "overview" | "creations" | "statistics" | "journey";

export type ProfileViewerExperienceProps = {
  profileId: string;
  artist?: PreProfileDemoArtist;
  isOwner?: boolean;
  returnPath?: string;
  presentation?: "page" | "overlay";
  onClose?: () => void;
};

function isDemoArtist(value: unknown): value is PreProfileDemoArtist {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PreProfileDemoArtist>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.portraitUrl === "string"
    && Array.isArray(candidate.audios)
    && Array.isArray(candidate.shorts);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function formatDuration(milliseconds: number | null) {
  if (!milliseconds || milliseconds <= 0) return undefined;
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatMoneyMinor(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Mise à jour indisponible";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  }).format(date);
}

function formatChangeBasisPoints(value: number) {
  const percent = value / 100;
  return `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${Math.abs(percent).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })} %`;
}

function humanizeRole(value: string | null) {
  if (!value) return "Artiste MeeWav";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("fr-FR"));
}

function initialsForName(value: string) {
  const initials = value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("fr-FR");
  return initials || "MW";
}

function demoMedia(artist: PreProfileDemoArtist): ViewerMedia[] {
  return [
    ...artist.audios.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.subtitle,
      duration: item.duration,
      url: item.mediaUrl,
      kind: "audio" as const,
    })),
    ...artist.shorts.map((item) => ({
      id: item.id,
      title: item.title,
      detail: "Vidéo publiée dans La Scène",
      duration: item.duration,
      url: item.mediaUrl,
      poster: item.thumbnailUrl,
      kind: "video" as const,
    })),
  ];
}

function demoFollowingCount(profileId: string) {
  const score = Array.from(profileId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return new Intl.NumberFormat("fr-FR").format(120 + (score % 680));
}

function viewerFromDemo(artist: PreProfileDemoArtist): ViewerProfile {
  return {
    id: artist.id,
    name: artist.name,
    handle: artist.handle || `@${artist.name.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "")}`,
    role: artist.role,
    location: artist.location || "Sur MeeWav",
    bio: artist.bio,
    portraitUrl: artist.portraitUrl,
    portraitFallback: artist.portraitFallback,
    verified: artist.verified,
    online: artist.online,
    followersLabel: artist.followersLabel.replace(/\s+abonnés$/i, ""),
    followingLabel: artist.followingLabel ?? demoFollowingCount(artist.id),
    grade: normalizeOptionalGradeLevel(artist.gradeLevel ?? artist.grade_level ?? artist.gradeStars),
    goldenLikesCount: artist.goldenLikesCount ?? artist.golden_likes_count ?? 0,
    collabAvailable: artist.stats.collabAvailable,
    media: demoMedia(artist),
    source: "globe",
  };
}

function viewerUnavailable(profileId: string): ViewerProfile {
  return {
    id: profileId,
    name: "Profil MeeWav",
    handle: "",
    role: "Artiste",
    location: "",
    bio: "Les informations de ce profil ne sont pas disponibles pour le moment.",
    portraitUrl: "",
    portraitFallback: "MW",
    verified: false,
    online: false,
    followersLabel: "—",
    followingLabel: "—",
    grade: null,
    goldenLikesCount: 0,
    collabAvailable: false,
    media: [],
    source: "public",
  };
}

function mediaFromPublic(items: PublishedPreProfileMedia[]): ViewerMedia[] {
  return items.flatMap((item) => {
    if (!item.file_url) return [];
    const normalizedType = `${item.type} ${item.mime_type ?? ""}`.toLocaleLowerCase("fr-FR");
    const kind: ViewerMedia["kind"] = normalizedType.includes("video")
      ? "video"
      : normalizedType.includes("image")
        ? "image"
        : "audio";
    return [{
      id: item.id,
      title: item.name || "Création MeeWav",
      detail: item.source_pillar ? `Publié depuis ${item.source_pillar}` : "Création publiée",
      duration: formatDuration(item.duration_ms),
      url: item.file_url,
      poster: item.cover_url ?? undefined,
      kind,
    }];
  });
}

function viewerFromPublic(
  publicProfile: PublicPreProfile,
  media: PublishedPreProfileMedia[],
  fallback: ViewerProfile,
): ViewerProfile {
  const name = publicProfile.display_name?.trim() || publicProfile.username?.trim() || fallback.name;
  const username = publicProfile.username?.trim();
  const location = [publicProfile.city, publicProfile.zone_name, publicProfile.country_code]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
    .join(" · ");

  return {
    ...fallback,
    id: publicProfile.id,
    name,
    handle: username ? (username.startsWith("@") ? username : `@${username}`) : fallback.handle,
    role: humanizeRole(publicProfile.primary_role_key),
    location: location || fallback.location,
    bio: publicProfile.bio?.trim() || "Cet artiste n’a pas encore ajouté de présentation publique.",
    portraitUrl: publicProfile.profile_image_url || publicProfile.avatar_url || fallback.portraitUrl,
    portraitFallback: initialsForName(name),
    verified: publicProfile.is_verified,
    online: publicProfile.is_online,
    followersLabel: formatCount(publicProfile.followers_count),
    followingLabel: formatCount(publicProfile.following_count),
    grade: normalizeOptionalGradeLevel(publicProfile.grade),
    goldenLikesCount: publicProfile.golden_likes_count,
    collabAvailable: publicProfile.collab_available,
    media: mediaFromPublic(media),
    source: "public",
  };
}

function getNavigationState(value: unknown): ViewerNavigationState {
  if (!value || typeof value !== "object") return {};
  const state = value as ViewerNavigationState;
  return {
    from: typeof state.from === "string" ? state.from : undefined,
    artist: isDemoArtist(state.artist) ? state.artist : undefined,
    isOwner: state.isOwner === true,
  };
}

function metricCards(stats: NonNullable<PublicProfileViewerDto["stats"]>) {
  return [
    { id: "views", label: "Vues du profil", value: formatCount(stats.profileViews), icon: Eye, tone: "purple" },
    { id: "plays", label: "Lectures publiques", value: formatCount(stats.creationPlays), icon: Play, tone: "pink" },
    { id: "community", label: "Abonnés", value: formatCount(stats.followersCount), icon: UsersRound, tone: "cyan" },
    { id: "updates", label: "Étapes publiées", value: String(stats.projectUpdates), icon: Sparkles, tone: "amber" },
    { id: "collabs", label: "Collaborations publiques", value: String(stats.publicCollaborations), icon: MessageCircle, tone: "green" },
    { id: "rooms", label: "Rooms animées", value: String(stats.roomsHosted), icon: Radio, tone: "blue" },
  ] as const;
}

export function ProfileViewerExperience({
  profileId: profileIdInput,
  artist,
  isOwner = false,
  returnPath = MON_GLOBE_ROUTE,
  presentation = "page",
  onClose,
}: ProfileViewerExperienceProps) {
  const profileId = profileIdInput.trim();
  const navigate = useNavigate();
  const seedArtist = useMemo(
    () => artist ?? getPreProfileArtistForSeed({ profileId }),
    [artist, profileId],
  );
  const canonical = isCanonicalProfileId(profileId);
  const seedProfile = useMemo(() => canonical ? viewerUnavailable(profileId) : viewerFromDemo(seedArtist), [canonical, profileId, seedArtist]);
  const [profile, setProfile] = useState<ViewerProfile>(seedProfile);
  const [activeSection, setActiveSection] = useState<ProfileHubSection>("overview");
  const [loading, setLoading] = useState(canonical);
  const [notice, setNotice] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [canFollow, setCanFollow] = useState(!isOwner);
  const [followPending, setFollowPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const returnDestinationLabel = returnPath.startsWith("/profile")
    ? "à mon profil"
    : returnPath.startsWith("/scene")
    ? "à La Scène"
    : returnPath.startsWith("/market")
      ? "à la Marketplace"
      : returnPath.startsWith("/tremplin")
        ? "au Tremplin"
        : "au Globe";
  const gradeMeta = profile.grade ? getGradeBadgeMeta(profile.grade) : null;
  const fixture = useMemo(() => resolvePublicProfileViewerFixture({
    profileId: profile.id,
    name: profile.name,
    grade: profile.grade ?? 1,
    role: profile.role,
    location: profile.location,
    registrationStatus: seedArtist.tremplinRegistered === true ? "registered" : "not_registered",
    statsPublished: seedArtist.publicStatsPublished === true,
  }), [profile.grade, profile.id, profile.location, profile.name, profile.role, seedArtist.publicStatsPublished, seedArtist.tremplinRegistered]);
  const publicHub = canonical ? null : fixture;

  const displayedMedia = useMemo<ViewerMedia[]>(() => {
    if (!publicHub) return profile.media;
    return [
      ...publicHub.media.audios.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.description,
        duration: item.durationLabel,
        url: item.sourceUrl,
        credit: item.creditLabel,
        kind: "audio" as const,
      })),
      ...publicHub.media.videos.map((item) => ({
        id: item.id,
        title: item.title,
        detail: item.description,
        duration: item.durationLabel,
        url: item.sourceUrl,
        poster: item.posterUrl ?? undefined,
        credit: item.creditLabel,
        kind: "video" as const,
      })),
    ];
  }, [profile.media, publicHub]);

  const audioMedia = displayedMedia.filter((item) => item.kind === "audio");
  const visualMedia = displayedMedia.filter((item) => item.kind !== "audio");
  const marketListing = publicHub?.marketplaceListings[0] ?? null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = `${profile.name} — Profil public MeeWav`;
    return () => { document.title = previousTitle; };
  }, [profile.name]);

  useEffect(() => {
    if (presentation === "page") window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [presentation, profileId]);

  useEffect(() => { setPortraitFailed(false); }, [profile.portraitUrl]);

  useEffect(() => {
    setProfile(seedProfile);
    setActiveSection("overview");
    setNotice(null);
    setFollowing(false);
    setCanFollow(!isOwner);

    if (!canonical) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    void Promise.allSettled([
      getPublicPreProfile(profileId),
      getPublishedPreProfileMedia(profileId, 20),
      getFollowState(profileId),
    ]).then(([profileResult, mediaResult, followResult]) => {
      if (cancelled) return;

      const publicProfile = profileResult.status === "fulfilled" ? profileResult.value : null;
      const media = mediaResult.status === "fulfilled" ? mediaResult.value : [];

      if (publicProfile) {
        setProfile(viewerFromPublic(publicProfile, media, seedProfile));
        if (mediaResult.status === "rejected") {
          setNotice("Le profil est disponible, mais ses créations n’ont pas pu être actualisées.");
        }
      } else if (profileResult.status === "rejected") {
        setNotice("Le serveur public est indisponible. Réessaie dans quelques instants.");
      } else {
        setNotice("Ce profil public n’est pas encore publié.");
      }

      if (followResult.status === "fulfilled") {
        setFollowing(followResult.value.following);
        setCanFollow(Boolean(
          followResult.value.viewerProfileId
          && followResult.value.viewerProfileId !== profileId,
        ));
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [canonical, isOwner, profileId, seedProfile]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 2_800);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const closeViewer = () => {
    if (onClose) onClose();
    else navigate(returnPath || MON_GLOBE_ROUTE);
  };

  const toggleFollow = async () => {
    if (!canFollow || followPending) return;
    const next = !following;
    if (!canonical) {
      setFollowing(next);
      setToast(next ? `${profile.name} est maintenant suivi.` : `${profile.name} n’est plus suivi.`);
      return;
    }
    setFollowPending(true);
    try {
      const state = await setFollowState(profileId, next);
      setFollowing(state.following);
      setToast(state.following ? `${profile.name} est maintenant suivi.` : `${profile.name} n’est plus suivi.`);
    } catch {
      setToast("Le suivi n’a pas pu être modifié.");
    } finally {
      setFollowPending(false);
    }
  };

  const messagingIdentity = canonical
    ? {
        mode: "real" as const,
        profileId,
        mockArtistId: null,
      }
    : {
        mode: "demo" as const,
        profileId: null,
        mockArtistId: profileId,
        mockArtistName: profile.name,
        mockArtistRole: profile.role,
        mockArtistAvatar: profile.portraitUrl,
        mockArtistGradeLevel: profile.grade,
      };

  const collaborationTarget: ShortsCollaborationDialogItem = {
    artistId: profile.id,
    mockArtistId: profile.id,
    profileId: canonical ? profileId : undefined,
    artist: profile.name,
    image: profile.portraitUrl,
    role: profile.role,
    city: profile.location,
    gradeLevel: profile.grade ?? 1,
  };

  const openMessage = () => {
    navigate(buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "profile",
      ...messagingIdentity,
    }));
  };

  const openCollaboration = () => {
    if (!profile.collabAvailable) {
      setToast(`${profile.name} n’accepte pas encore de demande de collaboration.`);
      return;
    }
    setCollaborationOpen(true);
  };

  const completeCollaboration = (requestId: string) => {
    setCollaborationOpen(false);
    navigate(buildMessagingRoute({
      space: "collabs",
      intent: "collaboration",
      source: "profile",
      requestId: isMessagingUuid(requestId) ? requestId : null,
      ...messagingIdentity,
    }));
  };

  const shareProfile = async () => {
    const shareUrl = new URL(`/profile/view/${encodeURIComponent(profileId)}`, window.location.origin);
    if (!canonical) {
      shareUrl.searchParams.set("name", profile.name);
      shareUrl.searchParams.set("role", profile.role);
      shareUrl.searchParams.set("city", profile.location);
      shareUrl.searchParams.set("portrait", profile.portraitUrl);
      if (profile.grade) shareUrl.searchParams.set("grade", String(profile.grade));
    }
    try {
      if (navigator.share) await navigator.share({ title: `${profile.name} sur MeeWav`, url: shareUrl.toString() });
      else {
        await navigator.clipboard.writeText(shareUrl.toString());
        setToast("Lien du profil copié.");
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setToast("Le lien n’a pas pu être partagé.");
    }
  };

  const selectSection = (section: ProfileHubSection) => {
    setActiveSection(section);
    requestAnimationFrame(() => document.getElementById(`profile-viewer-${section}-title`)?.focus({ preventScroll: true }));
  };

  const openTremplin = (statistics = false) => {
    const anchor = statistics ? "profile-token-statistics" : "profile-support";
    navigate(`/tremplin/artistes/${encodeURIComponent(profile.id)}#${anchor}`, {
      state: { artistName: profile.name, tokenTicker: publicHub?.token.ticker ?? null },
    });
  };

  const pauseOtherMedia = (event: SyntheticEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLMediaElement)) return;
    event.currentTarget.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => {
      if (media !== target) media.pause();
    });
  };

  const renderTokenCard = () => {
    if (!publicHub) {
      return (
        <aside className="profile-viewer-tremplin-card is-unavailable">
          <p className="profile-viewer-eyebrow">TREMPLIN</p>
          <h2>Résumé public en préparation</h2>
          <p>Le profil est public, mais son projet, son inscription et son éventuel jeton doivent encore être projetés par le serveur.</p>
        </aside>
      );
    }

    const token = publicHub.token;
    const changeDirection = token.status === "active"
      ? token.change24hBasisPoints > 0 ? "up" : token.change24hBasisPoints < 0 ? "down" : "flat"
      : null;
    const TrendIcon = changeDirection === "up" ? TrendingUp : changeDirection === "down" ? TrendingDown : CircleDot;

    return (
      <aside className="profile-viewer-tremplin-card" data-token-status={token.status}>
        <div className="profile-viewer-tremplin-card__heading">
          <div>
            <p className="profile-viewer-eyebrow">TREMPLIN</p>
            <span>{publicHub.fixtureNotice}</span>
          </div>
          {profile.grade && <MeewavGradeBadge level={profile.grade} size="sm" variant="compact-pill" labelMode="full" />}
        </div>
        <div className="profile-viewer-tremplin-card__project">
          <small>PROJET ACTUEL</small>
          <strong>{publicHub.project.title}</strong>
          <p>{publicHub.project.currentStage}</p>
        </div>
        <div className="profile-viewer-tremplin-card__token">
          <span className="profile-viewer-token-status"><MeewavTokenIcon title="Jeton de talent MeeWav" /> {token.label}</span>
          <p>{token.helper}</p>
          {token.status === "active" && (
            <dl>
              <div><dt>{token.ticker}</dt><dd>{formatMoneyMinor(token.currentValueMinor)}</dd></div>
              <div className={`is-${changeDirection}`}><dt>24 h</dt><dd><TrendIcon aria-hidden="true" /> {formatChangeBasisPoints(token.change24hBasisPoints)}</dd></div>
            </dl>
          )}
          {token.status === "active" && <small>Mis à jour le {formatDateTime(token.marketUpdatedAt)}</small>}
        </div>
        <div className="profile-viewer-tremplin-card__actions">
          <button type="button" className="is-primary" onClick={() => openTremplin(false)}>
            <MeewavTokenIcon aria-hidden="true" />
            {token.status === "active" ? "Voir le jeton" : "Voir dans le Tremplin"}
          </button>
          {publicHub.canViewStats && (
            <button type="button" onClick={() => openTremplin(true)}><BarChart3 aria-hidden="true" /> Statistiques</button>
          )}
        </div>
      </aside>
    );
  };

  return (
    <div className={`profile-viewer-page is-${presentation}`} onPlayCapture={pauseOtherMedia}>
      {presentation === "page" && (
        <div className="profile-viewer-page__background" aria-hidden="true"><span className="is-one" /><span className="is-two" /></div>
      )}

      {presentation === "page" && (
        <header className="profile-viewer-command-bar">
          <MeewavPillarBrand pillar="Profil" />
          <span className="profile-viewer-command-bar__context">Vue visiteur</span>
          <button type="button" onClick={closeViewer}><ArrowLeft aria-hidden="true" /> Retour {returnDestinationLabel}</button>
        </header>
      )}

      {presentation === "page" && (
        <aside className="profile-viewer-primary-rail">
          <MeewavPrimaryNav activeView="globe" activeDestination="profile" onGlobe={closeViewer} />
        </aside>
      )}

      <main className="profile-viewer-main">
        {notice && <p className="profile-viewer-notice" role="status">{notice}</p>}

        <section className="profile-viewer-hero" aria-labelledby="profile-viewer-title" aria-busy={loading}>
          <div className="profile-viewer-identity-card">
            <div className="profile-viewer-hero__portrait">
              <span className="profile-viewer-hero__portrait-fallback" aria-hidden="true">{profile.portraitFallback}</span>
              {profile.portraitUrl && !portraitFailed && <img src={profile.portraitUrl} alt={`Portrait de ${profile.name}`} onError={() => setPortraitFailed(true)} />}
              {profile.online && <span className="profile-viewer-online">En ligne</span>}
            </div>
            <div className="profile-viewer-hero__identity">
              <p className="profile-viewer-eyebrow">PROFIL PUBLIC</p>
              <div className="profile-viewer-name-row">
                <div>
                  <h1 id="profile-viewer-title">{profile.name}</h1>
                  <p>{profile.handle}</p>
                </div>
                {profile.grade && <MeewavGradeBadge level={profile.grade} size="md" variant="compact-pill" labelMode="full" title={`Grade MeeWav de ${profile.name}`} />}
              </div>
              <p className="profile-viewer-role">{profile.role}</p>
              <p className="profile-viewer-location"><MapPin aria-hidden="true" /> {profile.location}</p>
              <p className="profile-viewer-bio">{profile.bio}</p>
              <dl className="profile-viewer-stats">
                <div><dt>Abonnés</dt><dd>{profile.followersLabel}</dd></div>
                <div><dt>Abonnements</dt><dd>{profile.followingLabel}</dd></div>
                <div><dt>Golden Likes</dt><dd>{profile.goldenLikesCount}</dd></div>
              </dl>
              <div className="profile-viewer-actions">
                {!isOwner && (
                  <button type="button" className={following ? "is-following" : "is-primary"} aria-pressed={following} disabled={!canFollow || followPending} onClick={() => void toggleFollow()}>
                    {following ? <Check aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
                    {followPending ? "Mise à jour…" : following ? "Suivi" : "Suivre gratuitement"}
                  </button>
                )}
                {!isOwner && <button type="button" onClick={openMessage}><MessageCircle aria-hidden="true" /> Message</button>}
                {!isOwner && <button type="button" disabled={!profile.collabAvailable} onClick={openCollaboration}><BriefcaseBusiness aria-hidden="true" /> Demande de collab</button>}
                <button type="button" className="is-icon" aria-label="Partager ce profil" onClick={() => void shareProfile()}><Share2 aria-hidden="true" /></button>
              </div>
            </div>
          </div>
          {renderTokenCard()}
        </section>

        <nav className="profile-viewer-local-nav" aria-label="Contenu du profil">
          <button type="button" aria-current={activeSection === "overview" ? "page" : undefined} onClick={() => selectSection("overview")}>Aperçu</button>
          <button type="button" aria-current={activeSection === "creations" ? "page" : undefined} onClick={() => selectSection("creations")}>Créations <span>{displayedMedia.length}</span></button>
          {publicHub?.canViewStats && <button type="button" aria-current={activeSection === "statistics" ? "page" : undefined} onClick={() => selectSection("statistics")}>Statistiques</button>}
          <button type="button" aria-current={activeSection === "journey" ? "page" : undefined} onClick={() => selectSection("journey")}>Parcours</button>
        </nav>

        <div className="profile-viewer-view" role="region" aria-live="polite">
          {activeSection === "overview" && (
            <section className="profile-viewer-overview" aria-labelledby="profile-viewer-overview-title">
              <header className="profile-viewer-view-heading">
                <div><p className="profile-viewer-eyebrow">VUE D’ENSEMBLE</p><h2 id="profile-viewer-overview-title" tabIndex={-1}>Tout ce qui compte, sans chercher</h2></div>
                <p>Projet, créations et présence dans l’écosystème MeeWav sont réunis dans une seule lecture.</p>
              </header>

              <div className="profile-viewer-overview-grid">
                {publicHub ? (
                  <article className="profile-viewer-project-card">
                    <img src={publicHub.project.coverUrl} alt="Visuel éditorial du projet présenté" />
                    <div>
                      <span>{publicHub.project.statusLabel}</span>
                      <h3>{publicHub.project.title}</h3>
                      <p>{publicHub.project.summary}</p>
                      <strong>Étape actuelle · {publicHub.project.currentStage}</strong>
                      <button type="button" onClick={() => selectSection("journey")}>Voir les étapes <ChevronRight aria-hidden="true" /></button>
                    </div>
                  </article>
                ) : (
                  <article className="profile-viewer-project-card is-empty"><Sparkles aria-hidden="true" /><div><h3>Projet public non renseigné</h3><p>Ce module apparaîtra lorsque l’artiste publiera un projet documenté.</p></div></article>
                )}

                <article className="profile-viewer-ecosystem-card">
                  <div><p className="profile-viewer-eyebrow">ÉCOSYSTÈME MEEWAV</p><h3>Retrouver {profile.name} partout</h3></div>
                  <div className="profile-viewer-ecosystem-links">
                    <button type="button" onClick={() => navigate(`${SCENE_ROUTE}?artist=${encodeURIComponent(profile.id)}`)}><Video aria-hidden="true" /><span><strong>{SCENE_NAME}</strong><small>{visualMedia.length} vidéo{visualMedia.length > 1 ? "s" : ""}</small></span><ArrowUpRight aria-hidden="true" /></button>
                    <button type="button" onClick={() => navigate(publicHub?.nextRoom?.href ?? "/rooms")}><Radio aria-hidden="true" /><span><strong>Rooms</strong><small>{publicHub?.nextRoom ? "Prochaine annoncée" : "Voir les Rooms"}</small></span><ArrowUpRight aria-hidden="true" /></button>
                    <button type="button" onClick={() => navigate(marketListing?.href ?? "/market")}><ShoppingBag aria-hidden="true" /><span><strong>Marketplace</strong><small>{marketListing ? "1 offre publique" : "Voir la boutique"}</small></span><ArrowUpRight aria-hidden="true" /></button>
                    {!isOwner && <button type="button" onClick={openMessage}><MessageCircle aria-hidden="true" /><span><strong>Message</strong><small>Écrire directement</small></span><ArrowUpRight aria-hidden="true" /></button>}
                  </div>
                </article>

                {publicHub?.stats ? (
                  <article className="profile-viewer-stats-preview">
                    <div><BarChart3 aria-hidden="true" /><span><small>STATISTIQUES PUBLIQUES · 30 J</small><strong>{formatCount(publicHub.stats.creationPlays)} lectures</strong></span></div>
                    <dl><div><dt>Vues du profil</dt><dd>{formatCount(publicHub.stats.profileViews)}</dd></div><div><dt>Étapes</dt><dd>{publicHub.stats.projectUpdates}</dd></div><div><dt>Collaborations</dt><dd>{publicHub.stats.publicCollaborations}</dd></div></dl>
                    <button type="button" onClick={() => selectSection("statistics")}>Ouvrir les statistiques <ChevronRight aria-hidden="true" /></button>
                  </article>
                ) : (
                  <article className="profile-viewer-stats-preview is-locked"><BarChart3 aria-hidden="true" /><div><small>STATISTIQUES PUBLIQUES</small><strong>Disponibles à partir du niveau 2</strong><p>Le profil doit aussi être inscrit au Tremplin et avoir publié suffisamment de données.</p></div></article>
                )}

                {canonical ? <ProfileCertifPublicSummary profileId={profileId} profileName={profile.name} /> : null}

                {publicHub?.nextRoom && (
                  <article className="profile-viewer-room-card">
                    <span><Radio aria-hidden="true" /></span>
                    <div><small>PROCHAINE ROOM · ACCÈS GRATUIT</small><h3>{publicHub.nextRoom.title}</h3><p><CalendarDays aria-hidden="true" /> {formatDateTime(publicHub.nextRoom.startsAt)} · {publicHub.nextRoom.interestedCount} intéressés</p></div>
                    <button type="button" onClick={() => navigate(publicHub.nextRoom!.href)}>Voir la Room <ChevronRight aria-hidden="true" /></button>
                  </article>
                )}

                {marketListing && (
                  <article className="profile-viewer-market-card">
                    <img src={marketListing.imageUrl} alt="Illustration de l’offre Marketplace" loading="lazy" />
                    <div><small>MARKETPLACE · DÉMONSTRATION</small><h3>{marketListing.title}</h3><p>{marketListing.description}</p><strong>{formatMoneyMinor(marketListing.price.amountMinor)} · {marketListing.price.unitLabel}</strong><button type="button" onClick={() => navigate(marketListing.href)}>Explorer le Marketplace <ArrowUpRight aria-hidden="true" /></button></div>
                  </article>
                )}
              </div>
            </section>
          )}

          {activeSection === "creations" && (
            <section className="profile-viewer-creations" aria-labelledby="profile-viewer-creations-title">
              <header className="profile-viewer-view-heading">
                <div><p className="profile-viewer-eyebrow">CRÉATIONS PUBLIQUES</p><h2 id="profile-viewer-creations-title" tabIndex={-1}>Écouter et regarder</h2></div>
                <p>{publicHub?.isRichVariant ? "Profil parisien enrichi pour éprouver une médiathèque dense." : `Les médias que ${profile.name} a choisi de rendre publics.`}</p>
              </header>
              {displayedMedia.length === 0 ? (
                <div className="profile-viewer-empty"><Headphones aria-hidden="true" /><p>Aucune création publique pour le moment.</p></div>
              ) : (
                <div className="profile-viewer-media-layout">
                  {visualMedia.length > 0 && (
                    <div className="profile-viewer-visual-grid">
                      {visualMedia.map((item, index) => (
                        <article key={item.id} className={index === 0 ? "is-featured" : undefined}>
                          {item.kind === "video" ? <video aria-label={`Lire ${item.title}`} controls preload="metadata" poster={item.poster} src={item.url}>Ton navigateur ne prend pas en charge cette vidéo.</video> : <img src={item.url} alt={item.title} loading="lazy" />}
                          <div><span><Video aria-hidden="true" /> {item.duration}</span><strong>{item.title}</strong><p>{item.detail}</p>{item.credit && <small>{item.credit}</small>}</div>
                        </article>
                      ))}
                    </div>
                  )}
                  {audioMedia.length > 0 && (
                    <div className="profile-viewer-audio-list">
                      {audioMedia.map((item) => (
                        <ProfileViewerAudioCard key={`${item.id}:${item.url}`} item={item} />
                      ))}
                    </div>
                  )}
                  <div className="profile-viewer-media-footer"><p>La lecture ne démarre jamais automatiquement. Une seule création est lue à la fois.</p><button type="button" onClick={() => navigate(`${SCENE_ROUTE}?artist=${encodeURIComponent(profile.id)}`)}>Voir ses vidéos sur {SCENE_NAME} <ArrowUpRight aria-hidden="true" /></button></div>
                </div>
              )}
            </section>
          )}

          {activeSection === "statistics" && publicHub?.stats && (
            <section className="profile-viewer-public-statistics" aria-labelledby="profile-viewer-statistics-title">
              <header className="profile-viewer-view-heading">
                <div><p className="profile-viewer-eyebrow">STATISTIQUES PUBLIQUES</p><h2 id="profile-viewer-statistics-title" tabIndex={-1}>Comprendre son activité récente</h2></div>
                <span className="profile-viewer-statistics-period"><CalendarDays size={14} aria-hidden="true" />30 derniers jours</span>
              </header>
              <p className="profile-viewer-statistics-intro">Les chiffres clés de son activité publique. Les visiteurs individuels, revenus et historiques privés restent confidentiels.</p>
              <div className="profile-viewer-metric-grid">
                {metricCards(publicHub.stats).map((metric) => {
                  const Icon = metric.icon;
                  return <article key={metric.id} data-tone={metric.tone}><div className="profile-viewer-metric-heading"><Icon size={18} aria-hidden="true" /><span>{metric.label}</span></div><strong>{metric.value}</strong><small>Sur les 30 derniers jours</small></article>;
                })}
              </div>
              <div className="profile-viewer-statistics-detail">
                <article>
                  <div><p className="profile-viewer-eyebrow">SIGNAL PUBLIC</p><h3>Un profil qui vit dans plusieurs espaces</h3><p>Les lectures, les Rooms, les étapes de projet et les collaborations publiques sont consolidées sans exposer de données personnelles.</p></div>
                  <ul className="profile-viewer-stat-signals" aria-label="Sources des statistiques publiques">
                    <li><Play aria-hidden="true" /><span><strong>Créations</strong><small>Lectures agrégées</small></span></li>
                    <li><Radio aria-hidden="true" /><span><strong>Rooms</strong><small>Sessions publiques</small></span></li>
                    <li><Sparkles aria-hidden="true" /><span><strong>Parcours</strong><small>Étapes documentées</small></span></li>
                  </ul>
                </article>
                <aside><BadgeCheck aria-hidden="true" /><h3>Accès public encadré</h3><p>Disponible aux artistes inscrits au Tremplin à partir du niveau 2, lorsque la publication des agrégats est autorisée.</p><small>Actualisé le {formatDateTime(publicHub.stats.updatedAt)}</small></aside>
              </div>
            </section>
          )}

          {activeSection === "journey" && (
            <section className="profile-viewer-journey" aria-labelledby="profile-viewer-journey-title">
              <header className="profile-viewer-view-heading">
                <div><p className="profile-viewer-eyebrow">PARCOURS PUBLIC</p><h2 id="profile-viewer-journey-title" tabIndex={-1}>Les étapes qui donnent du contexte</h2></div>
                <p>Le projet et le grade précèdent toujours le statut du jeton.</p>
              </header>
              <div className="profile-viewer-journey-layout">
                <div className="profile-viewer-timeline">
                  {publicHub?.project.milestones.map((milestone, index) => (
                    <article key={milestone.id} data-state={milestone.state}>
                      <span>{index + 1}</span>
                      <div><small>{milestone.dateLabel ?? "Date à venir"}</small><h3>{milestone.title}</h3><p>{milestone.detail}</p></div>
                    </article>
                  )) ?? <div className="profile-viewer-empty"><Sparkles aria-hidden="true" /><p>Aucune étape publique pour le moment.</p></div>}
                </div>
                <aside className="profile-viewer-grade-detail">
                  {profile.grade && gradeMeta ? (
                    <><TremplinGradeCard level={profile.grade} standalone /><p className="profile-viewer-grade-note">Le grade ne fixe pas automatiquement la valeur du jeton et ne garantit aucun succès futur.</p></>
                  ) : (
                    <><BadgeCheck aria-hidden="true" /><h3>Grade non affiché</h3><p>Ce profil a choisi de ne pas rendre son grade public.</p></>
                  )}
                </aside>
              </div>
            </section>
          )}
        </div>

        <footer className="profile-viewer-footer">
          <p><Copy aria-hidden="true" /> Tu consultes la vue publique de ce profil.</p>
          <button type="button" onClick={closeViewer}><ArrowLeft aria-hidden="true" /> {presentation === "overlay" ? "Fermer le profil" : `Retourner ${returnDestinationLabel}`}</button>
        </footer>
      </main>

      {presentation === "overlay" && !isOwner && !collaborationOpen && (
        <div className={`profile-viewer-mobile-dock${profile.collabAvailable ? " has-collab" : ""}`} aria-label="Actions du profil">
          <button type="button" className={following ? "is-following" : "is-primary"} onClick={() => void toggleFollow()}>{following ? <Check aria-hidden="true" /> : <UserPlus aria-hidden="true" />}{following ? "Suivi" : "Suivre"}</button>
          <button type="button" onClick={openMessage}><MessageCircle aria-hidden="true" /> Message</button>
          {profile.collabAvailable && <button type="button" onClick={openCollaboration}><BriefcaseBusiness aria-hidden="true" /> Collab</button>}
        </div>
      )}
      {collaborationOpen && (
        <ShortsCollaborationDialog
          item={collaborationTarget}
          source="profile"
          onClose={() => setCollaborationOpen(false)}
          onSubmitted={completeCollaboration}
        />
      )}
      {toast && <div className="profile-viewer-toast" role="status">{toast}</div>}
    </div>
  );
}

export default function ProfileViewerPage() {
  const { profileId: routeProfileId = "" } = useParams();
  const location = useLocation();
  const navigationState = useMemo(() => getNavigationState(location.state), [location.state]);
  const linkedArtist = useMemo(() => {
    if (navigationState.artist) return navigationState.artist;
    const params = new URLSearchParams(location.search);
    const name = params.get("name")?.trim();
    if (!name) return undefined;
    const gradeValue = Number(params.get("grade"));
    const grade = Number.isInteger(gradeValue) && gradeValue >= 1 && gradeValue <= 6 ? gradeValue : 1;
    const seeded = getPreProfileArtistForSeed({
      profileId: routeProfileId,
      displayName: name,
      mainRole: params.get("role") || undefined,
      zoneName: params.get("city") || undefined,
      gradeLevel: grade,
      tremplinRegistered: grade >= 2,
      publicStatsPublished: grade >= 2,
    });
    return { ...seeded, portraitUrl: params.get("portrait") || seeded.portraitUrl };
  }, [location.search, navigationState.artist, routeProfileId]);
  return <ProfileViewerExperience profileId={routeProfileId} artist={linkedArtist} isOwner={navigationState.isOwner} returnPath={navigationState.from} />;
}
