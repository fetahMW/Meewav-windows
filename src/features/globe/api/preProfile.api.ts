import { supabase } from "../../../lib/supabaseClient";

export type PublicPreProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  city: string | null;
  country_code: string | null;
  zone_name: string | null;
  profile_image_url: string | null;
  collab_available: boolean;
  is_online: boolean;
  followers_count: number;
  following_count: number;
  /** Null when the profile owner has disabled the public grade preference. */
  grade: number | null;
  is_verified: boolean;
  golden_likes_count: number;
};

export type PrivatePreProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_style_key: string | null;
  primary_role_key: string | null;
  city: string | null;
  country_code: string | null;
  zone_name: string | null;
  profile_image_url: string | null;
  collab_available: boolean;
  is_online: boolean;
  followers_count: number;
  following_count: number;
  grade: number;
  is_verified: boolean;
  golden_likes_count: number;
  is_ghost_mode: boolean;
  show_on_public_profile: boolean;
  onboarding_completed_at: string | null;
  profile_version: number;
};

export type PublishedPreProfileMedia = {
  id: string;
  owner_profile_id: string;
  type: string;
  name: string;
  format: string | null;
  duration_ms: number | null;
  file_url: string | null;
  cover_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  source_pillar: string | null;
  published_at: string | null;
};

export type FollowState = {
  authenticated: boolean;
  viewerProfileId: string | null;
  following: boolean;
};

export type FollowStates = {
  authenticated: boolean;
  viewerProfileId: string | null;
  followingProfileIds: Set<string>;
};

export type PreProfileGoldenLikeState = {
  ok: boolean;
  reason?: string;
  artistId?: string;
  goldenLikesCount: number;
  authenticated: boolean;
  usedToday: boolean;
  availableToday: boolean;
  givenToThisArtistToday: boolean;
  givenArtistId?: string;
  dayKey?: string;
  availableAt?: string;
  cooldownSeconds?: number;
};

export type GivePreProfileGoldenLikeResult = {
  ok: boolean;
  reason: string;
  artistId?: string;
  goldenLikesCount?: number;
  usedToday?: boolean;
  dayKey?: string;
  availableAt?: string;
  cooldownSeconds?: number;
  idempotentReplay?: boolean;
  goldenLikeId?: string;
};

export type CollaborationRequestResult = {
  ok: boolean;
  requestId: string;
  senderProfileId: string;
  recipientProfileId: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  source: string;
  createdAt: string;
  idempotentReplay: boolean;
};

export type CollaborationRequestInput = {
  recipientProfileId: string;
  message: string;
  idempotencyKey?: string;
  source?: "globe" | "profile" | "messaging" | "rooms" | "shorts" | "marketplace" | "tremplin";
};

export type PreProfileAnalyticsEventName =
  | "globe_profile_open"
  | "media_impression"
  | "media_play"
  | "media_complete"
  | "share_open"
  | "message_composer_open";

const PUBLIC_PROFILE_COLUMNS = [
  "id",
  "username",
  "display_name",
  "bio",
  "avatar_url",
  "avatar_style_key",
  "primary_role_key",
  "city",
  "country_code",
  "zone_name",
  "profile_image_url",
  "collab_available",
  "is_online",
  "followers_count",
  "following_count",
  "grade",
  "is_verified",
  "golden_likes_count",
].join(",");

const PUBLISHED_MEDIA_COLUMNS = [
  "id",
  "owner_profile_id",
  "type",
  "name",
  "format",
  "duration_ms",
  "file_url",
  "cover_url",
  "storage_bucket",
  "storage_path",
  "mime_type",
  "source_pillar",
  "published_at",
].join(",");

export function isCanonicalProfileId(profileId: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(profileId);
}

function createRequestKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `globe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
}

export async function trackPreProfileAnalytics(
  subjectProfileId: string,
  eventName: PreProfileAnalyticsEventName,
  properties: Record<string, unknown> = {},
) {
  if (!isCanonicalProfileId(subjectProfileId)) return null;
  const { data, error } = await supabase.rpc("track_analytics_event", {
    p_subject_profile_id: subjectProfileId,
    p_source_pillar: "globe",
    p_event_name: eventName,
    p_idempotency_key: `globe:${eventName}:${createRequestKey()}`.slice(0, 128),
    p_session_id: null,
    p_properties: properties,
    p_occurred_at: new Date().toISOString(),
  });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function getPublicPreProfile(profileId: string): Promise<PublicPreProfile | null> {
  if (!isCanonicalProfileId(profileId)) return null;

  const { data, error } = await supabase
    .from("public_profiles")
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as PublicPreProfile | null) ?? null;
}

export async function getMyPrivatePreProfile(): Promise<PrivatePreProfile | null> {
  const { data, error } = await supabase.rpc("get_my_private_profile");
  if (error) throw error;
  return (data as PrivatePreProfile | null) ?? null;
}

async function attachSignedMediaUrl(
  media: PublishedPreProfileMedia,
): Promise<PublishedPreProfileMedia> {
  if (media.file_url || !media.storage_bucket || !media.storage_path) return media;

  const { data, error } = await supabase.storage
    .from(media.storage_bucket)
    .createSignedUrl(media.storage_path, 60 * 60);

  if (error || !data?.signedUrl) return media;
  return { ...media, file_url: data.signedUrl };
}

export async function getPublishedPreProfileMedia(
  profileId: string,
  limit = 12,
): Promise<PublishedPreProfileMedia[]> {
  if (!isCanonicalProfileId(profileId)) return [];

  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 24));
  const { data, error } = await supabase
    .from("published_media_files")
    .select(PUBLISHED_MEDIA_COLUMNS)
    .eq("owner_profile_id", profileId)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(safeLimit);

  if (error) throw error;
  return Promise.all(((data ?? []) as unknown as PublishedPreProfileMedia[]).map(attachSignedMediaUrl));
}

async function getAuthenticatedProfileId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function getFollowState(targetProfileId: string): Promise<FollowState> {
  if (!isCanonicalProfileId(targetProfileId)) {
    return { authenticated: false, viewerProfileId: null, following: false };
  }

  const viewerProfileId = await getAuthenticatedProfileId();
  if (!viewerProfileId || viewerProfileId === targetProfileId) {
    return {
      authenticated: Boolean(viewerProfileId),
      viewerProfileId,
      following: false,
    };
  }

  const { data, error } = await supabase
    .from("follows")
    .select("id")
    .eq("follower_id", viewerProfileId)
    .eq("following_id", targetProfileId)
    .maybeSingle();

  if (error) throw error;
  return { authenticated: true, viewerProfileId, following: Boolean(data) };
}

/** Hydrates a collection of follow buttons with one request instead of one query per profile. */
export async function getFollowStates(targetProfileIds: readonly string[]): Promise<FollowStates> {
  const canonicalIds = [...new Set(targetProfileIds.filter(isCanonicalProfileId))];
  const viewerProfileId = await getAuthenticatedProfileId();
  if (!viewerProfileId || canonicalIds.length === 0) {
    return {
      authenticated: Boolean(viewerProfileId),
      viewerProfileId,
      followingProfileIds: new Set<string>(),
    };
  }

  const queryIds = canonicalIds.filter((profileId) => profileId !== viewerProfileId);
  if (queryIds.length === 0) {
    return { authenticated: true, viewerProfileId, followingProfileIds: new Set<string>() };
  }
  const { data, error } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewerProfileId)
    .in("following_id", queryIds);
  if (error) throw error;
  return {
    authenticated: true,
    viewerProfileId,
    followingProfileIds: new Set((data ?? []).map(({ following_id }) => String(following_id))),
  };
}

export async function setFollowState(
  targetProfileId: string,
  following: boolean,
): Promise<FollowState> {
  if (!isCanonicalProfileId(targetProfileId)) {
    throw new Error("invalid_target_profile_id");
  }

  const viewerProfileId = await getAuthenticatedProfileId();
  if (!viewerProfileId) throw new Error("authentication_required");
  if (viewerProfileId === targetProfileId) throw new Error("cannot_follow_self");

  if (following) {
    const { error } = await supabase
      .from("follows")
      .upsert(
        { follower_id: viewerProfileId, following_id: targetProfileId },
        { onConflict: "follower_id,following_id", ignoreDuplicates: true },
      );
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", viewerProfileId)
      .eq("following_id", targetProfileId);
    if (error) throw error;
  }

  return { authenticated: true, viewerProfileId, following };
}

export async function setMyPublicProfileVisibility(visible: boolean) {
  const viewerProfileId = await getAuthenticatedProfileId();
  if (!viewerProfileId) throw new Error("authentication_required");

  const { error } = await supabase
    .from("profiles")
    .update({
      show_on_public_profile: visible,
      is_ghost_mode: !visible,
    })
    .eq("id", viewerProfileId);

  if (error) throw error;
  return visible;
}

export async function getPreProfileGoldenLikeState(
  artistId: string,
): Promise<PreProfileGoldenLikeState> {
  const { data, error } = await supabase.rpc("get_golden_like_state", {
    p_artist_id: artistId,
  });
  if (error) throw error;
  const state = (data ?? {}) as Partial<PreProfileGoldenLikeState>;
  return {
    ok: state.ok === true,
    ...(state.reason ? { reason: state.reason } : {}),
    ...(state.artistId ? { artistId: state.artistId } : {}),
    goldenLikesCount: Math.max(0, Number(state.goldenLikesCount) || 0),
    authenticated: true,
    usedToday: state.usedToday === true,
    availableToday: state.availableToday === true,
    givenToThisArtistToday: state.givenToThisArtistToday === true,
    ...(state.givenArtistId && isCanonicalProfileId(state.givenArtistId)
      ? { givenArtistId: state.givenArtistId }
      : {}),
    ...(state.dayKey ? { dayKey: state.dayKey } : {}),
    ...(state.availableAt ? { availableAt: state.availableAt } : {}),
    ...(typeof state.cooldownSeconds === "number"
      ? { cooldownSeconds: Math.max(0, state.cooldownSeconds) }
      : {}),
  };
}

export async function givePreProfileGoldenLike(
  artistId: string,
): Promise<GivePreProfileGoldenLikeResult> {
  const { data, error } = await supabase.rpc("give_golden_like", {
    p_artist_id: artistId,
  });
  if (error) throw error;
  return data as GivePreProfileGoldenLikeResult;
}

export async function requestProfileCollaboration(
  input: CollaborationRequestInput,
): Promise<CollaborationRequestResult> {
  const message = input.message.trim();
  if (!isCanonicalProfileId(input.recipientProfileId)) throw new Error("invalid_recipient_profile_id");
  if (!message || message.length > 500) throw new Error("invalid_collaboration_message");

  const { data, error } = await supabase.rpc("request_profile_collaboration", {
    p_recipient_profile_id: input.recipientProfileId,
    p_message: message,
    p_idempotency_key: input.idempotencyKey ?? createRequestKey(),
    p_source: input.source ?? "globe",
  });

  if (error) throw error;
  return data as CollaborationRequestResult;
}
