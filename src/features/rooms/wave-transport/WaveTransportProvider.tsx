import MeewavSelect from "../../../components/shared/MeewavSelect";
/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { signedWaveAudienceUrl } from "../tools/audience/waveAudienceUpload.service";
import type { WaveLoopCategory, WaveState, WaveSubmission } from "../tools/roomTools.types";
import { WaveAudioTransport, type WaveAudioAsset } from "./WaveAudioTransport";
import "./wave-transport.css";

export const submissionAsset = (submission: WaveSubmission): WaveAudioAsset => ({
  id: submission.id, title: `${submission.contributor.name} · ${submission.instrument}`, url: submission.mediaUrl,
  path: submission.mediaPath, bpm: submission.bpm, bars: submission.bars, version: submission.version,
});
type PlaybackControls = { play: () => Promise<void>; pause: () => void };
export type WaveImportedAudio = {
  id: string; title: string; src: string; file: File; durationSeconds: number;
};
export type WaveImportDestination = "base" | "vote";
export type WaveImportRequest = {
  audio: WaveImportedAudio; destination: WaveImportDestination; category: WaveLoopCategory;
};
type WaveImportHandler = (request: WaveImportRequest) => Promise<void>;
type Context = {
  engine: WaveAudioTransport; toolsVisible: boolean;
  nav: HTMLDivElement | null; body: HTMLDivElement | null;
  setNav: (node: HTMLDivElement | null) => void; setBody: (node: HTMLDivElement | null) => void;
  wave: WaveState | null; setWave: (wave: WaveState) => void;
  queue: WaveSubmission[]; setQueue: (queue: WaveSubmission[]) => void;
  context: string; setContext: (context: string) => void;
  select: (submission: WaveSubmission | null) => Promise<void>; adjacent: (direction: number) => void;
  quickPreview: (submission: WaveSubmission) => void; stopQuickPreview: () => void;
  registerPlaybackControls: (controls: PlaybackControls) => () => void;
  registerImportHandler: (handler: WaveImportHandler) => () => void;
  hasImportHandler: () => boolean; commitImport: (request: WaveImportRequest) => Promise<void>;
  play: () => void; pause: () => void;
};
const WaveTransportContext = createContext<Context | null>(null);
export function WaveTransportProvider({ children, toolsVisible }: { children: ReactNode; toolsVisible: boolean }) {
  const [engine] = useState(() => new WaveAudioTransport(async (asset) => asset.url || (asset.path ? await signedWaveAudienceUrl(asset.path) : "")));
  const [nav, setNav] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [wave, setWave] = useState<WaveState | null>(null);
  const [queue, setQueue] = useState<WaveSubmission[]>([]);
  const [context, setContext] = useState("wave-gate");
  const playbackControls = useRef<PlaybackControls | null>(null);
  const importHandler = useRef<WaveImportHandler | null>(null);
  const registerPlaybackControls = useCallback((controls: PlaybackControls) => {
    playbackControls.current = controls;
    return () => { if (playbackControls.current === controls) playbackControls.current = null; };
  }, []);
  const registerImportHandler = useCallback((handler: WaveImportHandler) => {
    importHandler.current = handler;
    return () => { if (importHandler.current === handler) importHandler.current = null; };
  }, []);
  useEffect(() => () => engine.dispose(), [engine]);
  useEffect(() => {
    // The Beat module owns its mix through Mute/Solo. Everywhere else the
    // first host-facing audition is BASE: candidate + reference only.
    if (context === "wave-orchestra") engine.setMode("beat");
    else if (engine.getSnapshot().mode === "beat") engine.setMode("base");
  }, [context, engine]);
  const value = useMemo<Context>(() => {
    const loadCandidate = (submission: WaveSubmission | null) => {
      const loading = engine.select(submission ? submissionAsset(submission) : null);
      const index = queue.findIndex((item) => item.id === submission?.id);
      if (queue[index + 1]) engine.preload(submissionAsset(queue[index + 1]));
      return loading;
    };
    const pause = () => {
      playbackControls.current?.pause();
      // Also works while the player controls are mounting or an async start is pending.
      if (engine.getSnapshot().playing || engine.getSnapshot().quickPreview) engine.pause();
    };
    const select = (submission: WaveSubmission | null) => {
      // A card selection always belongs to the durable BASE/BOUCLE/MIX
      // audition. Leave a possible one-shot preview before decoding so the
      // engine schedules the replacement on the shared musical clock.
      engine.setQuickPreview(false);
      return loadCandidate(submission);
    };
    return { engine, nav, body, setNav, setBody, toolsVisible, wave, setWave, queue, setQueue, context, setContext, select,
      registerPlaybackControls, registerImportHandler,
      hasImportHandler: () => Boolean(importHandler.current),
      commitImport: async (request) => {
        const handler = importHandler.current;
        if (!handler) throw new Error("La régie Wave n’est pas prête à classer cet import.");
        await handler(request);
      },
      play: () => { void playbackControls.current?.play(); },
      pause,
      quickPreview: (submission) => {
        const state = engine.getSnapshot();
        // A second click also cancels a pending decode/device start, before sound begins.
        if (state.quickPreview && state.candidate?.id === submission.id) { pause(); return; }
        const loading = loadCandidate(submission);
        engine.setQuickPreview(true);
        void loading.then(() => {
          const ready = engine.getSnapshot();
          // Ignore an audition canceled or replaced while its WAV was decoding.
          if (!ready.quickPreview || ready.candidate?.id !== submission.id || ready.loading || ready.error || ready.playing) return;
          void playbackControls.current?.play();
        });
      },
      stopQuickPreview: () => { if (engine.getSnapshot().quickPreview) pause(); },
      adjacent: (direction) => {
        const index = queue.findIndex((item) => item.id === engine.getSnapshot().candidate?.id);
        const next = queue[index + direction];
        if (next) select(next);
      },
    };
  }, [body, context, engine, nav, queue, registerImportHandler, registerPlaybackControls, toolsVisible, wave]);
  return <WaveTransportContext.Provider value={value}>{children}</WaveTransportContext.Provider>;
}
export const useWaveTransport = () => useContext(WaveTransportContext);
const noSubscribe = () => () => undefined;
const emptySnapshot = () => null;
export function useWaveTransportState() {
  const transport = useWaveTransport();
  return useSyncExternalStore(transport?.engine.subscribe ?? noSubscribe, transport?.engine.getSnapshot ?? emptySnapshot, emptySnapshot);
}

