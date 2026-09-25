import type { Map as MapLibreMap } from "maplibre-gl";

export const NICE_TERRAIN_PROTOCOL = "nice-terrain";
export const TERRAIN_DEM_HTTP_TILE_TEMPLATE = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRAIN_DEM_PROTOCOL_TILE_TEMPLATE = `${NICE_TERRAIN_PROTOCOL}://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`;

const NICE_URBAN_TERRAIN_ENABLED = true;
const NICE_CASTLE_HILL_ENABLED = true;
const NICE_MONT_BORON_ENABLED = true;
const NICE_CIMIEZ_ENABLED = true;

type BBox = [number, number, number, number];

export type UrbanTerrainZone = {
  id: string;
  bbox: BBox;
  enabled: boolean;
  terrainInCity: boolean;
  lowAltitudeTerrain: boolean;
  reliefPriority?: 1 | 2;
  terrainStrength?: "flat" | "medium" | "high";
  localReliefPriority?: "high";
};

export type MountainRegionZone = {
  id: string;
  bbox: BBox;
  enabled: boolean;
  exaggeration: number;
};

export type NiceTerrainSubZone = {
  id: "castle_hill" | "mont_boron" | "cimiez";
  bbox: BBox;
  enabled: boolean;
  exaggeration: number;
};

type RoadTerraceAxis = {
  exitDeltaMeters: number;
  exitMarginMeters: number;
  fullDeltaMeters: number;
  fullMarginMeters: number;
  points: ReadonlyArray<readonly [number, number]>;
  strength: number;
  targetElevation: number;
};

export const urbanTerrainZones: readonly UrbanTerrainZone[] = [
  {
    id: "nice_hills",
    bbox: [6.80, 43.40, 7.80, 44.00],
    enabled: NICE_URBAN_TERRAIN_ENABLED,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "medium",
    localReliefPriority: "high",
  },
  {
    id: "saint_claude_jura",
    bbox: [5.40, 46.00, 6.30, 46.80],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "high",
  },
  {
    id: "albertville_valley",
    bbox: [6.25, 45.58, 6.55, 45.78],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "high",
  },
  {
    id: "lyon_fourviere",
    bbox: [4.802, 45.748, 4.837, 45.776],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "medium",
  },
  {
    id: "lyon_croix_rousse",
    bbox: [4.812, 45.766, 4.845, 45.790],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "medium",
  },
  {
    id: "lyon_mont_d_or",
    bbox: [4.745, 45.815, 4.875, 45.900],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "medium",
  },
  {
    id: "lyon_central_valley",
    bbox: [4.805, 45.715, 4.885, 45.805],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: false,
    terrainStrength: "flat",
  },
  {
    id: "paris_flat",
    bbox: [2.20, 48.80, 2.50, 48.90],
    enabled: true,
    terrainInCity: false,
    lowAltitudeTerrain: false,
  },
];

