import { expect, it } from "vitest";
import { startCageViewerSimulation, advanceCageViewerSimulation, CAGE_DEMO_BREAK_MS } from "./cageViewerSimulation";
it("runs a 16-entrant elimination bracket to one winner without touching shared state", () => {
 const state = startCageViewerSimulation();
 expect(state.cage!.runtime!.participants).toHaveLength(16);
 expect(state.cage!.runtime!.matches).toHaveLength(15);
 for(let i=0;i<50 && state.cage!.runtime!.status !== "COMPLETED";i++) advanceCageViewerSimulation(state);
 const runtime=state.cage!.runtime!;
 expect(runtime.status).toBe("COMPLETED");
 expect(runtime.matches.filter(m=>m.winnerId)).toHaveLength(15);
 expect(runtime.matches.find(m=>m.round===4)?.winnerId).toBeTruthy();
 expect(CAGE_DEMO_BREAK_MS).toBe(2000);
});
