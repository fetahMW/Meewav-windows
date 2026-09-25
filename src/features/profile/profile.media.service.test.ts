import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  classifyMediaFile,
  classifyMarketplaceMediaFile,
  createProfileMediaRepository,
  filterOwnerMedia,
  mapMediaFileRecord,
  ProfileMediaServiceError,
  MARKETPLACE_MEDIA_ACCEPT,
  MARKETPLACE_MEDIA_MAX_SIZE_BYTES,
  type MediaFileRecord,
} from "./profile.media.service";

const ownerId = "00000000-0000-4000-8000-000000000001";
const mediaId = "00000000-0000-4000-8000-000000000101";
const currentYear = new Date().getUTCFullYear();

const baseMediaRecord: MediaFileRecord = {
  id: mediaId,
  user_id: ownerId,
  type: "audio",
  name: "Nocturne 01",
  format: "MP3",
  file_size: 4_200_000,
  size_bytes: 4_200_000,
  duration_ms: 127_000,
  file_url: null,
  cover_url: null,
  is_public: true,
  storage_bucket: "profile-media",
  storage_path: `${ownerId}/2026/nocturne.mp3`,
  mime_type: "audio/mpeg",
  status: "published",
  visibility: "public",
  produced_on_meewav: true,
  source_pillar: "rooms",
  metadata: { plays: 1_248, likes: 342 },
  scheduled_at: null,
  published_at: "2026-07-15T12:00:00.000Z",
  deleted_at: null,
  profile_order: 10,
  created_at: "2026-07-14T12:00:00.000Z",
  updated_at: "2026-07-15T12:00:00.000Z",
};

describe("profile media mappings", () => {
  it("maps the canonical media row to the existing profile card contract", () => {
    const item = mapMediaFileRecord(baseMediaRecord, "https://signed.example/nocturne.mp3");

    expect(item).toMatchObject({
      id: mediaId,
      title: "Nocturne 01",
      kind: "audio",
      status: "Publié",
      duration: "02:07",
      sourceUrl: "https://signed.example/nocturne.mp3",
      producedOnMeewav: true,
      isPublic: true,
      likes: "342",
    });
    expect(item.plays).toContain("1,2");
  });

  it("filters by media kind, Meewav production and normalized search", () => {
    const producedAudio = mapMediaFileRecord(baseMediaRecord, "https://signed.example/audio");
    const regularVideo = mapMediaFileRecord({
      ...baseMediaRecord,
      id: "00000000-0000-4000-8000-000000000102",
      type: "video",
      name: "Session Paris",
      produced_on_meewav: false,
    }, "https://signed.example/video");

    expect(filterOwnerMedia([producedAudio, regularVideo], "meewav", "")).toEqual([producedAudio]);
    expect(filterOwnerMedia([producedAudio, regularVideo], "video", "paris")).toEqual([regularVideo]);
    expect(filterOwnerMedia([producedAudio, regularVideo], "audio", "absent")).toEqual([]);
  });

  it("rejects unsupported and oversized browser files before Storage", () => {
    expect(() => classifyMediaFile({ name: "notes.txt", type: "text/plain", size: 20 })).toThrow(ProfileMediaServiceError);
    expect(() => classifyMediaFile({ name: "film.mp4", type: "video/mp4", size: 250 * 1024 * 1024 + 1 })).toThrow("250 Mo");
    expect(classifyMediaFile({ name: "pochette.webp", type: "", size: 20 })).toMatchObject({ kind: "image", mimeType: "image/webp" });
    expect(() => classifyMediaFile({ name: "pochette.jpg", type: "image/png", size: 20 })).toThrow("format");
    expect(() => classifyMediaFile({ name: "pochette", type: "image/jpeg", size: 20 })).toThrow("format");
  });

  it("uses one exact Market whitelist before creating a browser preview", () => {
    expect(MARKETPLACE_MEDIA_ACCEPT).toBe(".jpg,.jpeg,.png,.webp,.avif,.mp4,.mov,.webm");
    expect(classifyMarketplaceMediaFile({ name: "scene.MP4", type: "video/mp4", size: 2_000 })).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
    });
    expect(() => classifyMarketplaceMediaFile({ name: "contrat.pdf", type: "application/pdf", size: 2_000 })).toThrow("uniquement");
    expect(() => classifyMarketplaceMediaFile({
      name: "trop-lourd.webp",
      type: "image/webp",
      size: MARKETPLACE_MEDIA_MAX_SIZE_BYTES + 1,
    })).toThrow("12 Mo");
  });
});

