import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabaseClient";
import {
  invalidMarketplaceRequest,
  toMarketplaceServiceError,
} from "./market.errors";
import type {
  MarketplaceCatalogAvailability,
  MarketplaceCatalogCapabilities,
  MarketplaceCatalogCursor,
  MarketplaceCatalogCursorV1,
  MarketplaceCatalogFilters,
  MarketplaceCatalogFulfillment,
  MarketplaceCatalogInput,
  MarketplaceCatalogRow,
  MarketplaceCatalogServerSort,
  MarketplaceCatalogSort,
  MarketplaceCatalogSortFallback,
  MarketplacePillar,
  MarketplaceSellerKind,
  MarketplaceCollectiveJoinInput,
  MarketplaceIntentListInput,
  MarketplaceIntentRow,
  MarketplaceIntentResult,
  MarketplaceIntentStatus,
  MarketplaceListingDraftInput,
  MarketplaceListingDraftRow,
  MarketplaceListingDraftResult,
  MarketplaceListingDraftUpdate,
  MarketplaceMutationResult,
  MarketplaceOwnerDraft,
  MarketplaceOwnerDraftMedia,
  MarketplaceRentalRequestInput,
  MarketplaceServiceBookingInput,
  MarketplaceViewerState,
} from "./market.types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVATE_MARKET_MEDIA_BUCKET = "profile-media";
const MARKET_MEDIA_URL_TTL_SECONDS = 6 * 60 * 60;
const MARKET_MEDIA_URL_REFRESH_MARGIN_MS = 5 * 60 * 1_000;
const MAX_MARKETPLACE_MONEY_MINOR = 1_000_000_000_000;

export const DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES: MarketplaceCatalogCapabilities = {
  catalogVersion: 2,
  cursorVersion: 1,
  maximumPageSize: 100,
  filters: {
    multipleCategories: true,
    multipleConditions: true,
    fulfillmentAnyMatch: true,
    favoritesRequiresAuthentication: true,
    availability: {
      source: "rental_terms.available_from | service_terms.event_date | marketplace_listings.preparation_days",
      contract: "canonical availability date, falling back to preparation lead time",
      values: ["any", "now", "7-days", "30-days"],
    },
  },
  sorts: {
    recommended: { supported: true, source: "published_at" },
    "price-asc": { supported: true, source: "marketplace_listing_prices.primary.amount_minor" },
    "price-desc": { supported: true, source: "marketplace_listing_prices.primary.amount_minor" },
    rating: { supported: true, source: "marketplace_seller_profiles.rating_basis_points" },
    popular: { supported: true, source: "marketplace_seller_profiles.completed_orders_count" },
    distance: {
      supported: false,
      reason: "No public, consented seller coordinates are part of the Marketplace catalogue contract.",
    },
  },
};

type SignedCoverCache = Map<string, { url: string; expiresAt: number }>;

function assertUuid(value: string) {
  if (!UUID_PATTERN.test(value)) throw invalidMarketplaceRequest();
}

function assertIdempotencyKey(value: string) {
  if (value.trim().length < 8 || value.trim().length > 128) throw invalidMarketplaceRequest();
}

function boundedText(value: string, minimum: number, maximum: number) {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw invalidMarketplaceRequest();
  return normalized;
}

function optionalBoundedText(value: string | null | undefined, maximum: number) {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > maximum) throw invalidMarketplaceRequest();
  return normalized;
}

function assertIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(value)) {
    throw invalidMarketplaceRequest();
  }
}

type NormalizedMarketplaceCatalogFilters = {
  pillar: MarketplacePillar | null;
  categoryCodes: string[];
  minimumPriceMinor: number | null;
  maximumPriceMinor: number | null;
  conditionCodes: string[];
  fulfillment: MarketplaceCatalogFulfillment[];
  availability: MarketplaceCatalogAvailability;
  sellerKinds: MarketplaceSellerKind[];
  verifiedOnly: boolean;
  minimumGrade: number | null;
  sort: MarketplaceCatalogSort;
  favoritesOnly: boolean;
  search: string | null;
};

type MarketplaceCatalogRpcFilters = {
  pillar: MarketplacePillar | "all";
  categories: string[];
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  conditions: string[];
  fulfillment: MarketplaceCatalogFulfillment[];
  availability: MarketplaceCatalogAvailability;
  sellerKinds: MarketplaceSellerKind[];
  verifiedOnly: boolean;
  minimumGrade: number | null;
  sort: MarketplaceCatalogServerSort;
  favoritesOnly: boolean;
  search: string | null;
};

export type ResolvedMarketplaceCatalogFilters = {
  filters: NormalizedMarketplaceCatalogFilters;
  rpcFilters: MarketplaceCatalogRpcFilters;
  sortFallback: MarketplaceCatalogSortFallback | null;
};

const MARKETPLACE_PILLARS: readonly MarketplacePillar[] = ["new", "used", "rental", "services", "collective"];
const MARKETPLACE_AVAILABILITY: readonly MarketplaceCatalogAvailability[] = ["any", "now", "7-days", "30-days"];
const MARKETPLACE_FULFILLMENT: readonly MarketplaceCatalogFulfillment[] = ["shipping", "pickup", "remote"];
const MARKETPLACE_SELLER_KINDS: readonly MarketplaceSellerKind[] = ["store", "studio", "artist"];
const MARKETPLACE_SORTS: readonly MarketplaceCatalogSort[] = ["recommended", "price-asc", "price-desc", "rating", "popular", "distance"];
const CANONICAL_MARKETPLACE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

function catalogCodeList(values: readonly string[] | null | undefined, maximum: number) {
  if (values === null || values === undefined) return [];
  if (!Array.isArray(values) || values.length > maximum) {
    throw invalidMarketplaceRequest();
  }
  const normalized = values.map((value) => {
    if (typeof value !== "string") throw invalidMarketplaceRequest();
    const code = value.trim().toLocaleLowerCase("en-US");
    if (code.length > 80 || !CANONICAL_MARKETPLACE_CODE_PATTERN.test(code)) {
      throw invalidMarketplaceRequest();
    }
    return code;
  });
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function catalogEnumList<T extends string>(
  values: readonly T[] | null | undefined,
  allowed: readonly T[],
) {
  if (values === null || values === undefined) return [];
  if (!Array.isArray(values) || values.length > allowed.length
    || values.some((value) => !allowed.includes(value))) {
    throw invalidMarketplaceRequest();
  }
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en-US"));
}

function catalogMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MARKETPLACE_MONEY_MINOR) {
    throw invalidMarketplaceRequest();
  }
  return value;
}

