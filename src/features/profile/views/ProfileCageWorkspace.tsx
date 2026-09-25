import { isProfileLocalPreviewEnabled } from "../profile.preview";
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BellRing,
  Bolt,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Copy,
  DoorOpen,
  Gift,
  Headphones,
  Heart,
  LockKeyhole,
  Mail,
  Mic2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Rocket,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TicketCheck,
  Timer,
  Trash2,
  Trophy,
  UserPlus,
  Users,
  Video,
  Vote,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configurationFromProfileCage, stageCageLaunchDraft } from "../../rooms/launch/cageLaunch";

type ProfileCageWorkspaceProps = {
  storageScope: string | null;
  onBack: () => void;
  onDone: (message: string) => void;
};

type CageStatus = "Brouillon" | "Invitations en attente" | "Programmée" | "Prête" | "En cours" | "Terminée" | "Annulée";

type CageDraft = {
  model: string;
  title: string;
  description: string;
  type: string;
  format: string;
  duration: string;
  participants: number;
  importSource: string;
  inviteMessage: string;
  inviteeIds: string[];
  invitationsSent: boolean;
  roundsOverride: string | null;
  passage: string;
  vote: string;
  criteria: string;
  reward: string;
  date: string;
  time: string;
  room: string;
  autoReminder: boolean;
  launchLater: boolean;
  scheduled: boolean;
};

type CageEntry = CageDraft & {
  id: string;
  status: CageStatus;
  info: string;
  schedule: string;
  lastStep: number;
};

type CageContact = {
  id: string;
  name: string;
  username: string;
  role: string;
  status: string;
};

type CageTwist = {
  label: string;
  color: string;
  icon: LucideIcon;
  isCustom?: boolean;
};

const CAGE_STORAGE_KEY = "meewav-profile-cages-v1";
const cageStatuses: CageStatus[] = ["Brouillon", "Invitations en attente", "Programmée", "Prête", "En cours", "Terminée", "Annulée"];

const cageSteps = ["Format", "Infos", "Participants", "Invitations", "Règles", "Programmation", "Récap"] as const;

const cageStepDetails: Array<{ icon: LucideIcon; title: string; subtitle: string }> = [
  { icon: SlidersHorizontal, title: "Format de Cage", subtitle: "Choisis une base universelle ou configure la Cage à la main." },
  { icon: Pencil, title: "Infos", subtitle: "Nom, description, type, format et durée estimée." },
  { icon: Users, title: "Participants", subtitle: "Ajoute, importe et suis les participants avant le live." },
  { icon: Mail, title: "Invitations", subtitle: "Prépare le message, envoie et suis les réponses." },
  { icon: ShieldCheck, title: "Règles", subtitle: "Passages ou manches, durée, vote, critères et récompense." },
  { icon: CalendarClock, title: "Programmation", subtitle: "Date, heure, Room associée, rappel et lancement plus tard." },
  { icon: CheckCircle2, title: "Récapitulatif", subtitle: "Tout est prêt à sauvegarder, programmer ou lancer en Room." },
];

const cageModels: Array<{ title: string; detail: string; icon: LucideIcon; type?: string; format?: string }> = [
  { title: "Configurer manuellement", detail: "Créer un format entièrement sur mesure.", icon: SlidersHorizontal },
  { title: "Open mic", detail: "Passages individuels dans un ordre ouvert.", icon: Mic2, type: "Open mic", format: "Passages libres" },
  { title: "1v1 standard", detail: "Face-à-face adaptable à toutes les disciplines.", icon: AudioLines, type: "1v1 standard", format: "Élimination directe" },
  { title: "Équipe vs équipe", detail: "Confrontation collective avec passages alternés.", icon: Users, type: "Équipe vs équipe", format: "Round robin" },
  { title: "Tournoi", detail: "Tableau à élimination ou classement par points.", icon: Trophy, type: "Tournoi", format: "Élimination directe" },
];

const cageFilters: Array<{ label: string; status: CageStatus | null }> = [
  { label: "Toutes", status: null },
  { label: "Brouillons", status: "Brouillon" },
  { label: "Invitations", status: "Invitations en attente" },
  { label: "Programmées", status: "Programmée" },
  { label: "Prêtes", status: "Prête" },
  { label: "En cours", status: "En cours" },
  { label: "Terminées", status: "Terminée" },
  { label: "Annulées", status: "Annulée" },
];

const participantNames = ["Maya", "Noa", "Kenza", "Sami", "Lio", "Ari", "Jules", "Nina", "Yanis", "Soa", "Milo", "Lina", "Eden", "Tess", "Romy", "Ilyes"];

const cageContacts: CageContact[] = [
  { id: "lunamuse", name: "LunaMuse", username: "lunamuse", role: "Participant", status: "Disponible" },
  { id: "norakeys", name: "NoraKeys", username: "norakeys", role: "Régie", status: "Peut aider" },
  { id: "echo-flow", name: "Eli Moreau", username: "eli_moreau", role: "Participant", status: "En ligne" },
  { id: "neon-pulse", name: "Neon Pulse", username: "neon_pulse", role: "Participant", status: "Disponible" },
  { id: "stellar-vibe", name: "Stellar Vibe", username: "stellar_vibe", role: "Participant", status: "En ligne" },
  { id: "lisa-music", name: "Lisa Morel", username: "lisa_morel", role: "Régie", status: "Hors ligne" },
  { id: "the-producer", name: "Theo Lane", username: "theo_lane", role: "Participant", status: "Disponible" },
  { id: "vocal-queen", name: "Nova Ray", username: "nova_ray", role: "Participant", status: "Hors ligne" },
  { id: "lena-martin", name: "Léna Martin", username: "lena_martin", role: "Participant", status: "Disponible" },
  { id: "sacha-diallo", name: "Sacha Diallo", username: "sacha_diallo", role: "Participant", status: "En ligne" },
  { id: "ilyes-karim", name: "Ilyes Karim", username: "ilyes_karim", role: "Participant", status: "Disponible" },
];

const legacyInviteeSuffixes: Record<string, string> = {
  lena: "lena-martin",
  sacha: "sacha-diallo",
  ilyes: "ilyes-karim",
};

const meewavContactIds = new Set(cageContacts.map((contact) => contact.id));
const cageImportSources = ["Recherche", "Abonnés", "Communauté", "Invités récents", "Profils suivis"] as const;
const migrateLegacyInviteeId = (id: string) => {
  if (meewavContactIds.has(id)) return id;
  const parts = id.split("-");
  return legacyInviteeSuffixes[parts[parts.length - 1]] ?? id;
};

const defaultDraft: CageDraft = {
  model: "Configurer manuellement",
  title: "Nouvelle Cage",
  description: "Session ouverte à tous les talents.",
  type: "Open mic",
  format: "Passages libres",
  duration: "45 min",
  participants: 8,
  importSource: "Abonnés",
  inviteMessage: "Je te réserve une place dans La Cage. Confirme ta participation avant le live.",
  inviteeIds: [],
  invitationsSent: false,
  roundsOverride: null,
  passage: "90 sec",
  vote: "Aucun vote",
  criteria: "Aucun classement",
  reward: "Golden Like",
  date: "",
  time: "",
  room: "La Cage",
  autoReminder: true,
  launchLater: true,
  scheduled: false,
};

