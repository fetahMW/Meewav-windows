import { useEffect, useState } from "react";
import { useViewerMixer } from "./ViewerMixerContext";
import "./viewer-green-house-audio.css";

/** Inspect the existing personal bus; never capture, monitor or publish a second audio stream. */
export default function ViewerGreenHouseAudioCheck({ onVerified }: { onVerified: (ready: boolean) => void }) {
  const mix = useViewerMixer();
  const [confirmed, setConfirmed] = useState(false);
  const settings = mix ? `${mix.outputTrack?.id}:${JSON.stringify(mix.levels)}` : "";
  const available = Boolean(mix && mix.outputTrack?.readyState === "live" && mix.engine.status === "running" && mix.engine.inputState("voice") === "active");
  useEffect(() => { setConfirmed(false); onVerified(false); }, [settings, available, onVerified]);
  useEffect(() => { onVerified(available && confirmed); }, [available, confirmed, onVerified]);
  if (!mix) return null;
  return <div className="viewer-green-house-audio" aria-label="Vérification du mix personnel">
    <strong>Le son que tu enverras au host</strong>
    <p>Parle et vérifie tes niveaux. Le mix reste privé jusqu’à une autorisation de transmission.</p>
    <label>Ma voix <meter min={0} max={1} value={Math.min(1,mix.meters.voice)} aria-label="Niveau de ma voix après effets" /></label>
    <label>Master <meter min={0} max={1} value={Math.min(1,mix.meters.master)} aria-label="Niveau du Master personnel" /></label>
    <small>{!available ? "Active ton aperçu pour vérifier le micro du mixeur." : mix.levels.master.muted || mix.levels.master.gain === 0 ? "Master coupé : aucun son personnel ne sera envoyé." : mix.levels.voice.muted || mix.levels.voice.gain === 0 ? "Ma voix est coupée dans le mixeur. Les autres sources gardent leur niveau." : "Même micro, mêmes effets et mêmes niveaux que dans ton mixeur."}</small>
    {mix.meters.master >= 1 ? <p role="status">Master trop fort : baisse son niveau dans le mixeur.</p> : null}
    <label><input type="checkbox" disabled={!available} checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} />J’ai vérifié mon mix et les pistes que je souhaite laisser coupées.</label>
  </div>;
}
