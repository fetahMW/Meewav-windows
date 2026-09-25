// Port of the shared Rooms pre-profile from Meewav-Web. Original presentation and media controls;
// standalone demo data and callbacks replace authentication, analytics and messaging services.
import { demoFollowedProfiles } from "./demoFollowState";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ChevronLeft,
  Camera,
  Check,
  ExternalLink,
  HeartHandshake,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UsersRound,
} from "lucide-react";

import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import { getGradeBadgeMeta, normalizeOptionalGradeLevel } from "../../../grades/gradeBadges";
import {
  demoPreProfileArtist,
  type PreProfileDemoArtist,
} from "./demoPreProfileArtist";
import { GoldenLikeCounter } from "../../../goldenLikes/GoldenLikeCounter";
import "./HoverPreProfileContent.css";
import "./HoverPreProfileVisitor.css";
import "./pre-profile-black-glass.css";

type HoverPreProfileContentProps = {
  showMapPin?: boolean;
  demoFollow?: boolean;
  artist?: PreProfileDemoArtist | null;
  pinnedColor?: string | null;
  onFollow?: (artistId: string) => void;
  onOpenProfile?: (artistId: string) => void;
  onConsult?: (artistId: string, kind: "profile" | "audio" | "video") => void;
  onPin?: (artistId: string, color: string, active: boolean) => void;
  showRestoreAvatar?: boolean;
  onRestoreAvatar?: (artistId: string) => void;
  onCollabRequest?: (artistId: string) => void;
  senderProfileId?: string;
  onContact?: (artistId: string) => void;
  isOwner?: boolean;
  isPubliclyVisible?: boolean;
  onPublicVisibilityChange?: (visible: boolean) => void;
  onInteractionLockChange?: (locked: boolean) => void;
};

type PreProfileTab = "overview" | "shorts" | "audio";

type PlayingMedia =
  | null
  | { type: "audio"; id: string }
  | { type: "short"; id: string };
type EditableMediaType = "short" | "audio";
type MediaRailType = "shorts" | "audio";
type MediaEditState = {
  removedKeys: string[];
  replacementNames: Record<string, string>;
};
type SavedHostProfile = {
  bio: string;
  portraitUrl: string;
  media: MediaEditState;
};


const BIO_MAX_LENGTH = 180;
const EMPTY_MEDIA_EDITS: MediaEditState = {
  removedKeys: [],
  replacementNames: {},
};
const savedHostProfiles = new Map<string, SavedHostProfile>();
const OVERVIEW_WAVE_HEIGHTS = [
  5, 11, 7, 16, 9, 13, 6, 18, 8, 12, 5, 15,
  10, 7, 17, 6, 12, 9, 14, 5, 11, 7, 9, 4,
];

const TABS: Array<{ id: PreProfileTab; label: string }> = [
  { id: "overview", label: "Aperçu" },
  { id: "shorts", label: "Vidéo" },
  { id: "audio", label: "Audio" },
];

const VISITOR_PIN_COLOR_ALIASES: Record<string, string> = {
  "#A66BFF": "#C026FF",
  "#C026FF": "#C026FF",
  "#22D3EE": "#16BDDB",
  "#EC4899": "#FF2FA6",
  "#FF2FA6": "#FF2FA6",
  "#F59E0B": "#F29A18",
  "#22C55E": "#20AD59",
};

function getVisitorPinColor(color: string | null) {
  if (!color) return null;
  return VISITOR_PIN_COLOR_ALIASES[color.toUpperCase()] ?? color;
}

function getMediaEditKey(type: EditableMediaType, id: string) {
  return `${type}:${id}`;
}

function chooseLocalFile(accept: string, onSelect: (file: File) => void) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.hidden = true;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) onSelect(file);
    input.remove();
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

