import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { PlaceLiveKitService } from "./placeLiveKit.service";

export type UsePlaceLiveKitRoomOptions = {
  /** Demo Rooms deliberately stay outside the real media plane. */
  enabled?: boolean;
  /** Reissues server-derived grants when a Viewer enters or leaves the stage. */
  accessKey?: string;
  /** Lifecycle injection reserved for service tests and native shells. */
  service?: PlaceLiveKitService;
};

export function usePlaceLiveKitRoom(
  roomId: string | null | undefined,
  options: UsePlaceLiveKitRoomOptions = {},
) {
  const serviceRef = useRef<PlaceLiveKitService | null>(null);
  if (!serviceRef.current) serviceRef.current = options.service ?? new PlaceLiveKitService();
  const service = serviceRef.current;
  const enabled = options.enabled !== false && Boolean(roomId);
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot);

  useEffect(() => {
    if (!enabled || !roomId) {
      void service.disconnect();
      return;
    }
    void service.connect(roomId);
    return () => {
      void service.disconnect();
    };
  }, [enabled, options.accessKey, roomId, service]);

  const startAudio = useCallback(() => service.startAudio(), [service]);
  const prepareMusicTrack = useCallback(
    (track: MediaStreamTrack, generation: string) => service.prepareMusicTrack(track, generation),
    [service],
  );
  const setMusicEnabled = useCallback((next: boolean) => service.setMusicEnabled(next), [service]);
  const releaseMusicTrack = useCallback(() => service.releaseMusicTrack(), [service]);
  const prepareVoiceTrack = useCallback(
    (track: MediaStreamTrack, generation: string) => service.prepareVoiceTrack(track, generation),
    [service],
  );
  const setVoiceEnabled = useCallback((next: boolean) => service.setVoiceEnabled(next), [service]);
  const releaseVoiceTrack = useCallback(() => service.releaseVoiceTrack(), [service]);
  const prepareCallProgramTrack = useCallback(
    (track: MediaStreamTrack, generation: string) => service.prepareCallProgramTrack(track, generation),
    [service],
  );
  const setCallProgramEnabled = useCallback(
    (next: boolean) => service.setCallProgramEnabled(next),
    [service],
  );
  const releaseCallProgramTrack = useCallback(() => service.releaseCallProgramTrack(), [service]);
  const publishScreenShareStream = useCallback(
    (stream: MediaStream, generation: string) => service.publishScreenShareStream(stream, generation),
    [service],
  );
  const releaseScreenShare = useCallback(() => service.releaseScreenShare(), [service]);
  const setCameraEnabled = useCallback((next: boolean) => service.setCameraEnabled(next), [service]);
  const publishProgramVideo = useCallback((track: MediaStreamTrack) => service.publishProgramVideo(track), [service]);

  return {
    ...snapshot,
    startAudio,
    prepareMusicTrack,
    setMusicEnabled,
    releaseMusicTrack,
    prepareVoiceTrack,
    setVoiceEnabled,
    releaseVoiceTrack,
    prepareCallProgramTrack,
    setCallProgramEnabled,
    releaseCallProgramTrack,
    publishScreenShareStream,
    releaseScreenShare,
    setCameraEnabled,
    publishProgramVideo,
  };
}

export default usePlaceLiveKitRoom;
