import type { Map as MapLibreMap } from "maplibre-gl";
import { moveAvatarLayersToTop } from "../../../map/avatarLayers";
import {
  ACTIVE_COMMUNE_GROUND_COLOR,
  EMPTY_ZONE_LABEL_POINTS_COLLECTION,
  EMPTY_ZONE_POLYGONS_COLLECTION,
  SELECTED_ZONE_LABEL_MAX_ZOOM,
  SELECTED_ZONE_FILL_LAYER_ID,
  SELECTED_ZONE_HITBOX_LAYER_ID,
  SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
  SELECTED_ZONE_INTERIOR_LIGHT_LAYER_ID,
  SELECTED_ZONE_LABEL_LAYER_ID,
  SELECTED_ZONE_LABEL_POINTS_SOURCE_ID,
  SELECTED_ZONE_OUTLINE_LAYER_ID,
  SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
  SELECTED_ZONE_POLYGONS_SOURCE_ID,
} from "./selectedZoneExtrusionTypes";
import {
  OPENFREEMAP_PLACE_LOCAL_LABEL_LAYER_ID,
  OPENFREEMAP_PLACE_SECONDARY_LABEL_LAYER_ID,
} from "../maplibre/meewavMapLibreStyle";
import { createStablePointLabelLayout } from "../maplibre/stableGeographicLabelPolicy";
import { EIFFEL_TOWER_LAYER_ID } from "../maplibre/eiffelTowerLayer";
import { MONTPARNASSE_TOWER_LAYER_ID } from "../maplibre/montparnasseTowerLayer";
import { NOTRE_DAME_LAYER_ID } from "../maplibre/notreDameLayer";
import { SAINT_CLAUDE_BONNEVILLE_LAYER_ID } from "../maplibre/saintClaudeBonnevilleLayer";
import { STADE_DE_FRANCE_LAYER_ID } from "../maplibre/stadeFranceLayer";
import {
  CREPUSCULE_URBAIN_GROUND,
  CREPUSCULE_URBAIN_STROKES,
  GRAND_PARIS_FIGMA_STROKES,
  LABEL_COLORS,
} from "../maplibre/crepusculeUrbainPalette";

const LABEL_LAYER_CANDIDATES = [
  "labels_streets",
  "labels_cities",
  OPENFREEMAP_PLACE_SECONDARY_LABEL_LAYER_ID,
  OPENFREEMAP_PLACE_LOCAL_LABEL_LAYER_ID,
  "labels_districts",
  "paris-monuments-labels",
] as const;

const MAP_STRUCTURE_LAYER_CANDIDATES = [
  "roads_minor",
  "landcover_green_areas",
  "landcover_small_green_grounds",
  "landuse_small_green_grounds",
  "landcover_beach",
  "landuse_park",
  "stadium_pitch",
  "roads_major_lowzoom",
  "roads_local_casing",
  "roads_major_casing",
  "roads_local_inner",
  "roads_major_inner",
] as const;

const WATER_STRUCTURE_LAYER_CANDIDATES = [
  "water",
  "waterway_canal",
] as const;

const selectedZoneColorExpression: any[] = ["get", "groundColor"];
const navigationRoleExpression: any[] = ["coalesce", ["get", "navigationRole"], "normal"];
const navigationSurfaceExpression: any[] = ["coalesce", ["get", "navigationSurface"], "subdivision"];
const activeParentNavigationState: any[] = [
  "all",
  ["==", navigationRoleExpression, "active"],
  ["==", navigationSurfaceExpression, "parent"],
];
const activeSubdivisionNavigationState: any[] = [
  "all",
  ["==", navigationRoleExpression, "active"],
  ["==", navigationSurfaceExpression, "subdivision"],
];
const neighborNavigationState: any[] = ["==", navigationRoleExpression, "neighbor"];
const neighborCommuneColorExpression: any[] = [
  "match",
  ["%", ["to-number", ["coalesce", ["get", "colorIndex"], 0]], 8],
  0, "#B18EFF",
  1, "#A985F4",
  2, "#9C7AE9",
  3, "#C2A2FF",
  4, "#9270E4",
  5, "#B996FF",
  6, "#8566D5",
  "#CBB2FF",
];

