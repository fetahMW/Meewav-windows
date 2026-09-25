import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { PlaceLiveCallMediaService } from "./placeLiveCallMedia.service";

export type UsePlaceLiveCallMediaOptions = {
  /** Lifecycle injection reserved for deterministic service and shell tests. */
  service?: PlaceLiveCallMediaService;
};

/**
 * Connects one accepted invitation to its private two-person audio room.
 * `enabled` controls only the cloned local upstream: a muted participant may
 * continue to hear the authorized peer after browser playback is unlocked.
 */
export function usePlaceLiveCallMedia(
  callId: string | null | undefined,
  localTrack: MediaStreamTrack | null | undefined,
  enabled: boolean,
  options: UsePlaceLiveCallMediaOptions = {},
) {
  const serviceRef = useRef<PlaceLiveCallMediaService | null>(null);
  if (!serviceRef.current) {
    serviceRef.current = options.service ?? new PlaceLiveCallMediaService();
  }
  const service = serviceRef.current;
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);

  useEffect(() => {
    if (!callId) {
      void service.disconnect();
      return;
    }
    void service.connect(callId);
    return () => {
      void service.disconnect();
    };
  }, [callId, service]);

  useEffect(() => {
    if (!callId) return;
    void service.setLocalTrack(localTrack);
    return () => {
      void service.setLocalTrack(null);
    };
  }, [callId, localTrack, service]);

  useEffect(() => {
    void service.setEnabled(Boolean(callId && localTrack && enabled));
  }, [callId, enabled, localTrack, service]);

  const startAudio = useCallback(() => service.startAudio(), [service]);
  const setLocalEnabled = useCallback((next: boolean) => service.setEnabled(next), [service]);
  const resumeCall = useCallback(async (overrideTrack?: MediaStreamTrack | null) => {
    const nextTrack = overrideTrack ?? localTrack ?? null;
    if (!callId || !nextTrack || nextTrack.kind !== "audio" || nextTrack.readyState !== "live") return false;
    const connected = snapshot.status === "connected" || await service.connect(callId);
    if (!connected) return false;
    const prepared = await service.setLocalTrack(nextTrack);
    return prepared && service.setEnabled(true);
  }, [callId, localTrack, service, snapshot.status]);
  const disconnect = useCallback(() => service.disconnect(), [service]);

  return {
    ...snapshot,
    startAudio,
    setLocalEnabled,
    resumeCall,
    disconnect,
  };
}

export default usePlaceLiveCallMedia;
