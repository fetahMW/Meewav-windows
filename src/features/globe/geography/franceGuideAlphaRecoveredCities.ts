export type FranceGuideAlphaRecoveredBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

type FranceGuideAlphaRecoveredCitySource = {
  readonly id: string;
  readonly featureId: `city-${string}`;
  readonly communeCode: string;
  readonly sourceUrl: `/map/${string}-quartiers.geojson`;
  readonly zoneIdPrefix: `${string}_`;
  readonly bbox: FranceGuideAlphaRecoveredBounds;
  readonly camera?: {
    readonly center: readonly [longitude: number, latitude: number];
    readonly zoom: number;
  };
  readonly search: {
    readonly label: string;
    readonly aliases?: readonly string[];
  };
};

export type FranceGuideAlphaRecoveredCity = FranceGuideAlphaRecoveredCitySource & {
  readonly center: readonly [longitude: number, latitude: number];
  readonly zoom: number;
  readonly fly: {
    readonly pitch: 60;
    readonly bearing: 0;
    readonly speed: 0.85;
    readonly curve: 1.4;
  };
};

const CITY_OVERVIEW_ZOOM_CALIBRATION = 9.4;
const CITY_OVERVIEW_MIN_ZOOM = 11.8;
const CITY_OVERVIEW_MAX_ZOOM = 13.6;
const CITY_OVERVIEW_ZOOM_STEP = 0.05;

const GUIDE_ALPHA_FLY = {
  pitch: 60,
  bearing: 0,
  speed: 0.85,
  curve: 1.4,
} as const;

function roundCoordinate(value: number) {
  return Math.round(value * 100_000) / 100_000;
}

function getCenter(bbox: FranceGuideAlphaRecoveredBounds) {
  const [west, south, east, north] = bbox;
  return [
    roundCoordinate((west + east) / 2),
    roundCoordinate((south + north) / 2),
  ] as const;
}

function getOverviewZoom(bbox: FranceGuideAlphaRecoveredBounds) {
  const [west, south, east, north] = bbox;
  const latitude = (south + north) / 2;
  const longitudeSpan = (east - west) * Math.cos(latitude * Math.PI / 180);
  const latitudeSpan = north - south;
  const rawZoom = CITY_OVERVIEW_ZOOM_CALIBRATION - Math.log2(Math.max(longitudeSpan, latitudeSpan));
  const steppedZoom = Math.round(rawZoom / CITY_OVERVIEW_ZOOM_STEP) * CITY_OVERVIEW_ZOOM_STEP;
  return Math.min(CITY_OVERVIEW_MAX_ZOOM, Math.max(CITY_OVERVIEW_MIN_ZOOM, steppedZoom));
}

function createCity(source: FranceGuideAlphaRecoveredCitySource): FranceGuideAlphaRecoveredCity {
  return {
    ...source,
    center: source.camera?.center ?? getCenter(source.bbox),
    zoom: source.camera?.zoom ?? getOverviewZoom(source.bbox),
    fly: GUIDE_ALPHA_FLY,
  };
}

