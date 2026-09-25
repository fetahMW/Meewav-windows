import type { GlobeFilters } from "../types/globe.types";

export const DEFAULT_GLOBE_FILTERS: GlobeFilters = {
  types: ["artist", "studio", "event", "room", "user"],
  onlineOnly: false,
  liveOnly: false,
  search: "",
};

export const DEFAULT_GLOBE_CENTER: [number, number] = [2.3522, 48.8566];
export const DEFAULT_GLOBE_ZOOM = 10.6;
