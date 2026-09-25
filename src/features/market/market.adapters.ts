import type {
  MarketAvailabilityBucket,
  MarketCategory,
  MarketCollectiveProgress,
  MarketCondition,
  MarketNewTerms,
  MarketProductView,
  MarketRentalTerms,
  MarketSeller,
  MarketServiceTerms,
  MarketUsedTerms,
} from "./marketDemoData";
import type {
  MarketplaceCatalogRow,
  MarketplaceViewerState,
} from "./market.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const MAX_MONEY_MINOR = 1_000_000_000_000;
const FALLBACK_COVER_URL = "/images/market/market-acoustic-wall.webp";

const CATEGORY_BY_CODE: Readonly<Record<string, MarketCategory>> = {
  synthetiseurs: "Synthétiseurs",
  synths: "Synthétiseurs",
  synthesizers: "Synthétiseurs",
  interfaces_audio: "Interfaces audio",
  audio_interfaces: "Interfaces audio",
  microphones: "Microphones",
  casques: "Casques",
  headphones: "Casques",
  guitares: "Guitares",
  guitars: "Guitares",
  batteries_electroniques: "Batteries électroniques",
  electronic_drums: "Batteries électroniques",
  dj_vinyle: "DJ & vinyle",
  dj_et_vinyle: "DJ & vinyle",
  dj_and_vinyl: "DJ & vinyle",
  controleurs_midi: "Contrôleurs MIDI",
  midi_controllers: "Contrôleurs MIDI",
  monitoring: "Monitoring",
  enregistreurs: "Enregistreurs",
  recorders: "Enregistreurs",
  mix_mastering: "Mix & mastering",
  mix_et_mastering: "Mix & mastering",
  cours_coaching: "Cours & coaching",
  courses_coaching: "Cours & coaching",
  billetterie: "Billetterie",
  ticketing: "Billetterie",
  rooms_studios: "Rooms & studios",
  rooms_and_studios: "Rooms & studios",
  autres: "Autres",
  other: "Autres",
};

const CATEGORY_CODES_BY_LABEL: Readonly<Record<MarketCategory, readonly string[]>> = {
  "Synthétiseurs": ["synthetiseurs", "synths", "synthesizers"],
  "Interfaces audio": ["interfaces_audio", "interfaces-audio", "audio_interfaces", "audio-interfaces"],
  Microphones: ["microphones"],
  Casques: ["casques", "headphones"],
  Guitares: ["guitares", "guitars"],
  "Batteries électroniques": ["batteries_electroniques", "batteries-electroniques", "electronic_drums", "electronic-drums"],
  "DJ & vinyle": ["dj_vinyle", "dj-et-vinyle", "dj_et_vinyle", "dj_and_vinyl", "dj-and-vinyl"],
  "Contrôleurs MIDI": ["controleurs_midi", "controleurs-midi", "midi_controllers", "midi-controllers"],
  Monitoring: ["monitoring"],
  Enregistreurs: ["enregistreurs", "recorders"],
  "Mix & mastering": ["mix_mastering", "mix-mastering", "mix_et_mastering", "mix-et-mastering"],
  "Cours & coaching": ["cours_coaching", "cours-et-coaching", "courses_coaching", "courses-coaching"],
  Billetterie: ["billetterie", "ticketing"],
  "Rooms & studios": ["rooms_studios", "rooms-et-studios", "rooms_and_studios", "rooms-and-studios"],
  Autres: ["autres", "other"],
};

export function marketplaceCategoryCodes(categories: readonly MarketCategory[]) {
  return [...new Set(categories.flatMap((label) => CATEGORY_CODES_BY_LABEL[label] ?? []))];
}

const CONDITION_BY_CODE: Readonly<Record<string, MarketCondition>> = {
  new: "new",
  neuf: "new",
  mint: "mint",
  comme_neuf: "mint",
  excellent: "excellent",
  very_good: "very-good",
  tres_bon: "very-good",
};

const RESPONSE_TIME_LABELS: Readonly<Record<string, string>> = {
  instant: "Répond généralement immédiatement",
  under_1h: "Répond généralement en moins d’une heure",
  under_15_minutes: "Répond généralement en moins de 15 min",
  under_1_hour: "Répond généralement en moins d’une heure",
  under_4h: "Répond généralement en moins de 4 h",
  under_4_hours: "Répond généralement en moins de 4 h",
  same_day: "Répond généralement dans la journée",
  within_day: "Répond généralement dans la journée",
  under_48h: "Répond généralement sous 48 h",
  over_48h: "Réponse généralement au-delà de 48 h",
  over_day: "Réponse généralement sous 48 h",
};

