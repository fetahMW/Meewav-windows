import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260821183000_rooms_scene_tools_v1.sql?raw";

describe("La Scène tools SQL contract", () => {
  it("keeps individual evaluations private and unique per account", () => {
    expect(sql).toContain("room_scene_evaluation_votes_v1");
    expect(sql).toContain("primary key (room_id, performance_id, user_id)");
    expect(sql).toContain("revoke all on public.room_scene_evaluation_votes_v1 from public, anon, authenticated");
    expect(sql).not.toMatch(/grant select on public\.room_scene_evaluation_votes_v1 to (?:anon|authenticated)/i);
  });

  it("validates ended performances and strips private aggregates below the configured rule", () => {
    expect(sql).toContain("v_performance->>'status' <> 'done'");
    expect(sql).toContain("scene_evaluation_already_submitted");
    expect(sql).toContain("resultsVisibility");
    expect(sql).toContain("viewerCompletedPerformanceIds");
    expect(sql).toContain("'{ratingTotal}', '0'::jsonb");
  });

  it("does not expose a fake fundraiser payment mutation", () => {
    expect(sql).not.toMatch(/scene[._]fundraiser[._](?:contribute|pay|credit)/i);
    expect(sql).not.toMatch(/collectedAmount[^\n]*(?:\+|increment)/i);
  });
});