function catalogBoolean(value: boolean | undefined) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw invalidMarketplaceRequest();
  return value;
}

function catalogSearch(value: string | null | undefined) {
  const search = value?.trim() || null;
  if (search && search.length > 120) throw invalidMarketplaceRequest();
  return search;
}

export function normalizeMarketplaceCatalogFilters(
  filters: MarketplaceCatalogFilters | null | undefined,
): NormalizedMarketplaceCatalogFilters {
  const value = filters ?? {};
  const pillar = value.pillar ?? null;
  if (pillar !== null && !MARKETPLACE_PILLARS.includes(pillar)) throw invalidMarketplaceRequest();
  const minimumPriceMinor = catalogMoney(value.minimumPriceMinor);
  const maximumPriceMinor = catalogMoney(value.maximumPriceMinor);
  if (minimumPriceMinor !== null && maximumPriceMinor !== null
    && minimumPriceMinor > maximumPriceMinor) {
    throw invalidMarketplaceRequest();
  }
  const availability = value.availability ?? "any";
  if (!MARKETPLACE_AVAILABILITY.includes(availability)) throw invalidMarketplaceRequest();
  const minimumGrade = value.minimumGrade ?? null;
  if (minimumGrade !== null
    && (!Number.isInteger(minimumGrade) || minimumGrade < 1 || minimumGrade > 6)) {
    throw invalidMarketplaceRequest();
  }
  const sort = value.sort ?? "recommended";
  if (!MARKETPLACE_SORTS.includes(sort)) throw invalidMarketplaceRequest();
  return {
    pillar,
    categoryCodes: catalogCodeList(value.categoryCodes, 50),
    minimumPriceMinor,
    maximumPriceMinor,
    conditionCodes: catalogCodeList(value.conditionCodes, 20),
    fulfillment: catalogEnumList(value.fulfillment, MARKETPLACE_FULFILLMENT),
    availability,
    sellerKinds: catalogEnumList(value.sellerKinds, MARKETPLACE_SELLER_KINDS),
    verifiedOnly: catalogBoolean(value.verifiedOnly),
    minimumGrade,
    sort,
    favoritesOnly: catalogBoolean(value.favoritesOnly),
    search: catalogSearch(value.search),
  };
}

export function resolveMarketplaceCatalogSort(
  requested: MarketplaceCatalogSort,
  capabilities: MarketplaceCatalogCapabilities = DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES,
): { applied: MarketplaceCatalogServerSort; fallback: MarketplaceCatalogSortFallback | null } {
  if (requested !== "distance") return { applied: requested, fallback: null };
  if (capabilities.sorts.distance.supported) {
    // Distance cannot become a server sort until the shared contract adds it
    // to MarketplaceCatalogServerSort and returns a consented distance value.
    throw invalidMarketplaceRequest();
  }
  return {
    applied: "recommended",
    fallback: {
      requested: "distance",
      applied: "recommended",
      reason: "distance_unavailable",
    },
  };
}

export function resolveMarketplaceCatalogFilters(
  input: MarketplaceCatalogInput,
  capabilities: MarketplaceCatalogCapabilities = DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES,
): ResolvedMarketplaceCatalogFilters {
  const explicit = normalizeMarketplaceCatalogFilters(input.filters);
  const legacyPillar = input.pillar ?? null;
  if (legacyPillar !== null && explicit.pillar !== null && legacyPillar !== explicit.pillar) {
    throw invalidMarketplaceRequest();
  }
  const legacyCategory = input.categoryCode?.trim().toLocaleLowerCase("en-US") || null;
  const categories = catalogCodeList([
    ...explicit.categoryCodes,
    ...(legacyCategory ? [legacyCategory] : []),
  ], 50);
  const legacySearch = catalogSearch(input.search);
  if (legacySearch && explicit.search && legacySearch !== explicit.search) {
    throw invalidMarketplaceRequest();
  }
  const filters: NormalizedMarketplaceCatalogFilters = {
    ...explicit,
    pillar: explicit.pillar ?? legacyPillar,
    categoryCodes: categories,
    search: explicit.search ?? legacySearch,
  };
  const sort = resolveMarketplaceCatalogSort(filters.sort, capabilities);
  return {
    filters,
    rpcFilters: {
      pillar: filters.pillar ?? "all",
      categories: filters.categoryCodes,
      priceMinMinor: filters.minimumPriceMinor,
      priceMaxMinor: filters.maximumPriceMinor,
      conditions: filters.conditionCodes,
      fulfillment: filters.fulfillment,
      availability: filters.availability,
      sellerKinds: filters.sellerKinds,
      verifiedOnly: filters.verifiedOnly,
      minimumGrade: filters.minimumGrade,
      sort: sort.applied,
      favoritesOnly: filters.favoritesOnly,
      search: filters.search,
    },
    sortFallback: sort.fallback,
  };
}

/**
 * Converts an HTML datetime-local value with the browser's local timezone to
 * a canonical UTC timestamp. Absolute timestamps are canonicalized too. This
 * prevents PostgreSQL from interpreting a timezone-less string with the
 * database session timezone.
 */
export function toMarketplaceRpcTimestamp(value: string) {
  const normalized = value.trim();
  const absolutePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (absolutePattern.test(normalized)) {
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) throw invalidMarketplaceRequest();
    return parsed.toISOString();
  }

  const local = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!local) throw invalidMarketplaceRequest();
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = "0"] = local;
  const parts = [yearText, monthText, dayText, hourText, minuteText, secondText].map(Number);
  const [year, month, day, hour, minute, second] = parts;
  const parsed = new Date(year, month - 1, day, hour, minute, second, 0);
  if (Number.isNaN(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
    || parsed.getHours() !== hour
    || parsed.getMinutes() !== minute
    || parsed.getSeconds() !== second) {
    throw invalidMarketplaceRequest();
  }
  return parsed.toISOString();
}

function object<T>(data: unknown, fallback: "load_failed" | "mutation_failed"): T {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw toMarketplaceServiceError(null, fallback);
  }
  return data as T;
}

function invalidRpcResponse(fallback: "load_failed" | "mutation_failed"): never {
  throw toMarketplaceServiceError(null, fallback);
}

function responseUuid(value: unknown, fallback: "load_failed" | "mutation_failed") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) invalidRpcResponse(fallback);
  return value;
}

