import { useId, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { LocateFixed } from "lucide-react";
import type { PlaceMixerLoopRegion } from "./placeMixerLoop";
import "./place-mixer-loop.css";
import type { WaveGrid, WaveBars } from "../wave-transport/waveMusicalGrid";
import { WaveMusicalLoopRange } from "../wave-transport/WaveMusicalLoopRange";

function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
}

export function PlaceMixerCueControls({ cueSeconds, hasTrack, loopActive, onReturn }: {
  cueSeconds: number;
  hasTrack: boolean;
  loopActive: boolean;
  onReturn: () => void;
}) {
  return <span className={`place-mixer-cue${loopActive ? " is-looping" : ""}`}>
    <button type="button" className="place-mixer-audio__cue-return" onClick={onReturn} disabled={!hasTrack}
      aria-label={loopActive ? "Revenir au début de la boucle" : `Revenir au curseur${cueSeconds > 0 ? ` à ${timeLabel(cueSeconds)}` : ""}`}
      title={loopActive ? "Revenir au point A" : "Revenir au curseur"}>
      <LocateFixed aria-hidden="true" />
    </button>
  </span>;
}

type LoopRangeProps = {
  musical?: { grid: WaveGrid; bars: WaveBars };
  region: PlaceMixerLoopRegion;
  duration: number;
  onChange: (edge: "start" | "end", seconds: number) => void;
};

export function PlaceMixerLoopRange({ musical, ...props }: LoopRangeProps) {
  return musical ? <WaveMusicalLoopRange {...props} {...musical} /> : <FreeMixerLoopRange {...props} />;
}

function FreeMixerLoopRange({ region, duration, onChange }: Omit<LoopRangeProps, "musical">) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; seconds: number; pointerId: number } | null>(null);
  const hintId = useId();
  const minimumLength = Math.min(.25, duration);
  const begin = (edge: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, seconds: region[edge], pointerId: event.pointerId };
  };
  const move = (edge: "start" | "end", event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    const width = surface.current?.getBoundingClientRect().width ?? 0;
    if (width > 0) {
      const next = drag.current.seconds + (event.clientX - drag.current.x) / width * duration;
      onChange(edge, next);
    }
  };
  const keyboard = (edge: "start" | "end", event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.shiftKey ? 1 : .1;
    const minimum = edge === "start" ? 0 : region.start + minimumLength;
    const maximum = edge === "start" ? region.end - minimumLength : duration;
    const value = event.key === "Home" ? minimum : event.key === "End" ? maximum
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? region[edge] - step
        : event.key === "ArrowRight" || event.key === "ArrowUp" ? region[edge] + step : null;
    if (value === null) return;
    event.preventDefault();
    onChange(edge, value);
  };
  return <div className="place-mixer-loop" ref={surface} role="group" aria-label="Zone de boucle A–B">
    <span className="place-mixer-loop__selection" aria-hidden="true" style={{ left: `${region.start / duration * 100}%`, width: `${(region.end - region.start) / duration * 100}%` }} />
    <span id={hintId} className="sr-only">Glissez les repères ou utilisez les flèches du clavier. Majuscule : une seconde.</span>
    {(["start", "end"] as const).map((edge) => <button key={edge} type="button" role="slider"
      className={`place-mixer-loop__handle is-${edge}`} style={{ left: `${region[edge] / duration * 100}%` }}
      aria-label={edge === "start" ? "Début de la boucle A" : "Fin de la boucle B"}
      aria-valuemin={edge === "start" ? 0 : region.start + minimumLength}
      aria-valuemax={edge === "start" ? region.end - minimumLength : duration}
      aria-valuenow={region[edge]} aria-valuetext={timeLabel(region[edge])} aria-describedby={hintId}
      onPointerDown={(event) => begin(edge, event)} onPointerMove={(event) => move(edge, event)}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
      onLostPointerCapture={() => { drag.current = null; }} onKeyDown={(event) => keyboard(edge, event)}>
      <span aria-hidden="true">{edge === "start" ? "A" : "B"}</span><i aria-hidden="true" />
    </button>)}
  </div>;
}
