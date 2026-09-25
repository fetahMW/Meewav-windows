import { supabase } from "../../lib/supabaseClient";
import type { PublicPreProfile, PublishedPreProfileMedia } from "../globe/api/preProfile.api";
import type { ShortsVideoItem } from "../shorts/shorts-wall-data";

const SCENE_CATALOG_LIMIT = 48;
const SIGNED_MEDIA_TTL_SECONDS = 60 * 60;

function durationLabel(durationMs: number | null) {
  if (!durationMs || durationMs < 1) return "0:00";
  const seconds = Math.round(durationMs / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function roleLabel(value: string | null) {
  if (!value) return "Artiste";
  return value.replace(/[_-]+/g, " ").replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("fr-FR"));
}

async function resolveMediaUrl(media: PublishedPreProfileMedia) {
  if (media.file_url) return media.file_url;
  if (!media.storage_bucket || !media.storage_path) return null;
  const { data, error } = await supabase.storage
    .from(media.storage_bucket)
    .createSignedUrl(media.storage_path, SIGNED_MEDIA_TTL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/**
 * Loads the real public La Scène catalogue. The caller uses demo fixtures
 * only in local preview, so Profile, Message, Collab, Follow and Golden Like
 * receive canonical UUIDs in a real session.
 */
async function hydrateScenePage(pageRows: PublishedPreProfileMedia[]): Promise<ShortsVideoItem[]> {
  // A published secondary camera is accessible to the viewer, but is not a separate performance.
  const media = pageRows.filter((item) => {
    const metadata = (item as PublishedPreProfileMedia & {metadata?: Record<string, any>}).metadata ?? {};
    return typeof metadata.scene_publication?.secondaryOf !== "string";
  });
  const ownerIds = [...new Set(media.map(({ owner_profile_id: ownerId }) => ownerId).filter(Boolean))];
  if (ownerIds.length === 0) return [];

  const { data: profileRows, error: profileError } = await supabase
    .from("public_profiles")
    .select("id,username,display_name,bio,avatar_url,avatar_style_key,primary_role_key,city,country_code,zone_name,profile_image_url,collab_available,is_online,followers_count,following_count,grade,is_verified,golden_likes_count")
    .in("id", ownerIds);
  if (profileError) throw profileError;

  const profiles = new Map(((profileRows ?? []) as unknown as PublicPreProfile[]).map((profile) => [profile.id, profile]));
  const rows = await Promise.all(media.map(async (item): Promise<ShortsVideoItem | null> => {
    const profile = profiles.get(item.owner_profile_id);
    const mediaUrl = await resolveMediaUrl(item);
    if (!profile || !mediaUrl) return null;
    const metadata = (item as PublishedPreProfileMedia & {metadata?:Record<string,any>}).metadata ?? {};
    const publication = metadata.scene_publication ?? {};
    let secondaryVideo: string | undefined;
    if(typeof publication.secondaryMediaId === "string") {
      const {data:secondary}=await supabase.from("published_media_files").select("file_url,storage_bucket,storage_path").eq("id",publication.secondaryMediaId).maybeSingle();
      if(secondary) secondaryVideo=(await resolveMediaUrl(secondary as PublishedPreProfileMedia)) ?? undefined;
    }
    const portraitFormat = publication.format === "portrait";
    const isAudio = item.type.toLocaleLowerCase("fr-FR") === "audio";
    const artist = profile.display_name?.trim() || profile.username?.trim() || "Artiste MeeWav";
    const portrait = profile.profile_image_url || profile.avatar_url || undefined;
    const coverReference=metadata.scene_cover;
    const signedCover=coverReference?.storage_bucket && coverReference?.storage_path
      ? await supabase.storage.from(coverReference.storage_bucket).createSignedUrl(coverReference.storage_path,SIGNED_MEDIA_TTL_SECONDS) : null;
    const cover = signedCover?.data?.signedUrl || item.cover_url || portrait || "/images/shorts/catalog-v3/daily-01-soul-singer.webp";
    const grade = Math.min(6, Math.max(1, Math.trunc(profile.grade ?? 1))) as 1 | 2 | 3 | 4 | 5 | 6;
    return {
      id: item.id,
      artistId: profile.id,
      mockArtistId: profile.id,
      profileId: profile.id,
      title: item.name?.trim() || "Création sans titre",
      artist,
      publisher: { type: "artist", artistId: profile.id, name: artist },
      artistPortrait: portrait,
      image: cover,
      video: mediaUrl,
      secondaryVideo,
      multicamLayout: secondaryVideo ? publication.multicamLayout : undefined,
      audioUrl: isAudio ? mediaUrl : undefined,
      format: portraitFormat ? "portrait" : "landscape",
      presentationFormat: isAudio ? "audio_visualizer" : portraitFormat ? "vertical" : "landscape",
      sourceFormat: "landscape",
      alt: `${artist} présente ${item.name?.trim() || "une création"}`,
      duration: durationLabel(item.duration_ms),
      contentTypeLabel: isAudio ? "Performance" : "Clip",
      meta: `${roleLabel(profile.primary_role_key)} · ${isAudio ? "Audio visualizer" : item.format || "Vidéo"}`,
      role: roleLabel(profile.primary_role_key),
      city: profile.city?.trim() || profile.country_code?.trim() || "MeeWav",
      views: "Nouveau",
      gradeLevel: grade,
      likeCount: 0,
      goldenLikeCount: Math.max(0, profile.golden_likes_count ?? 0),
      availability: profile.collab_available ? "Ouvert aux collaborations" : undefined,
      collabAvailable: profile.collab_available,
      description: (typeof metadata.scene_description === "string" ? metadata.scene_description : "") || "Création publiée dans La Scène.",
      publicationLinks: Array.isArray(publication.publicationLinks) ? publication.publicationLinks.filter((link:any)=>typeof link?.label === "string" && typeof link?.url === "string" && /^https?:\/\//i.test(link.url)) : [],
      hashtags: Array.isArray(publication.hashtags) ? publication.hashtags.filter((tag:any)=>typeof tag === "string") : [],
      credits: (Array.isArray(publication.credits) ? publication.credits : []).filter((credit:any)=>typeof credit?.displayName === "string" && typeof credit?.role === "string").map((credit:any)=>({name:credit.displayName,role:credit.role})),
      associatedContent: publication.associatedContent ?? undefined,
      publishedAt: item.published_at ?? undefined,
      verified: profile.is_verified,
    };
  }));
  return rows.filter((item): item is ShortsVideoItem => item !== null);
}

export async function getPublishedSceneCatalogPage(limit = SCENE_CATALOG_LIMIT, offset = 0, mediaId?: string): Promise<{ items: ShortsVideoItem[]; nextOffset: number; hasMore: boolean }> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), SCENE_CATALOG_LIMIT));
  const safeOffset = Math.max(0, Math.trunc(offset));
  let query = supabase
    .from("published_media_files")
    .select("id,owner_profile_id,type,name,format,duration_ms,file_url,cover_url,storage_bucket,storage_path,mime_type,source_pillar,published_at,metadata")
    .in("type", ["video", "audio"]);
  if (mediaId) query = query.eq("id", mediaId);
  const {data:mediaRows,error:mediaError}=await query
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (mediaError) throw mediaError;
  const pageRows = (mediaRows ?? []) as unknown as PublishedPreProfileMedia[];
  return {
    items: await hydrateScenePage(pageRows),
    nextOffset: safeOffset + pageRows.length,
    hasMore: pageRows.length === safeLimit,
  };
}

export async function searchPublishedSceneCatalogPage(search: string, limit = SCENE_CATALOG_LIMIT, offset = 0): Promise<{ items: ShortsVideoItem[]; nextOffset: number; hasMore: boolean }> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), SCENE_CATALOG_LIMIT));
  const safeOffset = Math.max(0, Math.trunc(offset));
  const { data, error } = await supabase.rpc("scene_search_catalog_v1", {
    p_query: search.trim().slice(0, 120), p_limit: safeLimit, p_offset: safeOffset,
  });
  if (error) throw error;
  const pageRows = (data ?? []) as unknown as PublishedPreProfileMedia[];
  return {
    items: await hydrateScenePage(pageRows),
    nextOffset: safeOffset + pageRows.length,
    hasMore: pageRows.length === safeLimit,
  };
}

export async function getPublishedSceneCatalog(limit = SCENE_CATALOG_LIMIT, mediaId?: string): Promise<ShortsVideoItem[]> {
  return (await getPublishedSceneCatalogPage(limit, 0, mediaId)).items;
}
