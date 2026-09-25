import { isMessagingUuid } from "../messaging/messaging.route";

export type SceneArtistIdentitySource = {
  profileId?: string | null;
  artistId?: string | null;
  mockArtistId?: string | null;
};

/**
 * La Scène has historically received the canonical profile UUID through
 * different fields. Resolve it once so Profile, Message and Collab always
 * agree on whether an artist is backed by the real messaging service.
 */
export function resolveSceneCanonicalProfileId(
  artist: SceneArtistIdentitySource,
): string | null {
  const candidates = [artist.profileId, artist.artistId, artist.mockArtistId];
  return candidates.find((candidate): candidate is string => isMessagingUuid(candidate)) ?? null;
}
