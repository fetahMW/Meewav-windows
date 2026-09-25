import {
  CalendarPlus,
  Check,
  ChevronRight,
  Gift,
  Headphones,
  HeartHandshake,
  LockKeyhole,
  Mic,
  Play,
  Radio,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Type,
  Users,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LogeState, RoomPerson, RoomToolsCommand, VipMoment } from "../roomTools.types";

const STATUS: Record<VipMoment["status"], string> = {
  pending: "À organiser",
  scheduled: "Invitation envoyée",
  accepted: "Accepté",
  declined: "Refusé",
  live: "En direct",
  completed: "Réalisé",
  cancelled: "Annulé",
};

const STUDIO_WAVE = Array.from({ length: 78 }, (_, index) => Math.round(16 + Math.abs(Math.sin(index * .43)) * 51 + Math.abs(Math.cos(index * .16)) * 25));
const PREVIEW_WAVE = Array.from({ length: 56 }, (_, index) => Math.round(17 + Math.abs(Math.sin(index * .37 + .5)) * 63));
const DEDICATION_TEMPLATES: Array<{ Icon: typeof HeartHandshake; title: string; description: string; format: "audio" | "video" | "text" }> = [
  { Icon: HeartHandshake, title: "Face-à-face express", description: "Échange privé de 3 minutes", format: "audio" },
  { Icon: Video, title: "Vidéo souvenir", description: "Mini message personnalisé", format: "video" },
  { Icon: Mic, title: "Note vocale privée", description: "Remerciement audio rapide", format: "audio" },
  { Icon: Type, title: "Texte signé", description: "Message personnel écrit", format: "text" },
  { Icon: Radio, title: "Réaction à une création", description: "Répondre au son d’un fan", format: "audio" },
  { Icon: LockKeyhole, title: "Snippet secret", description: "Partager un extrait exclusif", format: "audio" },
];

type Workspace = VipMoment["kind"] | null;
type MomentVisual = { Icon: typeof HeartHandshake; tone: "face" | "audio" | "text" | "video" | "gift" };

function visualForMoment(moment: VipMoment): MomentVisual {
  if (moment.kind === "face-to-face") return { Icon: HeartHandshake, tone: "face" };
  if (moment.kind === "gift-redemption") return { Icon: Gift, tone: "gift" };
  if (moment.format === "video" || /vidéo/i.test(moment.title)) return { Icon: Video, tone: "video" };
  if (moment.format === "text" || /texte/i.test(moment.title)) return { Icon: Type, tone: "text" };
  return { Icon: Radio, tone: "audio" };
}

function nextAction(moment: VipMoment) {
  if (moment.status === "pending") return { label: "Programmer", status: "scheduled" as const, Icon: CalendarPlus };
  if (moment.status === "accepted") return { label: "Démarrer", status: "live" as const, Icon: Radio };
  if (moment.status === "live") return { label: "Terminer", status: "completed" as const, Icon: Check };
  return null;
}

