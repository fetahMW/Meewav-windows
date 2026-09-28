import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getGoldenLikeState, giveGoldenLike, subscribeGoldenLikeChanges, type GoldenLikeState } from "../../goldenLikes/goldenLikeApi";
import type { PlaceRoomState } from "./place.types";

type Snapshot = { day: string; states: Record<string, GoldenLikeState>; used: boolean; givenId?: string };
type CageGoldenLikes = Snapshot & {
  canSupport: boolean;
  pending: boolean;
  load: (artistId: string, force?: boolean) => Promise<GoldenLikeState | null>;
  giveArtist: (artistId: string) => Promise<boolean>;
  giveHost: (send: () => boolean | Promise<boolean>) => Promise<boolean>;
};
const Context = createContext<CageGoldenLikes | null>(null);
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = () => dayFormatter.format(new Date());
const empty = (): Snapshot => ({ day: dayKey(), states: {}, used: false });

// Both artist tiles and host controls share the same daily allowance.
export function CageGoldenLikeProvider({ room, viewerId, canSupport, enabled, children }: {
  room: PlaceRoomState; viewerId?: string | null; canSupport: boolean; enabled: boolean; children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState(empty);
  const current = useRef(snapshot);
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const revision = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(new Map<string, Promise<GoldenLikeState | null>>());
  const demo = room.source === "demo";
  const commit = useCallback((change: (previous: Snapshot) => Snapshot) => {
    if (!mounted.current) return;
    current.current = change(current.current);
    setSnapshot(current.current);
  }, []);
  const rollover = useCallback(() => {
    if (current.current.day !== dayKey()) {
      inFlight.current.clear();
      commit(empty);
    }
  }, [commit]);
  const load = useCallback(async (artistId: string, force = false): Promise<GoldenLikeState | null> => {
    if (!enabled || !canSupport || !viewerId || !artistId || artistId === viewerId) return null;
    rollover();
    if (!force && current.current.states[artistId]) return current.current.states[artistId];
    const existing = inFlight.current.get(artistId);
    if (existing) return existing;
    const requestedDay = current.current.day;
    const requestedRevision = revision.current;
    const request = (async () => {
      try {
        const state: GoldenLikeState = demo ? {
          ok: true, authenticated: true, artistId, goldenLikesCount: current.current.states[artistId]?.goldenLikesCount ?? 0,
          usedToday: current.current.used, availableToday: !current.current.used,
          givenToThisArtistToday: current.current.givenId === artistId, givenArtistId: current.current.givenId,
        } : await getGoldenLikeState(artistId);
        if (!state.ok || current.current.day !== requestedDay || dayKey() !== requestedDay) return null;
        if (requestedRevision !== revision.current) return current.current.states[artistId] ?? null;
        commit((previous) => ({ ...previous, states: { ...previous.states, [artistId]: state },
          used: state.usedToday,
          givenId: state.givenArtistId ?? (state.givenToThisArtistToday ? artistId : undefined) }));
        return state;
      } catch { return null; }
    })();
    inFlight.current.set(artistId, request);
    void request.then(() => { if (inFlight.current.get(artistId) === request) inFlight.current.delete(artistId); });
    return request;
  }, [canSupport, commit, demo, enabled, rollover, viewerId]);

  const send = useCallback(async (artistId: string, hostSend?: () => boolean | Promise<boolean>) => {
    rollover();
    if (!enabled || !canSupport || !viewerId || artistId === viewerId || locked.current || current.current.used) return false;
    locked.current = true;
    setPending(true);
    try {
      // Recheck with the shared ledger in case another surface consumed today's Golden Like.
      const state = await load(artistId, true);
      if (!state?.authenticated || !state.availableToday || current.current.used) return false;
      const result = hostSend ? { ok: await hostSend() }
        : demo ? { ok: true, goldenLikesCount: state.goldenLikesCount + 1 }
        : await giveGoldenLike(artistId);
      if (!result.ok) { await load(artistId, true); return false; }
      revision.current += 1;
      commit((previous) => ({ ...previous, used: true, givenId: artistId,
        states: { ...previous.states, [artistId]: { ...state, usedToday: true, availableToday: false,
          givenArtistId: artistId, givenToThisArtistToday: true,
          goldenLikesCount: "goldenLikesCount" in result ? result.goldenLikesCount ?? state.goldenLikesCount : state.goldenLikesCount + 1 } } }));
      return true;
    } catch { return false; }
    finally { locked.current = false; if (mounted.current) setPending(false); }
  }, [canSupport, commit, demo, enabled, load, rollover, viewerId]);
  const giveArtist = useCallback((artistId: string) => send(artistId), [send]);
  const giveHost = useCallback((action: () => boolean | Promise<boolean>) => send(room.host.id, action), [room.host.id, send]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!enabled) return;
    // Room reactions update optimistically; only the ledger confirms a real daily spend.
    if (demo && room.currentUserHasGoldenLiked && !locked.current) commit((previous) => ({ ...previous, used: true, givenId: room.host.id }));
    void load(room.host.id, room.currentUserHasGoldenLiked && !locked.current);
  }, [commit, demo, enabled, load, room.currentUserHasGoldenLiked, room.host.id]);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => {
      rollover();
      for (const id of new Set([room.host.id, ...Object.keys(current.current.states)])) void load(id, true);
    };
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") refresh(); }, 15_000);
    window.addEventListener("focus", refresh);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, load, rollover, room.host.id]);
  const observedArtists = Object.keys(snapshot.states).sort().join(",");
  useEffect(() => {
    if (!enabled || demo || !canSupport || !viewerId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeGoldenLikeChanges(viewerId, [room.host.id, ...observedArtists.split(",").filter(Boolean)], () => {
      clearTimeout(timer);
      timer = setTimeout(() => { for (const id of new Set([room.host.id, ...Object.keys(current.current.states)])) void load(id, true); }, 120);
    });
    return () => { clearTimeout(timer); unsubscribe(); };
  }, [enabled, demo, canSupport, viewerId, observedArtists, room.host.id, load]);
  return <Context.Provider value={enabled ? { ...snapshot, canSupport: canSupport && Boolean(viewerId), pending, load, giveArtist, giveHost } : null}>{children}</Context.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCageGoldenLikes = () => useContext(Context);
