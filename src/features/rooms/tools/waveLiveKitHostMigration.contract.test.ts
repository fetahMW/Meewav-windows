import { describe, expect, it } from "vitest";
import tokenFunction from "../../../../supabase/functions/livekit-token/index.ts?raw";
import migration from "../../../../supabase/migrations/20260822232000_rooms_wave_livekit_host_v1.sql?raw";

describe("Wave LiveKit Host publication contract", () => {
  it("admits live Wave Rooms through the canonical SFU token function", () => {
    expect(tokenFunction).toContain('.in("type", ["place", "wave"])');
    expect(tokenFunction).toContain('"screen_share_audio"');
  });

  it("authorizes only the live Wave Host and revokes on lifecycle changes", () => {
    expect(migration).toContain("new.type <> 'wave'");
    expect(migration).toContain("new.host_id");
    expect(migration).toContain("rooms_set_livekit_publication_authorization_v1");
    expect(migration).toContain("'wave_room_ended'");
    expect(migration).toContain("room.type = 'wave' and room.status = 'live'");
    expect(migration).not.toMatch(/room_(?:participants|invitations)_v2|guest_id/iu);
  });
});
