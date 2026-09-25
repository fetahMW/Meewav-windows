import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { percentile } from "./math";
import type { OrbitQualityMode, ResolvedOrbitQuality } from "./types";

function initialHardwareQuality(): ResolvedOrbitQuality {
  if (typeof navigator === "undefined") return "standard";

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;

  if (cores <= 4 || memory <= 4) return "economy";
  if (cores <= 8 || memory <= 8) return "standard";
  return "high";
}

function downgrade(current: ResolvedOrbitQuality): ResolvedOrbitQuality {
  if (current === "high") return "standard";
  return "economy";
}

function upgrade(current: ResolvedOrbitQuality): ResolvedOrbitQuality {
  if (current === "economy") return "standard";
  return "high";
}

export function useAdaptiveOrbitQuality(
  map: MapLibreMap | null,
  requested: OrbitQualityMode,
): ResolvedOrbitQuality {
  const [resolved, setResolved] = useState<ResolvedOrbitQuality>(() =>
    requested === "auto" ? initialHardwareQuality() : requested,
  );

  useEffect(() => {
    if (requested !== "auto") {
      setResolved(requested);
      return;
    }

    setResolved(initialHardwareQuality());
  }, [requested]);

  useEffect(() => {
    if (!map || requested !== "auto") return;

    let last = performance.now();
    let windowStart = last;
    let lastChange = last;
    let deltas: number[] = [];

    const onRender = () => {
      const now = performance.now();
      const delta = now - last;
      last = now;

      // Ignore background-tab gaps and first-frame spikes.
      if (delta > 0 && delta < 250) deltas.push(delta);

      if (now - windowStart < 2800) return;

      const p90 = percentile(deltas, 90);
      const average =
        deltas.length > 0
          ? deltas.reduce((sum, value) => sum + value, 0) / deltas.length
          : 0;

      setResolved((current) => {
        if (now - lastChange < 7000) return current;

        if (p90 > 42 || average > 27) {
          lastChange = now;
          return downgrade(current);
        }

        if (p90 > 0 && p90 < 22 && average > 0 && average < 17 && now - lastChange > 15000) {
          lastChange = now;
          return upgrade(current);
        }

        return current;
      });

      deltas = [];
      windowStart = now;
    };

    map.on("render", onRender);
    return () => {
      map.off("render", onRender);
    };
  }, [map, requested]);

  return resolved;
}
