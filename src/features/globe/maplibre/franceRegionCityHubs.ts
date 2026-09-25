import type { Feature, FeatureCollection, Point } from "geojson";
import {
  FRANCE_REGION_CITY_CATALOG,
  type FranceRegionCityTier,
} from "./franceRegionCityCatalog";

type RegionCityHubProperties = {
  artistCount: number;
  avatarCount: number;
  circleRadius: number;
  coverageAnchor: boolean;
  glowColor: string;
  glowRadius: number;
  hoverCountLabel: string;
  id: string;
  importance: number;
  labelLat: number;
  labelLng: number;
  name: string;
  nearMajorCity: boolean;
  nearestMajorDistanceKm: number | null;
  pointColor: string;
  pointLevel: "major" | "secondary" | "local";
  presetName?: string;
  rank: number;
  regionId: string;
  regionName: string;
  targetBearing: number;
  targetCurve: number;
  targetLat: number;
  targetLng: number;
  targetPitch: number;
  targetSpeed: number;
  targetZoom: number;
  tier: FranceRegionCityTier;
  zoneType: string;
};

const REGION_ID_BY_NORMALIZED_NAME: Record<string, string> = {
  auvergnerhonealpes: "auvergne-rhone-alpes",
  bourgognefranchecomte: "bourgogne-franche-comte",
  bretagne: "bretagne",
  centrevaldeloire: "centre-val-de-loire",
  corse: "corse",
  grandest: "grand-est",
  hautsdefrance: "hauts-de-france",
  iledefrance: "ile-de-france",
  normandie: "normandie",
  nouvelleaquitaine: "nouvelle-aquitaine",
  occitanie: "occitanie",
  paysdelaloire: "pays-de-la-loire",
  provencealpescotedazur: "provence-alpes-cote-d-azur",
};

export const FRANCE_REGION_IDS = Object.values(REGION_ID_BY_NORMALIZED_NAME);

const PRESET_BY_CITY_NAME: Record<string, string> = {
  lille: "lille",
  lyon: "lyon",
  marseille: "marseille",
  nantes: "nantes",
  nice: "nice",
  paris: "paris",
};

const NEAR_MAJOR_CITY_DISTANCE_METERS = 18_000;
const COVERAGE_ANCHOR_MIN_SPACING_METERS = 52_000;
const COVERAGE_ANCHOR_MAX_PER_REGION = 3;
const FORCED_COVERAGE_ANCHOR_IDS = new Set([
  "commune-05061", // Gap
  "commune-04070", // Digne-les-Bains
  "commune-04019", // Barcelonnette
]);

function normalizeCityName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, "")
    .replace(/&/g, "et")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "");
}

function getPointLevel(tier: FranceRegionCityTier): RegionCityHubProperties["pointLevel"] {
  if (tier === 1) return "major";
  if (tier === 2) return "secondary";
  return "local";
}

function getPointStyle(pointLevel: RegionCityHubProperties["pointLevel"], importance: number) {
  if (pointLevel === "major" && importance >= 96) {
    return {
      circleRadius: 7.6,
      glowRadius: 22,
      glowColor: "#33FF91",
      pointColor: "#D8FFE8",
    };
  }

  if (pointLevel === "major") {
    return {
      circleRadius: 5.9,
      glowRadius: 16,
      glowColor: "#24F982",
      pointColor: "#B7FFD3",
    };
  }

  if (pointLevel === "secondary") {
    return {
      circleRadius: 3.7,
      glowRadius: 9.5,
      glowColor: "#1FEA78",
      pointColor: "#8EFFBE",
    };
  }

  return {
    circleRadius: 2.35,
    glowRadius: 4.8,
    glowColor: "#16C965",
    pointColor: "#72F5A7",
  };
}

function getDistanceMeters(a: readonly [number, number], b: readonly [number, number]) {
  const midLat = (a[1] + b[1]) / 2;
  const metersPerLngDegree = 111_320 * Math.max(0.08, Math.cos(midLat * Math.PI / 180));
  const dx = (a[0] - b[0]) * metersPerLngDegree;
  const dy = (a[1] - b[1]) * 110_540;
  return Math.hypot(dx, dy);
}

