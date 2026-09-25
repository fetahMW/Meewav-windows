import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_VIEWER_LEVELS,
  normalizeViewerLevels,
  ViewerSendAudio,
  type ViewerFader,
  type ViewerLevels,
} from "./viewerSendAudio";
import {
  canCaptureViewerSystemAudio,
  captureViewerSystemAudio,
  isSafeViewerCapture,
  markMeeWavCaptureSurface,
} from "./viewerSystemCapture";
import type { PlaceMixerProgramAudioTransport } from "./PlaceMixerAudioPlayer";

export function useViewerSendMixer(
  accountId: string | undefined,
  enabled: boolean,
) {
  const storageKey = `meewav:viewer-send:v1:${accountId ?? "anonymous"}`;
  const [engine] = useState(() => new ViewerSendAudio());
  const [levels, setLevels] = useState<ViewerLevels>(() => {
    try {
      return normalizeViewerLevels(
        JSON.parse(localStorage.getItem(storageKey) ?? "null"),
      );
    } catch {
      return structuredClone(DEFAULT_VIEWER_LEVELS);
    }
  });
  const levelsScope = useRef(storageKey);
  const [revision, refresh] = useState(0);
  const [meters, setMeters] = useState({
    voice: 0,
    music: 0,
    system: 0,
    master: 0,
  });
  const [error, setError] = useState("");
  const [systemState, setSystemState] = useState("unavailable");
  const [musicGeneration, setMusicGeneration] = useState<string | null>(null);
  const [musicAudible, setMusicAudible] = useState(false);
  const capture = useRef<MediaStream | null>(null),
    captureGeneration = useRef(0);
  const [systemAvailable] = useState(canCaptureViewerSystemAudio);
  useEffect(() => {
    markMeeWavCaptureSurface();
  }, []);
  useEffect(() => {
    engine.onChange = () => refresh((value) => value + 1);
    return () => {
      ++captureGeneration.current;
      capture.current?.getTracks().forEach((track) => track.stop());
      engine.onChange = () => undefined;
      engine.dispose();
    };
  }, [engine]);
  useEffect(() => {
    if (levelsScope.current !== storageKey) {
      levelsScope.current = storageKey;
      try {
        setLevels(
          normalizeViewerLevels(
            JSON.parse(localStorage.getItem(storageKey) ?? "null"),
          ),
        );
      } catch {
        setLevels(normalizeViewerLevels(null));
      }
      return;
    }
    engine.update(levels);
    try {
      localStorage.setItem(storageKey, JSON.stringify(levels));
    } catch {
      /* Local storage can be disabled. */
    }
  }, [engine, levels, storageKey]);
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => setMeters(engine.sample()), 80);
    return () => clearInterval(timer);
  }, [enabled, engine]);
  const setGain = useCallback(
    (id: ViewerFader, gain: number) =>
      setLevels((old) =>
        normalizeViewerLevels({ ...old, [id]: { ...old[id], gain } }),
      ),
    [],
  );
  const toggleMute = useCallback(
    (id: ViewerFader) =>
      setLevels((old) => ({
        ...old,
        [id]: { ...old[id], muted: !old[id].muted },
      })),
    [],
  );
  const stopSystem = useCallback(() => {
    ++captureGeneration.current;
    const previous = capture.current;
    capture.current = null;
    engine.setInput("system", null);
    previous?.getTracks().forEach((track) => track.stop());
    setSystemState("disconnected");
  }, [engine]);
  const configureSystem = useCallback(async () => {
    const generation = ++captureGeneration.current;
    setError("");
    setSystemState("reconnecting");
    try {
      const stream = await captureViewerSystemAudio();
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      try {
        await engine.prepare();
      } catch (reason) {
        stream.getTracks().forEach((track) => track.stop());
        throw reason;
      }
      if (generation !== captureGeneration.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      capture.current?.getTracks().forEach((track) => track.stop());
      capture.current = stream;
      engine.setInput("system", stream.getAudioTracks()[0]);
      setSystemState("active");
      const ended = () => {
        if (capture.current === stream) stopSystem();
      };
      stream
        .getTracks()
        .forEach((track) =>
          track.addEventListener("ended", ended, { once: true }),
        );
      stream
        .getVideoTracks()[0]
        ?.addEventListener("capturehandlechange", () => {
          if (capture.current === stream && !isSafeViewerCapture(stream)) {
            stopSystem();
            setError(
              "Capture MeeWav interrompue pour éviter une boucle audio.",
            );
          }
        });
    } catch (reason) {
      if (generation !== captureGeneration.current) return;
      setSystemState(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "permission-denied"
          : "unavailable",
      );
      setError(
        reason instanceof DOMException && reason.name === "NotAllowedError"
          ? "Autorisation de capture refusée. Réessayez avec Configurer le son du PC."
          : reason instanceof Error
            ? reason.message
            : "Capture indisponible.",
      );
    }
  }, [engine, stopSystem]);
  const musicTransport = useMemo<PlaceMixerProgramAudioTransport>(
    () => ({
      status: "connected",
      musicAudible,
      musicGeneration,
      prepareMusicTrack: async (track, generation) => {
        if (track.kind !== "audio" || track.readyState !== "live") return false;
        await engine.prepare();
        engine.setInput("music", track);
        setMusicGeneration(generation);
        return true;
      },
      setMusicEnabled: async (value) => {
        engine.enableMusic(value);
        setMusicAudible(value);
        return true;
      },
      releaseMusicTrack: async () => {
        engine.enableMusic(false);
        engine.setInput("music", null);
        setMusicAudible(false);
        setMusicGeneration(null);
      },
    }),
    [engine, musicAudible, musicGeneration],
  );
  return {
    engine,
    levels,
    meters,
    error,
    setError,
    setGain,
    toggleMute,
    systemAvailable,
    systemState,
    configureSystem,
    stopSystem,
    musicTransport,
    outputTrack: engine.track,
    revision,
  };
}
export type ViewerMixerValue = ReturnType<typeof useViewerSendMixer> & {
  prepareVoice: () => Promise<MediaStreamTrack | null>;
  voiceStatus: string;
  publication: string;
};
export const ViewerMixerContext = createContext<ViewerMixerValue | null>(null);
export const useViewerMixer = () => useContext(ViewerMixerContext);
