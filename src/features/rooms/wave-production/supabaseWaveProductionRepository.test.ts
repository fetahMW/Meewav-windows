import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type {
  ProgramAudioState,
  WaveAuthoritativeResult,
  WaveInfraAdapter,
  WaveRecoveryBundle,
} from "../wave-infra";
import { WaveProductionError } from "./errors";
import {
  SupabaseWaveProductionRepository,
  WAVE_PRODUCTION_CONTRACT,
} from "./supabaseWaveProductionRepository";

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ROOM_ID = id(1);
const SESSION_ID = id(2);
const CATEGORY_ID = id(3);
const SLOT_ID = id(4);
const SUBMISSION_ID = id(5);
const CONTRIBUTOR_ID = id(6);
const VERSION_ID = id(7);
const ASSET_ID = id(8);
const BEAT_ID = id(9);
const TRACK_ID = id(10);
const ROUND_ID = id(11);
const ACTIVATION_ID = id(12);
const CLOSING_VOTE_ID = id(13);

const snapshot = {
  session: {
    id: SESSION_ID,
    roomId: ROOM_ID,
    status: "READY",
    rulesVersion: 1,
    bpm: 128,
    musicalKey: "F minor",
    timeSignature: "4/4",
    expectedBars: 8,
    maxDurationMs: 30_000,
    acceptedMimeTypes: ["audio/wav"],
    desiredLoopTypes: ["bass"],
    effectsPolicy: "EITHER",
    recommendedLufs: -14,
    rulesLockedAt: "2026-08-23T08:00:00.000Z",
    cursor: 2,
  },
  categories: [{
    id: CATEGORY_ID,
    code: "bass",
    label: "Basse",
    position: 0,
    minSlots: 0,
    maxSlots: 1,
    required: false,
    slots: [{ id: SLOT_ID, index: 0, label: "Basse 1", state: "OPEN", acceptedVersionId: null }],
  }],
  submissions: [{
    id: SUBMISSION_ID,
    categoryId: CATEGORY_ID,
    requestedSlotId: SLOT_ID,
    contributorId: CONTRIBUTOR_ID,
    creditName: "Naya",
    title: "Bass clean",
    status: "READY_FOR_VOTE",
    statusReason: null,
    currentVersionNumber: 1,
    submittedAt: "2026-08-23T08:01:00.000Z",
    versions: [{
      id: VERSION_ID,
      versionNumber: 1,
      assetId: ASSET_ID,
      supersedesVersionId: null,
      declaredBpm: 128,
      declaredKey: "F minor",
      declaredBars: 8,
      analysis: {
        compatibility: "COMPATIBLE",
        estimatedBpm: 128,
        estimatedKey: "F minor",
        estimatedBars: 8,
        sampleRate: 48_000,
        bitDepth: 24,
        channels: 2,
        loudnessLufs: -14,
        peakDbfs: -1,
        clipped: false,
        excessiveSilence: false,
        corrupt: false,
        analyzedAt: "2026-08-23T08:02:00.000Z",
      },
      createdAt: "2026-08-23T08:01:00.000Z",
    }],
  }],
  beat: {
    id: BEAT_ID,
    revisionNumber: 1,
    parentRevisionId: null,
    reason: "INITIAL",
    renderAssetId: null,
    renderStatus: "IDLE",
    tracks: [{
      id: TRACK_ID,
      categoryId: null,
      slotId: null,
      loopVersionId: VERSION_ID,
      position: 0,
      gain: 1,
      muted: false,
      isHostBase: true,
      creditName: "Host",
      contributorId: CONTRIBUTOR_ID,
    }],
    createdAt: "2026-08-23T08:00:00.000Z",
  },
  vote: null,
  programAudio: {
    source: "HOST_DAW",
    sourceRevisionId: null,
    sourceAssetId: null,
    sourceRtcPublicationId: "host-daw:room",
    renderStatus: "IDLE",
    generation: 1,
    changedAt: "2026-08-23T08:00:00.000Z",
  },
};

