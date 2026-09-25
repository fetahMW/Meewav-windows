import { useRuntime } from "../../../runtime/RuntimeProvider";
import "./place-mixer-android-fx.css";
import { useViewerMixer } from "./ViewerMixerContext";
import type { ViewerFader, ViewerInput } from "./viewerSendAudio";
import "./viewer-mixer-routing.css";
import { useWaveViewerListening } from "../wave-viewer/WaveViewerListening";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  Power,
  AudioLines,
  AudioWaveform,
  Camera,
  CameraOff,
  Check,
  ChevronDown,
  Grid3X3,
  Headphones,
  ListMusic,
  Mic,
  MicOff,
  Pause,
  Play,
  Radio,
  SlidersHorizontal,
  Settings2,
  Timer,
  Volume2,
  VolumeX,
} from "lucide-react";
import { isVoiceCorrectionRoomEntryEnabled } from "../voice-correction/voiceCorrection.flags";
import MeewavTooltip from "../../../components/shared/tooltip/MeewavTooltip";
import { useRoomPresentation } from "../roomPresentation";
import type { NativeVst3LabMonitorStatus } from "../voice-correction/nativeVst3LabMonitor";
import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";
import {
  OPENDAW_VOICE_CORRECTION_KEYS,
  OPENDAW_VOICE_CORRECTION_SCALES,
} from "../voice-correction/voiceCorrection.types";
import type {
  PlaceAudioPlaybackState,
  PlaceAudioPreviewInput,
  PlaceAudioRoute,
  PlaceMixerChannel,
  PlaceMixerView,
  PlaceMusicalScale,
  PlaceParticipant,
  PlaceNativePitchProvider,
  PlacePitchProvider,
  PlaceRoomState,
} from "./place.types";
import type { PlaceLocalAudioSnapshot } from "./placeLocalAudioEngine";
import PlaceTwists from "./PlaceTwists";
import PlaceMixerAudioPlayer, { type PlaceMixerProgramAudioTransport } from "./PlaceMixerAudioPlayer";
import PlaceTime from "./PlaceTime";
import PlacePluginManager from "./PlacePluginManager";
import { isNativePitchProvider } from "./placeAudioRouting";
import { PLACE_MIXER_FALLBACK_COVERS } from "./placeMixerCoverCatalog";
import { useStudioToolsLayout } from "./StudioToolsLayoutProvider";

type PlaceMixerProps = {
  room: PlaceRoomState;
  mode: "host" | "guest" | "viewer";
  currentUserId?: string | null;
  view: PlaceMixerView;
  onView: (view: PlaceMixerView) => void;
  onGain: (channelId: string, gain: number) => void;
  onMute: (channelId: string) => void;
  onCamera: (participantId: string, enabled: boolean) => void;
  onVocal: (patch: Partial<PlaceRoomState["personalVocal"]>) => void;
  onTune: (key: string, scale: PlaceMusicalScale) => void;
  pitchProvider: PlacePitchProvider;
  pitchCorrection: PlaceLocalAudioSnapshot["pitchCorrection"];
  localAudioStatus: PlaceLocalAudioSnapshot["status"];
  localAudioError: string | null;
  pluginInventory: readonly AudioEnginePlugin[];
  pluginsRefreshing: boolean;
  nativePluginStatus: NativeVst3LabMonitorStatus;
  nativePluginAudioReady: boolean;
  nativePluginError: string | null;
  onPitchProvider: (provider: PlacePitchProvider) => boolean | Promise<boolean>;
  onRefreshPlugins: () => void | Promise<void>;
  onRemoveNativePlugin: (pluginId: PlaceNativePitchProvider) => void | Promise<void>;
  onToggleMonitoring: () => void;
  onAudioPreview?: (input: PlaceAudioPreviewInput) => Promise<boolean>;
  onAudioPreviewMetadata?: (input: PlaceAudioPreviewInput) => Promise<boolean>;
  onAudioRoute?: (route: PlaceAudioRoute, generation: string) => Promise<boolean>;
  onAudioPlaybackState?: (state: PlaceAudioPlaybackState, generation: string) => Promise<boolean>;
  programAudio?: PlaceMixerProgramAudioTransport;
  /** Processed host voice already sent through the existing Room audio path. */
  hostVoiceMeterStream?: MediaStream | null;
  /** Direct surface state prevents a cold-load frame from showing Mixer under the active Tools tab. */
  toolsVisible?: boolean;
  /** Compatibility for older embedded Room harnesses; the safe player no longer uses a blind toggle. */
  onTogglePlayback?: () => void;
};

const KEYS = OPENDAW_VOICE_CORRECTION_KEYS;
const SCALES: PlaceMusicalScale[] = [...OPENDAW_VOICE_CORRECTION_SCALES];
const VOCAL_PRESETS: PlaceRoomState["personalVocal"]["preset"][] = ["Clean", "Warm", "Rap", "Trap", "Radio"];
const NATIVE_ENGINE_ORDER: Record<PlaceNativePitchProvider, number> = {
  "antares.autotune": 0,
  "sixthsample.spoton": 1,
  "auburnsounds.graillon3": 2,
};
type FxAccordionId = "autotune" | "effects" | "plugins";

function AutotuneSparkleIcon() {
  return (
    <svg viewBox="6 0 60 62" preserveAspectRatio="none" role="img" aria-label="">
      <defs>
        <linearGradient id="place-autotune-sparkle-main" x1="5" y1="8" x2="56" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0e4ff" />
          <stop offset=".48" stopColor="#b56fff" />
          <stop offset="1" stopColor="#7442c8" />
        </linearGradient>
      </defs>
      <path
        fill="url(#place-autotune-sparkle-main)"
        transform="translate(0 2) translate(27.5 27.5) scale(1.05 1.06) translate(-27.5 -27.5)"
        d="M27.5 4c3.5 14 7.5 19 21 23.5-13.5 4-17.5 9-21 23.5-3.5-14.5-7.5-19.5-21-23.5 13.5-4 17.5-9 21-23.5Z"
      />
      <path
        fill="#bd7aff"
        transform="translate(1 -1) translate(48 11.1) scale(1.11 1.19) translate(-48 -11.1)"
        d="M48 1.5c1.4 5.8 3.2 8.1 9 9.6-5.8 1.5-7.6 3.8-9 9.6-1.5-5.8-3.3-8.1-9.1-9.6 5.8-1.5 7.6-3.8 9.1-9.6Z"
      />
      <path
        fill="#8150d7"
        transform="translate(-1 -.5) translate(54 49) scale(.9 1.03) translate(-54 -49)"
        d="M54 38c1.6 6.6 3.7 9.3 10.4 11-6.7 1.7-8.8 4.4-10.4 11-1.7-6.6-3.8-9.3-10.5-11 6.7-1.7 8.8-4.4 10.5-11Z"
      />
    </svg>
  );
}


function PluginPlugGlyph() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="place-plugin-plug-gradient" x1="7" y1="32" x2="33" y2="7" gradientUnits="userSpaceOnUse">
          <stop stopColor="#dfe1e6" />
          <stop offset=".52" stopColor="#ae70eb" />
          <stop offset="1" stopColor="#7040c2" />
        </linearGradient>
      </defs>
      <path d="m14 9 17 17m-4-21-6 6m14 0-6 6M12.5 17.5l10 10-3.2 3.2a7.1 7.1 0 0 1-10 0 7.1 7.1 0 0 1 0-10l3.2-3.2ZM9.1 30.9 5 35" stroke="url(#place-plugin-plug-gradient)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PluginPuzzleGlyph() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="place-plugin-puzzle-gradient" x1="8" y1="6" x2="30" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d39bff" />
          <stop offset=".5" stopColor="#ad66ef" />
          <stop offset="1" stopColor="#7440c8" />
        </linearGradient>
      </defs>
      <g transform="rotate(-38 20 20)" stroke="url(#place-plugin-puzzle-gradient)" strokeWidth="1.7" strokeLinejoin="round">
        <path d="M21 5h4c-.8 1-.9 1.8-.9 2.5a3 3 0 0 0 6 0c0-.7-.1-1.5-.9-2.5H34v8.2c1-.7 1.7-.9 2.3-.9a2.8 2.8 0 0 1 0 5.6c-.6 0-1.3-.2-2.3-.9V23h-7.5c.5-.9.7-1.7.7-2.3a3.4 3.4 0 0 0-6.8 0c0 .6.2 1.4.7 2.3H17v-6.3c.7.5 1.4.7 2 .7a3 3 0 0 0 0-6c-.6 0-1.3.2-2 .7V5Z" />
        <path d="M5 20h7c-.7-1-.9-1.8-.9-2.5a3 3 0 0 1 6 0c0 .7-.2 1.5-.9 2.5H22v5.5c.9-.6 1.7-.8 2.3-.8a3 3 0 0 1 0 6c-.6 0-1.4-.2-2.3-.8V36h-7c.6-.9.8-1.6.8-2.3a3 3 0 0 0-6 0c0 .7.2 1.4.8 2.3H5v-6.4c-.8.5-1.5.7-2.1.7a2.8 2.8 0 0 1 0-5.6c.6 0 1.3.2 2.1.7Z" fill="url(#place-plugin-puzzle-gradient)" />
      </g>
    </svg>
  );
}


