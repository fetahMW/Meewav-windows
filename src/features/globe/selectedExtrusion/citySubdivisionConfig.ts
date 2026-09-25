import {
  FRANCE_GUIDE_ALPHA_GENERATED_CITIES,
  type FranceGuideAlphaGeneratedCityId,
} from "../geography/franceGuideAlphaCities.generated";

export type CitySubdivisionId =
  | "paris"
  | "nice"
  | "lyon"
  | "nantes"
  | "marseille"
  | "lille"
  | "montpellier"
  | "toulouse"
  | "bordeaux"
  | "strasbourg"
  | "rennes"
  | "reims"
  | "grenoble"
  | "rouen"
  | "toulon"
  | "saint_etienne"
  | "le_havre"
  | "dijon"
  | "angers"
  | "nimes"
  | "clermont_ferrand"
  | "le_mans"
  | "aix_en_provence"
  | "brest"
  | "tours"
  | "amiens"
  | "perpignan"
  | "metz"
  | "limoges"
  | "besancon"
  | "mulhouse"
  | "caen"
  | "nancy"
  | "avignon"
  | "poitiers"
  | "pau"
  | "la_rochelle"
  | "calais"
  | "dunkerque"
  | "saint_nazaire"
  | "troyes"
  | "valence"
  | "chambery"
  | "niort"
  | "lorient"
  | "quimper"
  | "montauban"
  | "beauvais"
  | "vannes"
  | "cholet"
  | "la_roche_sur_yon"
  | "bayonne"
  | "trappes"
  | FranceGuideAlphaGeneratedCityId;

export type CitySubdivisionConfig = {
  id: CitySubdivisionId;
  sourceUrl: string;
  zoneIdPrefix: string;
  usesOverviewPresetForSearch: boolean;
  metropolitanArea?: {
    overviewUrl: string;
    subzonesUrl: string;
    communeZoneIdPrefix: string;
    subzoneZoneIdPrefix: string;
    parentCameraMinZoom?: number;
    subzoneCameraMinZoom?: number;
  };
};

const PARIS_QUARTIERS_URL = new URL("../data/paris-quartiers.geojson", import.meta.url).href;

const GUIDE_ALPHA_GENERATED_SUBDIVISION_CONFIGS = Object.fromEntries(
  FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [
    city.id,
    {
      id: city.id,
      sourceUrl: city.sourceUrl,
      zoneIdPrefix: city.zoneIdPrefix,
      usesOverviewPresetForSearch: true,
    },
  ]),
) as Record<FranceGuideAlphaGeneratedCityId, CitySubdivisionConfig>;

const MANUAL_CITY_ID_BY_COMMUNE_CODE = new Map<string, CitySubdivisionId>([
  ["75056", "paris"],
  ["06088", "nice"],
  ["69123", "lyon"],
  ["44109", "nantes"],
  ["13055", "marseille"],
  ["59350", "lille"],
  ["34172", "montpellier"],
  ["31555", "toulouse"],
  ["33063", "bordeaux"],
  ["67482", "strasbourg"],
  ["35238", "rennes"],
  ["51454", "reims"],
  ["38185", "grenoble"],
  ["76540", "rouen"],
  ["83137", "toulon"],
  ["42218", "saint_etienne"],
  ["76351", "le_havre"],
  ["21231", "dijon"],
  ["49007", "angers"],
  ["30189", "nimes"],
  ["63113", "clermont_ferrand"],
  ["72181", "le_mans"],
  ["13001", "aix_en_provence"],
  ["29019", "brest"],
  ["37261", "tours"],
  ["80021", "amiens"],
  ["66136", "perpignan"],
  ["57463", "metz"],
  ["87085", "limoges"],
  ["25056", "besancon"],
  ["68224", "mulhouse"],
  ["14118", "caen"],
  ["54395", "nancy"],
  ["84007", "avignon"],
  ["86194", "poitiers"],
  ["64445", "pau"],
  ["17300", "la_rochelle"],
  ["62193", "calais"],
  ["59183", "dunkerque"],
  ["44184", "saint_nazaire"],
  ["10387", "troyes"],
  ["26362", "valence"],
  ["73065", "chambery"],
  ["79191", "niort"],
  ["56121", "lorient"],
  ["29232", "quimper"],
  ["82121", "montauban"],
  ["60057", "beauvais"],
  ["56260", "vannes"],
  ["49099", "cholet"],
  ["85191", "la_roche_sur_yon"],
  ["64102", "bayonne"],
  ["78621", "trappes"],
]);

