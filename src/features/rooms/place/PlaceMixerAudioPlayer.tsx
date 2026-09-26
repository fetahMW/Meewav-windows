import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import {
  Repeat,
  Layers,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Globe2,
  Headphones,
  Images,
  Library,
  ListMusic,
  Music2,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Smartphone,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRuntime } from "../../../runtime/RuntimeProvider";
import { profileMediaRepository } from "../../profile/profile.media.service";
import { decodeAudioWaveform, type WaveformPeak } from "../tools/audio/previewWaveform";
import { PLACE_MIXER_FALLBACK_COVERS } from "./placeMixerCoverCatalog";
import type { PlaceLiveKitStatus } from "./placeLiveKit.service";
import { placeRoomTime } from "./placeRoomTime";
import { waitForPlaceMixerStart } from "./placeMixerStart";
import { useWaveTransport, useWaveTransportState } from "../wave-transport/WaveTransportProvider";
import type { WaveImportedAudio, WaveImportDestination } from "../wave-transport/WaveTransportProvider";
import WaveListeningSelector from "../wave-transport/WaveListeningSelector";
import { signedWaveAudienceUrl } from "../tools/audience/waveAudienceUpload.service";
import { WAVE_LOOP_CATEGORIES } from "../tools/waveLoopCategories";
import type { WaveLoopCategory } from "../tools/roomTools.types";
import { PlaceMixerCueControls, PlaceMixerLoopRange } from "./PlaceMixerLoopControls";
import PlaceMixerPlaybackMenu from "./PlaceMixerPlaybackMenu";
import { createMixerLoop, mixerLoopPosition, moveMixerLoopEdge, type PlaceMixerLoopRegion } from "./placeMixerLoop";
import type { PlaceAudioPlaybackState, PlaceAudioPreviewInput, PlaceAudioRoute, PlaceParticipant } from "./place.types";
import PlaceMixerRegie from "./PlaceMixerRegie";
import { useCageProduction } from "../tools/audio/CageProductionProvider";
import { createPlaceClientId } from "./placeClientId";
import "./place-mixer-play-finish.css";
import "./place-mixer-classroom-collapse.css";

type MixerAudioTrack = {
  id: string;
  title: string;
  displayTitle?: string;
  artist?: string;
  badge?: string;
  cover?: string;
  coverSeed?: string;
  src: string;
  durationSeconds: number;
  localObjectUrl?: boolean;
  fileName?: string;
  fileSize?: number;
  fileLastModified?: number;
  file?: File;
  waveDestination?: "base" | "player";
  waveCategory?: WaveLoopCategory;
  cageProductionReference?: string;
};

type PickerView = "closed" | "wave-destination" | "sources" | "library" | "setlists" | "covers" | "queue" | "playback";
type PlaybackMode = "ordered" | "shuffle" | "loop";

