import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PlaceLiveCallProgramInput = {
  invitationId: string;
  track: MediaStreamTrack;
  onAir: boolean;
  gain?: number;
  muted?: boolean;
};

type CallProgramGraph = {
  context: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  gains: Map<string, GainNode>;
  outputTrack: MediaStreamTrack;
};

export function callProgramGain(input?: PlaceLiveCallProgramInput) {
  return !input?.onAir || input.muted ? 0 : Math.max(0, Math.min(1, Number.isFinite(input.gain) ? input.gain! : 1));
}

function closeGraph(graph: CallProgramGraph | null) {
  if (!graph) return;
  graph.gains.forEach((gain) => gain.disconnect());
  graph.destination.disconnect();
  graph.outputTrack.stop();
  void graph.context.close().catch(() => undefined);
}

/**
 * Builds one Host-owned program track from private call inputs. The WebAudio
 * graph never owns or stops the remote LiveKit tracks. Each input has its own
 * hard gate, so preview calls remain audible only through their private audio
 * element and cannot leak into the public Room.
 */
export function usePlaceLiveCallProgramMix(inputs: PlaceLiveCallProgramInput[]) {
  const graphRef = useRef<CallProgramGraph | null>(null);
  const inputsRef = useRef(inputs);
  inputsRef.current = inputs;
  const [outputTrack, setOutputTrack] = useState<MediaStreamTrack | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "suspended" | "failed">("idle");
  const topology = useMemo(() => inputs
    .filter((input) => input.track.kind === "audio" && input.track.readyState === "live")
    .map((input) => `${input.invitationId}:${input.track.id}`)
    .sort()
    .join("|"), [inputs]);

  useEffect(() => {
    closeGraph(graphRef.current);
    graphRef.current = null;
    setOutputTrack(null);
    if (!topology) {
      setStatus("idle");
      return undefined;
    }

    try {
      const context = new AudioContext({ latencyHint: "interactive" });
      const destination = context.createMediaStreamDestination();
      const gains = new Map<string, GainNode>();
      for (const input of inputsRef.current) {
        if (input.track.kind !== "audio" || input.track.readyState !== "live") continue;
        const source = context.createMediaStreamSource(new MediaStream([input.track]));
        const gain = context.createGain();
        gain.gain.value = callProgramGain(input);
        source.connect(gain).connect(destination);
        gains.set(input.invitationId, gain);
      }
      const mixedTrack = destination.stream.getAudioTracks()[0] ?? null;
      if (!mixedTrack) throw new Error("Sortie audio d’appel absente.");
      // The public LiveKit service is the only owner of the final media gate.
      mixedTrack.enabled = false;
      const graph = { context, destination, gains, outputTrack: mixedTrack };
      graphRef.current = graph;
      setOutputTrack(mixedTrack);
      setStatus(context.state === "running" ? "ready" : "suspended");
    } catch {
      setStatus("failed");
    }

    return () => {
      const graph = graphRef.current;
      graphRef.current = null;
      setOutputTrack(null);
      closeGraph(graph);
    };
  }, [topology]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const byId = new Map(inputs.map((input) => [input.invitationId, input]));
    graph.gains.forEach((gain, invitationId) => {
      const next = callProgramGain(byId.get(invitationId));
      gain.gain.cancelScheduledValues(graph.context.currentTime);
      gain.gain.setValueAtTime(next, graph.context.currentTime);
    });
  }, [inputs]);

  const resume = useCallback(async () => {
    const graph = graphRef.current;
    if (!graph) return false;
    try {
      if (graph.context.state !== "running") await graph.context.resume();
      const ready = graph.context.state === "running";
      setStatus(ready ? "ready" : "suspended");
      return ready;
    } catch {
      setStatus("failed");
      return false;
    }
  }, []);

  return { outputTrack, status, resume };
}

export default usePlaceLiveCallProgramMix;
