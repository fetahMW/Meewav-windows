import { describe, expect, it } from "vitest";
import { getProfileIconImageUrl, PROFILE_ICON_FILES } from "./profileIconAssets";
import {
  GLOBE_ARTIST_ROLE_OPTIONS,
  SCENE_ARTIST_ROLE_OPTIONS,
} from "./profileIconCatalog";

describe("profileIconCatalog", () => {
  it("keeps the canonical thirty Globe categories in their stable order", () => {
    expect(GLOBE_ARTIST_ROLE_OPTIONS).toHaveLength(30);
    expect(GLOBE_ARTIST_ROLE_OPTIONS.map(({ key }) => key)).toEqual(
      Array.from({ length: 30 }, (_, index) => `avatar_${index + 1}`),
    );
    expect(GLOBE_ARTIST_ROLE_OPTIONS.map(({ label }) => label)).toEqual([
      "Violoniste",
      "Vidéaste clipper",
      "Utilisatrice",
      "Utilisateur",
      "Studio",
      "Sound designer",
      "Pianiste",
      "Percussionniste",
      "Organisation scénique",
      "Management",
      "Label",
      "Cuivres",
      "Instruments à vent",
      "Ingénieur du son",
      "Guitariste électrique",
      "Guitariste acoustique",
      "DJ",
      "Direction artistique",
      "Danseuse",
      "Danseur",
      "Compositeur",
      "Coach vocal",
      "Chanteuse / rappeuse",
      "Chanteur / rappeur",
      "Beatmaker",
      "Beatboxer",
      "Batteur / batteuse",
      "Bassiste",
      "Auteur / parolier",
      "Accordéoniste",
    ]);
    expect(GLOBE_ARTIST_ROLE_OPTIONS[0]).toMatchObject({
      key: "avatar_1",
      label: "Violoniste",
      count: 0,
    });
    expect(GLOBE_ARTIST_ROLE_OPTIONS[29]).toMatchObject({
      key: "avatar_30",
      label: "Accordéoniste",
      count: 0,
    });
  });

  it("exposes the twenty-eight artistic roles without public listener avatars", () => {
    expect(SCENE_ARTIST_ROLE_OPTIONS).toHaveLength(28);
    expect(SCENE_ARTIST_ROLE_OPTIONS.map(({ key }) => key)).not.toContain("avatar_3");
    expect(SCENE_ARTIST_ROLE_OPTIONS.map(({ key }) => key)).not.toContain("avatar_4");
    expect(SCENE_ARTIST_ROLE_OPTIONS).toEqual(
      GLOBE_ARTIST_ROLE_OPTIONS.filter(({ key }) => key !== "avatar_3" && key !== "avatar_4"),
    );
  });

  it("resolves every category to an existing canonical V4 image", () => {
    for (const category of GLOBE_ARTIST_ROLE_OPTIONS) {
      expect(category.imageUrl).toMatch(/^\/images\/V4\//);
      expect(PROFILE_ICON_FILES[category.key]).toBeTypeOf("string");
      expect(category.imageUrl).toBe(getProfileIconImageUrl(category.key));
      expect(category.filterTokens).toContain(category.key);
    }
  });
});
