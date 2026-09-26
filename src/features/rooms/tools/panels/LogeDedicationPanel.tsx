import {
  ArrowLeft, AudioLines, Camera, Check, Clapperboard, Clock3, Headphones, LoaderCircle, LockKeyhole, Mic,
  PhoneOff, Radio, RotateCcw, Search, Send, Sparkles, Square, Users, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMessagingAttachmentClientUploadId,
  messagingAttachmentsRepository,
} from "../../../messaging/messaging.attachments.service";
import {
  createMessagingClientMessageId,
  messagingRepository,
} from "../../../messaging/messaging.service";
import { useOptionalRoomLiveCall } from "../../live-call/RoomLiveCallProvider";
import { ROOM_LIVE_CALL_MAX_CONTACTS } from "../../live-call/roomLiveCall.service";
import type { PlaceLiveCallContact } from "../../place/placeLiveCall";
import type { LogeState, RoomPerson, RoomToolsCommand, VipMoment } from "../roomTools.types";
import "./moment-vip.css";

type MomentAction = "audio" | "video" | "live";
type FanSource = "viewers" | "queue";
type CaptureState = "idle" | "recording" | "ready" | "sending" | "sent";
type FanEntry = { person: RoomPerson; source: FanSource };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: ReadonlyArray<{ id: MomentAction; title: string; description: string; Icon: typeof Mic }> = [
  { id: "audio", title: "Dédicace audio", description: "Enregistre une dédicace à envoyer aux personnes sélectionnées.", Icon: AudioLines },
  { id: "video", title: "Dédicace vidéo", description: "Filme une dédicace à envoyer aux personnes sélectionnées.", Icon: Clapperboard },
  { id: "live", title: "Moment en direct", description: "Invite les personnes sélectionnées à échanger avec toi dans la Loge.", Icon: Users },
];
const LIVE_STATUS_LABELS: Record<string, string> = {
  pending: "En attente de réponse",
  accepted: "Invitation acceptée",
  declined: "Invitation refusée",
  cancelled: "Invitation annulée",
  ended: "Moment VIP terminé",
  expired: "Invitation expirée",
};
const DEMO_FANS: RoomPerson[] = [
  { id: "loge-demo-sofia", name: "Sofia", role: "Membre VIP", avatarUrl: "/images/tremplin/artists/generated/mina-roze-pop-soul-lyon-v1.webp", microphone: "ready", camera: "ready" },
  { id: "loge-demo-maya", name: "Maya", role: "Membre", avatarUrl: "/images/tremplin/artists/generated/aina-sol-dj-productrice-afro-house-bordeaux-v1.webp", microphone: "ready", camera: "ready" },
  { id: "loge-demo-leo", name: "Léo", role: "Membre", avatarUrl: "/images/tremplin/artists/generated/malik-soren-chanteur-soul-strasbourg-v1.webp", microphone: "ready", camera: "ready" },
];

function uniquePeople(people: RoomPerson[]) {
  return people.filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index);
}

