import { describe, expect, it } from "vitest";
import { mapMessagingAttachmentRow } from "./messaging.attachments.adapters";

const ATTACHMENT_ID = "71000000-0000-4000-8000-000000000001";
const MEDIA_ID = "72000000-0000-4000-8000-000000000001";

describe("messaging attachment adapters", () => {
  it("keeps a private object reference without ever creating a permanent URL", () => {
    const mapped = mapMessagingAttachmentRow({
      attachment_id: ATTACHMENT_ID,
      media_file_id: MEDIA_ID,
      available: true,
      sort_order: 0,
      role: "primary",
      purpose: "audio",
      media_type: "audio",
      display_name: "Démo.wav",
      mime_type: "audio/wav",
      size_bytes: 1024,
      duration_ms: 3200,
      bpm: null,
      musical_key: null,
      label: null,
      metadata: { source: "recorder" },
      storage_bucket: "messaging-attachments",
      storage_path: `${MEDIA_ID}/original.wav`,
    });

    expect(mapped).toMatchObject({
      id: ATTACHMENT_ID,
      available: true,
      privateObject: {
        bucket: "messaging-attachments",
        path: `${MEDIA_ID}/original.wav`,
      },
    });
    expect(mapped).not.toHaveProperty("url");
    expect(mapped).not.toHaveProperty("signedUrl");
  });

  it("preserves the snapshot but removes object access after media deletion", () => {
    const mapped = mapMessagingAttachmentRow({
      attachment_id: ATTACHMENT_ID,
      media_file_id: null,
      available: false,
      sort_order: 0,
      purpose: "document",
      media_type: "document",
      display_name: "Brief.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      duration_ms: null,
      bpm: null,
      musical_key: null,
      label: null,
      metadata: {},
      storage_bucket: null,
      storage_path: null,
    });

    expect(mapped).toMatchObject({
      available: false,
      displayName: "Brief.pdf",
      sizeBytes: 2048,
      privateObject: null,
    });
  });
});
