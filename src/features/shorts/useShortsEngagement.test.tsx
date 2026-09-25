import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GoldenLikeState } from "../goldenLikes/goldenLikeApi";
import type { ShortsVideoItem } from "./shorts-wall-data";
import {
  getParisDayKey,
  SHORTS_ENGAGEMENT_STORAGE_KEY,
  useShortsEngagement,
} from "./useShortsEngagement";

const goldenApi = vi.hoisted(() => ({
  getGoldenLikeState: vi.fn(),
  giveGoldenLike: vi.fn(),
}));

vi.mock("../goldenLikes/goldenLikeApi", () => ({
  getGoldenLikeState: goldenApi.getGoldenLikeState,
  giveGoldenLike: goldenApi.giveGoldenLike,
}));

const PROFILE_A = "11111111-1111-4111-8111-111111111111";
const PROFILE_B = "22222222-2222-4222-8222-222222222222";

function item(id: string, profileId?: string): ShortsVideoItem {
  return {
    id,
    artistId: `artist-${id}`,
    mockArtistId: `mock-${id}`,
    ...(profileId ? { profileId } : {}),
    title: `Short ${id}`,
    artist: `Artiste ${id}`,
    image: `/images/${id}.webp`,
    video: `/videos/${id}.mp4`,
    format: "portrait",
    alt: "",
    duration: "0:30",
    meta: "Maintenant",
    role: "Artiste",
    city: "Paris",
    views: "1 K",
    gradeLevel: 4,
    likeCount: 12,
    goldenLikeCount: 7,
  };
}

function state(overrides: Partial<GoldenLikeState> = {}): GoldenLikeState {
  return {
    ok: true,
    goldenLikesCount: 7,
    authenticated: true,
    usedToday: false,
    availableToday: true,
    givenToThisArtistToday: false,
    dayKey: getParisDayKey(),
    ...overrides,
  };
}

