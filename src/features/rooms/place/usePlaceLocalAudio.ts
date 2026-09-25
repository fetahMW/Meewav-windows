import { useCallback, useEffect, useRef, useState } from "react";
import {
  PlaceLocalAudioEngine,
  type PlaceLocalAudioSnapshot,
  type PlacePitchCorrectionAdapter,
} from "./placeLocalAudioEngine";
import type { PlaceVocalState } from "./place.types";

const processedAudioByRoom = new Map<string, MediaStream>();

/**
 * Transport boundary for the future LiveKit publisher. The returned stream
 * contains the processed microphone and never the local headphone monitor.
 */
export function getPlaceProcessedAudioStream(roomId: string) {
  return processedAudioByRoom.get(roomId) ?? null;
}

type UsePlaceLocalAudioOptions = {
  roomId: string;
  inputEnabled: boolean;
  inputGain?: number;
  pitchAdapter?: PlacePitchCorrectionAdapter | null;
};

export function usePlaceLocalAudio(settings: PlaceVocalState, options: UsePlaceLocalAudioOptions) {
  const engineRef = useRef<PlaceLocalAudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new PlaceLocalAudioEngine(settings, {
      pitchAdapter: options.pitchAdapter,
      inputGain: options.inputGain,
    });
  }
  const engine = engineRef.current;
  const [snapshot, setSnapshot] = useState<PlaceLocalAudioSnapshot>(() => engine.getSnapshot());

  useEffect(() => engine.subscribe(setSnapshot), [engine]);

  useEffect(() => {
    engine.updateSettings(settings);
  }, [engine, settings]);

  useEffect(() => {
    void engine.setPitchAdapter(options.pitchAdapter ?? null);
  }, [engine, options.pitchAdapter]);

  useEffect(() => {
    engine.setInputEnabled(options.inputEnabled);
  }, [engine, options.inputEnabled, options.roomId]);

  useEffect(() => {
    engine.setInputGain(options.inputGain ?? 1);
  }, [engine, options.inputGain, options.roomId]);

  useEffect(() => {
    const stream = snapshot.outputStream;
    if (!stream) {
      processedAudioByRoom.delete(options.roomId);
      return;
    }
    processedAudioByRoom.set(options.roomId, stream);
    return () => {
      if (processedAudioByRoom.get(options.roomId) === stream) processedAudioByRoom.delete(options.roomId);
    };
  }, [options.roomId, snapshot.outputStream]);

  useEffect(() => () => {
    processedAudioByRoom.delete(options.roomId);
    void engine.stop();
  }, [engine, options.roomId]);

  const startCapture = useCallback(() => engine.startCapture(), [engine]);
  const startCaptureWithPitchAdapter = useCallback(
    (adapter: PlacePitchCorrectionAdapter, requestIsCurrent?: () => boolean) => (
      engine.startCaptureWithPitchAdapter(adapter, requestIsCurrent)
    ),
    [engine],
  );
  const enableHeadphoneMonitoring = useCallback(() => engine.enableHeadphoneMonitoring(), [engine]);
  const disableHeadphoneMonitoring = useCallback(() => engine.disableHeadphoneMonitoring(), [engine]);
  const stopCapture = useCallback(() => engine.stop(), [engine]);

  return {
    ...snapshot,
    startCapture,
    startCaptureWithPitchAdapter,
    enableHeadphoneMonitoring,
    disableHeadphoneMonitoring,
    stopCapture,
  };
}
