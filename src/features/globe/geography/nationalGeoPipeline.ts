import maplibregl, {
  type GeoJSONFeature,
  type Map as MapLibreMap,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import turfUnion from "@turf/union";
import { featureCollection } from "@turf/helpers";
import { Protocol } from "pmtiles";
import type { GeoPipelineMode } from "./geoPipelineMode";
import { usesNationalGeoPipeline } from "./geoPipelineMode";
import {
  NATIONAL_GEO_DEFAULT_ARCHIVE_URL,
  NATIONAL_GEO_EXTRUSION_LAYER_ID,
  NATIONAL_GEO_FILL_LAYER_ID,
  NATIONAL_GEO_HITAREA_LAYER_ID,
  NATIONAL_GEO_LABEL_LAYER_ID,
  NATIONAL_GEO_LAYER_IDS,
  NATIONAL_GEO_OUTLINE_LAYER_ID,
  NATIONAL_GEO_SOURCE_ID,
  NATIONAL_GEO_SOURCE_LAYER_ID,
} from "./nationalGeoContract";

export * from "./nationalGeoContract";

const NATIONAL_GEO_BEFORE_LAYER_CANDIDATES = [
  "labels_streets",
  "labels_cities",
  "labels_cities_secondary",
  "labels_cities_local",
  "labels_districts",
] as const;

const NATIONAL_GEO_SURFACE_BEFORE_LAYER_CANDIDATES = [
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
  "water",
  "waterway_canal",
] as const;
const BASEMAP_LOCAL_LABEL_LAYER_IDS = [
  "labels_cities_secondary",
  "labels_cities_local",
  "labels_districts",
] as const;

const hoverState: any[] = ["boolean", ["feature-state", "hovered"], false];
const selectedState: any[] = ["boolean", ["feature-state", "selected"], false];
const neighborState: any[] = ["boolean", ["feature-state", "neighbor"], false];
const sharedDetailActiveState: any[] = ["boolean", ["feature-state", "sharedDetailActive"], false];
const ACTIVE_COMMUNE_GROUND_COLOR = "#1B1234";
const neighborCommuneColorExpression: any[] = [
  "match",
  ["%", ["to-number", ["coalesce", ["get", "color_index"], 0]], 8],
  0, "#B18EFF",
  1, "#A985F4",
  2, "#9C7AE9",
  3, "#C2A2FF",
  4, "#9270E4",
  5, "#B996FF",
  6, "#8566D5",
  "#CBB2FF",
];
const overviewFilter: any[] = [
  "all",
  ["==", ["get", "record_type"], "zone"],
  ["==", ["get", "overview_visible"], true],
];
const labelFilter: any[] = [
  "all",
  ["==", ["get", "record_type"], "label"],
  ["==", ["get", "overview_visible"], true],
];
const metropolitanZoneState: any[] = ["==", ["get", "palette_family"], "metropolitan"];
const metropolitanCommuneState: any[] = [
  "all",
  metropolitanZoneState,
  ["==", ["get", "territory_type"], "commune"],
];
const EMPTY_EXTRUSION_ZONE_IDS: string[] = [];

function activeExtrusionFilter(targets: Array<NationalFeatureStateTarget | null>) {
  const zoneIds = [...new Set(
    targets
      .filter((target): target is NationalFeatureStateTarget => Boolean(target))
      .map((target) => String(target.id)),
  )];
  return [
    "all",
    overviewFilter,
    ["in", ["get", "zone_id"], ["literal", zoneIds.length > 0 ? zoneIds : EMPTY_EXTRUSION_ZONE_IDS]],
  ];
}

function collectNationalZoneGeometry(
  map: MapLibreMap,
  zoneId: string | number,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const seenGeometries = new Set<string>();
  const fragments = map.querySourceFeatures(NATIONAL_GEO_SOURCE_ID, {
    sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID,
    filter: [
      "all",
      ["==", ["get", "record_type"], "zone"],
      ["==", ["get", "zone_id"], String(zoneId)],
    ],
  })
    .filter((feature): feature is GeoJSONFeature & {
      geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
    } => feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon")
    .filter((feature) => {
      const key = JSON.stringify(feature.geometry);
      if (seenGeometries.has(key)) return false;
      seenGeometries.add(key);
      return true;
    })
    .map((feature) => ({
      type: "Feature" as const,
      properties: {},
      geometry: feature.geometry,
    }));

  if (fragments.length === 0) return null;
  if (fragments.length === 1) return fragments[0].geometry;

  try {
    const merged = turfUnion(featureCollection(fragments) as any);
    if (merged?.geometry?.type === "Polygon" || merged?.geometry?.type === "MultiPolygon") {
      return merged.geometry;
    }
  } catch {
    // A tile boundary can occasionally expose a transient invalid fragment
    // while the camera is moving. The next idle pass retries the full zone.
  }

  return null;
}

async function loadNationalZoneDetailGeometry(
  archiveUrl: string,
  zoneId: string | number,
): Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> {
  const detailUrl = new URL(
    `./zone-details/${encodeURIComponent(String(zoneId))}.geojson`,
    archiveUrl,
  );
  detailUrl.search = "";
  try {
    const response = await fetch(detailUrl);
    if (!response.ok) return null;
    const feature = await response.json() as GeoJSON.Feature;
    if (feature.geometry?.type === "Polygon" || feature.geometry?.type === "MultiPolygon") {
      return feature.geometry;
    }
  } catch {
    // Tile fragments remain a safe fallback for unpublished detail artifacts.
  }
  return null;
}

type NationalFeatureStateTarget = {
  source: typeof NATIONAL_GEO_SOURCE_ID;
  sourceLayer: typeof NATIONAL_GEO_SOURCE_LAYER_ID;
  id: string | number;
};

export type NationalGeoComparisonSnapshot = {
  mode: GeoPipelineMode;
  sourceLoaded: boolean;
  nationalLoadedFeatureCount: number;
  nationalLoadedLegacyIdCount: number;
  legacyRenderedFeatureCount: number;
  matchingLegacyIdCount: number;
  missingLegacyIdCount: number;
  capturedAt: string;
};

export type NationalGeoRuntime = {
  mode: GeoPipelineMode;
  archiveUrl: string;
  snapshot: () => NationalGeoComparisonSnapshot;
  cleanup: () => void;
};

type GeoPipelineDebugWindow = Window & {
  __MEEWAV_PMTILES_PROTOCOL__?: Protocol;
  __MEEWAV_GEO_PIPELINE__?: {
    mode: GeoPipelineMode;
    archiveUrl: string;
    sourceId: string;
    layerIds: readonly string[];
    snapshot: NationalGeoComparisonSnapshot;
  };
};

function getDebugWindow() {
  return window as GeoPipelineDebugWindow;
}

export function getNationalGeoArchiveUrl() {
  const configuredUrl = import.meta.env.VITE_NATIONAL_GEO_TILESET_URL || NATIONAL_GEO_DEFAULT_ARCHIVE_URL;
  return new URL(configuredUrl, window.location.origin).href;
}

export function registerNationalGeoProtocol() {
  const debugWindow = getDebugWindow();
  if (debugWindow.__MEEWAV_PMTILES_PROTOCOL__) return debugWindow.__MEEWAV_PMTILES_PROTOCOL__;

  const protocol = new Protocol({ metadata: true });
  maplibregl.addProtocol("pmtiles", protocol.tile as Parameters<typeof maplibregl.addProtocol>[1]);
  debugWindow.__MEEWAV_PMTILES_PROTOCOL__ = protocol;
  return protocol;
}

function getBeforeLayerId(map: MapLibreMap) {
  return NATIONAL_GEO_BEFORE_LAYER_CANDIDATES.find((layerId) => Boolean(map.getLayer(layerId)));
}

function getSurfaceBeforeLayerId(map: MapLibreMap) {
  const candidates = new Set<string>(NATIONAL_GEO_SURFACE_BEFORE_LAYER_CANDIDATES);
  return (map.getStyle().layers ?? []).find((layer) => candidates.has(layer.id))?.id ?? getBeforeLayerId(map);
}

function addLayer(map: MapLibreMap, layer: any, beforeLayerId?: string) {
  if (map.getLayer(layer.id)) return;
  map.addLayer(layer, beforeLayerId);
}

function ensureNationalGeoSource(map: MapLibreMap, archiveUrl: string) {
  if (map.getSource(NATIONAL_GEO_SOURCE_ID)) return;
  map.addSource(NATIONAL_GEO_SOURCE_ID, {
    type: "vector",
    url: `pmtiles://${archiveUrl}`,
    promoteId: {
      regions: "zone_id",
      departments: "zone_id",
      communes: "zone_id",
      music_zones: "zone_id",
    },
  });
}

function ensureNationalGeoLayers(map: MapLibreMap, mode: GeoPipelineMode) {
  const beforeLayerId = getBeforeLayerId(map);
  const beforeSurfaceLayerId = getSurfaceBeforeLayerId(map);
  const comparison = mode === "comparison";
  const hiddenLayout = { visibility: "none" as const };

  addLayer(map, {
    id: NATIONAL_GEO_FILL_LAYER_ID,
    type: "fill",
    source: NATIONAL_GEO_SOURCE_ID,
    "source-layer": NATIONAL_GEO_SOURCE_LAYER_ID,
    filter: overviewFilter,
    minzoom: 9,
    maxzoom: 22,
    paint: {
      "fill-color": comparison ? "#000000" : [
        "case",
        selectedState,
        ACTIVE_COMMUNE_GROUND_COLOR,
        neighborState,
        neighborCommuneColorExpression,
        ["get", "ground_color"],
      ],
      "fill-opacity": comparison
        ? 0.0001
        : [
            "case",
            sharedDetailActiveState,
            0,
            metropolitanZoneState,
            [
              "case",
              metropolitanCommuneState,
              ["case", selectedState, 0.98, hoverState, 0.98, neighborState, 0.86, 0.95],
              ["case", selectedState, 0.95, hoverState, 0.86, neighborState, 0.9, 0.42],
            ],
            0.95,
          ],
      "fill-antialias": true,
    },
  }, beforeSurfaceLayerId);

  addLayer(map, {
    id: NATIONAL_GEO_OUTLINE_LAYER_ID,
    type: "line",
    source: NATIONAL_GEO_SOURCE_ID,
    "source-layer": NATIONAL_GEO_SOURCE_LAYER_ID,
    filter: overviewFilter,
    minzoom: 9,
    maxzoom: 22,
    layout: comparison ? hiddenLayout : { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": [
        "case",
        selectedState,
        "#FFFFFF",
        hoverState,
        "#C4A8FF",
        metropolitanZoneState,
        "#B18EFF",
        "#9B7AE8",
      ],
      "line-opacity": ["case", selectedState, 0.98, hoverState, 0.98, neighborState, 0.16, 0.36],
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        4,
        ["case", selectedState, 1.8, hoverState, 1.8, 0.8],
        11.6,
        ["case", selectedState, 2.9, hoverState, 2.7, 1.05],
        16,
        ["case", selectedState, 5.6, hoverState, 4.8, 1.65],
        18,
        ["case", selectedState, 7.2, hoverState, 6, 2.05],
      ],
      "line-blur": ["case", selectedState, 0.18, hoverState, 0.45, 0.35],
    },
  }, beforeLayerId);

  addLayer(map, {
    id: NATIONAL_GEO_EXTRUSION_LAYER_ID,
    type: "fill-extrusion",
    source: NATIONAL_GEO_SOURCE_ID,
    "source-layer": NATIONAL_GEO_SOURCE_LAYER_ID,
    // Never render the zero-height copy of every ground polygon. A coplanar
    // fill-extrusion fights with the regular fill in the depth buffer and
    // creates large triangular flashes while pitching or rotating the map.
    filter: activeExtrusionFilter([]),
    minzoom: 10,
    maxzoom: 22,
    layout: comparison ? hiddenLayout : { visibility: "visible" },
    paint: {
      "fill-extrusion-color": ["get", "ground_color"],
      "fill-extrusion-height": [
        "case",
        hoverState,
        0.6,
        0,
      ],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": false,
    },
  }, beforeSurfaceLayerId);

  addLayer(map, {
    id: NATIONAL_GEO_LABEL_LAYER_ID,
    type: "symbol",
    source: NATIONAL_GEO_SOURCE_ID,
    "source-layer": NATIONAL_GEO_SOURCE_LAYER_ID,
    filter: labelFilter,
    minzoom: 11.8,
    maxzoom: 22,
    layout: comparison
      ? hiddenLayout
      : {
          "text-field": ["get", "display_name"],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11.85, 10.2, 13.8, 12.5, 15.2, 13.4],
          "text-max-width": 9,
          "text-padding": 8,
          "text-allow-overlap": false,
        },
    paint: {
      "text-color": "#F4F0FF",
      "text-halo-color": "#140D24",
      "text-halo-width": 2.15,
      "text-halo-blur": 0.2,
      "text-opacity": ["case", neighborState, 0.24, 0.9],
    },
  }, beforeLayerId);

  addLayer(map, {
    id: NATIONAL_GEO_HITAREA_LAYER_ID,
    type: "fill",
    source: NATIONAL_GEO_SOURCE_ID,
    "source-layer": NATIONAL_GEO_SOURCE_LAYER_ID,
    filter: overviewFilter,
    minzoom: 9,
    maxzoom: 22,
    layout: comparison ? hiddenLayout : { visibility: "visible" },
    paint: {
      "fill-color": "#FFFFFF",
      "fill-opacity": 0,
    },
  }, beforeLayerId);
}

