import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PlaceConversationTools from "./PlaceConversationTools";
import { createPlaceDemoState, PLACE_DEMO_PROFILES } from "./place.fixtures";

afterEach(cleanup);
function freshRoom() { return { ...createPlaceDemoState(), id: crypto.randomUUID(), currentUserProfile: PLACE_DEMO_PROFILES.host }; }

describe("Place conversation tools journeys", () => {
  it("separates the speaking queue from the current turn", async () => {
    const room = freshRoom();
    room.participants = room.participants.map((person) => person.profile.displayName === "Lior Benali" ? { ...person, status: "backstage" } : person);
    render(<PlaceConversationTools room={room} isHost canEngage visible />);
    expect(within(screen.getByRole("tablist", { name: "Outils de La Place" })).getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Donner la parole" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "File de parole" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter depuis les coulisses" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter Lior Benali à la file de parole" }));
    fireEvent.click(screen.getByRole("tab", { name: "Tour de parole" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Donner la parole" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Donner la parole" }));
    await waitFor(() => expect(within(screen.getByRole("region", { name: "Passage actuel" })).getByText("Lior Benali")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Mettre le tour en pause" }));
    await screen.findByRole("button", { name: "Reprendre le tour" });
    fireEvent.click(screen.getByRole("button", { name: "Terminer le tour" }));
    await screen.findByText("À vous de parler");
  });

  it("keeps invitations pending until both people personally accept", async () => {
    const room = freshRoom();
    const view = render(<PlaceConversationTools room={room} isHost canEngage visible />);
    fireEvent.click(screen.getByRole("tab", { name: "Clash" }));
    fireEvent.change(screen.getByLabelText("Le sujet du face-à-face"), { target: { value: "Talent ou travail ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer les invitations" }));
    await screen.findByRole("button", { name: "J’accepte" });
    expect(screen.getByRole("button", { name: "Lancer le clash" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "J’accepte" }));
    await screen.findByText("Ton accord est enregistré");
    view.rerender(<PlaceConversationTools room={{ ...room, currentUserProfile: PLACE_DEMO_PROFILES.guestA }} isHost={false} canEngage visible />);
    expect(screen.queryByRole("button", { name: "Lancer le clash" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "J’accepte" }));
    await screen.findByText("Ton accord est enregistré");
    view.rerender(<PlaceConversationTools room={room} isHost canEngage visible />);
    fireEvent.click(screen.getByRole("button", { name: "Lancer le clash" }));
    await screen.findByText("Manche 1 / 3");
    expect(screen.getByRole("button", { name: "Passage suivant" })).toBeEnabled();
  });

  it("completes a collective challenge from proposal to validated success", async () => {
    render(<PlaceConversationTools room={freshRoom()} isHost canEngage visible />);
    fireEvent.click(screen.getByRole("tab", { name: "Défis" }));
    fireEvent.change(screen.getByLabelText("Ton défi"), { target: { value: "Raconte un souvenir drôle" } });
    fireEvent.click(screen.getByRole("button", { name: "Proposer le défi" }));
    await screen.findByRole("button", { name: "Je relève le défi" });
    expect(screen.getByRole("button", { name: "Lancer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Je relève le défi" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Lancer" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Lancer" }));
    await screen.findByRole("button", { name: "J’ai terminé" });
    fireEvent.click(screen.getByRole("button", { name: "J’ai terminé" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Valider la réussite/ })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /Valider la réussite/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Valider la réussite/ })).not.toBeInTheDocument());
    expect(screen.getByText("Réussite validée par le host")).toBeInTheDocument();
  });

  it("does not expose host commands to a visitor and supports keyboard tabs", () => {
    render(<PlaceConversationTools room={{ ...freshRoom(), currentUserProfile: null }} isHost={false} canEngage={false} visible />);
    expect(screen.queryByRole("button", { name: "Donner la parole" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Demander la parole" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Tour de parole" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "File de parole" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("button", { name: "Envoyer les invitations" })).not.toBeInTheDocument();
  });
});
