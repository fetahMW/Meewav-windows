/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Headphones, Pause, Play, Radio, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { WaveViewerAudio } from "./WaveViewerAudio";
import "./wave-viewer.css";

type ListeningMode = "live" | "workshop" | "vote";
type Listening = {
  engine: WaveViewerAudio; mode: ListeningMode; label: string; playing: boolean; loading: boolean;
  error: string; liveVolume: number; liveMuted: boolean; keepVoice: boolean; voiceAvailable: boolean;
  returnVolume: number; returnMuted: boolean;
  setReturnVolume: (value: number) => void; setReturnMuted: (value: boolean) => void;
  setLiveVolume: (value: number) => void; setLiveMuted: (value: boolean) => void;
  setKeepVoice: (value: boolean) => void; setVoiceAvailable: (value: boolean) => void;
  start: (mode: Exclude<ListeningMode, "live">, label: string, prepare: () => Promise<{ buffers: AudioBuffer[]; volumes: number[]; loop: boolean }>) => Promise<void>;
  pause: () => void; resume: (restart?: boolean) => Promise<void>; returnLive: () => void;
};
const Context = createContext<Listening | null>(null);
export const useWaveViewerListening = () => useContext(Context);
function readReturnPreference() {
  try {
    const stored = JSON.parse(localStorage.getItem("meewav:viewer-return:v1") ?? "null");
    return { gain: typeof stored?.gain === "number" && Number.isFinite(stored.gain) ? Math.max(0, Math.min(1, stored.gain)) : 1, muted: stored?.muted === true };
  } catch { return { gain: 1, muted: false }; }
}
export function WaveViewerListeningProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new WaveViewerAudio());
  const [mode, setMode] = useState<ListeningMode>("live");
  const [label, setLabel] = useState("Beat collectif");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [returnVolume, setReturnVolume] = useState(() => readReturnPreference().gain);
  const [returnMuted, setReturnMuted] = useState(() => readReturnPreference().muted);
  useEffect(() => {
    try { localStorage.setItem("meewav:viewer-return:v1", JSON.stringify({ gain: returnVolume, muted: returnMuted })); } catch { /* Optional local preference. */ }
  }, [returnVolume, returnMuted]);
  const [liveVolume, setLiveVolume] = useState(1);
  const [liveMuted, setLiveMuted] = useState(true);
  const [keepVoice, setKeepVoice] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const generation = useRef(0);
  useEffect(() => { engine.setOutputVolume(liveVolume); }, [engine, liveVolume]);
  const value = useMemo<Listening>(() => {
    const pause = () => { ++generation.current; engine.pause(); setPlaying(false); setLoading(false); };
    const returnLive = () => { pause(); engine.stop(); setMode("live"); setError(""); };
    return {
      engine, mode, label, playing, loading, error, liveVolume, liveMuted, keepVoice, voiceAvailable,
      returnVolume, returnMuted, setReturnVolume: value => setReturnVolume(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))), setReturnMuted,
      setLiveVolume, setLiveMuted, setKeepVoice, setVoiceAvailable, pause, returnLive,
      start: async (nextMode, nextLabel, prepare) => {
        pause(); const request = ++generation.current;
        setLoading(true); setError("");
        try {
          const audio = await prepare();
          if (request !== generation.current) return;
          // Commit local RTC/HLS suppression before scheduling private audio.
          flushSync(() => { setMode(nextMode); setLabel(nextLabel); });
          const started = await engine.play(audio.buffers, audio.volumes, audio.loop);
          if (request === generation.current) setPlaying(started);
        } catch (reason) {
          if (request === generation.current) {
            engine.stop(); setMode("live");
            setError(reason instanceof Error ? reason.message : "Lecture impossible. Activer le son puis réessayer.");
          }
        } finally { if (request === generation.current) setLoading(false); }
      },
      resume: async (restart = false) => {
        const request = ++generation.current;
        try { const started = await engine.resume(restart); if (request === generation.current) setPlaying(started); }
        catch { if (request === generation.current) { setPlaying(false); setError("Activer le son pour reprendre l’écoute."); } }
      },
    };
  }, [engine, mode, label, playing, loading, error, liveVolume, liveMuted, keepVoice, voiceAvailable, returnVolume, returnMuted]);
  const valueRef = useRef(value); valueRef.current = value;
  useEffect(() => {
    engine.onEnded = () => setPlaying(false);
    const interrupt = () => { if (document.hidden) valueRef.current.pause(); };
    const deviceChange = () => valueRef.current.returnLive();
    document.addEventListener("visibilitychange", interrupt);
    navigator.mediaDevices?.addEventListener("devicechange", deviceChange);
    return () => {
      ++generation.current; engine.dispose();
      document.removeEventListener("visibilitychange", interrupt);
      navigator.mediaDevices?.removeEventListener("devicechange", deviceChange);
    };
  }, [engine]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function WaveViewerListeningBar({ onOpenWave }: { onOpenWave: () => void }) {
  const audio = useWaveViewerListening();
  if (!audio || (audio.mode === "live" && !audio.error)) return null;
  return <div className="wave-viewer-listening" aria-label="Écoute personnelle">
    <div className="wave-viewer-listening__identity">{audio.mode === "live" ? <Radio /> : <Headphones />}<span><strong>{audio.mode === "live" ? "EN DIRECT" : audio.mode === "vote" ? "AUDITION DU VOTE" : "ÉCOUTE PRIVÉE"}</strong><small>{audio.mode === "live" ? "Programme officiel" : audio.label}{audio.loading ? " · Chargement…" : audio.mode !== "live" && !audio.playing ? " · En pause" : ""}</small></span></div>
    {audio.mode === "live" ? null : <div className="wave-viewer-actions">
      <button type="button" title={audio.playing ? "Mettre l’écoute en pause" : "Reprendre l’écoute"} aria-label={audio.playing ? "Mettre l’écoute en pause" : "Reprendre l’écoute"} onClick={() => audio.playing ? audio.pause() : void audio.resume()}>{audio.playing ? <Pause /> : <Play />}</button>
      <button type="button" title="Recommencer le cycle" aria-label="Recommencer le cycle" onClick={() => void audio.resume(true)}><RotateCcw /></button>
      <button type="button" onClick={audio.returnLive}>Retour au live</button>
      <button type="button" onClick={onOpenWave}>{audio.mode === "vote" ? "Accès au vote" : "Mon atelier"}</button>
    </div>}
    {audio.error ? <p role="alert">{audio.error}</p> : null}
  </div>;
}

export function ViewerPersonalMixer() {
  const audio = useWaveViewerListening();
  if (!audio) return null;
  return <section className="viewer-personal-mixer" aria-label="Mixeur personnel">
    <header><Headphones aria-hidden="true" /><div><h2>Mon écoute</h2><p>Volume de la Room dans votre casque ou vos enceintes.</p></div></header>
    <div className="viewer-personal-mixer__channel">
      <label htmlFor="viewer-listening-volume">Mon volume <output>{Math.round(audio.liveVolume * 100)} %</output></label>
      <input id="viewer-listening-volume" aria-label="Mon volume d’écoute" type="range" min="0" max="1" step="0.01" value={audio.liveVolume} onChange={event => audio.setLiveVolume(Number(event.target.value))} />
      <button type="button" aria-pressed={audio.liveMuted} onClick={() => audio.setLiveMuted(!audio.liveMuted)}>{audio.liveMuted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}{audio.liveMuted ? "Activer le son" : "Couper le son"}</button>
    </div>
  </section>;
}
