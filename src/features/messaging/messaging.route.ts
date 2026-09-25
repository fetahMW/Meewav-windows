import type { MessagingSpace } from "./messagingDemoData";

export type MessagingRouteIntent = "message" | "collaboration" | null;
export type MessagingRouteSource =
  | "globe"
  | "profile"
  | "messaging"
  | "rooms"
  | "shorts"
  | "marketplace"
  | "tremplin"
  | null;
export type MessagingOriginSource = Exclude<MessagingRouteSource, null>;

export type MessagingRouteState = {
  space: MessagingSpace;
  intent: MessagingRouteIntent;
  source: MessagingRouteSource;
  profileId: string | null;
  mockArtistId: string | null;
  mockArtistName: string | null;
  mockArtistRole: string | null;
  mockArtistAvatar: string | null;
  mockArtistGradeLevel: number | null;
  mode: "real" | "demo";
  conversationId: string | null;
  requestId: string | null;
  projectId: string | null;
  groupId: string | null;
  marketListingId: string | null;
  marketListingTitle: string | null;
  returnTo: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKETPLACE_LISTING_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,199}$/i;
const spaces = new Set<MessagingSpace>(["messages", "collabs", "projects", "groups"]);
const sources = new Set<Exclude<MessagingRouteSource, null>>([
  "globe",
  "profile",
  "messaging",
  "rooms",
  "shorts",
  "marketplace",
  "tremplin",
]);

export function isMessagingUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function safeUuid(value: string | null) {
  return isMessagingUuid(value) ? value : null;
}

function safeDemoId(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized && normalized.length <= 200 ? normalized : null;
}

