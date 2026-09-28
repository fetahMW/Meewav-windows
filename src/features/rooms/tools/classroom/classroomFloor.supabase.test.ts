import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { executeClasseFloor, projectClasseFloor } from "./classroomFloor.supabase";

const snapshot = { room: { hands_open: true, media_consent_version: "v1" }, floor_requests: [
  { id: "request-1", user: { user_id: "viewer-1", username: "Élève" }, status: "requested", requested_at: "2026-09-26T10:00:00Z" },
] };
function client(data: unknown = snapshot) {
  const rpc = vi.fn().mockResolvedValue({ data, error: null });
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}
afterEach(() => vi.unstubAllGlobals());

describe("canonical Classe floor", () => {
  it("projects actual requests without replacing resources or accepted public calls", async () => {
    const state = createRoomToolsFixture("classe", "room-1");
    state.classe!.publicCallStudentId = "private-peer";
    const fake = client();
    const next = await projectClasseFloor(fake.client, state, true, "host");
    expect(fake.rpc).toHaveBeenCalledWith("rooms_classe_host_state_v1", { p_room_id: "room-1" });
    expect(next.classe.raisedHands).toEqual([{ personId: "viewer-1", raisedAt: snapshot.floor_requests[0].requested_at }]);
    expect(next.classe.activeSpeakerId).toBeNull();
    expect(next.classe.publicCallStudentId).toBe("private-peer");
    expect(next.classe.resources).toEqual(state.classe!.resources);
    expect(next.classe.people).toContainEqual(expect.objectContaining({ id: "viewer-1", name: "Élève" }));
  });
  it("maps the private self request to the authenticated viewer", async () => {
    const fake = client({ room: snapshot.room, self_floor_request: { id: "r", status: "requested", requested_at: "now" } });
    const next = await projectClasseFloor(fake.client, createRoomToolsFixture("classe", "room-1"), false, "viewer-1");
    expect(next.classe.raisedHands).toEqual([{ personId: "viewer-1", raisedAt: "now" }]);
    expect(fake.rpc).toHaveBeenCalledWith("rooms_classe_viewer_state_v1", { p_room_id: "room-1" });
  });
  it("grants the canonical request rather than persisting a local speaker field", async () => {
    const fake = client();
    await executeClasseFloor(fake.client, "room-1", true, { type: "classe.speaker", personId: "viewer-1" });
    expect(fake.rpc).toHaveBeenLastCalledWith("rooms_classe_grant_floor_v1", { p_request_id: "request-1" });
    await expect(executeClasseFloor(fake.client, "room-1", true, { type: "classe.speaker", personId: "stale-user" })).rejects.toThrow("n’est plus disponible");
  });
  it("checks microphone readiness, releases capture, and records server consent version", async () => {
    const stop = vi.fn();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) } });
    const fake = client();
    await executeClasseFloor(fake.client, "room-1", false, { type: "classe.hand.raise", personId: "viewer-1" });
    expect(stop).toHaveBeenCalledOnce();
    expect(fake.rpc).toHaveBeenLastCalledWith("rooms_classe_request_floor_v1", expect.objectContaining({ p_audio_consent: true, p_microphone_ready: true, p_consent_version: "v1" }));
  });
  it("propagates a revoked or missing canonical authority", async () => {
    const fake = client(); fake.rpc.mockResolvedValue({ data: null, error: { message: "access_revoked" } });
    await expect(projectClasseFloor(fake.client, createRoomToolsFixture("classe", "room-1"), false, "viewer-1")).rejects.toThrow("access_revoked");
  });
});
