import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  getCanonicalOnboardingAvatarFile,
  getOnboardingAvatarIconId,
  peekPendingMusicSceneArrival,
  readCurrentMusicSceneProfile,
  resolveOnboardingRole,
  saveMusicSceneOnboarding,
  type MusicSceneOnboardingPayload,
} from "./musicSceneOnboardingContract";
import {
  loadMusicSceneCityIndex,
  loadMusicScenesForCity,
  canonicalizeMusicSceneSelection,
  type MusicScene,
} from "./musicSceneSelection";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1 || value === "1") return true;
  if (value === "false" || value === 0 || value === "0") return false;
  return fallback;
}

function asFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function synchronizeCanonicalSceneCenter(
  user: User,
  metadata: Record<string, unknown>,
  center: readonly [number, number],
  scene: MusicScene,
) {
  const storedLongitude = asFiniteNumber(metadata.longitude);
  const storedLatitude = asFiniteNumber(metadata.latitude);
  const alreadyCanonical = storedLongitude !== null
    && storedLatitude !== null
    && Math.abs(storedLongitude - center[0]) < 1e-7
    && Math.abs(storedLatitude - center[1]) < 1e-7;
  if (alreadyCanonical && metadata.zone_id === scene.zoneId && metadata.scene_geography_version === 'vinyl-v1') return;

  // Existing accounts may still carry the old cartographic label point. Keep
  // Supabase aligned with the canonical visual centre so the current user and
  // the avatar seen by other members resolve to the same district position.
  await supabase.auth.updateUser({
    data: {
      longitude: center[0],
      latitude: center[1],
      scene_center_version: 2,
      zone_id: scene.zoneId,
      district_id: scene.zoneId,
      district_name: scene.label,
      scene_name: scene.label,
      scene_geography_version: 'vinyl-v1',
    },
  });
  // Arrival remains usable offline; the next idempotent persistence pass will
  // retry the owner-only coordinate synchronization.
}

function getAuthoritativePayloadMetadata(
  metadata: Record<string, unknown>,
  payload: MusicSceneOnboardingPayload,
) {
  const avatarFile = getCanonicalOnboardingAvatarFile(payload.profile.avatarFile);
  const avatarIconId = getOnboardingAvatarIconId(avatarFile);
  const role = resolveOnboardingRole(avatarFile, payload.profile.role);
  return {
    ...metadata,
    username: payload.profile.username,
    display_name: payload.profile.username,
    full_name: payload.profile.username,
    avatar_name: avatarFile,
    avatar_style_key: avatarIconId,
    avatar_icon_id: avatarIconId,
    artist_type: role.label,
    primary_role_key: role.key,
    city: payload.city.result.label,
    commune_code: payload.city.communeCode,
    zone_id: payload.scene.zoneId,
    district_id: payload.scene.zoneId,
    district_name: payload.scene.label,
    scene_name: payload.scene.label,
    scene_source: payload.scene.source,
    longitude: payload.scene.center[0],
    latitude: payload.scene.center[1],
    scene_center_version: 2,
    country: "France",
    is_ghost_mode: !payload.profile.visible,
    show_on_public_profile: payload.profile.visible,
  };
}

async function synchronizeAuthoritativeSignupPayload(
  metadata: Record<string, unknown>,
  payload: MusicSceneOnboardingPayload,
) {
  const authoritativeMetadata = getAuthoritativePayloadMetadata(metadata, payload);
  await supabase.auth.updateUser({ data: authoritativeMetadata });
  // The local signup destination must still win for this arrival. Keeping the
  // pending payload avoids flying back to a stale district if Supabase is
  // temporarily unreachable; the metadata can be synchronized later.
  return authoritativeMetadata;
}

function getDisplayName(user: User, metadata: Record<string, unknown>) {
  return asString(metadata.display_name)
    || asString(metadata.full_name)
    || asString(metadata.name)
    || asString(metadata.username)
    || user.email?.split("@")[0]
    || "Mon profil";
}

function finalizeStoredPayload(
  payload: MusicSceneOnboardingPayload,
  user: User,
  metadata: Record<string, unknown>,
) {
  const avatarFile = getCanonicalOnboardingAvatarFile(
    asString(metadata.avatar_name) || payload.profile.avatarFile,
  );
  const role = resolveOnboardingRole(
    avatarFile,
    asString(metadata.artist_type)
      || asString(metadata.primary_role_key)
      || payload.profile.role,
  );
  const visible = asBoolean(
    metadata.show_on_public_profile,
    payload.profile.visible,
  ) && !asBoolean(metadata.is_ghost_mode, !payload.profile.visible);
  const finalizedPayload: MusicSceneOnboardingPayload = {
    ...payload,
    createdAt: Date.now(),
    auth: undefined,
    profile: {
      ...payload.profile,
      profileId: user.id,
      username: getDisplayName(user, metadata),
      role: role.label,
      avatarFile,
      avatarIconId: getOnboardingAvatarIconId(avatarFile),
      visible,
    },
  };
  saveMusicSceneOnboarding(finalizedPayload);
  return finalizedPayload;
}