function createMomentId(prefix: string) {
  return `moment-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function PersonButton({ person, selected, label, onClick }: { person: RoomPerson; selected: boolean; label: string; onClick: () => void }) {
  return <button type="button" className={selected ? "is-selected" : ""} aria-pressed={selected} onClick={onClick}>
    <img src={person.avatarUrl} alt="" /><span><strong>{person.name}</strong><small>{person.role}</small></span><em>{label}</em>
  </button>;
}

export default function LogeMomentsPanel({
  loge,
  disabled,
  execute,
}: {
  loge: LogeState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  const [workspace, setWorkspace] = useState<Workspace>(null);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [recordingFormat, setRecordingFormat] = useState<"audio" | "video">("audio");
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [dedicationTitle, setDedicationTitle] = useState("Dédicace vocale");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const recordingUrlRef = useRef<string | null>(null);
  const previewMediaRef = useRef<HTMLMediaElement | null>(null);

  const activeMoments = loge.moments.filter((moment) => !["completed", "cancelled", "declined"].includes(moment.status));
  const faceMoments = loge.moments.filter((moment) => moment.kind === "face-to-face");
  const dedicationMoments = loge.moments.filter((moment) => moment.kind === "dedication");
  const rewardMoments = loge.moments.filter((moment) => moment.kind === "gift-redemption");
  const faceCount = faceMoments.filter((moment) => !["completed", "cancelled", "declined"].includes(moment.status)).length;
  const dedicationCount = dedicationMoments.filter((moment) => !["completed", "cancelled", "declined"].includes(moment.status)).length;
  const rewardCount = rewardMoments.filter((moment) => !["completed", "cancelled", "declined"].includes(moment.status)).length;
  const people = useMemo(() => [
    ...loge.moments.map((moment) => moment.beneficiary),
    ...loge.questions.map((question) => question.author),
  ].filter((person, index, all) => all.findIndex((candidate) => candidate.id === person.id) === index), [loge.moments, loge.questions]);
  const selectedRecipient = people.find((person) => person.id === selectedRecipientId) ?? people[0] ?? null;

  useEffect(() => {
    if (!selectedRecipientId && people[0]) setSelectedRecipientId(people[0].id);
  }, [people, selectedRecipientId]);

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
  }, []);

  const setStatus = (moment: VipMoment, status: VipMoment["status"]) => moment.kind === "gift-redemption" && status === "completed"
    ? execute({ type: "gift.redemption.use", accountId: moment.beneficiary.id, redemptionId: `redemption-${moment.id.replace(/^moment-/, "")}` })
    : execute({ type: "loge.moment.status", momentId: moment.id, status });

  const addMoment = (kind: VipMoment["kind"], title: string, beneficiary: RoomPerson, format?: VipMoment["format"], privateContent?: string) => execute({
    type: "loge.moment.add",
    moment: { id: createMomentId(kind), kind, title, beneficiary, status: "pending", format, privateContent },
  });

  const stopRecording = () => {
    recorderRef.current?.stop();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setRecording(false);
  };

  const startRecording = async () => {
    setRecordingError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("L’enregistrement local n’est pas disponible dans ce navigateur.");
      return;
    }
    try {
      if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current);
      recordingUrlRef.current = null;
      setRecordingUrl(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: recordingFormat === "video" });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        if (!chunksRef.current.length) return;
        const url = URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType }));
        recordingUrlRef.current = url;
        setRecordingUrl(url);
      };
      recorder.start(250);
      setRecordingSeconds(0);
      setRecording(true);
      timerRef.current = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    } catch {
      setRecordingError("Autorisez le micro pour enregistrer cette dédicace privée.");
    }
  };

  const sendDedication = async () => {
    if (!selectedRecipient || !recordingUrl) return;
    await addMoment("dedication", dedicationTitle, selectedRecipient, recordingFormat, recordingUrl);
    setRecordingUrl(null);
    recordingUrlRef.current = null;
  };

  const planning = <>
    <div className="room-loge-moments__planning-title"><strong>Planning privé</strong><i /></div>
    <section className="room-loge-moments__timeline" aria-label="Planning privé des Moments VIP">
      <div className="room-loge-moments__list">
        {activeMoments.map((moment, index) => {
          const visual = visualForMoment(moment);
          const action = nextAction(moment);
          return <article key={moment.id} className={`is-${visual.tone} is-${moment.status}`}>
            <i className="room-loge-moments__node" aria-hidden="true" />
            <span className="room-loge-moments__icon"><visual.Icon /></span>
            <span className={`room-loge-moments__avatar${index === 0 ? " is-featured" : ""}`}><img src={moment.beneficiary.avatarUrl} alt="" /></span>
            <span className="room-loge-moments__identity"><strong>{moment.beneficiary.name}</strong><small>{moment.title}</small></span>
            <span className={`room-loge-moments__status is-${moment.status}`}><i aria-hidden="true" />{STATUS[moment.status]}</span>
            <div className="room-loge-moments__actions">
              {action ? <button type="button" className="is-program" disabled={disabled} onClick={() => void setStatus(moment, action.status)}><action.Icon />{action.label}</button> : null}
              <button type="button" className="is-cancel" disabled={disabled} onClick={() => void setStatus(moment, "cancelled")}><X />Annuler</button>
            </div>
          </article>;
        })}
      </div>
    </section>
  </>;

  const faceManager = <section className="room-loge-moments__manager is-face" aria-label="Gestion des face-à-face">
    <div className="room-loge-moments__manager-main">
      <header><span><HeartHandshake /><span><strong>Salon face-à-face</strong><small>Invitations, direct et historique privé</small></span></span><b>{faceCount} actif{faceCount > 1 ? "s" : ""}</b></header>
      <div className="room-loge-moments__manager-list">{faceMoments.map((moment) => {
        const action = nextAction(moment);
        return <article key={moment.id}><img src={moment.beneficiary.avatarUrl} alt="" /><span><strong>{moment.beneficiary.name}</strong><small>{moment.title}</small></span><em className={`is-${moment.status}`}>{STATUS[moment.status]}</em>{action ? <button type="button" disabled={disabled} onClick={() => void setStatus(moment, action.status)}><action.Icon />{action.label}</button> : null}</article>;
      })}</div>
    </div>
    <aside className="room-loge-moments__recipients"><header><strong>Inviter un membre VIP</strong><small>Depuis la file privée</small></header>{people.map((person) => <PersonButton key={person.id} person={person} selected={false} label="Inviter" onClick={() => void addMoment("face-to-face", "Face-à-face 5 minutes", person)} />)}</aside>
  </section>;

  const dedicationManager = <>
    <section className="room-loge-moments__manager is-dedication" aria-label="Studio de dédicace">
      <div className="room-loge-moments__studio">
        <header><span><strong>Studio de dédicace <Sparkles /></strong><small>{dedicationTitle} · Enregistrement privé pour un fan.</small></span><span className="room-loge-moments__format"><button type="button" className={recordingFormat === "audio" ? "is-active" : ""} onClick={() => setRecordingFormat("audio")}>Audio</button><button type="button" className={recordingFormat === "video" ? "is-active" : ""} onClick={() => setRecordingFormat("video")}>Vidéo</button></span></header>
        <div className="room-loge-moments__recorder">
          <span className="room-loge-moments__recording-state"><i className={recording ? "is-live" : ""} />{recording ? "ENREGISTREMENT EN COURS" : recordingUrl ? "PRISE PRÊTE" : "PRÊT À ENREGISTRER"}</span>
          <span className="room-loge-moments__recording-time"><strong>{`${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}`}</strong><small>/ 01:30</small></span>
          <span className="room-loge-moments__studio-wave" aria-hidden="true">{STUDIO_WAVE.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span>
          <button type="button" className={`room-loge-moments__record${recording ? " is-recording" : ""}`} disabled={disabled} aria-label={recording ? "Arrêter l’enregistrement" : "Démarrer l’enregistrement"} onClick={() => recording ? stopRecording() : void startRecording()}>{recording ? <Square /> : <Mic />}</button>
          <span className="room-loge-moments__record-progress"><i style={{ width: `${Math.min(100, recordingSeconds / 90 * 100)}%` }} /></span>
        </div>
        <div className="room-loge-moments__preview"><span><small>APERÇU</small><button type="button" disabled={!recordingUrl} aria-label="Lire l’aperçu" onClick={() => void previewMediaRef.current?.play()}><Play /></button></span><span className="room-loge-moments__preview-wave" aria-hidden="true">{PREVIEW_WAVE.map((height, index) => <i key={index} style={{ height: `${height}%` }} />)}</span><time>{recordingUrl ? `${String(Math.floor(recordingSeconds / 60)).padStart(2, "0")}:${String(recordingSeconds % 60).padStart(2, "0")}` : "00:00"}<small>/ 01:30</small></time>{recordingUrl ? recordingFormat === "audio" ? <audio ref={(node) => { previewMediaRef.current = node; }} src={recordingUrl} /> : <video ref={(node) => { previewMediaRef.current = node; }} src={recordingUrl} /> : null}</div>
        <div className="room-loge-moments__studio-actions"><button type="button" disabled={!recordingUrl} onClick={() => void previewMediaRef.current?.play()}><Headphones />Réécouter</button><button type="button" disabled={!recordingUrl} onClick={() => { if (recordingUrlRef.current) URL.revokeObjectURL(recordingUrlRef.current); recordingUrlRef.current = null; setRecordingUrl(null); setRecordingSeconds(0); }}><RotateCcw />Refaire</button><button type="button" className="is-primary" disabled={disabled || !recordingUrl || !selectedRecipient} onClick={() => void sendDedication()}><Send />Envoyer au fan</button></div>
        {recordingError ? <p className="room-loge-moments__recording-error">{recordingError}</p> : null}
        <p className="room-loge-moments__private"><LockKeyhole />La dédicace sera envoyée en privé à l’heure que vous choisissez.</p>
      </div>
      <aside className="room-loge-moments__recipients"><header><strong>Destinataire</strong><small>Choisissez un fan dans la file d’attente.</small></header>{people.map((person) => <PersonButton key={person.id} person={person} selected={person.id === selectedRecipient?.id} label={person.id === selectedRecipient?.id ? "Choisi" : "Choisir"} onClick={() => setSelectedRecipientId(person.id)} />)}<button type="button" className="room-loge-moments__full-queue"><Users />Voir toute la file d’attente</button></aside>
    </section>
    <section className="room-loge-moments__templates"><header><strong>Autres moments VIP</strong><small>Créez d’autres expériences exclusives pour vos fans.</small></header><div>{DEDICATION_TEMPLATES.map(({ Icon, title, description, format }) => <button type="button" key={title} onClick={() => { setDedicationTitle(title); if (format === "video") setRecordingFormat("video"); else setRecordingFormat("audio"); }}><Icon /><strong>{title}</strong><small>{description}</small><em>Lancer</em></button>)}</div></section>
  </>;

  const rewardManager = <section className="room-loge-moments__manager is-rewards" aria-label="Gestion des récompenses">
    <div className="room-loge-moments__manager-main"><header><span><Gift /><span><strong>Récompenses à honorer</strong><small>Validez uniquement les avantages réellement remis.</small></span></span><b>{rewardCount} en attente</b></header><div className="room-loge-moments__manager-list">{rewardMoments.length ? rewardMoments.map((moment) => <article key={moment.id}><img src={moment.beneficiary.avatarUrl} alt="" /><span><strong>{moment.beneficiary.name}</strong><small>{moment.title}</small></span><em className={`is-${moment.status}`}>{STATUS[moment.status]}</em>{moment.status !== "completed" ? <button type="button" disabled={disabled} onClick={() => void setStatus(moment, "completed")}><Check />Marquer remis</button> : null}</article>) : <p className="room-loge-moments__empty"><Gift /><strong>Aucune récompense en attente</strong><small>Les cadeaux avec avantage à honorer apparaîtront automatiquement ici.</small></p>}</div></div>
    <aside className="room-loge-moments__reward-guide"><Sparkles /><strong>Suivi fiable</strong><p>Chaque remise conserve son statut. Une récompense validée ne peut pas être consommée deux fois.</p><button type="button" onClick={() => setWorkspace(null)}>Voir tout le planning</button></aside>
  </section>;

  return <div className={`room-loge-moments${workspace ? " has-workspace" : ""}`}>
    <header className="room-loge-moments__hero"><span><span className="room-loge-moments__title"><strong>Moments VIP</strong><Sparkles aria-hidden="true" /></span><small>Face-à-face, dédicaces et cadeaux à honorer</small></span><b><i aria-hidden="true" />{activeMoments.length} À TRAITER</b></header>
    <div className="room-loge-moments__summary" aria-label="Résumé des Moments VIP">
      <button type="button" className={`is-face${workspace === "face-to-face" ? " is-active" : ""}`} aria-label={`Gérer les ${faceCount} moments Face-à-face`} aria-pressed={workspace === "face-to-face"} onClick={() => setWorkspace((current) => current === "face-to-face" ? null : "face-to-face")}><span><HeartHandshake /></span><span><strong>Face-à-face</strong><small><b>{faceCount}</b> moments</small></span><ChevronRight /></button>
      <button type="button" className={`is-audio${workspace === "dedication" ? " is-active" : ""}`} aria-label={`Gérer les ${dedicationCount} demandes de dédicace`} aria-pressed={workspace === "dedication"} onClick={() => setWorkspace((current) => current === "dedication" ? null : "dedication")}><span><Radio /></span><span><strong>Dédicaces</strong><small><b>{dedicationCount}</b> demandes</small></span><ChevronRight /></button>
      <button type="button" className={`is-gift${workspace === "gift-redemption" ? " is-active" : ""}`} aria-label={`Gérer les ${rewardCount} récompenses à honorer`} aria-pressed={workspace === "gift-redemption"} onClick={() => setWorkspace((current) => current === "gift-redemption" ? null : "gift-redemption")}><span><Gift /></span><span><strong>Récompenses</strong><small><b>{rewardCount}</b> à honorer</small></span><ChevronRight /></button>
    </div>
    <div className="room-loge-moments__workspace">{workspace === "face-to-face" ? faceManager : workspace === "dedication" ? dedicationManager : workspace === "gift-redemption" ? rewardManager : planning}</div>
    {!workspace ? <footer className="room-loge-moments__relationship"><span className="room-loge-moments__relationship-icon"><Sparkles /></span><span><strong>Gardez votre relation fan précieuse</strong><small>Chaque moment renforce le lien et crée des souvenirs uniques.</small></span><span className="room-loge-moments__people" aria-label={`${people.length + 24} membres engagés`}>{people.slice(0, 4).map((person) => <img key={person.id} src={person.avatarUrl} alt="" />)}<b>+24</b></span></footer> : null}
  </div>;
}
