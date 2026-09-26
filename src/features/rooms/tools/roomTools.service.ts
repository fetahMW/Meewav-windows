import { readDemoVotingPolicy } from "../voting/roomVoting.service";
import { applyRoomVotingPolicy, requireRoomVoter } from "../voting/roomVotingCommands";
import {switchToolsKey} from "../switch-room/switchRoom.preparation";
import { assertDemoExperience, readDemoExperience } from "../switch-room/switchRoom.service";
import { readCageDemoSession, DEFAULT_CAGE_LAUNCH } from "../launch/cageLaunch";
import { ROOMS_HOME_CATALOG } from "../home/roomsHome.fixtures";
import { cageDemoGuestCandidates } from "./cageCompetition.demo";
import { controlCageShowcase, initializeCageShowcase, moveCageDemoGuest, prepareCageShowcaseVote } from "./cageShowcase.demo";
import { applyCageCompetitionCommand, cageCommandAlreadyApplied, finalizeExpiredCageVote, initializeCageCompetition, migrateCageDemoCompetition, migrateOpenMicRuntime, migrateChampionshipRuntime, projectCageCompetition, syncCageLegacyProjection } from "./cageCompetition";
import { readRoomLaunchSession, applyRoomLaunchTools } from "../launch/roomLaunch";
import { isRoomLaunchAudio, resolveRoomLaunchAudio } from "../launch/roomLaunchAudio";
import { createRoomToolsFixture } from "./roomTools.fixtures";
import { seedWaveTestProduction } from "./waveTestPacks";
import { WAVE_LOOP_CATEGORIES, waveAcceptedCategories, waveSubmissionCategory } from "./waveLoopCategories";
import {
  cageEvent,
  cageOpenMicSlot,
  cageOpenMicEntries,
  generateCageStructure,
  normalizedCageFormat,
} from "./cageTools.domain";
import {
  appendCorrectedWaveVersion,
  finalizeWaveVote as finalizeWaveVoteDomain,
  integrateAcceptedWaveSubmission,
  normalizeWaveState,
  normalizeWaveSubmission,
  openWaveVote,
  transitionWaveSubmission,
} from "./waveTools.domain";
import type {
  CageMatch,
  RoomActorRole,
  RoomGiftRedemption,
  RoomGiftTransaction,
  LogeState,
  RoomToolsCommand,
  RoomToolsState,
  SceneState,
  SpecializedRoomId,
  WaveReviewReason,
  WaveState,
  WaveSubmission,
} from "./roomTools.types";

export type RoomToolsRealtimeSubscription = { unsubscribe: () => void };

export interface RoomToolsRepository {
  load(roomType: SpecializedRoomId, roomId: string): Promise<RoomToolsState>;
  subscribe(roomType: SpecializedRoomId, roomId: string, listener: (state: RoomToolsState) => void): RoomToolsRealtimeSubscription;
  execute(roomType: SpecializedRoomId, roomId: string, role: RoomActorRole, command: RoomToolsCommand, accountId?: string): Promise<RoomToolsState>;
  publicProjection(roomType: SpecializedRoomId, roomId: string): Promise<Partial<RoomToolsState>>;
  projectionForRole(roomType: SpecializedRoomId, roomId: string, role: RoomActorRole, accountId: string): Promise<RoomToolsState>;
}

const CONTROL_ROLES = new Set<RoomActorRole>(["host", "regisseur", "teacher"]);

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

function key(roomType: SpecializedRoomId, roomId: string) {
  return `${roomType}:${roomId}`;
}

function isPublicCommand(command: RoomToolsCommand) {
  return command.type === "scene.evaluation.cast"
    || command.type === "gift.send"
    || command.type === "gift.raffle"
    || command.type === "cage.vote.cast"
    || command.type === "wave.vote.cast"
    || command.type === "wave.submission.add"
    || command.type === "loge.question.add"
    || command.type === "classe.hand.lower-own"
    || command.type === "classe.speaker.end-own"
    || command.type === "classe.question.add"
    || command.type === "classe.question.support"
    || command.type === "loge.request.join"
    || command.type === "loge.request.cancel"
    || command.type === "loge.moment.respond"
    || command.type === "gift.redemption.use";
}

export function commandAllowed(roomType: SpecializedRoomId, role: RoomActorRole, command: RoomToolsCommand) {
  if (command.type === "cage.demo.presentation" || command.type === "cage.demo.guest.move") return roomType === "cage" && (role === "host" || role === "regisseur");
  if (command.type === "cage.vote.cast") return roomType === "cage" && (role === "viewer" || role === "competitor" || role === "contributor");
  if (command.type === "cage.competition.command") {
    if (roomType !== "cage") return false;
    if (command.action === "vote.cast" || command.action === "openmic.feedback.cast") return role === "viewer" || role === "competitor" || role === "contributor";
    if (command.action === "regie.ready") return role !== "visitor";
    return role === "host" || role === "regisseur";
  }
  if (command.type === "wave.submissions.setOpen") return roomType === "wave" && (role === "host" || role === "regisseur");
  if (roomType === "wave" && command.type.startsWith("gift.")) return false;
  if (roomType === "wave" && command.type === "wave.vote.cast") return role === "contributor" || role === "viewer";
  if (command.type === "scene.fundraiser.demo.contribute") return roomType === "scene" && role !== "visitor";
  if (command.type === "classe.demo.seat.purchase") return roomType === "classe" && role === "viewer";
  if (command.type === "classe.hand.raise") return role === "premium_participant";
  if (command.type === "classe.hand.lower-own" || command.type === "classe.speaker.end-own") return role === "premium_participant";
  if (command.type === "classe.question.add" || command.type === "classe.question.support") return role === "premium_participant";
  if (command.type === "loge.queue.setOpen") return roomType === "loge" && CONTROL_ROLES.has(role);
  if (command.type === "loge.request.join" || command.type === "loge.request.cancel") return roomType === "loge" && role !== "visitor";
  if (command.type === "loge.moment.respond") return role !== "visitor";
  if (isPublicCommand(command)) return role !== "visitor";
  if (CONTROL_ROLES.has(role)) return true;
  if (roomType === "scene" && role === "artist" && ["scene.prompter.patch", "scene.prompter.select", "scene.prompter.marker"].includes(command.type)) return true;
  return false;
}

function commandBelongsToAccount(command: RoomToolsCommand, accountId?: string) {
  if (!accountId) return false;
  switch (command.type) {
    case "cage.competition.command": return command.action === "regie.ready" ? command.payload?.participantId === accountId : command.action === "vote.cast" || command.action === "openmic.feedback.cast" ? !command.payload?.accountId || command.payload.accountId === accountId : true;
    case "scene.fundraiser.demo.contribute": return Boolean(accountId);
    case "classe.demo.seat.purchase": return command.person.id === accountId;
    case "classe.hand.raise": return command.personId === accountId;
    case "classe.hand.lower-own":
    case "classe.speaker.end-own":
    case "wave.vote.cast":
    case "cage.vote.cast":
    case "scene.evaluation.cast":
    case "loge.request.cancel":
    case "loge.moment.respond":
    case "gift.redemption.use": return command.accountId === accountId;
    case "classe.question.support": return command.accountId === accountId;
    case "classe.question.add": return command.question.author.id === accountId;
    case "wave.submission.add": return command.submission.contributor.id === accountId;
    case "loge.request.join": return command.person.id === accountId;
    case "loge.question.add": return command.question.author.id === accountId;
    case "gift.send":
    case "gift.raffle": return command.accountId === accountId;
    default: return true;
  }
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= items.length) return;
  [items[index], items[destination]] = [items[destination], items[index]];
}

function transactionId(idempotencyKey: string) {
  let hash = 2166136261;
  for (const character of idempotencyKey) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `gift-${Math.abs(hash).toString(36)}`;
}

function deterministicRecipient(ids: string[], idempotencyKey: string) {
  let score = 0;
  for (const character of idempotencyKey) score = (score * 31 + character.charCodeAt(0)) >>> 0;
  return ids[score % ids.length];
}

function stripPrivatePersonFields<T extends { access?: unknown }>(person: T): Omit<T, "access"> {
  const { access: _access, ...publicPerson } = person;
  return publicPerson;
}

function stripPrivatePeople(state: RoomToolsState, accountId?: string) {
  if (state.scene) state.scene.people = state.scene.people.map(stripPrivatePersonFields);
  if (state.classe) {
    state.classe.people = state.classe.people.map(stripPrivatePersonFields);
    state.classe.seats = state.classe.seats.map((seat) => ({
      ...seat,
      person: seat.person ? stripPrivatePersonFields(seat.person) : undefined,
      canSpeak: seat.person?.id === accountId ? seat.canSpeak : false,
      canShareScreen: seat.person?.id === accountId ? seat.canShareScreen : false,
    }));
    state.classe.questions = state.classe.questions?.map((question) => ({
      ...question,
      author: stripPrivatePersonFields(question.author),
      supporterIds: accountId && question.supporterIds.includes(accountId) ? [accountId] : [],
    }));
    if (state.classe.publicCallStudentId !== accountId
      && state.classe.publicCallStudentId !== state.classe.activeSpeakerId) {
      state.classe.publicCallStudentId = null;
    }
    if (state.classe.privateTalkStudentId !== accountId) state.classe.privateTalkStudentId = null;
  }
  if (state.wave) state.wave.submissions = state.wave.submissions.map((submission) => ({ ...submission, contributor: stripPrivatePersonFields(submission.contributor) }));
  if (state.cage) state.cage.matches = state.cage.matches.map((match) => ({ ...match, competitorA: stripPrivatePersonFields(match.competitorA), competitorB: stripPrivatePersonFields(match.competitorB) }));
  if (state.loge) {
    state.loge.questions = state.loge.questions.map((question) => ({ ...question, author: stripPrivatePersonFields(question.author) }));
    state.loge.moments = state.loge.moments.map((moment) => ({ ...moment, beneficiary: stripPrivatePersonFields(moment.beneficiary) }));
  }
}

function hidePrompter(state: RoomToolsState) {
  if (!state.scene) return;
  state.scene.prompter = {
    texts: [],
    activeTextId: "",
    playing: false,
    line: 0,
    speed: 1,
    fontSize: 0,
    lineHeight: 1,
    alignment: "center",
    countdown: 0,
    controller: "regie",
    mirrored: false,
    readingMode: "compact",
  };
}

function ensureSceneToolState(state: RoomToolsState) {
  if (!state.scene) return null;
  state.scene.prompter.readingMode ??= "expanded";
  state.scene.program.forEach((entry) => { entry.evaluationEnabled ??= true; });
  state.scene.evaluation ??= {
    defaultEnabled: true,
    defaultMinimumResponses: 5,
    defaultResultsVisibility: "private",
    byPerformance: {},
    viewerCompletedPerformanceIds: [],
  };
  state.scene.fundraiser ??= {
    id: `fundraiser-${state.roomId}`,
    title: "",
    beneficiary: "",
    targetAmount: 0,
    currency: "EUR",
    description: "",
    imageUrl: "",
    endAt: null,
    status: "draft",
    visibleInLive: false,
    highlighted: false,
    collectedAmount: 0,
    contributionCount: 0,
    paymentAvailable: false,
  };
  return state.scene;
}

function hidePrivateSceneEvaluation(state: RoomToolsState, accountId?: string) {
  const scene = ensureSceneToolState(state);
  if (!scene) return;
  const completed: string[] = [];
  Object.values(scene.evaluation.byPerformance).forEach((evaluation) => {
    const ownResponse = accountId ? evaluation.responses[accountId] : undefined;
    if (ownResponse) completed.push(evaluation.performanceId);
    evaluation.responses = ownResponse && accountId ? { [accountId]: ownResponse } : {};
    const resultsPublic = evaluation.resultsVisibility === "public" && evaluation.responseCount >= evaluation.minimumResponses;
    if (!resultsPublic) {
      delete evaluation.weightedAverage;
      evaluation.responseCount = 0;
      evaluation.ratingTotal = 0;
      evaluation.ratingCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      evaluation.reactionCounts = { energy: 0, presence: 0, originality: 0, mastery: 0 };
    }
  });
  scene.evaluation.viewerCompletedPerformanceIds = completed;
}

function hideUnavailableSceneFundraiser(state: RoomToolsState) {
  const scene = ensureSceneToolState(state);
  if (!scene || (scene.fundraiser.visibleInLive && scene.fundraiser.status !== "draft")) return;
  scene.fundraiser = {
    ...scene.fundraiser,
    title: "",
    beneficiary: "",
    targetAmount: 0,
    description: "",
    imageUrl: "",
    endAt: null,
    status: "draft",
    visibleInLive: false,
    highlighted: false,
    collectedAmount: 0,
    contributionCount: 0,
  };
}

function closeExpiredViewerVotes(state: RoomToolsState) {
  const now = Date.now();
  state.wave?.submissions.forEach((submission) => {
    if (submission.vote?.open && submission.vote.endsAt && new Date(submission.vote.endsAt).getTime() <= now) {
      submission.vote.open = false;
    }
  });
  if (state.cage?.votingOpen && state.cage.votingEndsAt && new Date(state.cage.votingEndsAt).getTime() <= now) {
    state.cage.votingOpen = false;
  }
}

