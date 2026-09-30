const FEATURED_LEAD_IDS = [
  "collective-arturia-minifreak",
  "new-apollo-twin-x",
  "used-gibson-les-paul",
] as const;

/** Lead with the selected showcase, without adding unavailable listings. */
export function orderMarketFeaturedProducts<T extends { id: string }>(products: readonly T[]): T[] {
  const leadIds = new Set<string>(FEATURED_LEAD_IDS);
  const leads = FEATURED_LEAD_IDS.flatMap((id) => {
    const product = products.find((candidate) => candidate.id === id);
    return product ? [product] : [];
  });
  return [...leads, ...products.filter((product) => !leadIds.has(product.id))];
}