function mutationResult(
  data: unknown,
  listingId: string,
  field: "favorite" | "quantity",
  expectedValue: boolean | number,
): MarketplaceMutationResult {
  const result = object<Record<string, unknown>>(data, "mutation_failed");
  if (responseUuid(result.listing_id, "mutation_failed") !== listingId) {
    invalidRpcResponse("mutation_failed");
  }
  if (field === "favorite") {
    if (typeof result.favorite !== "boolean" || result.favorite !== expectedValue) {
      invalidRpcResponse("mutation_failed");
    }
    return { listing_id: listingId, favorite: result.favorite };
  }
  if (!Number.isSafeInteger(result.quantity) || Number(result.quantity) < 0
    || Number(result.quantity) > 99 || Number(result.quantity) !== expectedValue) {
    invalidRpcResponse("mutation_failed");
  }
  return { listing_id: listingId, quantity: Number(result.quantity) };
}

function listingDraftResult(data: unknown): MarketplaceListingDraftResult {
  const result = object<Record<string, unknown>>(data, "mutation_failed");
  const listingId = responseUuid(result.listing_id, "mutation_failed");
  if (result.status !== "draft" || !Number.isSafeInteger(result.version) || Number(result.version) < 1) {
    invalidRpcResponse("mutation_failed");
  }
  return { listing_id: listingId, status: "draft", version: Number(result.version) };
}

export type MarketplaceOwnerListingSummary = {
  id: string;
  title: string;
  pillar: MarketplacePillar;
  status: "draft" | "published" | "paused";
  version: number;
  updatedAt: string;
  publishedAt: string | null;
};

function listingStatusResult(data: unknown, listingId: string, status: "published" | "paused" | "archived") {
  const result = object<Record<string, unknown>>(data, "mutation_failed");
  if (responseUuid(result.listing_id, "mutation_failed") !== listingId
    || result.status !== status
    || !Number.isSafeInteger(result.version) || Number(result.version) < 1) {
    invalidRpcResponse("mutation_failed");
  }
  return { listing_id: listingId, status, version: Number(result.version) };
}

function draftInteger(value: unknown, minimum: number, maximum: number) {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    invalidRpcResponse("load_failed");
  }
  return Number(value);
}

function draftBoolean(value: unknown) {
  if (typeof value !== "boolean") invalidRpcResponse("load_failed");
  return value;
}

function draftOptionalInteger(value: unknown, minimum: number, maximum: number) {
  if (value === null || value === undefined) return null;
  return draftInteger(value, minimum, maximum);
}

function draftTimestamp(value: unknown) {
  const timestamp = requiredResponseString(value, "load_failed");
  if (Number.isNaN(Date.parse(timestamp))) invalidRpcResponse("load_failed");
  return timestamp;
}

