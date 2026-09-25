import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import PlaceBackstageControls from "./PlaceBackstageControls";
import { createPlaceDemoState } from "./place.fixtures";
import type { PlaceLiveKitVideoTrack } from "./placeLiveKit.service";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const room = createPlaceDemoState();
  room.source = "live";
  const participant = room.participants.find((item) => item.id === "guest-d")!;
  participant.isCameraEnabled = true;
  participant.status = "backstage";
  const attach = vi.fn(); const detach = vi.fn();
  const item = { participantIdentity: participant.profile.id, source: "camera", muted: false, local: false,
    track: { attach, detach } } as unknown as PlaceLiveKitVideoTrack;
  return { room, participant, item, attach, detach };
}
it("affiche deux boutons sans tooltip et attache uniquement l’aperçu demandé, muet", () => {
  const { room, participant, item, attach, detach } = fixture();
  render(<PlaceBackstageControls room={room} participant={participant} isHost liveKitVideoTracks={[item]} />);
  expect(screen.getAllByRole("button")).toHaveLength(2);
  expect(attach).not.toHaveBeenCalled();
  const trigger = screen.getByRole("button", { name: /Voir la caméra/ });
  expect(trigger).not.toHaveAttribute("title");
  fireEvent.click(trigger);
  const video = screen.getByLabelText("Aperçu caméra privé") as HTMLVideoElement;
  expect(video.muted).toBe(true);
  expect(attach).toHaveBeenCalledWith(video);
  fireEvent.click(screen.getByRole("button", { name: "Fermer l’aperçu" }));
  expect(detach).toHaveBeenCalledWith(video);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(participant.status).toBe("backstage");
});
it("ne remplace pas un flux absent par celui d’un autre artiste", () => {
  const { room, participant, item, attach } = fixture();
  render(<PlaceBackstageControls room={room} participant={participant} isHost liveKitVideoTracks={[{ ...item, participantIdentity: "someone-else" }]} />);
  fireEvent.click(screen.getByRole("button", { name: /Voir la caméra/ }));
  expect(screen.getByRole("status")).toHaveTextContent("Aucun flux caméra autorisé");
  expect(attach).not.toHaveBeenCalled();
});
it("respecte la caméra coupée et réserve les actions au Host", () => {
  const { room, participant, item, attach } = fixture();
  participant.isCameraEnabled = false;
  const { rerender } = render(<PlaceBackstageControls room={room} participant={participant} isHost liveKitVideoTracks={[item]} />);
  fireEvent.click(screen.getByRole("button", { name: /Voir la caméra/ }));
  expect(screen.getByRole("status")).toHaveTextContent("coupé sa caméra");
  expect(attach).not.toHaveBeenCalled();
  rerender(<PlaceBackstageControls room={room} participant={participant} isHost={false} liveKitVideoTracks={[item]} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});
