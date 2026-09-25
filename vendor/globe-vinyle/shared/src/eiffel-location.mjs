// Shared by the landmark renderer and the population worker: no Three.js or
// model loader is needed to reserve the ground underneath the tower.
import cityLandmarks from './city-landmarks.json' with { type: 'json' };
export const EIFFEL_LOCATION = Object.freeze({
  lon: 2.294694, lat: 48.858093, footprintMetres: 125,
  quartierId: 'fr-paris-7510704',
});

export const EIFFEL_AVATAR_LAYOUT = Object.freeze({
  clearanceRadiusMetres: 180,
  populationFactor: 0.70,
});

export const MONTPARNASSE_LOCATION = Object.freeze({
  lon: 2.32195, lat: 48.84205, footprintMetres: 80,
  quartierId: 'fr-paris-7511502',
});

export const NEGRESCO_LOCATION = Object.freeze({
  lon: 7.25802, lat: 43.6943, footprintMetres: 90,
  quartierId: 'fr-quartier-06088-5ca3e1c99533',
});

const clearances = [
  { ...EIFFEL_LOCATION, radius: EIFFEL_AVATAR_LAYOUT.clearanceRadiusMetres },
  { ...MONTPARNASSE_LOCATION, radius: 110 },
  { ...NEGRESCO_LOCATION, radius: 75 },
  ...cityLandmarks.map(item => ({ lon: item.lon, lat: item.lat, radius: item.clearanceRadiusMetres })),
].map(zone => ({ ...zone, metresLng: 111320 * Math.cos(zone.lat * Math.PI / 180) }));

const metresLat = 110574;

export function eiffelPlacementConstraint(box) {
  // Also protects neighbouring polygons intersecting the circular clearance.
  // All other quarters keep their existing placement path.
  const nearby = clearances.filter(zone => {
    const dx = zone.radius / zone.metresLng, dy = zone.radius / metresLat;
    return box.east >= zone.lon - dx && box.west <= zone.lon + dx
      && box.north >= zone.lat - dy && box.south <= zone.lat + dy;
  });
  if (!nearby.length) return null;
  return (lon, lat) => {
    for (const zone of nearby) {
      const x = (lon - zone.lon) * zone.metresLng;
      const y = (lat - zone.lat) * metresLat;
      if (x * x + y * y < zone.radius * zone.radius) return false;
    }
    return true;
  };
}
