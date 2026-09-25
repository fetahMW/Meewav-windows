import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketSellerDraftCenter } from "./MarketSellerDraftCenter";
import type { MarketplaceOwnerDraft } from "./market.types";
import type { MarketplaceRepository } from "./market.service";
import type { MarketplaceDraftRepository } from "./useMarketplaceSellerDrafts";

const LISTING_ID = "10000000-0000-4000-8000-000000000001";
const MEDIA_ID = "10000000-0000-4000-8000-000000000002";
afterEach(cleanup);

function ownerDraft(): MarketplaceOwnerDraft {
  return {
    listingId: LISTING_ID,
    status: "draft",
    version: 2,
    input: {
      pillar: "used",
      categoryCode: "interfaces-audio",
      title: "Interface audio révisée",
      shortDescription: "Une interface compacte en parfait état.",
      description: "Description complète de cette interface audio révisée.",
      brand: "Meewav",
      model: "Studio Two",
      conditionCode: "excellent",
      currencyCode: "EUR",
      unitAmountMinor: 24_500,
      priceUnit: "item",
      city: "Paris",
      area: "11e",
      pickup: true,
      shipping: true,
      remote: false,
      shippingAmountMinor: 900,
      preparationDays: 2,
      mediaFileIds: [MEDIA_ID],
      purchaseYear: 2025,
      negotiable: true,
      conditionNotes: "Révisée et testée.",
    },
    media: [{
      mediaFileId: MEDIA_ID,
      role: "cover",
      position: 0,
      name: "interface.webp",
      mimeType: "image/webp",
      sizeBytes: 320_000,
      storageBucket: "profile-media",
      storagePath: `${MEDIA_ID}/market/interface.webp`,
      sourceUrl: "https://signed.example.test/interface.webp",
    }],
    createdAt: "2026-07-19T08:00:00.000Z",
    updatedAt: "2026-07-19T09:00:00.000Z",
  };
}

function repositoryWith(drafts: MarketplaceOwnerDraft[]): MarketplaceDraftRepository {
  return {
    listMyListingDrafts: vi.fn().mockResolvedValue(drafts),
    updateListingDraft: vi.fn(),
  };
}

function lifecycleRepositoryWith(overrides: Partial<Pick<MarketplaceRepository, "listMyListings" | "setListingStatus">> = {}) {
  return {
    listMyListings: vi.fn().mockResolvedValue([]),
    setListingStatus: vi.fn().mockResolvedValue({ listing_id: LISTING_ID, status: "published", version: 3 }),
    ...overrides,
  } as Pick<MarketplaceRepository, "listMyListings" | "setListingStatus">;
}

describe("MarketSellerDraftCenter", () => {
  it("affiche le brouillon privé et restitue toutes ses données à la reprise", async () => {
    const draft = ownerDraft();
    const onResume = vi.fn();
    render(
      <MarketSellerDraftCenter
        repository={repositoryWith([draft])}
        lifecycleRepository={lifecycleRepositoryWith()}
        onResume={onResume}
      />,
    );

    expect(await screen.findByText("Interface audio révisée")).toBeInTheDocument();
    expect(screen.getByText(/245,00/)).toBeInTheDocument();
    expect(document.querySelector(".market-seller-drafts__icon img")).toHaveAttribute(
      "src",
      "https://signed.example.test/interface.webp",
    );
    fireEvent.click(screen.getByRole("button", { name: /Reprendre le brouillon/ }));
    expect(onResume).toHaveBeenCalledWith(draft);
  });

  it("présente un état vide honnête sans simuler une publication", async () => {
    render(
      <MarketSellerDraftCenter
        repository={repositoryWith([])}
        lifecycleRepository={lifecycleRepositoryWith()}
        onResume={vi.fn()}
      />,
    );
    expect(await screen.findByText("Aucun brouillon en attente")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publier" })).not.toBeInTheDocument();
  });

  it("permet de relancer un chargement échoué", async () => {
    const listMyListingDrafts = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([ownerDraft()]);
    const repository: MarketplaceDraftRepository = {
      listMyListingDrafts,
      updateListingDraft: vi.fn(),
    };
    render(
      <MarketSellerDraftCenter repository={repository} lifecycleRepository={lifecycleRepositoryWith()} onResume={vi.fn()} />,
    );
    expect(await screen.findByText(/Impossible de charger/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByText("Interface audio révisée")).toBeInTheDocument());
    expect(listMyListingDrafts).toHaveBeenCalledTimes(2);
  });

  it("publie un brouillon par le contrat propriétaire et recharge le catalogue", async () => {
    const draft = ownerDraft();
    const lifecycleRepository = lifecycleRepositoryWith();
    const onCatalogChanged = vi.fn();
    render(<MarketSellerDraftCenter repository={repositoryWith([draft])}
      lifecycleRepository={lifecycleRepository} onResume={vi.fn()} onCatalogChanged={onCatalogChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Publier" }));
    await waitFor(() => expect(lifecycleRepository.setListingStatus).toHaveBeenCalledWith(expect.objectContaining({
      listingId: LISTING_ID, expectedVersion: 2, status: "published", idempotencyKey: expect.any(String),
    })));
    await waitFor(() => expect(onCatalogChanged).toHaveBeenCalledTimes(1));
  });
});
