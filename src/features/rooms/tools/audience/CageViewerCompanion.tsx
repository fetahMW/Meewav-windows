import { ArrowUpRight, Expand, Heart, Headphones, LayoutPanelTop, Radio, Swords, Trophy, Users } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CageState, RoomPerson } from "../roomTools.types";
import CageResults from "../panels/CageResults";
import CageResultsDialog from "../panels/CageResultsDialog";
import WaveProfileButton from "../panels/WaveProfileButton";
import type { CageCompetitionRuntime } from "../cageCompetition.types";
import { cageAudienceProgram, type AudienceMatch } from "./cageAudienceProgram";
import "./cage-viewer-companion.css";
import CageBracketDialog from "./CageBracketDialog";
import { RoomViewerSubmenu } from "../../place/RoomViewerToolsLayout";

export type CageAudienceFundraiser = { title: string; beneficiary?: string; target: number; isOpen: boolean };

function PublishedResults({runtime, fallbackFocusRef}: {runtime:CageCompetitionRuntime; fallbackFocusRef:RefObject<HTMLButtonElement | null>}) {
  const [expanded,setExpanded]=useState(false);
  const matchId=runtime.publicResults?.matchId;
  return <>
    <CageResults runtime={runtime} matchId={matchId} onExpand={()=>setExpanded(true)}/>
    {expanded?<CageResultsDialog runtime={runtime} matchId={matchId} fallbackFocusRef={fallbackFocusRef} onClose={()=>setExpanded(false)}/>:null}
  </>;
}

function Artist({ person, source }: { person?: RoomPerson; source: "demo" | "live" }) {
  const [failed, setFailed] = useState(false);
  return <WaveProfileButton person={person} source={source} className="cage-program__artist">
    <span className="cage-program__portrait">{person?.avatarUrl && !failed ? <img src={person.avatarUrl} alt="" onError={() => setFailed(true)} /> : <span>{person?.name.slice(0, 1) ?? "?"}</span>}</span>
    <strong>{person?.name ?? "À venir"}</strong>{person ? <ArrowUpRight aria-hidden="true" /> : null}
  </WaveProfileButton>;
}

function MatchCard({ match, current, source, onLive }: { match: AudienceMatch; current: boolean; source: "demo" | "live"; onLive?: () => void }) {
  return <article className={`cage-program__match${current ? " is-current" : ""}`}>
    <header><span>{match.solo ? "Passage" : "Match"} {match.ordinal}</span><small>{match.completed ? "Terminé" : current ? "En cours" : "À venir"}</small></header>
    <div className={`cage-program__pair${match.solo ? " is-solo" : ""}`}><Artist key={match.a?.id ?? "a"} person={match.a} source={source} />{!match.solo ? <><span>VS</span><Artist key={match.b?.id ?? "b"} person={match.b} source={source} /></> : null}</div>
    {match.winner ? <p><Trophy aria-hidden="true" />{match.winner.name} se qualifie</p> : null}
    {current && onLive ? <button type="button" className="cage-program__cta" onClick={onLive}><Radio aria-hidden="true" />Suivre le duel<ArrowUpRight aria-hidden="true" /></button> : null}
  </article>;
}

function EmptyProgram({ published }: { published: boolean }) {
  return <div className="cage-program__empty"><Users aria-hidden="true" /><strong>{published ? "Duels à venir" : "La Cage se prépare"}</strong><p>{published ? "Le premier duel sera annoncé par le Host." : "Les duels apparaîtront après confirmation."}</p></div>;
}

