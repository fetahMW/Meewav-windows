export type OrbitScreenPoint = {
  x: number;
  y: number;
};

export type OrbitSurfaceTester = (x: number, y: number) => boolean;

export type OrbitAnnulusArcGeometry = {
  cx: number;
  cy: number;
  innerRx: number;
  innerRy: number;
  outerRx: number;
  outerRy: number;
  startAngleDeg: number;
  endAngleDeg: number;
};

const DEFAULT_SCAN_LINES = 17;
const DEFAULT_SCAN_STEPS = 72;
const TRANSITION_REFINEMENT_STEPS = 12;

/**
 * Builds a filled elliptical annulus sector. A regular SVG stroke has a
 * constant screen-space width, so it becomes much too generous above and
 * below a flattened orbit. The filled sector keeps the interactive area
 * between the same inner and outer ellipses as the visible ring.
 */
export function buildOrbitAnnulusArcPath({
  cx,
  cy,
  innerRx,
  innerRy,
  outerRx,
  outerRy,
  startAngleDeg,
  endAngleDeg,
}: OrbitAnnulusArcGeometry) {
  const values = [
    cx,
    cy,
    innerRx,
    innerRy,
    outerRx,
    outerRy,
    startAngleDeg,
    endAngleDeg,
  ];
  if (
    values.some((value) => !Number.isFinite(value))
    || innerRx <= 0
    || innerRy <= 0
    || outerRx <= innerRx
    || outerRy <= innerRy
  ) return "";

  const deltaDeg = positiveModulo(endAngleDeg - startAngleDeg, 360);
  if (deltaDeg === 0) return "";

  const outerStart = ellipsePoint(cx, cy, outerRx, outerRy, startAngleDeg);
  const outerEnd = ellipsePoint(cx, cy, outerRx, outerRy, endAngleDeg);
  const innerStart = ellipsePoint(cx, cy, innerRx, innerRy, startAngleDeg);
  const innerEnd = ellipsePoint(cx, cy, innerRx, innerRy, endAngleDeg);
  const largeArcFlag = deltaDeg > 180 ? 1 : 0;

  return [
    `M ${round(outerStart.x)} ${round(outerStart.y)}`,
    `A ${round(outerRx)} ${round(outerRy)} 0 ${largeArcFlag} 1 ${round(outerEnd.x)} ${round(outerEnd.y)}`,
    `L ${round(innerEnd.x)} ${round(innerEnd.y)}`,
    `A ${round(innerRx)} ${round(innerRy)} 0 ${largeArcFlag} 0 ${round(innerStart.x)} ${round(innerStart.y)}`,
    "Z",
  ].join(" ");
}

/**
 * Creates an even-odd clip path covering the viewport except for the globe.
 * SVG masks affect pixels but not pointer hit-testing; this real clip is what
 * lets MapLibre receive drags through the hidden rear half of the orbit.
 */
export function buildOutsideCircleClipPath(
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
) {
  if (
    ![width, height, cx, cy, radius].every(Number.isFinite)
    || width <= 0
    || height <= 0
    || radius <= 0
  ) return "";

  const left = cx - radius;
  const right = cx + radius;
  return [
    `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`,
    `M ${round(left)} ${round(cy)}`,
    `A ${round(radius)} ${round(radius)} 0 1 0 ${round(right)} ${round(cy)}`,
    `A ${round(radius)} ${round(radius)} 0 1 0 ${round(left)} ${round(cy)}`,
    "Z",
  ].join(" ");
}

/**
 * Samples the actual MapLibre globe silhouette. Unlike a four-direction edge
 * search, this keeps working when the sphere centre or half of the disc is
 * outside the viewport after a pitched/rotated manual dezoom.
 */
export function collectOrbitDiscBoundaryPoints(
  surfaceTester: OrbitSurfaceTester,
  width: number,
  height: number,
  scanLines = DEFAULT_SCAN_LINES,
  scanSteps = DEFAULT_SCAN_STEPS,
) {
  if (!(width > 0) || !(height > 0)) return [];

  const points: OrbitScreenPoint[] = [];
  const safeScanLines = Math.max(3, Math.floor(scanLines));
  const safeScanSteps = Math.max(8, Math.floor(scanSteps));

  for (let index = 0; index < safeScanLines; index += 1) {
    const ratio = (index + 0.5) / safeScanLines;
    collectLineTransitions(
      surfaceTester,
      { x: 0, y: ratio * height },
      { x: width, y: ratio * height },
      safeScanSteps,
      points,
    );
    collectLineTransitions(
      surfaceTester,
      { x: ratio * width, y: 0 },
      { x: ratio * width, y: height },
      safeScanSteps,
      points,
    );
  }

  return points;
}

