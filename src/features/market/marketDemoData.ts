import { MARKET_EXPANSION_COLLECTIVE_PRODUCTS } from "./marketExpansionCollective";
import { marketEditorialExpansionProducts } from "./marketExpansionEditorial";
import {
  MARKET_EXPANSION_NEW_PRODUCTS,
  MARKET_EXPANSION_USED_PRODUCTS,
} from "./marketExpansionNewUsed";
import {
  marketRentalExpansionProducts,
  marketServiceExpansionProducts,
} from "./marketExpansionRentalServices";
import { marketWave2EditorialProducts } from "./marketExpansionWave2Editorial";
import { MARKET_EXPANSION_WAVE2_COLLECTIVE_PRODUCTS } from "./marketExpansionWave2Collective";
import {
  marketWave2NewProducts,
  marketWave2UsedProducts,
} from "./marketExpansionWave2NewUsed";
import {
  marketWave2RentalProducts,
  marketWave2ServiceProducts,
} from "./marketExpansionWave2RentalServices";
import { getMarketWallImage } from "./marketWallImageOverrides";
import { getMarketSceneImage } from "./marketSceneLibrary";

export type MarketPillarId = "new" | "used" | "rental" | "services" | "collective";

export type MarketPillarLabel = "Neuf" | "Occasion" | "Location" | "Services" | "Achat groupé";

export type MarketCategory =
  | "Synthétiseurs"
  | "Interfaces audio"
  | "Microphones"
  | "Casques"
  | "Guitares"
  | "Batteries électroniques"
  | "DJ & vinyle"
  | "Contrôleurs MIDI"
  | "Monitoring"
  | "Enregistreurs"
  | "Mix & mastering"
  | "Cours & coaching"
  | "Billetterie"
  | "Rooms & studios"
  | "Autres";

export type MarketCondition = "new" | "mint" | "excellent" | "very-good";
export type MarketAvailabilityBucket = "now" | "7-days" | "30-days" | "later";

export interface MarketPillar {
  id: MarketPillarId;
  label: MarketPillarLabel;
  eyebrow: string;
  description: string;
  accent: string;
}

export interface MarketMoney {
  amount: number;
  currency: "EUR";
  unit: "item" | "day" | "session" | "ticket" | "participant";
  compareAtAmount?: number;
}

export interface MarketRating {
  score: number;
  count: number;
}

export interface MarketCartState {
  eligible: boolean;
  quantity: number;
  maxQuantity: number;
}

export interface MarketRentalTerms {
  dailyPrice: number;
  weekendPrice: number;
  weeklyPrice: number;
  deposit: number;
  minimumDays: number;
  availableFrom: string;
  instantBook: boolean;
}

export interface MarketCollectiveProgress {
  joined: number;
  target: number;
  progressPercent: number;
  daysRemaining: number;
  retailUnitPrice: number;
  unlockedUnitPrice: number;
  savingsPercent: number;
}

export interface MarketServiceTerms {
  kind: "production" | "coaching" | "ticket" | "room";
  format: string;
  durationLabel: string;
  deliveryLabel: string;
  nextAvailability: string;
  /** Canonical ISO timestamp when the offer targets a fixed event. */
  eventDate?: string | null;
  capacity?: number | null;
  venueName?: string | null;
  includedEquipment?: string | null;
}

export interface MarketNewTerms {
  stock: number;
  warrantyMonths: number;
}

export interface MarketUsedTerms {
  purchaseYear: number | null;
  negotiable: boolean;
  conditionNotes: string | null;
}

export interface MarketSeller {
  id: string;
  profileId?: string;
  name: string;
  kind: "store" | "artist" | "studio";
  monogram: string;
  verified: boolean;
  rating: MarketRating;
  salesCount: number;
  responseTime: string;
  /** Authoritative public avatar. Null means none is publicly exposed. */
  avatarUrl?: string | null;
  /** Authoritative public grade. Null means the seller chose to hide it. */
  gradeLevel?: number | null;
}

export interface MarketLocation {
  id: string;
  city: string;
  area: string;
  countryCode: "FR";
  pickup: boolean;
  shipping: boolean;
  /** Canonical server capability. Demo fixtures may omit it. */
  remote?: boolean;
  distanceKm: number;
}

export interface MarketProduct {
  id: string;
  slug: string;
  pillarId: MarketPillarId;
  category: MarketCategory;
  brand: string;
  model: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  condition: MarketCondition;
  conditionLabel: string;
  price: MarketMoney;
  sellerId: string;
  locationId: string;
  rating: MarketRating;
  favorite: boolean;
  cart: MarketCartState;
  /** Canonical server shipping price. Demo products may omit it. */
  shippingAmount?: number;
  /** Server-normalized seller preparation time. */
  preparationDays?: number;
  /** Canonical server availability; demo products calculate it locally. */
  availabilityBucket?: MarketAvailabilityBucket;
  /** Authoritative subtype details for live catalogue listings. */
  newTerms?: MarketNewTerms | null;
  usedTerms?: MarketUsedTerms | null;
  /** Authoritative seller choice for used listings. */
  negotiable?: boolean;
  rental: MarketRentalTerms | null;
  service?: MarketServiceTerms | null;
  collective: MarketCollectiveProgress | null;
  featured: boolean;
  badge?: string;
}

export interface MarketProductView extends MarketProduct {
  seller: MarketSeller;
  location: MarketLocation;
}

export const MARKET_PILLARS = [
  {
    id: "new",
    label: "Neuf",
    eyebrow: "Sélection studio",
    description: "Les références neuves qui comptent, garanties et prêtes à jouer.",
    accent: "#5B7CFF",
  },
  {
    id: "used",
    label: "Occasion",
    eyebrow: "Trouvailles vérifiées",
    description: "Du matériel testé, documenté et vendu par la communauté.",
    accent: "#E9A23B",
  },
  {
    id: "rental",
    label: "Location",
    eyebrow: "Pour la prochaine session",
    description: "Réservez à la journée ou à la semaine, près de votre studio.",
    accent: "#27C2D1",
  },
  {
    id: "services",
    label: "Services",
    eyebrow: "Talents & expériences",
    description: "Cours, coaching, prestations, billetterie et Rooms proposés par la communauté.",
    accent: "#C65BFF",
  },
  {
    id: "collective",
    label: "Achat groupé",
    eyebrow: "Le prix baisse ensemble",
    description: "Rejoignez une commande collective et débloquez le tarif cible.",
    accent: "#39C889",
  },
] as const satisfies readonly MarketPillar[];

export const marketSellers: Record<string, MarketSeller> = {
  "synth-district": {
    id: "synth-district",
    name: "Synth District",
    kind: "store",
    monogram: "SD",
    verified: true,
    rating: { score: 4.9, count: 318 },
    salesCount: 1248,
    responseTime: "Répond en 12 min",
  },
  "studio-supply": {
    id: "studio-supply",
    name: "Studio Supply",
    kind: "store",
    monogram: "SS",
    verified: true,
    rating: { score: 4.8, count: 264 },
    salesCount: 897,
    responseTime: "Répond en 20 min",
  },
  "broadcast-lab": {
    id: "broadcast-lab",
    name: "Broadcast Lab",
    kind: "studio",
    monogram: "BL",
    verified: true,
    rating: { score: 4.9, count: 186 },
    salesCount: 612,
    responseTime: "Répond en 35 min",
  },
  "elise-tones": {
    id: "elise-tones",
    name: "Élise Tones",
    kind: "artist",
    monogram: "ET",
    verified: true,
    rating: { score: 4.9, count: 74 },
    salesCount: 43,
    responseTime: "Répond en 1 h",
  },
  "vinyl-circuit": {
    id: "vinyl-circuit",
    name: "Vinyl Circuit",
    kind: "store",
    monogram: "VC",
    verified: true,
    rating: { score: 4.8, count: 147 },
    salesCount: 504,
    responseTime: "Répond en 25 min",
  },
  "session-club": {
    id: "session-club",
    name: "Session Club",
    kind: "studio",
    monogram: "SC",
    verified: true,
    rating: { score: 4.9, count: 221 },
    salesCount: 781,
    responseTime: "Répond en 8 min",
  },
  "modular-corner": {
    id: "modular-corner",
    name: "Modular Corner",
    kind: "store",
    monogram: "MC",
    verified: true,
    rating: { score: 4.9, count: 205 },
    salesCount: 834,
    responseTime: "Répond en 15 min",
  },
  "guitar-house": {
    id: "guitar-house",
    name: "Guitar House",
    kind: "store",
    monogram: "GH",
    verified: true,
    rating: { score: 4.8, count: 193 },
    salesCount: 729,
    responseTime: "Répond en 18 min",
  },
  "waveform-studio": {
    id: "waveform-studio",
    name: "Waveform Studio",
    kind: "studio",
    monogram: "WS",
    verified: true,
    rating: { score: 4.9, count: 156 },
    salesCount: 486,
    responseTime: "Répond en 30 min",
  },
  "noemie-sound": {
    id: "noemie-sound",
    name: "Noémie Sound",
    kind: "artist",
    monogram: "NS",
    verified: true,
    rating: { score: 4.9, count: 98 },
    salesCount: 67,
    responseTime: "Répond en 45 min",
  },
  "rhythm-workshop": {
    id: "rhythm-workshop",
    name: "Rhythm Workshop",
    kind: "studio",
    monogram: "RW",
    verified: true,
    rating: { score: 4.8, count: 132 },
    salesCount: 391,
    responseTime: "Répond en 22 min",
  },
  "atlas-audio": {
    id: "atlas-audio",
    name: "Atlas Audio",
    kind: "store",
    monogram: "AA",
    verified: true,
    rating: { score: 4.8, count: 241 },
    salesCount: 915,
    responseTime: "Répond en 10 min",
  },
  "room-collective": {
    id: "room-collective",
    name: "Room Collective",
    kind: "studio",
    monogram: "RC",
    verified: true,
    rating: { score: 4.9, count: 174 },
    salesCount: 558,
    responseTime: "Répond en 16 min",
  },
  "camille-mix": {
    id: "camille-mix",
    name: "Camille Mix",
    kind: "artist",
    monogram: "CM",
    verified: true,
    rating: { score: 5, count: 86 },
    salesCount: 104,
    responseTime: "Répond en 1 h",
  },
};

export const marketLocations: Record<string, MarketLocation> = {
  "paris-11": { id: "paris-11", city: "Paris", area: "11e", countryCode: "FR", pickup: true, shipping: true, distanceKm: 3.2 },
  "lyon-2": { id: "lyon-2", city: "Lyon", area: "2e", countryCode: "FR", pickup: true, shipping: true, distanceKm: 7.8 },
  "bordeaux-chartrons": { id: "bordeaux-chartrons", city: "Bordeaux", area: "Chartrons", countryCode: "FR", pickup: true, shipping: true, distanceKm: 11.4 },
  "marseille-cours-julien": { id: "marseille-cours-julien", city: "Marseille", area: "Cours Julien", countryCode: "FR", pickup: true, shipping: false, distanceKm: 15.1 },
  "nantes-centre": { id: "nantes-centre", city: "Nantes", area: "Centre", countryCode: "FR", pickup: true, shipping: true, distanceKm: 18.6 },
  "toulouse-saint-cyprien": { id: "toulouse-saint-cyprien", city: "Toulouse", area: "Saint-Cyprien", countryCode: "FR", pickup: true, shipping: true, distanceKm: 22.3 },
  "lille-wazemmes": { id: "lille-wazemmes", city: "Lille", area: "Wazemmes", countryCode: "FR", pickup: true, shipping: true, distanceKm: 26.7 },
  "strasbourg-krutenau": { id: "strasbourg-krutenau", city: "Strasbourg", area: "Krutenau", countryCode: "FR", pickup: true, shipping: true, distanceKm: 31.2 },
  "rennes-centre": { id: "rennes-centre", city: "Rennes", area: "Centre", countryCode: "FR", pickup: true, shipping: true, distanceKm: 34.8 },
  "montpellier-beaux-arts": { id: "montpellier-beaux-arts", city: "Montpellier", area: "Beaux-Arts", countryCode: "FR", pickup: true, shipping: true, distanceKm: 39.1 },
  "grenoble-bouchayer": { id: "grenoble-bouchayer", city: "Grenoble", area: "Bouchayer-Viallet", countryCode: "FR", pickup: true, shipping: false, distanceKm: 43.6 },
  "nice-port": { id: "nice-port", city: "Nice", area: "Le Port", countryCode: "FR", pickup: true, shipping: true, distanceKm: 48.4 },
  "rouen-rive-droite": { id: "rouen-rive-droite", city: "Rouen", area: "Rive droite", countryCode: "FR", pickup: true, shipping: true, distanceKm: 54.2 },
  "dijon-centre": { id: "dijon-centre", city: "Dijon", area: "Centre", countryCode: "FR", pickup: true, shipping: true, distanceKm: 59.7 },
  "angers-doutre": { id: "angers-doutre", city: "Angers", area: "La Doutre", countryCode: "FR", pickup: true, shipping: true, distanceKm: 64.5 },
  "clermont-jaude": { id: "clermont-jaude", city: "Clermont-Ferrand", area: "Jaude", countryCode: "FR", pickup: true, shipping: false, distanceKm: 71.3 },
};

