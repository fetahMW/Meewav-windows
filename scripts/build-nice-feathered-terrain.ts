import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { niceTerrainProfile } from '../src/terrain/profiles/niceTerrainProfile.ts';
import { computeFeatheredHeight } from '../src/terrain/buildTerrainMask.ts';
import { encodeTerrarium } from '../src/terrain/encodeTerrarium.ts';

type LngLat = [number, number];

const TILE_SIZE = 256;

function tile2lng(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

function tile2lat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

function pixelToLngLat(z: number, x: number, y: number, px: number, py: number): LngLat {
  const scale = Math.pow(2, z) * TILE_SIZE;

  const globalX = x * TILE_SIZE + px;
  const globalY = y * TILE_SIZE + py;

  const lng = (globalX / scale) * 360 - 180;

  const n = Math.PI - (2 * Math.PI * globalY) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));

  return [lng, lat];
}

async function loadRawTile(z: number, x: number, y: number): Promise<PNG> {
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch raw tile: ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  return new Promise((resolve, reject) => {
    new PNG().parse(Buffer.from(buffer), (err, data) => {
      if (err) reject(err);
      else resolve(data as any);
    });
  });
}

function getRoadProtectionWeight(lngLat: LngLat): number {
  return 1;
}

async function buildTile(z: number, x: number, y: number, outDir: string) {
  try {
    const rawPng = await loadRawTile(z, x, y);
    const png = new PNG({
      width: TILE_SIZE,
      height: TILE_SIZE,
    });

    for (let py = 0; py < TILE_SIZE; py++) {
      for (let px = 0; px < TILE_SIZE; px++) {
        const lngLat = pixelToLngLat(z, x, y, px, py);

        const idx = (py * TILE_SIZE + px) * 4;
        const r = rawPng.data[idx + 0];
        const g = rawPng.data[idx + 1];
        const b = rawPng.data[idx + 2];
        const rawHeight = (r * 256 + g + b / 256) - 32768;

        const roadWeight = getRoadProtectionWeight(lngLat);

        const finalHeight = computeFeatheredHeight({
          lngLat,
          rawHeightMeters: rawHeight,
          profile: niceTerrainProfile,
          optionalRoadProtectionWeight: roadWeight,
        });

        const rgba = encodeTerrarium(finalHeight);

        png.data[idx + 0] = rgba.r;
        png.data[idx + 1] = rgba.g;
        png.data[idx + 2] = rgba.b;
        png.data[idx + 3] = rgba.a;
      }
    }

    const tilePath = path.join(outDir, String(z), String(x));
    fs.mkdirSync(tilePath, { recursive: true });

    const file = path.join(tilePath, `${y}.png`);

    await new Promise<void>((resolve, reject) => {
      png.pack()
        .pipe(fs.createWriteStream(file))
        .on('finish', () => resolve())
        .on('error', reject);
    });
  } catch (err) {
    console.error(`Error building tile z=${z} x=${x} y=${y}:`, err);
  }
}

async function main() {
  const outDir = path.resolve(process.cwd(), 'public/terrain/nice');

  const minZ = 10;
  const maxZ = 14;

  const bbox: [number, number, number, number] = [
    7.12, 43.60,
    7.45, 43.80,
  ];

  const tilesToBuild: { z: number; x: number; y: number }[] = [];

  for (let z = minZ; z <= maxZ; z++) {
    const n = Math.pow(2, z);

    const xMin = Math.floor(((bbox[0] + 180) / 360) * n);
    const xMax = Math.floor(((bbox[2] + 180) / 360) * n);

    function latToTileY(lat: number) {
      const rad = (lat * Math.PI) / 180;
      return Math.floor(
        ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
      );
    }

    const yMin = latToTileY(bbox[3]);
    const yMax = latToTileY(bbox[1]);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        tilesToBuild.push({ z, x, y });
      }
    }
  }

  console.log(`Starting build of ${tilesToBuild.length} Nice feathered terrain tiles...`);

  const BATCH_SIZE = 12;
  for (let i = 0; i < tilesToBuild.length; i += BATCH_SIZE) {
    const batch = tilesToBuild.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(({ z, x, y }) => {
        console.log(`Building terrain tile z=${z} x=${x} y=${y}`);
        return buildTile(z, x, y, outDir);
      })
    );
  }

  console.log("Nice feathered terrain tile generation complete!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
