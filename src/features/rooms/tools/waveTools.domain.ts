import { tallyRoomVote, type RoomVotingPolicy } from "../voting/roomVoting";
import type {
  WaveLayer,
  WaveLoopStatus,
  WaveState,
  WaveStatusHistoryEntry,
  WaveSubmission,
  WaveSubmissionStatus,
} from "./roomTools.types";

export const WAVE_LOOP_TRANSITIONS: Readonly<Record<WaveLoopStatus, readonly WaveLoopStatus[]>> = {
  UPLOADING: ["PROCESSING", "PROCESSING_FAILED", "REMOVED"],
  PROCESSING: ["RECEIVED", "NEEDS_REVIEW", "PROCESSING_FAILED", "REMOVED"],
  RECEIVED: ["NEEDS_REVIEW", "NEEDS_CORRECTION", "READY_FOR_VOTE", "REJECTED", "REMOVED"],
  NEEDS_REVIEW: ["NEEDS_CORRECTION", "READY_FOR_VOTE", "REJECTED", "REMOVED"],
  NEEDS_CORRECTION: ["NEEDS_REVIEW", "REJECTED", "REMOVED", "SUPERSEDED"],
  READY_FOR_VOTE: ["VOTING", "NEEDS_REVIEW", "NEEDS_CORRECTION", "REJECTED", "REMOVED"],
  VOTING: ["ACCEPTED", "NOT_SELECTED", "NEEDS_REVIEW"],
  ACCEPTED: ["REMOVED"],
  NOT_SELECTED: ["NEEDS_REVIEW", "NEEDS_CORRECTION", "REMOVED"],
  REJECTED: ["REMOVED"],
  SUPERSEDED: ["REMOVED"],
  REMOVED: [],
  PROCESSING_FAILED: ["PROCESSING", "REMOVED"],
};

const LEGACY_TO_LIFECYCLE: Record<WaveSubmissionStatus, WaveLoopStatus> = {
  received: "RECEIVED",
  analysis: "READY_FOR_VOTE",
  "to-review": "NEEDS_REVIEW",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  rework: "NEEDS_CORRECTION",
};

const LIFECYCLE_TO_LEGACY: Record<WaveLoopStatus, WaveSubmissionStatus> = {
  UPLOADING: "received",
  PROCESSING: "received",
  RECEIVED: "received",
  NEEDS_REVIEW: "to-review",
  NEEDS_CORRECTION: "rework",
  READY_FOR_VOTE: "analysis",
  VOTING: "analysis",
  ACCEPTED: "accepted",
  NOT_SELECTED: "rejected",
  REJECTED: "rejected",
  SUPERSEDED: "rejected",
  REMOVED: "rejected",
  PROCESSING_FAILED: "received",
};

type TransitionOptions = {
  actorId?: string;
  at?: string;
  eventId?: string;
  reason?: string;
};

type CorrectedVersionPatch = Pick<
  WaveSubmission,
  "fileName" | "fileSize" | "mimeType" | "mediaUrl" | "mediaPath" | "bpm" | "key" | "bars" | "durationSeconds"
>;

function isoNow(value?: string) {
  return value ?? new Date().toISOString();
}

function normalizedLifecycleFromLegacy(submission: WaveSubmission): WaveLoopStatus {
  if (submission.vote?.open) return "VOTING";
  if (submission.status === "rejected" && submission.decisionSource === "public") return "NOT_SELECTED";
  return LEGACY_TO_LIFECYCLE[submission.status];
}

function historyEntry(
  submission: WaveSubmission,
  status: WaveLoopStatus,
  options: TransitionOptions,
): WaveStatusHistoryEntry {
  const previousEntry = submission.statusHistory?.[Math.max(0, (submission.statusHistory?.length ?? 1) - 1)];
  const sequence = (previousEntry?.sequence ?? 0) + 1;
  return {
    id: options.eventId ?? `${submission.id}:v${submission.version}:${sequence}:${status}`,
    sequence,
    status,
    at: isoNow(options.at),
    version: submission.version,
    ...(options.actorId ? { actorId: options.actorId } : {}),
    ...(options.reason ? { reason: options.reason } : {}),
  };
}

export function waveTechnicalFingerprint(value: CorrectedVersionPatch) {
  return [
    value.mediaPath ?? value.mediaUrl ?? "unresolved",
    value.fileName ?? "unnamed",
    value.fileSize ?? 0,
    value.mimeType ?? "unknown",
    value.durationSeconds,
    value.bpm,
    value.key,
    value.bars,
  ].join("|");
}

