export const NATIONAL_GEO_SOURCE_ID = "meewav-national-zones";
export const NATIONAL_GEO_SOURCE_LAYER_ID = "music_zones";
export const NATIONAL_GEO_FILL_LAYER_ID = "music-zones-fill";
export const NATIONAL_GEO_OUTLINE_LAYER_ID = "music-zones-outline";
export const NATIONAL_GEO_HITAREA_LAYER_ID = "music-zones-hitarea";
export const NATIONAL_GEO_EXTRUSION_LAYER_ID = "music-zones-extrusion";
export const NATIONAL_GEO_LABEL_LAYER_ID = "music-zones-label";
export const NATIONAL_GEO_LAYER_IDS = [
  NATIONAL_GEO_FILL_LAYER_ID,
  NATIONAL_GEO_OUTLINE_LAYER_ID,
  NATIONAL_GEO_HITAREA_LAYER_ID,
  NATIONAL_GEO_EXTRUSION_LAYER_ID,
  NATIONAL_GEO_LABEL_LAYER_ID,
] as const;

export const NATIONAL_GEO_DEFAULT_ARCHIVE_URL =
  "/map/national/2026.1-prototype/france-zones.pmtiles?v=2026.2-montpellier-test";
