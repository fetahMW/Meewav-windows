import { Download, Headphones, LoaderCircle, Music2, Pause, Play, Repeat2, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useCageProduction } from "../audio/CageProductionProvider";
import "./cage-production.css";

function clock(value: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function CageProductionCard({ active = true, onOpenMixer }: { active?: boolean; onOpenMixer?: () => void }) {
  const state = useCageProduction();
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [playError, setPlayError] = useState<string | null>(null);
  const generation = useRef(0);
  const src = state?.asset?.src;
  const locked = Boolean(state?.onstage);
  const canPlay = useRef(false);
  canPlay.current = active && !locked;
  useEffect(() => {
    generation.current += 1;
    setPlaying(false); setStarting(false); setSeconds(0); setRepeat(false); setPlayError(null);
    return () => { generation.current += 1; };
  }, [src]);
  useEffect(() => {
    const element = audio.current;
    if (!active || locked) { generation.current += 1; element?.pause(); setPlaying(false); setStarting(false); }
    return () => { element?.pause(); };
  }, [active, locked, src]);
  if (!state) return null;
  const { production, asset, loading, error, participant } = state;
  const toggle = async () => {
    if (!audio.current || !asset || !canPlay.current || starting) return;
    if (playing) { generation.current += 1; audio.current.pause(); return; }
    const request = ++generation.current;
    const element = audio.current;
    setStarting(true);
    setPlayError(null);
    state.pauseMixerPreview();
    try {
      await element.play();
      if (request !== generation.current || !canPlay.current) element.pause();
    } catch { if (request === generation.current) setPlayError("Lecture impossible. Réessaie."); }
    finally { if (request === generation.current) setStarting(false); }
  };
  return <section className="cage-production" aria-label="Prod du battle" aria-busy={loading}>
    <div className="cage-production__top">
      <span className="cage-production__icon"><Music2 aria-hidden="true" /></span>
      <div className="cage-production__identity"><h3>Prod du battle</h3><strong title={production?.title}>{production?.title ?? (error ? "Prod momentanément indisponible" : loading ? "Chargement de la prod…" : "En attente du host")}</strong>
        <small>{production?.demo ? <span>Démo</span> : null}{production?.bpm ? <span>{production.bpm} BPM</span> : null}{asset ? <span>{clock(asset.durationSeconds)}</span> : null}</small>
      </div>
      <div className="cage-production__actions">
        <button type="button" className="cage-production__listen" disabled={!asset || locked || !active || starting} onClick={() => void toggle()} aria-label={playing ? "Mettre la prod en pause" : "Écouter la prod du battle"}>{starting || loading && !asset ? <LoaderCircle className="is-loading" /> : playing ? <Pause /> : <Play />}<span>{playing ? "Pause" : "Écouter"}</span></button>
        <button type="button" disabled={!asset || locked || !active} onClick={() => setRepeat(value => !value)} aria-label="Lecture en boucle de la prod" aria-pressed={repeat} title="Répéter la prod"><Repeat2 /><span>Boucle</span></button>
        {asset ? <a href={asset.src} download={asset.file.name} aria-label="Télécharger la prod du battle" title="Télécharger la prod"><Download /><span>Télécharger</span></a> : <button type="button" disabled aria-label="Télécharger la prod du battle"><Download /><span>Télécharger</span></button>}
      </div>
    </div>
    {asset ? <>
      <audio ref={audio} src={asset.src} loop={repeat} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={event => setSeconds(event.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setSeconds(0); if (audio.current) audio.current.currentTime = 0; }} onError={() => setPlayError("Lecture impossible. Réessaie le chargement de la prod.")} />
      <div className="cage-production__waveform">
        <svg viewBox="0 0 400 36" preserveAspectRatio="none" aria-hidden="true">{asset.peaks.map((peak, index) => <line key={index} x1={index * 4 + 2} x2={index * 4 + 2} y1={18 - peak.max * 17} y2={18 - peak.min * 17} className={index / asset.peaks.length < seconds / asset.durationSeconds ? "is-played" : undefined} />)}</svg>
        <input type="range" min={0} max={asset.durationSeconds} step={0.1} value={seconds} disabled={locked} aria-label="Position dans la prod du battle" aria-valuetext={`${clock(seconds)} sur ${clock(asset.durationSeconds)}`} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setSeconds(value); }} />
      </div>
      <div className="cage-production__footer"><span>{clock(seconds)} <i>/</i> {clock(asset.durationSeconds)}</span>{participant && onOpenMixer ? <button type="button" onClick={() => { audio.current?.pause(); onOpenMixer(); }}><Headphones />{state.mixerReady ? "Ouvrir mon mixeur" : "Préparer dans mon mixeur"}</button> : <span>Écoute privée</span>}</div>
    </> : null}
    {locked ? <p className="cage-production__notice">La prod de ton passage se contrôle dans le mixeur.</p> : null}
    {error || playError ? <div className="cage-production__error" role="alert"><span>{error ?? playError}</span><button type="button" onClick={() => { setPlayError(null); state.retry(); }}><RotateCcw />Réessayer</button></div> : null}
  </section>;
}