const initialCages: CageEntry[] = [
  { ...defaultDraft, id: "session-alpha", title: "Session Alpha", status: "Invitations en attente", info: "8 participants · 5 réponses", schedule: "Vendredi 21:00", lastStep: 3, invitationsSent: true, inviteeIds: ["lunamuse", "echo-flow", "neon-pulse", "stellar-vibe", "lisa-music"] },
  { ...defaultDraft, id: "cage-1v1", title: "Cage 1v1", model: "1v1 standard", type: "1v1 standard", format: "Élimination directe", vote: "Public + host", criteria: "Maîtrise, présence, originalité", participants: 16, status: "Brouillon", info: "16 participants · élimination directe", schedule: "Non programmée", lastStep: 2 },
  { ...defaultDraft, id: "open-mic-session", title: "Open Mic Session", model: "Open mic", type: "Open mic", participants: 12, status: "Programmée", info: "12 participants · 12 réponses", schedule: "Samedi 18:30 · Room A", lastStep: 6, invitationsSent: true, scheduled: true, date: "2026-07-18", time: "18:30", room: "Room principale" },
  { ...defaultDraft, id: "teams-cup", title: "Équipe vs équipe", model: "Équipe vs équipe", type: "Équipe vs équipe", format: "Round robin", vote: "Jury", criteria: "Technique, créativité, impact", participants: 8, status: "Prête", info: "8 participants · équipes confirmées", schedule: "Room La Cage prête", lastStep: 6, invitationsSent: true },
  { ...defaultDraft, id: "tournoi-libre", title: "Tournoi libre", model: "Tournoi", type: "Tournoi", format: "Classement par points", vote: "Public", criteria: "Énergie, précision, engagement du public", participants: 8, status: "En cours", info: "4 rounds · vote public", schedule: "Room ouverte", lastStep: 6, invitationsSent: true },
  { ...defaultDraft, id: "finale-ouest", title: "Finale Ouest", participants: 8, status: "Terminée", info: "8 participants · gagnant validé", schedule: "Historique disponible", lastStep: 0 },
];

function loadCageEntries(storageKey: string | null, preview: boolean): CageEntry[] {
  if (!storageKey || typeof window === "undefined") return preview ? initialCages : [];
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return preview ? initialCages : [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return preview ? initialCages : [];
    const entries = parsed.flatMap((candidate): CageEntry[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const source = candidate as Partial<CageEntry>;
      if (typeof source.id !== "string" || typeof source.title !== "string" || !cageStatuses.includes(source.status as CageStatus)) return [];
      const inviteeIds = Array.isArray(source.inviteeIds)
        ? [...new Set(source.inviteeIds
          .filter((id): id is string => typeof id === "string")
          .map(migrateLegacyInviteeId)
          .filter((id) => meewavContactIds.has(id)))]
        : [];
      const storedImportSource = typeof source.importSource === "string" ? source.importSource : defaultDraft.importSource;
      const importSource = storedImportSource === "Contacts"
        ? "Profils suivis"
        : cageImportSources.includes(storedImportSource as (typeof cageImportSources)[number])
          ? storedImportSource
          : defaultDraft.importSource;
      return [{
        ...defaultDraft,
        ...source,
        id: source.id,
        title: source.title,
        status: source.status as CageStatus,
        importSource,
        inviteeIds,
        info: typeof source.info === "string" ? source.info : `${source.participants ?? defaultDraft.participants} participants`,
        schedule: typeof source.schedule === "string" ? source.schedule : "Non programmée",
        lastStep: typeof source.lastStep === "number" ? Math.max(0, Math.min(6, source.lastStep)) : 0,
      }];
    });
    return entries.length ? entries : initialCages;
  } catch {
    return preview ? initialCages : [];
  }
}

const defaultTwists: CageTwist[] = [
  { label: "READY", color: "#bd67ef", icon: AudioLines },
  { label: "HEART", color: "#f45b9a", icon: Heart },
  { label: "IMPACT", color: "#34c7e8", icon: Zap },
  { label: "FLASH", color: "#ff9d55", icon: Sparkles },
];

const customTwists: CageTwist[] = [
  { label: "FREEZE", color: "#55c6f5", icon: Sparkles, isCustom: true },
  { label: "REVERSE", color: "#ad68d9", icon: RotateCcw, isCustom: true },
  { label: "ECHO", color: "#68c47b", icon: AudioLines, isCustom: true },
  { label: "STORM", color: "#7489f7", icon: Bolt, isCustom: true },
  { label: "BOOST", color: "#ff7c58", icon: Radio, isCustom: true },
  { label: "WARP", color: "#906ee1", icon: Sparkles, isCustom: true },
];

const regisseurs = ["Maya Control", "Noa Live", "Kenza Tech", "Ari Stage", "Nina Pulse", "Eden Room", "Lio Signal", "Sami Link"];

const statusSlug = (status: string) => status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-");

function StatusPill({ status }: { status: string }) {
  return <span className={`profile-studio-status is-${statusSlug(status)}`}><i />{status}</span>;
}

