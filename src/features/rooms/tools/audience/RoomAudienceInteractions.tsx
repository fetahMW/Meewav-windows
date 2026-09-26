import MeewavSelect from "../../../../components/shared/MeewavSelect";
import { RoomViewerSubmenu } from "../../place/RoomViewerToolsLayout";
import RoomVotePolicyLabel from "../../voting/RoomVotePolicyLabel";
import { canCastRoomVote } from "../../voting/roomVoting";
import CageResults from "../panels/CageResults";
import CageOpenMicAudience from "./CageOpenMicAudience";
import LogeViewer from "./LogeViewer";
import SceneAudienceFundraiser from "./SceneAudienceFundraiser";
import SceneViewerProgram, { SceneConsoleDialog } from "./SceneViewerProgram";
import ClassroomMessageBubble from "../classroom/ClassroomMessageBubble";
import { ClassroomRoster } from "../panels/ClassroomPanel";
import { MessageCircleMore, LogOut, Armchair } from "lucide-react";
import CageViewerCompanion from "./CageViewerCompanion";
import CageViewerShowcase from "./CageViewerShowcase";
import CageProductionCard from "./CageProductionCard";
import { useCageAudienceFundraiser } from "./useCageAudienceFundraiser";
import { cageEvent, cageEntrants } from "../cageTools.domain";
import {
  ArrowRight,
  Award,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Crown,
  Download,
  FileAudio,
  Hand,
  HandMetal,
  Headphones,
  Images,
  LockKeyhole,
  MessageCircleQuestion,
  Mic,
  MicOff,
  Music2,
  Pause,
  Play,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
  Target,
  Timer,
  Trophy,
  ThumbsUp,
  Upload,
  UsersRound,
  Vote,
  X,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { PlaceRoomState } from "../../place/place.types";
import { requestLogePreviewMediaUrl } from "../audio/logePreviewMedia.service";
import { downloadClassroomResource } from "../classroom/classroomResourceMedia.service";
import { dequantizeWaveformPeaks, type WaveformPeak } from "../audio/previewWaveform";
import { useOptionalRoomLiveCall } from "../../live-call/RoomLiveCallProvider";
import { resolveRoomActorRole } from "../roomTools.config";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { WAVE_LOOP_CATEGORIES, WAVE_SUBMISSION_INSTRUMENTS, waveAcceptedCategories } from "../waveLoopCategories";
import { isLogePreviewAvailable, logePreviewPositionAt, normalizeLogePreviewTransport } from "../roomTools.service";
import type {
  CageMatch,
  CageState,
  ClasseState,
  LogeState,
  RoomActorRole,
  RoomPerson,
  RoomToolsCommand,
  RoomToolsState,
  SpecializedRoomId,
  WaveState,
  WaveSubmission,
} from "../roomTools.types";
import { useRoomTools } from "../useRoomTools";
import { audienceRoleLabel, resolveRoomAudienceRole } from "./roomAudience.types";
import { signedWaveAudienceUrl, validateWaveAudienceFile } from "./waveAudienceUpload.service";
import "./room-audience-interactions.css";
import "./classe-audience.css";

const ClassStudentPreProfile = lazy(() => import("../panels/ClassStudentPreProfile"));

export type RoomAudienceInteractionsProps = {
  active?: boolean;
  cageParticipation?: ReactNode;
  sceneParticipation?: ReactNode;
  onOpenChat?: () => void;
  onOpenMixer?: () => void;
  onLeaveRoom?: () => void;
  roomType: SpecializedRoomId;
  room: PlaceRoomState;
  isHost: boolean;
  isGuest: boolean;
  canEngage: boolean;
  onContributeFundraiser?: (campaignId: string) => void | Promise<void>;
};

const STATUS_LABELS: Record<WaveSubmission["status"], string> = {
  received: "Envoyée",
  analysis: "En cours d’examen",
  "to-review": "Présentée à la régie",
  accepted: "Validée",
  rejected: "Non retenue",
  rework: "À retravailler",
};

const DEMO_LOGE_PREVIEW_MEDIA_NAME = "eclipse-premix-v7.wav";
const DEMO_LOGE_PREVIEW_MEDIA_URL = "/media/preprofile-demo/hazy-after-hours.mp3";
const MAX_BROWSER_TIMEOUT_MS = 2_147_000_000;

function compactTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function existingAuthHref() {
  const returnTo = typeof window === "undefined" ? "/rooms" : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `/auth?returnTo=${encodeURIComponent(returnTo)}`;
}

function useVoteCountdown(open: boolean, endsAt?: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open || !endsAt) return;
    setNow(Date.now());
    const timer = globalThis.setInterval(() => setNow(Date.now()), 250);
    return () => globalThis.clearInterval(timer);
  }, [endsAt, open]);
  if (!open) return 0;
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / 1_000));
}

function Person({ person, detail }: { person: RoomPerson; detail?: string }) {
  return <span className="room-audience-person"><img src={person.avatarUrl} alt="" /><span><strong>{person.name}</strong><small>{detail ?? person.role}</small></span></span>;
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return <div className="room-audience-empty" role="status"><span>{icon}</span><strong>{title}</strong><small>{children}</small></div>;
}

function Section({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`room-audience-section ${className}`.trim()}><header><span>{eyebrow ? <small>{eyebrow}</small> : null}<strong>{title}</strong></span>{action}</header>{children}</section>;
}

function compactWaveformPeaks(peaks: readonly WaveformPeak[], count = 46) {
  if (peaks.length <= count) return [...peaks];
  return Array.from({ length: count }, (_, binIndex) => {
    const start = Math.floor(binIndex * peaks.length / count);
    const end = Math.max(start + 1, Math.floor((binIndex + 1) * peaks.length / count));
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let peakIndex = start; peakIndex < end; peakIndex += 1) {
      minimum = Math.min(minimum, peaks[peakIndex]?.min ?? 0);
      maximum = Math.max(maximum, peaks[peakIndex]?.max ?? 0);
    }
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? { min: minimum, max: maximum }
      : { min: 0, max: 0 };
  });
}

function Waveform({ seed = 1, quantizedPeaks }: { seed?: number; quantizedPeaks?: readonly number[] }) {
  if (quantizedPeaks) {
    const peaks = compactWaveformPeaks(dequantizeWaveformPeaks(quantizedPeaks));
    return <span className="room-audience-waveform is-pcm" aria-hidden="true">{peaks.length ? <svg viewBox="0 0 92 32" preserveAspectRatio="none">{peaks.map((peak, index) => { const x = peaks.length === 1 ? 46 : 1 + index * 90 / (peaks.length - 1); return <line key={index} x1={x} x2={x} y1={16 - peak.max * 14} y2={16 - peak.min * 14} />; })}</svg> : null}</span>;
  }
  return <span className="room-audience-waveform" aria-hidden="true">{Array.from({ length: 46 }, (_, index) => <i key={index} style={{ height: `${18 + ((index * 31 + seed * 17) % 78)}%` }} />)}</span>;
}

