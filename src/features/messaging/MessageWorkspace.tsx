import { demoTrackPackAudio } from "./demoTrackPackAudio";
import { requestDirectCall } from "./MessagingCalls";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Ban,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  CircleStop,
  Copy,
  CornerUpLeft,
  Download,
  File,
  FileAudio,
  FileImage,
  FileVideo,
  Flag,
  FolderArchive,
  Forward,
  Image,
  Info,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Music,
  Music2,
  Paperclip,
  Pause,
  Phone,
  Pin,
  PinOff,
  Play,
  Search,
  Send,
  Smile,
  SmilePlus,
  SlidersHorizontal,
  Sparkles,
  Store,
  Trash2,
  UserPlus,
  Users,
  Video,
  X,
} from "lucide-react";
import {
  Fragment,
  type CSSProperties,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs, { type MeewavPillarTabItem } from "../../components/navigation/MeewavPillarTabs";
import {
  appendMeeWavEmoticon,
  meewavEmoticonToken,
  MeeWavEmoticonComposer,
  MeeWavEmoticonPicker,
  MeeWavRichText,
} from "../emoticons/MeewavEmoticons";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import {
  demoContacts,
  demoConversations,
  type DemoContact,
  type DemoConversation,
  type DemoMessage,
  type DemoMessageKind,
  type MessagingSidebarItem,
  type MessagingSpace,
  type MessagingTab,
} from "./messagingDemoData";
import { playMessageSound, preloadMessageSounds } from "./messagingSounds";
import type {
  MessagingAttachmentManifestInput,
  MessagingAttachmentPurpose,
  MessagingAttachmentViewModel,
  MessagingStructuredMessageKind,
} from "./messaging.attachments.types";
import type {
  MessagingConversationInvitationRow,
  MessagingJson,
  MessagingReportCategory,
} from "./messaging.types";
import type { MessagingAttachmentQueueItem } from "./useMessagingAttachmentsLive";
import {
  buildMessagingBriefPayload,
  buildMessagingTrackPackPayload,
} from "./messaging.composer-payloads";
import { StemWaveform } from "./StemWaveform";
import { InstrumentArtwork, Waveform } from "./TrackPackStudioPrimitives";
import {
  getTrackPackStemPresentation,
  inferTrackPackInstrument,
  TRACK_PACK_INSTRUMENTS,
  type TrackPackInstrument,
} from "./trackPackInstrumentCatalog";
import "./message-workspace.css";
import "./message-grammar.css";

const CONTACT_RAIL_STORAGE_KEY = "meewav.messaging.contact-rail-width.v1";
// Content widths: the shared navigation's inset is added by getContactRailBounds.
const CONTACT_RAIL_MIN_WIDTH = 88;
const CONTACT_RAIL_COMPACT_THRESHOLD = 240;
const CONTACT_RAIL_MAX_WIDTH = 560;
const CHAT_MIN_WIDTH = 520;

function clampContactRailWidth(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function defaultContactRailWidth() {
  if (typeof window === "undefined") return 380;
  return Math.min(476.5, Math.max(328.5, window.innerWidth * 0.2286 + 8.5));
}

function readStoredContactRailWidth() {
  if (typeof window === "undefined") return null;
  try {
    const stored = Number.parseFloat(window.localStorage.getItem(CONTACT_RAIL_STORAGE_KEY) ?? "");
    return Number.isFinite(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeContactRailWidth(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTACT_RAIL_STORAGE_KEY, String(Math.round(value)));
  } catch {
    // Storage can be disabled by the browser; resizing still works in memory.
  }
}

export type ConversationRequest = {
  token: number;
  id: string;
  name: string;
  role: string;
  status: string;
  avatar?: string;
  group?: boolean;
  gradeLevel?: number;
  conversation?: DemoConversation;
};

export type MessagingWorkspaceMessage = DemoMessage & {
  deliveryStatus?: "pending" | "sent" | "failed";
};

export type MessagingWorkspaceLiveStatus = "idle" | "loading" | "ready" | "error";

export type MessagingWorkspaceAttachmentsController = {
  queue: MessagingAttachmentQueueItem[];
  enqueue: (input: {
    conversationId: string;
    file: File;
    purpose: MessagingAttachmentPurpose;
    durationMs?: number | null;
  }) => string | null;
  retry: (itemId: string) => boolean | Promise<boolean>;
  discard: (itemId: string) => boolean | Promise<boolean>;
  sendReadyMessage: (input: {
    conversationId: string;
    clientMessageId: string;
    kind: MessagingStructuredMessageKind;
    body: string;
    payload?: Record<string, MessagingJson>;
    attachmentItemIds: string[];
    attachmentDetails?: Record<string, Omit<MessagingAttachmentManifestInput, "uploadId">>;
  }) => unknown | Promise<unknown | null>;
  resolveUrl: (attachment: MessagingAttachmentViewModel) => Promise<string>;
  clearSent?: () => void;
};

/**
 * Narrow UI contract for the Supabase-backed messaging controller.
 *
 * The workspace intentionally depends on this view contract rather than on the
 * Supabase repository. MessagingPage can therefore adapt useMessagingLive while
 * the existing demo remains the default whenever this prop is omitted.
 */
export type MessagingWorkspaceLiveController = {
  conversations: DemoConversation[];
  selectedConversationId: string | null;
  selectedConversation: DemoConversation | null;
  messages: MessagingWorkspaceMessage[];
  inboxStatus: MessagingWorkspaceLiveStatus;
  messagesStatus: MessagingWorkspaceLiveStatus;
  inboxError?: string | null;
  messagesError?: string | null;
  actionError?: string | null;
  contacts?: DemoContact[];
  contactsStatus?: MessagingWorkspaceLiveStatus;
  contactsError?: string | null;
  clearActionError?: () => void;
  selectConversation: (conversationId: string) => void | Promise<unknown>;
  retryInbox: () => void | Promise<unknown>;
  retryMessages: () => void | Promise<unknown>;
  sendText: (body: string, replyToMessageId?: string | null) => void | Promise<unknown>;
  retryMessage: (clientMessageId: string) => void | Promise<unknown>;
  isReactionActiveByMe?: (messageId: string, emoji: string) => boolean;
  setReaction: (messageId: string, emoji: string, active: boolean) => void | Promise<unknown>;
  pinMessage?: (messageId: string, pinned: boolean) => boolean | void | Promise<boolean | void>;
  deleteMessage?: (messageId: string) => boolean | void | Promise<boolean | void>;
  forwardMessage?: (
    messageId: string,
    targetConversationId: string,
  ) => boolean | void | Promise<boolean | void>;
  togglePinned: (conversationId: string, pinned: boolean) => void | Promise<unknown>;
  toggleMuted: (conversationId: string, muted: boolean) => void | Promise<unknown>;
  archiveConversation: (conversationId: string) => void | Promise<unknown>;
  hideConversation?: (conversationId: string) => void | Promise<unknown>;
  leaveGroupConversation?: (conversationId: string) => boolean | Promise<boolean>;
  searchContacts?: (query: string) => void | Promise<unknown>;
  createDirectConversation?: (profileId: string, idempotencyKey?: string) => string | null | Promise<string | null>;
  createGroupConversation?: (title: string, profileIds: string[], idempotencyKey?: string) => string | null | Promise<string | null>;
  conversationInvitations?: MessagingConversationInvitationRow[];
  invitationStatus?: MessagingWorkspaceLiveStatus;
  invitationError?: string | null;
  isInvitationMutating?: (conversationId: string) => boolean;
  retryInvitations?: () => void | Promise<unknown>;
  respondToInvitation?: (conversationId: string, accept: boolean) => boolean | Promise<boolean>;
  canModerateCounterpart?: boolean;
  safetyMutating?: boolean;
  blockCounterpart?: () => boolean | Promise<boolean>;
  reportConversation?: (
    category: MessagingReportCategory,
    comment?: string | null,
  ) => boolean | Promise<boolean>;
  attachments?: MessagingWorkspaceAttachmentsController;
};

export type MessageWorkspaceProps = {
  newConversationSignal: number;
  openRequest?: ConversationRequest | null;
  onRequestConsumed?: () => void;
  onCreateGroup?: () => void;
  activeSpace?: MessagingSpace;
  contentSpace?: MessagingTab;
  showCollabConversation?: boolean;
  conversationScope?: "friends" | "collabs";
  railItems?: MessagingSidebarItem[];
  selectedRailKey?: string | null;
  onRailItemSelect?: (item: MessagingSidebarItem) => void;
  rightPane?: ReactNode;
  conversationHeader?: ReactNode;
  onSpaceChange?: (space: MessagingSpace) => void;
  onConversationsChange?: (conversations: DemoConversation[]) => void;
  liveController?: MessagingWorkspaceLiveController | null;
  marketplaceContext?: {
    listingTitle: string;
    onBack: () => void;
  } | null;
};

type AttachmentMode = "track-pack" | "brief" | null;
type RecordingStatus = "idle" | "requesting" | "recording" | "ready" | "error";

type RecordedVoice = {
  mediaUrl: string;
  duration: string;
  durationMs: number;
  file: File;
};

type Track = {
  id: string;
  label: string;
  color: string;
  duration: string;
  muted: boolean;
  solo: boolean;
  mediaUrl?: string;
  fileSize?: number;
  instrument?: TrackPackInstrument;
  displayName?: string;
  description?: string;
  file?: File;
};

type LiveAttachmentDraft = {
  clientMessageId: string;
  itemIds: string[];
  kind: MessagingStructuredMessageKind;
  body: string;
  payload?: Record<string, MessagingJson>;
  attachmentDetails?: Record<string, Omit<MessagingAttachmentManifestInput, "uploadId">>;
  autoSend?: boolean;
};

function inferTrackInstrument(label: string, index: number): TrackPackInstrument {
  return inferTrackPackInstrument(label, index);
}

const demoTrackPackIds = new Set(demoConversations.flatMap((conversation) => conversation.messages.filter((message) => message.kind === "track-pack").map((message) => message.id)));

const trackTemplate: Track[] = [
  { id: "drums", label: "drums.wav", color: "#315cff", duration: "03:28", muted: false, solo: false },
  { id: "bass", label: "bass.wav", color: "#4f46e5", duration: "03:28", muted: false, solo: false },
  { id: "melody", label: "melody.wav", color: "#7548ff", duration: "03:28", muted: false, solo: false },
  { id: "pads", label: "pads.wav", color: "#9257ff", duration: "03:15", muted: false, solo: false },
];

const trackColors = ["#315cff", "#4f46e5", "#5b2eff", "#7548ff", "#9257ff"];

function tracksFromMessage(message: DemoMessage): Track[] {
  return (message.tracks ?? trackTemplate.map((track) => track.label)).map((label, index) => {
    const presentation = getTrackPackStemPresentation(label, index);
    const demoAudio = !message.trackMediaUrls?.[index] && demoTrackPackIds.has(message.id) ? demoTrackPackAudio(label) : null;
    return {
      id: `${message.id}-${index}`,
      label,
      color: trackColors[index % trackColors.length],
      duration: demoAudio ? formatDuration(demoAudio.durationSeconds) : message.trackDurations?.[index] ?? message.duration ?? "0:00",
      muted: false,
      solo: false,
      mediaUrl: message.trackMediaUrls?.[index] || demoAudio?.mediaUrl,
      instrument: presentation.instrument,
      displayName: presentation.name,
      description: presentation.description,
    };
  });
}

function viewerTracksFromMessage(message: DemoMessage): Track[] {
  if (message.body !== "Track Pack" || !demoTrackPackIds.has(message.id)) return tracksFromMessage(message);
  const showcase: Array<{ instrument: TrackPackInstrument; label: string; duration: string }> = [
    { instrument: "drums", label: "batterie.wav", duration: "02:38" },
    { instrument: "bass", label: "basse.wav", duration: "02:41" },
    { instrument: "piano", label: "piano.wav", duration: "02:48" },
    { instrument: "guitar", label: "guitare.wav", duration: "02:36" },
    { instrument: "synth", label: "synthe.wav", duration: "02:55" },
  ];
  return showcase.map((track, index) => ({
    id: `${message.id}-${track.instrument}`,
    label: track.label,
    color: trackColors[index % trackColors.length],
    duration: !message.trackMediaUrls?.[index] ? formatDuration(demoTrackPackAudio(track.label).durationSeconds) : message.trackDurations?.[index] ?? track.duration,
    muted: false,
    solo: false,
    mediaUrl: message.trackMediaUrls?.[index] || (demoTrackPackIds.has(message.id) ? demoTrackPackAudio(track.label).mediaUrl : undefined),
    instrument: track.instrument,
    displayName: TRACK_PACK_INSTRUMENTS[track.instrument].name,
    description: TRACK_PACK_INSTRUMENTS[track.instrument].description,
  }));
}

const attachmentActions: Array<{ id: Exclude<DemoMessageKind, "text" | "track-pack" | "brief">; label: string; accept: string; icon: typeof Image }> = [
  { id: "image", label: "Photo", accept: "image/jpeg,image/png,image/webp", icon: Image },
  { id: "video", label: "Vidéo", accept: "video/mp4,video/quicktime,video/webm", icon: Video },
  { id: "audio-file", label: "Audio", accept: "audio/*", icon: FileAudio },
  { id: "file", label: "PDF", accept: "application/pdf", icon: File },
];

const messagingSpaces: readonly MeewavPillarTabItem<MessagingSpace>[] = [
  { id: "messages", label: "Messages", icon: MessageCircle, accent: "#5b7cff" },
  { id: "collabs", label: "Collabs", icon: UserPlus, accent: "#a77cff" },
  { id: "projects", label: "Projets", icon: FolderArchive, accent: "#e9a23b" },
  { id: "groups", label: "Groupes", icon: Users, accent: "#45dfa8" },
];

const seedConversationIds = new Set(demoConversations.map((conversation) => conversation.id));

const referenceConversationOrder = [
  "echo-flow",
  "album-2025",
  "neon-pulse",
  "the-producer",
  "cover-design",
  "mix-master-club",
];

function triggerDownload(fileName: string, source: Blob | string) {
  const ownsUrl = source instanceof Blob;
  const url = ownsUrl ? URL.createObjectURL(source) : source;
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (ownsUrl) URL.revokeObjectURL(url);
}

function downloadTextFile(fileName: string, content: string) {
  triggerDownload(fileName, new Blob([content], { type: "text/plain;charset=utf-8" }));
}

function parseDuration(duration = "0:00") {
  const parts = duration.split(":").map(Number);
  if (parts.some((value) => !Number.isFinite(value))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function createSilentWavBlob(durationSeconds: number) {
  const sampleRate = 8000;
  const sampleCount = Math.max(1, Math.round(Math.max(durationSeconds, 0.25) * sampleRate));
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeAscii(36, "data");
  view.setUint32(40, sampleCount, true);
  new Uint8Array(buffer, 44).fill(128);
  return new Blob([buffer], { type: "audio/wav" });
}

function wavFileName(label: string) {
  const withoutExtension = label.replace(/\.[^/.]+$/, "");
  return `${withoutExtension || "piste"}.wav`;
}

function downloadTrackAudio(track: Pick<Track, "label" | "duration" | "mediaUrl">) {
  if (track.mediaUrl) {
    triggerDownload(track.label, track.mediaUrl);
    return;
  }
  triggerDownload(wavFileName(track.label), createSilentWavBlob(parseDuration(track.duration)));
}

function useAudioTransport(durationLabel: string, sourceUrl?: string, autoPlay = false) {
  const fallbackDuration = Math.max(parseDuration(durationLabel), 0.25);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const busyRef = useRef(false);
  const [durationSeconds, setDurationSeconds] = useState(fallbackDuration);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || busyRef.current) return;
    if (!audio.getAttribute("src")) {
      setError("Aucun fichier audio n’est associé à ce message.");
      return;
    }
    busyRef.current = true;
    setError(null);
    try {
      if (audio.ended) audio.currentTime = 0;
      window.dispatchEvent(new CustomEvent("meewav:message-audio-play", { detail: audio }));
      await audio.play();
    } catch {
      if (audioRef.current === audio) setError("Lecture audio indisponible. Réessaie.");
    } finally {
      if (audioRef.current === audio) busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    if (sourceUrl) audio.src = sourceUrl;
    audio.preload = "metadata";
    audioRef.current = audio;
    busyRef.current = false;
    setCurrentSeconds(0);
    setDurationSeconds(fallbackDuration);
    setIsPlaying(false);
    setError(null);
    const syncTime = () => setCurrentSeconds(Math.max(0, audio.currentTime || 0));
    const syncDuration = () => { if (Number.isFinite(audio.duration) && audio.duration > 0) setDurationSeconds(audio.duration); };
    const syncPlay = () => setIsPlaying(true);
    const syncPause = () => setIsPlaying(false);
    const handleError = () => { setIsPlaying(false); setError("Lecture audio indisponible. Réessaie."); };
    const pauseOther = (event: Event) => { if ((event as CustomEvent).detail !== audio) audio.pause(); };
    const listeners = { timeupdate: syncTime, seeked: syncTime, loadedmetadata: syncDuration, durationchange: syncDuration, play: syncPlay, pause: syncPause, ended: syncPause, error: handleError };
    Object.entries(listeners).forEach(([event, handler]) => audio.addEventListener(event, handler));
    window.addEventListener("meewav:message-audio-play", pauseOther);
    if (autoPlay && sourceUrl) void start();
    return () => {
      Object.entries(listeners).forEach(([event, handler]) => audio.removeEventListener(event, handler));
      window.removeEventListener("meewav:message-audio-play", pauseOther);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (audioRef.current === audio) audioRef.current = null;
    };
  }, [fallbackDuration, sourceUrl, autoPlay, start]);

  const toggle = async () => {
    if (audioRef.current && !audioRef.current.paused) audioRef.current.pause();
    else await start();
  };
  const seek = (nextSeconds: number) => {
    const audio = audioRef.current;
    if (!audio?.getAttribute("src")) return;
    const safeSeconds = Math.max(0, Math.min(nextSeconds, durationSeconds));
    audio.currentTime = safeSeconds;
    setCurrentSeconds(safeSeconds);
  };
  const pause = useCallback(() => { audioRef.current?.pause(); }, []);
  return { currentSeconds, durationSeconds, progress: Math.min(100, currentSeconds / durationSeconds * 100), isPlaying, error, toggle, pause, seek };
}

function useSynchronizedStemTransport(tracks: Track[], durationLabel: string) {
  const durationSeconds = Math.max(parseDuration(durationLabel), 0.25);
  const entriesRef = useRef<Array<{ audio: HTMLAudioElement; trackIndex: number }>>([]);
  const currentSecondsRef = useRef(0);
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceKey = tracks.map((track) => track.mediaUrl ?? "").join("\u001f");
  const durationKey = tracks.map((track) => track.duration).join("|");
  const mixKey = tracks.map((track) => `${track.muted ? "m" : "-"}${track.solo ? "s" : "-"}`).join("|");
  const primaryTrackIndex = tracks.reduce((longestIndex, track, trackIndex) => {
    if (!track.mediaUrl) return longestIndex;
    if (longestIndex < 0) return trackIndex;
    return parseDuration(track.duration) > parseDuration(tracks[longestIndex].duration)
      ? trackIndex
      : longestIndex;
  }, -1);

  const commitCurrentSeconds = useCallback((nextSeconds: number) => {
    const safeSeconds = Math.max(0, Math.min(nextSeconds, durationSeconds));
    currentSecondsRef.current = safeSeconds;
    setCurrentSeconds(safeSeconds);
    return safeSeconds;
  }, [durationSeconds]);

  useEffect(() => {
    const sources = sourceKey.split("\u001f");
    const entries = sources
      .map((source, trackIndex) => source ? { audio: new Audio(source), trackIndex } : null)
      .filter((entry): entry is { audio: HTMLAudioElement; trackIndex: number } => Boolean(entry));
    if (entries.length === 0) entries.push({ audio: new Audio(), trackIndex: -1 });
    entries.forEach(({ audio }) => { audio.preload = "metadata"; });
    entriesRef.current = entries;
    currentSecondsRef.current = 0;
    setCurrentSeconds(0);
    setIsPlaying(false);
    setError(null);

    const primaryEntry = entries.find((entry) => entry.trackIndex === primaryTrackIndex) ?? entries[0];
    const primary = primaryEntry.audio;
    const syncTime = () => {
      const nextTime = Math.min(primary.currentTime || 0, durationSeconds);
      commitCurrentSeconds(nextTime);
      if (!primary.paused) {
        entries.filter(({ audio }) => audio !== primary).forEach(({ audio }) => {
          if (!audio.paused && Math.abs((audio.currentTime || 0) - nextTime) > 0.035) audio.currentTime = nextTime;
        });
      }
    };
    const syncPlay = () => setIsPlaying(true);
    const syncPause = () => setIsPlaying(false);
    const syncEnded = () => {
      commitCurrentSeconds(durationSeconds);
      setIsPlaying(false);
    };
    primary.addEventListener("timeupdate", syncTime);
    primary.addEventListener("play", syncPlay);
    primary.addEventListener("pause", syncPause);
    primary.addEventListener("ended", syncEnded);

    return () => {
      entries.forEach(({ audio }) => {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      });
      primary.removeEventListener("timeupdate", syncTime);
      primary.removeEventListener("play", syncPlay);
      primary.removeEventListener("pause", syncPause);
      primary.removeEventListener("ended", syncEnded);
      entriesRef.current = [];
    };
  }, [commitCurrentSeconds, durationKey, durationSeconds, primaryTrackIndex, sourceKey]);

  useEffect(() => {
    const hasSolo = tracks.some((track) => track.solo);
    entriesRef.current.forEach((entry) => {
      if (entry.trackIndex < 0) {
        entry.audio.muted = false;
        return;
      }
      const track = tracks[entry.trackIndex];
      entry.audio.muted = !track || track.muted || (hasSolo && !track.solo);
    });
  }, [mixKey, tracks]);

  const pause = useCallback(() => {
    entriesRef.current.forEach(({ audio }) => audio.pause());
    setIsPlaying(false);
  }, []);

  const toggle = async () => {
    const entries = entriesRef.current;
    if (!entries.length) return;
    if (entries.some(({ audio }) => !audio.paused)) {
      pause();
      return;
    }
    const fallback = entries[0].trackIndex < 0 ? entries[0].audio : null;
    if (fallback) {
      setIsPlaying(false);
      setError("Aucune piste audio n’est associée à ce Track Pack.");
      return;
    }
    const startSeconds = currentSecondsRef.current >= durationSeconds - 0.05 ? 0 : currentSecondsRef.current;
    commitCurrentSeconds(startSeconds);
    try {
      entries.forEach(({ audio }) => {
        if (audio.readyState > 0 && audio.currentTime !== startSeconds) audio.currentTime = startSeconds;
      });
      const results = await Promise.allSettled(entries.map(({ audio }) => audio.play()));
      if (results.some((result) => result.status === "rejected")) {
        entries.forEach(({ audio }) => audio.pause());
        throw new Error("track playback rejected");
      }
      setError(null);
    } catch {
      setError("Le navigateur a bloqué la lecture groupée.");
    }
  };

  const seek = (nextSeconds: number) => {
    const safeSeconds = Math.max(0, Math.min(nextSeconds, durationSeconds));
    entriesRef.current.forEach(({ audio }) => {
      if (audio.getAttribute("src")) audio.currentTime = safeSeconds;
    });
    commitCurrentSeconds(safeSeconds);
  };

  return {
    currentSeconds,
    durationSeconds,
    progress: Math.min(100, currentSeconds / durationSeconds * 100),
    isPlaying,
    error,
    toggle,
    pause,
    seek,
  };
}

function readAudioDuration(sourceUrl: string) {
  return new Promise<number>((resolve) => {
    const audio = new Audio();
    const finish = (value: number) => {
      window.clearTimeout(timeoutId);
      audio.removeEventListener("loadedmetadata", handleMetadata);
      audio.removeEventListener("error", handleError);
      audio.removeAttribute("src");
      audio.load();
      resolve(value);
    };
    const handleMetadata = () => finish(Number.isFinite(audio.duration) ? audio.duration : 0);
    const handleError = () => finish(0);
    const timeoutId = window.setTimeout(() => finish(0), 8000);
    audio.addEventListener("loadedmetadata", handleMetadata);
    audio.addEventListener("error", handleError);
    audio.preload = "metadata";
    audio.src = sourceUrl;
  });
}

function TrackPackMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`mw-track-pack-mark ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <img src="/images/messaging/track-pack/track-pack-tp-reference.png" alt="" />
    </span>
  );
}

function TrackPackStemRow({
  track,
  index,
  isAudible,
  masterIsPlaying,
  masterCurrentSeconds,
  masterProgress,
  onAudition,
  onToggle,
}: {
  track: Track;
  index: number;
  isAudible: boolean;
  masterIsPlaying: boolean;
  masterCurrentSeconds: number;
  masterProgress: number;
  onAudition: () => void;
  onToggle: (key: "muted" | "solo") => void;
}) {
  const transport = useAudioTransport(track.duration, track.mediaUrl);
  const pausePreview = transport.pause;
  const instrument = track.instrument ?? inferTrackInstrument(track.label, index);

  useEffect(() => {
    if (masterIsPlaying) pausePreview();
  }, [masterIsPlaying, pausePreview]);

  const togglePreview = () => {
    onAudition();
    void transport.toggle();
  };

  const rowProgress = masterIsPlaying || masterCurrentSeconds > 0
    ? (isAudible ? masterProgress : 0)
    : (transport.currentSeconds > 0 ? transport.progress : 0);

  return (
    <article className={`mw-stem-row ${isAudible ? "" : "is-dimmed"}`}>
      <span className="mw-stem-row__index">{String(index + 1).padStart(2, "0")}</span>
      <InstrumentArtwork instrument={instrument} />
      <div className="mw-stem-row__name">
        <strong>{track.displayName ?? TRACK_PACK_INSTRUMENTS[instrument].name}</strong>
        <small>{track.description ?? TRACK_PACK_INSTRUMENTS[instrument].description}</small>
      </div>
      <StemWaveform mediaUrls={[track.mediaUrl]} progress={rowProgress} />
      <div className="mw-stem-row__transport">
        <time>{track.duration}</time>
        <button type="button" className="mw-stem-row__play" onClick={togglePreview} aria-label={transport.isPlaying ? `Mettre ${track.displayName} en pause` : `Lire ${track.displayName}`}>
          {transport.isPlaying ? <Pause /> : <Play fill="currentColor" />}
        </button>
      </div>
      <div className="mw-stem-row__actions">
        <button type="button" className={track.solo ? "is-active" : ""} aria-pressed={track.solo} onClick={() => onToggle("solo")}>SOLO</button>
        <button type="button" className={track.muted ? "is-active" : ""} aria-pressed={track.muted} onClick={() => onToggle("muted")}>MUTE</button>
        <button type="button" onClick={() => downloadTrackAudio(track)} aria-label={`Télécharger ${track.displayName ?? track.label}`}><Download /></button>
      </div>
      {transport.error && <small className="mw-audio-error" role="status">{transport.error}</small>}
    </article>
  );
}

function Overlay({ children, label, onClose, wide = false, className = "" }: { children: ReactNode; label: string; onClose: () => void; wide?: boolean; className?: string }) {
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="mw-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`mw-dialog ${wide ? "is-wide" : ""} ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function TrackPackViewer({ message, onClose, embedded = false }: { message: DemoMessage; onClose?: () => void; embedded?: boolean }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isShowcaseTrackPack = message.body === "Track Pack";
  const [tracks, setTracks] = useState(() => viewerTracksFromMessage(message));
  useEffect(() => {
    let active = true;
    const missingDurations = viewerTracksFromMessage(message).filter((track) => track.mediaUrl && parseDuration(track.duration) <= 0);
    void Promise.all(missingDurations.map(async (track) => ({ id: track.id, duration: await readAudioDuration(track.mediaUrl!) }))).then((resolved) => {
      if (!active || !resolved.length) return;
      setTracks((current) => current.map((track) => {
        const found = resolved.find((item) => item.id === track.id && item.duration > 0);
        return found ? { ...track, duration: formatDuration(found.duration) } : track;
      }));
    });
    return () => { active = false; };
  }, [message]);
  const duration = tracks.reduce((longest, track) => parseDuration(track.duration) > parseDuration(longest) ? track.duration : longest, "0:00");
  const transport = useSynchronizedStemTransport(tracks, duration);
  const pauseTransport = transport.pause;
  const sessionTitle = isShowcaseTrackPack ? "Nova Session" : message.body;
  const hasSolo = tracks.some((track) => track.solo);
  const audibleTrackCount = tracks.filter((track) => !track.muted && (!hasSolo || track.solo)).length;

  useEffect(() => {
    if (audibleTrackCount === 0 && transport.isPlaying) pauseTransport();
  }, [audibleTrackCount, pauseTransport, transport.isPlaying]);

  const toggleTrack = (id: string, key: "muted" | "solo") => {
    setTracks((current) => current.map((track) => track.id === id ? { ...track, [key]: !track[key] } : track));
  };

  const downloadAll = () => {
    tracks.forEach((track) => downloadTrackAudio(track));
  };

  useEffect(() => {
    if (embedded) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose, embedded]);

  const content = (
    <div className={`mw-track-studio${embedded ? " mw-track-studio--embedded" : ""}`} role="presentation" onMouseDown={embedded ? undefined : (event) => event.target === event.currentTarget && onClose?.()}>
      <section className="mw-track-studio__window" role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-labelledby="track-viewer-title">
        <div className="mw-track-studio__ambient" />
        <section className="mw-track-studio__hero">
          {!embedded && <button ref={closeButtonRef} type="button" className="mw-track-studio__close" onClick={onClose} aria-label="Fermer le Track Pack"><X /></button>}
          <button type="button" className="mw-track-studio__download" onClick={downloadAll}><Download /> Télécharger tout</button>
          <h1 id="track-viewer-title">Track Pack – <span>{sessionTitle}</span></h1>
          <p>
            <span>{tracks.length} pistes</span><i />
            <span>{tracks.length} instruments</span><i />
            <span>prêt à écouter</span>
          </p>
          <div className="mw-track-studio__rule">1 piste = 1 instrument</div>
          <section className={`mw-track-master ${transport.isPlaying ? "is-playing" : ""}`} aria-label="Lecture groupée du Track Pack">
            <button
              type="button"
              className="mw-track-master__play"
              onClick={() => void transport.toggle()}
              aria-label={transport.isPlaying ? "Mettre toutes les pistes en pause" : "Lire toutes les pistes ensemble"}
              aria-pressed={transport.isPlaying}
              disabled={audibleTrackCount === 0}
            >
              {transport.isPlaying ? <Pause /> : <Play fill="currentColor" />}
            </button>
            <div className="mw-track-master__wave">
              <StemWaveform mediaUrls={tracks.filter((track) => !track.muted && (!hasSolo || track.solo)).map((track) => track.mediaUrl)} progress={transport.progress} />
              <span className="mw-track-master__progress" aria-hidden="true"><i style={{ width: `${transport.progress}%` }} /></span>
              <input
                aria-label="Position de lecture groupée"
                aria-valuetext={`${formatDuration(transport.currentSeconds)} sur ${duration}`}
                type="range"
                min="0"
                max={transport.durationSeconds}
                step="0.1"
                value={transport.currentSeconds}
                disabled={audibleTrackCount === 0}
                onChange={(event) => transport.seek(Number(event.target.value))}
              />
            </div>
            <div className="mw-track-master__meta">
              <time>{formatDuration(transport.currentSeconds)} / {duration}</time>
              <small>{audibleTrackCount}/{tracks.length} actives</small>
            </div>
            {transport.error && <small className="mw-audio-error" role="status">{transport.error}</small>}
          </section>
        </section>

        <main>
          <section className="mw-stem-console" aria-label="Pistes du Track Pack">
            {tracks.map((track, index) => {
              const anotherSolo = tracks.some((item) => item.solo);
              const isAudible = !track.muted && (!anotherSolo || track.solo);
              return (
                <TrackPackStemRow
                  key={track.id}
                  track={track}
                  index={index}
                  isAudible={isAudible}
                  masterIsPlaying={transport.isPlaying}
                  masterCurrentSeconds={transport.currentSeconds}
                  masterProgress={transport.progress}
                  onAudition={() => {
                    transport.pause();
                    transport.seek(0);
                  }}
                  onToggle={(key) => toggleTrack(track.id, key)}
                />
              );
            })}
          </section>
        </main>
      </section>
    </div>
  );
  return embedded ? content : createPortal(content, document.body);
}

export function TrackPackCard({ message, onOpen }: { message: DemoMessage; onOpen: () => void }) {
  const isShowcaseTrackPack = message.body === "Track Pack";
  const displayTracks = isShowcaseTrackPack
    ? ["batterie.wav", "basse.wav", "piano.wav", "guitare.wav", "synthe.wav"]
    : (message.tracks ?? trackTemplate.map((track) => track.label));
  const compactTracks = displayTracks.slice(0, 3);
  const totalTrackCount = displayTracks.length;
  const [activeTracks, setActiveTracks] = useState(() => new Set(displayTracks));
  const tracks = viewerTracksFromMessage(message).map((track, index) => ({ ...track, muted: !activeTracks.has(displayTracks[index]) }));
  const transport = useSynchronizedStemTransport(tracks, message.duration ?? "0:00");
  useEffect(() => { if (activeTracks.size === 0) transport.pause(); }, [activeTracks.size, transport.pause]);
  const openPack = () => { transport.pause(); onOpen(); };

  const toggleTrack = (track: string) => {
    setActiveTracks((current) => {
      const next = new Set(current);
      if (next.has(track)) next.delete(track); else next.add(track);
      return next;
    });
  };
  const details = [
    `${totalTrackCount} pistes`,
    isShowcaseTrackPack ? `${totalTrackCount} instruments` : (message.bpm ? `${message.bpm} BPM` : null),
    !isShowcaseTrackPack ? (message.musicalKey === "Am" ? "A minor" : message.musicalKey) : null,
  ].filter(Boolean).join(" · ");
  const title = message.body === "Track Pack" ? "Nova Session" : message.body;
  return (
    <section className="mw-track-capsule" aria-label="Track Pack">
      <header>
        <span className="mw-track-capsule__icon" aria-hidden="true"><TrackPackMark compact /></span>
        <span><small>MEEWAV · TRACK PACK</small><strong>{title}</strong><em>{details}</em></span>
        <button type="button" className="mw-track-capsule__launch" onClick={openPack}>Ouvrir <ArrowUp /></button>
      </header>
      <div className="mw-track-capsule__player">
        <button type="button" disabled={activeTracks.size === 0} onClick={() => void transport.toggle()} aria-label={transport.isPlaying ? "Mettre en pause" : "Lire le Track Pack"}>{transport.isPlaying ? <Pause /> : <Play fill="currentColor" />}</button>
        <StemWaveform mediaUrls={tracks.filter((track) => !track.muted).map((track) => track.mediaUrl)} progress={transport.progress} />
        <span>{formatDuration(transport.currentSeconds)} / {message.duration ?? "0:00"}</span>
      </div>
      {transport.error && <small className="mw-audio-error" role="status">{transport.error}</small>}
      <div className="mw-track-capsule__stems">
        {compactTracks.map((track, index) => {
          const presentation = getTrackPackStemPresentation(track, index);
          return (
            <button key={track} type="button" className={activeTracks.has(track) ? "is-on" : ""} onClick={() => toggleTrack(track)}>
              <InstrumentArtwork instrument={presentation.instrument} compact />
              <span>{isShowcaseTrackPack ? TRACK_PACK_INSTRUMENTS[presentation.instrument].name : presentation.name}</span>
            </button>
          );
        })}
        {totalTrackCount > compactTracks.length && <button type="button" className="is-more" onClick={openPack}>+{totalTrackCount - compactTracks.length}</button>}
      </div>
    </section>
  );
}

function ConversationAvatar({ conversation, small = false, showPresence = true }: { conversation: Pick<DemoConversation, "avatar" | "online">; small?: boolean; showPresence?: boolean }) {
  return (
    <span className={`mw-avatar ${small ? "is-small" : ""}`}>
      <img src={conversation.avatar} alt="" />
      {showPresence && conversation.online && <i />}
    </span>
  );
}

function SidebarItemAvatar({ item, showPresence = true }: { item: Pick<MessagingSidebarItem, "avatar" | "online">; showPresence?: boolean }) {
  return (
    <span className="mw-avatar">
      <img src={item.avatar} alt="" />
      {showPresence && item.online && <i />}
    </span>
  );
}

function AudioMessageBubble({ message, onOpenActions, autoPlay = false }: { message: DemoMessage; onOpenActions?: () => void; autoPlay?: boolean }) {
  const transport = useAudioTransport(message.duration ?? "0:00", message.mediaUrl, autoPlay);
  return (
    <div className={`mw-bubble mw-bubble--audio mw-audio-capsule ${message.kind === "audio-file" ? "is-audio-file" : "is-voice-note"}`}>
      <strong className="mw-audio-capsule__title" title={[message.body, message.bpm ? `${message.bpm} BPM` : null, message.musicalKey].filter(Boolean).join(" · ")}>{message.body}</strong>
      {onOpenActions && <button type="button" className="mw-audio-capsule__options" aria-label="Actions du message audio" onClick={onOpenActions}><MoreHorizontal /></button>}
      <button type="button" className="mw-audio-capsule__play" onClick={() => void transport.toggle()} aria-label={transport.isPlaying ? "Mettre l'audio en pause" : "Lire l'audio"}>{transport.isPlaying ? <Pause /> : <Play fill="currentColor" />}</button>
      <div className="mw-audio-capsule__wave"><Waveform progress={transport.isPlaying || transport.currentSeconds > 0 ? transport.progress : (message.previewProgress ?? 0)} animated={transport.isPlaying} /></div>
      <small className="mw-audio-capsule__duration">{transport.isPlaying ? formatDuration(transport.currentSeconds) : formatDuration(transport.durationSeconds)}</small>
      {transport.error && <em className="mw-audio-error" role="status">{transport.error}</em>}
    </div>
  );
}

function ServerAttachmentMessage({
  message,
  onOpenAudioActions,
  resolveUrl,
  onOpenTrackPack,
}: {
  message: DemoMessage;
  onOpenAudioActions?: () => void;
  resolveUrl: (attachment: MessagingAttachmentViewModel) => Promise<string>;
  onOpenTrackPack: (message: DemoMessage) => void;
}) {
  const attachments = message.attachments ?? [];
  const [urls, setUrls] = useState<string[]>([]);
  const [autoPlay, setAutoPlay] = useState(false);
  const generation = useRef(0);
  useEffect(() => () => { generation.current += 1; }, []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = attachments[0];
  const available = attachments.length > 0 && attachments.every((attachment) => attachment.available);

  const load = async (download = false) => {
    if (!available || loading) return;
    setLoading(true);
    setError(null);
    try {
      const request = generation.current;
      const resolved = await Promise.all(attachments.map((attachment) => resolveUrl(attachment)));
      if (request !== generation.current) return;
      setAutoPlay(!download);
      setUrls(resolved);
      if (download && resolved[0]) triggerDownload(first?.displayName ?? message.body, resolved[0]);
    } catch {
      setError("Ce fichier privé n’est pas disponible pour le moment.");
    } finally {
      setLoading(false);
    }
  };

  if (urls.length > 0) {
    const hydrated: DemoMessage = {
      ...message,
      mediaUrl: urls[0],
      trackMediaUrls: message.kind === "track-pack" ? urls : message.trackMediaUrls,
    };
    if (message.kind === "track-pack") {
      return <TrackPackCard message={hydrated} onOpen={() => onOpenTrackPack(hydrated)} />;
    }
    if (message.kind === "audio" || message.kind === "audio-file") {
      return <AudioMessageBubble message={hydrated} autoPlay={autoPlay} onOpenActions={onOpenAudioActions} />;
    }
    if (message.kind === "image") {
      return (
        <figure className="mw-image-message">
          <img src={urls[0]} alt={first?.displayName ?? message.body} />
          <figcaption><span><strong>{first?.displayName ?? message.body}</strong><small>{first?.mimeType}</small></span><button type="button" onClick={() => triggerDownload(first?.displayName ?? message.body, urls[0])} aria-label="Télécharger l’image"><Download /></button></figcaption>
        </figure>
      );
    }
    if (message.kind === "video") {
      return (
        <figure className="mw-image-message mw-video-message">
          <video src={urls[0]} controls preload="metadata">Votre navigateur ne peut pas lire cette vidéo.</video>
          <figcaption><span><strong>{first?.displayName ?? message.body}</strong><small>{first?.mimeType}</small></span><button type="button" onClick={() => triggerDownload(first?.displayName ?? message.body, urls[0])} aria-label="Télécharger la vidéo"><Download /></button></figcaption>
        </figure>
      );
    }
  }

  const Icon = message.kind === "image" ? FileImage : message.kind === "video" ? FileVideo : message.kind === "audio" || message.kind === "audio-file" ? FileAudio : FolderArchive;
  const shouldDownload = message.kind === "file";
  return (
    <div className="mw-bubble mw-bubble--file is-server-attachment">
      <Icon />
      <span><strong>{first?.displayName ?? message.fileName ?? message.body}</strong><small>{error ?? (available ? `${first?.mimeType ?? "Pièce jointe"} · accès privé` : "Fichier indisponible")}</small></span>
      <button type="button" disabled={!available || loading} onClick={() => void load(shouldDownload)} aria-label={shouldDownload ? "Télécharger" : "Ouvrir"}>{loading ? "…" : shouldDownload ? <Download /> : <Play />}</button>
    </div>
  );
}

const MESSAGE_REACTION_EMOJIS = ["❤️", "🔥", "👏", "🎧", "👍", "✨"] as const;

async function copyMessageToClipboard(message: MessagingWorkspaceMessage) {
  const text = message.fileName ?? message.body;
  if (!text || message.deleted) return false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    return copied;
  } catch {
    return false;
  }
}

function MessageActionPopover({
  anchor,
  message,
  conversationName,
  onClose,
  onReply,
  onCopy,
  onForward,
  onPin,
  onDelete,
  onReact,
}: {
  anchor: HTMLDivElement | null;
  message: MessagingWorkspaceMessage;
  conversationName: string;
  onClose: () => void;
  onReply: () => void;
  onCopy: () => void;
  onForward: () => void;
  onPin: () => void;
  onDelete?: () => void;
  onReact: (emoji: string) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; arrowLeft: number; placement: "above" | "below" } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!anchor || !menu) return undefined;

    const updatePosition = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const menuWidth = menuRect.width || 324;
      const menuHeight = menuRect.height || 252;
      const gutter = 12;
      const gap = 8;
      const hasRoomBelow = window.innerHeight - anchorRect.bottom >= menuHeight + gap + gutter;
      const placement = hasRoomBelow || anchorRect.top < menuHeight + gap + gutter ? "below" : "above";
      const preferredLeft = message.author === "me" ? anchorRect.right - menuWidth : anchorRect.left;
      const left = Math.max(gutter, Math.min(preferredLeft, window.innerWidth - menuWidth - gutter));
      const arrowLeft = Math.max(18, Math.min(anchorRect.left + anchorRect.width / 2 - left - 6, menuWidth - 30));
      const preferredTop = placement === "below" ? anchorRect.bottom + gap : anchorRect.top - menuHeight - gap;
      const top = Math.max(gutter, Math.min(preferredTop, window.innerHeight - menuHeight - gutter));
      setPosition((current) => current?.top === top && current.left === left && current.arrowLeft === arrowLeft && current.placement === placement
        ? current
        : { top, left, arrowLeft, placement });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    document.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchor, confirmDelete, message.author]);

  useLayoutEffect(() => {
    const selector = confirmDelete
      ? ".mw-message-actions__delete-confirm button.is-danger"
      : "button:not(:disabled)";
    menuRef.current?.querySelector<HTMLButtonElement>(selector)?.focus({ preventScroll: true });
  }, [confirmDelete]);

  useEffect(() => {
    const closeFromOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || anchor?.contains(target) || (target instanceof Element && target.closest(".mw-message-reaction-wall"))) return;
      onClose();
    };
    const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector(".mw-message-reaction-wall")) return;
      event.preventDefault();
      onClose();
      anchor?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", closeFromOutside, true);
    window.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside, true);
      window.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [anchor, onClose]);

  const runAndClose = (action: () => void) => {
    onClose();
    action();
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current?.contains(event.target as Node)) return;
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowDown"
          ? (currentIndex + 1) % buttons.length
          : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus({ preventScroll: true });
  };

  if (typeof document === "undefined") return null;
  const authorLabel = message.author === "me" ? "Vous" : conversationName;
  return createPortal(
    <div
      ref={menuRef}
      className="mw-message-actions"
      data-placement={position?.placement ?? "below"}
      role="menu"
      aria-label={`Actions du message de ${authorLabel}`}
      style={{
        top: position?.top ?? -10_000,
        left: position?.left ?? -10_000,
        "--mw-message-action-arrow-left": `${position?.arrowLeft ?? 24}px`,
        visibility: position ? "visible" : "hidden",
      } as CSSProperties}
      onKeyDown={handleMenuKeyDown}
    >
      <header>
        <span>{authorLabel}</span>
        <p>{message.deleted ? "Message supprimé" : message.fileName ?? message.body}</p>
      </header>
      {!message.deleted && (
        <div className="mw-message-actions__emojis" role="group" aria-label="Ajouter une réaction">
          {MESSAGE_REACTION_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" onClick={() => runAndClose(() => onReact(emoji))} aria-label={`Réagir avec ${emoji}`}>{emoji}</button>
          ))}
          <MeeWavEmoticonPicker panelClassName="mw-message-reaction-wall" label="Ouvrir le mur d’émoticônes" onSelect={(emoticon) => runAndClose(() => onReact(meewavEmoticonToken(emoticon.name)))} />
        </div>
      )}
      {!message.deleted && (
        <div className="mw-message-actions__commands">
          <button type="button" role="menuitem" onClick={() => runAndClose(onReply)}><CornerUpLeft /><span>Répondre</span></button>
          <button type="button" role="menuitem" onClick={() => runAndClose(onCopy)}><Copy /><span>Copier</span></button>
          <button type="button" role="menuitem" onClick={() => runAndClose(onForward)}><Forward /><span>Transférer</span></button>
        </div>
      )}
      <div className="mw-message-actions__commands is-secondary">
        <button type="button" role="menuitem" onClick={() => runAndClose(onPin)}>{message.pinned ? <PinOff /> : <Pin />}<span>{message.pinned ? "Désépingler" : "Épingler"}</span></button>
        {onDelete && !confirmDelete && <button type="button" role="menuitem" className="is-danger" onClick={() => setConfirmDelete(true)}><Trash2 /><span>Supprimer</span></button>}
      </div>
      {confirmDelete && (
        <div className="mw-message-actions__delete-confirm" role="alertdialog" aria-label="Confirmer la suppression du message">
          <span>Supprimer ce message&nbsp;?</span>
          <div>
            <button type="button" onClick={() => setConfirmDelete(false)}>Annuler</button>
            <button type="button" className="is-danger" onClick={() => runAndClose(onDelete!)}>Supprimer</button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

function MessageForwardDialog({
  message,
  conversations,
  currentConversationId,
  onClose,
  onForward,
}: {
  message: MessagingWorkspaceMessage;
  conversations: DemoConversation[];
  currentConversationId: string;
  onClose: () => void;
  onForward: (conversationId: string) => boolean | Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const options = conversations.filter((conversation) => conversation.id !== currentConversationId && !conversation.readOnlyReason)
    .filter((conversation) => `${conversation.name} ${conversation.role}`.toLocaleLowerCase("fr-FR").includes(query.trim().toLocaleLowerCase("fr-FR")));

  const forwardTo = async (conversationId: string) => {
    setPendingConversationId(conversationId);
    setError(null);
    try {
      const sent = await onForward(conversationId);
      if (sent) onClose();
      else setError("Ce message n’a pas pu être transféré.");
    } catch {
      setError("Ce message n’a pas pu être transféré.");
    } finally {
      setPendingConversationId(null);
    }
  };

  return (
    <Overlay label="Transférer le message" onClose={onClose} className="mw-dialog--message-forward">
      <section className="mw-message-forward-dialog">
        <header>
          <span><Forward aria-hidden="true" /></span>
          <div><small>MESSAGE</small><h2>Transférer à…</h2></div>
          <button type="button" onClick={onClose} aria-label="Fermer le transfert"><X /></button>
        </header>
        <p className="mw-message-forward-dialog__preview">{message.fileName ?? message.body}</p>
        <label className="mw-message-forward-dialog__search">
          <Search aria-hidden="true" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une conversation" />
        </label>
        <div className="mw-message-forward-dialog__list" role="list">
          {options.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              role="listitem"
              disabled={pendingConversationId !== null}
              onClick={() => void forwardTo(conversation.id)}
              aria-label={`Transférer à ${conversation.name}`}
            >
              <ConversationAvatar small conversation={conversation} />
              <span><strong>{conversation.name}</strong><small>{conversation.role}</small></span>
              <Forward aria-hidden="true" />
            </button>
          ))}
          {options.length === 0 && <div className="mw-message-forward-dialog__empty">Aucune autre conversation trouvée.</div>}
        </div>
        {error && <p className="mw-message-forward-dialog__error" role="alert">{error}</p>}
      </section>
    </Overlay>
  );
}

function MessageItem({
  message,
  showTail,
  replyTarget,
  conversationName,
  onOpenTrackPack,
  onToggleReaction,
  onReply,
  onCopy,
  onForward,
  onPin,
  onDelete,
  onRetry,
  resolveAttachmentUrl,
}: {
  message: MessagingWorkspaceMessage;
  showTail: boolean;
  replyTarget?: MessagingWorkspaceMessage;
  conversationName: string;
  onOpenTrackPack: (message: DemoMessage) => void;
  onToggleReaction: (messageId: string, reaction: string) => void;
  onReply: (message: MessagingWorkspaceMessage) => void;
  onCopy: (message: MessagingWorkspaceMessage) => void;
  onForward: (message: MessagingWorkspaceMessage) => void;
  onPin: (message: MessagingWorkspaceMessage) => void;
  onDelete?: (message: MessagingWorkspaceMessage) => void;
  onRetry?: (clientMessageId: string) => void;
  resolveAttachmentUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
}) {
  const mine = message.author === "me";
  const family = message.kind === "track-pack" || message.kind === "brief"
    ? "meewav"
    : ["audio-file", "image", "video", "file"].includes(message.kind)
      ? "attachment"
      : "conversation";
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wrapperClass = `mw-message ${mine ? "is-mine" : "is-theirs"} is-family-${family} ${showTail ? "has-tail" : ""} ${message.replyToId ? "has-reply" : ""} ${message.pinned ? "is-pinned" : ""} ${message.deleted ? "is-deleted" : ""} ${message.showcaseRole ? `is-showcase-${message.showcaseRole}` : ""}`;
  const replyPreview = message.replyToId ? (
    <aside className="mw-message__reply-preview">
      <small>{replyTarget ? (replyTarget.author === "me" ? "Vous" : conversationName) : "Message d’origine indisponible"}</small>
      {replyTarget && <span>{replyTarget.fileName ?? replyTarget.body}</span>}
    </aside>
  ) : null;
  const messageMeta = (
    <div className="mw-message__meta">
      {message.reactions && message.reactions.length > 0 && (
        <div className="mw-message__reactions" aria-label="Réactions au message">
          {message.reactions.map((reaction) => (
            <button type="button" key={reaction} onClick={() => onToggleReaction(message.id, reaction)} aria-label={`Retirer la réaction ${reaction}`}><MeeWavRichText emoticonSize={26}>{reaction}</MeeWavRichText></button>
          ))}
        </div>
      )}
      {message.pinned && <span className="mw-message__pinned"><Pin aria-hidden="true" /> Épinglé</span>}
      {mine && message.deliveryStatus === "failed" && message.sourceId && onRetry && (
        <button type="button" onClick={() => onRetry(message.sourceId!)} aria-label="Réessayer l’envoi du message">Échec · Réessayer</button>
      )}
      <span className="mw-message__time">
        {message.time}
        {mine && (message.deliveryStatus === "pending" ? <Check size={12} /> : <CheckCheck size={12} />)}
      </span>
    </div>
  );

  let content: ReactNode;
  if (message.deleted) {
    content = <div className="mw-bubble mw-bubble--text mw-bubble--deleted"><p>Message supprimé</p></div>;
  } else if ((message.attachments?.length ?? 0) > 0 && resolveAttachmentUrl) {
    content = <ServerAttachmentMessage message={message} onOpenAudioActions={() => setActionMenuOpen(true)} resolveUrl={resolveAttachmentUrl} onOpenTrackPack={onOpenTrackPack} />;
  } else if (message.kind === "track-pack") {
    content = <TrackPackCard message={message} onOpen={() => onOpenTrackPack(message)} />;
  } else if (message.kind === "audio" || message.kind === "audio-file") {
    content = <AudioMessageBubble message={message} onOpenActions={() => setActionMenuOpen(true)} />;
  } else if (message.kind === "image" && message.mediaUrl) {
    content = (
      <figure className="mw-image-message">
        <img src={message.mediaUrl} alt={message.fileName ?? message.body} />
        <figcaption>
          <span><strong>{message.fileName ?? message.body}</strong><small>{message.fileType ?? "Image"}</small></span>
          <button type="button" onClick={() => triggerDownload(message.fileName ?? message.body, message.mediaUrl!)} aria-label="Télécharger l’image"><Download /></button>
        </figcaption>
      </figure>
    );
  } else if (["image", "video", "file"].includes(message.kind)) {
    const Icon = message.kind === "image" ? FileImage : message.kind === "video" ? FileVideo : FolderArchive;
    content = (
      <div className="mw-bubble mw-bubble--file"><Icon /><span><strong>{message.fileName ?? message.body}</strong><small>{message.fileType ?? "Pièce jointe"}</small></span><button type="button" onClick={() => message.mediaUrl ? triggerDownload(message.fileName ?? message.body, message.mediaUrl) : downloadTextFile("source-indisponible.txt", `Le fichier source « ${message.fileName ?? message.body} » n'est pas inclus dans cette maquette.`)} aria-label="Télécharger"><Download /></button></div>
    );
  } else if (message.kind === "brief") {
    content = (
      <div className={`mw-brief ${briefExpanded ? "is-expanded" : ""}`}>
        <span><Sparkles /> BRIEF CRÉATIF</span>
        <p><MeeWavRichText>{message.body}</MeeWavRichText></p>
        <button type="button" aria-expanded={briefExpanded} onClick={() => setBriefExpanded((current) => !current)}>{briefExpanded ? "Réduire" : "Afficher"}</button>
      </div>
    );
  } else {
    content = <div className="mw-bubble mw-bubble--text"><p><MeeWavRichText emoticonSize={36}>{message.body}</MeeWavRichText></p></div>;
  }

  const openActions = () => setActionMenuOpen(true);
  const isInteractiveTarget = (target: EventTarget | null) => target instanceof Element
    && Boolean(target.closest("button, a, input, textarea, select, audio, video, [contenteditable='true'], [data-message-action-ignore]"));

  return (
    <div
      ref={wrapperRef}
      className={wrapperClass}
      data-message-id={message.id}
      tabIndex={0}
      aria-haspopup="menu"
      aria-label={`Message de ${mine ? "vous" : conversationName}. Cliquer pour les actions.`}
      onClick={(event) => {
        if (isInteractiveTarget(event.target)) return;
        openActions();
      }}
      onContextMenu={(event) => {
        if (isInteractiveTarget(event.target)) return;
        event.preventDefault();
        openActions();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || !["Enter", " "].includes(event.key)) return;
        event.preventDefault();
        openActions();
      }}
    >
      {replyPreview}
      {message.forwardedFrom && !message.deleted && <span className="mw-message__forwarded"><Forward aria-hidden="true" /> Transféré</span>}
      {content}
      {messageMeta}
      {actionMenuOpen && (
        <MessageActionPopover
          anchor={wrapperRef.current}
          message={message}
          conversationName={conversationName}
          onClose={() => setActionMenuOpen(false)}
          onReply={() => onReply(message)}
          onCopy={() => onCopy(message)}
          onForward={() => onForward(message)}
          onPin={() => onPin(message)}
          onDelete={onDelete ? () => onDelete(message) : undefined}
          onReact={(emoji) => onToggleReaction(message.id, emoji)}
        />
      )}
    </div>
  );
}

