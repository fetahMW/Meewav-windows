export type NationalGeoSearchRecord = {
  zoneId: string;
  displayName: string;
  aliases: string[];
  communeCode: string;
  communeName: string;
  departmentName: string | null;
  regionName: string | null;
  bbox: [number, number, number, number];
  labelPoint: [number, number];
  quality: "official" | "curated" | "fallback";
  sourceVintage: string;
  cameraOverride: {
    zoom?: number;
    pitch?: number;
    bearing?: number;
    padding?: number;
  } | null;
  searchKey: string;
};

export const NATIONAL_GEO_SEARCH_INDEX_URL =
  "/map/national/2026.1-prototype/music-zones-search.json?v=2026.2-montpellier-test";

export function normalizeNationalGeoSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchNationalGeoRecords(
  records: NationalGeoSearchRecord[],
  query: string,
  limit = 12,
) {
  const normalized = normalizeNationalGeoSearch(query);
  if (normalized.length < 2) return [];
  const terms = normalized.split(/\s+/);
  return records
    .filter((record) => terms.every((term) => record.searchKey.includes(term)))
    .sort((first, second) => {
      const firstExact = normalizeNationalGeoSearch(first.displayName) === normalized ? 0 : 1;
      const secondExact = normalizeNationalGeoSearch(second.displayName) === normalized ? 0 : 1;
      return firstExact - secondExact
        || first.displayName.localeCompare(second.displayName, "fr")
        || first.communeName.localeCompare(second.communeName, "fr");
    })
    .slice(0, Math.max(1, Math.min(30, Math.trunc(limit))));
}

export async function loadNationalGeoSearchIndex(): Promise<NationalGeoSearchRecord[]> {
  const response = await fetch(NATIONAL_GEO_SEARCH_INDEX_URL);
  if (!response.ok) throw new Error(`Unable to load national geography search index: HTTP ${response.status}`);
  const payload = await response.json() as { zones?: NationalGeoSearchRecord[] };
  return Array.isArray(payload.zones) ? payload.zones : [];
}
