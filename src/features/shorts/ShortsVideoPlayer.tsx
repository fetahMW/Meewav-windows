import LiveActionBurst from "../rooms/place/LiveActionBurst";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Expand,
  ExternalLink,
  Gauge,
  Heart,
  Hash,
  Link2,
  LoaderCircle,
  Maximize,
  MessageCircle,
  MessagesSquare,
  Minimize,
  MonitorUp,
  Music2,
  Pause,
  PictureInPicture2,
  Play,
  Pencil,
  RotateCcw,
  Settings,
  Share2,
  SkipForward,
  UsersRound,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import SceneCommentsDrawer from "../scene/comments/SceneCommentsDrawer";
import { sceneCommentsRepository } from "../scene/comments/sceneComments";
import { trackSceneAnalytics } from "../scene/sceneAnalytics";
import {
  meewavMediaSession,
  type MeeWavMediaSessionLease,
} from "../scene/mediaSession";
import ShortsReactionButtons from "./ShortsReactionButtons";
import type {
  ShortsAssociatedContent,
  ShortsMulticamLayout,
  ShortsPublicationCredit,
  ShortsPublicationLink,
  ScenePresentationFormat,
  ShortsVideoFormat,
} from "./shorts-wall-data";

export type ShortsPlayerItem = {
  id: string;
  title: string;
  artist: string;
  image: string;
  video?: string;
  audioUrl?: string;
  format?: ShortsVideoFormat;
  presentationFormat?: ScenePresentationFormat;
  secondaryVideo?: string;
  multicamLayout?: ShortsMulticamLayout;
  role: string;
  city: string;
  views: string;
  meta: string;
  availability?: string;
  verified?: boolean;
  gradeLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  likeCount?: number;
  goldenLikeCount?: number;
  description?: string;
  publishedAt?: string;
  publicationLinks?: ShortsPublicationLink[];
  credits?: ShortsPublicationCredit[];
  associatedContent?: ShortsAssociatedContent;
  hashtags?: string[];
};

export type ShortsPlaybackProgress = {
  itemId: string;
  currentTime: number;
  duration: number;
  percent: number;
  completed: boolean;
};

export type ShortsVideoPlayerProps = {
  item: ShortsPlayerItem;
  presentation?: "modal" | "watch";
  collapsed?: boolean;
  onMiniplayerChange?: (collapsed: boolean) => void;
  watchContent?: ReactNode | ((seek: (seconds: number) => void) => ReactNode);
  recommendations?: ReactNode;
  previousItem?: ShortsPlayerItem;
  nextItem?: ShortsPlayerItem;
  repeatCurrent?: boolean;
  verticalPosition?: { index: number; total: number };
  initialTime?: number;
  progressThrottleMs?: number;
  isSaved?: boolean;
  liked?: boolean;
  goldenGiven?: boolean;
  goldenUnavailable?: boolean;
  onClose: () => void;
  onNotify: (message: string) => void;
  onToggleSaved?: () => void;
  onToggleLike?: () => void;
  onGiveGoldenLike?: () => void;
  goldenBurst?: boolean;
  onContact?: () => void;
  onCollaborate?: () => void;
  onViewProfile?: () => void;
  artistHref?: string;
  following?: boolean;
  followPending?: boolean;
  onToggleFollow?: () => void;
  onShare?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  onProgress?: (progress: ShortsPlaybackProgress) => void;
  onCompleted?: (progress: ShortsPlaybackProgress) => void;
  canEditInfo?: boolean;
  onUpdateInfo?: (patch: Partial<ShortsPlayerItem>) => void;
};

type VerticalContextTab = "comments" | "next";

type PictureInPictureVideo = HTMLVideoElement & {
  requestPictureInPicture?: () => Promise<unknown>;
};

type PictureInPictureDocument = Document & {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
};

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;
export const PLAYER_PREFERENCES_KEY = "meewav:shorts:player-preferences";

type PlayerPreferences = {
  volume: number;
  muted: boolean;
  playbackRate: number;
};

