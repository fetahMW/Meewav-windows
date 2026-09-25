import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createMessagingCollaborationRepository } from "./messaging.collaboration.service";

const REQUEST_ID = "61000000-0000-4000-8000-000000000001";

describe("messaging collaboration Supabase repository", () => {
  it("uses the exact safe collaboration inbox RPC contract", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);
    const cursor = { sort_at: "2026-07-18T12:00:00Z", request_id: REQUEST_ID };

    await repository.listMyCollaborationRequests({
      scope: "sent",
      statuses: ["pending", "accepted"],
      cursor,
      limit: 20,
    });

    expect(rpc).toHaveBeenCalledWith("list_my_collaboration_requests_v2", {
      p_scope: "sent",
      p_statuses: ["pending", "accepted"],
      p_cursor: cursor,
      p_limit: 20,
    });
  });

  it("marks a request viewed through its narrow RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, request_id: REQUEST_ID, viewed_at: "2026-07-18T12:01:00Z" },
      error: null,
    });
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);

    await repository.markCollaborationRequestViewed(REQUEST_ID);

    expect(rpc).toHaveBeenCalledWith("mark_collaboration_request_viewed_v1", {
      p_request_id: REQUEST_ID,
    });
  });

  it.each([
    ["accept", "accepted"],
    ["decline", "declined"],
  ] as const)("sends the idempotent %s transition", async (decision, status) => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, request_id: REQUEST_ID, status },
      error: null,
    });
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);

    await repository.respondToCollaborationRequest(REQUEST_ID, decision, "collab:stable-key-001");

    expect(rpc).toHaveBeenCalledWith("respond_to_collaboration_request_v1", {
      p_request_id: REQUEST_ID,
      p_decision: decision,
      p_idempotency_key: "collab:stable-key-001",
    });
  });

  it("cancels through the sender-only idempotent RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, idempotent: false, request_id: REQUEST_ID, status: "cancelled" },
      error: null,
    });
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);

    await repository.cancelCollaborationRequest(REQUEST_ID, "collab:stable-key-002");

    expect(rpc).toHaveBeenCalledWith("cancel_collaboration_request_v1", {
      p_request_id: REQUEST_ID,
      p_idempotency_key: "collab:stable-key-002",
    });
  });

  it("normalizes stable server errors without exposing SQL details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: "P0001",
        message: "collaboration_request_already_resolved",
        details: "private SQL detail",
      },
    });
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.respondToCollaborationRequest(
      REQUEST_ID,
      "accept",
      "collab:stable-key-003",
    )).rejects.toMatchObject({
      code: "collaboration_request_already_resolved",
      serverCode: "P0001",
    });
  });

  it("rejects invalid inputs before any network call", async () => {
    const rpc = vi.fn();
    const repository = createMessagingCollaborationRepository({ rpc } as unknown as SupabaseClient);

    await expect(repository.listMyCollaborationRequests({
      scope: "accepted",
      statuses: ["pending"],
    })).rejects.toMatchObject({ code: "invalid_request" });
    await expect(repository.cancelCollaborationRequest("not-a-uuid", "short"))
      .rejects.toMatchObject({ code: "invalid_request" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
