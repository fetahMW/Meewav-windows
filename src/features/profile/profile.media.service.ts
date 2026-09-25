import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import type { MediaItem, MediaKind } from "./profile.data";

type JsonRecord = Record<string, unknown>;

export type MediaFileRecord = {
  id: string;
  user_id: string;
  type: string;
  name: string;
  format: string | null;
  file_size: number | null;
  size_bytes: number | null;
  duration_ms: number | null;
  file_url: string | null;
  cover_url: string | null;
  is_public: boolean | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  status: string | null;
  visibility: string | null;
  produced_on_meewav: boolean | null;
  source_pillar: string | null;
  metadata: unknown;
  scheduled_at: string | null;
  published_at: string | null;
  deleted_at: string | null;
  profile_order: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type OwnerMediaItem = MediaItem & {
  isPublic: boolean;
};

export type MediaLibraryFilter = "all" | MediaKind | "meewav";

export type ProfileMediaServiceErrorCode =
  | "media-list-failed"
  | "media-upload-failed"
  | "media-update-failed"
  | "media-archive-failed"
  | "media-url-failed"
  | "unsupported-media"
  | "media-too-large";

export class ProfileMediaServiceError extends Error {
  readonly code: ProfileMediaServiceErrorCode;

  constructor(code: ProfileMediaServiceErrorCode, message: string) {
    super(message);
    this.name = "ProfileMediaServiceError";
    this.code = code;
  }
}

const PROFILE_MEDIA_BUCKET = "profile-media";
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60;
const MAX_MEDIA_SIZE_BYTES = 250 * 1024 * 1024;
export const MARKETPLACE_MEDIA_MAX_SIZE_BYTES = 12 * 1024 * 1024;
export const MARKETPLACE_MEDIA_ACCEPT = ".jpg,.jpeg,.png,.webp,.avif,.mp4,.mov,.webm";

const MEDIA_SELECT = [
  "id",
  "user_id",
  "type",
  "name",
  "format",
  "file_size",
  "size_bytes",
  "duration_ms",
  "file_url",
  "cover_url",
  "is_public",
  "storage_bucket",
  "storage_path",
  "mime_type",
  "status",
  "visibility",
  "produced_on_meewav",
  "source_pillar",
  "metadata",
  "scheduled_at",
  "published_at",
  "deleted_at",
  "profile_order",
  "created_at",
  "updated_at",
].join(",");

const LEGACY_MEDIA_SELECT = [
  "id",
  "user_id",
  "type",
  "name",
  "format",
  "file_size",
  "duration_ms",
  "file_url",
  "cover_url",
  "is_public",
  "created_at",
  "updated_at",
].join(",");

const kindAccents: Record<MediaKind, string> = {
  audio: "#8b5cff",
  video: "#d946ef",
  image: "#f45f9a",
  document: "#19b8ff",
};

const supportedMimeTypes = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "application/pdf",
]);

const extensionMimeTypes: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  flac: "audio/flac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  pdf: "application/pdf",
};

