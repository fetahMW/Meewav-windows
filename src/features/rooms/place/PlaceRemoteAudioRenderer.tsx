import { useEffect, useRef } from "react";
import type { PlaceRemoteAudioTrack } from "./placeLiveKit.service";

type PlaceRemoteAudioRendererProps = {
  tracks: Array<PlaceRemoteAudioTrack & { playbackVolume?: number }>;
  enabled?: boolean;
  volume?: number;
};

function RemoteAudioElement({
  item,
  enabled,
  volume,
}: {
  item: PlaceRemoteAudioTrack & { playbackVolume?: number };
  enabled: boolean;
  volume: number;
}) {
  const elementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    item.track.attach(element);
    return () => {
      item.track.detach(element);
      element.srcObject = null;
    };
  }, [item.track]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    element.muted = !enabled || item.muted;
    element.volume = Math.min(1, Math.max(0, item.playbackVolume ?? volume));
    if (enabled && !item.muted) void element.play().catch(() => undefined);
  }, [enabled, item.muted, item.playbackVolume, volume]);

  return (
    <audio
      ref={elementRef}
      autoPlay
      playsInline
      muted={!enabled || item.muted}
      data-place-livekit-publication={item.publicationSid}
      data-place-livekit-participant={item.participantIdentity}
      data-place-livekit-purpose={item.purpose}
      aria-hidden="true"
      style={{ display: "none" }}
    />
  );
}

/**
 * Audio is deliberately rendered once, outside participant video tiles. Voice,
 * music and screen audio therefore survive personal focus/solo or PROGRAM cuts.
 */
export default function PlaceRemoteAudioRenderer({
  tracks,
  enabled = true,
  volume = 1,
}: PlaceRemoteAudioRendererProps) {
  const safeVolume = Math.min(1, Math.max(0, Number.isFinite(volume) ? volume : 1));
  return (
    <>
      {tracks.map((item) => (
        <RemoteAudioElement
          key={item.key}
          item={item}
          enabled={enabled}
          volume={safeVolume}
        />
      ))}
    </>
  );
}
