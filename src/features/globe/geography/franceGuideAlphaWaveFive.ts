export type FranceGuideAlphaWaveFiveBounds = readonly [
  west: number,
  south: number,
  east: number,
  north: number,
];

export type FranceGuideAlphaWaveFiveSearchMetadata = {
  readonly label: string;
  readonly aliases?: readonly string[];
};

type FranceGuideAlphaWaveFiveCitySource = {
  readonly id: string;
  readonly featureId: `city-${string}`;
  readonly communeCode: string;
  readonly sourceUrl: `/map/${string}-quartiers.geojson`;
  readonly zoneIdPrefix: `${string}_`;
  readonly bbox: FranceGuideAlphaWaveFiveBounds;
  readonly search: FranceGuideAlphaWaveFiveSearchMetadata;
};

export type FranceGuideAlphaWaveFiveCity = FranceGuideAlphaWaveFiveCitySource & {
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

function getCenter(bbox: FranceGuideAlphaWaveFiveBounds) {
  const [west, south, east, north] = bbox;
  return [
    roundCoordinate((west + east) / 2),
    roundCoordinate((south + north) / 2),
  ] as const;
}

function getOverviewZoom(bbox: FranceGuideAlphaWaveFiveBounds) {
  const [west, south, east, north] = bbox;
  const latitude = (south + north) / 2;
  const latitudeScale = Math.cos(latitude * Math.PI / 180);
  const longitudeSpan = (east - west) * latitudeScale;
  const latitudeSpan = north - south;
  const geographicSpan = Math.max(longitudeSpan, latitudeSpan);
  const rawZoom = CITY_OVERVIEW_ZOOM_CALIBRATION - Math.log2(geographicSpan);
  const steppedZoom = Math.round(rawZoom / CITY_OVERVIEW_ZOOM_STEP) * CITY_OVERVIEW_ZOOM_STEP;
  return Math.min(CITY_OVERVIEW_MAX_ZOOM, Math.max(CITY_OVERVIEW_MIN_ZOOM, steppedZoom));
}

function createCity(source: FranceGuideAlphaWaveFiveCitySource): FranceGuideAlphaWaveFiveCity {
  return {
    ...source,
    center: getCenter(source.bbox),
    zoom: getOverviewZoom(source.bbox),
    fly: GUIDE_ALPHA_FLY,
  };
}

const FRANCE_GUIDE_ALPHA_WAVE_FIVE_SOURCES = [
  { id: "ajaccio", featureId: "city-ajaccio", communeCode: "2A004", sourceUrl: "/map/ajaccio-quartiers.geojson", zoneIdPrefix: "ajaccio_", bbox: [8.58543148, 41.87377832, 8.826103, 41.97160966], search: { label: "Ajaccio" } },
  { id: "albi", featureId: "city-albi", communeCode: "81004", sourceUrl: "/map/albi-quartiers.geojson", zoneIdPrefix: "albi_", bbox: [2.05278928, 43.888476, 2.21182253, 43.96959023], search: { label: "Albi" } },
  { id: "ales", featureId: "city-ales", communeCode: "30007", sourceUrl: "/map/ales-quartiers.geojson", zoneIdPrefix: "ales_", bbox: [4.05361263, 44.09372907, 4.12731874, 44.15625389], search: { label: "Alès" } },
  { id: "angouleme", featureId: "city-angouleme", communeCode: "16015", sourceUrl: "/map/angouleme-quartiers.geojson", zoneIdPrefix: "angouleme_", bbox: [0.09962705, 45.62000461, 0.19042724, 45.67162098], search: { label: "Angoulême" } },
  { id: "annemasse", featureId: "city-annemasse", communeCode: "74012", sourceUrl: "/map/annemasse-quartiers.geojson", zoneIdPrefix: "annemasse_", bbox: [6.21661227, 46.17612656, 6.27857826, 46.20193906], search: { label: "Annemasse" } },
  { id: "antibes", featureId: "city-antibes", communeCode: "06004", sourceUrl: "/map/antibes-quartiers.geojson", zoneIdPrefix: "antibes_", bbox: [7.06456458, 43.54195029, 7.14511356, 43.62270454], search: { label: "Antibes" } },
  { id: "arles", featureId: "city-arles", communeCode: "13004", sourceUrl: "/map/arles-quartiers.geojson", zoneIdPrefix: "arles_", bbox: [4.42619894, 43.32770523, 4.87635225, 43.76042013], search: { label: "Arles" } },
  { id: "arras", featureId: "city-arras", communeCode: "62041", sourceUrl: "/map/arras-quartiers.geojson", zoneIdPrefix: "arras_", bbox: [2.7250773, 50.2680623, 2.8107022, 50.31048741], search: { label: "Arras" } },
  { id: "aubagne", featureId: "city-aubagne", communeCode: "13005", sourceUrl: "/map/aubagne-quartiers.geojson", zoneIdPrefix: "aubagne_", bbox: [5.51315967, 43.24431422, 5.61540237, 43.33641037], search: { label: "Aubagne" } },
  { id: "bastia", featureId: "city-bastia", communeCode: "2B033", sourceUrl: "/map/bastia-quartiers.geojson", zoneIdPrefix: "bastia_", bbox: [9.39039475, 42.66136953, 9.45762417, 42.71089703], search: { label: "Bastia" } },
  { id: "belfort", featureId: "city-belfort", communeCode: "90010", sourceUrl: "/map/belfort-quartiers.geojson", zoneIdPrefix: "belfort_", bbox: [6.78717054, 47.62032133, 6.89488164, 47.67130554], search: { label: "Belfort" } },
  { id: "beziers", featureId: "city-beziers", communeCode: "34032", sourceUrl: "/map/beziers-quartiers.geojson", zoneIdPrefix: "beziers_", bbox: [3.12749157, 43.29718369, 3.34096426, 43.39899009], search: { label: "Béziers" } },
  { id: "bourg_en_bresse", featureId: "city-bourg-en-bresse", communeCode: "01053", sourceUrl: "/map/bourg-en-bresse-quartiers.geojson", zoneIdPrefix: "bourg_en_bresse_", bbox: [5.20661615, 46.1752964, 5.28720655, 46.23012667], search: { label: "Bourg-en-Bresse" } },
  { id: "bourges", featureId: "city-bourges", communeCode: "18033", sourceUrl: "/map/bourges-quartiers.geojson", zoneIdPrefix: "bourges_", bbox: [2.32401647, 47.02595858, 2.47257943, 47.1301116], search: { label: "Bourges" } },
  { id: "cannes", featureId: "city-cannes", communeCode: "06029", sourceUrl: "/map/cannes-quartiers.geojson", zoneIdPrefix: "cannes_", bbox: [6.94470252, 43.50508313, 7.07411, 43.57485508], search: { label: "Cannes" } },
  { id: "castres", featureId: "city-castres", communeCode: "81065", sourceUrl: "/map/castres-quartiers.geojson", zoneIdPrefix: "castres_", bbox: [2.15636596, 43.55601395, 2.33327726, 43.67036443], search: { label: "Castres" } },
  { id: "chalons_en_champagne", featureId: "city-chalons-en-champagne", communeCode: "51108", sourceUrl: "/map/chalons-en-champagne-quartiers.geojson", zoneIdPrefix: "chalons_en_champagne_", bbox: [4.32957684, 48.92997871, 4.43055821, 49.00113948], search: { label: "Châlons-en-Champagne" } },
  { id: "chalon_sur_saone", featureId: "city-chalon-sur-saone", communeCode: "71076", sourceUrl: "/map/chalon-sur-saone-quartiers.geojson", zoneIdPrefix: "chalon_sur_saone_", bbox: [4.81949177, 46.76026843, 4.88221218, 46.81900327], search: { label: "Chalon-sur-Saône" } },
  { id: "charleville_mezieres", featureId: "city-charleville-mezieres", communeCode: "08105", sourceUrl: "/map/charleville-mezieres-quartiers.geojson", zoneIdPrefix: "charleville_mezieres_", bbox: [4.67584471, 49.73278914, 4.78497752, 49.82759052], search: { label: "Charleville-Mézières" } },
  { id: "chartres", featureId: "city-chartres", communeCode: "28085", sourceUrl: "/map/chartres-quartiers.geojson", zoneIdPrefix: "chartres_", bbox: [1.45961863, 48.42718583, 1.54966311, 48.4689233], search: { label: "Chartres" } },
  { id: "chateauroux", featureId: "city-chateauroux", communeCode: "36044", sourceUrl: "/map/chateauroux-quartiers.geojson", zoneIdPrefix: "chateauroux_", bbox: [1.63818648, 46.7748358, 1.74242318, 46.82971874], search: { label: "Châteauroux" } },
  { id: "cherbourg_en_cotentin", featureId: "city-cherbourg-en-cotentin", communeCode: "50129", sourceUrl: "/map/cherbourg-en-cotentin-quartiers.geojson", zoneIdPrefix: "cherbourg_en_cotentin_", bbox: [-1.73770391, 49.58069015, -1.53358499, 49.67461156], search: { label: "Cherbourg-en-Cotentin" } },
  { id: "compiegne", featureId: "city-compiegne", communeCode: "60159", sourceUrl: "/map/compiegne-quartiers.geojson", zoneIdPrefix: "compiegne_", bbox: [2.77918047, 49.36682103, 2.93014849, 49.43441241], search: { label: "Compiègne" } },
  { id: "creil", featureId: "city-creil", communeCode: "60175", sourceUrl: "/map/creil-quartiers.geojson", zoneIdPrefix: "creil_", bbox: [2.45324659, 49.23676298, 2.51505184, 49.27459237], search: { label: "Creil" } },
  { id: "douai", featureId: "city-douai", communeCode: "59178", sourceUrl: "/map/douai-quartiers.geojson", zoneIdPrefix: "douai_", bbox: [3.0515052, 50.34921687, 3.1494477, 50.41057754], search: { label: "Douai" } },
  { id: "draguignan", featureId: "city-draguignan", communeCode: "83050", sourceUrl: "/map/draguignan-quartiers.geojson", zoneIdPrefix: "draguignan_", bbox: [6.39666487, 43.49646631, 6.53348883, 43.57267425], search: { label: "Draguignan" } },
  { id: "evreux", featureId: "city-evreux", communeCode: "27229", sourceUrl: "/map/evreux-quartiers.geojson", zoneIdPrefix: "evreux_", bbox: [1.08962779, 48.98917615, 1.19160707, 49.04687079], search: { label: "Évreux" } },
  { id: "frejus", featureId: "city-frejus", communeCode: "83061", sourceUrl: "/map/frejus-quartiers.geojson", zoneIdPrefix: "frejus_", bbox: [6.68581758, 43.36827395, 6.89646606, 43.53352097], search: { label: "Fréjus" } },
  { id: "gap", featureId: "city-gap", communeCode: "05061", sourceUrl: "/map/gap-quartiers.geojson", zoneIdPrefix: "gap_", bbox: [5.98210738, 44.4947721, 6.14108379, 44.66456654], search: { label: "Gap" } },
  { id: "grasse", featureId: "city-grasse", communeCode: "06069", sourceUrl: "/map/grasse-quartiers.geojson", zoneIdPrefix: "grasse_", bbox: [6.88589733, 43.61325305, 6.98810488, 43.69867932], search: { label: "Grasse" } },
  { id: "haguenau", featureId: "city-haguenau", communeCode: "67180", sourceUrl: "/map/haguenau-quartiers.geojson", zoneIdPrefix: "haguenau_", bbox: [7.63400105, 48.77415853, 8.00856378, 48.90349335], search: { label: "Haguenau" } },
  { id: "la_seyne_sur_mer", featureId: "city-la-seyne-sur-mer", communeCode: "83126", sourceUrl: "/map/la-seyne-sur-mer-quartiers.geojson", zoneIdPrefix: "la_seyne_sur_mer_", bbox: [5.84645905, 43.0458403, 5.91127382, 43.12159681], search: { label: "La Seyne-sur-Mer" } },
  { id: "laval", featureId: "city-laval", communeCode: "53130", sourceUrl: "/map/laval-quartiers.geojson", zoneIdPrefix: "laval_", bbox: [-0.82093017, 48.02443045, -0.71743527, 48.09115807], search: { label: "Laval" } },
  { id: "macon", featureId: "city-macon", communeCode: "71270", sourceUrl: "/map/macon-quartiers.geojson", zoneIdPrefix: "macon_", bbox: [4.75798979, 46.27342829, 4.85868171, 46.37964784], search: { label: "Mâcon" } },
  { id: "martigues", featureId: "city-martigues", communeCode: "13056", sourceUrl: "/map/martigues-quartiers.geojson", zoneIdPrefix: "martigues_", bbox: [4.98509605, 43.3243125, 5.1050562, 43.44347463], search: { label: "Martigues" } },
  { id: "meaux", featureId: "city-meaux", communeCode: "77284", sourceUrl: "/map/meaux-quartiers.geojson", zoneIdPrefix: "meaux_", bbox: [2.86282303, 48.93552292, 2.94413462, 48.97898924], search: { label: "Meaux" } },
  { id: "montelimar", featureId: "city-montelimar", communeCode: "26198", sourceUrl: "/map/montelimar-quartiers.geojson", zoneIdPrefix: "montelimar_", bbox: [4.69211175, 44.51986322, 4.79871122, 44.58918429], search: { label: "Montélimar" } },
  { id: "narbonne", featureId: "city-narbonne", communeCode: "11262", sourceUrl: "/map/narbonne-quartiers.geojson", zoneIdPrefix: "narbonne_", bbox: [2.88240398, 43.06091685, 3.18503475, 43.23775314], search: { label: "Narbonne" } },
  { id: "roanne", featureId: "city-roanne", communeCode: "42187", sourceUrl: "/map/roanne-quartiers.geojson", zoneIdPrefix: "roanne_", bbox: [4.04625051, 46.01721733, 4.11322645, 46.07138821], search: { label: "Roanne" } },
  { id: "saint_brieuc", featureId: "city-saint-brieuc", communeCode: "22278", sourceUrl: "/map/saint-brieuc-quartiers.geojson", zoneIdPrefix: "saint_brieuc_", bbox: [-2.82158712, 48.48613452, -2.70984191, 48.53544971], search: { label: "Saint-Brieuc" } },
  { id: "saint_malo", featureId: "city-saint-malo", communeCode: "35288", sourceUrl: "/map/saint-malo-quartiers.geojson", zoneIdPrefix: "saint_malo_", bbox: [-2.0767623, 48.59821416, -1.93662484, 48.69486478], search: { label: "Saint-Malo" } },
  { id: "saint_quentin", featureId: "city-saint-quentin", communeCode: "02691", sourceUrl: "/map/saint-quentin-quartiers.geojson", zoneIdPrefix: "saint_quentin_", bbox: [3.22812081, 49.82018747, 3.32984723, 49.87487075], search: { label: "Saint-Quentin" } },
  { id: "saint_raphael", featureId: "city-saint-raphael", communeCode: "83118", sourceUrl: "/map/saint-raphael-quartiers.geojson", zoneIdPrefix: "saint_raphael_", bbox: [6.76308755, 43.40638801, 6.93344824, 43.51001499], search: { label: "Saint-Raphaël" } },
  { id: "salon_de_provence", featureId: "city-salon-de-provence", communeCode: "13103", sourceUrl: "/map/salon-de-provence-quartiers.geojson", zoneIdPrefix: "salon_de_provence_", bbox: [4.95409731, 43.59799388, 5.14397936, 43.68798108], search: { label: "Salon-de-Provence" } },
  { id: "sete", featureId: "city-sete", communeCode: "34301", sourceUrl: "/map/sete-quartiers.geojson", zoneIdPrefix: "sete_", bbox: [3.5530176, 43.32625, 3.7482342, 43.43023939], search: { label: "Sète" } },
  { id: "tarbes", featureId: "city-tarbes", communeCode: "65440", sourceUrl: "/map/tarbes-quartiers.geojson", zoneIdPrefix: "tarbes_", bbox: [0.03747983, 43.21245767, 0.09306789, 43.26496654], search: { label: "Tarbes" } },
  { id: "valenciennes", featureId: "city-valenciennes", communeCode: "59606", sourceUrl: "/map/valenciennes-quartiers.geojson", zoneIdPrefix: "valenciennes_", bbox: [3.47619376, 50.3365611, 3.55224304, 50.38753125], search: { label: "Valenciennes" } },
  { id: "versailles", featureId: "city-versailles", communeCode: "78646", sourceUrl: "/map/versailles-quartiers.geojson", zoneIdPrefix: "versailles_", bbox: [2.06990892, 48.77916591, 2.16848059, 48.82857819], search: { label: "Versailles" } },
] as const satisfies readonly FranceGuideAlphaWaveFiveCitySource[];

export type GuideAlphaWaveFiveCityId =
  (typeof FRANCE_GUIDE_ALPHA_WAVE_FIVE_SOURCES)[number]["id"];

export type GuideAlphaWaveFiveCameraPreset = {
  readonly name: GuideAlphaWaveFiveCityId;
  readonly center: [longitude: number, latitude: number];
  readonly zoom: number;
  readonly pitch: 60;
  readonly bearing: 0;
  readonly speed: 0.85;
  readonly curve: 1.4;
};

export const GUIDE_ALPHA_WAVE_FIVE_CITIES = FRANCE_GUIDE_ALPHA_WAVE_FIVE_SOURCES.map(
  createCity,
) as readonly (FranceGuideAlphaWaveFiveCity & { readonly id: GuideAlphaWaveFiveCityId })[];

export const FRANCE_GUIDE_ALPHA_WAVE_FIVE_CITIES = GUIDE_ALPHA_WAVE_FIVE_CITIES;

export const FRANCE_GUIDE_ALPHA_WAVE_FIVE_CITY_BY_ID = new Map(
  GUIDE_ALPHA_WAVE_FIVE_CITIES.map((city) => [city.id, city] as const),
);

export const FRANCE_GUIDE_ALPHA_WAVE_FIVE_CITY_BY_FEATURE_ID = new Map(
  GUIDE_ALPHA_WAVE_FIVE_CITIES.map((city) => [city.featureId, city] as const),
);

export const FRANCE_GUIDE_ALPHA_WAVE_FIVE_CITY_BY_COMMUNE_CODE = new Map(
  GUIDE_ALPHA_WAVE_FIVE_CITIES.map((city) => [city.communeCode, city] as const),
);

export const GUIDE_ALPHA_WAVE_FIVE_PRESET_BY_FEATURE_ID = Object.freeze(
  Object.fromEntries(
    GUIDE_ALPHA_WAVE_FIVE_CITIES.flatMap((city) => [
      [city.featureId, city.id],
      [`commune-${city.communeCode}`, city.id],
    ]),
  ) as Readonly<Record<string, GuideAlphaWaveFiveCityId>>,
);

export function getGuideAlphaWaveFiveCityIdForFeatureId(featureId: string | null | undefined) {
  if (!featureId) return null;
  return GUIDE_ALPHA_WAVE_FIVE_PRESET_BY_FEATURE_ID[featureId] ?? null;
}

export const GUIDE_ALPHA_WAVE_FIVE_CAMERA_PRESETS = Object.freeze(
  Object.fromEntries(
    GUIDE_ALPHA_WAVE_FIVE_CITIES.map((city) => [
      city.id,
      {
        name: city.id,
        center: [...city.center] as [number, number],
        zoom: city.zoom,
        ...city.fly,
      },
    ]),
  ) as Readonly<Record<GuideAlphaWaveFiveCityId, GuideAlphaWaveFiveCameraPreset>>,
);
