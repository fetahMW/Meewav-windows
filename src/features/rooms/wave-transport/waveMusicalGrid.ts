export type WaveBars = 4 | 8 | 16 | 32;
export type WaveGrid = { bpm: number; beatsPerBar: number; origin: number };
export type WaveRegion = { start: number; end: number };
export const secondsPerBar = (grid: WaveGrid) => 60 / grid.bpm * grid.beatsPerBar;
export const WAVE_REGION_STEP_BARS = 4;
export const secondsPerRegionStep = (grid: WaveGrid) => WAVE_REGION_STEP_BARS * secondsPerBar(grid);
export const validGrid = (grid: WaveGrid) => Number.isFinite(grid.bpm) && grid.bpm >= 40 && grid.bpm <= 260
  && Number.isInteger(grid.beatsPerBar) && grid.beatsPerBar > 0 && grid.beatsPerBar <= 12 && Number.isFinite(grid.origin);
export const wrap = (value: number, length: number) => ((value % length) + length) % length;
export function musicalRegion(seconds: number, bars: WaveBars, grid: WaveGrid, duration = Infinity): WaveRegion {
  const bar = secondsPerBar(grid);
  const step = secondsPerRegionStep(grid);
  // The grid starts at the configured first downbeat: bars 1, 5, 9, 13…
  // Clamp the block index, not the time, so the final position stays on-grid.
  const lastBlock = Math.max(0, Math.floor((duration - grid.origin - bars * bar) / step + 1e-9));
  const block = Math.min(lastBlock, Math.max(0, Math.round((seconds - grid.origin) / step)));
  const start = grid.origin + block * step;
  return { start, end: start + bars * bar };
}
export function nextBoundary(position: number, grid: WaveGrid, region: WaveRegion | null) {
  if (region) return region.end - (region.start + wrap(position - region.start, region.end - region.start));
  const bar = secondsPerBar(grid);
  return bar - wrap(position - grid.origin, bar);
}
