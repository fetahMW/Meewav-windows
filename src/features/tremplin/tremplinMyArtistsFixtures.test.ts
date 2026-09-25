import { describe, expect, it } from "vitest";
import { tremplinArtists } from "./tremplinArtistData";
import {
  buildMyArtistsFixtureFromFollows,
  getMyArtistsFixture,
} from "./tremplinMyArtistsFixtures";

describe("fixtures Mes artistes", () => {
  it("conserve la démonstration peuplée par défaut", () => {
    expect(getMyArtistsFixture("").id).toBe("populated");
  });

  it("construit un état sans finance depuis les artistes réellement suivis", () => {
    const followed = tremplinArtists.slice(0, 2);
    const fixture = buildMyArtistsFixtureFromFollows(followed);
    expect(fixture.id).toBe("followingOnly");
    expect(fixture.followedArtistIds).toEqual(followed.map(({ id }) => id));
    expect(fixture.holdings).toEqual([]);
    expect(fixture.summary.activeTokenCount).toBe(0);
    expect(fixture.activities.every(({ artistId }) => fixture.followedArtistIds.includes(artistId))).toBe(true);
  });

  it("retourne un vrai état vide sans artiste suivi", () => {
    expect(buildMyArtistsFixtureFromFollows([]).id).toBe("empty");
  });
});
