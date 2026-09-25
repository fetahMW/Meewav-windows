import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabaseClient";
import type { ClassResource } from "../roomTools.types";

export const CLASSROOM_RESOURCE_BUCKET = "room-classe-resources";
export const MAX_CLASSROOM_RESOURCE_BYTES = 25 * 1024 * 1024;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RESOURCE_PATH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|gif|wav|mp3|aac|flac|m4a)$/iu;

const FILE_TYPES = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
  wav: ["audio/wav", "audio/x-wav"],
  mp3: ["audio/mpeg"],
  aac: ["audio/aac"],
  flac: ["audio/flac"],
  m4a: ["audio/mp4", "audio/x-m4a"],
} as const;

export const CLASSROOM_RESOURCE_ACCEPT = Object.values(FILE_TYPES).flat().join(",");

export type ClassroomResourceFileContract = {
  contentType: string;
  extension: keyof typeof FILE_TYPES;
  kind: ClassResource["kind"];
};

function extensionFor(name: string) {
  return name.split(".").pop()?.trim().toLowerCase() ?? "";
}

export function validateClassroomResourceFile(
  file: Pick<File, "name" | "type" | "size">,
): ClassroomResourceFileContract {
  if (file.size <= 0 || file.size > MAX_CLASSROOM_RESOURCE_BYTES) throw new Error("class_resource_file_size_invalid");
  const extension = extensionFor(file.name);
  if (!(extension in FILE_TYPES)) throw new Error("class_resource_file_type_invalid");
  const allowedTypes = FILE_TYPES[extension as keyof typeof FILE_TYPES] as readonly string[];
  const suppliedType = file.type.trim().toLowerCase();
  if (suppliedType && !allowedTypes.includes(suppliedType)) throw new Error("class_resource_file_type_invalid");
  const contentType = suppliedType || allowedTypes[0];
  return {
    contentType,
    extension: extension as keyof typeof FILE_TYPES,
    kind: contentType.startsWith("image/") ? "image" : "audio",
  };
}

function triggerDownload(url: string, name: string) {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

function parseDownloadAccess(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("class_resource_download_failed");
  const row = value as Record<string, unknown>;
  if ("mediaPath" in row || "media_path" in row || "bucket" in row) throw new Error("class_resource_download_failed");
  if (typeof row.signedUrl !== "string" || !row.signedUrl || row.signedUrl.length > 8_192) throw new Error("class_resource_download_failed");
  let signedUrl: URL;
  try {
    signedUrl = new URL(row.signedUrl);
  } catch {
    throw new Error("class_resource_download_failed");
  }
  if (signedUrl.protocol !== "https:" && signedUrl.protocol !== "http:") throw new Error("class_resource_download_failed");
  return signedUrl.toString();
}

export function createClassroomResourceMediaService(client: SupabaseClient = supabase) {
  return {
    async upload({ roomId, file }: { roomId: string; file: File }) {
      if (!UUID_PATTERN.test(roomId)) throw new Error("class_resource_room_invalid");
      const contract = validateClassroomResourceFile(file);
      const { data: authData, error: authError } = await client.auth.getUser();
      if (authError || !authData.user || !UUID_PATTERN.test(authData.user.id)) throw new Error("class_resource_authentication_required");
      const mediaPath = `${roomId}/${authData.user.id}/${crypto.randomUUID()}.${contract.extension}`;
      const { error } = await client.storage.from(CLASSROOM_RESOURCE_BUCKET).upload(mediaPath, file, {
        cacheControl: "3600",
        contentType: contract.contentType,
        upsert: false,
      });
      if (error) throw new Error("class_resource_upload_failed");
      return { mediaPath, contract };
    },

    async remove(mediaPath: string) {
      if (!RESOURCE_PATH_PATTERN.test(mediaPath) || mediaPath.length > 240) throw new Error("class_resource_media_path_invalid");
      const { error } = await client.storage.from(CLASSROOM_RESOURCE_BUCKET).remove([mediaPath]);
      if (error) throw new Error("class_resource_remove_failed");
    },

    async download(resource: ClassResource, roomId: string) {
      if (resource.mediaUrl) {
        if (!resource.mediaUrl.startsWith("blob:")) throw new Error("class_resource_download_failed");
        triggerDownload(resource.mediaUrl, resource.name);
        return;
      }
      if (!UUID_PATTERN.test(roomId) || !UUID_PATTERN.test(resource.id)) throw new Error("class_resource_download_failed");
      const { data, error } = await client.functions.invoke("rooms-classe-resource-url", {
        body: { roomId, resourceId: resource.id },
      });
      if (error) throw new Error("class_resource_download_failed");
      triggerDownload(parseDownloadAccess(data), resource.name);
    },
  };
}

export const classroomResourceMediaService = createClassroomResourceMediaService();

export function uploadClassroomResource(roomId: string, file: File) {
  return classroomResourceMediaService.upload({ roomId, file });
}

export function removeClassroomResource(mediaPath: string) {
  return classroomResourceMediaService.remove(mediaPath);
}

export function downloadClassroomResource(resource: ClassResource, roomId: string) {
  return classroomResourceMediaService.download(resource, roomId);
}
