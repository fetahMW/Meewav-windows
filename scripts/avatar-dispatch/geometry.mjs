import crypto from 'node:crypto';
import fs from 'node:fs';

const EPSILON = 1e-11;

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/oe/g, 'oe')
    .replace(/ae/g, 'ae')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function hash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function sha256File(filePath) {
  return sha256(fs.readFileSync(filePath));
}

export function stableSortByHash(values, seed, key = (value) => value) {
  return [...values].sort((left, right) => {
    const leftKey = String(key(left));
    const rightKey = String(key(right));
    const rankDelta = hash32(`${seed}:${leftKey}`) - hash32(`${seed}:${rightKey}`);
    return rankDelta || leftKey.localeCompare(rightKey);
  });
}

export function getPolygons(feature) {
  if (feature?.geometry?.type === 'Polygon') return [feature.geometry.coordinates];
  if (feature?.geometry?.type === 'MultiPolygon') return feature.geometry.coordinates;
  return [];
}

function pointOnSegment(point, start, end) {
  const [x, y] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
  if (Math.abs(cross) > EPSILON) return false;
  return x >= Math.min(x1, x2) - EPSILON
    && x <= Math.max(x1, x2) + EPSILON
    && y >= Math.min(y1, y2) - EPSILON
    && y <= Math.max(y1, y2) + EPSILON;
}

function ringLocation(point, ring) {
  let inside = false;
  const [x, y] = point;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    if (!currentPoint || !previousPoint) continue;
    if (pointOnSegment(point, previousPoint, currentPoint)) return 'boundary';
    const [xi, yi] = currentPoint;
    const [xj, yj] = previousPoint;
    const intersects = ((yi > y) !== (yj > y))
      && x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

export function pointInPolygon(point, polygon) {
  const [outer, ...holes] = polygon;
  if (!outer || ringLocation(point, outer) === 'outside') return false;
  return !holes.some((hole) => ringLocation(point, hole) === 'inside');
}

export function pointInFeature(point, feature) {
  return getPolygons(feature).some((polygon) => pointInPolygon(point, polygon));
}

export function featureBbox(feature) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of getPolygons(feature)) {
    for (const ring of polygon) {
      for (const coordinate of ring) {
        const lng = Number(coordinate?.[0]);
        const lat = Number(coordinate?.[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        bbox[0] = Math.min(bbox[0], lng);
        bbox[1] = Math.min(bbox[1], lat);
        bbox[2] = Math.max(bbox[2], lng);
        bbox[3] = Math.max(bbox[3], lat);
      }
    }
  }
  return bbox;
}

export function bboxContains(bbox, point) {
  return point[0] >= bbox[0] - EPSILON
    && point[0] <= bbox[2] + EPSILON
    && point[1] >= bbox[1] - EPSILON
    && point[1] <= bbox[3] + EPSILON;
}

function ringAreaAndCentroid(ring) {
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    if (!current || !next) continue;
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }
  if (Math.abs(twiceArea) < EPSILON) return null;
  return {
    area: Math.abs(twiceArea / 2),
    point: [x / (3 * twiceArea), y / (3 * twiceArea)],
  };
}

export function representativePoint(feature) {
  const polygonCandidates = getPolygons(feature)
    .map((polygon) => ({ polygon, measure: ringAreaAndCentroid(polygon[0] ?? []) }))
    .sort((left, right) => (right.measure?.area ?? 0) - (left.measure?.area ?? 0));

  for (const { polygon, measure } of polygonCandidates) {
    const ring = polygon[0] ?? [];
    const bbox = featureBbox({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polygon } });
    const candidates = [
      measure?.point,
      [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2],
    ].filter(Boolean);

    for (let row = 1; row <= 7; row += 1) {
      for (let column = 1; column <= 7; column += 1) {
        candidates.push([
          bbox[0] + ((column - 0.5) / 7) * (bbox[2] - bbox[0]),
          bbox[1] + ((row - 0.5) / 7) * (bbox[3] - bbox[1]),
        ]);
      }
    }
    if (ring[0]) candidates.push([Number(ring[0][0]), Number(ring[0][1])]);
    for (const point of candidates) {
      if (pointInFeature(point, feature)) return point;
    }
  }
  return null;
}

export function normalizeParisZoneId(properties = {}) {
  const arrondissement = String(properties.c_ar ?? '').padStart(2, '0');
  return `paris_${arrondissement}e_${slugify(properties.l_qu)}`;
}

export function coordinateKey(lng, lat) {
  return `${Number(lng).toFixed(7)},${Number(lat).toFixed(7)}`;
}