const WAVE_AUDIO_MIME_TYPES = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/aac", "audio/flac", "audio/mp4", "audio/x-m4a"]);
const WAVE_REVIEW_FEEDBACK: Record<WaveReviewReason, string> = {
  format: "Le format du fichier n’est pas conforme.",
  timing: "Le BPM ou le calage doit être repris sur la boucle de base.",
  key: "La tonalité n’est pas compatible avec cette Wave.",
  quality: "Le son doit être nettoyé avant une nouvelle écoute.",
  fit: "La proposition ne correspond pas à la direction de cette Wave.",
  rights: "Les droits ou les informations du fichier doivent être précisés.",
  duplicate: "Une boucle très proche est déjà dans le circuit.",
  other: "Le host a laissé un retour privé.",
  public: "Pas retenue par le public cette fois.",
};

function waveReviewFeedback(reason: WaveReviewReason, feedback?: string) {
  const custom = feedback?.trim() ?? "";
  if (custom.length > 180) throw new Error("wave_review_feedback_too_long");
  if (reason === "other" && !custom) throw new Error("wave_review_feedback_required");
  return custom || WAVE_REVIEW_FEEDBACK[reason];
}

function waveSubmissionCompatible(wave: WaveState, submission: WaveSubmission) {
  return submission.bars === wave.baseLoop.bars && Math.abs(submission.bpm - wave.baseLoop.bpm) <= 2;
}

function waveVoteResult(submission: WaveSubmission) {
  const votes = Object.values(submission.vote?.votes ?? {});
  const total = votes.length;
  const yes = votes.filter((vote) => vote === "yes").length;
  return { total, yes, yesPercent: total ? yes / total * 100 : 0 };
}

function projectedWaveVote(submission: WaveSubmission, accountId?: string) {
  if (!submission.vote) return undefined;
  const result = waveVoteResult(submission);
  const ownChoice = accountId ? submission.vote.votes[accountId] : undefined;
  return {
    ...submission.vote,
    votes: ownChoice && accountId ? { [accountId]: ownChoice } : {},
    totalVotes: result.total,
    yesCount: submission.vote.hidden ? undefined : result.yes,
    noCount: submission.vote.hidden ? undefined : result.total - result.yes,
  };
}

function integrateWaveSubmission(wave: WaveState, submission: WaveSubmission) {
  if (!wave.layers.some((layer) => layer.submissionId === submission.id)) {
    integrateAcceptedWaveSubmission(wave, submission);
    wave.history.unshift(`${submission.title} v${submission.version} validée par le public`);
  }
}

function assertWavePublicApproval(wave: WaveState, submission: WaveSubmission) {
  if (!submission.vote || submission.vote.submissionVersion !== submission.version) throw new Error("wave_vote_required");
  if (submission.vote.open) throw new Error("wave_vote_open");
  const result = waveVoteResult(submission);
  if (!result.total) throw new Error("wave_vote_required");
  if (result.yesPercent < submission.vote.thresholdPercent) throw new Error("wave_vote_threshold_not_met");
  if (!waveSubmissionCompatible(wave, submission)) throw new Error("wave_file_incompatible");
}

function finalizeWaveVote(wave: WaveState, submission: WaveSubmission, actorId?: string) {
  const alreadyFinalized = Boolean(submission.vote?.finalizedAt);
  const replacesLayerId = submission.vote?.replacesLayerId;
  const outcome = finalizeWaveVoteDomain(wave, submission, { actorId });
  if (alreadyFinalized) return;
  if (outcome === null) {
    wave.history.unshift(`${submission.title} · vote clos sans bulletin`);
    return;
  }
  if (outcome === "accepted") {
    if (replacesLayerId && replacesLayerId !== "base") {
      wave.layers = wave.layers.filter((layer) => layer.id !== replacesLayerId || layer.submissionId === submission.id);
    }
    submission.decisionSource = "public";
    submission.reviewReason = undefined;
    submission.reviewFeedback = "Validée par le public — la boucle rejoint la production.";
    wave.history.unshift(`${submission.title} v${submission.version} validée par le public`);
    return;
  }
  submission.decisionSource = "public";
  submission.reviewReason = "public";
  submission.reviewFeedback = WAVE_REVIEW_FEEDBACK.public;
  wave.history.unshift(`${submission.title} v${submission.version} non validée par le public`);
}

type NormalizedLogePreviewTransport = {
  transportStatus: "idle" | "playing" | "paused" | "finished";
  sessionId: string | null;
  startedAt: string | null;
  positionSeconds: number;
  volume: number;
};

const LOGE_PREVIEW_SESSION_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;

function logePreviewDuration(preview: LogeState["preview"]) {
  return typeof preview.durationSeconds === "number" && Number.isFinite(preview.durationSeconds)
    ? Math.max(0, preview.durationSeconds)
    : null;
}

function clampLogePreviewPosition(preview: LogeState["preview"], value: unknown) {
  const position = typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
  const duration = logePreviewDuration(preview);
  return Math.round((duration === null ? position : Math.min(duration, position)) * 1_000) / 1_000;
}

function clampLogePreviewVolume(value: unknown) {
  const volume = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.round(Math.max(0, Math.min(1, volume)) * 1_000) / 1_000;
}

/** Normalizes pre-transport JSON without mutating the persisted Room state. */
export function normalizeLogePreviewTransport(preview: LogeState["preview"]): NormalizedLogePreviewTransport {
  const status = preview.transportStatus === "playing"
    || preview.transportStatus === "paused"
    || preview.transportStatus === "finished"
    || preview.transportStatus === "idle"
    ? preview.transportStatus
    : preview.playing ? "playing" : "idle";
  const rawSessionId = typeof preview.sessionId === "string" ? preview.sessionId.trim() : "";
  const sessionId = rawSessionId || (status === "playing" ? "legacy" : null);
  const startedAtMs = typeof preview.startedAt === "string" ? Date.parse(preview.startedAt) : Number.NaN;
  return {
    transportStatus: status,
    sessionId,
    startedAt: Number.isFinite(startedAtMs) ? new Date(startedAtMs).toISOString() : null,
    positionSeconds: clampLogePreviewPosition(preview, preview.positionSeconds),
    volume: clampLogePreviewVolume(preview.volume),
  };
}

export function logePreviewPositionAt(preview: LogeState["preview"], now = Date.now()) {
  const transport = normalizeLogePreviewTransport(preview);
  if (transport.transportStatus !== "playing" || !transport.startedAt) return transport.positionSeconds;
  const elapsedSeconds = Math.max(0, now - Date.parse(transport.startedAt)) / 1_000;
  return clampLogePreviewPosition(preview, transport.positionSeconds + elapsedSeconds);
}

export function isLogePreviewAvailable(preview: LogeState["preview"], _now = Date.now()) {
  const transport = normalizeLogePreviewTransport(preview);
  return Boolean(
    preview.mediaName.trim()
    && transport.sessionId
    && (transport.transportStatus === "playing" || transport.transportStatus === "paused"),
  );
}

const LOGE_PREVIEW_MAX_DURATION_SECONDS = 24 * 60 * 60;
const LOGE_PREVIEW_MAX_CHANNELS = 8;
const LOGE_PREVIEW_MIN_SAMPLE_RATE = 8_000;
const LOGE_PREVIEW_MAX_SAMPLE_RATE = 384_000;
const LOGE_PREVIEW_MAX_PEAK_VALUES = 1_024;
const PCM_INT16_MIN = -32_768;
const PCM_INT16_MAX = 32_767;
const LOGE_PREVIEW_MEDIA_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$/i;

function sanitizeNullableNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = integer ? Math.round(value) : Math.round(value * 1_000) / 1_000;
  return Math.max(minimum, Math.min(maximum, normalized));
}

/**
 * Keeps waveform state compact and JSON-safe before it reaches either the
 * demo repository or the authoritative Supabase JSONB state.
 */
export function sanitizeLogePreviewWaveformPeaks(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const sanitized: number[] = [];
  const limit = Math.min(value.length - (value.length % 2), LOGE_PREVIEW_MAX_PEAK_VALUES);
  for (let index = 0; index < limit; index += 2) {
    const rawMinimum = value[index];
    const rawMaximum = value[index + 1];
    if (typeof rawMinimum !== "number" || !Number.isFinite(rawMinimum)
      || typeof rawMaximum !== "number" || !Number.isFinite(rawMaximum)) continue;
    const first = Math.max(PCM_INT16_MIN, Math.min(PCM_INT16_MAX, Math.round(rawMinimum)));
    const second = Math.max(PCM_INT16_MIN, Math.min(PCM_INT16_MAX, Math.round(rawMaximum)));
    sanitized.push(Math.min(first, second), Math.max(first, second));
  }
  return sanitized;
}

function sanitizeLogePreviewPatch(
  current: LogeState["preview"],
  patch: Partial<LogeState["preview"]>,
): Partial<LogeState["preview"]> {
  const sanitized = { ...patch };
  if (Object.prototype.hasOwnProperty.call(patch, "mediaKind")) {
    sanitized.mediaKind = patch.mediaKind === "audio" || patch.mediaKind === "video" || patch.mediaKind === "image"
      ? patch.mediaKind
      : undefined;
  }
  // Transport state is authoritative and can only move through the dedicated,
  // media/session guarded commands below. `playing` remains a persisted legacy
  // mirror, not a writable patch field.
  delete sanitized.playing;
  delete sanitized.transportStatus;
  delete sanitized.sessionId;
  delete sanitized.startedAt;
  delete sanitized.positionSeconds;
  delete sanitized.volume;
  if (Object.prototype.hasOwnProperty.call(patch, "mediaPath")) {
    sanitized.mediaPath = typeof patch.mediaPath === "string" && LOGE_PREVIEW_MEDIA_PATH_PATTERN.test(patch.mediaPath)
      ? patch.mediaPath
      : null;
  }
  const nextMediaName = typeof patch.mediaName === "string" ? patch.mediaName : current.mediaName;
  const nextMediaPath = Object.prototype.hasOwnProperty.call(sanitized, "mediaPath") ? sanitized.mediaPath : current.mediaPath;
  const mediaChanged = nextMediaName !== current.mediaName || nextMediaPath !== current.mediaPath;

  if (mediaChanged) {
    sanitized.playing = false;
    sanitized.transportStatus = "idle";
    sanitized.sessionId = null;
    sanitized.startedAt = null;
    sanitized.positionSeconds = 0;
  }

  if (mediaChanged && !Object.prototype.hasOwnProperty.call(patch, "mediaKind")) {
    sanitized.mediaKind = undefined;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "durationSeconds")) {
    sanitized.durationSeconds = sanitizeNullableNumber(patch.durationSeconds, 0, LOGE_PREVIEW_MAX_DURATION_SECONDS);
  } else if (mediaChanged) sanitized.durationSeconds = null;

  if (Object.prototype.hasOwnProperty.call(patch, "channels")) {
    sanitized.channels = sanitizeNullableNumber(patch.channels, 1, LOGE_PREVIEW_MAX_CHANNELS, true);
  } else if (mediaChanged) sanitized.channels = null;

  if (Object.prototype.hasOwnProperty.call(patch, "sampleRate")) {
    sanitized.sampleRate = sanitizeNullableNumber(patch.sampleRate, LOGE_PREVIEW_MIN_SAMPLE_RATE, LOGE_PREVIEW_MAX_SAMPLE_RATE, true);
  } else if (mediaChanged) sanitized.sampleRate = null;

  if (Object.prototype.hasOwnProperty.call(patch, "waveformPeaks")) {
    sanitized.waveformPeaks = sanitizeLogePreviewWaveformPeaks(patch.waveformPeaks);
  } else if (mediaChanged) sanitized.waveformPeaks = [];

  if (patch.mediaName === "") {
    sanitized.mediaKind = undefined;
    sanitized.mediaPath = null;
    sanitized.playing = false;
    sanitized.transportStatus = "idle";
    sanitized.sessionId = null;
    sanitized.startedAt = null;
    sanitized.positionSeconds = 0;
    sanitized.durationSeconds = null;
    sanitized.channels = null;
    sanitized.sampleRate = null;
    sanitized.waveformPeaks = [];
  }
  return sanitized;
}

function clearLogePreviewMedia(preview: LogeState["preview"]): LogeState["preview"] {
  return {
    ...preview,
    mediaName: "",
    mediaKind: undefined,
    mediaPath: null,
    playing: false,
    transportStatus: "idle",
    sessionId: null,
    startedAt: null,
    positionSeconds: 0,
    durationSeconds: null,
    channels: null,
    sampleRate: null,
    waveformPeaks: [],
  };
}

function hideUnavailableLogePreview(state: RoomToolsState) {
  const preview = state.loge?.preview;
  if (!preview) return;
  if (isLogePreviewAvailable(preview)) return;
  state.loge!.preview = clearLogePreviewMedia(preview);
}

function hideIneligibleLogeState(state: RoomToolsState) {
  if (!state.loge) return;
  state.loge.preview = {
    title: "Accès privé",
    description: "",
    mediaName: "",
    mediaKind: undefined,
    mediaPath: null,
    playing: false,
    transportStatus: "idle",
    sessionId: null,
    startedAt: null,
    positionSeconds: 0,
    volume: 1,
    replayIncluded: false,
    liveOnly: true,
    expiresAt: null,
    durationSeconds: null,
    channels: null,
    sampleRate: null,
    waveformPeaks: [],
  };
  state.loge.questionsOpen = false;
  state.loge.questions = [];
  state.loge.moments = [];
}

function hideUnrevealedCageResults(state: RoomToolsState, accountId?: string) {
  if (!state.cage?.resultsHidden) return;
  state.cage.votes = accountId && state.cage.votes[accountId] ? { [accountId]: state.cage.votes[accountId] } : {};
  state.cage.resultHistory = state.cage.resultHistory.filter((entry) => entry.matchId !== state.cage?.currentMatchId);
  state.cage.matches = state.cage.matches.map((match) => match.id === state.cage?.currentMatchId
    ? { ...match, scoreA: 0, scoreB: 0, winnerId: undefined }
    : match);
}

