import type {
  MediaDistributionUse,
  MediaRightsCheckContext,
  MediaRightsDecision,
  MediaRightsGrant,
  MediaRightsIssue,
} from "./mediaRights.types";

const WORLDWIDE_TERRITORY = "WORLDWIDE";

function timestamp(value: Date | string | number | undefined) {
  const parsed = value === undefined ? Date.now() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseTerritory(value: string) {
  return value.trim().toUpperCase();
}

function territoryCovered(grant: MediaRightsGrant, territory: string) {
  const requested = normaliseTerritory(territory);
  return grant.territories.some((candidate) => {
    const normalised = normaliseTerritory(candidate);
    return normalised === WORLDWIDE_TERRITORY || normalised === requested;
  });
}

function firstBlockingIssue(
  grant: MediaRightsGrant,
  use: MediaDistributionUse,
  at: number,
  territory: string,
): MediaRightsIssue | null {
  if (grant.status === "pending") return { code: "grant-pending", use, grantId: grant.id };
  if (grant.status === "revoked" || grant.revokedAt) {
    return { code: "grant-revoked", use, grantId: grant.id };
  }
  const startsAt = Date.parse(grant.validFrom);
  const endsAt = grant.validUntil === null ? null : Date.parse(grant.validUntil);
  if (!Number.isFinite(startsAt) || at < startsAt) {
    return { code: "grant-not-yet-valid", use, grantId: grant.id };
  }
  if (endsAt !== null && (!Number.isFinite(endsAt) || at >= endsAt)) {
    return { code: "grant-expired", use, grantId: grant.id };
  }
  if (!territoryCovered(grant, territory)) {
    return { code: "territory-not-covered", use, grantId: grant.id };
  }
  if (!grant.evidenceReference?.trim()) {
    return { code: "evidence-missing", use, grantId: grant.id };
  }
  return null;
}

export function checkMediaRights(
  assetId: string,
  requestedUses: readonly MediaDistributionUse[],
  grants: readonly MediaRightsGrant[],
  context: MediaRightsCheckContext,
): MediaRightsDecision {
  const at = timestamp(context.at);
  const uniqueUses = [...new Set(requestedUses)];
  if (at === null) {
    return {
      allowed: false,
      assetId,
      requestedUses: uniqueUses,
      matchedGrantIds: [],
      issues: uniqueUses.map((use) => ({ code: "grant-not-yet-valid", use })),
    };
  }

  const matchedGrantIds: string[] = [];
  const issues: MediaRightsIssue[] = [];
  for (const use of uniqueUses) {
    const candidates = grants.filter((grant) => grant.assetId === assetId && grant.use === use);
    if (candidates.length === 0) {
      issues.push({ code: "missing-grant", use });
      continue;
    }
    const evaluated = candidates.map((grant) => ({
      grant,
      issue: firstBlockingIssue(grant, use, at, context.territory),
    }));
    const valid = evaluated.find(({ issue }) => issue === null);
    if (valid) {
      matchedGrantIds.push(valid.grant.id);
      continue;
    }
    issues.push(evaluated[0].issue!);
  }

  return {
    allowed: issues.length === 0,
    assetId,
    requestedUses: uniqueUses,
    matchedGrantIds,
    issues,
  };
}

export function validateSceneVodRights(
  assetId: string,
  grants: readonly MediaRightsGrant[],
  context: MediaRightsCheckContext,
) {
  return checkMediaRights(assetId, ["sceneVod"], grants, context);
}

export function validateTvLinearRights(
  assetId: string,
  grants: readonly MediaRightsGrant[],
  context: MediaRightsCheckContext,
) {
  return checkMediaRights(assetId, ["tvLinear"], grants, context);
}

export function validateClipGenerationRights(
  assetId: string,
  grants: readonly MediaRightsGrant[],
  context: MediaRightsCheckContext,
) {
  return checkMediaRights(assetId, ["clipGeneration"], grants, context);
}
