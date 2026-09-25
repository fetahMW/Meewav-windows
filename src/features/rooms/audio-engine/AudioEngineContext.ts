import { createContext, useContext } from "react";
import type { AudioEngineChain, AudioEngineState } from "./audioEngine.types";

export type AudioEngineContextValue = AudioEngineState & {
  detect: () => Promise<boolean>;
  launchAndPair: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
  disconnect: () => Promise<void>;
  useWebAudioFallback: (reason?: string) => Promise<void>;
  updateChain: (chain: AudioEngineChain) => Promise<AudioEngineChain>;
  setMonitoring: (enabled: boolean, options?: { outputDeviceId?: string | null; gain?: number }) => Promise<void>;
};

export const AudioEngineContext = createContext<AudioEngineContextValue | null>(null);

export function useAudioEngine() {
  const context = useContext(AudioEngineContext);
  if (!context) throw new Error("useAudioEngine doit être utilisé dans AudioEngineProvider.");
  return context;
}
