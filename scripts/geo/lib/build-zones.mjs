import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { VectorTile } from "@mapbox/vector-tile";
import { GeoJSONVT } from "@maplibre/geojson-vt";
import { fromGeojsonVt } from "@maplibre/vt-pbf";
import { PbfReader } from "pbf";
import { PMTiles } from "pmtiles";
import { computeBbox } from "./geometry.mjs";
import { createStableAdministrativeZoneId } from "./id.mjs";
import { convertExistingGroup } from "./migrate-existing.mjs";
import { writePmtilesArchive } from "./pmtiles-writer.mjs";
import { validateDataset } from "./validate.mjs";

export const NATIONAL_SOURCE_LAYERS = ["regions", "departments", "communes", "music_zones"];

const TILE_EXTENT = 4096;
const LAYER_ZOOM_RANGES = {
  regions: [4, 8],
  departments: [6, 10],
  communes: [7, 14],
  music_zones: [8, 14],
};

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function longitudeToTileX(longitude, zoom) {
  const scale = 2 ** zoom;
  return clamp(Math.floor(((longitude + 180) / 360) * scale), 0, scale - 1);
}

export function latitudeToTileY(latitude, zoom) {
  const scale = 2 ** zoom;
  const radians = (clamp(latitude, -85.05112878, 85.05112878) * Math.PI) / 180;
  const value = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
  return clamp(Math.floor(value * scale), 0, scale - 1);
}

function mergeBboxes(bboxes) {
  const values = bboxes.filter(Boolean);
  if (values.length === 0) return null;
  return values.reduce(
    (result, bbox) => [
      Math.min(result[0], bbox[0]),
      Math.min(result[1], bbox[1]),
      Math.max(result[2], bbox[2]),
      Math.max(result[3], bbox[3]),
    ],
    [...values[0]],
  );
}

function featureCollectionBbox(collection) {
  return mergeBboxes(collection.features.map((feature) => computeBbox(feature.geometry)));
}

function createMusicZoneFeature(zone, mappingEntry, { label = false, canonicalInput = false } = {}) {
  const presentation = zone.presentation ?? {};
  return {
    type: "Feature",
    properties: {
      zone_id: zone.zoneId,
      legacy_zone_id: mappingEntry?.legacyZoneId ?? "",
      legacy_parent_zone_id: mappingEntry?.legacyParentZoneId ?? "",
      runtime_mode: mappingEntry?.runtimeMode ?? (canonicalInput ? "national" : "legacy"),
      record_type: label ? "label" : "zone",
      display_name: zone.displayName,
      commune_code: zone.communeCode,
      commune_name: zone.communeName,
      parent_zone_id: zone.parentZoneId ?? "",
      source_type: zone.sourceType,
      source_vintage: zone.sourceVintage,
      quality: zone.quality,
      status: zone.status,
      label_lon: zone.labelPoint[0],
      label_lat: zone.labelPoint[1],
      bbox_west: zone.bbox[0],
      bbox_south: zone.bbox[1],
      bbox_east: zone.bbox[2],
      bbox_north: zone.bbox[3],
      color_index: presentation.colorIndex ?? 0,
      ground_color: presentation.groundColor ?? "#43277B",
      territory_type: presentation.territoryType ?? "quartier",
      palette_family: presentation.paletteFamily ?? "city",
      overview_visible: presentation.overviewVisible ?? true,
    },
    geometry: label
      ? { type: "Point", coordinates: zone.labelPoint }
      : zone.geometry,
  };
}

function createAdministrativeFeature(zone) {
  return {
    type: "Feature",
    properties: {
      zone_id: zone.id,
      legacy_zone_id: "",
      legacy_parent_zone_id: "",
      runtime_mode: "national",
      record_type: "zone",
      display_name: zone.officialName,
      commune_code: zone.communeCode ?? "",
      commune_name: zone.officialName,
      parent_zone_id: zone.parentId ?? "",
      source_type: zone.sourceType,
      source_vintage: zone.sourceVintage,
      quality: "official",
      status: "validated",
      ground_color: "#43277B",
      color_index: 0,
      territory_type: zone.sourceType,
      palette_family: "administrative",
      overview_visible: true,
    },
    geometry: zone.geometry,
  };
}

