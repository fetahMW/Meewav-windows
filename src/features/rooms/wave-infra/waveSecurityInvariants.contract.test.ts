import { describe, expect, it } from "vitest";
import coreMigration from "../../../../supabase/migrations/20260822220000_wave_production_core_v3.sql?raw";
import assetMigration from "../../../../supabase/migrations/20260822224500_wave_asset_pipeline_v4.sql?raw";
import runtimeMigration from "../../../../supabase/migrations/20260822233000_wave_production_runtime_v5.sql?raw";

const compact = (sql: string) => sql.replace(/\s+/g, " ").trim();

const functionBody = (sql: string, name: string, occurrence: "first" | "last" = "last") => {
  const marker = `create or replace function public.${name}`;
  const start = occurrence === "first" ? sql.indexOf(marker) : sql.lastIndexOf(marker);
  expect(start, `${name} must exist`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("create or replace function public.", start + marker.length);
  return sql.slice(start, end < 0 ? sql.length : end);
};

describe("Wave SQL security invariants", () => {
  it("retires the privileged v3 snapshot and exposes only the scoped v5 projection", () => {
    const runtime = compact(runtimeMigration);

    expect(runtime).toContain(
      "revoke execute on function public.rooms_get_wave_snapshot_v3(uuid) from authenticated",
    );
    expect(runtime).toContain(
      "grant execute on function public.rooms_get_wave_snapshot_v3(uuid) to service_role",
    );
    expect(runtime).toContain(
      "grant execute on function public.rooms_get_wave_snapshot_v5(uuid) to authenticated, service_role",
    );
    expect(functionBody(runtimeMigration, "rooms_get_wave_snapshot_v5")).toContain(
      "wave_snapshot_forbidden",
    );
  });

  it("routes upload confirmation through the service-only v5 identity check", () => {
    const runtime = compact(runtimeMigration);
    const confirmation = functionBody(runtimeMigration, "rooms_wave_confirm_asset_upload_v5");

    expect(assetMigration).toContain("create or replace function public.rooms_wave_confirm_asset_upload_v4");
    expect(runtime).toContain(
      "revoke execute on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text) from authenticated",
    );
    expect(runtime).toContain(
      "grant execute on function public.rooms_wave_confirm_asset_upload_v4(uuid, uuid, uuid, bigint, text, bigint, text, text, text, text) to service_role",
    );
    expect(confirmation).toContain("service_role_required");
    expect(confirmation).toContain("upload.actor_id = p_actor_id");
    expect(confirmation).toContain("wave_upload_confirmation_forbidden");
    expect(confirmation).toContain("set_config('app.wave_actor_id', p_actor_id::text, true)");
  });

  it("starts host presence fail-closed and backfills event confidentiality", () => {
    const hostPresenceStart = runtimeMigration.indexOf(
      "create table if not exists public.wave_host_presence_v5",
    );
    const hostPresenceEnd = runtimeMigration.indexOf(
      "create table if not exists public.wave_closing_votes_v5",
      hostPresenceStart,
    );
    const hostPresence = runtimeMigration.slice(hostPresenceStart, hostPresenceEnd);

    expect(hostPresence).toContain("connected boolean not null default false");
    expect(hostPresence).toContain("daw_audio_available boolean not null default false");
    expect(hostPresence).toContain("daw_level_detected boolean not null default false");
    expect(runtimeMigration).toContain("audience = 'SUBJECT', sensitive = true");
    expect(runtimeMigration).toContain("audience = 'HOST', sensitive = true");
    expect(runtimeMigration).toContain("event.type like 'submission.%'");
    expect(runtimeMigration).toContain("event.type like 'private_audition.%'");
  });

  it("expires reservations atomically and refunds their credits exactly once", () => {
    const expire = functionBody(runtimeMigration, "rooms_wave_expire_reservations_v5");
    const runtime = compact(runtimeMigration);

    expect(expire).toContain("reservation.status = 'RESERVED'");
    expect(expire).toContain("reservation.expires_at <= now()");
    expect(expire).toContain("for update skip locked");
    expect(expire).toContain("set status = 'EXPIRED'");
    expect(expire).toContain("v_balance + v_reservation.credit_cost");
    expect(expire).toContain("'RELEASE'");
    expect(expire).toContain("'expire:' || v_reservation.id::text");
    expect(expire).toContain("on conflict (session_id, contributor_id, idempotency_key) do nothing");
    expect(runtime).toContain(
      "revoke all on function public.rooms_wave_expire_reservations_v5(uuid) from public, anon, authenticated",
    );
    expect(runtime).toContain(
      "grant execute on function public.rooms_wave_expire_reservations_v5(uuid) to service_role",
    );
  });

  it("makes every closing-vote command idempotent", () => {
    for (const [name, command] of [
      ["rooms_start_wave_closing_vote_v5", "start_closing_vote_v5"],
      ["rooms_cast_wave_closing_vote_v5", "cast_closing_vote_v5"],
      ["rooms_finalize_wave_closing_vote_v5", "finalize_closing_vote_v5"],
    ] as const) {
      const body = functionBody(runtimeMigration, name);
      expect(body).toContain("public.wave_idempotency_v3");
      expect(body).toContain(`command_name = '${command}'`);
      expect(body).toContain("idempotency_key = p_idempotency_key");
      expect(body).toContain("idempotency_key_reused");
      expect(body).toContain("pg_advisory_xact_lock");
      expect(body).toContain("return v_result");
    }
  });

  it("returns the same live upload ticket after its slot reservation was consumed", () => {
    const request = functionBody(assetMigration, "rooms_wave_request_asset_upload_v4");
    const wrapper = functionBody(runtimeMigration, "rooms_wave_request_asset_upload_v5");

    expect(request).toContain("reservation.status = 'CONSUMED'");
    expect(request).toContain("upload.reservation_id = reservation.id");
    expect(request).toContain("upload.idempotency_key = $4");
    expect(request).toContain("upload.state = 'AWAITING_UPLOAD'");
    expect(request).toContain(
      "using v_reservation_token, p_session_id, v_actor, p_idempotency_key",
    );
    expect(wrapper).toContain("upload.idempotency_key = p_idempotency_key");
    expect(wrapper).toContain("join public.wave_slot_reservations_v5 reservation");
  });

  it("uses the latest effective consent at every rights gate", () => {
    const vote = functionBody(coreMigration, "rooms_start_wave_vote_v3", "first");
    const exportMix = functionBody(runtimeMigration, "rooms_wave_request_private_mix_export_v5");

    expect(vote).toContain("from public.wave_rights_consents_v3 consent");
    expect(vote).toContain("order by consent.accepted_at desc, consent.id desc limit 1");
    expect(vote).toContain("'REVOKED') <> 'GRANTED'");
    expect(exportMix).toContain("from public.wave_rights_consents_v3 consent");
    expect(exportMix).toContain("order by consent.accepted_at desc, consent.id desc limit 1");
    expect(exportMix).toContain("'REVOKED') <> 'GRANTED'");
  });

  it("keeps program switching service-only and explicitly coordinator-fenced", () => {
    const runtime = compact(runtimeMigration);
    const fencedSwitch = functionBody(runtimeMigration, "rooms_wave_switch_program_audio_v1");

    expect(fencedSwitch).toContain("p_lease_token uuid");
    expect(fencedSwitch).toContain("p_fencing_epoch bigint");
    expect(fencedSwitch).toContain("service_role_required");
    expect(fencedSwitch).toContain("set_config('app.wave_lease_token', p_lease_token::text, true)");
    expect(fencedSwitch).toContain("set_config('app.wave_fencing_epoch', p_fencing_epoch::text, true)");
    expect(runtime).toContain(
      "revoke all on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer, uuid, bigint) from public, anon, authenticated",
    );
    expect(runtime).toContain(
      "grant execute on function public.rooms_wave_switch_program_audio_v1(uuid, text, bigint, text, uuid, numeric, integer, uuid, bigint) to service_role",
    );
  });

  it("cryptographically binds each vote preview to its candidate and reference beat", () => {
    const register = functionBody(runtimeMigration, "rooms_wave_register_vote_preview_v5");
    const voteLock = functionBody(runtimeMigration, "rooms_wave_prepare_vote_lock_v5");

    expect(runtimeMigration).toContain(
      "unique(candidate_version_id, reference_beat_revision_id, mode)",
    );
    expect(register).toContain("asset.metadata->>'candidateVersionId' = p_candidate_version_id::text");
    expect(register).toContain(
      "asset.metadata->>'referenceBeatRevisionId' = p_reference_revision_id::text",
    );
    expect(register).toContain("derivative.comparison_context_hash = p_content_hash");
    expect(voteLock).toContain("candidate_version_id = new.candidate_version_id");
    expect(voteLock).toContain(
      "reference_beat_revision_id = new.reference_beat_revision_id",
    );
  });
});
