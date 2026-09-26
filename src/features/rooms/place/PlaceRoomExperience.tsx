import { superpoweredVoiceAdapter } from "./placeSuperpoweredAdapter";
import { ViewerMixerContext, useViewerSendMixer } from "./ViewerMixerContext";
import { useSwitchRoom } from "../switch-room/useSwitchRoom";
import { SwitchRoomButton, SwitchRoomInvitation, SwitchRoomWaiting } from "../switch-room/SwitchRoom";
import type { RoomPerson } from "../tools/roomTools.types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { GradeLevel } from "../../grades/gradeBadges";
import ShortsCollaborationDialog from "../../shorts/ShortsCollaborationDialog";
import { useAudioEngine } from "../audio-engine";
import { RoomPresentationProvider, LIVE_ROOM_PRESENTATIONS, useRoomPresentation } from "../roomPresentation";
import { useOptionalRoomLiveCall } from "../live-call/RoomLiveCallProvider";
import { isVoiceCorrectionRoomEntryEnabled } from "../voice-correction/voiceCorrection.flags";
import {
  getNativeVst3LabPlugins,
  type NativeVst3LabControls,
} from "../voice-correction/nativeVst3LabMonitor";
import {
  OPENDAW_VOICE_CORRECTION_KEYS,
  OPENDAW_VOICE_CORRECTION_SCALES,
} from "../voice-correction/voiceCorrection.types";
import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";
import type { PlaceLiveCallRequestHandler } from "./placeLiveCall";
import PlaceRoomShellHeader from "./PlaceRoomShellHeader";
import RoomSupportPanel from "./RoomSupportPanel";
import LiveActionPopover from "./LiveActionPopover";
import { getRoomSupportWallet } from "./roomSupport";
import { useRoomSupportThrows } from "./useRoomSupportThrows";
import PlaceStage from "./PlaceStage";
import { CageMixerTimer } from "./CageStageProgram";
import PlaceStudioPanel from "./PlaceStudioPanel";
import PlaceChatSocialActions from "./PlaceChatSocialActions";
import { CageGoldenLikeProvider } from "./CageGoldenLikeContext";
import { WaveViewerListeningProvider, useWaveViewerListening } from "../wave-viewer/WaveViewerListening";
import type { PlaceDemoRole, PlaceMixerView, PlaceNativePitchProvider, PlacePitchProvider, PlaceProfile, PlaceRoomState, PlaceStudioSurface, PlaceVocalState } from "./place.types";
import type { PlacePitchCorrectionAdapter } from "./placeLocalAudioEngine";
import { isNativePitchProvider, isWebPitchProvider, resolvePlaceMonitoringRoute } from "./placeAudioRouting";
import { meewavPitchCorrectionAdapter } from "./placeMeeWavPitchAdapter";
import { usePlaceLocalAudio } from "./usePlaceLocalAudio";
import { usePlaceNativeVst3Monitor } from "./usePlaceNativeVst3Monitor";
import { usePlaceProgramLayout } from "./usePlaceProgramLayout";
import { usePlaceRoom } from "./usePlaceRoom";
import { usePlaceScreenShare } from "./usePlaceScreenShare";
import { usePlaceLiveKitRoom } from "./usePlaceLiveKitRoom";
import { useRuntime } from "../../../runtime/RuntimeProvider";
import type { DesktopMusicSource } from "../../../runtime/DesktopMusicSource";
import RoomProductionPreparation from "./RoomProductionPreparation";
import { readRoomProductionSetup } from "./roomProductionSetup";
import "./place-room-production-drawer.css";
import { usePlaceLiveCallProgramMix } from "./usePlaceLiveCallProgramMix";
import { usePlaceLiveCallRoomCleanup } from "./usePlaceLiveCallRoomCleanup";
import { createPlaceClientId } from "./placeClientId";

export type PlaceRoomExperienceProps = {
  requestedRoomId?: string | null;
  currentUserId?: string | null;
  demoRole?: PlaceDemoRole;
  demoRoom?: PlaceRoomState | null;
  onOpenProfile: (profileId: string) => void;
  onMessageProfile: (profileId: string) => void;
  onCollaborateProfile: (profileId: string, requestId?: string | null) => void;
  onLeaveRoom?: () => void;
  /**
   * Frontière UI vers le transport d'appel. Le consommateur démarre le média,
   * gère les permissions et décide comment le retour est injecté dans la Room.
   */
  onLiveCallRequest?: PlaceLiveCallRequestHandler;
};

const PITCH_PROVIDER_STORAGE_KEY = "meewav.rooms.pitch-provider.v1";

export function canContactUseHlsPhoneCallHandoff(
  invitations: ReadonlyArray<{ callMode: "private" | "public" }>,
) {
  return invitations.every((invitation) => invitation.callMode === "private");
}

function nativeControlsFromVocal(vocal: PlaceVocalState, inputGain = 1): NativeVst3LabControls {
  const key = OPENDAW_VOICE_CORRECTION_KEYS.indexOf(
    vocal.tuneKey as (typeof OPENDAW_VOICE_CORRECTION_KEYS)[number],
  );
  const scale = OPENDAW_VOICE_CORRECTION_SCALES.indexOf(vocal.tuneScale);
  return {
    bypassed: !vocal.tuneEnabled,
    inputGain: Math.max(0, Math.min(1, inputGain)),
    key: key < 0 ? 0 : key,
    scale: scale < 0 ? 0 : scale,
    amount: Math.max(0, Math.min(1, vocal.tuneAmount)),
    retune: Math.max(0, Math.min(1, vocal.tuneSpeed)),
    humanize: Math.max(0, Math.min(1, vocal.tuneHumanize)),
    reverbEnabled: vocal.reverbEnabled,
    reverbMix: Math.max(0, Math.min(1, vocal.reverbAmount)),
    reverbType: vocal.reverbType.toLowerCase() as "room" | "plate" | "hall",
    reverbDuration: Math.max(0.2, Math.min(5, vocal.reverbDuration)),
    reverbPreDelayMs: Math.max(0, Math.min(180, vocal.reverbPreDelayMs)),
  };
}

function linearGainToDb(gain: number) {
  if (gain <= 0.001) return -60;
  return Math.max(-60, Math.min(0, 20 * Math.log10(gain)));
}

function nativeProviderLabel(provider: PlaceNativePitchProvider) {
  if (provider === "antares.autotune") return "Auto-Tune Pro";
  if (provider === "sixthsample.spoton") return "Spoton";
  return "Graillon 3";
}

function nativeMonitoringNotice(stdoutTail: string, pluginLabel: string, roomLabel: string) {
  if (stdoutTail.includes("legacy-shared")) {
    return `${pluginLabel} est actif, mais Windows a ouvert un périphérique en mode standard : la latence peut rester élevée.`;
  }
  return `${pluginLabel} est actif dans ${roomLabel}. Le retour Web a été coupé pour éviter la double voix.`;
}

// Keep the experimental runtime out of normal chunks entirely. The direct
// compile-time flag lets Vite remove the dynamic import unless an internal
// laboratory build explicitly opts in.
const OPENDAW_ROOM_ADAPTER: PlacePitchCorrectionAdapter | null = import.meta.env.MODE === "audio-lab"
  && import.meta.env.VITE_OPENDAW_VOICE_CORRECTION_LAB === "true"
  && isVoiceCorrectionRoomEntryEnabled()
  ? {
      id: "opendaw.voice-correction.dev-loader",
      async create(context) {
        const { openDawPitchCorrectionAdapter } = await import("./placeOpenDawPitchAdapter");
        return openDawPitchCorrectionAdapter.create(context);
      },
    }
  : null;

function storedPitchProvider(): PlacePitchProvider {
  if (typeof window === "undefined") return "meewav_test";
  const value = window.localStorage.getItem(PITCH_PROVIDER_STORAGE_KEY);
  if (value === null || value === "none") return "meewav_test";
  if (value === "meewav_test") return value;
  if (import.meta.env.MODE === "audio-lab" && isNativePitchProvider(value as PlacePitchProvider)) return value as PlaceNativePitchProvider;
  return value === "opendaw" && isVoiceCorrectionRoomEntryEnabled() ? value : "none";
}

export default function PlaceRoomExperience(props: PlaceRoomExperienceProps) {
  const presentation = useRoomPresentation();
  return <WaveViewerListeningProvider key={`${props.requestedRoomId ?? presentation.id}:${props.currentUserId ?? "anonymous"}`}><PlaceRoomExperienceContent {...props} /></WaveViewerListeningProvider>;
}

