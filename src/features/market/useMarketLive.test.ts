import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceServiceError } from "./market.errors";
import type { MarketplaceRepository } from "./market.service";
import type {
  MarketplaceCatalogFilters,
  MarketplaceCatalogInput,
  MarketplaceCatalogRow,
  MarketplaceIntentResult,
} from "./market.types";
import { useMarketLive } from "./useMarketLive";

const LISTING_ID = "71000000-0000-4000-8000-000000000001";
const SECOND_LISTING_ID = "71000000-0000-4000-8000-000000000002";
const SELLER_ID = "72000000-0000-4000-8000-000000000001";
const INTENT_ID = "73000000-0000-4000-8000-000000000001";

function catalogRow(overrides: Partial<MarketplaceCatalogRow> = {}): MarketplaceCatalogRow {
  return {
    listing_id: LISTING_ID,
    seller_profile_id: SELLER_ID,
    seller_display_name: "Nox Amani",
    seller_username: "noxamani",
    seller_avatar_url: null,
    seller_grade_level: 4,
    seller_verified: true,
    seller_rating_basis_points: 49_000,
    seller_rating_count: 86,
    seller_completed_orders_count: 104,
    seller_response_time_bucket: "under_1_hour",
    slug: "apollo-twin-x-duo",
    pillar: "new",
    category_code: "interfaces_audio",
    title: "Apollo Twin X Duo",
    short_description: "Interface audio professionnelle",
    description: "Interface audio professionnelle en parfait état.",
    brand: "Universal Audio",
    model: "Apollo Twin X",
    condition_code: "new",
    condition_label: "Neuf · Garantie 24 mois",
    cover_url: "/images/market/apollo-twin-x.jpg",
    cover_storage_bucket: null,
    cover_storage_path: null,
    cover_alt: "Apollo Twin X Duo",
    badge_label: null,
    city_label: "Paris",
    area_label: "11e",
    pickup_enabled: true,
    shipping_enabled: true,
    shipping_amount_minor: 1_490,
    currency_code: "EUR",
    unit_amount_minor: 89_900,
    compare_at_amount_minor: null,
    price_unit: "item",
    max_quantity: 8,
    preparation_days: 2,
    new_terms: { stock: 8, warranty_months: 24 },
    used_terms: null,
    rental_terms: null,
    service_terms: null,
    collective_terms: null,
    published_at: "2026-07-19T10:00:00Z",
    next_cursor_published_at: null,
    next_cursor_listing_id: null,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function repository(overrides: Partial<MarketplaceRepository> = {}) {
  return {
    listCatalog: vi.fn().mockResolvedValue([catalogRow()]),
    getViewerState: vi.fn().mockResolvedValue({
      favorite_listing_ids: [],
      cart_items: [],
      joined_collective_listing_ids: [],
    }),
    getSellerKind: vi.fn().mockResolvedValue("artist"),
    setFavorite: vi.fn().mockResolvedValue({ listing_id: LISTING_ID, favorite: true }),
    setCartQuantity: vi.fn().mockResolvedValue({ listing_id: LISTING_ID, quantity: 1 }),
    createListingDraft: vi.fn(),
    createRentalRequest: vi.fn(),
    createServiceBooking: vi.fn(),
    joinCollective: vi.fn().mockResolvedValue({
      intent_id: INTENT_ID,
      status: "pending",
      listing_id: LISTING_ID,
      kind: "collective_join",
    }),
    ...overrides,
  } as unknown as MarketplaceRepository;
}

function intent(kind: MarketplaceIntentResult["kind"]): MarketplaceIntentResult {
  return {
    intent_id: INTENT_ID,
    status: "pending",
    listing_id: LISTING_ID,
    kind,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMarketLive", () => {
  it("charge le catalogue public sans session sans lire ni muter les données privées", async () => {
    const liveRepository = repository();
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase", enabled: false, viewerId: null, repository: liveRepository,
      catalog: { pillar: "new", limit: 24 },
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.products).toHaveLength(1);
    expect(liveRepository.listCatalog).toHaveBeenCalledTimes(1);
    expect(liveRepository.getViewerState).not.toHaveBeenCalled();
    expect(liveRepository.getSellerKind).not.toHaveBeenCalled();
    expect(liveRepository.setFavorite).not.toHaveBeenCalled();
  });

  it("loads catalog and viewer state only in Supabase mode", async () => {
    const liveRepository = repository({
      getViewerState: vi.fn().mockResolvedValue({
        favorite_listing_ids: [LISTING_ID],
        cart_items: [{ listing_id: LISTING_ID, quantity: 2 }],
        joined_collective_listing_ids: [SECOND_LISTING_ID],
      }),
    });
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase",
      repository: liveRepository,
      catalog: { pillar: "new", search: "Apollo", limit: 24 },
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(liveRepository.listCatalog).toHaveBeenCalledWith({
      cursor: null,
      pillar: "new",
      categoryCode: null,
      search: "Apollo",
      limit: 24,
    });
    expect(liveRepository.getViewerState).toHaveBeenCalledTimes(1);
    expect(liveRepository.getSellerKind).toHaveBeenCalledTimes(1);
    expect(result.current.sellerKind).toBe("artist");
    expect(result.current.favorites.has(LISTING_ID)).toBe(true);
    expect(result.current.cart.get(LISTING_ID)).toBe(2);
    expect(result.current.joinedCollectives.has(SECOND_LISTING_ID)).toBe(true);
    expect(result.current.products[0]).toMatchObject({ favorite: true, cart: { quantity: 2 } });
  });

  it("reloads on a real server-filter change but keeps equivalent filter arrays cache-stable", async () => {
    const listCatalog = vi.fn().mockResolvedValue([catalogRow()]);
    const liveRepository = repository({ listCatalog });
    const initialFilters: MarketplaceCatalogFilters = {
      categoryCodes: ["synthesizers", "microphones"],
      conditionCodes: ["very_good", "excellent"],
      minimumPriceMinor: 10_000,
      maximumPriceMinor: 200_000,
      fulfillment: ["shipping", "pickup"],
      availability: "7-days",
      sellerKinds: ["studio", "artist"],
      verifiedOnly: true,
      minimumGrade: 3,
      sort: "price-asc",
      favoritesOnly: true,
    };
    const { result, rerender } = renderHook(
      ({ filters }: { filters: MarketplaceCatalogFilters }) => useMarketLive({
        mode: "supabase",
        repository: liveRepository,
        catalog: { limit: 24, filters },
      }),
      { initialProps: { filters: initialFilters } },
    );

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(listCatalog).toHaveBeenCalledTimes(1);
    expect(listCatalog).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: null,
      filters: expect.objectContaining({
        categoryCodes: ["microphones", "synthesizers"],
        conditionCodes: ["excellent", "very_good"],
        sort: "price-asc",
      }),
    }));

    rerender({
      filters: {
        ...initialFilters,
        categoryCodes: ["microphones", "synthesizers"],
        conditionCodes: ["excellent", "very_good"],
      },
    });
    await act(async () => Promise.resolve());
    expect(listCatalog).toHaveBeenCalledTimes(1);

    rerender({ filters: { ...initialFilters, maximumPriceMinor: 175_000 } });
    await waitFor(() => expect(listCatalog).toHaveBeenCalledTimes(2));
    expect(listCatalog).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: null,
      filters: expect.objectContaining({ maximumPriceMinor: 175_000 }),
    }));
  });

  it("exposes the explicit proximity fallback instead of pretending to know distance", async () => {
    const liveRepository = repository();
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase",
      repository: liveRepository,
      catalog: { filters: { sort: "distance" } },
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.catalogCapabilities.sorts.distance.supported).toBe(false);
    expect(result.current.catalogSortFallback).toEqual({
      requested: "distance",
      applied: "recommended",
      reason: "distance_unavailable",
    });
    expect(liveRepository.listCatalog).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ sort: "distance" }),
    }));
  });

  it("hydrates cart products by exact IDs independently from the visible catalog filter", async () => {
    const listCatalog = vi.fn().mockImplementation(async (input: MarketplaceCatalogInput) => {
      if (input.listingIds) {
        return [catalogRow({
          listing_id: SECOND_LISTING_ID,
          slug: "cart-only-listing",
          title: "Produit conservé au panier",
        })];
      }
      return [catalogRow()];
    });
    const liveRepository = repository({
      listCatalog,
      getViewerState: vi.fn().mockResolvedValue({
        favorite_listing_ids: [],
        cart_items: [{ listing_id: SECOND_LISTING_ID, quantity: 2 }],
        joined_collective_listing_ids: [],
      }),
    });
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase",
      repository: liveRepository,
      catalog: { pillar: "new", search: "Apollo", limit: 24 },
    }));

    await waitFor(() => expect(result.current.cartProductsStatus).toBe("ready"));
    expect(result.current.products.map((product) => product.id)).toEqual([LISTING_ID]);
    expect(result.current.cartProducts).toHaveLength(1);
    expect(result.current.cartProducts[0]).toMatchObject({
      id: SECOND_LISTING_ID,
      title: "Produit conservé au panier",
      cart: { quantity: 2 },
    });
    expect(listCatalog).toHaveBeenCalledWith({
      listingIds: [SECOND_LISTING_ID],
      limit: 1,
    });
  });

  it("hydrates favorite products by exact IDs independently from the visible catalog filter", async () => {
    const listCatalog = vi.fn().mockImplementation(async (input: MarketplaceCatalogInput) => {
      if (input.listingIds) {
        return [catalogRow({
          listing_id: SECOND_LISTING_ID,
          slug: "favorite-only-listing",
          title: "Annonce favorite hors filtre",
        })];
      }
      return [catalogRow()];
    });
    const liveRepository = repository({
      listCatalog,
      getViewerState: vi.fn().mockResolvedValue({
        favorite_listing_ids: [SECOND_LISTING_ID],
        cart_items: [],
        joined_collective_listing_ids: [],
      }),
    });
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase",
      repository: liveRepository,
      catalog: { pillar: "new", search: "Apollo", limit: 24 },
    }));

    await waitFor(() => expect(result.current.favoriteProductsStatus).toBe("ready"));
    expect(result.current.products.map((product) => product.id)).toEqual([LISTING_ID]);
    expect(result.current.favoriteProducts).toHaveLength(1);
    expect(result.current.favoriteProducts[0]).toMatchObject({
      id: SECOND_LISTING_ID,
      title: "Annonce favorite hors filtre",
      favorite: true,
    });
    expect(listCatalog).toHaveBeenCalledWith({
      listingIds: [SECOND_LISTING_ID],
      limit: 1,
    });
  });

  it("reports a partial cart instead of hiding an unavailable listing", async () => {
    const listCatalog = vi.fn().mockImplementation(async (input: MarketplaceCatalogInput) => input.listingIds ? [] : [catalogRow()]);
    const liveRepository = repository({
      listCatalog,
      getViewerState: vi.fn().mockResolvedValue({
        favorite_listing_ids: [],
        cart_items: [{ listing_id: SECOND_LISTING_ID, quantity: 1 }],
        joined_collective_listing_ids: [],
      }),
    });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));

    await waitFor(() => expect(result.current.cartProductsStatus).toBe("partial"));
    expect(result.current.cart.get(SECOND_LISTING_ID)).toBe(1);
    expect(result.current.cartProducts).toEqual([]);
  });

  it("does not call Supabase or silently import mocks in demo mode", async () => {
    const liveRepository = repository();
    const { result } = renderHook(() => useMarketLive({
      mode: "demo",
      repository: liveRepository,
    }));

    await waitFor(() => expect(result.current.status).toBe("idle"));
    expect(liveRepository.listCatalog).not.toHaveBeenCalled();
    expect(liveRepository.getViewerState).not.toHaveBeenCalled();
    expect(result.current.products).toEqual([]);
  });

  it("surfaces a load error and keeps the live catalog empty", async () => {
    const liveRepository = repository({
      listCatalog: vi.fn().mockRejectedValue(new MarketplaceServiceError("load_failed")),
    });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.products).toEqual([]);
    expect(result.current.error).toEqual({
      code: "load_failed",
      message: "Impossible de charger le Marketplace pour le moment.",
    });
  });

  it("uses the opaque server cursor and does not reload viewer state while paginating", async () => {
    const cursorDate = "2026-07-18T10:00:00Z";
    const listCatalog = vi.fn()
      .mockResolvedValueOnce([catalogRow({
        next_cursor_published_at: cursorDate,
        next_cursor_listing_id: SECOND_LISTING_ID,
        sort_applied: "popular",
        next_cursor: {
          version: 1,
          sort: "popular",
          sortValue: 104,
          publishedAt: cursorDate,
          listingId: SECOND_LISTING_ID,
        },
      })])
      .mockResolvedValueOnce([catalogRow({
        listing_id: SECOND_LISTING_ID,
        slug: "second-listing",
      })]);
    const getViewerState = vi.fn().mockResolvedValue({
      favorite_listing_ids: [],
      cart_items: [],
      joined_collective_listing_ids: [],
    });
    const liveRepository = repository({ listCatalog, getViewerState });
    const { result } = renderHook(() => useMarketLive({
      mode: "supabase",
      repository: liveRepository,
      catalog: { filters: { sort: "popular" } },
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });
    expect(listCatalog).toHaveBeenLastCalledWith(expect.objectContaining({
      cursor: {
        version: 1,
        sort: "popular",
        sortValue: 104,
        publishedAt: cursorDate,
        listingId: SECOND_LISTING_ID,
      },
    }));
    expect(getViewerState).toHaveBeenCalledTimes(1);
    expect(result.current.products.map((product) => product.id)).toEqual([LISTING_ID, SECOND_LISTING_ID]);
    expect(result.current.hasMore).toBe(false);
  });

  it("updates a favorite optimistically and rolls it back on failure", async () => {
    const mutation = deferred<{ listing_id: string; favorite: boolean }>();
    const liveRepository = repository({ setFavorite: vi.fn(() => mutation.promise) });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let request!: Promise<boolean>;
    act(() => {
      request = result.current.toggleFavorite(LISTING_ID, true);
    });
    expect(result.current.favorites.has(LISTING_ID)).toBe(true);
    expect(result.current.products[0].favorite).toBe(true);
    expect(result.current.pendingActions.has(`favorite:${LISTING_ID}`)).toBe(true);

    await act(async () => {
      mutation.reject(new MarketplaceServiceError("conflict"));
      await request;
    });
    expect(result.current.favorites.has(LISTING_ID)).toBe(false);
    expect(result.current.products[0].favorite).toBe(false);
    expect(result.current.pendingActions.size).toBe(0);
    expect(result.current.actionError?.code).toBe("conflict");
  });

  it("does not let an older viewer-state reload erase a confirmed cart or favorite mutation", async () => {
    const staleViewerState = deferred<{
      favorite_listing_ids: string[];
      cart_items: Array<{ listing_id: string; quantity: number }>;
      joined_collective_listing_ids: string[];
    }>();
    const getViewerState = vi.fn()
      .mockResolvedValueOnce({
        favorite_listing_ids: [],
        cart_items: [],
        joined_collective_listing_ids: [],
      })
      .mockImplementationOnce(() => staleViewerState.promise);
    const liveRepository = repository({ getViewerState });
    const { result, rerender } = renderHook(
      ({ search }) => useMarketLive({
        mode: "supabase",
        repository: liveRepository,
        catalog: { search },
      }),
      { initialProps: { search: "Apollo" } },
    );
    await waitFor(() => expect(result.current.status).toBe("ready"));

    rerender({ search: "Twin" });
    await waitFor(() => expect(getViewerState).toHaveBeenCalledTimes(2));
    await act(async () => {
      expect(await result.current.toggleFavorite(LISTING_ID, true)).toBe(true);
    });

    await act(async () => {
      staleViewerState.resolve({
        favorite_listing_ids: [],
        cart_items: [],
        joined_collective_listing_ids: [],
      });
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.favorites.has(LISTING_ID)).toBe(true);
  });

  it("rolls cart and collective optimistic state back without reporting a false success", async () => {
    const setCartQuantity = vi.fn().mockRejectedValue(new MarketplaceServiceError("mutation_failed"));
    const joinCollective = vi.fn().mockRejectedValue(new MarketplaceServiceError("conflict"));
    const liveRepository = repository({ setCartQuantity, joinCollective });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let cartResult!: boolean;
    await act(async () => {
      cartResult = await result.current.setCartQuantity(LISTING_ID, 3);
    });
    expect(cartResult).toBe(false);
    expect(result.current.cart.has(LISTING_ID)).toBe(false);

    let collectiveResult!: boolean;
    await act(async () => {
      collectiveResult = await result.current.joinCollective(LISTING_ID);
    });
    expect(collectiveResult).toBe(false);
    expect(result.current.joinedCollectives.has(LISTING_ID)).toBe(false);
    expect(result.current.actionError?.code).toBe("conflict");
  });

  it("serializes rapid favorite changes so the final server state always wins", async () => {
    const first = deferred<{ listing_id: string; favorite: boolean }>();
    const second = deferred<{ listing_id: string; favorite: boolean }>();
    const setFavorite = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const liveRepository = repository({ setFavorite });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let firstRequest!: Promise<boolean>;
    let secondRequest!: Promise<boolean>;
    act(() => {
      firstRequest = result.current.toggleFavorite(LISTING_ID, true);
    });
    await waitFor(() => expect(setFavorite).toHaveBeenCalledTimes(1));
    act(() => {
      secondRequest = result.current.toggleFavorite(LISTING_ID, false);
    });
    expect(setFavorite).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({ listing_id: LISTING_ID, favorite: true });
    });
    await waitFor(() => expect(setFavorite).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ listing_id: LISTING_ID, favorite: false });
      await Promise.all([firstRequest, secondRequest]);
    });
    expect(setFavorite.mock.calls.map((call) => call[1])).toEqual([true, false]);
    expect(result.current.favorites.has(LISTING_ID)).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it("coalesces synchronous favorite reversals before any unnecessary RPC", async () => {
    const setFavorite = vi.fn();
    const liveRepository = repository({ setFavorite });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let add!: Promise<boolean>;
    let remove!: Promise<boolean>;
    await act(async () => {
      add = result.current.toggleFavorite(LISTING_ID, true);
      remove = result.current.toggleFavorite(LISTING_ID, false);
      await Promise.all([add, remove]);
    });
    expect(setFavorite).not.toHaveBeenCalled();
    expect(result.current.favorites.has(LISTING_ID)).toBe(false);
  });

  it("coalesces rapid cart changes and never sends a stale quantity after the latest one", async () => {
    const first = deferred<{ listing_id: string; quantity: number }>();
    const second = deferred<{ listing_id: string; quantity: number }>();
    const setCartQuantity = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const liveRepository = repository({ setCartQuantity });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let firstRequest!: Promise<boolean>;
    let secondRequest!: Promise<boolean>;
    act(() => {
      firstRequest = result.current.setCartQuantity(LISTING_ID, 2);
    });
    await waitFor(() => expect(setCartQuantity).toHaveBeenCalledTimes(1));
    act(() => {
      secondRequest = result.current.setCartQuantity(LISTING_ID, 5);
    });
    expect(setCartQuantity).toHaveBeenCalledTimes(1);
    expect(result.current.cart.get(LISTING_ID)).toBe(5);
    expect(result.current.isCartPending(LISTING_ID)).toBe(true);

    await act(async () => {
      first.resolve({ listing_id: LISTING_ID, quantity: 2 });
    });
    await waitFor(() => expect(setCartQuantity).toHaveBeenCalledTimes(2));
    await act(async () => {
      second.resolve({ listing_id: LISTING_ID, quantity: 5 });
      await Promise.all([firstRequest, secondRequest]);
    });
    expect(setCartQuantity.mock.calls.map((call) => call[1])).toEqual([2, 5]);
    expect(result.current.cart.get(LISTING_ID)).toBe(5);
    expect(result.current.isCartPending(LISTING_ID)).toBe(false);
  });

  it("returns a rental intent only after the server confirms it", async () => {
    const pending = deferred<MarketplaceIntentResult>();
    const createRentalRequest = vi.fn(() => pending.promise);
    const liveRepository = repository({ createRentalRequest });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let request!: Promise<MarketplaceIntentResult | null>;
    act(() => {
      request = result.current.requestRental(LISTING_ID, "2026-07-23", "2026-07-25", "Besoin pour une scène");
    });
    expect(result.current.lastIntent).toBeNull();
    expect(result.current.pendingActions.has(`rental:${LISTING_ID}`)).toBe(true);

    await act(async () => {
      pending.resolve(intent("rental_request"));
      await request;
    });
    expect(result.current.lastIntent).toEqual(intent("rental_request"));
    expect(createRentalRequest).toHaveBeenCalledWith(expect.objectContaining({
      listingId: LISTING_ID,
      startsOn: "2026-07-23",
      endsOn: "2026-07-25",
      note: "Besoin pour une scène",
      idempotencyKey: expect.stringMatching(/^rental:/),
    }));
  });

  it("returns null and an actionable error when service booking fails", async () => {
    const createServiceBooking = vi.fn().mockRejectedValue(new MarketplaceServiceError("not_found"));
    const liveRepository = repository({ createServiceBooking });
    const { result } = renderHook(() => useMarketLive({ mode: "supabase", repository: liveRepository }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let booking!: MarketplaceIntentResult | null;
    await act(async () => {
      booking = await result.current.bookService(
        LISTING_ID,
        "2026-07-25T20:00:00Z",
        "Mixage de quatre titres",
      );
    });
    expect(booking).toBeNull();
    expect(result.current.lastIntent).toBeNull();
    expect(result.current.actionError).toEqual({
      code: "not_found",
      message: "Cette annonce n’est plus disponible.",
    });
    expect(createServiceBooking).toHaveBeenCalledWith(expect.objectContaining({
      listingId: LISTING_ID,
      requestedFor: "2026-07-25T20:00:00Z",
      idempotencyKey: expect.stringMatching(/^service:/),
    }));
  });
});