const STANDALONE_CITY_ID_BY_COMMUNE_CODE = new Map<
  string,
  CitySubdivisionId
>([
  ...MANUAL_CITY_ID_BY_COMMUNE_CODE,
  ...FRANCE_GUIDE_ALPHA_GENERATED_CITIES.map((city) => [city.communeCode, city.id] as const),
]);

export const CITY_SUBDIVISION_CONFIGS: Record<CitySubdivisionId, CitySubdivisionConfig> = {
  paris: {
    id: "paris",
    sourceUrl: PARIS_QUARTIERS_URL,
    zoneIdPrefix: "paris_",
    usesOverviewPresetForSearch: false,
  },
  nice: {
    id: "nice",
    sourceUrl: "/map/nice-quartiers.geojson",
    zoneIdPrefix: "nice_",
    usesOverviewPresetForSearch: true,
    metropolitanArea: {
      overviewUrl: "/map/nice-metropole-communes.geojson",
      subzonesUrl: "/map/nice-metropole-subzones.geojson",
      communeZoneIdPrefix: "nice_metropole_commune_",
      subzoneZoneIdPrefix: "nice_metropole_subzone_",
      parentCameraMinZoom: 8.2,
      subzoneCameraMinZoom: 8.2,
    },
  },
  lyon: {
    id: "lyon",
    sourceUrl: "/map/lyon-quartiers.geojson",
    zoneIdPrefix: "lyon_",
    usesOverviewPresetForSearch: true,
    metropolitanArea: {
      overviewUrl: "/map/lyon-metropole-communes.geojson",
      subzonesUrl: "/map/lyon-metropole-subzones.geojson",
      communeZoneIdPrefix: "lyon_metropole_commune_",
      subzoneZoneIdPrefix: "lyon_metropole_subzone_",
    },
  },
  nantes: {
    id: "nantes",
    sourceUrl: "/map/nantes-quartiers.geojson",
    zoneIdPrefix: "nantes_",
    usesOverviewPresetForSearch: true,
    metropolitanArea: {
      overviewUrl: "/map/nantes-metropole-communes.geojson",
      subzonesUrl: "/map/nantes-metropole-subzones.geojson",
      communeZoneIdPrefix: "nantes_metropole_commune_",
      subzoneZoneIdPrefix: "nantes_metropole_subzone_",
    },
  },
  marseille: {
    id: "marseille",
    sourceUrl: "/map/marseille-quartiers.geojson",
    zoneIdPrefix: "marseille_",
    usesOverviewPresetForSearch: true,
    metropolitanArea: {
      overviewUrl: "/map/marseille-metropole-communes.geojson",
      subzonesUrl: "/map/marseille-metropole-subzones.geojson",
      communeZoneIdPrefix: "marseille_metropole_commune_",
      subzoneZoneIdPrefix: "marseille_metropole_subzone_",
    },
  },
  lille: {
    id: "lille",
    sourceUrl: "/map/lille-quartiers.geojson",
    zoneIdPrefix: "lille_",
    usesOverviewPresetForSearch: true,
    metropolitanArea: {
      overviewUrl: "/map/lille-metropole-communes.geojson",
      subzonesUrl: "/map/lille-metropole-subzones.geojson",
      communeZoneIdPrefix: "lille_metropole_commune_",
      subzoneZoneIdPrefix: "lille_metropole_subzone_",
      parentCameraMinZoom: 11.2,
      subzoneCameraMinZoom: 11.2,
    },
  },
  montpellier: {
    id: "montpellier",
    sourceUrl: "/map/montpellier-quartiers.geojson",
    zoneIdPrefix: "montpellier_",
    usesOverviewPresetForSearch: true,
  },
  ...GUIDE_ALPHA_GENERATED_SUBDIVISION_CONFIGS,
  toulouse: {
    id: "toulouse",
    sourceUrl: "/map/toulouse-quartiers.geojson",
    zoneIdPrefix: "toulouse_",
    usesOverviewPresetForSearch: true,
  },
  bordeaux: {
    id: "bordeaux",
    sourceUrl: "/map/bordeaux-quartiers.geojson",
    zoneIdPrefix: "bordeaux_",
    usesOverviewPresetForSearch: true,
  },
  strasbourg: {
    id: "strasbourg",
    sourceUrl: "/map/strasbourg-quartiers.geojson",
    zoneIdPrefix: "strasbourg_",
    usesOverviewPresetForSearch: true,
  },
  rennes: {
    id: "rennes",
    sourceUrl: "/map/rennes-quartiers.geojson",
    zoneIdPrefix: "rennes_",
    usesOverviewPresetForSearch: true,
  },
  reims: {
    id: "reims",
    sourceUrl: "/map/reims-quartiers.geojson",
    zoneIdPrefix: "reims_",
    usesOverviewPresetForSearch: true,
  },
  grenoble: {
    id: "grenoble",
    sourceUrl: "/map/grenoble-quartiers.geojson",
    zoneIdPrefix: "grenoble_",
    usesOverviewPresetForSearch: true,
  },
  rouen: {
    id: "rouen",
    sourceUrl: "/map/rouen-quartiers.geojson",
    zoneIdPrefix: "rouen_",
    usesOverviewPresetForSearch: true,
  },
  toulon: {
    id: "toulon",
    sourceUrl: "/map/toulon-quartiers.geojson",
    zoneIdPrefix: "toulon_",
    usesOverviewPresetForSearch: true,
  },
  saint_etienne: {
    id: "saint_etienne",
    sourceUrl: "/map/saint-etienne-quartiers.geojson",
    zoneIdPrefix: "saint_etienne_",
    usesOverviewPresetForSearch: true,
  },
  le_havre: {
    id: "le_havre",
    sourceUrl: "/map/le-havre-quartiers.geojson",
    zoneIdPrefix: "le_havre_",
    usesOverviewPresetForSearch: true,
  },
  dijon: {
    id: "dijon",
    sourceUrl: "/map/dijon-quartiers.geojson",
    zoneIdPrefix: "dijon_",
    usesOverviewPresetForSearch: true,
  },
  angers: {
    id: "angers",
    sourceUrl: "/map/angers-quartiers.geojson",
    zoneIdPrefix: "angers_",
    usesOverviewPresetForSearch: true,
  },
  nimes: {
    id: "nimes",
    sourceUrl: "/map/nimes-quartiers.geojson",
    zoneIdPrefix: "nimes_",
    usesOverviewPresetForSearch: true,
  },
  clermont_ferrand: {
    id: "clermont_ferrand",
    sourceUrl: "/map/clermont-ferrand-quartiers.geojson",
    zoneIdPrefix: "clermont_ferrand_",
    usesOverviewPresetForSearch: true,
  },
  le_mans: {
    id: "le_mans",
    sourceUrl: "/map/le-mans-quartiers.geojson",
    zoneIdPrefix: "le_mans_",
    usesOverviewPresetForSearch: true,
  },
  aix_en_provence: {
    id: "aix_en_provence",
    sourceUrl: "/map/aix-en-provence-quartiers.geojson",
    zoneIdPrefix: "aix_en_provence_",
    usesOverviewPresetForSearch: true,
  },
  brest: {
    id: "brest",
    sourceUrl: "/map/brest-quartiers.geojson",
    zoneIdPrefix: "brest_",
    usesOverviewPresetForSearch: true,
  },
  tours: {
    id: "tours",
    sourceUrl: "/map/tours-quartiers.geojson",
    zoneIdPrefix: "tours_",
    usesOverviewPresetForSearch: true,
  },
  amiens: {
    id: "amiens",
    sourceUrl: "/map/amiens-quartiers.geojson",
    zoneIdPrefix: "amiens_",
    usesOverviewPresetForSearch: true,
  },
  perpignan: {
    id: "perpignan",
    sourceUrl: "/map/perpignan-quartiers.geojson",
    zoneIdPrefix: "perpignan_",
    usesOverviewPresetForSearch: true,
  },
  metz: {
    id: "metz",
    sourceUrl: "/map/metz-quartiers.geojson",
    zoneIdPrefix: "metz_",
    usesOverviewPresetForSearch: true,
  },
  limoges: {
    id: "limoges",
    sourceUrl: "/map/limoges-quartiers.geojson",
    zoneIdPrefix: "limoges_",
    usesOverviewPresetForSearch: true,
  },
  besancon: {
    id: "besancon",
    sourceUrl: "/map/besancon-quartiers.geojson",
    zoneIdPrefix: "besancon_",
    usesOverviewPresetForSearch: true,
  },
  mulhouse: {
    id: "mulhouse",
    sourceUrl: "/map/mulhouse-quartiers.geojson",
    zoneIdPrefix: "mulhouse_",
    usesOverviewPresetForSearch: true,
  },
  caen: {
    id: "caen",
    sourceUrl: "/map/caen-quartiers.geojson",
    zoneIdPrefix: "caen_",
    usesOverviewPresetForSearch: true,
  },
  nancy: {
    id: "nancy",
    sourceUrl: "/map/nancy-quartiers.geojson",
    zoneIdPrefix: "nancy_",
    usesOverviewPresetForSearch: true,
  },
  avignon: {
    id: "avignon",
    sourceUrl: "/map/avignon-quartiers.geojson",
    zoneIdPrefix: "avignon_",
    usesOverviewPresetForSearch: true,
  },
  poitiers: {
    id: "poitiers",
    sourceUrl: "/map/poitiers-quartiers.geojson",
    zoneIdPrefix: "poitiers_",
    usesOverviewPresetForSearch: true,
  },
  pau: {
    id: "pau",
    sourceUrl: "/map/pau-quartiers.geojson",
    zoneIdPrefix: "pau_",
    usesOverviewPresetForSearch: true,
  },
  la_rochelle: {
    id: "la_rochelle",
    sourceUrl: "/map/la-rochelle-quartiers.geojson",
    zoneIdPrefix: "la_rochelle_",
    usesOverviewPresetForSearch: true,
  },
  calais: {
    id: "calais",
    sourceUrl: "/map/calais-quartiers.geojson",
    zoneIdPrefix: "calais_",
    usesOverviewPresetForSearch: true,
  },
  dunkerque: {
    id: "dunkerque",
    sourceUrl: "/map/dunkerque-quartiers.geojson",
    zoneIdPrefix: "dunkerque_",
    usesOverviewPresetForSearch: true,
  },
  saint_nazaire: {
    id: "saint_nazaire",
    sourceUrl: "/map/saint-nazaire-quartiers.geojson",
    zoneIdPrefix: "saint_nazaire_",
    usesOverviewPresetForSearch: true,
  },
  troyes: {
    id: "troyes",
    sourceUrl: "/map/troyes-quartiers.geojson",
    zoneIdPrefix: "troyes_",
    usesOverviewPresetForSearch: true,
  },
  valence: {
    id: "valence",
    sourceUrl: "/map/valence-quartiers.geojson",
    zoneIdPrefix: "valence_",
    usesOverviewPresetForSearch: true,
  },
  chambery: {
    id: "chambery",
    sourceUrl: "/map/chambery-quartiers.geojson",
    zoneIdPrefix: "chambery_",
    usesOverviewPresetForSearch: true,
  },
  niort: {
    id: "niort",
    sourceUrl: "/map/niort-quartiers.geojson",
    zoneIdPrefix: "niort_",
    usesOverviewPresetForSearch: true,
  },
  lorient: {
    id: "lorient",
    sourceUrl: "/map/lorient-quartiers.geojson",
    zoneIdPrefix: "lorient_",
    usesOverviewPresetForSearch: true,
  },
  quimper: {
    id: "quimper",
    sourceUrl: "/map/quimper-quartiers.geojson",
    zoneIdPrefix: "quimper_",
    usesOverviewPresetForSearch: true,
  },
  montauban: {
    id: "montauban",
    sourceUrl: "/map/montauban-quartiers.geojson",
    zoneIdPrefix: "montauban_",
    usesOverviewPresetForSearch: true,
  },
  beauvais: {
    id: "beauvais",
    sourceUrl: "/map/beauvais-quartiers.geojson",
    zoneIdPrefix: "beauvais_",
    usesOverviewPresetForSearch: true,
  },
  vannes: {
    id: "vannes",
    sourceUrl: "/map/vannes-quartiers.geojson",
    zoneIdPrefix: "vannes_",
    usesOverviewPresetForSearch: true,
  },
  cholet: {
    id: "cholet",
    sourceUrl: "/map/cholet-quartiers.geojson",
    zoneIdPrefix: "cholet_",
    usesOverviewPresetForSearch: true,
  },
  la_roche_sur_yon: {
    id: "la_roche_sur_yon",
    sourceUrl: "/map/la-roche-sur-yon-quartiers.geojson",
    zoneIdPrefix: "la_roche_sur_yon_",
    usesOverviewPresetForSearch: true,
  },
  bayonne: {
    id: "bayonne",
    sourceUrl: "/map/bayonne-quartiers.geojson",
    zoneIdPrefix: "bayonne_",
    usesOverviewPresetForSearch: true,
  },
  trappes: {
    id: "trappes",
    sourceUrl: "/map/trappes-quartiers.geojson",
    zoneIdPrefix: "trappes_",
    usesOverviewPresetForSearch: true,
  },
};

