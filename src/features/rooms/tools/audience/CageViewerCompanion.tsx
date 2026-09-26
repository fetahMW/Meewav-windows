import { MessageCircle, Radio, Swords } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cageEvent } from "../cageTools.domain";
import type { CageState } from "../roomTools.types";
import CageResults from "../panels/CageResults";
import "./cage-viewer-companion.css";

export default function CageViewerCompanion({ cage, participation, onOpenChat, production }: {
  cage: CageState; participation?: ReactNode; onOpenChat?: () => void; production?: ReactNode;
}) {
  const [tab, setTab] = useState<"competition" | "live">("competition");
  const id = useId();
  const event = cageEvent(cage);
  const match = cage.matches.find((item) => item.id === (cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId));
  return <section className="cage-viewer-companion" aria-label="La Cage · participation">
    <header><span><Swords aria-hidden="true" /><small>LA CAGE</small></span><h2>{event.title}</h2><p>{event.discipline}</p></header>
    <nav className="cage-viewer-companion__tabs" aria-label="Programme Cage" role="tablist">{([['competition', 'Compétition'], ['live', 'Direct']] as const).map(([key, label]) => <button key={key} type="button" role="tab" id={`${id}-${key}`} aria-controls={`${id}-panel-${key}`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "competition" : event.key === "End" ? "live" : key === "live" ? "competition" : "live";
      setTab(next); document.getElementById(`${id}-${next}`)?.focus();
    }}>{label}</button>)}</nav>
    {production}
    <div role="tabpanel" id={`${id}-panel-competition`} aria-labelledby={`${id}-competition`} hidden={tab !== "competition"} className="cage-viewer-companion__tab">
      {participation}
      {cage.runtime?.publicResults ? <CageResults runtime={cage.runtime} matchId={cage.runtime.publicResults.matchId} /> : cage.runtime?.publicBracketVisible ? <section className="cage-viewer-companion__programme" aria-label="Programme publié par le host"><h3>Programme du host</h3>{cage.matches.map((item) => <div key={item.id}><small>{item.id === match?.id ? "EN COURS" : `Tour ${item.round}`}</small><span>{item.competitorA.name}<i>vs</i>{item.competitorB.name}</span></div>)}</section> : <p className="cage-production__notice">Le tableau apparaîtra dès sa publication par le host.</p>}
    </div>
    <div role="tabpanel" id={`${id}-panel-live`} aria-labelledby={`${id}-live`} hidden={tab !== "live"} className="cage-viewer-companion__tab">
      <div className="cage-viewer-companion__current"><Radio aria-hidden="true" /><span><strong>{match ? `${match.competitorA.name} face à ${match.competitorB.name}` : "Le host prépare le prochain passage"}</strong><small>{cage.votingOpen ? "Le choix de vote s’affiche directement sur le live." : "Retrouve ici le passage en cours."}</small></span></div>
      {onOpenChat ? <button type="button" className="cage-viewer-companion__chat" onClick={onOpenChat}><MessageCircle aria-hidden="true" />Revenir au chat</button> : null}
    </div>
  </section>;
}
