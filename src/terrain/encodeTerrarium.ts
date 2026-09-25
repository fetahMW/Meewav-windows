export function encodeTerrarium(heightMeters: number) {
  // Decoding in MapLibre: height = (R * 256 + G + B / 256) - 32768
  const value = heightMeters + 32768;
  const r = Math.floor(value / 256);
  const g = Math.floor(value % 256);
  const b = Math.max(0, Math.min(255, Math.round((value - Math.floor(value)) * 256)));

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: b,
    a: 255,
  };
}
