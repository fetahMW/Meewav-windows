import { submissionAsset, useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import {
  ChevronDown,
  Download,
  FileAudio,
  Pause,
  Play,
  SquareCheckBig,
  TimerReset,
  Trash2,
  Upload,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import type { PlaceRoomState } from "../../place/place.types";
import type { RoomActorRole, RoomToolsCommand, WaveState, WaveSubmission } from "../roomTools.types";
import { uploadWaveAudienceFile, validateWaveAudienceFile } from "../audience/waveAudienceUpload.service";
import { readWaveSubmissionAudio, waveSubmissionMaxBars } from "../waveAudioRules";
import { waveSubmissionCategory } from "../waveLoopCategories";
import { EmptyState, ToolNotice } from "./RoomToolPanelPrimitives";
import { useWaveMediaUrl } from "./WaveFlutterPrimitives";
import { WaveListeningModeSelector } from "./WaveLoopCard";
import "./wave-vote-panel.css";

type ListeningMode = "solo" | "beat";
type VoteCategory = { badge: string; color: string };

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

const VOTE_CATEGORIES: Array<{ match: RegExp; category: VoteCategory }> = [
  { match: /bass|basse/i, category: { badge: "BASSE", color: "#ff8a1e" } },
  { match: /drum|perc|kick|snare|hat/i, category: { badge: "DRUMS", color: "#22e55b" } },
  { match: /m[eé]lod|synth|piano|guitare|pad/i, category: { badge: "MÉLODIE", color: "#a855f7" } },
  { match: /voix|vocal|acapella/i, category: { badge: "ACAPELLA", color: "#3b82f6" } },
];

function voteCategory(submission: WaveSubmission) {
  return VOTE_CATEGORIES.find(({ match }) => match.test(`${submission.instrument} ${submission.title}`))?.category
    ?? { badge: "AMBIANCE / FX", color: "#06b6d4" };
}

function canEnterPublicVote(wave: WaveState, submission: WaveSubmission) {
  return submission.rightsConfirmed
    && submission.bars <= waveSubmissionMaxBars(wave, waveSubmissionCategory(submission))
    && Math.abs(submission.bpm - wave.baseLoop.bpm) <= 2;
}

function contributorGrade(submission: WaveSubmission) {
  return (submission.contributor.id.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5) + 1;
}

function secondsRemaining(vote: WaveSubmission["vote"]) {
  if (!vote?.endsAt) return null;
  return Math.max(0, Math.ceil((new Date(vote.endsAt).getTime() - Date.now()) / 1_000));
}

function useSecondsLeft(vote: WaveSubmission["vote"]) {
  const [seconds, setSeconds] = useState<number | null>(() => secondsRemaining(vote));
  useEffect(() => {
    const update = () => setSeconds(secondsRemaining(vote));
    update();
    if (!vote?.open || !vote.endsAt) return;
    const timer = globalThis.setInterval(update, 500);
    return () => globalThis.clearInterval(timer);
  }, [vote]);
  return seconds;
}

function voteCounts(submission: WaveSubmission) {
  const vote = submission.vote;
  if (!vote) return { yes: 0, no: 0, total: 0 };
  const values = Object.values(vote.votes ?? {});
  const yes = vote.yesCount ?? values.filter((choice) => choice === "yes").length;
  const no = vote.noCount ?? values.filter((choice) => choice === "no").length;
  return { yes, no, total: vote.totalVotes ?? yes + no };
}

export type WaveOfficialPreview = {
  status: "processing" | "ready" | "failed";
  mediaUrl?: string | null;
  waveformPeaks?: readonly number[];
};

type WaveSequencerPanelProps = {
  wave: WaveState;
  role: RoomActorRole;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  source?: PlaceRoomState["source"];
  officialPreviews?: Readonly<Record<string, WaveOfficialPreview>>;
  roomId?: string;
  accountId?: string;
};

export default function WaveSequencerPanel({ wave, role, disabled, execute, source = "live", officialPreviews = {}, roomId = "demo-wave", accountId = "host" }: WaveSequencerPanelProps) {
  const hasControl = role === "host" || role === "regisseur";
  const openSubmission = wave.submissions.find((submission) => submission.vote?.open) ?? null;
  const latestFinalized = useMemo(() => wave.submissions
    .filter((submission) => submission.vote?.finalizedAt)
    .sort((left, right) => String(right.vote?.finalizedAt).localeCompare(String(left.vote?.finalizedAt)))[0] ?? null, [wave.submissions]);
  const ready = useMemo(() => wave.submissions.filter((submission) => submission.vote?.open
    || (submission.status === "analysis" && canEnterPublicVote(wave, submission))), [wave]);
  const queue = useMemo(() => !openSubmission && latestFinalized && !ready.some((submission) => submission.id === latestFinalized.id)
    ? [latestFinalized, ...ready]
    : ready, [latestFinalized, openSubmission, ready]);
  const [selectedId, setSelectedId] = useState(() => openSubmission?.id ?? ready[0]?.id ?? latestFinalized?.id ?? "");
  const selected = queue.find((submission) => submission.id === selectedId) ?? openSubmission ?? queue[0] ?? null;
  const transport = useWaveTransport();
  const transportState = useWaveTransportState();
  const [mode, setMode] = useState<ListeningMode>(() => selected?.vote?.listeningMode ?? "beat");
  const [duration, setDuration] = useState<30 | 45 | 60>(() => {
    const configured = selected?.vote?.durationSeconds;
    return configured && [30, 45, 60].includes(configured) ? configured as 30 | 45 | 60 : 30;
  });
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [candidateVolumes, setCandidateVolumes] = useState<Record<string, number>>({});
  const [playing, setPlaying] = useState(false);
  const [previewRequestId, setPreviewRequestId] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importArtist, setImportArtist] = useState("");
  const [importInstrument, setImportInstrument] = useState("Drums");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importRightsConfirmed, setImportRightsConfirmed] = useState(false);
  const [importing, setImporting] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const beatAudioRef = useRef<HTMLAudioElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const officialPreview = selected ? officialPreviews[selected.id] : undefined;
  const isAuthoritativePreviewReady = source === "demo" || officialPreview?.status === "ready";
  const previewMediaUrl = (source === "demo" ? selected?.mediaUrl : officialPreview?.mediaUrl) ?? undefined;
  const previewMediaPath = source === "demo" ? selected?.mediaPath : undefined;
  const { url: audioUrl, error: audioError } = useWaveMediaUrl(previewMediaUrl, previewMediaPath);
  const { url: beatAudioUrl } = useWaveMediaUrl(source === "demo" ? wave.baseLoop.mediaUrl : undefined, source === "demo" ? wave.baseLoop.mediaPath : undefined);
  useEffect(() => {
    if (!transport || !transportState?.candidate) return;
    if (queue.some(item => item.id === transportState.candidate!.id)) setSelectedId(transportState.candidate.id);
  }, [transportState?.candidate?.id, queue, transport?.engine]);
  useEffect(() => {
    if (!transport) return;
    transport.engine.setVoteEligibility(selected && audioUrl && selected.vote ? {
      asset: { ...submissionAsset(selected), url: audioUrl, path: undefined },
      open: selected.vote.open, ready: isAuthoritativePreviewReady, rightsConfirmed: selected.rightsConfirmed,
      lockedVersion: selected.vote.submissionVersion, mode: selected.vote.listeningMode ?? mode, preMixed: source !== "demo",
    } : null);
    return () => transport.engine.setVoteEligibility(null);
  }, [transport?.engine, selected?.id, selected?.version, selected?.vote?.open, selected?.vote?.submissionVersion, audioUrl, isAuthoritativePreviewReady, mode, source]);
  const secondsLeft = useSecondsLeft(selected?.vote);
  const voteOpen = Boolean(selected?.vote?.open);
  const voteLive = voteOpen && secondsLeft !== 0;
  const voteFinished = Boolean(selected?.vote && !selected.vote.open && selected.vote.finalizedAt);
  const counts = selected ? voteCounts(selected) : { yes: 0, no: 0, total: 0 };
  const yesPercent = counts.total ? Math.round((counts.yes / counts.total) * 100) : 0;
  const selectionLocked = Boolean(openSubmission);
  const selectedCategory = selected ? voteCategory(selected) : null;

  const stopPreview = () => {
    if (transport) return;
    audioRef.current?.pause();
    beatAudioRef.current?.pause();
    setPlaying(false);
  };

  const importCandidate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!importFile || !importArtist.trim() || !importRightsConfirmed || importing) return;
    setImporting(true);
    setPlaybackError("");
    let demoMediaUrl: string | undefined;
    try {
      const mimeType = validateWaveAudienceFile(importFile);
      const category = waveSubmissionCategory({ instrument: importInstrument, title: "" });
      const { durationSeconds, bars } = await readWaveSubmissionAudio(importFile, wave, category);
      const mediaPath = source === "live" ? await uploadWaveAudienceFile({ roomId, accountId, file: importFile }) : undefined;
      demoMediaUrl = source === "demo" ? URL.createObjectURL(importFile) : undefined;
      const submissionId = crypto.randomUUID();
      const artistName = importArtist.trim();
      await execute({ type: "wave.submission.add", submission: {
        id: submissionId,
        contributor: {
          id: `host-import:${artistName.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, "-")}`,
          name: artistName,
          avatarUrl: "",
          role: "Artiste",
          microphone: "off",
          camera: "off",
        },
        title: importFile.name.replace(/\.[^.]+$/, ""),
        instrument: importInstrument,
        category,
        bpm: wave.baseLoop.bpm,
        key: wave.baseLoop.key,
        bars,
        durationSeconds,
        fileName: importFile.name,
        fileSize: importFile.size,
        mimeType,
        mediaUrl: demoMediaUrl,
        mediaPath,
        submittedAt: new Date().toISOString(),
        status: "received",
        rightsConfirmed: true,
        version: 1,
        privateNotes: "Importée par le host depuis Vote du public.",
        creditPublic: true,
        versions: [{ version: 1, receivedAt: new Date().toISOString(), note: "Import host" }],
      } });
      await execute({ type: "wave.submission.status", submissionId, status: "analysis" });
      setSelectedId(submissionId);
      setImportOpen(false);
      setImportArtist("");
      setImportInstrument("Drums");
      setImportFile(null);
      setImportRightsConfirmed(false);
    } catch (error) {
      if (demoMediaUrl) URL.revokeObjectURL(demoMediaUrl);
      setPlaybackError(error instanceof Error && error.message === "wave_file_size_invalid" ? "25 Mo maximum." : "Utilisez WAV, MP3, AAC, FLAC ou M4A.");
    } finally {
      setImporting(false);
    }
  };

  const downloadCandidate = () => {
    if (!selected || !audioUrl) return;
    const anchor = document.createElement("a");
    anchor.href = audioUrl;
    anchor.download = selected.fileName ?? `${selected.contributor.name}-${voteCategory(selected).badge.toLocaleLowerCase("fr-FR")}.mp3`;
    anchor.click();
  };

  const removeCandidate = async () => {
    if (!selected || voteOpen) return;
    stopPreview();
    await execute({ type: "wave.submission.status", submissionId: selected.id, status: "rejected", reason: "other", feedback: "Retirée depuis le lanceur de vote" });
  };

  useEffect(() => {
    if (openSubmission?.id) setSelectedId(openSubmission.id);
  }, [openSubmission?.id]);

  useEffect(() => {
    stopPreview();
    setPlaybackError("");
    if (selected?.vote?.durationSeconds && [30, 45, 60].includes(selected.vote.durationSeconds)) setDuration(selected.vote.durationSeconds as 30 | 45 | 60);
    if (selected?.vote?.listeningMode) setMode(selected.vote.listeningMode);
  }, [selected?.id, selected?.vote?.durationSeconds, selected?.vote?.listeningMode]);

  useEffect(() => {
    if (transport || !previewRequestId || previewRequestId !== selected?.id || !audioUrl) return;
    setPreviewRequestId(null);
    const candidate = audioRef.current;
    if (!candidate) return;
    candidate.currentTime = 0;
    const start = async () => {
      try {
        if (mode === "beat" && source === "demo" && beatAudioRef.current && beatAudioUrl) {
          beatAudioRef.current.currentTime = 0;
          beatAudioRef.current.volume = 0.62;
          await Promise.all([beatAudioRef.current.play(), candidate.play()]);
        } else await candidate.play();
        setPlaybackError("");
        setPlaying(true);
      } catch {
        stopPreview();
        setPlaybackError("L’aperçu officiel ne peut pas être lu pour le moment.");
      }
    };
    void start();
  }, [audioUrl, beatAudioUrl, mode, previewRequestId, selected?.id, source]);

  useEffect(() => () => {
    audioRef.current?.pause();
    beatAudioRef.current?.pause();
  }, []);

  const selectCandidate = (submission: WaveSubmission) => {
    if (selectionLocked && openSubmission?.id !== submission.id) return;
    setSelectedId(submission.id);
    transport?.select(submission);
    void execute({ type: "wave.submission.select", submissionId: submission.id });
  };

  const selectMode = (nextMode: ListeningMode) => {
    stopPreview();
    setMode(nextMode);
  };

  const toggleAudio = async () => {
    if (transport) return;
    const candidate = audioRef.current;
    if (!candidate || !audioUrl) return;
    if (!candidate.paused) {
      stopPreview();
      return;
    }
    try {
      candidate.currentTime = 0;
      candidate.volume = (candidateVolumes[selected?.id ?? ""] ?? 82) / 100;
      if (mode === "beat" && source === "demo" && beatAudioRef.current && beatAudioUrl) {
        beatAudioRef.current.currentTime = 0;
        beatAudioRef.current.volume = 0.62;
        await Promise.all([beatAudioRef.current.play(), candidate.play()]);
      } else await candidate.play();
      setPlaybackError("");
      setPlaying(true);
    } catch {
      stopPreview();
      setPlaybackError("L’aperçu officiel ne peut pas être lu pour le moment.");
    }
  };

  const previewCandidate = (submission: WaveSubmission) => {
    if (transport) { selectCandidate(submission); return; }
    if (selectionLocked && openSubmission?.id !== submission.id) return;
    if (selected?.id === submission.id) {
      void toggleAudio();
      return;
    }
    stopPreview();
    setSelectedId(submission.id);
    setPreviewRequestId(submission.id);
    void execute({ type: "wave.submission.select", submissionId: submission.id });
  };

  const toggleVote = async () => {
    if (!selected) return;
    stopPreview();
    await execute(voteOpen
      ? { type: "wave.vote.open", submissionId: selected.id, open: false }
      : { type: "wave.vote.open", submissionId: selected.id, open: true, durationSeconds: duration, listeningMode: mode });
  };

  return <div className="room-tool-panel wave-public-vote wave-vote-inbox">
    {queue.length ? <div className="wave-vote-inbox__queue" aria-label="Candidates au vote">
      <div className="wave-vote-inbox__toolbar">
        <div className={`wave-vote-inbox__queue-head${voteLive ? " is-live" : voteFinished ? " is-final" : " is-idle"}`} role="status" aria-live="polite">
          <strong>{voteLive ? "VOTE EN DIRECT" : voteFinished ? "VERDICT OFFICIEL" : "VOTE PRÊT"}</strong>
          <span><b>{voteLive || voteFinished ? `${yesPercent}%` : "—"}</b><small>Validation</small></span>
          <span><b>{counts.total}</b><small>Vote{counts.total > 1 ? "s" : ""}</small></span>
          <span><b>{voteLive ? `${secondsLeft ?? duration} s` : voteFinished ? "Terminé" : `${duration} s`}</b><small>Chronomètre</small></span>
        </div>
        {hasControl ? <button type="button" className="wave-vote-inbox__import" aria-label="Importer une boucle" disabled={disabled || voteOpen} onClick={() => setImportOpen(true)}><Upload /><span>Importer<br />une boucle</span></button> : null}
      </div>
      {queue.map((submission) => {
        const category = voteCategory(submission);
        const active = selected?.id === submission.id;
        const lockedOut = selectionLocked && openSubmission?.id !== submission.id;
        const rowPreviewReady = source === "demo" || officialPreviews[submission.id]?.status === "ready";
        return <article key={submission.id} data-submission-id={submission.id} className={`wave-vote-row${active ? " is-selected" : ""}${submission.vote?.open ? " is-live" : ""}${lockedOut ? " is-locked" : ""}`} style={{ "--vote-category": category.color } as CSSProperties}>
          <button type="button" className="wave-vote-row__select" aria-label={`Sélectionner ${submission.contributor.name}`} aria-pressed={active} aria-controls="wave-vote-control-dock" disabled={lockedOut} onClick={() => selectCandidate(submission)}>
            <span className="wave-vote-row__avatar"><em>{submission.contributor.name.charAt(0)}</em>{submission.contributor.avatarUrl ? <img src={submission.contributor.avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span>
            <span className="wave-vote-row__identity"><strong>{submission.contributor.name}</strong><MeewavGradeBadge className="wave-vote-row__grade" level={contributorGrade(submission)} size="lg" variant="icon" labelMode="none" title={`Badge de ${submission.contributor.name}`} /></span>
            <span className="wave-vote-row__meta"><b>{category.badge}</b></span>
          </button>
          <label className="wave-vote-row__volume"><Volume2 /><input type="range" min={0} max={100} value={candidateVolumes[submission.id] ?? 82} aria-label={`Volume de ${submission.contributor.name}`} onChange={(event) => { const volume = Number(event.currentTarget.value); setCandidateVolumes((current) => ({ ...current, [submission.id]: volume })); if (active && audioRef.current) audioRef.current.volume = volume / 100; if (active) transport?.engine.setGain(volume / 100); }} /></label>
          {!transport ? <button type="button" className={`wave-vote-row__preview${active && playing ? " is-playing" : ""}`} aria-label={`${active && playing ? "Mettre en pause" : "Préécouter"} ${submission.contributor.name}`} title={active && playing ? "Pause" : "Préécouter"} disabled={lockedOut || !rowPreviewReady} onClick={() => previewCandidate(submission)}>{active && playing ? <Pause /> : <Play />}</button> : null}
        </article>;
      })}
    </div> : <EmptyState title="AUCUNE CANDIDATE">Les boucles envoyées depuis le Sas apparaîtront ici.</EmptyState>}

    {selected && selectedCategory ? <nav id="wave-vote-control-dock" className="wave-vote-dock" aria-label="Pilotage du vote public" aria-live="polite" style={{ "--candidate-category": selectedCategory.color } as CSSProperties}>
      <div className="wave-vote-dock__main">
        <section className="wave-vote-dock__identity" aria-label="Candidate sélectionnée">
          <span className="wave-vote-dock__avatar"><em>{selected.contributor.name.charAt(0)}</em>{selected.contributor.avatarUrl ? <img src={selected.contributor.avatarUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}</span>
          <span className="wave-vote-dock__candidate"><span className="wave-vote-dock__candidate-name"><strong>{selected.contributor.name}</strong><MeewavGradeBadge className="wave-vote-dock__grade" level={contributorGrade(selected)} size="sm" variant="icon" labelMode="none" title={`Badge de ${selected.contributor.name}`} /></span><b className="wave-vote-dock__category">{selectedCategory.badge}</b><small className="wave-vote-dock__technical">{selected.bpm} BPM · {formatDuration(selected.durationSeconds)}</small></span>
        </section>
        <WaveListeningModeSelector className="wave-vote-dock__mode" mode={mode} disabled={disabled || voteOpen || voteFinished} onChange={selectMode} soloLabel="Écoute officielle en solo" beatLabel="Écoute officielle avec le beat" />
        <div className="wave-vote-dock__tools">
          <div className={`wave-vote-dock__duration${durationMenuOpen ? " is-open" : ""}`}>
            <button type="button" aria-label="Durée du vote" aria-haspopup="listbox" aria-expanded={durationMenuOpen} disabled={disabled || voteOpen || voteFinished} onClick={() => setDurationMenuOpen((open) => !open)}><span>{duration} s</span><ChevronDown /></button>
            {durationMenuOpen ? <div className="wave-vote-dock__duration-menu" role="listbox" aria-label="Choisir la durée du vote">{([30, 45, 60] as const).map((seconds) => <button key={seconds} type="button" role="option" aria-selected={duration === seconds} onClick={() => { setDuration(seconds); setDurationMenuOpen(false); }}>{seconds} secondes</button>)}</div> : null}
          </div>
          <button type="button" className="is-download" aria-label={`Télécharger la boucle de ${selected.contributor.name}`} title="Télécharger la boucle" disabled={!audioUrl} onClick={downloadCandidate}><Download /></button>
          <button type="button" className="is-delete" aria-label="Supprimer la candidate" title="Supprimer la candidate" disabled={disabled || voteOpen || voteFinished} onClick={() => void removeCandidate()}><Trash2 /></button>
        </div>
      </div>
      <div className="wave-vote-dock__actions">
        {hasControl ? <button type="button" className={`wave-vote-dock__launch${voteOpen ? " is-live" : ""}`} aria-label={voteOpen ? "Clôturer et appliquer le verdict" : isAuthoritativePreviewReady ? "Lancer le vote" : "Aperçu officiel en préparation"} disabled={disabled || Boolean(openSubmission && openSubmission.id !== selected.id) || voteFinished || (!voteOpen && !isAuthoritativePreviewReady)} onClick={() => void toggleVote()}>{voteOpen ? <TimerReset /> : <SquareCheckBig />}<span><small>{voteOpen ? `${counts.total} VOTE${counts.total > 1 ? "S" : ""}` : `${duration} S · ${mode === "beat" ? "BEAT" : "SOLO"}`}</small><strong>{voteOpen ? "Clôturer" : isAuthoritativePreviewReady ? "Lancer le vote" : "Aperçu en préparation"}</strong></span></button> : <span className="wave-vote-dock__viewer"><UsersRound />Piloté par le host</span>}
      </div>
    </nav> : null}
    {!transport ? <audio className="wave-vote-audio-engine" ref={audioRef} src={audioUrl || undefined} preload="metadata" onEnded={() => { setPlaying(false); beatAudioRef.current?.pause(); }} /> : null}
    {!transport ? <audio className="wave-vote-audio-engine" ref={beatAudioRef} src={beatAudioUrl || undefined} preload="metadata" loop /> : null}

    {importOpen ? <div className="wave-vote-import-modal" role="presentation">
      <form role="dialog" aria-modal="true" aria-labelledby="wave-vote-import-title" onSubmit={importCandidate}>
        <header><span><Upload /><span><small>NOUVELLE CANDIDATE</small><strong id="wave-vote-import-title">Importer une boucle</strong></span></span><button type="button" aria-label="Fermer l’import" onClick={() => setImportOpen(false)}><X /></button></header>
        <button type="button" className={`wave-vote-import-modal__file${importFile ? " has-file" : ""}`} onClick={() => importInputRef.current?.click()}><FileAudio /><span><strong>{importFile?.name ?? "Choisir le fichier audio"}</strong><small>WAV, MP3, AAC, FLAC ou M4A · 25 Mo maximum</small></span></button>
        <input ref={importInputRef} hidden type="file" accept="audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/flac,.wav,.mp3,.m4a,.aac,.flac" onChange={(event) => { const file = event.currentTarget.files?.[0] ?? null; try { if (file) validateWaveAudienceFile(file); setImportFile(file); setPlaybackError(""); } catch { setImportFile(null); setPlaybackError("Utilisez WAV, MP3, AAC, FLAC ou M4A, 25 Mo maximum."); } }} />
        <div className="wave-vote-import-modal__fields"><label>Artiste<input value={importArtist} maxLength={60} placeholder="Nom de l’artiste" onChange={(event) => setImportArtist(event.currentTarget.value)} /></label><label>Type<select value={importInstrument} onChange={(event) => setImportInstrument(event.currentTarget.value)}><option>Drums</option><option>Basse</option><option>Mélodie</option><option>Acapella</option><option>Guitare</option><option>Ambiance / FX</option></select></label></div>
        <p><b>{wave.baseLoop.bpm} BPM</b><span>{wave.baseLoop.key}</span><span>{wave.baseLoop.bars} mesures</span></p>
        <label className="wave-vote-import-modal__rights"><input type="checkbox" checked={importRightsConfirmed} onChange={(event) => setImportRightsConfirmed(event.currentTarget.checked)} /> Je confirme que cette boucle peut être utilisée dans la Wave.</label>
        <footer><button type="button" onClick={() => setImportOpen(false)}>Annuler</button><button type="submit" className="is-primary" disabled={importing || !importFile || !importArtist.trim() || !importRightsConfirmed}><Upload />{importing ? "Import…" : "Ajouter au vote"}</button></footer>
      </form>
    </div> : null}

    {audioError || playbackError ? <ToolNotice tone="warning">{audioError || playbackError}</ToolNotice> : null}
    {source === "live" && selected && officialPreviews[selected.id]?.status === "failed" ? <ToolNotice tone="warning">L’aperçu officiel n’a pas pu être préparé. Le vote reste verrouillé.</ToolNotice> : null}
  </div>;
}
