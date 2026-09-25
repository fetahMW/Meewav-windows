import type {
  CastWaveVoteResult,
  CastWaveClosingVoteResult,
  FinalizeWaveVoteResult,
  FinalizeWaveClosingVoteResult,
  LaunchWaveProductionResult,
  PrivateAuditionResult,
  StartWaveClosingVoteResult,
  StartWaveVoteResult,
  WaveCategoryAvailabilityResult,
  WaveBeatSnapshot,
  WaveBeatTrackSnapshot,
  WaveCategorySnapshot,
  WaveCompatibility,
  WaveEffectsPolicy,
  WaveLoopAnalysisSnapshot,
  WaveLoopStatus,
  WaveLoopVersionSnapshot,
  WaveProductionSnapshot,
  WaveProgramAudioSnapshot,
  WaveProgramSource,
  WaveRenderStatus,
  WaveSessionSnapshot,
  WaveSessionLookup,
  WaveSessionStatus,
  WaveSlotSnapshot,
  WaveSubmissionSnapshot,
  WaveSubmissionDecisionResult,
  WaveVoteChoice,
  WaveVoteKind,
  WaveVoteSnapshot,
  WaveVoteStatus,
} from "./contracts";
import { invalidProductionResponse } from "./errors";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SESSION_STATUSES = new Set<WaveSessionStatus>(["DRAFT", "READY", "LIVE", "PAUSED", "ENDED", "CANCELLED"]);
const LOOP_STATUSES = new Set<WaveLoopStatus>([
  "UPLOADING", "PROCESSING", "RECEIVED", "NEEDS_REVIEW", "NEEDS_CORRECTION", "READY_FOR_VOTE", "VOTING",
  "ACCEPTED", "NOT_SELECTED", "REJECTED", "SUPERSEDED", "REMOVED", "PROCESSING_FAILED",
]);
const VOTE_KINDS = new Set<WaveVoteKind>(["ADMISSION", "REPLACEMENT"]);
const VOTE_STATUSES = new Set<WaveVoteStatus>(["LISTENING", "OPEN", "FINALIZED", "CANCELLED", "SUSPENDED"]);
const VOTE_CHOICES = new Set<WaveVoteChoice>(["APPROVE", "CONTINUE"]);
const COMPATIBILITIES = new Set<WaveCompatibility>(["COMPATIBLE", "NEEDS_REVIEW", "INCOMPATIBLE"]);
const RENDER_STATUSES = new Set<WaveRenderStatus>(["IDLE", "REQUESTED", "PROCESSING", "READY", "FAILED"]);
const PROGRAM_SOURCES = new Set<WaveProgramSource>(["HOST_DAW", "SERVER_RENDER", "SILENCE"]);
const EFFECTS_POLICIES = new Set<WaveEffectsPolicy>(["DRY", "PROCESSED", "EITHER"]);
const SLOT_STATES = new Set<WaveSlotSnapshot["state"]>(["OPEN", "OCCUPIED", "LOCKED"]);
const BEAT_REASONS = new Set<WaveBeatSnapshot["reason"]>(["INITIAL", "ADMISSION", "REPLACEMENT", "REMOVAL", "ROLLBACK"]);
const AUDITION_MODES = new Set<PrivateAuditionResult["mode"]>(["SOLO", "WITH_BEAT"]);
const AUDITION_STATES = new Set<PrivateAuditionResult["state"]>(["READY", "PREPARING", "NOT_CONFIGURED"]);

function fail(operation: string): never {
  throw invalidProductionResponse(operation);
}

function record(operation: string, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail(operation);
  return value as Record<string, unknown>;
}

function text(operation: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return fail(operation);
  return value.trim();
}

function uuid(operation: string, value: unknown): string {
  const parsed = text(operation, value);
  if (!UUID_PATTERN.test(parsed)) return fail(operation);
  return parsed;
}

function nullableUuid(operation: string, value: unknown): string | null {
  return value === null || value === undefined ? null : uuid(operation, value);
}

function nullableText(operation: string, value: unknown): string | null {
  return value === null || value === undefined ? null : text(operation, value);
}

function finite(operation: string, value: unknown, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return fail(operation);
  return value;
}

