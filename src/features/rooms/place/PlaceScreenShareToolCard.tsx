import { MonitorUp, Volume2 } from "lucide-react";
import PlaceScreenSharePreview from "./PlaceScreenSharePreview";
import "./place-screen-share-premium.css";

export type PlaceScreenShareToolCardProps = {
  roomLabel?: string;
  disabled?: boolean;
  host: { displayName: string; avatarUrl: string };
  previewStream: MediaStream | null;
  published: boolean;
  requesting: boolean;
  hasAudio: boolean;
  sourceLabel: string | null;
  elapsedSeconds: number;
  includeDeviceAudio: boolean;
  interactionBusy: boolean;
  selectionBusy: boolean;
  onIncludeDeviceAudioChange: (includeAudio: boolean) => void;
  onSelect: (options?: { includeAudio?: boolean }) => Promise<void> | void;
  onPublish: () => void;
  onStop: () => void;
};

/**
 * Canonical La Place screen-share card.
 *
 * Specialized rooms deliberately render this component instead of maintaining
 * their own copy, while their existing media callbacks remain the source of
 * truth for capture, preview, publication and stop.
 */
export default function PlaceScreenShareToolCard({
  roomLabel,
  disabled = false,
  host,
  previewStream,
  published,
  requesting,
  hasAudio,
  sourceLabel,
  elapsedSeconds,
  includeDeviceAudio,
  interactionBusy,
  selectionBusy,
  onIncludeDeviceAudioChange,
  onSelect,
  onPublish,
  onStop,
}: PlaceScreenShareToolCardProps) {
  const selectionPending = selectionBusy || requesting;
  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;

  return (
    <section
      className="place-tool-card is-screen place-screen-share-tool-card"
      aria-label={roomLabel ? `Partage d’écran · ${roomLabel}` : undefined}
    >
      <header className="place-tool-card__header">
        <span className="place-tool-card__glyph"><MonitorUp aria-hidden="true" /></span>
        <span>
          <small>OUTILS / PARTAGE</small>
          <strong>Partage d’écran</strong>
          <em>Prévisualisez votre source avant diffusion</em>
        </span>
        <b className="place-tool-card__status"><i /> {published ? "SCÈNE" : previewStream ? "APERÇU" : "PRÊT"}</b>
      </header>

      {published ? <span className="sr-only" role="status" aria-live="polite">● Partage d’écran actif</span> : null}

      <div className={`place-tool-screen__preview${previewStream ? " is-active" : ""}${published ? " is-published" : ""}`}>
        {previewStream ? <PlaceScreenSharePreview stream={previewStream} host={host} layout="source-primary" /> : null}
        {previewStream
          ? <span className="place-tool-screen__preview-meta">
            <small>{published ? "SOURCE DISPONIBLE SUR LA SCÈNE" : "APERÇU LOCAL UNIQUEMENT"}</small>
            <strong>{published ? elapsedLabel : sourceLabel ?? "Source sélectionnée"}</strong>
            <em>{hasAudio ? "Piste audio détectée" : "Aucune piste audio capturée"}</em>
          </span>
          : <span className="place-tool-screen__empty">
            <MonitorUp aria-hidden="true" />
            <strong>Sélectionnez une source à partager</strong>
            <small>La source reste privée jusqu’à validation</small>
          </span>}
      </div>

      <div className="place-tool-screen__settings">
        <small>PARAMÈTRES</small>
        <label className="place-tool-card__audio">
          <span>
            <Volume2 aria-hidden="true" />
            <span>
              <strong>Son de l’appareil</strong>
              <small>{previewStream
                ? hasAudio
                  ? "Audio réellement inclus dans cette capture"
                  : "Cette source n’a fourni aucune piste audio"
                : "Demander l’audio système lors de la sélection"}</small>
            </span>
          </span>
          <input
            type="checkbox"
            checked={includeDeviceAudio}
            disabled={Boolean(previewStream) || disabled}
            onChange={(event) => onIncludeDeviceAudioChange(event.currentTarget.checked)}
          />
        </label>
        <p className="place-tool-card__availability">
          <strong>{published ? "Diffusion active" : "Aperçu privé avant validation"}</strong>
          <span>{published ? "La source est envoyée à la Scène locale." : "Rien n’est envoyé à la Scène avant votre confirmation."}</span>
        </p>
      </div>

      <footer className="place-tool-card__footer">
        <span>{disabled
          ? "Action réservée à la régie autorisée."
          : published
            ? "Partage en cours. Arrêter coupe aussi la capture locale."
            : previewStream
              ? "Vérifiez l’aperçu, puis confirmez la diffusion."
              : "Choisissez d’abord une source à prévisualiser."}</span>
        <div className="place-tool-screen__actions">
          <button
            type="button"
            className={`place-tool-action ${previewStream ? "is-secondary" : "is-primary"} place-tool-card__share`}
            aria-busy={selectionPending}
            disabled={disabled || interactionBusy || requesting}
            onClick={() => void onSelect({ includeAudio: includeDeviceAudio })}
          >
            {selectionPending ? "Ouverture…" : previewStream ? "Changer de source" : "Choisir une source"}
          </button>
          {published
            ? <button
              type="button"
              className="place-tool-action is-danger place-tool-card__share is-active"
              disabled={disabled}
              onClick={onStop}
            >Arrêter le partage</button>
            : <button
              type="button"
              className={`place-tool-action ${previewStream ? "is-primary" : "is-secondary"} place-tool-card__share`}
              disabled={disabled || !previewStream || interactionBusy || requesting}
              onClick={onPublish}
            >Démarrer le partage</button>}
        </div>
      </footer>
    </section>
  );
}
