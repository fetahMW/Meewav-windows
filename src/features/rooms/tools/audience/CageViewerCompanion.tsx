import { ArrowUpRight, Heart, MessageCircle, Radio, Swords, Trophy, Users, Waves } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { CageState, RoomPerson } from "../roomTools.types";
import CageResults from "../panels/CageResults";
import CageResultsDialog from "../panels/CageResultsDialog";
import WaveProfileButton from "../panels/WaveProfileButton";
import type { CageCompetitionRuntime } from "../cageCompetition.types";
import { cageAudienceProgram, type AudienceMatch } from "./cageAudienceProgram";
import "./cage-viewer-companion.css";
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
    <header><span>Match {match.ordinal}</span><small>{match.completed ? "Terminé" : current ? "En cours" : "À venir"}</small></header>
    <div className="cage-program__pair"><Artist key={match.a?.id ?? "a"} person={match.a} source={source} /><span>VS</span><Artist key={match.b?.id ?? "b"} person={match.b} source={source} /></div>
    {match.winner ? <p><Trophy aria-hidden="true" />{match.winner.name} se qualifie</p> : null}
    {current && onLive ? <button type="button" className="cage-program__cta" onClick={onLive}><Radio aria-hidden="true" />Suivre le duel<ArrowUpRight aria-hidden="true" /></button> : null}
  </article>;
}

function EmptyProgram({ published }: { published: boolean }) {
  return <div className="cage-program__empty"><Users aria-hidden="true" /><strong>{published ? "Duels à venir" : "La Cage se prépare"}</strong><p>{published ? "Le premier duel sera annoncé par le Host." : "Les duels apparaîtront après confirmation."}</p></div>;
}

export default function CageViewerCompanion({ cage, participation, onOpenChat, production, source = "live", accountId, active = true, fundraiser, fundraiserError }: {
  cage: CageState; participation?: ReactNode; onOpenChat?: () => void; production?: ReactNode;
  source?: "demo" | "live"; accountId?: string; active?: boolean; fundraiser?: CageAudienceFundraiser | null; fundraiserError?: string;
}) {
  const [selectedTab, setTab] = useState<"competition" | "live" | "fund">("competition");
  const tab = selectedTab === "fund" && !fundraiser ? "competition" : selectedTab;
  const competitionTab = useRef<HTMLButtonElement>(null);
  const liveTab = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [active]);
  useEffect(() => { if (!fundraiser && selectedTab === "fund") setTab("competition"); }, [fundraiser, selectedTab]);
  const program = cageAudienceProgram(cage, accountId, now);
  const rounds = [...new Set(program.matches.map(match => match.round))].sort((a, b) => a - b);
  const lastRound = rounds.at(-1) ?? 1;
  const roundTitle = (round: number) => program.formatTitle !== "Tournoi" ? `Journée ${round}` : round === lastRound ? "Finale" : round === lastRound - 1 ? "Demi-finales" : round === lastRound - 2 ? "Quarts de finale" : `Tour ${round}`;
  const followLive = () => { setTab("live"); liveTab.current?.focus(); };
  return <section className="cage-viewer-companion" aria-label="La Cage · participation">
    <RoomViewerSubmenu activeTool={tab} ariaLabel="Programme Cage" idPrefix={id}
      items={[
        { id: "competition", label: "Compétition", icon: <Swords aria-hidden="true" />, controlsId: `${id}-panel-competition`, buttonRef: competitionTab },
        { id: "live", label: "Direct", icon: <Radio aria-hidden="true" />, controlsId: `${id}-panel-live`, buttonRef: liveTab },
        ...(fundraiser ? [{ id: "fund" as const, label: "Cagnotte", icon: <Heart aria-hidden="true" />, controlsId: `${id}-panel-fund` }] : []),
      ]} onSelect={setTab} />
    {fundraiserError ? <p className="cage-production__notice" role="status">{fundraiserError}</p> : null}
    <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-${tab}`} className="cage-viewer-companion__tab">
      {tab !== "fund" ? <>
        {program.active && program.passage ? <div className={`cage-program__turn${program.mine ? " is-mine" : ""}`}>
          <header><span><Waves aria-hidden="true" />EN DIRECT · PASSAGE {program.passage}</span>{program.seconds !== null ? <output role="timer" aria-label="Temps du passage restant">{Math.floor(program.seconds / 60)}:{String(program.seconds % 60).padStart(2, "0")}</output> : null}</header>
          <strong>{program.title}</strong><p>{program.detail}</p>
        </div> : null}
        {participation}
        {tab === "competition" ? <header className="cage-program__heading"><span><Swords aria-hidden="true" />LA CAGE</span><h2>{program.formatTitle}</h2><p>{program.published ? `${program.artistCount > 0 ? `${program.artistCount} artistes · ` : ""}programme confirmé` : "En préparation"}</p></header> : null}
        {production}
        {tab === "competition" ? <>
          {cage.runtime?.publicResults ? <PublishedResults key={cage.runtime.publicResults.matchId ?? "podium"} runtime={cage.runtime} fallbackFocusRef={competitionTab} /> : null}
          {program.matches.length ? <div className="cage-program__rounds">{rounds.map(round => <section key={round} aria-label={roundTitle(round)}>
            <h3><span>{roundTitle(round)}</span><small>{program.matches.filter(match => match.round === round).length} rencontre{program.matches.filter(match => match.round === round).length > 1 ? "s" : ""}</small></h3>
            <div className="cage-program__matches">{program.matches.filter(match => match.round === round).map(match => <MatchCard key={match.id} match={match} source={source} current={match.id === program.active?.id} onLive={followLive} />)}</div>
          </section>)}</div> : <EmptyProgram published={program.published} />}
        </> : <>
          {program.active ? <MatchCard match={program.active} source={source} current /> : null}
          <div className="cage-program__status" role="status"><header><Radio aria-hidden="true" /><strong>{program.title}</strong>{program.voting && program.seconds !== null ? <output>{program.seconds} s</output> : null}</header><p>{program.detail}</p>{program.currentVote && program.voting ? <small>Vote enregistré.</small> : null}</div>
          {onOpenChat ? <button type="button" className="cage-program__cta" onClick={onOpenChat}><MessageCircle aria-hidden="true" />Rejoindre le chat<ArrowUpRight aria-hidden="true" /></button> : null}
        </>}
      </> : fundraiser ? <section className="cage-program__fund" aria-label="Cagnotte publique"><header><Heart aria-hidden="true" /><span>Cagnotte · {fundraiser.isOpen ? "Ouverte" : "Clôturée"}</span></header><h2>{fundraiser.title}</h2>{fundraiser.beneficiary ? <p>Au bénéfice de {fundraiser.beneficiary}</p> : null}<strong>Objectif · {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(fundraiser.target)}</strong></section> : null}
    </div>
  </section>;
}
