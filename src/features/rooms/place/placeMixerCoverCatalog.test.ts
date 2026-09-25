import { describe, expect, it } from "vitest";
import {
  getPlaceMixerFallbackCover,
  PLACE_MIXER_FALLBACK_COVERS,
  resolvePlaceMixerCover,
} from "./placeMixerCoverCatalog";

describe("placeMixerCoverCatalog", () => {
  it("exposes twelve distinct fallback covers", () => {
    expect(PLACE_MIXER_FALLBACK_COVERS).toHaveLength(12);
    expect(new Set(PLACE_MIXER_FALLBACK_COVERS)).toHaveLength(12);
  });

  it("always preserves a cover supplied by the user or media library", () => {
    expect(resolvePlaceMixerCover({
      cover: "  https://cdn.example.test/my-cover.webp  ",
      id: "track-1",
      title: "Titre",
    })).toBe("https://cdn.example.test/my-cover.webp");
  });

  it("assigns the same fallback to the same stable track identity", () => {
    const identity = {
      id: "device-demo-track",
      title: "Session nocturne",
      fileName: "session-nocturne.mp3",
      fileSize: 4_208_640,
      fileLastModified: 1_786_690_800_000,
      sourceUrl: "blob:http://localhost/first-runtime-url",
    };

    expect(resolvePlaceMixerCover(identity)).toBe(resolvePlaceMixerCover({
      ...identity,
      sourceUrl: "blob:http://localhost/a-different-runtime-url",
    }));
  });

  it("distributes a varied collection while keeping every result in the catalog", () => {
    const assigned = Array.from({ length: 96 }, (_, index) => getPlaceMixerFallbackCover(`track-${index}`));
    expect(new Set(assigned).size).toBe(PLACE_MIXER_FALLBACK_COVERS.length);
    assigned.forEach((cover) => expect(PLACE_MIXER_FALLBACK_COVERS).toContain(cover));
  });
});
