import { describe, expect, it, vi } from "vitest";

import { getSceneTvProgressEvents, trackSceneTv } from "./sceneTvAnalytics";

describe("MeeWav TV analytics bridge", () => {
  it("emits a product event without coupling the TV UI to a provider", () => {
    const listener = vi.fn();
    window.addEventListener("meewav:analytics", listener);

    trackSceneTv({ event: "tv_opened", programId: "programme-1" });

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({
      channelId: "meewav-main",
      event: "tv_opened",
      programId: "programme-1",
    });
    window.removeEventListener("meewav:analytics", listener);
  });
});

describe("MeeWav TV progress analytics", () => {
  it("maps linear programme progress to ordered quartile events", () => {
    expect(getSceneTvProgressEvents(24.99)).toEqual([]);
    expect(getSceneTvProgressEvents(25)).toEqual(["tv_program_25"]);
    expect(getSceneTvProgressEvents(50)).toEqual([
      "tv_program_25",
      "tv_program_50",
    ]);
    expect(getSceneTvProgressEvents(75)).toEqual([
      "tv_program_25",
      "tv_program_50",
      "tv_program_75",
    ]);
  });

  it("bounds invalid or out-of-range progress safely", () => {
    expect(getSceneTvProgressEvents(Number.NaN)).toEqual([]);
    expect(getSceneTvProgressEvents(-20)).toEqual([]);
    expect(getSceneTvProgressEvents(180)).toEqual([
      "tv_program_25",
      "tv_program_50",
      "tv_program_75",
    ]);
  });
});