function createRedemption(state: RoomToolsState, transaction: RoomGiftTransaction): RoomGiftRedemption {
  const experienceGift = transaction.giftCode === "vip-pass" || transaction.giftCode === "private-access";
  const kind: RoomGiftRedemption["kind"] = state.roomType === "classe" && transaction.giftCode === "vip-pass"
    ? "future-class-seat"
    : state.roomType === "loge" && experienceGift
      ? "vip-moment"
      : "standard";
  return {
    id: `redemption-${transaction.id}`,
    transactionId: transaction.id,
    roomId: state.roomId,
    ownerId: transaction.recipientId,
    kind,
    status: kind === "standard" ? "redeemed" : "pending",
  };
}

function eligibleGiftRecipients(state: RoomToolsState) {
  if (state.scene) return new Set(state.scene.people.map((person) => person.id));
  if (state.classe) return new Set(state.classe.people.map((person) => person.id));
  if (state.wave) return new Set(state.wave.submissions.map((submission) => submission.contributor.id));
  if (state.cage) return new Set(state.cage.matches.flatMap((match) => [match.competitorA.id, match.competitorB.id]));
  if (state.loge) return new Set([...state.loge.questions.map((question) => question.author.id), ...state.loge.moments.map((moment) => moment.beneficiary.id)]);
  return new Set<string>();
}

function applyGift(state: RoomToolsState, command: Extract<RoomToolsCommand, { type: "gift.send" | "gift.raffle" }>) {
  const eligible = eligibleGiftRecipients(state);
  const existing = state.gifts.transactions.find((item) => item.idempotencyKey === command.idempotencyKey);
  if (existing) {
    const expectedMode = command.type === "gift.send" ? "direct" : "raffle";
    const expectedEligiblePool = command.type === "gift.raffle" ? [...new Set(command.eligibleRecipientIds.filter((id) => eligible.has(id)))].sort() : undefined;
    const sameEligiblePool = command.type !== "gift.raffle" || JSON.stringify([...(existing.eligibleRecipientIds ?? [])].sort()) === JSON.stringify(expectedEligiblePool);
    if (existing.giftCode !== command.giftCode
      || existing.senderId !== command.accountId
      || existing.origin !== command.origin
      || existing.mode !== expectedMode
      || (command.type === "gift.send" && existing.recipientId !== command.recipientId)
      || !sameEligiblePool) {
      throw new Error("room_gift_idempotency_conflict");
    }
    return;
  }
  const stock = state.gifts.stock.find((item) => item.giftCode === command.giftCode
    && item.origin === command.origin
    && (item.origin === "SYSTEM" ? item.ownerId === null : item.ownerId === command.accountId));
  if (!stock || stock.quantity - stock.reserved < 1 || (stock.expiresAt && new Date(stock.expiresAt).getTime() <= Date.now())) throw new Error("room_gift_inventory_empty");
  const recipientId = command.type === "gift.send"
    ? command.recipientId
    : command.eligibleRecipientIds.filter((id) => eligible.has(id)).length
      ? deterministicRecipient(command.eligibleRecipientIds.filter((id) => eligible.has(id)), command.idempotencyKey)
      : null;
  if (!recipientId) throw new Error("room_gift_raffle_empty");
  if (!eligible.has(recipientId)) throw new Error("room_gift_recipient_ineligible");
  stock.quantity -= 1;
  const transaction: RoomGiftTransaction = {
    id: transactionId(command.idempotencyKey),
    idempotencyKey: command.idempotencyKey,
    giftCode: command.giftCode,
    senderId: command.accountId,
    recipientId,
    roomId: state.roomId,
    createdAt: new Date().toISOString(),
    mode: command.type === "gift.send" ? "direct" : "raffle",
    origin: command.origin,
    status: "COMPLETED",
    eligibleRecipientIds: command.type === "gift.raffle" ? [...new Set(command.eligibleRecipientIds.filter((id) => eligible.has(id)))] : undefined,
  };
  state.gifts.transactions.unshift(transaction);
  const redemption = createRedemption(state, transaction);
  state.gifts.redemptions.unshift(redemption);
  if (state.loge && redemption.kind === "vip-moment") {
    const beneficiary = state.loge.questions.map((question) => question.author).find((person) => person.id === recipientId)
      ?? state.loge.moments.map((moment) => moment.beneficiary).find((person) => person.id === recipientId);
    if (beneficiary) {
      state.loge.moments.unshift({
        id: `moment-${transaction.id}`,
        kind: "gift-redemption",
        title: command.giftCode === "vip-pass" ? "Pass VIP à planifier" : "Accès privé à organiser",
        beneficiary,
        status: "pending",
      });
    }
  }
}

function currentMatch(state: RoomToolsState): CageMatch | undefined {
  return state.cage?.matches.find((match) => match.id === state.cage?.currentMatchId);
}

function assertLogePreviewMedia(
  preview: LogeState["preview"],
  expectedMedia: { mediaName: string; mediaPath: string | null },
) {
  if (preview.mediaName !== expectedMedia.mediaName || preview.mediaPath !== expectedMedia.mediaPath) {
    throw new Error("loge_preview_media_changed");
  }
}

function assertLogePreviewSession(preview: LogeState["preview"], sessionId: string) {
  if (!LOGE_PREVIEW_SESSION_ID_PATTERN.test(sessionId)) throw new Error("loge_preview_session_invalid");
  const transport = normalizeLogePreviewTransport(preview);
  if (transport.sessionId !== sessionId) throw new Error("loge_preview_session_changed");
  return transport;
}

function setLogePreviewTransport(
  preview: LogeState["preview"],
  transport: Partial<NormalizedLogePreviewTransport> & Pick<NormalizedLogePreviewTransport, "transportStatus">,
) {
  const current = normalizeLogePreviewTransport(preview);
  const next = { ...current, ...transport };
  preview.transportStatus = next.transportStatus;
  preview.sessionId = next.sessionId;
  preview.startedAt = next.startedAt;
  preview.positionSeconds = clampLogePreviewPosition(preview, next.positionSeconds);
  preview.volume = clampLogePreviewVolume(next.volume);
  preview.playing = next.transportStatus === "playing";
}

function classSeatRestingStatus(
  classe: NonNullable<RoomToolsState["classe"]>,
  seat: NonNullable<RoomToolsState["classe"]>["seats"][number],
) {
  if (!seat.person) return "free" as const;
  if (["disconnected", "absent", "suspended"].includes(seat.status)) return seat.status;
  if (classe.privateTalkStudentId === seat.person.id) return "private" as const;
  if (seat.handRaised) return "hand-raised" as const;
  if (seat.person.microphone === "muted") return "muted" as const;
  return "listening" as const;
}

function lowerClassHands(
  classe: NonNullable<RoomToolsState["classe"]>,
  personId?: string,
) {
  classe.raisedHands = personId
    ? classe.raisedHands.filter((hand) => hand.personId !== personId)
    : [];
  classe.seats.forEach((seat) => {
    if (personId && seat.person?.id !== personId) return;
    seat.handRaised = false;
    if (!seat.canSpeak && classe.privateTalkStudentId !== seat.person?.id) {
      seat.status = classSeatRestingStatus(classe, seat);
    }
  });
}

function openSceneEvaluation(scene: SceneState, performanceId: string) {
  const entry = scene.program.find((item) => item.id === performanceId);
  if (!entry?.evaluationEnabled) return;
  scene.evaluation.byPerformance[performanceId] ??= {
    performanceId,
    open: true,
    minimumResponses: scene.evaluation.defaultMinimumResponses,
    resultsVisibility: scene.evaluation.defaultResultsVisibility,
    responseCount: 0,
    ratingTotal: 0,
    ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    reactionCounts: { energy: 0, presence: 0, originality: 0, mastery: 0 },
    responses: {},
  };
  scene.evaluation.byPerformance[performanceId].open = true;
}

