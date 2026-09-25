import { zxyToTileId } from "pmtiles";

const HEADER_SIZE = 127;
const ROOT_DIRECTORY_BUDGET = 14_000;
const DEFAULT_LEAF_ENTRY_COUNT = 512;

function encodeVarint(value, output) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid unsigned varint: ${value}`);
  let remaining = value;
  while (remaining >= 0x80) {
    output.push((remaining % 128) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  output.push(remaining);
}

export function serializePmtilesDirectory(entries) {
  const sortedEntries = [...entries].sort((first, second) => first.tileId - second.tileId);
  const output = [];
  encodeVarint(sortedEntries.length, output);

  let previousTileId = 0;
  for (const entry of sortedEntries) {
    encodeVarint(entry.tileId - previousTileId, output);
    previousTileId = entry.tileId;
  }
  for (const entry of sortedEntries) encodeVarint(entry.runLength, output);
  for (const entry of sortedEntries) encodeVarint(entry.length, output);
  for (let index = 0; index < sortedEntries.length; index += 1) {
    const entry = sortedEntries[index];
    const previous = sortedEntries[index - 1];
    const contiguous = previous && entry.offset === previous.offset + previous.length;
    encodeVarint(contiguous ? 0 : entry.offset + 1, output);
  }
  return Buffer.from(output);
}

function setUint64(view, offset, value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Invalid uint64 header value: ${value}`);
  view.setUint32(offset, value % 2 ** 32, true);
  view.setUint32(offset + 4, Math.floor(value / 2 ** 32), true);
}

function setCoordinate(view, offset, value) {
  view.setInt32(offset, Math.round(value * 10_000_000), true);
}

function createDirectoryLayout(tileEntries) {
  const directRoot = serializePmtilesDirectory(tileEntries);
  if (directRoot.length <= ROOT_DIRECTORY_BUDGET) {
    return { rootDirectory: directRoot, leafDirectory: Buffer.alloc(0) };
  }

  const leafBuffers = [];
  const rootEntries = [];
  let leafOffset = 0;
  for (let index = 0; index < tileEntries.length; index += DEFAULT_LEAF_ENTRY_COUNT) {
    const chunk = tileEntries.slice(index, index + DEFAULT_LEAF_ENTRY_COUNT);
    const buffer = serializePmtilesDirectory(chunk);
    leafBuffers.push(buffer);
    rootEntries.push({
      tileId: chunk[0].tileId,
      offset: leafOffset,
      length: buffer.length,
      runLength: 0,
    });
    leafOffset += buffer.length;
  }

  const rootDirectory = serializePmtilesDirectory(rootEntries);
  if (rootDirectory.length > ROOT_DIRECTORY_BUDGET) {
    throw new Error(`PMTiles root directory exceeds ${ROOT_DIRECTORY_BUDGET} bytes; add another directory level`);
  }
  return { rootDirectory, leafDirectory: Buffer.concat(leafBuffers) };
}

export function writePmtilesArchive(tiles, options) {
  if (!Array.isArray(tiles) || tiles.length === 0) throw new Error("Cannot write an empty PMTiles archive");
  const normalizedTiles = tiles
    .map((tile) => ({
      ...tile,
      tileId: tile.tileId ?? zxyToTileId(tile.z, tile.x, tile.y),
      data: Buffer.from(tile.data),
    }))
    .sort((first, second) => first.tileId - second.tileId);

  for (let index = 1; index < normalizedTiles.length; index += 1) {
    if (normalizedTiles[index - 1].tileId === normalizedTiles[index].tileId) {
      throw new Error(`Duplicate PMTiles tile ID ${normalizedTiles[index].tileId}`);
    }
  }

  let tileOffset = 0;
  const tileEntries = normalizedTiles.map((tile) => {
    const entry = { tileId: tile.tileId, offset: tileOffset, length: tile.data.length, runLength: 1 };
    tileOffset += tile.data.length;
    return entry;
  });
  const tileData = Buffer.concat(normalizedTiles.map((tile) => tile.data));
  const { rootDirectory, leafDirectory } = createDirectoryLayout(tileEntries);
  const metadata = Buffer.from(JSON.stringify(options.metadata ?? {}), "utf8");

  const rootDirectoryOffset = HEADER_SIZE;
  const jsonMetadataOffset = rootDirectoryOffset + rootDirectory.length;
  const leafDirectoryOffset = jsonMetadataOffset + metadata.length;
  const tileDataOffset = leafDirectoryOffset + leafDirectory.length;
  const header = Buffer.alloc(HEADER_SIZE);
  header.write("PMTiles", 0, "ascii");
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  view.setUint8(7, 3);
  setUint64(view, 8, rootDirectoryOffset);
  setUint64(view, 16, rootDirectory.length);
  setUint64(view, 24, jsonMetadataOffset);
  setUint64(view, 32, metadata.length);
  setUint64(view, 40, leafDirectoryOffset);
  setUint64(view, 48, leafDirectory.length);
  setUint64(view, 56, tileDataOffset);
  setUint64(view, 64, tileData.length);
  setUint64(view, 72, normalizedTiles.length);
  setUint64(view, 80, normalizedTiles.length);
  setUint64(view, 88, normalizedTiles.length);
  view.setUint8(96, 1);
  view.setUint8(97, 1);
  view.setUint8(98, 1);
  view.setUint8(99, 1);
  view.setUint8(100, options.minZoom);
  view.setUint8(101, options.maxZoom);
  setCoordinate(view, 102, options.bounds[0]);
  setCoordinate(view, 106, options.bounds[1]);
  setCoordinate(view, 110, options.bounds[2]);
  setCoordinate(view, 114, options.bounds[3]);
  view.setUint8(118, options.center?.[2] ?? options.minZoom);
  setCoordinate(view, 119, options.center?.[0] ?? (options.bounds[0] + options.bounds[2]) / 2);
  setCoordinate(view, 123, options.center?.[1] ?? (options.bounds[1] + options.bounds[3]) / 2);

  return Buffer.concat([header, rootDirectory, metadata, leafDirectory, tileData]);
}
