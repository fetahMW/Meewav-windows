import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";
import type {
  ConfirmWaveAssetUpload,
  ProgramAudioState,
  RequestWaveAssetUpload,
  SwitchProgramAudioCommand,
  WaveAssetProcessingStatus,
  WaveAssetUploadReceipt,
  WaveAssetUploadTicket,
  WaveAuthoritativeResult,
  WaveEventCursor,
  WaveEventStream,
  WaveEventStreamHandlers,
  WaveInfraAdapter,
  WaveInfraHealth,
  WaveRealtimeEvent,
  WaveRecoveryBundle,
} from "./contracts";
import { backendFailure, invalidInput, invalidResponse, WaveInfraError } from "./errors";
import { WaveEventSequencer } from "./eventSequencer";
import {
  parseHealth,
  parseProcessingStatus,
  parseProgramAudioState,
  parseRecoveryBundle,
  parseServerResult,
  parseUploadTicket,
  parseWaveEvent,
} from "./validators";

export const WAVE_INFRA_CONTRACT = {
  // Browser/host path only records a quantized intent. The service-only v1
  // coordinator RPC applies it later with a lease + fencing epoch.
  programAudioRpc: "rooms_wave_request_program_audio_switch_v5",
  recoveryRpc: "rooms_wave_recover_v1",
  eventTable: "wave_event_v1",
  healthFunction: "rooms-wave-infra-health",
  uploadTicketFunction: "rooms-wave-asset-upload-ticket",
  uploadConfirmFunction: "rooms-wave-asset-upload-confirm",
  processingStatusFunction: "rooms-wave-asset-processing-status",
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{15,199}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
const CATEGORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,63}$/u;

type RpcResponse = { data: unknown; error: unknown };

function assertUuid(value: string, operation: string, field: string) {
  if (!UUID_PATTERN.test(value)) throw invalidInput(operation, `${field} doit être un UUID valide.`);
}

function assertIdempotencyKey(value: string, operation: string) {
  if (!IDEMPOTENCY_PATTERN.test(value)) throw invalidInput(operation, "La clé d'idempotence est absente ou invalide.");
}

function safeCorrelationId() {
  return crypto.randomUUID();
}

function edgeBody<T extends object>(input: T, correlationId: string) {
  return { ...input, correlationId };
}

export class SupabaseWaveInfraAdapter implements WaveInfraAdapter {
  readonly mode = "production" as const;

  constructor(
    private readonly client: SupabaseClient = supabase,
    private readonly directUploadFetch: typeof fetch = fetch,
  ) {}

  async getHealth(): Promise<WaveAuthoritativeResult<WaveInfraHealth>> {
    const operation = "wave.infra.health";
    const correlationId = safeCorrelationId();
    const { data, error } = await this.client.functions.invoke(WAVE_INFRA_CONTRACT.healthFunction, {
      body: { correlationId },
    });
    if (error) throw backendFailure(operation, error);
    return parseServerResult(operation, data, parseHealth);
  }

  async switchProgramAudio(command: SwitchProgramAudioCommand): Promise<WaveAuthoritativeResult<ProgramAudioState>> {
    const operation = "wave.program_audio.switch";
    assertUuid(command.waveId, operation, "waveId");
    assertIdempotencyKey(command.idempotencyKey, operation);
    if (!Number.isSafeInteger(command.expectedSequence) || command.expectedSequence < 1) {
      throw invalidInput(operation, "expectedSequence doit être un entier positif.");
    }
    if (command.source === "SERVER_RENDER" && !command.beatRevisionId) {
      throw invalidInput(operation, "beatRevisionId est obligatoire pour réactiver le Beat collectif.");
    }
    if (command.beatRevisionId) assertUuid(command.beatRevisionId, operation, "beatRevisionId");
    if (command.musicalPositionBeats !== undefined && (!Number.isFinite(command.musicalPositionBeats) || command.musicalPositionBeats < 0)) {
      throw invalidInput(operation, "La position musicale doit être positive.");
    }
    const transitionMs = command.transitionMs ?? 120;
    if (!Number.isSafeInteger(transitionMs) || transitionMs < 0 || transitionMs > 2_000) {
      throw invalidInput(operation, "La transition audio doit être comprise entre 0 et 2000 ms.");
    }
    const correlationId = safeCorrelationId();
    const result = await this.client.rpc(WAVE_INFRA_CONTRACT.programAudioRpc, {
      p_wave_id: command.waveId,
      p_source: command.source,
      p_expected_sequence: command.expectedSequence,
      p_idempotency_key: command.idempotencyKey,
      p_beat_revision_id: command.beatRevisionId ?? null,
      p_musical_position_beats: command.musicalPositionBeats ?? 0,
      p_transition_ms: transitionMs,
      p_correlation_id: correlationId,
    }) as RpcResponse;
    if (result.error) throw backendFailure(operation, result.error);
    return parseServerResult(operation, result.data, parseProgramAudioState);
  }

