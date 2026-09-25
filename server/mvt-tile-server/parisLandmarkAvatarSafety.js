const METERS_PER_LONGITUDE_DEGREE = 111_320;
const METERS_PER_LATITUDE_DEGREE = 110_540;
const MINIMUM_RADIAL_CLEARANCE_METERS = 8;
const RADIAL_JITTER_METERS = 12;
const ANGULAR_JITTER_RADIANS = 36 * Math.PI / 180;
const CENTER_DIRECTION_THRESHOLD_METERS = 1;

export const PARIS_LANDMARK_AVATAR_SAFETY_ZONES = Object.freeze([
  Object.freeze({
    id: 'eiffel-tower',
    label: 'Tour Eiffel',
    center: Object.freeze([2.294694, 48.858093]),
    radiusMeters: 140,
  }),
  Object.freeze({
    id: 'montparnasse-tower',
    label: 'Tour Montparnasse',
    center: Object.freeze([2.32195, 48.84205]),
    radiusMeters: 65,
  }),
  Object.freeze({
    id: 'notre-dame-paris',
    label: 'Notre-Dame de Paris',
    center: Object.freeze([2.349902, 48.852968]),
    radiusMeters: 80,
  }),
]);

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(value) {
  return stableHash(value) / 4_294_967_296;
}

function roundCoordinate(value) {
  return Number(value.toFixed(7));
}

function getLocalOffsetMeters(lng, lat, zone) {
  const latitudeRadians = zone.center[1] * Math.PI / 180;
  return {
    east: (lng - zone.center[0]) * METERS_PER_LONGITUDE_DEGREE * Math.cos(latitudeRadians),
    north: (lat - zone.center[1]) * METERS_PER_LATITUDE_DEGREE,
  };
}

export function getParisLandmarkAvatarDistanceMeters(lng, lat, zone) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || !zone) return Number.POSITIVE_INFINITY;
  const offset = getLocalOffsetMeters(lng, lat, zone);
  return Math.hypot(offset.east, offset.north);
}

export function getParisLandmarkSafeAvatarPosition(lng, lat, stableId) {
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return { lng, lat, moved: false, zoneId: null };
  }

  const identity = String(stableId ?? `${lng},${lat}`);
  let safeLng = lng;
  let safeLat = lat;
  let moved = false;
  let zoneId = null;

  for (const zone of PARIS_LANDMARK_AVATAR_SAFETY_ZONES) {
    const offset = getLocalOffsetMeters(safeLng, safeLat, zone);
    const distanceMeters = Math.hypot(offset.east, offset.north);
    if (distanceMeters >= zone.radiusMeters) continue;

    const salt = `${identity}|${zone.id}`;
    const originalAngle = distanceMeters >= CENTER_DIRECTION_THRESHOLD_METERS
      ? Math.atan2(offset.north, offset.east)
      : stableUnit(`${salt}|center-angle`) * Math.PI * 2;
    const angle = distanceMeters >= CENTER_DIRECTION_THRESHOLD_METERS
      ? originalAngle + (stableUnit(`${salt}|angle-jitter`) - 0.5) * ANGULAR_JITTER_RADIANS
      : originalAngle;
    const targetRadiusMeters = zone.radiusMeters
      + MINIMUM_RADIAL_CLEARANCE_METERS
      + stableUnit(`${salt}|radius-jitter`) * RADIAL_JITTER_METERS;
    const latitudeRadians = zone.center[1] * Math.PI / 180;

    safeLng = roundCoordinate(
      zone.center[0]
      + Math.cos(angle) * targetRadiusMeters
        / (METERS_PER_LONGITUDE_DEGREE * Math.cos(latitudeRadians)),
    );
    safeLat = roundCoordinate(
      zone.center[1]
      + Math.sin(angle) * targetRadiusMeters / METERS_PER_LATITUDE_DEGREE,
    );
    moved = true;
    zoneId = zone.id;
  }

  return { lng: safeLng, lat: safeLat, moved, zoneId };
}

function getAvatarStableId(avatar, fallback) {
  return avatar?.profile_id
    ?? avatar?.id
    ?? avatar?.musician_id
    ?? avatar?.artist_id
    ?? fallback;
}

export function applyParisLandmarkAvatarSafetyToRecord(avatar, stableId) {
  if (!avatar || typeof avatar !== 'object' || Array.isArray(avatar)) return avatar;
  const lng = Number(avatar.lng);
  const lat = Number(avatar.lat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return avatar;

  const safePosition = getParisLandmarkSafeAvatarPosition(
    lng,
    lat,
    stableId ?? getAvatarStableId(avatar, `${lng},${lat}`),
  );
  if (!safePosition.moved) return avatar;

  return {
    ...avatar,
    lng: safePosition.lng,
    lat: safePosition.lat,
  };
}

export function applyParisLandmarkAvatarSafetyToFeatureCollection(featureCollection) {
  if (
    !featureCollection
    || featureCollection.type !== 'FeatureCollection'
    || !Array.isArray(featureCollection.features)
  ) {
    return featureCollection;
  }

  let movedFeatureCount = 0;
  const features = featureCollection.features.map((feature, index) => {
    const coordinates = feature?.geometry?.type === 'Point'
      ? feature.geometry.coordinates
      : null;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return feature;

    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return feature;

    const stableId = getAvatarStableId(
      feature?.properties,
      feature?.id ?? `geojson-avatar-${index}`,
    );
    const safePosition = getParisLandmarkSafeAvatarPosition(lng, lat, stableId);
    if (!safePosition.moved) return feature;

    movedFeatureCount += 1;
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [safePosition.lng, safePosition.lat, ...coordinates.slice(2)],
      },
    };
  });

  if (movedFeatureCount === 0) return featureCollection;
  return {
    ...featureCollection,
    features,
  };
}

export function isParisLandmarkAvatarPositionSafe(lng, lat) {
  return PARIS_LANDMARK_AVATAR_SAFETY_ZONES.every(
    (zone) => getParisLandmarkAvatarDistanceMeters(lng, lat, zone) >= zone.radiusMeters,
  );
}
