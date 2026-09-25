import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getGoldenLikeState,
  giveGoldenLike,
  type GoldenLikeState,
} from "../goldenLikes/goldenLikeApi";
import { getSceneMediaLikeStates, toggleSceneMediaLike, type SceneMediaLikeState } from "../scene/sceneLikesApi";
import type { ShortsVideoItem } from "./shorts-wall-data";

const SHORTS_ENGAGEMENT_STORAGE_KEY = "meewav:shorts:engagement:v1";

type StoredGoldenLike = {
  day: string;
  artistId: string;
};

type StoredShortsEngagement = {
  likedVideoIds: string[];
  goldenLike: StoredGoldenLike | null;
};

type CachedGoldenLikeState = GoldenLikeState & {
  hydratedParisDay: string;
};

type RealGoldenLikeQuota = {
  dayKey: string;
  usedToday: boolean;
  givenProfileId: string | null;
};

const EMPTY_ENGAGEMENT: StoredShortsEngagement = {
  likedVideoIds: [],
  goldenLike: null,
};

export type GoldenLikeRequestResult =
  | "confirmation"
  | "already-given"
  | "unavailable"
  | "error";
export type GoldenLikeConfirmation = {
  item: ShortsVideoItem;
  mode: "real" | "demo";
  status: "sent" | "already-sent" | "quota-used";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function hasCanonicalProfileId(item: Pick<ShortsVideoItem, "profileId">) {
  return Boolean(item.profileId && UUID_PATTERN.test(item.profileId));
}

export function getParisDayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function readStoredEngagement(): StoredShortsEngagement {
  if (typeof window === "undefined") return EMPTY_ENGAGEMENT;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SHORTS_ENGAGEMENT_STORAGE_KEY) ?? "{}",
    ) as Partial<StoredShortsEngagement>;
    const likedVideoIds = Array.isArray(value.likedVideoIds)
      ? value.likedVideoIds.filter((id): id is string => typeof id === "string").slice(0, 2_000)
      : [];
    const goldenLike = value.goldenLike
      && typeof value.goldenLike.day === "string"
      && typeof value.goldenLike.artistId === "string"
      ? value.goldenLike
      : null;
    return { likedVideoIds, goldenLike };
  } catch {
    return EMPTY_ENGAGEMENT;
  }
}

function persistEngagement(value: StoredShortsEngagement) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHORTS_ENGAGEMENT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The optimistic state remains usable when private browsing blocks storage.
  }
}