function buildCoverageAnchorIds() {
  const citiesByRegion = new Map<string, Array<(typeof FRANCE_REGION_CITY_CATALOG)[number]>>();
  const coverageAnchorIds = new Set<string>();

  for (const city of FRANCE_REGION_CITY_CATALOG) {
    const regionCities = citiesByRegion.get(city.regionId) ?? [];
    regionCities.push(city);
    citiesByRegion.set(city.regionId, regionCities);
  }

  for (const regionCities of citiesByRegion.values()) {
    const selected = regionCities.filter((city) => FORCED_COVERAGE_ANCHOR_IDS.has(city.id));
    const referenceCities = regionCities.filter((city) => city.tier === 1 || FORCED_COVERAGE_ANCHOR_IDS.has(city.id));
    selected.forEach((city) => coverageAnchorIds.add(city.id));

    while (selected.length < COVERAGE_ANCHOR_MAX_PER_REGION) {
      let bestCandidate: (typeof FRANCE_REGION_CITY_CATALOG)[number] | null = null;
      let bestSpacing = -Infinity;

      for (const city of regionCities) {
        if (city.tier === 1 || coverageAnchorIds.has(city.id)) continue;

        const spacing = referenceCities.length > 0
          ? Math.min(...referenceCities.map((reference) => getDistanceMeters(city.center, reference.center)))
          : Infinity;
        if (spacing < COVERAGE_ANCHOR_MIN_SPACING_METERS) continue;

        const isBetterCandidate = spacing > bestSpacing
          || (spacing === bestSpacing && city.importance > (bestCandidate?.importance ?? -Infinity));
        if (!isBetterCandidate) continue;

        bestCandidate = city;
        bestSpacing = spacing;
      }

      if (!bestCandidate) break;
      selected.push(bestCandidate);
      referenceCities.push(bestCandidate);
      coverageAnchorIds.add(bestCandidate.id);
    }
  }

  return coverageAnchorIds;
}

function getNearestMajorCityDistanceMeters(city: (typeof FRANCE_REGION_CITY_CATALOG)[number]) {
  if (city.tier === 1) return null;

  let nearestDistance = Infinity;
  for (const candidate of FRANCE_REGION_CITY_CATALOG) {
    if (candidate.regionId !== city.regionId || candidate.tier !== 1) continue;
    nearestDistance = Math.min(nearestDistance, getDistanceMeters(city.center, candidate.center));
  }

  return Number.isFinite(nearestDistance) ? nearestDistance : null;
}

function buildFranceRegionCityHubs(): FeatureCollection<Point, RegionCityHubProperties> {
  const rankByRegion = new Map<string, number>();
  const features: Array<Feature<Point, RegionCityHubProperties>> = [];
  const coverageAnchorIds = buildCoverageAnchorIds();

  for (const city of FRANCE_REGION_CITY_CATALOG) {
    const [targetLng, targetLat] = city.center;
    const rank = (rankByRegion.get(city.regionId) ?? 0) + 1;
    const pointLevel = getPointLevel(city.tier);
    const pointStyle = getPointStyle(pointLevel, city.importance);
    const presetName = PRESET_BY_CITY_NAME[normalizeCityName(city.label)];
    const nearestMajorDistanceMeters = getNearestMajorCityDistanceMeters(city);
    const nearMajorCity = nearestMajorDistanceMeters !== null
      && nearestMajorDistanceMeters < NEAR_MAJOR_CITY_DISTANCE_METERS;

    rankByRegion.set(city.regionId, rank);

    features.push({
      type: "Feature",
      id: city.id,
      properties: {
        id: city.id,
        name: city.label,
        ...(presetName ? { presetName } : {}),
        ...pointStyle,
        coverageAnchor: coverageAnchorIds.has(city.id),
        pointLevel,
        rank,
        importance: city.importance,
        labelLng: targetLng,
        labelLat: targetLat,
        nearMajorCity,
        nearestMajorDistanceKm: nearestMajorDistanceMeters === null
          ? null
          : Math.round(nearestMajorDistanceMeters / 100) / 10,
        targetLng,
        targetLat,
        targetZoom: city.zoom,
        targetPitch: 60,
        targetBearing: city.bearing,
        targetSpeed: city.speed,
        targetCurve: 1.3,
        artistCount: 0,
        avatarCount: 0,
        hoverCountLabel: "0 profils",
        regionId: city.regionId,
        regionName: city.regionName,
        tier: city.tier,
        zoneType: "regional-city-hub",
      },
      geometry: {
        type: "Point",
        coordinates: [targetLng, targetLat],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

export const FRANCE_REGION_CITY_HUBS_GEOJSON = buildFranceRegionCityHubs();
