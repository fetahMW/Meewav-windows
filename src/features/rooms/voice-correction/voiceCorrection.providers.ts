export type VoiceCorrectionProviderId = "opendaw" | "meewav_test";
export type NativeVst3VoiceCorrectionProviderId = "antares.autotune" | "sixthsample.spoton" | "auburnsounds.graillon3";

export type VoiceCorrectionProvider = {
  id: VoiceCorrectionProviderId;
  label: string;
  shortLabel: string;
  description: string;
};

export type NativeVst3VoiceCorrectionProvider = {
  id: NativeVst3VoiceCorrectionProviderId;
  label: string;
  shortLabel: string;
  description: string;
  version: string;
  command: string;
};

export const VOICE_CORRECTION_PROVIDERS: ReadonlyArray<VoiceCorrectionProvider> = Object.freeze([
  Object.freeze({
    id: "opendaw",
    label: "Autotune openDAW",
    shortLabel: "openDAW",
    description: "Moteur WASM local · piste sèche de secours",
  }),
  Object.freeze({
    id: "meewav_test",
    label: "Autotune MeeWav test",
    shortLabel: "MeeWav test",
    description: "Algorithme YIN local · AudioWorklet expérimental",
  }),
]);

export const NATIVE_VST3_VOICE_CORRECTION_PROVIDERS: ReadonlyArray<NativeVst3VoiceCorrectionProvider> = Object.freeze([
  Object.freeze({
    id: "antares.autotune",
    label: "Autotune Antares",
    shortLabel: "Auto-Tune Pro",
    description: "VST3 11.0.0 · contrôles locaux vérifiés",
    version: "11.0.0",
    command: ".\\apps\\meewav-audio-engine\\build-vst3-poc\\Release\\meewav-vst3-live-poc.exe --plugin antares.autotune --confirm-headphones",
  }),
  Object.freeze({
    id: "sixthsample.spoton",
    label: "Autotune Spoton",
    shortLabel: "Spoton",
    description: "VST3 1.1.2 · scan local validé",
    version: "1.1.2",
    command: ".\\apps\\meewav-audio-engine\\build-vst3-poc\\Release\\meewav-vst3-live-poc.exe --plugin sixthsample.spoton --confirm-headphones",
  }),
  Object.freeze({
    id: "auburnsounds.graillon3",
    label: "Autotune Graillon 3",
    shortLabel: "Graillon 3",
    description: "VST3 3.2.0 · scan local validé",
    version: "3.2.0",
    command: ".\\apps\\meewav-audio-engine\\build-vst3-poc\\Release\\meewav-vst3-live-poc.exe --plugin auburnsounds.graillon3 --confirm-headphones",
  }),
]);

export function voiceCorrectionProvider(id: VoiceCorrectionProviderId) {
  const provider = VOICE_CORRECTION_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Moteur de correction inconnu : ${id}`);
  return provider;
}

export function nativeVst3VoiceCorrectionProvider(id: NativeVst3VoiceCorrectionProviderId) {
  const provider = NATIVE_VST3_VOICE_CORRECTION_PROVIDERS.find((candidate) => candidate.id === id);
  if (!provider) throw new Error(`Plugin vocal natif inconnu : ${id}`);
  return provider;
}
