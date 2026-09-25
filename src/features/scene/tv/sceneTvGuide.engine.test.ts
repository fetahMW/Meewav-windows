import { describe, expect, it } from "vitest";

import { ALL_SHORTS_VIDEOS } from "../../shorts/shorts-wall-data";
import {
  addDaysToDateKey,
  getBroadcastTimeline,
  getCurrentProgram,
  getDateKeyInTimeZone,
  getFallbackProgram,
  getNextBroadcastProgram,
  getNextProgram,
  getPreviousProgram,
  getProgramRemainingMs,
  getProgramsBetween,
  getProgramsForDay,
  getScheduleContinuityIssues,
  resolveProgramSource,
} from "./sceneTvGuide.engine";
import {
  createSceneTvGuideProgramsAround,
  SCENE_TV_CHANNELS_FIXTURE,
  SCENE_TV_GUIDE_DEMO_NOW,
  SCENE_TV_GUIDE_FIXTURE,
  SCENE_TV_GUIDE_SOURCES_FIXTURE,
  SCENE_TV_GUIDE_START_DATE,
  SCENE_TV_MAIN_CHANNEL_ID,
  SCENE_TV_PROGRAMS_14_DAY_FIXTURE,
  SCENE_TV_TIME_ZONE,
} from "./sceneTvGuide.fixtures";
import type { SceneTvChannelId, SceneTvGuideProgram } from "./sceneTvGuide.models";

function program(
  id: string,
  startsAt: string,
  endsAt: string,
  channelId: SceneTvChannelId = SCENE_TV_MAIN_CHANNEL_ID,
): SceneTvGuideProgram {
  return {
    id,
    channelId,
    sourceId: "source-1",
    format: "session",
    title: id,
    description: id,
    startsAt,
    endsAt,
  };
}