export function reduceCommand(state: RoomToolsState, command: RoomToolsCommand, actorId?: string) {
  requireRoomVoter(state,command,actorId ?? "");
  ensureSceneToolState(state);
  if (state.wave) normalizeWaveState(state.wave);
  if (command.type === "cage.competition.command") {
    applyCageCompetitionCommand(state, command, actorId ?? "");
    return;
  }
  if (state.cage?.runtime && command.type.startsWith("cage.")) {
    if (command.type === "cage.vote.cast") {
      const runtime = state.cage.runtime;
      const current = runtime.matches.find((match) => match.id === runtime.activeMatchId);
      applyCageCompetitionCommand(state, { type: "cage.competition.command", action: "vote.cast", payload: { accountId: command.accountId, choice: command.choice }, idempotencyKey: `ballot-${current?.vote?.roundId}-${command.accountId}`, expectedRevision: state.revision, expectedMatchId: current?.id }, actorId ?? command.accountId);
      return;
    }
    throw new Error("cage_use_competition_command");
  }
  switch (command.type) {
    case "scene.prompter.patch":
      if (!state.scene) break;
      state.scene.prompter = { ...state.scene.prompter, ...command.patch };
      break;
    case "scene.prompter.add":
      if (!state.scene) break;
      if (state.scene.prompter.texts.some((text) => text.id === command.text.id)) throw new Error("prompter_text_duplicate");
      state.scene.prompter.texts.push(command.text);
      state.scene.prompter.activeTextId = command.text.id;
      state.scene.prompter.line = 0;
      state.scene.prompter.playing = false;
      break;
    case "scene.prompter.update": {
      const text = state.scene?.prompter.texts.find((item) => item.id === command.textId);
      if (!text) throw new Error("prompter_text_not_found");
      Object.assign(text, command.patch);
      break;
    }
    case "scene.prompter.select":
      if (!state.scene?.prompter.texts.some((text) => text.id === command.textId)) throw new Error("prompter_text_not_found");
      state.scene.prompter.activeTextId = command.textId;
      state.scene.prompter.line = 0;
      state.scene.prompter.playing = false;
      break;
    case "scene.prompter.marker": {
      const text = state.scene?.prompter.texts.find((item) => item.id === state.scene?.prompter.activeTextId);
      const marker = text?.markers.find((item) => item.id === command.markerId);
      if (!marker || !state.scene) throw new Error("prompter_marker_not_found");
      state.scene.prompter.line = marker.line;
      break;
    }
    case "scene.program.status": {
      const entry = state.scene?.program.find((item) => item.id === command.entryId);
      if (!entry) throw new Error("scene_program_entry_not_found");
      if (command.status === "live") {
        if (entry.participantStatus === "absent") throw new Error("scene_program_participant_absent");
        state.scene!.program.forEach((item) => {
          if (item.status !== "live") return;
          item.status = "done";
          item.actualEndedAt = new Date().toISOString();
          openSceneEvaluation(state.scene!, item.id);
        });
        entry.actualStartedAt = new Date().toISOString();
        entry.actualEndedAt = undefined;
      }
      entry.status = command.status;
      if (command.status === "done") {
        entry.actualEndedAt = new Date().toISOString();
        openSceneEvaluation(state.scene!, entry.id);
      }
      break;
    }
    case "scene.program.patch": {
      const entry = state.scene?.program.find((item) => item.id === command.entryId);
      if (!entry) throw new Error("scene_program_entry_not_found");
      Object.assign(entry, command.patch);
      break;
    }
    case "scene.program.add":
      if (!state.scene) break;
      if (state.scene.program.some((entry) => entry.id === command.entry.id)) throw new Error("scene_program_entry_duplicate");
      state.scene.program.push(command.entry);
      break;
    case "scene.program.remove":
      if (!state.scene) break;
      if (state.scene.program.find((entry) => entry.id === command.entryId)?.status === "live") throw new Error("scene_program_live_remove_forbidden");
      state.scene.program = state.scene.program.filter((entry) => entry.id !== command.entryId);
      break;
    case "scene.program.move": {
      if (!state.scene) break;
      move(state.scene.program, state.scene.program.findIndex((item) => item.id === command.entryId), command.direction);
      break;
    }
    case "scene.program.reorder": {
      if (!state.scene) break;
      const fromIndex = state.scene.program.findIndex((entry) => entry.id === command.entryId);
      const toIndex = Math.max(0, Math.min(state.scene.program.length - 1, command.toIndex));
      if (fromIndex < 0) throw new Error("scene_program_entry_not_found");
      const [entry] = state.scene.program.splice(fromIndex, 1);
      state.scene.program.splice(toIndex, 0, entry);
      break;
    }
    case "scene.evaluation.configure": {
      if (!state.scene) break;
      const performance = state.scene.program.find((entry) => entry.id === command.performanceId);
      if (!performance) throw new Error("scene_evaluation_performance_not_found");
      performance.evaluationEnabled = command.enabled;
      const existing = state.scene.evaluation.byPerformance[performance.id];
      if (existing) {
        if (command.minimumResponses !== undefined) existing.minimumResponses = Math.max(1, Math.min(100, Math.round(command.minimumResponses)));
        if (command.resultsVisibility) existing.resultsVisibility = command.resultsVisibility;
        existing.open = command.enabled && performance.status === "done";
      } else if (command.enabled) {
        state.scene.evaluation.byPerformance[performance.id] = {
          performanceId: performance.id,
          open: performance.status === "done",
          minimumResponses: Math.max(1, Math.min(100, Math.round(command.minimumResponses ?? state.scene.evaluation.defaultMinimumResponses))),
          resultsVisibility: command.resultsVisibility ?? state.scene.evaluation.defaultResultsVisibility,
          responseCount: 0,
          ratingTotal: 0,
          ratingCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
          reactionCounts: { energy: 0, presence: 0, originality: 0, mastery: 0 },
          responses: {},
        };
      }
      break;
    }
    case "scene.evaluation.cast": {
      if (!state.scene) break;
      const performance = state.scene.program.find((entry) => entry.id === command.performanceId);
      const evaluation = state.scene.evaluation.byPerformance[command.performanceId];
      if (!performance || performance.status !== "done" || !performance.evaluationEnabled || !evaluation?.open) throw new Error("scene_evaluation_unavailable");
      if (evaluation.responses[command.accountId]) throw new Error("scene_evaluation_already_submitted");
      if (![1, 2, 3, 4, 5].includes(command.rating)) throw new Error("scene_evaluation_rating_invalid");
      const reactions = [...new Set(command.reactions)].filter((reaction) => ["energy", "presence", "originality", "mastery"].includes(reaction));
      evaluation.responses[command.accountId] = { rating: command.rating, reactions, submittedAt: new Date().toISOString() };
      evaluation.responseCount += 1;
      evaluation.ratingTotal += command.rating;
      evaluation.ratingCounts[command.rating] += 1;
      reactions.forEach((reaction) => { evaluation.reactionCounts[reaction] += 1; });
      break;
    }
    case "scene.fundraiser.demo.contribute": {
      const campaign=state.scene?.fundraiser;
      if(!campaign||campaign.id!==command.campaignId||!campaign.visibleInLive||campaign.status!=="live"||(campaign.endAt&&Date.parse(campaign.endAt)<=Date.now())) throw new Error("scene_campaign_unavailable");
      if(!Number.isInteger(command.amountCents)||command.amountCents<100||command.amountCents>100000||!command.contributionId) throw new Error("scene_donation_invalid");
      campaign.demoContributionIds ??= [];
      if(campaign.demoContributionIds.includes(command.contributionId)) break;
      campaign.demoContributionIds.push(command.contributionId);
      campaign.collectedAmount=Math.round(campaign.collectedAmount*100+command.amountCents)/100;
      campaign.contributionCount++;
      break;
    }
    case "scene.fundraiser.patch": {
      if (!state.scene) break;
      const next = { ...state.scene.fundraiser, ...command.patch, demoContributionIds: state.scene.fundraiser.demoContributionIds };
      next.title = next.title.trim().slice(0, 100);
      next.beneficiary = next.beneficiary.trim().slice(0, 100);
      next.description = next.description.trim().slice(0, 500);
      next.imageUrl = next.imageUrl.trim().slice(0, 500);
      next.targetAmount = Math.max(0, Math.round(Number(next.targetAmount) || 0));
      if (next.status === "live" && (!next.title || !next.beneficiary || next.targetAmount <= 0)) throw new Error("scene_fundraiser_incomplete");
      if (next.status !== "live") next.highlighted = false;
      if (!next.visibleInLive) next.highlighted = false;
      state.scene.fundraiser = next;
      break;
    }
    case "classe.hands.open":
      if (state.classe) {
        state.classe.handsOpen = command.open;
        if (!command.open) lowerClassHands(state.classe);
      }
      break;
    case "classe.hand.raise": {
      if (!state.classe?.handsOpen) throw new Error("class_hands_closed");
      const seat = state.classe.seats.find((item) => item.person?.id === command.personId && item.status !== "suspended");
      if (!seat) throw new Error("class_participation_required");
      if (state.classe.raisedHands.some((hand) => hand.personId === command.personId)) return;
      state.classe.raisedHands.push({ personId: command.personId, raisedAt: new Date().toISOString() });
      seat.handRaised = true;
      if (!seat.canSpeak && state.classe.privateTalkStudentId !== command.personId) seat.status = "hand-raised";
      break;
    }
    case "classe.hand.lower-own": {
      if (!state.classe) break;
      state.classe.raisedHands = state.classe.raisedHands.filter((hand) => hand.personId !== command.accountId);
      const ownSeat = state.classe.seats.find((seat) => seat.person?.id === command.accountId);
      if (ownSeat) {
        ownSeat.handRaised = false;
        if (!ownSeat.canSpeak && state.classe.privateTalkStudentId !== command.accountId) {
          ownSeat.status = classSeatRestingStatus(state.classe, ownSeat);
        }
      }
      break;
    }
    case "classe.hands.lower": {
      if (!state.classe) break;
      lowerClassHands(state.classe, command.personId);
      break;
    }
    case "classe.speaker": {
      if (!state.classe) break;
      const target = command.personId
        ? state.classe.seats.find((seat) => seat.person?.id === command.personId)
        : null;
      if (command.personId && !target) throw new Error("class_participation_required");
      if (target && ["disconnected", "absent", "suspended"].includes(target.status)) throw new Error("class_student_unavailable");
      if (target && target.person?.microphone === "muted") throw new Error("class_microphone_unavailable");
      state.classe.publicCallStudentId = command.personId;
      state.classe.activeSpeakerId = command.personId;
      state.classe.privateTalkStudentId = null;
      state.classe.seats.forEach((seat) => {
        seat.canSpeak = seat.person?.id === command.personId;
        if (seat.person) seat.status = seat.canSpeak ? "speaking" : classSeatRestingStatus(state.classe!, seat);
      });
      if (command.personId) {
        state.classe.raisedHands = state.classe.raisedHands.filter((hand) => hand.personId !== command.personId);
        if (target) target.handRaised = false;
      }
      break;
    }
    case "classe.speaker.end-own": {
      if (!state.classe || state.classe.activeSpeakerId !== command.accountId) throw new Error("class_speaker_not_active");
      state.classe.publicCallStudentId = null;
      state.classe.activeSpeakerId = null;
      state.classe.seats.forEach((seat) => {
        if (seat.person?.id === command.accountId) {
          seat.canSpeak = false;
          seat.canShareScreen = false;
          seat.status = classSeatRestingStatus(state.classe!, seat);
        }
      });
      break;
    }
    case "classe.private": {
      if (!state.classe) break;
      const target = command.personId
        ? state.classe.seats.find((seat) => seat.person?.id === command.personId)
        : null;
      if (command.personId && !target) throw new Error("class_participation_required");
      if (target && ["disconnected", "absent", "suspended"].includes(target.status)) throw new Error("class_student_unavailable");
      if (target && target.person?.microphone === "muted") throw new Error("class_microphone_unavailable");
      state.classe.publicCallStudentId = null;
      state.classe.privateTalkStudentId = command.personId;
      state.classe.seats.forEach((seat) => {
        seat.status = seat.person?.id === command.personId
          ? "private"
          : seat.canSpeak ? "speaking" : classSeatRestingStatus(state.classe!, seat);
      });
      break;
    }
    case "classe.seat.price":
      if (!Number.isInteger(command.cents) || command.cents < 0 || command.cents > 100000) throw new Error("class_price_invalid");
      if (state.classe) state.classe.seatPriceCents = command.cents;
      break;
    case "classe.demo.seat.purchase": {
      const classe = state.classe;
      const seat = classe?.seats.find(item => item.number === command.seat);
      if (!classe || !seat || seat.person || classe.seatsLocked || classe.seats.some(item => item.person?.id === command.person.id)) throw new Error("class_seat_unavailable");
      if (command.cents !== (classe.seatPriceCents ?? 499)) throw new Error("class_price_changed");
      Object.assign(seat, { person: command.person, status: "listening", canSpeak: false, handRaised: false });
      classe.people.push(command.person);
      break;
    }
    case "classe.seat.patch": {
      const seat = state.classe?.seats.find((item) => item.number === command.seat);
      if (!seat) throw new Error("class_seat_not_found");
      const previousPersonId = seat.person?.id;
      Object.assign(seat, command.patch);
      if (state.classe && command.patch.person) {
        const personIndex = state.classe.people.findIndex((person) => person.id === command.patch.person?.id);
        if (personIndex >= 0) state.classe.people[personIndex] = command.patch.person;
        else state.classe.people.push(command.patch.person);
      }
      if (state.classe && previousPersonId && command.patch.person === undefined && Object.prototype.hasOwnProperty.call(command.patch, "person")) {
        state.classe.raisedHands = state.classe.raisedHands.filter((hand) => hand.personId !== previousPersonId);
        if (state.classe.activeSpeakerId === previousPersonId) state.classe.activeSpeakerId = null;
        if (state.classe.publicCallStudentId === previousPersonId) state.classe.publicCallStudentId = null;
        if (state.classe.privateTalkStudentId === previousPersonId) state.classe.privateTalkStudentId = null;
      }
      break;
    }
    case "classe.seats.lock":
      if (state.classe) state.classe.seatsLocked = command.locked;
      break;
    case "classe.questions.open":
      if (state.classe) state.classe.questionsOpen = command.open;
      break;
    case "classe.resource.add": {
      if (!state.classe) break;
      const resource = command.resource;
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
      const mediaPathPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|wav|mp3|aac|flac|m4a)$/iu;
      const mimeExtensions: Record<string, readonly string[]> = {
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "image/webp": ["webp"],
        "image/gif": ["gif"],
        "audio/wav": ["wav"],
        "audio/x-wav": ["wav"],
        "audio/mpeg": ["mp3"],
        "audio/aac": ["aac"],
        "audio/flac": ["flac"],
        "audio/mp4": ["m4a"],
        "audio/x-m4a": ["m4a"],
      };
      const allowedMimeType = (resource.kind === "image" || resource.kind === "audio")
        && Boolean(mimeExtensions[resource.mimeType])
        && (resource.kind === "image") === resource.mimeType.startsWith("image/");
      const pathMatch = resource.mediaPath ? mediaPathPattern.exec(resource.mediaPath) : null;
      const pathExtension = pathMatch?.[2]?.toLowerCase();
      const liveState = uuidPattern.test(state.roomId);
      const safeDemoUrl = resource.mediaUrl?.startsWith("blob:") ?? false;
      const safeName = resource.name.trim();
      const hasUnsafeNameCharacter = Array.from(safeName).some((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint <= 0x1f
          || codePoint === 0x7f
          || (codePoint >= 0x202a && codePoint <= 0x202e)
          || (codePoint >= 0x2066 && codePoint <= 0x2069);
      });
      if (!uuidPattern.test(resource.id)
        || !resource.name.trim()
        || safeName.length > 120
        || hasUnsafeNameCharacter
        || !allowedMimeType
        || !Number.isInteger(resource.size)
        || !Number.isFinite(resource.size)
        || resource.size <= 0
        || resource.size > 25 * 1024 * 1024
        || Boolean(resource.mediaPath) === Boolean(resource.mediaUrl)
        || (liveState && (!resource.mediaPath || Boolean(resource.mediaUrl)))
        || (!liveState && (!safeDemoUrl || Boolean(resource.mediaPath)))
        || (resource.mediaPath && (!pathMatch || resource.mediaPath.length > 240 || pathMatch[1].toLowerCase() !== state.roomId.toLowerCase()))
        || (pathExtension && !mimeExtensions[resource.mimeType]?.includes(pathExtension))
        || !Number.isFinite(Date.parse(resource.addedAt))) {
        throw new Error("class_resource_invalid");
      }
      state.classe.resources ??= [];
      if (state.classe.resources.some((candidate) => candidate.id === resource.id)) throw new Error("class_resource_duplicate");
      if (state.classe.resources.length >= 24) throw new Error("class_resource_limit_reached");
      state.classe.resources.unshift({ ...resource, name: safeName });
      break;
    }
    case "wave.base.configure": {
      if (!state.wave) break;
      if (state.wave.baseLoop.title || state.wave.submissions.length || state.wave.layers.length) throw new Error("wave_base_locked");
      const base = command.baseLoop;
      if (!command.waveTitle.trim() || !base.title.trim() || !base.kind.trim() || !base.key.trim()) throw new Error("wave_base_loop_required");
      if ((base.bars !== 4 && base.bars !== 8) || !Number.isFinite(base.bpm) || base.bpm < 40 || base.bpm > 260) throw new Error("wave_base_invalid");
      if (!base.fileName || !base.fileSize || base.fileSize > 25 * 1024 * 1024 || !base.mimeType || !WAVE_AUDIO_MIME_TYPES.has(base.mimeType) || (!base.mediaPath && !base.mediaUrl)) throw new Error("wave_base_media_required");
      state.wave.title = command.waveTitle.trim();
      state.wave.baseLoop = { ...base, title: base.title.trim(), kind: base.kind.trim(), key: base.key.trim() };
      state.wave.layers = [{ id: "base", title: base.title.trim(), author: "Host de la Wave", active: true, solo: false, muted: false }];
      state.wave.history.unshift(`${base.title.trim()} · boucle de base verrouillée`);
      break;
    }
    case "wave.base.replace": {
      if (!state.wave) break;
      const base = command.baseLoop;
      if (!base.title.trim() || !Number.isFinite(base.bpm) || base.bpm < 40 || base.bpm > 260
        || (base.bars !== 4 && base.bars !== 8) || !base.key.trim() || !base.kind.trim()
        || !base.fileName || !base.fileSize || base.fileSize > 25 * 1024 * 1024
        || !base.mimeType || !WAVE_AUDIO_MIME_TYPES.has(base.mimeType)
        || (!base.mediaPath && !base.mediaUrl)) throw new Error("wave_base_replacement_invalid");
      state.wave.baseLoop = {
        ...base,
        title: base.title.trim(),
        key: base.key.trim(),
        kind: base.kind.trim(),
      };
      const baseLayer = state.wave.layers.find((layer) => !layer.submissionId);
      if (baseLayer) baseLayer.title = base.title.trim();
      else state.wave.layers.unshift({ id: "base", title: base.title.trim(), author: "Host de la Wave", active: true, solo: false, muted: false });
      state.wave.history.unshift(`${base.title.trim()} · nouvelle boucle de base importée par le host`);
      break;
    }
    case "classe.question.add": {
      if (!state.classe?.questionsOpen) throw new Error("class_questions_closed");
      const seat = state.classe.seats.find((item) => item.person?.id === command.question.author.id);
      if (!seat || ["disconnected", "absent", "suspended"].includes(seat.status)) throw new Error("class_participation_required");
      const text = command.question.text.trim();
      if (text.length < 2 || text.length > 280) throw new Error("class_question_invalid");
      state.classe.questions ??= [];
      if (state.classe.questions.some((question) => question.id === command.question.id)) throw new Error("class_question_duplicate");
      state.classe.questions.unshift({
        ...command.question,
        author: seat.person!,
        text,
        status: "pending",
        supports: 0,
        supporterIds: [],
      });
      break;
    }
    case "classe.question.support": {
      if (!state.classe?.questionsOpen) throw new Error("class_questions_closed");
      const seat = state.classe.seats.find((item) => item.person?.id === command.accountId);
      if (!seat || ["disconnected", "absent", "suspended"].includes(seat.status)) throw new Error("class_participation_required");
      const question = state.classe.questions?.find((item) => item.id === command.questionId);
      if (!question || question.status === "answered") throw new Error("class_question_unavailable");
      if (question.author.id === command.accountId) throw new Error("class_question_self_support");
      if (question.supporterIds.includes(command.accountId)) throw new Error("class_question_already_supported");
      question.supporterIds.push(command.accountId);
      question.supports = question.supporterIds.length;
      break;
    }
    case "classe.question.status": {
      const question = state.classe?.questions?.find((item) => item.id === command.questionId);
      if (!question) throw new Error("class_question_not_found");
      question.status = command.status;
      if (command.status === "displayed") state.classe!.featuredQuestionId = question.id;
      if (command.status === "answered" && state.classe!.featuredQuestionId === question.id) state.classe!.featuredQuestionId = null;
      break;
    }
    case "classe.question.feature":
      if (!state.classe) break;
      if (command.questionId && !state.classe.questions?.some((item) => item.id === command.questionId)) throw new Error("class_question_not_found");
      state.classe.featuredQuestionId = command.questionId;
      state.classe.questions?.forEach((question) => {
        if (question.id === command.questionId && question.status !== "answered") question.status = "displayed";
        else if (question.status === "displayed") question.status = "pending";
      });
      break;
    case "wave.submissions.quarantine": {
      if (!state.wave || !command.submissionIds.length) throw new Error("wave_submission_not_found");
      const submissions = [...new Set(command.submissionIds)].map(id => {
        const item = state.wave!.submissions.find(submission => submission.id === id);
        if (!item) throw new Error("wave_submission_not_found");
        if (item.vote?.open) throw new Error("wave_vote_open");
        if (!["RECEIVED", "NEEDS_REVIEW", "NEEDS_CORRECTION", "READY_FOR_VOTE", "NOT_SELECTED"].includes(item.lifecycleStatus ?? "")) throw new Error("wave_submission_not_editable");
        return item;
      });
      for (const submission of submissions) {
        transitionWaveSubmission(submission, "NEEDS_CORRECTION", { actorId, reason: "host_quarantine" });
        submission.quarantined = true;
      }
      state.wave.history.unshift(`${submissions.length} boucle(s) placée(s) en quarantaine`);
      break;
    }
    case "wave.submission.status": {
      const submission = state.wave?.submissions.find((item) => item.id === command.submissionId);
      if (!submission) throw new Error("wave_submission_not_found");
      if (submission.quarantined && command.status === "analysis") {
        if (!submission.rightsConfirmed) throw new Error("wave_rights_unconfirmed");
        if (!state.wave || !waveSubmissionCompatible(state.wave, submission)) throw new Error("wave_file_incompatible");
        if (!(submission.mediaUrl || submission.mediaPath)) throw new Error("wave_version_media_required");
        if (submission.lifecycleStatus === "NEEDS_CORRECTION") transitionWaveSubmission(submission, "NEEDS_REVIEW", { actorId, reason: "host_quarantine_reviewed" });
      }
      if (command.status === "accepted") {
        if (!submission.rightsConfirmed) throw new Error("wave_rights_unconfirmed");
        if (!state.wave) break;
        assertWavePublicApproval(state.wave, submission);
        submission.status = "accepted";
        submission.decisionSource = "public";
        submission.reviewReason = undefined;
        submission.reviewFeedback = "Validée par le public — la boucle rejoint la production.";
        transitionWaveSubmission(submission, "ACCEPTED", { actorId, reason: "public_vote_approved" });
        integrateWaveSubmission(state.wave, submission);
        break;
      }
      if ((command.status === "rejected" || command.status === "rework") && submission.vote?.open) throw new Error("wave_vote_open");
      if (submission.status === "accepted" && (command.status === "rejected" || command.status === "rework")) throw new Error("wave_submission_already_integrated");
      if (command.status === "rejected" || command.status === "rework") {
        if (!command.reason) throw new Error("wave_review_reason_required");
        submission.reviewReason = command.reason;
        submission.reviewFeedback = waveReviewFeedback(command.reason, command.feedback);
        submission.decisionSource = "host";
      } else if (command.status === "to-review") {
        submission.reviewReason = undefined;
        submission.reviewFeedback = undefined;
        submission.decisionSource = undefined;
      }
      const target = command.status === "analysis"
        ? "READY_FOR_VOTE"
        : command.status === "to-review"
          ? "NEEDS_REVIEW"
          : command.status === "rework"
            ? "NEEDS_CORRECTION"
            : command.status === "rejected"
              ? "REJECTED"
              : "RECEIVED";
      transitionWaveSubmission(submission, target, {
        actorId,
        reason: command.reason ? `host:${command.reason}` : `legacy_command:${command.status}`,
      });
      if (command.status === "analysis" || command.status === "rejected") submission.quarantined = false;
      break;
    }
    case "wave.rules.update": {
      if (!state.wave) break;
      const { bpm, key, bars, kind } = command.patch;
      if (!Number.isFinite(bpm) || bpm < 40 || bpm > 260 || (bars !== 4 && bars !== 8) || !key.trim() || !kind.trim()) {
        throw new Error("wave_rules_invalid");
      }
      state.wave.baseLoop = {
        ...state.wave.baseLoop,
        bpm,
        bars,
        key: key.trim(),
        kind: kind.trim(),
      };
      state.wave.history.unshift(`Règles mises à jour · ${bpm} BPM · ${key.trim()} · ${bars} mesures`);
      break;
    }
    case "wave.submissions.setOpen":
      if (state.wave) {
        const categories = command.acceptedCategories ?? waveAcceptedCategories(state.wave);
        if (!Array.isArray(categories) || categories.some((category) => !WAVE_LOOP_CATEGORIES.some(({ id }) => id === category))
          || (command.open && categories.length === 0)) throw new Error("wave_categories_invalid");
        state.wave.acceptedCategories = WAVE_LOOP_CATEGORIES.filter(({ id }) => categories.includes(id)).map(({ id }) => id);
        state.wave.submissionsOpen = command.open;
        const selection = WAVE_LOOP_CATEGORIES.filter(({ id }) => categories.includes(id)).map(({ label }) => label).join(", ");
        state.wave.history.unshift(command.open ? `Soumissions ouvertes · ${selection}` : "Soumissions fermées");
      }
      break;
    case "wave.submission.add": {
      if (!state.wave) break;
      if (state.wave.submissionsOpen === false) throw new Error("wave_submissions_closed");
      if (!waveAcceptedCategories(state.wave).includes(waveSubmissionCategory(command.submission))) throw new Error("wave_category_closed");
      if (!state.wave.baseLoop?.title || (!state.wave.baseLoop.mediaPath && !state.wave.baseLoop.mediaUrl)) throw new Error("wave_base_loop_required");
      if (!command.submission.rightsConfirmed) throw new Error("wave_rights_unconfirmed");
      if (!command.submission.fileName || !command.submission.fileSize || command.submission.fileSize > 25 * 1024 * 1024 || !command.submission.mimeType || !WAVE_AUDIO_MIME_TYPES.has(command.submission.mimeType) || (!command.submission.mediaPath && !command.submission.mediaUrl)) throw new Error("wave_submission_media_required");
      if (![4, 8, 16].includes(command.submission.bars) || Math.abs(command.submission.bpm - state.wave.baseLoop.bpm) > 8) throw new Error("wave_file_incompatible");
      if (state.wave.submissions.some((item) => item.id === command.submission.id)) throw new Error("wave_submission_duplicate");
      if (state.wave.submissions.filter((item) => item.contributor.id === command.submission.contributor.id && !["rejected", "accepted"].includes(item.status)).length >= 3) throw new Error("wave_submission_limit");
      const received = normalizeWaveSubmission({
        ...command.submission,
        category: waveSubmissionCategory(command.submission),
        status: "received",
        lifecycleStatus: "RECEIVED",
        version: 1,
        vote: undefined,
        reviewReason: undefined,
        reviewFeedback: undefined,
        decisionSource: undefined,
      });
      state.wave.submissions.unshift(received);
      state.wave.activeSubmissionId = command.submission.id;
      break;
    }
    case "wave.submission.importToVote": {
      if (!state.wave) break;
      const submission = command.submission;
      if (!state.wave.baseLoop?.title || (!state.wave.baseLoop.mediaPath && !state.wave.baseLoop.mediaUrl)) throw new Error("wave_base_loop_required");
      if (!submission.rightsConfirmed || !WAVE_LOOP_CATEGORIES.some(({ id }) => id === waveSubmissionCategory(submission))) throw new Error("wave_import_vote_invalid");
      if (!submission.fileName || !submission.fileSize || submission.fileSize > 25 * 1024 * 1024
        || !submission.mimeType || !WAVE_AUDIO_MIME_TYPES.has(submission.mimeType)
        || (!submission.mediaPath && !submission.mediaUrl)) throw new Error("wave_submission_media_required");
      if (![4, 8, 16].includes(submission.bars)
        || Math.abs(submission.bpm - state.wave.baseLoop.bpm) > 2) throw new Error("wave_file_incompatible");
      if (state.wave.submissions.some((item) => item.id === submission.id)) throw new Error("wave_submission_duplicate");
      const ready = normalizeWaveSubmission({
        ...submission,
        category: waveSubmissionCategory(submission),
        status: "analysis",
        lifecycleStatus: "READY_FOR_VOTE",
        rightsConfirmed: true,
        version: 1,
        vote: undefined,
        reviewReason: undefined,
        reviewFeedback: undefined,
        decisionSource: undefined,
      });
      state.wave.submissions.unshift(ready);
      state.wave.activeSubmissionId = ready.id;
      state.wave.history.unshift(`${ready.title} v1 importée par le host · prête pour Vote`);
      break;
    }
    case "wave.submission.version": {
      const submission = state.wave?.submissions.find((item) => item.id === command.submissionId);
      if (!submission) throw new Error("wave_submission_not_found");
      if (submission.status === "accepted") throw new Error("wave_submission_already_integrated");
      if (submission.vote?.open) throw new Error("wave_vote_open");
      if (!command.patch.fileName || !command.patch.fileSize || command.patch.fileSize > 25 * 1024 * 1024 || !command.patch.mimeType || !WAVE_AUDIO_MIME_TYPES.has(command.patch.mimeType) || (!command.patch.mediaPath && !command.patch.mediaUrl)) throw new Error("wave_version_media_required");
      if (![4, 8, 16].includes(command.patch.bars) || !Number.isFinite(command.patch.bpm)) throw new Error("wave_file_incompatible");
      appendCorrectedWaveVersion(submission, command.patch, {
        note: command.note,
        correctionReason: command.note.trim() || "Version retravaillée",
        correctedBy: actorId ?? "wave-control",
        actorId,
      });
      if (state.wave) state.wave.history.unshift(`${submission.title} · version ${submission.version} réinjectée dans le Sas`);
      break;
    }
    case "wave.vote.open": {
      const submission = state.wave?.submissions.find((item) => item.id === command.submissionId);
      if (!submission) throw new Error("wave_submission_not_found");
      if (command.open && submission.quarantined) throw new Error("wave_submission_quarantined");
      if (command.open) {
        if (!state.wave) break;
        if (submission.vote?.open) break;
        if (!submission.rightsConfirmed) throw new Error("wave_rights_unconfirmed");
        if (!waveSubmissionCompatible(state.wave, submission)) throw new Error("wave_file_incompatible");
        if (submission.status === "accepted" || submission.status === "rejected" || submission.status === "rework") throw new Error("wave_submission_not_ready");
        if (state.wave.submissions.some((item) => item.id !== submission.id && item.vote?.open)) throw new Error("wave_vote_already_open");
        if (submission.lifecycleStatus === "RECEIVED" || submission.lifecycleStatus === "NEEDS_REVIEW") {
          transitionWaveSubmission(submission, "READY_FOR_VOTE", { actorId, reason: "host_ready_for_vote" });
        }
        openWaveVote(state.wave, submission, {
          actorId,
          durationSeconds: command.durationSeconds ?? submission.vote?.durationSeconds ?? 30,
          listeningMode: command.listeningMode ?? submission.vote?.listeningMode ?? "beat",
        });
        // Temporary two-second showcase vote: populate a believable public
        // tally immediately and guarantee that the candidate clears the 60% gate.
        if (command.durationSeconds === 2 && submission.vote) {
          const simulatedChoices = [
            "yes", "yes", "no", "yes", "yes", "yes", "no",
            "yes", "yes", "yes", "yes", "no", "yes", "yes",
            "yes", "no", "yes", "yes", "yes", "yes", "yes",
          ] as const;
          submission.vote.votes = Object.fromEntries(simulatedChoices.map((choice, index) => [
            `simulation-public-${index + 1}`,
            choice,
          ]));
        }
        submission.reviewReason = undefined;
        submission.reviewFeedback = undefined;
        submission.decisionSource = undefined;
        state.wave.history.unshift(`${submission.title} v${submission.version} soumise au vote public`);
      } else {
        if (!state.wave || !submission.vote) throw new Error("wave_vote_required");
        if (submission.vote.outcome) break;
        finalizeWaveVote(state.wave, submission, actorId);
      }
      break;
    }
    case "wave.replacement.open": {
      const layer = state.wave?.layers.find((item) => item.id === command.layerId);
      const submission = state.wave?.submissions.find((item) => item.id === command.submissionId);
      if (!state.wave || !layer || layer.id === "base") throw new Error("wave_replacement_layer_invalid");
      if (!submission || layer.submissionId === submission.id) throw new Error("wave_replacement_candidate_invalid");
      reduceCommand(state, { type: "wave.vote.open", submissionId: submission.id, open: true, durationSeconds: command.durationSeconds, listeningMode: command.listeningMode }, actorId);
      if (!submission.vote?.open) throw new Error("wave_replacement_vote_required");
      submission.vote.replacesLayerId = layer.id;
      state.wave.history.unshift(`${submission.title} défie ${layer.title} en duel de remplacement`);
      break;
    }
    case "wave.vote.cast": {
      const submission = state.wave?.submissions.find((item) => item.id === command.submissionId);
      if (!submission?.vote?.open) throw new Error("wave_vote_closed");
      if (submission.vote.submissionVersion !== submission.version) throw new Error("wave_vote_version_mismatch");
      if (submission.vote.endsAt && new Date(submission.vote.endsAt).getTime() <= Date.now()) throw new Error("wave_vote_expired");
      if (submission.vote.votes[command.accountId]) throw new Error("wave_vote_already_cast");
      submission.vote.votes[command.accountId] = command.choice;
      break;
    }
    case "wave.submission.select":
      if (state.wave) state.wave.activeSubmissionId = command.submissionId;
      break;
    case "wave.sequence.transport":
      if (state.wave) state.wave.playing = command.playing;
      break;
    case "wave.sequence.looping":
      if (state.wave) state.wave.looping = command.looping;
      break;
    case "wave.sequence.layer": {
      const layer = state.wave?.layers.find((item) => item.id === command.layerId);
      if (!layer) throw new Error("wave_layer_not_found");
      const gain = command.patch.gain;
      if (gain !== undefined && (!Number.isFinite(gain) || gain < 0 || gain > 1)) {
        throw new Error("wave_layer_gain_invalid");
      }
      if (typeof command.patch.active === "boolean") layer.active = command.patch.active;
      if (typeof command.patch.solo === "boolean") layer.solo = command.patch.solo;
      if (typeof command.patch.muted === "boolean") layer.muted = command.patch.muted;
      if (gain !== undefined) layer.gain = gain;
      if (state.wave) state.wave.history.unshift(`${layer.title} · réglage modifié`);
      break;
    }
    case "wave.sequence.remove": {
      if (!state.wave) break;
      const index = state.wave.layers.findIndex((layer) => layer.id === command.layerId);
      if (index < 0) throw new Error("wave_layer_not_found");
      if (index === 0) throw new Error("wave_base_layer_locked");
      const [removed] = state.wave.layers.splice(index, 1);
      const removedSubmission = state.wave.submissions.find((submission) => submission.id === removed.submissionId);
      if (removedSubmission) transitionWaveSubmission(removedSubmission, "REMOVED", { actorId, reason: "removed_from_collective_beat" });
      state.wave.history.unshift(`${removed.title} · retirée du Séquenceur`);
      break;
    }
    case "cage.format":
      if (state.cage) {
        state.cage.format = command.format;
        state.cage.event = { ...cageEvent(state.cage), updatedAt: new Date().toISOString() };
      }
      break;
    case "cage.event.patch":
      if (state.cage) {
        const patch = { ...command.patch };
        if (typeof patch.title === "string") patch.title = patch.title.trim().slice(0, 80) || cageEvent(state.cage).title;
        if (typeof patch.discipline === "string") patch.discipline = patch.discipline.trim().slice(0, 60) || "Toutes disciplines";
        state.cage.event = { ...cageEvent(state.cage), ...patch, updatedAt: new Date().toISOString() };
      }
      break;
    case "cage.event.status":
      if (state.cage) state.cage.event = { ...cageEvent(state.cage), status: command.status, updatedAt: new Date().toISOString() };
      break;
    case "cage.structure.generate":
      if (state.cage) Object.assign(state.cage, generateCageStructure(state.cage, command.format, command.seeding, state.revision + 1));
      break;
    case "cage.match.select":
      if (!state.cage?.matches.some((match) => match.id === command.matchId)) throw new Error("cage_match_not_found");
      state.cage.matches = state.cage.matches.map((match) => match.id !== command.matchId && match.status === "live"
        ? { ...match, status: "ready" as const }
        : match);
      state.cage.currentMatchId = command.matchId;
      state.cage.currentRound = state.cage.matches.find((match) => match.id === command.matchId)?.round ?? state.cage.currentRound;
      state.cage.votes = {};
      state.cage.resultsHidden = true;
      state.cage.votingOpen = false;
      state.cage.battleRound = 1;
      state.cage.battleStartedAt = null;
      state.cage.battleElapsedSeconds = 0;
      state.cage.battleActiveSide = null;
      state.cage.battleCountdownEndsAt = null;
      state.cage.battleStatus = "ready";
      break;
    case "cage.open-mic.move": {
      if (!state.cage) break;
      const entries = cageOpenMicEntries(state.cage);
      const index = entries.findIndex((entry) => entry.id === command.entryId);
      move(entries, index, command.direction);
      state.cage.openMicEntries = entries.map((entry, entryIndex) => ({
        ...entry,
        order: entryIndex + 1,
        slot: cageOpenMicSlot(entryIndex),
      }));
      state.cage.event = { ...cageEvent(state.cage), updatedAt: new Date().toISOString() };
      break;
    }
    case "cage.open-mic.status": {
      if (!state.cage) break;
      const entries = cageOpenMicEntries(state.cage);
      const entry = entries.find((candidate) => candidate.id === command.entryId);
      if (!entry) throw new Error("cage_open_mic_entry_not_found");
      if (command.status === "live") {
        entries.forEach((candidate) => {
          if (candidate.id !== entry.id && candidate.status === "live") candidate.status = "ready";
        });
        state.cage.battleStatus = "live-a";
        state.cage.battleActiveSide = "A";
        state.cage.battleCountdownEndsAt = null;
        state.cage.battleRound = 1;
        state.cage.battleStartedAt = new Date().toISOString();
        state.cage.battleElapsedSeconds = 0;
        state.cage.event = { ...cageEvent(state.cage), status: "live", updatedAt: new Date().toISOString() };
      }
      entry.status = command.status;
      state.cage.openMicEntries = entries;
      break;
    }
    case "cage.open-mic.score": {
      if (!state.cage) break;
      const entries = cageOpenMicEntries(state.cage);
      const entry = entries.find((candidate) => candidate.id === command.entryId);
      if (!entry) throw new Error("cage_open_mic_entry_not_found");
      entry.score = Math.round(Math.max(0, Math.min(100, command.score)) * 10) / 10;
      state.cage.openMicEntries = entries;
      break;
    }
    case "cage.battle":
      if (state.cage) {
        const match = currentMatch(state);
        const wasLive = state.cage.battleStatus === "live-a" || state.cage.battleStatus === "live-b";
        const switchesSide = wasLive && state.cage.battleStatus !== command.status
          && (command.status === "live-a" || command.status === "live-b");
        const now = Date.now();
        if ((command.status === "paused" || command.status === "incident") && wasLive && state.cage.battleStartedAt) {
          const startedAt = new Date(state.cage.battleStartedAt).getTime();
          state.cage.battleElapsedSeconds = (state.cage.battleElapsedSeconds ?? 0)
            + (Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1_000)) : 0);
          state.cage.battleStartedAt = null;
        } else if (command.status === "live-a" || command.status === "live-b") {
          if (!wasLive || switchesSide || !state.cage.battleStartedAt) {
            state.cage.battleStartedAt = new Date(now).toISOString();
            if (switchesSide) state.cage.battleElapsedSeconds = 0;
          }
          state.cage.battleActiveSide = command.status === "live-a" ? "A" : "B";
          state.cage.battleCountdownEndsAt = null;
          if (match) {
            state.cage.matches = state.cage.matches.map((candidate) => candidate.id === match.id
              ? { ...candidate, status: "live" as const }
              : candidate.status === "live" ? { ...candidate, status: "ready" as const } : candidate);
          }
          state.cage.event = { ...cageEvent(state.cage), status: "live", updatedAt: new Date(now).toISOString() };
        } else if (command.status === "ready" || command.status === "countdown") {
          state.cage.battleStartedAt = null;
          state.cage.battleElapsedSeconds = 0;
          state.cage.battleActiveSide = null;
          state.cage.battleCountdownEndsAt = command.status === "countdown"
            ? new Date(now + 3_000).toISOString()
            : null;
          if (match?.status === "scheduled") match.status = "ready";
        } else {
          state.cage.battleCountdownEndsAt = null;
        }
        state.cage.battleStatus = command.status;
        if (command.status === "done") {
          state.cage.battleStartedAt = null;
          state.cage.battleElapsedSeconds = 0;
          state.cage.battleActiveSide = null;
          state.cage.battleCountdownEndsAt = null;
          const currentRound = state.cage.battleRound ?? 1;
          const roundCount = state.cage.battleRoundCount ?? 3;
          if (currentRound < roundCount) {
            state.cage.battleRound = currentRound + 1;
            state.cage.battleStatus = "ready";
          }
        }
      }
      break;
    case "cage.battle.round":
      if (state.cage) {
        state.cage.battleRound = Math.max(1, Math.min(state.cage.battleRoundCount ?? 3, Math.round(command.round)));
        state.cage.battleStatus = "ready";
        state.cage.battleStartedAt = null;
        state.cage.battleElapsedSeconds = 0;
        state.cage.battleActiveSide = null;
        state.cage.battleCountdownEndsAt = null;
      }
      break;
    case "cage.battle.duration":
      if (state.cage) {
        state.cage.passageDurationSeconds = command.seconds;
        state.cage.battleElapsedSeconds = Math.min(state.cage.battleElapsedSeconds ?? 0, command.seconds);
      }
      break;
    case "cage.vote.mode":
      if (state.cage) state.cage.votingMode = command.mode;
      break;
    case "cage.vote.duration":
      if (state.cage) state.cage.votingDurationSeconds = command.seconds;
      break;
    case "cage.vote.open":
      if (state.cage) {
        state.cage.votingOpen = command.open;
        state.cage.votingEndsAt = command.open
          ? new Date(Date.now() + state.cage.votingDurationSeconds * 1_000).toISOString()
          : null;
      }
      break;
    case "cage.vote.cast":
      if (!state.cage?.votingOpen) throw new Error("cage_vote_closed");
      if (state.cage.votingEndsAt && new Date(state.cage.votingEndsAt).getTime() <= Date.now()) throw new Error("cage_vote_expired");
      if (state.cage.votes[command.accountId]) throw new Error("cage_vote_already_cast");
      state.cage.votes[command.accountId] = command.choice;
      break;
    case "cage.vote.reveal":
      if (state.cage) state.cage.resultsHidden = command.hidden;
      break;
    case "cage.result": {
      const match = currentMatch(state);
      if (!match || !state.cage) throw new Error("cage_match_not_found");
      if (![match.competitorA.id, match.competitorB.id].includes(command.winnerId)) throw new Error("cage_winner_invalid");
      if (match.status === "done") {
        if (match.winnerId === command.winnerId) break;
        throw new Error("cage_result_correction_confirmation_required");
      }
      const ballots = Object.values(state.cage.votes);
      if (ballots.length > 0) {
        const votesA = ballots.filter((vote) => vote === "A").length;
        match.scoreA = Math.round((votesA / ballots.length) * 100);
        match.scoreB = 100 - match.scoreA;
      }
      match.winnerId = command.winnerId;
      match.status = "done";
      state.cage.resultHistory.unshift({ matchId: match.id, winnerId: command.winnerId, scoreA: match.scoreA, scoreB: match.scoreB, validatedAt: new Date().toISOString() });
      state.cage.battleStatus = "done";
      state.cage.battleStartedAt = null;
      state.cage.battleElapsedSeconds = 0;
      state.cage.battleActiveSide = null;
      state.cage.battleCountdownEndsAt = null;
      state.cage.votingOpen = false;
      if (normalizedCageFormat(state.cage.format) === "tournament") {
        const currentRoundMatches = state.cage.matches.filter((candidate) => candidate.round === match.round);
        const currentIndex = currentRoundMatches.findIndex((candidate) => candidate.id === match.id);
        const nextRoundMatches = state.cage.matches.filter((candidate) => candidate.round === match.round + 1);
        const destination = nextRoundMatches[Math.floor(currentIndex / 2)];
        const winner = command.winnerId === match.competitorA.id ? match.competitorA : match.competitorB;
        if (destination) {
          if (currentIndex % 2 === 0) destination.competitorA = winner;
          else destination.competitorB = winner;
          if (destination.competitorA.id !== destination.competitorB.id) destination.status = "ready";
        }
      }
      if (state.cage.matches.every((candidate) => candidate.status === "done")) {
        state.cage.event = { ...cageEvent(state.cage), status: "completed", updatedAt: new Date().toISOString() };
      }
      break;
    }
    case "loge.preview.patch":
      if (state.loge) {
        if (command.expectedMedia
          && (state.loge.preview.mediaName !== command.expectedMedia.mediaName
            || state.loge.preview.mediaPath !== command.expectedMedia.mediaPath)) {
          throw new Error("loge_preview_media_changed");
        }
        const preview = { ...state.loge.preview, ...sanitizeLogePreviewPatch(state.loge.preview, command.patch) };
        // A live-only window is the stricter mode and wins if a malformed
        // caller attempts to activate both options in one command.
        if (command.patch.liveOnly === true) preview.replayIncluded = false;
        else if (command.patch.replayIncluded === true) preview.liveOnly = false;
        state.loge.preview = preview;
      }
      break;
    case "loge.preview.launch": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      if (!preview.mediaName.trim()) throw new Error("loge_preview_media_required");
      if (!LOGE_PREVIEW_SESSION_ID_PATTERN.test(command.sessionId)) throw new Error("loge_preview_session_invalid");
      const current = normalizeLogePreviewTransport(preview);
      if (current.transportStatus === "playing" || current.transportStatus === "paused") {
        if (current.sessionId === command.sessionId) break;
        throw new Error("loge_preview_session_active");
      }
      setLogePreviewTransport(preview, {
        transportStatus: "playing",
        sessionId: command.sessionId,
        startedAt: new Date().toISOString(),
        positionSeconds: clampLogePreviewPosition(preview, command.positionSeconds),
        volume: command.volume === undefined ? current.volume : clampLogePreviewVolume(command.volume),
      });
      break;
    }
    case "loge.preview.pause": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus === "paused") break;
      if (current.transportStatus !== "playing") throw new Error("loge_preview_session_inactive");
      setLogePreviewTransport(preview, {
        transportStatus: "paused",
        positionSeconds: logePreviewPositionAt(preview),
        startedAt: null,
      });
      break;
    }
    case "loge.preview.resume": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus === "playing") break;
      if (current.transportStatus !== "paused") throw new Error("loge_preview_session_inactive");
      setLogePreviewTransport(preview, {
        transportStatus: "playing",
        startedAt: new Date().toISOString(),
      });
      break;
    }
    case "loge.preview.restart": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus !== "playing" && current.transportStatus !== "paused") {
        throw new Error("loge_preview_session_inactive");
      }
      setLogePreviewTransport(preview, {
        transportStatus: current.transportStatus,
        positionSeconds: 0,
        startedAt: current.transportStatus === "playing" ? new Date().toISOString() : null,
      });
      break;
    }
    case "loge.preview.volume": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus !== "playing" && current.transportStatus !== "paused") {
        throw new Error("loge_preview_session_inactive");
      }
      setLogePreviewTransport(preview, {
        transportStatus: current.transportStatus,
        volume: clampLogePreviewVolume(command.volume),
      });
      break;
    }
    case "loge.preview.stop": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus === "idle") break;
      setLogePreviewTransport(preview, {
        transportStatus: "idle",
        startedAt: null,
        positionSeconds: 0,
      });
      break;
    }
    case "loge.preview.finish": {
      if (!state.loge) break;
      const preview = state.loge.preview;
      assertLogePreviewMedia(preview, command.expectedMedia);
      const current = assertLogePreviewSession(preview, command.sessionId);
      if (current.transportStatus === "finished") break;
      if (current.transportStatus !== "playing" && current.transportStatus !== "paused") {
        throw new Error("loge_preview_session_inactive");
      }
      setLogePreviewTransport(preview, {
        transportStatus: "finished",
        startedAt: null,
        positionSeconds: logePreviewDuration(preview) ?? logePreviewPositionAt(preview),
      });
      break;
    }
    case "loge.questions.open":
      if (state.loge) state.loge.questionsOpen = command.open;
      break;
    case "loge.question.add":
      if (!state.loge) break;
      if (!state.loge.questionsOpen) throw new Error("loge_questions_closed");
      if (state.loge.questions.some((question) => question.id === command.question.id)) throw new Error("loge_question_duplicate");
      state.loge.questions.unshift(command.question);
      break;
    case "loge.question.status": {
      const question = state.loge?.questions.find((item) => item.id === command.questionId);
      if (!question) throw new Error("loge_question_not_found");
      if (command.status === "selected" && state.loge) {
        state.loge.questions.forEach((item) => {
          if (item.id !== command.questionId && item.status === "selected") item.status = "pending";
        });
      }
      question.status = command.status;
      if (typeof command.invite === "boolean") question.invited = command.invite;
      break;
    }
    case "loge.queue.setOpen":
      if (state.loge) state.loge.requestQueues = { ...state.loge.requestQueues, [command.kind]: command.open };
      break;
    case "loge.request.join": {
      if (!state.loge?.requestQueues?.[command.kind]) throw new Error("loge_queue_closed");
      if (state.loge.moments.some((m) => m.kind === command.kind && m.beneficiary.id === command.person.id && ["pending", "scheduled", "accepted", "live"].includes(m.status))) break;
      state.loge.moments.push({ id: crypto.randomUUID(), kind: command.kind, beneficiary: command.person, requested: true, status: "pending", title: command.kind === "dedication" ? "Demande de dédicace" : command.kind === "face-to-face" ? "Demande de face-à-face" : "Demande de cadeau" });
      break;
    }
    case "loge.request.cancel": {
      const moment = state.loge?.moments.find((m) => m.id === command.momentId && m.beneficiary.id === command.accountId && m.requested);
      if (!moment || !["pending", "cancelled"].includes(moment.status)) throw new Error("loge_request_unavailable");
      moment.status = "cancelled";
      break;
    }
    case "loge.moment.add":
      if (!state.loge) break;
      if (state.loge.moments.some((moment) => moment.id === command.moment.id)) throw new Error("loge_moment_duplicate");
      state.loge.moments.unshift(command.moment);
      break;
    case "loge.moment.status": {
      const moment = state.loge?.moments.find((item) => item.id === command.momentId);
      if (!moment) throw new Error("loge_moment_not_found");
      if (moment.status === "completed" && command.status !== "completed") throw new Error("loge_reward_already_used");
      moment.status = command.status;
      break;
    }
    case "loge.moment.respond": {
      const moment = state.loge?.moments.find((item) => item.id === command.momentId && item.kind === "face-to-face");
      if (!moment) throw new Error("loge_face_to_face_not_found");
      if (moment.beneficiary.id !== command.accountId) throw new Error("loge_face_to_face_forbidden");
      if (moment.status === (command.accept ? "accepted" : "declined")) break;
      if (moment.status !== "scheduled") throw new Error("loge_face_to_face_unavailable");
      moment.status = command.accept ? "accepted" : "declined";
      break;
    }
    case "gift.send":
    case "gift.raffle":
      applyGift(state, command);
      break;
    case "gift.redemption.use": {
      const redemption = state.gifts.redemptions.find((item) => item.id === command.redemptionId);
      if (!redemption) throw new Error("room_gift_redemption_not_found");
      if (redemption.ownerId !== command.accountId) throw new Error("room_gift_redemption_forbidden");
      if (redemption.status === "redeemed") break;
      if (redemption.status === "cancelled") throw new Error("room_gift_redemption_unavailable");
      redemption.status = "redeemed";
      const moment = state.loge?.moments.find((item) => item.id === `moment-${redemption.transactionId}`);
      if (moment) moment.status = "completed";
      break;
    }
  }
}

