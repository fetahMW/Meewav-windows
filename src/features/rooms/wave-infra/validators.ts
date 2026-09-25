import type {
  ProgramAudioStateSource,
  ProgramAudioState,
  WaveAssetProcessingState,
  WaveAssetProcessingStatus,
  WaveAssetUploadTicket,
  WaveAuthoritativeResult,
  WaveEventCursor,
  WaveExternalServiceHealth,
  WaveExternalServiceName,
  WaveExternalServiceStatus,
  WaveInfraHealth,
  WaveInfraSnapshot,
  WaveRealtimeEvent,
  WaveRealtimeEventType,
  WaveRecoveryBundle,
} from "./contracts";
import { invalidResponse } from "./errors";

const PROGRAM_SOURCES = new Set<ProgramAudioStateSource>(["SERVER_RENDER", "HOST_DAW", "SILENCE"]);
const EVENT_TYPES = new Set<WaveRealtimeEventType>([
  "wave.started", "wave.updated", "wave.snapshot", "category.opened", "category.closed",
  "submission.created", "submission.processing", "submission.ready", "submission.rejected",
  "submission.correction_required", "submission.version_created", "vote.started", "vote.opened",
  "vote.closed", "vote.result", "beat.revision_created", "beat.playback_changed",
  "program_audio.changed", "host.disconnected", "host.reconnected", "wave.ended",
]);
const PROCESSING_STATES = new Set<WaveAssetProcessingState>([
  "AWAITING_UPLOAD", "UPLOADED", "VERIFYING", "PROCESSING", "READY", "REJECTED", "PROCESSING_FAILED", "EXPIRED",
]);
const SERVICE_NAMES = new Set<WaveExternalServiceName>([
  "database", "realtime", "object_storage", "audio_processing", "audio_engine", "media_sfu",
]);
const SERVICE_STATUSES = new Set<WaveExternalServiceStatus>([
  "healthy", "degraded", "unavailable", "not_configured", "local_only",
]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function string(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : string(value);
}

function integer(value: unknown, min = 0) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min ? value : null;
}

function finite(value: unknown, min = Number.NEGATIVE_INFINITY) {
  return typeof value === "number" && Number.isFinite(value) && value >= min ? value : null;
}

function isoDate(value: unknown) {
  const parsed = string(value);
  return parsed && Number.isFinite(Date.parse(parsed)) ? new Date(parsed).toISOString() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : null;
}

function correlationId(value: unknown) {
  const parsed = string(value);
  return parsed && parsed.length <= 256 ? parsed : null;
}

export function parseServerResult<T>(operation: string, value: unknown, parser: (operation: string, value: unknown) => T): WaveAuthoritativeResult<T> {
  const row = record(value);
  const data = row ? row.data : null;
  const correlation = correlationId(row?.correlationId ?? row?.correlation_id);
  if (!row || !correlation || data === undefined) throw invalidResponse(operation);
  return { authority: "SERVER_CONFIRMED", correlationId: correlation, data: parser(operation, data) };
}

export function parseProgramAudioState(operation: string, value: unknown): ProgramAudioState {
  const row = record(value);
  const source = row?.source;
  const waveId = string(row?.waveId ?? row?.wave_id);
  const sequence = integer(row?.sequence);
  const position = finite(row?.musicalPositionBeats ?? row?.musical_position_beats, 0);
  const transitionMs = integer(row?.transitionMs ?? row?.transition_ms);
  const changedAt = isoDate(row?.changedAt ?? row?.changed_at);
  if (!row || !waveId || !PROGRAM_SOURCES.has(source as ProgramAudioStateSource) || sequence === null || position === null || transitionMs === null || !changedAt) {
    throw invalidResponse(operation);
  }
  const beatRevisionId = nullableString(row.beatRevisionId ?? row.beat_revision_id);
  if (source === "SERVER_RENDER" ? !beatRevisionId : beatRevisionId !== null) throw invalidResponse(operation);
  return {
    waveId,
    source: source as ProgramAudioStateSource,
    beatRevisionId,
    musicalPositionBeats: position,
    changedAt,
    changedBy: nullableString(row.changedBy ?? row.changed_by),
    sequence,
    transitionMs,
  };
}

