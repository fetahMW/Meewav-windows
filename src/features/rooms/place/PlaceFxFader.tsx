import { useId, type CSSProperties } from 'react';
import { Power } from 'lucide-react';

type Props = {
  label: string;
  sliderLabel?: string;
  value: number;
  valueLabel: string;
  lowLabel: string;
  highLabel: string;
  disabled: boolean;
  enabled?: boolean;
  onToggle?: () => void;
  onChange: (value: number) => void;
};

/** A compact console strip. The native range provides pointer and keyboard input. */
export default function PlaceFxFader({ label, sliderLabel = label, value, valueLabel, lowLabel, highLabel, disabled, enabled = true, onToggle, onChange }: Props) {
  const id = useId();
  return <div className="place-pro-fader" data-active={enabled} style={{ '--pro-fader-position': `${Math.min(1, Math.max(0, value)) * 100}%` } as CSSProperties}>
    <label htmlFor={id}>{label}</label>
    <output htmlFor={id}>{valueLabel}</output>
    <div className="place-pro-fader__travel">
      <span aria-hidden="true" className="place-pro-fader__ticks" />
      <input id={id} type="range" min="0" max="1" step="0.01" value={value}
        disabled={disabled || !enabled} aria-label={sliderLabel} aria-orientation="vertical" aria-valuetext={valueLabel}
        onChange={event => onChange(Number(event.currentTarget.value))} />
      <span className="place-pro-fader__ends" aria-hidden="true"><span>{highLabel}</span><span>{lowLabel}</span></span>
    </div>
    {onToggle ? <button type="button" disabled={disabled} aria-pressed={enabled}
      aria-label={`${enabled ? 'Désactiver' : 'Activer'} ${label}`} onClick={onToggle}><Power aria-hidden="true" /><span>{enabled ? 'Actif' : 'Bypass'}</span></button> : null}
  </div>;
}
