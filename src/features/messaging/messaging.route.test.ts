import { describe, expect, it } from "vitest";
import {
  buildMarketplaceListingReturnPath,
  buildMessagingRoute,
  getMarketplaceListingId,
  getDemoConversationTarget,
  getDirectConversationTarget,
  parseMessagingRoute,
} from "./messaging.route";

const PROFILE_ID = "51000000-0000-4000-8000-000000000001";
const CONVERSATION_ID = "52000000-0000-4000-8000-000000000001";

describe("messaging route contract", () => {
  it("accepts the legacy Globe tab key without trusting arbitrary identifiers", () => {
    const route = parseMessagingRoute(`?tab=messages&intent=message&profileId=${PROFILE_ID}&source=globe`);

    expect(route).toMatchObject({
      space: "messages",
      intent: "message",
      profileId: PROFILE_ID,
      mode: "real",
      source: "globe",
    });
    expect(getDirectConversationTarget(route)).toBe(PROFILE_ID);
  });

  it("keeps a Globe demo target separate from a real profile UUID", () => {
    const route = parseMessagingRoute("?space=messages&intent=message&mode=demo&mockArtistId=mock-42&source=globe");

    expect(route.profileId).toBeNull();
    expect(route.mockArtistId).toBe("mock-42");
    expect(route.mode).toBe("demo");
    expect(getDirectConversationTarget(route)).toBeNull();
    expect(getDemoConversationTarget(route)).toBe("mock-42");
  });

  it("round-trips a bounded Shorts demo identity", () => {
    const built = buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "shorts",
      mode: "demo",
      mockArtistId: "shorts-artist-42",
      mockArtistName: "  Maya   Nova  ",
      mockArtistRole: "  Beatmaker · Productrice  ",
      mockArtistAvatar: "/images/shorts/maya.webp",
      mockArtistGradeLevel: 5,
    });
    const parsed = parseMessagingRoute(built.split("?")[1]);

    expect(parsed).toMatchObject({
      mode: "demo",
      source: "shorts",
      mockArtistId: "shorts-artist-42",
      mockArtistName: "Maya Nova",
      mockArtistRole: "Beatmaker · Productrice",
      mockArtistAvatar: "/images/shorts/maya.webp",
      mockArtistGradeLevel: 5,
    });
  });

  it("rejects unsafe demo metadata and never accepts it in real mode", () => {
    const unsafe = parseMessagingRoute(
      "?space=messages&mode=demo&mockArtistId=shorts-42"
      + "&mockArtistName=%00Maya&mockArtistRole=%0AAdmin"
      + "&mockArtistAvatar=%2F%2Fevil.test%2Favatar.png&mockArtistGradeLevel=7",
    );
    expect(unsafe).toMatchObject({
      mockArtistName: null,
      mockArtistRole: null,
      mockArtistAvatar: null,
      mockArtistGradeLevel: null,
    });

    const real = parseMessagingRoute(
      `?space=messages&mode=real&profileId=${PROFILE_ID}`
      + "&mockArtistName=Injected&mockArtistAvatar=%2Fimages%2Fevil.webp&mockArtistGradeLevel=6",
    );
    expect(real).toMatchObject({
      mode: "real",
      mockArtistId: null,
      mockArtistName: null,
      mockArtistRole: null,
      mockArtistAvatar: null,
      mockArtistGradeLevel: null,
    });

    const builtReal = buildMessagingRoute({
      mode: "real",
      profileId: PROFILE_ID,
      mockArtistId: "ignored",
      mockArtistName: "Ignored",
      mockArtistRole: "Ignored",
      mockArtistAvatar: "/images/ignored.webp",
      mockArtistGradeLevel: 6,
    });
    expect(builtReal).not.toContain("mockArtist");
  });

  it("writes only the canonical space-based URL", () => {
    expect(buildMessagingRoute({
      space: "messages",
      conversationId: CONVERSATION_ID,
    })).toBe(`/messages?space=messages&conversation=${CONVERSATION_ID}`);
  });

  it("drops malformed deep-link ids", () => {
    const route = parseMessagingRoute("?space=messages&conversation=not-a-uuid&profileId=artist-42");
    expect(route.conversationId).toBeNull();
    expect(route.profileId).toBeNull();
  });

  it("round-trips a safe Marketplace context without accepting an external return URL", () => {
    const route = buildMessagingRoute({
      space: "messages",
      source: "marketplace",
      intent: "message",
      profileId: PROFILE_ID,
      mode: "real",
      marketListingId: "listing-42",
      marketListingTitle: "  Moog   Subsequent 37  ",
      returnTo: "/market?pillar=used",
    });
    const parsed = parseMessagingRoute(route.split("?")[1]);

    expect(parsed).toMatchObject({
      source: "marketplace",
      marketListingId: "listing-42",
      marketListingTitle: "Moog Subsequent 37",
      returnTo: "/market?listing=listing-42",
    });
    expect(parseMessagingRoute("?source=marketplace&returnTo=https://example.com").returnTo).toBeNull();
  });

  it("builds one canonical Marketplace listing route for UUID and demo ids", () => {
    expect(buildMarketplaceListingReturnPath(PROFILE_ID)).toBe(`/market?listing=${PROFILE_ID}`);
    expect(buildMarketplaceListingReturnPath("used-moog-42")).toBe("/market?listing=used-moog-42");
    expect(buildMarketplaceListingReturnPath("../market?listing=evil")).toBe("/market");
    expect(getMarketplaceListingId(`?listing=${PROFILE_ID}&ignored=1`)).toBe(PROFILE_ID);
    expect(getMarketplaceListingId("?listing=%2Fmarket%3Fevil%3D1")).toBeNull();
  });

  it("cannot desynchronize a Marketplace listing from its return target", () => {
    const route = buildMessagingRoute({
      source: "marketplace",
      marketListingId: PROFILE_ID,
      marketListingTitle: "Annonce exacte",
      returnTo: "/market?listing=another-listing",
    });
    const parsed = parseMessagingRoute(route.split("?")[1]);

    expect(parsed.marketListingId).toBe(PROFILE_ID);
    expect(parsed.returnTo).toBe(`/market?listing=${PROFILE_ID}`);
  });
});