type LogePreviewPlayerProps = {
  roomId: string;
  source: PlaceRoomState["source"];
  preview: LogeState["preview"];
  available: boolean;
};

function previewIdentity(preview: LogeState["preview"]) {
  return [
    preview.mediaName,
    preview.mediaPath ?? "",
    preview.durationSeconds ?? "",
    preview.channels ?? "",
    preview.sampleRate ?? "",
    preview.waveformPeaks.join(","),
  ].join("|");
}

export function LogePreviewPlayer({ roomId, source, preview, available }: LogePreviewPlayerProps) {
  const mediaRef = useRef<HTMLMediaElement | null>(null);
  const requestGenerationRef = useRef(0);
  const signedUrlRenewalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identity = previewIdentity(preview);
  const transport = normalizeLogePreviewTransport(preview);
  const extension = preview.mediaName.split(".").pop()?.toLowerCase();
  const mediaKind = preview.mediaKind ?? (["mp4", "webm"].includes(extension ?? "") ? "video" : ["jpg", "jpeg", "png", "webp"].includes(extension ?? "") ? "image" : "audio");
  const [mediaUrl, setMediaUrl] = useState("");
  const [playing, setPlaying] = useState(false);
  const [playBlocked, setPlayBlocked] = useState(false);

  const clearResolvedMedia = useCallback(() => {
    requestGenerationRef.current += 1;
    if (signedUrlRenewalRef.current) clearTimeout(signedUrlRenewalRef.current);
    signedUrlRenewalRef.current = null;
    const media = mediaRef.current;
    if (media) {
      media.pause();
      media.removeAttribute("src");
      media.load();
    }
    setMediaUrl("");
    setPlaying(false);
    setPlayBlocked(false);
  }, []);

  useEffect(() => {
    clearResolvedMedia();
    if (!available || !preview.mediaName || !transport.sessionId) return clearResolvedMedia;
    const generation = requestGenerationRef.current;
    const resolveMedia = async () => {
      try {
        const access = source === "demo" && preview.mediaName === DEMO_LOGE_PREVIEW_MEDIA_NAME && preview.mediaPath === null
          ? { signedUrl: DEMO_LOGE_PREVIEW_MEDIA_URL, expiresAt: null }
          : await requestLogePreviewMediaUrl(roomId);
        if (generation !== requestGenerationRef.current) return;
        const url = access.signedUrl;
        setMediaUrl(url);
        if (access.expiresAt) {
          const renewIn = Math.max(0, Date.parse(access.expiresAt) - Date.now() - 5_000);
          signedUrlRenewalRef.current = setTimeout(() => {
            if (generation === requestGenerationRef.current) void resolveMedia();
          }, Math.min(renewIn, MAX_BROWSER_TIMEOUT_MS));
        }
        if (mediaKind === "image") return;
        requestAnimationFrame(() => {
          const media = mediaRef.current;
          if (!media || generation !== requestGenerationRef.current) return;
          media.src = url;
          media.volume = transport.volume;
          const align = () => {
            if (generation !== requestGenerationRef.current) return;
            media.currentTime = logePreviewPositionAt(preview);
            if (transport.transportStatus === "playing") {
              void media.play().then(() => {
                if (generation !== requestGenerationRef.current) return;
                setPlaying(true);
                setPlayBlocked(false);
              }).catch(() => {
                if (generation !== requestGenerationRef.current) return;
                setPlaying(false);
                setPlayBlocked(true);
              });
            } else {
              media.pause();
              setPlaying(false);
            }
          };
          if (media.readyState >= 1) align();
          else media.addEventListener("loadedmetadata", align, { once: true });
        });
      } catch {
        if (generation === requestGenerationRef.current) setPlaying(false);
      }
    };
    void resolveMedia();
    return clearResolvedMedia;
  }, [available, clearResolvedMedia, identity, mediaKind, preview, roomId, source, transport.sessionId, transport.transportStatus, transport.volume]);

  const resumePreview = async () => {
    const media = mediaRef.current;
    if (!media || transport.transportStatus !== "playing") return;
    try {
      media.currentTime = logePreviewPositionAt(preview);
      await media.play();
      setPlaying(true);
      setPlayBlocked(false);
    } catch {
      setPlayBlocked(true);
    }
  };

  return <div className={`room-audience-preview is-${mediaKind}`}>
    <span className="room-audience-preview__status">{transport.transportStatus === "paused" ? <Pause /> : <Play />}</span>
    {mediaKind === "image" ? (mediaUrl ? <img src={mediaUrl} alt={preview.mediaName} /> : null) : mediaKind === "video" ? <video ref={(node) => { mediaRef.current = node; }} playsInline preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={clearResolvedMedia} /> : <audio ref={(node) => { mediaRef.current = node; }} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={clearResolvedMedia} />}
    {mediaKind === "audio" ? <Waveform quantizedPeaks={preview.waveformPeaks} /> : null}
    <span><strong>{preview.mediaName}</strong><small>{transport.transportStatus === "paused" ? "Avant-première en pause" : playing || mediaKind === "image" ? "En direct dans La Loge" : playBlocked ? "Activez la lecture pour rejoindre l’avant-première" : "Connexion au direct…"}</small></span>
    {playBlocked && transport.transportStatus === "playing" ? <button className="loge-viewer__enable-audio" onClick={() => void resumePreview()}><Play />Activer la lecture</button> : null}
  </div>;
}

function effectiveDemoAccount(roomType: SpecializedRoomId, role: RoomActorRole, requestedId: string, state: RoomToolsState | null) {
  if (!state) return requestedId;
  if (roomType === "classe" && role === "premium_participant" && !state.classe?.seats.some((seat) => seat.person?.id === requestedId)) return state.classe?.seats.find((seat) => seat.person && seat.status === "listening" && !seat.handRaised)?.person?.id ?? state.classe?.seats.find((seat) => seat.person)?.person?.id ?? requestedId;
  if (roomType === "wave" && role === "contributor" && !state.wave?.submissions.some((submission) => submission.contributor.id === requestedId)) return state.wave?.submissions[0]?.contributor.id ?? requestedId;
  if (roomType === "cage" && role === "competitor") {
    const match = state.cage?.matches.find((candidate) => candidate.id === state.cage?.currentMatchId);
    const alreadyPresent = state.cage?.matches.some((candidate) => candidate.competitorA.id === requestedId || candidate.competitorB.id === requestedId);
    return alreadyPresent ? requestedId : match?.competitorA.id ?? requestedId;
  }
  if (roomType === "loge" && role !== "visitor" && !state.loge?.questions.some((question) => question.author.id === requestedId)) return state.loge?.questions[0]?.author.id ?? requestedId;
  return requestedId;
}