const extensionAllowedMimeTypes: Record<string, ReadonlySet<string>> = {
  mp3: new Set(["audio/mpeg"]),
  m4a: new Set(["audio/mp4"]),
  wav: new Set(["audio/wav", "audio/x-wav"]),
  flac: new Set(["audio/flac"]),
  mp4: new Set(["video/mp4"]),
  mov: new Set(["video/quicktime"]),
  webm: new Set(["video/webm"]),
  jpg: new Set(["image/jpeg"]),
  jpeg: new Set(["image/jpeg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
  avif: new Set(["image/avif"]),
  pdf: new Set(["application/pdf"]),
};

function asRecord(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function readString(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compactNumber(value: number | null, fallback: string) {
  if (value === null) return fallback;
  return new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value)).replace("k", " k");
}

function normalizeMediaKind(value: string | null | undefined): MediaKind {
  switch (value?.toLocaleLowerCase("fr-FR")) {
    case "audio": return "audio";
    case "video": return "video";
    case "image": return "image";
    case "pdf":
    case "document": return "document";
    default: return "document";
  }
}

function statusLabel(status: string | null, isPublic: boolean): MediaItem["status"] {
  if (status === "scheduled") return "Programmé";
  if (status === "published" || isPublic) return "Publié";
  return "Brouillon";
}

function formatDuration(durationMs: number | null) {
  if (!durationMs || durationMs < 0) return undefined;
  const seconds = Math.round(durationMs / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatFileSize(sizeBytes: number | null) {
  if (sizeBytes === null || sizeBytes < 0) return undefined;
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} Ko`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(sizeBytes / 1024 / 1024)} Mo`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(sizeBytes / 1024 / 1024 / 1024)} Go`;
}

function formatMediaDate(value: string | null) {
  if (!value) return "Date inconnue";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" }).format(timestamp);
}

function isDirectAssetUrl(value: string | null | undefined) {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith("/") || value.startsWith("blob:") || value.startsWith("data:")));
}

function isAdditiveSchemaCompatibilityError(error: unknown) {
  const record = asRecord(error);
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  return code === "PGRST204" || code === "42703" || /storage_bucket|produced_on_meewav|deleted_at/i.test(message);
}

function extensionFor(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase("fr-FR") ?? "";
}

export function classifyMediaFile(file: Pick<File, "name" | "type" | "size">) {
  if (file.size > MAX_MEDIA_SIZE_BYTES) {
    throw new ProfileMediaServiceError("media-too-large", "Ce fichier dépasse la limite de 250 Mo.");
  }

  const extension = extensionFor(file.name);
  const declaredMimeType = file.type.trim().toLocaleLowerCase("en-US");
  const allowedMimeTypes = extensionAllowedMimeTypes[extension];
  const mimeType = declaredMimeType || extensionMimeTypes[extension] || "";
  if (!allowedMimeTypes
    || !supportedMimeTypes.has(mimeType)
    || (declaredMimeType !== "" && !allowedMimeTypes.has(declaredMimeType))) {
    throw new ProfileMediaServiceError("unsupported-media", "Ce format n’est pas pris en charge par la médiathèque.");
  }

  const kind: MediaKind = mimeType.startsWith("audio/")
    ? "audio"
    : mimeType.startsWith("video/")
      ? "video"
      : mimeType.startsWith("image/")
        ? "image"
        : "document";

  return {
    kind,
    mimeType,
    extension: extension || mimeType.split("/")[1] || "bin",
  };
}

export function classifyMarketplaceMediaFile(
  file: Pick<File, "name" | "type" | "size">,
): ReturnType<typeof classifyMediaFile> & { kind: "image" | "video" } {
  if (file.size > MARKETPLACE_MEDIA_MAX_SIZE_BYTES) {
    throw new ProfileMediaServiceError("media-too-large", "Ce fichier dépasse la limite de 12 Mo du Market.");
  }
  const classified = classifyMediaFile(file);
  if (classified.kind !== "image" && classified.kind !== "video") {
    throw new ProfileMediaServiceError(
      "unsupported-media",
      "Le Market accepte uniquement les images JPG, PNG, WebP, AVIF et les vidéos MP4, MOV ou WebM.",
    );
  }
  return classified as ReturnType<typeof classifyMediaFile> & { kind: "image" | "video" };
}

export function mapMediaFileRecord(
  record: MediaFileRecord,
  resolvedSourceUrl?: string,
  resolvedCoverUrl?: string,
): OwnerMediaItem {
  const metadata = asRecord(record.metadata);
  const kind = normalizeMediaKind(record.type);
  const isPublic = record.status === "published" && record.visibility === "public"
    ? true
    : record.status == null && record.visibility == null && record.is_public === true;
  const sizeBytes = record.size_bytes ?? record.file_size;
  const format = record.format?.trim().toLocaleUpperCase("fr-FR")
    || record.mime_type?.split("/")[1]?.toLocaleUpperCase("fr-FR")
    || kind.toLocaleUpperCase("fr-FR");
  const sourceUrl = resolvedSourceUrl || (isDirectAssetUrl(record.file_url) ? record.file_url ?? undefined : undefined);
  const cover = resolvedCoverUrl
    || (isDirectAssetUrl(record.cover_url) ? record.cover_url ?? undefined : undefined)
    || (kind === "image" ? sourceUrl : undefined);
  const previewLines = Array.isArray(metadata.preview_lines)
    ? metadata.preview_lines.filter((line): line is string => typeof line === "string").slice(0, 6)
    : undefined;
  const metadataAccent = readString(metadata, "accent");

  return {
    id: record.id,
    title: record.name?.trim() || "Contenu sans titre",
    kind,
    meta: `${format} · ${formatMediaDate(record.published_at ?? record.created_at)}`,
    status: statusLabel(record.status, isPublic),
    accent: metadataAccent && /^#[0-9a-f]{6}$/i.test(metadataAccent) ? metadataAccent : kindAccents[kind],
    cover,
    plays: compactNumber(readNumber(metadata, "plays"), "0"),
    duration: formatDuration(record.duration_ms),
    fileSize: formatFileSize(sizeBytes),
    likes: compactNumber(readNumber(metadata, "likes"), "0"),
    sourceUrl,
    previewLines,
    producedOnMeewav: record.produced_on_meewav === true,
    isPublic,
  };
}

export function filterOwnerMedia(items: OwnerMediaItem[], filter: MediaLibraryFilter, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
  return items.filter((item) => {
    const matchesKind = filter === "all"
      || (filter === "meewav" ? item.producedOnMeewav === true : item.kind === filter);
    const matchesQuery = !normalizedQuery
      || `${item.title} ${item.meta} ${item.status}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
    return matchesKind && matchesQuery;
  });
}

