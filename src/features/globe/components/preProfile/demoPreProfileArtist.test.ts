import { describe, expect, it } from "vitest";
import { LOCAL_PREVIEW_FETAH_HOST } from "../../../auth/localAuthPreview";
import { getPreProfileArtistForSeed } from "./demoPreProfileArtist";

describe("getPreProfileArtistForSeed", () => {
  it("ne remplace jamais un vrai compteur Golden Like à zéro par une valeur hashée", () => {
    const artist = getPreProfileArtistForSeed({
      profileId: "20000000-0000-4000-8000-000000000002",
      displayName: "Nouveau profil",
      golden_likes_count: 0,
    });

    expect(artist.goldenLikesCount).toBe(0);
    expect(artist.golden_likes_count).toBe(0);
  });

  it("retrouve la popup fondateur existante pour le host Fetah Beatmaker", () => {
    const artist = getPreProfileArtistForSeed({
      profileId: LOCAL_PREVIEW_FETAH_HOST.profileId,
      displayName: LOCAL_PREVIEW_FETAH_HOST.displayName,
      handle: LOCAL_PREVIEW_FETAH_HOST.handle,
      iconId: LOCAL_PREVIEW_FETAH_HOST.avatarIconId,
      mainRole: LOCAL_PREVIEW_FETAH_HOST.roleKey,
      zoneName: "Charonne",
    });

    expect(artist).toMatchObject({
      id: "current_user_fetah",
      name: "Fetah",
      role: "Fondateur",
      portraitUrl: "/assets/orbit/founder-puff.png",
      location: "Charonne",
    });
    expect(artist.shorts.length).toBeGreaterThan(0);
    expect(artist.audios.length).toBeGreaterThan(0);
    expect(artist.stats.collabAvailable).toBe(true);
  });
});
