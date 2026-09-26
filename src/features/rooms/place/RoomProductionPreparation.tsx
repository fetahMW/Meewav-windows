import MeewavSelect from "../../../components/shared/MeewavSelect";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Camera, Grip, Mic, Monitor, Plus, Radio, Square, Video, X } from 'lucide-react';
import { useRuntime, type CaptureSource } from '../../../runtime/RuntimeProvider';
import { DesktopMediaDevices } from '../../../runtime/DesktopMediaDevices';
import { DesktopMusicSource } from '../../../runtime/DesktopMusicSource';
import { RoomVideoProgram, type VideoLayout, type VideoPosition } from '../../../runtime/RoomVideoProgram';
import { readRoomDevicePreferences, saveRoomDevicePreferences } from './roomDevicePreferences';
import type { RoomProductionSetup } from './roomProductionSetup';
import { sceneFrames, selectSceneSource, type VideoScene } from '../../../runtime/videoScene';
import { VideoPreviewEditor, VideoSceneControls } from './VideoSceneEditor';
import './room-production-preparation.css';

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

export default function RoomProductionPreparation({ roomId, liveRoom, onAir, publicationStatus, transportError, onStart, onStop, stage = 'room', initialSetup, onSetupChange, onReadinessChange }: {
  roomId: string; liveRoom: boolean; onAir: boolean; publicationStatus: string;
  transportError?: string | null;
  onStart: (program: MediaStream, musicSource: DesktopMusicSource | null) => boolean | void; onStop: () => void;
  stage?: 'launch' | 'room'; initialSetup?: RoomProductionSetup | null; onSetupChange?: (setup: RoomProductionSetup) => void;
  onReadinessChange?: (readiness: RoomProductionReadiness) => void;
}) {
  const runtime = useRuntime();
  const [devices] = useState(() => new DesktopMediaDevices(navigator.mediaDevices, window.meewavDesktop));
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState(() => initialSetup?.cameraId ?? readRoomDevicePreferences().cameraId ?? '');
  const [microphoneId, setMicrophoneId] = useState(() => initialSetup?.microphoneId ?? readRoomDevicePreferences().microphoneId ?? '');
  const [musicInputId, setMusicInputId] = useState(() => initialSetup?.musicInputId ?? '');
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
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
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
    if (stage !== 'launch' || restoringCameras) return;
    saveRoomDevicePreferences({ cameraId, microphoneId });
    onSetupChange?.({ ...sceneOptions, sourceKeys: activeSourceIds.map((id, index) => { const source = sources.find((item) => item.id === id); return source?.deviceId ? `camera:${source.deviceId}` : source?.captureId ? `screen:${source.captureId}` : initialSlotKeys.current[index] ?? ''; }), cameraId, microphoneId, musicInputId, cameraIds: sources.map((source) => source.deviceId).filter((id): id is string => Boolean(id)), layout, pipPosition });
  }, [stage, restoringCameras, cameraId, microphoneId, musicInputId, sources, layout, pipPosition, onSetupChange, sceneOptions, activeSourceIds]);
  const releaseMusicPreview = useCallback(() => {
    if (musicMeterTimer.current !== null) window.clearInterval(musicMeterTimer.current);
    musicMeterTimer.current = null;
    musicSource.current?.dispose(); musicSource.current = null;
    musicStream.current?.getTracks().forEach((track) => track.stop());
    if (musicStream.current) captures.current.delete(musicStream.current);
    musicStream.current = null;
    if (mounted.current) { setMusicLevel(0); setMusicActive(false); }
  }, []);
  const stopCaptures = useCallback(() => {
    ++epoch.current;
    operation.current = null;
    captures.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    captures.current.clear();
    releaseMusicPreview();
    meterCleanup.current?.(); meterCleanup.current = null;
    microphoneStream.current = null;
    enginesRef.current?.preview.clear(); enginesRef.current?.program.clear();
    if (mounted.current) { setBusy(false); setRestoringCameras(false); setSources([]); setSelectedSources([]); setProgramReady(false); setLevel(0); setMicrophoneActive(false); setMicrophoneMuted(false); }
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
    const stream = await devices.captureMicrophone(microphoneId);
    if (!keepCapture(stream, generation)) return;
    microphoneStream.current = stream;
    const settings = stream.getAudioTracks()[0]?.getSettings();
    setAudioFormat([settings?.channelCount ? `${settings.channelCount} canal(aux)` : '', settings?.sampleRate ? `${settings.sampleRate} Hz` : ''].filter(Boolean).join(' · '));
    let context: AudioContext | null = null;
    let input: MediaStreamAudioSourceNode | null = null;
    let timer: number | null = null;
    const track = stream.getAudioTracks()[0];
    const cleanup = () => {
      if (timer !== null) window.clearInterval(timer);
      input?.disconnect(); stream.getTracks().forEach((item) => item.stop()); captures.current.delete(stream);
      track?.removeEventListener('ended', ended);
      if (microphoneStream.current === stream) microphoneStream.current = null;
      if (context && context.state !== 'closed') void context.close().catch(() => undefined);
    };
    const ended = () => { cleanup(); if (mounted.current) { setMicrophoneActive(false); setLevel(0); setError('Le micro a été déconnecté. Choisis une entrée et teste-la à nouveau.'); } };
    try {
      if (!track || track.readyState !== 'live') throw new Error('Le micro ne fournit pas de signal.');
      context = new AudioContext();
      await context.resume();
      if (generation !== epoch.current || !mounted.current) { cleanup(); return; }
      const analyser = context.createAnalyser(); analyser.fftSize = 512;
      input = context.createMediaStreamSource(stream); input.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      timer = window.setInterval(() => { analyser.getFloatTimeDomainData(samples); setLevel(Math.min(1, Math.max(...samples.map(Math.abs)))); }, 80);
      track.addEventListener('ended', ended, { once: true });
      meterCleanup.current = cleanup;
      setMicrophoneActive(true); setMicrophoneMuted(false);
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
  const startBroadcast = () => {
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
    try {
      if (onStart(videoEngines.program.stream, musicSource.current) === false) { startingRef.current = false; setStarting(false); }
    } catch (reason) { startingRef.current = false; setStarting(false); setError(mediaErrorMessage(reason)); }
  };
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
      <div><small>{stage === 'launch' ? 'PRÉPARATION DU DIRECT' : 'STUDIO MEEWAV'}</small><h3>{stage === 'launch' ? 'Studio Meewav' : 'Régie du direct'}</h3><p>Ajoute tes sources, prépare ton image à gauche et envoie le plan choisi à la sortie.</p></div>
      <span className={`room-production__status${onAir && publicationStatus === 'connected' ? ' is-live' : ''}`}><i />{stage === 'launch' ? 'PRÉPARATION PRIVÉE' : onAir ? publicationStatus === 'connected' ? 'TRANSPORT CONNECTÉ' : publicationStatus === 'failed' ? 'CONNEXION IMPOSSIBLE' : 'CONNEXION…' : 'HORS ANTENNE'}</span>
      {stage === 'room' ? <button type="button" className="room-production__mode" onClick={() => setPerformanceMode((value) => !value)}>{performanceMode ? 'Mode préparation' : 'Mode performance'}</button> : null}
    </header>

    <div className={`room-production__workspace${performanceMode ? ' is-performance' : ''}`}>
      {!performanceMode ? <aside className="room-production__rack" aria-label="Sources de production">
        <div className="room-production__section-heading"><small>01 / SOURCES</small><strong>Construire le plateau</strong><span>Prépare ici tes caméras, ton micro et ta musique.</span></div>
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Camera size={17} aria-hidden="true" /><strong>Caméras</strong><button type="button" disabled={busy || restoringCameras} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels('video'); if (mounted.current) setInputs(list); })}>Détecter</button></div>
          <label className="room-production__field"><span>Périphérique vidéo</span><MeewavSelect title={inputs.find((input) => input.deviceId === cameraId)?.label || "Choisir une caméra"} value={cameraId} disabled={busy || restoringCameras} onChange={(event) => setCameraId(event.target.value)}><option value="">Choisir une caméra</option>{inputs.filter((input) => input.kind === 'videoinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId}>{input.label || `Caméra ${index + 1}`}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || !cameraId || sources.length >= 9 || sources.some((source) => source.deviceId === cameraId)} onClick={() => void run(previewCamera)}><Plus size={15} aria-hidden="true" />{sources.some((source) => source.deviceId === cameraId) ? "Caméra déjà ajoutée" : "Ajouter cette caméra"}</button>
          <small>Ajoute plusieurs caméras, y compris les cartes d’acquisition exposées par Windows.</small>
        </div>
        {runtime.canCaptureWindow ? <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Monitor size={17} aria-hidden="true" /><strong>Écran et fenêtre</strong><button type="button" disabled={busy || restoringCameras} onClick={() => void run(async () => { const list = await devices.screenSources(); if (mounted.current) setScreenSources(list); })}>Parcourir</button></div>
          <label className="room-production__field"><span>Source de capture</span><MeewavSelect title={screenSources.find((source) => source.id === screenId)?.name || "Choisir un écran ou une fenêtre"} value={screenId} disabled={busy || restoringCameras} onChange={(event) => setScreenId(event.target.value)}><option value="">Choisir un écran ou une fenêtre</option>{screenSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || !screenId || sources.length >= 9 || sources.some((source) => source.captureId === screenId)} onClick={() => void run(previewScreen)}><Plus size={15} aria-hidden="true" />Ajouter à l’aperçu</button><small>Choisis ensuite la zone de cette capture sous l’aperçu. En quittant la préparation, la capture est libérée ; sélectionne-la à nouveau dans la Room.</small>
        </div> : null}
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Grip size={17} aria-hidden="true" /><strong>Sources vidéo</strong><span>{sources.length}</span></div>
          {sources.length ? <ol className="room-production__source-list">{sources.map((source) => <li key={source.id}>
            <label className="room-production__source-select"><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => updateScene({ ...scene, sourceIds: selectSceneSource(selectedSources, source.id, event.target.checked) })} /><span>{source.name || 'Source vidéo'}</span></label>
            <div className="room-production__source-actions"><button type="button" aria-label={`Retirer ${source.name}`} disabled={onAir && videoEngines?.program.program.sourceIds.includes(source.id)} onClick={() => removeSource(source.id)}><X size={14} /></button></div>
            <input className="room-production__source-name" aria-label={`Renommer ${source.name}`} value={source.name} onChange={(event) => setSources((current) => current.map((item) => item.id === source.id ? { ...item, name: event.target.value } : item))} />
          </li>)}</ol> : <p className="room-production__empty">Aucune source ajoutée. Choisis une caméra ou une fenêtre ci-dessus.</p>}
          <small>Affecte ensuite chaque caméra ou capture aux zones A, B… dans la disposition du plan.</small>
        </div>
        <div className="room-production__rack-group is-audio">
          <div className="room-production__group-heading"><Mic size={17} aria-hidden="true" /><strong>Micro et interface audio</strong><button type="button" disabled={busy || restoringCameras || starting || onAir} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels(); if (mounted.current) setInputs(list); })}>Détecter</button></div>
          <label className="room-production__field"><span>Micro / interface audio Windows</span><MeewavSelect value={microphoneId} disabled={busy || restoringCameras || starting || onAir} onChange={(event) => { meterCleanup.current?.(); meterCleanup.current = null; microphoneStream.current = null; setMicrophoneActive(false); setLevel(0); setMicrophoneId(event.target.value); }}><option value="">Choisir une entrée</option>{inputs.filter((input) => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || starting || onAir || !microphoneId} onClick={() => void run(previewMicrophone)}>Tester le micro</button>
          <div className="room-production__input-meter"><span>ENTRÉE</span><meter aria-label="Niveau du micro" min={0} max={1} high={0.9} value={level} /><strong>{level >= 0.98 ? 'SATURATION' : level > 0.01 ? 'SIGNAL' : 'SILENCE'}</strong></div>
          {microphoneActive ? <small>{audioFormat || 'Format du pilote indisponible'}</small> : null}
          <button type="button" disabled={!microphoneActive || onAir} aria-pressed={microphoneMuted} onClick={() => { const muted = !microphoneMuted; microphoneStream.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); setMicrophoneMuted(muted); }}>{microphoneMuted ? 'Réactiver l’essai privé' : 'Couper l’essai privé'}</button>
          <p className="room-production__routing">Cette entrée alimente <strong>Ma voix</strong> dans le Mixeur Meewav. Le gain, le mute, l’autotune, la reverb et la compression restent dans ce Mixeur.</p>
        </div>
        <div className="room-production__rack-group is-music">
          <div className="room-production__group-heading"><AudioLines size={17} aria-hidden="true" /><strong>Logiciel musical / instruments</strong><span>{musicActive ? 'Signal prêt' : 'Privé'}</span></div>
          <label className="room-production__field"><span>Entrée loopback ou virtuelle distincte du micro</span><MeewavSelect value={musicInputId} disabled={busy || restoringCameras || starting || onAir} onChange={(event) => { releaseMusicPreview(); setMusicInputId(event.target.value); }}><option value="">Aucune source musicale externe</option>{inputs.filter((input) => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId} disabled={input.deviceId === microphoneId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</MeewavSelect></label>
          <button type="button" className="room-production__add" disabled={busy || restoringCameras || starting || onAir || !musicInputId || musicInputId === microphoneId} onClick={() => void run(previewMusicInput)}>Brancher et mesurer la musique</button>
          <div className="room-production__input-meter"><span>MUSIQUE</span><meter aria-label="Niveau de la musique" min={0} max={1} high={0.9} value={musicLevel} /><strong>{musicLevel >= .98 ? 'SATURATION' : musicLevel > .01 ? 'SIGNAL' : 'SILENCE'}</strong></div>
          <p className="room-production__routing">Cette source utilise la ligne <strong>Musique</strong> du Mixeur Meewav. Son fader et son mute gardent le contrôle pendant le direct.</p>
        </div>
        <p className="room-production__midi-note"><strong>Clavier MIDI + logiciel musical</strong> Le MIDI commande ton logiciel ; il ne porte pas le son. Oriente la sortie du logiciel vers une entrée loopback/virtuelle Windows, puis branche-la ici. Le micro reste sur « Ma voix » avec autotune, reverb et compression dans le Mixeur Meewav. La capture d’une application isolée et ASIO ne sont pas encore disponibles.</p>
      </aside> : null}

      <div className="room-production__director">
        <div className="room-production__section-heading"><small>02 / RÉGIE VIDÉO</small><strong>Aperçu → Sortie</strong><span>Prépare le prochain plan à gauche. La sortie ne change que lorsque tu appliques une transition.</span></div>
        {videoEngines ? <>
          <div className="room-production__monitors">
            <article className="room-production__monitor is-preview"><div className="room-production__monitor-label"><span><i />APERÇU</span><small>Privé · prochain plan</small></div><VideoPreviewEditor scene={scene} onChange={updateScene}><SourcePreview stream={videoEngines.preview.stream} /></VideoPreviewEditor></article>
            <article className="room-production__monitor is-program"><div className="room-production__monitor-label"><span><i />SORTIE</span><small>{onAir ? publicationStatus === 'connected' ? 'Sortie transport connecté' : publicationStatus === 'failed' ? 'Transport indisponible' : 'Connexion au transport…' : 'Hors antenne'}</small></div><div className="room-production__monitor-frame"><SourcePreview stream={videoEngines.program.stream} />{!programReady && !onAir ? <div className="room-production__monitor-empty"><Video aria-hidden="true" /><strong>Prépare ta sortie</strong><span>Choisis une source dans l’aperçu, puis applique le plan.</span></div> : null}</div></article>
          </div>
          <div className="room-production__layout-panel"><strong>Disposition du plan</strong><div className="room-production__layouts">{layoutChoices.map((choice) => <button type="button" key={choice.id} className={layout === choice.id ? 'is-active' : ''} aria-pressed={layout === choice.id} onClick={() => updateScene({ ...scene, layout: choice.id, frames: choice.id === 'free' ? sceneFrames(scene) : scene.frames })}><span className={`room-production__layout-icon is-${choice.id}`} aria-hidden="true"><i /><i /><i /><i /></span><span>{choice.label}<small>{choice.detail}</small></span></button>)}</div><p className={missingSources ? 'room-production__layout-notice' : undefined} role="status">{missingSources ? `Affecte ${missingSources} source${missingSources > 1 ? 's' : ''} supplémentaire${missingSources > 1 ? 's' : ''} pour préparer ce plan. Les zones grisées restent privées.` : `${sceneFrames(scene).filter((_, index) => activeSourceIds[index]).length} source(s) dans le plan · La sortie reste inchangée jusqu’à la transition.`}</p><VideoSceneControls scene={scene} onChange={updateScene} sources={sources} /></div>
          <div className="room-production__transitions"><div><small>03 / TRANSITIONS</small><strong>Appliquer le plan à la sortie</strong></div>{(['TAKE', 'FADE'] as const).map((action) => <button key={action} type="button" disabled={missingSources > 0 || busy || restoringCameras} className={action === 'TAKE' ? 'is-primary' : ''} onClick={() => { try { videoEngines.program.take(scene, action === 'FADE' ? 500 : 0); setProgramReady(true); setError(''); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Transition impossible.'); } }}>{action === 'FADE' ? 'Fondu · 0,5 s' : 'Appliquer le plan'}</button>)}</div>
        </> : <p className="room-production__empty">La composition vidéo n’est pas disponible sur ce système.</p>}
      </div>
    </div>
    {busy || restoringCameras ? <p className="room-production__activity" role="status">{restoringCameras ? "Restauration des caméras…" : "Connexion à la source…"}</p> : null}
    {error ? <p className="room-production__error" role="alert">{error}</p> : null}
    {onAir && publicationStatus === 'failed' && transportError ? <p className="room-production__error" role="alert">{transportError}</p> : null}
    <footer className="room-production__footer">{stage === 'room' && !onAir ? <button type="button" className="is-primary" disabled={busy || restoringCameras || starting || !liveRoom || !programReady} onClick={startBroadcast}><Radio size={16} />{starting ? 'Connexion…' : 'Passer en direct'}</button> : stage === 'room' && onAir ? <button type="button" className="is-stop" onClick={() => { onStop(); releaseMusicPreview(); }}><Square size={16} />Arrêter la diffusion</button> : null}<button type="button" disabled={onAir || starting} onClick={stopCaptures}>Libérer les sources</button><small>{stage === 'launch' ? 'Préparation locale · aucune publication pendant le lancement' : !liveRoom ? 'Room de démonstration · aucune diffusion LIVE' : programReady ? 'Sortie prête' : 'Ajoute une source, puis applique le plan à la sortie'}</small></footer>
  </section>;
}
