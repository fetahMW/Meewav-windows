import { useEffect, useState, type ReactNode } from 'react';
import { Headphones, Volume2, VolumeX } from 'lucide-react';
import { dbToGain, formatDb, gainToDb } from '../../../runtime/studioAudioSettings';

export default function StudioAudioStrip({ name, icon, gain, muted, level, active, monitoring, disabled, onGain, onMute, onMonitor, children, detail }: {
  name: string; icon: ReactNode; gain: number; muted: boolean; level: number; active: boolean;
  monitoring: boolean; disabled?: boolean; onGain: (gain: number) => void; onMute: () => void; onMonitor: () => void;
  children: ReactNode; detail: string;
}) {
  const [clipped, setClipped] = useState(false);
  useEffect(() => { if (level >= .98) setClipped(true); }, [level]);
  const clipping = clipped || level >= .98;
  const db = gainToDb(level);
  return <article className={`studio-audio-strip${muted ? ' is-muted' : ''}`} aria-label={name}>
    <header><span className="studio-audio-strip__icon">{icon}</span><div><small>{detail}</small><h4>{name}</h4></div><span className={`studio-audio-strip__signal${active ? ' is-active' : ''}`}>{active ? muted ? 'Coupé' : 'Connecté' : 'À connecter'}</span></header>
    <div className="studio-audio-strip__source">{children}</div>
    <div className="studio-audio-strip__meter" role="meter" aria-label={`Niveau de sortie · ${name}`} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.round(db)} aria-valuetext={active ? formatDb(level) : 'Source non connectée'}>
      <span style={{ clipPath: `inset(0 ${100 - (active ? (db + 60) / 60 * 100 : 0)}% 0 0)` }} />
    </div>
    <div className="studio-audio-strip__scale" aria-hidden="true"><span>−60</span><span>−36</span><span>−18</span><span>−6</span><span>0 dB</span></div>
    <div className="studio-audio-strip__fader"><label><span>Volume</span><input type="range" aria-label={`Volume · ${name}`} min={-60} max={0} step={.5} value={gainToDb(gain)} onChange={event => onGain(dbToGain(Number(event.target.value)))} /></label><output>{formatDb(gain)}</output></div>
    <div className="studio-audio-strip__buttons">
      <button type="button" aria-label={`Couper · ${name}`} aria-pressed={muted} className={muted ? 'is-cut' : ''} onClick={onMute}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}<span>{muted ? 'Coupé' : 'Muet'}</span></button>
      <button type="button" aria-label={`Écoute casque · ${name}`} aria-pressed={monitoring} disabled={!active || disabled} onClick={onMonitor}><Headphones size={16} /><span>Écouter</span></button>
      <button type="button" className={`studio-audio-strip__clip${clipping ? ' is-clipped' : ''}`} disabled={!clipping} onClick={() => setClipped(false)} aria-label={`Effacer la saturation · ${name}`} title={clipping ? 'Saturation détectée. Baisse le niveau de ton interface audio puis efface ce témoin.' : 'Témoin de saturation mémorisé'}>{clipping ? 'SATURATION' : 'CRÊTE'}<i /></button>
    </div>
  </article>;
}
