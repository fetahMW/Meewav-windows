import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260822220000_wave_production_core_v3.sql?raw";

const functionBody = (name: string, nextName?: string) => {
  const start = sql.indexOf(`create or replace function public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = nextName ? sql.indexOf(`create or replace function public.${nextName}`, start + 1) : sql.length;
  return sql.slice(start, end < 0 ? sql.length : end);
};

describe("Wave production core v3 SQL contract", () => {
  it("creates the normalized production aggregate without replacing the JSONB v1/v2 path", () => {
    for (const table of [
      "wave_sessions_v3",
      "wave_categories_v3",
      "wave_submission_allowances_v3",
      "wave_slots_v3",
      "wave_loop_submissions_v3",
      "wave_audio_assets_v3",
      "wave_loop_versions_v3",
      "wave_loop_analysis_v3",
      "wave_beat_revisions_v3",
      "wave_beat_tracks_v3",
      "wave_vote_rounds_v3",
      "wave_votes_v3",
      "wave_program_audio_state_v3",
      "wave_event_v1",
      "wave_idempotency_v3",
      "wave_rights_consents_v3",
      "wave_moderation_actions_v3",
    ]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("references public.rooms_v2(id)");
    expect(sql).toContain("public.rooms_specialized_is_control_v1");
    expect(sql).not.toContain("drop table public.room_specialized_state_v1");
    expect(sql).not.toContain("alter table public.room_specialized_state_v1 drop");
  });

  it("declares official lifecycle, admission/replacement and program-source enums", () => {
    for (const status of [
      "UPLOADING", "PROCESSING", "RECEIVED", "NEEDS_REVIEW", "NEEDS_CORRECTION",
      "READY_FOR_VOTE", "VOTING", "ACCEPTED", "NOT_SELECTED", "REJECTED",
      "SUPERSEDED", "REMOVED", "PROCESSING_FAILED",
    ]) expect(sql).toContain(`'${status}'`);
    expect(sql).toContain("create type public.wave_vote_kind_v3 as enum ('ADMISSION', 'REPLACEMENT')");
    expect(sql).toContain("create type public.wave_program_source_v3 as enum ('HOST_DAW', 'SERVER_RENDER', 'SILENCE')");
    expect(sql).toContain("rooms_wave_submission_transition_allowed_v3");
    expect(sql).toContain("wave_submission_transition_forbidden");
  });

  it("keeps assets private and exposes only a sanitized authorized snapshot", () => {
    expect(sql).toContain("revoke all on table");
    expect(sql).toContain("public.wave_audio_assets_v3");
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("grant all on table");
    expect(sql).toContain("to service_role");
    const snapshot = functionBody("rooms_get_wave_snapshot_v3", "rooms_initialize_wave_production_v3");
    expect(snapshot).toContain("rooms_wave_is_member_v3");
    expect(snapshot).toContain("wave_snapshot_forbidden");
    expect(snapshot).not.toContain("storage_path");
    expect(snapshot).not.toContain("storage_bucket");
    expect(snapshot).not.toContain("sha256");
    expect(snapshot).not.toContain("consent_scope");
    expect(snapshot).not.toContain("voter_id");
  });

  it("initializes one Wave from a controlled rooms_v2 room with locked rules, slots and revision 1", () => {
    const body = functionBody("rooms_initialize_wave_production_v3");
    expect(body).toContain("from public.rooms_v2 where id = p_room_id for update");
    expect(body).toContain("room_specialized_state_v1");
    expect(body).toContain("room_type = 'wave'");
    expect(body).toContain("rooms_specialized_is_control_v1");
    expect(body).toContain("rules_locked_at");
    expect(body).toContain("jsonb_array_elements(p_rules->'categories')");
    expect(body).toContain("insert into public.wave_slots_v3");
    expect(body).toContain("v_session.id, 1, 'INITIAL'");
    expect(body).toContain("'wave.started'");
    expect(body).toContain("'initialize', p_idempotency_key");
  });

  it("locks exactly one candidate version and reference revision in one active vote", () => {
    expect(sql).toContain("wave_vote_one_active_per_session_v3");
    expect(sql).toContain("where status in ('LISTENING', 'OPEN')");
    expect(sql).toContain("wave_vote_lock_immutable_v3");
    expect(sql).toContain("wave_vote_lock_is_immutable");
    const body = functionBody("rooms_start_wave_vote_v3", "rooms_cast_wave_vote_v3");
    expect(body).toContain("wave_vote_already_active");
    expect(body).toContain("wave_reference_revision_is_stale");
    expect(body).toContain("submission.current_version_number");
    expect(body).toContain("wave_rights_consent_required");
    expect(body).toContain("wave_candidate_analysis_incompatible");
    expect(body).toContain("locked_preview_asset_id");
    expect(body).toContain("make_interval(secs => p_listen_seconds)");
  });

  it("accepts one server-timed vote per authenticated member and never trusts a client clock", () => {
    expect(sql).toContain("primary key(round_id, voter_id)");
    const body = functionBody("rooms_cast_wave_vote_v3", "rooms_finalize_wave_vote_v3");
    expect(body).toContain("rooms_wave_is_member_v3");
    expect(body).toContain("now() < v_round.opens_at");
    expect(body).toContain("now() >= v_round.closes_at");
    expect(body).toContain("wave_vote_already_cast");
    expect(body).toContain("insert into public.wave_votes_v3");
    expect(body).toContain("'cast_vote', p_idempotency_key");
    expect(body).not.toContain("p_cast_at");
    expect(body).not.toContain("where id = v_session_id for update");
    expect(body).not.toContain("where id = p_round_id for update");
    expect(body).not.toContain("rooms_wave_append_event_v3");
  });

  it("finalizes atomically and creates an immutable admission or replacement revision", () => {
    const body = functionBody("rooms_finalize_wave_vote_v3", "rooms_change_wave_program_source_v3");
    expect(body).toContain("from public.wave_vote_rounds_v3 where id = p_round_id for update");
    expect(body).toContain("now() < v_round.closes_at");
    expect(body).toContain("v_approve::numeric / v_total::numeric");
    expect(body).toContain("set status = 'ACCEPTED'");
    expect(body).toContain("insert into public.wave_beat_revisions_v3");
    expect(body).toContain("case when v_round.kind = 'ADMISSION' then 'ADMISSION' else 'REPLACEMENT' end");
    expect(body).toContain("track.id <> v_round.replaces_track_id");
    expect(body).toContain("set status = 'NOT_SELECTED'");
    expect(body).toContain("active_vote_round_id = null");
    expect(body).toContain("'finalize_vote', p_idempotency_key");
    expect(sql).toContain("wave_beat_revisions_immutable_v3");
    expect(sql).toContain("wave_beat_tracks_immutable_v3");
    expect(sql).toContain("wave_track_requires_exact_accepted_version");
    expect(sql).toContain("wave_current_beat_contains_submission");
  });

  it("models official program audio as IDs/state only, not a fake browser or SQL mixer", () => {
    const body = functionBody("rooms_change_wave_program_source_v3");
    expect(body).toContain("wave_host_daw_source_invalid");
    expect(body).toContain("wave_render_revision_invalid");
    expect(body).toContain("wave_render_asset_not_ready");
    expect(body).toContain("source_rtc_publication_id");
    expect(body).toContain("generation = v_program.generation + 1");
    expect(body).toContain("'program_audio.changed'");
    expect(sql).toContain("This table is not an audio engine");
    expect(sql).not.toContain("AudioContext");
    expect(sql).not.toContain("decodeAudioData");
  });

  it("provides append-only recovery, idempotency, consent and moderation ledgers", () => {
    expect(sql).toContain("event_sequence = event_sequence + 1");
    expect(sql).toContain("primary key(wave_id, sequence)");
    expect(sql).toContain("wave_events_append_only_v3");
    expect(sql).toContain("primary key(session_id, actor_id, command_name, idempotency_key)");
    expect(sql).toContain("wave_consents_append_only_v3");
    expect(sql).toContain("wave_moderation_append_only_v3");
    expect(sql).toContain("wave_consent_subject_invalid");
    expect(sql).toContain("wave_version_chain_invalid");
  });

  it("matches the realtime adapter table, RPC names and authoritative envelopes", () => {
    expect(sql).toContain("create table if not exists public.wave_event_v1");
    expect(sql).toContain("wave_id uuid not null references public.wave_sessions_v3(id)");
    expect(sql).toContain("correlation_id text not null");
    expect(sql).toContain("alter publication supabase_realtime add table public.wave_event_v1");
    expect(sql).toContain("create or replace function public.rooms_wave_switch_program_audio_v1");
    expect(sql).toContain("create or replace function public.rooms_wave_recover_v1");
    const switchProgram = functionBody("rooms_wave_switch_program_audio_v1", "rooms_wave_recover_v1");
    expect(switchProgram).toContain("p_source not in ('SERVER_RENDER', 'HOST_DAW')");
    expect(switchProgram).toContain("wave_program_sequence_conflict");
    expect(switchProgram).toContain("wave_render_not_ready");
    expect(switchProgram).toContain("'correlationId', p_idempotency_key");
    expect(switchProgram).toContain("'data', public.rooms_wave_program_audio_projection_v1");
    const projection = functionBody("rooms_wave_program_audio_projection_v1", "rooms_wave_switch_program_audio_v1");
    expect(projection).toContain("'source', program.source::text");
    expect(projection).not.toContain("else 'SERVER_RENDER'");
    expect(sql).toContain("grant execute on function public.rooms_change_wave_program_source_v3");
    expect(sql).toContain("to service_role");
    const recovery = functionBody("rooms_wave_recover_v1");
    expect(recovery).toContain("wave_recovery_cursor_mismatch");
    expect(recovery).toContain("'schemaVersion', 1");
    expect(recovery).toContain("'correlationId', p_correlation_id");
    expect(recovery).toContain("'snapshot', v_snapshot");
    expect(recovery).toContain("'events', v_events");
    expect(recovery).toContain("'cursor', jsonb_build_object");
  });
});
