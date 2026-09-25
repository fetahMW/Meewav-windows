import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260817120000_rooms_specialized_audience_v1.sql?raw";

describe("specialized Room audience SQL contract", () => {
  it("keeps authoritative state and action receipts private", () => {
    expect(sql).toContain("revoke all on public.room_specialized_state_v1 from anon, authenticated");
    expect(sql).toContain("revoke all on public.room_specialized_action_receipts_v1 from anon, authenticated");
    expect(sql).not.toMatch(/grant select on public\.room_specialized_state_v1 to (?:anon|authenticated)/i);
    expect(sql).not.toMatch(/alter publication supabase_realtime add table public\.room_specialized_state_v1/i);
  });

  it("publishes only a revision signal and reloads a server projection", () => {
    expect(sql).toContain("room_specialized_state_signal_v1");
    expect(sql).toContain("alter publication supabase_realtime add table public.room_specialized_state_signal_v1");
    expect(sql).toContain("rooms_get_specialized_state_v1");
    expect(sql).toContain("rooms_specialized_project_state_v1");
    expect(sql).toContain("grant execute on function public.rooms_get_specialized_state_v1(uuid) to anon, authenticated, service_role");
  });

  it("strips every known private Viewer field on the server", () => {
    expect(sql).toContain("coalesce(p_person, '{}'::jsonb) - 'access'");
    expect(sql).toContain("'{scene,prompter}'");
    expect(sql).toContain("'{wave,submissions}'");
    expect(sql).toContain("'{privateNotes}'");
    expect(sql).toContain("'{cage,resultHistory}'");
    expect(sql).toContain("v_item := v_item - 'privateContent'");
    expect(sql).toContain("'{gifts,transactions}'");
  });

  it("uses narrow authenticated actions with server-derived identity and one-vote guards", () => {
    const action = sql.slice(sql.indexOf("create or replace function public.rooms_apply_specialized_viewer_action_v1"));
    expect(action).toContain("v_uid uuid := auth.uid()");
    expect(action).toContain("room_specialized_action_receipts_v1");
    expect(action).toContain("wave_vote_already_cast");
    expect(action).toContain("wave_vote_expired");
    expect(action).toContain("cage_vote_already_cast");
    expect(action).toContain("cage_vote_expired");
    expect(action).toContain("classe_seat_required");
    expect(action).toContain("'{canSpeak}', 'false'::jsonb");
    expect(action).toContain("loge_face_to_face_forbidden");
    expect(action).toContain("loge_access_required");
    expect(action).toContain("room_bans_v2");
    expect(action).not.toContain("p_user_id uuid");
  });

  it("validates Wave uploads and closes expired public votes in the projection", () => {
    expect(sql).toContain("wave_rights_unconfirmed");
    expect(sql).toContain("wave_file_too_large");
    expect(sql).toContain("wave_file_type_invalid");
    expect(sql).toContain("wave_media_path_invalid");
    expect(sql).toContain("wave_submission_limit");
    expect(sql).toContain("'{vote,open}', 'false'::jsonb");
    expect(sql).toContain("'{cage,votingOpen}', 'false'::jsonb");
    expect(sql).toContain("rooms_specialized_wave_media_visible_v1(name, auth.uid())");
    expect(sql).toContain("submission->>'mediaPath' = p_name");
    expect(sql).toContain("submission->>'status' = 'accepted'");
    expect(sql).toContain("(submission #>> '{vote,endsAt}')::timestamptz > now()");
    expect(sql).toContain("(storage.foldername(p_name))[2] = p_user_id::text");
  });

  it("hides only the unrevealed current Cage match and preserves prior bracket results", () => {
    expect(sql).toContain("v_item->>'id' = (v_state #>> '{cage,currentMatchId}')");
    expect(sql).toContain("v_item->>'matchId' <> (v_state #>> '{cage,currentMatchId}')");
  });

  it("derives Loge eligibility from existing invitations and gift rights without exposing their rows", () => {
    const eligibility = sql.slice(
      sql.indexOf("create or replace function public.rooms_specialized_loge_eligible_v1"),
      sql.indexOf("create or replace function public.rooms_specialized_project_state_v1"),
    );
    expect(eligibility).toContain("room_invitations_v2");
    expect(eligibility).toContain("room_gift_deliveries_v1");
    expect(eligibility).toContain("room_gift_awards_v1");
    expect(eligibility).toContain("'vip-pass', 'private-access'");
    expect(sql).toContain("jsonb_build_object('eligible', v_eligible)");
    expect(sql).toContain("'{gifts,redemptions}', '[]'::jsonb");
    expect(sql).toContain("v_row.room_type = 'loge' and not v_eligible");
    expect(sql).toContain("'{loge,preview,mediaName}', '\"\"'::jsonb");
    expect(sql).toContain("'{loge,questions}', '[]'::jsonb");
    expect(sql).toContain("'{loge,moments}', '[]'::jsonb");
  });

  it("serializes Host commits and public actions with monotonic revisions", () => {
    expect(sql).toContain("for update");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("room_specialized_revision_conflict");
    expect(sql).toContain("v_revision := v_row.revision + 1");
    expect(sql).toContain("primary key (room_id, user_id, idempotency_key)");
  });
});
