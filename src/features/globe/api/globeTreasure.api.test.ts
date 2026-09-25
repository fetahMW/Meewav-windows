import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  GLOBE_TREASURE_CAMPAIGN_CODE,
  createGlobeTreasureRepository,
} from "./globeTreasure.api";

function repositoryWithRpc(rpc: ReturnType<typeof vi.fn>) {
  return createGlobeTreasureRepository({ rpc } as unknown as SupabaseClient);
}

describe("globeTreasure.api", () => {
  it("loads only the safe public campaign projection", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        state: "available",
        available: true,
        claimed: false,
        claimedByMe: false,
        claimStatus: null,
        endsAt: null,
        serverTime: "2026-07-19T12:00:00Z",
      },
      error: null,
    });

    const state = await repositoryWithRpc(rpc).getState();

    expect(rpc).toHaveBeenCalledWith("get_globe_treasure_state_v1", {
      p_campaign_code: GLOBE_TREASURE_CAMPAIGN_CODE,
    });
    expect(state).toEqual({
      ok: true,
      state: "available",
      available: true,
      claimed: false,
      claimedByMe: false,
      claimStatus: null,
      endsAt: null,
      serverTime: "2026-07-19T12:00:00Z",
    });
    expect(state).not.toHaveProperty("claimedBy");
    expect(state).not.toHaveProperty("coordinates");
  });

  it("claims through the atomic authenticated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ok: true,
        outcome: "won_by_you",
        claimed: true,
        claimedByMe: true,
        claimStatus: "pending_review",
        idempotentReplay: false,
        claimedAt: "2026-07-19T12:01:00Z",
        rewardLabel: "Récompense secrète Meewav",
      },
      error: null,
    });

    await expect(repositoryWithRpc(rpc).claim()).resolves.toEqual({
      ok: true,
      outcome: "won_by_you",
      claimed: true,
      claimedByMe: true,
      claimStatus: "pending_review",
      idempotentReplay: false,
      claimedAt: "2026-07-19T12:01:00Z",
      rewardLabel: "Récompense secrète Meewav",
    });
    expect(rpc).toHaveBeenCalledWith("claim_globe_treasure_v1", {
      p_campaign_code: GLOBE_TREASURE_CAMPAIGN_CODE,
    });
  });

  it("normalizes a caller-provided campaign code before the RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ok: true, state: "unavailable" },
      error: null,
    });

    await repositoryWithRpc(rpc).getState("  CAMPAIGN_TEST_01  ");

    expect(rpc).toHaveBeenCalledWith("get_globe_treasure_state_v1", {
      p_campaign_code: "campaign_test_01",
    });
  });

  it("rejects an invalid campaign code before any network call", async () => {
    const rpc = vi.fn();

    await expect(repositoryWithRpc(rpc).claim("../secret")).rejects.toThrow(
      "invalid_treasure_campaign_code",
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("forwards Supabase failures so the UI can fail closed", async () => {
    const backendError = { code: "42501", message: "authentication_required" };
    const rpc = vi.fn().mockResolvedValue({ data: null, error: backendError });

    await expect(repositoryWithRpc(rpc).claim()).rejects.toBe(backendError);
  });

  it("fails closed for unknown server enum values", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: {
          ok: true,
          state: "future_state",
          available: true,
          claimed: true,
          claimedByMe: true,
          claimStatus: "future_status",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          ok: true,
          outcome: "future_outcome",
          claimed: true,
          claimedByMe: true,
          claimStatus: "future_status",
        },
        error: null,
      });
    const repository = repositoryWithRpc(rpc);

    await expect(repository.getState()).resolves.toMatchObject({
      state: "unavailable",
      available: false,
      claimed: false,
      claimedByMe: false,
      claimStatus: null,
    });
    await expect(repository.claim()).resolves.toMatchObject({
      outcome: "unavailable",
      claimed: false,
      claimedByMe: false,
      claimStatus: null,
      rewardLabel: null,
    });
  });
});
