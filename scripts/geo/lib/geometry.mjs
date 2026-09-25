const COORDINATE_EPSILON = 1e-10;
const ORIENTATION_EPSILON = 0;
const AREA_EPSILON = 1e-15;

export function isFinitePosition(position) {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    position.length <= 3 &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    position[0] >= -180 &&
    position[0] <= 180 &&
    position[1] >= -90 &&
    position[1] <= 90
  );
}

export function positionsEqual(first, second, epsilon = COORDINATE_EPSILON) {
  return (
    isFinitePosition(first) &&
    isFinitePosition(second) &&
    Math.abs(first[0] - second[0]) <= epsilon &&
    Math.abs(first[1] - second[1]) <= epsilon
  );
}

export function getPolygonRings(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((polygon) => (Array.isArray(polygon) ? polygon : []));
  }

  return [];
}

export function getPolygons(geometry) {
  if (!geometry || typeof geometry !== "object") {
    return [];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates;
  }

  return [];
}

export function computeBbox(geometry) {
  const positions = getPolygonRings(geometry).flat();
  if (positions.length === 0 || positions.some((position) => !isFinitePosition(position))) {
    return null;
  }

  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const [longitude, latitude] of positions) {
    minLongitude = Math.min(minLongitude, longitude);
    minLatitude = Math.min(minLatitude, latitude);
    maxLongitude = Math.max(maxLongitude, longitude);
    maxLatitude = Math.max(maxLatitude, latitude);
  }

  return [minLongitude, minLatitude, maxLongitude, maxLatitude];
}

export function bboxEquals(first, second, epsilon = 1e-8) {
  return (
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === 4 &&
    second.length === 4 &&
    first.every((value, index) => Math.abs(value - second[index]) <= epsilon)
  );
}

function orientation(first, second, third) {
  const value =
    (second[1] - first[1]) * (third[0] - second[0]) -
    (second[0] - first[0]) * (third[1] - second[1]);
  if (Math.abs(value) <= ORIENTATION_EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

export function pointOnSegment(point, start, end) {
  if (!isFinitePosition(point) || !isFinitePosition(start) || !isFinitePosition(end)) return false;
  const longitudeDelta = end[0] - start[0];
  const latitudeDelta = end[1] - start[1];
  const segmentLengthSquared = longitudeDelta ** 2 + latitudeDelta ** 2;
  if (segmentLengthSquared <= COORDINATE_EPSILON ** 2) {
    return positionsEqual(point, start);
  }

  const projection = (
    (point[0] - start[0]) * longitudeDelta
    + (point[1] - start[1]) * latitudeDelta
  ) / segmentLengthSquared;
  if (projection < 0 || projection > 1) return false;

  const projectedLongitude = start[0] + projection * longitudeDelta;
  const projectedLatitude = start[1] + projection * latitudeDelta;
  return (
    Math.abs(point[0] - projectedLongitude) <= COORDINATE_EPSILON
    && Math.abs(point[1] - projectedLatitude) <= COORDINATE_EPSILON
  );
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) {
    return true;
  }

  return (
    (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

export function ringHasSelfIntersection(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  const segmentCount = ring.length - 1;

  for (let firstIndex = 0; firstIndex < segmentCount; firstIndex += 1) {
    const firstStart = ring[firstIndex];
    const firstEnd = ring[firstIndex + 1];

    for (let secondIndex = firstIndex + 1; secondIndex < segmentCount; secondIndex += 1) {
      const adjacent = Math.abs(firstIndex - secondIndex) <= 1;
      const closingAdjacent = firstIndex === 0 && secondIndex === segmentCount - 1;
      if (adjacent || closingAdjacent) continue;

      const secondStart = ring[secondIndex];
      const secondEnd = ring[secondIndex + 1];
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        return true;
      }
    }
  }

  return false;
}

export function signedRingArea(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 0;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

export function pointInRing(point, ring) {
  if (!isFinitePosition(point) || !Array.isArray(ring) || ring.length < 4) return false;

  let inside = false;
  for (let currentIndex = 0, previousIndex = ring.length - 1; currentIndex < ring.length; previousIndex = currentIndex, currentIndex += 1) {
    const current = ring[currentIndex];
    const previous = ring[previousIndex];
    if (!isFinitePosition(current) || !isFinitePosition(previous)) return false;
    if (pointOnSegment(point, previous, current)) return true;

    const crossesLatitude = current[1] > point[1] !== previous[1] > point[1];
    const intersectionLongitude =
      ((previous[0] - current[0]) * (point[1] - current[1])) /
        (previous[1] - current[1] || Number.EPSILON) +
      current[0];
    if (crossesLatitude && point[0] < intersectionLongitude) inside = !inside;
  }
  return inside;
}

export function pointInPolygonCoordinates(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) return false;
  if (!pointInRing(point, polygonCoordinates[0])) return false;
  return polygonCoordinates.slice(1).every((hole) => !pointInRing(point, hole));
}

export function pointInGeometry(point, geometry) {
  return getPolygons(geometry).some((polygon) => pointInPolygonCoordinates(point, polygon));
}

function pointOnRingBoundary(point, ring) {
  if (!Array.isArray(ring) || ring.length < 2) return false;
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (pointOnSegment(point, ring[index], ring[index + 1])) return true;
  }
  return false;
}

export function pointInPolygonInterior(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) return false;
  if (polygonCoordinates.some((ring) => pointOnRingBoundary(point, ring))) return false;
  return pointInPolygonCoordinates(point, polygonCoordinates);
}

export function pointInGeometryInterior(point, geometry) {
  return getPolygons(geometry).some((polygon) => pointInPolygonInterior(point, polygon));
}

export function validateGeometry(geometry, path = "geometry") {
  const errors = [];
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return [{ code: "geometry.type", path, message: "Expected a Polygon or MultiPolygon" }];
  }

  const polygons = getPolygons(geometry);
  if (polygons.length === 0) {
    return [{ code: "geometry.empty", path, message: "Geometry has no polygon" }];
  }

  polygons.forEach((polygon, polygonIndex) => {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      errors.push({
        code: "geometry.polygon.empty",
        path: `${path}.coordinates[${polygonIndex}]`,
        message: "Polygon has no exterior ring",
      });
      return;
    }

    polygon.forEach((ring, ringIndex) => {
      const ringPath = `${path}.coordinates[${polygonIndex}][${ringIndex}]`;
      if (!Array.isArray(ring) || ring.length < 4) {
        errors.push({ code: "geometry.ring.short", path: ringPath, message: "Ring must contain at least four positions" });
        return;
      }
      if (ring.some((position) => !isFinitePosition(position))) {
        errors.push({ code: "geometry.position.invalid", path: ringPath, message: "Ring contains an invalid longitude/latitude" });
        return;
      }
      if (!positionsEqual(ring[0], ring.at(-1))) {
        errors.push({ code: "geometry.ring.open", path: ringPath, message: "Ring is not closed" });
      }
      if (Math.abs(signedRingArea(ring)) <= AREA_EPSILON) {
        errors.push({ code: "geometry.ring.zero_area", path: ringPath, message: "Ring has zero area" });
      }
      if (ringHasSelfIntersection(ring)) {
        errors.push({ code: "geometry.ring.self_intersection", path: ringPath, message: "Ring self-intersects" });
      }
    });
  });

  return errors;
}

