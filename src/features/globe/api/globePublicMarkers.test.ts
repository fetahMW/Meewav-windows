import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ from: vi.fn(), range: vi.fn(), abort: vi.fn() }));
vi.mock("../../../lib/supabaseClient", () => ({ supabase: { from: mock.from } }));
import { loadPublicGlobeMarkers, parseLiveMarkers } from "./globePublicMarkers";
const row = { profile_id: "51000000-0000-4000-8000-000000000001", display_name: "Artiste", latitude: 48.85, longitude: 2.35, avatar_icon_id: "avatar_4", commune_code: "75056" };
beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: mock.range };
  mock.from.mockReturnValue(chain);
  mock.range.mockReturnValue({ then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [row], error: null }).then(resolve), abortSignal: mock.abort });
  mock.abort.mockResolvedValue({ data: [row], error: null });
});
describe("public Globe projection", () => {
  it("loads only the visibility-filtered projection, with cancellation", async () => {
    const signal = new AbortController().signal;
    const rows = await loadPublicGlobeMarkers(signal);
    expect(mock.from).toHaveBeenCalledExactlyOnceWith("globe_public_markers_v1");
    expect(mock.abort).toHaveBeenCalledWith(signal);
    expect(rows[0]).toMatchObject({ id: row.profile_id, lon: 2.35, lat: 48.85, live: true });
  });
  it("fails visibly instead of substituting demo profiles", async () => {
    mock.range.mockResolvedValue({ data: null, error: new Error("offline") });
    await expect(loadPublicGlobeMarkers()).rejects.toThrow("pas disponibles");
  });
  it("paginates stable IDs until the last page", async () => {
    mock.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => row), error: null })
      .mockResolvedValueOnce({ data: [{ ...row, profile_id: "51000000-0000-4000-8000-000000000002" }], error: null });
    const markers = await loadPublicGlobeMarkers();
    expect(mock.range.mock.calls).toEqual([[0,499],[500,999]]); expect(markers).toHaveLength(2);
  });
  it("discards malformed IDs and missing coordinates, including null coercion to zero", () => {
    expect(parseLiveMarkers([row, { ...row, latitude: null }, { ...row, longitude: "" }, { ...row, latitude: 91 }, { ...row, profile_id: "demo-user" }])).toHaveLength(1);
  });
  it("preserves a Corsican commune and strips unsafe image URL schemes", () => {
    expect(parseLiveMarkers([{ ...row, commune_code: "2A004", avatar_url: "javascript:alert(1)" }])[0]).toMatchObject({ cityId: "fr-commune-2A004", avatarUrl: null });
    expect(parseLiveMarkers([{ ...row, avatar_url: "//untrusted.example/image" }])[0].avatarUrl).toBeNull();
  });
});