beforeEach(() => {
  window.localStorage.removeItem(SHORTS_ENGAGEMENT_STORAGE_KEY);
  goldenApi.getGoldenLikeState.mockReset();
  goldenApi.giveGoldenLike.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useShortsEngagement", () => {
  it("hydrates the real quota eagerly from the first canonical feed profile", async () => {
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState.mockResolvedValue(state());

    renderHook(() => useShortsEngagement([targetA, targetB]));

    await waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledWith(PROFILE_A));
    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1);
  });

  it("uses the beneficiary returned by the first eager server snapshot", async () => {
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState.mockResolvedValue(state({
      usedToday: true,
      availableToday: false,
      givenArtistId: PROFILE_B,
    }));
    const { result } = renderHook(() => useShortsEngagement([targetA, targetB]));
    await waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1));

    await act(async () => {
      expect(await result.current.requestGoldenLike(targetB)).toBe("already-given");
    });
    expect(result.current.hasGoldenLike(targetB)).toBe(true);
    expect(result.current.goldenUnavailableFor(targetA)).toBe(true);
    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1);
  });

  it("probes another target when an old server reports an unknown used quota", async () => {
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
      }))
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
        givenToThisArtistToday: true,
      }));
    const { result } = renderHook(() => useShortsEngagement([targetA, targetB]));

    await waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2));
    expect(result.current.hasGoldenLike(targetB)).toBe(true);
    await act(async () => {
      expect(await result.current.requestGoldenLike(targetB)).toBe("already-given");
    });
  });

  it("does not let a concurrent non-beneficiary response erase a known recipient", async () => {
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    let resolveA!: (value: GoldenLikeState) => void;
    let resolveB!: (value: GoldenLikeState) => void;
    goldenApi.getGoldenLikeState.mockImplementation((profileId: string) => (
      new Promise<GoldenLikeState>((resolve) => {
        if (profileId === PROFILE_A) resolveA = resolve;
        else resolveB = resolve;
      })
    ));
    const { result } = renderHook(() => useShortsEngagement([targetA]));
    await waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledWith(PROFILE_A));
    let targetBRequest!: Promise<unknown>;
    act(() => {
      targetBRequest = result.current.requestGoldenLike(targetB);
    });
    await waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledWith(PROFILE_B));
    await act(async () => {
      resolveB(state({
        usedToday: true,
        availableToday: false,
        givenToThisArtistToday: true,
        givenArtistId: PROFILE_B,
      }));
      await targetBRequest;
    });
    await act(async () => {
      resolveA(state({
        usedToday: true,
        availableToday: false,
      }));
    });
    await waitFor(() => expect(result.current.hasGoldenLike(targetB)).toBe(true));
    expect(result.current.goldenUnavailableFor(targetA)).toBe(true);
  });

  it("uses the local demo quota without calling the Golden Like API", async () => {
    const demo = item("demo");
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      expect(await result.current.requestGoldenLike(demo)).toBe("confirmation");
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({
        item: demo,
        mode: "demo",
        status: "sent",
      });
    });

    expect(goldenApi.getGoldenLikeState).not.toHaveBeenCalled();
    expect(goldenApi.giveGoldenLike).not.toHaveBeenCalled();
    expect(result.current.hasGoldenLike(demo)).toBe(true);
    expect(result.current.goldenLikeCountFor(demo)).toBe(8);
  });

  it("hydrates an existing Golden Like on the same UUID target", async () => {
    const target = item("real-a", PROFILE_A);
    goldenApi.getGoldenLikeState.mockResolvedValue(state({
      goldenLikesCount: 42,
      usedToday: true,
      availableToday: false,
      givenToThisArtistToday: true,
    }));
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("already-given");
    });

    expect(result.current.hasGoldenLike(target)).toBe(true);
    expect(result.current.goldenLikeCountFor(target)).toBe(42);
    expect(goldenApi.giveGoldenLike).not.toHaveBeenCalled();
  });

  it("hydrates a quota already used on another UUID target", async () => {
    const target = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState.mockResolvedValue(state({
      goldenLikesCount: 19,
      usedToday: true,
      availableToday: false,
    }));
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("unavailable");
    });

    expect(result.current.goldenUnavailableFor(target)).toBe(true);
    expect(result.current.goldenLikeCountFor(target)).toBe(19);
  });

  it("uses the exact POST count and locks every other UUID without a second GET", async () => {
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState.mockResolvedValue(state());
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: true,
      reason: "golden_like_sent",
      goldenLikesCount: 91,
      usedToday: true,
      dayKey: getParisDayKey(),
    });
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      expect(await result.current.requestGoldenLike(targetA)).toBe("confirmation");
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({ status: "sent" });
    });

    expect(result.current.goldenLikeCountFor(targetA)).toBe(91);
    expect(result.current.goldenUnavailableFor(targetB)).toBe(true);
    await act(async () => {
      expect(await result.current.requestGoldenLike(targetB)).toBe("unavailable");
    });
    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1);
  });

  it("accepts an idempotent replay without incrementing the server count", async () => {
    const target = item("real-a", PROFILE_A);
    goldenApi.getGoldenLikeState.mockResolvedValue(state({ goldenLikesCount: 30 }));
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: true,
      reason: "golden_like_already_sent",
      goldenLikesCount: 30,
      idempotentReplay: true,
    });
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      await result.current.requestGoldenLike(target);
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({
        mode: "real",
        status: "already-sent",
      });
    });
    expect(result.current.goldenLikeCountFor(target)).toBe(30);
  });

  it("returns a quota result and closes confirmation on already_used_today", async () => {
    const target = item("real-a", PROFILE_A);
    const other = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState.mockResolvedValue(state());
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: false,
      reason: "already_used_today",
      goldenLikesCount: 18,
    });
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      await result.current.requestGoldenLike(target);
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({
        status: "quota-used",
      });
    });

    expect(result.current.pendingGoldenLike).toBeNull();
    expect(result.current.goldenUnavailableFor(target)).toBe(true);
    expect(result.current.goldenUnavailableFor(other)).toBe(true);
  });

  it("force-refreshes the beneficiary after an already_used_today race", async () => {
    const target = item("real-a", PROFILE_A);
    const beneficiary = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state())
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
        givenArtistId: PROFILE_B,
      }));
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: false,
      reason: "already_used_today",
      goldenLikesCount: 18,
      dayKey: getParisDayKey(),
    });
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("confirmation");
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({
        status: "quota-used",
      });
    });

    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2);
    expect(result.current.hasGoldenLike(beneficiary)).toBe(true);
    expect(result.current.goldenUnavailableFor(target)).toBe(true);
  });

  it("waits for a pre-mutation GET before forcing the conflict refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T21:59:50.000Z"));
    const target = item("real-a", PROFILE_A);
    const beneficiary = item("real-b", PROFILE_B);
    let resolvePreMutation!: (value: GoldenLikeState) => void;
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state({ dayKey: "2026-07-31" }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolvePreMutation = resolve;
      }))
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
        givenArtistId: PROFILE_B,
        dayKey: "2026-08-01",
      }));
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: false,
      reason: "already_used_today",
      goldenLikesCount: 18,
      dayKey: "2026-08-01",
    });
    const { result } = renderHook(() => useShortsEngagement([target]));
    await vi.waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1));
    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("confirmation");
    });

    vi.setSystemTime(new Date("2026-07-31T22:00:01.000Z"));
    let preMutationRequest!: Promise<unknown>;
    act(() => {
      preMutationRequest = result.current.requestGoldenLike(target);
    });
    await vi.waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2));
    let confirmation!: Promise<unknown>;
    act(() => {
      confirmation = result.current.confirmGoldenLike();
    });
    await vi.waitFor(() => expect(goldenApi.giveGoldenLike).toHaveBeenCalledTimes(1));
    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePreMutation(state({ dayKey: "2026-08-01" }));
      expect(await preMutationRequest).toBe("confirmation");
    });
    await act(async () => {
      expect(await confirmation).toMatchObject({ status: "quota-used" });
    });

    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(3);
    expect(result.current.hasGoldenLike(beneficiary)).toBe(true);
    expect(result.current.goldenUnavailableFor(target)).toBe(true);
  });

  it("keeps the real quota conservatively blocked when conflict refresh fails", async () => {
    const target = item("real-a", PROFILE_A);
    const other = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state())
      .mockRejectedValueOnce(new Error("offline"));
    goldenApi.giveGoldenLike.mockResolvedValue({
      ok: false,
      reason: "already_used_today",
      goldenLikesCount: 18,
      dayKey: getParisDayKey(),
    });
    const { result } = renderHook(() => useShortsEngagement());

    await act(async () => {
      await result.current.requestGoldenLike(target);
    });
    await act(async () => {
      expect(await result.current.confirmGoldenLike()).toMatchObject({
        status: "quota-used",
      });
    });

    expect(result.current.goldenUnavailableFor(target)).toBe(true);
    expect(result.current.goldenUnavailableFor(other)).toBe(true);
  });

  it("prevents two confirmation RPCs while the first one is pending", async () => {
    const target = item("real-a", PROFILE_A);
    let resolvePost!: (value: unknown) => void;
    goldenApi.getGoldenLikeState.mockResolvedValue(state());
    goldenApi.giveGoldenLike.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    const { result } = renderHook(() => useShortsEngagement());
    await act(async () => {
      await result.current.requestGoldenLike(target);
    });

    let first!: Promise<unknown>;
    let second!: Promise<unknown>;
    act(() => {
      first = result.current.confirmGoldenLike();
      second = result.current.confirmGoldenLike();
    });
    await expect(second).resolves.toBeNull();
    expect(goldenApi.giveGoldenLike).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolvePost({
        ok: true,
        reason: "golden_like_sent",
        goldenLikesCount: 8,
      });
      await first;
    });
  });

  it("blocks a real profile after a local demo Golden Like", async () => {
    const demo = item("demo");
    const target = item("real-a", PROFILE_A);
    const { result } = renderHook(() => useShortsEngagement());
    await act(async () => {
      await result.current.requestGoldenLike(demo);
    });
    await act(async () => {
      await result.current.confirmGoldenLike();
    });
    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("unavailable");
    });
    expect(result.current.goldenUnavailableFor(target)).toBe(true);
    expect(goldenApi.getGoldenLikeState).not.toHaveBeenCalled();
  });

  it("waits for real feed hydration and blocks a demo profile when quota is used", async () => {
    const demo = item("demo");
    const target = item("real-a", PROFILE_A);
    let resolveState!: (value: GoldenLikeState) => void;
    goldenApi.getGoldenLikeState.mockReturnValue(new Promise((resolve) => {
      resolveState = resolve;
    }));
    const { result } = renderHook(() => useShortsEngagement([target]));
    let demoRequest!: Promise<unknown>;
    act(() => {
      demoRequest = result.current.requestGoldenLike(demo);
    });
    expect(result.current.pendingGoldenLike).toBeNull();
    await act(async () => {
      resolveState(state({
        usedToday: true,
        availableToday: false,
        givenArtistId: PROFILE_A,
      }));
      expect(await demoRequest).toBe("unavailable");
    });
    expect(result.current.goldenUnavailableFor(demo)).toBe(true);
  });

  it("toggles a normal Like, updates its count and persists the selection", async () => {
    const demo = item("demo-like");
    const { result } = renderHook(() => useShortsEngagement());
    act(() => result.current.toggleLike(demo));

    expect(result.current.isLiked(demo)).toBe(true);
    expect(result.current.likeCountFor(demo)).toBe(demo.likeCount + 1);
    await waitFor(() => {
      const stored = JSON.parse(
        window.localStorage.getItem(SHORTS_ENGAGEMENT_STORAGE_KEY) ?? "{}",
      ) as { likedVideoIds?: string[] };
      expect(stored.likedVideoIds).toContain(demo.id);
    });
  });

  it("retries a GET that crosses Paris midnight instead of caching it on the new day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T21:59:59.000Z"));
    const target = item("real-a", PROFILE_A);
    let resolveOldDay!: (value: GoldenLikeState) => void;
    goldenApi.getGoldenLikeState
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOldDay = resolve;
      }))
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
        givenToThisArtistToday: true,
        givenArtistId: PROFILE_A,
        dayKey: "2026-08-01",
      }));
    const { result } = renderHook(() => useShortsEngagement([target]));
    await vi.waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(1));
    vi.setSystemTime(new Date("2026-07-31T22:00:01.000Z"));
    await act(async () => {
      resolveOldDay(state({ dayKey: "2026-07-31" }));
    });
    await vi.waitFor(() => expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2));
    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("already-given");
    });
    expect(result.current.hasGoldenLike(target)).toBe(true);
  });

  it("does not consume the new Paris day when a successful POST belongs to the previous day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T21:59:59.000Z"));
    const target = item("real-a", PROFILE_A);
    let resolvePost!: (value: unknown) => void;
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state({ dayKey: "2026-07-31" }))
      .mockResolvedValueOnce(state({
        goldenLikesCount: 8,
        dayKey: "2026-08-01",
      }));
    goldenApi.giveGoldenLike.mockReturnValue(new Promise((resolve) => {
      resolvePost = resolve;
    }));
    const { result } = renderHook(() => useShortsEngagement());
    await act(async () => {
      expect(await result.current.requestGoldenLike(target)).toBe("confirmation");
    });

    let confirmation!: Promise<unknown>;
    act(() => {
      confirmation = result.current.confirmGoldenLike();
    });
    vi.setSystemTime(new Date("2026-07-31T22:00:01.000Z"));
    await act(async () => {
      resolvePost({
        ok: true,
        reason: "golden_like_sent",
        goldenLikesCount: 99,
        usedToday: true,
        dayKey: "2026-07-31",
      });
      expect(await confirmation).toMatchObject({ status: "sent" });
    });

    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2);
    expect(result.current.hasGoldenLike(target)).toBe(false);
    expect(result.current.goldenUnavailableFor(target)).toBe(false);
    expect(result.current.goldenLikeCountFor(target)).toBe(8);
  });

  it("re-evaluates the local demo quota after real hydration crosses Paris midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T21:59:59.000Z"));
    const demo = item("demo-midnight");
    const target = item("real-a", PROFILE_A);
    window.localStorage.setItem(SHORTS_ENGAGEMENT_STORAGE_KEY, JSON.stringify({
      likedVideoIds: [],
      goldenLike: {
        day: "2026-07-31",
        artistId: demo.artistId,
      },
    }));
    let resolveOldDay!: (value: GoldenLikeState) => void;
    goldenApi.getGoldenLikeState
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveOldDay = resolve;
      }))
      .mockResolvedValueOnce(state({ dayKey: "2026-08-01" }));
    const { result } = renderHook(() => useShortsEngagement([target]));
    let demoRequest!: Promise<unknown>;
    act(() => {
      demoRequest = result.current.requestGoldenLike(demo);
    });
    vi.setSystemTime(new Date("2026-07-31T22:00:01.000Z"));
    await act(async () => {
      resolveOldDay(state({ dayKey: "2026-07-31" }));
    });

    await act(async () => {
      expect(await demoRequest).toBe("confirmation");
    });
    expect(result.current.pendingGoldenLike).toEqual(demo);
  });

  it("keeps a state hydrated just after Paris midnight when the minute tick arrives", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T21:59:50.000Z"));
    const targetA = item("real-a", PROFILE_A);
    const targetB = item("real-b", PROFILE_B);
    goldenApi.getGoldenLikeState
      .mockResolvedValueOnce(state({
        usedToday: true,
        availableToday: false,
        dayKey: "2026-07-31",
      }))
      .mockResolvedValueOnce(state({
        goldenLikesCount: 27,
        dayKey: "2026-08-01",
      }));
    const { result } = renderHook(() => useShortsEngagement());
    await act(async () => {
      expect(await result.current.requestGoldenLike(targetA)).toBe("unavailable");
    });

    vi.setSystemTime(new Date("2026-07-31T22:00:10.000Z"));
    await act(async () => {
      expect(await result.current.requestGoldenLike(targetB)).toBe("confirmation");
    });
    act(() => result.current.cancelGoldenLike());
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await act(async () => {
      expect(await result.current.requestGoldenLike(targetB)).toBe("confirmation");
    });
    expect(goldenApi.getGoldenLikeState).toHaveBeenCalledTimes(2);
  });
});
