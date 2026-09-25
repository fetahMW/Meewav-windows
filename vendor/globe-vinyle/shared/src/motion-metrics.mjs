const rounded = (value) => Math.round(value * 100) / 100;
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? rounded(sorted[Math.floor((sorted.length - 1) * p)]) : null;
};
export function createMotionMetrics() {
  let enabled = false,
    frames = [],
    gpu = [],
    inputs = [],
    kind = "flight",
    pendingInput = null,
    previousInput = null,
    previousRender = null;
  return {
    start() {
      enabled = true;
      frames = [];
      gpu = [];
      inputs = [];
      pendingInput = null;
      previousInput = previousRender = null;
    },
    stop() {
      enabled = false;
    },
    get enabled() {
      return enabled;
    },
    input(type, time, begin = false) {
      if (begin || (previousInput !== null && time - previousInput > 150)) previousRender = null;
      previousInput = time;
      kind = type;
      pendingInput = time;
    },
    kind(type) {
      kind = type;
      previousRender = null;
    },
    frame(data) {
      if (!enabled || !data.moving || frames.length >= 10000) return;
      const renderInterval = previousRender === null ? null : data.now - previousRender;
      frames.push({ ...data, renderInterval, kind });
      previousRender = data.now;
      if (pendingInput !== null) {
        inputs.push(Math.max(0, data.now - pendingInput));
        pendingInput = null;
      }
    },
    gpu(ms) {
      if (enabled && gpu.length < 10000) gpu.push(ms);
    },
    report() {
      const intervals = frames.map((f) => f.interval),
        cpu = frames.map((f) => f.cpu),
        renderIntervals = frames.map((f) => f.renderInterval).filter((t) => t !== null);
      return {
        enabled,
        frames: frames.length,
        frameP50Ms: percentile(intervals, 0.5),
        frameP95Ms: percentile(intervals, 0.95),
        frameP99Ms: percentile(intervals, 0.99),
        frameMaxMs: percentile(intervals, 1),
        intervalMeaning:
          "frame fields measure RAF timing; render fields measure successive moving submissions within a gesture",
        renderIntervalP50Ms: percentile(renderIntervals, 0.5),
        renderIntervalP95Ms: percentile(renderIntervals, 0.95),
        renderIntervalMaxMs: percentile(renderIntervals, 1),
        over16ms: intervals.filter((t) => t > 16.8).length,
        over33ms: intervals.filter((t) => t > 33.5).length,
        over50ms: intervals.filter((t) => t > 50).length,
        cpuP95Ms: percentile(cpu, 0.95),
        cpuMaxMs: percentile(cpu, 1),
        gpuP95Ms: percentile(gpu, 0.95),
        gpuMaxMs: percentile(gpu, 1),
        gpuSamples: gpu.length,
        inputToFrameP95Ms: percentile(inputs, 0.95),
        worstFrames: [...frames]
          .sort((a, b) => b.interval - a.interval)
          .slice(0, 8)
          .map((f) => ({
            interval: rounded(f.interval),
            cpu: rounded(f.cpu),
            height: rounded(f.height),
            kind: f.kind,
            triangles: f.triangles,
            loading: f.loading,
          })),
      };
    },
  };
}