export async function prepareAuthenticatedMusicSceneArrival(user: User) {
  const metadata = asRecord(user.user_metadata);
  let pendingPayload = peekPendingMusicSceneArrival();
  if (pendingPayload && (pendingPayload.profile.profileId === user.id || pendingPayload.profile.profileId === 'onboarding-current-user')) {
    pendingPayload = { ...pendingPayload, ...await canonicalizeMusicSceneSelection(pendingPayload.city, pendingPayload.scene) };
  }

  // OAuth owns its finalization after the provider callback. Do not replace its
  // freshly selected scene with metadata from a previous session in between.
  if (
    pendingPayload?.auth?.flow === "oauth"
    && pendingPayload.profile.profileId === "onboarding-current-user"
  ) {
    return pendingPayload;
  }

  // A pending payload tied to this authenticated user was created by the
  // signup that has just succeeded. It is newer and more precise than the user
  // object captured by the auth event, whose metadata can still describe the
  // previously selected district.
  if (pendingPayload?.profile.profileId === user.id) {
    const authoritativeMetadata = await synchronizeAuthoritativeSignupPayload(
      metadata,
      pendingPayload,
    );
    return finalizeStoredPayload(pendingPayload, user, authoritativeMetadata);
  }

  const communeCode = asString(metadata.commune_code).toUpperCase();
  const zoneId = asString(metadata.zone_id) || asString(metadata.district_id);
  const currentPayload = readCurrentMusicSceneProfile();
  const currentBelongsToUser = currentPayload?.profile.profileId === user.id;
  const hasSceneMetadata = Boolean(communeCode && zoneId);
  const currentSceneMatchesMetadata = Boolean(
    currentPayload
    && communeCode
    && zoneId
    && currentPayload.city.communeCode === communeCode
    && currentPayload.scene.zoneId === zoneId,
  );
  const reusableAuthenticatedPayload = Boolean(
    currentBelongsToUser
    && (!hasSceneMetadata || currentSceneMatchesMetadata),
  );
  const reusableSignupPreview = Boolean(
    currentPayload?.profile.profileId === "onboarding-current-user"
    && currentSceneMatchesMetadata,
  );

  let city = currentPayload?.city ?? null;
  let scene = currentPayload?.scene ?? null;

  if (communeCode && zoneId) {
    const cities = await loadMusicSceneCityIndex();
    city = cities.find((candidate) => candidate.communeCode === communeCode) ?? null;
    if (!city) return null;

    const scenes = await loadMusicScenesForCity(city);
    const expectedLabel = asString(metadata.scene_name) || asString(metadata.district_name);
    const namedScenes = scenes.filter((candidate) => candidate.label === expectedLabel);
    scene = scenes.find((candidate) => candidate.zoneId === zoneId)
      ?? (namedScenes.length === 1 ? namedScenes[0] : null)
      ?? (scenes.length === 1 ? scenes[0] : null);
    if (!scene && currentBelongsToUser && currentPayload && currentPayload.city.communeCode === communeCode) {
      scene = (await canonicalizeMusicSceneSelection(city, currentPayload.scene)).scene;
    }
    if (!scene) return null;
  }

  if (currentPayload && (reusableAuthenticatedPayload || reusableSignupPreview)) {
    let canonicalPayload = city && scene
      ? { ...currentPayload, city, scene }
      : currentPayload;
    canonicalPayload = { ...canonicalPayload, ...await canonicalizeMusicSceneSelection(canonicalPayload.city, canonicalPayload.scene) };
    scene = canonicalPayload.scene;
    if (scene) await synchronizeCanonicalSceneCenter(user, metadata, scene.center, scene);
    return finalizeStoredPayload(canonicalPayload, user, metadata);
  }

  if (!communeCode || !zoneId || !city || !scene) return null;
  await synchronizeCanonicalSceneCenter(user, metadata, scene.center, scene);

  const avatarFile = getCanonicalOnboardingAvatarFile(
    asString(metadata.avatar_name) || "Utilisateur.png",
  );
  const role = resolveOnboardingRole(
    avatarFile,
    asString(metadata.artist_type) || asString(metadata.primary_role_key) || "Utilisateur",
  );
  const visible = asBoolean(metadata.show_on_public_profile, false)
    && !asBoolean(metadata.is_ghost_mode, true);
  const payload: MusicSceneOnboardingPayload = {
    version: 1,
    createdAt: Date.now(),
    city,
    scene,
    profile: {
      profileId: user.id,
      username: getDisplayName(user, metadata),
      role: role.label,
      avatarFile,
      avatarIconId: getOnboardingAvatarIconId(avatarFile),
      visible,
    },
  };
  saveMusicSceneOnboarding(payload);
  return payload;
}