function nullableFinite(operation: string, value: unknown, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY): number | null {
  return value === null || value === undefined ? null : finite(operation, value, min, max);
}

function integer(operation: string, value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = finite(operation, value, min, max);
  if (!Number.isSafeInteger(parsed)) return fail(operation);
  return parsed;
}

function nullableInteger(operation: string, value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number | null {
  return value === null || value === undefined ? null : integer(operation, value, min, max);
}

function boolean(operation: string, value: unknown): boolean {
  if (typeof value !== "boolean") return fail(operation);
  return value;
}

function nullableBoolean(operation: string, value: unknown): boolean | null {
  return value === null || value === undefined ? null : boolean(operation, value);
}

function timestamp(operation: string, value: unknown): string {
  const parsed = text(operation, value);
  if (!Number.isFinite(Date.parse(parsed))) return fail(operation);
  return new Date(parsed).toISOString();
}

function nullableTimestamp(operation: string, value: unknown): string | null {
  return value === null || value === undefined ? null : timestamp(operation, value);
}

function enumValue<T extends string>(operation: string, value: unknown, allowed: ReadonlySet<T>): T {
  if (typeof value !== "string" || !allowed.has(value as T)) return fail(operation);
  return value as T;
}

function array<T>(operation: string, value: unknown, parser: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) return fail(operation);
  return value.map(parser);
}

function stringArray(operation: string, value: unknown): string[] {
  return array(operation, value, (item) => text(operation, item));
}

function parseSession(operation: string, value: unknown): WaveSessionSnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    roomId: uuid(operation, row.roomId),
    status: enumValue(operation, row.status, SESSION_STATUSES),
    rulesVersion: integer(operation, row.rulesVersion, 1),
    bpm: finite(operation, row.bpm, 20, 400),
    musicalKey: text(operation, row.musicalKey),
    timeSignature: text(operation, row.timeSignature),
    expectedBars: integer(operation, row.expectedBars, 1, 256),
    maxDurationMs: integer(operation, row.maxDurationMs, 250, 900_000),
    acceptedMimeTypes: stringArray(operation, row.acceptedMimeTypes),
    desiredLoopTypes: stringArray(operation, row.desiredLoopTypes),
    effectsPolicy: enumValue(operation, row.effectsPolicy, EFFECTS_POLICIES),
    recommendedLufs: nullableFinite(operation, row.recommendedLufs),
    rulesLockedAt: nullableTimestamp(operation, row.rulesLockedAt),
    cursor: integer(operation, row.cursor),
  };
}

function parseSlot(operation: string, value: unknown): WaveSlotSnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    index: integer(operation, row.index, 0, 31),
    label: text(operation, row.label),
    state: enumValue(operation, row.state, SLOT_STATES),
    acceptedVersionId: nullableUuid(operation, row.acceptedVersionId),
  };
}

function parseCategory(operation: string, value: unknown): WaveCategorySnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    code: text(operation, row.code),
    label: text(operation, row.label),
    position: integer(operation, row.position, 0, 63),
    minSlots: integer(operation, row.minSlots, 0, 32),
    maxSlots: integer(operation, row.maxSlots, 1, 32),
    required: boolean(operation, row.required),
    slots: array(operation, row.slots, (item) => parseSlot(operation, item)),
  };
}

function parseAnalysis(operation: string, value: unknown): WaveLoopAnalysisSnapshot | null {
  if (value === null || value === undefined) return null;
  const row = record(operation, value);
  return {
    compatibility: enumValue(operation, row.compatibility, COMPATIBILITIES),
    estimatedBpm: nullableFinite(operation, row.estimatedBpm, 20, 400),
    estimatedKey: nullableText(operation, row.estimatedKey),
    estimatedBars: nullableInteger(operation, row.estimatedBars, 1, 256),
    sampleRate: nullableInteger(operation, row.sampleRate, 8_000, 384_000),
    bitDepth: nullableInteger(operation, row.bitDepth, 8, 64),
    channels: nullableInteger(operation, row.channels, 1, 16),
    loudnessLufs: nullableFinite(operation, row.loudnessLufs),
    peakDbfs: nullableFinite(operation, row.peakDbfs),
    clipped: boolean(operation, row.clipped),
    excessiveSilence: boolean(operation, row.excessiveSilence),
    corrupt: boolean(operation, row.corrupt),
    analyzedAt: timestamp(operation, row.analyzedAt),
  };
}