export function fitOrbitCircleToBoundaryPoints(points: readonly OrbitScreenPoint[]) {
  if (points.length < 6) return null;

  const mean = points.reduce(
    (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
    { x: 0, y: 0 },
  );
  mean.x /= points.length;
  mean.y /= points.length;

  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const vector = [0, 0, 0];

  for (const point of points) {
    const x = point.x - mean.x;
    const y = point.y - mean.y;
    const squaredRadius = x * x + y * y;
    const row = [x, y, 1];
    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      vector[rowIndex] -= row[rowIndex] * squaredRadius;
      for (let columnIndex = 0; columnIndex < 3; columnIndex += 1) {
        matrix[rowIndex][columnIndex] += row[rowIndex] * row[columnIndex];
      }
    }
  }

  const solution = solveThreeByThree(matrix, vector);
  if (!solution) return null;

  const [a, b, c] = solution;
  const radiusSquared = (a * a + b * b) / 4 - c;
  if (!Number.isFinite(radiusSquared) || radiusSquared <= 0) return null;

  const circle = {
    cx: mean.x - a / 2,
    cy: mean.y - b / 2,
    radius: Math.sqrt(radiusSquared),
  };
  if (!Number.isFinite(circle.cx) || !Number.isFinite(circle.cy) || !Number.isFinite(circle.radius)) {
    return null;
  }

  const residual = Math.sqrt(points.reduce((sum, point) => {
    const distance = Math.hypot(point.x - circle.cx, point.y - circle.cy);
    return sum + (distance - circle.radius) ** 2;
  }, 0) / points.length);

  return {
    ...circle,
    residual,
  };
}

function collectLineTransitions(
  surfaceTester: OrbitSurfaceTester,
  start: OrbitScreenPoint,
  end: OrbitScreenPoint,
  steps: number,
  output: OrbitScreenPoint[],
) {
  let previous = start;
  let previousInside = surfaceTester(previous.x, previous.y);

  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps;
    const current = {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    };
    const currentInside = surfaceTester(current.x, current.y);
    if (currentInside !== previousInside) {
      output.push(refineTransition(surfaceTester, previous, current, previousInside));
    }
    previous = current;
    previousInside = currentInside;
  }
}

function refineTransition(
  surfaceTester: OrbitSurfaceTester,
  first: OrbitScreenPoint,
  second: OrbitScreenPoint,
  firstInside: boolean,
) {
  let sameSide = first;
  let otherSide = second;
  for (let index = 0; index < TRANSITION_REFINEMENT_STEPS; index += 1) {
    const midpoint = {
      x: (sameSide.x + otherSide.x) / 2,
      y: (sameSide.y + otherSide.y) / 2,
    };
    if (surfaceTester(midpoint.x, midpoint.y) === firstInside) sameSide = midpoint;
    else otherSide = midpoint;
  }
  return {
    x: (sameSide.x + otherSide.x) / 2,
    y: (sameSide.y + otherSide.y) / 2,
  };
}

function solveThreeByThree(matrix: number[][], vector: number[]) {
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let pivotIndex = 0; pivotIndex < 3; pivotIndex += 1) {
    let bestRow = pivotIndex;
    for (let rowIndex = pivotIndex + 1; rowIndex < 3; rowIndex += 1) {
      if (Math.abs(augmented[rowIndex][pivotIndex]) > Math.abs(augmented[bestRow][pivotIndex])) {
        bestRow = rowIndex;
      }
    }
    if (Math.abs(augmented[bestRow][pivotIndex]) < 1e-8) return null;
    [augmented[pivotIndex], augmented[bestRow]] = [augmented[bestRow], augmented[pivotIndex]];

    const pivot = augmented[pivotIndex][pivotIndex];
    for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
      augmented[pivotIndex][columnIndex] /= pivot;
    }

    for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
      if (rowIndex === pivotIndex) continue;
      const factor = augmented[rowIndex][pivotIndex];
      for (let columnIndex = pivotIndex; columnIndex < 4; columnIndex += 1) {
        augmented[rowIndex][columnIndex] -= factor * augmented[pivotIndex][columnIndex];
      }
    }
  }

  return augmented.map((row) => row[3]);
}

function ellipsePoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  angleDeg: number,
) {
  const angleRad = angleDeg * Math.PI / 180;
  return {
    x: cx + rx * Math.cos(angleRad),
    y: cy + ry * Math.sin(angleRad),
  };
}

function positiveModulo(value: number, modulo: number) {
  return ((value % modulo) + modulo) % modulo;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
