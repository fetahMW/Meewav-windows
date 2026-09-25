import CageStageProgram from "./CageStageProgram";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { SyntheticEvent, PointerEvent } from "react";
import {
  ArrowDownToLine,
  BarChart3,
  Camera,
  CameraOff,
  ChevronDown,
  Expand,
  Eye,
  LayoutPanelTop,
  Mic,
  MicOff,
  MonitorUp,
  Radio,
  Sparkles,
  Volume2,
  VolumeX,
} from "lucide-react";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import type { GradeLevel } from "../../grades/gradeBadges";
import { useRoomPresentation } from "../roomPresentation";
import PlaceGiftDrawOverlay from "./PlaceGiftDrawOverlay";
import LiveActionBar from "./LiveActionBar";
import PlaceRemoteAudioRenderer from "./PlaceRemoteAudioRenderer";
import type { PlaceLiveKitVideoTrack, PlaceRemoteAudioTrack } from "./placeLiveKit.service";
import type { PlaceRoomState } from "./place.types";
import {
  compositionToStageMode,
  createInitialProgramLayout,
  createInitialViewerLayout,
  hasMeaningfulDirectorActivity,
  inferParticipantAspectRatio,
  isEditableTarget,
  orderParticipants,
  resolveFilmstripPosition,
  resolveLayoutRecipe,
  resolveParticipantSource,
  resolveParticipantSources,
  resolvePrimaryParticipantId,
  resolveStageDisplaySize,
  scoreParticipantForDirection,
  stageModeToComposition,
  PLACE_STAGE_MAX_SMART_ZOOM,
  type PlaceProgramLayoutState,
  type PlaceStageAspectRatio,
  type PlaceStageComposition,
  type PlaceStageDisplaySize,
  type PlaceStageMode,
  type PlaceStageParticipant,
  type PlaceStageTransition,
  type PlaceViewerLayoutState,
  type PlaceVideoSourceAudience,
} from "./placeStageLayoutEngine";
import PlaceStageLayoutTile from "./placeStageLayoutTile";
import "./placeStageLayout.css";
import { useWaveViewerListening } from "../wave-viewer/WaveViewerListening";
import { useRuntime } from "../../../runtime/RuntimeProvider";
import { hasPlaceGuestDrag, readPlaceGuestDrag, writePlaceGuestDrag } from "./placeGuestDrag";

type PlaceStageProps = {
  room: PlaceRoomState;
  isHost: boolean;
  isGuest: boolean;
  canEngage: boolean;
  currentUserId?: string | null;
  hostCameraEnabled: boolean;
  hostMicrophoneEnabled: boolean;
  hostMonitoringEnabled: boolean;
  onToggleHostMicrophone: () => void;
  onToggleHostCamera: () => void;
  onToggleHostMonitoring: () => void;
  onVotePoll: (optionIndex: number) => void;
  onNotice: (message: string) => void;
  screenShareStream: MediaStream | null;
  screenSharePublished: boolean;
  screenShareRequesting: boolean;
  onStartScreenShare: () => void;
  onStopScreenShare: () => void;
  remoteAudioTracks?: PlaceRemoteAudioTrack[];
  liveKitVideoTracks?: PlaceLiveKitVideoTrack[];
  rtcAudioPlaybackReady?: boolean;
  /** Prevents a called contact from hearing its own program return or the Host twice. */
  suppressPhoneCallAudio?: boolean;
  /** A called contact must never receive the aggregate track containing its own delayed voice. */
  excludeOwnPhoneCallAudio?: boolean;
  /** HLS can replace the private return only while the contact's own call is proven off-air. */
  allowHlsPhoneCallHandoff?: boolean;
  /** Reports when the complete public programme can safely replace a called contact's private Host return. */
  onViewerProgramActiveChange?: (active: boolean) => void;
  onStartRemoteAudio?: () => Promise<boolean>;
  onOpenProfile: (profileId: string) => void;
  onMoveGuest?: (participant: PlaceRoomState["participants"][number], destination: "onstage" | "backstage") => Promise<void>;
  panelCollapsed: boolean;
  onPanelCollapsedChange: (collapsed: boolean) => void;
  /** Controlled by Supabase Realtime in a live Room; local in demo/fallback mode. */
  programLayout?: PlaceProgramLayoutState | null;
  onProgramLayoutChange?: (layout: PlaceProgramLayoutState) => void | Promise<void>;
  canDirectProgram?: boolean;
  onParticipantQualityIntent?: (roomId: string, participantId: string, sourceId: string, intent: "high" | "low" | "suspended") => void;
  smartFramingEnabled?: boolean;
  framingLocked?: boolean;
  onSmartFramingChange?: (enabled: boolean, maxZoom: number) => void;
  onFramingLockChange?: (locked: boolean) => void;
};

const countFormatter = new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 });
const SHOW_ADVANCED_DIRECTOR_CONTROLS = false;

function safeAudioGain(value: number | undefined, fallback = 1) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value! : fallback));
}

export function resolvePlaceViewerCallHandoff({
  isHost,
  isGuest,
  playbackRequested,
  publicOutputMuted,
  rtcProgrammeReady,
  hlsProgrammeReady,
}: {
  isHost: boolean;
  isGuest: boolean;
  playbackRequested: boolean;
  publicOutputMuted: boolean;
  rtcProgrammeReady: boolean;
  hlsProgrammeReady: boolean;
}) {
  return !isHost
    && !isGuest
    && playbackRequested
    && !publicOutputMuted
    && (rtcProgrammeReady || hlsProgrammeReady);
}

function visualProgramSignature(layout: PlaceProgramLayoutState) {
  return JSON.stringify({
    mode: layout.mode,
    primaryParticipantId: layout.primaryParticipantId,
    lockedParticipantId: layout.lockedParticipantId ?? null,
    participantOrder: layout.participantOrder,
    selectedSourceByParticipant: layout.selectedSourceByParticipant,
    transition: layout.transition ?? "dissolve",
    preset: layout.preset ?? "performance",
    autoDirectorProfile: layout.autoDirectorProfile ?? "calm",
    safeFramingByParticipant: layout.safeFramingByParticipant ?? {},
  });
}

function ScreenShareMedia({ stream }: { stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => { video.srcObject = null; };
  }, [stream]);
  return <article className="place-screen-share"><video ref={videoRef} autoPlay muted playsInline /><span><MonitorUp aria-hidden="true" /> ÉCRAN PARTAGÉ</span></article>;
}

function LiveKitScreenShareMedia({ item }: { item: PlaceLiveKitVideoTrack }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    item.track.attach(video);
    video.muted = true;
    void video.play().catch(() => undefined);
    return () => {
      item.track.detach(video);
      video.srcObject = null;
    };
  }, [item.track]);
  return <article className="place-screen-share"><video ref={videoRef} autoPlay muted playsInline /><span><MonitorUp aria-hidden="true" /> ÉCRAN PARTAGÉ</span></article>;
}

