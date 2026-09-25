import { Headphones, Layers3, Pause, Play } from "lucide-react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import WaveCategoryChip from "./WaveCategoryChip";

type WaveLoopCardProps = {
  accent: string;
  avatarUrl?: string;
  avatarFallback: string;
  title: string;
  selectionLabel?: string;
  grade?: ReactNode;
  category: string;
  meta: string;
  detail?: string;
  selected?: boolean;
  playing?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  onPlay: () => void;
  selectOnPlay?: boolean;
  showPlay?: boolean;
  beforeCategoryAction?: ReactNode;
  quickActions?: ReactNode;
  stateClassName?: string;
  children?: ReactNode;
};

export function WaveLoopCard({ accent, avatarUrl, avatarFallback, title, selectionLabel, grade, category, meta, detail, selected = false, playing = false, disabled = false, onSelect, onPlay, selectOnPlay = true, showPlay = true, beforeCategoryAction, quickActions, stateClassName = "", children }: WaveLoopCardProps) {
  const selectFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget || !onSelect || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onSelect();
  };

  return <article
    className={`wave-loop-card${beforeCategoryAction ? " has-before-category-action" : ""}${quickActions ? " has-quick-actions" : ""}${selected ? " is-selected" : ""}${playing ? " is-playing" : ""}${stateClassName ? ` ${stateClassName}` : ""}`}
    style={{ "--wave-loop-accent": accent } as CSSProperties}
    tabIndex={onSelect ? 0 : undefined}
    aria-label={selectionLabel ?? (onSelect ? `Sélectionner ${title}` : title)}
    data-selected={selected || undefined}
    onClick={onSelect}
    onKeyDown={onSelect ? selectFromKeyboard : undefined}
  >
    <span className="wave-loop-card__avatar">
      <em>{avatarFallback}</em>
      {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
    </span>
    <span className="wave-loop-card__identity">
      <span className="wave-loop-card__name"><strong>{title}</strong>{grade}</span>
      {detail ? <small>{detail}</small> : null}
    </span>
    {beforeCategoryAction ? <span className="wave-loop-card__before-category" onClick={(event) => event.stopPropagation()}>{beforeCategoryAction}</span> : null}
    <span className="wave-loop-card__meta"><WaveCategoryChip label={category} /><small>{meta}</small></span>
    {quickActions ? <span className="wave-loop-card__quick-actions" onClick={(event) => event.stopPropagation()}>{quickActions}</span> : null}
    {showPlay ? <button
      type="button"
      className="wave-loop-card__play"
      aria-label={playing ? `Mettre ${title} en pause` : `Écouter ${title}`}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); if (selectOnPlay) onSelect?.(); onPlay(); }}
    >{playing ? <Pause /> : <Play />}</button> : null}
    {children}
  </article>;
}

type WaveBottomBarProps = {
  accent: string;
  avatarUrl?: string;
  avatarFallback: string;
  title: string;
  grade?: ReactNode;
  category: string;
  meta?: string;
  children: ReactNode;
  label: string;
};

export function WaveBottomBar({ accent, avatarUrl, avatarFallback, title, grade, category, meta, children, label }: WaveBottomBarProps) {
  return <aside className="wave-bottom-bar" style={{ "--wave-loop-accent": accent } as CSSProperties} aria-label={label}>
    <header className="wave-bottom-bar__identity">
      <span className="wave-bottom-bar__avatar"><em>{avatarFallback}</em>{avatarUrl ? <img key={avatarUrl} src={avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span>
      <span><span className="wave-bottom-bar__name"><strong>{title}</strong>{grade}</span><span className="wave-bottom-bar__meta"><b>{category}</b>{meta ? <small>{meta}</small> : null}</span></span>
    </header>
    <div className="wave-bottom-bar__controls">{children}</div>
  </aside>;
}

type WaveListeningModeSelectorProps = {
  mode: "solo" | "beat";
  disabled?: boolean;
  onChange: (mode: "solo" | "beat") => void;
  soloLabel?: string;
  beatLabel?: string;
  className?: string;
};

export function WaveListeningModeSelector({ mode, disabled = false, onChange, soloLabel = "Écouter en solo", beatLabel = "Écouter avec le beat", className = "" }: WaveListeningModeSelectorProps) {
  return <fieldset className={`wave-listening-mode-selector${className ? ` ${className}` : ""}`} disabled={disabled}>
    <legend>Mode d’écoute</legend>
    <button type="button" className={mode === "solo" ? "is-active" : ""} aria-label={soloLabel} aria-pressed={mode === "solo"} title="Solo" onClick={() => onChange("solo")}><Headphones /><span>Solo</span></button>
    <button type="button" className={mode === "beat" ? "is-active" : ""} aria-label={beatLabel} aria-pressed={mode === "beat"} title="Beat" onClick={() => onChange("beat")}><Layers3 /><span>Beat</span></button>
  </fieldset>;
}
