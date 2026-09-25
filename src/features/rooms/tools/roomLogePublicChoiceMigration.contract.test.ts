import { describe, expect, it } from "vitest";
import migration from "../../../../supabase/migrations/20260821143000_loge_public_choice_v1.sql?raw";

describe("Loge public choice database contract", () => {
  it("keeps vote integrity and active Room membership server-side", () => {
    expect(migration).toContain("on conflict (poll_id, user_id) do nothing");
    expect(migration).toContain("participant.left_at is null");
    expect(migration).toContain("poll.host_id <> auth.uid()");
    expect(migration).toContain("room.status = 'live'");
  });

  it("supports optional time, enriched 2–6 choices and private live results", () => {
    expect(migration).toContain("duration_seconds is null");
    expect(migration).toContain("jsonb_array_length(options) between 2 and 6");
    expect(migration).toContain("option_value ->> 'imageUrl'");
    expect(migration).toContain("v_can_view_results");
    expect(migration).toContain("auth.uid() = v_poll.host_id");
  });
});
