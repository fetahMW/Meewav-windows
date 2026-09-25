import {
  Check,
  Archive,
  Square,
  SquareCheck,
  Download,
  FileAudio,
  MessageCircleMore,
  Ruler,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import { buildMessagingRoute, isMessagingUuid } from "../../../messaging/messaging.route";
import type { PlaceRoomState } from "../../place/place.types";
import { uploadWaveAudienceFile, validateWaveAudienceFile } from "../audience/waveAudienceUpload.service";
import { readWaveSubmissionAudio, waveSubmissionMaxBars } from "../waveAudioRules";
import type { RoomActorRole, RoomToolsCommand, WaveReviewReason, WaveState, WaveSubmission } from "../roomTools.types";
import { EmptyState, ToolNotice } from "./RoomToolPanelPrimitives";
import { useWaveMediaUrl } from "./WaveFlutterPrimitives";
import { submissionAsset, useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import { WaveBottomBar, WaveLoopCard } from "./WaveLoopCard";
import { downloadWaveSubmission, waveAttributedFileName } from "../waveQuarantine";
import "./wave-quarantine.css";
import WaveRejectButton from "./WaveRejectButton";
import WaveGateIntakeControl from "./WaveGateIntakeControl";
import { WAVE_LOOP_CATEGORIES as LOOP_CATEGORIES, waveSubmissionCategory as categoryFor } from "../waveLoopCategories";
import "../../place/place-mixer-play-finish.css";

type SubmissionTab = "received" | "rework" | "ready" | "rejected";
type ListeningMode = "solo" | "beat";
const GRADE_BY_CONTRIBUTOR: Record<string, number> = {
  "wave-a": 4,
  "wave-b": 5,
  "wave-c": 3,
};

type WaveGatePanelProps = {
  quarantine?: boolean;
  wave: WaveState;
  role: RoomActorRole;
  roomId: string;
  source: PlaceRoomState["source"];
  accountId: string;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
};

function gateTabFor(submission: WaveSubmission): SubmissionTab {
  if (submission.lifecycleStatus) {
    if (submission.lifecycleStatus === "NEEDS_CORRECTION") return "rework";
    if (submission.lifecycleStatus === "READY_FOR_VOTE") return "ready";
    if (submission.lifecycleStatus === "REJECTED" || submission.lifecycleStatus === "NOT_SELECTED") return "rejected";
    return "received";
  }
  if (submission.status === "rework") return "rework";
  if (submission.status === "analysis") return "ready";
  if (submission.status === "rejected") return "rejected";
  return "received";
}

export function contributorGrade(submission: WaveSubmission) {
  return GRADE_BY_CONTRIBUTOR[submission.contributor.id]
    ?? ((submission.contributor.id.split("").reduce((sum, character) => sum + character.charCodeAt(0), 0) % 5) + 1);
}

function canPreviewSubmission(submission: WaveSubmission) {
  return Boolean(submission.mediaUrl || submission.mediaPath);
}

export default function WaveGatePanel({ quarantine = false, wave, role, roomId, source, accountId, disabled, execute }: WaveGatePanelProps) {
  const transport = useWaveTransport();
  const transportState = useWaveTransportState();
  const navigate = useNavigate();
  const hasControl = role === "host" || role === "regisseur";
  const gateSubmissions = useMemo(
    () => wave.submissions.filter((submission) => {
      if (submission.vote?.open) return false;
      if (quarantine) return Boolean(submission.quarantined);
      if (submission.quarantined) return false;
      if (!submission.lifecycleStatus) return !["accepted", "analysis", "rejected"].includes(submission.status);
      return !["READY_FOR_VOTE", "ACCEPTED", "VOTING", "REJECTED", "NOT_SELECTED", "SUPERSEDED", "REMOVED"].includes(submission.lifecycleStatus);
    }),
    [wave.submissions, quarantine],
  );
  const activeFromState = gateSubmissions.find((submission) => submission.id === wave.activeSubmissionId);
  const visibleSubmissions = useMemo(() => {
    const lanes = LOOP_CATEGORIES.map(({ id }) => gateSubmissions.filter((submission) => categoryFor(submission) === id));
    const mixed: WaveSubmission[] = [];
    for (let index = 0; mixed.length < gateSubmissions.length; index += 1) {
      lanes.forEach((lane) => { if (lane[index]) mixed.push(lane[index]); });
    }
    return mixed;
  }, [gateSubmissions]);
  const [localSelectedId, setLocalSelectedId] = useState(() => activeFromState?.id ?? visibleSubmissions[0]?.id ?? "");
  const selectedId = transport ? transportState?.candidate?.id : localSelectedId;
  const setSelectedId = (id: string) => {
    setLocalSelectedId(id);
    if (transport) transport.select(visibleSubmissions.find(item => item.id === id) ?? null);
  };
  useEffect(() => {
    if (!transport) return;
    transport.setQueue(visibleSubmissions);
    const current = transport.engine.getSnapshot().candidate;
    if (current && !visibleSubmissions.some(item => item.id === current.id)) transport.select(null);
  }, [visibleSubmissions, transport?.engine, transport?.setQueue]);
  useEffect(() => {
    if (!transport || !selectedId) return;
    const index = visibleSubmissions.findIndex(item => item.id === selectedId);
    const next = visibleSubmissions[index + 1];
    if (next) transport.engine.preload(submissionAsset(next));
  }, [selectedId, visibleSubmissions, transport?.engine]);
  // Keep the floating actions visible on entry without loading or playing audio.
  const selected = gateSubmissions.find((submission) => submission.id === selectedId) ?? visibleSubmissions[0] ?? null;
  const [playing, setPlaying] = useState(false);
  const [listeningMode, setListeningMode] = useState<ListeningMode>("solo");
  const [pendingPlayback, setPendingPlayback] = useState<{ id: string; mode: ListeningMode; sourceKey: string } | null>(null);
  const [playbackError, setPlaybackError] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const workLock = useRef(false);
  const [workError, setWorkError] = useState("");
  const checked = visibleSubmissions.filter(item => checkedIds.includes(item.id));
  const runWork = async (action: () => Promise<void>) => {
    if (workLock.current || disabled) return;
    workLock.current = true; setWorking(true); setWorkError("");
    try { await action(); } catch (error) { setWorkError(error instanceof Error ? error.message.replace(/_/g, " ") : "Action indisponible. Réessaie."); }
    finally { workLock.current = false; setWorking(false); }
  };
  const moveToQuarantine = (items: WaveSubmission[]) => runWork(async () => {
    pausePreview();
    await execute({ type: "wave.submissions.quarantine", submissionIds: items.map(item => item.id) });
    setCheckedIds([]); setSelectionMode(false);
  });
  const removeFromQuarantine = (item: WaveSubmission) => runWork(async () => {
    pausePreview();
    await execute({ type: "wave.submission.status", submissionId: item.id, status: "rejected", reason: "other", feedback: "Cette version a été retirée de la sélection." });
  });
  const downloadSelection = (items: WaveSubmission[]) => runWork(async () => {
    for (const item of items) await downloadWaveSubmission(item);
  });
  const audioRef = useRef<HTMLAudioElement>(null);
  const beatAudioRef = useRef<HTMLAudioElement>(null);
  const selectedMediaUrl = selected?.mediaUrl;
  const selectedMediaPath = selected?.mediaPath;
  const { url: audioUrl, error: audioError, sourceKey: audioSourceKey } = useWaveMediaUrl(selectedMediaUrl, selectedMediaPath);
  const { url: beatAudioUrl } = useWaveMediaUrl(wave.baseLoop.mediaUrl, wave.baseLoop.mediaPath);
  const [versionOpen, setVersionOpen] = useState(false);
  const [versionFile, setVersionFile] = useState<File | null>(null);
  const [versionError, setVersionError] = useState("");
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [rulesDraft, setRulesDraft] = useState(() => ({
    bpm: String(wave.baseLoop.bpm),
    key: wave.baseLoop.key,
    bars: String(waveSubmissionMaxBars(wave)),
    kind: wave.baseLoop.kind,
  }));
  const queueRef = useRef<HTMLDivElement>(null);
  const knownSubmissionIdsRef = useRef(new Set(gateSubmissions.map((submission) => submission.id)));
  const previousQueueHeightRef = useRef(0);
  const submissionIdentity = gateSubmissions.map((submission) => submission.id).join("|");

  const pausePreview = () => {
    if (transport) {
      transport.stopQuickPreview();
      return;
    }
    audioRef.current?.pause();
    beatAudioRef.current?.pause();
    setPlaying(false);
    setPendingPlayback(null);
  };

  const messageContributor = (submission: WaveSubmission) => {
    const contributor = submission.contributor;
    const realProfile = isMessagingUuid(contributor.id);
    navigate(buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "rooms",
      mode: realProfile ? "real" : "demo",
      profileId: realProfile ? contributor.id : null,
      mockArtistId: realProfile ? null : contributor.id,
      mockArtistName: realProfile ? null : contributor.name,
      mockArtistRole: realProfile ? null : contributor.role,
      mockArtistAvatar: realProfile ? null : contributor.avatarUrl,
      mockArtistGradeLevel: realProfile ? null : contributorGrade(submission),
    }));
  };

  useLayoutEffect(() => {
    const queue = queueRef.current;
    if (!queue) return;
    const previousIds = knownSubmissionIdsRef.current;
    const additions = gateSubmissions.filter((submission) => !previousIds.has(submission.id)).length;
    const previousHeight = previousQueueHeightRef.current;
    if (additions > 0) {
      if (previousHeight > 0 && queue.scrollTop > 8) queue.scrollTop += Math.max(0, queue.scrollHeight - previousHeight);
    }
    knownSubmissionIdsRef.current = new Set(gateSubmissions.map((submission) => submission.id));
    previousQueueHeightRef.current = queue.scrollHeight;
  }, [gateSubmissions, submissionIdentity]);

  const advanceAfter = (submissionId: string) => {
    const currentIndex = visibleSubmissions.findIndex((submission) => submission.id === submissionId);
    const next = visibleSubmissions[currentIndex + 1] ?? visibleSubmissions[currentIndex - 1];
    setSelectedId(next?.id ?? "");
  };

  useEffect(() => {
    audioRef.current?.pause();
    beatAudioRef.current?.pause();
    setPlaying(false);
    setPlaybackError("");
  }, [selected?.id]);

  useEffect(() => {
    if (transport || !pendingPlayback || pendingPlayback.id !== selected?.id || pendingPlayback.sourceKey !== audioSourceKey || !audioUrl) return;
    const candidate = audioRef.current;
    if (!candidate) return;
    candidate.currentTime = 0;
    const start = async () => {
      try {
        if (pendingPlayback.mode === "beat" && beatAudioRef.current && beatAudioUrl) {
          beatAudioRef.current.currentTime = 0;
          beatAudioRef.current.volume = 0.62;
          await Promise.all([beatAudioRef.current.play(), candidate.play()]);
        } else {
          await candidate.play();
        }
        setPlaybackError("");
        setPlaying(true);
      } catch {
        candidate.pause();
        beatAudioRef.current?.pause();
        setPlaying(false);
        setPlaybackError("Cette boucle ne peut pas être lue pour le moment.");
      } finally {
        setPendingPlayback(null);
      }
    };
    void start();
  }, [audioSourceKey, audioUrl, beatAudioUrl, pendingPlayback, selected?.id]);

  useEffect(() => {
    const candidate = audioRef.current;
    const beat = beatAudioRef.current;
    return () => {
      candidate?.pause();
      beat?.pause();
    };
  }, []);

  const queuePreview = (submission: WaveSubmission, mode: ListeningMode) => {
    pausePreview();
    setPlaybackError("");
    setSelectedId(submission.id);
    setListeningMode(mode);
    setPendingPlayback({
      id: submission.id,
      mode,
      sourceKey: `${submission.mediaUrl ?? ""}|${submission.mediaPath ?? ""}`,
    });
    void execute({ type: "wave.submission.select", submissionId: submission.id });
  };

  const startPreview = (submission: WaveSubmission, mode: ListeningMode) => {
    if (transport) {
      transport.quickPreview(submission);
      return;
    }
    if (playing && selected?.id === submission.id && listeningMode === mode) {
      pausePreview();
      return;
    }
    queuePreview(submission, mode);
  };

  const finishPreview = () => {
    setPlaying(false);
    beatAudioRef.current?.pause();
  };

  const openRules = () => {
    setRulesDraft({
      bpm: String(wave.baseLoop.bpm),
      key: wave.baseLoop.key,
      bars: String(waveSubmissionMaxBars(wave)),
      kind: wave.baseLoop.kind,
    });
    setRulesError("");
    setRulesOpen(true);
  };

  const saveRules = async () => {
    const bpm = Number(rulesDraft.bpm);
    const bars = Number(rulesDraft.bars) as 4 | 8 | 16;
    if (!Number.isFinite(bpm) || bpm < 40 || bpm > 260 || ![4, 8, 16].includes(bars) || !rulesDraft.key.trim() || !rulesDraft.kind.trim()) {
      setRulesError("Indiquez un BPM entre 40 et 260, une gamme, un type et 4, 8 ou 16 mesures.");
      return;
    }
    try {
      await execute({ type: "wave.rules.update", patch: { bpm, bars, key: rulesDraft.key.trim(), kind: rulesDraft.kind.trim() } });
      setRulesOpen(false);
    } catch {
      setRulesError("Les nouvelles règles n’ont pas été enregistrées.");
    }
  };

  const markReady = async (submission: WaveSubmission) => {
    pausePreview();
    await execute({ type: "wave.submission.status", submissionId: submission.id, status: "analysis" });
    advanceAfter(submission.id);
  };

  const requestDownload = (submission: WaveSubmission) => { void downloadSelection([submission]); };

  const rejectSubmission = async (submission: WaveSubmission, reason: WaveReviewReason, feedback: string) => {
    pausePreview();
    await execute({ type: "wave.submission.status", submissionId: submission.id, status: "rejected", reason, feedback });
    advanceAfter(submission.id);
  };

  const chooseVersion = (file: File | undefined) => {
    if (!file) return;
    try {
      validateWaveAudienceFile(file);
      setVersionFile(file);
      setVersionError("");
    } catch (error) {
      setVersionFile(null);
      setVersionError(error instanceof Error && error.message === "wave_file_size_invalid"
        ? "25 Mo maximum."
        : "Utilisez WAV, MP3, AAC, FLAC ou M4A.");
    }
  };

  const injectVersion = async () => {
    if (!selected || !versionFile || uploadLock.current) return;
    uploadLock.current = true;
    let localUrl: string | undefined;
    setUploading(true);
    setVersionError("");
    try {
      const mimeType = validateWaveAudienceFile(versionFile);
      const { durationSeconds, bars } = await readWaveSubmissionAudio(versionFile, wave, categoryFor(selected));
      const mediaPath = source === "live" ? await uploadWaveAudienceFile({ roomId, accountId, file: new File([versionFile], waveAttributedFileName(selected, versionFile.name, selected.version + 1), { type: versionFile.type }) }) : undefined;
      const mediaUrl = source === "demo" ? URL.createObjectURL(versionFile) : undefined;
      localUrl = mediaUrl;
      await execute({
        type: "wave.submission.version",
        submissionId: selected.id,
        note: "Version retravaillée par le host",
        patch: {
          fileName: waveAttributedFileName(selected, versionFile.name, selected.version + 1),
          fileSize: versionFile.size,
          mimeType,
          mediaUrl,
          mediaPath,
          bpm: wave.baseLoop.bpm,
          key: wave.baseLoop.key,
          bars,
          durationSeconds,
        },
      });
      localUrl = undefined;
      setVersionFile(null);
      setVersionOpen(false);
    } catch (error) {
      setVersionError(error instanceof Error ? error.message.replace(/_/g, " ") : "La nouvelle version n’a pas été réinjectée.");
    } finally {
      if (localUrl) URL.revokeObjectURL(localUrl);
      uploadLock.current = false;
      setUploading(false);
    }
  };

  if (!hasControl) {
    return <div className={`room-tool-panel is-wave-gate wave-sas wave-sas--premium${quarantine ? " is-quarantine" : ""}`}>
      <header className="wave-sas__header">
        <span><strong>{quarantine ? "Quarantaine" : "Sas des boucles"}</strong><small>File privée réservée au host</small></span>
        <b>{gateSubmissions.length} boucles</b>
      </header>
      <EmptyState title="Sas réservé au host">Proposez votre boucle depuis les interactions de la Wave.</EmptyState>
    </div>;
  }

  return <div className={`room-tool-panel is-wave-gate wave-sas wave-sas--premium${quarantine ? " is-quarantine" : ""}`}>
    <header className="wave-sas__header">
      <span>
        <strong>{quarantine ? "Quarantaine" : "Sas des boucles"}</strong>
      </span>
      <div className="wave-sas__header-actions">
        {!quarantine ? <><button type="button" className="wave-sas__rules-trigger" aria-label="Règles" onClick={openRules}><Ruler /><span>Règles</span></button>
        <WaveGateIntakeControl wave={wave} disabled={disabled} execute={execute} /></> : null}
        <b>{gateSubmissions.length} boucles</b>
      </div>
    </header>

    {quarantine ? <p className="wave-quarantine__hint">Retouche les fichiers dans ton logiciel, puis remplace-les ici. Le crédit de l’artiste est conservé.</p> : null}
    <div className="wave-quarantine__toolbar">
      <button type="button" aria-pressed={selectionMode} disabled={disabled || working} onClick={() => { setSelectionMode(!selectionMode); setCheckedIds([]); }}>{selectionMode ? "Annuler la sélection" : "Sélection multiple"}</button>
      {selectionMode ? <>
        <button type="button" disabled={disabled || working || !visibleSubmissions.length} onClick={() => setCheckedIds(checked.length === visibleSubmissions.length ? [] : visibleSubmissions.map(item => item.id))}>{checked.length === visibleSubmissions.length && checked.length ? "Tout désélectionner" : "Tout sélectionner"}</button>
        <button type="button" disabled={disabled || working || !checked.length} onClick={() => void (quarantine ? downloadSelection(checked) : moveToQuarantine(checked))}>{quarantine ? <Download /> : <Archive />}{quarantine ? "Télécharger" : "Quarantaine"} ({checked.length})</button>
      </> : null}
    </div>
    {workError ? <p className="wave-quarantine__error" role="alert">{workError}</p> : null}
    <div
      id="wave-sas-queue"
      className="wave-sas__queue"
      ref={queueRef}
      role="region"
      aria-label={quarantine ? "Boucles en quarantaine" : "Boucles reçues dans le Sas"}
    >
      {visibleSubmissions.map((submission) => {
        const tab = gateTabFor(submission);
        const category = LOOP_CATEGORIES.find((item) => item.id === categoryFor(submission)) ?? LOOP_CATEGORIES[4];
        const isSelected = selected?.id === submission.id;
        const isListening = isSelected && (transport ? transportState?.quickPreview && transportState.playing : playing);
        const canPreview = canPreviewSubmission(submission);
        return <WaveLoopCard
          key={submission.id}
          stateClassName={quarantine ? "is-quarantine" : "is-gate"}
          accent={category.color}
          avatarUrl={submission.contributor.avatarUrl}
          avatarFallback={submission.contributor.name.charAt(0)}
          title={submission.contributor.name}
          selectionLabel={`Sélectionner ${submission.title} de ${submission.contributor.name}`}
          grade={<MeewavGradeBadge
                  className="wave-sas-card__grade"
                  level={contributorGrade(submission)}
                  size="xl"
                  variant="icon"
                  labelMode="none"
                  title={`Badge de ${submission.contributor.name}`}
                />}
          category={category.badge}
          meta={`${submission.bars} mesures · ${Math.round(submission.bpm)} BPM`}
          selected={isSelected}
          playing={Boolean(isListening && (transport || listeningMode === "solo"))}
          disabled={disabled || !canPreview}
          onSelect={() => setSelectedId(submission.id)}
          onPlay={() => startPreview(submission, "solo")}
          selectOnPlay={false}
          beforeCategoryAction={selectionMode ? <button type="button" role="checkbox" aria-checked={checkedIds.includes(submission.id)} aria-label={`Sélection multiple : ${submission.title}`} disabled={disabled || working} onClick={() => setCheckedIds(ids => ids.includes(submission.id) ? ids.filter(id => id !== submission.id) : [...ids, submission.id])}>{checkedIds.includes(submission.id) ? <SquareCheck /> : <Square />}</button> : quarantine ? undefined : <>
            <button type="button" className="wave-sas-card__quick-accept" aria-label={`Valider ${submission.title}`} disabled={disabled || tab === "ready" || tab === "rejected" || !submission.rightsConfirmed} onClick={() => void markReady(submission)}><Check /></button>
            <button type="button" className="wave-sas-card__quick-quarantine" aria-label={`Mettre ${submission.title} en quarantaine`} disabled={disabled || working} onClick={() => void moveToQuarantine([submission])}><Archive /></button>
          </>}
          quickActions={quarantine ? <>
            <button type="button" aria-label={`Télécharger ${submission.title}`} disabled={disabled || working || !canPreview} onClick={() => requestDownload(submission)}><Download /></button>
            <button type="button" className="wave-sas-card__replace" aria-label={`Remplacer ${submission.title}`} disabled={disabled || working} onClick={() => { setSelectedId(submission.id); setVersionFile(null); setVersionError(""); setVersionOpen(true); }}>Remplacer</button>
            <button type="button" className="wave-sas-card__remove" aria-label={`Retirer ${submission.title} de la quarantaine`} disabled={disabled || working} onClick={() => void removeFromQuarantine(submission)}><X /></button>
          </> : <>
            <WaveRejectButton className="wave-sas-card__quick-reject" title={submission.title}
              disabled={disabled || tab === "rejected"} onReject={(reason, feedback) => rejectSubmission(submission, reason, feedback)} />
          </>}
        />;
      })}
      {!visibleSubmissions.length ? <p className="wave-sas__empty">Aucune boucle dans cet état.</p> : null}
    </div>

    {selected ? (() => { const category = LOOP_CATEGORIES.find((item) => item.id === categoryFor(selected)) ?? LOOP_CATEGORIES[4]; const tab = gateTabFor(selected); const canPreview = canPreviewSubmission(selected); return <WaveBottomBar accent={category.color} avatarUrl={selected.contributor.avatarUrl} avatarFallback={selected.contributor.name.charAt(0)} title={selected.contributor.name} category={category.badge} label={`Actions pour ${selected.contributor.name}`}>
      <button type="button" aria-label={`Télécharger ${selected.title}`} disabled={disabled || working || !canPreview} onClick={() => requestDownload(selected)}><Download /></button>
      {quarantine ? <>
        <button type="button" className="wave-quarantine-dock__replace" aria-label={`Remplacer ${selected.title}`} disabled={disabled || working || uploading} onClick={() => { setVersionFile(null); setVersionError(""); setVersionOpen(true); }}>Remplacer</button>
        <button type="button" className="is-validate wave-quarantine-dock__vote" aria-label={`Envoyer ${selected.title} au vote`} disabled={disabled || working || uploading || !selected.rightsConfirmed || !canPreview} onClick={() => void runWork(() => markReady(selected))}>Au vote</button>
      </> : <>
      <button type="button" aria-label={`Envoyer un message à ${selected.contributor.name}`} onClick={() => messageContributor(selected)}><MessageCircleMore /></button>
      <button type="button" className="is-validate" aria-label={`Valider ${selected.title}`} disabled={disabled || tab === "ready" || tab === "rejected" || !selected.rightsConfirmed} onClick={() => void markReady(selected)}><Check /></button>
      <WaveRejectButton key={selected.id} className="is-danger" title={selected.title} disabled={disabled || tab === "rejected"} onReject={(reason, feedback) => rejectSubmission(selected, reason, feedback)} />
      </>}
    </WaveBottomBar>; })() : null}

    {!transport ? <><audio
      ref={audioRef}
      src={audioUrl || undefined}
      preload="metadata"
      onEnded={finishPreview}
    />
    <audio ref={beatAudioRef} src={beatAudioUrl || undefined} preload="metadata" /></> : null}
    {audioError || playbackError ? <ToolNotice tone="warning">{audioError || playbackError}</ToolNotice> : null}

    {rulesOpen ? <div className="wave-sas-modal" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="wave-sas-rules-title">
        <header>
          <span><Ruler /><strong id="wave-sas-rules-title">Règles de la Wave</strong></span>
          <button type="button" aria-label="Fermer" onClick={() => setRulesOpen(false)}><X /></button>
        </header>
        <p>Les changements deviennent immédiatement visibles par les viewers et s’appliquent aux prochaines propositions.</p>
        <div className="wave-sas-modal__rules-grid">
          <label>BPM<input type="number" min="40" max="260" inputMode="numeric" value={rulesDraft.bpm} onChange={(event) => { const bpm = event.currentTarget.value; setRulesDraft((draft) => ({ ...draft, bpm })); }} /></label>
          <label>Mesures<select value={rulesDraft.bars} onChange={(event) => { const bars = event.currentTarget.value; setRulesDraft((draft) => ({ ...draft, bars })); }}><option value="4">4 mesures</option><option value="8">8 mesures</option><option value="16">16 mesures</option></select></label>
          <label>Gamme<input maxLength={40} value={rulesDraft.key} onChange={(event) => { const key = event.currentTarget.value; setRulesDraft((draft) => ({ ...draft, key })); }} /></label>
          <label>Direction recherchée<input maxLength={50} value={rulesDraft.kind} onChange={(event) => { const kind = event.currentTarget.value; setRulesDraft((draft) => ({ ...draft, kind })); }} /></label>
        </div>
        <small className="wave-sas-modal__rules-note">4 / 4 · WAV, MP3, AAC, FLAC ou M4A · 25 Mo max.</small>
        {rulesError ? <p className="is-error">{rulesError}</p> : null}
        <footer>
          <button type="button" onClick={() => setRulesOpen(false)}>Annuler</button>
          <button type="button" className="is-primary" disabled={disabled} onClick={() => void saveRules()}>Enregistrer les règles</button>
        </footer>
      </section>
    </div> : null}

    {versionOpen && selected ? <div className="wave-sas-modal" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="wave-sas-version-title">
        <header>
          <span><FileAudio /><strong id="wave-sas-version-title">Remplacer le fichier</strong></span>
          <button type="button" aria-label="Fermer" disabled={uploading} onClick={() => setVersionOpen(false)}><X /></button>
        </header>
        <p>Le fichier original et le crédit de {selected.contributor.name} restent intacts.</p>
        <label className="wave-sas-modal__file">
          <Upload />
          <span><strong>{versionFile?.name ?? "Choisir le fichier"}</strong><small>WAV, MP3, AAC, FLAC ou M4A · 25 Mo max.</small></span>
          <input type="file" accept="audio/wav,audio/mpeg,audio/aac,audio/flac,audio/mp4,audio/x-m4a,.wav,.mp3,.aac,.flac,.m4a" disabled={disabled} onChange={(event) => chooseVersion(event.currentTarget.files?.[0])} />
        </label>
        {versionFile ? <p className="wave-quarantine__hint">Nom du fichier : {waveAttributedFileName(selected, versionFile.name, selected.version + 1)}</p> : null}
        {versionError ? <p className="is-error">{versionError}</p> : null}
        <footer>
          <button type="button" disabled={uploading} onClick={() => setVersionOpen(false)}>Annuler</button>
          <button type="button" className="is-primary" disabled={disabled || uploading || !versionFile} onClick={() => void injectVersion()}>{uploading ? "Remplacement…" : "Remplacer"}</button>
        </footer>
      </section>
    </div> : null}
  </div>;
}
