import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../../../lib/supabaseClient";

export const GLOBE_TREASURE_CAMPAIGN_CODE = "france-hidden-gift-2026-01";

export type GlobeTreasureClaimStatus =
  | "pending_review"
  | "approved"
  | "fulfilled"
  | "revoked";

export type GlobeTreasureStateName = "available" | "claimed" | "unavailable";

export type GlobeTreasurePublicState = {
  ok: boolean;
  state: GlobeTreasureStateName;
  available: boolean;
  claimed: boolean;
  claimedByMe: boolean;
  claimStatus: GlobeTreasureClaimStatus | null;
  endsAt: string | null;
  serverTime: string | null;
};

export type GlobeTreasureClaimOutcome =
  | "won_by_you"
  | "already_claimed"
  | "unavailable";

export type GlobeTreasureClaimResult = {
  ok: boolean;
  outcome: GlobeTreasureClaimOutcome;
  claimed: boolean;
  claimedByMe: boolean;
  claimStatus: GlobeTreasureClaimStatus | null;
  idempotentReplay: boolean;
  claimedAt: string | null;
  rewardLabel: string | null;
};

const CAMPAIGN_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{7,63}$/;
const STATE_NAMES = new Set<GlobeTreasureStateName>([
  "available",
  "claimed",
  "unavailable",
]);
const CLAIM_OUTCOMES = new Set<GlobeTreasureClaimOutcome>([
  "won_by_you",
  "already_claimed",
  "unavailable",
]);
const CLAIM_STATUSES = new Set<GlobeTreasureClaimStatus>([
  "pending_review",
  "approved",
  "fulfilled",
  "revoked",
]);

function normalizeCampaignCode(value: string) {
  const code = value.trim().toLocaleLowerCase("en-US");
  if (!CAMPAIGN_CODE_PATTERN.test(code)) {
    throw new Error("invalid_treasure_campaign_code");
  }
  return code;
}

function objectPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("invalid_treasure_response");
  }
  return data as Record<string, unknown>;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function claimStatus(value: unknown): GlobeTreasureClaimStatus | null {
  return typeof value === "string"
    && CLAIM_STATUSES.has(value as GlobeTreasureClaimStatus)
    ? value as GlobeTreasureClaimStatus
    : null;
}

function mapPublicState(data: unknown): GlobeTreasurePublicState {
  const payload = objectPayload(data);
  const ok = payload.ok === true;
  const parsedState = typeof payload.state === "string"
    && STATE_NAMES.has(payload.state as GlobeTreasureStateName)
    ? payload.state as GlobeTreasureStateName
    : "unavailable";
  const state = ok ? parsedState : "unavailable";
  const claimed = state === "claimed" && payload.claimed === true;
  const claimedByMe = claimed && payload.claimedByMe === true;

  return {
    ok,
    state,
    available: state === "available" && payload.available === true && !claimed,
    claimed,
    claimedByMe,
    claimStatus: claimedByMe ? claimStatus(payload.claimStatus) : null,
    endsAt: optionalString(payload.endsAt),
    serverTime: optionalString(payload.serverTime),
  };
}

function mapClaimResult(data: unknown): GlobeTreasureClaimResult {
  const payload = objectPayload(data);
  const ok = payload.ok === true;
  const parsedOutcome = typeof payload.outcome === "string"
    && CLAIM_OUTCOMES.has(payload.outcome as GlobeTreasureClaimOutcome)
    ? payload.outcome as GlobeTreasureClaimOutcome
    : "unavailable";
  const outcome = ok ? parsedOutcome : "unavailable";
  const wonByMe = outcome === "won_by_you";
  const claimed = wonByMe || outcome === "already_claimed";

  return {
    ok,
    outcome,
    claimed,
    claimedByMe: wonByMe,
    claimStatus: wonByMe ? claimStatus(payload.claimStatus) : null,
    idempotentReplay: wonByMe && payload.idempotentReplay === true,
    claimedAt: wonByMe ? optionalString(payload.claimedAt) : null,
    rewardLabel: wonByMe ? optionalString(payload.rewardLabel) : null,
  };
}

export function createGlobeTreasureRepository(client: SupabaseClient = supabase) {
  return {
    async getState(
      campaignCode = GLOBE_TREASURE_CAMPAIGN_CODE,
    ): Promise<GlobeTreasurePublicState> {
      const { data, error } = await client.rpc("get_globe_treasure_state_v1", {
        p_campaign_code: normalizeCampaignCode(campaignCode),
      });
      if (error) throw error;
      return mapPublicState(data);
    },

    async claim(
      campaignCode = GLOBE_TREASURE_CAMPAIGN_CODE,
    ): Promise<GlobeTreasureClaimResult> {
      const { data, error } = await client.rpc("claim_globe_treasure_v1", {
        p_campaign_code: normalizeCampaignCode(campaignCode),
      });
      if (error) throw error;
      return mapClaimResult(data);
    },
  };
}

export type GlobeTreasureRepository = ReturnType<typeof createGlobeTreasureRepository>;

export const globeTreasureRepository = createGlobeTreasureRepository();

export function getGlobeTreasureState(
  campaignCode = GLOBE_TREASURE_CAMPAIGN_CODE,
) {
  return globeTreasureRepository.getState(campaignCode);
}

export function claimGlobeTreasure(
  campaignCode = GLOBE_TREASURE_CAMPAIGN_CODE,
) {
  return globeTreasureRepository.claim(campaignCode);
}
