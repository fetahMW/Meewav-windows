import type { FranceCommunesIndexPayload, FranceSearchResult } from "./franceSearchTypes";

let cachedIndexPromise: Promise<FranceSearchResult[]> | null = null;

const COMMUNE_RESULT_OVERRIDES: Record<string, Partial<FranceSearchResult>> = {
  "commune-39478": {
    center: [5.8647, 46.3869],
    zoom: 15.45,
    pitch: 58,
    bearing: 120,
  },
  "commune-49353": {
    aliases: ["tres lazay", "tres-lazay"],
  },
};

function isFranceCommunesIndexPayload(value: unknown): value is FranceCommunesIndexPayload {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as FranceCommunesIndexPayload).results),
  );
}

export function loadFranceCommunesIndex(path = "/search/france-communes-index.json") {
  if (cachedIndexPromise) return cachedIndexPromise;

  cachedIndexPromise = fetch(path)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`France communes index unavailable: ${response.status}`);
      }

      return response.json() as Promise<unknown>;
    })
    .then((payload) => {
      if (!isFranceCommunesIndexPayload(payload)) {
        throw new Error("France communes index has an invalid format.");
      }

      return payload.results.map((result) => {
        const override = COMMUNE_RESULT_OVERRIDES[result.id];
        if (!override) return result;

        return {
          ...result,
          ...override,
          aliases: [
            ...(result.aliases ?? []),
            ...(override.aliases ?? []),
          ],
        };
      });
    })
    .catch((error: unknown) => {
      cachedIndexPromise = null;
      throw error;
    });

  return cachedIndexPromise;
}
