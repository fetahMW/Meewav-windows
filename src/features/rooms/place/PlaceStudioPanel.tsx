import RoomJuryControl from "../voting/RoomJuryControl";
import "./place-console-refinement.css";
import { useRoomVotingPolicy } from "../voting/useRoomVotingPolicy";
import { saveVotingPolicy } from "../voting/roomVoting.service";
import { VOTE_MODE_LABELS, type RoomVoteMode } from "../voting/roomVoting";
import { ROOM_LIVE_CALL_MAX_CONTACTS } from "../live-call/roomLiveCall.service";
import { useViewerMixer } from "./ViewerMixerContext";
import ViewerGreenHouseAudioCheck from "./ViewerGreenHouseAudioCheck";
import "../home/rooms-home-filter-lacquer.css";
import RoomExperienceBoundary from "../switch-room/RoomExperienceBoundary";
import "./place-chat-poll.css";
import type { RoomPerson } from "../tools/roomTools.types";
import { PlaceChatPins } from "./PlaceChatMessageActions";
import { getRoomPreProfileBounds } from "../tools/panels/roomPreProfileBounds";
import CagePreparedCompetitions from "./CagePreparedCompetitions";
import { MeewavFilterPanel, MeewavFilterSection } from "../../../components/shared/search-filter/MeewavSearchFilter";
import "./cage-guests.css";
import "../home/rooms-home-filter-lacquer.css";
import { FormEvent, lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpToLine,
  BarChart3,
  Camera,
  CameraOff,
  ChevronDown,
  AudioLines,
  DoorOpen,
  Mic2,
  Radio,
  CircleCheck,
  Clock3,
  Filter,
  Gift,
  GraduationCap,
  Handshake,
  MessageCircle,
  Mic,
  MicOff,
  MoreVertical,
  PanelRightClose,
  PanelRightOpen,
  Pin,
  Send,
  Smile,
  Scale,
  Square,
  SquareCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserRound,
  X,
  RectangleHorizontal,
  RectangleVertical,
  RadioTower,
  TriangleAlert,
  UsersRound,
  WifiLow,
  Wrench,
} from "lucide-react";
import { MeewavIllustratedFilterGrid } from "../../../components/shared/search-filter/MeewavSearchFilter";
import {
  SCENE_ARTIST_ROLE_OPTIONS,
  type SceneArtistRoleId,
} from "../../../components/shared/avatar/profileIconCatalog";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { GRADE_BADGES, type GradeLevel } from "../../grades/gradeBadges";
import {
  appendMeeWavEmoticon,
  MeeWavEmoticonComposer,
  MeeWavEmoticonPicker,
  MeeWavRichText,
} from "../../emoticons/MeewavEmoticons";
import { demoContacts } from "../../messaging/messagingDemoData";
import { messagingRepository } from "../../messaging/messaging.service";
import { useRoomPresentation } from "../roomPresentation";
import RoomAudienceInteractions from "../tools/audience/RoomAudienceInteractions";
import { WaveViewerListeningBar } from "../wave-viewer/WaveViewerListening";
import WaveViewerPanel from "../wave-viewer/WaveViewerPanel";
import PlacePollToolPanel from "../tools/panels/PlacePollToolPanel";
import RoomToolsShell from "../tools/RoomToolsShell";
import { resolveRoomActorRole } from "../tools/roomTools.config";
import type { SpecializedRoomId } from "../tools/roomTools.types";
import type {
  PlaceMixerView,
  PlacePollDuration,
  PlacePollOptionInput,
  PlaceParticipant,
  PlacePitchProvider,
  PlaceProfile,
  PlaceRoomState,
  PlaceStudioSurface,
  RoomGiftDelivery,
  RoomGiftDeliveryInput,
  RoomGiftDraw,
  RoomGiftDrawInput,
} from "./place.types";
import type { PlaceLocalAudioSnapshot } from "./placeLocalAudioEngine";
import { PLACE_DEMO_CHAT_SCRIPT } from "./place.fixtures";
import PlaceGiftTool, { type PlaceGiftRecipientOption, type PlaceGiftSubmission } from "./PlaceGiftTool";
import PlaceGuestInvitePicker from "./PlaceGuestInvitePicker";
import { roomGiftCodeForLabel } from "./placeGiftCatalog";
import PlaceMixer from "./PlaceMixer";
import PlaceToolsSwitch from "./PlaceToolsSwitch";
import PlaceConversationTools from "./PlaceConversationTools";
import { StudioToolsLayoutProvider, useStudioToolsLayout } from "./StudioToolsLayoutProvider";
import "./place-tools-chrome.css";
import "./place-chat-workspace.css";
import "./place-social-tabs-chrome.css";
import "./place-guest-cards-chrome.css";
import "./place-guest-cards-polish.css";
import "./place-guests-chrome.css";
import "./place-studio-portraits.css";
import { WaveTransportProvider } from "../wave-transport/WaveTransportProvider";
import WaveRoomTransportController from "../tools/WaveRoomTransportController";
import PlaceGuestMediaControls from "./PlaceGuestMediaControls";
import PlaceBackstageControls from "./PlaceBackstageControls";
import type { PlaceLiveKitVideoTrack } from "./placeLiveKit.service";
import { useRuntime } from "../../../runtime/RuntimeProvider";
import { hasPlaceGuestDrag, readPlaceGuestDrag, writePlaceGuestDrag } from "./placeGuestDrag";
import CageProductionProvider from "../tools/audio/CageProductionProvider";

const GuestPreProfile = lazy(() => import("../tools/panels/ClassStudentPreProfile"));

type PlaceStudioPanelProps = {
  liveKitVideoTracks?: PlaceLiveKitVideoTrack[];
  experienceWaiting?: ReactNode;
  experienceVersion?: number;
  room: PlaceRoomState;
  isHost: boolean;
  isGuest: boolean;
  canEngage: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  surface: PlaceStudioSurface;
  onSurface: (surface: PlaceStudioSurface) => void;
  mixerView: PlaceMixerView;
  onMixerView: (view: PlaceMixerView) => void;
  onGain: (channelId: string, gain: number) => void;
  onMute: (channelId: string) => void;
  onCamera: (participantId: string, enabled: boolean) => void;
  onVocal: (patch: Partial<PlaceRoomState["personalVocal"]>) => void;
  onTune: Parameters<typeof PlaceMixer>[0]["onTune"];
  pitchProvider: PlacePitchProvider;
  pitchCorrection: PlaceLocalAudioSnapshot["pitchCorrection"];
  localAudioStatus: PlaceLocalAudioSnapshot["status"];
  localAudioError: string | null;
  pluginInventory: Parameters<typeof PlaceMixer>[0]["pluginInventory"];
  pluginsRefreshing: boolean;
  nativePluginStatus: Parameters<typeof PlaceMixer>[0]["nativePluginStatus"];
  nativePluginAudioReady: boolean;
  nativePluginError: string | null;
  onPitchProvider: Parameters<typeof PlaceMixer>[0]["onPitchProvider"];
  onRefreshPlugins: Parameters<typeof PlaceMixer>[0]["onRefreshPlugins"];
  onRemoveNativePlugin: Parameters<typeof PlaceMixer>[0]["onRemoveNativePlugin"];
  onToggleMonitoring: () => void;
  onAudioPreview?: Parameters<typeof PlaceMixer>[0]["onAudioPreview"];
  onAudioPreviewMetadata?: Parameters<typeof PlaceMixer>[0]["onAudioPreviewMetadata"];
  onAudioRoute?: Parameters<typeof PlaceMixer>[0]["onAudioRoute"];
  onAudioPlaybackState?: Parameters<typeof PlaceMixer>[0]["onAudioPlaybackState"];
  programAudio?: Parameters<typeof PlaceMixer>[0]["programAudio"];
  hostVoiceMeterStream?: MediaStream | null;
  onTogglePlayback?: () => void;
  onSendMessage: (content: string) => Promise<void>;
  onJoinQueue: () => Promise<void>;
  onLeaveQueue: () => Promise<void>;
  onLeaveRoom?: () => void;
  onAcceptInvitation: () => Promise<void>;
  onDeclineInvitation: () => Promise<void>;
  onMarkReady: () => Promise<void>;
  onLaunchPoll: (question: string, options: PlacePollOptionInput[], durationSeconds: PlacePollDuration, resultsVisible?: boolean) => Promise<void>;
  onStopPoll: () => Promise<void>;
  onVotePoll?: (optionIndex: number) => void;
  onPinHighlight: (content: string, durationSeconds: 10 | 20 | 30) => Promise<void>;
  onSpotlightStudent?: (person: RoomPerson) => Promise<void>;
  spotlightStudentId?: string | null;
  onPinMessage: (messageId: string, durationSeconds?: 10 | 20 | 30) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  chatSocialActions?: ReactNode;
  onClearHighlight: () => Promise<void>;
  onSubmitGift?: (input: RoomGiftDeliveryInput) => Promise<RoomGiftDelivery | null>;
  onCreateGiftDraw?: (input: RoomGiftDrawInput) => Promise<RoomGiftDraw | null>;
  onScheduleGiftDraw?: (input: RoomGiftDrawInput & { scheduledAt: string }) => Promise<RoomGiftDraw | null>;
  onStartGiftDraw?: (drawId?: string) => Promise<RoomGiftDraw | null>;
  onCancelGiftDraw?: (drawId?: string) => Promise<RoomGiftDraw | null>;
  onMoveGuest: (participant: PlaceParticipant, destination: "backstage" | "onstage" | "accepted") => Promise<void>;
  onInviteProfile?: (profileId: string) => Promise<void>;
  onRemoveGuest: (participant: PlaceParticipant) => Promise<void>;
  onSetQueueOpen: (open: boolean) => Promise<void>;
  onOpenProfile: (profileId: string) => void;
  onMessageProfile: (profileId: string) => void;
  onCollaborateProfile: (profile: PlaceProfile) => void;
};

const SURFACES: Array<{ id: PlaceStudioSurface; label: string }> = [
  { id: "chat", label: "Chat" },
  { id: "mixer", label: "Mixeur" },
  { id: "tools", label: "Outils" },
  { id: "guests", label: "Invités" },
];

const CHAT_AUTHOR_COLORS = ["#c67cff", "#ffbd43", "#2fe0cf", "#57bdf7", "#ff7fa9", "#9ea6ff"];
const CHAT_SCROLL_SETTLE_MS = 700;
const DEMO_CHAT_FIRST_MESSAGE_DELAY_MS = 500;
const DEMO_CHAT_ACTIVITY_SCALE = 0.18;
const DEMO_CHAT_MIN_DELAY_MS = 400;
const DEMO_CHAT_MAX_DELAY_MS = 1800;

function chatAuthorColor(id: string) {
  let hash = 0;
  for (const character of id) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  return CHAT_AUTHOR_COLORS[Math.abs(hash) % CHAT_AUTHOR_COLORS.length];
}