  async recover(waveId: string, cursor?: WaveEventCursor): Promise<WaveAuthoritativeResult<WaveRecoveryBundle>> {
    const operation = "wave.realtime.recover";
    assertUuid(waveId, operation, "waveId");
    if (cursor && (cursor.waveId !== waveId || !Number.isSafeInteger(cursor.sequence) || cursor.sequence < 0)) {
      throw invalidInput(operation, "Le curseur de reconnexion ne correspond pas à cette Wave.");
    }
    const correlationId = safeCorrelationId();
    const result = await this.client.rpc(WAVE_INFRA_CONTRACT.recoveryRpc, {
      p_wave_id: waveId,
      p_after_sequence: cursor?.sequence ?? 0,
      p_after_event_id: cursor?.eventId ?? null,
      p_correlation_id: correlationId,
    }) as RpcResponse;
    if (result.error) throw backendFailure(operation, result.error);
    const parsed = parseServerResult(operation, result.data, parseRecoveryBundle);
    if (parsed.data.snapshot.waveId !== waveId) throw invalidResponse(operation);
    return parsed;
  }

  subscribe(waveId: string, handlers: WaveEventStreamHandlers, cursor?: WaveEventCursor): WaveEventStream {
    assertUuid(waveId, "wave.realtime.subscribe", "waveId");
    return new SupabaseWaveEventStream(this.client, this, waveId, handlers, cursor);
  }

  async requestAssetUploadTicket(input: RequestWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetUploadTicket>> {
    const operation = "wave.asset.request_upload";
    assertUuid(input.waveId, operation, "waveId");
    assertIdempotencyKey(input.idempotencyKey, operation);
    if (!input.fileName.trim() || input.fileName.length > 255 || /[\\/\0]/u.test(input.fileName)) {
      throw invalidInput(operation, "Le nom de fichier est invalide.");
    }
    if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0) throw invalidInput(operation, "La taille du fichier est invalide.");
    if (!input.claimedMimeType.startsWith("audio/") || input.claimedMimeType.length > 128) throw invalidInput(operation, "Le type MIME audio est invalide.");
    if (!SHA256_PATTERN.test(input.sha256)) throw invalidInput(operation, "L'empreinte SHA-256 est invalide.");
    if (!CATEGORY_PATTERN.test(input.category)) throw invalidInput(operation, "La catégorie musicale est invalide.");
    if (!input.terms.termsVersion.trim() || input.terms.termsVersion.length > 128 || !Number.isFinite(Date.parse(input.terms.acceptedAt))) {
      throw invalidInput(operation, "La preuve d'acceptation des conditions est invalide.");
    }
    const correlationId = safeCorrelationId();
    const { data, error } = await this.client.functions.invoke(WAVE_INFRA_CONTRACT.uploadTicketFunction, {
      body: edgeBody(input, correlationId),
    });
    if (error) throw backendFailure(operation, error);
    const ticket = parseServerResult(operation, data, parseUploadTicket);
    if (ticket.data.maxBytes < input.byteSize || Date.parse(ticket.data.expiresAt) <= Date.now()) throw invalidResponse(operation);
    return ticket;
  }

  async uploadAsset(ticket: WaveAssetUploadTicket, body: Blob, signal?: AbortSignal): Promise<WaveAssetUploadReceipt> {
    const operation = "wave.asset.direct_upload";
    if (Date.parse(ticket.expiresAt) <= Date.now()) throw invalidInput(operation, "Le ticket d'upload a expiré.");
    if (body.size <= 0 || body.size > ticket.maxBytes) throw invalidInput(operation, "Le fichier dépasse les limites du ticket d'upload.");
    let response: Response;
    try {
      response = await this.directUploadFetch(ticket.uploadUrl, {
        method: ticket.method,
        headers: ticket.headers,
        body,
        signal,
        credentials: "omit",
        redirect: "error",
      });
    } catch (error) {
      throw new WaveInfraError("DIRECT_UPLOAD_FAILED", operation, "L'upload direct vers le stockage audio a échoué.", true, { cause: error });
    }
    if (!response.ok) {
      throw new WaveInfraError(
        "DIRECT_UPLOAD_FAILED",
        operation,
        `Le stockage audio a refusé l'upload (${response.status}).`,
        response.status >= 500 || response.status === 408 || response.status === 429,
      );
    }
    return { eTag: response.headers.get("etag"), byteSize: body.size };
  }