function NewConversationDialog({
  conversations,
  onClose,
  onCreate,
  live,
}: {
  conversations: DemoConversation[];
  onClose: () => void;
  onCreate: (conversation: DemoConversation) => void;
  live?: Pick<MessagingWorkspaceLiveController,
    | "contacts"
    | "contactsStatus"
    | "contactsError"
    | "searchContacts"
    | "createDirectConversation"
    | "createGroupConversation"
  > | null;
}) {
  const [search, setSearch] = useState("");
  const [selectedContacts, setSelectedContacts] = useState<DemoContact[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const groupAttemptRef = useRef<{ signature: string; idempotencyKey: string } | null>(null);
  const searchContactsRef = useRef(live?.searchContacts);
  searchContactsRef.current = live?.searchContacts;
  const liveMode = Boolean(live);
  const contacts = live ? (live.contacts ?? []) : demoContacts;
  const visible = live
    ? search.trim().replace(/^@/, "").length >= 2 ? contacts : []
    : demoContacts.filter((contact) => `${contact.displayName} ${contact.role} ${contact.username}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!liveMode || !searchContactsRef.current) return undefined;
    if (search.trim().replace(/^@/, "").length < 2) {
      void searchContactsRef.current(search);
      return undefined;
    }
    void searchContactsRef.current("");
    const timer = window.setTimeout(() => { void searchContactsRef.current?.(search); }, 250);
    return () => window.clearTimeout(timer);
  }, [liveMode, search]);

  const toggle = (contact: DemoContact) => {
    setSubmitError(null);
    setSelectedContacts((current) => current.some((item) => item.id === contact.id)
      ? current.filter((item) => item.id !== contact.id)
      : [...current, contact]);
  };
  const create = async () => {
    if (submittingRef.current) return;
    const contactsSelected = selectedContacts;
    if (contactsSelected.length === 0) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (live) {
        if (contactsSelected.length === 1 && live.createDirectConversation) {
          const conversationId = await live.createDirectConversation(contactsSelected[0].id);
          if (conversationId) { window.dispatchEvent(new Event("meewav:messaging-detail")); onClose(); }
          else setSubmitError("La discussion n’a pas pu être ouverte. Réessaie.");
          return;
        }
        if (contactsSelected.length > 1 && live.createGroupConversation) {
          const title = contactsSelected.map((contact) => contact.displayName.split(" ")[0]).join(", ");
          const profileIds = contactsSelected.map((contact) => contact.id);
          const signature = JSON.stringify({ title, profileIds: [...profileIds].sort() });
          if (groupAttemptRef.current?.signature !== signature) {
            groupAttemptRef.current = {
              signature,
              idempotencyKey: `group:${createClientMessageId()}`,
            };
          }
          const conversationId = await live.createGroupConversation(
            title,
            profileIds,
            groupAttemptRef.current.idempotencyKey,
          );
          if (conversationId) { window.dispatchEvent(new Event("meewav:messaging-detail")); onClose(); }
          else setSubmitError("Le groupe n’a pas pu être créé. Réessaie.");
        }
        return;
      }
      if (contactsSelected.length === 1) {
        const contact = contactsSelected[0];
        const existing = conversations.find((conversation) => conversation.handle === `@${contact.username}`);
        onCreate(existing ?? {
          id: `conversation-${contact.id}`,
          name: contact.displayName,
          handle: `@${contact.username}`,
          role: contact.role,
          avatar: contact.avatar,
          status: contact.status ?? (contact.online ? "En ligne" : "Hors ligne"),
          online: contact.online,
          gradeLevel: contact.gradeLevel,
          unread: 0,
          preview: "",
          time: "Maintenant",
          messages: [],
        });
        return;
      }
      if (contactsSelected.length > 1) {
        const names = contactsSelected.map((contact) => contact.displayName.split(" ")[0]);
        onCreate({
          id: `discussion-${Date.now()}`,
          name: names.join(", "),
          handle: `${contactsSelected.length} membres`,
          role: "Groupe de discussion",
          avatar: contactsSelected[0].avatar,
          status: `${contactsSelected.length} membres`,
          online: contactsSelected.some((contact) => contact.online),
          unread: 0,
          preview: "",
          time: "Maintenant",
          messages: [],
        });
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "L’ouverture a échoué. Réessaie.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Overlay label="Nouvelle conversation" onClose={onClose}>
      <header className="mw-dialog__header"><div><span>NOUVELLE CONVERSATION</span><h2>Trouver un ami</h2></div><button type="button" className="mw-icon-button" onClick={onClose} aria-label="Fermer"><X /></button></header>
      <label className="mw-dialog-search"><Search /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom ou @identifiant" aria-label="Rechercher un ami sur Meewav" /></label>
      {selectedContacts.length > 0 && <div className="mw-selected-contacts">{selectedContacts.map((contact) => <button type="button" key={contact.id} onClick={() => toggle(contact)}><ConversationAvatar conversation={{ avatar: contact.avatar, online: contact.online }} small /><span>{contact.displayName.split(" ")[0]}</span><X /></button>)}</div>}
      <div className="mw-contact-picker">
        {live && search.trim().replace(/^@/, "").length < 2 && <div className="mw-list-empty"><Search /><strong>Retrouve tes amis sur Meewav</strong><span>Saisis au moins deux lettres de leur nom ou de leur identifiant.</span></div>}
        {live?.contactsStatus === "loading" && <div className="mw-list-empty"><Search /><strong>Recherche en cours…</strong></div>}
        {live?.contactsStatus === "error" && <div className="mw-list-empty"><Info /><strong>Recherche indisponible</strong><span>{live.contactsError}</span></div>}
        {visible.map((contact) => (
          <button type="button" key={contact.id} className={selectedContacts.some((item) => item.id === contact.id) ? "is-selected" : ""} onClick={() => toggle(contact)}>
            <ConversationAvatar conversation={{ avatar: contact.avatar, online: contact.online }} />
            <span><strong>{contact.displayName}</strong><small>{contact.username.startsWith("@") ? contact.username : `@${contact.username}`} · {contact.role}</small></span>
            <i>{selectedContacts.some((item) => item.id === contact.id) && <Check />}</i>
          </button>
        ))}
        {live && search.trim().replace(/^@/, "").length >= 2 && live.contactsStatus === "ready" && visible.length === 0 && <div className="mw-list-empty"><Search /><strong>Aucun ami trouvé</strong></div>}
      </div>
      {submitError && <p className="mw-contact-picker-error" role="alert">{submitError}</p>}
      <footer className="mw-dialog__footer"><button type="button" disabled={submitting} onClick={onClose}>Annuler</button><button type="button" className="is-primary" disabled={selectedContacts.length === 0 || submitting} onClick={() => void create()}>{submitting ? "Ouverture…" : selectedContacts.length > 1 ? <><Users /> Créer groupe</> : <><Send /> Ouvrir la discussion</>}</button></footer>
    </Overlay>
  );
}

function ComposerDialog({ mode, onClose, onSubmit }: {
  mode: Exclude<AttachmentMode, null>;
  onClose: () => void;
  onSubmit: (message: DemoMessage, files: File[], payload: Record<string, MessagingJson>) => void | Promise<void>;
}) {
  const [brief, setBrief] = useState("");
  const [briefStyle, setBriefStyle] = useState<string | null>(null);
  const [briefBpm, setBriefBpm] = useState<number | null>(null);
  const [composerTracks, setComposerTracks] = useState<Track[]>([]);
  const trackInputRef = useRef<HTMLInputElement>(null);

  const moveTrack = (index: number, direction: -1 | 1) => {
    setComposerTracks((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  };

  const addTracks = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    const additions = files.map((file, index) => ({
      id: `track-${Date.now()}-${index}`,
      label: file.name,
      color: trackColors[(composerTracks.length + index) % trackColors.length],
      duration: "0:00",
      muted: false,
      solo: false,
      mediaUrl: URL.createObjectURL(file),
      fileSize: file.size,
      file,
    }));
    setComposerTracks((current) => [...current, ...additions]);
    event.target.value = "";

    const measured = await Promise.all(additions.map(async (track) => ({
      id: track.id,
      duration: formatDuration(await readAudioDuration(track.mediaUrl)),
    })));
    setComposerTracks((current) => current.map((track) => {
      const measurement = measured.find((item) => item.id === track.id);
      return measurement ? { ...track, duration: measurement.duration } : track;
    }));
  };

  const cancel = () => {
    composerTracks.forEach((track) => {
      if (track.mediaUrl) URL.revokeObjectURL(track.mediaUrl);
    });
    onClose();
  };

  const submit = () => {
    const now = new Date();
    const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (mode === "brief") {
      const parts: string[] = [];
      if (briefStyle) parts.push(`Style: ${briefStyle}`);
      if (briefBpm) parts.push(`BPM: ${briefBpm}`);
      if (brief.trim()) parts.push(brief.trim());
      if (parts.length === 0) return;
      void onSubmit(
        { id: `brief-${Date.now()}`, author: "me", kind: "brief", body: parts.join("\n"), time },
        [],
        buildMessagingBriefPayload(briefStyle, briefBpm),
      );
      return;
    }
    if (composerTracks.length === 0) return;
    const longestDuration = composerTracks.reduce((longest, track) => Math.max(longest, parseDuration(track.duration)), 0);
    const totalSize = composerTracks.reduce((total, track) => total + (track.fileSize ?? 0), 0);
    void onSubmit({
      id: `track-${Date.now()}`,
      author: "me",
      kind: "track-pack",
      body: "Track Pack",
      duration: formatDuration(longestDuration),
      size: `${(totalSize / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`,
      tracks: composerTracks.map((track) => track.label),
      trackDurations: composerTracks.map((track) => track.duration),
      trackMediaUrls: composerTracks.map((track) => track.mediaUrl ?? ""),
      time,
    }, composerTracks.flatMap((track) => track.file ? [track.file] : []), buildMessagingTrackPackPayload(
      composerTracks.map((track) => track.label),
      composerTracks.map((track) => track.duration),
    ));
  };

  const canSubmit = mode === "brief"
    ? Boolean(brief.trim() || briefStyle || briefBpm)
    : composerTracks.length > 0;

  return (
    <Overlay label={mode === "brief" ? "Envoyer un brief" : "Composer un Track Pack"} onClose={cancel}>
      <header className="mw-dialog__header"><div><span>{mode === "brief" ? "BRIEF CRÉATIF" : "TRACK PACK"}</span><h2>{mode === "brief" ? "Créer un Brief" : "Organise tes pistes"}</h2></div><button type="button" className="mw-icon-button" onClick={cancel} aria-label="Fermer"><X /></button></header>
      {mode === "brief" ? (
        <div className="mw-brief-composer">
          <div><span className="mw-composer-label">Style recherché</span><div className="mw-brief-styles" role="group" aria-label="Style recherché">{["Trap", "Drill", "R&B", "Pop", "Afro", "Lo-Fi"].map((style) => <button type="button" key={style} aria-pressed={briefStyle === style} className={briefStyle === style ? "is-active" : ""} onClick={() => setBriefStyle((current) => current === style ? null : style)}>{style}</button>)}</div></div>
          <div><span className="mw-composer-label">BPM souhaité</span><div className="mw-brief-styles mw-brief-bpms" role="group" aria-label="BPM souhaité">{[80, 100, 120, 140, 160, 180].map((bpm) => <button type="button" key={bpm} aria-pressed={briefBpm === bpm} className={briefBpm === bpm ? "is-active" : ""} onClick={() => setBriefBpm((current) => current === bpm ? null : bpm)}>{bpm}</button>)}</div></div>
          <label className="mw-field"><span>Description</span><textarea autoFocus value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Décris l'ambiance, les références..." rows={4} /></label>
        </div>
      ) : (
        <div className="mw-track-composer">
          {composerTracks.length === 0 && <div className="mw-track-composer__empty"><TrackPackMark /><strong>Aucune piste ajoutée</strong><span>Ajoute les fichiers audio qui composeront le Track Pack.</span></div>}
          <section>{composerTracks.map((track, index) => <article key={track.id}><i style={{ background: track.color }} /><span><input aria-label={`Nom de la piste ${index + 1}`} value={track.label} onChange={(event) => setComposerTracks((current) => current.map((item) => item.id === track.id ? { ...item, label: event.target.value } : item))} /><small>{track.duration} · {track.fileSize ? `${(track.fileSize / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : "Audio"}</small></span><div className="mw-track-composer__actions"><button type="button" onClick={() => moveTrack(index, -1)} disabled={index === 0} aria-label="Monter"><ArrowUp /></button><button type="button" onClick={() => moveTrack(index, 1)} disabled={index === composerTracks.length - 1} aria-label="Descendre"><ArrowDown /></button><button type="button" onClick={() => { if (track.mediaUrl) URL.revokeObjectURL(track.mediaUrl); setComposerTracks((current) => current.filter((item) => item.id !== track.id)); }} aria-label="Supprimer"><Trash2 /></button></div></article>)}</section>
          <button type="button" className="mw-add-track" onClick={() => trackInputRef.current?.click()}><FileAudio /> Ajouter une piste</button>
          <input ref={trackInputRef} type="file" accept="audio/*" multiple hidden onChange={(event) => void addTracks(event)} />
        </div>
      )}
      <footer className="mw-dialog__footer"><button type="button" onClick={cancel}>Annuler</button><button type="button" className="is-primary" disabled={!canSubmit} onClick={submit}><Send /> {mode === "track-pack" && composerTracks.length > 0 ? `Envoyer ${composerTracks.length} piste${composerTracks.length > 1 ? "s" : ""}` : "Envoyer"}</button></footer>
    </Overlay>
  );
}

