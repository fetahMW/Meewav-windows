import { DEFAULT_CAGE_LAUNCH } from "../launch/cageLaunch";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { cageDemoGuestCandidates } from "./cageCompetition.demo";
import { applyCageCompetitionCommand, initializeCageCompetition, nextCageMatch } from "./cageCompetition";
import type { CageCompetitionAction, CageCompetitionPayload } from "./cageCompetition.types";
import type { RoomToolsState } from "./roomTools.types";

export const CAGE_DEMO_BREAK_MS = 2000;
export function simulationCommand(state: RoomToolsState, action: CageCompetitionAction, payload: CageCompetitionPayload = {}, actor = "preview-host") {
  applyCageCompetitionCommand(state, {type:"cage.competition.command",action,payload,expectedRevision:state.revision,expectedMatchId:state.cage?.runtime?.activeMatchId ?? undefined,expectedStepIndex:state.cage?.runtime?.matches.find(m=>m.id===state.cage?.runtime?.activeMatchId)?.stepIndex,idempotencyKey:crypto.randomUUID()}, actor);
  state.revision++;
}
export function startCageViewerSimulation() {
  const state = createRoomToolsFixture("cage", "isolated-viewer-tournament");
  const entrants = cageDemoGuestCandidates().slice(0,16).map(person => ({...person,registered:true,present:true,eligible:true,guestStatus:"backstage" as const,readiness:{camera:true,microphone:true,connection:true,mixer:true,permissions:true}}));
  if (entrants.length !== 16) throw new Error("La simulation nécessite 16 artistes.");
  initializeCageCompetition(state.cage!, {...structuredClone(DEFAULT_CAGE_LAUNCH),title:"Tournoi Paris vs Marseille",rosterMode:"first-eligible",rules:{...DEFAULT_CAGE_LAUNCH.rules,performanceMode:"simultaneous",rounds:1}}, entrants);
  simulationCommand(state,"bracket.generate",{mode:"first-eligible"});
  simulationCommand(state,"bracket.lock");
  advanceCageViewerSimulation(state);
  return state;
}
export function advanceCageViewerSimulation(state: RoomToolsState) {
  const runtime = state.cage!.runtime!;
  if (runtime.status === "COMPLETED") return;
  const match = runtime.matches.find(item => item.id === runtime.activeMatchId);
  if (!match || match.status === "RESOLVED" || match.status === "CLOSED") {
    const next = nextCageMatch(runtime);
    if (!next) return;
    simulationCommand(state,"regie.prepare",{matchId:next.id});
    simulationCommand(state,"regie.promote",{matchId:next.id});
    simulationCommand(state,"match.start");
  } else if (match.status === "IN_PROGRESS") {
    simulationCommand(state,"match.end-step");
    simulationCommand(state,"vote.open");
    const a = match.order % 2 ? 43 + match.order : 25;
    const b = match.order % 2 ? 24 : 49 + match.order;
    for (let i=0;i<a+b;i++) simulationCommand(state,"vote.cast",{choice:i<a?"A":"B"},`public-${match.id}-${i}`);
  } else if (match.status === "VOTING") simulationCommand(state,"vote.close");
}
