import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260715021500_signup_music_scene_profile.sql";
const usernameGuardMigrationPath = "supabase/migrations/20260715033000_profile_username_length_guard.sql";
const overlayPath = "src/features/globe/onboarding/onboardingCurrentUserOverlay.ts";
const globeMapPath = "src/features/globe/components/GlobeMapV2.tsx";
const authenticatedArrivalPath = "src/features/auth/musicSceneAuthenticatedArrival.ts";
const monGlobePath = "src/features/globe/MonGlobe.tsx";

test("persists the canonical music-scene membership and avatar icon at signup", async () => {
  const migration = await readFile(migrationPath, "utf8");

  for (const column of [
    "commune_code",
    "zone_id",
    "district_id",
    "district_name",
    "scene_name",
    "scene_source",
    "avatar_icon_id",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column} text`));
  }

  assert.match(migration, /create or replace function public\.meewav_avatar_icon_id\(p_avatar_name text\)/);
  assert.match(migration, /when lower\('DJ\.png'\) then 'avatar_17'/);
  assert.match(migration, /when lower\('Beatmaker\.png'\) then 'avatar_25'/);
  assert.match(migration, /create or replace function public\.handle_new_user\(\)/);
  assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
  assert.match(migration, /metadata->>'commune_code'/);
  assert.match(migration, /canonical_zone_id/);
  assert.match(migration, /canonical_scene_name/);
  assert.match(migration, /public\.meewav_avatar_icon_id\(metadata->>'avatar_name'\)/);
  assert.match(migration, /create trigger on_auth_user_created\s+after insert on auth\.users/);
  assert.match(migration, /create or replace function public\.sync_profile_from_auth_metadata\(\)/);
  assert.match(migration, /create trigger on_auth_user_metadata_updated\s+after update of raw_user_meta_data on auth\.users/);
  assert.match(migration, /metadata_zone_id/);
});

test("makes badge one the protected initial account grade", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /alter column grade set default 1/);
  assert.match(migration, /update public\.profiles\s+set grade = 1\s+where grade is null/);
  assert.match(migration, /alter column grade set not null/);
  assert.match(migration, /check \(grade between 1 and 6\)/);
  assert.match(migration, /create or replace function public\.enforce_profile_grade\(\)/);
  assert.match(migration, /if new\.grade is null or not public\.meewav_can_manage_profile_grade\(\) then\s+new\.grade := 1/);
  assert.match(migration, /raise exception 'Profile grade is managed server-side'/);
  assert.match(migration, /create trigger enforce_profile_grade_on_insert_trigger\s+before insert on public\.profiles/);
  assert.match(migration, /create trigger enforce_profile_grade_on_update_trigger\s+before update of grade on public\.profiles/);
  assert.match(migration, /show_on_public_profile,\s+grade\s+\)[\s\S]*?coalesce\(\(metadata->>'show_on_public_profile'\)::boolean, false\),\s+1\s+\)/);
});

test("checks username availability without exposing profiles", async () => {
  const migration = await readFile(migrationPath, "utf8");

  assert.match(migration, /create unique index if not exists profiles_username_normalized_key/);
  assert.match(migration, /on public\.profiles \(lower\(btrim\(username\)\)\)/);
  assert.match(migration, /create or replace function public\.is_profile_username_available\(p_username text\)/);
  assert.match(migration, /security definer\s+set search_path = public, pg_temp/);
  assert.match(migration, /not exists \(\s+select 1\s+from public\.profiles/);
  assert.match(migration, /revoke all on function public\.is_profile_username_available\(text\) from public/);
  assert.match(migration, /grant execute on function public\.is_profile_username_available\(text\) to anon, authenticated, service_role/);
});

test("caps new profile usernames without rewriting long legacy aliases", async () => {
  const migration = await readFile(usernameGuardMigrationPath, "utf8");

  assert.match(migration, /char_length\(btrim\(new\.username\)\) <= 20/u);
  assert.match(migration, /new\.username is not distinct from old\.username/u);
  assert.match(migration, /before insert or update of username on public\.profiles/u);
  assert.match(migration, /char_length\(btrim\(p_username\)\) <= 20/u);
  assert.doesNotMatch(migration, /update\s+public\.profiles\s+set\s+username/iu);
});

test("renders the just-created local host with badge one before catalogue refresh", async () => {
  const overlay = await readFile(overlayPath, "utf8");

  assert.match(overlay, /grade:\s*1/);
  assert.match(overlay, /grade_level:\s*1/);
  assert.match(overlay, /grade_stars:\s*1/);
  assert.match(overlay, /grade_tier:\s*"rookie"/);
  assert.match(overlay, /grade_color:\s*"#FFFFFF"/);
  assert.match(overlay, /is_current_user:\s*true/);
});

test("makes the authenticated Supabase profile the only host on the globe", async () => {
  const [overlay, globeMap] = await Promise.all([
    readFile(overlayPath, "utf8"),
    readFile(globeMapPath, "utf8"),
  ]);

  assert.match(
    globeMap,
    /isProfileIconCurrentUser\(feature:\s*any, currentUserProfileId\?[\s\S]*?getProfileIconFeatureId\(feature\) === currentUserProfileId/u,
  );
  assert.match(
    globeMap,
    /canonicalHostIdsToSuppress[\s\S]*?CURRENT_HOST_FILTER_PROFILE_ID[\s\S]*?authenticatedUserId/u,
  );
  assert.match(
    globeMap,
    /getProfileIconFeatureState\(feature, mapInstance, authenticatedUserId\)/u,
  );
  assert.match(
    globeMap,
    /const goToHostPosition = \(\) => \{[\s\S]*?readCurrentMusicSceneProfile\(\)[\s\S]*?authenticatedHostPayload\.profile\.profileId === authenticatedUserId[\s\S]*?selectControllerExtrudedZone\(scene\.zoneId, sceneFlyTarget\)/u,
  );
  assert.match(globeMap, /isOwner=\{Boolean\(activePreProfileIcon\?\.isCurrentUser\)\}/u);
  assert.match(overlay, /ensureOnboardingCurrentUserOverlay\(map, payload\)/u);

  const syncStart = overlay.indexOf("export function syncOnboardingCurrentUserOverlay");
  assert.doesNotMatch(overlay.slice(syncStart), /removeOnboardingCurrentUserOverlay\(map\)/u);
});

test("refreshes an existing account to the canonical scene center before mounting its globe", async () => {
  const [arrival, monGlobe] = await Promise.all([
    readFile(authenticatedArrivalPath, "utf8"),
    readFile(monGlobePath, "utf8"),
  ]);

  assert.match(arrival, /const scenes = await loadMusicScenesForCity\(city\)/u);
  assert.match(arrival, /const canonicalPayload = city && scene[\s\S]*?\{ \.\.\.currentPayload, city, scene \}/u);
  assert.match(arrival, /await synchronizeCanonicalSceneCenter\(user, metadata, scene\.center\)/u);
  assert.match(arrival, /supabase\.auth\.updateUser\(\{[\s\S]*?longitude: center\[0\][\s\S]*?latitude: center\[1\][\s\S]*?scene_center_version: 2/u);
  assert.match(monGlobe, /await prepareSessionUser\(session\)[\s\S]*?setAuthenticatedUserId\(session\?\.user\.id \?\? null\)/u);
});

test("keeps the district chosen by the latest signup ahead of stale account metadata", async () => {
  const arrival = await readFile(authenticatedArrivalPath, "utf8");

  assert.match(arrival, /peekPendingMusicSceneArrival/u);
  assert.match(
    arrival,
    /pendingPayload\?\.profile\.profileId === user\.id[\s\S]*?synchronizeAuthoritativeSignupPayload\([\s\S]*?pendingPayload[\s\S]*?finalizeStoredPayload\(pendingPayload, user, authoritativeMetadata\)/u,
  );
  assert.match(
    arrival,
    /getAuthoritativePayloadMetadata[\s\S]*?commune_code: payload\.city\.communeCode[\s\S]*?zone_id: payload\.scene\.zoneId[\s\S]*?district_id: payload\.scene\.zoneId[\s\S]*?longitude: payload\.scene\.center\[0\][\s\S]*?latitude: payload\.scene\.center\[1\]/u,
  );
  assert.match(
    arrival,
    /supabase\.auth\.updateUser\(\{ data: authoritativeMetadata \}\)/u,
  );
});
