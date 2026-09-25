import type { MediaRightsGrant } from "../mediaGovernance";
import { SCENE_TV_GUIDE_SOURCES_FIXTURE } from "./sceneTvGuide.fixtures";

/**
 * Investor-demo attestations only. They prove that the gate works; they are
 * not production clearances and must never be migrated as legal evidence.
 */
export const SCENE_TV_INVESTOR_DEMO_TV_RIGHTS_GRANTS: readonly MediaRightsGrant[] = [
  ...new Map(SCENE_TV_GUIDE_SOURCES_FIXTURE.map((source) => [
    source.publishedVideoId,
    {
      id: `demo-tv-linear-${source.publishedVideoId}`,
      assetId: source.publishedVideoId,
      use: "tvLinear" as const,
      status: "active" as const,
      grantorPartyId: source.artistId,
      source: "artist-attestation" as const,
      territories: ["WORLDWIDE"],
      validFrom: "2000-01-01T00:00:00.000Z",
      validUntil: null,
      evidenceReference: `demo-only://tv-linear/${source.publishedVideoId}`,
    },
  ])).values(),
];