function featureTarget(feature: GeoJSONFeature | undefined): NationalFeatureStateTarget | null {
  if (!feature || (typeof feature.id !== "string" && typeof feature.id !== "number")) return null;
  return {
    source: NATIONAL_GEO_SOURCE_ID,
    sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID,
    id: feature.id,
  };
}

function setFeatureStateSafely(
  map: MapLibreMap,
  target: NationalFeatureStateTarget | null,
  state: Record<string, boolean>,
) {
  if (!target || !map.getSource(NATIONAL_GEO_SOURCE_ID)) return;
  try {
    map.setFeatureState(target, state);
  } catch {
    // A style reload can invalidate a target between the pointer event and this update.
  }
}

function setNationalLayerPresentationVisible(map: MapLibreMap, visible: boolean) {
  NATIONAL_GEO_LAYER_IDS.forEach((layerId) => {
    if (!map.getLayer(layerId)) return;
    map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
  });
}

function getFeatureLegacyId(feature?: Pick<GeoJSONFeature, "properties">) {
  const value = feature?.properties?.legacy_zone_id;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function usesNationalRuntime(feature?: Pick<GeoJSONFeature, "properties">) {
  return feature?.properties?.runtime_mode === "national";
}

function focusNationalFeature(
  map: MapLibreMap,
  feature?: Pick<GeoJSONFeature, "properties">,
) {
  const properties = feature?.properties;
  const bbox = [
    Number(properties?.bbox_west),
    Number(properties?.bbox_south),
    Number(properties?.bbox_east),
    Number(properties?.bbox_north),
  ];
  if (!bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) return;
  map.fitBounds(
    [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
    {
      padding: { top: 150, right: 130, bottom: 140, left: 150 },
      pitch: 60,
      bearing: 0,
      maxZoom: 15.5,
      duration: 1500,
      essential: true,
    },
  );
}

function collectComparisonSnapshot(map: MapLibreMap, mode: GeoPipelineMode): NationalGeoComparisonSnapshot {
  const nationalSourceExists = Boolean(map.getSource(NATIONAL_GEO_SOURCE_ID));
  let nationalSourceLoaded = false;
  if (nationalSourceExists) {
    try {
      nationalSourceLoaded = map.isSourceLoaded(NATIONAL_GEO_SOURCE_ID);
    } catch {
      nationalSourceLoaded = false;
    }
  }
  const nationalSourceFeatures = nationalSourceExists
    ? map.querySourceFeatures(NATIONAL_GEO_SOURCE_ID, { sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID })
    : [];
  const nationalRenderedFeatures = map.getLayer(NATIONAL_GEO_FILL_LAYER_ID)
    ? map.queryRenderedFeatures(undefined, { layers: [NATIONAL_GEO_FILL_LAYER_ID] })
    : [];
  const nationalFeatures = [...nationalSourceFeatures, ...nationalRenderedFeatures];
  const nationalZoneIds = new Set<string>();
  const nationalLegacyIds = new Set<string>();
  nationalFeatures.forEach((feature) => {
    const zoneId = feature.properties?.zone_id;
    if (typeof zoneId === "string") nationalZoneIds.add(zoneId);
    const legacyId = getFeatureLegacyId(feature);
    if (legacyId) nationalLegacyIds.add(legacyId);
  });

  const legacyRenderedIds = new Set<string>();
  if (mode === "comparison") {
    map.queryRenderedFeatures().forEach((feature) => {
      if (feature.source === NATIONAL_GEO_SOURCE_ID) return;
      const properties = feature.properties ?? {};
      const candidate = properties.zoneId ?? properties.districtCode ?? properties.id;
      if (typeof candidate === "string" && candidate.length > 0) legacyRenderedIds.add(candidate);
    });
  }

  const matchingLegacyIdCount = [...nationalLegacyIds].filter((id) => legacyRenderedIds.has(id)).length;
  return {
    mode,
    sourceLoaded: nationalSourceLoaded,
    nationalLoadedFeatureCount: nationalZoneIds.size,
    nationalLoadedLegacyIdCount: nationalLegacyIds.size,
    legacyRenderedFeatureCount: legacyRenderedIds.size,
    matchingLegacyIdCount,
    missingLegacyIdCount: Math.max(0, legacyRenderedIds.size - matchingLegacyIdCount),
    capturedAt: new Date().toISOString(),
  };
}

function publishDebugState(
  map: MapLibreMap,
  mode: GeoPipelineMode,
  archiveUrl: string,
  snapshot: NationalGeoComparisonSnapshot,
) {
  const container = map.getContainer();
  container.dataset.geoPipelineMode = mode;
  container.dataset.geoNationalSourceLoaded = String(snapshot.sourceLoaded);
  container.dataset.geoNationalFeatureCount = String(snapshot.nationalLoadedFeatureCount);
  container.dataset.geoLegacyFeatureCount = String(snapshot.legacyRenderedFeatureCount);
  container.dataset.geoMatchingLegacyIdCount = String(snapshot.matchingLegacyIdCount);
  getDebugWindow().__MEEWAV_GEO_PIPELINE__ = {
    mode,
    archiveUrl,
    sourceId: NATIONAL_GEO_SOURCE_ID,
    layerIds: NATIONAL_GEO_LAYER_IDS,
    snapshot,
  };
}

export function installNationalGeoPipeline(
  map: MapLibreMap,
  mode: GeoPipelineMode,
): NationalGeoRuntime {
  const archiveUrl = getNationalGeoArchiveUrl();
  let latestSnapshot = collectComparisonSnapshot(map, mode);
  let hoveredTarget: NationalFeatureStateTarget | null = null;
  let selectedTarget: NationalFeatureStateTarget | null = null;
  const contextualTargets = new Map<string | number, NationalFeatureStateTarget>();
  let legacyDetailMode = false;
  let pendingSearchZoneId: string | null = null;
  let pendingNationalDetailSelection: {
    target: NationalFeatureStateTarget;
    properties: Record<string, unknown>;
  } | null = null;
  let pendingNationalGeometryRequest: Promise<GeoJSON.Polygon | GeoJSON.MultiPolygon | null> | null = null;

  if (!usesNationalGeoPipeline(mode)) {
    publishDebugState(map, mode, archiveUrl, latestSnapshot);
    return {
      mode,
      archiveUrl,
      snapshot: () => latestSnapshot,
      cleanup: () => {},
    };
  }

  registerNationalGeoProtocol();
  ensureNationalGeoSource(map, archiveUrl);
  ensureNationalGeoLayers(map, mode);
  const baseLocalLabelVisibility = new Map<string, unknown>();
  if (mode === "national") {
    BASEMAP_LOCAL_LABEL_LAYER_IDS.forEach((layerId) => {
      if (!map.getLayer(layerId)) return;
      baseLocalLabelVisibility.set(layerId, map.getLayoutProperty(layerId, "visibility"));
      map.setLayoutProperty(layerId, "visibility", "none");
    });
  }

  const updateSnapshot = () => {
    latestSnapshot = collectComparisonSnapshot(map, mode);
    publishDebugState(map, mode, archiveUrl, latestSnapshot);
  };
  const clearNationalNavigationContext = () => {
    contextualTargets.forEach((target) => {
      setFeatureStateSafely(map, target, {
        selected: false,
        neighbor: false,
        dimmed: false,
        sharedDetailActive: false,
      });
    });
    contextualTargets.clear();
  };
  const syncActiveExtrusion = () => {
    if (!map.getLayer(NATIONAL_GEO_EXTRUSION_LAYER_ID)) return;
    const hoverOnlyTarget = hoveredTarget?.id === selectedTarget?.id ? null : hoveredTarget;
    map.setFilter(
      NATIONAL_GEO_EXTRUSION_LAYER_ID,
      // The selected district uses the shared polygon presentation. This
      // geographic extrusion stays hover-only to avoid a second ground slab.
      activeExtrusionFilter([hoverOnlyTarget]) as any,
    );
  };
  const applyPendingNationalDetailSelection = async () => {
    const pending = pendingNationalDetailSelection;
    if (!pending || pendingNationalGeometryRequest || map.isMoving() || selectedTarget?.id !== pending.target.id) return;
    pendingNationalGeometryRequest = loadNationalZoneDetailGeometry(archiveUrl, pending.target.id);
    const detailGeometry = await pendingNationalGeometryRequest;
    pendingNationalGeometryRequest = null;
    if (pendingNationalDetailSelection !== pending || selectedTarget?.id !== pending.target.id) return;
    const geometry = detailGeometry ?? collectNationalZoneGeometry(map, pending.target.id);
    if (!geometry) return;
    pendingNationalDetailSelection = null;
    setFeatureStateSafely(map, pending.target, { sharedDetailActive: true });
    window.dispatchEvent(new CustomEvent("meewav:national-zone-selected", {
      detail: {
        zoneId: String(pending.target.id),
        displayName: String(pending.properties.display_name ?? ""),
        communeCode: String(pending.properties.commune_code ?? ""),
        communeName: String(pending.properties.commune_name ?? ""),
        colorIndex: Number(pending.properties.color_index ?? 0),
        groundColor: String(pending.properties.ground_color ?? "#43277B"),
        geometry,
      },
    }));
  };
  const handleMouseMove = (event: MapLayerMouseEvent) => {
    const nextTarget = featureTarget(event.features?.[0]);
    if (hoveredTarget?.id === nextTarget?.id) return;
    setFeatureStateSafely(map, hoveredTarget, { hovered: false });
    hoveredTarget = nextTarget;
    setFeatureStateSafely(map, hoveredTarget, { hovered: true });
    syncActiveExtrusion();
    map.getCanvas().style.cursor = hoveredTarget ? "pointer" : "";
  };
  const handleMouseLeave = () => {
    setFeatureStateSafely(map, hoveredTarget, { hovered: false });
    hoveredTarget = null;
    syncActiveExtrusion();
    map.getCanvas().style.cursor = "";
  };
  const selectNationalTarget = (
    nextTarget: NationalFeatureStateTarget,
    feature?: Pick<GeoJSONFeature, "properties">,
  ) => {
    clearNationalNavigationContext();
    setFeatureStateSafely(map, selectedTarget, {
      selected: false,
      neighbor: false,
      dimmed: false,
      sharedDetailActive: false,
    });
    selectedTarget = nextTarget;
    setFeatureStateSafely(map, selectedTarget, {
      selected: true,
      neighbor: false,
      dimmed: false,
      sharedDetailActive: false,
    });
    syncActiveExtrusion();
    const visibleTargets = new Map<string | number, {
      target: NationalFeatureStateTarget;
      neighborEligible: boolean;
    }>();
    map.queryRenderedFeatures(undefined, { layers: [NATIONAL_GEO_FILL_LAYER_ID] })
      .forEach((candidate) => {
        const target = featureTarget(candidate);
        if (!target) return;
        const territoryType = String(candidate.properties?.territory_type ?? "");
        const neighborEligible = territoryType === "commune" || territoryType === "commune_deleguee";
        const previous = visibleTargets.get(target.id);
        visibleTargets.set(target.id, {
          target,
          neighborEligible: neighborEligible || previous?.neighborEligible === true,
        });
      });
    if (!visibleTargets.has(nextTarget.id)) {
      visibleTargets.set(nextTarget.id, { target: nextTarget, neighborEligible: false });
    }
    visibleTargets.forEach(({ target, neighborEligible }) => {
      const isSelected = target.id === nextTarget.id;
      contextualTargets.set(target.id, target);
      setFeatureStateSafely(map, target, {
        neighbor: !isSelected && neighborEligible,
        dimmed: false,
        selected: isSelected,
        sharedDetailActive: false,
      });
    });
    if (usesNationalRuntime(feature)) {
      legacyDetailMode = false;
      setNationalLayerPresentationVisible(map, true);
      pendingNationalDetailSelection = {
        target: nextTarget,
        properties: { ...(feature?.properties ?? {}) },
      };
      focusNationalFeature(map, feature);
      return;
    }
    pendingNationalDetailSelection = null;
    const legacyZoneId = getFeatureLegacyId(feature);
    if (!legacyZoneId) return;
    legacyDetailMode = true;
    setNationalLayerPresentationVisible(map, false);
    window.dispatchEvent(new CustomEvent("meewav:national-zone-selected", {
      detail: {
        zoneId: String(feature?.properties?.zone_id ?? nextTarget.id),
        legacyZoneId,
        displayName: String(feature?.properties?.display_name ?? ""),
      },
    }));
  };
  const handleClick = (event: MapLayerMouseEvent) => {
    const nextTarget = featureTarget(event.features?.[0]);
    if (!nextTarget) return;
    selectNationalTarget(nextTarget, event.features?.[0]);
  };
  const applyPendingSearchSelection = () => {
    if (!pendingSearchZoneId || !map.getSource(NATIONAL_GEO_SOURCE_ID)) return;
    const matchingFeature = map.querySourceFeatures(NATIONAL_GEO_SOURCE_ID, {
      sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID,
      filter: ["==", ["get", "zone_id"], pendingSearchZoneId],
    })[0];
    if (!matchingFeature) return;
    const zoneId = pendingSearchZoneId;
    pendingSearchZoneId = null;
    selectNationalTarget({
      source: NATIONAL_GEO_SOURCE_ID,
      sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID,
      id: zoneId,
    }, matchingFeature);
  };
  const handleNationalSearchSelection = (event: Event) => {
    const detail = (event as CustomEvent<{ zoneId?: unknown }>).detail;
    const zoneId = typeof detail?.zoneId === "string" ? detail.zoneId : "";
    if (!zoneId) return;
    pendingSearchZoneId = zoneId;
    clearNationalNavigationContext();
    setFeatureStateSafely(map, selectedTarget, {
      selected: false,
      neighbor: false,
      dimmed: false,
      sharedDetailActive: false,
    });
    selectedTarget = {
      source: NATIONAL_GEO_SOURCE_ID,
      sourceLayer: NATIONAL_GEO_SOURCE_LAYER_ID,
      id: zoneId,
    };
    contextualTargets.set(zoneId, selectedTarget);
    setFeatureStateSafely(map, selectedTarget, {
      selected: true,
      neighbor: false,
      dimmed: false,
      sharedDetailActive: false,
    });
    syncActiveExtrusion();
    applyPendingSearchSelection();
  };
  const handleCameraSettle = () => {
    if (!legacyDetailMode || map.getZoom() >= 12.05) return;
    legacyDetailMode = false;
    setNationalLayerPresentationVisible(map, true);
  };

  if (mode === "national") {
    map.on("mousemove", NATIONAL_GEO_HITAREA_LAYER_ID, handleMouseMove);
    map.on("mouseleave", NATIONAL_GEO_HITAREA_LAYER_ID, handleMouseLeave);
    map.on("click", NATIONAL_GEO_HITAREA_LAYER_ID, handleClick);
    map.on("moveend", handleCameraSettle);
  }
  window.addEventListener("meewav:national-search-zone-selected", handleNationalSearchSelection as EventListener);
  map.on("idle", applyPendingSearchSelection);
  map.on("idle", applyPendingNationalDetailSelection);
  map.on("idle", updateSnapshot);
  updateSnapshot();

  return {
    mode,
    archiveUrl,
    snapshot: () => latestSnapshot,
    cleanup: () => {
      map.off("idle", updateSnapshot);
      map.off("idle", applyPendingSearchSelection);
      map.off("idle", applyPendingNationalDetailSelection);
      window.removeEventListener("meewav:national-search-zone-selected", handleNationalSearchSelection as EventListener);
      if (mode === "national") {
        map.off("mousemove", NATIONAL_GEO_HITAREA_LAYER_ID, handleMouseMove);
        map.off("mouseleave", NATIONAL_GEO_HITAREA_LAYER_ID, handleMouseLeave);
        map.off("click", NATIONAL_GEO_HITAREA_LAYER_ID, handleClick);
        map.off("moveend", handleCameraSettle);
        baseLocalLabelVisibility.forEach((visibility, layerId) => {
          if (map.getLayer(layerId)) {
            map.setLayoutProperty(layerId, "visibility", visibility ?? "visible");
          }
        });
      }
      handleMouseLeave();
      clearNationalNavigationContext();
      setFeatureStateSafely(map, selectedTarget, {
        selected: false,
        neighbor: false,
        dimmed: false,
        sharedDetailActive: false,
      });
    },
  };
}