export function useShortsEngagement(
  canonicalItems: readonly Pick<ShortsVideoItem, "id" | "profileId">[] = [],
) {
  const [stored, setStored] = useState<StoredShortsEngagement>(readStoredEngagement);
  const [pendingGoldenLike, setPendingGoldenLike] = useState<ShortsVideoItem | null>(null);
  const [goldenLikeSubmitting, setGoldenLikeSubmitting] = useState(false);
  const [parisDayKey, setParisDayKey] = useState(getParisDayKey);
  const [serverStates, setServerStates] = useState<Record<string, CachedGoldenLikeState>>({});
  const [serverLikeStates, setServerLikeStates] = useState<Record<string, SceneMediaLikeState>>({});
  const [realQuota, setRealQuota] = useState<RealGoldenLikeQuota>(() => ({
    dayKey: getParisDayKey(),
    usedToday: false,
    givenProfileId: null,
  }));
  const parisDayKeyRef = useRef(parisDayKey);
  const serverStatesRef = useRef(serverStates);
  const realQuotaRef = useRef(realQuota);
  const hydrationInFlightRef = useRef(new Map<string, Promise<CachedGoldenLikeState>>());
  const submitLockRef = useRef(false);
  const canonicalProfileIds = useMemo(
    () => [...new Set(
      canonicalItems
        .map((item) => item.profileId)
        .filter((profileId): profileId is string => Boolean(
          profileId && UUID_PATTERN.test(profileId),
        )),
    )],
    [canonicalItems],
  );
  const canonicalMediaIds = useMemo(
    () => [...new Set(canonicalItems
      .filter((item) => hasCanonicalProfileId(item) && UUID_PATTERN.test(item.id))
      .map(({ id }) => id))],
    [canonicalItems],
  );
  const likedIds = useMemo(() => new Set(stored.likedVideoIds), [stored.likedVideoIds]);
  const demoGoldenArtistId = stored.goldenLike?.day === parisDayKey
    ? stored.goldenLike.artistId
    : null;

  useEffect(() => {
    serverStatesRef.current = serverStates;
  }, [serverStates]);

  useEffect(() => {
    parisDayKeyRef.current = parisDayKey;
  }, [parisDayKey]);

  useEffect(() => {
    realQuotaRef.current = realQuota;
  }, [realQuota]);

  const updateRealQuota = useCallback((quota: RealGoldenLikeQuota) => {
    realQuotaRef.current = quota;
    setRealQuota(quota);
  }, []);

  const rolloverToDay = useCallback((nextDay: string) => {
    if (parisDayKeyRef.current === nextDay) return;
    parisDayKeyRef.current = nextDay;
    setParisDayKey(nextDay);
    serverStatesRef.current = {};
    setServerStates({});
    updateRealQuota({
      dayKey: nextDay,
      usedToday: false,
      givenProfileId: null,
    });
  }, [updateRealQuota]);

  const cacheServerState = useCallback((
    profileId: string,
    state: GoldenLikeState,
    hydratedParisDay = getParisDayKey(),
  ) => {
    const cached: CachedGoldenLikeState = {
      ...state,
      hydratedParisDay,
    };
    serverStatesRef.current = {
      ...serverStatesRef.current,
      [profileId]: cached,
    };
    setServerStates(serverStatesRef.current);
    return cached;
  }, []);

  const mergeRealQuotaFromState = useCallback((
    profileId: string,
    state: GoldenLikeState,
    dayKey: string,
  ) => {
    const current = realQuotaRef.current.dayKey === dayKey
      ? realQuotaRef.current
      : { dayKey, usedToday: false, givenProfileId: null };
    const reportedGivenProfileId = state.givenArtistId && UUID_PATTERN.test(state.givenArtistId)
      ? state.givenArtistId
      : state.givenToThisArtistToday ? profileId : null;
    if (!state.usedToday) {
      if (!current.usedToday) updateRealQuota(current);
      return current;
    }
    const next = {
      dayKey,
      usedToday: true,
      // A legacy/non-beneficiary response cannot erase a recipient already
      // identified by another concurrent target hydration.
      givenProfileId: current.givenProfileId ?? reportedGivenProfileId,
    };
    updateRealQuota(next);
    return next;
  }, [updateRealQuota]);

  const hydrateGoldenProfile = useCallback((profileId: string, force = false) => {
    const initialDayKey = getParisDayKey();
    rolloverToDay(initialDayKey);
    const cached = serverStatesRef.current[profileId];
    if (!force && cached?.hydratedParisDay === initialDayKey) return Promise.resolve(cached);
    const inFlight = hydrationInFlightRef.current.get(profileId);
    if (inFlight) return inFlight;

    const request = (async () => {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const requestDayKey = getParisDayKey();
        rolloverToDay(requestDayKey);
        const state = await getGoldenLikeState(profileId);
        const responseDayKey = getParisDayKey();
        if (responseDayKey !== requestDayKey) {
          // Never cache an old-day response under the new Paris day. Retry once
          // with a fresh server snapshot after synchronizing the rollover.
          rolloverToDay(responseDayKey);
          continue;
        }
        const hydrated = cacheServerState(profileId, state, requestDayKey);
        mergeRealQuotaFromState(profileId, state, requestDayKey);
        return hydrated;
      }
      throw new Error("golden_like_state_stale_day");
    })()
      .finally(() => {
        hydrationInFlightRef.current.delete(profileId);
      });
    hydrationInFlightRef.current.set(profileId, request);
    return request;
  }, [cacheServerState, mergeRealQuotaFromState, rolloverToDay]);

  const refreshGoldenProfileAfterMutation = useCallback(async (profileId: string) => {
    const preMutationSnapshot = hydrationInFlightRef.current.get(profileId);
    if (preMutationSnapshot) {
      try {
        await preMutationSnapshot;
      } catch {
        // A failed pre-mutation snapshot must not prevent the authoritative
        // post-mutation refresh.
      }
    }
    return hydrateGoldenProfile(profileId, true);
  }, [hydrateGoldenProfile]);

  const ensureCanonicalHydration = useCallback(async () => {
    if (canonicalProfileIds.length === 0) return true;
    try {
      await hydrateGoldenProfile(canonicalProfileIds[0]);
      let quota = realQuotaRef.current;
      // New servers expose givenArtistId in the first response. Probe more
      // targets only for an old server that reports a used but unknown quota.
      for (
        let index = 1;
        quota.usedToday && !quota.givenProfileId && index < canonicalProfileIds.length;
        index += 1
      ) {
        await hydrateGoldenProfile(canonicalProfileIds[index]);
        quota = realQuotaRef.current;
      }
      return true;
    } catch {
      return false;
    }
  }, [canonicalProfileIds, hydrateGoldenProfile]);

  useEffect(() => {
    persistEngagement(stored);
  }, [stored]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const synchronize = (event: StorageEvent) => {
      if (event.key === SHORTS_ENGAGEMENT_STORAGE_KEY) {
        setStored(readStoredEngagement());
      }
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  useEffect(() => {
    const refreshParisDay = () => {
      rolloverToDay(getParisDayKey());
    };
    const timer = window.setInterval(refreshParisDay, 60_000);
    return () => window.clearInterval(timer);
  }, [rolloverToDay]);

  useEffect(() => {
    void ensureCanonicalHydration();
  }, [ensureCanonicalHydration]);

  useEffect(() => {
    if (canonicalMediaIds.length === 0) return;
    let active = true;
    void getSceneMediaLikeStates(canonicalMediaIds).then((states) => {
      if (!active) return;
      setServerLikeStates(Object.fromEntries(states.map((state) => [state.mediaId, state])));
    }).catch(() => {
      // Demo likes remain local while the reaction backend is unavailable.
    });
    return () => { active = false; };
  }, [canonicalMediaIds]);

  const toggleLike = useCallback((item: ShortsVideoItem) => {
    if (hasCanonicalProfileId(item) && UUID_PATTERN.test(item.id)) {
      const previous = serverLikeStates[item.id] ?? { mediaId: item.id, liked: false, likeCount: item.likeCount };
      setServerLikeStates((current) => ({ ...current, [item.id]: {
        ...previous,
        liked: !previous.liked,
        likeCount: Math.max(0, previous.likeCount + (previous.liked ? -1 : 1)),
      } }));
      void toggleSceneMediaLike(item.id).then((next) => {
        setServerLikeStates((current) => ({ ...current, [item.id]: next }));
      }).catch(() => {
        setServerLikeStates((current) => ({ ...current, [item.id]: previous }));
      });
      return;
    }
    setStored((current) => {
      const nextIds = new Set(current.likedVideoIds);
      if (nextIds.has(item.id)) nextIds.delete(item.id);
      else nextIds.add(item.id);
      return { ...current, likedVideoIds: [...nextIds] };
    });
  }, [serverLikeStates]);

  const requestGoldenLike = useCallback(async (
    item: ShortsVideoItem,
  ): Promise<GoldenLikeRequestResult> => {
    let currentDay = getParisDayKey();
    rolloverToDay(currentDay);
    if (!hasCanonicalProfileId(item)) {
      if (!await ensureCanonicalHydration()) return "error";
      // Hydration can cross Paris midnight. Always take a fresh day snapshot
      // before applying either the real or local quota.
      currentDay = getParisDayKey();
      rolloverToDay(currentDay);
      const hydratedQuota = realQuotaRef.current;
      if (hydratedQuota.dayKey === currentDay && hydratedQuota.usedToday) {
        return "unavailable";
      }
      const currentArtist = stored.goldenLike?.day === currentDay
        ? stored.goldenLike.artistId
        : null;
      if (currentArtist === item.artistId) return "already-given";
      if (currentArtist) return "unavailable";
      setPendingGoldenLike(item);
      return "confirmation";
    }

    const profileId = item.profileId as string;
    const currentDemoArtist = stored.goldenLike?.day === currentDay
      ? stored.goldenLike.artistId
      : null;
    if (currentDemoArtist) return "unavailable";
    const currentQuota = realQuotaRef.current;
    if (
      currentQuota.dayKey === currentDay
      && currentQuota.usedToday
      && currentQuota.givenProfileId
    ) {
      return currentQuota.givenProfileId === profileId ? "already-given" : "unavailable";
    }
    let state: CachedGoldenLikeState;
    try {
      state = await hydrateGoldenProfile(profileId);
    } catch {
      // A canonical profile never falls back to the local demo quota.
      return "error";
    }
    if (!state.ok) return "error";
    const mergedQuota = realQuotaRef.current;
    if (
      mergedQuota.dayKey === currentDay
      && mergedQuota.usedToday
      && mergedQuota.givenProfileId
    ) {
      return mergedQuota.givenProfileId === profileId ? "already-given" : "unavailable";
    }
    if (state.givenToThisArtistToday || state.givenArtistId === profileId) {
      return "already-given";
    }
    if (state.usedToday || !state.availableToday) return "unavailable";
    setPendingGoldenLike(item);
    return "confirmation";
  }, [ensureCanonicalHydration, hydrateGoldenProfile, rolloverToDay, stored.goldenLike]);

  const confirmGoldenLike = useCallback(async (): Promise<GoldenLikeConfirmation | null> => {
    if (!pendingGoldenLike || submitLockRef.current) return null;
    const item = pendingGoldenLike;
    const realProfileId = hasCanonicalProfileId(item) ? item.profileId as string : null;

    submitLockRef.current = true;
    setGoldenLikeSubmitting(true);
    try {
      if (realProfileId) {
        const submittedParisDay = getParisDayKey();
        rolloverToDay(submittedParisDay);
        const result = await giveGoldenLike(realProfileId);
        const responseParisDay = getParisDayKey();
        rolloverToDay(responseParisDay);
        const serverDay = result.dayKey && DAY_KEY_PATTERN.test(result.dayKey)
          ? result.dayKey
          : submittedParisDay;
        const acceptedStatus = result.reason === "golden_like_sent"
          ? "sent"
          : result.reason === "golden_like_already_sent"
            ? "already-sent"
            : result.reason === "already_used_today"
              ? "quota-used"
              : null;
        if (!acceptedStatus) {
          throw new Error(result.reason || "golden_like_rejected");
        }
        if (serverDay !== responseParisDay) {
          // The POST is authoritative for its own day, but must never consume
          // the quota of the new Paris day. Refresh that day without turning a
          // successful POST into a generic error if the refresh is offline.
          setPendingGoldenLike(null);
          try {
            await refreshGoldenProfileAfterMutation(realProfileId);
          } catch {
            // The new day remains conservatively represented by rollover state.
          }
          return { item, mode: "real", status: acceptedStatus };
        }
        const previous = serverStatesRef.current[realProfileId];
        const count = typeof result.goldenLikesCount === "number"
          ? Math.max(0, result.goldenLikesCount)
          : previous?.goldenLikesCount ?? item.goldenLikeCount;

        if (result.reason === "already_used_today") {
          cacheServerState(realProfileId, {
            ...previous,
            ok: false,
            reason: result.reason,
            artistId: realProfileId,
            goldenLikesCount: count,
            authenticated: true,
            usedToday: true,
            availableToday: false,
            givenToThisArtistToday: false,
            ...(result.dayKey ? { dayKey: result.dayKey } : {}),
            ...(result.availableAt ? { availableAt: result.availableAt } : {}),
            ...(typeof result.cooldownSeconds === "number"
              ? { cooldownSeconds: result.cooldownSeconds }
              : {}),
          }, serverDay);
          updateRealQuota({
            dayKey: serverDay,
            usedToday: true,
            givenProfileId: realQuotaRef.current.givenProfileId,
          });
          try {
            await refreshGoldenProfileAfterMutation(realProfileId);
          } catch {
            // Keep the conservative used/null quota if beneficiary hydration
            // is temporarily unavailable.
          }
          setPendingGoldenLike(null);
          return { item, mode: "real", status: "quota-used" };
        }

        cacheServerState(realProfileId, {
          ...previous,
          ok: true,
          reason: result.reason,
          artistId: realProfileId,
          goldenLikesCount: count,
          authenticated: true,
          usedToday: true,
          availableToday: false,
          givenToThisArtistToday: true,
          givenArtistId: realProfileId,
          ...(result.dayKey ? { dayKey: result.dayKey } : {}),
          ...(result.availableAt ? { availableAt: result.availableAt } : {}),
          ...(typeof result.cooldownSeconds === "number"
            ? { cooldownSeconds: result.cooldownSeconds }
            : {}),
        }, serverDay);
        updateRealQuota({
          dayKey: serverDay,
          usedToday: true,
          givenProfileId: realProfileId,
        });
        setPendingGoldenLike(null);
        return {
          item,
          mode: "real",
          status: result.reason === "golden_like_already_sent" ? "already-sent" : "sent",
        };
      }

      const demoDay = getParisDayKey();
      rolloverToDay(demoDay);
      const currentQuota = realQuotaRef.current;
      if (currentQuota.dayKey === demoDay && currentQuota.usedToday) {
        setPendingGoldenLike(null);
        return { item, mode: "demo", status: "quota-used" };
      }
      setStored((current) => ({
        ...current,
        goldenLike: {
          day: demoDay,
          artistId: item.artistId,
        },
      }));
      setPendingGoldenLike(null);
      return { item, mode: "demo", status: "sent" };
    } finally {
      submitLockRef.current = false;
      setGoldenLikeSubmitting(false);
    }
  }, [
    cacheServerState,
    pendingGoldenLike,
    refreshGoldenProfileAfterMutation,
    rolloverToDay,
    updateRealQuota,
  ]);

  const cancelGoldenLike = useCallback(() => {
    if (goldenLikeSubmitting || submitLockRef.current) return;
    setPendingGoldenLike(null);
  }, [goldenLikeSubmitting]);

  const isLiked = useCallback(
    (item: Pick<ShortsVideoItem, "id">) => serverLikeStates[item.id]?.liked ?? likedIds.has(item.id),
    [likedIds, serverLikeStates],
  );
  const hasGoldenLike = useCallback(
    (item: Pick<ShortsVideoItem, "artistId" | "profileId">) => {
      if (hasCanonicalProfileId(item)) {
        const profileId = item.profileId as string;
        if (demoGoldenArtistId) return false;
        return (
          realQuota.dayKey === parisDayKey
          && realQuota.usedToday
          && realQuota.givenProfileId === profileId
        ) || serverStates[profileId]?.givenToThisArtistToday === true;
      }
      if (realQuota.dayKey === parisDayKey && realQuota.usedToday) return false;
      return demoGoldenArtistId === item.artistId;
    },
    [demoGoldenArtistId, parisDayKey, realQuota, serverStates],
  );
  const goldenUnavailableFor = useCallback(
    (item: Pick<ShortsVideoItem, "artistId" | "profileId">) => {
      if (hasCanonicalProfileId(item)) {
        const profileId = item.profileId as string;
        if (demoGoldenArtistId) return true;
        if (realQuota.dayKey === parisDayKey && realQuota.usedToday) {
          return realQuota.givenProfileId !== profileId;
        }
        const state = serverStates[profileId];
        return Boolean(state?.usedToday && !state.givenToThisArtistToday);
      }
      if (realQuota.dayKey === parisDayKey && realQuota.usedToday) return true;
      return Boolean(demoGoldenArtistId && demoGoldenArtistId !== item.artistId);
    },
    [demoGoldenArtistId, parisDayKey, realQuota, serverStates],
  );
  const likeCountFor = useCallback(
    (item: Pick<ShortsVideoItem, "id" | "likeCount">) => serverLikeStates[item.id]?.likeCount ?? item.likeCount + (likedIds.has(item.id) ? 1 : 0),
    [likedIds, serverLikeStates],
  );
  const goldenLikeCountFor = useCallback(
    (item: Pick<ShortsVideoItem, "artistId" | "profileId" | "goldenLikeCount">) => {
      if (hasCanonicalProfileId(item)) {
        return serverStates[item.profileId as string]?.goldenLikesCount ?? item.goldenLikeCount;
      }
      const realQuotaUsed = realQuota.dayKey === parisDayKey && realQuota.usedToday;
      return item.goldenLikeCount + (
        !realQuotaUsed && demoGoldenArtistId === item.artistId ? 1 : 0
      );
    },
    [demoGoldenArtistId, parisDayKey, realQuota, serverStates],
  );

  return {
    pendingGoldenLike,
    goldenLikeSubmitting,
    isLiked,
    hasGoldenLike,
    goldenUnavailableFor,
    likeCountFor,
    goldenLikeCountFor,
    toggleLike,
    requestGoldenLike,
    confirmGoldenLike,
    cancelGoldenLike,
  };
}

export { SHORTS_ENGAGEMENT_STORAGE_KEY };
