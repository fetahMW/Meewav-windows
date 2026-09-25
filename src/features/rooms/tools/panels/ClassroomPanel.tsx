import ClassSeatPrice from "./ClassSeatPrice";
import ClassroomMessageBubble from "../classroom/ClassroomMessageBubble";
import { appendClassroomDemoMessage } from "../classroom/classroomDemoMessages";
import {
  AlertTriangle,
  Armchair,
  AudioLines,
  Check,
  Download,
  FileAudio,
  FolderUp,
  Hand,
  Headphones,
  Images,
  MessageCircleMore,
  Mic,
  MicOff,
  Plus,
  Send,
  UserRound,
  Video,
  WifiOff,
  X,
} from "lucide-react";
import { type FormEvent, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  CLASSROOM_RESOURCE_ACCEPT,
  downloadClassroomResource,
  removeClassroomResource,
  uploadClassroomResource,
  validateClassroomResourceFile,
} from "../classroom/classroomResourceMedia.service";
import {
  createClassroomPrivateMessageAttempt,
  sendClassroomPrivateMessage,
  type ClassroomPrivateMessageAttempt,
} from "../classroom/classroomPrivateMessage.service";
import { toMessagingServiceError } from "../../../messaging/messaging.errors";
import type { ClassResource, ClassSeat, ClasseState, RoomPerson, RoomToolsCommand } from "../roomTools.types";
import "./classroom-tools.css";
import "./classroom-refinement.css";

const ClassStudentPreProfile = lazy(() => import("./ClassStudentPreProfile"));

export type ClassroomAudioBridge = {
  mode: "private" | "public" | null;
  studentId: string | null;
  phase: "idle" | "inviting" | "waiting" | "connecting" | "active" | "stopping" | "error" | "unavailable";
  error: string | null;
  startPrivate: (person: RoomPerson) => Promise<void>;
  startPublic: (person: RoomPerson) => Promise<void>;
  stop: () => Promise<void>;
};

export type ClassroomPanelProps = {
  classe: ClasseState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
  selectedStudentId: string | null;
  onSelectStudent: (personId: string | null) => void;
  onSpotlightStudent?: (person: RoomPerson) => Promise<void>;
  spotlightStudentId?: string | null;
  spotlightWaiting?: "invitation" | "green-house" | null;
  audioBridge: ClassroomAudioBridge;
  roomId: string;
  source: "demo" | "live";
  commandError?: string | null;
  onClearCommandError?: () => void;
};

type ClassroomSeatStatus = "free" | "listening" | "hand-raised" | "speaking" | "private" | "muted" | "disconnected";

const STATUS_LABEL: Record<ClassroomSeatStatus, string> = {
  free: "Place libre",
  listening: "En écoute",
  "hand-raised": "Main levée",
  speaking: "Prend la parole",
  private: "Canal privé",
  muted: "Micro coupé",
  disconnected: "Déconnecté",
};

const UNAVAILABLE_SEAT_STATUSES = new Set<ClassSeat["status"]>(["absent", "disconnected", "suspended"]);

function RaisedHandGlyph() {
  return <Hand className="classroom-raised-hand-glyph" strokeWidth={1.7} aria-hidden="true" />;
}

function statusIcon(status: ClassroomSeatStatus) {
  if (status === "free") return <Armchair />;
  if (status === "hand-raised") return <RaisedHandGlyph />;
  if (status === "speaking") return <AudioLines />;
  if (status === "private") return <MessageCircleMore />;
  if (status === "muted") return <MicOff />;
  if (status === "disconnected") return <WifiOff />;
  return <Headphones />;
}

function normalizedSeats(classe: ClasseState) {
  const byNumber = new Map(classe.seats.map((seat) => [seat.number, seat]));
  return Array.from({ length: 24 }, (_, index): ClassSeat => byNumber.get(index + 1) ?? {
    number: index + 1,
    status: "free",
    canSpeak: false,
    canShareScreen: false,
    handRaised: false,
  });
}