export function readPlayerPreferences(): PlayerPreferences {
  try {
    const preferences = JSON.parse(
      window.sessionStorage.getItem(PLAYER_PREFERENCES_KEY) ?? "{}",
    ) as Partial<PlayerPreferences>;
    const playbackRate = PLAYBACK_RATES.includes(
      preferences.playbackRate as (typeof PLAYBACK_RATES)[number],
    )
      ? preferences.playbackRate as number
      : 1;
    return {
      volume: typeof preferences.volume === "number"
        ? Math.min(Math.max(preferences.volume, 0), 1)
        : 1,
      muted: Boolean(preferences.muted),
      playbackRate,
    };
  } catch {
    return { volume: 1, muted: false, playbackRate: 1 };
  }
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const rounded = Math.floor(value);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    : `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatPublicationDate(value?: string) {
  if (!value) return "Publié récemment";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publié récemment";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function normalizeHashtags(value: string) {
  return [...new Set(value.split(/[\s,;]+/).map((tag) => tag.trim().replace(/^#+/, "")).filter(Boolean))].slice(0, 12);
}

function usableLink(link: ShortsPublicationLink) {
  try {
    const url = new URL(link.url);
    return Boolean(link.label.trim()) && (url.protocol === "https:" || url.protocol === "http:");
  } catch {
    return false;
  }
}

function usableExternalUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function ShortPublicationSections({ item }: { item: ShortsPlayerItem }) {
  const links = (item.publicationLinks ?? []).filter(usableLink);
  const credits = item.credits ?? [];
  const hashtags = item.hashtags ?? [];
  const associatedUrl = usableExternalUrl(item.associatedContent?.url);
  return (
    <div className="scene-short-publication__sections">
      {links.length > 0 ? (
        <section><h3>Liens</h3><div className="scene-short-publication__links">{links.map((link, index) => (
          <a key={`${link.url}-${index}`} href={link.url} target="_blank" rel="noreferrer"><span>{link.label}</span><ExternalLink aria-hidden="true" /></a>
        ))}</div></section>
      ) : null}
      {credits.length > 0 ? (
        <section><h3>Crédits</h3><p className="scene-short-publication__credits">{credits.map((credit, index) => <span key={`${credit.name}-${index}`}><strong>{credit.name}</strong>{credit.role ? <small>{credit.role}</small> : null}</span>)}</p></section>
      ) : null}
      {item.associatedContent ? (
        <section><h3>{item.associatedContent.type === "room" ? "Room associée" : item.associatedContent.type === "track" ? "Morceau associé" : "Projet associé"}</h3>
          {associatedUrl ? <a className="scene-short-publication__associated" href={associatedUrl} target="_blank" rel="noreferrer"><Music2 aria-hidden="true" /><span>{item.associatedContent.label}</span><ExternalLink aria-hidden="true" /></a> : <p>{item.associatedContent.label}</p>}
        </section>
      ) : null}
      {hashtags.length > 0 ? <p className="scene-short-publication__hashtags">{hashtags.map((hashtag) => <span key={hashtag}><Hash aria-hidden="true" />{hashtag.replace(/^#/, "")}</span>)}</p> : null}
    </div>
  );
}

type ShortInfoDraft = {
  title: string;
  description: string;
  links: ShortsPublicationLink[];
  credits: ShortsPublicationCredit[];
  associatedContent: ShortsAssociatedContent | null;
  hashtags: string;
};

function ShortInfoEditor({ draft, onDraft, onClose, onSave }: {
  draft: ShortInfoDraft;
  onDraft: (draft: ShortInfoDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <form className="scene-short-info-editor" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
      <header><strong>Modifier les informations</strong><button type="button" onClick={onClose} aria-label="Fermer"><X aria-hidden="true" /></button></header>
      <label><span>Titre</span><input value={draft.title} maxLength={100} onChange={(event) => onDraft({ ...draft, title: event.currentTarget.value })} /></label>
      <label><span>Description</span><textarea value={draft.description} maxLength={800} onChange={(event) => onDraft({ ...draft, description: event.currentTarget.value })} /></label>
      <fieldset>
        <legend>Liens</legend>
        {draft.links.map((link, index) => <div key={index}>
          <input aria-label={`Libellé du lien ${index + 1}`} placeholder="Libellé" value={link.label} onChange={(event) => onDraft({ ...draft, links: draft.links.map((itemLink, itemIndex) => itemIndex === index ? { ...itemLink, label: event.currentTarget.value } : itemLink) })} />
          <input aria-label={`URL du lien ${index + 1}`} placeholder="https://…" value={link.url} onChange={(event) => onDraft({ ...draft, links: draft.links.map((itemLink, itemIndex) => itemIndex === index ? { ...itemLink, url: event.currentTarget.value } : itemLink) })} />
          <button type="button" onClick={() => onDraft({ ...draft, links: draft.links.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`Retirer le lien ${index + 1}`}><X aria-hidden="true" /></button>
        </div>)}
        <button type="button" onClick={() => onDraft({ ...draft, links: [...draft.links, { label: "", url: "" }] })}><Link2 aria-hidden="true" /> Ajouter un lien</button>
      </fieldset>
      <label><span>Crédits et collaborateurs</span><input value={draft.credits.map((credit) => credit.name).join(", ")} placeholder="Alya Flow, Isaac Low…" onChange={(event) => onDraft({ ...draft, credits: event.currentTarget.value.split(/[,;]+/).map((name) => ({ name: name.trim() })).filter((credit) => credit.name) })} /></label>
      <fieldset className="scene-short-info-editor__association">
        <legend>Contenu associé</legend>
        <select value={draft.associatedContent?.type ?? "none"} onChange={(event) => onDraft({ ...draft, associatedContent: event.currentTarget.value === "none" ? null : { type: event.currentTarget.value as ShortsAssociatedContent["type"], label: draft.associatedContent?.label ?? "", url: draft.associatedContent?.url } })}><option value="none">Aucun</option><option value="track">Morceau</option><option value="project">Projet</option><option value="room">Room</option></select>
        {draft.associatedContent ? <><input aria-label="Nom du contenu associé" placeholder="Nom du morceau, projet ou Room" value={draft.associatedContent.label} onChange={(event) => onDraft({ ...draft, associatedContent: draft.associatedContent ? { ...draft.associatedContent, label: event.currentTarget.value } : null })} /><input aria-label="Lien du contenu associé" placeholder="Lien facultatif" value={draft.associatedContent.url ?? ""} onChange={(event) => onDraft({ ...draft, associatedContent: draft.associatedContent ? { ...draft.associatedContent, url: event.currentTarget.value } : null })} /></> : null}
      </fieldset>
      <label><span>Hashtags</span><input value={draft.hashtags} placeholder="#live #violon #dakar" onChange={(event) => onDraft({ ...draft, hashtags: event.currentTarget.value })} /></label>
      <footer><button type="button" onClick={onClose}>Annuler</button><button type="submit" className="is-primary" disabled={!draft.title.trim()}>Enregistrer</button></footer>
    </form>
  );
}

export default function ShortsVideoPlayer({
  item,
  presentation = "modal",
  collapsed,
  onMiniplayerChange,
  watchContent,
  recommendations,
  previousItem,
  nextItem,
  repeatCurrent = false,
  verticalPosition,
  initialTime = 0,
  progressThrottleMs = 5_000,
  isSaved = false,
  liked = false,
  goldenGiven = false,
  goldenUnavailable = false,
  onClose,
  onNotify,
  onToggleSaved,
  onToggleLike,
  onGiveGoldenLike,
  goldenBurst = false,
  onContact,
  onCollaborate,
  onViewProfile,
  artistHref,
  following,
  followPending,
  onToggleFollow,
  onShare,
  onPrevious,
  onNext,
  onProgress,
  onCompleted,
  canEditInfo = false,
  onUpdateInfo,
}: ShortsVideoPlayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const mediaLeaseRef = useRef<MeeWavMediaSessionLease | null>(null);
  const playerInstanceId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsRootRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const controlsTimerRef = useRef<number | null>(null);
  const onProgressRef = useRef(onProgress);
  const onCompletedRef = useRef(onCompleted);
  const lastProgressReportAtRef = useRef(Number.NEGATIVE_INFINITY);
  const lastProgressSignatureRef = useRef("");
  const completionReportedItemRef = useRef<string | null>(null);
  const analyticsStartedItemRef = useRef<string | null>(null);
  const analyticsMilestonesRef = useRef<Set<number>>(new Set());
  const initialTimeAppliedItemRef = useRef<string | null>(null);
  const verticalSwipeStartRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const verticalSwipeConsumedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const initialPreferencesRef = useRef(readPlayerPreferences());
  const [volume, setVolume] = useState(initialPreferencesRef.current.volume);
  const [isMuted, setIsMuted] = useState(initialPreferencesRef.current.muted);
  const [playbackRate, setPlaybackRate] = useState(initialPreferencesRef.current.playbackRate);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [isTheater, setIsTheater] = useState(false);
  const [localMiniplayer, setIsMiniplayer] = useState(false);
  const isWatch = presentation === "watch";
  const isMiniplayer = collapsed ?? localMiniplayer;
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPictureInPicture, setIsPictureInPicture] = useState(false);
  const [pictureInPictureSupported, setPictureInPictureSupported] = useState(false);
  const [mediaError, setMediaError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [hasEnded, setHasEnded] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [verticalContextTab, setVerticalContextTab] = useState<VerticalContextTab>("comments");
  const [shortInfoExpanded, setShortInfoExpanded] = useState(false);
  const [mobileInfoOpen, setMobileInfoOpen] = useState(false);
  const [infoEditorOpen, setInfoEditorOpen] = useState(false);
  const [infoDraft, setInfoDraft] = useState<ShortInfoDraft>(() => ({
    title: item.title,
    description: item.description ?? "",
    links: item.publicationLinks?.map((link) => ({ ...link })) ?? [],
    credits: item.credits?.map((credit) => ({ ...credit })) ?? [],
    associatedContent: item.associatedContent ? { ...item.associatedContent } : null as ShortsAssociatedContent | null,
    hashtags: item.hashtags?.join(" ") ?? "",
  }));

  const format = item.format ?? "landscape";
  const isVertical = item.presentationFormat === "vertical" || format === "portrait";
  const isAudioVisualizer = item.presentationFormat === "audio_visualizer";
  const source = item.audioUrl ?? item.video ?? "/media/shorts-demo/landscape-dj.mp4";
  const multicamLayout = item.multicamLayout ?? "duo";
  const [verticalComments, setVerticalComments] = useState(() => (
    isVertical
      ? sceneCommentsRepository.list(item.id).filter(({ parentId }) => parentId === null).slice(0, 4)
      : []
  ));

  useEffect(() => {
    setVerticalComments(isVertical
      ? sceneCommentsRepository.list(item.id).filter(({ parentId }) => parentId === null).slice(0, 4)
      : []);
  }, [commentsOpen, isVertical, item.id]);

  useEffect(() => {
    setVerticalContextTab("comments");
    setShortInfoExpanded(false);
    setMobileInfoOpen(false);
    setInfoEditorOpen(false);
    setInfoDraft({
      title: item.title,
      description: item.description ?? "",
      links: item.publicationLinks?.map((link) => ({ ...link })) ?? [],
      credits: item.credits?.map((credit) => ({ ...credit })) ?? [],
      associatedContent: item.associatedContent ? { ...item.associatedContent } : null,
      hashtags: item.hashtags?.join(" ") ?? "",
    });
  }, [
    item.id,
    item.title,
    item.description,
    item.publicationLinks,
    item.credits,
    item.associatedContent,
    item.hashtags,
  ]);

  useEffect(() => {
    if (!hasEnded || !isVertical || !onNext) return undefined;
    const timer = window.setTimeout(onNext, 650);
    return () => window.clearTimeout(timer);
  }, [hasEnded, isVertical, onNext]);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  useEffect(() => {
    onProgressRef.current = onProgress;
    onCompletedRef.current = onCompleted;
  }, [onCompleted, onProgress]);

  useEffect(() => {
    analyticsStartedItemRef.current = null;
    analyticsMilestonesRef.current = new Set();
  }, [item.id]);

  const emitPlaybackProgress = useCallback((
    video: HTMLVideoElement,
    options: { force?: boolean; completed?: boolean } = {},
  ) => {
    const mediaDuration = video.duration;
    const mediaCurrentTime = video.currentTime;
    if (
      !Number.isFinite(mediaDuration)
      || mediaDuration <= 0
      || !Number.isFinite(mediaCurrentTime)
    ) {
      return;
    }

    const normalizedTime = Math.min(Math.max(mediaCurrentTime, 0), mediaDuration);
    const completed = options.completed === true || video.ended;
    const now = Date.now();
    const throttle = Number.isFinite(progressThrottleMs)
      ? Math.max(0, progressThrottleMs)
      : 5_000;
    if (!options.force && now - lastProgressReportAtRef.current < throttle) return;

    const signature = `${normalizedTime.toFixed(2)}:${mediaDuration.toFixed(2)}:${completed}`;
    if (signature === lastProgressSignatureRef.current) return;

    const payload: ShortsPlaybackProgress = {
      itemId: item.id,
      currentTime: normalizedTime,
      duration: mediaDuration,
      percent: Math.min(Math.max((normalizedTime / mediaDuration) * 100, 0), 100),
      completed,
    };
    lastProgressReportAtRef.current = now;
    lastProgressSignatureRef.current = signature;

    try {
      onProgressRef.current?.(payload);
    } catch {
      // Analytics or local persistence callbacks must never interrupt playback.
    }

    if (completed && completionReportedItemRef.current !== item.id) {
      completionReportedItemRef.current = item.id;
      try {
        onCompletedRef.current?.(payload);
      } catch {
        // Completion observers are optional and isolated from the player.
      }
    }
  }, [item.id, progressThrottleMs]);

  const applyInitialTime = useCallback((video: HTMLVideoElement) => {
    if (initialTimeAppliedItemRef.current === item.id) return;
    const mediaDuration = video.duration;
    if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return;

    const requestedTime = Number.isFinite(initialTime) ? Math.max(0, initialTime) : 0;
    // A completed item should restart instead of opening on its final frame.
    const safeTime = requestedTime >= mediaDuration - 0.5
      ? 0
      : Math.min(requestedTime, mediaDuration);
    video.currentTime = safeTime;
    if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
    initialTimeAppliedItemRef.current = item.id;
  }, [initialTime, item.id]);

  const clearControlsTimer = useCallback(() => {
    if (controlsTimerRef.current !== null) {
      window.clearTimeout(controlsTimerRef.current);
      controlsTimerRef.current = null;
    }
  }, []);

  const revealControls = useCallback(() => {
    clearControlsTimer();
    setControlsVisible(true);

    if (isPlaying && !settingsOpen) {
      controlsTimerRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, 2600);
    }
  }, [clearControlsTimer, isPlaying, settingsOpen]);

  const claimPlaybackSlot = useCallback(() => {
    const existingLease = mediaLeaseRef.current;
    const activeSession = meewavMediaSession.getSnapshot().active;
    if (
      existingLease?.isCurrent()
      && activeSession?.token === existingLease.token
      && activeSession.state === "active"
    ) return;

    mediaLeaseRef.current = meewavMediaSession.claim({
      source: isAudioVisualizer ? "scene_audio" : "scene_video",
      id: `scene-player:${playerInstanceId}`,
      mediaId: item.id,
      label: item.title,
      pause: () => {
        videoRef.current?.pause();
        secondaryVideoRef.current?.pause();
        setIsPlaying(false);
      },
    });
  }, [isAudioVisualizer, item.id, item.title, playerInstanceId]);

  useEffect(() => () => {
    mediaLeaseRef.current?.release({ reason: "route_change" });
    mediaLeaseRef.current = null;
  }, [item.id]);

  const playVideo = useCallback(async (
    options: { allowMutedFallback?: boolean } = {},
  ) => {
    const video = videoRef.current;
    if (!video) return;

    const startSecondaryVideo = () => {
      const secondaryVideo = secondaryVideoRef.current;
      if (!secondaryVideo) return;
      secondaryVideo.currentTime = video.currentTime;
      secondaryVideo.playbackRate = video.playbackRate;
      secondaryVideo.muted = true;
      void secondaryVideo.play().catch(() => undefined);
    };

    try {
      if (video.ended || (video.duration > 0 && video.currentTime >= video.duration)) {
        video.currentTime = 0;
        if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = 0;
        lastProgressReportAtRef.current = Number.NEGATIVE_INFINITY;
        lastProgressSignatureRef.current = "";
        completionReportedItemRef.current = null;
      }
      setHasEnded(false);
      await video.play();
      startSecondaryVideo();
      setIsPlaying(true);
    } catch {
      if (!options.allowMutedFallback || video.muted) {
        setIsPlaying(false);
        return;
      }

      // Some browsers consume the thumbnail click before the player is
      // mounted and reject audible autoplay. Keep the one-click experience by
      // retrying muted; the sound control remains immediately available.
      video.muted = true;
      setIsMuted(true);
      try {
        await video.play();
        startSecondaryVideo();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  }, []);

  const pauseVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    setIsPlaying(false);
  }, []);

  const togglePlayback = useCallback(() => {
    if (isPlaying) {
      pauseVideo();
    } else {
      void playVideo();
    }
    revealControls();
  }, [isPlaying, pauseVideo, playVideo, revealControls]);

  const handleVideoClick = useCallback(() => {
    if (verticalSwipeConsumedRef.current) {
      verticalSwipeConsumedRef.current = false;
      return;
    }
    togglePlayback();
  }, [togglePlayback]);

  const beginVerticalSwipe = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isVertical || event.pointerType === "mouse") return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, input, .shorts-player-controls, .shorts-player-frame__top")) return;
    verticalSwipeConsumedRef.current = false;
    verticalSwipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  }, [isVertical]);

  const completeVerticalSwipe = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = verticalSwipeStartRef.current;
    verticalSwipeStartRef.current = null;
    if (!start || start.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (Math.abs(deltaY) < 64 || Math.abs(deltaY) < Math.abs(deltaX) * 1.15) return;
    verticalSwipeConsumedRef.current = true;
    if (deltaY < 0) onNext?.();
    else onPrevious?.();
  }, [onNext, onPrevious]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    const nextTime = Math.min(Math.max(video.currentTime + delta, 0), duration || video.duration || 0);
    video.currentTime = nextTime;
    if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
    revealControls();
  }, [duration, revealControls]);

  const changeVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) return;
    const normalizedVolume = Math.min(Math.max(nextVolume, 0), 1);
    video.volume = normalizedVolume;
    video.muted = normalizedVolume === 0;
    setVolume(normalizedVolume);
    setIsMuted(normalizedVolume === 0);
    revealControls();
  }, [revealControls]);

  const toggleMuted = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const nextMuted = !isMuted;
    video.muted = nextMuted;
    if (!nextMuted && video.volume === 0) {
      video.volume = 0.6;
      setVolume(0.6);
    }
    setIsMuted(nextMuted);
    revealControls();
  }, [isMuted, revealControls]);

  const changePlaybackRate = useCallback((rate: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = rate;
    if (secondaryVideoRef.current) secondaryVideoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
    setSettingsOpen(false);
    revealControls();
  }, [revealControls]);

  const exitPictureInPicture = useCallback(async () => {
    const pictureDocument = document as PictureInPictureDocument;
    const exit = Reflect.get(pictureDocument, "exitPictureInPicture") as unknown;
    if (
      pictureDocument.pictureInPictureElement
      && typeof exit === "function"
    ) {
      await Reflect.apply(exit, pictureDocument, []);
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (frameRef.current?.requestFullscreen) {
        await exitPictureInPicture();
        setIsMiniplayer(false);
        setIsTheater(false);
        await frameRef.current.requestFullscreen();
      } else {
        onNotify("Le plein écran n’est pas disponible dans ce navigateur.");
      }
    } catch {
      onNotify("Le plein écran n’est pas disponible dans ce navigateur.");
    }
    revealControls();
  }, [exitPictureInPicture, onNotify, revealControls]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current as PictureInPictureVideo | null;
    const pictureDocument = document as PictureInPictureDocument;
    if (!video || !pictureInPictureSupported) {
      onNotify("Le mode image dans l’image n’est pas disponible ici.");
      return;
    }

    try {
      if (pictureDocument.pictureInPictureElement) {
        await exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
        setIsMiniplayer(false);
        setIsTheater(false);
        if (!isPlaying) void playVideo();
        await video.requestPictureInPicture();
      }
    } catch {
      onNotify("Impossible d’ouvrir le mode image dans l’image.");
    }
  }, [
    exitPictureInPicture,
    isPlaying,
    onNotify,
    pictureInPictureSupported,
    playVideo,
  ]);

  const toggleMiniplayer = useCallback(async () => {
    const enteringMiniplayer = !isMiniplayer;
    try {
      if (enteringMiniplayer) {
        await exitPictureInPicture();
        if (document.fullscreenElement) {
          await document.exitFullscreen();
        }
      }
    } catch {
      onNotify("Impossible de réduire ce lecteur pour le moment.");
      return;
    }

    setIsMiniplayer(enteringMiniplayer);
    onMiniplayerChange?.(enteringMiniplayer);
    setIsTheater(false);
    setSettingsOpen(false);
    setControlsVisible(true);
  }, [exitPictureInPicture, isMiniplayer, onNotify, onMiniplayerChange]);

  const toggleTheaterMode = useCallback(async () => {
    try {
      await exitPictureInPicture();
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      onNotify("Impossible de changer le mode d’affichage pour le moment.");
      return;
    }

    const documentScrollY = window.scrollY;
    setIsMiniplayer(false);
    setIsTheater((current) => !current);
    setSettingsOpen(false);
    setControlsVisible(true);
    if (isWatch) {
      // Changing the grid must not let the browser anchor the page to the recommendations.
      window.requestAnimationFrame(() => window.scrollTo({ top: documentScrollY, behavior: "instant" }));
    }
  }, [exitPictureInPicture, isWatch, onNotify]);

  const closePlayer = useCallback(() => {
    const pictureDocument = document as PictureInPictureDocument;
    pauseVideo();
    if (pictureDocument.pictureInPictureElement) {
      void exitPictureInPicture().catch(() => undefined);
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    }
    onClose();
  }, [exitPictureInPicture, onClose, pauseVideo]);

  const retryPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    setMediaError(false);
    setIsBuffering(true);
    setHasEnded(false);
    video.load();
    void playVideo();
  }, [playVideo]);

  const handleSettingsMenuKeyDown = useCallback((
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => {
    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
    );
    if (buttons.length === 0) return;

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % buttons.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = currentIndex <= 0 ? buttons.length - 1 : currentIndex - 1;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = buttons.length - 1;
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(false);
      settingsButtonRef.current?.focus();
      return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      event.stopPropagation();
      buttons[nextIndex]?.focus();
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current as PictureInPictureVideo | null;
    const pictureDocument = document as PictureInPictureDocument;
    lastProgressReportAtRef.current = Number.NEGATIVE_INFINITY;
    lastProgressSignatureRef.current = "";
    completionReportedItemRef.current = null;
    initialTimeAppliedItemRef.current = null;
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setMediaError(false);
    setIsBuffering(true);
    setHasEnded(false);
    setIsPlaying(false);
    setPictureInPictureSupported(Boolean(
      pictureDocument.pictureInPictureEnabled
      && video?.requestPictureInPicture,
    ));
    // Start after effect cleanup has settled (including StrictMode's mount replay).
    // Otherwise the cleanup pause can abort the first play after an advertisement.
    const frame = requestAnimationFrame(() => { void playVideo({ allowMutedFallback: true }); });
    return () => cancelAnimationFrame(frame);
  }, [item.id, playVideo]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.muted = isMuted;
      video.playbackRate = playbackRate;
    }
    const secondaryVideo = secondaryVideoRef.current;
    if (secondaryVideo) {
      secondaryVideo.muted = true;
      secondaryVideo.playbackRate = playbackRate;
    }
    try {
      window.sessionStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify({
        volume,
        muted: isMuted,
        playbackRate,
      }));
    } catch {
      // Player preferences remain active for the current component lifecycle.
    }
  }, [isMuted, playbackRate, volume]);

  useLayoutEffect(() => {
    if (!settingsOpen) return undefined;
    settingsRootRef.current
      ?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !settingsRootRef.current?.contains(target)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const video = videoRef.current;
    if (!previousFocusRef.current && document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }
    // The watch menu can be open when a preroll hands over to this player.
    if (!document.querySelector(".scene-watch-menu")) frameRef.current?.focus({ preventScroll: true });

    return () => {
      if (video) emitPlaybackProgress(video, { force: true });
      video?.pause();
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [emitPlaybackProgress, item.id]);

  useEffect(() => {
    const flushProgress = () => {
      const video = videoRef.current;
      if (video) emitPlaybackProgress(video, { force: true });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushProgress();
    };

    window.addEventListener("pagehide", flushProgress);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushProgress);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [emitPlaybackProgress]);

  useEffect(() => {
    if (isWatch) return;
    if (isMiniplayer) {
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
      return undefined;
    }

    frameRef.current?.focus({ preventScroll: true });
    const layer = layerRef.current;
    const parent = layer?.parentElement;
    if (!layer || !parent) return undefined;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const siblings = Array.from(parent.children)
      .filter((element): element is HTMLElement => (
        element instanceof HTMLElement && element !== layer
      ))
      .map((element) => ({
        element,
        wasInert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));

    for (const { element } of siblings) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      for (const { element, wasInert, ariaHidden } of siblings) {
        element.inert = wasInert;
        if (ariaHidden === null) {
          element.removeAttribute("aria-hidden");
        } else {
          element.setAttribute("aria-hidden", ariaHidden);
        }
      }
    };
  }, [isMiniplayer, isWatch]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === frameRef.current);
      setControlsVisible(true);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;

    const onEnterPictureInPicture = () => setIsPictureInPicture(true);
    const onLeavePictureInPicture = () => setIsPictureInPicture(false);
    video.addEventListener("enterpictureinpicture", onEnterPictureInPicture);
    video.addEventListener("leavepictureinpicture", onLeavePictureInPicture);

    return () => {
      video.removeEventListener("enterpictureinpicture", onEnterPictureInPicture);
      video.removeEventListener("leavepictureinpicture", onLeavePictureInPicture);
    };
  }, [item.id]);

  useEffect(() => {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") {
      return undefined;
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.artist,
      album: "MeeWav · La Scène",
      artwork: [{ src: item.image }],
    });

    const actions: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ["play", () => void playVideo()],
      ["pause", pauseVideo],
      ["seekbackward", (details) => seekBy(-(details.seekOffset ?? 10))],
      ["seekforward", (details) => seekBy(details.seekOffset ?? 10)],
      ["seekto", (details) => {
        const video = videoRef.current;
        if (!video || details.seekTime === undefined) return;
        if (details.fastSeek && "fastSeek" in video) {
          video.fastSeek(details.seekTime);
        } else {
          video.currentTime = details.seekTime;
        }
        if (secondaryVideoRef.current) {
          secondaryVideoRef.current.currentTime = details.seekTime;
        }
        setCurrentTime(details.seekTime);
      }],
    ];

    for (const [action, handler] of actions) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but omit individual actions.
      }
    }

    return () => {
      for (const [action] of actions) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore incomplete Media Session implementations during cleanup.
        }
      }
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
    };
  }, [item.artist, item.image, item.title, pauseVideo, playVideo, seekBy]);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";

    if (
      duration > 0
      && Number.isFinite(duration)
      && "setPositionState" in navigator.mediaSession
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate,
          position: Math.min(Math.max(currentTime, 0), duration),
        });
      } catch {
        // Ignore incomplete implementations and transient invalid media values.
      }
    }
  }, [currentTime, duration, isPlaying, playbackRate]);

  useEffect(() => {
    revealControls();
    return clearControlsTimer;
  }, [clearControlsTimer, isPlaying, revealControls, settingsOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const shortcutLayer = layerRef.current;
      if (
        !shortcutLayer
        || shortcutLayer.inert
        || shortcutLayer.getAttribute("aria-hidden") === "true"
      ) return;
      const target = event.target;
      const targetElement = target instanceof HTMLElement ? target : null;

      if (event.key === "Tab" && !isMiniplayer && !isWatch) {
        const focusable = Array.from(
          layerRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        ).filter((element) => !element.closest('[aria-hidden="true"]'));
        if (focusable.length > 0) {
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          const active = document.activeElement;
          const activeIsFocusable = active instanceof HTMLElement && focusable.includes(active);
          if (event.shiftKey && (active === first || !activeIsFocusable)) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && (active === last || !activeIsFocusable)) {
            event.preventDefault();
            first.focus();
          }
        }
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLocaleLowerCase("fr");
      if (isWatch && !layerRef.current?.contains(target as Node)) return;
      if (key === "escape") {
        if (commentsOpen) {
          setCommentsOpen(false);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (isMiniplayer) {
          setIsMiniplayer(false);
          onMiniplayerChange?.(false);
        } else if (!document.fullscreenElement && !isWatch) {
          closePlayer();
        }
        return;
      }

      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || targetElement?.isContentEditable
      ) {
        return;
      }

      const layer = layerRef.current;
      if (isMiniplayer) {
        const targetInsidePlayer = target instanceof Node && Boolean(layer?.contains(target));
        const focusInsidePlayer = document.activeElement instanceof Node
          && Boolean(layer?.contains(document.activeElement));
        if (!targetInsidePlayer && !focusInsidePlayer) return;
      }

      if (targetElement?.closest("button, a, [role='button'], [role='menuitem'], [role='menuitemradio']")) {
        return;
      }

      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        const video = videoRef.current;
        if (video && duration > 0) {
          const nextTime = (Number(key) / 10) * duration;
          video.currentTime = nextTime;
          if (secondaryVideoRef.current) secondaryVideoRef.current.currentTime = nextTime;
          setCurrentTime(nextTime);
          revealControls();
        }
      } else if (key === " " || key === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (key === "j") {
        event.preventDefault();
        seekBy(-10);
      } else if (key === "l") {
        event.preventDefault();
        seekBy(10);
      } else if (key === "pageup" && isVertical && onPrevious) {
        event.preventDefault();
        onPrevious();
      } else if (key === "pagedown" && isVertical && onNext) {
        event.preventDefault();
        onNext();
      } else if (key === "arrowleft") {
        event.preventDefault();
        seekBy(-5);
      } else if (key === "arrowright") {
        event.preventDefault();
        seekBy(5);
      } else if (key === "arrowup") {
        event.preventDefault();
        changeVolume(volume + 0.05);
      } else if (key === "arrowdown") {
        event.preventDefault();
        changeVolume(volume - 0.05);
      } else if (key === "m") {
        event.preventDefault();
        toggleMuted();
      } else if (key === "f") {
        event.preventDefault();
        void toggleFullscreen();
      } else if (key === "t") {
        event.preventDefault();
        void toggleTheaterMode();
      } else if (key === "i") {
        event.preventDefault();
        void toggleMiniplayer();
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, [
    changeVolume,
    closePlayer,
    commentsOpen,
    duration,
    isMiniplayer,
    isWatch,
    onMiniplayerChange,
    isVertical,
    onNext,
    onPrevious,
    revealControls,
    seekBy,
    settingsOpen,
    toggleFullscreen,
    toggleMiniplayer,
    toggleMuted,
    togglePlayback,
    toggleTheaterMode,
    volume,
  ]);

  const playerStyle = {
    "--shorts-player-progress": `${progress}%`,
    "--shorts-player-buffered": `${bufferedProgress}%`,
    "--shorts-player-poster": `url("${item.image}")`,
  } as CSSProperties;

  const volumeIcon = isMuted || volume === 0
    ? <VolumeX />
    : volume < 0.55
      ? <Volume1 />
      : <Volume2 />;

  return (
    <div
      ref={layerRef}
      className={[
        "shorts-player-layer",
        isWatch ? "is-watch" : "",
        `is-${format}`,
        isVertical ? "is-vertical-feed" : "",
        isAudioVisualizer ? "is-audio-visualizer" : "",
        isTheater ? "is-theater" : "",
        isMiniplayer ? "is-miniplayer" : "",
        controlsVisible || !isPlaying ? "has-visible-controls" : "",
      ].filter(Boolean).join(" ")}
      role={isMiniplayer || isWatch ? "region" : "dialog"}
      aria-modal={isMiniplayer || isWatch ? undefined : true}
      aria-label={`Lecteur de ${item.title}`}
      style={playerStyle}
      onMouseMove={revealControls}
      onPointerDown={revealControls}
    >
      {!isMiniplayer && !isWatch ? (
        <button
          type="button"
          className="shorts-player-layer__backdrop"
          aria-label="Fermer le lecteur"
          tabIndex={-1}
          onClick={closePlayer}
        />
      ) : null}

      {isWatch && !isMiniplayer && <nav className="scene-watch-jumps" aria-label="Sections de la vidéo">{[["scene-watch-comments", "Commentaires"], ["scene-watch-next", "À suivre"]].map(([id, label]) => <a key={id} href={`#${id}`} onClick={(event) => { event.preventDefault(); const section = document.getElementById(id); section?.scrollIntoView({ behavior: "smooth", block: "start" }); section?.focus({ preventScroll: true }); }}>{label}</a>)}</nav>}
      <section
        ref={surfaceRef}
        className="shorts-player-surface"
        aria-label="Vidéo et informations"
      >
        <div
          ref={frameRef}
          className={[
            "shorts-player-frame",
            isFullscreen ? "is-fullscreen" : "",
            item.secondaryVideo ? "has-multicam" : "",
            isAudioVisualizer ? "is-audio-visualizer" : "",
            item.secondaryVideo ? `is-layout-${multicamLayout}` : "",
          ].filter(Boolean).join(" ")}
          tabIndex={-1}
          onPointerDown={beginVerticalSwipe}
          onPointerUp={completeVerticalSwipe}
          onPointerCancel={() => { verticalSwipeStartRef.current = null; }}
          onMouseLeave={() => {
            if (isPlaying && !settingsOpen) setControlsVisible(false);
          }}
        >
          <div className="shorts-player-frame__portrait-backdrop" aria-hidden="true" />
          {isAudioVisualizer ? (
            <div className="scene-audio-visualizer" aria-hidden="true">
              <img src={item.image} alt="" />
              <span className="scene-audio-visualizer__halo" />
              <span className="scene-audio-visualizer__bars">
                {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
              </span>
            </div>
          ) : null}
          <video
            ref={videoRef}
            key={item.id}
            className="shorts-player-video is-primary"
            src={source}
            poster={item.image}
            autoPlay
            playsInline
            preload="metadata"
            aria-label={`Lecture de ${item.title}`}
            onClick={handleVideoClick}
            onDoubleClick={() => void toggleFullscreen()}
            onLoadStart={() => setIsBuffering(true)}
            onWaiting={() => setIsBuffering(true)}
            onStalled={() => setIsBuffering(true)}
            onCanPlay={() => setIsBuffering(false)}
            onPlaying={() => {
              setIsBuffering(false);
              setHasEnded(false);
            }}
            onPlay={() => {
              claimPlaybackSlot();
              if (analyticsStartedItemRef.current !== item.id) {
                analyticsStartedItemRef.current = item.id;
                trackSceneAnalytics({ event: "video_started", mediaId: item.id });
              }
              setIsPlaying(true);
              const secondaryVideo = secondaryVideoRef.current;
              if (secondaryVideo) {
                secondaryVideo.currentTime = videoRef.current?.currentTime ?? 0;
                void secondaryVideo.play().catch(() => undefined);
              }
            }}
            onPause={() => {
              secondaryVideoRef.current?.pause();
              mediaLeaseRef.current?.pause("user");
              setIsPlaying(false);
              const video = videoRef.current;
              if (video) emitPlaybackProgress(video, { force: true });
            }}
            onLoadedMetadata={(event) => {
              setMediaError(false);
              event.currentTarget.volume = volume;
              event.currentTarget.muted = isMuted;
              event.currentTarget.playbackRate = playbackRate;
              setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
              applyInitialTime(event.currentTarget);
            }}
            onDurationChange={(event) => {
              setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
              applyInitialTime(event.currentTarget);
            }}
            onTimeUpdate={(event) => {
              const nextTime = event.currentTarget.currentTime;
              setCurrentTime(nextTime);
              const secondaryVideo = secondaryVideoRef.current;
              if (secondaryVideo && Math.abs(secondaryVideo.currentTime - nextTime) > 0.35) {
                secondaryVideo.currentTime = nextTime;
              }
              emitPlaybackProgress(event.currentTarget);
              const mediaDuration = event.currentTarget.duration;
              if (Number.isFinite(mediaDuration) && mediaDuration > 0) {
                const percent = (nextTime / mediaDuration) * 100;
                for (const milestone of [25, 50, 75] as const) {
                  if (percent >= milestone && !analyticsMilestonesRef.current.has(milestone)) {
                    analyticsMilestonesRef.current.add(milestone);
                    trackSceneAnalytics({
                      event: `video_${milestone}` as "video_25" | "video_50" | "video_75",
                      mediaId: item.id,
                    });
                  }
                }
              }
            }}
            onProgress={(event) => {
              const ranges = event.currentTarget.buffered;
              setBuffered(ranges.length > 0 ? ranges.end(ranges.length - 1) : 0);
            }}
            onEnded={(event) => {
              if (repeatCurrent) { event.currentTarget.currentTime = 0; void event.currentTarget.play().catch(() => setIsPlaying(false)); return; }
              secondaryVideoRef.current?.pause();
              mediaLeaseRef.current?.release({ pause: false });
              mediaLeaseRef.current = null;
              setIsPlaying(false);
              setHasEnded(true);
              setControlsVisible(true);
              trackSceneAnalytics({ event: "video_completed", mediaId: item.id });
              emitPlaybackProgress(event.currentTarget, { force: true, completed: true });
            }}
            onError={() => {
              mediaLeaseRef.current?.release({ pause: false });
              mediaLeaseRef.current = null;
              setMediaError(true);
              setIsPlaying(false);
              setControlsVisible(true);
              onNotify("Cette vidéo n’a pas pu être chargée. Tu peux réessayer.");
            }}
          />
          {item.secondaryVideo ? (
            <video
              ref={secondaryVideoRef}
              key={`${item.id}-secondary`}
              className="shorts-player-video is-secondary"
              src={item.secondaryVideo}
              muted
              autoPlay
              playsInline
              preload="metadata"
              aria-label={`Seconde caméra de ${item.title}`}
              onClick={handleVideoClick}
              onDoubleClick={() => void toggleFullscreen()}
              onLoadedMetadata={(event) => {
                event.currentTarget.muted = true;
                event.currentTarget.playbackRate = playbackRate;
                event.currentTarget.currentTime = videoRef.current?.currentTime ?? 0;
              }}
            />
          ) : null}

          <div className="shorts-player-frame__top">
            <div>
              <strong>{item.title}</strong>
              <span>{item.artist}</span>
            </div>
            <div>
              {isMiniplayer ? (
                <button
                  type="button"
                  aria-label="Agrandir le lecteur"
                  title="Agrandir"
                  onClick={() => void toggleMiniplayer()}
                >
                  <Expand />
                </button>
              ) : null}
              <button type="button" aria-label="Fermer le lecteur" title="Fermer" onClick={closePlayer}>
                <X />
              </button>
            </div>
          </div>

          {mediaError ? (
            <div className="shorts-player-frame__error" role="status">
              <AlertTriangle />
              <strong>Lecture impossible</strong>
              <span>La vidéo n’a pas pu être chargée.</span>
              <button type="button" onClick={retryPlayback}>Réessayer</button>
            </div>
          ) : isBuffering && !hasEnded ? (
            <div className="shorts-player-frame__buffering" role="status" aria-label="Chargement de la vidéo">
              <LoaderCircle />
              <span>Chargement</span>
            </div>
          ) : hasEnded && isVertical && nextItem && onNext ? (
            <button
              type="button"
              className="shorts-player-frame__central-play is-next"
              aria-label={`Lire la création suivante : ${nextItem.title}`}
              onClick={onNext}
            >
              <ChevronDown />
              <span>Création suivante</span>
            </button>
          ) : hasEnded ? (
            <button
              type="button"
              className="shorts-player-frame__central-play is-replay"
              aria-label="Rejouer la vidéo"
              onClick={() => void playVideo()}
            >
              <RotateCcw />
            </button>
          ) : !isPlaying ? (
            <button
              type="button"
              className="shorts-player-frame__central-play"
              aria-label="Lire la vidéo"
              onClick={togglePlayback}
            >
              <Play fill="currentColor" />
            </button>
          ) : null}

          <div className="shorts-player-controls" onClick={(event) => event.stopPropagation()}>
            <label className="shorts-player-timeline">
              <span className="sr-only">Position de lecture</span>
              <input
                type="range"
                min="0"
                max={duration || 0}
                step="0.05"
                value={Math.min(currentTime, duration || 0)}
                aria-label="Position de lecture"
                disabled={duration <= 0 || mediaError}
                onChange={(event) => {
                  const video = videoRef.current;
                  const nextTime = Number(event.currentTarget.value);
                  if (video) video.currentTime = nextTime;
                  if (secondaryVideoRef.current) {
                    secondaryVideoRef.current.currentTime = nextTime;
                  }
                  setCurrentTime(nextTime);
                  revealControls();
                }}
              />
            </label>

            <div className="shorts-player-controls__row">
              <div className="shorts-player-controls__left">
                <button
                  type="button"
                  aria-label={isPlaying ? "Mettre en pause (k)" : "Lire (k)"}
                  title={isPlaying ? "Pause (k)" : "Lire (k)"}
                  onClick={togglePlayback}
                >
                  {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
                </button>
                {isWatch && onNext && <button type="button" aria-label={`Vidéo suivante : ${nextItem?.title ?? "À suivre"}`} title="Vidéo suivante" onClick={onNext}><SkipForward fill="currentColor" /></button>}
                <div className="shorts-player-volume">
                  <button
                    type="button"
                    aria-label={isMuted ? "Activer le son (m)" : "Couper le son (m)"}
                    title={isMuted ? "Activer le son (m)" : "Couper le son (m)"}
                    onClick={toggleMuted}
                  >
                    {volumeIcon}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={isMuted ? 0 : volume}
                    aria-label="Volume"
                    onChange={(event) => changeVolume(Number(event.currentTarget.value))}
                  />
                </div>
                <span className="shorts-player-time">
                  {formatTime(currentTime)} <i>/</i> {formatTime(duration)}
                </span>
              </div>

              <div className="shorts-player-controls__right">
                <div ref={settingsRootRef} className="shorts-player-settings">
                  <button
                    ref={settingsButtonRef}
                    type="button"
                    className={settingsOpen ? "is-active" : undefined}
                    aria-label={`Réglages, vitesse ${playbackRate}×`}
                    aria-expanded={settingsOpen}
                    aria-haspopup="menu"
                    title="Réglages"
                    onClick={() => {
                      setSettingsOpen((current) => !current);
                      setControlsVisible(true);
                    }}
                  >
                    <Settings />
                  </button>
                  {settingsOpen ? (
                    <div
                      className="shorts-player-settings__menu"
                      role="menu"
                      aria-label="Vitesse de lecture"
                      onKeyDown={handleSettingsMenuKeyDown}
                    >
                      <header><Gauge /><span>Vitesse de lecture</span></header>
                      {PLAYBACK_RATES.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          role="menuitemradio"
                          aria-checked={playbackRate === rate}
                          onClick={() => changePlaybackRate(rate)}
                        >
                          <span>{rate === 1 ? "Normale" : `${rate}×`}</span>
                          {playbackRate === rate ? <i /> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  className={isPictureInPicture ? "is-active" : undefined}
                  aria-label="Mode image dans l’image"
                  title="Image dans l’image"
                  disabled={!pictureInPictureSupported}
                  onClick={() => void togglePictureInPicture()}
                >
                  <PictureInPicture2 />
                </button>
                <button
                  type="button"
                  className={isMiniplayer ? "is-active" : undefined}
                  aria-label={isMiniplayer ? "Agrandir le lecteur" : "Réduire en mini-lecteur (i)"}
                  title={isMiniplayer ? "Agrandir" : "Mini-lecteur (i)"}
                  onClick={() => void toggleMiniplayer()}
                >
                  {isMiniplayer ? <Expand /> : <Minimize />}
                </button>
                {!isMiniplayer ? (
                  <button
                    type="button"
                    className={isTheater ? "is-active" : undefined}
                    aria-label={isTheater ? "Quitter le mode cinéma (t)" : "Mode cinéma (t)"}
                    title={isTheater ? "Quitter le mode cinéma (t)" : "Mode cinéma (t)"}
                    onClick={() => void toggleTheaterMode()}
                  >
                    <MonitorUp />
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-label={isFullscreen ? "Quitter le plein écran (f)" : "Plein écran (f)"}
                  title={isFullscreen ? "Quitter le plein écran (f)" : "Plein écran (f)"}
                  onClick={() => void toggleFullscreen()}
                >
                  {isFullscreen ? <Minimize /> : <Maximize />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {isVertical ? (
          <nav className="scene-vertical-player__navigation" aria-label="Parcourir les Shorts">
            <button
              type="button"
              disabled={!previousItem || !onPrevious}
              aria-label={previousItem ? `Création précédente : ${previousItem.title}` : "Aucune création précédente"}
              onClick={onPrevious}
            >
              <ChevronUp />
            </button>
            {verticalPosition ? (
              <span aria-label={`Création ${verticalPosition.index} sur ${verticalPosition.total}`}>
                <strong>{String(verticalPosition.index).padStart(2, "0")}</strong>
                <i />
                <small>{String(verticalPosition.total).padStart(2, "0")}</small>
              </span>
            ) : null}
            <button
              type="button"
              disabled={!nextItem || !onNext}
              aria-label={nextItem ? `Création suivante : ${nextItem.title}` : "Aucune création suivante"}
              onClick={onNext}
            >
              <ChevronDown />
            </button>
            <em>Balaye pour continuer</em>
          </nav>
        ) : null}

        {!isMiniplayer ? (
          <div className="shorts-player-details">
            {!isVertical ? <div className="shorts-player-details__headline">
              <div>
                <span className="shorts-player-details__eyebrow">{item.role} · {item.city}</span>
                <h2>{item.title}</h2>
                <p>
                  <span className="shorts-player-details__identity">
                    {isWatch ? <a href={artistHref} className="scene-watch-creator" onClick={(event) => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onViewProfile?.(); }}><img src={item.image} alt="" /><strong>{item.artist}</strong></a> : <strong>{item.artist}</strong>}
                    <MeewavGradeBadge
                      level={item.gradeLevel ?? 1}
                      size="sm"
                      variant="icon"
                      labelMode="none"
                      title={`Grade MeeWav de ${item.artist}`}
                    />
                  </span>
                  {isWatch && onToggleFollow && <button className="scene-watch-follow" aria-pressed={following} disabled={followPending} onClick={onToggleFollow}>{followPending ? "…" : following ? "Suivi" : "Suivre"}</button>}
                  <small>{item.meta} · {item.views}</small>
                </p>
              </div>
            </div> : null}
            <div className="shorts-player-details__toolbar">
              <ShortsReactionButtons
                variant="player"
                artistName={item.artist}
                likeCount={item.likeCount ?? 0}
                goldenLikeCount={item.goldenLikeCount ?? 0}
                liked={liked}
                goldenGiven={goldenGiven}
                goldenUnavailable={goldenUnavailable}
                onToggleLike={onToggleLike}
                onGiveGoldenLike={onGiveGoldenLike}
                goldenFeedback={goldenBurst ? <LiveActionBurst kind="golden" /> : undefined}
              />
              <div className="shorts-player-details__actions">
                <button
                  type="button"
                  className={isSaved ? "is-saved" : ""}
                  aria-pressed={isSaved}
                  disabled={!onToggleSaved}
                  onClick={onToggleSaved}
                >
                  <Heart fill={isSaved ? "currentColor" : "none"} />
                  {isWatch ? isSaved ? "Enregistré" : "Enregistrer" : isSaved ? "Dans ma sélection" : "Ma sélection"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (isWatch) {
                      document.getElementById("scene-watch-comments")?.scrollIntoView({ behavior: "smooth", block: "start" });
                      return;
                    }
                    if (isVertical) setVerticalContextTab("comments");
                    setCommentsOpen(true);
                  }}
                >
                  <MessagesSquare /> Commenter
                </button>
                {isWatch ? <details className="scene-watch-more"><summary>Plus d’actions</summary><div>
                <button
                  type="button"
                  disabled={!onContact}
                  onClick={onContact}
                >
                  <MessageCircle /> Contacter
                </button>
                <button
                  type="button"
                  className="shorts-player-action is-collab"
                  disabled={!onCollaborate}
                  onClick={onCollaborate}
                >
                  <BriefcaseBusiness /> Demande de collab
                </button>
                <button
                  type="button"
                  disabled={!onViewProfile}
                  onClick={onViewProfile}
                >
                  <UsersRound /> Voir le profil
                </button>
                </div></details> : <>
                <button
                  type="button"
                  disabled={!onContact}
                  onClick={onContact}
                >
                  <MessageCircle /> Contacter
                </button>
                <button
                  type="button"
                  className="shorts-player-action is-collab"
                  disabled={!onCollaborate}
                  onClick={onCollaborate}
                >
                  <BriefcaseBusiness /> Demande de collab
                </button>
                <button
                  type="button"
                  disabled={!onViewProfile}
                  onClick={onViewProfile}
                >
                  <UsersRound /> Voir le profil
                </button>
                </>}
                <button
                  type="button"
                  disabled={!onShare}
                  onClick={onShare}
                >
                  <Share2 /> Partager
                </button>
              </div>
            </div>
            {isVertical || isWatch ? (
              <article className={`scene-short-publication${shortInfoExpanded ? " is-expanded" : ""}`}>
                <header>
                  <div>
                    <h2>{item.title}</h2>
                    <p>
                      <span className="scene-short-publication__artist">
                        <strong>{item.artist}</strong>
                        <MeewavGradeBadge level={item.gradeLevel ?? 1} size="sm" variant="icon" labelMode="none" title={`Grade MeeWav de ${item.artist}`} />
                      </span>
                      <span className="scene-short-publication__date"><CalendarDays aria-hidden="true" />{formatPublicationDate(item.publishedAt)} · {item.views}</span>
                    </p>
                  </div>
                  {canEditInfo && onUpdateInfo ? <button type="button" className="scene-short-publication__edit" onClick={() => setInfoEditorOpen(true)}><Pencil aria-hidden="true" /> Modifier les informations</button> : null}
                </header>
                {item.description ? <p className="scene-short-publication__description">{item.description}</p> : null}
                {shortInfoExpanded ? <ShortPublicationSections item={item} /> : null}
                {(Boolean(item.description && item.description.length > 90) || Boolean(item.publicationLinks?.length) || Boolean(item.credits?.length) || Boolean(item.associatedContent) || Boolean(item.hashtags?.length)) ? (
                  <>
                    <button type="button" className="scene-short-publication__more is-desktop" onClick={() => setShortInfoExpanded((current) => !current)}>{shortInfoExpanded ? "Réduire" : "Afficher plus"}</button>
                    <button type="button" className="scene-short-publication__more is-mobile" onClick={() => setMobileInfoOpen(true)}>… plus</button>
                  </>
                ) : null}
              </article>
            ) : null}
            {(isVertical || isWatch) && infoEditorOpen && canEditInfo && onUpdateInfo ? (
              <ShortInfoEditor
                draft={infoDraft}
                onDraft={setInfoDraft}
                onClose={() => setInfoEditorOpen(false)}
                onSave={() => {
                  const links = infoDraft.links.map((link) => ({ label: link.label.trim(), url: link.url.trim() })).filter(usableLink);
                  const credits = infoDraft.credits.map((credit) => ({ name: credit.name.trim(), role: credit.role?.trim() || undefined })).filter((credit) => credit.name);
                  onUpdateInfo({
                    title: infoDraft.title.trim() || item.title,
                    description: infoDraft.description.trim() || undefined,
                    publicationLinks: links.length > 0 ? links : undefined,
                    credits: credits.length > 0 ? credits : undefined,
                    associatedContent: infoDraft.associatedContent?.label.trim() ? { ...infoDraft.associatedContent, label: infoDraft.associatedContent.label.trim(), url: usableExternalUrl(infoDraft.associatedContent.url) } : undefined,
                    hashtags: normalizeHashtags(infoDraft.hashtags),
                  });
                  setInfoEditorOpen(false);
                }}
              />
            ) : null}
            <div className="shorts-player-details__meta">
              <span>Raccourcis : espace/K lecture · J/L ±10 s · M son · F plein écran · T cinéma · I mini-lecteur</span>
              {item.availability ? <em><i /> {item.availability}</em> : null}
            </div>
          </div>
        ) : null}

        {isVertical && !isMiniplayer ? (
          <aside className="scene-vertical-context" aria-label="Panneau du Short">
            <nav aria-label="Panneau contextuel">
              {([
                ["comments", "Commentaires"],
                ["next", "À suivre"],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={verticalContextTab === id}
                  onClick={() => setVerticalContextTab(id)}
                >
                  {label}
                </button>
              ))}
            </nav>

            {verticalContextTab === "comments" ? (
              <section className="scene-vertical-context__comments" aria-label="Aperçu des commentaires">
                <header>
                  <div><span>Discussion</span><strong>Commentaires</strong></div>
                  <button type="button" onClick={() => setCommentsOpen(true)}>Participer</button>
                </header>
                <div>
                  {verticalComments.length > 0 ? verticalComments.map((comment) => (
                    <article key={comment.id}>
                      <img src={comment.authorAvatarUrl} alt="" loading="lazy" />
                      <p><strong>{comment.authorName}</strong><span>{comment.body}</span></p>
                      <small>{comment.likeCount}</small>
                    </article>
                  )) : (
                    <p className="scene-vertical-context__empty">Ouvre la discussion et sois la première personne à réagir.</p>
                  )}
                </div>
                <button type="button" className="scene-vertical-context__primary" onClick={() => setCommentsOpen(true)}>
                  <MessagesSquare /> Voir tous les commentaires
                </button>
              </section>
            ) : null}

            {verticalContextTab === "next" ? (
              <section className="scene-vertical-context__next" aria-label="Créations à suivre">
                <header><span>Sélection continue</span><strong>À suivre</strong></header>
                {nextItem && onNext ? (
                  <button type="button" onClick={onNext}>
                    <img src={nextItem.image} alt="" loading="lazy" />
                    <span><strong>{nextItem.title}</strong><small>{nextItem.artist}</small></span>
                    <ChevronDown />
                  </button>
                ) : null}
                {previousItem && onPrevious ? (
                  <button type="button" onClick={onPrevious}>
                    <img src={previousItem.image} alt="" loading="lazy" />
                    <span><strong>{previousItem.title}</strong><small>{previousItem.artist}</small></span>
                    <ChevronUp />
                  </button>
                ) : null}
              </section>
            ) : null}

          </aside>
        ) : null}
        {isVertical && mobileInfoOpen && !isMiniplayer ? (
          <div className="scene-short-info-sheet" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) setMobileInfoOpen(false); }}>
            <section role="dialog" aria-modal="true" aria-label={`Informations de ${item.title}`}>
              <header><span><strong>{item.title}</strong><small>{item.artist} · {formatPublicationDate(item.publishedAt)} · {item.views}</small></span><button type="button" onClick={() => setMobileInfoOpen(false)} aria-label="Fermer"><X aria-hidden="true" /></button></header>
              {item.description ? <p>{item.description}</p> : null}
              <ShortPublicationSections item={item} />
            </section>
          </div>
        ) : null}
        {isWatch && !isMiniplayer ? typeof watchContent === "function" ? watchContent((seconds) => { const video = videoRef.current; if (video) { video.currentTime = Math.max(0, Math.min(seconds, Number.isFinite(video.duration) ? video.duration : seconds)); setCurrentTime(video.currentTime); } }) : watchContent : null}
      </section>
      {isWatch && !isMiniplayer ? recommendations : null}
      {commentsOpen && !isMiniplayer ? (
        <SceneCommentsDrawer
          videoId={item.id}
          videoTitle={item.title}
          onClose={() => setCommentsOpen(false)}
          onNotify={onNotify}
        />
      ) : null}
    </div>
  );
}
