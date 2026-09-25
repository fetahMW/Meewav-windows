import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Pbf from 'pbf';
import mapboxVectorTile from '@mapbox/vector-tile';
const { VectorTile } = mapboxVectorTile;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testTile(z, x, y) {
  const url = `http://localhost:5000/musicians_clustered/${z}/${x}/${y}`;
  console.log(`\n================================================================`);
  console.log(`Testing Tile: ${z}/${x}/${y} | URL: ${url}`);
  console.log(`================================================================`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`❌ HTTP Error: ${res.status} ${res.statusText}`);
      return;
    }

    const buf = await res.arrayBuffer();
    const buffer = Buffer.from(buf);
    console.log(`Successfully received ${buffer.length} bytes.`);

    if (buffer.length === 0) {
      console.log("Empty tile returned (as expected for z < 11 or empty regions).");
      return;
    }

    const pbf = new Pbf(buffer);
    const tile = new VectorTile(pbf);

    console.log(`Layers found: ${Object.keys(tile.layers).join(', ')}`);

    for (const [layerName, layer] of Object.entries(tile.layers)) {
      console.log(`\nLayer "${layerName}" has ${layer.length} features:`);
      for (let i = 0; i < Math.min(10, layer.length); i++) {
        const feature = layer.feature(i);
        console.log(`Feature #${i + 1}:`);
        console.log(`  - ID: ${feature.id}`);
        console.log(`  - Type: ${['Unknown', 'Point', 'LineString', 'Polygon'][feature.type] || 'Unknown'}`);
        console.log(`  - Properties:`, JSON.stringify(feature.properties, null, 2));
      }
      if (layer.length > 10) {
        console.log(`... and ${layer.length - 10} more features.`);
      }
    }
  } catch (err) {
    console.error("❌ Error fetching or parsing tile:", err.message);
  }
}

async function run() {
  // Test z < 11 (empty tile expected)
  await testTile(10, 518, 352);
  
  // Test 11 <= z < 16 (clustered expected)
  // Paris zoom 13: 13/4149/2818
  await testTile(13, 4149, 2818);

  // Test z >= 16 (individual expected)
  // Paris zoom 16: 16/33192/22544 (Pianiste)
  await testTile(16, 33192, 22544);
}

run();
