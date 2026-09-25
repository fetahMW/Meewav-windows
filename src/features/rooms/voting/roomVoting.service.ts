import { supabase } from "../../../lib/supabaseClient";
import { PUBLIC_VOTING, validateRoomVotingPolicy, type RoomVoteMode, type RoomVotingPolicy } from "./roomVoting";

const key = (roomId: string) => `meewav:room-voting:v1:${roomId}`;
const listeners = new Map<string, Set<() => void>>();
const cache = new Map<string, RoomVotingPolicy>();
const inFlight = new Map<string, Promise<RoomVotingPolicy>>();
const channels = new Map<string, { channel: ReturnType<typeof supabase.channel>; users: number }>();
export function readDemoVotingPolicy(roomId: string): RoomVotingPolicy {
  if (typeof localStorage === "undefined") return PUBLIC_VOTING;
  try { return JSON.parse(localStorage.getItem(key(roomId)) ?? "null") ?? PUBLIC_VOTING; } catch { return PUBLIC_VOTING; }
}
export function cachedVotingPolicy(roomId: string, source: "demo" | "live") {
  return source === "demo" ? readDemoVotingPolicy(roomId) : cache.get(roomId) ?? PUBLIC_VOTING;
}
function publish(roomId: string, policy: RoomVotingPolicy) {
  const previous = cache.get(roomId);
  if (previous?.revision === policy.revision && previous.mode === policy.mode && previous.jurorIds.join("|") === policy.jurorIds.join("|")) return;
  cache.set(roomId, policy); listeners.get(roomId)?.forEach(fn => fn());
}
export async function loadVotingPolicy(roomId: string, source: "demo" | "live") {
  if (source === "demo") return readDemoVotingPolicy(roomId);
  const pending = inFlight.get(roomId);
  if (pending) return pending;
  const request = (async () => {
    const {data,error} = await supabase.rpc("rooms_get_voting_policy_v1", {p_room_id:roomId});
    if (error) throw new Error("Le réglage du jury n’est pas disponible sur ce serveur.");
    publish(roomId, (data ?? PUBLIC_VOTING) as RoomVotingPolicy);
    return cache.get(roomId) ?? PUBLIC_VOTING;
  })();
  inFlight.set(roomId, request);
  try { return await request; } finally { inFlight.delete(roomId); }
}
export async function saveVotingPolicy(roomId: string, source: "demo" | "live", mode: RoomVoteMode, jurorIds: string[], backstageIds: string[], revision: number) {
  const ids = validateRoomVotingPolicy(mode,jurorIds,backstageIds);
  if (source === "live") {
    const {data,error} = await supabase.rpc("rooms_set_voting_policy_v1",{p_room_id:roomId,p_mode:mode,p_juror_ids:ids,p_expected_revision:revision});
    if(error) throw new Error(error.message);
    publish(roomId,data as RoomVotingPolicy); return data as RoomVotingPolicy;
  }
  const apply = () => {
    const previous = readDemoVotingPolicy(roomId);
    if(previous.revision!==revision) throw new Error("Le jury vient de changer. Rouvre le réglage avant de confirmer.");
    const policy = {mode,jurorIds:ids,revision:revision+1};
    localStorage.setItem(key(roomId),JSON.stringify(policy));publish(roomId,policy);return policy;
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request(key(roomId),apply) : apply();
}
export function subscribeVotingPolicy(roomId: string, source: "demo" | "live", callback: () => void) {
  const set = listeners.get(roomId) ?? new Set();set.add(callback);listeners.set(roomId,set);
  const onStorage=(event:StorageEvent)=>{if(event.key===key(roomId))callback();};
  window.addEventListener("storage",onStorage);
  if (source === "live") {
    const existing = channels.get(roomId);
    if (existing) existing.users++;
    else channels.set(roomId, { users: 1, channel: supabase.channel(`room-voting:${roomId}`).on("postgres_changes",{event:"*",schema:"public",table:"room_voting_policies",filter:`room_id=eq.${roomId}`},()=>{void loadVotingPolicy(roomId,source).catch(()=>undefined);}).subscribe() });
  }
  return ()=>{
    set.delete(callback); if (!set.size) listeners.delete(roomId);
    window.removeEventListener("storage",onStorage);
    const active = source === "live" ? channels.get(roomId) : undefined;
    if (active && --active.users === 0) { channels.delete(roomId); void supabase.removeChannel(active.channel); }
  };
}