function ConversationDrawer({
  conversation,
  onClose,
  onPin,
  onMute,
  onArchive,
  onDelete,
  onLeave,
  onBlock,
  onReport,
  safetyBusy = false,
  liveMode = false,
  search,
  onSearch,
}: {
  conversation: DemoConversation;
  onClose: () => void;
  onPin: () => void;
  onMute: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onLeave?: () => void | Promise<void>;
  onBlock?: () => boolean | Promise<boolean>;
  onReport?: (category: MessagingReportCategory, comment?: string | null) => boolean | Promise<boolean>;
  safetyBusy?: boolean;
  liveMode?: boolean;
  search: string;
  onSearch: (value: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCategory, setReportCategory] = useState<MessagingReportCategory>("spam");
  const [reportComment, setReportComment] = useState("");
  const drawerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const closeOutside = (event: globalThis.PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || drawerRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-conversation-drawer-trigger]")) return;
      onClose();
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return (
    <aside ref={drawerRef} id="mw-conversation-drawer" className="mw-conversation-drawer" aria-label="Options de la conversation">
      <header><button type="button" className="mw-icon-button" onClick={onClose} aria-label="Fermer"><X /></button></header>
      <div className="mw-conversation-drawer__profile"><ConversationAvatar conversation={conversation} /><h2>{conversation.name}</h2><p>{conversation.handle}</p><span>{conversation.role}</span></div>
      <label className="mw-dialog-search"><Search /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Rechercher dans la conversation" /></label>
      <nav>
        <button type="button" onClick={onPin}>{conversation.pinned ? <PinOff /> : <Pin />}<span><strong>{conversation.pinned ? "Désépingler" : "Épingler"}</strong><small>Organiser la liste de conversations</small></span></button>
        <button type="button" onClick={onMute}>{conversation.muted ? <Bell /> : <BellOff />}<span><strong>{conversation.muted ? "Activer les notifications" : "Désactiver les notifications"}</strong><small>{conversation.muted ? "Recevoir à nouveau les alertes" : "Conserver les messages en silence"}</small></span></button>
        <button type="button" onClick={onArchive}><Archive /><span><strong>Archiver</strong><small>Retirer de la liste principale</small></span></button>
        {liveMode && conversation.conversationKind === "group" && onLeave && <button type="button" className="is-danger" onClick={() => setConfirmLeave(true)}><Users /><span><strong>Quitter le groupe</strong><small>Les autres membres gardent la discussion</small></span></button>}
        {liveMode && onReport && <button type="button" className="is-danger" onClick={() => setReportOpen(true)}><Flag /><span><strong>Signaler la conversation</strong><small>Transmettre un signalement à la modération</small></span></button>}
        {liveMode && onBlock && <button type="button" className="is-danger" onClick={() => setConfirmBlock(true)}><Ban /><span><strong>Bloquer cet artiste</strong><small>Couper les messages et demandes de collaboration</small></span></button>}
        <button type="button" className="is-danger" onClick={() => setConfirmDelete(true)}><Trash2 /><span><strong>{liveMode ? "Retirer de ma liste" : "Supprimer"}</strong><small>{liveMode ? "Masquer cette conversation pour toi" : "Effacer cette conversation locale"}</small></span></button>
      </nav>
      {confirmLeave && <section className="mw-delete-confirm"><strong>Quitter ce groupe ?</strong><p>Tu perdras l’accès aux prochains messages. L’historique reste chez les autres membres.</p><div><button type="button" onClick={() => setConfirmLeave(false)}>Annuler</button><button type="button" onClick={() => void onLeave?.()}>Quitter</button></div></section>}
      {confirmBlock && <section className="mw-delete-confirm"><strong>Bloquer {conversation.name} ?</strong><p>Cette conversation disparaîtra et ses prochains messages ou demandes de collaboration seront bloqués.</p><div><button type="button" disabled={safetyBusy} onClick={() => setConfirmBlock(false)}>Annuler</button><button type="button" disabled={safetyBusy} onClick={() => void onBlock?.()}>{safetyBusy ? "Blocage…" : "Bloquer"}</button></div></section>}
      {reportOpen && <section className="mw-delete-confirm mw-safety-report"><strong>Signaler cette conversation</strong><p>Le signalement est privé et sera examiné par la modération.</p><label><span>Motif</span><select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as MessagingReportCategory)}><option value="spam">Spam</option><option value="harassment">Harcèlement</option><option value="hate">Discours haineux</option><option value="sexual">Contenu sexuel</option><option value="violence">Violence</option><option value="fraud">Fraude</option><option value="copyright">Droits d’auteur</option><option value="privacy">Vie privée</option><option value="other">Autre</option></select></label><label><span>Précision facultative</span><textarea value={reportComment} maxLength={2_000} rows={3} onChange={(event) => setReportComment(event.target.value)} placeholder="Décris brièvement le problème" /></label><div><button type="button" disabled={safetyBusy} onClick={() => setReportOpen(false)}>Annuler</button><button type="button" disabled={safetyBusy} onClick={() => void onReport?.(reportCategory, reportComment.trim() || null)}>{safetyBusy ? "Envoi…" : "Envoyer"}</button></div></section>}
      {confirmDelete && <section className="mw-delete-confirm"><strong>{liveMode ? "Retirer cette conversation ?" : "Supprimer cette conversation ?"}</strong><p>{liveMode ? "Elle disparaîtra de ta liste sans effacer l’historique des autres participants." : "Cette action retire la conversation de cette démonstration."}</p><div><button type="button" onClick={() => setConfirmDelete(false)}>Annuler</button><button type="button" onClick={onDelete}>{liveMode ? "Retirer" : "Supprimer"}</button></div></section>}
    </aside>
  );
}

