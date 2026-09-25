// Reference units from master-prompt-anneaux-react-vite.md, scaled as one
// object to the existing globe. The globe camera and fixed ring axle stay put.
export const ORBIT_REFERENCE = Object.freeze({
  outerContour: 6.54, contourHeight: -0.09,
  bands: Object.freeze([
    Object.freeze({ inner: 4.15, outer: 4.42, height: 0.24, crown: 0.025, thickness: 0.05, sheen: 0.66 }),
    Object.freeze({ inner: 4.61, outer: 4.81, height: 0.14, crown: 0.030, thickness: 0.05, sheen: 0.42 }),
    Object.freeze({ inner: 5.10, outer: 5.77, height: 0, crown: 0.064, thickness: 0.07, sheen: 1 }),
    Object.freeze({ inner: 6.02, outer: 6.30, height: -0.07, crown: 0.035, thickness: 0.055, sheen: 0.48 }),
  ]),
});

// Keep the compact radial spacing, with all ribbon tops on one flat plane.
// Source elevations and crowns remain available for a later profile adjustment.
export const ORBIT_SPACING = Object.freeze({ gapScale: 0.65, elevationScale: 0, crownScale: 0 });

export const ORBIT_APPEARANCE = Object.freeze({
  violet: '#b353ff', blue: '#557dff', pearl: '#e5e6ff', ink: '#03030b',
  neonViolet: '#AE3BFF', neonBlue: '#3D4FFF', surfaceExposure: 1.15,
  animated: true, quality: 'high', intensity: 1,
  reflections: Object.freeze({
    left: Object.freeze({ center: 2.65, halfLength: 1.24 }),
    right: Object.freeze({ center: 0.44, halfLength: 1.18 }),
    // Only the low-angle view needs a narrower, more coloured reflection.
    // Above this viewing-angle range the approved overhead material is intact.
    grazing: Object.freeze({ fullBelow: 0.38, offAbove: 0.60,
      pearlWidth: 0.40, pearlStrength: 0.48, pearlWhiteness: 0.38, coatStrength: 0.40 }),
  }),
  qualityLevels: Object.freeze({
    high: Object.freeze({ angularSegments: 640, radialSegments: 12, bloomScale: 0.5 }),
    low: Object.freeze({ angularSegments: 320, radialSegments: 10, bloomScale: 0.35 }),
  }),
  bloom: Object.freeze({ enabled: true, threshold: 1, strength: 0.55, radius: 0.22, displayExposure: 0.18 }),
});

// Optical profiles only; ORBIT_REFERENCE and ORBIT_SPACING own the geometry.
// A polished shoulder fades into a dark body; mirroring it across each ribbon
// would make the four lamellae look like evenly lit plastic tubes.
export const ORBIT_COAT = Object.freeze([
  { crest: 0.74, shoulder: 0.16, pearl: 0.042, tail: 0.28, gain: 0.90, secondary: 0.16 },
  { crest: 0.24, shoulder: 0.13, pearl: 0.025, tail: 0.19, gain: 0.58, secondary: 0.09 },
  { crest: 0.86, shoulder: 0.20, pearl: 0.048, tail: 0.43, gain: 1.00, secondary: 0.07 },
  { crest: 0.79, shoulder: 0.10, pearl: 0.028, tail: 0.21, gain: 0.48, secondary: 0.11 },
].map(profile => Object.freeze(profile)));

// Each arc occupies 65–90 degrees of one existing edge, with no head or dots.
export const ORBIT_ARCS = Object.freeze([
  { band: 0, edge: 0.07, center: 2.65, length: 80, speed: 0.035, strength: 3.8 },
  { band: 0, edge: 0.93, center: 1.14, length: 90, speed: -0.043, strength: 4.2 },
  { band: 1, edge: 0.90, center: 0.32, length: 65, speed: 0.030, strength: 2.8 },
  { band: 2, edge: 0.04, center: 2.72, length: 80, speed: -0.037, strength: 4.3 },
  { band: 2, edge: 0.96, center: 0.62, length: 85, speed: 0.046, strength: 4.5 },
  { band: 3, edge: 0.95, center: 2.38, length: 75, speed: -0.032, strength: 3.4 },
].map(arc => Object.freeze({ ...arc, halfLength: arc.length * Math.PI / 360 })));

export function orbitLayout(outerRadius, quality = ORBIT_APPEARANCE.quality) {
  const scale = outerRadius / ORBIT_REFERENCE.outerContour;
  const bands = new Array(ORBIT_REFERENCE.bands.length);
  let outerCursor = ORBIT_REFERENCE.outerContour, referenceCursor = ORBIT_REFERENCE.outerContour;
  // Pack inward from the fixed outer contour. Geometry, portrait rows, surface
  // contact and occlusion all consume this same compact layout.
  for (let id = bands.length - 1; id >= 0; id--) {
    const band = ORBIT_REFERENCE.bands[id];
    const gap = (referenceCursor - band.outer) * ORBIT_SPACING.gapScale;
    const outer = outerCursor - gap, inner = outer - (band.outer - band.inner);
    bands[id] = { ...band, id, inner: inner * scale, outer: outer * scale,
      height: band.height * ORBIT_SPACING.elevationScale * scale,
      crown: band.crown * ORBIT_SPACING.crownScale * scale, thickness: band.thickness * scale };
    outerCursor = inner;
    referenceCursor = band.inner;
  }
  return { scale, bands, innerRadius: bands[0].inner, outerRadius,
    contourHeight: ORBIT_REFERENCE.contourHeight * ORBIT_SPACING.elevationScale * scale,
    ...ORBIT_APPEARANCE.qualityLevels[quality === 'low' ? 'low' : 'high'] };
}
