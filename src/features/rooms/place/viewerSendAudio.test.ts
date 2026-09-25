import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VIEWER_LEVELS,
  normalizeViewerLevels,
  ViewerSendAudio,
} from "./viewerSendAudio";
import { callProgramGain } from "./usePlaceLiveCallProgramMix";

class Param {
  value = 0;
  cancelScheduledValues() {}
  setTargetAtTime(value: number) {
    this.value = value;
  }
}
class Node {
  outputs: Node[] = [];
  gain = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  fftSize = 256;
  sample = 0;
  connect(node: Node) {
    this.outputs.push(node);
    return node;
  }
  disconnect() {
    this.outputs = [];
  }
  getFloatTimeDomainData(array: Float32Array) {
    array.fill(this.sample);
  }
}
class Track extends EventTarget {
  kind = "audio";
  readyState = "live";
  enabled = true;
  muted = false;
  stop = vi.fn(() => {
    this.readyState = "ended";
  });
}
function graph() {
  const gains: Node[] = [],
    sources: Node[] = [],
    meters: Node[] = [];
  const output = new Track();
  const speakers = new Node();
  const destination = Object.assign(new Node(), {
    stream: { getAudioTracks: () => [output] },
  });
  const context = {
    state: "running",
    currentTime: 0,
    destination: speakers,
    onstatechange: null,
    createGain: () => {
      const node = new Node();
      gains.push(node);
      return node;
    },
    createAnalyser: () => {
      const node = new Node();
      meters.push(node);
      return node;
    },
    createMediaStreamSource: () => {
      const node = new Node();
      sources.push(node);
      return node;
    },
    createMediaStreamDestination: () => destination,
    createDynamicsCompressor: () => new Node(),
    resume: async () => undefined,
    close: async () => undefined,
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(public tracks: unknown[]) {}
    },
  );
  return { gains, sources, meters, output, speakers, destination, context };
}
afterEach(() => vi.unstubAllGlobals());

describe("personal send routing", () => {
  it("applies separate post-source gains and Master without any speaker/return connection", async () => {
    const g = graph(),
      engine = new ViewerSendAudio();
    await engine.prepare();
    for (const id of ["voice", "music", "system"] as const)
      engine.setInput(id, new Track() as unknown as MediaStreamTrack);
    engine.enableMusic(true);
    const levels = normalizeViewerLevels({
      voice: { gain: 0.4 },
      music: { gain: 0.3 },
      system: { gain: 0.2 },
      master: { gain: 0.8 },
    });
    engine.update(levels);
    expect(g.gains.map((n) => n.gain.value)).toEqual([0.8, 0.4, 0.3, 0.2]);
    // Only the summed send stream is an output; no input can reach local speakers.
    expect(
      [...g.sources, ...g.gains, ...g.meters].some((node) =>
        node.outputs.includes(g.speakers),
      ),
    ).toBe(false);
    expect(g.sources).toHaveLength(3);
    engine.update({ ...levels, music: { ...levels.music, muted: true } });
    expect(g.gains.map((n) => n.gain.value)).toEqual([0.8, 0.4, 0, 0.2]);
    engine.update({ ...levels, master: { ...levels.master, muted: true } });
    expect(g.gains.map((n) => n.gain.value)).toEqual([0, 0.4, 0.3, 0.2]);
    engine.dispose();
  });

  it("keeps a stable Master when the mic disconnects, preserves sources and shows real silence/clipping", async () => {
    const g = graph(),
      engine = new ViewerSendAudio(),
      voice = new Track(),
      music = new Track();
    await engine.prepare();
    const output = engine.track;
    engine.setInput("voice", voice as unknown as MediaStreamTrack);
    engine.setInput("music", music as unknown as MediaStreamTrack);
    engine.enableMusic(true);
    expect(engine.sample()).toEqual({
      voice: 0,
      music: 0,
      system: 0,
      master: 0,
    });
    voice.readyState = "ended";
    voice.dispatchEvent(new Event("ended"));
    expect(engine.inputState("voice")).toBe("unavailable");
    expect(engine.inputState("music")).toBe("active");
    expect(engine.track).toBe(output);
    g.meters[0].sample = 1.2;
    expect(engine.sample().master).toBeGreaterThan(1);
    engine.dispose();
    expect(music.stop).not.toHaveBeenCalled();
    expect(g.output.stop).toHaveBeenCalledOnce();
  });

  it("normalizes stored values without storing media permissions or publication", () => {
    const levels = normalizeViewerLevels({
      voice: { gain: NaN },
      music: { gain: 9 },
      master: { gain: -1, muted: true },
      publishing: true,
    });
    expect(levels.voice).toEqual(DEFAULT_VIEWER_LEVELS.voice);
    expect(levels.music.gain).toBe(1);
    expect(levels.master.gain).toBe(0);
    expect(levels).not.toHaveProperty("publishing");
  });

  it("applies host safety mute/gain only to the participant's combined stream", () => {
    const input = {
      invitationId: "call",
      track: {} as MediaStreamTrack,
      onAir: true,
      gain: 0.3,
    };
    expect(callProgramGain(input)).toBe(0.3);
    expect(callProgramGain({ ...input, muted: true })).toBe(0);
    expect(callProgramGain({ ...input, onAir: false })).toBe(0);
    expect(input.gain).toBe(0.3);
  });
});
