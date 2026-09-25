import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, SkipForward, Volume2, VolumeX, X } from "lucide-react";
import ShortsVideoPlayer, { PLAYER_PREFERENCES_KEY, readPlayerPreferences, type ShortsVideoPlayerProps } from "../shorts/ShortsVideoPlayer";
import { meewavMediaSession, type MeeWavMediaSessionLease } from "./mediaSession";

const AD_SOURCE = "/media/tremplin/ecosysteme-meewav.mp4";
const SKIP_AFTER = 5;
const AD_LENGTH = 15;

/** Each opened video gets the same MeeWav house ad; content tracking starts afterwards. */
export default function SceneVideoPlayback(props: ShortsVideoPlayerProps) {
  const [adFinished, setAdFinished] = useState(false);
  return adFinished ? <ShortsVideoPlayer {...props} /> : <ScenePreroll {...props} onFinished={() => setAdFinished(true)} />;
}

export function ScenePreroll({ item, presentation, collapsed, recommendations, onClose, onFinished }: ShortsVideoPlayerProps & { onFinished: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const leaseRef = useRef<MeeWavMediaSessionLease | null>(null);
  const controlsRef = useRef<HTMLButtonElement>(null);
  const instance = useId();
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [preferences, setPreferences] = useState(readPlayerPreferences);
  const elapsedRef = useRef(0);
  const isWatch = presentation === "watch";
  const remaining = Math.max(0, Math.ceil(SKIP_AFTER - elapsed));
  const claim = () => {
    if (leaseRef.current?.isCurrent() && meewavMediaSession.getSnapshot().active?.state === "active") return;
    leaseRef.current = meewavMediaSession.claim({ source: "scene_video", id: `scene-ad:${instance}`, label: "Publicité MeeWav", pause: () => videoRef.current?.pause() });
  };
  const finish = () => { videoRef.current?.pause(); onFinished(); };
  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    if (!video.paused) video.pause();
    else { claim(); void video.play().catch(() => setPlaying(false)); }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = preferences.volume;
    video.muted = preferences.muted;
    try { sessionStorage.setItem(PLAYER_PREFERENCES_KEY, JSON.stringify(preferences)); } catch { /* Keep in-memory settings. */ }
  }, [preferences]);

  useEffect(() => {
    const video = videoRef.current;
    const focused = document.activeElement as HTMLElement | null;
    claim();
    void video?.play().catch(() => {
      if (!video) return;
      video.muted = true;
      setPreferences((current) => ({ ...current, muted: true }));
      return video.play().catch(() => setPlaying(false));
    });
    if (!isWatch) controlsRef.current?.focus({ preventScroll: true });
    const pauseWhenHidden = () => { if (document.hidden) video?.pause(); };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    // A blocked or unavailable ad must never trap the viewer in the player.
    const timeout = window.setTimeout(() => { if (elapsedRef.current === 0 && (video?.readyState ?? 0) < 2) setUnavailable(true); }, 12000);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
      leaseRef.current?.release({ reason: "route_change" });
      video?.pause();
      if (!isWatch && focused?.isConnected) focused.focus({ preventScroll: true });
    };
  }, [isWatch]);

  return <div className={`shorts-player-layer scene-preroll has-visible-controls${isWatch ? " is-watch" : ""}${collapsed ? " is-miniplayer" : ""}`}
    role={isWatch ? undefined : "dialog"} aria-label="Publicité MeeWav" onKeyDown={(event) => {
      if (event.key === "Escape") onClose();
      if ((event.key === "k" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); play(); }
    }}>
    {!isWatch && <button className="shorts-player-layer__backdrop" aria-label="Fermer la publicité" onClick={onClose} tabIndex={-1} />}
    <section className="shorts-player-surface" aria-label="Publicité avant la vidéo">
      <div className="shorts-player-frame" style={{ "--shorts-player-progress": `${Math.min(elapsed / AD_LENGTH, 1) * 100}%` } as CSSProperties}>
        <video ref={videoRef} className="shorts-player-video" src={AD_SOURCE} autoPlay playsInline preload="auto" aria-label="Publicité : découvre MeeWav"
          onClick={play} onPlay={() => {
            claim();
            setPlaying(true);
          }} onPlaying={() => setUnavailable(false)} onPause={() => setPlaying(false)} onError={() => { setUnavailable(true); setPlaying(false); }}
          onTimeUpdate={(event) => {
            const time = event.currentTarget.currentTime;
            elapsedRef.current = time;
            setElapsed(time);
            if (time >= AD_LENGTH) finish();
          }} onEnded={finish} />
        <div className="scene-preroll__label"><span>Publicité</span><strong>MeeWav</strong></div>
        <button ref={controlsRef} className="scene-preroll__close" aria-label="Fermer le lecteur" onClick={onClose}><X /></button>
        {!playing && !unavailable && <button className="shorts-player-frame__central-play" aria-label="Lire la publicité" onClick={play}><Play fill="currentColor" /></button>}
        {unavailable && <p className="scene-preroll__error" role="status">La publicité n’est pas disponible. Tu peux passer à la vidéo.</p>}
        <button className="scene-preroll__skip" disabled={remaining > 0 && !unavailable} onClick={finish}>
          {unavailable || remaining === 0 ? <>Ignorer la publicité <SkipForward /></> : <>Ignorer dans {remaining} s</>}
        </button>
        <div className="shorts-player-controls">
          <div className="scene-preroll__timeline" aria-hidden="true"><span /></div>
          <div className="shorts-player-controls__row"><div className="shorts-player-controls__left">
            <button aria-label={playing ? "Mettre la publicité en pause" : "Lire la publicité"} onClick={play}>{playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}</button>
            <div className="shorts-player-volume"><button aria-label={preferences.muted ? "Activer le son de la publicité" : "Couper le son de la publicité"} onClick={() => setPreferences((current) => ({ ...current, muted: !current.muted }))}>{preferences.muted ? <VolumeX /> : <Volume2 />}</button>
              <input type="range" aria-label="Volume" min="0" max="1" step=".01" value={preferences.muted ? 0 : preferences.volume} onChange={(event) => setPreferences((current) => ({ ...current, volume: Number(event.target.value), muted: Number(event.target.value) === 0 }))} />
            </div><span className="shorts-player-time">0:{String(Math.min(Math.floor(elapsed), AD_LENGTH)).padStart(2, "0")} / 0:15</span>
          </div><span className="scene-preroll__brand">MEEWAV</span></div>
        </div>
      </div>
      <div className="scene-preroll__next"><span>Après la publicité</span><strong>{item.title}</strong><span>{item.artist}</span></div>
    </section>
    {isWatch && !collapsed && recommendations}
  </div>;
}
