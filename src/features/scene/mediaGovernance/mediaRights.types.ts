export type MediaDistributionUse = "sceneVod" | "tvLinear" | "clipGeneration";

export type MediaRightsGrantStatus = "pending" | "active" | "revoked";

export type MediaRightsGrantSource =
  | "artist-attestation"
  | "signed-contract"
  | "partner-license"
  | "meewav-production";

/**
 * One grant authorises one distribution use. A La Scène VOD grant therefore
 * never authorises linear TV or clip generation by implication.
 */
export type MediaRightsGrant = {
  id: string;
  assetId: string;
  use: MediaDistributionUse;
  status: MediaRightsGrantStatus;
  grantorPartyId: string;
  source: MediaRightsGrantSource;
  territories: readonly string[];
  validFrom: string;
  validUntil: string | null;
  evidenceReference: string | null;
  revokedAt?: string | null;
};

export type MediaRightsCheckContext = {
  at?: Date | string | number;
  territory: string;
};

export type MediaRightsIssueCode =
  | "missing-grant"
  | "grant-pending"
  | "grant-revoked"
  | "grant-not-yet-valid"
  | "grant-expired"
  | "territory-not-covered"
  | "evidence-missing";

export type MediaRightsIssue = {
  code: MediaRightsIssueCode;
  use: MediaDistributionUse;
  grantId?: string;
};

export type MediaRightsDecision = {
  allowed: boolean;
  assetId: string;
  requestedUses: readonly MediaDistributionUse[];
  matchedGrantIds: readonly string[];
  issues: readonly MediaRightsIssue[];
};
