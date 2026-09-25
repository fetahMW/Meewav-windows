import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { AudioLines, Camera, CircleCheck, LogOut, Radio, ShieldCheck, Square } from "lucide-react";
import { useAuth } from "../auth";
import GreenHouse from "../rooms/place/GreenHouse";
import { supabase } from "../../lib/supabaseClient";
import { StudioMediaEngine } from "./StudioMediaEngine";
import meewavLogo from "./assets/meewav-logo.svg";
import "../rooms/place/place-studio-chassis.css";
import "../rooms/place/place-studio-black-lacquer.css";
import "../rooms/place/place-mixer-reference.css";
import "./studio.css";

function StudioVideo({ stream }: { stream: MediaStream | null }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    element.srcObject = stream;
    if (stream) void element.play().catch(() => undefined);
    return () => { element.srcObject = null; };
  }, [stream]);
  return stream
    ? <video ref={video} autoPlay muted playsInline aria-label="Aperçu caméra local" />
    : <div className="studio-empty"><Camera size={36} /><span>Active ta caméra pour cadrer ton image.</span></div>;
}

function StudioMicrophoneMeter({ stream }: { stream: MediaStream | null }) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) { setLevel(0); return; }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const interval = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let energy = 0;
      for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
      setLevel(Math.min(100, Math.sqrt(energy / samples.length) * 400));
    }, 90);
    return () => { window.clearInterval(interval); source.disconnect(); void context.close(); };
  }, [stream]);
  return <div className="studio-meter"><AudioLines size={18} /><span>Micro</span><meter min={0} max={100} value={level} aria-label="Niveau du microphone local" /><strong>{level > 95 ? "Niveau fort" : level > 4 ? "Signal" : "Silence"}</strong></div>;
}