function SceneAudience({ state, source, participation, active, accountId, canEngage, canVote = true, busy, execute, onContributeFundraiser }: { state: NonNullable<RoomToolsState["scene"]>; source:"demo"|"live"; participation?: ReactNode; active: boolean; canVote?:boolean; accountId: string; canEngage: boolean; busy: boolean; execute: (command: RoomToolsCommand) => Promise<unknown>; onContributeFundraiser?: (campaignId: string) => void | Promise<void> }) {
  const [dismissedEvaluation, setDismissedEvaluation] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const showFinished = state.program.length > 0 && state.program.every(entry => ["done", "cancelled", "skipped"].includes(entry.status) || entry.participantStatus === "absent");
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | 0>(0);
  const [reactions, setReactions] = useState<Array<"energy" | "presence" | "originality" | "mastery">>([]);
  const live = state.program.find((entry) => entry.status === "live");
  const next = state.program.find((entry) => (entry.status === "ready" || entry.status === "upcoming") && entry.participantStatus !== "absent");
  const livePerson = state.people.find((person) => person.id === live?.artistId);
  const nextPerson = state.people.find((person) => person.id === next?.artistId);
  const evaluationEntry = [...state.program].reverse().find((entry) => entry.status === "done" && entry.evaluationEnabled && state.evaluation.byPerformance[entry.id]?.open);
  const evaluation = evaluationEntry ? state.evaluation.byPerformance[evaluationEntry.id] : undefined;
  const alreadyEvaluated = Boolean(evaluationEntry && (state.evaluation.viewerCompletedPerformanceIds.includes(evaluationEntry.id) || evaluation?.responses[accountId]));
  const publicResults = Boolean(evaluation && evaluation.resultsVisibility === "public" && evaluation.responseCount >= evaluation.minimumResponses);
  const fundraiser = state.fundraiser;
  const fundraiserVisible = fundraiser.visibleInLive && fundraiser.status !== "draft" && Boolean(fundraiser.title);
  const fundraiserProgress = fundraiser.targetAmount ? Math.min(100, Math.round(fundraiser.collectedAmount / fundraiser.targetAmount * 100)) : 0;
  const evaluationCompletedRef = useRef(alreadyEvaluated);
  const evaluationThanksRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const completedNow = alreadyEvaluated && !evaluationCompletedRef.current;
    evaluationCompletedRef.current = alreadyEvaluated;
    if (completedNow) evaluationThanksRef.current?.focus();
  }, [alreadyEvaluated]);
  const toggleReaction = (reaction: "energy" | "presence" | "originality" | "mastery") => setReactions((current) => current.includes(reaction) ? current.filter((item) => item !== reaction) : [...current, reaction]);
  return <>
    <SceneViewerProgram state={state} source={source} participation={participation} />
    {active && showFinished && evaluationEntry && evaluation && dismissedEvaluation !== evaluationEntry.id ? <SceneConsoleDialog title="Le show est terminé" onClose={() => setDismissedEvaluation(evaluationEntry.id)}><Section eyebrow="APRÈS LA PERFORMANCE" title={`Ton avis sur « ${evaluationEntry.title} »`} className="is-scene-evaluation">
      {alreadyEvaluated ? <p ref={evaluationThanksRef} className="room-audience-evaluation__thanks" role="status" tabIndex={-1}><ShieldCheck /> Merci, ton évaluation a bien été enregistrée.</p> : <div className="room-audience-evaluation">
        <p>Évalue volontairement cette performance. Une seule réponse par compte.</p>
        <div className="room-audience-evaluation__stars" role="group" aria-label="Note de la performance">{([1, 2, 3, 4, 5] as const).map((value) => <button type="button" key={value} className={rating >= value ? "is-selected" : ""} aria-pressed={rating === value} aria-label={`${value} étoile${value > 1 ? "s" : ""}`} onClick={() => setRating(value)}><Star /></button>)}</div>
        <div className="room-audience-evaluation__reactions">{([['energy','Énergie'],['presence','Présence'],['originality','Originalité'],['mastery','Maîtrise']] as const).map(([id, label]) => <button type="button" key={id} className={reactions.includes(id) ? "is-selected" : ""} aria-pressed={reactions.includes(id)} onClick={() => toggleReaction(id)}>{label}</button>)}</div>
        <button type="button" className="is-primary" disabled={!canEngage || !canVote || busy || !rating} onClick={() => { setEvaluationError(null); if(rating) void execute({ type: "scene.evaluation.cast", performanceId: evaluationEntry.id, accountId, rating, reactions }).catch(() => setEvaluationError("Votre avis n’a pas été envoyé. Réessayez.")); }}>Envoyer mon évaluation</button>
      </div>}
      {evaluationError ? <p role="alert">{evaluationError}</p> : null}
      {publicResults ? <p className="room-audience-evaluation__result"><Star /> {(evaluation.weightedAverage === null ? "—" : (evaluation.weightedAverage ?? evaluation.ratingTotal / evaluation.responseCount).toFixed(1))}/5 · {evaluation.responseCount} avis</p> : null}
    </Section></SceneConsoleDialog> : null}
    <SceneAudienceFundraiser campaign={state.fundraiser} source={source} canEngage={canEngage} busy={busy} execute={execute} onContribute={onContributeFundraiser} />

  </>;
}

type ClasseAudienceLiveCall = Pick<NonNullable<ReturnType<typeof useOptionalRoomLiveCall>>,
  "endCall" | "invitations" | "mediaSessions" | "setContactPublicProgramActive">;

