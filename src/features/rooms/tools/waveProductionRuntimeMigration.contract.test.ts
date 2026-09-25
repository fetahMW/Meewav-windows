import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260822233000_wave_production_runtime_v5.sql?raw";

const body = (name: string) => {
  const start = sql.lastIndexOf(`create or replace function public.${name}`);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("create or replace function public.", start + 40);
  return sql.slice(start, end < 0 ? sql.length : end);
};

describe("Wave production runtime v5 contract", () => {
  it("separates the production state machines and preserves legacy rows additively", () => {
    for (const value of [
      "PREPARING", "LIVE_ACTIVE", "INTERMISSION", "PAUSED", "CLOSURE_VOTE",
      "FINALIZING", "CLOSED", "CANCELLED",
      "PENDING_RENDER", "READY_FOR_ACTIVATION", "TECHNICALLY_BLOCKED",
      "LEGALLY_BLOCKED", "PENDING_ACTIVATION", "ACTIVE", "ACTIVATION_FAILED",
      "OPEN", "PRIORITY", "ENOUGH",
    ]) expect(sql).toContain(`'${value}'`);
    expect(sql).toContain("wave_loop_version_runtime_v5");
    expect(sql).toContain("wave_beat_runtime_v5");
    expect(sql).toContain("submissions_during_intermission");
    expect(sql).toContain("wave_upload_window_v5");
    expect(sql).not.toContain("drop table public.wave_sessions_v3");
  });

  it("pins rules, production references and V1 cycle semantics", () => {
    for (const table of ["wave_rules_revisions_v5", "wave_production_references_v5"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("based_on_beat_revision_id");
    expect(sql).toContain("based_on_rules_revision_id");
    expect(sql).toContain("wave_loop_bars_must_divide_cycle");
    expect(sql).toContain("start_offset_beats = 0");
    expect(sql).toContain("repeat_policy = 'REPEAT_TO_CYCLE'");
    expect(sql).toContain("wave_studio_reference_must_be_lossless");
    expect(sql).toContain("wave_light_reference_format_invalid");
    const reference = body("rooms_wave_get_production_reference_v5");
    expect(reference).toContain("wave_member_required");
    expect(reference).toContain("wave_submission_allowances_v3");
    expect(reference).toContain("wave_production_reference_forbidden");
  });

  it("keeps artistic readiness exclusively under the host's human decision", () => {
    const decision = body("rooms_wave_decide_submission_v5");
    expect(sql).toContain("wave_ready_for_vote_requires_host_decision");
    expect(decision).toContain("rooms_wave_is_master_v5");
    expect(decision).toContain("app.wave_human_decision");
    expect(decision).toContain("wave_version_not_technically_prepared");
    expect(decision).not.toContain("rooms_specialized_is_control_v1");
    expect(body("rooms_wave_prepare_vote_lock_v5")).toContain("wave_candidate_not_human_approved");
  });

  it("models three distinct audio buses and a host-only private audition", () => {
    expect(sql).toContain("music_program_kind in ('COLLECTIVE_BEAT', 'HOST_DAW')");
    expect(sql).toContain("voice_kind = 'HOST_MIC'");
    expect(sql).toContain("private_cue_host_id");
    const audition = body("rooms_wave_start_private_audition_v5");
    expect(audition).toContain("wave_private_audition_host_only");
    expect(audition).toContain("programGenerationUnchanged");
    expect(audition).toContain("Deliberately no program-audio write");
  });

  it("locks a real pre-rendered preview and quantizes listening on the musical clock", () => {
    expect(sql).toContain("wave_musical_clock_v5");
    expect(sql).toContain("wave_vote_previews_v5");
    const prepare = body("rooms_wave_prepare_vote_lock_v5");
    expect(prepare).toContain("candidate_version_id = new.candidate_version_id");
    expect(prepare).toContain("reference_beat_revision_id = new.reference_beat_revision_id");
    expect(prepare).toContain("wave_preview_clock_epoch_stale");
    expect(prepare).toContain("v_boundary_bar");
    expect(prepare).toContain("full_duration_ms");
    expect(prepare).toContain("wave_host_disconnected_new_vote_forbidden");
  });

  it("requires a full-listen server receipt and never emits one event per ballot", () => {
    const receipt = body("rooms_wave_record_vote_listen_receipt_v5");
    const ballot = body("rooms_wave_require_vote_receipt_v5");
    expect(receipt).toContain("service_role_required");
    expect(receipt).toContain("wave_vote_full_preview_required");
    expect(receipt).toContain("dynamic_quorum_ratio");
    expect(ballot).toContain("wave_vote_listen_receipt_required");
    expect(ballot).toContain("eligible_snapshot_at");
    expect(ballot).toContain("wave_vote_eligibility_not_frozen");
    expect(body("rooms_wave_freeze_vote_eligibility_v5")).toContain("'vote.opened'");
    expect(ballot).not.toContain("rooms_wave_append_event_v3");
    expect(sql).toContain("primary key(round_id, voter_id)");
  });

  it("uses pending activation, a READY render, a boundary and coordinator fencing", () => {
    expect(sql).toContain("wave_activation_queue_v5");
    expect(sql).toContain("wave_coordinator_leases_v5");
    expect(sql).toContain("wave_transactional_outbox_v5");
    const activate = body("rooms_wave_activate_pending_v5");
    expect(activate).toContain("wave_fencing_token_stale");
    expect(activate).toContain("now() < v_activation.target_at");
    expect(activate).toContain("'READY_FOR_ACTIVATION', 'ACTIVE'");
    expect(activate).toContain("nextTargetAt");
    expect(activate).toContain("set current_beat_revision_id = v_activation.target_revision_id");
    expect(activate).toContain("wave.program.activate");
    expect(sql).toContain("wave.render.requested");
  });

  it("keeps a running vote on host loss and schedules DAW fallback without touching the current program early", () => {
    const presence = body("rooms_wave_update_host_presence_v5");
    expect(presence).toContain("activeVoteContinues");
    expect(presence).toContain("v_program.source = 'HOST_DAW'");
    expect(presence).toContain("'MEASURE', 'PENDING_ACTIVATION'");
    expect(presence).not.toContain("status = 'SUSPENDED'");
  });

  it("uses TTL reservations, heartbeats and an auditable credit ledger", () => {
    expect(sql).toContain("wave_slot_reservations_v5");
    expect(sql).toContain("wave_credit_ledger_v5");
    const reserve = body("rooms_wave_reserve_slot_v5");
    expect(reserve).toContain("wave_submission_allowance_required");
    expect(reserve).toContain("upload_may_complete_until");
    expect(reserve).toContain("'RESERVATION'");
    expect(body("rooms_wave_heartbeat_slot_v5")).toContain("wave_slot_reservation_expired");
  });

  it("scopes private events and returns an authorized recovery envelope", () => {
    const append = body("rooms_wave_append_event_v3");
    const recover = body("rooms_wave_recover_v1");
    expect(append).toContain("subject_user_id");
    expect(append).toContain("v_audience := 'SUBJECT'");
    expect(sql).toContain("wave_event_scoped_read_v5");
    expect(recover).toContain("event.audience = 'HOST' and v_is_master");
    expect(recover).toContain("event.subject_user_id = v_actor");
    expect(recover).toContain("not event.sensitive or v_is_master");
    expect(recover).toContain("'correlationId', p_correlation_id");
    expect(recover).toContain("'data', jsonb_build_object");
  });

  it("supports a public closing vote, immutable final revision and rights-gated private export", () => {
    expect(sql).toContain("wave_closing_votes_v5");
    expect(sql).toContain("wave_closing_ballots_v5");
    const finalize = body("rooms_wave_finalize_closing_vote_v5");
    expect(finalize).toContain("v_approve::numeric / v_total::numeric");
    expect(finalize).toContain("final_beat_revision_id = v_vote.reference_beat_revision_id");
    expect(sql).toContain("wave_final_beat_revision_is_immutable");
    expect(sql).toContain("wave_final_beat_requires_public_closure_vote");
    expect(body("rooms_wave_request_private_mix_export_v5")).toContain("wave_export_rights_incomplete");
  });

  it("keeps tables private and the legacy unsafe program mutation service-only", () => {
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("revoke execute on function public.rooms_change_wave_program_source_v3");
    expect(sql).toContain("from authenticated");
    expect(sql).toContain("Coordinator-fenced transactional outbox");
    expect(sql).not.toContain("AudioContext");
    expect(sql).not.toContain("decodeAudioData");
  });

  it("publishes every strict frontend command contract under its stable RPC name", () => {
    for (const rpc of [
      "rooms_launch_wave_production_v5",
      "rooms_set_wave_category_open_v5",
      "rooms_review_wave_submission_v5",
      "rooms_reject_wave_submission_v5",
      "rooms_request_wave_submission_correction_v5",
      "rooms_mark_wave_submission_ready_for_vote_v5",
      "rooms_start_wave_closing_vote_v5",
      "rooms_cast_wave_closing_vote_v5",
      "rooms_finalize_wave_closing_vote_v5",
    ]) {
      expect(sql).toContain(`create or replace function public.${rpc}`);
      expect(sql).toContain(`grant execute on function public.${rpc}`);
    }
  });
});
