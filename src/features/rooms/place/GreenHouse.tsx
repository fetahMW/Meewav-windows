import MeewavSelect from "../../../components/shared/MeewavSelect";
import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Wifi, Headphones, ShieldCheck, RefreshCw } from "lucide-react";
import { readRoomDevicePreferences, saveRoomDevicePreferences } from "./roomDevicePreferences";
import "./green-house.css";

type Readiness = { camera: boolean; microphone: boolean; connection: boolean; mixer: boolean; permissions: boolean };
export default function GreenHouse({ onReady, onReadiness, readyLabel = "Rejoindre les coulisses", host = false }: { onReady: () => Promise<void>; onReadiness?: (value: Readiness) => void; readyLabel?: string; host?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState(() => readRoomDevicePreferences().cameraId ?? "");
  const [microphoneId, setMicrophoneId] = useState(() => readRoomDevicePreferences().microphoneId ?? "");
  const [online, setOnline] = useState(navigator.onLine);
  const [tracksValid, setTracksValid] = useState(false);
  const [devicesChanged, setDevicesChanged] = useState(false);
  const ready = Boolean(stream && tracksValid && !devicesChanged && online && latency !== null && latency < 1500 && heard && confirmed);
  useEffect(() => {
    mounted.current = true;
    const network = () => { setOnline(navigator.onLine); setLatency(null); };
    window.addEventListener("offline", network); window.addEventListener("online", network);
    return () => { mounted.current = false; streamRef.current?.getTracks().forEach((track) => track.stop()); window.removeEventListener("offline", network); window.removeEventListener("online", network); };
  }, []);
  useEffect(() => {
    if (!stream) return;
    if (video.current) { video.current.srcObject = stream; void video.current.play().catch(() => undefined); }
    const check = () => setTracksValid(stream.getTracks().length >= 2 && stream.getTracks().every((track) => track.readyState === "live" && track.enabled && !track.muted));
    check();
    stream.getTracks().forEach((track) => { track.addEventListener("ended", check); track.addEventListener("mute", check); track.addEventListener("unmute", check); });
    let context: AudioContext | undefined; let timer: ReturnType<typeof setInterval> | undefined;
    try {
      context = new AudioContext(); const analyser = context.createAnalyser(); analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      timer = setInterval(() => { analyser.getByteTimeDomainData(samples); const rms = Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length); setLevel(Math.min(100, rms * 400)); }, 80);
    } catch { setError("Le vumètre audio est indisponible. Vérifie les permissions puis réessaie."); }
    return () => { if (timer) clearInterval(timer); void context?.close(); stream.getTracks().forEach((track) => { track.removeEventListener("ended", check); track.removeEventListener("mute", check); track.removeEventListener("unmute", check); }); };
  }, [stream]);
  useEffect(() => { onReadiness?.({ camera: tracksValid && !devicesChanged, microphone: tracksValid && !devicesChanged && heard, connection: online && latency !== null && latency < 1500, mixer: confirmed, permissions: Boolean(stream) }); }, [tracksValid, devicesChanged, heard, confirmed, online, latency, stream, onReadiness]);
  const testConnection = async () => {
    setLatency(null); setError("");
    try {
      const start = performance.now();
      const response = await fetch("/", { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok || !navigator.onLine) throw new Error();
      if (mounted.current) setLatency(Math.round(performance.now() - start));
    } catch { if (mounted.current) setError("Connexion non validée. Vérifie ton réseau et relance le test."); }
  };
  const start = async () => {
    if (busy) return;
    setBusy(true); setError(""); setConfirmed(false); setHeard(false);
    streamRef.current?.getTracks().forEach((track) => track.stop()); setStream(null); setTracksValid(false);
    try {
      const next = await navigator.mediaDevices.getUserMedia({ video: cameraId ? { deviceId: { ideal: cameraId } } : true, audio: microphoneId ? { deviceId: { ideal: microphoneId } } : true });
      if (!mounted.current) { next.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = next; setStream(next); setDevicesChanged(false);
      const available = await navigator.mediaDevices.enumerateDevices();
      if (!mounted.current) return;
      setDevices(available); await testConnection();
    } catch { if (mounted.current) setError("Caméra ou micro inaccessible. Autorise leur accès, vérifie qu’ils sont disponibles, puis réessaie."); }
    finally { if (mounted.current) setBusy(false); }
  };
  const playTone = async () => {
    const context = new AudioContext(); await context.resume();
    const oscillator = context.createOscillator(); const gain = context.createGain(); gain.gain.setValueAtTime(.06, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .6);
    oscillator.frequency.value = 440; oscillator.connect(gain).connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .65); oscillator.onended = () => { void context.close(); };
  };
  return <section className="green-house" aria-label="Green Room privée">
    <header><span className="green-house__mark"><ShieldCheck /></span><div><small>GREEN ROOM · PRIVÉ</small><h2>{host ? "Tes réglages avant le direct" : "Avant d’entrer en coulisses"}</h2><p>Ton aperçu reste sur cet appareil.</p></div></header>
    <div className="green-house__preview">{stream ? <video ref={video} autoPlay muted playsInline /> : <div><Camera /><span>Cadre ton image, trouve ton son.</span></div>}<span className="green-house__private">Aperçu privé</span></div>
    <button className="green-house__start" disabled={busy} onClick={() => void start()}><RefreshCw />{busy ? "Vérification…" : stream ? "Relancer les vérifications" : "Activer caméra et micro"}</button>
    {devices.length > 0 ? <div className="green-house__devices"><label>Caméra<MeewavSelect value={cameraId} onChange={(event) => { setCameraId(event.target.value); setDevicesChanged(true); setConfirmed(false); }}><option value="">Par défaut</option>{devices.filter((d) => d.kind === "videoinput").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Caméra"}</option>)}</MeewavSelect></label><label>Microphone<MeewavSelect value={microphoneId} onChange={(event) => { setMicrophoneId(event.target.value); setDevicesChanged(true); setConfirmed(false); }}><option value="">Par défaut</option>{devices.filter((d) => d.kind === "audioinput").map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Microphone"}</option>)}</MeewavSelect></label><small>Relance les vérifications après un changement de périphérique.</small></div> : null}
    <div className="green-house__checks"><article><Mic /><strong>Ton micro</strong><meter min={0} max={100} value={level} aria-label="Niveau du microphone" /><span>Parle : le niveau doit bouger.</span></article><article><Wifi /><strong>Ta connexion</strong><b>{!online ? "Hors ligne" : latency === null ? "À tester" : `${latency} ms`}</b><span>Réponse du serveur · réseau {latency !== null && latency < 1500 ? "disponible" : "à vérifier"}</span><button onClick={() => void testConnection()}>Retester</button></article></div>
    <button className="green-house__sound" onClick={() => void playTone().catch(() => setError("La sortie audio est indisponible."))}><Headphones />Tester le son du casque</button>
    <label className="green-house__confirm"><input type="checkbox" checked={heard} onChange={(e) => setHeard(e.target.checked)} />J’entends le son et mon micro réagit.</label>
    <label className="green-house__confirm"><input type="checkbox" checked={confirmed} disabled={!tracksValid || devicesChanged} onChange={(e) => setConfirmed(e.target.checked)} />Mon cadrage et mon niveau sonore sont prêts.</label>
    {error ? <p role="alert" className="green-house__error">{error}</p> : null}
    <button className="green-house__ready" disabled={!ready || busy} onClick={async () => { setBusy(true); try {
      saveRoomDevicePreferences({ cameraId: streamRef.current?.getVideoTracks()[0]?.getSettings?.().deviceId || cameraId,
        microphoneId: streamRef.current?.getAudioTracks()[0]?.getSettings?.().deviceId || microphoneId });
      await onReady();
    } catch { setError("La confirmation n’a pas abouti. Réessaie."); } finally { if (mounted.current) setBusy(false); } }}>{readyLabel}</button>
  </section>;
}