/** Adds the authoritative lifecycle to one legacy record without discarding data. */
export function normalizeWaveSubmission(submission: WaveSubmission) {
  submission.lifecycleStatus ??= normalizedLifecycleFromLegacy(submission);
  submission.originalContributorId ??= submission.contributor.id;
  submission.statusHistory ??= [];
  if (!submission.statusHistory.length) {
    submission.statusHistory.push(historyEntry(submission, submission.lifecycleStatus, {
      at: submission.submittedAt ?? submission.versions[0]?.receivedAt ?? "1970-01-01T00:00:00.000Z",
      eventId: `${submission.id}:legacy:${submission.lifecycleStatus}`,
      reason: "legacy_normalization",
    }));
  }

  if (!submission.versions.length) {
    submission.versions.push({
      version: submission.version,
      receivedAt: submission.submittedAt ?? "1970-01-01T00:00:00.000Z",
      note: "Version originale normalisée",
      fileName: submission.fileName,
      fileSize: submission.fileSize,
      mimeType: submission.mimeType,
      mediaUrl: submission.mediaUrl,
      mediaPath: submission.mediaPath,
      bpm: submission.bpm,
      key: submission.key,
      bars: submission.bars,
      durationSeconds: submission.durationSeconds,
      contributorId: submission.contributor.id,
      status: submission.lifecycleStatus,
      technicalFingerprint: waveTechnicalFingerprint(submission),
    });
  }

  submission.versions.forEach((version) => {
    version.contributorId ??= submission.originalContributorId;
    version.status ??= version.version < submission.version ? "SUPERSEDED" : submission.lifecycleStatus;
    if (version.version === submission.version) {
      version.fileName ??= submission.fileName;
      version.fileSize ??= submission.fileSize;
      version.mimeType ??= submission.mimeType;
      version.mediaUrl ??= submission.mediaUrl;
      version.mediaPath ??= submission.mediaPath;
      version.bpm ??= submission.bpm;
      version.key ??= submission.key;
      version.bars ??= submission.bars;
      version.durationSeconds ??= submission.durationSeconds;
    }
    version.technicalFingerprint ??= waveTechnicalFingerprint({
      fileName: version.fileName ?? submission.fileName,
      fileSize: version.fileSize ?? submission.fileSize,
      mimeType: version.mimeType ?? submission.mimeType,
      mediaUrl: version.mediaUrl ?? submission.mediaUrl,
      mediaPath: version.mediaPath ?? submission.mediaPath,
      bpm: version.bpm ?? submission.bpm,
      key: version.key ?? submission.key,
      bars: version.bars ?? submission.bars,
      durationSeconds: version.durationSeconds ?? submission.durationSeconds,
    });
  });

  const currentVersion = submission.versions.find((version) => version.version === submission.version);
  if (currentVersion) currentVersion.status = submission.lifecycleStatus;
  submission.status = LIFECYCLE_TO_LEGACY[submission.lifecycleStatus];
  return submission;
}

export function canTransitionWaveLoop(from: WaveLoopStatus, to: WaveLoopStatus) {
  return from === to || WAVE_LOOP_TRANSITIONS[from].includes(to);
}

export function transitionWaveSubmission(
  submission: WaveSubmission,
  target: WaveLoopStatus,
  options: TransitionOptions = {},
) {
  normalizeWaveSubmission(submission);
  const current = submission.lifecycleStatus!;
  if (current === target) return submission;
  if (!canTransitionWaveLoop(current, target)) throw new Error(`wave_status_transition_forbidden:${current}:${target}`);
  if (current === "VOTING" && submission.vote?.submissionVersion !== submission.version) throw new Error("wave_vote_version_mismatch");
  if (target === "VOTING" && (!submission.vote?.open || submission.vote.submissionVersion !== submission.version)) {
    throw new Error("wave_vote_version_mismatch");
  }

  submission.lifecycleStatus = target;
  submission.status = LIFECYCLE_TO_LEGACY[target];
  submission.statusHistory!.push(historyEntry(submission, target, options));
  const currentVersion = submission.versions.find((version) => version.version === submission.version);
  if (currentVersion) currentVersion.status = target;
  return submission;
}

