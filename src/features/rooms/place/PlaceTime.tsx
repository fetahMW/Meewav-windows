import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import "./place-time-refinement.css";
import { formatPlaceRoomTime, placeRoomTime, usePlaceRoomTime } from "./placeRoomTime";

export default function PlaceTime() {
  const time = usePlaceRoomTime();
  const minutes = Math.floor(time.durationSeconds / 60);
  const seconds = time.durationSeconds % 60;

  return (
    <section className="place-time" aria-labelledby="place-time-title">
      <header className="place-time__header">
        <span className="place-time__icon"><Timer aria-hidden="true" /></span>
        <span>
          <small>RÉGIE TEMPS</small>
          <strong id="place-time-title">Compte à rebours</strong>
        </span>
        <label className="place-time__toggle">
          <span>Afficher</span>
          <input type="checkbox" checked={time.enabled} onChange={(event) => placeRoomTime.setEnabled(event.currentTarget.checked)} />
          <i aria-hidden="true" />
        </label>
      </header>

      <output className={`place-time__display is-${time.status}`} aria-live="polite">
        {formatPlaceRoomTime(time.remainingMs)}
      </output>

      <div className="place-time__setup" aria-label="Régler le compte à rebours">
        <label>
          <span>Minutes</span>
          <input
            type="number"
            min="0"
            max="99"
            inputMode="numeric"
            value={minutes}
            onChange={(event) => placeRoomTime.configure(Number(event.currentTarget.value), seconds)}
          />
        </label>
        <span aria-hidden="true">:</span>
        <label>
          <span>Secondes</span>
          <input
            type="number"
            min="0"
            max="59"
            inputMode="numeric"
            value={seconds}
            onChange={(event) => placeRoomTime.configure(minutes, Number(event.currentTarget.value))}
          />
        </label>
      </div>

      <div className="place-time__controls">
        <button type="button" className="is-primary" onClick={() => time.status === "running" ? placeRoomTime.pause() : placeRoomTime.start()} disabled={!time.enabled}>
          {time.status === "running" ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {time.status === "running" ? "Pause" : time.status === "paused" ? "Reprendre" : "Démarrer"}
        </button>
        <button type="button" onClick={() => placeRoomTime.reset()} disabled={!time.enabled}>
          <RotateCcw aria-hidden="true" /> Réinitialiser
        </button>
      </div>

      <p>Quand Time est activé, Lecture et Pause du lecteur pilotent aussi ce compte à rebours.</p>
    </section>
  );
}
