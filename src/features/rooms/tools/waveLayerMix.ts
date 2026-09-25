import type { WaveLayer } from "./roomTools.types";

export function hasAudibleWaveSolo(layers: readonly WaveLayer[]) {
  return layers.some((layer) => layer.active && layer.solo && !layer.muted);
}

export function isWaveLayerAudible(layer: WaveLayer, soloActive: boolean) {
  if (!layer.active || layer.muted) return false;
  // Solo is strict: every non-solo layer, including the base, becomes silent.
  // Several active solo layers can remain audible together.
  return !soloActive || layer.solo;
}