export class MarketplaceAdapterError extends Error {
  constructor(public readonly field: string, message = `invalid_marketplace_${field}`) {
    super(message);
    this.name = "MarketplaceAdapterError";
  }
}

function invalid(field: string): never {
  throw new MarketplaceAdapterError(field);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, field: string, maximum = 5_000): string {
  if (typeof value !== "string") invalid(field);
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) invalid(field);
  return normalized;
}

function optionalString(value: unknown, field: string, maximum = 5_000): string | null {
  if (value === null || value === undefined || value === "") return null;
  return stringValue(value, field, maximum);
}

function integer(value: unknown, field: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) invalid(field);
  return Number(value);
}

function booleanValue(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(field);
  return value;
}

function optionalNonNegativeNumber(value: unknown, field: string) {
  if (value === null || value === undefined) return Number.POSITIVE_INFINITY;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) invalid(field);
  return value;
}

function sellerKind(value: unknown): MarketSeller["kind"] {
  if (value === null || value === undefined) return "artist";
  if (value === "artist" || value === "studio" || value === "store") return value;
  return invalid("seller_kind");
}

function availabilityBucket(value: unknown): MarketAvailabilityBucket | undefined {
  if (value === null || value === undefined) return undefined;
  if (value === "now" || value === "7-days" || value === "30-days" || value === "later") return value;
  return invalid("availability_bucket");
}

function isoDate(value: unknown, field: string): string {
  const normalized = stringValue(value, field, 40);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(normalized) || Number.isNaN(Date.parse(normalized))) invalid(field);
  return normalized;
}

function uuid(value: unknown, field: string): string {
  const normalized = stringValue(value, field, 36);
  if (!UUID_PATTERN.test(normalized)) invalid(field);
  return normalized;
}

function moneyMinor(value: unknown, field: string): number {
  return integer(value, field, 0, MAX_MONEY_MINOR);
}

function moneyMajor(value: unknown, field: string): number {
  return moneyMinor(value, field) / 100;
}

function optionalMoneyMajor(value: unknown, field: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  return moneyMajor(value, field);
}

function normalizedCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function category(value: unknown): MarketCategory {
  const label = stringValue(value, "category_code", 80);
  return CATEGORY_BY_CODE[normalizedCode(label)] ?? "Autres";
}

function condition(row: MarketplaceCatalogRow): MarketCondition {
  if (row.pillar === "new") return "new";
  const code = optionalString(row.condition_code, "condition_code", 80);
  if (!code) return row.pillar === "used" ? "excellent" : "new";
  return CONDITION_BY_CODE[normalizedCode(code)] ?? (row.pillar === "used" ? "very-good" : "new");
}

function safePublicAssetUrl(value: unknown, field: string) {
  const url = optionalString(value, field, 2_048);
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//") && !url.includes("\\")) return url;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function safeCoverUrl(value: unknown) {
  return safePublicAssetUrl(value, "cover_url") ?? FALLBACK_COVER_URL;
}

function monogram(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : name.slice(0, 2);
  return letters.toLocaleUpperCase("fr-FR");
}

function ratingFromBasisPoints(value: unknown) {
  // Seller ratings are persisted as score × 10,000 (4.875/5 = 48,750).
  const basisPoints = integer(value, "seller_rating_basis_points", 0, 50_000);
  return Math.round((basisPoints / 10_000) * 10) / 10;
}

function responseTime(value: unknown) {
  const bucket = optionalString(value, "seller_response_time_bucket", 80);
  if (!bucket) return "Délai de réponse non communiqué";
  return RESPONSE_TIME_LABELS[normalizedCode(bucket)] ?? "Délai de réponse communiqué sur demande";
}

