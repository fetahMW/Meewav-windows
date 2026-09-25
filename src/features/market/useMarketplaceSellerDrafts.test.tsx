import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceOwnerDraft } from "./market.types";
import {
  useMarketplaceSellerDrafts,
  type MarketplaceDraftRepository,
} from "./useMarketplaceSellerDrafts";

const LISTING_ID = "10000000-0000-4000-8000-000000000001";
const MEDIA_ID = "10000000-0000-4000-8000-000000000002";

function draft(version: number, title: string): MarketplaceOwnerDraft {
  return {
    listingId: LISTING_ID,
    status: "draft",
    version,
    input: {
      pillar: "used",
      categoryCode: "interfaces-audio",
      title,
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
      shipping: false,
      remote: false,
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
    updatedAt: `2026-07-19T0${version}:00:00.000Z`,
  };
}

describe("useMarketplaceSellerDrafts", () => {
  it("sauvegarde avec la version attendue puis recharge le payload serveur complet", async () => {
    const first = draft(1, "Interface audio révisée");
    const updated = draft(2, "Interface audio reprise");
    const listMyListingDrafts = vi.fn()
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([updated]);
    const updateListingDraft = vi.fn().mockResolvedValue({
      listing_id: LISTING_ID,
      status: "draft",
      version: 2,
    });
    const repository: MarketplaceDraftRepository = {
      listMyListingDrafts,
      updateListingDraft,
    };
    const { result } = renderHook(() => useMarketplaceSellerDrafts({ repository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let saved = false;
    await act(async () => {
      saved = await result.current.updateDraft(first, updated.input);
    });

    expect(saved).toBe(true);
    expect(updateListingDraft).toHaveBeenCalledWith(expect.objectContaining({
      listingId: LISTING_ID,
      expectedVersion: 1,
      input: updated.input,
      idempotencyKey: expect.stringMatching(/^draft-update:/),
    }));
    expect(listMyListingDrafts).toHaveBeenCalledTimes(2);
    expect(result.current.drafts[0]).toEqual(updated);
  });
});