function clientWith(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as unknown as SupabaseClient;
}

function authoritative<T>(data: T): WaveAuthoritativeResult<T> {
  return { authority: "SERVER_CONFIRMED", correlationId: "correlation-123456", data };
}

function infraFixture(overrides: Partial<WaveInfraAdapter> = {}): WaveInfraAdapter {
  return {
    mode: "production",
    getHealth: vi.fn(),
    switchProgramAudio: vi.fn(),
    recover: vi.fn(),
    subscribe: vi.fn(),
    requestAssetUploadTicket: vi.fn(),
    uploadAsset: vi.fn(),
    confirmAssetUpload: vi.fn(),
    getAssetProcessingStatus: vi.fn(),
    ...overrides,
  } as unknown as WaveInfraAdapter;
}

describe("SupabaseWaveProductionRepository", () => {
  it("resolves the normalized Wave session from the live Room without guessing ids", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { sessionId: SESSION_ID, roomId: ROOM_ID, lifecycleState: "LIVE_ACTIVE", status: "LIVE" },
      error: null,
    });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.resolveSessionForRoom(ROOM_ID)).resolves.toEqual({
      sessionId: SESSION_ID,
      roomId: ROOM_ID,
      lifecycleState: "LIVE_ACTIVE",
      status: "LIVE",
    });
    expect(rpc).toHaveBeenCalledWith(WAVE_PRODUCTION_CONTRACT.resolveSessionRpc, { p_room_id: ROOM_ID });
  });

  it("strictly maps the normalized V3 snapshot", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.getSnapshot(SESSION_ID)).resolves.toEqual(expect.objectContaining({
      session: expect.objectContaining({ id: SESSION_ID, bpm: 128 }),
      categories: [expect.objectContaining({ code: "bass" })],
      submissions: [expect.objectContaining({ status: "READY_FOR_VOTE" })],
    }));
    expect(rpc).toHaveBeenCalledWith(WAVE_PRODUCTION_CONTRACT.getSnapshotRpc, { p_session_id: SESSION_ID });
  });

  it("normalizes and validates the launch-sequencer rules payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot, error: null });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await repository.initialize({
      roomId: ROOM_ID,
      bpm: 128,
      musicalKey: " F minor ",
      timeSignature: "4/4",
      expectedBars: 8,
      maxDurationMs: 30_000,
      acceptedMimeTypes: ["audio/wav"],
      desiredLoopTypes: ["bass"],
      effectsPolicy: "EITHER",
      recommendedLufs: -14,
      categories: [{ code: " BASS ", label: " Basse ", maxSlots: 1 }],
      idempotencyKey: "initialize-wave-0001",
    });

    expect(rpc).toHaveBeenCalledWith(WAVE_PRODUCTION_CONTRACT.initializeRpc, {
      p_room_id: ROOM_ID,
      p_rules: expect.objectContaining({
        musicalKey: "F minor",
        categories: [{ code: "bass", label: "Basse", position: 0, minSlots: 0, maxSlots: 1, required: false }],
      }),
      p_idempotency_key: "initialize-wave-0001",
    });
  });

  it("sends the exact locked admission vote payload", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        roundId: ROUND_ID,
        status: "LISTENING",
        kind: "ADMISSION",
        candidateVersionId: VERSION_ID,
        referenceBeatRevisionId: BEAT_ID,
        serverNow: "2026-08-23T08:05:00.000Z",
      },
      error: null,
    });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await repository.startVote({
      sessionId: SESSION_ID,
      kind: "ADMISSION",
      candidateVersionId: VERSION_ID,
      targetSlotId: SLOT_ID,
      referenceBeatRevisionId: BEAT_ID,
      listenSeconds: 15,
      voteSeconds: 30,
      quorum: 10,
      approvalThreshold: 0.6,
      idempotencyKey: "start-vote-0000001",
    });

    expect(rpc).toHaveBeenCalledWith(WAVE_PRODUCTION_CONTRACT.startVoteRpc, {
      p_session_id: SESSION_ID,
      p_kind: "ADMISSION",
      p_candidate_version_id: VERSION_ID,
      p_target_slot_id: SLOT_ID,
      p_replaces_track_id: null,
      p_reference_revision_id: BEAT_ID,
      p_listen_seconds: 15,
      p_vote_seconds: 30,
      p_quorum: 10,
      p_approval_threshold: 0.6,
      p_idempotency_key: "start-vote-0000001",
    });
  });

  it("maps cast and atomic finalization receipts", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { roundId: ROUND_ID, accepted: true, serverCastAt: "2026-08-23T08:06:00.000Z" }, error: null })
      .mockResolvedValueOnce({
        data: {
          roundId: ROUND_ID,
          approved: true,
          approveCount: 8,
          continueCount: 2,
          totalVotes: 10,
          beatRevisionId: BEAT_ID,
          activationId: ACTIVATION_ID,
          serverFinalizedAt: "2026-08-23T08:07:00.000Z",
        },
        error: null,
      });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.castVote({ roundId: ROUND_ID, choice: "APPROVE", idempotencyKey: "cast-vote-00000001" }))
      .resolves.toEqual(expect.objectContaining({ accepted: true }));
    await expect(repository.finalizeVote({ roundId: ROUND_ID, idempotencyKey: "finalize-vote-001" }))
      .resolves.toEqual(expect.objectContaining({ approved: true, activationId: ACTIVATION_ID }));
  });

  it("fails closed when the private Beat + candidate renderer is not configured", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        waveId: SESSION_ID,
        requestId: id(20),
        candidateVersionId: VERSION_ID,
        referenceBeatRevisionId: BEAT_ID,
        mode: "WITH_BEAT",
        state: "NOT_CONFIGURED",
        previewAssetId: null,
        updatedAt: "2026-08-23T08:08:00.000Z",
      },
      error: null,
    });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.requestPrivateAudition({
      sessionId: SESSION_ID,
      candidateVersionId: VERSION_ID,
      referenceBeatRevisionId: BEAT_ID,
      mode: "WITH_BEAT",
      renderAvailable: false,
      correlationId: "private-audition-001",
    })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("delegates recovery and program routing only when server-confirmed", async () => {
    const recovery = {
      snapshot: { schemaVersion: 1, waveId: SESSION_ID },
    } as unknown as WaveRecoveryBundle;
    const program = { waveId: SESSION_ID } as ProgramAudioState;
    const recover = vi.fn().mockResolvedValue(authoritative(recovery));
    const switchProgramAudio = vi.fn().mockResolvedValue(authoritative(program));
    const repository = new SupabaseWaveProductionRepository(clientWith(vi.fn()), infraFixture({ recover, switchProgramAudio }));

    await expect(repository.recover(SESSION_ID)).resolves.toEqual(authoritative(recovery));
    await expect(repository.switchProgramAudio({
      waveId: SESSION_ID,
      source: "HOST_DAW",
      expectedSequence: 1,
      idempotencyKey: "switch-program-0001",
    })).resolves.toEqual(authoritative(program));
  });

  it("maps the V5 artistic commands through authoritative envelopes", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { correlationId: "launch-wave-0001", data: { waveId: SESSION_ID, state: "LIVE_ACTIVE" } }, error: null })
      .mockResolvedValueOnce({ data: { correlationId: "category-open-001", data: { categoryId: CATEGORY_ID, open: true } }, error: null })
      .mockResolvedValueOnce({ data: { correlationId: "review-loop-0001", data: { submissionId: SUBMISSION_ID, status: "NEEDS_REVIEW" } }, error: null })
      .mockResolvedValueOnce({ data: { correlationId: "ready-vote-000001", data: { submissionId: SUBMISSION_ID, status: "READY_FOR_VOTE" } }, error: null });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.launch({ sessionId: SESSION_ID, idempotencyKey: "launch-wave-0001" }))
      .resolves.toMatchObject({ authority: "SERVER_CONFIRMED", data: { state: "LIVE_ACTIVE" } });
    await expect(repository.setCategoryAvailability({
      sessionId: SESSION_ID,
      categoryId: CATEGORY_ID,
      open: true,
      idempotencyKey: "category-open-001",
    })).resolves.toMatchObject({ data: { categoryId: CATEGORY_ID, open: true } });
    await expect(repository.reviewSubmission({
      sessionId: SESSION_ID,
      submissionId: SUBMISSION_ID,
      idempotencyKey: "review-loop-0001",
    })).resolves.toMatchObject({ data: { status: "NEEDS_REVIEW" } });
    await expect(repository.markReadyForVote({
      sessionId: SESSION_ID,
      submissionId: SUBMISSION_ID,
      idempotencyKey: "ready-vote-000001",
    })).resolves.toMatchObject({ data: { status: "READY_FOR_VOTE" } });
    expect(rpc).toHaveBeenNthCalledWith(1, WAVE_PRODUCTION_CONTRACT.launchRpc, expect.objectContaining({
      p_session_id: SESSION_ID,
      p_idempotency_key: "launch-wave-0001",
    }));
  });

  it("maps the complete server-authoritative closing vote lifecycle", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { correlationId: "closing-start-001", data: { closingVoteId: CLOSING_VOTE_ID, status: "LISTENING" } }, error: null })
      .mockResolvedValueOnce({ data: { correlationId: "closing-cast-0001", data: { closingVoteId: CLOSING_VOTE_ID, accepted: true } }, error: null })
      .mockResolvedValueOnce({ data: { correlationId: "closing-final-001", data: { closingVoteId: CLOSING_VOTE_ID, approved: true, finalBeatRevisionId: BEAT_ID } }, error: null });
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());

    await expect(repository.startClosingVote({
      sessionId: SESSION_ID,
      previewAssetId: ASSET_ID,
      listenSeconds: 20,
      voteSeconds: 45,
      idempotencyKey: "closing-start-001",
    })).resolves.toMatchObject({ data: { status: "LISTENING" } });
    await expect(repository.castClosingVote({
      closingVoteId: CLOSING_VOTE_ID,
      choice: "APPROVE",
      idempotencyKey: "closing-cast-0001",
    })).resolves.toMatchObject({ data: { accepted: true } });
    await expect(repository.finalizeClosingVote({
      closingVoteId: CLOSING_VOTE_ID,
      idempotencyKey: "closing-final-001",
    })).resolves.toMatchObject({ data: { approved: true, finalBeatRevisionId: BEAT_ID } });
  });

  it("maps a missing deployed RPC and rejects malformed snapshots", async () => {
    const missingRpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202", message: "function does not exist" } });
    const missingRepository = new SupabaseWaveProductionRepository(clientWith(missingRpc), infraFixture());
    await expect(missingRepository.getSnapshot(SESSION_ID)).rejects.toBeInstanceOf(WaveProductionError);
    await expect(missingRepository.getSnapshot(SESSION_ID)).rejects.toMatchObject({ code: "CONTRACT_MISSING" });

    const malformedRepository = new SupabaseWaveProductionRepository(
      clientWith(vi.fn().mockResolvedValue({ data: { ...snapshot, session: { ...snapshot.session, bpm: "128" } }, error: null })),
      infraFixture(),
    );
    await expect(malformedRepository.getSnapshot(SESSION_ID)).rejects.toMatchObject({ code: "INVALID_BACKEND_RESPONSE" });
  });

  it("rejects invalid vote payloads before any network call", async () => {
    const rpc = vi.fn();
    const repository = new SupabaseWaveProductionRepository(clientWith(rpc), infraFixture());
    await expect(repository.startVote({
      sessionId: SESSION_ID,
      kind: "REPLACEMENT",
      candidateVersionId: VERSION_ID,
      targetSlotId: SLOT_ID,
      referenceBeatRevisionId: BEAT_ID,
      listenSeconds: 0,
      voteSeconds: 30,
      quorum: 10,
      approvalThreshold: 0.5,
      idempotencyKey: "start-vote-0000002",
    })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
