import type { Map as MapLibreMap } from "maplibre-gl";
import {
  DEFAULT_SELECTED_ZONE_ID,
  getInitialSelectedZoneId,
  installSelectedZoneExtrusionController,
  selectExtrudedZone,
} from "../selectedExtrusion/selectedZoneExtrusionController";

export function isSelectedDistrictExtrusionPocEnabled(search = typeof window !== "undefined" ? window.location.search : "") {
  return getInitialSelectedZoneId(search) !== null;
}

export function installSelectedDistrictExtrusionPoc(map: MapLibreMap): () => void {
  return installSelectedZoneExtrusionController(map);
}

export function runSelectedDistrictExtrusionPoc(_map: MapLibreMap): Promise<void> {
  return selectExtrudedZone(getInitialSelectedZoneId() ?? DEFAULT_SELECTED_ZONE_ID);
}
