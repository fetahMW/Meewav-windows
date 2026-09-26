import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DemoRoomToolsRepository } from "./roomTools.service";
import { WAVE_TEST_PRODUCTIONS } from "./waveTestPacks";

describe("Wave test packs", () => {
  it("opens on Afro with a host base and only the new separated loops", async () => {
    const state = await new DemoRoomToolsRepository().load("wave", "initial");
    expect(state.wave?.baseLoop).toMatchObject({ bpm: 100, key: "Am", bars: 8 });
    expect(state.wave?.layers).toMatchObject([{ id: "base", author: "Puff", active: true }]);
    expect(state.wave?.submissions).toHaveLength(6);
    expect(state.wave?.submissions.every((item) => item.status === "received" && item.mediaUrl?.includes("wave-test-pack"))).toBe(true);
  });

  it.each(WAVE_TEST_PRODUCTIONS)("loads $id with valid WAV metadata and resets the previous test", async (production) => {
    const repo = new DemoRoomToolsRepository();
    const before = await repo.load("wave", "switch");
    const candidate = before.wave!.submissions[0];
    await repo.execute("wave", "switch", "host", { type: "wave.vote.open", submissionId: candidate.id, open: true });
    const signal = vi.fn();
    repo.subscribe("wave", "switch", signal);
    const state = await repo.simulateWaveProduction("switch", production.id);
    expect(signal).toHaveBeenCalledOnce();
    expect(state.wave?.layers).toHaveLength(1);
    expect(state.wave?.activeSubmissionId).toBeNull();
    expect(state.wave?.playing).toBe(false);
    expect(state.wave?.submissions.every((item) => !item.vote && item.status === "received")).toBe(true);
    for (const media of [state.wave!.baseLoop, ...state.wave!.submissions]) {
      const wav = readFileSync(`public${media.mediaUrl}`);
      expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
      expect(wav.length).toBe(media.fileSize);
      expect((wav.length - 44) / (44100 * 4)).toBeCloseTo(media.durationSeconds!, 5);
      expect(media.bpm).toBe(production.bpm);
    }
    const restarted = await repo.simulateWaveProduction("switch", production.id);
    expect(restarted.wave?.submissions).toHaveLength(6);
    expect(restarted.revision).toBe(state.revision + 1);
  });
});