function RecordedVoicePreview({ voice }: { voice: RecordedVoice }) {
  const transport = useAudioTransport(voice.duration, voice.mediaUrl);
  return (
    <span className="mw-recorded-voice">
      <button type="button" onClick={() => void transport.toggle()} aria-label={transport.isPlaying ? "Mettre la note vocale en pause" : "Écouter la note vocale"}>{transport.isPlaying ? <Pause /> : <Play fill="currentColor" />}</button>
      <Waveform compact progress={transport.progress} />
      <small>{formatDuration(transport.currentSeconds)} / {voice.duration}</small>
    </span>
  );
}

function formatAttachmentQueueStatus(item: MessagingAttachmentQueueItem) {
  if (item.status === "queued" || item.status === "preparing") return "Préparation…";
  if (item.status === "uploading") return "Envoi sécurisé…";
  if (item.status === "finalizing") return "Vérification…";
  if (item.status === "ready") return "Prêt";
  if (item.status === "sending") return "Publication…";
  if (item.status === "sent") return "Envoyé";
  if (item.status === "discarding") return "Suppression…";
  return item.error?.message ?? "Échec de l’envoi";
}

function MessagingAttachmentQueuePanel({
  items,
  onRetry,
  onDiscard,
  onSend,
}: {
  items: MessagingAttachmentQueueItem[];
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onSend: () => void;
}) {
  if (items.length === 0) return null;
  const ready = items.every((item) => item.status === "ready");
  const busy = items.some((item) => ["queued", "preparing", "uploading", "finalizing", "sending", "discarding"].includes(item.status));
  return (
    <section className="mw-attachment-queue" aria-label="Pièces jointes en préparation">
      <div className="mw-attachment-queue__items">
        {items.map((item) => (
          <article key={item.id} className={`is-${item.status}`}>
            <FileAudio aria-hidden="true" />
            <span><strong>{item.displayName}</strong><small>{formatAttachmentQueueStatus(item)}</small><i style={{ "--mw-upload-progress": `${Math.round(item.progress * 100)}%` } as CSSProperties} /></span>
            {item.status === "failed" && <button type="button" onClick={() => onRetry(item.id)}>Réessayer</button>}
            {!new Set(["sending", "sent", "discarding"]).has(item.status) && <button type="button" className="is-icon" onClick={() => onDiscard(item.id)} aria-label={`Retirer ${item.displayName}`}><X /></button>}
          </article>
        ))}
      </div>
      <button type="button" className="mw-attachment-queue__send" disabled={!ready || busy} onClick={onSend}><Send /> Envoyer</button>
    </section>
  );
}