// Manual whitelist only. Do not infer premium relief from mountain regions or commune altitude.
export const premiumReliefZones: readonly UrbanTerrainZone[] = [
  {
    id: "nice_hills",
    bbox: [7.15, 43.62, 7.36, 43.78],
    enabled: NICE_URBAN_TERRAIN_ENABLED,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
    localReliefPriority: "high",
  },
  {
    id: "saint_claude_jura",
    bbox: [5.78, 46.34, 5.96, 46.44],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "lyon_fourviere",
    bbox: [4.802, 45.748, 4.837, 45.776],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "lyon_croix_rousse",
    bbox: [4.812, 45.766, 4.845, 45.790],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "lyon_mont_d_or",
    bbox: [4.745, 45.815, 4.875, 45.900],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "lyon_central_valley",
    bbox: [4.805, 45.715, 4.885, 45.805],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "flat",
  },
  {
    id: "grenoble_center_bowl",
    bbox: [5.670, 45.155, 5.770, 45.215],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "grenoble_bastille",
    bbox: [5.700, 45.185, 5.780, 45.240],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "grenoble_west_bowl",
    bbox: [5.635, 45.145, 5.710, 45.215],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "grenoble_la_tronche",
    bbox: [5.725, 45.180, 5.800, 45.235],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "chamonix_mont_blanc",
    bbox: [6.78, 45.86, 7.08, 46.02],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 2,
    terrainStrength: "high",
  },
  {
    id: "annecy_alps",
    bbox: [6.02, 45.82, 6.24, 46.00],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "chambery_aix_bourget",
    bbox: [5.80, 45.48, 5.98, 45.78],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "albertville_valley",
    bbox: [6.30, 45.62, 6.50, 45.75],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "gap_alps",
    bbox: [5.95, 44.48, 6.20, 44.64],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 2,
    terrainStrength: "high",
  },
  {
    id: "briancon_alps",
    bbox: [6.56, 44.84, 6.72, 44.94],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 2,
    terrainStrength: "high",
  },
  {
    id: "pau_pyrenees",
    bbox: [-0.52, 43.24, -0.22, 43.40],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 2,
    terrainStrength: "medium",
  },
  {
    id: "lourdes_pyrenees",
    bbox: [-0.14, 43.04, 0.04, 43.14],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 2,
    terrainStrength: "high",
  },
  {
    id: "clermont_ferrand_volcans",
    bbox: [3.00, 45.70, 3.22, 45.86],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "marseille_notre_dame_garde",
    bbox: [5.350, 43.270, 5.390, 43.300],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "marseille_vieux_port_panier",
    bbox: [5.350, 43.285, 5.392, 43.318],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "marseille_calanques_edge",
    bbox: [5.365, 43.205, 5.455, 43.270],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "toulon_mont_faron",
    bbox: [5.875, 43.105, 5.980, 43.175],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
  {
    id: "besancon_citadelle",
    bbox: [5.985, 47.220, 6.055, 47.260],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "medium",
  },
  {
    id: "le_puy_en_velay",
    bbox: [3.860, 45.020, 3.910, 45.060],
    enabled: true,
    terrainInCity: true,
    lowAltitudeTerrain: true,
    reliefPriority: 1,
    terrainStrength: "high",
  },
];

export const mountainRegionZones: readonly MountainRegionZone[] = [
  {
    id: "alps_southeast",
    bbox: [4.80, 43.00, 7.90, 46.40],
    enabled: false,
    exaggeration: 1.35,
  },
  {
    id: "jura_region",
    bbox: [5.40, 46.00, 6.30, 46.80],
    enabled: false,
    exaggeration: 1.45,
  },
  {
    id: "pyrenees",
    bbox: [-1.80, 42.35, 3.20, 43.35],
    enabled: false,
    exaggeration: 1.35,
  },
  {
    id: "massif_central",
    bbox: [1.20, 44.10, 4.60, 46.40],
    enabled: false,
    exaggeration: 1.22,
  },
  {
    id: "corsica",
    bbox: [8.45, 41.30, 9.65, 43.05],
    enabled: false,
    exaggeration: 1.32,
  },
];

export const niceSubZones: readonly NiceTerrainSubZone[] = [
  {
    id: "castle_hill",
    enabled: NICE_CASTLE_HILL_ENABLED,
    bbox: [7.271, 43.690, 7.283, 43.701],
    exaggeration: 1.95,
  },
  {
    id: "mont_boron",
    enabled: NICE_MONT_BORON_ENABLED,
    bbox: [7.284, 43.675, 7.316, 43.710],
    exaggeration: 1.75,
  },
  {
    id: "cimiez",
    enabled: NICE_CIMIEZ_ENABLED,
    bbox: [7.255, 43.705, 7.290, 43.735],
    exaggeration: 1.55,
  },
];

const shorelinePoints = [
  { lng: 7.15, lat: 43.630 },
  { lng: 7.20, lat: 43.658 },
  { lng: 7.23, lat: 43.672 },
  { lng: 7.26, lat: 43.686 },
  { lng: 7.275, lat: 43.691 },
  { lng: 7.285, lat: 43.689 },
  { lng: 7.305, lat: 43.683 },
  { lng: 7.325, lat: 43.688 },
  { lng: 7.335, lat: 43.668 },
  { lng: 7.370, lat: 43.695 },
] as const;

const lyonRiverAxes = [
  [
    [4.815, 45.802],
    [4.815, 45.780],
    [4.818, 45.760],
    [4.822, 45.742],
    [4.822, 45.725],
  ],
  [
    [4.841, 45.800],
    [4.846, 45.776],
    [4.845, 45.756],
    [4.838, 45.736],
    [4.831, 45.718],
  ],
] as const satisfies ReadonlyArray<ReadonlyArray<readonly [number, number]>>;

const niceMainRoadTerraceAxes = [
  {
    points: [[7.190, 43.650], [7.230, 43.672], [7.265, 43.686], [7.296, 43.690]],
    targetElevation: 8,
    fullMarginMeters: 130,
    exitMarginMeters: 260,
    fullDeltaMeters: 24,
    exitDeltaMeters: 70,
    strength: 0.95,
  },
  {
    points: [[7.262, 43.684], [7.270, 43.696], [7.279, 43.710], [7.286, 43.724]],
    targetElevation: 24,
    fullMarginMeters: 120,
    exitMarginMeters: 260,
    fullDeltaMeters: 32,
    exitDeltaMeters: 90,
    strength: 0.9,
  },
  {
    points: [[7.274, 43.689], [7.282, 43.695], [7.289, 43.704]],
    targetElevation: 36,
    fullMarginMeters: 115,
    exitMarginMeters: 240,
    fullDeltaMeters: 42,
    exitDeltaMeters: 110,
    strength: 0.86,
  },
  {
    points: [[7.287, 43.687], [7.302, 43.696], [7.318, 43.704]],
    targetElevation: 72,
    fullMarginMeters: 120,
    exitMarginMeters: 250,
    fullDeltaMeters: 46,
    exitDeltaMeters: 125,
    strength: 0.88,
  },
  {
    points: [[7.286, 43.698], [7.298, 43.704], [7.311, 43.712], [7.326, 43.721]],
    targetElevation: 185,
    fullMarginMeters: 58,
    exitMarginMeters: 150,
    fullDeltaMeters: 80,
    exitDeltaMeters: 210,
    strength: 0.56,
  },
  {
    points: [[7.300, 43.705], [7.314, 43.713], [7.329, 43.724], [7.346, 43.732]],
    targetElevation: 235,
    fullMarginMeters: 54,
    exitMarginMeters: 142,
    fullDeltaMeters: 86,
    exitDeltaMeters: 225,
    strength: 0.52,
  },
  {
    points: [[7.292, 43.716], [7.306, 43.722], [7.323, 43.730], [7.340, 43.739]],
    targetElevation: 285,
    fullMarginMeters: 48,
    exitMarginMeters: 128,
    fullDeltaMeters: 92,
    exitDeltaMeters: 240,
    strength: 0.46,
  },
] as const satisfies readonly RoadTerraceAxis[];

const grenobleMainRoadTerraceAxes = [
  {
    points: [[5.660, 45.190], [5.690, 45.191], [5.722, 45.198], [5.760, 45.205], [5.800, 45.205]],
    targetElevation: 215,
    fullMarginMeters: 360,
    exitMarginMeters: 820,
    fullDeltaMeters: 58,
    exitDeltaMeters: 165,
    strength: 0.94,
  },
  {
    points: [[5.675, 45.184], [5.705, 45.190], [5.735, 45.199], [5.775, 45.200]],
    targetElevation: 216,
    fullMarginMeters: 260,
    exitMarginMeters: 620,
    fullDeltaMeters: 55,
    exitDeltaMeters: 150,
    strength: 0.9,
  },
  {
    points: [[5.720, 45.178], [5.738, 45.194], [5.756, 45.210], [5.776, 45.230]],
    targetElevation: 250,
    fullMarginMeters: 245,
    exitMarginMeters: 620,
    fullDeltaMeters: 115,
    exitDeltaMeters: 285,
    strength: 0.9,
  },
  {
    points: [[5.690, 45.198], [5.710, 45.205], [5.735, 45.214], [5.760, 45.224]],
    targetElevation: 245,
    fullMarginMeters: 220,
    exitMarginMeters: 560,
    fullDeltaMeters: 105,
    exitDeltaMeters: 265,
    strength: 0.88,
  },
] as const satisfies readonly RoadTerraceAxis[];

const juraSaintClaudeValleyAxis = [
  [5.835, 46.410],
  [5.850, 46.397],
  [5.866, 46.386],
  [5.887, 46.377],
  [5.910, 46.366],
] as const satisfies ReadonlyArray<readonly [number, number]>;

const NICE_DEM_PROCESSING_BBOX: BBox = [7.10, 43.65, 7.45, 43.82];
const JURA_DEM_PROCESSING_BBOX: BBox = [5.40, 46.00, 6.30, 46.80];
const GRENOBLE_DEM_PROCESSING_BBOX: BBox = [5.62, 45.13, 5.82, 45.24];
const GRENOBLE_CENTRAL_VALLEY_BBOX: BBox = [5.665, 45.158, 5.790, 45.216];
const GRENOBLE_CENTRAL_VALLEY_EDGE_FEATHER_DEGREES = 0.0065;
const GRENOBLE_CENTRAL_VALLEY_TERRACE_METERS = 215;
const GRENOBLE_CENTRAL_VALLEY_FULL_DELTA_METERS = 92;
const GRENOBLE_CENTRAL_VALLEY_EXIT_DELTA_METERS = 235;
const GRENOBLE_CENTRAL_VALLEY_STRENGTH = 0.985;
const LYON_DEM_PROCESSING_BBOX: BBox = [4.76, 45.70, 4.90, 45.82];
const LYON_CENTRAL_VALLEY_BBOX: BBox = [4.805, 45.715, 4.885, 45.805];
const LYON_CENTRAL_VALLEY_EDGE_FEATHER_DEGREES = 0.006;
const LYON_CENTRAL_VALLEY_TERRACE_METERS = 170;
const LYON_CENTRAL_VALLEY_FULL_DELTA_METERS = 62;
const LYON_CENTRAL_VALLEY_EXIT_DELTA_METERS = 112;
const LYON_CENTRAL_VALLEY_STRENGTH = 0.985;
const LYON_RIVER_CORRIDOR_BBOX: BBox = [4.805, 45.715, 4.865, 45.795];
const LYON_RIVER_CORRIDOR_EDGE_FEATHER_DEGREES = 0.009;
const LYON_RIVER_TERRACE_FULL_MARGIN_METERS = 430;
const LYON_RIVER_TERRACE_EXIT_MARGIN_METERS = 760;
const LYON_RIVER_TERRACE_METERS = 170;
const LYON_RIVER_TERRACE_FULL_DELTA_METERS = 26;
const LYON_RIVER_TERRACE_EXIT_DELTA_METERS = 72;
const LYON_RIVER_TERRACE_STRENGTH = 0.96;
const JURA_CITY_TERRACES_ENABLED = false;
const JURA_SAINT_CLAUDE_TERRACES_BBOX: BBox = [5.79, 46.35, 5.94, 46.43];
const JURA_CITY_TERRACE_EDGE_FEATHER_DEGREES = 0.006;
const JURA_VALLEY_FULL_MARGIN_METERS = 620;
const JURA_VALLEY_EXIT_MARGIN_METERS = 1550;
const JURA_VALLEY_START_METERS = 500;
const JURA_VALLEY_END_METERS = 430;
const JURA_VALLEY_SIDE_RISE_METERS = 120;
const JURA_VALLEY_STRENGTH = 0.94;
const JURA_CITY_LOWER_TERRACE_METERS = 455;
const JURA_CITY_UPPER_TERRACE_METERS = 540;
const JURA_CITY_MIN_TERRACE_METERS = 390;
const JURA_CITY_LOWER_MAX_METERS = 500;
const JURA_CITY_UPPER_MIN_METERS = 525;
const JURA_CITY_UPPER_MAX_METERS = 650;
const JURA_CITY_TERRACE_ALTITUDE_FEATHER_METERS = 28;
const NICE_MAETERLINCK_TERRACES_ENABLED = false;
const NICE_MAETERLINCK_TERRACES_BBOX: BBox = [7.288, 43.684, 7.318, 43.705];
const NICE_MAETERLINCK_TERRACE_EDGE_FEATHER_DEGREES = 0.0022;
const NICE_MAETERLINCK_LOWER_TERRACE_METERS = 38;
const NICE_MAETERLINCK_UPPER_TERRACE_METERS = 86;
const NICE_MAETERLINCK_LOWER_MAX_METERS = 58;
const NICE_MAETERLINCK_UPPER_MIN_METERS = 76;
const NICE_MAETERLINCK_UPPER_MAX_METERS = 128;
const NICE_MAETERLINCK_TERRACE_ALTITUDE_FEATHER_METERS = 12;

let niceTerrainProtocolRegistered = false;

function isInBBox(lng: number, lat: number, bbox: BBox) {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
}

function bboxIntersects(a: BBox, b: BBox) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function getShorelineLat(lng: number) {
  for (let index = 0; index < shorelinePoints.length - 1; index += 1) {
    const p1 = shorelinePoints[index];
    const p2 = shorelinePoints[index + 1];
    if (lng >= p1.lng && lng <= p2.lng) {
      const t = (lng - p1.lng) / (p2.lng - p1.lng);
      return p1.lat + t * (p2.lat - p1.lat);
    }
  }

  return 43.68;
}

function isCoordinateInSea(lng: number, lat: number) {
  if (lat < 43.60) return true;
  if (lat > 43.72) return false;
  return lat < getShorelineLat(lng);
}

function tileToBBox(x: number, y: number, z: number): BBox {
  const lngMin = (x / 2 ** z) * 360 - 180;
  const lngMax = ((x + 1) / 2 ** z) * 360 - 180;
  const nMin = Math.PI - (2 * Math.PI * y) / 2 ** z;
  const latMax = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nMin) - Math.exp(-nMin)));
  const nMax = Math.PI - (2 * Math.PI * (y + 1)) / 2 ** z;
  const latMin = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nMax) - Math.exp(-nMax)));
  return [lngMin, latMin, lngMax, latMax];
}