const hoverState: any[] = ["boolean", ["feature-state", "hover"], false];
const selectedState: any[] = ["boolean", ["feature-state", "selected"], false];
const singlePlateOutlineState: any[] = ["==", ["get", "runtimeMode"], "single_plate"];
const strongOutlineState: any[] = ["any", selectedState, singlePlateOutlineState];
const hoverUnselectedState: any[] = ["all", hoverState, ["!", selectedState]];
const featureDimmedState: any[] = ["boolean", ["feature-state", "dimmed"], false];
const contextDimmedState: any[] = ["boolean", ["get", "contextDimmed"], false];
const dimmedState: any[] = ["any", featureDimmedState, contextDimmedState];
const preserveParentOverviewColorState: any[] = [
  "boolean",
  ["get", "preserveParentOverviewColor"],
  false,
];
const metropolitanZoneState: any[] = [
  "any",
  ["==", ["get", "paletteFamily"], "metropolitan"],
  ["==", ["index-of", "grand_paris_", ["to-string", ["coalesce", ["get", "zoneId"], ""]]], 0],
  ["==", ["index-of", "nantes_metropole_", ["to-string", ["coalesce", ["get", "zoneId"], ""]]], 0],
];
const metropolitanCommuneState: any[] = [
  "all",
  metropolitanZoneState,
  ["==", ["get", "territoryType"], "commune"],
];

