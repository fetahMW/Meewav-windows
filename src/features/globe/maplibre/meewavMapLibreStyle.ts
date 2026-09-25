import {
  CREPUSCULE_URBAIN_GROUND,
  CREPUSCULE_URBAIN_STROKES,
  GRAND_PARIS_CREPUSCULE_GROUND,
  GRAND_PARIS_FIGMA_STROKES,
  GRAND_PARIS_LEGACY_GROUND_COLOR_REPLACEMENTS,
  GLOBE_PRESENTATION_COLORS,
  LABEL_COLORS,
  WATER_COLORS,
  WORLD_LAND_COLOR,
} from "./crepusculeUrbainPalette";
import {
  FRANCE_REGION_GROUND_LABEL_LAYER_ID,
  FRANCE_REGION_GROUND_LABELS_SOURCE_ID,
  FRANCE_REGION_GROUND_LABELS_URL,
  FRANCE_REGION_PLATE_EXTRUSION_LAYER_ID,
  FRANCE_REGION_PLATE_OUTLINE_SOURCE_ID,
  FRANCE_REGION_PLATE_OUTLINE_URL,
  FRANCE_REGION_PLATE_TOP_FILL_LAYER_ID,
  FRANCE_REGION_PLATE_HITBOX_LAYER_ID,
  FRANCE_REGION_PLATES_SOURCE_ID,
  FRANCE_REGION_PLATES_URL,
} from "./franceRegionPlates";
import {
  FRANCE_URBAN_AREAS_SOURCE_ID,
  FRANCE_URBAN_AREAS_URL,
  FRANCE_URBAN_AREA_FILL_LAYER_ID,
  FRANCE_URBAN_AREA_LABEL_LAYER_ID,
  FRANCE_URBAN_AREA_OUTLINE_LAYER_ID,
  FRANCE_URBAN_AREA_SHADOW_LAYER_ID,
} from "./franceUrbanAreas";
import {
  createStablePointLabelLayout,
  FRANCE_REGIONAL_LABEL_MAX_ZOOM,
  PARIS_PRODUCT_LABEL_IDS_OWNED_BY_OFFICIAL_ZONES,
} from "./stableGeographicLabelPolicy";
export const OPENFREEMAP_SOURCE_ID = "openmaptiles";
export const OPENFREEMAP_PLACE_SECONDARY_CORE_LAYER_ID = "meewav-place-secondary-core";
export const OPENFREEMAP_PLACE_LOCAL_CORE_LAYER_ID = "meewav-place-local-core";
export const OPENFREEMAP_PLACE_SECONDARY_LABEL_LAYER_ID = "labels_cities_secondary";
export const OPENFREEMAP_PLACE_LOCAL_LABEL_LAYER_ID = "labels_cities_local";
export const PARIS_MONUMENTS_SOURCE_ID = "paris-monuments";
export const GRAND_PARIS_OVERVIEW_SOURCE_ID = "grand-paris-overview";
export const PARIS_LOCAL_MOSAIC_MIN_ZOOM = 11.45;
export const GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID = "grand-paris-active-outline";
export const GRAND_PARIS_ACTIVE_OUTLINE_HALO_LAYER_ID = "grand-paris-active-outline-halo";
export const GRAND_PARIS_ACTIVE_OUTLINE_LINE_LAYER_ID = "grand-paris-active-outline-line";
export const PARIS_OVERVIEW_BOUNDARY_SOURCE_ID = "paris-overview-boundary";
export const SEINE_SAINT_DENIS_BOUNDARY_SOURCE_ID = "seine-saint-denis-boundary";
export const SEINE_SAINT_DENIS_BOUNDARY_HOVER_FILL_LAYER_ID = "seine-saint-denis-boundary-hover-fill";
export const SEINE_SAINT_DENIS_BOUNDARY_HALO_LAYER_ID = "seine-saint-denis-boundary-halo";
export const SEINE_SAINT_DENIS_BOUNDARY_LINE_LAYER_ID = "seine-saint-denis-boundary-line";
export const CITY_OVERVIEW_PRODUCT_LABELS_SOURCE_ID = "city-overview-product-labels";
export const CASTLE_HILL_DEM_SOURCE_ID = "castle_hill_dem";
export const CASTLE_HILL_DEBUG_SOURCE_ID = "castle_hill_debug_polygon_source";
export const CASTLE_HILL_RELIEF_LINES_SOURCE_ID = "castle_hill_relief_lines_source";
export const CASTLE_HILL_HILLSHADE_LAYER_ID = "castle_hill_hillshade";
export const CASTLE_HILL_COLOR_RELIEF_LAYER_ID = "castle_hill_color_relief";
export const CASTLE_HILL_RELIEF_LINES_LAYER_ID = "castle_hill_relief_lines";
export const CASTLE_HILL_DEBUG_POLYGON_LAYER_ID = "castle_hill_debug_polygon";
export const CASTLE_HILL_BOUNDS = [7.230, 43.665, 7.330, 43.720];
export const TERRAIN_DEM_SOURCE_ID = "terrain-dem-source";
export const TERRAIN_COLOR_RELIEF_LAYER_ID = "terrain-color-relief";
export const TERRAIN_HILLSHADE_STANDARD_LAYER_ID = "terrain-hillshade-standard";
export const TERRAIN_HILLSHADE_MULTIDIRECTIONAL_LAYER_ID = "terrain-hillshade-multidirectional";
export const TERRAIN_CONTOURS_LAYER_ID = "terrain-contours";
export const TERRAIN_DEBUG_LAYER_ID = "terrain-debug";
export const TERRAIN_DEM_ENCODING = "terrarium";
export const TERRAIN_DEM_TILE_SIZE = 256;
export const TERRAIN_DEM_MAXZOOM = 15;
export const TERRAIN_DEM_TILES = ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"];

const GRAND_PARIS_GROUND_COLOR_BY_INDEX_EXPRESSION: any[] = [
  "match",
  ["to-number", ["get", "colorIndex"]],
  ...GRAND_PARIS_CREPUSCULE_GROUND.flatMap((color, index) => [index, color]),
  GRAND_PARIS_CREPUSCULE_GROUND[0],
];

const GRAND_PARIS_GROUND_COLOR_BY_LEGACY_EXPRESSION: any[] = [
  "match",
  ["upcase", ["to-string", ["get", "groundColor"]]],
  ...Object.entries(GRAND_PARIS_LEGACY_GROUND_COLOR_REPLACEMENTS).flat(),
  GRAND_PARIS_GROUND_COLOR_BY_INDEX_EXPRESSION,
];

const GRAND_PARIS_GROUND_COLOR_EXPRESSION: any[] = [
  "case",
  ["has", "groundColor"],
  GRAND_PARIS_GROUND_COLOR_BY_LEGACY_EXPRESSION,
  GRAND_PARIS_GROUND_COLOR_BY_INDEX_EXPRESSION,
];
const FRANCE_URBAN_AREA_HOVER_STATE: any[] = ["boolean", ["feature-state", "hover"], false];
const FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM = 8.45;
const FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM = 9.25;
const FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM = 10.45;
const FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM = 11.25;
const FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION: any[] = ["==", ["get", "pointLevel"], "major"];
const FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION: any[] = ["==", ["get", "pointLevel"], "secondary"];
const FRANCE_REGION_CITY_LABEL_SIZE_VALUE: any[] = [
  "case",
  FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
  12.2,
  FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION,
  10.8,
  9.4,
];

function cloneMapStyleExpression(value: unknown): unknown {
  return Array.isArray(value) ? value.map(cloneMapStyleExpression) : value;
}

function withFranceRegionCityCoverageReveal(
  stepExpression: any[],
  coverageValue: unknown,
  preserveFirstCaseBranch: boolean,
) {
  return stepExpression.map((part, index) => {
    const isStepOutput = index >= 2 && index % 2 === 0;
    if (!isStepOutput || !Array.isArray(part) || part[0] !== "case") {
      return cloneMapStyleExpression(part);
    }

    const insertionIndex = preserveFirstCaseBranch ? 3 : 1;
    return [
      ...part.slice(0, insertionIndex).map(cloneMapStyleExpression),
      ["==", ["get", "coverageAnchor"], true],
      cloneMapStyleExpression(coverageValue),
      ...part.slice(insertionIndex).map(cloneMapStyleExpression),
    ];
  });
}
const FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION: any[] = [
  "all",
  FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION,
  ["!", ["boolean", ["get", "nearMajorCity"], false]],
];
const FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION: any[] = [
  "all",
  ["==", ["get", "pointLevel"], "local"],
  ["!", ["boolean", ["get", "nearMajorCity"], false]],
];
const FRANCE_REGION_PLATE_HOVER_STATE: any[] = ["boolean", ["feature-state", "hover"], false];
const FRANCE_REGION_PLATE_SELECTED_STATE: any[] = ["boolean", ["feature-state", "selected"], false];
const FRANCE_REGION_PLATE_DIMMED_STATE: any[] = ["boolean", ["feature-state", "dimmed"], false];
const FRANCE_REGION_PLATE_DISPLAY_MAX_ZOOM = 8.4;
const FRANCE_REGION_PLATE_INTERACTION_MAX_ZOOM = 8.4;
// Avatars become visible at z15. Roads deliberately start a fraction later so
// the visual order is unambiguous while both reveals still feel simultaneous.
const ROADS_POST_AVATAR_REVEAL_START_ZOOM = 15.05;
const ROADS_POST_AVATAR_REVEAL_END_ZOOM = 15.22;
const NATIVE_PLACE_PROTECTED_PARIS_GRAND_PARIS_AREA = {
  type: "Polygon",
  coordinates: [[
    [2.16, 48.74],
    [2.57, 48.74],
    [2.57, 49.02],
    [2.16, 49.02],
    [2.16, 48.74],
  ]],
};
const MEEWAV_PLACE_FILTER: any[] = [
  "all",
  ["match", ["geometry-type"], ["Point"], true, false],
  ["match", ["get", "class"], ["city", "town", "village"], true, false],
  ["!", ["within", NATIVE_PLACE_PROTECTED_PARIS_GRAND_PARIS_AREA]],
];
export type OpenFreeMapPlaceLabelTier = "major" | "secondary" | "local";
export const OPENFREEMAP_PLACE_MAJOR_MAX_RANK = 3;
export const OPENFREEMAP_PLACE_SECONDARY_MAX_RANK = 7;

