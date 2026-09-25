import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260821170000_rooms_classe_participant_tools_v1.sql",
    import.meta.url,
  ),
  "utf8",
);
const liveCallFoundation = readFileSync(
  new URL(
    "../../supabase/migrations/20260815180000_rooms_live_call_invitations_v1.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  assert.notEqual(start, -1, `${name} exists`);
  const next = sql.indexOf("create or replace function public.", start + 1);
  return sql.slice(start, next === -1 ? undefined : next);
}

test("Classe questions mutate the authoritative specialized state through a narrow RPC", () => {
  assert.match(
    migration,
    /create or replace function public\.rooms_apply_classe_question_action_v1\(\s*p_room_id uuid,\s*p_action text,\s*p_payload jsonb,\s*p_idempotency_key uuid\s*\)/u,
  );
  assert.match(
    migration,
    /p_action not in \('classe\.question\.add', 'classe\.question\.support'\)/u,
  );
  assert.match(migration, /from public\.room_specialized_state_v1 specialized[\s\S]*for update/u);
  assert.match(migration, /'\{classe,questions\}'/u);
  assert.match(migration, /'status', 'pending'/u);
  assert.match(migration, /'sentAt', now\(\)/u);
  assert.match(migration, /'supports', 0/u);
  assert.match(migration, /'supporterIds', '\[\]'::jsonb/u);
});

test("question participants require an entitled, present canonical Classe Viewer", () => {
  const activeSeat = functionBody(migration, "rooms_classe_active_seat_v1");
  const entitlement = functionBody(migration, "rooms_classe_has_entitlement_v1");
  assert.match(activeSeat, /rooms_classe_has_entitlement_v1\(p_room_id, p_student_id\)/u);
  assert.match(activeSeat, /from public\.room_participants_v2 participant/u);
  assert.match(activeSeat, /participant\.role = 'viewer'/u);
  assert.match(activeSeat, /participant\.left_at is null/u);
  assert.doesNotMatch(activeSeat, /room_invitations_v2|specialized\.state #> '\{classe,seats\}'/u);
  assert.match(entitlement, /from public\.room_classe_seat_entitlements_v1 entitlement/u);
  assert.match(entitlement, /entitlement\.status = 'active'/u);
  assert.match(entitlement, /not public\.rooms_live_call_room_access_revoked_v1/u);
  assert.match(migration, /char_length\(v_text\) not between 2 and 280/u);
  assert.match(migration, /classe_question_rate_limit/u);
  assert.match(migration, /classe_question_capacity/u);
  assert.match(migration, /char_length\(v_question_id\) not between 1 and 100/u);
  assert.match(migration, /when jsonb_typeof\(v_state #> '\{classe,questionsOpen\}'\) = 'boolean'[\s\S]*else false/u);
  assert.match(migration, /for update;[\s\S]*if not public\.rooms_classe_active_seat_v1\(p_room_id, v_uid\)/u);
});

test("question support is unique, excludes self-support and derives its public count", () => {
  assert.match(migration, /v_question #>> '\{author,id\}' = v_uid::text/u);
  assert.match(migration, /classe_question_self_support_forbidden/u);
  assert.match(migration, /if v_supporters \? v_uid::text/u);
  assert.match(migration, /classe_question_already_supported/u);
  assert.match(migration, /to_jsonb\(jsonb_array_length\(v_supporters\)\)/u);
  assert.match(migration, /coalesce\(v_question->>'status', ''\) not in \('pending', 'displayed'\)/u);
});

test("question actions share receipts, revision increments and the canonical Realtime signal", () => {
  assert.match(migration, /room_specialized_idempotency_conflict/u);
  assert.match(migration, /insert into public\.room_specialized_action_receipts_v1/u);
  assert.match(migration, /v_revision := v_row\.revision \+ 1/u);
  assert.match(migration, /update public\.room_specialized_state_v1/u);
  assert.match(migration, /insert into public\.room_specialized_state_signal_v1/u);
  assert.match(migration, /on conflict \(room_id\) do update/u);
  assert.doesNotMatch(migration, /create table if not exists public\.room_classe_questions/u);
});

test("viewer projections reveal support totals but not other students' identities", () => {
  assert.match(migration, /create or replace function public\.rooms_project_classe_questions_v1/u);
  assert.match(migration, /when v_uid <> '' and v_supporters \? v_uid/u);
  assert.match(migration, /then jsonb_build_array\(v_uid\)/u);
  assert.match(migration, /else '\[\]'::jsonb/u);
  assert.match(migration, /rooms_specialized_project_state_v3/u);
  assert.match(migration, /rooms_project_classe_questions_v1/u);
});

test("public Classe projections redact the private roster, activity and pending questions", () => {
  const seatProjector = functionBody(migration, "rooms_project_classe_seats_v1");
  const questionProjector = functionBody(migration, "rooms_project_classe_questions_v1");
  const getter = functionBody(migration, "rooms_get_specialized_state_v1");
  assert.match(
    seatProjector,
    /if not p_control\s+and not public\.rooms_classe_active_seat_v1\(p_room_id, p_user_id\) then/u,
  );
  assert.match(seatProjector, /'id', 'classe-public-seat-' \|\| \(v_seat->>'number'\)/u);
  assert.match(seatProjector, /v_raised := '\[\]'::jsonb;\s+v_screen_owner_id := null/u);
  assert.match(questionProjector, /p_participant boolean default false/u);
  assert.match(
    questionProjector,
    /p_control\s+or p_participant\s+or v_question #>> '\{author,id\}' = v_uid\s+or coalesce\(v_question->>'status', ''\) in \('displayed', 'answered'\)/u,
  );
  assert.match(
    getter,
    /rooms_project_classe_questions_v1\([\s\S]*v_control,\s+v_classe_seat_number is not null\s+\)/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.rooms_project_classe_questions_v1\(jsonb, text, uuid, boolean, boolean\)/u,
  );
});

test("control commits can moderate Classe questions without forging participant content", () => {
  const commit = functionBody(migration, "rooms_commit_specialized_state_v1");
  assert.match(commit, /if p_room_type = 'classe' then/u);
  assert.match(
    commit,
    /jsonb_array_length\(v_old_questions\) <> jsonb_array_length\(v_next_questions\)/u,
  );
  assert.match(
    commit,
    /\(v_next_question - 'status'\) is distinct from \(v_old_question - 'status'\)/u,
  );
  assert.match(commit, /classe_question_participant_fields_immutable/u);
  assert.match(
    commit,
    /jsonb_set\(v_old_question, '\{status\}', to_jsonb\(v_next_status\), true\)/u,
  );
  assert.match(
    commit,
    /question\.value->>'id' = v_featured_id\s+and question\.value->>'status' = 'displayed'/u,
  );
});

test("the 24-seat entitlement output is private, bounded and independent from Guests", () => {
  assert.match(
    migration,
    /create table if not exists public\.room_classe_seat_entitlements_v1 \([\s\S]*seat_number smallint not null check \(seat_number between 1 and 24\)/u,
  );
  assert.match(
    migration,
    /access_kind text not null check \(access_kind in \([\s\S]*'premium_subscription'[\s\S]*'paid_seat'[\s\S]*'private_access'[\s\S]*'manual_grant'/u,
  );
  assert.match(migration, /primary key \(room_id, seat_number\)/u);
  assert.match(migration, /room_classe_seat_entitlements_v1_active_student_idx/u);
  assert.match(migration, /where status = 'active'/u);
  assert.match(migration, /enable row level security/u);
  assert.match(migration, /force row level security/u);
  assert.match(
    migration,
    /revoke all on table public\.room_classe_seat_entitlements_v1\s+from public, anon, authenticated, service_role/u,
  );
  const authority = functionBody(migration, "rooms_classe_has_entitlement_v1");
  assert.doesNotMatch(authority, /room_invitations_v2|guest_id|role = 'guest'/u);
});

test("server projection emits exactly 24 real-profile seats and marks absent grants disconnected", () => {
  const projector = functionBody(migration, "rooms_project_classe_seats_v1");
  assert.match(projector, /for v_number in 1\.\.24 loop/u);
  assert.match(projector, /from public\.room_classe_seat_entitlements_v1 entitlement/u);
  assert.match(projector, /left join public\.profiles profile on profile\.id = entitlement\.student_id/u);
  assert.match(projector, /from public\.room_participants_v2 participant/u);
  assert.match(projector, /participant\.role = 'viewer'/u);
  assert.match(projector, /if not v_present then\s+v_status := 'disconnected'/u);
  assert.match(projector, /'number', v_number,\s+'status', 'free'/u);
  assert.match(projector, /'id', v_entitlement\.student_id::text/u);
  assert.match(projector, /v_classe := jsonb_set\(v_classe, '\{people\}', v_people/u);
  assert.match(projector, /v_classe := jsonb_set\(v_classe, '\{seats\}', v_seats/u);
});

test("initialization and backfill remove investor identities, questions and nullable runtime pointers safely", () => {
  const sanitizer = functionBody(migration, "rooms_sanitize_classe_state_v1");
  assert.match(sanitizer, /if tg_op = 'INSERT' then/u);
  for (const path of [
    "people",
    "seats",
    "raisedHands",
    "questions",
  ]) {
    assert.match(sanitizer, new RegExp(`\\{classe,${path}\\}'.*'\\[\\]'::jsonb`, "u"));
  }
  for (const path of [
    "publicCallStudentId",
    "activeSpeakerId",
    "privateTalkStudentId",
    "screenShareOwnerId",
    "featuredQuestionId",
  ]) {
    assert.match(sanitizer, new RegExp(`\\{classe,${path}\\}'.*'null'::jsonb`, "u"));
  }
  const projector = functionBody(migration, "rooms_project_classe_seats_v1");
  assert.match(projector, /rooms_classe_uuid_text_v1\(v_question->>'id'\)/u);
  assert.match(projector, /rooms_classe_uuid_text_v1\(\s*v_question #>> '\{author,id\}'/u);
  assert.match(projector, /rooms_classe_uuid_text_v1\(\s*v_supporter #>> '\{\}'/u);
  assert.match(projector, /v_supporter_id <> v_author_id/u);
  assert.match(projector, /'supports', jsonb_array_length\(v_supporters\)/u);
  assert.equal(
    (projector.match(/coalesce\(to_jsonb\(v_(?:public_call_student_id|active_speaker_id|private_student_id|screen_owner_id|featured_id)::text\), 'null'::jsonb\)/gu) ?? []).length,
    5,
  );
  assert.match(
    migration,
    /where specialized\.room_type = 'classe'[\s\S]*perform public\.rooms_sync_classe_state_v1\(v_room\.room_id\)/u,
  );
  assert.doesNotMatch(migration, /'Sofia N\.'|'Noé Rivière'|'class-question-1'/u);
});

test("projection stamps the authenticated Classe role and own seat without trusting isGuest", () => {
  const getter = functionBody(migration, "rooms_get_specialized_state_v1");
  assert.match(getter, /public\.rooms_classe_active_seat_v1\(p_room_id, v_uid\)/u);
  assert.match(getter, /into v_classe_seat_number, v_classe_access_kind/u);
  assert.match(getter, /when v_classe_seat_number is not null then 'premium_participant'/u);
  assert.match(getter, /'actorRole', v_actor_role/u);
  assert.match(getter, /'classeSeatNumber', v_classe_seat_number/u);
  assert.match(getter, /'classeAccessKind', v_classe_access_kind/u);
  assert.doesNotMatch(getter, /isGuest|room_invitations_v2/u);
});

test("access APIs separate commercial decisions from the host's manual grant", () => {
  const serviceGrant = functionBody(migration, "rooms_upsert_classe_seat_entitlement_v1");
  const manualGrant = functionBody(migration, "rooms_set_classe_manual_seat_v1");
  assert.match(serviceGrant, /service_role_required/u);
  assert.match(serviceGrant, /p_access_kind not in \(\s*'premium_subscription', 'paid_seat', 'private_access'/u);
  assert.match(serviceGrant, /p_source_reference/u);
  assert.match(
    migration,
    /grant execute on function public\.rooms_upsert_classe_seat_entitlement_v1\([\s\S]*\) to service_role/u,
  );
  assert.match(manualGrant, /room\.host_id = v_host_id/u);
  assert.match(manualGrant, /'manual_grant'/u);
  assert.match(manualGrant, /classe_commercial_seat_immutable/u);
  assert.doesNotMatch(manualGrant, /premium_subscription|paid_seat|private_access/u);
});

test("seat, presence and profile changes synchronize state and the canonical Realtime signal", () => {
  const sync = functionBody(migration, "rooms_sync_classe_state_v1");
  assert.match(sync, /pg_advisory_xact_lock/u);
  assert.match(sync, /from public\.room_specialized_state_v1 specialized[\s\S]*for update/u);
  assert.match(sync, /rooms_project_classe_seats_v1/u);
  assert.match(sync, /v_revision := v_row\.revision \+ 1/u);
  assert.match(sync, /insert into public\.room_specialized_state_signal_v1/u);
  assert.match(migration, /create trigger rooms_sync_classe_state_from_entitlement_v1/u);
  assert.match(migration, /create trigger rooms_sync_classe_state_from_presence_v1/u);
  assert.match(migration, /create trigger rooms_sync_classe_state_from_profile_v1/u);
  assert.match(migration, /create trigger rooms_sanitize_classe_state_v1/u);
});

test("accepted private/public transports are the reload authority for Classe audio markers", () => {
  const projector = functionBody(migration, "rooms_project_classe_seats_v1");
  assert.match(
    projector,
    /into v_private_student_id[\s\S]*authority_kind = 'classe-seat'[\s\S]*status = 'accepted'[\s\S]*call_mode = 'private'/u,
  );
  assert.match(
    projector,
    /into v_public_call_student_id[\s\S]*authority_kind = 'classe-seat'[\s\S]*status = 'accepted'[\s\S]*call_mode = 'public'/u,
  );
  assert.match(
    projector,
    /into v_active_speaker_id[\s\S]*call_mode = 'public'[\s\S]*route_mode = 'public'[\s\S]*invitation\.is_on_air/u,
  );
  assert.match(projector, /'\{publicCallStudentId\}'/u);
  assert.match(projector, /'\{privateTalkStudentId\}'/u);
  assert.match(projector, /'\{activeSpeakerId\}'/u);
  assert.match(
    projector,
    /if not p_control\s+and p_user_id is distinct from v_private_student_id then\s+v_private_student_id := null/u,
  );
  assert.match(
    projector,
    /if not p_control\s+and p_user_id is distinct from v_public_call_student_id then\s+v_public_call_student_id := null/u,
  );
});

test("the live-call row admits only a server-stamped direct or Classe-seat authority", () => {
  assert.match(migration, /add column if not exists authority_kind text not null default 'direct'/u);
  assert.match(migration, /alter column direct_conversation_id drop not null/u);
  assert.match(
    migration,
    /authority_kind = 'direct' and direct_conversation_id is not null[\s\S]*authority_kind = 'classe-seat' and direct_conversation_id is null/u,
  );
  assert.match(migration, /room_live_call_invitations_v1_active_classe_student_idx/u);
  assert.match(migration, /where authority_kind = 'classe-seat' and status in \('pending', 'accepted'\)/u);
  assert.match(migration, /room_live_call_invitations_v1_one_accepted_classe_idx/u);
  assert.match(migration, /where authority_kind = 'classe-seat' and status = 'accepted'/u);
  assert.match(migration, /create trigger rooms_live_call_keep_authority_immutable_v1/u);
  assert.match(migration, /live_call_authority_immutable/u);
});

test("the generic provider invitation RPC transparently prefers Classe-seat authority", () => {
  const invite = functionBody(migration, "rooms_invite_live_call_contact_v1");
  assert.match(invite, /create or replace function public\.rooms_invite_live_call_contact_v1/u);
  assert.match(
    invite,
    /if public\.rooms_classe_active_seat_v1\(p_room_id, p_contact_profile_id\) then[\s\S]*v_authority_kind := 'classe-seat';[\s\S]*v_conversation_id := null/u,
  );
  assert.match(invite, /else[\s\S]*from public\.messaging_direct_pairs pair/u);
  assert.match(invite, /live_call_direct_contact_or_classe_seat_required/u);
  assert.match(invite, /messaging_profiles_blocked_v1\(v_host_id, p_contact_profile_id\)/u);
  assert.match(invite, /live_call_contact_blocked/u);
  assert.match(invite, /direct_conversation_id,\s*authority_kind,\s*client_request_id/u);
  assert.match(invite, /v_call_mode not in \('private', 'public'\)/u);
  assert.match(
    invite,
    /from public\.room_classe_seat_entitlements_v1 entitlement[\s\S]*for share;[\s\S]*from public\.room_participants_v2 participant[\s\S]*for share;[\s\S]*from public\.room_specialized_state_v1 specialized[\s\S]*for share;/u,
    "Classe authority locks follow entitlement -> participant -> specialized state order",
  );
});

test("accept, route and media mint reuse the strengthened authority helper", () => {
  assert.match(
    migration,
    /create or replace function public\.rooms_live_call_contact_allowed_v1[\s\S]*invitation\.authority_kind = 'classe-seat'[\s\S]*rooms_classe_active_seat_v1/u,
  );
  for (const functionName of [
    "rooms_respond_live_call_invitation_v1",
    "rooms_set_live_call_route_v1",
    "rooms_set_live_call_on_air_v1",
    "rooms_authorize_live_call_media_v1",
  ]) {
    const start = liveCallFoundation.indexOf(`create or replace function public.${functionName}`);
    assert.notEqual(start, -1, `${functionName} exists`);
    const next = liveCallFoundation.indexOf("create or replace function public.", start + 1);
    const body = liveCallFoundation.slice(start, next === -1 ? undefined : next);
    assert.match(body, /rooms_live_call_contact_allowed_v1/u, `${functionName} rechecks authority`);
  }
});

test("Classe-seat loss ends the session and enters the existing durable revocation path", () => {
  assert.match(migration, /create trigger rooms_end_classe_live_calls_for_state_v1/u);
  assert.match(migration, /create trigger rooms_end_classe_live_calls_for_presence_v1/u);
  assert.match(migration, /and not public\.rooms_classe_active_seat_v1/u);
  assert.match(migration, /end_reason = 'classe_seat_revoked'/u);
  assert.match(migration, /end_reason = 'classe_presence_revoked'/u);
  assert.match(
    liveCallFoundation,
    /create trigger rooms_live_call_revocation_changed_v1[\s\S]*after update of status, route_mode, is_on_air or delete/u,
  );
});

test("browser grants stay narrow and media authority remains service-only", () => {
  assert.match(
    migration,
    /revoke all on function public\.rooms_apply_classe_question_action_v1[\s\S]*from public, anon;[\s\S]*grant execute[\s\S]*to authenticated, service_role/u,
  );
  assert.match(
    migration,
    /revoke all on function public\.rooms_classe_active_seat_v1[\s\S]*from public, anon, authenticated, service_role/u,
  );
  assert.match(
    migration,
    /revoke all on table public\.room_classe_seat_entitlements_v1\s+from public, anon, authenticated, service_role/u,
  );
  assert.match(
    liveCallFoundation,
    /revoke all on function public\.rooms_authorize_live_call_media_v1\(uuid, uuid\)[\s\S]*from public, anon, authenticated;[\s\S]*grant execute[\s\S]*to service_role/u,
  );
});
