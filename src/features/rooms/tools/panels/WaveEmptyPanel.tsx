import { Headphones, Swords, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import type { RoomPerson, RoomToolsCommand, WaveLayer, WaveState, WaveSubmission } from "../roomTools.types";
import { WAVE_LOOP_CATEGORIES, waveSubmissionCategory } from "../waveLoopCategories";
import { hasAudibleWaveSolo, isWaveLayerAudible } from "../waveLayerMix";
import WaveReplacementDialog from "./WaveReplacementDialog";
import WaveProfileButton from "./WaveProfileButton";
import { WaveBottomBar, WaveLoopCard } from "./WaveLoopCard";

type BeatTrack = {
  id: string; layer: WaveLayer; submission?: WaveSubmission; title: string; avatarUrl?: string;
  category: string; accent: string; meta: string;
};

/** Compact Beat list: base loop plus every layer approved by the public vote. */
export default function WaveEmptyPanel({ label, wave, avatarUrl, hostName, host, source = "live", disabled = false, volumeDisabled = disabled, execute, onReplacementOpened }: {
  label: "Beat" | "Vote"; wave?: WaveState; avatarUrl?: string; hostName?: string; disabled?: boolean; volumeDisabled?: boolean;
  execute?: (command: RoomToolsCommand) => Promise<unknown>;
  host?: RoomPerson; source?: "demo" | "live";
  onReplacementOpened?: () => void;
}) {
  const transport = useWaveTransport();
  const audio = useWaveTransportState();
  const [selectedId, setSelectedId] = useState("base");
  const [replacementLayerId, setReplacementLayerId] = useState<string | null>(null);
  const [gainDrafts, setGainDrafts] = useState<Record<string, number>>({});
  const pendingGains = useRef(new Map<string, { layerId: string; gain: number }>());
  const gainTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const gainChains = useRef(new Map<string, Promise<unknown>>());
  const draggingGains = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    const timers = gainTimers.current;
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);
  const base = label === "Beat" ? wave?.baseLoop : undefined;
  const hasBase = Boolean(base?.title && (base.mediaUrl || base.mediaPath));
  const tracks: BeatTrack[] = [];

  if (wave && base && hasBase) {
    const baseLayer = wave.layers.find(layer => layer.id === "base") ?? {
      id: "base", title: base.title, author: "Host", active: true, solo: false, muted: false,
    };
    tracks.push({ id: "base", layer: baseLayer, title: hostName ?? base.title, avatarUrl, category: "BASE · ARPÈGE",
      accent: "#a855f7", meta: `${base.bars} mesures · ${Math.round(base.bpm)} BPM` });
    wave.layers.filter(layer => layer.id !== "base" && layer.submissionId).forEach(layer => {
      const submission = wave.submissions.find(item => item.id === layer.submissionId);
      if (!submission) return;
      const category = WAVE_LOOP_CATEGORIES.find(item => item.id === waveSubmissionCategory(submission))!;
      tracks.push({ id: layer.id, layer, submission, title: submission.contributor.name,
        avatarUrl: submission.contributor.avatarUrl, category: category.badge, accent: category.color,
        meta: `${submission.bars} mesures · ${Math.round(submission.bpm)} BPM` });
    });
  }
  const selected = tracks.find(track => track.id === selectedId) ?? tracks[0];
  const soloActive = hasAudibleWaveSolo(tracks.map(track => track.layer));
  const selectTrack = async (track: BeatTrack) => {
    setSelectedId(track.id);
    if (!transport) return;
    if (track.submission) {
      // An accepted Beat layer becomes the candidate of the persistent player:
      // BOUCLE can isolate it and MIX can combine it with the reference Beat.
      await transport.select(track.submission);
    } else {
      // The base row is the reference itself, never a second copy of it. Treating
      // it as a candidate would double the same audio in MIX.
      await transport.select(null);
      transport.engine.setMode("beat");
    }
  };
  const updateLayer = (track: BeatTrack, patch: Partial<WaveLayer>) => {
    if (!execute) return;
    void execute({ type: "wave.sequence.layer", layerId: track.layer.id, patch });
  };
  const commitGain = (trackId: string) => {
    const timer = gainTimers.current.get(trackId);
    if (timer) clearTimeout(timer);
    gainTimers.current.delete(trackId);
    const pending = pendingGains.current.get(trackId);
    if (!pending || !execute) return;
    pendingGains.current.delete(trackId);
    const previous = gainChains.current.get(trackId) ?? Promise.resolve();
    // Serialize commits per layer. A delayed older request can therefore never
    // overwrite the most recent fader value on the server.
    const current = previous.catch(() => undefined).then(() => execute({
      type: "wave.sequence.layer", layerId: pending.layerId, patch: { gain: pending.gain },
    }));
    gainChains.current.set(trackId, current);
    void current.then(() => {
      if (gainChains.current.get(trackId) !== current) return;
      gainChains.current.delete(trackId);
      if (!mounted.current || pendingGains.current.has(trackId)) return;
      setGainDrafts((drafts) => {
        if (drafts[trackId] !== pending.gain) return drafts;
        const next = { ...drafts };
        delete next[trackId];
        return next;
      });
    }, () => {
      if (gainChains.current.get(trackId) === current) gainChains.current.delete(trackId);
      if (mounted.current && !pendingGains.current.has(trackId)) setGainDrafts((drafts) => {
        const next = { ...drafts };
        delete next[trackId];
        return next;
      });
    });
  };
  const previewGain = (track: BeatTrack, gain: number) => {
    setGainDrafts((drafts) => ({ ...drafts, [track.id]: gain }));
    transport?.engine.setLayerGain(track.submission?.id ?? "base", gain);
    pendingGains.current.set(track.id, { layerId: track.layer.id, gain });
    if (draggingGains.current.has(track.id)) return;
    const timer = gainTimers.current.get(track.id);
    if (timer) clearTimeout(timer);
    gainTimers.current.set(track.id, setTimeout(() => commitGain(track.id), 220));
  };

  return <div className={`room-tool-panel wave-sas wave-sas--premium wave-vote-queue${label === "Beat" ? " wave-base-queue wave-beat-queue" : ""}`}>
    <header className="wave-sas__header"><span><strong>{label}</strong></span><b>{tracks.length} / 12 pistes</b></header>
    <div className="wave-sas__queue">
      {tracks.map(track => {
        const audibleInBeat = isWaveLayerAudible(track.layer, soloActive);
        const isolatesCandidate = audio?.quickPreview || audio?.mode === "loop";
        const audible = isolatesCandidate
          ? Boolean(track.submission && audio?.candidate?.id === track.submission.id && audibleInBeat)
          : audibleInBeat;
        return <WaveLoopCard key={track.id} accent={track.accent} avatarUrl={track.avatarUrl}
        avatarFallback={track.title.charAt(0)} title={track.submission ? track.layer.title : track.title}
        category={track.category} meta={track.meta} selected={selected?.id === track.id}
        onSelect={() => { void selectTrack(track); }} showPlay={false}
        stateClassName={`${track.layer.muted ? "is-muted" : "is-enabled"}${track.layer.solo ? " is-solo" : ""}${audible ? " is-in-mix" : " is-out-of-mix"}`}
        disabled={disabled || !transport || !audio?.referenceId || audio.referenceLoading}
        onPlay={() => undefined}
        quickActions={<span className="wave-beat-card-controls">
          {track.submission ? <button type="button" className="wave-beat-card__replacement" title="Duel de remplacement" aria-label={`Duel de remplacement pour ${track.layer.title}`} disabled={disabled || !execute || wave?.submissions.some(item => item.vote?.open)} onClick={() => setReplacementLayerId(track.layer.id)}><Swords /></button> : null}
          <button type="button" className={track.layer.muted ? "is-active" : ""}
            aria-label={track.layer.muted ? `Rétablir ${track.title}` : `Couper ${track.title}`}
            aria-pressed={track.layer.muted} title={track.layer.muted ? "Réactiver" : "Mute"} disabled={disabled || !execute}
            onClick={() => updateLayer(track, { muted: !track.layer.muted })}>
            {track.layer.muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button type="button" className={track.layer.solo ? "is-active" : ""}
            aria-label={track.layer.solo ? `Quitter le solo de ${track.title}` : `Écouter ${track.title} en solo`}
            aria-pressed={track.layer.solo} title="Solo" disabled={disabled || !execute}
            onClick={() => updateLayer(track, { solo: !track.layer.solo, ...(!track.layer.solo ? { muted: false } : {}) })}>
            <Headphones />
          </button>
          <label className="wave-beat-card-controls__volume"><Volume2 /><input className="wave-vote-queue__volume"
            type="range" min={0} max={1} step={.01}
            style={{ "--volume-fill": `${(gainDrafts[track.id] ?? track.layer.gain ?? .82) * 100}%` } as CSSProperties}
            value={gainDrafts[track.id] ?? track.layer.gain ?? .82} aria-label={`Volume de ${track.title}`} disabled={volumeDisabled || !execute}
            onPointerDown={() => {
              draggingGains.current.add(track.id);
              const timer = gainTimers.current.get(track.id);
              if (timer) clearTimeout(timer);
              gainTimers.current.delete(track.id);
            }}
            onPointerUp={() => { draggingGains.current.delete(track.id); commitGain(track.id); }}
            onPointerCancel={() => { draggingGains.current.delete(track.id); commitGain(track.id); }}
            onBlur={() => { draggingGains.current.delete(track.id); commitGain(track.id); }}
            onKeyUp={() => commitGain(track.id)}
            onChange={event => previewGain(track, Number(event.currentTarget.value))} /></label>
        </span>} />;
      })}
    </div>
    <WaveBottomBar accent={selected?.accent ?? "#a855f7"} avatarUrl={selected?.avatarUrl}
      avatarFallback={selected?.title.charAt(0) ?? ""} title={selected?.title ?? label}
      category={selected?.category ?? ""} label={`Actions ${label}`}>
      <WaveProfileButton key={selected?.id} person={selected?.submission?.contributor ?? (selected?.id === "base" ? host : undefined)} source={source} />
    </WaveBottomBar>
    {replacementLayerId && wave && execute ? <WaveReplacementDialog wave={wave} layerId={replacementLayerId} disabled={disabled} execute={execute} onClose={() => setReplacementLayerId(null)} onStarted={onReplacementOpened} /> : null}
  </div>;
}
