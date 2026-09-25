import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260822193000_wave_tools_lifecycle_v2.sql?raw";

describe("Wave lifecycle v2 SQL contract", () => {
  it("declares every authoritative loop state and a server transition graph", () => {
    for (const status of [
      "UPLOADING", "PROCESSING", "RECEIVED", "NEEDS_REVIEW", "NEEDS_CORRECTION",
      "READY_FOR_VOTE", "VOTING", "ACCEPTED", "NOT_SELECTED", "REJECTED",
      "SUPERSEDED", "REMOVED", "PROCESSING_FAILED",
    ]) expect(sql).toContain(`'${status}'`);
    expect(sql).toContain("rooms_wave_transition_allowed_v2");
    expect(sql).toContain("wave_status_transition_forbidden");
  });

  it("normalizes legacy Rooms additively before installing the strict trigger", () => {
    expect(sql).toContain("rooms_wave_normalize_submission_v2");
    expect(sql).toContain("rooms_wave_normalize_state_v2(state, true)");
    expect(sql).toContain("'legacy_normalization'");
    expect(sql).toContain("'{lifecycleStatus}'");
    expect(sql).toContain("'{originalContributorId}'");
    expect(sql).toContain("'{statusHistory}'");
  });

  it("locks one version in one vote and requires an idempotent finalization identity", () => {
    expect(sql).toContain("wave_vote_already_open");
    expect(sql).toContain("'{vote,submissionVersion}'");
    expect(sql).toContain("'{vote,roundId}'");
    expect(sql).toContain("'{vote,finalizationKey}'");
    expect(sql).toContain("wave_vote_already_finalized");
    expect(sql).toContain("wave_vote_finalization_required");
  });

  it("preserves original credit and immutable corrected versions", () => {
    expect(sql).toContain("wave_original_credit_required");
    expect(sql).toContain("wave_original_version_required");
    expect(sql).toContain("v_previous_version->>'status' <> 'SUPERSEDED'");
    expect(sql).toContain("v_current_version->>'status' <> 'NEEDS_REVIEW'");
    expect(sql).toContain("wave_status_history_immutable");
  });

  it("allows only exact accepted versions in the collective beat", () => {
    expect(sql).toContain("v_layer_submission->>'lifecycleStatus' <> 'ACCEPTED'");
    expect(sql).toContain("v_layer->>'submissionVersion'");
    expect(sql).toContain("wave_layer_public_approval_required");
    expect(sql).toContain("wave_layer_duplicate");
  });
});
