import {
  ArrowLeft, Camera, Check, Clock3, Headphones, LoaderCircle, LockKeyhole, Mic,
  PhoneOff, Play, Radio, RotateCcw, Search, Send, Sparkles, Square, UserRoundPlus,
  Users, Video,
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
import type { PlaceLiveCallContact } from "../../place/placeLiveCall";
import type { LogeState, RoomPerson, RoomToolsCommand, VipMoment } from "../roomTools.types";
import "./moment-vip.css";

type MomentAction = "audio" | "video" | "live";
type FanSource = "viewers" | "queue";
type CaptureState = "idle" | "recording" | "ready" | "sending" | "sent";
type FanEntry = { person: RoomPerson; source: FanSource };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: ReadonlyArray<{ id: MomentAction; title: string; description: string; Icon: typeof Mic }> = [
  { id: "audio", title: "Dédicace audio", description: "Enregistre un message vocal privé et envoie-le à ton fan.", Icon: Mic },
  { id: "video", title: "Dédicace vidéo", description: "Enregistre une vidéo personnalisée et envoie-la à ton fan.", Icon: Video },
  { id: "live", title: "Moment privé", description: "Partage un moment en tête-à-tête avec cette personne.", Icon: LockKeyhole },
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

function FanCard({ person, selected, queued, onSelect }: { person: RoomPerson; selected: boolean; queued: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={`vip-moment__fan${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={onSelect}>
      <span className="vip-moment__portrait"><img src={person.avatarUrl} alt="" /></span>
      <span>
        <strong>{person.name}{person.role.toLocaleLowerCase("fr").includes("vip") ? <Sparkles aria-label="Membre VIP" /> : null}</strong>
        <small>{person.role}</small>
      </span>
      <em className={selected ? "is-selected" : queued ? "is-queued" : ""}>{selected ? <><Check aria-hidden="true" />Sélectionné</> : <><i aria-hidden="true" />{queued ? "Demande" : "En ligne"}</>}</em>
    </button>
  );
}

function ActionSelector({ selectedFan, onChoose }: { selectedFan: RoomPerson | null; onChoose: (action: MomentAction) => void }) {
  return (
    <nav className="vip-member-actions" aria-label="Créer un moment avec la personne sélectionnée">
      <div className="vip-member-actions__recipient" aria-live="polite">{selectedFan ? <><span className="vip-member-actions__avatar"><img src={selectedFan.avatarUrl} alt="" /></span><span><strong>{selectedFan.name}</strong><small>{selectedFan.role}</small></span></> : <span>Sélectionne une personne</span>}</div>
      <div className="vip-member-actions__buttons">
        {ACTIONS.map(({ id, title, description, Icon }) => (
          <button key={id} type="button" className={`vip-member-actions__button is-${id}`} disabled={!selectedFan} title={description} aria-label={selectedFan ? `${title} pour ${selectedFan.name}` : title} onClick={() => onChoose(id)}>
            <Icon aria-hidden="true" />
            <span>{title}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function MediaRecorderPanel({
  format, fan, disabled, onBack, onCreateMoment,
}: {
  format: "audio" | "video";
  fan: RoomPerson;
  disabled: boolean;
  onBack: () => void;
  onCreateMoment: (format: "audio" | "video", blob: Blob, seconds: number) => Promise<void>;
}) {
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
        <span><Check aria-hidden="true" /></span><strong>{title} envoyée à {fan.name}</strong>
        <small>Ce souvenir privé est maintenant disponible dans sa messagerie.</small>
        <button type="button" onClick={onBack}>Créer un autre moment VIP</button>
      </section>
    );
  }
  return (
    <section className="vip-moment__step vip-moment__execution" aria-labelledby="vip-recorder-heading">
      <header>
        <button type="button" className="vip-moment__back" aria-label="Retour aux moments" onClick={onBack}><ArrowLeft /></button>
        <span><small>POUR {fan.name.toLocaleUpperCase("fr")}</small><strong id="vip-recorder-heading">{title}</strong></span>
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
          <button type="button" className="is-primary" disabled={disabled || captureState === "sending"} onClick={() => void send()}>{captureState === "sending" ? <LoaderCircle className="is-spinning" /> : <Send />}{captureState === "sending" ? "Envoi…" : "Envoyer au fan"}</button>
        </> : null}
      </div>
      {error ? <p className="vip-moment__error" role="alert">{error}</p> : null}
      <p className="vip-moment__private"><LockKeyhole />Chaque dédicace est privée et envoyée uniquement à {fan.name}.</p>
    </section>
  );
}

function LiveInvitePanel({ fan, disabled, execute, onBack, roomId, source }: {
  roomId: string; source: "demo" | "live";
  fan: RoomPerson; disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>; onBack: () => void;
}) {
  const liveCall = useOptionalRoomLiveCall();
  const [duration, setDuration] = useState<5 | 10 | 15>(5);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoStatus, setDemoStatus] = useState<"idle" | "pending" | "ended">("idle");
  const momentIdRef = useRef<string | null>(null);
  const invitation = liveCall?.outgoingInvitations.find((candidate) => candidate.roomId === roomId
    && candidate.contactProfileId === fan.id && candidate.callMode === "public" && candidate.status !== "ended") ?? null;
  const mediaSession = invitation ? liveCall?.mediaSessions.find((candidate) => candidate.invitationId === invitation.invitationId) ?? null : null;
  const isOnAir = Boolean(invitation?.isOnAir || (invitation && liveCall?.onAirInvitationIds.has(invitation.invitationId)));
  const status = invitation?.status ?? (demoStatus === "pending" ? "pending" : demoStatus === "ended" ? "ended" : null);

  const addOrUpdateMoment = async (nextStatus: VipMoment["status"]) => {
    if (momentIdRef.current) {
      await execute({ type: "loge.moment.status", momentId: momentIdRef.current, status: nextStatus }); return;
    }
    const momentId = createMomentId("live");
    await execute({ type: "loge.moment.add", moment: {
      id: momentId, kind: "face-to-face", title: `Moment VIP · ${duration} min`, beneficiary: fan,
      status: nextStatus, format: "video",
    } });
    momentIdRef.current = momentId;
  };
  const invite = async () => {
    if (submitting) return; setSubmitting(true); setError(null);
    try {
      const isDemoInvitation = source === "demo" || !(liveCall && roomId && UUID_PATTERN.test(fan.id));
      if (!isDemoInvitation) await liveCall?.requestLiveCall({ roomId: roomId!, contacts: [liveCallContact(fan)], mode: "public" });
      await addOrUpdateMoment("scheduled");
      if (isDemoInvitation) setDemoStatus("pending");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "L’invitation n’a pas pu être envoyée."); }
    finally { setSubmitting(false); }
  };
  const preparePublic = async () => {
    if (!liveCall || !invitation) return; setSubmitting(true); setError(null);
    try { await liveCall.setCallRoute(invitation.invitationId, "public"); await addOrUpdateMoment("accepted"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Le direct n’a pas pu être préparé."); }
    finally { setSubmitting(false); }
  };
  const goOnAir = async () => {
    if (!liveCall || !invitation) return; setSubmitting(true); setError(null);
    try { await liveCall.confirmCallOnAir(invitation.invitationId); await addOrUpdateMoment("live"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Le fan n’a pas pu rejoindre le direct."); }
    finally { setSubmitting(false); }
  };
  const endMoment = async () => {
    setSubmitting(true); setError(null);
    try { if (liveCall && invitation) await liveCall.endCall(invitation.invitationId); await addOrUpdateMoment("completed"); setDemoStatus("ended"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Le moment n’a pas pu être terminé."); }
    finally { setSubmitting(false); }
  };
  const cancelDemoInvitation = async () => {
    setSubmitting(true); setError(null);
    try { await addOrUpdateMoment("cancelled"); setDemoStatus("ended"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "L’invitation n’a pas pu être annulée."); }
    finally { setSubmitting(false); }
  };
  const activeStatus = status && !["declined", "cancelled", "expired"].includes(status);
  return (
    <section className="vip-moment__step vip-moment__execution vip-moment__live" aria-labelledby="vip-live-heading">
      <header>
        <button type="button" className="vip-moment__back" aria-label="Retour aux moments" onClick={onBack}><ArrowLeft /></button>
        <span><small>POUR {fan.name.toLocaleUpperCase("fr")}</small><strong id="vip-live-heading">Moment privé</strong></span>
        <em className={isOnAir ? "is-recording" : ""}><i aria-hidden="true" />{isOnAir ? "En direct" : "Moment privé"}</em>
      </header>
      {!activeStatus ? <>
        <div className="vip-moment__live-hero"><span><UserRoundPlus /></span><strong>Invite {fan.name} à te rejoindre</strong><p>Discutez ensemble pendant quelques minutes dans la Loge.</p></div>
        <fieldset><legend>Choisis la durée</legend>{[5, 10, 15].map((minutes) => <button key={minutes} type="button" className={duration === minutes ? "is-selected" : ""} aria-pressed={duration === minutes} onClick={() => setDuration(minutes as 5 | 10 | 15)}>{minutes} min</button>)}</fieldset>
        <button type="button" className="vip-moment__invite" disabled={disabled || submitting} onClick={() => void invite()}>{submitting ? <LoaderCircle className="is-spinning" /> : <Radio />}Inviter maintenant</button>
      </> : (
        <div className="vip-moment__invitation-status" aria-live="polite">
          <span className={isOnAir ? "is-live" : ""}>{isOnAir ? <Radio /> : status === "ended" ? <Check /> : <Clock3 />}</span>
          <strong>{isOnAir ? `${fan.name} a rejoint le live` : LIVE_STATUS_LABELS[status] ?? "Invitation envoyée"}</strong>
          <small>{isOnAir ? `${duration} minutes · le chronomètre du moment est actif` : status === "pending" ? `Invitation envoyée à ${fan.name}` : mediaSession?.peerPresent ? "Connexion audio établie" : "Connexion du fan en cours"}</small>
          {invitation?.status === "accepted" && invitation.routeMode === "preview" ? <button type="button" disabled={submitting} onClick={() => void preparePublic()}><Headphones />Préparer le direct</button> : null}
          {invitation?.status === "accepted" && invitation.routeMode === "public" && !isOnAir ? <button type="button" className="is-primary" disabled={submitting || !mediaSession?.peerPresent} onClick={() => void goOnAir()}><Radio />Lancer dans la Loge</button> : null}
          {status === "pending" && !invitation ? <button type="button" disabled={submitting} onClick={() => void cancelDemoInvitation()}><RotateCcw />Annuler l’invitation</button> : null}
          {isOnAir ? <button type="button" className="is-end" disabled={submitting} onClick={() => void endMoment()}><PhoneOff />Mettre fin au moment</button> : null}
          {status === "ended" ? <button type="button" onClick={onBack}>Choisir un autre moment</button> : null}
        </div>
      )}
      {error ? <p className="vip-moment__error" role="alert">{error}</p> : null}
    </section>
  );
}

export default function LogeDedicationPanel({ loge, disabled, execute, initialFanId = null, onFanChange, waitingGuests, source, roomId }: {
  loge: LogeState; disabled: boolean; execute: (command: RoomToolsCommand) => Promise<unknown>; initialFanId?: string | null;
  onFanChange?: (id: string) => void;
  waitingGuests: readonly RoomPerson[];
  source: "demo" | "live";
  roomId: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedFanId, setSelectedFanId] = useState<string | null>(null);
  const [action, setAction] = useState<MomentAction | null>(null);
  const deliveredMediaRef = useRef<{ blob: Blob; fanId: string; format: "audio" | "video"; privateContent: string } | null>(null);
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
  const selectedFan = allPeople.find((person) => person.id === selectedFanId) ?? null;
  useEffect(() => { if (initialFanId && allPeople.some((person) => person.id === initialFanId)) setSelectedFanId(initialFanId); }, [allPeople, initialFanId]);
  useEffect(() => { if (!selectedFanId && allPeople[0]) setSelectedFanId(allPeople[0].id); }, [allPeople, selectedFanId]);

  const createDedication = async (format: "audio" | "video", blob: Blob, seconds: number) => {
    if (!selectedFan) throw new Error("Choisis un fan avant d’envoyer la dédicace.");
    let privateContent: string;
    if (source === "live" && UUID_PATTERN.test(selectedFan.id)) {
      const delivered = deliveredMediaRef.current;
      if (delivered?.blob === blob && delivered.fanId === selectedFan.id && delivered.format === format) privateContent = delivered.privateContent;
      else {
        const conversation = await messagingRepository.getOrCreateDirectConversation(selectedFan.id, `moment-vip:${createMessagingClientMessageId()}`);
        const extension = blob.type.includes("ogg") ? "ogg" : "webm";
        const displayName = `moment-vip-${selectedFan.name.toLocaleLowerCase("fr").replace(/[^a-z0-9]+/g, "-")}.${extension}`;
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
          deliveredMediaRef.current = { blob, fanId: selectedFan.id, format, privateContent };
        } catch (reason) {
          await messagingAttachmentsRepository.discardUpload(prepared.uploadId).catch(() => undefined); throw reason;
        }
      }
    } else privateContent = URL.createObjectURL(blob);
    await execute({ type: "loge.moment.add", moment: {
      id: createMomentId(format), kind: "dedication", title: format === "audio" ? "Dédicace audio" : "Dédicace vidéo",
      beneficiary: selectedFan, status: "completed", format, privateContent,
    } });
    deliveredMediaRef.current = null;
  };
  const chooseFan = (person: RoomPerson) => { setSelectedFanId(person.id); onFanChange?.(person.id); setAction(null); };
  return (
    <div className={`vip-moment is-member-console${action ? " is-executing" : ""}`} aria-label="Moment VIP">
      <div className={`vip-moment__layout${action ? " has-action" : ""}`}>
        {!action ? <section className="vip-moment__fans" aria-label="Membres de la Loge et VIP">
          <label className="vip-moment__search"><span className="sr-only">Rechercher une personne</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un membre ou VIP…" /><Search aria-hidden="true" /></label>
          <div className="vip-moment__fan-list" role="group" aria-label={`${displayedFans.length} membres de la Loge et VIP`} tabIndex={0}>{displayedFans.length ? displayedFans.map((person) => <FanCard key={person.id} person={person} queued={queuedFanIds.has(person.id)} selected={person.id === selectedFanId} onSelect={() => chooseFan(person)} />) : <p><Users /><span><strong>Aucune personne trouvée</strong><small>Modifie ta recherche.</small></span></p>}</div>
        </section> : null}
        {selectedFan && action === "audio" ? <MediaRecorderPanel format="audio" fan={selectedFan} disabled={disabled} onBack={() => setAction(null)} onCreateMoment={createDedication} /> : null}
        {selectedFan && action === "video" ? <MediaRecorderPanel format="video" fan={selectedFan} disabled={disabled} onBack={() => setAction(null)} onCreateMoment={createDedication} /> : null}
        {selectedFan && action === "live" ? <LiveInvitePanel roomId={roomId} source={source} fan={selectedFan} disabled={disabled} execute={execute} onBack={() => setAction(null)} /> : null}
        {!action ? <ActionSelector selectedFan={selectedFan} onChoose={setAction} /> : null}
      </div>
    </div>
  );
}