function tilePixelToLngLat(x: number, y: number, z: number, px: number, py: number, tileSize = 256) {
  const n = Math.PI - (2 * Math.PI * (y + py / tileSize)) / 2 ** z;
  const lng = ((x + px / tileSize) / 2 ** z) * 360 - 180;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lng, lat };
}

function encodeTerrariumElevation(elevation: number, data: Uint8ClampedArray, index: number) {
  const encoded = elevation + 32768;
  data[index] = Math.floor(encoded / 256);
  data[index + 1] = Math.floor(encoded % 256);
  data[index + 2] = Math.floor((encoded % 1) * 256);
}

function smoothStep(t: number) {
  return t * t * (3 - 2 * t);
}

function getMetersPerLngDegreeAtLat(lat: number) {
  return 111_320 * Math.cos(lat * Math.PI / 180);
}

function getPointToSegmentDistanceMeters(
  lng: number,
  lat: number,
  start: readonly [number, number],
  end: readonly [number, number],
) {
  const metersPerLng = getMetersPerLngDegreeAtLat(lat);
  const pointX = lng * metersPerLng;
  const pointY = lat * 110_540;
  const startX = start[0] * metersPerLng;
  const startY = start[1] * 110_540;
  const endX = end[0] * metersPerLng;
  const endY = end[1] * 110_540;
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;

  if (segmentLengthSq <= 0) {
    return Math.hypot(pointX - startX, pointY - startY);
  }

  const t = Math.max(0, Math.min(
    ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSq,
    1,
  ));
  const projectionX = startX + segmentX * t;
  const projectionY = startY + segmentY * t;
  return Math.hypot(pointX - projectionX, pointY - projectionY);
}

