const METERS_PER_LATITUDE_DEGREE = 111_320;
const DEFAULT_PRECISION_METERS = 1;
const DEFAULT_MAX_CELLS = 250_000;

type LngLat = [number, number];
type ProjectedPoint = { x: number; y: number };
type ProjectedRing = ProjectedPoint[];
type ProjectedPolygon = ProjectedRing[];

export type InteriorVisualCenterOptions = {
  /** Maximum remaining uncertainty around the returned point. */
  precisionMeters?: number;
  /** Safety limit for malformed or exceptionally detailed geometries. */
  maxCells?: number;
};

type Projection = {
  project(position: GeoJSON.Position): ProjectedPoint | null;
  unproject(point: ProjectedPoint): LngLat;
};

class Cell {
  readonly d: number;
  readonly max: number;

  constructor(
    readonly x: number,
    readonly y: number,
    readonly h: number,
    polygon: ProjectedPolygon,
  ) {
    this.d = signedDistanceToPolygon({ x, y }, polygon);
    this.max = this.d + h * Math.SQRT2;
  }
}

class MaxCellHeap {
  private readonly cells: Cell[] = [];

  get size() {
    return this.cells.length;
  }

  push(cell: Cell) {
    const cells = this.cells;
    cells.push(cell);
    let index = cells.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (cells[parent].max >= cell.max) break;
      cells[index] = cells[parent];
      index = parent;
    }
    cells[index] = cell;
  }

  pop() {
    const cells = this.cells;
    const first = cells[0];
    const last = cells.pop();
    if (!first || !last || cells.length === 0) return first;

    let index = 0;
    cells[0] = last;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= cells.length) break;
      let largest = left;
      if (right < cells.length && cells[right].max > cells[left].max) largest = right;
      if (cells[largest].max <= cells[index].max) break;
      [cells[index], cells[largest]] = [cells[largest], cells[index]];
      index = largest;
    }
    return first;
  }
}

function isFinitePosition(position: GeoJSON.Position): position is LngLat {
  return position.length >= 2 && Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

function createLocalProjection(polygon: GeoJSON.Position[][]): Projection | null {
  const exterior = polygon[0]?.filter(isFinitePosition) ?? [];
  if (exterior.length < 3) return null;

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const [lng, lat] of exterior) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  if (![west, east, south, north].every(Number.isFinite)) return null;

  const originLng = (west + east) / 2;
  const originLat = (south + north) / 2;
  // Longitude degrees shrink with latitude. This local equirectangular
  // projection prevents east/west clearance from being overvalued in France.
  const longitudeScale = Math.max(1e-6, Math.abs(Math.cos(originLat * Math.PI / 180)));

  return {
    project(position) {
      if (!isFinitePosition(position)) return null;
      return {
        x: (position[0] - originLng) * longitudeScale,
        y: position[1] - originLat,
      };
    },
    unproject(point) {
      return [point.x / longitudeScale + originLng, point.y + originLat];
    },
  };
}

function projectPolygon(
  polygon: GeoJSON.Position[][],
  project: (position: GeoJSON.Position) => ProjectedPoint | null,
): ProjectedPolygon | null {
  const rings = polygon
    .map((ring) => ring.flatMap((position) => {
      const point = project(position);
      return point ? [point] : [];
    }))
    .filter((ring) => ring.length >= 3);
  return rings[0]?.length >= 3 ? rings : null;
}

function pointToSegmentDistanceSquared(
  point: ProjectedPoint,
  start: ProjectedPoint,
  end: ProjectedPoint,
) {
  let x = start.x;
  let y = start.y;
  const dx = end.x - x;
  const dy = end.y - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = end.x;
      y = end.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }
  const distanceX = point.x - x;
  const distanceY = point.y - y;
  return distanceX * distanceX + distanceY * distanceY;
}

/** Positive inside the exterior and outside all holes; negative otherwise. */
function signedDistanceToPolygon(point: ProjectedPoint, polygon: ProjectedPolygon) {
  let inside = false;
  let minimumDistanceSquared = Number.POSITIVE_INFINITY;

  for (const ring of polygon) {
    for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
      const start = ring[index];
      const end = ring[previous];
      if (
        (start.y > point.y) !== (end.y > point.y)
        && point.x < (end.x - start.x) * (point.y - start.y) / (end.y - start.y) + start.x
      ) {
        inside = !inside;
      }
      minimumDistanceSquared = Math.min(
        minimumDistanceSquared,
        pointToSegmentDistanceSquared(point, start, end),
      );
    }
  }

  const distance = Math.sqrt(minimumDistanceSquared);
  return (inside ? 1 : -1) * distance;
}

