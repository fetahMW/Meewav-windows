import { describe, expect, it } from "vitest";
import type { WaveLayer } from "./roomTools.types";
import { hasAudibleWaveSolo, isWaveLayerAudible } from "./waveLayerMix";

const layers: WaveLayer[] = [
  { id: "base", title: "Arpège", author: "Puff", active: true, solo: false, muted: false },
  { id: "bass", submissionId: "bass-loop", title: "Basse", author: "Eliott", active: true, solo: false, muted: false },
  { id: "drums", submissionId: "drums-loop", title: "Drums", author: "Koda", active: true, solo: false, muted: false },
  { id: "pad", submissionId: "pad-loop", title: "Texture", author: "Mina", active: true, solo: false, muted: false },
];

const audibleIds = (next: WaveLayer[]) => {
  const solo = hasAudibleWaveSolo(next);
  return next.filter((layer) => isWaveLayerAudible(layer, solo)).map((layer) => layer.id);
};

describe("mix des couches du Beat", () => {
  it("joue toutes les boucles non mutées avec la base lorsqu’aucun solo n’est actif", () => {
    expect(audibleIds(structuredClone(layers))).toEqual(["base", "bass", "drums", "pad"]);
  });

  it("permet de cumuler plusieurs solos et coupe strictement tout le reste", () => {
    const next = structuredClone(layers);
    next[1].solo = true;
    next[2].solo = true;
    expect(audibleIds(next)).toEqual(["bass", "drums"]);
  });

  it("respecte le mute et permet au solo de la base de l’isoler", () => {
    const muted = structuredClone(layers);
    muted[2].muted = true;
    expect(audibleIds(muted)).toEqual(["base", "bass", "pad"]);

    const baseOnly = structuredClone(layers);
    baseOnly[0].solo = true;
    expect(audibleIds(baseOnly)).toEqual(["base"]);
  });
});