function getSegmentLengthMeters(
  start: readonly [number, number],
  end: readonly [number, number],
  lat: number,
) {
  const metersPerLng = getMetersPerLngDegreeAtLat(lat);
  return Math.hypot(
    (end[0] - start[0]) * metersPerLng,
    (end[1] - start[1]) * 110_540,
  );
}

function getPolylineProjectionMeters(
  lng: number,
  lat: number,
  points: ReadonlyArray<readonly [number, number]>,
) {
  const metersPerLng = getMetersPerLngDegreeAtLat(lat);
  const pointX = lng * metersPerLng;
  const pointY = lat * 110_540;
  let bestDistance = Infinity;
  let bestLengthAlong = 0;
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const startX = start[0] * metersPerLng;
    const startY = start[1] * 110_540;
    const endX = end[0] * metersPerLng;
    const endY = end[1] * 110_540;
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLength = getSegmentLengthMeters(start, end, lat);
    const segmentLengthSq = segmentX * segmentX + segmentY * segmentY;
    const t = segmentLengthSq <= 0
      ? 0
      : Math.max(0, Math.min(
        ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / segmentLengthSq,
        1,
      ));
    const projectionX = startX + segmentX * t;
    const projectionY = startY + segmentY * t;
    const distance = Math.hypot(pointX - projectionX, pointY - projectionY);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestLengthAlong = totalLength + segmentLength * t;
    }

    totalLength += segmentLength;
  }

  return {
    distanceMeters: bestDistance,
    progress: totalLength > 0 ? Math.max(0, Math.min(bestLengthAlong / totalLength, 1)) : 0,
  };
}

function getDistanceToPolylineMeters(
  lng: number,
  lat: number,
  points: ReadonlyArray<readonly [number, number]>,
) {
  let distance = Infinity;

  for (let index = 0; index < points.length - 1; index += 1) {
    distance = Math.min(
      distance,
      getPointToSegmentDistanceMeters(lng, lat, points[index], points[index + 1]),
    );
  }

  return distance;
}

function getBBoxFeatherBlend(lng: number, lat: number, bbox: BBox, featherDegrees: number) {
  if (!isInBBox(lng, lat, bbox)) return 0;

  const [west, south, east, north] = bbox;
  const edgeDistance = Math.min(
    lng - west,
    east - lng,
    lat - south,
    north - lat,
  );

  return smoothStep(Math.max(0, Math.min(edgeDistance / featherDegrees, 1)));
}

function blendToTerrace(elevation: number, targetElevation: number, strength: number) {
  return elevation + (targetElevation - elevation) * strength;
}

function flattenRoadTerraceAxes(
  lng: number,
  lat: number,
  elevation: number,
  bbox: BBox,
  bboxFeatherDegrees: number,
  axes: readonly RoadTerraceAxis[],
) {
  const edgeBlend = getBBoxFeatherBlend(lng, lat, bbox, bboxFeatherDegrees);
  if (edgeBlend <= 0) return elevation;

  let nextElevation = elevation;

  for (const axis of axes) {
    const distanceToRoad = getDistanceToPolylineMeters(lng, lat, axis.points);
    if (distanceToRoad >= axis.exitMarginMeters) continue;

    const distanceBlend = distanceToRoad <= axis.fullMarginMeters
      ? 1
      : 1 - smoothStep(
        (distanceToRoad - axis.fullMarginMeters) /
          (axis.exitMarginMeters - axis.fullMarginMeters),
      );
    const terraceDelta = Math.abs(elevation - axis.targetElevation);
    const altitudeBlend = terraceDelta <= axis.fullDeltaMeters
      ? 1
      : terraceDelta >= axis.exitDeltaMeters
        ? 0
        : 1 - smoothStep(
          (terraceDelta - axis.fullDeltaMeters) /
            (axis.exitDeltaMeters - axis.fullDeltaMeters),
        );
    const strength = axis.strength * edgeBlend * distanceBlend * altitudeBlend;

    if (strength > 0) {
      nextElevation = blendToTerrace(nextElevation, axis.targetElevation, strength);
    }
  }

  return nextElevation;
}

