import {
  getLocalPreviewFollowState,
  setLocalPreviewFollowState,
} from "../auth/localAuthPreview";
import {
  getFollowStates,
  isCanonicalProfileId,
  setFollowState,
} from "../globe/api/preProfile.api";
import type { TremplinArtist } from "./tremplinArtistData";

export type TremplinFollowPersistence = "remote" | "preview" | "fixture";

export function getTremplinFollowTargetId(artist: TremplinArtist) {
  return artist.profileId?.trim() || artist.id;
}

export async function loadConnectedTremplinFollows(
  artists: readonly TremplinArtist[],
  localPreviewEnabled: boolean,
) {
  if (localPreviewEnabled) {
    return new Set(artists
      .filter((artist) => getLocalPreviewFollowState(getTremplinFollowTargetId(artist)))
      .map(({ id }) => id));
  }
  const canonicalArtists = artists.filter((artist) => isCanonicalProfileId(getTremplinFollowTargetId(artist)));
  if (canonicalArtists.length === 0) return new Set<string>();
  const state = await getFollowStates(canonicalArtists.map(getTremplinFollowTargetId));
  return new Set(canonicalArtists
    .filter((artist) => state.followingProfileIds.has(getTremplinFollowTargetId(artist)))
    .map(({ id }) => id));
}

export async function persistTremplinFollow({
  artist,
  following,
  localPreviewEnabled,
}: {
  artist: TremplinArtist;
  following: boolean;
  localPreviewEnabled: boolean;
}): Promise<{ following: boolean; persistence: TremplinFollowPersistence }> {
  const targetId = getTremplinFollowTargetId(artist);
  if (localPreviewEnabled) {
    return {
      following: setLocalPreviewFollowState(targetId, following),
      persistence: "preview",
    };
  }
  if (!isCanonicalProfileId(targetId)) throw new Error("Profil de démonstration non relié à un compte réel");
  const state = await setFollowState(targetId, following);
  return { following: state.following, persistence: "remote" };
}
