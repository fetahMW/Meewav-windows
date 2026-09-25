import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";

const outRoot = path.join(process.cwd(), "public", "map", "landmarks", "castle-hill-dem");

// 1. Castle Hill Definitions
const castleHillPolygon = [
  [7.27485, 43.6969],
  [7.27585, 43.69475],
  [7.2821, 43.69215],
  [7.2857, 43.69355],
  [7.28705, 43.69605],
  [7.28555, 43.69835],
  [7.2823, 43.69935],
  [7.27825, 43.69875],
  [7.27485, 43.6969],
];
const castleHillSummit = { lng: 7.2809, lat: 43.6962 };

// 2. Mont Boron Definitions
const montBoronPolygon = [
  [7.2870, 43.6920],
  [7.2890, 43.6820],
  [7.2930, 43.6740],
  [7.3020, 43.6730],
  [7.3140, 43.6750],
  [7.3230, 43.6820],
  [7.3250, 43.6920],
  [7.3180, 43.7020],
  [7.3090, 43.7120],
  [7.2990, 43.7140],
  [7.2920, 43.7070],
  [7.2890, 43.6970],
  [7.2870, 43.6920]
];
const montBoronSummit = { lng: 7.3010, lat: 43.6930 };

// 3. Nice Center Definitions
const niceCenterPolygon = [
  [7.2350, 43.6950],
  [7.2380, 43.6820],
  [7.2500, 43.6800],
  [7.2680, 43.6820],
  [7.2740, 43.6920],
  [7.2740, 43.6980],
  [7.2680, 43.7050],
  [7.2550, 43.7150],
  [7.2400, 43.7140],
  [7.2350, 43.7050],
  [7.2350, 43.6950],
];

// Expanded Bounding Box for the Nice local DEM area
const bounds = {
  west: 7.230,
  south: 43.665,
  east: 7.330,
  north: 43.720,
};

function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function lat2tile(lat, z) {
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * 2 ** z);
}

function tile2lon(x, z) {
  return x / 2 ** z * 360 - 180;
}

