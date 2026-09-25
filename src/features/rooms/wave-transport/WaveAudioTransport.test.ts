import { afterEach, describe, expect, it, vi } from "vitest";
import { WaveAudioTransport, type WaveAudioAsset, type WaveListeningMode } from "./WaveAudioTransport";
import { musicalRegion, nextBoundary } from "./waveMusicalGrid";

class Param {
  value = 1;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
}
class Node {
  gain = new Param(); playbackRate = new Param(); buffer?: AudioBuffer; loop = false; loopStart = 0; loopEnd = 0;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn(); onended?: () => void;
}
function buffer(duration = 8) {
  return { duration, length: duration * 100, sampleRate: 100, numberOfChannels: 1,
    getChannelData: () => new Float32Array(duration * 100), copyToChannel: vi.fn() } as unknown as AudioBuffer;
}
function harness() {
  vi.useFakeTimers();
  const sources: Node[] = []; const gains: Node[] = [];
  const context = { currentTime: 0, destination: new Node(), state: "running", resume: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined),
    createGain: () => { const node = new Node(); gains.push(node); return node; },
    createBufferSource: () => { const node = new Node(); sources.push(node); return node; },
    createBuffer: (_channels: number, length: number, sampleRate: number) => buffer(length / sampleRate),
    decodeAudioData: vi.fn().mockResolvedValue(buffer()),
  };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  const engine = new WaveAudioTransport(async asset => asset.url ?? "/loop.wav", () => context as unknown as AudioContext);
  engine.setGrid({ bpm: 120, beatsPerBar: 4, origin: 0 });
  return { engine, context, sources, gains };
}
const asset = (id: string, bars = 4): WaveAudioAsset => ({ id, title: id, url: `/${id}.wav`, bpm: 120, bars });
const flush = async () => { for (let turn = 0; turn < 12; turn++) await Promise.resolve(); };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("grille musicale Wave", () => {
  it.each([4, 8, 16, 32] as const)("conserve exactement %s mesures avec un pas fixe de quatre mesures", bars => {
    const region = musicalRegion(15.9, bars, { bpm: 120, beatsPerBar: 4, origin: 0 });
    expect(region).toEqual({ start: 16, end: 16 + bars * 2 });
    expect(musicalRegion(10.9, bars, { bpm: 120, beatsPerBar: 4, origin: 0 })).toEqual({ start: 8, end: 8 + bars * 2 });
  });
  it("suit le premier temps et la signature", () => {
    expect(musicalRegion(4.3, 4, { bpm: 120, beatsPerBar: 3, origin: .25 })).toEqual({ start: 6.25, end: 12.25 });
  });
  it("borne le déplacement sur un bloc entier sans raccourcir la zone", () => {
    const grid = { bpm: 120, beatsPerBar: 4, origin: .25 };
    expect(musicalRegion(100, 8, grid, 37)).toEqual({ start: 16.25, end: 32.25 });
    expect(musicalRegion(-100, 8, grid, 37)).toEqual({ start: .25, end: 16.25 });
    expect(musicalRegion(100, 16, grid, 8)).toEqual({ start: .25, end: 32.25 });
  });
  it.each([87, 124, 173])("garde la même grille à %s BPM", bpm => {
    const grid = { bpm, beatsPerBar: 4, origin: .37 };
    const bar = 60 / bpm * 4;
    for (const bars of [4, 8, 16, 32] as const) {
      const region = musicalRegion(grid.origin + 13.1 * bar, bars, grid);
      expect((region.start - grid.origin) / bar).toBeCloseTo(12, 10);
      expect((region.end - region.start) / bar).toBeCloseTo(bars, 10);
    }
  });
  it("arme le prochain A ou la prochaine mesure sans retard calculé par timer UI", () => {
    const grid = { bpm: 120, beatsPerBar: 4, origin: 0 };
    expect(nextBoundary(3, grid, { start: 0, end: 8 })).toBe(5);
    expect(nextBoundary(3, grid, null)).toBe(1);
  });
});
describe("transport audio de la room", () => {
  it("termine le Beat une seule fois en lecture de playlist, sans rebouclage forcé", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref"));
    engine.setReferenceRepeat(false);
    const ended = vi.fn();
    engine.subscribeReferenceEnded(ended);
    await engine.play();
    expect(sources[0].loop).toBe(false);
    context.currentTime = 8.5;
    expect(engine.position()).toBe(8);
    sources[0].onended?.();
    sources[0].onended?.();
    expect(ended).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot()).toMatchObject({ playing: false, position: 8 });
    await engine.play();
    expect(sources[1].start).toHaveBeenCalledWith(8.525, 0);
    engine.dispose();
  });

  it("applique la répétition du Beat immédiatement sans redémarrer la source", async () => {
    const { engine, sources } = harness();
    await engine.setReference(asset("ref"));
    engine.setReferenceRepeat(false);
    await engine.play();
    engine.setReferenceRepeat(true);
    expect(sources[0].loop).toBe(true);
    expect(sources).toHaveLength(1);
    engine.setReferenceRepeat(false);
    expect(sources[0].loop).toBe(false);
    engine.dispose();
  });

  it("garde les auditions musicales répétées malgré le mode playlist", async () => {
    const { engine, sources } = harness();
    await engine.setReference(asset("ref"));
    engine.setReferenceRepeat(false);
    engine.setMode("mix");
    engine.setRegion(0, 4);
    await engine.play();
    expect(sources[0].loop).toBe(true);
    engine.setMode("beat");
    expect(sources[0].loop).toBe(false);
    engine.setQuickPreview(true);
    expect(sources[0].loop).toBe(true);
    engine.dispose();
  });

  it("n’annonce pas une fin naturelle lors d’une pause ou d’un remplacement de référence", async () => {
    const { engine, sources } = harness();
    await engine.setReference(asset("ref"));
    engine.setReferenceRepeat(false);
    const ended = vi.fn();
    engine.subscribeReferenceEnded(ended);
    await engine.play();
    engine.pause();
    sources[0].onended?.();
    await engine.play();
    await engine.setReference(asset("next"));
    sources[1].onended?.();
    expect(ended).not.toHaveBeenCalled();
    engine.dispose();
  });

  it("applique aussi le snap de quatre mesures et les limites dans le moteur", async () => {
    const { engine, context } = harness();
    context.decodeAudioData.mockResolvedValueOnce(buffer(37));
    await engine.setReference({ id: "long-ref", title: "Référence longue", url: "/long-ref.wav" });
    engine.setRegion(10.9, 8);
    expect(engine.getSnapshot().region).toEqual({ start: 8, end: 24 });
    engine.setRegion(100, 8);
    expect(engine.getSnapshot().region).toEqual({ start: 16, end: 32 });
    engine.dispose();
  });
  it("cadre librement A et B dans la référence sans modifier la longueur musicale mémorisée", async () => {
    const { engine, context, sources } = harness();
    context.decodeAudioData.mockResolvedValueOnce(buffer(80));
    await engine.setReference({ id: "long-ref", title: "Référence longue", url: "/long-ref.wav" });
    engine.setMode("mix");
    engine.setRegion(0, 32);
    expect(engine.getSnapshot().region).toEqual({ start: 0, end: 64 });
    engine.setFreeRegion(10.2, 18.7);
    expect(engine.getSnapshot()).toMatchObject({ regionMode: "free", bars: 32, region: { start: 10.2, end: 18.7 } });
    await engine.play();
    expect(sources[0].loopStart).toBeCloseTo(10.2);
    expect(sources[0].loopEnd).toBeCloseTo(18.7);
    engine.setFreeRegion(12.4, 18.7);
    expect(engine.getSnapshot().region).toEqual({ start: 12.4, end: 18.7 });
    engine.setFreeRegion(12.4, 20.1);
    expect(engine.getSnapshot().region).toEqual({ start: 12.4, end: 20.1 });
    engine.setGrid({ bpm: 124, beatsPerBar: 4, origin: 0 });
    expect(engine.getSnapshot().region).toEqual({ start: 12.4, end: 20.1 });
    engine.dispose();
  });
  it("conserve le mode A–B libre quand une proposition exige une zone plus longue", async () => {
    const { engine, context } = harness();
    context.decodeAudioData.mockResolvedValueOnce(buffer(80));
    await engine.setReference({ id: "long-ref", title: "Référence longue", url: "/long-ref.wav" });
    engine.setFreeRegion(2, 10);
    await engine.select(asset("candidate", 16));
    expect(engine.getSnapshot()).toMatchObject({ regionMode: "free", region: { start: 2, end: 34 } });
    engine.dispose();
  });
  it("refuse toute diffusion candidate depuis le Sas ou avec une version non verrouillée", async () => {
    const { engine } = harness();
    await engine.select(asset("sas"));
    engine.setVoteBroadcast(true);
    expect(engine.getSnapshot().voteBroadcast).toBe(false);
    engine.setVoteEligibility({ asset: { ...asset("sas"), version: 2 }, open: true, ready: true, rightsConfirmed: true, lockedVersion: 1, mode: "beat", preMixed: false });
    engine.setVoteBroadcast(true);
    expect(engine.getSnapshot().voteBroadcast).toBe(false);
    engine.dispose();
  });
  it("exige une action explicite et révoque la diffusion dès la fermeture du vote", async () => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    const candidate = { ...asset("vote"), version: 1 };
    await engine.setReference(asset("ref")); await engine.select(candidate);
    const eligibility = { asset: candidate, open: true, ready: true, rightsConfirmed: true, lockedVersion: 1, mode: "beat" as const, preMixed: false };
    engine.setVoteEligibility(eligibility);
    expect(engine.getSnapshot().voteBroadcast).toBe(false);
    engine.setVoteBroadcast(true); await engine.play();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(sources.length).toBe(3);
    engine.setVoteEligibility({ ...eligibility, open: false });
    expect(engine.getSnapshot().voteBroadcast).toBe(false);
    expect(sources[2].stop).toHaveBeenCalled();
    expect(sources[0].stop).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("conserve le mute d’une piste même si son fader change", async () => {
    const { engine, sources } = harness();
    await engine.setReference(asset("ref")); await engine.play();
    await engine.syncLayers([{ asset: asset("layer"), audible: false, gain: .8 }]);
    engine.setLayerGain("layer", .4);
    const gain = sources[1].connect.mock.calls[0][0] as Node;
    expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .008);
    engine.setReferenceMix(false); engine.setLayerGain("base", .5);
    const referenceGain = sources[0].connect.mock.calls[0][0] as Node;
    expect(referenceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, .008);
    engine.dispose();
  });
  it("la projection persistée reprend autorité après un mouvement de fader optimiste", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref")); await engine.play();
    await engine.syncLayers([{ asset: asset("layer"), audible: true, gain: .8 }]);
    const layerVoice = sources[1];
    const layerGain = layerVoice.connect.mock.calls[0][0] as Node;

    context.currentTime = 2;
    engine.setLayerGain("layer", .2);
    expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 2, .008);

    context.currentTime = 3;
    await engine.syncLayers([{ asset: asset("layer"), audible: true, gain: .65 }]);
    expect(sources[1]).toBe(layerVoice);
    expect(sources).toHaveLength(2);
    expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.65, 3, .008);

    // A later mute/fader operation uses the newly projected value, not .2.
    await engine.syncLayers([{ asset: asset("layer"), audible: false, gain: .65 }]);
    engine.setLayerGain("layer", .4);
    expect(layerGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 3, .008);
    engine.dispose();
  });
  it("cale plusieurs couches sur la même horloge et commute mute/solo sans redémarrage", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref"));
    await engine.play();
    context.currentTime = 3;
    const bass = { asset: asset("bass"), audible: true, gain: .8 };
    const drums = { asset: asset("drums"), audible: true, gain: .7 };
    await engine.syncLayers([bass, drums]);
    expect(sources).toHaveLength(3);
    expect(sources[1].start.mock.calls[0][0]).toBeCloseTo(3.025, 10);
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(3.025, 10);
    expect(sources[1].start.mock.calls[0][1]).toBeCloseTo(sources[2].start.mock.calls[0][1], 10);

    context.currentTime = 4;
    await engine.syncLayers([{ ...bass, audible: false }, drums]);
    expect(sources).toHaveLength(3);
    expect(sources[1].stop).not.toHaveBeenCalled();
    expect(sources[2].stop).not.toHaveBeenCalled();
    const bassGain = sources[1].connect.mock.calls[0][0] as Node;
    const drumsGain = sources[2].connect.mock.calls[0][0] as Node;
    expect(bassGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 4, .008);
    expect(drumsGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.7, 4, .008);
    engine.dispose();
  });
  it("sélectionne et décode à l’arrêt sans lancer le son", async () => {
    const { engine, sources } = harness();
    await engine.select(asset("a"));
    expect(engine.getSnapshot().candidate?.id).toBe("a");
    expect(engine.getSnapshot().loading).toBe(false);
    expect(sources).toHaveLength(0);
    engine.dispose();
  });
  it("le candidat est câblé uniquement vers la sortie privée, jamais vers le programme", async () => {
    const { engine, sources } = harness();
    const preview = new Node(), program = new Node();
    engine.connect(preview as unknown as GainNode, program as unknown as GainNode);
    await engine.setReference(asset("ref")); await engine.select(asset("a")); await engine.play();
    const candidateGain = sources[1].connect.mock.calls[0][0] as Node;
    const privateBus = candidateGain.connect.mock.calls[0][0] as Node;
    expect(privateBus.connect).toHaveBeenCalledExactlyOnceWith(preview);
    expect(privateBus.connect).not.toHaveBeenCalledWith(program);
    engine.dispose();
  });
  it("change de candidat au prochain A sans recréer ni arrêter la référence", async () => {
    const { engine, context, sources } = harness();
    engine.setMode("mix");
    await engine.setReference(asset("ref")); engine.setRegion(0, 4);
    await engine.select(asset("a")); await engine.play();
    context.currentTime = 3.025;
    await engine.select(asset("b"));
    expect(sources).toHaveLength(3);
    expect(sources[0].stop).not.toHaveBeenCalled();
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(8.025, 8);
    expect(engine.getSnapshot().armedAt).toBeCloseTo(8.025, 8);
    engine.dispose();
  });

  it("en BOUCLE, un clic remplace immédiatement la boucle sans Pause puis Play", async () => {
    const { engine, context, sources } = harness();
    engine.setMode("loop");
    await engine.setReference(asset("ref")); engine.setRegion(0, 4);
    await engine.select(asset("a")); await engine.play();
    context.currentTime = 3.025;

    await engine.select(asset("b"));

    expect(engine.getSnapshot()).toMatchObject({ mode: "loop", playing: true, candidate: { id: "b" } });
    expect(sources).toHaveLength(3);
    expect(sources[0].stop).not.toHaveBeenCalled();
    const previousGain = sources[1].connect.mock.calls[0][0] as Node;
    expect(previousGain.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 3.058);
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(3.05, 8);
    engine.dispose();
  });
  it("annule une bascule future si une autre sélection arrive", async () => {
    const { engine, context, sources } = harness();
    engine.setMode("mix");
    await engine.setReference(asset("ref")); engine.setRegion(0, 4); await engine.select(asset("a")); await engine.play();
    context.currentTime = 3.025; await engine.select(asset("b"));
    context.currentTime = 4.025; await engine.select(asset("c"));
    expect(sources[2].stop).toHaveBeenCalled();
    expect(sources[1].stop).not.toHaveBeenCalled();
    expect(sources[3].start.mock.calls[0][0]).toBeCloseTo(8.025, 8);
    engine.dispose();
  });
  it("boucle sans dérive même si aucun tick UI n’est exécuté pendant dix minutes", async () => {
    const { engine, context, sources } = harness();
    engine.setMode("mix");
    await engine.setReference(asset("ref")); engine.setRegion(0, 8); await engine.select(asset("a")); await engine.play();
    context.currentTime = 603.025;
    expect(engine.position()).toBeCloseTo(11, 6);
    expect(sources[1].loop).toBe(true);
    expect(sources[1].loopEnd).toBe(8);
    expect(sources).toHaveLength(2);
    engine.dispose();
  });
  it("l’extension automatique pour une proposition longue ne coupe pas le Beat", async () => {
    const { engine, context, sources } = harness();
    engine.setMode("mix");
    await engine.setReference(asset("ref")); engine.setRegion(0, 4); await engine.play();
    context.currentTime = 3.025; await engine.select(asset("longue", 16));
    expect(engine.getSnapshot().bars).toBe(16);
    expect(engine.getSnapshot().notice).toContain("16 mesures");
    expect(sources[0].stop).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("une erreur de téléchargement ne coupe pas le Beat", async () => {
    const { engine, sources } = harness();
    await engine.setReference(asset("ref")); await engine.play();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Hors ligne"));
    await engine.select(asset("inaccessible"));
    expect(engine.getSnapshot().error).toBe("Hors ligne");
    expect(engine.getSnapshot().playing).toBe(true);
    expect(sources[0].stop).not.toHaveBeenCalled();
    engine.dispose();
  });
  it("refuse une durée musicale absente et ne tronque pas un fichier trop long", async () => {
    const { engine, context } = harness();
    await engine.select({ ...asset("bad"), bars: undefined });
    expect(engine.getSnapshot().error).toContain("manquante");
    await engine.setReference(asset("ref"));
    context.decodeAudioData.mockResolvedValueOnce(buffer(25));
    await engine.select(asset("trop-long")); await engine.play();
    expect(engine.getSnapshot().error).toContain("dépasse");
    expect(engine.getSnapshot().playing).toBe(true);
    engine.dispose();
  });
  it("ignore un chargement obsolète arrivé après le plus récent", async () => {
    const { engine, context } = harness();
    let resolve!: (buffer: AudioBuffer) => void;
    context.decodeAudioData.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const first = engine.select(asset("a"));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await engine.select(asset("b")); resolve(buffer()); await first;
    expect(engine.getSnapshot().candidate?.id).toBe("b");
    engine.dispose();
  });
  it("garde la position au pause/reprise et à la suppression du candidat", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref")); engine.setRegion(0, 4); await engine.select(asset("a")); await engine.play();
    context.currentTime = 3.025; await engine.select(null);
    expect(sources[0].stop).not.toHaveBeenCalled();
    engine.pause(); expect(engine.getSnapshot().position).toBeCloseTo(3);
    await engine.play(); expect(engine.getSnapshot().position).toBeCloseTo(3);
    engine.dispose();
  });
});