export function WaveAuditionControls() {
  const transport = useWaveTransport(); const state = useWaveTransportState();
  if (!transport || !state) return null;
  return <fieldset className="wave-audition-settings">
    <legend>Audition privée · Wave</legend>
    <label>BPM<input aria-label="BPM de la Wave" type="number" min={40} max={260} value={state.grid.bpm || ""}
      onChange={(event) => transport.engine.setGrid({ ...state.grid, bpm: Number(event.target.value) })} /></label>
    <label>Temps / mesure<MeewavSelect value={state.grid.beatsPerBar} onChange={(event) => transport.engine.setGrid({ ...state.grid, beatsPerBar: Number(event.target.value) })}>
      {[3, 4, 6].map((beats) => <option key={beats} value={beats}>{beats}/4</option>)}</MeewavSelect></label>
    <label>Premier temps (s)<input type="number" min={0} step={.01} value={state.grid.origin}
      onChange={(event) => transport.engine.setGrid({ ...state.grid, origin: Number(event.target.value) })} /></label>
    {state.candidate ? <>
      <strong>{state.candidate.title}</strong>
      <small>{state.candidate.bpm} BPM · {state.candidate.bars} mesures · jamais diffusée au public depuis le Sas</small>
      <label>Niveau de l’audition<input aria-label="Gain de l’audition privée" type="range" min={0} max={1} step={.01} value={state.gain} onChange={(event) => transport.engine.setGain(Number(event.target.value))} /></label>
      <label>Décalage (s)<input type="number" step={.01} value={state.offset} onChange={(event) => transport.engine.setOffset(Number(event.target.value))} /></label>
      <button type="button" onClick={() => transport.engine.setOffset(0)}>Réinitialiser le calage</button>
    </> : null}
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.notice ? <p role="status">{state.notice}</p> : null}
  </fieldset>;
}
