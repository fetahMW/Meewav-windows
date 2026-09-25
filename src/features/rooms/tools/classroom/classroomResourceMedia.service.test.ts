import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLASSROOM_RESOURCE_BUCKET,
  MAX_CLASSROOM_RESOURCE_BYTES,
  createClassroomResourceMediaService,
  validateClassroomResourceFile,
} from "./classroomResourceMedia.service";

const ROOM_ID = "870f6601-0a9e-4d74-b89c-63be031b3936";
const USER_ID = "74ee19ba-ad26-43a6-8574-7fb2977199a4";
const RESOURCE_ID = "8e21be33-e5e6-4d60-b741-19dedeb0a5d9";

afterEach(() => vi.restoreAllMocks());

describe("Classroom resource validation", () => {
  it("accepts images and audio while normalizing an absent MIME", () => {
    expect(validateClassroomResourceFile({ name: "support.PNG", type: "", size: 1024 }))
      .toEqual({ extension: "png", contentType: "image/png", kind: "image" });
    expect(validateClassroomResourceFile({ name: "exercice.M4A", type: "audio/mp4", size: 2048 }))
      .toEqual({ extension: "m4a", contentType: "audio/mp4", kind: "audio" });
  });

  it("rejects empty, oversized, unsupported and MIME-spoofed files", () => {
    expect(() => validateClassroomResourceFile({ name: "empty.png", type: "image/png", size: 0 }))
      .toThrow("class_resource_file_size_invalid");
    expect(() => validateClassroomResourceFile({ name: "large.wav", type: "audio/wav", size: MAX_CLASSROOM_RESOURCE_BYTES + 1 }))
      .toThrow("class_resource_file_size_invalid");
    expect(() => validateClassroomResourceFile({ name: "payload.html", type: "text/html", size: 12 }))
      .toThrow("class_resource_file_type_invalid");
    expect(() => validateClassroomResourceFile({ name: "spoofed.png", type: "audio/mpeg", size: 12 }))
      .toThrow("class_resource_file_type_invalid");
  });
});

describe("Classroom resource media service", () => {
  it("uploads to an opaque authenticated path", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(RESOURCE_ID);
    const upload = vi.fn().mockResolvedValue({ data: { path: "ignored" }, error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload });
    const service = createClassroomResourceMediaService({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null }) },
      storage: { from: storageFrom },
    } as unknown as SupabaseClient);
    const file = new File([new Uint8Array([1, 2, 3])], "portrait-eleve.jpg", { type: "image/jpeg" });

    await expect(service.upload({ roomId: ROOM_ID, file })).resolves.toEqual({
      mediaPath: `${ROOM_ID}/${USER_ID}/${RESOURCE_ID}.jpg`,
      contract: { extension: "jpg", contentType: "image/jpeg", kind: "image" },
    });
    expect(storageFrom).toHaveBeenCalledWith(CLASSROOM_RESOURCE_BUCKET);
    expect(upload).toHaveBeenCalledWith(`${ROOM_ID}/${USER_ID}/${RESOURCE_ID}.jpg`, file, {
      cacheControl: "3600",
      contentType: "image/jpeg",
      upsert: false,
    });
  });

  it("does not touch Storage without an authenticated user", async () => {
    const storageFrom = vi.fn();
    const service = createClassroomResourceMediaService({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
      storage: { from: storageFrom },
    } as unknown as SupabaseClient);
    await expect(service.upload({ roomId: ROOM_ID, file: new File(["x"], "cours.mp3", { type: "audio/mpeg" }) }))
      .rejects.toThrow("class_resource_authentication_required");
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("removes only canonical private paths", async () => {
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const storageFrom = vi.fn().mockReturnValue({ remove });
    const service = createClassroomResourceMediaService({ storage: { from: storageFrom } } as unknown as SupabaseClient);
    const path = `${ROOM_ID}/${USER_ID}/${RESOURCE_ID}.flac`;
    await service.remove(path);
    expect(remove).toHaveBeenCalledWith([path]);
    await expect(service.remove("../private.mp3")).rejects.toThrow("class_resource_media_path_invalid");
  });

  it("downloads a demo blob locally without calling Supabase", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const invoke = vi.fn();
    const service = createClassroomResourceMediaService({ functions: { invoke } } as unknown as SupabaseClient);
    await service.download({
      id: RESOURCE_ID,
      name: "fiche.png",
      kind: "image",
      mimeType: "image/png",
      size: 12,
      addedAt: new Date().toISOString(),
      mediaUrl: "blob:classe-resource",
    }, "demo-classe");
    expect(click).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("asks the server issuer for one id and rejects leaked paths", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const invoke = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://project.supabase.co/storage/v1/object/sign/room-classe-resources/token", expiresAt: new Date(Date.now() + 120_000).toISOString() },
      error: null,
    });
    const service = createClassroomResourceMediaService({ functions: { invoke } } as unknown as SupabaseClient);
    const resource = { id: RESOURCE_ID, name: "cours.mp3", kind: "audio" as const, mimeType: "audio/mpeg", size: 24, addedAt: new Date().toISOString() };
    await service.download(resource, ROOM_ID);
    expect(invoke).toHaveBeenCalledWith("rooms-classe-resource-url", { body: { roomId: ROOM_ID, resourceId: RESOURCE_ID } });
    expect(click).toHaveBeenCalledOnce();

    invoke.mockResolvedValueOnce({ data: { signedUrl: "https://project.supabase.co/private", mediaPath: `${ROOM_ID}/${USER_ID}/${RESOURCE_ID}.mp3` }, error: null });
    await expect(service.download(resource, ROOM_ID)).rejects.toThrow("class_resource_download_failed");
  });

  it("never turns an untrusted demo URL into a link", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const service = createClassroomResourceMediaService({} as SupabaseClient);
    await expect(service.download({
      id: RESOURCE_ID,
      name: "danger.png",
      kind: "image",
      mimeType: "image/png",
      size: 1,
      addedAt: new Date().toISOString(),
      mediaUrl: "javascript:alert(1)",
    }, "demo-classe")).rejects.toThrow("class_resource_download_failed");
    expect(click).not.toHaveBeenCalled();
  });
});
