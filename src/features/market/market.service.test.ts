import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MarketplaceServiceError } from "./market.errors";
import {
  createMarketplaceRepository,
  resolveMarketplaceCatalogFilters,
  toMarketplaceRpcTimestamp,
} from "./market.service";
import type { MarketplaceListingDraftInput } from "./market.types";

const LISTING_ID = "10000000-0000-4000-8000-000000000001";
const SECOND_LISTING_ID = "10000000-0000-4000-8000-000000000002";

function usedDraft(): MarketplaceListingDraftInput {
  return {
    pillar: "used",
    categoryCode: "synthesizers",
    title: "Korg Minilogue XD",
    shortDescription: "Très bon état",
    description: "Testé en studio, alimentation et housse incluses.",
    conditionCode: "very_good",
    currencyCode: "EUR",
    unitAmountMinor: 54_900,
    priceUnit: "item",
    purchaseYear: 2024,
    negotiable: true,
    conditionNotes: "Une rayure légère sur le côté droit.",
    pickup: true,
    shipping: false,
    remote: false,
    mediaFileIds: [SECOND_LISTING_ID],
  };
}

describe("marketplace repository", () => {
  const rpc = vi.fn();
  const repository = createMarketplaceRepository({ rpc } as unknown as SupabaseClient);

  beforeEach(() => rpc.mockReset());

  it("charge un catalogue public paginé sans select libre", async () => {
    rpc.mockResolvedValue({ data: [{ listing_id: "10000000-0000-4000-8000-000000000001" }], error: null });
    await repository.listCatalog({ pillar: "used", search: "synthé", limit: 24 });
    expect(rpc).toHaveBeenCalledWith("list_marketplace_catalog_v2", expect.objectContaining({
      p_limit: 24,
      p_cursor: null,
      p_filters: expect.objectContaining({
        pillar: "used",
        search: "synthé",
        sort: "recommended",
      }),
    }));
  });

  it("transmet tous les filtres canoniques au RPC v2", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await repository.listCatalog({
      limit: 30,
      filters: {
        pillar: "used",
        categoryCodes: ["synthesizers", "microphones", "synthesizers"],
        minimumPriceMinor: 5_000,
        maximumPriceMinor: 250_000,
        conditionCodes: ["very_good", "excellent"],
        fulfillment: ["pickup", "shipping"],
        availability: "7-days",
        sellerKinds: ["studio", "artist"],
        verifiedOnly: true,
        minimumGrade: 4,
        sort: "rating",
        favoritesOnly: true,
        search: "analogique",
      },
    });

    expect(rpc).toHaveBeenCalledWith("list_marketplace_catalog_v2", {
      p_cursor: null,
      p_limit: 30,
      p_filters: {
        pillar: "used",
        categories: ["microphones", "synthesizers"],
        priceMinMinor: 5_000,
        priceMaxMinor: 250_000,
        conditions: ["excellent", "very_good"],
        fulfillment: ["pickup", "shipping"],
        availability: "7-days",
        sellerKinds: ["artist", "studio"],
        verifiedOnly: true,
        minimumGrade: 4,
        sort: "rating",
        favoritesOnly: true,
        search: "analogique",
      },
      p_listing_ids: null,
    });
  });

  it("remplace explicitement le tri distance indisponible sans requête en échec", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const resolution = resolveMarketplaceCatalogFilters({ filters: { sort: "distance" } });

    expect(resolution.sortFallback).toEqual({
      requested: "distance",
      applied: "recommended",
      reason: "distance_unavailable",
    });
    await repository.listCatalog({ filters: { sort: "distance" } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("list_marketplace_catalog_v2", expect.objectContaining({
      p_filters: expect.objectContaining({ sort: "recommended" }),
    }));
  });

  it("transmet le curseur opaque lié au tri", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const cursor = {
      version: 1 as const,
      sort: "price-asc" as const,
      sortValue: 12_500,
      publishedAt: "2026-07-19T10:00:00Z",
      listingId: LISTING_ID,
    };
    await repository.listCatalog({ cursor, filters: { sort: "price-asc" } });
    expect(rpc).toHaveBeenCalledWith("list_marketplace_catalog_v2", expect.objectContaining({
      p_cursor: cursor,
      p_filters: expect.objectContaining({ sort: "price-asc" }),
    }));
  });

  it("hydrate exactement les annonces privées du panier par IDs dédupliqués", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await repository.listCatalog({
      listingIds: [LISTING_ID, LISTING_ID, SECOND_LISTING_ID],
      limit: 3,
    });
    expect(rpc).toHaveBeenCalledWith("list_marketplace_catalog_v2", expect.objectContaining({
      p_listing_ids: [LISTING_ID, SECOND_LISTING_ID],
      p_limit: 2,
      p_cursor: null,
      p_filters: {},
    }));
  });

  it("interdit de combiner l’hydratation exacte avec les filtres de découverte", async () => {
    await expect(repository.listCatalog({ listingIds: [LISTING_ID], pillar: "new" }))
      .rejects.toBeInstanceOf(MarketplaceServiceError);
    await expect(repository.listCatalog({ listingIds: [LISTING_ID], filters: {} }))
      .rejects.toBeInstanceOf(MarketplaceServiceError);
    await expect(repository.listCatalog({ listingIds: Array.from({ length: 101 }, () => LISTING_ID) }))
      .rejects.toBeInstanceOf(MarketplaceServiceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("signe temporairement une cover publiée stockée dans le bucket privé", async () => {
    const signedRpc = vi.fn().mockResolvedValue({
      data: [{
        listing_id: LISTING_ID,
        seller_profile_id: SECOND_LISTING_ID,
        cover_url: null,
        cover_storage_bucket: "profile-media",
        cover_storage_path: `${SECOND_LISTING_ID}/market/cover.webp`,
      }],
      error: null,
    });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{
        path: `${SECOND_LISTING_ID}/market/cover.webp`,
        signedUrl: "https://signed.example.test/cover.webp",
      }],
      error: null,
    });
    const signedRepository = createMarketplaceRepository({
      rpc: signedRpc,
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    } as unknown as SupabaseClient);
    const result = await signedRepository.listCatalog();
    const cachedResult = await signedRepository.listCatalog();
    expect(createSignedUrls).toHaveBeenCalledWith(
      [`${SECOND_LISTING_ID}/market/cover.webp`],
      6 * 60 * 60,
    );
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(result[0].cover_url).toBe("https://signed.example.test/cover.webp");
    expect(cachedResult[0].cover_url).toBe("https://signed.example.test/cover.webp");
  });

  it("charge et met en cache les capacités publiques du catalogue", async () => {
    const capabilityRpc = vi.fn().mockResolvedValue({
      data: {
        catalog_version: 2,
        cursor_version: 1,
        maximum_page_size: 100,
        filters: {
          multiple_categories: true,
          multiple_conditions: true,
          fulfillment_any_match: true,
          favorites_requires_authentication: true,
          availability: {
            source: "rental_terms.available_from | service_terms.event_date | marketplace_listings.preparation_days",
            contract: "canonical availability date, falling back to preparation lead time",
            values: ["any", "now", "7-days", "30-days"],
          },
        },
        sorts: {
          recommended: { supported: true, source: "published_at" },
          "price-asc": { supported: true, source: "primary.amount_minor" },
          "price-desc": { supported: true, source: "primary.amount_minor" },
          rating: { supported: true, source: "rating_basis_points" },
          popular: { supported: true, source: "completed_orders_count" },
          distance: { supported: false, reason: "coordinates unavailable" },
        },
      },
      error: null,
    });
    const capabilityRepository = createMarketplaceRepository({ rpc: capabilityRpc } as unknown as SupabaseClient);

    const first = await capabilityRepository.getCatalogCapabilities();
    const second = await capabilityRepository.getCatalogCapabilities();

    expect(first).toBe(second);
    expect(first.sorts.distance).toEqual({
      supported: false,
      source: undefined,
      reason: "coordinates unavailable",
    });
    expect(capabilityRpc).toHaveBeenCalledTimes(1);
    expect(capabilityRpc).toHaveBeenCalledWith("get_marketplace_catalog_capabilities_v1");
  });

  it("persiste un favori par RPC idempotente", async () => {
    rpc.mockResolvedValue({ data: { listing_id: "10000000-0000-4000-8000-000000000001", favorite: true }, error: null });
    await repository.setFavorite(
      "10000000-0000-4000-8000-000000000001",
      true,
      "favorite:10000000-0000-4000-8000-000000000099",
    );
    expect(rpc).toHaveBeenCalledWith("set_marketplace_favorite_v1", expect.objectContaining({ p_favorite: true }));
  });

  it("n'accepte jamais une quantité de panier forgée", async () => {
    await expect(repository.setCartQuantity(
      "10000000-0000-4000-8000-000000000001",
      100,
      "cart:10000000-0000-4000-8000-000000000099",
    )).rejects.toBeInstanceOf(MarketplaceServiceError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("crée un brouillon sans permettre au client de le publier", async () => {
    rpc.mockResolvedValue({ data: { listing_id: "10000000-0000-4000-8000-000000000001", status: "draft", version: 1 }, error: null });
    await repository.createListingDraft(usedDraft(), "listing:10000000-0000-4000-8000-000000000099");
    const payload = rpc.mock.calls[0]?.[1]?.p_payload;
    expect(rpc).toHaveBeenCalledWith("create_marketplace_listing_draft_v1", expect.any(Object));
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("seller_profile_id");
  });

  it("relit et persiste le type vendeur avant le brouillon", async () => {
    rpc.mockResolvedValueOnce({ data: "studio", error: null });
    expect(await repository.getSellerKind()).toBe("studio");

    rpc.mockResolvedValueOnce({
      data: { listing_id: LISTING_ID, status: "draft", version: 1 },
      error: null,
    });
    await repository.createListingDraft(
      { ...usedDraft(), sellerKind: "store" },
      "listing:10000000-0000-4000-8000-000000000099",
    );

    expect(rpc.mock.calls[rpc.mock.calls.length - 1]).toEqual([
      "create_marketplace_listing_draft_v2",
      expect.objectContaining({ p_seller_kind: "store" }),
    ]);
  });

  it("relit les brouillons du propriétaire avec leur payload normalisé", async () => {
    rpc.mockResolvedValue({
      data: [{
        listing_id: LISTING_ID,
        status: "draft",
        version: 3,
        payload: {
          pillar: "used",
          category_code: "synthesizers",
          title: "Korg Minilogue XD",
          short_description: "Très bon état",
          description: "Testé en studio, alimentation et housse incluses.",
          brand: "Korg",
          model: "Minilogue XD",
          condition_code: "very_good",
          currency_code: "EUR",
          unit_amount_minor: 54_900,
          price_unit: "item",
          city: "Paris",
          area: "11e",
          pickup: true,
          shipping: false,
          remote: false,
          shipping_amount_minor: 0,
          preparation_days: 0,
          media_file_ids: [SECOND_LISTING_ID],
          terms: {
            purchase_year: 2024,
            negotiable: true,
            condition_notes: "Une rayure légère sur le côté droit.",
          },
        },
        media: [{
          media_file_id: SECOND_LISTING_ID,
          role: "cover",
          position: 0,
          name: "minilogue.webp",
          mime_type: "image/webp",
          size_bytes: 240_000,
          storage_bucket: null,
          storage_path: null,
          file_url: "https://cdn.example.test/minilogue.webp",
        }],
        created_at: "2026-07-19T08:00:00+00:00",
        updated_at: "2026-07-19T09:00:00+00:00",
      }],
      error: null,
    });

    const drafts = await repository.listMyListingDrafts(25);
    expect(rpc).toHaveBeenCalledWith("list_my_marketplace_listing_drafts_v1", { p_limit: 25 });
    expect(drafts).toEqual([expect.objectContaining({
      listingId: LISTING_ID,
      version: 3,
      input: expect.objectContaining({
        pillar: "used",
        title: "Korg Minilogue XD",
        mediaFileIds: [SECOND_LISTING_ID],
      }),
      media: [expect.objectContaining({
        mediaFileId: SECOND_LISTING_ID,
        role: "cover",
        sourceUrl: "https://cdn.example.test/minilogue.webp",
      })],
    })]);
  });

  it("signe les médias privés d'un brouillon pour les reprendre sans re-upload", async () => {
    const draftRpc = vi.fn().mockResolvedValue({
      data: [{
        listing_id: LISTING_ID,
        status: "draft",
        version: 1,
        payload: {
          pillar: "used",
          category_code: "synthesizers",
          title: "Korg Minilogue XD",
          short_description: "Très bon état",
          description: "Testé en studio, alimentation et housse incluses.",
          brand: "Korg",
          model: "Minilogue XD",
          condition_code: "very_good",
          currency_code: "EUR",
          unit_amount_minor: 54_900,
          price_unit: "item",
          city: "Paris",
          area: "11e",
          pickup: true,
          shipping: false,
          remote: false,
          shipping_amount_minor: 0,
          preparation_days: 0,
          media_file_ids: [SECOND_LISTING_ID],
          terms: { purchase_year: 2024, negotiable: true, condition_notes: null },
        },
        media: [{
          media_file_id: SECOND_LISTING_ID,
          role: "cover",
          position: 0,
          name: "minilogue.webp",
          mime_type: "image/webp",
          size_bytes: 240_000,
          storage_bucket: "profile-media",
          storage_path: `${SECOND_LISTING_ID}/market/minilogue.webp`,
          file_url: null,
        }],
        created_at: "2026-07-19T08:00:00+00:00",
        updated_at: "2026-07-19T09:00:00+00:00",
      }],
      error: null,
    });
    const createSignedUrls = vi.fn().mockResolvedValue({
      data: [{
        path: `${SECOND_LISTING_ID}/market/minilogue.webp`,
        signedUrl: "https://signed.example.test/minilogue.webp",
      }],
      error: null,
    });
    const draftRepository = createMarketplaceRepository({
      rpc: draftRpc,
      storage: { from: vi.fn(() => ({ createSignedUrls })) },
    } as unknown as SupabaseClient);

    const [draft] = await draftRepository.listMyListingDrafts();
    expect(createSignedUrls).toHaveBeenCalledWith(
      [`${SECOND_LISTING_ID}/market/minilogue.webp`],
      6 * 60 * 60,
    );
    expect(draft.media[0].sourceUrl).toBe("https://signed.example.test/minilogue.webp");

    const unavailableRepository = createMarketplaceRepository({
      rpc: draftRpc,
      storage: {
        from: vi.fn(() => ({
          createSignedUrls: vi.fn().mockResolvedValue({ data: [], error: null }),
        })),
      },
    } as unknown as SupabaseClient);
    const [draftWithoutPreview] = await unavailableRepository.listMyListingDrafts();
    expect(draftWithoutPreview).toMatchObject({ listingId: LISTING_ID });
    expect(draftWithoutPreview.media[0].sourceUrl).toBeNull();
  });

  it("met à jour le même brouillon avec une version optimiste et une clé idempotente", async () => {
    rpc.mockResolvedValue({
      data: { listing_id: LISTING_ID, status: "draft", version: 4 },
      error: null,
    });
    const result = await repository.updateListingDraft({
      listingId: LISTING_ID,
      expectedVersion: 3,
      input: usedDraft(),
      idempotencyKey: "draft-update:10000000-0000-4000-8000-000000000099",
    });
    expect(result).toEqual({ listing_id: LISTING_ID, status: "draft", version: 4 });
    expect(rpc).toHaveBeenCalledWith("update_marketplace_listing_draft_v1", expect.objectContaining({
      p_listing_id: LISTING_ID,
      p_expected_version: 3,
      p_payload: expect.objectContaining({
        title: "Korg Minilogue XD",
        media_file_ids: [SECOND_LISTING_ID],
      }),
    }));
  });

  it("refuse une fausse confirmation serveur lors de la mise à jour d'un brouillon", async () => {
    rpc.mockResolvedValue({
      data: { listing_id: SECOND_LISTING_ID, status: "draft", version: 4 },
      error: null,
    });
    await expect(repository.updateListingDraft({
      listingId: LISTING_ID,
      expectedVersion: 3,
      input: usedDraft(),
      idempotencyKey: "draft-update:10000000-0000-4000-8000-000000000099",
    })).rejects.toMatchObject({ code: "mutation_failed" });
  });

  it("publie uniquement la version propriétaire attendue avec une clé idempotente", async () => {
    rpc.mockResolvedValue({ data: { listing_id: LISTING_ID, status: "published", version: 4 }, error: null });
    const result = await repository.setListingStatus({
      listingId: LISTING_ID, expectedVersion: 3, status: "published",
      idempotencyKey: "listing-published:10000000-0000-4000-8000-000000000099",
    });
    expect(result).toEqual({ listing_id: LISTING_ID, status: "published", version: 4 });
    expect(rpc).toHaveBeenCalledWith("marketplace_set_listing_status_v1", {
      p_listing_id: LISTING_ID, p_expected_version: 3, p_status: "published",
      p_idempotency_key: "listing-published:10000000-0000-4000-8000-000000000099",
    });
  });

  it("refuse une réponse de publication portant sur une autre annonce", async () => {
    rpc.mockResolvedValue({ data: { listing_id: SECOND_LISTING_ID, status: "published", version: 4 }, error: null });
    await expect(repository.setListingStatus({
      listingId: LISTING_ID, expectedVersion: 3, status: "published",
      idempotencyKey: "listing-published:10000000-0000-4000-8000-000000000099",
    })).rejects.toMatchObject({ code: "mutation_failed" });
  });

  it("lit uniquement les annonces du propriétaire avec leur statut et leur version", async () => {
    rpc.mockResolvedValue({ data: [{
      id: LISTING_ID, title: "Interface audio révisée", pillar: "used", status: "paused", version: 4,
      updated_at: "2026-09-23T10:00:00Z", published_at: "2026-09-22T10:00:00Z",
    }], error: null });
    expect(await repository.listMyListings(25)).toEqual([expect.objectContaining({
      id: LISTING_ID, status: "paused", version: 4,
    })]);
    expect(rpc).toHaveBeenCalledWith("list_my_marketplace_listings_v1", { p_limit: 25 });
  });

  it("convertit explicitement les datetime-local en UTC avant les RPC", async () => {
    const localEvent = "2026-08-01T20:30";
    const expectedEvent = new Date(2026, 7, 1, 20, 30, 0, 0).toISOString();
    expect(toMarketplaceRpcTimestamp(localEvent)).toBe(expectedEvent);

    rpc.mockResolvedValueOnce({
      data: { listing_id: LISTING_ID, status: "draft", version: 1 },
      error: null,
    });
    await repository.createListingDraft({
      pillar: "services",
      categoryCode: "billetterie",
      title: "Live Meewav Paris",
      shortDescription: "Une soirée live documentée.",
      description: "Une soirée live complète avec une programmation ouverte à la communauté.",
      currencyCode: "EUR",
      unitAmountMinor: 2_500,
      priceUnit: "ticket",
      pickup: false,
      shipping: false,
      remote: true,
      mediaFileIds: [SECOND_LISTING_ID],
      serviceKind: "ticket",
      serviceFormat: "Sur place",
      durationLabel: "3 heures",
      nextAvailability: "1 août",
      eventDate: localEvent,
      capacity: 40,
      venueName: "Room Meewav",
      includedEquipment: "Scène, console et retours",
    }, "listing:10000000-0000-4000-8000-000000000099");
    expect(rpc.mock.calls[0]?.[1]?.p_payload?.terms?.event_date).toBe(expectedEvent);

    rpc.mockResolvedValueOnce({
      data: {
        intent_id: SECOND_LISTING_ID,
        listing_id: LISTING_ID,
        kind: "service_booking",
        status: "pending",
      },
      error: null,
    });
    await repository.createServiceBooking({
      listingId: LISTING_ID,
      requestedFor: localEvent,
      idempotencyKey: "service:10000000-0000-4000-8000-000000000099",
    });
    expect(rpc.mock.calls[1]?.[1]?.p_requested_for).toBe(expectedEvent);
  });

  it("sépare les trois intentions métier au lieu d'accepter un payload libre", async () => {
    rpc.mockResolvedValue({ data: { intent_id: "10000000-0000-4000-8000-000000000002", listing_id: "10000000-0000-4000-8000-000000000001", kind: "rental_request", status: "pending" }, error: null });
    await repository.createRentalRequest({
      listingId: "10000000-0000-4000-8000-000000000001",
      startsOn: "2026-08-01",
      endsOn: "2026-08-03",
      note: "Session de trois jours",
      idempotencyKey: "rental:10000000-0000-4000-8000-000000000099",
    });
    expect(rpc).toHaveBeenCalledWith("create_marketplace_rental_request_v1", expect.objectContaining({
      p_starts_on: "2026-08-01",
      p_ends_on: "2026-08-03",
    }));
  });

  it("normalise les erreurs Supabase sans exposer leur contenu", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied for table" } });
    await expect(repository.getViewerState()).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejette les réponses RPC vides au lieu de confirmer une mutation fantôme", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await expect(repository.setFavorite(
      LISTING_ID,
      true,
      "favorite:10000000-0000-4000-8000-000000000099",
    )).rejects.toMatchObject({ code: "mutation_failed" });
    await expect(repository.createListingDraft(
      usedDraft(),
      "listing:10000000-0000-4000-8000-000000000099",
    )).rejects.toMatchObject({ code: "mutation_failed" });
    await expect(repository.createRentalRequest({
      listingId: LISTING_ID,
      startsOn: "2026-08-01",
      endsOn: "2026-08-03",
      idempotencyKey: "rental:10000000-0000-4000-8000-000000000099",
    })).rejects.toMatchObject({ code: "mutation_failed" });
  });

  it("expose les intents privés et leurs transitions uniquement via des RPC dédiées", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        intent_id: SECOND_LISTING_ID,
        listing_id: LISTING_ID,
        listing_title: "Live Meewav Paris",
        listing_pillar: "services",
        kind: "service_booking",
        status: "pending",
        requested_quantity: 1,
        starts_on: null,
        ends_on: null,
        requested_for: "2026-08-01T18:30:00+00:00",
        note: null,
        pricing_snapshot: { primary: { amount_minor: 2500 } },
        buyer_profile_id: SECOND_LISTING_ID,
        buyer_display_name: "Nox Amani",
        seller_profile_id: LISTING_ID,
        seller_display_name: "Fetah",
        created_at: "2026-07-19T10:00:00+00:00",
        updated_at: "2026-07-19T10:00:00+00:00",
        responded_at: null,
      }],
      error: null,
    });
    const intents = await repository.listMyIntents({ role: "seller", status: "pending" });
    expect(intents).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_my_marketplace_intents_v1", {
      p_role: "seller",
      p_status: "pending",
      p_limit: 50,
    });

    rpc.mockResolvedValueOnce({
      data: {
        intent_id: SECOND_LISTING_ID,
        listing_id: LISTING_ID,
        kind: "service_booking",
        status: "accepted",
      },
      error: null,
    });
    await repository.updateIntentStatus(
      SECOND_LISTING_ID,
      "accepted",
      "intent-owner:10000000-0000-4000-8000-000000000099",
    );
    expect(rpc).toHaveBeenLastCalledWith("update_marketplace_intent_status_v1", expect.objectContaining({
      p_intent_id: SECOND_LISTING_ID,
      p_status: "accepted",
    }));

    rpc.mockResolvedValueOnce({
      data: {
        intent_id: SECOND_LISTING_ID,
        listing_id: LISTING_ID,
        kind: "service_booking",
        status: "cancelled",
      },
      error: null,
    });
    await repository.cancelIntent(
      SECOND_LISTING_ID,
      "intent-cancel:10000000-0000-4000-8000-000000000099",
    );
    expect(rpc).toHaveBeenLastCalledWith("cancel_marketplace_intent_v1", expect.objectContaining({
      p_intent_id: SECOND_LISTING_ID,
    }));
  });
});