function parseRentalTerms(value: unknown): MarketRentalTerms {
  const terms = record(value, "rental_terms");
  const dailyPrice = moneyMajor(terms.daily_amount_minor, "rental_terms.daily_amount_minor");
  return {
    dailyPrice,
    // The composer deliberately makes package prices optional. In their
    // absence, charging the daily rate for two/seven days is the only
    // truthful fallback the legacy view contract can display.
    weekendPrice: optionalMoneyMajor(
      terms.weekend_amount_minor,
      "rental_terms.weekend_amount_minor",
    ) ?? dailyPrice * 2,
    weeklyPrice: optionalMoneyMajor(
      terms.weekly_amount_minor,
      "rental_terms.weekly_amount_minor",
    ) ?? dailyPrice * 7,
    deposit: moneyMajor(terms.deposit_amount_minor, "rental_terms.deposit_amount_minor"),
    minimumDays: integer(terms.minimum_days, "rental_terms.minimum_days", 1, 365),
    availableFrom: isoDate(terms.available_from, "rental_terms.available_from"),
    instantBook: booleanValue(terms.instant_book, "rental_terms.instant_book"),
  };
}

function parseServiceTerms(value: unknown): MarketServiceTerms {
  const terms = record(value, "service_terms");
  const kind = stringValue(terms.kind ?? terms.service_kind, "service_terms.kind", 40);
  if (kind !== "production" && kind !== "coaching" && kind !== "ticket" && kind !== "room") {
    invalid("service_terms.kind");
  }
  const eventDateValue = optionalString(terms.event_date, "service_terms.event_date", 80);
  const capacityValue = terms.capacity === null || terms.capacity === undefined
    ? null
    : integer(terms.capacity, "service_terms.capacity", 1, 100_000);
  return {
    kind,
    format: stringValue(terms.format ?? terms.service_format, "service_terms.format", 160),
    durationLabel: stringValue(terms.duration_label, "service_terms.duration_label", 160),
    deliveryLabel: optionalString(terms.delivery_label, "service_terms.delivery_label", 240)
      ?? "Résultat à convenir avec l’artiste",
    nextAvailability: stringValue(terms.next_availability, "service_terms.next_availability", 160),
    eventDate: eventDateValue ? isoDate(eventDateValue, "service_terms.event_date") : null,
    capacity: capacityValue,
    venueName: optionalString(terms.venue_name, "service_terms.venue_name", 180),
    includedEquipment: optionalString(
      terms.included_equipment,
      "service_terms.included_equipment",
      2_000,
    ),
  };
}

function parseNewTerms(value: unknown): MarketNewTerms {
  const terms = record(value, "new_terms");
  return {
    stock: integer(terms.stock, "new_terms.stock", 0, 100_000),
    warrantyMonths: integer(terms.warranty_months, "new_terms.warranty_months", 0, 240),
  };
}

function parseUsedTerms(value: unknown): MarketUsedTerms {
  const terms = record(value, "used_terms");
  const purchaseYear = terms.purchase_year === null || terms.purchase_year === undefined
    ? null
    : integer(terms.purchase_year, "used_terms.purchase_year", 1900, 3_000);
  return {
    purchaseYear,
    negotiable: booleanValue(terms.negotiable, "used_terms.negotiable"),
    conditionNotes: optionalString(terms.condition_notes, "used_terms.condition_notes", 2_000),
  };
}

function parseCollectiveTerms(value: unknown): MarketCollectiveProgress {
  const terms = record(value, "collective_terms");
  const joined = integer(terms.joined, "collective_terms.joined", 0, 1_000_000);
  const target = integer(terms.target ?? terms.target_participants, "collective_terms.target", 1, 1_000_000);
  if (joined > target) invalid("collective_terms.joined");
  const progressPercent = integer(terms.progress_percent, "collective_terms.progress_percent", 0, 100);
  const retailUnitPrice = moneyMajor(terms.retail_unit_amount_minor, "collective_terms.retail_unit_amount_minor");
  const unlockedUnitPrice = moneyMajor(terms.unlocked_unit_amount_minor, "collective_terms.unlocked_unit_amount_minor");
  if (unlockedUnitPrice > retailUnitPrice) invalid("collective_terms.unlocked_unit_amount_minor");
  return {
    joined,
    target,
    progressPercent,
    daysRemaining: integer(terms.days_remaining, "collective_terms.days_remaining", 0, 3_650),
    retailUnitPrice,
    unlockedUnitPrice,
    savingsPercent: integer(terms.savings_percent, "collective_terms.savings_percent", 0, 100),
  };
}