describe("profile media repository", () => {
  it("enforces the stricter Market contract again at the upload boundary", async () => {
    const storageFrom = vi.fn();
    const repository = createProfileMediaRepository({ storage: { from: storageFrom } } as unknown as SupabaseClient);
    const oversizedMarketplaceImage = {
      name: "cover.webp",
      type: "image/webp",
      size: MARKETPLACE_MEDIA_MAX_SIZE_BYTES + 1,
    } as File;

    await expect(repository.uploadOwnerMedia(
      ownerId,
      oversizedMarketplaceImage,
      { sourcePillar: "marketplace" },
    )).rejects.toMatchObject({ code: "media-too-large" });
    expect(storageFrom).not.toHaveBeenCalled();
  });

  it("lists only the owner rows and signs private profile-media objects", async () => {
    const secondOrder = vi.fn().mockResolvedValue({ data: [baseMediaRecord], error: null });
    const firstOrder = vi.fn().mockReturnValue({ order: secondOrder });
    const is = vi.fn().mockReturnValue({ order: firstOrder });
    const eq = vi.fn().mockReturnValue({ is });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/nocturne.mp3" }, error: null });
    const storageFrom = vi.fn().mockReturnValue({ createSignedUrl });
    const repository = createProfileMediaRepository({ from, storage: { from: storageFrom } } as unknown as SupabaseClient);

    const items = await repository.listOwnerMedia(ownerId);

    expect(from).toHaveBeenCalledWith("media_files");
    expect(eq).toHaveBeenCalledWith("user_id", ownerId);
    expect(is).toHaveBeenCalledWith("deleted_at", null);
    expect(firstOrder).toHaveBeenCalledWith("profile_order", { ascending: true });
    expect(secondOrder).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(storageFrom).toHaveBeenCalledWith("profile-media");
    expect(createSignedUrl).toHaveBeenCalledWith(baseMediaRecord.storage_path, 21_600);
    expect(items[0].sourceUrl).toBe("https://signed.example/nocturne.mp3");
  });

  it("uploads from the Web, persists owner metadata and never writes the server-owned Meewav flag", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000999");
    const uploadedRecord = {
      ...baseMediaRecord,
      status: "draft",
      visibility: "private",
      is_public: false,
      produced_on_meewav: false,
      storage_path: `${ownerId}/${currentYear}/00000000-0000-4000-8000-000000000999-demo.mp3`,
    };
    const upload = vi.fn().mockResolvedValue({ data: { path: uploadedRecord.storage_path }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.example/upload.mp3" }, error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload, remove, createSignedUrl });
    const single = vi.fn().mockResolvedValue({ data: uploadedRecord, error: null });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = createProfileMediaRepository({ from, storage: { from: storageFrom } } as unknown as SupabaseClient);
    const file = new File([new Uint8Array([1, 2, 3])], "démo.mp3", { type: "audio/mpeg" });

    const item = await repository.uploadOwnerMedia(ownerId, file);

    expect(upload).toHaveBeenCalledWith(
      `${ownerId}/${currentYear}/00000000-0000-4000-8000-000000000999-demo.mp3`,
      file,
      expect.objectContaining({ contentType: "audio/mpeg", upsert: false }),
    );
    const payload = insert.mock.calls[0][0];
    expect(payload).toMatchObject({
      user_id: ownerId,
      type: "audio",
      name: "démo",
      storage_bucket: "profile-media",
      status: "draft",
      visibility: "private",
      source_pillar: "profile",
      metadata: { upload_source: "web" },
    });
    expect(payload).not.toHaveProperty("produced_on_meewav");
    expect(remove).not.toHaveBeenCalled();
    expect(item.sourceUrl).toBe("https://signed.example/upload.mp3");
  });

  it("removes the orphaned Storage object when the metadata insert fails", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000998");
    const upload = vi.fn().mockResolvedValue({ data: { path: "uploaded" }, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const storageFrom = vi.fn().mockReturnValue({ upload, remove });
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
    const select = vi.fn().mockReturnValue({ single });
    const insert = vi.fn().mockReturnValue({ select });
    const from = vi.fn().mockReturnValue({ insert });
    const repository = createProfileMediaRepository({ from, storage: { from: storageFrom } } as unknown as SupabaseClient);
    const file = new File([new Uint8Array([1])], "collision.mp3", { type: "audio/mpeg" });

    await expect(repository.uploadOwnerMedia(ownerId, file)).rejects.toMatchObject({ code: "media-upload-failed" });

    expect(remove).toHaveBeenCalledWith([
      `${ownerId}/${currentYear}/00000000-0000-4000-8000-000000000998-collision.mp3`,
    ]);
  });

  it("archives through the owner-scoped RPC instead of hard-deleting the row", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const repository = createProfileMediaRepository({ rpc } as unknown as SupabaseClient);

    await repository.archiveOwnerMedia(mediaId);

    expect(rpc).toHaveBeenCalledWith("archive_media_file", { p_media_id: mediaId });
  });

  it("conserve les métadonnées de publication Scène pendant la préparation privée", async () => {
    const current = { single: vi.fn().mockResolvedValue({ data: { metadata: { existing: true } }, error: null }) };
    const currentSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(current) }) });
    const updated = { single: vi.fn().mockResolvedValue({ data: {
      ...baseMediaRecord, file_url: "https://example.test/video.mp4", storage_bucket: null, storage_path: null,
    }, error: null }) };
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(updated) }) }) });
    const from = vi.fn().mockReturnValueOnce({ select: currentSelect }).mockReturnValueOnce({ update });
    const repository = createProfileMediaRepository({ from } as unknown as SupabaseClient);
    await repository.updateOwnerMediaDetails(ownerId, mediaId, {
      name: "Session multicam", description: "Live", contentType: "Session", city: "Paris", language: "fr", visibility: "private",
      sceneMetadata: { secondaryMediaId: "00000000-0000-4000-8000-000000000102", multicamLayout: "split" },
    });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      visibility: "private", metadata: expect.objectContaining({
        existing: true, scene_publication: expect.objectContaining({ multicamLayout: "split" }),
      }),
    }));
  });

  it("nettoie un upload Market temporaire uniquement après vérification du propriétaire et de son chemin", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: {
      user_id: ownerId, source_pillar: "marketplace", deleted_at: null,
      storage_bucket: "profile-media", storage_path: `${ownerId}/2026/market-cover.webp`,
    }, error: null });
    const eq = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const remove = vi.fn().mockResolvedValue({ data: [], error: null });
    const storageFrom = vi.fn().mockReturnValue({ remove });
    const repository = createProfileMediaRepository({ from, rpc, storage: { from: storageFrom } } as unknown as SupabaseClient);
    await repository.discardNewMarketplaceUpload(ownerId, mediaId);
    expect(rpc).toHaveBeenCalledWith("archive_media_file", { p_media_id: mediaId });
    expect(remove).toHaveBeenCalledWith([`${ownerId}/2026/market-cover.webp`]);
    expect(eq).toHaveBeenCalledWith("id", mediaId);
  });
});
