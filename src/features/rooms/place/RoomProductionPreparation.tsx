import MeewavSelect from "../../../components/shared/MeewavSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Camera, Grip, Headphones, Mic, Monitor, Plus, Radio, SlidersHorizontal, Square, Video, X } from 'lucide-react';
import { useRuntime, type CaptureSource } from '../../../runtime/RuntimeProvider';
import { DesktopMediaDevices } from '../../../runtime/DesktopMediaDevices';
import { DesktopMusicSource } from '../../../runtime/DesktopMusicSource';
import { RoomVideoProgram, type VideoLayout, type VideoPosition } from '../../../runtime/RoomVideoProgram';
import { readRoomDevicePreferences, saveRoomDevicePreferences } from './roomDevicePreferences';
import type { RoomProductionSetup } from './roomProductionSetup';
import { sceneFrames, selectSceneSource, type VideoScene } from '../../../runtime/videoScene';
import { VideoPreviewEditor, VideoSceneControls } from './VideoSceneEditor';
import './room-production-preparation.css';
import StudioAudioStrip from './StudioAudioStrip';
import StudioSoundcheck from './StudioSoundcheck';
import { studioAudioSettings, type StudioAudioSettings } from '../../../runtime/studioAudioSettings';

export type StudioRoomAudio = {
  levels: Pick<StudioAudioSettings, 'voiceGain' | 'voiceMuted' | 'musicGain' | 'musicMuted'>;
  voiceStream: MediaStream | null;
  voiceDeviceId?: string;
  monitoring: boolean;
  error?: string | null;
  onChange: (patch: Partial<StudioAudioSettings>) => void;
  onToggleMonitoring: () => void;
  prepareMicrophone: () => Promise<void>;
  startVoicePreview: () => Promise<MediaStream>;
  onOpenEffects: () => void;
};

function mediaErrorMessage(reason: unknown) {
  if (reason instanceof Error || reason instanceof DOMException) {
    if (reason.name === 'NotAllowedError') return 'Accès refusé. Autorise la caméra ou le micro dans Windows, puis réessaie.';
    if (reason.name === 'NotFoundError' || reason.name === 'OverconstrainedError') return 'Ce périphérique n’est plus disponible. Détecte les sources et choisis une entrée.';
    if (reason.name === 'NotReadableError') return 'Ce périphérique est occupé ou ne répond pas. Ferme son utilisation dans une autre application puis réessaie.';
    return reason.message;
  }
  return 'Périphérique indisponible. Réessaie après avoir vérifié son branchement.';
}

function SourcePreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = stream;
    void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [stream]);
  return <video ref={ref} autoPlay muted playsInline />;
}

export type RoomProductionReadiness = { video: boolean; microphone: boolean; music: boolean; pending: boolean };

