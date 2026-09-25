import { useState } from "react";
import type { RoomToolsCommand, RoomToolsState } from "../roomTools.types";
import CageOpenMicWorkspace from "../panels/CageOpenMicWorkspace";
import { useCageCommand, type CageWorkspaceView } from "../panels/CageCompetitionWorkspace";
import "../panels/cage-competition-workspace.css";

export default function CageOpenMicAudience({state,accountId,busy,canEngage,execute}: {
  state:RoomToolsState; accountId:string; busy:boolean; canEngage:boolean; execute:(command:RoomToolsCommand)=>Promise<unknown>;
}) {
  const [view,setView]=useState<CageWorkspaceView>("match");
  const send=useCageCommand(state,execute);
  if (!state.cage?.runtime) return null;
  return <section aria-label="Open Mic" className="cage-openmic-audience">
    <nav aria-label="Programme et vote Open Mic">{([['bracket','Programme'],['match','Passage'],['vote','Vote']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={view===id} onClick={()=>setView(id)}>{label}{id==='vote'&&state.cage?.runtime?.feedbackEntryId ? " · Ouvert" : ""}</button>)}</nav>
    <div className="cage-workspace"><CageOpenMicWorkspace runtime={state.cage.runtime} view={view} accountId={accountId} disabled={busy||!canEngage} isControl={false} send={send} onView={setView}/></div>
  </section>;
}
