import { ArrowLeft, Crown, Maximize2, MonitorUp, Trophy, Users } from "lucide-react";
import { useState } from "react";
import type { CageCompetitionRuntime } from "../cageCompetition.types";
import type { RoomPerson } from "../roomTools.types";
import { cageResults } from "../cageResults";
import type { CageSendCommand } from "./CageCompetitionWorkspace";
import "./cage-results.css";

function ResultPortrait({person, decorative=false}: {person:RoomPerson; decorative?:boolean}) {
  const [failed,setFailed]=useState(false);
  return person.avatarUrl && !failed ? <img src={person.avatarUrl} alt={decorative?"":`Portrait de ${person.name}`} onError={()=>setFailed(true)} />
    : <Users role={decorative?undefined:"img"} aria-hidden={decorative||undefined} aria-label={decorative?undefined:`Portrait indisponible de ${person.name}`} />;
}

export default function CageResults({runtime,matchId,onBack,onExpand,send,busy=false,showToolbar=true}: {
  runtime:CageCompetitionRuntime; matchId?:string|null; onBack?:()=>void; onExpand?:()=>void; send?:CageSendCommand; busy?:boolean; showToolbar?:boolean;
}) {
  const rows=cageResults(runtime,matchId);
  const published=Boolean(runtime.publicResults && runtime.publicResults.matchId === (matchId ?? null));
  const title=matchId ? "Résultat du match" : runtime.config.format === "open-mic" ? "Le choix du public" : "Le palmarès";
  const rest=rows.filter((row)=>row.rank>3);
  const podiumRanks=([2,1,3] as const).filter(rank=>rows.some(row=>row.rank===rank));
  return <section className="cage-results" aria-label={title}>
    {showToolbar?<header className="cage-results__toolbar">{onBack?<button type="button" onClick={onBack}><ArrowLeft/>Retour</button>:<span>RÉSULTATS OFFICIELS</span>}
      {onExpand?<button type="button" onClick={onExpand}><Maximize2 aria-hidden="true"/>Voir en grand</button>:null}
      {send?<button type="button" className={published?"is-published":""} aria-pressed={published} disabled={busy||!rows.length} onClick={()=>void send("broadcast.results",{enabled:!published,...(matchId?{matchId}:{})})}><MonitorUp/>{published?"Retirer du public":"Publier au public"}</button>:null}</header>:null}
    <div className="cage-results__hero"><span className="cage-results__eyebrow">LA CAGE · {matchId?"MATCH TERMINÉ":"COMPÉTITION TERMINÉE"}</span><Trophy aria-hidden="true"/><h2>{title}</h2><p>{runtime.config.title}</p></div>
    {rows.length?<><div className="cage-results__podium" data-places={podiumRanks.length} aria-label="Podium">
      {podiumRanks.map((rank)=>{const occupants=rows.filter((row)=>row.rank===rank);return <div className={`cage-results__step is-rank-${rank}`} key={rank}>
        <div className="cage-results__winners">{occupants.map((row)=><article key={row.person.id}>
          {rank===1?<Crown className="cage-results__crown" aria-hidden="true"/>:null}
          <div className="cage-results__portrait"><ResultPortrait key={row.person.avatarUrl} person={row.person}/></div>
          <strong>{row.person.name}</strong><small>{row.label}</small>{occupants.length>1?<em>Ex æquo</em>:null}
        </article>)}</div>
        <div className="cage-results__plinth"><b>{rank}</b><span>{rank===1?"OR":rank===2?"ARGENT":"BRONZE"}</span></div>
      </div>;})}
    </div>{rest.length?<details className="cage-results__ranking"><summary>Suite du classement <span>{rest.length} artiste{rest.length>1?"s":""}</span></summary>{rest.map((row)=><article key={row.person.id}><b>{row.rank}</b><ResultPortrait key={row.person.avatarUrl} person={row.person} decorative/><strong>{row.person.name}</strong><span>{row.label}</span></article>)}</details>:null}</>:<p className="cage-results__empty">{runtime.config.rules.openMicFeedback==="none"?"Cet Open Mic s’est déroulé sans vote : aucun classement n’est attribué.":"Les résultats apparaîtront après la clôture des votes."}</p>}
  </section>;
}