function centroidOfRing(ring) {
  let twiceArea = 0;
  let longitude = 0;
  let latitude = 0;

  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    const factor = current[0] * next[1] - next[0] * current[1];
    twiceArea += factor;
    longitude += (current[0] + next[0]) * factor;
    latitude += (current[1] + next[1]) * factor;
  }

  if (Math.abs(twiceArea) <= AREA_EPSILON) return null;
  return [longitude / (3 * twiceArea), latitude / (3 * twiceArea)];
}

function findWidestInteriorPointOnScanline(polygon, latitude) {
  const intersections = [];
  for (const ring of polygon) {
    for (let index = 0; index < ring.length - 1; index += 1) {
      const start = ring[index];
      const end = ring[index + 1];
      const crossesScanline = (
        (start[1] < latitude && end[1] > latitude)
        || (end[1] < latitude && start[1] > latitude)
      );
      if (!crossesScanline) continue;
      intersections.push(
        start[0] + ((latitude - start[1]) * (end[0] - start[0])) / (end[1] - start[1]),
      );
    }
  }

  intersections.sort((first, second) => first - second);
  let best = null;
  for (let index = 0; index < intersections.length - 1; index += 1) {
    const startLongitude = intersections[index];
    const endLongitude = intersections[index + 1];
    if (endLongitude - startLongitude <= COORDINATE_EPSILON * 2) continue;
    const candidate = [(startLongitude + endLongitude) / 2, latitude];
    if (!pointInPolygonInterior(candidate, polygon)) continue;
    const width = endLongitude - startLongitude;
    if (!best || width > best.width) best = { point: candidate, width };
  }
  return best?.point ?? null;
}

function findScanlineInteriorPoint(polygon) {
  const bbox = computeBbox({ type: "Polygon", coordinates: polygon });
  if (!bbox || bbox[3] - bbox[1] <= COORDINATE_EPSILON * 2) return null;

  const preferredFractions = [0.5, 0.375, 0.625, 0.25, 0.75, 0.125, 0.875];
  for (const fraction of preferredFractions) {
    const latitude = bbox[1] + (bbox[3] - bbox[1]) * fraction;
    const candidate = findWidestInteriorPointOnScanline(polygon, latitude);
    if (candidate) return candidate;
  }

  const latitudes = [...new Set(polygon
    .flatMap((ring) => ring.map((position) => position[1])))].sort((first, second) => first - second);
  const intervals = latitudes.slice(0, -1)
    .map((latitude, index) => ({
      latitude: (latitude + latitudes[index + 1]) / 2,
      height: latitudes[index + 1] - latitude,
    }))
    .filter((interval) => interval.height > COORDINATE_EPSILON * 2)
    .sort((first, second) => second.height - first.height);
  for (const interval of intervals) {
    const candidate = findWidestInteriorPointOnScanline(polygon, interval.latitude);
    if (candidate) return candidate;
  }
  return null;
}

export function findRepresentativePoint(geometry) {
  const polygons = getPolygons(geometry);
  if (polygons.length === 0) return null;
  const candidates = polygons
    .map((polygon) => ({ polygon, area: Math.abs(signedRingArea(polygon[0] ?? [])) }))
    .sort((first, second) => second.area - first.area);

  for (const { polygon } of candidates) {
    if (!polygon?.[0]) continue;
    const centroid = centroidOfRing(polygon[0]);
    if (centroid && pointInPolygonInterior(centroid, polygon)) return centroid;

    const bbox = computeBbox({ type: "Polygon", coordinates: polygon });
    if (bbox) {
      const bboxCenter = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
      if (pointInPolygonInterior(bboxCenter, polygon)) return bboxCenter;
    }

    const scanlinePoint = findScanlineInteriorPoint(polygon);
    if (scanlinePoint) return scanlinePoint;
  }
  return null;
}
