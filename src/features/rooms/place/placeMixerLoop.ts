export type PlaceMixerLoopRegion = { start: number; end: number };

export function createMixerLoop(cue: number, duration: number): PlaceMixerLoopRegion | null {
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const length = Math.min(8, duration);
  const start = Math.max(0, Math.min(Number.isFinite(cue) ? cue : 0, duration - length));
  return { start, end: start + length };
}

export function moveMixerLoopEdge(region: PlaceMixerLoopRegion, edge: "start" | "end", seconds: number, duration: number): PlaceMixerLoopRegion {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) return region;
  const minimumLength = Math.min(.25, duration);
  const end = Math.min(duration, Math.max(minimumLength, region.end));
  const start = Math.min(region.start, end - minimumLength);
  return edge === "start"
    ? { start: Math.max(0, Math.min(seconds, end - minimumLength)), end }
    : { start, end: Math.max(start + minimumLength, Math.min(seconds, duration)) };
}

export function mixerLoopPosition(seconds: number, region: PlaceMixerLoopRegion | null) {
  if (!region || (seconds >= region.start && seconds < region.end)) return seconds;
  return region.start;
}
