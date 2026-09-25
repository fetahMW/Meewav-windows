import { describe, expect, it } from "vitest";

import type { MediaDistributionUse, MediaRightsGrant } from "./mediaRights.types";
import type { MusicCredit } from "./musicCredits.types";
import { validateRoomReplayPublicationContract } from "./roomReplayContract.service";
import type {
  RoomReplayParticipantConsent,
  RoomReplayPublicationContract,
} from "./roomReplayContract.types";

const NOW = "2026-08-08T12:00:00Z";

function grant(id: string, use: MediaDistributionUse): MediaRightsGrant {
  return {
    id,
    assetId: "room-recording-1",
    use,
    status: "active",
    grantorPartyId: "room-host",
    source: "signed-contract",
    territories: ["WORLDWIDE"],
    validFrom: "2026-08-01T00:00:00Z",
    validUntil: null,
    evidenceReference: `vault://${id}`,
  };
}

function consent(
  participantProfileId: string,
  consentedUses: readonly MediaDistributionUse[] = ["sceneVod"],
  overrides: Partial<RoomReplayParticipantConsent> = {},
): RoomReplayParticipantConsent {
  return {
    participantProfileId,
    status: "granted",
    consentedUses,
    evidenceReference: `vault://consent-${participantProfileId}`,
    grantedAt: "2026-08-08T10:30:00Z",
    ...overrides,
  };
}

function contract(overrides: Partial<RoomReplayPublicationContract> = {}) {
  return {
    id: "contract-1",
    roomId: "room-1",
    recordingAssetId: "room-recording-1",
    hostProfileId: "room-host",
    status: "executed",
    roomEndedAt: "2026-08-08T11:00:00Z",
    recordingState: "ready",
    capturedParticipantProfileIds: ["room-host", "guest-1"],
    participantConsents: [consent("room-host"), consent("guest-1")],
    requestedUses: ["sceneVod"],
    mediaRightsGrantIds: ["vod-grant"],
    executedAt: "2026-08-08T11:10:00Z",
    ...overrides,
  } satisfies RoomReplayPublicationContract;
}

const credits: MusicCredit[] = [{
  id: "primary",
  assetId: "room-recording-1",
  displayName: "Naya Oris",
  role: "primaryArtist",
  profileId: "room-host",
  order: 0,
}];

function validate(
  candidate: RoomReplayPublicationContract,
  grants: readonly MediaRightsGrant[] = [grant("vod-grant", "sceneVod")],
) {
  return validateRoomReplayPublicationContract(candidate, {
    at: NOW,
    territory: "FR",
    grants,
    credits,
  });
}

describe("Room replay publication contract", () => {
  it("authorises a completed Room replay only after explicit VOD consent and rights", () => {
    const result = validate(contract());

    expect(result.allowed).toBe(true);
    expect(result.rights).toMatchObject({
      allowed: true,
      requestedUses: ["sceneVod"],
      matchedGrantIds: ["vod-grant"],
    });
    expect(result.credits.valid).toBe(true);
  });

  it("does not require a published video id during the pure preflight", () => {
    const candidate = contract({ publishedVideoId: null });

    expect(validate(candidate).allowed).toBe(true);
    expect(candidate.publishedVideoId).toBeNull();
  });

  it("blocks a Room still in progress, an unready recording and an unsigned contract", () => {
    const result = validate(contract({
      status: "awaitingConsents",
      roomEndedAt: "2026-08-08T13:00:00Z",
      recordingState: "processing",
    }));

    expect(result.allowed).toBe(false);
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "room-not-ended",
      "recording-not-ready",
      "contract-not-executed",
    ]));
  });

  it("blocks missing or withdrawn captured-participant consent", () => {
    const missing = validate(contract({ participantConsents: [consent("room-host")] }));
    const withdrawn = validate(contract({
      participantConsents: [
        consent("room-host"),
        consent("guest-1", ["sceneVod"], { status: "withdrawn" }),
      ],
    }));

    expect(missing.issues).toContainEqual(expect.objectContaining({
      code: "participant-consent-missing",
      participantProfileId: "guest-1",
    }));
    expect(withdrawn.issues).toContainEqual(expect.objectContaining({
      code: "participant-consent-withdrawn",
      participantProfileId: "guest-1",
    }));
  });

  it("ignores a consent record for somebody who is not captured", () => {
    const result = validate(contract({
      participantConsents: [
        consent("room-host"),
        consent("guest-1"),
        consent("off-camera", [], { status: "declined", evidenceReference: null }),
      ],
    }));

    expect(result.allowed).toBe(true);
  });

  it("requires separate participant consent and rights grants for linear TV", () => {
    const requestedUses = ["sceneVod", "tvLinear"] as const;
    const candidate = contract({
      requestedUses,
      participantConsents: [
        consent("room-host", requestedUses),
        consent("guest-1", requestedUses),
      ],
      mediaRightsGrantIds: ["vod-grant", "tv-grant"],
    });

    const withoutTvGrant = validate(candidate);
    expect(withoutTvGrant.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "referenced-grant-missing", grantId: "tv-grant" }),
      expect.objectContaining({ code: "rights-denied", use: "tvLinear" }),
    ]));

    const withTvGrant = validate(candidate, [
      grant("vod-grant", "sceneVod"),
      grant("tv-grant", "tvLinear"),
    ]);
    expect(withTvGrant.allowed).toBe(true);
    expect(withTvGrant.rights.matchedGrantIds).toEqual(["vod-grant", "tv-grant"]);
  });

  it("does not let an unreferenced grant authorise the replay contract", () => {
    const requestedUses = ["sceneVod", "clipGeneration"] as const;
    const result = validate(contract({
      requestedUses,
      participantConsents: [
        consent("room-host", requestedUses),
        consent("guest-1", requestedUses),
      ],
      mediaRightsGrantIds: ["vod-grant"],
    }), [
      grant("vod-grant", "sceneVod"),
      grant("clip-grant", "clipGeneration"),
    ]);

    expect(result.allowed).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "rights-denied",
      use: "clipGeneration",
      detailCode: "missing-grant",
    }));
  });

  it("requires every captured participant to consent to derivative clips", () => {
    const result = validate(contract({
      requestedUses: ["sceneVod", "clipGeneration"],
      participantConsents: [
        consent("room-host", ["sceneVod", "clipGeneration"]),
        consent("guest-1", ["sceneVod"]),
      ],
      mediaRightsGrantIds: ["vod-grant", "clip-grant"],
    }), [
      grant("vod-grant", "sceneVod"),
      grant("clip-grant", "clipGeneration"),
    ]);

    expect(result.allowed).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "participant-use-missing",
      participantProfileId: "guest-1",
      use: "clipGeneration",
    }));
  });
});