function CageSelect({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) {
  return <label className="profile-cage-select"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function CageToggle({ label, detail, checked, onChange, icon: Icon }: { label: string; detail?: string; checked: boolean; onChange: () => void; icon: LucideIcon }) {
  return <button type="button" className={`profile-cage-toggle ${checked ? "is-on" : ""}`} onClick={onChange} aria-pressed={checked}><span><Icon size={17} /></span><span><strong>{label}</strong>{detail && <small>{detail}</small>}</span><i><b /></i></button>;
}

function CageConfirm({ title, detail, confirmLabel, icon: Icon, onCancel, onConfirm }: { title: string; detail: string; confirmLabel: string; icon: LucideIcon; onCancel: () => void; onConfirm: () => void }) {
  return <div className="profile-studio-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="profile-studio-confirm" role="alertdialog" aria-modal="true" aria-label={title}><span><Icon size={21} /></span><div><h4>{title}</h4><p>{detail}</p></div><footer><button type="button" onClick={onCancel}>Retour</button><button type="button" className="is-danger" onClick={onConfirm}><Icon size={15} /> {confirmLabel}</button></footer></section></div>;
}

function StepIntro({ step }: { step: number }) {
  const meta = cageStepDetails[step];
  const Icon = meta.icon;
  return <div className="profile-cage-step-intro"><span><Icon size={20} /></span><div><small>Étape {step + 1} sur {cageSteps.length}</small><h4>{meta.title}</h4><p>{meta.subtitle}</p></div><strong>{String(step + 1).padStart(2, "0")} / 07</strong></div>;
}

export default function ProfileCageWorkspace({ storageScope, onBack, onDone }: ProfileCageWorkspaceProps) {
  const navigate = useNavigate();
  const storageKey = storageScope ? `${CAGE_STORAGE_KEY}:${storageScope}` : null;
  const [screen, setScreen] = useState<"overview" | "editor" | "detail" | "launch">("overview");
  const [entries, setEntries] = useState<CageEntry[]>(() => loadCageEntries(storageKey, isProfileLocalPreviewEnabled()));
  const [filter, setFilter] = useState("Toutes");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ kind: "cancel" | "delete"; id: string } | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CageDraft>({ ...defaultDraft });
  const [formMessage, setFormMessage] = useState("");
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [invitePickerIds, setInvitePickerIds] = useState<string[]>([]);

  const [liveEntryId, setLiveEntryId] = useState<string | null>(null);
  const [liveStep, setLiveStep] = useState(2);
  const [regisseurState, setRegisseurState] = useState<"none" | "pending" | "confirmed">("none");
  const [regisseurName, setRegisseurName] = useState("");
  const [regisseurPickerOpen, setRegisseurPickerOpen] = useState(false);
  const [cagnotte, setCagnotte] = useState(false);
  const [cadeau, setCadeau] = useState(false);
  const [supportEnabled, setSupportEnabled] = useState(true);
  const [twists, setTwists] = useState<CageTwist[]>(defaultTwists);
  const [twistMenuIndex, setTwistMenuIndex] = useState<number | null>(null);
  const [playingTwist, setPlayingTwist] = useState<string | null>(null);
  const twistAudioRef = useRef<{ context: AudioContext; oscillator: OscillatorNode } | null>(null);
  const [headphoneDetected, setHeadphoneDetected] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [audioMode, setAudioMode] = useState<"Micro" | "Source">("Micro");
  const [micLevel, setMicLevel] = useState(0);
  const [networkOk, setNetworkOk] = useState(false);
  const [camera, setCamera] = useState("Auto");
  const [videoQuality, setVideoQuality] = useState("Auto");
  const [roomPrivate, setRoomPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [ticketEnabled, setTicketEnabled] = useState(false);
  const [ticketPrice, setTicketPrice] = useState("5.00€");
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownToken = useRef(0);

  useEffect(() => () => {
    countdownToken.current += 1;
    twistAudioRef.current?.oscillator.stop();
    void twistAudioRef.current?.context.close();
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(entries)); } catch { /* stockage local optionnel */ }
  }, [entries, storageKey]);

  const activeDetail = entries.find((entry) => entry.id === detailId) ?? null;
  const liveEntry = entries.find((entry) => entry.id === liveEntryId) ?? null;
  const activeFilter = cageFilters.find((item) => item.label === filter) ?? cageFilters[0];
  const filteredEntries = useMemo(() => entries.filter((entry) => activeFilter.status === null || entry.status === activeFilter.status), [entries, activeFilter.status]);
  const selectedInvitees = draft.inviteeIds.map((id) => cageContacts.find((contact) => contact.id === id)).filter((contact): contact is CageContact => Boolean(contact));
  const displayedParticipants = [...selectedInvitees.map((contact) => contact.name), ...participantNames.filter((name) => !selectedInvitees.some((contact) => contact.name === name))].slice(0, draft.participants);
  const isOpenMic = draft.type === "Open mic";
  const isTeamFormat = draft.type === "Équipe vs équipe";
  const roundsLabel = draft.roundsOverride ?? (isOpenMic ? "1 passage" : isTeamFormat ? "3 manches" : `${Math.ceil(draft.participants / 2)} rounds`);
  const roundsFieldLabel = isOpenMic ? "Passages" : isTeamFormat ? "Manches" : "Rounds";
  const roundsOptions = isOpenMic
    ? ["1 passage", "2 passages", "3 passages", "Passages libres"]
    : isTeamFormat
      ? ["1 manche", "3 manches", "5 manches", "7 manches"]
      : ["3 rounds", "4 rounds", "5 rounds", "8 rounds"];
  const voteOptions = isOpenMic ? ["Aucun vote", "Public", "Jury", "Host"] : ["Public", "Jury", "Host", "Public + host"];
  const criteriaOptions = isOpenMic
    ? ["Aucun classement", "Maîtrise, présence, originalité", "Engagement du public"]
    : ["Maîtrise, présence, originalité", "Technique, créativité, impact", "Énergie, précision, engagement du public"];
  const plannedSchedule = draft.date && draft.time ? `${draft.date.split("-").reverse().join("/")} · ${draft.time} · ${draft.room}` : "Non programmée";
  const computedStatus: CageStatus = draft.scheduled ? "Programmée" : draft.invitationsSent ? "Invitations en attente" : "Brouillon";
  const isStepValid = step === 1 ? draft.title.trim().length > 0 : step === 2 ? draft.participants >= 2 : true;
  const minDate = new Date().toISOString().slice(0, 10);

  const validateBaseConfiguration = (source: CageDraft) => {
    if (source.title.trim().length < 3) return { step: 1, message: "Donne un nom d’au moins 3 caractères à la Cage" };
    if (!source.description.trim()) return { step: 1, message: "Ajoute une courte description de la session" };
    if (!source.type.trim() || !source.format.trim() || !source.duration.trim()) return { step: 1, message: "Complète le type, le format et la durée" };
    if (!Number.isInteger(source.participants) || source.participants < 2 || source.participants > 16) return { step: 2, message: "Choisis une capacité comprise entre 2 et 16 participants" };
    if (source.inviteeIds.length > source.participants) return { step: 2, message: "Le nombre d’invités dépasse la capacité de la Cage" };
    return null;
  };

  const validateInvitations = (source: CageDraft) => {
    const baseError = validateBaseConfiguration(source);
    if (baseError) return baseError;
    if (source.inviteeIds.length === 0) return { step: 3, message: "Choisis au moins un invité avant l’envoi" };
    if (source.inviteMessage.trim().length < 10) return { step: 3, message: "Écris un message d’invitation d’au moins 10 caractères" };
    return null;
  };

  const validateSchedule = (source: CageDraft) => {
    if (!source.date || !source.time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(source.time)) return { step: 5, message: "Choisis une date et une heure valides" };
    const scheduledAt = new Date(`${source.date}T${source.time}:00`);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() <= Date.now()) return { step: 5, message: "La programmation doit être située dans le futur" };
    if (!source.room.trim()) return { step: 5, message: "Choisis la Room associée" };
    return null;
  };

  const validateLaunchConfiguration = (source: CageDraft) => {
    const baseError = validateBaseConfiguration(source);
    if (baseError) return baseError;
    const minimumInvitees = source.type === "Open mic" ? 1 : 2;
    if (source.inviteeIds.length < minimumInvitees) return { step: 3, message: `Sélectionne au moins ${minimumInvitees} invité${minimumInvitees > 1 ? "s" : ""} avant le lancement` };
    if (!source.invitationsSent) return { step: 3, message: "Envoie les invitations avant de lancer la Cage" };
    if (!source.passage.trim() || !source.vote.trim() || !source.criteria.trim()) return { step: 4, message: "Complète les règles de passage et de validation" };
    if (source.scheduled) return validateSchedule(source);
    return null;
  };

  const showValidationError = (error: { step: number; message: string }) => {
    setStep(error.step);
    setFormMessage(error.message);
    setScreen("editor");
  };

  const updateDraft = <K extends keyof CageDraft>(key: K, value: CageDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormMessage("");
  };

  const changeCageType = (type: string) => {
    const openMic = type === "Open mic";
    const matchingPreset = cageModels.find((model) => model.type === type);
    setDraft((current) => ({
      ...current,
      type,
      model: matchingPreset?.title ?? current.model,
      format: matchingPreset?.format ?? current.format,
      roundsOverride: null,
      vote: openMic ? "Aucun vote" : "Public + host",
      criteria: openMic ? "Aucun classement" : "Maîtrise, présence, originalité",
    }));
    setFormMessage("");
  };

  const selectCageModel = (model: typeof cageModels[number]) => {
    const openMic = model.type === "Open mic";
    setDraft((current) => ({
      ...current,
      model: model.title,
      ...(model.type && model.format ? {
        type: model.type,
        format: model.format,
        roundsOverride: null,
        vote: openMic ? "Aucun vote" : "Public + host",
        criteria: openMic ? "Aucun classement" : "Maîtrise, présence, originalité",
      } : {}),
    }));
    setFormMessage("");
  };

  const resetEditor = () => {
    setEditingId(null);
    setDraft({ ...defaultDraft, inviteeIds: [] });
    setStep(0);
    setFormMessage("");
    setInvitePickerOpen(false);
  };

  const openNew = () => {
    resetEditor();
    setScreen("editor");
  };

  const editEntry = (entry: CageEntry, initialStep = entry.lastStep) => {
    setEditingId(entry.id);
    setDraft({
      model: entry.model,
      title: entry.title,
      description: entry.description,
      type: entry.type,
      format: entry.format,
      duration: entry.duration,
      participants: entry.participants,
      importSource: entry.importSource,
      inviteMessage: entry.inviteMessage,
      inviteeIds: [...entry.inviteeIds],
      invitationsSent: entry.invitationsSent,
      roundsOverride: entry.roundsOverride,
      passage: entry.passage,
      vote: entry.vote,
      criteria: entry.criteria,
      reward: entry.reward,
      date: entry.date,
      time: entry.time,
      room: entry.room,
      autoReminder: entry.autoReminder,
      launchLater: entry.launchLater,
      scheduled: entry.scheduled,
    });
    setStep(Math.max(0, Math.min(6, initialStep)));
    setFormMessage("");
    setInvitePickerOpen(false);
    setActiveMenu(null);
    setScreen("editor");
  };

  const entryScheduleFor = (status: CageStatus, source: CageDraft) => {
    if (status === "Brouillon") return "Brouillon Studio";
    if (status === "Invitations en attente") return "Invitations en attente";
    if (source.date && source.time) return `${source.date.split("-").reverse().join("/")} · ${source.time} · ${source.room}`;
    if (status === "Prête") return "Room La Cage prête";
    return "Non programmée";
  };

  const persistEntry = (status: CageStatus, options: { openLaunch?: boolean; stayInEditor?: boolean; patch?: Partial<CageDraft> } = {}) => {
    const source: CageDraft = { ...draft, ...options.patch };
    const validationError = status === "Invitations en attente"
      ? validateInvitations(source)
      : status === "Programmée"
        ? validateBaseConfiguration(source) ?? validateSchedule(source)
        : status === "Prête" || status === "En cours"
          ? validateLaunchConfiguration(source)
          : null;
    if (validationError) {
      showValidationError(validationError);
      return null;
    }
    const next: CageEntry = {
      ...source,
      id: editingId ?? `cage-${Date.now()}`,
      status,
      info: `${source.participants} participants · ${source.format} · ${source.duration}`,
      schedule: entryScheduleFor(status, source),
      lastStep: step,
    };
    setEntries((current) => editingId ? current.map((entry) => entry.id === editingId ? next : entry) : [next, ...current]);
    setEditingId(next.id);
    onDone(`${next.title} sauvegardée dans Mes Cages`);
    if (options.openLaunch) {
      setLiveEntryId(next.id);
      setLiveStep(0);
      setScreen("launch");
    } else if (options.stayInEditor) {
      setDraft(source);
      setFormMessage(status === "Programmée" ? "Programmation enregistrée" : "Invitations envoyées et enregistrées");
    } else {
      setScreen("overview");
      setEditingId(null);
    }
    return next;
  };

  const updateStatus = (entryId: string, status: CageStatus, message: string, schedule?: string) => {
    setEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, status, schedule: schedule ?? entry.schedule } : entry));
    setActiveMenu(null);
    onDone(message);
  };

  const duplicateEntry = (entry: CageEntry) => {
    setEntries((current) => [{ ...entry, id: `${entry.id}-copy-${Date.now()}`, title: `${entry.title} copie`, status: "Brouillon", schedule: "Brouillon Studio", lastStep: 0, scheduled: false }, ...current]);
    setActiveMenu(null);
    setFilter("Toutes");
    onDone("Copie créée en brouillon");
  };

  const startLive = (entry: CageEntry) => {
    if (entry.status === "Terminée" || entry.status === "Annulée") {
      setDetailId(entry.id);
      setActiveMenu(null);
      setScreen("detail");
      onDone(entry.status === "Terminée" ? "Cette Cage est terminée" : "Cette Cage est annulée");
      return;
    }
    const validationError = validateLaunchConfiguration(entry);
    if (validationError) {
      editEntry(entry, validationError.step);
      setFormMessage(validationError.message);
      return;
    }
    setLiveEntryId(entry.id);
    setEditingId(entry.id);
    setDraft({ ...entry, inviteeIds: [...entry.inviteeIds] });
    setLiveStep(entry.status === "En cours" ? 3 : 0);
    setActiveMenu(null);
    setScreen("launch");
  };

  const primaryActionLabel = (status: CageStatus) => ({ Brouillon: "Continuer", "Invitations en attente": "Relancer", Programmée: "Voir", Prête: "Lancer en Room", "En cours": "Ouvrir", Terminée: "Résumé", Annulée: "Voir" })[status];

  const runPrimaryAction = (entry: CageEntry) => {
    if (entry.status === "Brouillon") return editEntry(entry, entry.lastStep);
    if (entry.status === "Invitations en attente") return editEntry(entry, 3);
    if (entry.status === "Programmée") return editEntry(entry, 6);
    if (entry.status === "Prête" || entry.status === "En cours") return startLive(entry);
    setDetailId(entry.id);
    setScreen("detail");
  };

  const openInvitePicker = () => {
    setInvitePickerIds([...draft.inviteeIds]);
    setInviteQuery("");
    setInvitePickerOpen(true);
  };

  const validateInvitePicker = () => {
    const capacities = [4, 8, 12, 16];
    const requiredCapacity = Math.max(draft.participants, invitePickerIds.length);
    const nextCapacity = capacities.find((capacity) => capacity >= requiredCapacity) ?? 16;
    setDraft((current) => ({ ...current, inviteeIds: [...invitePickerIds], participants: nextCapacity }));
    setInvitePickerOpen(false);
    setFormMessage("");
  };

  const sendInvitations = () => {
    const validationError = validateInvitations(draft);
    if (validationError) {
      setStep(validationError.step);
      setFormMessage(validationError.message);
      return;
    }
    persistEntry("Invitations en attente", { stayInEditor: true, patch: { invitationsSent: true, scheduled: false } });
  };

  const programDraft = () => {
    const validationError = validateBaseConfiguration(draft) ?? validateSchedule(draft);
    if (validationError) {
      setStep(validationError.step);
      setFormMessage(validationError.message);
      return;
    }
    persistEntry("Programmée", { stayInEditor: true, patch: { scheduled: true } });
  };

  const chooseRegisseur = (name: string) => {
    setRegisseurName(name);
    setRegisseurState("pending");
    setRegisseurPickerOpen(false);
    window.setTimeout(() => {
      setRegisseurState((current) => current === "pending" ? "confirmed" : current);
    }, 3000);
  };

  const stopTwistPreview = () => {
    try { twistAudioRef.current?.oscillator.stop(); } catch { /* already stopped */ }
    void twistAudioRef.current?.context.close();
    twistAudioRef.current = null;
    setPlayingTwist(null);
  };

  const playTwistPreview = (twist: CageTwist, index: number) => {
    if (playingTwist === twist.label) {
      stopTwistPreview();
      return;
    }
    stopTwistPreview();
    const AudioContextConstructor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = index % 2 === 0 ? "sawtooth" : "sine";
    oscillator.frequency.setValueAtTime([96, 132, 72, 184][index] ?? 110, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.075, context.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.44);
    twistAudioRef.current = { context, oscillator };
    setPlayingTwist(twist.label);
    oscillator.onended = () => {
      void context.close();
      twistAudioRef.current = null;
      setPlayingTwist((current) => current === twist.label ? null : current);
    };
  };

  const testMicro = () => {
    setMicLevel(0.64);
    window.setTimeout(() => setMicLevel(0.26), 3000);
  };

  const testNetwork = () => {
    setNetworkOk(false);
    window.setTimeout(() => {
      setNetworkOk(true);
      onDone("Réseau validé");
    }, 2000);
  };

  const cancelCountdown = () => {
    countdownToken.current += 1;
    setCountdown(null);
  };

  const validateFinalLaunch = () => {
    const source = liveEntry ?? draft;
    const configurationError = validateLaunchConfiguration(source);
    if (configurationError) {
      if (liveEntry) {
        editEntry(liveEntry, configurationError.step);
        setFormMessage(configurationError.message);
      } else {
        showValidationError(configurationError);
      }
      return false;
    }
    if (!networkOk) {
      setLiveStep(1);
      onDone("Valide le réseau avant de lancer la Room");
      return false;
    }
    if (roomPrivate && password.trim().length < 4) {
      setLiveStep(2);
      onDone("Ajoute un mot de passe d’au moins 4 caractères pour cette Room privée");
      return false;
    }
    return true;
  };

  const openLaunchSummary = () => {
    if (validateFinalLaunch()) setLiveStep(3);
  };

  const launchRoom = () => {
    if (!validateFinalLaunch()) return;
    try {
      const configuration = configurationFromProfileCage(liveEntry ?? draft);
      stageCageLaunchDraft(storageScope ?? "demo", configuration);
      navigate("/rooms/home?launch=cage");
    } catch {
      onDone("La configuration n’a pas pu être transmise au lancement. Réessaie sans quitter cette page.");
    }
  };

  const goBack = () => screen === "overview" ? onBack() : setScreen("overview");

  const renderInvitePicker = () => {
    const normalizedQuery = inviteQuery.trim().toLowerCase();
    const contacts = cageContacts.filter((contact) => !normalizedQuery || `${contact.name} ${contact.username} ${contact.role}`.toLowerCase().includes(normalizedQuery));
    return <section className="profile-cage-invite-picker" aria-label="Invités de la Cage"><header><div><span><UserPlus size={19} /></span><div><h4>Invités de la Cage</h4><p>{invitePickerIds.length} sélectionné{invitePickerIds.length > 1 ? "s" : ""} · Profils Meewav</p></div></div><button type="button" onClick={() => setInvitePickerOpen(false)} aria-label="Fermer"><X size={17} /></button></header><label className="profile-cage-invite-picker__search"><Search size={17} /><input value={inviteQuery} onChange={(event) => setInviteQuery(event.target.value)} placeholder="Rechercher un nom, @ ou rôle Meewav" /></label><div className="profile-cage-invite-picker__list">{contacts.map((contact) => { const selected = invitePickerIds.includes(contact.id); return <button key={contact.id} type="button" className={selected ? "is-selected" : ""} onClick={() => setInvitePickerIds((current) => selected ? current.filter((id) => id !== contact.id) : [...current, contact.id])}><span>{contact.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{contact.name}</strong><small>@{contact.username} · {contact.role}</small><em>{contact.status}</em></div><i>{selected ? <Check size={14} /> : <Plus size={14} />}</i></button>; })}</div><footer><button type="button" onClick={() => setInvitePickerOpen(false)}>Annuler</button><button type="button" className="is-primary" onClick={validateInvitePicker}><Check size={15} /> Valider</button></footer></section>;
  };

  const renderEditorStep = () => {
    if (invitePickerOpen && step === 3) return renderInvitePicker();
    if (step === 0) return <div className="profile-studio-choice-list is-real profile-cage-model-grid">{cageModels.map((item) => { const Icon = item.icon; const selected = draft.model === item.title; return <button key={item.title} type="button" className={selected ? "is-active" : ""} onClick={() => selectCageModel(item)}><span><Icon size={20} /></span><span><strong>{item.title}</strong><small>{item.detail}</small></span><i>{selected ? <Check size={14} /> : null}</i></button>; })}</div>;

    if (step === 1) return <div className="profile-studio-form-grid is-real profile-cage-info-grid"><label><span>Nom de la Cage</span><input value={draft.title} placeholder="Session Alpha" onChange={(event) => updateDraft("title", event.target.value)} /></label><label className="is-wide"><span>Description</span><textarea value={draft.description} placeholder="Session ouverte à tous les talents." onChange={(event) => updateDraft("description", event.target.value)} /></label><CageSelect label="Type" value={draft.type} options={["Open mic", "Tournoi", "1v1 standard", "Équipe vs équipe"]} onChange={changeCageType} /><CageSelect label="Format" value={draft.format} options={["Passages libres", "Élimination directe", "Round robin", "Classement par points"]} onChange={(value) => updateDraft("format", value)} /><CageSelect label="Durée estimée" value={draft.duration} options={["30 min", "45 min", "60 min", "90 min"]} onChange={(value) => updateDraft("duration", value)} /></div>;

    if (step === 2) return <div className="profile-cage-participants"><section className="profile-cage-capacity"><div><span className="profile-kicker"><Users size={14} /> Nombre</span><strong>{draft.participants} places</strong><p>La capacité adapte les passages, les équipes et le nombre de rounds.</p></div><div className="profile-studio-segmented">{[4, 8, 12, 16].map((count) => <button key={count} type="button" className={draft.participants === count ? "is-active" : ""} onClick={() => updateDraft("participants", count)}>{count}</button>)}</div></section><div className="profile-cage-import-actions"><button type="button" className={draft.importSource === "Recherche" ? "is-active" : ""} onClick={() => updateDraft("importSource", "Recherche")}><span><Search size={18} /></span><span><strong>Rechercher</strong><small>Trouver un profil Meewav</small></span><ChevronRight size={16} /></button><button type="button" className={draft.importSource !== "Recherche" ? "is-active" : ""} onClick={() => { const sources = cageImportSources.filter((source) => source !== "Recherche"); const current = sources.indexOf(draft.importSource as (typeof sources)[number]); updateDraft("importSource", sources[(current + 1 + sources.length) % sources.length]); }}><span><Users size={18} /></span><span><strong>Importer</strong><small>{draft.importSource === "Recherche" ? "Abonnés" : draft.importSource}</small></span><ChevronRight size={16} /></button></div><div className="profile-cage-participant-pills">{displayedParticipants.map((name, index) => <span key={`${name}-${index}`}><i>{index + 1}</i>{name}<Timer size={13} /></span>)}</div></div>;

    if (step === 3) return <div className="profile-cage-invitations"><label className="profile-cage-message"><span>Message</span><textarea value={draft.inviteMessage} placeholder="Message envoyé aux participants..." onChange={(event) => updateDraft("inviteMessage", event.target.value)} /></label><div className="profile-cage-status-tile"><span><Users size={18} /></span><div><small>Invités</small><strong>{selectedInvitees.length === 0 ? "Aucun invité sélectionné" : `${selectedInvitees.length} invité${selectedInvitees.length > 1 ? "s" : ""} sélectionné${selectedInvitees.length > 1 ? "s" : ""}`}</strong></div></div><button type="button" className={`profile-cage-wide-choice ${selectedInvitees.length ? "is-selected" : ""}`} onClick={openInvitePicker}><span><UserPlus size={19} /></span><span><strong>{selectedInvitees.length ? "Modifier les invités" : "Choisir les invités"}</strong><small>Choisir parmi les profils Meewav.</small></span><ChevronRight size={17} /></button>{selectedInvitees.length > 0 && <div className="profile-cage-selected-pills">{selectedInvitees.map((contact) => <span key={contact.id}><Users size={13} />{contact.name}</span>)}</div>}<div className="profile-cage-status-tile"><span><Mail size={18} /></span><div><small>Réponses</small><strong>{draft.invitationsSent ? "Invitations envoyées · réponses en attente" : "Prêtes à envoyer après sélection"}</strong></div></div><button type="button" className={`profile-cage-wide-choice ${draft.invitationsSent ? "is-selected" : ""}`} onClick={sendInvitations}><span><Send size={19} /></span><span><strong>{draft.invitationsSent ? "Relancer les absents" : "Envoyer invitations"}</strong><small>{draft.invitationsSent ? "Relancer les participants sans réponse." : "Passer la Cage en invitations en attente."}</small></span><ChevronRight size={17} /></button></div>;

    if (step === 4) return <div className="profile-cage-rules"><CageSelect label={roundsFieldLabel} value={roundsLabel} options={roundsOptions} onChange={(value) => updateDraft("roundsOverride", value)} /><CageSelect label="Durée d’un passage" value={draft.passage} options={["60 sec", "90 sec", "2 min", "4 min"]} onChange={(value) => updateDraft("passage", value)} /><CageSelect label="Vote" value={draft.vote} options={voteOptions} onChange={(value) => updateDraft("vote", value)} /><CageSelect label="Critères" value={draft.criteria} options={criteriaOptions} onChange={(value) => updateDraft("criteria", value)} /><CageSelect label="Récompense" value={draft.reward} options={["Golden Like", "Pass VIP", "Cagnotte", "Aucune"]} onChange={(value) => updateDraft("reward", value)} /></div>;

    if (step === 5) return <div className="profile-cage-schedule"><div className="profile-studio-form-grid is-real"><label><span>Date</span><input type="date" min={minDate} value={draft.date} onChange={(event) => { updateDraft("date", event.target.value); updateDraft("scheduled", false); }} /></label><label><span>Heure</span><input type="time" value={draft.time} onChange={(event) => { updateDraft("time", event.target.value); updateDraft("scheduled", false); }} /></label></div><div className="profile-cage-calendar-note"><CalendarClock size={18} /><span><strong>{draft.date ? draft.date.split("-").reverse().join("/") : "Choisir dans le calendrier"}</strong><small>Les dates passées sont désactivées.</small></span></div><CageSelect label="Room associée" value={draft.room} options={["La Cage", "Room principale", "Room privée"]} onChange={(value) => updateDraft("room", value)} /><div className="profile-cage-toggle-grid"><CageToggle label="Rappel auto" checked={draft.autoReminder} onChange={() => updateDraft("autoReminder", !draft.autoReminder)} icon={BellRing} /><CageToggle label="Lancer plus tard" checked={draft.launchLater} onChange={() => updateDraft("launchLater", !draft.launchLater)} icon={Timer} /></div><button type="button" className={`profile-cage-wide-choice ${draft.scheduled ? "is-selected" : ""}`} onClick={programDraft}><span><CalendarClock size={19} /></span><span><strong>Programmer cette Cage</strong><small>Elle passera en statut Programmée dans Mes Cages.</small></span><ChevronRight size={17} /></button></div>;

    return <div className="profile-cage-recap"><div className="profile-cage-recap__hero"><span><CheckCircle2 size={28} /></span><div><span className="profile-kicker">{computedStatus}</span><h4>{draft.title || "Nouvelle Cage"}</h4><p>{draft.description}</p></div></div><dl><div><dt>Nom</dt><dd>{draft.title || "Nouvelle Cage"}</dd></div><div><dt>Base</dt><dd>{draft.model}</dd></div><div><dt>Format</dt><dd>{draft.participants} participants · {draft.format} · {draft.duration}</dd></div><div><dt>Invitations</dt><dd>{selectedInvitees.length === 0 ? "Aucun invité" : draft.invitationsSent ? `Envoyées · ${selectedInvitees.length} invité${selectedInvitees.length > 1 ? "s" : ""}` : `${selectedInvitees.length} à envoyer`}</dd></div><div><dt>Règles</dt><dd>{roundsLabel} · {draft.passage} · {draft.vote}</dd></div><div><dt>Programmation</dt><dd>{draft.scheduled ? plannedSchedule : draft.invitationsSent ? "Invitations en attente" : "Brouillon Studio"}</dd></div><div><dt>Statut</dt><dd>{computedStatus}</dd></div></dl><div className="profile-cage-status-tile"><span><Rocket size={18} /></span><div><small>Lancement Room</small><strong>Le séquenceur Rooms s’ouvrira avec cette configuration, prêt pour le check-up final.</strong></div></div></div>;
  };

  const renderEditorFooter = () => {
    if (step === 6) return <footer className="profile-cage-recap-actions"><button type="button" onClick={() => persistEntry("Brouillon")}><Save size={15} /> Enregistrer</button><button type="button" onClick={() => persistEntry("Invitations en attente", { patch: { invitationsSent: true } })}><Send size={15} /> {draft.invitationsSent ? "Relancer" : "Inviter"}</button><button type="button" onClick={() => { if (!draft.date || !draft.time) { setFormMessage("Choisis une date et une heure"); return; } persistEntry("Programmée", { patch: { scheduled: true } }); }}><CalendarClock size={15} /> Programmer</button><button type="button" className="is-primary" onClick={() => persistEntry("Prête", { openLaunch: true })}><Rocket size={16} /> Lancer en Room</button></footer>;
    return <footer className="profile-cage-editor-actions"><button type="button" onClick={() => step === 0 ? setScreen("overview") : setStep((current) => current - 1)}><ArrowLeft size={15} /> {step === 0 ? "Annuler" : "Retour"}</button><button type="button" onClick={() => persistEntry("Brouillon")}><Save size={15} /> Enregistrer</button><button type="button" className="is-primary" disabled={!isStepValid} onClick={() => isStepValid && setStep((current) => Math.min(6, current + 1))}>Suivant <ArrowRight size={15} /></button></footer>;
  };

  const renderLiveIdentity = () => <div className="profile-cage-live-identity"><label className="profile-cage-message"><span>Titre de la Cage</span><input value={draft.title} placeholder="Nom de la session..." onChange={(event) => updateDraft("title", event.target.value)} /></label><section className="profile-cage-regisseur"><div className="profile-cage-live-section-title"><Headphones size={18} /><span><strong>Régisseur</strong><small>Gestion technique, micro, passages et transitions.</small></span></div><div className={`profile-cage-regisseur__status is-${regisseurState}`} role="button" tabIndex={0} onClick={() => regisseurState === "none" && setRegisseurPickerOpen(true)} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && regisseurState === "none") setRegisseurPickerOpen(true); }}><span>{regisseurState === "none" ? <Plus size={19} /> : regisseurName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{regisseurState === "none" ? "Ajouter un Régisseur" : regisseurState === "pending" ? regisseurName : `${regisseurName} est prêt`}</strong><small>{regisseurState === "none" ? "Délègue la gestion technique des sources, passages et transitions" : regisseurState === "pending" ? "En attente de confirmation..." : "Canal Talkback synchronisé"}</small></div>{regisseurState === "pending" ? <button type="button" onClick={(event) => { event.stopPropagation(); setRegisseurState("none"); setRegisseurName(""); }}><X size={15} /></button> : regisseurState === "confirmed" ? <Check size={17} /> : <ChevronRight size={17} />}</div>{regisseurPickerOpen && <div className="profile-cage-regisseur__picker"><header><strong>Inviter un Régisseur</strong><button type="button" onClick={() => setRegisseurPickerOpen(false)}><X size={15} /></button></header><p>Choisis parmi tes contacts connectés</p>{regisseurs.map((name, index) => <button key={name} type="button" onClick={() => chooseRegisseur(name)}><span>{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><strong>{name}</strong><small>{index % 3 === 2 ? "Hors ligne" : "En ligne"}</small></div><Send size={15} /></button>)}</div>}</section><section><div className="profile-cage-live-section-title"><SlidersHorizontal size={18} /><span><strong>Options</strong><small>Récompenses et réactions du live.</small></span></div><div className="profile-cage-toggle-grid"><CageToggle label="Cagnotte" checked={cagnotte} onChange={() => setCagnotte((current) => !current)} icon={CircleDollarSign} /><CageToggle label="Cadeau" checked={cadeau} onChange={() => setCadeau((current) => !current)} icon={Gift} /></div></section><section className="profile-cage-twists"><div className="profile-cage-live-section-title"><Sparkles size={18} /><span><strong>Twists</strong><small>4 réactions LinkWave par défaut</small></span></div><div className="profile-cage-twist-grid">{twists.map((twist, index) => { const Icon = twist.icon; return <article key={`${twist.label}-${index}`} style={{ "--twist-color": twist.color } as React.CSSProperties}><button type="button" className="profile-cage-twist__preview" onClick={() => playTwistPreview(twist, index)} aria-label={`${playingTwist === twist.label ? "Arrêter" : "Écouter"} ${twist.label}`}>{playingTwist === twist.label ? <X size={20} /> : <Play size={20} />}</button><span><Icon size={25} /></span><strong>{twist.label}</strong><button type="button" className="profile-cage-twist__menu-button" onClick={() => setTwistMenuIndex((current) => current === index ? null : index)} aria-label={`Remplacer ${twist.label}`}><MoreHorizontal size={17} /></button>{twistMenuIndex === index && <div className="profile-cage-twist__menu"><button type="button" disabled={!twist.isCustom} onClick={() => { setTwists((current) => current.map((item, itemIndex) => itemIndex === index ? defaultTwists[index] : item)); setTwistMenuIndex(null); }}><RotateCcw size={14} /> LinkWave par défaut</button>{customTwists.map((custom) => { const CustomIcon = custom.icon; return <button key={custom.label} type="button" onClick={() => { setTwists((current) => current.map((item, itemIndex) => itemIndex === index ? custom : item)); setTwistMenuIndex(null); }}><CustomIcon size={14} /> {custom.label}</button>; })}</div>}</article>; })}</div></section><section><div className="profile-cage-live-section-title"><CircleDollarSign size={18} /><span><strong>Monétisation</strong><small>Soutien pendant le live.</small></span></div><CageToggle label="Recevoir du soutien (€)" checked={supportEnabled} onChange={() => setSupportEnabled((current) => !current)} icon={CircleDollarSign} /></section><footer className="profile-cage-live-footer"><button type="button" onClick={() => setScreen("overview")}><ArrowLeft size={15} /> Retour</button><button type="button" className="is-primary" disabled={!draft.title.trim()} onClick={() => setLiveStep(1)}>Suivant <ArrowRight size={15} /></button></footer></div>;

  const renderLiveCheckup = () => <div className="profile-cage-checkup"><div className={`profile-cage-checkup__status ${networkOk ? "is-ready" : ""}`}><span>{networkOk ? <CheckCircle2 size={21} /> : <Wifi size={21} />}</span><div><strong>Vestiaire de la Cage</strong><small>{networkOk ? "PRÊT" : "À CORRIGER"}</small></div><em>Casque · {headphoneDetected ? "Oui" : "Non"}</em><em>Réseau · {networkOk ? "OK" : "À tester"}</em></div><section><div className="profile-cage-live-section-title"><Headphones size={18} /><span><strong>Casque</strong><small>Détection et monitoring.</small></span></div><div className="profile-cage-toggle-grid"><CageToggle label={headphoneDetected ? "Casque connecté" : "Simuler branchement casque"} checked={headphoneDetected} onChange={() => setHeadphoneDetected((current) => !current)} icon={Headphones} /><CageToggle label="Monitoring (m’entendre)" checked={monitoring} onChange={() => setMonitoring((current) => !current)} icon={AudioLines} /></div></section><section><div className="profile-cage-live-section-title"><SlidersHorizontal size={18} /><span><strong>Configuration audio</strong><small>Choisis le traitement adapté à la source utilisée.</small></span></div><div className="profile-cage-audio-modes"><button type="button" className={audioMode === "Micro" ? "is-active" : ""} onClick={() => setAudioMode("Micro")}><Mic2 size={20} /><span><strong>Micro principal</strong><small>Parole, présentation ou captation directe</small></span></button><button type="button" className={audioMode === "Source" ? "is-active" : ""} onClick={() => setAudioMode("Source")}><AudioLines size={20} /><span><strong>Source polyvalente</strong><small>Entrée externe, ambiance ou accompagnement</small></span></button></div></section><section><div className="profile-cage-live-section-title"><Radio size={18} /><span><strong>Test du niveau</strong><small>Source, écoute et saturation.</small></span></div><div className="profile-cage-mic-meter"><div><span>Niveau</span><strong>{micLevel > .8 ? "SATURATION" : micLevel > .1 ? "OK" : "TROP FAIBLE"}</strong></div><i><b style={{ width: `${micLevel * 100}%` }} /></i><button type="button" onClick={testMicro}><AudioLines size={15} /> TESTER LA SOURCE</button></div></section><section><div className="profile-cage-live-section-title"><Wifi size={18} /><span><strong>Réseau</strong><small>Contrôle indispensable avant le live.</small></span></div><button type="button" className={`profile-cage-network-test ${networkOk ? "is-ready" : ""}`} onClick={testNetwork}><Wifi size={19} /><span><strong>{networkOk ? "Réseau validé" : "Tester le réseau"}</strong><small>{networkOk ? "Latence stable · prêt à continuer" : "Test simulé de 2 secondes"}</small></span><CheckCircle2 size={18} /></button></section><section><div className="profile-cage-live-section-title"><Video size={18} /><span><strong>Vidéo</strong><small>Source et qualité du flux.</small></span></div><div className="profile-cage-rules"><CageSelect label="Caméra" value={camera} options={["Auto", "Avant", "Arrière"]} onChange={setCamera} /><CageSelect label="Qualité" value={videoQuality} options={["Auto", "Économie", "Haute"]} onChange={setVideoQuality} /></div></section><footer className="profile-cage-live-footer"><button type="button" onClick={() => setLiveStep(0)}><ArrowLeft size={15} /> Précédent</button><button type="button" className="is-primary" disabled={!networkOk} onClick={() => setLiveStep(2)}>Suivant <ArrowRight size={15} /></button><button type="button" className="is-quiet" onClick={() => setLiveStep(2)}>Ignorer et continuer</button></footer></div>;

  const renderLiveAccess = () => <div className="profile-cage-access"><section><div className="profile-cage-live-section-title"><LockKeyhole size={18} /><span><strong>Paramètres d’accès</strong><small>Visibilité et protection de la Room.</small></span></div><div className="profile-studio-segmented is-wide"><button type="button" className={!roomPrivate ? "is-active" : ""} onClick={() => setRoomPrivate(false)}><DoorOpen size={15} /> Publique</button><button type="button" className={roomPrivate ? "is-active" : ""} onClick={() => setRoomPrivate(true)}><LockKeyhole size={15} /> Privée</button></div><p className="profile-cage-access__help">Choisis si ta Room sera visible par tous ou seulement via invitation et lien.</p><label className="profile-cage-message"><span>{roomPrivate ? "Mot de passe" : "Mot de passe (Optionnel)"}</span><input type="password" value={password} disabled={!roomPrivate} placeholder="Ex: linkwave2026" onChange={(event) => setPassword(event.target.value)} /></label></section><section className="profile-cage-access__instructions"><button type="button" onClick={() => setInstructionsOpen((current) => !current)}><span><ShieldCheck size={18} /></span><span><strong>Consignes d’accès</strong><small>Règles ou informations pour rejoindre cette Room.</small></span><ChevronRight size={17} /></button>{instructionsOpen && <div><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Écris ici les règles ou informations importantes..." /><button type="button" onClick={() => setInstructionsOpen(false)}><Check size={15} /> Sauvegarder</button></div>}</section><section><div className="profile-cage-live-section-title"><TicketCheck size={18} /><span><strong>Billetterie</strong><small>Tarif d’entrée optionnel.</small></span></div><CageToggle label="Ticket d’entrée payant" checked={ticketEnabled} onChange={() => setTicketEnabled((current) => !current)} icon={TicketCheck} />{ticketEnabled && <div className="profile-cage-ticket-prices">{["0.99€", "2.99€", "5.00€", "9.99€", "14.99€"].map((price) => <button key={price} type="button" className={ticketPrice === price ? "is-active" : ""} onClick={() => setTicketPrice(price)}>{price}</button>)}</div>}</section><footer className="profile-cage-live-footer"><button type="button" onClick={() => setLiveStep(1)}><ArrowLeft size={15} /> Retour</button><button type="button" className="is-primary" onClick={() => setLiveStep(3)}>Prêt à lancer <ArrowRight size={15} /></button></footer></div>;

  const renderReadyToLaunch = () => <div className="profile-cage-ready"><span><CheckCircle2 size={58} /></span><h3>Prêt à lancer</h3><strong>LA CAGE</strong><dl><div><dt>Room</dt><dd>LA CAGE</dd></div><div><dt>Configuration</dt><dd>Check-up validé</dd></div><div><dt>Accès</dt><dd>{roomPrivate ? "Privée" : "Publique"}{ticketEnabled ? ` · ${ticketPrice}` : ""}</dd></div><div><dt>Monétisation</dt><dd>{supportEnabled ? "Activée" : "Désactivée"}</dd></div></dl><button type="button" className="profile-cage-go-live" onClick={launchRoom}><Rocket size={19} /> Ouvrir le séquenceur</button><button type="button" className="profile-cage-ready__back" onClick={() => setLiveStep(2)}>← Retour aux paramètres d’accès</button></div>;

  return <section className="profile-studio-workspace profile-studio-mode-shell is-cage profile-cage-workspace" style={{ "--studio-flow-accent": "#ff465d" } as React.CSSProperties} aria-label="La Cage"><div className="profile-studio-workspace__command"><button className="profile-studio-workspace__back" type="button" onClick={goBack}><ArrowLeft size={16} /> Studio</button><div className="profile-studio-workspace__identity"><span><Radio size={24} /></span><div><small>Open mic & formats live</small><h3>La Cage</h3><p>Outil de préparation privé · rien n’est publié sans validation.</p></div></div><span className="profile-studio-workspace__status"><ShieldCheck size={15} /> Espace privé</span></div>

    {screen === "overview" && <div className="profile-studio-mode-overview"><header className="profile-studio-mode-heading"><div><span className="profile-kicker"><Trophy size={14} /> La Cage</span><h3>Prépare chaque Cage avant de la lancer.</h3><p>Open mic, 1v1, équipe contre équipe ou tournoi : le cadre reste entièrement adaptable.</p></div><button type="button" className="profile-primary-button" onClick={openNew}><Plus size={17} /> Nouvelle Cage</button></header><div className="profile-studio-filter-row" aria-label="Filtrer les Cages">{cageFilters.map((item) => <button key={item.label} type="button" className={filter === item.label ? "is-active" : ""} onClick={() => setFilter(item.label)}>{item.label}<span>{item.status === null ? entries.length : entries.filter((entry) => entry.status === item.status).length}</span></button>)}</div>{filteredEntries.length === 0 ? <div className="profile-studio-empty"><Trophy size={28} /><p>Tu n’as encore préparé aucune Cage.</p><button type="button" onClick={openNew}><Plus size={15} /> Nouvelle Cage</button></div> : <div className="profile-studio-tracking-list">{filteredEntries.map((entry) => <article key={entry.id} className={`profile-studio-tracking-card ${activeMenu === entry.id ? "is-menu-open" : ""}`}><span className="profile-studio-tracking-card__icon"><Trophy size={20} /></span><div className="profile-studio-tracking-card__copy"><div><h4>{entry.title}</h4><StatusPill status={entry.status} /></div><p>{entry.info}</p><small><CalendarClock size={13} /> {entry.schedule}</small></div><div className="profile-studio-tracking-card__actions"><button type="button" className="is-primary" onClick={() => runPrimaryAction(entry)}>{primaryActionLabel(entry.status)}<ChevronRight size={15} /></button><button type="button" aria-label={`Actions pour ${entry.title}`} onClick={() => setActiveMenu((current) => current === entry.id ? null : entry.id)}><MoreHorizontal size={17} /></button></div>{activeMenu === entry.id && <div className="profile-studio-row-menu" role="menu"><button type="button" onClick={() => editEntry(entry)}><Pencil size={14} /> Modifier</button><button type="button" onClick={() => duplicateEntry(entry)}><Copy size={14} /> Dupliquer</button><button type="button" onClick={() => editEntry(entry, 3)}><Mail size={14} /> {entry.status === "Invitations en attente" ? "Relancer" : "Envoyer invitations"}</button><button type="button" onClick={() => editEntry(entry, 5)}><CalendarClock size={14} /> Programmer</button><button type="button" onClick={() => startLive(entry)}><Play size={14} /> Lancer en Room</button><button type="button" className="is-danger" onClick={() => { setConfirmAction({ kind: "cancel", id: entry.id }); setActiveMenu(null); }}><X size={14} /> Annuler</button><button type="button" className="is-danger" onClick={() => { setConfirmAction({ kind: "delete", id: entry.id }); setActiveMenu(null); }}><Trash2 size={14} /> Supprimer</button></div>}</article>)}</div>}</div>}

    {screen === "detail" && activeDetail && <div className="profile-studio-detail-view"><button type="button" className="profile-studio-inline-back" onClick={() => setScreen("overview")}><ArrowLeft size={15} /> Retour aux Cages</button><article className="profile-studio-detail-hero"><span><Trophy size={27} /></span><div><span className="profile-kicker">{activeDetail.model}</span><h3>{activeDetail.title}</h3><p>{activeDetail.info} · {activeDetail.schedule}</p></div><StatusPill status={activeDetail.status} /></article><div className="profile-studio-detail-grid"><article><span className="profile-kicker"><Users size={14} /> Participants</span><h4>{activeDetail.participants} places</h4><p>{activeDetail.inviteeIds.length} invités sélectionnés · {activeDetail.invitationsSent ? "invitations envoyées" : "en préparation"}.</p></article><article><span className="profile-kicker"><Vote size={14} /> Règles</span><h4>{activeDetail.roundsOverride ?? `${Math.ceil(activeDetail.participants / 2)} rounds`} · {activeDetail.passage}</h4><p>{activeDetail.vote} · {activeDetail.criteria}.</p></article><article><span className="profile-kicker"><ShieldCheck size={14} /> Suivi</span><h4>{activeDetail.status}</h4><p>{activeDetail.status === "Terminée" ? "Historique et résultats disponibles." : activeDetail.schedule}</p></article></div></div>}

    {screen === "editor" && <div className="profile-studio-real-editor profile-cage-editor"><div className="profile-studio-real-editor__top"><div><span className="profile-kicker"><Trophy size={14} /> Studio de préparation</span><h3>Préparer une Cage</h3><p>Configure le format, les participants et les règles avant le live.</p></div><button type="button" onClick={() => persistEntry("Brouillon")}><Save size={15} /> Enregistrer</button></div><ol className="profile-studio-real-steps is-seven" aria-label="Étapes de préparation de La Cage">{cageSteps.map((label, index) => <li key={label} className={`${index === step ? "is-current" : ""} ${index < step ? "is-complete" : ""}`}><span><i>{index < step ? <Check size={12} /> : index + 1}</i><strong>{label}</strong></span></li>)}</ol><div className="profile-studio-real-editor__layout"><aside className="profile-studio-live-summary"><span className="profile-kicker"><Radio size={14} /> Résumé en direct</span><h4>{draft.title || "Nouvelle Cage"}</h4><p>{draft.model} · {draft.participants} participants</p><dl><div><dt>Format</dt><dd>{draft.format} · {draft.duration}</dd></div><div><dt>Invités</dt><dd>{draft.inviteeIds.length} / {draft.participants}</dd></div><div><dt>Règles</dt><dd>{roundsLabel} · {draft.passage}</dd></div><div><dt>Programmation</dt><dd>{draft.date && draft.time ? `${draft.date.split("-").reverse().join("/")} · ${draft.time}` : "À définir"}</dd></div><div><dt>Statut</dt><dd>{computedStatus}</dd></div></dl><div className="profile-cage-readiness"><span><i style={{ width: `${(step + 1) / 7 * 100}%` }} /></span><div><small>Préparation</small><strong>{Math.round((step + 1) / 7 * 100)} %</strong></div></div><span className="profile-studio-safe-note"><LockKeyhole size={14} /> Brouillon privé</span></aside><div className="profile-studio-step-canvas"><StepIntro step={step} />{renderEditorStep()}{formMessage && <div className={`profile-cage-form-message ${formMessage.includes("prête") ? "is-success" : ""}`} role="status"><ShieldCheck size={15} /> {formMessage}</div>}{renderEditorFooter()}</div></div></div>}

    {screen === "launch" && <div className="profile-cage-live-workspace"><header><div><span className="profile-kicker"><Rocket size={14} /> Lancement live</span><h3>{liveEntry?.title ?? draft.title}</h3><p>La configuration live reste dans la surface centrale.</p></div><StatusPill status={liveEntry?.status ?? "Prête"} /></header><ol className="profile-cage-live-steps">{["Identité", "Check-up", "Accès", "Lancement"].map((label, index) => <li key={label} className={`${index === liveStep ? "is-current" : ""} ${index < liveStep ? "is-complete" : ""}`}><i>{index < liveStep ? <Check size={12} /> : index + 1}</i><span>{label}</span></li>)}</ol><div className="profile-cage-live-canvas">{liveStep === 0 ? renderLiveIdentity() : liveStep === 1 ? renderLiveCheckup() : liveStep === 2 ? renderLiveAccess() : renderReadyToLaunch()}</div></div>}

    {countdown !== null && <div className="profile-cage-countdown" role="dialog" aria-modal="true" aria-label="Compte à rebours avant le live"><span>LA CAGE</span><strong>{countdown}</strong><p>Ouverture du live</p><button type="button" onClick={cancelCountdown}>Annuler</button></div>}

    {confirmAction?.kind === "cancel" && <CageConfirm title="Annuler cette Cage ?" detail="La Cage restera visible dans ton historique." confirmLabel="Annuler la Cage" icon={X} onCancel={() => setConfirmAction(null)} onConfirm={() => { updateStatus(confirmAction.id, "Annulée", "Cage annulée"); setConfirmAction(null); }} />}
    {confirmAction?.kind === "delete" && <CageConfirm title="Supprimer cette Cage ?" detail="La Cage sera retirée de Mes Cages." confirmLabel="Supprimer" icon={Trash2} onCancel={() => setConfirmAction(null)} onConfirm={() => { setEntries((current) => current.filter((entry) => entry.id !== confirmAction.id)); setConfirmAction(null); onDone("Cage supprimée"); }} />}
  </section>;
}
