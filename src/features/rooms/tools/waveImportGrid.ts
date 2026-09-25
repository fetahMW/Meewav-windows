export type WaveImportBars = 4 | 8 | 16;

const SUPPORTED_BARS: readonly WaveImportBars[] = [4, 8, 16];

/** Maps decoded media duration to the current musical grid. The tolerance only
 * absorbs codec padding; it is deliberately too small to hide tempo drift. */
export function waveBarsForImportedDuration({
  durationSeconds,
  bpm,
  beatsPerBar = 4,
  fallbackBars,
}: {
  durationSeconds: number;
  bpm: number;
  beatsPerBar?: number;
  fallbackBars: WaveImportBars;
}): WaveImportBars {
  if (!(durationSeconds > 0)) return fallbackBars;
  if (!(bpm > 0) || !(beatsPerBar > 0)) throw new Error("wave_import_grid_invalid");
  const measuredBars = durationSeconds * bpm / (60 * beatsPerBar);
  const closest = SUPPORTED_BARS.reduce((best, bars) => (
    Math.abs(measuredBars - bars) < Math.abs(measuredBars - best) ? bars : best
  ));
  const codecToleranceBars = Math.max(.08, closest * .015);
  if (Math.abs(measuredBars - closest) > codecToleranceBars) throw new Error("wave_import_duration_off_grid");
  return closest;
}

export function assertWaveBaseDuration(input: {
  durationSeconds: number;
  bpm: number;
  beatsPerBar?: number;
  baseBars: 4 | 8;
}): 4 | 8 {
  const bars = waveBarsForImportedDuration({ ...input, fallbackBars: input.baseBars });
  if (bars !== input.baseBars) throw new Error("wave_import_base_length_mismatch");
  return input.baseBars;
}
