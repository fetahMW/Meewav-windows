import type {
  RequestWaveAssetUpload,
  WaveAssetProcessingStatus,
  WaveAssetUploadReceipt,
  WaveAssetUploadTicket,
  WaveAuthoritativeResult,
  WaveInfraAdapter,
} from "./contracts";
import { invalidInput } from "./errors";

export type WaveAssetPipelineResult = {
  ticket: WaveAuthoritativeResult<WaveAssetUploadTicket>;
  receipt: WaveAssetUploadReceipt;
  processing: WaveAuthoritativeResult<WaveAssetProcessingStatus>;
};

/**
 * Executes the client-owned part of ingestion. READY is intentionally not
 * returned here: confirmation merely enqueues durable asynchronous processing.
 */
export async function ingestWaveAsset(
  adapter: WaveInfraAdapter,
  input: RequestWaveAssetUpload,
  body: Blob,
  signal?: AbortSignal,
): Promise<WaveAssetPipelineResult> {
  if (body.size !== input.byteSize) {
    throw invalidInput("wave.asset.ingest", "La taille réelle ne correspond pas à la taille déclarée au backend.");
  }
  const ticket = await adapter.requestAssetUploadTicket(input);
  const receipt = await adapter.uploadAsset(ticket.data, body, signal);
  const processing = await adapter.confirmAssetUpload({
    waveId: input.waveId,
    uploadId: ticket.data.uploadId,
    assetId: ticket.data.assetId,
    byteSize: receipt.byteSize,
    sha256: input.sha256,
    eTag: receipt.eTag,
    idempotencyKey: `wave-upload:${ticket.data.uploadId}:confirm`,
  });
  return { ticket, receipt, processing };
}
