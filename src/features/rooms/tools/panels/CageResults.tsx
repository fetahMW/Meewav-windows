import { ArrowLeft, Crown, MonitorUp, Trophy, Users } from "lucide-react";
import type { CageCompetitionRuntime } from "../cageCompetition.types";
import { cageResults } from "../cageResults";
import type { CageSendCommand } from "./CageCompetitionWorkspace";
import "./cage-results.css";

export default function CageResults({runtime,matchId,onBack,send,busy=false}: {
  runtime:CageCompetitionRuntime; matchId?:string|null; onBack?:()=>void; send?:CageSendCommand; busy?:boolean;
}) {
  const rows=cageResults(runtime,matchId);
  const published=Boolean(runtime.publicResults && runtime.publicResults.matchId === (matchId ?? null));
  const title=matchId ? "Résultat du match" : runtime.config.format === "open-mic" ? "Le choix du public" : "Le palmarès";
  const rest=rows.filter((row)=>row.rank>3);
  return <section className="cage-results" aria-label={title}>
    <header className="cage-results__toolbar">{onBack?<button type="button" onClick={onBack}><ArrowLeft/>Retour</button>:<span>RÉSULTATS OFFICIELS</span>}
      {send?<button type="button" className={published?"is-published":""} aria-pressed={published} disabled={busy||!rows.length} onClick={()=>void send("broadcast.results",{enabled:!published,...(matchId?{matchId}:{})})}><MonitorUp/>{published?"Retirer du public":"Publier au public"}</button>:null}</header>
    <div className="cage-results__hero"><span className="cage-results__eyebrow">LA CAGE · {matchId?"MATCH TERMINÉ":"COMPÉTITION TERMINÉE"}</span><Trophy aria-hidden="true"/><h2>{title}</h2><p>{runtime.config.title}</p></div>
    {rows.length?<><div className="cage-results__podium" aria-label="Podium">
      {([2,1,3] as const).map((rank)=>{const occupants=rows.filter((row)=>row.rank===rank);return <div className={`cage-results__step is-rank-${rank}`} key={rank}>
        <div className="cage-results__winners">{occupants.length?occupants.map((row)=><article key={row.person.id}>
          {rank===1?<Crown className="cage-results__crown" aria-hidden="true"/>:null}
          <div className="cage-results__portrait">{row.person.avatarUrl?<img src={row.person.avatarUrl} alt={`Portrait de ${row.person.name}`}/>:<Users/>}</div>
          <strong>{row.person.name}</strong><small>{row.label}</small>{occupants.length>1?<em>Ex æquo</em>:null}
        </article>):<span className="cage-results__vacant">Non attribué</span>}</div>
        <div className="cage-results__plinth"><b>{rank}</b><span>{rank===1?"OR":rank===2?"ARGENT":"BRONZE"}</span></div>
      </div>;})}
    </div><section className="cage-results__ranking" aria-label="Suite du classement"><h3>Le classement</h3>{rest.length?rest.map((row)=><article key={row.person.id}><b>{row.rank}</b><img src={row.person.avatarUrl} alt=""/><strong>{row.person.name}</strong><span>{row.label}</span></article>):<p>Tous les artistes classés figurent sur le podium.</p>}</section></>:<p className="cage-results__empty">{runtime.config.rules.openMicFeedback==="none"?"Cet Open Mic s’est déroulé sans vote : aucun classement n’est attribué.":"Les résultats apparaîtront après la clôture des votes."}</p>}
  </section>;
}