async function loadRegionFeatures(rootDirectory) {
  const inputPath = path.join(rootDirectory, "public", "geo", "france-regions-metropole-simplified.geojson");
  const input = JSON.parse(await readFile(inputPath, "utf8"));
  return input.features.map((feature, index) => {
    const name = String(feature.properties?.name ?? feature.properties?.nom ?? feature.properties?.label ?? `Region ${index + 1}`);
    const legacyId = String(feature.id ?? feature.properties?.id ?? feature.properties?.code ?? name);
    return {
      type: "Feature",
      properties: {
        zone_id: createStableAdministrativeZoneId(`region:${legacyId}`),
        display_name: name,
        source_type: "region",
        source_vintage: String(input.metadata?.sourceYear ?? "legacy-unrecorded"),
        status: "validated",
      },
      geometry: feature.geometry,
    };
  });
}

async function createSourceCollections(rootDirectory, scope, canonicalDataset = null) {
  const conversion = canonicalDataset
    ? { dataset: canonicalDataset, validation: validateDataset(canonicalDataset), mapping: { entries: [] } }
    : await convertExistingGroup(rootDirectory, scope);
  if (!conversion.validation.valid) {
    throw new Error(`Canonical ${scope} dataset is invalid and cannot be tiled`);
  }
  const mappingEntryByStableId = new Map(
    conversion.mapping.entries.map((entry) => [entry.stableZoneId, entry]),
  );
  const canonicalInput = Boolean(canonicalDataset);
  const musicFeatures = conversion.dataset.musicZones.flatMap((zone) => {
    const mappingEntry = mappingEntryByStableId.get(zone.zoneId);
    return [
      createMusicZoneFeature(zone, mappingEntry, { canonicalInput }),
      createMusicZoneFeature(zone, mappingEntry, { label: true, canonicalInput }),
    ];
  });
  const musicZoneBySourceId = new Map();
  for (const zone of conversion.dataset.musicZones) {
    for (const sourceZoneId of zone.sourceZoneIds) {
      if (!musicZoneBySourceId.has(sourceZoneId)) musicZoneBySourceId.set(sourceZoneId, zone);
    }
  }
  const administrativeByType = (sourceType) => conversion.dataset.administrativeZones
    .filter((zone) => zone.sourceType === sourceType)
    .map((zone) => {
      const productZone = musicZoneBySourceId.get(zone.id);
      return productZone
        ? createMusicZoneFeature(productZone, mappingEntryByStableId.get(productZone.zoneId), { canonicalInput })
        : createAdministrativeFeature(zone);
    });
  const communeFeatures = administrativeByType("commune");
  const canonicalRegionFeatures = administrativeByType("region");
  const regionFeatures = canonicalRegionFeatures.length > 0
    ? canonicalRegionFeatures
    : await loadRegionFeatures(rootDirectory);
  const departmentFeatures = administrativeByType("department");

  return {
    conversion,
    collections: {
      regions: { type: "FeatureCollection", features: regionFeatures },
      departments: { type: "FeatureCollection", features: departmentFeatures },
      communes: { type: "FeatureCollection", features: communeFeatures },
      music_zones: { type: "FeatureCollection", features: musicFeatures },
    },
  };
}

async function writeNationalRuntimeZoneDetails(outputDirectory, conversion) {
  const mappingEntryByStableId = new Map(
    conversion.mapping.entries.map((entry) => [entry.stableZoneId, entry]),
  );
  const canonicalInputHasNoLegacyMapping = conversion.mapping.entries.length === 0;
  const zones = conversion.dataset.musicZones.filter((zone) => (
    canonicalInputHasNoLegacyMapping
    || mappingEntryByStableId.get(zone.zoneId)?.runtimeMode === "national"
  ));
  const detailDirectory = path.join(outputDirectory, "zone-details");
  await mkdir(detailDirectory, { recursive: true });
  await Promise.all(zones.map((zone) => writeFile(
    path.join(detailDirectory, `${zone.zoneId}.geojson`),
    `${JSON.stringify({
      type: "Feature",
      id: zone.zoneId,
      properties: {
        zone_id: zone.zoneId,
        display_name: zone.displayName,
        commune_code: zone.communeCode,
        commune_name: zone.communeName,
      },
      geometry: zone.geometry,
    })}\n`,
  )));
  return { detailDirectory, zoneDetailCount: zones.length };
}

function createTileIndexes(collections, maximumZoom) {
  return Object.fromEntries(
    Object.entries(collections).map(([layerName, collection]) => [
      layerName,
      collection.features.length === 0
        ? null
        : new GeoJSONVT(collection, {
            maxZoom: maximumZoom,
            indexMaxZoom: 6,
            indexMaxPoints: 100_000,
            tolerance: 2,
            extent: TILE_EXTENT,
            buffer: 64,
            generateId: false,
          }),
    ]),
  );
}