function safeStorageSegment(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 120) || "media";
}

function titleFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, "").trim().slice(0, 180) || "Nouveau contenu";
}

export type ProfileMediaRepository = ReturnType<typeof createProfileMediaRepository>;

export function createProfileMediaRepository(client: SupabaseClient = supabase) {
  const resolveAssetUrl = async (record: MediaFileRecord) => {
    if (isDirectAssetUrl(record.file_url)) return record.file_url ?? undefined;
    if (!record.storage_bucket || !record.storage_path) return undefined;

    // `profile-media` remains private even for published metadata, therefore a
    // browser media element always receives a temporary signed URL. Other
    // explicitly public buckets can use their stable public endpoint.
    if (record.storage_bucket !== PROFILE_MEDIA_BUCKET
      && record.status === "published"
      && record.visibility === "public") {
      const { data } = client.storage.from(record.storage_bucket).getPublicUrl(record.storage_path);
      return data.publicUrl;
    }

    const { data, error } = await client.storage
      .from(record.storage_bucket)
      .createSignedUrl(record.storage_path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new ProfileMediaServiceError("media-url-failed", "L’aperçu sécurisé de ce contenu n’est pas disponible.");
    }
    return data.signedUrl;
  };

  const hydrateRecord = async (record: MediaFileRecord) => {
    let sourceUrl: string | undefined;
    try {
      sourceUrl = await resolveAssetUrl(record);
    } catch {
      // A failed preview must not hide the metadata card. The player will
      // expose its existing “aperçu indisponible” state instead.
      sourceUrl = undefined;
    }
    return mapMediaFileRecord(record, sourceUrl);
  };

  const listLegacyOwnerMedia = async (ownerId: string) => {
    const { data, error } = await client
      .from("media_files")
      .select(LEGACY_MEDIA_SELECT)
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) {
      throw new ProfileMediaServiceError("media-list-failed", "Impossible de charger la médiathèque pour le moment.");
    }
    return Promise.all((data ?? []).map((row) => hydrateRecord(row as unknown as MediaFileRecord)));
  };

  return {
    async listOwnerMedia(ownerId: string) {
      const result = await client
        .from("media_files")
        .select(MEDIA_SELECT)
        .eq("user_id", ownerId)
        .is("deleted_at", null)
        .order("profile_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (result.error && isAdditiveSchemaCompatibilityError(result.error)) {
        return listLegacyOwnerMedia(ownerId);
      }
      if (result.error) {
        throw new ProfileMediaServiceError("media-list-failed", "Impossible de charger la médiathèque pour le moment.");
      }
      return Promise.all((result.data ?? []).map((row) => hydrateRecord(row as unknown as MediaFileRecord)));
    },

    async uploadOwnerMedia(
      ownerId: string,
      file: File,
      options: { sourcePillar?: "profile" | "marketplace" | "shorts" } = {},
    ) {
      const classified = options.sourcePillar === "marketplace"
        ? classifyMarketplaceMediaFile(file)
        : classifyMediaFile(file);
      const storagePath = `${ownerId}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}-${safeStorageSegment(file.name)}`;
      const storage = client.storage.from(PROFILE_MEDIA_BUCKET);
      const uploadResult = await storage.upload(storagePath, file, {
        cacheControl: "3600",
        contentType: classified.mimeType,
        upsert: false,
      });

      if (uploadResult.error) {
        throw new ProfileMediaServiceError("media-upload-failed", `L’import de « ${file.name} » a échoué.`);
      }

      const insertPayload = {
        user_id: ownerId,
        type: classified.kind,
        name: titleFromFilename(file.name),
        format: classified.extension.toLocaleUpperCase("fr-FR"),
        file_size: file.size,
        size_bytes: file.size,
        duration_ms: null,
        file_url: null,
        cover_url: null,
        storage_bucket: PROFILE_MEDIA_BUCKET,
        storage_path: storagePath,
        mime_type: classified.mimeType,
        status: "draft",
        visibility: "private",
        source_pillar: options.sourcePillar ?? "profile",
        metadata: {
          upload_source: "web",
          upload_context: options.sourcePillar ?? "profile",
        },
      };

      const { data, error } = await client
        .from("media_files")
        .insert(insertPayload)
        .select(MEDIA_SELECT)
        .single();

      if (error || !data) {
        await storage.remove([storagePath]);
        throw new ProfileMediaServiceError("media-upload-failed", `L’import de « ${file.name} » n’a pas pu être enregistré.`);
      }

      return hydrateRecord(data as unknown as MediaFileRecord);
    },

    async renameOwnerMedia(ownerId: string, mediaId: string, name: string) {
      const safeName = name.trim().slice(0, 180);
      if (!safeName) throw new ProfileMediaServiceError("media-update-failed", "Le contenu doit avoir un nom.");
      const { data, error } = await client
        .from("media_files")
        .update({ name: safeName })
        .eq("user_id", ownerId)
        .eq("id", mediaId)
        .select(MEDIA_SELECT)
        .single();
      if (error || !data) {
        throw new ProfileMediaServiceError("media-update-failed", "Le contenu n’a pas pu être renommé.");
      }
      return hydrateRecord(data as unknown as MediaFileRecord);
    },

    async updateOwnerMediaDetails(
      ownerId: string,
      mediaId: string,
      details: {
        name: string;
        sceneMetadata?: Record<string, unknown>;
        description: string;
        contentType: string;
        city: string;
        language: string;
        visibility: "public" | "unlisted" | "private";
      },
    ) {
      const safeName = details.name.trim().slice(0, 180);
      if (!safeName) throw new ProfileMediaServiceError("media-update-failed", "Le contenu doit avoir un titre.");
      const { data: current, error: currentError } = await client
        .from("media_files")
        .select("metadata")
        .eq("user_id", ownerId)
        .eq("id", mediaId)
        .single();
      if (currentError) throw new ProfileMediaServiceError("media-update-failed", "Les détails du contenu sont indisponibles.");
      const metadata = asRecord((current as { metadata?: unknown } | null)?.metadata);
      const isPublic = details.visibility === "public";
      const { data, error } = await client
        .from("media_files")
        .update({
          name: safeName,
          status: isPublic ? "published" : "ready",
          visibility: details.visibility,
          published_at: isPublic ? new Date().toISOString() : null,
          metadata: {
            ...metadata,
            ...(details.sceneMetadata ? { scene_publication: details.sceneMetadata } : {}),
            scene_description: details.description.trim().slice(0, 5_000),
            scene_content_type: details.contentType.trim().slice(0, 80),
            scene_city: details.city.trim().slice(0, 100),
            scene_language: details.language.trim().slice(0, 24),
          },
        })
        .eq("user_id", ownerId)
        .eq("id", mediaId)
        .select(MEDIA_SELECT)
        .single();
      if (error || !data) throw new ProfileMediaServiceError("media-update-failed", "Les modifications n’ont pas pu être enregistrées.");
      return hydrateRecord(data as unknown as MediaFileRecord);
    },

    async setOwnerMediaVisibility(ownerId: string, mediaId: string, isPublic: boolean) {
      const { data, error } = await client
        .from("media_files")
        .update(isPublic
          ? { status: "published", visibility: "public", published_at: new Date().toISOString() }
          : { status: "ready", visibility: "private" })
        .eq("user_id", ownerId)
        .eq("id", mediaId)
        .select(MEDIA_SELECT)
        .single();
      if (error || !data) {
        throw new ProfileMediaServiceError("media-update-failed", "La visibilité du contenu n’a pas pu être modifiée.");
      }
      return hydrateRecord(data as unknown as MediaFileRecord);
    },

    async archiveOwnerMedia(mediaId: string) {
      const { data, error } = await client.rpc("archive_media_file", { p_media_id: mediaId });
      if (error || data !== true) {
        throw new ProfileMediaServiceError("media-archive-failed", "Le contenu n’a pas pu être archivé.");
      }
    },

    async discardNewMarketplaceUpload(ownerId: string, mediaId: string) {
      const { data, error } = await client
        .from("media_files")
        .select("user_id,storage_bucket,storage_path,source_pillar,deleted_at")
        .eq("id", mediaId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (error || !data || data.source_pillar !== "marketplace") {
        throw new ProfileMediaServiceError("media-archive-failed", "Le visuel temporaire n’a pas pu être vérifié.");
      }
      if (!data.deleted_at) await this.archiveOwnerMedia(mediaId);
      if (data.storage_bucket === PROFILE_MEDIA_BUCKET && data.storage_path?.startsWith(`${ownerId}/`)) {
        const removed = await client.storage.from(PROFILE_MEDIA_BUCKET).remove([data.storage_path]);
        if (removed.error) {
          throw new ProfileMediaServiceError("media-archive-failed", "Le visuel archivé n’a pas pu être nettoyé du stockage.");
        }
      }
    },

    async discardNewShortsUpload(ownerId: string, mediaId: string) {
      const { data, error } = await client
        .from("media_files")
        .select("user_id,storage_bucket,storage_path,source_pillar,deleted_at")
        .eq("id", mediaId)
        .eq("user_id", ownerId)
        .maybeSingle();
      if (error || !data || data.source_pillar !== "shorts") {
        throw new ProfileMediaServiceError("media-archive-failed", "Le fichier interrompu n’a pas pu être vérifié.");
      }
      if (!data.deleted_at) await this.archiveOwnerMedia(mediaId);
      if (data.storage_bucket === PROFILE_MEDIA_BUCKET && data.storage_path?.startsWith(`${ownerId}/`)) {
        const removed = await client.storage.from(PROFILE_MEDIA_BUCKET).remove([data.storage_path]);
        if (removed.error) {
          throw new ProfileMediaServiceError("media-archive-failed", "Le fichier archivé n’a pas pu être nettoyé du stockage.");
        }
      }
    },
  };
}

export const profileMediaRepository = createProfileMediaRepository();