describe("modes d’écoute privés et tri rapide", () => {
  it.each([
    ["beat", 1, 1, 0], ["loop", 0, 0, .75], ["base", 1, 0, .75], ["mix", 1, 1, .75],
  ] as const)("%s applique les bus référence, couches et candidate attendus", async (mode, beatGain, layerGain, candidateGain) => {
    const { engine, sources } = harness();
    const preview = new Node(), program = new Node();
    engine.connect(preview as unknown as GainNode, program as unknown as GainNode);
    await engine.setReference(asset("ref")); await engine.select(asset("candidate"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .8 }]);
    engine.setMode(mode); await engine.play();
    await flush();
    const beatOutput = engine.getProgramInput() as unknown as Node;
    const beatPreview = beatOutput.connect.mock.calls[0][0] as Node;
    const beatProgram = beatOutput.connect.mock.calls[1][0] as Node;
    const candidateVoiceGain = sources[1].connect.mock.calls[0][0] as Node;
    const privateBus = candidateVoiceGain.connect.mock.calls[0][0] as Node;
    const layerVoiceGain = sources[2].connect.mock.calls[0][0] as Node;
    const layerOutput = layerVoiceGain.connect.mock.calls[0][0] as Node;
    const layerPreview = layerOutput.connect.mock.calls[0][0] as Node;
    const layerProgram = layerOutput.connect.mock.calls[1][0] as Node;
    expect(beatPreview.gain.value).toBe(beatGain);
    expect(layerPreview.gain.value).toBe(layerGain);
    expect(privateBus.gain.value).toBe(candidateGain);
    expect(beatProgram.gain.value).toBe(1);
    expect(layerProgram.gain.value).toBe(1);
    expect(privateBus.connect).toHaveBeenCalledExactlyOnceWith(preview);
    expect(privateBus.connect).not.toHaveBeenCalledWith(program);
    expect(engine.getSnapshot()).toMatchObject({ mode, quickPreview: false });
    // Moving the audition fader must not leak a candidate into BEAT.
    engine.setGain(.42);
    expect(privateBus.gain.value).toBe(mode === "beat" ? 0 : .42);
    engine.dispose();
  });

  it("bascule réellement entre BOUCLE, BASE et MIX sans laisser une couche sur le mauvais bus", async () => {
    const { engine, sources } = harness();
    const preview = new Node(), program = new Node();
    engine.connect(preview as unknown as GainNode, program as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("candidate"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .8 }]);
    engine.setMode("mix"); await engine.play(); await flush();

    const beatPreview = (engine.getProgramInput() as unknown as Node).connect.mock.calls[0][0] as Node;
    const privateBus = (sources[1].connect.mock.calls[0][0] as Node).connect.mock.calls[0][0] as Node;
    const layerOutput = (sources[2].connect.mock.calls[0][0] as Node).connect.mock.calls[0][0] as Node;
    const layerPreview = layerOutput.connect.mock.calls[0][0] as Node;

    engine.setMode("base");
    expect(beatPreview.gain.value).toBe(1);
    expect(layerPreview.gain.value).toBe(0);
    expect(privateBus.gain.value).toBe(.75);

    engine.setMode("loop");
    expect(beatPreview.gain.value).toBe(0);
    expect(layerPreview.gain.value).toBe(0);

    engine.setMode("mix");
    expect(beatPreview.gain.value).toBe(1);
    expect(layerPreview.gain.value).toBe(1);
    engine.dispose();
  });

  it("BASE rétablit la référence exclue par le Solo collectif sans ignorer son vrai mute", async () => {
    const { engine, sources, context } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("candidate"));
    engine.setReferenceMix(false, false);
    engine.setMode("base");
    await engine.play();

    const referenceGain = sources[0].connect.mock.calls[0][0] as Node;
    expect(referenceGain.gain.setValueAtTime).toHaveBeenLastCalledWith(1, .025);

    context.currentTime = 1;
    engine.setMode("mix");
    expect(referenceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, .008);
    engine.setMode("base");
    expect(referenceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 1, .008);

    engine.setReferenceMix(false, true);
    expect(referenceGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 1, .008);
    engine.dispose();
  });

  it.each(["beat", "loop", "base", "mix"] as WaveListeningMode[])("le solo rapide restaure le mode durable %s à la pause", async mode => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref")); await engine.select(asset("a"));
    engine.setMode(mode); engine.setQuickPreview(true); await engine.play();
    const beatPreview = (engine.getProgramInput() as unknown as Node).connect.mock.calls[0][0] as Node;
    const voiceGain = sources[1].connect.mock.calls[0][0] as Node;
    const privateBus = voiceGain.connect.mock.calls[0][0] as Node;
    expect(engine.getSnapshot()).toMatchObject({ mode, quickPreview: true, playing: true });
    expect(beatPreview.gain.value).toBe(0);
    expect(privateBus.gain.value).toBe(.75);
    engine.pause();
    expect(engine.getSnapshot()).toMatchObject({ mode, quickPreview: false, playing: false });
    expect(sources.every(source => source.stop.mock.calls.length > 0)).toBe(true);
    expect(beatPreview.gain.value).toBe(mode === "loop" ? 0 : 1);
    expect(privateBus.gain.value).toBe(mode === "beat" ? 0 : .75);
    await engine.play();
    expect(engine.getSnapshot()).toMatchObject({ mode, quickPreview: false, playing: true });
    engine.dispose();
  });

  it("le choix explicite du mode principal termine le solo rapide sans en changer la candidate", async () => {
    const { engine, sources, context } = harness();
    await engine.setReference(asset("ref")); engine.setRegion(0, 4);
    await engine.select(asset("a")); engine.setQuickPreview(true); await engine.play();
    context.currentTime = 3.025;
    engine.setMode("mix");
    expect(engine.getSnapshot()).toMatchObject({ mode: "mix", quickPreview: false, candidate: { id: "a" } });
    expect(sources[1].stop).toHaveBeenCalled();
    expect(sources[sources.length - 1]?.start.mock.calls[0][0]).toBeCloseTo(8.025);
    engine.dispose();
  });

  it("chaque nouvelle audition rapide remplace immédiatement la précédente, sans lancer tout le Sas", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref")); engine.setRegion(0, 4);
    await engine.select(asset("a")); engine.setQuickPreview(true); await engine.play();
    context.currentTime = 3.025;
    await engine.select(asset("b"));
    expect(sources[1].stop).toHaveBeenCalled();
    expect(sources[2].start.mock.calls[0][0]).toBeCloseTo(3.05);
    context.currentTime = 3.035;
    await engine.select(asset("c"));
    expect(sources[2].stop).toHaveBeenCalled();
    expect(sources[3].start.mock.calls[0][0]).toBeCloseTo(3.06);
    expect(sources.filter(source => !source.stop.mock.calls.length)).toEqual([sources[0], sources[3]]);
    expect(engine.getSnapshot()).toMatchObject({ mode: "beat", quickPreview: true, candidate: { id: "c" } });
    engine.dispose();
  });

  it("en BOUCLE, une candidate absente ou inaccessible ne remplace jamais le solo par le Beat", async () => {
    const { engine } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    engine.setMode("loop");
    const beatPreview = (engine.getProgramInput() as unknown as Node).connect.mock.calls[0][0] as Node;
    expect(beatPreview.gain.value).toBe(0);
    await engine.setReference(asset("ref")); await engine.play();
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Hors ligne"));
    await engine.select(asset("inaccessible"));
    expect(beatPreview.gain.value).toBe(0);
    expect(engine.getSnapshot().mode).toBe("loop");
    engine.dispose();
  });

  it("les couches collectives restent dans le Beat et ne deviennent pas des candidates privées", async () => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref")); await engine.select(asset("candidate"));
    engine.setQuickPreview(true); await engine.play();
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .8 }]);
    const layerVoiceGain = sources[2].connect.mock.calls[0][0] as Node;
    const layerOutput = layerVoiceGain.connect.mock.calls[0][0] as Node;
    expect(layerOutput).not.toBe(engine.getProgramInput());
    expect(layerOutput.connect.mock.calls[0][0]).toBeDefined();
    const beatPreview = (engine.getProgramInput() as unknown as Node).connect.mock.calls[0][0] as Node;
    expect(beatPreview.gain.value).toBe(0);
    expect(sources).toHaveLength(3);
    engine.dispose();
  });

  it("ne double pas en MIX une candidate déjà audible comme couche du Beat", async () => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("approved"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .8 }]);
    engine.setMode("mix");
    await engine.play();
    await flush();
    expect(sources).toHaveLength(2);
    expect(sources[0].buffer).toBeDefined();
    const layerVoiceGain = sources[1].connect.mock.calls[0][0] as Node;
    expect(layerVoiceGain.gain.value).toBe(.8);
    expect(engine.getSnapshot()).toMatchObject({ mode: "mix", candidate: { id: "approved" }, audibleCandidateId: null });
    engine.dispose();
  });

  it("garde en BOUCLE le solo privé d’une couche déjà intégrée au Beat", async () => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("approved"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .8 }]);
    engine.setMode("loop");
    await engine.play();
    await flush();
    const beatPreview = (engine.getProgramInput() as unknown as Node).connect.mock.calls[0][0] as Node;
    const candidateVoiceGain = sources[1].connect.mock.calls[0][0] as Node;
    const candidatePrivateBus = candidateVoiceGain.connect.mock.calls[0][0] as Node;
    expect(beatPreview.gain.value).toBe(0);
    expect(candidatePrivateBus.gain.value).toBe(.75);
    expect(sources).toHaveLength(3);
    expect(engine.getSnapshot()).toMatchObject({ mode: "loop", candidate: { id: "approved" } });
    engine.setMode("mix");
    expect(sources[1].stop).toHaveBeenCalled();
    expect(beatPreview.gain.value).toBe(1);
    expect(sources).toHaveLength(3);
    engine.setMode("loop");
    expect(sources).toHaveLength(4);
    const restartedPrivateBus = (sources[3].connect.mock.calls[0][0] as Node).connect.mock.calls[0][0] as Node;
    expect(restartedPrivateBus.gain.value).toBe(.75);
    engine.dispose();
  });

  it.each(["beat", "loop", "base", "mix"] as WaveListeningMode[])("%s reste totalement silencieux lorsque la base et toutes les couches sont mutées", async mode => {
    const { engine, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    engine.setReferenceMix(false);
    await engine.select(asset("approved"));
    await engine.syncLayers([{ asset: asset("approved"), audible: false, gain: .64 }]);
    engine.setMode(mode);
    await engine.play();
    await flush();

    const referenceGain = sources[0].connect.mock.calls[0][0] as Node;
    expect(referenceGain.gain.setValueAtTime).toHaveBeenLastCalledWith(0, .025);

    // The reference is source 0. Every possible copy of the accepted layer —
    // collective and, in BOUCLE, private — must be born at gain zero.
    expect(sources.length).toBeGreaterThanOrEqual(2);
    for (const source of sources.slice(1)) {
      const voiceGain = source.connect.mock.calls[0][0] as Node;
      const events = [
        ...voiceGain.gain.setValueAtTime.mock.calls.map((call, index) => ({ order: voiceGain.gain.setValueAtTime.mock.invocationCallOrder[index], value: call[0] })),
        ...voiceGain.gain.linearRampToValueAtTime.mock.calls.map((call, index) => ({ order: voiceGain.gain.linearRampToValueAtTime.mock.invocationCallOrder[index], value: call[0] })),
        ...voiceGain.gain.setTargetAtTime.mock.calls.map((call, index) => ({ order: voiceGain.gain.setTargetAtTime.mock.invocationCallOrder[index], value: call[0] })),
      ].sort((left, right) => left.order - right.order);
      expect(events[events.length - 1]?.value).toBe(0);
    }
    expect(sources).toHaveLength(mode === "loop" || mode === "base" ? 3 : 2);
    engine.dispose();
  });

  it("applique mute et fader à la voix BOUCLE privée sans la recréer", async () => {
    const { engine, context, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("approved"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .64 }]);
    engine.setMode("loop");
    await engine.play();
    await flush();
    const privateVoice = sources[1];
    const privateGain = privateVoice.connect.mock.calls[0][0] as Node;
    expect(privateGain.gain.linearRampToValueAtTime.mock.calls.some((call) => call[0] === .64)).toBe(true);

    context.currentTime = 2;
    await engine.syncLayers([{ asset: asset("approved"), audible: false, gain: .64 }]);
    expect(sources[1]).toBe(privateVoice);
    expect(privateVoice.stop).not.toHaveBeenCalled();
    expect(privateGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, .008);

    engine.setLayerGain("approved", .2);
    expect(privateGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, .008);
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .2 }]);
    expect(privateGain.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 2, .008);
    engine.dispose();
  });

  it("ne remonte jamais une ancienne voix faible ou mutée à gain 1 pendant un crossfade", async () => {
    const { engine, context, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("ref"));
    await engine.select(asset("approved"));
    await engine.syncLayers([{ asset: asset("approved"), audible: true, gain: .2 }]);
    engine.setMode("loop");
    await engine.play();
    await flush();
    const oldVoiceGain = (sources[1].connect.mock.calls[0][0] as Node).gain;
    oldVoiceGain.value = .2;

    context.currentTime = 3;
    await engine.select(asset("replacement"));
    expect(oldVoiceGain.setValueAtTime.mock.calls.some((call) => call[0] === 1)).toBe(false);
    expect(oldVoiceGain.setValueAtTime.mock.calls.every(([value]) => value <= .2)).toBe(true);
    expect(oldVoiceGain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, expect.any(Number));
    engine.dispose();
  });

  it("les Play simultanés ne multiplient pas les sources et Pause annule un resume en attente", async () => {
    const { engine, context, sources } = harness();
    await engine.setReference(asset("ref")); await engine.select(asset("a"));
    let resume!: () => void;
    const pendingResume = new Promise<void>(resolve => { resume = resolve; });
    context.resume.mockReturnValue(pendingResume);
    engine.setQuickPreview(true);
    const first = engine.play(), second = engine.play();
    engine.pause(); resume(); await Promise.all([first, second]);
    expect(sources).toHaveLength(0);
    expect(engine.getSnapshot()).toMatchObject({ playing: false, quickPreview: false, mode: "beat" });
    context.resume.mockResolvedValue(undefined);
    await Promise.all([engine.play(), engine.play()]);
    expect(sources).toHaveLength(2);
    engine.dispose();
  });
});

