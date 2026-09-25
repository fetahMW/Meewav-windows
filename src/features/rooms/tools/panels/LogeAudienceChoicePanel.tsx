import {
  BarChart3,
  Check,
  ChevronDown,
  CirclePlus,
  Clock3,
  Info,
  ListMusic,
  LockKeyhole,
  Play,
  Radio,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  UsersRound,
  Vote,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  PlacePoll,
  PlacePollDuration,
  PlacePollOption,
  PlacePollOptionInput,
  PlaceRoomState,
} from "../../place/place.types";
import { createLogeAudienceChoiceDraft } from "./logeAudienceChoice.fixtures";
import "./loge-public-choisit.css";

type DraftOption = Exclude<PlacePollOptionInput, string> & { id: string };

export type LogeAudienceChoicePanelProps = {
  room: PlaceRoomState;
  disabled: boolean;
  onLaunchPoll: (
    question: string,
    options: PlacePollOptionInput[],
    durationSeconds: PlacePollDuration,
    resultsVisible?: boolean,
  ) => Promise<void>;
  onStopPoll: () => Promise<void>;
};

export type LogePublicChoiceVoteProps = {
  poll: PlacePoll | null;
  canEngage: boolean;
  onVote: (optionIndex: number) => void;
};

function useCountdown(endsAt: string | null, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active || !endsAt) return;
    setNow(Date.now());
    const interval = globalThis.setInterval(() => setNow(Date.now()), 500);
    return () => globalThis.clearInterval(interval);
  }, [active, endsAt]);
  if (!active || !endsAt) return null;
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1_000));
}

