import cover01 from "./assets/fallback-covers/place-fallback-cover-01.webp";
import cover02 from "./assets/fallback-covers/place-fallback-cover-02.webp";
import cover03 from "./assets/fallback-covers/place-fallback-cover-03.webp";
import cover04 from "./assets/fallback-covers/place-fallback-cover-04.webp";
import cover05 from "./assets/fallback-covers/place-fallback-cover-05.webp";
import cover06 from "./assets/fallback-covers/place-fallback-cover-06.webp";
import cover07 from "./assets/fallback-covers/place-fallback-cover-07.webp";
import cover08 from "./assets/fallback-covers/place-fallback-cover-08.webp";
import cover09 from "./assets/fallback-covers/place-fallback-cover-09.webp";
import cover10 from "./assets/fallback-covers/place-fallback-cover-10.webp";
import cover11 from "./assets/fallback-covers/place-fallback-cover-11.webp";
import cover12 from "./assets/fallback-covers/place-fallback-cover-12.webp";

export const PLACE_MIXER_FALLBACK_COVERS = [
  cover01,
  cover02,
  cover03,
  cover04,
  cover05,
  cover06,
  cover07,
  cover08,
  cover09,
  cover10,
  cover11,
  cover12,
] as const;

export type PlaceMixerCoverIdentity = {
  cover?: string | null;
  seed?: string | null;
  id?: string | null;
  title?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileLastModified?: number | null;
  sourceUrl?: string | null;
};

function stableCoverHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getPlaceMixerFallbackCover(seed: string) {
  const normalizedSeed = seed.trim() || "meewav-room-player";
  return PLACE_MIXER_FALLBACK_COVERS[stableCoverHash(normalizedSeed) % PLACE_MIXER_FALLBACK_COVERS.length];
}

export function resolvePlaceMixerCover(identity: PlaceMixerCoverIdentity) {
  const explicitCover = identity.cover?.trim();
  if (explicitCover) return explicitCover;

  const stableSource = identity.sourceUrl?.startsWith("blob:") ? "" : identity.sourceUrl?.trim() ?? "";
  const explicitSeed = identity.seed?.trim();
  const hasFileIdentity = Boolean(identity.fileName || identity.fileSize != null || identity.fileLastModified != null);
  const seed = explicitSeed || (hasFileIdentity
    ? [
        identity.fileName?.trim(),
        identity.fileSize == null ? "" : String(identity.fileSize),
        identity.fileLastModified == null ? "" : String(identity.fileLastModified),
      ].filter(Boolean).join("|")
    : [identity.id?.trim(), identity.title?.trim(), stableSource].filter(Boolean).join("|"));

  return getPlaceMixerFallbackCover(seed);
}