function flattenLyonRiverCorridor(lng: number, lat: number, elevation: number) {
  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    LYON_RIVER_CORRIDOR_BBOX,
    LYON_RIVER_CORRIDOR_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;

  const distanceToRiver = Math.min(
    ...lyonRiverAxes.map((axis) => getDistanceToPolylineMeters(lng, lat, axis)),
  );
  if (distanceToRiver >= LYON_RIVER_TERRACE_EXIT_MARGIN_METERS) return elevation;

  const distanceBlend = distanceToRiver <= LYON_RIVER_TERRACE_FULL_MARGIN_METERS
    ? 1
    : 1 - smoothStep(
      (distanceToRiver - LYON_RIVER_TERRACE_FULL_MARGIN_METERS) /
        (LYON_RIVER_TERRACE_EXIT_MARGIN_METERS - LYON_RIVER_TERRACE_FULL_MARGIN_METERS),
    );
  const terraceDelta = Math.abs(elevation - LYON_RIVER_TERRACE_METERS);
  const altitudeBlend = terraceDelta <= LYON_RIVER_TERRACE_FULL_DELTA_METERS
    ? 1
    : terraceDelta >= LYON_RIVER_TERRACE_EXIT_DELTA_METERS
      ? 0
      : 1 - smoothStep(
        (terraceDelta - LYON_RIVER_TERRACE_FULL_DELTA_METERS) /
          (LYON_RIVER_TERRACE_EXIT_DELTA_METERS - LYON_RIVER_TERRACE_FULL_DELTA_METERS),
      );
  const strength = LYON_RIVER_TERRACE_STRENGTH * edgeBlend * distanceBlend * altitudeBlend;

  if (strength <= 0) return elevation;
  return blendToTerrace(elevation, LYON_RIVER_TERRACE_METERS, strength);
}

function flattenLyonCentralValley(lng: number, lat: number, elevation: number) {
  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    LYON_CENTRAL_VALLEY_BBOX,
    LYON_CENTRAL_VALLEY_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;

  const terraceDelta = Math.abs(elevation - LYON_CENTRAL_VALLEY_TERRACE_METERS);
  const altitudeBlend = terraceDelta <= LYON_CENTRAL_VALLEY_FULL_DELTA_METERS
    ? 1
    : terraceDelta >= LYON_CENTRAL_VALLEY_EXIT_DELTA_METERS
      ? 0
      : 1 - smoothStep(
        (terraceDelta - LYON_CENTRAL_VALLEY_FULL_DELTA_METERS) /
          (LYON_CENTRAL_VALLEY_EXIT_DELTA_METERS - LYON_CENTRAL_VALLEY_FULL_DELTA_METERS),
      );
  const strength = LYON_CENTRAL_VALLEY_STRENGTH * edgeBlend * altitudeBlend;

  if (strength <= 0) return elevation;
  return blendToTerrace(elevation, LYON_CENTRAL_VALLEY_TERRACE_METERS, strength);
}

function flattenGrenobleCentralValley(lng: number, lat: number, elevation: number) {
  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    GRENOBLE_CENTRAL_VALLEY_BBOX,
    GRENOBLE_CENTRAL_VALLEY_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;

  const terraceDelta = Math.abs(elevation - GRENOBLE_CENTRAL_VALLEY_TERRACE_METERS);
  const altitudeBlend = terraceDelta <= GRENOBLE_CENTRAL_VALLEY_FULL_DELTA_METERS
    ? 1
    : terraceDelta >= GRENOBLE_CENTRAL_VALLEY_EXIT_DELTA_METERS
      ? 0
      : 1 - smoothStep(
        (terraceDelta - GRENOBLE_CENTRAL_VALLEY_FULL_DELTA_METERS) /
          (GRENOBLE_CENTRAL_VALLEY_EXIT_DELTA_METERS - GRENOBLE_CENTRAL_VALLEY_FULL_DELTA_METERS),
      );
  const strength = GRENOBLE_CENTRAL_VALLEY_STRENGTH * edgeBlend * altitudeBlend;

  if (strength <= 0) return elevation;
  return blendToTerrace(elevation, GRENOBLE_CENTRAL_VALLEY_TERRACE_METERS, strength);
}

function flattenJuraSaintClaudeValley(lng: number, lat: number, elevation: number) {
  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    JURA_SAINT_CLAUDE_TERRACES_BBOX,
    JURA_CITY_TERRACE_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;

  const projection = getPolylineProjectionMeters(lng, lat, juraSaintClaudeValleyAxis);
  if (projection.distanceMeters >= JURA_VALLEY_EXIT_MARGIN_METERS) return elevation;

  const distanceExit = projection.distanceMeters <= JURA_VALLEY_FULL_MARGIN_METERS
    ? 0
    : smoothStep(
      (projection.distanceMeters - JURA_VALLEY_FULL_MARGIN_METERS) /
        (JURA_VALLEY_EXIT_MARGIN_METERS - JURA_VALLEY_FULL_MARGIN_METERS),
    );
  const valleyFloor = JURA_VALLEY_START_METERS +
    (JURA_VALLEY_END_METERS - JURA_VALLEY_START_METERS) * projection.progress;
  const valleyTarget = valleyFloor + JURA_VALLEY_SIDE_RISE_METERS * distanceExit;
  const strength = JURA_VALLEY_STRENGTH * edgeBlend * (1 - distanceExit * 0.28);

  return blendToTerrace(elevation, valleyTarget, strength);
}