export class DemoRoomToolsRepository implements RoomToolsRepository {
  private states = new Map<string, RoomToolsState>();
  private listeners = new Map<string, Set<(state: RoomToolsState) => void>>();
  private cageTimers = new Map<string, ReturnType<typeof setInterval>>();
  private cageStorageListeners = new Map<string, (event: StorageEvent) => void>();

  private persistCage(state: RoomToolsState) {
    if (!state.cage?.runtime || typeof window === "undefined") return;
    try { window.localStorage.setItem(`meewav:cage:competition:v1:${state.roomId}`, JSON.stringify(state)); }
    catch { throw new Error("cage_demo_storage_unavailable"); }
  }

  private refreshCage(state: RoomToolsState) {
    applyRoomVotingPolicy(state,readDemoVotingPolicy(state.roomId));
    const catalogRoom = state.cage ? ROOMS_HOME_CATALOG.find((room) => room.id === state.roomId && room.roomType === "cage") : undefined;
    if (catalogRoom && state.cage?.runtime && state.cage.runtime.config.title !== catalogRoom.title) {
      state = cloneState(state);
      state.cage!.runtime!.config.title = catalogRoom.title;
      syncCageLegacyProjection(state.cage!);
      state.revision++;
      this.persistCage(state);
      this.states.set(key(state.roomType, state.roomId), state);
    }
    if (state.cage && state.cage.demoPresentation?.version !== 2 && !readCageDemoSession(state.roomId)) {
      const showcase = cloneState(state);
      if (initializeCageShowcase(showcase)) {
        showcase.revision++;
        this.persistCage(showcase);
        this.states.set(key(showcase.roomType, showcase.roomId), showcase);
        state = showcase;
      }
    }
    if ((state.cage?.runtime?.config.format === "open-mic" && !Array.isArray(state.cage.runtime.openMicEntries)) || (state.cage?.runtime?.config.format === "championship" && state.cage.runtime.participants.some((person) => ["ADVANCED", "ELIMINATED", "FORFEIT"].includes(person.status)))) {
      const migrated = cloneState(state);
      if (migrated.cage && (migrateOpenMicRuntime(migrated.cage) || migrateChampionshipRuntime(migrated.cage))) {
        migrated.revision++;
        migrated.updatedAt = new Date().toISOString();
        this.persistCage(migrated);
        this.states.set(key(migrated.roomType, migrated.roomId), migrated);
        state = migrated;
      }
    }
    const current = state.cage?.runtime?.matches.find((match) => match.id === state.cage?.runtime?.activeMatchId);
    const openMicExpired = state.cage?.runtime?.openMicEntries?.some((entry) => entry.feedback?.open && entry.feedback.endsAt && Date.parse(entry.feedback.endsAt) <= Date.now());
    if (!openMicExpired && (!current?.vote?.open || !current.vote.endsAt || Date.parse(current.vote.endsAt) > Date.now())) return state;
    const next = cloneState(state);
    if (!next.cage || !finalizeExpiredCageVote(next.cage)) return state;
    next.revision++;
    next.updatedAt = new Date().toISOString();
    this.persistCage(next);
    this.states.set(key(next.roomType, next.roomId), next);
    return next;
  }