function hasControlCharacter(value: string) {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function safeDemoText(value: string | null, maxLength: number) {
  const raw = value ?? "";
  if (hasControlCharacter(raw)) return null;
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function safeDemoAvatar(value: string | null) {
  const raw = value ?? "";
  if (hasControlCharacter(raw)) return null;
  const normalized = raw.trim();
  if (
    !normalized
    || normalized.length > 500
    || !normalized.startsWith("/")
    || normalized.startsWith("//")
    || normalized.includes("\\")
  ) return null;
  return normalized;
}

function safeDemoGradeLevel(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isInteger(numeric) && numeric >= 1 && numeric <= 6 ? numeric : null;
}

export function safeMarketplaceListingId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return MARKETPLACE_LISTING_ID_PATTERN.test(normalized) ? normalized : null;
}

export function getMarketplaceListingId(search: string | URLSearchParams) {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  return safeMarketplaceListingId(params.get("listing"));
}

export function buildMarketplaceListingReturnPath(listingId: string) {
  const safeListingId = safeMarketplaceListingId(listingId);
  if (!safeListingId) return "/market";
  const params = new URLSearchParams({ listing: safeListingId });
  return `/market?${params.toString()}`;
}

function safeMarketplaceTitle(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ") ?? "";
  return normalized ? normalized.slice(0, 140) : null;
}

function safeMarketplaceReturnPath(value: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized === "/market" || normalized.startsWith("/market?") || normalized.startsWith("/market#")
    ? normalized.slice(0, 500)
    : null;
}

export function parseMessagingRoute(search: string | URLSearchParams): MessagingRouteState {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  // `tab` is kept as a read-only compatibility alias for links already emitted
  // by the Globe. New URLs are always written with the canonical `space` key.
  const requestedSpace = params.get("space") ?? params.get("tab") ?? "messages";
  const requestedIntent = params.get("intent");
  const requestedSource = params.get("source");
  const explicitMode = params.get("mode");
  const legacyProfileId = params.get("profileId");
  const realProfileId = safeUuid(legacyProfileId);
  const explicitMockArtistId = safeDemoId(params.get("mockArtistId"));
  const mode = explicitMode === "demo" || (!realProfileId && Boolean(explicitMockArtistId || legacyProfileId))
    ? "demo"
    : "real";
  const source = sources.has(requestedSource as Exclude<MessagingRouteSource, null>)
    ? requestedSource as Exclude<MessagingRouteSource, null>
    : null;
  const marketListingId = safeMarketplaceListingId(params.get("listing"));
  const explicitReturnTo = safeMarketplaceReturnPath(params.get("returnTo"));

  return {
    space: spaces.has(requestedSpace as MessagingSpace)
      ? requestedSpace as MessagingSpace
      : "messages",
    intent: requestedIntent === "message" || requestedIntent === "collaboration"
      ? requestedIntent
      : null,
    source,
    profileId: mode === "real" ? realProfileId : null,
    mockArtistId: mode === "demo"
      ? explicitMockArtistId ?? safeDemoId(legacyProfileId)
      : null,
    mockArtistName: mode === "demo" ? safeDemoText(params.get("mockArtistName"), 100) : null,
    mockArtistRole: mode === "demo" ? safeDemoText(params.get("mockArtistRole"), 140) : null,
    mockArtistAvatar: mode === "demo" ? safeDemoAvatar(params.get("mockArtistAvatar")) : null,
    mockArtistGradeLevel: mode === "demo"
      ? safeDemoGradeLevel(params.get("mockArtistGradeLevel"))
      : null,
    mode,
    conversationId: safeUuid(params.get("conversation")),
    requestId: safeUuid(params.get("request")),
    projectId: safeUuid(params.get("project")),
    groupId: safeUuid(params.get("group")),
    marketListingId,
    marketListingTitle: safeMarketplaceTitle(params.get("listingTitle")),
    returnTo: source === "marketplace" && marketListingId
      ? buildMarketplaceListingReturnPath(marketListingId)
      : explicitReturnTo,
  };
}

export function buildMessagingRoute(state: Partial<MessagingRouteState>) {
  const params = new URLSearchParams();
  const space = state.space && spaces.has(state.space) ? state.space : "messages";
  params.set("space", space);
  if (state.conversationId && isMessagingUuid(state.conversationId)) params.set("conversation", state.conversationId);
  if (state.requestId && isMessagingUuid(state.requestId)) params.set("request", state.requestId);
  if (state.projectId && isMessagingUuid(state.projectId)) params.set("project", state.projectId);
  if (state.groupId && isMessagingUuid(state.groupId)) params.set("group", state.groupId);
  if (state.profileId && isMessagingUuid(state.profileId)) params.set("profileId", state.profileId);
  const demoTarget = state.mode === "demo" && safeDemoId(state.mockArtistId ?? null);
  if (demoTarget) {
    params.set("mockArtistId", demoTarget);
    const mockArtistName = safeDemoText(state.mockArtistName ?? null, 100);
    const mockArtistRole = safeDemoText(state.mockArtistRole ?? null, 140);
    const mockArtistAvatar = safeDemoAvatar(state.mockArtistAvatar ?? null);
    const mockArtistGradeLevel = safeDemoGradeLevel(state.mockArtistGradeLevel);
    if (mockArtistName) params.set("mockArtistName", mockArtistName);
    if (mockArtistRole) params.set("mockArtistRole", mockArtistRole);
    if (mockArtistAvatar) params.set("mockArtistAvatar", mockArtistAvatar);
    if (mockArtistGradeLevel) params.set("mockArtistGradeLevel", String(mockArtistGradeLevel));
  }
  if (state.mode) params.set("mode", state.mode);
  if (state.intent) params.set("intent", state.intent);
  if (state.source) params.set("source", state.source);
  if (state.source === "marketplace") {
    const marketListingId = safeMarketplaceListingId(state.marketListingId);
    if (marketListingId) params.set("listing", marketListingId);
    if (state.marketListingTitle?.trim()) params.set("listingTitle", state.marketListingTitle.trim().replace(/\s+/g, " ").slice(0, 140));
    const returnTo = marketListingId
      ? buildMarketplaceListingReturnPath(marketListingId)
      : safeMarketplaceReturnPath(state.returnTo ?? null);
    if (returnTo) params.set("returnTo", returnTo);
  }
  return `/messages?${params.toString()}`;
}

export function getDirectConversationTarget(state: MessagingRouteState) {
  return state.mode === "real" && state.space === "messages" && state.intent === "message"
    ? state.profileId
    : null;
}

export function getDemoConversationTarget(state: MessagingRouteState) {
  return state.mode === "demo" && state.space === "messages" && state.intent === "message"
    ? state.mockArtistId
    : null;
}
