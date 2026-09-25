export function encodeTerrainRgb(heightMeters: number) {
  // Encodage compatible Terrain-RGB Mapbox-like :
  // height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1)
  const value = Math.round((heightMeters + 10000) * 10);

  const r = Math.floor(value / (256 * 256));
  const g = Math.floor((value - r * 256 * 256) / 256);
  const b = value - r * 256 * 256 - g * 256;

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
    a: 255,
  };
}