export function assertSingleWaveVote(wave: WaveState, exceptSubmissionId?: string) {
  const open = wave.submissions.filter((item) => item.vote?.open && item.id !== exceptSubmissionId);
  if (open.length) throw new Error("wave_vote_already_open");
}

export function assertWaveBeatIntegrity(wave: WaveState) {
  const seen = new Set<string>();
  wave.layers.forEach((layer, index) => {
    if (index === 0 || layer.id === "base") return;
    if (!layer.submissionId || seen.has(layer.submissionId)) throw new Error("wave_layer_duplicate");
    seen.add(layer.submissionId);
    const submission = wave.submissions.find((item) => item.id === layer.submissionId);
    if (!submission) throw new Error("wave_layer_submission_missing");
    normalizeWaveSubmission(submission);
    if (submission.lifecycleStatus !== "ACCEPTED") throw new Error("wave_layer_public_approval_required");
    if (layer.submissionVersion !== undefined && layer.submissionVersion !== submission.version) {
      throw new Error("wave_layer_version_mismatch");
    }
  });
}

/**
 * Read-compatibility for persisted v1 Rooms. Invalid legacy layers are removed
 * from the playable beat instead of making a Room impossible to reopen.
 */
export function normalizeWaveState(wave: WaveState) {
  wave.submissionsOpen ??= true;
  wave.submissions.forEach(normalizeWaveSubmission);
  const openVotes = wave.submissions.filter((submission) => submission.vote?.open);
  if (openVotes.length > 1) throw new Error("wave_vote_already_open");
  wave.layers = wave.layers.filter((layer, index) => {
    if (index === 0 || layer.id === "base") return true;
    const submission = wave.submissions.find((item) => item.id === layer.submissionId);
    if (!submission || submission.lifecycleStatus !== "ACCEPTED") return false;
    layer.submissionVersion ??= submission.version;
    return true;
  });
  assertWaveBeatIntegrity(wave);
  return wave;
}

export function openWaveVote(
  wave: WaveState,
  submission: WaveSubmission,
  options: TransitionOptions & { durationSeconds?: number; listeningMode?: "solo" | "beat"; thresholdPercent?: number; roundId?: string } = {},
) {
  normalizeWaveState(wave);
  normalizeWaveSubmission(submission);
  if (submission.vote?.open) return submission.vote;
  if (submission.lifecycleStatus !== "READY_FOR_VOTE") throw new Error("wave_submission_not_ready");
  assertSingleWaveVote(wave, submission.id);
  const at = isoNow(options.at);
  const durationSeconds = options.durationSeconds ?? 30;
  submission.vote = {
    roundId: options.roundId ?? options.eventId ?? `${submission.id}:v${submission.version}:${at}`,
    open: true,
    hidden: true,
    durationSeconds,
    listeningMode: options.listeningMode ?? "beat",
    thresholdPercent: options.thresholdPercent ?? 60,
    submissionVersion: submission.version,
    lockedPreviewFingerprint: submission.versions.find((version) => version.version === submission.version)?.technicalFingerprint,
    votes: {},
    totalVotes: 0,
    openedAt: at,
    endsAt: new Date(new Date(at).getTime() + durationSeconds * 1_000).toISOString(),
    finalizedAt: null,
    finalizationKey: null,
    outcome: null,
  };
  transitionWaveSubmission(submission, "VOTING", { ...options, at });
  return submission.vote;
}

function waveVoteTally(submission: WaveSubmission, policy?: RoomVotingPolicy) {
  const tally = tallyRoomVote(policy, submission.vote?.votes ?? {}, ["yes", "no"]);
  return { total: tally.total,
    yes: policy?.mode === "jury" ? tally.juryCounts[0] : tally.publicCounts[0] + tally.juryCounts[0],
    no: policy?.mode === "jury" ? tally.juryCounts[1] : tally.publicCounts[1] + tally.juryCounts[1],
    yesPercent: tally.percentages[0], ready: tally.ready };
}

export function integrateAcceptedWaveSubmission(wave: WaveState, submission: WaveSubmission) {
  normalizeWaveSubmission(submission);
  if (submission.lifecycleStatus !== "ACCEPTED") throw new Error("wave_layer_public_approval_required");
  if (submission.vote?.submissionVersion !== submission.version || submission.vote.open) throw new Error("wave_vote_version_mismatch");
  const existing = wave.layers.find((layer) => layer.submissionId === submission.id);
  if (existing) {
    if (existing.submissionVersion !== undefined && existing.submissionVersion !== submission.version) throw new Error("wave_layer_version_mismatch");
    existing.submissionVersion = submission.version;
    return existing;
  }
  const layer: WaveLayer = {
    id: `layer-${submission.id}`,
    submissionId: submission.id,
    submissionVersion: submission.version,
    title: submission.title,
    author: submission.contributor.name,
    active: true,
    solo: false,
    muted: false,
  };
  wave.layers.push(layer);
  assertWaveBeatIntegrity(wave);
  return layer;
}