export default function RoomProductionPreparation({ roomId, liveRoom, onAir, publicationStatus, transportError, onStart, onStop, stage = 'room', initialSetup, onSetupChange, onReadinessChange, roomAudio }: {
  roomId: string; liveRoom: boolean; onAir: boolean; publicationStatus: string;
  transportError?: string | null;
  onStart: (program: MediaStream, musicSource: DesktopMusicSource | null) => boolean | void; onStop: () => void;
  stage?: 'launch' | 'room'; initialSetup?: RoomProductionSetup | null; onSetupChange?: (setup: RoomProductionSetup) => void;
  onReadinessChange?: (readiness: RoomProductionReadiness) => void;
  roomAudio?: StudioRoomAudio;
}) {
  const runtime = useRuntime();
  const [devices] = useState(() => new DesktopMediaDevices(navigator.mediaDevices, window.meewavDesktop));
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState(() => initialSetup?.cameraId ?? readRoomDevicePreferences().cameraId ?? '');
  const [microphoneId, setMicrophoneId] = useState(() => initialSetup?.microphoneId ?? readRoomDevicePreferences().microphoneId ?? '');
  const [musicInputId, setMusicInputId] = useState(() => initialSetup?.musicInputId ?? '');
  const [audioSettings, setAudioSettings] = useState(() => studioAudioSettings(initialSetup?.audio));
  const settings = { ...audioSettings, ...roomAudio?.levels };
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const updateAudio = (patch: Partial<StudioAudioSettings>) => {
    setAudioSettings(current => studioAudioSettings({ ...current, ...patch }));
    roomAudio?.onChange(patch);
  };
  const privateVoice = useRef<DesktopMusicSource | null>(null);
  const [voiceMonitoring, setVoiceMonitoring] = useState(false);
  const [musicMonitoring, setMusicMonitoring] = useState(false);
  const voiceMatchesSelection = !roomAudio || !microphoneId || roomAudio.voiceDeviceId === microphoneId;
  const musicSource = useRef<DesktopMusicSource | null>(null);
  const musicStream = useRef<MediaStream | null>(null);
  const musicMeterTimer = useRef<number | null>(null);
  const [musicLevel, setMusicLevel] = useState(0);
  const [musicActive, setMusicActive] = useState(false);
  const [sources, setSources] = useState<Array<{ id: string; name: string; stream: MediaStream; deviceId?: string; captureId?: string }>>([]);
  const captures = useRef(new Set<MediaStream>());
  const mounted = useRef(true);
  const epoch = useRef(0);
  const [screenSources, setScreenSources] = useState<CaptureSource[]>([]);
  const [screenId, setScreenId] = useState('');
  const [level, setLevel] = useState(0);
  const microphoneStream = useRef<MediaStream | null>(null);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [audioFormat, setAudioFormat] = useState('');
  const meterCleanup = useRef<(() => void) | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const operation = useRef<symbol | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [performanceMode, setPerformanceMode] = useState(false);
  const [videoEngines, setVideoEngines] = useState<{ preview: RoomVideoProgram; program: RoomVideoProgram } | null>(null);
  const enginesRef = useRef<typeof videoEngines>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => initialSetup?.sourceKeys?.map(() => '') ?? []);
  const initialSlotKeys = useRef(initialSetup?.sourceKeys ?? []);
  const [sceneOptions, setSceneOptions] = useState<Pick<VideoScene, 'pipScale' | 'splitRatio' | 'frames' | 'fits'>>(() => ({ pipScale: initialSetup?.pipScale, splitRatio: initialSetup?.splitRatio, frames: initialSetup?.frames, fits: initialSetup?.fits }));
  const [layout, setLayout] = useState<VideoLayout>(() => initialSetup?.layout ?? 'full');
  const [pipPosition, setPipPosition] = useState<VideoPosition>(() => initialSetup?.pipPosition ?? { x: 0.973, y: 0.952 });
  const [programReady, setProgramReady] = useState(false);
  const [, refreshSignal] = useState(0);
  const [restoringCameras, setRestoringCameras] = useState(Boolean(initialSetup?.cameraIds.length));
  const activeSourceIds = useMemo(() => selectedSources.map((id) => sources.some((source) => source.id === id) ? id : ''), [sources, selectedSources]);
  const scene = useMemo<VideoScene>(() => ({ ...sceneOptions, layout, sourceIds: activeSourceIds, pipPosition }), [sceneOptions, layout, activeSourceIds, pipPosition]);
  const updateScene = (next: VideoScene) => {
    initialSlotKeys.current = next.sourceIds.map((id) => {
      const source = sources.find((item) => item.id === id);
      return source?.deviceId ? `camera:${source.deviceId}` : source?.captureId ? `screen:${source.captureId}` : '';
    });
    setLayout(next.layout); setSelectedSources(next.sourceIds);
    if (next.pipPosition) setPipPosition(next.pipPosition);
    setSceneOptions({ pipScale: next.pipScale, splitRatio: next.splitRatio, frames: next.frames, fits: next.fits });
  };
  useEffect(() => {
    let engines: NonNullable<typeof videoEngines> | null = null;
    try {
      const preview = new RoomVideoProgram(true);
      try { engines = { preview, program: new RoomVideoProgram() }; }
      catch (reason) { preview.dispose(); throw reason; }
      enginesRef.current = engines; setVideoEngines(engines);
    } catch (reason) { setRestoringCameras(false); setError(reason instanceof Error ? reason.message : 'Vidéo indisponible.'); }
    return () => { engines?.preview.dispose(); engines?.program.dispose(); enginesRef.current = null; };
  }, []);
  useEffect(() => {
    videoEngines?.preview.take(scene);
  }, [videoEngines, scene]);
  useEffect(() => {
    if (restoringCameras) return;
    saveRoomDevicePreferences({ cameraId, microphoneId });
    onSetupChange?.({ audio: studioAudioSettings(settingsRef.current), ...sceneOptions, sourceKeys: activeSourceIds.map((id, index) => { const source = sources.find((item) => item.id === id); return source?.deviceId ? `camera:${source.deviceId}` : source?.captureId ? `screen:${source.captureId}` : initialSlotKeys.current[index] ?? ''; }), cameraId, microphoneId, musicInputId, cameraIds: sources.map((source) => source.deviceId).filter((id): id is string => Boolean(id)), layout, pipPosition });
  }, [stage, restoringCameras, cameraId, microphoneId, musicInputId, sources, layout, pipPosition, onSetupChange, sceneOptions, activeSourceIds, audioSettings, roomAudio?.levels.voiceGain, roomAudio?.levels.voiceMuted, roomAudio?.levels.musicGain, roomAudio?.levels.musicMuted]);
  const releaseMusicPreview = useCallback(() => {
    if (musicMeterTimer.current !== null) window.clearInterval(musicMeterTimer.current);
    musicMeterTimer.current = null;
    musicSource.current?.dispose(); musicSource.current = null;
    musicStream.current?.getTracks().forEach((track) => track.stop());
    if (musicStream.current) captures.current.delete(musicStream.current);
    musicStream.current = null;
    if (mounted.current) { setMusicLevel(0); setMusicActive(false); setMusicMonitoring(false); }
  }, []);
  const stopCaptures = useCallback(() => {
    ++epoch.current;
    operation.current = null;
    startingRef.current = false;
    captures.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    captures.current.clear();
    releaseMusicPreview();
    meterCleanup.current?.(); meterCleanup.current = null;
    microphoneStream.current = null;
    enginesRef.current?.preview.clear(); enginesRef.current?.program.clear();
    if (mounted.current) { setBusy(false); setStarting(false); setRestoringCameras(false); setSources([]); setSelectedSources([]); setProgramReady(false); setLevel(0); setMicrophoneActive(false); setVoiceMonitoring(false); }
  }, [releaseMusicPreview]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void devices.enumerate().then((list) => { if (mounted.current) setInputs(list); }).catch(() => undefined); };
    refresh();
    const unsubscribe = devices.watch(refresh);
    return () => { mounted.current = false; unsubscribe(); stopCaptures(); };
  }, [devices, roomId, stopCaptures]);

  const run = async (action: () => Promise<void>) => {
    if (operation.current || restoringCameras) return;
    const token = Symbol();
    operation.current = token;
    setError(''); setBusy(true);
    try { await action(); }
    catch (reason) { if (mounted.current && operation.current === token) setError(mediaErrorMessage(reason)); }
    finally { if (operation.current === token) { operation.current = null; if (mounted.current) setBusy(false); } }
  };
  const keepCapture = (stream: MediaStream, generation: number) => {
    if (!mounted.current || generation !== epoch.current) { stream.getTracks().forEach((track) => track.stop()); captures.current.delete(stream); return false; }
    captures.current.add(stream);
    return true;
  };
  const assignAddedSource = (id: string, key: string) => {
    setSelectedSources((current) => {
      const next = [...current];
      const remembered = initialSlotKeys.current.map((value, index) => value === key ? index : -1).filter((index) => index >= 0);
      if (remembered.length) { remembered.forEach((index) => { next[index] = id; }); return next; }
      const empty = next.findIndex((value) => !value);
      if (empty >= 0) next[empty] = id; else if (next.length < 9) next.push(id);
      return next;
    });
  };
  const previewCamera = async () => {
    const generation = epoch.current;
    const stream = await devices.captureCamera(cameraId);
    if (!keepCapture(stream, generation)) return;
    const id = crypto.randomUUID();
    try {
      if (!videoEngines) throw new Error('Composition indisponible.');
      await Promise.all([videoEngines.preview.add(id, stream), videoEngines.program.add(id, stream)]);
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop()); captures.current.delete(stream);
      videoEngines?.preview.remove(id); videoEngines?.program.remove(id); throw reason;
    }
    if (!keepCapture(stream, generation)) { videoEngines?.preview.remove(id); videoEngines?.program.remove(id); return; }
    setSources((current) => [...current, { id, name: inputs.find((input) => input.deviceId === cameraId)?.label || 'Caméra', stream, deviceId: cameraId }]);
    assignAddedSource(id, `camera:${cameraId}`);
  };
  const initialCameras = useRef(initialSetup?.cameraIds ?? []);
  useEffect(() => {
    if (!videoEngines || !initialCameras.current.length) return;
    const ids = [...new Set(initialCameras.current)];
    initialCameras.current = [];
    const generation = epoch.current;
    void (async () => {
      for (const deviceId of ids) {
        if (!mounted.current || generation !== epoch.current) break;
        let stream: MediaStream | null = null;
        const id = crypto.randomUUID();
        try {
          stream = await devices.captureCamera(deviceId);
          if (!keepCapture(stream, generation)) continue;
          await Promise.all([videoEngines.preview.add(id, stream), videoEngines.program.add(id, stream)]);
          if (!keepCapture(stream, generation)) { videoEngines.preview.remove(id); videoEngines.program.remove(id); continue; }
          setSources((current) => [...current, { id, name: stream!.getVideoTracks()[0]?.label || 'Caméra', stream: stream!, deviceId }]);
          assignAddedSource(id, `camera:${deviceId}`);
        } catch {
          stream?.getTracks().forEach((track) => track.stop());
          if (stream) captures.current.delete(stream);
          videoEngines.preview.remove(id); videoEngines.program.remove(id);
          if (mounted.current) setError('Une caméra préparée dans le Studio n’est plus disponible. Vérifie le périphérique.');
        }
      }
      if (mounted.current && generation === epoch.current) setRestoringCameras(false);
    })();
  }, [videoEngines, devices]);
  const previewMicrophone = async () => {
    meterCleanup.current?.(); meterCleanup.current = null;
    microphoneStream.current = null;
    setMicrophoneActive(false); setLevel(0);
    const generation = epoch.current;
    saveRoomDevicePreferences({ cameraId, microphoneId });
    await roomAudio?.prepareMicrophone();
    if (generation !== epoch.current || !mounted.current) return;
    if (roomAudio) {
      await roomAudio.startVoicePreview();
      if (generation === epoch.current && mounted.current) { setMicrophoneActive(true); setAudioFormat('Chaîne du mixeur · effets conservés'); }
      return;
    }
    const stream = await devices.captureMicrophone(microphoneId);
    if (!keepCapture(stream, generation)) return;
    microphoneStream.current = stream;
    const settings = stream.getAudioTracks()[0]?.getSettings();
    setAudioFormat([settings?.channelCount ? `${settings.channelCount} canal(aux)` : '', settings?.sampleRate ? `${settings.sampleRate} Hz` : ''].filter(Boolean).join(' · '));
    let source: DesktopMusicSource | null = null;
    const track = stream.getAudioTracks()[0];
    const cleanup = () => {
      source?.dispose();
      if (privateVoice.current === source) privateVoice.current = null;
      stream.getTracks().forEach(item => item.stop()); captures.current.delete(stream);
      track?.removeEventListener('ended', ended);
      if (microphoneStream.current === stream) microphoneStream.current = null;
    };
    const ended = () => { cleanup(); if (mounted.current) { setMicrophoneActive(false); setLevel(0); setVoiceMonitoring(false); setError('Le micro a été déconnecté. Choisis une entrée et teste-la à nouveau.'); } };
    try {
      if (!track || track.readyState !== 'live') throw new Error('Le micro ne fournit pas de signal.');
      source = new DesktopMusicSource(track);
      await source.start();
      if (generation !== epoch.current || !mounted.current) { cleanup(); return; }
      source.setGain(settingsRef.current.voiceMuted ? 0 : settingsRef.current.voiceGain);
      privateVoice.current = source;
      track.addEventListener('ended', ended, { once: true });
      meterCleanup.current = cleanup;
      setMicrophoneActive(true); setVoiceMonitoring(false);
    } catch (reason) { cleanup(); throw reason; }
  };
  const previewMusicInput = async () => {
    releaseMusicPreview();
    const generation = epoch.current;
    const stream = await devices.captureMusic(musicInputId);
    if (!keepCapture(stream, generation)) return;
    let source: DesktopMusicSource | null = null;
    try {
      const track = stream.getAudioTracks()[0];
      if (!track) throw new Error('Cette entrée ne fournit pas de son.');
      source = new DesktopMusicSource(track);
      await source.start();
      if (!mounted.current || generation !== epoch.current) { source.dispose(); stream.getTracks().forEach((item) => item.stop()); captures.current.delete(stream); return; }
      source.configure(settingsRef.current);
      source.setGain(settingsRef.current.musicMuted ? 0 : settingsRef.current.musicGain);
      musicSource.current = source;
      musicStream.current = stream;
      setMusicActive(true);
      const activeSource = source;
      musicMeterTimer.current = window.setInterval(() => {
        if (mounted.current && musicSource.current === activeSource) setMusicLevel(activeSource.peak());
      }, 80);
      track.addEventListener('ended', () => { if (musicSource.current === activeSource) { releaseMusicPreview(); if (mounted.current) setError('La source musicale a été déconnectée. Rebranche-la avant de reprendre la diffusion.'); } }, { once: true });
    } catch (reason) {
      source?.dispose();
      stream.getTracks().forEach((track) => track.stop());
      captures.current.delete(stream);
      throw reason;
    }
  };
  const previewScreen = async () => {
    const generation = epoch.current;
    const stream = await devices.captureScreen(screenId, false);
    if (!keepCapture(stream, generation)) return;
    const id = crypto.randomUUID();
    try {
      if (!videoEngines) throw new Error('Composition indisponible.');
      await Promise.all([videoEngines.preview.add(id, stream), videoEngines.program.add(id, stream)]);
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop()); captures.current.delete(stream);
      videoEngines?.preview.remove(id); videoEngines?.program.remove(id); throw reason;
    }
    if (!keepCapture(stream, generation)) { videoEngines?.preview.remove(id); videoEngines?.program.remove(id); return; }
    setSources((current) => [...current, { id, name: screenSources.find((source) => source.id === screenId)?.name || 'Écran', stream, captureId: screenId }]);
    assignAddedSource(id, `screen:${screenId}`);
  };
  const removeSource = (id: string) => {
    const source = sources.find((candidate) => candidate.id === id);
    if (!source) return;
    initialSlotKeys.current = initialSlotKeys.current.map((key, index) => selectedSources[index] === id ? '' : key);
    source.stream.getTracks().forEach((track) => track.stop());
    captures.current.delete(source.stream);
    videoEngines?.preview.remove(id);
    videoEngines?.program.remove(id);
    if (videoEngines?.program.program.sourceIds.includes(id)) {
      videoEngines.program.blank();
      setProgramReady(false);
    }
    setSources((current) => current.filter((candidate) => candidate.id !== id));
    setSelectedSources((current) => current.map((candidate) => candidate === id ? '' : candidate));
  };
  useEffect(() => {
    const cleanups = sources.flatMap((source) => source.stream.getVideoTracks().map((track) => {
      const ended = () => {
        if (!mounted.current) return;
        captures.current.delete(source.stream);
        source.stream.getTracks().forEach((item) => item.stop());
        videoEngines?.preview.remove(source.id); videoEngines?.program.remove(source.id);
        if (videoEngines?.program.program.sourceIds.includes(source.id)) setProgramReady(false);
        setSources((current) => current.filter((item) => item.id !== source.id));
        setSelectedSources((current) => current.map((id) => id === source.id ? '' : id));
        setError(`${source.name} a été déconnectée. Ajoute une source et prépare un nouveau plan.`);
      };
      const changed = () => { if (mounted.current) refreshSignal((value) => value + 1); };
      track.addEventListener('ended', ended, { once: true });
      track.addEventListener('mute', changed); track.addEventListener('unmute', changed);
      return () => { track.removeEventListener('ended', ended); track.removeEventListener('mute', changed); track.removeEventListener('unmute', changed); };
    }));
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [sources, videoEngines]);
  useEffect(() => { if (onAir || publicationStatus === 'failed') { startingRef.current = false; setStarting(false); } }, [onAir, publicationStatus]);
  const startBroadcast = async () => {
    if (!videoEngines || startingRef.current || busy || restoringCameras) return;
    const program = videoEngines.program.program;
    const ids = program.sourceIds.slice(0, sceneFrames(program).length).filter(Boolean);
    if (!ids.length || ids.some((id) => !videoEngines.program.hasSignal(id))) {
      setProgramReady(false); setError('Le plan de sortie a perdu son signal. Prépare un nouveau plan avant le direct.'); return;
    }
    if (musicInputId && (!musicSource.current || musicSource.current.inputTrack.readyState !== 'live')) { setError('Rebranche et mesure la source musicale avant le direct.'); return; }
    if (musicInputId && musicInputId === microphoneId) { setError('Choisis deux entrées distinctes pour la voix et la musique.'); return; }
    startingRef.current = true; setStarting(true); setError('');
    saveRoomDevicePreferences({ cameraId, microphoneId });
    // Release the private test before the transport opens the chosen device.
    meterCleanup.current?.(); meterCleanup.current = null; setMicrophoneActive(false); setLevel(0);
    setVoiceMonitoring(false);
    musicSource.current?.setMonitoring(false); setMusicMonitoring(false);
    const generation = epoch.current;
    try {
      await roomAudio?.prepareMicrophone();
      if (generation !== epoch.current || !mounted.current) return;
      if (ids.some(id => !videoEngines.program.hasSignal(id))) throw new Error('Une source vidéo a été déconnectée pendant la préparation. Applique un nouveau plan.');
      if (musicInputId && musicSource.current?.inputTrack.readyState !== 'live') throw new Error('La source musicale a été déconnectée. Reconnecte-la avant le direct.');
      if (onStart(videoEngines.program.stream, musicSource.current) === false) { startingRef.current = false; setStarting(false); }
    } catch (reason) { startingRef.current = false; setStarting(false); setError(mediaErrorMessage(reason)); }
  };
  useEffect(() => {
    privateVoice.current?.setGain(settings.voiceMuted ? 0 : settings.voiceGain);
    musicSource.current?.configure({ mono: settings.mono, pan: settings.pan, delayMs: settings.delayMs });
    if (!onAir) musicSource.current?.setGain(settings.musicMuted ? 0 : settings.musicGain);
  }, [settings.voiceGain, settings.voiceMuted, settings.musicGain, settings.musicMuted, settings.mono, settings.pan, settings.delayMs, onAir]);
  useEffect(() => {
    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      if (roomAudio?.voiceStream?.getAudioTracks().some(track => track.readyState === 'live')) {
        context = new AudioContext();
        analyser = context.createAnalyser(); analyser.fftSize = 512;
        source = context.createMediaStreamSource(roomAudio.voiceStream); source.connect(analyser);
        void context.resume().catch(() => undefined);
      }
    } catch { /* Metering failure must not interrupt the live audio graph. */ }
    const samples = new Float32Array(512);
    const timer = window.setInterval(() => {
      if (analyser) { analyser.getFloatTimeDomainData(samples); setLevel(Math.min(1, samples.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0))); }
      else setLevel(onAir ? 0 : privateVoice.current?.peak() ?? 0);
    }, 80);
    return () => { window.clearInterval(timer); source?.disconnect(); if (context) void context.close().catch(() => undefined); };
  }, [onAir, roomAudio?.voiceStream]);
  const layoutChoices: Array<{ id: VideoLayout; label: string; detail: string }> = [
    { id: 'full', label: 'Plein écran', detail: '1 source' },
    { id: 'split', label: 'Split A/B', detail: '2 sources' },
    { id: 'pip', label: 'Incrustation', detail: 'Déplaçable' },
    { id: 'grid', label: 'Grille', detail: 'Jusqu’à 9' },
    { id: 'free', label: 'Libre', detail: 'Déplacer / redimensionner' },
  ];
  const availableAt = (index: number) => Boolean(activeSourceIds[index] && videoEngines?.preview.hasSignal(activeSourceIds[index]));
  const missingSources = layout === 'split' || layout === 'pip' ? [0, 1].filter((index) => !availableAt(index)).length : sceneFrames(scene).some((_, index) => availableAt(index)) ? 0 : 1;
  useEffect(() => {
    onReadinessChange?.({ video: missingSources === 0, microphone: microphoneActive, music: musicActive, pending: busy || restoringCameras });
  }, [missingSources, microphoneActive, musicActive, busy, restoringCameras, onReadinessChange]);
  return <section className="room-production" aria-label={stage === 'launch' ? 'Studio Meewav · préparation de la Room' : 'Production de la Room'} data-room-id={roomId}>
    <header className="room-production__hero">
      <span className="room-production__hero-icon"><Video size={23} aria-hidden="true" /></span>
      <div><small>{stage === 'launch' ? 'PRÉPARATION DU DIRECT' : 'STUDIO MEEWAV'}</small><h3>{stage === 'launch' ? 'Studio Meewav' : 'Régie du direct'}</h3><p>Ton image, ta voix et tes instruments. Prépare ton son avant de passer en direct.</p></div>
      <span className={`room-production__status${onAir && publicationStatus === 'connected' ? ' is-live' : ''}`}><i />{stage === 'launch' ? 'PRÉPARATION PRIVÉE' : onAir ? publicationStatus === 'connected' ? 'TRANSPORT CONNECTÉ' : publicationStatus === 'failed' ? 'CONNEXION IMPOSSIBLE' : 'CONNEXION…' : 'HORS ANTENNE'}</span>
      {stage === 'room' ? <button type="button" className="room-production__mode" onClick={() => setPerformanceMode((value) => !value)}>{performanceMode ? 'Mode préparation' : 'Mode performance'}</button> : null}
    </header>

    <div className={`room-production__workspace${performanceMode ? ' is-performance' : ''}`}>
      {!performanceMode ? <aside className="room-production__rack" aria-label="Sources de production">
        <div className="room-production__section-heading"><small>SOURCES VIDÉO</small><strong>Construire le plateau</strong></div>
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Camera size={17} aria-hidden="true" /><strong>Caméras</strong><button type="button" disabled={busy || restoringCameras} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels('video'); if (mounted.current) setInputs(list); })}>Détecter</button></div>
          <label className="room-production__field"><span>Périphérique vidéo</span><MeewavSelect title={inputs.find((input) => input.deviceId === cameraId)?.label || "Choisir une caméra"} value={cameraId} disabled={busy || restoringCameras} onChange={(event) => setCameraId(event.target.value)}><option value="">Choisir une caméra</option>{inputs.filter((input) => input.kind === 'videoinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId}>{input.label || `Caméra ${index + 1}`}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || !cameraId || sources.length >= 9 || sources.some((source) => source.deviceId === cameraId)} onClick={() => void run(previewCamera)}><Plus size={15} aria-hidden="true" />{sources.some((source) => source.deviceId === cameraId) ? "Caméra déjà ajoutée" : "Ajouter cette caméra"}</button>
          <small>Caméra USB ou carte d’acquisition.</small>
        </div>
        {runtime.canCaptureWindow ? <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Monitor size={17} aria-hidden="true" /><strong>Écran et fenêtre</strong><button type="button" disabled={busy || restoringCameras} onClick={() => void run(async () => { const list = await devices.screenSources(); if (mounted.current) setScreenSources(list); })}>Parcourir</button></div>
          <label className="room-production__field"><span>Source de capture</span><MeewavSelect title={screenSources.find((source) => source.id === screenId)?.name || "Choisir un écran ou une fenêtre"} value={screenId} disabled={busy || restoringCameras} onChange={(event) => setScreenId(event.target.value)}><option value="">Choisir un écran ou une fenêtre</option>{screenSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || !screenId || sources.length >= 9 || sources.some((source) => source.captureId === screenId)} onClick={() => void run(previewScreen)}><Plus size={15} aria-hidden="true" />Ajouter à l’aperçu</button><small>Capture vidéo seule. Rechoisis-la après le lancement.</small>
        </div> : null}
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Grip size={17} aria-hidden="true" /><strong>Sources vidéo</strong><span>{sources.length}</span></div>
          {sources.length ? <ol className="room-production__source-list">{sources.map((source) => <li key={source.id}>
            <label className="room-production__source-select"><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => updateScene({ ...scene, sourceIds: selectSceneSource(selectedSources, source.id, event.target.checked) })} /><span>{source.name || 'Source vidéo'}</span></label>
            <div className="room-production__source-actions"><button type="button" aria-label={`Retirer ${source.name}`} disabled={onAir && videoEngines?.program.program.sourceIds.includes(source.id)} onClick={() => removeSource(source.id)}><X size={14} /></button></div>
            <input className="room-production__source-name" aria-label={`Renommer ${source.name}`} value={source.name} onChange={(event) => setSources((current) => current.map((item) => item.id === source.id ? { ...item, name: event.target.value } : item))} />
          </li>)}</ol> : <p className="room-production__empty">Aucune source ajoutée. Choisis une caméra ou une fenêtre ci-dessus.</p>}
          <small>Affecte les sources dans Disposition et cadrage.</small>
        </div>
      </aside> : null}

      <div className="room-production__director">
        <div className="room-production__video-workspace">
        <div className="room-production__section-heading"><small>IMAGE</small><strong>Aperçu → Sortie</strong><span>Prépare le prochain plan à gauche. La sortie ne change que lorsque tu appliques une transition.</span></div>
        {videoEngines ? <>
          <div className="room-production__monitors">
            <article className="room-production__monitor is-preview"><div className="room-production__monitor-label"><span><i />APERÇU</span><small>Privé · prochain plan</small></div><VideoPreviewEditor scene={scene} onChange={updateScene}><SourcePreview stream={videoEngines.preview.stream} /></VideoPreviewEditor></article>
            <article className="room-production__monitor is-program"><div className="room-production__monitor-label"><span><i />SORTIE</span><small>{onAir ? publicationStatus === 'connected' ? 'Sortie transport connecté' : publicationStatus === 'failed' ? 'Transport indisponible' : 'Connexion au transport…' : 'Hors antenne'}</small></div><div className="room-production__monitor-frame"><SourcePreview stream={videoEngines.program.stream} />{!programReady && !onAir ? <div className="room-production__monitor-empty"><Video aria-hidden="true" /><strong>Prépare ta sortie</strong><span>Choisis une source dans l’aperçu, puis applique le plan.</span></div> : null}</div></article>
          </div>
          <details className="room-production__layout-panel"><summary>Disposition et cadrage du plan</summary><div className="room-production__layouts">{layoutChoices.map((choice) => <button type="button" key={choice.id} className={layout === choice.id ? 'is-active' : ''} aria-pressed={layout === choice.id} onClick={() => updateScene({ ...scene, layout: choice.id, frames: choice.id === 'free' ? sceneFrames(scene) : scene.frames })}><span className={`room-production__layout-icon is-${choice.id}`} aria-hidden="true"><i /><i /><i /><i /></span><span>{choice.label}<small>{choice.detail}</small></span></button>)}</div><p className={missingSources ? 'room-production__layout-notice' : undefined} role="status">{missingSources ? `Affecte ${missingSources} source${missingSources > 1 ? 's' : ''} supplémentaire${missingSources > 1 ? 's' : ''} pour préparer ce plan. Les zones grisées restent privées.` : `${sceneFrames(scene).filter((_, index) => activeSourceIds[index]).length} source(s) dans le plan · La sortie reste inchangée jusqu’à la transition.`}</p><VideoSceneControls scene={scene} onChange={updateScene} sources={sources} /></details>
          <div className="room-production__transitions"><div><small>SORTIE VIDÉO</small><strong>Appliquer le plan à la sortie</strong></div>{(['TAKE', 'FADE'] as const).map((action) => <button key={action} type="button" disabled={missingSources > 0 || busy || restoringCameras} className={action === 'TAKE' ? 'is-primary' : ''} onClick={() => { try { videoEngines.program.take(scene, action === 'FADE' ? 500 : 0); setProgramReady(true); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Transition impossible.'); } }}>{action === 'FADE' ? 'Fondu · 0,5 s' : 'Appliquer le plan'}</button>)}</div>
        </> : <p className="room-production__empty">La composition vidéo n’est pas disponible sur ce système.</p>}
        </div>
        <section className="studio-audio-desk" aria-label="Mixage du studio">
          <header className="studio-audio-desk__heading"><div><small>SON</small><h3>Le son de ta session</h3></div><span><Headphones size={14} /> Écoute privée · casque recommandé</span></header>
          <div className="studio-audio-desk__channels">
            <StudioAudioStrip name="Ma voix" icon={<Mic size={20} />} gain={settings.voiceGain} muted={settings.voiceMuted} level={level} active={roomAudio ? voiceMatchesSelection && Boolean(roomAudio.voiceStream) : microphoneActive}
              monitoring={roomAudio?.monitoring ?? voiceMonitoring} detail={roomAudio ? 'Voix traitée · mixeur de la room' : 'Balance avant le direct'}
              disabled={busy || starting} onGain={voiceGain => updateAudio({ voiceGain })} onMute={() => updateAudio({ voiceMuted: !settings.voiceMuted })}
              onMonitor={() => { if (roomAudio) roomAudio.onToggleMonitoring(); else { privateVoice.current?.setMonitoring(!voiceMonitoring); setVoiceMonitoring(!voiceMonitoring); } }}>
              <label className="room-production__field"><span>Micro / interface audio Windows</span><MeewavSelect value={microphoneId} disabled={busy || restoringCameras || starting || onAir} onChange={event => { meterCleanup.current?.(); meterCleanup.current = null; setMicrophoneActive(false); setLevel(0); setVoiceMonitoring(false); setMicrophoneId(event.target.value); }}><option value="">Choisir une entrée</option>{inputs.filter(input => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId} disabled={input.deviceId === musicInputId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</MeewavSelect></label>
              <div className="studio-audio-strip__connect"><button type="button" disabled={busy || restoringCameras || starting || onAir || !microphoneId} onClick={() => void run(previewMicrophone)}>{microphoneActive ? 'Retester le micro' : 'Tester le micro'}</button><small>{onAir ? roomAudio?.voiceStream ? 'Niveau après les effets' : 'Niveau traité indisponible' : audioFormat || 'Son brut · effets dans le mixeur'}</small></div>
            </StudioAudioStrip>
            <StudioAudioStrip name="Musique" icon={<AudioLines size={20} />} gain={settings.musicGain} muted={settings.musicMuted} level={musicLevel} active={musicActive}
              monitoring={musicMonitoring} detail="Instrument · logiciel musical · loopback" disabled={busy || starting}
              onGain={musicGain => updateAudio({ musicGain })} onMute={() => updateAudio({ musicMuted: !settings.musicMuted })}
              onMonitor={() => { musicSource.current?.setMonitoring(!musicMonitoring); setMusicMonitoring(!musicMonitoring); }}>
              <label className="room-production__field"><span>Entrée musicale distincte du micro</span><MeewavSelect value={musicInputId} disabled={busy || restoringCameras || starting || onAir} onChange={event => { releaseMusicPreview(); setMusicInputId(event.target.value); }}><option value="">Aucune source musicale externe</option>{inputs.filter(input => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId} disabled={input.deviceId === microphoneId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</MeewavSelect></label>
              <div className="studio-audio-strip__connect"><button type="button" disabled={busy || restoringCameras || starting || onAir || !musicInputId || musicInputId === microphoneId} onClick={() => void run(previewMusicInput)}>{musicActive ? 'Reconnecter la musique' : 'Brancher et mesurer la musique'}</button><small>Stéréo · dynamique préservée</small></div>
            </StudioAudioStrip>
          </div>
          <div className="studio-audio-desk__toolbar"><button type="button" disabled={busy || restoringCameras || starting || onAir} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels(); if (mounted.current) setInputs(list); })}><Mic size={14} /> Détecter les entrées</button>{roomAudio ? <button type="button" onClick={roomAudio.onOpenEffects}><SlidersHorizontal size={14} /> Effets de ma voix</button> : null}<span>Les boutons Écouter ne diffusent rien au public.</span></div>
          <details className="studio-audio-desk__advanced"><summary><SlidersHorizontal size={15} /> Réglages de la musique <span>{settings.mono ? 'Mono' : 'Stéréo'} · {settings.delayMs} ms</span></summary>
            <div className="studio-audio-desk__settings">
              <button type="button" aria-pressed={settings.mono} onClick={() => updateAudio({ mono: !settings.mono })}>{settings.mono ? 'Mono activé' : 'Passer en mono'}</button>
              <label>Balance <output>{settings.pan === 0 ? 'Centre' : `${settings.pan < 0 ? 'Gauche' : 'Droite'} ${Math.round(Math.abs(settings.pan) * 100)} %`}</output><input aria-label="Balance musique" type="range" min={-1} max={1} step={.05} value={settings.pan} onChange={event => updateAudio({ pan: Number(event.target.value) })} /></label>
              <label>Retard audio <span className="studio-audio-desk__delay"><input aria-label="Retard musique en millisecondes" type="number" min={0} max={1000} step={10} value={settings.delayMs} onChange={event => updateAudio({ delayMs: Math.max(0, Math.min(1000, Number(event.target.value))) })} /> ms</span></label>
              <button type="button" onClick={() => updateAudio({ mono: false, pan: 0, delayMs: 0 })}>Réinitialiser</button>
            </div><p>Le retard aligne le son musical sur une image en retard. Ces réglages s’appliquent à la sortie et à ton écoute.</p>
          </details>
          <StudioSoundcheck video={programReady ? videoEngines?.program.stream ?? null : null} voice={voiceMatchesSelection ? roomAudio?.voiceStream?.getAudioTracks()[0] ?? privateVoice.current?.track ?? null : null} music={musicSource.current?.track ?? null} onAir={onAir} />
          <details className="studio-audio-desk__help"><summary>Instruments, platines, logiciel musical : quelle entrée choisir ?</summary><p>Instrumentistes : choisis l’entrée de ton interface audio ; active Mono pour une source mono. DJ et beatmakers : récupère la sortie stéréo des platines ou le loopback de ton logiciel. Garde une autre entrée pour la voix. Danseurs : applique ton plan caméra, puis enregistre un essai pour vérifier le cadrage et le décalage son/image. Le MIDI transmet des notes, pas du son. ASIO et la capture audio d’une application isolée ne sont pas pris en charge.</p></details>
          {roomAudio?.error ? <p className="room-production__error" role="alert">{roomAudio.error}</p> : null}
        </section>
      </div>
    </div>
    {busy || restoringCameras ? <p className="room-production__activity" role="status">{restoringCameras ? "Restauration des caméras…" : "Connexion à la source…"}</p> : null}
    {error ? <p className="room-production__error" role="alert">{error}</p> : null}
    {onAir && publicationStatus === 'failed' && transportError ? <p className="room-production__error" role="alert">{transportError}</p> : null}
    <footer className="room-production__footer">{stage === 'room' && !onAir ? <button type="button" className="is-primary" disabled={busy || restoringCameras || starting || !liveRoom || !programReady} onClick={() => void startBroadcast()}><Radio size={16} />{starting ? 'Connexion…' : 'Passer en direct'}</button> : stage === 'room' && onAir ? <button type="button" className="is-stop" onClick={() => { onStop(); releaseMusicPreview(); }}><Square size={16} />Arrêter la diffusion</button> : null}<button type="button" disabled={onAir || starting} onClick={stopCaptures}>Libérer les sources</button><small>{stage === 'launch' ? 'Préparation locale · aucune publication pendant le lancement' : !liveRoom ? 'Room de démonstration · aucune diffusion LIVE' : programReady ? 'Sortie prête' : 'Ajoute une source, puis applique le plan à la sortie'}</small></footer>
  </section>;
}
