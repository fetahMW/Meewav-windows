import { DEFAULT_CAGE_LAUNCH } from "../launch/cageLaunch";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { cageDemoGuestCandidates } from "./cageCompetition.demo";
import { applyCageCompetitionCommand, initializeCageCompetition, nextCageMatch } from "./cageCompetition";
import type { CageCompetitionAction, CageCompetitionPayload, CageCompetitionConfig } from "./cageCompetition.types";
import type { RoomToolsState } from "./roomTools.types";

export const CAGE_DEMO_BREAK_MS = 2000;
export function simulationCommand(state: RoomToolsState, action: CageCompetitionAction, payload: CageCompetitionPayload = {}, actor = "preview-host") {
  const runtime = state.cage?.runtime;
  const entryId = payload.entryId ?? (action.startsWith("openmic.feedback.") ? runtime?.feedbackEntryId : runtime?.activeEntryId);
  applyCageCompetitionCommand(state, {type:"cage.competition.command",action,payload,expectedRevision:state.revision,expectedEntryId:entryId ?? undefined,expectedMatchId:runtime?.activeMatchId ?? undefined,expectedStepIndex:runtime?.matches.find(m=>m.id===runtime.activeMatchId)?.stepIndex,idempotencyKey:crypto.randomUUID()}, actor);
  state.revision++;
}
export function startCageViewerSimulation(format: CageCompetitionConfig["format"] = "tournament") {
  const state = createRoomToolsFixture("cage", "isolated-viewer-tournament");
  const entrants = cageDemoGuestCandidates().slice(0,16).map(person => ({...person,registered:true,present:true,eligible:true,guestStatus:"backstage" as const,readiness:{camera:true,microphone:true,connection:true,mixer:true,permissions:true}}));
  if (entrants.length !== 16) throw new Error("La simulation nécessite 16 artistes.");
  const participantCount = format === "tournament" ? 16 : 4;
  const titles = { tournament: "Tournoi", championship: "Championnat", "open-mic": "Open Mic", "open-mic-battle": "Open Mic Battle" };
  initializeCageCompetition(state.cage!, {...structuredClone(DEFAULT_CAGE_LAUNCH),format,participantCount,title:`Simulation · ${titles[format]}`,rosterMode:"first-eligible",rules:{...DEFAULT_CAGE_LAUNCH.rules,performanceMode:"simultaneous",rounds:1,openMicFeedback:"appreciation"}}, entrants.slice(0, participantCount));
  if (format === "open-mic") {
    simulationCommand(state, "openmic.schedule", { participantIds: entrants.slice(0, participantCount).map(person => person.id) });
  } else {
    simulationCommand(state,"bracket.generate",{mode:"first-eligible"});
    simulationCommand(state,"bracket.lock");
  }
  simulationCommand(state, "broadcast.bracket", { enabled: true });
  advanceCageViewerSimulation(state);
  return state;
}
export function advanceCageViewerSimulation(state: RoomToolsState) {
  const runtime = state.cage!.runtime!;
  if (runtime.status === "COMPLETED") return;
  if (runtime.config.format === "open-mic") {
    const entry = runtime.openMicEntries?.find(item => item.id === runtime.activeEntryId);
    const feedback = runtime.openMicEntries?.find(item => item.id === runtime.feedbackEntryId);
    if (feedback?.feedback?.open) {
      simulationCommand(state, "openmic.feedback.close", { entryId: feedback.id });
    } else if (entry?.status === "IN_PROGRESS") {
      simulationCommand(state, "openmic.end", { entryId: entry.id });
      simulationCommand(state, "openmic.feedback.open", { entryId: entry.id });
      for (let i = 0; i < 12; i++) simulationCommand(state, "openmic.feedback.cast", { entryId: entry.id, score: 5 }, `public-${entry.id}-${i}`);
    } else {
      const next = runtime.openMicEntries?.find(item => ["WAITING", "READY", "GREENHOUSE"].includes(item.status));
      if (!next) return;
      simulationCommand(state, "openmic.prepare", { entryId: next.id });
      simulationCommand(state, "openmic.promote", { entryId: next.id });
      simulationCommand(state, "openmic.start", { entryId: next.id });
    }
    return;
  }
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