function canonicalStatus(seat: ClassSeat, classe: ClasseState, audioBridge: Pick<ClassroomAudioBridge, "mode" | "phase" | "studentId">): ClassroomSeatStatus {
  if (!seat.person) return "free";
  if (UNAVAILABLE_SEAT_STATUSES.has(seat.status)) return "disconnected";

  const confirmedAudio = audioBridge.phase === "active" && audioBridge.studentId === seat.person.id;
  if (confirmedAudio && audioBridge.mode === "private") return "private";
  if ((confirmedAudio && audioBridge.mode === "public") || classe.activeSpeakerId === seat.person.id || seat.status === "speaking") return "speaking";
  if (seat.handRaised || classe.raisedHands.some((hand) => hand.personId === seat.person?.id)) return "hand-raised";
  if (seat.status === "muted" || seat.person.microphone === "muted") return "muted";
  return "listening";
}

function audioErrorLabel(error: string | null) {
  if (!error) return null;
  if (/class[\s_-]*microphone[\s_-]*unavailable|microphone.*unavailable/i.test(error)) {
    return "Le micro de cet élève est coupé. Demandez-lui de l’activer avant de lui donner la parole.";
  }
  if (/student.*unavailable|participant.*required/i.test(error)) return "Cet élève n’est plus disponible dans la classe.";
  if (/^Le |^La |^Cet |^Seul /i.test(error)) return error;
  return "La commande audio n’a pas abouti. Vérifiez le micro de l’élève puis réessayez.";
}

function classroomCommandErrorLabel(error: string | null) {
  if (!error) return null;
  if (/hands?|main/i.test(error)) return "Les demandes de prise de parole n’ont pas pu être modifiées. Réessayez.";
  if (/speaker|microphone|audio|student|participant/i.test(error)) return audioErrorLabel(error);
  if (/forbidden|permission/i.test(error)) return "Vous n’avez pas les droits nécessaires pour cette commande.";
  return "Cette commande n’a pas pu être appliquée. Réessayez dans un instant.";
}

function showPrivateDialog(dialog: HTMLDialogElement) {
  if (dialog.open) return;
  if (typeof dialog.showModal === "function") dialog.showModal();
  else dialog.setAttribute("open", "");
}

