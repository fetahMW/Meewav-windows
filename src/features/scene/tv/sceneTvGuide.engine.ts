import type {
  SceneTvChannel,
  SceneTvDayQueryOptions,
  SceneTvGuideProgram,
  SceneTvProgramQueryOptions,
  SceneTvProgramSource,
} from "./sceneTvGuide.models";

type DateInput = Date | string | number;

export type SceneTvContinuityIssue = {
  type: "invalid" | "gap" | "overlap";
  previousProgramId?: string;
  programId: string;
  durationMs?: number;
};

const DEFAULT_TIME_ZONE = "Europe/Paris";
const zonedDateFormatters = new Map<string, Intl.DateTimeFormat>();
const zonedDateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function toTimestamp(value: DateInput) {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function programInterval(program: SceneTvGuideProgram) {
  const startsAt = Date.parse(program.startsAt);
  const endsAt = Date.parse(program.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return { startsAt, endsAt };
}

function belongsToChannel(program: SceneTvGuideProgram, options: SceneTvProgramQueryOptions) {
  return options.channelId === undefined || program.channelId === options.channelId;
}

function sortByStart(programs: readonly SceneTvGuideProgram[]) {
  return [...programs].sort((left, right) => {
    const leftStart = Date.parse(left.startsAt);
    const rightStart = Date.parse(right.startsAt);
    return leftStart - rightStart || left.id.localeCompare(right.id);
  });
}

function getZonedDateFormatter(timeZone: string) {
  const cached = zonedDateFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  zonedDateFormatters.set(timeZone, formatter);
  return formatter;
}

function getZonedDateTimeFormatter(timeZone: string) {
  const cached = zonedDateTimeFormatters.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    calendar: "iso8601",
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  zonedDateTimeFormatters.set(timeZone, formatter);
  return formatter;
}

function partsToRecord(parts: Intl.DateTimeFormatPart[]) {
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute" | "second", number>;
}

function dateKeyAt(value: DateInput, timeZone: string) {
  const timestamp = toTimestamp(value);
  if (timestamp === null) return null;
  const parts = partsToRecord(getZonedDateFormatter(timeZone).formatToParts(new Date(timestamp)));
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getDateKeyInTimeZone(
  value: DateInput,
  timeZone = DEFAULT_TIME_ZONE,
) {
  return dateKeyAt(value, timeZone);
}

function parseDateKey(value: DateInput, timeZone: string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dateKeyAt(value, timeZone);
}

function dateKeyParts(dateKey: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validation = new Date(Date.UTC(year, month - 1, day));
  if (
    validation.getUTCFullYear() !== year
    || validation.getUTCMonth() !== month - 1
    || validation.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function addCalendarDays(dateKey: string, amount: number) {
  const parts = dateKeyParts(dateKey);
  if (!parts) return null;
  const result = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return result.toISOString().slice(0, 10);
}

export function addDaysToDateKey(dateKey: string, amount: number) {
  return addCalendarDays(dateKey, amount);
}

function getOffsetAt(timestamp: number, timeZone: string) {
  const parts = partsToRecord(
    getZonedDateTimeFormatter(timeZone).formatToParts(new Date(timestamp)),
  );
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - timestamp;
}

export function zonedDateTimeToTimestamp(
  dateKey: string,
  time: string,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const dateParts = dateKeyParts(dateKey);
  const timeMatch = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!dateParts || !timeMatch) return null;
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = Number(timeMatch[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return null;

  const targetAsUtc = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    second,
  );
  const offsetSamples = [
    targetAsUtc,
    targetAsUtc - 36 * 60 * 60_000,
    targetAsUtc + 36 * 60 * 60_000,
    targetAsUtc - 180 * 24 * 60 * 60_000,
    targetAsUtc + 180 * 24 * 60 * 60_000,
  ];
  const offsets = [...new Set(offsetSamples.map((sample) => getOffsetAt(sample, timeZone)))];
  const candidates = offsets.map((offset) => {
    const timestamp = targetAsUtc - offset;
    const parts = partsToRecord(
      getZonedDateTimeFormatter(timeZone).formatToParts(new Date(timestamp)),
    );
    const representedLocal = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return { timestamp, representedLocal };
  });
  const exact = candidates
    .filter((candidate) => candidate.representedLocal === targetAsUtc)
    .sort((left, right) => left.timestamp - right.timestamp);
  if (exact[0]) return exact[0].timestamp;

  // A DST spring-forward can make a local wall-clock time nonexistent. In
  // that case the channel advances to the first representable instant after it.
  return [...candidates].sort((left, right) => {
    const leftAfter = left.representedLocal >= targetAsUtc ? 0 : 1;
    const rightAfter = right.representedLocal >= targetAsUtc ? 0 : 1;
    return leftAfter - rightAfter
      || Math.abs(left.representedLocal - targetAsUtc)
        - Math.abs(right.representedLocal - targetAsUtc)
      || left.timestamp - right.timestamp;
  })[0]?.timestamp ?? null;
}

function zonedMidnightToTimestamp(dateKey: string, timeZone: string) {
  return zonedDateTimeToTimestamp(dateKey, "00:00:00", timeZone);
}

export function getZonedDayBounds(
  day: DateInput,
  timeZone = DEFAULT_TIME_ZONE,
) {
  const dateKey = parseDateKey(day, timeZone);
  const nextDateKey = dateKey ? addCalendarDays(dateKey, 1) : null;
  if (!dateKey || !nextDateKey) return null;
  const startsAt = zonedMidnightToTimestamp(dateKey, timeZone);
  const endsAt = zonedMidnightToTimestamp(nextDateKey, timeZone);
  if (startsAt === null || endsAt === null) return null;
  return { dateKey, startsAt, endsAt };
}

export function getPreviousProgram(
  programs: readonly SceneTvGuideProgram[],
  at: DateInput,
  options: SceneTvProgramQueryOptions = {},
) {
  const timestamp = toTimestamp(at);
  if (timestamp === null) return null;
  const previous = sortByStart(programs.filter((program) => {
    const interval = programInterval(program);
    return interval !== null
      && belongsToChannel(program, options)
      && interval.endsAt <= timestamp;
  }));
  return previous[previous.length - 1] ?? null;
}

export function getCurrentProgram(
  programs: readonly SceneTvGuideProgram[],
  at: DateInput,
  options: SceneTvProgramQueryOptions = {},
) {
  const timestamp = toTimestamp(at);
  if (timestamp === null) return null;
  const active = programs.filter((program) => {
    const interval = programInterval(program);
    return interval !== null
      && belongsToChannel(program, options)
      && timestamp >= interval.startsAt
      && timestamp < interval.endsAt;
  });

  // In the unlikely event of an editorial overlap, the latest start wins.
  const sortedActive = sortByStart(active);
  return sortedActive[sortedActive.length - 1] ?? null;
}

export function getNextProgram(
  programs: readonly SceneTvGuideProgram[],
  at: DateInput,
  options: SceneTvProgramQueryOptions = {},
) {
  const timestamp = toTimestamp(at);
  if (timestamp === null) return null;
  return sortByStart(programs).find((program) => {
    const interval = programInterval(program);
    return interval !== null
      && belongsToChannel(program, options)
      && interval.startsAt > timestamp;
  }) ?? null;
}

export function getProgramsBetween(
  programs: readonly SceneTvGuideProgram[],
  startsAt: DateInput,
  endsAt: DateInput,
  options: SceneTvProgramQueryOptions = {},
) {
  const rangeStart = toTimestamp(startsAt);
  const rangeEnd = toTimestamp(endsAt);
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) return [];

  return sortByStart(programs.filter((program) => {
    const interval = programInterval(program);
    return interval !== null
      && belongsToChannel(program, options)
      && interval.startsAt < rangeEnd
      && interval.endsAt > rangeStart;
  }));
}

export function getProgramsForDay(
  programs: readonly SceneTvGuideProgram[],
  day: DateInput,
  options: SceneTvDayQueryOptions = {},
) {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const bounds = getZonedDayBounds(day, timeZone);
  if (!bounds) return [];
  return getProgramsBetween(programs, bounds.startsAt, bounds.endsAt, options);
}

export function getProgramRemainingMs(
  program: SceneTvGuideProgram,
  at: DateInput = Date.now(),
) {
  const timestamp = toTimestamp(at);
  const interval = programInterval(program);
  if (timestamp === null || !interval) return null;
  return Math.max(0, Math.min(interval.endsAt - interval.startsAt, interval.endsAt - timestamp));
}

export function getScheduleContinuityIssues(
  programs: readonly SceneTvGuideProgram[],
  options: SceneTvProgramQueryOptions = {},
): SceneTvContinuityIssue[] {
  const relevant = programs.filter((program) => belongsToChannel(program, options));
  const issues: SceneTvContinuityIssue[] = [];
  const channelIds = [...new Set(relevant.map((program) => program.channelId))];
  for (const channelId of channelIds) {
    const channelPrograms = relevant.filter((program) => program.channelId === channelId);
    issues.push(...channelPrograms
      .filter((program) => programInterval(program) === null)
      .map((program): SceneTvContinuityIssue => ({ type: "invalid", programId: program.id })));
    const valid = sortByStart(
      channelPrograms.filter((program) => programInterval(program) !== null),
    );
    for (let index = 1; index < valid.length; index += 1) {
      const previous = valid[index - 1];
      const current = valid[index];
      const previousInterval = programInterval(previous)!;
      const currentInterval = programInterval(current)!;
      const delta = currentInterval.startsAt - previousInterval.endsAt;
      if (delta === 0) continue;
      issues.push({
        type: delta > 0 ? "gap" : "overlap",
        previousProgramId: previous.id,
        programId: current.id,
        durationMs: Math.abs(delta),
      });
    }
  }
  return issues;
}

function createFallbackProgram(
  channel: SceneTvChannel,
  source: SceneTvProgramSource,
  startsAt: number,
  endsAt: number,
): SceneTvGuideProgram | null {
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) return null;
  return {
    id: `${channel.id}-fallback-${new Date(startsAt).toISOString()}`,
    channelId: channel.id,
    sourceId: source.id,
    format: channel.fallbackFormat,
    title: source.title,
    description: `${channel.name} continue avec une sélection musicale publiée dans La Scène.`,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(endsAt).toISOString(),
    editorialLabel: "La Scène en continu",
    isFallback: true,
  };
}

export function resolveProgramSource(
  program: Pick<SceneTvGuideProgram, "sourceId">,
  sources: readonly SceneTvProgramSource[],
) {
  return sources.find((source) => source.id === program.sourceId) ?? null;
}

export function getFallbackProgram(
  channel: SceneTvChannel,
  sources: readonly SceneTvProgramSource[],
  at: DateInput,
): SceneTvGuideProgram | null {
  const timestamp = toTimestamp(at);
  const source = sources.find((candidate) => candidate.id === channel.fallbackSourceId);
  if (timestamp === null || !source) return null;

  const durationMinutes = Math.max(1, Math.round(channel.fallbackBlockMinutes));
  const durationMs = durationMinutes * 60_000;
  const startsAt = Math.floor(timestamp / durationMs) * durationMs;
  const endsAt = startsAt + durationMs;

  return createFallbackProgram(channel, source, startsAt, endsAt);
}

/**
 * Resolves the next item that will actually reach the antenna. When an
 * editorial gap follows the current programme, the next item is a continuity
 * block—not a distant appointment several hours later.
 */
export function getNextBroadcastProgram(
  programs: readonly SceneTvGuideProgram[],
  channel: SceneTvChannel,
  sources: readonly SceneTvProgramSource[],
  at: DateInput,
): SceneTvGuideProgram | null {
  const timestamp = toTimestamp(at);
  if (timestamp === null) return null;
  const current = getCurrentProgram(programs, timestamp, { channelId: channel.id })
    ?? getFallbackProgram(channel, sources, timestamp);
  const interval = current ? programInterval(current) : null;
  if (!current || !interval) return null;

  const scheduledNext = getNextProgram(programs, timestamp, { channelId: channel.id });
  const scheduledNextStart = scheduledNext ? Date.parse(scheduledNext.startsAt) : null;

  // An overlap means the later editorial programme will take control before
  // the declared end of the current one, so it is the truthful next item.
  if (scheduledNext && scheduledNextStart !== null && scheduledNextStart <= interval.endsAt) {
    return scheduledNext;
  }

  const source = sources.find((candidate) => candidate.id === channel.fallbackSourceId);
  if (!source) return scheduledNext;
  const blockDuration = Math.max(1, Math.round(channel.fallbackBlockMinutes)) * 60_000;
  const continuityEnd = Math.min(
    interval.endsAt + blockDuration,
    scheduledNextStart ?? Number.POSITIVE_INFINITY,
  );
  return createFallbackProgram(channel, source, interval.endsAt, continuityEnd) ?? scheduledNext;
}

function appendFallbackRange(
  target: SceneTvGuideProgram[],
  channel: SceneTvChannel,
  source: SceneTvProgramSource,
  startsAt: number,
  endsAt: number,
  includeContainingBlock = false,
) {
  const blockDuration = Math.max(1, Math.round(channel.fallbackBlockMinutes)) * 60_000;
  let cursor = startsAt;
  if (includeContainingBlock) {
    const alignedStart = Math.floor(startsAt / blockDuration) * blockDuration;
    const alignedFallback = createFallbackProgram(
      channel,
      source,
      alignedStart,
      Math.min(alignedStart + blockDuration, endsAt),
    );
    if (alignedFallback) target.push(alignedFallback);
    cursor = Math.min(alignedStart + blockDuration, endsAt);
  }
  for (; cursor < endsAt; cursor += blockDuration) {
    const fallback = createFallbackProgram(
      channel,
      source,
      cursor,
      Math.min(cursor + blockDuration, endsAt),
    );
    if (fallback) target.push(fallback);
  }
}

/**
 * Returns the broadcast chronology for a range and materialises continuity
 * blocks in every genuine gap. Scheduled programmes remain the source of
 * truth; fallback entries only make the 24/7 antenna explicit in the guide.
 */
export function getBroadcastTimeline(
  programs: readonly SceneTvGuideProgram[],
  channel: SceneTvChannel,
  sources: readonly SceneTvProgramSource[],
  startsAt: DateInput,
  endsAt: DateInput,
) {
  const rangeStart = toTimestamp(startsAt);
  const rangeEnd = toTimestamp(endsAt);
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) return [];

  const scheduled = getProgramsBetween(programs, rangeStart, rangeEnd, {
    channelId: channel.id,
  });
  const continuitySource = sources.find((source) => source.id === channel.fallbackSourceId);
  if (!continuitySource) return scheduled;

  const timeline: SceneTvGuideProgram[] = [];
  let cursor = rangeStart;
  for (const program of scheduled) {
    const interval = programInterval(program);
    if (!interval) continue;
    if (interval.startsAt > cursor) {
      appendFallbackRange(
        timeline,
        channel,
        continuitySource,
        cursor,
        interval.startsAt,
        timeline.length === 0,
      );
    }
    timeline.push(program);
    cursor = Math.max(cursor, interval.endsAt);
  }
  if (cursor < rangeEnd) {
    appendFallbackRange(
      timeline,
      channel,
      continuitySource,
      cursor,
      rangeEnd,
      timeline.length === 0,
    );
  }
  return sortByStart(timeline);
}

export function getBroadcastProgramsForDay(
  programs: readonly SceneTvGuideProgram[],
  channel: SceneTvChannel,
  sources: readonly SceneTvProgramSource[],
  day: DateInput,
  options: Pick<SceneTvDayQueryOptions, "timeZone"> = {},
) {
  const timeZone = options.timeZone ?? channel.timeZone ?? DEFAULT_TIME_ZONE;
  const bounds = getZonedDayBounds(day, timeZone);
  if (!bounds) return [];
  return getBroadcastTimeline(
    programs,
    channel,
    sources,
    bounds.startsAt,
    bounds.endsAt,
  );
}
