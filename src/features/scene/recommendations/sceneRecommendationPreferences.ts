import { scenePrivateKey } from "../scenePrivateStorage";
export const SCENE_RECOMMENDATION_PREFERENCES_KEY = "meewav:scene:recommendation-preferences:v1";

export type SceneRecommendationPreferences = {
  personalizationEnabled: boolean;
  historyEnabled: boolean;
  preferredStyles: string[];
  hiddenArtistIds: string[];
  reducedFormats: string[];
};

export const DEFAULT_SCENE_RECOMMENDATION_PREFERENCES: SceneRecommendationPreferences = {
  personalizationEnabled: true,
  historyEnabled: true,
  preferredStyles: [],
  hiddenArtistIds: [],
  reducedFormats: [],
};

type RecommendationStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function normalizeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 100))];
}

export function parseSceneRecommendationPreferences(serialized: string | null | undefined) {
  if (!serialized) return { ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES };
  try {
    const value: unknown = JSON.parse(serialized);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES };
    }
    const record = value as Record<string, unknown>;
    return {
      personalizationEnabled: typeof record.personalizationEnabled === "boolean"
        ? record.personalizationEnabled
        : true,
      historyEnabled: typeof record.historyEnabled === "boolean"
        ? record.historyEnabled
        : true,
      preferredStyles: normalizeList(record.preferredStyles),
      hiddenArtistIds: normalizeList(record.hiddenArtistIds),
      reducedFormats: normalizeList(record.reducedFormats),
    } satisfies SceneRecommendationPreferences;
  } catch {
    return { ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES };
  }
}

function browserStorage(): RecommendationStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readSceneRecommendationPreferences(storage = browserStorage()) {
  try {
    return parseSceneRecommendationPreferences(storage?.getItem(scenePrivateKey(SCENE_RECOMMENDATION_PREFERENCES_KEY)));
  } catch {
    return { ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES };
  }
}

export function writeSceneRecommendationPreferences(
  value: SceneRecommendationPreferences,
  storage = browserStorage(),
) {
  const normalized = parseSceneRecommendationPreferences(JSON.stringify(value));
  try {
    storage?.setItem(scenePrivateKey(SCENE_RECOMMENDATION_PREFERENCES_KEY), JSON.stringify(normalized));
  } catch {
    // The current session remains usable when storage is blocked or full.
  }
  return normalized;
}

export function resetSceneRecommendationPreferences(storage = browserStorage()) {
  try {
    storage?.removeItem(scenePrivateKey(SCENE_RECOMMENDATION_PREFERENCES_KEY));
  } catch {
    // Private mode must not make the reset action fail visibly.
  }
  return { ...DEFAULT_SCENE_RECOMMENDATION_PREFERENCES };
}
