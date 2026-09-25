export const AVATAR_LABEL_OVERVIEW_ZOOM = 15.1;
export const AVATAR_LABEL_FULL_DEPTH_ZOOM = 17.1;
export const AVATAR_LABEL_FALLBACK_HOST_Y_RATIO = 0.5;
export const AVATAR_LABEL_ROW_COUNT_BEHIND_HOST = 3;

const AVATAR_LABEL_MIN_ROW_HEIGHT_PX = 12;
const AVATAR_LABEL_MAX_ROW_HEIGHT_PX = 120;
const AVATAR_LABEL_MAX_CUTOFF_Y_RATIO = 0.62;
const AVATAR_LABEL_MIN_DEPTH_BAND_RATIO = 0.03;
const AVATAR_LABEL_OVERVIEW_BACK_OPACITY = 0.34;
const AVATAR_LABEL_FULL_DEPTH_BACK_OPACITY = 0.72;
const AVATAR_LABEL_OVERVIEW_HOST_OPACITY = 0.55;
const AVATAR_LABEL_FULL_DEPTH_HOST_OPACITY = 0.82;

export type AvatarLabelDepthPolicy = {
  backOpacity: number;
  cutoffYRatio: number;
  foregroundYRatio: number;
  hostOpacity: number;
  hostYRatio: number;
  rowHeightPx: number;
  threeRowsYRatio: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function smoothStep(edge0: number, edge1: number, value: number) {
  const progress = clamp((value - edge0) / Math.max(edge1 - edge0, Number.EPSILON), 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function getAvatarLabelDepthPolicy({
  hostYRatio,
  viewportHeight,
  zoom,
}: {
  hostYRatio?: number | null;
  viewportHeight: number;
  zoom: number;
}): AvatarLabelDepthPolicy {
  const safeViewportHeight = Math.max(1, Number(viewportHeight) || 1);
  const safeZoom = Number.isFinite(zoom) ? zoom : AVATAR_LABEL_OVERVIEW_ZOOM;
  const safeHostYRatio = Number.isFinite(hostYRatio)
    ? clamp(Number(hostYRatio), 0, 1)
    : AVATAR_LABEL_FALLBACK_HOST_Y_RATIO;
  const rowHeightPx = clamp(
    AVATAR_LABEL_MIN_ROW_HEIGHT_PX * (2 ** (safeZoom - AVATAR_LABEL_OVERVIEW_ZOOM)),
    AVATAR_LABEL_MIN_ROW_HEIGHT_PX,
    AVATAR_LABEL_MAX_ROW_HEIGHT_PX,
  );
  const threeRowsYRatio = (
    AVATAR_LABEL_ROW_COUNT_BEHIND_HOST * rowHeightPx
  ) / safeViewportHeight;
  const cutoffYRatio = clamp(
    safeHostYRatio - threeRowsYRatio,
    0,
    AVATAR_LABEL_MAX_CUTOFF_Y_RATIO,
  );
  const foregroundYRatio = clamp(
    safeHostYRatio + threeRowsYRatio,
    cutoffYRatio + AVATAR_LABEL_MIN_DEPTH_BAND_RATIO,
    1,
  );
  const clarity = smoothStep(
    AVATAR_LABEL_OVERVIEW_ZOOM,
    AVATAR_LABEL_FULL_DEPTH_ZOOM,
    safeZoom,
  );

  return {
    backOpacity: mix(
      AVATAR_LABEL_OVERVIEW_BACK_OPACITY,
      AVATAR_LABEL_FULL_DEPTH_BACK_OPACITY,
      clarity,
    ),
    cutoffYRatio,
    foregroundYRatio,
    hostOpacity: mix(
      AVATAR_LABEL_OVERVIEW_HOST_OPACITY,
      AVATAR_LABEL_FULL_DEPTH_HOST_OPACITY,
      clarity,
    ),
    hostYRatio: safeHostYRatio,
    rowHeightPx,
    threeRowsYRatio,
  };
}

export function getAvatarLabelOpacity(
  policy: AvatarLabelDepthPolicy,
  yRatio: number,
  priority = false,
) {
  if (priority) return 1;
  if (yRatio < policy.cutoffYRatio) return 0;

  if (yRatio < policy.hostYRatio) {
    return mix(
      policy.backOpacity,
      policy.hostOpacity,
      smoothStep(policy.cutoffYRatio, policy.hostYRatio, yRatio),
    );
  }

  return mix(
    policy.hostOpacity,
    1,
    smoothStep(policy.hostYRatio, policy.foregroundYRatio, yRatio),
  );
}
