import { supabase } from "../../lib/supabaseClient";

export type SceneMediaLikeState = {
  mediaId: string;
  liked: boolean;
  likeCount: number;
};

export async function getSceneMediaLikeStates(mediaIds: readonly string[]) {
  const uniqueIds = [...new Set(mediaIds)].slice(0, 100);
  if (uniqueIds.length === 0) return [];
  const { data, error } = await supabase.rpc("get_scene_media_like_states", { p_media_ids: uniqueIds });
  if (error) throw error;
  return ((data ?? []) as Array<{ media_id: string; liked: boolean; like_count: number }>).map((row) => ({
    mediaId: row.media_id,
    liked: row.liked === true,
    likeCount: Math.max(0, Number(row.like_count) || 0),
  } satisfies SceneMediaLikeState));
}

export async function toggleSceneMediaLike(mediaId: string) {
  const { data, error } = await supabase.rpc("toggle_scene_media_like", { p_media_id: mediaId });
  if (error) throw error;
  const result = data as { mediaId?: string; liked?: boolean; likeCount?: number };
  return {
    mediaId: result.mediaId ?? mediaId,
    liked: result.liked === true,
    likeCount: Math.max(0, Number(result.likeCount) || 0),
  } satisfies SceneMediaLikeState;
}
