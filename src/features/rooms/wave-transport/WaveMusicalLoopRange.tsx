import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { musicalRegion, secondsPerBar, secondsPerRegionStep, type WaveBars, type WaveGrid, type WaveRegion } from "./waveMusicalGrid";

type Props = {
  region: WaveRegion; duration: number; grid: WaveGrid; bars: WaveBars;
  onChange: (edge: "start" | "end", seconds: number) => void;
};

/** Both handles translate the whole region; no independent resize in musical mode. */
export function WaveMusicalLoopRange({ region, duration, grid, bars, onChange }: Props) {
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; pointerId: number; moved: boolean; nextStart: number } | null>(null);
  const suppressClick = useRef(false);
  const [draft, setDraft] = useState<WaveRegion | null>(null);
  const hintId = useId();
  const shown = draft ?? region;
  const step = secondsPerRegionStep(grid);
  const snap = (start: number) => musicalRegion(start, bars, grid, duration);
  const update = (start: number) => onChange("start", snap(start).start);
  const reset = () => { drag.current = null; setDraft(null); };

  const begin = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    suppressClick.current = false;
    drag.current = { x: event.clientX, start: region.start, pointerId: event.pointerId, moved: false, nextStart: region.start };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const delta = event.clientX - gesture.x;
    // Small hand movements remain a click; a drag must not trigger an extra step.
    if (!gesture.moved && Math.abs(delta) < 4) return;
    const width = surface.current?.getBoundingClientRect().width ?? 0;
    if (width <= 0) return;
    gesture.moved = true;
    const next = snap(gesture.start + delta / width * duration);
    gesture.nextStart = next.start;
    // Magnetic visual feedback while dragging; audio changes only on release.
    setDraft(next);
  };
  const commit = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    suppressClick.current = gesture.moved;
    if (gesture.moved) update(gesture.nextStart);
    reset();
  };
  const cancel = () => { suppressClick.current = true; reset(); };
  const click = (direction: -1 | 1, event: MouseEvent<HTMLButtonElement>) => {
    const suppressed = suppressClick.current && event.detail !== 0;
    suppressClick.current = false;
    if (!suppressed) update(region.start + direction * step);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    const start = event.key === "Home" ? grid.origin : event.key === "End" ? duration
      : event.key === "ArrowLeft" || event.key === "ArrowDown" ? region.start - step
        : event.key === "ArrowRight" || event.key === "ArrowUp" ? region.start + step : null;
    if (start === null) return;
    event.preventDefault();
    update(start);
  };
  const dragEvents = { onPointerDown: begin, onPointerMove: move, onPointerUp: commit,
    onPointerCancel: cancel, onLostPointerCapture: reset, onKeyDown: keyboard };

  return <div className="place-mixer-loop is-musical" ref={surface} role="group" aria-label="Zone de boucle A–B">
    <button type="button" className="place-mixer-loop__selection is-musical" aria-label="Déplacer toute la zone par blocs de 4 mesures"
      aria-describedby={hintId} style={{ left: `${shown.start / duration * 100}%`, width: `${(shown.end - shown.start) / duration * 100}%` }}
      {...dragEvents}>{bars} mesures</button>
    <span id={hintId} className="sr-only">
      Zone de {bars} mesures, début à la mesure {Math.round((shown.start - grid.origin) / secondsPerBar(grid)) + 1}.
      Un clic ou une flèche du clavier déplace toute la zone de 4 mesures.
      Glissez la zone ou un chevron pour aller plus loin, avec un recalage par blocs de 4 mesures au relâchement.
    </span>
    {(["start", "end"] as const).map(edge => <button key={edge} type="button"
      className={`place-mixer-loop__handle is-${edge}`} style={{ left: `${shown[edge] / duration * 100}%` }}
      aria-label={edge === "start" ? "Reculer la zone de 4 mesures" : "Avancer la zone de 4 mesures"} aria-describedby={hintId}
      {...dragEvents} onClick={event => click(edge === "start" ? -1 : 1, event)}>
      <span aria-hidden="true">{edge === "start" ? <ChevronLeft /> : <ChevronRight />}</span><i aria-hidden="true" />
    </button>)}
  </div>;
}