function draftDirectUrl(value: unknown) {
  if (value === null) return null;
  const candidate = requiredResponseString(value, "load_failed");
  if (candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.includes("\\")) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function ownerDraftMedia(value: unknown): MarketplaceOwnerDraftMedia {
  const media = object<Record<string, unknown>>(value, "load_failed");
  const role = media.role;
  if (role !== "cover" && role !== "gallery") invalidRpcResponse("load_failed");
  const mimeType = requiredResponseString(media.mime_type, "load_failed");
  if (![
    "image/jpeg", "image/png", "image/webp", "image/avif",
    "video/mp4", "video/quicktime", "video/webm",
  ].includes(mimeType) || (role === "cover" && !mimeType.startsWith("image/"))) {
    invalidRpcResponse("load_failed");
  }
  const storageBucket = nullableResponseString(media.storage_bucket, "load_failed");
  const storagePath = nullableResponseString(media.storage_path, "load_failed");
  if ((storageBucket === null) !== (storagePath === null)
    || storagePath?.includes("..") || storagePath?.includes("\\")) {
    invalidRpcResponse("load_failed");
  }
  const sourceUrl = draftDirectUrl(media.file_url);
  if (!sourceUrl && (!storagePath || storageBucket !== PRIVATE_MARKET_MEDIA_BUCKET)) {
    invalidRpcResponse("load_failed");
  }
  return {
    mediaFileId: responseUuid(media.media_file_id, "load_failed"),
    role,
    position: draftInteger(media.position, 0, 7),
    name: requiredResponseString(media.name, "load_failed"),
    mimeType,
    sizeBytes: draftInteger(media.size_bytes, 0, 12 * 1024 * 1024),
    storageBucket,
    storagePath,
    sourceUrl,
  };
}

function draftInputFromPayload(value: unknown): MarketplaceListingDraftInput {
  const payload = object<Record<string, unknown>>(value, "load_failed");
  const pillar = payload.pillar;
  if (pillar !== "new" && pillar !== "used" && pillar !== "rental"
    && pillar !== "services" && pillar !== "collective") {
    invalidRpcResponse("load_failed");
  }
  const priceUnit = payload.price_unit;
  if (priceUnit !== "item" && priceUnit !== "day" && priceUnit !== "session"
    && priceUnit !== "ticket" && priceUnit !== "participant") {
    invalidRpcResponse("load_failed");
  }
  const mediaFileIds = rows<unknown>(payload.media_file_ids).map((mediaFileId) => (
    responseUuid(mediaFileId, "load_failed")
  ));
  if (mediaFileIds.length < 1 || mediaFileIds.length > 8
    || new Set(mediaFileIds).size !== mediaFileIds.length) {
    invalidRpcResponse("load_failed");
  }
  const terms = object<Record<string, unknown>>(payload.terms, "load_failed");
  const common = {
    pillar,
    categoryCode: requiredResponseString(payload.category_code, "load_failed"),
    title: requiredResponseString(payload.title, "load_failed"),
    shortDescription: requiredResponseString(payload.short_description, "load_failed"),
    description: requiredResponseString(payload.description, "load_failed"),
    brand: nullableResponseString(payload.brand, "load_failed"),
    model: nullableResponseString(payload.model, "load_failed"),
    conditionCode: nullableResponseString(payload.condition_code, "load_failed"),
    currencyCode: payload.currency_code,
    unitAmountMinor: draftInteger(payload.unit_amount_minor, 0, 1_000_000_000_000),
    priceUnit,
    city: nullableResponseString(payload.city, "load_failed"),
    area: nullableResponseString(payload.area, "load_failed"),
    pickup: draftBoolean(payload.pickup),
    shipping: draftBoolean(payload.shipping),
    remote: draftBoolean(payload.remote),
    shippingAmountMinor: draftInteger(payload.shipping_amount_minor, 0, 1_000_000_000_000),
    preparationDays: draftInteger(payload.preparation_days, 0, 365),
    mediaFileIds,
  };
  if (common.currencyCode !== "EUR" || (!common.pickup && !common.shipping && !common.remote)) {
    invalidRpcResponse("load_failed");
  }

  if (pillar === "new") {
    if (priceUnit !== "item") invalidRpcResponse("load_failed");
    return {
      ...common,
      pillar,
      currencyCode: "EUR",
      priceUnit,
      stock: draftInteger(terms.stock, 0, 100_000),
      warrantyMonths: draftInteger(terms.warranty_months, 0, 240),
      compareAtAmountMinor: draftOptionalInteger(
        terms.compare_at_amount_minor,
        0,
        1_000_000_000_000,
      ),
    };
  }
  if (pillar === "used") {
    if (priceUnit !== "item") invalidRpcResponse("load_failed");
    return {
      ...common,
      pillar,
      currencyCode: "EUR",
      priceUnit,
      purchaseYear: draftOptionalInteger(terms.purchase_year, 1900, 3_000),
      negotiable: draftBoolean(terms.negotiable),
      conditionNotes: nullableResponseString(terms.condition_notes, "load_failed"),
    };
  }
  if (pillar === "rental") {
    if (priceUnit !== "day") invalidRpcResponse("load_failed");
    return {
      ...common,
      pillar,
      currencyCode: "EUR",
      priceUnit,
      dailyAmountMinor: draftInteger(terms.daily_amount_minor, 0, 1_000_000_000_000),
      weekendAmountMinor: draftOptionalInteger(terms.weekend_amount_minor, 0, 1_000_000_000_000),
      weeklyAmountMinor: draftOptionalInteger(terms.weekly_amount_minor, 0, 1_000_000_000_000),
      depositAmountMinor: draftInteger(terms.deposit_amount_minor, 0, 1_000_000_000_000),
      minimumDays: draftInteger(terms.minimum_days, 1, 365),
      availableFrom: requiredResponseString(terms.available_from, "load_failed"),
      instantBook: draftBoolean(terms.instant_book),
    };
  }
  if (pillar === "services") {
    const serviceKind = terms.service_kind;
    if ((priceUnit !== "session" && priceUnit !== "ticket")
      || (serviceKind !== "production" && serviceKind !== "coaching"
        && serviceKind !== "ticket" && serviceKind !== "room")) {
      invalidRpcResponse("load_failed");
    }
    return {
      ...common,
      pillar,
      currencyCode: "EUR",
      priceUnit,
      serviceKind,
      serviceFormat: requiredResponseString(terms.service_format, "load_failed"),
      durationLabel: requiredResponseString(terms.duration_label, "load_failed"),
      deliveryLabel: nullableResponseString(terms.delivery_label, "load_failed"),
      nextAvailability: requiredResponseString(terms.next_availability, "load_failed"),
      eventDate: terms.event_date === null ? null : draftTimestamp(terms.event_date),
      capacity: draftOptionalInteger(terms.capacity, 1, 100_000),
      venueName: nullableResponseString(terms.venue_name, "load_failed"),
      includedEquipment: nullableResponseString(terms.included_equipment, "load_failed"),
    };
  }
  if (priceUnit !== "participant") invalidRpcResponse("load_failed");
  return {
    ...common,
    pillar,
    currencyCode: "EUR",
    priceUnit,
    retailUnitAmountMinor: draftInteger(
      terms.retail_unit_amount_minor,
      0,
      1_000_000_000_000,
    ),
    unlockedUnitAmountMinor: draftInteger(
      terms.unlocked_unit_amount_minor,
      0,
      1_000_000_000_000,
    ),
    targetParticipants: draftInteger(terms.target_participants, 2, 100_000),
    campaignDays: draftInteger(terms.campaign_days, 1, 365),
  };
}

function ownerDraftRow(value: unknown): MarketplaceOwnerDraft {
  const row = object<MarketplaceListingDraftRow>(value, "load_failed");
  if (row.status !== "draft") invalidRpcResponse("load_failed");
  const input = draftInputFromPayload(row.payload);
  const media = rows<unknown>(row.media).map(ownerDraftMedia);
  if (media.length !== input.mediaFileIds.length
    || media.some((item, index) => item.position !== index
      || item.mediaFileId !== input.mediaFileIds[index]
      || item.role !== (index === 0 ? "cover" : "gallery"))) {
    invalidRpcResponse("load_failed");
  }
  return {
    listingId: responseUuid(row.listing_id, "load_failed"),
    status: "draft",
    version: draftInteger(row.version, 1, Number.MAX_SAFE_INTEGER),
    input,
    media,
    createdAt: draftTimestamp(row.created_at),
    updatedAt: draftTimestamp(row.updated_at),
  };
}

function intentResult(
  data: unknown,
  listingId: string,
  kind: MarketplaceIntentResult["kind"],
): MarketplaceIntentResult {
  const result = object<Record<string, unknown>>(data, "mutation_failed");
  const status = result.status;
  if (responseUuid(result.listing_id, "mutation_failed") !== listingId
    || responseUuid(result.intent_id, "mutation_failed").length === 0
    || result.kind !== kind
    || (status !== "pending" && status !== "accepted" && status !== "declined"
      && status !== "cancelled" && status !== "expired")) {
    invalidRpcResponse("mutation_failed");
  }
  return {
    intent_id: String(result.intent_id),
    listing_id: listingId,
    kind,
    status,
  };
}

function intentStatus(
  value: unknown,
  fallback: "load_failed" | "mutation_failed" = "load_failed",
): MarketplaceIntentStatus {
  if (value !== "pending" && value !== "accepted" && value !== "declined"
    && value !== "cancelled" && value !== "expired") {
    invalidRpcResponse(fallback);
  }
  return value;
}

function requiredResponseString(value: unknown, fallback: "load_failed" | "mutation_failed") {
  if (typeof value !== "string" || value.trim().length === 0) invalidRpcResponse(fallback);
  return value;
}

function nullableResponseString(value: unknown, fallback: "load_failed" | "mutation_failed") {
  if (value === null) return null;
  return requiredResponseString(value, fallback);
}

function catalogServerSort(value: unknown): MarketplaceCatalogServerSort {
  if (value !== "recommended" && value !== "price-asc" && value !== "price-desc"
    && value !== "rating" && value !== "popular") {
    invalidRpcResponse("load_failed");
  }
  return value;
}

function catalogCursorTimestamp(value: unknown) {
  const timestamp = requiredResponseString(value, "load_failed");
  if (Number.isNaN(Date.parse(timestamp))) invalidRpcResponse("load_failed");
  return timestamp;
}

function normalizeMarketplaceCatalogCursor(
  cursor: MarketplaceCatalogCursor | null | undefined,
  expectedSort: MarketplaceCatalogServerSort,
): MarketplaceCatalogCursorV1 | null {
  if (!cursor) return null;
  const version = cursor.version ?? 1;
  const sort = cursor.sort ?? "recommended";
  const sortValue = cursor.sortValue ?? null;
  if (version !== 1 || sort !== expectedSort) throw invalidMarketplaceRequest();
  if (sort === "recommended") {
    if (sortValue !== null) throw invalidMarketplaceRequest();
  } else if (!Number.isSafeInteger(sortValue) || Number(sortValue) < 0
    || Number(sortValue) > MAX_MARKETPLACE_MONEY_MINOR) {
    throw invalidMarketplaceRequest();
  }
  if (typeof cursor.publishedAt !== "string" || Number.isNaN(Date.parse(cursor.publishedAt))) {
    throw invalidMarketplaceRequest();
  }
  assertUuid(cursor.listingId);
  return {
    version: 1,
    sort,
    sortValue,
    publishedAt: cursor.publishedAt,
    listingId: cursor.listingId,
  };
}

export function marketplaceCatalogCursorFromRow(
  row: MarketplaceCatalogRow,
): MarketplaceCatalogCursorV1 | null {
  if (Object.prototype.hasOwnProperty.call(row, "next_cursor")) {
    if (row.next_cursor === null) return null;
    const cursor = object<Record<string, unknown>>(row.next_cursor, "load_failed");
    if (cursor.version !== 1) invalidRpcResponse("load_failed");
    const sort = catalogServerSort(cursor.sort);
    const sortValue = cursor.sortValue;
    if (sort === "recommended") {
      if (sortValue !== null) invalidRpcResponse("load_failed");
    } else if (!Number.isSafeInteger(sortValue) || Number(sortValue) < 0
      || Number(sortValue) > MAX_MARKETPLACE_MONEY_MINOR) {
      invalidRpcResponse("load_failed");
    }
    return {
      version: 1,
      sort,
      sortValue: sortValue as number | null,
      publishedAt: catalogCursorTimestamp(cursor.publishedAt),
      listingId: responseUuid(cursor.listingId, "load_failed"),
    };
  }
  if (row.next_cursor_published_at === null && row.next_cursor_listing_id === null) return null;
  if (row.next_cursor_published_at === null || row.next_cursor_listing_id === null) {
    invalidRpcResponse("load_failed");
  }
  return {
    version: 1,
    sort: "recommended",
    sortValue: null,
    publishedAt: catalogCursorTimestamp(row.next_cursor_published_at),
    listingId: responseUuid(row.next_cursor_listing_id, "load_failed"),
  };
}

function capabilityBoolean(record: Record<string, unknown>, key: string) {
  if (typeof record[key] !== "boolean") invalidRpcResponse("load_failed");
  return record[key] as boolean;
}

function capabilityText(record: Record<string, unknown>, key: string) {
  return requiredResponseString(record[key], "load_failed");
}

export function parseMarketplaceCatalogCapabilities(data: unknown): MarketplaceCatalogCapabilities {
  const root = object<Record<string, unknown>>(data, "load_failed");
  if (root.catalog_version !== 2 || root.cursor_version !== 1
    || !Number.isInteger(root.maximum_page_size)
    || Number(root.maximum_page_size) < 1 || Number(root.maximum_page_size) > 100) {
    invalidRpcResponse("load_failed");
  }
  const filters = object<Record<string, unknown>>(root.filters, "load_failed");
  const availability = object<Record<string, unknown>>(filters.availability, "load_failed");
  const availabilityValues = Array.isArray(availability.values)
    ? [...new Set(availability.values)]
    : [];
  if (!Array.isArray(availability.values)
    || availability.values.length !== MARKETPLACE_AVAILABILITY.length
    || availabilityValues.length !== MARKETPLACE_AVAILABILITY.length
    || MARKETPLACE_AVAILABILITY.some((value) => !availabilityValues.includes(value))) {
    invalidRpcResponse("load_failed");
  }
  const sorts = object<Record<string, unknown>>(root.sorts, "load_failed");
  const mappedSorts = Object.fromEntries(MARKETPLACE_SORTS.map((sort) => {
    const definition = object<Record<string, unknown>>(sorts[sort], "load_failed");
    const supported = capabilityBoolean(definition, "supported");
    const source = typeof definition.source === "string" && definition.source.trim()
      ? definition.source.trim()
      : undefined;
    const reason = typeof definition.reason === "string" && definition.reason.trim()
      ? definition.reason.trim()
      : undefined;
    if (supported && !source) invalidRpcResponse("load_failed");
    if (!supported && !reason) invalidRpcResponse("load_failed");
    return [sort, { supported, source, reason }];
  })) as MarketplaceCatalogCapabilities["sorts"];
  return {
    catalogVersion: 2,
    cursorVersion: 1,
    maximumPageSize: Number(root.maximum_page_size),
    filters: {
      multipleCategories: capabilityBoolean(filters, "multiple_categories"),
      multipleConditions: capabilityBoolean(filters, "multiple_conditions"),
      fulfillmentAnyMatch: capabilityBoolean(filters, "fulfillment_any_match"),
      favoritesRequiresAuthentication: capabilityBoolean(filters, "favorites_requires_authentication"),
      availability: {
        source: capabilityText(availability, "source"),
        contract: capabilityText(availability, "contract"),
        values: availabilityValues as MarketplaceCatalogAvailability[],
      },
    },
    sorts: mappedSorts,
  };
}

function intentMutationResult(
  data: unknown,
  fallback: "load_failed" | "mutation_failed" = "mutation_failed",
): MarketplaceIntentResult {
  const result = object<Record<string, unknown>>(data, fallback);
  const kind = result.kind;
  if (kind !== "rental_request" && kind !== "service_booking" && kind !== "collective_join") {
    invalidRpcResponse(fallback);
  }
  return {
    intent_id: responseUuid(result.intent_id, fallback),
    listing_id: responseUuid(result.listing_id, fallback),
    kind,
    status: intentStatus(result.status, fallback),
  };
}

function intentRow(data: unknown): MarketplaceIntentRow {
  const result = object<Record<string, unknown>>(data, "load_failed");
  const base = intentMutationResult({
    intent_id: result.intent_id,
    listing_id: result.listing_id,
    kind: result.kind,
    status: result.status,
  }, "load_failed");
  const listingPillar = result.listing_pillar;
  if (listingPillar !== "new" && listingPillar !== "used" && listingPillar !== "rental"
    && listingPillar !== "services" && listingPillar !== "collective") {
    invalidRpcResponse("load_failed");
  }
  if (!Number.isSafeInteger(result.requested_quantity)
    || Number(result.requested_quantity) < 1 || Number(result.requested_quantity) > 20) {
    invalidRpcResponse("load_failed");
  }
  if (!result.pricing_snapshot || typeof result.pricing_snapshot !== "object"
    || Array.isArray(result.pricing_snapshot)) {
    invalidRpcResponse("load_failed");
  }
  return {
    ...base,
    requested_quantity: Number(result.requested_quantity),
    starts_on: nullableResponseString(result.starts_on, "load_failed"),
    ends_on: nullableResponseString(result.ends_on, "load_failed"),
    requested_for: nullableResponseString(result.requested_for, "load_failed"),
    note: nullableResponseString(result.note, "load_failed"),
    pricing_snapshot: result.pricing_snapshot as Record<string, unknown>,
    buyer_profile_id: responseUuid(result.buyer_profile_id, "load_failed"),
    buyer_display_name: requiredResponseString(result.buyer_display_name, "load_failed"),
    seller_profile_id: result.seller_profile_id === null
      ? null
      : responseUuid(result.seller_profile_id, "load_failed"),
    seller_display_name: nullableResponseString(result.seller_display_name, "load_failed"),
    listing_title: requiredResponseString(result.listing_title, "load_failed"),
    listing_pillar: listingPillar,
    created_at: requiredResponseString(result.created_at, "load_failed"),
    updated_at: requiredResponseString(result.updated_at, "load_failed"),
    responded_at: nullableResponseString(result.responded_at, "load_failed"),
  };
}

function exactListingIds(input: MarketplaceCatalogInput) {
  if (input.listingIds === null || input.listingIds === undefined) return null;
  if (!Array.isArray(input.listingIds) || input.listingIds.length > 100) {
    throw invalidMarketplaceRequest();
  }
  if (input.cursor || input.pillar || input.categoryCode?.trim() || input.search?.trim()
    || input.filters !== null && input.filters !== undefined) {
    throw invalidMarketplaceRequest();
  }
  const listingIds = [...new Set(input.listingIds)];
  listingIds.forEach(assertUuid);
  return listingIds;
}

function listingDraftRpcPayload(input: MarketplaceListingDraftInput) {
  if (!Number.isInteger(input.unitAmountMinor) || input.unitAmountMinor < 0) {
    throw invalidMarketplaceRequest();
  }
  if (!Array.isArray(input.mediaFileIds) || input.mediaFileIds.length < 1
    || input.mediaFileIds.length > 8 || new Set(input.mediaFileIds).size !== input.mediaFileIds.length) {
    throw invalidMarketplaceRequest();
  }
  input.mediaFileIds.forEach(assertUuid);
  const commonPayload = {
    pillar: input.pillar,
    category_code: boundedText(input.categoryCode, 1, 80),
    title: boundedText(input.title, 3, 140),
    short_description: boundedText(input.shortDescription, 3, 280),
    description: boundedText(input.description, 3, 5000),
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    condition_code: input.conditionCode?.trim() || null,
    currency_code: input.currencyCode,
    unit_amount_minor: input.unitAmountMinor,
    price_unit: input.priceUnit,
    city: optionalBoundedText(input.city, 120),
    area: optionalBoundedText(input.area, 120),
    pickup: input.pickup,
    shipping: input.shipping,
    remote: input.remote,
    shipping_amount_minor: input.shippingAmountMinor ?? 0,
    preparation_days: input.preparationDays ?? 0,
    media_file_ids: input.mediaFileIds,
  };
  const terms = input.pillar === "new"
    ? { stock: input.stock, warranty_months: input.warrantyMonths, compare_at_amount_minor: input.compareAtAmountMinor ?? null }
    : input.pillar === "used"
      ? { purchase_year: input.purchaseYear ?? null, negotiable: input.negotiable, condition_notes: optionalBoundedText(input.conditionNotes, 2000) }
      : input.pillar === "rental"
        ? { daily_amount_minor: input.dailyAmountMinor, weekend_amount_minor: input.weekendAmountMinor ?? null, weekly_amount_minor: input.weeklyAmountMinor ?? null, deposit_amount_minor: input.depositAmountMinor, minimum_days: input.minimumDays, available_from: input.availableFrom, instant_book: input.instantBook }
        : input.pillar === "services"
          ? { service_kind: input.serviceKind, service_format: boundedText(input.serviceFormat, 1, 120), duration_label: boundedText(input.durationLabel, 1, 120), delivery_label: optionalBoundedText(input.deliveryLabel, 160), next_availability: boundedText(input.nextAvailability, 1, 160), event_date: input.eventDate ? toMarketplaceRpcTimestamp(input.eventDate) : null, capacity: input.capacity ?? null, venue_name: optionalBoundedText(input.venueName, 180), included_equipment: optionalBoundedText(input.includedEquipment, 2000) }
          : { retail_unit_amount_minor: input.retailUnitAmountMinor, unlocked_unit_amount_minor: input.unlockedUnitAmountMinor, target_participants: input.targetParticipants, campaign_days: input.campaignDays };
  return { ...commonPayload, terms };
}

function rows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw toMarketplaceServiceError(null, "load_failed");
  return data as T[];
}