function createCentroidCell(polygon: ProjectedPolygon) {
  const ring = polygon[0];
  let area = 0;
  let x = 0;
  let y = 0;

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const start = ring[index];
    const end = ring[previous];
    const cross = start.x * end.y - end.x * start.y;
    x += (start.x + end.x) * cross;
    y += (start.y + end.y) * cross;
    area += cross;
  }

  if (Math.abs(area) < Number.EPSILON) {
    return new Cell(ring[0].x, ring[0].y, 0, polygon);
  }
  return new Cell(x / (3 * area), y / (3 * area), 0, polygon);
}

function findPolygonVisualCenter(
  sourcePolygon: GeoJSON.Position[][],
  precision: number,
  maxCells: number,
) {
  const projection = createLocalProjection(sourcePolygon);
  if (!projection) return null;
  const polygon = projectPolygon(sourcePolygon, projection.project);
  if (!polygon) return null;

  const projectedCenter = findProjectedPolygonVisualCenter(polygon, precision, maxCells);
  if (!projectedCenter) return null;
  return {
    center: projection.unproject(projectedCenter.center),
    clearance: projectedCenter.clearance,
  };
}

function findProjectedPolygonVisualCenter(
  polygon: ProjectedPolygon,
  precision: number,
  maxCells: number,
) {

  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const point of polygon[0]) {
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumX = Math.max(maximumX, point.x);
    maximumY = Math.max(maximumY, point.y);
  }

  const width = maximumX - minimumX;
  const height = maximumY - minimumY;
  const cellSize = Math.min(width, height);
  if (!(cellSize > 0)) return null;

  const heap = new MaxCellHeap();
  const halfCell = cellSize / 2;
  for (let x = minimumX; x < maximumX; x += cellSize) {
    for (let y = minimumY; y < maximumY; y += cellSize) {
      heap.push(new Cell(x + halfCell, y + halfCell, halfCell, polygon));
    }
  }

  let best = createCentroidCell(polygon);
  const bboxCenter = new Cell(
    minimumX + width / 2,
    minimumY + height / 2,
    0,
    polygon,
  );
  if (bboxCenter.d > best.d) best = bboxCenter;

  let visitedCells = 0;
  while (heap.size > 0 && visitedCells < maxCells) {
    const cell = heap.pop();
    if (!cell) break;
    visitedCells += 1;
    if (cell.d > best.d) best = cell;
    if (cell.max - best.d <= precision) continue;

    const h = cell.h / 2;
    heap.push(new Cell(cell.x - h, cell.y - h, h, polygon));
    heap.push(new Cell(cell.x + h, cell.y - h, h, polygon));
    heap.push(new Cell(cell.x - h, cell.y + h, h, polygon));
    heap.push(new Cell(cell.x + h, cell.y + h, h, polygon));
  }

  // Returning null for a zero-area or malformed component is safer than ever
  // placing the host on a border, in a hole, or outside the selected scene.
  if (!(best.d > 0)) return null;
  return { center: { x: best.x, y: best.y }, clearance: best.d };
}

/**
 * Finds the pole of inaccessibility of a Polygon or MultiPolygon.
 *
 * The result, when non-null, is strictly inside a polygon component and never
 * inside one of its holes. MultiPolygons select the component offering the
 * greatest boundary clearance rather than blindly using its bounding box.
 */
export function findInteriorVisualCenter(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined,
  options: InteriorVisualCenterOptions = {},
): LngLat | null {
  if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) {
    return null;
  }

  const precisionMeters = Number.isFinite(options.precisionMeters) && (options.precisionMeters ?? 0) > 0
    ? options.precisionMeters as number
    : DEFAULT_PRECISION_METERS;
  const maxCells = Number.isFinite(options.maxCells) && (options.maxCells ?? 0) > 0
    ? Math.max(1, Math.trunc(options.maxCells as number))
    : DEFAULT_MAX_CELLS;
  const precision = precisionMeters / METERS_PER_LATITUDE_DEGREE;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  let best: ReturnType<typeof findPolygonVisualCenter> = null;
  for (const polygon of polygons) {
    const candidate = findPolygonVisualCenter(polygon, precision, maxCells);
    if (candidate && (!best || candidate.clearance > best.clearance)) best = candidate;
  }
  return best?.center ?? null;
}
