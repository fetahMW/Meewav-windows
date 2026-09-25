import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaceRoomState } from "../place/place.types";
import type { WaveImportRequest } from "../wave-transport/WaveTransportProvider";
import type { WaveLayer, WaveState, WaveSubmission } from "./roomTools.types";
import WaveRoomTransportController from "./WaveRoomTransportController";

const mocks = vi.hoisted(() => ({
  wave: null as WaveState | null,
  setWave: vi.fn(), setGrid: vi.fn(), setLayerGain: vi.fn(), setReferenceMix: vi.fn(), syncLayers: vi.fn().mockResolvedValue(undefined),
  getSnapshot: vi.fn(() => ({ grid: { bpm: 120, beatsPerBar: 4, origin: 0 }, candidate: null })),
  select: vi.fn(), registerImportHandler: vi.fn<(handler: (request: WaveImportRequest) => Promise<void>) => () => void>(() => vi.fn()), execute: vi.fn(),
}));
vi.mock("../wave-transport/WaveTransportProvider", () => ({
  submissionAsset: (submission: WaveSubmission) => ({
    id: submission.id, title: submission.title, url: submission.mediaUrl, bpm: submission.bpm, bars: submission.bars, version: submission.version,
  }),
  useWaveTransport: () => ({
    setWave: mocks.setWave, select: mocks.select, registerImportHandler: mocks.registerImportHandler,
    engine: {
      setGrid: mocks.setGrid, getSnapshot: mocks.getSnapshot, setLayerGain: mocks.setLayerGain,
      setReferenceMix: mocks.setReferenceMix, syncLayers: mocks.syncLayers,
    },
  }),
}));
vi.mock("./useRoomTools", () => ({ useRoomTools: () => ({ state: mocks.wave ? { wave: mocks.wave } : null, execute: mocks.execute }) }));
vi.mock("./audience/waveAudienceUpload.service", () => ({
  uploadWaveAudienceFile: vi.fn(), validateWaveAudienceFile: vi.fn(() => "audio/wav"),
}));

const contribution = (id: string): WaveSubmission => ({
  id, title: id, instrument: id, category: "drums", bpm: 120, bars: 4, key: "Am", durationSeconds: 8,
  mediaUrl: `/${id}.wav`, status: "accepted", lifecycleStatus: "ACCEPTED", rightsConfirmed: true,
  version: 1, privateNotes: "", creditPublic: true, versions: [],
  contributor: { id: `artist-${id}`, name: id, avatarUrl: "", role: "Musicien", microphone: "ready", camera: "ready" },
});
const bass = contribution("bass");
const drums = contribution("drums");
const layer = (id: string, patch: Partial<WaveLayer> = {}): WaveLayer => ({
  id: `layer-${id}`, submissionId: id, submissionVersion: 1, title: id, author: id,
  active: true, solo: false, muted: false, gain: .7, ...patch,
});
const makeWave = (layers: WaveLayer[]): WaveState => ({
  title: "Wave", baseLoop: { title: "Base", bars: 4, bpm: 120, key: "Am", kind: "Beat", mediaUrl: "/base.wav" },
  submissions: [bass, drums], activeSubmissionId: null, layers, playing: false, looping: true, history: [],
});
const base = (patch: Partial<WaveLayer> = {}): WaveLayer => ({
  id: "base", title: "Base", author: "Host", active: true, solo: false, muted: false, gain: .82, ...patch,
});
const room = {
  id: "wave-room", source: "demo",
  host: { id: "host", displayName: "Host", handle: "@host", avatarUrl: "", role: "Beatmaker" },
} as unknown as PlaceRoomState;

beforeEach(() => vi.clearAllMocks());
afterEach(() => { cleanup(); mocks.wave = null; });

describe("WaveRoomTransportController · mute et solo réels", () => {
  it("conserve le type choisi pour une nouvelle boucle de base", async () => {
    mocks.wave = makeWave([base()]);
    render(<WaveRoomTransportController room={room} />);
    await waitFor(() => expect(mocks.registerImportHandler).toHaveBeenCalled());
    const handler = mocks.registerImportHandler.mock.calls[0][0];
    await handler({ destination: "base", category: "drums", audio: {
      id: "new-base", title: "New drums", src: "blob:new-base", durationSeconds: 8,
      file: new File(["audio"], "drums.wav", { type: "audio/wav" }),
    } });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "wave.base.replace", baseLoop: expect.objectContaining({ title: "New drums", kind: "Drums" }),
    }));
  });
  it("envoie un gain audible nul au moteur lorsque toutes les couches sont mutées", async () => {
    mocks.wave = makeWave([base({ muted: true }), layer("bass", { muted: true }), layer("drums", { muted: true })]);
    render(<WaveRoomTransportController room={room} />);
    await waitFor(() => expect(mocks.syncLayers).toHaveBeenCalled());
    expect(mocks.setLayerGain).toHaveBeenCalledWith("base", .82);
    expect(mocks.setReferenceMix).toHaveBeenLastCalledWith(false, true);
    expect(mocks.syncLayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset: expect.objectContaining({ id: "bass" }), gain: .7, audible: false }),
      expect.objectContaining({ asset: expect.objectContaining({ id: "drums" }), gain: .7, audible: false }),
    ]);
  });

  it("un solo coupe strictement la base et conserve toutes les contributions solo non mutées", async () => {
    mocks.wave = makeWave([
      base(), layer("bass", { solo: true, gain: .6 }), layer("drums", { solo: false, gain: .4 }),
    ]);
    const view = render(<WaveRoomTransportController room={room} />);
    await waitFor(() => expect(mocks.syncLayers).toHaveBeenCalled());
    expect(mocks.setReferenceMix).toHaveBeenLastCalledWith(false, false);
    expect(mocks.syncLayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset: expect.objectContaining({ id: "bass" }), gain: .6, audible: true }),
      expect.objectContaining({ asset: expect.objectContaining({ id: "drums" }), gain: .4, audible: false }),
    ]);

    mocks.wave = makeWave([
      base(), layer("bass", { solo: true }), layer("drums", { solo: true, muted: true }),
    ]);
    view.rerender(<WaveRoomTransportController room={room} />);
    await waitFor(() => expect(mocks.syncLayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset: expect.objectContaining({ id: "bass" }), audible: true }),
      expect.objectContaining({ asset: expect.objectContaining({ id: "drums" }), audible: false }),
    ]));
    expect(mocks.setReferenceMix).toHaveBeenLastCalledWith(false, false);
  });

  it("solo sur la base isole la base et coupe toutes les contributions", async () => {
    mocks.wave = makeWave([base({ solo: true }), layer("bass"), layer("drums")]);
    render(<WaveRoomTransportController room={room} />);
    await waitFor(() => expect(mocks.syncLayers).toHaveBeenCalled());
    expect(mocks.setReferenceMix).toHaveBeenLastCalledWith(true, false);
    expect(mocks.syncLayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ asset: expect.objectContaining({ id: "bass" }), audible: false }),
      expect.objectContaining({ asset: expect.objectContaining({ id: "drums" }), audible: false }),
    ]);
  });
});
