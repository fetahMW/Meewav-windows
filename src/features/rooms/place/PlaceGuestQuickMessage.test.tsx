import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceGuestQuickMessage from "./PlaceGuestQuickMessage";
import { messagingRepository } from "../../messaging/messaging.service";

vi.mock("../../messaging/messaging.service", () => ({
  createMessagingClientMessageId: () => "message-key",
  createMessagingIdempotencyKey: () => "conversation-key",
  messagingRepository: { getOrCreateDirectConversation: vi.fn(), sendTextMessage: vi.fn() },
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  vi.mocked(messagingRepository.getOrCreateDirectConversation).mockResolvedValue({ ok: true, conversation_id: "conversation", kind: "direct", idempotent: false });
  vi.mocked(messagingRepository.sendTextMessage).mockResolvedValue({ ok: true, idempotent: false, message_id: "message", sequence: 1, created_at: "now" });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function setup(live = true) {
  const room = createPlaceDemoState();
  if (live) { room.source = "live"; room.currentUserProfile = room.host; }
  const participant = room.participants.find((item) => item.id === "guest-a")!;
  render(<PlaceGuestQuickMessage room={room} participant={participant} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Contacter/ }));
  return participant;
}
it("ouvre sans envoyer, puis écrit dans la conversation privée du bon artiste", async () => {
  const participant = setup();
  expect(screen.getByRole("dialog")).toHaveAccessibleName(`Message privé à ${participant.profile.displayName}`);
  expect(messagingRepository.getOrCreateDirectConversation).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "  À toi dans une minute !  " } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("status");
  expect(messagingRepository.getOrCreateDirectConversation).toHaveBeenCalledWith(participant.profile.id, "conversation-key");
  expect(messagingRepository.sendTextMessage).toHaveBeenCalledWith({ conversationId: "conversation", clientMessageId: "message-key", body: "À toi dans une minute !" });
});
it("conserve le brouillon et les identifiants après un échec", async () => {
  vi.mocked(messagingRepository.sendTextMessage).mockRejectedValueOnce(new Error("network"));
  setup();
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Attends" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("alert");
  expect(screen.getByRole("textbox")).toHaveValue("Attends");
  fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("status");
  expect(messagingRepository.getOrCreateDirectConversation).toHaveBeenCalledTimes(1);
  expect(vi.mocked(messagingRepository.sendTextMessage).mock.calls[0]).toEqual(vi.mocked(messagingRepository.sendTextMessage).mock.calls[1]);
});
it("n’envoie pas aux artistes fictifs et ferme la modale", async () => {
  setup(false);
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "Démo" } });
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Fermer" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(messagingRepository.sendTextMessage).not.toHaveBeenCalled();
});
