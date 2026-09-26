import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("../../runtime/applicationMode", () => ({ getDesktopApplicationMode: () => "live" }));
vi.mock("./api/globePublicMarkers", () => ({ loadPublicGlobeMarkers: mocks.load }));
vi.mock("./LiveGlobeProfile", () => ({ default: ({ marker }: any) => <div role="dialog">Profil réel {marker.id}</div> }));
vi.mock("../../../vendor/meewav-vinyl/src/GlobeLoading", () => ({ default: () => <div>Chargement</div> }));
import VinylGlobe from "./VinylGlobe";
const marker = { id: "51000000-0000-4000-8000-000000000001", live: true, name: "Artiste", lon: 2.35, lat: 48.85 };
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue([marker]); });
afterEach(cleanup);
function setup() {
  render(<MemoryRouter><VinylGlobe ownerKey="current-user" /></MemoryRouter>);
  const frame = screen.getByTitle("Globe MeeWav et artistes légendaires") as HTMLIFrameElement;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  const message = async (data: unknown, origin = window.location.origin, source = frame.contentWindow) => {
    await act(async () => { fireEvent(window, new MessageEvent("message", { origin, source, data: { channel: "meewav:vinyl-globe:v1", ...(data as object) } })); });
  };
  return { frame, post, message };
}
it("sends public marker data only to the trusted frame, never session credentials", async () => {
  const { post, message } = setup();
  await message({ type: "markers-request", requestId: "1" }, "https://outside.example");
  expect(mocks.load).not.toHaveBeenCalled();
  await message({ type: "markers-request", requestId: "2" });
  expect(post).toHaveBeenCalledWith({ channel: "meewav:vinyl-globe:v1", type: "markers-result", requestId: "2", markers: [marker] }, window.location.origin);
  expect(JSON.stringify(post.mock.calls)).not.toMatch(/access_token|refresh_token|Authorization/);
});
it("opens only real profiles in the current public projection", async () => {
  const { message } = setup();
  await message({ type: "profile-select", profileId: marker.id }); expect(screen.queryByRole("dialog")).toBeNull();
  await message({ type: "markers-request", requestId: "3" });
  await message({ type: "profile-select", profileId: "unknown" }); expect(screen.queryByRole("dialog")).toBeNull();
  await message({ type: "profile-select", profileId: marker.id }); expect(screen.getByRole("dialog")).toHaveTextContent(marker.id);
});
it("clears stale profiles after a failed refresh", async () => {
  const { post, message } = setup();
  await message({ type: "markers-request", requestId: "4" }); await message({ type: "profile-select", profileId: marker.id });
  mocks.load.mockRejectedValue(new Error("offline"));
  await message({ type: "markers-request", requestId: "5" }); expect(screen.queryByRole("dialog")).toBeNull();
  expect(post).toHaveBeenLastCalledWith({ channel: "meewav:vinyl-globe:v1", type: "markers-result", requestId: "5", error: true }, window.location.origin);
});
