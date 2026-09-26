type Dimensions = { width: number; height: number };
type VideoTransform = { zoom: number; translateX: number; translateY: number };

/** Visible pixels of an object-fit:contain feed, excluding its letterboxing. */
export function videoOverlayInsets(frame?: Dimensions, media?: Dimensions, transform?: VideoTransform) {
  if (!frame || !media || ![frame.width, frame.height, media.width, media.height].every(value => Number.isFinite(value) && value > 0)) return undefined;
  const scale = Math.min(frame.width / media.width, frame.height / media.height);
  const zoom = transform?.zoom ?? 1;
  const x = transform?.translateX ?? 0;
  const y = transform?.translateY ?? 0;
  if (![zoom, x, y].every(Number.isFinite) || zoom <= 0) return undefined;
  const width = media.width * scale;
  const height = media.height * scale;
  const left = (frame.width - width) / 2 * zoom + x;
  const top = (frame.height - height) / 2 * zoom + y;
  const inset = (value: number, limit: number) => Math.min(limit, Math.max(0, value));
  return {
    left: inset(left, frame.width),
    top: inset(top, frame.height),
    right: inset(frame.width - left - width * zoom, frame.width),
    bottom: inset(frame.height - top - height * zoom, frame.height),
  };
}
