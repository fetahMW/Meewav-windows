/**
 * Visuels additionnels utilisés uniquement pour compléter les cycles des murs.
 * Chaque univers possède ainsi au moins 50 images différentes avant toute reprise.
 */
export const MARKET_WALL_IMAGE_OVERRIDES: Readonly<Record<string, string>> = {
  "new-moog-subsequent-performance": "/images/market/unique/new/new-moog-subsequent-performance.png",
  "rental-moog-subsequent-37": "/images/market/unique/rental/rental-moog-subsequent-37.png",
  "rental-apollo-twin-x": "/images/market/unique/rental/rental-apollo-twin-x.png",
  "rental-shure-sm7b": "/images/market/unique/rental/rental-shure-sm7b.png",
  "rental-roland-td17kvx": "/images/market/unique/rental/rental-roland-td17kvx.png",
  "service-mastering-vinyl": "/images/market/unique/services/service-mastering-vinyl.png",
  "service-mix-stems-immersive": "/images/market/unique/services/service-mix-stems-immersive.png",
  "service-edit-podcast": "/images/market/unique/services/service-edit-podcast.png",
  "service-recording-vocals": "/images/market/unique/services/service-recording-vocals.png",
};

export function getMarketWallImage(productId: string, fallbackImageUrl: string) {
  return MARKET_WALL_IMAGE_OVERRIDES[productId] ?? fallbackImageUrl;
}
