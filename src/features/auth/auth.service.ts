import type { AuthError, Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";

export type OnboardingPayload = {
  username: string;
  displayName: string | null;
  avatarStyleKey: string;
  primaryRoleKey: string;
  city: string | null;
  countryCode: string | null;
  countryName: string | null;
  street: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  isGhostMode: boolean;
  showOnPublicProfile: boolean;
};

export type OnboardingResult = {
  ok: boolean;
  profile?: Record<string, unknown>;
};

export type PublicDiscoveryPayload = {
  sceneName: string;
  communeCode: string | null;
  zoneId: string | null;
  districtName: string | null;
  avatarIconId: string | null;
};

const COUNTRY_CODES: Record<string, string> = {
  france: "FR",
  belgique: "BE",
  suisse: "CH",
  canada: "CA",
};

export function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR");
}

export function countryNameToCode(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase("fr-FR");
  return COUNTRY_CODES[normalized] ?? null;
}

export function getAuthErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;

  const maybeAuthError = error as Partial<AuthError> | null;
  if (maybeAuthError?.message?.trim()) return maybeAuthError.message;

  return fallback;
}

export function sessionNeedsOnboarding(session: Session | null) {
  if (!session) return false;

  const metadata = session.user.user_metadata;
  if (metadata.onboarding_completed === true) return false;
  if (metadata.onboarding_completed === false) return true;

  // Legacy accounts predate the explicit flag. Keep them usable when their
  // original metadata already identifies a complete artist profile.
  const hasUsername = typeof metadata.username === "string" && metadata.username.trim().length > 0;
  const hasAvatar = typeof (metadata.avatar_style_key ?? metadata.avatar_name) === "string"
    && String(metadata.avatar_style_key ?? metadata.avatar_name).trim().length > 0;
  const hasRole = typeof (metadata.primary_role_key ?? metadata.artist_type) === "string"
    && String(metadata.primary_role_key ?? metadata.artist_type).trim().length > 0;

  return !(hasUsername && hasAvatar && hasRole);
}

export async function isUsernameAvailable(username: string) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) return false;

  const { data, error } = await supabase.rpc("is_profile_username_available", {
    p_username: normalizedUsername,
  });

  if (error) throw error;
  return data === true;
}

export async function completeOnboarding(payload: OnboardingPayload) {
  const { data, error } = await supabase.rpc("complete_onboarding", {
    p_username: normalizeUsername(payload.username),
    p_display_name: payload.displayName,
    p_avatar_style_key: payload.avatarStyleKey,
    p_primary_role_key: payload.primaryRoleKey,
    p_city: payload.city,
    p_country_code: payload.countryCode,
    p_latitude: payload.latitude,
    p_longitude: payload.longitude,
    p_is_ghost_mode: payload.isGhostMode,
    p_show_on_public_profile: payload.showOnPublicProfile,
  });

  if (error) throw error;
  return (data ?? { ok: true }) as OnboardingResult;
}

export async function updatePublicDiscoveryProfile(payload: PublicDiscoveryPayload) {
  const { data, error } = await supabase.rpc("update_my_public_discovery_profile", {
    p_scene_name: payload.sceneName,
    p_commune_code: payload.communeCode,
    p_zone_id: payload.zoneId,
    p_district_name: payload.districtName,
    p_avatar_icon_id: payload.avatarIconId,
  });

  if (error) throw error;
  return (data ?? { ok: true }) as Record<string, unknown>;
}

export function onboardingPayloadToMetadata(payload: OnboardingPayload) {
  return {
    username: normalizeUsername(payload.username),
    display_name: payload.displayName,
    full_name: payload.displayName,
    avatar_style_key: payload.avatarStyleKey,
    avatar_name: payload.avatarStyleKey,
    primary_role_key: payload.primaryRoleKey,
    artist_type: payload.primaryRoleKey,
    city: payload.city,
    country_code: payload.countryCode,
    country: payload.countryName,
    // Auth metadata may be embedded in a session/JWT. Keep only a kilometre-
    // scale arrival hint; complete_onboarding persists the exact owner location.
    latitude: payload.latitude === null ? null : Math.round(payload.latitude * 100) / 100,
    longitude: payload.longitude === null ? null : Math.round(payload.longitude * 100) / 100,
    is_ghost_mode: payload.isGhostMode,
    show_on_public_profile: payload.showOnPublicProfile,
    onboarding_completed: false,
  };
}
