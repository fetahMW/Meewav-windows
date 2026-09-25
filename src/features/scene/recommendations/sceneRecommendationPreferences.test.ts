import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENE_RECOMMENDATION_PREFERENCES,
  parseSceneRecommendationPreferences,
  readSceneRecommendationPreferences,
  resetSceneRecommendationPreferences,
  writeSceneRecommendationPreferences,
} from "./sceneRecommendationPreferences";

describe("sceneRecommendationPreferences", () => {
  it("normalizes stored preferences and rejects malformed state", () => {
    expect(parseSceneRecommendationPreferences("broken"))
      .toEqual(DEFAULT_SCENE_RECOMMENDATION_PREFERENCES);
    expect(parseSceneRecommendationPreferences(JSON.stringify({
      personalizationEnabled: false,
      historyEnabled: false,
      preferredStyles: ["Soul", "Soul", "", 42],
      hiddenArtistIds: ["artist-1"],
    }))).toEqual({
      personalizationEnabled: false,
      historyEnabled: false,
      preferredStyles: ["Soul"],
      hiddenArtistIds: ["artist-1"],
      reducedFormats: [],
    });
  });

  it("reads, writes and resets without exposing storage failures", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    writeSceneRecommendationPreferences({
      ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES,
      preferredStyles: ["Jazz"],
    }, storage);
    expect(readSceneRecommendationPreferences(storage).preferredStyles).toEqual(["Jazz"]);
    expect(resetSceneRecommendationPreferences(storage))
      .toEqual(DEFAULT_SCENE_RECOMMENDATION_PREFERENCES);
    expect(readSceneRecommendationPreferences(storage))
      .toEqual(DEFAULT_SCENE_RECOMMENDATION_PREFERENCES);
  });
});