function parseVersion(operation: string, value: unknown): WaveLoopVersionSnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    versionNumber: integer(operation, row.versionNumber, 1),
    assetId: uuid(operation, row.assetId),
    supersedesVersionId: nullableUuid(operation, row.supersedesVersionId),
    declaredBpm: nullableFinite(operation, row.declaredBpm, 20, 400),
    declaredKey: nullableText(operation, row.declaredKey),
    declaredBars: nullableInteger(operation, row.declaredBars, 1, 256),
    analysis: parseAnalysis(operation, row.analysis),
    createdAt: timestamp(operation, row.createdAt),
  };
}

function parseSubmission(operation: string, value: unknown): WaveSubmissionSnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    categoryId: uuid(operation, row.categoryId),
    requestedSlotId: nullableUuid(operation, row.requestedSlotId),
    contributorId: uuid(operation, row.contributorId),
    creditName: text(operation, row.creditName),
    title: text(operation, row.title),
    status: enumValue(operation, row.status, LOOP_STATUSES),
    statusReason: nullableText(operation, row.statusReason),
    currentVersionNumber: integer(operation, row.currentVersionNumber),
    submittedAt: timestamp(operation, row.submittedAt),
    versions: array(operation, row.versions, (item) => parseVersion(operation, item)),
  };
}

function parseTrack(operation: string, value: unknown): WaveBeatTrackSnapshot {
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    categoryId: nullableUuid(operation, row.categoryId),
    slotId: nullableUuid(operation, row.slotId),
    loopVersionId: uuid(operation, row.loopVersionId),
    position: integer(operation, row.position, 0, 255),
    gain: finite(operation, row.gain, 0, 4),
    muted: boolean(operation, row.muted),
    isHostBase: boolean(operation, row.isHostBase),
    creditName: text(operation, row.creditName),
    contributorId: uuid(operation, row.contributorId),
  };
}

function parseBeat(operation: string, value: unknown): WaveBeatSnapshot | null {
  if (value === null || value === undefined) return null;
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    revisionNumber: integer(operation, row.revisionNumber, 1),
    parentRevisionId: nullableUuid(operation, row.parentRevisionId),
    reason: enumValue(operation, row.reason, BEAT_REASONS),
    renderAssetId: nullableUuid(operation, row.renderAssetId),
    renderStatus: enumValue(operation, row.renderStatus, RENDER_STATUSES),
    tracks: array(operation, row.tracks, (item) => parseTrack(operation, item)),
    createdAt: timestamp(operation, row.createdAt),
  };
}

function parseVote(operation: string, value: unknown): WaveVoteSnapshot | null {
  if (value === null || value === undefined) return null;
  const row = record(operation, value);
  return {
    id: uuid(operation, row.id),
    kind: enumValue(operation, row.kind, VOTE_KINDS),
    status: enumValue(operation, row.status, VOTE_STATUSES),
    candidateVersionId: uuid(operation, row.candidateVersionId),
    targetSlotId: uuid(operation, row.targetSlotId),
    replacesTrackId: nullableUuid(operation, row.replacesTrackId),
    referenceBeatRevisionId: uuid(operation, row.referenceBeatRevisionId),
    previewAssetId: nullableUuid(operation, row.previewAssetId),
    listeningStartedAt: timestamp(operation, row.listeningStartedAt),
    opensAt: timestamp(operation, row.opensAt),
    closesAt: timestamp(operation, row.closesAt),
    quorum: integer(operation, row.quorum, 1),
    approvalThreshold: finite(operation, row.approvalThreshold, 0.5, 1),
    totalVotes: integer(operation, row.totalVotes),
    approveCount: nullableInteger(operation, row.approveCount),
    continueCount: nullableInteger(operation, row.continueCount),
    approved: nullableBoolean(operation, row.approved),
  };
}

