import type { MediaDistributionUse, MediaRightsDecision } from "./mediaRights.types";
import type { MusicCreditsDecision } from "./musicCredits.types";

export type RoomReplayContractStatus =
  | "draft"
  | "awaitingConsents"
  | "executed"
  | "revoked";

export type RoomReplayRecordingState = "processing" | "ready" | "deleted";

export type RoomReplayConsentStatus = "pending" | "granted" | "declined" | "withdrawn";

export type RoomReplayParticipantConsent = {
  participantProfileId: string;
  status: RoomReplayConsentStatus;
  consentedUses: readonly MediaDistributionUse[];
  evidenceReference: string | null;
  grantedAt?: string | null;
  withdrawnAt?: string | null;
};

/**
 * Versioned publication intent for a recording produced by a Room.
 *
 * It references rights grants instead of embedding them so that a later
 * revocation can stop VOD, TV and derivative clips independently.
 */
export type RoomReplayPublicationContract = {
  id: string;
  roomId: string;
  recordingAssetId: string;
  hostProfileId: string;
  status: RoomReplayContractStatus;
  roomEndedAt: string | null;
  recordingState: RoomReplayRecordingState;
  capturedParticipantProfileIds: readonly string[];
  participantConsents: readonly RoomReplayParticipantConsent[];
  requestedUses: readonly MediaDistributionUse[];
  mediaRightsGrantIds: readonly string[];
  executedAt?: string | null;
  publishedVideoId?: string | null;
};

export type RoomReplayContractIssueCode =
  | "room-not-ended"
  | "recording-not-ready"
  | "contract-not-executed"
  | "contract-revoked"
  | "scene-vod-not-requested"
  | "host-consent-missing"
  | "participant-consent-missing"
  | "participant-consent-pending"
  | "participant-consent-declined"
  | "participant-consent-withdrawn"
  | "participant-use-missing"
  | "participant-evidence-missing"
  | "referenced-grant-missing"
  | "rights-denied"
  | "credits-invalid";

export type RoomReplayContractIssue = {
  code: RoomReplayContractIssueCode;
  participantProfileId?: string;
  use?: MediaDistributionUse;
  grantId?: string;
  detailCode?: string;
};

export type RoomReplayPublicationDecision = {
  allowed: boolean;
  roomId: string;
  recordingAssetId: string;
  issues: readonly RoomReplayContractIssue[];
  rights: MediaRightsDecision;
  credits: MusicCreditsDecision;
};
