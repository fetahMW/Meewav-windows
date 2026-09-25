import { supabase } from "../../../lib/supabaseClient";
import { SupabaseWaveInfraAdapter, type RequestWaveAssetUpload, type WaveAssetUploadTicket, type WaveAssetUploadReceipt } from "../wave-infra";
import { validateWaveAudienceFile } from "../tools/audience/waveAudienceUpload.service";
import { SupabaseWaveProductionRepository } from "../wave-production/supabaseWaveProductionRepository";
import type { WaveViewerSnapshot, ViewerReference } from "./waveViewerModel";
export const viewerInfra = new SupabaseWaveInfraAdapter();
export const viewerProduction = new SupabaseWaveProductionRepository();

function object(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function validRules(value: unknown) {
  return object(value) && typeof value.id === "string" && typeof value.bpm === "number" && value.bpm > 0
    && typeof value.key === "string" && typeof value.signature === "string" && /^\d+\/(1|2|4|8|16)$/.test(value.signature)
    && Number.isInteger(value.cycleBars) && Number(value.cycleBars) > 0 && Array.isArray(value.acceptedBars)
    && value.acceptedBars.length > 0 && value.acceptedBars.every(item => Number.isInteger(item) && item > 0)
    && typeof value.maxDurationMs === "number" && typeof value.repeatPolicy === "string" && Array.isArray(value.mimeTypes);
}
export function parseViewerSnapshot(value: unknown): WaveViewerSnapshot {
  if (!object(value) || typeof value.sessionId !== "string" || !Number.isSafeInteger(value.sequence)
    || typeof value.serverNow !== "string" || !Number.isFinite(Date.parse(value.serverNow))
    || typeof value.status !== "string" || typeof value.programSource !== "string"
    || !(value.rules === null || validRules(value.rules))
    || !Array.isArray(value.layers) || !value.layers.every(item => object(item) && [item.id, item.title, item.credit, item.category].every(field => typeof field === "string"))
    || !Array.isArray(value.categories) || !value.categories.every(item => object(item) && typeof item.id === "string" && typeof item.label === "string" && typeof item.open === "boolean" && typeof item.permitted === "boolean")
    || !Array.isArray(value.contributions) || !value.contributions.every(item => object(item) && typeof item.id === "string" && typeof item.status === "string" && typeof item.title === "string" && typeof item.integrated === "boolean")
    || !(value.reference === null || (object(value.reference) && typeof value.reference.id === "string" && typeof value.reference.beatRevisionId === "string" && validRules(value.reference.rules) && typeof value.reference.durationSeconds === "number" && value.reference.durationSeconds > 0 && value.reference.originSeconds === 0))
    || !(value.vote === null || (object(value.vote) && typeof value.vote.id === "string" && ["ADMISSION", "REPLACEMENT", "CLOSING"].includes(String(value.vote.kind)) && typeof value.vote.eligible === "boolean" && typeof value.vote.opensAt === "string" && Number.isFinite(Date.parse(String(value.vote.closesAt))) && Array.isArray(value.vote.options) && value.vote.options.every(item => object(item) && typeof item.id === "string" && typeof item.label === "string")))) {
    throw new Error("L’état officiel de la Wave n’est pas encore disponible.");
  }
  return value as WaveViewerSnapshot;
}
export async function getViewerSnapshot(sessionId: string) {
  const { data, error } = await supabase.rpc("rooms_wave_viewer_snapshot_v6", { p_session_id: sessionId });
  if (error) throw new Error("Synchronisation indisponible. Votre brouillon reste dans l’atelier.");
  return parseViewerSnapshot(data);
}
export async function getViewerMedia(sessionId: string, kind: "reference" | "vote" | "closing" | "layer", id: string, option = "mix") {
  const { data, error } = await supabase.functions.invoke("rooms-wave-viewer-media", { body: { waveId: sessionId, kind, id, option } });
  if (error || !object(data) || !object(data.data) || typeof data.data.url !== "string" || !data.data.url.startsWith("https://")) throw new Error("Aperçu autorisé indisponible. Réessayez dans un instant.");
  return data.data.url;
}
const uploads = new Map<string, { request: RequestWaveAssetUpload; ticket?: WaveAssetUploadTicket; receipt?: WaveAssetUploadReceipt }>();
export function forgetViewerUpload(idempotencyKey: string) { uploads.delete(idempotencyKey); }
export async function submitViewerFile(input: { sessionId: string; file: File; category: string; title: string; reference: ViewerReference | null; termsVersion: string; idempotencyKey: string }) {
  let pending = uploads.get(input.idempotencyKey);
  if (!pending) {
    const hash = await crypto.subtle.digest("SHA-256", await input.file.arrayBuffer());
    const sha256 = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
    pending = { request: {
    waveId: input.sessionId, purpose: "LOOP_ORIGINAL", category: input.category,
    fileName: input.file.name, byteSize: input.file.size, claimedMimeType: validateWaveAudienceFile(input.file), sha256,
    terms: { termsVersion: input.termsVersion, acceptedAt: new Date().toISOString() }, idempotencyKey: input.idempotencyKey,
    viewerDraft: { title: input.title, referenceId: input.reference?.id ?? null },
    } };
    uploads.set(input.idempotencyKey, pending);
  }
  pending.ticket ??= (await viewerInfra.requestAssetUploadTicket(pending.request)).data;
  if (!pending.receipt) {
    try { pending.receipt = await viewerInfra.uploadAsset(pending.ticket, input.file); }
    catch (reason) {
      // A PUT may have reached Storage even if its response was lost. The
      // existing confirmation gateway verifies the actual object size/hash.
      try {
        const processing = await viewerInfra.confirmAssetUpload({ waveId: input.sessionId, uploadId: pending.ticket.uploadId,
          assetId: pending.ticket.assetId, byteSize: input.file.size, sha256: pending.request.sha256,
          idempotencyKey: `wave-upload:${pending.ticket.uploadId}:confirm` });
        return { processing };
      } catch { throw reason; }
    }
  }
  const processing = await viewerInfra.confirmAssetUpload({ waveId: input.sessionId, uploadId: pending.ticket.uploadId,
    assetId: pending.ticket.assetId, byteSize: pending.receipt.byteSize, sha256: pending.request.sha256, eTag: pending.receipt.eTag,
    idempotencyKey: `wave-upload:${pending.ticket.uploadId}:confirm` });
  return { processing };
}

export async function downloadViewerAudio(url: string, name: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Téléchargement indisponible.");
  const blob = await response.blob();
  const local = URL.createObjectURL(blob);
  const extension = blob.type.includes("wav") ? "wav" : blob.type.includes("flac") ? "flac" : blob.type.includes("mpeg") ? "mp3" : blob.type.includes("mp4") ? "m4a" : blob.type.includes("aac") ? "aac" : "audio";
  const anchor = document.createElement("a");
  anchor.href = local;
  anchor.download = name.replace(/[^\p{L}\p{N} -]/gu, "") + "." + extension;
  document.body.appendChild(anchor);
  try { anchor.click(); }
  finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(local), 1000); }
}
