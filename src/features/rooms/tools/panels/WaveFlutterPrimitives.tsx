/* eslint-disable react-refresh/only-export-components */
import { Music2, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { signedWaveAudienceUrl } from "../audience/waveAudienceUpload.service";

export type WaveLoopCardModel = {
  id: string;
  title: string;
  author: string;
  avatarUrl?: string;
  kind: string;
  bpm: number;
  key: string;
  bars: 4 | 8;
};

export function waveLoopAccent(kind: string) {
  const value = kind.toLocaleLowerCase("fr-FR");
  if (/voix|vocal|acap|a cappella/.test(value)) return "#ff8a00";
  if (/drum|kick|perc|hat/.test(value)) return "#00b2ff";
  if (/bass|basse|808|pad|fx|ambiance/.test(value)) return "#ff00d4";
  if (/m[eé]lo|synth|piano|guitare|violon|keys/.test(value)) return "#00ffcc";
  return "#00d9ff";
}

export function useWaveMediaUrl(mediaUrl?: string, mediaPath?: string) {
  const sourceKey = `${mediaUrl ?? ""}|${mediaPath ?? ""}`;
  const [resolved, setResolved] = useState({ sourceKey, url: mediaUrl ?? "", error: "" });

  useEffect(() => {
    let active = true;
    setResolved({ sourceKey, url: mediaUrl ?? "", error: "" });
    if (!mediaUrl && mediaPath) {
      void signedWaveAudienceUrl(mediaPath)
        .then((nextUrl) => { if (active) setResolved({ sourceKey, url: nextUrl, error: "" }); })
        .catch(() => { if (active) setResolved({ sourceKey, url: "", error: "Audio indisponible pour le moment." }); });
    }
    return () => { active = false; };
  }, [mediaPath, mediaUrl, sourceKey]);

  if (resolved.sourceKey !== sourceKey) return { url: mediaUrl ?? "", error: "", sourceKey };
  return { url: resolved.url, error: resolved.error, sourceKey };
}

export function WaveLoopCard({ loop, badge, active, onSelect }: { loop: WaveLoopCardModel; badge: string; active: boolean; onSelect: () => void }) {
  const accent = waveLoopAccent(loop.kind);
  const initial = loop.author.trim().slice(0, 1).toLocaleUpperCase("fr-FR") || "W";
  return <button
    type="button"
    className={`wave-flutter-loop${active ? " is-selected" : ""}`}
    style={{ "--wave-loop-color": accent } as CSSProperties}
    aria-pressed={active}
    aria-label={`${loop.title}, ${loop.author}, ${badge}`}
    onClick={onSelect}
  >
    <span className="wave-flutter-loop__wash" aria-hidden="true" />
    <span className="wave-flutter-loop__top"><b>{badge}</b><i><Play /></i></span>
    <span className="wave-flutter-loop__avatar"><em>{initial}</em>{loop.avatarUrl ? <img src={loop.avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span>
    <span className="wave-flutter-loop__copy"><small>{loop.kind.toLocaleUpperCase("fr-FR")}</small><strong>{loop.title}</strong><em>{loop.author}</em></span>
    <span className="wave-flutter-loop__meta"><b>{loop.bpm} BPM</b><b>{loop.key}</b><b>{loop.bars} MES.</b></span>
  </button>;
}

export function WaveAction({ label, icon, tone = "neutral", disabled, onClick }: { label: string; icon?: ReactNode; tone?: "neutral" | "orange" | "green" | "cyan" | "danger"; disabled?: boolean; onClick: () => void }) {
  return <button type="button" className={`wave-flutter-action is-${tone}`} disabled={disabled} onClick={onClick}>{icon ?? <Music2 />}<span>{label}</span></button>;
}