function listingTerms(row: MarketplaceCatalogRow) {
  if (row.pillar === "new") {
    return {
      newTerms: parseNewTerms(row.new_terms),
      usedTerms: null,
      rental: null,
      service: null,
      collective: null,
    };
  }
  if (row.pillar === "used") {
    return {
      newTerms: null,
      usedTerms: parseUsedTerms(row.used_terms),
      rental: null,
      service: null,
      collective: null,
    };
  }
  if (row.pillar === "rental") {
    return { newTerms: null, usedTerms: null, rental: parseRentalTerms(row.rental_terms), service: null, collective: null };
  }
  if (row.pillar === "services") {
    return { newTerms: null, usedTerms: null, rental: null, service: parseServiceTerms(row.service_terms), collective: null };
  }
  if (row.pillar === "collective") {
    return { newTerms: null, usedTerms: null, rental: null, service: null, collective: parseCollectiveTerms(row.collective_terms) };
  }
  return { newTerms: null, usedTerms: null, rental: null, service: null, collective: null };
}

function conditionLabel(row: MarketplaceCatalogRow) {
  const provided = optionalString(row.condition_label, "condition_label", 160);
  if (provided) return provided;
  if (row.pillar === "used") return "Occasion · État à confirmer";
  if (row.pillar === "rental") return "Location · Disponibilité à confirmer";
  if (row.pillar === "services") return "Service proposé par la communauté";
  if (row.pillar === "collective") return "Commande collective en cours";
  return "Neuf · Disponibilité à confirmer";
}

export function mapMarketplaceCatalogRow(row: MarketplaceCatalogRow): MarketProductView {
  if (!row || typeof row !== "object") invalid("catalog_row");
  if (row.pillar !== "new" && row.pillar !== "used" && row.pillar !== "rental"
    && row.pillar !== "services" && row.pillar !== "collective") {
    invalid("pillar");
  }
  if (row.price_unit !== "item" && row.price_unit !== "day" && row.price_unit !== "session"
    && row.price_unit !== "ticket" && row.price_unit !== "participant") {
    invalid("price_unit");
  }
  const listingId = uuid(row.listing_id, "listing_id");
  const sellerProfileId = uuid(row.seller_profile_id, "seller_profile_id");
  const title = stringValue(row.title, "title", 140);
  const sellerName = stringValue(row.seller_display_name, "seller_display_name", 120);
  const slug = stringValue(row.slug, "slug", 160).toLocaleLowerCase("en-US");
  if (!SAFE_SLUG_PATTERN.test(slug)) invalid("slug");
  if (row.currency_code !== "EUR") invalid("currency_code");
  isoDate(row.published_at, "published_at");

  const ratingScore = ratingFromBasisPoints(row.seller_rating_basis_points);
  const sellerGradeLevel = row.seller_grade_level === null
    ? null
    : integer(row.seller_grade_level, "seller_grade_level", 1, 6);
  const ratingCount = integer(row.seller_rating_count, "seller_rating_count", 0, 10_000_000);
  const maxQuantity = integer(row.max_quantity, "max_quantity", 0, 1_000_000);
  const unitAmount = moneyMajor(row.unit_amount_minor, "unit_amount_minor");
  const compareAtAmount = optionalMoneyMajor(row.compare_at_amount_minor, "compare_at_amount_minor");
  if (compareAtAmount !== undefined && compareAtAmount < unitAmount) invalid("compare_at_amount_minor");
  const purchasable = (row.pillar === "new" || row.pillar === "used") && maxQuantity > 0;
  const terms = listingTerms(row);
  const city = optionalString(row.city_label, "city_label", 120) ?? "France";
  const area = optionalString(row.area_label, "area_label", 120) ?? "Zone à préciser";

  return {
    id: listingId,
    slug,
    pillarId: row.pillar,
    category: category(row.category_code),
    brand: optionalString(row.brand, "brand", 120) ?? "",
    model: optionalString(row.model, "model", 160) ?? "",
    title,
    description: optionalString(row.description, "description", 5_000)
      ?? stringValue(row.short_description, "short_description", 280),
    imageUrl: safeCoverUrl(row.cover_url),
    imageAlt: optionalString(row.cover_alt, "cover_alt", 240) ?? `${title} sur le Market Meewav`,
    condition: condition(row),
    conditionLabel: conditionLabel(row),
    price: {
      amount: unitAmount,
      compareAtAmount,
      currency: "EUR",
      unit: row.price_unit,
    },
    sellerId: sellerProfileId,
    locationId: `${city}:${area}`.toLocaleLowerCase("fr-FR"),
    rating: { score: ratingScore, count: ratingCount },
    favorite: row.viewer_favorite === undefined
      ? false
      : booleanValue(row.viewer_favorite, "viewer_favorite"),
    cart: {
      eligible: purchasable,
      quantity: 0,
      maxQuantity: purchasable ? maxQuantity : 0,
    },
    shippingAmount: moneyMajor(row.shipping_amount_minor, "shipping_amount_minor"),
    preparationDays: integer(row.preparation_days, "preparation_days", 0, 365),
    availabilityBucket: availabilityBucket(row.availability_bucket),
    negotiable: terms.usedTerms?.negotiable ?? false,
    ...terms,
    featured: false,
    badge: optionalString(row.badge_label, "badge_label", 80) ?? undefined,
    seller: {
      id: sellerProfileId,
      profileId: sellerProfileId,
      name: sellerName,
      kind: sellerKind(row.seller_kind),
      monogram: monogram(sellerName),
      verified: booleanValue(row.seller_verified, "seller_verified"),
      rating: { score: ratingScore, count: ratingCount },
      salesCount: integer(row.seller_completed_orders_count, "seller_completed_orders_count", 0, 100_000_000),
      responseTime: responseTime(row.seller_response_time_bucket),
      avatarUrl: safePublicAssetUrl(row.seller_avatar_url, "seller_avatar_url"),
      gradeLevel: sellerGradeLevel,
    },
    location: {
      id: `${city}:${area}`.toLocaleLowerCase("fr-FR"),
      city,
      area,
      countryCode: "FR",
      pickup: booleanValue(row.pickup_enabled, "pickup_enabled"),
      shipping: booleanValue(row.shipping_enabled, "shipping_enabled"),
      remote: row.remote_enabled === undefined
        ? false
        : booleanValue(row.remote_enabled, "remote_enabled"),
      // Infinity keeps unavailable distance data last without inventing a
      // proximity. The v2 RPC exposes a real value only when it can do so.
      distanceKm: optionalNonNegativeNumber(row.distance_km, "distance_km"),
    },
  };
}

