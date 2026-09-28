import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROOM_STANDARD_GIFT_CATALOG,
  profileGiftDateAfter,
  profileGiftDeliveryForAction,
  profileGiftToday,
} from "../../profile/gifts/profileGiftCatalog";
import PlaceGiftTool, { type PlaceGiftRecipientOption } from "./PlaceGiftTool";

afterEach(cleanup);

const RECIPIENTS: PlaceGiftRecipientOption[] = [
  { profileId: "profile-lior", displayName: "Lior Benali", source: "stage", detail: "Invité sur scène" },
  { profileId: "profile-louna", displayName: "Louna Saphir", source: "backstage", detail: "Prête dans les coulisses" },
  { profileId: "profile-june", displayName: "June Kairo", source: "queue", detail: "En attente" },
  { profileId: "profile-echo", displayName: "Echo Flow", source: "messaging", detail: "@echo_flow" },
];

function chooseGiftAndRecipient(gift: string, recipient: string) {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(gift, "i") }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir le destinataire" }));
  fireEvent.click(screen.getByRole("button", { name: recipient }));
  fireEvent.click(screen.getByRole("button", { name: "Choisir l’envoi" }));
}

describe("PlaceGiftTool", () => {
  it("reveals the gift explanation only while the card is selected", () => {
    render(<PlaceGiftTool />);

    const supporter = screen.getByRole("button", { name: /Supporter d’Or/i });
    fireEvent.pointerEnter(supporter);
    expect(document.querySelector(".place-gift-tool__discovery")).not.toBeInTheDocument();

    fireEvent.click(supporter);
    const discovery = document.querySelector(".place-gift-tool__discovery") as HTMLElement;
    expect(discovery).toBeVisible();
    expect(within(discovery).getByText("Distingue la personne qui a apporté le soutien financier le plus important pendant la Room.")).toBeVisible();
    expect(within(discovery).getByText("Cliquer pour revenir")).toBeVisible();
    expect(supporter).toHaveAttribute("aria-pressed", "true");

    fireEvent.pointerLeave(supporter);
    expect(document.querySelector(".place-gift-tool__discovery")).toBeVisible();

    fireEvent.click(supporter);
    expect(document.querySelector(".place-gift-tool__discovery")).not.toBeInTheDocument();
    expect(supporter).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the footer free of a duplicate gift preview and opens Profile inventory safely", () => {
    render(<PlaceGiftTool />);

    const footer = document.querySelector(".place-gift-tool__footer");
    expect(footer).not.toBeNull();
    expect(footer?.querySelector(".profile-gift-object")).toBeNull();
    const inventoryLink = within(footer as HTMLElement).getByRole("link", { name: /Voir mes cadeaux disponibles/i });
    expect(inventoryLink).toHaveTextContent("Mes cadeaux");
    expect(inventoryLink).toHaveAttribute("href", "/profile/creations/studio/gifts");
    expect(inventoryLink).toHaveAttribute("target", "_blank");
    expect(inventoryLink).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("uses reward wording throughout the Cage variant", () => {
    render(<PlaceGiftTool terminology="reward" />);

    const tool = screen.getByRole("region", { name: "Attribuer une récompense" });
    const inventoryLink = within(tool).getByRole("link", { name: /Voir mes récompenses disponibles/i });
    expect(inventoryLink).toHaveTextContent("Mes récompenses");
    expect(within(tool).getByRole("list", { name: "Étapes de la récompense" })).toHaveTextContent("Récompense");
    expect(within(tool).getByRole("button", { name: /Cadeau surprise/i })).toBeVisible();
  });

  it("uses the six cross-Room Profile rewards without exposing Wave Party", () => {
    render(<PlaceGiftTool senderGradeLevel={4} />);

    const tool = screen.getByRole("region", { name: "Envoyer un cadeau" });
    expect(ROOM_STANDARD_GIFT_CATALOG).toHaveLength(6);
    ROOM_STANDARD_GIFT_CATALOG.forEach((item) => {
      expect(within(tool).getByRole("button", { name: new RegExp(item.name, "i") })).toBeVisible();
      expect(tool).toHaveTextContent(item.rarity);
    });
    expect(tool).toHaveTextContent("RÉCOMPENSE ROOM");
    expect(tool).not.toHaveTextContent("3 restants");
    expect(within(tool).queryByRole("button", { name: /Wave Party/i })).not.toBeInTheDocument();
    expect(tool.querySelectorAll(".profile-gift-object")).toHaveLength(ROOM_STANDARD_GIFT_CATALOG.length);
    expect(tool).not.toHaveTextContent("€");

    const certif = within(tool).getByRole("button", { name: /La Certif/i });
    expect(certif).toHaveAttribute("data-gift-code", "la-certif");
    expect(certif).toHaveAttribute("aria-pressed", "false");
    expect(certif).toHaveAccessibleDescription(/pas une certification officielle Meewav/i);
    expect(tool).toHaveTextContent("Accessible uniquement aux membres ayant atteint le grade 4 étoiles");
    fireEvent.click(certif);
    expect(certif).toHaveAttribute("aria-pressed", "true");
  });

  it("groups structured recipients and deduplicates the same profile across sources", () => {
    render(<PlaceGiftTool
      recipientOptions={[
        ...RECIPIENTS,
        { profileId: "profile-lior", displayName: "Lior dupliqué", source: "messaging" },
      ]}
      messagingStatus="ready"
      messagingMode="local-demo"
    />);

    fireEvent.click(screen.getByRole("button", { name: /Distinction Live/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir le destinataire" }));

    expect(screen.getByRole("group", { name: "Sur scène" })).toHaveTextContent("Lior Benali");
    expect(screen.getByRole("group", { name: "Coulisses" })).toHaveTextContent("Louna Saphir");
    expect(screen.getByRole("group", { name: "File d’attente" })).toHaveTextContent("June Kairo");
    expect(screen.getByRole("group", { name: "Messagerie" })).toHaveTextContent("Echo Flow");
    expect(screen.getByRole("group", { name: "Messagerie" })).toHaveTextContent("Contacts locaux de démonstration");
    expect(screen.getAllByRole("button", { name: "Lior Benali" })).toHaveLength(1);
    expect(screen.queryByText("Lior dupliqué")).not.toBeInTheDocument();
    expect(screen.queryByText("Membres de ma wave")).not.toBeInTheDocument();
    expect(screen.queryByText("Ilyes")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "Rechercher un destinataire" }), { target: { value: "June" } });
    expect(screen.getByRole("button", { name: "June Kairo" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Lior Benali" })).not.toBeInTheDocument();
  });

  it("keeps the Profile immediate-send status with an account-linked recipient", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} messagingStatus="ready" onSubmit={onSubmit} onDone={onDone} />);

    chooseGiftAndRecipient("Supporter d’Or", "Lior Benali");
    fireEvent.click(screen.getByRole("button", { name: "Envoyer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({
      gift: "Supporter d’Or",
      recipient: "Lior Benali",
      recipientProfileId: "profile-lior",
      recipientSource: "stage",
      recipientAvatarUrl: null,
      action: "Envoyer maintenant",
      status: "Envoyé",
      delivery: "Aujourd’hui",
      date: "",
      time: "",
      round: "",
      idempotencyKey: expect.stringMatching(/^room-gift:/),
    });
    expect(onDone).toHaveBeenCalledWith("Cadeau envoyé");
    expect(screen.getByRole("status")).toHaveTextContent("Supporter d’Or");
    expect(screen.getByRole("status")).toHaveTextContent("Lior Benali · Aujourd’hui");
  });

  it("applies the same future-date validation and scheduled delivery format as Profile Studio", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} messagingStatus="ready" onSubmit={onSubmit} />);

    chooseGiftAndRecipient("Pass VIP", "Louna Saphir");
    const deliveryChoices = screen.getByRole("group", { name: "Moment d’envoi" });
    fireEvent.click(within(deliveryChoices).getByRole("button", { name: "Programmer" }));
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: profileGiftToday() } });
    fireEvent.change(screen.getByLabelText("Heure"), { target: { value: "00:00" } });
    fireEvent.click(within(document.querySelector(".place-gift-tool__footer")!).getByRole("button", { name: "Programmer" }));

    expect(screen.getByRole("status")).toHaveTextContent("La programmation doit être située dans le futur");
    expect(onSubmit).not.toHaveBeenCalled();

    const nextDate = profileGiftDateAfter(1);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: nextDate } });
    fireEvent.change(screen.getByLabelText("Heure"), { target: { value: "19:15" } });
    fireEvent.click(within(document.querySelector(".place-gift-tool__footer")!).getByRole("button", { name: "Programmer" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      recipientProfileId: "profile-louna",
      recipientSource: "backstage",
      action: "Programmer",
      status: "Programmé",
      date: nextDate,
      time: "19:15",
      delivery: profileGiftDeliveryForAction("Programmer", nextDate, "19:15", ""),
    }));
  });

  it("keeps one idempotency key while retrying the same round gift", async () => {
    const onSubmit = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} messagingStatus="ready" onSubmit={onSubmit} />);

    chooseGiftAndRecipient("Distinction Live", "June Kairo");
    const deliveryChoices = screen.getByRole("group", { name: "Moment d’envoi" });
    fireEvent.click(within(deliveryChoices).getByRole("button", { name: "Ajouter à une ronde" }));
    fireEvent.click(screen.getByRole("combobox", { name: "Ronde" }));
    fireEvent.click(screen.getByRole("option", { name: "Fans récents" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status")).toHaveTextContent("n’a pas pu être validé");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    const first = onSubmit.mock.calls[0][0];
    const retry = onSubmit.mock.calls[1][0];
    expect(first).toMatchObject({
      recipientProfileId: "profile-june",
      recipientSource: "queue",
      action: "Ajouter à une ronde",
      round: "Fans récents",
      idempotencyKey: expect.stringMatching(/^room-gift:/),
    });
    expect(first.idempotencyKey.length).toBeGreaterThanOrEqual(8);
    expect(first.idempotencyKey.length).toBeLessThanOrEqual(128);
    expect(retry.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("keeps every unique manual name through 5,000 and states that limit", async () => {
    const onCreateDraw = vi.fn().mockImplementation(async (input) => ({
      id: "draw-5000",
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      poolMode: input.poolMode,
      status: "ready" as const,
      eligibleCount: input.candidates?.length ?? 0,
      scheduledAt: null,
      startedAt: null,
      revealAt: null,
      revealedAt: null,
      winner: null,
      createdAt: new Date().toISOString(),
    }));
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} queueCount={1} roomCount={22} onCreateDraw={onCreateDraw} />);

    fireEvent.click(screen.getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir les participants" }));
    fireEvent.click(screen.getByRole("button", { name: /Noms saisis/i }));
    expect(screen.getByText(/maximum 5 000/i)).toBeVisible();
    const names = Array.from({ length: 5_001 }, (_, index) => `Participant ${index + 1}`);
    fireEvent.change(screen.getByRole("textbox", { name: "Noms du tirage" }), {
      target: { value: names.join("\n") },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Limite atteinte");
    fireEvent.click(screen.getByRole("button", { name: "Configurer la diffusion" }));
    fireEvent.click(screen.getByRole("button", { name: "Préparer le tirage" }));

    await waitFor(() => expect(onCreateDraw).toHaveBeenCalledOnce());
    const candidates = onCreateDraw.mock.calls[0][0].candidates;
    expect(candidates).toHaveLength(5_000);
    expect(candidates[2_000].displayName).toBe("Participant 2001");
    expect(candidates[4_999].displayName).toBe("Participant 5000");
    expect(candidates.some((candidate: { displayName: string }) => candidate.displayName === "Participant 5001")).toBe(false);
  });

  it("drops a previously selected profile if it remains only as a Messaging contact", async () => {
    const onCreateDraw = vi.fn().mockImplementation(async (input) => ({
      id: "draw-private-filter",
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      poolMode: input.poolMode,
      status: "ready" as const,
      eligibleCount: input.candidates?.length ?? 0,
      scheduledAt: null,
      startedAt: null,
      revealAt: null,
      revealedAt: null,
      winner: null,
      createdAt: new Date().toISOString(),
    }));
    const { rerender } = render(<PlaceGiftTool recipientOptions={RECIPIENTS} queueCount={1} roomCount={22} onCreateDraw={onCreateDraw} />);

    fireEvent.click(screen.getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    fireEvent.click(screen.getByRole("button", { name: /Distinction Live/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir les participants" }));
    fireEvent.click(screen.getByRole("button", { name: /Sélection personnalisée/i }));
    fireEvent.click(screen.getByRole("button", { name: "Lior Benali" }));
    fireEvent.click(screen.getByRole("button", { name: "Louna Saphir" }));
    fireEvent.click(screen.getByRole("button", { name: "June Kairo" }));
    fireEvent.click(screen.getByRole("button", { name: "Configurer la diffusion" }));

    rerender(<PlaceGiftTool
      recipientOptions={[
        { ...RECIPIENTS[0], source: "messaging" },
        RECIPIENTS[1],
        RECIPIENTS[2],
      ]}
      queueCount={1}
      roomCount={22}
      onCreateDraw={onCreateDraw}
    />);
    fireEvent.click(screen.getByRole("button", { name: "Préparer le tirage" }));

    await waitFor(() => expect(onCreateDraw).toHaveBeenCalledOnce());
    expect(onCreateDraw.mock.calls[0][0].candidates).toEqual([
      expect.objectContaining({ profileId: "profile-louna", source: "backstage" }),
      expect.objectContaining({ profileId: "profile-june", source: "queue" }),
    ]);
  });

  it("prepares a manual public draw with a stable idempotency key", async () => {
    const preparedDraw = {
      id: "draw-ready",
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      poolMode: "manual" as const,
      status: "ready" as const,
      eligibleCount: 3,
      scheduledAt: null,
      startedAt: null,
      revealAt: null,
      revealedAt: null,
      winner: null,
      createdAt: new Date().toISOString(),
    };
    const onCreateDraw = vi.fn().mockResolvedValue(preparedDraw);
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} queueCount={1} roomCount={22} onCreateDraw={onCreateDraw} />);

    fireEvent.click(screen.getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    expect(screen.getByText("Participants")).toBeVisible();
    expect(screen.getByText("Diffusion")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir les participants" }));
    fireEvent.click(screen.getByRole("button", { name: /Noms saisis/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Noms du tirage" }), { target: { value: "Aïcha Sol\nLior Benali\nAïcha Sol\nJune Kairo" } });
    fireEvent.click(screen.getByRole("button", { name: "Configurer la diffusion" }));
    fireEvent.click(screen.getByRole("button", { name: "Préparer le tirage" }));

    await waitFor(() => expect(onCreateDraw).toHaveBeenCalledOnce());
    expect(onCreateDraw).toHaveBeenCalledWith(expect.objectContaining({
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      poolMode: "manual",
      animationDurationSeconds: 7,
      idempotencyKey: expect.stringMatching(/^room-draw:/),
      candidates: expect.arrayContaining([
        expect.objectContaining({ displayName: "Aïcha Sol", profileId: null, source: "manual" }),
        expect.objectContaining({ displayName: "Lior Benali", profileId: null, source: "manual" }),
        expect.objectContaining({ displayName: "June Kairo", profileId: null, source: "manual" }),
      ]),
    }));
    expect(onCreateDraw.mock.calls[0][0].candidates).toHaveLength(3);
  });

  it("excludes Messaging contacts from a custom public draw and schedules it", async () => {
    const onScheduleDraw = vi.fn().mockImplementation(async (input) => ({
      id: "draw-scheduled",
      giftCode: input.giftCode,
      giftLabel: input.giftLabel,
      poolMode: input.poolMode,
      status: "scheduled" as const,
      eligibleCount: input.candidates?.length ?? 0,
      scheduledAt: input.scheduledAt,
      startedAt: null,
      revealAt: null,
      revealedAt: null,
      winner: null,
      createdAt: new Date().toISOString(),
    }));
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} queueCount={1} roomCount={22} onScheduleDraw={onScheduleDraw} />);

    fireEvent.click(screen.getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    fireEvent.click(screen.getByRole("button", { name: /Distinction Live/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir les participants" }));
    fireEvent.click(screen.getByRole("button", { name: /Sélection personnalisée/i }));
    expect(screen.queryByRole("group", { name: "Messagerie" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Echo Flow" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Lior Benali" }));
    fireEvent.click(screen.getByRole("button", { name: "Louna Saphir" }));
    fireEvent.click(screen.getByRole("button", { name: "Configurer la diffusion" }));
    fireEvent.click(screen.getByRole("button", { name: /Programmer.*Démarrage automatique/i }));
    const futureDate = profileGiftDateAfter(1);
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: futureDate } });
    fireEvent.change(screen.getByLabelText("Heure du tirage"), { target: { value: "19:15" } });
    fireEvent.click(screen.getByRole("button", { name: "Programmer le tirage" }));

    await waitFor(() => expect(onScheduleDraw).toHaveBeenCalledOnce());
    expect(onScheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      poolMode: "selected",
      scheduledAt: expect.any(String),
      candidates: [
        expect.objectContaining({ profileId: "profile-lior", source: "stage" }),
        expect.objectContaining({ profileId: "profile-louna", source: "backstage" }),
      ],
    }));
  });

  it("does not present an unconfirmed live audience metric as eligible", () => {
    render(<PlaceGiftTool recipientOptions={RECIPIENTS} queueCount={1} roomCount={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Tirage.*Pour toute la Room/i }));
    fireEvent.click(screen.getByRole("button", { name: /Pass VIP/i }));
    fireEvent.click(screen.getByRole("button", { name: "Choisir les participants" }));
    const wholeRoom = within(screen.getByRole("group", { name: "Source des participants" }))
      .getByRole("button", { name: /Toute la Room/i });
    expect(wholeRoom).toHaveTextContent("—");
    expect(wholeRoom).not.toHaveTextContent("1 842");

    fireEvent.click(wholeRoom);
    expect(screen.getByText("Le serveur confirmera les comptes actifs à la préparation.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Configurer la diffusion" }));
    expect(screen.getByText(/Éligibles confirmés par le serveur · animation 7 s/)).toBeVisible();
  });
});