export default function PlaceStage({
  room,
  isHost,
  isGuest,
  canEngage,
  currentUserId,
  hostCameraEnabled,
  hostMicrophoneEnabled,
  hostMonitoringEnabled,
  onToggleHostMicrophone,
  onToggleHostCamera,
  onToggleHostMonitoring,
  onVotePoll,
  onNotice,
  screenShareStream,
  screenSharePublished,
  screenShareRequesting,
  onStartScreenShare,
  onStopScreenShare,
  remoteAudioTracks = [],
  liveKitVideoTracks = [],
  rtcAudioPlaybackReady = false,
  suppressPhoneCallAudio = false,
  excludeOwnPhoneCallAudio = false,
  allowHlsPhoneCallHandoff = true,
  onViewerProgramActiveChange,
  onStartRemoteAudio,
  onOpenProfile,
  onMoveGuest,
  panelCollapsed,
  onPanelCollapsedChange,
  programLayout: controlledProgramLayout,
  onProgramLayoutChange,
  canDirectProgram = true,
  onParticipantQualityIntent,
}: PlaceStageProps) {
  const desktopStage = useRuntime().isDesktop && isHost;
  const [guestDropActive, setGuestDropActive] = useState(false);
  const roomPresentation = useRoomPresentation();
  const isCageStage = roomPresentation.id === "cage";
  const ControlBar = isGuest ? "div" : LiveActionBar;
  const [fallbackPlaybackMuted, setFallbackPlaybackMuted] = useState(true);
  const waveListening = useWaveViewerListening();
  const playbackMuted = !isHost && !isGuest && waveListening ? waveListening.liveMuted : fallbackPlaybackMuted;
  const setPlaybackMuted = !isHost && !isGuest && waveListening ? waveListening.setLiveMuted : setFallbackPlaybackMuted;
  const privateWaveListening = !isHost && !isGuest && waveListening && waveListening.mode !== "live";
  const waveListeningRef = useRef(waveListening);
  waveListeningRef.current = waveListening;
  const currentJourneyStatus = room.participants.find(participant => participant.profile.id === currentUserId)?.status;
  useEffect(() => {
    if (waveListeningRef.current?.mode !== "live" && (isHost || isGuest || ["accepted", "ready", "backstage", "onstage"].includes(currentJourneyStatus ?? ""))) waveListeningRef.current?.returnLive();
  }, [isHost, isGuest, currentJourneyStatus, waveListening?.mode]);
  const [hlsProgramPlaybackReady, setHlsProgramPlaybackReady] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(!isCageStage || isHost || isGuest);
  const [now, setNow] = useState(() => Date.now());
  const [stageWidth, setStageWidth] = useState(1_200);
  const [stageHeight, setStageHeight] = useState(675);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [fullscreenActive, setFullscreenActive] = useState(false);
  const [suggestedParticipantId, setSuggestedParticipantId] = useState<string>();
  const [performerParticipantId, setPerformerParticipantId] = useState<string>();
  const [screenShareOnAir, setScreenShareOnAir] = useState(false);
  const [programMutationPending, setProgramMutationPending] = useState(false);
  const [previewSourceByParticipant, setPreviewSourceByParticipant] = useState<Record<string, string>>({});
  const [viewerLayout, setViewerLayout] = useState<PlaceViewerLayoutState>(createInitialViewerLayout);
  const [selectedParticipantId, setSelectedParticipantId] = useState("");
  const [aspectRatios, setAspectRatios] = useState<Record<string, PlaceStageAspectRatio>>({});
  const stageRef = useRef<HTMLDivElement | null>(null);
  const layoutTriggerRef = useRef<HTMLButtonElement | null>(null);
  const layoutMenuRef = useRef<HTMLDivElement | null>(null);
  const programMutationPendingRef = useRef(false);
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoDirectorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoSwitchRef = useRef(Date.now());

  const onStage = useMemo<PlaceStageParticipant[]>(() => {
    const host = room.participants.find((participant) => (
      participant.status === "host"
      || participant.profile.id === room.host.id
      || participant.id === "host"
    ));
    const guests = room.participants.filter((participant) => (
      participant.status === "onstage" && participant.id !== host?.id
    ));
    return (host ? [host, ...guests.slice(0, 3)] : guests.slice(0, 4)) as PlaceStageParticipant[];
  }, [room.host.id, room.participants]);
  const [localProgramLayout, setLocalProgramLayout] = useState<PlaceProgramLayoutState>(() => (
    createInitialProgramLayout(onStage, room.host.id)
  ));
  const [presentedControlledProgramLayout, setPresentedControlledProgramLayout] = useState<PlaceProgramLayoutState | null>(
    controlledProgramLayout ?? null,
  );
  const lastProgramPrimaryRef = useRef(controlledProgramLayout?.primaryParticipantId ?? localProgramLayout.primaryParticipantId);
  const qualityIntentRef = useRef(new Map<string, {
    roomId: string;
    participantId: string;
    sourceId: string;
    intent: "high" | "low" | "suspended";
  }>());
  const directorSignalSignature = onStage.map((participant) => JSON.stringify({
    id: participant.id,
    camera: participant.isCameraEnabled,
    microphone: participant.isMicrophoneEnabled,
    speaking: participant.isSpeaking,
    latency: participant.latencyMs,
    signals: participant.directorSignals ?? null,
  })).join("|");
  const authoritativeProgramLayout = controlledProgramLayout ?? localProgramLayout;
  const programLayout = controlledProgramLayout
    ? presentedControlledProgramLayout ?? controlledProgramLayout
    : localProgramLayout;
  const transitionStyle = authoritativeProgramLayout.transition ?? "dissolve";
  const autoDirectorProfile = authoritativeProgramLayout.autoDirectorProfile ?? "calm";
  const stagePreset = authoritativeProgramLayout.preset ?? "performance";
  const displayedSourceByParticipant = useMemo(() => ({
    ...programLayout.selectedSourceByParticipant,
    ...viewerLayout.selectedSourceByParticipant,
    ...(isHost ? previewSourceByParticipant : {}),
  }), [isHost, previewSourceByParticipant, programLayout.selectedSourceByParticipant, viewerLayout.selectedSourceByParticipant]);
  const hasPersonalView = !viewerLayout.followingProgram
    || Object.keys(viewerLayout.selectedSourceByParticipant).length > 0;
  const sourceAudienceForParticipant = useCallback((participantId: string): PlaceVideoSourceAudience => (
    isHost || !viewerLayout.selectedSourceByParticipant[participantId] ? "program" : "viewer"
  ), [isHost, viewerLayout.selectedSourceByParticipant]);
  const participantAspectRatio = useCallback((participant: PlaceStageParticipant) => {
    const source = resolveParticipantSource(
      participant,
      displayedSourceByParticipant[participant.id],
      sourceAudienceForParticipant(participant.id),
    );
    return aspectRatios[`${participant.id}:${source?.id ?? "primary"}`]
      ?? source?.aspectRatio
      ?? inferParticipantAspectRatio(participant);
  }, [aspectRatios, displayedSourceByParticipant, sourceAudienceForParticipant]);
  const availableParticipantIds = new Set(onStage.map((participant) => participant.id));
  const resolvedProgramPrimaryId = [
    programLayout.lockedParticipantId,
    programLayout.primaryParticipantId,
    onStage.find((participant) => participant.status === "host" || participant.profile.id === room.host.id)?.id,
    onStage[0]?.id,
  ].find((participantId): participantId is string => Boolean(participantId && availableParticipantIds.has(participantId))) ?? "";
  const primaryParticipantId = resolvePrimaryParticipantId({
    viewer: viewerLayout,
    program: programLayout,
    participants: onStage,
    hostId: room.host.id,
  });
  const onStageIdentitySet = useMemo(
    () => new Set(onStage.map((participant) => participant.profile.id)),
    [onStage],
  );
  const liveKitCameraByParticipant = useMemo(() => {
    const tracks = new Map<string, PlaceLiveKitVideoTrack>();
    liveKitVideoTracks.forEach((item) => {
      if (item.source !== "camera"
        || item.muted
        || !onStageIdentitySet.has(item.participantIdentity)
        || tracks.has(item.participantIdentity)) return;
      tracks.set(item.participantIdentity, item);
    });
    return tracks;
  }, [liveKitVideoTracks, onStageIdentitySet]);
  const liveKitScreenShare = useMemo(() => (
    liveKitVideoTracks.find((item) => (
      item.source === "screen_share"
      && !item.muted
      && item.participantIdentity === room.host.id
      && onStageIdentitySet.has(item.participantIdentity)
    )) ?? null
  ), [liveKitVideoTracks, onStageIdentitySet, room.host.id]);
  const voicePlaybackByIdentity = useMemo(() => {
    const playback = new Map<string, number>();
    onStage.forEach((participant) => {
      const channel = room.channels.find((candidate) => (
        (candidate.kind === "microphone" || candidate.kind === "guest")
        && candidate.participantId === participant.profile.id
      ));
      // A missing public projection is not equivalent to gain=1/route=true.
      // Fail closed and retain HLS until the backend supplied the public mix.
      if (channel?.publicMixAuthoritative !== true
        || !participant.isMicrophoneEnabled
        || channel?.isMuted
        || channel?.isHostForcedMuted
        || channel?.isRoutedToPublic === false) return;
      playback.set(participant.profile.id, safeAudioGain(channel?.gain));
    });
    return playback;
  }, [onStage, room.channels]);
  const publicMusicChannel = room.channels.find((channel) => (
    channel.kind === "audio" && channel.participantId === room.host.id
  ));
  const publicMusicExpected = (room.track.audioRoute === "public"
      || publicMusicChannel?.isRoutedToPublic === true)
    && (room.track.audioPlaybackState === "playing" || room.track.isPlaying)
    && publicMusicChannel?.isMuted !== true;
  const masterChannel = room.channels.find((channel) => channel.kind === "master");
  const publicOutputMuted = masterChannel?.isMuted === true;
  const localReturnGain = !isHost ? (waveListening?.returnMuted ? 0 : waveListening?.returnVolume ?? 1) : 1;
  const masterGain = publicOutputMuted ? 0 : localReturnGain * safeAudioGain(masterChannel?.gain) * (!isHost && !isGuest ? waveListening?.liveVolume ?? 1 : 1);
  const remoteAudioTracksByPolicy = useMemo(() => {
    const resolve = (suppressPrivateHostReturn: boolean) => remoteAudioTracks.flatMap((item) => {
      if (item.muted) return [];
      if (item.purpose === "voice") {
        if (suppressPrivateHostReturn && item.participantIdentity === room.host.id) return [];
        const voiceGain = voicePlaybackByIdentity.get(item.participantIdentity);
        return voiceGain === undefined ? [] : [{ ...item, playbackVolume: voiceGain * masterGain }];
      }
      if (item.purpose === "music") {
        if (!publicMusicExpected || item.participantIdentity !== room.host.id) return [];
        return [{
          ...item,
          playbackVolume: safeAudioGain(publicMusicChannel?.gain) * masterGain,
        }];
      }
      if (item.purpose === "phone_call") {
        if (excludeOwnPhoneCallAudio
          || suppressPrivateHostReturn
          || item.participantIdentity !== room.host.id) return [];
        return [{ ...item, playbackVolume: masterGain }];
      }
      if (item.participantIdentity !== room.host.id
        || !onStageIdentitySet.has(item.participantIdentity)) return [];
      return [{ ...item, playbackVolume: masterGain }];
    });
    return {
      publicProgramme: resolve(false),
      privateReturnSafe: resolve(true),
    };
  }, [
    masterGain,
    onStageIdentitySet,
    publicMusicChannel?.gain,
    publicMusicExpected,
    remoteAudioTracks,
    room.host.id,
    excludeOwnPhoneCallAudio,
    voicePlaybackByIdentity,
  ]);
  const playableRemoteAudioTracks = suppressPhoneCallAudio
    ? remoteAudioTracksByPolicy.privateReturnSafe
    : remoteAudioTracksByPolicy.publicProgramme;
  const publicRtcVoiceIdentities = useMemo(() => new Set(
    remoteAudioTracksByPolicy.publicProgramme
      .filter((item) => item.purpose === "voice")
      .map((item) => item.participantIdentity),
  ), [remoteAudioTracksByPolicy.publicProgramme]);
  const rtcVoicePolicyComplete = onStage.every((participant) => room.channels.some((channel) => (
    (channel.kind === "microphone" || channel.kind === "guest")
    && channel.participantId === participant.profile.id
    && channel.publicMixAuthoritative === true
  )));
  const rtcVoiceCoverageComplete = [...voicePlaybackByIdentity.keys()]
    .every((identity) => publicRtcVoiceIdentities.has(identity));
  const rtcMusicCoverageComplete = !publicMusicExpected
    || remoteAudioTracksByPolicy.publicProgramme.some((item) => item.purpose === "music");
  const hasExpectedRtcAudio = voicePlaybackByIdentity.size > 0
    || publicMusicExpected
    || (!excludeOwnPhoneCallAudio
      && remoteAudioTracksByPolicy.publicProgramme.some((item) => item.purpose === "phone_call"))
    || remoteAudioTracksByPolicy.publicProgramme.some((item) => item.purpose === "screen_share_audio");
  const rtcAudioMixComplete = hasExpectedRtcAudio
    && rtcVoicePolicyComplete
    && rtcVoiceCoverageComplete
    && rtcMusicCoverageComplete;
  const hasHlsFallback = useMemo(() => onStage.some((participant) => (
    resolveParticipantSources(participant, "viewer").some((source) => source.transport === "hls")
  )), [onStage]);
  const viewerRtcAudioPrimary = rtcAudioPlaybackReady
    && (rtcAudioMixComplete || !hasHlsFallback);
  const waveVoiceAvailable = viewerRtcAudioPrimary && playableRemoteAudioTracks.some(track => track.purpose === "voice" && track.participantIdentity === room.host.id);
  useEffect(() => { waveListeningRef.current?.setVoiceAvailable(waveVoiceAvailable); }, [waveVoiceAvailable]);
  // A LiveKit camera uses a video-only element. Switching that element before
  // the RTC audio mix is ready would silently discard the HLS audio fallback.
  // Keep Viewer video on HLS until the audio hand-off can happen atomically.
  const rtcVideoPrimary = isHost || isGuest || !hasHlsFallback || viewerRtcAudioPrimary;
  const liveKitScreenShareForPlayback = rtcVideoPrimary ? liveKitScreenShare : null;
  const remoteAudioEnabled = rtcAudioPlaybackReady
    && !publicOutputMuted
    && (!privateWaveListening || (waveVoiceAvailable && waveListening?.keepVoice))
    && (isHost || isGuest || (!playbackMuted && viewerRtcAudioPrimary));
  // A contact with a confirmed private return hears the Host on that private
  // path. Keep the HLS programme muted too, otherwise its delayed Host audio
  // would be heard a second time while the RTC hand-off settles.
  const viewerProgramMuted = playbackMuted
    || Boolean(privateWaveListening)
    || publicOutputMuted
    || viewerRtcAudioPrimary
    || suppressPhoneCallAudio;
  const publicProgrammeCanReplacePrivateReturn = resolvePlaceViewerCallHandoff({
    isHost,
    isGuest,
    playbackRequested: !playbackMuted,
    publicOutputMuted,
    rtcProgrammeReady: rtcAudioPlaybackReady && rtcAudioMixComplete,
    hlsProgrammeReady: allowHlsPhoneCallHandoff
      && hasHlsFallback
      && !rtcVideoPrimary
      && hlsProgramPlaybackReady,
  });

  useEffect(() => {
    if (!onViewerProgramActiveChange) return undefined;
    onViewerProgramActiveChange(publicProgrammeCanReplacePrivateReturn);
    return () => onViewerProgramActiveChange(false);
  }, [onViewerProgramActiveChange, publicProgrammeCanReplacePrivateReturn]);

  useEffect(() => {
    setHlsProgramPlaybackReady(false);
  }, [room.id]);

  useEffect(() => {
    if (!hasHlsFallback || rtcVideoPrimary) setHlsProgramPlaybackReady(false);
  }, [hasHlsFallback, rtcVideoPrimary]);

  const markHlsProgrammeReady = useCallback((event: SyntheticEvent<HTMLMediaElement>) => {
    if (isHost || isGuest || !hasHlsFallback || rtcVideoPrimary) return;
    if (!(event.target instanceof HTMLVideoElement)) return;
    setHlsProgramPlaybackReady(true);
  }, [hasHlsFallback, isGuest, isHost, rtcVideoPrimary]);

  const markHlsProgrammeUnavailable = useCallback((event: SyntheticEvent<HTMLMediaElement>) => {
    if (isHost || isGuest || !hasHlsFallback || rtcVideoPrimary) return;
    if (!(event.target instanceof HTMLVideoElement)) return;
    setHlsProgramPlaybackReady(false);
  }, [hasHlsFallback, isGuest, isHost, rtcVideoPrimary]);
  const orderedParticipants = useMemo(
    () => orderParticipants(onStage, primaryParticipantId, programLayout.participantOrder),
    [onStage, primaryParticipantId, programLayout.participantOrder],
  );
  const primary = orderedParticipants[0];
  const primaryAspectRatio = primary ? participantAspectRatio(primary) : "16:9";
  const allVertical = orderedParticipants.length > 1 && orderedParticipants.every((participant) => (
    participantAspectRatio(participant) === "9:16"
  ));
  const shortCount = orderedParticipants.filter((participant) => participantAspectRatio(participant) === "9:16").length;
  const normalCount = orderedParticipants.length - shortCount;
  const recipe = resolveLayoutRecipe({
    participantCount: screenShareOnAir ? 1 : orderedParticipants.length,
    mode: programLayout.mode,
    viewer: viewerLayout,
    allVertical,
    participantAspectRatios: orderedParticipants.map(participantAspectRatio),
  });
  const filmstripPosition = resolveFilmstripPosition({
    preference: viewerLayout.filmstripPosition,
    stageWidth,
    stageHeight,
    primaryAspectRatio,
    participantAspectRatios: orderedParticipants.map(participantAspectRatio),
  });
  const explicitlySelectedParticipant = selectedParticipantId
    ? orderedParticipants.find((participant) => participant.id === selectedParticipantId)
    : undefined;
  const selectedParticipant = explicitlySelectedParticipant ?? primary;
  const selectedPreviewSourceId = selectedParticipant ? previewSourceByParticipant[selectedParticipant.id] : undefined;
  const selectedSourcePending = Boolean(
    isHost
    && selectedParticipant
    && selectedPreviewSourceId
    && selectedPreviewSourceId !== programLayout.selectedSourceByParticipant[selectedParticipant.id],
  );
  const remoteScreenShareIdentity = liveKitScreenShareForPlayback?.local === false
    ? liveKitScreenShareForPlayback.participantIdentity
    : null;
  const screenShareOwner = remoteScreenShareIdentity
    ? orderedParticipants.find((participant) => participant.profile.id === remoteScreenShareIdentity)
    : orderedParticipants.find((participant) => (
        participant.profile.id === currentUserId
        || (isHost && participant.status === "host")
      )) ?? primary;
  const displayedMode: PlaceStageMode = viewerLayout.soloParticipantId
    ? "solo"
    : !viewerLayout.followingProgram && viewerLayout.gridEnabled
      ? "grid"
      : isHost || viewerLayout.followingProgram
        ? programLayout.mode
        : "stage";
  const displayedComposition = stageModeToComposition(displayedMode);
  const displaySize = resolveStageDisplaySize({ panelCollapsed, fullscreen: fullscreenActive });
  const elapsedSeconds = Math.max(0, Math.floor((now - new Date(room.startedAt).getTime()) / 1_000));
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 3_600)).padStart(2, "0")}:${String(Math.floor((elapsedSeconds % 3_600) / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  const runStageTransition = useCallback((commit: () => void, transition: PlaceStageTransition = transitionStyle) => {
    let committed = false;
    const guardedCommit = () => {
      if (committed) return;
      committed = true;
      flushSync(commit);
    };
    const documentWithTransitions = document as Document & {
      startViewTransition?: (callback: () => void) => unknown;
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    if (transition !== "dissolve" || reduceMotion || !documentWithTransitions.startViewTransition) {
      guardedCommit();
      return;
    }
    try {
      const transitionResult = documentWithTransitions.startViewTransition(guardedCommit) as { ready?: Promise<unknown>; finished?: Promise<unknown> } | undefined;
      void transitionResult?.ready?.catch(() => undefined);
      void transitionResult?.finished?.catch(() => undefined);
    } catch {
      guardedCommit();
    }
  }, [transitionStyle]);

  const applyProgramLayout = useCallback(async (next: PlaceProgramLayoutState) => {
    if (programMutationPendingRef.current) return;
    if (!controlledProgramLayout) {
      runStageTransition(() => setLocalProgramLayout(next), next.transition ?? transitionStyle);
      return;
    }
    if (!canDirectProgram || !onProgramLayoutChange) {
      onNotice("La réalisation Realtime n’est pas disponible. La sélection reste en PREVIEW.");
      return;
    }
    programMutationPendingRef.current = true;
    setProgramMutationPending(true);
    try {
      await onProgramLayoutChange(next);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "La mise à l’antenne a été refusée. Le PROGRAM autoritaire est conservé.");
    } finally {
      programMutationPendingRef.current = false;
      setProgramMutationPending(false);
    }
  }, [canDirectProgram, controlledProgramLayout, onNotice, onProgramLayoutChange, runStageTransition, transitionStyle]);

  const patchProgramLayout = useCallback((patch: Partial<PlaceProgramLayoutState>) => {
    void applyProgramLayout({
      ...authoritativeProgramLayout,
      ...patch,
      updatedBy: currentUserId ?? room.host.id,
      updatedAt: Date.now(),
    });
  }, [applyProgramLayout, authoritativeProgramLayout, currentUserId, room.host.id]);

  const patchViewerLayout = useCallback((patch: Partial<PlaceViewerLayoutState>) => {
    runStageTransition(() => {
      setViewerLayout((current) => ({ ...current, ...patch }));
    });
  }, [runStageTransition]);

  const restoreViewerProgram = useCallback(() => {
    runStageTransition(() => {
      setSelectedParticipantId("");
      setViewerLayout((current) => ({
        ...current,
        followingProgram: true,
        focusedParticipantId: undefined,
        soloParticipantId: undefined,
        fullscreenParticipantId: undefined,
        gridEnabled: false,
        selectedSourceByParticipant: {},
      }));
    });
  }, [runStageTransition]);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    setViewerLayout(createInitialViewerLayout());
    setSelectedParticipantId("");
    setAspectRatios({});
    setSuggestedParticipantId(undefined);
    setPerformerParticipantId(undefined);
    setScreenShareOnAir(false);
    setProgramMutationPending(false);
    programMutationPendingRef.current = false;
    setPreviewSourceByParticipant({});
    setPresentedControlledProgramLayout(controlledProgramLayout ?? null);
    if (!controlledProgramLayout) setLocalProgramLayout(createInitialProgramLayout(onStage, room.host.id));
    lastAutoSwitchRef.current = Date.now();
    lastProgramPrimaryRef.current = controlledProgramLayout?.primaryParticipantId
      ?? createInitialProgramLayout(onStage, room.host.id).primaryParticipantId;
    qualityIntentRef.current.clear();
  // Only a Room identity change resets personal direction state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id]);

  useEffect(() => {
    if (!controlledProgramLayout) {
      setPresentedControlledProgramLayout(null);
      return;
    }
    const current = presentedControlledProgramLayout;
    if (current === controlledProgramLayout) return;
    if (current && visualProgramSignature(current) === visualProgramSignature(controlledProgramLayout)) {
      setPresentedControlledProgramLayout(controlledProgramLayout);
      return;
    }
    runStageTransition(() => setPresentedControlledProgramLayout(controlledProgramLayout), controlledProgramLayout.transition ?? transitionStyle);
  }, [controlledProgramLayout, presentedControlledProgramLayout, runStageTransition, transitionStyle]);

  useEffect(() => {
    if (!screenShareStream && !liveKitScreenShareForPlayback) {
      setScreenShareOnAir(false);
      return;
    }
    // Only the source explicitly selected for sharing reaches the programme.
    setScreenShareOnAir(true);
  }, [liveKitScreenShareForPlayback, screenShareStream]);

  useEffect(() => {
    if (lastProgramPrimaryRef.current === resolvedProgramPrimaryId) return;
    lastProgramPrimaryRef.current = resolvedProgramPrimaryId;
    lastAutoSwitchRef.current = Date.now();
  }, [resolvedProgramPrimaryId]);

  useEffect(() => {
    const element = stageRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width);
      setStageHeight(entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (controlledProgramLayout) return;
    setLocalProgramLayout((current) => {
      const available = new Set(onStage.map((participant) => participant.id));
      const primaryId = available.has(current.primaryParticipantId)
        ? current.primaryParticipantId
        : createInitialProgramLayout(onStage, room.host.id).primaryParticipantId;
      return {
        ...current,
        primaryParticipantId: primaryId,
        lockedParticipantId: current.lockedParticipantId && available.has(current.lockedParticipantId)
          ? current.lockedParticipantId
          : undefined,
        participantOrder: onStage.map((participant) => participant.id),
      };
    });
  }, [controlledProgramLayout, onStage, room.host.id]);

  useEffect(() => {
    if (!selectedParticipantId || onStage.some((participant) => participant.id === selectedParticipantId)) return;
    setSelectedParticipantId("");
  }, [onStage, selectedParticipantId]);

  useEffect(() => {
    if (!performerParticipantId || onStage.some((participant) => participant.id === performerParticipantId)) return;
    setPerformerParticipantId(undefined);
  }, [onStage, performerParticipantId]);

  useEffect(() => {
    setPreviewSourceByParticipant((current) => Object.fromEntries(
      Object.entries(current).filter(([participantId, sourceId]) => (
        onStage.some((participant) => (
          participant.id === participantId
          && resolveParticipantSources(participant, "program").some((source) => source.id === sourceId)
        ))
        && programLayout.selectedSourceByParticipant[participantId] !== sourceId
      )),
    ));
  }, [onStage, programLayout.selectedSourceByParticipant]);

  useEffect(() => {
    controlsTimerRef.current = window.setTimeout(() => {
      if (!stageRef.current?.querySelector(":focus-visible")) setControlsVisible(false);
    }, 2_800);
    return () => {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!SHOW_ADVANCED_DIRECTOR_CONTROLS || !isHost || !canDirectProgram || programMutationPending || authoritativeProgramLayout.mode !== "auto" || authoritativeProgramLayout.lockedParticipantId || screenShareOnAir) return;
    const current = onStage.find((participant) => participant.id === resolvedProgramPrimaryId);
    const withManualPerformer = (participant: PlaceStageParticipant): PlaceStageParticipant => (
      participant.id === performerParticipantId
        ? {
            ...participant,
            directorSignals: {
              ...(participant.directorSignals ?? {}),
              role: "performer",
              manualPriority: 1,
            },
          }
        : participant
    );
    const currentScore = current
      ? scoreParticipantForDirection({ participant: withManualPerformer(current), currentParticipantId: current.id })
      : Number.NEGATIVE_INFINITY;
    const candidate = onStage
      .filter((participant) => participant.id !== current?.id && hasMeaningfulDirectorActivity(withManualPerformer(participant)))
      .map((participant) => ({
        participant,
        score: scoreParticipantForDirection({ participant: withManualPerformer(participant), currentParticipantId: current?.id }),
      }))
      .sort((left, right) => right.score - left.score)[0];
    const suggestionThreshold = autoDirectorProfile === "dynamic" ? 0.08 : 0.14;
    if (!candidate || candidate.score - currentScore < suggestionThreshold) {
      setSuggestedParticipantId(undefined);
      if (autoDirectorTimerRef.current) window.clearTimeout(autoDirectorTimerRef.current);
      return;
    }
    setSuggestedParticipantId(candidate.participant.id);
    if (autoDirectorTimerRef.current) window.clearTimeout(autoDirectorTimerRef.current);
    if (autoDirectorProfile === "manual") return;
    const switchThreshold = autoDirectorProfile === "dynamic" ? 0.18 : 0.3;
    if (candidate.score - currentScore < switchThreshold) return;
    const minimumShotDuration = autoDirectorProfile === "dynamic" ? 6_000 : 8_000;
    const minimumShotRemaining = Math.max(0, minimumShotDuration - (Date.now() - lastAutoSwitchRef.current));
    const cooldownRemaining = Math.max(0, 2_000 - (Date.now() - lastAutoSwitchRef.current));
    const activityDwell = autoDirectorProfile === "dynamic" ? 1_200 : 1_800;
    const delay = Math.max(activityDwell, minimumShotRemaining, cooldownRemaining);
    autoDirectorTimerRef.current = window.setTimeout(() => {
      lastAutoSwitchRef.current = Date.now();
      setSuggestedParticipantId(undefined);
      patchProgramLayout({ primaryParticipantId: candidate.participant.id });
    }, delay);
    return () => {
      if (autoDirectorTimerRef.current) window.clearTimeout(autoDirectorTimerRef.current);
    };
  }, [authoritativeProgramLayout.lockedParticipantId, authoritativeProgramLayout.mode, autoDirectorProfile, canDirectProgram, directorSignalSignature, isHost, onStage, patchProgramLayout, performerParticipantId, programMutationPending, resolvedProgramPrimaryId, screenShareOnAir]);

  useEffect(() => {
    if (!onParticipantQualityIntent) return;
    const nextIntents = new Map<string, {
      roomId: string;
      participantId: string;
      sourceId: string;
      intent: "high" | "low" | "suspended";
    }>();
    const equalSurfaceGrid = isCageStage
      || recipe === "grid-two"
      || recipe === "grid-2x2"
      || recipe === "vertical-gallery";
    orderedParticipants.forEach((participant, index) => {
      const source = resolveParticipantSource(
        participant,
        displayedSourceByParticipant[participant.id],
        sourceAudienceForParticipant(participant.id),
      );
      if (!source) return;
      const intent = equalSurfaceGrid
        || index === 0
        || participant.id === selectedParticipant?.id
        || participant.id === suggestedParticipantId
        || (screenShareOnAir && participant.id === screenShareOwner?.id)
        ? "high"
        : "low";
      const key = `${participant.id}:${source.id}`;
      const entry = { roomId: room.id, participantId: participant.id, sourceId: source.id, intent } as const;
      nextIntents.set(key, entry);
      if (qualityIntentRef.current.get(key)?.intent !== intent) {
        onParticipantQualityIntent(room.id, participant.id, source.id, intent);
      }
    });
    qualityIntentRef.current.forEach((entry, key) => {
      if (!nextIntents.has(key)) onParticipantQualityIntent(entry.roomId, entry.participantId, entry.sourceId, "suspended");
    });
    qualityIntentRef.current = nextIntents;
  }, [displayedSourceByParticipant, isCageStage, onParticipantQualityIntent, orderedParticipants, recipe, room.id, screenShareOnAir, screenShareOwner?.id, selectedParticipant?.id, sourceAudienceForParticipant, suggestedParticipantId]);

  useEffect(() => () => {
    if (!onParticipantQualityIntent) return;
    qualityIntentRef.current.forEach((entry) => {
      onParticipantQualityIntent(entry.roomId, entry.participantId, entry.sourceId, "suspended");
    });
    qualityIntentRef.current.clear();
  }, [onParticipantQualityIntent, room.id]);

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === stageRef.current;
      setFullscreenActive(active);
      if (!active) patchViewerLayout({ fullscreenParticipantId: undefined });
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [patchViewerLayout]);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = window.setTimeout(() => {
      if (!stageRef.current?.querySelector(":focus-visible")) setControlsVisible(false);
    }, 2_800);
  }, []);

  // Reveal viewer controls only near the control bar, not across the video.
  const handleControlsProximity = (event: PointerEvent<HTMLElement>) => {
    if (!isCageStage || isHost || isGuest || event.pointerType === "touch") {
      revealControls();
      return;
    }
    const bar = stageRef.current?.querySelector<HTMLElement>(".place-stage__controls");
    if (!bar) return;
    const bounds = bar.getBoundingClientRect();
    const near = event.clientX >= bounds.left - 24 && event.clientX <= bounds.right + 24
      && event.clientY >= bounds.top - 40 && event.clientY <= bounds.bottom + 24;
    if (near) revealControls();
    else if (!bar.querySelector(":focus-visible")) {
      if (controlsTimerRef.current) window.clearTimeout(controlsTimerRef.current);
      setControlsVisible(false);
    }
  };

  useEffect(() => {
    if (!layoutMenuOpen) return;
    const frame = window.requestAnimationFrame(() => {
      layoutMenuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [layoutMenuOpen]);

  const selectParticipant = useCallback((participantId: string) => {
    setSelectedParticipantId(participantId);
    if (isHost) return;
    patchViewerLayout({
      followingProgram: false,
      focusedParticipantId: participantId,
      soloParticipantId: undefined,
      gridEnabled: false,
    });
  }, [isHost, patchViewerLayout]);

  const openSolo = useCallback((participantId: string) => {
    setSelectedParticipantId(isHost ? "" : participantId);
    patchViewerLayout({
      followingProgram: false,
      focusedParticipantId: participantId,
      soloParticipantId: participantId,
    });
  }, [isHost, patchViewerLayout]);

  const toggleSolo = useCallback((participantId: string) => {
    setSelectedParticipantId(isHost ? "" : participantId);
    if (viewerLayout.soloParticipantId === participantId) {
      restoreViewerProgram();
      return;
    }
    patchViewerLayout({
      followingProgram: false,
      focusedParticipantId: participantId,
      soloParticipantId: participantId,
      fullscreenParticipantId: undefined,
    });
  }, [isHost, patchViewerLayout, restoreViewerProgram, viewerLayout.soloParticipantId]);

  const openStageFullscreen = useCallback(() => {
    const element = stageRef.current;
    if (!element?.requestFullscreen) return;
    if (document.fullscreenElement === element) {
      void document.exitFullscreen();
      return;
    }
    void element.requestFullscreen().catch(() => {
      onNotice("Le plein écran navigateur n’est pas disponible.");
    });
  }, [onNotice]);

  const setLayoutMode = useCallback((mode: PlaceStageMode) => {
    if (isHost) {
      patchProgramLayout({
        mode,
        primaryParticipantId: resolvedProgramPrimaryId || primaryParticipantId,
        lockedParticipantId: mode === "auto" ? undefined : authoritativeProgramLayout.lockedParticipantId,
      });
      return;
    }
    if (mode === "auto") {
      restoreViewerProgram();
    } else if (mode === "grid") {
      patchViewerLayout({ gridEnabled: true, soloParticipantId: undefined, followingProgram: false });
    } else if (mode === "solo") {
      openSolo(selectedParticipant?.id ?? primaryParticipantId);
    } else {
      patchViewerLayout({
        gridEnabled: false,
        soloParticipantId: undefined,
        followingProgram: false,
        focusedParticipantId: selectedParticipant?.id ?? primaryParticipantId,
      });
    }
  }, [authoritativeProgramLayout.lockedParticipantId, isHost, openSolo, patchProgramLayout, patchViewerLayout, primaryParticipantId, resolvedProgramPrimaryId, restoreViewerProgram, selectedParticipant?.id]);

  const setComposition = useCallback((composition: PlaceStageComposition) => {
    setLayoutMode(compositionToStageMode(composition));
  }, [setLayoutMode]);

  const setDisplaySize = useCallback((size: PlaceStageDisplaySize) => {
    setLayoutMenuOpen(false);
    if (size === "fullscreen") {
      openStageFullscreen();
      return;
    }
    const applyPanelSize = () => onPanelCollapsedChange(size === "expanded");
    if (document.fullscreenElement) {
      void document.exitFullscreen().then(applyPanelSize, applyPanelSize);
      return;
    }
    applyPanelSize();
  }, [onPanelCollapsedChange, openStageFullscreen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      if (key === "escape" && layoutMenuOpen) {
        event.preventDefault();
        setLayoutMenuOpen(false);
        layoutTriggerRef.current?.focus();
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        isEditableTarget(event.target)
        || target?.closest("button, a, [role='menu'], [role^='menuitem']")
        || event.altKey
        || event.ctrlKey
        || event.metaKey
      ) return;
      if (key === "escape") {
        if (document.fullscreenElement) {
          void document.exitFullscreen();
        } else if (viewerLayout.soloParticipantId || !viewerLayout.followingProgram) {
          restoreViewerProgram();
        }
        return;
      }
      if (key === "f") { event.preventDefault(); openStageFullscreen(); }
      if (key === "g") { event.preventDefault(); setComposition("ensemble"); }
      if (key === "s") { event.preventDefault(); setComposition("focus"); }
      if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && orderedParticipants.length > 1) {
        event.preventDefault();
        const currentIndex = Math.max(0, orderedParticipants.findIndex((participant) => participant.id === (selectedParticipant?.id ?? primaryParticipantId)));
        const delta = event.key === "ArrowRight" ? 1 : -1;
        const next = orderedParticipants[(currentIndex + delta + orderedParticipants.length) % orderedParticipants.length];
        selectParticipant(next.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [layoutMenuOpen, openStageFullscreen, orderedParticipants, primaryParticipantId, restoreViewerProgram, selectParticipant, selectedParticipant?.id, setComposition, viewerLayout.followingProgram, viewerLayout.soloParticipantId]);

  const putParticipantOnAir = (participantId: string) => {
    const participant = onStage.find((candidate) => candidate.id === participantId);
    const requestedPreviewSourceId = previewSourceByParticipant[participantId];
    const previewSourceId = participant && requestedPreviewSourceId
      && resolveParticipantSources(participant, "program").some((source) => source.id === requestedPreviewSourceId)
      ? requestedPreviewSourceId
      : undefined;
    if (requestedPreviewSourceId && !previewSourceId) {
      setPreviewSourceByParticipant((current) => {
        const next = { ...current };
        delete next[participantId];
        return next;
      });
      onNotice("Cette source n’est plus autorisée pour le PROGRAM. L’antenne n’a pas changé.");
      return;
    }
    const currentFraming = authoritativeProgramLayout.safeFramingByParticipant?.[participantId];
    const sourceChangedWhileFramingLocked = Boolean(
      previewSourceId
      && currentFraming?.locked
      && currentFraming.sourceId !== previewSourceId,
    );
    patchProgramLayout({
      mode: "stage",
      primaryParticipantId: participantId,
      lockedParticipantId: undefined,
      selectedSourceByParticipant: previewSourceId
        ? { ...authoritativeProgramLayout.selectedSourceByParticipant, [participantId]: previewSourceId }
        : authoritativeProgramLayout.selectedSourceByParticipant,
      safeFramingByParticipant: sourceChangedWhileFramingLocked
        ? {
            ...(authoritativeProgramLayout.safeFramingByParticipant ?? {}),
            [participantId]: {
              enabled: currentFraming?.enabled ?? false,
              locked: false,
              maxZoom: currentFraming?.maxZoom ?? PLACE_STAGE_MAX_SMART_ZOOM,
            },
          }
        : authoritativeProgramLayout.safeFramingByParticipant,
    });
  };

  useEffect(() => {
    if (
      !explicitlySelectedParticipant
      || explicitlySelectedParticipant.id !== resolvedProgramPrimaryId
      || selectedSourcePending
      || programMutationPending
    ) return;
    setSelectedParticipantId("");
    setPreviewSourceByParticipant((current) => {
      if (!(explicitlySelectedParticipant.id in current)) return current;
      const next = { ...current };
      delete next[explicitlySelectedParticipant.id];
      return next;
    });
  }, [explicitlySelectedParticipant, programMutationPending, resolvedProgramPrimaryId, selectedSourcePending]);

  const returnToProgram = useCallback(() => {
    if (!document.fullscreenElement) {
      restoreViewerProgram();
      return;
    }
    void document.exitFullscreen().then(restoreViewerProgram, restoreViewerProgram);
  }, [restoreViewerProgram]);

  const setSource = (participantId: string, sourceId: string) => {
    if (isHost) {
      setSelectedParticipantId(participantId);
      setPreviewSourceByParticipant((current) => ({ ...current, [participantId]: sourceId }));
      return;
    }
    patchViewerLayout({
      selectedSourceByParticipant: {
        ...viewerLayout.selectedSourceByParticipant,
        [participantId]: sourceId,
      },
    });
  };

  return (
    <section
      className={`place-stage place-stage--director${isCageStage ? " is-cage-stage" : ""}${controlsVisible ? " is-controls-visible" : ""}${isHost ? " is-host-stage" : isGuest ? " is-guest-stage" : " is-viewer-stage"}${guestDropActive ? " is-guest-drop-target" : ""}`}
      ref={stageRef}
      aria-label="Scène en direct"
      onDragStartCapture={(event) => {
        if (!desktopStage) return;
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>(".cage-stage-feed[data-participant-id]") : null;
        const participantId = target?.dataset.participantId;
        if (participantId && room.participants.some((person) => person.id === participantId && person.status === "onstage")) {
          writePlaceGuestDrag(event.dataTransfer, { roomId: room.id, participantId, origin: "onstage" });
        }
      }}
      onDragEndCapture={() => setGuestDropActive(false)}
      onDragOver={(event) => { if (!desktopStage || !hasPlaceGuestDrag(event.dataTransfer)) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setGuestDropActive(true); }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGuestDropActive(false); }}
      onDrop={(event) => {
        setGuestDropActive(false);
        if (!desktopStage || !onMoveGuest) return;
        const drag = readPlaceGuestDrag(event.dataTransfer);
        if (!drag || drag.roomId !== room.id || drag.origin !== "backstage") return;
        event.preventDefault();
        const participant = [...room.participants, ...room.queue].find((person) => person.id === drag.participantId && person.status === "backstage");
        if (!participant) { onNotice("Cet invité n’est plus en coulisses."); return; }
        if (room.participants.filter((person) => person.status === "onstage").length >= 3) { onNotice("Scène complète · 3 invités maximum."); return; }
        void onMoveGuest(participant, "onstage").catch((reason) => onNotice(reason instanceof Error ? reason.message : "Impossible de monter cet invité sur scène."));
      }}
      onPointerMove={handleControlsProximity}
      onPointerEnter={handleControlsProximity}
      onPointerDown={(event) => { if (event.pointerType === "touch") revealControls(); }}
      onPointerLeave={() => { if (!stageRef.current?.querySelector(":focus-visible")) setControlsVisible(false); }}
      onFocusCapture={(event) => { if (!isCageStage || isHost || isGuest || (event.target as HTMLElement).matches(":focus-visible")) revealControls(); }}
      onCanPlayCapture={markHlsProgrammeReady}
      onPlayingCapture={markHlsProgrammeReady}
      onErrorCapture={markHlsProgrammeUnavailable}
      onStalledCapture={markHlsProgrammeUnavailable}
      onWaitingCapture={markHlsProgrammeUnavailable}
      onEndedCapture={markHlsProgrammeUnavailable}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setControlsVisible(false);
      }}
      data-layout-recipe={isCageStage ? "cage-faceoff" : recipe}
      data-stage-variant={isCageStage ? "cage-faceoff" : "standard"}
      data-filmstrip={filmstripPosition}
      data-pip-corner={viewerLayout.pipCorner}
      data-all-vertical={allVertical ? "true" : "false"}
      data-transition={transitionStyle}
      data-stage-preset={stagePreset}
      data-composition={isCageStage ? "faceoff" : displayedComposition}
      data-display-size={displaySize}
      data-short-count={shortCount}
      data-normal-count={normalCount}
      data-primary-format={primaryAspectRatio === "9:16" ? "short" : "normal"}
    >
      <PlaceRemoteAudioRenderer
        tracks={privateWaveListening ? playableRemoteAudioTracks.filter(track => track.purpose === "voice" && track.participantIdentity === room.host.id) : playableRemoteAudioTracks}
        enabled={remoteAudioEnabled}
      />
      {!isCageStage && isGuest ? <div className="place-stage__broadcast-bar">
        <span className="place-stage__live"><Radio aria-hidden="true" /> EN DIRECT</span>
        <span><Eye aria-hidden="true" /> {countFormatter.format(room.participantsCount)}</span>
        <span className="place-stage__latency"><i /> {room.connectionLabel}</span>
        <span className="place-stage__clock">{elapsedLabel}</span>
      </div> : null}


      {!isCageStage ? <div className="place-stage-layout__director" aria-label="Réalisation vidéo">
        <div className="place-stage-layout__mode-control">
          <button
            type="button"
            ref={layoutTriggerRef}
            className="place-stage-layout__mode-trigger"
            onClick={() => setLayoutMenuOpen((open) => !open)}
            aria-expanded={layoutMenuOpen}
            aria-haspopup="menu"
          >
            <LayoutPanelTop aria-hidden="true" />
            <span>{displayedComposition === "ensemble" ? "Ensemble" : displayedComposition === "focus" ? "Mise en avant" : "Solo"}</span>
            <ChevronDown aria-hidden="true" />
          </button>
          {layoutMenuOpen ? (
            <div
              ref={layoutMenuRef}
              className="place-stage-layout__menu place-stage-layout__menu--simple"
              role="menu"
              aria-label="Composition et taille d’affichage"
              onKeyDown={(event) => {
                const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
                const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
                if (event.key === "Escape") {
                  event.preventDefault();
                  setLayoutMenuOpen(false);
                  layoutTriggerRef.current?.focus();
                  return;
                }
                if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
                event.preventDefault();
                const nextIndex = event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : event.key === "ArrowDown"
                      ? (currentIndex + 1 + items.length) % items.length
                      : (currentIndex - 1 + items.length) % items.length;
                items[nextIndex]?.focus();
              }}
            >
              <small className="place-stage-layout__menu-label">COMPOSITION</small>
              <div className="place-stage-layout__choice-grid" role="group" aria-label="Composition de la scène">
                {([
                  ["ensemble", "Ensemble"],
                  ["focus", "Mise en avant"],
                  ["solo", "Solo"],
                ] as const).map(([composition, label]) => (
                  <button
                    key={composition}
                    type="button"
                    role="menuitemradio"
                    aria-checked={displayedComposition === composition}
                    disabled={isHost && (!canDirectProgram || programMutationPending)}
                    className={displayedComposition === composition ? "is-active" : ""}
                    onClick={() => { setComposition(composition); setLayoutMenuOpen(false); }}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
              <span className="place-stage-layout__menu-divider" />
              <small className="place-stage-layout__menu-label">TAILLE D’AFFICHAGE</small>
              <div className="place-stage-layout__choice-grid" role="group" aria-label="Taille d’affichage de la scène">
                {([
                  ["normal", "Normale"],
                  ["expanded", "Scène élargie"],
                  ["fullscreen", "Plein écran"],
                ] as const).map(([size, label]) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={displaySize === size}
                    className={displaySize === size ? "is-active" : ""}
                    onClick={() => setDisplaySize(size)}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {isHost && screenShareStream ? (
          <div className="place-stage-layout__screen-preview" aria-live="polite">
            <MonitorUp aria-hidden="true" />
            <span><small>ÉCRAN LOCAL · PREVIEW</small><strong>{screenShareOwner?.profile.displayName ?? "Partage d’écran"}</strong></span>
            <button type="button" className={screenShareOnAir ? "is-active" : ""} onClick={() => setScreenShareOnAir((active) => !active)}>
              {screenShareOnAir ? "Revenir au PROGRAM" : "Agrandir l’aperçu"}
            </button>
          </div>
        ) : null}

        {hasPersonalView ? (
          <div className="place-stage-layout__personal-view">
            <Eye aria-hidden="true" /><span><small>VUE PERSONNELLE</small><strong>{primary?.profile.displayName}</strong></span>
            <button type="button" onClick={returnToProgram}>Revenir à la réalisation</button>
          </div>
        ) : null}

        {SHOW_ADVANCED_DIRECTOR_CONTROLS && isHost && suggestedParticipantId && suggestedParticipantId !== resolvedProgramPrimaryId ? (() => {
          const suggested = orderedParticipants.find((participant) => participant.id === suggestedParticipantId);
          if (!suggested) return null;
          return <div className="place-stage-layout__suggestion"><Sparkles aria-hidden="true" /><span><small>AUTO DIRECTOR · SUGGESTION</small><strong>{suggested.profile.displayName}</strong></span><button type="button" disabled={!canDirectProgram || programMutationPending} onClick={() => { setSelectedParticipantId(suggested.id); patchProgramLayout({ mode: "stage", primaryParticipantId: suggested.id }); setSuggestedParticipantId(undefined); }}>Mettre à l’antenne</button></div>;
        })() : null}
      </div> : null}

      <div
        className={`place-stage__grid place-stage-layout__canvas${screenShareOnAir ? " is-screen-sharing" : ""}${isCageStage && !screenShareOnAir ? " is-cage-program" : ""}`}
        data-participants={screenShareOnAir ? 1 : orderedParticipants.length}
        data-short-count={shortCount}
        data-normal-count={normalCount}
      >
        {screenShareOnAir && screenShareStream
          ? <ScreenShareMedia stream={screenShareStream} />
          : screenShareOnAir && liveKitScreenShareForPlayback
            ? <LiveKitScreenShareMedia item={liveKitScreenShareForPlayback} />
            : isCageStage ? <CageStageProgram room={room} isHost={isHost} isGuest={isGuest} onStage={onStage} liveKitVideoTracks={liveKitVideoTracks} useRtcVideo={rtcVideoPrimary} programMuted={isHost || isGuest || viewerProgramMuted} playbackVolume={masterGain} onOpenProfile={onOpenProfile} />
            : orderedParticipants.map((participant, index) => (
          <PlaceStageLayoutTile
            participant={participant}
            dragRoomId={desktopStage && participant.status === "onstage" ? room.id : undefined}
            key={participant.id}
            formatIndex={orderedParticipants.slice(0, index + 1).filter((candidate) => (
              (participantAspectRatio(candidate) === "9:16") === (participantAspectRatio(participant) === "9:16")
            )).length}
            primary={index === 0}
            selected={participant.id === explicitlySelectedParticipant?.id}
            program={participant.id === resolvedProgramPrimaryId && !(previewSourceByParticipant[participant.id] && previewSourceByParticipant[participant.id] !== programLayout.selectedSourceByParticipant[participant.id])}
            preview={isHost && participant.id === selectedParticipant?.id && (participant.id !== resolvedProgramPrimaryId || Boolean(previewSourceByParticipant[participant.id] && previewSourceByParticipant[participant.id] !== programLayout.selectedSourceByParticipant[participant.id]))}
            director={isHost}
            canDirectProgram={canDirectProgram}
            programMutationPending={programMutationPending}
            muted={isHost || isGuest || viewerProgramMuted || participant.status !== "host"}
            playbackVolume={masterGain}
            renderAudience={sourceAudienceForParticipant(participant.id)}
            selectionAudience={isHost ? "program" : "viewer"}
            sourceId={displayedSourceByParticipant[participant.id]}
            aspectRatio={participantAspectRatio(participant)}
            framing={programLayout.safeFramingByParticipant?.[participant.id]}
            cameraEnabledOverride={(participant.profile.id === currentUserId || (participant.status === "host" && isHost)) ? hostCameraEnabled : undefined}
            liveKitVideoTrack={rtcVideoPrimary ? liveKitCameraByParticipant.get(participant.profile.id) : undefined}
            onSelect={selectParticipant}
            onPutOnAir={putParticipantOnAir}
            onOpenSolo={toggleSolo}
            onOpenProfile={onOpenProfile}
            onSourceChange={setSource}
            onAspectRatio={(participantId, detectedSourceId, ratio) => {
              const key = `${participantId}:${detectedSourceId}`;
              if (aspectRatios[key] === ratio) return;
              setAspectRatios((current) => current[key] === ratio ? current : { ...current, [key]: ratio });
            }}
          />
        ))}
        {!isCageStage && screenShareOnAir && screenShareOwner ? <div className="place-stage__presenter-pip" data-aspect={participantAspectRatio(screenShareOwner)}><PlaceStageLayoutTile participant={screenShareOwner} aspectRatio={participantAspectRatio(screenShareOwner)} primary selected={false} program={screenShareOwner.id === resolvedProgramPrimaryId} preview={false} director={isHost} canDirectProgram={canDirectProgram} programMutationPending={programMutationPending} muted={isHost || isGuest || viewerProgramMuted || screenShareOwner.status !== "host"} playbackVolume={masterGain} renderAudience={sourceAudienceForParticipant(screenShareOwner.id)} selectionAudience={isHost ? "program" : "viewer"} cameraEnabledOverride={screenShareOwner.profile.id === currentUserId || (screenShareOwner.status === "host" && isHost) ? hostCameraEnabled : undefined} liveKitVideoTrack={rtcVideoPrimary ? liveKitCameraByParticipant.get(screenShareOwner.profile.id) : undefined} framing={programLayout.safeFramingByParticipant?.[screenShareOwner.id]} onSelect={selectParticipant} onPutOnAir={putParticipantOnAir} onOpenSolo={toggleSolo} onOpenProfile={onOpenProfile} onSourceChange={setSource} onAspectRatio={(participantId, detectedSourceId, ratio) => {
          const key = `${participantId}:${detectedSourceId}`;
          if (aspectRatios[key] === ratio) return;
          setAspectRatios((current) => current[key] === ratio ? current : { ...current, [key]: ratio });
        }} /></div> : null}
      </div>

      {!isCageStage && recipe === "solo" && !screenShareOnAir && orderedParticipants.length > 1 ? (
        <nav className="place-stage-layout__solo-rail" aria-label="Voir les autres participants">
          <small>Voir les autres</small>
          <div>
            {orderedParticipants.slice(1).map((participant) => (
              (() => {
                const source = resolveParticipantSource(
                  participant,
                  displayedSourceByParticipant[participant.id],
                  sourceAudienceForParticipant(participant.id),
                );
                return (
                  <button
                    type="button"
                    key={participant.id}
                    data-aspect={participantAspectRatio(participant)}
                    onClick={() => isHost ? selectParticipant(participant.id) : openSolo(participant.id)}
                    onDoubleClick={() => openSolo(participant.id)}
                    aria-label={`${isHost ? "Sélectionner" : "Afficher"} ${participant.profile.displayName}`}
                  >
                    <img src={source?.imageUrl ?? participant.profile.avatarUrl} alt="" />
                    <span><strong>{participant.profile.displayName}</strong><small>{participant.profile.role}</small></span>
                    {participant.isMicrophoneEnabled ? <Mic aria-label="Micro actif" /> : <MicOff aria-label="Micro coupé" />}
                  </button>
                );
              })()
            ))}
          </div>
        </nav>
      ) : null}

      {!isCageStage ? <div className="place-stage__title">
        <span>HOST · {room.host.displayName}</span>
        <h1>{room.title}</h1>
        <button type="button" className="place-stage__creator" onClick={() => onOpenProfile(room.host.id)} aria-label={`Voir le profil de ${room.host.displayName}`}>
          <div>
            <small>{room.host.role} · {room.host.city}</small>
          </div>
          <MeewavGradeBadge level={room.host.gradeLevel as GradeLevel} size="sm" variant="icon" />
        </button>
      </div> : null}

      {roomPresentation.id === "loge" && room.highlightText?.startsWith("Question de ") ? <div className="loge-restored-question" role="status">{room.highlightText}</div> : null}
      {!isCageStage && room.poll?.isActive ? <div className="place-stage__poll"><BarChart3 aria-hidden="true" /><span><small>SONDAGE EN DIRECT</small><strong>{room.poll.question}</strong><span className="place-stage__poll-options">{room.poll.options.map((option, index) => <button type="button" key={option.label} className={room.poll?.currentUserVoteIndex === index ? "is-selected" : ""} disabled={isHost || !canEngage || room.poll?.currentUserVoteIndex !== null} onClick={() => onVotePoll(index)}><span>{option.label}</span><small>{option.votes}</small></button>)}</span></span></div> : null}
      <PlaceGiftDrawOverlay draw={room.giftDraw} />

      <ControlBar className={`place-stage__controls${isHost || isGuest ? " place-stage__controls--host" : ""}`} aria-label={isHost ? "Commandes immédiates du Host" : isGuest ? "Mes commandes immédiates" : "Contrôles du lecteur et interactions"}>
        {isHost || isGuest ? (
          <>
            <button
              type="button"
              className={!hostMicrophoneEnabled ? "is-off" : ""}
              onClick={() => { void onStartRemoteAudio?.(); onToggleHostMicrophone(); }}
              aria-pressed={hostMicrophoneEnabled}
              aria-label={hostMicrophoneEnabled ? "Couper mon micro" : "Activer mon micro"}
              title={hostMicrophoneEnabled ? "Micro actif" : "Micro coupé"}
            >{hostMicrophoneEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}</button>
            <button type="button" className={!hostCameraEnabled ? "is-off" : ""} onClick={() => { void onStartRemoteAudio?.(); onToggleHostCamera(); }} aria-pressed={hostCameraEnabled} aria-label={hostCameraEnabled ? "Couper ma caméra" : "Activer ma caméra"} title={hostCameraEnabled ? "Caméra active" : "Caméra coupée"}>{hostCameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}</button>
            <button type="button" className={!hostMonitoringEnabled ? "is-off" : ""} onClick={() => { void onStartRemoteAudio?.(); onToggleHostMonitoring(); }} aria-pressed={hostMonitoringEnabled} aria-label={hostMonitoringEnabled ? "Couper mon retour casque" : "Activer mon retour casque"} title="Retour casque local — branche un casque avant de l’activer">{hostMonitoringEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}</button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!playbackMuted) {
                setPlaybackMuted(true);
                return;
              }
              // Always release the existing HLS fallback as well. LiveKit may
              // be unavailable during a deployment or reconnect, but that
              // must not make the historical broadcast audio impossible to
              // unmute. Do it synchronously inside the user gesture; waiting
              // for the LiveKit promise can lose browser autoplay activation.
              setPlaybackMuted(false);
              void onStartRemoteAudio?.();
            }}
            aria-label={playbackMuted ? "Activer le son" : "Couper le son"}
          >{playbackMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
        )}
        {viewerLayout.soloParticipantId ? <button type="button" onClick={returnToProgram} aria-label="Quitter la vue Solo" title="Quitter la vue Solo"><ArrowDownToLine aria-hidden="true" /></button> : null}
        {isHost ? <button
          type="button"
          className={`place-stage__screen-share-action${screenSharePublished ? " is-active" : ""}${screenShareRequesting ? " is-pending" : ""}`}
          onClick={screenSharePublished ? onStopScreenShare : onStartScreenShare}
          disabled={screenShareRequesting}
          aria-pressed={screenSharePublished}
          aria-label={screenShareRequesting ? "Ouverture du partage d’écran" : screenSharePublished ? "Arrêter le partage d’écran" : "Partager mon écran"}
          title={screenSharePublished ? "Arrêter le partage d’écran" : "Partager mon écran"}
        ><MonitorUp aria-hidden="true" /></button> : null}
        <button type="button" onClick={openStageFullscreen} aria-label={fullscreenActive ? "Quitter le plein écran" : "Afficher la scène en plein écran"} title={fullscreenActive ? "Quitter le plein écran" : "Plein écran"}><Expand aria-hidden="true" /></button>
        <span className="place-stage__controls-spacer" />
      </ControlBar>
    </section>
  );
}
