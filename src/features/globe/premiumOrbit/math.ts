export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function normalizeAngleDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function rotatePoint(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  rotationDeg: number,
): { x: number; y: number } {
  const angle = degreesToRadians(rotationDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - centerX;
  const dy = y - centerY;

  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

export function ellipsePoint(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  angleDeg: number,
  rotationDeg = 0,
): { x: number; y: number } {
  const angle = degreesToRadians(angleDeg);
  const x = centerX + radiusX * Math.cos(angle);
  const y = centerY + radiusY * Math.sin(angle);
  return rotatePoint(x, y, centerX, centerY, rotationDeg);
}

/** Full ellipse path. Rotation is applied on the containing SVG group. */
export function fullEllipsePath(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): string {
  return [
    `M ${centerX - radiusX} ${centerY}`,
    `a ${radiusX} ${radiusY} 0 1 0 ${radiusX * 2} 0`,
    `a ${radiusX} ${radiusY} 0 1 0 ${-radiusX * 2} 0`,
  ].join(" ");
}

/**
 * Creates an elliptical arc using a polyline path. The point count is fixed and
 * tiny; the path is rebuilt only while MapLibre is rendering or resizing.
 */
export function ellipseArcPath(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  startDeg: number,
  endDeg: number,
  points = 72,
): string {
  const start = degreesToRadians(startDeg);
  const end = degreesToRadians(endDeg);
  const delta = end - start;
  const commands: string[] = [];

  for (let index = 0; index <= points; index += 1) {
    const amount = index / points;
    const angle = start + delta * amount;
    const x = centerX + radiusX * Math.cos(angle);
    const y = centerY + radiusY * Math.sin(angle);
    commands.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  return commands.join(" ");
}

export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = clamp(Math.ceil((p / 100) * sorted.length) - 1, 0, sorted.length - 1);
  return sorted[index] ?? 0;
}