// eslint-disable-next-line react-refresh/only-export-components -- exported for the transport teardown contract test.
export async function endClasseAudienceIntervention({
  source,
  roomId,
  accountId,
  liveCall,
  execute,
}: {
  source: PlaceRoomState["source"];
  roomId: string;
  accountId: string;
  liveCall: ClasseAudienceLiveCall | null;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  if (source === "live" && liveCall) {
    const invitation = [...liveCall.invitations]
      .filter((candidate) => candidate.roomId === roomId
        && candidate.partyRole === "contact"
        && candidate.contactProfileId === accountId
        && candidate.callMode === "public"
        && (candidate.status === "pending" || candidate.status === "accepted"))
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    if (invitation) {
      liveCall.setContactPublicProgramActive(roomId, false);
      await liveCall.mediaSessions.find((session) => session.invitationId === invitation.invitationId)?.disconnect().catch(() => undefined);
      await liveCall.endCall(invitation.invitationId);
    }
  }
  await execute({ type: "classe.speaker.end-own", accountId });
}

function ClasseAudience({ viewer, classe, role, accountId, roomId, canEngage, busy, execute, onEndIntervention, source, onOpenChat, onLeaveRoom, visible }: { viewer: RoomPerson; classe: ClasseState; role: RoomActorRole; accountId: string; roomId: string; canEngage: boolean; busy: boolean; execute: (command: RoomToolsCommand) => Promise<unknown>; onEndIntervention: () => Promise<void>; source: "demo" | "live"; onOpenChat?: () => void; onLeaveRoom?: () => void; visible: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [questionSending, setQuestionSending] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [sentQuestionId, setSentQuestionId] = useState<string | null>(null);
  const classroomRef = useRef<HTMLDivElement>(null);
  const profileTriggerRef = useRef<HTMLElement | null>(null);
  const [panel, setPanel] = useState<"class" | "questions" | "resources">("class");
  useEffect(() => { if (visible) setPanel("class"); }, [visible]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [ticketSeat, setTicketSeat] = useState<number | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [endingIntervention, setEndingIntervention] = useState(false);
  const [interventionError, setInterventionError] = useState<string | null>(null);
  const [resourceDownloadId, setResourceDownloadId] = useState<string | null>(null);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const seat = classe.seats.find((candidate) => candidate.person?.id === accountId);
  const selectedStudent = classe.seats.find(candidate => candidate.person?.id === selectedStudentId)?.person;
  const activeSpeaker = classe.people.find((person) => person.id === classe.activeSpeakerId);
  const handRaised = classe.raisedHands.some((hand) => hand.personId === accountId);
  const canRequestFloor = source === "live"
    ? classe.floorEligible === true && (role === "viewer" || role === "premium_participant")
    : role === "premium_participant" && Boolean(seat);
  const canRaise = canEngage && canRequestFloor && classe.handsOpen && !handRaised && classe.activeSpeakerId !== accountId;
  const active = classe.activeSpeakerId === accountId;
  const privateActive = classe.privateTalkStudentId === accountId;
  const questions = classe.questions ?? [];
  const resources = classe.resources ?? [];
  const canAccessResources = Boolean(seat) || role === "host" || role === "teacher" || role === "regisseur";
  useEffect(() => { if (panel === "resources" && !canAccessResources) setPanel("class"); }, [panel, canAccessResources]);
  const visibleQuestions = [...questions].sort((left, right) => {
    if (left.id === sentQuestionId) return -1;
    if (right.id === sentQuestionId) return 1;
    if (left.status === "displayed" && right.status !== "displayed") return -1;
    if (right.status === "displayed" && left.status !== "displayed") return 1;
    return right.supports - left.supports || Date.parse(right.sentAt) - Date.parse(left.sentAt);
  });
  const submitQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const text = questionText.trim();
    if (!seat?.person || text.length < 2 || questionSending) return;
    setQuestionSending(true);
    setQuestionError(null);
    const questionId = crypto.randomUUID();
    try {
    await execute({
      type: "classe.question.add",
      question: {
        id: questionId,
        author: { ...seat.person, id: accountId },
        text,
        status: "pending",
        sentAt: new Date().toISOString(),
        supports: 0,
        supporterIds: [],
      },
    });
    setQuestionText("");
    setSentQuestionId(questionId);
    contentRef.current?.scrollTo?.({top:0});
    } catch {
      setQuestionError("Votre question n’a pas été envoyée. Votre texte est conservé ; réessayez.");
    } finally {
      setQuestionSending(false);
    }
  };
  return <div ref={classroomRef} className="room-tools-shell is-classe classe-student-workspace" data-room-tools="classe">
    <RoomViewerSubmenu activeTool={panel} onSelect={setPanel} ariaLabel="Explorer la Classe" idPrefix="classe-viewer-tab" items={[
      { id: "class", label: "Classe", icon: <Armchair aria-hidden="true" />, controlsId: "classe-viewer-content" },
      { id: "questions", label: "Questions", icon: <MessageCircleMore aria-hidden="true" />, controlsId: "classe-viewer-content" },
      ...(canAccessResources ? [{ id: "resources" as const, label: "Ressources", icon: <Download aria-hidden="true" />, controlsId: "classe-viewer-content" }] : []),
    ]} />
    <header className="classe-student-heading"><strong>{seat && role === "premium_participant" ? `Élève premium · Place ${seat.number}/24` : "Spectateur · La Classe"}</strong><small>{seat?.person?.name}</small></header>
    <div ref={contentRef} className="classe-student-content" id="classe-viewer-content" role="tabpanel" aria-labelledby={`classe-viewer-tab-${panel}`}>
    {privateActive ? <div className="room-audience-callout is-private" role="status"><span><Headphones /></span><span><small>CONVERSATION PRIVÉE</small><strong>Le professeur vous parle en privé.</strong><em>Vous continuez d’entendre le cours. Votre retour n’est pas envoyé à la classe.</em></span></div> : null}
    {active ? <div className="room-audience-callout is-speaking" role="status"><span><Mic /></span><span><small>PRISE DE PAROLE</small><strong>Le professeur vous donne la parole.</strong><em>{interventionError ?? "Votre micro est autorisé pour cette intervention."}</em></span><button type="button" disabled={!canEngage || busy || endingIntervention} onClick={() => {
      setEndingIntervention(true);
      setInterventionError(null);
      void onEndIntervention()
        .catch(() => setInterventionError("Le canal audio n’a pas pu être fermé. Réessayez."))
        .finally(() => setEndingIntervention(false));
    }}>{endingIntervention ? "Fermeture…" : "Terminer mon intervention"}</button></div> : null}
    {panel === "class" ? <div className="room-tool-panel is-classroom">
      <ClassroomRoster classe={classe} onSelectFreeSeat={!seat && !classe.seatsLocked ? number => { setTicketError(null); setTicketSeat(number); } : undefined} selectedStudentId={selectedStudentId} onSelectStudent={(id) => { profileTriggerRef.current = document.activeElement as HTMLElement; setSelectedStudentId(id); }} audioBridge={{ mode: privateActive ? "private" : active ? "public" : null, studentId: privateActive || active ? accountId : null, phase: privateActive || active ? "active" : "idle" }} />
    </div> : null}

    {seat && classe.people[0] ? <ClassroomMessageBubble roomId={roomId} accountId={accountId} peerId={classe.people[0].id} peerName={classe.people[0].name} source={source} /> : null}
    {ticketSeat !== null ? <div className="classe-ticket" role="dialog" aria-modal="true" aria-label={`Ticket place ${ticketSeat}`}><button type="button" aria-label="Fermer le ticket" onClick={() => setTicketSeat(null)}><X /></button><Armchair /><h3>Votre place dans La Classe</h3><p>Place {ticketSeat} · {((classe.seatPriceCents ?? 499) / 100).toLocaleString("fr-FR", {style:"currency",currency:"EUR"})}</p><p>{source === "demo" ? classe.seatPriceCents === 0 ? "Cette classe est gratuite." : "Maquette : aucun débit réel." : classe.seatPriceCents === 0 ? "L’accès aux places gratuites n’est pas encore disponible en LIVE." : "L’achat sécurisé de places n’est pas encore disponible."}</p>{ticketError ? <p role="alert">{ticketError}</p> : null}<button type="button" disabled={busy || source !== "demo" || !canEngage} onClick={() => { void execute({type:"classe.demo.seat.purchase", seat:ticketSeat, cents:classe.seatPriceCents ?? 499, person:{...viewer, id:accountId, role:"Élève", microphone:"ready"}}).then(() => {setTicketSeat(null); setPanel("class");}).catch(() => setTicketError("Cette place ou son prix a changé. Fermez puis choisissez à nouveau.")); }}>{classe.seatPriceCents === 0 ? "Entrer gratuitement" : "Simuler l’achat et entrer"}</button></div> : null}
    {selectedStudent ? <Suspense fallback={null}><ClassStudentPreProfile returnFocusTo={profileTriggerRef.current} boundsElement={classroomRef.current} person={selectedStudent} source={source} onClose={() => setSelectedStudentId(null)} /></Suspense> : null}
    {panel === "resources" && canAccessResources && resources.length ? <Section eyebrow="RESSOURCES DU COURS" title="À garder après la classe" action={<span className="room-audience-count">{resources.length}</span>}>
      <div className="room-audience-class-resources">
        {resources.map((resource) => <article key={resource.id}>
          <span className={`is-${resource.kind}`}>{resource.kind === "image" ? <Images /> : <FileAudio />}</span>
          <span><strong>{resource.name}</strong><small>{resource.kind === "image" ? "IMAGE" : "AUDIO"} · {resource.size >= 1_048_576 ? `${(resource.size / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(resource.size / 1024))} Ko`}</small></span>
          <button type="button" disabled={resourceDownloadId !== null} onClick={() => {
            setResourceDownloadId(resource.id);
            setResourceError(null);
            void downloadClassroomResource(resource, roomId)
              .catch(() => setResourceError("Le téléchargement sécurisé n’a pas pu démarrer."))
              .finally(() => setResourceDownloadId(null));
          }} aria-label={`Télécharger ${resource.name}`}><Download />{resourceDownloadId === resource.id ? "Préparation…" : "Télécharger"}</button>
        </article>)}
        {resourceError ? <p role="alert"><CircleHelp />{resourceError}</p> : null}
      </div>
    </Section> : null}
    {panel === "resources" && !resources.length ? <p className="room-audience-notice">Le professeur n’a pas encore partagé de ressource.</p> : null}
    {panel === "questions" ? <section className="classe-questions-panel" aria-label="Questions de la classe">
      <header><span><MessageCircleQuestion /><h2>Questions</h2></span><small>{questions.length} questions</small></header>
      <p className="classe-questions-intro">Posez votre question au professeur ou soutenez celle d’un élève.</p>
      {role === "premium_participant" && seat && canEngage && classe.questionsOpen ? <form className="room-audience-question" onSubmit={submitQuestion}><label htmlFor="classe-viewer-question">Votre question <small>{questionText.length}/280</small></label><textarea id="classe-viewer-question" value={questionText} maxLength={280} rows={3} onChange={(event) => setQuestionText(event.currentTarget.value)} placeholder="Une question courte pour le professeur…" /><button type="submit" className="is-primary" disabled={busy || questionSending || questionText.trim().length < 2}><Send /> {questionSending ? "Envoi…" : "Envoyer"}</button></form> : <p className="room-audience-notice"><CircleHelp /> {!seat || role !== "premium_participant" ? "Seules les 24 places peuvent proposer et soutenir des questions." : "Les questions rouvriront au signal du professeur."}</p>}
      {questionError ? <p className="classe-question-feedback is-error" role="alert">{questionError}</p> : null}
      {sentQuestionId && questions.some(q => q.id === sentQuestionId) ? <p className="classe-question-feedback" role="status"><Check /> Question envoyée · elle apparaît en premier ci-dessous.</p> : null}
      <h3 className="classe-questions-list-title">Dans la classe</h3>
      {visibleQuestions.length ? <div className="room-audience-class-questions">{visibleQuestions.map((question) => {
        const supported = question.supporterIds.includes(accountId);
        const own = question.author.id === accountId;
        return <article key={question.id} className={`is-${question.status}${question.id === sentQuestionId ? " is-just-sent" : ""}`}><span><small>{question.id === sentQuestionId ? "VOTRE QUESTION · ENVOYÉE" : question.status === "displayed" ? "AFFICHÉE DANS LA CLASSE" : question.status === "answered" ? "RÉPONDUE" : "QUESTION"}</small><strong>{question.text}</strong><em>@{question.author.name}{own ? " · Vous" : ""}</em></span><button type="button" aria-label={supported ? `Question de ${question.author.name} déjà soutenue · ${question.supports} soutiens` : `Soutenir la question de ${question.author.name} · ${question.supports} soutiens`} aria-pressed={supported} disabled={!classe.questionsOpen || !canEngage || busy || own || supported || question.status === "answered" || role !== "premium_participant" || !seat} onClick={() => void execute({ type: "classe.question.support", questionId: question.id, accountId })}><ThumbsUp /> {question.supports}</button></article>;
      })}</div> : <EmptyState icon={<MessageCircleQuestion />} title="Aucune question pour le moment.">Les questions les plus soutenues remonteront en tête.</EmptyState>}
    </section> : null}
    </div>
    <div className="is-classroom classe-student-navbar"><nav className="classroom-command-dock classe-student-dock" aria-label="Commandes de l’élève">
      <div className="classroom-command-dock__controls">
        {canRequestFloor || handRaised ? <button type="button" aria-label={handRaised ? "Baisser ma main" : "Lever la main"} title={handRaised ? "Baisser ma main" : "Lever la main"} className={handRaised ? "is-hand-action is-active" : "is-hand-action"} aria-pressed={handRaised} disabled={busy || !canEngage || (!handRaised && !canRaise)} onClick={() => void execute(handRaised ? {type:"classe.hand.lower-own", accountId} : {type:"classe.hand.raise", personId:accountId}).catch(() => undefined)}><Hand /><span>{handRaised ? "Baisser ma main" : "Lever la main"}</span></button> : null}
        <button type="button" aria-label="Quitter la classe" title="Quitter la classe" onClick={onLeaveRoom} disabled={!onLeaveRoom}><LogOut /><span>Quitter la classe</span></button>
      </div>
    </nav></div>
  </div>;
}

function WaveVoteCard({ wave, submission, accountId, canEngage: allowedToEngage, busy, execute }: { wave: WaveState; submission: WaveSubmission; accountId: string; canEngage: boolean; busy: boolean; execute: (command: RoomToolsCommand) => Promise<unknown> }) {
  const canEngage = allowedToEngage && canCastRoomVote(wave.votingPolicy,accountId);
  const choice = submission.vote?.votes[accountId];
  const audioRef = useRef<HTMLAudioElement>(null);
  const beatRef = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl] = useState(submission.mediaUrl ?? "");
  const [beatUrl, setBeatUrl] = useState(wave.baseLoop.mediaUrl ?? "");
  const [listeningMode, setListeningMode] = useState<"solo" | "beat">("beat");
  const [playing, setPlaying] = useState(false);
  const secondsLeft = useVoteCountdown(Boolean(submission.vote?.open), submission.vote?.endsAt);
  const voteOpen = Boolean(submission.vote?.open) && secondsLeft !== 0;
  useEffect(() => {
    let active = true;
    if (submission.mediaUrl) { setAudioUrl(submission.mediaUrl); return () => { active = false; }; }
    if (submission.mediaPath) void signedWaveAudienceUrl(submission.mediaPath).then((url) => { if (active) setAudioUrl(url); }).catch(() => { if (active) setAudioUrl(""); });
    return () => { active = false; };
  }, [submission.mediaPath, submission.mediaUrl]);
  useEffect(() => {
    let active = true;
    if (wave.baseLoop.mediaUrl) { setBeatUrl(wave.baseLoop.mediaUrl); return () => { active = false; }; }
    if (wave.baseLoop.mediaPath) void signedWaveAudienceUrl(wave.baseLoop.mediaPath).then((url) => { if (active) setBeatUrl(url); }).catch(() => { if (active) setBeatUrl(""); });
    return () => { active = false; };
  }, [wave.baseLoop.mediaPath, wave.baseLoop.mediaUrl]);
  const stopAudio = () => {
    audioRef.current?.pause();
    beatRef.current?.pause();
    setPlaying(false);
  };
  const toggleAudio = async () => {
    const audio = audioRef.current;
    if (!audioUrl || !audio) return;
    if (!audio.paused) { stopAudio(); return; }
    audio.currentTime = 0;
    if (listeningMode === "beat" && beatUrl && beatRef.current) {
      beatRef.current.currentTime = 0;
      await Promise.all([audio.play(), beatRef.current.play()]);
    } else await audio.play();
    setPlaying(true);
  };
  const chooseListeningMode = (mode: "solo" | "beat") => { stopAudio(); setListeningMode(mode); };
  return <article className="room-audience-wave-vote"><header><span><small>VOTE WAVE</small><strong>Cette boucle doit-elle rejoindre le Beat collectif ?</strong></span><b><Timer /> {secondsLeft === null ? `${submission.vote?.durationSeconds ?? 0}s` : secondsLeft > 0 ? `${secondsLeft}s` : "Fermé"}</b></header><div className="room-audience-wave-vote__listening" role="group" aria-label="Mode d’écoute"><button type="button" className={listeningMode === "solo" ? "is-selected" : ""} aria-pressed={listeningMode === "solo"} onClick={() => chooseListeningMode("solo")}><Headphones /> Solo</button><button type="button" className={listeningMode === "beat" ? "is-selected" : ""} aria-pressed={listeningMode === "beat"} disabled={!beatUrl} onClick={() => chooseListeningMode("beat")}><Music2 /> Avec le beat</button></div><div className="room-audience-wave-vote__media"><button type="button" aria-label={playing ? "Mettre la proposition en pause" : `Écouter la proposition ${listeningMode === "solo" ? "en solo" : "avec le beat"}`} disabled={!audioUrl} onClick={() => void toggleAudio()}>{playing ? <Pause /> : <Play />}</button><audio ref={audioRef} src={audioUrl || undefined} preload="metadata" onEnded={stopAudio} /><audio ref={beatRef} src={beatUrl || undefined} preload="metadata" loop /><Waveform seed={submission.title.length} /><span><strong>{submission.title}</strong><small>{submission.instrument} · v{submission.version} · {compactTime(submission.durationSeconds)}{submission.creditPublic ? ` · ${submission.contributor.name}` : ""}</small></span></div><div className="room-audience-wave-vote__actions"><button type="button" className={choice === "yes" ? "is-selected is-yes" : ""} disabled={!canEngage || busy || !voteOpen || Boolean(choice)} onClick={() => void execute({ type: "wave.vote.cast", submissionId: submission.id, accountId, choice: "yes" })}><Check /> Valider</button><button type="button" className={choice === "no" ? "is-selected is-no" : ""} disabled={!canEngage || busy || !voteOpen || Boolean(choice)} onClick={() => void execute({ type: "wave.vote.cast", submissionId: submission.id, accountId, choice: "no" })}><X /> Refuser</button></div>{choice ? <p><ShieldCheck /> Vote enregistré. Les résultats restent masqués jusqu’à la clôture.</p> : !voteOpen ? <p><Clock3 /> Le vote est terminé.</p> : <p><ShieldCheck /> Une voix par compte · résultats masqués.</p>}</article>;
}

type WaveAudienceProps = {
  wave: WaveState;
  source: PlaceRoomState["source"];
  roomId: string;
  accountId: string;
  viewer: RoomPerson;
  canEngage: boolean;
  busy: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
};

function LiveWaveAudienceUnavailable() {
  return <>
    <Section eyebrow="LA WAVE EN DIRECT" title="Synchronisation officielle indisponible" className="is-wave-base">
      <p className="room-audience-notice" role="alert"><LockKeyhole /> Les interactions sont temporairement verrouillées. La Wave attend sa source normalisée, ses préécoutes serveur et son pipeline audio privé avant d’accepter une action.</p>
    </Section>
    <Section eyebrow="CONTRIBUTIONS" title="Envoi sécurisé en attente">
      <EmptyState icon={<Upload />} title="Aucun fichier n’est envoyé pour le moment.">Une proposition n’apparaîtra dans le Sas qu’après traitement du fichier et confirmation officielle de son état prêt.</EmptyState>
    </Section>
    <Section eyebrow="VOTE DU PUBLIC" title="Vote officiel en attente">
      <EmptyState icon={<Vote />} title="Aucun scrutin n’est ouvert.">Seul un vote créé, minuté et validé par le serveur peut être affiché et enregistré ici.</EmptyState>
    </Section>
    <Section eyebrow="BEAT COLLECTIF" title="Rendu officiel en attente">
      <EmptyState icon={<Music2 />} title="La préécoute publique n’est pas encore disponible.">Le Beat sera lu depuis un rendu serveur unique. Aucune waveform décorative ni aucun fichier original privé ne sont exposés.</EmptyState>
    </Section>
  </>;
}

function DemoWaveAudience({ wave, accountId, viewer, canEngage, busy, execute }: Omit<WaveAudienceProps, "source" | "roomId">) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [instrument, setInstrument] = useState("Percussion");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [success, setSuccess] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const voteSubmission = wave.submissions.find((submission) => submission.vote?.open);
  const own = wave.submissions.filter((submission) => submission.contributor.id === accountId);
  const contributor = own[0]?.contributor ?? viewer;
  const acceptedCategories = waveAcceptedCategories(wave);
  const acceptedInstruments = WAVE_SUBMISSION_INSTRUMENTS.filter((item) => acceptedCategories.includes(item.category));
  const selectedInstrument = acceptedInstruments.find((item) => item.label === instrument) ?? acceptedInstruments[0];
  const submissionsOpen = wave.submissionsOpen !== false && acceptedCategories.length > 0;
  const filteredIntake = acceptedCategories.length < WAVE_LOOP_CATEGORIES.length;
  const acceptedLabels = WAVE_LOOP_CATEGORIES.filter(({ id }) => acceptedCategories.includes(id)).map(({ label }) => label).join(", ");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!submissionsOpen || !selectedInstrument || !canEngage || !file || !title.trim() || !contributor || !rightsConfirmed || busy) return;
    setUploadError("");
    setProgress(18);
    const durationSeconds = wave.baseLoop.bars === 8 ? (60 / wave.baseLoop.bpm) * 32 : (60 / wave.baseLoop.bpm) * 16;
    try {
      setProgress(64);
      const mimeType = validateWaveAudienceFile(file);
      const mediaUrl = URL.createObjectURL(file);
      setProgress(78);
      await execute({ type: "wave.submission.add", submission: {
        id: crypto.randomUUID(), contributor: { ...contributor, id: accountId }, title: title.trim(), instrument: selectedInstrument.label, category: selectedInstrument.category,
        bpm: wave.baseLoop.bpm, key: wave.baseLoop.key, bars: wave.baseLoop.bars,
        durationSeconds, fileName: file.name, fileSize: file.size, mimeType,
        mediaUrl, submittedAt: new Date().toISOString(), status: "received",
        rightsConfirmed, version: 1, privateNotes: message.trim(), creditPublic: true,
        versions: [{ version: 1, receivedAt: new Date().toISOString(), note: "Version originale" }],
      } });
      setProgress(100); setSuccess(true); setTitle(""); setMessage(""); setFile(null); setRightsConfirmed(false);
    } catch (reason) {
      setSuccess(false);
      const code = reason instanceof Error ? reason.message : "wave_file_upload_failed";
      setUploadError(code === "wave_category_closed" ? "Le host n’accepte plus cette catégorie pour le moment." : code === "wave_submissions_closed" ? "Le host a fermé les soumissions pour le moment." : code === "wave_file_size_invalid" ? "Le fichier doit peser au maximum 25 Mo." : code === "wave_file_type_invalid" ? "Format non pris en charge. Utilisez WAV, MP3, AAC, FLAC ou M4A." : "L’envoi a échoué. Votre fichier n’a pas été ajouté au Sas.");
    } finally { globalThis.setTimeout(() => setProgress(0), 800); }
  };
  return <>
    <Section eyebrow="BASE DE LA WAVE" title={wave.title} className="is-wave-base">
      <div className="room-audience-wave-base"><span><Music2 /></span><span><strong>{wave.baseLoop.title}</strong><small>{wave.baseLoop.kind}</small></span><dl><div><dt>BPM</dt><dd>{wave.baseLoop.bpm}</dd></div><div><dt>Tonalité</dt><dd>{wave.baseLoop.key}</dd></div><div><dt>Mesures</dt><dd>{wave.baseLoop.bars}</dd></div></dl></div>
    </Section>
    {voteSubmission ? <WaveVoteCard wave={wave} submission={voteSubmission} accountId={accountId} canEngage={canEngage} busy={busy} execute={execute} /> : <EmptyState icon={<Vote />} title="Aucune boucle n’est actuellement au vote.">Vous pouvez écouter la Wave ou préparer votre prochaine contribution.</EmptyState>}
    <details className={`room-audience-disclosure${submissionsOpen ? "" : " is-closed"}`}>
      <summary>
        <span><Upload /><span><strong>{submissionsOpen ? "Proposer une boucle" : "Soumissions fermées"}</strong><small>{submissionsOpen ? `${wave.baseLoop.bars} mesures · ${wave.baseLoop.bpm} BPM · ${wave.baseLoop.key}` : "Le host rouvrira le Sas dès qu’il sera prêt."}</small></span></span>
        <ChevronDown />
      </summary>
      {submissionsOpen ? <form onSubmit={submit} className="room-audience-wave-submit">
        {filteredIntake ? <p className="room-audience-notice" role="status">Catégories ouvertes : {acceptedLabels}.</p> : null}
        <button type="button" className="room-audience-dropzone" disabled={!canEngage} onClick={() => fileRef.current?.click()}><FileAudio /><span><strong>{file?.name ?? "Choisir un fichier audio"}</strong><small>WAV, MP3, AAC, FLAC ou M4A · 25 Mo maximum</small></span></button>
        <input ref={fileRef} hidden type="file" accept="audio/wav,audio/mpeg,audio/aac,audio/flac,audio/mp4,audio/x-m4a,.wav,.mp3,.aac,.flac,.m4a" onChange={(event) => { const next = event.currentTarget.files?.[0] ?? null; setSuccess(false); setUploadError(""); if (!next) { setFile(null); return; } try { validateWaveAudienceFile(next); setFile(next); } catch (reason) { setFile(null); const code = reason instanceof Error ? reason.message : "wave_file_type_invalid"; setUploadError(code === "wave_file_size_invalid" ? "Le fichier doit peser au maximum 25 Mo." : "Format non pris en charge. Utilisez WAV, MP3, AAC, FLAC ou M4A."); } }} />
        <div className="room-audience-form-grid"><label>Titre<input maxLength={80} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /></label><label>Type<MeewavSelect value={selectedInstrument?.label ?? ""} onChange={(event) => setInstrument(event.currentTarget.value)}>{acceptedInstruments.map((item) => <option key={item.label}>{item.label}</option>)}</MeewavSelect></label><label className="is-wide">Message facultatif<textarea rows={2} maxLength={240} value={message} onChange={(event) => setMessage(event.currentTarget.value)} /></label></div>
        <label className="room-audience-check"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.currentTarget.checked)} /> Je possède les droits nécessaires sur cette boucle et j’autorise son traitement, sa présentation dans cette Wave, ainsi que son téléchargement et son utilisation par les autres utilisateurs.</label>
        {progress ? <progress value={progress} max={100}>{progress}%</progress> : null}
        <button type="submit" className="is-primary" disabled={!canEngage || busy || !file || !title.trim() || !rightsConfirmed}>Envoyer au Sas</button>
        {uploadError ? <p className="room-audience-upload-error" role="alert"><X /> {uploadError}</p> : null}
        {success ? <p className="room-audience-success"><Check /> Ta boucle a été envoyée au Sas.</p> : null}
      </form> : <p className="room-audience-wave-closed" role="status"><LockKeyhole /> Le Sas est temporairement fermé aux nouvelles boucles. Les règles restent visibles juste au-dessus.</p>}
    </details>
    {own.length ? <Section eyebrow="MES PROPOSITIONS" title="Suivi privé"><div className="room-audience-own-submissions">{own.map((submission) => <article key={submission.id}><Waveform seed={submission.title.length} /><span><strong>{submission.title}</strong><small>{submission.fileName ?? submission.instrument}</small>{submission.reviewFeedback ? <em>{submission.reviewFeedback}</em> : null}</span><b className={`is-${submission.status}`}>{STATUS_LABELS[submission.status]}</b></article>)}</div></Section> : null}
    <Section eyebrow="SÉQUENCEUR PUBLIC" title="La Wave se construit" action={<span className="room-audience-count">{wave.layers.length} couches</span>}><div className="room-audience-layers">{wave.layers.map((layer, index) => <article key={layer.id}><b>{String(index + 1).padStart(2, "0")}</b><Waveform seed={index + 2} /><span><strong>{layer.title}</strong><small>{index === 0 ? "Boucle de base" : `${layer.author} · Validée`}</small></span><Check /></article>)}</div><p className="room-audience-privacy"><LockKeyhole /> Lecture seule : les commandes mute, solo, déplacement et suppression restent en régie.</p></Section>
  </>;
}