export function parseWaveEvent(operation: string, value: unknown): WaveRealtimeEvent {
  const row = record(value);
  const id = string(row?.id);
  const waveId = string(row?.waveId ?? row?.wave_id);
  const sequence = integer(row?.sequence, 1);
  const type = row?.type;
  const correlation = correlationId(row?.correlationId ?? row?.correlation_id);
  const occurredAt = isoDate(row?.occurredAt ?? row?.occurred_at ?? row?.created_at);
  const payload = record(row?.payload);
  if (!row || !id || !waveId || sequence === null || !EVENT_TYPES.has(type as WaveRealtimeEventType) || !correlation || !occurredAt || !payload) {
    throw invalidResponse(operation);
  }
  return {
    id,
    waveId,
    sequence,
    type: type as WaveRealtimeEventType,
    actorId: nullableString(row.actorId ?? row.actor_id),
    correlationId: correlation,
    occurredAt,
    payload,
  };
}

export function parseCursor(operation: string, value: unknown): WaveEventCursor {
  const row = record(value);
  const waveId = string(row?.waveId ?? row?.wave_id);
  const sequence = integer(row?.sequence);
  if (!row || !waveId || sequence === null) throw invalidResponse(operation);
  return { waveId, sequence, eventId: nullableString(row.eventId ?? row.event_id) };
}

export function parseSnapshot(operation: string, value: unknown): WaveInfraSnapshot {
  const row = record(value);
  const waveId = string(row?.waveId ?? row?.wave_id);
  const roomId = string(row?.roomId ?? row?.room_id);
  const sequence = integer(row?.sequence);
  const generatedAt = isoDate(row?.generatedAt ?? row?.generated_at);
  const permissions = stringArray(row?.permissions);
  const state = record(row?.state);
  if (!row || row.schemaVersion !== 1 && row.schema_version !== 1 || !waveId || !roomId || sequence === null || !generatedAt || !permissions || !state) {
    throw invalidResponse(operation);
  }
  return {
    schemaVersion: 1,
    waveId,
    roomId,
    sequence,
    generatedAt,
    programAudio: parseProgramAudioState(operation, row.programAudio ?? row.program_audio),
    permissions,
    state,
  };
}

export function parseRecoveryBundle(operation: string, value: unknown): WaveRecoveryBundle {
  const row = record(value);
  if (!row || !Array.isArray(row.events)) throw invalidResponse(operation);
  const snapshot = parseSnapshot(operation, row.snapshot);
  const events = row.events.map((event) => parseWaveEvent(operation, event)).sort((a, b) => a.sequence - b.sequence);
  const cursor = parseCursor(operation, row.cursor);
  if (cursor.waveId !== snapshot.waveId || cursor.sequence < snapshot.sequence || events.some((event) => event.waveId !== snapshot.waveId)) {
    throw invalidResponse(operation);
  }
  return { snapshot, events, cursor };
}

export function parseUploadTicket(operation: string, value: unknown): WaveAssetUploadTicket {
  const row = record(value);
  const uploadId = string(row?.uploadId ?? row?.upload_id);
  const assetId = string(row?.assetId ?? row?.asset_id);
  const objectKey = string(row?.objectKey ?? row?.object_key);
  const uploadUrl = string(row?.uploadUrl ?? row?.upload_url);
  const expiresAt = isoDate(row?.expiresAt ?? row?.expires_at);
  const maxBytes = integer(row?.maxBytes ?? row?.max_bytes, 1);
  const method = row?.method;
  const headers = record(row?.headers);
  if (!row || !uploadId || !assetId || !objectKey || !uploadUrl || !expiresAt || maxBytes === null || (method !== "PUT" && method !== "POST") || !headers || Object.values(headers).some((header) => typeof header !== "string")) {
    throw invalidResponse(operation);
  }
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(uploadUrl);
  } catch {
    throw invalidResponse(operation);
  }
  const loopback = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1" || parsedUrl.hostname === "[::1]";
  if (parsedUrl.protocol !== "https:" && !(loopback && parsedUrl.protocol === "http:")) throw invalidResponse(operation);
  return {
    uploadId,
    assetId,
    objectKey,
    uploadUrl: parsedUrl.toString(),
    method,
    headers: headers as Record<string, string>,
    expiresAt,
    maxBytes,
    resumable: row.resumable === true,
  };
}

