import type { KeyboardEvent } from "react";
import type { WaveListeningMode } from "./WaveAudioTransport";
import "./wave-listening-selector.css";

const MODES: ReadonlyArray<{ value: WaveListeningMode; label: string }> = [
  { value: "base", label: "BASE" },
  { value: "loop", label: "BOUCLE" },
  { value: "mix", label: "MIX" },
];

export default function WaveListeningSelector({ mode, hasCandidate, hasReference = true, onChange }: {
  mode: WaveListeningMode;
  hasCandidate: boolean;
  hasReference?: boolean;
  onChange: (mode: WaveListeningMode) => void;
}) {
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
    const current = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
      : (current + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
    buttons[next]?.click();
  };
  return <div className="wave-listening-selector" role="radiogroup" aria-label="Écoute du lecteur" onKeyDown={keyboard}>
    {MODES.map(({ value, label }) => <button key={value} type="button" role="radio"
      aria-checked={mode === value} disabled={!hasCandidate || value !== "loop" && !hasReference} tabIndex={mode === value || mode === "beat" && value === "base" ? 0 : -1}
      onClick={() => onChange(value)}>{label}</button>)}
  </div>;
}
