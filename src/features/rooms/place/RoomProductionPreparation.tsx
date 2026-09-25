import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Camera, Grip, Mic, Monitor, Plus, Radio, Square, Video, X } from 'lucide-react';
import { useRuntime, type CaptureSource } from '../../../runtime/RuntimeProvider';
import { DesktopMediaDevices } from '../../../runtime/DesktopMediaDevices';
import { DesktopMusicSource } from '../../../runtime/DesktopMusicSource';
import { RoomVideoProgram, type VideoLayout, type VideoPosition } from '../../../runtime/RoomVideoProgram';
import { readRoomDevicePreferences, saveRoomDevicePreferences } from './roomDevicePreferences';
import type { RoomProductionSetup } from './roomProductionSetup';
import { sceneFrames, type VideoScene } from '../../../runtime/videoScene';
import { VideoPreviewEditor, VideoSceneControls } from './VideoSceneEditor';
import './room-production-preparation.css';

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

export default function RoomProductionPreparation({ roomId, liveRoom, onAir, publicationStatus, transportError, onStart, onStop, stage = 'room', initialSetup, onSetupChange }: {
  roomId: string; liveRoom: boolean; onAir: boolean; publicationStatus: string;
  transportError?: string | null;
  onStart: (program: MediaStream, musicSource: DesktopMusicSource | null) => boolean | void; onStop: () => void;
  stage?: 'launch' | 'room'; initialSetup?: RoomProductionSetup | null; onSetupChange?: (setup: RoomProductionSetup) => void;
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
  const [performanceMode, setPerformanceMode] = useState(false);
  const [videoEngines, setVideoEngines] = useState<{ preview: RoomVideoProgram; program: RoomVideoProgram } | null>(null);
  const enginesRef = useRef<typeof videoEngines>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>(() => initialSetup?.sourceKeys?.map(() => '') ?? []);
  const initialSlotKeys = useRef(initialSetup?.sourceKeys ?? []);
  const [sceneOptions, setSceneOptions] = useState<Pick<VideoScene, 'pipScale' | 'splitRatio' | 'frames' | 'fits'>>(() => ({ pipScale: initialSetup?.pipScale, splitRatio: initialSetup?.splitRatio, frames: initialSetup?.frames, fits: initialSetup?.fits }));
  const [layout, setLayout] = useState<VideoLayout>(() => initialSetup?.layout ?? 'full');
  const [pipPosition, setPipPosition] = useState<VideoPosition>(() => initialSetup?.pipPosition ?? { x: 0.973, y: 0.952 });
  const [programReady, setProgramReady] = useState(false);
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
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Vidéo indisponible.'); }
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
    captures.current.forEach((stream) => stream.getTracks().forEach((track) => track.stop()));
    captures.current.clear();
    releaseMusicPreview();
    meterCleanup.current?.(); meterCleanup.current = null;
    microphoneStream.current = null;
    enginesRef.current?.preview.clear(); enginesRef.current?.program.clear();
    if (mounted.current) { setSources([]); setSelectedSources([]); setProgramReady(false); setLevel(0); setMicrophoneActive(false); setMicrophoneMuted(false); }
  }, [releaseMusicPreview]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void devices.enumerate().then((list) => { if (mounted.current) setInputs(list); }).catch(() => undefined); };
    refresh();
    const unsubscribe = devices.watch(refresh);
    return () => { mounted.current = false; unsubscribe(); stopCaptures(); };
  }, [devices, roomId, stopCaptures]);

  const run = async (action: () => Promise<void>) => {
    setError(''); setBusy(true);
    try { await action(); }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Périphérique indisponible.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  const keepCapture = (stream: MediaStream, generation: number) => {
    if (!mounted.current || generation !== epoch.current) { stream.getTracks().forEach((track) => track.stop()); return false; }
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
    if (!keepCapture(stream, generation)) return;
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
    setMicrophoneActive(true); setMicrophoneMuted(false);
    const context = new AudioContext();
    try { await context.resume(); }
    catch (reason) {
      stream.getTracks().forEach((track) => track.stop()); captures.current.delete(stream);
      microphoneStream.current = null; setMicrophoneActive(false); await context.close(); throw reason;
    }
    if (generation !== epoch.current || !mounted.current) { stream.getTracks().forEach((track) => track.stop()); await context.close(); return; }
    const analyser = context.createAnalyser(); analyser.fftSize = 512;
    const input = context.createMediaStreamSource(stream); input.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      setLevel(Math.min(1, Math.max(...samples.map(Math.abs))));
    }, 80);
    meterCleanup.current = () => { clearInterval(timer); input.disconnect(); stream.getTracks().forEach((track) => track.stop()); captures.current.delete(stream); microphoneStream.current = null; void context.close(); };
  };
  const previewMusicInput = async () => {
    releaseMusicPreview();
    const generation = epoch.current;
    const stream = await devices.captureMicrophone(musicInputId);
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
      track.addEventListener('ended', () => { if (musicSource.current === activeSource) releaseMusicPreview(); }, { once: true });
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
    if (!keepCapture(stream, generation)) return;
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
  const layoutChoices: Array<{ id: VideoLayout; label: string; detail: string }> = [
    { id: 'full', label: 'Plein écran', detail: '1 source' },
    { id: 'split', label: 'Split A/B', detail: '2 sources' },
    { id: 'pip', label: 'Incrustation', detail: 'Déplaçable' },
    { id: 'grid', label: 'Grille', detail: 'Jusqu’à 9' },
    { id: 'free', label: 'Libre', detail: 'Déplacer / redimensionner' },
  ];
  const missingSources = layout === 'split' || layout === 'pip' ? [0, 1].filter((index) => !activeSourceIds[index]).length : sceneFrames(scene).some((_, index) => activeSourceIds[index]) ? 0 : 1;
  return <section className="room-production" aria-label={stage === 'launch' ? 'Studio Meewav · préparation de la Room' : 'Production de la Room'} data-room-id={roomId}>
    <header className="room-production__hero">
      <span className="room-production__hero-icon"><Video size={23} aria-hidden="true" /></span>
      <div><small>{stage === 'launch' ? 'SÉQUENCEUR DE LANCEMENT / STUDIO' : 'ROOM HOST / PRODUCTION'}</small><h3>{stage === 'launch' ? 'Studio Meewav' : 'Régie du direct'}</h3><p>Branche tes sources, compose en Preview, puis décide ce qui passe dans Program.</p></div>
      <span className={`room-production__status${onAir && publicationStatus === 'connected' ? ' is-live' : ''}`}><i />{stage === 'launch' ? 'PRÉPARATION PRIVÉE' : onAir ? publicationStatus === 'connected' ? 'TRANSPORT CONNECTÉ' : publicationStatus === 'failed' ? 'CONNEXION IMPOSSIBLE' : 'CONNEXION…' : 'HORS ANTENNE'}</span>
      {stage === 'room' ? <button type="button" className="room-production__mode" onClick={() => setPerformanceMode((value) => !value)}>{performanceMode ? 'Mode préparation' : 'Mode performance'}</button> : null}
    </header>

    <div className={`room-production__workspace${performanceMode ? ' is-performance' : ''}`}>
      {!performanceMode ? <aside className="room-production__rack" aria-label="Sources de production">
        <div className="room-production__section-heading"><small>01 / SOURCE RACK</small><strong>Construire le plateau</strong><span>Chaque source reste privée jusqu’à TAKE.</span></div>
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Camera size={17} aria-hidden="true" /><strong>Caméras</strong><button type="button" disabled={busy} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels('video'); if (mounted.current) setInputs(list); })}>Détecter</button></div>
          <label className="room-production__field"><span>Périphérique vidéo</span><select title={inputs.find((input) => input.deviceId === cameraId)?.label || "Choisir une caméra"} value={cameraId} onChange={(event) => setCameraId(event.target.value)}><option value="">Choisir une caméra</option>{inputs.filter((input) => input.kind === 'videoinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId}>{input.label || `Caméra ${index + 1}`}</option>)}</select></label>
          <button type="button" className="room-production__add" disabled={busy || !cameraId || sources.length >= 9 || sources.some((source) => source.deviceId === cameraId)} onClick={() => void run(previewCamera)}><Plus size={15} aria-hidden="true" />{sources.some((source) => source.deviceId === cameraId) ? "Caméra déjà ajoutée" : "Ajouter cette caméra"}</button>
          <small>Ajoute plusieurs caméras, y compris les cartes d’acquisition exposées par Windows.</small>
        </div>
        {runtime.canCaptureWindow ? <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Monitor size={17} aria-hidden="true" /><strong>Écran et fenêtre</strong><button type="button" disabled={busy} onClick={() => void run(async () => setScreenSources(await devices.screenSources()))}>Parcourir</button></div>
          <label className="room-production__field"><span>Source de capture</span><select title={screenSources.find((source) => source.id === screenId)?.name || "Choisir un écran ou une fenêtre"} value={screenId} onChange={(event) => setScreenId(event.target.value)}><option value="">Choisir un écran ou une fenêtre</option>{screenSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
          <button type="button" className="room-production__add" disabled={busy || !screenId || sources.length >= 9 || sources.some((source) => source.captureId === screenId)} onClick={() => void run(previewScreen)}><Plus size={15} aria-hidden="true" />Ajouter à Preview</button><small>Choisis ensuite la zone de cette capture sous Preview. En quittant la préparation, la capture est libérée ; sélectionne-la à nouveau dans la Room.</small>
        </div> : null}
        <div className="room-production__rack-group">
          <div className="room-production__group-heading"><Grip size={17} aria-hidden="true" /><strong>Sources vidéo</strong><span>{sources.length}</span></div>
          {sources.length ? <ol className="room-production__source-list">{sources.map((source) => <li key={source.id}>
            <label className="room-production__source-select"><input type="checkbox" checked={selectedSources.includes(source.id)} onChange={(event) => updateScene({ ...scene, sourceIds: event.target.checked ? [...selectedSources, source.id] : selectedSources.map((id) => id === source.id ? '' : id) })} /><span>{source.name || 'Source vidéo'}</span></label>
            <div className="room-production__source-actions"><button type="button" aria-label={`Retirer ${source.name}`} disabled={onAir && videoEngines?.program.program.sourceIds.includes(source.id)} onClick={() => removeSource(source.id)}><X size={14} /></button></div>
            <input className="room-production__source-name" aria-label={`Renommer ${source.name}`} value={source.name} onChange={(event) => setSources((current) => current.map((item) => item.id === source.id ? { ...item, name: event.target.value } : item))} />
          </li>)}</ol> : <p className="room-production__empty">Aucune source ajoutée. Choisis une caméra ou une fenêtre ci-dessus.</p>}
          <small>Affecte ensuite chaque caméra ou capture aux zones A, B… dans la disposition du plan.</small>
        </div>
        <div className="room-production__rack-group is-audio">
          <div className="room-production__group-heading"><Mic size={17} aria-hidden="true" /><strong>Audio I/O</strong><button type="button" disabled={busy || onAir} onClick={() => void run(async () => { const list = await devices.requestDeviceLabels(); if (mounted.current) setInputs(list); })}>Détecter</button></div>
          <label className="room-production__field"><span>Micro / interface audio Windows</span><select value={microphoneId} disabled={onAir} onChange={(event) => { meterCleanup.current?.(); meterCleanup.current = null; microphoneStream.current = null; setMicrophoneActive(false); setLevel(0); setMicrophoneId(event.target.value); }}><option value="">Choisir une entrée</option>{inputs.filter((input) => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</select></label>
          <button type="button" className="room-production__add" disabled={busy || onAir || !microphoneId} onClick={() => void run(previewMicrophone)}>Mesurer l’entrée privée</button>
          <div className="room-production__input-meter"><span>ENTRÉE</span><meter min={0} max={1} high={0.9} value={level} /><strong>{level >= 0.98 ? 'SATURATION' : level > 0.01 ? 'SIGNAL' : 'SILENCE'}</strong></div>
          {microphoneActive ? <small>{audioFormat || 'Format du pilote indisponible'}</small> : null}
          <button type="button" disabled={!microphoneActive || onAir} aria-pressed={microphoneMuted} onClick={() => { const muted = !microphoneMuted; microphoneStream.current?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); setMicrophoneMuted(muted); }}>{microphoneMuted ? 'Réactiver l’essai privé' : 'Couper l’essai privé'}</button>
          <p className="room-production__routing">Cette entrée alimente <strong>Ma voix</strong> dans le Mixeur Meewav. Le gain, le mute, l’autotune, la reverb et la compression restent dans ce Mixeur.</p>
        </div>
        <div className="room-production__rack-group is-music">
          <div className="room-production__group-heading"><AudioLines size={17} aria-hidden="true" /><strong>Logiciel musical / instruments</strong><span>{musicActive ? 'Signal prêt' : 'Privé'}</span></div>
          <label className="room-production__field"><span>Entrée loopback ou virtuelle distincte du micro</span><select value={musicInputId} disabled={onAir} onChange={(event) => { releaseMusicPreview(); setMusicInputId(event.target.value); }}><option value="">Aucune source musicale externe</option>{inputs.filter((input) => input.kind === 'audioinput').map((input, index) => <option key={input.deviceId || index} value={input.deviceId} disabled={input.deviceId === microphoneId}>{input.label || `Entrée audio ${index + 1}`}</option>)}</select></label>
          <button type="button" className="room-production__add" disabled={busy || onAir || !musicInputId || musicInputId === microphoneId} onClick={() => void run(previewMusicInput)}>Brancher et mesurer la musique</button>
          <div className="room-production__input-meter"><span>MUSIQUE</span><meter min={0} max={1} high={0.9} value={musicLevel} /><strong>{musicLevel >= .98 ? 'SATURATION' : musicLevel > .01 ? 'SIGNAL' : 'SILENCE'}</strong></div>
          <p className="room-production__routing">Cette source utilise la ligne <strong>Musique</strong> du Mixeur Meewav. Son fader et son mute gardent le contrôle pendant le direct.</p>
        </div>
        <p className="room-production__midi-note"><strong>Clavier MIDI + logiciel musical</strong> Le MIDI commande ton logiciel ; il ne porte pas le son. Oriente la sortie du logiciel vers une entrée loopback/virtuelle Windows, puis branche-la ici. Le micro reste sur « Ma voix » avec autotune, reverb et compression dans le Mixeur Meewav. La capture d’une application isolée et ASIO ne sont pas encore disponibles.</p>
      </aside> : null}

      <div className="room-production__director">
        <div className="room-production__section-heading"><small>02 / RÉGIE VIDÉO</small><strong>Preview → Program</strong><span>Modifier Preview ne change jamais Program sans CUT, TAKE ou FADE.</span></div>
        {videoEngines ? <>
          <div className="room-production__monitors">
            <article className="room-production__monitor is-preview"><div className="room-production__monitor-label"><span><i />PREVIEW</span><small>Privé · prochain plan</small></div><VideoPreviewEditor scene={scene} onChange={updateScene}><SourcePreview stream={videoEngines.preview.stream} /></VideoPreviewEditor></article>
            <article className="room-production__monitor is-program"><div className="room-production__monitor-label"><span><i />PROGRAM</span><small>{onAir ? publicationStatus === 'connected' ? 'Sortie transport connecté' : publicationStatus === 'failed' ? 'Transport indisponible' : 'Connexion au transport…' : 'Hors antenne'}</small></div><div className="room-production__monitor-frame"><SourcePreview stream={videoEngines.program.stream} /></div></article>
          </div>
          <div className="room-production__layout-panel"><strong>Disposition du plan</strong><div className="room-production__layouts">{layoutChoices.map((choice) => <button type="button" key={choice.id} className={layout === choice.id ? 'is-active' : ''} aria-pressed={layout === choice.id} onClick={() => updateScene({ ...scene, layout: choice.id, frames: choice.id === 'free' ? sceneFrames(scene) : scene.frames })}><span className={`room-production__layout-icon is-${choice.id}`} aria-hidden="true"><i /><i /><i /><i /></span><span>{choice.label}<small>{choice.detail}</small></span></button>)}</div><p className={missingSources ? 'room-production__layout-notice' : undefined} role="status">{missingSources ? `Ajoute et coche ${missingSources} source${missingSources > 1 ? 's' : ''} supplémentaire${missingSources > 1 ? 's' : ''} pour préparer ce plan. Les zones grisées restent privées.` : `${sceneFrames(scene).filter((_, index) => activeSourceIds[index]).length} source(s) dans le plan · Program reste inchangé jusqu’à la transition.`}</p><VideoSceneControls scene={scene} onChange={updateScene} sources={sources} /></div>
          <div className="room-production__transitions"><div><small>03 / TRANSITIONS</small><strong>À l’antenne sur commande</strong></div>{(['CUT', 'TAKE', 'FADE'] as const).map((action) => <button key={action} type="button" disabled={missingSources > 0} className={action === 'TAKE' ? 'is-primary' : ''} onClick={() => { try { videoEngines.program.take(scene, action === 'FADE' ? 500 : 0); setProgramReady(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Transition impossible.'); } }}>{action}</button>)}</div>
        </> : <p className="room-production__empty">La composition vidéo n’est pas disponible sur ce système.</p>}
      </div>
    </div>
    {error ? <p className="room-production__error" role="alert">{error}</p> : null}
    {onAir && publicationStatus === 'failed' && transportError ? <p className="room-production__error" role="alert">{transportError}</p> : null}
    <footer className="room-production__footer">{stage === 'room' && !onAir ? <button type="button" className="is-primary" disabled={busy || !liveRoom || !programReady} onClick={() => { if (!videoEngines) return; if (musicInputId && (!musicSource.current || musicSource.current.track.readyState !== 'live')) { setError('Rebranche et mesure la source musicale avant le direct.'); return; } if (musicInputId && musicInputId === microphoneId) { setError('Choisis deux entrées distinctes pour la voix et la musique.'); return; } const accepted = onStart(videoEngines.program.stream, musicSource.current); if (accepted === false) return; saveRoomDevicePreferences({ cameraId, microphoneId }); meterCleanup.current?.(); meterCleanup.current = null; setMicrophoneActive(false); setLevel(0); }}><Radio size={16} />Passer en direct</button> : stage === 'room' && onAir ? <button type="button" className="is-stop" onClick={() => { onStop(); stopCaptures(); }}><Square size={16} />Arrêter la diffusion</button> : null}<button type="button" disabled={onAir} onClick={stopCaptures}>Libérer les aperçus</button><small>{stage === 'launch' ? 'Préparation locale · aucune publication pendant le lancement' : !liveRoom ? 'Room de démonstration · aucune diffusion LIVE' : programReady ? 'Program préparé' : 'Choisis une source, puis effectue TAKE'}</small></footer>
  </section>;
}
