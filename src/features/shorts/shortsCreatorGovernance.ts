import {
  checkMediaRights,
  validateMusicCredits,
  type MediaDistributionUse,
  type MediaRightsGrant,
  type MusicCredit,
} from "../scene/mediaGovernance";

export type ShortsCreatorGovernanceInput = {
  assetId: string;
  primaryArtistName: string;
  collaboratorsText: string;
  musicRightsConfirmed: boolean;
  imageRightsConfirmed: boolean;
  requestedUses: readonly MediaDistributionUse[];
};

export type ShortsCreatorGovernancePreflight = {
  valid: boolean;
  credits: readonly MusicCredit[];
  requestedUses: readonly MediaDistributionUse[];
  issueCodes: readonly string[];
};

export function parseCreatorCollaborators(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[,;\n]/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter((name) => {
      if (!name) return false;
      const key = name.normalize("NFKC").toLocaleLowerCase("fr");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function buildCreatorCredits(
  assetId: string,
  primaryArtistName: string,
  collaboratorsText: string,
): readonly MusicCredit[] {
  const primaryArtist = primaryArtistName.trim().replace(/\s+/g, " ");
  const collaborators = parseCreatorCollaborators(collaboratorsText);
  return [
    {
      id: "local-credit-primary",
      assetId,
      displayName: primaryArtist,
      role: "primaryArtist",
      profileId: "shorts-current-user",
      order: 0,
    },
    ...collaborators.map((displayName, index): MusicCredit => ({
      id: `local-credit-collaborator-${index + 1}`,
      assetId,
      displayName,
      role: "featuredArtist",
      order: index + 1,
    })),
  ];
}

function buildLocalAttestationGrants(
  assetId: string,
  requestedUses: readonly MediaDistributionUse[],
  hasCompleteAttestation: boolean,
): readonly MediaRightsGrant[] {
  return requestedUses.map((use) => ({
    id: `local-preflight-${use}`,
    assetId,
    use,
    status: "active",
    grantorPartyId: "shorts-current-user",
    source: "artist-attestation",
    territories: ["WORLDWIDE"],
    validFrom: "2000-01-01T00:00:00.000Z",
    validUntil: null,
    evidenceReference: hasCompleteAttestation
      ? `local-attestation:${assetId}:${use}`
      : null,
  }));
}

/**
 * Client-side preflight only. The publication backend must create and verify
 * durable evidence before it stores or distributes the media.
 */
export function validateShortsCreatorGovernance(
  input: ShortsCreatorGovernanceInput,
): ShortsCreatorGovernancePreflight {
  const requestedUses = [...new Set(input.requestedUses)];
  const credits = buildCreatorCredits(
    input.assetId,
    input.primaryArtistName,
    input.collaboratorsText,
  );
  const creditsDecision = validateMusicCredits(input.assetId, credits);
  const completeAttestation = input.musicRightsConfirmed && input.imageRightsConfirmed;
  const grants = buildLocalAttestationGrants(
    input.assetId,
    requestedUses,
    completeAttestation,
  );
  const rightsDecision = checkMediaRights(
    input.assetId,
    requestedUses,
    grants,
    { territory: "WORLDWIDE" },
  );
  const issueCodes = [
    ...creditsDecision.issues.map(({ code }) => code),
    ...rightsDecision.issues.map(({ code, use }) => `${use}:${code}`),
  ];
  if (!requestedUses.includes("sceneVod")) issueCodes.push("scene-vod-required");
  if (!input.musicRightsConfirmed) issueCodes.push("music-rights-unconfirmed");
  if (!input.imageRightsConfirmed) issueCodes.push("image-rights-unconfirmed");

  return {
    valid: issueCodes.length === 0,
    credits,
    requestedUses,
    issueCodes,
  };
}
