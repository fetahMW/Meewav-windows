import { supabase } from "../../lib/supabaseClient";
import { isMessagingUuid } from "../messaging/messaging.route";

export const SCENE_ANALYTICS_EVENT_NAME = "meewav:analytics";

export type SceneAnalyticsEvent =
  | "scene_home_viewed"
  | "video_impression"
  | "video_preview_started"
  | "video_started"
  | "video_25"
  | "video_50"
  | "video_75"
  | "video_completed"
  | "video_liked"
  | "video_shared"
  | "video_saved"
  | "playlist_created"
  | "playlists_opened"
  | "artist_followed"
  | "artist_profile_opened"
  | "globe_opened"
  | "room_opened"
  | "tremplin_opened"
  | "tv_opened"
  | "tv_program_started"
  | "search_performed"
  | "filter_applied"
  | "not_interested"
  | "recommendation_reason_opened"
  | "recommendation_settings_opened"
  | "upload_started"
  | "upload_completed";

export type SceneAnalyticsDetail = Readonly<{
  event: SceneAnalyticsEvent;
  mediaId?: string;
  artistId?: string;
  query?: string;
  filterCount?: number;
  reason?: string;
}>;

/**
 * Keeps the browser bridge used by the product shell and persists the one
 * La Scène event currently authorised by the analytics RPC. Other events stay
 * non-authoritative until the server allow-list is expanded.
 */
export function trackSceneAnalytics(detail: SceneAnalyticsDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<SceneAnalyticsDetail>(SCENE_ANALYTICS_EVENT_NAME, {
    detail: Object.freeze({ ...detail }),
  }));
  if (detail.event !== "video_impression" || !detail.artistId || !isMessagingUuid(detail.artistId)) return;
  const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  void supabase.rpc("track_analytics_event", {
    p_subject_profile_id: detail.artistId,
    p_source_pillar: "shorts",
    p_event_name: "short_impression",
    p_idempotency_key: `scene:impression:${requestId}`.slice(0, 128),
    p_session_id: null,
    p_properties: { media_id: detail.mediaId ?? null },
    p_occurred_at: new Date().toISOString(),
  });
}
