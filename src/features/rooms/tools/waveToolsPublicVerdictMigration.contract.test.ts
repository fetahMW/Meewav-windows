import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260821213000_wave_tools_public_verdict_v1.sql?raw";

describe("Wave public-verdict SQL contract", () => {
  it("lets controls read only media referenced by the private Sas", () => {
    const visibility = sql.slice(0, sql.indexOf("create or replace function public.rooms_specialized_guard_wave_verdict_v1"));
    expect(visibility).toContain("submission->>'mediaPath' = p_name");
    expect(visibility).toContain("rooms_specialized_is_control_v1(state.room_id, p_user_id)");
    expect(visibility).toContain("state.state #>> '{wave,baseLoop,mediaPath}' = p_name");
    expect(visibility).toContain("(storage.foldername(p_name))[2] = p_user_id::text");
    expect(visibility).toContain("submission->>'status' = 'accepted'");
    expect(visibility).toContain("'{vote,open}'");
  });

  it("keeps the launch base immutable once configured", () => {
    expect(sql).toContain("wave_base_locked");
    expect(sql).toContain("wave_base_invalid");
    expect(sql).toContain("not in (4, 8)");
    expect(sql).toContain("not between 40 and 260");
    expect(sql).toContain("wave,baseLoop");
  });

  it("forbids control ballots and requires a closed positive public result", () => {
    expect(sql).toContain("wave_vote_control_forbidden");
    expect(sql).toContain("wave_vote_already_open");
    expect(sql).toContain("wave_vote_required");
    expect(sql).toContain("wave_vote_threshold_not_met");
    expect(sql).toContain("v_yes * 100.0 / v_total");
    expect(sql).toContain("wave_layer_public_approval_required");
    expect(sql).toContain("wave_vote_outcome_mismatch");
  });

  it("projects aggregates without exposing other voters' account ids", () => {
    expect(sql).toContain("rooms_specialized_sanitize_wave_votes_v1");
    expect(sql).toContain("'totalVotes', v_total");
    expect(sql).toContain("'yesCount', v_yes");
    expect(sql).toContain("jsonb_build_object(p_user_id::text, v_choice)");
    expect(sql).toContain("rooms_specialized_project_state_v3");
  });

  it("disables gift state changes only for Wave", () => {
    expect(sql).toContain("if new.room_type <> 'wave' then return new");
    expect(sql).toContain("wave_gifts_disabled");
  });
});
