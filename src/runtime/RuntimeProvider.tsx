import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type RuntimeId = 'web' | 'desktop-windows' | 'desktop-macos' | 'desktop-unsupported';
export type CaptureSource = { id: string; name: string; thumbnail: string };
export type DesktopDescriptor = {
  runtime: Exclude<RuntimeId, 'web'>;
  screenCapture: boolean;
  windowCapture: boolean;
  systemAudioCapture: boolean;
  professionalAudioDriver: boolean;
};
export type DesktopBridge = {
  version: 1;
  getCapabilities(): Promise<DesktopDescriptor>;
  windowControl?(action: 'minimize' | 'toggle-maximize' | 'close'): Promise<boolean>;
  windowMenu?(action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'select-all' | 'reload' | 'zoom-in' | 'zoom-out' | 'zoom-reset' | 'fullscreen'): Promise<boolean>;
  listCaptureSources(): Promise<CaptureSource[]>;
  selectCaptureSource(id: string, systemAudio?: boolean): Promise<void>;
};
declare global { interface Window { meewavDesktop?: DesktopBridge } }

export type RuntimeCapabilities = {
  runtime: RuntimeId;
  isDesktop: boolean;
  ready: boolean;
  canPrepareHostRoom: boolean;
  canCaptureScreen: boolean;
  canCaptureWindow: boolean;
  canCaptureSystemAudio: boolean;
  canEnumerateMediaDevices: boolean;
  canSelectAudioInput: boolean;
  canUseProfessionalAudioDriver: boolean;
};
export const WEB_CAPABILITIES: RuntimeCapabilities = Object.freeze({
  runtime: 'web', isDesktop: false, ready: true, canPrepareHostRoom: false,
  canCaptureScreen: false, canCaptureWindow: false, canCaptureSystemAudio: false,
  canEnumerateMediaDevices: false, canSelectAudioInput: false, canUseProfessionalAudioDriver: false,
});
export function capabilitiesFromDescriptor(value: DesktopDescriptor): RuntimeCapabilities {
  const supported = value.runtime === 'desktop-windows' || value.runtime === 'desktop-macos';
  return {
    runtime: value.runtime, isDesktop: true, ready: true, canPrepareHostRoom: supported,
    canCaptureScreen: supported && value.screenCapture,
    canCaptureWindow: supported && value.windowCapture,
    canCaptureSystemAudio: supported && value.systemAudioCapture,
    canEnumerateMediaDevices: supported, canSelectAudioInput: supported,
    canUseProfessionalAudioDriver: supported && value.professionalAudioDriver,
  };
}
const RuntimeContext = createContext<RuntimeCapabilities>(WEB_CAPABILITIES);
export const useRuntime = () => useContext(RuntimeContext);

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities>(() => window.meewavDesktop
    ? { ...WEB_CAPABILITIES, ready: false } : WEB_CAPABILITIES);
  useEffect(() => {
    let current = true;
    const bridge = window.meewavDesktop;
    if (bridge?.version === 1) {
      void bridge.getCapabilities().then((descriptor) => {
        if (current) setCapabilities(capabilitiesFromDescriptor(descriptor));
      }).catch(() => { if (current) setCapabilities(WEB_CAPABILITIES); });
    }
    return () => { current = false; };
  }, []);
  return <RuntimeContext.Provider value={capabilities}>{children}</RuntimeContext.Provider>;
}
