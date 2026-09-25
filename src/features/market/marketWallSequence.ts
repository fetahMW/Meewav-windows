export const MARKET_WALL_UNIQUE_CYCLE_SIZE = 50;

type MarketWallItem = {
  id: string;
  imageUrl: string;
};

/**
 * Construit un mur sans répétition visuelle rapprochée sans jamais supprimer
 * ni dupliquer une annonce. Une offre dont l'image est encore dans la fenêtre
 * récente est repoussée derrière la prochaine offre visuellement distincte.
 */
export function buildMarketWallSequence<T extends MarketWallItem>(
  products: readonly T[],
  cycleSize = MARKET_WALL_UNIQUE_CYCLE_SIZE,
): T[] {
  if (products.length <= 1) return [...products];

  const recentWindowSize = Math.max(1, Math.trunc(cycleSize));
  const remaining = [...products];
  const recentImages: string[] = [];
  const sequence: T[] = [];

  while (remaining.length > 0) {
    const distinctIndex = remaining.findIndex((product) => !recentImages.includes(product.imageUrl));
    const selectedIndex = distinctIndex >= 0 ? distinctIndex : 0;
    const [selected] = remaining.splice(selectedIndex, 1);
    sequence.push(selected);
    recentImages.push(selected.imageUrl);
    if (recentImages.length > recentWindowSize) recentImages.shift();
  }

  return sequence;
}
