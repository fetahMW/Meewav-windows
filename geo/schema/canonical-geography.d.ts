import type { MultiPolygon, Polygon } from "geojson";

export type AdministrativeSourceType =
  | "region"
  | "department"
  | "commune"
  | "iris"
  | "local_district";

export type MusicZoneSourceType =
  | "official"
  | "merged"
  | "local"
  | "generated"
  | "commune_fallback"
  | "custom";

export type ZoneStatus = "draft" | "validated" | "published";
export type ZoneQuality = "official" | "curated" | "fallback";
export type ZoneGeometry = Polygon | MultiPolygon;
export type Bbox = [number, number, number, number];
export type LngLat = [number, number];

export type AdministrativeZone = {
  id: string;
  sourceType: AdministrativeSourceType;
  sourceProvider: string;
  sourceCode: string;
  sourceVintage: string;
  officialName: string;
  parentId: string | null;
  communeCode: string | null;
  geometry: ZoneGeometry;
};

export type MusicZone = {
  zoneId: string;
  displayName: string;
  aliases: string[];
  communeCode: string;
  communeName: string;
  parentZoneId: string | null;
  sourceZoneIds: string[];
  sourceType: MusicZoneSourceType;
  sourceVintage: string;
  geometry: ZoneGeometry;
  bbox: Bbox;
  center: LngLat;
  labelPoint: LngLat;
  status: ZoneStatus;
  quality: ZoneQuality;
  presentation?: {
    colorIndex: number;
    groundColor: string;
    territoryType: "department" | "commune" | "commune_deleguee" | "quartier" | "iris" | "qpv";
    paletteFamily: "city" | "metropolitan";
    overviewVisible: boolean;
  };
  cameraOverride?: {
    zoom?: number;
    pitch?: number;
    bearing?: number;
    padding?: number;
  };
};
