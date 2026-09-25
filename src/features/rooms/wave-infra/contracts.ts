export type WaveInfraMode = "production" | "local-explicit";

export type WaveAuthority = "SERVER_CONFIRMED" | "LOCAL_ONLY";

export type WaveAuthoritativeResult<T> = {
  authority: WaveAuthority;
  correlationId: string;
  data: T;
};

export type ProgramAudioSource = "SERVER_RENDER" | "HOST_DAW";
/**
 * `SILENCE` is the honest fail-safe projection before a real DAW publication
 * or rendered Beat is available. It is observable but never client-selectable.
 */
export type ProgramAudioStateSource = ProgramAudioSource | "SILENCE";

export type ProgramAudioState = {
  waveId: string;
  source: ProgramAudioStateSource;
  beatRevisionId: string | null;
  musicalPositionBeats: number;
  changedAt: string;
  changedBy: string | null;
  sequence: number;
  transitionMs: number;
};

export type SwitchProgramAudioCommand = {
  waveId: string;
  source: ProgramAudioSource;
  expectedSequence: number;
  idempotencyKey: string;
  beatRevisionId?: string | null;
  musicalPositionBeats?: number;
  transitionMs?: number;
};

export type WaveRealtimeEventType =
  | "wave.started"
  | "wave.updated"
  | "wave.snapshot"
  | "category.opened"
  | "category.closed"
  | "submission.created"
  | "submission.processing"
  | "submission.ready"
  | "submission.rejected"
  | "submission.correction_required"
  | "submission.version_created"
  | "vote.started"
  | "vote.opened"
  | "vote.closed"
  | "vote.result"
  | "beat.revision_created"
  | "beat.playback_changed"
  | "program_audio.changed"
  | "host.disconnected"
  | "host.reconnected"
  | "wave.ended";

export type WaveRealtimeEvent = {
  id: string;
  waveId: string;
  sequence: number;
  type: WaveRealtimeEventType;
  actorId: string | null;
  correlationId: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type WaveEventCursor = {
  waveId: string;
  sequence: number;
  eventId: string | null;
};

export type WaveInfraSnapshot = {
  schemaVersion: 1;
  waveId: string;
  roomId: string;
  sequence: number;
  generatedAt: string;
  programAudio: ProgramAudioState;
  permissions: string[];
  state: Record<string, unknown>;
};

export type WaveRecoveryBundle = {
  snapshot: WaveInfraSnapshot;
  events: WaveRealtimeEvent[];
  cursor: WaveEventCursor;
};

export type WaveEventStreamStatus = "connecting" | "recovering" | "live" | "closed" | "failed";

export type WaveEventStreamHandlers = {
  onSnapshot: (snapshot: WaveInfraSnapshot) => void;
  onEvent: (event: WaveRealtimeEvent) => void;
  onStatus?: (status: WaveEventStreamStatus) => void;
  onError?: (error: Error) => void;
};

export type WaveEventStream = {
  getCursor: () => WaveEventCursor;
  reconnect: () => Promise<void>;
  close: () => void;
};

export type WaveAssetPurpose = "LOOP_ORIGINAL" | "LOOP_CORRECTION" | "HOST_BASE_LOOP";

export type WaveAssetTermsAcceptance = {
  termsVersion: string;
  acceptedAt: string;
};

export type RequestWaveAssetUpload = {
  waveId: string;
  purpose: WaveAssetPurpose;
  category: string;
  fileName: string;
  byteSize: number;
  claimedMimeType: string;
  sha256: string;
  terms: WaveAssetTermsAcceptance;
  idempotencyKey: string;
  /** Explicit viewer submission context; absent for existing host upload flows. */
  viewerDraft?: { title: string; referenceId: string | null };
};

export type WaveAssetUploadTicket = {
  uploadId: string;
  assetId: string;
  objectKey: string;
  uploadUrl: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
  resumable: boolean;
};

export type ConfirmWaveAssetUpload = {
  waveId: string;
  uploadId: string;
  assetId: string;
  byteSize: number;
  sha256: string;
  eTag?: string | null;
  idempotencyKey: string;
};

export type WaveAssetProcessingState =
  | "AWAITING_UPLOAD"
  | "UPLOADED"
  | "VERIFYING"
  | "PROCESSING"
  | "READY"
  | "REJECTED"
  | "PROCESSING_FAILED"
  | "EXPIRED";

export type WaveAssetProcessingStatus = {
  waveId: string;
  uploadId: string;
  assetId: string;
  state: WaveAssetProcessingState;
  progressPercent: number | null;
  analysisId: string | null;
  previewAssetId: string | null;
  waveformAssetId: string | null;
  failureCode: string | null;
  updatedAt: string;
};

export type WaveAssetUploadReceipt = {
  eTag: string | null;
  byteSize: number;
};

export type WaveExternalServiceName =
  | "database"
  | "realtime"
  | "object_storage"
  | "audio_processing"
  | "audio_engine"
  | "media_sfu";

export type WaveExternalServiceStatus = "healthy" | "degraded" | "unavailable" | "not_configured" | "local_only";

export type WaveExternalServiceHealth = {
  service: WaveExternalServiceName;
  status: WaveExternalServiceStatus;
  required: boolean;
  checkedAt: string;
  detailCode: string | null;
};

export type WaveInfraHealth = {
  mode: WaveInfraMode;
  deploymentId: string | null;
  checkedAt: string;
  productionReady: boolean;
  services: WaveExternalServiceHealth[];
  missingConfiguration: string[];
  capabilities: {
    programAudioRouting: boolean;
    realtimeRecovery: boolean;
    signedDirectUpload: boolean;
    asynchronousProcessing: boolean;
    collectiveBeatRendering: boolean;
    sfuDistribution: boolean;
  };
};

export interface WaveInfraAdapter {
  readonly mode: WaveInfraMode;
  getHealth(): Promise<WaveAuthoritativeResult<WaveInfraHealth>>;
  switchProgramAudio(command: SwitchProgramAudioCommand): Promise<WaveAuthoritativeResult<ProgramAudioState>>;
  recover(waveId: string, cursor?: WaveEventCursor): Promise<WaveAuthoritativeResult<WaveRecoveryBundle>>;
  subscribe(waveId: string, handlers: WaveEventStreamHandlers, cursor?: WaveEventCursor): WaveEventStream;
  requestAssetUploadTicket(input: RequestWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetUploadTicket>>;
  uploadAsset(ticket: WaveAssetUploadTicket, body: Blob, signal?: AbortSignal): Promise<WaveAssetUploadReceipt>;
  confirmAssetUpload(input: ConfirmWaveAssetUpload): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>>;
  getAssetProcessingStatus(waveId: string, assetId: string): Promise<WaveAuthoritativeResult<WaveAssetProcessingStatus>>;
}
