import { useState } from "react";
import { ListMusic, Mic2, Vote } from "lucide-react";
import { RoomViewerSubmenu } from "../../place/RoomViewerToolsLayout";
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
    <RoomViewerSubmenu activeTool={view} onSelect={setView} ariaLabel="Programme et vote Open Mic" idPrefix="cage-openmic-viewer" items={[
      { id: "bracket", label: "Programme", icon: <ListMusic aria-hidden="true" /> },
      { id: "match", label: "Passage", icon: <Mic2 aria-hidden="true" /> },
      { id: "vote", label: state.cage.runtime.feedbackEntryId ? "Vote ouvert" : "Vote", icon: <Vote aria-hidden="true" /> },
    ]} />
    <div className="cage-workspace" role="tabpanel" aria-labelledby={`cage-openmic-viewer-${view}`}><CageOpenMicWorkspace runtime={state.cage.runtime} view={view} accountId={accountId} disabled={busy||!canEngage} isControl={false} send={send} onView={setView}/></div>
  </section>;
}
