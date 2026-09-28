import { Check, LoaderCircle, ShieldCheck, Timer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RoomToolsCommand, RoomToolsState } from "../roomTools.types";
import { cageAbstentionStorageKey, cageViewerBallot, cageViewerVoteCommand, readCageAbstention, rememberCageAbstention } from "./cageViewerBallot";
import "./cage-viewer-vote.css";

type Props = {
  state: RoomToolsState; accountId: string; canVote: boolean; busy: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
};

export default function CageViewerVote({ state, accountId, canVote, busy, execute }: Props) {
  const [now, setNow] = useState(Date.now);
  const storageKey = cageAbstentionStorageKey(state.roomId, accountId);
  const [localDecision, setLocalDecision] = useState<{ storageKey: string; roundKey: string; choice: "A" | "B" | "abstain" } | null>(null);
  const [storedAbstention, setStoredAbstention] = useState(() => ({ key: storageKey, round: readCageAbstention(storageKey) }));
  const [pending, setPending] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ round: string; message: string } | null>(null);
  const inFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  const ballot = state.cage ? cageViewerBallot(state.cage, accountId, now) : null;
  const recorded = localDecision?.storageKey === storageKey && localDecision.roundKey === ballot?.roundKey ? localDecision.choice : null;
  const abstained = recorded === "abstain" || (storedAbstention.key === storageKey && storedAbstention.round === ballot?.roundKey);
  const show = Boolean(ballot?.open && canVote && !ballot.competing && !ballot.choice && !recorded && !abstained);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const sync = () => setStoredAbstention({ key: storageKey, round: readCageAbstention(storageKey) });
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [storageKey]);
  useEffect(() => {
    setNow(Date.now());
    if (!ballot?.open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [ballot?.roundKey, ballot?.open]);
  useEffect(() => {
    const element = dialog.current;
    if (!show || !element) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element.showModal();
    return () => { if (element.open) element.close(); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [show, ballot?.roundKey]);

  const choose = async (choice: "A" | "B" | "abstain") => {
    if (!state.cage || inFlight.current || busy || !canVote) return;
    const current = cageViewerBallot(state.cage, accountId);
    if (!current?.open || current.competing || current.choice || current.roundKey !== ballot?.roundKey || recorded || abstained) return;
    if (choice === "abstain") {
      rememberCageAbstention(storageKey, current.roundKey);
      setLocalDecision({ storageKey, roundKey: current.roundKey, choice });
      return;
    }
    inFlight.current = true;
    setPending(current.roundKey);
    setFailure(null);
    try {
      await execute(cageViewerVoteCommand(state, accountId, choice));
      if (mounted.current) setLocalDecision({ storageKey, roundKey: current.roundKey, choice });
    } catch {
      if (mounted.current) setFailure({ round: current.roundKey, message: "Le vote n’a pas été envoyé. Vérifie ta connexion, puis réessaie si le vote est encore ouvert." });
    } finally {
      inFlight.current = false;
      if (mounted.current) setPending(null);
    }
  };

  if (!ballot || !canVote || ballot.competing) return null;
  return <>
    {ballot.open && (ballot.choice || recorded || abstained) ? <p className="cage-viewer-vote-status" role="status"><Check aria-hidden="true" />{abstained && !ballot.choice ? "Vous vous abstenez pour ce vote." : "Vote enregistré"}</p> : null}
    {show ? <dialog ref={dialog} className="cage-viewer-vote" aria-labelledby="cage-viewer-vote-title" aria-describedby="cage-viewer-vote-help" onCancel={(event) => event.preventDefault()}>
      <header><span><Timer aria-hidden="true" />VOTE CAGE</span>{ballot.remaining !== null ? <output role="timer" aria-label="Temps de vote restant">{ballot.remaining} s</output> : null}</header>
      <h2 id="cage-viewer-vote-title">Qui remporte ce duel ?</h2>
      <p id="cage-viewer-vote-help">Choisis ton artiste ou abstiens-toi pour continuer le direct.</p>
      <div className="cage-viewer-vote__choices">{(["A", "B"] as const).map((side) => {
        const person = side === "A" ? ballot.match.competitorA : ballot.match.competitorB;
        return <button type="button" key={side} data-side={side} disabled={busy || pending !== null} onClick={() => void choose(side)} aria-label={`Voter ${side} · ${person.name}`}>
          <span className="cage-viewer-vote__side">{side}</span>
          {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : null}
          <strong>{person.name}</strong><small>{person.role}</small>
        </button>;
      })}</div>
      <button type="button" className="cage-viewer-vote__abstain" disabled={busy || pending !== null} onClick={() => void choose("abstain")}>Je m’abstiens</button>
      {failure?.round === ballot.roundKey ? <p className="cage-viewer-vote__error" role="alert">{failure.message}</p> : null}
      <footer aria-live="polite">{pending ? <><LoaderCircle aria-hidden="true" />Envoi du vote…</> : <><ShieldCheck aria-hidden="true" />Une voix par compte · résultats à la fin du vote</>}</footer>
    </dialog> : null}
  </>;
}
