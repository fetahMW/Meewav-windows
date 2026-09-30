const POSITION_TOLERANCE = 3;

/** Page to a real card edge, even when portrait and landscape widths alternate. */
export function roomRailPageTarget(
  cardStarts: readonly number[],
  position: number,
  viewportWidth: number,
  maximum: number,
  direction: -1 | 1,
): number {
  const current = Math.min(maximum, Math.max(0, position));
  const pageEdge = current + direction * viewportWidth;
  const candidates = cardStarts.filter((start) =>
    direction > 0 ? start > current + POSITION_TOLERANCE : start < current - POSITION_TOLERANCE,
  );
  const pageCandidates = candidates.filter((start) =>
    direction > 0 ? start <= pageEdge : start >= pageEdge,
  );
  const target = direction > 0
    ? (pageCandidates.at(-1) ?? candidates[0] ?? maximum)
    : (pageCandidates[0] ?? candidates.at(-1) ?? 0);
  return Math.min(maximum, Math.max(0, target));
}