  async simulateWaveProduction(roomId: string, productionId: string) {
    const state = cloneState(this.ensure("wave", roomId));
    seedWaveTestProduction(state.wave!, productionId);
    normalizeWaveState(state.wave!);
    state.revision += 1;
    state.updatedAt = new Date().toISOString();
    if(readDemoExperience(roomId))localStorage.setItem(switchToolsKey(roomId,"wave"),JSON.stringify(state));
    this.states.set(key("wave", roomId), state);
    const projection = await this.publicProjection("wave", roomId);
    this.listeners.get(key("wave", roomId))?.forEach((listener) => listener(cloneState(projection as RoomToolsState)));
    return cloneState(state);
  }

  private ensure(roomType: SpecializedRoomId, roomId: string) {
    const stateKey = key(roomType, roomId);
    let existing = this.states.get(stateKey);
    const savedSwitch = typeof localStorage!=="undefined" ? JSON.parse(localStorage.getItem(switchToolsKey(roomId,roomType))??"null") as RoomToolsState|null : null;
    if(savedSwitch && (!existing || savedSwitch.revision>=existing.revision)){existing=savedSwitch;this.states.set(stateKey,existing);}
    if(savedSwitch && existing)return existing;

    if (roomType === "loge" && typeof localStorage !== "undefined") {
      try {
        const stored = JSON.parse(localStorage.getItem(`meewav:loge:demo:v1:${roomId}`) ?? "null") as RoomToolsState | null;
        if (stored?.loge && stored.roomId === roomId && stored.roomType === "loge" && (!existing || stored.revision >= existing.revision)) { existing = stored; this.states.set(stateKey, stored); }
      } catch { /* Keep the current demo state if local storage is unavailable. */ }
    }
    if (roomType === "scene" && typeof window !== "undefined") {
      const stored = JSON.parse(localStorage.getItem(`meewav:scene:demo:v1:${roomId}`) ?? "null") as RoomToolsState | null;
      if(stored?.scene && (!existing || stored.revision >= existing.revision)) existing=stored;
      const switching=readDemoExperience(roomId);
      if(switching?.sceneConfig && !stored) {
        const fresh=createRoomToolsFixture("scene",roomId);const scene=fresh.scene!;const config=switching.sceneConfig;
        scene.people=[{id:switching.hostId,name:switching.hostName,avatarUrl:switching.hostAvatar,role:"Host",microphone:"ready",camera:"ready"}];scene.prompter.texts=[];scene.prompter.activeTextId="";scene.prompter.playing=false;
        scene.evaluation.byPerformance={};scene.evaluation.viewerCompletedPerformanceIds=[];
        scene.fundraiser={...scene.fundraiser,title:"",status:"draft",visibleInLive:false,collectedAmount:0,contributionCount:0};
        scene.program=config.program.split("\n").map(t=>t.trim()).filter(Boolean).map((title,i)=>({id:`switch-${i}`,title,artistId:switching.hostId,artistName:switching.hostName,kind:"Morceau",durationMinutes:config.duration,status:"upcoming",evaluationEnabled:config.evaluation}));
        fresh.gifts.transactions=[];fresh.gifts.redemptions=[];fresh.gifts.stock=[];
        fresh.revision=1;existing=fresh;localStorage.setItem(`meewav:scene:demo:v1:${roomId}`,JSON.stringify(fresh));
      }
      if(existing)this.states.set(stateKey,existing);
    }

    if (roomType === "classe" && typeof window !== "undefined") {
      const persisted = JSON.parse(window.localStorage.getItem(`meewav:classe:demo:v2:${roomId}`) ?? "null") as RoomToolsState | null;
      if (persisted?.roomType === "classe" && persisted.roomId === roomId && persisted.classe && (!existing || persisted.revision > existing.revision)) {
        existing = persisted;
        this.states.set(stateKey, persisted);
      }
    }
    if (roomType === "cage" && existing && typeof window !== "undefined") {
      try {
        const persisted = JSON.parse(window.localStorage.getItem(`meewav:cage:competition:v1:${roomId}`) ?? "null") as RoomToolsState | null;
        if (persisted?.cage?.runtime?.version === 1 && persisted.roomId === roomId && persisted.revision > existing.revision) {
          this.states.set(stateKey, persisted);
          existing = persisted;
        }
      } catch { throw new Error("cage_demo_restore_failed"); }
    }
    if (existing) return this.refreshCage(existing);
    if (roomType === "cage" && typeof window !== "undefined") {
      try {
        const persisted = JSON.parse(window.localStorage.getItem(`meewav:cage:competition:v1:${roomId}`) ?? "null") as RoomToolsState | null;
        if (persisted?.roomId === roomId && persisted.roomType === "cage" && persisted.cage?.runtime?.version === 1) {
          this.states.set(stateKey, persisted);
          return this.refreshCage(persisted);
        }
      } catch { throw new Error("cage_demo_restore_failed"); }
    }
    const fixture = createRoomToolsFixture(roomType, roomId);
    if (fixture.cage) {
      const session = readCageDemoSession(roomId);
      const roomLaunch = readRoomLaunchSession(roomId);
      const homeRoom = ROOMS_HOME_CATALOG.find((room) => room.id === roomId && room.roomType === "cage");
      if (roomLaunch?.configuration.roomType === 'cage') {
        initializeCageCompetition(fixture.cage, { ...structuredClone(DEFAULT_CAGE_LAUNCH), title: roomLaunch.configuration.title }, []);
        delete fixture.cage.demoPresentation;
      }
      else if (session) initializeCageCompetition(fixture.cage, session.configuration, cageDemoGuestCandidates());
      else if (homeRoom) initializeCageCompetition(fixture.cage, { ...structuredClone(DEFAULT_CAGE_LAUNCH), title: homeRoom.title }, cageDemoGuestCandidates());
      else if (!initializeCageShowcase(fixture)) migrateCageDemoCompetition(fixture.cage);
      this.persistCage(fixture);
    }
    if (fixture.wave) {
      const wave = fixture.wave;
      seedWaveTestProduction(wave);
      normalizeWaveState(wave);
    }
    const launchSession = readRoomLaunchSession(roomId);
    if (launchSession && launchSession.configuration.roomType === roomType) applyRoomLaunchTools(fixture, launchSession);
    this.states.set(stateKey, fixture);
    return fixture;
  }