const selectedZoneFillColorExpression: any[] = [
  "case",
  activeParentNavigationState,
  ACTIVE_COMMUNE_GROUND_COLOR,
  activeSubdivisionNavigationState,
  selectedZoneColorExpression,
  neighborNavigationState,
  neighborCommuneColorExpression,
  preserveParentOverviewColorState,
  selectedZoneColorExpression,
  featureDimmedState,
  ["case", metropolitanZoneState, "#1B1234", "#211146"],
  selectedZoneColorExpression,
];
const selectedZoneFillOpacityExpression: any[] = [
  "case",
  activeParentNavigationState,
  0.98,
  activeSubdivisionNavigationState,
  ["case", selectedState, 0.98, hoverState, 0.98, 0.95],
  neighborNavigationState,
  ["case", contextDimmedState, 0.72, hoverState, 0.98, 0.9],
  contextDimmedState,
  ["case", metropolitanCommuneState, 0.72, 0.66],
  preserveParentOverviewColorState,
  ["case", selectedState, 0.98, hoverState, 0.98, 0.95],
  metropolitanZoneState,
  [
    "case",
    metropolitanCommuneState,
    ["case", selectedState, 0.98, hoverState, 0.98, dimmedState, 0.86, 0.95],
    ["case", selectedState, 0.95, hoverState, 0.86, dimmedState, 0.9, 0.42],
  ],
  0.95,
];
const selectedZoneHoverGlowOpacityExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", selectedState, 0.2, hoverState, 0.46, dimmedState, 0.01, 0.04],
  11,
  ["case", selectedState, 0.24, hoverState, 0.58, dimmedState, 0.02, 0.06],
  16,
  ["case", selectedState, 0.3, hoverState, 0.68, dimmedState, 0.03, 0.08],
  18,
  ["case", selectedState, 0.34, hoverState, 0.72, dimmedState, 0.03, 0.08],
];
const selectedZoneHoverGlowOpacityHoverOnlyExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", hoverUnselectedState, 0.46, 0],
  11,
  ["case", hoverUnselectedState, 0.58, 0],
  16,
  ["case", hoverUnselectedState, 0.68, 0],
  18,
  ["case", hoverUnselectedState, 0.72, 0],
];
const selectedZoneHoverGlowWidthExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", selectedState, 2, hoverState, 2.6, 1.2],
  11,
  ["case", selectedState, 3.2, hoverState, 4.2, 1.8],
  16,
  ["case", selectedState, 5.4, hoverState, 7.2, 2.6],
  18,
  ["case", selectedState, 7.2, hoverState, 10, 3.2],
];
const selectedZoneHoverGlowWidthHoverOnlyExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", hoverUnselectedState, 2.6, 0],
  11,
  ["case", hoverUnselectedState, 4.2, 0],
  16,
  ["case", hoverUnselectedState, 7.2, 0],
  18,
  ["case", hoverUnselectedState, 10, 0],
];
const selectedZoneHoverGlowBlurExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", selectedState, 0.25, hoverState, 0.35, 0.15],
  16,
  ["case", selectedState, 0.55, hoverState, 0.85, 0.25],
  18,
  ["case", selectedState, 0.7, hoverState, 1.05, 0.35],
];
const selectedZoneHoverGlowBlurHoverOnlyExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", hoverUnselectedState, 0.35, 0],
  16,
  ["case", hoverUnselectedState, 0.85, 0],
  18,
  ["case", hoverUnselectedState, 1.05, 0],
];
const selectedZoneOutlineOpacityExpression: any[] = [
  "case",
  strongOutlineState,
  0.98,
  hoverState,
  0.98,
  dimmedState,
  0.16,
  0.36,
];
// Once a zone is selected the shared guide switches to its hover-only mode so
// ordinary Paris/IRIS selections do not keep a permanent outline. A national
// single-plate commune is itself the complete active plaque, though: preserve
// its white boundary in that mode instead of making the only plaque borderless.
// Deliberately key this presentation from the GeoJSON runtimeMode property,
// not transient feature-state. setData() and setFeatureState() settle on
// different MapLibre ticks, so coupling the border to `selected` caused the
// outline to disappear whenever the state write raced the new render source.
const selectedZoneOutlineOpacityHoverOnlyExpression: any[] = [
  "case",
  singlePlateOutlineState,
  0.98,
  hoverUnselectedState,
  0.98,
  0,
];
const selectedZoneOutlineWidthExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", strongOutlineState, 1.8, hoverState, 1.8, 0.8],
  11.6,
  ["case", strongOutlineState, 2.9, hoverState, 2.7, 1.05],
  16,
  ["case", strongOutlineState, 5.6, hoverState, 4.8, 1.65],
  18,
  ["case", strongOutlineState, 7.2, hoverState, 6, 2.05],
];
const selectedZoneOutlineWidthHoverOnlyExpression: any[] = [
  "interpolate",
  ["linear"],
  ["zoom"],
  4,
  ["case", singlePlateOutlineState, 1.8, hoverUnselectedState, 1.8, 0],
  11.6,
  ["case", singlePlateOutlineState, 2.9, hoverUnselectedState, 2.7, 0],
  16,
  ["case", singlePlateOutlineState, 5.6, hoverUnselectedState, 4.8, 0],
  18,
  ["case", singlePlateOutlineState, 7.2, hoverUnselectedState, 6, 0],
];
const selectedZoneOutlineBlurExpression: any[] = ["case", strongOutlineState, 0.18, hoverState, 0.45, 0.35];
const selectedZoneOutlineBlurHoverOnlyExpression: any[] = [
  "case",
  singlePlateOutlineState,
  0.18,
  hoverUnselectedState,
  0.45,
  0,
];

function getBeforeLayerId(map: MapLibreMap) {
  return LABEL_LAYER_CANDIDATES.find((layerId) => Boolean(map.getLayer(layerId)));
}

function getFirstLayerInStyleOrder(map: MapLibreMap, layerIds: readonly string[]) {
  const targets = new Set(layerIds);
  return (map.getStyle().layers ?? []).find((layer) => targets.has(layer.id))?.id;
}

function moveLayerBefore(map: MapLibreMap, layerId: string, beforeLayerId: string | undefined) {
  if (!beforeLayerId || layerId === beforeLayerId || !map.getLayer(layerId) || !map.getLayer(beforeLayerId)) return;

  try {
    const layerIds = (map.getStyle().layers ?? []).map((layer) => layer.id);
    if (layerIds.indexOf(layerId) < 0 || layerIds.indexOf(beforeLayerId) < 0) return;
    map.moveLayer(layerId, beforeLayerId);
  } catch {
    // MapLibre can reject moves while a style is settling. The next style pass will retry.
  }
}

function moveLayerToTop(map: MapLibreMap, layerId: string) {
  if (!map.getLayer(layerId)) return;

  try {
    const layerIds = (map.getStyle().layers ?? []).map((layer) => layer.id);
    const layerIndex = layerIds.indexOf(layerId);
    if (layerIndex === layerIds.length - 1) return;
    map.moveLayer(layerId);
  } catch {
    // MapLibre can reject moves while a style is settling. The controller will retry.
  }
}