function purposeForMessageKind(kind: DemoMessageKind): MessagingAttachmentPurpose {
  if (kind === "image") return "image";
  if (kind === "video") return "video";
  if (kind === "audio" || kind === "audio-file") return "audio";
  return "document";
}

function structuredKindForMessage(kind: DemoMessageKind): MessagingStructuredMessageKind {
  if (kind === "audio" || kind === "audio-file") return "audio";
  if (kind === "track-pack") return "track_pack";
  if (kind === "brief" || kind === "image" || kind === "video" || kind === "file") return kind;
  return "text";
}

function createClientMessageId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export default function MessageWorkspace({
  newConversationSignal,
  openRequest,
  onRequestConsumed,
  onCreateGroup,
  activeSpace = "messages",
  contentSpace = "messages",
  showCollabConversation = false,
  conversationScope,
  railItems = [],
  selectedRailKey = null,
  onRailItemSelect,
  rightPane,
  conversationHeader,
  onSpaceChange,
  onConversationsChange,
  liveController = null,
  marketplaceContext = null,
}: MessageWorkspaceProps) {
  const [conversations, setConversations] = useState(() => demoConversations.map((conversation) => ({ ...conversation, messages: [...conversation.messages] })));
  const [selectedId, setSelectedId] = useState(demoConversations[0].id);
  const [conversationSearch, setConversationSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [railMenuOpen, setRailMenuOpen] = useState(false);
  const [showAllConversations, setShowAllConversations] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [composer, setComposer] = useState("");
  const [replyingTo, setReplyingTo] = useState<MessagingWorkspaceMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<MessagingWorkspaceMessage | null>(null);
  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [attachmentMode, setAttachmentMode] = useState<AttachmentMode>(null);
  const [fileAccept, setFileAccept] = useState("*/*");
  const [pendingFileKind, setPendingFileKind] = useState<DemoMessageKind>("file");
  const [viewerMessage, setViewerMessage] = useState<DemoMessage | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const soundsEnabled = true as const;

  useEffect(() => {
    if (soundsEnabled) preloadMessageSounds();
  }, [soundsEnabled]);
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [recordedVoice, setRecordedVoice] = useState<RecordedVoice | null>(null);
  const [liveAttachmentDraft, setLiveAttachmentDraft] = useState<LiveAttachmentDraft | null>(null);
  const [liveAttachmentSending, setLiveAttachmentSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const conversationRailRef = useRef<HTMLElement>(null);
  const conversationSearchRef = useRef<HTMLInputElement>(null);
  const preferredContactRailWidthRef = useRef<number | null>(null);
  const expandedContactRailWidthRef = useRef<number | null>(null);
  const renderedContactRailWidthRef = useRef<number | null>(null);
  const contactRailDragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [contactRailWidth, setContactRailWidth] = useState<number | null>(null);
  const [contactRailMinWidth, setContactRailMinWidth] = useState(CONTACT_RAIL_MIN_WIDTH);
  const [contactRailMaxWidth, setContactRailMaxWidth] = useState(CONTACT_RAIL_MAX_WIDTH);
  const [isContactRailResizing, setIsContactRailResizing] = useState(false);
  const isContactRailCompact = contactRailWidth !== null
    && contactRailWidth < contactRailMinWidth + CONTACT_RAIL_COMPACT_THRESHOLD - CONTACT_RAIL_MIN_WIDTH;
  const lastNewConversationSignal = useRef(newConversationSignal);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const recordingRequestRef = useRef(0);
  const ownedMediaUrlsRef = useRef(new Set<string>());
  const liveAttachmentSendRef = useRef<string | null>(null);
  const pendingBriefAttemptRef = useRef<{ signature: string; clientMessageId: string } | null>(null);
  const onConversationsChangeRef = useRef(onConversationsChange);
  onConversationsChangeRef.current = onConversationsChange;

  const getContactRailBounds = useCallback(() => {
    const workspaceWidth = workspaceRef.current?.getBoundingClientRect().width ?? CONTACT_RAIL_MAX_WIDTH + CHAT_MIN_WIDTH;
    const railStyle = conversationRailRef.current ? window.getComputedStyle(conversationRailRef.current) : null;
    const navigationInset = (Number.parseFloat(railStyle?.paddingLeft ?? "0") || 0)
      + (Number.parseFloat(railStyle?.paddingRight ?? "0") || 0);
    return {
      minimum: navigationInset + CONTACT_RAIL_MIN_WIDTH,
      compactThreshold: navigationInset + CONTACT_RAIL_COMPACT_THRESHOLD,
      maximum: Math.max(
        // Keep search usable when reopening the rail on a smaller desktop.
        navigationInset + CONTACT_RAIL_COMPACT_THRESHOLD + 20,
        Math.min(CONTACT_RAIL_MAX_WIDTH, workspaceWidth - CHAT_MIN_WIDTH),
      ),
    };
  }, []);

  const applyContactRailWidth = useCallback((requestedWidth: number, persist = false) => {
    const { minimum, maximum, compactThreshold } = getContactRailBounds();
    const nextWidth = clampContactRailWidth(requestedWidth, minimum, maximum);
    preferredContactRailWidthRef.current = persist ? nextWidth : requestedWidth;
    renderedContactRailWidthRef.current = nextWidth;
    if (nextWidth >= compactThreshold && (!contactRailDragRef.current || persist)) {
      expandedContactRailWidthRef.current = nextWidth;
    }
    setContactRailMinWidth(minimum);
    setContactRailMaxWidth(maximum);
    setContactRailWidth(nextWidth);
    if (persist) storeContactRailWidth(nextWidth);
    return nextWidth;
  }, [getContactRailBounds]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.toggle("is-resizing-messaging-contact-rail", isContactRailResizing);
    return () => document.body.classList.remove("is-resizing-messaging-contact-rail");
  }, [isContactRailResizing]);

  const startContactRailResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || contactRailDragRef.current || window.matchMedia("(max-width: 760px)").matches) return;
    const startWidth = conversationRailRef.current?.getBoundingClientRect().width
      ?? renderedContactRailWidthRef.current
      ?? defaultContactRailWidth();
    contactRailDragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsContactRailResizing(true);
    event.preventDefault();
  }, []);

  const moveContactRailResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = contactRailDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    applyContactRailWidth(drag.startWidth + event.clientX - drag.startX);
  }, [applyContactRailWidth]);

  const finishContactRailResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = contactRailDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    contactRailDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setIsContactRailResizing(false);
    const renderedWidth = renderedContactRailWidthRef.current;
    if (renderedWidth !== null) applyContactRailWidth(renderedWidth, true);
  }, [applyContactRailWidth]);

  const resizeContactRailWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const { minimum, maximum } = getContactRailBounds();
    const currentWidth = renderedContactRailWidthRef.current
      ?? conversationRailRef.current?.getBoundingClientRect().width
      ?? defaultContactRailWidth();
    const step = event.shiftKey ? 24 : 8;
    let nextWidth: number | null = null;
    if (event.key === "ArrowLeft") nextWidth = currentWidth - step;
    if (event.key === "ArrowRight") nextWidth = currentWidth + step;
    if (event.key === "Home") nextWidth = minimum;
    if (event.key === "End") nextWidth = maximum;
    if (nextWidth === null) return;
    event.preventDefault();
    applyContactRailWidth(nextWidth, true);
  }, [applyContactRailWidth, getContactRailBounds]);

  const resetContactRailWidth = useCallback(() => {
    const resetWidth = defaultContactRailWidth();
    applyContactRailWidth(resetWidth);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(CONTACT_RAIL_STORAGE_KEY);
      } catch {
        // The in-memory reset remains effective when storage is unavailable.
      }
    }
  }, [applyContactRailWidth]);

  const expandContactRail = useCallback(() => {
    const { compactThreshold } = getContactRailBounds();
    applyContactRailWidth(Math.max(
      expandedContactRailWidthRef.current ?? defaultContactRailWidth(),
      compactThreshold + 20,
    ), true);
  }, [applyContactRailWidth, getContactRailBounds]);

  const workspaceConversations = useMemo(() => {
    if (!liveController) return conversations.filter((conversation) => !conversationScope
      || (conversationScope === "collabs" ? Boolean(conversation.collaborationRequestId) : !conversation.collaborationRequestId));
    return liveController.conversations.map((conversation) => conversation.id === liveController.selectedConversationId
      ? { ...conversation, messages: liveController.messages }
      : conversation);
  }, [conversations, liveController, conversationScope]);
  const workspaceSelectedId = liveController
    ? liveController.selectedConversationId ?? liveController.conversations[0]?.id ?? null
    : workspaceConversations.some((conversation) => conversation.id === selectedId) ? selectedId : workspaceConversations[0]?.id;
  const selectedConversation = useMemo(() => (liveController
    ? (liveController.selectedConversation
      ? { ...liveController.selectedConversation, messages: liveController.messages }
      : workspaceConversations.find((conversation) => conversation.id === workspaceSelectedId)
        ?? ((contentSpace === "messages" || showCollabConversation) ? null : demoConversations[0]))
    : workspaceConversations.find((conversation) => conversation.id === workspaceSelectedId)
      ?? workspaceConversations[0]
      ?? demoConversations[0]), [
    contentSpace,
    showCollabConversation,
    conversations,
    liveController,
    selectedId,
    workspaceConversations,
    workspaceSelectedId,
  ]);

  // Live conversations can arrive after the loading screen has mounted.
  // Initialize the saved width and observer when the actual rail becomes available.
  const hasContactRail = Boolean(selectedConversation);
  useLayoutEffect(() => {
    if (!hasContactRail || typeof window === "undefined" || window.matchMedia("(max-width: 760px)").matches) return;
    const initialWidth = preferredContactRailWidthRef.current
      ?? readStoredContactRailWidth()
      ?? conversationRailRef.current?.getBoundingClientRect().width
      ?? defaultContactRailWidth();
    applyContactRailWidth(initialWidth);
  }, [applyContactRailWidth, hasContactRail]);

  useEffect(() => {
    if (!hasContactRail || typeof window === "undefined") return undefined;
    const workspace = workspaceRef.current;
    if (!workspace) return undefined;

    const handleWorkspaceResize = () => {
      if (window.matchMedia("(max-width: 760px)").matches) return;
      const { minimum, maximum } = getContactRailBounds();
      const preferredWidth = preferredContactRailWidthRef.current ?? readStoredContactRailWidth() ?? defaultContactRailWidth();
      const nextWidth = clampContactRailWidth(preferredWidth, minimum, maximum);
      renderedContactRailWidthRef.current = nextWidth;
      setContactRailMinWidth(minimum);
      setContactRailMaxWidth(maximum);
      setContactRailWidth(nextWidth);
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(handleWorkspaceResize);
    observer?.observe(workspace);
    window.addEventListener("resize", handleWorkspaceResize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", handleWorkspaceResize);
    };
  }, [getContactRailBounds, hasContactRail]);

  useEffect(() => {
    if (!liveController && workspaceSelectedId && workspaceSelectedId !== selectedId) setSelectedId(workspaceSelectedId);
  }, [liveController, selectedId, workspaceSelectedId]);

  useEffect(() => {
    setReplyingTo(null);
    setForwardingMessage(null);
  }, [workspaceSelectedId]);

  const attachmentController = liveController?.attachments;
  const liveAttachmentItems = useMemo(() => {
    if (!attachmentController || !liveAttachmentDraft) return [];
    const ids = new Set(liveAttachmentDraft.itemIds);
    return attachmentController.queue.filter((item) => ids.has(item.id));
  }, [attachmentController, liveAttachmentDraft]);

  const sendLiveAttachmentDraft = useCallback(async () => {
    const draft = liveAttachmentDraft;
    if (!selectedConversation || !attachmentController || !draft || liveAttachmentSending
      || liveAttachmentSendRef.current) return;
    if (liveAttachmentItems.length !== draft.itemIds.length
      || liveAttachmentItems.some((item) => item.status !== "ready")) return;
    liveAttachmentSendRef.current = draft.clientMessageId;
    setLiveAttachmentSending(true);
    try {
      const result = await attachmentController.sendReadyMessage({
        conversationId: selectedConversation.id,
        clientMessageId: draft.clientMessageId,
        kind: draft.kind,
        body: draft.body,
        payload: draft.payload,
        attachmentItemIds: draft.itemIds,
        attachmentDetails: draft.attachmentDetails,
      });
      if (!result) {
        setNotice("L’envoi n’a pas abouti. Les fichiers restent prêts pour réessayer.");
        return;
      }
      if (soundsEnabled && !selectedConversation.muted) void playMessageSound("send");
      attachmentController.clearSent?.();
      setLiveAttachmentDraft(null);
      setShowAttachments(false);
    } catch {
      setNotice("L’envoi n’a pas abouti. Les fichiers restent prêts pour réessayer.");
    } finally {
      if (liveAttachmentSendRef.current === draft.clientMessageId) {
        liveAttachmentSendRef.current = null;
      }
      setLiveAttachmentSending(false);
    }
  }, [attachmentController, liveAttachmentDraft, liveAttachmentItems, liveAttachmentSending, selectedConversation, soundsEnabled]);

  useEffect(() => {
    if (!liveAttachmentDraft?.autoSend || liveAttachmentSending) return;
    if (liveAttachmentItems.length !== liveAttachmentDraft.itemIds.length
      || liveAttachmentItems.some((item) => item.status !== "ready")) return;
    const clientMessageId = liveAttachmentDraft.clientMessageId;
    setLiveAttachmentDraft((current) => current?.clientMessageId === clientMessageId
      ? { ...current, autoSend: false }
      : current);
    void sendLiveAttachmentDraft();
  }, [liveAttachmentDraft, liveAttachmentItems, liveAttachmentSending, sendLiveAttachmentDraft]);

  useEffect(() => {
    if (!liveController || liveController.selectedConversationId || liveController.inboxStatus !== "ready") return;
    const firstConversationId = liveController.conversations[0]?.id;
    if (firstConversationId) void liveController.selectConversation(firstConversationId);
  }, [liveController]);

  useEffect(() => {
    if (newConversationSignal !== lastNewConversationSignal.current) {
      lastNewConversationSignal.current = newConversationSignal;
      setShowNewConversation(true);
    }
  }, [newConversationSignal]);

  useEffect(() => {
    onConversationsChangeRef.current?.(conversations);
  }, [conversations]);

  useEffect(() => {
    if (!liveController) return;
    setShowAttachments(false);
    setAttachmentMode(null);
    setLiveAttachmentDraft(null);
    cancelVoiceRecording();
  // The live/demo mode is a page-level runtime decision; controller callbacks
  // may change during normal renders without requiring another reset.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(liveController)]);

  useEffect(() => {
    setConversationSearch("");
    setUnreadOnly(false);
    setRailMenuOpen(false);
    setShowAllConversations(false);
  }, [activeSpace]);

  useEffect(() => {
    if (contentSpace === "messages") return;
    setDrawerOpen(false);
    setShowAttachments(false);
    setAttachmentMode(null);
    setViewerMessage(null);
  }, [contentSpace]);

  useEffect(() => {
    if (!openRequest) return;
    if (liveController) {
      onRequestConsumed?.();
      return;
    }
    setConversations((current) => {
      const existing = current.find((conversation) => conversation.id === openRequest.id);
      if (existing) {
        return openRequest.conversation
          ? current.map((conversation) => conversation.id === openRequest.id ? openRequest.conversation! : conversation)
          : current;
      }
      const created: DemoConversation = openRequest.conversation ?? {
        id: openRequest.id,
        name: openRequest.name,
        handle: openRequest.group ? "Groupe d'artistes" : `@${openRequest.name.toLowerCase().replace(/\s+/g, "_")}`,
        role: openRequest.role,
        avatar: openRequest.avatar ?? "/images/messaging/groups/group_1.png",
        status: openRequest.status,
        online: true,
        gradeLevel: openRequest.gradeLevel ?? (openRequest.group ? undefined : 1),
        unread: 0,
        preview: "Conversation ouverte depuis la messagerie.",
        time: "Maintenant",
        messages: [{ id: `open-${openRequest.token}`, author: "them", kind: "text", body: openRequest.group ? `Bienvenue dans le chat de ${openRequest.name}.` : `La collaboration avec ${openRequest.name} est prête.`, time: "Maintenant" }],
      };
      return [created, ...current];
    });
    setSelectedId(openRequest.id);
    onRequestConsumed?.();
  }, [liveController, openRequest, onRequestConsumed]);

  useLayoutEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    timeline.scrollTop = timeline.scrollHeight;
  }, [workspaceSelectedId, selectedConversation?.messages.length]);

  useEffect(() => () => {
    recordingRequestRef.current += 1;
    discardRecordingRef.current = true;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    ownedMediaUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    ownedMediaUrlsRef.current.clear();
  }, []);

  const visibleConversations = useMemo(
    () => [...workspaceConversations]
      .sort((a, b) => {
        const pinnedOrder = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
        if (pinnedOrder !== 0) return pinnedOrder;
        const newContactOrder = Number(seedConversationIds.has(a.id)) - Number(seedConversationIds.has(b.id));
        if (newContactOrder !== 0) return newContactOrder;
        const aIndex = referenceConversationOrder.indexOf(a.id);
        const bIndex = referenceConversationOrder.indexOf(b.id);
        if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex);
        return 0;
      })
      .filter((conversation) => liveController || showAllConversations || conversationSearch.trim() || unreadOnly || !seedConversationIds.has(conversation.id) || conversation.id === workspaceSelectedId || referenceConversationOrder.includes(conversation.id))
      .filter((conversation) => !unreadOnly || conversation.unread > 0)
      .filter((conversation) => `${conversation.name} ${conversation.preview} ${conversation.role}`.toLocaleLowerCase("fr-FR").includes(conversationSearch.trim().toLocaleLowerCase("fr-FR"))),
    [conversationSearch, liveController, showAllConversations, unreadOnly, workspaceConversations, workspaceSelectedId],
  );

  const filteredRailItems = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase("fr-FR");
    return railItems
      .filter((item) => !unreadOnly || (item.unread ?? 0) > 0)
      .filter((item) => `${item.name} ${item.preview} ${item.role} ${item.status}`.toLocaleLowerCase("fr-FR").includes(query));
  }, [conversationSearch, railItems, unreadOnly]);

  const visibleRailItems = useMemo(
    () => showAllConversations || conversationSearch.trim() || unreadOnly ? filteredRailItems : filteredRailItems.slice(0, 9),
    [conversationSearch, filteredRailItems, showAllConversations, unreadOnly],
  );

  const usesConversationRail = activeSpace === "messages";
  const selectedContextItem = railItems.find((item) => item.key === selectedRailKey) ?? null;

  const visibleMessages = useMemo(() => {
    if (!selectedConversation) return [];
    if (!messageSearch.trim()) return selectedConversation.messages;
    return selectedConversation.messages.filter((message) => `${message.body} ${message.fileName ?? ""}`.toLowerCase().includes(messageSearch.toLowerCase()));
  }, [messageSearch, selectedConversation]);

  const messagesById = useMemo(
    () => new Map(selectedConversation?.messages.map((message) => [message.id, message]) ?? []),
    [selectedConversation],
  );

  const updateConversation = (id: string, update: (conversation: DemoConversation) => DemoConversation) => {
    setConversations((current) => current.map((conversation) => conversation.id === id ? update(conversation) : conversation));
  };

  const selectConversation = (id: string) => {
    if (liveController) {
      liveAttachmentDraft?.itemIds.forEach((itemId) => { void attachmentController?.discard(itemId); });
      setLiveAttachmentDraft(null);
      setMessageSearch("");
      setDrawerOpen(false);
      void liveController.selectConversation(id);
      return;
    }
    setSelectedId(id);
    setMessageSearch("");
    setDrawerOpen(false);
    updateConversation(id, (conversation) => ({ ...conversation, unread: 0 }));
  };

  const appendMessage = (message: DemoMessage) => {
    if (!selectedConversation) return;
    if (liveController) {
      setNotice("Ce format n’est pas encore disponible dans la messagerie synchronisée.");
      return;
    }
    updateConversation(selectedConversation.id, (conversation) => ({ ...conversation, messages: [...conversation.messages, message], preview: message.fileName ?? message.body, time: "Maintenant" }));
    if (soundsEnabled && !selectedConversation.muted) void playMessageSound("send");
  };

  const toggleReaction = (messageId: string, reaction: string) => {
    if (!selectedConversation) return;
    const emoji = reaction.trim().split(/\s+/u)[0] ?? reaction;
    if (liveController) {
      const active = liveController.isReactionActiveByMe?.(messageId, emoji) ?? false;
      void liveController.setReaction(messageId, emoji, !active);
      return;
    }
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) => {
        if (message.id !== messageId) return message;
        const reactions = message.reactions ?? [];
        const currentReaction = reactions.find((item) => (item.trim().split(/\s+/u)[0] ?? item) === emoji);
        const nextReactions = currentReaction
          ? reactions.filter((item) => item !== currentReaction)
          : [...reactions, `${emoji} 1`];
        return { ...message, reactions: nextReactions };
      }),
    }));
  };

  const copyMessage = async (message: MessagingWorkspaceMessage) => {
    const copied = await copyMessageToClipboard(message);
    setNotice(copied ? "Message copié." : "La copie n’est pas disponible dans ce navigateur.");
  };

  const pinMessage = async (message: MessagingWorkspaceMessage) => {
    if (!selectedConversation) return;
    const nextPinned = !message.pinned;
    if (liveController) {
      if (!liveController.pinMessage) {
        setNotice("L’épinglage de messages n’est pas disponible dans cette session.");
        return;
      }
      try {
        const result = await liveController.pinMessage(message.id, nextPinned);
        if (result === false) return;
        setNotice(nextPinned ? "Message épinglé." : "Message désépinglé.");
      } catch {
        setNotice("L’épinglage de ce message a échoué.");
      }
      return;
    }
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      messages: conversation.messages.map((item) => item.id === message.id ? { ...item, pinned: nextPinned } : item),
    }));
    setNotice(nextPinned ? "Message épinglé." : "Message désépinglé.");
  };

  const deleteMessage = async (message: MessagingWorkspaceMessage) => {
    if (!selectedConversation || message.author !== "me") return;
    if (liveController) {
      if (!liveController.deleteMessage) {
        setNotice("La suppression de messages n’est pas disponible dans cette session.");
        return;
      }
      try {
        const result = await liveController.deleteMessage(message.id);
        if (result === false) return;
        setReplyingTo((current) => current?.id === message.id ? null : current);
        setNotice("Message supprimé.");
      } catch {
        setNotice("La suppression de ce message a échoué.");
      }
      return;
    }
    updateConversation(selectedConversation.id, (conversation) => ({
      ...conversation,
      preview: conversation.messages[conversation.messages.length - 1]?.id === message.id ? "Message supprimé" : conversation.preview,
      messages: conversation.messages.map((item) => item.id === message.id ? {
        ...item,
        kind: "text",
        body: "Message supprimé",
        fileName: undefined,
        fileType: undefined,
        mediaUrl: undefined,
        tracks: undefined,
        trackDurations: undefined,
        trackMediaUrls: undefined,
        attachments: undefined,
        reactions: undefined,
        deleted: true,
      } : item),
    }));
    setReplyingTo((current) => current?.id === message.id ? null : current);
    setNotice("Message supprimé.");
  };

  const forwardMessage = async (targetConversationId: string) => {
    if (!selectedConversation || !forwardingMessage) return false;
    const targetConversation = workspaceConversations.find((conversation) => conversation.id === targetConversationId);
    if (!targetConversation) return false;
    if (targetConversation.readOnlyReason) {
      setNotice(targetConversation.readOnlyReason);
      return false;
    }
    if (liveController) {
      if (!liveController.forwardMessage) {
        setNotice("Le transfert de messages n’est pas disponible dans cette session.");
        setForwardingMessage(null);
        return false;
      }
      try {
        const result = await liveController.forwardMessage(forwardingMessage.id, targetConversationId);
        if (result === false) return false;
        setNotice(`Message transféré à ${targetConversation.name}.`);
        return true;
      } catch {
        setNotice("Le transfert de ce message a échoué.");
        return false;
      }
    }
    const now = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const forwarded: DemoMessage = {
      id: `message-forward-${Date.now()}`,
      author: "me",
      kind: "text",
      body: forwardingMessage.fileName ?? forwardingMessage.body,
      time: now,
      pinned: false,
      deleted: false,
      forwardedFrom: selectedConversation.name,
    };
    updateConversation(targetConversationId, (conversation) => ({
      ...conversation,
      messages: [...conversation.messages, forwarded],
      preview: forwarded.fileName ?? forwarded.body,
      time: "Maintenant",
    }));
    setNotice(`Message transféré à ${targetConversation.name}.`);
    return true;
  };

  const sendText = () => {
    const body = composer.trim();
    if (!body) return;
    if (selectedConversation?.readOnlyReason) {
      setNotice(selectedConversation.readOnlyReason);
      return;
    }
    if (liveController) {
      setComposer("");
      const replyToMessageId = replyingTo?.id ?? null;
      setReplyingTo(null);
      const muted = Boolean(selectedConversation?.muted);
      void Promise.resolve(liveController.sendText(body, replyToMessageId)).then((result) => {
        if (result && soundsEnabled && !muted) void playMessageSound("send");
      }).catch(() => {
        // Le contrôleur synchronisé expose déjà l'échec dans l'interface.
      });
      return;
    }
    appendMessage({ id: `message-${Date.now()}`, author: "me", kind: "text", body, time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }), replyToId: replyingTo?.id });
    setComposer("");
    setReplyingTo(null);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendText();
    }
  };

  const startFilePicker = (kind: DemoMessageKind, accept: string) => {
    if (liveController && !attachmentController) {
      setShowAttachments(false);
      setNotice("Le stockage sécurisé n’est pas disponible dans cette session.");
      return;
    }
    setPendingFileKind(kind);
    setFileAccept(accept);
    setShowAttachments(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (liveController) {
      event.target.value = "";
      if (!file || !selectedConversation || !attachmentController) {
        setNotice("Aucun fichier n’a été envoyé : le stockage sécurisé est indisponible.");
        return;
      }
      const itemId = attachmentController.enqueue({
        conversationId: selectedConversation.id,
        file,
        purpose: purposeForMessageKind(pendingFileKind),
      });
      if (!itemId) {
        setNotice("Ce fichier n’a pas pu être ajouté à la file d’envoi.");
        return;
      }
      setLiveAttachmentDraft({
        clientMessageId: createClientMessageId(),
        itemIds: [itemId],
        kind: structuredKindForMessage(pendingFileKind),
        body: file.name,
        attachmentDetails: {
          [itemId]: {
            role: pendingFileKind === "file" ? "document" : "primary",
            label: file.name,
          },
        },
      });
      return;
    }
    if (!file) return;
    const mediaUrl = URL.createObjectURL(file);
    ownedMediaUrlsRef.current.add(mediaUrl);
    const duration = pendingFileKind === "audio-file" ? formatDuration(await readAudioDuration(mediaUrl)) : undefined;
    appendMessage({ id: `file-${Date.now()}`, author: "me", kind: pendingFileKind, body: file.name, fileName: file.name, fileType: `${file.type || "Fichier"} · ${(file.size / 1024 / 1024).toFixed(1)} Mo`, duration, mediaUrl, time: "Maintenant" });
    event.target.value = "";
  };

  const stopRecordingStream = () => {
    recordingStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordingStreamRef.current = null;
  };

  const startVoiceRecording = async () => {
    if (liveController && !attachmentController) {
      setNotice("Le stockage sécurisé des notes vocales est indisponible dans cette session.");
      return;
    }
    const requestId = recordingRequestRef.current + 1;
    recordingRequestRef.current = requestId;
    setRecordingError(null);
    setRecordedVoice(null);
    setRecordingStatus("requesting");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("L'enregistrement vocal n'est pas disponible dans ce navigateur.");
      setRecordingStatus("error");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (requestId !== recordingRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);
      recordingStreamRef.current = stream;
      recorderRef.current = recorder;
      recordingChunksRef.current = [];
      discardRecordingRef.current = false;

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      });
      recorder.addEventListener("error", () => {
        stopRecordingStream();
        if (discardRecordingRef.current) return;
        setRecordingError("Le micro a interrompu l'enregistrement. Réessaie.");
        setRecordingStatus("error");
      });
      recorder.addEventListener("stop", () => {
        stopRecordingStream();
        recorderRef.current = null;
        if (discardRecordingRef.current) {
          recordingChunksRef.current = [];
          setRecordingStatus("idle");
          return;
        }
        const chunks = recordingChunksRef.current;
        recordingChunksRef.current = [];
        if (chunks.length === 0) {
          setRecordingError("Aucun son n'a été enregistré. Vérifie ton micro et réessaie.");
          setRecordingStatus("error");
          return;
        }
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const mediaUrl = URL.createObjectURL(blob);
        ownedMediaUrlsRef.current.add(mediaUrl);
        const durationMs = Math.max(1_000, Math.round(performance.now() - recordingStartedAtRef.current));
        const duration = formatDuration(durationMs / 1_000);
        const extension = blob.type.startsWith("audio/ogg") ? "ogg" : "webm";
        const file = new globalThis.File([blob], `note-vocale-${Date.now()}.${extension}`, { type: blob.type });
        setRecordedVoice({ mediaUrl, duration, durationMs, file });
        setRecordingStatus("ready");
      });

      recordingStartedAtRef.current = performance.now();
      recorder.start();
      setRecordingStatus("recording");
    } catch (error) {
      stopRecordingStream();
      const permissionDenied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      setRecordingError(permissionDenied ? "Autorise l'accès au micro pour enregistrer une note vocale." : "Impossible d'ouvrir le micro. Vérifie qu'il n'est pas déjà utilisé.");
      setRecordingStatus("error");
    }
  };

  const stopVoiceRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  const cancelVoiceRecording = () => {
    recordingRequestRef.current += 1;
    discardRecordingRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopRecordingStream();
    if (recordedVoice) {
      URL.revokeObjectURL(recordedVoice.mediaUrl);
      ownedMediaUrlsRef.current.delete(recordedVoice.mediaUrl);
    }
    setRecordedVoice(null);
    setRecordingError(null);
    setRecordingStatus("idle");
  };

  const sendRecordedVoice = () => {
    if (!recordedVoice) return;
    if (liveController) {
      if (!selectedConversation || !attachmentController) {
        setNotice("La note vocale n’a pas été envoyée : stockage indisponible.");
        return;
      }
      const itemId = attachmentController.enqueue({
        conversationId: selectedConversation.id,
        file: recordedVoice.file,
        purpose: "voice_note",
        durationMs: recordedVoice.durationMs,
      });
      if (!itemId) {
        setNotice("La note vocale n’a pas pu être ajoutée à la file d’envoi.");
        return;
      }
      setLiveAttachmentDraft({
        clientMessageId: createClientMessageId(),
        itemIds: [itemId],
        kind: "audio",
        body: "Note vocale",
        attachmentDetails: { [itemId]: { role: "primary", label: "Note vocale" } },
        autoSend: true,
      });
      URL.revokeObjectURL(recordedVoice.mediaUrl);
      ownedMediaUrlsRef.current.delete(recordedVoice.mediaUrl);
      setRecordedVoice(null);
      setRecordingStatus("idle");
      return;
    }
    appendMessage({ id: `voice-${Date.now()}`, author: "me", kind: "audio", body: "Note vocale", duration: recordedVoice.duration, mediaUrl: recordedVoice.mediaUrl, time: "Maintenant" });
    setRecordedVoice(null);
    setRecordingStatus("idle");
  };

  const submitComposerAttachment = async (
    message: DemoMessage,
    files: File[],
    payload: Record<string, MessagingJson>,
  ) => {
    if (!liveController) {
      message.trackMediaUrls?.filter(Boolean).forEach((url) => ownedMediaUrlsRef.current.add(url));
      appendMessage(message);
      setAttachmentMode(null);
      return;
    }
    if (!selectedConversation || !attachmentController) {
      setNotice("Ce contenu n’a pas été envoyé : stockage sécurisé indisponible.");
      return;
    }
    if (message.kind === "brief") {
      const signature = JSON.stringify({
        conversationId: selectedConversation.id,
        body: message.body,
        payload,
      });
      if (pendingBriefAttemptRef.current?.signature !== signature) {
        pendingBriefAttemptRef.current = {
          signature,
          clientMessageId: createClientMessageId(),
        };
      }
      if (liveAttachmentSendRef.current) return;
      const clientMessageId = pendingBriefAttemptRef.current.clientMessageId;
      liveAttachmentSendRef.current = clientMessageId;
      setLiveAttachmentSending(true);
      try {
        const result = await attachmentController.sendReadyMessage({
          conversationId: selectedConversation.id,
          clientMessageId,
          kind: "brief",
          body: message.body,
          payload,
          attachmentItemIds: [],
        });
        if (!result) {
          setNotice("Le brief n’a pas été envoyé. Réessaie.");
          return;
        }
        if (soundsEnabled && !selectedConversation.muted) void playMessageSound("send");
        pendingBriefAttemptRef.current = null;
        setAttachmentMode(null);
      } catch {
        setNotice("Le brief n’a pas été envoyé. Réessaie.");
      } finally {
        if (liveAttachmentSendRef.current === clientMessageId) {
          liveAttachmentSendRef.current = null;
        }
        setLiveAttachmentSending(false);
      }
      return;
    }
    const itemIds = files.flatMap((file, index) => {
      const durationSeconds = parseDuration(message.trackDurations?.[index] ?? "0:00");
      const itemId = attachmentController.enqueue({
        conversationId: selectedConversation.id,
        file,
        purpose: "track_stem",
        durationMs: durationSeconds > 0 ? Math.round(durationSeconds * 1_000) : null,
      });
      return itemId ? [itemId] : [];
    });
    if (itemIds.length !== files.length || itemIds.length === 0) {
      itemIds.forEach((itemId) => { void attachmentController.discard(itemId); });
      setNotice("Le Track Pack n’a pas pu être préparé.");
      return;
    }
    const details = Object.fromEntries(itemIds.map((itemId, index) => [itemId, {
      role: "stem" as const,
      label: message.tracks?.[index] ?? files[index].name,
    }]));
    message.trackMediaUrls?.filter(Boolean).forEach((url) => URL.revokeObjectURL(url));
    setLiveAttachmentDraft({
      clientMessageId: createClientMessageId(),
      itemIds,
      kind: "track_pack",
      body: message.body,
      payload,
      attachmentDetails: details,
    });
    setAttachmentMode(null);
  };

  const createConversation = (conversation: DemoConversation) => {
    if (liveController) return;
    setConversations((current) => current.some((item) => item.id === conversation.id) ? current : [conversation, ...current]);
    setSelectedId(conversation.id);
    setShowNewConversation(false);
  };

  const deleteConversation = async () => {
    if (!selectedConversation) return;
    if (liveController) {
      const removed = liveController.hideConversation
        ? await liveController.hideConversation(selectedConversation.id)
        : await liveController.archiveConversation(selectedConversation.id);
      if (!removed) return;
      setDrawerOpen(false);
      setNotice("Conversation retirée de ta liste.");
      return;
    }
    const remaining = conversations.filter((conversation) => conversation.id !== selectedConversation.id);
    setConversations(remaining);
    setSelectedId(remaining[0]?.id ?? "");
    setDrawerOpen(false);
    setNotice("Conversation supprimée de cette démonstration.");
  };

  if (!selectedConversation) {
    const isLoading = liveController?.inboxStatus === "loading";
    const loadError = liveController?.inboxError;
    return (
      <section className="mw-workspace is-empty">
        <header className="mw-chat-header">
          <span className="mw-chat-header__brand"><MeewavPillarBrand pillar="Messagerie" /></span>
          <MeewavPillarTabs className="messaging-pillar-tabs is-fine-indicator" items={messagingSpaces}
            activeId={activeSpace} ariaLabel="Espaces de la messagerie" onSelect={(space) => onSpaceChange?.(space)} />
        </header>
        <aside className="mw-conversation-rail"><div className="mw-list-empty">Aucune conversation</div></aside>
        <section className="mw-chat-scene mw-empty-workspace">
          <MessageSquareIcon />
          <h2>{isLoading ? "Chargement de tes conversations…" : loadError ? "Impossible de charger la messagerie" : "Aucune conversation pour le moment"}</h2>
          {!isLoading && !loadError && <p>Retrouve un ami sur Meewav pour commencer à échanger.</p>}
          {loadError && <span role="alert">{loadError}</span>}
          {loadError
            ? <button type="button" onClick={() => void liveController?.retryInbox()}><Search /> Réessayer</button>
            : !isLoading && <button type="button" onClick={() => setShowNewConversation(true)}><UserPlus /> Trouver un ami</button>}
        </section>
        {showNewConversation && <NewConversationDialog conversations={workspaceConversations} live={liveController} onClose={() => setShowNewConversation(false)} onCreate={createConversation} />}
        {(notice || liveController?.actionError) && <div className="mw-notice" role="status"><span>{notice ?? liveController?.actionError}</span><button type="button" onClick={() => { setNotice(null); liveController?.clearActionError?.(); }} aria-label="Fermer"><X /></button></div>}
      </section>
    );
  }

  const isMessageContent = contentSpace === "messages" || showCollabConversation;
  const contextFallbacks: Record<Exclude<MessagingTab, "messages">, MessagingSidebarItem> = {
    collabs: { key: "collabs:overview", id: "overview", space: "collabs", name: "Collaborations", avatar: "/images/messaging/avatars/avatar_7.png", role: "Demandes et connexions", status: "Reçues, envoyées et acceptées", preview: "Collaborations Meewav", time: "" },
    projects: { key: "projects:overview", id: "overview", space: "projects", name: "Projets", avatar: "/images/messaging/groups/group_2.png", role: "Productions partagées", status: "Stems, tâches et échanges", preview: "Projets musicaux", time: "" },
    groups: { key: "groups:overview", id: "overview", space: "groups", name: "Groupes d’artistes", avatar: "/images/messaging/groups/group_1.png", role: "Équipes durables", status: "Sessions, décisions et performances", preview: "Collectifs Meewav", time: "" },
  };
  const showsContextIdentity = !isMessageContent && contentSpace !== "collabs";
  const contextHeaderItem = showsContextIdentity
    ? selectedContextItem?.space === contentSpace ? selectedContextItem : contextFallbacks[contentSpace]
    : null;
  const isRailSearchFirst = isMessageContent || contentSpace === "collabs";

  return (
    <section
      className={`mw-workspace${isContactRailResizing ? " is-contact-rail-resizing" : ""}${isContactRailCompact ? " is-contact-rail-compact" : ""}`}
      ref={workspaceRef}
      style={contactRailWidth === null ? undefined : { "--mw-contact-rail-width": `${contactRailWidth}px` } as CSSProperties}
    >
      <header className="mw-chat-header">
        <span className="mw-chat-header__brand"><MeewavPillarBrand pillar="Messagerie" /></span>
        <MeewavPillarTabs
          className="messaging-pillar-tabs is-fine-indicator"
          items={messagingSpaces}
          activeId={activeSpace}
          ariaLabel="Espaces de la messagerie"
          onSelect={(space) => onSpaceChange?.(space)}
        />
        {(isMessageContent || (contentSpace === "groups" && onCreateGroup)) && (
          <nav className="mw-chat-header__utility" aria-label={isMessageContent ? "Actions et contact de la conversation" : "Actions des groupes"}>
            {isMessageContent && (
              <span className="mw-chat-header__identity" title={selectedConversation.name}>
                <span className="mw-chat-header__contact">
                  <ConversationAvatar conversation={selectedConversation} showPresence={false} />
                </span>
                <span className="mw-chat-header__identity-text">
                  <strong>{selectedConversation.name}</strong>
                  <small>{selectedConversation.online ? "En ligne" : selectedConversation.role}</small>
                </span>
              </span>
            )}
            {isMessageContent && (
              <span className="mw-chat-header__actions">
                <button type="button" className="mw-icon-button" data-conversation-drawer-trigger aria-expanded={drawerOpen} aria-controls="mw-conversation-drawer" onClick={() => setDrawerOpen((open) => !open)} aria-label="Rechercher dans la conversation"><Search /></button>
                <button type="button" className="mw-icon-button" disabled={!liveController || Boolean(selectedConversation.readOnlyReason) || selectedConversation.conversationKind !== "direct"} title="Appeler ce contact" aria-label="Appel audio" onClick={() => requestDirectCall(selectedConversation.id, "audio")}><Phone /></button>
                <button type="button" className="mw-icon-button" disabled={!liveController || Boolean(selectedConversation.readOnlyReason) || selectedConversation.conversationKind !== "direct"} title="Appeler ce contact en vidéo" aria-label="Appel vidéo" onClick={() => requestDirectCall(selectedConversation.id, "video")}><Video /></button>
                <button type="button" className="mw-icon-button" data-conversation-drawer-trigger aria-expanded={drawerOpen} aria-controls="mw-conversation-drawer" onClick={() => setDrawerOpen((open) => !open)} aria-label="Options de la conversation"><Info /></button>
              </span>
            )}
            {contentSpace === "groups" && onCreateGroup && (
              <button type="button" className="mw-chat-header__primary-action" onClick={onCreateGroup}>
                <Users />
                <span>Créer un groupe</span>
              </button>
            )}
          </nav>
        )}
      </header>

      <aside className="mw-conversation-rail" id="mw-conversation-rail" ref={conversationRailRef}>
        <div className={`mw-rail-controls${isRailSearchFirst ? " is-search-first" : ""}`}>
          {showsContextIdentity && contextHeaderItem && (
            <div className="mw-rail-context-identity">
              <><SidebarItemAvatar item={contextHeaderItem} showPresence={false} /><span><span className="mw-chat-header__name-line"><strong>{contextHeaderItem.name}</strong>{contextHeaderItem.gradeLevel !== undefined && <MeewavGradeBadge className="mw-chat-header__grade" level={contextHeaderItem.gradeLevel} size="xs" variant="icon" />}</span><small><i className={contextHeaderItem.online ? "is-online" : ""} /> {contextHeaderItem.status}<b>{contextHeaderItem.role}</b></small></span></>
            </div>
          )}
          <div className="mw-rail-search-wrap">
            <button
              type="button"
              className="mw-rail-compact-action mw-rail-expand"
              aria-label="Agrandir la liste pour rechercher"
              title="Rechercher dans la liste"
              onClick={() => {
                expandContactRail();
                window.requestAnimationFrame(() => conversationSearchRef.current?.focus());
              }}
            ><Search /></button>
            <label className="mw-rail-search">
              <Search />
              <input ref={conversationSearchRef} aria-label="Rechercher dans la liste" value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Rechercher..." />
              {conversationSearch && <button type="button" onClick={() => setConversationSearch("")} aria-label="Effacer la recherche"><X /></button>}
            </label>
            <button type="button" className={`mw-rail-tune ${unreadOnly ? "is-active" : ""}`} onClick={() => {
              if (isContactRailCompact && window.matchMedia("(min-width: 761px)").matches) expandContactRail();
              setRailMenuOpen((open) => !open);
            }} aria-expanded={railMenuOpen} aria-label="Filtres de la liste" title="Filtres de la liste"><SlidersHorizontal /></button>
            {railMenuOpen && (
              <div className="mw-rail-menu">
                <button type="button" onClick={() => { setUnreadOnly((value) => !value); setRailMenuOpen(false); }}><SlidersHorizontal /><span>{unreadOnly ? "Afficher toute la liste" : "Afficher les alertes"}</span></button>
                {activeSpace === "messages" && <button type="button" onClick={() => { setShowNewConversation(true); setRailMenuOpen(false); }}><UserPlus /><span>Nouvelle conversation</span></button>}
              </div>
            )}
          </div>

        </div>
        <div className="mw-conversation-list">
          {usesConversationRail && liveController && ((liveController.conversationInvitations?.length ?? 0) > 0 || liveController.invitationStatus === "error") && (
            <button type="button" className="mw-rail-compact-action mw-rail-invitations" onClick={expandContactRail} aria-label="Agrandir la liste pour consulter les invitations de groupe" title="Invitations de groupe">
              <Users /><b>{liveController.invitationStatus === "error" ? "!" : liveController.conversationInvitations?.length}</b>
            </button>
          )}
          {usesConversationRail && liveController && (liveController.conversationInvitations?.length ?? 0) > 0 && (
            <section className="mw-group-invitations" aria-label="Invitations aux conversations de groupe">
              <header><Users /><span><strong>Invitations de groupe</strong><small>{liveController.conversationInvitations?.length} en attente</small></span></header>
              {liveController.conversationInvitations?.map((invitation) => {
                const mutating = liveController.isInvitationMutating?.(invitation.conversation_id) ?? false;
                return (
                  <article key={invitation.conversation_id}>
                    <ConversationAvatar small conversation={{ avatar: invitation.inviter_avatar_url ?? "/avatars/utilisateur.png", online: false }} />
                    <span><strong>{invitation.title}</strong><small>Invité par {invitation.inviter_display_name} · {invitation.requested_member_count} membres</small></span>
                    <div>
                      <button type="button" disabled={mutating} onClick={() => void liveController.respondToInvitation?.(invitation.conversation_id, false)}>Refuser</button>
                      <button type="button" className="is-primary" disabled={mutating} onClick={() => void liveController.respondToInvitation?.(invitation.conversation_id, true)}>{mutating ? "…" : "Rejoindre"}</button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
          {usesConversationRail && liveController?.invitationStatus === "error" && (
            <div className="mw-invitation-error" role="alert"><span>{liveController.invitationError ?? "Invitations indisponibles."}</span><button type="button" onClick={() => void liveController.retryInvitations?.()}>Réessayer</button></div>
          )}
          {usesConversationRail && liveController?.inboxStatus === "loading" && visibleConversations.length === 0 && <div className="mw-list-empty"><Search /><strong>Chargement…</strong></div>}
          {usesConversationRail && liveController?.inboxStatus === "error" && <div className="mw-list-empty"><Info /><strong>Liste indisponible</strong><span>{liveController.inboxError}</span><button type="button" onClick={() => void liveController.retryInbox()}>Réessayer</button></div>}
          {usesConversationRail ? visibleConversations.map((conversation) => (
            <article key={conversation.id} className={selectedConversation.id === conversation.id ? "is-active" : ""}>
              <button type="button" className="mw-conversation-row" onClick={() => selectConversation(conversation.id)} title={conversation.name} aria-label={`${conversation.name}${conversation.unread > 0 ? `, ${conversation.unread} messages non lus` : ""}`} aria-current={selectedConversation.id === conversation.id ? "true" : undefined}>
                <ConversationAvatar conversation={conversation} />
                <span><span><strong>{conversation.name}</strong><small>{conversation.time}</small></span><em>{conversation.preview}</em><small>{conversation.role}</small></span>
                {conversation.unread > 0 && <b>{conversation.unread > 99 ? "99+" : conversation.unread}</b>}
              </button>
              <button type="button" className="mw-conversation-row__options" onClick={() => { selectConversation(conversation.id); setDrawerOpen(true); }} aria-label={`Options de ${conversation.name}`}><MoreHorizontal /></button>
            </article>
          )) : visibleRailItems.map((item) => (
            <article key={item.key} className={selectedRailKey === item.key ? "is-active" : ""} data-space={item.space}>
              <button type="button" className="mw-conversation-row" onClick={() => onRailItemSelect?.(item)} title={item.name} aria-label={`${item.name}${(item.unread ?? 0) > 0 ? `, ${item.unread} éléments non lus` : ""}`} aria-current={selectedRailKey === item.key ? "true" : undefined}>
                <SidebarItemAvatar item={item} />
                <span><span><strong>{item.name}</strong><small>{item.time}</small></span><em>{item.preview}</em><small>{item.role}</small></span>
                {(item.unread ?? 0) > 0 && <b>{(item.unread ?? 0) > 99 ? "99+" : item.unread}</b>}
              </button>
            </article>
          ))}
          {(usesConversationRail ? visibleConversations : visibleRailItems).length === 0 && <div className="mw-list-empty"><Search /><strong>Aucun résultat</strong><span>Essaie un autre filtre.</span></div>}
          {(usesConversationRail
            ? !liveController && visibleConversations.length > 0
            : filteredRailItems.length > 9 || showAllConversations) && (
            <button type="button" className="mw-conversation-more" onClick={() => { setUnreadOnly(false); setConversationSearch(""); setShowAllConversations((value) => !value); }}>{showAllConversations ? "Voir moins" : "Voir plus"}</button>
          )}
        </div>
        <div
          className={`mw-contact-rail-resizer${isContactRailResizing ? " is-active" : ""}`}
          role="separator"
          aria-label="Redimensionner la liste des conversations"
          aria-controls="mw-conversation-rail"
          aria-orientation="vertical"
          aria-valuemin={Math.round(contactRailMinWidth)}
          aria-valuemax={Math.round(contactRailMaxWidth)}
          aria-valuenow={Math.round(contactRailWidth ?? defaultContactRailWidth())}
          aria-valuetext={isContactRailCompact ? "Liste compacte, portraits uniquement" : `${Math.round(contactRailWidth ?? defaultContactRailWidth())} pixels`}
          tabIndex={0}
          title="Glisser vers la gauche pour ne garder que les portraits · Vers la droite pour agrandir · Double-cliquer pour réinitialiser"
          onPointerDown={startContactRailResize}
          onPointerMove={moveContactRailResize}
          onPointerUp={finishContactRailResize}
          onPointerCancel={finishContactRailResize}
          onLostPointerCapture={finishContactRailResize}
          onKeyDown={resizeContactRailWithKeyboard}
          onDoubleClick={resetContactRailWidth}
        />
      </aside>

      {isMessageContent ? <section className={`mw-chat-scene${conversationHeader ? " has-conversation-header" : ""}`}>
        {conversationHeader && <aside className="mw-conversation-header" aria-label="Demande de collaboration">{conversationHeader}</aside>}
        {marketplaceContext && (
          <aside className="mw-marketplace-context" aria-label="Contexte Marketplace">
            <span><Store aria-hidden="true" /></span>
            <div><small>Discussion liée à une annonce</small><strong>{marketplaceContext.listingTitle}</strong></div>
            <button type="button" onClick={marketplaceContext.onBack}>Retour à l’annonce</button>
          </aside>
        )}
        <div className="mw-chat-timeline" ref={timelineRef}>
          <div className="mw-chat-timeline__inner">
            {liveController?.messagesStatus === "loading" && visibleMessages.length === 0 && <div className="mw-search-empty"><Search /><span>Chargement des messages…</span></div>}
            {liveController?.messagesStatus === "error" && <div className="mw-search-empty"><Info /><span>{liveController.messagesError ?? "Impossible de charger les messages."}</span><button type="button" onClick={() => void liveController.retryMessages()}>Réessayer</button></div>}
            {visibleMessages.map((message, index) => {
              const next = visibleMessages[index + 1];
              const showTail = !next || next.author !== message.author;
              return <Fragment key={message.id}>{message.dayLabel && <div className="mw-day-marker"><span>{message.dayLabel}</span></div>}<MessageItem message={message} showTail={showTail} replyTarget={message.replyToId ? messagesById.get(message.replyToId) : undefined} conversationName={selectedConversation.name} onOpenTrackPack={setViewerMessage} onToggleReaction={toggleReaction} onReply={setReplyingTo} onCopy={(item) => { void copyMessage(item); }} onForward={setForwardingMessage} onPin={(item) => { void pinMessage(item); }} onDelete={message.author === "me" ? (item) => { void deleteMessage(item); } : undefined} onRetry={liveController ? (clientMessageId) => { void liveController.retryMessage(clientMessageId); } : undefined} resolveAttachmentUrl={attachmentController?.resolveUrl} /></Fragment>;
            })}
            {visibleMessages.length === 0 && liveController?.messagesStatus !== "loading" && liveController?.messagesStatus !== "error" && <div className="mw-search-empty"><Search /><span>{messageSearch ? `Aucun message ne correspond à « ${messageSearch} ».` : "Aucun message dans cette conversation."}</span></div>}
          </div>
        </div>

        <div className="mw-composer-zone">
          {showAttachments && (!liveController || attachmentController) && (
            <div className="mw-attachment-menu">
              <button type="button" className="is-featured" onClick={() => { setAttachmentMode("track-pack"); setShowAttachments(false); }}><TrackPackMark compact /><span><strong>Track Pack</strong><small>Envoie plusieurs pistes organisées</small></span></button>
              <div>{attachmentActions.map((action) => { const Icon = action.icon; return <button type="button" key={action.id} onClick={() => startFilePicker(action.id, action.accept)}><Icon /><span>{action.label}</span></button>; })}</div>
              <button type="button" className="is-brief" onClick={() => { setAttachmentMode("brief"); setShowAttachments(false); }}><Sparkles /><span><strong>Envoyer un brief</strong><small>Décris ce que tu recherches</small></span></button>
            </div>
          )}
          {liveController && liveAttachmentDraft && (
            <MessagingAttachmentQueuePanel
              items={liveAttachmentItems}
              onRetry={(itemId) => { void attachmentController?.retry(itemId); }}
              onDiscard={(itemId) => {
                void attachmentController?.discard(itemId);
                setLiveAttachmentDraft((current) => current
                  ? current.itemIds.length === 1
                    ? null
                    : { ...current, itemIds: current.itemIds.filter((id) => id !== itemId) }
                  : null);
              }}
              onSend={() => void sendLiveAttachmentDraft()}
            />
          )}
          {replyingTo && (
            <div className="mw-composer-reply" role="status">
              <CornerUpLeft aria-hidden="true" />
              <span>
                <small>Répondre à {replyingTo.author === "me" ? "vous" : selectedConversation.name}</small>
                <strong>{replyingTo.fileName ?? replyingTo.body}</strong>
              </span>
              <button type="button" onClick={() => setReplyingTo(null)} aria-label="Annuler la réponse"><X /></button>
            </div>
          )}
          {recordingStatus !== "idle" ? (
            <div className={`mw-recording-composer is-${recordingStatus}`}>
              <button type="button" onClick={cancelVoiceRecording} aria-label="Annuler l'enregistrement"><X /></button>
              {recordingStatus === "requesting" && <span><i /> Autorisation du micro…</span>}
              {recordingStatus === "recording" && <span><i /> Enregistrement en cours</span>}
              {recordingStatus === "ready" && recordedVoice && <RecordedVoicePreview voice={recordedVoice} />}
              {recordingStatus === "error" && <span className="mw-recording-error" role="alert">{recordingError}</span>}
              {recordingStatus === "recording" && <button type="button" onClick={stopVoiceRecording}><CircleStop /> Arrêter</button>}
              {recordingStatus === "ready" && <button type="button" onClick={sendRecordedVoice}><Send /> Envoyer</button>}
              {recordingStatus === "error" && <button type="button" onClick={() => void startVoiceRecording()}><Mic /> Réessayer</button>}
            </div>
          ) : (
            <div className="mw-composer-row">
              <div className={`mw-composer ${selectedConversation.readOnlyReason ? "is-read-only" : ""}`}>
                <button type="button" disabled={Boolean(selectedConversation.readOnlyReason)} onClick={() => liveController && !attachmentController ? setNotice("Le stockage sécurisé n’est pas disponible dans cette session.") : setShowAttachments((value) => !value)} aria-label="Ajouter une pièce jointe"><Paperclip /></button>
                <div className="mw-composer__field">
                  <MeeWavEmoticonComposer disabled={Boolean(selectedConversation.readOnlyReason)} value={composer} onChange={setComposer} onKeyDown={handleComposerKeyDown} maxLength={4_000} ariaLabel="Écrire un message" placeholder={selectedConversation.readOnlyReason ?? "Écris ton message..."} />
                  <MeeWavEmoticonPicker
                    triggerIcon={<Smile aria-hidden="true" />}
                    disabled={Boolean(selectedConversation.readOnlyReason)}
                    onSelect={(emoticon) => setComposer((value) => appendMeeWavEmoticon(value, emoticon.name, 4_000))}
                  />
                </div>
                <button type="button" disabled={Boolean(selectedConversation.readOnlyReason)} onClick={() => liveController && !attachmentController ? setNotice("Le stockage sécurisé n’est pas disponible dans cette session.") : setShowAttachments((value) => !value)} aria-label="Ajouter un contenu musical"><Music /></button>
                <button type="button" disabled={Boolean(selectedConversation.readOnlyReason)} onClick={() => void startVoiceRecording()} aria-label="Enregistrer une note vocale"><Mic /></button>
                <button type="button" disabled={Boolean(selectedConversation.readOnlyReason)} className={`mw-composer-send ${composer.trim() ? "is-ready" : ""}`} onClick={composer.trim() ? sendText : () => setNotice("Écris un message avant de l’envoyer.")} aria-label="Envoyer"><Send /></button>
              </div>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept={fileAccept} onChange={(event) => void handleFile(event)} hidden />
        </div>
      </section> : <section className="mw-context-pane" data-content-space={contentSpace}>{rightPane}</section>}

      {isMessageContent && drawerOpen && (
        <ConversationDrawer
          liveMode={Boolean(liveController)}
          conversation={selectedConversation}
          onClose={() => setDrawerOpen(false)}
          search={messageSearch}
          onSearch={setMessageSearch}
          onPin={() => {
            if (liveController) void liveController.togglePinned(selectedConversation.id, !selectedConversation.pinned);
            else updateConversation(selectedConversation.id, (conversation) => ({ ...conversation, pinned: !conversation.pinned }));
          }}
          onMute={() => {
            if (liveController) void liveController.toggleMuted(selectedConversation.id, !selectedConversation.muted);
            else updateConversation(selectedConversation.id, (conversation) => ({ ...conversation, muted: !conversation.muted }));
          }}
          onArchive={async () => {
            if (liveController) {
              const archived = await liveController.archiveConversation(selectedConversation.id);
              if (!archived) return;
              setDrawerOpen(false);
              setNotice("Conversation archivée.");
              return;
            }
            setConversations((current) => current.filter((conversation) => conversation.id !== selectedConversation.id));
            const next = conversations.find((conversation) => conversation.id !== selectedConversation.id);
            setSelectedId(next?.id ?? "");
            setDrawerOpen(false);
            setNotice("Conversation archivée.");
          }}
          onLeave={liveController?.leaveGroupConversation ? async () => {
            const left = await liveController.leaveGroupConversation?.(selectedConversation.id);
            if (!left) return;
            setDrawerOpen(false);
            setNotice("Tu as quitté le groupe.");
          } : undefined}
          onBlock={liveController?.canModerateCounterpart && liveController.blockCounterpart ? async () => {
            const blocked = await liveController.blockCounterpart?.();
            if (!blocked) return false;
            setDrawerOpen(false);
            setNotice(`${selectedConversation.name} a été bloqué.`);
            return true;
          } : undefined}
          onReport={liveController?.reportConversation ? async (category, comment) => {
            const reported = await liveController.reportConversation?.(category, comment);
            if (!reported) return false;
            setDrawerOpen(false);
            setNotice("Signalement envoyé à la modération.");
            return true;
          } : undefined}
          safetyBusy={liveController?.safetyMutating}
          onDelete={deleteConversation}
        />
      )}

      {showNewConversation && <NewConversationDialog conversations={workspaceConversations} live={liveController} onClose={() => setShowNewConversation(false)} onCreate={createConversation} />}
      {attachmentMode && (!liveController || attachmentController) && <ComposerDialog mode={attachmentMode} onClose={() => setAttachmentMode(null)} onSubmit={submitComposerAttachment} />}
      {viewerMessage && <TrackPackViewer message={viewerMessage} onClose={() => setViewerMessage(null)} />}
      {forwardingMessage && <MessageForwardDialog message={forwardingMessage} conversations={workspaceConversations} currentConversationId={selectedConversation.id} onClose={() => setForwardingMessage(null)} onForward={forwardMessage} />}
      {(notice || liveController?.actionError) && <div className="mw-notice" role="status"><span>{notice ?? liveController?.actionError}</span><button type="button" onClick={() => { setNotice(null); liveController?.clearActionError?.(); }} aria-label="Fermer"><X /></button></div>}
    </section>
  );
}

function MessageSquareIcon() {
  return <Music2 aria-hidden="true" />;
}
