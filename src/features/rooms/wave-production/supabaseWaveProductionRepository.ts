import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import {
  SupabaseWaveInfraAdapter,
  type WaveAuthoritativeResult,
  type WaveEventCursor,
  type WaveInfraAdapter,
  type WaveRecoveryBundle,
} from "../wave-infra";
import { parseServerResult } from "../wave-infra/validators";
import type {
  CastWaveClosingVoteInput,
  FinalizeWaveClosingVoteInput,
  CastWaveVoteInput,
  FinalizeWaveVoteInput,
  InitializeWaveProductionInput,
  MissingWaveCommandInput,
  PrivateAuditionInput,
  StartWaveClosingVoteInput,
  StartWaveVoteInput,
  WaveCategoryAvailabilityInput,
  WaveProductionRepository,
  WaveSubmissionDecisionInput,
} from "./contracts";
import {
  invalidProductionInput,
  invalidProductionResponse,
  productionBackendFailure,
  productionNotConfigured,
} from "./errors";
import {
  parseCastWaveClosingVoteResult,
  parseCastWaveVoteResult,
  parseFinalizeWaveClosingVoteResult,
  parseFinalizeWaveVoteResult,
  parseLaunchWaveProductionResult,
  parsePrivateAuditionResult,
  parseStartWaveClosingVoteResult,
  parseStartWaveVoteResult,
  parseWaveCategoryAvailabilityResult,
  parseWaveProductionSnapshot,
  parseWaveSessionLookup,
  parseWaveSubmissionDecisionResult,
} from "./parsers";

export const WAVE_PRODUCTION_CONTRACT = {
  resolveSessionRpc: "rooms_get_wave_session_for_room_v5",
  // V5 returns the full production snapshot to the master and a sanitized
  // projection to members. This strict parser intentionally represents the
  // master control surface; audience consumers use recover()'s opaque state.
  getSnapshotRpc: "rooms_get_wave_snapshot_v5",
  initializeRpc: "rooms_initialize_wave_production_v3",
  startVoteRpc: "rooms_start_wave_vote_v3",
  castVoteRpc: "rooms_cast_wave_vote_v3",
  finalizeVoteRpc: "rooms_finalize_wave_vote_v3",
  privateAuditionRpc: "rooms_wave_request_private_audition_v4",
  launchRpc: "rooms_launch_wave_production_v5",
  categoryAvailabilityRpc: "rooms_set_wave_category_open_v5",
  reviewSubmissionRpc: "rooms_review_wave_submission_v5",
  rejectSubmissionRpc: "rooms_reject_wave_submission_v5",
  requestCorrectionRpc: "rooms_request_wave_submission_correction_v5",
  markReadyForVoteRpc: "rooms_mark_wave_submission_ready_for_vote_v5",
  startClosingVoteRpc: "rooms_start_wave_closing_vote_v5",
  castClosingVoteRpc: "rooms_cast_wave_closing_vote_v5",
  finalizeClosingVoteRpc: "rooms_finalize_wave_closing_vote_v5",
} as const;

/** Kept for compatibility with older diagnostics; V5 now exposes every command. */
export const MISSING_WAVE_PRODUCTION_RPCS: readonly string[] = [];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{7,159}$/u;
const CATEGORY_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/u;
const TIME_SIGNATURE_PATTERN = /^[1-9][0-9]?\/[124816]$/u;

type RpcResponse = { data: unknown; error: unknown };

function assertUuid(operation: string, field: string, value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidProductionInput(operation, `${field} doit être un UUID valide.`);
}

function assertIdempotencyKey(operation: string, value: string) {
  if (!IDEMPOTENCY_PATTERN.test(value)) {
    throw invalidProductionInput(operation, "La clé d'idempotence doit contenir entre 8 et 160 caractères sûrs.");
  }
}

function assertInteger(operation: string, field: string, value: number, min: number, max: number) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw invalidProductionInput(operation, `${field} est hors limites.`);
  }
}

function assertMissingCommand(input: MissingWaveCommandInput, operation: string) {
  assertUuid(operation, "sessionId", input.sessionId);
  assertIdempotencyKey(operation, input.idempotencyKey);
}

