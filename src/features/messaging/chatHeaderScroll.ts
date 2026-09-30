export type ChatScrollSample = {
  top: number;
  maximum: number;
  viewport: number;
  userIntent: boolean;
  forceVisible?: boolean;
};

/** Direction hysteresis without timers or layout writes on each scroll frame. */
export function createChatHeaderScroll() {
  let previous: ChatScrollSample | null = null;
  let hidden = false;
  let direction = 0;
  let travelled = 0;
  return {
    reset() { previous = null; hidden = false; direction = 0; travelled = 0; },
    update(sample: ChatScrollSample) {
      const top = Math.max(0, Math.min(sample.maximum, sample.top));
      const resized = previous && (Math.abs(previous.maximum - sample.maximum) > 1 || Math.abs(previous.viewport - sample.viewport) > 1);
      const delta = previous ? top - previous.top : 0;
      const initial = !previous;
      previous = { ...sample, top };
      if (initial || resized || sample.forceVisible || sample.maximum < 96 || top <= 8) {
        hidden = false; travelled = 0; direction = 0;
        return hidden;
      }
      if (!sample.userIntent) { travelled = 0; direction = 0; return hidden; }
      if (Math.abs(delta) < .75) return hidden;
      const nextDirection = Math.sign(delta);
      if (nextDirection !== direction) travelled = 0;
      direction = nextDirection;
      travelled += Math.abs(delta);
      if (direction > 0 && travelled >= 24 && top > 64) hidden = true;
      if (direction < 0 && travelled >= 12) hidden = false;
      return hidden;
    },
  };
}