  async load(roomType: SpecializedRoomId, roomId: string) {
    const original = this.ensure(roomType, roomId);
    applyRoomVotingPolicy(original,readDemoVotingPolicy(roomId));
    const base = original.wave?.baseLoop;
    if (base && !base.mediaUrl && isRoomLaunchAudio(base.mediaPath)) base.mediaUrl = await resolveRoomLaunchAudio(base.mediaPath!);
    const state = cloneState(original);
    if (state.cage) projectCageCompetition(state.cage, undefined, true);
    return state;
  }

  subscribe(roomType: SpecializedRoomId, roomId: string, listener: (state: RoomToolsState) => void) {
    const stateKey = key(roomType, roomId);
    const listeners = this.listeners.get(stateKey) ?? new Set();
    listeners.add(listener);
    this.listeners.set(stateKey, listeners);
    if (typeof window !== "undefined" && !this.cageStorageListeners.has(stateKey)) {
      const onStorage = (event: StorageEvent) => {
        if (event.key !== switchToolsKey(roomId,roomType) && event.key !== (roomType === "loge" ? `meewav:loge:demo:v1:${roomId}` : roomType === "scene" ? `meewav:scene:demo:v1:${roomId}` : roomType === "classe" ? `meewav:classe:demo:v2:${roomId}` : `meewav:cage:competition:v1:${roomId}`) || !event.newValue) return;
        void this.publicProjection(roomType, roomId).then((projection) => this.listeners.get(stateKey)?.forEach((subscriber) => subscriber(cloneState(projection as RoomToolsState))));
      };
      window.addEventListener("storage", onStorage);
      this.cageStorageListeners.set(stateKey, onStorage);
    }
    if (roomType === "cage" && !this.cageTimers.has(stateKey)) this.cageTimers.set(stateKey, setInterval(() => {
      const previous = this.states.get(stateKey)?.revision;
      const state = this.ensure(roomType, roomId);
      if (previous !== state.revision) void this.publicProjection(roomType, roomId).then((projection) => this.listeners.get(stateKey)?.forEach((subscriber) => subscriber(cloneState(projection as RoomToolsState))));
    }, 1000));
    return { unsubscribe: () => {
      listeners.delete(listener);
      if (!listeners.size) {
        const timer = this.cageTimers.get(stateKey); if (timer) clearInterval(timer); this.cageTimers.delete(stateKey);
        const storage = this.cageStorageListeners.get(stateKey); if (storage && typeof window !== "undefined") window.removeEventListener("storage", storage); this.cageStorageListeners.delete(stateKey);
      }
    } };
  }