describe("sceneTvGuide engine", () => {
  it("resolves a programme in its middle and the programme strictly after it", () => {
    const programs = [
      program("first", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("second", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z"),
    ];

    expect(getCurrentProgram(programs, "2026-08-07T18:30:00Z")?.id).toBe("first");
    expect(getNextProgram(programs, "2026-08-07T18:30:00Z")?.id).toBe("second");
  });

  it("uses half-open intervals at an exact programme transition", () => {
    const programs = [
      program("first", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("second", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z"),
      program("third", "2026-08-07T20:00:00Z", "2026-08-07T21:00:00Z"),
    ];

    expect(getCurrentProgram(programs, "2026-08-07T19:00:00Z")?.id).toBe("second");
    expect(getNextProgram(programs, "2026-08-07T19:00:00Z")?.id).toBe("third");
  });

  it("resolves previous, current and next around the injected clock", () => {
    const programs = [
      program("previous", "2026-08-07T17:00:00Z", "2026-08-07T18:00:00Z"),
      program("current", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("next", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z"),
    ];
    const clock = "2026-08-07T18:24:00Z";

    expect(getPreviousProgram(programs, clock)?.id).toBe("previous");
    expect(getCurrentProgram(programs, clock)?.id).toBe("current");
    expect(getNextProgram(programs, clock)?.id).toBe("next");
    expect(getProgramRemainingMs(programs[1], clock)).toBe(36 * 60_000);
    expect(getProgramRemainingMs(programs[1], "2026-08-07T20:00:00Z")).toBe(0);
  });

  it("selects a local calendar day in the requested timezone", () => {
    const afterParisMidnight = program(
      "paris-next-day",
      "2026-08-07T22:30:00Z",
      "2026-08-07T23:30:00Z",
    );
    const programs = [afterParisMidnight];

    expect(getProgramsForDay(programs, "2026-08-07", {
      timeZone: "Europe/Paris",
    })).toEqual([]);
    expect(getProgramsForDay(programs, "2026-08-08", {
      timeZone: "Europe/Paris",
    }).map(({ id }) => id)).toEqual(["paris-next-day"]);
    expect(getProgramsForDay(programs, new Date("2026-08-07T22:45:00Z"), {
      timeZone: "Europe/Paris",
    }).map(({ id }) => id)).toEqual(["paris-next-day"]);
  });

  it("returns all programmes overlapping a range and respects the channel", () => {
    const programs = [
      program("before", "2026-08-07T17:30:00Z", "2026-08-07T18:15:00Z"),
      program("inside", "2026-08-07T18:15:00Z", "2026-08-07T18:45:00Z"),
      program("other-channel", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z", "regional"),
      program("after", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z"),
    ];

    expect(getProgramsBetween(
      programs,
      "2026-08-07T18:00:00Z",
      "2026-08-07T19:00:00Z",
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    ).map(({ id }) => id)).toEqual(["before", "inside"]);
  });

  it("builds a deterministic fallback block backed by a published source", () => {
    const channel = SCENE_TV_CHANNELS_FIXTURE[0];
    const fallback = getFallbackProgram(
      channel,
      SCENE_TV_GUIDE_SOURCES_FIXTURE,
      "2026-08-07T03:07:00Z",
    );

    expect(fallback).toMatchObject({
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
      sourceId: channel.fallbackSourceId,
      startsAt: "2026-08-07T03:00:00.000Z",
      endsAt: "2026-08-07T03:30:00.000Z",
      isFallback: true,
    });
    const source = fallback
      ? resolveProgramSource(fallback, SCENE_TV_GUIDE_SOURCES_FIXTURE)
      : null;
    expect(source?.publishedVideoId).toBeTruthy();
  });

  it("resolves now and next from the fourteen-day fixture", () => {
    const current = getCurrentProgram(
      SCENE_TV_PROGRAMS_14_DAY_FIXTURE,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    );
    const next = getNextProgram(
      SCENE_TV_PROGRAMS_14_DAY_FIXTURE,
      SCENE_TV_GUIDE_DEMO_NOW,
      { channelId: SCENE_TV_MAIN_CHANNEL_ID },
    );

    expect(current?.editorialLabel).toBe("Première");
    expect(current?.format).toBe("premiere");
    expect(next).not.toBeNull();
    expect(current?.endsAt).toBe(next?.startsAt);
    expect(getProgramRemainingMs(current!, SCENE_TV_GUIDE_DEMO_NOW)).toBe(78 * 60_000);
  });

  it("generates the guide around a supplied now and exposes Paris today and tomorrow", () => {
    const referenceNow = new Date("2031-01-15T11:00:00Z");
    const relativePrograms = createSceneTvGuideProgramsAround(referenceNow, 4, 1);
    const today = getDateKeyInTimeZone(referenceNow, SCENE_TV_TIME_ZONE)!;
    const tomorrow = addDaysToDateKey(today, 1)!;

    expect(getDateKeyInTimeZone(relativePrograms[0].startsAt, SCENE_TV_TIME_ZONE))
      .toBe(addDaysToDateKey(today, -1));
    expect(getProgramsForDay(relativePrograms, today, {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
      timeZone: SCENE_TV_TIME_ZONE,
    })).toHaveLength(15);
    expect(getProgramsForDay(relativePrograms, tomorrow, {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
      timeZone: SCENE_TV_TIME_ZONE,
    })).toHaveLength(15);
    expect(getScheduleContinuityIssues(relativePrograms, {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
    })).toEqual([]);
  });

  it("keeps a continuous antenna across the Europe/Paris DST transition", () => {
    const programs = createSceneTvGuideProgramsAround(
      new Date("2031-03-30T10:00:00Z"),
      4,
      1,
    );

    expect(getScheduleContinuityIssues(programs, {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
    })).toEqual([]);
    expect(programs.every((item) => Date.parse(item.endsAt) > Date.parse(item.startsAt))).toBe(true);
  });

  it("reports an implicit hole or overlap instead of silently accepting it", () => {
    const programs = [
      program("first", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("gap", "2026-08-07T19:30:00Z", "2026-08-07T20:00:00Z"),
      program("overlap", "2026-08-07T19:45:00Z", "2026-08-07T20:30:00Z"),
    ];

    expect(getScheduleContinuityIssues(programs)).toEqual([
      expect.objectContaining({ type: "gap", durationMs: 30 * 60_000 }),
      expect.objectContaining({ type: "overlap", durationMs: 15 * 60_000 }),
    ]);
  });

  it("audits continuity independently per channel", () => {
    const programs = [
      program("main-a", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("main-b", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z"),
      program("regional-a", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z", "regional"),
      program("regional-b", "2026-08-07T19:00:00Z", "2026-08-07T20:00:00Z", "regional"),
    ];

    expect(getScheduleContinuityIssues(programs)).toEqual([]);
  });

  it("puts continuity on air as the truthful next item when editorial slots have a gap", () => {
    const channel = SCENE_TV_CHANNELS_FIXTURE[0];
    const programs = [
      program("editorial", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("later", "2026-08-07T20:00:00Z", "2026-08-07T21:00:00Z"),
    ];
    const next = getNextBroadcastProgram(
      programs,
      channel,
      SCENE_TV_GUIDE_SOURCES_FIXTURE,
      "2026-08-07T18:30:00Z",
    );

    expect(next).toMatchObject({
      startsAt: "2026-08-07T19:00:00.000Z",
      endsAt: "2026-08-07T19:30:00.000Z",
      editorialLabel: "La Scène en continu",
      isFallback: true,
    });
  });

  it("materialises gaps as ordered continuity blocks in the broadcast chronology", () => {
    const channel = SCENE_TV_CHANNELS_FIXTURE[0];
    const programs = [
      program("first", "2026-08-07T18:00:00Z", "2026-08-07T19:00:00Z"),
      program("second", "2026-08-07T20:00:00Z", "2026-08-07T21:00:00Z"),
    ];
    const timeline = getBroadcastTimeline(
      programs,
      channel,
      SCENE_TV_GUIDE_SOURCES_FIXTURE,
      "2026-08-07T18:30:00Z",
      "2026-08-07T20:30:00Z",
    );

    expect(timeline.map(({ id }) => id)).toEqual([
      "first",
      "meewav-main-fallback-2026-08-07T19:00:00.000Z",
      "meewav-main-fallback-2026-08-07T19:30:00.000Z",
      "second",
    ]);
    expect(timeline.every((item, index) => (
      index === 0 || Date.parse(item.startsAt) === Date.parse(timeline[index - 1].endsAt)
    ))).toBe(true);
  });

  it("keeps the visible fallback chronology aligned with the on-air block", () => {
    const channel = SCENE_TV_CHANNELS_FIXTURE[0];
    const timeline = getBroadcastTimeline(
      [],
      channel,
      SCENE_TV_GUIDE_SOURCES_FIXTURE,
      "2026-08-07T03:07:00Z",
      "2026-08-07T04:07:00Z",
    );

    expect(timeline[0]).toMatchObject({
      startsAt: "2026-08-07T03:00:00.000Z",
      endsAt: "2026-08-07T03:30:00.000Z",
      isFallback: true,
    });
  });

  it("provides at least 120 valid programmes over fourteen days", () => {
    const localDays = new Set(SCENE_TV_PROGRAMS_14_DAY_FIXTURE.map((item) => (
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(item.startsAt))
    )));
    const publishedIds = new Set(ALL_SHORTS_VIDEOS.map((video) => video.id));

    expect(SCENE_TV_GUIDE_FIXTURE.channels).toHaveLength(1);
    expect(SCENE_TV_GUIDE_FIXTURE.channels[0].id).toBe("meewav-main");
    const fixtureToday = getDateKeyInTimeZone(
      SCENE_TV_GUIDE_DEMO_NOW,
      SCENE_TV_TIME_ZONE,
    )!;
    expect(SCENE_TV_GUIDE_START_DATE).toBe(fixtureToday);
    expect(SCENE_TV_PROGRAMS_14_DAY_FIXTURE.length).toBeGreaterThanOrEqual(120);
    expect(localDays.size).toBe(14);
    expect(SCENE_TV_GUIDE_SOURCES_FIXTURE.length).toBeGreaterThanOrEqual(150);
    expect(new Set(SCENE_TV_GUIDE_SOURCES_FIXTURE.map(({ artistId }) => artistId)).size)
      .toBeGreaterThanOrEqual(60);
    expect(new Set(SCENE_TV_PROGRAMS_14_DAY_FIXTURE.map(({ format }) => format))).toEqual(new Set([
      "best_of",
      "session",
      "la_releve",
      "style_focus",
      "carte_blanche",
      "connexion",
      "city_focus",
      "meewav_info",
      "replay",
      "premiere",
      "official_statement",
      "documentary_night",
    ]));
    expect(SCENE_TV_PROGRAMS_14_DAY_FIXTURE.every((item) => (
      resolveProgramSource(item, SCENE_TV_GUIDE_SOURCES_FIXTURE) !== null
    ))).toBe(true);
    expect(new Set(SCENE_TV_GUIDE_SOURCES_FIXTURE.map(({ format }) => format)).size)
      .toBeGreaterThanOrEqual(12);
    const roomSimulcast = SCENE_TV_GUIDE_SOURCES_FIXTURE.find(({ kind }) => (
      kind === "room-simulcast"
    ));
    expect(roomSimulcast?.roomId).toBe("room-tv-session-cuivres");
    expect(SCENE_TV_PROGRAMS_14_DAY_FIXTURE.some(({ sourceId, isLive }) => (
      sourceId === roomSimulcast?.id && isLive === true
    ))).toBe(true);
    expect(SCENE_TV_GUIDE_SOURCES_FIXTURE.every((source) => (
      publishedIds.has(source.publishedVideoId)
      && source.mediaUrl.startsWith("/media/")
      && source.thumbnailUrl.startsWith("/images/shorts/")
    ))).toBe(true);

    const chronologicalPrograms = [...SCENE_TV_PROGRAMS_14_DAY_FIXTURE].sort((left, right) => (
      Date.parse(left.startsAt) - Date.parse(right.startsAt)
    ));
    expect(chronologicalPrograms).toHaveLength(14 * 15);
    expect(chronologicalPrograms.every((item, index) => (
      index === 0
      || Date.parse(item.startsAt) === Date.parse(chronologicalPrograms[index - 1].endsAt)
    ))).toBe(true);
    expect(getScheduleContinuityIssues(chronologicalPrograms, {
      channelId: SCENE_TV_MAIN_CHANNEL_ID,
    })).toEqual([]);
  });
});
