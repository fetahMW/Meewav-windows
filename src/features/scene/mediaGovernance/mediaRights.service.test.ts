import { describe, expect, it } from "vitest";

import {
  checkMediaRights,
  validateClipGenerationRights,
  validateSceneVodRights,
  validateTvLinearRights,
} from "./mediaRights.service";
import type {
  MediaDistributionUse,
  MediaRightsGrant,
} from "./mediaRights.types";

const NOW = "2026-08-08T12:00:00Z";

function grant(
  id: string,
  use: MediaDistributionUse,
  overrides: Partial<MediaRightsGrant> = {},
): MediaRightsGrant {
  return {
    id,
    assetId: "asset-room-1",
    use,
    status: "active",
    grantorPartyId: "artist-1",
    source: "signed-contract",
    territories: ["WORLDWIDE"],
    validFrom: "2026-01-01T00:00:00Z",
    validUntil: null,
    evidenceReference: `vault://${id}`,
    ...overrides,
  };
}

const context = { at: NOW, territory: "FR" } as const;

describe("media rights validation", () => {
  it("does not let a La Scène VOD grant authorise linear TV", () => {
    const grants = [grant("vod", "sceneVod")];

    expect(validateSceneVodRights("asset-room-1", grants, context)).toMatchObject({
      allowed: true,
      matchedGrantIds: ["vod"],
    });
    expect(validateTvLinearRights("asset-room-1", grants, context)).toMatchObject({
      allowed: false,
      issues: [{ code: "missing-grant", use: "tvLinear" }],
    });
  });

  it("requires another explicit grant for derivative clips", () => {
    const tvGrant = grant("tv", "tvLinear");

    expect(validateTvLinearRights("asset-room-1", [tvGrant], context).allowed).toBe(true);
    expect(validateClipGenerationRights("asset-room-1", [tvGrant], context).allowed).toBe(false);

    const result = checkMediaRights(
      "asset-room-1",
      ["tvLinear", "clipGeneration"],
      [tvGrant, grant("clip", "clipGeneration")],
      context,
    );
    expect(result.allowed).toBe(true);
    expect(result.matchedGrantIds).toEqual(["tv", "clip"]);
  });

  it.each([
    ["wrong territory", grant("territory", "sceneVod", { territories: ["CA"] }), "territory-not-covered"],
    ["expired", grant("expired", "sceneVod", { validUntil: NOW }), "grant-expired"],
    ["revoked", grant("revoked", "sceneVod", { status: "revoked" }), "grant-revoked"],
    ["missing evidence", grant("evidence", "sceneVod", { evidenceReference: " " }), "evidence-missing"],
  ])("blocks a %s grant", (_label, candidate, expectedCode) => {
    const result = validateSceneVodRights("asset-room-1", [candidate], context);

    expect(result.allowed).toBe(false);
    expect(result.issues[0].code).toBe(expectedCode);
  });

  it("uses a valid candidate when an earlier grant for the same use is invalid", () => {
    const result = validateSceneVodRights("asset-room-1", [
      grant("old", "sceneVod", { validUntil: "2026-02-01T00:00:00Z" }),
      grant("current", "sceneVod"),
    ], context);

    expect(result.allowed).toBe(true);
    expect(result.matchedGrantIds).toEqual(["current"]);
    expect(result.issues).toEqual([]);
  });
});