export function HoverPreProfileContent({
  showMapPin = true,
  demoFollow = false,
  artist: artistInput,
  pinnedColor = null,
  onFollow,
  onOpenProfile,
  onConsult,
  onPin,
  showRestoreAvatar = false,
  onRestoreAvatar,
  onCollabRequest,
  senderProfileId = "current-host",
  onContact,
  isOwner = false,
  isPubliclyVisible = true,
  onPublicVisibilityChange,
  onInteractionLockChange,
}: HoverPreProfileContentProps) {
  const seedArtist = artistInput ?? demoPreProfileArtist;
  const artist = seedArtist;
  const pinColors = isOwner
    ? artist.pinColors
    : artist.pinColors.map((color) => getVisitorPinColor(color) ?? color);
  const defaultVisitorPinColor = getVisitorPinColor(seedArtist.pinColors[0] ?? null);
  const artistGradeLevel = normalizeOptionalGradeLevel(
    artist.grade_level ?? artist.gradeLevel ?? artist.gradeStars ?? artist.grade_stars,
  );
  const artistGradeMeta = artistGradeLevel === null ? null : getGradeBadgeMeta(artistGradeLevel);
  const collaborationUnavailable = !isOwner && !artist.stats.collabAvailable;
  const collaborationActionDisabled = collaborationUnavailable;
  const initialGoldenLikesCount = Math.max(0, artist.golden_likes_count ?? artist.goldenLikesCount ?? 0);
  const cachedHostProfile = isOwner ? savedHostProfiles.get(artist.id) : null;
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [goldenLikesCount, setGoldenLikesCount] = useState(initialGoldenLikesCount);
  const [goldenLikeGivenToday, setGoldenLikeGivenToday] = useState(false);
  const [selectedPinColor, setSelectedPinColor] = useState<string | null>(() => (
    isOwner
      ? pinnedColor
      : getVisitorPinColor(pinnedColor)
        ?? defaultVisitorPinColor
  ));
  const [isPinned, setIsPinned] = useState(false);
  const isCollabComposerOpen = false;
  const [activeTab, setActiveTab] = useState<PreProfileTab>("overview");
  const [playingMedia, setPlayingMedia] = useState<PlayingMedia>(null);
  const [audioProgress, setAudioProgress] = useState(0);
  const [portraitLoaded, setPortraitLoaded] = useState(true);
  const [isOwnerEditing, setIsOwnerEditing] = useState(false);
  const [savedBio, setSavedBio] = useState(cachedHostProfile?.bio ?? artist.bio);
  const [bioDraft, setBioDraft] = useState(cachedHostProfile?.bio ?? artist.bio);
  const [savedPortraitUrl, setSavedPortraitUrl] = useState(cachedHostProfile?.portraitUrl ?? artist.portraitUrl);
  const [portraitDraftUrl, setPortraitDraftUrl] = useState(cachedHostProfile?.portraitUrl ?? artist.portraitUrl);
  const [savedMediaEdits, setSavedMediaEdits] = useState<MediaEditState>(cachedHostProfile?.media ?? EMPTY_MEDIA_EDITS);
  const [mediaDraftEdits, setMediaDraftEdits] = useState<MediaEditState>(cachedHostProfile?.media ?? EMPTY_MEDIA_EDITS);
  const [openMediaMenuKey, setOpenMediaMenuKey] = useState<string | null>(null);
  const mediaRailRefs = useRef<Record<MediaRailType, HTMLDivElement | null>>({
    shorts: null,
    audio: null,
  });
  const mediaRailMotionRef = useRef<{
    rail: HTMLDivElement;
    rafId: number;
    target: number;
    lastFrameTime: number;
  } | null>(null);
  const railDragRef = useRef<{
    rail: HTMLDivElement;
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
  } | null>(null);
  const suppressRailClickRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const interactionLockChangeRef = useRef(onInteractionLockChange);
  interactionLockChangeRef.current = onInteractionLockChange;

  useEffect(() => {
    const cachedProfile = isOwner ? savedHostProfiles.get(seedArtist.id) : null;
    const nextBio = cachedProfile?.bio ?? seedArtist.bio;
    const nextPortraitUrl = cachedProfile?.portraitUrl ?? seedArtist.portraitUrl;
    const nextMedia = cachedProfile?.media ?? EMPTY_MEDIA_EDITS;
    setIsFollowing(!isOwner && demoFollowedProfiles.has(seedArtist.id));
    setIsFollowPending(false);
    setSelectedPinColor(
      isOwner
        ? pinnedColor
        : getVisitorPinColor(pinnedColor)
          ?? defaultVisitorPinColor,
    );
    setIsPinned(Boolean(pinnedColor));
    setActiveTab("overview");
    setPlayingMedia(null);
    setAudioProgress(0);
    setPortraitLoaded(true);
    setIsOwnerEditing(false);
    setSavedBio(nextBio);
    setBioDraft(nextBio);
    setSavedPortraitUrl(nextPortraitUrl);
    setPortraitDraftUrl(nextPortraitUrl);
    setSavedMediaEdits(nextMedia);
    setMediaDraftEdits(nextMedia);
    setOpenMediaMenuKey(null);
  }, [seedArtist.id, seedArtist.bio, seedArtist.portraitUrl, defaultVisitorPinColor, isOwner, pinnedColor, demoFollow]);

  useEffect(() => () => interactionLockChangeRef.current?.(false), []);

  useEffect(() => () => {
    audioRef.current?.pause();
    videoRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!openMediaMenuKey) return;

    const closeMediaMenu = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".mw-preprofile__media-menu")) return;
      setOpenMediaMenuKey(null);
    };

    document.addEventListener("pointerdown", closeMediaMenu, true);
    return () => document.removeEventListener("pointerdown", closeMediaMenu, true);
  }, [openMediaMenuKey]);

  const startOwnerEditing = () => {
    if (!isOwner) return;
    interactionLockChangeRef.current?.(false);
    onOpenProfile?.(artist.id);
  };

  const finishOwnerEditing = () => {
    const nextBio = bioDraft.trim() || savedBio;
    setSavedBio(nextBio);
    setBioDraft(nextBio);
    setSavedPortraitUrl(portraitDraftUrl);
    setSavedMediaEdits(mediaDraftEdits);
    savedHostProfiles.set(artist.id, {
      bio: nextBio,
      portraitUrl: portraitDraftUrl,
      media: mediaDraftEdits,
    });
    interactionLockChangeRef.current?.(false);
    setOpenMediaMenuKey(null);
    setIsOwnerEditing(false);
    window.dispatchEvent(new CustomEvent("meewav:host-profile-updated", {
      detail: {
        artistId: artist.id,
        bio: nextBio,
        portraitUrl: portraitDraftUrl,
        media: mediaDraftEdits,
      },
    }));
  };

  const cancelOwnerEditing = () => {
    setBioDraft(savedBio);
    setPortraitDraftUrl(savedPortraitUrl);
    setMediaDraftEdits(savedMediaEdits);
    setSelectedPinColor(pinnedColor);
    setIsPinned(Boolean(pinnedColor));
    interactionLockChangeRef.current?.(false);
    setOpenMediaMenuKey(null);
    setIsOwnerEditing(false);
  };

  const replacePortrait = () => {
    chooseLocalFile("image/*", (file) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        if (typeof reader.result !== "string") return;
        setPortraitDraftUrl(reader.result);
        setPortraitLoaded(true);
      }, { once: true });
      reader.readAsDataURL(file);
    });
  };

  const handleFollow = () => {
    if (isOwner) { startOwnerEditing(); return; }
    const next = !isFollowing;
    setIsFollowing(next);
    if (next) demoFollowedProfiles.add(artist.id);
    else demoFollowedProfiles.delete(artist.id);
    onFollow?.(artist.id);
  };

  const handlePinColor = (color: string) => {
    setSelectedPinColor(color);
    if (isOwner && isOwnerEditing) {
      setIsPinned(true);
      return;
    }

    if (isOwner) {
      setIsPinned(true);
      onPin?.(artist.id, color, true);
      return;
    }

    if (isPinned) onPin?.(artist.id, color, false);
    setIsPinned(false);
  };

  const handlePinClick = () => {
    if (!selectedPinColor) return;
    if (isOwner && !isOwnerEditing) return;

    const next = !isPinned;
    setIsPinned(next);
    onPin?.(artist.id, selectedPinColor, next);
  };

  const handleTabClick = (tabId: PreProfileTab) => {
    setOpenMediaMenuKey(null);
    setActiveTab(tabId);
    setPlayingMedia((current) => {
      if (current?.type === "short" && tabId !== "shorts") return null;
      return current;
    });
  };

  const handleShortSelect = (shortId: string) => {
    audioRef.current?.pause();
    setAudioProgress(0);
    onConsult?.(artist.id, "video");

    setActiveTab("shorts");
    setPlayingMedia({ type: "short", id: shortId });
  };

  const handleAudioToggle = (audioId: string) => {
    const isAlreadyPlaying = playingMedia?.type === "audio" && playingMedia.id === audioId;
    if (!isAlreadyPlaying) {
      onConsult?.(artist.id, "audio");
  
    }
    if (isAlreadyPlaying) {
      audioRef.current?.pause();
      setPlayingMedia(null);
      setAudioProgress(0);
      return;
    }

    videoRef.current?.pause();
    audioRef.current?.pause();
    setAudioProgress(0);
    setPlayingMedia({ type: "audio", id: audioId });
  };

  const handleCollabRequest = () => {
    if (collaborationActionDisabled) return;
    setPlayingMedia(null);
    onCollabRequest?.(artist.id);
  };
  const handleContact = () => { setPlayingMedia(null); onContact?.(artist.id); };

  const syncMediaRailUi = useCallback((rail: HTMLDivElement) => {
    const panel = rail.closest<HTMLElement>(".mw-preprofile__media-panel");
    if (!panel) return;

    const scrollWidth = Math.max(rail.scrollWidth, 1);
    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const normalizedScrollLeft = Math.min(Math.max(rail.scrollLeft, 0), maxScrollLeft);
    const thumbWidth = Math.min(100, Math.max(18, (rail.clientWidth / scrollWidth) * 100));
    const thumbLeft = maxScrollLeft > 0
      ? (normalizedScrollLeft / scrollWidth) * 100
      : 0;

    panel.style.setProperty("--mw-rail-thumb-width", `${thumbWidth}%`);
    panel.style.setProperty("--mw-rail-thumb-left", `${thumbLeft}%`);

    const previousButton = panel.querySelector<HTMLButtonElement>("[data-rail-direction='previous']");
    const nextButton = panel.querySelector<HTMLButtonElement>("[data-rail-direction='next']");
    if (previousButton) previousButton.disabled = normalizedScrollLeft <= 1;
    if (nextButton) nextButton.disabled = normalizedScrollLeft >= maxScrollLeft - 1;
  }, []);

  const cancelMediaRailMotion = useCallback((rail?: HTMLDivElement) => {
    const motion = mediaRailMotionRef.current;
    if (!motion || (rail && motion.rail !== rail)) return;

    window.cancelAnimationFrame(motion.rafId);
    mediaRailMotionRef.current = null;
  }, []);

  const animateMediaRailTo = useCallback((rail: HTMLDivElement, target: number) => {
    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const clampedTarget = Math.min(Math.max(target, 0), maxScrollLeft);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cancelMediaRailMotion(rail);
      rail.scrollLeft = clampedTarget;
      syncMediaRailUi(rail);
      return;
    }

    const activeMotion = mediaRailMotionRef.current;
    if (activeMotion?.rail === rail) {
      activeMotion.target = clampedTarget;
      return;
    }

    cancelMediaRailMotion();
    const motion = {
      rail,
      rafId: 0,
      target: clampedTarget,
      lastFrameTime: window.performance.now(),
    };

    const tick = (frameTime: number) => {
      if (mediaRailMotionRef.current !== motion) return;

      const elapsed = Math.min(Math.max(frameTime - motion.lastFrameTime, 1), 34);
      motion.lastFrameTime = frameTime;
      const distance = motion.target - rail.scrollLeft;
      const easing = 1 - Math.exp(-elapsed / 96);

      if (Math.abs(distance) <= 0.35) {
        rail.scrollLeft = motion.target;
        syncMediaRailUi(rail);
        mediaRailMotionRef.current = null;
        return;
      }

      rail.scrollLeft += distance * easing;
      syncMediaRailUi(rail);
      motion.rafId = window.requestAnimationFrame(tick);
    };

    mediaRailMotionRef.current = motion;
    motion.rafId = window.requestAnimationFrame(tick);
  }, [cancelMediaRailMotion, syncMediaRailUi]);

  const glideMediaRailBy = useCallback((rail: HTMLDivElement, delta: number) => {
    const activeTarget = mediaRailMotionRef.current?.rail === rail
      ? mediaRailMotionRef.current.target
      : rail.scrollLeft;
    animateMediaRailTo(rail, activeTarget + delta);
  }, [animateMediaRailTo]);

  const handleMediaRailPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const rail = event.currentTarget;
    cancelMediaRailMotion(rail);
    if (event.pointerType === "touch") return;

    suppressRailClickRef.current = false;
    railDragRef.current = {
      rail,
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: rail.scrollLeft,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocity: 0,
      moved: false,
    };
    event.stopPropagation();
  };

  const handleMediaRailPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) <= 4) return;

    if (!drag.moved) {
      drag.moved = true;
      drag.rail.setPointerCapture?.(event.pointerId);
      drag.rail.classList.add("is-dragging");
    }

    const elapsed = Math.max(event.timeStamp - drag.lastTime, 1);
    const instantaneousVelocity = (drag.lastX - event.clientX) / elapsed;
    drag.velocity = (drag.velocity * 0.64) + (instantaneousVelocity * 0.36);
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;
    drag.rail.scrollLeft = drag.startScrollLeft - deltaX;
    syncMediaRailUi(drag.rail);

    event.preventDefault();
    event.stopPropagation();
  };

  const handleMediaRailPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = railDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (drag.moved) {
      suppressRailClickRef.current = true;
      window.setTimeout(() => {
        suppressRailClickRef.current = false;
      }, 0);
    }

    drag.rail.classList.remove("is-dragging");
    if (drag.rail.hasPointerCapture?.(event.pointerId)) {
      drag.rail.releasePointerCapture(event.pointerId);
    }
    syncMediaRailUi(drag.rail);
    railDragRef.current = null;

    if (drag.moved && event.type !== "pointercancel" && Math.abs(drag.velocity) > 0.02) {
      glideMediaRailBy(drag.rail, drag.velocity * 190);
    }
    event.stopPropagation();
  };

  const handleMediaRailClickCapture = (event: SyntheticEvent) => {
    if (!suppressRailClickRef.current) return;

    suppressRailClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleMediaRailWheel = useCallback((event: WheelEvent) => {
    if (event.ctrlKey) return;

    const rail = event.currentTarget as HTMLDivElement;
    const rawDelta = Math.abs(event.deltaY) > Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    const deltaMultiplier = event.deltaMode === 1
      ? 18
      : event.deltaMode === 2
        ? rail.clientWidth
        : 1;
    const delta = rawDelta * deltaMultiplier;

    if (delta !== 0) {
      glideMediaRailBy(rail, delta);
      event.preventDefault();
    }

    event.stopPropagation();
  }, [glideMediaRailBy]);

  useEffect(() => {
    if (activeTab !== "shorts" && activeTab !== "audio") return;

    const rail = mediaRailRefs.current[activeTab];
    if (!rail) return;

    const frameId = window.requestAnimationFrame(() => syncMediaRailUi(rail));
    rail.addEventListener("wheel", handleMediaRailWheel, { passive: false });

    return () => {
      window.cancelAnimationFrame(frameId);
      rail.removeEventListener("wheel", handleMediaRailWheel);
      cancelMediaRailMotion(rail);
    };
  }, [activeTab, artist.id, cancelMediaRailMotion, handleMediaRailWheel, playingMedia, syncMediaRailUi]);

  // The standalone caller explicitly chooses demo media; no profile API is loaded here.
  const allowDemoMedia = demoFollow;
  const sourceShorts = artist.shorts.length > 0
    ? artist.shorts
    : allowDemoMedia ? demoPreProfileArtist.shorts : [];
  const sourceAudios = artist.audios.length > 0
    ? artist.audios
    : allowDemoMedia ? demoPreProfileArtist.audios : [];

  const baseShortRailItems = sourceShorts.map((short) => ({ ...short }));

  const baseAudioRailItems = sourceAudios.map((audio, index) => {
    const cover = sourceShorts[index % sourceShorts.length]?.thumbnailUrl ?? sourceShorts[0]?.thumbnailUrl;
    return {
      ...audio,
      cover,
    };
  });

  const activeMediaEdits = isOwnerEditing ? mediaDraftEdits : savedMediaEdits;
  const shortRailItems = baseShortRailItems
    .filter((short) => !activeMediaEdits.removedKeys.includes(getMediaEditKey("short", short.id)))
    .map((short) => ({
      ...short,
      title: activeMediaEdits.replacementNames[getMediaEditKey("short", short.id)] ?? short.title,
    }));
  const audioRailItems = baseAudioRailItems
    .filter((audio) => !activeMediaEdits.removedKeys.includes(getMediaEditKey("audio", audio.id)))
    .map((audio) => ({
      ...audio,
      title: activeMediaEdits.replacementNames[getMediaEditKey("audio", audio.id)] ?? audio.title,
    }));

  const overviewShort = shortRailItems[0];
  const overviewAudio = audioRailItems[0];
  const activeShort = playingMedia?.type === "short"
    ? shortRailItems.find((short) => short.id === playingMedia.id) ?? overviewShort
    : null;
  const activeAudioId = playingMedia?.type === "audio" ? playingMedia.id : null;
  const activeAudio = activeAudioId
    ? audioRailItems.find((audio) => audio.id === activeAudioId) ?? null
    : null;
  const isOverviewAudioPlaying = Boolean(overviewAudio && activeAudioId === overviewAudio.id);

  useLayoutEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudio?.mediaUrl) return;

    let cancelled = false;
    const playRequest = audio.play();
    playRequest?.catch(() => {
      if (cancelled) return;
      setPlayingMedia((current) => (
        current?.type === "audio" && current.id === activeAudio.id
          ? null
          : current
      ));
      setAudioProgress(0);
    });

    return () => {
      cancelled = true;
      audio.pause();
      audio.currentTime = 0;
    };
  }, [activeAudio?.id, activeAudio?.mediaUrl, artist.id]);

  const syncAudioProgress = (audio: HTMLAudioElement) => {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0
      ? audio.duration
      : 0;
    setAudioProgress(duration > 0 ? Math.min(1, Math.max(0, audio.currentTime / duration)) : 0);
  };

  const replaceMedia = (type: EditableMediaType, id: string) => {
    chooseLocalFile(type === "short" ? "video/*" : "audio/*", (file) => {
      const displayName = file.name.replace(/\.[^.]+$/, "").trim() || file.name;
      const key = getMediaEditKey(type, id);
      setMediaDraftEdits((current) => ({
        removedKeys: current.removedKeys.filter((removedKey) => removedKey !== key),
        replacementNames: {
          ...current.replacementNames,
          [key]: displayName,
        },
      }));
    });
  };

  const removeMedia = (type: EditableMediaType, id: string) => {
    const key = getMediaEditKey(type, id);
    setMediaDraftEdits((current) => {
      const replacementNames = { ...current.replacementNames };
      delete replacementNames[key];
      return {
        removedKeys: current.removedKeys.includes(key)
          ? current.removedKeys
          : [...current.removedKeys, key],
        replacementNames,
      };
    });
    setPlayingMedia((current) => (
      current?.type === type && current.id === id ? null : current
    ));
  };

  const renderMediaMenu = (type: EditableMediaType, id: string, label: string) => {
    if (!isOwnerEditing) return null;
    const menuKey = getMediaEditKey(type, id);
    const isOpen = openMediaMenuKey === menuKey;

    return (
      <div
        className="mw-preprofile__media-menu"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          className="mw-preprofile__media-menu-trigger"
          type="button"
          aria-label={`Options de ${label}`}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          onClick={() => setOpenMediaMenuKey((current) => current === menuKey ? null : menuKey)}
        >
          <MoreHorizontal size={15} strokeWidth={2.5} aria-hidden="true" />
        </button>
        {isOpen && (
          <div className="mw-preprofile__media-menu-popover" role="menu" aria-label={`Options de ${label}`}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMediaMenuKey(null);
                replaceMedia(type, id);
              }}
            >
              <PencilLine size={11} strokeWidth={2.4} aria-hidden="true" />
              Remplacer
            </button>
            <button
              className="is-danger"
              type="button"
              role="menuitem"
              onClick={() => {
                setOpenMediaMenuKey(null);
                removeMedia(type, id);
              }}
            >
              <Trash2 size={11} strokeWidth={2.4} aria-hidden="true" />
              Supprimer
            </button>
          </div>
        )}
      </div>
    );
  };

  const renderProfileActions = () => (
    <div className="mw-preprofile__actions">
      {isOwnerEditing ? (
        <>
          <button className="mw-preprofile__button mw-preprofile__button--secondary" type="button" onClick={cancelOwnerEditing}>
            Annuler
          </button>
          <button className="mw-preprofile__button mw-preprofile__button--primary" type="button" onClick={finishOwnerEditing}>
            <Check size={13} strokeWidth={2.6} />
            Enregistrer
          </button>
        </>
      ) : (
        <>
          <button
            className={`mw-preprofile__button mw-preprofile__button--primary ${!isOwner && isFollowing ? "is-active" : ""}`}
            type="button"
            aria-pressed={!isOwner ? isFollowing : undefined}
            disabled={!isOwner && isFollowPending}
            onClick={handleFollow}
          >
            {isOwner
              ? <PencilLine size={13} strokeWidth={2.4} />
              : isFollowing
                ? <Check size={13} strokeWidth={2.6} />
                : <Plus size={13} strokeWidth={2.4} />}
            {isOwner ? "Modifier" : isFollowing ? "Suivi" : "Suivre"}
          </button>
          <button
            className="mw-preprofile__button mw-preprofile__button--secondary"
            type="button"
            disabled={!onOpenProfile}
            title={!onOpenProfile
              ? isOwner
                ? "L’aperçu visiteur sera activé avec le profil viewer."
                : "Le profil viewer sera disponible dans une prochaine étape."
              : undefined}
            onClick={() => {
              onConsult?.(artist.id, "profile");
              onOpenProfile?.(artist.id);
            }}
          >
            <ExternalLink size={13} strokeWidth={2.35} />
            {isOwner ? "Voir profil public" : "Voir profil"}
          </button>
        </>
      )}
    </div>
  );

  return (
    <section
      className={[
        "mw-preprofile",
        isOwner ? "is-owner" : "",
        !isOwner ? "is-visitor" : "",
        isOwnerEditing ? "is-owner-editing" : "",
        isCollabComposerOpen ? "is-collab-open" : "",
      ].filter(Boolean).join(" ")}
      aria-label={`Pré-profile ${artist.name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="mw-preprofile__header">
        <div className="mw-preprofile__portrait-wrap">
          <div className="mw-preprofile__portrait-shell">
            <div className="mw-preprofile__portrait-fallback">{artist.portraitFallback}</div>
            {portraitLoaded && (
              <img
                className="mw-preprofile__portrait"
                src={isOwner ? portraitDraftUrl : artist.portraitUrl}
                alt=""
                draggable={false}
                decoding="async"
                onError={() => setPortraitLoaded(false)}
              />
            )}
          </div>
          {!isOwner && artist.online && (
            <span className="mw-preprofile__portrait-status" role="status" aria-label="En ligne" title="En ligne" />
          )}
          {isOwnerEditing && (
            <div className="mw-preprofile__portrait-editor">
              <button
                className="mw-preprofile__portrait-edit-button"
                type="button"
                aria-label="Modifier la photo de profil"
                onClick={replacePortrait}
              >
                <Camera size={13} strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>

        <div className="mw-preprofile__identity">
          <div className="mw-preprofile__name-row">
            <h2 className="mw-preprofile__name">{artist.name}</h2>
            {artistGradeLevel !== null && artistGradeMeta !== null && <div className="mw-preprofile__grade-lockup">
              <MeewavGradeBadge
                className="mw-preprofile__name-grade"
                interactive
                level={artistGradeLevel}
                size="sm"
                variant="icon"
              />
              <span
                className="mw-preprofile__grade-label"
                style={{
                  "--mw-profile-grade-color": artistGradeMeta.softColor,
                  "--mw-profile-grade-glow": artistGradeMeta.mainColor,
                } as CSSProperties}
              >
                {artistGradeMeta.label}
              </span>
            </div>}
          </div>
          <p className="mw-preprofile__role">{artist.role}</p>
          <div className="mw-preprofile__meta">
            {isOwner && <span className="mw-preprofile__owner-meta">Vous</span>}
            <span className="mw-preprofile__location-inline">
              <MapPin size={11} strokeWidth={2.35} />
              {artist.location}
            </span>
            <span className="mw-preprofile__followers-inline">
              <UsersRound size={12} strokeWidth={2.3} />
              {artist.followersLabel}
            </span>
            <div className="mw-preprofile__golden-like-inline">
              <GoldenLikeCounter
                artistId={artist.id}
                initialCount={goldenLikesCount}
                initialGivenToday={goldenLikeGivenToday}
                interactive={false}
                lockedOpen={false}
                onCountChange={(count) => {
                  setGoldenLikesCount(Math.max(0, count));
                  setGoldenLikeGivenToday(true);
                }}
              />
            </div>
          </div>
        </div>
      </header>

      {renderProfileActions()}

      {!isOwner && showRestoreAvatar && (
        <button
          className="mw-preprofile__restore-avatar"
          type="button"
          onClick={() => onRestoreAvatar?.(artist.id)}
        >
          <span className="mw-preprofile__restore-avatar-icon" aria-hidden="true">
            <RotateCcw size={15} strokeWidth={2.45} />
          </span>
          <span className="mw-preprofile__restore-avatar-copy">
            <strong>Rétablir l’avatar</strong>
            <small>Restaurer son nom, sa couleur et sa visibilité</small>
          </span>
        </button>
      )}

      {showMapPin && !isOwner && !showRestoreAvatar && (
        <section
          className={[
            "mw-preprofile__pin",
            selectedPinColor ? "has-selected-color" : "",
            isPinned ? "is-pinned" : "",
          ].join(" ")}
          style={{ "--mw-active-pin-color": selectedPinColor ?? "#8B5CF6" } as CSSProperties}
          aria-label="Épingler le profil"
        >
          <div className="mw-preprofile__pin-copy">
            <button
              className="mw-preprofile__pin-button"
              type="button"
              aria-label={selectedPinColor ? "Épingler avec la couleur choisie" : "Choisir une couleur de repère"}
              aria-pressed={isPinned}
              onClick={handlePinClick}
              disabled={!selectedPinColor}
            >
              <MapPin size={15} strokeWidth={2.35} />
            </button>
            <span
              className="mw-preprofile__pin-text"
              role={selectedPinColor ? "button" : undefined}
              tabIndex={selectedPinColor ? 0 : undefined}
              aria-pressed={selectedPinColor ? isPinned : undefined}
              onClick={selectedPinColor ? handlePinClick : undefined}
              onKeyDown={(event) => {
                if (!selectedPinColor) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                handlePinClick();
              }}
            >
              <strong>{isPinned ? "Épinglé sur la carte" : "Épingler sur la carte"}</strong>
              <small>
                {isPinned ? "Ce repère reste visible" : "Garder cet avatar visible"}
              </small>
            </span>
          </div>
          <div className="mw-preprofile__colors" aria-label="Couleurs de repère">
            <span className="mw-preprofile__colors-label">
              <strong>Couleur</strong>
              <small>du repère</small>
            </span>
            {pinColors.map((color) => (
              <button
                key={color}
                className={color === selectedPinColor ? "is-selected" : ""}
                style={{ "--mw-pin-color": color } as CSSProperties}
                type="button"
                aria-label={`Choisir la couleur ${color}`}
                aria-pressed={color === selectedPinColor}
                onClick={() => handlePinColor(color)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mw-preprofile__bio" aria-label="Bio artiste">
        {isOwnerEditing ? (
          <>
            <textarea
              value={bioDraft}
              maxLength={BIO_MAX_LENGTH}
              aria-label="Modifier la bio"
              onChange={(event) => setBioDraft(event.target.value)}
            />
            <span className="mw-preprofile__bio-count">{bioDraft.length}/{BIO_MAX_LENGTH}</span>
          </>
        ) : (
          <p>{isOwner ? savedBio : artist.bio}</p>
        )}
      </section>

      <div className={isOwner ? "mw-preprofile__owner-lower-stage" : "mw-preprofile__lower-stage"}>
        <div
          className={isOwner ? "mw-preprofile__owner-media-stage" : "mw-preprofile__media-stage"}
          aria-hidden={isCollabComposerOpen || undefined}
          inert={isCollabComposerOpen ? true : undefined}
        >
      <nav className="mw-preprofile__tabs" aria-label="Sections pré-profile" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            id={`mw-preprofile-tab-${tab.id}`}
            className={tab.id === activeTab ? "is-active" : ""}
            type="button"
            role="tab"
            aria-selected={tab.id === activeTab}
            aria-controls="mw-preprofile-panel"
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div
        id="mw-preprofile-panel"
        className="mw-preprofile__preview"
        data-active-tab={activeTab}
        role="tabpanel"
        aria-labelledby={`mw-preprofile-tab-${activeTab}`}
      >
        {activeTab === "overview" && (
          <>
            {overviewShort ? <article
              className="mw-preprofile__overview-card mw-preprofile__overview-short-card"
            >
              <button
                className="mw-preprofile__overview-short-action"
                type="button"
                aria-label={`Lire la vidéo ${overviewShort.title}`}
                onClick={() => handleShortSelect(overviewShort.id)}
              >
                <span className="mw-preprofile__overview-thumb">
                  <img
                    src={overviewShort.thumbnailUrl}
                    alt=""
                    draggable={false}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="mw-preprofile__overview-play">
                    <Play size={12} fill="currentColor" strokeWidth={2.2} />
                  </span>
                  <span className="mw-preprofile__overview-duration">{overviewShort.duration}</span>
                </span>
                <span className="mw-preprofile__overview-copy">
                  <strong>{overviewShort.title}</strong>
                  <small>1,2K vues</small>
                </span>
              </button>
              {renderMediaMenu("short", overviewShort.id, overviewShort.title)}
            </article> : <div className="mw-preprofile__overview-card mw-preprofile__media-empty">Aucune vidéo</div>}

            {overviewAudio ? <article className={`mw-preprofile__overview-card mw-preprofile__overview-audio-card is-${overviewAudio.color} ${isOverviewAudioPlaying ? "is-playing" : ""}`}>
              <button
                className="mw-preprofile__overview-audio-play"
                type="button"
                aria-label={isOverviewAudioPlaying ? `Mettre en pause ${overviewAudio.title}` : `Lire ${overviewAudio.title}`}
                aria-pressed={isOverviewAudioPlaying}
                onClick={() => handleAudioToggle(overviewAudio.id)}
              >
                {isOverviewAudioPlaying
                  ? <Pause size={12} fill="currentColor" />
                  : <Play size={12} fill="currentColor" />}
              </button>
              <div className="mw-preprofile__overview-audio-copy">
                <div className="mw-preprofile__overview-audio-head">
                  <strong>{overviewAudio.title}</strong>
                  <span>{overviewAudio.duration}</span>
                </div>
                <small>{overviewAudio.subtitle}</small>
                <div className="mw-preprofile__overview-wave" aria-hidden="true">
                  {OVERVIEW_WAVE_HEIGHTS.map((height, index) => (
                    <i key={index} style={{ "--mw-wave-h": `${height}px` } as CSSProperties} />
                  ))}
                </div>
                <div className="mw-preprofile__overview-audio-progress" aria-hidden="true">
                  <span style={{ width: `${isOverviewAudioPlaying ? audioProgress * 100 : 0}%` }} />
                </div>
              </div>
              {renderMediaMenu("audio", overviewAudio.id, overviewAudio.title)}
            </article> : <div className="mw-preprofile__overview-card mw-preprofile__media-empty">Aucun audio</div>}
          </>
        )}

        {activeTab === "shorts" && activeShort && (
          <div className="mw-preprofile__short-player">
            <button
              className="mw-preprofile__back-to-rail"
              type="button"
              onClick={() => setPlayingMedia(null)}
            >
              <ChevronLeft size={13} strokeWidth={2.5} aria-hidden="true" />
              Vidéo
            </button>
            <video
              key={`${artist.id}:${activeShort.id}`}
              ref={videoRef}
              src={activeShort.mediaUrl}
              poster={activeShort.thumbnailUrl}
              controls
              autoPlay
              playsInline
              preload="metadata"
              onError={() => {
                setPlayingMedia((current) => (
                  current?.type === "short" && current.id === activeShort.id
                    ? null
                    : current
                ));
              }}
            />
            <strong>{activeShort.title}</strong>
            <small>{activeShort.duration}</small>
          </div>
        )}

        {activeTab === "shorts" && !activeShort && (
          <div className="mw-preprofile__media-panel mw-preprofile__media-panel--shorts">
            <div
              ref={(node) => { mediaRailRefs.current.shorts = node; }}
              className="mw-preprofile__media-rail mw-preprofile__short-rail"
              onScroll={(event) => syncMediaRailUi(event.currentTarget)}
              onPointerDown={handleMediaRailPointerDown}
              onPointerMove={handleMediaRailPointerMove}
              onPointerUp={handleMediaRailPointerEnd}
              onPointerCancel={handleMediaRailPointerEnd}
              onClickCapture={handleMediaRailClickCapture}
            >
              {shortRailItems.map((short) => (
                <article
                  className="mw-preprofile__short-rail-card"
                  key={short.id}
                >
                  <button
                    className="mw-preprofile__short-rail-action"
                    type="button"
                    aria-label={`Lire la vidéo ${short.title}`}
                    onClick={() => handleShortSelect(short.id)}
                  >
                    <img
                      src={short.thumbnailUrl}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                    />
                    <span className="mw-preprofile__play-pill">
                      <Play size={12} fill="currentColor" strokeWidth={2.2} />
                    </span>
                    <span className="mw-preprofile__duration">{short.duration}</span>
                    <strong>{short.title}</strong>
                    <small>{short.id === "live" ? "2,1K vues" : "1,2K vues"}</small>
                  </button>
                  {renderMediaMenu("short", short.id, short.title)}
                </article>
              ))}
            </div>
            <div className="mw-preprofile__rail-track" aria-hidden="true"><span /></div>
          </div>
        )}

        {activeTab === "audio" && (
          <div className="mw-preprofile__media-panel mw-preprofile__media-panel--audio">
            <div
              ref={(node) => { mediaRailRefs.current.audio = node; }}
              className="mw-preprofile__media-rail mw-preprofile__audio-rail"
              onScroll={(event) => syncMediaRailUi(event.currentTarget)}
              onPointerDown={handleMediaRailPointerDown}
              onPointerMove={handleMediaRailPointerMove}
              onPointerUp={handleMediaRailPointerEnd}
              onPointerCancel={handleMediaRailPointerEnd}
              onClickCapture={handleMediaRailClickCapture}
            >
              {audioRailItems.map((audio) => (
                <article
                  className={`mw-preprofile__audio-cover-card is-${audio.color} ${activeAudioId === audio.id ? "is-playing" : ""}`}
                  key={audio.id}
                >
                  <img src={audio.cover} alt="" draggable={false} loading="lazy" decoding="async" />
                  <button
                    className="mw-preprofile__audio-cover-play"
                    type="button"
                    aria-label={activeAudioId === audio.id ? `Mettre en pause ${audio.title}` : `Lire ${audio.title}`}
                    aria-pressed={activeAudioId === audio.id}
                    onClick={() => handleAudioToggle(audio.id)}
                  >
                    {activeAudioId === audio.id
                      ? <Pause size={12} fill="currentColor" />
                      : <Play size={12} fill="currentColor" />}
                  </button>
                  {renderMediaMenu("audio", audio.id, audio.title)}
                  <strong>{audio.title}</strong>
                  <span>{audio.subtitle}</span>
                  <small>{audio.duration}</small>
                  <div className="mw-preprofile__audio-cover-progress" aria-hidden="true">
                    <span style={{ width: `${activeAudioId === audio.id ? audioProgress * 100 : 0}%` }} />
                  </div>
                </article>
              ))}
            </div>
            <div className="mw-preprofile__rail-track" aria-hidden="true"><span /></div>
          </div>
        )}

        {activeAudio && (
          <audio
            key={`${artist.id}:${activeAudio.id}`}
            ref={audioRef}
            src={activeAudio.mediaUrl}
            preload="metadata"
            hidden
            onLoadedMetadata={(event) => syncAudioProgress(event.currentTarget)}
            onTimeUpdate={(event) => syncAudioProgress(event.currentTarget)}
            onEnded={() => {
              setPlayingMedia((current) => (
                current?.type === "audio" && current.id === activeAudio.id
                  ? null
                  : current
              ));
              setAudioProgress(0);
            }}
            onError={() => {
              setPlayingMedia((current) => (
                current?.type === "audio" && current.id === activeAudio.id
                  ? null
                  : current
              ));
              setAudioProgress(0);
            }}
          />
        )}
      </div>

      {isOwner && (
        <section className="mw-preprofile__public-visibility" aria-label="Visibilité publique du host">
          <span className="mw-preprofile__public-visibility-copy">
            <strong>Visibilité publique</strong>
            <small>Votre host reste toujours visible pour vous.</small>
          </span>
          <button
            className={`mw-preprofile__visibility-switch ${isPubliclyVisible ? "is-visible" : "is-hidden"}`}
            type="button"
            role="switch"
            aria-checked={isPubliclyVisible}
            aria-label={isPubliclyVisible ? "Masquer mon avatar au public" : "Afficher mon avatar au public"}
            onClick={() => onPublicVisibilityChange?.(!isPubliclyVisible)}
          >
            <span className="mw-preprofile__visibility-track" aria-hidden="true"><i /></span>
            <span>{isPubliclyVisible ? "Visible au public" : "Masqué au public"}</span>
          </button>
        </section>
      )}

      <footer className="mw-preprofile__footer" aria-label="Actions de contact">
        <button
          className="mw-preprofile__collab-button"
          type="button"
          disabled={collaborationActionDisabled}
          title={collaborationUnavailable
            ? `${artist.name} n’accepte pas de demande de collaboration actuellement.`
            : undefined}
          aria-expanded={!isOwner ? isCollabComposerOpen : undefined}
          onClick={handleCollabRequest}
        >
          <span className="mw-preprofile__collab-icon" aria-hidden="true">
            <HeartHandshake size={18} strokeWidth={2.15} />
          </span>
          <span className="mw-preprofile__collab-copy">
            <strong>{isOwner ? "Gérer mes collabs" : "Demande de collab"}</strong>
            <small>{isOwner ? "Demandes et invitations" : "Proposer une session ensemble"}</small>
          </span>
        </button>
        {!isOwner && (
          <button
            className="mw-preprofile__contact-button"
            type="button"
            onClick={handleContact}
          >
            <MessageCircle size={17} strokeWidth={2.2} aria-hidden="true" />
            <span>Contacter</span>
          </button>
        )}
      </footer>
        </div>

      </div>
    </section>
  );
}

export default HoverPreProfileContent;
