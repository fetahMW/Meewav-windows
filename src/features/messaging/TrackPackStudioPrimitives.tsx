import { useId } from "react";
import {
  TRACK_PACK_INSTRUMENTS,
  type TrackPackInstrument,
} from "./trackPackInstrumentCatalog";

const waveform = [18, 28, 44, 32, 62, 75, 41, 52, 84, 58, 70, 38, 50, 90, 64, 48, 76, 32, 56, 81, 62, 92, 51, 68, 34, 58, 78, 44, 65, 36, 54, 72, 42, 60, 30, 50, 68, 38, 56, 26, 46, 74, 39, 63, 86, 52, 69, 35, 57, 79, 43, 67, 31, 49, 71, 40, 61, 29, 53, 77, 45, 66, 37, 55];

const waveformVariants = [
  waveform,
  waveform.map((height, index) => Math.max(12, Math.min(92, height * (0.58 + Math.abs(Math.sin(index * 0.34)) * 0.5)))),
  waveform.map((height, index) => Math.max(10, Math.min(96, waveform[(index * 7) % waveform.length] * 0.72 + Math.abs(Math.sin(index * 0.18)) * 24))),
  waveform.map((height, index) => Math.max(14, Math.min(94, (height + waveform[(index + 11) % waveform.length]) * (0.38 + Math.abs(Math.cos(index * 0.13)) * 0.22)))),
  waveform.map((height, index) => Math.max(9, Math.min(98, height * (index % 8 < 3 ? 0.48 : 0.98) + Math.abs(Math.sin(index * 0.49)) * 12))),
];

function createWaveformPath(peaks: number[]) {
  const width = 640;
  const center = 32;
  const maxAmplitude = 27;
  const detailedPeaks = peaks.flatMap((peak, index) => {
    const next = peaks[(index + 1) % peaks.length];
    return [Math.max(8, peak * 0.66), peak, Math.max(7, (peak + next) * 0.28)];
  });
  return detailedPeaks.map((peak, index) => {
    const x = (index + 0.5) / detailedPeaks.length * width;
    const amplitude = Math.max(2.5, peak / 100 * maxAmplitude);
    return `M ${x.toFixed(2)} ${(center - amplitude).toFixed(2)} V ${(center + amplitude).toFixed(2)}`;
  }).join(" ");
}

export function Waveform({
  progress = 58,
  compact = false,
  variant = 0,
  animated = false,
}: {
  progress?: number;
  compact?: boolean;
  variant?: number;
  animated?: boolean;
}) {
  const instanceId = `mw-waveform-${useId().replace(/:/g, "")}`;
  const safeProgress = Math.max(0, Math.min(100, progress));
  const peaks = waveformVariants[Math.abs(variant) % waveformVariants.length];
  const path = createWaveformPath(peaks);
  const gradientId = `${instanceId}-gradient`;
  const clipId = `${instanceId}-progress`;

  return (
    <span className={`mw-waveform ${compact ? "is-compact" : ""} ${animated ? "is-animated" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 640 64" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="640" y2="0" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6257ff" />
            <stop offset="0.55" stopColor="#824cff" />
            <stop offset="1" stopColor="#a064ff" />
          </linearGradient>
          <clipPath id={clipId}>
            <rect className="mw-waveform__progress-clip" width={640 * safeProgress / 100} height="64" />
          </clipPath>
        </defs>
        <path className="mw-waveform__base" d={path} />
        <path className="mw-waveform__played" d={path} stroke={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />
      </svg>
    </span>
  );
}

export function InstrumentArtwork({ instrument, compact = false }: { instrument: TrackPackInstrument; compact?: boolean }) {
  return (
    <span className={`mw-instrument-artwork ${compact ? "is-compact" : ""}`} aria-hidden="true">
      <img src={TRACK_PACK_INSTRUMENTS[instrument].asset} alt="" />
    </span>
  );
}