const FRANCE_GUIDE_ALPHA_RECOVERED_SOURCES = [
  { id: "orleans", featureId: "city-orleans", communeCode: "45234", sourceUrl: "/map/orleans-quartiers.geojson", zoneIdPrefix: "orleans_", bbox: [1.87574717, 47.81329754, 1.9486429, 47.93353707], camera: { center: [1.91007, 47.90066], zoom: 12.45 }, search: { label: "Orléans", aliases: ["Orleans"] } },
  { id: "annecy", featureId: "city-annecy", communeCode: "74010", sourceUrl: "/map/annecy-quartiers.geojson", zoneIdPrefix: "annecy_", bbox: [6.04841394, 45.82799438, 6.20439323, 45.97671457], search: { label: "Annecy" } },
  { id: "hyeres", featureId: "city-hyeres", communeCode: "83069", sourceUrl: "/map/hyeres-quartiers.geojson", zoneIdPrefix: "hyeres_", bbox: [6.0687426, 42.98202923, 6.51163991, 43.20701735], camera: { center: [6.1286, 43.1205], zoom: 12.45 }, search: { label: "Hyères", aliases: ["Hyeres"] } },
  { id: "colmar", featureId: "city-colmar", communeCode: "68066", sourceUrl: "/map/colmar-quartiers.geojson", zoneIdPrefix: "colmar_", bbox: [7.31551736, 48.04068188, 7.46925174, 48.18230107], search: { label: "Colmar" } },
  { id: "cagnes_sur_mer", featureId: "city-cagnes-sur-mer", communeCode: "06027", sourceUrl: "/map/cagnes-sur-mer-quartiers.geojson", zoneIdPrefix: "cagnes_sur_mer_", bbox: [7.1206522, 43.64190947, 7.17965451, 43.70055386], search: { label: "Cagnes-sur-Mer", aliases: ["Cagnes sur Mer"] } },
  { id: "les_sables_d_olonne", featureId: "city-les-sables-d-olonne", communeCode: "85194", sourceUrl: "/map/les-sables-d-olonne-quartiers.geojson", zoneIdPrefix: "les_sables_d_olonne_", bbox: [-1.8476196, 46.45748159, -1.6746706, 46.59535558], search: { label: "Les Sables-d'Olonne", aliases: ["Les Sables d Olonne"] } },
  { id: "blois", featureId: "city-blois", communeCode: "41018", sourceUrl: "/map/blois-quartiers.geojson", zoneIdPrefix: "blois_", bbox: [1.25410381, 47.54155574, 1.3556915, 47.62096072], search: { label: "Blois" } },
  { id: "brive_la_gaillarde", featureId: "city-brive-la-gaillarde", communeCode: "19031", sourceUrl: "/map/brive-la-gaillarde-quartiers.geojson", zoneIdPrefix: "brive_la_gaillarde_", bbox: [1.45495592, 45.10439264, 1.57379181, 45.18563418], search: { label: "Brive-la-Gaillarde", aliases: ["Brive", "Brive la Gaillarde"] } },
  { id: "carcassonne", featureId: "city-carcassonne", communeCode: "11069", sourceUrl: "/map/carcassonne-quartiers.geojson", zoneIdPrefix: "carcassonne_", bbox: [2.2617104, 43.1712338, 2.43646867, 43.2443446], search: { label: "Carcassonne" } },
  { id: "istres", featureId: "city-istres", communeCode: "13047", sourceUrl: "/map/istres-quartiers.geojson", zoneIdPrefix: "istres_", bbox: [4.87977525, 43.46802828, 5.01556578, 43.62297836], search: { label: "Istres" } },
  { id: "thionville", featureId: "city-thionville", communeCode: "57672", sourceUrl: "/map/thionville-quartiers.geojson", zoneIdPrefix: "thionville_", bbox: [6.05543175, 49.32813895, 6.23322361, 49.41546914], search: { label: "Thionville" } },
] as const satisfies readonly FranceGuideAlphaRecoveredCitySource[];

export type GuideAlphaRecoveredCityId =
  (typeof FRANCE_GUIDE_ALPHA_RECOVERED_SOURCES)[number]["id"];

export type GuideAlphaRecoveredCameraPreset = {
  readonly name: GuideAlphaRecoveredCityId;
  readonly center: [longitude: number, latitude: number];
  readonly zoom: number;
  readonly pitch: 60;
  readonly bearing: 0;
  readonly speed: 0.85;
  readonly curve: 1.4;
};

export const GUIDE_ALPHA_RECOVERED_CITIES = FRANCE_GUIDE_ALPHA_RECOVERED_SOURCES.map(
  createCity,
) as readonly (FranceGuideAlphaRecoveredCity & { readonly id: GuideAlphaRecoveredCityId })[];

export const GUIDE_ALPHA_RECOVERED_PRESET_BY_FEATURE_ID = Object.freeze(
  Object.fromEntries(
    GUIDE_ALPHA_RECOVERED_CITIES.flatMap((city) => [
      [city.featureId, city.id],
      [`commune-${city.communeCode}`, city.id],
    ]),
  ) as Readonly<Record<string, GuideAlphaRecoveredCityId>>,
);

export function getGuideAlphaRecoveredCityIdForFeatureId(featureId: string | null | undefined) {
  if (!featureId) return null;
  return GUIDE_ALPHA_RECOVERED_PRESET_BY_FEATURE_ID[featureId] ?? null;
}

export const GUIDE_ALPHA_RECOVERED_CAMERA_PRESETS = Object.freeze(
  Object.fromEntries(
    GUIDE_ALPHA_RECOVERED_CITIES.map((city) => [
      city.id,
      {
        name: city.id,
        center: [...city.center] as [number, number],
        zoom: city.zoom,
        ...city.fly,
      },
    ]),
  ) as Readonly<Record<GuideAlphaRecoveredCityId, GuideAlphaRecoveredCameraPreset>>,
);