const purchaseCart = (maxQuantity: number, quantity = 0): MarketCartState => ({
  eligible: true,
  quantity,
  maxQuantity,
});

const actionOnly = (): MarketCartState => ({
  eligible: false,
  quantity: 0,
  maxQuantity: 0,
});

type MarketDemoProductSeed = {
  id: string;
  pillarId: MarketPillarId;
  category: MarketCategory;
  brand: string;
  model: string;
  title: string;
  image: string;
  price: number;
  compareAtAmount?: number;
  sellerId: string;
  locationId: string;
  description?: string;
  condition?: MarketCondition;
  conditionLabel?: string;
  badge?: string;
  rental?: MarketRentalTerms | null;
  service?: MarketServiceTerms | null;
  collective?: MarketCollectiveProgress | null;
};

function createMarketDemoProduct(seed: MarketDemoProductSeed): MarketProduct {
  const isPurchasable = seed.pillarId === "new" || seed.pillarId === "used";
  const unit = seed.pillarId === "rental" ? "day" : "item";

  return {
    id: seed.id,
    slug: seed.id,
    pillarId: seed.pillarId,
    category: seed.category,
    brand: seed.brand,
    model: seed.model,
    title: seed.title,
    description: seed.description ?? `${seed.title}, sélectionné et vérifié pour le Market Meewav.`,
    imageUrl: `/images/market/${seed.image}`,
    imageAlt: `${seed.title} sur le Market Meewav`,
    condition: seed.condition ?? (seed.pillarId === "used" ? "excellent" : "new"),
    conditionLabel: seed.conditionLabel ?? (seed.pillarId === "used" ? "Excellent · Vérifié" : "Disponible · Vérifié"),
    price: {
      amount: seed.price,
      compareAtAmount: seed.compareAtAmount,
      currency: "EUR",
      unit,
    },
    sellerId: seed.sellerId,
    locationId: seed.locationId,
    rating: { score: 4.8, count: 84 },
    favorite: false,
    cart: isPurchasable ? purchaseCart(seed.pillarId === "new" ? 8 : 1) : actionOnly(),
    rental: seed.rental ?? null,
    service: seed.service ?? null,
    collective: seed.collective ?? null,
    featured: false,
    badge: seed.badge,
  };
}

