import { MessageCircle, Radio, Swords } from "lucide-react";
import type { ReactNode } from "react";
import { cageEvent } from "../cageTools.domain";
import type { CageState } from "../roomTools.types";
import CageResults from "../panels/CageResults";
import "./cage-viewer-companion.css";

export default function CageViewerCompanion({ cage, participation, onOpenChat }: {
  cage: CageState; participation?: ReactNode; onOpenChat?: () => void;
}) {
  const event = cageEvent(cage);
  const match = cage.matches.find((item) => item.id === (cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId));
  return <section className="cage-viewer-companion" aria-label="La Cage · participation">
    <header><span><Swords aria-hidden="true" /><small>LA CAGE</small></span><h2>{event.title}</h2><p>{event.discipline}</p></header>
    <div className="cage-viewer-companion__current"><Radio aria-hidden="true" /><span><strong>{match ? `${match.competitorA.name} face à ${match.competitorB.name}` : "Le host prépare le prochain passage"}</strong><small>{cage.votingOpen ? "Le choix de vote s’affiche directement sur le live." : "Profite du direct et retrouve le public dans le chat."}</small></span></div>
    {participation}
    {onOpenChat ? <button type="button" className="cage-viewer-companion__chat" onClick={onOpenChat}><MessageCircle aria-hidden="true" />Revenir au chat</button> : null}
    {cage.runtime?.publicResults ? <CageResults runtime={cage.runtime} matchId={cage.runtime.publicResults.matchId} /> : cage.runtime?.publicBracketVisible ? <section className="cage-viewer-companion__programme" aria-label="Programme publié par le host"><h3>Programme du host</h3>{cage.matches.map((item) => <div key={item.id}><small>{item.id === match?.id ? "EN COURS" : `Tour ${item.round}`}</small><span>{item.competitorA.name}<i>vs</i>{item.competitorB.name}</span></div>)}</section> : null}
  </section>;
}