function flattenJuraCityTerraces(lng: number, lat: number, elevation: number) {
  if (!JURA_CITY_TERRACES_ENABLED) return elevation;

  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    JURA_SAINT_CLAUDE_TERRACES_BBOX,
    JURA_CITY_TERRACE_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;
  if (elevation <= JURA_CITY_MIN_TERRACE_METERS) return elevation;

  let terracedElevation = elevation;

  if (elevation <= JURA_CITY_LOWER_MAX_METERS) {
    const lowBlend = smoothStep(Math.max(0, Math.min(
      (elevation - JURA_CITY_MIN_TERRACE_METERS) /
        (JURA_CITY_LOWER_MAX_METERS - JURA_CITY_MIN_TERRACE_METERS),
      1,
    )));
    terracedElevation = blendToTerrace(
      elevation,
      JURA_CITY_LOWER_TERRACE_METERS,
      0.88 * lowBlend,
    );
  } else if (elevation < JURA_CITY_UPPER_MIN_METERS) {
    const transition = smoothStep(
      (elevation - JURA_CITY_LOWER_MAX_METERS) /
        (JURA_CITY_UPPER_MIN_METERS - JURA_CITY_LOWER_MAX_METERS),
    );
    const transitionTarget = JURA_CITY_LOWER_TERRACE_METERS +
      (JURA_CITY_UPPER_TERRACE_METERS - JURA_CITY_LOWER_TERRACE_METERS) * transition;
    terracedElevation = blendToTerrace(elevation, transitionTarget, 0.82);
  } else if (elevation <= JURA_CITY_UPPER_MAX_METERS) {
    const upperExitBlend = smoothStep(Math.max(0, Math.min(
      (JURA_CITY_UPPER_MAX_METERS - elevation) / JURA_CITY_TERRACE_ALTITUDE_FEATHER_METERS,
      1,
    )));
    const upperBlend = 0.56 + upperExitBlend * 0.3;
    terracedElevation = blendToTerrace(
      elevation,
      JURA_CITY_UPPER_TERRACE_METERS,
      upperBlend,
    );
  } else {
    const mountainBlend = smoothStep(Math.max(0, Math.min(
      (elevation - JURA_CITY_UPPER_MAX_METERS) / 90,
      1,
    )));
    terracedElevation = blendToTerrace(
      elevation,
      JURA_CITY_UPPER_TERRACE_METERS,
      0.42 * (1 - mountainBlend),
    );
  }

  return elevation + (terracedElevation - elevation) * edgeBlend;
}

function flattenNiceMaeterlinckTerraces(lng: number, lat: number, elevation: number) {
  if (!NICE_MAETERLINCK_TERRACES_ENABLED) return elevation;

  const edgeBlend = getBBoxFeatherBlend(
    lng,
    lat,
    NICE_MAETERLINCK_TERRACES_BBOX,
    NICE_MAETERLINCK_TERRACE_EDGE_FEATHER_DEGREES,
  );
  if (edgeBlend <= 0) return elevation;
  if (elevation <= 8) return elevation;

  let terracedElevation = elevation;

  if (elevation <= NICE_MAETERLINCK_LOWER_MAX_METERS) {
    const lowSeaBlend = smoothStep(Math.max(0, Math.min((elevation - 8) / 12, 1)));
    terracedElevation = blendToTerrace(
      elevation,
      NICE_MAETERLINCK_LOWER_TERRACE_METERS,
      0.92 * lowSeaBlend,
    );
  } else if (elevation < NICE_MAETERLINCK_UPPER_MIN_METERS) {
    const transition = smoothStep(
      (elevation - NICE_MAETERLINCK_LOWER_MAX_METERS) /
        (NICE_MAETERLINCK_UPPER_MIN_METERS - NICE_MAETERLINCK_LOWER_MAX_METERS),
    );
    const transitionTarget = NICE_MAETERLINCK_LOWER_TERRACE_METERS +
      (NICE_MAETERLINCK_UPPER_TERRACE_METERS - NICE_MAETERLINCK_LOWER_TERRACE_METERS) * transition;
    terracedElevation = blendToTerrace(elevation, transitionTarget, 0.86);
  } else if (elevation <= NICE_MAETERLINCK_UPPER_MAX_METERS) {
    const upperExitBlend = smoothStep(Math.max(0, Math.min(
      (NICE_MAETERLINCK_UPPER_MAX_METERS - elevation) / NICE_MAETERLINCK_TERRACE_ALTITUDE_FEATHER_METERS,
      1,
    )));
    const upperBlend = 0.58 + upperExitBlend * 0.32;
    terracedElevation = blendToTerrace(
      elevation,
      NICE_MAETERLINCK_UPPER_TERRACE_METERS,
      0.9 * upperBlend,
    );
  } else {
    const mountainBlend = smoothStep(Math.max(0, Math.min(
      (elevation - NICE_MAETERLINCK_UPPER_MAX_METERS) / 42,
      1,
    )));
    terracedElevation = blendToTerrace(
      elevation,
      NICE_MAETERLINCK_UPPER_TERRACE_METERS,
      0.58 * (1 - mountainBlend),
    );
  }

  return elevation + (terracedElevation - elevation) * edgeBlend;
}

async function blobToPngArrayBuffer(canvas: OffscreenCanvas | HTMLCanvasElement) {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer();
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    (canvas as HTMLCanvasElement).toBlob(resolve, "image/png");
  });

  if (!blob) {
    throw new Error("Failed to pack terrain canvas");
  }

  return blob.arrayBuffer();
}

async function fetchRawTile(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  return { data: await response.arrayBuffer() };
}

export type ReliefZoneState = 'COLD' | 'WARM' | 'ACTIVE';

