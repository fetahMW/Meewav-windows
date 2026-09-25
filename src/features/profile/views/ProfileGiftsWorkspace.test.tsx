import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listRoomAwardsMine = vi.hoisted(() => vi.fn());
const listGiftInventoryMine = vi.hoisted(() => vi.fn());

vi.mock("../gifts/profileRoomGiftAwards.service", () => ({
  profileRoomGiftAwardsRepository: { listMine: listRoomAwardsMine },
}));
vi.mock("../gifts/profileGiftInventory.service", () => ({
  PROFILE_GIFT_INVENTORY_CODES: [
    "force-card",
    "vip-pass",
    "private-access",
    "golden-like",
    "supporter-bonus",
    "la-certif",
  ],
  profileGiftInventoryRepository: { listMine: listGiftInventoryMine },
}));
vi.mock("../gifts/ProfileCertifEndorsementsPanel", () => ({
  default: () => null,
}));

import ProfileGiftsWorkspace from "./ProfileGiftsWorkspace";

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const emptyInventory = [
  "force-card",
  "vip-pass",
  "private-access",
  "golden-like",
  "supporter-bonus",
  "la-certif",
].map((giftCode) => ({
  giftCode,
  availableQuantity: 0,
  reservedQuantity: 0,
  totalQuantity: 0,
  updatedAt: null,
  enforcementActive: true,
}));

beforeEach(() => {
  window.localStorage.clear();
  listRoomAwardsMine.mockReset();
  listRoomAwardsMine.mockResolvedValue([]);
  listGiftInventoryMine.mockReset();
  listGiftInventoryMine.mockResolvedValue(emptyInventory);
});

afterEach(cleanup);

describe("ProfileGiftsWorkspace Room awards", () => {
  it("shows authenticated server awards with immutable Room provenance beside local entries", async () => {
    listRoomAwardsMine.mockResolvedValue([
      {
        id: "delivery-1",
        kind: "direct",
        drawIdSnapshot: null,
        roomIdSnapshot: "a3000000-0000-4000-8000-000000000301",
        roomTitleSnapshot: "La Place",
        giftCode: "force-card",
        giftLabel: "Carte de Force",
        recipientDisplayNameSnapshot: "Aïcha Sol",
        recipientAvatarUrlSnapshot: null,
        awardedBySnapshot: "00000000-0000-4000-8000-000000000002",
        senderDisplayNameSnapshot: "Naya Oris",
        senderAvatarUrlSnapshot: null,
        awardedAt: "2026-08-14T11:00:00.000Z",
      },
      {
        id: "award-1",
        kind: "draw",
        drawIdSnapshot: "d2000000-0000-4000-8000-000000000201",
        roomIdSnapshot: "a3000000-0000-4000-8000-000000000301",
        roomTitleSnapshot: null,
        giftCode: "vip-pass",
        giftLabel: "Pass VIP",
        recipientDisplayNameSnapshot: "Aïcha Sol",
        recipientAvatarUrlSnapshot: null,
        awardedBySnapshot: "00000000-0000-4000-8000-000000000002",
        senderDisplayNameSnapshot: null,
        senderAvatarUrlSnapshot: null,
        awardedAt: "2026-08-14T10:00:00.000Z",
      },
    ]);

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Cadeaux reçus en Room" });
    expect(within(panel).getByText("Pass VIP")).toBeVisible();
    expect(within(panel).getByText("Gagné lors d’un tirage public")).toBeVisible();
    expect(within(panel).getByText("Carte de Force")).toBeVisible();
    expect(within(panel).getByText("Envoyé par Naya Oris · La Place")).toBeVisible();
    expect(within(panel).getAllByText(/Cadeau Room vérifié le/)).toHaveLength(2);
    expect(within(panel).getAllByText("Registre serveur · récompense non modifiable")).toHaveLength(2);
    expect(panel.querySelector("[title]")).toBeNull();
    expect(screen.getAllByText("Golden Like").length).toBeGreaterThan(0);
    expect(screen.getAllByText("La Certif").length).toBeGreaterThan(0);
    expect(listRoomAwardsMine).toHaveBeenCalledWith(OWNER_ID);
  });

  it("keeps local gift tracking usable when server awards cannot load", async () => {
    listRoomAwardsMine.mockRejectedValue(new Error("offline"));

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Tes suivis locaux restent accessibles");
    expect(screen.getAllByText("Golden Like").length).toBeGreaterThan(0);
  });

  it("does not query private awards without an authenticated profile scope", () => {
    render(<ProfileGiftsWorkspace storageScope={null} onBack={vi.fn()} onDone={vi.fn()} />);

    expect(listRoomAwardsMine).not.toHaveBeenCalled();
    expect(listGiftInventoryMine).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Cadeaux reçus en Room" })).not.toBeInTheDocument();
  });
});