function layerIsActiveAtZoom(layerName, zoom) {
  const range = LAYER_ZOOM_RANGES[layerName];
  return zoom >= range[0] && zoom <= range[1];
}

function getTileRangeForZoom(collectionBboxes, zoom) {
  const bbox = mergeBboxes(
    NATIONAL_SOURCE_LAYERS
      .filter((layerName) => layerIsActiveAtZoom(layerName, zoom))
      .map((layerName) => collectionBboxes[layerName]),
  );
  if (!bbox) return null;
  return {
    minimumX: longitudeToTileX(bbox[0], zoom),
    maximumX: longitudeToTileX(bbox[2], zoom),
    minimumY: latitudeToTileY(bbox[3], zoom),
    maximumY: latitudeToTileY(bbox[1], zoom),
  };
}

function encodeTiles(collections, minimumZoom, maximumZoom) {
  const indexes = createTileIndexes(collections, maximumZoom);
  const collectionBboxes = Object.fromEntries(
    Object.entries(collections).map(([layerName, collection]) => [layerName, featureCollectionBbox(collection)]),
  );
  const tiles = [];
  const tilesByZoom = {};
  let maximumTileBytes = 0;

  for (let zoom = minimumZoom; zoom <= maximumZoom; zoom += 1) {
    const range = getTileRangeForZoom(collectionBboxes, zoom);
    if (!range) continue;
    let zoomTileCount = 0;
    for (let x = range.minimumX; x <= range.maximumX; x += 1) {
      for (let y = range.minimumY; y <= range.maximumY; y += 1) {
        const layers = {};
        let containsFeature = false;
        for (const layerName of NATIONAL_SOURCE_LAYERS) {
          const tile = layerIsActiveAtZoom(layerName, zoom) ? indexes[layerName]?.getTile(zoom, x, y) : null;
          layers[layerName] = tile ?? { features: [] };
          if (tile?.features?.length > 0) containsFeature = true;
        }
        if (!containsFeature) continue;
        const data = Buffer.from(fromGeojsonVt(layers, { version: 2, extent: TILE_EXTENT }));
        maximumTileBytes = Math.max(maximumTileBytes, data.length);
        tiles.push({ z: zoom, x, y, data });
        zoomTileCount += 1;
      }
    }
    tilesByZoom[zoom] = zoomTileCount;
  }

  return { tiles, tilesByZoom, maximumTileBytes, collectionBboxes };
}

class BufferPmtilesSource {
  constructor(buffer, key = "memory.pmtiles") {
    this.buffer = buffer;
    this.key = key;
  }

  getKey() {
    return this.key;
  }

  async getBytes(offset, length) {
    const slice = this.buffer.subarray(offset, Math.min(offset + length, this.buffer.length));
    return { data: slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) };
  }
}

function decodeVectorTile(data) {
  return new VectorTile(new PbfReader(new Uint8Array(data)));
}

function inspectPhysicalSourceLayers(tiles) {
  const result = Object.fromEntries(NATIONAL_SOURCE_LAYERS.map((layerName) => [layerName, {
    present: false,
    sampleZoneId: null,
    sampleLegacyZoneId: null,
  }]));
  for (const tile of tiles) {
    const vectorTile = decodeVectorTile(tile.data);
    for (const layerName of Object.keys(vectorTile.layers)) {
      const layer = vectorTile.layers[layerName];
      if (!result[layerName] || layer.length === 0) continue;
      result[layerName].present = true;
      const properties = layer.feature(0).properties;
      result[layerName].sampleZoneId = typeof properties.zone_id === "string" ? properties.zone_id : null;
      result[layerName].sampleLegacyZoneId = typeof properties.legacy_zone_id === "string"
        ? properties.legacy_zone_id
        : null;
    }
    if (NATIONAL_SOURCE_LAYERS.every((layerName) => result[layerName].present || layerName === "departments")) break;
  }
  return result;
}

export async function inspectPmtilesArchive(buffer, representativeTile) {
  const archive = new PMTiles(new BufferPmtilesSource(buffer));
  const header = await archive.getHeader();
  const metadata = await archive.getMetadata();
  const tileResponse = await archive.getZxy(representativeTile.z, representativeTile.x, representativeTile.y);
  if (!tileResponse) throw new Error("Representative tile is missing from the PMTiles archive");
  const vectorTile = decodeVectorTile(tileResponse.data);
  const layerNames = Object.keys(vectorTile.layers).sort();
  const featureCounts = Object.fromEntries(layerNames.map((layerName) => [layerName, vectorTile.layers[layerName].length]));
  return { header, metadata, layerNames, featureCounts };
}