const marketCatalogExtensions: MarketProduct[] = [
  createMarketDemoProduct({ id: "new-focusrite-scarlett", pillarId: "new", category: "Interfaces audio", brand: "Focusrite", model: "Scarlett 2i2 4th Gen", title: "Focusrite Scarlett 2i2", image: "focusrite-scarlett-2i2.jpg", price: 189, compareAtAmount: 219, sellerId: "studio-supply", locationId: "paris-11", badge: "Idéal home studio" }),
  createMarketDemoProduct({ id: "new-audient-id14", pillarId: "new", category: "Interfaces audio", brand: "Audient", model: "iD14 MKII", title: "Audient iD14 MKII", image: "audient-id14.jpg", price: 239, compareAtAmount: 269, sellerId: "broadcast-lab", locationId: "lyon-2" }),
  createMarketDemoProduct({ id: "new-neumann-tlm103", pillarId: "new", category: "Microphones", brand: "Neumann", model: "TLM 103", title: "Neumann TLM 103", image: "neumann-tlm103.jpg", price: 1099, compareAtAmount: 1199, sellerId: "broadcast-lab", locationId: "paris-11", badge: "Voix premium" }),
  createMarketDemoProduct({ id: "new-korg-minilogue", pillarId: "new", category: "Synthétiseurs", brand: "Korg", model: "Minilogue XD", title: "Korg Minilogue XD", image: "korg-minilogue-xd.jpg", price: 579, compareAtAmount: 649, sellerId: "synth-district", locationId: "toulouse-saint-cyprien" }),
  createMarketDemoProduct({ id: "new-nord-stage-4", pillarId: "new", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73", title: "Nord Stage 4 73", image: "nord-stage-4.jpg", price: 3999, compareAtAmount: 4299, sellerId: "synth-district", locationId: "nantes-centre", badge: "Scène pro" }),
  createMarketDemoProduct({ id: "new-pioneer-flx10", pillarId: "new", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-FLX10", title: "Pioneer DDJ-FLX10", image: "pioneer-ddj-flx10.jpg", price: 1599, compareAtAmount: 1699, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien" }),

  createMarketDemoProduct({ id: "used-gibson-les-paul", pillarId: "used", category: "Guitares", brand: "Gibson", model: "Les Paul Standard 60s", title: "Gibson Les Paul Standard", image: "gibson-les-paul-used.jpg", price: 1890, compareAtAmount: 2599, sellerId: "elise-tones", locationId: "paris-11", condition: "excellent", badge: "Réglée en atelier" }),
  createMarketDemoProduct({ id: "used-fender-telecaster", pillarId: "used", category: "Guitares", brand: "Fender", model: "Player Telecaster", title: "Fender Player Telecaster", image: "fender-telecaster-used.jpg", price: 649, compareAtAmount: 899, sellerId: "elise-tones", locationId: "bordeaux-chartrons", condition: "very-good" }),
  createMarketDemoProduct({ id: "used-prs-custom-24", pillarId: "used", category: "Guitares", brand: "PRS", model: "SE Custom 24", title: "PRS SE Custom 24", image: "prs-se-custom-24-used.jpg", price: 690, compareAtAmount: 949, sellerId: "session-club", locationId: "nantes-centre", condition: "mint", conditionLabel: "Comme neuve · Étui inclus" }),
  createMarketDemoProduct({ id: "used-adam-a7x", pillarId: "used", category: "Monitoring", brand: "Adam Audio", model: "A7X", title: "Paire Adam Audio A7X", image: "adam-a7x-used.jpg", price: 890, compareAtAmount: 1290, sellerId: "broadcast-lab", locationId: "lille-wazemmes", condition: "excellent", badge: "Paire testée" }),
  createMarketDemoProduct({ id: "used-pioneer-ddj1000", pillarId: "used", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-1000", title: "Pioneer DDJ-1000", image: "pioneer-ddj-1000-used.jpg", price: 1090, compareAtAmount: 1499, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", condition: "excellent" }),
  createMarketDemoProduct({ id: "used-zoom-h6", pillarId: "used", category: "Enregistreurs", brand: "Zoom", model: "H6 Black", title: "Zoom H6 Black", image: "zoom-h6-used.jpg", price: 225, compareAtAmount: 329, sellerId: "session-club", locationId: "lyon-2", condition: "very-good" }),

  createMarketDemoProduct({ id: "rental-neumann-tlm103", pillarId: "rental", category: "Microphones", brand: "Neumann", model: "TLM 103", title: "Neumann TLM 103", image: "neumann-tlm103.jpg", price: 32, sellerId: "broadcast-lab", locationId: "paris-11", badge: "Libre ce soir", rental: { dailyPrice: 32, weekendPrice: 74, weeklyPrice: 168, deposit: 650, minimumDays: 1, availableFrom: "2026-07-18", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-pioneer-ddj1000", pillarId: "rental", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-1000", title: "Pioneer DDJ-1000", image: "pioneer-ddj-1000-used.jpg", price: 55, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", rental: { dailyPrice: 55, weekendPrice: 129, weeklyPrice: 289, deposit: 900, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-nord-stage-4", pillarId: "rental", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73", title: "Nord Stage 4 73", image: "nord-stage-4.jpg", price: 89, sellerId: "session-club", locationId: "nantes-centre", badge: "Tournée", rental: { dailyPrice: 89, weekendPrice: 210, weeklyPrice: 460, deposit: 1800, minimumDays: 2, availableFrom: "2026-07-23", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-fender-strat", pillarId: "rental", category: "Guitares", brand: "Fender", model: "American Pro II", title: "Fender American Pro II", image: "fender-strat.jpg", price: 38, sellerId: "elise-tones", locationId: "paris-11", rental: { dailyPrice: 38, weekendPrice: 88, weeklyPrice: 195, deposit: 800, minimumDays: 1, availableFrom: "2026-07-21", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-zoom-h6", pillarId: "rental", category: "Enregistreurs", brand: "Zoom", model: "H6 Black", title: "Zoom H6 + capsule XY", image: "zoom-h6-used.jpg", price: 18, sellerId: "studio-supply", locationId: "lyon-2", rental: { dailyPrice: 18, weekendPrice: 42, weeklyPrice: 94, deposit: 220, minimumDays: 1, availableFrom: "2026-07-19", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-adam-a7x", pillarId: "rental", category: "Monitoring", brand: "Adam Audio", model: "A7X Pair", title: "Paire Adam A7X", image: "adam-a7x-used.jpg", price: 48, sellerId: "broadcast-lab", locationId: "lille-wazemmes", rental: { dailyPrice: 48, weekendPrice: 110, weeklyPrice: 249, deposit: 900, minimumDays: 2, availableFrom: "2026-07-24", instantBook: false } }),

  createMarketDemoProduct({ id: "service-vocal-coaching", pillarId: "services", category: "Cours & coaching", brand: "Solène Voice", model: "Coaching vocal", title: "Coaching voix & présence scénique", image: "service-vocal-coaching.jpg", price: 75, sellerId: "elise-tones", locationId: "paris-11", badge: "4 créneaux", service: { kind: "coaching", format: "Studio ou visio", durationLabel: "1 h 30", deliveryLabel: "Exercices personnalisés", nextAvailability: "Demain · 16 h" } }),
  createMarketDemoProduct({ id: "service-dj-coaching", pillarId: "services", category: "Cours & coaching", brand: "Vinyl Circuit", model: "Performance DJ", title: "Coaching performance DJ", image: "service-dj-coaching.jpg", price: 59, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", service: { kind: "coaching", format: "Présentiel", durationLabel: "2 heures", deliveryLabel: "Set enregistré", nextAvailability: "Samedi · 11 h" } }),
  createMarketDemoProduct({ id: "service-beatmaking-masterclass", pillarId: "services", category: "Cours & coaching", brand: "Session Club", model: "Masterclass beatmaking", title: "Masterclass beatmaking live", image: "service-beatmaking-masterclass.png", price: 29, sellerId: "session-club", locationId: "lyon-2", badge: "En direct", service: { kind: "coaching", format: "Room interactive", durationLabel: "2 h 30", deliveryLabel: "Replay 7 jours", nextAvailability: "Jeudi · 20 h" } }),
  createMarketDemoProduct({ id: "service-live-starlight", pillarId: "services", category: "Billetterie", brand: "Meewav Rooms", model: "Starlight Pass", title: "Live Room · Starlight", image: "service-live-room-starlight.png", price: 15, sellerId: "synth-district", locationId: "toulouse-saint-cyprien", badge: "Live", service: { kind: "ticket", format: "Room en direct", durationLabel: "75 minutes", deliveryLabel: "Backstage inclus", nextAvailability: "25 juillet · 21 h" } }),
  createMarketDemoProduct({ id: "service-podcast-studio", pillarId: "services", category: "Rooms & studios", brand: "Broadcast Lab", model: "Podcast Room", title: "Podcast Room + réalisation", image: "service-podcast-studio.jpg", price: 145, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", service: { kind: "room", format: "Présentiel", durationLabel: "2 heures", deliveryLabel: "Montage inclus", nextAvailability: "Lundi · 10 h" } }),

  createMarketDemoProduct({ id: "collective-apollo-twin", pillarId: "collective", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo Twin X", title: "Apollo Twin X Duo", image: "apollo-twin-x.jpg", price: 749, compareAtAmount: 899, sellerId: "studio-supply", locationId: "paris-11", badge: "-17%", collective: { joined: 18, target: 24, progressPercent: 75, daysRemaining: 5, retailUnitPrice: 899, unlockedUnitPrice: 749, savingsPercent: 17 } }),
  createMarketDemoProduct({ id: "collective-shure-sm7b", pillarId: "collective", category: "Microphones", brand: "Shure", model: "SM7B", title: "Shure SM7B", image: "shure-sm7b.jpg", price: 329, compareAtAmount: 389, sellerId: "broadcast-lab", locationId: "lille-wazemmes", collective: { joined: 42, target: 50, progressPercent: 84, daysRemaining: 2, retailUnitPrice: 389, unlockedUnitPrice: 329, savingsPercent: 15 } }),
  createMarketDemoProduct({ id: "collective-m-audio-oxygen", pillarId: "collective", category: "Contrôleurs MIDI", brand: "M-Audio", model: "Oxygen Pro 49", title: "M-Audio Oxygen Pro 49", image: "m-audio-oxygen-pro-49.jpg", price: 219, compareAtAmount: 279, sellerId: "synth-district", locationId: "nantes-centre", collective: { joined: 26, target: 36, progressPercent: 72, daysRemaining: 7, retailUnitPrice: 279, unlockedUnitPrice: 219, savingsPercent: 22 } }),
  createMarketDemoProduct({ id: "collective-ath-m50x", pillarId: "collective", category: "Casques", brand: "Audio-Technica", model: "ATH-M50x", title: "Audio-Technica ATH-M50x", image: "audio-technica-m50x.jpg", price: 119, compareAtAmount: 159, sellerId: "studio-supply", locationId: "lyon-2", collective: { joined: 71, target: 90, progressPercent: 79, daysRemaining: 6, retailUnitPrice: 159, unlockedUnitPrice: 119, savingsPercent: 25 } }),
  createMarketDemoProduct({ id: "collective-rode-nt1a", pillarId: "collective", category: "Microphones", brand: "RØDE", model: "NT1-A", title: "RØDE NT1-A Studio Pack", image: "rode-nt1a.jpg", price: 159, compareAtAmount: 219, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", collective: { joined: 34, target: 48, progressPercent: 71, daysRemaining: 8, retailUnitPrice: 219, unlockedUnitPrice: 159, savingsPercent: 27 } }),
  createMarketDemoProduct({ id: "collective-nord-stage", pillarId: "collective", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73", title: "Nord Stage 4 73", image: "nord-stage-4.jpg", price: 3590, compareAtAmount: 3999, sellerId: "synth-district", locationId: "paris-11", badge: "Palier premium", collective: { joined: 8, target: 12, progressPercent: 67, daysRemaining: 10, retailUnitPrice: 3999, unlockedUnitPrice: 3590, savingsPercent: 10 } }),
];

const newCatalogWallProducts = [
  createMarketDemoProduct({ id: "new-moog-subsequent-performance", pillarId: "new", category: "Synthétiseurs", brand: "Moog", model: "Subsequent 37 Performance Pack", title: "Moog Subsequent 37 · Pack performance", image: "moog-subsequent-37.jpg", price: 1949, compareAtAmount: 2199, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Housse offerte" }),
  createMarketDemoProduct({ id: "new-arturia-minifreak-stellar", pillarId: "new", category: "Synthétiseurs", brand: "Arturia", model: "MiniFreak Stellar", title: "Arturia MiniFreak Stellar", image: "arturia-minifreak.jpg", price: 629, compareAtAmount: 699, sellerId: "modular-corner", locationId: "rennes-centre", badge: "Édition Stellar" }),
  createMarketDemoProduct({ id: "new-korg-minilogue-bass-pack", pillarId: "new", category: "Synthétiseurs", brand: "Korg", model: "Minilogue XD Bass Pack", title: "Korg Minilogue XD · Pack bass music", image: "korg-minilogue-xd.jpg", price: 619, compareAtAmount: 699, sellerId: "synth-district", locationId: "montpellier-beaux-arts" }),
  createMarketDemoProduct({ id: "new-nord-stage4-studio-bundle", pillarId: "new", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73 Studio Bundle", title: "Nord Stage 4 73 · Bundle studio", image: "nord-stage-4.jpg", price: 4099, compareAtAmount: 4499, sellerId: "atlas-audio", locationId: "grenoble-bouchayer", badge: "Pédale incluse" }),
  createMarketDemoProduct({ id: "new-audient-id14-creator-pack", pillarId: "new", category: "Interfaces audio", brand: "Audient", model: "iD14 MKII Creator Pack", title: "Audient iD14 MKII · Creator Pack", image: "audient-id14.jpg", price: 289, compareAtAmount: 329, sellerId: "waveform-studio", locationId: "nice-port", badge: "Pack créateur" }),
  createMarketDemoProduct({ id: "new-focusrite-scarlett-vocal", pillarId: "new", category: "Interfaces audio", brand: "Focusrite", model: "Scarlett 2i2 Vocal Studio", title: "Focusrite Scarlett 2i2 · Vocal Studio", image: "focusrite-scarlett-2i2.jpg", price: 279, compareAtAmount: 319, sellerId: "studio-supply", locationId: "rouen-rive-droite" }),
  createMarketDemoProduct({ id: "new-apollo-twin-heritage", pillarId: "new", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo Twin X Heritage", title: "Apollo Twin X Duo · Heritage Edition", image: "apollo-twin-x.jpg", price: 949, compareAtAmount: 1049, sellerId: "atlas-audio", locationId: "dijon-centre", badge: "Plugins Heritage" }),
  createMarketDemoProduct({ id: "new-shure-sm7b-broadcast-kit", pillarId: "new", category: "Microphones", brand: "Shure", model: "SM7B Broadcast Kit", title: "Shure SM7B · Kit broadcast", image: "shure-sm7b.jpg", price: 469, compareAtAmount: 519, sellerId: "broadcast-lab", locationId: "angers-doutre", badge: "Bras inclus" }),
  createMarketDemoProduct({ id: "new-neumann-tlm103-vocal-set", pillarId: "new", category: "Microphones", brand: "Neumann", model: "TLM 103 Vocal Set", title: "Neumann TLM 103 · Vocal Set", image: "neumann-tlm103.jpg", price: 1199, compareAtAmount: 1299, sellerId: "waveform-studio", locationId: "clermont-jaude" }),
  createMarketDemoProduct({ id: "new-rode-nt1a-complete", pillarId: "new", category: "Microphones", brand: "RØDE", model: "NT1-A Complete Studio Kit", title: "RØDE NT1-A · Kit studio complet", image: "rode-nt1a.jpg", price: 229, compareAtAmount: 269, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", badge: "Prêt à enregistrer" }),
  createMarketDemoProduct({ id: "new-beyerdynamic-dt770-250", pillarId: "new", category: "Casques", brand: "Beyerdynamic", model: "DT 770 Pro 250 Ω", title: "Beyerdynamic DT 770 Pro · 250 Ω", image: "beyerdynamic-dt770.jpg", price: 155, compareAtAmount: 179, sellerId: "studio-supply", locationId: "strasbourg-krutenau" }),
  createMarketDemoProduct({ id: "new-ath-m50x-limited-blue", pillarId: "new", category: "Casques", brand: "Audio-Technica", model: "ATH-M50x LAB Blue", title: "Audio-Technica ATH-M50x · LAB Blue", image: "audio-technica-m50x.jpg", price: 169, compareAtAmount: 189, sellerId: "atlas-audio", locationId: "rennes-centre", badge: "Coloris limité" }),
  createMarketDemoProduct({ id: "new-fender-strat-player-ii", pillarId: "new", category: "Guitares", brand: "Fender", model: "Player II Stratocaster", title: "Fender Player II Stratocaster", image: "fender-strat.jpg", price: 849, compareAtAmount: 929, sellerId: "guitar-house", locationId: "montpellier-beaux-arts", badge: "Réglage offert" }),
  createMarketDemoProduct({ id: "new-fender-telecaster-player-plus", pillarId: "new", category: "Guitares", brand: "Fender", model: "Player Plus Telecaster", title: "Fender Player Plus Telecaster", image: "fender-telecaster-used.jpg", price: 1049, compareAtAmount: 1149, sellerId: "guitar-house", locationId: "nice-port" }),
  createMarketDemoProduct({ id: "new-gibson-lespaul-modern", pillarId: "new", category: "Guitares", brand: "Gibson", model: "Les Paul Modern Lite", title: "Gibson Les Paul Modern Lite", image: "gibson-les-paul-used.jpg", price: 1699, compareAtAmount: 1899, sellerId: "guitar-house", locationId: "dijon-centre", badge: "Étui rigide" }),
  createMarketDemoProduct({ id: "new-roland-td17kvx-stage-pack", pillarId: "new", category: "Batteries électroniques", brand: "Roland", model: "TD-17KVX2 Stage Pack", title: "Roland TD-17KVX2 · Pack scène", image: "roland-td17kvx.jpg", price: 1899, compareAtAmount: 2099, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", badge: "Hardware inclus" }),
  createMarketDemoProduct({ id: "new-pioneer-flx10-flightcase", pillarId: "new", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-FLX10 Flight Pack", title: "Pioneer DDJ-FLX10 · Flight Pack", image: "pioneer-ddj-flx10.jpg", price: 1749, compareAtAmount: 1899, sellerId: "vinyl-circuit", locationId: "rouen-rive-droite" }),
  createMarketDemoProduct({ id: "new-technics-sl1200mk7-club", pillarId: "new", category: "DJ & vinyle", brand: "Technics", model: "SL-1200MK7 Club Edition", title: "Technics SL-1200MK7 · Club Edition", image: "technics-sl1200.jpg", price: 999, compareAtAmount: 1099, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "Cellule incluse" }),
  createMarketDemoProduct({ id: "new-astra-graphite-16", pillarId: "new", category: "Synthétiseurs", brand: "Astra Audio", model: "Graphite 16", title: "Astra Graphite 16 · Sampler workstation", description: "Sampler autonome et station de production avec 16 pads sensibles, écran tactile et séquenceur multipiste.", image: "sampler-workstation-graphite-v1.webp", price: 1299, compareAtAmount: 1399, sellerId: "modular-corner", locationId: "angers-doutre", badge: "Nouveauté" }),
  createMarketDemoProduct({ id: "new-adam-a7x-matched-pair", pillarId: "new", category: "Monitoring", brand: "Adam Audio", model: "A7X Matched Pair", title: "Adam Audio A7X · Paire appairée", image: "adam-a7x-used.jpg", price: 1299, compareAtAmount: 1449, sellerId: "waveform-studio", locationId: "clermont-jaude", badge: "Paire appairée" }),
] satisfies MarketProduct[];

const usedCatalogWallProducts = [
  createMarketDemoProduct({ id: "used-moog-subsequent-tour", pillarId: "used", category: "Synthétiseurs", brand: "Moog", model: "Subsequent 37 Tour Case", title: "Moog Subsequent 37 · Flight case", image: "moog-subsequent-37.jpg", price: 1490, compareAtAmount: 2099, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "excellent", conditionLabel: "Excellent · Révisé en juillet", badge: "Flight case inclus" }),
  createMarketDemoProduct({ id: "used-arturia-minifreak-stellar", pillarId: "used", category: "Synthétiseurs", brand: "Arturia", model: "MiniFreak Stellar", title: "Arturia MiniFreak Stellar · Comme neuf", image: "arturia-minifreak.jpg", price: 510, compareAtAmount: 699, sellerId: "modular-corner", locationId: "strasbourg-krutenau", condition: "mint", conditionLabel: "Comme neuf · Boîte complète" }),
  createMarketDemoProduct({ id: "used-korg-minilogue-white", pillarId: "used", category: "Synthétiseurs", brand: "Korg", model: "Minilogue XD Pearl White", title: "Korg Minilogue XD · Pearl White", image: "korg-minilogue-xd.jpg", price: 469, compareAtAmount: 649, sellerId: "noemie-sound", locationId: "montpellier-beaux-arts", condition: "excellent", conditionLabel: "Excellent · Firmware à jour", badge: "Série limitée" }),
  createMarketDemoProduct({ id: "used-nord-stage4-compact", pillarId: "used", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 Compact", title: "Nord Stage 4 Compact · Housse", image: "nord-stage-4.jpg", price: 3190, compareAtAmount: 4299, sellerId: "session-club", locationId: "grenoble-bouchayer", condition: "very-good", conditionLabel: "Très bon · Traces de tournée" }),
  createMarketDemoProduct({ id: "used-audient-id14-mkii", pillarId: "used", category: "Interfaces audio", brand: "Audient", model: "iD14 MKII", title: "Audient iD14 MKII · Première main", image: "audient-id14.jpg", price: 175, compareAtAmount: 269, sellerId: "camille-mix", locationId: "nice-port", condition: "mint", conditionLabel: "Comme neuve · Facture incluse" }),
  createMarketDemoProduct({ id: "used-focusrite-scarlett-2i2", pillarId: "used", category: "Interfaces audio", brand: "Focusrite", model: "Scarlett 2i2 4th Gen", title: "Focusrite Scarlett 2i2 · 4e génération", image: "focusrite-scarlett-2i2.jpg", price: 135, compareAtAmount: 219, sellerId: "camille-mix", locationId: "rouen-rive-droite", condition: "excellent", conditionLabel: "Excellent · Câble USB-C" }),
  createMarketDemoProduct({ id: "used-apollo-twin-heritage", pillarId: "used", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo Twin X Heritage", title: "Apollo Twin X Heritage · Licence transférable", image: "apollo-twin-x.jpg", price: 690, compareAtAmount: 999, sellerId: "waveform-studio", locationId: "dijon-centre", condition: "excellent", conditionLabel: "Excellent · Plugins transférables", badge: "Testée en studio" }),
  createMarketDemoProduct({ id: "used-shure-sm7b-cloudlifter", pillarId: "used", category: "Microphones", brand: "Shure", model: "SM7B + Cloudlifter CL-1", title: "Shure SM7B + Cloudlifter CL-1", image: "shure-sm7b.jpg", price: 335, compareAtAmount: 499, sellerId: "room-collective", locationId: "angers-doutre", condition: "very-good", conditionLabel: "Très bon · Mousse neuve" }),
  createMarketDemoProduct({ id: "used-neumann-tlm103-case", pillarId: "used", category: "Microphones", brand: "Neumann", model: "TLM 103 Nickel", title: "Neumann TLM 103 · Mallette d'origine", image: "neumann-tlm103.jpg", price: 835, compareAtAmount: 1199, sellerId: "waveform-studio", locationId: "clermont-jaude", condition: "excellent", conditionLabel: "Excellent · Capsule contrôlée", badge: "Garantie 6 mois" }),
  createMarketDemoProduct({ id: "used-rode-nt1a-studio-kit", pillarId: "used", category: "Microphones", brand: "RØDE", model: "NT1-A Studio Kit", title: "RØDE NT1-A · Studio Kit", image: "rode-nt1a.jpg", price: 125, compareAtAmount: 219, sellerId: "camille-mix", locationId: "bordeaux-chartrons", condition: "very-good", conditionLabel: "Très bon · Suspension incluse" }),
  createMarketDemoProduct({ id: "used-beyerdynamic-dt770-250", pillarId: "used", category: "Casques", brand: "Beyerdynamic", model: "DT 770 Pro 250 Ω", title: "Beyerdynamic DT 770 Pro 250 Ω · Velours neufs", image: "beyerdynamic-dt770.jpg", price: 92, compareAtAmount: 169, sellerId: "atlas-audio", locationId: "strasbourg-krutenau", condition: "excellent", conditionLabel: "Excellent · Coussinets neufs" }),
  createMarketDemoProduct({ id: "used-ath-m50x-blue", pillarId: "used", category: "Casques", brand: "Audio-Technica", model: "ATH-M50x Blue", title: "Audio-Technica ATH-M50x · Bleu nuit", image: "audio-technica-m50x.jpg", price: 99, compareAtAmount: 159, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "very-good", conditionLabel: "Très bon · Trois câbles" }),
  createMarketDemoProduct({ id: "used-fender-strat-sienna", pillarId: "used", category: "Guitares", brand: "Fender", model: "American Pro II Sienna Sunburst", title: "Fender American Pro II · Sienna Sunburst", image: "fender-strat.jpg", price: 1390, compareAtAmount: 1999, sellerId: "guitar-house", locationId: "montpellier-beaux-arts", condition: "mint", conditionLabel: "Comme neuve · Étui rigide", badge: "Réglage Plek" }),
  createMarketDemoProduct({ id: "used-gibson-lespaul-goldtop", pillarId: "used", category: "Guitares", brand: "Gibson", model: "Les Paul Standard 50s Goldtop", title: "Gibson Les Paul Standard · Goldtop", image: "gibson-les-paul-used.jpg", price: 2050, compareAtAmount: 2799, sellerId: "guitar-house", locationId: "nice-port", condition: "excellent", conditionLabel: "Excellent · Micros d'origine" }),
  createMarketDemoProduct({ id: "used-roland-td17kvx2", pillarId: "used", category: "Batteries électroniques", brand: "Roland", model: "TD-17KVX2", title: "Roland TD-17KVX2 · Double pédale", image: "roland-td17kvx.jpg", price: 1260, compareAtAmount: 1799, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", condition: "excellent", conditionLabel: "Excellent · Peaux contrôlées", badge: "Double pédale" }),
  createMarketDemoProduct({ id: "used-pioneer-flx10", pillarId: "used", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-FLX10", title: "Pioneer DDJ-FLX10 · Flight case", image: "pioneer-ddj-flx10.jpg", price: 1240, compareAtAmount: 1699, sellerId: "vinyl-circuit", locationId: "rouen-rive-droite", condition: "very-good", conditionLabel: "Très bon · Faders testés" }),
  createMarketDemoProduct({ id: "used-technics-sl1200-pair", pillarId: "used", category: "DJ & vinyle", brand: "Technics", model: "SL-1200 MK2 Pair", title: "Paire Technics SL-1200 MK2 · Révisées", image: "technics-sl1200.jpg", price: 1450, compareAtAmount: 1840, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", condition: "excellent", conditionLabel: "Excellent · Pitchs calibrés", badge: "Paire appairée" }),
  createMarketDemoProduct({ id: "used-m-audio-oxygen-pro", pillarId: "used", category: "Contrôleurs MIDI", brand: "M-Audio", model: "Oxygen Pro 49", title: "M-Audio Oxygen Pro 49 · Housse", image: "m-audio-oxygen-pro-49.jpg", price: 165, compareAtAmount: 279, sellerId: "modular-corner", locationId: "angers-doutre", condition: "mint", conditionLabel: "Comme neuf · Housse incluse" }),
  createMarketDemoProduct({ id: "used-adam-a7x-white", pillarId: "used", category: "Monitoring", brand: "Adam Audio", model: "A7X White Pair", title: "Paire Adam A7X · Édition blanche", image: "adam-a7x-used.jpg", price: 940, compareAtAmount: 1390, sellerId: "waveform-studio", locationId: "clermont-jaude", condition: "excellent", conditionLabel: "Excellent · Mesures fournies", badge: "Édition blanche" }),
  createMarketDemoProduct({ id: "used-zoom-h6-field-kit", pillarId: "used", category: "Enregistreurs", brand: "Zoom", model: "H6 Field Kit", title: "Zoom H6 · Kit tournage complet", image: "zoom-h6-used.jpg", price: 255, compareAtAmount: 389, sellerId: "room-collective", locationId: "bordeaux-chartrons", condition: "very-good", conditionLabel: "Très bon · Bonnette incluse" }),
] satisfies MarketProduct[];

const rentalCatalogWallProducts = [
  createMarketDemoProduct({ id: "rental-moog-subsequent-flightcase", pillarId: "rental", category: "Synthétiseurs", brand: "Moog", model: "Subsequent 37 Tour Pack", title: "Moog Subsequent 37 + flight case", image: "moog-subsequent-37.jpg", price: 49, sellerId: "modular-corner", locationId: "strasbourg-krutenau", condition: "excellent", conditionLabel: "Parc pro · Calibré", badge: "Livraison possible", rental: { dailyPrice: 49, weekendPrice: 112, weeklyPrice: 248, deposit: 900, minimumDays: 1, availableFrom: "2026-07-21", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-arturia-minifreak-stellar", pillarId: "rental", category: "Synthétiseurs", brand: "Arturia", model: "MiniFreak Stellar", title: "Arturia MiniFreak Stellar + housse", image: "arturia-minifreak.jpg", price: 24, sellerId: "noemie-sound", locationId: "rennes-centre", condition: "excellent", conditionLabel: "Parc artiste · Contrôlé", rental: { dailyPrice: 24, weekendPrice: 55, weeklyPrice: 119, deposit: 380, minimumDays: 1, availableFrom: "2026-07-19", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-korg-minilogue-stand", pillarId: "rental", category: "Synthétiseurs", brand: "Korg", model: "Minilogue XD Live Pack", title: "Korg Minilogue XD + stand", image: "korg-minilogue-xd.jpg", price: 27, sellerId: "modular-corner", locationId: "montpellier-beaux-arts", condition: "excellent", conditionLabel: "Parc scène · Contrôlé", badge: "Disponible ce week-end", rental: { dailyPrice: 27, weekendPrice: 62, weeklyPrice: 134, deposit: 420, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-nord-stage4-pedalboard", pillarId: "rental", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73 Touring Pack", title: "Nord Stage 4 73 + pedalboard", image: "nord-stage-4.jpg", price: 99, sellerId: "session-club", locationId: "grenoble-bouchayer", condition: "excellent", conditionLabel: "Parc tournée · Révisé", badge: "Pack tournée", rental: { dailyPrice: 99, weekendPrice: 229, weeklyPrice: 510, deposit: 2100, minimumDays: 2, availableFrom: "2026-07-26", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-audient-id14-travel", pillarId: "rental", category: "Interfaces audio", brand: "Audient", model: "iD14 MKII Travel Kit", title: "Audient iD14 MKII · Kit nomade", image: "audient-id14.jpg", price: 14, sellerId: "waveform-studio", locationId: "nice-port", condition: "excellent", conditionLabel: "Parc studio · Testée", rental: { dailyPrice: 14, weekendPrice: 32, weeklyPrice: 68, deposit: 180, minimumDays: 2, availableFrom: "2026-07-22", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-focusrite-mobile-vocal", pillarId: "rental", category: "Interfaces audio", brand: "Focusrite", model: "Scarlett 2i2 Mobile Vocal", title: "Scarlett 2i2 · Pack voix mobile", image: "focusrite-scarlett-2i2.jpg", price: 16, sellerId: "camille-mix", locationId: "rouen-rive-droite", condition: "excellent", conditionLabel: "Pack complet · Désinfecté", badge: "Micro inclus", rental: { dailyPrice: 16, weekendPrice: 36, weeklyPrice: 76, deposit: 220, minimumDays: 1, availableFrom: "2026-07-19", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-apollo-twin-mobile", pillarId: "rental", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo Twin X Mobile Pack", title: "Apollo Twin X Duo · Pack mobile", image: "apollo-twin-x.jpg", price: 34, sellerId: "atlas-audio", locationId: "dijon-centre", condition: "excellent", conditionLabel: "Parc studio · Plugins inclus", rental: { dailyPrice: 34, weekendPrice: 78, weeklyPrice: 172, deposit: 550, minimumDays: 1, availableFrom: "2026-07-24", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-shure-sm7b-podcast-duo", pillarId: "rental", category: "Microphones", brand: "Shure", model: "SM7B Podcast Duo", title: "Duo Shure SM7B · Pack podcast", image: "shure-sm7b.jpg", price: 29, sellerId: "broadcast-lab", locationId: "angers-doutre", condition: "excellent", conditionLabel: "Pack désinfecté · Contrôlé", badge: "2 micros", rental: { dailyPrice: 29, weekendPrice: 66, weeklyPrice: 142, deposit: 480, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-neumann-tlm103-stereo", pillarId: "rental", category: "Microphones", brand: "Neumann", model: "TLM 103 Stereo Pair", title: "Paire Neumann TLM 103 · Stéréo", image: "neumann-tlm103.jpg", price: 68, sellerId: "waveform-studio", locationId: "clermont-jaude", condition: "excellent", conditionLabel: "Paire appairée · Contrôlée", badge: "Paire appairée", rental: { dailyPrice: 68, weekendPrice: 158, weeklyPrice: 349, deposit: 1300, minimumDays: 2, availableFrom: "2026-07-28", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-rode-nt1a-voice-pack", pillarId: "rental", category: "Microphones", brand: "RØDE", model: "NT1-A Voice Pack", title: "RØDE NT1-A · Pack voix", image: "rode-nt1a.jpg", price: 11, sellerId: "room-collective", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Pack désinfecté · Complet", rental: { dailyPrice: 11, weekendPrice: 25, weeklyPrice: 54, deposit: 150, minimumDays: 2, availableFrom: "2026-07-19", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-beyerdynamic-six-pack", pillarId: "rental", category: "Casques", brand: "Beyerdynamic", model: "DT 770 Pro Six Pack", title: "6 casques Beyerdynamic DT 770 Pro", image: "beyerdynamic-dt770.jpg", price: 32, sellerId: "room-collective", locationId: "strasbourg-krutenau", condition: "very-good", conditionLabel: "Parc studio · Coussinets neufs", badge: "Pack groupe", rental: { dailyPrice: 32, weekendPrice: 74, weeklyPrice: 160, deposit: 420, minimumDays: 1, availableFrom: "2026-07-23", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-ath-m50x-four-pack", pillarId: "rental", category: "Casques", brand: "Audio-Technica", model: "ATH-M50x Four Pack", title: "4 casques Audio-Technica ATH-M50x", image: "audio-technica-m50x.jpg", price: 24, sellerId: "waveform-studio", locationId: "rennes-centre", condition: "excellent", conditionLabel: "Parc podcast · Désinfecté", rental: { dailyPrice: 24, weekendPrice: 54, weeklyPrice: 118, deposit: 300, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-fender-telecaster-player", pillarId: "rental", category: "Guitares", brand: "Fender", model: "Player Telecaster", title: "Fender Player Telecaster + étui", image: "fender-telecaster-used.jpg", price: 31, sellerId: "guitar-house", locationId: "montpellier-beaux-arts", condition: "excellent", conditionLabel: "Parc scène · Réglée", rental: { dailyPrice: 31, weekendPrice: 72, weeklyPrice: 158, deposit: 620, minimumDays: 1, availableFrom: "2026-07-22", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-gibson-lespaul-standard", pillarId: "rental", category: "Guitares", brand: "Gibson", model: "Les Paul Standard 60s", title: "Gibson Les Paul Standard 60s + case", image: "gibson-les-paul-used.jpg", price: 57, sellerId: "guitar-house", locationId: "nice-port", condition: "excellent", conditionLabel: "Parc premium · Réglée", badge: "Assurance incluse", rental: { dailyPrice: 57, weekendPrice: 132, weeklyPrice: 288, deposit: 1200, minimumDays: 2, availableFrom: "2026-07-25", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-roland-td17-session", pillarId: "rental", category: "Batteries électroniques", brand: "Roland", model: "TD-17KVX2 Session Pack", title: "Roland TD-17KVX2 · Pack session", image: "roland-td17kvx.jpg", price: 44, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", condition: "excellent", conditionLabel: "Parc répétition · Contrôlé", badge: "Montage inclus", rental: { dailyPrice: 44, weekendPrice: 102, weeklyPrice: 224, deposit: 800, minimumDays: 2, availableFrom: "2026-07-27", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-pioneer-flx10-flightcase", pillarId: "rental", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-FLX10 Flight Pack", title: "Pioneer DDJ-FLX10 + flight case", image: "pioneer-ddj-flx10.jpg", price: 63, sellerId: "vinyl-circuit", locationId: "rouen-rive-droite", condition: "excellent", conditionLabel: "Parc club · Faders testés", badge: "Réservation instantanée", rental: { dailyPrice: 63, weekendPrice: 145, weeklyPrice: 318, deposit: 1050, minimumDays: 1, availableFrom: "2026-07-21", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-technics-sl1200-pair", pillarId: "rental", category: "DJ & vinyle", brand: "Technics", model: "SL-1200 MK2 Pair", title: "Paire Technics SL-1200 MK2 + cellules", image: "technics-sl1200.jpg", price: 72, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", condition: "excellent", conditionLabel: "Paire révisée · Pitchs calibrés", rental: { dailyPrice: 72, weekendPrice: 165, weeklyPrice: 360, deposit: 1200, minimumDays: 2, availableFrom: "2026-07-24", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-m-audio-oxygen-pro", pillarId: "rental", category: "Contrôleurs MIDI", brand: "M-Audio", model: "Oxygen Pro 49", title: "M-Audio Oxygen Pro 49 + housse", image: "m-audio-oxygen-pro-49.jpg", price: 13, sellerId: "modular-corner", locationId: "angers-doutre", condition: "excellent", conditionLabel: "Parc studio · Contrôlé", rental: { dailyPrice: 13, weekendPrice: 30, weeklyPrice: 64, deposit: 160, minimumDays: 2, availableFrom: "2026-07-19", instantBook: true } }),
  createMarketDemoProduct({ id: "rental-adam-a7x-surround", pillarId: "rental", category: "Monitoring", brand: "Adam Audio", model: "A7X 2.1 Monitoring Pack", title: "Adam A7X · Pack monitoring 2.1", image: "adam-a7x-used.jpg", price: 82, sellerId: "waveform-studio", locationId: "clermont-jaude", condition: "excellent", conditionLabel: "Parc mixage · Mesuré", badge: "Calibration incluse", rental: { dailyPrice: 82, weekendPrice: 188, weeklyPrice: 410, deposit: 1600, minimumDays: 3, availableFrom: "2026-07-29", instantBook: false } }),
  createMarketDemoProduct({ id: "rental-zoom-h6-documentary", pillarId: "rental", category: "Enregistreurs", brand: "Zoom", model: "H6 Documentary Kit", title: "Zoom H6 · Kit documentaire", image: "zoom-h6-used.jpg", price: 23, sellerId: "room-collective", locationId: "bordeaux-chartrons", condition: "excellent", conditionLabel: "Kit terrain · Contrôlé", badge: "Bonnette incluse", rental: { dailyPrice: 23, weekendPrice: 52, weeklyPrice: 112, deposit: 280, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true } }),
] satisfies MarketProduct[];

const serviceCatalogWallProducts = [
  createMarketDemoProduct({ id: "service-mastering-vinyl", pillarId: "services", category: "Mix & mastering", brand: "Camille Mix", model: "Mastering vinyle", title: "Mastering vinyle · Préparation gravure", image: "service-mix-mastering.png", price: 139, sellerId: "camille-mix", locationId: "rennes-centre", badge: "Contrôle DDP", service: { kind: "production", format: "À distance", durationLabel: "Jusqu'à 4 titres", deliveryLabel: "Livraison sous 4 jours", nextAvailability: "Disponible lundi" } }),
  createMarketDemoProduct({ id: "service-mix-stems-immersive", pillarId: "services", category: "Mix & mastering", brand: "Waveform Studio", model: "Mix stems immersif", title: "Mix à partir de stems · Version immersive", image: "service-mix-mastering.png", price: 329, sellerId: "waveform-studio", locationId: "strasbourg-krutenau", badge: "2 retours inclus", service: { kind: "production", format: "À distance", durationLabel: "1 morceau", deliveryLabel: "Livraison sous 7 jours", nextAvailability: "Créneau le 23 juillet" } }),
  createMarketDemoProduct({ id: "service-edit-podcast", pillarId: "services", category: "Mix & mastering", brand: "Broadcast Lab", model: "Montage podcast", title: "Montage podcast · Épisode 60 minutes", image: "service-podcast-studio.jpg", price: 95, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", service: { kind: "production", format: "À distance", durationLabel: "60 minutes brutes", deliveryLabel: "Montage sous 3 jours", nextAvailability: "Disponible cette semaine" } }),
  createMarketDemoProduct({ id: "service-recording-vocals", pillarId: "services", category: "Rooms & studios", brand: "Room Collective", model: "Session voix premium", title: "Enregistrement voix · Direction incluse", image: "service-studio-room.png", price: 210, sellerId: "room-collective", locationId: "angers-doutre", badge: "Ingénieur inclus", service: { kind: "room", format: "Présentiel", durationLabel: "3 heures", deliveryLabel: "Pistes éditées le jour même", nextAvailability: "Mardi · 14 h" } }),
  createMarketDemoProduct({ id: "service-coaching-sound-design", pillarId: "services", category: "Cours & coaching", brand: "Modular Corner", model: "Sound design synthèse", title: "Coaching sound design · Synthèse avancée", image: "service-coaching-mao.webp", price: 79, sellerId: "modular-corner", locationId: "montpellier-beaux-arts", badge: "Patchs fournis", service: { kind: "coaching", format: "Visio ou studio", durationLabel: "2 heures", deliveryLabel: "Banque de 12 patchs", nextAvailability: "Mercredi · 18 h" } }),
  createMarketDemoProduct({ id: "service-coaching-ableton-live", pillarId: "services", category: "Cours & coaching", brand: "Noémie Sound", model: "Ableton Live performance", title: "Coaching Ableton Live · Set de scène", image: "service-coaching-mao.webp", price: 69, sellerId: "noemie-sound", locationId: "nice-port", service: { kind: "coaching", format: "Visio", durationLabel: "1 h 30", deliveryLabel: "Template Live personnalisé", nextAvailability: "Demain · 19 h" } }),
  createMarketDemoProduct({ id: "service-coaching-guitar-tone", pillarId: "services", category: "Cours & coaching", brand: "Guitar House", model: "Coaching son guitare", title: "Coaching son guitare · Pedalboard & ampli", image: "service-coach-artist.webp", price: 74, sellerId: "guitar-house", locationId: "dijon-centre", badge: "Diagnostic pedalboard", service: { kind: "coaching", format: "Présentiel", durationLabel: "2 heures", deliveryLabel: "Plan de câblage inclus", nextAvailability: "Samedi · 15 h" } }),
  createMarketDemoProduct({ id: "service-coaching-stage-confidence", pillarId: "services", category: "Cours & coaching", brand: "Élise Tones", model: "Présence scénique", title: "Coaching présence scénique · Répétition filmée", image: "service-vocal-coaching.jpg", price: 99, sellerId: "elise-tones", locationId: "paris-11", badge: "Analyse vidéo", service: { kind: "coaching", format: "Studio", durationLabel: "2 h 30", deliveryLabel: "Débrief vidéo", nextAvailability: "Vendredi · 17 h" } }),
  createMarketDemoProduct({ id: "service-masterclass-modular", pillarId: "services", category: "Cours & coaching", brand: "Modular Corner", model: "Masterclass modulaire", title: "Masterclass synthèse modulaire · Du patch au live", image: "service-beatmaking-masterclass.png", price: 39, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "12 places", service: { kind: "coaching", format: "Room interactive", durationLabel: "3 heures", deliveryLabel: "Replay 14 jours", nextAvailability: "26 juillet · 18 h" } }),
  createMarketDemoProduct({ id: "service-masterclass-home-studio", pillarId: "services", category: "Cours & coaching", brand: "Atlas Audio", model: "Masterclass home studio", title: "Masterclass acoustique · Optimiser son home studio", image: "service-beatmaking-masterclass.png", price: 35, sellerId: "atlas-audio", locationId: "rouen-rive-droite", service: { kind: "coaching", format: "Room interactive", durationLabel: "2 heures", deliveryLabel: "Guide PDF inclus", nextAvailability: "30 juillet · 20 h" } }),
  createMarketDemoProduct({ id: "service-room-drum-tracking", pillarId: "services", category: "Rooms & studios", brand: "Rhythm Workshop", model: "Drum Tracking Room", title: "Drum Room · Prise batterie complète", image: "service-studio-room.png", price: 390, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", badge: "Backline inclus", service: { kind: "room", format: "Présentiel", durationLabel: "6 heures", deliveryLabel: "Pistes éditées incluses", nextAvailability: "Dimanche · 10 h" } }),
  createMarketDemoProduct({ id: "service-room-synth-residency", pillarId: "services", category: "Rooms & studios", brand: "Session Club", model: "Synth Residency Room", title: "Synth Room · Résidence créative", image: "service-live-room-starlight.png", price: 260, sellerId: "session-club", locationId: "grenoble-bouchayer", badge: "Parc synthés inclus", service: { kind: "room", format: "Présentiel", durationLabel: "1 journée", deliveryLabel: "Captation stéréo offerte", nextAvailability: "2 août · 9 h" } }),
  createMarketDemoProduct({ id: "service-room-live-rehearsal", pillarId: "services", category: "Rooms & studios", brand: "Room Collective", model: "Live Rehearsal Room", title: "Live Room · Répétition avec captation", image: "service-live-room.webp", price: 240, sellerId: "room-collective", locationId: "clermont-jaude", service: { kind: "room", format: "Présentiel", durationLabel: "4 heures", deliveryLabel: "Multitrack inclus", nextAvailability: "Jeudi · 13 h" } }),
  createMarketDemoProduct({ id: "service-room-streaming-session", pillarId: "services", category: "Rooms & studios", brand: "Broadcast Lab", model: "Streaming Session Room", title: "Streaming Room · Session multicam", image: "service-podcast-studio.jpg", price: 320, sellerId: "broadcast-lab", locationId: "bordeaux-chartrons", badge: "Réalisation incluse", service: { kind: "room", format: "Présentiel", durationLabel: "3 heures", deliveryLabel: "Replay monté sous 48 h", nextAvailability: "Lundi · 16 h" } }),
  createMarketDemoProduct({ id: "service-ticket-neon-jam", pillarId: "services", category: "Billetterie", brand: "Meewav Rooms", model: "Neon Jam Pass", title: "Live Room · Neon Jam Session", image: "service-live-room.webp", price: 10, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", badge: "58 places", service: { kind: "ticket", format: "Room en direct", durationLabel: "90 minutes", deliveryLabel: "Replay 48 h", nextAvailability: "24 juillet · 21 h" } }),
  createMarketDemoProduct({ id: "service-ticket-ambient-night", pillarId: "services", category: "Billetterie", brand: "Meewav Rooms", model: "Ambient Night Pass", title: "Live Room · Ambient Night", image: "service-live-room-starlight.png", price: 14, sellerId: "noemie-sound", locationId: "nice-port", badge: "Live immersif", service: { kind: "ticket", format: "Room en direct", durationLabel: "2 heures", deliveryLabel: "Backstage audio inclus", nextAvailability: "28 juillet · 22 h" } }),
  createMarketDemoProduct({ id: "service-ticket-producer-circle", pillarId: "services", category: "Billetterie", brand: "Session Club", model: "Producer Circle Pass", title: "Producer Circle · Écoute & feedback live", image: "service-beatmaking-masterclass.png", price: 8, sellerId: "session-club", locationId: "lyon-2", badge: "30 places", service: { kind: "ticket", format: "Room participative", durationLabel: "2 heures", deliveryLabel: "Compte-rendu collectif", nextAvailability: "31 juillet · 19 h 30" } }),
  createMarketDemoProduct({ id: "service-production-jingle", pillarId: "services", category: "Mix & mastering", brand: "Camille Mix", model: "Jingle original", title: "Production d'un jingle original · 30 secondes", image: "service-mix-mastering.png", price: 180, sellerId: "camille-mix", locationId: "rennes-centre", service: { kind: "production", format: "À distance", durationLabel: "Jusqu'à 30 secondes", deliveryLabel: "3 propositions sous 5 jours", nextAvailability: "Disponible dès mardi" } }),
  createMarketDemoProduct({ id: "service-production-vocal-tuning", pillarId: "services", category: "Mix & mastering", brand: "Élise Tones", model: "Édition vocale", title: "Édition & tuning vocal · Jusqu'à 20 pistes", image: "service-vocal-coaching.jpg", price: 119, sellerId: "elise-tones", locationId: "paris-11", badge: "Naturel ou créatif", service: { kind: "production", format: "À distance", durationLabel: "1 morceau", deliveryLabel: "Livraison sous 3 jours", nextAvailability: "Deux créneaux cette semaine" } }),
  createMarketDemoProduct({ id: "service-production-demo-arrangement", pillarId: "services", category: "Mix & mastering", brand: "Noémie Sound", model: "Arrangement de démo", title: "Arrangement de démo · De l'idée au morceau", image: "service-coach-artist.webp", price: 285, sellerId: "noemie-sound", locationId: "montpellier-beaux-arts", badge: "Visio de cadrage", service: { kind: "production", format: "Hybride", durationLabel: "1 morceau", deliveryLabel: "Démo produite sous 10 jours", nextAvailability: "Démarrage le 27 juillet" } }),
] satisfies MarketProduct[];

const collectiveCatalogWallProducts = [
  createMarketDemoProduct({ id: "collective-moog-performance-pack", pillarId: "collective", category: "Synthétiseurs", brand: "Moog", model: "Subsequent 37 Performance Pack", title: "Moog Subsequent 37 · Pack communauté", image: "moog-subsequent-37.jpg", price: 1799, compareAtAmount: 2099, sellerId: "modular-corner", locationId: "strasbourg-krutenau", badge: "Housse débloquée", collective: { joined: 17, target: 24, progressPercent: 71, daysRemaining: 6, retailUnitPrice: 2099, unlockedUnitPrice: 1799, savingsPercent: 14 } }),
  createMarketDemoProduct({ id: "collective-arturia-stellar", pillarId: "collective", category: "Synthétiseurs", brand: "Arturia", model: "MiniFreak Stellar", title: "Arturia MiniFreak Stellar · Série collective", image: "arturia-minifreak.jpg", price: 569, compareAtAmount: 699, sellerId: "modular-corner", locationId: "rennes-centre", badge: "80 % atteint", collective: { joined: 32, target: 40, progressPercent: 80, daysRemaining: 4, retailUnitPrice: 699, unlockedUnitPrice: 569, savingsPercent: 19 } }),
  createMarketDemoProduct({ id: "collective-korg-minilogue-live", pillarId: "collective", category: "Synthétiseurs", brand: "Korg", model: "Minilogue XD Live Pack", title: "Korg Minilogue XD · Pack live", image: "korg-minilogue-xd.jpg", price: 549, compareAtAmount: 649, sellerId: "synth-district", locationId: "montpellier-beaux-arts", collective: { joined: 14, target: 20, progressPercent: 70, daysRemaining: 8, retailUnitPrice: 649, unlockedUnitPrice: 549, savingsPercent: 15 } }),
  createMarketDemoProduct({ id: "collective-audient-creator", pillarId: "collective", category: "Interfaces audio", brand: "Audient", model: "iD14 MKII Creator", title: "Audient iD14 MKII · Offre créateurs", image: "audient-id14.jpg", price: 219, compareAtAmount: 269, sellerId: "waveform-studio", locationId: "nice-port", badge: "Plus que 8 places", collective: { joined: 52, target: 60, progressPercent: 87, daysRemaining: 3, retailUnitPrice: 269, unlockedUnitPrice: 219, savingsPercent: 19 } }),
  createMarketDemoProduct({ id: "collective-focusrite-scarlett", pillarId: "collective", category: "Interfaces audio", brand: "Focusrite", model: "Scarlett 2i2 4th Gen", title: "Focusrite Scarlett 2i2 · Lot studio", image: "focusrite-scarlett-2i2.jpg", price: 169, compareAtAmount: 219, sellerId: "studio-supply", locationId: "rouen-rive-droite", badge: "Palier proche", collective: { joined: 74, target: 90, progressPercent: 82, daysRemaining: 5, retailUnitPrice: 219, unlockedUnitPrice: 169, savingsPercent: 23 } }),
  createMarketDemoProduct({ id: "collective-apollo-heritage", pillarId: "collective", category: "Interfaces audio", brand: "Universal Audio", model: "Apollo Twin X Heritage", title: "Apollo Twin X Heritage · Prix collectif", image: "apollo-twin-x.jpg", price: 829, compareAtAmount: 999, sellerId: "atlas-audio", locationId: "dijon-centre", collective: { joined: 21, target: 28, progressPercent: 75, daysRemaining: 7, retailUnitPrice: 999, unlockedUnitPrice: 829, savingsPercent: 17 } }),
  createMarketDemoProduct({ id: "collective-shure-broadcast-kit", pillarId: "collective", category: "Microphones", brand: "Shure", model: "SM7B Broadcast Kit", title: "Shure SM7B · Pack broadcast collectif", image: "shure-sm7b.jpg", price: 399, compareAtAmount: 499, sellerId: "broadcast-lab", locationId: "angers-doutre", badge: "Bras offert", collective: { joined: 39, target: 48, progressPercent: 81, daysRemaining: 4, retailUnitPrice: 499, unlockedUnitPrice: 399, savingsPercent: 20 } }),
  createMarketDemoProduct({ id: "collective-neumann-vocal-set", pillarId: "collective", category: "Microphones", brand: "Neumann", model: "TLM 103 Vocal Set", title: "Neumann TLM 103 · Vocal Set collectif", image: "neumann-tlm103.jpg", price: 999, compareAtAmount: 1199, sellerId: "waveform-studio", locationId: "clermont-jaude", badge: "Suspension incluse", collective: { joined: 11, target: 16, progressPercent: 69, daysRemaining: 9, retailUnitPrice: 1199, unlockedUnitPrice: 999, savingsPercent: 17 } }),
  createMarketDemoProduct({ id: "collective-rode-nt1a-voice", pillarId: "collective", category: "Microphones", brand: "RØDE", model: "NT1-A Voice Pack", title: "RØDE NT1-A · Pack voix communauté", image: "rode-nt1a.jpg", price: 159, compareAtAmount: 219, sellerId: "room-collective", locationId: "bordeaux-chartrons", collective: { joined: 46, target: 60, progressPercent: 77, daysRemaining: 6, retailUnitPrice: 219, unlockedUnitPrice: 159, savingsPercent: 27 } }),
  createMarketDemoProduct({ id: "collective-beyerdynamic-250ohm", pillarId: "collective", category: "Casques", brand: "Beyerdynamic", model: "DT 770 Pro 250 Ω", title: "Beyerdynamic DT 770 Pro 250 Ω · Lot studios", image: "beyerdynamic-dt770.jpg", price: 129, compareAtAmount: 169, sellerId: "studio-supply", locationId: "strasbourg-krutenau", badge: "85 % atteint", collective: { joined: 68, target: 80, progressPercent: 85, daysRemaining: 2, retailUnitPrice: 169, unlockedUnitPrice: 129, savingsPercent: 24 } }),
  createMarketDemoProduct({ id: "collective-ath-m50x-lab", pillarId: "collective", category: "Casques", brand: "Audio-Technica", model: "ATH-M50x LAB Blue", title: "Audio-Technica ATH-M50x · LAB Blue collectif", image: "audio-technica-m50x.jpg", price: 139, compareAtAmount: 189, sellerId: "atlas-audio", locationId: "rennes-centre", badge: "Coloris communauté", collective: { joined: 56, target: 72, progressPercent: 78, daysRemaining: 7, retailUnitPrice: 189, unlockedUnitPrice: 139, savingsPercent: 26 } }),
  createMarketDemoProduct({ id: "collective-fender-player-ii", pillarId: "collective", category: "Guitares", brand: "Fender", model: "Player II Stratocaster", title: "Fender Player II Strat · Série communauté", image: "fender-strat.jpg", price: 779, compareAtAmount: 929, sellerId: "guitar-house", locationId: "montpellier-beaux-arts", badge: "Réglage offert", collective: { joined: 18, target: 25, progressPercent: 72, daysRemaining: 8, retailUnitPrice: 929, unlockedUnitPrice: 779, savingsPercent: 16 } }),
  createMarketDemoProduct({ id: "collective-gibson-modern-lite", pillarId: "collective", category: "Guitares", brand: "Gibson", model: "Les Paul Modern Lite", title: "Gibson Les Paul Modern Lite · Commande club", image: "gibson-les-paul-used.jpg", price: 1649, compareAtAmount: 1899, sellerId: "guitar-house", locationId: "nice-port", collective: { joined: 9, target: 14, progressPercent: 64, daysRemaining: 11, retailUnitPrice: 1899, unlockedUnitPrice: 1649, savingsPercent: 13 } }),
  createMarketDemoProduct({ id: "collective-roland-stage-pack", pillarId: "collective", category: "Batteries électroniques", brand: "Roland", model: "TD-17KVX2 Stage Pack", title: "Roland TD-17KVX2 · Pack collectif", image: "roland-td17kvx.jpg", price: 1799, compareAtAmount: 2099, sellerId: "rhythm-workshop", locationId: "lille-wazemmes", badge: "Siège offert", collective: { joined: 12, target: 18, progressPercent: 67, daysRemaining: 10, retailUnitPrice: 2099, unlockedUnitPrice: 1799, savingsPercent: 14 } }),
  createMarketDemoProduct({ id: "collective-pioneer-flx10-flight", pillarId: "collective", category: "DJ & vinyle", brand: "Pioneer DJ", model: "DDJ-FLX10 Flight Pack", title: "Pioneer DDJ-FLX10 · Flight Pack collectif", image: "pioneer-ddj-flx10.jpg", price: 1599, compareAtAmount: 1899, sellerId: "vinyl-circuit", locationId: "rouen-rive-droite", badge: "Flight case offert", collective: { joined: 22, target: 30, progressPercent: 73, daysRemaining: 6, retailUnitPrice: 1899, unlockedUnitPrice: 1599, savingsPercent: 16 } }),
  createMarketDemoProduct({ id: "collective-technics-club-edition", pillarId: "collective", category: "DJ & vinyle", brand: "Technics", model: "SL-1200MK7 Club Edition", title: "Technics SL-1200MK7 · Club Edition collective", image: "technics-sl1200.jpg", price: 929, compareAtAmount: 1099, sellerId: "vinyl-circuit", locationId: "marseille-cours-julien", collective: { joined: 15, target: 20, progressPercent: 75, daysRemaining: 5, retailUnitPrice: 1099, unlockedUnitPrice: 929, savingsPercent: 15 } }),
  createMarketDemoProduct({ id: "collective-m-audio-producer", pillarId: "collective", category: "Contrôleurs MIDI", brand: "M-Audio", model: "Oxygen Pro 49 Producer Pack", title: "M-Audio Oxygen Pro 49 · Pack producteurs", image: "m-audio-oxygen-pro-49.jpg", price: 249, compareAtAmount: 349, sellerId: "modular-corner", locationId: "angers-doutre", badge: "-29 %", collective: { joined: 41, target: 55, progressPercent: 75, daysRemaining: 8, retailUnitPrice: 349, unlockedUnitPrice: 249, savingsPercent: 29 } }),
  createMarketDemoProduct({ id: "collective-adam-matched-pair", pillarId: "collective", category: "Monitoring", brand: "Adam Audio", model: "A7X Matched Pair", title: "Adam A7X · Paire appairée collective", image: "adam-a7x-used.jpg", price: 1199, compareAtAmount: 1449, sellerId: "waveform-studio", locationId: "clermont-jaude", badge: "Mesure acoustique offerte", collective: { joined: 16, target: 24, progressPercent: 67, daysRemaining: 9, retailUnitPrice: 1449, unlockedUnitPrice: 1199, savingsPercent: 17 } }),
  createMarketDemoProduct({ id: "collective-zoom-h6-documentary", pillarId: "collective", category: "Enregistreurs", brand: "Zoom", model: "H6 Documentary Kit", title: "Zoom H6 · Kit documentaire collectif", image: "zoom-h6-used.jpg", price: 299, compareAtAmount: 389, sellerId: "room-collective", locationId: "bordeaux-chartrons", collective: { joined: 29, target: 40, progressPercent: 73, daysRemaining: 7, retailUnitPrice: 389, unlockedUnitPrice: 299, savingsPercent: 23 } }),
  createMarketDemoProduct({ id: "collective-nord-stage4-bundle", pillarId: "collective", category: "Synthétiseurs", brand: "Nord", model: "Stage 4 73 Studio Bundle", title: "Nord Stage 4 73 · Bundle collectif", image: "nord-stage-4.jpg", price: 3899, compareAtAmount: 4499, sellerId: "atlas-audio", locationId: "grenoble-bouchayer", badge: "Palier prestige", collective: { joined: 7, target: 10, progressPercent: 70, daysRemaining: 12, retailUnitPrice: 4499, unlockedUnitPrice: 3899, savingsPercent: 13 } }),
] satisfies MarketProduct[];

const demoProductSeeds: MarketProduct[] = [
  {
    id: "new-moog-subsequent-37",
    slug: "moog-subsequent-37-neuf",
    pillarId: "new",
    category: "Synthétiseurs",
    brand: "Moog",
    model: "Subsequent 37",
    title: "Moog Subsequent 37",
    description: "Synthétiseur analogique paraphonique, clavier 37 notes et double filtre Moog.",
    imageUrl: "/images/market/moog-subsequent-37.jpg",
    imageAlt: "Synthétiseur Moog Subsequent 37",
    condition: "new",
    conditionLabel: "Neuf · Garantie 3 ans",
    price: { amount: 1899, compareAtAmount: 2099, currency: "EUR", unit: "item" },
    sellerId: "synth-district",
    locationId: "paris-11",
    rating: { score: 4.9, count: 126 },
    favorite: true,
    cart: purchaseCart(4),
    rental: null,
    collective: null,
    featured: true,
    badge: "Choix studio",
  },
  {
    id: "new-apollo-twin-x",
    slug: "universal-audio-apollo-twin-x-neuf",
    pillarId: "new",
    category: "Interfaces audio",
    brand: "Universal Audio",
    model: "Apollo Twin X Duo",
    title: "Apollo Twin X Duo",
    description: "Interface Thunderbolt deux préamplis Unison avec traitement UAD temps réel.",
    imageUrl: "/images/market/apollo-twin-x.jpg",
    imageAlt: "Interface Universal Audio Apollo Twin X",
    condition: "new",
    conditionLabel: "Neuf · Garantie 2 ans",
    price: { amount: 899, compareAtAmount: 999, currency: "EUR", unit: "item" },
    sellerId: "studio-supply",
    locationId: "lyon-2",
    rating: { score: 4.8, count: 203 },
    favorite: false,
    cart: purchaseCart(7, 1),
    rental: null,
    collective: null,
    featured: true,
    badge: "Top ventes",
  },
  {
    id: "new-shure-sm7b",
    slug: "shure-sm7b-neuf",
    pillarId: "new",
    category: "Microphones",
    brand: "Shure",
    model: "SM7B",
    title: "Shure SM7B",
    description: "Micro dynamique cardioïde de référence pour voix, podcast et prise d’ampli.",
    imageUrl: "/images/market/shure-sm7b.jpg",
    imageAlt: "Microphone Shure SM7B",
    condition: "new",
    conditionLabel: "Neuf · Expédition 24 h",
    price: { amount: 389, compareAtAmount: 429, currency: "EUR", unit: "item" },
    sellerId: "broadcast-lab",
    locationId: "lille-wazemmes",
    rating: { score: 4.9, count: 418 },
    favorite: true,
    cart: purchaseCart(12),
    rental: null,
    collective: null,
    featured: false,
  },
  {
    id: "new-beyerdynamic-dt770",
    slug: "beyerdynamic-dt-770-pro-80-neuf",
    pillarId: "new",
    category: "Casques",
    brand: "Beyerdynamic",
    model: "DT 770 Pro 80 Ω",
    title: "Beyerdynamic DT 770 Pro",
    description: "Casque fermé confortable et précis, version studio 80 ohms.",
    imageUrl: "/images/market/beyerdynamic-dt770.jpg",
    imageAlt: "Casque Beyerdynamic DT 770 Pro",
    condition: "new",
    conditionLabel: "Neuf · En stock",
    price: { amount: 149, compareAtAmount: 169, currency: "EUR", unit: "item" },
    sellerId: "studio-supply",
    locationId: "bordeaux-chartrons",
    rating: { score: 4.8, count: 562 },
    favorite: false,
    cart: purchaseCart(18),
    rental: null,
    collective: null,
    featured: false,
  },
  {
    id: "used-fender-strat",
    slug: "fender-american-professional-ii-strat-occasion",
    pillarId: "used",
    category: "Guitares",
    brand: "Fender",
    model: "American Professional II Stratocaster",
    title: "Fender American Pro II Strat",
    description: "Stratocaster 2022 réglée en atelier, étui rigide et certificat inclus.",
    imageUrl: "/images/market/fender-strat.jpg",
    imageAlt: "Guitare Fender Stratocaster",
    condition: "excellent",
    conditionLabel: "Excellent · Micro-rayures légères",
    price: { amount: 1490, compareAtAmount: 1999, currency: "EUR", unit: "item" },
    sellerId: "elise-tones",
    locationId: "paris-11",
    rating: { score: 4.9, count: 31 },
    favorite: true,
    cart: purchaseCart(1),
    rental: null,
    collective: null,
    featured: true,
    badge: "Vérifiée",
  },
  {
    id: "used-technics-sl1200",
    slug: "technics-sl-1200-mk2-occasion",
    pillarId: "used",
    category: "DJ & vinyle",
    brand: "Technics",
    model: "SL-1200 MK2",
    title: "Technics SL-1200 MK2",
    description: "Platine révisée, pitch calibré et cellule Ortofon Concorde incluse.",
    imageUrl: "/images/market/technics-sl1200.jpg",
    imageAlt: "Platine Technics SL-1200",
    condition: "very-good",
    conditionLabel: "Très bon · Révisée en juin",
    price: { amount: 780, compareAtAmount: 920, currency: "EUR", unit: "item" },
    sellerId: "vinyl-circuit",
    locationId: "marseille-cours-julien",
    rating: { score: 4.8, count: 88 },
    favorite: false,
    cart: purchaseCart(1),
    rental: null,
    collective: null,
    featured: true,
  },
  {
    id: "used-roland-td17kvx",
    slug: "roland-td-17kvx2-occasion",
    pillarId: "used",
    category: "Batteries électroniques",
    brand: "Roland",
    model: "TD-17KVX2",
    title: "Roland TD-17KVX2",
    description: "Kit complet peu joué, charleston VH-10, rack et pédale de grosse caisse.",
    imageUrl: "/images/market/roland-td17kvx.jpg",
    imageAlt: "Batterie électronique Roland TD-17KVX",
    condition: "mint",
    conditionLabel: "Comme neuf · 8 mois",
    price: { amount: 1190, compareAtAmount: 1599, currency: "EUR", unit: "item" },
    sellerId: "session-club",
    locationId: "nantes-centre",
    rating: { score: 4.9, count: 42 },
    favorite: false,
    cart: purchaseCart(1),
    rental: null,
    collective: null,
    featured: false,
  },
  {
    id: "used-arturia-minifreak",
    slug: "arturia-minifreak-occasion",
    pillarId: "used",
    category: "Synthétiseurs",
    brand: "Arturia",
    model: "MiniFreak",
    title: "Arturia MiniFreak",
    description: "Synthé hybride en parfait état, licence transférable et housse rembourrée.",
    imageUrl: "/images/market/arturia-minifreak.jpg",
    imageAlt: "Synthétiseur Arturia MiniFreak",
    condition: "excellent",
    conditionLabel: "Excellent · Boîte complète",
    price: { amount: 445, compareAtAmount: 599, currency: "EUR", unit: "item" },
    sellerId: "synth-district",
    locationId: "toulouse-saint-cyprien",
    rating: { score: 4.7, count: 57 },
    favorite: true,
    cart: purchaseCart(1),
    rental: null,
    collective: null,
    featured: false,
  },
  {
    id: "rental-moog-subsequent-37",
    slug: "moog-subsequent-37-location-paris",
    pillarId: "rental",
    category: "Synthétiseurs",
    brand: "Moog",
    model: "Subsequent 37",
    title: "Moog Subsequent 37",
    description: "Un analogique premium livré calibré pour votre session ou votre résidence.",
    imageUrl: "/images/market/moog-subsequent-37.jpg",
    imageAlt: "Moog Subsequent 37 disponible à la location",
    condition: "excellent",
    conditionLabel: "Parc studio · Contrôlé",
    price: { amount: 42, currency: "EUR", unit: "day" },
    sellerId: "session-club",
    locationId: "paris-11",
    rating: { score: 4.9, count: 96 },
    favorite: false,
    cart: actionOnly(),
    rental: { dailyPrice: 42, weekendPrice: 98, weeklyPrice: 219, deposit: 800, minimumDays: 1, availableFrom: "2026-07-20", instantBook: true },
    collective: null,
    featured: true,
    badge: "Disponible demain",
  },
  {
    id: "rental-apollo-twin-x",
    slug: "apollo-twin-x-location-lyon",
    pillarId: "rental",
    category: "Interfaces audio",
    brand: "Universal Audio",
    model: "Apollo Twin X Duo",
    title: "Apollo Twin X Duo",
    description: "Interface mobile avec alimentation, câble Thunderbolt et plugins essentiels.",
    imageUrl: "/images/market/apollo-twin-x.jpg",
    imageAlt: "Apollo Twin X disponible à la location",
    condition: "excellent",
    conditionLabel: "Parc studio · Contrôlé",
    price: { amount: 28, currency: "EUR", unit: "day" },
    sellerId: "studio-supply",
    locationId: "lyon-2",
    rating: { score: 4.8, count: 83 },
    favorite: true,
    cart: actionOnly(),
    rental: { dailyPrice: 28, weekendPrice: 65, weeklyPrice: 145, deposit: 450, minimumDays: 1, availableFrom: "2026-07-19", instantBook: true },
    collective: null,
    featured: true,
  },
  {
    id: "rental-shure-sm7b",
    slug: "shure-sm7b-location-bordeaux",
    pillarId: "rental",
    category: "Microphones",
    brand: "Shure",
    model: "SM7B",
    title: "Shure SM7B + Cloudlifter",
    description: "Pack voix prêt à enregistrer avec Cloudlifter, suspension et câble XLR.",
    imageUrl: "/images/market/shure-sm7b.jpg",
    imageAlt: "Shure SM7B disponible à la location",
    condition: "excellent",
    conditionLabel: "Pack désinfecté · Contrôlé",
    price: { amount: 12, currency: "EUR", unit: "day" },
    sellerId: "broadcast-lab",
    locationId: "bordeaux-chartrons",
    rating: { score: 4.9, count: 138 },
    favorite: false,
    cart: actionOnly(),
    rental: { dailyPrice: 12, weekendPrice: 28, weeklyPrice: 62, deposit: 180, minimumDays: 2, availableFrom: "2026-07-22", instantBook: true },
    collective: null,
    featured: false,
  },
  {
    id: "rental-roland-td17kvx",
    slug: "roland-td-17kvx-location-lille",
    pillarId: "rental",
    category: "Batteries électroniques",
    brand: "Roland",
    model: "TD-17KVX2",
    title: "Roland TD-17KVX2",
    description: "Kit silencieux complet pour répétition, résidence ou captation MIDI.",
    imageUrl: "/images/market/roland-td17kvx.jpg",
    imageAlt: "Roland TD-17KVX disponible à la location",
    condition: "excellent",
    conditionLabel: "Parc studio · Peaux neuves",
    price: { amount: 38, currency: "EUR", unit: "day" },
    sellerId: "session-club",
    locationId: "lille-wazemmes",
    rating: { score: 4.8, count: 64 },
    favorite: false,
    cart: actionOnly(),
    rental: { dailyPrice: 38, weekendPrice: 88, weeklyPrice: 198, deposit: 700, minimumDays: 2, availableFrom: "2026-07-25", instantBook: false },
    collective: null,
    featured: false,
  },
  {
    id: "service-mix-mastering",
    slug: "mix-mastering-premium-service",
    pillarId: "services",
    category: "Mix & mastering",
    brand: "Broadcast Lab",
    model: "Mix + Master Premium",
    title: "Mix & Mastering Premium",
    description: "Mix complet, retours illimités pendant sept jours et master optimisé pour les plateformes.",
    imageUrl: "/images/market/service-mix-mastering.png",
    imageAlt: "Ingénieur du son dans un studio violet",
    condition: "new",
    conditionLabel: "Livraison sous 5 jours",
    price: { amount: 249, currency: "EUR", unit: "item" },
    sellerId: "broadcast-lab",
    locationId: "paris-11",
    rating: { score: 4.9, count: 186 },
    favorite: true,
    cart: actionOnly(),
    rental: null,
    service: { kind: "production", format: "À distance", durationLabel: "1 morceau", deliveryLabel: "5 jours", nextAvailability: "Disponible cette semaine" },
    collective: null,
    featured: true,
    badge: "Best seller",
  },
  {
    id: "service-coaching-mao",
    slug: "coaching-mao-personnalise",
    pillarId: "services",
    category: "Cours & coaching",
    brand: "Session Club",
    model: "Coaching MAO",
    title: "Coaching MAO personnalisé",
    description: "Une session individuelle pour débloquer ton workflow, ton arrangement et ton mix.",
    imageUrl: "/images/market/service-coaching-mao.webp",
    imageAlt: "Session de coaching MAO en studio",
    condition: "new",
    conditionLabel: "Visio ou studio",
    price: { amount: 65, currency: "EUR", unit: "item" },
    sellerId: "session-club",
    locationId: "lyon-2",
    rating: { score: 4.9, count: 92 },
    favorite: false,
    cart: actionOnly(),
    rental: null,
    service: { kind: "coaching", format: "Visio ou présentiel", durationLabel: "1 h 30", deliveryLabel: "Compte-rendu inclus", nextAvailability: "Demain · 18 h" },
    collective: null,
    featured: true,
  },
  {
    id: "service-artist-coaching",
    slug: "coaching-identite-artistique",
    pillarId: "services",
    category: "Cours & coaching",
    brand: "Élise Tones",
    model: "Identité artistique",
    title: "Coaching identité artistique",
    description: "Positionnement, direction vocale et feuille de route concrète pour ton prochain projet.",
    imageUrl: "/images/market/service-coach-artist.webp",
    imageAlt: "Coach artistique dans un studio violet",
    condition: "new",
    conditionLabel: "Session individuelle",
    price: { amount: 89, currency: "EUR", unit: "item" },
    sellerId: "elise-tones",
    locationId: "nantes-centre",
    rating: { score: 4.9, count: 74 },
    favorite: false,
    cart: actionOnly(),
    rental: null,
    service: { kind: "coaching", format: "Visio", durationLabel: "2 heures", deliveryLabel: "Roadmap 30 jours", nextAvailability: "Vendredi · 14 h" },
    collective: null,
    featured: false,
  },
  {
    id: "service-live-room-ticket",
    slug: "live-room-neon-pulse-ticket",
    pillarId: "services",
    category: "Billetterie",
    brand: "Meewav Rooms",
    model: "Live Room Pass",
    title: "Live Room · Neon Pulse",
    description: "Accès au live interactif, backstage numérique et replay pendant quarante-huit heures.",
    imageUrl: "/images/market/service-live-room.webp",
    imageAlt: "Concert violet dans une Room Meewav",
    condition: "new",
    conditionLabel: "22 juillet · 21 h 30",
    price: { amount: 12, currency: "EUR", unit: "item" },
    sellerId: "vinyl-circuit",
    locationId: "marseille-cours-julien",
    rating: { score: 4.8, count: 147 },
    favorite: true,
    cart: actionOnly(),
    rental: null,
    service: { kind: "ticket", format: "Room en direct", durationLabel: "90 minutes", deliveryLabel: "Replay 48 h", nextAvailability: "22 juillet · 21 h 30" },
    collective: null,
    featured: true,
    badge: "43 places",
  },
  {
    id: "service-studio-room",
    slug: "studio-room-voix-premium",
    pillarId: "services",
    category: "Rooms & studios",
    brand: "Session Club",
    model: "Vocal Room A",
    title: "Vocal Room A + ingénieur",
    description: "Cabine voix, chaîne premium et ingénieur inclus pour une session prête à enregistrer.",
    imageUrl: "/images/market/service-studio-room.png",
    imageAlt: "Microphone dans une vocal room bleue",
    condition: "new",
    conditionLabel: "Créneau de 3 heures",
    price: { amount: 180, currency: "EUR", unit: "item" },
    sellerId: "session-club",
    locationId: "bordeaux-chartrons",
    rating: { score: 4.9, count: 121 },
    favorite: false,
    cart: actionOnly(),
    rental: null,
    service: { kind: "room", format: "Présentiel", durationLabel: "3 heures", deliveryLabel: "Ingénieur inclus", nextAvailability: "Samedi · 10 h" },
    collective: null,
    featured: false,
  },
  {
    id: "collective-arturia-minifreak",
    slug: "arturia-minifreak-achat-groupe",
    pillarId: "collective",
    category: "Synthétiseurs",
    brand: "Arturia",
    model: "MiniFreak",
    title: "Arturia MiniFreak",
    description: "Commande directe fabricant avec housse offerte dès le palier final.",
    imageUrl: "/images/market/arturia-minifreak.jpg",
    imageAlt: "Arturia MiniFreak en achat groupé",
    condition: "new",
    conditionLabel: "Neuf · Livraison groupée",
    price: { amount: 499, compareAtAmount: 599, currency: "EUR", unit: "item" },
    sellerId: "synth-district",
    locationId: "paris-11",
    rating: { score: 4.8, count: 174 },
    favorite: true,
    cart: actionOnly(),
    rental: null,
    collective: { joined: 31, target: 40, progressPercent: 78, daysRemaining: 4, retailUnitPrice: 599, unlockedUnitPrice: 499, savingsPercent: 17 },
    featured: true,
    badge: "Plus que 9 places",
  },
  {
    id: "collective-beyerdynamic-dt770",
    slug: "beyerdynamic-dt-770-pro-achat-groupe",
    pillarId: "collective",
    category: "Casques",
    brand: "Beyerdynamic",
    model: "DT 770 Pro 80 Ω",
    title: "Beyerdynamic DT 770 Pro",
    description: "Tarif collectif studio avec gravure de repérage incluse.",
    imageUrl: "/images/market/beyerdynamic-dt770.jpg",
    imageAlt: "Beyerdynamic DT 770 Pro en achat groupé",
    condition: "new",
    conditionLabel: "Neuf · Expédition offerte",
    price: { amount: 119, compareAtAmount: 159, currency: "EUR", unit: "item" },
    sellerId: "studio-supply",
    locationId: "lyon-2",
    rating: { score: 4.8, count: 326 },
    favorite: false,
    cart: actionOnly(),
    rental: null,
    collective: { joined: 64, target: 80, progressPercent: 80, daysRemaining: 6, retailUnitPrice: 159, unlockedUnitPrice: 119, savingsPercent: 25 },
    featured: true,
  },
  {
    id: "collective-fender-strat",
    slug: "fender-american-professional-ii-strat-achat-groupe",
    pillarId: "collective",
    category: "Guitares",
    brand: "Fender",
    model: "American Professional II Stratocaster",
    title: "Fender American Pro II Strat",
    description: "Série réservée à la communauté, réglage Plek inclus avant livraison.",
    imageUrl: "/images/market/fender-strat.jpg",
    imageAlt: "Fender Stratocaster en achat groupé",
    condition: "new",
    conditionLabel: "Neuf · Réglage premium",
    price: { amount: 1699, compareAtAmount: 1999, currency: "EUR", unit: "item" },
    sellerId: "elise-tones",
    locationId: "nantes-centre",
    rating: { score: 4.9, count: 92 },
    favorite: false,
    cart: actionOnly(),
    rental: null,
    collective: { joined: 12, target: 20, progressPercent: 60, daysRemaining: 9, retailUnitPrice: 1999, unlockedUnitPrice: 1699, savingsPercent: 15 },
    featured: false,
  },
  {
    id: "collective-technics-sl1200",
    slug: "technics-sl-1200mk7-achat-groupe",
    pillarId: "collective",
    category: "DJ & vinyle",
    brand: "Technics",
    model: "SL-1200MK7",
    title: "Technics SL-1200MK7",
    description: "Lot communauté DJ avec cellule premium et flight case à prix négocié.",
    imageUrl: "/images/market/technics-sl1200.jpg",
    imageAlt: "Technics SL-1200 en achat groupé",
    condition: "new",
    conditionLabel: "Neuf · Pack communauté",
    price: { amount: 899, compareAtAmount: 999, currency: "EUR", unit: "item" },
    sellerId: "vinyl-circuit",
    locationId: "marseille-cours-julien",
    rating: { score: 4.9, count: 144 },
    favorite: true,
    cart: actionOnly(),
    rental: null,
    collective: { joined: 23, target: 30, progressPercent: 77, daysRemaining: 3, retailUnitPrice: 999, unlockedUnitPrice: 899, savingsPercent: 10 },
    featured: false,
    badge: "Se termine bientôt",
  },
  ...marketCatalogExtensions,
  ...newCatalogWallProducts,
  ...usedCatalogWallProducts,
  ...rentalCatalogWallProducts,
  ...serviceCatalogWallProducts,
  ...collectiveCatalogWallProducts,
  ...MARKET_EXPANSION_NEW_PRODUCTS,
  ...MARKET_EXPANSION_USED_PRODUCTS,
  ...marketRentalExpansionProducts,
  ...marketServiceExpansionProducts,
  ...MARKET_EXPANSION_COLLECTIVE_PRODUCTS,
  ...marketEditorialExpansionProducts,
  ...marketWave2NewProducts,
  ...marketWave2UsedProducts,
  ...marketWave2EditorialProducts,
  ...MARKET_EXPANSION_WAVE2_COLLECTIVE_PRODUCTS,
  ...marketWave2RentalProducts,
  ...marketWave2ServiceProducts,
];

// Consistent seller identities throughout demo cards, details and seller profiles.
// These assignments never touch the live marketplace repository.
const demoPrivateSellers = ['elise-tones', 'noemie-sound', 'camille-mix'];
const demoStoreByCategory: Partial<Record<MarketCategory, string>> = {
  'Synthétiseurs': 'synth-district', 'Guitares': 'guitar-house',
  'DJ & vinyle': 'vinyl-circuit', 'Contrôleurs MIDI': 'modular-corner',
};
export const marketProducts: MarketProduct[] = demoProductSeeds.map((product) => {
  const hash = [...product.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const current = marketSellers[product.sellerId];
  if (product.pillarId === 'used' && current?.kind !== 'artist') {
    return { ...product, sellerId: demoPrivateSellers[hash % demoPrivateSellers.length] };
  }
  if (product.pillarId === 'new' && current?.kind !== 'store') {
    return { ...product, sellerId: demoStoreByCategory[product.category] ?? 'studio-supply' };
  }
  return product;
});

export interface MarketHomeRail {
  id: string;
  pillarId: MarketPillarId;
  eyebrow: string;
  title: string;
  description: string;
  productIds: string[];
}

export const MARKET_FEATURED_PRODUCT_IDS = [
  "new-moog-subsequent-37",
  "service-live-room-ticket",
  "used-gibson-les-paul",
  "collective-arturia-minifreak",
  "rental-nord-stage-4",
  "new-apollo-twin-x",
  "service-mix-mastering",
  "used-technics-sl1200",
  "service-vocal-coaching",
  "collective-nord-stage",
];

export const MARKET_HOME_RAILS: MarketHomeRail[] = [
  {
    id: "new-studio",
    pillarId: "new",
    eyebrow: "Nouveautés studio",
    title: "Le prochain son commence ici",
    description: "Trente références neuves sélectionnées pour composer, enregistrer et performer.",
    productIds: [
      "new-moog-subsequent-37", "new-apollo-twin-x", "new-shure-sm7b", "new-beyerdynamic-dt770",
      "new-focusrite-scarlett", "new-audient-id14", "new-neumann-tlm103", "new-korg-minilogue",
      "new-nord-stage-4", "new-pioneer-flx10",
    ],
  },
  {
    id: "used-nearby",
    pillarId: "used",
    eyebrow: "Occasions près de toi",
    title: "Des pièces avec une histoire, pas des surprises",
    description: "Matériel vérifié, état détaillé et vendeurs de la communauté à proximité.",
    productIds: [
      "used-fender-strat", "used-technics-sl1200", "used-roland-td17kvx", "used-arturia-minifreak",
      "used-gibson-les-paul", "used-fender-telecaster", "used-prs-custom-24", "used-adam-a7x",
      "used-pioneer-ddj1000", "used-zoom-h6",
    ],
  },
  {
    id: "rental-session",
    pillarId: "rental",
    eyebrow: "À louer cette semaine",
    title: "Équipe la session, pas le placard",
    description: "Réservation rapide, caution claire et disponibilité réelle autour de toi.",
    productIds: [
      "rental-moog-subsequent-37", "rental-apollo-twin-x", "rental-shure-sm7b", "rental-roland-td17kvx",
      "rental-neumann-tlm103", "rental-pioneer-ddj1000", "rental-nord-stage-4", "rental-fender-strat",
      "rental-zoom-h6", "rental-adam-a7x",
    ],
  },
  {
    id: "services-project",
    pillarId: "services",
    eyebrow: "Services pour ton projet",
    title: "Des talents, des Rooms et des expériences",
    description: "Cours, coaching, studio, mix, billetterie et prestations artistiques réunis au même endroit.",
    productIds: [
      "service-mix-mastering", "service-coaching-mao", "service-artist-coaching", "service-live-room-ticket",
      "service-studio-room", "service-vocal-coaching", "service-dj-coaching", "service-beatmaking-masterclass",
      "service-live-starlight", "service-podcast-studio",
    ],
  },
  {
    id: "collective-goals",
    pillarId: "collective",
    eyebrow: "Objectifs presque débloqués",
    title: "À plusieurs, le prix tombe vraiment",
    description: "Suis la progression en direct et rejoins les commandes qui approchent de leur meilleur tarif.",
    productIds: [
      "collective-arturia-minifreak", "collective-beyerdynamic-dt770", "collective-fender-strat", "collective-technics-sl1200",
      "collective-apollo-twin", "collective-shure-sm7b", "collective-m-audio-oxygen", "collective-ath-m50x",
      "collective-rode-nt1a", "collective-nord-stage",
    ],
  },
];

export const featuredMarketProductIds = [...MARKET_FEATURED_PRODUCT_IDS];

export const initialMarketFavorites = new Set(
  marketProducts.filter((product) => product.favorite).map((product) => product.id),
);

export const initialMarketCart = new Map(
  marketProducts
    .filter((product) => product.cart.quantity > 0)
    .map((product) => [product.id, product.cart.quantity] as const),
);

export function getMarketProductView(product: MarketProduct): MarketProductView {
  const seller = marketSellers[product.sellerId];
  const location = marketLocations[product.locationId];

  if (!seller || !location) {
    throw new Error(`Données marketplace incomplètes pour ${product.id}`);
  }

  return {
    ...product,
    imageUrl: getMarketSceneImage(product) ?? getMarketWallImage(product.id, product.imageUrl),
    seller,
    location,
  };
}

export function getMarketProductsByPillar(pillarId: MarketPillarId): MarketProductView[] {
  return marketProducts
    .filter((product) => product.pillarId === pillarId)
    .map(getMarketProductView);
}

export const marketProductViews = marketProducts.map(getMarketProductView);

export const marketDemoData = {
  pillars: MARKET_PILLARS,
  homeRails: MARKET_HOME_RAILS,
  sellers: marketSellers,
  locations: marketLocations,
  products: marketProducts,
  productViews: marketProductViews,
  featuredProductIds: featuredMarketProductIds,
};