export function withOpenFreeMapPlaceLabelTier(
  baseFilter: any[],
  tier: OpenFreeMapPlaceLabelTier,
): any[] {
  const rankExpression: any[] = ["to-number", ["get", "rank"], 99];
  const tierFilter: any[] = tier === "major"
    ? ["<=", rankExpression, OPENFREEMAP_PLACE_MAJOR_MAX_RANK]
    : tier === "secondary"
      ? [
        "all",
        [">", rankExpression, OPENFREEMAP_PLACE_MAJOR_MAX_RANK],
        ["<=", rankExpression, OPENFREEMAP_PLACE_SECONDARY_MAX_RANK],
      ]
      : [">", rankExpression, OPENFREEMAP_PLACE_SECONDARY_MAX_RANK];

  return ["all", baseFilter, tierFilter];
}

const MEEWAV_PLACE_MAJOR_FILTER = withOpenFreeMapPlaceLabelTier(MEEWAV_PLACE_FILTER, "major");
const MEEWAV_PLACE_SECONDARY_FILTER = withOpenFreeMapPlaceLabelTier(MEEWAV_PLACE_FILTER, "secondary");
const MEEWAV_PLACE_LOCAL_FILTER = withOpenFreeMapPlaceLabelTier(MEEWAV_PLACE_FILTER, "local");
const NATIVE_PLACE_LABEL_COLOR: any[] = [
  "case",
  ["==", ["get", "class"], "city"],
  "#FFFFFF",
  ["==", ["get", "class"], "town"],
  "rgba(252, 248, 255, 0.96)",
  "rgba(244, 238, 255, 0.86)",
];
const NATIVE_PLACE_LABEL_HALO_COLOR = "rgba(72, 48, 148, 0.42)";

function createTieredNativePlaceLabelLayer({
  id,
  minzoom,
  maxzoom,
  filter,
  textPadding,
  textOpacity,
  textSizes,
  visibility,
}: {
  id: string;
  minzoom: number;
  maxzoom: number;
  filter: any[];
  textPadding: number;
  textOpacity: number;
  textSizes: [number, number, number];
  visibility?: "none" | "visible";
}) {
  return {
    id,
    type: "symbol",
    source: OPENFREEMAP_SOURCE_ID,
    "source-layer": "place",
    minzoom,
    maxzoom,
    filter,
    layout: {
      ...(visibility ? { visibility } : {}),
      ...createStablePointLabelLayout({ anchor: "left" }),
      "text-field": ["coalesce", ["get", "name_fr"], ["get", "name"], ["get", "name_en"]],
      "text-font": ["Noto Sans Bold"],
      "text-size": [
        "case",
        ["==", ["get", "class"], "city"],
        textSizes[0],
        ["==", ["get", "class"], "town"],
        textSizes[1],
        textSizes[2],
      ],
      "text-max-width": 8.5,
      "text-padding": textPadding,
      "text-letter-spacing": 0,
      "text-offset": [0.58, 0],
      "symbol-sort-key": ["to-number", ["get", "rank"], 99],
    },
    paint: {
      "text-color": NATIVE_PLACE_LABEL_COLOR,
      "text-opacity": textOpacity,
      "text-halo-color": NATIVE_PLACE_LABEL_HALO_COLOR,
      "text-halo-width": 0.72,
      "text-halo-blur": 0.35,
    },
  } as const;
}

function createTieredNativePlaceCoreLayer({
  id,
  minzoom,
  maxzoom,
  filter,
  circleOpacity,
  circleRadii,
}: {
  id: string;
  minzoom: number;
  maxzoom: number;
  filter: any[];
  circleOpacity: number;
  circleRadii: [number, number, number];
}) {
  return {
    id,
    type: "circle",
    source: OPENFREEMAP_SOURCE_ID,
    "source-layer": "place",
    minzoom,
    maxzoom,
    filter,
    paint: {
      "circle-color": [
        "case",
        ["==", ["get", "class"], "city"],
        "rgba(255, 255, 255, 0.9)",
        ["==", ["get", "class"], "town"],
        "rgba(234, 225, 255, 0.82)",
        "rgba(211, 198, 248, 0.72)",
      ],
      "circle-radius": [
        "case",
        ["==", ["get", "class"], "city"],
        circleRadii[0],
        ["==", ["get", "class"], "town"],
        circleRadii[1],
        circleRadii[2],
      ],
      "circle-opacity": circleOpacity,
      "circle-stroke-color": "rgba(18, 8, 38, 0.78)",
      "circle-stroke-width": 0.45,
      "circle-stroke-opacity": 0.48,
    },
  } as const;
}

type CityOverviewProductLabel = {
  id: string;
  name: string;
  rank: number;
  coordinates: [number, number];
};

const PARIS_CITY_OVERVIEW_PRODUCT_LABELS: CityOverviewProductLabel[] = [
  { id: "paris", name: "PARIS", rank: 0, coordinates: [2.3522, 48.8566] },
  { id: "montmartre", name: "Montmartre", rank: 1, coordinates: [2.3431, 48.8867] },
  { id: "pigalle", name: "Pigalle", rank: 3, coordinates: [2.3374, 48.8824] },
  { id: "batignolles", name: "Batignolles", rank: 3, coordinates: [2.3165, 48.8872] },
  { id: "ternes", name: "Ternes", rank: 3, coordinates: [2.2952, 48.8794] },
  { id: "monceau", name: "Monceau", rank: 3, coordinates: [2.3089, 48.8797] },
  { id: "champs-elysees", name: "Champs-Élysées", rank: 2, coordinates: [2.3077, 48.8708] },
  { id: "madeleine", name: "Madeleine", rank: 3, coordinates: [2.3244, 48.8706] },
  { id: "opera", name: "Opéra", rank: 2, coordinates: [2.3316, 48.8719] },
  { id: "les-halles", name: "Les Halles", rank: 2, coordinates: [2.3454, 48.8622] },
  { id: "palais-royal", name: "Palais Royal", rank: 2, coordinates: [2.3376, 48.8635] },
  { id: "concorde", name: "Concorde", rank: 3, coordinates: [2.3211, 48.8656] },
  { id: "saint-germain", name: "Saint-Germain", rank: 2, coordinates: [2.3334, 48.8542] },
  { id: "invalides", name: "Invalides", rank: 2, coordinates: [2.3126, 48.8566] },
  { id: "quartier-latin", name: "Quartier Latin", rank: 2, coordinates: [2.3446, 48.8487] },
  { id: "le-marais", name: "Le Marais", rank: 2, coordinates: [2.3624, 48.8597] },
  { id: "republique", name: "République", rank: 1, coordinates: [2.3631, 48.8674] },
  { id: "faubourg-saint-denis", name: "Faubourg-Saint-Denis", rank: 3, coordinates: [2.3536, 48.8727] },
  { id: "belleville", name: "Belleville", rank: 2, coordinates: [2.383, 48.872] },
  { id: "menilmontant", name: "Ménilmontant", rank: 3, coordinates: [2.3864, 48.8669] },
  { id: "popincourt", name: "Popincourt", rank: 3, coordinates: [2.3777, 48.8584] },
  { id: "bastille", name: "Bastille", rank: 2, coordinates: [2.369, 48.8532] },
  { id: "charonne", name: "Charonne", rank: 3, coordinates: [2.3945, 48.8555] },
  { id: "nation", name: "Nation", rank: 2, coordinates: [2.395, 48.8484] },
  { id: "bercy", name: "Bercy", rank: 3, coordinates: [2.3828, 48.8352] },
  { id: "picpus", name: "Picpus", rank: 3, coordinates: [2.3988, 48.8414] },
  { id: "la-villette", name: "La Villette", rank: 3, coordinates: [2.3897, 48.8874] },
  { id: "passy", name: "Passy", rank: 3, coordinates: [2.2762, 48.8585] },
  { id: "auteuil", name: "Auteuil", rank: 3, coordinates: [2.2625, 48.8474] },
  { id: "grenelle", name: "Grenelle", rank: 3, coordinates: [2.2914, 48.8491] },
  { id: "saint-lambert", name: "Saint-Lambert", rank: 3, coordinates: [2.2969, 48.8367] },
  { id: "montparnasse", name: "Montparnasse", rank: 2, coordinates: [2.323, 48.842] },
  { id: "plaisance", name: "Plaisance", rank: 3, coordinates: [2.3166, 48.8314] },
  { id: "alesia", name: "Alésia", rank: 3, coordinates: [2.3266, 48.828] },
  { id: "butte-aux-cailles", name: "Butte-aux-Cailles", rank: 3, coordinates: [2.3521, 48.827] },
  { id: "les-gobelins", name: "Les Gobelins", rank: 3, coordinates: [2.3535, 48.8353] },
  { id: "maison-blanche", name: "Maison Blanche", rank: 3, coordinates: [2.3589, 48.8215] },
];

