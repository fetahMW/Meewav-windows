import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../tools/roomTools.fixtures";
import { WaveTransportProvider, useWaveTransport } from "../wave-transport/WaveTransportProvider";
import WaveEmptyPanel from "../tools/panels/WaveEmptyPanel";
import PlaceMixerAudioPlayer, { type PlaceMixerProgramAudioTransport } from "./PlaceMixerAudioPlayer";
import { placeRoomTime } from "./placeRoomTime";

const runtime = vi.hoisted(() => ({ isDesktop: false }));
vi.mock("../../../runtime/RuntimeProvider", () => ({ useRuntime: () => runtime }));

vi.mock("../tools/audio/previewWaveform", async (importOriginal) => ({
  ...await importOriginal<typeof import("../tools/audio/previewWaveform")>(),
  decodeAudioWaveform: vi.fn(async () => ({ peaks: Array.from({ length: 120 }, () => ({ min: -.2, max: .2 })) })),
}));
vi.mock("../../profile/profile.media.service", () => ({
  profileMediaRepository: { listOwnerMedia: vi.fn(async () => []) },
}));

class MockParam {
  value = 1;
  cancelScheduledValues = vi.fn();
  linearRampToValueAtTime = vi.fn();
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
}
class MockAudioNode {
  gain = new MockParam();
  playbackRate = new MockParam();
  buffer?: AudioBuffer;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  onended?: () => void;
}
function silentBuffer(duration: number) {
  const samples = new Float32Array(duration * 100);
  return { duration, length: samples.length, sampleRate: 100, numberOfChannels: 1,
    getChannelData: () => samples, copyToChannel: vi.fn() } as unknown as AudioBuffer;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const settle = async () => { for (let turn = 0; turn < 30; turn++) await Promise.resolve(); };

let transport: NonNullable<ReturnType<typeof useWaveTransport>>;
function CaptureTransport() {
  const current = useWaveTransport()!;
  useEffect(() => {
    transport = current;
    current.engine.setGrid({ bpm: 120, beatsPerBar: 4, origin: 0 });
  }, [current]);
  return null;
}
function RegisterWaveImport({ handler }: { handler: Parameters<NonNullable<ReturnType<typeof useWaveTransport>>["registerImportHandler"]>[0] }) {
  const current = useWaveTransport()!;
  useEffect(() => current.registerImportHandler(handler), [current, handler]);
  return null;
}
function SetWaveToolContext({ value }: { value: string }) {
  const current = useWaveTransport()!;
  useEffect(() => { current.setContext(value); }, [current, value]);
  return null;
}
function renderPlayer(initialMusicGain = 1, initialMasterGain = 1, programAudio?: PlaceMixerProgramAudioTransport, extra?: ReactNode) {
  const callbacks = { onPreviewPrepare: vi.fn(async () => true), onPreviewMetadata: vi.fn(async () => true),
    onRouteChange: vi.fn(async () => true), onPlaybackStateChange: vi.fn(async () => true) };
  const player = (musicGain: number, masterGain: number) => <WaveTransportProvider toolsVisible={false}>
    <CaptureTransport />
    <div className="place-studio-panel"><div className="place-mixer">
      <PlaceMixerAudioPlayer roomId="wave-import-test" ownerId={null} queueParticipants={[]}
        musicGain={musicGain} masterGain={masterGain} publicMusicMuted={false} programAudio={programAudio} {...callbacks} />
    </div></div>
    {extra}
  </WaveTransportProvider>;
  const view = render(player(initialMusicGain, initialMasterGain));
  return { ...callbacks, rerenderGains: (musicGain: number, masterGain: number) => view.rerender(player(musicGain, masterGain)) };
}
async function importTrack(name: string | string[]) {
  const files = (Array.isArray(name) ? name : [name]).map(filename => {
    const file = new File(["silent mocked audio"], filename, { type: "audio/wav" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
    return file;
  });
  await act(async () => {
    fireEvent.change(document.querySelector<HTMLInputElement>(".place-mixer-audio__file")!, { target: { files } });
    await settle();
  });
}
const candidate = {
  ...createRoomToolsFixture("wave").wave!.submissions[0],
  id: "audition-candidate", title: "Drums test", mediaUrl: "/candidate.wav", bpm: 120, bars: 4 as const, durationSeconds: 8,
};

let sources: MockAudioNode[];
let gains: MockAudioNode[];
let mediaDestination!: MockAudioNode & { stream: { getAudioTracks: () => object[] } };
let oldBuffer: AudioBuffer;
let importedBuffer: AudioBuffer;
let candidateBuffer: AudioBuffer;
let holdImport: boolean;
let importResponse: ReturnType<typeof deferred<Response>>;
let context: {
  currentTime: number; state: string; destination: MockAudioNode;
  resume: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>;
  createGain: () => MockAudioNode; createBufferSource: () => MockAudioNode;
  createMediaStreamDestination: () => MockAudioNode & { stream: { getAudioTracks: () => object[] } };
  createAnalyser: () => MockAudioNode;
  createMediaElementSource: () => MockAudioNode;
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer;
  decodeAudioData: ReturnType<typeof vi.fn>;
};
const response = (marker: number) => ({ ok: true, arrayBuffer: async () => new Uint8Array([marker]).buffer }) as Response;
beforeEach(() => {
  runtime.isDesktop = false;
  sources = [];
  gains = [];
  oldBuffer = silentBuffer(120);
  importedBuffer = silentBuffer(180);
  candidateBuffer = silentBuffer(8);
  holdImport = false;
  importResponse = deferred<Response>();
  const publicTrack = { kind: "audio", stop: vi.fn() };
  context = {
    currentTime: 0, state: "running", destination: new MockAudioNode(),
    resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createAnalyser: () => Object.assign(new MockAudioNode(), { fftSize: 256, getFloatTimeDomainData: vi.fn() }),
    createMediaElementSource: () => new MockAudioNode(),
    createGain: () => { const gain = new MockAudioNode(); gains.push(gain); return gain; },
    createBufferSource: () => { const source = new MockAudioNode(); sources.push(source); return source; },
    createMediaStreamDestination: () => (mediaDestination = Object.assign(new MockAudioNode(), { stream: { getAudioTracks: () => [publicTrack] } })),
    createBuffer: (_channels, length, sampleRate) => silentBuffer(length / sampleRate),
    decodeAudioData: vi.fn(async (bytes: ArrayBuffer) => [oldBuffer, importedBuffer, candidateBuffer][new Uint8Array(bytes)[0]]),
  };
  vi.stubGlobal("AudioContext", vi.fn(function () { return context; }));
  // No URL reaches the network, and neither HTML media nor Web Audio can emit sound.
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url === "/candidate.wav") return response(2);
    if (url === "blob:Old.wav" || url === "blob:Third.wav") return response(0);
    if (url === "blob:Imported.wav") return holdImport ? importResponse.promise : response(1);
    throw new Error(`Unexpected mock audio URL: ${url}`);
  }));
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn((file: File) => `blob:${file.name}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  placeRoomTime.setEnabled(false);
  placeRoomTime.reset();
});
afterEach(() => {
  cleanup();
  placeRoomTime.setEnabled(false);
  placeRoomTime.reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function expectBaseAudition(referenceSource: MockAudioNode, candidateSource: MockAudioNode) {
  const referenceGain = referenceSource.connect.mock.calls[0][0] as MockAudioNode;
  const beatOutput = referenceGain.connect.mock.calls[0][0] as MockAudioNode;
  const beatPreview = beatOutput.connect.mock.calls[0][0] as MockAudioNode;
  const candidateGain = candidateSource.connect.mock.calls[0][0] as MockAudioNode;
  const candidatePrivateBus = candidateGain.connect.mock.calls[0][0] as MockAudioNode;
  expect(beatPreview.gain.value).toBe(1);
  expect(candidatePrivateBus.gain.value).toBe(.75);
}

describe("Wave · import et contrôle du Beat dans le lecteur", () => {
  const chooseDestination = (label: string) => {
    fireEvent.click(screen.getByRole("button", { name: "Importer un son" }));
    const modal = screen.getByRole("dialog", { name: "Importer dans la Wave" });
    expect(screen.queryByRole("menuitem", { name: /Depuis mon appareil/ })).not.toBeInTheDocument();
    fireEvent.click(within(modal).getByRole("button", { name: new RegExp(label) }));
    expect(screen.getByRole("menuitem", { name: /Depuis mon appareil/ })).toBeInTheDocument();
  };
  const confirmBase = async (name: string) => {
    chooseDestination("Boucle de base");
    await importTrack(name);
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
  };

  it("propose les trois destinations avant la source et permet d’annuler", () => {
    const handler = vi.fn();
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    fireEvent.click(screen.getByRole("button", { name: "Importer un son" }));
    const modal = screen.getByRole("dialog", { name: "Importer dans la Wave" });
    for (const name of [/Boucle de base/, /Boucle de vote/, /Dans le lecteur/]) expect(within(modal).getByRole("button", { name })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(["Boucle de base", "Boucle de vote", "Dans le lecteur"])("garde le même conteneur dans la console pour %s", (choice) => {
    renderPlayer();
    fireEvent.click(screen.getByRole("button", { name: "Importer un son" }));
    const container = screen.getByRole("dialog", { name: "Importer dans la Wave" });
    const player = screen.getByRole("region", { name: "Lecteur audio du Mixeur" });
    const consolePanel = document.querySelector<HTMLElement>(".place-studio-panel")!;
    expect(consolePanel).toContainElement(container);
    expect(player).not.toContainElement(container);
    fireEvent.click(within(container).getByRole("button", { name: new RegExp(choice) }));
    expect(screen.getByRole("menu", { name: "Choisir la source" })).toBe(container);
    expect(consolePanel).toContainElement(container);
    expect(within(container).getByRole("menuitem", { name: "Depuis mon appareil" })).toBeVisible();
    fireEvent.click(within(container).getByRole("menuitem", { name: "Changer de destination" }));
    expect(screen.getByRole("dialog", { name: "Importer dans la Wave" })).toBe(container);
    expect(consolePanel).toContainElement(container);
  });

  it("conserve deux bases, isole les prods et réactive une base sans doublon", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await confirmBase("Old.wav");
    await confirmBase("Imported.wav");
    const reference = transport.engine.getSnapshot().referenceId;
    chooseDestination("Dans le lecteur");
    await importTrack("Third.wav");
    expect(handler).toHaveBeenCalledTimes(2);
    expect(transport.engine.getSnapshot().referenceId).toBe(reference);
    expect(screen.getByRole("slider", { name: "Progression de Third" })).toBeVisible();
    expect(screen.queryByRole("radio", { name: "BASE" })).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
    expect(transport.engine.getSnapshot().playing).toBe(false);
    act(() => { window.dispatchEvent(new Event("meewav:mixer-playlist-open")); });
    const bases = screen.getByRole("region", { name: "Boucles de base" });
    expect(within(bases).getAllByRole("article")).toHaveLength(2);
    expect(within(bases).getByRole("button", { name: "Supprimer Imported" })).toBeDisabled();
    expect(screen.getByRole("region", { name: "Dans le lecteur" })).toHaveTextContent("Third");
    await act(async () => { fireEvent.click(within(bases).getByRole("button", { name: "Lire Old" })); await settle(); });
    expect(screen.getByRole("radio", { name: "DRUMS" })).toHaveAttribute("aria-checked", "true");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler.mock.calls[2][0].audio.id).toBe(handler.mock.calls[0][0].audio.id);
    expect(transport.engine.getSnapshot().referenceId).toBe(handler.mock.calls[0][0].audio.id);
    act(() => { window.dispatchEvent(new Event("meewav:mixer-playlist-open")); });
    expect(within(screen.getByRole("region", { name: "Boucles de base" })).getAllByRole("article")).toHaveLength(2);
  });

  it("route le choix Vote effectué avant la sélection du fichier vers le sas", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    chooseDestination("Boucle de vote");
    await importTrack("Imported.wav");
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ destination: "vote", category: "drums" }));
    expect(screen.getByText("Aucun son chargé")).toBeVisible();
  });

  it("affiche les groupes dans le rail dépliable Windows et repasse du lecteur au solo du sas", async () => {
    runtime.isDesktop = true;
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await confirmBase("Old.wav");
    chooseDestination("Dans le lecteur");
    await importTrack(["Imported.wav", "Third.wav"]);
    fireEvent.click(screen.getByRole("button", { name: "Afficher les pistes" }));
    expect(within(screen.getByRole("region", { name: "Dans le lecteur" })).getAllByRole("article")).toHaveLength(2);
    expect(within(screen.getByRole("region", { name: "Boucles de base" })).getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /Ajouter des sons/ }));
    expect(screen.getByRole("dialog", { name: "Importer dans la Wave" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => { transport.quickPreview(candidate); await settle(); });
    await act(async () => { await settle(); });
    expect(transport.engine.getSnapshot()).toMatchObject({ playing: true, quickPreview: true, candidate: { id: candidate.id } });
    expect(screen.getByRole("slider", { name: "Progression de Old" })).toBeVisible();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each(["Depuis ma médiathèque", "Depuis mes setlists"])("respecte la destination Vote %s", async (source) => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    chooseDestination("Boucle de vote");
    fireEvent.click(screen.getByRole("menuitem", { name: source }));
    if (source === "Depuis mes setlists") {
      fireEvent.click(document.querySelector<HTMLButtonElement>(".place-mixer-audio-library-modal__choice")!);
      expect(handler).not.toHaveBeenCalled();
    }
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, blob: async () => new Blob(["audio"], { type: "audio/mpeg" }) } as Response);
    await act(async () => { fireEvent.click(document.querySelector<HTMLButtonElement>(".place-mixer-audio-library-modal__choice")!); await settle(); });
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ destination: "vote", audio: expect.objectContaining({ file: expect.any(File) }) }));
    expect(screen.getByText("Aucun son chargé")).toBeVisible();
  });

  it("masque le sélecteur BASE / BOUCLE / MIX dans le module Beat", () => {
    renderPlayer(1, 1, undefined, <SetWaveToolContext value="wave-orchestra" />);
    expect(screen.queryByRole("radio", { name: "BASE" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "BOUCLE" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "MIX" })).not.toBeInTheDocument();
  });

  it("demande si l’import remplace la base ou part directement dans Vote", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await importTrack("Imported.wav");

    const dialog = screen.getByRole("dialog", { name: "Comment intégrer ce son ?" });
    expect(screen.queryByRole("slider", { name: "Progression de Imported" })).not.toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Valider l’import" });
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("button", { name: /Boucle de vote/ }));
    expect(dialog).toBeInTheDocument();
    expect(handler).not.toHaveBeenCalled();
    expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("radio", { name: "DRUMS" }));
    expect(handler).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(confirm);
      await settle();
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      destination: "vote",
      category: "drums",
      audio: expect.objectContaining({ title: "Imported", src: "blob:Imported.wav" }),
    }));
    expect(screen.queryByRole("dialog", { name: "Comment intégrer ce son ?" })).not.toBeInTheDocument();
    expect(screen.getByText("Aucun son chargé")).toBeVisible();
  });

  it("charge dans le lecteur uniquement l’import explicitement classé comme nouvelle base", async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await importTrack("Imported.wav");
    fireEvent.click(screen.getByRole("button", { name: /Nouvelle boucle de base/ }));
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    expect(handler).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Valider l’import" }));
      await settle();
    });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ destination: "base" }));
    expect(screen.getByRole("slider", { name: "Progression de Imported" })).toHaveValue("0");
    expect(screen.queryByText("Prêt pour la préécoute et la diffusion")).not.toBeInTheDocument();
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: false, position: 0 });
  });

  it("garde les choix après un échec et attend une nouvelle validation", async () => {
    const handler = vi.fn().mockRejectedValueOnce(new Error("wave_import_duration_off_grid")).mockResolvedValue(undefined);
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await importTrack("Imported.wav");
    fireEvent.click(screen.getByRole("button", { name: /Boucle de vote/ }));
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
    expect(screen.getByRole("alert")).toHaveTextContent("La durée ne tombe pas exactement");
    expect(screen.getByRole("radio", { name: "DRUMS" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("dialog", { name: "Comment intégrer ce son ?" })).toHaveTextContent("Boucle de vote");
    expect(handler).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Valider l’import" })); await settle(); });
    expect(handler).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "Comment intégrer ce son ?" })).not.toBeInTheDocument();
  });

  it("permet d’annuler les choix sans importer le son", async () => {
    const handler = vi.fn();
    renderPlayer(1, 1, undefined, <RegisterWaveImport handler={handler} />);
    await importTrack("Imported.wav");
    fireEvent.click(screen.getByRole("button", { name: /Boucle de vote/ }));
    fireEvent.click(screen.getByRole("radio", { name: "DRUMS" }));
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(handler).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: "Comment intégrer ce son ?" })).not.toBeInTheDocument();
  });

  it("réserve Play au lecteur global, qui lance le MIX de la piste sélectionnée avec le Beat", async () => {
    const wave = createRoomToolsFixture("wave").wave!;
    wave.submissions = [candidate];
    wave.layers = [
      { id: "base", title: wave.baseLoop.title, author: "Puff", active: true, solo: false, muted: false },
      { id: "candidate-layer", submissionId: candidate.id, title: candidate.title, author: candidate.contributor.name, active: true, solo: false, muted: false },
    ];
    renderPlayer(1, 1, undefined, <WaveEmptyPanel label="Beat" wave={wave} hostName="Puff" />);
    await importTrack("Imported.wav");

    await act(async () => {
      const card = screen.getByRole("article", { name: `Sélectionner ${candidate.title}` });
      expect(within(card).queryByRole("button", { name: `Écouter ${candidate.contributor.name}` })).not.toBeInTheDocument();
      fireEvent.click(card);
      await settle();
    });
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: false, candidate: { id: candidate.id } });

    fireEvent.click(screen.getByRole("radio", { name: "MIX" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "mix", playing: true, candidate: { id: candidate.id } });
    expect(screen.getByRole("radio", { name: "MIX" })).toHaveAttribute("aria-checked", "true");
    const referenceSource = sources.find((source) => source.buffer === importedBuffer)!;
    const candidateSource = sources.find((source) => source.buffer === candidateBuffer)!;
    const beatOutput = (referenceSource.connect.mock.calls[0][0] as MockAudioNode).connect.mock.calls[0][0] as MockAudioNode;
    const beatPreview = beatOutput.connect.mock.calls[0][0] as MockAudioNode;
    const privateBus = (candidateSource.connect.mock.calls[0][0] as MockAudioNode).connect.mock.calls[0][0] as MockAudioNode;
    expect(beatPreview.gain.value).toBe(1);
    expect(privateBus.gain.value).toBe(.75);

    fireEvent.click(screen.getByRole("radio", { name: "BOUCLE" }));
    expect(transport.engine.getSnapshot().mode).toBe("loop");
    expect(beatPreview.gain.value).toBe(0);
    expect(privateBus.gain.value).toBe(.75);
    fireEvent.click(screen.getByRole("radio", { name: "BASE" }));
    expect(transport.engine.getSnapshot().mode).toBe("base");
    expect(beatPreview.gain.value).toBe(1);
    expect(privateBus.gain.value).toBe(.75);
  });

  it("applique ensemble Musique et Master à la référence, aux couches et à la boucle privée", async () => {
    const { rerenderGains } = renderPlayer();
    await importTrack("Imported.wav");
    await act(async () => { transport.select(candidate); transport.engine.setMode("mix"); await settle(); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    const referenceSource = sources.find((source) => source.buffer === importedBuffer)!;
    const candidateSource = sources.find((source) => source.buffer === candidateBuffer)!;
    const referenceVoiceGain = referenceSource.connect.mock.calls[0][0] as MockAudioNode;
    const musicalOutput = referenceVoiceGain.connect.mock.calls[0][0] as MockAudioNode;
    const beatPreview = musicalOutput.connect.mock.calls[0][0] as MockAudioNode;
    const previewGain = beatPreview.connect.mock.calls[0][0] as MockAudioNode;
    const candidateVoiceGain = candidateSource.connect.mock.calls[0][0] as MockAudioNode;
    const privateBus = candidateVoiceGain.connect.mock.calls[0][0] as MockAudioNode;
    expect(privateBus.connect).toHaveBeenCalledExactlyOnceWith(previewGain);
    expect(previewGain.gain.value).toBe(1);
    await act(async () => { rerenderGains(.4, .5); await settle(); });
    expect(previewGain.gain.value).toBeCloseTo(.2);
    expect(privateBus.connect).not.toHaveBeenCalledWith(context.destination);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("publie une piste nominale et laisse le compositeur appliquer Musique × Master une seule fois", async () => {
    const programAudio: PlaceMixerProgramAudioTransport = {
      status: "connected",
      musicAudible: true,
      musicGeneration: null,
      prepareMusicTrack: vi.fn(async (_track, generation) => {
        programAudio.musicGeneration = generation;
        return true;
      }),
      setMusicEnabled: vi.fn(async () => true),
      releaseMusicTrack: vi.fn(async () => undefined),
    };
    renderPlayer(.4, .5, programAudio);
    await importTrack("Imported.wav");
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Public" }));
      await settle();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Diffuser dans la Room" }));
      await settle();
    });

    const previewGain = gains.find((gain) => gain.connect.mock.calls.some(([destination]) => destination.connect.mock.calls.some(([output]: [unknown]) => output === context.destination)));
    const publicGain = gains.find((gain) => gain.connect.mock.calls.some(([destination]) => destination === mediaDestination));
    expect(previewGain?.gain.value).toBeCloseTo(.2);
    expect(publicGain?.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, .018);
    expect(programAudio.setMusicEnabled).toHaveBeenCalledWith(true);
  });

  it("enchaîne les fichiers dans l’ordre puis s’arrête au dernier", async () => {
    const callbacks = renderPlayer();
    await importTrack(["Old.wav", "Imported.wav"]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    expect(sources[0].loop).toBe(false);
    context.currentTime = 120.025;
    await act(async () => { sources[0].onended?.(); await settle(); });
    expect(screen.getByRole("slider", { name: "Progression de Imported" })).toBeVisible();
    expect(transport.engine.getSnapshot()).toMatchObject({ playing: true, mode: "base" });
    const next = sources.find(source => source.buffer === importedBuffer)!;
    expect(next.loop).toBe(false);
    context.currentTime = 300.1;
    await act(async () => { next.onended?.(); await settle(); });
    expect(transport.engine.getSnapshot()).toMatchObject({ playing: false, position: 180 });
    expect(callbacks.onPlaybackStateChange).toHaveBeenLastCalledWith("ended", expect.any(String));
  });

  it("applique l’aléatoire aux fichiers importés, sans reprendre le fichier courant", async () => {
    renderPlayer();
    await importTrack(["Old.wav", "Imported.wav", "Third.wav"]);
    fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Lecture aléatoire" }));
    vi.spyOn(Math, "random").mockReturnValue(.99);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    context.currentTime = 120.025;
    await act(async () => { sources[0].onended?.(); await settle(); });
    expect(screen.getByRole("slider", { name: "Progression de Third" })).toBeVisible();
    expect(transport.engine.getSnapshot().playing).toBe(true);
  });

  it("bascule entre répétition et ordre sans confondre le réglage A/B", async () => {
    renderPlayer();
    await importTrack("Imported.wav");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    act(() => transport.engine.setRegion(32, 4));
    fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Lecture en boucle" }));
    expect(sources[0].loop).toBe(true);
    expect(sources[0].loopStart).toBe(0);
    expect(sources[0].loopEnd).toBe(180);
    fireEvent.click(screen.getByRole("button", { name: "Options de lecture" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Lecture dans l’ordre" }));
    expect(sources[0].loop).toBe(false);
    expect(transport.engine.getSnapshot().region).toEqual({ start: 32, end: 40 });
    fireEvent.click(screen.getByRole("button", { name: "Mettre en pause" }));
    await act(async () => { sources[0].onended?.(); await settle(); });
    expect(transport.engine.getSnapshot().playing).toBe(false);
  });

  it("revient à BASE et au début lorsqu’un fichier est importé après une écoute BOUCLE", async () => {
    renderPlayer();
    await importTrack("Old.wav");
    await act(async () => { transport.select(candidate); await settle(); });
    fireEvent.click(screen.getByRole("radio", { name: "BOUCLE" }));
    act(() => { transport.engine.setRegion(32, 4); transport.engine.seek(35); });
    expect(transport.engine.getSnapshot().mode).toBe("loop");
    await importTrack("Imported.wav");
    expect(screen.getByRole("radio", { name: "BASE" })).toHaveAttribute("aria-checked", "true");
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", quickPreview: false, playing: false, position: 0, duration: 180 });
    expect(transport.engine.getSnapshot().candidate?.id).toBe(candidate.id);
    expect(screen.getByRole("slider", { name: "Progression de Imported" })).toHaveValue("0");
    expect(sources).toHaveLength(0);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("arrête le solo rapide, attend le nouveau décodage puis joue le fichier importé plutôt que la candidate seule", async () => {
    const callbacks = renderPlayer();
    await importTrack("Old.wav");
    await act(async () => { transport.quickPreview(candidate); await settle(); });
    expect(transport.engine.getSnapshot()).toMatchObject({ playing: true, quickPreview: true });
    expect(screen.getByRole("radio", { name: "BOUCLE" })).toHaveAttribute("aria-checked", "true");
    expect(sources.some((source) => source.buffer === candidateBuffer)).toBe(true);
    const previousSources = [...sources];
    holdImport = true;
    await importTrack("Imported.wav");
    expect(transport.engine.getSnapshot()).toMatchObject({ playing: false, quickPreview: false, mode: "base", position: 0, referenceLoading: true });
    previousSources.forEach((source) => expect(source.stop).toHaveBeenCalled());
    const play = screen.getByRole("button", { name: "Préécouter localement" });
    expect(play).toBeDisabled();
    fireEvent.click(play);
    expect(sources).toHaveLength(previousSources.length);
    expect(screen.getByText("Chargement du morceau…")).toBeVisible();
    await act(async () => { importResponse.resolve(response(1)); await settle(); });
    expect(play).toBeEnabled();
    expect(transport.engine.getSnapshot().referenceLoading).toBe(false);
    await act(async () => { fireEvent.click(play); await settle(); });
    expect(screen.getByRole("button", { name: "Mettre en pause" })).toBeVisible();
    const newSources = sources.slice(previousSources.length);
    const referenceSource = newSources.find((source) => source.buffer === importedBuffer)!;
    const auditionSource = newSources.find((source) => source.buffer === candidateBuffer)!;
    expect(referenceSource).toBeDefined();
    expect(referenceSource.start).toHaveBeenCalledWith(.025, 0);
    expect(newSources.some((source) => source.buffer === oldBuffer)).toBe(false);
    expectBaseAudition(referenceSource, auditionSource);
    expect(callbacks.onPlaybackStateChange).toHaveBeenLastCalledWith("previewing", expect.any(String));
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it("garde le curseur du Beat libre et la cible à zéro même après déplacement de la zone A/B", async () => {
    renderPlayer();
    await importTrack("Imported.wav");
    await act(async () => { transport.select(candidate); await settle(); });
    act(() => transport.engine.setRegion(32, 4));
    fireEvent.click(screen.getByRole("button", { name: "Avancer la zone de 4 mesures" }));
    expect(transport.engine.getSnapshot().region).toEqual({ start: 40, end: 48 });
    const progress = screen.getByRole("slider", { name: "Progression de Imported" });
    fireEvent.change(progress, { target: { value: ".5" } });
    expect(transport.engine.getSnapshot().position).toBe(90);
    fireEvent.change(progress, { target: { value: "0" } });
    expect(transport.engine.getSnapshot().position).toBe(0);
    fireEvent.change(progress, { target: { value: ".5" } });
    fireEvent.click(screen.getByRole("button", { name: "Revenir au curseur" }));
    expect(transport.engine.getSnapshot().position).toBe(0);
    expect(progress).toHaveValue("0");
    expect(transport.engine.getSnapshot().region).toEqual({ start: 40, end: 48 });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Préécouter localement" })); await settle(); });
    const referenceSource = sources.find((source) => source.buffer === importedBuffer)!;
    expect(referenceSource.start).toHaveBeenCalledWith(.025, 0);
    expect(referenceSource.loopStart).toBe(0);
    expect(referenceSource.loopEnd).toBe(180);
    expect(transport.engine.getSnapshot()).toMatchObject({ mode: "base", playing: true, position: 0 });
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
});