function assertInitialize(input: InitializeWaveProductionInput) {
  const operation = "wave.production.initialize";
  assertUuid(operation, "roomId", input.roomId);
  assertIdempotencyKey(operation, input.idempotencyKey);
  if (!Number.isFinite(input.bpm) || input.bpm < 20 || input.bpm > 400) throw invalidProductionInput(operation, "Le BPM doit être compris entre 20 et 400.");
  if (!input.musicalKey.trim() || input.musicalKey.length > 24) throw invalidProductionInput(operation, "La tonalité est invalide.");
  if (!TIME_SIGNATURE_PATTERN.test(input.timeSignature)) throw invalidProductionInput(operation, "La signature rythmique est invalide.");
  if (!(["DRY", "PROCESSED", "EITHER"] as const).includes(input.effectsPolicy)) throw invalidProductionInput(operation, "La politique d'effets est invalide.");
  assertInteger(operation, "expectedBars", input.expectedBars, 1, 256);
  assertInteger(operation, "maxDurationMs", input.maxDurationMs, 250, 900_000);
  if (input.acceptedMimeTypes.length < 1 || input.acceptedMimeTypes.length > 16 || input.acceptedMimeTypes.some((type) => !type.startsWith("audio/"))) {
    throw invalidProductionInput(operation, "Les formats audio acceptés sont invalides.");
  }
  if (input.desiredLoopTypes.length < 1 || input.desiredLoopTypes.length > 32 || input.desiredLoopTypes.some((type) => !type.trim())) {
    throw invalidProductionInput(operation, "Les besoins artistiques sont invalides.");
  }
  if (input.categories.length < 1 || input.categories.length > 64) throw invalidProductionInput(operation, "Au moins une catégorie est requise.");
  const codes = new Set<string>();
  const positions = new Set<number>();
  input.categories.forEach((category, index) => {
    const code = category.code.trim().toLowerCase();
    const position = category.position ?? index;
    if (!CATEGORY_CODE_PATTERN.test(code) || codes.has(code)) throw invalidProductionInput(operation, "Les codes de catégorie doivent être uniques et normalisés.");
    if (!category.label.trim() || category.label.length > 80) throw invalidProductionInput(operation, "Le libellé d'une catégorie est invalide.");
    assertInteger(operation, "category.position", position, 0, 63);
    assertInteger(operation, "category.minSlots", category.minSlots ?? 0, 0, 32);
    assertInteger(operation, "category.maxSlots", category.maxSlots, 1, 32);
    if ((category.minSlots ?? 0) > category.maxSlots || positions.has(position)) throw invalidProductionInput(operation, "La configuration des slots de catégorie est invalide.");
    codes.add(code);
    positions.add(position);
  });
}

function assertStartVote(input: StartWaveVoteInput) {
  const operation = "wave.vote.start";
  assertUuid(operation, "sessionId", input.sessionId);
  assertUuid(operation, "candidateVersionId", input.candidateVersionId);
  assertUuid(operation, "targetSlotId", input.targetSlotId);
  assertUuid(operation, "referenceBeatRevisionId", input.referenceBeatRevisionId);
  if (input.replacesTrackId) assertUuid(operation, "replacesTrackId", input.replacesTrackId);
  assertIdempotencyKey(operation, input.idempotencyKey);
  if (input.kind !== "ADMISSION" && input.kind !== "REPLACEMENT") throw invalidProductionInput(operation, "Le type de vote est invalide.");
  assertInteger(operation, "listenSeconds", input.listenSeconds, 1, 900);
  assertInteger(operation, "voteSeconds", input.voteSeconds, 5, 900);
  assertInteger(operation, "quorum", input.quorum, 1, Number.MAX_SAFE_INTEGER);
  if (!Number.isFinite(input.approvalThreshold) || input.approvalThreshold <= 0.5 || input.approvalThreshold > 1) {
    throw invalidProductionInput(operation, "Le seuil d'approbation doit être strictement supérieur à 50 %.");
  }
  if (input.kind === "ADMISSION" && input.replacesTrackId) throw invalidProductionInput(operation, "Une admission ne remplace aucune piste.");
  if (input.kind === "REPLACEMENT" && !input.replacesTrackId) throw invalidProductionInput(operation, "Une piste remplacée est obligatoire pour un vote de remplacement.");
}

