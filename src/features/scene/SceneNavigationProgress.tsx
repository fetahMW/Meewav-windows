import { useEffect, useRef, useState } from "react";

const TRAVEL_MS = 1400;
const FINISH_MS = 650;
const HOLD_MS = 250;

function NavigationProgress({ pending }: { pending: boolean }) {
  const pendingRef = useRef(pending);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<"loading" | "complete" | "hidden">("loading");
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    let value = 0;
    let finish: { started: number; from: number } | null = null;
    const advance = (now: number) => {
      const elapsed = now - started;
      // This is an indeterminate navigation cue, not a download percentage.
      // Keep moving below completion while the catalogue is actually pending.
      if (pendingRef.current || elapsed < TRAVEL_MS) {
        finish = null;
        const travel = .78 * Math.min(elapsed / TRAVEL_MS, 1)
          + .14 * (1 - Math.exp(-Math.max(0, elapsed - TRAVEL_MS) / 6000));
        value = Math.max(value, travel);
        setPhase("loading");
      } else {
        finish ??= { started: now, from: value };
        const t = Math.min((now - finish.started) / FINISH_MS, 1);
        value = finish.from + (1 - finish.from) * (t * t * (3 - 2 * t));
        if (t === 1) setPhase("complete");
        if (now - finish.started >= FINISH_MS + HOLD_MS) {
          setPhase("hidden");
          return;
        }
      }
      setProgress(value);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className={`scene-navigation-progress is-${phase}`} aria-hidden="true"><span style={{ transform: `scaleX(${progress})` }} /></div>;
}

/** A route change restarts the cue; resolving a request continues the same stroke. */
export default function SceneNavigationProgress({ navigationKey, pending }: { navigationKey: string; pending: boolean }) {
  const previousPending = useRef(pending);
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (pending && !previousPending.current) setRequest((value) => value + 1);
    previousPending.current = pending;
  }, [pending]);
  return <NavigationProgress key={`${navigationKey}:${request}`} pending={pending} />;
}
