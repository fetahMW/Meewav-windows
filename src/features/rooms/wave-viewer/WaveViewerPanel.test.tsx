import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewerPanel } from "./WaveViewerPanel";
import { WaveViewerListeningBar, WaveViewerListeningProvider } from "./WaveViewerListening";
import { createPlaceDemoState } from "../place/place.fixtures";
import type { WaveViewerSnapshot, ViewerRules } from "./waveViewerModel";

const mocks = vi.hoisted(() => ({ play: vi.fn(async () => true), pause: vi.fn(), stop: vi.fn(), load: vi.fn(async () => ({ duration: 16 })), decode: vi.fn(async () => ({ duration: 16, numberOfChannels: 2, sampleRate: 48000 })), volume: vi.fn() }));
vi.mock("./WaveViewerAudio", () => ({ WaveViewerAudio: class { play = mocks.play; pause = mocks.pause; stop = mocks.stop; decode = mocks.decode; load = mocks.load; setVolume = mocks.volume; setOutputVolume = vi.fn(); resume = mocks.play; dispose = vi.fn(); onEnded = vi.fn(); } }));
const rules: ViewerRules = { id: "r1", bpm: 120, key: "Do mineur", cycleBars: 8, acceptedBars: [4, 8], signature: "4/4", maxDurationMs: 16000, mimeTypes: ["audio/wav"], repeatPolicy: "REPEAT_TO_CYCLE" };
function snapshot(): WaveViewerSnapshot { return { sessionId: "s1", sequence: 1, serverNow: new Date().toISOString(), title: "Wave test", status: "LIVE_ACTIVE", rules, activeBeatId: "b1", activeRevision: 1, programSource: "SERVER_RENDER", pendingActivation: false, reference: { id: "ref1", beatRevisionId: "b1", revision: 1, rules, durationSeconds: 16, originSeconds: 0, label: "Beat actuel — version 1", url: "/reference.wav", downloadable: true }, categories: [{ id: "drums", label: "Drums", permitted: true, open: true, priority: false }], contributions: [], layers: [], vote: null, termsVersion: "v1", submissionsOpen: true }; }
const room = createPlaceDemoState();
type SubmitHandler = ComponentProps<typeof ViewerPanel>["onSubmit"];
function setup(state = snapshot(), onSubmit = vi.fn<SubmitHandler>(async () => "Traitement du fichier en cours")) {
  const onVote = vi.fn(async () => undefined);
  const content = (next: WaveViewerSnapshot, hidden = false) => <WaveViewerListeningProvider><div hidden={hidden}><ViewerPanel room={room} snapshot={next} connected canEngage refresh={async () => undefined} onSubmit={onSubmit} onVote={onVote} /></div><WaveViewerListeningBar onOpenWave={vi.fn()} /></WaveViewerListeningProvider>;
  const view = render(content(state));
  const importLoop = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Tester ma boucle" }));
    const file = new File(["wav"], "my-loop.wav", { type: "audio/wav" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    await screen.findByRole("button", { name: "Solo" });
    return file;
  };
  return { ...view, onSubmit, onVote, importLoop, update: (next: WaveViewerSnapshot, hidden = false) => view.rerender(content(next, hidden)) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.decode.mockResolvedValue({ duration: 16, numberOfChannels: 2, sampleRate: 48000 }); HTMLElement.prototype.scrollIntoView = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Wave Viewer workshop acceptance", () => {
  it("downloads only a published layer and keeps private contributions out of downloads", async () => {
    const state = snapshot();
    state.layers = [{ id: "base", title: "Base", credit: "Host", category: "drums", isBase: true, downloadable: true, url: "/base.wav" }];
    state.contributions = [{ id: "private", title: "Private", category: "drums", status: "RECEIVED", reason: null, version: 1, integrated: false }];
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new Blob(["audio"], { type: "audio/wav" }) }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    setup(state);
    expect(screen.queryByRole("button", { name: "Télécharger Private" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Télécharger la boucle de base" }));
    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith("/base.wav");
    expect((click.mock.instances[0] as HTMLAnchorElement).download).toBe("Base.wav");
  });
  it("revokes consent when replacing a file and blocks incompatible durations", async () => {
    const view = setup(); await view.importLoop();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Soumettre ma boucle" })).toBeEnabled();
    mocks.decode.mockResolvedValueOnce({ duration: 2.39, numberOfChannels: 2, sampleRate: 48000 });
    const next = new File(["wav"], "short.wav", { type: "audio/wav" });
    Object.defineProperty(next, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [next] } });
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.getByRole("checkbox")).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Soumettre ma boucle" })).toBeDisabled();
    expect(view.onSubmit).not.toHaveBeenCalled();
  });
  it("import is local, does not play, and submits only the chosen original on explicit consent", async () => {
    const view = setup(); const file = await view.importLoop();
    expect(view.onSubmit).not.toHaveBeenCalled(); expect(mocks.play).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /son téléchargement et son utilisation par les autres utilisateurs/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Soumettre ma boucle" }));
    expect(view.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Soumettre ma boucle" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Soumettre ma boucle" }));
    await waitFor(() => expect(view.onSubmit).toHaveBeenCalledOnce());
    expect(view.onSubmit.mock.calls[0][0].file).toBe(file);
    expect(view.onSubmit.mock.calls[0][0].reference?.id).toBe("ref1");
    expect(view.onSubmit.mock.calls[0][0]).not.toHaveProperty("volume");
  });
  it("coalesces double sends and freezes the original request across an uncertain retry", async () => {
    let reject!: (error: Error) => void;
    const send = vi.fn<SubmitHandler>(() => new Promise<string>((_, fail) => { reject = fail; }));
    const view = setup(snapshot(), send); await view.importLoop();
    fireEvent.click(screen.getByRole("checkbox"));
    const button = screen.getByRole("button", { name: "Soumettre ma boucle" });
    fireEvent.click(button); fireEvent.click(button); expect(send).toHaveBeenCalledOnce();
    await act(async () => reject(new Error("network unavailable")));
    expect(screen.getByRole("textbox", { name: "Titre" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer l’envoi" }));
    expect(send.mock.calls[1][0]).toBe(send.mock.calls[0][0]);
  });
  it("preserves a draft when submissions close and still permits local solo", async () => {
    const state = snapshot(); const view = setup(state); await view.importLoop();
    view.update({ ...state, submissionsOpen: false });
    expect(screen.getByText(/Soumissions fermées/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Soumettre ma boucle" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Solo" }));
    await waitFor(() => expect(mocks.play).toHaveBeenCalledWith([expect.objectContaining({ duration: 16 })], [.7], false));
  });
  it("pins a reference while the Beat changes and keeps audio controls visible in Chat", async () => {
    const state = snapshot(); const view = setup(state); await view.importLoop();
    fireEvent.click(screen.getByRole("button", { name: "Avec le Beat" }));
    await waitFor(() => expect(mocks.play).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ duration: 16 })]), [.7, .7], true));
    view.update({ ...state, reference: { ...state.reference!, id: "ref2", revision: 2, label: "Beat actuel — version 2" } });
    expect(screen.getByText("Beat actuel — version 1")).toBeVisible();
    expect(screen.getByRole("button", { name: "Tester avec la nouvelle version" })).toBeVisible();
    view.update(state, true);
    expect(screen.getByText("ÉCOUTE PRIVÉE")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retour au live" }));
    view.update(state);
    expect(screen.getByRole("button", { name: "Solo" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Volume référence" })).toHaveValue("0.7");
  });
  it("announces an incoming vote without interrupting private audio or extending the deadline", async () => {
    const state = snapshot(); const view = setup(state); await view.importLoop();
    fireEvent.click(screen.getByRole("button", { name: "Solo" })); await waitFor(() => expect(mocks.play).toHaveBeenCalledOnce());
    mocks.stop.mockClear(); mocks.pause.mockClear();
    const vote = { id: "vote1", kind: "ADMISSION" as const, title: "Basse officielle", credit: "Sam", status: "OPEN", opensAt: new Date(Date.now() - 1000).toISOString(), closesAt: new Date(Date.now() + 30000).toISOString(), referenceBeatRevisionId: "b1", candidateVersion: 2, eligible: false, choice: null, approved: null, options: [{ id: "WITH_BEAT", label: "Candidate B", url: "/vote.wav" }] };
    view.update({ ...state, vote });
    expect(screen.getByText("Un vote est ouvert.")).toBeVisible(); expect(mocks.stop).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Écouter et voter · Candidate B" }));
    await waitFor(() => expect(mocks.play).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Valider" })).toBeDisabled();
    expect(view.onVote).not.toHaveBeenCalled();
  });
  it("keeps the live usable after a defective import and never invents host voice separation", async () => {
    mocks.decode.mockRejectedValueOnce(new Error("Fichier audio non lisible."));
    const view = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tester ma boucle" }));
    const file = new File(["bad"], "broken.wav", { type: "audio/wav" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(4) });
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Fichier audio non lisible");
    expect(screen.queryByLabelText("Écoute personnelle")).not.toBeInTheDocument();
    expect(screen.queryByText("Garder la voix du host pendant mon essai")).not.toBeInTheDocument();
  });
});
