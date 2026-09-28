import { createRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import EmbeddedGlobeProfileActions from "./EmbeddedGlobeProfileActions";
import { getGlobeCollaborationRequests, removeGlobeCollaborationRequest } from "../messaging/collaborationRequestBridge";
import { parseEmbeddedProfileAction } from "./embeddedProfileActions";
vi.mock("../emoticons/MeewavEmoticons", () => ({
  MeeWavEmoticonComposer: ({ value, onChange, ariaLabel }: any) => <textarea aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} />,
  MeeWavEmoticonPicker: () => null, appendMeeWavEmoticon: (value: string) => value,
}));
const artist = { id: "ring-demo-test", name: "Artiste test", role: "Chanteuse", portraitUrl: "/portrait.webp", gradeLevel: 3 };
function Location() { const location = useLocation(); return <output data-testid="route">{location.pathname}{location.search}</output>; }
function setup(allowDemo = true) {
  const frame = createRef<HTMLIFrameElement>();
  render(<MemoryRouter><iframe ref={frame} title="Globe" /><EmbeddedGlobeProfileActions frame={frame} ownerId="viewer-test" allowDemo={allowDemo} /><Location /></MemoryRouter>);
  return (payload: object, origin = window.location.origin, source: MessageEventSource | null = frame.current!.contentWindow) => act(() => {
    fireEvent(window, new MessageEvent("message", { origin, source, data: { channel: "meewav:vinyl-globe:v1", type: "profile-action", ...payload } }));
  });
}
afterEach(() => { cleanup(); getGlobeCollaborationRequests().forEach(request => removeGlobeCollaborationRequest(request.id)); });
it("opens the host collaboration inbox through the trusted frame", () => {
  const send = setup();
  send({ action: "manage-collabs" }, "https://outside.example");
  expect(screen.getByTestId("route")).toHaveTextContent(/^\/$/);
  send({ action: "manage-collabs" });
  expect(screen.getByTestId("route")).toHaveTextContent("/messages?space=collabs&source=globe");
});
it("rejects a spoofed source, canonical recipient and unsafe portrait URL", () => {
  const send = setup();
  send({ action: "demo-collaboration", artist }, window.location.origin, window);
  expect(screen.queryByRole("dialog")).toBeNull();
  send({ action: "demo-collaboration", artist: { ...artist, id: "51000000-0000-4000-8000-000000000001" } });
  expect(screen.queryByRole("dialog")).toBeNull();
  const parsed = parseEmbeddedProfileAction({ type: "profile-action", action: "demo-contact", artist: { ...artist, portraitUrl: "https://outside.example/tracker" } });
  expect(parsed && "artist" in parsed && parsed.artist.portraitUrl).toBe("");
});
it("records one demo request only on Send and opens that request in messaging", async () => {
  const send = setup();
  send({ action: "demo-collaboration", artist });
  expect(screen.getByRole("dialog")).toHaveTextContent("aucun envoi à un compte réel");
  expect(getGlobeCollaborationRequests()).toHaveLength(0);
  fireEvent.change(screen.getByRole("textbox", { name: "Idée de collaboration" }), { target: { value: "Créons un duo acoustique." } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" })); });
  expect(getGlobeCollaborationRequests()).toHaveLength(1);
  expect(getGlobeCollaborationRequests()[0]).toMatchObject({ recipientProfileId: artist.id, senderProfileId: "viewer-test", message: "Créons un duo acoustique." });
  fireEvent.click(screen.getByRole("button", { name: "Ouvrir dans la messagerie" }));
  expect(screen.getByTestId("route").textContent).toContain("mode=demo");
  expect(screen.getByTestId("route").textContent).toContain(`request=${getGlobeCollaborationRequests()[0].id}`);
});
it("opens contact as a demo conversation, never a real profile ID", () => {
  setup()({ action: "demo-contact", artist });
  expect(screen.getByTestId("route").textContent).toContain("mockArtistId=ring-demo-test");
  expect(screen.getByTestId("route").textContent).not.toContain("profileId=");
});
it("does not create an invisible demo request in the live Windows inbox", () => {
  setup(false)({ action: "demo-collaboration", artist });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(getGlobeCollaborationRequests()).toHaveLength(0);
  expect(screen.getByText(/Choisis un artiste réel/)).toHaveAttribute("role", "status");
});
