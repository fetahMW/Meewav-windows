import { GROOVES } from './record-utils.js';

// Numeric counterpart of components/vinyl.css. Values are sRGB, as in CSS.
// These strips carry the supplied artwork into a perspective-correct 3D mesh;
// the renderer needs no screenshot, DOM rasterizer or texture download.
export const RECORD_ARTWORK_INNER = 0.376;
const DESIGN_DIAMETER = 780;
const TRACK_RADII = [238, 310, 372, 431, 471];
const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const modulo = (n, period) => ((n % period) + period) % period;
const mix = (a, b, t) => a + (b - a) * t;
const rgba = (r, g = r, b = r, a = 1) => [r / 255, g / 255, b / 255, a];
const clear = rgba(0, 0, 0, 0);

const MICRO = [
  [0, clear], [.45, rgba(75, 75, 77, .1)], [.8, rgba(2, 2, 3)],
  [1.25, rgba(31, 31, 32, .38)], [1.75, rgba(9, 9, 10)], [2.15, rgba(4, 4, 5)],
];
const HAIRLINES = [
  [0, clear], [1, clear], [1.35, rgba(0, 0, 0, .7)],
  [1.6, clear], [1.9, rgba(255, 255, 255, .14)], [2.15, clear],
];
const BODY = [
  [0, rgba(10, 10, 11)], [.2, rgba(9)], [.4, rgba(17, 17, 18)],
  [.62, rgba(5, 5, 6)], [.83, rgba(14, 14, 15)], [1, rgba(10, 10, 11)],
];
const SPECULAR = [
  [0, clear], [18, clear], [26, rgba(241, 241, 246, .04)],
  [39, rgba(234, 234, 238, .16)], [47, rgba(239, 239, 244, .30)],
  [57, rgba(220, 220, 228, .19)], [75, rgba(175, 175, 182, .07)],
  [92, rgba(240, 240, 243, .17)], [99, rgba(231, 231, 236, .09)],
  [112, clear], [182, clear], [202, rgba(181, 181, 189, .04)],
  [221, rgba(239, 239, 245, .26)], [228, rgba(239, 239, 245, .32)],
  [238, rgba(221, 221, 228, .19)], [251, rgba(171, 171, 176, .04)],
  [262, clear], [286, clear], [302, rgba(232, 232, 238, .12)],
  [312, rgba(241, 241, 243, .20)], [324, rgba(223, 223, 228, .10)],
  [343, clear], [360, clear],
];

// CSS gradients interpolate premultiplied colour, including transparent stops.
function gradient(stops, position) {
  let i = 1;
  while (i < stops.length - 1 && position > stops[i][0]) i++;
  const [start, a] = stops[i - 1], [end, b] = stops[i];
  const t = clamp((position - start) / (end - start));
  return [mix(a[0] * a[3], b[0] * b[3], t), mix(a[1] * a[3], b[1] * b[3], t),
    mix(a[2] * a[3], b[2] * b[3], t), mix(a[3], b[3], t)];
}

function over(base, r, g, b, alpha) {
  base[0] = base[0] * (1 - alpha) + r * alpha;
  base[1] = base[1] * (1 - alpha) + g * alpha;
  base[2] = base[2] * (1 - alpha) + b * alpha;
  // Alpha holds the transmission of the conic PVC layer beneath the engraving.
  base[3] *= 1 - alpha;
}

function engraving(radius, trackHalfWidth = 1.75) {
  const rotorRadius = radius / .987 * 500;
  const micro = gradient(MICRO, modulo(radius * DESIGN_DIAMETER / 2, 2.15));
  const color = [micro[0], micro[1], micro[2], 1 - micro[3]];
  // Only adjacent SVG circles can intersect this texel. Keep the supplied
  // widths and opacity variation rather than replacing them with a sine wave.
  const nearest = Math.round((rotorRadius - 190) / 1.375);
  for (let i = Math.max(0, nearest - 1); i <= Math.min(GROOVES.length - 1, nearest + 1); i++) {
    const groove = GROOVES[i];
    if (Math.abs(rotorRadius - groove.radius) <= groove.width / 2) {
      over(color, 1, 1, 1, groove.opacity * .95);
    }
  }
  for (const track of TRACK_RADII) {
    if (Math.abs(rotorRadius - track) <= trackHalfWidth) over(color, 3 / 255, 3 / 255, 4 / 255, .8 * .95);
    if (Math.abs(rotorRadius - track - 2) <= .3) over(color, 131 / 255, 131 / 255, 131 / 255, .15 * .95);
  }
  // Pressed outer rim, from the inset shadows of .vinyl-edge.
  const edge = (1 - radius) * DESIGN_DIAMETER / 2;
  if (edge < 7) over(color, 0, 0, 0, .6);
  if (edge >= 4 && edge < 5) over(color, 1, 1, 1, .06);
  if (edge < 4) over(color, 0, 0, 0, .5);
  if (edge < 1) over(color, 0, 0, 0, .8);
  return color;
}

function hairline(radius) {
  const sample = gradient(HAIRLINES, modulo(radius * DESIGN_DIAMETER / 2, 2.15));
  const maskRadius = radius / .986;
  const mask = clamp((maskRadius - .37) / .03) * clamp((.99 - maskRadius) / .03);
  const opacity = .3 * mask;
  return [1 - sample[3] * opacity, sample[0] * opacity, sample[1] * opacity, sample[2] * opacity];
}

function strip(size, sample) {
  const data = new Uint8Array(size * 4);
  // Supersample once at creation; GPU mipmaps then filter distant/grazing grooves.
  for (let x = 0; x < size; x++) {
    const sum = [0, 0, 0, 0];
    for (let tap = 0; tap < 4; tap++) {
      const values = sample((x + (tap + .5) / 4) / size);
      for (let channel = 0; channel < 4; channel++) sum[channel] += values[channel];
    }
    for (let channel = 0; channel < 4; channel++) data[x * 4 + channel] = Math.round(clamp(sum[channel] / 4) * 255);
  }
  return data;
}

export function createRecordFinishProfiles(radialSize = 8192, { trackHalfWidth = 1.75 } = {}) {
  const angularSize = 1024;
  return {
    radialSize, angularSize,
    engraving: strip(radialSize, radius => engraving(radius, trackHalfWidth)),
    hairlines: strip(radialSize, hairline),
    body: strip(angularSize, angle => gradient(BODY, modulo(angle + 20 / 360, 1))),
    specular: strip(angularSize, angle => gradient(SPECULAR, angle * 360)),
  };
}
