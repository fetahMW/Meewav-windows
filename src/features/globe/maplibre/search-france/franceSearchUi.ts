import type { FranceSearchResult, FranceSearchResultType } from "./franceSearchTypes";
import { normalizeFrenchQuery } from "./normalizeFrenchQuery";

export function getFranceSearchTypeLabel(type: FranceSearchResultType) {
  if (type === "department") return "Département";
  if (type === "region") return "Région";
  if (type === "district") return "Arrondissement";
  if (type === "commune") return "Commune";

  return "Ville";
}

export function getFranceSearchIconKind(type: FranceSearchResultType) {
  if (type === "region") return "region";
  if (type === "department") return "department";
  if (type === "district") return "district";

  return "city";
}

export function getFranceSearchGhostCompletion(query: string, result: FranceSearchResult | null) {
  if (!result) return "";

  const normalizedQuery = normalizeFrenchQuery(query);
  const normalizedLabel = normalizeFrenchQuery(result.label);
  if (!normalizedQuery || !normalizedLabel.startsWith(normalizedQuery)) return "";

  return result.label.slice(query.length);
}
