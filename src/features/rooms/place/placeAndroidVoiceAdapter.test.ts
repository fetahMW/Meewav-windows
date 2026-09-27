import { describe, expect, it } from "vitest";
import { createPlaceDemoState } from "./place.fixtures";
import { androidVoiceAdapter, androidVoiceParameters } from "./placeAndroidVoiceAdapter";

describe("Android voice parameter contract", () => {
  it("maps minor to the exact relative major used on Android", () => {
    const voice = createPlaceDemoState().personalVocal;
    expect(androidVoiceParameters({ ...voice, tuneKey: "A", tuneScale: "Mineure" }).scale).toBe(1);
    expect(androidVoiceParameters({ ...voice, tuneKey: "F#", tuneScale: "Majeure" }).scale).toBe(7);
    expect(androidVoiceParameters({ ...voice, tuneKey: "C", tuneScale: "Chromatique" }).scale).toBe(0);
  });
  it("passes Pro correction values to the Android DSP and leaves reverb squaring to C++", () => {
    const voice = createPlaceDemoState().personalVocal;
    const result = androidVoiceParameters({ ...voice, reverbEnabled: true, reverbAmount: .4 });
    expect(result.reverbAmount).toBe(.4);
    expect(result.speed).toBe(voice.tuneSpeed);
    expect(result.humanize).toBe(voice.tuneHumanize);
    expect(result.smooth).toBe(voice.tuneSmooth);
    expect(androidVoiceAdapter.handlesReverb).toBe(true);
  });
  it("bounds the controls and uses Android's profile for invalid parameters", () => {
    const voice = createPlaceDemoState().personalVocal;
    expect(androidVoiceParameters({ ...voice, tuneSpeed: NaN, tuneHumanize: Infinity, tuneSmooth: NaN }))
      .toMatchObject({ speed: 1, humanize: 0, smooth: 0 });
    expect(androidVoiceParameters({ ...voice, tuneSpeed: 2, tuneHumanize: -1, tuneSmooth: 2 }))
      .toMatchObject({ speed: 1, humanize: 0, smooth: 1 });
  });
  it("rejects incompatible contexts before creating a silent processor", async () => {
    await expect(androidVoiceAdapter.create({ sampleRate: 44100 } as AudioContext)).rejects.toThrow("48 kHz");
  });
});
