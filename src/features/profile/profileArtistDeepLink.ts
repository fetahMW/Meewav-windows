const PROFILE_REFERENCE_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,199}$/i;

/**
 * Public cross-feature artist reference.
 *
 * It can be either a canonical profile UUID or a local demo slug. The
 * destination must still resolve the reference against its own public data;
 * this helper deliberately never turns it into a backend identity.
 */
export function safeProfileArtistReference(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return PROFILE_REFERENCE_PATTERN.test(normalized) ? normalized : null;
}

export function getProfileArtistDeepLink(search: string | URLSearchParams) {
  const params = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;
  return safeProfileArtistReference(params.get("artist"));
}
