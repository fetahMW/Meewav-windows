import { AudioLines, CheckCircle2, MonitorPlay, MonitorUp, ShieldCheck, Square, TriangleAlert, Volume2 } from "lucide-react";
import { useState } from "react";
import PlaceScreenSharePreview from "../../place/PlaceScreenSharePreview";
import { ToolNotice, ToolPanelHeader, ToolSection } from "./RoomToolPanelPrimitives";

export type ScreenShareToolProps = {
  roomLabel: string;
  disabled: boolean;
  previewStream: MediaStream | null;
  published: boolean;
  requesting: boolean;
  hasAudio: boolean;
  sourceLabel: string | null;
  host?: { displayName: string; avatarUrl: string };
  variant?: "default" | "place";
  onSelect: (options?: { includeAudio?: boolean }) => Promise<void>;
  onPublish: () => void;
  onStop: () => void;
};

export default function ScreenShareToolPanel(props: ScreenShareToolProps) {
  const [includeAudio, setIncludeAudio] = useState(true);
  if (props.variant === "place") {
    const host = props.host ?? { displayName: "Host de la Wave", avatarUrl: "" };
    const captureReady = Boolean(props.previewStream && props.hasAudio);
    const captureStatus = props.published
      ? "EN DIRECT"
      : captureReady
        ? "PRÊT"
        : props.previewStream
          ? "AUDIO REQUIS"
          : "À CONFIGURER";
    return <section className="room-tool-panel is-wave-place-screen place-tool-card is-screen">
      <header className="place-tool-card__header"><span className="place-tool-card__glyph"><MonitorUp aria-hidden="true" /></span><span><small>CAPTURE DU DAW</small><strong>Partage d’écran</strong><em>Prévisualisez votre DAW et son audio avant de diffuser</em></span><b className={`place-tool-card__status${captureReady ? " is-ready" : " is-warning"}`}><i /> {captureStatus}</b></header>
      <div className={`place-tool-screen__preview${props.previewStream ? " is-active" : ""}${props.published ? " is-published" : ""}`}>
        <PlaceScreenSharePreview stream={props.previewStream} host={host} layout="source-primary" />
        <span className={`wave-daw-audio-health${props.hasAudio ? " is-detected" : ""}`}><AudioLines aria-hidden="true" /><span><strong>DAW · {props.hasAudio ? "Son détecté" : "Son absent"}</strong><small>{props.sourceLabel ?? "Fenêtre du logiciel attendue"}</small></span><i aria-hidden="true"><b /><b /><b /><b /><b /></i></span>
        {props.previewStream ? <span className="place-tool-screen__preview-meta"><small>{props.published ? "SOURCE OFFICIELLE DIFFUSÉE DANS LA WAVE" : "APERÇU PRIVÉ · RIEN N’EST ENVOYÉ"}</small><strong>{props.sourceLabel ?? "Fenêtre du DAW"}</strong><em>{props.hasAudio ? "Piste stéréo système disponible" : "Reprenez la capture en cochant le partage audio"}</em></span> : <span className="place-tool-screen__empty"><MonitorUp aria-hidden="true" /><strong>Sélectionnez la fenêtre de votre DAW</strong><small>Activez obligatoirement « Partager l’audio » dans le sélecteur du navigateur</small></span>}
      </div>
      <div className="place-tool-screen__settings"><small>PARAMÈTRES</small><label className="place-tool-card__audio"><span><Volume2 aria-hidden="true" /><span><strong>Son de l’ordinateur · obligatoire</strong><small>{props.hasAudio ? "La piste du DAW est reçue séparément du microphone" : "Le bouton de diffusion restera verrouillé sans piste audio"}</small></span></span><input aria-label="Partager obligatoirement le son du DAW" type="checkbox" checked={includeAudio} disabled onChange={(event) => setIncludeAudio(event.currentTarget.checked)} /></label><p className={`place-tool-card__availability${props.previewStream && !props.hasAudio ? " is-warning" : ""}`}>{props.previewStream && !props.hasAudio ? <TriangleAlert aria-hidden="true" /> : <CheckCircle2 aria-hidden="true" />}<span><strong>{props.previewStream && !props.hasAudio ? "Audio système manquant" : "Diffusion privée avant validation"}</strong><span>{props.published ? "Le DAW constitue la source audio officielle de la Wave." : props.previewStream && !props.hasAudio ? "Changez de source et activez le partage audio dans le navigateur." : "Rien n’est envoyé au public avant votre confirmation."}</span></span></p></div>
      <footer className="place-tool-card__footer"><span>{props.published ? "Partage en cours · le micro du host reste une piste distincte." : captureReady ? "DAW et son système reçus · vous pouvez diffuser." : props.previewStream ? "Le son du DAW est obligatoire avant la diffusion." : "Choisissez la fenêtre de votre DAW pour commencer."}</span><div className="place-tool-screen__actions"><button type="button" className="place-tool-action is-secondary place-tool-card__share" aria-busy={props.requesting} disabled={props.disabled || props.requesting} onClick={() => void props.onSelect({ includeAudio: true })}>{props.requesting ? "Ouverture…" : props.previewStream ? "Changer de source" : "Choisir le DAW"}</button>{props.published ? <button type="button" className="place-tool-action is-danger place-tool-card__share is-active" onClick={props.onStop}>Arrêter le partage</button> : <button type="button" className="place-tool-action is-primary place-tool-card__share" disabled={props.disabled || !captureReady || props.requesting} onClick={props.onPublish}>Démarrer le partage</button>}</div></footer>
    </section>;
  }
  return <div className="room-tool-panel is-screen-share">
    <ToolPanelHeader eyebrow="CAPTURE LOCALE" title="Partage d’écran" description={`Support de diffusion · ${props.roomLabel}`} status={props.published ? "EN DIRECT" : props.previewStream ? "APERÇU" : "PRÊT"} />
    <div className={`room-screen-share__preview${props.previewStream ? " is-ready" : ""}${props.published ? " is-live" : ""}`}>
      <MonitorPlay aria-hidden="true" />
      <span><small>{props.published ? "SOURCE PUBLIÉE" : props.previewStream ? "APERÇU PRIVÉ" : "AUCUNE SOURCE"}</small><strong>{props.sourceLabel ?? "Choisissez une fenêtre, un écran ou un onglet"}</strong><em>{props.hasAudio ? "Audio système détecté" : "Sans audio système"}</em></span>
    </div>
    <ToolSection title="Préparation">
      <label className="room-tool-toggle"><span><Volume2 /><span><strong>Son de l’appareil</strong><small>Demander l’audio lors de la sélection</small></span></span><input type="checkbox" checked={includeAudio} disabled={Boolean(props.previewStream) || props.disabled} onChange={(event) => setIncludeAudio(event.currentTarget.checked)} /></label>
      <ToolNotice><ShieldCheck /> Rien n’est montré au public avant le second clic « Démarrer le partage ».</ToolNotice>
    </ToolSection>
    <footer className="room-tool-panel__footer"><span>{props.disabled ? "Action réservée à la régie autorisée." : "La source reste modifiable avant diffusion."}</span><div>
      <button type="button" disabled={props.disabled || props.requesting} onClick={() => void props.onSelect({ includeAudio })}><MonitorUp />{props.requesting ? "Ouverture…" : props.previewStream ? "Changer" : "Choisir une source"}</button>
      {props.published ? <button type="button" className="is-danger" onClick={props.onStop}><Square />Arrêter</button> : <button type="button" className="is-primary" disabled={props.disabled || !props.previewStream} onClick={props.onPublish}><MonitorPlay />Démarrer le partage</button>}
    </div></footer>
  </div>;
}