function keepImportFocus(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return;
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  const first = controls[0], last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

export type PlaceMixerProgramAudioTransport = {
  status: PlaceLiveKitStatus;
  musicAudible: boolean;
  musicGeneration: string | null;
  prepareMusicTrack: (track: MediaStreamTrack, generation: string) => Promise<boolean>;
  setMusicEnabled: (enabled: boolean) => Promise<boolean>;
  releaseMusicTrack: () => Promise<void>;
};

type PlaceMixerAudioPlayerProps = {
  roomId: string;
  ownerId: string | null;
  queueParticipants: PlaceParticipant[];
  musicGain: number;
  masterGain: number;
  publicMusicMuted: boolean;
  onPreviewPrepare: (preview: PlaceAudioPreviewInput) => Promise<boolean>;
  onPreviewMetadata: (preview: PlaceAudioPreviewInput) => Promise<boolean>;
  onRouteChange: (route: PlaceAudioRoute, generation: string) => Promise<boolean>;
  onPlaybackStateChange: (state: PlaceAudioPlaybackState, generation: string) => Promise<boolean>;
  programAudio?: PlaceMixerProgramAudioTransport;
  personalSend?: boolean;
  onPreviewLevel?: (level: number) => void;
  classroomCollapsible?: boolean;
  roomLabel?: string;
  onClassroomCollapsedChange?: (collapsed: boolean) => void;
};

type PlayerAudioGraph = {
  context: AudioContext;
  source: AudioNode;
  previewGain: GainNode;
  previewMeter: AnalyserNode;
  publicGain: GainNode;
  publicDestination: MediaStreamAudioDestinationNode;
  publicTrack: MediaStreamTrack;
};

const LIBRARY_TRACKS: MixerAudioTrack[] = [
  { id: "hazy-after-hours", title: "Hazy After Hours — version de répétition", displayTitle: "Hazy After Hours", artist: "Naya Oris", badge: "Version de répétition", src: "/media/preprofile-demo/hazy-after-hours.mp3", durationSeconds: 127 },
  { id: "tech-house-vibes", title: "Tech House Vibes — master de scène", displayTitle: "Tech House Vibes", artist: "Maya Nox", badge: "Master de scène", src: "/media/preprofile-demo/tech-house-vibes.mp3", durationSeconds: 102 },
  { id: "guitar-session", title: "Boucle guitare — session acoustique", displayTitle: "Boucle guitare", artist: "Lior Benali", badge: "Session acoustique", src: "/media/profile-demo/guitar-session-audio.mp3", durationSeconds: 12 },
  { id: "vocal-session", title: "Guide voix — dernière prise", displayTitle: "Guide voix", artist: "Naya Oris", badge: "Dernière prise", src: "/media/profile-demo/vocal-session-audio.mp3", durationSeconds: 12 },
];

const FALLBACK_SETLISTS = [
  { id: "set-night-session", title: "Session nocturne", tracks: [LIBRARY_TRACKS[0], LIBRARY_TRACKS[2], LIBRARY_TRACKS[3]] },
  { id: "set-showcase", title: "Showcase — ordre de passage", tracks: [LIBRARY_TRACKS[1], LIBRARY_TRACKS[0], LIBRARY_TRACKS[3]] },
];

const MIXER_WAVEFORM_BIN_COUNT = 120;

type StoredSetlist = {
  id: string;
  title: string;
  availableInMixer?: boolean;
  tracks?: Array<{ id: string; title: string; duration: string; sourceUrl?: string; cover?: string }>;
};

function secondsFromLabel(value?: string) {
  if (!value) return 0;
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function formatPreciseTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.000";
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(3).padStart(6, "0")}`;
}

function playedWaveformColor(index: number, lastPlayedIndex: number) {
  const ratio = lastPlayedIndex > 0 ? Math.min(1, index / lastPlayedIndex) : 0;
  const hue = Math.round(278 - ratio * 64);
  const lightness = Math.round(68 - ratio * 4);
  return `hsl(${hue} 94% ${lightness}%)`;
}

function waveformTrackIdentity(track: MixerAudioTrack) {
  return `${track.id}\u0000${track.src}`;
}

function waveformPeakHeight(peak: WaveformPeak) {
  const amplitude = Math.max(Math.abs(peak.min), Math.abs(peak.max));
  return Math.round(Math.min(1, Math.max(0, amplitude)) * 1_000) / 10;
}

function cloneTracks(tracks: MixerAudioTrack[], prefix: string) {
  return tracks.map((track, index) => ({
    ...track,
    coverSeed: track.coverSeed ?? track.id,
    id: `${prefix}-${track.id}-${index}`,
  }));
}

export default function PlaceMixerAudioPlayer({
  roomId,
  ownerId,
  queueParticipants,
  musicGain,
  masterGain,
  publicMusicMuted,
  onPreviewPrepare,
  onPreviewMetadata,
  onRouteChange,
  personalSend = false,
  onPreviewLevel,
  onPlaybackStateChange,
  programAudio,
  classroomCollapsible = false,
  roomLabel = "La Classe",
  onClassroomCollapsedChange,
}: PlaceMixerAudioPlayerProps) {
  const desktopDeck = useRuntime().isDesktop;
  const cageProduction = useCageProduction();
  const adoptedCageSource = useRef<string | null>(null);
  const waveTransport = useWaveTransport();
  const sharedWaveState = useWaveTransportState();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioGraphRef = useRef<PlayerAudioGraph | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlsRef = useRef(new Set<string>());
  const waveformCacheRef = useRef(new Map<string, readonly WaveformPeak[]>());
  const waveformDurationCacheRef = useRef(new Map<string, number>());
  const waveformAnalysisRef = useRef(new Map<string, Promise<readonly WaveformPeak[]>>());
  const selectedWaveformIdentityRef = useRef("");
  const [queue, setQueue] = useState<MixerAudioTrack[]>([]);
  const [libraryTracks, setLibraryTracks] = useState<MixerAudioTrack[]>(LIBRARY_TRACKS);
  const [setlists, setSetlists] = useState(FALLBACK_SETLISTS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentTrack = queue[currentIndex];
  const playerOnlySelected = Boolean(waveTransport && currentTrack?.waveDestination === "player");
  const waveEngine = playerOnlySelected ? undefined : waveTransport?.engine;
  const waveState = playerOnlySelected ? null : sharedWaveState;
  const [activeBaseTrackId, setActiveBaseTrackId] = useState("wave-reference");
  const [currentSeconds, setCurrentSeconds] = useState(0);
  const [cueSeconds, setCueSeconds] = useState(0);
  const [loopRegion, setLoopRegion] = useState<PlaceMixerLoopRegion | null>(null);
  const loopRegionRef = useRef<PlaceMixerLoopRegion | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [route, setRoute] = useState<PlaceAudioRoute>("preview");
  const [previewReady, setPreviewReady] = useState(false);
  const [routePending, setRoutePending] = useState(false);
  const [playbackPending, setPlaybackPending] = useState(false);
  const [countdownPending, setCountdownPending] = useState(false);
  const playbackStartAbortRef = useRef<AbortController | null>(null);
  const [publicTransportConfirmed, setPublicTransportConfirmed] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const previewRequestRef = useRef(0);
  const metadataCommitRef = useRef<string | null>(null);
  const failedTransportGenerationRef = useRef<string | null>(null);
  const routePendingRef = useRef(false);
  const playbackPendingRef = useRef(false);
  const safetyCallbacksRef = useRef({ onRouteChange, onPlaybackStateChange });
  const programAudioRef = useRef(programAudio);
  const programGenerationRef = useRef(createPlaceClientId());
  const [pickerView, setPickerView] = useState<PickerView>("closed");
  const [classroomCollapsed, setClassroomCollapsed] = useState(false);
  const classroomPlayerContentId = useId();
  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>("ordered");
  const playlistResumeRef = useRef<string | null>(null);
  const playlistHandlersRef = useRef<{ play: () => Promise<void>; ended: () => void } | null>(null);
  useEffect(() => { waveEngine?.setReferenceRepeat(playbackMode === "loop"); }, [waveEngine, playbackMode]);
  const [pendingImportCover, setPendingImportCover] = useState<string | null>(null);
  const [pendingWaveImport, setPendingWaveImport] = useState<WaveImportedAudio | null>(null);
  const [waveImportCategory, setWaveImportCategory] = useState<WaveLoopCategory | null>(null);
  const [waveImportDestination, setWaveImportDestination] = useState<WaveImportDestination | "player" | null>(null);
  const [waveImportPending, setWaveImportPending] = useState(false);
  const [waveImportAnalyzing, setWaveImportAnalyzing] = useState(false);
  const [waveImportError, setWaveImportError] = useState("");
  const [waveImportTitle, setWaveImportTitle] = useState("");
  const [waveSetlist, setWaveSetlist] = useState<{ title: string; tracks: MixerAudioTrack[] } | null>(null);
  const waveImportRequestRef = useRef(0);
  const waveImportAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => { waveImportRequestRef.current++; waveImportAbortRef.current?.abort(); }, []);
  const [waveformPeaks, setWaveformPeaks] = useState<readonly WaveformPeak[]>([]);
  const waveReferenceReady = !waveEngine || Boolean(currentTrack && waveState?.referenceId === currentTrack.id && !waveState.referenceLoading);
  const updateLoopRegion = useCallback((region: PlaceMixerLoopRegion | null) => {
    loopRegionRef.current = region;
    setLoopRegion(region);
  }, []);
  useEffect(() => { if (!waveEngine) updateLoopRegion(null); }, [currentTrack?.id, updateLoopRegion, waveEngine]);
  useEffect(() => {
    const region = loopRegionRef.current;
    if (!region || region.end <= durationSeconds) return;
    updateLoopRegion(createMixerLoop(region.start, durationSeconds));
  }, [durationSeconds, updateLoopRegion]);

  const syncLoopPlayback = useCallback(() => {
    if (waveEngine) return;
    const audio = audioRef.current;
    const region = loopRegionRef.current;
    if (!audio || !region || audio.paused || audio.ended) return;
    const next = mixerLoopPosition(audio.currentTime, region);
    if (next !== audio.currentTime) {
      audio.currentTime = next;
      setCurrentSeconds(next);
    }
  }, [waveEngine]);
  useEffect(() => {
    if (waveEngine || !isPlaying || !loopRegion) return;
    // timeupdate is too infrequent for short loops; also follow the media
    // clock between its events. No elapsed wall time is added to the track.
    const timer = window.setInterval(syncLoopPlayback, 20);
    return () => window.clearInterval(timer);
  }, [isPlaying, loopRegion, syncLoopPlayback, waveEngine]);
  useEffect(() => {
    if (!waveState) return;
    setIsPlaying(waveState.playing); setCurrentSeconds(waveState.position);
    setDurationSeconds(waveState.duration); updateLoopRegion(waveState.region);
  }, [waveState, updateLoopRegion]);
  const baseLoop = waveTransport?.wave?.baseLoop;
  useEffect(() => {
    if (!waveEngine || !currentTrack) return;
    void waveEngine.setReference({ id: currentTrack.id, title: currentTrack.title, url: currentTrack.src,
      ...(currentTrack.id === "wave-reference" && baseLoop ? { bpm: baseLoop.bpm, bars: baseLoop.bars } : {}) });
  }, [baseLoop?.bars, baseLoop?.bpm, currentTrack?.id, currentTrack?.src, currentTrack?.title, waveEngine]);
  useEffect(() => {
    if (!waveEngine || (currentTrack && currentTrack.id !== "wave-reference") || !baseLoop || !(baseLoop.mediaUrl || baseLoop.mediaPath)) return;
    let active = true;
    void (baseLoop.mediaUrl ? Promise.resolve(baseLoop.mediaUrl) : signedWaveAudienceUrl(baseLoop.mediaPath!)).then(src => {
      if (!active) return;
      if (currentTrack?.src === src && currentTrack.title === baseLoop.title) return;
      const reference: MixerAudioTrack = { id: "wave-reference", title: baseLoop.title, displayTitle: baseLoop.title,
        src, durationSeconds: baseLoop.durationSeconds ?? 0, waveDestination: "base",
        waveCategory: WAVE_LOOP_CATEGORIES.find(category => category.label === baseLoop.kind)?.id ?? "drums" };
      const tracks = [reference, ...queue.filter(track => track.id !== "wave-reference")];
      setQueue(tracks);
      activateTrack(tracks, 0);
    }).catch(() => setSafetyError("Beat de référence indisponible"));
    return () => { active = false; };
  }, [waveEngine, currentTrack?.id, currentTrack?.src, currentTrack?.title, baseLoop?.mediaUrl, baseLoop?.mediaPath, baseLoop?.title]);
  const progress = durationSeconds > 0 ? Math.min(1, currentSeconds / durationSeconds) : 0;
  const cueProgress = durationSeconds > 0 ? Math.min(1, cueSeconds / durationSeconds) : 0;
  const displayedPeaks = useMemo(() => {
    if (!waveState?.referencePeaks.length || !waveState.referencePeriod || waveState.referenceId !== currentTrack?.id) return waveformPeaks;
    const reference = waveState.referencePeaks;
    return Array.from({ length: MIXER_WAVEFORM_BIN_COUNT }, (_, index) => {
      const seconds = index / MIXER_WAVEFORM_BIN_COUNT * durationSeconds;
      return reference[Math.floor((seconds % waveState.referencePeriod) / waveState.referencePeriod * reference.length)];
    });
  }, [waveState?.referencePeaks, waveState?.referencePeriod, waveState?.referenceId, currentTrack?.id, waveformPeaks, durationSeconds]);
  const playedWaveformBarCount = Math.min(displayedPeaks.length, Math.floor(progress * displayedPeaks.length));
  const lastPlayedWaveformIndex = Math.max(0, playedWaveformBarCount - 1);
  const waveformGuideDuration = durationSeconds || currentTrack?.durationSeconds || 90;
  const waveformGuides = Array.from({ length: 7 }, (_, index) => ({
    position: index / 6,
    time: waveformGuideDuration * index / 6,
  }));
  const effectiveMusicGain = publicMusicMuted
    ? 0
    : Math.min(1, Math.max(0, musicGain)) * Math.min(1, Math.max(0, masterGain));

  const pickerTitle = useMemo(() => {
    if (pickerView === "queue") return "Playlist du Mixeur";
    if (pickerView === "library") return "Ma médiathèque";
    if (pickerView === "setlists") return waveSetlist?.title ?? "Mes setlists";
    if (pickerView === "covers") return "Choisir une cover";
    return "";
  }, [pickerView, waveSetlist?.title]);

  const analyzeTrackWaveform = useCallback((track: MixerAudioTrack) => {
    const identity = waveformTrackIdentity(track);
    const cached = waveformCacheRef.current.get(identity);
    if (cached) return Promise.resolve(cached);

    const pending = waveformAnalysisRef.current.get(identity);
    if (pending) return pending;

    const analysis = (async () => {
      const data = track.file
        ? await track.file.arrayBuffer()
        : await fetch(track.src).then((response) => {
          if (!response.ok) throw new Error("waveform_source_unavailable");
          return response.arrayBuffer();
        });
      const decoded = await decodeAudioWaveform(data, MIXER_WAVEFORM_BIN_COUNT);
      const peaks = decoded.peaks.length === MIXER_WAVEFORM_BIN_COUNT ? decoded.peaks : [];
      if (Number.isFinite(decoded.durationSeconds) && decoded.durationSeconds > 0) {
        waveformDurationCacheRef.current.set(identity, decoded.durationSeconds);
      }
      waveformCacheRef.current.set(identity, peaks);
      return peaks;
    })().catch(() => {
      // A failed decode must remain visually empty: no synthetic fallback.
      const peaks: readonly WaveformPeak[] = [];
      waveformCacheRef.current.set(identity, peaks);
      return peaks;
    }).finally(() => {
      waveformAnalysisRef.current.delete(identity);
    });

    waveformAnalysisRef.current.set(identity, analysis);
    return analysis;
  }, []);

  const currentWaveformIdentity = currentTrack ? waveformTrackIdentity(currentTrack) : "";

  useEffect(() => {
    selectedWaveformIdentityRef.current = currentWaveformIdentity;
    if (!currentTrack) {
      setWaveformPeaks([]);
      return;
    }

    const cached = waveformCacheRef.current.get(currentWaveformIdentity);
    if (cached) {
      setWaveformPeaks(cached);
      return;
    }

    // Clear the old geometry immediately. A late result is accepted only if
    // both the track id and its source still identify the active track.
    setWaveformPeaks([]);
    void analyzeTrackWaveform(currentTrack).then((peaks) => {
      if (selectedWaveformIdentityRef.current === currentWaveformIdentity) {
        setWaveformPeaks(peaks);
      }
    });
  }, [analyzeTrackWaveform, currentTrack, currentWaveformIdentity]);

  useEffect(() => {
    const openQueue = (event: Event) => {
      const detail = (event as CustomEvent<{ roomId?: string }>).detail;
      if (detail?.roomId && detail.roomId !== roomId) return;
      if (classroomCollapsible && classroomCollapsed) return;
      setPickerView("queue");
    };
    window.addEventListener("meewav:mixer-playlist-open", openQueue);
    return () => window.removeEventListener("meewav:mixer-playlist-open", openQueue);
  }, [classroomCollapsed, classroomCollapsible, roomId]);

  useEffect(() => {
    if (!classroomCollapsible) {
      setClassroomCollapsed(false);
      onClassroomCollapsedChange?.(false);
    }
  }, [classroomCollapsible, onClassroomCollapsedChange]);

  useEffect(() => {
    safetyCallbacksRef.current = { onRouteChange, onPlaybackStateChange };
  }, [onPlaybackStateChange, onRouteChange]);

  useEffect(() => {
    programAudioRef.current = programAudio;
  }, [programAudio]);

  useEffect(() => {
    if (pickerView === "closed") return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerView("closed");
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerView]);

  const setPublicGain = useCallback((gain: number, immediate = false) => {
    const graph = audioGraphRef.current;
    if (!graph) return;
    const value = Math.min(1, Math.max(0, gain));
    const now = graph.context.currentTime;
    graph.publicGain.gain.cancelScheduledValues(now);
    if (immediate) {
      graph.publicGain.gain.setValueAtTime(value, now);
      return;
    }
    graph.publicGain.gain.setValueAtTime(graph.publicGain.gain.value, now);
    graph.publicGain.gain.linearRampToValueAtTime(value, now + .018);
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const existing = audioGraphRef.current;
    if (existing) {
      if (existing.context.state === "suspended") await existing.context.resume();
      return existing;
    }
    const audio = audioRef.current;
    const AudioContextConstructor = window.AudioContext;
    if (!audio || !AudioContextConstructor) throw new Error("web_audio_unavailable");

    const context = waveEngine?.getContext() ?? new AudioContextConstructor({ latencyHint: "interactive" });
    const source = waveEngine?.getProgramInput() ?? context.createMediaElementSource(audio);
    const previewGain = context.createGain();
    const publicGain = context.createGain();
    const previewMeter = context.createAnalyser();
    previewMeter.fftSize = 256;
    const publicDestination = context.createMediaStreamDestination();
    previewGain.gain.value = effectiveMusicGain;
    publicGain.gain.value = 0;
    if (!waveEngine) source.connect(previewGain);
    previewGain.connect(previewMeter);
    previewMeter.connect(context.destination);
    if (waveEngine) waveEngine.connect(previewGain, publicGain);
    else source.connect(publicGain);
    publicGain.connect(publicDestination);
    const publicTrack = publicDestination.stream.getAudioTracks()[0];
    if (!publicTrack) {
      await context.close();
      throw new Error("program_track_unavailable");
    }
    const graph = { context, source, previewGain, previewMeter, publicGain, publicDestination, publicTrack };
    audioGraphRef.current = graph;
    audio.volume = 1;
    await context.resume();
    return graph;
  }, [effectiveMusicGain, waveEngine]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const clampedGain = effectiveMusicGain;
    const graph = audioGraphRef.current;
    if (!graph) {
      audio.volume = clampedGain;
      return;
    }
    graph.previewGain.gain.value = clampedGain;
    const shouldReachAudience = route === "public"
      && isPlaying
      && clampedGain > 0;
    if (!shouldReachAudience) {
      setPublicGain(0, true);
      if (route === "public" && isPlaying) {
        setPublicTransportConfirmed(false);
        void programAudioRef.current?.setMusicEnabled(false);
      }
      return;
    }
    let current = true;
    void (programAudioRef.current?.setMusicEnabled(true) ?? Promise.resolve(true)).then((confirmed) => {
      if (!current || !confirmed) return;
      // Publish the music stem at nominal level. The authoritative room
      // compositor applies Musique × Master once; this node is only a
      // fail-closed 0/1 gate and must not square the faders for viewers.
      setPublicGain(1);
      setPublicTransportConfirmed(true);
    });
    return () => { current = false; };
  }, [effectiveMusicGain, isPlaying, route, setPublicGain]);

  useEffect(() => {
    if (!programAudio || route !== "public" || !isPlaying) return;
    const generation = programGenerationRef.current;
    const transportReconnecting = programAudio.status === "reconnecting";
    const expectedAudible = publicTransportConfirmed && effectiveMusicGain > 0;
    const transportLost = expectedAudible && (
      !programAudio.musicAudible
      || programAudio.musicGeneration !== generation
    );
    if ((!transportReconnecting && !transportLost)
      || failedTransportGenerationRef.current === generation) return;

    // Fail closed before signaling. A recovered SFU may recreate the
    // publication muted, but only another explicit Play may make it audible.
    failedTransportGenerationRef.current = generation;
    setPublicTransportConfirmed(false);
    setPublicGain(0, true);
    audioRef.current?.pause();
    waveEngine?.pause();
    setIsPlaying(false);
    placeRoomTime.pause();
    void programAudio.setMusicEnabled(false);
    void safetyCallbacksRef.current.onPlaybackStateChange("ready", generation).then((committed) => {
      if (!committed && programGenerationRef.current === generation) {
        setSafetyError("Synchronisation de sécurité indisponible");
      }
    });
  }, [effectiveMusicGain, isPlaying, programAudio, publicTransportConfirmed, route, setPublicGain, waveEngine]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    void profileMediaRepository.listOwnerMedia(ownerId).then((items) => {
      if (!active) return;
      const audioItems = items
        .filter((item) => item.kind === "audio" && item.sourceUrl)
        .map((item) => ({
          id: `library-${item.id}`,
          title: item.title,
          displayTitle: item.title,
          artist: "Ma médiathèque",
          cover: item.cover,
          coverSeed: `library-${item.id}`,
          src: item.sourceUrl!,
          durationSeconds: secondsFromLabel(item.duration),
        }));
      if (audioItems.length > 0) setLibraryTracks(audioItems);
    }).catch(() => {
      // Les médias locaux de démonstration restent disponibles hors connexion.
    });
    return () => { active = false; };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    try {
      const raw = window.localStorage.getItem(`meewav-profile-setlists-v3:${ownerId}`);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredSetlist[];
      const available = stored.flatMap((entry) => {
        if (entry.availableInMixer === false) return [];
        const tracks = (entry.tracks ?? []).flatMap((track, index) => {
          if (!track.sourceUrl || track.sourceUrl.startsWith("blob:")) return [];
          return [{
            id: `setlist-${entry.id}-${track.id}-${index}`,
            title: track.title,
            displayTitle: track.title,
            artist: entry.title,
            cover: track.cover,
            coverSeed: `setlist-${entry.id}-${track.id}`,
            src: track.sourceUrl,
            durationSeconds: secondsFromLabel(track.duration),
          } satisfies MixerAudioTrack];
        });
        return tracks.length > 0 ? [{ id: entry.id, title: entry.title, tracks }] : [];
      });
      if (available.length > 0) setSetlists(available);
    } catch {
      // Les setlists de démonstration assurent un état exploitable si le stockage est indisponible.
    }
  }, [ownerId]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  useEffect(() => () => {
    playbackStartAbortRef.current?.abort();
    setPublicGain(0, true);
    audioRef.current?.pause();
    waveEngine?.pause();
    void programAudioRef.current?.setMusicEnabled(false);
    void programAudioRef.current?.releaseMusicTrack();
    const graph = audioGraphRef.current;
    audioGraphRef.current = null;
    if (graph) {
      try { graph.source.disconnect(); } catch { /* Déjà détaché. */ }
      try { graph.previewMeter.disconnect(); } catch { /* Meter detached. */ }
      try { graph.previewGain.disconnect(); } catch { /* Déjà détaché. */ }
      try { graph.publicGain.disconnect(); } catch { /* Déjà détaché. */ }
      graph.publicTrack.stop();
      if (!waveEngine) void graph.context.close();
    }
    void safetyCallbacksRef.current.onPlaybackStateChange("paused", programGenerationRef.current);
    void safetyCallbacksRef.current.onRouteChange("preview", programGenerationRef.current);
  }, [setPublicGain, waveEngine]);

  useEffect(() => {
    const stopAtCountdownEnd = () => {
      playbackStartAbortRef.current?.abort();
      const audio = audioRef.current;
      if (audio) {
        setPublicGain(0, true);
        void programAudioRef.current?.setMusicEnabled(false);
        audio.pause();
        waveEngine?.pause();
        audio.currentTime = 0;
      }
      setIsPlaying(false);
      setCurrentSeconds(0);
      void onPlaybackStateChange(route === "public" ? "ready" : "paused", programGenerationRef.current);
    };
    window.addEventListener("meewav:mixer-chrono-ended", stopAtCountdownEnd);
    return () => window.removeEventListener("meewav:mixer-chrono-ended", stopAtCountdownEnd);
  }, [onPlaybackStateChange, route, setPublicGain, waveEngine]);

  const pauseLocal = () => {
    playlistResumeRef.current = null;
    playbackStartAbortRef.current?.abort();
    setPublicTransportConfirmed(false);
    setPublicGain(0, true);
    void programAudioRef.current?.setMusicEnabled(false);
    audioRef.current?.pause();
    waveEngine?.pause();
    setIsPlaying(false);
    placeRoomTime.pause();
  };

  const pause = () => {
    pauseLocal();
    void onPlaybackStateChange(route === "public" ? "ready" : "paused", programGenerationRef.current);
  };

  const play = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack || !waveReferenceReady || (route === "public" && !previewReady) || playbackPendingRef.current || routePendingRef.current) return;
    playbackPendingRef.current = true;
    const controller = new AbortController();
    playbackStartAbortRef.current = controller;
    const generation = programGenerationRef.current;
    failedTransportGenerationRef.current = null;
    setPlaybackPending(true);
    setSafetyError(null);
    const playbackState: PlaceAudioPlaybackState = route === "public" ? "playing" : "previewing";
    try {
      // La préécoute locale reste utilisable même si Web Audio ou le plan de
      // contrôle distant n'est pas disponible. Le graphe est obligatoire
      // uniquement avant une diffusion publique.
      if (route === "public" || waveEngine || personalSend) await ensureAudioGraph();
      else if (audioGraphRef.current?.context.state === "suspended") {
        await audioGraphRef.current.context.resume();
      }
      // Le Pad retient le transport lui-même, pas seulement l'affichage Time.
      // Une reprise en cours de piste ne rejoue pas l'introduction.
      if (!waveEngine?.getSnapshot().quickPreview && audio.currentTime === 0 && placeRoomTime.getSnapshot().status !== "running") {
        setCountdownPending(true);
        const ready = await waitForPlaceMixerStart(controller.signal);
        setCountdownPending(false);
        if (!ready) return;
      }
      if (controller.signal.aborted || programGenerationRef.current !== generation) return;
      if (!waveEngine) {
        audio.currentTime = mixerLoopPosition(audio.currentTime, loopRegionRef.current);
        setCurrentSeconds(audio.currentTime);
      }
      if (waveEngine) await waveEngine.play();
      else await audio.play();
      if (controller.signal.aborted || programGenerationRef.current !== generation) {
        audio.pause();
        waveEngine?.pause();
        return;
      }
      const committed = await onPlaybackStateChange(playbackState, programGenerationRef.current);
      if (controller.signal.aborted || programGenerationRef.current !== generation) return;
      if (!committed) {
        if (route === "public") {
          audio.pause();
        waveEngine?.pause();
          setSafetyError("Synchronisation indisponible");
          return;
        }
        // Une panne de synchronisation ne doit jamais casser l'écoute privée.
        setSafetyError("Préécoute locale uniquement");
      }
      if (route === "public") {
        const shouldReachAudience = effectiveMusicGain > 0;
        const mediaEnabled = await programAudioRef.current?.setMusicEnabled(shouldReachAudience) ?? true;
        if (controller.signal.aborted || programGenerationRef.current !== generation) return;
        if (!mediaEnabled) {
          setPublicTransportConfirmed(false);
          setPublicGain(0, true);
          audio.pause();
        waveEngine?.pause();
          void onPlaybackStateChange("ready", programGenerationRef.current);
          setSafetyError("Diffusion publique indisponible");
          return;
        }
        setPublicTransportConfirmed(shouldReachAudience);
        setPublicGain(shouldReachAudience ? 1 : 0);
      }
      setIsPlaying(true);
      placeRoomTime.start({ skipCountdown: true });
    } catch {
      if (controller.signal.aborted || programGenerationRef.current !== generation) return;
      setIsPlaying(false);
      setPublicTransportConfirmed(false);
      setPublicGain(0, true);
      void programAudioRef.current?.setMusicEnabled(false);
      audio.pause();
        waveEngine?.pause();
      setSafetyError("Lecture indisponible");
      void onPlaybackStateChange(route === "public" ? "ready" : "paused", programGenerationRef.current);
    } finally {
      if (playbackStartAbortRef.current === controller) playbackStartAbortRef.current = null;
      setCountdownPending(false);
      playbackPendingRef.current = false;
      setPlaybackPending(false);
    }
  };

  const togglePlayback = () => {
    if (countdownPending || isPlaying) pause();
    else void play();
  };

  useEffect(() => { playlistHandlersRef.current = { play, ended: handleTrackEnd }; });
  useEffect(() => {
    if (!currentTrack || playlistResumeRef.current !== currentTrack.id || !waveReferenceReady || !previewReady || playbackPending) return;
    playlistResumeRef.current = null;
    void playlistHandlersRef.current?.play();
  }, [waveEngine, currentTrack, waveReferenceReady, previewReady, playbackPending]);

  // The Sas shortcuts use this player's routing, countdown and stop controls.
  const registerWavePlaybackControls = waveTransport?.registerPlaybackControls;
  useEffect(() => registerWavePlaybackControls?.({ play: async () => {
    if (!playerOnlySelected) return play();
    const index = queue.findIndex(track => track.id === activeBaseTrackId);
    if (index >= 0) { activateTrack(queue, index, true); playlistResumeRef.current = queue[index].id; }
  }, pause }), [registerWavePlaybackControls, play, pause, playerOnlySelected, queue, activeBaseTrackId]);

  const prepareSelectedTrack = async (track: MixerAudioTrack, requestId: number, generation: string) => {
    const prepared = await onPreviewPrepare({
      ready: true,
      title: track.displayTitle ?? track.title,
      artist: track.artist ?? null,
      durationSeconds: track.durationSeconds > 0 ? Math.round(track.durationSeconds) : null,
      generation,
    }).catch(() => false);
    if (previewRequestRef.current !== requestId) return;
    setPreviewReady(prepared);
    if (!prepared) setSafetyError("Préécoute indisponible");
  };

  const activateTrack = (tracks: MixerAudioTrack[], index: number, preserveWaveTransport = false) => {
    const track = tracks[index];
    if (!track) return;
    const requestId = ++previewRequestRef.current;
    const generation = createPlaceClientId();
    programGenerationRef.current = generation;
    metadataCommitRef.current = null;
    failedTransportGenerationRef.current = null;
    pauseLocal();
    const targetEngine = track.waveDestination === "player" ? undefined : waveTransport?.engine;
    if (!preserveWaveTransport) {
      targetEngine?.setMode(waveTransport?.context === "wave-orchestra" ? "beat" : "base");
      targetEngine?.seek(0);
    }
    void programAudioRef.current?.releaseMusicTrack();
    setRoute("preview");
    setPreviewReady(false);
    setSafetyError(null);
    setCurrentIndex(index);
    setCurrentSeconds(0);
    setCueSeconds(0);
    setDurationSeconds(track.durationSeconds ?? 0);
    placeRoomTime.reset();
    void prepareSelectedTrack(track, requestId, generation);
  };

  const selectTrack = (index: number) => {
    const track = queue[index];
    if (waveTransport && track?.waveDestination === "base" && track.id !== activeBaseTrackId) {
      setWaveImportDestination("base");
      void stageWaveImport(track);
      return;
    }
    activateTrack(queue, index);
  };

  const cageDeckActions = useRef({ activateTrack, pauseLocal, route });
  cageDeckActions.current = { activateTrack, pauseLocal, route };
  useEffect(() => cageProduction?.registerMixerPreview(() => {
    if (cageDeckActions.current.route === "preview") cageDeckActions.current.pauseLocal();
  }), [cageProduction?.registerMixerPreview]);
  useEffect(() => {
    const asset = cageProduction?.asset;
    if (!asset || !cageProduction?.participant || adoptedCageSource.current === asset.src) return;
    if (cageProduction.onstage && adoptedCageSource.current) return;
    adoptedCageSource.current = asset.src;
    const track: MixerAudioTrack = { id: `cage-production:${asset.production.reference}`, title: asset.production.title,
      artist: "Prod du battle", badge: "Prod du battle", src: asset.src, durationSeconds: asset.durationSeconds,
      file: asset.file, fileName: asset.file.name, cageProductionReference: asset.production.reference };
    const nextQueue = [track, ...queue.filter(item => !item.cageProductionReference)];
    setQueue(nextQueue);
    cageDeckActions.current.activateTrack(nextQueue, 0);
  }, [cageProduction?.asset, cageProduction?.participant, cageProduction?.onstage]);
  useEffect(() => {
    if (previewReady && currentTrack?.cageProductionReference) cageProduction?.markMixerLoaded(currentTrack.cageProductionReference);
  }, [previewReady, currentTrack?.cageProductionReference, cageProduction?.markMixerLoaded]);

  const queueNeighbour = (index: number, direction: -1 | 1) => {
    for (let next = index + direction; next >= 0 && next < queue.length; next += direction) {
      if (!waveTransport || queue[next].waveDestination === queue[index].waveDestination) return next;
    }
    return -1;
  };

  const moveQueueTrack = (index: number, direction: -1 | 1) => {
    const destination = queueNeighbour(index, direction);
    if (destination < 0 || destination >= queue.length) return;
    const activeTrackId = currentTrack?.id;
    const nextQueue = [...queue];
    [nextQueue[index], nextQueue[destination]] = [nextQueue[destination], nextQueue[index]];
    setQueue(nextQueue);
    if (activeTrackId) {
      const activeIndex = nextQueue.findIndex((track) => track.id === activeTrackId);
      if (activeIndex >= 0) setCurrentIndex(activeIndex);
    }
  };

  const removeQueueTrack = (index: number) => {
    const removedTrack = queue[index];
    if (!removedTrack || removedTrack.cageProductionReference || (waveTransport && removedTrack.id === activeBaseTrackId)) return;
    const nextQueue = queue.filter((_, trackIndex) => trackIndex !== index);
    const removedWaveformIdentity = waveformTrackIdentity(removedTrack);
    waveformCacheRef.current.delete(removedWaveformIdentity);
    waveformDurationCacheRef.current.delete(removedWaveformIdentity);

    if (index === currentIndex) pauseLocal();

    if (removedTrack.localObjectUrl) {
      URL.revokeObjectURL(removedTrack.src);
      objectUrlsRef.current.delete(removedTrack.src);
    }

    if (nextQueue.length === 0) {
      pauseLocal();
      void programAudioRef.current?.releaseMusicTrack();
      setQueue([]);
      setCurrentIndex(0);
      setCurrentSeconds(0);
      setCueSeconds(0);
      setDurationSeconds(0);
      setRoute("preview");
      setPreviewReady(false);
      setSafetyError(null);
      placeRoomTime.reset();
      return;
    }

    if (index === currentIndex) {
      setQueue(nextQueue);
      const nextIndex = waveTransport
        ? nextQueue.findIndex((track) => track.waveDestination !== "base" || track.id === activeBaseTrackId)
        : Math.min(index, nextQueue.length - 1);
      activateTrack(nextQueue, Math.max(0, nextIndex));
      return;
    }

    setQueue(nextQueue);
    if (index < currentIndex) setCurrentIndex((current) => Math.max(0, current - 1));
  };

  const loadTracks = (tracks: MixerAudioTrack[]) => {
    if (tracks.length === 0) return;
    const importedTracks = tracks.map((track, index) => (
      index === 0 && pendingImportCover && !track.cover
        ? { ...track, cover: pendingImportCover }
        : track
    ));
    const firstTrack = importedTracks[0];
    const nextQueue = [...queue.filter(track => !importedTracks.some(imported => imported.id === track.id)), ...importedTracks];
    const firstImportedIndex = nextQueue.findIndex(track => track.id === firstTrack.id);
    const requestId = ++previewRequestRef.current;
    const generation = createPlaceClientId();
    programGenerationRef.current = generation;
    metadataCommitRef.current = null;
    failedTransportGenerationRef.current = null;
    pauseLocal();
    const targetEngine = firstTrack.waveDestination === "player" ? undefined : waveTransport?.engine;
    targetEngine?.setMode(waveTransport?.context === "wave-orchestra" ? "beat" : "base");
    targetEngine?.seek(0);
    void programAudioRef.current?.releaseMusicTrack();
    setRoute("preview");
    setPreviewReady(false);
    setSafetyError(null);
    setQueue(nextQueue);
    setCurrentIndex(firstImportedIndex);
    setCurrentSeconds(0);
    setCueSeconds(0);
    setDurationSeconds(firstTrack.durationSeconds);
    placeRoomTime.reset();
    setPendingImportCover(null);
    setPickerView("closed");
    void prepareSelectedTrack(firstTrack, requestId, generation);
  };

  const openUpload = () => {
    setWaveImportDestination(null);
    setWaveImportCategory(null);
    setWaveImportError("");
    setWaveSetlist(null);
    setPickerView(waveTransport ? "wave-destination" : "sources");
  };

  const stageWaveImport = async (track: MixerAudioTrack, ignored = 0) => {
    const request = ++waveImportRequestRef.current;
    waveImportAbortRef.current?.abort();
    const controller = new AbortController();
    waveImportAbortRef.current = controller;
    setWaveImportTitle(track.title);
    setPendingWaveImport(null);
    setWaveImportAnalyzing(true);
    setWaveImportCategory(track.waveCategory ?? null);
    setWaveImportError(ignored ? "Choisis une boucle à la fois. Les autres fichiers n’ont pas été importés." : "");
    setPickerView("closed");
    try {
      let file = track.file;
      let src = track.src;
      if (!file) {
        const response = await fetch(track.src, { signal: controller.signal });
        if (!response.ok) throw new Error("Ce son n’est pas accessible. Choisis un autre fichier ou réessaie.");
        const blob = await response.blob();
        if (request !== waveImportRequestRef.current) return;
        const fileName = track.fileName || new URL(track.src, window.location.href).pathname.split("/").pop() || "boucle.wav";
        file = new File([blob], fileName, { type: blob.type });
        src = URL.createObjectURL(file);
        objectUrlsRef.current.add(src);
      }
      if (request !== waveImportRequestRef.current) return;
      const audio = { id: track.id, title: track.title, src, file, durationSeconds: track.durationSeconds };
      setPendingWaveImport(audio);
      const analyzedTrack = { ...track, src, file };
      await analyzeTrackWaveform(analyzedTrack);
      if (request !== waveImportRequestRef.current) return;
      const measuredDuration = waveformDurationCacheRef.current.get(waveformTrackIdentity(analyzedTrack));
      setPendingWaveImport({ ...audio, durationSeconds: measuredDuration || track.durationSeconds });
    } catch (reason) {
      if (request === waveImportRequestRef.current) setWaveImportError(reason instanceof Error ? reason.message : "Impossible de lire ce son.");
    } finally {
      if (request === waveImportRequestRef.current) setWaveImportAnalyzing(false);
    }
  };

  const importSelectedTracks = (tracks: MixerAudioTrack[]) => {
    if (!tracks.length) return;
    if (waveTransport && waveImportDestination === "player") {
      loadTracks(tracks.map(track => ({ ...track, waveDestination: "player" })));
    } else if (waveTransport && (waveImportDestination || waveTransport.hasImportHandler())) {
      const [track, ...ignored] = tracks;
      ignored.forEach(item => {
        if (item.localObjectUrl) { URL.revokeObjectURL(item.src); objectUrlsRef.current.delete(item.src); }
      });
      void stageWaveImport(track, ignored.length);
    } else loadTracks(tracks);
  };

  const toggleClassroomPlayer = () => {
    const nextCollapsed = !classroomCollapsed;
    if (nextCollapsed) setPickerView("closed");
    setClassroomCollapsed(nextCollapsed);
    onClassroomCollapsedChange?.(nextCollapsed);
  };

  const handleDeviceFile = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    if (files.length === 0) return;
    const tracks = files.map((file, index) => {
      const src = URL.createObjectURL(file);
      objectUrlsRef.current.add(src);
      return {
        id: `device-${Date.now()}-${index}`,
        title: file.name.replace(/\.[^/.]+$/, ""),
        displayTitle: file.name.replace(/\.[^/.]+$/, ""),
        artist: "Import local",
        coverSeed: `device-${file.name}-${file.size}-${file.lastModified}`,
        src,
        durationSeconds: 0,
        localObjectUrl: true,
        fileName: file.name,
        fileSize: file.size,
        fileLastModified: file.lastModified,
        file,
      } satisfies MixerAudioTrack;
    });
    // Analyze every imported file immediately, including tracks that are not
    // yet selected in the playlist. Selecting them later is then instant.
    if (!waveTransport || (!waveImportDestination && !waveTransport.hasImportHandler())) tracks.forEach((track) => { void analyzeTrackWaveform(track); });
    importSelectedTracks(tracks);
    event.currentTarget.value = "";
  };

  const closeWaveImport = () => {
    if (waveImportPending) return;
    waveImportRequestRef.current++;
    waveImportAbortRef.current?.abort();
    if (pendingWaveImport && !queue.some(track => track.src === pendingWaveImport.src)) {
      URL.revokeObjectURL(pendingWaveImport.src);
      objectUrlsRef.current.delete(pendingWaveImport.src);
    }
    setPendingWaveImport(null);
    setWaveImportTitle("");
    setWaveImportAnalyzing(false);
    setWaveImportError("");
  };

  const commitWaveImport = async () => {
    if (!pendingWaveImport || !waveTransport || waveImportAnalyzing || waveImportPending || !waveImportDestination || waveImportDestination === "player" || !waveImportCategory) return;
    const destination = waveImportDestination;
    setWaveImportPending(true);
    setWaveImportError("");
    try {
      await waveTransport.commitImport({ audio: pendingWaveImport, destination, category: waveImportCategory });
      const imported = pendingWaveImport;
      setPendingWaveImport(null);
      setWaveImportTitle("");
      if (destination === "base") {
        setActiveBaseTrackId(imported.id);
        loadTracks([{
        id: imported.id,
        title: imported.title,
        displayTitle: imported.title,
        artist: "Import host · nouvelle base",
        coverSeed: imported.id,
        src: imported.src,
        durationSeconds: imported.durationSeconds,
        localObjectUrl: true,
        fileName: imported.file.name,
        fileSize: imported.file.size,
        fileLastModified: imported.file.lastModified,
        file: imported.file,
        waveDestination: "base",
        waveCategory: waveImportCategory,
      }]);
      }
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      setWaveImportError(code === "wave_import_duration_off_grid"
        ? "La durée ne tombe pas exactement sur 4, 8 ou 16 mesures au BPM de la Wave."
        : code === "wave_import_base_length_mismatch"
          ? "Cette production n’a pas la même longueur musicale que la boucle de base actuelle."
          : code === "wave_import_grid_invalid"
            ? "L’horloge musicale de la Wave est invalide."
            : code ? code.replace(/_/g, " ") : "Import Wave indisponible.");
    } finally {
      setWaveImportPending(false);
    }
  };

  const playlistIndices = queue.flatMap((track, index) =>
    !waveTransport || (currentTrack?.waveDestination !== "base" && track.waveDestination !== "base") ? [index] : []);
  const canNavigateTracks = waveEngine && (waveTransport?.context === "wave-gate" || waveTransport?.context === "wave-quarantine")
    ? waveTransport.queue.length > 1 : playlistIndices.length > 1;
  const selectAdjacent = (direction: -1 | 1) => {
    if (playlistIndices.length < 2) return;
    const position = playlistIndices.indexOf(currentIndex);
    selectTrack(playlistIndices[(position + direction + playlistIndices.length) % playlistIndices.length]);
  };

  const handleNextTrack = () => {
    if (waveEngine && (waveTransport?.context === "wave-gate" || waveTransport?.context === "wave-quarantine") && waveTransport.queue.length) { waveTransport.adjacent(1); return; }
    if (!currentTrack || queue.length < 2) return;
    selectAdjacent(1);
  };

  const handlePreviousTrack = () => {
    if (waveEngine && (waveTransport?.context === "wave-gate" || waveTransport?.context === "wave-quarantine") && waveTransport.queue.length) { waveTransport.adjacent(-1); return; }
    if (!currentTrack || queue.length < 2) return;
    selectAdjacent(-1);
  };

  const handleReturnToCue = () => {
    if (!currentTrack) return;
    const target = (waveState?.mode === "beat" || waveState?.mode === "base") && !waveState.quickPreview ? cueSeconds : loopRegionRef.current?.start ?? cueSeconds;
    waveEngine?.seek(target);
    if (audioRef.current) audioRef.current.currentTime = target;
    setCurrentSeconds(target);
  };

  const toggleLoopRegion = () => {
    if (waveEngine && waveState) {
      if (waveState.regionMode === "free") {
        const start = waveState.region?.start ?? cueSeconds;
        const end = waveState.region?.end ?? start + Math.max(.25, 4 * 60 / (waveState.grid.bpm || 120) * waveState.grid.beatsPerBar);
        waveEngine.setFreeRegion(start, end, !waveState.region);
      } else waveEngine.setRegion(cueSeconds, waveState.bars, !waveState.region);
      return;
    }
    if (loopRegionRef.current) { updateLoopRegion(null); return; }
    const region = createMixerLoop(cueSeconds, durationSeconds);
    if (!region) return;
    setCueSeconds(region.start);
    updateLoopRegion(region);
    syncLoopPlayback();
  };

  const moveLoopEdge = (edge: "start" | "end", seconds: number) => {
    if (waveEngine && waveState?.region) {
      if (waveState.regionMode === "free") waveEngine.setFreeRegion(edge === "start" ? seconds : waveState.region.start, edge === "end" ? seconds : waveState.region.end);
      else waveEngine.setRegion(edge === "start" ? seconds : seconds - (waveState.region.end - waveState.region.start), waveState.bars);
      return;
    }
    const region = loopRegionRef.current;
    if (!region) return;
    const next = moveMixerLoopEdge(region, edge, seconds, durationSeconds);
    updateLoopRegion(next);
    setCueSeconds(next.start);
    syncLoopPlayback();
  };

  const handleTrackEnd = () => {
    if (playbackMode === "loop") {
      if (audioRef.current) audioRef.current.currentTime = 0;
      setCurrentSeconds(0);
      void play();
      return;
    }
    if (playbackMode === "shuffle" && playlistIndices.length > 1) {
      const offset = Math.floor(Math.random() * (playlistIndices.length - 1)) + 1;
      const next = playlistIndices[(playlistIndices.indexOf(currentIndex) + offset) % playlistIndices.length];
      selectTrack(next);
      // Keep the existing public-route safety gate: track changes do not
      // silently publish another file. Private playlists may continue.
      if (route === "preview") playlistResumeRef.current = queue[next].id;
      return;
    }
    const nextIndex = currentTrack?.waveDestination === "base" ? undefined : playlistIndices[playlistIndices.indexOf(currentIndex) + 1];
    if (nextIndex !== undefined) {
      selectTrack(nextIndex);
      if (route === "preview") playlistResumeRef.current = queue[nextIndex].id;
      return;
    }
    // Cut the public branch before publishing the terminal state. Keeping a
    // LiveKit publication unmuted after the media element ends would make the
    // Room believe the program bus is still authoritative, even though it is
    // only emitting silence.
    setPublicGain(0, true);
    setPublicTransportConfirmed(false);
    void programAudioRef.current?.setMusicEnabled(false);
    setIsPlaying(false);
    setCurrentSeconds(waveState?.referencePeriod || durationSeconds);
    placeRoomTime.pause();
    void onPlaybackStateChange("ended", programGenerationRef.current);
  };
  useEffect(() => waveEngine?.subscribeReferenceEnded(() => playlistHandlersRef.current?.ended()), [waveEngine]);

  const handleEnded = () => {
    if (waveEngine) return;
    const region = loopRegionRef.current;
    const audio = audioRef.current;
    if (region && audio) {
      const generation = programGenerationRef.current;
      audio.currentTime = region.start;
      setCurrentSeconds(region.start);
      // End-of-file is also a valid B boundary, without restarting Pad/Time.
      void audio.play().catch(() => {
        if (generation !== programGenerationRef.current) return;
        pause();
        setSafetyError("Reprise de la boucle indisponible");
      });
      return;
    }
    handleTrackEnd();
  };

  useEffect(() => {
    if (!onPreviewLevel) return;
    const values = new Float32Array(256);
    const sample = () => {
      const graph = audioGraphRef.current;
      if (!graph || !isPlaying || route !== "preview" || graph.context.state !== "running") {
        onPreviewLevel(0);
        return;
      }
      graph.previewMeter.getFloatTimeDomainData(values);
      onPreviewLevel(values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0));
    };
    sample();
    const timer = window.setInterval(sample, 80);
    return () => { window.clearInterval(timer); onPreviewLevel(0); };
  }, [isPlaying, route, onPreviewLevel]);

  const selectRoute = async (nextRoute: PlaceAudioRoute) => {
    if (!currentTrack || !previewReady || routePendingRef.current || playbackPendingRef.current || nextRoute === route) return;
    routePendingRef.current = true;
    pauseLocal();
    setRoutePending(true);
    setSafetyError(null);
    if (nextRoute === "preview") {
      await programAudioRef.current?.releaseMusicTrack().catch(() => undefined);
    } else if (programAudioRef.current) {
      try {
        const graph = await ensureAudioGraph();
        const prepared = await programAudioRef.current.prepareMusicTrack(graph.publicTrack, programGenerationRef.current);
        if (!prepared) {
          setSafetyError("Transport public indisponible");
          routePendingRef.current = false;
          setRoutePending(false);
          return;
        }
      } catch {
        setSafetyError("Transport public indisponible");
        routePendingRef.current = false;
        setRoutePending(false);
        return;
      }
    }
    const committed = await onRouteChange(nextRoute, programGenerationRef.current).catch(() => false);
    if (committed) {
      setRoute(nextRoute);
    } else {
      if (nextRoute === "public") await programAudioRef.current?.releaseMusicTrack().catch(() => undefined);
      setSafetyError(nextRoute === "public" ? "Public indisponible" : "Préécoute indisponible");
    }
    routePendingRef.current = false;
    setRoutePending(false);
  };

  const publicAudienceConfirmed = route === "public"
    && isPlaying
    && publicTransportConfirmed
    && effectiveMusicGain > 0;
  const routingStatus = safetyError
    ?? (routePending || (currentTrack && !previewReady)
      ? "Préparation…"
      : route === "public"
        ? publicAudienceConfirmed
          ? personalSend ? "Dans votre mix personnel" : "Diffusé dans la Room"
          : isPlaying
            ? "Public coupé dans le Mixeur"
            : "Prêt à diffuser"
        : currentTrack
          ? "Local uniquement"
          : null);
  const showWaveListeningSelector = Boolean(waveState && waveEngine && waveTransport?.context !== "wave-orchestra");
  const trackHint = waveState?.referenceLoading
    ? "Chargement du morceau…"
    : waveState?.error || (waveState?.candidate
      ? `${waveState.quickPreview ? "Solo rapide · " : waveState.loading ? "Chargement · " : ""}${waveState.candidate.title}`
      : waveState?.notice || (currentTrack ? "" : "Importez un fichier pour commencer"));

  const waveListeningSelector = showWaveListeningSelector && waveState && waveEngine
    ? <WaveListeningSelector mode={waveState.quickPreview ? "loop" : waveState.mode} hasCandidate={Boolean(waveState.candidate)}
        onChange={(mode) => waveEngine.setMode(mode)} />
    : null;

  const renderQueueTrack = (track: MixerAudioTrack, index: number, position: number) => (
    <article key={track.id} className={`place-mixer-audio-queue-row${index === currentIndex ? " is-current" : ""}`}>
      <button type="button" className="place-mixer-audio-queue-row__select" onClick={() => selectTrack(index)} aria-label={`Lire ${track.displayTitle ?? track.title}`}>
        <span>{String(position + 1).padStart(2, "0")}</span>
        <strong>{track.displayTitle ?? track.title}</strong>
        <small>{waveTransport && track.waveDestination === "base" ? (track.id === activeBaseTrackId ? "Base active" : "Activer cette base") : index === currentIndex ? "Piste active" : track.artist ?? "Son importé"}</small>
      </button>
      <span className="place-mixer-audio-queue-row__order">
        <button type="button" onClick={() => moveQueueTrack(index, -1)} disabled={queueNeighbour(index, -1) < 0} aria-label={`Monter ${track.displayTitle ?? track.title}`}><ArrowUp aria-hidden="true" /></button>
        <button type="button" onClick={() => moveQueueTrack(index, 1)} disabled={queueNeighbour(index, 1) < 0} aria-label={`Descendre ${track.displayTitle ?? track.title}`}><ArrowDown aria-hidden="true" /></button>
      </span>
      <button type="button" className="place-mixer-audio-queue-row__remove" disabled={Boolean(track.cageProductionReference || (waveTransport && track.id === activeBaseTrackId))} title={track.cageProductionReference ? "Prod commune publiée par le host" : waveTransport && track.id === activeBaseTrackId ? "Activez une autre base avant de supprimer celle-ci" : undefined} onClick={() => removeQueueTrack(index)} aria-label={`Supprimer ${track.displayTitle ?? track.title}`}><Trash2 aria-hidden="true" /></button>
    </article>
  );
  const queueList = waveTransport ? (["base", "player"] as const).map((destination) => {
    const tracks = queue.map((track, index) => ({ track, index })).filter(({ track }) => destination === "base" ? track.waveDestination === "base" : track.waveDestination !== "base");
    return tracks.length ? <section className="place-mixer-audio-queue-group" key={destination} aria-label={destination === "base" ? "Boucles de base" : "Dans le lecteur"}>
      <h3>{destination === "base" ? "Boucles de base" : "Dans le lecteur"}<span>{tracks.length}</span></h3>
      {tracks.map(({ track, index }, position) => renderQueueTrack(track, index, position))}
    </section> : null;
  }) : queue.map((track, index) => renderQueueTrack(track, index, index));

  const playbackOptions = (
<span className="place-mixer-audio__utility-actions">
              <PlaceMixerRegie
                roomId={roomId}
                ownerId={ownerId}
                queueParticipants={queueParticipants}
                forceClosed={classroomCollapsible && classroomCollapsed}
              />
              {desktopDeck ? waveListeningSelector : null}
              <PlaceMixerCueControls
                key={currentTrack?.id ?? "empty"}
                cueSeconds={cueSeconds}
                hasTrack={Boolean(currentTrack)}
                loopActive={Boolean(loopRegion) && !((waveState?.mode === "beat" || waveState?.mode === "base") && !waveState.quickPreview)}
                onReturn={handleReturnToCue}
              />
              <PlaceMixerPlaybackMenu
                waveEnabled={!playerOnlySelected}
                open={pickerView === "playback"}
                onOpenChange={(open) => setPickerView(open ? "playback" : "closed")}
                mode={playbackMode}
                onModeChange={setPlaybackMode}
                canLoop={Boolean(currentTrack) && durationSeconds > 0}
                loopActive={Boolean(loopRegion)}
                onToggleLoop={toggleLoopRegion}
              />
            </span>
  );

  return (
    <section
      className={`place-mixer-audio${showWaveListeningSelector ? " has-wave-listening" : ""}${currentTrack ? " has-track" : " is-empty"}${route === "public" ? " is-public-route" : " is-preview-route"}${publicAudienceConfirmed ? " is-public-playing" : ""}${pickerView === "sources" ? " has-source-menu" : ""}${desktopDeck && pickerView === "queue" ? " is-queue-open" : ""}${classroomCollapsible ? " is-classroom-collapsible" : ""}${classroomCollapsible && classroomCollapsed ? " is-classroom-collapsed" : ""}`}
      style={{ "--audio-progress": `${progress * 100}%` } as CSSProperties}
      aria-label="Lecteur audio du Mixeur"
    >
      <audio
        key={playerOnlySelected ? "standalone" : "wave"}
        ref={audioRef}
        src={currentTrack?.src}
        loop={playbackMode === "loop"}
        crossOrigin={currentTrack?.src.startsWith("blob:") ? undefined : "anonymous"}
        preload="metadata"
        onLoadedMetadata={(event) => {
          if (waveEngine) return;
          const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : currentTrack?.durationSeconds ?? 0;
          setDurationSeconds(duration);
          setQueue((items) => items.map((item, index) => index === currentIndex ? { ...item, durationSeconds: duration } : item));
          if (!currentTrack?.localObjectUrl
            || currentTrack.durationSeconds > 0
            || route !== "preview"
            || isPlaying
            || duration <= 0) return;
          const generation = programGenerationRef.current;
          const durationSeconds = Math.max(1, Math.round(duration));
          const metadataCommitKey = `${generation}:${durationSeconds}`;
          if (metadataCommitRef.current === metadataCommitKey) return;
          metadataCommitRef.current = metadataCommitKey;
          void onPreviewMetadata({
            ready: true,
            title: currentTrack.displayTitle ?? currentTrack.title,
            artist: currentTrack.artist ?? null,
            durationSeconds,
            generation,
          }).then((committed) => {
            if (programGenerationRef.current !== generation) return;
            if (!committed) setSafetyError("Durée de la préécoute non synchronisée");
          });
        }}
        onTimeUpdate={(event) => {
          if (waveEngine) return;
          syncLoopPlayback();
          setCurrentSeconds(event.currentTarget.currentTime);
        }}
        onEnded={handleEnded}
      />
      <input ref={fileInputRef} className="place-mixer-audio__file" type="file" accept="audio/*" multiple={!waveTransport || waveImportDestination === "player"} onChange={handleDeviceFile} />

      {classroomCollapsible ? (
        <>
          <div className="place-mixer-audio__classroom-summary" aria-hidden={!classroomCollapsed}>
            <span className="place-mixer-audio__classroom-summary-icon"><Music2 /></span>
            <span>
              <small>{roomLabel.toLocaleUpperCase("fr")} · LECTEUR AUDIO</small>
              <strong title={currentTrack?.displayTitle ?? currentTrack?.title}>
                {currentTrack?.displayTitle ?? currentTrack?.title ?? "Aucun son chargé"}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="place-mixer-audio__classroom-toggle"
            onClick={toggleClassroomPlayer}
            aria-expanded={!classroomCollapsed}
            aria-controls={classroomPlayerContentId}
            aria-label={classroomCollapsed
              ? `Déplier le lecteur audio · ${roomLabel}`
              : `Replier le lecteur audio · ${roomLabel}`}
            title={classroomCollapsed
              ? `Déplier le lecteur audio · ${roomLabel}`
              : `Replier le lecteur audio · ${roomLabel}`}
          >
            {classroomCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
          </button>
        </>
      ) : null}

      <div
        id={classroomCollapsible ? classroomPlayerContentId : undefined}
        className="place-mixer-audio__surface"
        aria-hidden={classroomCollapsible && classroomCollapsed ? true : undefined}
        inert={classroomCollapsible && classroomCollapsed ? true : undefined}
      >
        <div className={`place-mixer-audio__body${desktopDeck ? " is-android-deck" : ""}`}>
          {(!desktopDeck || currentTrack) ? <div className="place-mixer-audio__track">
            <span className="place-mixer-audio__track-summary">
              {!desktopDeck ? <span className="place-mixer-audio__track-icon" aria-hidden="true"><Music2 /></span> : null}
              <span className="place-mixer-audio__meta">
                <strong title={currentTrack?.displayTitle ?? currentTrack?.title}>{currentTrack?.displayTitle ?? currentTrack?.title ?? "Aucun son chargé"}</strong>
                {!desktopDeck && trackHint ? <span className={`place-mixer-audio__track-hint${waveState?.quickPreview ? " is-quick-preview" : ""}`}>{trackHint}</span> : null}
              </span>
            </span>
            {!desktopDeck ? waveListeningSelector : null}
            {!desktopDeck ? <button
              type="button"
              className="place-mixer-audio__import"
              onClick={openUpload}
              aria-label="Importer un son"
              title="Importer un son"
            >
              <Upload aria-hidden="true" /><span>Importer</span>
            </button> : null}
          </div> : null}

          <div
            className={`place-mixer-audio__waveform${currentTrack ? "" : " is-disabled"}`}
            style={{
              "--audio-progress": `${progress * 100}%`,
              "--cue-progress": `${cueProgress * 100}%`,
            } as CSSProperties}
          >
            {currentTrack ? (
              <>
                <span className="place-mixer-audio__wave-guides" aria-hidden="true">
                  {waveformGuides.map((guide, index) => (
                    <span key={index} style={{ left: `${guide.position * 100}%` }}><time>{formatTime(guide.time)}</time><i /></span>
                  ))}
                </span>
                <span className="place-mixer-audio__waveform-bars" aria-hidden="true">
                  {displayedPeaks.map((peak, index) => (
                    <i
                      key={`${currentWaveformIdentity}-${index}`}
                      className={index < playedWaveformBarCount ? "is-played" : undefined}
                      style={{
                        "--waveform-height": `${waveformPeakHeight(peak)}%`,
                        "--waveform-played-color": playedWaveformColor(index, lastPlayedWaveformIndex),
                      } as CSSProperties}
                    />
                  ))}
                </span>
                {!loopRegion ? <span className="place-mixer-audio__waveform-cursor" aria-hidden="true"><i /></span> : null}
              </>
            ) : (
              <span className="place-mixer-audio__waveform-empty" aria-hidden="true"><i />Forme d’onde en attente<i /></span>
            )}
            {loopRegion ? <PlaceMixerLoopRange region={loopRegion} duration={durationSeconds} onChange={moveLoopEdge} musical={waveState?.regionMode === "musical" ? { grid: waveState.grid, bars: waveState.bars } : undefined} /> : <input
                  className="place-mixer-audio__cue-marker-slider"
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={cueProgress}
                  onChange={(event) => {
                    const next = Number(event.currentTarget.value) * durationSeconds;
                    setCueSeconds(next);
                  }}
                  disabled={!currentTrack}
                  aria-label={currentTrack ? `Point de reprise de ${currentTrack.displayTitle ?? currentTrack.title}` : "Point de reprise indisponible"}
                  aria-valuetext={currentTrack ? `Retour à ${formatTime(cueSeconds)}` : "Aucun son chargé"}
            />}
          </div>

          <div
            className={`place-mixer-audio__timeline${currentTrack ? "" : " is-disabled"}`}
            style={{ "--audio-progress": `${progress * 100}%` } as CSSProperties}
          >
            <input
              className="place-mixer-audio__playhead-slider"
              type="range"
              min="0"
              max="1"
              step="0.001"
              value={progress}
              onChange={(event) => {
                const position = Number(event.currentTarget.value) * durationSeconds;
                const next = (waveState?.mode === "beat" || waveState?.mode === "base") && !waveState.quickPreview ? position : mixerLoopPosition(position, loopRegionRef.current);
                waveEngine?.seek(next);
                if (audioRef.current) audioRef.current.currentTime = next;
                setCurrentSeconds(next);
              }}
              disabled={!currentTrack}
              aria-label={currentTrack ? `Progression de ${currentTrack.displayTitle ?? currentTrack.title}` : "Progression indisponible"}
              aria-valuetext={currentTrack ? `${formatTime(currentSeconds)} sur ${formatTime(durationSeconds || currentTrack.durationSeconds)}` : "Aucun son chargé"}
            />
            {currentTrack ? <>
              <span className="place-mixer-audio__time">{formatPreciseTime(currentSeconds)}</span>
              <span className="place-mixer-audio__time is-total">{formatPreciseTime(durationSeconds || currentTrack.durationSeconds || 0)}</span>
            </> : null}
          </div>

          <div className="place-mixer-audio__controls">
            {desktopDeck ? <>
              <button type="button" className="place-mixer-deck__route" aria-label="Destination du lecteur" aria-pressed={route === "public"}
                disabled={!currentTrack || !previewReady || routePending} onClick={() => { void selectRoute(route === "public" ? "preview" : "public"); }}>
                {route === "public" ? personalSend ? "Mon mix" : "Public" : "Privé"}
              </button>
              <button type="button" className="place-mixer-deck__key" onClick={openUpload} aria-label="Importer un son"><Upload aria-hidden="true" /></button>
              {routingStatus ? <small className="sr-only" role="status">{routingStatus}</small> : null}
            </> : <div className="place-mixer-audio__routing">
              <span role="radiogroup" aria-label="Destination du lecteur">
                <button
                  type="button"
                  role="radio"
                  aria-checked={route === "preview"}
                  className={route === "preview" ? "is-active" : undefined}
                  disabled={!currentTrack || !previewReady || routePending}
                  onClick={() => { void selectRoute("preview"); }}
                >
                  <Headphones aria-hidden="true" /><b>Préécoute</b>
                </button>
                <i aria-hidden="true" />
                <button
                  type="button"
                  role="radio"
                  aria-checked={route === "public"}
                  className={route === "public" ? "is-active" : undefined}
                  disabled={!currentTrack || !previewReady || routePending}
                  onClick={() => { void selectRoute("public"); }}
                >
                  <Globe2 aria-hidden="true" /><b>{personalSend ? "Mon mix" : "Public"}</b>
                  {publicAudienceConfirmed ? <em aria-hidden="true" /> : null}
                </button>
              </span>
              {routingStatus ? <small className="sr-only" role="status" aria-live="polite">{routingStatus}</small> : null}
            </div>}
            <span className="place-mixer-audio__transport-buttons">
              <button
                type="button"
                onClick={handlePreviousTrack}
                disabled={!currentTrack || !canNavigateTracks}
                aria-label="Piste précédente"
              >
                <SkipBack aria-hidden="true" />
              </button>
              <button
                type="button"
                className="place-mixer-audio__play"
                onClick={togglePlayback}
                disabled={!isPlaying && !countdownPending && (!currentTrack || !waveReferenceReady || (route === "public" && !previewReady) || playbackPending || routePending)}
                aria-label={currentTrack
                  ? countdownPending
                    ? "Annuler le compte à rebours"
                    : isPlaying
                    ? "Mettre en pause"
                    : route === "public"
                      ? "Diffuser dans la Room"
                      : "Préécouter localement"
                  : "Lecture indisponible"}
              >
                {isPlaying || countdownPending ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              </button>
              <button type="button" onClick={handleNextTrack} disabled={!currentTrack || !canNavigateTracks} aria-label="Piste suivante"><SkipForward aria-hidden="true" /></button>
            </span>
            {desktopDeck ? <>
              <button type="button" className="place-mixer-deck__key" aria-label="Boucle" aria-pressed={Boolean(loopRegion)} disabled={!currentTrack || durationSeconds <= 0} onClick={toggleLoopRegion}><Repeat aria-hidden="true" /></button>
              <button type="button" className="place-mixer-deck__key" aria-label="Afficher les pistes" aria-expanded={pickerView === "queue"} onClick={() => setPickerView(pickerView === "queue" ? "closed" : "queue")}><Layers aria-hidden="true" /></button>
            </> : null}
            {!desktopDeck ? playbackOptions : null}
          </div>
          {desktopDeck && pickerView === "queue" ? <section className="place-mixer-deck__queue" aria-label="Pistes du Mixeur">
        <div className="place-mixer-deck__queue-list">
          {queue.length ? queueList : <button type="button" className="place-mixer-deck__queue-empty" onClick={openUpload} aria-label="Ajouter un son"><Plus aria-hidden="true" /></button>}
        </div>
        {queue.length ? <button type="button" className="place-mixer-deck__queue-add" onClick={openUpload}><Plus aria-hidden="true" /> Ajouter des sons</button> : null}
          </section> : null}
          {desktopDeck ? <div className="place-mixer-deck__bottom">{playbackOptions}</div> : null}
        </div>
      </div>
      {waveTransport && (pickerView === "wave-destination" || pickerView === "sources") && audioRef.current?.closest<HTMLElement>(".place-studio-panel") ? createPortal(
        <div className={`place-mixer-audio__source-menu place-mixer-audio__wave-flow${pickerView === "wave-destination" ? " is-destination" : " is-sources"}`}
          role={pickerView === "wave-destination" ? "dialog" : "menu"}
          aria-label={pickerView === "wave-destination" ? "Importer dans la Wave" : "Choisir la source"}
          aria-modal={pickerView === "wave-destination" ? true : undefined}
          onKeyDown={keepImportFocus}
        >
          <strong className="place-mixer-audio__source-menu-title">{pickerView === "wave-destination" ? "Importer dans la Wave" : waveImportDestination === "base" ? "Importer une boucle de base" : waveImportDestination === "vote" ? "Importer une boucle de vote" : "Importer dans le lecteur"}</strong>
          {pickerView === "wave-destination" ? <div className="place-mixer-wave-import__choices" role="group" aria-label="Destination du son">
            {([
              { id: "base", title: "Boucle de base", detail: "Devient la base active du séquenceur.", Icon: Repeat },
              { id: "vote", title: "Boucle de vote", detail: "Rejoint le sas de vote.", Icon: ListMusic },
              { id: "player", title: "Dans le lecteur", detail: "Ajoute une prod à la liste de lecture.", Icon: Music2 },
            ] as const).map(({ id, title, detail, Icon }, index) => <button key={id} type="button" autoFocus={index === 0} onClick={() => { setWaveImportDestination(id); setPickerView("sources"); }}><Icon aria-hidden="true" /><span><strong>{title}</strong><small>{detail}</small></span></button>)}
          </div> : <>
            <button type="button" role="menuitem" autoFocus onClick={() => fileInputRef.current?.click()}><Smartphone aria-hidden="true" /><span>Depuis mon appareil</span></button>
            <button type="button" role="menuitem" onClick={() => setPickerView("library")}><Library aria-hidden="true" /><span>Depuis ma médiathèque</span></button>
            <button type="button" role="menuitem" onClick={() => { setWaveSetlist(null); setPickerView("setlists"); }}><ListMusic aria-hidden="true" /><span>Depuis mes setlists</span></button>
            <button type="button" role="menuitem" className="place-mixer-audio__cover-picker" onClick={() => setPickerView("covers")}>
              {pendingImportCover ? <img src={pendingImportCover} alt="" /> : <Images aria-hidden="true" />}
              <span>Choisir une cover</span>
            </button>
            <button type="button" role="menuitem" onClick={openUpload}><ChevronLeft aria-hidden="true" /><span>Changer de destination</span></button>
          </>}
          <button type="button" className="is-close" onClick={() => setPickerView("closed")} aria-label="Fermer"><X aria-hidden="true" /></button>
        </div>, audioRef.current.closest<HTMLElement>(".place-studio-panel")!
      ) : !waveTransport && pickerView === "sources" ? (
        <div className="place-mixer-audio__source-menu" role="menu" aria-label="Choisir la source">
          <strong className="place-mixer-audio__source-menu-title">Importer un son</strong>
          <button type="button" role="menuitem" autoFocus onClick={() => fileInputRef.current?.click()}><Smartphone aria-hidden="true" /><span>Depuis mon appareil</span></button>
          <button type="button" role="menuitem" onClick={() => setPickerView("library")}><Library aria-hidden="true" /><span>Depuis ma médiathèque</span></button>
          <button type="button" role="menuitem" onClick={() => { setWaveSetlist(null); setPickerView("setlists"); }}><ListMusic aria-hidden="true" /><span>Depuis mes setlists</span></button>
          <button type="button" role="menuitem" className="place-mixer-audio__cover-picker" onClick={() => setPickerView("covers")}>
            {pendingImportCover ? <img src={pendingImportCover} alt="" /> : <Images aria-hidden="true" />}
            <span>Choisir une cover</span>
          </button>
          <button type="button" className="is-close" onClick={() => setPickerView("closed")} aria-label="Fermer"><X aria-hidden="true" /></button>
        </div>
      ) : null}

      {pickerView === "covers" ? (
        <div className="place-mixer-audio-drawer place-mixer-cover-drawer" role="dialog" aria-modal="false" aria-label={pickerTitle}>
          <header>
            <button type="button" onClick={() => setPickerView("sources")} aria-label="Retour"><ChevronLeft aria-hidden="true" /></button>
            <strong>{pickerTitle}</strong>
            <button type="button" onClick={() => setPickerView("closed")} aria-label="Fermer"><X aria-hidden="true" /></button>
          </header>
          <div className="place-mixer-cover-wall" role="listbox" aria-label="Collection de douze covers">
            {PLACE_MIXER_FALLBACK_COVERS.map((cover, index) => (
              <button
                type="button"
                role="option"
                aria-selected={pendingImportCover === cover}
                aria-label={`Cover ${index + 1}`}
                className={pendingImportCover === cover ? "is-selected" : undefined}
                key={cover}
                onClick={() => {
                  setPendingImportCover(cover);
                  setPickerView("sources");
                }}
              >
                <img src={cover} alt="" />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="place-mixer-cover-drawer__automatic"
            onClick={() => {
              setPendingImportCover(null);
              setPickerView("sources");
            }}
          >
            Attribution automatique
          </button>
        </div>
      ) : null}

      {(pickerView === "library" || pickerView === "setlists" || (!desktopDeck && pickerView === "queue")) && typeof document !== "undefined" ? createPortal(
        <div
          className="place-mixer-audio-library-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPickerView("closed");
          }}
        >
          <section className={`place-mixer-audio-library-modal__panel${pickerView === "queue" ? " is-queue" : ""}`} role="dialog" aria-modal="true" aria-label={pickerTitle}>
            <header>
              <button type="button" onClick={() => { if (waveSetlist) setWaveSetlist(null); else if (pickerView === "queue") openUpload(); else setPickerView("sources"); }} aria-label={waveSetlist ? "Retour aux setlists" : "Retour aux sources"}><ChevronLeft aria-hidden="true" /></button>
              <strong>{pickerTitle}</strong>
              <button type="button" onClick={() => setPickerView("closed")} aria-label="Fermer"><X aria-hidden="true" /></button>
            </header>
            <div className="place-mixer-audio-library-modal__list">
              {pickerView === "queue" ? queue.length > 0 ? queueList : <p className="place-mixer-audio-library-modal__empty">Aucun son dans la playlist.</p> : pickerView === "library" || waveSetlist ? (waveSetlist?.tracks ?? libraryTracks).map((track) => (
                <button type="button" key={track.id} className="place-mixer-audio-library-modal__choice" onClick={() => importSelectedTracks([{ ...track, coverSeed: track.coverSeed ?? track.id, id: `${track.id}-${Date.now()}` }])}>
                  <span><Music2 aria-hidden="true" /></span><strong>{track.title}</strong><small>{formatTime(track.durationSeconds)}</small><Plus aria-hidden="true" />
                </button>
              )) : setlists.map((setlist) => (
                <button type="button" key={setlist.id} className="place-mixer-audio-library-modal__choice" onClick={() => { if (waveTransport && waveImportDestination !== "player") setWaveSetlist(setlist); else importSelectedTracks(cloneTracks(setlist.tracks, `${setlist.id}-${Date.now()}`)); }}>
                  <span><ListMusic aria-hidden="true" /></span><strong>{setlist.title}</strong><small>{setlist.tracks.length} contenus</small><Plus aria-hidden="true" />
                </button>
              ))}
            </div>
            {pickerView === "queue" ? (
              <button type="button" className="place-mixer-audio-library-modal__add" onClick={openUpload}><Plus aria-hidden="true" />Ajouter des sons</button>
            ) : null}
          </section>
        </div>,
        document.body,
      ) : null}

      {waveImportTitle && typeof document !== "undefined" ? createPortal(
        <div className="place-mixer-wave-import" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeWaveImport();
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="wave-import-title" onKeyDown={event => { if (event.key === "Escape") closeWaveImport(); keepImportFocus(event); }}>
            <header>
              <span><Music2 aria-hidden="true" /><span><small>IMPORT WAVE</small><strong id="wave-import-title">Comment intégrer ce son ?</strong></span></span>
              <button type="button" aria-label="Fermer" disabled={waveImportPending} onClick={closeWaveImport}><X /></button>
            </header>
            <p><strong>{waveImportTitle}</strong><small>{waveImportDestination === "base" ? "Boucle de base · séquenceur" : waveImportDestination === "vote" ? "Boucle de vote · sas de vote" : "Choisis sa destination"} · Choisis le type de boucle, puis valide.</small></p>
            {!waveImportDestination ? <div className="place-mixer-wave-import__choices" role="group" aria-label="Destination du son">
              <button type="button" disabled={waveImportPending} aria-pressed={waveImportDestination === "base"} onClick={() => setWaveImportDestination("base")}>
                <Music2 /><span><strong>Nouvelle boucle de base</strong><small>Remplace la référence du lecteur et conserve l’horloge musicale.</small></span>
              </button>
              <button type="button" disabled={waveImportPending} aria-pressed={waveImportDestination === "vote"} onClick={() => setWaveImportDestination("vote")}>
                <ListMusic /><span><strong>Boucle de vote</strong><small>Rejoint le sas de vote.</small></span>
              </button>
            </div> : null}
            <fieldset disabled={waveImportPending} role="radiogroup" aria-label="Type de la boucle">
              <legend>Type de la boucle</legend>
              {WAVE_LOOP_CATEGORIES.map((category) => <button key={category.id} type="button" role="radio"
                aria-checked={waveImportCategory === category.id} className={waveImportCategory === category.id ? "is-active" : ""}
                style={{ "--wave-import-accent": category.color } as CSSProperties}
                onClick={() => setWaveImportCategory(category.id)}>{category.badge}</button>)}
            </fieldset>
            {waveImportAnalyzing ? <p className="place-mixer-wave-import__analysis" role="status">Analyse de l’horloge musicale…</p> : null}
            {waveImportError ? <p className="place-mixer-wave-import__error" role="alert">{waveImportError}</p> : null}
            <footer className="place-mixer-wave-import__actions">
              <button type="button" disabled={waveImportPending} onClick={closeWaveImport}>Annuler</button>
              <button type="button" className="is-primary" disabled={!pendingWaveImport || !waveImportDestination || !waveImportCategory || waveImportPending || waveImportAnalyzing} onClick={() => void commitWaveImport()}>{waveImportPending ? "Import en cours…" : "Valider l’import"}</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}

    </section>
  );
}