export async function buildZonesTileset(rootDirectory, scope, options = {}) {
  const version = options.version ?? "2026.1-prototype";
  const minimumZoom = Number(options.minimumZoom ?? 4);
  const maximumZoom = Number(options.maximumZoom ?? 14);
  const { conversion, collections } = await createSourceCollections(rootDirectory, scope, options.dataset ?? null);
  const encoded = encodeTiles(collections, minimumZoom, maximumZoom);
  if (encoded.tiles.length === 0) throw new Error("No vector tile was generated");

  const bounds = mergeBboxes(Object.values(encoded.collectionBboxes));
  const musicBounds = encoded.collectionBboxes.music_zones;
  const center = [
    (musicBounds[0] + musicBounds[2]) / 2,
    (musicBounds[1] + musicBounds[3]) / 2,
    Math.min(maximumZoom, 11),
  ];
  const metadata = {
    name: `Meewav national geography — ${scope}`,
    version,
    format: "pbf",
    type: "overlay",
    vector_layers: NATIONAL_SOURCE_LAYERS.map((id) => ({
      id,
      minzoom: LAYER_ZOOM_RANGES[id][0],
      maxzoom: Math.min(maximumZoom, LAYER_ZOOM_RANGES[id][1]),
      fields: id === "departments"
        ? {}
        : {
            zone_id: "String",
            legacy_zone_id: "String",
            legacy_parent_zone_id: "String",
            runtime_mode: "String",
            record_type: "String",
            display_name: "String",
            source_type: "String",
            ground_color: "String",
            color_index: "Number",
            territory_type: "String",
            palette_family: "String",
            overview_visible: "Boolean",
            bbox_west: "Number",
            bbox_south: "Number",
            bbox_east: "Number",
            bbox_north: "Number",
          },
    })),
  };
  const archive = writePmtilesArchive(encoded.tiles, {
    minZoom: minimumZoom,
    maxZoom: maximumZoom,
    bounds,
    center,
    metadata,
  });

  const representativeTile = encoded.tiles
    .filter((tile) => tile.z === maximumZoom)
    .sort((first, second) => second.data.length - first.data.length)[0] ?? encoded.tiles.at(-1);
  const inspection = await inspectPmtilesArchive(archive, representativeTile);
  const physicalSourceLayers = inspectPhysicalSourceLayers(encoded.tiles);
  const missingLayers = NATIONAL_SOURCE_LAYERS.filter(
    (layerName) =>
      collections[layerName].features.length > 0 &&
      (!physicalSourceLayers[layerName].present || !physicalSourceLayers[layerName].sampleZoneId),
  );
  if (missingLayers.length > 0) throw new Error(`PMTiles representative tile is missing layers: ${missingLayers.join(", ")}`);
  if (inspection.header.tileType !== 1 || inspection.header.specVersion !== 3) {
    throw new Error("Generated archive is not PMTiles v3 MVT");
  }

  const sha256 = createHash("sha256").update(archive).digest("hex");
  const outputDirectory = path.join(rootDirectory, "geo", "output", "tiles", version);
  await mkdir(outputDirectory, { recursive: true });
  const zoneDetails = await writeNationalRuntimeZoneDetails(outputDirectory, conversion);
  const archivePath = path.join(outputDirectory, `france-zones-${scope}.pmtiles`);
  const manifestPath = path.join(outputDirectory, `france-zones-${scope}.manifest.json`);
  const manifest = {
    schemaVersion: 1,
    version,
    scope,
    archive: path.basename(archivePath),
    sha256,
    bytes: archive.length,
    tileCount: encoded.tiles.length,
    tilesByZoom: encoded.tilesByZoom,
    maximumTileBytes: encoded.maximumTileBytes,
    minZoom: minimumZoom,
    maxZoom: maximumZoom,
    bounds,
    center,
    sourceLayers: NATIONAL_SOURCE_LAYERS,
    physicalSourceLayers,
    featureCounts: Object.fromEntries(Object.entries(collections).map(([name, collection]) => [name, collection.features.length])),
    canonicalZoneCount: conversion.dataset.musicZones.length,
    zoneDetailCount: zoneDetails.zoneDetailCount,
    representativeTile: { z: representativeTile.z, x: representativeTile.x, y: representativeTile.y },
    representativeLayerFeatureCounts: inspection.featureCounts,
  };
  await Promise.all([
    writeFile(archivePath, archive),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`),
  ]);
  return {
    archivePath,
    manifestPath,
    detailDirectory: zoneDetails.detailDirectory,
    manifest,
    inspection,
  };
}