export function mapMarketplaceCatalogRows(rows: readonly MarketplaceCatalogRow[]) {
  return rows.reduce<MarketProductView[]>((products, row) => {
    try {
      products.push(mapMarketplaceCatalogRow(row));
    } catch (error) {
      // A malformed legacy listing must not blank the entire marketplace.
      // Unknown programming errors still surface instead of being hidden.
      if (!(error instanceof MarketplaceAdapterError)) throw error;
    }
    return products;
  }, []);
}

export type MarketplaceViewerStateView = {
  favorites: Set<string>;
  cart: Map<string, number>;
  joinedCollectives: Set<string>;
};

export function mapMarketplaceViewerState(state: MarketplaceViewerState): MarketplaceViewerStateView {
  if (!state || typeof state !== "object") invalid("viewer_state");
  if (!Array.isArray(state.favorite_listing_ids)) invalid("viewer_state.favorite_listing_ids");
  if (!Array.isArray(state.cart_items)) invalid("viewer_state.cart_items");
  if (!Array.isArray(state.joined_collective_listing_ids)) invalid("viewer_state.joined_collective_listing_ids");

  const favorites = new Set(state.favorite_listing_ids.map((listingId) => uuid(listingId, "viewer_state.favorite_listing_ids")));
  const joinedCollectives = new Set(state.joined_collective_listing_ids.map((listingId) => uuid(listingId, "viewer_state.joined_collective_listing_ids")));
  const cart = new Map<string, number>();
  for (const item of state.cart_items) {
    if (!item || typeof item !== "object") invalid("viewer_state.cart_items");
    const listingId = uuid(item.listing_id, "viewer_state.cart_items.listing_id");
    const quantity = integer(item.quantity, "viewer_state.cart_items.quantity", 1, 99);
    cart.set(listingId, quantity);
  }
  return { favorites, cart, joinedCollectives };
}

export function applyMarketplaceViewerState(
  product: MarketProductView,
  state: Pick<MarketplaceViewerState, "favorite_listing_ids" | "cart_items">,
): MarketProductView {
  const quantity = state.cart_items.find((item) => item.listing_id === product.id)?.quantity ?? 0;
  const safeQuantity = product.cart.eligible
    ? Math.min(product.cart.maxQuantity, Math.max(0, Number.isSafeInteger(quantity) ? quantity : 0))
    : 0;
  return {
    ...product,
    favorite: state.favorite_listing_ids.includes(product.id),
    cart: { ...product.cart, quantity: safeQuantity },
  };
}
