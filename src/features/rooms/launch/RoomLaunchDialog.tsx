import { getDesktopApplicationMode } from "../../../runtime/applicationMode";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, X, Radio, Check, Armchair, UsersRound, AudioLines, Swords, GraduationCap, MicVocal, UserRound } from "lucide-react";
import RoomLaunchConfirmation from "./RoomLaunchConfirmation";
import GreenHouse from "../place/GreenHouse";
import CageLaunchDialog from "./CageLaunchDialog";
import { createRoomLaunchSession, defaultRoomLaunch, ROOM_LAUNCH_SPECS, validateRoomLaunch, validateRoomLaunchIdentity, type RoomLaunchConfiguration } from "./roomLaunch";
import WaveLaunchBaseInput, { waveLaunchDuration, type WaveLaunchFormat } from "./WaveLaunchBaseInput";
import { measureWaveAudio } from "../tools/waveAudioRules";
import { validateWaveAudienceFile } from "../tools/audience/waveAudienceUpload.service";
import { removeRoomLaunchAudio, saveRoomLaunchAudio } from "./roomLaunchAudio";
import type { RoomsHomeRoomType } from "../home/roomsHome.types";
import "./room-launch.css";
import "./room-launch-picker.css";
import "./desktop-launch.css";
import { useRuntime } from '../../../runtime/RuntimeProvider';
import { createLiveCage, createLivePlace } from './createLiveRoom';
import RoomProductionPreparation, { type RoomProductionReadiness } from '../place/RoomProductionPreparation';
import { saveRoomProductionSetup, type RoomProductionSetup } from '../place/roomProductionSetup';

const ROOM_LAUNCH_ICONS = { loge: Armchair, place: UsersRound, wave: AudioLines, cage: Swords, classe: GraduationCap, scene: MicVocal };