export default function CageViewerCompanion({ cage, participation, production, posterUrl, source = "live", accountId, active = true, fundraiser, fundraiserError }: {
  cage: CageState; participation?: ReactNode; onOpenChat?: () => void; production?: ReactNode;
  source?: "demo" | "live"; posterUrl?: string; accountId?: string; active?: boolean; fundraiser?: CageAudienceFundraiser | null; fundraiserError?: string;
}) {
  const [tab, setTab] = useState<"live" | "audio" | "display">("live");
  const [expanded, setExpanded] = useState(false);
  const displayTab = useRef<HTMLButtonElement>(null);
  const liveTab = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  const program = cageAudienceProgram(cage, accountId, now);
  const tableTitle = program.formatTitle === "Open Mic" ? "Ordre des passages" : program.formatTitle === "Championnat" ? "Programme du championnat" : "Tableau du tournoi";
  const rounds = [...new Set(program.matches.map(match => match.round))].sort((a, b) => a - b);
  const lastRound = rounds.at(-1) ?? 1;
  const roundTitle = (round: number) => program.formatTitle === "Open Mic" ? "Ordre des passages" : program.formatTitle !== "Tournoi" ? `Journée ${round}` : round === lastRound ? "Finale" : round === lastRound - 1 ? "Demi-finales" : round === lastRound - 2 ? "Quarts de finale" : `Tour ${round}`;
  const followLive = () => { setExpanded(false); setTab("live"); liveTab.current?.focus(); };
  const nextMatch = program.matches.find(match => !match.completed && match.id !== program.active?.id && match.a && (match.solo || match.b));
  const bracket = program.matches.length ? <div className="cage-program__rounds">{rounds.map(round => <section key={round} aria-label={roundTitle(round)}>
    <h3><span>{roundTitle(round)}</span><small>{program.matches.filter(match => match.round === round).length} rencontres</small></h3>
    <div className="cage-program__matches">{program.matches.filter(match => match.round === round).map(match => <MatchCard key={match.id} match={match} source={source} current={match.id === program.active?.id} onLive={followLive} />)}</div>
  </section>)}</div> : <EmptyProgram published={program.published} />;
  return <section className="cage-viewer-companion" data-view={tab} aria-label="La Cage · participation">
    <RoomViewerSubmenu activeTool={tab} ariaLabel="Programme Cage" idPrefix={id}
      items={[
        { id: "live", label: "En direct", icon: <Radio aria-hidden="true" />, controlsId: `${id}-panel-live`, buttonRef: liveTab },
        { id: "audio", label: "Audio", icon: <Headphones aria-hidden="true" />, controlsId: `${id}-panel-audio` },
        { id: "display", label: "Affichage", icon: <LayoutPanelTop aria-hidden="true" />, controlsId: `${id}-panel-display`, buttonRef: displayTab },
      ]} onSelect={setTab} />
    <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-${tab}`} className="cage-viewer-companion__tab">
      {tab === "live" ? <div className="cage-program__live-overview">
        <header className="cage-program__live-heading"><span><Radio aria-hidden="true" />{program.voting ? "Vote du public" : program.passage ? `Passage ${program.passage}` : "Le direct"}</span>{program.seconds !== null ? <output role="timer" aria-label="Temps restant">{Math.floor(program.seconds / 60)}:{String(program.seconds % 60).padStart(2, "0")}</output> : null}</header>
        <div className="cage-program__live-status" role="status"><h2>{program.title}</h2><p>{program.detail}</p>{program.currentVote && program.voting ? <small>Votre vote est enregistré.</small> : null}</div>
        {program.active ? <MatchCard match={program.active} source={source} current /> : posterUrl ? <div className="cage-program__poster"><img src={posterUrl} alt="Affiche de La Cage — Paris contre Marseille" /></div> : <div className="cage-program__waiting-art" aria-hidden="true"><Swords /></div>}
        {nextMatch ? <p className="cage-program__up-next"><small>Ensuite</small><span>{nextMatch.a?.name}{!nextMatch.solo ? <> <b>vs</b> {nextMatch.b?.name}</> : null}</span></p> : null}
      </div> : null}
      {tab === "audio" ? <section className="cage-program__audio" aria-label="La prod du battle"><header className="cage-program__heading"><h2>La prod du battle</h2><p>Écoutez, répétez et préparez votre passage.</p></header>{production ?? <p className="cage-production__notice">Le host n’a pas encore partagé de prod.</p>}</section> : null}
      {tab === "display" ? <>
        <header className="cage-program__heading"><span><Swords aria-hidden="true" />{program.formatTitle}</span><h2>{tableTitle}</h2><p>{program.published ? `${program.artistCount} artistes · programme confirmé` : "En préparation"}</p></header>
        <button type="button" className="cage-program__cta" disabled={!program.matches.length} onClick={() => setExpanded(true)}><Expand aria-hidden="true" />Agrandir le tableau</button>
        {!expanded ? bracket : null}
        {cage.runtime?.publicResults ? <PublishedResults key={cage.runtime.publicResults.matchId ?? "podium"} runtime={cage.runtime} fallbackFocusRef={displayTab} /> : null}
        {fundraiser ? <section className="cage-program__fund" aria-label="Cagnotte publique"><header><Heart aria-hidden="true" /><span>Cagnotte · {fundraiser.isOpen ? "Ouverte" : "Clôturée"}</span></header><h2>{fundraiser.title}</h2>{fundraiser.beneficiary ? <p>Au bénéfice de {fundraiser.beneficiary}</p> : null}<strong>Objectif · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(fundraiser.target)}</strong></section> : null}
        {fundraiserError ? <p className="cage-production__notice" role="status">{fundraiserError}</p> : null}
      </> : null}
    </div>
    {participation ? <footer className="cage-program__participation">{participation}</footer> : null}
    {expanded ? <CageBracketDialog title={tableTitle} onClose={() => setExpanded(false)}>{bracket}</CageBracketDialog> : null}
  </section>;
}
