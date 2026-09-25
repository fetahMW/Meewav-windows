import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import type { PlaceRepository } from "./place.service";
import type { RoomGiftDelivery, RoomGiftDeliveryInput, RoomGiftDraw } from "./place.types";
import { usePlaceRoom } from "./usePlaceRoom";

const GUEST_ID = "51000000-0000-4000-8000-000000000002";

function liveDraw(status: RoomGiftDraw["status"], overrides: Partial<RoomGiftDraw> = {}): RoomGiftDraw {
  const now = Date.now();
  return {
    id: "draw-live-1",
    giftCode: "vip-pass",
    giftLabel: "Pass VIP",
    poolMode: "room",
    status,
    eligibleCount: 7,
    scheduledAt: status === "scheduled" ? new Date(now - 1_000).toISOString() : null,
    startedAt: status === "spinning" ? new Date(now - 5_000).toISOString() : null,
    revealAt: status === "spinning" ? new Date(now - 1_000).toISOString() : null,
    revealedAt: status === "revealed" ? new Date(now).toISOString() : null,
    winner: null,
    createdAt: new Date(now - 10_000).toISOString(),
    ...overrides,
  };
}

function liveRoom(draw: RoomGiftDraw) {
  const room = createPlaceDemoState();
  room.id = "room-live-1";
  room.source = "live";
  room.giftDraw = draw;
  return room;
}

function repositoryFor(room: ReturnType<typeof liveRoom>, methods: Partial<PlaceRepository> = {}) {
  return {
    load: vi.fn().mockResolvedValue(room),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    startGiftDraw: vi.fn().mockResolvedValue(room.giftDraw),
    revealGiftDraw: vi.fn().mockResolvedValue(room.giftDraw),
    ...methods,
  } as unknown as PlaceRepository;
}

