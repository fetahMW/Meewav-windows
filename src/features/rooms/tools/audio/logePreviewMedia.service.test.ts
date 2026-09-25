import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOGE_PREVIEW_BUCKET,
  MAX_LOGE_PREVIEW_FILE_BYTES,
  createLogePreviewMediaService,
  validateLogePreviewMediaFile,
} from "./logePreviewMedia.service";

const ROOM_ID = "870f6601-0a9e-4d74-b89c-63be031b3936";
const USER_ID = "74ee19ba-ad26-43a6-8574-7fb2977199a4";
const OBJECT_ID = "8e21be33-e5e6-4d60-b741-19dedeb0a5d9";

afterEach(() => vi.restoreAllMocks());

describe("Loge preview media validation", () => {
  it("accepts the private audio contract and normalizes an absent MIME", () => {
    expect(validateLogePreviewMediaFile({
      name: "premix.M4A",
      type: "",
      size: 1024,
    })).toEqual({ extension: "m4a", contentType: "audio/mp4", kind: "audio" });
  });

  it("rejects empty, oversized, unsupported and mismatched files", () => {
    expect(() => validateLogePreviewMediaFile({
      name: "empty.wav",
      type: "audio/wav",
      size: 0,
    })).toThrow("loge_preview_file_size_invalid");
    expect(() => validateLogePreviewMediaFile({
      name: "large.wav",
      type: "audio/wav",
      size: MAX_LOGE_PREVIEW_FILE_BYTES + 1,
    })).toThrow("loge_preview_file_size_invalid");
    expect(() => validateLogePreviewMediaFile({
      name: "payload.html",
      type: "text/html",
      size: 10,
    })).toThrow("loge_preview_file_type_invalid");
    expect(() => validateLogePreviewMediaFile({
      name: "spoofed.mp3",
      type: "audio/wav",
      size: 10,
    })).toThrow("loge_preview_file_type_invalid");
  });
});

describe("Loge preview media service", () => {
  it("uploads to an opaque authenticated path without the original filename", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(OBJECT_ID);
    const upload = vi.fn().mockResolvedValue({ data: { path: "ignored" }, error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload });
    const getUser = vi.fn().mockResolvedValue({
      data: { user: { id: USER_ID } },
      error: null,
    });
    const service = createLogePreviewMediaService({
      auth: { getUser },
      storage: { from: storageFrom },
    } as unknown as SupabaseClient);
    const file = new File([new Uint8Array([1, 2, 3])], "private-premix.mp3", {
      type: "audio/mpeg",
    });

    const mediaPath = await service.upload({ roomId: ROOM_ID, file });

    expect(mediaPath).toBe(`${ROOM_ID}/${USER_ID}/${OBJECT_ID}.mp3`);
    expect(mediaPath).not.toContain("private-premix");
    expect(storageFrom).toHaveBeenCalledWith(LOGE_PREVIEW_BUCKET);
    expect(upload).toHaveBeenCalledWith(mediaPath, file, {
      cacheControl: "3600",
      contentType: "audio/mpeg",
      upsert: false,
    });
  });

  it("does not touch Storage without an independently resolved user", async () => {
    const storageFrom = vi.fn();
    const service = createLogePreviewMediaService({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      storage: { from: storageFrom },
    } as unknown as SupabaseClient);
    const file = new File([new Uint8Array([1])], "private.wav", { type: "audio/wav" });

    await expect(service.upload({ roomId: ROOM_ID, file }))
      .rejects.toThrow("loge_preview_authentication_required");
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("removes only a canonical private path", async () => {
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const storageFrom = vi.fn().mockReturnValue({ remove });
    const service = createLogePreviewMediaService({
      storage: { from: storageFrom },
    } as unknown as SupabaseClient);
    const mediaPath = `${ROOM_ID}/${USER_ID}/${OBJECT_ID}.flac`;

    await service.remove(mediaPath);
    expect(storageFrom).toHaveBeenCalledWith(LOGE_PREVIEW_BUCKET);
    expect(remove).toHaveBeenCalledWith([mediaPath]);
    await expect(service.remove("../profile-media/private.mp3"))
      .rejects.toThrow("loge_preview_media_path_invalid");
  });

  it("requests a short-lived URL with roomId only", async () => {
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const invoke = vi.fn().mockResolvedValue({
      data: {
        signedUrl: "https://project.supabase.co/storage/v1/object/sign/room-loge-previews/token",
        expiresAt,
      },
      error: null,
    });
    const service = createLogePreviewMediaService({ functions: { invoke } } as unknown as SupabaseClient);

    await expect(service.requestUrl(ROOM_ID)).resolves.toEqual({
      signedUrl: "https://project.supabase.co/storage/v1/object/sign/room-loge-previews/token",
      expiresAt,
    });
    expect(invoke).toHaveBeenCalledWith("rooms-loge-preview-url", {
      body: { roomId: ROOM_ID },
    });
  });

  it("rejects an issuer response that leaks a persistent path", async () => {
    const invoke = vi.fn().mockResolvedValue({
      data: {
        signedUrl: "https://project.supabase.co/private",
        expiresAt: new Date(Date.now() + 120_000).toISOString(),
        mediaPath: `${ROOM_ID}/${USER_ID}/${OBJECT_ID}.wav`,
      },
      error: null,
    });
    const service = createLogePreviewMediaService({ functions: { invoke } } as unknown as SupabaseClient);

    await expect(service.requestUrl(ROOM_ID)).rejects.toThrow("loge_preview_url_invalid");
  });
});