function messageClock(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function waitingTime(value: string, now = Date.now()) {
  const startedAt = new Date(value).getTime();
  if (!Number.isFinite(startedAt)) return "1 min";
  const minutes = Math.max(1, Math.floor((now - startedAt) / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

const PLACE_GUEST_GRADE_LEVELS: GradeLevel[] = [1, 2, 3, 4, 5, 6];
type GuestReadinessFilter = "media-ready" | "stable" | "green-house";

const PLACE_GUEST_READINESS_FILTERS: Array<{ id: GuestReadinessFilter; label: string; detail: string }> = [
  { id: "media-ready", label: "Prêt à passer", detail: "Micro + caméra" },
  { id: "stable", label: "Connexion stable", detail: "Latence maîtrisée" },
  { id: "green-house", label: "OBS prêt", detail: "Déjà préparé" },
];

function normalizeGuestFilterText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function roleMatchesAvatarStyle(role: string, roleId: SceneArtistRoleId) {
  const normalizedRole = normalizeGuestFilterText(role);
  const option = SCENE_ARTIST_ROLE_OPTIONS.find((candidate) => candidate.key === roleId);
  if (!option) return false;

  const explicitAliases: Partial<Record<SceneArtistRoleId, string[]>> = {
    avatar_1: ["violon", "violoniste", "violoncelliste", "cordes"],
    avatar_7: ["piano", "pianiste", "clavieriste"],
    avatar_12: ["saxophone", "saxophoniste", "trompette", "trompettiste", "cuivre"],
    avatar_13: ["clarinette", "clarinettiste", "flute", "instrument a vent"],
    avatar_16: ["guitare", "guitariste"],
    avatar_17: ["dj", "deejay"],
    avatar_21: ["compositeur", "compositrice"],
    avatar_22: ["coach vocal", "coach vocale"],
    avatar_23: ["chanteuse", "rappeuse", "choriste", "soprano"],
    avatar_24: ["chanteur", "rappeur", "choriste"],
    avatar_25: ["beatmaker", "producteur", "productrice", "producer"],
    avatar_27: ["batteur", "batteuse", "drummer"],
    avatar_28: ["bassiste", "contrebassiste", "basse"],
  };
  const candidates = [...option.filterTokens, ...(explicitAliases[roleId] ?? [])]
    .map(normalizeGuestFilterText)
    .filter((token) => token.length > 1 && !/^\d+$/.test(token));
  return candidates.some((token) => normalizedRole.includes(token));
}

function participantMatchesReadiness(participant: PlaceParticipant, filter: GuestReadinessFilter) {
  if (filter === "media-ready") return participant.isMicrophoneEnabled && participant.isCameraEnabled;
  if (filter === "stable") return participant.latencyMs <= 80;
  return participant.status === "accepted" || participant.status === "ready" || participant.status === "backstage";
}

function GuestFilterButton({ activeCount, open, buttonRef, onOpen, panelId = "place-guests-filter-drawer" }: { panelId?: string; activeCount: number; open: boolean; buttonRef?: (node: HTMLButtonElement | null) => void; onOpen: () => void }) {
  return (
    <button
      type="button"
      ref={buttonRef}
      className={`place-guests-filter-trigger${open ? " is-open" : ""}`}
      aria-label={`Filtrer les invités${activeCount ? `, ${activeCount} filtres actifs` : ""}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={onOpen}
    >
      <Filter aria-hidden="true" />
      <span>Filtrer</span>
      {activeCount ? <b>{activeCount}</b> : null}
    </button>
  );
}

function GuestFilterDrawer({
  state,
  participants,
  selectedGrades,
  selectedRoles,
  selectedReadiness,
  onToggleGrade,
  onToggleRole,
  onToggleReadiness,
  onClear,
  onClose,
}: {
  state: "open" | "closing";
  participants: PlaceParticipant[];
  selectedGrades: GradeLevel[];
  selectedRoles: SceneArtistRoleId[];
  selectedReadiness: GuestReadinessFilter[];
  onToggleGrade: (level: GradeLevel) => void;
  onToggleRole: (role: SceneArtistRoleId) => void;
  onToggleReadiness: (filter: GuestReadinessFilter) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const drawerRef = useRef<HTMLElement | null>(null);
  const activeCount = selectedGrades.length + selectedRoles.length + selectedReadiness.length;
  const roleOptions = SCENE_ARTIST_ROLE_OPTIONS.map((option) => {
    const count = participants.filter((participant) => roleMatchesAvatarStyle(participant.profile.role, option.key)).length;
    return { id: option.key, label: option.label, imageUrl: option.imageUrl, count };
  }).filter((option) => option.count > 0 || selectedRoles.includes(option.id));

  return (
    <div className="place-guests-filter-drawer__overlay" data-state={state} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        ref={drawerRef}
        id="place-guests-filter-drawer"
        className="place-guests-filter-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = [...(drawerRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? [])];
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
      >
        <header>
          <span className="place-guests-filter-drawer__glyph"><SlidersHorizontal aria-hidden="true" /></span>
          <span><small>SÉLECTION PREMIUM</small><strong id={titleId}>Filtrer les invités</strong><em>Affiche uniquement les profils qui correspondent à ton live.</em></span>
          <button type="button" className="place-guests-filter-drawer__close" onClick={onClose} aria-label="Fermer les filtres" autoFocus><X aria-hidden="true" /></button>
        </header>
        <div className="place-guests-filter-drawer__content">
          <section className="place-guests-filter__readiness" aria-label="Filtrer par état de préparation">
            <div><strong>Prêt pour le live</strong><small>{selectedReadiness.length || "Tous"}</small></div>
            <span>
              {PLACE_GUEST_READINESS_FILTERS.map((option) => {
                const active = selectedReadiness.includes(option.id);
                const count = participants.filter((participant) => participantMatchesReadiness(participant, option.id)).length;
                return <button type="button" key={option.id} className={active ? "is-active" : ""} aria-pressed={active} onClick={() => onToggleReadiness(option.id)}><i><CircleCheck aria-hidden="true" /></i><span><strong>{option.label}</strong><small>{option.detail}</small></span><b>{count}</b></button>;
              })}
            </span>
          </section>
          <section className="place-guests-filter__grades" aria-label="Filtrer par niveau">
            <div><strong>Niveaux MeeWav</strong><small>{selectedGrades.length || "Tous"}</small></div>
            <span>
              {PLACE_GUEST_GRADE_LEVELS.map((level) => {
                const active = selectedGrades.includes(level);
                const count = participants.filter((participant) => participant.profile.gradeLevel === level).length;
                return <button type="button" key={level} className={active ? "is-active" : ""} aria-pressed={active} onClick={() => onToggleGrade(level)} title={`${GRADE_BADGES[level].title} — ${GRADE_BADGES[level].label}`}><MeewavGradeBadge level={level} size="xs" variant="icon" /><span><strong>{GRADE_BADGES[level].label}</strong><small>Niveau {level}</small></span><b>{count}</b></button>;
              })}
            </span>
          </section>
          <section className="place-guests-filter__roles" aria-label="Filtrer par style d’avatar">
            <div><strong>Styles d’avatar</strong><small>{selectedRoles.length || "Tous"}</small></div>
            <MeewavIllustratedFilterGrid ariaLabel="Styles d’avatar des invités" options={roleOptions} selectedIds={selectedRoles} onToggle={onToggleRole} />
          </section>
        </div>
        <footer><span><strong>{participants.length}</strong> profils analysés dans cette section</span><button type="button" onClick={onClear} disabled={!activeCount}>Réinitialiser</button><button type="button" className="is-primary" onClick={onClose}>Afficher les résultats</button></footer>
      </aside>
    </div>
  );
}

type GuestRowAction = {
  direction: "up" | "down" | "select";
  label: string;
  text: string;
  tone: "amber" | "cyan" | "violet" | "jury";
  onAction: () => void;
  disabled?: boolean;
};

function GuestRowMenu({ participant, variant, onOpenProfile, onMessageProfile, onCollaborateProfile, onRemove }: {
  participant: PlaceParticipant;
  variant: "queue" | "backstage" | "onstage";
  onRemove?: () => void;
  onOpenProfile: () => void;
  onMessageProfile: () => void;
  onCollaborateProfile: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const positionPopover = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(214, Math.max(176, window.innerWidth - 16));
    const left = Math.min(Math.max(8, bounds.right - width), Math.max(8, window.innerWidth - width - 8));
    const top = bounds.bottom + 6;
    setPosition({ top, left, maxHeight: Math.max(44, window.innerHeight - top - 8) });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPopover();
    const focusFrame = window.requestAnimationFrame(() => {
      popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    });
    window.addEventListener("resize", positionPopover);
    window.addEventListener("scroll", positionPopover, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("resize", positionPopover);
      window.removeEventListener("scroll", positionPopover, true);
    };
  }, [open, positionPopover]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const runMenuAction = (action: () => void) => {
    setOpen(false);
    action();
  };

  const toggleMenu = () => {
    if (!open && triggerRef.current) {
      const bounds = triggerRef.current.getBoundingClientRect();
      if (window.innerHeight - bounds.bottom < 190) {
        triggerRef.current.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      }
    }
    setOpen((current) => !current);
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      className="place-guest-row__menu-trigger"
      title="Plus d’actions"
      aria-label={`Plus d’actions pour ${participant.profile.displayName}`}
      aria-controls={menuId}
      aria-expanded={open}
      aria-haspopup="menu"
      onClick={toggleMenu}
    ><MoreVertical aria-hidden="true" /></button>
    {open ? createPortal(
      <div
        ref={popoverRef}
        id={menuId}
        className="place-guest-row-popover"
        role="menu"
        aria-label={`Actions pour ${participant.profile.displayName}`}
        data-placement="below"
        style={{ top: position.top, left: position.left, maxHeight: position.maxHeight }}
      >
        <header><strong>{participant.profile.displayName}</strong><small>Actions rapides</small></header>
        <button type="button" role="menuitem" onClick={() => runMenuAction(onOpenProfile)}><UserRound aria-hidden="true" /> Voir le profil</button>
        <button type="button" role="menuitem" onClick={() => runMenuAction(onMessageProfile)}><MessageCircle aria-hidden="true" /> Message</button>
        <button type="button" role="menuitem" onClick={() => runMenuAction(onCollaborateProfile)}><Handshake aria-hidden="true" /> Collaboration</button>
        {onRemove ? <button type="button" role="menuitem" className="is-remove" onClick={() => runMenuAction(onRemove)}><Trash2 aria-hidden="true" /> {variant === "queue" ? "Refuser la demande" : "Retirer du parcours"}</button> : null}
      </div>,
      document.body,
    ) : null}
  </>;
}

export function ParticipantRow({ participant, variant, profileSource = "live", actions, statusText, timeNow, isJuror = false, selected = false, selectionMode = false, onSelectedChange, onSelectExclusive, repeatOpensProfile = true, onRemove, onOpenProfile, onMessageProfile, onCollaborateProfile, stageControls, roomId }: {
  participant: PlaceParticipant;
  profileSource?: "demo" | "live";
  variant: "queue" | "backstage" | "onstage";
  actions: GuestRowAction[];
  stageControls?: ReactNode;
  roomId?: string;
  statusText: string;
  timeNow?: number;
  isJuror?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onSelectExclusive?: () => void;
  repeatOpensProfile?: boolean;
  onRemove?: () => void;
  onOpenProfile: () => void;
  onMessageProfile: () => void;
  onCollaborateProfile: () => void;
}) {
  const desktopCards = useRuntime().isDesktop && Boolean(roomId) && Boolean(onSelectedChange);
  const [profileTrigger, setProfileTrigger] = useState<HTMLElement | null>(null);
  const portraitRef = useRef<HTMLButtonElement>(null);
  const openProfile = (trigger: HTMLElement | null = portraitRef.current) => {
    if (trigger) setProfileTrigger(trigger);
    else onOpenProfile();
  };
  const isGreenHouse = participant.status === "accepted" || participant.status === "ready";
  const hasUnstableConnection = participant.latencyMs > 80 && variant !== "queue";
  const statusTone = variant === "onstage"
      ? "stage"
      : variant === "backstage" || isGreenHouse
        ? "ready"
        : "queue";
  const visibleStatus = variant === "backstage" || isGreenHouse ? "Prêt" : variant === "onstage" ? "En scène" : "En attente";
  const queueWaitingTime = variant === "queue" ? waitingTime(participant.joinedAt, timeNow) : null;
  const allMediaReady = participant.isMicrophoneEnabled && participant.isCameraEnabled;
  const backstageStatus = [!participant.isCameraEnabled ? "Caméra coupée" : null, !participant.isMicrophoneEnabled ? "Micro coupé" : null, hasUnstableConnection ? "Connexion instable" : null].filter(Boolean).join(", ") || "Prêt pour la scène";
  if (desktopCards) return <>
    <article className={`place-guest-row is-portrait-card is-desktop-compact is-${variant}${selected ? " is-selected" : ""}${isJuror ? " is-juror" : ""}`}>
      <button ref={portraitRef} type="button" className="place-guest-row__compact-hit"
        draggable={variant === "onstage" || (variant === "backstage" && participant.status === "backstage")}
        onDragStart={(event) => {
          if (!roomId || (variant !== "onstage" && !(variant === "backstage" && participant.status === "backstage"))) { event.preventDefault(); return; }
          writePlaceGuestDrag(event.dataTransfer, { roomId, participantId: participant.id, origin: variant });
        }}
        aria-label={`${selected ? "Sélectionné : " : "Sélectionner "}${participant.profile.displayName}`}
        aria-description={variant === "backstage" ? backstageStatus : undefined}
        aria-pressed={selected}
        onClick={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey) onSelectedChange?.(!selected);
          else if (selected) { if (repeatOpensProfile) openProfile(event.currentTarget); else onSelectedChange?.(false); }
          else if (onSelectExclusive) onSelectExclusive();
          else onSelectedChange?.(true);
        }}>
        <img className="place-guest-row__compact-image" src={participant.profile.avatarUrl} alt="" draggable={false} />
        <span className="place-guest-row__compact-shade" />
        {selected || selectionMode ? <span className="place-guest-row__compact-state is-checkbox">{selected ? <SquareCheck aria-hidden="true" /> : <Square aria-hidden="true" />}</span>
          : variant === "backstage" ? <span className="place-guest-row__compact-statuses">
              {!participant.isCameraEnabled || !participant.isMicrophoneEnabled || hasUnstableConnection ? <span className="place-guest-row__status-icons">
                {!participant.isCameraEnabled ? <span className="place-guest-row__status-chip is-icon is-media-off" title="Caméra coupée" aria-label="Caméra coupée"><CameraOff aria-hidden="true" /></span> : null}
                {!participant.isMicrophoneEnabled ? <span className="place-guest-row__status-chip is-icon is-micro-off" title="Micro coupé" aria-label="Micro coupé"><MicOff aria-hidden="true" /></span> : null}
                {hasUnstableConnection ? <span className="place-guest-row__status-chip is-icon is-unstable" title="Connexion instable" aria-label="Connexion instable"><WifiLow aria-hidden="true" /></span> : null}
              </span> : null}
              {allMediaReady && !hasUnstableConnection ? <span className="place-guest-row__status-chip is-ready" title="Prêt pour la scène">Prêt</span> : null}
            </span>
            : variant === "onstage" ? <span className="place-guest-row__compact-state"><RadioTower aria-hidden="true" /></span> : null}
        <span className="place-guest-row__compact-copy"><strong>{participant.profile.displayName}</strong><small>{participant.profile.role}</small></span>
        <MeewavGradeBadge level={participant.profile.gradeLevel as GradeLevel} size="md" variant="icon" />
      </button>
    </article>
    {profileTrigger ? <Suspense fallback={null}><GuestPreProfile
      person={{ id: participant.profile.id, name: participant.profile.displayName, avatarUrl: participant.profile.avatarUrl,
        role: participant.profile.role, gradeLevel: participant.profile.gradeLevel as GradeLevel,
        microphone: participant.isMicrophoneEnabled ? "ready" : "off", camera: participant.isCameraEnabled ? "ready" : "off" }}
      source={profileSource} returnFocusTo={profileTrigger} {...getRoomPreProfileBounds(profileTrigger)}
      onClose={() => setProfileTrigger(null)} /></Suspense> : null}
  </>;
  return (
    <article className={`place-guest-row is-portrait-card is-${variant}${isJuror ? " is-juror" : ""}${isGreenHouse ? " is-green-house" : ""}${hasUnstableConnection ? " is-connecting" : ""}${onSelectedChange ? " is-selectable" : ""}${selected ? " is-selected" : ""}`}>
      {onSelectedChange ? <button type="button" className="place-guest-row__selection" aria-label={`${selected ? "Désélectionner" : "Sélectionner"} ${participant.profile.displayName}`} aria-pressed={selected} onClick={() => onSelectedChange(!selected)}><CircleCheck aria-hidden="true" /></button> : null}
      <button ref={portraitRef} type="button" className="place-guest-row__avatar is-profile-trigger"
        aria-label={`Ouvrir le pré-profil de ${participant.profile.displayName}`} aria-haspopup="dialog"
        onClick={(event) => openProfile(event.currentTarget)}>
        <img src={participant.profile.avatarUrl} alt="" /><i />
      </button>
      <div className="place-guest-row__main">
        <div className="place-guest-row__upper">
          <button type="button" className="place-guest-row__identity" onClick={(event) => openProfile(event.currentTarget)} aria-label={`Voir le profil de ${participant.profile.displayName}`}>
            <span className="place-guest-row__headline">
              <strong>{participant.profile.displayName}</strong>{isJuror ? <span className="place-guest-row__jury-badge"><Scale aria-hidden="true" />Jury</span> : null}
              <MeewavGradeBadge level={participant.profile.gradeLevel as GradeLevel} size="xs" variant="icon" />
            </span>
            <span className="place-guest-row__role">{participant.profile.role}</span>
          </button>
          {variant !== "queue" ? <span className="place-guest-row__status-line">
            <span className={`place-guest-row__status-pill is-${statusTone}`} title={statusText}>
              {statusTone === "ready" ? <CircleCheck aria-hidden="true" /> : statusTone === "stage" ? <RadioTower aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
              <strong>{visibleStatus}</strong>
            </span>
            {hasUnstableConnection ? <span className="place-guest-row__connection-indicator" aria-label="Connexion instable"><TriangleAlert aria-hidden="true" /><span>Instable</span></span> : null}
          </span> : null}
        </div>
        <div className="place-guest-row__lower">
          {stageControls ?? <span className="place-guest-row__media-details" aria-label={`Micro ${participant.isMicrophoneEnabled ? "actif" : "coupé"}. Caméra ${participant.isCameraEnabled ? "active" : "coupée"}.`}>
            {allMediaReady ? <small className="is-ready"><Mic aria-hidden="true" /><Camera aria-hidden="true" />Micro et caméra prêts</small> : <>
              <small className={participant.isMicrophoneEnabled ? "is-ready" : "is-off"}>{participant.isMicrophoneEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}Micro {participant.isMicrophoneEnabled ? "prêt" : "coupé"}</small>
              <i aria-hidden="true" />
              <small className={participant.isCameraEnabled ? "is-ready" : "is-off"}>{participant.isCameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}Caméra {participant.isCameraEnabled ? "prête" : "coupée"}</small>
            </>}
          </span>}
          <div className="place-guest-row__actions">
            {actions.map((rowAction) => <button key={`${rowAction.direction}-${rowAction.tone}`} type="button" className={`place-guest-row__primary is-${rowAction.tone}`} data-direction={rowAction.direction} onClick={rowAction.onAction} aria-label={`${rowAction.label} ${participant.profile.displayName}`} disabled={rowAction.disabled}>
              {rowAction.direction === "select" ? <Sparkles aria-hidden="true" /> : rowAction.direction === "up" ? <ArrowUpToLine aria-hidden="true" /> : <ArrowDownToLine aria-hidden="true" />}<span>{rowAction.text}</span>
            </button>)}
          </div>
        </div>
      </div>
      {queueWaitingTime ? <span className="place-guest-row__status-line is-corner">
        <span className="place-guest-row__status-pill is-queue" title={statusText} aria-label={`En attente depuis ${queueWaitingTime}`}>
          <Clock3 aria-hidden="true" />
          <strong>{queueWaitingTime}</strong>
        </span>
      </span> : null}
      <GuestRowMenu participant={participant} variant={variant} onOpenProfile={() => openProfile()} onMessageProfile={onMessageProfile} onCollaborateProfile={onCollaborateProfile} onRemove={onRemove} />
      {profileTrigger ? <Suspense fallback={null}><GuestPreProfile
        person={{ id: participant.profile.id, name: participant.profile.displayName, avatarUrl: participant.profile.avatarUrl,
          role: participant.profile.role, gradeLevel: participant.profile.gradeLevel as GradeLevel,
          microphone: participant.isMicrophoneEnabled ? "ready" : "off", camera: participant.isCameraEnabled ? "ready" : "off" }}
        source={profileSource} returnFocusTo={profileTrigger} {...getRoomPreProfileBounds(profileTrigger)}
        onClose={() => setProfileTrigger(null)} /></Suspense> : null}
    </article>
  );
}

function PlaceChat({ room, canEngage, isHost, active, onSend, onPinMessage, onDeleteMessage }: { room: PlaceRoomState; canEngage: boolean; isHost: boolean; active: boolean; onSend: (content: string) => Promise<void>; onPinMessage: (messageId: string, durationSeconds?: 10 | 20 | 30) => Promise<void>; onDeleteMessage: (messageId: string) => Promise<void> }) {
  const chatPresentation = useRoomPresentation();
  const compactChat = false;
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [scriptedMessages, setScriptedMessages] = useState<PlaceRoomState["messages"]>([]);
  const [followingLive, setFollowingLive] = useState(true);
  const [unreadLiveMessages, setUnreadLiveMessages] = useState(0);
  const messagesViewport = useRef<HTMLDivElement | null>(null);
  const followLiveChat = useRef(true);
  const programmaticScroll = useRef(false);
  const programmaticScrollTimer = useRef<number | null>(null);
  const pinned = room.pinnedMessageId
    ? room.messages.find((message) => message.id === room.pinnedMessageId)
    : undefined;
  const visibleMessages = useMemo(
    () => [...room.messages, ...(room.source === "demo" ? scriptedMessages : [])]
      .filter((message) => message.id !== pinned?.id)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
    [pinned?.id, room.messages, room.source, scriptedMessages],
  );
  const lastMessageId = visibleMessages[visibleMessages.length - 1]?.id;

  useEffect(() => {
    const seedCount = room.source === "demo" ? Math.min(8, PLACE_DEMO_CHAT_SCRIPT.length) : 0;
    const seedNow = Date.now();
    setScriptedMessages(PLACE_DEMO_CHAT_SCRIPT.slice(0, seedCount).map((beat, index) => ({
      id: `demo-chat-seed-${index}`,
      author: beat.author,
      content: beat.content,
      createdAt: new Date(seedNow - (seedCount - index) * 1_000).toISOString(),
    })));
    followLiveChat.current = true;
    setFollowingLive(true);
    setUnreadLiveMessages(0);
    programmaticScroll.current = false;
    if (room.source !== "demo") return;

    let stopped = false;
    let timer: number | null = null;
    let cursor = seedCount;
    let cycle = 0;

    const enqueueNext = () => {
      const beat = PLACE_DEMO_CHAT_SCRIPT[cursor];
      if (!beat) return;
      const liveDelay = cycle === 0 && cursor === seedCount
        ? DEMO_CHAT_FIRST_MESSAGE_DELAY_MS
        : Math.min(
            DEMO_CHAT_MAX_DELAY_MS,
            Math.max(DEMO_CHAT_MIN_DELAY_MS, Math.round(beat.delayMs * DEMO_CHAT_ACTIVITY_SCALE * (cursor % 6 < 2 ? 0.5 : 1))),
          );
      timer = window.setTimeout(() => {
        if (stopped) return;
        const messageIndex = cursor;
        setScriptedMessages((current) => [
          ...current,
          {
            id: `demo-chat-loop-${cycle}-${messageIndex}`,
            author: beat.author,
            content: beat.content,
            createdAt: new Date().toISOString(),
          },
        ].slice(-40));

        cursor += 1;
        if (cursor >= PLACE_DEMO_CHAT_SCRIPT.length) {
          cursor = 0;
          cycle += 1;
        }
        enqueueNext();
      }, liveDelay);
    };

    enqueueNext();
    return () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [room.id, room.source, PLACE_DEMO_CHAT_SCRIPT]);

  useEffect(() => {
    const viewport = messagesViewport.current;
    if (!viewport || !active) return;
    if (!followLiveChat.current) {
      setUnreadLiveMessages((count) => count + 1);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      programmaticScroll.current = true;
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: reducedMotion ? "auto" : "smooth" });
      if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
      programmaticScrollTimer.current = window.setTimeout(() => {
        programmaticScroll.current = false;
      }, CHAT_SCROLL_SETTLE_MS);
      setFollowingLive(true);
      setUnreadLiveMessages(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, lastMessageId]);

  useEffect(() => () => {
    if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = draft.trim();
    if (!value) return;
    setSendError(null);
    if (sending) return;
    followLiveChat.current = true;
    setFollowingLive(true);
    setUnreadLiveMessages(0);
    setSending(true);
    void onSend(value).then(() => {
      setDraft(current => current.trim() === value ? "" : current);
      const viewport = messagesViewport.current;
      if (!viewport) return;
      window.requestAnimationFrame(() => {
        const ownMessages = viewport.querySelectorAll<HTMLElement>(".is-own-message");
        const sent = ownMessages[ownMessages.length - 1];
        if (sent) {
          const target = sent.getBoundingClientRect();
          const bounds = viewport.getBoundingClientRect();
          viewport.scrollTo({ top: viewport.scrollTop + target.bottom - bounds.bottom + 12, behavior:"auto" });
        } else viewport.scrollTo({ top: viewport.scrollHeight, behavior:"auto" });
      });
    }).catch(reason => setSendError(reason instanceof Error ? reason.message : "Envoi impossible. Votre texte est conservé.")).finally(() => setSending(false));
  };

  return (
    <div className="place-chat">
      {pinned ? <div className="place-chat__pinned"><Pin aria-hidden="true" /><span><small>Épinglé par le host</small><strong><MeeWavRichText>{pinned.content}</MeeWavRichText></strong></span></div> : null}
      <div className="place-chat__stream">
        <div
          ref={messagesViewport}
          className="place-chat__messages"
          aria-label="Messages du chat en direct"
          aria-live={room.source === "demo" ? "off" : "polite"}
          tabIndex={0}
          onScroll={(event) => {
            if (programmaticScroll.current) return;
            const viewport = event.currentTarget;
            const isAtLiveEdge = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 64;
            followLiveChat.current = isAtLiveEdge;
            setFollowingLive(isAtLiveEdge);
            if (isAtLiveEdge) setUnreadLiveMessages(0);
          }}
        >
          {visibleMessages.map((message) => {
            if (message.isSystem) {
              return <div className="place-chat__system" key={message.id}><Sparkles aria-hidden="true" /> <MeeWavRichText>{message.content}</MeeWavRichText></div>;
            }
            const authorIsHost = message.author?.id === room.host.id;
            const authorName = message.author?.displayName || "MeeWav";

            return (
              <article
                className={`place-chat__message${message.id.startsWith("local-") ? " is-own-message" : ""}${compactChat ? " is-inline-message" : ""}${authorIsHost ? " is-host" : ""}${message.id.startsWith("demo-chat-loop-") ? " is-live-entry" : ""}`}
                data-author-role={authorIsHost ? "host" : "participant"}
                aria-label={authorIsHost ? `Message du Host ${authorName}` : undefined}
                key={message.id}
              >
                <header>
                  <span className="place-chat__author">
                    <span className="place-chat__portrait" aria-hidden="true">
                      {authorName.slice(0, 1)}
                      {message.author?.avatarUrl ? <img src={message.author.avatarUrl} alt="" decoding="async" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : null}
                    </span>
                    <strong>{`@${authorName.replace(/^@+/, "")}`}</strong>{message.id.startsWith("local-") ? <small className="wave-chat-own-badge">Vous</small> : null}
                  </span>
                  {compactChat ? <span className="wave-chat-inline-text"> <MeeWavRichText emoticonSize={34}>{message.content}</MeeWavRichText></span> : null}
                  {authorIsHost ? <span className="place-chat__host-badge" aria-label="Host de la Room">HOST</span> : null}
                  <time dateTime={message.createdAt}>{messageClock(message.createdAt)}</time>
                  {isHost && !message.id.startsWith("demo-chat-") ? <span className="place-chat__moderation"><button type="button" className="place-chat__pin-action" onClick={() => void onPinMessage(message.id)} aria-label={`Épingler le message de ${authorName}`} title="Épingler"><Pin aria-hidden="true" /></button><button type="button" className="place-chat__delete-action" onClick={() => void onDeleteMessage(message.id)} aria-label={`Supprimer le message de ${authorName}`} title="Supprimer"><Trash2 aria-hidden="true" /></button></span> : null}
                </header>
                {!compactChat ? <p><MeeWavRichText emoticonSize={34}>{message.content}</MeeWavRichText></p> : null}

              </article>
            );
          })}
        </div>
        {!followingLive ? <button type="button" className="place-chat__return-live" onClick={() => {
          followLiveChat.current = true;
          setFollowingLive(true);
          setUnreadLiveMessages(0);
          const viewport = messagesViewport.current;
          if (!viewport) return;
          programmaticScroll.current = true;
          viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
          if (programmaticScrollTimer.current !== null) window.clearTimeout(programmaticScrollTimer.current);
          programmaticScrollTimer.current = window.setTimeout(() => { programmaticScroll.current = false; }, CHAT_SCROLL_SETTLE_MS);
        }}><ChevronDown aria-hidden="true" />{unreadLiveMessages > 0 ? `${unreadLiveMessages} nouveau${unreadLiveMessages > 1 ? "x" : ""}` : "Revenir au direct"}</button> : null}
      </div>
      {sendError ? <p role="alert" className="wave-chat-send-error">{sendError}</p> : null}
      <form className="place-chat__composer is-liquid-glass" onSubmit={submit}>
        <div className="place-chat__input-well">
          <label>
            <span className="sr-only">Écrire un message</span>
            <MeeWavEmoticonComposer
              value={draft}
              onChange={setDraft}
              placeholder={canEngage ? "Écris un message…" : "Chat disponible après une entrée dans la file"}
              maxLength={1_000}
              disabled={!canEngage}
              ariaLabel="Écrire un message"
            />
          </label>
          <MeeWavEmoticonPicker
            className="place-chat__emoji"
            panelClassName="mw-emoticon-wall--room-chat"
            triggerIcon={<Smile aria-hidden="true" />}
            disabled={!canEngage}
            onSelect={(emoticon) => setDraft((value) => appendMeeWavEmoticon(value, emoticon.name, 1_000))}
          />
          <button className="place-chat__send" type="submit" disabled={!canEngage || sending || !draft.trim()} aria-label="Envoyer"><Send aria-hidden="true" /></button>
        </div>
      </form>
    </div>
  );
}

function LocalCameraPreview({ stream, format }: { stream: MediaStream; format: "landscape" | "portrait" }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <video ref={videoRef} className={`place-green-house__video is-${format}`} autoPlay muted playsInline />;
}

export function PlaceAudienceJourney({
  room,
  isGuest,
  onJoinQueue,
  onLeaveQueue,
  onAcceptInvitation,
  onDeclineInvitation,
  onMarkReady,
  onOpenMixer,
}: Pick<PlaceStudioPanelProps, "room" | "isGuest" | "onJoinQueue" | "onLeaveQueue" | "onAcceptInvitation" | "onDeclineInvitation" | "onMarkReady"> & { onOpenMixer?: () => void }) {
  const presentation = useRoomPresentation();
  const personalMix = useViewerMixer();
  const [audioVerified, setAudioVerified] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewAttempt = useRef(0);
  const [queueBusy, setQueueBusy] = useState(false);
  const queuePending = useRef(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [format, setFormat] = useState<"landscape" | "portrait">("landscape");
  const profileId = room.currentUserProfile?.id;
  const journey = profileId
    ? room.participants.find((participant) => participant.profile.id === profileId)
      ?? room.queue.find((participant) => participant.profile.id === profileId)
    : undefined;
  const profile = room.currentUserProfile;
  const runCageJourneyAction = async (action: () => Promise<void>) => {
    if (queuePending.current || !profile) return;
    queuePending.current = true;
    setQueueBusy(true);
    setQueueError(null);
    try { await action(); }
    catch { setQueueError("La demande n’a pas abouti. Réessaie dans un instant."); }
    finally { queuePending.current = false; setQueueBusy(false); }
  };
  useEffect(() => () => previewStream?.getTracks().forEach((track) => track.stop()), [previewStream]);
  useEffect(() => { ++previewAttempt.current; return () => { ++previewAttempt.current; }; }, [journey?.status]);
  useEffect(() => {
    if (journey?.status === "accepted" || !previewStream) return;
    previewStream.getTracks().forEach((track) => track.stop());
    setPreviewStream(null);
  }, [journey?.status, previewStream]);

  const openPreview = async () => {
    if (previewBusy) return;
    const attempt = ++previewAttempt.current;
    setPreviewBusy(true); setQueueError(null); setAudioVerified(false);
    try {
      // The viewer microphone remains owned by the mixer, including after Green House closes.
      if (personalMix) await personalMix.prepareVoice();
      if (attempt !== previewAttempt.current) return;
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !personalMix });
      if (attempt !== previewAttempt.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      stream.getVideoTracks().forEach((track) => { track.enabled = cameraEnabled; });
      setPreviewStream(stream);
    } catch {
      if (attempt === previewAttempt.current) { setPreviewStream(null); setQueueError("Vérification impossible : vérifie les autorisations caméra et micro, puis réessaie."); }
    } finally { if (attempt === previewAttempt.current) setPreviewBusy(false); }
  };

  const togglePreviewTrack = (kind: "audio" | "video", enabled: boolean) => {
    previewStream?.getTracks().filter((track) => track.kind === kind).forEach((track) => { track.enabled = enabled; });
  };
  const renderJourney = (
    modifier: string,
    eyebrow: string,
    title: string,
    description: string,
    actionLabel?: string,
    onAction?: () => Promise<void>,
    secondaryActionLabel?: string,
    onSecondaryAction?: () => Promise<void>,
  ) => (
    <div className={`place-audience-journey${modifier ? ` ${modifier}` : ""}${profile ? " has-profile" : ""}`}>
      {profile ? (
        <div className="place-audience-journey__preview">
          <img src={profile.avatarUrl} alt={`Aperçu de ${profile.displayName}`} />
          {journey ? (
            <span aria-label={`Micro ${journey.isMicrophoneEnabled ? "actif" : "coupé"}, caméra ${journey.isCameraEnabled ? "active" : "coupée"}`}>
              <Mic aria-hidden="true" className={!journey.isMicrophoneEnabled ? "is-off" : ""} />
              <Camera aria-hidden="true" className={!journey.isCameraEnabled ? "is-off" : ""} />
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="place-audience-journey__copy">
        <span>{modifier === "is-live" ? <i /> : null}{eyebrow}</span>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      {actionLabel && onAction ? <div className="place-audience-journey__actions"><button type="button" disabled={presentation.id === "cage" && queueBusy} onClick={() => void (presentation.id === "cage" ? runCageJourneyAction(onAction) : onAction())}>{actionLabel}</button>{secondaryActionLabel && onSecondaryAction ? <button type="button" className="is-secondary" disabled={presentation.id === "cage" && queueBusy} onClick={() => void (presentation.id === "cage" ? runCageJourneyAction(onSecondaryAction) : onSecondaryAction())}>{secondaryActionLabel}</button> : null}</div> : null}
      {presentation.id === "cage" && queueError ? <p role="alert">{queueError}</p> : null}
    </div>
  );

  if (journey?.status === "onstage") {
    return renderJourney("is-live", "SUR SCÈNE", "Tu participes au live", "Ton micro, ta caméra et tes FX restent accessibles dans Mixeur.");
  }
  if (journey?.status === "backstage") {
    return renderJourney("is-ready", "COULISSES", "Le Host te prépare", "Tu rejoindras la Scène dès que le Host te fera monter.");
  }
  if (journey?.status === "ready" || isGuest) {
    return renderJourney("is-ready", "OBS MEEWAV PRÊT", "Tout est prêt", "Le Host peut maintenant t’ouvrir les Coulisses.");
  }
  if (journey?.status === "accepted") {
    return (
      <section className="place-green-house" aria-label="Préparation privée OBS MeeWav">
        <header><span><small>OBS MEEWAV</small><strong>Prépare ton entrée</strong></span><em>Privé</em></header>
        {previewStream ? <LocalCameraPreview stream={previewStream} format={format} /> : <button type="button" className="place-green-house__start" disabled={previewBusy} onClick={() => void openPreview()}><Camera aria-hidden="true" /> Activer mon aperçu</button>}
        <div className="place-green-house__controls">
          <button type="button" className={!cameraEnabled ? "is-off" : ""} onClick={() => { const next = !cameraEnabled; setCameraEnabled(next); togglePreviewTrack("video", next); }} aria-pressed={cameraEnabled}>{cameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}<span>Caméra</span></button>
          <button type="button" className={(personalMix ? personalMix.levels.voice.muted : !microphoneEnabled) ? "is-off" : ""} onClick={() => { if (personalMix) { personalMix.toggleMute("voice"); return; } const next = !microphoneEnabled; setMicrophoneEnabled(next); togglePreviewTrack("audio", next); }} aria-pressed={personalMix ? !personalMix.levels.voice.muted : microphoneEnabled}>{(personalMix ? !personalMix.levels.voice.muted : microphoneEnabled) ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}<span>Micro</span></button>
          <button type="button" onClick={() => setFormat((current) => current === "landscape" ? "portrait" : "landscape")} aria-label="Changer le format vidéo">{format === "landscape" ? <RectangleHorizontal aria-hidden="true" /> : <RectangleVertical aria-hidden="true" />}<span>{format === "landscape" ? "16:9" : "9:16"}</span></button>
        </div>
        {personalMix ? <ViewerGreenHouseAudioCheck onVerified={setAudioVerified} /> : null}
        {presentation.id === "cage" && onOpenMixer ? <button type="button" onClick={onOpenMixer}><SlidersHorizontal aria-hidden="true" />Régler mon OBS MeeWav</button> : null}
        {queueError ? <p role="alert">{queueError}</p> : null}
        <button type="button" className="place-green-house__ready" onClick={() => void (presentation.id === "cage" ? runCageJourneyAction(onMarkReady) : onMarkReady())} disabled={!previewStream || previewBusy || queueBusy || (Boolean(personalMix) && !audioVerified)}>Je suis prêt</button>
      </section>
    );
  }
  if (journey?.status === "pending" && journey.invitationId) {
    return renderJourney("is-invited", "INVITATION REÇUE", "Le Host t’invite", "Accepte pour préparer ton son et ta caméra dans OBS MeeWav.", "Accepter", onAcceptInvitation, "Refuser", onDeclineInvitation);
  }
  if (presentation.id === "place") {
    const queued = Boolean(journey?.queueEntryId) || room.queue.some(entry => entry.profile.id === room.currentUserProfile?.id);
    return <div className="place-conversation-queue"><span><strong>{queued ? "Demande en attente" : room.queueOpen ? "Envie de monter sur scène ?" : "La file d’attente est fermée"}</strong><small>{queued ? "Le host vous préviendra pour votre passage." : room.queueOpen ? "Demandez à rejoindre la scène." : "Le host annoncera sa réouverture."}</small></span><button type="button" disabled={queueBusy || !room.currentUserProfile || (!queued && !room.queueOpen)} onClick={() => {setQueueBusy(true);setQueueError(null);void (queued ? onLeaveQueue() : onJoinQueue()).catch(() => setQueueError("La demande n’a pas abouti. Réessayez.")).finally(() => setQueueBusy(false));}}>{queueBusy ? "En cours…" : queued ? "Quitter la file" : "Rejoindre la file d’attente"}</button>{queueError ? <p role="alert">{queueError}</p> : null}</div>;
  }
  if (presentation.id === "scene") {
    const queued = Boolean(journey?.queueEntryId);
    return <div className="scene-queue-action"><span><strong>{queued ? "Vous êtes dans la file" : "Envie de monter sur scène ?"}</strong><small>{queued ? "Le host vous avertira lorsqu’une place se libère." : "Demandez votre passage, le host vous invitera."}</small></span><button type="button" disabled={queueBusy || !room.currentUserProfile} onClick={() => {setQueueBusy(true);setQueueError(null);void (queued ? onLeaveQueue() : onJoinQueue()).catch(() => setQueueError("La demande n’a pas abouti. Réessayez.")).finally(() => setQueueBusy(false));}}>{queueBusy ? "En cours…" : queued ? "Quitter la file" : "Rejoindre la file d’attente"}</button>{queueError ? <p role="alert">{queueError}</p> : null}</div>;
  }
  if (journey?.queueEntryId) {
    if (presentation.id === "cage") return <div className="cage-audience-apply"><span>Candidature en attente</span><button type="button" disabled={queueBusy} onClick={() => void runCageJourneyAction(onLeaveQueue)}>Retirer ma candidature</button>{queueError ? <p role="alert">{queueError}</p> : null}</div>;
    return presentation.id === "wave"
      ? renderJourney("is-queued", "INVITATION SUR SCÈNE", "Invitation sur scène : en attente", "Votre boucle suit un parcours indépendant.", "Quitter la file scène", onLeaveQueue)
      : renderJourney("", "FILE D’ATTENTE", "Ta demande est envoyée", "Tu seras averti si le host t’invite à préparer ton OBS MeeWav.", "Quitter", onLeaveQueue);
  }
  if (presentation.id === "cage" && !isGuest) return room.queueOpen ? <div className="cage-audience-apply"><button type="button" disabled={queueBusy || !profile} onClick={() => void runCageJourneyAction(onJoinQueue)}>{queueBusy ? "Envoi…" : "Participer au battle"}</button>{queueError ? <p role="alert">{queueError}</p> : null}</div> : null;
  if (!journey && !isGuest) return null;
  return renderJourney("", "PARTICIPER", "Envie de monter sur Scène ?", "Rejoins la file sans interrompre le live.", "Rejoindre", onJoinQueue);
}

function ChatAudiencePoll({ room, canEngage, onVotePoll }: Pick<PlaceStudioPanelProps, "room" | "canEngage" | "onVotePoll">) {
  const poll = room.poll;
  const showPoll = poll && (poll.isActive || poll.resultsVisible);
  const hasVoted = poll?.currentUserVoteIndex != null;
  const isPreview = room.source === "demo" && poll?.id === "wave-poll-preview";
  const totalVotes = poll?.options.reduce((total, option) => total + option.votes, 0) ?? 0;
  return <section className="place-tool-card is-chat-poll rooms-shared-poll" aria-label="Sondage rapide">
    {showPoll ? <>
      <header className="place-tool-card__header">
        <span className="place-tool-card__glyph"><BarChart3 aria-hidden="true" /></span>
        <span>
          <small>{poll.isActive ? "SONDAGE EN DIRECT" : "RÉSULTAT DU SONDAGE"}</small>
          <strong>{poll.question}</strong>
          <em>{hasVoted ? "Votre réponse a été enregistrée" : poll.isActive ? "Choisissez une réponse" : "Le sondage est terminé"}</em>
        </span>
      </header>
      <div className="place-chat-poll__options">
        {poll.options.map((option, optionIndex) => <button
          type="button"
          key={`${poll.id}-${optionIndex}`}
          aria-pressed={poll.currentUserVoteIndex === optionIndex}
          className={poll.currentUserVoteIndex === optionIndex ? "is-active" : ""}
          disabled={!canEngage || !onVotePoll || !poll.isActive || (hasVoted && !isPreview)}
          onClick={() => onVotePoll?.(optionIndex)}
        >
          {poll.resultsVisible ? <i className="chat-poll-result-fill" aria-hidden="true" style={{width:`${option.weightedPercent ?? (totalVotes ? option.votes / totalVotes * 100 : 0)}%`}} /> : null}
          <span>{option.label}{poll.currentUserVoteIndex === optionIndex ? <small>Votre choix ✓</small> : null}</span>
          {poll.resultsVisible ? <strong>{Math.round(option.weightedPercent ?? (totalVotes ? option.votes / totalVotes * 100 : 0))}%<small>{option.votes} votes</small></strong> : null}
        </button>)}
      </div>
      {poll.resultsVisible ? <p className="chat-poll-total">{totalVotes} votes{isPreview ? " simulés · cliquez sur une réponse pour choisir ou modifier votre choix" : ""}</p> : null}
    </> : <p className="place-tool-card__availability"><strong>Aucun sondage en cours</strong><span>Le prochain sondage du Host apparaîtra ici automatiquement.</span></p>}
  </section>;
}

function PlaceChatWorkspace({
  room,
  isHost,
  canEngage,
  active,
  giftOnly = false,
  initialGiftRecipientId,
  onSendMessage,
  onDeleteMessage,
  chatSocialActions,
  onVotePoll,
  onLaunchPoll,
  onStopPoll,
  onPinMessage,
  onPinHighlight,
  onClearHighlight,
  onSubmitGift,
  onCreateGiftDraw,
  onScheduleGiftDraw,
  onStartGiftDraw,
  onCancelGiftDraw,
}: Pick<PlaceStudioPanelProps, "room" | "isHost" | "canEngage" | "onSendMessage" | "onDeleteMessage" | "chatSocialActions" | "onVotePoll" | "onLaunchPoll" | "onStopPoll" | "onPinMessage" | "onPinHighlight" | "onClearHighlight" | "onSubmitGift" | "onCreateGiftDraw" | "onScheduleGiftDraw" | "onStartGiftDraw" | "onCancelGiftDraw"> & { active: boolean; giftOnly?: boolean; initialGiftRecipientId?: string }) {
  const compactViewerActions = useRoomPresentation().id === "cage" && Boolean(chatSocialActions);
  const [previewPoll, setPreviewPoll] = useState<PlaceRoomState["poll"]>(null);
  useEffect(() => {
    const show = () => {
      if (isHost || room.source !== "demo") return;
      setPreviewPoll({ id:"wave-poll-preview", question:"Quelle direction pour la prochaine boucle ?", options:[{label:"Une basse plus profonde",votes:42},{label:"Des voix et harmonies",votes:28},{label:"Une nouvelle rythmique",votes:19}], durationSeconds:null, endsAt:null, isActive:true, resultsVisible:true, currentUserVoteIndex:null });
    };
    window.addEventListener("wave-preview-poll-ready", show);
    return () => window.removeEventListener("wave-preview-poll-ready", show);
  }, [room.id, room.source, isHost]);
  const votePreviewPoll = (index: number) => setPreviewPoll(current => !current || current.currentUserVoteIndex === index ? current : {...current, currentUserVoteIndex:index, options:current.options.map((option, i) => ({...option, votes:option.votes + (i === index ? 1 : 0) - (i === current.currentUserVoteIndex ? 1 : 0)}))});
  const [highlightDuration, setHighlightDuration] = useState<10 | 20 | 30>(10);
  const [selectedMessageId, setSelectedMessageId] = useState(room.pinnedMessageId ?? "");
  const [activeTool, setActiveTool] = useState<"messages" | "poll" | "pin" | "gift">(giftOnly ? "gift" : "messages");
  const [toolBusy, setToolBusy] = useState<"poll" | "pin" | "highlight" | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const [messagingGiftRecipients, setMessagingGiftRecipients] = useState<PlaceGiftRecipientOption[]>([]);
  const [messagingGiftStatus, setMessagingGiftStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [messagingGiftError, setMessagingGiftError] = useState<string | null>(null);
  const selectableMessages = room.messages.filter((message) => !message.isSystem && message.author);
  const selectedMessage = selectableMessages.find((message) => message.id === selectedMessageId);
  const pinnedMessage = room.pinnedMessageId
    ? room.messages.find((message) => message.id === room.pinnedMessageId)
    : undefined;
  const roomGiftRecipients = useMemo(() => {
    const recipients = new Map<string, PlaceGiftRecipientOption>();
    const addParticipant = (participant: PlaceParticipant, source: PlaceGiftRecipientOption["source"], detail: string) => {
      const profileId = participant.profile.id.trim();
      const displayName = participant.profile.displayName.trim();
      if (!profileId || !displayName || (isHost && profileId === room.host.id) || recipients.has(profileId)) return;
      recipients.set(profileId, {
        profileId,
        displayName,
        avatarUrl: participant.profile.avatarUrl || participant.imageUrl,
        detail,
        source,
      });
    };

    room.participants
      .filter((participant) => participant.status === "onstage")
      .forEach((participant) => addParticipant(participant, "stage", "Invité sur scène"));
    room.participants
      .filter((participant) => participant.status === "backstage")
      .forEach((participant) => addParticipant(participant, "backstage", "Prêt dans les coulisses"));
    room.queue.forEach((participant) => addParticipant(
      participant,
      "queue",
      participant.status === "ready"
        ? "Prêt dans la file"
        : participant.status === "accepted"
          ? "Invitation acceptée"
          : "En attente",
    ));

    if (!isHost && !recipients.has(room.host.id)) {
      recipients.set(room.host.id, {
        profileId: room.host.id,
        displayName: room.host.displayName,
        avatarUrl: room.host.avatarUrl,
        detail: "Host de la Room",
        source: "stage",
      });
    }

    return Array.from(recipients.values());
  }, [isHost, room.host, room.participants, room.queue]);

  const giftRecipientOptions = useMemo(
    () => [...roomGiftRecipients, ...messagingGiftRecipients],
    [messagingGiftRecipients, roomGiftRecipients],
  );

  useEffect(() => {
    if (activeTool !== "gift" || !isHost) return undefined;
    if (room.source === "demo") {
      setMessagingGiftRecipients(demoContacts.map((contact) => ({
        profileId: contact.id,
        displayName: contact.displayName,
        avatarUrl: contact.avatar,
        detail: [`@${contact.username.replace(/^@+/, "")}`, contact.role].filter(Boolean).join(" · "),
        source: "messaging" as const,
      })));
      setMessagingGiftStatus("ready");
      setMessagingGiftError(null);
      return undefined;
    }

    let cancelled = false;
    setMessagingGiftRecipients([]);
    setMessagingGiftStatus("loading");
    setMessagingGiftError(null);
    void messagingRepository.listConversations({ kinds: ["direct"], limit: 50 })
      .then((rows) => {
        if (cancelled) return;
        const recipients = new Map<string, PlaceGiftRecipientOption>();
        rows.forEach((row) => {
          if (row.kind !== "direct") return;
          const profileId = row.counterpart_profile_id?.trim() ?? "";
          const displayName = row.counterpart_display_name?.trim()
            || row.counterpart_username?.trim()
            || "";
          if (!profileId || !displayName || profileId === room.host.id || recipients.has(profileId)) return;
          const username = row.counterpart_username?.trim().replace(/^@+/, "") ?? "";
          const role = row.counterpart_primary_role_key?.trim().replace(/[_-]+/g, " ") ?? "";
          recipients.set(profileId, {
            profileId,
            displayName,
            avatarUrl: row.counterpart_avatar_url ?? undefined,
            detail: [username ? `@${username}` : "", role].filter(Boolean).join(" · ") || "Contact récent",
            source: "messaging",
          });
        });
        setMessagingGiftRecipients(Array.from(recipients.values()));
        setMessagingGiftStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setMessagingGiftRecipients([]);
        setMessagingGiftStatus("error");
        setMessagingGiftError("Impossible de charger les contacts récents");
      });
    return () => {
      cancelled = true;
    };
  }, [activeTool, isHost, room.host.id, room.source]);

  const submitPin = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedMessage || !isHost) return;
    void runTool("pin", () => onPinMessage(selectedMessage.id, highlightDuration));
  };

  const submitHighlight = () => {
    if (!selectedMessage || !isHost) return;
    void runTool("highlight", () => onPinHighlight(selectedMessage.content, highlightDuration));
  };

  const runTool = async (tool: "pin" | "highlight", action: () => Promise<void>) => {
    if (toolBusy) return;
    setToolError(null);
    setToolBusy(tool);
    try {
      await action();
    } catch {
      setToolError("L’action n’a pas pu être confirmée. Réessayez.");
    } finally {
      setToolBusy(null);
    }
  };

  const submitDirectGift = useCallback(async (submission: PlaceGiftSubmission) => {
    if (!onSubmitGift) throw new Error("gift-delivery-unavailable");
    const giftCode = roomGiftCodeForLabel(submission.gift);
    if (!giftCode) throw new Error("gift-delivery-invalid-gift");
    const action = submission.action === "Envoyer maintenant"
      ? "send_now"
      : submission.action === "Programmer"
        ? "schedule"
        : "round";
    const scheduledDate = action === "schedule"
      ? new Date(`${submission.date}T${submission.time}:00`)
      : null;
    const scheduledAt = scheduledDate && Number.isFinite(scheduledDate.getTime())
      ? scheduledDate.toISOString()
      : null;
    const delivery = await onSubmitGift({
      giftCode,
      giftLabel: submission.gift,
      recipientProfileId: submission.recipientProfileId,
      recipientDisplayName: submission.recipient,
      recipientAvatarUrl: submission.recipientAvatarUrl,
      recipientSource: submission.recipientSource,
      action,
      scheduledAt,
      roundLabel: action === "round" ? submission.round : null,
      idempotencyKey: submission.idempotencyKey,
    });
    if (!delivery) throw new Error("gift-delivery-not-confirmed");
  }, [onSubmitGift]);

  if (!isHost) return (
    <div className={`place-chat-workspace is-viewer-chat${compactViewerActions ? " is-compact-engagement" : ""}`}>
      {!previewPoll && room.poll && (room.poll.isActive || room.poll.resultsVisible) ? <div className="rooms-chat-poll-slot"><ChatAudiencePoll room={room} canEngage={canEngage} onVotePoll={onVotePoll} /></div> : null}
      {previewPoll ? <div className="wave-chat-poll-preview"><header><small>SONDAGE · SIMULATION</small><button type="button" aria-label="Fermer le sondage simulé" onClick={() => setPreviewPoll(null)}><X aria-hidden="true" /></button></header><ChatAudiencePoll room={{...room,poll:previewPoll}} canEngage={true} onVotePoll={votePreviewPoll} /><small>Réponses du public simulées · aucun vote réel envoyé</small></div> : null}
      <div className="place-chat-workspace__body">
        {compactViewerActions ? <header className="place-chat-workspace__engagement">
          <h3 className="place-chat-workspace__host-support"><span>Soutenir le host</span><small>Likes, Golden Likes et dons pour {room.host.displayName}</small></h3>
          {chatSocialActions}
        </header> : null}
        <section className="place-chat-workspace__panel" aria-label="Messages du chat">
          <PlaceChat room={room} canEngage={canEngage} isHost={false} active={active} onSend={onSendMessage} onPinMessage={onPinMessage} onDeleteMessage={onDeleteMessage} />
        </section>
        {compactViewerActions ? null : chatSocialActions}
      </div>
    </div>
  );

  const chatActions = [
    { id: "messages" as const, label: "Messages", icon: <MessageCircle aria-hidden="true" /> },
    { id: "poll" as const, label: "Sondages", icon: <BarChart3 aria-hidden="true" /> },
    { id: "pin" as const, label: "Épinglés", icon: <Pin aria-hidden="true" /> },
    { id: "gift" as const, label: "Cadeaux", icon: <Gift aria-hidden="true" /> },
  ];
  const toolRail = <PlaceToolsSwitch
    activeTool={activeTool}
    ariaLabel="Actions du Chat"
    idPrefix="place-chat-action"
    items={chatActions.map((item) => ({ ...item, controlsId: `place-chat-panel-${item.id}` }))}
    onSelect={(tool) => { setToolError(null); setActiveTool(tool); }}
    semantics="tabs"
  />;
  const messagePicker = <fieldset className="place-chat-message-picker"><legend>Choisir un message récent</legend><div>{selectableMessages.slice(-12).reverse().map((message) => <label key={message.id} className={selectedMessageId === message.id ? "is-selected" : ""}><input type="radio" name={`chat-message-${activeTool}`} value={message.id} checked={selectedMessageId === message.id} onChange={() => setSelectedMessageId(message.id)} /><img src={message.author?.avatarUrl} alt="" /><span><strong>{message.author?.displayName}</strong><span><MeeWavRichText>{message.content}</MeeWavRichText></span></span></label>)}{!selectableMessages.length ? <p>Aucun message à sélectionner pour le moment.</p> : null}</div></fieldset>;
  const durationPicker = <fieldset className="place-tool-card__section"><legend>Durée d’affichage</legend><div className="place-tool-card__durations" aria-label="Durée d’affichage">{([10, 20, 30] as const).map((duration) => <button type="button" key={duration} className={highlightDuration === duration ? "is-active" : ""} aria-pressed={highlightDuration === duration} onClick={() => setHighlightDuration(duration)}>{duration} s</button>)}</div></fieldset>;
  const toolPanel = <>
      {!giftOnly ? <section id="place-chat-panel-messages" role="tabpanel" aria-labelledby="place-chat-action-messages" className="place-chat-workspace__panel" hidden={activeTool !== "messages"}><PlaceChat room={room} canEngage={canEngage} isHost={isHost} active={active && activeTool === "messages"} onSend={onSendMessage} onPinMessage={onPinMessage} onDeleteMessage={onDeleteMessage} /></section> : null}
      {activeTool === "poll" ? <section id="place-chat-panel-poll" role="tabpanel" aria-labelledby="place-chat-action-poll" className="place-chat-workspace__panel">{isHost ? <PlacePollToolPanel
        room={room}
        onLaunchPoll={onLaunchPoll}
        onStopPoll={onStopPoll}
        onOpenChat={() => setActiveTool("messages")}
        disabled={toolBusy !== null && toolBusy !== "poll"}
        onBusyChange={(pollBusy) => setToolBusy(pollBusy ? "poll" : null)}
      /> : <ChatAudiencePoll room={room} canEngage={canEngage} onVotePoll={onVotePoll} />}</section> : null}

      {activeTool === "gift" ? <section id="place-chat-panel-gift" role={giftOnly ? undefined : "tabpanel"} aria-labelledby={giftOnly ? undefined : "place-chat-action-gift"} className="place-chat-workspace__panel">{isHost ? <PlaceGiftTool
        initialRecipientProfileId={initialGiftRecipientId}
        senderGradeLevel={room.currentUserProfile?.gradeLevel}
        recipientOptions={giftRecipientOptions}
        queueCount={room.queue.length}
        roomCount={room.source === "demo" ? roomGiftRecipients.length : null}
        messagingStatus={messagingGiftStatus}
        messagingMode={room.source === "demo" ? "local-demo" : "live"}
        messagingError={messagingGiftError}
        onSubmit={onSubmitGift ? submitDirectGift : undefined}
        draw={room.giftDraw}
        onCreateDraw={onCreateGiftDraw}
        onScheduleDraw={onScheduleGiftDraw}
        onStartDraw={onStartGiftDraw}
        onCancelDraw={onCancelGiftDraw}
        disabled={!canEngage && !isHost}
      /> : <section className="place-tool-card"><header className="place-tool-card__header"><span className="place-tool-card__glyph"><Gift aria-hidden="true" /></span><span><small>CADEAUX DU LIVE</small><strong>Les attentions du Host</strong><em>Le Host distribue les cadeaux pendant le live.</em></span></header><p className="place-tool-card__availability"><strong>{room.giftDraw?.status === "spinning" ? "Un tirage est en cours" : room.giftDraw?.status === "revealed" ? "Le résultat du tirage est à l’écran" : "Restez dans le live"}</strong><span>Les cadeaux reçus sont conservés dans votre profil.</span></p></section>}</section> : null}

      {activeTool === "pin" ? <section id="place-chat-panel-pin" role="tabpanel" aria-labelledby="place-chat-action-pin" className="place-chat-workspace__panel">
        <PlaceChatPins room={room} isHost={isHost} busy={toolBusy !== null} onRemove={() => void runTool("pin", onClearHighlight)} onChoose={() => {
          setActiveTool("messages");
          window.requestAnimationFrame(() => document.getElementById("place-chat-action-messages")?.focus());
        }} />
      </section> : null}
    </>;
  return (
    <div className={`place-chat-workspace is-wave-tool-skin${giftOnly ? " is-gift-only" : ""}`} data-active-tool={activeTool}>
      {giftOnly ? null : toolRail}
      {toolError ? <p className="place-chat-workspace__error" role="alert">{toolError}</p> : null}
      <div className="place-chat-workspace__body">{toolPanel}</div>
    </div>
  );
}

function PlaceGuests({
  room, onMoveGuest, onInviteProfile, onRemoveGuest, onSetQueueOpen, onOpenProfile,
  onMessageProfile, onCollaborateProfile, mediaControls, momentVipPicker,
  momentVipSelectedProfileIds = [], onToggleMomentVipGuest,
  onConfirmMomentVipGuests, onCancelMomentVipPicker, onReturnToCage,
}: {
  room: PlaceRoomState;
  mediaControls: Pick<PlaceStudioPanelProps, "isHost" | "onMute" | "onCamera" | "liveKitVideoTracks">;
  onMoveGuest: PlaceStudioPanelProps["onMoveGuest"];
  onInviteProfile: (profileId: string) => Promise<void>;
  onRemoveGuest: PlaceStudioPanelProps["onRemoveGuest"];
  onSetQueueOpen: PlaceStudioPanelProps["onSetQueueOpen"];
  onOpenProfile: PlaceStudioPanelProps["onOpenProfile"];
  onMessageProfile: PlaceStudioPanelProps["onMessageProfile"];
  onCollaborateProfile: PlaceStudioPanelProps["onCollaborateProfile"];
  momentVipPicker?: boolean;
  momentVipSelectedProfileIds?: readonly string[];
  onToggleMomentVipGuest?: (participant: PlaceParticipant) => void;
  onConfirmMomentVipGuests?: () => void;
  onCancelMomentVipPicker?: () => void;
  onReturnToCage?: () => void;
}) {
  const isCage = useRoomPresentation().id === "cage";
  const desktopGuests = useRuntime().isDesktop && mediaControls.isHost;
  const [section, setSection] = useState<"stage" | "backstage" | "queue">("backstage");
  const cagePicking = Boolean(onReturnToCage);
  useEffect(() => { if (cagePicking) setSection("queue"); }, [cagePicking]);
  const [timeNow, setTimeNow] = useState(() => Date.now());
  const [filterState, setFilterState] = useState<"closed" | "open">("closed");

  const [selectedGrades, setSelectedGrades] = useState<GradeLevel[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<SceneArtistRoleId[]>([]);
  const [selectedReadiness, setSelectedReadiness] = useState<GuestReadinessFilter[]>([]);
  const [draftGrades, setDraftGrades] = useState<GradeLevel[]>([]);
  const [draftRoles, setDraftRoles] = useState<SceneArtistRoleId[]>([]);
  const [draftReadiness, setDraftReadiness] = useState<GuestReadinessFilter[]>([]);
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);
  const [selectedBackstageIds, setSelectedBackstageIds] = useState<string[]>([]);
  const [selectedStageIds, setSelectedStageIds] = useState<string[]>([]);
  const [bulkSelectionMode, setBulkSelectionMode] = useState<"queue" | "backstage" | null>(null);
  const [guestActionError, setGuestActionError] = useState("");
  const [dockPreview, setDockPreview] = useState<{ participant: PlaceParticipant; trigger: HTMLElement } | null>(null);
  const [guestActionBusy, setGuestActionBusy] = useState(false);
  const [backstageDropActive, setBackstageDropActive] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { policy: juryPolicy, error: juryLoadError } = useRoomVotingPolicy(room.id, room.source);
  const [juryOnly, setJuryOnly] = useState(false);
  const [juryBusy, setJuryBusy] = useState(false);
  const jurySaving = useRef(false);
  const [juryError, setJuryError] = useState("");
  useEffect(() => { setJuryOnly(false); setJuryError(""); setGuestActionError(""); setDockPreview(null); setSelectedQueueIds([]); setSelectedBackstageIds([]); setSelectedStageIds([]); setBulkSelectionMode(null); }, [room.id]);
  useEffect(() => {
    const timer = window.setInterval(() => setTimeNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const onStage = useMemo(() => room.participants.filter((participant) => participant.status === "onstage"), [room.participants]);
  const backstage = useMemo(() => [...new Map([...room.participants, ...room.queue]
    .filter((participant) => participant.status === "backstage" || participant.status === "ready")
    .map((participant) => [participant.profile.id, participant])).values()], [room.participants, room.queue]);
  const queue = useMemo(() => room.queue.filter((person) => person.status !== "ready").sort((left, right) => new Date(right.joinedAt).getTime() - new Date(left.joinedAt).getTime()), [room.queue]);
  const stageFull = onStage.length >= 3;
  const greenHouseCount = queue.filter((person) => Boolean(person.invitationId)).length;
  const waitingCount = queue.length;
  const matchesFilters = (participant: PlaceParticipant) => {
    const gradeMatches = selectedGrades.length === 0 || selectedGrades.includes(participant.profile.gradeLevel as GradeLevel);
    const roleMatches = selectedRoles.length === 0 || selectedRoles.some((role) => roleMatchesAvatarStyle(participant.profile.role, role));
    const readinessMatches = selectedReadiness.length === 0 || selectedReadiness.some((filter) => participantMatchesReadiness(participant, filter));
    return gradeMatches && roleMatches && readinessMatches;
  };
  const filteredStage = onStage.filter(matchesFilters);
  const filteredBackstage = backstage.filter(person => juryOnly
    ? juryPolicy.jurorIds.includes(person.profile.id)
    : matchesFilters(person));
  const saveJury = async (ids: string[], mode: RoomVoteMode = juryPolicy.mode) => {
    if (!mediaControls.isHost || jurySaving.current) return false;
    jurySaving.current = true;
    setJuryBusy(true);
    setJuryError("");
    try {
      await saveVotingPolicy(room.id, room.source, ids.length ? mode : "public", ids,
        backstage.map(person => person.profile.id), juryPolicy.revision);
      return true;
    } catch (reason) {
      setJuryError(reason instanceof Error ? reason.message : "Le jury n’a pas pu être enregistré.");
      return false;
    } finally { jurySaving.current = false; setJuryBusy(false); }
  };
  const leaveBackstage = async (participant: PlaceParticipant, next: () => Promise<void>) => {
    if (jurySaving.current) return;
    if (juryPolicy.jurorIds.includes(participant.profile.id)) {
      const saved = await saveJury(juryPolicy.jurorIds.filter(id => id !== participant.profile.id));
      if (!saved) return;
    }
    await next();
  };
  const toggleJuror = (profileId: string) => {
    if (juryPolicy.jurorIds.includes(profileId)) {
      void saveJury(juryPolicy.jurorIds.filter(id => id !== profileId));
    } else if (juryPolicy.jurorIds.length < 4) {
      void saveJury([...juryPolicy.jurorIds, profileId]);
    }
  };
  const filteredQueue = queue.filter(matchesFilters);
  const activeFilterCount = selectedGrades.length + selectedRoles.length + selectedReadiness.length;
  const canAcceptQueueGuest = (participant: PlaceParticipant) => Boolean(participant.queueEntryId) && !participant.invitationId;
  const selectableQueue = filteredQueue.filter(canAcceptQueueGuest);
  const allVisibleQueueSelected = selectableQueue.length > 0 && selectableQueue.every((participant) => selectedQueueIds.includes(participant.id));
  const visibleSelectedCount = selectableQueue.filter((participant) => selectedQueueIds.includes(participant.id)).length;
  const selectableBackstage = filteredBackstage;
  const allVisibleBackstageSelected = selectableBackstage.length > 0 && selectableBackstage.every((participant) => selectedBackstageIds.includes(participant.id));
  const visibleBackstageSelectedCount = selectableBackstage.filter((participant) => selectedBackstageIds.includes(participant.id)).length;
  const filterParticipants = section === "stage" ? onStage : section === "backstage" ? backstage : queue;
  const activeGuestProfileIds = useMemo(() => new Set([
    room.host.id,
    ...room.participants.map((participant) => participant.profile.id),
    ...room.queue.map((participant) => participant.profile.id),
  ]), [room.host.id, room.participants, room.queue]);
  const filterTriggerRef = useRef<HTMLButtonElement | null>(null);
  const openFilters = () => {
    setDraftGrades([...selectedGrades]);
    setDraftRoles([...selectedRoles]);
    setDraftReadiness([...selectedReadiness]);
    setFilterState("open");
  };
  const closeFilters = useCallback(() => setFilterState("closed"), []);
  useEffect(() => { if (momentVipPicker) { setSection("queue"); setBulkSelectionMode(null); closeFilters(); } }, [momentVipPicker, closeFilters]);
  const renderFilterButton = (owner: "stage" | "backstage" | "queue") => <GuestFilterButton panelId="studio-guests-filter-panel" activeCount={activeFilterCount} open={filterState === "open" && section === owner} buttonRef={section === owner ? (node) => { filterTriggerRef.current = node; } : undefined} onOpen={openFilters} />;
  const toggleQueueSelection = (participantId: string, selected: boolean) => setSelectedQueueIds((current) => selected ? [...new Set([...current, participantId])] : current.filter((id) => id !== participantId));
  const toggleBackstageSelection = (participantId: string, selected: boolean) => setSelectedBackstageIds((current) => selected ? [...new Set([...current, participantId])] : current.filter((id) => id !== participantId));
  const toggleStageSelection = (participantId: string, selected: boolean) => setSelectedStageIds((current) => selected ? [...new Set([...current, participantId])] : current.filter((id) => id !== participantId));
  const toggleAllVisible = (participants: PlaceParticipant[], allSelected: boolean, target: "queue" | "backstage") => {
    const visibleIds = new Set(participants.map((participant) => participant.id));
    const setter = target === "queue" ? setSelectedQueueIds : setSelectedBackstageIds;
    setter((current) => allSelected ? current.filter((id) => !visibleIds.has(id)) : [...new Set([...current, ...visibleIds])]);
    if (desktopGuests) setBulkSelectionMode(allSelected ? null : target);
  };
  const renderBulkSelectButton = (participants: PlaceParticipant[], allSelected: boolean, count: number, target: "queue" | "backstage") => <button type="button" className={`place-guests__bulk-select${allSelected ? " is-active" : ""}`} onClick={() => toggleAllVisible(participants, allSelected, target)} aria-label={allSelected ? "Tout désélectionner" : "Tout sélectionner"} aria-pressed={allSelected} disabled={!participants.length}><CircleCheck aria-hidden="true" /><span>Tout</span>{count ? <b>{count}</b> : null}</button>;
  const renderQuickSelection = (target: "queue" | "backstage", participants: PlaceParticipant[], selectedIds: string[]) => <div className="studio-guest-selection-chips" role="group" aria-label={target === "queue" ? "Sélection rapide dans la file d’attente" : "Sélection rapide en coulisses"}>
    <span className="studio-guest-selection-chips__label">Les premiers</span>
    <div className="studio-guest-selection-chips__options">
      {[16, 8, 4].map((count) => {
        const firstIds = participants.slice(0, count).map((participant) => participant.id);
        const available = firstIds.length === count;
        const active = available && selectedIds.length === count && firstIds.every((id) => selectedIds.includes(id));
        return <button type="button" key={count} className={active ? "is-active" : ""} aria-label={`Les ${count} premiers`} aria-pressed={active} disabled={!available || bulkBusy} title={available ? `Sélectionner les ${count} premiers invités disponibles dans la liste affichée` : `${count} invités disponibles nécessaires (${participants.length} actuellement)`} onClick={() => { (target === "queue" ? setSelectedQueueIds : setSelectedBackstageIds)(active ? [] : firstIds); if (desktopGuests) setBulkSelectionMode(active ? null : target); }}>{count}</button>;
      })}
    </div>
  </div>;
  const acceptSelectedQueue = async () => {
    if (!visibleSelectedCount || bulkBusy) return;
    setBulkBusy(true);
    const selected = selectableQueue.filter((participant) => selectedQueueIds.includes(participant.id));
    try {
      for (const participant of selected) {
        const destination = "accepted" as const;
        await onMoveGuest(participant, destination);
      }
      const movedIds = new Set(selected.map((participant) => participant.id));
      setSelectedQueueIds((current) => current.filter((id) => !movedIds.has(id)));
    } finally {
      setBulkBusy(false);
    }
  };

  useEffect(() => {
    const queueIds = new Set(room.queue.map((participant) => participant.id));
    const backstageIds = new Set(backstage.map((participant) => participant.id));
    const stageIds = new Set(onStage.map((participant) => participant.id));
    setSelectedQueueIds((current) => current.filter((id) => queueIds.has(id)));
    setSelectedBackstageIds((current) => current.filter((id) => backstageIds.has(id)));
    setSelectedStageIds((current) => current.filter((id) => stageIds.has(id)));
  }, [backstage, onStage, room.queue]);

  const selectedIds = section === "stage" ? selectedStageIds : section === "backstage" ? selectedBackstageIds : selectedQueueIds;
  const sectionParticipants = section === "stage" ? onStage : section === "backstage" ? backstage : queue;
  const selectedParticipants = sectionParticipants.filter((participant) => selectedIds.includes(participant.id));
  const singleSelected = selectedParticipants.length === 1 ? selectedParticipants[0] : null;
  const clearGuestSelection = () => {
    if (section === "stage") setSelectedStageIds([]);
    else if (section === "backstage") setSelectedBackstageIds([]);
    else setSelectedQueueIds([]);
    setBulkSelectionMode(null);
  };
  const switchGuestSection = (next: "stage" | "backstage" | "queue") => {
    setSection(next);
    closeFilters();
    if (desktopGuests) {
      setDockPreview(null);
      setSelectedQueueIds([]);
      setSelectedBackstageIds([]);
      setSelectedStageIds([]);
      setBulkSelectionMode(null);
      setGuestActionError("");
    }
  };
  const runGuestAction = async (action: (participant: PlaceParticipant) => Promise<void>) => {
    if (!selectedParticipants.length || guestActionBusy) return;
    setGuestActionBusy(true);
    setGuestActionError("");
    try {
      for (const participant of selectedParticipants) await action(participant);
      clearGuestSelection();
    } catch (reason) {
      setGuestActionError(reason instanceof Error ? reason.message : "Action invitée indisponible.");
    } finally { setGuestActionBusy(false); }
  };
  const desktopAction = (label: string, icon: ReactNode, onClick: (trigger: HTMLElement) => void, disabled = false) => <button type="button" title={label} aria-label={label} disabled={disabled || guestActionBusy} onClick={(event) => onClick(event.currentTarget)}>{icon}<span>{label}</span></button>;

  return (
    <div className={`place-guests${backstageDropActive ? " is-guest-drop-target" : ""}`}
      onDragEndCapture={() => setBackstageDropActive(false)}
      onDragOver={(event) => { if (!desktopGuests || !hasPlaceGuestDrag(event.dataTransfer)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setBackstageDropActive(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setBackstageDropActive(false); }}
      onDrop={(event) => { setBackstageDropActive(false); if (!desktopGuests) return; const drag = readPlaceGuestDrag(event.dataTransfer); if (!drag || drag.roomId !== room.id || drag.origin !== "onstage") return; const participant = onStage.find((person) => person.id === drag.participantId); if (participant) { event.preventDefault(); void onMoveGuest(participant, "backstage").catch((reason) => setGuestActionError(reason instanceof Error ? reason.message : "Impossible de redescendre cet invité.")); } }}>
      <header className="place-guests__segments" role="tablist" aria-label="Gestion des invités">
        <button type="button" className={`is-queue${section === "queue" ? " is-active" : ""}`} onClick={() => switchGuestSection("queue")} role="tab" aria-selected={section === "queue"} aria-controls="place-guests-queue" aria-label={`File d’attente, ${waitingCount} invités en attente`} title={`File d’attente · ${waitingCount} invités en attente${greenHouseCount ? ` · ${greenHouseCount} en préparation` : ""}`}>
          <Clock3 aria-hidden="true" />
          <span className="place-guests__segment-copy"><small>Demandes</small><strong>{waitingCount}</strong></span>
        </button>
        <button type="button" className={`is-backstage${section === "backstage" ? " is-active" : ""}`} onClick={() => switchGuestSection("backstage")} role="tab" aria-selected={section === "backstage"} aria-controls="place-guests-backstage" aria-label={`Coulisses, ${backstage.length} invités prêts`} title={`Coulisses · ${backstage.length} invités prêts`}>
          <UsersRound aria-hidden="true" />
          <span className="place-guests__segment-copy"><small>Coulisses</small><strong>{backstage.length}</strong></span>
        </button>
        <button type="button" className={`is-stage${section === "stage" ? " is-active" : ""}`} onClick={() => switchGuestSection("stage")} role="tab" aria-selected={section === "stage"} aria-controls="place-guests-stage" aria-label={`Sur scène, ${onStage.length} invités sur 3`} title={`Sur scène · ${onStage.length} invités sur 3`}>
          <RadioTower aria-hidden="true" />
          <span className="place-guests__segment-copy"><small>Scène</small><strong>{onStage.length} / 3</strong></span>
        </button>
      </header>
      <section id="place-guests-stage" className="place-guests__list is-onstage" role="tabpanel" hidden={section !== "stage"}>
        <div className="place-guests__section-head is-capacity-only">
          <span className="place-guests__section-tools">{onReturnToCage ? <button type="button" className="cage-guests-return" onClick={onReturnToCage} title="Revenir à la Cage pour placer les artistes" aria-label="Retour au placement de la Cage"><ArrowLeft aria-hidden="true" />Placement</button> : null}{renderFilterButton("stage")}</span>
          <span className={`place-guests__capacity${stageFull ? " is-full" : ""}`}><strong>{onStage.length} / 3 sur scène</strong></span>
        </div>
        <div className="place-guests__rows">
          {filteredStage.length > 0 ? filteredStage.map((participant) => <ParticipantRow roomId={room.id} profileSource={room.source} participant={participant} variant="onstage" selected={desktopGuests && selectedStageIds.includes(participant.id)} onSelectedChange={desktopGuests ? (selected) => toggleStageSelection(participant.id, selected) : undefined} onSelectExclusive={desktopGuests ? () => setSelectedStageIds([participant.id]) : undefined} stageControls={<PlaceGuestMediaControls participant={participant} room={room} {...mediaControls} />} actions={[{ direction: "down", tone: "amber", label: "Envoyer en Coulisses", text: "Vers les coulisses", onAction: () => void onMoveGuest(participant, "backstage") }]} statusText={`En scène depuis ${waitingTime(participant.joinedAt, timeNow)}`} onRemove={() => void onRemoveGuest(participant)} onOpenProfile={() => onOpenProfile(participant.profile.id)} onMessageProfile={() => onMessageProfile(participant.profile.id)} onCollaborateProfile={() => onCollaborateProfile(participant.profile)} key={participant.id} />) : <p className="place-guests__empty"><strong>{onStage.length ? "Aucun profil avec ces filtres" : "Scène libre"}</strong><span>{onStage.length ? "Modifie les filtres pour retrouver les artistes en scène." : "Monte jusqu’à trois invités."}</span></p>}
        </div>
      </section>
      <section id="place-guests-backstage" className="place-guests__list is-backstage" role="tabpanel" hidden={section !== "backstage"}>
        <div className="place-guests__section-head is-capacity-only">
          <span className="place-guests__section-tools">{onReturnToCage ? <button type="button" className="cage-guests-return" onClick={onReturnToCage} title="Revenir à la Cage pour placer les artistes" aria-label="Retour au placement de la Cage"><ArrowLeft aria-hidden="true" />Placement</button> : null}{renderFilterButton("backstage")}{mediaControls.isHost ? <RoomJuryControl count={juryPolicy.jurorIds.length} selected={juryOnly} onClick={() => setJuryOnly(value => !value)} /> : null}{renderBulkSelectButton(selectableBackstage, allVisibleBackstageSelected, visibleBackstageSelectedCount, "backstage")}</span>
          {desktopGuests ? renderQuickSelection("backstage", selectableBackstage, selectedBackstageIds) : null}
        </div>
        {mediaControls.isHost && juryOnly ? <div className="room-jury-voting">
          <label>Vote du live<select aria-label="Qui vote dans cet espace live ?" value={juryPolicy.mode} disabled={juryBusy || Boolean(juryLoadError)} onChange={event => void saveJury([...juryPolicy.jurorIds], event.target.value as RoomVoteMode)}>
            {(Object.keys(VOTE_MODE_LABELS) as RoomVoteMode[]).map(mode => <option key={mode} value={mode} disabled={mode !== "public" && !juryPolicy.jurorIds.length}>{VOTE_MODE_LABELS[mode]}</option>)}
          </select></label>
          {juryPolicy.mode === "mixed" ? <small>50 % public · 50 % jury</small> : null}
        </div> : null}
        {juryError || juryLoadError ? <p className="room-jury-error" role="alert">{juryError || juryLoadError}</p> : null}
        {!desktopGuests && visibleBackstageSelectedCount ? <div className="place-guests__bulk-bar is-summary-only" role="status"><span><CircleCheck aria-hidden="true" /><strong>{visibleBackstageSelectedCount}</strong> artiste{visibleBackstageSelectedCount > 1 ? "s" : ""} sélectionné{visibleBackstageSelectedCount > 1 ? "s" : ""}</span></div> : null}
        {desktopGuests ? <p className="place-guests__rail-hint">Glisse une carte sur la vidéo pour monter sur scène</p> : null}
        <div className="place-guests__rows">
          {filteredBackstage.length > 0 ? filteredBackstage.map((participant) => <ParticipantRow roomId={room.id} profileSource={room.source} participant={participant} variant="backstage" isJuror={juryPolicy.jurorIds.includes(participant.profile.id)} stageControls={<PlaceBackstageControls participant={participant} room={room} {...mediaControls} />} actions={[
            { direction: "down", tone: "cyan", label: "Renvoyer vers la File d’attente", text: "File d’attente", onAction: () => void leaveBackstage(participant, () => onMoveGuest(participant, "accepted")), disabled: juryBusy },
            ...(mediaControls.isHost ? [{ direction: juryPolicy.jurorIds.includes(participant.profile.id) ? "down" as const : "up" as const, tone: "jury" as const, label: juryPolicy.jurorIds.includes(participant.profile.id) ? "Retirer du jury" : "Ajouter au jury", text: juryPolicy.jurorIds.includes(participant.profile.id) ? "Retirer du jury" : "Jury", onAction: () => toggleJuror(participant.profile.id), disabled: juryBusy || Boolean(juryLoadError) || (!juryPolicy.jurorIds.includes(participant.profile.id) && juryPolicy.jurorIds.length >= 4) }] : []),
            { direction: "up", tone: "violet", label: "Passer sur Scène", text: "Sur scène", onAction: () => void leaveBackstage(participant, () => onMoveGuest(participant, "onstage")), disabled: stageFull || juryBusy },
          ]} statusText={participant.latencyMs > 80 ? "Prêt · connexion instable" : "Prêt"} selected={selectedBackstageIds.includes(participant.id)} selectionMode={bulkSelectionMode === "backstage"} onSelectedChange={(selected) => toggleBackstageSelection(participant.id, selected)} onSelectExclusive={desktopGuests && bulkSelectionMode !== "backstage" ? () => setSelectedBackstageIds([participant.id]) : undefined} repeatOpensProfile={bulkSelectionMode !== "backstage"} onRemove={() => void leaveBackstage(participant, () => onRemoveGuest(participant))} onOpenProfile={() => onOpenProfile(participant.profile.id)} onMessageProfile={() => onMessageProfile(participant.profile.id)} onCollaborateProfile={() => onCollaborateProfile(participant.profile)} key={participant.id} />) : <p className="place-guests__empty"><strong>{juryOnly ? "Aucun membre dans le jury" : backstage.length ? "Aucun profil avec ces filtres" : "Coulisses libres"}</strong><span>{juryOnly ? "Reviens aux coulisses avec le chip Jury, puis ajoute jusqu’à quatre invités." : backstage.length ? "Modifie les filtres pour retrouver les artistes prêts." : "Les invités apparaissent ici après leurs vérifications privées."}</span></p>}
        </div>
      </section>
      <section id="place-guests-queue" className="place-guests__list is-queue" role="tabpanel" hidden={section !== "queue"}>
        <div className="place-guests__section-head is-capacity-only is-queue-tools">
          <span className="place-guests__section-tools studio-guest-tools">{onReturnToCage ? <button type="button" className="cage-guests-return" onClick={onReturnToCage} title="Revenir à la Cage pour placer les artistes" aria-label="Retour au placement de la Cage"><ArrowLeft aria-hidden="true" />Placement</button> : null}{renderFilterButton("queue")}{renderBulkSelectButton(selectableQueue, allVisibleQueueSelected, visibleSelectedCount, "queue")}<PlaceGuestInvitePicker excludedProfileIds={activeGuestProfileIds} onInvite={onInviteProfile} />{isCage ? <CagePreparedCompetitions /> : null}</span>
        {renderQuickSelection("queue", selectableQueue, selectedQueueIds)}
          <button type="button" className={`place-guests__queue-state${room.queueOpen ? " is-open" : ""}`} onClick={() => void onSetQueueOpen(!room.queueOpen)} aria-label={room.queueOpen ? "Fermer la file d’attente" : "Ouvrir la file d’attente"} aria-pressed={room.queueOpen}><i />{room.queueOpen ? "Ouverte" : "Fermée"}<span className="place-guests__queue-toggle" aria-hidden="true" /></button>
        </div>

        {momentVipPicker ? <div className="place-guests__vip-picker" role="status" aria-live="polite">
          <Sparkles aria-hidden="true" />
          <span><strong>Invités du Moment VIP</strong><small>Sélectionne jusqu’à {ROOM_LIVE_CALL_MAX_CONTACTS} personnes, puis confirme ton groupe.</small></span>
          <span className="place-guests__vip-picker-actions">
            <button type="button" className="is-cancel" onClick={onCancelMomentVipPicker}>Annuler</button>
            <button type="button" className="is-confirm" onClick={onConfirmMomentVipGuests} disabled={momentVipSelectedProfileIds.length === 0}>
              Confirmer {momentVipSelectedProfileIds.length ? `(${momentVipSelectedProfileIds.length})` : ""}
            </button>
          </span>
        </div> : !desktopGuests && visibleSelectedCount ? <div className="place-guests__bulk-bar" role="status"><span><CircleCheck aria-hidden="true" /><strong>{visibleSelectedCount}</strong> profil{visibleSelectedCount > 1 ? "s" : ""} sélectionné{visibleSelectedCount > 1 ? "s" : ""}</span><button type="button" onClick={() => void acceptSelectedQueue()} disabled={bulkBusy}>{bulkBusy ? "Invitation…" : `Inviter la sélection (${visibleSelectedCount})`}</button></div> : null}
        <div className="place-guests__rows">
        {filteredQueue.length > 0 ? filteredQueue.map((participant) => {
          const isRawRequest = Boolean(participant.queueEntryId) && !participant.invitationId;
          const canSimulate = room.source === "demo" && participant.status === "accepted";
          const statusText = isRawRequest ? `Demande · ${waitingTime(participant.joinedAt, timeNow)}`
            : participant.status === "accepted" ? "En préparation · réglages privés"
            : `Invitation envoyée · ${waitingTime(participant.joinedAt, timeNow)}`;
          const actionText = isRawRequest ? "Inviter en coulisses" : canSimulate ? "Simuler les tests réussis" : participant.status === "accepted" ? "En préparation" : "Invitation envoyée";
          const isMomentVipGuest = momentVipSelectedProfileIds.includes(participant.profile.id);
          const actions: GuestRowAction[] = momentVipPicker && onToggleMomentVipGuest
            ? [{ direction: "select", tone: "amber", label: isMomentVipGuest ? "Retirer du Moment VIP" : "Ajouter au Moment VIP", text: isMomentVipGuest ? "Retirer" : "Ajouter au VIP", onAction: () => onToggleMomentVipGuest(participant), disabled: !isMomentVipGuest && momentVipSelectedProfileIds.length >= ROOM_LIVE_CALL_MAX_CONTACTS }]
            : [{ direction: "up", tone: "amber", label: actionText, text: actionText, onAction: () => void onMoveGuest(participant, canSimulate ? "ready" : "accepted"), disabled: !isRawRequest && !canSimulate }];
          return <ParticipantRow roomId={room.id} profileSource={room.source} participant={participant} variant="queue" actions={actions} statusText={statusText} timeNow={timeNow} selected={momentVipPicker ? isMomentVipGuest : selectedQueueIds.includes(participant.id)} selectionMode={bulkSelectionMode === "queue"} onSelectedChange={momentVipPicker ? desktopGuests ? (selected) => { if (selected !== isMomentVipGuest) onToggleMomentVipGuest?.(participant); } : undefined : desktopGuests || isRawRequest ? (selected) => toggleQueueSelection(participant.id, selected) : undefined} onSelectExclusive={desktopGuests && !momentVipPicker && bulkSelectionMode !== "queue" ? () => setSelectedQueueIds([participant.id]) : undefined} repeatOpensProfile={!momentVipPicker && !(desktopGuests && bulkSelectionMode === "queue")} onRemove={() => void onRemoveGuest(participant)} onOpenProfile={() => onOpenProfile(participant.profile.id)} onMessageProfile={() => onMessageProfile(participant.profile.id)} onCollaborateProfile={() => onCollaborateProfile(participant.profile)} key={participant.id} />;
        }) : <p className="place-guests__empty"><strong>{queue.length ? "Aucun profil avec ces filtres" : "Aucune demande"}</strong><span>{queue.length ? "Modifie les filtres pour retrouver les demandes." : "Les nouvelles demandes apparaîtront ici."}</span></p>}
        </div>
      </section>
      {desktopGuests && !momentVipPicker ? <div className="place-guests__desktop-dock" data-has-selection={selectedParticipants.length > 0} role="toolbar" aria-label="Actions des invités sélectionnés">
        <div className="place-guests__desktop-dock-heading"><button type="button" onClick={clearGuestSelection} disabled={!selectedParticipants.length} title="Annuler la sélection">{selectedParticipants.length ? `${selectedParticipants.length} sélectionné${selectedParticipants.length > 1 ? "s" : ""}` : "Sélectionne un invité"}</button>{section === "backstage" ? null : <small>{section === "stage" ? "Glisse une vidéo ici pour redescendre en coulisses" : "Choisis les profils à inviter"}</small>}</div>
        <div className="place-guests__desktop-dock-actions">
          {desktopAction("Aperçu", <UserRound aria-hidden="true" />, (trigger) => { if (singleSelected) setDockPreview({ participant: singleSelected, trigger }); }, !singleSelected)}
          {desktopAction("Message", <MessageCircle aria-hidden="true" />, () => { if (singleSelected) onMessageProfile(singleSelected.profile.id); }, !singleSelected)}
          {section === "queue" ? desktopAction("Inviter", <ArrowUpToLine aria-hidden="true" />, () => { void runGuestAction((person) => onMoveGuest(person, "accepted")); }, !selectedParticipants.length || selectedParticipants.some((person) => !canAcceptQueueGuest(person))) : null}
          {section === "backstage" ? <>
            {desktopAction("Scène", <ArrowUpToLine aria-hidden="true" />, () => { void runGuestAction((person) => leaveBackstage(person, () => onMoveGuest(person, "onstage"))); }, !selectedParticipants.length || selectedParticipants.some((person) => person.status !== "backstage") || stageFull || onStage.length + selectedParticipants.length > 3 || juryBusy)}
            {selectedParticipants.some((person) => person.status === "ready") ? desktopAction("Coulisses", <ArrowDownToLine aria-hidden="true" />, () => { void runGuestAction((person) => onMoveGuest(person, "accepted")); }, selectedParticipants.some((person) => person.status !== "ready")) : desktopAction("Demandes", <ArrowDownToLine aria-hidden="true" />, () => { void runGuestAction((person) => leaveBackstage(person, () => onMoveGuest(person, "accepted"))); }, !selectedParticipants.length || juryBusy)}
            {desktopAction(singleSelected && juryPolicy.jurorIds.includes(singleSelected.profile.id) ? "Ôter jury" : "Jury", <Scale aria-hidden="true" />, () => { if (singleSelected) toggleJuror(singleSelected.profile.id); }, !singleSelected || juryBusy || Boolean(juryLoadError) || (singleSelected && !juryPolicy.jurorIds.includes(singleSelected.profile.id) && juryPolicy.jurorIds.length >= 4))}
          </> : null}
          {section === "stage" ? desktopAction("Coulisses", <ArrowDownToLine aria-hidden="true" />, () => { void runGuestAction((person) => onMoveGuest(person, "backstage")); }, !selectedParticipants.length) : null}
          {section === "queue" ? null : singleSelected && (singleSelected.status === "backstage" || singleSelected.status === "onstage") ? <PlaceBackstageControls dock participant={singleSelected} room={room} {...mediaControls} /> : desktopAction("Caméra", <Camera aria-hidden="true" />, () => undefined, true)}
          {desktopAction(section === "queue" ? "Refuser" : "Retirer", <X aria-hidden="true" />, () => { void runGuestAction(onRemoveGuest); }, !selectedParticipants.length)}
        </div>
        {guestActionError ? <p role="alert" className="place-guests__desktop-dock-error">{guestActionError}</p> : null}
      </div> : null}
      {dockPreview ? <Suspense fallback={null}><GuestPreProfile
        person={{ id: dockPreview.participant.profile.id, name: dockPreview.participant.profile.displayName, avatarUrl: dockPreview.participant.profile.avatarUrl,
          role: dockPreview.participant.profile.role, gradeLevel: dockPreview.participant.profile.gradeLevel as GradeLevel,
          microphone: dockPreview.participant.isMicrophoneEnabled ? "ready" : "off", camera: dockPreview.participant.isCameraEnabled ? "ready" : "off" }}
        source={room.source} returnFocusTo={dockPreview.trigger} {...getRoomPreProfileBounds(dockPreview.trigger)}
        onClose={() => setDockPreview(null)} /></Suspense> : null}
      <MeewavFilterPanel open={filterState === "open"} panelId="studio-guests-filter-panel" dockRight boundarySelector=".place-studio-panel" eyebrow="INVITÉS" title="Filtrer les invités" description="Retrouve les profils pour ton live." onClose={closeFilters} onReset={() => { setDraftGrades([]); setDraftRoles([]); setDraftReadiness([]); }} onApply={() => { setSelectedGrades([...draftGrades]); setSelectedRoles([...draftRoles]); setSelectedReadiness([...draftReadiness]); closeFilters(); }} resetLabel="Tout effacer" applyLabel={`Afficher ${filterParticipants.filter((participant) => (!draftGrades.length || draftGrades.includes(participant.profile.gradeLevel as GradeLevel)) && (!draftRoles.length || draftRoles.some((role) => roleMatchesAvatarStyle(participant.profile.role, role))) && (!draftReadiness.length || draftReadiness.some((filter) => participantMatchesReadiness(participant, filter)))).length} profils`} selectionHint={`${(draftGrades.length + draftRoles.length + draftReadiness.length)} filtre${(draftGrades.length + draftRoles.length + draftReadiness.length) > 1 ? "s" : ""} actif${(draftGrades.length + draftRoles.length + draftReadiness.length) > 1 ? "s" : ""}`} triggerRef={filterTriggerRef}>
        <MeewavFilterSection label="Styles d’avatar"><div className="meewav-filter-choice-grid">{SCENE_ARTIST_ROLE_OPTIONS.map((option) => <button key={option.key} type="button" className={`meewav-filter-choice rooms-home-filter__artist cage-filter-artist${draftRoles.includes(option.key) ? " is-active" : ""}`} aria-pressed={draftRoles.includes(option.key)} onClick={() => setDraftRoles((current) => current.includes(option.key) ? current.filter((item) => item !== option.key) : [...current, option.key])}><img className="rooms-home-filter__avatar" src={option.imageUrl} alt="" /><span>{option.label}</span><small>{filterParticipants.filter((participant) => roleMatchesAvatarStyle(participant.profile.role, option.key)).length}</small></button>)}</div></MeewavFilterSection>
        <MeewavFilterSection label="Badge MeeWav"><div className="meewav-filter-choice-grid">{PLACE_GUEST_GRADE_LEVELS.map((level) => <button type="button" key={level} className={`meewav-filter-choice${draftGrades.includes(level) ? " is-active" : ""}`} aria-pressed={draftGrades.includes(level)} onClick={() => setDraftGrades((current) => current.includes(level) ? current.filter((item) => item !== level) : [...current, level])}><MeewavGradeBadge level={level} size="sm" variant="icon" /><span>Niveau {level}</span></button>)}</div></MeewavFilterSection>
        <MeewavFilterSection label="Prêt pour le live"><div className="meewav-filter-choice-grid">{PLACE_GUEST_READINESS_FILTERS.map((option) => <button type="button" key={option.id} className={`meewav-filter-choice${draftReadiness.includes(option.id) ? " is-active" : ""}`} aria-pressed={draftReadiness.includes(option.id)} onClick={() => setDraftReadiness((current) => current.includes(option.id) ? current.filter((item) => item !== option.id) : [...current, option.id])}>{option.label}</button>)}</div></MeewavFilterSection>
      </MeewavFilterPanel>
    </div>
  );
}

export default function PlaceStudioPanel(props: PlaceStudioPanelProps) {
  const presentation = useRoomPresentation();
  if (presentation.id === "cage" && !props.isHost) return <CageProductionProvider key={`${props.room.source}:${props.room.id}:${props.room.currentUserProfile?.id}`} room={props.room}><PlaceStudioPanelContent {...props} /></CageProductionProvider>;
  const content = presentation.id === "wave" && props.isHost
    ? <WaveTransportProvider toolsVisible={props.surface === "tools"}>
      <WaveRoomTransportController room={props.room} />
      <PlaceStudioPanelContent {...props} />
    </WaveTransportProvider>
    : <PlaceStudioPanelContent {...props} />;
  return props.isHost
    ? <StudioToolsLayoutProvider key={props.room.id} toolsVisible={props.surface === "tools"}>{content}</StudioToolsLayoutProvider>
    : content;
}

function PlaceStudioPanelContent(props: PlaceStudioPanelProps) {
  const { room, isHost, isGuest, canEngage, collapsed, surface, onSurface } = props;
  const roomPresentation = useRoomPresentation();
  const isSpecializedRoom = roomPresentation.id !== "place";
  const specializedRoomId = isSpecializedRoom ? roomPresentation.id as SpecializedRoomId : null;
  const actorRole = specializedRoomId
    ? resolveRoomActorRole(specializedRoomId, isHost, isGuest, room.currentUserProfile?.role)
    : isHost ? "host" : "viewer";
  const hasProductionTools = isHost
    || actorRole === "regisseur"
    || actorRole === "teacher"
    || (specializedRoomId === "scene" && actorRole === "artist");
  const showsAudienceInteractions = !hasProductionTools;
  const cageViewer = specializedRoomId === "cage" && showsAudienceInteractions;
  const cageParticipant = [...room.participants, ...room.queue].find((person) => person.profile.id === room.currentUserProfile?.id);
  const cageMixerAvailable = !cageViewer || Boolean(cageParticipant && ["accepted", "ready", "backstage", "onstage"].includes(cageParticipant.status));
  const visibleSurface: PlaceStudioSurface = isHost
    ? surface
    : surface === "mixer" && cageMixerAvailable
      ? "mixer"
      : surface === "tools"
        ? "tools"
        : "chat";
  const [cageGuestPicking, setCageGuestPicking] = useState(false);
  const [momentVipPersonIds, setMomentVipPersonIds] = useState<string[]>([]);
  const [momentVipDraftPersonIds, setMomentVipDraftPersonIds] = useState<string[]>([]);
  const [momentVipPicker, setMomentVipPicker] = useState(false);
  const openMomentVipQueue = () => {
    const availableIds = new Set(room.queue.map((participant) => participant.profile.id));
    setMomentVipDraftPersonIds(momentVipPersonIds.filter((id) => availableIds.has(id)));
    setMomentVipPicker(true);
    onSurface("guests");
  };
  const toggleMomentVipGuest = (participant: PlaceParticipant) => {
    setMomentVipDraftPersonIds((current) => {
      if (current.includes(participant.profile.id)) return current.filter((id) => id !== participant.profile.id);
      if (current.length >= ROOM_LIVE_CALL_MAX_CONTACTS) return current;
      return [...current, participant.profile.id];
    });
  };
  const confirmMomentVipGuests = () => {
    const availableIds = new Set(room.queue.map((participant) => participant.profile.id));
    setMomentVipPersonIds([...new Set(momentVipDraftPersonIds.filter((id) => availableIds.has(id)))].slice(0, ROOM_LIVE_CALL_MAX_CONTACTS));
    setMomentVipPicker(false);
    onSurface("tools");
  };
  const cancelMomentVipPicker = () => {
    setMomentVipPicker(false);
    onSurface("tools");
  };
  const availableSurfaces = isHost
    ? SURFACES
    : SURFACES.filter((item) => item.id === "chat" || (item.id === "mixer" && cageMixerAvailable) || item.id === "tools");
  const featureSurfaceLabel = roomPresentation.label.replace(/^La\s+/, "");
  const FeatureIcon = { place: UsersRound, loge: DoorOpen, wave: AudioLines, cage: Radio, classe: GraduationCap, scene: Mic2 }[roomPresentation.id];
  const surfaceLabel = (id: PlaceStudioSurface, label: string) => id === "tools" ? featureSurfaceLabel : label;
  const audienceJourney = !isHost ? (
    <PlaceAudienceJourney
      room={room}
      isGuest={isGuest}
      onJoinQueue={props.onJoinQueue}
      onLeaveQueue={props.onLeaveQueue}
      onAcceptInvitation={props.onAcceptInvitation}
      onDeclineInvitation={props.onDeclineInvitation}
      onMarkReady={props.onMarkReady}
      onOpenMixer={() => onSurface("mixer")}
    />
  ) : null;

  useEffect(() => {
    if (!props.experienceVersion || props.experienceWaiting || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const target = document.querySelector<HTMLElement>(".place-studio-panel__content");
    const animation = target?.animate?.([{opacity:.35,transform:"translateY(3px)"},{opacity:1,transform:"translateY(0)"}],{duration:300,easing:"ease-out"});
    return () => animation?.cancel();
  },[props.experienceVersion,Boolean(props.experienceWaiting)]);
  const renderSurface = (surfaceId: PlaceStudioSurface) => {
    switch (surfaceId) {
      case "chat":
        return <PlaceChatWorkspace room={room} isHost={isHost} canEngage={canEngage} active={visibleSurface === "chat" && !collapsed} onSendMessage={props.onSendMessage} onDeleteMessage={props.onDeleteMessage} chatSocialActions={props.chatSocialActions} onVotePoll={props.onVotePoll} onLaunchPoll={props.onLaunchPoll} onStopPoll={props.onStopPoll} onPinMessage={props.onPinMessage} onPinHighlight={props.onPinHighlight} onClearHighlight={props.onClearHighlight} onSubmitGift={props.onSubmitGift} onCreateGiftDraw={props.onCreateGiftDraw} onScheduleGiftDraw={props.onScheduleGiftDraw} onStartGiftDraw={props.onStartGiftDraw} onCancelGiftDraw={props.onCancelGiftDraw} />;
      case "mixer":
        return <PlaceMixer room={room} mode={isHost ? "host" : isGuest ? "guest" : "viewer"} currentUserId={room.currentUserProfile?.id} view={props.mixerView} toolsVisible={isHost && visibleSurface === "tools"} onView={props.onMixerView} onGain={props.onGain} onMute={props.onMute} onCamera={props.onCamera} onVocal={props.onVocal} onTune={props.onTune} pitchProvider={props.pitchProvider} pitchCorrection={props.pitchCorrection} localAudioStatus={props.localAudioStatus} localAudioError={props.localAudioError} pluginInventory={props.pluginInventory} pluginsRefreshing={props.pluginsRefreshing} nativePluginStatus={props.nativePluginStatus} nativePluginAudioReady={props.nativePluginAudioReady} nativePluginError={props.nativePluginError} onPitchProvider={props.onPitchProvider} onRefreshPlugins={props.onRefreshPlugins} onRemoveNativePlugin={props.onRemoveNativePlugin} onToggleMonitoring={props.onToggleMonitoring} onAudioPreview={props.onAudioPreview} onAudioPreviewMetadata={props.onAudioPreviewMetadata} onAudioRoute={props.onAudioRoute} onAudioPlaybackState={props.onAudioPlaybackState} programAudio={props.programAudio} hostVoiceMeterStream={props.hostVoiceMeterStream} />;
      case "tools":
        if (props.experienceWaiting) return props.experienceWaiting;
        if (showsAudienceInteractions) {
          return <>
            {specializedRoomId && specializedRoomId !== "cage" && specializedRoomId !== "classe" && specializedRoomId !== "scene" ? audienceJourney : null}
            {specializedRoomId === "wave" ? <WaveViewerPanel room={room} canEngage={canEngage} /> : specializedRoomId
            ? <RoomAudienceInteractions active={visibleSurface === "tools" && !collapsed} onOpenChat={() => onSurface("chat")} onOpenMixer={() => onSurface("mixer")} onLeaveRoom={props.onLeaveRoom}
              roomType={specializedRoomId}
              sceneParticipation={specializedRoomId === "scene" ? audienceJourney : undefined}
              room={room}
              isHost={isHost}
              isGuest={isGuest}
              canEngage={canEngage}
            />
            : <PlaceConversationTools participation={audienceJourney} room={room} isHost={isHost} canEngage={canEngage} visible={visibleSurface === "tools" && !collapsed} />}
          </>;
        }
        return specializedRoomId
          ? <RoomToolsShell
            onSpotlightStudent={props.onSpotlightStudent}
            spotlightStudentId={props.spotlightStudentId}
            roomType={specializedRoomId}
            room={room}
            isHost={isHost}
            isGuest={isGuest}
            onOpenMixer={() => onSurface("mixer")}
            onOpenGuests={() => { if (specializedRoomId === "cage") setCageGuestPicking(true); onSurface("guests"); }}
            onOpenGuestQueue={openMomentVipQueue}
            momentVipPersonIds={momentVipPersonIds}
            onMomentVipPersonIdsChange={setMomentVipPersonIds}
            onLaunchPoll={props.onLaunchPoll}
            onStopPoll={props.onStopPoll}
            onOpenChat={() => onSurface("chat")}
            logeGiftPanel={<PlaceChatWorkspace {...props} active={visibleSurface === "tools" && !collapsed} giftOnly initialGiftRecipientId={momentVipPersonIds[0]} />}
            onGain={props.onGain}
            onPinHighlight={props.onPinHighlight}
            onClearHighlight={props.onClearHighlight}
          />
          : roomPresentation.toolsReady
          ? <PlaceConversationTools participation={audienceJourney} room={room} isHost={isHost} canEngage={canEngage} visible={visibleSurface === "tools" && !collapsed} />
          : <div className="place-room-tools-coming-soon" role="status"><Wrench aria-hidden="true" /><small>{roomPresentation.uppercaseLabel}</small><strong>Outils en cours de construction</strong><span>Les outils propres à cet espace seront ajoutés pendant son chantier dédié.</span></div>;
      case "guests":
        return <PlaceGuests onReturnToCage={cageGuestPicking && specializedRoomId === "cage" ? () => { setCageGuestPicking(false); onSurface("tools"); } : undefined} room={room} mediaControls={props} onMoveGuest={props.onMoveGuest} onInviteProfile={props.onInviteProfile ?? (async () => undefined)} onRemoveGuest={props.onRemoveGuest} onSetQueueOpen={props.onSetQueueOpen} onOpenProfile={props.onOpenProfile} onMessageProfile={props.onMessageProfile} onCollaborateProfile={props.onCollaborateProfile} momentVipPicker={momentVipPicker} momentVipSelectedProfileIds={momentVipDraftPersonIds} onToggleMomentVipGuest={toggleMomentVipGuest} onConfirmMomentVipGuests={confirmMomentVipGuests} onCancelMomentVipPicker={cancelMomentVipPicker} />;
    }
  };

  return (
    <aside
      data-switch-version={props.experienceVersion || undefined}
      className={`place-studio-panel is-shared-studio-chassis is-${visibleSurface} ${isHost ? "is-host-panel" : isGuest ? "is-guest-panel" : "is-viewer-panel"}${collapsed ? " is-collapsed" : ""}${isHost ? " has-tools-deck has-wave-transport" : ""}${cageViewer ? " has-cage-viewer-participation" : ""}`}
      aria-label={isHost ? "Studio de production de la Room" : isGuest ? "Contrôles personnels, interactions et chat de la Room" : "Chat et interactions publiques de la Room"}
    >
      <div className="place-studio-panel__bar">
        <nav className="place-studio-panel__tabs" aria-label={hasProductionTools ? "Surfaces du Studio" : "Surfaces publiques de la Room"} role="tablist">
          {availableSurfaces.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              id={`place-studio-tab-${id}`}
              data-surface={id}
              className={visibleSurface === id ? "is-active" : ""}
              onClick={() => { onSurface(id); props.onCollapsedChange(false); }}
              role="tab"
              aria-selected={visibleSurface === id}
              aria-controls={`place-studio-surface-${id}`}
              title={`Afficher ${surfaceLabel(id, label).toLowerCase()}`}
            >
              {id === "chat" ? <MessageCircle aria-hidden="true" /> : null}
              {id === "mixer" ? <SlidersHorizontal aria-hidden="true" /> : null}
              {id === "tools" ? <FeatureIcon aria-hidden="true" /> : null}
              {id === "guests" ? <UsersRound aria-hidden="true" /> : null}
              <span>{surfaceLabel(id, label)}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="place-studio-panel__collapse" onClick={() => props.onCollapsedChange(!collapsed)} aria-expanded={!collapsed} aria-controls={`place-studio-surface-${visibleSurface}`} aria-label={collapsed ? "Ouvrir le panneau" : "Replier le panneau"}>
          {collapsed ? <PanelRightOpen aria-hidden="true" /> : <PanelRightClose aria-hidden="true" />}
        </button>
      </div>
      <div
        className="place-studio-panel__content"
        aria-hidden={collapsed}
        hidden={collapsed}
      >
        {availableSurfaces.map(({ id }) => <section key={id} id={`place-studio-surface-${id}`} className="place-studio-panel__surface" role="tabpanel" aria-labelledby={`place-studio-tab-${id === "mixer" && isHost && visibleSurface === "tools" ? "tools" : id}`} hidden={isHost && (id === "mixer" || id === "tools") ? id === "tools" || !["mixer", "tools"].includes(visibleSurface) : visibleSurface !== id}>{id === "tools" ? <RoomExperienceBoundary version={props.experienceVersion} onChat={()=>onSurface("chat")}>{renderSurface(id)}</RoomExperienceBoundary> : renderSurface(id)}</section>)}
      </div>
      {cageViewer ? <div className="cage-viewer-participation" hidden={collapsed || visibleSurface === "mixer"}>{audienceJourney}</div> : null}
      {!isHost && specializedRoomId === "wave" ? <WaveViewerListeningBar onOpenWave={() => { onSurface("tools"); props.onCollapsedChange(false); }} /> : null}
    </aside>
  );
}
