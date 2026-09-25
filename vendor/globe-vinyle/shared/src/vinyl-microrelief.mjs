// A pressed record has differently spaced cuts and two unequally polished
// shoulders. Build this once, then let the GPU integrate the subpixel cuts
// through mipmaps. No time-dependent noise or per-frame texture generation.
export function createVinylMicrorelief(size = 8192) {
  let seed = 0x6d2b79f5;
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const cuts = [];
  let position = 0;
  while (position < 1.01) {
    const width = (0.78 + random() * 0.58) / 216;
    cuts.push({ start: position, end: position + width, depth: 0.62 + random() * 0.38,
      polish: 0.50 + random() * 0.48, skew: 0.34 + random() * 0.26 });
    position += width;
  }
  const data = new Uint8Array(size * 4);
  let cutIndex = 0;
  for (let x = 0; x < size; x++) {
    let brightness = 0, normal = 0, polish = 0;
    for (let tap = 0; tap < 8; tap++) {
      const radius = (x + (tap + 0.5) / 8) / size;
      while (cuts[cutIndex].end < radius) cutIndex++;
      const cut = cuts[cutIndex];
      const phase = (radius - cut.start) / (cut.end - cut.start);
      const t = phase < cut.skew ? phase / cut.skew : (1 - phase) / (1 - cut.skew);
      const wall = Math.sin(t * Math.PI / 2);
      // The crest and the dark trough stay distinct under a grazing highlight.
      brightness += 0.2 + Math.pow(wall, 2.7) * cut.depth * 0.8;
      normal += (phase < cut.skew ? 1 : -1) * Math.cos(t * Math.PI / 2) * cut.depth;
      polish += cut.polish;
    }
    data[x * 4] = Math.round(brightness / 8 * 255);
    data[x * 4 + 1] = Math.round((0.5 + normal / 16) * 255);
    data[x * 4 + 2] = Math.round(polish / 8 * 255);
    data[x * 4 + 3] = 255;
  }
  return data;
}
