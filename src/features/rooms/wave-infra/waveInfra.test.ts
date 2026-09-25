import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { ingestWaveAsset } from "./assetPipeline";
import { WaveEventSequencer } from "./eventSequencer";
import { LocalOnlyWaveInfraAdapter } from "./localWaveInfra";
import { SupabaseWaveInfraAdapter, WAVE_INFRA_CONTRACT } from "./supabaseWaveInfra";
import type { WaveRealtimeEvent } from "./contracts";

const WAVE_ID = "9a8d7c6b-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const BEAT_REVISION_ID = "8a7d6c5b-4e3f-4a2b-8c1d-0e9f8a7b6c5d";
const UPLOAD_ID = "7a6d5c4b-3e2f-4a1b-8c0d-9e8f7a6b5c4d";
const ASSET_ID = "6a5d4c3b-2e1f-4a0b-8c9d-8e7f6a5b4c3d";
const IDEMPOTENCY_KEY = "wave-command:01J7EXAMPLE123456789";
const CORRELATION_ID = "correlation:server:01J7EXAMPLE";

function confirmed<T>(data: T) {
  return { data, correlationId: CORRELATION_ID };
}

function programAudioState() {
  return {
    waveId: WAVE_ID,
    source: "SERVER_RENDER",
    beatRevisionId: BEAT_REVISION_ID,
    musicalPositionBeats: 32,
    changedAt: "2026-08-22T16:00:00.000Z",
    changedBy: "host-1",
    sequence: 18,
    transitionMs: 120,
  };
}

function processingStatus() {
  return {
    waveId: WAVE_ID,
    uploadId: UPLOAD_ID,
    assetId: ASSET_ID,
    state: "PROCESSING",
    progressPercent: 12,
    analysisId: null,
    previewAssetId: null,
    waveformAssetId: null,
    failureCode: null,
    updatedAt: "2026-08-22T16:01:00.000Z",
  };
}

function mockClient(options: {
  rpc?: ReturnType<typeof vi.fn>;
  invoke?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    rpc: options.rpc ?? vi.fn(),
    functions: { invoke: options.invoke ?? vi.fn() },
  } as unknown as SupabaseClient;
}

