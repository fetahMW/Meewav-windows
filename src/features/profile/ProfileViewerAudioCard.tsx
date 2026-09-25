import { Music2, Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type AudioItem = {
  title: string;
  detail: string;
  url: string;
  duration?: string;
  credit?: string;
};

function timeLabel(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

export default function ProfileViewerAudioCard({ item }: { item: AudioItem }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    return () => { audio?.pause(); };
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (failed) audio.load();
    setFailed(false);
    setLoading(true);
    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailed(true);
      setPlaying(false);
    } finally {
      setLoading(false);
    }
  };

  const readDuration = () => {
    const value = audioRef.current?.duration;
    setDuration(value && Number.isFinite(value) ? value : 0);
  };
  const progress = duration > 0 ? Math.min(100, position / duration * 100) : 0;
  const silent = muted || volume === 0;

  return (
    <article className={`profile-viewer-audio-card${playing ? " is-playing" : ""}`}>
      <span className="profile-viewer-audio-art" aria-hidden="true"><Music2 /></span>
      <div className="profile-viewer-audio-heading">
        <strong title={item.title}>{item.title}</strong>
        <small title={item.detail}>{item.detail}</small>
      </div>
      <audio
        ref={audioRef}
        hidden
        preload="metadata"
        src={item.url}
        onLoadedMetadata={readDuration}
        onDurationChange={readDuration}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => { setPlaying(false); setLoading(false); }}
        onWaiting={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onEnded={() => { setPlaying(false); setLoading(false); }}
        onError={() => { setFailed(true); setLoading(false); setPlaying(false); }}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
      />
      <div className="profile-viewer-audio-controls" role="group" aria-label={`Lecteur de ${item.title}`}>
        <button type="button" className="profile-viewer-audio-play" onClick={() => void togglePlayback()}
          aria-label={`${failed ? "Réessayer" : playing ? "Mettre en pause" : "Lire"} ${item.title}`}>
          {failed ? <RotateCcw aria-hidden="true" /> : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </button>
        <div className="profile-viewer-audio-timeline">
          <input type="range" min={0} max={duration || 1} step={0.1}
            value={Math.min(position, duration || 1)} disabled={!duration || failed}
            aria-label={`Position de lecture de ${item.title}`}
            aria-valuetext={`${timeLabel(position)} sur ${duration ? timeLabel(duration) : item.duration || "durée inconnue"}`}
            style={{ "--audio-progress": `${progress}%` } as CSSProperties}
            onChange={(event) => {
              if (!audioRef.current) return;
              const value = Number(event.target.value);
              audioRef.current.currentTime = value;
              setPosition(value);
            }} />
          <div className="profile-viewer-audio-times">
            <time>{timeLabel(position)}</time>
            <span role="status">{failed ? "Lecture indisponible · réessayer" : loading ? "Chargement…" : playing ? "En lecture" : ""}</span>
            <time>{duration ? timeLabel(duration) : item.duration || "—:—"}</time>
          </div>
        </div>
        <div className="profile-viewer-audio-volume">
          <button type="button" aria-label={silent ? "Activer le son" : "Couper le son"} aria-pressed={silent}
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.muted = !silent;
              if (silent && audio.volume === 0) audio.volume = 0.5;
            }}>{silent ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}</button>
          <input type="range" min={0} max={1} step={0.05} value={silent ? 0 : volume}
            aria-label={`Volume de ${item.title}`} aria-valuetext={`${Math.round((silent ? 0 : volume) * 100)} %`}
            style={{ "--audio-progress": `${(silent ? 0 : volume) * 100}%` } as CSSProperties}
            onChange={(event) => {
              if (!audioRef.current) return;
              audioRef.current.muted = false;
              audioRef.current.volume = Number(event.target.value);
            }} />
        </div>
      </div>
      {item.credit && <em>{item.credit}</em>}
    </article>
  );
}
