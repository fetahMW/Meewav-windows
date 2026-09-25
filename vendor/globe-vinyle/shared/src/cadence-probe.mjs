// Local diagnostic: compare the browser clock with and without globe rendering.
// The frozen phases leave the last image intact and never move the camera.
export function createCadenceProbe() {
  let run = null;
  const stages = [true, false, false, true];
  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    const at = (p) =>
      sorted.length ? +sorted[Math.floor((sorted.length - 1) * p)].toFixed(2) : null;
    return { frames: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1) };
  };
  function finish(aborted = false) {
    if (!run) return;
    const current = run;
    run = null;
    current.resolve({
      aborted,
      stages: current.samples.map((samples, i) => ({
        rendering: stages[i],
        ...summarize(samples),
      })),
    });
  }
  return {
    get active() {
      return run !== null;
    },
    start() {
      if (run) throw Error("Mesure de cadence déjà en cours");
      return new Promise((resolve) => {
        run = { resolve, started: null, samples: stages.map(() => []) };
      });
    },
    frame(now, interval) {
      if (!run) return true;
      if (run.started === null) run.started = now;
      const elapsed = now - run.started;
      const stage = Math.floor(elapsed / 1500);
      if (stage >= stages.length) {
        finish();
        return true;
      }
      // Exclude phase transitions and warm-up from the comparison.
      if (elapsed % 1500 >= 300 && interval > 0) run.samples[stage].push(interval);
      return stages[stage];
    },
    cancel() {
      finish(true);
    },
  };
}