export function isCitySubdivisionId(value: string): value is CitySubdivisionId {
  return Object.prototype.hasOwnProperty.call(CITY_SUBDIVISION_CONFIGS, value);
}

export function getCitySubdivisionConfig(value: string | null | undefined) {
  return value && isCitySubdivisionId(value) ? CITY_SUBDIVISION_CONFIGS[value] : null;
}

export function getStandaloneCitySubdivisionIdForCommuneCode(
  communeCode: string | null | undefined,
) {
  if (!communeCode) return null;
  return STANDALONE_CITY_ID_BY_COMMUNE_CODE.get(String(communeCode)) ?? null;
}

export function getCitySubdivisionConfigForZoneId(zoneId: string | null | undefined) {
  if (!zoneId) return null;
  return Object.values(CITY_SUBDIVISION_CONFIGS).find((config) => (
    zoneId.startsWith(config.zoneIdPrefix)
    && !zoneId.startsWith(config.metropolitanArea?.communeZoneIdPrefix ?? "\0")
    && !zoneId.startsWith(config.metropolitanArea?.subzoneZoneIdPrefix ?? "\0")
  )) ?? null;
}

export function getMetropolitanCityConfigForCommuneZoneId(zoneId: string | null | undefined) {
  if (!zoneId) return null;
  return Object.values(CITY_SUBDIVISION_CONFIGS).find(
    (config) => config.metropolitanArea && zoneId.startsWith(config.metropolitanArea.communeZoneIdPrefix),
  ) ?? null;
}

export function getMetropolitanCityConfigForSubzoneZoneId(zoneId: string | null | undefined) {
  if (!zoneId) return null;
  return Object.values(CITY_SUBDIVISION_CONFIGS).find(
    (config) => config.metropolitanArea && zoneId.startsWith(config.metropolitanArea.subzoneZoneIdPrefix),
  ) ?? null;
}

export function getOwningCitySubdivisionConfigForZoneId(zoneId: string | null | undefined) {
  return getMetropolitanCityConfigForCommuneZoneId(zoneId)
    ?? getMetropolitanCityConfigForSubzoneZoneId(zoneId)
    ?? getCitySubdivisionConfigForZoneId(zoneId);
}
