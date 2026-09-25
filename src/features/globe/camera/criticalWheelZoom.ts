export function getSigmoidWheelZoomDelta(
  accumulatedDelta: number,
  zoomRate: number,
  maximumScalePerFrame = 2,
) {
  if (!Number.isFinite(accumulatedDelta) || accumulatedDelta === 0) return 0;
  if (!Number.isFinite(zoomRate) || zoomRate <= 0) return 0;

  let scale = maximumScalePerFrame
    / (1 + Math.exp(-Math.abs(accumulatedDelta * zoomRate)));
  if (accumulatedDelta < 0 && scale !== 0) scale = 1 / scale;

  return Math.log2(scale);
}

export function normalizePhysicalWheelDelta(
  accumulatedDelta: number,
  minimumImpulse: number,
) {
  if (!Number.isFinite(accumulatedDelta) || accumulatedDelta === 0) return 0;
  if (!Number.isFinite(minimumImpulse) || minimumImpulse <= 0) return accumulatedDelta;
  return Math.sign(accumulatedDelta) * Math.max(Math.abs(accumulatedDelta), minimumImpulse);
}

export function clampWheelTargetLead(
  targetZoom: number,
  currentZoom: number,
  maximumLead: number,
) {
  if (!Number.isFinite(targetZoom) || !Number.isFinite(currentZoom)) return currentZoom;
  if (!Number.isFinite(maximumLead) || maximumLead <= 0) return currentZoom;
  return Math.min(
    currentZoom + maximumLead,
    Math.max(currentZoom - maximumLead, targetZoom),
  );
}

export type ExponentialWheelCoastStep = {
  displacement: number;
  velocity: number;
};

export function stepExponentialWheelCoast(
  velocity: number,
  drag: number,
  deltaSeconds: number,
): ExponentialWheelCoastStep {
  if (!Number.isFinite(velocity)) return { displacement: 0, velocity: 0 };
  if (!Number.isFinite(drag) || drag <= 0) {
    return { displacement: 0, velocity };
  }
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return { displacement: 0, velocity };
  }

  const decay = Math.exp(-drag * deltaSeconds);
  const nextVelocity = velocity * decay;

  return {
    // Exact integration of v(t) = v0 * exp(-drag * t). This makes the
    // trajectory independent from the display refresh rate.
    displacement: (velocity - nextVelocity) / drag,
    velocity: nextVelocity,
  };
}

export function isExponentialWheelCoastSettled(
  velocity: number,
  velocityEpsilon: number,
) {
  return !Number.isFinite(velocity) || Math.abs(velocity) <= velocityEpsilon;
}
