import { describe, expect, it } from "vitest";
import sql from "../../../../supabase/migrations/20260817123000_rooms_direct_profile_invitation_v1.sql?raw";

describe("rooms direct profile invitation", () => {
  it("reste host-only, bloque les relations interdites et écrit une invitation pending", () => {
    expect(sql).toContain("rooms_v2_assert_host(p_room_id)");
    expect(sql).toContain("messaging_profiles_blocked_v1");
    expect(sql).toContain("room_bans_v2");
    expect(sql).toContain("'pending'");
    expect(sql).toContain("grant execute on function public.rooms_invite_profile_v1(uuid, uuid)");
  });
});