  async execute(roomType: SpecializedRoomId, roomId: string, role: RoomActorRole, command: RoomToolsCommand, accountId?: string) {
    assertDemoExperience(roomId,roomType,accountId ?? role);
    if ((roomType === "cage" || roomType === "classe" || roomType === "loge") && typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(`meewav:${roomType}:competition:${roomId}`, () => this.executeNow(roomType, roomId, role, command, accountId));
    return this.executeNow(roomType, roomId, role, command, accountId);
  }

  private async executeNow(roomType: SpecializedRoomId, roomId: string, role: RoomActorRole, command: RoomToolsCommand, accountId?: string) {
    if (!commandAllowed(roomType, role, command)) throw new Error("room_tool_forbidden");
    if (!CONTROL_ROLES.has(role) && !commandBelongsToAccount(command, accountId)) throw new Error("room_tool_account_mismatch");
    const state = cloneState(this.ensure(roomType, roomId));
    applyRoomVotingPolicy(state,readDemoVotingPolicy(roomId));
    requireRoomVoter(state,command,accountId ?? role);
    if ((command.type === "loge.request.join" || command.type === "loge.request.cancel") && !(await this.projectionForRole(roomType, roomId, role, accountId ?? "")).audience?.eligible) throw new Error("loge_access_required");
    if (command.type === "cage.competition.command" && state.cage?.runtime && cageCommandAlreadyApplied(state.cage.runtime, command, accountId ?? role)) return this.projectionForRole(roomType, roomId, role, accountId ?? role);
    if (command.type === "cage.demo.presentation") controlCageShowcase(state, command.action);
    else if (command.type === "cage.demo.guest.move") moveCageDemoGuest(state, command.participantId, command.destination, accountId ?? role);
    else {
      reduceCommand(state, command, accountId ?? role);
      prepareCageShowcaseVote(state);
    }
    applyRoomVotingPolicy(state,readDemoVotingPolicy(roomId));
    state.revision += 1;
    state.updatedAt = new Date().toISOString();
    if(readDemoExperience(roomId))localStorage.setItem(switchToolsKey(roomId,roomType),JSON.stringify(state));
    if (state.classe && typeof window !== "undefined") window.localStorage.setItem(`meewav:classe:demo:v2:${roomId}`, JSON.stringify(state));
    if (state.loge && typeof localStorage !== "undefined") localStorage.setItem(`meewav:loge:demo:v1:${roomId}`, JSON.stringify(state));
    if (state.scene && typeof window !== "undefined") localStorage.setItem(`meewav:scene:demo:v1:${roomId}`,JSON.stringify(state));
    this.persistCage(state);
    this.states.set(key(roomType, roomId), state);
    const signalProjection = await this.publicProjection(roomType, roomId);
    this.listeners.get(key(roomType, roomId))?.forEach((listener) => listener(cloneState(signalProjection as RoomToolsState)));
    return roomType === "cage" ? this.projectionForRole(roomType, roomId, role, accountId ?? role) : cloneState(state);
  }

  async publicProjection(roomType: SpecializedRoomId, roomId: string) {
    const state = await this.load(roomType, roomId);
    ensureSceneToolState(state);
    closeExpiredViewerVotes(state);
    state.audience = { eligible: false };
    stripPrivatePeople(state);
    state.gifts.stock = state.gifts.stock.filter((item) => item.origin === "SYSTEM" && item.ownerId === null);
    state.gifts.transactions = [];
    state.gifts.redemptions = [];
    if (roomType === "scene") {
      hidePrompter(state);
      hidePrivateSceneEvaluation(state);
      hideUnavailableSceneFundraiser(state);
    }
    if (roomType === "wave" && state.wave) state.wave.submissions = state.wave.submissions.filter((item) => item.status === "accepted" || item.vote?.open).map((item) => ({ ...item, privateNotes: "", vote: projectedWaveVote(item) }));
    if (roomType === "cage") {
      hideUnrevealedCageResults(state);
      if (state.cage) projectCageCompetition(state.cage);
    }
    if (roomType === "loge" && state.loge) {
      hideIneligibleLogeState(state);
    }
    return state;
  }

  async projectionForRole(roomType: SpecializedRoomId, roomId: string, role: RoomActorRole, accountId: string) {
    const state = await this.load(roomType, roomId);
    ensureSceneToolState(state);
    closeExpiredViewerVotes(state);
    const controlsRoom = role === "host" || role === "regisseur" || role === "teacher";
    state.audience = { eligible: controlsRoom || (roomType !== "loge" && role !== "visitor") || Boolean(
      state.loge?.questions.some((question) => question.author.id === accountId)
      || state.loge?.moments.some((moment) => moment.beneficiary.id === accountId)
      || state.gifts.redemptions.some((redemption) => redemption.ownerId === accountId && redemption.kind === "vip-moment" && redemption.status !== "cancelled"),
    ) };
    state.gifts.stock = state.gifts.stock.filter((item) => (item.origin === "SYSTEM" && item.ownerId === null) || item.ownerId === accountId);
    if (!controlsRoom) {
      state.gifts.transactions = state.gifts.transactions.filter((item) => item.senderId === accountId || item.recipientId === accountId);
      state.gifts.redemptions = state.gifts.redemptions.filter((item) => item.ownerId === accountId);
    }
    if (controlsRoom) {
      if (state.cage) projectCageCompetition(state.cage, accountId, true);
      return state;
    }
    stripPrivatePeople(state, accountId);
    if (state.scene) {
      if (role === "artist") {
        state.scene.prompter.texts = state.scene.prompter.texts.filter((text) => text.artistId === accountId);
        state.scene.prompter.activeTextId = state.scene.prompter.texts[0]?.id ?? "";
      } else hidePrompter(state);
      hidePrivateSceneEvaluation(state, accountId);
      hideUnavailableSceneFundraiser(state);
    }
    if (state.wave) state.wave.submissions = state.wave.submissions
      .filter((item) => item.status === "accepted" || item.vote?.open || (role === "contributor" && item.contributor.id === accountId))
      .map((item) => ({ ...item, privateNotes: "", vote: projectedWaveVote(item, accountId) }));
    hideUnrevealedCageResults(state, accountId);
    if (state.cage) projectCageCompetition(state.cage, accountId);
    if (state.loge) {
      if (!state.audience.eligible) hideIneligibleLogeState(state);
      else {
        hideUnavailableLogePreview(state);
        // A Viewer may receive the decoded peaks, but never the private
        // Storage object path. Playback is authorized through the short-lived
        // signed-URL issuer using only the Room id.
        state.loge.preview.mediaPath = null;
        state.loge.questions = state.loge.questions.filter((question) => question.author.id === accountId || question.status === "selected" || question.status === "answered");
        state.loge.moments = state.loge.moments
          .filter((moment) => moment.beneficiary.id === accountId || (moment.kind === "face-to-face" && moment.status === "live"))
          .map((moment) => moment.beneficiary.id === accountId ? moment : { ...moment, privateContent: undefined });
      }
    }
    return state;
  }
}

export function canOpenSpecializedRoom(roomType: SpecializedRoomId, state: RoomToolsState, role: RoomActorRole) {
  if (roomType === "loge") return Boolean(state.loge?.legendaryHost) && (role === "host" || role === "regisseur");
  if (roomType === "wave") return Boolean(
    state.wave?.baseLoop.title
    && state.wave.baseLoop.bpm > 0
    && [4, 8, 16].includes(state.wave.baseLoop.bars)
    && state.wave.baseLoop.key
    && state.wave.baseLoop.kind
    && state.wave.baseLoop.fileName
    && (state.wave.baseLoop.mediaPath || state.wave.baseLoop.mediaUrl)
    && state.wave.title,
  );
  return true;
}

export const roomToolsRepository = new DemoRoomToolsRepository();