  async confirmAssetUpload(input: ConfirmWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>> {
    const operation = "wave.asset.confirm_upload";
    assertUuid(input.waveId, operation, "waveId");
    assertUuid(input.uploadId, operation, "uploadId");
    assertUuid(input.assetId, operation, "assetId");
    assertIdempotencyKey(input.idempotencyKey, operation);
    if (!Number.isSafeInteger(input.byteSize) || input.byteSize <= 0 || !SHA256_PATTERN.test(input.sha256)) {
      throw invalidInput(operation, "La confirmation d'upload est invalide.");
    }
    const correlationId = safeCorrelationId();
    const { data, error } = await this.client.functions.invoke(WAVE_INFRA_CONTRACT.uploadConfirmFunction, {
      body: edgeBody(input, correlationId),
    });
    if (error) throw backendFailure(operation, error);
    const status = parseServerResult(operation, data, parseProcessingStatus);
    if (status.data.waveId !== input.waveId || status.data.assetId !== input.assetId || status.data.uploadId !== input.uploadId) {
      throw invalidResponse(operation);
    }
    return status;
  }

  async getAssetProcessingStatus(waveId: string, assetId: string): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>> {
    const operation = "wave.asset.processing_status";
    assertUuid(waveId, operation, "waveId");
    assertUuid(assetId, operation, "assetId");
    const correlationId = safeCorrelationId();
    const { data, error } = await this.client.functions.invoke(WAVE_INFRA_CONTRACT.processingStatusFunction, {
      body: { waveId, assetId, correlationId },
    });
    if (error) throw backendFailure(operation, error);
    const status = parseServerResult(operation, data, parseProcessingStatus);
    if (status.data.waveId !== waveId || status.data.assetId !== assetId) throw invalidResponse(operation);
    return status;
  }
}

class SupabaseWaveEventStream implements WaveEventStream {
  private channel: RealtimeChannel | null = null;
  private closed = false;
  private recovering: Promise<void> | null = null;
  private recoveryRequested = false;
  private pending: WaveRealtimeEvent[] = [];
  private readonly sequencer: WaveEventSequencer;

  constructor(
    private readonly client: SupabaseClient,
    private readonly adapter: SupabaseWaveInfraAdapter,
    private readonly waveId: string,
    private readonly handlers: WaveEventStreamHandlers,
    cursor?: WaveEventCursor,
  ) {
    this.sequencer = new WaveEventSequencer(waveId, cursor);
    this.handlers.onStatus?.("connecting");
    this.channel = this.client
      .channel(`wave-infra:${waveId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: WAVE_INFRA_CONTRACT.eventTable, filter: `wave_id=eq.${waveId}` },
        (payload) => this.receive(payload.new),
      )
      .subscribe((status) => {
        if (this.closed) return;
        if (status === "SUBSCRIBED") void this.reconnect();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          this.handlers.onStatus?.("failed");
          this.handlers.onError?.(backendFailure("wave.realtime.subscribe", new Error(status)));
        }
      });
  }

  getCursor = () => this.sequencer.current();

  reconnect = async () => {
    if (this.closed) return;
    if (this.recovering) return this.recovering;
    this.recovering = this.performRecovery().finally(() => {
      this.recovering = null;
      if (this.recoveryRequested && !this.closed) {
        this.recoveryRequested = false;
        void this.reconnect();
      }
    });
    return this.recovering;
  };

  close = () => {
    if (this.closed) return;
    this.closed = true;
    this.pending = [];
    this.handlers.onStatus?.("closed");
    if (this.channel) void this.client.removeChannel(this.channel);
    this.channel = null;
  };

  private receive(value: unknown) {
    if (this.closed) return;
    let event: WaveRealtimeEvent;
    try {
      event = parseWaveEvent("wave.realtime.event", value);
    } catch (error) {
      this.handlers.onError?.(error instanceof Error ? error : invalidResponse("wave.realtime.event"));
      return;
    }
    if (this.recovering) {
      this.pending.push(event);
      return;
    }
    this.applyEvent(event);
  }

  private applyEvent(event: WaveRealtimeEvent) {
    const decision = this.sequencer.inspect(event);
    if (decision.kind === "apply") this.handlers.onEvent(event);
    if (decision.kind === "gap") {
      this.pending.push(event);
      if (this.recovering) this.recoveryRequested = true;
      else void this.reconnect();
    }
  }

  private async performRecovery() {
    this.handlers.onStatus?.("recovering");
    try {
      const result = await this.adapter.recover(this.waveId, this.sequencer.current());
      if (this.closed) return;
      this.handlers.onSnapshot(result.data.snapshot);
      this.sequencer.reset({
        waveId: this.waveId,
        sequence: result.data.snapshot.sequence,
        eventId: null,
      });
      for (const event of result.data.events) this.applyEvent(event);
      if (this.sequencer.current().sequence !== result.data.cursor.sequence) throw invalidResponse("wave.realtime.recover");
      const pending = this.pending.splice(0).sort((left, right) => left.sequence - right.sequence);
      for (const event of pending) this.applyEvent(event);
      if (!this.recoveryRequested) this.handlers.onStatus?.("live");
    } catch (error) {
      if (this.closed) return;
      this.handlers.onStatus?.("failed");
      this.handlers.onError?.(error instanceof Error ? error : backendFailure("wave.realtime.recover", error));
    }
  }
}