function formatCountdown(seconds: number | null) {
  if (seconds === null) return "Vote ouvert";
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function totalVotes(poll: PlacePoll) {
  return poll.options.reduce((sum, option) => sum + option.votes, 0);
}

function percentage(option: PlacePollOption, total: number) {
  return Math.round(option.weightedPercent ?? (total > 0 ? option.votes / total * 100 : 0));
}

function PollOptionVisual({ option, index }: { option: Pick<PlacePollOption, "label" | "imageUrl">; index: number }) {
  return option.imageUrl
    ? <img src={option.imageUrl} alt="" />
    : <span className={`loge-public-choice__option-art is-${index % 3}`} aria-hidden="true"><ListMusic /></span>;
}

function LiveResults({ poll, host = false }: { poll: PlacePoll; host?: boolean }) {
  const total = totalVotes(poll);
  const winnerVotes = Math.max(0, ...poll.options.map((option) => option.weightedPercent ?? option.votes));
  const reveal = host || poll.resultsVisible || !poll.isActive;
  return <div className="loge-public-choice__results" aria-live="polite">
    {poll.options.map((option, index) => {
      const percent = reveal ? percentage(option, total) : 0;
      const leading = reveal && (option.weightedPercent ?? option.votes) === winnerVotes && winnerVotes > 0;
      return <article key={`${option.label}-${index}`} className={leading ? "is-leading" : ""}>
        <PollOptionVisual option={option} index={index} />
        <span className="loge-public-choice__result-main">
          <span><strong>{option.label}</strong>{leading ? <small>En tête</small> : null}</span>
          <i role="progressbar" aria-label={`${option.label} : ${reveal ? `${percent} %` : "résultat masqué"}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={reveal ? percent : undefined}><b style={{ width: `${percent}%` }} /></i>
        </span>
        <span className="loge-public-choice__result-score"><strong>{reveal ? `${percent}%` : "—"}</strong><small>{reveal ? `${option.votes} vote${option.votes > 1 ? "s" : ""}` : "À la fin"}</small></span>
      </article>;
    })}
  </div>;
}

export function LogePublicChoiceVote({ poll, canEngage, onVote }: LogePublicChoiceVoteProps) {
  const countdown = useCountdown(poll?.endsAt ?? null, Boolean(poll?.isActive));
  if (!poll) return null;
  const voted = poll.currentUserVoteIndex !== null;
  const total = totalVotes(poll);
  const winning = [...poll.options].sort((left, right) => right.votes - left.votes)[0];
  return <section className={`loge-public-choice-viewer${poll.isActive ? " is-active" : " is-closed"}`} aria-labelledby="loge-public-choice-viewer-title">
    <header>
      <span><Vote /><span><small>{poll.isActive ? "LE PUBLIC CHOISIT · EN DIRECT" : "VOTE TERMINÉ"}</small><strong id="loge-public-choice-viewer-title">{poll.question}</strong></span></span>
      <b>{poll.isActive ? <><i /> {formatCountdown(countdown)}</> : <><Check /> Terminé</>}</b>
    </header>
    {poll.isActive && !voted ? <div className="loge-public-choice-viewer__choices" role="group" aria-label="Choisis une réponse">
      {poll.options.map((option, index) => <button type="button" key={`${option.label}-${index}`} disabled={!canEngage} onClick={() => onVote(index)}><PollOptionVisual option={option} index={index} /><span><strong>{option.label}</strong><small>{option.durationLabel ?? "Choisir cette option"}</small></span><Radio /></button>)}
    </div> : null}
    {voted ? <p className="loge-public-choice-viewer__confirmed" role="status"><Check /><span><strong>Vote enregistré</strong><small>Ton choix : {poll.options[poll.currentUserVoteIndex ?? -1]?.label}</small></span></p> : null}
    {(!poll.isActive || (voted && poll.resultsVisible)) ? <LiveResults poll={poll} /> : null}
    {voted && poll.isActive && !poll.resultsVisible ? <p className="loge-public-choice-viewer__hidden"><LockKeyhole /> Résultat dévoilé à la fin du vote.</p> : null}
    {!poll.isActive && winning ? <p className="loge-public-choice-viewer__winner"><Sparkles /><span><small>LA LOGE A CHOISI</small><strong>{winning.label}</strong><em>{percentage(winning, total)} % · {winning.votes} vote{winning.votes > 1 ? "s" : ""}</em></span></p> : null}
  </section>;
}

export default function LogeAudienceChoicePanel({ room, disabled, onLaunchPoll, onStopPoll }: LogeAudienceChoicePanelProps) {
  const initial = useMemo(() => createLogeAudienceChoiceDraft(room.source === "demo"), [room.source]);
  const optionSequence = useRef(initial.options.length);
  const [question, setQuestion] = useState(initial.question);
  const [options, setOptions] = useState<DraftOption[]>(initial.options);
  const [duration, setDuration] = useState<PlacePollDuration>(null);
  const [resultsVisible, setResultsVisible] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [launching, setLaunching] = useState(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const poll = room.poll;
  const countdown = useCountdown(poll?.endsAt ?? null, Boolean(poll?.isActive));
  const cleanOptions = options.filter((option) => option.label.trim()).map(({ id: _id, ...option }) => ({ ...option, label: option.label.trim() }));
  const valid = question.trim().length >= 3 && cleanOptions.length >= 2 && cleanOptions.length <= 6;
  const votes = poll ? totalVotes(poll) : 0;
  const winner = poll && !poll.isActive ? [...poll.options].sort((left, right) => right.votes - left.votes)[0] : null;

  const patchOption = (id: string, patch: Partial<DraftOption>) => setOptions((current) => current.map((option) => option.id === id ? { ...option, ...patch } : option));
  const addOption = () => {
    if (options.length >= 6) return;
    optionSequence.current += 1;
    setOptions((current) => [...current, { id: `choice-${optionSequence.current}`, label: "" }]);
  };
  const addCurrentMedia = () => {
    if (!room.track?.title || options.length >= 6) return;
    optionSequence.current += 1;
    setOptions((current) => [...current, {
      id: `media-${optionSequence.current}`,
      label: room.track.title,
      durationLabel: room.track.durationSeconds > 0 ? `${Math.floor(room.track.durationSeconds / 60)}:${String(room.track.durationSeconds % 60).padStart(2, "0")}` : null,
      mediaId: room.track.id,
      imageUrl: "/images/rooms/place/mixer-cover-default.png",
    }]);
  };
  const launch = async () => {
    if (!valid || launching || disabled || poll?.isActive) return;
    setLaunching(true);
    try {
      await onLaunchPoll(question.trim(), cleanOptions, duration, resultsVisible);
    } finally {
      setLaunching(false);
    }
  };
  const resetDraft = () => {
    const fresh = createLogeAudienceChoiceDraft(false);
    setQuestion(fresh.question);
    setOptions(fresh.options);
    composerRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return <div className="loge-public-choice" data-poll-state={!poll ? "draft" : poll.isActive ? "active" : "closed"}>
    <header className="loge-public-choice__header">
      <span><small>INTERACTION LIVE</small><strong>Le public choisit <Sparkles /></strong><em>Pose une question et laisse ta Loge décider en direct.</em></span>
      <span className="loge-public-choice__live"><b><i /> EN DIRECT</b><b><UsersRound /> {room.participantsCount ?? 0}</b></span>
    </header>

    <div className="loge-public-choice__layout">
      <section className="loge-public-choice__composer" ref={composerRef} aria-labelledby="public-choice-compose-title">
        <header><b>1</b><span><strong id="public-choice-compose-title">Crée ta question</strong><small>Une décision simple, pensée pour maintenant.</small></span></header>
        <label className="loge-public-choice__question">Ta question <textarea value={question} maxLength={120} rows={3} onChange={(event) => setQuestion(event.currentTarget.value)} placeholder="Quel morceau je joue ensuite ?" /><small>{question.length}/120</small></label>
        <div className="loge-public-choice__options-label"><span>Options</span><small>2 à 6 choix</small></div>
        <div className="loge-public-choice__editor-list">{options.map((option, index) => <div key={option.id} className="loge-public-choice__editor-option">
          <PollOptionVisual option={{ label: option.label, imageUrl: option.imageUrl ?? null }} index={index} />
          <span><input value={option.label} maxLength={80} aria-label={`Option ${index + 1}`} placeholder={`Option ${index + 1}`} onChange={(event) => patchOption(option.id, { label: event.currentTarget.value })} /><small>{option.durationLabel ?? (option.mediaId ? "Média MeeWav" : "Choix texte")}</small></span>
          <button type="button" aria-label={`Supprimer ${option.label || `l’option ${index + 1}`}`} disabled={options.length <= 2} onClick={() => setOptions((current) => current.filter((candidate) => candidate.id !== option.id))}><Trash2 /></button>
        </div>)}</div>
        <div className="loge-public-choice__add-row"><button type="button" disabled={options.length >= 6} onClick={addOption}><CirclePlus /> Ajouter une option</button>{room.track?.title ? <button type="button" disabled={options.length >= 6} onClick={addCurrentMedia}><ListMusic /> Média en lecture</button> : null}</div>

        <details className="loge-public-choice__advanced" open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}><summary><span>Options avancées</span><ChevronDown /></summary><div>
          <label><span><strong>Afficher les résultats en temps réel</strong><small>Les membres voient l’évolution après leur vote.</small></span><input type="checkbox" role="switch" checked={resultsVisible} onChange={(event) => setResultsVisible(event.currentTarget.checked)} /></label>
          <label className="loge-public-choice__duration"><span><strong>Durée du vote</strong><small>Le Host peut toujours le fermer manuellement.</small></span><select value={duration ?? "open"} onChange={(event) => setDuration(event.currentTarget.value === "open" ? null : Number(event.currentTarget.value) as PlacePollDuration)}><option value="open">Pas de limite</option><option value="30">30 secondes</option><option value="60">1 minute</option><option value="120">2 minutes</option></select></label>
        </div></details>

        <button type="button" className="loge-public-choice__launch" disabled={disabled || launching || Boolean(poll?.isActive) || !valid} onClick={() => void launch()}>{poll?.isActive ? <><Radio /> Vote en cours</> : launching ? <><Clock3 /> Ouverture du vote…</> : <><Play /> Lancer le vote</>}</button>
        <p className="loge-public-choice__broadcast-note"><UsersRound /> Le vote sera visible par tous les membres connectés à la Loge.</p>
      </section>

      <section className="loge-public-choice__live-panel" aria-labelledby="public-choice-live-title">
        <header className="loge-public-choice__step-header"><b>2</b><span><strong id="public-choice-live-title">Vote en direct</strong><small>Les résultats se mettent à jour en temps réel.</small></span>{poll ? <span className="loge-public-choice__timer"><Clock3 /><span><strong>{formatCountdown(countdown)}</strong><small>{poll.endsAt ? "Fin automatique" : "Fermeture manuelle"}</small></span></span> : null}</header>
        {poll ? <>
          <div className="loge-public-choice__question-card"><span><BarChart3 /></span><span><strong>{poll.question}</strong><small>{poll.isActive ? "Vote en cours" : "Vote terminé"}</small></span><b>{votes}<small>vote{votes > 1 ? "s" : ""}</small></b></div>
          <LiveResults poll={poll} host />
          <div className="loge-public-choice__host-actions">{poll.isActive ? <button type="button" disabled={disabled} onClick={() => void onStopPoll()}><Square /> Terminer le vote</button> : winner ? <p><Sparkles /><span><small>LA LOGE A CHOISI</small><strong>{winner.label}</strong></span><b>{percentage(winner, votes)}%</b></p> : null}</div>
        </> : <div className="loge-public-choice__waiting"><span><Vote /></span><strong>Le prochain choix commence ici.</strong><small>Écris ta question, ajoute au moins deux options et lance le vote.</small></div>}

        <div className="loge-public-choice__after"><header><b>3</b><span><strong>Après le vote</strong><small>Agis selon le choix de ta Loge.</small></span></header>{winner ? <button type="button" onClick={resetDraft}><RotateCcw /> Nouveau vote</button> : <p><Info /> Les actions pertinentes apparaîtront une fois le résultat connu.</p>}</div>
      </section>
    </div>
    <footer><LockKeyhole /> Une seule voix par compte. Les votes sont validés côté serveur et synchronisés en temps réel.</footer>
  </div>;
}
