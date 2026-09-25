import {
  getPreProfileGoldenLikeState,
  givePreProfileGoldenLike,
} from "../globe/api/preProfile.api";

export type GoldenLikeState = {
  ok: boolean;
  reason?: string;
  artistId?: string;
  goldenLikesCount: number;
  authenticated: boolean;
  usedToday: boolean;
  availableToday: boolean;
  givenToThisArtistToday: boolean;
  givenArtistId?: string;
  dayKey?: string;
  availableAt?: string;
  cooldownSeconds?: number;
};

export async function getGoldenLikeState(artistId: string): Promise<GoldenLikeState> {
  return getPreProfileGoldenLikeState(artistId);
}

export async function giveGoldenLike(artistId: string) {
  return givePreProfileGoldenLike(artistId);
}
