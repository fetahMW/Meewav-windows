import { describe, expect, it } from "vitest";
import { canDisplayScenePublishing } from "./scenePublishingAccess";

describe("La Scène publishing visibility", () => {
  it("shows publishing to artistic and professional accounts", () => {
    expect(canDisplayScenePublishing({
      userMetadata: { primary_role_key: "vocalist" },
    })).toBe(true);
    expect(canDisplayScenePublishing({
      userMetadata: { artist_type: "Ingénieur du son" },
    })).toBe(true);
    expect(canDisplayScenePublishing({
      userMetadata: { account_type: "artist" },
    })).toBe(true);
  });

  it("hides publishing from viewers, anonymous visitors and incomplete accounts", () => {
    expect(canDisplayScenePublishing({
      userMetadata: { primary_role_key: "viewer" },
    })).toBe(false);
    expect(canDisplayScenePublishing({
      userMetadata: { artist_type: "Utilisateur / Utilisatrice" },
    })).toBe(false);
    expect(canDisplayScenePublishing({ userMetadata: {} })).toBe(false);
    expect(canDisplayScenePublishing({})).toBe(false);
  });

  it("allows the explicit local artist preview without opening guest access", () => {
    expect(canDisplayScenePublishing({ localArtistPreview: true })).toBe(true);
    expect(canDisplayScenePublishing({
      userMetadata: { primary_role_key: "viewer" },
      localArtistPreview: true,
    })).toBe(false);
  });
});
