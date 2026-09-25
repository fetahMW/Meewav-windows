import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL(
  "../../supabase/migrations/20260815142000_profile_certif_endorsements_v1.sql",
  import.meta.url,
), "utf8");

test("La Certif is an additive signed endorsement ledger, not an official MeeWav truth", () => {
  assert.match(migration, /create table if not exists public\.profile_certif_endorsements_v1/u);
  assert.match(migration, /source_kind text not null check \(source_kind in \('direct', 'draw'\)\)/u);
  assert.match(migration, /unique \(source_kind, source_id_snapshot\)/u);
  assert.match(migration, /source_kind = 'direct' and source_award_id is null/u);
  assert.match(migration, /source_kind = 'draw' and source_delivery_id is null/u);
  assert.doesNotMatch(migration, /source_kind = 'direct' and source_delivery_id is not null/u);
  assert.match(migration, /sender_grade_level_snapshot smallint not null/u);
  assert.match(migration, /sender_followers_count_snapshot bigint not null/u);
  assert.match(migration, /sender_verified_snapshot boolean not null/u);
  assert.match(migration, /recipient_display_name_snapshot text not null/u);
  assert.match(migration, /recipient_avatar_url_snapshot text/u);
  assert.match(migration, /signal_context_version text not null default 'profile-signals-v1'/u);
  assert.match(migration, /official_meewav_verification', false/u);
  assert.match(migration, /ne constituent pas une vérification officielle MeeWav/u);
  assert.doesNotMatch(migration, /update public\.profiles\s+set\s+(?:grade|is_verified)/iu);
  assert.doesNotMatch(migration, /apply_profile_grade_event/iu);
  assert.doesNotMatch(migration, /token|wallet|balance|price|currency/iu);
});

test("only durable sent or revealed la-certif gifts populate the ledger", () => {
  assert.match(migration, /delivery\.gift_code = 'la-certif'[\s\S]*delivery\.status = 'sent'/u);
  assert.match(migration, /award\.gift_code = 'la-certif'/u);
  assert.match(migration, /profile_certif_direct_source_invalid/u);
  assert.match(migration, /profile_certif_draw_source_invalid/u);
  assert.match(migration, /p_sender_profile_id = p_recipient_profile_id[\s\S]*?return;/u);
  assert.match(migration, /after insert or update of status on public\.room_gift_deliveries_v1/u);
  assert.match(migration, /after insert on public\.room_gift_awards_v1/u);
  assert.match(migration, /on conflict \(source_kind, source_id_snapshot\) do nothing/u);
  assert.match(migration, /where delivery\.gift_code = 'la-certif'[\s\S]*delivery\.status = 'sent'/u);
  assert.match(migration, /where award\.gift_code = 'la-certif'/u);
  assert.match(migration, /'backfill_current'/u);
});

test("the public Profile projection deduplicates senders and respects current privacy", () => {
  assert.match(migration, /create or replace function public\.get_profile_certif_summary_v1\(p_profile_id uuid\)/u);
  assert.match(migration, /profile\.id = auth\.uid\(\)[\s\S]*profile\.show_on_public_profile[\s\S]*profile\.is_ghost_mode/u);
  assert.match(migration, /partition by endorsement\.sender_profile_id_snapshot/u);
  assert.match(migration, /order by endorsement\.endorsed_at desc, endorsement\.created_at desc, endorsement\.id desc/u);
  assert.match(migration, /sender_rank = 1 and state = 'active'/u);
  assert.match(migration, /coalesce\(sender\.show_on_public_profile, false\)[\s\S]*not coalesce\(sender\.is_ghost_mode, true\)/u);
  assert.doesNotMatch(migration, /\.full_name/u, "Certif snapshots must never fall back to a private civil name");
  assert.match(migration, /'unique_endorsers'/u);
  assert.match(migration, /'high_grade_endorsers'/u);
  assert.match(migration, /'verified_endorsers'/u);
  assert.match(migration, /'followers_at_endorsement'/u);
  assert.match(migration, /grant execute on function public\.get_profile_certif_summary_v1\(uuid\)[\s\S]*to anon, authenticated/u);
});

test("participants cannot forge the ledger and can only withdraw or hide through scoped RPCs", () => {
  assert.match(migration, /alter table public\.profile_certif_endorsements_v1 enable row level security/u);
  assert.match(migration, /sender_profile_id_snapshot = auth\.uid\(\)[\s\S]*recipient_profile_id_snapshot = auth\.uid\(\)/u);
  assert.match(migration, /revoke all on table public\.profile_certif_endorsements_v1 from public, anon, authenticated/u);
  assert.match(migration, /grant select on table public\.profile_certif_endorsements_v1 to authenticated/u);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.profile_certif_endorsements_v1 to authenticated/iu);
  assert.match(migration, /where endorsement\.id = p_endorsement_id[\s\S]*sender_profile_id_snapshot = v_user_id[\s\S]*recipient_profile_id_snapshot = v_user_id[\s\S]*for update/u);
  assert.match(migration, /v_action = 'withdraw'[\s\S]*sender_profile_id_snapshot <> v_user_id/u);
  assert.match(migration, /v_action = 'hide'[\s\S]*recipient_profile_id_snapshot <> v_user_id/u);
  assert.match(migration, /v_action = 'restore_visibility'[\s\S]*state <> 'hidden_by_recipient'/u);
  assert.match(migration, /profile_certif_state_conflict/u);
  assert.match(migration, /grant execute on function public\.profile_set_my_certif_state_v1\(uuid, text\)[\s\S]*to authenticated/u);
  assert.match(migration, /profile_certif_service_role_required/u);
});

test("the migration keeps every existing gift and iOS contract intact", () => {
  assert.doesNotMatch(migration, /drop (?:table|column|function|policy)\s+(?!if exists profile_certif)/iu);
  assert.doesNotMatch(migration, /alter table public\.(?:room_gift|profiles|profile_grade_state).*\b(?:drop|rename)\b/iu);
  assert.doesNotMatch(migration, /create or replace function public\.rooms_(?:submit|create|start|reveal|cancel|advance|purge)_gift/iu);
  assert.doesNotMatch(migration, /delete from public\.(?:room_gift|profiles|profile_grade)/iu);
});