export default function StudioPage() {
  const auth = useAuth();
  const [engine] = useState(() => new StudioMediaEngine());
  const media = useSyncExternalStore(engine.subscribe, engine.getSnapshot);
  const [stage, setStage] = useState<"preflight" | "studio">("preflight");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => () => { void engine.stop(); }, [engine]);
  useEffect(() => {
    if (auth.status !== "authenticated") {
      void engine.stop();
      setStage("preflight");
    }
  }, [auth.status, engine]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setActionError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setPassword("");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Connexion impossible.");
    } finally { setBusy(false); }
  };

  const publish = async () => {
    setBusy(true); setActionError(null);
    try { await engine.publish(roomId.trim()); }
    catch (error) { setActionError(error instanceof Error ? error.message : "Publication impossible."); }
    finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true); setActionError(null);
    try { await engine.stop(); }
    finally { setBusy(false); }
  };

  return <main className="rooms-page studio-page">
    <div className="place-room-shell" data-room-presentation="wave">
      <header className="studio-topbar">
        <div className="studio-brand"><img className="studio-brand__logo" src={meewavLogo} alt="Meewav" /><div><strong>Studio</strong><small>Prototype Windows · Room QA</small></div></div>
        <span className={`studio-status studio-status--${media.phase}`}><span />{media.phase === "live" ? "TEST EN DIRECT" : media.phase === "connecting" ? "CONNEXION" : "PRÉPARATION PRIVÉE"}</span>
        {auth.user ? <div className="studio-account"><span title={auth.user.email}>{auth.user.email}</span><button type="button" onClick={() => { void engine.stop().then(() => auth.signOut()); }} aria-label="Se déconnecter"><LogOut size={17} /></button></div> : null}
      </header>

      {auth.status === "loading" ? <section className="studio-centered">Connexion en cours…</section> : null}
      {auth.status === "anonymous" ? <section className="studio-centered"><div className="studio-login place-studio-panel is-shared-studio-chassis is-mixer"><div className="studio-panel-content"><ShieldCheck size={29} /><small>ACCÈS ARTISTE · QA</small><h1>Prépare ton direct</h1><p>Connecte-toi avec un compte QA autorisé pour cette Room.</p><form onSubmit={(event) => void login(event)}><label>Adresse e-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label><label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /></label><button type="submit" disabled={busy}>{busy ? "Connexion…" : "Se connecter"}</button></form>{actionError ? <p role="alert" className="studio-error">{actionError}</p> : null}</div></div></section> : null}

      {auth.status === "authenticated" && stage === "preflight" ? <section className="studio-preflight"><div className="studio-intro"><small>01 / PRÉPARATION</small><h1>Ton son et ton image, avant le public.</h1><p>La vérification utilise seulement tes périphériques locaux. Aucune piste n’est publiée.</p></div><GreenHouse host readyLabel="Entrer dans la régie privée" onReady={async () => { setStage("studio"); }} /></section> : null}

      {auth.status === "authenticated" && stage === "studio" ? <div className="studio-workspace">
        <section className="studio-main place-studio-panel is-shared-studio-chassis is-mixer">
          <div className="studio-panel-content">
            <div className="studio-section-head"><div><small>02 / RÉGIE PRIVÉE</small><h1>Prépare le test</h1></div><span><ShieldCheck size={16} />{media.phase === "live" ? "Pistes publiées" : "Aucune diffusion"}</span></div>
            <div className="studio-viewports"><div className="studio-viewport"><div className="studio-viewport__label"><span>APERÇU</span><b>LOCAL</b></div><div className="studio-viewport__picture"><StudioVideo stream={media.stream} /></div></div><div className="studio-viewport studio-viewport--program"><div className="studio-viewport__label"><span>DIFFUSION DE TEST</span><b>{media.phase === "live" ? "EN DIRECT" : "EN ATTENTE"}</b></div><div className="studio-viewport__picture">{media.phase === "live" ? <div className="studio-program-live"><Radio size={34} /><strong>Caméra et micro publiés</strong><small>Vérifie la réception sur un viewer indépendant.</small></div> : <div className="studio-empty"><Radio size={34} /><span>Rien n’est envoyé au public.</span></div>}</div></div></div>
            <StudioMicrophoneMeter stream={media.stream} />
            <div className="studio-actions"><button type="button" className="studio-button studio-button--secondary" onClick={() => void engine.prepare()} disabled={busy || media.phase === "preparing" || media.phase === "connecting" || media.phase === "live"}><Camera size={18} />{media.phase === "preparing" ? "Ouverture des périphériques…" : media.phase === "private" ? "Relancer l’aperçu" : "Activer l’aperçu privé"}</button><button type="button" className="studio-button studio-button--stop" onClick={() => void stop()} disabled={media.phase === "idle"}><Square size={15} />Tout arrêter</button></div>
            {media.error || actionError ? <p className="studio-error" role="alert">{media.error ?? actionError}</p> : null}
          </div>
        </section>
        <aside className="studio-side place-studio-panel is-shared-studio-chassis is-mixer"><div className="studio-panel-content"><small>03 / PUBLICATION</small><h2>Room QA existante</h2><p>La publication utilise le droit host accordé par le backend de cette Room.</p><label>Identifiant de la Room<input value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="UUID de la Room QA" disabled={media.phase === "connecting" || media.phase === "live"} spellCheck={false} /></label><button type="button" className="studio-button studio-button--live" disabled={busy || media.phase !== "private" || !roomId.trim()} onClick={() => void publish()}><Radio size={19} />Publier le test</button><div className="studio-sequence"><span><CircleCheck size={17} />Caméra et micro vérifiés</span><span><CircleCheck size={17} />Aperçu caméra/micro local</span><span><CircleCheck size={17} />Publication déclenchée par ce bouton</span></div>{media.roomId ? <p className="studio-room-id">Room en cours : <code>{media.roomId}</code></p> : null}</div></aside>
      </div> : null}
    </div>
  </main>;
}
