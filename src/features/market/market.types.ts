export type MarketplacePillar = "new" | "used" | "rental" | "services" | "collective";
export type MarketplaceListingStatus = "draft" | "pending_review" | "published" | "paused" | "sold_out" | "rejected" | "archived";
export type MarketplaceIntentKind = "rental_request" | "service_booking" | "collective_join";
export type MarketplacePriceUnit = "item" | "day" | "session" | "ticket" | "participant";

export type MarketplaceCatalogFulfillment = "shipping" | "pickup" | "remote";
export type MarketplaceCatalogAvailability = "any" | "now" | "7-days" | "30-days";
export type MarketplaceSellerKind = "store" | "studio" | "artist";
export type MarketplaceCatalogServerSort =
  | "recommended"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "popular";
export type MarketplaceCatalogSort = MarketplaceCatalogServerSort | "distance";

/**
 * Canonical discovery filters understood by the Marketplace catalogue RPC.
 * Category and condition values are database codes, never translated labels.
 * Prices use minor currency units (cents for EUR).
 */
export type MarketplaceCatalogFilters = {
  pillar?: MarketplacePillar | null;
  categoryCodes?: readonly string[] | null;
  minimumPriceMinor?: number | null;
  maximumPriceMinor?: number | null;
  conditionCodes?: readonly string[] | null;
  fulfillment?: readonly MarketplaceCatalogFulfillment[] | null;
  availability?: MarketplaceCatalogAvailability | null;
  sellerKinds?: readonly MarketplaceSellerKind[] | null;
  verifiedOnly?: boolean;
  minimumGrade?: number | null;
  sort?: MarketplaceCatalogSort | null;
  favoritesOnly?: boolean;
  search?: string | null;
};

export type MarketplaceCatalogSortFallback = {
  requested: "distance";
  applied: "recommended";
  reason: "distance_unavailable";
};

export type MarketplaceCatalogCapabilities = {
  catalogVersion: 2;
  cursorVersion: 1;
  maximumPageSize: number;
  filters: {
    multipleCategories: boolean;
    multipleConditions: boolean;
    fulfillmentAnyMatch: boolean;
    favoritesRequiresAuthentication: boolean;
    availability: {
      source: string;
      contract: string;
      values: readonly MarketplaceCatalogAvailability[];
    };
  };
  sorts: Record<MarketplaceCatalogSort, {
    supported: boolean;
    source?: string;
    reason?: string;
  }>;
};

export type MarketplaceCatalogCursorV1 = {
  version: 1;
  sort: MarketplaceCatalogServerSort;
  sortValue: number | null;
  publishedAt: string;
  listingId: string;
};

/** Transitional shape returned by the v1 catalogue adapter. */
export type MarketplaceLegacyCatalogCursor = {
  version?: never;
  sort?: never;
  sortValue?: never;
  publishedAt: string;
  listingId: string;
};

export type MarketplaceCatalogCursor = MarketplaceCatalogCursorV1 | MarketplaceLegacyCatalogCursor;

export type MarketplaceCatalogRow = {
  listing_id: string;
  seller_profile_id: string;
  seller_display_name: string;
  seller_username: string | null;
  seller_avatar_url: string | null;
  seller_grade_level: number | null;
  seller_verified: boolean;
  seller_rating_basis_points: number;
  seller_rating_count: number;
  seller_completed_orders_count: number;
  seller_response_time_bucket: string | null;
  slug: string;
  pillar: MarketplacePillar;
  category_code: string;
  title: string;
  short_description: string;
  description: string;
  brand: string | null;
  model: string | null;
  condition_code: string | null;
  condition_label: string | null;
  cover_url: string | null;
  cover_storage_bucket: string | null;
  cover_storage_path: string | null;
  cover_alt: string | null;
  badge_label: string | null;
  city_label: string | null;
  area_label: string | null;
  pickup_enabled: boolean;
  shipping_enabled: boolean;
  shipping_amount_minor: number;
  currency_code: string;
  unit_amount_minor: number;
  compare_at_amount_minor: number | null;
  price_unit: MarketplacePriceUnit;
  max_quantity: number;
  preparation_days: number;
  new_terms: Record<string, unknown> | null;
  used_terms: Record<string, unknown> | null;
  rental_terms: Record<string, unknown> | null;
  service_terms: Record<string, unknown> | null;
  collective_terms: Record<string, unknown> | null;
  published_at: string;
  next_cursor_published_at: string | null;
  next_cursor_listing_id: string | null;
  /** Additive v2 catalogue projection. Optional while v1 fixtures coexist. */
  seller_kind?: MarketplaceSellerKind;
  remote_enabled?: boolean;
  viewer_favorite?: boolean;
  availability_bucket?: Exclude<MarketplaceCatalogAvailability, "any"> | "later";
  sort_applied?: MarketplaceCatalogServerSort;
  distance_supported?: boolean;
  distance_km?: number | null;
  next_cursor?: MarketplaceCatalogCursorV1 | null;
};

