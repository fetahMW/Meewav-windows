import { describe, expect, it } from "vitest";
import {
  createDefaultMarketFilters,
  filterMarketProducts,
} from "./MarketFiltersPanel";
import { marketProductViews, type MarketProductView } from "./marketDemoData";

function product(id: string) {
  const match = marketProductViews.find((candidate) => candidate.id === id);
  if (!match) throw new Error(`Missing Market fixture: ${id}`);
  return match;
}

describe("filterMarketProducts", () => {
  it("combine univers, catégorie et budget sans modifier le catalogue source", () => {
    const source = marketProductViews.slice(0, 20);
    const target = source[0];
    const filters = {
      ...createDefaultMarketFilters(target.pillarId),
      categories: [target.category],
      priceMin: target.price.amount,
      priceMax: target.price.amount,
    };

    const result = filterMarketProducts(source, filters);

    expect(result.length).toBeGreaterThan(0);
    expect(result.every((candidate) => (
      candidate.pillarId === target.pillarId
      && candidate.category === target.category
      && candidate.price.amount === target.price.amount
    ))).toBe(true);
    expect(source).toEqual(marketProductViews.slice(0, 20));
  });

  it("utilise le grade public autoritaire du vendeur plutôt qu'un grade dérivé", () => {
    const base = product("new-moog-subsequent-37");
    const lowGrade: MarketProductView = {
      ...base,
      id: "grade-low",
      seller: { ...base.seller, gradeLevel: 2 },
    };
    const highGrade: MarketProductView = {
      ...base,
      id: "grade-high",
      seller: { ...base.seller, gradeLevel: 6 },
    };
    const filters = { ...createDefaultMarketFilters("new"), minimumGrade: 5 as const };

    expect(filterMarketProducts([lowGrade, highGrade], filters).map(({ id }) => id)).toEqual(["grade-high"]);
  });

  it("respecte les favoris et les modes de remise réellement disponibles", () => {
    const shipping = product("new-moog-subsequent-37");
    const pickup = marketProductViews.find((candidate) => candidate.location.pickup && !candidate.location.shipping)
      ?? marketProductViews.find((candidate) => candidate.location.pickup);
    if (!pickup) throw new Error("Missing pickup Market fixture");
    const filters = {
      ...createDefaultMarketFilters("all"),
      fulfillment: ["pickup" as const],
      favoritesOnly: true,
    };

    const result = filterMarketProducts([shipping, pickup], filters, {
      favoriteIds: new Set([pickup.id]),
    });

    expect(result.map(({ id }) => id)).toEqual([pickup.id]);
  });

  it("préfère le mode distant canonique au texte de présentation", () => {
    const base = marketProductViews.find((candidate) => candidate.pillarId === "services" && candidate.service);
    if (!base?.service) throw new Error("Missing service Market fixture");
    const filters = {
      ...createDefaultMarketFilters("services"),
      fulfillment: ["remote" as const],
    };
    const canonicalOffline: MarketProductView = {
      ...base,
      id: "canonical-offline",
      service: { ...base.service, format: "Visio ou studio" },
      location: { ...base.location, remote: false },
    };
    const canonicalRemote: MarketProductView = {
      ...base,
      id: "canonical-remote",
      service: { ...base.service, format: "En studio uniquement" },
      location: { ...base.location, remote: true },
    };

    expect(filterMarketProducts([canonicalOffline, canonicalRemote], filters).map(({ id }) => id))
      .toEqual(["canonical-remote"]);
  });

  it("préfère la date canonique d'un service pour la disponibilité", () => {
    const base = marketProductViews.find((candidate) => candidate.pillarId === "services" && candidate.service);
    if (!base?.service) throw new Error("Missing service Market fixture");
    const futureService: MarketProductView = {
      ...base,
      id: "future-service",
      service: {
        ...base.service,
        eventDate: "2026-08-20",
        nextAvailability: "Disponible maintenant",
      },
    };
    const filters = { ...createDefaultMarketFilters("services"), availability: "7-days" as const };

    expect(filterMarketProducts([futureService], filters, { now: new Date("2026-07-19T12:00:00") })).toEqual([]);
    expect(filterMarketProducts([
      { ...futureService, service: { ...futureService.service!, eventDate: "2026-07-22" } },
    ], filters, { now: new Date("2026-07-19T12:00:00") })).toHaveLength(1);
  });

  it("préfère le bucket de disponibilité calculé par le serveur", () => {
    const base = marketProductViews.find((candidate) => candidate.pillarId === "services" && candidate.service);
    if (!base?.service) throw new Error("Missing service Market fixture");
    const product: MarketProductView = {
      ...base,
      service: { ...base.service, nextAvailability: "Disponible maintenant", eventDate: null },
      availabilityBucket: "30-days",
    };

    expect(filterMarketProducts([product], {
      ...createDefaultMarketFilters("services"),
      availability: "7-days",
    })).toEqual([]);
    expect(filterMarketProducts([product], {
      ...createDefaultMarketFilters("services"),
      availability: "30-days",
    })).toHaveLength(1);
  });

  it("applique les tris prix et popularité de façon déterministe", () => {
    const products = marketProductViews.slice(0, 8);

    const byPrice = filterMarketProducts(products, {
      ...createDefaultMarketFilters("all"),
      sort: "price-asc",
    });
    const byPopularity = filterMarketProducts(products, {
      ...createDefaultMarketFilters("all"),
      sort: "popular",
    });

    expect(byPrice.map(({ price }) => price.amount)).toEqual(
      [...byPrice.map(({ price }) => price.amount)].sort((left, right) => left - right),
    );
    expect(byPopularity.map(({ seller }) => seller.salesCount)).toEqual(
      [...byPopularity.map(({ seller }) => seller.salesCount)].sort((left, right) => right - left),
    );
  });
});
