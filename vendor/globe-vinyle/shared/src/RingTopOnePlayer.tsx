import { useEffect, useRef, useState } from "react";
import { Crown, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { NATIONAL_TOP_ONE } from "./nationalTopArtists";
import "./ring-top-one-player.css";

// Same supplied track as the Tremplin hero, relative to the embedded Globe document.
const trackUrl = new URL("../media/vinyl/003-king.mp3", document.baseURI).href;

export default function RingTopOnePlayer({ profileOpen }: { profileOpen: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const mounted = useRef(false);
  const active = useRef(!document.hidden);
  const [playing, setPlaying] = useState(false);
  const [pending, setPending] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    mounted.current = true;
    const player = audio.current!;
    player.volume = 0.35;
    const hide = () => { active.current = !document.hidden; if (!active.current) player.pause(); };
    const lifecycle = (event: Event) => {
      active.current = (event as CustomEvent<{ active: boolean }>).detail?.active === true && !document.hidden;
      if (!active.current) player.pause();
    };
    document.addEventListener("visibilitychange", hide);
    document.addEventListener("globelab-lifecycle", lifecycle);
    return () => {
      mounted.current = false;
      player.pause();
      document.removeEventListener("visibilitychange", hide);
      document.removeEventListener("globelab-lifecycle", lifecycle);
    };
  }, []);
  useEffect(() => { if (profileOpen) audio.current?.pause(); }, [profileOpen]);
  const toggle = async () => {
    const player = audio.current;
    if (!player || pending || !active.current || profileOpen) return;
    if (!player.paused) { player.pause(); return; }
    setError("");
    setPending(true);
    try { await player.play(); }
    catch { if (mounted.current) setError("Lecture indisponible. Réessaie dans un instant."); }
    finally { if (mounted.current) setPending(false); }
  };
  return <section className="ring-top-one-player ring-key-surface" data-profile-open={profileOpen} aria-label="Lecteur du Top 1"
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <audio ref={audio} src={trackUrl} preload="none" muted={muted}
      onPlay={() => { if (!active.current || profileOpen) audio.current?.pause(); else setPlaying(true); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => { setPlaying(false); setPending(false); setError("Le morceau est indisponible. Réessaie dans un instant."); }} />
    <button type="button" className="ring-top-one-player__play" onClick={() => void toggle()}
      disabled={pending} aria-busy={pending} aria-pressed={playing}
      aria-label={playing ? "Mettre 003 KING en pause" : "Écouter 003 KING"}>
      {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
    </button>
    {NATIONAL_TOP_ONE && <img src={NATIONAL_TOP_ONE.portraitUrl} alt="" width={36} height={36} />}
    <div className="ring-top-one-player__copy">
      <span><Crown size={11} aria-hidden="true" /> Top 1 Meewav France</span>
      <strong>003 KING <small>· {NATIONAL_TOP_ONE?.name}</small></strong>
    </div>
    <button type="button" className="ring-top-one-player__mute" onClick={() => setMuted(value => !value)}
      aria-pressed={muted} aria-label={muted ? "Rétablir le son du vinyle" : "Couper le son du vinyle"}>
      {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
    </button>
    {error && <p className="ring-top-one-player__error" role="status">{error}</p>}
  </section>;
}
