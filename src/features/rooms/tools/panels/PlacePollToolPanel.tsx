import { BarChart3, CircleCheck, Clock3, Info } from "lucide-react";
import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type {
  PlacePollDuration,
  PlacePollOptionInput,
  PlaceRoomState,
} from "../../place/place.types";

export type PlacePollToolPanelProps = {
  room: PlaceRoomState;
  onLaunchPoll: (
    question: string,
    options: PlacePollOptionInput[],
    durationSeconds: PlacePollDuration,
    resultsVisible?: boolean,
  ) => Promise<void>;
  onStopPoll: () => Promise<void>;
  onOpenChat: () => void;
  disabled?: boolean;
  hidden?: boolean;
  onBusyChange?: (busy: boolean) => void;
};

export default function PlacePollToolPanel({
  room,
  onLaunchPoll,
  onStopPoll,
  onOpenChat,
  disabled = false,
  hidden = false,
  onBusyChange,
}: PlacePollToolPanelProps) {
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollMode, setPollMode] = useState<"yes_no" | "for_against">("yes_no");
  const [pollDuration, setPollDuration] = useState<15 | 30 | 60>(15);
  const [toolClock, setToolClock] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const pollOptions: [string, string] = pollMode === "yes_no" ? ["Oui", "Non"] : ["Pour", "Contre"];
  const pollRemaining = room.poll?.isActive && room.poll.endsAt
    ? Math.max(0, Math.ceil((new Date(room.poll.endsAt).getTime() - toolClock) / 1_000))
    : 0;
  const pollVoteTotal = room.poll?.options.reduce((sum, option) => sum + option.votes, 0) ?? 0;

  useEffect(() => {
    if (!room.poll?.isActive) return;
    const timer = window.setInterval(() => setToolClock(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [room.poll?.isActive]);

  const runPollAction = async (action: () => Promise<void>) => {
    if (busy || disabled) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      await action();
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  const submitPoll = (event: FormEvent) => {
    event.preventDefault();
    void runPollAction(() => onLaunchPoll(pollQuestion, pollOptions, pollDuration));
  };

  const relaunchPoll = () => {
    if (!room.poll) return;
    const question = room.poll.question;
    const options = room.poll.options.map((option) => option.label);
    void runPollAction(async () => {
      await onStopPoll();
      await onLaunchPoll(question, options, pollDuration);
    });
  };

  return <form className="place-tool-card is-poll" hidden={hidden} onSubmit={submitPoll}>
    <header className="place-tool-card__header"><span className="place-tool-card__glyph"><BarChart3 aria-hidden="true" /></span><span><small>INTERACTION PUBLIC</small><strong>Sondage rapide</strong><em>Demandez l’avis du public en direct</em></span><b className="place-tool-card__status"><i /> {room.poll?.isActive ? "EN DIRECT" : "PRÊT"}</b></header>
    {room.poll?.isActive ? (
      <div className="place-tool-poll-live">
        <header><span><i /> À l’antenne</span><time>{`${String(Math.floor(pollRemaining / 60)).padStart(2, "0")}:${String(pollRemaining % 60).padStart(2, "0")}`}</time></header>
        <strong className="place-tool-poll-live__question">{room.poll.question}</strong>
        <div className="place-tool-poll-live__results">{room.poll.options.map((option) => {
          const percentage = Math.round(option.weightedPercent ?? (pollVoteTotal === 0 ? 0 : (option.votes / pollVoteTotal) * 100));
          return <span key={option.label} style={{ "--poll-result": `${percentage}%` } as CSSProperties}><span><small>{option.label}</small><b>{percentage} %</b></span><i /></span>;
        })}</div>
        <footer><small>{pollVoteTotal} vote{pollVoteTotal > 1 ? "s" : ""}</small><span><button type="button" className="place-tool-action is-quiet" onClick={onOpenChat}>Voir le chat</button><button type="button" className="place-tool-action is-secondary" disabled={busy || disabled} onClick={relaunchPoll}>{busy ? "Relance…" : "Relancer"}</button><button type="button" className="place-tool-action is-danger" disabled={busy || disabled} onClick={() => void runPollAction(onStopPoll)}>Arrêter</button></span></footer>
      </div>
    ) : <>
      <label className="place-tool-card__field"><span>Votre question <small>{pollQuestion.length}/160</small></span><input value={pollQuestion} onChange={(event) => setPollQuestion(event.currentTarget.value)} placeholder="Ex. Vous validez ce son ?" maxLength={160} /></label>
      <div className="place-tool-card__control-grid">
        <fieldset><legend>Type de réponses</legend><div className="place-tool-card__choice" aria-label="Choix de vote"><button type="button" className={pollMode === "yes_no" ? "is-active" : ""} aria-pressed={pollMode === "yes_no"} onClick={() => setPollMode("yes_no")}>{pollMode === "yes_no" ? <CircleCheck aria-hidden="true" /> : null}Oui / Non</button><button type="button" className={pollMode === "for_against" ? "is-active" : ""} aria-pressed={pollMode === "for_against"} onClick={() => setPollMode("for_against")}>{pollMode === "for_against" ? <CircleCheck aria-hidden="true" /> : null}Pour / Contre</button></div></fieldset>
        <fieldset><legend>Durée du sondage</legend><div className="place-tool-card__durations" aria-label="Durée du sondage">{([15, 30, 60] as const).map((duration) => <button type="button" key={duration} className={pollDuration === duration ? "is-active" : ""} aria-pressed={pollDuration === duration} onClick={() => setPollDuration(duration)}>{duration} s</button>)}</div></fieldset>
      </div>
      <div className="place-tool-poll__duration-summary"><Clock3 aria-hidden="true" /><strong>{pollDuration} secondes</strong></div>
      <footer className="place-tool-card__footer"><span><Info aria-hidden="true" />Le résultat évolue en direct.</span><button type="submit" className="place-tool-action is-primary place-tool-card__primary" aria-busy={busy} disabled={disabled || !pollQuestion.trim() || busy}>{busy ? "Lancement…" : "Lancer le sondage"}</button></footer>
    </>}
  </form>;
}