function parseProgramAudio(operation: string, value: unknown): WaveProgramAudioSnapshot | null {
  if (value === null || value === undefined) return null;
  const row = record(operation, value);
  return {
    source: enumValue(operation, row.source, PROGRAM_SOURCES),
    sourceRevisionId: nullableUuid(operation, row.sourceRevisionId),
    sourceAssetId: nullableUuid(operation, row.sourceAssetId),
    sourceRtcPublicationId: nullableText(operation, row.sourceRtcPublicationId),
    renderStatus: enumValue(operation, row.renderStatus, RENDER_STATUSES),
    generation: integer(operation, row.generation, 1),
    changedAt: timestamp(operation, row.changedAt),
  };
}

export function parseWaveProductionSnapshot(operation: string, value: unknown): WaveProductionSnapshot {
  const row = record(operation, value);
  const snapshot: WaveProductionSnapshot = {
    session: parseSession(operation, row.session),
    categories: array(operation, row.categories, (item) => parseCategory(operation, item)),
    submissions: array(operation, row.submissions, (item) => parseSubmission(operation, item)),
    beat: parseBeat(operation, row.beat),
    vote: parseVote(operation, row.vote),
    programAudio: parseProgramAudio(operation, row.programAudio),
  };
  const categoryIds = new Set(snapshot.categories.map((category) => category.id));
  const slotCategory = new Map(snapshot.categories.flatMap((category) => category.slots.map((slot) => [slot.id, category.id] as const)));
  if (categoryIds.size !== snapshot.categories.length) fail(operation);
  if (snapshot.categories.some((category) => category.minSlots > category.maxSlots || category.slots.length > category.maxSlots)) fail(operation);
  if (snapshot.submissions.some((submission) => {
    if (!categoryIds.has(submission.categoryId)) return true;
    if (submission.requestedSlotId && slotCategory.get(submission.requestedSlotId) !== submission.categoryId) return true;
    const numbers = submission.versions.map((version) => version.versionNumber);
    return new Set(numbers).size !== numbers.length || (numbers.length > 0 && Math.max(...numbers) !== submission.currentVersionNumber);
  })) fail(operation);
  if (snapshot.beat?.tracks.some((track) => track.isHostBase
    ? track.categoryId !== null || track.slotId !== null
    : track.categoryId === null || track.slotId === null || slotCategory.get(track.slotId) !== track.categoryId)) fail(operation);
  if (snapshot.vote?.kind === "ADMISSION" && snapshot.vote.replacesTrackId !== null) fail(operation);
  if (snapshot.vote?.kind === "REPLACEMENT" && snapshot.vote.replacesTrackId === null) fail(operation);
  if (snapshot.vote && !(Date.parse(snapshot.vote.listeningStartedAt) <= Date.parse(snapshot.vote.opensAt)
    && Date.parse(snapshot.vote.opensAt) < Date.parse(snapshot.vote.closesAt))) fail(operation);
  if (snapshot.vote && snapshot.vote.approvalThreshold <= 0.5) fail(operation);
  if (snapshot.programAudio?.source === "SERVER_RENDER" && !snapshot.programAudio.sourceRevisionId) fail(operation);
  if (snapshot.programAudio?.source === "HOST_DAW" && (!snapshot.programAudio.sourceRtcPublicationId || snapshot.programAudio.sourceRevisionId || snapshot.programAudio.sourceAssetId)) fail(operation);
  if (snapshot.programAudio?.source === "SILENCE" && (snapshot.programAudio.sourceRevisionId || snapshot.programAudio.sourceAssetId || snapshot.programAudio.sourceRtcPublicationId)) fail(operation);
  return snapshot;
}

export function parseStartWaveVoteResult(operation: string, value: unknown): StartWaveVoteResult {
  const row = record(operation, value);
  return {
    roundId: uuid(operation, row.roundId),
    status: enumValue(operation, row.status, new Set(["LISTENING"] as const)),
    kind: enumValue(operation, row.kind, VOTE_KINDS),
    candidateVersionId: uuid(operation, row.candidateVersionId),
    referenceBeatRevisionId: uuid(operation, row.referenceBeatRevisionId),
    serverNow: timestamp(operation, row.serverNow),
  };
}

export function parseCastWaveVoteResult(operation: string, value: unknown): CastWaveVoteResult {
  const row = record(operation, value);
  if (row.accepted !== true) fail(operation);
  return { roundId: uuid(operation, row.roundId), accepted: true, serverCastAt: timestamp(operation, row.serverCastAt) };
}