const EQ_GAIN_BY_PRESET: Record<PlaceRoomState["personalVocal"]["preset"], number> = {
  Clean: 0,
  Warm: -3,
  Rap: 1,
  Trap: 3,
  Radio: 6,
};

function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

function toVisualPosition(value: number, sourcePivot: number, visualPivot: number) {
  const normalized = clampUnit(value);
  if (normalized <= sourcePivot) return normalized / sourcePivot * visualPivot;
  return visualPivot + (normalized - sourcePivot) / (1 - sourcePivot) * (1 - visualPivot);
}

function fromVisualPosition(value: number, sourcePivot: number, visualPivot: number) {
  const normalized = clampUnit(value);
  if (normalized <= visualPivot) return normalized / visualPivot * sourcePivot;
  return sourcePivot + (normalized - visualPivot) / (1 - visualPivot) * (1 - sourcePivot);
}

function nearestEqPreset(value: number) {
  const gain = -12 + clampUnit(value) * 27;
  return VOCAL_PRESETS.reduce((nearest, preset) => (
    Math.abs(EQ_GAIN_BY_PRESET[preset] - gain) < Math.abs(EQ_GAIN_BY_PRESET[nearest] - gain)
      ? preset
      : nearest
  ), VOCAL_PRESETS[0]);
}

function isDetectedNativePlugin(plugin: AudioEnginePlugin) {
  return plugin.status === "ready" && plugin.licensed
    || plugin.status === "disabled"
      && plugin.capabilities.includes("detected_local")
      && plugin.capabilities.includes("probe_required")
      && plugin.capabilities.includes("native_host_available");
}

function FxAccordion({
  id,
  title,
  description,
  status,
  statusLive = false,
  icon,
  open,
  onToggle,
  headerAction,
  children,
}: {
  id: FxAccordionId;
  title: string;
  description: string;
  status?: string;
  statusLive?: boolean;
  icon: ReactNode;
  open: boolean;
  onToggle: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const panelId = `place-fx-accordion-${id}`;
  const statusId = `place-fx-accordion-${id}-status`;
  const trigger = (
    <button
      type="button"
      className="place-fx-accordion__trigger"
      aria-label={title}
      aria-expanded={open}
      aria-controls={panelId}
      aria-describedby={status ? statusId : undefined}
      onClick={onToggle}
    >
      <span className="place-fx-accordion__icon" aria-hidden="true">{icon}</span>
      <span className="place-fx-accordion__copy"><strong>{title}</strong><small>{description}</small></span>
      {status ? <em id={statusLive ? undefined : statusId} aria-hidden={statusLive ? "true" : undefined}>{status}</em> : null}
      {headerAction ? <span className="place-fx-accordion__action-slot" aria-hidden="true" /> : null}
      <ChevronDown className="place-fx-accordion__chevron" aria-hidden="true" />
    </button>
  );
  return (
    <section className={`place-fx-accordion${open ? " is-open" : ""}`} data-section={id}>
      {headerAction ? <div className="place-fx-accordion__header">{trigger}{headerAction}</div> : trigger}
      {status && statusLive ? <span id={statusId} className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</span> : null}
      {open ? <div className="place-fx-accordion__panel" id={panelId}>{children}</div> : null}
    </section>
  );
}

function formatGainDb(gain: number) {
  if (gain <= 0.001) return "−∞ dB";
  return `${(20 * Math.log10(gain)).toFixed(1).replace("-", "−")} dB`;
}

function participantFor(room: PlaceRoomState, channel: PlaceMixerChannel) {
  return [...room.participants, ...room.queue].find((participant) => (
    participant.id === channel.participantId || participant.profile.id === channel.participantId
  ));
}

function channelStatus(channel: PlaceMixerChannel) {
  if (channel.isMuted || channel.signalState === "muted") {
    if (channel.kind === "audio") return "Musique coupée";
    if (channel.kind === "master") return "Sortie coupée";
    if (channel.isHostForcedMuted) return "Coupé par le Host";
    if (channel.isSelfMuted && channel.kind === "guest") return "Coupé par l’invité";
    return "Micro coupé";
  }
  if (channel.signalState === "clipping") return "Saturation";
  if (channel.signalState === "disconnected") return "Déconnecté";
  if (channel.signalState === "connecting") return "Connexion…";
  if (channel.signalState === "silent") return "Silence";
  return "";
}

function randomMixerCover(previous?: string) {
  const covers = previous
    ? PLACE_MIXER_FALLBACK_COVERS.filter((cover) => cover !== previous)
    : PLACE_MIXER_FALLBACK_COVERS;
  return covers[Math.floor(Math.random() * covers.length)] ?? PLACE_MIXER_FALLBACK_COVERS[0];
}

function SourceVisual({ channel, participant, room, musicCover }: {
  channel: PlaceMixerChannel;
  participant?: PlaceParticipant;
  room: PlaceRoomState;
  musicCover?: string;
}) {
  if (channel.kind === "audio") {
    return <span className="place-volume-row__source-icon is-music" aria-hidden="true"><img src={musicCover ?? PLACE_MIXER_FALLBACK_COVERS[0]} alt="" /></span>;
  }
  if (channel.kind === "master") {
    return <span className="place-volume-row__source-icon is-master" aria-hidden="true"><Radio /></span>;
  }
  const profile = participant?.profile ?? room.host;
  return (
    <span className="place-volume-row__portrait" aria-hidden="true">
      <img className="place-volume-row__avatar" src={profile.avatarUrl} alt="" />
    </span>
  );
}

function useAudioStreamPeak(stream: MediaStream | null | undefined) {
  const [measurement, setMeasurement] = useState<{ stream: MediaStream; level: number } | null>(null);
  useEffect(() => {
    if (!stream || !stream.getAudioTracks().some((track) => track.readyState === "live") || typeof AudioContext === "undefined") return;
    let context: AudioContext;
    try { context = new AudioContext(); }
    catch { return; }
    let input: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    try {
      input = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 512;
      input.connect(analyser);
    } catch {
      void context.close().catch(() => undefined);
      return;
    }
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample));
      const level = Math.round(Math.min(1, peak) * 100) / 100;
      setMeasurement((current) => current?.stream === stream && current.level === level ? current : { stream, level });
    }, 100);
    void context.resume().catch(() => undefined);
    return () => {
      window.clearInterval(timer);
      input.disconnect();
      analyser.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [stream]);
  return measurement && measurement.stream === stream ? measurement.level : null;
}

