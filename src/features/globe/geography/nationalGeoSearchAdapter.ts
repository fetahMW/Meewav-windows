import type { FranceSearchResult } from "../maplibre/search-france/franceSearchTypes";
import {
  loadNationalGeoSearchIndex,
  type NationalGeoSearchRecord,
} from "./nationalGeoSearch";

export const NATIONAL_ZONE_SEARCH_SOURCE = "meewav-national-zones";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getZoomFromBounds(bbox: NationalGeoSearchRecord["bbox"]) {
  const longitudeSpan = Math.max(0.0001, Math.abs(bbox[2] - bbox[0]));
  const latitudeSpan = Math.max(0.0001, Math.abs(bbox[3] - bbox[1]));
  const maximumSpan = Math.max(longitudeSpan, latitudeSpan);
  return clamp(14.8 - Math.log2(maximumSpan / 0.02), 11.5, 16.2);
}

export function adaptNationalGeoSearchRecord(record: NationalGeoSearchRecord): FranceSearchResult {
  const subtitleParts = [record.communeName, record.departmentName, record.regionName]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);
  return {
    id: record.zoneId,
    label: record.displayName,
    subtitle: subtitleParts.join(" · "),
    type: "district",
    center: record.labelPoint,
    departmentName: record.departmentName ?? undefined,
    regionName: record.regionName ?? undefined,
    aliases: record.aliases,
    zoom: record.cameraOverride?.zoom ?? getZoomFromBounds(record.bbox),
    pitch: record.cameraOverride?.pitch,
    bearing: record.cameraOverride?.bearing,
    source: NATIONAL_ZONE_SEARCH_SOURCE,
  };
}

export function mergeNationalGeoSearchResults(
  baseResults: readonly FranceSearchResult[],
  nationalRecords: readonly NationalGeoSearchRecord[],
) {
  const results = [...baseResults];
  const knownIds = new Set(results.map((result) => result.id));
  for (const record of nationalRecords) {
    if (knownIds.has(record.zoneId)) continue;
    results.push(adaptNationalGeoSearchRecord(record));
    knownIds.add(record.zoneId);
  }
  return results;
}

export async function loadNationalFranceSearchResults(baseResults: readonly FranceSearchResult[]) {
  return mergeNationalGeoSearchResults(baseResults, await loadNationalGeoSearchIndex());
}

export function isNationalZoneSearchResult(result: FranceSearchResult) {
  return result.source === NATIONAL_ZONE_SEARCH_SOURCE;
}
