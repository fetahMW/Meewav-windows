export type LngLat = [number, number];

export type TerrainProfile = {
  id: string;
  label: string;

  // Polygone intérieur : relief complet.
  innerPolygon: LngLat[];

  // Largeur de transition douce après la ligne rouge.
  featherMeters: number;

  // Hauteur de base vers laquelle on revient.
  // Pour Nice, on peut commencer à 0 ou à une valeur moyenne faible.
  baseElevationMeters: number;

  // Exagération terrain finale côté MapLibre.
  exaggeration: number;

  // Routes principales à protéger éventuellement.
  roadProtectionMeters: number;
};

export const niceTerrainProfile: TerrainProfile = {
  id: 'nice_feathered_terrain',
  label: 'Nice custom feathered terrain',

  // À remplacer par le vrai polygone dessiné autour de Nice.
  // L’ordre doit former un polygone fermé.
  innerPolygon: [
    [7.185, 43.675],
    [7.210, 43.705],
    [7.245, 43.730],
    [7.295, 43.745],
    [7.355, 43.735],
    [7.405, 43.705],
    [7.390, 43.660],
    [7.315, 43.655],
    [7.245, 43.660],
    [7.185, 43.675],
  ],

  featherMeters: 2500,
  baseElevationMeters: 0,
  exaggeration: 0.85,
  roadProtectionMeters: 35,
};