export function parseProcessingStatus(operation: string, value: unknown): WaveAssetProcessingStatus {
  const row = record(value);
  const waveId = string(row?.waveId ?? row?.wave_id);
  const uploadId = string(row?.uploadId ?? row?.upload_id);
  const assetId = string(row?.assetId ?? row?.asset_id);
  const state = row?.state;
  const updatedAt = isoDate(row?.updatedAt ?? row?.updated_at);
  const progressValue = row?.progressPercent ?? row?.progress_percent;
  const progress = progressValue === null || progressValue === undefined ? null : finite(progressValue, 0);
  if (!row || !waveId || !uploadId || !assetId || !PROCESSING_STATES.has(state as WaveAssetProcessingState) || !updatedAt || progress === null && progressValue !== null && progressValue !== undefined || progress !== null && progress > 100) {
    throw invalidResponse(operation);
  }
  return {
    waveId,
    uploadId,
    assetId,
    state: state as WaveAssetProcessingState,
    progressPercent: progress,
    analysisId: nullableString(row.analysisId ?? row.analysis_id),
    previewAssetId: nullableString(row.previewAssetId ?? row.preview_asset_id),
    waveformAssetId: nullableString(row.waveformAssetId ?? row.waveform_asset_id),
    failureCode: nullableString(row.failureCode ?? row.failure_code),
    updatedAt,
  };
}

function parseServiceHealth(operation: string, value: unknown): WaveExternalServiceHealth {
  const row = record(value);
  const service = row?.service;
  const status = row?.status;
  const checkedAt = isoDate(row?.checkedAt ?? row?.checked_at);
  if (!row || !SERVICE_NAMES.has(service as WaveExternalServiceName) || !SERVICE_STATUSES.has(status as WaveExternalServiceStatus) || typeof row.required !== "boolean" || !checkedAt) {
    throw invalidResponse(operation);
  }
  return {
    service: service as WaveExternalServiceName,
    status: status as WaveExternalServiceStatus,
    required: row.required,
    checkedAt,
    detailCode: nullableString(row.detailCode ?? row.detail_code),
  };
}

export function parseHealth(operation: string, value: unknown): WaveInfraHealth {
  const row = record(value);
  const services = Array.isArray(row?.services) ? row.services.map((service) => parseServiceHealth(operation, service)) : null;
  const missingConfiguration = stringArray(row?.missingConfiguration ?? row?.missing_configuration);
  const capabilities = record(row?.capabilities);
  const checkedAt = isoDate(row?.checkedAt ?? row?.checked_at);
  const capabilityKeys = ["programAudioRouting", "realtimeRecovery", "signedDirectUpload", "asynchronousProcessing", "collectiveBeatRendering", "sfuDistribution"] as const;
  if (!row || row.mode !== "production" || typeof row.productionReady !== "boolean" || !services || !missingConfiguration || !capabilities || !checkedAt || capabilityKeys.some((key) => typeof capabilities[key] !== "boolean")) {
    throw invalidResponse(operation);
  }
  return {
    mode: "production",
    deploymentId: nullableString(row.deploymentId ?? row.deployment_id),
    checkedAt,
    productionReady: row.productionReady,
    services,
    missingConfiguration,
    capabilities: {
      programAudioRouting: capabilities.programAudioRouting as boolean,
      realtimeRecovery: capabilities.realtimeRecovery as boolean,
      signedDirectUpload: capabilities.signedDirectUpload as boolean,
      asynchronousProcessing: capabilities.asynchronousProcessing as boolean,
      collectiveBeatRendering: capabilities.collectiveBeatRendering as boolean,
      sfuDistribution: capabilities.sfuDistribution as boolean,
    },
  };
}