function hidePrivateDialog(dialog: HTMLDialogElement | null) {
  if (!dialog?.open) return;
  if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

export default function ClassroomPanel({
  classe,
  disabled,
  execute,
  selectedStudentId,
  onSelectStudent,
  onSpotlightStudent,
  spotlightStudentId,
  spotlightWaiting,
  audioBridge,
  roomId,
  source,
  commandError = null,
  onClearCommandError,
}: ClassroomPanelProps) {
  const [localAudioError, setLocalAudioError] = useState<string | null>(null);
  const [preProfileOpen, setPreProfileOpen] = useState(false);
  const [spotlightBusy, setSpotlightBusy] = useState(false);
  const [spotlightError, setSpotlightError] = useState<string | null>(null);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceError, setResourceError] = useState<string | null>(null);
  const [privateComposerOpen, setPrivateComposerOpen] = useState(false);
  const [privateMessage, setPrivateMessage] = useState("");
  const [privateMessageBusy, setPrivateMessageBusy] = useState(false);
  const [privateMessageError, setPrivateMessageError] = useState<string | null>(null);
  const [privateMessageSent, setPrivateMessageSent] = useState<string | null>(null);
  const regieRef = useRef<HTMLElement | null>(null);
  const regieActionsRef = useRef<HTMLDivElement | null>(null);
  const resourceInputRef = useRef<HTMLInputElement | null>(null);
  const privateMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const privateDialogRef = useRef<HTMLDialogElement | null>(null);
  const privateTriggerRef = useRef<HTMLButtonElement | null>(null);
  const profileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const privateMessageAttemptRef = useRef<ClassroomPrivateMessageAttempt | null>(null);
  const seats = useMemo(() => normalizedSeats(classe), [classe]);
  const seatStatuses = useMemo(
    () => new Map(seats.map((seat) => [seat.number, canonicalStatus(seat, classe, audioBridge)])),
    [audioBridge, classe, seats],
  );
  const selectedSeat = seats.find((seat) => seat.person?.id === selectedStudentId);
  const selectedStudent = selectedSeat?.person;
  const raisedIds = new Set([
    ...classe.raisedHands.map((hand) => hand.personId),
    ...seats.filter((seat) => seat.handRaised && seat.person).map((seat) => seat.person!.id),
  ]);
  const publicSpeakerId = audioBridge.phase === "active" && audioBridge.mode === "public"
    ? audioBridge.studentId
    : classe.activeSpeakerId;
  const publicSpeaker = seats.find((seat) => seat.person?.id === publicSpeakerId)?.person;
  const selectedStatus = selectedSeat ? seatStatuses.get(selectedSeat.number) : undefined;
  const audioSessionExists = Boolean(audioBridge.studentId && audioBridge.phase !== "idle" && audioBridge.phase !== "unavailable");
  const selectedCanJoinAudio = Boolean(
    selectedStudent
    && selectedStatus !== "disconnected"
    && selectedStudent.microphone !== "muted",
  );
  const canStartPublicAudio = !disabled
    && selectedCanJoinAudio
    && !audioSessionExists
    && (audioBridge.phase === "idle" || audioBridge.phase === "error");
  const surfacedError = spotlightError ?? audioErrorLabel(audioBridge.error ?? localAudioError)
    ?? classroomCommandErrorLabel(commandError);

  useEffect(() => {
    if (!selectedStudentId) return;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstAction = regieActionsRef.current?.querySelector<HTMLButtonElement>(".is-student-action:not(:disabled)")
        ?? regieActionsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
      firstAction?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [selectedStudentId]);

  useEffect(() => {
    setPreProfileOpen(false);
    setSpotlightError(null);
    setPrivateComposerOpen(false);
    hidePrivateDialog(privateDialogRef.current);
    setPrivateMessage("");
    setPrivateMessageError(null);
    setPrivateMessageSent(null);
    privateMessageAttemptRef.current = null;
  }, [selectedStudentId]);

  useEffect(() => {
    const dialog = privateDialogRef.current;
    if (!dialog) return;
    if (!privateComposerOpen) {
      hidePrivateDialog(dialog);
      return;
    }
    showPrivateDialog(dialog);
    const focusFrame = window.requestAnimationFrame(() => privateMessageInputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(focusFrame);
  }, [privateComposerOpen]);

  const runAudio = async (action: () => Promise<void>) => {
    const shouldRestoreRegieFocus = Boolean(regieRef.current?.contains(document.activeElement));
    onClearCommandError?.();
    setLocalAudioError(null);
    try {
      await action();
    } catch (error) {
      setLocalAudioError(error instanceof Error ? error.message : "Le canal audio n’a pas pu être établi.");
    } finally {
      if (shouldRestoreRegieFocus) {
        window.requestAnimationFrame(() => {
          const regie = regieRef.current;
          if (!regie) return;
          const active = document.activeElement;
          const focusWasLost = !active || active === document.body || active === document.documentElement;
          if (!focusWasLost && !regie.contains(active)) return;
          if (regie.contains(active)) return;
          const firstAction = regieActionsRef.current?.querySelector<HTMLButtonElement>(".is-student-action:not(:disabled)")
            ?? regieActionsRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
          firstAction?.focus({ preventScroll: true });
        });
      }
    }
  };

  const putEveryoneInListeningMode = async () => {
    onClearCommandError?.();
    setLocalAudioError(null);
    try {
      if (audioSessionExists) await audioBridge.stop();
      else await execute({ type: "classe.speaker", personId: null });
    } catch (error) {
      setLocalAudioError(error instanceof Error ? error.message : "Impossible de terminer la prise de parole.");
    }
  };

  const publicAudioSessionExists = audioSessionExists && audioBridge.mode === "public";
  const audioStopping = audioBridge.phase === "stopping";
  const publicAudioPending = publicAudioSessionExists && audioBridge.phase !== "active" && !audioStopping;
  const privateAudioSessionExists = audioSessionExists && audioBridge.mode === "private";
  const floorSessionExists = Boolean(publicSpeaker || publicAudioSessionExists || privateAudioSessionExists);
  const selectedCanReceiveMessage = Boolean(selectedStudent && selectedStatus !== "disconnected");
  const resources = classe.resources ?? [];

  const closePrivateComposer = () => {
    if (privateMessageBusy) return;
    setPrivateComposerOpen(false);
    hidePrivateDialog(privateDialogRef.current);
    window.requestAnimationFrame(() => privateTriggerRef.current?.focus({ preventScroll: true }));
  };

  const submitPrivateMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedStudent || !selectedCanReceiveMessage || privateMessageBusy || privateMessage.trim().length < 1) return;
    setPrivateMessageBusy(true);
    setPrivateMessageError(null);
    setPrivateMessageSent(null);
    try {
      const body = privateMessage.trim();
      let attempt = privateMessageAttemptRef.current;
      if (!attempt || attempt.roomId !== roomId || attempt.recipientId !== selectedStudent.id || attempt.body !== body) {
        attempt = createClassroomPrivateMessageAttempt(roomId, selectedStudent.id, body);
        privateMessageAttemptRef.current = attempt;
      }
      await sendClassroomPrivateMessage({
        roomId,
        recipientId: selectedStudent.id,
        body,
        source,
      }, attempt);
      if (source === "demo") appendClassroomDemoMessage(roomId, classe.people[0].id, selectedStudent.id, body);
      privateMessageAttemptRef.current = null;
      setPrivateMessage("");
      setPrivateMessageSent(source === "demo"
        ? "Message envoyé dans la Classe de démonstration."
        : `Message envoyé à ${selectedStudent.name}`);
    } catch (error) {
      setPrivateMessageError(toMessagingServiceError(error, "mutation_failed").message);
    } finally {
      setPrivateMessageBusy(false);
    }
  };

  const resourceErrorLabel = (error: unknown) => {
    const code = error instanceof Error ? error.message : "class_resource_unknown";
    if (code === "class_resource_file_size_invalid") return "Chaque ressource doit peser moins de 25 Mo.";
    if (code === "class_resource_file_type_invalid") return "Ajoutez une image ou un fichier audio compatible.";
    if (code === "class_resource_limit_reached") return "La limite de 24 ressources est atteinte.";
    if (code === "class_resource_download_failed") return "Le téléchargement sécurisé n’a pas pu démarrer.";
    return "Cette ressource n’a pas pu être ajoutée. Réessayez.";
  };

  const addResources = async (files: FileList | null) => {
    if (!files?.length || resourceBusy) return;
    setResourcesOpen(true);
    setResourceBusy(true);
    setResourceError(null);
    const availableSlots = Math.max(0, 24 - resources.length);
    try {
      if (!availableSlots) throw new Error("class_resource_limit_reached");
      for (const file of Array.from(files).slice(0, availableSlots)) {
        const contract = validateClassroomResourceFile(file);
        const resource: ClassResource = {
          id: crypto.randomUUID(),
          name: file.name.trim().slice(0, 120),
          kind: contract.kind,
          mimeType: contract.contentType,
          size: file.size,
          addedAt: new Date().toISOString(),
        };
        if (source === "demo") {
          resource.mediaUrl = URL.createObjectURL(file);
          try {
            await execute({ type: "classe.resource.add", resource });
          } catch (error) {
            URL.revokeObjectURL(resource.mediaUrl);
            throw error;
          }
        } else {
          const uploaded = await uploadClassroomResource(roomId, file);
          resource.mediaPath = uploaded.mediaPath;
          try {
            await execute({ type: "classe.resource.add", resource });
          } catch (error) {
            await removeClassroomResource(uploaded.mediaPath).catch(() => undefined);
            throw error;
          }
        }
      }
      if (files.length > availableSlots) setResourceError("Seules les 24 premières ressources ont été conservées.");
    } catch (error) {
      setResourceError(resourceErrorLabel(error));
    } finally {
      setResourceBusy(false);
      if (resourceInputRef.current) resourceInputRef.current.value = "";
    }
  };

  const downloadResource = async (resource: ClassResource) => {
    setResourceError(null);
    try {
      await downloadClassroomResource(resource, roomId);
    } catch (error) {
      setResourceError(resourceErrorLabel(error));
    }
  };

  return <div className="room-tool-panel is-classroom">
    <ClassSeatPrice cents={classe.seatPriceCents ?? 499} disabled={disabled} execute={execute}/>
    {selectedStudent ? <ClassroomMessageBubble roomId={roomId} accountId={classe.people[0].id} peerId={selectedStudent.id} peerName={selectedStudent.name} source={source} /> : null}
    <ClassroomRoster classe={classe} audioBridge={audioBridge} selectedStudentId={selectedStudentId} onSelectStudent={onSelectStudent} />

    <aside
      ref={regieRef}
      className="classroom-command-dock"
      aria-label={selectedStudent ? `Actions pour ${selectedStudent.name}` : "Actions de La Classe"}
    >
      <div ref={regieActionsRef} className="classroom-command-dock__controls">
        <button
          type="button"
          className={`is-resource-action${resourcesOpen ? " is-active" : ""}`}
          aria-label="Ouvrir les ressources du cours"
          aria-expanded={resourcesOpen}
          aria-controls="classroom-resource-panel"
          onClick={() => {
            onClearCommandError?.();
            setPrivateComposerOpen(false);
            setResourcesOpen((open) => !open);
          }}
        ><FolderUp /><span>Ressources</span>{resources.length ? <i>{resources.length}</i> : null}</button>
        <button
          type="button"
          className={`is-hand-action${classe.handsOpen ? " is-active" : ""}`}
          aria-label={classe.handsOpen ? "Fermer les demandes de prise de parole" : "Ouvrir les demandes de prise de parole"}
          aria-pressed={classe.handsOpen}
          disabled={disabled}
          onClick={() => {
            onClearCommandError?.();
            void execute({ type: "classe.hands.open", open: !classe.handsOpen }).catch(() => undefined);
          }}
        ><RaisedHandGlyph /><span>Mains</span>{raisedIds.size ? <i>{raisedIds.size}</i> : null}</button>
        <button
          ref={privateTriggerRef}
          type="button"
          className={`is-student-action is-private-action${privateComposerOpen ? " is-active" : ""}`}
          aria-label={selectedStudent
            ? `${privateComposerOpen ? "Fermer" : "Écrire"} un message privé à ${selectedStudent.name}`
            : "Sélectionner un élève pour lui écrire un message privé"}
          aria-expanded={privateComposerOpen}
          aria-haspopup="dialog"
          aria-controls="classroom-private-composer"
          disabled={disabled || !selectedCanReceiveMessage}
          title="Envoyer un message direct sans interrompre le cours"
          onClick={() => {
            onClearCommandError?.();
            setResourcesOpen(false);
            setPrivateMessageError(null);
            setPrivateMessageSent(null);
            if (privateComposerOpen) closePrivateComposer();
            else setPrivateComposerOpen(true);
          }}
        ><MessageCircleMore /><span>Privé</span></button>
        <button
          type="button"
          className={`is-student-action is-floor-action${floorSessionExists ? " is-active" : ""}`}
          aria-label={floorSessionExists
              ? audioStopping
                ? "Fin de la liaison audio en cours"
                : privateAudioSessionExists
                  ? "Terminer l’ancien aparté audio"
                  : publicAudioPending
                ? "Annuler l’invitation à prendre la parole"
                : "Terminer la prise de parole et remettre toute la classe en écoute"
              : selectedStudent
              ? selectedCanJoinAudio
                ? `Donner la parole à ${selectedStudent.name}`
                : `Le micro de ${selectedStudent.name} est indisponible`
              : "Sélectionner un élève pour lui donner la parole"}
          disabled={floorSessionExists ? disabled || audioStopping : !canStartPublicAudio}
          aria-pressed={floorSessionExists}
          title={floorSessionExists
            ? audioStopping
              ? "La liaison audio est en cours de fermeture"
              : privateAudioSessionExists
                ? "Fermer l’ancien canal audio privé et revenir à la classe"
                : publicAudioPending
                  ? "Annuler l’invitation audio en attente"
                  : "Couper la parole en cours et remettre les élèves en écoute"
            : "Donner la parole publiquement à l’élève sélectionné"}
          onClick={() => {
            if (floorSessionExists) void putEveryoneInListeningMode();
            else if (selectedStudent) void runAudio(() => audioBridge.startPublic(selectedStudent));
          }}
        >{floorSessionExists ? <MicOff /> : <Mic />}<span>{floorSessionExists
          ? audioStopping ? "Fin…" : privateAudioSessionExists ? "Fin audio" : publicAudioPending ? "Annuler" : "Fin parole"
          : "Parole"}</span></button>
        <button ref={profileTriggerRef} type="button" className={`is-student-action is-profile-action${preProfileOpen ? " is-active" : ""}`}
          aria-label={selectedStudent ? `${preProfileOpen ? "Fermer" : "Ouvrir"} le pré-profil de ${selectedStudent.name}` : "Sélectionner un élève pour ouvrir son pré-profil"}
          title="Pré-profil" aria-haspopup="dialog" aria-expanded={preProfileOpen}
          disabled={!selectedStudent}
          onClick={() => { setPrivateComposerOpen(false); setResourcesOpen(false); setPreProfileOpen((open) => !open); }}>
          <UserRound /><span>Pré-profil</span>
        </button>
        <button type="button" className={`is-student-action is-spotlight-action${selectedStudentId && spotlightStudentId === selectedStudentId ? " is-active" : ""}`}
          aria-label={selectedStudent
            ? spotlightWaiting === "invitation" ? `Invitation envoyée à ${selectedStudent.name}`
              : spotlightWaiting === "green-house" ? `${selectedStudent.name} prépare sa caméra dans la Green House`
              : spotlightStudentId === selectedStudent.id ? `Retirer ${selectedStudent.name} du spotlight` : `Mettre ${selectedStudent.name} à l’écran dans le live`
            : "Sélectionner un élève pour le mettre à l’écran"}
          title={spotlightWaiting === "invitation" ? "En attente de l’acceptation de l’élève"
            : spotlightWaiting === "green-house" ? "Préparation caméra en Green House — en attente de validation"
            : "Mettre à l’écran dans le live"}
          aria-pressed={Boolean(selectedStudentId && spotlightStudentId === selectedStudentId)}
          aria-busy={spotlightBusy}
          disabled={disabled || spotlightBusy || Boolean(spotlightWaiting) || !selectedStudent || selectedStatus === "disconnected" || !onSpotlightStudent}
          onClick={() => {
            if (!selectedStudent || !onSpotlightStudent || spotlightBusy) return;
            setSpotlightBusy(true); setSpotlightError(null); onClearCommandError?.();
            void onSpotlightStudent(selectedStudent)
              .catch((error) => setSpotlightError(error instanceof Error ? error.message : "La mise à l’écran a échoué. Réessayez."))
              .finally(() => setSpotlightBusy(false));
          }}>
          <Video /><span>À l’écran</span>
        </button>
      </div>

      {preProfileOpen && selectedStudent ? <Suspense fallback={<span role="status">Ouverture du pré-profil…</span>}>
        <ClassStudentPreProfile key={selectedStudent.id} person={selectedStudent} source={source} returnFocusTo={profileTriggerRef.current} onClose={() => setPreProfileOpen(false)} />
      </Suspense> : null}

      <input
        ref={resourceInputRef}
        className="classroom-resource-input"
        type="file"
        accept={CLASSROOM_RESOURCE_ACCEPT}
        multiple
        tabIndex={-1}
        onChange={(event) => void addResources(event.currentTarget.files)}
      />

      <dialog
        ref={privateDialogRef}
        id="classroom-private-composer"
        className="classroom-private-composer"
        aria-label={selectedStudent ? `Message privé à ${selectedStudent.name}` : "Message privé"}
        onCancel={(event) => {
          event.preventDefault();
          closePrivateComposer();
        }}
        onClose={() => setPrivateComposerOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) closePrivateComposer();
        }}
      >{selectedStudent ? <form onSubmit={(event) => void submitPrivateMessage(event)}>
          <header>
            <img src={selectedStudent.avatarUrl} alt="" />
            <span><small>MESSAGE PRIVÉ</small><strong id="classroom-private-composer-title">À {selectedStudent.name}</strong></span>
            <button type="button" disabled={privateMessageBusy} onClick={closePrivateComposer} aria-label="Fermer le message privé"><X /></button>
          </header>
          <label htmlFor="classroom-private-message">Message <small aria-hidden="true">{privateMessage.length}/280</small></label>
          <textarea
            ref={privateMessageInputRef}
            id="classroom-private-message"
            value={privateMessage}
            maxLength={280}
            rows={3}
            placeholder="Une consigne rapide, visible seulement par cet élève…"
            disabled={privateMessageBusy}
            onChange={(event) => {
              setPrivateMessage(event.currentTarget.value);
              setPrivateMessageError(null);
              setPrivateMessageSent(null);
            }}
          />
          <footer>
            <span aria-live="polite">
              {privateMessageSent ? <><Check />{privateMessageSent}</> : privateMessageError ? <><AlertTriangle />{privateMessageError}</> : source === "demo" ? "Aperçu local, sans envoi réel" : "Envoyé dans sa messagerie MeeWav"}
            </span>
            <button type="submit" disabled={privateMessageBusy || privateMessage.trim().length < 1}>
              <Send />{privateMessageBusy ? "Envoi…" : "Envoyer"}
            </button>
          </footer>
        </form> : null}</dialog>

      {resourcesOpen ? <section id="classroom-resource-panel" className="classroom-resource-panel" aria-label="Ressources du cours">
        <header>
          <span><small>PARTAGE DE FICHIERS</small><strong>Ressources du cours</strong></span>
          <span>
            <button type="button" className="classroom-resource-panel__add" disabled={disabled || resourceBusy || resources.length >= 24} onClick={() => resourceInputRef.current?.click()}><Plus />{resourceBusy ? "Ajout…" : "Ajouter"}</button>
            <button type="button" className="classroom-resource-panel__close" onClick={() => setResourcesOpen(false)} aria-label="Fermer les ressources"><X /></button>
          </span>
        </header>
        {resources.length ? <div className="classroom-resource-list">
          {resources.map((resource) => <article key={resource.id}>
            <span className={`is-${resource.kind}`}>{resource.kind === "image" ? <Images /> : <FileAudio />}</span>
            <span><strong title={resource.name}>{resource.name}</strong><small>{resource.kind === "image" ? "IMAGE" : "AUDIO"} · {resource.size >= 1_048_576 ? `${(resource.size / 1_048_576).toFixed(1)} Mo` : `${Math.max(1, Math.round(resource.size / 1024))} Ko`}</small></span>
            <button type="button" onClick={() => void downloadResource(resource)} aria-label={`Télécharger ${resource.name}`}><Download /></button>
          </article>)}
        </div> : <button type="button" className="classroom-resource-empty" disabled={disabled || resourceBusy} onClick={() => resourceInputRef.current?.click()}><FolderUp /><span><strong>Ajoutez la première ressource</strong><small>Images et audio · 25 Mo maximum</small></span></button>}
        {resourceError ? <p role="alert"><AlertTriangle />{resourceError}</p> : null}
      </section> : null}

      {surfacedError ? <p className="classroom-command-dock__alert" role="alert"><AlertTriangle />{surfacedError}</p> : null}
    </aside>
  </div>;
}

