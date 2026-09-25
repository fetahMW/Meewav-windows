import { afterEach, describe, expect, it, vi } from "vitest";
import { forgetViewerUpload, submitViewerFile, viewerInfra } from "./waveViewer.service";
import type { WaveAssetProcessingStatus, WaveAuthoritativeResult } from "../wave-infra";
const key = "00000000-0000-4000-8000-000000000099";
const ready: WaveAuthoritativeResult<WaveAssetProcessingStatus> = { authority: "SERVER_CONFIRMED", correlationId: "c", data: { waveId: "wave", uploadId: "upload", assetId: "asset", state: "PROCESSING", progressPercent: 0, analysisId: null, previewAssetId: null, waveformAssetId: null, failureCode: null, updatedAt: new Date().toISOString() } };
function setup() {
  const file = new File(["original"], "loop.wav", { type: "audio/wav" });
  Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(8) });
  const ticket = vi.spyOn(viewerInfra, "requestAssetUploadTicket").mockResolvedValue({ authority: "SERVER_CONFIRMED", correlationId: "c", data: { uploadId: "upload", assetId: "asset", objectKey: "private", uploadUrl: "https://example.invalid", method: "PUT", headers: {}, expiresAt: new Date(Date.now() + 600000).toISOString(), maxBytes: 25000000, resumable: false } });
  const upload = vi.spyOn(viewerInfra, "uploadAsset").mockResolvedValue({ eTag: "hash", byteSize: file.size });
  const confirm = vi.spyOn(viewerInfra, "confirmAssetUpload").mockResolvedValue(ready);
  return { file, ticket, upload, confirm, input: { sessionId: "wave", file, category: "bass", title: "My loop", reference: null, termsVersion: "wave-viewer-original-v1", idempotencyKey: key } };
}
afterEach(() => { forgetViewerUpload(key); vi.restoreAllMocks(); });
describe("Wave explicit upload retry", () => {
  it("retries confirmation with the same identity without reuploading the original or reserving a second slot", async () => {
    const { input, file, ticket, upload, confirm } = setup();
    confirm.mockRejectedValueOnce(new Error("connection lost"));
    await expect(submitViewerFile(input)).rejects.toThrow("connection lost");
    const result = await submitViewerFile(input);
    expect(result.processing.data.state).toBe("PROCESSING");
    expect(ticket).toHaveBeenCalledOnce(); expect(upload).toHaveBeenCalledOnce();
    expect(upload.mock.calls[0][1]).toBe(file);
    expect(confirm.mock.calls[0][0]).toEqual(confirm.mock.calls[1][0]);
  });
  it("asks the existing object-verification gateway to resolve an uncertain PUT response", async () => {
    const { input, upload, confirm, ticket } = setup(); upload.mockRejectedValueOnce(new Error("PUT response lost"));
    expect((await submitViewerFile(input)).processing.data.state).toBe("PROCESSING");
    expect(ticket).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0].byteSize).toBe(input.file.size);
  });
});
