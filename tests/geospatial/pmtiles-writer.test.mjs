import assert from "node:assert/strict";
import test from "node:test";
import { PMTiles } from "pmtiles";
import { writePmtilesArchive } from "../../scripts/geo/lib/pmtiles-writer.mjs";

class MemorySource {
  constructor(buffer) {
    this.buffer = buffer;
  }

  getKey() {
    return "test.pmtiles";
  }

  async getBytes(offset, length) {
    const slice = this.buffer.subarray(offset, Math.min(offset + length, this.buffer.length));
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) };
  }
}

function createArchive(tiles) {
  return writePmtilesArchive(tiles, {
    minZoom: 0,
    maxZoom: 6,
    bounds: [-5, 41, 10, 52],
    center: [2.3, 48.8, 6],
    metadata: { name: "test", vector_layers: [{ id: "music_zones", fields: { zone_id: "String" } }] },
  });
}

test("writes a PMTiles v3 archive readable by the official client", async () => {
  const tiles = [
    { z: 0, x: 0, y: 0, data: Buffer.from([1, 2, 3]) },
    { z: 1, x: 1, y: 1, data: Buffer.from([4, 5, 6, 7]) },
  ];
  const archiveBuffer = createArchive(tiles);
  const archive = new PMTiles(new MemorySource(archiveBuffer));
  const header = await archive.getHeader();
  assert.equal(header.specVersion, 3);
  assert.equal(header.tileType, 1);
  assert.equal(header.numTileEntries, 2);
  assert.deepEqual(new Uint8Array((await archive.getZxy(1, 1, 1)).data), new Uint8Array([4, 5, 6, 7]));
  assert.equal((await archive.getMetadata()).name, "test");
});

test("uses leaf directories when the root directory budget is exceeded", async () => {
  const tiles = Array.from({ length: 4000 }, (_, index) => ({
    z: 6,
    x: index % 64,
    y: Math.floor(index / 64),
    data: Buffer.from([index % 251, (index + 1) % 251]),
  }));
  const archive = new PMTiles(new MemorySource(createArchive(tiles)));
  const header = await archive.getHeader();
  assert.equal(header.numTileEntries, 4000);
  assert.equal(header.leafDirectoryLength > 0, true);
  assert.deepEqual(new Uint8Array((await archive.getZxy(6, 31, 62)).data), new Uint8Array([3999 % 251, 4000 % 251]));
});