export function ensureSelectedZoneSelectionStack(map: MapLibreMap) {
  const layerIds = (map.getStyle().layers ?? []).map((layer) => layer.id);
  const selectedStack = [
    SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
    SELECTED_ZONE_OUTLINE_LAYER_ID,
    SELECTED_ZONE_LABEL_LAYER_ID,
    EIFFEL_TOWER_LAYER_ID,
    MONTPARNASSE_TOWER_LAYER_ID,
    NOTRE_DAME_LAYER_ID,
    STADE_DE_FRANCE_LAYER_ID,
    SAINT_CLAUDE_BONNEVILLE_LAYER_ID,
  ].filter((layerId) => map.getLayer(layerId));
  if (!selectedStack.length) return;

  const styleBackedStack = selectedStack.filter((layerId) => layerIds.includes(layerId));
  const customStack = selectedStack.filter((layerId) => !layerIds.includes(layerId));
  let lastLayerIndex = -1;
  const alreadyOrdered = styleBackedStack.every((layerId) => {
    const layerIndex = layerIds.indexOf(layerId);
    const inOrder = layerIndex > lastLayerIndex;
    lastLayerIndex = layerIndex;
    return inOrder;
  });

  if (!alreadyOrdered) {
    for (const layerId of styleBackedStack) {
      moveLayerToTop(map, layerId);
    }
  }

  for (const layerId of customStack) {
    moveLayerToTop(map, layerId);
  }

  moveAvatarLayersToTop(map);
}

function setLayerVisibility(map: MapLibreMap, layerId: string, visibility: "visible" | "none") {
  if (!map.getLayer(layerId)) return;

  try {
    const currentVisibility = map.getLayoutProperty(layerId, "visibility") ?? "visible";
    if (currentVisibility === visibility) return;
    map.setLayoutProperty(layerId, "visibility", visibility);
  } catch {
    // Style updates can race during camera/style transitions; the controller will retry.
  }
}

function setLayerPaintProperty(map: MapLibreMap, layerId: string, property: string, value: unknown) {
  if (!map.getLayer(layerId)) return;

  try {
    map.setPaintProperty(layerId, property, value);
  } catch {
    // Style updates can race during camera/style transitions; the controller will retry.
  }
}

export function setSelectedZonePresentation(map: MapLibreMap, selected: boolean) {
  const zoneGuideVisibility = "visible";
  const hoverOnlyGuide = selected;
  setLayerVisibility(map, SELECTED_ZONE_HOVER_GLOW_LAYER_ID, zoneGuideVisibility);
  setLayerVisibility(map, SELECTED_ZONE_OUTLINE_LAYER_ID, zoneGuideVisibility);
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
    "line-opacity",
    hoverOnlyGuide ? selectedZoneHoverGlowOpacityHoverOnlyExpression : selectedZoneHoverGlowOpacityExpression,
  );
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
    "line-width",
    hoverOnlyGuide ? selectedZoneHoverGlowWidthHoverOnlyExpression : selectedZoneHoverGlowWidthExpression,
  );
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
    "line-blur",
    hoverOnlyGuide ? selectedZoneHoverGlowBlurHoverOnlyExpression : selectedZoneHoverGlowBlurExpression,
  );
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_OUTLINE_LAYER_ID,
    "line-opacity",
    hoverOnlyGuide ? selectedZoneOutlineOpacityHoverOnlyExpression : selectedZoneOutlineOpacityExpression,
  );
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_OUTLINE_LAYER_ID,
    "line-width",
    hoverOnlyGuide ? selectedZoneOutlineWidthHoverOnlyExpression : selectedZoneOutlineWidthExpression,
  );
  setLayerPaintProperty(
    map,
    SELECTED_ZONE_OUTLINE_LAYER_ID,
    "line-blur",
    hoverOnlyGuide ? selectedZoneOutlineBlurHoverOnlyExpression : selectedZoneOutlineBlurExpression,
  );

  if (selected) {
    ensureSelectedZoneSelectionStack(map);
  }
  moveAvatarLayersToTop(map);
}

