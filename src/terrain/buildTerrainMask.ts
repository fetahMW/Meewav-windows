import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import pointToLineDistance from '@turf/point-to-line-distance';
import { point, polygon, lineString } from '@turf/helpers';
import type { TerrainProfile, LngLat } from './profiles/niceTerrainProfile.ts';

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function polygonToLine(coords: LngLat[]) {
  return lineString(coords);
}

export function computeReliefWeight(
  lngLat: LngLat,
  profile: TerrainProfile
): number {
  const p = point(lngLat);
  const poly = polygon([profile.innerPolygon]);
  const boundary = polygonToLine(profile.innerPolygon);

  const inside = booleanPointInPolygon(p, poly);

  if (inside) {
    return 1;
  }

  const distanceKm = pointToLineDistance(p, boundary, {
    units: 'kilometers',
  });

  const distanceMeters = distanceKm * 1000;

  if (distanceMeters >= profile.featherMeters) {
    return 0;
  }

  // Plus on s’éloigne de la ligne rouge, plus le relief descend doucement.
  const t = smoothstep(0, profile.featherMeters, distanceMeters);

  return 1 - t;
}

export function computeFeatheredHeight(params: {
  lngLat: LngLat;
  rawHeightMeters: number;
  profile: TerrainProfile;
  optionalRoadProtectionWeight?: number;
}): number {
  const {
    lngLat,
    rawHeightMeters,
    profile,
    optionalRoadProtectionWeight,
  } = params;

  let weight = computeReliefWeight(lngLat, profile);

  // Optionnel :
  // Si on est dans un corridor routier protégé, on peut réduire encore le relief
  // pour éviter qu’une route principale se torde.
  if (typeof optionalRoadProtectionWeight === 'number') {
    weight = Math.min(weight, optionalRoadProtectionWeight);
  }

  const base = profile.baseElevationMeters;

  return base + (rawHeightMeters - base) * weight;
}