async function hydrateCatalogCoverUrls(
  client: SupabaseClient,
  catalogRows: MarketplaceCatalogRow[],
  cache: SignedCoverCache,
) {
  const now = Date.now();
  const paths = [...new Set(catalogRows.flatMap((row) => {
    if (row.cover_url || row.cover_storage_bucket !== PRIVATE_MARKET_MEDIA_BUCKET
      || typeof row.cover_storage_path !== "string"
      || !row.cover_storage_path.startsWith(`${row.seller_profile_id}/`)
      || row.cover_storage_path.includes("..")
      || row.cover_storage_path.includes("\\")) {
      return [];
    }
    const cached = cache.get(row.cover_storage_path);
    return cached && cached.expiresAt > now ? [] : [row.cover_storage_path];
  }))];
  if (paths.length > 0) {
    const { data, error } = await client.storage
      .from(PRIVATE_MARKET_MEDIA_BUCKET)
      .createSignedUrls(paths, MARKET_MEDIA_URL_TTL_SECONDS);
    if (!error && data) {
      data.forEach((signed, index) => {
        if (!signed.signedUrl) return;
        const path = signed.path || paths[index];
        if (!path || !paths.includes(path)) return;
        cache.set(path, {
          url: signed.signedUrl,
          expiresAt: now + MARKET_MEDIA_URL_TTL_SECONDS * 1_000 - MARKET_MEDIA_URL_REFRESH_MARGIN_MS,
        });
      });
    }
  }
  return catalogRows.map((row) => {
    if (row.cover_url || !row.cover_storage_path) return row;
    const signed = cache.get(row.cover_storage_path);
    return signed && signed.expiresAt > now ? { ...row, cover_url: signed.url } : row;
  });
}