export type MarketplaceViewerState = {
  favorite_listing_ids: string[];
  cart_items: Array<{ listing_id: string; quantity: number }>;
  joined_collective_listing_ids: string[];
};

export type MarketplaceCatalogInput = {
  cursor?: MarketplaceCatalogCursor | null;
  limit?: number;
  pillar?: MarketplacePillar | null;
  categoryCode?: string | null;
  search?: string | null;
  /** Additive server-side discovery criteria. */
  filters?: MarketplaceCatalogFilters | null;
  /** Exclusive exact-ID hydration mode, primarily for private cart state. */
  listingIds?: string[] | null;
};

type MarketplaceListingDraftBase = {
  pillar: MarketplacePillar;
  /** Owner-controlled public seller classification, persisted separately. */
  sellerKind?: MarketplaceSellerKind;
  categoryCode: string;
  title: string;
  shortDescription: string;
  description: string;
  brand?: string | null;
  model?: string | null;
  conditionCode?: string | null;
  currencyCode: "EUR";
  unitAmountMinor: number;
  priceUnit: MarketplacePriceUnit;
  city?: string | null;
  area?: string | null;
  pickup: boolean;
  shipping: boolean;
  remote: boolean;
  shippingAmountMinor?: number;
  preparationDays?: number;
  mediaFileIds: string[];
};

export type MarketplaceListingDraftInput = MarketplaceListingDraftBase & (
  | {
    pillar: "new";
    stock: number;
    warrantyMonths: number;
    compareAtAmountMinor?: number | null;
  }
  | {
    pillar: "used";
    purchaseYear?: number | null;
    negotiable: boolean;
    conditionNotes?: string | null;
  }
  | {
    pillar: "rental";
    dailyAmountMinor: number;
    weekendAmountMinor?: number | null;
    weeklyAmountMinor?: number | null;
    depositAmountMinor: number;
    minimumDays: number;
    availableFrom: string;
    instantBook: boolean;
  }
  | {
    pillar: "services";
    serviceKind: "production" | "coaching" | "ticket" | "room";
    serviceFormat: string;
    durationLabel: string;
    deliveryLabel?: string | null;
    nextAvailability: string;
    eventDate?: string | null;
    capacity?: number | null;
    venueName?: string | null;
    includedEquipment?: string | null;
  }
  | {
    pillar: "collective";
    retailUnitAmountMinor: number;
    unlockedUnitAmountMinor: number;
    targetParticipants: number;
    campaignDays: number;
  }
);

export type MarketplaceListingDraftResult = {
  listing_id: string;
  status: MarketplaceListingStatus;
  version: number;
};

export type MarketplaceListingDraftRow = {
  listing_id: string;
  status: "draft";
  version: number;
  payload: Record<string, unknown>;
  media: unknown[];
  created_at: string;
  updated_at: string;
};

export type MarketplaceOwnerDraftMedia = {
  mediaFileId: string;
  role: "cover" | "gallery";
  position: number;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageBucket: string | null;
  storagePath: string | null;
  sourceUrl: string | null;
};

export type MarketplaceOwnerDraft = {
  listingId: string;
  status: "draft";
  version: number;
  input: MarketplaceListingDraftInput;
  media: MarketplaceOwnerDraftMedia[];
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceListingDraftUpdate = {
  listingId: string;
  expectedVersion: number;
  input: MarketplaceListingDraftInput;
  idempotencyKey: string;
};

export type MarketplaceRentalRequestInput = {
  listingId: string;
  startsOn: string;
  endsOn: string;
  note?: string | null;
  idempotencyKey: string;
};

export type MarketplaceServiceBookingInput = {
  listingId: string;
  requestedFor?: string | null;
  note?: string | null;
  idempotencyKey: string;
};

export type MarketplaceCollectiveJoinInput = {
  listingId: string;
  quantity: number;
  idempotencyKey: string;
};

export type MarketplaceIntentResult = {
  intent_id: string;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  listing_id: string;
  kind: MarketplaceIntentKind;
};

export type MarketplaceIntentStatus = MarketplaceIntentResult["status"];
export type MarketplaceIntentRole = "buyer" | "seller";

export type MarketplaceIntentRow = MarketplaceIntentResult & {
  requested_quantity: number;
  starts_on: string | null;
  ends_on: string | null;
  requested_for: string | null;
  note: string | null;
  pricing_snapshot: Record<string, unknown>;
  buyer_profile_id: string;
  buyer_display_name: string;
  seller_profile_id: string | null;
  seller_display_name: string | null;
  listing_title: string;
  listing_pillar: MarketplacePillar;
  created_at: string;
  updated_at: string;
  responded_at: string | null;
};

export type MarketplaceIntentListInput = {
  role: MarketplaceIntentRole;
  status?: MarketplaceIntentStatus | null;
  limit?: number;
};

export type MarketplaceMutationResult = {
  listing_id: string;
  favorite?: boolean;
  quantity?: number;
};
