// Keep the elapsed animation time intact while budgeting desktop GPU frames.
export function createRenderCadence(enabled = false) {
  let nextFrame = 0, previousAmbient = null;
  return {
    frame(now, ambient, urgent = false) {
      if (!enabled) return true;
      const interval = 1000 / (ambient ? 30 : 60);
      if (urgent || previousAmbient !== ambient) {
        previousAmbient = ambient;
        nextFrame = now + interval;
        return true;
      }
      if (now + 0.5 < nextFrame) return false;
      nextFrame += interval;
      if (nextFrame <= now) nextFrame = now + interval;
      return true;
    },
    reset() { nextFrame = 0; previousAmbient = null; },
  };
}
