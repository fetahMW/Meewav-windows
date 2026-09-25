import { describe, expect, it } from "vitest";

import type { MediaRightsGrant } from "../mediaGovernance";
import { evaluateSceneTvAvailability } from "./sceneTvAvailabilityGate";
import { SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS } from "./sceneTvAvailabilityGate.fixtures";
import {
  SCENE_TV_GUIDE_FIXTURE,
  SCENE_TV_GUIDE_START_DATE,
  SCENE_TV_MAIN_CHANNEL_ID,
} from "./sceneTvGuide.fixtures";
import type { SceneTvGuide } from "./sceneTvGuide.models";

function evaluate(
  guide: SceneTvGuide = SCENE_TV_GUIDE_FIXTURE,
  rightsGrants: readonly MediaRightsGrant[] = SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS,
  days = 14,
) {
  return evaluateSceneTvAvailability({
    guide,
    rightsGrants,
    options: {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
      startDay: SCENE_TV_GUIDE_START_DATE,
      days,
      territory: "FR",
    },
  });
}

describe("MeeWav TV availability gate", () => {
  it("accepts the complete fourteen-day investor fixture", () => {
    const result = evaluate();

    expect(result.available).toBe(true);
    expect(result.evaluatedDays).toBe(14);
    expect(result.editorialProgramCount).toBe(14 * 15);
    expect(result.distinctFormats.length).toBeGreaterThanOrEqual(6);
    expect(result.checkedSourceCount).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  it("enforces the seven-day product floor even when a caller asks for less", () => {
    const result = evaluateSceneTvAvailability({
      guide: SCENE_TV_GUIDE_FIXTURE,
      rightsGrants: SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS,
      options: {
        channelId: SCENE_TV_MAIN_CHANNEL_ID,
        startDay: SCENE_TV_GUIDE_START_DATE,
        days: 6,
        minimumDays: 1,
        territory: "FR",
      },
    });

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual({ code: "minimum-days-not-met" });
  });

  it("uses an authorised fallback to preserve a genuine scheduling gap", () => {
    const removedProgram = SCENE_TV_GUIDE_FIXTURE.programs[4];
    const guide = {
      ...SCENE_TV_GUIDE_FIXTURE,
      programs: SCENE_TV_GUIDE_FIXTURE.programs.filter(({ id }) => id !== removedProgram.id),
    };
    const result = evaluate(guide);

    expect(result.available).toBe(true);
    expect(result.fallbackBlockCount).toBeGreaterThan(0);
    expect(result.issues).toEqual([]);
  });

  it("fails even with a full schedule when the fallback source is absent", () => {
    const channel = SCENE_TV_GUIDE_FIXTURE.channels[0];
    const guide = {
      ...SCENE_TV_GUIDE_FIXTURE,
      channels: [{ ...channel, fallbackSourceId: "missing-fallback-source" }],
    };
    const result = evaluate(guide);

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "fallback-source-missing",
      sourceId: "missing-fallback-source",
    }));
  });

  it("does not accept a VOD grant in place of tvLinear rights", () => {
    const channel = SCENE_TV_GUIDE_FIXTURE.channels[0];
    const fallbackSource = SCENE_TV_GUIDE_FIXTURE.sources.find(({ id }) => (
      id === channel.fallbackSourceId
    ))!;
    const rightsGrants: MediaRightsGrant[] = [
      ...SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS.filter(({ assetId }) => (
        assetId !== fallbackSource.publishedVideoId
      )),
      {
        ...SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS.find(({ assetId }) => (
          assetId === fallbackSource.publishedVideoId
        ))!,
        id: "vod-only-fallback",
        use: "sceneVod",
      },
    ];
    const result = evaluate(SCENE_TV_GUIDE_FIXTURE, rightsGrants);

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "fallback-tv-rights-denied",
      sourceId: fallbackSource.id,
      detailCode: "missing-grant",
    }));
  });

  it("checks that tvLinear rights remain valid through the programme end", () => {
    const targetProgram = SCENE_TV_GUIDE_FIXTURE.programs.find(({ sourceId }) => (
      sourceId !== SCENE_TV_GUIDE_FIXTURE.channels[0].fallbackSourceId
    ))!;
    const targetSource = SCENE_TV_GUIDE_FIXTURE.sources.find(({ id }) => (
      id === targetProgram.sourceId
    ))!;
    const expiresMidProgram = new Date(
      (Date.parse(targetProgram.startsAt) + Date.parse(targetProgram.endsAt)) / 2,
    ).toISOString();
    const rightsGrants = SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS.map((grant) => (
      grant.assetId === targetSource.publishedVideoId
        ? { ...grant, validUntil: expiresMidProgram }
        : grant
    ));
    const result = evaluate(SCENE_TV_GUIDE_FIXTURE, rightsGrants);

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "program-tv-rights-denied",
      sourceId: targetSource.id,
      detailCode: "grant-expired",
    }));
  });

  it("rejects overlaps that fallback cannot make truthful", () => {
    const original = SCENE_TV_GUIDE_FIXTURE.programs[0];
    const overlap = {
      ...SCENE_TV_GUIDE_FIXTURE.programs[1],
      id: "investor-demo-overlap",
      startsAt: original.startsAt,
      endsAt: original.endsAt,
    };
    const guide = {
      ...SCENE_TV_GUIDE_FIXTURE,
      programs: [...SCENE_TV_GUIDE_FIXTURE.programs, overlap],
    };
    const result = evaluate(guide);

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "broadcast-overlap",
    }));
  });

  it("blocks a repetitive schedule below the format-diversity threshold", () => {
    const guide = {
      ...SCENE_TV_GUIDE_FIXTURE,
      programs: SCENE_TV_GUIDE_FIXTURE.programs.map((program) => ({
        ...program,
        format: "session" as const,
      })),
    };
    const result = evaluate(guide);

    expect(result.available).toBe(false);
    expect(result.distinctFormats).toEqual(["session"]);
    expect(result.issues).toContainEqual({ code: "insufficient-format-diversity" });
  });

  it("requires editorial content on every evaluated day instead of airing fallback only", () => {
    const programs = SCENE_TV_GUIDE_FIXTURE.programs.slice(0, 7 * 15);
    const guide = { ...SCENE_TV_GUIDE_FIXTURE, programs };
    const result = evaluate(guide);

    expect(result.available).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "editorial-day-empty",
    }));
  });
});
