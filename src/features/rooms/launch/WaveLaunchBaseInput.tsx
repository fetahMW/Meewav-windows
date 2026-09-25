import { useRef } from "react";
import { AudioLines, Check, Upload, X } from "lucide-react";
import type { WaveBaseLoop } from "../tools/roomTools.types";
import { WAVE_AUDIO_ACCEPT } from "../tools/waveAudioRules";
import { validateWaveLaunchBase } from "./roomLaunch";

export type WaveLaunchFormat = 4 | 8 | 16 | "long";
export function waveLaunchDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export default function WaveLaunchBaseInput({ base, format, bpm, loading, onFile, onFormat, onRemove }: {
  base?: WaveBaseLoop; format: WaveLaunchFormat; bpm: number; loading: boolean;
  onFile: (file: File) => void; onFormat: (format: WaveLaunchFormat) => void; onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const invalid = base ? validateWaveLaunchBase(base, bpm) : null;
  return <section className="wave-launch-base" aria-label="Boucle de base obligatoire">
    <div className="wave-launch-base__heading"><AudioLines /><div><h3>Boucle de base</h3><p>Le point de départ de ta Wave.</p></div><small>OBLIGATOIRE</small></div>
    <div className="wave-launch-base__formats" role="group" aria-label="Format de la boucle de base">
      {([4, 8, 16, "long"] as const).map((value) => <button type="button" key={value} disabled={loading} aria-pressed={format === value} onClick={() => onFormat(value)}>{value === "long" ? "Son long" : `${value} mesures`}</button>)}
    </div>
    <p>{format === "long" ? "Conserve ton son entier. La durée de la base ne change pas la limite des contributions." : `En 4/4 · ${format} mesures à ${bpm} BPM${bpm > 0 ? ` ≈ ${waveLaunchDuration(60 / bpm * 4 * format)}` : ""}. Le fichier sera vérifié avant l’ouverture.`}</p>
    <input ref={input} type="file" hidden accept={WAVE_AUDIO_ACCEPT} aria-label="Fichier de la boucle de base" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onFile(file); }} />
    <button type="button" className="wave-launch-base__import" onClick={() => input.current?.click()} disabled={loading}>
      {base && !invalid ? <Check /> : <Upload />}<span><strong>{loading ? "Vérification du son…" : base?.fileName ?? "Importer la boucle de base"}</strong><small>{base?.durationSeconds ? `${waveLaunchDuration(base.durationSeconds)} · ${((base.fileSize ?? 0) / 1024 / 1024).toFixed(1)} Mo · Remplacer` : "WAV, MP3, AAC, FLAC, M4A · 64 Mo max."}</small></span>
    </button>
    {base ? <div className="wave-launch-base__preview"><audio controls preload="metadata" src={base.mediaUrl} aria-label="Préécouter la boucle de base" /><button type="button" onClick={onRemove} aria-label="Retirer la boucle de base"><X /></button></div> : null}
    {invalid ? <p role="alert">{invalid}</p> : null}
  </section>;
}