export type ReliefZone = {
  id: string;
  label: string;
  center: [number, number]; // lng, lat
  bbox: [number, number, number, number];
  priority: number;
  lod: 'LOW' | 'MEDIUM' | 'HIGH';
  state: ReliefZoneState;
  sourceId: string;
  layerId: string;
};

export const NICE_RELIEF_ZONES: ReliefZone[] = [
  {
    id: 'nice_core',
    label: 'Nice centre',
    center: [7.265, 43.700],
    bbox: [7.200, 43.680, 7.280, 43.730],
    priority: 1,
    lod: 'HIGH',
    state: 'COLD',
    sourceId: 'relief-nice-core',
    layerId: 'relief-nice-core-layer',
  },
  {
    id: 'nice_castle_hill',
    label: 'Colline du Château',
    center: [7.277, 43.695],
    bbox: [7.271, 43.690, 7.283, 43.701],
    priority: 1,
    lod: 'HIGH',
    state: 'COLD',
    sourceId: 'relief-nice-castle-hill',
    layerId: 'relief-nice-castle-hill-layer',
  },
  {
    id: 'mont_boron',
    label: 'Mont Boron',
    center: [7.300, 43.692],
    bbox: [7.284, 43.675, 7.316, 43.710],
    priority: 1,
    lod: 'HIGH',
    state: 'COLD',
    sourceId: 'relief-mont-boron',
    layerId: 'relief-mont-boron-layer',
  },
  {
    id: 'villefranche_eze',
    label: 'Villefranche / Èze',
    center: [7.340, 43.720],
    bbox: [7.290, 43.680, 7.400, 43.750],
    priority: 2,
    lod: 'MEDIUM',
    state: 'COLD',
    sourceId: 'relief-villefranche-eze',
    layerId: 'relief-villefranche-eze-layer',
  },
  {
    id: 'nice_backcountry_far',
    label: 'Arrière-pays lointain',
    center: [7.280, 43.770],
    bbox: [7.100, 43.730, 7.450, 43.820],
    priority: 3,
    lod: 'LOW',
    state: 'COLD',
    sourceId: 'relief-nice-backcountry-far',
    layerId: 'relief-nice-backcountry-far-layer',
  }
];

export const rawDemTileCache = new Map<string, ImageBitmap>();

export function clearRawDemTileCache() {
  for (const bitmap of rawDemTileCache.values()) {
    bitmap.close?.();
  }
  rawDemTileCache.clear();
}

export function getZoneScale(state: ReliefZoneState, targetLod: 'LOW' | 'MEDIUM' | 'HIGH') {
  if (state === 'COLD') return 0.0;
  if (state === 'WARM') return 0.05; // LOD 0: very light/flat
  if (targetLod === 'HIGH') return 1.0; // LOD 2
  if (targetLod === 'MEDIUM') return 0.6; // LOD 1
  return 0.2; // LOD LOW
}

type MapLibreProtocolApi = {
  addProtocol: typeof import("maplibre-gl").addProtocol;
};

