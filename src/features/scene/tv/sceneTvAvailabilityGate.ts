import { validateTvLinearRights } from "../mediaGovernance";
import type { MediaRightsDecision } from "../mediaGovernance";
import {
  addDaysToDateKey,
  getBroadcastProgramsForDay,
  getDateKeyInTimeZone,
  getProgramsForDay,
  getZonedDayBounds,
  resolveProgramSource,
} from "./sceneTvGuide.engine";
import type {
  SceneTvChannel,
  SceneTvGuideProgram,
  SceneTvProgramSource,
} from "./sceneTvGuide.models";
import type {
  SceneTvAvailabilityDecision,
  SceneTvAvailabilityGateInput,
  SceneTvAvailabilityIssue,
} from "./sceneTvAvailabilityGate.types";

const PRODUCT_MINIMUM_DAYS = 7;
const DEFAULT_MINIMUM_FORMATS = 6;

function interval(program: SceneTvGuideProgram) {
  const startsAt = Date.parse(program.startsAt);
  const endsAt = Date.parse(program.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

function issueKey(issue: SceneTvAvailabilityIssue) {
  return [
    issue.code,
    issue.day ?? "",
    issue.programId ?? "",
    issue.sourceId ?? "",
    issue.detailCode ?? "",
  ].join("::");
}

function pushUniqueIssue(
  issues: SceneTvAvailabilityIssue[],
  seen: Set<string>,
  issue: SceneTvAvailabilityIssue,
) {
  const key = issueKey(issue);
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function rightsDecisionsForInterval(
  source: SceneTvProgramSource,
  startsAt: number,
  endsAt: number,
  input: SceneTvAvailabilityGateInput,
): readonly MediaRightsDecision[] {
  const checkTimes = [...new Set([startsAt, Math.max(startsAt, endsAt - 1)])];
  return checkTimes.map((at) => validateTvLinearRights(
    source.publishedVideoId,
    input.rightsGrants,
    { at, territory: input.options.territory },
  ));
}

function addRightsIssues(
  decisions: readonly MediaRightsDecision[],
  issueCode: "fallback-tv-rights-denied" | "program-tv-rights-denied",
  sourceId: string,
  issues: SceneTvAvailabilityIssue[],
  seen: Set<string>,
  programId?: string,
) {
  for (const decision of decisions) {
    for (const rightsIssue of decision.issues) {
      pushUniqueIssue(issues, seen, {
        code: issueCode,
        programId,
        sourceId,
        detailCode: rightsIssue.code,
      });
    }
  }
}

function validateFallback(
  channel: SceneTvChannel,
  input: SceneTvAvailabilityGateInput,
  windowStart: number,
  windowEnd: number,
  issues: SceneTvAvailabilityIssue[],
  seen: Set<string>,
) {
  if (!Number.isFinite(channel.fallbackBlockMinutes) || channel.fallbackBlockMinutes <= 0) {
    pushUniqueIssue(issues, seen, { code: "fallback-config-invalid" });
  }
  const source = input.guide.sources.find(({ id }) => id === channel.fallbackSourceId);
  if (!source) {
    pushUniqueIssue(issues, seen, {
      code: "fallback-source-missing",
      sourceId: channel.fallbackSourceId,
    });
    return null;
  }
  addRightsIssues(
    rightsDecisionsForInterval(source, windowStart, windowEnd, input),
    "fallback-tv-rights-denied",
    source.id,
    issues,
    seen,
  );
  return source;
}

/**
 * Pure launch/readiness gate. It does not schedule, publish or grant rights.
 * Every decision must be recomputed by the server before the antenna opens.
 */
export function evaluateSceneTvAvailability(
  input: SceneTvAvailabilityGateInput,
): SceneTvAvailabilityDecision {
  const { options, guide } = input;
  const issues: SceneTvAvailabilityIssue[] = [];
  const seenIssues = new Set<string>();
  const minimumDays = Math.max(
    PRODUCT_MINIMUM_DAYS,
    Math.floor(options.minimumDays ?? PRODUCT_MINIMUM_DAYS),
  );
  const days = Math.floor(options.days);
  const channel = guide.channels.find(({ id }) => id === options.channelId);
  if (!channel) {
    return {
      available: false,
      channelId: options.channelId,
      startDay: null,
      endDayExclusive: null,
      evaluatedDays: 0,
      editorialProgramCount: 0,
      fallbackBlockCount: 0,
      checkedSourceCount: 0,
      distinctFormats: [],
      issues: [{ code: "channel-missing" }],
    };
  }

  const startDay = getDateKeyInTimeZone(options.startDay, channel.timeZone);
  const endDayExclusive = startDay && Number.isFinite(days)
    ? addDaysToDateKey(startDay, Math.max(0, days))
    : null;
  const firstBounds = startDay ? getZonedDayBounds(startDay, channel.timeZone) : null;
  const endBounds = endDayExclusive
    ? getZonedDayBounds(endDayExclusive, channel.timeZone)
    : null;
  if (!startDay || !endDayExclusive || !firstBounds || !endBounds || days <= 0) {
    return {
      available: false,
      channelId: options.channelId,
      startDay,
      endDayExclusive,
      evaluatedDays: 0,
      editorialProgramCount: 0,
      fallbackBlockCount: 0,
      checkedSourceCount: 0,
      distinctFormats: [],
      issues: [{ code: "invalid-window" }],
    };
  }
  if (days < minimumDays) {
    pushUniqueIssue(issues, seenIssues, { code: "minimum-days-not-met" });
  }

  const fallbackSource = validateFallback(
    channel,
    input,
    firstBounds.startsAt,
    endBounds.startsAt,
    issues,
    seenIssues,
  );
  const formats = new Set<SceneTvGuideProgram["format"]>();
  const checkedSourceIds = new Set<string>();
  let editorialProgramCount = 0;
  let fallbackBlockCount = 0;

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const day = addDaysToDateKey(startDay, dayIndex);
    const bounds = day ? getZonedDayBounds(day, channel.timeZone) : null;
    if (!day || !bounds) {
      pushUniqueIssue(issues, seenIssues, { code: "invalid-window" });
      continue;
    }
    const editorialPrograms = getProgramsForDay(guide.programs, day, {
      channelId: channel.id,
      timeZone: channel.timeZone,
    });
    if (editorialPrograms.length === 0) {
      pushUniqueIssue(issues, seenIssues, { code: "editorial-day-empty", day });
    }
    editorialProgramCount += editorialPrograms.length;
    for (const program of editorialPrograms) formats.add(program.format);

    const timeline = getBroadcastProgramsForDay(
      guide.programs,
      channel,
      guide.sources,
      day,
      { timeZone: channel.timeZone },
    );
    let cursor = bounds.startsAt;
    for (const program of timeline) {
      const programInterval = interval(program);
      if (!programInterval) {
        pushUniqueIssue(issues, seenIssues, {
          code: "program-invalid",
          day,
          programId: program.id,
        });
        continue;
      }
      const effectiveStart = Math.max(bounds.startsAt, programInterval.startsAt);
      const effectiveEnd = Math.min(bounds.endsAt, programInterval.endsAt);
      if (effectiveEnd <= bounds.startsAt || effectiveStart >= bounds.endsAt) continue;
      if (effectiveStart > cursor) {
        pushUniqueIssue(issues, seenIssues, {
          code: "broadcast-gap",
          day,
          programId: program.id,
        });
      } else if (effectiveStart < cursor) {
        pushUniqueIssue(issues, seenIssues, {
          code: "broadcast-overlap",
          day,
          programId: program.id,
        });
      }
      cursor = Math.max(cursor, effectiveEnd);

      if (program.isFallback) fallbackBlockCount += 1;
      const source = resolveProgramSource(program, guide.sources);
      if (!source) {
        pushUniqueIssue(issues, seenIssues, {
          code: "program-source-missing",
          day,
          programId: program.id,
          sourceId: program.sourceId,
        });
        continue;
      }
      checkedSourceIds.add(source.id);
      addRightsIssues(
        rightsDecisionsForInterval(source, effectiveStart, effectiveEnd, input),
        program.isFallback ? "fallback-tv-rights-denied" : "program-tv-rights-denied",
        source.id,
        issues,
        seenIssues,
        program.id,
      );
    }
    if (cursor < bounds.endsAt) {
      pushUniqueIssue(issues, seenIssues, { code: "broadcast-gap", day });
    }
  }

  if (fallbackSource) checkedSourceIds.add(fallbackSource.id);
  const minimumDistinctFormats = Math.max(1, Math.floor(
    options.minimumDistinctFormats ?? DEFAULT_MINIMUM_FORMATS,
  ));
  if (formats.size < minimumDistinctFormats) {
    pushUniqueIssue(issues, seenIssues, { code: "insufficient-format-diversity" });
  }

  return {
    available: issues.length === 0,
    channelId: options.channelId,
    startDay,
    endDayExclusive,
    evaluatedDays: days,
    editorialProgramCount,
    fallbackBlockCount,
    checkedSourceCount: checkedSourceIds.size,
    distinctFormats: [...formats].sort(),
    issues,
  };
}
