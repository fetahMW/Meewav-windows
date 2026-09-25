import { describe, expect, it } from "vitest";
import {
  MarketplaceAdapterError,
  applyMarketplaceViewerState,
  mapMarketplaceCatalogRow,
  mapMarketplaceCatalogRows,
  mapMarketplaceViewerState,
  marketplaceCategoryCodes,
} from "./market.adapters";
import type { MarketplaceCatalogRow } from "./market.types";

const LISTING_ID = "61000000-0000-4000-8000-000000000001";
const SELLER_ID = "62000000-0000-4000-8000-000000000001";

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
    badge_label: "Sélection studio",
    city_label: "Paris",
    area_label: "11e",
    pickup_enabled: true,
    shipping_enabled: true,
    shipping_amount_minor: 1_490,
    currency_code: "EUR",
    unit_amount_minor: 89_900,
    compare_at_amount_minor: 99_900,
    price_unit: "item",
    max_quantity: 8,
    preparation_days: 3,
    new_terms: { stock: 8, warranty_months: 24, compare_at_amount_minor: 99_900 },
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

describe("marketplace catalog adapters", () => {
  it("maps a safe RPC row to the existing MarketProductView contract", () => {
    const product = mapMarketplaceCatalogRow(catalogRow());

    expect(product).toMatchObject({
      id: LISTING_ID,
      pillarId: "new",
      category: "Interfaces audio",
      condition: "new",
      price: { amount: 899, compareAtAmount: 999, currency: "EUR", unit: "item" },
      sellerId: SELLER_ID,
      seller: {
        id: SELLER_ID,
        profileId: SELLER_ID,
        name: "Nox Amani",
        monogram: "NA",
        verified: true,
        rating: { score: 4.9, count: 86 },
      },
      location: {
        city: "Paris",
        area: "11e",
        pickup: true,
        shipping: true,
      },
      cart: { eligible: true, quantity: 0, maxQuantity: 8 },
      shippingAmount: 14.9,
      preparationDays: 3,
      newTerms: { stock: 8, warrantyMonths: 24 },
    });
    expect(product.location.distanceKm).toBe(Number.POSITIVE_INFINITY);
    expect(product.seller).toMatchObject({ avatarUrl: null, gradeLevel: 4 });
  });

  it("maps the additive v2 seller, delivery, favorite and distance fields", () => {
    const product = mapMarketplaceCatalogRow(catalogRow({
      seller_kind: "studio",
      remote_enabled: true,
      viewer_favorite: true,
      availability_bucket: "7-days",
      distance_supported: true,
      distance_km: 2.75,
    }));

    expect(product.seller.kind).toBe("studio");
    expect(product.location).toMatchObject({ remote: true, distanceKm: 2.75 });
    expect(product.favorite).toBe(true);
    expect(product.availabilityBucket).toBe("7-days");
  });

  it("expands translated category labels to every supported stored alias", () => {
    expect(marketplaceCategoryCodes(["Mix & mastering", "Interfaces audio"]))
      .toEqual(expect.arrayContaining(["mix-mastering", "mix-et-mastering", "interfaces_audio", "interfaces-audio"]));
  });

  it("uses cautious fallback labels when the server did not provide a condition label", () => {
    const fresh = mapMarketplaceCatalogRow(catalogRow({ condition_label: null }));
    const used = mapMarketplaceCatalogRow(catalogRow({
      pillar: "used",
      slug: "apollo-twin-used",
      condition_code: "excellent",
      condition_label: null,
      new_terms: null,
      used_terms: { purchase_year: 2024, negotiable: false, condition_notes: null },
    }));
    const rental = mapMarketplaceCatalogRow(catalogRow({
      pillar: "rental",
      slug: "apollo-twin-rental",
      price_unit: "day",
      condition_label: null,
      new_terms: null,
      rental_terms: {
        daily_amount_minor: 8_900,
        weekend_amount_minor: null,
        weekly_amount_minor: null,
        deposit_amount_minor: 100_000,
        minimum_days: 1,
        available_from: "2026-07-23",
        instant_book: false,
      },
    }));

    expect(fresh.conditionLabel).toBe("Neuf · Disponibilité à confirmer");
    expect(used.conditionLabel).toBe("Occasion · État à confirmer");
    expect(rental.conditionLabel).toBe("Location · Disponibilité à confirmer");
  });

  it("maps typed rental, service and collective terms from bounded server payloads", () => {
    const rental = mapMarketplaceCatalogRow(catalogRow({
      pillar: "rental",
      slug: "nord-stage-rental",
      price_unit: "day",
      unit_amount_minor: 8_900,
      compare_at_amount_minor: null,
      max_quantity: 1,
      rental_terms: {
        daily_amount_minor: 8_900,
        weekend_amount_minor: 21_000,
        weekly_amount_minor: 46_000,
        deposit_amount_minor: 180_000,
        minimum_days: 2,
        available_from: "2026-07-23",
        instant_book: false,
      },
    }));
    expect(rental.rental).toEqual({
      dailyPrice: 89,
      weekendPrice: 210,
      weeklyPrice: 460,
      deposit: 1_800,
      minimumDays: 2,
      availableFrom: "2026-07-23",
      instantBook: false,
    });
    expect(rental.cart.eligible).toBe(false);

    const service = mapMarketplaceCatalogRow(catalogRow({
      pillar: "services",
      slug: "coaching-vocal",
      category_code: "cours_coaching",
      price_unit: "session",
      max_quantity: 0,
      service_terms: {
        service_kind: "coaching",
        service_format: "Studio ou visio",
        duration_label: "1 h 30",
        delivery_label: "Exercices personnalisés",
        next_availability: "Demain · 16 h",
        event_date: "2026-08-01T18:30:00.000Z",
        capacity: 40,
        venue_name: "Room Meewav",
        included_equipment: "Console, micros et retours",
      },
    }));
    expect(service.service).toEqual({
      kind: "coaching",
      format: "Studio ou visio",
      durationLabel: "1 h 30",
      deliveryLabel: "Exercices personnalisés",
      nextAvailability: "Demain · 16 h",
      eventDate: "2026-08-01T18:30:00.000Z",
      capacity: 40,
      venueName: "Room Meewav",
      includedEquipment: "Console, micros et retours",
    });
    expect(service.price.unit).toBe("session");

    const collective = mapMarketplaceCatalogRow(catalogRow({
      pillar: "collective",
      slug: "apollo-collective",
      price_unit: "participant",
      max_quantity: 0,
      collective_terms: {
        joined: 18,
        target_participants: 24,
        progress_percent: 75,
        days_remaining: 5,
        retail_unit_amount_minor: 89_900,
        unlocked_unit_amount_minor: 74_900,
        savings_percent: 17,
      },
    }));
    expect(collective.collective).toEqual({
      joined: 18,
      target: 24,
      progressPercent: 75,
      daysRemaining: 5,
      retailUnitPrice: 899,
      unlockedUnitPrice: 749,
      savingsPercent: 17,
    });
    expect(collective.price.unit).toBe("participant");
  });

  it("preserves a hidden grade and uses only a safe authoritative avatar", () => {
    const hidden = mapMarketplaceCatalogRow(catalogRow({
      seller_grade_level: null,
      seller_avatar_url: "https://assets.example.test/avatar.webp",
    }));
    expect(hidden.seller.gradeLevel).toBeNull();
    expect(hidden.seller.avatarUrl).toBe("https://assets.example.test/avatar.webp");

    const unsafe = mapMarketplaceCatalogRow(catalogRow({ seller_avatar_url: "javascript:alert(1)" }));
    expect(unsafe.seller.avatarUrl).toBeNull();
  });

  it("never exposes an unsafe cover URL and degrades unknown categories explicitly", () => {
    const product = mapMarketplaceCatalogRow(catalogRow({
      cover_url: "javascript:alert(1)",
      category_code: "future_category",
    }));

    expect(product.imageUrl).toBe("/images/market/market-acoustic-wall.webp");
    expect(product.category).toBe("Autres");
  });

  it("rejects malformed identifiers, money and required subtype contracts", () => {
    expect(() => mapMarketplaceCatalogRow(catalogRow({ listing_id: "demo-listing" })))
      .toThrow(MarketplaceAdapterError);
    expect(() => mapMarketplaceCatalogRow(catalogRow({ unit_amount_minor: -1 })))
      .toThrow(MarketplaceAdapterError);
    expect(() => mapMarketplaceCatalogRow(catalogRow({
      pillar: "rental",
      slug: "invalid-rental",
      rental_terms: { daily_amount_minor: 1_000 },
    }))).toThrow(MarketplaceAdapterError);
  });

  it("accepts the same maximum price as the catalogue and draft RPCs", () => {
    const maximum = mapMarketplaceCatalogRow(catalogRow({
      unit_amount_minor: 1_000_000_000_000,
      compare_at_amount_minor: null,
      new_terms: {
        stock: 1,
        warranty_months: 24,
        compare_at_amount_minor: null,
      },
    }));

    expect(maximum.price.amount).toBe(10_000_000_000);
    expect(() => mapMarketplaceCatalogRow(catalogRow({
      unit_amount_minor: 1_000_000_000_001,
    }))).toThrow(MarketplaceAdapterError);
  });

  it("keeps optional rental/service creation fields renderable without inventing package discounts", () => {
    const rental = mapMarketplaceCatalogRow(catalogRow({
      pillar: "rental",
      slug: "rental-daily-only",
      price_unit: "day",
      rental_terms: {
        daily_amount_minor: 2_500,
        weekend_amount_minor: null,
        weekly_amount_minor: null,
        deposit_amount_minor: 10_000,
        minimum_days: 1,
        available_from: "2026-07-23",
        instant_book: false,
      },
    }));
    expect(rental.rental).toMatchObject({ dailyPrice: 25, weekendPrice: 50, weeklyPrice: 175 });

    const service = mapMarketplaceCatalogRow(catalogRow({
      pillar: "services",
      slug: "service-without-delivery",
      price_unit: "session",
      service_terms: {
        service_kind: "coaching",
        service_format: "Visio",
        duration_label: "1 heure",
        delivery_label: null,
        next_availability: "Demain",
      },
    }));
    expect(service.service?.deliveryLabel).toBe("Résultat à convenir avec l’artiste");
    expect(service.service).toMatchObject({
      eventDate: null,
      capacity: null,
      venueName: null,
      includedEquipment: null,
    });
  });

  it("isolates a malformed legacy announcement instead of blanking the whole catalogue", () => {
    const products = mapMarketplaceCatalogRows([
      catalogRow(),
      catalogRow({ listing_id: "legacy-invalid-id", slug: "legacy-invalid" }),
    ]);
    expect(products).toHaveLength(1);
    expect(products[0].id).toBe(LISTING_ID);
  });

  it("recognizes composer category slugs, SQL response buckets and used negotiation", () => {
    const product = mapMarketplaceCatalogRow(catalogRow({
      pillar: "used",
      slug: "mix-used-negotiable",
      category_code: "mix-et-mastering",
      condition_code: "excellent",
      seller_response_time_bucket: "under_4h",
      used_terms: {
        purchase_year: 2024,
        negotiable: true,
        condition_notes: "Révisé en atelier, légère trace sous le châssis.",
      },
    }));
    expect(product.category).toBe("Mix & mastering");
    expect(product.negotiable).toBe(true);
    expect(product.usedTerms).toEqual({
      purchaseYear: 2024,
      negotiable: true,
      conditionNotes: "Révisé en atelier, légère trace sous le châssis.",
    });
    expect(product.seller.responseTime).toBe("Répond généralement en moins de 4 h");

    expect(mapMarketplaceCatalogRow(catalogRow({ category_code: "dj-et-vinyle" })).category)
      .toBe("DJ & vinyle");
  });

  it("applies viewer state without exceeding authoritative inventory", () => {
    const product = applyMarketplaceViewerState(mapMarketplaceCatalogRow(catalogRow({ max_quantity: 2 })), {
      favorite_listing_ids: [LISTING_ID],
      cart_items: [{ listing_id: LISTING_ID, quantity: 9 }],
    });

    expect(product.favorite).toBe(true);
    expect(product.cart.quantity).toBe(2);
  });

  it("validates and deduplicates the private viewer-state payload", () => {
    const state = mapMarketplaceViewerState({
      favorite_listing_ids: [LISTING_ID, LISTING_ID],
      cart_items: [{ listing_id: LISTING_ID, quantity: 2 }],
      joined_collective_listing_ids: [LISTING_ID],
    });
    expect([...state.favorites]).toEqual([LISTING_ID]);
    expect(state.cart.get(LISTING_ID)).toBe(2);
    expect(state.joinedCollectives.has(LISTING_ID)).toBe(true);

    expect(() => mapMarketplaceViewerState({
      favorite_listing_ids: ["demo-listing"],
      cart_items: [],
      joined_collective_listing_ids: [],
    })).toThrow(MarketplaceAdapterError);
  });
});