export default function RoomLaunchDialog({ closeRef, onClose, initialType, fromProfile = false }: { closeRef: RefObject<HTMLButtonElement | null>; onClose: () => void; initialType?: RoomsHomeRoomType; fromProfile?: boolean }) {
  const navigate = useNavigate();
  const runtime = useRuntime();
  const liveRequestId = useRef<string | null>(null);
  const [type, setType] = useState<RoomsHomeRoomType | null>(fromProfile ? "cage" : null);
  const [config, setConfig] = useState<RoomLaunchConfiguration>(() => defaultRoomLaunch(initialType && initialType !== "cage" ? initialType : "place"));
  const [step, setStep] = useState(0);
  const [studioSetup, setStudioSetup] = useState<RoomProductionSetup | null>(null);
  const [studioSaved, setStudioSaved] = useState(false);
  const [studioReadiness, setStudioReadiness] = useState<RoomProductionReadiness>({ video: false, microphone: false, music: false, pending: false });
  const [networkAvailable, setNetworkAvailable] = useState(() => navigator.onLine);
  useEffect(() => {
    const changed = () => setNetworkAvailable(navigator.onLine);
    window.addEventListener('online', changed); window.addEventListener('offline', changed);
    return () => { window.removeEventListener('online', changed); window.removeEventListener('offline', changed); };
  }, []);
  const desktopStudio = runtime.canPrepareHostRoom;
  const simpleCage = desktopStudio && type === 'cage' && !fromProfile;
  const studioStep = desktopStudio ? simpleCage ? 1 : 2 : -1;
  const settingsStep = 1;
  const summaryStep = desktopStudio ? -1 : 2;
  const greenStep = simpleCage ? 2 : 3;
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [baseFile, setBaseFile] = useState<File | null>(null);
  const [baseFormat, setBaseFormat] = useState<WaveLaunchFormat>(8);
  const [readingAudio, setReadingAudio] = useState(false);
  const audioRequest = useRef(0);
  const previewUrl = useRef("");
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; audioRequest.current++; if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }; }, []);
  const clearBase = () => {
    audioRequest.current++;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = ""; setBaseFile(null); setReadingAudio(false);
    setConfig((current) => ({ ...current, baseLoop: undefined }));
  };
  const importBase = async (file: File) => {
    clearBase(); const request = audioRequest.current; setError(""); setReadingAudio(true);
    try {
      const mimeType = validateWaveAudienceFile(file, "base");
      const durationSeconds = await measureWaveAudio(file);
      if (request !== audioRequest.current) return;
      previewUrl.current = URL.createObjectURL(file); setBaseFile(file);
      setConfig((current) => ({ ...current, baseLoop: {
        title: file.name.replace(/\.[^.]+$/, ""), fileName: file.name, fileSize: file.size, mimeType,
        mediaUrl: previewUrl.current, durationSeconds, format: baseFormat === "long" ? "long" : "loop",
        bars: baseFormat === "long" ? 8 : baseFormat, bpm: Number(current.values.bpm), key: String(current.values.key), kind: "Base",
      } }));
    } catch (reason) {
      if (request === audioRequest.current) setError(reason instanceof Error && reason.message.startsWith("wave_file_") ? "Choisis un fichier audio valide de 64 Mo maximum." : reason instanceof Error ? reason.message : "Import impossible.");
    } finally { if (request === audioRequest.current) setReadingAudio(false); }
  };
  const changeBaseFormat = (format: WaveLaunchFormat) => {
    setBaseFormat(format);
    setConfig((current) => ({ ...current, baseLoop: current.baseLoop ? { ...current.baseLoop, format: format === "long" ? "long" : "loop", bars: format === "long" ? 8 : format } : undefined }));
  };
  const spec = ROOM_LAUNCH_SPECS[config.roomType];
  const setValue = (id: string, value: string | number | boolean) => setConfig((current) => ({ ...current, values: { ...current.values, [id]: value } }));
  const choose = (next: RoomsHomeRoomType) => { clearBase(); setBaseFormat(8); setType(next); setError(""); setStep(0); setStudioSetup(null); setStudioSaved(false); setStudioReadiness({ video: false, microphone: false, music: false, pending: false }); setConfig(defaultRoomLaunch(next)); };
  const openDemoHost = (id: RoomsHomeRoomType) => {
    if (getDesktopApplicationMode() === "live" || (!import.meta.env.DEV && getDesktopApplicationMode() !== "demo")) return;
    onClose();
    navigate(`/rooms/${id}?demoRole=host&source=launch-preview&demoSession=${crypto.randomUUID()}`, { state: { roomsHomeReturnTo: "/rooms/home" } });
  };
  const launch = async () => {
    if (opening) return;
    const invalid = validateRoomLaunch(config);
    if (invalid) { setError(invalid); return; }
    if (simpleCage && config.access === 'public' && (!studioReadiness.video || (!studioReadiness.microphone && !studioReadiness.music) || studioReadiness.pending || !networkAvailable)) {
      setError('Retourne au Studio pour vérifier la vidéo et le son, puis vérifie ta connexion.'); return;
    }
    if (simpleCage && config.access !== 'public') {
      try {
        const session = createRoomLaunchSession(config);
        if (studioSetup) saveRoomProductionSetup(session.id, studioSetup);
        setStudioSaved(true);
      } catch { setError('La préparation n’a pas pu être enregistrée sur cet appareil. Elle reste ouverte pour réessayer.'); }
      return;
    }
    if (getDesktopApplicationMode() !== 'demo' && runtime.canPrepareHostRoom && (config.roomType === 'place' || simpleCage)) {
      setOpening(true);
      liveRequestId.current ??= crypto.randomUUID();
      try {
        const id = await (simpleCage ? createLiveCage : createLivePlace)(config, liveRequestId.current);
        if (mounted.current) { if (studioSetup) saveRoomProductionSetup(id, studioSetup); onClose(); navigate(`/rooms/${config.roomType}?room=${encodeURIComponent(id)}`); }
      } catch (reason) {
        if (mounted.current) { setOpening(false); setError(reason instanceof Error ? reason.message : 'Création LIVE non confirmée. Réessaie pour reprendre la même Room.'); }
      }
      return;
    }
        if (getDesktopApplicationMode() === "live" || (!import.meta.env.DEV && getDesktopApplicationMode() !== "demo")) { setError("L’ouverture de cette room en production n’est pas encore disponible."); return; }
        setOpening(true);
        let storedPath: string | undefined;
        try {
          let ready = config;
          if (config.roomType === "wave") {
            if (!baseFile || !config.baseLoop) throw new Error("Importe une boucle de base pour ouvrir la Wave.");
            storedPath = await saveRoomLaunchAudio(baseFile);
            if (!mounted.current) { await removeRoomLaunchAudio(storedPath); return; }
            ready = { ...config, baseLoop: { ...config.baseLoop, bpm: Number(config.values.bpm), key: String(config.values.key), mediaUrl: undefined, mediaPath: storedPath } };
          }
          const session = createRoomLaunchSession(ready);
          if (studioSetup) saveRoomProductionSetup(session.id, studioSetup);
          navigate(`/rooms/${config.roomType}?launchSession=${session.id}&demoRole=host`);
        } catch (reason) {
          if (storedPath) await removeRoomLaunchAudio(storedPath).catch(() => undefined);
          if (mounted.current) { setOpening(false); setError(reason instanceof Error ? reason.message : "Impossible de préparer la session."); }
        }
  };
  if (type === "cage" && !simpleCage) return <div className={`room-launch-cage${desktopStudio ? " is-desktop-sequence" : ""}`}><CageLaunchDialog onBack={() => setType(null)} closeRef={closeRef} onClose={onClose} fromProfile={fromProfile} /></div>;
  if (studioSaved) return <section className="room-launch room-launch__saved" role="dialog" aria-modal="true" aria-labelledby="saved-studio-title"><header><Check aria-hidden="true" /><div><h2 id="saved-studio-title">Ton Studio est prêt</h2><p>Ta préparation est enregistrée sur cet appareil. Aucune Room n’a été publiée.</p></div><button ref={closeRef} onClick={onClose} aria-label="Fermer le lancement"><X /></button></header><footer><button onClick={() => { setStudioSaved(false); setStep(studioStep); }}>Revenir au Studio</button><button onClick={onClose}>Terminer</button></footer></section>;
  return <section className={`room-launch${desktopStudio ? " is-desktop-sequence" : ""}${!type ? " is-room-picker" : ""}${desktopStudio && step === studioStep ? " is-studio-step" : ""}`} role="dialog" aria-modal="true" aria-labelledby="room-launch-title" onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([hidden]), select:not(:disabled), textarea:not(:disabled)'));
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header><span><Radio /></span><div><small>OUVRIR UN DIRECT</small><h2 id="room-launch-title">{type ? spec.label : "Quel espace veux-tu ouvrir ?"}</h2><p>{type ? spec.description : "Six univers, une régie commune."}</p></div><button ref={closeRef} onClick={onClose} aria-label="Fermer le lancement"><X /></button></header>
    {!type ? <div className="room-launch__types">{(["loge", "place", "wave", "cage", "classe", "scene"] as const).map((id) => {
      const Icon = ROOM_LAUNCH_ICONS[id];
      const label = id === "cage" ? "La Cage" : ROOM_LAUNCH_SPECS[id].label;
      return <article key={id} className="room-launch__type-card" data-room-type={id}>
        <button className={`room-launch__choose${initialType === id ? " is-suggested" : ""}`} onClick={() => choose(id)}>
          <span className="room-launch__room-icon" aria-hidden="true">{id === "wave" ? <svg viewBox="0 0 40 40"><path d="M3 25c5-16 11-17 19-8 6 7 10 7 15-2-3 17-10 18-19 9-6-6-10-6-15 1Z" fill="currentColor" stroke="none" /></svg> : <Icon />}</span>
          <span className="room-launch__room-copy"><strong>{label}</strong><span>{ROOM_LAUNCH_SPECS[id].description}</span></span>
          <span className="room-launch__room-arrow" aria-hidden="true"><ArrowRight /></span>
        </button>
        {getDesktopApplicationMode() !== "live" && (import.meta.env.DEV || getDesktopApplicationMode() === "demo") ? <>
          <button type="button" className="room-launch__preview-badge" aria-label={`Provisoire · accès direct host · ${label}`} title={`Ouvrir directement ${label} sans préparation`} onClick={() => openDemoHost(id)}><i aria-hidden="true" />Provisoire</button>
          <button type="button" className="room-launch__direct" aria-label={`Accès direct host · ${label}`} onClick={() => openDemoHost(id)}><UserRound aria-hidden="true" /><span>Accès direct host</span></button>
        </> : null}
      </article>;
    })}</div> : <>
      <nav className="room-launch__steps" aria-label="Étapes de lancement">{(simpleCage ? ["Ta Cage", "Studio Meewav", "Vérification"] : desktopStudio ? ["Identité", "Configuration", "Studio Meewav", "Lancement"] : ["Identité", "Réglages", "Résumé", "Green Room"]).map((label, i) => <span key={label} aria-current={step === i ? "step" : undefined} className={step === i ? "is-active" : ""}>{i < step ? <Check /> : <b>{i + 1}</b>}{label}</span>)}</nav>
      {desktopStudio && type && step === studioStep ? <div className="room-launch__studio"><RoomProductionPreparation
        key={type} roomId={`launch:${type}`} liveRoom={false} onAir={false} publicationStatus="disconnected"
        stage="launch" initialSetup={studioSetup} onSetupChange={setStudioSetup} onReadinessChange={setStudioReadiness}
        onStart={() => undefined} onStop={() => undefined}
      /></div> : null}
      <div className="room-launch__body">
        {step === 0 ? <><label>Titre du direct<input autoComplete="off" maxLength={100} value={config.title} onChange={(e) => setConfig({ ...config, title: e.target.value })} placeholder={`Mon rendez-vous dans ${spec.label}`} /></label><label>Présentation<textarea maxLength={500} value={config.description} onChange={(e) => setConfig({ ...config, description: e.target.value })} /></label>{simpleCage ? <label className="is-toggle"><input type="checkbox" checked={config.access === "public"} onChange={(event) => setConfig({ ...config, access: event.target.checked ? "public" : "invitation" })} /><span>Room publique<small style={{ display: "block", letterSpacing: 0 }}>Visible dans le lobby · désactive pour conserver uniquement le Studio</small></span></label> : <label>Accès<select value={config.access} onChange={(e) => setConfig({ ...config, access: e.target.value as RoomLaunchConfiguration["access"] })}><option value="public">Public</option><option value="members">Membres</option><option value="invitation">Sur invitation</option></select></label>}</> : null}
        {step === settingsStep ? spec.fields.map((field) => <label key={field.id} className={field.kind === "boolean" ? "is-toggle" : ""}>{field.kind === "boolean" ? <input type="checkbox" checked={Boolean(config.values[field.id])} onChange={(e) => setValue(field.id, e.target.checked)} /> : null}<span>{field.label}</span>{field.kind === "text" || field.kind === "number" ? <input type={field.kind} min={field.min} max={field.max} value={String(config.values[field.id])} onChange={(e) => setValue(field.id, field.kind === "number" ? Number(e.target.value) : e.target.value)} /> : field.kind === "textarea" ? <textarea maxLength={4000} value={String(config.values[field.id])} onChange={(e) => setValue(field.id, e.target.value)} /> : field.kind === "select" ? <select value={String(config.values[field.id])} onChange={(e) => setValue(field.id, e.target.value)}>{field.options?.map((value) => <option key={value}>{value}</option>)}</select> : null}</label>) : null}
        {step === summaryStep ? <><h3>{config.title}</h3><p>{config.description || spec.description}</p><dl><div><dt>Accès</dt><dd>{{ public: "Public", members: "Membres", invitation: "Sur invitation" }[config.access]}</dd></div>{spec.fields.map((field) => <div key={field.id}><dt>{field.label}</dt><dd>{typeof config.values[field.id] === "boolean" ? config.values[field.id] ? "Oui" : "Non" : String(config.values[field.id]) || "À compléter dans la régie"}</dd></div>)}</dl><p className="room-launch__note">{desktopStudio ? 'Studio Meewav préparé. Vérifie la connexion et les autorisations avant de créer la Room.' : 'Vérifie ensuite ton micro, ta caméra et ta connexion dans ta Green Room privée, avant d’ouvrir la régie.'}</p></> : null}
        {step === settingsStep && type === "wave" ? <><p>Instruments : {config.values.maxSubmissionBars} mesures maximum à {config.values.bpm} BPM. Voix / a cappella : jusqu’à 16 mesures. Ta base peut être plus longue et évoluer pendant la Wave.</p><WaveLaunchBaseInput base={config.baseLoop} format={baseFormat} bpm={Number(config.values.bpm)} loading={readingAudio} onFile={(file) => { void importBase(file); }} onFormat={changeBaseFormat} onRemove={clearBase} /></> : null}
        {step === summaryStep && config.baseLoop ? <div className="wave-launch-base__summary"><Check /><span><strong>{config.baseLoop.fileName}</strong><small>{config.baseLoop.format === "long" ? "Son long" : `${config.baseLoop.bars} mesures`} · {waveLaunchDuration(config.baseLoop.durationSeconds!)} · Base prête</small><small>Instruments : {config.values.maxSubmissionBars} mesures max. · Voix : 16 mesures max.</small></span></div> : null}
        {step === greenStep ? desktopStudio ? <RoomLaunchConfirmation
          title={config.title} pending={opening} onLaunch={launch}
          disabled={simpleCage && config.access === 'public' && (!studioReadiness.video || (!studioReadiness.microphone && !studioReadiness.music) || !networkAvailable || studioReadiness.pending)}
          buttonLabel={simpleCage ? config.access !== 'public' ? 'Valider mon Studio' : getDesktopApplicationMode() === 'demo' ? 'Ouvrir la Cage démo' : 'Ouvrir la Cage' : config.roomType === 'place' ? 'Créer ma Room LIVE' : 'Ouvrir la préparation DEMO'}
          description={simpleCage ? config.access !== 'public' ? 'Ton Studio sera conservé sans publier de Room.' : 'Commence avec ton public, puis invite les combattants depuis les Coulisses.' : config.roomType === 'place'
            ? 'Ta Room sera ouverte en LIVE public. Tu gardes la main sur le départ de la diffusion dans la régie.'
            : 'Ouvre ta Room de démonstration avec la configuration et les sources préparées. Ce parcours ne publie pas de direct LIVE.'}
        >{simpleCage ? <ul className="room-launch__preflight" aria-label="Vérifications du Studio">
          <li data-ready={studioReadiness.video}><span>Composition vidéo</span><strong>{studioReadiness.video ? 'Vérifiée dans le Studio' : 'À préparer dans le Studio'}</strong></li>
          <li data-ready={studioReadiness.microphone || studioReadiness.music}><span>Entrée audio</span><strong>{studioReadiness.microphone || studioReadiness.music ? 'Testée dans le Studio' : 'À tester dans le Studio'}</strong></li>
          <li data-ready={networkAvailable}><span>Réseau</span><strong>{networkAvailable ? 'Disponible · connexion au lancement' : 'Hors ligne'}</strong></li>
        </ul> : null}</RoomLaunchConfirmation> : <GreenHouse host readyLabel="Ouvrir ma régie" onReady={launch} /> : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>
      <footer><button disabled={opening} onClick={() => { setError(""); if (step === 0) setType(null); else setStep(step - 1); }}><ArrowLeft />Retour</button>{step < greenStep ? <button className="is-primary" disabled={opening || readingAudio || (step >= settingsStep && type === "wave" && !baseFile)} onClick={async () => {
        const invalid = step === 0 ? validateRoomLaunchIdentity(config) : step === studioStep ? null : validateRoomLaunch(config); if (invalid) { setError(invalid); return; }
        setError(""); setStep(step + 1);

      }}>{simpleCage ? step === 0 ? 'Ouvrir le Studio' : 'Vérifier le direct' : step === summaryStep ? desktopStudio ? 'Vérifications finales' : "Régler mon matériel" : "Continuer"}<ArrowRight /></button> : null}</footer>
    </>}
  </section>;
}

