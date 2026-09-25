import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabaseClient";

export const LOGE_PREVIEW_BUCKET = "room-loge-previews";
export const MAX_LOGE_PREVIEW_FILE_BYTES = 25 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MEDIA_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(wav|mp3|aac|flac|m4a|mp4|webm|jpg|jpeg|png|webp)$/iu;

const FILE_TYPES: Record<string, readonly string[]> = {
  wav: ["audio/wav", "audio/x-wav"],
  mp3: ["audio/mpeg"],
  aac: ["audio/aac"],
  flac: ["audio/flac"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
};

export type LogePreviewMediaFileContract = {
  contentType: string;
  extension: keyof typeof FILE_TYPES;
  kind: "audio" | "video" | "image";
};

export type LogePreviewMediaAccess = {
  signedUrl: string;
  expiresAt: string;
};

function mediaExtension(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function validMediaPath(mediaPath: string) {
  return mediaPath.length <= 240 && MEDIA_PATH_PATTERN.test(mediaPath);
}

function parseMediaAccess(value: unknown): LogePreviewMediaAccess {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("loge_preview_url_invalid");
  }
  const row = value as Record<string, unknown>;
  if ("mediaPath" in row || "media_path" in row || "bucket" in row) {
    throw new Error("loge_preview_url_invalid");
  }
  if (
    typeof row.signedUrl !== "string"
    || row.signedUrl.length === 0
    || row.signedUrl.length > 8_192
    || typeof row.expiresAt !== "string"
  ) {
    throw new Error("loge_preview_url_invalid");
  }
  let url: URL;
  try {
    url = new URL(row.signedUrl);
  } catch {
    throw new Error("loge_preview_url_invalid");
  }
  const expiresAt = Date.parse(row.expiresAt);
  if (
    (url.protocol !== "https:" && url.protocol !== "http:")
    || !Number.isFinite(expiresAt)
    || expiresAt <= Date.now()
  ) {
    throw new Error("loge_preview_url_invalid");
  }
  return { signedUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
}

export function validateLogePreviewMediaFile(
  file: Pick<File, "name" | "type" | "size">,
): LogePreviewMediaFileContract {
  if (file.size <= 0 || file.size > MAX_LOGE_PREVIEW_FILE_BYTES) {
    throw new Error("loge_preview_file_size_invalid");
  }
  const extension = mediaExtension(file.name);
  if (!(extension in FILE_TYPES)) throw new Error("loge_preview_file_type_invalid");
  const allowedTypes = FILE_TYPES[extension];
  const suppliedType = file.type.trim().toLowerCase();
  if (suppliedType && !allowedTypes.includes(suppliedType)) {
    throw new Error("loge_preview_file_type_invalid");
  }
  const contentType = suppliedType || allowedTypes[0];
  return {
    contentType,
    extension: extension as keyof typeof FILE_TYPES,
    kind: contentType.startsWith("video/") ? "video" : contentType.startsWith("image/") ? "image" : "audio",
  };
}

export function createLogePreviewMediaService(client: SupabaseClient = supabase) {
  return {
    async upload({ roomId, file }: { roomId: string; file: File }) {
      if (!UUID_PATTERN.test(roomId)) throw new Error("loge_preview_room_invalid");
      const contract = validateLogePreviewMediaFile(file);
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user || !UUID_PATTERN.test(authData.user.id)) {
        throw new Error("loge_preview_authentication_required");
      }
      const mediaPath = `${roomId}/${authData.user.id}/${crypto.randomUUID()}.${contract.extension}`;
      const { error } = await client.storage.from(LOGE_PREVIEW_BUCKET).upload(
        mediaPath,
        file,
        {
          cacheControl: "3600",
          contentType: contract.contentType,
          upsert: false,
        },
      );
      if (error) throw new Error("loge_preview_upload_failed");
      return mediaPath;
    },

    async remove(mediaPath: string) {
      if (!validMediaPath(mediaPath)) throw new Error("loge_preview_media_path_invalid");
      const { error } = await client.storage.from(LOGE_PREVIEW_BUCKET).remove([mediaPath]);
      if (error) throw new Error("loge_preview_remove_failed");
    },

    async requestUrl(roomId: string) {
      if (!UUID_PATTERN.test(roomId)) throw new Error("loge_preview_room_invalid");
      const { data, error } = await client.functions.invoke("rooms-loge-preview-url", {
        body: { roomId },
      });
      if (error) throw new Error("loge_preview_url_failed");
      return parseMediaAccess(data);
    },
  };
}

export const logePreviewMediaService = createLogePreviewMediaService();

export function uploadLogePreviewMedia(args: { roomId: string; file: File }) {
  return logePreviewMediaService.upload(args);
}

export function removeLogePreviewMedia(mediaPath: string) {
  return logePreviewMediaService.remove(mediaPath);
}

export function requestLogePreviewMediaUrl(roomId: string) {
  return logePreviewMediaService.requestUrl(roomId);
}
