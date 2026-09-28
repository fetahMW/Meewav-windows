import { beforeEach, describe, expect, it, vi } from "vitest";
import { cageProductionFilename, CAGE_PRODUCTION_MAX_BYTES, confirmCageProductionReady, getCageProduction, loadCageProduction, parseCageProduction, validateCageProductionReference } from "./cageProduction.service";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), download: vi.fn(), from: vi.fn() }));
vi.mock("../../../../lib/supabaseClient", () => ({ supabase: { rpc: mocks.rpc, storage: { from: mocks.from } } }));
const room = { id: "room-id", source: "live" as const, host: { id: "host-id" } } as Parameters<typeof getCageProduction>[0];
const row = { loop_title: "Prod du Host", loop_bpm: 96, loop_distribution_ref: "host-id/room-id/asset.wav", revision: 8 };
beforeEach(() => { vi.clearAllMocks(); mocks.from.mockReturnValue({ download: mocks.download }); });

describe("iOS Cage production contract", () => {
  it("reads the public metadata and downloads the room's private object", async () => {
    mocks.rpc.mockResolvedValue({ data: { loop: row, tournament: null }, error: null });
    mocks.download.mockResolvedValue({ data: new Blob(["audio"]), error: null });
    const production = await getCageProduction(room);
    expect(production).toEqual({ reference: row.loop_distribution_ref, title: row.loop_title, bpm: 96, revision: 8 });
    expect(mocks.rpc).toHaveBeenCalledWith("rooms_cage_session_v1", { p_room_id: room.id, p_include_draft: false });
    await loadCageProduction(room, production!);
    expect(mocks.from).toHaveBeenCalledWith("room-cage-loops");
    expect(mocks.download).toHaveBeenCalledWith(row.loop_distribution_ref);
  });
  it("keeps the tournament's current prod instead of the host's next draft", async () => {
    mocks.rpc.mockResolvedValue({ data: { loop: { ...row, loop_title: "Next" }, tournament: { ...row, status: "active" } }, error: null });
    expect((await getCageProduction(room))?.title).toBe("Prod du Host");
  });
  it("supports the earlier public-loop contract only when the session RPC is absent", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } }).mockResolvedValueOnce({ data: row, error: null });
    expect((await getCageProduction(room))?.reference).toBe(row.loop_distribution_ref);
    expect(mocks.rpc).toHaveBeenLastCalledWith("rooms_cage_public_loop_v1", { p_room_id: room.id });
  });
  it.each(["other/room-id/asset.wav", "host-id/other/asset.wav", "host-id/room-id/../asset.wav", "https://example.com/audio.wav", "host-id/room-id/nested/asset.wav", "host-id/room-id/asset.exe"])("rejects an unauthorized media reference: %s", reference => {
    expect(() => validateCageProductionReference(reference, room)).toThrow();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("fails explicitly when live metadata is unavailable, without demo substitution", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(getCageProduction(room)).rejects.toThrow("momentanément indisponible");
  });
  it("keeps empty and malformed metadata distinct", () => {
    expect(parseCageProduction(null)).toBeNull();
    expect(() => parseCageProduction({ loop_title: "missing asset" })).toThrow();
    expect(parseCageProduction({ ...row, loop_bpm: Infinity })?.bpm).toBeNull();
  });
  it.each([0, CAGE_PRODUCTION_MAX_BYTES + 1])("rejects invalid file size %s", async size => {
    mocks.download.mockResolvedValue({ data: { size }, error: null });
    await expect(loadCageProduction(room, parseCageProduction(row)!)).rejects.toThrow("25 Mo");
  });
  it("uses the exact asset reference when confirming the artist's production", async () => {
    mocks.rpc.mockResolvedValue({ data: {}, error: null });
    await confirmCageProductionReady(room, row.loop_distribution_ref);
    expect(mocks.rpc).toHaveBeenCalledWith("rooms_cage_set_production_ready_v1", { p_room_id: room.id, p_loop_reference: row.loop_distribution_ref, p_ready: true });
  });
  it("downloads with a safe title and preserves the actual audio extension", () => {
    expect(cageProductionFilename({ reference: row.loop_distribution_ref, title: 'Prod: "Minuit" / live?', bpm: null, revision: 1 })).toBe("Prod Minuit  live.wav");
  });
});