function VolumeRow({
  channel,
  room,
  isMaster = false,
  onGain,
  onMute,
  onCamera,
  canEditGain,
  canEditMute,
  cameraControl,
  hostMuteControl = false,
  meterSuppressed = false,
  meterStream,
  isPlaying,
  onTogglePlayback,
  onOpenPlaylist,
  musicCover,
  onConfigure,
  configureLabel,
  sourceStateLabel,
}: {
  channel: PlaceMixerChannel;
  room: PlaceRoomState;
  isMaster?: boolean;
  onGain: (channelId: string, gain: number) => void;
  onMute: (channelId: string) => void;
  onCamera: (participantId: string, enabled: boolean) => void;
  canEditGain: boolean;
  canEditMute: boolean;
  cameraControl: "none" | "own" | "host";
  hostMuteControl?: boolean;
  meterSuppressed?: boolean;
  meterStream?: MediaStream | null;
  isPlaying?: boolean;
  onTogglePlayback?: () => void;
  onOpenPlaylist?: () => void;
  musicCover?: string;
  onConfigure?: () => void;
  configureLabel?: string;
  sourceStateLabel?: string;
}) {
  const measuredLevel = useAudioStreamPeak(meterStream);
  const participant = participantFor(room, channel);
  const isVocal = channel.kind === "microphone" || channel.kind === "guest";
  const level = channel.isMuted || meterSuppressed ? 0 : Math.min(1, Math.max(0, measuredLevel ?? channel.level));
  const signalState = channel.isMuted ? "muted" : measuredLevel === null ? channel.signalState : level >= 0.98 ? "clipping" : level <= 0.006 ? "silent" : "active";
  const state = channelStatus({ ...channel, level, signalState });
  const controlledMute = hostMuteControl ? channel.isHostForcedMuted === true : channel.isMuted;
  const muteTitle = !canEditMute
    ? channel.isHostForcedMuted ? "Micro coupé par le Host." : "Ce mute n’est pas pilotable à distance."
    : hostMuteControl
      ? controlledMute ? "Autoriser le micro à l’antenne" : "Couper le micro à l’antenne"
      : channel.isMuted ? "Rétablir le son" : "Couper le son";
  const cameraEnabled = participant?.isCameraEnabled === true;
  const cameraWasForcedOff = participant?.isHostForcedCameraOff === true;
  const cameraUnavailable = cameraControl === "host" && !cameraEnabled && !cameraWasForcedOff;
  const cameraTitle = cameraControl === "own"
    ? cameraEnabled ? "Couper ma caméra" : "Activer ma caméra"
    : cameraEnabled
      ? `Couper la caméra de ${channel.label}`
      : cameraWasForcedOff
        ? `Autoriser la caméra de ${channel.label}`
        : `Caméra de ${channel.label} déjà coupée`;
  const style = {
    "--channel-accent": channel.accent,
    "--gain-pct": `${Math.round(channel.gain * 100)}%`,
    "--meter-level": `${Math.round(level * 100)}%`,
  } as CSSProperties;

  return (
    <article className={`place-volume-row${isMaster ? " is-master" : ""}${channel.kind === "audio" ? " is-music-channel" : channel.kind === "master" ? " is-master-channel" : " is-voice-channel"} is-${signalState}${level >= 0.82 && signalState !== "clipping" ? " is-near-peak" : ""}${channel.isMuted ? " is-muted" : ""}`} style={style}>
      <SourceVisual channel={channel} participant={participant} room={room} musicCover={musicCover} />
      <div className="place-volume-row__identity">
        <strong title={channel.detail}>{channel.label}</strong>
        {channel.id.startsWith("viewer-") ? <small>{sourceStateLabel ?? (channel.id === "viewer-live-return" ? "Écoute locale" : channel.signalState === "disconnected" ? "Source indisponible" : channel.signalState === "connecting" ? "Reconnexion…" : channel.isMuted ? "Muet" : channel.id === "viewer-master" ? "Mix personnel" : "Dans le Master")}</small> : null}
      </div>
      <span className="place-volume-row__meter" role="img" aria-label={`${channel.label} : niveau ${Math.round(level * 100)} %${state ? ` · ${state}` : ""}`}><i /></span>
      <input
        className="place-volume-row__fader"
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={channel.gain}
        disabled={!canEditGain}
        onChange={(event) => onGain(channel.id, Number(event.currentTarget.value))}
        aria-label={`Volume de ${channel.label}`}
        aria-description={channel.id.startsWith("viewer-") ? channel.detail : undefined}
        aria-valuetext={formatGainDb(channel.gain)}
        title={canEditGain ? channel.detail ?? `Volume de ${channel.label}` : "Ce niveau n’est pas pilotable à distance avec le contrat serveur actuel."}
      />
      <output>{formatGainDb(channel.gain)}</output>
      <button
        type="button"
        className={`place-volume-row__mute${controlledMute ? " is-active" : ""}`}
        onClick={() => onMute(channel.id)}
        disabled={!canEditMute}
        aria-label={muteTitle}
        aria-pressed={controlledMute}
      >
        {channel.kind === "audio" || channel.kind === "master" ? (channel.isMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />) : controlledMute ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
        <span>{hostMuteControl ? (controlledMute ? "Autoriser" : "Couper") : channel.isHostForcedMuted ? "Bloqué" : channel.isMuted ? "Rétablir" : "Muet"}</span>
      </button>
      {onConfigure ? <button type="button" className="place-volume-row__playlist" onClick={onConfigure} aria-label={configureLabel ?? `Configurer ${channel.label}`} title={configureLabel ?? `Configurer ${channel.label}`}><Settings2 aria-hidden="true" /></button> : channel.kind === "audio" && onOpenPlaylist ? (
        <button type="button" className="place-volume-row__playlist" onClick={onOpenPlaylist} aria-label="Gérer la playlist" title="Playlist"><ListMusic aria-hidden="true" /></button>
      ) : channel.kind === "audio" && onTogglePlayback ? (
        <button type="button" className="place-volume-row__transport" onClick={onTogglePlayback} aria-label={isPlaying ? "Mettre la musique en pause" : "Lire la musique"} title={isPlaying ? "Pause" : "Lecture"}>{isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
      ) : isVocal && cameraControl !== "none" && participant ? (
        <button
          type="button"
          className={`place-volume-row__camera${cameraEnabled ? "" : " is-active"}`}
          onClick={() => onCamera(participant.profile.id, !cameraEnabled)}
          disabled={cameraUnavailable}
          aria-label={cameraTitle}
          aria-pressed={!cameraEnabled}
        >
          {cameraEnabled ? <Camera aria-hidden="true" /> : <CameraOff aria-hidden="true" />}
          <span>Caméra</span>
        </button>
      ) : <span className="place-volume-row__spacer" />}
    </article>
  );
}

function EffectCard({ title, enabled, value, visualValue = value, valueLabel, lowLabel, highLabel, sliderLabel, disabled, onToggle, onValue }: {
  title: string;
  enabled: boolean;
  value: number;
  visualValue?: number;
  valueLabel: string;
  lowLabel: string;
  highLabel: string;
  sliderLabel?: string;
  disabled: boolean;
  onToggle: () => void;
  onValue: (value: number) => void;
}) {
  const visualPercentage = Math.round(clampUnit(visualValue) * 10_000) / 100;
  return (
    <article className={`place-fx-card${enabled ? " is-active" : ""}${disabled ? " is-readonly" : ""}`} style={{ "--fx-value": `${visualPercentage}%` } as CSSProperties}>
      <header>
        <strong>{title}</strong>
        <output>{valueLabel}</output>
        <button type="button" className="place-fx-card__toggle" onClick={onToggle} disabled={disabled} aria-label={`${enabled ? "Désactiver" : "Activer"} ${title}`} aria-pressed={enabled}><span>{enabled ? "ON" : "OFF"}</span><i /></button>
      </header>
      <div className="place-fx-card__range">
        <input type="range" min="0" max="1" step="0.01" value={value} disabled={disabled || !enabled} onChange={(event) => onValue(Number(event.currentTarget.value))} aria-label={sliderLabel ?? `Intensité ${title}`} aria-valuetext={valueLabel} />
        <i aria-hidden="true" />
      </div>
      <div className="place-fx-card__scale"><span>{lowLabel}</span><span>{highLabel}</span></div>
    </article>
  );
}

function DetailRange({ label, value, visualValue = value, min, max, step, unit, lowLabel, highLabel, disabled, onChange }: {
  label: string;
  value: number;
  visualValue?: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  lowLabel: string;
  highLabel: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const percentage = (visualValue - min) / (max - min) * 100;
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    let nextValue: number | null = null;
    if (event.key === "Home") nextValue = min;
    else if (event.key === "End") nextValue = max;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextValue = visualValue - step;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextValue = visualValue + step;
    if (nextValue === null) return;
    event.preventDefault();
    onChange(Math.min(max, Math.max(min, nextValue)));
  };
  return (
    <label className="place-fx-detail-range" style={{ "--detail-value": `${percentage}%` } as CSSProperties}>
      <span><strong>{label}</strong><output>{value}{unit}</output></span>
      <span className="place-fx-detail-range__rail">
        <input type="range" min={min} max={max} step={step} value={visualValue} disabled={disabled} aria-label={label} aria-valuenow={value} aria-valuetext={`${value}${unit}`} onChange={(event) => onChange(Number(event.currentTarget.value))} onKeyDown={handleKeyDown} />
        <i aria-hidden="true" />
      </span>
      <span className="place-fx-detail-range__scale"><small>{lowLabel}</small><small>{highLabel}</small></span>
    </label>
  );
}

type AutotuneSelectorId = "key" | "scale" | "engine";

function AutotunePremiumSelect({
  id,
  label,
  value,
  options,
  optionLabels,
  open,
  disabled,
  onOpenChange,
  onChange,
}: {
  id: AutotuneSelectorId;
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  open: boolean;
  disabled: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (value: string) => void;
}) {
  const selectedIndex = Math.max(0, options.indexOf(value));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const wasOpenRef = useRef(false);
  const requestedActiveIndexRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxId = `place-autotune-${id}-listbox`;
  const activeOptionId = `${listboxId}-option-${activeIndex}`;

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setActiveIndex(requestedActiveIndexRef.current ?? selectedIndex);
      requestedActiveIndexRef.current = null;
    }
    if (!open) requestedActiveIndexRef.current = null;
    wasOpenRef.current = open;
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open) return;
    const activeOption = document.getElementById(activeOptionId);
    if (activeOption && "scrollIntoView" in activeOption) {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeOptionId, open]);

  const openAt = (index: number) => {
    const boundedIndex = Math.min(options.length - 1, Math.max(0, index));
    requestedActiveIndexRef.current = boundedIndex;
    setActiveIndex(boundedIndex);
    onOpenChange(true);
  };

  const close = () => onOpenChange(false);
  const commit = (index: number) => {
    if (disabled) return;
    const nextValue = options[index];
    if (nextValue !== undefined && nextValue !== value) onChange(nextValue);
    close();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "Tab") {
      if (open) close();
      return;
    }
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) commit(activeIndex);
      else openAt(selectedIndex);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const nextIndex = event.key === "Home" ? 0 : options.length - 1;
      if (open) setActiveIndex(nextIndex);
      else openAt(nextIndex);
      return;
    }
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
    if (direction === 0) return;
    event.preventDefault();
    if (!open) {
      openAt(selectedIndex);
      return;
    }
    setActiveIndex((current) => Math.min(options.length - 1, Math.max(0, current + direction)));
  };

  return (
    <div className={`place-autotune-select${open ? " is-open" : ""}`} data-selector={id}>
      <button
        ref={triggerRef}
        type="button"
        className="place-autotune-select__trigger"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={open ? activeOptionId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) close();
          else openAt(selectedIndex);
        }}
        onKeyDown={handleKeyDown}
      >
        <span>{label}</span>
        <strong>{optionLabels?.[value] ?? value}</strong>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="place-autotune-select__listbox" id={listboxId} role="listbox" aria-label={`Options ${label}`}>
          {options.map((option, index) => {
            const selected = option === value;
            const highlighted = index === activeIndex;
            return (
              <div
                key={option}
                id={`${listboxId}-option-${index}`}
                className={`${selected ? "is-selected" : ""}${highlighted ? " is-highlighted" : ""}`.trim()}
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
              >
                <span>{optionLabels?.[option] ?? option}</span>{selected ? <Check aria-hidden="true" /> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function CanonicalAutotuneControls({
  room,
  pitchProvider,
  engines,
  engineBusy,
  engineError,
  onEngineChange,
  humanizeSupported,
  editable,
  onTune,
  onVocal,
}: {
  room: PlaceRoomState;
  pitchProvider: PlacePitchProvider;
  engines: readonly { id: PlacePitchProvider; label: string }[];
  engineBusy: boolean;
  engineError: string | null;
  onEngineChange: (provider: PlacePitchProvider) => void;
  humanizeSupported: boolean;
  editable: boolean;
  onTune: (key: string, scale: PlaceMusicalScale) => void;
  onVocal: (patch: Partial<PlaceRoomState["personalVocal"]>) => void;
}) {
  const androidEngine = useRuntime().isDesktop && pitchProvider === "meewav_test";
  const providerSelected = pitchProvider !== "none";
  const enableSelectedProvider = providerSelected ? { tuneEnabled: true, enabled: true } : {};
  const [openSelector, setOpenSelector] = useState<AutotuneSelectorId | null>(null);
  const selectorsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openSelector) return;
    const dismiss = (event: PointerEvent) => {
      const activeSelect = selectorsRef.current?.querySelector(`[data-selector="${openSelector}"]`);
      if (!activeSelect?.contains(event.target as Node)) setOpenSelector(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [openSelector]);

  return (
    <section ref={selectorsRef} className="place-autotune-controls" data-provider={pitchProvider} aria-label="Réglages Autotune">
      <div className="place-autotune-controls__selectors">
        <AutotunePremiumSelect
          id="key"
          label="Tonalité"
          value={room.personalVocal.tuneKey}
          options={KEYS}
          open={openSelector === "key"}
          disabled={!editable}
          onOpenChange={(open) => setOpenSelector(open ? "key" : null)}
          onChange={(key) => onTune(key, room.personalVocal.tuneScale)}
        />
        <AutotunePremiumSelect
          id="scale"
          label="Gamme"
          value={room.personalVocal.tuneScale}
          options={androidEngine ? SCALES.slice(0, 3) : SCALES}
          open={openSelector === "scale"}
          disabled={!editable}
          onOpenChange={(open) => setOpenSelector(open ? "scale" : null)}
          onChange={(scale) => onTune(room.personalVocal.tuneKey, scale as PlaceMusicalScale)}
        />
      </div>
      <div className="place-autotune-controls__ranges">
        <DetailRange
          label="Vitesse de correction"
          value={Math.round(room.personalVocal.tuneSpeed * 100)}
          visualValue={toVisualPosition(room.personalVocal.tuneSpeed, 0.86, 0.8225) * 100}
          min={0}
          max={100}
          step={1}
          unit=" %"
          lowLabel="Naturel"
          highLabel="Rapide"
          disabled={!editable || androidEngine}
          onChange={(value) => onVocal({ tuneSpeed: fromVisualPosition(value / 100, 0.86, 0.8225), ...enableSelectedProvider })}
        />
        <DetailRange
          label="Humanisation"
          value={Math.round(room.personalVocal.tuneHumanize * 100)}
          visualValue={toVisualPosition(room.personalVocal.tuneHumanize, 0.22, 0.2623) * 100}
          min={0}
          max={100}
          step={1}
          unit=" %"
          lowLabel="Précis"
          highLabel="Humain"
          disabled={!editable || !humanizeSupported || androidEngine}
          onChange={(value) => {
            const mapped = fromVisualPosition(value / 100, 0.22, 0.2623);
            onVocal({ tuneSmooth: mapped, tuneHumanize: mapped, ...enableSelectedProvider });
          }}
        />
      </div>
      {androidEngine ? <p>Le mode Simple reprend la correction fixe Android. Clé, gamme et réverb restent réglables.</p> : null}
      {providerSelected && !humanizeSupported ? <p>Humanisation reste visible pour conserver la même interface, mais ce plugin ne publie pas de paramètre compatible.</p> : null}
      <div className="place-autotune-controls__engine" aria-busy={engineBusy} title={engineError ?? "Vos réglages sont conservés quand vous changez de moteur."}>
        <AutotunePremiumSelect
          id="engine"
          label="Moteur Autotune"
          value={pitchProvider}
          options={engines.map((engine) => engine.id)}
          optionLabels={{ none: "Choisir un moteur", ...Object.fromEntries(engines.map((engine) => [engine.id, engine.label])) }}
          open={openSelector === "engine"}
          disabled={engineBusy || !editable}
          onOpenChange={(open) => setOpenSelector(open ? "engine" : null)}
          onChange={(provider) => onEngineChange(provider as PlacePitchProvider)}
        />
        {engineError ? <span className="place-autotune-controls__engine-error" role="alert">{engineError}</span> : null}
      </div>
      <button
        type="button"
        className="place-autotune-controls__dry"
        disabled={!editable}
        onClick={() => onVocal({ enabled: false, tuneEnabled: false, reverbEnabled: false, delayEnabled: false, eqEnabled: false, compEnabled: false })}
      >
        <Volume2 aria-hidden="true" /><span>Son sec</span>
      </button>
    </section>
  );
}

export default function PlaceMixer({
  room,
  mode,
  currentUserId,
  view,
  onView,
  onGain,
  onMute,
  onCamera,
  onVocal,
  onTune,
  pitchProvider,
  pitchCorrection,
  localAudioStatus,
  localAudioError,
  pluginInventory,
  pluginsRefreshing,
  nativePluginStatus,
  nativePluginAudioReady,
  nativePluginError,
  onPitchProvider,
  onRefreshPlugins,
  onRemoveNativePlugin,
  onToggleMonitoring,
  onAudioPreview = async () => true,
  onAudioPreviewMetadata = async () => true,
  onAudioRoute = async () => true,
  onAudioPlaybackState = async () => true,
  programAudio,
  hostVoiceMeterStream,
  toolsVisible,
}: PlaceMixerProps) {
  const roomPresentation = useRoomPresentation();
  const toolsLayout = useStudioToolsLayout();
  const showRoomTools = toolsVisible ?? toolsLayout?.toolsVisible ?? false;
  const classroomPlayerCollapsible = roomPresentation.id === "classe" || roomPresentation.id === "loge";
  const [classroomPlayerCollapsed, setClassroomPlayerCollapsed] = useState(false);
  const desktopFx = useRuntime().isDesktop;
  const [fxPro, setFxPro] = useState(false);
  const [simpleSelector, setSimpleSelector] = useState<AutotuneSelectorId | null>(null);
  const [openFxSection, setOpenFxSection] = useState<FxAccordionId | null>(null);
  const [autotuneStartError, setAutotuneStartError] = useState<string | null>(null);
  const [autotunePending, setAutotunePending] = useState(false);
  const [providerSelectionPending, setProviderSelectionPending] = useState(false);
  const [musicCover, setMusicCover] = useState(() => randomMixerCover());
  const musicCoverScopeRef = useRef(`${room.id}|${programAudio?.musicGeneration ?? ""}`);
  const autotunePendingRef = useRef(false);
  const autotuneRequestRef = useRef(0);
  const providerSelectionPendingRef = useRef(false);
  const providerSelectionRequestRef = useRef(0);
  const previousPitchProviderRef = useRef(pitchProvider);
  const openDawRoomEnabled = isVoiceCorrectionRoomEntryEnabled();
  const testPitchSelected = pitchProvider === "meewav_test";
  const openDawSelected = pitchProvider === "opendaw";
  const nativePitchSelected = isNativePitchProvider(pitchProvider);
  const activeNativePluginId: PlaceNativePitchProvider | null = nativePitchSelected && nativePluginAudioReady ? pitchProvider : null;
  const webPitchSelected = testPitchSelected || openDawSelected;
  const correctionSelected = webPitchSelected || nativePitchSelected;
  const humanizeSupported = !nativePitchSelected || pitchProvider === "antares.autotune";
  const browserOnlyFxDisabled = nativePitchSelected;
  const localAudioStarting = localAudioStatus === "requesting_permission";
  const localAudioStarted = localAudioStatus !== "idle" && !localAudioStarting;
  const correctionFallback = webPitchSelected && localAudioStarted && !pitchCorrection.available;
  const correctionActive = nativePitchSelected ? nativePluginAudioReady : pitchCorrection.active;
  const engineSelectionBusy = nativePluginStatus === "starting"
    || nativePluginStatus === "stopping"
    || localAudioStarting
    || autotunePending
    || providerSelectionPending;
  const correctionRuntimeLabel = !correctionSelected
    ? "Aucun moteur"
    : nativePitchSelected
      ? nativePluginStatus === "starting"
        ? "Ouverture du plugin…"
        : nativePluginStatus === "error"
          ? "Plugin en erreur"
          : nativePluginAudioReady && nativePluginStatus === "running"
            ? "Plugin actif"
            : "Plugin arrêté"
    : localAudioStarting
      ? "Démarrage…"
      : !localAudioStarted
        ? "Prêt à tester"
        : correctionActive
          ? "Traitement actif"
          : correctionFallback
            ? "Son original"
            : "Bypass";
  const correctionOperational = nativePitchSelected
    ? nativePluginAudioReady && nativePluginStatus === "running"
    : webPitchSelected
      ? pitchCorrection.available
      : false;
  const autotuneEnabled = correctionSelected
    && correctionOperational
    && correctionActive
    && room.personalVocal.tuneEnabled;
  const autotuneRuntimeLabel = autotuneStartError
    ?? (autotunePending ? "Ouverture…" : correctionSelected ? correctionRuntimeLabel : "Prêt à tester");

  useEffect(() => {
    if (previousPitchProviderRef.current === pitchProvider) return;
    previousPitchProviderRef.current = pitchProvider;
    autotuneRequestRef.current += 1;
    autotunePendingRef.current = false;
    setAutotunePending(false);
    setAutotuneStartError(null);
  }, [pitchProvider]);

  useEffect(() => {
    autotuneRequestRef.current += 1;
    autotunePendingRef.current = false;
    providerSelectionRequestRef.current += 1;
    providerSelectionPendingRef.current = false;
    setAutotunePending(false);
    setProviderSelectionPending(false);
    setAutotuneStartError(null);
  }, [room.id]);

  useEffect(() => {
    const nextScope = `${room.id}|${programAudio?.musicGeneration ?? ""}`;
    if (musicCoverScopeRef.current === nextScope) return;
    musicCoverScopeRef.current = nextScope;
    setMusicCover((current) => randomMixerCover(current));
  }, [programAudio?.musicGeneration, room.id]);

  useEffect(() => () => {
    autotuneRequestRef.current += 1;
    autotunePendingRef.current = false;
    providerSelectionRequestRef.current += 1;
    providerSelectionPendingRef.current = false;
  }, []);

  const requestPitchProvider = async (provider: PlacePitchProvider) => {
    if (providerSelectionPendingRef.current) return false;
    const requestId = ++providerSelectionRequestRef.current;
    providerSelectionPendingRef.current = true;
    setProviderSelectionPending(true);
    try {
      return await onPitchProvider(provider);
    } finally {
      if (requestId === providerSelectionRequestRef.current) {
        providerSelectionPendingRef.current = false;
        setProviderSelectionPending(false);
      }
    }
  };

  const toggleAutotune = async () => {
    if (autotunePendingRef.current) return;
    const next = !autotuneEnabled;
    setAutotuneStartError(null);
    if (!next) {
      onVocal({
        tuneEnabled: false,
        enabled: room.personalVocal.reverbEnabled
          || room.personalVocal.compEnabled
          || room.personalVocal.delayEnabled
          || room.personalVocal.eqEnabled,
      });
      return;
    }

    const correctionNeedsRestart = !correctionOperational
      || (webPitchSelected && room.personalVocal.tuneEnabled && !correctionActive);
    if (correctionNeedsRestart) {
      const requestId = ++autotuneRequestRef.current;
      const providerToStart = correctionSelected ? pitchProvider : "meewav_test";
      autotunePendingRef.current = true;
      setAutotunePending(true);
      try {
        const started = await requestPitchProvider(providerToStart);
        if (requestId !== autotuneRequestRef.current) return;
        if (!started) {
          setAutotuneStartError("Moteur indisponible");
          return;
        }
        onVocal({ tuneEnabled: true, enabled: true });
      } catch {
        if (requestId === autotuneRequestRef.current) setAutotuneStartError("Moteur indisponible");
      } finally {
        if (requestId === autotuneRequestRef.current) {
          autotunePendingRef.current = false;
          setAutotunePending(false);
        }
      }
      return;
    }

    onVocal({ tuneEnabled: true, enabled: true });
  };
  const [previewMusicLevel, setPreviewMusicLevel] = useState(0);
  const listening = useWaveViewerListening();
  const personalMix = useViewerMixer();
  const personalMode = mode !== "host" && Boolean(personalMix);
  const returnChannel: PlaceMixerChannel = { id:"viewer-live-return", label:"Retour du live", detail:"Règle le volume de la Room dans votre écoute.", kind:"master", gain:listening?.returnVolume ?? 1, level:room.source === "demo" ? (room.channels.find(channel => channel.kind === "master")?.level ?? 0) * (listening?.returnVolume ?? 1) : 0, isMuted:listening?.returnMuted ?? false, isSolo:false, signalState:"silent", accent:"#a9b6c8" };
  const viewerChannels: PlaceMixerChannel[] = ([
    ["voice", "Ma voix", "Règle votre voix dans votre mix envoyé.", "guest"],
    ["music", "Musique", "Règle votre source musicale dans votre mix.", "audio"],
    ...(personalMix?.systemAvailable ? [["system", "Son du PC", "Règle le son capturé depuis un autre onglet.", "audio"]] : []),
    ["master", "Master", "Règle le niveau général de votre mix envoyé au host.", "master"],
  ] as const).map(([key, label, detail, kind]) => {
    const id = key as ViewerFader;
    const settings = personalMix?.levels[id] ?? { gain: id === "master" ? 1 : .75, muted: false };
    const level = Math.max(personalMix?.meters[id] ?? 0, id === "music" ? previewMusicLevel : 0);
    const available = id === "music" && previewMusicLevel > 0 || (id === "master" ? Boolean(personalMix?.outputTrack) : personalMix?.engine.inputState(id as ViewerInput) === "active");
    return { id: `viewer-${id}`, participantId: currentUserId ?? undefined, label, detail, kind: kind as PlaceMixerChannel["kind"], gain: settings.gain, level,
      isMuted: settings.muted, isSolo: false, signalState: settings.muted ? "muted" : !available ? "disconnected" : level >= 1 ? "clipping" : level > .001 ? "active" : "silent", accent: "#b48cff" };
  });
  const ownMix = personalMode || mode === "viewer";
  const changeGain = ownMix ? (id: string, gain: number) => personalMix?.setGain(id.replace("viewer-", "") as ViewerFader, gain) : onGain;
  const changeMute = ownMix ? (id: string) => personalMix?.toggleMute(id.replace("viewer-", "") as ViewerFader) : onMute;
  const orderedSources = useMemo(() => {
    if (ownMix) return viewerChannels.filter(channel => channel.kind !== "master");
    const host = room.channels.filter((channel) => channel.kind === "microphone");
    const availableGuests = [...room.participants, ...room.queue]
      .filter((participant, index, all) => all.findIndex((item) => item.profile.id === participant.profile.id) === index)
      .filter((participant) => participant.status === "onstage")
      .sort((left, right) => new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime());
    const allGuestChannels = room.channels.filter((channel) => channel.kind === "guest");
    const guests = availableGuests.flatMap((participant) => allGuestChannels.filter((channel) => channel.participantId === participant.id || channel.participantId === participant.profile.id));
    const music = room.channels.filter((channel) => channel.kind === "audio");
    const hostSources = [...host, ...guests, ...music];
    if (mode !== "guest") return hostSources;
    const ownVoice = allGuestChannels.filter((channel) => channel.participantId === currentUserId);
    const ownMusic = music.filter((channel) => channel.participantId === currentUserId);
    return [...ownVoice, ...ownMusic];
  }, [currentUserId, mode, room.channels, room.participants, room.queue, viewerChannels, ownMix]);
  const master = ownMix ? viewerChannels.find(channel => channel.kind === "master") : mode !== "guest" ? room.channels.find((channel) => channel.kind === "master") : undefined;
  const ownVocalSources = orderedSources.filter((channel) => (
    mode === "host"
      ? channel.kind === "microphone"
      : channel.kind === "guest" && channel.participantId === currentUserId
  ));
  const selectedChannel = ownVocalSources[0];
  const selectedParticipant = selectedChannel ? participantFor(room, selectedChannel) : undefined;
  const fxEditable = Boolean(selectedChannel);
  const activeView: PlaceMixerView = (mode === "guest" && (view === "twists" || view === "time") || mode === "viewer" && view === "time") ? "volumes" : view;
  const usableNativePlugins = useMemo(() => pluginInventory
    .filter((plugin): plugin is AudioEnginePlugin & { id: PlaceNativePitchProvider } => (
      isNativePitchProvider(plugin.id as PlacePitchProvider) && isDetectedNativePlugin(plugin)
    ))
    .sort((left, right) => NATIVE_ENGINE_ORDER[left.id] - NATIVE_ENGINE_ORDER[right.id]), [pluginInventory]);
  const autotuneEngines: { id: PlacePitchProvider; label: string }[] = [
    { id: "meewav_test", label: "Autotune MeeWav" },
    ...(openDawRoomEnabled ? [{ id: "opendaw" as const, label: "Autotune openDAW" }] : []),
    ...usableNativePlugins.map((plugin) => ({ id: plugin.id, label: plugin.name })),
  ];
  const activeVoiceEffectCount = [
    room.personalVocal.reverbEnabled,
    room.personalVocal.delayEnabled,
    room.personalVocal.compEnabled,
    room.personalVocal.eqEnabled,
  ].filter(Boolean).length;

  const permissionsFor = (channel: PlaceMixerChannel) => {
    if (ownMix) return { canEditGain: true, canEditMute: true };
    if (room.source === "demo") {
      if (mode === "guest") {
        const ownsChannel = channel.participantId === currentUserId;
        return { canEditGain: ownsChannel, canEditMute: ownsChannel && !channel.isHostForcedMuted };
      }
      if (channel.kind === "master") return { canEditGain: true, canEditMute: true };
      if (channel.kind === "audio") {
        const isHostMusic = channel.participantId === room.host.id;
        return { canEditGain: true, canEditMute: isHostMusic };
      }
      return {
        canEditGain: mode === "host",
        canEditMute: mode === "host",
      };
    }
    if (mode === "guest" && channel.participantId === currentUserId) return { canEditGain: true, canEditMute: !channel.isHostForcedMuted };
    // The Host owns their input gain just like a Guest owns theirs. Remote
    // Guest rows remain the distinct public-regie stage.
    if (mode === "host" && channel.kind === "microphone") return { canEditGain: true, canEditMute: true };
    if (mode === "host" && channel.kind === "audio") {
      return { canEditGain: true, canEditMute: true };
    }
    if (mode === "host" && channel.kind === "guest") return { canEditGain: true, canEditMute: true };
    return { canEditGain: false, canEditMute: false };
  };

  const toggleFxSection = (section: FxAccordionId) => {
    setOpenFxSection((current) => current === section ? null : section);
  };

  return (
    <div className={`place-mixer${mode !== "guest" || personalMode ? " has-audio-player" : ""}${personalMode ? " is-personal-mix" : ""}${showRoomTools ? " is-wave-tools" : ""}${classroomPlayerCollapsible ? " has-classroom-player" : ""}${classroomPlayerCollapsed ? " is-classroom-player-collapsed" : ""}`} aria-label={`Régie audio de ${roomPresentation.label}`}>
      {toolsLayout ? <><div className="wave-tools-nav" ref={toolsLayout.setNav} hidden={!showRoomTools} /><div className="wave-tools-body" ref={toolsLayout.setBody} hidden={!showRoomTools} /></> : null}
      <nav className={`place-mixer__subnav${mode !== "guest" ? " has-twists" : ""}`} aria-label="Sections du mixeur">
        <button type="button" className={activeView === "volumes" ? "is-active" : ""} onClick={() => onView("volumes")}><SlidersHorizontal aria-hidden="true" /> Volumes</button>
        <button type="button" className={activeView === "voice_fx" ? "is-active" : ""} onClick={() => onView("voice_fx")} disabled={mode !== "viewer" && ownVocalSources.length === 0}><AudioWaveform aria-hidden="true" /> FX voix</button>
        {mode !== "guest" ? <button type="button" className={activeView === "twists" ? "is-active" : ""} onClick={() => onView("twists")}><Grid3X3 aria-hidden="true" /> Pads</button> : null}
        {mode === "host" ? <button type="button" className={activeView === "time" ? "is-active" : ""} onClick={() => onView("time")}><Timer aria-hidden="true" /> Time</button> : null}
      </nav>

      {mode !== "guest" || personalMode ? (
        <PlaceMixerAudioPlayer
          key={room.id}
          roomId={room.id}
          ownerId={currentUserId ?? room.host.id ?? null}
          queueParticipants={room.queue}
          musicGain={personalMode ? 1 : orderedSources.find((channel) => channel.kind === "audio")?.gain ?? 0.75}
          masterGain={personalMode ? 1 : master?.gain ?? 1}
          publicMusicMuted={!personalMode && ((orderedSources.find((channel) => channel.kind === "audio")?.isMuted ?? false) || (master?.isMuted ?? false))}
          onPreviewPrepare={personalMode ? async () => true : onAudioPreview}
          onPreviewMetadata={personalMode ? async () => true : onAudioPreviewMetadata}
          onRouteChange={personalMode ? async () => true : onAudioRoute}
          onPlaybackStateChange={personalMode ? async () => true : onAudioPlaybackState}
          programAudio={personalMode ? personalMix!.musicTransport : programAudio}
          personalSend={personalMode}
          onPreviewLevel={personalMode ? setPreviewMusicLevel : undefined}
          classroomCollapsible={classroomPlayerCollapsible}
          roomLabel={roomPresentation.label}
          onClassroomCollapsedChange={setClassroomPlayerCollapsed}
        />
      ) : null}

      {mode !== "guest" ? <PlaceTwists key={`pads-${room.id}`} active={activeView === "twists"} /> : null}

      {activeView === "volumes" ? (
        <section className="place-volume-view">
          <div className="place-volume-list">
            {personalMode ? <small className="viewer-mix-section">ÉCOUTE PERSONNELLE</small> : null}
            {mode !== "host" && listening ? <VolumeRow channel={returnChannel} room={room} onGain={(_id,gain) => listening.setReturnVolume(gain)} onMute={() => listening.setReturnMuted(!listening.returnMuted)} onCamera={onCamera} canEditGain canEditMute cameraControl="none" /> : null}
            {personalMode ? <small className="viewer-mix-section">MES SOURCES</small> : null}
            {personalMix?.error ? <p className="viewer-mix-error" role="alert">{personalMix.error}</p> : null}
            {orderedSources.map((channel) => {
              const permissions = permissionsFor(channel);
              const participant = participantFor(room, channel);
              const ownsCamera = Boolean(participant && (
                participant.id === currentUserId
                || participant.profile.id === currentUserId
                || (mode === "host" && channel.kind === "microphone")
              ));
              const cameraControl = !participant || (channel.kind !== "microphone" && channel.kind !== "guest")
                ? "none"
                : ownsCamera
                  ? "own"
                  : mode === "host"
                    ? "host"
                    : "none";
              const stateLabel = personalMode && channel.id === "viewer-music" && previewMusicLevel > 0 ? "Préécoute locale" : personalMode && channel.id === "viewer-system" ? personalMix!.systemState === "permission-denied" ? "Autorisation refusée" : personalMix!.systemState === "reconnecting" ? "Sélection de source…" : personalMix!.engine.inputState("system") === "disconnected" || personalMix!.systemState === "disconnected" ? "Déconnecté" : undefined : personalMode && channel.id === "viewer-voice" && personalMix!.voiceStatus === "requesting_permission" ? "Autorisation micro…" : undefined;
              return <VolumeRow key={channel.id} sourceStateLabel={stateLabel} onConfigure={personalMode && channel.id === "viewer-voice" ? () => void personalMix!.prepareVoice().catch(() => undefined) : personalMode && channel.id === "viewer-system" ? personalMix!.systemState === "active" ? personalMix!.stopSystem : () => void personalMix!.configureSystem() : undefined} configureLabel={channel.id === "viewer-system" && personalMix?.systemState === "active" ? "Arrêter la capture du son du PC" : `Configurer ${channel.label}`} channel={channel} room={room} onGain={changeGain} onMute={changeMute} onCamera={onCamera} canEditGain={permissions.canEditGain} canEditMute={permissions.canEditMute} hostMuteControl={mode === "host" && channel.kind === "guest"} meterSuppressed={master?.isMuted === true} meterStream={mode === "host" && channel.kind === "microphone" ? hostVoiceMeterStream : null} cameraControl={cameraControl} musicCover={channel.kind === "audio" && channel.id !== "viewer-system" ? musicCover : undefined} onOpenPlaylist={channel.kind === "audio" && channel.id !== "viewer-system" ? () => window.dispatchEvent(new CustomEvent("meewav:mixer-playlist-open", { detail: { roomId: room.id } })) : undefined} />;
            })}
          </div>
          {master ? <div className="place-master-dock" data-sending={personalMix ? ["En scène", "Avec le host"].includes(personalMix.publication) && !personalMix.levels.master.muted : undefined}><span className="place-master-dock__label">{ownMix ? "ENVOI VERS LE HOST" : "SORTIE PUBLIQUE"} <em><i aria-hidden="true" />{ownMix ? personalMix?.publication ?? "Préparation locale" : "ACTIVE"}</em></span>{personalMix && personalMix.meters.master >= 1 ? <p className="viewer-mix-error" role="status">Master trop fort</p> : null}<VolumeRow channel={master} room={room} isMaster onGain={changeGain} onMute={changeMute} onCamera={onCamera} canEditGain={ownMix || room.source === "demo"} canEditMute cameraControl="none" /></div> : null}
        </section>
      ) : activeView === "twists" ? null : activeView === "time" ? (
        <PlaceTime />
      ) : (
        <section className={`place-fx-view is-accordion${desktopFx ? " is-android-fx" : ""}`}>
          {desktopFx ? <>
            <div className="android-fx-toolbar">
              <div role="group" aria-label="Mode des effets voix">
                <button type="button" aria-pressed={!fxPro} onClick={() => setFxPro(false)}>Simple</button>
                <button type="button" aria-pressed={fxPro} onClick={() => setFxPro(true)}>Pro</button>
              </div>
              <button type="button" className="android-fx-monitor" aria-label="Retour des effets au casque" aria-pressed={room.personalVocal.monitoring} disabled={engineSelectionBusy} onClick={onToggleMonitoring}><Headphones aria-hidden="true" /></button>
            </div>
            {!fxPro ? <div className="android-fx-cards">
              <section className="android-fx-card" aria-label="Autotune simple" data-active={autotuneEnabled}>
                <header><AudioWaveform aria-hidden="true" /><strong>Autotune</strong><button type="button" aria-label="Activer ou bypasser l’Autotune" aria-pressed={autotuneEnabled} aria-busy={autotunePending} disabled={!fxEditable || engineSelectionBusy} onClick={() => void toggleAutotune()}><Power aria-hidden="true" /></button></header>
                <div className="android-fx-selectors">
                  <AutotunePremiumSelect id="key" label="Clé" value={room.personalVocal.tuneKey} options={KEYS} open={simpleSelector === "key"} disabled={!fxEditable} onOpenChange={(open) => setSimpleSelector(open ? "key" : null)} onChange={(key) => onTune(key, room.personalVocal.tuneScale)} />
                  <AutotunePremiumSelect id="scale" label="Gamme" value={room.personalVocal.tuneScale} options={SCALES.slice(0, 3)} open={simpleSelector === "scale"} disabled={!fxEditable} onOpenChange={(open) => setSimpleSelector(open ? "scale" : null)} onChange={(scale) => onTune(room.personalVocal.tuneKey, scale as PlaceMusicalScale)} />
                </div>
                {autotuneStartError || correctionFallback ? <small role="alert">{autotuneStartError || localAudioError || pitchCorrection.reason}</small> : null}
              </section>
              <section className="android-fx-card" aria-label="Réverbération simple" data-active={room.personalVocal.reverbEnabled}>
                <header><AudioLines aria-hidden="true" /><strong>Réverb</strong><button type="button" aria-label={room.personalVocal.reverbEnabled ? "Désactiver Réverb" : "Activer Réverb"} aria-pressed={room.personalVocal.reverbEnabled} disabled={!fxEditable} onClick={() => { const next = !room.personalVocal.reverbEnabled; onVocal({ reverbEnabled: next, enabled: next || room.personalVocal.tuneEnabled || room.personalVocal.compEnabled || room.personalVocal.delayEnabled || room.personalVocal.eqEnabled }); }}><Power aria-hidden="true" /></button></header>
                <div className="android-fx-range-label"><span>Douce</span><output>{Math.round(room.personalVocal.reverbAmount * 100)} %</output><span>Large</span></div>
                <input className="android-fx-range" type="range" min="0" max="1" step="0.01" aria-label="Mix réverb" aria-valuetext={`${Math.round(room.personalVocal.reverbAmount * 100)} %`} value={room.personalVocal.reverbAmount} disabled={!fxEditable || !room.personalVocal.reverbEnabled} onChange={(event) => onVocal({ reverbAmount: Number(event.currentTarget.value), reverbEnabled: true, enabled: true })} />
              </section>
            </div> : null}
          </> : null}
          <div className="place-fx-accordion-stack" hidden={desktopFx && !fxPro}>
            <FxAccordion
              id="effects"
              title="Effets voix"
              description="Réverb, délai, compression et EQ"
              status={`${activeVoiceEffectCount} actif${activeVoiceEffectCount > 1 ? "s" : ""}`}
              icon={<AudioLines />}
              open={openFxSection === "effects"}
              onToggle={() => toggleFxSection("effects")}
            >
              <div className="place-fx-effect-list" role="group" aria-label="Réglages des effets voix">
                <EffectCard title="Réverb" enabled={fxEditable && room.personalVocal.reverbEnabled} value={fxEditable ? toVisualPosition(room.personalVocal.reverbAmount, 0.18, 0.25) : 0} valueLabel={fxEditable ? `${Math.round(room.personalVocal.reverbAmount * 100)} %` : "Indisponible"} lowLabel="Sec" highLabel="Ambiant" sliderLabel="Mix réverb" disabled={!fxEditable} onToggle={() => {
                  const next = !room.personalVocal.reverbEnabled;
                  onVocal({ reverbEnabled: next, enabled: room.personalVocal.tuneEnabled || next || room.personalVocal.compEnabled || room.personalVocal.delayEnabled || room.personalVocal.eqEnabled });
                }} onValue={(value) => onVocal({ reverbAmount: fromVisualPosition(value, 0.18, 0.25), reverbEnabled: true, enabled: true })} />
                <EffectCard title="Délai" enabled={!browserOnlyFxDisabled && fxEditable && room.personalVocal.delayEnabled} value={toVisualPosition(clampUnit((room.personalVocal.delayTimeMs - 100) / 900), 20 / 900, 0.027)} valueLabel={browserOnlyFxDisabled ? "Moteur Web requis" : fxEditable ? `${Math.round(room.personalVocal.delayTimeMs)} ms` : "Indisponible"} lowLabel="Court" highLabel="Long" sliderLabel="Durée du délai" disabled={!fxEditable || browserOnlyFxDisabled} onToggle={() => {
                  const next = !room.personalVocal.delayEnabled;
                  onVocal({ delayEnabled: next, enabled: room.personalVocal.tuneEnabled || room.personalVocal.reverbEnabled || room.personalVocal.compEnabled || next || room.personalVocal.eqEnabled });
                }} onValue={(value) => onVocal({ delayTimeMs: Math.round(100 + fromVisualPosition(value, 20 / 900, 0.027) * 900), delayEnabled: true, enabled: true })} />
                <EffectCard title="Compression" enabled={!browserOnlyFxDisabled && fxEditable && room.personalVocal.compEnabled} value={!browserOnlyFxDisabled && fxEditable ? toVisualPosition(room.personalVocal.compAmount, 0.62, 0.567) : 0} valueLabel={browserOnlyFxDisabled ? "Moteur Web requis" : fxEditable ? `${Math.round(room.personalVocal.compAmount * 100)} %` : "Indisponible"} lowLabel="Doux" highLabel="Fort" disabled={!fxEditable || browserOnlyFxDisabled} onToggle={() => {
                  const next = !room.personalVocal.compEnabled;
                  onVocal({ compEnabled: next, enabled: room.personalVocal.tuneEnabled || room.personalVocal.reverbEnabled || room.personalVocal.delayEnabled || room.personalVocal.eqEnabled || next });
                }} onValue={(value) => onVocal({ compAmount: fromVisualPosition(value, 0.62, 0.567), compEnabled: true, enabled: true })} />
                <EffectCard title="EQ" enabled={!browserOnlyFxDisabled && fxEditable && room.personalVocal.eqEnabled} value={toVisualPosition(clampUnit((EQ_GAIN_BY_PRESET[room.personalVocal.preset] + 12) / 27), 15 / 27, 0.558)} valueLabel={browserOnlyFxDisabled ? "Moteur Web requis" : fxEditable ? `${EQ_GAIN_BY_PRESET[room.personalVocal.preset] >= 0 ? "+" : ""}${EQ_GAIN_BY_PRESET[room.personalVocal.preset]} dB` : "Indisponible"} lowLabel="Grave" highLabel="Clair" disabled={!fxEditable || browserOnlyFxDisabled} onToggle={() => {
                  const next = !room.personalVocal.eqEnabled;
                  onVocal({ eqEnabled: next, enabled: room.personalVocal.tuneEnabled || room.personalVocal.reverbEnabled || room.personalVocal.compEnabled || room.personalVocal.delayEnabled || next });
                }} onValue={(value) => onVocal({ preset: nearestEqPreset(fromVisualPosition(value, 15 / 27, 0.558)), eqEnabled: true, enabled: true })} />
              </div>
            </FxAccordion>

            <FxAccordion
              id="autotune"
              title="Autotune"
              description="Tonalité, gamme, vitesse et humanisation"
              status={openFxSection === "autotune" ? autotuneRuntimeLabel : autotuneEnabled ? "Actif" : "Inactif"}
              statusLive
              icon={<AutotuneSparkleIcon />}
              open={openFxSection === "autotune"}
              onToggle={() => toggleFxSection("autotune")}
              headerAction={(
                <button
                  type="button"
                  className={`place-autotune-toggle${autotuneEnabled ? " is-active" : ""}`}
                  hidden={openFxSection !== "autotune"}
                  tabIndex={openFxSection === "autotune" ? undefined : -1}
                  aria-label="Activer ou bypasser l’Autotune"
                  aria-pressed={autotuneEnabled}
                  aria-describedby="place-fx-accordion-autotune-status"
                  aria-busy={autotunePending}
                  disabled={openFxSection !== "autotune" || !fxEditable || engineSelectionBusy}
                  onClick={() => void toggleAutotune()}
                >
                  {autotuneEnabled ? "ON" : "OFF"}
                </button>
              )}
            >
              <CanonicalAutotuneControls
                room={room}
                pitchProvider={pitchProvider}
                engines={autotuneEngines}
                engineBusy={engineSelectionBusy}
                engineError={nativePluginError ?? (correctionFallback ? localAudioError ?? pitchCorrection.reason ?? "Son original restauré." : null)}
                onEngineChange={(provider) => { void requestPitchProvider(provider); }}
                humanizeSupported={humanizeSupported}
                editable={fxEditable}
                onTune={onTune}
                onVocal={onVocal}
              />
            </FxAccordion>


            <FxAccordion
              id="plugins"
              title="Plugins du PC"
              description="Connectez vos plugins audio à MeeWav"
              status={`${usableNativePlugins.length} détecté${usableNativePlugins.length > 1 ? "s" : ""}`}
              icon={openFxSection === "plugins" ? <PluginPlugGlyph /> : <PluginPuzzleGlyph />}
              open={openFxSection === "plugins"}
              onToggle={() => toggleFxSection("plugins")}
            >
              <PlacePluginManager
                plugins={pluginInventory}
                activePluginId={activeNativePluginId}
                refreshing={pluginsRefreshing}
                disabled={engineSelectionBusy}
                onUse={(pluginId) => { void requestPitchProvider(pluginId); }}
                onRemoveFromChain={onRemoveNativePlugin}
                onRefresh={onRefreshPlugins}
              />
            </FxAccordion>

            <header className="place-fx-view__voice is-compact">
              {selectedParticipant ? <img src={selectedParticipant.profile.avatarUrl} alt="" /> : <span><Mic aria-hidden="true" /></span>}
              <div><small>RETOUR CASQUE</small><strong>{selectedParticipant?.profile.displayName || room.currentUserProfile?.displayName || room.host.displayName}</strong></div>
              <MeewavTooltip content="Ta voix reste audible : ce bouton ajoute uniquement les effets.">
                <button type="button" className={room.personalVocal.monitoring ? "is-active" : ""} onClick={onToggleMonitoring} aria-label="Activer les effets dans mon casque" aria-pressed={room.personalVocal.monitoring} aria-busy={engineSelectionBusy || undefined} disabled={engineSelectionBusy}>
                  <span className="place-fx-view__monitor-label"><Headphones aria-hidden="true" /><span>Mes effets</span></span>
                  <span className="place-fx-view__monitor-switch" aria-hidden="true"><b>{room.personalVocal.monitoring ? "ON" : "OFF"}</b><i /></span>
                </button>
              </MeewavTooltip>
            </header>
          </div>
        </section>
      )}
    </div>
  );
}
