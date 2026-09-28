import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import CageBroadcast from "./CageBroadcast";
import CageOpenMicAudience from "./CageOpenMicAudience";
import CageViewerCompanion from "./CageViewerCompanion";
import { advanceCageViewerSimulation, startCageViewerSimulation, simulationCommand, CAGE_DEMO_BREAK_MS } from "../cageViewerSimulation";
import type { CageCompetitionConfig } from "../cageCompetition.types";
import type { RoomToolsCommand, RoomToolsState } from "../roomTools.types";
import "./cage-viewer-showcase.css";

const formats = { tournament: "Tournoi", championship: "Championnat", "open-mic": "Open Mic", "open-mic-battle": "Open Mic Battle" } as const;

export default function CageViewerShowcase({ children, enabled, production }: { children: ReactNode; enabled: boolean; production?: ReactNode }) {
  const [format, setFormat] = useState<CageCompetitionConfig["format"]>("tournament");
  const [state, setState] = useState<RoomToolsState | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState("");
  const runtime = state?.cage?.runtime;
  const match = runtime?.matches.find(item => item.id === runtime.activeMatchId);
  const entry = runtime?.openMicEntries?.find(item => item.id === runtime.activeEntryId);
  const feedback = runtime?.openMicEntries?.find(item => item.id === runtime.feedbackEntryId);
  const completed = runtime?.status === "COMPLETED";
  const resolved = match?.status === "RESOLVED" || match?.status === "CLOSED" || entry?.status === "PERFORMED";
  const voting = match?.status === "VOTING" || feedback?.feedback?.open;

  useEffect(() => {
    if (!enabled) return;
    window.dispatchEvent(new CustomEvent("cage-viewer-preview-state", { detail: state?.cage ?? null }));
    return () => { window.dispatchEvent(new CustomEvent("cage-viewer-preview-state", { detail: null })); };
  }, [enabled, state]);
  useEffect(() => { if (!enabled) setState(null); }, [enabled]);

  const restart = useCallback(() => {
    if (!enabled) return;
    try { setState(startCageViewerSimulation(format)); setPaused(false); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Simulation indisponible"); }
  }, [enabled, format]);
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("cage-viewer-simulation-ready", restart);
    return () => window.removeEventListener("cage-viewer-simulation-ready", restart);
  }, [enabled, restart]);

  const update = useCallback((action: (copy: RoomToolsState) => void) => {
    if (!stateRef.current) return;
    try {
      const copy = structuredClone(stateRef.current);
      action(copy);
      stateRef.current = copy;
      setState(copy);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Simulation interrompue"); setPaused(true); }
  }, []);
  const next = useCallback(() => update(advanceCageViewerSimulation), [update]);
  const phase = `${match?.id}:${match?.status}:${entry?.id}:${entry?.status}:${feedback?.feedback?.open}`;
  useEffect(() => {
    if (!enabled || !runtime || paused || completed) return;
    const duration = voting ? 6000 : resolved ? CAGE_DEMO_BREAK_MS : 4000;
    const deadline = Date.now() + duration;
    setRemaining(Math.ceil(duration / 1000));
    const tick = window.setInterval(() => setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    const timer = window.setTimeout(next, duration);
    return () => { clearInterval(tick); clearTimeout(timer); };
  }, [enabled, phase, paused, completed, voting, resolved, next]);

  if (!enabled) return <>{children}</>;
  if (!state || !runtime) return <>
    <div className="cage-simulation-launcher">
      <label>Simulation<select aria-label="Format de la simulation" value={format} onChange={event => setFormat(event.target.value as CageCompetitionConfig["format"])}>
        {Object.entries(formats).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <button type="button" onClick={restart}><Play aria-hidden="true" />Simuler</button>
    </div>
    {error ? <p role="alert">{error}</p> : null}{children}
  </>;

  const choose = (choice: "A" | "B") => update(copy => simulationCommand(copy, "vote.cast", { choice }, "preview-viewer"));
  const execute = async (command: RoomToolsCommand) => {
    if (command.type === "cage.competition.command") update(copy => simulationCommand(copy, command.action, command.payload, "preview-viewer"));
  };
  if (runtime.config.format === "tournament" && match) return <>{production}<CageBroadcast error={error} state={state} paused={paused} remaining={remaining} onPause={() => setPaused(value => !value)} onRestart={restart} onNext={next} onClose={() => setState(null)} onVote={choose} /></>;
  return <>
    <section className="cage-simulation-session" aria-label="Simulation Cage">
      <header><strong>Simulation · {formats[runtime.config.format]}</strong><span role="status">{completed ? "Terminée" : paused ? "Pause" : `${remaining} s`}</span></header>
      <div className="cage-simulation-controls">
        <button type="button" onClick={() => setPaused(value => !value)} disabled={completed}>{paused ? <Play /> : <Pause />}{paused ? "Reprendre" : "Pause"}</button>
        <button type="button" onClick={restart}><RotateCcw />Rejouer</button>
        <button type="button" onClick={next} disabled={completed}><ChevronRight />Étape suivante</button>
        <button type="button" onClick={() => setState(null)} aria-label="Quitter la simulation"><X /></button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
    {runtime.config.format === "open-mic" ? <CageOpenMicAudience state={state} accountId="preview-viewer" canEngage busy={false} execute={execute} /> : <>
      <CageViewerCompanion cage={state.cage!} source="demo" accountId="preview-viewer" production={production} />
      {match?.status === "VOTING" ? <div className="cage-simulation-controls">{(["A", "B"] as const).map(side => <button type="button" key={side} disabled={Boolean(match.vote?.ballots["preview-viewer"])} onClick={() => choose(side)}>Voter {runtime.participants.find(person => person.id === (side === "A" ? match.participantAId : match.participantBId))?.person.name}</button>)}</div> : null}
    </>}
  </>;
}
