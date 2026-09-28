import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ request: vi.fn(), local: vi.fn() }));
vi.mock("../../api/preProfile.api", async importOriginal => ({
  ...await importOriginal<typeof import("../../api/preProfile.api")>(),
  getPublicPreProfile: async () => null, getPublishedPreProfileMedia: async () => [],
  getFollowState: async () => ({ following: false }), getPreProfileGoldenLikeState: async () => ({ ok: false }),
  trackPreProfileAnalytics: async () => null, getMyPrivatePreProfile: async () => null,
  requestProfileCollaboration: calls.request,
}));
vi.mock("../../../messaging/collaborationRequestBridge", () => ({ submitGlobeCollaborationRequest: calls.local }));
vi.mock("../../../emoticons/MeewavEmoticons", () => ({
  MeeWavEmoticonComposer: ({ value, onChange, ariaLabel }: any) => <textarea aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} />,
  MeeWavEmoticonPicker: () => null, appendMeeWavEmoticon: (value: string) => value,
}));
import { HoverPreProfileContent } from "./HoverPreProfileContent";
import { demoPreProfileArtist } from "./demoPreProfileArtist";
import { disableLocalAuthPreview } from "../../../auth/localAuthPreview";
const id = "51000000-0000-4000-8000-000000000001";
function Route() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output>; }
beforeEach(() => { vi.clearAllMocks(); disableLocalAuthPreview(); calls.request.mockResolvedValue({ requestId: "saved-request" }); });
afterEach(cleanup);
async function composer() {
  render(<MemoryRouter><HoverPreProfileContent artist={{ ...demoPreProfileArtist, id, stats: { shorts: 0, audios: 0, collabAvailable: true } }} showMapPin={false} /><Route /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: /Demande de collab/ }));
  fireEvent.change(await screen.findByRole("textbox", { name: "Idée de collaboration" }), { target: { value: "Une session ensemble ?" } });
}
it("uses the backend for a canonical profile even if hydration has not succeeded", async () => {
  await composer();
  expect(calls.request).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" })); });
  expect(calls.request).toHaveBeenCalledWith(expect.objectContaining({ recipientProfileId: id, message: "Une session ensemble ?", source: "globe" }));
  expect(calls.local).not.toHaveBeenCalled();
  expect(screen.getByTestId("route").textContent).toContain("mode=real");
  expect(screen.getByTestId("route").textContent).toContain("request=saved-request");
});
it("keeps the draft on server error and retries with the same idempotency key", async () => {
  calls.request.mockRejectedValueOnce(new Error("offline"));
  await composer();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" })); });
  expect(screen.getByRole("alert")).toHaveTextContent("n'a pas pu être envoyée");
  expect(screen.queryByText("Demande envoyée")).toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" })); });
  expect(calls.request.mock.calls[0][0].idempotencyKey).toEqual(calls.request.mock.calls[1][0].idempotencyKey);
  expect(calls.local).not.toHaveBeenCalled();
});
