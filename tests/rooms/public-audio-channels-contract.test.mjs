import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260815153000_rooms_public_audio_channels_v1.sql", import.meta.url),
  "utf8",
);
const service = readFileSync(
  new URL("../../src/features/rooms/place/place.service.ts", import.meta.url),
  "utf8",
);
const stage = readFileSync(
  new URL("../../src/features/rooms/place/PlaceStage.tsx", import.meta.url),
  "utf8",
);

test("public audio projection is additive and leaves the iOS stage RPC untouched", () => {
  assert.match(migration, /create or replace function public\.rooms_public_audio_channels_v1\(p_room_id uuid\)/u);
  assert.doesNotMatch(migration, /drop\s+function[\s\S]*rooms_public_stage_v1/iu);
  assert.doesNotMatch(migration, /create\s+or\s+replace\s+function\s+public\.rooms_public_stage_v1/iu);
  assert.match(migration, /from public\.rooms_public_stage_v1\(p_room_id\) stage/u);
});

test("projection exposes only an onstage UUID, clamped public gain and route", () => {
  assert.match(migration, /returns table \(\s*participant_id uuid,\s*public_mic_gain real,\s*is_routed_to_public boolean\s*\)/u);
  assert.match(migration, /least\(\s*1::real,\s*greatest\(\s*0::real/iu);
  assert.match(migration, /when stage\.stage_role = 'host' then 1::real\s*else mixer\.mic_gain/iu);
  assert.doesNotMatch(migration, /when stage\.stage_role = 'host' then mixer\.local_mic_gain/iu);
  assert.match(migration, /stage\.is_microphone_enabled as is_routed_to_public/iu);
  assert.doesNotMatch(migration, /mixer\.audio_live_enabled/u);
  assert.match(migration, /where stage\.stage_role in \('host', 'guest'\)/u);
});

test("projection table is narrow, private to active members and Realtime enabled", () => {
  assert.match(migration, /create table if not exists public\.room_public_audio_channels_v1/u);
  assert.match(migration, /primary key \(room_id, participant_id\)/u);
  assert.match(migration, /alter table public\.room_public_audio_channels_v1 enable row level security/u);
  assert.match(migration, /room\.host_id = auth\.uid\(\)[\s\S]*participant\.user_id = auth\.uid\(\)[\s\S]*participant\.left_at is null/u);
  assert.match(migration, /revoke all on table public\.room_public_audio_channels_v1[\s\S]*from public, anon, authenticated/u);
  assert.match(migration, /grant select on table public\.room_public_audio_channels_v1[\s\S]*to authenticated, service_role/u);
  assert.match(migration, /alter publication supabase_realtime add table public\.room_public_audio_channels_v1/u);
});

test("projection refresh is trigger-maintained without opening the private mixer", () => {
  for (const source of ["rooms_v2", "room_participants_v2", "room_invitations_v2", "room_mixer_state_v2"]) {
    assert.match(migration, new RegExp(`create trigger rooms_public_audio_[\\s\\S]*?on public\\.${source}`, "u"));
  }
  assert.match(migration, /rooms_refresh_public_audio_channels_v1/u);
  assert.match(migration, /revoke all on function public\.rooms_refresh_public_audio_channels_v1\(uuid\)[\s\S]*from public, anon, authenticated, service_role/u);
  assert.doesNotMatch(migration, /create policy[^\n]*\n\s*on public\.room_mixer_state_v2/iu);
});

test("snapshot RPC is authenticated, RLS-bound and server-readable", () => {
  const snapshotRpc = migration.slice(migration.indexOf("create or replace function public.rooms_public_audio_channels_v1"));
  assert.match(snapshotRpc, /security invoker/u);
  assert.doesNotMatch(snapshotRpc, /security definer/u);
  assert.match(migration, /set search_path = pg_catalog, pg_temp/u);
  assert.match(migration, /rows 4/u);
  assert.match(migration, /alter function public\.rooms_public_audio_channels_v1\(uuid\) owner to postgres/u);
  assert.match(migration, /revoke all on function public\.rooms_public_audio_channels_v1\(uuid\)[\s\S]*from public, anon, authenticated, service_role/u);
  assert.match(migration, /grant execute on function public\.rooms_public_audio_channels_v1\(uuid\)[\s\S]*to authenticated, service_role/u);
});

test("Web consumes the optional projection and fails closed before RTC playback", () => {
  assert.match(service, /client\.rpc\("rooms_public_audio_channels_v1", \{ p_room_id: room\.id \}\)/u);
  assert.match(service, /isMissingPublicAudioChannelsProjection/u);
  assert.match(service, /publicMixAuthoritative: Boolean\(publicAudioChannel \|\| privateMixerAuthoritative\)/u);
  assert.match(service, /currentUserId === host\.id[\s\S]*participant\.profile\.id === currentUserId/u);
  assert.match(service, /table: "room_public_audio_channels_v1"/u);
  assert.match(service, /status === "SUBSCRIBED"[\s\S]*onEvent/u);
  assert.match(stage, /channel\?\.publicMixAuthoritative !== true/u);
});