export function registerNiceTerrainProtocol(maplibre: MapLibreProtocolApi) {
  if (niceTerrainProtocolRegistered) return;

  try {
    maplibre.addProtocol(NICE_TERRAIN_PROTOCOL, async (params, abortController) => {
      const httpUrl = params.url.replace(`${NICE_TERRAIN_PROTOCOL}://`, "https://");
      const match = httpUrl.match(/\/(\d+)\/(\d+)\/(\d+)\.png/);

      if (!match) {
        return fetchRawTile(httpUrl, abortController?.signal);
      }

      const z = Number.parseInt(match[1], 10);
      const x = Number.parseInt(match[2], 10);
      const y = Number.parseInt(match[3], 10);
      const tileBBox = tileToBBox(x, y, z);
      const intersectsNice = bboxIntersects(tileBBox, NICE_DEM_PROCESSING_BBOX);
      const intersectsJura = bboxIntersects(tileBBox, JURA_DEM_PROCESSING_BBOX);
      const intersectsGrenoble = bboxIntersects(tileBBox, GRENOBLE_DEM_PROCESSING_BBOX);
      const intersectsLyon = bboxIntersects(tileBBox, LYON_DEM_PROCESSING_BBOX);

      if (!intersectsNice && !intersectsJura && !intersectsGrenoble && !intersectsLyon) {
        return fetchRawTile(httpUrl, abortController?.signal);
      }

      try {
        const baseUrl = httpUrl.split("?")[0];
        let image = rawDemTileCache.get(baseUrl);
        if (!image) {
          const response = await fetch(httpUrl, { signal: abortController?.signal });
          const blob = await response.blob();
          image = await createImageBitmap(blob);
          rawDemTileCache.set(baseUrl, image);
        }

        const fallbackDocument = typeof document !== "undefined" ? document : null;
        const canvas = typeof OffscreenCanvas !== "undefined"
          ? new OffscreenCanvas(256, 256)
          : fallbackDocument?.createElement("canvas");

        if (!canvas) {
          throw new Error("Terrain canvas unavailable");
        }

        canvas.width = 256;
        canvas.height = 256;

        const context = canvas.getContext("2d") as any;
        if (!context) {
          throw new Error("Terrain canvas context unavailable");
        }

        context.drawImage(image, 0, 0);
        // Do not call image.close() since we cache the ImageBitmap!

        const imageData = context.getImageData(0, 0, 256, 256);
        const data = imageData.data;

        const activeZonesInTile = NICE_RELIEF_ZONES.filter(z => bboxIntersects(tileBBox, z.bbox));

        for (let py = 0; py < 256; py += 1) {
          for (let px = 0; px < 256; px += 1) {
            const index = (py * 256 + px) * 4;
            const red = data[index];
            const green = data[index + 1];
            const blue = data[index + 2];
            const originalElevation = (red * 256 + green + blue / 256) - 32768;
            const coordinate = tilePixelToLngLat(x, y, z, px, py);
            let nextElevation = originalElevation;

            if (intersectsNice && isCoordinateInSea(coordinate.lng, coordinate.lat)) {
              encodeTerrariumElevation(0, data, index);
              continue;
            }

            if (intersectsNice) {
              let scale = 0.0;
              for (const zone of activeZonesInTile) {
                if (isInBBox(coordinate.lng, coordinate.lat, zone.bbox)) {
                  const zoneScale = getZoneScale(zone.state, zone.lod);
                  if (zoneScale > scale) {
                    scale = zoneScale;
                  }
                }
              }

              nextElevation = originalElevation * scale;

              if (scale > 0) {
                const deltaLat = coordinate.lat - getShorelineLat(coordinate.lng);
                const featherZone = 0.004;

                if (deltaLat < featherZone) {
                  const blend = Math.max(0, deltaLat / featherZone);
                  nextElevation *= blend;
                }

                nextElevation = flattenRoadTerraceAxes(
                  coordinate.lng,
                  coordinate.lat,
                  nextElevation,
                  NICE_DEM_PROCESSING_BBOX,
                  0.006,
                  niceMainRoadTerraceAxes,
                );

                nextElevation = flattenNiceMaeterlinckTerraces(
                  coordinate.lng,
                  coordinate.lat,
                  nextElevation,
                );
              } else {
                nextElevation = 0;
              }
            }

            if (intersectsJura && isInBBox(coordinate.lng, coordinate.lat, JURA_DEM_PROCESSING_BBOX)) {
              nextElevation = flattenJuraSaintClaudeValley(coordinate.lng, coordinate.lat, nextElevation);
              nextElevation = flattenJuraCityTerraces(
                coordinate.lng,
                coordinate.lat,
                nextElevation,
              );
            }

            if (intersectsGrenoble && isInBBox(coordinate.lng, coordinate.lat, GRENOBLE_DEM_PROCESSING_BBOX)) {
              nextElevation = flattenGrenobleCentralValley(
                coordinate.lng,
                coordinate.lat,
                nextElevation,
              );
              nextElevation = flattenRoadTerraceAxes(
                coordinate.lng,
                coordinate.lat,
                nextElevation,
                GRENOBLE_DEM_PROCESSING_BBOX,
                0.01,
                grenobleMainRoadTerraceAxes,
              );
            }

            if (intersectsLyon && isInBBox(coordinate.lng, coordinate.lat, LYON_DEM_PROCESSING_BBOX)) {
              nextElevation = flattenLyonCentralValley(
                coordinate.lng,
                coordinate.lat,
                nextElevation,
              );
              nextElevation = flattenLyonRiverCorridor(
                coordinate.lng,
                coordinate.lat,
                nextElevation,
              );
            }

            if (nextElevation !== originalElevation) {
              encodeTerrariumElevation(nextElevation, data, index);
            }
          }
        }

        context.putImageData(imageData, 0, 0);
        return { data: await blobToPngArrayBuffer(canvas) };
      } catch (error: any) {
        if (
          error.name === "AbortError" ||
          error.message?.toLowerCase().includes("abort") ||
          error.message?.toLowerCase().includes("cancel")
        ) {
          throw error;
        }
        console.error("[nice-terrain] Fallback raw DEM tile:", error);
        return fetchRawTile(httpUrl, abortController?.signal);
      }
    });

    niceTerrainProtocolRegistered = true;
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("already") && !message.includes("registered")) {
      console.warn("[nice-terrain] Protocol registration failed.", error);
    }
    niceTerrainProtocolRegistered = true;
  }
}

export function getActiveUrbanTerrainZone(map: MapLibreMap) {
  const center = map.getCenter();

  return urbanTerrainZones.find((zone) => (
    zone.enabled && isInBBox(center.lng, center.lat, zone.bbox)
  )) ?? null;
}

export function getActiveLowAltitudeMountainCityTerrainZone(map: MapLibreMap) {
  const center = map.getCenter();

  return premiumReliefZones.find((zone) => (
    zone.enabled &&
    zone.terrainInCity &&
    zone.lowAltitudeTerrain &&
    isInBBox(center.lng, center.lat, zone.bbox)
  )) ?? null;
}

export function getActiveMountainRegionZone(map: MapLibreMap) {
  const center = map.getCenter();

  return mountainRegionZones.find((zone) => (
    zone.enabled && isInBBox(center.lng, center.lat, zone.bbox)
  )) ?? null;
}

export function getActiveNiceTerrainSubZone(map: MapLibreMap) {
  const center = map.getCenter();

  return niceSubZones.find((zone) => (
    zone.enabled && isInBBox(center.lng, center.lat, zone.bbox)
  )) ?? null;
}

export function getZoomExaggerationMultiplier(zoom: number) {
  if (zoom <= 13) return 1.15;
  if (zoom >= 16.5) return 0.95;

  const t = (zoom - 13) / (16.5 - 13);
  return 1.15 - t * 0.20;
}

export function getUrbanTerrainExaggeration(map: MapLibreMap, zone: UrbanTerrainZone) {
  if (!zone.terrainInCity) return 0;

  const zoomMultiplier = getZoomExaggerationMultiplier(map.getZoom());
  let baseExaggeration = zone.terrainStrength === "high"
    ? 1.45
    : zone.terrainStrength === "flat"
      ? 0.92
      : 1.25;

  if (zone.id.startsWith("lyon_")) {
    baseExaggeration = 1;
  }

  if (zone.id === "nice_hills") {
    baseExaggeration = getActiveNiceTerrainSubZone(map)?.exaggeration ?? 1.45;
  }

  return baseExaggeration * zoomMultiplier;
}

export function getMountainRegionTerrainExaggeration(map: MapLibreMap, exaggeration: number) {
  return exaggeration * getZoomExaggerationMultiplier(map.getZoom());
}
