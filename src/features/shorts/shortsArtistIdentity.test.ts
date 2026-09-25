import { describe, expect, it } from "vitest";

import { resolveSceneCanonicalProfileId } from "./shortsArtistIdentity";

describe("resolveSceneCanonicalProfileId", () => {
  const profileId = "22222222-2222-4222-8222-222222222222";

  it("résout la même identité réelle quel que soit le champ historique", () => {
    expect(resolveSceneCanonicalProfileId({ profileId })).toBe(profileId);
    expect(resolveSceneCanonicalProfileId({ artistId: profileId })).toBe(profileId);
    expect(resolveSceneCanonicalProfileId({ mockArtistId: profileId })).toBe(profileId);
  });

  it("préfère toujours un UUID réel à une référence de démonstration", () => {
    expect(resolveSceneCanonicalProfileId({
      profileId: "scene-demo-profile",
      artistId: profileId,
      mockArtistId: "scene-demo-artist",
    })).toBe(profileId);
  });

  it("ne transforme pas une référence de démonstration en profil réel", () => {
    expect(resolveSceneCanonicalProfileId({
      artistId: "scene-demo-artist",
      mockArtistId: "scene-demo-artist",
    })).toBeNull();
  });
});
