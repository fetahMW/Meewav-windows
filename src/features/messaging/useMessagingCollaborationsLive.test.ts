import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessagingCollaborationError } from "./messaging.collaboration.errors";
import type { MessagingCollaborationRepository } from "./messaging.collaboration.service";
import type {
  MessagingCollaborationRequestRow,
  MessagingCollaborationTransitionResult,
  MessagingListCollaborationsInput,
} from "./messaging.collaboration.types";
import { useMessagingCollaborationsLive } from "./useMessagingCollaborationsLive";

const CURRENT_PROFILE_ID = "60000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "60000000-0000-4000-8000-000000000002";
const REQUEST_ID = "61000000-0000-4000-8000-000000000001";

function requestRow(overrides: Partial<MessagingCollaborationRequestRow> = {}): MessagingCollaborationRequestRow {
  return {
    request_id: REQUEST_ID,
    direction: "received",
    status: "pending",
    message: "On collabore ?",
    source: "globe",
    created_at: "2026-07-18T10:00:00Z",
    updated_at: "2026-07-18T10:00:00Z",
    responded_at: null,
    conversation_id: null,
    viewed_at: null,
    is_unread: true,
    can_accept: true,
    can_decline: true,
    can_cancel: false,
    relationship_blocked: false,
    other_profile_id: OTHER_PROFILE_ID,
    other_username: "maya",
    other_display_name: "Maya",
    other_avatar_url: null,
    other_avatar_style_key: null,
    other_primary_role_key: "producer",
    other_city: "Paris",
    other_country_code: "FR",
    other_is_verified: true,
    other_grade_level: 4,
    other_grade_code: "elite",
    other_grade_label: "Élite",
    other_grade_visual_key: "grade-elite",
    page_cursor: { sort_at: "2026-07-18T10:00:00Z", request_id: REQUEST_ID },
    ...overrides,
  };
}

function fakeRepository(overrides: Partial<MessagingCollaborationRepository> = {}) {
  return {
    listMyCollaborationRequests: vi.fn().mockImplementation(({ scope }) => (
      Promise.resolve(scope === "received" ? [requestRow()] : [])
    )),
    markCollaborationRequestViewed: vi.fn().mockResolvedValue({
      ok: true,
      request_id: REQUEST_ID,
      viewed_at: "2026-07-18T12:00:00Z",
    }),
    respondToCollaborationRequest: vi.fn(),
    cancelCollaborationRequest: vi.fn(),
    ...overrides,
  } as unknown as MessagingCollaborationRepository;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useMessagingCollaborationsLive", () => {
  it("stays empty when live mode is disabled instead of silently loading demo data", () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: false,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    expect(result.current.status).toBe("idle");
    expect(result.current.items).toEqual([]);
    expect(repository.listMyCollaborationRequests).not.toHaveBeenCalled();
  });

  it("loads received and sent requests without a demo fallback", async () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ name: "Maya", status: "pending" });
    expect(repository.listMyCollaborationRequests).toHaveBeenCalledTimes(2);
    expect(repository.listMyCollaborationRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: "received" }));
    expect(repository.listMyCollaborationRequests).toHaveBeenCalledWith(expect.objectContaining({ scope: "sent" }));
  });

  it("keeps only the newest refresh when older RPC responses arrive late", async () => {
    const oldReceived = deferred<MessagingCollaborationRequestRow[]>();
    const oldSent = deferred<MessagingCollaborationRequestRow[]>();
    let phase = "initial";
    let refreshRound = 0;
    const listMyCollaborationRequests = vi.fn((input: MessagingListCollaborationsInput = {}) => {
      const scope = input.scope ?? "received";
      if (phase === "initial") return Promise.resolve(scope === "received" ? [requestRow()] : []);
      if (refreshRound === 0) return scope === "received" ? oldReceived.promise : oldSent.promise;
      return Promise.resolve(scope === "received" ? [requestRow({ other_display_name: "Maya récente" })] : []);
    });
    const repository = fakeRepository({ listMyCollaborationRequests });
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    phase = "refresh";
    let firstRefresh!: Promise<MessagingCollaborationRequestRow[]>;
    act(() => {
      firstRefresh = result.current.refresh();
    });
    refreshRound = 1;
    await act(() => result.current.refresh());
    expect(result.current.items[0].name).toBe("Maya récente");

    await act(async () => {
      oldReceived.resolve([requestRow({ other_display_name: "Maya ancienne" })]);
      oldSent.resolve([]);
      await firstRefresh;
    });
    expect(result.current.items[0].name).toBe("Maya récente");
  });

  it("deduplicates opposite rapid decisions and updates the item with the linked conversation", async () => {
    const response = deferred<MessagingCollaborationTransitionResult>();
    const respondToCollaborationRequest = vi.fn().mockReturnValue(response.promise);
    const repository = fakeRepository({ respondToCollaborationRequest });
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    let first!: Promise<MessagingCollaborationTransitionResult>;
    let second!: Promise<MessagingCollaborationTransitionResult>;
    act(() => {
      first = result.current.acceptRequest(REQUEST_ID);
      second = result.current.declineRequest(REQUEST_ID);
    });
    expect(respondToCollaborationRequest).toHaveBeenCalledTimes(1);
    expect(result.current.mutations[REQUEST_ID]).toBe("accept");

    await act(async () => {
      response.resolve({
        ok: true,
        idempotent: false,
        request_id: REQUEST_ID,
        status: "accepted",
        conversation_id: "62000000-0000-4000-8000-000000000001",
        system_message_id: "63000000-0000-4000-8000-000000000001",
      });
      await Promise.all([first, second]);
    });
    expect(result.current.items[0]).toMatchObject({
      status: "accepted",
      server: { conversationId: "62000000-0000-4000-8000-000000000001" },
    });
  });

  it("reuses the same idempotency key when a failed transition is retried", async () => {
    const respondToCollaborationRequest = vi.fn()
      .mockRejectedValueOnce(new MessagingCollaborationError("mutation_failed"))
      .mockResolvedValueOnce({
        ok: true,
        idempotent: true,
        request_id: REQUEST_ID,
        status: "declined",
      });
    const repository = fakeRepository({ respondToCollaborationRequest });
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await expect(result.current.declineRequest(REQUEST_ID)).rejects.toMatchObject({ code: "mutation_failed" });
    });
    await act(() => result.current.declineRequest(REQUEST_ID));

    expect(respondToCollaborationRequest).toHaveBeenCalledTimes(2);
    expect(respondToCollaborationRequest.mock.calls[0][2])
      .toBe(respondToCollaborationRequest.mock.calls[1][2]);
  });

  it("marks an unread request viewed and exposes normalized action errors", async () => {
    const repository = fakeRepository();
    const { result } = renderHook(() => useMessagingCollaborationsLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.unreadCount).toBe(1);

    await act(() => result.current.markViewed(REQUEST_ID));
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items[0].server.viewedAt).toBe("2026-07-18T12:00:00Z");
  });
});
