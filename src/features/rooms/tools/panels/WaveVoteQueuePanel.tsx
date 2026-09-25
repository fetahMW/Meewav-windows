import { ChevronDown, Download, MessageCircleMore } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { MeewavGradeBadge } from "../../../grades/MeewavGradeBadge";
import { buildMessagingRoute, isMessagingUuid } from "../../../messaging/messaging.route";
import { submissionAsset, useWaveTransport, useWaveTransportState } from "../../wave-transport/WaveTransportProvider";
import { signedWaveAudienceUrl } from "../audience/waveAudienceUpload.service";
import type { RoomActorRole, RoomToolsCommand, WaveState, WaveSubmission } from "../roomTools.types";
import { WAVE_LOOP_CATEGORIES, waveSubmissionCategory } from "../waveLoopCategories";
import { contributorGrade } from "./WaveGatePanel";
import { WaveBottomBar, WaveLoopCard } from "./WaveLoopCard";
import { useWaveMediaUrl } from "./WaveFlutterPrimitives";

export default function WaveVoteQueuePanel({ wave, role, disabled, execute, source }: {
  wave: WaveState; role: RoomActorRole; disabled: boolean;
  source: "demo" | "live";
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  const transport = useWaveTransport();
  const audio = useWaveTransportState();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [duration, setDuration] = useState<2 | 30 | 45 | 60>(2);
  const [durationMenuOpen, setDurationMenuOpen] = useState(false);
  const [now, setNow] = useState(Date.now);
  const [localVoteEndsAt, setLocalVoteEndsAt] = useState<number | null>(null);
  const [lastVerdictId, setLastVerdictId] = useState<string | null>(null);
  const closingVoteRef = useRef(false);
  const ready = wave.submissions.filter(item => item.vote?.open || (item.lifecycleStatus
    ? item.lifecycleStatus === "READY_FOR_VOTE" : item.status === "analysis"));
  // A finalized candidate belongs to Beat (accepted) or leaves the voting
  // queue (rejected). Keeping it here made the validated card replace the
  // next candidate after the countdown.
  const queue = ready;
  const openSubmission = queue.find(item => item.vote?.open);
  const selected = openSubmission ?? queue.find(item => item.id === selectedId) ?? queue[0];
  const locked = disabled || pending || !["host", "regisseur"].includes(role);
  const voteOpen = Boolean(selected?.vote?.open);
  const voteRunning = voteOpen || Boolean(localVoteEndsAt && localVoteEndsAt > now);
  const voteFinished = Boolean(selected?.vote?.finalizedAt && !voteOpen);
  const lastVerdict = lastVerdictId ? wave.submissions.find(item => item.id === lastVerdictId) : undefined;
  const boardSubmission = voteRunning ? selected : lastVerdict ?? selected;
  const boardFinished = Boolean(!voteRunning && boardSubmission?.vote?.finalizedAt);
  const mode: "solo" | "beat" = audio?.mode === "loop" ? "solo" : "beat";
  const { url: previewUrl } = useWaveMediaUrl(selected?.mediaUrl, selected?.mediaPath);
  // Live voting must wait for an authoritative derivative, as in the old panel.
  const previewReady = source === "demo" && Boolean(previewUrl);
  useEffect(() => {
    if (!voteRunning) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [voteRunning, selected?.vote?.endsAt]);
  useEffect(() => {
    if (!transport) return;
    transport.engine.setVoteEligibility(selected?.vote && previewUrl ? {
      asset: { ...submissionAsset(selected), url: previewUrl, path: undefined },
      open: selected.vote.open, ready: previewReady, rightsConfirmed: selected.rightsConfirmed,
      lockedVersion: selected.vote.submissionVersion, mode: selected.vote.listeningMode ?? mode, preMixed: false,
    } : null);
    return () => transport.engine.setVoteEligibility(null);
  }, [transport, selected, previewUrl, previewReady, mode]);
  useEffect(() => {
    if (!transport || !selected || voteOpen) return;
    transport.engine.setGain(volumes[selected.id] ?? .75);
    void transport.select(selected);
  }, [selected, transport, voteOpen, volumes]);
  const votes = Object.values(boardSubmission?.vote?.votes ?? {});
  const total = boardSubmission?.vote?.totalVotes ?? votes.length;
  const yes = boardSubmission?.vote?.yesCount ?? votes.filter(choice => choice === "yes").length;
  const no = boardSubmission?.vote?.noCount ?? votes.filter(choice => choice === "no").length;
  const yesPercent = boardSubmission?.vote?.weightedApprovalPercent ?? (total ? Math.round(yes / total * 100) : 0);
  const noPercent = total ? 100 - yesPercent : 0;
  const effectiveEndsAt = selected?.vote?.endsAt ? Date.parse(selected.vote.endsAt) : localVoteEndsAt;
  const seconds = effectiveEndsAt ? Math.max(0, Math.ceil((effectiveEndsAt - now) / 1000)) : duration;
  useEffect(() => {
    if (!voteOpen || seconds > 0 || pending || closingVoteRef.current || !selected) return;
    closingVoteRef.current = true;
    void execute({ type: "wave.vote.open", submissionId: selected.id, open: false })
      .then(() => setLastVerdictId(selected.id))
      .catch(() => setError("Le vote n’a pas pu être clôturé automatiquement."))
      .finally(() => { closingVoteRef.current = false; setLocalVoteEndsAt(null); });
  }, [execute, pending, seconds, selected, voteOpen]);
  const categoryFor = (item: WaveSubmission) => WAVE_LOOP_CATEGORIES.find(category => category.id === waveSubmissionCategory(item))!;
  const download = async () => {
    if (!selected) return;
    try {
      const url = selected.mediaUrl || (selected.mediaPath ? await signedWaveAudienceUrl(selected.mediaPath) : "");
      if (!url) return;
      const anchor = document.createElement("a"); anchor.href = url;
      anchor.download = selected.fileName ?? `${selected.title}.wav`; anchor.click();
    } catch { setError("Téléchargement indisponible."); }
  };
  const message = () => {
    if (!selected) return;
    const person = selected.contributor; const real = isMessagingUuid(person.id);
    navigate(buildMessagingRoute({ space: "messages", intent: "message", source: "rooms", mode: real ? "real" : "demo",
      profileId: real ? person.id : null, mockArtistId: real ? null : person.id,
      mockArtistName: real ? null : person.name, mockArtistRole: real ? null : person.role,
      mockArtistAvatar: real ? null : person.avatarUrl, mockArtistGradeLevel: real ? null : contributorGrade(selected) }));
  };
  const vote = async () => {
    if (!selected || locked || (!voteOpen && !previewReady)) return;
    setPending(true); setError("");
    try {
      transport?.stopQuickPreview();
      if (!voteOpen) { setLastVerdictId(null); setNow(Date.now()); setLocalVoteEndsAt(Date.now() + duration * 1_000); }
      await execute({ type: "wave.vote.open", submissionId: selected.id, open: !selected.vote?.open,
        durationSeconds: duration, listeningMode: mode });
      if (voteOpen) { setLastVerdictId(selected.id); setLocalVoteEndsAt(null); }
    } catch { setLocalVoteEndsAt(null); setError("Impossible de modifier le vote pour le moment."); }
    finally { setPending(false); }
  };
  const removeFromVote = async () => {
    if (!selected || locked || voteOpen || voteFinished) return;
    transport?.stopQuickPreview();
    setPending(true); setError("");
    try {
      await execute({ type: "wave.submission.status", submissionId: selected.id, status: "to-review" });
      setSelectedId(null);
    } catch { setError("Impossible de retirer cette boucle du vote."); }
    finally { setPending(false); }
  };
  return <div className="room-tool-panel wave-sas wave-sas--premium wave-vote-queue">
    <header className={`wave-vote-queue__board${voteRunning ? " is-live" : boardFinished ? " is-finished" : " is-ready"}`} aria-live="polite">
      <span className="wave-vote-queue__board-state"><i />{voteRunning ? "VOTE EN DIRECT" : boardFinished ? "VERDICT DU PUBLIC" : selected ? "PRÊT À LANCER" : "EN ATTENTE"}</span>
      <span className="wave-vote-queue__clock"><strong>{voteRunning ? `${seconds}` : boardFinished ? `${yesPercent}%` : "—"}</strong><small>{voteRunning ? "secondes" : boardFinished ? "acceptent" : "chronomètre"}</small></span>
      <span className="wave-vote-queue__total"><strong>{total}</strong><small>votes reçus</small></span>
      <span className="wave-vote-queue__split">
        <span className="is-for"><strong>{voteRunning || boardFinished ? `${yesPercent}%` : "—"}</strong><small>pour</small></span>
        <span className="is-against"><strong>{voteRunning || boardFinished ? `${noPercent}%` : "—"}</strong><small>contre</small></span>
      </span>
      <b className={boardFinished ? boardSubmission?.vote?.outcome === "accepted" ? "is-accepted" : "is-rejected" : ""}>{boardFinished ? (boardSubmission?.vote?.outcome === "accepted" ? "BEAT VALIDÉ" : "BEAT REFUSÉ") : voteRunning ? "LE PUBLIC DÉCIDE" : "SÉLECTIONNEZ UNE BOUCLE"}</b>
    </header>
    <div className="wave-sas__queue" role="region" aria-label="Boucles validées pour le vote">
      {queue.map(item => {
        const category = categoryFor(item);
        return <WaveLoopCard key={item.id} accent={category.color} avatarUrl={item.contributor.avatarUrl}
          avatarFallback={item.contributor.name.charAt(0)} title={item.contributor.name} detail={item.title}
          grade={<MeewavGradeBadge className="wave-sas-card__grade" level={contributorGrade(item)} size="xl" variant="icon" labelMode="none" />}
          category={category.badge} meta={`${item.bars} mesures · ${Math.round(item.bpm)} BPM`}
          selected={selected?.id === item.id} onSelect={() => { if (!voteOpen) setSelectedId(item.id); }}
          playing={Boolean(audio?.playing && audio.quickPreview && audio.candidate?.id === item.id)}
          disabled={locked || voteOpen || !transport || !(item.mediaUrl || item.mediaPath)} selectOnPlay={false}
          onPlay={() => { setSelectedId(item.id); transport?.engine.setGain(volumes[item.id] ?? .75); transport?.quickPreview(item); }}
          quickActions={<input className="wave-vote-queue__volume" type="range" min={0} max={1} step={.01}
            style={{ "--volume-fill": `${(volumes[item.id] ?? .75) * 100}%` } as CSSProperties}
            aria-label={`Volume de ${item.title}`} value={volumes[item.id] ?? .75} disabled={locked || voteOpen}
            onChange={event => { const gain = Number(event.currentTarget.value); setVolumes(current => ({ ...current, [item.id]: gain }));
              if (audio?.candidate?.id === item.id) transport?.engine.setGain(gain); }} />} />;
      })}
      {error ? <p role="alert">{error}</p> : null}
    </div>
    <WaveBottomBar accent={selected ? categoryFor(selected).color : "#a855f7"} avatarUrl={selected?.contributor.avatarUrl}
      avatarFallback={selected?.contributor.name.charAt(0) ?? ""} title={selected?.contributor.name ?? "Vote"}
      category={selected ? categoryFor(selected).badge : ""} label="Actions de la boucle au vote">
      <button type="button" aria-label="Télécharger" disabled={locked || !selected} onClick={() => void download()}><Download /></button>
      <button type="button" aria-label="Envoyer un message" disabled={!selected} onClick={message}><MessageCircleMore /></button>
      <button type="button" className="is-danger wave-vote-queue__remove" disabled={locked || !selected || voteOpen || voteFinished}
        onClick={() => void removeFromVote()}>Retirer</button>
      <div className={`wave-vote-queue__duration${durationMenuOpen ? " is-open" : ""}`}>
        <button type="button" aria-label="Durée du vote" aria-haspopup="listbox" aria-expanded={durationMenuOpen}
          disabled={locked || voteOpen || voteFinished} onClick={() => setDurationMenuOpen(open => !open)}>{duration} s<ChevronDown /></button>
        {durationMenuOpen ? <div className="wave-vote-queue__duration-menu" role="listbox" aria-label="Choisir la durée du vote">
          {([2, 30, 45, 60] as const).map(value => <button key={value} type="button" role="option" aria-selected={duration === value}
            onClick={() => { setDuration(value); setDurationMenuOpen(false); }}>{value} secondes</button>)}
        </div> : null}
      </div>
      <button type="button" className="wave-vote-queue__launch" aria-label={voteOpen ? "Clôturer et appliquer le verdict" : "Lancer le vote"}
        disabled={locked || !selected || voteFinished || (!voteOpen && !previewReady)}
        onClick={() => void vote()}>{pending ? "Patientez…" : voteOpen ? "Clôturer le vote" : "Lancer le vote"}</button>
    </WaveBottomBar>
  </div>;
}