function initializeRules(input: InitializeWaveProductionInput) {
  return {
    bpm: input.bpm,
    musicalKey: input.musicalKey.trim(),
    timeSignature: input.timeSignature,
    expectedBars: input.expectedBars,
    maxDurationMs: input.maxDurationMs,
    acceptedMimeTypes: [...input.acceptedMimeTypes],
    desiredLoopTypes: [...input.desiredLoopTypes],
    effectsPolicy: input.effectsPolicy,
    recommendedLufs: input.recommendedLufs ?? null,
    categories: input.categories.map((category, index) => ({
      code: category.code.trim().toLowerCase(),
      label: category.label.trim(),
      position: category.position ?? index,
      minSlots: category.minSlots ?? 0,
      maxSlots: category.maxSlots,
      required: category.required ?? false,
    })),
  };
}

export class SupabaseWaveProductionRepository implements WaveProductionRepository {
  private readonly infra: WaveInfraAdapter;

  constructor(
    private readonly client: SupabaseClient = supabase,
    infra?: WaveInfraAdapter,
  ) {
    this.infra = infra ?? new SupabaseWaveInfraAdapter(client);
  }

  async resolveSessionForRoom(roomId: string) {
    const operation = "wave.production.resolve_session";
    assertUuid(operation, "roomId", roomId);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.resolveSessionRpc, { p_room_id: roomId }, operation);
    const result = parseWaveSessionLookup(operation, response);
    if (result.roomId !== roomId) throw invalidProductionResponse(operation);
    return result;
  }

  async getSnapshot(sessionId: string) {
    const operation = "wave.production.snapshot";
    assertUuid(operation, "sessionId", sessionId);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.getSnapshotRpc, { p_session_id: sessionId }, operation);
    return parseWaveProductionSnapshot(operation, response);
  }

  async recover(sessionId: string, cursor?: WaveEventCursor): Promise<WaveAuthoritativeResult<WaveRecoveryBundle>> {
    const operation = "wave.production.recover";
    assertUuid(operation, "sessionId", sessionId);
    if (cursor && (cursor.waveId !== sessionId || !Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0)) {
      throw invalidProductionInput(operation, "Le curseur ne correspond pas à cette Wave.");
    }
    const result = await this.infra.recover(sessionId, cursor);
    if (result.authority !== "SERVER_CONFIRMED") throw productionNotConfigured(operation, "La récupération autoritaire n'est pas configurée.");
    if (result.data.snapshot.waveId !== sessionId) throw invalidProductionResponse(operation);
    return result;
  }

  async initialize(input: InitializeWaveProductionInput) {
    const operation = "wave.production.initialize";
    assertInitialize(input);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.initializeRpc, {
      p_room_id: input.roomId,
      p_rules: initializeRules(input),
      p_idempotency_key: input.idempotencyKey,
    }, operation);
    return parseWaveProductionSnapshot(operation, response);
  }

  async launch(input: MissingWaveCommandInput) {
    const operation = "wave.production.launch";
    assertMissingCommand(input, operation);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.launchRpc, {
      p_session_id: input.sessionId,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    const result = parseServerResult(operation, response, parseLaunchWaveProductionResult);
    if (result.data.waveId !== input.sessionId) throw invalidProductionResponse(operation);
    return result;
  }

  async setCategoryAvailability(input: WaveCategoryAvailabilityInput) {
    const operation = "wave.category.availability";
    assertMissingCommand(input, operation);
    assertUuid(operation, "categoryId", input.categoryId);
    if (typeof input.open !== "boolean") throw invalidProductionInput(operation, "L'état de la catégorie est invalide.");
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.categoryAvailabilityRpc, {
      p_session_id: input.sessionId,
      p_category_id: input.categoryId,
      p_open: input.open,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    const result = parseServerResult(operation, response, parseWaveCategoryAvailabilityResult);
    if (result.data.categoryId !== input.categoryId || result.data.open !== input.open) throw invalidProductionResponse(operation);
    return result;
  }

  async reviewSubmission(input: WaveSubmissionDecisionInput) {
    return this.submissionDecision("wave.submission.review", WAVE_PRODUCTION_CONTRACT.reviewSubmissionRpc, input, "NEEDS_REVIEW");
  }

  async rejectSubmission(input: WaveSubmissionDecisionInput) {
    const operation = "wave.submission.reject";
    if (!input.reason?.trim()) throw invalidProductionInput(operation, "Un motif de refus est obligatoire.");
    return this.submissionDecision(operation, WAVE_PRODUCTION_CONTRACT.rejectSubmissionRpc, input, "REJECTED", true);
  }

  async requestCorrection(input: WaveSubmissionDecisionInput) {
    const operation = "wave.submission.correction";
    if (!input.reason?.trim()) throw invalidProductionInput(operation, "Un motif de correction est obligatoire.");
    return this.submissionDecision(operation, WAVE_PRODUCTION_CONTRACT.requestCorrectionRpc, input, "NEEDS_CORRECTION", true);
  }

  async markReadyForVote(input: WaveSubmissionDecisionInput) {
    return this.submissionDecision("wave.submission.ready_for_vote", WAVE_PRODUCTION_CONTRACT.markReadyForVoteRpc, input, "READY_FOR_VOTE");
  }

  async requestPrivateAudition(input: PrivateAuditionInput) {
    const operation = "wave.private_audition.request";
    assertUuid(operation, "sessionId", input.sessionId);
    assertUuid(operation, "candidateVersionId", input.candidateVersionId);
    assertUuid(operation, "referenceBeatRevisionId", input.referenceBeatRevisionId);
    if (input.mode !== "SOLO" && input.mode !== "WITH_BEAT") throw invalidProductionInput(operation, "Le mode d'écoute privée est invalide.");
    if (!input.correlationId.trim() || input.correlationId.length > 256) throw invalidProductionInput(operation, "Le correlationId est invalide.");
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.privateAuditionRpc, {
      p_session_id: input.sessionId,
      p_candidate_version_id: input.candidateVersionId,
      p_reference_beat_revision_id: input.referenceBeatRevisionId,
      p_mode: input.mode,
      p_render_available: input.renderAvailable,
      p_correlation_id: input.correlationId,
    }, operation);
    const result = parsePrivateAuditionResult(operation, response);
    if (result.waveId !== input.sessionId || result.candidateVersionId !== input.candidateVersionId || result.referenceBeatRevisionId !== input.referenceBeatRevisionId) {
      throw invalidProductionResponse(operation);
    }
    if (result.state === "NOT_CONFIGURED") throw productionNotConfigured(operation, "Le moteur de rendu privé Beat + candidate n'est pas configuré.");
    return result;
  }

  async startVote(input: StartWaveVoteInput) {
    const operation = "wave.vote.start";
    assertStartVote(input);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.startVoteRpc, {
      p_session_id: input.sessionId,
      p_kind: input.kind,
      p_candidate_version_id: input.candidateVersionId,
      p_target_slot_id: input.targetSlotId,
      p_replaces_track_id: input.replacesTrackId ?? null,
      p_reference_revision_id: input.referenceBeatRevisionId,
      p_listen_seconds: input.listenSeconds,
      p_vote_seconds: input.voteSeconds,
      p_quorum: input.quorum,
      p_approval_threshold: input.approvalThreshold,
      p_idempotency_key: input.idempotencyKey,
    }, operation);
    const result = parseStartWaveVoteResult(operation, response);
    if (result.candidateVersionId !== input.candidateVersionId || result.referenceBeatRevisionId !== input.referenceBeatRevisionId || result.kind !== input.kind) {
      throw invalidProductionResponse(operation);
    }
    return result;
  }

  async castVote(input: CastWaveVoteInput) {
    const operation = "wave.vote.cast";
    assertUuid(operation, "roundId", input.roundId);
    assertIdempotencyKey(operation, input.idempotencyKey);
    if (input.choice !== "APPROVE" && input.choice !== "CONTINUE") throw invalidProductionInput(operation, "Le choix de vote est invalide.");
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.castVoteRpc, {
      p_round_id: input.roundId,
      p_choice: input.choice,
      p_idempotency_key: input.idempotencyKey,
    }, operation);
    const result = parseCastWaveVoteResult(operation, response);
    if (result.roundId !== input.roundId) throw invalidProductionResponse(operation);
    return result;
  }

  async finalizeVote(input: FinalizeWaveVoteInput) {
    const operation = "wave.vote.finalize";
    assertUuid(operation, "roundId", input.roundId);
    assertIdempotencyKey(operation, input.idempotencyKey);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.finalizeVoteRpc, {
      p_round_id: input.roundId,
      p_idempotency_key: input.idempotencyKey,
    }, operation);
    const result = parseFinalizeWaveVoteResult(operation, response);
    if (result.roundId !== input.roundId || result.approveCount + result.continueCount !== result.totalVotes) throw invalidProductionResponse(operation);
    return result;
  }

  async startClosingVote(input: StartWaveClosingVoteInput) {
    const operation = "wave.closing_vote.start";
    assertMissingCommand(input, operation);
    assertUuid(operation, "previewAssetId", input.previewAssetId);
    assertInteger(operation, "listenSeconds", input.listenSeconds, 1, 900);
    assertInteger(operation, "voteSeconds", input.voteSeconds, 5, 900);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.startClosingVoteRpc, {
      p_session_id: input.sessionId,
      p_preview_asset_id: input.previewAssetId,
      p_listen_seconds: input.listenSeconds,
      p_vote_seconds: input.voteSeconds,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    return parseServerResult(operation, response, parseStartWaveClosingVoteResult);
  }

  async castClosingVote(input: CastWaveClosingVoteInput) {
    const operation = "wave.closing_vote.cast";
    assertUuid(operation, "closingVoteId", input.closingVoteId);
    assertIdempotencyKey(operation, input.idempotencyKey);
    if (input.choice !== "APPROVE" && input.choice !== "CONTINUE") throw invalidProductionInput(operation, "Le choix de clôture est invalide.");
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.castClosingVoteRpc, {
      p_closing_vote_id: input.closingVoteId,
      p_choice: input.choice,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    const result = parseServerResult(operation, response, parseCastWaveClosingVoteResult);
    if (result.data.closingVoteId !== input.closingVoteId) throw invalidProductionResponse(operation);
    return result;
  }

  async finalizeClosingVote(input: FinalizeWaveClosingVoteInput) {
    const operation = "wave.closing_vote.finalize";
    assertUuid(operation, "closingVoteId", input.closingVoteId);
    assertIdempotencyKey(operation, input.idempotencyKey);
    const response = await this.rpc(WAVE_PRODUCTION_CONTRACT.finalizeClosingVoteRpc, {
      p_closing_vote_id: input.closingVoteId,
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    const result = parseServerResult(operation, response, parseFinalizeWaveClosingVoteResult);
    if (result.data.closingVoteId !== input.closingVoteId) throw invalidProductionResponse(operation);
    return result;
  }

  async switchProgramAudio(command: Parameters<WaveProductionRepository["switchProgramAudio"]>[0]) {
    const operation = "wave.program_audio.switch";
    const result = await this.infra.switchProgramAudio(command);
    if (result.authority !== "SERVER_CONFIRMED") throw productionNotConfigured(operation, "Le routage audio programme autoritaire n'est pas configuré.");
    if (result.data.waveId !== command.waveId) throw invalidProductionResponse(operation);
    return result;
  }

  private async rpc(name: string, args: Record<string, unknown>, operation: string) {
    const result = await this.client.rpc(name, args) as RpcResponse;
    if (result.error) throw productionBackendFailure(operation, result.error);
    if (result.data === null || result.data === undefined) throw invalidProductionResponse(operation);
    return result.data;
  }

  private async submissionDecision(
    operation: string,
    rpcName: string,
    input: WaveSubmissionDecisionInput,
    expectedStatus: "NEEDS_REVIEW" | "NEEDS_CORRECTION" | "READY_FOR_VOTE" | "REJECTED",
    includeReason = false,
  ) {
    assertMissingCommand(input, operation);
    assertUuid(operation, "submissionId", input.submissionId);
    const response = await this.rpc(rpcName, {
      p_session_id: input.sessionId,
      p_submission_id: input.submissionId,
      ...(includeReason ? { p_reason: input.reason?.trim() ?? null } : {}),
      p_idempotency_key: input.idempotencyKey,
      p_correlation_id: input.idempotencyKey,
    }, operation);
    const result = parseServerResult(operation, response, parseWaveSubmissionDecisionResult);
    if (result.data.submissionId !== input.submissionId || result.data.status !== expectedStatus) throw invalidProductionResponse(operation);
    return result;
  }
}

export function createWaveProductionRepository(
  client: SupabaseClient = supabase,
  infra?: WaveInfraAdapter,
): WaveProductionRepository {
  return new SupabaseWaveProductionRepository(client, infra);
}

export const waveProductionRepository: WaveProductionRepository = createWaveProductionRepository();