const GRAND_PARIS_PRIMARY_COMMUNE_LABELS = [
  "Boulogne-Billancourt",
  "Issy-les-Moulineaux",
  "Nanterre",
  "Courbevoie",
  "Levallois-Perret",
  "Clichy",
  "Saint-Ouen-sur-Seine",
  "Saint-Denis",
  "Aubervilliers",
  "Pantin",
  "Bobigny",
  "Aulnay-sous-Bois",
  "Montreuil",
  "Vincennes",
  "Saint-Mandé",
  "Ivry-sur-Seine",
  "Vitry-sur-Seine",
  "Créteil",
  "Neuilly-sur-Seine",
  "Colombes",
  "Asnières-sur-Seine",
  "Rueil-Malmaison",
  "Maisons-Alfort",
  "Saint-Maur-des-Fossés",
  "Champigny-sur-Marne",
  "Noisy-le-Grand",
  "Drancy",
  "Le Blanc-Mesnil",
] as const;

const DISABLE_AUTOMATIC_DISTRICT_LABELS_FILTER: any[] = [
  "==",
  ["get", "name"],
  "__meewav_disabled_city_label__",
];

const LOUVRE_PYRAMID_COURTYARD_WATER_FILTER = [
  "within",
  {
    type: "Polygon",
    coordinates: [[
      [2.33476, 48.86017],
      [2.33714, 48.86017],
      [2.33714, 48.86182],
      [2.33476, 48.86182],
      [2.33476, 48.86017],
    ]],
  },
] as const;
const LOUVRE_PYRAMID_COURTYARD_WATER_EXCLUSION_FILTER = [
  "!",
  LOUVRE_PYRAMID_COURTYARD_WATER_FILTER,
] as const;
export const MEEWAV_MAPLIBRE_STYLE = {
  version: 8,
  projection: {
    type: "globe",
  },
  sources: {
    [OPENFREEMAP_SOURCE_ID]: {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      maxzoom: 14,
    },
    [TERRAIN_DEM_SOURCE_ID]: {
      type: "raster-dem",
      tiles: TERRAIN_DEM_TILES,
      tileSize: TERRAIN_DEM_TILE_SIZE,
      maxzoom: TERRAIN_DEM_MAXZOOM,
      encoding: TERRAIN_DEM_ENCODING,
    },
    [CASTLE_HILL_DEM_SOURCE_ID]: {
      type: "raster-dem",
      tiles: ["/map/landmarks/castle-hill-dem/{z}/{x}/{y}.png"],
      bounds: CASTLE_HILL_BOUNDS,
      minzoom: 11,
      maxzoom: 15,
      tileSize: 256,
      encoding: "terrarium",
    },
    [CASTLE_HILL_DEBUG_SOURCE_ID]: {
      type: "geojson",
      data: "/map/landmarks/nice-castle-hill.geojson",
    },
    [CASTLE_HILL_RELIEF_LINES_SOURCE_ID]: {
      type: "geojson",
      data: "/map/landmarks/nice-castle-hill-relief-lines.geojson",
    },
    [PARIS_OVERVIEW_BOUNDARY_SOURCE_ID]: {
      type: "geojson",
      data: "/map/paris-overview-boundary.geojson",
      promoteId: "id",
    },
    [GRAND_PARIS_OVERVIEW_SOURCE_ID]: {
      type: "geojson",
      data: "/map/grand-paris-communes-overview.geojson",
      promoteId: "id",
    },
    [GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID]: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [],
      },
      promoteId: "id",
    },
    [SEINE_SAINT_DENIS_BOUNDARY_SOURCE_ID]: {
      type: "geojson",
      data: "/map/seine-saint-denis-boundary.geojson",
      promoteId: "id",
    },
    [CITY_OVERVIEW_PRODUCT_LABELS_SOURCE_ID]: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: PARIS_CITY_OVERVIEW_PRODUCT_LABELS
          .filter(({ id }) => !PARIS_PRODUCT_LABEL_IDS_OWNED_BY_OFFICIAL_ZONES.has(id))
          .map(({ id, name, rank, coordinates }) => ({
            type: "Feature",
            properties: { id, name, rank },
            geometry: { type: "Point", coordinates },
          })),
      },
    },
    [FRANCE_URBAN_AREAS_SOURCE_ID]: {
      type: "geojson",
      data: FRANCE_URBAN_AREAS_URL,
      promoteId: "id",
    },
    [FRANCE_REGION_PLATES_SOURCE_ID]: {
      type: "geojson",
      data: FRANCE_REGION_PLATES_URL,
      promoteId: "regionId",
    },
    [FRANCE_REGION_PLATE_OUTLINE_SOURCE_ID]: {
      type: "geojson",
      data: FRANCE_REGION_PLATE_OUTLINE_URL,
      promoteId: "regionId",
    },
    [FRANCE_REGION_GROUND_LABELS_SOURCE_ID]: {
      type: "geojson",
      data: FRANCE_REGION_GROUND_LABELS_URL,
      promoteId: "regionId",
    },
    [PARIS_MONUMENTS_SOURCE_ID]: {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { name: "Tour Eiffel" }, geometry: { type: "Point", coordinates: [2.2945, 48.8584] } },
          { type: "Feature", properties: { name: "Musée du Louvre" }, geometry: { type: "Point", coordinates: [2.3376, 48.8606] } },
          { type: "Feature", properties: { name: "Arc de Triomphe" }, geometry: { type: "Point", coordinates: [2.295, 48.8738] } },
          { type: "Feature", properties: { name: "Notre-Dame de Paris" }, geometry: { type: "Point", coordinates: [2.3499, 48.853] } },
          { type: "Feature", properties: { name: "Sacré-Cœur" }, geometry: { type: "Point", coordinates: [2.3431, 48.8867] } },
          { type: "Feature", properties: { name: "Panthéon" }, geometry: { type: "Point", coordinates: [2.346, 48.8462] } },
          { type: "Feature", properties: { name: "Centre Pompidou" }, geometry: { type: "Point", coordinates: [2.3522, 48.8606] } },
          { type: "Feature", properties: { name: "Opéra Garnier" }, geometry: { type: "Point", coordinates: [2.3316, 48.8719] } },
          { type: "Feature", properties: { name: "Musée d'Orsay" }, geometry: { type: "Point", coordinates: [2.3266, 48.86] } },
          { type: "Feature", properties: { name: "Grand Palais" }, geometry: { type: "Point", coordinates: [2.3125, 48.8661] } },
          { type: "Feature", properties: { name: "Petit Palais" }, geometry: { type: "Point", coordinates: [2.3145, 48.866] } },
          { type: "Feature", properties: { name: "Obélisque de Louxor" }, geometry: { type: "Point", coordinates: [2.321236, 48.865512] } },
          { type: "Feature", properties: { name: "Place de la Concorde" }, geometry: { type: "Point", coordinates: [2.3211, 48.8656] } },
          { type: "Feature", properties: { name: "Sainte-Chapelle" }, geometry: { type: "Point", coordinates: [2.345, 48.8554] } },
          { type: "Feature", properties: { name: "Hôtel de Ville" }, geometry: { type: "Point", coordinates: [2.3522, 48.8566] } },
          { type: "Feature", properties: { name: "Stade de France" }, geometry: { type: "Point", coordinates: [2.3601, 48.9245] } },
          { type: "Feature", properties: { name: "Opéra Bastille" }, geometry: { type: "Point", coordinates: [2.3701, 48.853] } },
          { type: "Feature", properties: { name: "Place de la Bastille" }, geometry: { type: "Point", coordinates: [2.369, 48.8532] } },
          { type: "Feature", properties: { name: "Conciergerie" }, geometry: { type: "Point", coordinates: [2.3456, 48.8559] } },
          { type: "Feature", properties: { name: "Tour Montparnasse" }, geometry: { type: "Point", coordinates: [2.3211, 48.8421] } },
          { type: "Feature", properties: { name: "Parc des Princes" }, geometry: { type: "Point", coordinates: [2.2528, 48.8414] } },
          { type: "Feature", properties: { name: "Roland-Garros" }, geometry: { type: "Point", coordinates: [2.2494, 48.847] } },
          { type: "Feature", properties: { name: "Château de Versailles" }, geometry: { type: "Point", coordinates: [2.1204, 48.8049] } },
          { type: "Feature", properties: { name: "Notre-Dame de la Garde" }, geometry: { type: "Point", coordinates: [5.3713, 43.284] } },
          { type: "Feature", properties: { name: "Vieux-Port de Marseille" }, geometry: { type: "Point", coordinates: [5.369, 43.2951] } },
          { type: "Feature", properties: { name: "Basilique de Fourvière" }, geometry: { type: "Point", coordinates: [4.822, 45.7623] } },
          { type: "Feature", properties: { name: "Place Bellecour" }, geometry: { type: "Point", coordinates: [4.832, 45.7579] } },
          { type: "Feature", properties: { name: "Capitole de Toulouse" }, geometry: { type: "Point", coordinates: [1.4442, 43.6045] } },
          { type: "Feature", properties: { name: "Château des ducs de Bretagne" }, geometry: { type: "Point", coordinates: [-1.5493, 47.2165] } },
          { type: "Feature", properties: { name: "Cathédrale Saint-Pierre" }, geometry: { type: "Point", coordinates: [-1.5501, 47.218] } },
          { type: "Feature", properties: { name: "Promenade des Anglais" }, geometry: { type: "Point", coordinates: [7.2583, 43.6951] } },
          { type: "Feature", properties: { name: "Notre-Dame de Nice" }, geometry: { type: "Point", coordinates: [7.2653, 43.7034] } },
        ],
      },
    },
  },
  glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
  light: {
    anchor: "viewport",
    color: "#E5D6FF",
    intensity: 0.62,
    position: [1.45, 220, 45],
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": GLOBE_PRESENTATION_COLORS.land,
      },
    },
    {
      id: TERRAIN_COLOR_RELIEF_LAYER_ID,
      type: "hillshade",
      source: TERRAIN_DEM_SOURCE_ID,
      minzoom: 4,
      maxzoom: 12.6,
      layout: {
        visibility: "none",
      },
      paint: {
        "hillshade-method": "basic",
        "hillshade-illumination-direction": 325,
        "hillshade-illumination-altitude": 55,
        "hillshade-shadow-color": "rgba(24, 12, 70, 0.14)",
        "hillshade-highlight-color": "rgba(142, 118, 226, 0.12)",
        "hillshade-accent-color": "rgba(76, 47, 154, 0.08)",
        "hillshade-exaggeration": 0.18,
      },
    },
    {
      id: TERRAIN_HILLSHADE_STANDARD_LAYER_ID,
      type: "hillshade",
      source: TERRAIN_DEM_SOURCE_ID,
      maxzoom: 14.8,
      layout: {
        visibility: "none",
      },
      paint: {
        "hillshade-method": "standard",
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-altitude": 38,
        "hillshade-shadow-color": "#0D0820",
        "hillshade-highlight-color": "#A090D8",
        "hillshade-accent-color": "#6B4AC3",
        "hillshade-exaggeration": 0.48,
      },
    },
    {
      id: TERRAIN_HILLSHADE_MULTIDIRECTIONAL_LAYER_ID,
      type: "hillshade",
      source: TERRAIN_DEM_SOURCE_ID,
      minzoom: 5,
      maxzoom: 14.2,
      layout: {
        visibility: "none",
      },
      paint: {
        "hillshade-method": "multidirectional",
        "hillshade-illumination-direction": [270, 315, 0, 45],
        "hillshade-illumination-altitude": [28, 32, 30, 34],
        "hillshade-shadow-color": [
          "rgba(8, 6, 24, 0.34)",
          "rgba(16, 8, 42, 0.28)",
          "rgba(25, 13, 61, 0.22)",
          "rgba(31, 16, 72, 0.18)",
        ],
        "hillshade-highlight-color": [
          "rgba(134, 113, 216, 0.20)",
          "rgba(156, 132, 234, 0.18)",
          "rgba(105, 95, 186, 0.14)",
          "rgba(182, 166, 255, 0.12)",
        ],
        "hillshade-accent-color": "rgba(88, 58, 174, 0.12)",
        "hillshade-exaggeration": 0.34,
      },
    },
    {
      id: TERRAIN_DEBUG_LAYER_ID,
      type: "hillshade",
      source: TERRAIN_DEM_SOURCE_ID,
      layout: {
        visibility: "none",
      },
      paint: {
        "hillshade-method": "combined",
        "hillshade-illumination-direction": 315,
        "hillshade-illumination-altitude": 35,
        "hillshade-shadow-color": "rgba(0, 0, 0, 0.7)",
        "hillshade-highlight-color": "rgba(255, 255, 255, 0.45)",
        "hillshade-accent-color": "rgba(124, 58, 237, 0.35)",
        "hillshade-exaggeration": 0.65,
      },
    },
    {
      id: "roads_minor",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: 14,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        [
          "any",
          [
            "match",
            ["get", "class"],
            ["rail", "railway", "tram", "light_rail", "subway"],
            true,
            false,
          ],
          [
            "match",
            ["get", "subclass"],
            ["rail", "railway", "tram", "light_rail", "subway"],
            true,
            false,
          ],
        ],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#A98CFF",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 18, 2.2],
      },
    },
    {
      id: "landcover_green_areas",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landcover",
      minzoom: 12.5,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        ["==", ["get", "class"], "grass"],
        [
          "match",
          ["get", "subclass"],
          ["park", "garden", "recreation_ground", "village_green", "golf_course", "flowerbed", "plant_nursery", "allotments", "orchard"],
          true,
          false,
        ],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.G02,
        "fill-opacity": 0.78,
        "fill-antialias": true,
      },
    },
    {
      id: "landcover_small_green_grounds",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landcover",
      minzoom: 11,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        [
          "any",
          ["match", ["get", "class"], ["pitch", "stadium", "track"], true, false],
          ["match", ["get", "subclass"], ["pitch", "stadium", "track"], true, false],
        ],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.V07,
        "fill-opacity": 0.78,
        "fill-antialias": true,
      },
    },
    {
      id: "landuse_small_green_grounds",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landuse",
      minzoom: 11,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        [
          "match",
          ["get", "class"],
          ["pitch", "stadium", "track"],
          true,
          false,
        ],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.V07,
        "fill-opacity": 0.78,
        "fill-antialias": true,
      },
    },
    {
      id: "landcover_beach",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landcover",
      minzoom: 10,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        [
          "any",
          ["==", ["get", "class"], "sand"],
          ["match", ["get", "subclass"], ["beach", "sand", "dune"], true, false],
        ],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.G02,
        "fill-opacity": 0.82,
        "fill-antialias": true,
      },
    },
    {
      id: "landuse_park",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landuse",
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        ["match", ["get", "class"], ["park", "garden", "cemetery", "recreation_ground", "playground", "zoo", "theme_park"], true, false],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.G02,
        "fill-opacity": 0.78,
        "fill-antialias": true,
      },
    },
    {
      id: "stadium_pitch",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "landuse",
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        ["match", ["get", "class"], ["pitch", "stadium", "track"], true, false],
      ],
      paint: {
        "fill-color": CREPUSCULE_URBAIN_GROUND.V07,
        "fill-opacity": 0.78,
        "fill-antialias": true,
      },
    },
    {
      id: CASTLE_HILL_COLOR_RELIEF_LAYER_ID,
      type: "color-relief",
      source: CASTLE_HILL_DEM_SOURCE_ID,
      minzoom: 14,
      maxzoom: 22,
      layout: {
        visibility: "visible",
      },
      paint: {
        "color-relief-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.08, 16, 0.16, 20, 0.12],
        "color-relief-color": [
          "interpolate",
          ["linear"],
          ["elevation"],
          0,
          "rgba(42, 24, 89, 0)",
          10,
          "rgba(42, 24, 89, 0)",
          25,
          "rgba(72, 45, 142, 0.55)",
          65,
          "rgba(111, 80, 205, 0.7)",
          95,
          "rgba(190, 165, 255, 0.82)",
        ],
      },
    },
    {
      id: CASTLE_HILL_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: CASTLE_HILL_DEM_SOURCE_ID,
      minzoom: 14,
      maxzoom: 22,
      layout: {
        visibility: "visible",
      },
      paint: {
        "hillshade-method": "multidirectional",
        "hillshade-illumination-direction": [260, 305, 20, 55],
        "hillshade-illumination-altitude": [26, 30, 32, 34],
        "hillshade-shadow-color": [
          "rgba(10, 6, 30, 0.2)",
          "rgba(18, 9, 48, 0.16)",
          "rgba(31, 16, 72, 0.12)",
          "rgba(41, 22, 88, 0.08)",
        ],
        "hillshade-highlight-color": [
          "rgba(126, 106, 214, 0.18)",
          "rgba(155, 132, 238, 0.16)",
          "rgba(110, 98, 190, 0.12)",
          "rgba(189, 172, 255, 0.1)",
        ],
        "hillshade-accent-color": "rgba(92, 58, 174, 0.1)",
        "hillshade-exaggeration": 0.38,
      },
    },
    {
      id: CASTLE_HILL_RELIEF_LINES_LAYER_ID,
      type: "line",
      source: CASTLE_HILL_RELIEF_LINES_SOURCE_ID,
      minzoom: 14,
      maxzoom: 22,
      layout: {
        visibility: "visible",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["match", ["get", "kind"], "castle_hill_ridge", "#D6C7FF", "#8FE7E0"],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 14, 0.34, 16, 0.68, 19, 0.54],
        "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.35, 17, 1, 20, 1.55],
      },
    },
    {
      id: CASTLE_HILL_DEBUG_POLYGON_LAYER_ID,
      type: "fill",
      source: CASTLE_HILL_DEBUG_SOURCE_ID,
      layout: {
        visibility: "none",
      },
      paint: {
        "fill-color": "rgba(255, 255, 255, 0.08)",
        "fill-outline-color": "#FFFFFF",
      },
    },
    {
      id: "water",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "water",
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        LOUVRE_PYRAMID_COURTYARD_WATER_EXCLUSION_FILTER,
      ],
      paint: {
        "fill-color": GLOBE_PRESENTATION_COLORS.water,
        "fill-opacity": 1,
        "fill-antialias": true,
      },
    },
    {
      id: "meewav-globe-coast-contact-shadow",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "water",
      maxzoom: 6.8,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        LOUVRE_PYRAMID_COURTYARD_WATER_EXCLUSION_FILTER,
      ],
      paint: {
        "fill-color": "rgba(0, 0, 0, 0)",
        "fill-outline-color": "rgba(3, 1, 22, 0.76)",
        "fill-translate": [1.1, 1.35],
        "fill-translate-anchor": "viewport",
      },
    },
    {
      id: "meewav-globe-coast-cold-rim",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "water",
      maxzoom: 6.8,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        LOUVRE_PYRAMID_COURTYARD_WATER_EXCLUSION_FILTER,
      ],
      paint: {
        "fill-color": "rgba(0, 0, 0, 0)",
        "fill-outline-color": "rgba(196, 154, 255, 0.5)",
        "fill-translate": [-0.55, -0.75],
        "fill-translate-anchor": "viewport",
      },
    },
    {
      id: "waterway_canal",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "waterway",
      minzoom: 11.5,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["river", "canal"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": WATER_COLORS.main,
        "line-opacity": 1,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11.5, 1.4, 14, 4.5, 16, 10, 18, 18],
      },
    },
    {
      id: "admin_country_boundary_casing",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
        ["!=", ["get", "maritime"], 1],
        ["!=", ["get", "maritime"], "1"],
        ["!=", ["get", "adm0_l"], "FRA"],
        ["!=", ["get", "adm0_r"], "FRA"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#1B0E3C",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.40, 4, 0.55, 8, 0.65],
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.5, 5, 2.4, 9, 3.6, 12, 4.8],
      },
    },
    {
      id: "admin_country_boundary",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
        ["!=", ["get", "maritime"], 1],
        ["!=", ["get", "maritime"], "1"],
        ["!=", ["get", "adm0_l"], "FRA"],
        ["!=", ["get", "adm0_r"], "FRA"],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#22134F",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.20, 4, 0.25, 8, 0.35],
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.0, 9, 1.6, 12, 2.4],
      },
    },
    {
      id: "admin_france_boundary_casing",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
        ["!=", ["get", "maritime"], 1],
        ["!=", ["get", "maritime"], "1"],
        ["any", ["==", ["get", "adm0_l"], "FRA"], ["==", ["get", "adm0_r"], "FRA"]],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "rgba(245, 240, 255, 0.18)",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.0, 9, 1.4, 12, 1.8],
      },
    },
    {
      id: "admin_france_boundary_glow",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
        ["!=", ["get", "maritime"], 1],
        ["!=", ["get", "maritime"], "1"],
        ["any", ["==", ["get", "adm0_l"], "FRA"], ["==", ["get", "adm0_r"], "FRA"]],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CREPUSCULE_URBAIN_STROKES.selected,
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.2, 5, 1.8, 9, 2.2, 12, 2.8],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 5, 1.1, 9, 1.5, 12, 1.9],
      },
    },
    {
      id: "admin_france_boundary",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "boundary",
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["any", ["==", ["get", "admin_level"], 2], ["==", ["get", "admin_level"], "2"]],
        ["!=", ["get", "maritime"], 1],
        ["!=", ["get", "maritime"], "1"],
        ["any", ["==", ["get", "adm0_l"], "FRA"], ["==", ["get", "adm0_r"], "FRA"]],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "rgba(245, 240, 255, 0.42)",
        "line-opacity": 0,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.32, 5, 0.56, 9, 0.8, 12, 1.1],
      },
    },
    {
      id: FRANCE_REGION_PLATE_TOP_FILL_LAYER_ID,
      type: "fill",
      source: FRANCE_REGION_PLATES_SOURCE_ID,
      minzoom: 4,
      maxzoom: FRANCE_REGION_PLATE_DISPLAY_MAX_ZOOM,
      paint: {
        "fill-color": [
          "case",
          FRANCE_REGION_PLATE_SELECTED_STATE,
          "#855DDD",
          FRANCE_REGION_PLATE_HOVER_STATE,
          "#936BF0",
          FRANCE_REGION_PLATE_DIMMED_STATE,
          "#2B2150",
          ["get", "plateColor"],
        ],
        "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.93, 5.8, 0.93, FRANCE_REGION_PLATE_DISPLAY_MAX_ZOOM, 0.88],
      },
    },
    {
      id: FRANCE_REGION_PLATE_EXTRUSION_LAYER_ID,
      type: "fill-extrusion",
      source: FRANCE_REGION_PLATES_SOURCE_ID,
      minzoom: 4,
      maxzoom: FRANCE_REGION_PLATE_DISPLAY_MAX_ZOOM,
      paint: {
        "fill-extrusion-color": [
          "case",
          FRANCE_REGION_PLATE_SELECTED_STATE,
          "#7250BF",
          FRANCE_REGION_PLATE_HOVER_STATE,
          "#825FD3",
          FRANCE_REGION_PLATE_DIMMED_STATE,
          "#2B2150",
          ["get", "plateColor"],
        ],
        "fill-extrusion-height": [
          "case",
          FRANCE_REGION_PLATE_SELECTED_STATE,
          ["*", ["to-number", ["get", "plateHeight"]], 1.16],
          FRANCE_REGION_PLATE_HOVER_STATE,
          ["*", ["to-number", ["get", "plateHeight"]], 1.06],
          ["to-number", ["get", "plateHeight"]],
        ],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    {
      id: FRANCE_REGION_PLATE_HITBOX_LAYER_ID,
      type: "fill",
      source: FRANCE_REGION_PLATE_OUTLINE_SOURCE_ID,
      minzoom: 4,
      maxzoom: FRANCE_REGION_PLATE_INTERACTION_MAX_ZOOM,
      paint: {
        "fill-color": "#000000",
        "fill-opacity": 0.001,
      },
    },
    {
      id: FRANCE_REGION_GROUND_LABEL_LAYER_ID,
      type: "symbol",
      source: FRANCE_REGION_GROUND_LABELS_SOURCE_ID,
      minzoom: 4.25,
      maxzoom: FRANCE_REGION_PLATE_INTERACTION_MAX_ZOOM,
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4.25,
          ["case", ["<=", ["to-number", ["get", "priority"]], 2], 13.4, 11.4],
          5.8,
          ["case", ["<=", ["to-number", ["get", "priority"]], 2], 15.2, 12.8],
          7.8,
          ["case", ["<=", ["to-number", ["get", "priority"]], 2], 13.8, 11.8],
          FRANCE_REGION_PLATE_INTERACTION_MAX_ZOOM,
          10.8,
        ],
        "text-max-width": 9,
        "text-padding": 2,
        "text-letter-spacing": 0,
        "symbol-sort-key": ["to-number", ["get", "priority"]],
      },
      paint: {
        "text-color": "rgba(248, 244, 255, 0.86)",
        "text-halo-color": "rgba(18, 8, 38, 0.78)",
        "text-halo-width": 1.75,
        "text-halo-blur": 0.5,
        "text-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4.25,
          0.74,
            5.8,
            0.9,
            7.8,
            0.72,
            FRANCE_REGION_PLATE_INTERACTION_MAX_ZOOM,
            0.34,
        ],
      },
    },
    {
      id: "roads_major_lowzoom",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      maxzoom: ROADS_POST_AVATAR_REVEAL_END_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary"], true, false],
      ],
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        // One contrasted stroke is cheaper than a two-layer casing and stays
        // readable on both the dark active plate and its pale neighbours.
        "line-color": "#51318F",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          4,
          0.82,
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0.9,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.7, 10, 1.45, 13.2, 2.65],
      },
    },
    {
      // Rural single-plate communes often land around z12-z14 and have no
      // motorway/primary road. Keep their actual tertiary network readable,
      // but do not ask the GPU to draw every residential segment or footpath
      // across the whole viewport at that overview scale.
      id: "roads_local_lowzoom",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: 11.5,
      maxzoom: ROADS_POST_AVATAR_REVEAL_END_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        [
          "match",
          ["get", "class"],
          ["tertiary"],
          true,
          false,
        ],
      ],
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#45277E",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          11.5,
          0.76,
          13,
          0.86,
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0.92,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 11.5, 0.9, 13, 1.45, 15.05, 2.4],
      },
    },
    {
      // Neighbourhood streets are useful only once the camera is close enough
      // for them to be legible. Splitting this tier prevents dense cities from
      // submitting tens of thousands of tiny line segments at z12-z13.
      id: "roads_neighborhood_lowzoom",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: 13.5,
      maxzoom: ROADS_POST_AVATAR_REVEAL_END_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        [
          "match",
          ["get", "class"],
          ["minor", "service", "residential", "unclassified", "living_street", "road"],
          true,
          false,
        ],
      ],
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#45277E",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          13.5,
          0.58,
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0.82,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 13.5, 0.58, 15.05, 1.7],
      },
    },
    {
      id: "roads_local_casing",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: ROADS_POST_AVATAR_REVEAL_START_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["minor", "service", "residential", "unclassified", "living_street", "road"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#140B2B",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0.66,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1.1, 15, 3.2, 18, 9.8],
      },
    },
    {
      id: "roads_major_casing",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: ROADS_POST_AVATAR_REVEAL_START_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#160C30",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          1,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 4, 15, 12, 18, 36],
      },
    },
    {
      id: "roads_local_inner",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: ROADS_POST_AVATAR_REVEAL_START_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["minor", "service", "residential", "unclassified", "living_street", "road"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#2A1755",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0.66,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 15, 2.1, 18, 6.8],
      },
    },
    {
      id: "roads_major_inner",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation",
      minzoom: ROADS_POST_AVATAR_REVEAL_START_ZOOM,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#342068",
        "line-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          ROADS_POST_AVATAR_REVEAL_START_ZOOM,
          0,
          ROADS_POST_AVATAR_REVEAL_END_ZOOM,
          0.88,
        ],
        "line-width": ["interpolate", ["linear"], ["zoom"], 12, 2.4, 15, 9.5, 18, 31.5],
      },
    },
    {
      id: "labels_streets",
      type: "symbol",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "transportation_name",
      minzoom: 16,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        [
          "match",
          ["get", "class"],
          ["motorway", "trunk", "primary", "secondary", "tertiary", "minor", "service", "residential", "unclassified", "living_street", "road"],
          true,
          false,
        ],
      ],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 3200,
        "text-field": ["coalesce", ["get", "name_fr"], ["get", "name_en"], ["get", "name"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10, 18.5, 12],
        "text-rotation-alignment": "map",
        "text-pitch-alignment": "map",
        "symbol-z-order": "source",
      },
      paint: {
        "text-color": "#120D26",
        "text-halo-width": 0,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 16, 0, 16.6, 0.72, 18, 0.9],
      },
    },
    {
      id: "grand-paris-commune-fill",
      type: "fill",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: PARIS_LOCAL_MOSAIC_MIN_ZOOM,
      maxzoom: 17.8,
      paint: {
        "fill-color": GRAND_PARIS_GROUND_COLOR_EXPRESSION,
        "fill-opacity": 0.95,
      },
    },
    {
      id: "grand-paris-commune-hitbox",
      type: "fill",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: 10.45,
      maxzoom: 17.8,
      paint: {
        "fill-color": "#FFFFFF",
        "fill-opacity": 0,
      },
    },
    {
      id: "grand-paris-water-overlay",
      type: "fill",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "water",
      minzoom: 10.45,
      maxzoom: 15.6,
      filter: [
        "all",
        ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false],
        LOUVRE_PYRAMID_COURTYARD_WATER_EXCLUSION_FILTER,
      ],
      paint: {
        "fill-color": WATER_COLORS.main,
        "fill-opacity": 1,
        "fill-antialias": true,
      },
    },
    {
      id: "grand-paris-waterway-overlay",
      type: "line",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "waterway",
      minzoom: 11.5,
      maxzoom: 15.6,
      filter: [
        "all",
        ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
        ["match", ["get", "class"], ["river", "canal"], true, false],
      ],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": WATER_COLORS.main,
        "line-opacity": 1,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11.5, 1.4, 14, 4.5, 15.6, 8],
      },
    },
    {
      id: "grand-paris-commune-outline",
      type: "line",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: PARIS_LOCAL_MOSAIC_MIN_ZOOM,
      maxzoom: 15.25,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CREPUSCULE_URBAIN_STROKES.grandParisCommuneSoft,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.45, 0.65, 11.8, 1.25, 13.65, 1.9, 15.25, 1.25],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.45, 0.46, 11.8, 0.72, 13.65, 0.62, 15.25, 0.36],
      },
    },
    {
      id: "grand-paris-commune-hover-line",
      type: "line",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: 10.45,
      maxzoom: 15.25,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CREPUSCULE_URBAIN_STROKES.hover,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          10.45,
          2.7,
          11.8,
          3.8,
          13.65,
          5.6,
          15.25,
          6.2,
        ],
        "line-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.98, 0],
        "line-blur": 0.35,
      },
    },
    {
      id: SEINE_SAINT_DENIS_BOUNDARY_HALO_LAYER_ID,
      type: "line",
      source: SEINE_SAINT_DENIS_BOUNDARY_SOURCE_ID,
      minzoom: 10.35,
      maxzoom: 15.4,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": GRAND_PARIS_FIGMA_STROKES.selected,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.35, 3.4, 12.2, 5.2, 15.4, 4],
        "line-opacity": 0,
        "line-blur": ["interpolate", ["linear"], ["zoom"], 10.35, 1.4, 12.2, 2.2, 15.4, 1.4],
      },
    },
    {
      id: SEINE_SAINT_DENIS_BOUNDARY_LINE_LAYER_ID,
      type: "line",
      source: SEINE_SAINT_DENIS_BOUNDARY_SOURCE_ID,
      minzoom: 10.35,
      maxzoom: 15.4,
      layout: {
        visibility: "none",
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": GRAND_PARIS_FIGMA_STROKES.line,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.35, 1.2, 12.2, 2, 15.4, 1.4],
        "line-opacity": 0,
      },
    },
    {
      id: GRAND_PARIS_ACTIVE_OUTLINE_HALO_LAYER_ID,
      type: "line",
      source: GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID,
      minzoom: 10.35,
      maxzoom: 24,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": GRAND_PARIS_FIGMA_STROKES.selected,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.35, 5.5, 12, 7.6, 15, 9.2, 17.8, 6.4],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.35, 0.22, 12, 0.34, 15, 0.3, 17.8, 0.18],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 10.35, 2.1, 12, 3.2, 15, 4.1, 17.8, 3],
      },
    },
    {
      id: GRAND_PARIS_ACTIVE_OUTLINE_LINE_LAYER_ID,
      type: "line",
      source: GRAND_PARIS_ACTIVE_OUTLINE_SOURCE_ID,
      minzoom: 10.35,
      maxzoom: 24,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#FFFFFF",
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.35, 2.1, 12, 3.2, 15, 4.1, 17.8, 2.8],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.35, 0.82, 12, 0.98, 15, 0.96, 17.8, 0.78],
        "line-blur": 0.12,
      },
    },
    {
      id: "paris-overview-boundary-halo",
      type: "line",
      source: PARIS_OVERVIEW_BOUNDARY_SOURCE_ID,
      minzoom: PARIS_LOCAL_MOSAIC_MIN_ZOOM,
      maxzoom: 13.65,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CREPUSCULE_URBAIN_STROKES.parisOuter,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.45, 2.5, 11.8, 4.5, 13.65, 6],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.45, 0.16, 11.8, 0.3, 13.65, 0.12],
        "line-blur": ["interpolate", ["linear"], ["zoom"], 10.45, 2, 11.8, 3.2, 13.65, 4.5],
      },
    },
    {
      id: "paris-overview-boundary-line",
      type: "line",
      source: PARIS_OVERVIEW_BOUNDARY_SOURCE_ID,
      minzoom: PARIS_LOCAL_MOSAIC_MIN_ZOOM,
      maxzoom: 13.65,
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": CREPUSCULE_URBAIN_STROKES.parisOuter,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10.45, 1, 11.8, 1.65, 13.65, 2.25],
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 10.45, 0.48, 11.8, 0.74, 13.65, 0.28],
      },
    },
    {
      id: FRANCE_URBAN_AREA_SHADOW_LAYER_ID,
      type: "circle",
      source: FRANCE_URBAN_AREAS_SOURCE_ID,
      minzoom: 4.35,
      maxzoom: 10.6,
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": ["coalesce", ["get", "glowColor"], "#7B6DFF"],
        "circle-radius": ["to-number", ["get", "glowRadius"], 14],
        "circle-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.58, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.28, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.58,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.28,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.2,
            0,
          ],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.58,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.28,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.2,
            FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION,
            0.13,
            0,
          ],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.58, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.2, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.13, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.58, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.2, 0.13],
        ], 0.16, true),
        "circle-blur": 0.72,
        "circle-translate": [0, 0],
      },
    },
    {
      id: FRANCE_URBAN_AREA_FILL_LAYER_ID,
      type: "circle",
      source: FRANCE_URBAN_AREAS_SOURCE_ID,
      minzoom: 4.35,
      maxzoom: 10.6,
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": ["coalesce", ["get", "pointColor"], "#C8F6FF"],
        "circle-radius": ["to-number", ["get", "circleRadius"], 5.2],
        "circle-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.96,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.82,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.76,
            0,
          ],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.96,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.82,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.76,
            FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION,
            0.62,
            0,
          ],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.76, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.62, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.76, 0.62],
        ], 0.7, true),
        "circle-stroke-color": [
          "case",
          FRANCE_URBAN_AREA_HOVER_STATE,
          "#FFFFFF",
          "rgba(219, 250, 255, 0.9)",
        ],
        "circle-stroke-width": [
          "case",
          FRANCE_URBAN_AREA_HOVER_STATE,
          1.7,
          ["==", ["get", "pointLevel"], "major"],
          0.95,
          0.58,
        ],
        "circle-stroke-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.96,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.82,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.74,
            0,
          ],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.96,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.82,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.74,
            FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION,
            0.54,
            0,
          ],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.74, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.54, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.96, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.82, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.74, 0.54],
        ], 0.62, true),
        "circle-blur": 0,
      },
    },
    {
      id: FRANCE_URBAN_AREA_OUTLINE_LAYER_ID,
      type: "circle",
      source: FRANCE_URBAN_AREAS_SOURCE_ID,
      minzoom: 4.35,
      maxzoom: 10.6,
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": "rgba(255, 255, 255, 0)",
        "circle-radius": [
          "case",
          ["==", ["get", "pointLevel"], "major"],
          6.6,
          ["==", ["get", "pointLevel"], "secondary"],
          4.4,
          3.1,
        ],
        "circle-stroke-color": [
          "case",
          FRANCE_URBAN_AREA_HOVER_STATE,
          "#F4FEFF",
          "rgba(123, 239, 255, 0.76)",
        ],
        "circle-stroke-width": [
          "case",
          FRANCE_URBAN_AREA_HOVER_STATE,
          1.35,
          0.5,
        ],
        "circle-stroke-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.88,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.36,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.28,
            0,
          ],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.24, 0],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.24, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.28, 0.24],
        ], 0.24, true),
        "circle-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          [
            "case",
            FRANCE_URBAN_AREA_HOVER_STATE,
            0.88,
            FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION,
            0.36,
            FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION,
            0.28,
            0,
          ],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.24, 0],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.28, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.24, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.88, FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.36, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.28, 0.24],
        ], 0.24, true),
        "circle-blur": ["case", FRANCE_URBAN_AREA_HOVER_STATE, 0.14, 0.25],
      },
    },
    {
      id: FRANCE_URBAN_AREA_LABEL_LAYER_ID,
      type: "symbol",
      source: FRANCE_URBAN_AREAS_SOURCE_ID,
      minzoom: 4.35,
      maxzoom: 10.6,
      layout: {
        visibility: "none",
        ...createStablePointLabelLayout({ anchor: "left" }),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, FRANCE_REGION_CITY_LABEL_SIZE_VALUE, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, FRANCE_REGION_CITY_LABEL_SIZE_VALUE, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 10.8, 0],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, FRANCE_REGION_CITY_LABEL_SIZE_VALUE, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 10.8, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 9.4, 0],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, FRANCE_REGION_CITY_LABEL_SIZE_VALUE, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 10.8, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 9.4, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, FRANCE_REGION_CITY_LABEL_SIZE_VALUE, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 10.8, 9.4],
        ], FRANCE_REGION_CITY_LABEL_SIZE_VALUE, false),
        "text-max-width": 10,
        "text-padding": 3,
        "text-letter-spacing": 0,
        "text-offset": [0.72, 0],
        "symbol-sort-key": ["to-number", ["get", "rank"]],
      },
      paint: {
        "text-color": ["case", ["==", ["get", "pointLevel"], "major"], LABEL_COLORS.primary, LABEL_COLORS.secondary],
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": ["case", ["==", ["get", "pointLevel"], "major"], 1.95, ["==", ["get", "pointLevel"], "secondary"], 1.35, 1.1],
        "text-halo-blur": 0.45,
        "text-opacity": withFranceRegionCityCoverageReveal([
          "step",
          ["zoom"],
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.9, 0],
          FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.92, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 0.72, 0],
          FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.94, FRANCE_REGION_CITY_FAR_SECONDARY_REVEAL_CONDITION, 0.78, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.58, 0],
          FRANCE_REGION_CITY_NEAR_SECONDARY_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.95, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.82, FRANCE_REGION_CITY_FAR_LOCAL_REVEAL_CONDITION, 0.62, 0],
          FRANCE_REGION_CITY_NEAR_LOCAL_REVEAL_ZOOM,
          ["case", FRANCE_REGION_CITY_MAJOR_REVEAL_CONDITION, 0.95, FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.82, 0.62],
        ], ["case", FRANCE_REGION_CITY_SECONDARY_REVEAL_CONDITION, 0.76, 0.62], false),
      },
    },
    {
      id: "meewav-place-city-glow",
      type: "circle",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "place",
      minzoom: 6.25,
      maxzoom: 14.4,
      filter: MEEWAV_PLACE_MAJOR_FILTER,
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "class"], "city"],
          "rgba(222, 208, 255, 0.82)",
          ["==", ["get", "class"], "town"],
          "rgba(202, 184, 255, 0.62)",
          "rgba(180, 160, 238, 0.42)",
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.25,
          ["case", ["==", ["get", "class"], "city"], 7, 0],
          9.5,
          ["case", ["==", ["get", "class"], "city"], 13.5, ["==", ["get", "class"], "town"], 7.8, 0],
          11.2,
          ["case", ["==", ["get", "class"], "city"], 10.5, ["==", ["get", "class"], "town"], 6.8, 4.6],
          12.9,
          ["case", ["==", ["get", "class"], "city"], 7.5, ["==", ["get", "class"], "town"], 4.8, 2.8],
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.25,
          ["case", ["==", ["get", "class"], "city"], 0, 0],
          7.6,
          ["case", ["==", ["get", "class"], "city"], 0.42, 0],
          9.4,
          ["case", ["==", ["get", "class"], "city"], 0.36, ["==", ["get", "class"], "town"], 0.26, 0],
          10.9,
          ["case", ["==", ["get", "class"], "city"], 0.24, ["==", ["get", "class"], "town"], 0.18, 0.12],
          12.9,
          ["case", ["==", ["get", "class"], "city"], 0.12, ["==", ["get", "class"], "town"], 0.09, 0.06],
          14.4,
          ["case", ["==", ["get", "class"], "city"], 0.04, ["==", ["get", "class"], "town"], 0.03, 0.02],
        ],
        "circle-blur": 0.78,
      },
    },
    {
      id: "meewav-place-city-core",
      type: "circle",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "place",
      minzoom: 6.6,
      maxzoom: 14.4,
      filter: MEEWAV_PLACE_MAJOR_FILTER,
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "class"], "city"],
          "#FFFFFF",
          ["==", ["get", "class"], "town"],
          "rgba(244, 238, 255, 0.94)",
          "rgba(226, 216, 255, 0.78)",
        ],
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.6,
          ["case", ["==", ["get", "class"], "city"], 2.2, 0],
          9.5,
          ["case", ["==", ["get", "class"], "city"], 4.1, ["==", ["get", "class"], "town"], 2.25, 0],
          11.4,
          ["case", ["==", ["get", "class"], "city"], 3, ["==", ["get", "class"], "town"], 2.1, 1.35],
          12.9,
          ["case", ["==", ["get", "class"], "city"], 2.3, ["==", ["get", "class"], "town"], 1.65, 1.05],
          14.4,
          ["case", ["==", ["get", "class"], "city"], 1.4, ["==", ["get", "class"], "town"], 1.05, 0.72],
        ],
        "circle-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.6,
          ["case", ["==", ["get", "class"], "city"], 0, 0],
          8.2,
          ["case", ["==", ["get", "class"], "city"], 0.98, 0],
          10.2,
          ["case", ["==", ["get", "class"], "city"], 0.94, ["==", ["get", "class"], "town"], 0.84, 0],
          11.8,
          ["case", ["==", ["get", "class"], "city"], 0.78, ["==", ["get", "class"], "town"], 0.62, 0.42],
          12.9,
          ["case", ["==", ["get", "class"], "city"], 0.52, ["==", ["get", "class"], "town"], 0.4, 0.24],
          14.4,
          ["case", ["==", ["get", "class"], "city"], 0.18, ["==", ["get", "class"], "town"], 0.12, 0.08],
        ],
        "circle-stroke-color": "rgba(18, 8, 38, 0.82)",
        "circle-stroke-width": ["case", ["==", ["get", "class"], "city"], 0.8, 0.45],
        "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 6.6, 0, 8.4, 0.68, 12.9, 0.22],
      },
    },
    createTieredNativePlaceCoreLayer({
      id: OPENFREEMAP_PLACE_SECONDARY_CORE_LAYER_ID,
      minzoom: 12.55,
      maxzoom: 14.4,
      filter: MEEWAV_PLACE_SECONDARY_FILTER,
      circleOpacity: 0.58,
      circleRadii: [1.75, 1.4, 1.05],
    }),
    createTieredNativePlaceCoreLayer({
      id: OPENFREEMAP_PLACE_LOCAL_CORE_LAYER_ID,
      minzoom: 13.45,
      maxzoom: 15.15,
      filter: MEEWAV_PLACE_LOCAL_FILTER,
      circleOpacity: 0.42,
      circleRadii: [1.45, 1.15, 0.85],
    }),
    {
      id: "labels_cities",
      type: "symbol",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "place",
      minzoom: 6.95,
      maxzoom: FRANCE_REGIONAL_LABEL_MAX_ZOOM,
      filter: MEEWAV_PLACE_MAJOR_FILTER,
      layout: {
        ...createStablePointLabelLayout({ anchor: "left" }),
        "text-field": ["coalesce", ["get", "name_fr"], ["get", "name"], ["get", "name_en"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.95,
          ["case", ["==", ["get", "class"], "city"], 11.2, 0],
          8.8,
          ["case", ["==", ["get", "class"], "city"], 12.4, ["==", ["get", "class"], "town"], 10.6, 0],
          10.8,
          ["case", ["==", ["get", "class"], "city"], 14.4, ["==", ["get", "class"], "town"], 12, 9.8],
          12.15,
          ["case", ["==", ["get", "class"], "city"], 13.4, ["==", ["get", "class"], "town"], 11.4, 9.4],
          13.65,
          ["case", ["==", ["get", "class"], "city"], 11.8, ["==", ["get", "class"], "town"], 10.2, 8.6],
        ],
        "text-max-width": 8.5,
        "text-padding": 5,
        "text-letter-spacing": 0,
        "text-offset": [0.72, 0],
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
      },
      paint: {
        "text-color": NATIVE_PLACE_LABEL_COLOR,
        "text-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          6.95,
          ["case", ["==", ["get", "class"], "city"], 0, 0],
          8.2,
          ["case", ["==", ["get", "class"], "city"], 0.94, ["==", ["get", "class"], "town"], 0.52, 0.18],
          10.2,
          ["case", ["==", ["get", "class"], "city"], 0.98, ["==", ["get", "class"], "town"], 0.92, 0.7],
          12.15,
          ["case", ["==", ["get", "class"], "city"], 0.84, ["==", ["get", "class"], "town"], 0.72, 0.5],
          13.65,
          ["case", ["==", ["get", "class"], "city"], 0.5, ["==", ["get", "class"], "town"], 0.38, 0.22],
        ],
        "text-halo-color": NATIVE_PLACE_LABEL_HALO_COLOR,
        "text-halo-width": ["case", ["==", ["get", "class"], "city"], 1.15, ["==", ["get", "class"], "town"], 0.85, 0.55],
        "text-halo-blur": 0.75,
      },
    },
    createTieredNativePlaceLabelLayer({
      id: OPENFREEMAP_PLACE_SECONDARY_LABEL_LAYER_ID,
      // Secondary native places are the last OpenFreeMap tier before the
      // deterministic nationwide catalogue becomes authoritative at z11.45.
      minzoom: 9.6,
      maxzoom: FRANCE_REGIONAL_LABEL_MAX_ZOOM,
      filter: MEEWAV_PLACE_SECONDARY_FILTER,
      textPadding: 7,
      textOpacity: 0.7,
      textSizes: [12.2, 10.8, 9.2],
    }),
    createTieredNativePlaceLabelLayer({
      id: OPENFREEMAP_PLACE_LOCAL_LABEL_LAYER_ID,
      minzoom: 13.45,
      maxzoom: 15.15,
      filter: MEEWAV_PLACE_LOCAL_FILTER,
      textPadding: 5,
      textOpacity: 0.56,
      textSizes: [11.4, 10.2, 8.8],
      visibility: "none",
    }),
    {
      id: "labels_districts",
      type: "symbol",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "place",
      minzoom: 11.4,
      maxzoom: 15.15,
      filter: DISABLE_AUTOMATIC_DISTRICT_LABELS_FILTER,
      layout: {
        "text-field": ["coalesce", ["get", "name_fr"], ["get", "name"], ["get", "name_en"]],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11.4, 10.2, 13.4, 12.1, 15.2, 13.2],
        "text-max-width": 9,
        "text-padding": 8,
        "text-transform": "none",
        "text-letter-spacing": 0,
        "symbol-sort-key": ["coalesce", ["get", "rank"], 99],
      },
      paint: {
        "text-color": LABEL_COLORS.primary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": 1.85,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.4, 0, 12.1, 0.54, 14.85, 0.58, 15.15, 0],
      },
    },
    {
      id: "grand-paris-commune-labels",
      type: "symbol",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: 10.75,
      maxzoom: 13.45,
      filter: ["match", ["get", "name"], [...GRAND_PARIS_PRIMARY_COMMUNE_LABELS], true, false],
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 10.75, 11, 11.8, 13.2, 13.45, 14.5],
        "text-max-width": 10,
        "text-padding": 10,
        "text-letter-spacing": 0,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": LABEL_COLORS.primary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": 2.1,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 10.75, 0, 11.2, 0.92, 13.45, 0.9],
      },
    },
    {
      id: "grand-paris-secondary-commune-labels",
      type: "symbol",
      source: GRAND_PARIS_OVERVIEW_SOURCE_ID,
      minzoom: 12.35,
      maxzoom: 13.15,
      filter: [
        "all",
        ["!", ["match", ["get", "name"], [...GRAND_PARIS_PRIMARY_COMMUNE_LABELS], true, false]],
        ["<=", ["get", "rank"], 2],
      ],
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.35, 10.8, 13.15, 12.4],
        "text-max-width": 9,
        "text-padding": 7,
        "text-letter-spacing": 0,
        "symbol-sort-key": ["+", ["get", "rank"], 10],
      },
      paint: {
        "text-color": LABEL_COLORS.secondary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": 1.7,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 12.35, 0, 12.55, 0.58, 13.15, 0.68],
      },
    },
    {
      id: "city-overview-product-labels",
      type: "symbol",
      source: CITY_OVERVIEW_PRODUCT_LABELS_SOURCE_ID,
      minzoom: 11.05,
      maxzoom: 14.2,
      filter: ["<=", ["to-number", ["get", "rank"], 99], 2],
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 11.05, 11.4, 12.15, 13.6, 14.2, 15.2],
        "text-max-width": 10,
        "text-padding": 10,
        "text-letter-spacing": 0,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": LABEL_COLORS.primary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": ["case", ["==", ["get", "rank"], 0], 2.6, 2],
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.05, 0, 11.4, 0.96, 13.8, 0.98, 14.2, 0],
      },
    },
    {
      id: "city-overview-product-labels-local",
      type: "symbol",
      source: CITY_OVERVIEW_PRODUCT_LABELS_SOURCE_ID,
      minzoom: 12.15,
      maxzoom: 14.2,
      filter: [">", ["to-number", ["get", "rank"], 99], 2],
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.15, 11.6, 13.2, 13, 14.2, 14.2],
        "text-max-width": 10,
        "text-padding": 8,
        "text-letter-spacing": 0,
        "symbol-sort-key": ["get", "rank"],
      },
      paint: {
        "text-color": LABEL_COLORS.secondary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": 1.7,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 12.15, 0, 12.35, 0.72, 13.8, 0.86, 14.2, 0],
      },
    },
    {
      id: "labels_countries_zoomed",
      type: "symbol",
      source: OPENFREEMAP_SOURCE_ID,
      "source-layer": "place",
      minzoom: 5.8,
      maxzoom: 8,
      filter: ["all", ["==", ["get", "class"], "country"]],
      layout: {
        "text-field": ["coalesce", ["get", "name_en"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 5.8, 10, 8, 13],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.08,
      },
      paint: {
        "text-color": LABEL_COLORS.secondary,
        "text-opacity": ["interpolate", ["linear"], ["zoom"], 5.8, 0, 6.5, 0.72, 8, 0.84],
        "text-halo-width": 0,
      },
    },
    {
      id: "paris-monuments-labels",
      type: "symbol",
      source: PARIS_MONUMENTS_SOURCE_ID,
      minzoom: 12.5,
      layout: {
        ...createStablePointLabelLayout(),
        "text-field": ["get", "name"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10.5, 15, 13, 17, 15],
        "text-offset": [0, 0],
        "text-font": ["Noto Sans Regular"],
        "text-padding": 3,
      },
      paint: {
        "text-color": LABEL_COLORS.primary,
        "text-halo-color": LABEL_COLORS.halo,
        "text-halo-width": 1.8,
        "text-opacity": 0.95,
      },
    },
  ],
} as const;