export function ensureSelectedZoneExtrusionLayers(map: MapLibreMap) {

  if (!map.getSource(SELECTED_ZONE_POLYGONS_SOURCE_ID)) {
    map.addSource(SELECTED_ZONE_POLYGONS_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_ZONE_POLYGONS_COLLECTION,
      promoteId: "zoneId",
    } as any);
  }

  if (!map.getSource(SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID)) {
    map.addSource(SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_ZONE_POLYGONS_COLLECTION,
      promoteId: "zoneId",
    } as any);
  }

  if (!map.getSource(SELECTED_ZONE_LABEL_POINTS_SOURCE_ID)) {
    map.addSource(SELECTED_ZONE_LABEL_POINTS_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_ZONE_LABEL_POINTS_COLLECTION,
      promoteId: "zoneId",
    } as any);
  }

  const beforeLayerId = getBeforeLayerId(map);
  const beforeZoneSurfaceLayerId = getFirstLayerInStyleOrder(map, [
    ...MAP_STRUCTURE_LAYER_CANDIDATES,
    ...WATER_STRUCTURE_LAYER_CANDIDATES,
  ]) ?? beforeLayerId;

  if (!map.getLayer(SELECTED_ZONE_FILL_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_FILL_LAYER_ID,
        type: "fill",
        source: SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
        layout: {
          "fill-sort-key": [
            "case",
            activeParentNavigationState,
            0,
            neighborNavigationState,
            1,
            activeSubdivisionNavigationState,
            2,
            1,
          ],
        },
        paint: {
          "fill-color": selectedZoneFillColorExpression,
          "fill-opacity": selectedZoneFillOpacityExpression,
          "fill-antialias": true,
          "fill-opacity-transition": {
            duration: 160,
            delay: 0,
          },
        },
      } as any,
      beforeZoneSurfaceLayerId,
    );
  }

  if (!map.getLayer(SELECTED_ZONE_INTERIOR_LIGHT_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_INTERIOR_LIGHT_LAYER_ID,
        type: "fill",
        source: SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
        filter: ["==", ["get", "isSelectable"], true],
        paint: {
          "fill-color": [
            "case",
            metropolitanZoneState,
            [
              "case",
              selectedState,
              GRAND_PARIS_FIGMA_STROKES.selected,
              hoverState,
              GRAND_PARIS_FIGMA_STROKES.line,
              GRAND_PARIS_FIGMA_STROKES.soft,
            ],
            selectedState,
            "#D9C8FF",
            hoverState,
            "#B98CFF",
            "#B98CFF",
          ],
          "fill-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", selectedState, 0.06, hoverState, 0.1, 0],
            11,
            ["case", selectedState, 0.08, hoverState, 0.16, 0],
            16,
            ["case", selectedState, 0.1, hoverState, 0.22, 0],
            18,
            ["case", selectedState, 0.08, hoverState, 0.18, 0],
          ],
          "fill-antialias": true,
          "fill-opacity-transition": {
            duration: 120,
            delay: 0,
          },
        },
      } as any,
      beforeZoneSurfaceLayerId,
    );
  }

  if (!map.getLayer(SELECTED_ZONE_HOVER_GLOW_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_HOVER_GLOW_LAYER_ID,
        type: "line",
        source: SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
        filter: ["==", ["get", "isSelectable"], true],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": CREPUSCULE_URBAIN_STROKES.hover,
          "line-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", selectedState, 0.2, hoverState, 0.46, dimmedState, 0.01, 0.04],
            11,
            ["case", selectedState, 0.24, hoverState, 0.58, dimmedState, 0.02, 0.06],
            16,
            ["case", selectedState, 0.3, hoverState, 0.68, dimmedState, 0.03, 0.08],
            18,
            ["case", selectedState, 0.34, hoverState, 0.72, dimmedState, 0.03, 0.08],
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", selectedState, 2, hoverState, 2.6, 1.2],
            11,
            ["case", selectedState, 3.2, hoverState, 4.2, 1.8],
            16,
            ["case", selectedState, 5.4, hoverState, 7.2, 2.6],
            18,
            ["case", selectedState, 7.2, hoverState, 10, 3.2],
          ],
          "line-blur": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", selectedState, 0.25, hoverState, 0.35, 0.15],
            16,
            ["case", selectedState, 0.55, hoverState, 0.85, 0.25],
            18,
            ["case", selectedState, 0.7, hoverState, 1.05, 0.35],
          ],
          "line-opacity-transition": {
            duration: 160,
            delay: 0,
          },
          "line-width-transition": {
            duration: 160,
            delay: 0,
          },
        },
      } as any,
      beforeLayerId,
    );
  }

  if (!map.getLayer(SELECTED_ZONE_OUTLINE_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_OUTLINE_LAYER_ID,
        type: "line",
        source: SELECTED_ZONE_POLYGONS_RENDER_SOURCE_ID,
        filter: ["==", ["get", "isSelectable"], true],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": [
            "case",
            strongOutlineState,
            "#FFFFFF",
            hoverState,
            CREPUSCULE_URBAIN_STROKES.hover,
            metropolitanZoneState,
            GRAND_PARIS_FIGMA_STROKES.line,
            CREPUSCULE_URBAIN_STROKES.parisDistrict,
          ],
          "line-opacity": [
            "case",
            strongOutlineState,
            0.98,
            hoverState,
            0.98,
            dimmedState,
            0.16,
            0.36,
          ],
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            4,
            ["case", strongOutlineState, 1.8, hoverState, 1.8, 0.8],
            11.6,
            ["case", strongOutlineState, 2.9, hoverState, 2.7, 1.05],
            16,
            ["case", strongOutlineState, 5.6, hoverState, 4.8, 1.65],
            18,
            ["case", strongOutlineState, 7.2, hoverState, 6, 2.05],
          ],
          "line-blur": ["case", strongOutlineState, 0.18, hoverState, 0.45, 0.35],
          "line-opacity-transition": {
            duration: 160,
            delay: 0,
          },
          "line-width-transition": {
            duration: 160,
            delay: 0,
          },
        },
      } as any,
      beforeLayerId,
    );
  }

  if (!map.getLayer(SELECTED_ZONE_LABEL_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_LABEL_LAYER_ID,
        type: "symbol",
        source: SELECTED_ZONE_LABEL_POINTS_SOURCE_ID,
        filter: ["has", "parentZoneId"],
        minzoom: 11.85,
        maxzoom: SELECTED_ZONE_LABEL_MAX_ZOOM,
        layout: {
          ...createStablePointLabelLayout(),
          "text-field": ["get", "label"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11.85, 10.2, 13.8, 12.5, 15.2, 13.4],
          "text-max-width": 9,
          "text-padding": 8,
          "text-letter-spacing": 0,
          "symbol-sort-key": ["coalesce", ["to-number", ["get", "colorIndex"]], 99],
        },
        paint: {
          "text-color": LABEL_COLORS.primary,
          "text-halo-color": LABEL_COLORS.halo,
          "text-halo-width": 2.15,
          "text-halo-blur": 0.2,
          "text-opacity": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11.85,
            0,
            12.05,
            ["case", dimmedState, 0.18, 0.72],
            12.65,
            ["case", dimmedState, 0.24, 0.82],
            15.2,
            ["case", dimmedState, 0.3, 0.9],
          ],
        },
      } as any,
      beforeLayerId,
    );
  }

  if (!map.getLayer(SELECTED_ZONE_HITBOX_LAYER_ID)) {
    map.addLayer(
      {
        id: SELECTED_ZONE_HITBOX_LAYER_ID,
        type: "fill",
        source: SELECTED_ZONE_POLYGONS_SOURCE_ID,
        filter: ["==", ["get", "isSelectable"], true],
        paint: {
          "fill-color": "#FFFFFF",
          "fill-opacity": 0,
        },
      },
      beforeLayerId,
    );
  }

  moveLayerBefore(map, SELECTED_ZONE_FILL_LAYER_ID, beforeZoneSurfaceLayerId);
  moveLayerBefore(map, SELECTED_ZONE_INTERIOR_LIGHT_LAYER_ID, beforeZoneSurfaceLayerId);
  moveLayerBefore(map, SELECTED_ZONE_LABEL_LAYER_ID, beforeLayerId);
  setSelectedZonePresentation(map, false);
}