describe("SupabaseWaveInfraAdapter", () => {
  it("projette SILENCE comme état fail-safe sans le rendre sélectionnable", async () => {
    const silent = {
      ...programAudioState(),
      source: "SILENCE",
      beatRevisionId: null,
      changedBy: null,
      sequence: 1,
    };
    const rpc = vi.fn().mockResolvedValue({
      data: confirmed({
        snapshot: {
          schemaVersion: 1,
          waveId: WAVE_ID,
          roomId: WAVE_ID,
          sequence: 1,
          generatedAt: silent.changedAt,
          programAudio: silent,
          permissions: ["wave.listen"],
          state: { status: "PREPARING" },
        },
        events: [],
        cursor: { waveId: WAVE_ID, sequence: 1, eventId: null },
      }),
      error: null,
    });
    const adapter = new SupabaseWaveInfraAdapter(mockClient({ rpc }));

    const result = await adapter.recover(WAVE_ID);

    expect(result.data.snapshot.programAudio.source).toBe("SILENCE");
  });

  it("commute atomiquement la source audio avec séquence et clé d'idempotence", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: confirmed(programAudioState()), error: null });
    const adapter = new SupabaseWaveInfraAdapter(mockClient({ rpc }));

    const result = await adapter.switchProgramAudio({
      waveId: WAVE_ID,
      source: "SERVER_RENDER",
      expectedSequence: 17,
      idempotencyKey: IDEMPOTENCY_KEY,
      beatRevisionId: BEAT_REVISION_ID,
      musicalPositionBeats: 32,
    });

    expect(result.authority).toBe("SERVER_CONFIRMED");
    expect(result.data).toEqual(programAudioState());
    expect(rpc).toHaveBeenCalledWith(WAVE_INFRA_CONTRACT.programAudioRpc, expect.objectContaining({
      p_wave_id: WAVE_ID,
      p_source: "SERVER_RENDER",
      p_expected_sequence: 17,
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_beat_revision_id: BEAT_REVISION_ID,
    }));
  });

  it("échoue explicitement en production quand le contrat serveur manque", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function rooms_wave_recover_v1 in the schema cache" },
    });
    const adapter = new SupabaseWaveInfraAdapter(mockClient({ rpc }));

    await expect(adapter.recover(WAVE_ID)).rejects.toMatchObject({
      code: "CONTRACT_MISSING",
      operation: "wave.realtime.recover",
      retryable: false,
    });
  });

  it("récupère un snapshot durable et les événements contigus après reconnexion", async () => {
    const nextEvent = {
      id: "event-19",
      waveId: WAVE_ID,
      sequence: 19,
      type: "program_audio.changed",
      actorId: "host-1",
      correlationId: "correlation-event-19",
      occurredAt: "2026-08-22T16:00:01.000Z",
      payload: { source: "SERVER_RENDER" },
    };
    const rpc = vi.fn().mockResolvedValue({
      data: confirmed({
        snapshot: {
          schemaVersion: 1,
          waveId: WAVE_ID,
          roomId: WAVE_ID,
          sequence: 18,
          generatedAt: "2026-08-22T16:00:00.000Z",
          programAudio: programAudioState(),
          permissions: ["wave.listen", "wave.vote"],
          state: { status: "LIVE" },
        },
        events: [nextEvent],
        cursor: { waveId: WAVE_ID, sequence: 19, eventId: "event-19" },
      }),
      error: null,
    });
    const adapter = new SupabaseWaveInfraAdapter(mockClient({ rpc }));

    const result = await adapter.recover(WAVE_ID, { waveId: WAVE_ID, sequence: 17, eventId: "event-17" });

    expect(result.data.snapshot.sequence).toBe(18);
    expect(result.data.events).toEqual([expect.objectContaining({ id: "event-19", sequence: 19 })]);
    expect(result.data.cursor).toEqual({ waveId: WAVE_ID, sequence: 19, eventId: "event-19" });
    expect(rpc).toHaveBeenCalledWith(WAVE_INFRA_CONTRACT.recoveryRpc, expect.objectContaining({
      p_wave_id: WAVE_ID,
      p_after_sequence: 17,
      p_after_event_id: "event-17",
    }));
  });

  it("orchestre ticket signé, upload direct sans cookies, confirmation puis processing", async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({
        data: confirmed({
          uploadId: UPLOAD_ID,
          assetId: ASSET_ID,
          objectKey: `${WAVE_ID}/${ASSET_ID}/original.wav`,
          uploadUrl: "https://storage.example.test/signed/upload",
          method: "PUT",
          headers: { "content-type": "audio/wav", "x-upload-token": "signed" },
          expiresAt: "2099-08-22T16:00:00.000Z",
          maxBytes: 10_000,
          resumable: true,
        }),
        error: null,
      })
      .mockResolvedValueOnce({ data: confirmed(processingStatus()), error: null })
      .mockResolvedValueOnce({ data: confirmed({ ...processingStatus(), progressPercent: 65 }), error: null });
    const uploadFetch = vi.fn().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { etag: "asset-etag" },
    }));
    const adapter = new SupabaseWaveInfraAdapter(mockClient({ invoke }), uploadFetch);
    const sha256 = "a".repeat(64);

    const ingestion = await ingestWaveAsset(adapter, {
      waveId: WAVE_ID,
      purpose: "LOOP_ORIGINAL",
      category: "drums",
      fileName: "drums.wav",
      byteSize: 4,
      claimedMimeType: "audio/wav",
      sha256,
      terms: { termsVersion: "wave-contribution-2026-08", acceptedAt: "2026-08-22T16:00:00.000Z" },
      idempotencyKey: IDEMPOTENCY_KEY,
    }, new Blob(["beat"], { type: "audio/wav" }));
    const polled = await adapter.getAssetProcessingStatus(WAVE_ID, ASSET_ID);

    expect(uploadFetch).toHaveBeenCalledWith(ingestion.ticket.data.uploadUrl, expect.objectContaining({
      method: "PUT",
      credentials: "omit",
      redirect: "error",
    }));
    expect(ingestion.receipt).toEqual({ eTag: "asset-etag", byteSize: 4 });
    expect(ingestion.processing.data.state).toBe("PROCESSING");
    expect(polled.data.progressPercent).toBe(65);
    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      WAVE_INFRA_CONTRACT.uploadTicketFunction,
      WAVE_INFRA_CONTRACT.uploadConfirmFunction,
      WAVE_INFRA_CONTRACT.processingStatusFunction,
    ]);
  });

  it("refuse d'annoncer un upload réussi lorsque le stockage le rejette", async () => {
    const uploadFetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    const adapter = new SupabaseWaveInfraAdapter(mockClient(), uploadFetch);

    await expect(adapter.uploadAsset({
      uploadId: UPLOAD_ID,
      assetId: ASSET_ID,
      objectKey: "private/original.wav",
      uploadUrl: "https://storage.example.test/signed/upload",
      method: "PUT",
      headers: {},
      expiresAt: "2099-08-22T16:00:00.000Z",
      maxBytes: 10,
      resumable: false,
    }, new Blob(["beat"]))).rejects.toMatchObject({
      code: "DIRECT_UPLOAD_FAILED",
      retryable: true,
    });
  });
});

describe("WaveEventSequencer", () => {
  const event = (sequence: number): WaveRealtimeEvent => ({
    id: `event-${sequence}`,
    waveId: WAVE_ID,
    sequence,
    type: "wave.updated",
    actorId: null,
    correlationId: `correlation-${sequence}`,
    occurredAt: "2026-08-22T16:00:00.000Z",
    payload: {},
  });

  it("applique l'ordre, ignore les doublons et bloque sur un trou de séquence", () => {
    const sequencer = new WaveEventSequencer(WAVE_ID);

    expect(sequencer.inspect(event(1)).kind).toBe("apply");
    expect(sequencer.inspect(event(1)).kind).toBe("duplicate");
    expect(sequencer.inspect(event(3))).toEqual(expect.objectContaining({
      kind: "gap",
      expectedSequence: 2,
      receivedSequence: 3,
    }));
    expect(sequencer.current().sequence).toBe(1);
  });
});

describe("LocalOnlyWaveInfraAdapter", () => {
  it("marque le mode local et ne simule jamais les opérations critiques", async () => {
    const adapter = new LocalOnlyWaveInfraAdapter();
    const health = await adapter.getHealth();

    expect(health.authority).toBe("LOCAL_ONLY");
    expect(health.data.productionReady).toBe(false);
    expect(health.data.services.every((service) => service.status === "local_only")).toBe(true);
    await expect(adapter.switchProgramAudio({
      waveId: WAVE_ID,
      source: "HOST_DAW",
      expectedSequence: 0,
      idempotencyKey: IDEMPOTENCY_KEY,
    })).rejects.toMatchObject({ code: "LOCAL_ONLY_UNAVAILABLE" });
  });
});