/** The same 24-seat roster is rendered by the teacher and student surfaces. */
export function ClassroomRoster({ classe, audioBridge, selectedStudentId, onSelectStudent, onSelectFreeSeat }: Pick<ClassroomPanelProps, "classe" | "selectedStudentId" | "onSelectStudent"> & { audioBridge: Pick<ClassroomAudioBridge, "mode" | "phase" | "studentId">; onSelectFreeSeat?: (seat: number) => void }) {
  const seats = normalizedSeats(classe);
  const seatStatuses = new Map(seats.map(seat => [seat.number, canonicalStatus(seat, classe, audioBridge)]));
  return (<div className="classroom-roster">
      <div className="classroom-seats" role="list" aria-label="Les 24 élèves de La Classe">
      {seats.map((seat) => {
        const status = seatStatuses.get(seat.number) ?? "free";
        const selected = Boolean(seat.person && seat.person.id === selectedStudentId);
        const isSelectedAudio = Boolean(seat.person && seat.person.id === audioBridge.studentId);
        return <article
          role="listitem"
          key={seat.number}
          className={`classroom-seat is-${status}${selected ? " is-selected" : ""}${isSelectedAudio ? " is-audio-target" : ""}`}
        >
          {seat.person ? <button
            type="button"
            className="classroom-seat__person"
            aria-pressed={selected}
            aria-label={`${seat.person.name}, place ${seat.number}, ${STATUS_LABEL[status]}`}
            title={`${seat.person.name} · place ${seat.number} · ${STATUS_LABEL[status]}`}
            onClick={() => onSelectStudent(selected ? null : seat.person!.id)}
          >
            <b className="classroom-seat__number" aria-hidden="true">{String(seat.number).padStart(2, "0")}</b>
            {status !== "listening" ? <i className={`classroom-seat__signal is-${status}`} aria-hidden="true">{statusIcon(status)}</i> : null}
            <span className="classroom-seat__avatar">
              <span className="classroom-seat__portrait"><img src={seat.person.avatarUrl} alt="" loading="lazy" /></span>
            </span>
            <span className="classroom-seat__identity">
              <strong title={seat.person.name}>{seat.person.name}</strong>
            </span>
          </button> : onSelectFreeSeat ? <button type="button" className="classroom-seat__empty" aria-label={`Acheter la place ${seat.number}`} onClick={() => onSelectFreeSeat(seat.number)}><b>{String(seat.number).padStart(2, "0")}</b><span><Armchair /></span><small>{((classe.seatPriceCents ?? 499) / 100).toLocaleString("fr-FR", {style:"currency",currency:"EUR"})}</small></button> : <div className="classroom-seat__empty"><b>{String(seat.number).padStart(2, "0")}</b><span><Armchair /></span><small>Libre</small></div>}
        </article>;
      })}
      </div>
    </div>);
}
