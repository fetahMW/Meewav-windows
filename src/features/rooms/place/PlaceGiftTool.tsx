import MeewavSelect from "../../../components/shared/MeewavSelect";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  Dices,
  Gift,
  ImagePlus,
  Play,
  Radio,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  PROFILE_GIFT_ACTIONS,
  PROFILE_GIFT_ROUND_OPTIONS,
  ROOM_STANDARD_GIFT_CATALOG,
  ProfileGiftObject,
  profileGiftDateAfter,
  profileGiftDeliveryForAction,
  profileGiftItemFor,
  profileGiftStatusForAction,
  profileGiftToday,
  validateProfileGiftSchedule,
  type GiftAction,
  type GiftCatalogItem,
  type GiftEntry,
} from "../../profile/gifts/profileGiftCatalog";
import {
  profileGiftInventoryRepository,
  type ProfileGiftInventoryItem,
} from "../../profile/gifts/profileGiftInventory.service";
import type {
  RoomGiftCandidate,
  RoomGiftDraw,
  RoomGiftDrawInput,
  RoomGiftDrawPoolMode,
  RoomGiftRecipientSource,
} from "./place.types";
import { roomGiftCodeForLabel } from "./placeGiftCatalog";
import "./place-gift-tool.css";

export type PlaceGiftRecipientSource = RoomGiftRecipientSource;

export type PlaceGiftRecipientOption = {
  profileId: string;
  displayName: string;
  avatarUrl?: string;
  detail?: string;
  source: PlaceGiftRecipientSource;
};

export type PlaceGiftSubmission = Omit<GiftEntry, "id" | "recipientSource"> & {
  recipientProfileId: string;
  recipientSource: PlaceGiftRecipientSource;
  recipientAvatarUrl: string | null;
  idempotencyKey: string;
  customGift?: { title: string; imageUrl: string | null };
};

type MessagingRecipientStatus = "idle" | "loading" | "ready" | "error";

export type PlaceGiftToolProps = {
  /** Keeps Place wording by default; Cage can present the same engine as a reward tool. */
  terminology?: "gift" | "reward";
  recipientOptions?: readonly PlaceGiftRecipientOption[];
  initialRecipientProfileId?: string;
  messagingStatus?: MessagingRecipientStatus;
  messagingMode?: "live" | "local-demo";
  messagingError?: string | null;
  queueCount?: number;
  /** Null means the live server has not frozen and confirmed the pool yet. */
  roomCount?: number | null;
  disabled?: boolean;
  /** Grade MeeWav de l'expéditeur. La Certif exige le grade 4 étoiles. */
  senderGradeLevel?: number | null;
  onSubmit?: (submission: PlaceGiftSubmission) => void | Promise<void>;
  draw?: RoomGiftDraw | null;
  onCreateDraw?: (input: RoomGiftDrawInput) => RoomGiftDraw | null | Promise<RoomGiftDraw | null>;
  onScheduleDraw?: (input: RoomGiftDrawInput & { scheduledAt: string }) => RoomGiftDraw | null | Promise<RoomGiftDraw | null>;
  onStartDraw?: (drawId?: string) => RoomGiftDraw | null | Promise<RoomGiftDraw | null>;
  onCancelDraw?: (drawId?: string) => RoomGiftDraw | null | Promise<RoomGiftDraw | null>;
  onDone?: (message: string) => void;
};

const STEP_LABELS = ["Cadeau", "Destinataire", "Envoi"] as const;
const DRAW_STEP_LABELS = ["Cadeau", "Participants", "Diffusion"] as const;
const DRAW_POOL_OPTIONS: ReadonlyArray<{ id: RoomGiftDrawPoolMode; label: string; detail: string }> = [
  { id: "manual", label: "Noms saisis", detail: "Ajoutez librement les noms" },
  { id: "queue", label: "File d’attente", detail: "Toutes les personnes en attente" },
  { id: "room", label: "Toute la Room", detail: "Audience connectée au lancement" },
  { id: "selected", label: "Sélection personnalisée", detail: "Scène, coulisses ou file" },
];
const RECIPIENT_GROUPS: ReadonlyArray<{
  source: PlaceGiftRecipientSource;
  label: string;
  detail: string;
  empty: string;
}> = [
  { source: "stage", label: "Sur scène", detail: "Invités actifs", empty: "Aucun invité sur scène" },
  { source: "backstage", label: "Coulisses", detail: "Invités prêts", empty: "Personne dans les coulisses" },
  { source: "queue", label: "File d’attente", detail: "Demandes en cours", empty: "La file d’attente est vide" },
  { source: "messaging", label: "Messagerie", detail: "Contacts récents", empty: "Aucun contact récent" },
];

function recipientInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("fr-FR");
}

function normalizedRecipientSearch(option: PlaceGiftRecipientOption) {
  return `${option.displayName} ${option.detail ?? ""}`.toLocaleLowerCase("fr-FR");
}

function completionMessage(action: GiftAction, terminology: "gift" | "reward" = "gift") {
  if (action === "Envoyer maintenant") return terminology === "reward" ? "Récompense envoyée" : "Cadeau envoyé";
  if (action === "Programmer") return terminology === "reward" ? "Récompense programmée" : "Cadeau programmé";
  return terminology === "reward" ? "Récompense ajoutée à la ronde" : "Cadeau ajouté à la ronde";
}

function giftOperationFailure(error: unknown, fallback: string, terminology: "gift" | "reward" = "gift") {
  const message = error instanceof Error ? error.message : "";
  return /profile_gift_inventory_(?:insufficient|unavailable|reservation)/i.test(message)
    ? `${terminology === "reward" ? "Cette récompense" : "Ce cadeau"} n’est plus disponible dans ton inventaire. Consulte « ${terminology === "reward" ? "Mes récompenses" : "Mes cadeaux"} » dans ton Profil.`
    : fallback;
}