export function WaveAudience(props: WaveAudienceProps) {
  if (props.source === "live") {
    const voteSubmission = props.wave.submissions.find((submission) => submission.vote?.open);
    return voteSubmission
      ? <WaveVoteCard wave={props.wave} submission={voteSubmission} accountId={props.accountId} canEngage={props.canEngage} busy={props.busy} execute={props.execute} />
      : <LiveWaveAudienceUnavailable />;
  }
  return <DemoWaveAudience {...props} />;
}

export default function RoomAudienceInteractions({ roomType, room, isHost, isGuest, canEngage, onContributeFundraiser, cageParticipation, sceneParticipation, onOpenChat, onOpenMixer, onLeaveRoom, active = true }: RoomAudienceInteractionsProps) {
  const liveCall = useOptionalRoomLiveCall();
  const actorRole = resolveRoomActorRole(roomType, isHost, isGuest, room.currentUserProfile?.role);
  const requestedAccountId = room.currentUserProfile?.id ?? `anonymous-${roomType}`;
  const demoSeedRole = room.source === "demo" && roomType === "classe" && !isHost && new URLSearchParams(window.location.search).get("classAccess") !== "audience"
    ? "premium_participant"
    : actorRole;
  const initialAccountId = useMemo(() => room.source === "demo"
    ? effectiveDemoAccount(roomType, demoSeedRole, requestedAccountId, createRoomToolsFixture(roomType, room.id))
    : requestedAccountId, [demoSeedRole, requestedAccountId, room.id, room.source, roomType]);
  const { state, busy, error, execute, role: toolsRole, canVote } = useRoomTools({ roomType, roomId: room.id, role: actorRole, accountId: initialAccountId, source: room.source });
  const accountId = effectiveDemoAccount(roomType, actorRole, initialAccountId, state);
  const { fundraiser: cageFundraiser, error: cageFundraiserError } = useCageAudienceFundraiser(room.id, accountId, roomType === "cage" && room.source === "live" && active && canEngage);
  const viewer: RoomPerson = {
    id: accountId,
    name: room.currentUserProfile?.displayName ?? "Membre MeeWav",
    avatarUrl: room.currentUserProfile?.avatarUrl ?? "",
    role: room.currentUserProfile?.role ?? "Audience",
    microphone: "off",
    camera: "off",
  };
  const audienceRole = resolveRoomAudienceRole({ roomType, actorRole: toolsRole, accountId, state });

  if (!state && roomType === "cage") return <div className="room-audience-interactions is-cage"><div className="room-audience-interactions__body"><CageProductionCard active={active} onOpenMixer={onOpenMixer} />{error ? <p role="alert" className="room-audience-error">Le programme du tournoi est momentanément indisponible.</p> : <p role="status">Chargement du programme…</p>}</div></div>;
  if (!state) return <div className="room-audience-interactions is-loading" role="status"><Sparkles /><span><strong>Préparation de l’expérience publique…</strong><small>Les interactions disponibles vont apparaître sans interrompre le live.</small></span></div>;

  return <div className={`room-audience-interactions is-${roomType}`} data-audience-role={audienceRole}><RoomVotePolicyLabel roomId={room.id} source={room.source} accountId={accountId}/>
    {roomType!=="loge" && roomType!=="cage"?<header className="room-audience-interactions__header"><span><Headphones /><span><small>{roomType.toUpperCase()} · EN DIRECT</small><strong>Interactions</strong><em>Ce qui se passe maintenant, et ce que vous pouvez faire.</em></span></span><b>{audienceRoleLabel(audienceRole)}</b></header>:null}
    {error ? <p className="room-audience-error" role="alert">Action impossible : {error.replace(/_/g, " ")}</p> : null}
    <div className="room-audience-interactions__body">
      {!canEngage ? <p className="room-audience-auth"><LockKeyhole /><span><strong>Regardez le live sans interruption.</strong><small>{roomType === "wave" ? "Pour voter ou proposer une boucle, utilisez la connexion MeeWav." : "Pour voter, participer ou envoyer un cadeau, utilisez la connexion MeeWav."}</small></span><a href={existingAuthHref()}>Se connecter</a></p> : null}
      {roomType === "scene" && state.scene ? <SceneAudience canVote={canVote} source={room.source} active={active} participation={sceneParticipation} state={state.scene} accountId={accountId} canEngage={canEngage} busy={busy} execute={execute} onContributeFundraiser={onContributeFundraiser} /> : null}
      {roomType === "classe" && state.classe ? <ClasseAudience viewer={viewer} visible={active} source={room.source} onOpenChat={onOpenChat} onLeaveRoom={onLeaveRoom} classe={state.classe} role={toolsRole} accountId={accountId} roomId={room.id} canEngage={canEngage} busy={busy} execute={execute} onEndIntervention={() => endClasseAudienceIntervention({ source: room.source, roomId: room.id, accountId, liveCall, execute })} /> : null}
      {roomType === "wave" && state.wave ? <WaveAudience wave={state.wave} source={room.source} roomId={room.id} accountId={accountId} viewer={viewer} canEngage={canEngage} busy={busy} execute={execute} /> : null}
      {roomType === "cage" && state.cage ? state.cage.runtime?.config.format === "open-mic" ? <>{cageParticipation}<CageOpenMicAudience state={state} accountId={accountId} canEngage={canEngage && canVote} busy={busy} execute={execute}/></> : <CageViewerShowcase enabled={room.source === "demo"} production={<CageProductionCard active={active} onOpenMixer={onOpenMixer} />}><CageViewerCompanion cage={state.cage} source={room.source} accountId={accountId} active={active} fundraiser={cageFundraiser} fundraiserError={cageFundraiserError} participation={cageParticipation} onOpenChat={onOpenChat} production={<CageProductionCard active={active} onOpenMixer={onOpenMixer} />} /></CageViewerShowcase> : null}
      {roomType === "loge" && state.loge ? <LogeViewer loge={state.loge} accountId={accountId} viewer={viewer} hostName={room.host.displayName} hostAvatarUrl={room.host.avatarUrl} eligible={Boolean(state.audience?.eligible)} canEngage={canEngage} busy={busy} execute={execute} onOpenChat={onOpenChat} preview={isLogePreviewAvailable(state.loge.preview)?<LogePreviewPlayer roomId={room.id} source={room.source} preview={state.loge.preview} available/>:null}/> : null}
    </div>
  </div>;
}
