import { describe, expect, it } from "vitest";
import migration from "../../../../supabase/migrations/20260822224500_wave_asset_pipeline_v4.sql?raw";
import healthFunction from "../../../../supabase/functions/rooms-wave-infra-health/index.ts?raw";
import ticketFunction from "../../../../supabase/functions/rooms-wave-asset-upload-ticket/index.ts?raw";
import confirmFunction from "../../../../supabase/functions/rooms-wave-asset-upload-confirm/index.ts?raw";
import statusFunction from "../../../../supabase/functions/rooms-wave-asset-processing-status/index.ts?raw";
import auditionFunction from "../../../../supabase/functions/rooms-wave-private-audition/index.ts?raw";
import runtimeMigration from "../../../../supabase/migrations/20260822233000_wave_production_runtime_v5.sql?raw";

describe("Wave private asset pipeline v4 contract", () => {
  it("uses a private one-object Storage pipeline instead of a public media URL", () => {
    expect(migration).toContain("'room-wave-private'");
    expect(migration).toContain("false,\n  52428800");
    expect(ticketFunction).toContain("createSignedUploadUrl(objectKey, { upsert: false })");
    expect(ticketFunction).toContain('method: "PUT"');
    expect(ticketFunction).toContain('resumable: false');
    expect(ticketFunction).not.toContain("getPublicUrl");
    expect(confirmFunction).toContain(".list(folder");
    expect(confirmFunction).not.toContain("body.eTag");
    expect(migration).toContain("as restrictive");
    expect(migration).toContain("bucket_id <> 'room-wave-private'");
  });

  it("links every ticket to the v3 asset/submission/version aggregate", () => {
    expect(migration).toContain("references public.wave_loop_submissions_v3(id)");
    expect(migration).toContain("references public.wave_audio_assets_v3(id)");
    expect(migration).toContain("insert into public.wave_loop_submissions_v3");
    expect(migration).toContain("insert into public.wave_audio_assets_v3");
    expect(migration).toContain("create table if not exists public.wave_asset_derivatives_v4");
    expect(migration).toContain("'PLAYBACK_DERIVATIVE'");
    expect(migration).toContain("'PREVIEW_DERIVATIVE'");
    expect(migration).toContain("target_sample_rate = 48000");
    expect(migration).toContain("insert into public.wave_loop_versions_v3");
    expect(migration).toContain("insert into public.wave_loop_analysis_v3");
    expect(migration).toContain("rooms_wave_append_event_v3");
    expect(migration).toContain("based_on_beat_revision_id");
    expect(migration).toContain("based_on_rules_revision_id");
    expect(migration).toContain("based_on_rules_version");
  });

  it("enforces membership, control-only host base, category, slot, quota, consent and idempotence", () => {
    const requestStart = migration.indexOf("create or replace function public.rooms_wave_request_asset_upload_v4");
    const requestEnd = migration.indexOf("create or replace function public.rooms_wave_confirm_asset_upload_v4");
    const requestRpc = migration.slice(requestStart, requestEnd);
    expect(requestRpc).toContain("rooms_wave_is_member_v3");
    expect(requestRpc).toContain("rooms_wave_is_control_v3");
    expect(requestRpc).toContain("wave_host_base_control_required");
    expect(requestRpc).toContain("accepting_submissions");
    expect(requestRpc).toContain("wave_category_has_no_open_slot");
    expect(requestRpc).toContain("wave_submission_quota_reached");
    expect(requestRpc).toContain("wave_submission_slots_full");
    expect(requestRpc).toContain("wave_upload_rate_limited");
    expect(requestRpc).toContain("insert into public.wave_rights_consents_v3");
    expect(requestRpc).toContain("wave_upload_idempotency_conflict");
    expect(requestRpc).toContain("pg_advisory_xact_lock");
    expect(requestRpc).toContain("wave_contributor_not_authorized");
    expect(requestRpc).toContain("wave_production_reference_required");
  });

  it("makes confirmation an enqueue acknowledgement, never fake analysis success", () => {
    const confirmStart = migration.indexOf("create or replace function public.rooms_wave_confirm_asset_upload_v4");
    const confirmEnd = migration.indexOf("create or replace function public.rooms_wave_get_asset_processing_status_v4");
    const confirmRpc = migration.slice(confirmStart, confirmEnd);
    expect(confirmRpc).toContain("wave_asset_processing_outbox_v4");
    expect(confirmRpc).toContain("set state = 'PROCESSING'");
    expect(confirmRpc).not.toContain("set state = 'READY'");
    expect(confirmFunction).toContain('["VERIFYING", "PROCESSING"]');
    expect(confirmFunction).toContain("wave_upload_confirmation_state_invalid");
  });

  it("leases isolated worker jobs and restricts READY promotion to service role verification", () => {
    expect(migration).toContain("rooms_wave_claim_asset_processing_v4");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("job.leased_at < now() - interval '5 minutes'");
    expect(migration).toContain("rooms_wave_complete_asset_processing_v4");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("p_analysis->>'sha256' is distinct from v_upload.expected_sha256");
    expect(migration).toContain("p_analysis->>'safe'");
    expect(migration).toContain("wave_playback_derivative_required");
    expect(migration).toContain("wave_preview_derivative_required");
    expect(migration).toContain("wave_waveform_asset_invalid");
    expect(migration).toContain("where id = v_upload.asset_id");
    expect(migration).toContain("set state = 'READY'");
  });

  it("keeps private coordinates and worker jobs inaccessible to browser roles", () => {
    for (const table of [
      "wave_ingestion_policy_v4",
      "wave_asset_uploads_v4",
      "wave_asset_derivatives_v4",
      "wave_asset_retention_v4",
      "wave_asset_processing_outbox_v4",
      "wave_asset_gc_outbox_v4",
      "wave_asset_command_receipts_v4",
      "wave_private_auditions_v4",
      "wave_private_audition_outbox_v4",
    ]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(statusFunction).toContain("rooms_wave_get_asset_processing_status_v4");
  });

  it("keeps host audition server-authoritative and refuses a browser/Edge stem mix", () => {
    expect(migration).toContain("rooms_wave_request_private_audition_v4");
    expect(migration).toContain("wave_private_audition_control_required");
    expect(migration).toContain("wave_private_audition_reference_stale");
    expect(migration).toContain("wave_private_audition_outbox_v4");
    expect(migration).toContain("rooms_wave_claim_private_auditions_v4");
    expect(migration).toContain("rooms_wave_complete_private_audition_v4");
    expect(migration).toContain("wave_audition_preview_derivative_invalid");
    expect(auditionFunction).toContain("WAVE_AUDIO_ENGINE_RENDER_URL");
    expect(auditionFunction).toContain("createSignedUrl");
    expect(auditionFunction).not.toContain("AudioContext");
    expect(auditionFunction).not.toContain("decodeAudioData");
    expect(auditionFunction).not.toContain("OfflineAudioContext");
  });

  it("reports missing external services honestly instead of advertising a frontend-only success", () => {
    for (const envName of [
      "WAVE_REALTIME_HEALTH_URL",
      "WAVE_AUDIO_PROCESSING_HEALTH_URL",
      "WAVE_AUDIO_ENGINE_HEALTH_URL",
      "WAVE_MEDIA_SFU_HEALTH_URL",
    ]) expect(healthFunction).toContain(envName);
    expect(healthFunction).toContain('status: "not_configured"');
    expect(healthFunction).toContain('status: "unavailable"');
    expect(healthFunction).toContain("productionReady");
    expect(healthFunction).toContain("Object.values(capabilities).every(Boolean)");
    expect(healthFunction).toContain("WAVE_AUDIO_ENGINE_RENDER_URL_MISSING");
    expect(ticketFunction).toContain("configuredServiceUrl");
    expect(ticketFunction).toContain("wave_audio_processing_not_configured");
    expect(statusFunction).toContain("wave_audio_processing_not_configured");
  });

  it("distinguishes studio/light ProductionReference assets and enforces comparable vote previews", () => {
    expect(migration).toContain("PRODUCTION_REFERENCE_STUDIO");
    expect(migration).toContain("PRODUCTION_REFERENCE_LIGHT");
    expect(migration).toContain("audio/wav");
    expect(migration).toContain("audio/flac");
    expect(migration).toContain("audio/mpeg");
    expect(migration).toContain("AUTHORIZED_CONTRIBUTOR");
    expect(migration).toContain("VOTE_PREVIEW");
    expect(migration).toContain("ITU-R_BS.1770");
    expect(migration).toContain("EBU_R128");
    expect(migration).toContain("true_peak_dbfs");
    expect(migration).toContain("comparison_duration_ms");
    expect(migration).toContain("comparison_context_hash");
    expect(runtimeMigration).toContain("create table if not exists public.wave_production_references_v5");
    expect(runtimeMigration).toContain("studio_asset_id");
    expect(runtimeMigration).toContain("light_asset_id");
    expect(runtimeMigration).toContain("wave_production_reference_forbidden");
    expect(runtimeMigration).toContain("wave_submission_allowances_v3");
  });

  it("persists rights-aware retention and leases deletion instead of pretending cleanup", () => {
    expect(migration).toContain("create table if not exists public.wave_asset_retention_v4");
    expect(migration).toContain("LEGAL_HOLD");
    expect(migration).toContain("rooms_wave_schedule_asset_gc_v4");
    expect(migration).toContain("rooms_wave_claim_asset_gc_v4");
    expect(migration).toContain("rooms_wave_complete_asset_gc_v4");
    expect(migration).toContain("wave_original_rights_disposition_required");
    expect(migration).toContain("p_storage_object_deleted");
    expect(runtimeMigration).toContain("create table if not exists public.wave_retention_policies_v5");
  });

  it("keeps upload lifecycle events private to the contributor after the v5 audience projection", () => {
    expect(runtimeMigration).toContain("v_audience := 'SUBJECT'");
    expect(runtimeMigration).toContain("v_sensitive := true");
    expect(migration).toContain("jsonb_build_object('status', 'PROCESSING')");
    expect(migration).not.toContain("jsonb_build_object('uploadId', v_upload.id");
    expect(migration).not.toContain("jsonb_build_object('assetId', v_upload.asset_id");
  });
});
