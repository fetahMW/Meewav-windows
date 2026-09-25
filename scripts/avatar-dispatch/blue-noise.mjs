import {
  coordinateKey,
  featureBbox,
  getPolygons,
  hash32,
  pointInFeature,
} from './geometry.mjs';

const METERS_PER_DEGREE_LAT = 110_574;
const PLASTIC_CONSTANT = 1.324717957244746;
const ALPHA_X = 1 / PLASTIC_CONSTANT;
const ALPHA_Y = 1 / (PLASTIC_CONSTANT * PLASTIC_CONSTANT);
const SPACING_FACTORS = [0.82, 0.74, 0.66, 0.56, 0.46, 0.34, 0.22, 0];

function fraction(value) {
  return value - Math.floor(value);
}

function ringAreaMeters(ring, metersPerDegreeLng) {
  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const left = ring[index];
    const right = ring[index + 1];
    if (!left || !right) continue;
    const leftX = Number(left[0]) * metersPerDegreeLng;
    const leftY = Number(left[1]) * METERS_PER_DEGREE_LAT;
    const rightX = Number(right[0]) * metersPerDegreeLng;
    const rightY = Number(right[1]) * METERS_PER_DEGREE_LAT;
    twiceArea += leftX * rightY - rightX * leftY;
  }
  return Math.abs(twiceArea) / 2;
}

export function featureAreaMeters(feature) {
  const bbox = featureBbox(feature);
  const meanLatitude = (bbox[1] + bbox[3]) / 2;
  const metersPerDegreeLng = 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  let area = 0;
  for (const polygon of getPolygons(feature)) {
    const [outer, ...holes] = polygon;
    area += ringAreaMeters(outer ?? [], metersPerDegreeLng);
    for (const hole of holes) area -= ringAreaMeters(hole, metersPerDegreeLng);
  }
  return Math.max(0, area);
}

function buildGrid(points, minimumDistance) {
  const cellSize = Math.max(0.01, minimumDistance / Math.SQRT2);
  const buckets = new Map();
  for (const point of points) {
    const cellX = Math.floor(point.x / cellSize);
    const cellY = Math.floor(point.y / cellSize);
    const key = `${cellX}:${cellY}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(point);
    buckets.set(key, bucket);
  }
  return { buckets, cellSize };
}

function hasNeighbourWithin(point, grid, minimumDistance) {
  if (minimumDistance <= 0) return false;
  const cellX = Math.floor(point.x / grid.cellSize);
  const cellY = Math.floor(point.y / grid.cellSize);
  const radius = Math.ceil(minimumDistance / grid.cellSize);
  const squaredMinimum = minimumDistance * minimumDistance;
  for (let xOffset = -radius; xOffset <= radius; xOffset += 1) {
    for (let yOffset = -radius; yOffset <= radius; yOffset += 1) {
      const bucket = grid.buckets.get(`${cellX + xOffset}:${cellY + yOffset}`) ?? [];
      for (const candidate of bucket) {
        const dx = point.x - candidate.x;
        const dy = point.y - candidate.y;
        if (dx * dx + dy * dy < squaredMinimum) return true;
      }
    }
  }
  return false;
}

function addToGrid(point, grid) {
  const cellX = Math.floor(point.x / grid.cellSize);
  const cellY = Math.floor(point.y / grid.cellSize);
  const key = `${cellX}:${cellY}`;
  const bucket = grid.buckets.get(key) ?? [];
  bucket.push(point);
  grid.buckets.set(key, bucket);
}

/**
 * Deterministic blue-noise placement inside a neighborhood polygon.
 *
 * Candidates follow a two-dimensional low-discrepancy sequence, while a
 * spatial hash enforces an adaptive minimum distance. The last relaxation
 * stage guarantees an exact count even for narrow or highly concave zones.
 */
export function generateZoneBlueNoisePoints({
  feature,
  constraintFeature = null,
  count,
  seed,
  zoneId = 'zone',
  label = zoneId,
  excludedCoordinateKeys = new Set(),
}) {
  if (!Number.isInteger(count) || count < 0) throw new Error(`${zoneId}: nombre blue-noise invalide ${count}`);
  if (count === 0) return [];

  const bbox = featureBbox(feature);
  if (bbox.some((value) => !Number.isFinite(value)) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3]) {
    throw new Error(`${zoneId}: geometrie sans emprise exploitable`);
  }
  const meanLatitude = (bbox[1] + bbox[3]) / 2;
  const metersPerDegreeLng = 111_320 * Math.cos(meanLatitude * Math.PI / 180);
  const area = featureAreaMeters(feature);
  if (area <= 0) throw new Error(`${zoneId}: surface blue-noise nulle`);

  const bboxArea = (bbox[2] - bbox[0]) * metersPerDegreeLng
    * (bbox[3] - bbox[1]) * METERS_PER_DEGREE_LAT;
  const rejectionMultiplier = Math.min(30, Math.max(1, bboxArea / area));
  const idealSpacing = Math.sqrt(area / count);
  const offsetX = hash32(`${seed}:${zoneId}:blue-noise:x`) / 0x1_0000_0000;
  const offsetY = hash32(`${seed}:${zoneId}:blue-noise:y`) / 0x1_0000_0000;
  const accepted = [];
  const localKeys = new Set();
  let candidateIndex = 0;

  for (const factor of SPACING_FACTORS) {
    if (accepted.length >= count) break;
    const minimumDistance = idealSpacing * factor;
    const grid = buildGrid(accepted, minimumDistance || 1);
    const missing = count - accepted.length;
    const attemptBudget = Math.max(
      500,
      Math.ceil(missing * (factor === 0 ? 120 : 36) * rejectionMultiplier),
    );

    for (let attempt = 0; attempt < attemptBudget && accepted.length < count; attempt += 1) {
      candidateIndex += 1;
      const u = fraction(offsetX + candidateIndex * ALPHA_X);
      const v = fraction(offsetY + candidateIndex * ALPHA_Y);
      const lng = Number((bbox[0] + u * (bbox[2] - bbox[0])).toFixed(7));
      const lat = Number((bbox[1] + v * (bbox[3] - bbox[1])).toFixed(7));
      const key = coordinateKey(lng, lat);
      if (localKeys.has(key) || excludedCoordinateKeys.has(key)) continue;
      const coordinates = [lng, lat];
      if (!pointInFeature(coordinates, feature)
        || (constraintFeature && !pointInFeature(coordinates, constraintFeature))) continue;
      const point = {
        id: `blue-noise:${zoneId}:${accepted.length}`,
        type: 'zone_blue_noise',
        label,
        lng,
        lat,
        x: lng * metersPerDegreeLng,
        y: lat * METERS_PER_DEGREE_LAT,
      };
      if (hasNeighbourWithin(point, grid, minimumDistance)) continue;
      localKeys.add(key);
      accepted.push(point);
      addToGrid(point, grid);
    }
  }

  if (accepted.length !== count) {
    throw new Error(`${zoneId}: blue-noise incomplet ${accepted.length}/${count}`);
  }
  return accepted.map(({ x, y, ...point }) => point);
}
