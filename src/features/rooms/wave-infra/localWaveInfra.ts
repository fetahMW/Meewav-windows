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
  WaveExternalServiceName,
  WaveInfraAdapter,
  WaveInfraHealth,
  WaveRecoveryBundle,
} from "./contracts";
import { WaveInfraError } from "./errors";

const SERVICES: WaveExternalServiceName[] = [
  "database", "realtime", "object_storage", "audio_processing", "audio_engine", "media_sfu",
];

/**
 * Explicit development sentinel. It never fabricates a successful production
 * command. Applications may render its health state, then must run Supabase +
 * workers before enabling critical Wave controls.
 */
export class LocalOnlyWaveInfraAdapter implements WaveInfraAdapter {
  readonly mode = "local-explicit" as const;

  async getHealth(): Promise<WaveAuthoritativeResult<WaveInfraHealth>> {
    const checkedAt = new Date().toISOString();
    return {
      authority: "LOCAL_ONLY",
      correlationId: `local:${crypto.randomUUID()}`,
      data: {
        mode: "local-explicit",
        deploymentId: null,
        checkedAt,
        productionReady: false,
        services: SERVICES.map((service) => ({ service, status: "local_only", required: true, checkedAt, detailCode: "LOCAL_ADAPTER_NO_BACKEND" })),
        missingConfiguration: [
          "Supabase Wave RPCs",
          "Wave asset Edge Functions",
          "audio processing workers",
          "collective Beat audio engine",
          "SFU program publisher",
        ],
        capabilities: {
          programAudioRouting: false,
          realtimeRecovery: false,
          signedDirectUpload: false,
          asynchronousProcessing: false,
          collectiveBeatRendering: false,
          sfuDistribution: false,
        },
      },
    };
  }

  switchProgramAudio(_command: SwitchProgramAudioCommand): Promise<WaveAuthoritativeResult<ProgramAudioState>> {
    return this.unavailable("wave.program_audio.switch");
  }

  recover(_waveId: string, _cursor?: WaveEventCursor): Promise<WaveAuthoritativeResult<WaveRecoveryBundle>> {
    return this.unavailable("wave.realtime.recover");
  }

  subscribe(_waveId: string, handlers: WaveEventStreamHandlers, cursor?: WaveEventCursor): WaveEventStream {
    const error = this.error("wave.realtime.subscribe");
    queueMicrotask(() => {
      handlers.onStatus?.("failed");
      handlers.onError?.(error);
    });
    return {
      getCursor: () => cursor ?? { waveId: _waveId, sequence: 0, eventId: null },
      reconnect: () => Promise.reject(this.error("wave.realtime.recover")),
      close: () => handlers.onStatus?.("closed"),
    };
  }

  requestAssetUploadTicket(_input: RequestWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetUploadTicket>> {
    return this.unavailable("wave.asset.request_upload");
  }

  uploadAsset(_ticket: WaveAssetUploadTicket, _body: Blob, _signal?: AbortSignal): Promise<WaveAssetUploadReceipt> {
    return this.unavailable("wave.asset.direct_upload");
  }

  confirmAssetUpload(_input: ConfirmWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>> {
    return this.unavailable("wave.asset.confirm_upload");
  }

  getAssetProcessingStatus(_waveId: string, _assetId: string): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>> {
    return this.unavailable("wave.asset.processing_status");
  }

  private unavailable<T>(operation: string): Promise<T> {
    return Promise.reject(this.error(operation));
  }

  private error(operation: string) {
    return new WaveInfraError(
      "LOCAL_ONLY_UNAVAILABLE",
      operation,
      `« ${operation} » exige le backend La Wave. Le mode local explicite ne simule pas un succès.`,
      false,
    );
  }
}