function PlaceRoomExperienceContent({ requestedRoomId, currentUserId, demoRole, demoRoom, onOpenProfile, onMessageProfile, onCollaborateProfile, onLeaveRoom, onLiveCallRequest }: PlaceRoomExperienceProps) {
  const initialPresentation = useRef(useRoomPresentation()).current;
  const place = usePlaceRoom({ requestedRoomId, currentUserId, demoRole, demoRoom, roomType: initialPresentation.id });
  const runtime = useRuntime();
  const desktopHost = runtime.canPrepareHostRoom && place.isHost;
  const [desktopBroadcastRoom, setDesktopBroadcastRoom] = useState<string | null>(null);
  const [desktopProgramStream, setDesktopProgramStream] = useState<MediaStream | null>(null);
  const [desktopMusicSource, setDesktopMusicSource] = useState<DesktopMusicSource | null>(null);
  const [productionOpen, setProductionOpen] = useState(false);
  const [productionInitialized, setProductionInitialized] = useState(false);
  const productionTriggerRef = useRef<HTMLButtonElement>(null);
  const productionCloseRef = useRef<HTMLButtonElement>(null);
  const productionDialogRef = useRef<HTMLDivElement>(null);
  const desktopOnAir = desktopBroadcastRoom === place.room.id;
  const closeProduction = useCallback(() => {
    setProductionOpen(false);
    productionTriggerRef.current?.focus();
  }, []);
  useEffect(() => { setProductionOpen(false); setProductionInitialized(false); }, [place.room.id, place.room.status, desktopHost]);
  useEffect(() => {
    if (!productionOpen) return;
    productionCloseRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeProduction(); return; }
      if (event.key !== "Tab") return;
      const controls = Array.from(productionDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
      ) ?? []).filter((control) => control.getClientRects().length > 0);
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [productionOpen, closeProduction]);
  useEffect(() => {
    if (!desktopHost || place.room.status !== "live" || (desktopBroadcastRoom && desktopBroadcastRoom !== place.room.id)) {
      setDesktopBroadcastRoom(null);
      setDesktopProgramStream(null);
      setDesktopMusicSource(null);
    }
  }, [desktopHost, desktopBroadcastRoom, place.room.id, place.room.status]);
  const switching = useSwitchRoom(place.room, initialPresentation.id, place.activeUserId ?? "anonymous", place.isHost, !place.isLoading && (place.room.source === "demo" || place.isHost || place.room.currentUserIsActiveParticipant));
  const roomPresentation = LIVE_ROOM_PRESENTATIONS[switching.displayed];
  useEffect(()=>{place.setExperienceType?.(switching.current);},[switching.current,place.setExperienceType]);
  const acceptedExperienceVersion = switching.waiting ? -1 : switching.state?.version ?? 0;
  useEffect(() => { if(acceptedExperienceVersion>0) place.setSurface("tools"); },[acceptedExperienceVersion,place.setSurface]);

  const audioEngine = useAudioEngine();
  const liveCall = useOptionalRoomLiveCall();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => { place.setSurface("tools"); setPanelCollapsed(false); timer = setTimeout(() => window.dispatchEvent(new Event("wave-preview-vote-ready")), 150); };
    window.addEventListener("wave-preview-vote", show);
    return () => { window.removeEventListener("wave-preview-vote", show); clearTimeout(timer); };
  }, [place.setSurface]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const showPoll = () => { place.setSurface("chat"); setPanelCollapsed(false); timer = setTimeout(() => window.dispatchEvent(new Event("wave-preview-poll-ready")), 150); };
    window.addEventListener("wave-preview-poll", showPoll);
    return () => { window.removeEventListener("wave-preview-poll", showPoll); clearTimeout(timer); };
  }, [place.setSurface]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = () => { place.setSurface("tools"); setPanelCollapsed(false); timer=setTimeout(()=>window.dispatchEvent(new Event("cage-viewer-simulation-ready")),150); };
    window.addEventListener("cage-viewer-simulation",show);
    return()=>{window.removeEventListener("cage-viewer-simulation",show);clearTimeout(timer);};
  },[place.setSurface]);
  const { room } = place;
  const experienceRef = useRef<HTMLElement>(null);
  const supportContext = `${room.source}:${room.id}:${room.status}:${room.host.id}:${place.activeUserId}`;
  const supportWallet = getRoomSupportWallet(room.source, place.activeUserId);
  const support = useRoomSupportThrows({ wallet: supportWallet, recipientId: room.host.id, context: supportContext, canEngage: place.canEngage && !place.isHost, onSent: place.recordDemoSupport, onError: place.showNotice });
  const [liveDialogTarget, setLiveDialogTarget] = useState<Element | null>(null);
  const [dialogAnchor, setDialogAnchor] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const update = () => setLiveDialogTarget(document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const programLayout = usePlaceProgramLayout({
    room,
    isHost: place.isHost,
    currentUserId: place.activeUserId,
    onNotice: place.showNotice,
  });
  const [spotlightRequest, setSpotlightRequest] = useState<string | null>(null);
  const spotlightStudentId = room.participants.find((person) =>
    person.status === "onstage" && person.id === programLayout.programLayout?.lockedParticipantId
  )?.profile.id ?? null;
  const spotlightStudent = async (person: RoomPerson) => {
    if (!programLayout.canDirectProgram) throw new Error("La réalisation du live n’est pas disponible pour le moment.");
    const enabled = spotlightStudentId !== person.id;
    const profile: PlaceProfile = {
      id: person.id, displayName: person.name, avatarUrl: person.avatarUrl,
      handle: "", role: person.role, city: "", gradeLevel: person.gradeLevel ?? 1,
    };
    await place.setClassroomSpotlight(profile, enabled);
    setSpotlightRequest(enabled ? person.id : null);
  };
  useEffect(() => { setSpotlightRequest(null); }, [room.id]);
  useEffect(() => {
    if (!spotlightRequest || !programLayout.programLayout) return;
    const participant = room.participants.find((item) => item.profile.id === spotlightRequest && item.status === "onstage");
    if (!participant) return;
    setSpotlightRequest(null);
    void programLayout.updateProgramLayout({
      ...programLayout.programLayout, mode: "stage",
      primaryParticipantId: participant.id, lockedParticipantId: participant.id,
      participantOrder: [participant.id, ...programLayout.programLayout.participantOrder.filter((id) => id !== participant.id)],
    }).catch(() => place.showNotice("L’élève a rejoint la scène, mais le cadrage n’a pas pu être confirmé. Réessayez."));
  }, [spotlightRequest, room.participants, programLayout, place.showNotice]);
  const [panelCollapsed, setPanelCollapsed] = useState(() => (
    typeof window !== "undefined"
      && window.matchMedia("(max-width: 820px) and (pointer: coarse)").matches
  ));
  const [mixerView, setMixerView] = useState<PlaceMixerView>("volumes");
  const [pitchProvider, setPitchProvider] = useState<PlacePitchProvider>(storedPitchProvider);
  const [pluginInventory, setPluginInventory] = useState<AudioEnginePlugin[]>([]);
  const [pluginsRefreshing, setPluginsRefreshing] = useState(false);
  const [donationOpen, setDonationOpen] = useState(false);
  const [endConfirmationOpen, setEndConfirmationOpen] = useState(false);
  const [collaborationProfile, setCollaborationProfile] = useState<PlaceProfile | null>(null);
  const [nativeHandoffInterrupted, setNativeHandoffInterrupted] = useState(false);
  const panelStateBeforeDonationRef = useRef(false);
  const mediaRoomIdRef = useRef(room.id);
  const activeRoomIdRef = useRef(room.id);
  const pitchProviderSelectionRef = useRef(0);
  const pitchProviderOperationRef = useRef<Promise<void>>(Promise.resolve());
  const nativeSnapshotGenerationRef = useRef(0);
  const [nativeSnapshotAuthority, setNativeSnapshotAuthority] = useState<{
    generation: number;
    roomId: string;
    provider: PlaceNativePitchProvider;
    pid: number | null;
  } | null>(null);
  if (activeRoomIdRef.current !== room.id) {
    activeRoomIdRef.current = room.id;
    pitchProviderSelectionRef.current += 1;
    nativeSnapshotGenerationRef.current += 1;
  }
  useEffect(() => () => {
    pitchProviderSelectionRef.current += 1;
  }, []);
  const handledMediaBoundaryRef = useRef("");
  const {
    snapshot: nativeVst3Snapshot,
    error: nativeVst3Error,
    activePluginId: activeNativeVst3PluginId,
    refresh: refreshNativeVst3,
    start: startNativeVst3,
    update: updateNativeVst3,
    stop: stopNativeVst3,
  } = usePlaceNativeVst3Monitor();
  const nativePitchSelected = isNativePitchProvider(pitchProvider);
  const nativeSnapshotAuthorized = nativePitchSelected
    && nativeSnapshotAuthority?.generation === nativeSnapshotGenerationRef.current
    && nativeSnapshotAuthority.roomId === room.id
    && nativeSnapshotAuthority.provider === pitchProvider
    && nativeSnapshotAuthority.pid === nativeVst3Snapshot?.pid;
  const nativePluginAudioReady = nativePitchSelected
    && nativeSnapshotAuthorized
    && activeNativeVst3PluginId === pitchProvider
    && Boolean(nativeVst3Snapshot?.audioReady);
  const personalListening = useWaveViewerListening();
  const setContactReturnLevel = liveCall?.setContactReturnLevel;
  useEffect(() => {
    if (!place.isHost) setContactReturnLevel?.(room.id, personalListening?.returnMuted ? 0 : personalListening?.returnVolume ?? 1);
  }, [place.isHost, room.id, personalListening?.returnMuted, personalListening?.returnVolume, setContactReturnLevel]);
  const viewerMix = useViewerSendMixer(place.activeUserId ?? undefined, !place.isHost);
  const personalMicrophone = place.isHost
    ? room.channels.find((channel) => channel.kind === "microphone" && channel.participantId === room.host.id)
    : room.channels.find((channel) => channel.kind === "guest" && channel.participantId === place.activeUserId);
  const personalParticipant = room.participants.find((participant) => participant.profile.id === place.activeUserId);
  const hostCameraEnabled = personalParticipant?.isCameraEnabled ?? true;
  const personalMicrophoneEnabled = personalMicrophone ? !personalMicrophone.isMuted : true;
  const personalInputGain = place.isHost ? (personalMicrophoneEnabled ? personalMicrophone?.gain ?? 1 : 0) : 1;
  const screenShare = usePlaceScreenShare({
    roomId: room.id,
    roomIsLive: room.status === "live",
    onNotice: place.showNotice,
  });
  const roomMedia = usePlaceLiveKitRoom(room.id, {
    enabled: runtime.ready && !place.isLoading && room.source === "live" && room.status === "live" && (!desktopHost || desktopOnAir),
    accessKey: `${place.isHost ? "host" : place.isGuest ? "guest" : "viewer"}:${personalParticipant?.status ?? "audience"}`,
  });
  const desktopMusicReserved = desktopHost && desktopOnAir && Boolean(desktopMusicSource);
  const desktopMusicReservedRef = useRef(desktopMusicReserved);
  desktopMusicReservedRef.current = desktopMusicReserved;
  const musicChannel = room.channels.find((channel) => channel.kind === "audio" && channel.participantId === room.host.id);
  const masterChannel = room.channels.find((channel) => channel.kind === "master");
  const desktopMusicGain = musicChannel && !musicChannel.isMuted && !masterChannel?.isMuted
    ? musicChannel.gain * (masterChannel?.gain ?? 1) : 0;
  useEffect(() => { if (desktopMusicSource) desktopMusicSource.setGain(desktopOnAir ? desktopMusicGain : 1); }, [desktopMusicSource, desktopMusicGain, desktopOnAir]);
  const desktopAudioCommands = useRef({ prepare: place.prepareTrackPreview, route: place.setTrackRoute, playback: place.setTrackPlaybackState, notice: place.showNotice });
  desktopAudioCommands.current = { prepare: place.prepareTrackPreview, route: place.setTrackRoute, playback: place.setTrackPlaybackState, notice: place.showNotice };
  const desktopMusicCommitQueue = useRef<Promise<void>>(Promise.resolve());
  const musicTransportAudible = useRef(roomMedia.musicAudible);
  musicTransportAudible.current = roomMedia.musicAudible;
  useEffect(() => {
    const source = desktopMusicSource;
    if (!desktopHost || !desktopOnAir || !source || roomMedia.status !== "connected" || !roomMedia.canPublish) return;
    const generation = createPlaceClientId();
    let current = true;
    let previewReady = false;
    let transportOwned = false;
    const commands = desktopAudioCommands.current;
    const prepare = async () => {
      if (!current) return;
      if (musicTransportAudible.current) { commands.notice("Arrête d’abord la musique du lecteur Meewav."); return; }
      try {
        await source.start();
        if (!current) return;
        previewReady = await commands.prepare({ ready: true, title: "Source musicale Desktop", artist: null, durationSeconds: null, generation });
        if (!previewReady) throw new Error("La source musicale n’a pas été préparée dans la Room.");
        if (!current) return;
        transportOwned = await roomMedia.prepareMusicTrack(source.track, generation);
        if (!transportOwned) throw new Error("La source musicale n’a pas été acceptée par le transport.");
        if (!current || !await commands.route("public", generation)) throw new Error("Le routage public de la musique a échoué.");
        if (!current || !await commands.playback("playing", generation)) throw new Error("L’état public de la musique a échoué.");
        if (!current || !await roomMedia.setMusicEnabled(true)) throw new Error("Le transport n’a pas confirmé la musique.");
      } catch (reason) {
        source.silence();
        if (transportOwned) { await roomMedia.setMusicEnabled(false).catch(() => false); await roomMedia.releaseMusicTrack().catch(() => undefined); transportOwned = false; }
        if (previewReady) { await commands.prepare({ ready: false, title: null, artist: null, durationSeconds: null, generation }).catch(() => false); previewReady = false; }
        if (current) commands.notice(reason instanceof Error ? reason.message : "La source musicale est indisponible.");
      }
    };
    desktopMusicCommitQueue.current = desktopMusicCommitQueue.current.catch(() => undefined).then(prepare);
    return () => {
      current = false;
      source.silence();
      desktopMusicCommitQueue.current = desktopMusicCommitQueue.current.catch(() => undefined).then(async () => {
        if (transportOwned) { await roomMedia.setMusicEnabled(false).catch(() => false); await roomMedia.releaseMusicTrack().catch(() => undefined); }
        if (previewReady) await commands.prepare({ ready: false, title: null, artist: null, durationSeconds: null, generation }).catch(() => false);
      });
    };
  }, [desktopHost, desktopOnAir, desktopMusicSource, roomMedia.status, roomMedia.canPublish, roomMedia.prepareMusicTrack, roomMedia.setMusicEnabled, roomMedia.releaseMusicTrack, room.id]);
  useEffect(() => {
    if (!desktopHost || !desktopOnAir || roomMedia.status !== 'connected') return;
    const track = desktopProgramStream?.getVideoTracks()[0];
    if (!track) return;
    let current = true;
    void roomMedia.publishProgramVideo(track).then((confirmed) => {
      if (current && !confirmed) place.showNotice('Le transport n’a pas confirmé la publication de Program.');
    });
    return () => { current = false; };
  }, [desktopHost, desktopOnAir, desktopProgramStream, roomMedia.status, roomMedia.publishProgramVideo, place.showNotice]);
  // Effects disconnect the previous transport after React commits. Scope its
  // last snapshot during render as well, so a same-identity Host cannot leak a
  // frame or audio packet from the previous Room into the next one.
  const rtcMediaMatchesRoom = roomMedia.roomId === room.id;
  const voiceCaptureNoticeRef = useRef("");
  const voicePublishNoticeRef = useRef("");
  const screenShareGenerationRef = useRef(createPlaceClientId());
  const screenShareStartingRef = useRef(false);
  const [screenShareStarting, setScreenShareStarting] = useState(false);
  useEffect(() => {
    screenShareStartingRef.current = false;
    setScreenShareStarting(false);
    return () => {
      screenShareGenerationRef.current = createPlaceClientId();
      screenShareStartingRef.current = false;
    };
  }, [room.id, room.status]);
  const programAudio = useMemo(() => ({
    status: rtcMediaMatchesRoom ? roomMedia.status : "disconnected" as const,
    musicAudible: rtcMediaMatchesRoom && !desktopMusicReserved && roomMedia.musicAudible,
    musicGeneration: rtcMediaMatchesRoom && !desktopMusicReserved ? roomMedia.musicGeneration : null,
    prepareMusicTrack: (track: MediaStreamTrack, generation: string) => desktopMusicReservedRef.current ? Promise.resolve(false) : roomMedia.prepareMusicTrack(track, generation),
    setMusicEnabled: (enabled: boolean) => desktopMusicReservedRef.current ? Promise.resolve(false) : roomMedia.setMusicEnabled(enabled),
    releaseMusicTrack: () => desktopMusicReservedRef.current ? Promise.resolve() : roomMedia.releaseMusicTrack(),
  }), [rtcMediaMatchesRoom, desktopMusicReserved, roomMedia.musicAudible, roomMedia.musicGeneration, roomMedia.prepareMusicTrack, roomMedia.releaseMusicTrack, roomMedia.setMusicEnabled, roomMedia.status]);
  const nativeAudioConnected = audioEngine.status === "connected" && audioEngine.transport === "native";
  const nativeMonitoringReady = nativeAudioConnected && audioEngine.health?.audioPlane !== "unavailable";
  const nativeRoomAudioReady = nativeAudioConnected
    && audioEngine.health?.audioPlane === "room_ready"
    && audioEngine.health.roomPublication.status === "published"
    && audioEngine.health.roomPublication.publisher === "native_webrtc"
    && audioEngine.health.roomPublication.roomId === room.id
    && Boolean(audioEngine.health.roomPublication.trackId);
  const nativeRoomAudioReadyRef = useRef(nativeRoomAudioReady);
  const nativeChainGainErrorRef = useRef(false);
  const nativeMonitoringEnabled = nativeMonitoringReady && Boolean(audioEngine.monitoring?.enabled);
  const monitoringRoute = resolvePlaceMonitoringRoute(pitchProvider, nativeMonitoringReady);
  const monitoringEnabled = monitoringRoute === "vst3_local"
    ? nativePluginAudioReady
    : monitoringRoute === "desktop_engine"
      ? nativeMonitoringEnabled
      : room.personalVocal.monitoring;
  const providerRecoveryRequired = Boolean(audioEngine.fallbackReason) && audioEngine.transport !== "web_audio";
  const rawBrowserAudioAuthorized = isWebPitchProvider(pitchProvider)
    || audioEngine.transport === "web_audio"
    || (!nativeHandoffInterrupted && !providerRecoveryRequired);
  const hostPrivateCallNeedsBrowserVoice = Boolean(place.isHost && liveCall?.acceptedInvitations.some((invitation) => (
    invitation.partyRole === "host"
    && invitation.roomId === room.id
    && invitation.status === "accepted"
  )));
  const localAudio = usePlaceLocalAudio(room.personalVocal, {
    roomId: room.id,
    inputEnabled: (place.isHost ? personalMicrophoneEnabled : true)
      && ((!nativeRoomAudioReady && rawBrowserAudioAuthorized) || hostPrivateCallNeedsBrowserVoice),
    inputGain: personalInputGain,
    pitchAdapter: room.personalVocal.tuneEnabled || (runtime.isDesktop && pitchProvider === "meewav_test" && room.personalVocal.reverbEnabled)
      ? pitchProvider === "opendaw"
        ? OPENDAW_ROOM_ADAPTER
        : pitchProvider === "meewav_test"
          ? runtime.isDesktop ? superpoweredVoiceAdapter : meewavPitchCorrectionAdapter
          : null
      : null,
  });
  const prepareViewerVoice = useCallback(async () => {
    viewerMix.setError("");
    try {
      const stream = await localAudio.startCapture();
      await viewerMix.engine.prepare();
      viewerMix.engine.setInput("voice", stream.getAudioTracks()[0] ?? null);
      return viewerMix.engine.track;
    } catch (reason) {
      viewerMix.setError("Micro indisponible : vérifiez son autorisation et votre périphérique.");
      throw reason;
    }
  }, [localAudio.startCapture, viewerMix.engine, viewerMix.setError]);
  useEffect(() => {
    if (place.isHost) return;
    if (!localAudio.outputTrack) { viewerMix.engine.setInput("voice", null); return; }
    let current = true;
    void viewerMix.engine.prepare().then(() => { if (current) viewerMix.engine.setInput("voice", localAudio.outputTrack); }).catch(() => undefined);
    return () => { current = false; };
  }, [place.isHost, localAudio.outputTrack, viewerMix.engine]);
  const personalSendTrack = place.isHost ? localAudio.outputTrack : viewerMix.outputTrack;
  const registerContactMix = liveCall?.setContactMix;
  useEffect(() => {
    if (place.isHost || !registerContactMix) return;
    registerContactMix(room.id, { track: viewerMix.outputTrack, prepare: prepareViewerVoice });
    return () => registerContactMix(room.id, null);
  }, [place.isHost, registerContactMix, room.id, viewerMix.outputTrack, prepareViewerVoice]);
  const localAudioStatus = localAudio.status;
  const localMonitoring = localAudio.monitoring;
  const disableLocalHeadphoneMonitoring = localAudio.disableHeadphoneMonitoring;
  const stopLocalCapture = localAudio.stopCapture;
  const startCaptureWithPitchAdapter = localAudio.startCaptureWithPitchAdapter;
  const updateVocal = place.updateVocal;
  const showNotice = place.showNotice;
  const acceptedLiveCalls = liveCall?.acceptedInvitations;
  const liveCallMediaSessions = liveCall?.mediaSessions;
  const onAirLiveCallIds = liveCall?.onAirInvitationIds;
  const audibleLiveCallIds = liveCall?.audibleOnAirInvitationIds;
  const contactPublicProgramRoomIds = liveCall?.contactPublicProgramRoomIds;
  const setLiveCallHostVoiceTrack = liveCall?.setHostVoiceTrack;
  const authorizeLiveCallProgram = liveCall?.authorizeCallProgram;
  const setLiveCallProgramAudible = liveCall?.setCallProgramAudible;
  const setLiveCallProgramPreflight = liveCall?.setCallProgramPreflight;
  const setContactPublicProgramActive = liveCall?.setContactPublicProgramActive;
  const setRegieTalkbackPublicGate = liveCall?.setRegieTalkbackPublicGate;
  const setRegieTalkbackActive = liveCall?.setRegieTalkbackActive;
  const regieTalkbackActive = Boolean(liveCall?.regieTalkbackActiveRoomIds.has(room.id));
  const regiePublicVoiceWasEnabledRef = useRef(false);
  const acceptedContactInvitations = acceptedLiveCalls?.filter((invitation) => (
    invitation.partyRole === "contact"
    && invitation.roomId === room.id
    && invitation.status === "accepted"
  )) ?? [];
  const acceptedContactLiveCall = acceptedContactInvitations.length > 0;
  const contactMixAudible = acceptedContactInvitations.some((invitation) => liveCallMediaSessions?.some((session) => (
    session.invitationId === invitation.invitationId && session.status === "connected" && session.localAudible
  )));
  // A public call may enter the aggregate HLS before the contact receives the
  // Realtime `is_on_air` update. Never use that delayed aggregate as their
  // return path: it could replay their own voice. Private calls cannot enter
  // the public programme, so HLS remains a safe handoff for those only.
  const allowHlsPhoneCallHandoff = canContactUseHlsPhoneCallHandoff(acceptedContactInvitations);
  const privateContactReturnSuppressed = Boolean(contactPublicProgramRoomIds?.has(room.id));
  const suppressPublicPhoneCallAudio = Boolean(acceptedLiveCalls?.some((invitation) => {
    if (invitation.partyRole !== "contact" || invitation.roomId !== room.id) return false;
    const session = liveCallMediaSessions?.find((candidate) => (
      candidate.invitationId === invitation.invitationId
    ));
    return !privateContactReturnSuppressed
      && session?.status === "connected"
      && session.peerPresent
      && !session.remoteMuted
      && !session.autoplayBlocked
      && session.remoteTrack?.kind === "audio"
      && session.remoteTrack.readyState === "live";
  }));
  const handleViewerProgramActiveChange = useCallback((active: boolean) => {
    setContactPublicProgramActive?.(room.id, acceptedContactLiveCall && active);
  }, [acceptedContactLiveCall, room.id, setContactPublicProgramActive]);

  useEffect(() => () => {
    setContactPublicProgramActive?.(room.id, false);
  }, [room.id, setContactPublicProgramActive]);
  const liveCallProgramInputs = useMemo(() => {
    if (!place.isHost || !acceptedLiveCalls || !liveCallMediaSessions) return [];
    return acceptedLiveCalls.flatMap((invitation) => {
      if (invitation.partyRole !== "host" || invitation.roomId !== room.id) return [];
      const session = liveCallMediaSessions.find((candidate) => (
        candidate.invitationId === invitation.invitationId
      ));
      if (!session?.remoteTrack || session.remoteTrack.readyState !== "live" || session.remoteMuted) return [];
      const channel = room.channels.find(row => row.kind === "guest" && row.participantId === invitation.contactProfileId);
      return [{
        gain: channel?.gain ?? 1,
        muted: Boolean(channel?.isMuted || channel?.isHostForcedMuted),
        invitationId: invitation.invitationId,
        track: session.remoteTrack,
        // The gain is the last gate and follows actual LiveKit confirmation,
        // never the user's click alone. This also prevents a second caller
        // leaking through an aggregate track that is already on air.
        onAir: Boolean(
          invitation.isOnAir
          && audibleLiveCallIds?.has(invitation.invitationId)
        ),
      }];
    });
  }, [acceptedLiveCalls, audibleLiveCallIds, liveCallMediaSessions, place.isHost, room.id, room.channels]);
  const liveCallProgram = usePlaceLiveCallProgramMix(liveCallProgramInputs);
  const liveCallProgramGeneration = useMemo(() => (
    liveCallProgram.outputTrack ? createPlaceClientId() : null
  ), [liveCallProgram.outputTrack]);
  const liveCallOnAirIds = useMemo(() => liveCallProgramInputs
    .filter((input) => {
      const invitation = acceptedLiveCalls?.find((candidate) => (
        candidate.invitationId === input.invitationId
      ));
      return Boolean(
        invitation?.partyRole === "host"
        && invitation.callMode === "public"
        && invitation.routeMode === "public"
        && invitation.isOnAir
        && onAirLiveCallIds?.has(input.invitationId)
      );
    })
    .map((input) => input.invitationId), [acceptedLiveCalls, liveCallProgramInputs, onAirLiveCallIds]);
  const liveCallOnAirKey = liveCallOnAirIds.join(":");
  const liveCallOnAirIdsRef = useRef(liveCallOnAirIds);
  const liveCallAudibleIdsRef = useRef<string[]>([]);
  liveCallOnAirIdsRef.current = liveCallOnAirIds;

  usePlaceLiveCallRoomCleanup({
    roomId: room.id,
    onAirInvitationIds: liveCallOnAirIds,
    authorize: authorizeLiveCallProgram,
    setAudible: setLiveCallProgramAudible,
    setProgramEnabled: roomMedia.setCallProgramEnabled,
  });

  useEffect(() => {
    if (!setLiveCallProgramPreflight || !place.isHost) return undefined;
    setLiveCallProgramPreflight(room.id, liveCallProgram.resume);
    return () => setLiveCallProgramPreflight(room.id, null);
  }, [liveCallProgram.resume, place.isHost, room.id, setLiveCallProgramPreflight]);

  const browserVoiceEligible = !place.isLoading
    && room.source === "live"
    && room.status === "live"
    && (place.isHost || (place.isGuest && !acceptedContactLiveCall))
    && roomMedia.status === "connected"
    && roomMedia.canPublish
    && !nativeRoomAudioReady
    && rawBrowserAudioAuthorized;

  useEffect(() => {
    if (!place.isHost || !setRegieTalkbackPublicGate) return undefined;
    setRegieTalkbackPublicGate(room.id, {
      closePublic: async () => {
        // The native publisher cannot currently provide an atomic per-track
        // talkback gate. Refuse the private path instead of risking a word on
        // air. The browser path is muted before the private clone can open.
        if (nativeRoomAudioReady) return false;
        const shouldRestore = Boolean(
          browserVoiceEligible
          && roomMedia.voicePublished
          && personalMicrophoneEnabled,
        );
        regiePublicVoiceWasEnabledRef.current = shouldRestore;
        if (!shouldRestore) return true;
        return roomMedia.setVoiceEnabled(false);
      },
      restorePublic: async () => {
        const shouldRestore = regiePublicVoiceWasEnabledRef.current;
        regiePublicVoiceWasEnabledRef.current = false;
        if (!shouldRestore
          || !browserVoiceEligible
          || !roomMedia.voicePublished
          || !personalMicrophoneEnabled) return;
        await roomMedia.setVoiceEnabled(true);
      },
    });
    return () => {
      void setRegieTalkbackActive?.(room.id, false);
      setRegieTalkbackPublicGate(room.id, null);
      regiePublicVoiceWasEnabledRef.current = false;
    };
  }, [
    browserVoiceEligible,
    nativeRoomAudioReady,
    personalMicrophoneEnabled,
    place.isHost,
    room.id,
    roomMedia.setVoiceEnabled,
    roomMedia.voicePublished,
    setRegieTalkbackActive,
    setRegieTalkbackPublicGate,
  ]);

  useEffect(() => {
    if (!setLiveCallHostVoiceTrack) return undefined;
    const track = place.isHost && room.status === "live" ? localAudio.outputTrack : null;
    setLiveCallHostVoiceTrack(room.id, track);
    return () => setLiveCallHostVoiceTrack(room.id, null);
  }, [localAudio.outputTrack, place.isHost, room.id, room.status, setLiveCallHostVoiceTrack]);

  useEffect(() => {
    const track = liveCallProgram.outputTrack;
    const generation = liveCallProgramGeneration;
    if (!place.isHost
      || room.source !== "live"
      || room.status !== "live"
      || roomMedia.status !== "connected"
      || !track
      || !generation) {
      if (liveCallAudibleIdsRef.current.length > 0) {
        setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
        liveCallAudibleIdsRef.current = [];
      }
      void roomMedia.setCallProgramEnabled(false);
      void roomMedia.releaseCallProgramTrack();
      return undefined;
    }
    let current = true;
    void roomMedia.prepareCallProgramTrack(track, generation).then((prepared) => {
      if (!current || prepared) return;
      showNotice("Le retour téléphone n’a pas pu être préparé pour la Room.");
      void authorizeLiveCallProgram?.(liveCallOnAirIdsRef.current, false);
    });
    return () => {
      current = false;
      if (liveCallAudibleIdsRef.current.length > 0) {
        setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
        liveCallAudibleIdsRef.current = [];
      }
      void roomMedia.setCallProgramEnabled(false);
      void roomMedia.releaseCallProgramTrack();
    };
  }, [
    liveCallProgram.outputTrack,
    liveCallProgramGeneration,
    place.isHost,
    room.source,
    room.status,
    roomMedia.prepareCallProgramTrack,
    roomMedia.releaseCallProgramTrack,
    roomMedia.setCallProgramEnabled,
    roomMedia.status,
    authorizeLiveCallProgram,
    setLiveCallProgramAudible,
    showNotice,
  ]);

  useEffect(() => {
    if (liveCallOnAirIds.length === 0) {
      if (liveCallAudibleIdsRef.current.length > 0) {
        setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
        liveCallAudibleIdsRef.current = [];
      }
      void roomMedia.setCallProgramEnabled(false);
      return;
    }
    const prepared = roomMedia.status === "connected"
      && roomMedia.callProgramPublished
      && roomMedia.callProgramGeneration === liveCallProgramGeneration;
    if (!prepared) {
      if (liveCallAudibleIdsRef.current.length > 0) {
        setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
        liveCallAudibleIdsRef.current = [];
      }
      void roomMedia.setCallProgramEnabled(false);
      if (roomMedia.status === "reconnecting" || roomMedia.status === "disconnected" || roomMedia.status === "failed") {
        void authorizeLiveCallProgram?.(liveCallOnAirIdsRef.current, false);
      }
      return;
    }
    let current = true;
    if (liveCallAudibleIdsRef.current.length > 0) {
      setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
      liveCallAudibleIdsRef.current = [];
    }
    void liveCallProgram.resume().then(async (resumed) => {
      if (!current) return;
      const requestedIds = [...liveCallOnAirIdsRef.current];
      const authorized = resumed && authorizeLiveCallProgram
        ? await authorizeLiveCallProgram(requestedIds, true)
        : false;
      if (!current) {
        if (authorized) void authorizeLiveCallProgram?.(requestedIds, false);
        return;
      }
      const confirmed = authorized && await roomMedia.setCallProgramEnabled(true);
      if (confirmed && current) {
        setLiveCallProgramAudible?.(requestedIds, true);
        liveCallAudibleIdsRef.current = requestedIds;
        return;
      }
      if (!current) return;
      await roomMedia.setCallProgramEnabled(false);
      setLiveCallProgramAudible?.(requestedIds, false);
      await authorizeLiveCallProgram?.(requestedIds, false);
      showNotice("Le retour téléphone reste en préécoute : l’antenne audio n’a pas confirmé la diffusion.");
    });
    return () => {
      current = false;
      if (liveCallAudibleIdsRef.current.length > 0) {
        setLiveCallProgramAudible?.(liveCallAudibleIdsRef.current, false);
        liveCallAudibleIdsRef.current = [];
      }
      void roomMedia.setCallProgramEnabled(false);
    };
  }, [
    liveCallOnAirKey,
    liveCallProgram.resume,
    liveCallProgramGeneration,
    authorizeLiveCallProgram,
    roomMedia.callProgramGeneration,
    roomMedia.callProgramPublished,
    roomMedia.setCallProgramEnabled,
    roomMedia.status,
    setLiveCallProgramAudible,
    showNotice,
  ]);

  useEffect(() => {
    const privateCallCaptureEligible = hostPrivateCallNeedsBrowserVoice
      && room.status === "live"
      && !place.isLoading;
    if ((!browserVoiceEligible && !privateCallCaptureEligible)
      || !personalMicrophoneEnabled
      || localAudio.outputTrack) return;
    const scope = `${room.id}:${place.activeUserId ?? "anonymous"}`;
    let current = true;
    void localAudio.startCapture().catch(() => {
      if (!current || voiceCaptureNoticeRef.current === scope) return;
      voiceCaptureNoticeRef.current = scope;
      showNotice(privateCallCaptureEligible
        ? "Le retour micro du téléphone n’a pas pu démarrer. Vérifie son autorisation."
        : "Le microphone n’a pas pu être relié à la Room. Vérifie son autorisation.");
    });
    return () => { current = false; };
  }, [browserVoiceEligible, hostPrivateCallNeedsBrowserVoice, localAudio.outputTrack, localAudio.startCapture, personalMicrophoneEnabled, place.activeUserId, place.isLoading, room.id, room.status, showNotice]);

  useEffect(() => {
    const track = personalSendTrack;
    if (!browserVoiceEligible || !track || track.readyState !== "live") {
      void roomMedia.setVoiceEnabled(false);
      void roomMedia.releaseVoiceTrack();
      return;
    }
    const generation = createPlaceClientId();
    let current = true;
    void roomMedia.prepareVoiceTrack(track, generation).then((prepared) => {
      if (!current || prepared) return;
      const scope = `${room.id}:${generation}`;
      if (voicePublishNoticeRef.current === scope) return;
      voicePublishNoticeRef.current = scope;
      showNotice("La voix traitée n’a pas pu être publiée dans la Room.");
    });
    return () => {
      current = false;
      void roomMedia.setVoiceEnabled(false);
      void roomMedia.releaseVoiceTrack();
    };
  }, [browserVoiceEligible, personalSendTrack, room.id, roomMedia.prepareVoiceTrack, roomMedia.releaseVoiceTrack, roomMedia.setVoiceEnabled, showNotice]);

  useEffect(() => {
    if (!browserVoiceEligible || !roomMedia.voicePublished) return;
    let current = true;
    const shouldBePublic = (place.isHost ? personalMicrophoneEnabled : !viewerMix.levels.master.muted) && !regieTalkbackActive;
    void roomMedia.setVoiceEnabled(shouldBePublic).then((confirmed) => {
      if (!current || confirmed || !shouldBePublic) return;
      const scope = `${room.id}:${roomMedia.voiceGeneration ?? "voice"}`;
      if (voicePublishNoticeRef.current === scope) return;
      voicePublishNoticeRef.current = scope;
      showNotice("La Room n’a pas confirmé la diffusion du microphone.");
    });
    return () => { current = false; };
  }, [browserVoiceEligible, personalMicrophoneEnabled, place.isHost, viewerMix.levels.master.muted, regieTalkbackActive, room.id, roomMedia.setVoiceEnabled, roomMedia.voiceGeneration, roomMedia.voicePublished, showNotice]);

  useEffect(() => {
    if (desktopHost || room.source !== "live" || room.status !== "live" || !roomMedia.canPublish) return;
    let current = true;
    void roomMedia.setCameraEnabled(hostCameraEnabled).then((confirmed) => {
      if (!current || confirmed || !hostCameraEnabled) return;
      place.setOwnCameraEnabled(false);
      showNotice("La caméra n’a pas pu être publiée dans la Room.");
    });
    return () => { current = false; };
  }, [desktopHost, hostCameraEnabled, place.setOwnCameraEnabled, room.source, room.status, roomMedia.canPublish, roomMedia.setCameraEnabled, showNotice]);

  const toggleOwnMicrophone = useCallback(() => {
    if (!place.isHost) {
      if (viewerMix.engine.inputState("voice") !== "active") {
        if (viewerMix.levels.voice.muted) viewerMix.toggleMute("voice");
        void prepareViewerVoice().catch(() => undefined);
      } else viewerMix.toggleMute("voice");
      return;
    }
    if (!personalMicrophone) return;
    if (personalMicrophoneEnabled) void roomMedia.setVoiceEnabled(false);
    place.toggleChannelMute(personalMicrophone.id);
  }, [personalMicrophone, personalMicrophoneEnabled, place.isHost, viewerMix.engine, viewerMix.levels.voice.muted, viewerMix.toggleMute, prepareViewerVoice, place.toggleChannelMute, roomMedia.setVoiceEnabled]);

  const toggleOwnCamera = useCallback(async () => {
    const enabled = !hostCameraEnabled;
    if (room.source !== "live") {
      place.setOwnCameraEnabled(enabled);
      return;
    }
    if (!enabled) {
      await roomMedia.setCameraEnabled(false).catch(() => false);
      place.setOwnCameraEnabled(false);
      return;
    }
    const confirmed = await roomMedia.setCameraEnabled(true).catch(() => false);
    if (!confirmed) {
      showNotice("La caméra n’a pas pu être activée dans la Room.");
      return;
    }
    place.setOwnCameraEnabled(true);
  }, [hostCameraEnabled, place.setOwnCameraEnabled, room.source, roomMedia.setCameraEnabled, showNotice]);

  const startScreenShare = useCallback(async () => {
    if (!place.isHost || screenShareStartingRef.current || screenShare.isPublished) return;
    const generation = createPlaceClientId();
    screenShareGenerationRef.current = generation;
    screenShareStartingRef.current = true;
    setScreenShareStarting(true);
    try {
      const stream = screenShare.previewStream ?? await screenShare.selectSource({ includeAudio: true });
      if (!stream || screenShareGenerationRef.current !== generation) return;
      if (room.source === "live") {
        const published = await roomMedia.publishScreenShareStream(stream, generation).catch(() => false);
        if (screenShareGenerationRef.current !== generation) return;
        if (!published) {
          screenShare.stop();
          showNotice("Le partage d’écran n’a pas pu être envoyé dans la Room.");
          return;
        }
      }
      screenShare.publish();
    } finally {
      if (screenShareGenerationRef.current === generation) {
        screenShareStartingRef.current = false;
        setScreenShareStarting(false);
      }
    }
  }, [place.isHost, room.source, roomMedia.publishScreenShareStream, screenShare, showNotice]);

  const stopScreenShare = useCallback(() => {
    screenShareGenerationRef.current = createPlaceClientId();
    screenShareStartingRef.current = false;
    setScreenShareStarting(false);
    void roomMedia.releaseScreenShare();
    screenShare.stop();
  }, [roomMedia.releaseScreenShare, screenShare]);

  useEffect(() => {
    if (screenShare.previewStream && screenShare.isPublished) return;
    if (!screenShare.previewStream) void roomMedia.releaseScreenShare();
  }, [roomMedia.releaseScreenShare, screenShare.isPublished, screenShare.previewStream]);

  useEffect(() => {
    window.localStorage.setItem(PITCH_PROVIDER_STORAGE_KEY, pitchProvider);
  }, [pitchProvider]);

  useEffect(() => {
    if (nativePitchSelected
      || audioEngine.status !== "connected"
      || audioEngine.transport !== "native"
      || !audioEngine.chain
      || !personalMicrophone) return;
    const inputGainDb = linearGainToDb(personalInputGain);
    if (Math.abs(audioEngine.chain.inputGainDb - inputGainDb) < 0.05) return;
    const timer = window.setTimeout(() => {
      void audioEngine.updateChain({
        ...audioEngine.chain!,
        inputGainDb,
      }).then(() => {
        nativeChainGainErrorRef.current = false;
      }).catch(() => {
        if (nativeChainGainErrorRef.current) return;
        nativeChainGainErrorRef.current = true;
        showNotice("Le niveau Micro n’a pas pu être transmis au moteur audio local.");
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [audioEngine, audioEngine.chain, audioEngine.status, audioEngine.transport, audioEngine.updateChain, nativePitchSelected, personalInputGain, personalMicrophone, showNotice]);

  const refreshPlugins = useCallback(async (announce = true) => {
    if (import.meta.env.MODE !== "audio-lab") {
      setPluginInventory([]);
      if (announce) showNotice("Le gestionnaire VST3 local nécessite le lancement audio de développement.");
      return;
    }
    setPluginsRefreshing(true);
    try {
      const plugins = await getNativeVst3LabPlugins();
      setPluginInventory(plugins);
      if (announce) {
        const detected = plugins.filter((plugin) => plugin.capabilities.includes("detected_local")).length;
        showNotice(`Scan terminé : ${detected} plugin${detected > 1 ? "s" : ""} vocal${detected > 1 ? "aux" : ""} détecté${detected > 1 ? "s" : ""}. La compatibilité et l’activation seront vérifiées à l’ouverture.`);
      }
    } catch (error) {
      setPluginInventory([]);
      if (announce) showNotice(error instanceof Error ? error.message : "Impossible d’analyser les plugins locaux.");
      throw error;
    } finally {
      setPluginsRefreshing(false);
    }
  }, [showNotice]);

  useEffect(() => {
    if (import.meta.env.MODE !== "audio-lab") return;
    void refreshPlugins(false).catch(() => undefined);
  }, [refreshPlugins]);

  useEffect(() => {
    if (!nativePitchSelected) return;
    const selectionId = ++pitchProviderSelectionRef.current;
    const selectionRoomId = activeRoomIdRef.current;
    const snapshotGeneration = ++nativeSnapshotGenerationRef.current;
    setNativeSnapshotAuthority(null);
    const selectionIsCurrent = () => (
      activeRoomIdRef.current === selectionRoomId
      && pitchProviderSelectionRef.current === selectionId
    );
    const operation = pitchProviderOperationRef.current.catch(() => undefined).then(async () => {
      if (!selectionIsCurrent()) return;
      try {
        const snapshot = await refreshNativeVst3();
        if (!selectionIsCurrent()) {
          if (snapshot.pid !== null) await stopNativeVst3().catch(() => undefined);
          return;
        }
        const matchesSelection = snapshot.status === "running"
          && snapshot.audioReady
          && snapshot.pluginId === pitchProvider;
        if (matchesSelection) {
          setNativeSnapshotAuthority({
            generation: snapshotGeneration,
            roomId: selectionRoomId,
            provider: pitchProvider,
            pid: snapshot.pid,
          });
          disableLocalHeadphoneMonitoring();
          updateVocal({ monitoring: true });
          return;
        }
        if (snapshot.pid !== null) await stopNativeVst3();
        if (selectionIsCurrent()) updateVocal({ monitoring: false });
      } catch (error) {
        if (!selectionIsCurrent()) {
          await stopNativeVst3().catch(() => undefined);
          return;
        }
        updateVocal({ monitoring: false });
        showNotice(error instanceof Error ? error.message : "Impossible de récupérer le plugin VST3 sélectionné.");
      }
    });
    pitchProviderOperationRef.current = operation.then(() => undefined, () => undefined);
    return () => {
      if (pitchProviderSelectionRef.current === selectionId) pitchProviderSelectionRef.current += 1;
    };
  }, [disableLocalHeadphoneMonitoring, nativePitchSelected, pitchProvider, refreshNativeVst3, room.id, showNotice, stopNativeVst3, updateVocal]);

  const enqueuePitchProviderOperation = <T,>(perform: (selectionIsCurrent: () => boolean) => Promise<T>) => {
    const selectionId = ++pitchProviderSelectionRef.current;
    const selectionRoomId = activeRoomIdRef.current;
    const selectionIsCurrent = () => (
      activeRoomIdRef.current === selectionRoomId
      && pitchProviderSelectionRef.current === selectionId
    );
    const operation = pitchProviderOperationRef.current
      .catch(() => undefined)
      .then(() => perform(selectionIsCurrent));
    pitchProviderOperationRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  };

  const selectPitchProvider = (provider: PlacePitchProvider) => enqueuePitchProviderOperation(async (selectionIsCurrent) => {
    if (!selectionIsCurrent()) return false;
    const wasNative = isNativePitchProvider(pitchProvider);
    if (isNativePitchProvider(provider)) {
      const snapshotGeneration = ++nativeSnapshotGenerationRef.current;
      setNativeSnapshotAuthority(null);
      disableLocalHeadphoneMonitoring();
      if (audioEngine.monitoring?.enabled) {
        await audioEngine.setMonitoring(false).catch(() => undefined);
      }
      if (!selectionIsCurrent()) return false;
      updateVocal({ monitoring: false });
      try {
        await stopLocalCapture();
        if (!selectionIsCurrent()) return false;
        const started = await startNativeVst3(
          provider,
          nativeControlsFromVocal(room.personalVocal, personalInputGain),
        );
        if (!started.audioReady || started.pluginId !== provider) {
          throw new Error("Le plugin s’est ouvert sans fournir de retour audio exploitable.");
        }
        if (!selectionIsCurrent()) {
          await stopNativeVst3().catch(() => undefined);
          return false;
        }
        setNativeSnapshotAuthority({
          generation: snapshotGeneration,
          roomId: activeRoomIdRef.current,
          provider,
          pid: started.pid,
        });
        setPitchProvider(provider);
        updateVocal({ tuneEnabled: true, enabled: true, monitoring: true });
        showNotice(nativeMonitoringNotice(started.stdoutTail, nativeProviderLabel(provider), roomPresentation.label));
        return true;
      } catch (error) {
        await stopNativeVst3().catch(() => undefined);
        if (!selectionIsCurrent()) return false;
        setPitchProvider("none");
        updateVocal({ tuneEnabled: false, monitoring: false });
        showNotice(error instanceof Error ? error.message : "Le plugin VST3 n’a pas pu démarrer.");
        return false;
      }
    }
    if (wasNative) {
      try {
        await stopNativeVst3();
      } catch (error) {
        if (!selectionIsCurrent()) return false;
        showNotice(error instanceof Error ? error.message : "Le plugin actif ne s’est pas arrêté proprement.");
        return false;
      }
      if (!selectionIsCurrent()) return false;
      updateVocal({ monitoring: false });
    }
    if (provider === "meewav_test") {
      try {
        if (audioEngine.transport === "native") {
          await audioEngine.useWebAudioFallback("Autotune MeeWav sélectionné.");
        }
        if (!selectionIsCurrent()) return false;
        await startCaptureWithPitchAdapter(runtime.isDesktop ? superpoweredVoiceAdapter : meewavPitchCorrectionAdapter, selectionIsCurrent);
        if (!selectionIsCurrent()) return false;
        setPitchProvider(provider);
        place.updateVocal({ tuneEnabled: true, enabled: true });
        place.showNotice("Autotune MeeWav sélectionné. Active les effets dans ton casque pour le comparer.");
        return true;
      } catch (error) {
        if (!selectionIsCurrent()) return false;
        setPitchProvider(wasNative ? "none" : pitchProvider);
        place.updateVocal({ tuneEnabled: false, monitoring: false });
        place.showNotice(error instanceof Error ? error.message : "Impossible d’ouvrir le traitement Web Audio.");
        return false;
      }
    }
    if (provider === "opendaw") {
      if (!isVoiceCorrectionRoomEntryEnabled()) {
        setPitchProvider("none");
        place.updateVocal({ tuneEnabled: false });
        place.showNotice("Le laboratoire Autotune openDAW est désactivé.");
        return false;
      }
      try {
        if (!OPENDAW_ROOM_ADAPTER) throw new Error("Le moteur Autotune openDAW n’est pas disponible dans cette Room.");
        if (audioEngine.transport === "native") {
          await audioEngine.useWebAudioFallback("Autotune openDAW sélectionné.");
        }
        if (!selectionIsCurrent()) return false;
        await startCaptureWithPitchAdapter(OPENDAW_ROOM_ADAPTER, selectionIsCurrent);
        if (!selectionIsCurrent()) return false;
        setPitchProvider(provider);
        place.updateVocal({ tuneEnabled: true, enabled: true });
        place.showNotice("Autotune openDAW sélectionné. Le traitement reste sur cet appareil.");
        return true;
      } catch (error) {
        if (!selectionIsCurrent()) return false;
        setPitchProvider(wasNative ? "none" : pitchProvider);
        place.updateVocal({ tuneEnabled: false, monitoring: false });
        place.showNotice(error instanceof Error ? error.message : "Impossible d’ouvrir le traitement openDAW.");
        return false;
      }
    }
    if (!selectionIsCurrent()) return false;
    setPitchProvider(provider);
    place.updateVocal({ tuneEnabled: false });
    return true;
  });

  const removeNativePlugin = async (pluginId: PlaceNativePitchProvider) => {
    if (isNativePitchProvider(pitchProvider) && pitchProvider === pluginId) {
      await stopNativeVst3();
      setPitchProvider("none");
      updateVocal({ tuneEnabled: false, monitoring: false });
      showNotice(`${nativeProviderLabel(pluginId)} a été retiré de la chaîne. Le plugin reste installé sur l’ordinateur.`);
    }
  };

  useEffect(() => {
    const wasReady = nativeRoomAudioReadyRef.current;
    nativeRoomAudioReadyRef.current = nativeRoomAudioReady;
    if (nativeRoomAudioReady) {
      setNativeHandoffInterrupted(false);
      return;
    }
    if (wasReady && !nativeRoomAudioReady) {
      setNativeHandoffInterrupted(true);
      showNotice("La piste audio native s’est arrêtée. Choisis Reconnecter ou Continuer sans effets dans Effets voix.");
    }
  }, [nativeRoomAudioReady, showNotice]);

  useEffect(() => {
    setNativeHandoffInterrupted(false);
  }, [room.id]);

  const openPanel = (surface: PlaceStudioSurface) => {
    place.setSurface(surface);
    setPanelCollapsed(false);
  };

  const openDonation = () => {
    const focused = document.activeElement;
    setDialogAnchor(focused instanceof HTMLElement && focused.tagName === "BUTTON" ? focused : experienceRef.current?.querySelector<HTMLElement>(".place-stage__hat-action") ?? null);
    setLiveDialogTarget(document.fullscreenElement);
    panelStateBeforeDonationRef.current = panelCollapsed;
    setDonationOpen(true);
  };

  const closeDonation = () => {
    setDonationOpen(false);
    setPanelCollapsed(panelStateBeforeDonationRef.current);
  };

  useEffect(() => {
    const roomChanged = mediaRoomIdRef.current !== room.id;
    const roomClosed = room.status !== "live";
    if (!roomChanged && !roomClosed) return;
    const boundaryKey = roomChanged
      ? `${mediaRoomIdRef.current}->${room.id}`
      : `${room.id}:${room.status}`;
    if (handledMediaBoundaryRef.current === boundaryKey) return;
    handledMediaBoundaryRef.current = boundaryKey;
    mediaRoomIdRef.current = room.id;
    void stopLocalCapture();
    if (nativeVst3Snapshot?.pid !== null && nativeVst3Snapshot?.pid !== undefined) {
      void stopNativeVst3().catch(() => undefined);
    }
    if (audioEngine.monitoring?.enabled) {
      void audioEngine.setMonitoring(false).catch(() => undefined);
    }
    if (room.personalVocal.monitoring) updateVocal({ monitoring: false });
  }, [audioEngine, nativeVst3Snapshot?.pid, room.id, room.personalVocal.monitoring, room.status, stopLocalCapture, stopNativeVst3, updateVocal]);

  const toggleHeadphoneMonitoring = async () => {
    if (!place.isHost && !place.isGuest) return;
    if (nativePitchSelected) {
      if (nativePluginAudioReady) {
        await enqueuePitchProviderOperation(async (selectionIsCurrent) => {
          if (!selectionIsCurrent()) return;
          try {
            await stopNativeVst3();
            if (!selectionIsCurrent()) return;
            updateVocal({ monitoring: false });
            showNotice("Effets coupés dans le casque. Le plugin reste sélectionné et peut être réactivé ici.");
          } catch (error) {
            if (selectionIsCurrent()) {
              showNotice(error instanceof Error ? error.message : "Impossible d’arrêter le retour VST3.");
            }
          }
        });
        return;
      }
      await selectPitchProvider(pitchProvider);
      return;
    }
    if (monitoringRoute === "desktop_engine") {
      const next = !audioEngine.monitoring?.enabled;
      await enqueuePitchProviderOperation(async (selectionIsCurrent) => {
        if (!selectionIsCurrent()) return;
        try {
          await audioEngine.setMonitoring(next);
          if (!selectionIsCurrent()) {
            if (next) await audioEngine.setMonitoring(false).catch(() => undefined);
            return;
          }
          place.updateVocal({ monitoring: next });
          place.showNotice(next
            ? "Retour casque natif activé. Utilise un casque pour éviter tout larsen."
            : "Retour casque natif coupé. Le moteur conserve la chaîne sans la monitorer.");
        } catch {
          if (selectionIsCurrent()) place.showNotice("Impossible de modifier le retour casque du moteur audio.");
        }
      });
      return;
    }
    if (room.personalVocal.monitoring) {
      localAudio.disableHeadphoneMonitoring();
      place.updateVocal({ monitoring: false });
      place.showNotice("Retour casque coupé. Le traitement micro reste actif en local.");
      return;
    }
    await enqueuePitchProviderOperation(async (selectionIsCurrent) => {
      if (!selectionIsCurrent()) return;
      try {
        await localAudio.enableHeadphoneMonitoring();
        if (!selectionIsCurrent()) {
          localAudio.disableHeadphoneMonitoring();
          return;
        }
        place.updateVocal({ monitoring: true });
        place.showNotice("Retour casque activé. Utilise un casque pour éviter tout larsen.");
      } catch {
        if (!selectionIsCurrent()) return;
        place.updateVocal({ monitoring: false });
        place.showNotice("Impossible d’activer le retour casque. Vérifie l’autorisation du microphone.");
      }
    });
  };

  useEffect(() => {
    if (!nativeRoomAudioReady || hostPrivateCallNeedsBrowserVoice || localAudioStatus === "idle") return;
    void stopLocalCapture();
  }, [hostPrivateCallNeedsBrowserVoice, localAudioStatus, nativeRoomAudioReady, roomPresentation.label, stopLocalCapture]);

  useEffect(() => {
    if (nativePitchSelected) {
      if (localMonitoring) disableLocalHeadphoneMonitoring();
      if (audioEngine.monitoring?.enabled) {
        void audioEngine.setMonitoring(false).catch(() => undefined);
      }
      if (room.personalVocal.monitoring !== nativePluginAudioReady) {
        updateVocal({ monitoring: nativePluginAudioReady });
      }
      return;
    }
    if (monitoringRoute === "desktop_engine") {
      if (localMonitoring) disableLocalHeadphoneMonitoring();
      const nativeMonitoring = Boolean(audioEngine.monitoring?.enabled);
      if (room.personalVocal.monitoring !== nativeMonitoring) updateVocal({ monitoring: nativeMonitoring });
      return;
    }
    if (!room.personalVocal.monitoring) return;
    if (localMonitoring || localAudioStatus === "requesting_permission") return;
    updateVocal({ monitoring: false });
  }, [audioEngine, disableLocalHeadphoneMonitoring, localAudioStatus, localMonitoring, monitoringRoute, nativePitchSelected, nativePluginAudioReady, room.personalVocal.monitoring, updateVocal]);

  useEffect(() => {
    if (!nativePitchSelected || !nativePluginAudioReady) return;
    const controls = nativeControlsFromVocal(room.personalVocal, personalInputGain);
    const timer = window.setTimeout(() => {
      void updateNativeVst3(controls).catch((error) => {
        showNotice(error instanceof Error ? error.message : "Les réglages du VST3 n’ont pas été appliqués.");
      });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [nativePitchSelected, nativePluginAudioReady, personalInputGain, room.personalVocal, showNotice, updateNativeVst3]);

  const shellbarVisible = !place.isLoading && (room.status === "live" || room.status === "ended");
  const hostSocialActions = !place.isHost ? <PlaceChatSocialActions room={room}
    canEngage={place.canEngage} goldenUnavailable={place.goldenLikeUnavailable}
    onLike={place.toggleLike} onGoldenLike={place.giveGoldenLike}
    onOpenDonation={openDonation} supportAction={support.action}
    onSupportThrow={() => { void support.launch(); }} /> : undefined;
  return (
    <ViewerMixerContext.Provider value={place.isHost ? null : { ...viewerMix, prepareVoice: prepareViewerVoice, voiceStatus: localAudio.status, publication: roomMedia.voiceAudible ? "En scène" : contactMixAudible ? "Avec le host" : roomMedia.status === "reconnecting" ? "Reconnexion…" : "Préparation locale" }}>
    <RoomPresentationProvider presentation={roomPresentation}>
    <CageGoldenLikeProvider key={`${room.source}:${room.id}:${place.activeUserId}`} room={room} viewerId={place.activeUserId} canEngage={place.canEngage} enabled={roomPresentation.id === "cage" && !place.isHost}>
      <SwitchRoomInvitation controller={switching} hostName={room.host.displayName}/>
      {shellbarVisible ? (
        <PlaceRoomShellHeader
          switchSlot={place.isHost ? <SwitchRoomButton room={room} onQueueOpen={place.setQueueOpen} controller={switching} enabled={room.status === "live"}/> : room.source === "demo" && roomPresentation.id === "place" ? <div className="switch-room-anchor"><button type="button" disabled={switching.busy} onClick={()=>void switching.simulate()}>Simuler un switch</button>{switching.error?<span role="alert">{switching.error}</span>:null}</div> : undefined}
          room={room}
          isHost={place.isHost}
          endConfirmationOpen={endConfirmationOpen}
          onEndConfirmationOpen={setEndConfirmationOpen}
          onEndRoom={place.endRoom}
          onLeaveRoom={onLeaveRoom}
          onLiveCallRequest={onLiveCallRequest}
        />
      ) : null}

      <section
        ref={experienceRef}
        className={`place-room-experience place-room-shell${shellbarVisible ? " has-shellbar" : ""}${place.isLoading ? " is-loading" : ""}${room.status === "ended" ? " is-ended" : ""}${place.isHost ? " is-host" : place.isGuest ? " is-guest" : " is-viewer"}`}
        aria-label={roomPresentation.label}
        data-room-presentation={roomPresentation.id}
        data-room-theme={roomPresentation.theme}
        data-local-audio={localAudio.outputTrack ? "ready" : localAudio.status}
        data-local-audio-latency-ms={localAudio.latency.estimatedMonitoringLatencyMs?.toFixed(1) ?? "unknown"}
        data-pitch-dsp-latency-ms={localAudio.latency.estimatedDspLatencyMs?.toFixed(1) ?? "unknown"}
        data-audio-engine={nativePluginAudioReady ? "vst3-local" : nativeRoomAudioReady ? "native-room" : nativeMonitoringReady ? "native-monitor" : "web-audio"}
      >
      {place.isLoading ? (
        <div className="place-room-loading" role="status" aria-live="polite">
          <span aria-hidden="true"><i /></span>
          <small>{roomPresentation.uppercaseLabel}</small>
          <strong>Connexion à l’antenne…</strong>
        </div>
      ) : <div className={`place-room-workspace${panelCollapsed ? " is-panel-collapsed" : ""}${room.status === "ended" ? " is-broadcast-ended" : ""}`}>
        <div className="place-room-live-column">
          {roomPresentation.id === "cage" && place.isHost ? <CageMixerTimer /> : null}
          <PlaceStage
            room={room}
            hostSocialActions={hostSocialActions}
            isHost={place.isHost}
            isGuest={place.isGuest}
            canEngage={place.canEngage}
            currentUserId={place.activeUserId}
            hostCameraEnabled={hostCameraEnabled}
            hostMicrophoneEnabled={place.isHost ? personalMicrophoneEnabled : !viewerMix.levels.voice.muted && viewerMix.engine.inputState("voice") === "active"}
            hostMonitoringEnabled={monitoringEnabled}
            onToggleHostMicrophone={toggleOwnMicrophone}
            onToggleHostCamera={() => { void toggleOwnCamera(); }}
            onToggleHostMonitoring={() => { void toggleHeadphoneMonitoring(); }}
            onVotePoll={place.votePoll}
            onNotice={place.showNotice}
            screenShareStream={screenShare.publishedStream}
            screenSharePublished={screenShare.isPublished}
            screenShareRequesting={screenShare.isRequesting || screenShareStarting}
            onStartScreenShare={() => { void startScreenShare(); }}
            onStopScreenShare={stopScreenShare}
            remoteAudioTracks={rtcMediaMatchesRoom ? roomMedia.remoteAudioTracks : []}
            liveKitVideoTracks={rtcMediaMatchesRoom ? roomMedia.videoTracks : []}
            rtcAudioPlaybackReady={rtcMediaMatchesRoom && roomMedia.status === "connected" && !roomMedia.autoplayBlocked}
            suppressPhoneCallAudio={suppressPublicPhoneCallAudio}
            excludeOwnPhoneCallAudio={acceptedContactLiveCall}
            allowHlsPhoneCallHandoff={allowHlsPhoneCallHandoff}
            onViewerProgramActiveChange={handleViewerProgramActiveChange}
            onStartRemoteAudio={roomMedia.startAudio}
            onOpenProfile={onOpenProfile}
            onMoveGuest={place.moveGuest}
            panelCollapsed={panelCollapsed}
            onPanelCollapsedChange={setPanelCollapsed}
            programLayout={programLayout.programLayout}
            onProgramLayoutChange={programLayout.updateProgramLayout}
            canDirectProgram={programLayout.canDirectProgram}
          />
          {room.status === "ended" ? <div className="place-room-live-ended" role="status"><small>{roomPresentation.uppercaseLabel}</small><strong>Live terminé</strong><span>La régie et le chat restent ouverts.</span></div> : null}
        </div>

        <PlaceStudioPanel
          experienceWaiting={switching.waiting ? <SwitchRoomWaiting controller={switching}/> : undefined}
          experienceVersion={switching.state?.version}
          onSpotlightStudent={spotlightStudent}
          spotlightStudentId={spotlightStudentId}
          liveKitVideoTracks={rtcMediaMatchesRoom && place.isHost ? roomMedia.videoTracks : []}
          room={room}
          isHost={place.isHost}
          isGuest={place.isGuest}
          canEngage={place.canEngage}
          collapsed={panelCollapsed}
          onCollapsedChange={setPanelCollapsed}
          onLeaveRoom={onLeaveRoom}
          surface={place.surface}
          onSurface={openPanel}
          mixerView={mixerView}
          onMixerView={setMixerView}
          onGain={place.setChannelGain}
          onMute={place.toggleChannelMute}
          onCamera={place.setParticipantCameraEnabled}
          onVocal={place.updateVocal}
          onTune={place.setTune}
          pitchProvider={pitchProvider}
          pitchCorrection={localAudio.pitchCorrection}
          localAudioStatus={localAudio.status}
          localAudioError={localAudio.error}
          pluginInventory={pluginInventory}
          pluginsRefreshing={pluginsRefreshing}
          nativePluginStatus={nativeVst3Snapshot?.status ?? "idle"}
          nativePluginAudioReady={nativePluginAudioReady}
          nativePluginError={nativeVst3Error ?? nativeVst3Snapshot?.message ?? null}
          onPitchProvider={selectPitchProvider}
          onRefreshPlugins={() => refreshPlugins(true)}
          onRemoveNativePlugin={removeNativePlugin}
          onToggleMonitoring={() => { void toggleHeadphoneMonitoring(); }}
          onAudioPreview={desktopMusicReserved ? async () => false : place.prepareTrackPreview}
          onAudioPreviewMetadata={desktopMusicReserved ? async () => false : place.updateTrackPreviewMetadata}
          onAudioRoute={desktopMusicReserved ? async () => false : place.setTrackRoute}
          onAudioPlaybackState={desktopMusicReserved ? async () => false : place.setTrackPlaybackState}
          programAudio={room.source === "live" && place.isHost ? programAudio : undefined}
          hostVoiceMeterStream={desktopHost && desktopOnAir ? localAudio.outputStream : null}
          onSendMessage={place.sendMessage}
          chatSocialActions={hostSocialActions}
          onJoinQueue={place.joinQueue}
          onLeaveQueue={place.leaveCurrentQueue}
          onAcceptInvitation={place.acceptCurrentInvitation}
          onDeclineInvitation={place.declineCurrentInvitation}
          onMarkReady={place.markCurrentInvitationReady}
          onLaunchPoll={place.launchPoll}
          onStopPoll={place.stopPoll}
          onVotePoll={place.votePoll}
          onPinHighlight={place.pinHighlight}
          onPinMessage={place.pinMessage}
          onDeleteMessage={place.deleteMessage}
          onClearHighlight={place.clearHighlight}
          onSubmitGift={place.submitGift}
          onCreateGiftDraw={place.createGiftDraw}
          onScheduleGiftDraw={place.scheduleGiftDraw}
          onStartGiftDraw={place.startGiftDraw}
          onCancelGiftDraw={place.cancelGiftDraw}
          onMoveGuest={place.moveGuest}
          onInviteProfile={place.inviteProfile}
          onRemoveGuest={place.removeGuest}
          onSetQueueOpen={place.setQueueOpen}
          onOpenProfile={onOpenProfile}
          onMessageProfile={onMessageProfile}
          onCollaborateProfile={setCollaborationProfile}
        />
      </div>}



      {!place.isHost && room.status === "live" && donationOpen ? (
        createPortal(<LiveActionPopover anchor={dialogAnchor}><RoomSupportPanel
          key={`${room.id}:${place.activeUserId}`}
          hostId={room.host.id}
          hostName={room.host.displayName}
          wallet={supportWallet}
          canEngage={place.canEngage}
          onClose={closeDonation}
          prepared={support.prepared}
          onPrepare={support.prepare}
          onCancelPrepared={support.cancel}
        /></LiveActionPopover>, liveDialogTarget ?? experienceRef.current!)
      ) : null}

      {collaborationProfile ? (
        <ShortsCollaborationDialog
          source="rooms"
          item={{
            artistId: collaborationProfile.id,
            mockArtistId: collaborationProfile.id,
            profileId: collaborationProfile.id,
            artist: collaborationProfile.displayName,
            image: collaborationProfile.avatarUrl,
            role: collaborationProfile.role,
            city: collaborationProfile.city,
            gradeLevel: collaborationProfile.gradeLevel as GradeLevel,
          }}
          onClose={() => setCollaborationProfile(null)}
          onSubmitted={(requestId) => {
            const profileId = collaborationProfile.id;
            setCollaborationProfile(null);
            onCollaborateProfile(profileId, requestId);
          }}
        />
      ) : null}

      {place.notice ? <div className="place-room-toast" role="status"><i /><span>{place.notice}</span></div> : null}
      </section>
      {desktopHost && room.status === "live" && productionInitialized && typeof document !== "undefined" ? createPortal(
        <div className={`place-room-production-drawer${productionOpen ? " is-open" : ""}`} aria-hidden={!productionOpen} inert={!productionOpen}>
          <button type="button" className="place-room-production-drawer__backdrop" tabIndex={-1} aria-label="Fermer la régie" onClick={closeProduction} />
          <div ref={productionDialogRef} className="place-room-production-drawer__panel" role="dialog" aria-modal="true" aria-label="Régie du direct">
            <button ref={productionCloseRef} type="button" className="place-room-production-drawer__close" aria-label="Fermer la régie" onClick={closeProduction}><X aria-hidden="true" /></button>
            <RoomProductionPreparation
              key={room.id} roomId={room.id} liveRoom={room.source === "live"}
              initialSetup={readRoomProductionSetup(room.id)}
              onAir={desktopOnAir} publicationStatus={roomMedia.status} transportError={roomMedia.error}
              onStart={(stream, musicSource) => {
                if (musicSource && roomMedia.musicAudible) { place.showNotice('Arrête d’abord la musique du lecteur Meewav.'); return false; }
                setDesktopMusicSource(musicSource);
                setDesktopProgramStream(stream); setDesktopBroadcastRoom(room.id);
                return true;
              }} onStop={() => {
                setDesktopBroadcastRoom(null);
                setDesktopProgramStream(null);
                setDesktopMusicSource(null);
                stopScreenShare();
                void stopLocalCapture();
              }}
            />
          </div>
        </div>, document.body,
      ) : null}
    </CageGoldenLikeProvider>
    </RoomPresentationProvider>
    </ViewerMixerContext.Provider>
  );
}

