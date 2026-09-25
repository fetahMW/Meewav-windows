import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { messagingRepository } from "../../messaging/messaging.service";
import { createPlaceDemoState } from "./place.fixtures";
import PlaceMixerRegie from "./PlaceMixerRegie";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("PlaceMixerRegie", () => {
  it("conserve sélectionné un profil de la file pendant la synchronisation de la conversation", async () => {
    const room = createPlaceDemoState();
    const queueContact = room.queue[0];
    vi.spyOn(messagingRepository, "listConversations").mockResolvedValue([]);
    vi.spyOn(messagingRepository, "getOrCreateDirectConversation").mockResolvedValue({
      ok: true,
      conversation_id: "11111111-1111-4111-8111-111111111111",
      kind: "direct",
      idempotent: false,
    });
    render(<PlaceMixerRegie roomId={room.id} ownerId={room.host.id} queueParticipants={room.queue} />);

    fireEvent.click(screen.getByRole("button", { name: "Régie" }));
    fireEvent.click(await screen.findByRole("tab", { name: "File d’attente" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(queueContact.profile.displayName) }));

    await waitFor(() => expect(screen.getByText(queueContact.profile.displayName)).toBeVisible());
    expect(screen.getByRole("dialog", { name: "Canal Régie" })).toHaveClass("has-contact");
    expect(screen.getByRole("textbox", { name: "Message au régisseur" })).toBeVisible();
  });

  it("conserve le régisseur choisi même si la messagerie ne peut pas créer la conversation", async () => {
    const room = createPlaceDemoState();
    const queueContact = room.queue[0];
    vi.spyOn(messagingRepository, "listConversations").mockResolvedValue([]);
    vi.spyOn(messagingRepository, "getOrCreateDirectConversation").mockRejectedValue(new Error("network"));
    render(<PlaceMixerRegie roomId={room.id} ownerId={room.host.id} queueParticipants={room.queue} />);

    fireEvent.click(screen.getByRole("button", { name: "Régie" }));
    fireEvent.click(await screen.findByRole("tab", { name: "File d’attente" }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(queueContact.profile.displayName) }));

    await waitFor(() => expect(screen.getByText(queueContact.profile.displayName)).toBeVisible());
    expect(screen.getByText(/conversation privée n’a pas encore pu être créée/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Régie" })).toHaveClass("is-linked");
  });
});
