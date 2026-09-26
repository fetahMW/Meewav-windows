import {
  getPreProfileGoldenLikeState,
  givePreProfileGoldenLike,
} from "../globe/api/preProfile.api";
import { supabase } from "../../lib/supabaseClient";

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

/** Events only invalidate the cache: quotas and totals are always reread through the RPC. */
export function subscribeGoldenLikeChanges(viewerId: string, artistIds: string[], refresh: () => void) {
  let active = true;
  const channel = supabase.channel(`golden-likes:${viewerId}:${crypto.randomUUID()}`);
  const invalidate = () => { if (active) refresh(); };
  channel.on("postgres_changes", { event: "*", schema: "public", table: "daily_golden_likes", filter: `giver_id=eq.${viewerId}` }, invalidate);
  for (const id of new Set(artistIds)) channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${id}` }, invalidate);
  channel.subscribe(status => { if (status === "SUBSCRIBED") invalidate(); });
  return () => { active = false; void supabase.removeChannel(channel); };
}