describe("ProfileGiftsWorkspace gift inventory", () => {
  it("shows the six canonical gifts with real available and reserved quantities", async () => {
    listGiftInventoryMine.mockResolvedValue([
      { giftCode: "force-card", availableQuantity: 4, reservedQuantity: 1, totalQuantity: 5, updatedAt: "2026-08-15T10:00:00.000Z", enforcementActive: true },
      { giftCode: "vip-pass", availableQuantity: 2, reservedQuantity: 0, totalQuantity: 2, updatedAt: "2026-08-15T10:00:00.000Z", enforcementActive: true },
      { giftCode: "private-access", availableQuantity: 1, reservedQuantity: 2, totalQuantity: 3, updatedAt: "2026-08-15T10:00:00.000Z", enforcementActive: true },
      { giftCode: "golden-like", availableQuantity: 1, reservedQuantity: 0, totalQuantity: 1, updatedAt: "2026-08-15T10:00:00.000Z", enforcementActive: true },
      { giftCode: "supporter-bonus", availableQuantity: 0, reservedQuantity: 0, totalQuantity: 0, updatedAt: null, enforcementActive: true },
      { giftCode: "la-certif", availableQuantity: 3, reservedQuantity: 0, totalQuantity: 3, updatedAt: "2026-08-15T10:00:00.000Z", enforcementActive: true },
    ]);

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Mes cadeaux disponibles" });
    expect(within(panel).getAllByRole("article")).toHaveLength(6);
    for (const label of ["Carte de Force", "Pass VIP", "Accès privé", "Golden Like", "Bonus supporter", "La Certif"]) {
      expect(within(panel).getByText(label)).toBeVisible();
    }
    const forceCard = within(panel).getByText("Carte de Force").closest("article");
    expect(forceCard).not.toBeNull();
    expect(within(forceCard as HTMLElement).getByText("4")).toBeVisible();
    expect(within(forceCard as HTMLElement).getByText("1")).toBeVisible();
    expect(within(panel).getByRole("link", { name: /Ouvrir les Rooms/i })).toHaveAttribute("href", "/rooms");
    expect(listGiftInventoryMine).toHaveBeenCalledWith(OWNER_ID);
  });

  it("shows an explicit empty state without inventing stock", async () => {
    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Mes cadeaux disponibles" });
    expect(await within(panel).findByText("Ton inventaire est vide pour le moment.")).toBeVisible();
    expect(within(panel).getAllByRole("article")).toHaveLength(6);
  });

  it("shows a loading state without placeholder quantities", () => {
    listGiftInventoryMine.mockReturnValue(new Promise(() => undefined));

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = screen.getByRole("region", { name: "Mes cadeaux disponibles" });
    expect(within(panel).getByText("Synchronisation de ton inventaire…")).toBeVisible();
    expect(within(panel).queryAllByRole("article")).toHaveLength(0);
  });

  it("keeps the error state honest", async () => {
    listGiftInventoryMine.mockRejectedValue(new Error("offline"));

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Mes cadeaux disponibles" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Aucune quantité approximative n’est affichée");
    expect(within(panel).getByRole("button", { name: /Réessayer/i })).toBeVisible();
    expect(within(panel).queryAllByRole("article")).toHaveLength(0);
  });

  it("uses live inventory quantities in the preparation catalogue", async () => {
    listGiftInventoryMine.mockResolvedValue([
      { giftCode: "force-card", availableQuantity: 4, reservedQuantity: 0, totalQuantity: 4, updatedAt: null, enforcementActive: true },
      { giftCode: "vip-pass", availableQuantity: 7, reservedQuantity: 0, totalQuantity: 7, updatedAt: null, enforcementActive: true },
      { giftCode: "private-access", availableQuantity: 1, reservedQuantity: 0, totalQuantity: 1, updatedAt: null, enforcementActive: true },
      { giftCode: "golden-like", availableQuantity: 0, reservedQuantity: 0, totalQuantity: 0, updatedAt: null, enforcementActive: true },
      { giftCode: "supporter-bonus", availableQuantity: 2, reservedQuantity: 0, totalQuantity: 2, updatedAt: null, enforcementActive: true },
      { giftCode: "la-certif", availableQuantity: 3, reservedQuantity: 0, totalQuantity: 3, updatedAt: null, enforcementActive: true },
    ]);

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const catalog = await screen.findByRole("region", { name: "Catalogue de cadeaux à préparer" });
    expect(await within(catalog).findByText("7 disponibles")).toBeVisible();
    expect(within(catalog).getByText("1 disponible")).toBeVisible();
    expect(within(catalog).getByText("0 disponible")).toBeVisible();
    expect(within(catalog).queryByText("3 restants")).not.toBeInTheDocument();
    expect(within(catalog).queryByText("2 restants")).not.toBeInTheDocument();
    expect(within(catalog).getByRole("button", { name: /Golden Like/i })).toBeDisabled();
  });

  it("does not present observe-mode balances as spendable inventory", async () => {
    listGiftInventoryMine.mockResolvedValue(emptyInventory.map((item) => ({
      ...item,
      availableQuantity: item.giftCode === "golden-like" ? 12 : 0,
      totalQuantity: item.giftCode === "golden-like" ? 12 : 0,
      enforcementActive: false,
    })));

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const panel = await screen.findByRole("region", { name: "Mes cadeaux disponibles" });
    expect(await within(panel).findByText("Activation de l’inventaire en préparation")).toBeVisible();
    expect(within(panel).queryByText("12")).not.toBeInTheDocument();
    const catalog = screen.getByRole("region", { name: "Catalogue de cadeaux à préparer" });
    expect(within(catalog).getByRole("button", { name: /Golden Like/i })).toBeDisabled();
    expect(within(catalog).getAllByText("Activation en préparation")).toHaveLength(6);
  });

  it("migrates legacy local sent entries to honest drafts and routes distribution to a Room", async () => {
    const storageKey = `meewav-profile-gifts-v3:${OWNER_ID}`;
    window.localStorage.setItem(storageKey, JSON.stringify([{
      id: "legacy-sent",
      gift: "Golden Like",
      recipient: "Maya",
      recipientSource: "Raccourci",
      action: "Envoyer maintenant",
      status: "Envoyé",
      delivery: "Aujourd’hui",
      date: "",
      time: "",
      round: "",
    }]));

    render(<ProfileGiftsWorkspace storageScope={OWNER_ID} onBack={vi.fn()} onDone={vi.fn()} />);

    const drafts = screen.getByRole("region", { name: "Brouillons cadeaux locaux" });
    expect(within(drafts).getByText("Brouillon")).toBeVisible();
    expect(within(drafts).queryByText("Envoyé")).not.toBeInTheDocument();
    expect(within(drafts).queryByText("Programmé")).not.toBeInTheDocument();
    expect(within(drafts).getByRole("link", { name: /Distribuer en Room/i })).toHaveAttribute("href", "/rooms");
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]") as Array<{ status?: string; action?: string }>;
      expect(stored[0]).toMatchObject({ status: "Prêt", action: "Ajouter à une ronde" });
    });
  });
});
