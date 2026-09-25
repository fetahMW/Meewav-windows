import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import type { DemoCollabAttachment } from "./messagingDemoData";
import type { MessagingAttachmentViewModel } from "./messaging.attachments.types";
import { Waveform } from "./TrackPackStudioPrimitives";

type Props = {
  attachment: DemoCollabAttachment;
  artwork: string;
  ownerName: string;
  demo: boolean;
  resolveUrl?: (attachment: MessagingAttachmentViewModel) => Promise<string>;
  onDownload: () => void;
};
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export default function CollabInlineAudio({ attachment, artwork, ownerName, demo, resolveUrl, onDownload }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(attachment.durationSeconds ?? 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    const pauseOther = (event: Event) => {
      if ((event as CustomEvent).detail !== audio) audio?.pause();
    };
    window.addEventListener("meewav:message-audio-play", pauseOther);
    return () => {
      generation.current += 1;
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
      window.removeEventListener("meewav:message-audio-play", pauseOther);
    };
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio || busy.current) return;
    if (!audio.paused) { audio.pause(); return; }
    const request = generation.current;
    busy.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!audio.getAttribute("src")) {
        let url = attachment.url;
        if (attachment.serverAttachment) {
          if (!attachment.serverAttachment.available || !resolveUrl) throw new Error("unavailable");
          url = await resolveUrl(attachment.serverAttachment);
        } else if (demo && /^https?:\/\/example\.com\//i.test(url)) {
          url = "/audio/rooms/wave-test-pack/Trap_150BPM_C_minor/Loops_8bars/Trap_FullMix_A_150BPM_8bars.wav";
        }
        if (generation.current !== request) return;
        if (!url) throw new Error("missing_source");
        audio.src = /^(?:https?:|blob:|data:|\/)/i.test(url) ? url : `/${url}`;
      }
      if (audio.ended) audio.currentTime = 0;
      window.dispatchEvent(new CustomEvent("meewav:message-audio-play", { detail: audio }));
      await audio.play();
    } catch {
      if (generation.current === request) {
        audio.removeAttribute("src");
        setPlaying(false);
        setError("Impossible de lire cet audio. Réessaie.");
      }
    } finally {
      if (generation.current === request) { busy.current = false; setLoading(false); }
    }
  };

  return <article className="mw-collab-request__attachment is-audio has-inline-player">
    <audio ref={audioRef} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={(event) => { const value = event.currentTarget.duration; if (Number.isFinite(value)) setDuration(value); }} onError={() => { audioRef.current?.removeAttribute("src"); setPlaying(false); setError("Impossible de lire cet audio. Réessaie."); }} />
    <span className="mw-collab-request__attachment-cover" aria-hidden="true"><img src={artwork} alt="" /><small>{ownerName}</small></span>
    <button type="button" className="mw-collab-request__attachment-play" disabled={loading} aria-busy={loading} onClick={() => void toggle()} aria-label={`${playing ? "Mettre en pause" : "Lire"} ${attachment.fileName}`}>{playing ? <Pause /> : <Play fill="currentColor" />}</button>
    <strong className="mw-collab-request__attachment-title">{attachment.fileName}</strong>
    <span className="mw-collab-request__attachment-duration">{clock(current)} / {clock(duration)}</span>
    <span className="mw-collab-request__attachment-wave">
      <Waveform progress={duration > 0 ? current / duration * 100 : 0} animated={playing} variant={attachment.fileName.length} />
      <input type="range" min={0} max={duration || 1} step={0.1} value={Math.min(current, duration || 1)} disabled={!duration || loading || !audioRef.current?.getAttribute("src")} aria-label={`Position dans ${attachment.fileName}`} aria-valuetext={`${clock(current)} sur ${clock(duration)}`} onChange={(event) => { if (audioRef.current) { audioRef.current.currentTime = Number(event.target.value); setCurrent(Number(event.target.value)); } }} />
    </span>
    <span className="mw-collab-request__attachment-meta">{loading ? "Chargement…" : `${(attachment.fileSize / 1024 / 1024).toFixed(1)} MB · ${attachment.fileName.split(".").pop()?.toUpperCase() ?? "AUDIO"}`}</span>
    <span className="mw-collab-request__attachment-actions"><button type="button" onClick={onDownload} aria-label={`Télécharger ${attachment.fileName}`}><Download /></button></span>
    {error && <span className="mw-collab-inline-error" role="status">{error}</span>}
  </article>;
}