async function hydrateOwnerDraftMediaUrls(
  client: SupabaseClient,
  drafts: MarketplaceOwnerDraft[],
  cache: SignedCoverCache,
) {
  const now = Date.now();
  const paths = [...new Set(drafts.flatMap((draft) => draft.media.flatMap((media) => {
    if (media.sourceUrl || media.storageBucket !== PRIVATE_MARKET_MEDIA_BUCKET
      || !media.storagePath) return [];
    const cached = cache.get(media.storagePath);
    return cached && cached.expiresAt > now ? [] : [media.storagePath];
  })))];
  if (paths.length > 0) {
    const { data, error } = await client.storage
      .from(PRIVATE_MARKET_MEDIA_BUCKET)
      .createSignedUrls(paths, MARKET_MEDIA_URL_TTL_SECONDS);
    if (!error) {
      data?.forEach((signed, index) => {
        if (!signed.signedUrl) return;
        const path = signed.path || paths[index];
        if (!path || !paths.includes(path)) return;
        cache.set(path, {
          url: signed.signedUrl,
          expiresAt: now + MARKET_MEDIA_URL_TTL_SECONDS * 1_000 - MARKET_MEDIA_URL_REFRESH_MARGIN_MS,
        });
      });
    }
  }
  return drafts.map((draft) => ({
    ...draft,
    media: draft.media.map((media) => {
      if (media.sourceUrl || !media.storagePath) return media;
      const signed = cache.get(media.storagePath);
      return signed && signed.expiresAt > now
        ? { ...media, sourceUrl: signed.url }
        : media;
    }),
  }));
}

function secureUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("secure_random_uuid_unavailable");
}

export function createMarketplaceIdempotencyKey(scope = "marketplace") {
  const prefix = scope.toLocaleLowerCase("en-US").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
    || "marketplace";
  return `${prefix}:${secureUuid()}`;
}

export type MarketplaceRepository = ReturnType<typeof createMarketplaceRepository>;

export function createMarketplaceRepository(client: SupabaseClient = supabase) {
  const signedCoverCache: SignedCoverCache = new Map();
  let catalogCapabilitiesPromise: Promise<MarketplaceCatalogCapabilities> | null = null;
  const setSellerKind = async (sellerKind: MarketplaceSellerKind) => {
    if (!MARKETPLACE_SELLER_KINDS.includes(sellerKind)) {
      throw invalidMarketplaceRequest();
    }
    const { data, error } = await client.rpc("set_my_marketplace_seller_kind_v1", {
      p_seller_kind: sellerKind,
    });
    if (error) throw toMarketplaceServiceError(error, "mutation_failed");
    if (data !== sellerKind) invalidRpcResponse("mutation_failed");
    return sellerKind;
  };
  return {
    async listCatalog(input: MarketplaceCatalogInput = {}) {
      const listingIds = exactListingIds(input);
      if (listingIds?.length === 0) return [];
      const limit = listingIds?.length ?? input.limit ?? 48;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidMarketplaceRequest();
      const resolved = listingIds
        ? null
        : resolveMarketplaceCatalogFilters(input, DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES);
      const cursor = normalizeMarketplaceCatalogCursor(input.cursor, resolved?.rpcFilters.sort ?? "recommended");
      const { data, error } = await client.rpc("list_marketplace_catalog_v2", {
        p_cursor: cursor,
        p_limit: limit,
        p_filters: resolved?.rpcFilters ?? {},
        p_listing_ids: listingIds,
      });
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      return hydrateCatalogCoverUrls(client, rows<MarketplaceCatalogRow>(data), signedCoverCache);
    },

    async getCatalogCapabilities() {
      if (!catalogCapabilitiesPromise) {
        catalogCapabilitiesPromise = (async () => {
          const { data, error } = await client.rpc("get_marketplace_catalog_capabilities_v1");
          if (error) throw toMarketplaceServiceError(error, "load_failed");
          return parseMarketplaceCatalogCapabilities(data);
        })().catch((error) => {
          catalogCapabilitiesPromise = null;
          throw error;
        });
      }
      return catalogCapabilitiesPromise;
    },

    async getViewerState() {
      const { data, error } = await client.rpc("get_my_marketplace_state_v1");
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      return object<MarketplaceViewerState>(data, "load_failed");
    },

    async getSellerKind() {
      const { data, error } = await client.rpc("get_my_marketplace_seller_kind_v1");
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      if (typeof data !== "string"
        || !MARKETPLACE_SELLER_KINDS.includes(data as MarketplaceSellerKind)) {
        invalidRpcResponse("load_failed");
      }
      return data as MarketplaceSellerKind;
    },

    async setFavorite(listingId: string, favorite: boolean, idempotencyKey: string) {
      assertUuid(listingId);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("set_marketplace_favorite_v1", {
        p_listing_id: listingId,
        p_favorite: favorite,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return mutationResult(data, listingId, "favorite", favorite);
    },

    async setCartQuantity(listingId: string, quantity: number, idempotencyKey: string) {
      assertUuid(listingId);
      assertIdempotencyKey(idempotencyKey);
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 99) throw invalidMarketplaceRequest();
      const { data, error } = await client.rpc("set_marketplace_cart_item_v1", {
        p_listing_id: listingId,
        p_quantity: quantity,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return mutationResult(data, listingId, "quantity", quantity);
    },

    setSellerKind,

    async createListingDraft(input: MarketplaceListingDraftInput, idempotencyKey: string) {
      assertIdempotencyKey(idempotencyKey);
      const payload = listingDraftRpcPayload(input);
      const { data, error } = input.sellerKind
        ? await client.rpc("create_marketplace_listing_draft_v2", {
            p_payload: payload,
            p_idempotency_key: idempotencyKey.trim(),
            p_seller_kind: input.sellerKind,
          })
        : await client.rpc("create_marketplace_listing_draft_v1", {
            p_payload: payload,
            p_idempotency_key: idempotencyKey.trim(),
          });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return listingDraftResult(data);
    },

    async listMyListingDrafts(limit = 50) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw invalidMarketplaceRequest();
      }
      const { data, error } = await client.rpc("list_my_marketplace_listing_drafts_v1", {
        p_limit: limit,
      });
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      return hydrateOwnerDraftMediaUrls(
        client,
        rows<unknown>(data).map(ownerDraftRow),
        signedCoverCache,
      );
    },

    async updateListingDraft(update: MarketplaceListingDraftUpdate) {
      assertUuid(update.listingId);
      assertIdempotencyKey(update.idempotencyKey);
      if (!Number.isSafeInteger(update.expectedVersion) || update.expectedVersion < 1) {
        throw invalidMarketplaceRequest();
      }
      const payload = listingDraftRpcPayload(update.input);
      const { data, error } = update.input.sellerKind
        ? await client.rpc("update_marketplace_listing_draft_v2", {
            p_listing_id: update.listingId,
            p_expected_version: update.expectedVersion,
            p_payload: payload,
            p_idempotency_key: update.idempotencyKey.trim(),
            p_seller_kind: update.input.sellerKind,
          })
        : await client.rpc("update_marketplace_listing_draft_v1", {
            p_listing_id: update.listingId,
            p_expected_version: update.expectedVersion,
            p_payload: payload,
            p_idempotency_key: update.idempotencyKey.trim(),
          });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      const result = listingDraftResult(data);
      if (result.listing_id !== update.listingId || result.version <= update.expectedVersion) {
        invalidRpcResponse("mutation_failed");
      }
      return result;
    },

    async setListingStatus(input: {
      listingId: string;
      expectedVersion: number;
      status: "published" | "paused" | "archived";
      idempotencyKey: string;
    }) {
      assertUuid(input.listingId);
      assertIdempotencyKey(input.idempotencyKey);
      if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
        throw invalidMarketplaceRequest();
      }
      const { data, error } = await client.rpc("marketplace_set_listing_status_v1", {
        p_listing_id: input.listingId,
        p_expected_version: input.expectedVersion,
        p_status: input.status,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return listingStatusResult(data, input.listingId, input.status);
    },

    async listMyListings(limit = 100): Promise<MarketplaceOwnerListingSummary[]> {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalidMarketplaceRequest();
      const { data, error } = await client.rpc("list_my_marketplace_listings_v1", { p_limit: limit });
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      return rows<unknown>(data).map((value) => {
        const row = object<Record<string, unknown>>(value, "load_failed");
        const id = responseUuid(row.id, "load_failed");
        if (typeof row.title !== "string" || !row.title.trim()
          || !["new", "used", "rental", "services", "collective"].includes(String(row.pillar))
          || !["draft", "published", "paused"].includes(String(row.status))
          || !Number.isSafeInteger(row.version) || Number(row.version) < 1
          || typeof row.updated_at !== "string" || Number.isNaN(Date.parse(row.updated_at))
          || row.published_at !== null && (typeof row.published_at !== "string" || Number.isNaN(Date.parse(row.published_at)))) {
          invalidRpcResponse("load_failed");
        }
        return {
          id,
          title: row.title as string,
          pillar: row.pillar as MarketplacePillar,
          status: row.status as MarketplaceOwnerListingSummary["status"],
          version: Number(row.version),
          updatedAt: row.updated_at as string,
          publishedAt: row.published_at as string | null,
        };
      });
    },

    async createRentalRequest(input: MarketplaceRentalRequestInput) {
      assertUuid(input.listingId);
      assertIdempotencyKey(input.idempotencyKey);
      assertIsoDate(input.startsOn);
      assertIsoDate(input.endsOn);
      const { data, error } = await client.rpc("create_marketplace_rental_request_v1", {
        p_listing_id: input.listingId,
        p_starts_on: input.startsOn,
        p_ends_on: input.endsOn,
        p_note: optionalBoundedText(input.note, 1000),
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return intentResult(data, input.listingId, "rental_request");
    },

    async createServiceBooking(input: MarketplaceServiceBookingInput) {
      assertUuid(input.listingId);
      assertIdempotencyKey(input.idempotencyKey);
      const requestedFor = input.requestedFor
        ? toMarketplaceRpcTimestamp(input.requestedFor)
        : null;
      const { data, error } = await client.rpc("create_marketplace_service_booking_v1", {
        p_listing_id: input.listingId,
        p_requested_for: requestedFor,
        p_note: optionalBoundedText(input.note, 1000),
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return intentResult(data, input.listingId, "service_booking");
    },

    async joinCollective(input: MarketplaceCollectiveJoinInput) {
      assertUuid(input.listingId);
      assertIdempotencyKey(input.idempotencyKey);
      if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 20) throw invalidMarketplaceRequest();
      const { data, error } = await client.rpc("join_marketplace_collective_v1", {
        p_listing_id: input.listingId,
        p_quantity: input.quantity,
        p_idempotency_key: input.idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return intentResult(data, input.listingId, "collective_join");
    },

    async listMyIntents(input: MarketplaceIntentListInput) {
      const limit = input.limit ?? 50;
      if ((input.role !== "buyer" && input.role !== "seller")
        || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw invalidMarketplaceRequest();
      }
      if (input.status !== null && input.status !== undefined) intentStatus(input.status);
      const { data, error } = await client.rpc("list_my_marketplace_intents_v1", {
        p_role: input.role,
        p_status: input.status ?? null,
        p_limit: limit,
      });
      if (error) throw toMarketplaceServiceError(error, "load_failed");
      return rows<unknown>(data).map(intentRow);
    },

    async updateIntentStatus(
      intentId: string,
      status: "accepted" | "declined",
      idempotencyKey: string,
    ) {
      assertUuid(intentId);
      assertIdempotencyKey(idempotencyKey);
      if (status !== "accepted" && status !== "declined") throw invalidMarketplaceRequest();
      const { data, error } = await client.rpc("update_marketplace_intent_status_v1", {
        p_intent_id: intentId,
        p_status: status,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return intentMutationResult(data);
    },

    async cancelIntent(intentId: string, idempotencyKey: string) {
      assertUuid(intentId);
      assertIdempotencyKey(idempotencyKey);
      const { data, error } = await client.rpc("cancel_marketplace_intent_v1", {
        p_intent_id: intentId,
        p_idempotency_key: idempotencyKey.trim(),
      });
      if (error) throw toMarketplaceServiceError(error, "mutation_failed");
      return intentMutationResult(data);
    },
  };
}

export const marketplaceRepository = createMarketplaceRepository();
