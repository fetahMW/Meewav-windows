import { describe, expect, it } from "vitest";
import { marketProductViews } from "./marketDemoData";
import { orderMarketFeaturedProducts } from "./marketFeaturedSequence";

const leadIds = ["collective-arturia-minifreak", "new-apollo-twin-x", "used-gibson-les-paul"];

describe("orderMarketFeaturedProducts", () => {
  it("starts with the requested showcase and keeps all other listings in order", () => {
    const products = [...marketProductViews];
    const originalOrder = products.map((product) => product.id);
    const ordered = orderMarketFeaturedProducts(products);

    expect(ordered.slice(0, 3).map((product) => product.id)).toEqual(leadIds);
    expect(ordered.slice(3)).toEqual(products.filter((product) => !leadIds.includes(product.id)));
    expect(ordered).toHaveLength(products.length);
    expect(new Set(ordered.map((product) => product.id)).size).toBe(products.length);
    expect(products.map((product) => product.id)).toEqual(originalOrder);
    expect(ordered[0]).toBe(products.find((product) => product.id === leadIds[0]));
  });

  it("does not inject demo products into a live catalogue", () => {
    const liveProducts = [{ id: "real-listing-b" }, { id: "real-listing-a" }];
    expect(orderMarketFeaturedProducts(liveProducts)).toEqual(liveProducts);
    expect(orderMarketFeaturedProducts([])).toEqual([]);
  });

  it("promotes only available showcase listings", () => {
    const products = [
      { id: "other-listing" },
      { id: leadIds[2] },
      { id: leadIds[1] },
    ];
    expect(orderMarketFeaturedProducts(products).map((product) => product.id)).toEqual([
      leadIds[1], leadIds[2], "other-listing",
    ]);
  });
});
