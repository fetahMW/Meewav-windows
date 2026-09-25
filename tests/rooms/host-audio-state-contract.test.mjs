import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260815120000_rooms_host_audio_state_commit_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

test("host audio migration is additive and keeps legacy iOS contracts", () => {
  for (const column of [
    "audio_route",
    "audio_revision",
    "audio_idempotency_key",
  ]) {
    assert.match(migration, new RegExp(`add column if not exists ${column}\\b`, "u"));
  }

  assert.match(migration, /add column if not exists audio_generation text\b/u);
  assert.doesNotMatch(migration, /audio_generation bigint/u);

  assert.doesNotMatch(migration, /\bdrop\s+(?:column|function|table)\b/iu);
  assert.doesNotMatch(migration, /\brename\s+(?:column|table)\b/iu);
  assert.doesNotMatch(
    migration,
    /create\s+or\s+replace\s+function\s+public\.rooms_set_(?:own_audio_preview|audio_live_enabled|own_audio_playback_state)_v2/iu,
  );
});

test("atomic RPC is live-Place Host-only, row-locked, idempotent, and revisioned", () => {
  assert.match(migration, /function public\.rooms_commit_host_audio_state_v1\s*\(/u);
  assert.match(migration, /auth\.uid\(\) is null/u);
  assert.match(migration, /room\.type = 'place'[\s\S]*room\.status = 'live'/u);
  assert.match(migration, /v_host_id <> auth\.uid\(\)/u);
  assert.match(
    migration,
    /from public\.room_mixer_state_v2 mixer[\s\S]*mixer\.guest_id = v_host_id[\s\S]*for update/u,
  );
  assert.match(migration, /v_state\.audio_idempotency_key = v_idempotency_key/u);
  assert.match(migration, /p_expected_revision <> v_state\.audio_revision/u);
  assert.match(migration, /audio_revision = v_state\.audio_revision \+ 1/u);
  assert.doesNotMatch(
    migration,
    /set\s+is_music_muted\s*=\s*p_route\s*<>\s*'public'/iu,
    "routing must never override the Host's explicit music mute",
  );
  assert.match(migration, /audio_live_enabled = p_route = 'public'/u);
});

test("database invariants enforce bounded metadata and safe route transitions", () => {
  assert.match(migration, /audio_track_title[\s\S]*char_length\(audio_track_title\) between 1 and 160/u);
  assert.match(migration, /audio_track_artist[\s\S]*char_length\(audio_track_artist\) between 1 and 160/u);
  assert.match(migration, /audio_track_duration_seconds between 0 and 86400/u);
  assert.match(migration, /audio_live_enabled = \(audio_route = 'public'\)/u);
  assert.match(
    migration,
    /audio_generation ~ '\^\[0-9a-f\]\{8\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{4\}-\[0-9a-f\]\{12\}\$'/u,
  );
  assert.match(migration, /p_generation text/u);
  assert.match(migration, /p_expected_revision bigint/u);
  assert.match(
    migration,
    /audio_route <> 'preview' or audio_playback_state <> 'playing'/u,
  );
  assert.match(
    migration,
    /audio_route <> 'public'[\s\S]*audio_playback_state <> 'playing'[\s\S]*audio_preview_ready and audio_live_enabled/u,
  );
  assert.match(migration, /A new audio generation must enter through preview\./u);
  assert.match(migration, /Public audio must match the validated preview\./u);
  assert.match(migration, /function public\.rooms_revision_legacy_audio_state_v1\(\)/u);
  assert.match(migration, /new\.audio_revision := old\.audio_revision \+ 1/u);
  assert.match(migration, /new\.audio_playback_state := 'previewing'/u);
  assert.match(migration, /function public\.rooms_assert_mixer_audio_target_v1\(\)/u);
  assert.match(migration, /if tg_op = 'INSERT' and not \([\s\S]*new\.audio_playback_state <> 'idle'/u);
  assert.match(migration, /room\.host_id = new\.guest_id/u);
  assert.match(migration, /participant\.user_id = new\.guest_id[\s\S]*participant\.left_at is null/u);
  assert.match(migration, /before update of[\s\S]*is_music_muted[\s\S]*audio_preview_ready/u);
});

test("Realtime projection is narrow, member-readable, transactionally refreshed, and end-cleaned", () => {
  assert.match(migration, /create table if not exists public\.room_public_audio_state_v1/u);
  for (const field of [
    "audio_track_title",
    "audio_track_artist",
    "audio_track_duration_seconds",
    "audio_route",
    "audio_playback_state",
    "audio_generation",
    "audio_revision",
    "updated_at",
  ]) {
    assert.match(migration, new RegExp(`\\b${field}\\b`, "u"));
  }

  assert.doesNotMatch(migration, /track_sid|publication_sid|participant_sid/iu);
  for (const metadataField of [
    "audio_track_title",
    "audio_track_artist",
    "audio_track_duration_seconds",
  ]) {
    const publicOnlyProjection = new RegExp(
      `case when mixer\\.audio_route = 'public' then mixer\\.${metadataField} end`,
      "gu",
    );
    assert.equal(
      [...migration.matchAll(publicOnlyProjection)].length,
      2,
      `${metadataField} must be masked in both the refresh path and initial seed`,
    );
  }
  assert.equal(
    [...migration.matchAll(/case\s+when mixer\.audio_route = 'public' then coalesce\(mixer\.audio_playback_state, 'idle'\)\s+else 'idle'\s+end/gu)].length,
    2,
    "private preview playback activity must be masked in refresh and seed paths",
  );
  assert.equal(
    [...migration.matchAll(/case when mixer\.audio_route = 'public' then mixer\.audio_generation end/gu)].length,
    2,
    "private preview generation must be masked in refresh and seed paths",
  );
  assert.match(migration, /enable row level security/u);
  assert.match(migration, /room\.host_id = auth\.uid\(\)/u);
  assert.match(migration, /participant\.left_at is null/u);
  assert.match(migration, /alter publication supabase_realtime add table public\.room_public_audio_state_v1/u);
  assert.match(migration, /after insert or delete or update of[\s\S]*audio_revision/u);
  assert.match(migration, /after insert or update of status, type, host_id/u);
  assert.match(
    migration,
    /if not found or v_room\.type <> 'place' or v_room\.status <> 'live' then[\s\S]*delete from public\.room_public_audio_state_v1/u,
  );
});