function tile2lat(y, z) {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z;
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function pointInPolygon(lng, lat, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersects = ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function encodeTerrarium(heightMeters) {
  const value = Math.max(0, Math.min(65535.996, heightMeters + 32768));
  const red = Math.floor(value / 256);
  const green = Math.floor(value - red * 256);
  const blue = Math.floor((value - Math.floor(value)) * 256);
  return [red, green, blue];
}

function gaussian(lng, lat, center, sx, sy, weight) {
  const dx = (lng - center.lng) / sx;
  const dy = (lat - center.lat) / sy;
  return weight * Math.exp(-(dx * dx + dy * dy));
}

function metersPerDegreeLng(lat) {
  return 111_320 * Math.cos(lat * Math.PI / 180);
}

function pointSegmentDistanceMeters(pointLng, pointLat, a, b) {
  const scaleLng = metersPerDegreeLng(pointLat);
  const ax = (a[0] - pointLng) * scaleLng;
  const ay = (a[1] - pointLat) * 110_540;
  const bx = (b[0] - pointLng) * scaleLng;
  const by = (b[1] - pointLat) * 110_540;
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSq = abx * abx + aby * aby || 1;
  const t = Math.max(0, Math.min(1, -(ax * abx + ay * aby) / lengthSq));
  const x = ax + abx * t;
  const y = ay + aby * t;
  return Math.hypot(x, y);
}

function distanceToPolygonEdgeMeters(lng, lat, poly) {
  let minDistance = Infinity;
  for (let i = 0; i < poly.length - 1; i += 1) {
    minDistance = Math.min(minDistance, pointSegmentDistanceMeters(lng, lat, poly[i], poly[i + 1]));
  }
  return minDistance;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function getShorelineLat(lng) {
  const shorelinePoints = [
    { lng: 7.200, lat: 43.662 },
    { lng: 7.220, lat: 43.665 },
    { lng: 7.235, lat: 43.682 },
    { lng: 7.250, lat: 43.687 },
    { lng: 7.265, lat: 43.691 },
    { lng: 7.275, lat: 43.692 },
    { lng: 7.285, lat: 43.688 },
    { lng: 7.300, lat: 43.680 },
    { lng: 7.315, lat: 43.682 },
    { lng: 7.330, lat: 43.690 },
  ];

  for (let index = 0; index < shorelinePoints.length - 1; index += 1) {
    const p1 = shorelinePoints[index];
    const p2 = shorelinePoints[index + 1];
    if (lng >= p1.lng && lng <= p2.lng) {
      const t = (lng - p1.lng) / (p2.lng - p1.lng);
      return p1.lat + t * (p2.lat - p1.lat);
    }
  }
  return 43.68;
}

function isCoordinateInSea(lng, lat) {
  if (lat < 43.65) return true;
  if (lat > 43.72) return false;

  // Port of Nice (perfectly flat water)
  if (lng >= 7.282 && lng <= 7.288 && lat >= 43.688 && lat <= 43.698) {
    return true;
  }

  // Villefranche Bay (perfectly flat water)
  if (lng >= 7.302 && lng <= 7.325 && lat >= 43.680 && lat <= 43.708) {
    return true;
  }

  return lat < getShorelineLat(lng);
}

const shorelinePath = [
  [7.200, 43.662],
  [7.210, 43.663],
  [7.220, 43.665],
  [7.230, 43.674],
  [7.240, 43.682],
  [7.250, 43.687],
  [7.260, 43.689],
  [7.270, 43.691],
  [7.273, 43.692],
  [7.275, 43.692], // end of Quai des États-Unis
  [7.276, 43.691], // wrapping around Castle Hill
  [7.277, 43.6895],
  [7.279, 43.6885],
  [7.281, 43.6887], // entering the Port of Nice
  [7.2825, 43.6892],
  [7.2825, 43.691],  // west side of the port
  [7.2827, 43.694],
  [7.283, 43.6968],
  [7.2845, 43.6968], // north end of the port
  [7.2848, 43.694],  // east side of the port
  [7.285, 43.691],
  [7.2855, 43.689],
  [7.2862, 43.6882], // leaving the port
  [7.288, 43.685],   // west side of Mont Boron
  [7.290, 43.681],
  [7.293, 43.675],
  [7.296, 43.6718],  // Cap de Nice (southern tip)
  [7.298, 43.6725],  // entering Villefranche Bay
  [7.301, 43.675],
  [7.304, 43.680],
  [7.307, 43.687],
  [7.310, 43.693],   // Villefranche harbor/citadel
  [7.311, 43.698],
  [7.312, 43.7015],
  [7.314, 43.7025],
  [7.317, 43.702],   // Villefranche beach
  [7.320, 43.699],   // east side of Villefranche Bay
  [7.323, 43.693],
  [7.326, 43.686],
  [7.328, 43.680],
  [7.330, 43.678],
];

function distanceToShorelineMeters(lng, lat) {
  let minDistance = Infinity;
  for (let i = 0; i < shorelinePath.length - 1; i += 1) {
    minDistance = Math.min(minDistance, pointSegmentDistanceMeters(lng, lat, shorelinePath[i], shorelinePath[i + 1]));
  }
  return minDistance;
}

async function loadRawTile(z, x, y) {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch raw tile: ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  return new Promise((resolve, reject) => {
    new PNG().parse(Buffer.from(buffer), (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
}

// Gather all tiles to process
const tilesToProcess = [];
for (const z of [11, 12, 13, 14, 15]) {
  const xMin = lon2tile(bounds.west, z);
  const xMax = lon2tile(bounds.east, z);
  const yMin = lat2tile(bounds.north, z);
  const yMax = lat2tile(bounds.south, z);

  for (let x = xMin; x <= xMax; x += 1) {
    for (let y = yMin; y <= yMax; y += 1) {
      tilesToProcess.push({ z, x, y });
    }
  }
}

console.log(`Starting generation of ${tilesToProcess.length} tiles by merging S3 raw DEM with custom sculpting...`);

const BATCH_SIZE = 12;
const written = [];

for (let i = 0; i < tilesToProcess.length; i += BATCH_SIZE) {
  const batch = tilesToProcess.slice(i, i + BATCH_SIZE);
  
  await Promise.all(
    batch.map(async ({ z, x, y }) => {
      try {
        const rawPng = await loadRawTile(z, x, y);
        const png = new PNG({ width: 256, height: 256 });

        for (let py = 0; py < 256; py += 1) {
          for (let px = 0; px < 256; px += 1) {
            const idx = (py * 256 + px) * 4;
            const r = rawPng.data[idx];
            const g = rawPng.data[idx + 1];
            const b = rawPng.data[idx + 2];
            const originalElevation = (r * 256 + g + b / 256) - 32768;

            const lng = tile2lon(x + (px + 0.5) / 256, z);
            const lat = tile2lat(y + (py + 0.5) / 256, z);

            let nextElevation = originalElevation;

            if (isCoordinateInSea(lng, lat)) {
              nextElevation = 0;
            } else {
              // Apply 2D shoreline distance field transition (pente douce)
              const dist = distanceToShorelineMeters(lng, lat);
              let shorelineBlend = 1.0;
              if (dist < 15) {
                shorelineBlend = 0.0; // flat shelf of 15 meters for immediate quays/roads
              } else if (dist < 300) {
                const t = (dist - 15) / (300 - 15);
                shorelineBlend = t * t * (3 - 2 * t); // smooth gentle slope over 300 meters
              }

              // Calculate terrain scale factor (reduce height of backcountry mountains)
              let scale = 1.0;
              const inCastleHill = pointInPolygon(lng, lat, castleHillPolygon);
              const inMontBoron = pointInPolygon(lng, lat, montBoronPolygon);
              const inNiceCenter = pointInPolygon(lng, lat, niceCenterPolygon);

              if (inCastleHill || inMontBoron) {
                scale = 1.0;
              } else if (inNiceCenter) {
                scale = 0.8;
              } else {
                // Background mountains: scale down to 0.35
                const targetScale = 0.35;
                // Blend scale back to 1.0 near the edges of bounds to align with global S3 terrain
                const westDist = lng - bounds.west;
                const eastDist = bounds.east - lng;
                const southDist = lat - bounds.south;
                const northDist = bounds.north - lat;
                const minDist = Math.min(westDist, eastDist, southDist, northDist);
                const margin = 0.015; // ~1.2 km border transition zone
                if (minDist < margin) {
                  const t = Math.max(0, minDist) / margin;
                  scale = targetScale + (1.0 - targetScale) * (1.0 - t * t * (3 - 2 * t));
                } else {
                  scale = targetScale;
                }
              }

              // Add custom height sculpting on top of natural terrain
              let addition = 0;

              // Castle Hill additions
              if (inCastleHill) {
                const edgeFade = smoothstep(0, 150, distanceToPolygonEdgeMeters(lng, lat, castleHillPolygon));
                const broadHill = gaussian(lng, lat, castleHillSummit, 0.0042, 0.0032, 50); // add 50m
                const softPlateau = gaussian(lng, lat, { lng: 7.2815, lat: 43.6964 }, 0.0026, 0.0019, 10);
                addition = Math.max(addition, edgeFade * (broadHill + softPlateau));
              }

              // Mont Boron additions
              if (inMontBoron) {
                const edgeFade = smoothstep(0, 250, distanceToPolygonEdgeMeters(lng, lat, montBoronPolygon));
                const broadHill = gaussian(lng, lat, montBoronSummit, 0.0048, 0.0085, 60); // add 60m
                const softPlateau = gaussian(lng, lat, { lng: 7.3020, lat: 43.6960 }, 0.0025, 0.0045, 12);
                addition = Math.max(addition, edgeFade * (broadHill + softPlateau));
              }

              // Nice Center additions (very gentle rolling hills in the north)
              if (inNiceCenter) {
                const edgeFade = smoothstep(0, 90, distanceToPolygonEdgeMeters(lng, lat, niceCenterPolygon));
                const softHill1 = gaussian(lng, lat, { lng: 7.255, lat: 43.702 }, 0.0035, 0.0035, 4);
                const softHill2 = gaussian(lng, lat, { lng: 7.242, lat: 43.708 }, 0.004, 0.004, 6);
                addition = Math.max(addition, edgeFade * (softHill1 + softHill2));
              }

              // Apply the scaling, addition, and shoreline profile blend
              nextElevation = (originalElevation * scale + addition) * shorelineBlend;
            }

            const [red, green, blue] = encodeTerrarium(nextElevation);
            png.data[idx] = red;
            png.data[idx + 1] = green;
            png.data[idx + 2] = blue;
            png.data[idx + 3] = 255;
          }
        }

        const dir = path.join(outRoot, String(z), String(x));
        fs.mkdirSync(dir, { recursive: true });
        const file = path.join(dir, `${y}.png`);
        fs.writeFileSync(file, PNG.sync.write(png));
        written.push(file);
      } catch (err) {
        console.error(`Error processing tile ${z}/${x}/${y}:`, err);
      }
    })
  );
}

console.log(JSON.stringify({ writtenCount: written.length }, null, 2));