async function flushRoomLoad() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePlaceRoom gift draw demo", () => {
  it.each([
    ["send_now", null, null, "sent"],
    ["schedule", "future", null, "scheduled"],
    ["round", null, "Fans récents", "ready"],
  ] as const)("keeps an honest session receipt and idempotence for %s gifts", async (
    action,
    scheduledMode,
    roundLabel,
    expectedStatus,
  ) => {
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
    const recipient = result.current.room.queue[0];
    const input: RoomGiftDeliveryInput = {
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      recipientProfileId: recipient.profile.id,
      recipientDisplayName: recipient.profile.displayName,
      recipientAvatarUrl: recipient.profile.avatarUrl,
      recipientSource: "queue",
      action,
      scheduledAt: scheduledMode ? new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString() : null,
      roundLabel,
      idempotencyKey: `room-gift:demo-${action}`,
    };
    let first: RoomGiftDelivery | null = null;
    let retry: RoomGiftDelivery | null = null;

    await act(async () => {
      first = await result.current.submitGift(input);
      retry = await result.current.submitGift(input);
    });

    expect(first).toMatchObject({
      giftCode: "vip-pass",
      recipientProfileId: recipient.profile.id,
      recipientDisplayName: recipient.profile.displayName,
      action,
      status: expectedStatus,
      scheduledAt: scheduledMode ? expect.any(String) : null,
      roundLabel,
    });
    expect(retry).toEqual(first);
  });

  it("does not silently drop manual candidates above the former 2,000 limit", async () => {
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
    const candidates = Array.from({ length: 2_501 }, (_, index) => ({
      key: `manual-${index + 1}`,
      profileId: null,
      displayName: `Participant ${index + 1}`,
      avatarUrl: null,
      source: "manual" as const,
    }));

    await act(async () => {
      await result.current.createGiftDraw({
        giftCode: "force-card",
        giftLabel: "Carte de Force",
        poolMode: "manual",
        candidates,
      });
    });

    expect(result.current.room.giftDraw?.eligibleCount).toBe(2_501);
  });

  it("choisit avec crypto puis garde le gagnant privé jusqu’à la révélation", async () => {
    vi.useFakeTimers();
    const getRandomValues = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 1;
      return array;
    });
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));

    await act(async () => {
      await result.current.createGiftDraw({
        giftCode: "vip-pass",
        giftLabel: "Pass VIP",
        poolMode: "queue",
        animationDurationSeconds: 3,
      });
    });
    expect(result.current.room.giftDraw).toMatchObject({
      status: "ready",
      giftCode: "vip-pass",
      eligibleCount: result.current.room.queue.length,
      winner: null,
    });

    await act(async () => {
      await result.current.startGiftDraw();
    });
    expect(getRandomValues).toHaveBeenCalled();
    expect(result.current.room.giftDraw).toMatchObject({ status: "spinning", winner: null });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });
    expect(result.current.room.giftDraw?.status).toBe("revealed");
    expect(result.current.room.giftDraw?.winner?.profileId).toBe(result.current.room.queue[1]?.profile.id);
  });

  it("programme un tirage sans le démarrer avant l’heure choisie", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((array) => {
      (array as Uint32Array)[0] = 0;
      return array;
    });
    const { result } = renderHook(() => usePlaceRoom({ demoRole: "host" }));
    const scheduledAt = new Date(Date.now() + 4_000).toISOString();

    await act(async () => {
      await result.current.scheduleGiftDraw({
        giftCode: "force-card",
        giftLabel: "Carte de Force",
        poolMode: "room",
        scheduledAt,
      });
    });
    expect(result.current.room.giftDraw?.status).toBe("scheduled");
    const identifiableDemoPool = new Set([
      ...result.current.room.participants
        .filter((participant) => participant.profile.id !== result.current.room.host.id)
        .map((participant) => participant.profile.id),
      ...result.current.room.queue
        .filter((participant) => participant.profile.id !== result.current.room.host.id)
        .map((participant) => participant.profile.id),
    ]).size;
    expect(result.current.room.giftDraw?.eligibleCount).toBe(identifiableDemoPool);
    expect(result.current.room.giftDraw?.eligibleCount).not.toBe(result.current.room.participantsCount);

    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(result.current.room.giftDraw?.status).toBe("scheduled");

    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(result.current.room.giftDraw?.status).toBe("spinning");
  });

  it("retente le démarrage Host avec un backoff jusqu’au succès serveur", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00.000Z"));
    const scheduled = liveDraw("scheduled");
    const spinning = liveDraw("spinning", {
      scheduledAt: scheduled.scheduledAt,
      startedAt: new Date().toISOString(),
      revealAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const startGiftDraw = vi.fn()
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValue(spinning);
    const repository = repositoryFor(liveRoom(scheduled), { startGiftDraw });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: "room-live-1",
      currentUserId: liveRoom(scheduled).host.id,
      repository,
    }));

    await flushRoomLoad();
    expect(result.current.room.source).toBe("live");
    expect(startGiftDraw).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(499); });
    expect(startGiftDraw).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(startGiftDraw).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(startGiftDraw).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });

    expect(startGiftDraw).toHaveBeenCalledTimes(3);
    expect(result.current.room.giftDraw?.status).toBe("spinning");
  });

  it("retente la révélation Host et publie le gagnant après une panne transitoire", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00.000Z"));
    const spinning = liveDraw("spinning");
    const revealed = liveDraw("revealed", {
      startedAt: spinning.startedAt,
      revealAt: spinning.revealAt,
      revealedAt: new Date().toISOString(),
      winner: {
        key: "profile-winner",
        profileId: "profile-winner",
        displayName: "Aïcha Sol",
        avatarUrl: null,
        source: "room",
      },
    });
    const revealGiftDraw = vi.fn()
      .mockRejectedValueOnce(new Error("temporary-1"))
      .mockRejectedValueOnce(new Error("temporary-2"))
      .mockResolvedValue(revealed);
    const room = liveRoom(spinning);
    const repository = repositoryFor(room, { revealGiftDraw });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: room.id,
      currentUserId: room.host.id,
      repository,
    }));

    await flushRoomLoad();
    expect(revealGiftDraw).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(revealGiftDraw).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });

    expect(revealGiftDraw).toHaveBeenCalledTimes(3);
    expect(result.current.room.giftDraw?.status).toBe("revealed");
    expect(result.current.room.giftDraw?.winner?.displayName).toBe("Aïcha Sol");
  });

  it("arrête les reprises dès qu’un changement Realtime publie le nouvel état", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T10:00:00.000Z"));
    const scheduled = liveDraw("scheduled");
    const spinning = liveDraw("spinning", {
      scheduledAt: scheduled.scheduledAt,
      startedAt: new Date().toISOString(),
      revealAt: new Date(Date.now() + 60_000).toISOString(),
    });
    let realtime: ((event: { table: string; eventType: "UPDATE" }) => void) | null = null;
    const startGiftDraw = vi.fn().mockRejectedValue(new Error("temporary"));
    const load = vi.fn()
      .mockResolvedValueOnce(liveRoom(scheduled))
      .mockResolvedValue(liveRoom(spinning));
    const subscribe = vi.fn((_roomId, onEvent) => {
      realtime = onEvent;
      return { unsubscribe: vi.fn() };
    });
    const repository = repositoryFor(liveRoom(scheduled), { load, subscribe, startGiftDraw });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: "room-live-1",
      currentUserId: liveRoom(scheduled).host.id,
      repository,
    }));

    await flushRoomLoad();
    expect(startGiftDraw).toHaveBeenCalledTimes(1);
    act(() => realtime?.({ table: "room_gift_draws_v1", eventType: "UPDATE" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.room.giftDraw?.status).toBe("spinning");

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(startGiftDraw).toHaveBeenCalledTimes(1);
  });

  it("ne laisse jamais un viewer appeler les mutations start/reveal", async () => {
    const spinning = liveDraw("spinning");
    const startGiftDraw = vi.fn();
    const revealGiftDraw = vi.fn();
    const submitGift = vi.fn();
    const repository = repositoryFor(liveRoom(spinning), { startGiftDraw, revealGiftDraw, submitGift });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: "room-live-1",
      currentUserId: null,
      repository,
    }));

    await flushRoomLoad();
    await act(async () => {
      expect(await result.current.startGiftDraw()).toBeNull();
      expect(await result.current.revealGiftDraw()).toBeNull();
      expect(await result.current.submitGift({
        giftCode: "vip-pass",
        giftLabel: "Pass VIP",
        recipientProfileId: "recipient-live",
        recipientDisplayName: "Recipient Live",
        recipientAvatarUrl: null,
        recipientSource: "messaging",
        action: "send_now",
        scheduledAt: null,
        roundLabel: null,
        idempotencyKey: "room-gift:viewer-test",
      })).toBeNull();
    });
    expect(startGiftDraw).not.toHaveBeenCalled();
    expect(revealGiftDraw).not.toHaveBeenCalled();
    expect(submitGift).not.toHaveBeenCalled();
  });

  it("uses the live repository for Host gifts and keeps server failures visible", async () => {
    const room = liveRoom(liveDraw("ready"));
    const delivery = {
      id: "delivery-live",
      roomId: room.id,
      giftCode: "vip-pass" as const,
      giftLabel: "Pass VIP",
      action: "send_now" as const,
      status: "sent" as const,
      roundLabel: null,
      recipientProfileId: GUEST_ID,
      recipientDisplayName: "Lior Sane",
      recipientAvatarUrl: null,
      recipientSource: "stage" as const,
      scheduledAt: null,
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    const submitGift = vi.fn()
      .mockResolvedValueOnce(delivery)
      .mockRejectedValueOnce(new Error("server-down"));
    const repository = repositoryFor(room, { submitGift });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: room.id,
      currentUserId: room.host.id,
      repository,
    }));
    const input: RoomGiftDeliveryInput = {
      giftCode: "vip-pass",
      giftLabel: "Pass VIP",
      recipientProfileId: GUEST_ID,
      recipientDisplayName: "Lior Sane",
      recipientAvatarUrl: null,
      recipientSource: "stage",
      action: "send_now",
      scheduledAt: null,
      roundLabel: null,
      idempotencyKey: "room-gift:live-send",
    };
    await flushRoomLoad();

    await act(async () => {
      expect(await result.current.submitGift(input)).toEqual(delivery);
    });
    expect(submitGift).toHaveBeenNthCalledWith(1, room.id, input);

    await act(async () => {
      await expect(result.current.submitGift({ ...input, idempotencyKey: "room-gift:live-retry" }))
        .rejects.toThrow("server-down");
    });
    expect(result.current.notice).toContain("serveur");
  });

  it("propagates a live draw inventory rejection to the gift flow", async () => {
    const room = liveRoom(liveDraw("ready"));
    const createGiftDraw = vi.fn().mockRejectedValue(
      new Error("profile_gift_inventory_insufficient_available"),
    );
    const repository = repositoryFor(room, { createGiftDraw });
    const { result } = renderHook(() => usePlaceRoom({
      requestedRoomId: room.id,
      currentUserId: room.host.id,
      repository,
    }));
    await flushRoomLoad();

    await act(async () => {
      await expect(result.current.createGiftDraw({
        giftCode: "golden-like",
        giftLabel: "Golden Like",
        poolMode: "room",
        candidates: [],
        idempotencyKey: "room-draw:inventory-rejection",
      })).rejects.toThrow("profile_gift_inventory_insufficient_available");
    });
    expect(result.current.notice).toContain("serveur");
  });
});
