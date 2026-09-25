import type { Map as MapLibreMap } from "maplibre-gl";

export const MEEWAV_GLOBE_SKYBOX_LAYER_ID = "meewav-globe-starfield";

const BACKGROUND_LAYER_ID = "background";
const GLOBE_BACKGROUND_COLOR = "#4D25A3";

function setBackgroundOpacity(map: MapLibreMap, opacity: number) {
  try {
    if (map.getLayer(BACKGROUND_LAYER_ID)) {
      map.setPaintProperty(BACKGROUND_LAYER_ID, "background-opacity", opacity);
    }
  } catch {
    // Style switches can briefly make the background layer unavailable.
  }
}

function setBackgroundColor(map: MapLibreMap, color: string) {
  try {
    if (map.getLayer(BACKGROUND_LAYER_ID)) {
      map.setPaintProperty(BACKGROUND_LAYER_ID, "background-color", color);
    }
  } catch {
    // Style switches can briefly make the background layer unavailable.
  }
}

export function installMeewavGlobeSkybox(map: MapLibreMap) {
  try {
    if (map.getLayer(MEEWAV_GLOBE_SKYBOX_LAYER_ID)) {
      map.removeLayer(MEEWAV_GLOBE_SKYBOX_LAYER_ID);
    }
  } catch (error) {
    console.warn("[Meewav globe] Legacy skybox cleanup skipped.", error);
  }

  setBackgroundColor(map, GLOBE_BACKGROUND_COLOR);
  setBackgroundOpacity(map, 1);
}

export function removeMeewavGlobeSkybox(map: MapLibreMap) {
  try {
    if (map.getLayer(MEEWAV_GLOBE_SKYBOX_LAYER_ID)) {
      map.removeLayer(MEEWAV_GLOBE_SKYBOX_LAYER_ID);
    }
  } catch {
    // Style switches can briefly remove the layer before cleanup runs.
  }

  setBackgroundOpacity(map, 1);
}

export function applyMeewavGlobeAtmosphere(map: MapLibreMap) {
  try {
    setBackgroundColor(map, GLOBE_BACKGROUND_COLOR);
    setBackgroundOpacity(map, 1);
    map.setSky({
      "sky-color": "rgba(3, 1, 12, 0)",
      "sky-horizon-blend": 0,
      "horizon-color": "rgba(3, 1, 12, 0)",
      "horizon-fog-blend": 0,
      "fog-color": "rgba(3, 1, 12, 0)",
      "fog-ground-blend": 0,
      "atmosphere-blend": 0,
    });

    (map as any).setFog?.({
      color: "rgba(3, 1, 12, 0)",
      "high-color": "rgba(3, 1, 12, 0)",
      "space-color": "rgba(3, 1, 12, 0)",
      "horizon-blend": 0,
      "star-intensity": 0,
    });
  } catch {
    // MapLibre can reject sky updates while a style is settling.
  }
}

export function clearMeewavGlobeAtmosphere(map: MapLibreMap) {
  try {
    setBackgroundOpacity(map, 1);
    map.setSky(undefined as any);
    (map as any).setFog?.({
      color: "#050214",
      "high-color": "#050214",
      "space-color": "#050214",
      "horizon-blend": 0,
      "star-intensity": 0,
    });
  } catch {
    // The view switch should never be blocked by atmosphere cleanup.
  }
}

export function syncMeewavGlobeSkybox(map: MapLibreMap, enabled: boolean) {
  if (enabled) {
    installMeewavGlobeSkybox(map);
    applyMeewavGlobeAtmosphere(map);
    return;
  }

  removeMeewavGlobeSkybox(map);
  clearMeewavGlobeAtmosphere(map);
}
