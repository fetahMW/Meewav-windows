export type FranceSearchResultType = "city" | "commune" | "department" | "region" | "district";

export type FranceSearchResult = {
  id: string;
  label: string;
  subtitle: string;
  type: FranceSearchResultType;
  center: [number, number];
  postalCodes?: string[];
  departmentCode?: string;
  departmentName?: string;
  regionName?: string;
  population?: number;
  importance?: number;
  aliases?: string[];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  speed?: number;
  source?: string;
};

export type FranceSearchMatchKind =
  | "postal-exact"
  | "exact"
  | "label-start"
  | "alias-start"
  | "contains"
  | "subtitle-contains";

export type FranceSearchMatch = {
  result: FranceSearchResult;
  kind: FranceSearchMatchKind;
  score: number;
};

export type FranceSearchOptions = {
  limit?: number;
  cameraCenter?: [number, number];
};

export type FranceCommunesIndexPayload = {
  version: number;
  generatedAt?: string;
  source?: string;
  results: FranceSearchResult[];
};
