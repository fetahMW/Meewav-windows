import { useState } from "react";
import {
  createVoiceCorrectionAbxTrial,
  isVoiceCorrectionAbxAnswerCorrect,
  revealVoiceCorrectionAbxTrial,
  selectVoiceCorrectionAbxAnswer,
  voiceCorrectionAbxRandomValue,
  type VoiceCorrectionAbxIdentity,
} from "./voiceCorrectionLab.abx";

export type VoiceCorrectionAbxRecordings = {
  dry: string;
  processed: string;
  durationMs: number;
};

export function VoiceCorrectionAbxPanel({
  recordings,
  random = voiceCorrectionAbxRandomValue,
}: {
  recordings: VoiceCorrectionAbxRecordings;
  random?: () => number;
}) {
  const [trial, setTrial] = useState(() => createVoiceCorrectionAbxTrial(random));
  const xSource = trial.answer === "A" ? recordings.dry : recordings.processed;

  const selectAnswer = (answer: VoiceCorrectionAbxIdentity) => {
    setTrial((current) => selectVoiceCorrectionAbxAnswer(current, answer));
  };

  return (
    <section className="voice-correction-lab__abx" aria-labelledby="voice-correction-abx-title">
      <div className="voice-correction-lab__abx-heading">
        <span>
          <strong id="voice-correction-abx-title">Essai ABX aveugle</strong>
          <small>Identifie X sans voir s’il s’agit de A ou de B.</small>
        </span>
        <button
          type="button"
          className="is-compact"
          onClick={() => setTrial(createVoiceCorrectionAbxTrial(random))}
        >
          Réinitialiser l’essai
        </button>
      </div>

      <div className="voice-correction-lab__abx-players">
        <label>
          <span><strong>A</strong><small>Référence sèche</small></span>
          <audio aria-label="Écouter la référence A sèche" src={recordings.dry} controls preload="metadata" />
        </label>
        <label>
          <span><strong>B</strong><small>Référence corrigée</small></span>
          <audio aria-label="Écouter la référence B corrigée" src={recordings.processed} controls preload="metadata" />
        </label>
        <label className="is-blind">
          <span><strong>X</strong><small>Source masquée</small></span>
          <audio aria-label="Écouter l’extrait X à identifier" src={xSource} controls preload="metadata" />
        </label>
      </div>

      <fieldset className="voice-correction-lab__segmented">
        <legend>Selon toi, X est identique à…</legend>
        {(["A", "B"] as const).map((answer) => (
          <button
            key={answer}
            type="button"
            className={trial.selected === answer ? "is-active" : ""}
            aria-pressed={trial.selected === answer}
            disabled={trial.revealed}
            onClick={() => selectAnswer(answer)}
          >
            Réponse {answer}
          </button>
        ))}
      </fieldset>

      <button
        type="button"
        className="is-primary"
        disabled={trial.selected === null || trial.revealed}
        onClick={() => setTrial((current) => revealVoiceCorrectionAbxTrial(current))}
      >
        Révéler le résultat
      </button>

      {trial.revealed ? (
        <p
          className={`voice-correction-lab__abx-result ${isVoiceCorrectionAbxAnswerCorrect(trial) ? "is-correct" : "is-incorrect"}`}
          role="status"
        >
          <strong>{isVoiceCorrectionAbxAnswerCorrect(trial) ? "Bonne réponse." : "Réponse incorrecte."}</strong>
          X était la référence {trial.answer}. Ce résultat indique uniquement si cette paire a été distinguée ; il ne mesure ni la qualité, ni le naturel du traitement.
        </p>
      ) : null}

      <p className="voice-correction-lab__abx-caveat">
        Protocole exploratoire : les deux prises sont déclenchées ensemble, mais ne sont pas encore alignées échantillon par échantillon ni normalisées au même niveau perçu. Aucune conclusion qualitative ne doit être tirée de cet essai seul.
      </p>
    </section>
  );
}