describe("séparation entre région d’audition et transport BEAT", () => {
  it("déplacer la région puis revenir au début en BEAT laisse lire le morceau entier", async () => {
    const { engine, context, sources } = harness();
    context.decodeAudioData.mockResolvedValueOnce(buffer(40));
    await engine.setReference({ id: "track", title: "Morceau", url: "/track.wav" });
    engine.seek(3); engine.setRegion(16, 4);
    expect(engine.getSnapshot()).toMatchObject({ mode: "beat", position: 3, region: { start: 16, end: 24 } });
    engine.seek(0); await engine.play();
    expect(sources[0].start).toHaveBeenCalledWith(.025, 0);
    expect(sources[0].loopStart).toBe(0); expect(sources[0].loopEnd).toBe(40);
    context.currentTime = 10.025;
    expect(engine.position()).toBeCloseTo(10);
    engine.setRegion(24, 4);
    expect(engine.position()).toBeCloseTo(10);
    engine.seek(0); await flush();
    expect(engine.getSnapshot().position).toBe(0);
    expect(sources[sources.length - 1]?.start.mock.calls[0][1]).toBe(0);
    engine.dispose();
  });

  it("BEAT vers MIX rejoint A hors zone ; MIX vers BEAT garde le curseur et libère la référence", async () => {
    const { engine, context, sources } = harness();
    context.decodeAudioData.mockResolvedValueOnce(buffer(40));
    await engine.setReference({ id: "track", title: "Morceau", url: "/track.wav" });
    await engine.select(asset("candidate"));
    engine.setRegion(16, 4); await engine.play();
    context.currentTime = 3.025;
    engine.setMode("mix"); await flush();
    expect(engine.getSnapshot()).toMatchObject({ mode: "mix", position: 16 });
    const referenceVoice = sources[2];
    expect(referenceVoice.start.mock.calls[0][1]).toBe(16);
    expect(referenceVoice.loopStart).toBe(16); expect(referenceVoice.loopEnd).toBe(24);
    context.currentTime = 5.05;
    expect(engine.position()).toBeCloseTo(18);
    engine.setMode("beat");
    expect(engine.position()).toBeCloseTo(18);
    expect(referenceVoice.loopStart).toBe(0); expect(referenceVoice.loopEnd).toBe(40);
    expect(referenceVoice.stop).not.toHaveBeenCalled();
    engine.seek(0); await flush();
    expect(engine.getSnapshot().position).toBe(0);
    expect(engine.getSnapshot().region).toEqual({ start: 16, end: 24 });
    engine.dispose();
  });

  it("un nouveau morceau remplace réellement la référence et le mode BEAT laisse la candidate muette", async () => {
    const { engine, context, sources } = harness();
    engine.connect(new Node() as unknown as GainNode, new Node() as unknown as GainNode);
    await engine.setReference(asset("old")); await engine.select(asset("candidate"));
    engine.setQuickPreview(true); await engine.play();
    engine.pause(); engine.setMode("beat"); engine.seek(0);
    context.decodeAudioData.mockResolvedValueOnce(buffer(40));
    await engine.setReference({ id: "import", title: "Import", url: "/import.wav" });
    engine.setRegion(16, 4); await engine.play();
    expect(engine.getSnapshot()).toMatchObject({ referenceId: "import", position: 0, mode: "beat", quickPreview: false });
    expect(sources[2].buffer?.duration).toBe(40);
    expect(sources[2].start.mock.calls[0][1]).toBe(0);
    const candidateGain = sources[3].connect.mock.calls[0][0] as Node;
    expect((candidateGain.connect.mock.calls[0][0] as Node).gain.value).toBe(0);
    engine.dispose();
  });
});