export function finalizeWaveVote(
  wave: WaveState,
  submission: WaveSubmission,
  options: TransitionOptions & { finalizationKey?: string } = {},
) {
  normalizeWaveState(wave);
  normalizeWaveSubmission(submission);
  const vote = submission.vote;
  if (!vote) throw new Error("wave_vote_required");
  if (vote.submissionVersion !== submission.version) throw new Error("wave_vote_version_mismatch");
  if (vote.finalizedAt) {
    if (options.finalizationKey && vote.finalizationKey && options.finalizationKey !== vote.finalizationKey) {
      throw new Error("wave_vote_already_finalized");
    }
    return vote.outcome;
  }
  if (submission.lifecycleStatus !== "VOTING" || !vote.open) throw new Error("wave_vote_closed");

  const tally = waveVoteTally(submission, wave.votingPolicy);
  const target: WaveLoopStatus = !tally.ready
    ? "NEEDS_REVIEW"
    : tally.yesPercent >= vote.thresholdPercent ? "ACCEPTED" : "NOT_SELECTED";
  // Validate the complete state transition before mutating the vote object.
  if (!canTransitionWaveLoop(submission.lifecycleStatus, target)) throw new Error("wave_vote_outcome_mismatch");

  const at = isoNow(options.at);
  vote.open = false;
  vote.hidden = false;
  vote.endsAt = at;
  vote.finalizedAt = at;
  vote.finalizationKey = options.finalizationKey ?? options.eventId ?? `${vote.roundId ?? submission.id}:finalize`;
  vote.weightedApprovalPercent = tally.yesPercent;
  vote.totalVotes = tally.total;
  vote.yesCount = tally.yes;
  vote.noCount = tally.no;
  vote.outcome = target === "ACCEPTED" ? "accepted" : target === "NOT_SELECTED" ? "rejected" : null;
  transitionWaveSubmission(submission, target, { ...options, at });
  if (target === "ACCEPTED") integrateAcceptedWaveSubmission(wave, submission);
  assertWaveBeatIntegrity(wave);
  return vote.outcome;
}

export function appendCorrectedWaveVersion(
  submission: WaveSubmission,
  patch: CorrectedVersionPatch,
  options: TransitionOptions & { note?: string; correctionReason?: string; correctedBy?: string } = {},
) {
  normalizeWaveSubmission(submission);
  if (submission.vote?.open || submission.lifecycleStatus === "VOTING") throw new Error("wave_vote_open");
  if (["ACCEPTED", "REJECTED", "SUPERSEDED", "REMOVED"].includes(submission.lifecycleStatus!)) {
    throw new Error("wave_submission_version_locked");
  }

  const previousVersion = submission.versions.find((version) => version.version === submission.version);
  if (previousVersion) previousVersion.status = "SUPERSEDED";
  const nextVersion = submission.version + 1;
  const at = isoNow(options.at);
  submission.version = nextVersion;
  Object.assign(submission, patch);
  submission.vote = undefined;
  submission.reviewReason = undefined;
  submission.reviewFeedback = undefined;
  submission.decisionSource = undefined;
  submission.lifecycleStatus = "NEEDS_REVIEW";
  submission.status = "to-review";
  submission.versions.push({
    version: nextVersion,
    receivedAt: at,
    note: options.note?.trim() || "Version retravaillée",
    status: "NEEDS_REVIEW",
    contributorId: submission.originalContributorId,
    ...(options.correctedBy ? { correctedBy: options.correctedBy } : {}),
    ...(options.correctionReason ? { correctionReason: options.correctionReason } : {}),
    technicalFingerprint: waveTechnicalFingerprint(patch),
    ...patch,
  });
  submission.statusHistory!.push(historyEntry(submission, "NEEDS_REVIEW", {
    ...options,
    at,
    reason: options.correctionReason ?? options.reason ?? "corrected_version_received",
  }));
  return submission;
}
