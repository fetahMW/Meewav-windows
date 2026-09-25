import { checkMediaRights } from "./mediaRights.service";
import type {
  MediaDistributionUse,
  MediaRightsCheckContext,
  MediaRightsGrant,
} from "./mediaRights.types";
import { validateMusicCredits } from "./musicCredits.service";
import type { MusicCredit } from "./musicCredits.types";
import type {
  RoomReplayContractIssue,
  RoomReplayParticipantConsent,
  RoomReplayPublicationContract,
  RoomReplayPublicationDecision,
} from "./roomReplayContract.types";

export type RoomReplayPublicationContext = MediaRightsCheckContext & {
  grants: readonly MediaRightsGrant[];
  credits: readonly MusicCredit[];
};

function timestamp(value: Date | string | number | undefined) {
  const parsed = value === undefined ? Date.now() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function consentIssue(
  consent: RoomReplayParticipantConsent,
): RoomReplayContractIssue["code"] | null {
  switch (consent.status) {
    case "pending": return "participant-consent-pending";
    case "declined": return "participant-consent-declined";
    case "withdrawn": return "participant-consent-withdrawn";
    case "granted": return null;
  }
}

function validateParticipantConsent(
  participantProfileId: string,
  consents: readonly RoomReplayParticipantConsent[],
  requestedUses: readonly MediaDistributionUse[],
  isHost: boolean,
) {
  const issues: RoomReplayContractIssue[] = [];
  const consent = consents.find((candidate) => (
    candidate.participantProfileId === participantProfileId
  ));
  if (!consent) {
    issues.push({
      code: isHost ? "host-consent-missing" : "participant-consent-missing",
      participantProfileId,
    });
    return issues;
  }

  const statusIssue = consentIssue(consent);
  if (statusIssue) {
    issues.push({ code: statusIssue, participantProfileId });
    return issues;
  }
  if (!consent.evidenceReference?.trim()) {
    issues.push({ code: "participant-evidence-missing", participantProfileId });
  }
  for (const use of requestedUses) {
    if (!consent.consentedUses.includes(use)) {
      issues.push({ code: "participant-use-missing", participantProfileId, use });
    }
  }
  return issues;
}

/**
 * Pure preflight only: it neither publishes a replay nor mutates a grant.
 * Backend publication must run the same checks transactionally at write time.
 */
export function validateRoomReplayPublicationContract(
  contract: RoomReplayPublicationContract,
  context: RoomReplayPublicationContext,
): RoomReplayPublicationDecision {
  const issues: RoomReplayContractIssue[] = [];
  const at = timestamp(context.at);
  const endedAt = contract.roomEndedAt === null ? null : Date.parse(contract.roomEndedAt);
  if (
    at === null
    || endedAt === null
    || !Number.isFinite(endedAt)
    || endedAt > at
  ) {
    issues.push({ code: "room-not-ended" });
  }
  if (contract.recordingState !== "ready") {
    issues.push({ code: "recording-not-ready" });
  }
  if (contract.status === "revoked") {
    issues.push({ code: "contract-revoked" });
  } else if (contract.status !== "executed") {
    issues.push({ code: "contract-not-executed" });
  }

  const requestedUses = [...new Set(contract.requestedUses)];
  if (!requestedUses.includes("sceneVod")) {
    issues.push({ code: "scene-vod-not-requested", use: "sceneVod" });
  }

  const capturedParticipants = [...new Set([
    contract.hostProfileId,
    ...contract.capturedParticipantProfileIds,
  ])];
  for (const participantProfileId of capturedParticipants) {
    issues.push(...validateParticipantConsent(
      participantProfileId,
      contract.participantConsents,
      requestedUses,
      participantProfileId === contract.hostProfileId,
    ));
  }

  const referencedGrantIds = new Set(contract.mediaRightsGrantIds);
  const referencedGrants = context.grants.filter((grant) => referencedGrantIds.has(grant.id));
  for (const grantId of referencedGrantIds) {
    if (!context.grants.some((grant) => grant.id === grantId)) {
      issues.push({ code: "referenced-grant-missing", grantId });
    }
  }
  const rights = checkMediaRights(
    contract.recordingAssetId,
    requestedUses,
    referencedGrants,
    context,
  );
  for (const rightsIssue of rights.issues) {
    issues.push({
      code: "rights-denied",
      use: rightsIssue.use,
      grantId: rightsIssue.grantId,
      detailCode: rightsIssue.code,
    });
  }

  const credits = validateMusicCredits(contract.recordingAssetId, context.credits);
  if (!credits.valid) issues.push({ code: "credits-invalid" });

  return {
    allowed: issues.length === 0,
    roomId: contract.roomId,
    recordingAssetId: contract.recordingAssetId,
    issues,
    rights,
    credits,
  };
}