export function parseFinalizeWaveVoteResult(operation: string, value: unknown): FinalizeWaveVoteResult {
  const row = record(operation, value);
  const approved = boolean(operation, row.approved);
  const beatRevisionId = nullableUuid(operation, row.beatRevisionId);
  const activationId = nullableUuid(operation, row.activationId);
  if (approved && (!beatRevisionId || !activationId)) fail(operation);
  if (!approved && (beatRevisionId || activationId)) fail(operation);
  return {
    roundId: uuid(operation, row.roundId),
    approved,
    approveCount: integer(operation, row.approveCount),
    continueCount: integer(operation, row.continueCount),
    totalVotes: integer(operation, row.totalVotes),
    beatRevisionId,
    activationId,
    serverFinalizedAt: timestamp(operation, row.serverFinalizedAt),
  };
}

export function parsePrivateAuditionResult(operation: string, value: unknown): PrivateAuditionResult {
  const row = record(operation, value);
  const state = enumValue(operation, row.state, AUDITION_STATES);
  const previewAssetId = nullableUuid(operation, row.previewAssetId);
  if (state === "READY" && previewAssetId === null) fail(operation);
  return {
    waveId: uuid(operation, row.waveId),
    requestId: uuid(operation, row.requestId),
    candidateVersionId: uuid(operation, row.candidateVersionId),
    referenceBeatRevisionId: uuid(operation, row.referenceBeatRevisionId),
    mode: enumValue(operation, row.mode, AUDITION_MODES),
    state,
    previewAssetId,
    updatedAt: timestamp(operation, row.updatedAt),
  };
}

export function parseLaunchWaveProductionResult(operation: string, value: unknown): LaunchWaveProductionResult {
  const row = record(operation, value);
  return {
    waveId: uuid(operation, row.waveId),
    state: enumValue(operation, row.state, new Set([
      "PREPARING", "LIVE_ACTIVE", "PAUSED", "INTERMISSION", "CLOSURE_VOTE", "FINALIZING", "ENDED",
    ] as const)),
  };
}

export function parseWaveSessionLookup(operation: string, value: unknown): WaveSessionLookup {
  const row = record(operation, value);
  return {
    sessionId: uuid(operation, row.sessionId),
    roomId: uuid(operation, row.roomId),
    lifecycleState: enumValue(operation, row.lifecycleState, new Set([
      "PREPARING", "LIVE_ACTIVE", "PAUSED", "INTERMISSION", "CLOSURE_VOTE", "FINALIZING", "ENDED",
    ] as const)),
    status: enumValue(operation, row.status, SESSION_STATUSES),
  };
}

export function parseWaveCategoryAvailabilityResult(operation: string, value: unknown): WaveCategoryAvailabilityResult {
  const row = record(operation, value);
  return { categoryId: uuid(operation, row.categoryId), open: boolean(operation, row.open) };
}

export function parseWaveSubmissionDecisionResult(operation: string, value: unknown): WaveSubmissionDecisionResult {
  const row = record(operation, value);
  return {
    submissionId: uuid(operation, row.submissionId),
    status: enumValue(operation, row.status, LOOP_STATUSES),
  };
}

export function parseStartWaveClosingVoteResult(operation: string, value: unknown): StartWaveClosingVoteResult {
  const row = record(operation, value);
  return {
    closingVoteId: uuid(operation, row.closingVoteId),
    status: enumValue(operation, row.status, new Set(["LISTENING"] as const)),
  };
}

export function parseCastWaveClosingVoteResult(operation: string, value: unknown): CastWaveClosingVoteResult {
  const row = record(operation, value);
  if (row.accepted !== true) fail(operation);
  return { closingVoteId: uuid(operation, row.closingVoteId), accepted: true };
}

export function parseFinalizeWaveClosingVoteResult(operation: string, value: unknown): FinalizeWaveClosingVoteResult {
  const row = record(operation, value);
  const approved = boolean(operation, row.approved);
  const finalBeatRevisionId = nullableUuid(operation, row.finalBeatRevisionId);
  if (approved !== Boolean(finalBeatRevisionId)) fail(operation);
  return { closingVoteId: uuid(operation, row.closingVoteId), approved, finalBeatRevisionId };
}

export const WAVE_VOTE_CHOICES = VOTE_CHOICES;