const CERTIF_EXPLANATION_ID = "place-gift-tool-certif-explanation";

function giftDiscoveryCopy(item: GiftCatalogItem) { return item.detail; }

function RoomGiftCatalogCards({
  selectedGift,
  onSelect,
  inventory,
  inventoryStatus,
  senderGradeLevel,
}: {
  selectedGift: string | null;
  onSelect: (gift: string | null) => void;
  inventory: readonly ProfileGiftInventoryItem[];
  inventoryStatus: GiftInventoryStatus;
  senderGradeLevel?: number | null;
}) {
  const inventoryActive = inventoryStatus === "ready"
    && inventory.length > 0
    && inventory.every((candidate) => candidate.enforcementActive);
  const inventoryByCode = new Map(inventory.map((candidate) => [candidate.giftCode, candidate]));

  return (
    <>
      <div role="group" aria-label="Catalogue des récompenses Standard Room">
        {ROOM_STANDARD_GIFT_CATALOG.map((item: GiftCatalogItem) => {
          const selected = selectedGift === item.name;
          const giftCode = roomGiftCodeForLabel(item.name);
          const unavailable = Boolean(
            inventoryActive
            && giftCode
            && (inventoryByCode.get(giftCode)?.availableQuantity ?? 0) < 1,
          );
          const certifLocked = item.name === "La Certif" && (senderGradeLevel ?? 0) < 4;
          const discoveryId = `place-gift-discovery-${giftCode ?? item.visual}`;
          const describedBy = [
            item.name === "La Certif" ? CERTIF_EXPLANATION_ID : null,
            selected ? discoveryId : null,
          ].filter(Boolean).join(" ") || undefined;
          return (
            <button
              type="button"
              key={item.name}
              className={`is-${item.visual}${selected ? " is-selected" : ""}${item.gold ? " is-gold" : ""}`}
              style={{ "--gift-tone": item.tone } as React.CSSProperties}
              aria-pressed={selected}
              aria-label={`${item.name}, ${item.rarity}. ${item.detail}${certifLocked ? " Accessible à partir du grade 4 étoiles." : ""}${selected ? " Sélectionné. Cliquer pour revenir au cadeau." : ""}`}
              aria-describedby={describedBy}
              data-gift-code={giftCode ?? undefined}
              disabled={unavailable || certifLocked}
              onClick={() => {
                if (unavailable || certifLocked) return;
                onSelect(selected ? null : item.name);
              }}
            >
              <ProfileGiftObject item={item} />
              <i className="place-gift-tool__catalog-radio" aria-hidden="true">
                {selected ? <Check /> : null}
              </i>
              <span className="place-gift-tool__catalog-copy">
                <small>{item.rarity}</small>
                <strong>{item.name}</strong>
                <em>{item.detail}</em>
              </span>
              {selected ? (
                <span className="place-gift-tool__discovery is-selection-details" id={discoveryId}>
                  <Sparkles aria-hidden="true" />
                  <span>
                    <strong>{item.name}</strong>
                    <em>{giftDiscoveryCopy(item)}</em>
                    <small><RotateCcw aria-hidden="true" /> Cliquer pour revenir</small>
                  </span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <span className="place-gift-tool__sr-only" id={CERTIF_EXPLANATION_ID}>
        Validation personnelle signée par l’expéditeur, pas une certification officielle MeeWav.
        Accessible uniquement aux membres ayant atteint le grade 4 étoiles.
      </span>
    </>
  );
}

type GiftInventoryStatus = "loading" | "ready" | "error";

function RoomGiftInventoryShortcut({
  inventory,
  inventoryStatus,
  terminology = "gift",
}: {
  inventory: readonly ProfileGiftInventoryItem[];
  inventoryStatus: GiftInventoryStatus;
  terminology?: "gift" | "reward";
}) {
  const rewardWording = terminology === "reward";
  const totalAvailable = inventory.reduce((total, candidate) => total + candidate.availableQuantity, 0);
  const enforcementActive = inventoryStatus === "ready"
    && inventory.length > 0
    && inventory.every((candidate) => candidate.enforcementActive);
  const quantityCopy = inventoryStatus === "loading"
    ? "Synchronisation…"
    : inventoryStatus === "error"
      ? "Ouvrir mon Profil"
      : enforcementActive
        ? `${totalAvailable} disponible${totalAvailable > 1 ? "s" : ""}`
        : "Activation en préparation";

  return (
    <a
      className="place-gift-tool__footer-selection is-inventory"
      href="/profile/creations/studio/gifts"
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Voir mes ${rewardWording ? "récompenses" : "cadeaux"} disponibles dans le Profil, nouvel onglet`}
    >
      <span className="place-gift-tool__inventory-glyph"><Gift aria-hidden="true" /></span>
      <span><strong>Mes {rewardWording ? "récompenses" : "cadeaux"}</strong><small>{quantityCopy}</small></span>
    </a>
  );
}

function scheduledDrawDate(date: string, time: string) {
  const value = new Date(`${date}T${time}:00`);
  return Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

function newDrawIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `room-draw:${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `room-draw:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function newGiftIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return `room-gift:${globalThis.crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return `room-gift:${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

const MANUAL_DRAW_LIMIT = 5_000;

function manualDrawSelection(value: string): { candidates: RoomGiftCandidate[]; truncated: boolean } {
  const unique = new Set<string>();
  const names = value
    .split(/[\n,;]+/)
    .map((name) => name.trim().replace(/\s+/g, " ").slice(0, 120))
    .filter((name) => {
      const key = name.toLocaleLowerCase("fr-FR");
      if (!name || unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .slice(0, MANUAL_DRAW_LIMIT + 1);
  return {
    truncated: names.length > MANUAL_DRAW_LIMIT,
    candidates: names
      .slice(0, MANUAL_DRAW_LIMIT)
      .map((displayName, index) => ({
        key: `manual:${index + 1}:${displayName.toLocaleLowerCase("fr-FR")}`,
        profileId: null,
        displayName,
        avatarUrl: null,
        source: "manual",
      })),
  };
}

type PublicDrawRecipientOption = PlaceGiftRecipientOption & {
  source: Exclude<PlaceGiftRecipientSource, "messaging">;
};

function isPublicDrawRecipient(option: PlaceGiftRecipientOption): option is PublicDrawRecipientOption {
  return option.source !== "messaging";
}

function recipientDrawCandidate(option: PublicDrawRecipientOption): RoomGiftCandidate {
  return {
    key: option.profileId,
    profileId: option.profileId,
    displayName: option.displayName,
    avatarUrl: option.avatarUrl ?? null,
    source: option.source,
  };
}

type PlaceGiftDrawFlowProps = Pick<PlaceGiftToolProps,
  "draw" | "disabled" | "senderGradeLevel" | "onCreateDraw" | "onScheduleDraw" | "onStartDraw" | "onCancelDraw" | "onDone" | "terminology"
> & {
  recipients: PlaceGiftRecipientOption[];
  queueCount: number;
  roomCount: number | null;
  inventory: readonly ProfileGiftInventoryItem[];
  inventoryStatus: GiftInventoryStatus;
};

function PlaceGiftDrawFlow({
  recipients,
  queueCount,
  roomCount,
  inventory,
  inventoryStatus,
  senderGradeLevel,
  draw = null,
  disabled = false,
  onCreateDraw,
  onScheduleDraw,
  onStartDraw,
  onCancelDraw,
  onDone,
  terminology = "gift",
}: PlaceGiftDrawFlowProps) {
  const rewardWording = terminology === "reward";
  const [step, setStep] = useState(0);
  const [gift, setGift] = useState<string | null>(null);
  const [poolMode, setPoolMode] = useState<RoomGiftDrawPoolMode>("queue");
  const [manualNames, setManualNames] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [delivery, setDelivery] = useState<"now" | "scheduled">("now");
  const [date, setDate] = useState(() => profileGiftDateAfter(1));
  const [time, setTime] = useState("18:30");
  const [duration, setDuration] = useState<5 | 7 | 10>(7);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"prepare" | "start" | "cancel" | null>(null);
  const [dismissedDrawId, setDismissedDrawId] = useState<string | null>(null);
  const drawOperation = useRef<{ signature: string; key: string } | null>(null);

  // Re-evaluate eligibility at submit time. A profile can disappear from the
  // Room and remain only as a Messaging contact while this form is open; such
  // a private contact must never leak into a public draw candidate snapshot.
  const selectedRecipients = recipients
    .filter(isPublicDrawRecipient)
    .filter((recipient) => selectedProfileIds.includes(recipient.profileId));
  const { candidates: manualCandidates, truncated: manualCandidatesTruncated } = manualDrawSelection(manualNames);
  const visibleDraw = draw && draw.id !== dismissedDrawId ? draw : null;

  const selectionCount = poolMode === "manual"
    ? manualCandidates.length
    : poolMode === "queue"
      ? queueCount
      : poolMode === "room"
        ? roomCount
        : selectedRecipients.length;
  const selectionLabel = selectionCount === null
    ? "Éligibles confirmés par le serveur"
    : `${selectionCount.toLocaleString("fr-FR")} participant${selectionCount > 1 ? "s" : ""}`;

  const validateParticipants = () => {
    if (poolMode === "manual" && manualCandidates.length < 2) return "Saisis au moins deux noms";
    if (poolMode === "queue" && queueCount < 1) return "La file d’attente est vide";
    if (poolMode === "room" && roomCount !== null && roomCount < 2) return "La Room ne contient pas assez de participants";
    if (poolMode === "selected" && selectedRecipients.length < 2) return "Sélectionne au moins deux personnes";
    return null;
  };

  const goForward = () => {
    if (step === 0 && !gift) {
      setMessage(rewardWording ? "Choisis une récompense" : "Choisis un cadeau");
      return;
    }
    if (step === 1) {
      const error = validateParticipants();
      if (error) {
        setMessage(error);
        return;
      }
    }
    setMessage("");
    setStep((current) => Math.min(2, current + 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const selectedGift = profileGiftItemFor(gift);
    const giftCode = roomGiftCodeForLabel(selectedGift.name);
    if (!gift || !giftCode || !ROOM_STANDARD_GIFT_CATALOG.some((item) => item.name === gift)) {
      setStep(0);
      setMessage(rewardWording ? "Choisis une récompense valide" : "Choisis un cadeau valide");
      return;
    }
    const participantsError = validateParticipants();
    if (participantsError) {
      setStep(1);
      setMessage(participantsError);
      return;
    }
    let scheduledAt: string | null = null;
    if (delivery === "scheduled") {
      const scheduleError = validateProfileGiftSchedule(date, time);
      scheduledAt = scheduledDrawDate(date, time);
      if (scheduleError || !scheduledAt) {
        setMessage(scheduleError || "Date de programmation invalide");
        return;
      }
    }
    const candidates = poolMode === "manual"
      ? manualCandidates
      : poolMode === "selected"
        ? selectedRecipients.map(recipientDrawCandidate)
        : undefined;
    const baseInput: RoomGiftDrawInput = {
      giftCode,
      giftLabel: selectedGift.name,
      poolMode,
      candidates,
      animationDurationSeconds: duration,
      scheduledAt,
    };
    const signature = JSON.stringify(baseInput);
    if (drawOperation.current?.signature !== signature) {
      drawOperation.current = { signature, key: newDrawIdempotencyKey() };
    }
    const input: RoomGiftDrawInput = {
      ...baseInput,
      idempotencyKey: drawOperation.current.key,
    };

    setBusy("prepare");
    setMessage("");
    try {
      const prepared = delivery === "scheduled" && scheduledAt
        ? await onScheduleDraw?.({ ...input, scheduledAt })
        : await onCreateDraw?.(input);
      if (!prepared) throw new Error("draw-not-created");
      setDismissedDrawId(null);
      onDone?.(delivery === "scheduled" ? "Tirage programmé" : "Tirage prêt à lancer");
    } catch (error) {
      setMessage(giftOperationFailure(error, "Le tirage n’a pas pu être préparé. Réessaie.", terminology));
    } finally {
      setBusy(null);
    }
  };

  const start = async () => {
    if (!visibleDraw) return;
    setBusy("start");
    try {
      const started = await onStartDraw?.(visibleDraw.id);
      if (!started) throw new Error("draw-not-started");
      onDone?.("Tirage lancé sur la scène");
    } catch {
      setMessage("Le tirage n’a pas pu démarrer.");
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!visibleDraw) return;
    setBusy("cancel");
    try {
      const cancelled = await onCancelDraw?.(visibleDraw.id);
      if (!cancelled) throw new Error("draw-not-cancelled");
      drawOperation.current = null;
      onDone?.("Tirage annulé");
    } catch {
      setMessage("Le tirage n’a pas pu être annulé.");
    } finally {
      setBusy(null);
    }
  };

  if (visibleDraw && visibleDraw.status !== "cancelled") {
    const scheduledLabel = visibleDraw.scheduledAt
      ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(visibleDraw.scheduledAt))
      : null;
    return (
      <div className={`place-gift-draw-state is-${visibleDraw.status}`} role="status" aria-live="polite">
        <span className="place-gift-draw-state__visual">
          {visibleDraw.status === "revealed" ? <Trophy aria-hidden="true" /> : visibleDraw.status === "spinning" ? <Dices aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
        </span>
        <small>{visibleDraw.status === "ready" ? "PRÊT À DIFFUSER" : visibleDraw.status === "scheduled" ? "PROGRAMMÉ" : visibleDraw.status === "spinning" ? "À L’ÉCRAN" : "GAGNANT RÉVÉLÉ"}</small>
        <strong>{visibleDraw.giftLabel}</strong>
        {visibleDraw.status === "revealed" && visibleDraw.winner ? (
          <div className="place-gift-draw-state__winner">
            <span className="place-gift-tool__recipient-avatar">{visibleDraw.winner.avatarUrl ? <img src={visibleDraw.winner.avatarUrl} alt="" /> : recipientInitials(visibleDraw.winner.displayName)}</span>
            <span><small>{rewardWording ? "LA RÉCOMPENSE EST POUR" : "LE CADEAU EST POUR"}</small><strong>{visibleDraw.winner.displayName}</strong></span>
          </div>
        ) : <p>{visibleDraw.eligibleCount.toLocaleString("fr-FR")} participant{visibleDraw.eligibleCount > 1 ? "s" : ""}{scheduledLabel ? ` · ${scheduledLabel}` : ""}</p>}
        <div className="place-gift-draw-state__actions">
          {visibleDraw.status === "ready" ? <button type="button" className="is-primary" disabled={disabled || busy !== null} onClick={() => void start()}><Play aria-hidden="true" />{busy === "start" ? "Lancement…" : "Lancer à l’écran"}</button> : null}
          {visibleDraw.status === "ready" || visibleDraw.status === "scheduled" || visibleDraw.status === "spinning" ? <button type="button" className="is-danger" disabled={disabled || busy !== null} onClick={() => void cancel()}>{busy === "cancel" ? "Annulation…" : "Annuler"}</button> : null}
          {visibleDraw.status === "revealed" ? <button type="button" className="is-secondary" onClick={() => { drawOperation.current = null; setDismissedDrawId(visibleDraw.id); setStep(0); setGift(null); }}><RotateCcw aria-hidden="true" /> Nouveau tirage</button> : null}
        </div>
        {message ? <p className="place-gift-tool__message" role="alert">{message}</p> : null}
      </div>
    );
  }

  return (
    <form className="place-gift-tool__form place-gift-tool__draw-form" data-step={step} onSubmit={submit}>
      <ol className="place-gift-tool__steps" aria-label="Étapes du tirage au sort">
        {(rewardWording ? ["Récompense", "Participants", "Diffusion"] : DRAW_STEP_LABELS).map((label, index) => (
          <li key={label} className={`${index === step ? "is-current" : ""}${index < step ? " is-complete" : ""}`}>
            <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span><small>{label}</small>
          </li>
        ))}
      </ol>

      <div className="place-gift-tool__body">
        {step === 0 ? (
          <fieldset className="place-gift-tool__catalog">
            <legend><span><Sparkles aria-hidden="true" /> {rewardWording ? "Récompense à attribuer" : "Cadeau à faire gagner"}</span><b>{ROOM_STANDARD_GIFT_CATALOG.length} récompenses</b></legend>
            <RoomGiftCatalogCards selectedGift={gift} onSelect={(nextGift) => { setGift(nextGift); setMessage(""); }} inventory={inventory} inventoryStatus={inventoryStatus} senderGradeLevel={senderGradeLevel} />
          </fieldset>
        ) : null}

        {step === 1 ? (
          <fieldset className="place-gift-draw-participants">
            <legend><Users aria-hidden="true" /> Participants au tirage</legend>
            <div className="place-gift-draw-pools" role="group" aria-label="Source des participants">
              {DRAW_POOL_OPTIONS.map((option) => {
                const count = option.id === "queue" ? queueCount : option.id === "room" ? roomCount : option.id === "selected" ? selectedRecipients.length : manualCandidates.length;
                return <button type="button" key={option.id} className={poolMode === option.id ? "is-selected" : ""} aria-pressed={poolMode === option.id} onClick={() => { setPoolMode(option.id); setMessage(""); }}><span><strong>{option.label}</strong><small>{option.detail}</small></span><b>{count ?? "—"}</b>{poolMode === option.id ? <Check aria-hidden="true" /> : null}</button>;
              })}
            </div>
            {poolMode === "manual" ? <label className="place-gift-draw-manual"><span>Noms, séparés par une virgule ou une ligne · maximum 5 000</span><textarea aria-label="Noms du tirage" value={manualNames} onChange={(event) => { setManualNames(event.currentTarget.value); setMessage(""); }} placeholder={"Aïcha Sol\nLior Benali\nJune Kairo"} />{manualCandidatesTruncated ? <small role="status">Limite atteinte : les 5 000 premiers noms uniques participeront.</small> : null}</label> : null}
            {poolMode === "queue" ? <p className="place-gift-draw-pool-summary"><Users aria-hidden="true" /><span><strong>{queueCount} personne{queueCount > 1 ? "s" : ""} dans la file</strong><small>La liste est figée au moment de la préparation.</small></span></p> : null}
            {poolMode === "room" ? <p className="place-gift-draw-pool-summary"><Radio aria-hidden="true" /><span><strong>Toute la Room connectée</strong><small>{roomCount === null ? "Le serveur confirmera les comptes actifs à la préparation." : `${roomCount.toLocaleString("fr-FR")} comptes réellement éligibles dans cette démo.`}</small></span></p> : null}
            {poolMode === "selected" ? <div className="place-gift-tool__recipient-groups place-gift-draw-custom-list">{RECIPIENT_GROUPS.filter((group) => group.source !== "messaging").map((group) => {
              const options = recipients.filter((recipient) => recipient.source === group.source);
              return <section key={group.source} className={`place-gift-tool__recipient-group is-${group.source}`} role="group" aria-label={group.label}><header><span><strong>{group.label}</strong><small>{group.detail}</small></span><b>{options.length}</b></header>{options.length ? <div>{options.map((option) => {
                const selected = selectedProfileIds.includes(option.profileId);
                return <button type="button" key={option.profileId} className={selected ? "is-selected" : ""} aria-label={option.displayName} aria-pressed={selected} onClick={() => { setSelectedProfileIds((current) => selected ? current.filter((id) => id !== option.profileId) : [...current, option.profileId]); setMessage(""); }}><span className="place-gift-tool__recipient-avatar">{option.avatarUrl ? <img src={option.avatarUrl} alt="" /> : recipientInitials(option.displayName)}</span><span><strong>{option.displayName}</strong><small>{option.detail || group.detail}</small></span><i>{selected ? <Check aria-hidden="true" /> : null}</i></button>;
              })}</div> : <p className="place-gift-tool__recipient-empty">{group.empty}</p>}</section>;
            })}</div> : null}
          </fieldset>
        ) : null}

        {step === 2 ? (
          <fieldset className="place-gift-draw-broadcast">
            <legend><Radio aria-hidden="true" /> Diffusion publique</legend>
            <div className="place-gift-draw-delivery" role="group" aria-label="Moment du tirage"><button type="button" className={delivery === "now" ? "is-selected" : ""} aria-pressed={delivery === "now"} onClick={() => setDelivery("now")}><Play aria-hidden="true" /><span><strong>Préparer maintenant</strong><small>Le Host lancera ensuite l’animation</small></span>{delivery === "now" ? <Check aria-hidden="true" /> : null}</button><button type="button" className={delivery === "scheduled" ? "is-selected" : ""} aria-pressed={delivery === "scheduled"} onClick={() => setDelivery("scheduled")}><CalendarClock aria-hidden="true" /><span><strong>Programmer</strong><small>Démarrage automatique à l’heure choisie</small></span>{delivery === "scheduled" ? <Check aria-hidden="true" /> : null}</button></div>
            {delivery === "scheduled" ? <div className="place-gift-tool__schedule"><label><span>Date</span><input type="date" min={profileGiftToday()} max={profileGiftDateAfter(30)} value={date} onChange={(event) => setDate(event.currentTarget.value)} /></label><label><span>Heure</span><input aria-label="Heure du tirage" value={time} inputMode="numeric" placeholder="18:30" onChange={(event) => setTime(event.currentTarget.value)} /></label></div> : null}
            <fieldset className="place-gift-draw-duration"><legend><Clock3 aria-hidden="true" /> Animation à l’écran</legend><div role="group" aria-label="Durée de l’animation">{([5, 7, 10] as const).map((seconds) => <button type="button" key={seconds} className={duration === seconds ? "is-selected" : ""} aria-pressed={duration === seconds} onClick={() => setDuration(seconds)}>{seconds} s</button>)}</div></fieldset>
            <div className="place-gift-tool__recap"><ProfileGiftObject item={profileGiftItemFor(gift)} compact /><span><small>{DRAW_POOL_OPTIONS.find((option) => option.id === poolMode)?.label}</small><strong>{gift}</strong><em>{selectionLabel} · animation {duration} s</em></span></div>
            <p className="place-gift-draw-privacy"><Sparkles aria-hidden="true" /> Le public voit le compteur, puis uniquement le gagnant. Les noms privés ne défilent jamais à l’écran.</p>
          </fieldset>
        ) : null}
      </div>

      {message ? <p className="place-gift-tool__message" role="status">{message}</p> : null}
      <footer className="place-gift-tool__footer">
        {step > 0 ? <button type="button" className="is-secondary" onClick={() => { setStep((current) => Math.max(0, current - 1)); setMessage(""); }}><ArrowLeft aria-hidden="true" /> Retour</button> : <RoomGiftInventoryShortcut inventory={inventory} inventoryStatus={inventoryStatus} terminology={terminology} />}
        {step < 2 ? <button type="button" className="is-primary" onClick={goForward} disabled={disabled}>{step === 0 ? "Choisir les participants" : "Configurer la diffusion"} <ArrowRight aria-hidden="true" /></button> : <button type="submit" className="is-primary" disabled={disabled || busy !== null} aria-busy={busy === "prepare"}>{busy === "prepare" ? "Préparation…" : delivery === "scheduled" ? "Programmer le tirage" : "Préparer le tirage"}</button>}
      </footer>
    </form>
  );
}

export default function PlaceGiftTool({
  terminology = "gift",
  recipientOptions = [],
  initialRecipientProfileId,
  messagingStatus = "idle",
  messagingMode = "live",
  messagingError = null,
  queueCount,
  roomCount,
  disabled = false,
  senderGradeLevel,
  onSubmit,
  draw,
  onCreateDraw,
  onScheduleDraw,
  onStartDraw,
  onCancelDraw,
  onDone,
}: PlaceGiftToolProps) {
  const rewardWording = terminology === "reward";
  const [mode, setMode] = useState<"offer" | "draw">("offer");
  const [step, setStep] = useState(0);
  const [gift, setGift] = useState<string | null>(null);
  const [customGiftTitle, setCustomGiftTitle] = useState("");
  const [customGiftImageUrl, setCustomGiftImageUrl] = useState<string | null>(null);
  const [recipientProfileId, setRecipientProfileId] = useState<string | null>(initialRecipientProfileId ?? null);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [action, setAction] = useState<GiftAction>("Envoyer maintenant");
  const [date, setDate] = useState(() => profileGiftDateAfter(1));
  const [time, setTime] = useState("18:30");
  const [round, setRound] = useState(PROFILE_GIFT_ROUND_OPTIONS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<PlaceGiftSubmission | null>(null);
  const [giftInventory, setGiftInventory] = useState<ProfileGiftInventoryItem[]>([]);
  const [giftInventoryStatus, setGiftInventoryStatus] = useState<GiftInventoryStatus>("loading");
  const giftOperation = useRef<{ signature: string; key: string } | null>(null);
  const giftInventoryLoad = useRef(0);

  const refreshGiftInventory = useCallback(async () => {
    const request = ++giftInventoryLoad.current;
    setGiftInventoryStatus("loading");
    try {
      const nextInventory = await profileGiftInventoryRepository.listMine();
      if (giftInventoryLoad.current !== request) return;
      setGiftInventory(nextInventory);
      setGiftInventoryStatus("ready");
    } catch {
      if (giftInventoryLoad.current !== request) return;
      setGiftInventory([]);
      setGiftInventoryStatus("error");
    }
  }, []);

  useEffect(() => {
    void refreshGiftInventory();
    return () => { giftInventoryLoad.current += 1; };
  }, [draw?.id, draw?.status, refreshGiftInventory]);

  const recipients = useMemo(() => {
    const unique = new Map<string, PlaceGiftRecipientOption>();
    RECIPIENT_GROUPS.forEach(({ source }) => {
      recipientOptions.forEach((option) => {
        const profileId = option.profileId.trim();
        const displayName = option.displayName.trim();
        if (option.source !== source || !profileId || !displayName || unique.has(profileId)) return;
        unique.set(profileId, { ...option, profileId, displayName });
      });
    });
    return Array.from(unique.values());
  }, [recipientOptions]);

  const selectedRecipient = recipients.find((option) => option.profileId === recipientProfileId) ?? null;
  const normalizedSearch = recipientSearch.trim().toLocaleLowerCase("fr-FR");
  const visibleRecipients = useMemo(() => normalizedSearch
    ? recipients.filter((option) => normalizedRecipientSearch(option).includes(normalizedSearch))
    : recipients, [normalizedSearch, recipients]);
  const selectedGift = profileGiftItemFor(gift);

  const chooseRecipient = (option: PlaceGiftRecipientOption) => {
    setRecipientProfileId(option.profileId);
    setMessage("");
  };

  const goForward = () => {
    if (step === 0 && !gift) {
      setMessage(rewardWording ? "Choisis une récompense" : "Choisis un cadeau");
      return;
    }
    if (step === 1 && !selectedRecipient) {
      setMessage("Choisis un destinataire");
      return;
    }
    setMessage("");
    setStep((current) => Math.min(2, current + 1));
  };

  const goBack = () => {
    setMessage("");
    setStep((current) => Math.max(0, current - 1));
  };

  const submitGift = async (event: FormEvent) => {
    event.preventDefault();
    if (!onSubmit) return;
    if (!gift || !ROOM_STANDARD_GIFT_CATALOG.some((item) => item.name === gift)) {
      setStep(0);
      setMessage(rewardWording ? "Choisis une récompense valide" : "Choisis un cadeau valide");
      return;
    }
    if (gift === "La Certif" && (senderGradeLevel ?? 0) < 4) {
      setStep(0);
      setMessage("La Certif est accessible à partir du grade 4 étoiles");
      return;
    }
    if (gift === "Cadeau surprise" && !customGiftTitle.trim()) {
      setStep(0);
      setMessage("Donne un nom au cadeau surprise");
      return;
    }
    if (!selectedRecipient) {
      setStep(1);
      setMessage("Choisis un destinataire");
      return;
    }
    if (action === "Programmer") {
      const scheduleError = validateProfileGiftSchedule(date, time);
      if (scheduleError) {
        setMessage(scheduleError);
        return;
      }
    }
    if (action === "Ajouter à une ronde" && !round.trim()) {
      setMessage("Choisis une ronde");
      return;
    }

    const baseSubmission = {
      gift,
      recipient: selectedRecipient.displayName,
      recipientProfileId: selectedRecipient.profileId,
      recipientSource: selectedRecipient.source,
      recipientAvatarUrl: selectedRecipient.avatarUrl ?? null,
      action,
      status: profileGiftStatusForAction(action),
      delivery: profileGiftDeliveryForAction(action, date, time, round),
      date: action === "Programmer" ? date : "",
      time: action === "Programmer" ? time : "",
      round: action === "Ajouter à une ronde" ? round : "",
      ...(gift === "Cadeau surprise" ? { customGift: { title: customGiftTitle.trim(), imageUrl: customGiftImageUrl } } : {}),
    };
    const signature = JSON.stringify(baseSubmission);
    if (giftOperation.current?.signature !== signature) {
      giftOperation.current = { signature, key: newGiftIdempotencyKey() };
    }
    const submission: PlaceGiftSubmission = {
      ...baseSubmission,
      idempotencyKey: giftOperation.current.key,
    };

    setBusy(true);
    setMessage("");
    try {
      await onSubmit(submission);
      giftOperation.current = null;
      setCompleted(submission);
      void refreshGiftInventory();
      onDone?.(completionMessage(action, terminology));
    } catch (error) {
      setMessage(giftOperationFailure(error, rewardWording ? "La récompense n’a pas pu être validée. Réessaie." : "Le cadeau n’a pas pu être validé. Réessaie.", terminology));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep(0);
    setGift(null);
    setCustomGiftTitle("");
    setCustomGiftImageUrl(null);
    setRecipientProfileId(null);
    setRecipientSearch("");
    setAction("Envoyer maintenant");
    setDate(profileGiftDateAfter(1));
    setTime("18:30");
    setRound(PROFILE_GIFT_ROUND_OPTIONS[0]);
    setMessage("");
    setCompleted(null);
    giftOperation.current = null;
  };

  return (
    <section className="place-gift-tool" aria-labelledby="place-gift-tool-title">
      <header className="place-gift-tool__header">
        <span className="place-gift-tool__glyph">{mode === "offer" ? <Gift aria-hidden="true" /> : <Dices aria-hidden="true" />}</span>
        <span>
          <small>RÉCOMPENSE ROOM</small>
          <strong id="place-gift-tool-title">{mode === "offer" ? rewardWording ? "Attribuer une récompense" : "Envoyer un cadeau" : "Lancer un tirage"}</strong>
          <em>{mode === "offer" ? `${ROOM_STANDARD_GIFT_CATALOG.length} récompenses disponibles` : "Une animation publique, un résultat confidentiel jusqu’à la révélation"}</em>
        </span>
      </header>

      <nav className="place-gift-tool__mode" aria-label={rewardWording ? "Mode récompense" : "Mode cadeau"}>
        <button type="button" className={mode === "offer" ? "is-active" : ""} aria-pressed={mode === "offer"} onClick={() => setMode("offer")}><Gift aria-hidden="true" /><span><strong>Offrir</strong><small>À une personne</small></span></button>
        <button type="button" className={mode === "draw" ? "is-active" : ""} aria-pressed={mode === "draw"} onClick={() => setMode("draw")}><Dices aria-hidden="true" /><span><strong>Tirage</strong><small>Pour toute la Room</small></span></button>
      </nav>

      {mode === "draw" ? <PlaceGiftDrawFlow
        recipients={recipients}
        queueCount={queueCount ?? recipients.filter((recipient) => recipient.source === "queue").length}
        roomCount={roomCount === undefined ? recipients.length : roomCount}
        draw={draw}
        disabled={disabled}
        onCreateDraw={onCreateDraw}
        onScheduleDraw={onScheduleDraw}
        onStartDraw={onStartDraw}
        onCancelDraw={onCancelDraw}
        inventory={giftInventory}
        inventoryStatus={giftInventoryStatus}
        senderGradeLevel={senderGradeLevel}
        terminology={terminology}
        onDone={onDone}
      /> : completed ? (
        <div className="place-gift-tool__success" role="status">
          <span className="place-gift-tool__success-visual"><ProfileGiftObject item={profileGiftItemFor(completed.gift)} /></span>
          <span><Check aria-hidden="true" /></span>
          <small>{completed.status}</small>
          <strong>{completed.gift}</strong>
          <p>Pour {completed.recipient} · {completed.delivery}</p>
          <button type="button" onClick={reset}><RotateCcw aria-hidden="true" /> {rewardWording ? "Préparer une autre récompense" : "Préparer un autre cadeau"}</button>
        </div>
      ) : (
        <form className="place-gift-tool__form" data-step={step} onSubmit={submitGift}>
          <ol className="place-gift-tool__steps" aria-label={rewardWording ? "Étapes de la récompense" : "Étapes du cadeau"}>
            {(rewardWording ? ["Récompense", "Destinataire", "Envoi"] : STEP_LABELS).map((label, index) => (
              <li key={label} className={`${index === step ? "is-current" : ""}${index < step ? " is-complete" : ""}`}>
                <span>{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
                <small>{label}</small>
              </li>
            ))}
          </ol>

          <div className="place-gift-tool__body">
            {step === 0 ? (
              <fieldset className="place-gift-tool__catalog">
                <legend><span><Sparkles aria-hidden="true" /> Choisir une récompense</span><b>{ROOM_STANDARD_GIFT_CATALOG.length} récompenses</b></legend>
                <RoomGiftCatalogCards selectedGift={gift} onSelect={(nextGift) => { setGift(nextGift); setMessage(""); }} inventory={giftInventory} inventoryStatus={giftInventoryStatus} senderGradeLevel={senderGradeLevel} />
                {gift === "Cadeau surprise" ? <div className="place-gift-tool__surprise-config">
                  <label><span>Quel cadeau offres-tu ?</span><input value={customGiftTitle} maxLength={80} placeholder="Ex. Dernier iPhone" onChange={(event) => setCustomGiftTitle(event.currentTarget.value)} /></label>
                  <label className="place-gift-tool__surprise-photo"><ImagePlus aria-hidden="true" /><span><strong>Ajouter une photo</strong><small>{customGiftImageUrl ? "Photo ajoutée" : "JPG, PNG ou WEBP"}</small></span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; setCustomGiftImageUrl(file ? URL.createObjectURL(file) : null); }} /></label>
                  {customGiftImageUrl ? <img src={customGiftImageUrl} alt="Aperçu du cadeau surprise" /> : null}
                </div> : null}
              </fieldset>
            ) : null}

            {step === 1 ? (
              <fieldset className="place-gift-tool__recipients">
                <legend><Users aria-hidden="true" /> Choisir le destinataire</legend>
                <label className="place-gift-tool__recipient-search">
                  <Search aria-hidden="true" />
                  <input
                    aria-label="Rechercher un destinataire"
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.currentTarget.value)}
                    placeholder="Rechercher dans la Room ou la Messagerie"
                  />
                </label>
                <div className="place-gift-tool__recipient-groups">
                  {RECIPIENT_GROUPS.map((group) => {
                    const groupRecipients = visibleRecipients.filter((option) => option.source === group.source);
                    const messagingLoading = group.source === "messaging" && messagingStatus === "loading";
                    const messagingFailed = group.source === "messaging" && messagingStatus === "error";
                    return (
                      <section key={group.source} className={`place-gift-tool__recipient-group is-${group.source}`} role="group" aria-label={group.label}>
                        <header>
                          <span><strong>{group.label}</strong><small>{group.detail}</small></span>
                          <b>{groupRecipients.length}</b>
                        </header>
                        {group.source === "messaging" && messagingMode === "local-demo" ? <p className="place-gift-tool__recipient-mode">Contacts locaux de démonstration</p> : null}
                        {messagingLoading ? <p className="place-gift-tool__recipient-empty">Chargement des contacts…</p> : null}
                        {messagingFailed ? <p className="place-gift-tool__recipient-empty is-error">{messagingError || "Messagerie indisponible"}</p> : null}
                        {!messagingLoading && !messagingFailed && groupRecipients.length === 0 ? <p className="place-gift-tool__recipient-empty">{normalizedSearch ? "Aucun résultat" : group.empty}</p> : null}
                        {groupRecipients.length > 0 ? <div>
                          {groupRecipients.map((option) => {
                            const selected = option.profileId === recipientProfileId;
                            return (
                              <button
                                type="button"
                                key={option.profileId}
                                className={selected ? "is-selected" : ""}
                                aria-label={option.displayName}
                                aria-pressed={selected}
                                onClick={() => chooseRecipient(option)}
                              >
                                <span className="place-gift-tool__recipient-avatar">
                                  {option.avatarUrl ? <img src={option.avatarUrl} alt="" /> : recipientInitials(option.displayName)}
                                </span>
                                <span><strong>{option.displayName}</strong><small>{option.detail || group.detail}</small></span>
                                <i>{selected ? <Check aria-hidden="true" /> : null}</i>
                              </button>
                            );
                          })}
                        </div> : null}
                      </section>
                    );
                  })}
                </div>
              </fieldset>
            ) : null}

            {step === 2 ? (
              <fieldset className="place-gift-tool__delivery">
                <legend><Send aria-hidden="true" /> Choisir l’envoi</legend>
                <div className="place-gift-tool__actions" role="group" aria-label="Moment d’envoi">
                  {PROFILE_GIFT_ACTIONS.map((item) => (
                    <button
                      type="button"
                      key={item}
                      className={action === item ? "is-selected" : ""}
                      aria-pressed={action === item}
                      onClick={() => {
                        setAction(item);
                        setMessage("");
                      }}
                    >
                      {item === "Programmer" ? <CalendarClock aria-hidden="true" /> : item === "Ajouter à une ronde" ? <Users aria-hidden="true" /> : <Send aria-hidden="true" />}
                      <span>{item}</span>
                      {action === item ? <Check aria-hidden="true" /> : null}
                    </button>
                  ))}
                </div>

                {action === "Programmer" ? (
                  <div className="place-gift-tool__schedule">
                    <label><span>Date</span><input type="date" min={profileGiftToday()} max={profileGiftDateAfter(30)} value={date} onChange={(event) => setDate(event.currentTarget.value)} /></label>
                    <label><span>Heure</span><input aria-label="Heure" value={time} inputMode="numeric" placeholder="18:30" onChange={(event) => setTime(event.currentTarget.value)} /></label>
                  </div>
                ) : null}

                {action === "Ajouter à une ronde" ? (
                  <label className="place-gift-tool__round"><span>Ronde</span><MeewavSelect value={round} onChange={(event) => setRound(event.currentTarget.value)}>{PROFILE_GIFT_ROUND_OPTIONS.map((option) => <option key={option}>{option}</option>)}</MeewavSelect></label>
                ) : null}

                <div className="place-gift-tool__recap">
                  <ProfileGiftObject item={selectedGift} compact />
                  <span><small>{selectedGift.rarity}</small><strong>{gift} · {selectedRecipient?.displayName}</strong><em>{action === "Programmer" ? `${date} à ${time}` : action === "Ajouter à une ronde" ? round : "Envoi après validation"}</em></span>
                </div>
              </fieldset>
            ) : null}
          </div>

          {message ? <p className="place-gift-tool__message" role="status">{message}</p> : null}

          <footer className="place-gift-tool__footer">
            {step > 0 ? <button type="button" className="is-secondary" onClick={goBack}><ArrowLeft aria-hidden="true" /> Retour</button> : <RoomGiftInventoryShortcut inventory={giftInventory} inventoryStatus={giftInventoryStatus} terminology={terminology} />}
            {step < 2 ? (
              <button type="button" className="is-primary" onClick={goForward} disabled={disabled}>{step === 0 ? "Choisir le destinataire" : "Choisir l’envoi"} <ArrowRight aria-hidden="true" /></button>
            ) : (
              <button type="submit" className="is-primary" disabled={disabled || busy || !onSubmit} aria-busy={busy}>{!onSubmit ? "Envoi indisponible" : busy ? "Validation…" : action === "Envoyer maintenant" ? "Envoyer" : action === "Programmer" ? "Programmer" : "Ajouter"}</button>
            )}
          </footer>
        </form>
      )}
    </section>
  );
}