function createMomentId(kind: MomentAction) {
  return `moment-vip-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function formatTime(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function preferredRecorderMime(format: "audio" | "video") {
  const candidates = format === "video"
    ? ["video/webm;codecs=vp8,opus", "video/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((mime) => MediaRecorder.isTypeSupported?.(mime)) ?? "";
}

function liveCallContact(person: RoomPerson): PlaceLiveCallContact {
  return {
    profileId: person.id,
    conversationId: "",
    displayName: person.name,
    username: null,
    avatarUrl: person.avatarUrl,
    isVerified: person.role.toLocaleLowerCase("fr").includes("vip"),
  };
}

function FanCard({ person, selected, queued, disabled, onSelect }: { person: RoomPerson; selected: boolean; queued: boolean; disabled: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`vip-moment__fan${selected ? " is-selected" : ""}`} disabled={disabled} aria-pressed={selected} aria-label={`${selected ? "Désélectionner" : "Sélectionner"} ${person.name}`} onClick={onSelect}>
      <span className="vip-moment__portrait"><img src={person.avatarUrl} alt="" /></span>
      <span>
        <strong>{person.name}{person.role.toLocaleLowerCase("fr").includes("vip") ? <Sparkles aria-label="Membre VIP" /> : null}</strong>
        <small>{person.role}</small>
      </span>
      <em className={selected ? "is-selected" : queued ? "is-queued" : ""}>{selected ? <Check aria-hidden="true" /> : <Square aria-hidden="true" />}</em>
    </button>
  );
}

function audienceLabel(fans: readonly RoomPerson[]) {
  if (!fans.length) return "les destinataires";
  if (fans.length === 1) return fans[0].name;
  if (fans.length === 2) return `${fans[0].name} et ${fans[1].name}`;
  return `${fans[0].name}, ${fans[1].name} +${fans.length - 2}`;
}

function LiveGuestPortraits({ fans }: { fans: readonly RoomPerson[] }) {
  return (
    <div className="vip-moment__live-guests" role="list" aria-label="Portraits des invités sélectionnés">
      {fans.map((fan) => (
        <span key={fan.id} role="listitem">
          <img src={fan.avatarUrl} alt={`Portrait de ${fan.name}`} />
        </span>
      ))}
    </div>
  );
}

function ActionSelector({ selectedFans, disabled, onChoose, onClear }: { selectedFans: readonly RoomPerson[]; disabled: boolean; onChoose: (action: MomentAction) => void; onClear: () => void }) {
  const count = selectedFans.length;
  const recipient = count === 1 ? selectedFans[0].name : `${count} personnes`;
  return (
    <nav className="vip-member-actions" aria-label="Créer une dédicace ou un moment en direct">
      <div className="vip-member-actions__recipient" aria-live="polite"><span>{count ? <><strong>{recipient}</strong><small>Créer pour la sélection</small></> : <strong>Choisis les destinataires</strong>}</span>{count ? <button type="button" className="vip-member-actions__clear" disabled={disabled} onClick={onClear} aria-label="Annuler la sélection" title="Annuler la sélection"><X aria-hidden="true" /></button> : null}</div>
      <div className="vip-member-actions__buttons">
        {ACTIONS.map(({ id, title, description, Icon }) => (
          <button key={id} type="button" className={`vip-member-actions__button is-${id}`} disabled={disabled || !count || (id === "live" && count > ROOM_LIVE_CALL_MAX_CONTACTS)} title={id === "live" && count > ROOM_LIVE_CALL_MAX_CONTACTS ? `${ROOM_LIVE_CALL_MAX_CONTACTS} personnes maximum pour un moment en direct` : description} aria-label={count ? `${title} pour ${recipient}` : title} onClick={() => onChoose(id)}>
            <Icon aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function MediaRecorderPanel({
  format, fans, disabled, onBack, onCreateMoment,
}: {
  format: "audio" | "video";
  fans: readonly RoomPerson[];
  disabled: boolean;
  onBack: () => void;
  onCreateMoment: (format: "audio" | "video", blob: Blob, seconds: number) => Promise<void>;
}) {
  const groupLabel = audienceLabel(fans);
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const timerRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLMediaElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };
  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (cameraRef.current) cameraRef.current.srcObject = null;
  };
  const clearPreview = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    blobRef.current = null;
  };

  useEffect(() => () => {
    clearTimer();
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    releaseStream();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);
  useEffect(() => {
    if (captureState === "recording" && seconds >= 90) recorderRef.current?.stop();
  }, [captureState, seconds]);

  const startRecording = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("L’enregistrement n’est pas disponible dans ce navigateur.");
      return;
    }
    clearPreview();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: format === "video" });
      streamRef.current = stream;
      if (format === "video" && cameraRef.current) {
        cameraRef.current.srcObject = stream;
        await cameraRef.current.play().catch(() => undefined);
      }
      const mimeType = preferredRecorderMime(format);
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        clearTimer();
        releaseStream();
        if (chunksRef.current.length === 0) {
          setCaptureState("idle");
          setError("La prise est vide. Réessaie l’enregistrement.");
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || (format === "video" ? "video/webm" : "audio/webm") });
        const url = URL.createObjectURL(blob);
        blobRef.current = blob;
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setCaptureState("ready");
      };
      recorder.start(250);
      setSeconds(0);
      setCaptureState("recording");
      timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      releaseStream();
      setError(`Autorise ${format === "video" ? "la caméra et le micro" : "le micro"} pour créer cette dédicace privée.`);
    }
  };
  const stopRecording = () => { if (recorderRef.current?.state === "recording") recorderRef.current.stop(); };
  const reset = () => { clearPreview(); setSeconds(0); setCaptureState("idle"); setError(null); };
  const send = async () => {
    if (!blobRef.current || captureState === "sending") return;
    setCaptureState("sending"); setError(null);
    try { await onCreateMoment(format, blobRef.current, seconds); setCaptureState("sent"); }
    catch (reason) { setCaptureState("ready"); setError(reason instanceof Error ? reason.message : "L’envoi a échoué. Réessaie."); }
  };
  const playPreview = async () => {
    setError(null);
    try { await previewRef.current?.play(); }
    catch { setError(`La ${format === "video" ? "vidéo" : "prise audio"} ne peut pas être lue. Réessaie ou refais l’enregistrement.`); }
  };

  const title = format === "audio" ? "Dédicace audio" : "Dédicace vidéo";
  if (captureState === "sent") {
    return (
      <section className="vip-moment__step vip-moment__success" aria-live="polite">
        <span><Check aria-hidden="true" /></span><strong>{title} envoyée à {fans.length === 1 ? groupLabel : `${fans.length} invités`}</strong>
        <small>Ce souvenir privé est maintenant disponible dans {fans.length === 1 ? "sa messagerie" : "leurs messageries"}.</small>
        <button type="button" onClick={onBack}>Créer un autre moment VIP</button>
      </section>
    );
  }
  return (
    <section className="vip-moment__step vip-moment__execution" aria-labelledby="vip-recorder-heading">
      <header>
        <button type="button" className="vip-moment__back" aria-label="Retour aux moments" onClick={onBack}><ArrowLeft /></button>
        <span><small>POUR {groupLabel.toLocaleUpperCase("fr")}</small><strong id="vip-recorder-heading">{title}</strong></span>
        <em className={captureState === "recording" ? "is-recording" : ""}><i aria-hidden="true" />{captureState === "recording" ? "Enregistrement" : captureState === "ready" ? "Prêt à envoyer" : "Prêt"}</em>
      </header>
      <div className={`vip-moment__capture is-${format}`}>
        {format === "video" ? (previewUrl
          ? <video ref={(node) => { previewRef.current = node; }} src={previewUrl} controls playsInline />
          : <video ref={cameraRef} muted playsInline aria-label="Aperçu caméra"><span>La vidéo n’est pas prise en charge.</span></video>) : (
          <div className="vip-moment__audio-visual" aria-hidden="true"><span><Mic /></span>{Array.from({ length: 19 }, (_, index) => <i key={index} />)}</div>
        )}
        <time>{formatTime(seconds)}<small>/ 01:30</small></time>
        {previewUrl && format === "audio" ? <audio ref={(node) => { previewRef.current = node; }} src={previewUrl} /> : null}
      </div>
      <div className="vip-moment__capture-actions">
        {captureState === "idle" ? <button type="button" className="is-primary" disabled={disabled} onClick={() => void startRecording()}>{format === "video" ? <Camera /> : <Mic />}Enregistrer</button> : null}
        {captureState === "recording" ? <button type="button" className="is-stop" onClick={stopRecording}><Square />Arrêter</button> : null}
        {captureState === "ready" || captureState === "sending" ? <>
          <button type="button" disabled={!previewUrl || captureState === "sending"} onClick={() => void playPreview()}><Headphones />{format === "video" ? "Regarder" : "Réécouter"}</button>
          <button type="button" disabled={captureState === "sending"} onClick={reset}><RotateCcw />Refaire</button>
          <button type="button" className="is-primary" disabled={disabled || captureState === "sending"} onClick={() => void send()}>{captureState === "sending" ? <LoaderCircle className="is-spinning" /> : <Send />}{captureState === "sending" ? "Envoi…" : `Envoyer (${fans.length})`}</button>
        </> : null}
      </div>
      {error ? <p className="vip-moment__error" role="alert">{error}</p> : null}
      <p className="vip-moment__private"><LockKeyhole />Chaque dédicace reste privée et part uniquement vers {groupLabel}.</p>
    </section>
  );
}

function LiveInvitePanel({ fans, disabled, execute, onBack, roomId, source }: {
  fans: readonly RoomPerson[]; disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>; onBack: () => void;
  roomId: string; source: "demo" | "live";
}) {
  const liveCall = useOptionalRoomLiveCall();
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<"idle" | "pending" | "ended">("idle");
  const momentIdsRef = useRef(new Map<string, string>());
  const fanIds = useMemo(() => new Set(fans.map((fan) => fan.id)), [fans]);
  const invitations = source === "live"
    ? liveCall?.outgoingInvitations.filter((candidate) => candidate.roomId === roomId
      && fanIds.has(candidate.contactProfileId) && candidate.callMode === "public" && candidate.status !== "ended") ?? []
    : [];
  const mediaSessions = invitations.map((invitation) => liveCall?.mediaSessions.find((candidate) => candidate.invitationId === invitation.invitationId)).filter(Boolean);
  const isOnAir = invitations.some((invitation) => invitation.isOnAir || liveCall?.onAirInvitationIds.has(invitation.invitationId));
  const status = isOnAir ? "live" : invitations[0]?.status ?? (demoStatus === "pending" ? "pending" : demoStatus === "ended" ? "ended" : null);
  const groupLabel = audienceLabel(fans);

  const addOrUpdateMoments = async (nextStatus: VipMoment["status"]) => {
    for (const fan of fans) {
      const momentId = momentIdsRef.current.get(fan.id);
      if (momentId) await execute({ type: "loge.moment.status", momentId, status: nextStatus });
      else {
        const nextMomentId = createMomentId("live");
        await execute({ type: "loge.moment.add", moment: {
          id: nextMomentId, kind: "face-to-face", title: `Moment VIP · ${duration} min`, beneficiary: fan,
          status: nextStatus, format: "video",
        } });
        momentIdsRef.current.set(fan.id, nextMomentId);
      }
    }
  };
  const invite = async () => {
    if (submitting) return; setSubmitting(true); setError(null);
    try {
      const callableFans = fans.filter((fan) => UUID_PATTERN.test(fan.id));
      if (source === "live") {
        if (!liveCall) throw new Error("Le service d’appel du live n’est pas disponible.");
        if (!roomId || !UUID_PATTERN.test(roomId)) throw new Error("La Room active ne peut pas recevoir cet appel.");
        if (callableFans.length !== fans.length) throw new Error("Un invité sélectionné ne peut pas recevoir l’appel du live.");
        await liveCall.requestLiveCall({ roomId, contacts: callableFans.map(liveCallContact), mode: "public" });
      }
      await addOrUpdateMoments("scheduled");
      if (source === "demo") setDemoStatus("pending");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Les invitations n’ont pas pu être envoyées."); }
    finally { setSubmitting(false); }
  };
  const preparePublic = async () => {
    if (!liveCall || !invitations.length) return; setSubmitting(true); setError(null);
    try {
      await Promise.all(invitations.filter((invitation) => invitation.status === "accepted" && invitation.routeMode === "preview").map((invitation) => liveCall.setCallRoute(invitation.invitationId, "public")));
      await addOrUpdateMoments("accepted");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Le direct n’a pas pu être préparé."); }
    finally { setSubmitting(false); }
  };
  const goOnAir = async () => {
    if (!liveCall || !invitations.length) return; setSubmitting(true); setError(null);
    try {
      await Promise.all(invitations.filter((invitation) => invitation.status === "accepted" && invitation.routeMode === "public").map((invitation) => liveCall.confirmCallOnAir(invitation.invitationId)));
      await addOrUpdateMoments("live");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Les invités n’ont pas pu rejoindre le direct."); }
    finally { setSubmitting(false); }
  };
  const endMoment = async () => {
    setSubmitting(true); setError(null);
    try {
      if (source === "live" && liveCall) await Promise.all(invitations.map((invitation) => liveCall.endCall(invitation.invitationId)));
      await addOrUpdateMoments("completed"); setDemoStatus("ended");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Le moment n’a pas pu être terminé."); }
    finally { setSubmitting(false); }
  };
  const cancelDemoInvitation = async () => {
    setSubmitting(true); setError(null);
    try { await addOrUpdateMoments("cancelled"); setDemoStatus("ended"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Les invitations n’ont pas pu être annulées."); }
    finally { setSubmitting(false); }
  };
  const activeStatus = status && !["declined", "cancelled", "expired"].includes(status);
  const hasPreviewInvitations = invitations.some((invitation) => invitation.status === "accepted" && invitation.routeMode === "preview");
  const hasPublicInvitations = invitations.some((invitation) => invitation.status === "accepted" && invitation.routeMode === "public");
  const everyPublicGuestReady = hasPublicInvitations && mediaSessions.length === invitations.length && mediaSessions.every((session) => session?.peerPresent);
  return (
    <section className="vip-moment__step vip-moment__execution vip-moment__live" aria-labelledby="vip-live-heading">
      <header>
        <button type="button" className="vip-moment__back" aria-label="Retour aux moments" onClick={onBack}><ArrowLeft /></button>
        <span><small>POUR {groupLabel.toLocaleUpperCase("fr")}</small><strong id="vip-live-heading">Face-à-face</strong></span>
        <em className={isOnAir ? "is-recording" : ""}><i aria-hidden="true" />{isOnAir ? "En direct" : "Moment privé"}</em>
      </header>
      {!activeStatus ? <>
        <div className="vip-moment__live-hero"><LiveGuestPortraits fans={fans} /><strong>Invite {fans.length === 1 ? groupLabel : `${fans.length} invités`} à te rejoindre</strong><p>Un échange privé, ensemble, pendant quelques minutes dans la Loge.</p></div>
        <fieldset><legend>Choisis la durée</legend>{[5, 10, 15].map((minutes) => <button key={minutes} type="button" className={duration === minutes ? "is-selected" : ""} aria-pressed={duration === minutes} onClick={() => setDuration(minutes as 5 | 10 | 15)}>{minutes} min</button>)}</fieldset>
        <button type="button" className="vip-moment__invite" disabled={disabled || submitting} onClick={() => void invite()}>{submitting ? <LoaderCircle className="is-spinning" /> : <Radio />}Inviter le groupe ({fans.length})</button>
      </> : (
        <div className="vip-moment__invitation-status" aria-live="polite">
          <span className={isOnAir ? "is-live" : ""}>{isOnAir ? <Radio /> : status === "ended" ? <Check /> : <Clock3 />}</span>
          <strong>{isOnAir ? `${fans.length} invité${fans.length > 1 ? "s" : ""} en direct` : LIVE_STATUS_LABELS[status] ?? "Invitations envoyées"}</strong>
          <small>{isOnAir ? `${duration} minutes · le chronomètre du moment est actif` : status === "pending" ? `Invitation envoyée à ${groupLabel}` : mediaSessions.some((session) => session?.peerPresent) ? "Connexion audio établie" : "Connexion du groupe en cours"}</small>
          {hasPreviewInvitations ? <button type="button" disabled={submitting} onClick={() => void preparePublic()}><Headphones />Préparer le direct</button> : null}
          {hasPublicInvitations && !isOnAir ? <button type="button" className="is-primary" disabled={submitting || !everyPublicGuestReady} onClick={() => void goOnAir()}><Radio />Lancer dans la Loge</button> : null}
          {status === "pending" && !invitations.length ? <button type="button" disabled={submitting} onClick={() => void cancelDemoInvitation()}><RotateCcw />Annuler les invitations</button> : null}
          {isOnAir ? <button type="button" className="is-end" disabled={submitting} onClick={() => void endMoment()}><PhoneOff />Mettre fin au moment</button> : null}
          {status === "ended" ? <button type="button" onClick={onBack}>Choisir un autre moment</button> : null}
        </div>
      )}
      {error ? <p className="vip-moment__error" role="alert">{error}</p> : null}
    </section>
  );
}

export default function LogeDedicationPanel({ loge, disabled, execute, initialFanId = null, initialFanIds, onFanChange, onFanIdsChange, waitingGuests, source, roomId }: {
  loge: LogeState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown>; initialFanId?: string | null;
  initialFanIds?: readonly string[];
  onFanChange?: (id: string) => void;
  onFanIdsChange?: (ids: string[]) => void;
  waitingGuests: readonly RoomPerson[];
  source: "demo" | "live";
  roomId: string;
}) {
  const [search, setSearch] = useState("");
  const initialIds = initialFanIds ?? (initialFanId ? [initialFanId] : []);
  const initialKey = initialIds.join("|");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [...initialIds]);
  useEffect(() => { setSelectedIds([...initialIds]); }, [initialKey]);
  const [action, setAction] = useState<MomentAction | null>(null);
  const deliveredMediaRef = useRef(new Map<string, { blob: Blob; format: "audio" | "video"; privateContent: string }>());
  const completedMediaRef = useRef(new WeakMap<Blob, Set<string>>());
  const momentIdsRef = useRef(new WeakMap<Blob, Map<string, string>>());
  const fans = useMemo<FanEntry[]>(() => {
    const viewerPeople = uniquePeople(loge.moments.map((moment) => moment.beneficiary));
    const queuedPeople = uniquePeople([...waitingGuests, ...loge.questions.map((question) => question.author)]);
    const demoPeople = source === "demo"
      ? DEMO_FANS
      : [];
    const completeViewers = uniquePeople([...viewerPeople, ...demoPeople]);
    const entries: FanEntry[] = [
      ...completeViewers.map((person) => ({ person, source: "viewers" as const })),
      ...queuedPeople.map((person) => ({ person, source: "queue" as const })),
    ];
    if (!entries.some((entry) => entry.source === "queue")) {
      completeViewers.slice(-Math.min(2, completeViewers.length)).forEach((person) => entries.push({ person, source: "queue" }));
    }
    return entries;
  }, [loge.moments, loge.questions, waitingGuests, source]);
  const allPeople = useMemo(() => uniquePeople(fans.map((entry) => entry.person)), [fans]);
  const queuedFanIds = useMemo(() => new Set(fans.filter((entry) => entry.source === "queue").map((entry) => entry.person.id)), [fans]);
  const displayedFans = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return allPeople.filter((person) => !query || `${person.name} ${person.role}`.toLocaleLowerCase("fr").includes(query));
  }, [allPeople, search]);
  const selectedFans = selectedIds.flatMap(id => { const person = allPeople.find(candidate => candidate.id === id); return person ? [person] : []; });
  const selectionKey = selectedFans.map(person => person.id).join("|");
  useEffect(() => { setAction(null); }, [selectionKey]);
  const selectFans = (ids: string[]) => {
    const next = [...new Set(ids)];
    setSelectedIds(next); onFanIdsChange?.(next);
    if (next[0]) onFanChange?.(next[0]);
  };
  const allDisplayedSelected = displayedFans.length > 0 && displayedFans.every(person => selectedIds.includes(person.id));

  const createDedication = async (format: "audio" | "video", blob: Blob, seconds: number) => {
    if (!selectedFans.length) throw new Error("Choisis au moins un invité avant d’envoyer la dédicace.");
    const completed = completedMediaRef.current.get(blob) ?? new Set<string>();
    completedMediaRef.current.set(blob, completed);
    const momentIds = momentIdsRef.current.get(blob) ?? new Map<string, string>();
    momentIdsRef.current.set(blob, momentIds);
    for (const fan of selectedFans) {
      if (!momentIds.has(fan.id)) momentIds.set(fan.id, createMomentId(format));
      if (completed.has(fan.id)) continue;
      let privateContent: string;
      if (source === "live" && UUID_PATTERN.test(fan.id)) {
        const delivered = deliveredMediaRef.current.get(fan.id);
        if (delivered?.blob === blob && delivered.format === format) privateContent = delivered.privateContent;
        else {
          const conversation = await messagingRepository.getOrCreateDirectConversation(fan.id, `moment-vip:${createMessagingClientMessageId()}`);
          const extension = blob.type.includes("ogg") ? "ogg" : "webm";
          const displayName = `moment-vip-${fan.name.toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-")}.${extension}`;
          const prepared = await messagingAttachmentsRepository.prepareUpload({
            clientUploadId: createMessagingAttachmentClientUploadId(), conversationId: conversation.conversation_id,
            purpose: format === "audio" ? "voice_note" : "video", displayName, mimeType: blob.type, sizeBytes: blob.size,
          });
          try {
            await messagingAttachmentsRepository.uploadPrepared(prepared, blob, blob.type);
            await messagingAttachmentsRepository.finalizeUpload({ uploadId: prepared.uploadId, durationMs: Math.max(1_000, seconds * 1_000) });
            await messagingAttachmentsRepository.sendMessage({
              conversationId: conversation.conversation_id, clientMessageId: createMessagingClientMessageId(), kind: format,
              body: `${format === "audio" ? "Dédicace audio" : "Dédicace vidéo"} · Moment VIP`,
              payload: { source: "rooms", experience: "moment_vip" },
              attachments: [{ uploadId: prepared.uploadId, role: "primary", label: "Moment VIP" }],
            });
            privateContent = `conversation:${conversation.conversation_id}`;
            deliveredMediaRef.current.set(fan.id, { blob, format, privateContent });
          } catch (reason) {
            await messagingAttachmentsRepository.discardUpload(prepared.uploadId).catch(() => undefined); throw reason;
          }
        }
      } else privateContent = URL.createObjectURL(blob);
      await execute({ type: "loge.moment.add", moment: {
        id: momentIds.get(fan.id)!, kind: "dedication", title: format === "audio" ? "Dédicace audio" : "Dédicace vidéo",
        beneficiary: fan, status: "completed", format, privateContent,
      } });
      completed.add(fan.id);
      deliveredMediaRef.current.delete(fan.id);
    }
  };
  return (
    <div className={`vip-moment is-member-console${action ? " is-executing" : ""}`} aria-label="Moment VIP">
      <div className={`vip-moment__layout${action ? " has-action" : ""}`}>
        {!action ? <section className="vip-moment__fans" aria-label="Membres de la Loge et VIP">
          <div className="vip-moment__selection-head"><label className="vip-moment__search"><span className="sr-only">Rechercher une personne</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un membre ou VIP…" /><Search aria-hidden="true" /></label><button type="button" className="vip-moment__select-all" disabled={disabled || !displayedFans.length} aria-pressed={allDisplayedSelected} aria-label={allDisplayedSelected ? "Désélectionner les membres affichés" : "Sélectionner les membres affichés"} onClick={() => selectFans(allDisplayedSelected ? selectedIds.filter(id => !displayedFans.some(person => person.id === id)) : [...selectedIds, ...displayedFans.map(person => person.id)])}><Check aria-hidden="true" />Tout</button></div>
          <div className="vip-moment__fan-list" role="group" aria-label={`${displayedFans.length} membres de la Loge et VIP`} tabIndex={0}>{displayedFans.length ? displayedFans.map((person) => <FanCard key={person.id} person={person} disabled={disabled} queued={queuedFanIds.has(person.id)} selected={selectedIds.includes(person.id)} onSelect={() => selectFans(selectedIds.includes(person.id) ? selectedIds.filter(id => id !== person.id) : [...selectedIds, person.id])} />) : <p><Users /><span><strong>Aucune personne trouvée</strong><small>Modifie ta recherche.</small></span></p>}</div>
        </section> : null}
        {selectedFans.length > 0 && action === "audio" ? <MediaRecorderPanel format="audio" fans={selectedFans} disabled={disabled} onBack={() => setAction(null)} onCreateMoment={createDedication} /> : null}
        {selectedFans.length > 0 && action === "video" ? <MediaRecorderPanel format="video" fans={selectedFans} disabled={disabled} onBack={() => setAction(null)} onCreateMoment={createDedication} /> : null}
        {selectedFans.length > 0 && action === "live" ? <LiveInvitePanel roomId={roomId} source={source} fans={selectedFans} disabled={disabled} execute={execute} onBack={() => setAction(null)} /> : null}
        {!action ? <ActionSelector selectedFans={selectedFans} disabled={disabled} onChoose={setAction} onClear={() => selectFans([])} /> : null}
      </div>
    </div>
  );
}
