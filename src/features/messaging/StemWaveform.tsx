import { useEffect, useId, useMemo, useRef, useState } from "react";
import { decodeAudioWaveform, type DecodedWaveform, type WaveformPeak } from "../rooms/tools/audio/previewWaveform";

const resolutions = 4096;
const cache = new Map<string, Promise<DecodedWaveform>>();

function loadPeaks(url: string) {
  const existing = cache.get(url);
  if (existing) return existing;
  const pending = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error("Audio indisponible");
    return decodeAudioWaveform(await response.arrayBuffer(), resolutions);
  });
  cache.set(url, pending);
  if (cache.size > 32) cache.delete(cache.keys().next().value!);
  void pending.catch(() => { if (cache.get(url) === pending) cache.delete(url); });
  return pending;
}

/** Preserve real transients and signed amplitudes when fitting the signal to the screen. */
export function stemWaveformPath(peaks: readonly WaveformPeak[], width: number) {
  const count = Math.min(peaks.length, Math.max(1, Math.floor(width / 2)));
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * peaks.length / count);
    const end = Math.ceil((index + 1) * peaks.length / count);
    let min = Infinity, max = -Infinity;
    for (let i = start; i < end; i++) { min = Math.min(min, peaks[i].min); max = Math.max(max, peaks[i].max); }
    const x = (Math.floor((index + .5) * width / count) + .5).toFixed(2);
    return `M${x},${(32 - max * 29).toFixed(2)}V${(32 - min * 29).toFixed(2)}`;
  }).join(" ");
}

export function StemWaveform({ mediaUrls, progress = 0 }: { mediaUrls: readonly (string | undefined)[]; progress?: number }) {
  const element = useRef<HTMLSpanElement>(null);
  const clipId = `stem-${useId().replace(/:/g, "")}`;
  const [width, setWidth] = useState(640);
  const playedWidth = width * Math.max(0, Math.min(100, progress)) / 100;
  const [result, setResult] = useState<{ key: string; peaks: readonly WaveformPeak[]; error?: boolean } | null>(null);
  const sourceKey = JSON.stringify([...new Set(mediaUrls.filter((url): url is string => Boolean(url)))]);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(1, entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    const urls = JSON.parse(sourceKey) as string[];
    if (!urls.length) return;
    void Promise.all(urls.map(loadPeaks)).then((signals) => {
      // The master shows the combined peak envelope; each stem shows its own PCM signal.
      const duration = Math.max(...signals.map((signal) => signal.durationSeconds));
      const peaks = signals.length === 1 ? signals[0].peaks : Array.from({ length: resolutions }, (_, index) => {
        let min = Infinity, max = -Infinity;
        for (const signal of signals) {
          const startTime = index * duration / resolutions;
          if (startTime >= signal.durationSeconds || !signal.peaks.length) continue;
          const first = Math.floor(startTime / signal.durationSeconds * signal.peaks.length);
          const last = Math.min(signal.peaks.length, Math.ceil((index + 1) * duration / resolutions / signal.durationSeconds * signal.peaks.length));
          for (let i = first; i < last; i++) { min = Math.min(min, signal.peaks[i].min); max = Math.max(max, signal.peaks[i].max); }
        }
        return Number.isFinite(min) ? { min, max } : { min: 0, max: 0 };
      });
      if (active) setResult({ key: sourceKey, peaks });
    }).catch(() => { if (active) setResult({ key: sourceKey, peaks: [], error: true }); });
    return () => { active = false; };
  }, [sourceKey]);
  const peaks = result?.key === sourceKey ? result.peaks : [];
  const path = useMemo(() => stemWaveformPath(peaks, width), [peaks, width]);
  const status = sourceKey === "[]" ? "Fichier audio manquant" : result?.key === sourceKey && result.error ? "Analyse audio indisponible" : "Analyse audio…";
  return <span ref={element} className="mw-waveform mw-waveform--real" role="img" aria-label={path ? "Forme d’onde du fichier audio" : status}>
    {path ? <svg viewBox={`0 0 ${width} 64`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId}><rect width={playedWidth} height="64" /></clipPath>
        <linearGradient id={`${clipId}-idle`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="rgba(137, 141, 151, .31)" />
          <stop offset="1" stopColor="rgba(68, 71, 78, .2)" />
        </linearGradient>
        <linearGradient id={`${clipId}-signal`} gradientUnits="userSpaceOnUse" x1="0" x2={Math.max(1, playedWidth)}>
          {/* Exact hue/lightness progression from the Rooms mixer playedWaveformColor. */}
          {Array.from({ length: 17 }, (_, index) => <stop key={index} offset={index / 16} stopColor={`hsl(${Math.round(278 - index / 16 * 64)} 94% ${Math.round(68 - index / 16 * 4)}%)`} />)}
        </linearGradient>
      </defs>
      <path className="mw-waveform__base" d={path} style={{ stroke: `url(#${clipId}-idle)` }} />
      <path className="mw-waveform__played" d={path} style={{ stroke: `url(#${clipId}-signal)` }} clipPath={`url(#${clipId})`} />
    </svg> : <small>{status}</small>}
  </span>;
}
