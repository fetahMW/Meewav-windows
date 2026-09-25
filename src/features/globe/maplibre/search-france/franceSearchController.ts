import { FRANCE_SEARCH_INDEX } from "./franceCityIndex";
import type { FranceSearchMatch, FranceSearchOptions, FranceSearchResult, FranceSearchResultType } from "./franceSearchTypes";
import { getFrenchQueryVariants, normalizeFrenchQuery } from "./normalizeFrenchQuery";

let activeFranceSearchIndex: readonly FranceSearchResult[] = FRANCE_SEARCH_INDEX;

const MATCH_KIND_WEIGHT = {
  "postal-exact": 1_200_000,
  exact: 1_000_000,
  "label-start": 800_000,
  "alias-start": 720_000,
  contains: 520_000,
  "subtitle-contains": 360_000,
} as const;

const TYPE_WEIGHT: Record<FranceSearchResultType, number> = {
  city: 150_000,
  commune: 145_000,
  district: 90_000,
  department: 60_000,
  region: 50_000,
};

export function setFranceSearchIndex(index: readonly FranceSearchResult[]) {
  activeFranceSearchIndex = index.length > 0 ? index : FRANCE_SEARCH_INDEX;
}

export function getFranceSearchIndexSize() {
  return activeFranceSearchIndex.length;
}

function getDistanceKilometers(a: [number, number], b: [number, number]) {
  const toRad = (value: number) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * radius * Math.asin(Math.sqrt(h));
}

function getSearchTokens(result: FranceSearchResult) {
  return {
    label: normalizeFrenchQuery(result.label),
    subtitle: normalizeFrenchQuery(result.subtitle),
    postalCodes: result.postalCodes ?? [],
    departmentCode: result.departmentCode ?? "",
    departmentName: normalizeFrenchQuery(result.departmentName ?? ""),
    regionName: normalizeFrenchQuery(result.regionName ?? ""),
    aliases: [
      ...(result.aliases ?? []),
      ...(result.postalCodes ?? []),
    ].flatMap((alias) => getFrenchQueryVariants(alias)),
  };
}

function getMatch(result: FranceSearchResult, queryVariants: string[]): FranceSearchMatch | null {
  const tokens = getSearchTokens(result);

  for (const query of queryVariants) {
    if (tokens.postalCodes.some((postalCode) => postalCode === query)) {
      return { result, kind: "postal-exact", score: 0 };
    }
  }

  for (const query of queryVariants) {
    if (tokens.label === query || tokens.aliases.some((alias) => alias === query)) {
      return { result, kind: "exact", score: 0 };
    }
  }

  for (const query of queryVariants) {
    if (tokens.label.startsWith(query)) {
      return { result, kind: "label-start", score: 0 };
    }
  }

  for (const query of queryVariants) {
    if (tokens.aliases.some((alias) => alias.startsWith(query))) {
      return { result, kind: "alias-start", score: 0 };
    }
  }

  for (const query of queryVariants) {
    if (tokens.label.includes(query) || tokens.aliases.some((alias) => alias.includes(query))) {
      return { result, kind: "contains", score: 0 };
    }
  }

  for (const query of queryVariants) {
    if (tokens.subtitle.includes(query) || tokens.departmentName.includes(query) || tokens.regionName.includes(query)) {
      return { result, kind: "subtitle-contains", score: 0 };
    }
  }

  return null;
}

function scoreMatch(match: FranceSearchMatch, options: FranceSearchOptions) {
  const { result, kind } = match;
  const proximityBoost = options.cameraCenter
    ? Math.max(0, 900 - getDistanceKilometers(options.cameraCenter, result.center))
    : 0;
  const importanceBoost = (result.importance ?? 0) * 1_000;
  const populationBoost = Math.min(result.population ?? 0, 3_000_000) / 1_000;

  return MATCH_KIND_WEIGHT[kind] +
    TYPE_WEIGHT[result.type] +
    importanceBoost +
    populationBoost +
    proximityBoost;
}

export function searchFrance(query: string, options: FranceSearchOptions = {}) {
  const queryVariants = getFrenchQueryVariants(query);
  const limit = options.limit ?? 8;

  if (queryVariants.length === 0) return [];

  return activeFranceSearchIndex
    .map((result) => getMatch(result, queryVariants))
    .filter((match): match is FranceSearchMatch => Boolean(match))
    .map((match) => ({
      ...match,
      score: scoreMatch(match, options),
    }))
    .sort((a, b) =>
      b.score - a.score ||
      (b.result.importance ?? 0) - (a.result.importance ?? 0) ||
      (b.result.population ?? 0) - (a.result.population ?? 0)
    )
    .slice(0, limit)
    .map((match) => match.result);
}
