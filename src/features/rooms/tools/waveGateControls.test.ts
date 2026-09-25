import { describe, expect, it } from "vitest";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { reduceCommand } from "./roomTools.service";
import { normalizeWaveState } from "./waveTools.domain";

describe("Wave gate controls", () => {
  it("keeps legacy gates open, then blocks contributions when the host closes them", () => {
    const state = createRoomToolsFixture("wave", "wave-gate-closed");
    delete state.wave!.submissionsOpen;
    normalizeWaveState(state.wave!);
    expect(state.wave!.submissionsOpen).toBe(true);

    reduceCommand(state, { type: "wave.submissions.setOpen", open: false }, "host");
    expect(state.wave!.submissionsOpen).toBe(false);

    const candidate = structuredClone(state.wave!.submissions[0]);
    candidate.id = "closed-gate-candidate";
    expect(() => reduceCommand(state, { type: "wave.submission.add", submission: candidate }, "contributor"))
      .toThrow("wave_submissions_closed");
  });

  it("updates the shared rules without replacing the official audio asset", () => {
    const state = createRoomToolsFixture("wave", "wave-rules-update");
    const mediaUrl = state.wave!.baseLoop.mediaUrl;

    reduceCommand(state, {
      type: "wave.rules.update",
      patch: { bpm: 128, key: "A mineur", bars: 4, kind: "House organique" },
    }, "host");

    expect(state.wave!.baseLoop).toMatchObject({ bpm: 128, key: "A mineur", bars: 4, kind: "House organique", mediaUrl });
    expect(state.wave!.history[0]).toContain("Règles mises à jour");
  });
});
