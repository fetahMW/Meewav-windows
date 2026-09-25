import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Gift,
  LockKeyhole,
  MoreHorizontal,
  PackageOpen,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Sparkles,
  Trophy,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PROFILE_GIFT_ACTIONS as giftActions,
  ROOM_STANDARD_GIFT_CATALOG as giftCatalog,
  PROFILE_GIFT_FALLBACK as fallbackGift,
  PROFILE_GIFT_MEEWAV_RECIPIENTS as meewavRecipients,
  PROFILE_GIFT_RECIPIENT_SOURCES as recipientSources,
  PROFILE_GIFT_ROUND_OPTIONS as roundOptions,
  PROFILE_GIFT_SHORTCUTS as shortcuts,
  PROFILE_GIFT_STATUSES as giftStatuses,
  PROFILE_GIFT_STORAGE_KEY as STORAGE_KEY,
  ProfileGiftObject as GiftObject,
  profileGiftItemFor as giftItemFor,
  type GiftAction,
  type GiftEntry,
  type GiftStatus,
  type RecipientSource,
} from "../gifts/profileGiftCatalog";
import {
  PROFILE_GIFT_INVENTORY_CODES,
  profileGiftInventoryRepository,
  type ProfileGiftInventoryItem,
} from "../gifts/profileGiftInventory.service";
import {
  profileRoomGiftAwardsRepository,
  type ProfileRoomGiftAward,
} from "../gifts/profileRoomGiftAwards.service";
import ProfileCertifEndorsementsPanel from "../gifts/ProfileCertifEndorsementsPanel";
import {
  ROOM_GIFT_LABEL_BY_CODE,
  roomGiftCodeForLabel,
} from "../../rooms/place/placeGiftCatalog";

type ProfileGiftsWorkspaceProps = {
  storageScope: string | null;
  onBack: () => void;
  onDone: (message: string) => void;
};

type GiftInventoryStatus = "idle" | "loading" | "ready" | "error";

function isGiftInventoryActive(inventory: readonly ProfileGiftInventoryItem[], status: GiftInventoryStatus) {
  return status === "ready"
    && inventory.length > 0
    && inventory.every((item) => item.enforcementActive);
}

function asLocalDraft(entry: GiftEntry): GiftEntry {
  const archived = entry.status === "Annulé";
  return {
    ...entry,
    action: "Ajouter à une ronde",
    status: archived ? "Annulé" : "Prêt",
    delivery: archived ? "Brouillon archivé" : (entry.round || "À distribuer en Room"),
    date: "",
    time: "",
  };
}

function loadEntries(storageKey: string | null): GiftEntry[] {
  if (!storageKey) return [];
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    const entries = parsed.flatMap((candidate): GiftEntry[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const source = candidate as Partial<GiftEntry>;
      if (
        typeof source.id !== "string"
        || typeof source.gift !== "string"
        || typeof source.recipient !== "string"
        || !giftStatuses.includes(source.status as GiftStatus)
        || !giftActions.includes(source.action as GiftAction)
      ) return [];
      const recipientSource = source.recipientSource === "Raccourci" || shortcuts.includes(source.recipient)
        ? "Raccourci"
        : recipientSources.includes(source.recipientSource as RecipientSource)
          ? source.recipientSource as RecipientSource
          : "Meewav";
      return [asLocalDraft({
        id: source.id,
        gift: source.gift,
        recipient: source.recipient,
        recipientSource,
        action: source.action as GiftAction,
        status: source.status as GiftStatus,
        delivery: typeof source.delivery === "string" ? source.delivery : "À définir",
        date: typeof source.date === "string" ? source.date : "",
        time: typeof source.time === "string" ? source.time : "",
        round: typeof source.round === "string" ? source.round : "",
      })];
    });
    return entries;
  } catch {
    // Le prototype reste fonctionnel sans stockage local.
  }
  return [];
}
const statusSlug = (status: string) => status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]+/g, "-");

function localDraftStatus(status: GiftStatus) {
  return status === "Annulé" ? "Archivé" : "Brouillon";
}

function StatusPill({ status }: { status: GiftStatus }) {
  return <span className={`profile-studio-status is-${statusSlug(status)}`}><i />{localDraftStatus(status)}</span>;
}

function GiftCatalog({
  inventory,
  inventoryStatus,
  selected,
  onSelect,
  showAdd = false,
}: {
  inventory: ProfileGiftInventoryItem[];
  inventoryStatus: GiftInventoryStatus;
  selected: string | null;
  onSelect: (name: string) => void;
  showAdd?: boolean;
}) {
  const byCode = new Map(inventory.map((item) => [item.giftCode, item]));
  const inventoryActive = isGiftInventoryActive(inventory, inventoryStatus);
  return <div className="profile-gift-catalog">{giftCatalog.map((item) => {
    const giftCode = roomGiftCodeForLabel(item.name);
    const availableQuantity = giftCode ? byCode.get(giftCode)?.availableQuantity ?? 0 : 0;
    const canSelect = inventoryActive && availableQuantity > 0;
    const isSelected = selected === item.name;
    const availability = inventoryStatus === "ready"
      ? inventoryActive
        ? `${availableQuantity} disponible${availableQuantity > 1 ? "s" : ""}`
        : "Activation en préparation"
      : inventoryStatus === "loading"
        ? "Vérification…"
        : "Stock masqué";
    return <button key={item.name} type="button" disabled={!canSelect} className={`profile-gift-catalog-card is-${item.visual} ${isSelected ? "is-selected" : ""} ${item.gold ? "is-gold" : ""} ${canSelect ? "" : "is-unavailable"}`} style={{ "--gift-tone": item.tone } as React.CSSProperties} aria-pressed={isSelected} onClick={() => canSelect && onSelect(item.name)}><GiftObject item={item} /><div className="profile-gift-catalog-card__copy"><span className="profile-gift-catalog-card__meta"><small>{item.rarity}</small><em className={canSelect ? "is-available" : "is-unavailable"}>{availability}</em></span><strong>{item.name}</strong><p>{item.detail}</p></div><i className="profile-gift-catalog-card__select">{isSelected ? <Check size={15} /> : showAdd && canSelect ? <Plus size={15} /> : null}</i></button>;
  })}</div>;
}

function GiftConfirm({ title, detail, confirmLabel, danger = false, icon: Icon = Gift, onCancel, onConfirm }: { title: string; detail: string; confirmLabel: string; danger?: boolean; icon?: LucideIcon; onCancel: () => void; onConfirm: () => void }) {
  return <div className="profile-studio-confirm-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section className="profile-studio-confirm" role="alertdialog" aria-modal="true" aria-label={title}><span><Icon size={21} /></span><div><h4>{title}</h4><p>{detail}</p></div><footer><button type="button" onClick={onCancel}>Retour</button><button type="button" className={danger ? "is-danger" : ""} onClick={onConfirm}><Icon size={15} /> {confirmLabel}</button></footer></section></div>;
}

type RoomAwardsStatus = "idle" | "loading" | "ready" | "error";

const roomAwardDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function roomAwardDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date serveur indisponible" : roomAwardDateFormatter.format(date);
}

function ProfileRoomGiftAwardsPanel({ awards, status }: { awards: ProfileRoomGiftAward[]; status: RoomAwardsStatus }) {
  if (status === "idle" || (status === "ready" && awards.length === 0)) return null;
  return <section className="profile-gifts-room-awards" aria-label="Cadeaux reçus en Room">
    <header><div><span className="profile-kicker"><Trophy size={14} /> Récompenses Room</span><h4>Cadeaux reçus</h4><p>Tirages et envois directs confirmés par le registre serveur.</p></div><span><ShieldCheck size={14} /> Source vérifiée</span></header>
    {status === "loading" ? <p className="profile-gifts-room-awards__state" role="status">Synchronisation des cadeaux Room…</p> : null}
    {status === "error" ? <p className="profile-gifts-room-awards__state is-error" role="alert">Les cadeaux Room sont momentanément indisponibles. Tes suivis locaux restent accessibles.</p> : null}
    {status === "ready" && awards.length > 0 ? <div className="profile-gifts-room-awards__list">{awards.map((award) => <article key={award.id}>
      <GiftObject item={giftItemFor(award.giftLabel)} compact />
      <div><span><h5>{award.giftLabel}</h5><em><Trophy size={12} /> {award.kind === "draw" ? "Gagné" : "Reçu"}</em></span><p>{award.kind === "draw" ? "Gagné lors d’un tirage public" : `Envoyé par ${award.senderDisplayNameSnapshot ?? "le Host"}${award.roomTitleSnapshot ? ` · ${award.roomTitleSnapshot}` : ""}`}</p><small><Clock3 size={12} /> Cadeau Room vérifié le {roomAwardDate(award.awardedAt)}</small><code>Registre serveur · récompense non modifiable</code></div>
    </article>)}</div> : null}
  </section>;
}

function ProfileGiftInventoryPanel({
  inventory,
  status,
  onRetry,
}: {
  inventory: ProfileGiftInventoryItem[];
  status: GiftInventoryStatus;
  onRetry: () => void;
}) {
  const byCode = new Map(inventory.map((item) => [item.giftCode, item]));
  const inventoryActive = isGiftInventoryActive(inventory, status);
  const totalAvailable = inventory.reduce((sum, item) => sum + item.availableQuantity, 0);
  const totalReserved = inventory.reduce((sum, item) => sum + item.reservedQuantity, 0);
  const isEmpty = inventoryActive && totalAvailable === 0 && totalReserved === 0;

  return <section className="profile-gifts-inventory" aria-label="Mes cadeaux disponibles">
    <header>
      <div><span className="profile-kicker"><PackageOpen size={14} /> Mon inventaire</span><h4>Mes cadeaux à distribuer</h4><p>Les quantités viennent de ton inventaire Room sécurisé.</p></div>
      <div className="profile-gifts-inventory__header-actions">
        {inventoryActive ? <span><strong>{totalAvailable}</strong> disponible{totalAvailable > 1 ? "s" : ""}<i />{totalReserved} réservé{totalReserved > 1 ? "s" : ""}</span> : null}
        <a href="/rooms"><Radio size={14} /> Ouvrir les Rooms</a>
      </div>
    </header>

    {status === "idle" ? <div className="profile-gifts-inventory__state" role="status"><PackageOpen size={18} /><span><strong>Inventaire privé</strong><small>Connecte-toi à ton profil pour consulter les cadeaux que tu peux distribuer.</small></span></div> : null}
    {status === "loading" ? <div className="profile-gifts-inventory__state" role="status"><RefreshCw className="is-spinning" size={18} /><span><strong>Synchronisation de ton inventaire…</strong><small>Nous vérifions les quantités disponibles et réservées.</small></span></div> : null}
    {status === "error" ? <div className="profile-gifts-inventory__state is-error" role="alert"><PackageOpen size={18} /><span><strong>Inventaire momentanément indisponible</strong><small>Aucune quantité approximative n’est affichée.</small></span><button type="button" onClick={onRetry}><RefreshCw size={13} /> Réessayer</button></div> : null}
    {status === "ready" && !inventoryActive ? <div className="profile-gifts-inventory__state" role="status"><RefreshCw size={18} /><span><strong>Activation de l’inventaire en préparation</strong><small>Les quantités seront affichées après le basculement serveur sécurisé. Les Rooms restent compatibles pendant cette transition.</small></span></div> : null}
    {isEmpty ? <div className="profile-gifts-inventory__empty" role="status"><Gift size={16} /><span><strong>Ton inventaire est vide pour le moment.</strong><small>Les cadeaux gagnés ou attribués apparaîtront ici, prêts à être distribués en Room.</small></span></div> : null}

    {inventoryActive ? <div className="profile-gifts-inventory__grid">{PROFILE_GIFT_INVENTORY_CODES.map((giftCode) => {
      const item = byCode.get(giftCode);
      const catalogItem = giftItemFor(ROOM_GIFT_LABEL_BY_CODE[giftCode]);
      const availableQuantity = item?.availableQuantity ?? 0;
      const reservedQuantity = item?.reservedQuantity ?? 0;
      return <article key={giftCode} style={{ "--gift-tone": catalogItem.tone } as React.CSSProperties}>
        <GiftObject item={catalogItem} compact />
        <div className="profile-gifts-inventory__copy"><small>{catalogItem.rarity}</small><strong>{catalogItem.name}</strong></div>
        <dl>
          <div><dt>Disponibles</dt><dd>{availableQuantity}</dd></div>
          <div><dt>Réservés</dt><dd>{reservedQuantity}</dd></div>
        </dl>
      </article>;
    })}</div> : null}
  </section>;
}

export default function ProfileGiftsWorkspace({ storageScope, onBack, onDone }: ProfileGiftsWorkspaceProps) {
  const storageKey = storageScope ? `${STORAGE_KEY}:${storageScope}` : null;
  const [entries, setEntries] = useState<GiftEntry[]>(() => loadEntries(storageKey));
  const [screen, setScreen] = useState<"overview" | "editor" | "detail">("overview");
  const [filter, setFilter] = useState("Inventaire");
  const [catalogChoice, setCatalogChoice] = useState<string | null>(null);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [gift, setGift] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [recipientSource, setRecipientSource] = useState<RecipientSource>("Raccourci");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [round, setRound] = useState(roundOptions[0]);
  const [formMessage, setFormMessage] = useState("");
  const [confirm, setConfirm] = useState<{ kind: "cancel" | "delete"; id: string } | null>(null);
  const [roomAwards, setRoomAwards] = useState<ProfileRoomGiftAward[]>([]);
  const [roomAwardsStatus, setRoomAwardsStatus] = useState<RoomAwardsStatus>(storageScope ? "loading" : "idle");
  const [giftInventory, setGiftInventory] = useState<ProfileGiftInventoryItem[]>([]);
  const [giftInventoryStatus, setGiftInventoryStatus] = useState<GiftInventoryStatus>(storageScope ? "loading" : "idle");
  const [giftInventoryRefresh, setGiftInventoryRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    if (!storageScope) {
      setRoomAwards([]);
      setRoomAwardsStatus("idle");
      return () => { active = false; };
    }
    setRoomAwardsStatus("loading");
    void profileRoomGiftAwardsRepository.listMine(storageScope).then((awards) => {
      if (!active) return;
      setRoomAwards(awards);
      setRoomAwardsStatus("ready");
    }).catch(() => {
      if (!active) return;
      setRoomAwards([]);
      setRoomAwardsStatus("error");
    });
    return () => { active = false; };
  }, [storageScope]);

  useEffect(() => {
    let active = true;
    if (!storageScope) {
      setGiftInventory([]);
      setGiftInventoryStatus("idle");
      return () => { active = false; };
    }
    setGiftInventoryStatus("loading");
    void profileGiftInventoryRepository.listMine(storageScope).then((inventory) => {
      if (!active) return;
      setGiftInventory(inventory);
      setGiftInventoryStatus("ready");
    }).catch(() => {
      if (!active) return;
      setGiftInventory([]);
      setGiftInventoryStatus("error");
    });
    return () => { active = false; };
  }, [giftInventoryRefresh, storageScope]);

  useEffect(() => {
    if (!storageKey) return;
    try { window.localStorage.setItem(storageKey, JSON.stringify(entries)); } catch { /* stockage optionnel */ }
  }, [entries, storageKey]);

  const activeDetail = entries.find((entry) => entry.id === detailId) ?? null;
  const filteredEntries = useMemo(() => entries.filter((entry) => {
    if (filter === "Archivés") return entry.status === "Annulé";
    return entry.status !== "Annulé";
  }), [entries, filter]);
  const availableGiftCount = useMemo(
    () => giftInventory.reduce((sum, item) => sum + item.availableQuantity, 0),
    [giftInventory],
  );
  const giftInventoryActive = useMemo(
    () => isGiftInventoryActive(giftInventory, giftInventoryStatus),
    [giftInventory, giftInventoryStatus],
  );
  const selectedGiftAvailability = useMemo(() => {
    const giftCode = gift ? roomGiftCodeForLabel(gift) : null;
    if (!giftInventoryActive || !giftCode) return null;
    return giftInventory.find((item) => item.giftCode === giftCode)?.availableQuantity ?? 0;
  }, [gift, giftInventory, giftInventoryActive]);

  const resetEditor = (selectedGift: string | null = null, initialStep = 0) => {
    setEditingId(null);
    setStep(initialStep);
    setGift(selectedGift);
    setRecipient("");
    setRecipientSource("Raccourci");
    setRound(roundOptions[0]);
    setRecipientPickerOpen(false);
    setFormMessage("");
  };

  const startNew = (selectedGift: string | null = null, initialStep = 0) => {
    resetEditor(selectedGift, initialStep);
    setScreen("editor");
  };

  const editEntry = (entry: GiftEntry, initialStep = 0) => {
    setEditingId(entry.id);
    setGift(entry.gift);
    setRecipient(entry.recipient);
    setRecipientSource(entry.recipientSource);
    setRound(entry.round || roundOptions[0]);
    setStep(initialStep);
    setFormMessage("");
    setRecipientPickerOpen(false);
    setActiveMenu(null);
    setScreen("editor");
  };

  const duplicateEntry = (entry: GiftEntry) => {
    const copy: GiftEntry = { ...entry, id: `${entry.id}-copy-${Date.now()}`, status: "Prêt", action: "Ajouter à une ronde", delivery: entry.round || "À distribuer en Room", date: "", time: "", round: entry.round || roundOptions[0] };
    setEntries((current) => [copy, ...current]);
    setFilter("Brouillons");
    setActiveMenu(null);
    onDone("Brouillon dupliqué localement");
  };

  const saveGift = () => {
    if (!gift || !giftCatalog.some((item) => item.name === gift)) { setFormMessage("Choisis un cadeau valide"); setStep(0); return; }
    const giftCode = roomGiftCodeForLabel(gift);
    const availableQuantity = giftCode
      ? giftInventory.find((item) => item.giftCode === giftCode)?.availableQuantity ?? 0
      : 0;
    if (!giftInventoryActive || availableQuantity < 1) { setFormMessage(giftInventoryActive ? "Ce cadeau n’est pas disponible dans ton inventaire." : "L’inventaire est encore en cours d’activation."); setStep(0); return; }
    const normalizedRecipient = recipient.trim();
    if (!normalizedRecipient) { setFormMessage("Choisis un destinataire"); setStep(1); return; }
    if (!round.trim()) { setFormMessage("Choisis la Room prévue"); setStep(2); return; }
    const next: GiftEntry = { id: editingId ?? `gift-${Date.now()}`, gift, recipient: normalizedRecipient, recipientSource, action: "Ajouter à une ronde", status: "Prêt", delivery: round, date: "", time: "", round };
    setEntries((current) => editingId ? current.map((entry) => entry.id === editingId ? next : entry) : [next, ...current]);
    setFilter("Brouillons");
    setScreen("overview");
    setEditingId(null);
    onDone("Brouillon enregistré · distribue-le depuis une Room");
  };

  const viewEntry = (entry: GiftEntry) => { setDetailId(entry.id); setActiveMenu(null); setScreen("detail"); };

  const goBack = () => {
    if (screen === "overview") return onBack();
    setScreen("overview");
  };

  const stepLabels = ["Cadeau", "Destinataire", "Room"];
  const canGoToStep = (target: number) => target === 0 || (target === 1 ? Boolean(gift) : Boolean(gift && recipient.trim()));
  const currentGift = giftCatalog.find((item) => item.name === gift) ?? null;

  return <section className="profile-studio-workspace profile-studio-mode-shell is-gifts profile-gifts-workspace" style={{ "--studio-flow-accent": "#d946ef" } as React.CSSProperties} aria-label="Cadeaux">
    {screen === "overview" ? <ProfileCertifEndorsementsPanel profileId={storageScope} onDone={onDone} /> : null}
    {screen === "overview" ? <ProfileRoomGiftAwardsPanel awards={roomAwards} status={roomAwardsStatus} /> : null}
    {screen !== "overview" && <div className="profile-studio-workspace__command"><button className="profile-studio-workspace__back" type="button" onClick={goBack}><ArrowLeft size={16} /> Cadeaux</button><div className="profile-studio-workspace__identity"><span><Gift size={24} /></span><div><small>Fans & communauté</small><h3>Cadeaux</h3><p>Prépare tes brouillons avant de les distribuer en Room.</p></div></div><span className="profile-studio-workspace__status"><ShieldCheck size={15} /> Espace privé</span></div>}

    {screen === "overview" && <div className="profile-studio-mode-overview">
      <header className="profile-studio-mode-heading profile-gifts-overview-hero"><button className="profile-studio-workspace__back" type="button" onClick={goBack}><ArrowLeft size={16} /> Studio</button><span className="profile-gifts-overview-hero__divider" aria-hidden="true" /><div className="profile-gifts-overview-hero__copy"><span className="profile-kicker"><Gift size={14} /> Fans & communauté · Cadeaux</span><h3>Prépare une attention, puis distribue-la depuis une Room.</h3><p>Le Profil conserve uniquement des brouillons locaux : aucune programmation ni aucun envoi n’y est déclenché.</p></div><button type="button" className="profile-primary-button" onClick={() => startNew()}><Plus size={17} /> Préparer un cadeau</button></header>
      <ProfileGiftInventoryPanel inventory={giftInventory} status={giftInventoryStatus} onRetry={() => setGiftInventoryRefresh((current) => current + 1)} />
      <div className="profile-studio-filter-row" aria-label="Filtrer les cadeaux">{["Inventaire", "Brouillons", "Archivés"].map((item) => <button key={item} type="button" className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "Inventaire" ? giftInventoryActive ? availableGiftCount : "—" : item === "Brouillons" ? entries.filter((entry) => entry.status !== "Annulé").length : entries.filter((entry) => entry.status === "Annulé").length}</span></button>)}</div>
      {filter === "Inventaire" && <section className="profile-gifts-catalog-section" aria-label="Catalogue de cadeaux à préparer"><header><div><span className="profile-kicker"><Sparkles size={14} /> Inventaire réel</span><h4>Choisir un cadeau disponible</h4></div>{catalogChoice && <button type="button" className="is-primary" onClick={() => startNew(catalogChoice, 1)}>Préparer <ArrowRight size={15} /></button>}</header><GiftCatalog inventory={giftInventory} inventoryStatus={giftInventoryStatus} selected={catalogChoice} showAdd onSelect={(name) => setCatalogChoice((current) => current === name ? null : name)} /></section>}
      <section className="profile-gifts-tracking" aria-label="Brouillons cadeaux locaux"><header><div><span className="profile-kicker"><Clock3 size={14} /> Préparation locale</span><h4>{filter === "Archivés" ? "Brouillons archivés" : "Brouillons à distribuer"}</h4></div><small>{filteredEntries.length} élément{filteredEntries.length > 1 ? "s" : ""}</small></header>{filteredEntries.length === 0 ? <p className="profile-gifts-drafts-empty"><LockKeyhole size={15} /> Aucun brouillon local dans cette section.</p> : <div className="profile-studio-tracking-list">{filteredEntries.map((entry) => <article key={entry.id} className={`profile-studio-tracking-card ${activeMenu === entry.id ? "is-menu-open" : ""}`} onClick={() => viewEntry(entry)}><GiftObject item={giftItemFor(entry.gift)} compact /><div className="profile-studio-tracking-card__copy"><div><h4>{entry.gift}</h4><StatusPill status={entry.status} /></div><p><span>{giftItemFor(entry.gift).rarity}</span> · Pour {entry.recipient}</p><small><Clock3 size={13} /> {entry.delivery}</small></div><div className="profile-studio-tracking-card__actions" onClick={(event) => event.stopPropagation()}>{entry.status !== "Annulé" ? <a className="is-primary" href="/rooms"><Radio size={14} /> Distribuer en Room</a> : <button type="button" onClick={() => viewEntry(entry)}>Voir <ChevronRight size={15} /></button>}<button type="button" aria-label={`Actions pour ${entry.gift}`} onClick={() => setActiveMenu((current) => current === entry.id ? null : entry.id)}><MoreHorizontal size={17} /></button></div>{activeMenu === entry.id && <div className="profile-studio-row-menu" role="menu" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => editEntry(entry)}><Pencil size={14} /> Modifier</button><button type="button" onClick={() => duplicateEntry(entry)}><Copy size={14} /> Dupliquer</button>{entry.status !== "Annulé" && <button type="button" className="is-danger" onClick={() => { setConfirm({ kind: "cancel", id: entry.id }); setActiveMenu(null); }}><X size={14} /> Archiver</button>}<button type="button" className="is-danger" onClick={() => { setConfirm({ kind: "delete", id: entry.id }); setActiveMenu(null); }}><Trash2 size={14} /> Supprimer</button></div>}</article>)}</div>}</section>
    </div>}

    {screen === "editor" && <div className="profile-gifts-editor">
      <header><div><span className="profile-kicker"><Gift size={14} /> Préparation locale</span><h3>{editingId ? "Modifier le brouillon" : "Nouveau brouillon cadeau"}</h3><p>Cadeau, destinataire et Room prévue. Rien n’est envoyé depuis le Profil.</p></div><span><LockKeyhole size={15} /> Brouillon privé</span></header>
      <ol className="profile-studio-real-steps is-three">{stepLabels.map((label, index) => <li key={label} className={`${index === step ? "is-current" : ""} ${index < step ? "is-complete" : ""}`}><button type="button" disabled={!canGoToStep(index)} onClick={() => canGoToStep(index) && setStep(index)}><i>{index < step ? <Check size={12} /> : index + 1}</i><span>{label}</span></button></li>)}</ol>
      <div className="profile-gifts-editor__layout"><aside className="profile-studio-live-summary"><span className="profile-kicker"><Gift size={14} /> Brouillon</span><div className="profile-gifts-summary-object"><GiftObject item={giftItemFor(gift)} /><span><small>{giftItemFor(gift).rarity}</small><em>{gift ? !giftInventoryActive ? "Activation en préparation" : selectedGiftAvailability === null ? "Stock non chargé" : `${selectedGiftAvailability} disponible${selectedGiftAvailability > 1 ? "s" : ""}` : "À composer"}</em></span></div><h4>{gift ?? "Cadeau à choisir"}</h4><p>{recipient || "Destinataire à choisir"}</p><dl><div><dt>Source</dt><dd>{recipientSource}</dd></div><div><dt>État</dt><dd>Brouillon local</dd></div><div><dt>Room prévue</dt><dd>{round}</dd></div></dl><span className="profile-studio-safe-note"><LockKeyhole size={14} /> Aucune distribution déclenchée</span></aside><div className="profile-gifts-editor__canvas"><header><div><small>Étape {step + 1} sur 3</small><h4>{step === 0 ? "Choisir dans mon inventaire" : step === 1 ? "Choisir le destinataire prévu" : "Choisir la Room prévue"}</h4></div><strong>0{step + 1} / 03</strong></header>
        {step === 0 && <GiftCatalog inventory={giftInventory} inventoryStatus={giftInventoryStatus} selected={gift} onSelect={(name) => { setGift((current) => current === name ? null : name); setFormMessage(""); }} />}
        {step === 1 && <div className="profile-gifts-recipients"><section><span className="profile-kicker"><Users size={14} /> Raccourcis</span><div>{shortcuts.map((name) => <button key={name} type="button" className={recipient === name && recipientSource === "Raccourci" ? "is-selected" : ""} onClick={() => { setRecipient(name); setRecipientSource("Raccourci"); setFormMessage(""); }}><span>{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><strong>{name}</strong>{recipient === name && recipientSource === "Raccourci" ? <Check size={14} /> : <ChevronRight size={14} />}</button>)}</div></section><button type="button" className="profile-cage-wide-choice" onClick={() => setRecipientPickerOpen((current) => !current)}><span><Users size={19} /></span><span><strong>Choisir un destinataire</strong><small>Cette intention reste dans le brouillon.</small></span><ChevronRight size={17} /></button>{recipientPickerOpen && <section className="profile-gifts-recipient-picker"><header><div><strong>Destinataires</strong><small>Profils Meewav</small></div><button type="button" onClick={() => setRecipientPickerOpen(false)}><X size={15} /></button></header><div>{meewavRecipients.map((name) => <button key={name} type="button" className={recipient === name ? "is-selected" : ""} onClick={() => { setRecipient(name); setRecipientSource("Meewav"); setRecipientPickerOpen(false); setFormMessage(""); }}><span>{name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><strong>{name}</strong><ChevronRight size={14} /></button>)}</div></section>}</div>}
        {step === 2 && <div className="profile-gifts-delivery"><div className="profile-gifts-draft-notice"><LockKeyhole size={20} /><div><strong>Le Profil enregistre uniquement ce brouillon.</strong><small>Pour débiter l’inventaire et distribuer le cadeau, ouvre une Room puis valide l’envoi dans son module Cadeaux.</small></div><a href="/rooms"><Radio size={14} /> Ouvrir les Rooms</a></div><label className="profile-cage-select"><span>Room ou ronde prévue</span><select value={round} onChange={(event) => setRound(event.target.value)}>{roundOptions.map((option) => <option key={option}>{option}</option>)}</select></label><div className="profile-gifts-final-recap"><GiftObject item={currentGift ?? fallbackGift} compact /><div><strong>{gift} · {recipient}</strong><small>Brouillon local · {round} · aucune distribution déclenchée</small></div></div></div>}
        {formMessage && <div className="profile-cage-form-message" role="status"><ShieldCheck size={15} /> {formMessage}</div>}
        <footer className="profile-gifts-editor__footer"><button type="button" onClick={() => step === 0 ? setScreen("overview") : setStep((current) => current - 1)}><ArrowLeft size={15} /> {step === 0 ? "Annuler" : "Retour"}</button><button type="button" className="is-primary" onClick={() => { if (step === 0 && !gift) { setFormMessage("Choisis un cadeau disponible"); return; } if (step < 2) setStep((current) => current + 1); else saveGift(); }}>{step === 2 ? <LockKeyhole size={16} /> : null}{step === 2 ? "Enregistrer le brouillon" : "Continuer"}{step < 2 ? <ArrowRight size={15} /> : null}</button></footer>
      </div></div>
    </div>}

    {screen === "detail" && activeDetail && <div className="profile-studio-detail-view profile-gift-detail"><button type="button" className="profile-studio-inline-back" onClick={() => setScreen("overview")}><ArrowLeft size={15} /> Retour aux cadeaux</button><article className={`profile-studio-detail-hero ${activeDetail.gift === "Golden Like" ? "is-gold" : ""}`}><GiftObject item={giftItemFor(activeDetail.gift)} /><div><span className="profile-kicker">Brouillon cadeau</span><h3>{activeDetail.gift}</h3><p>{giftItemFor(activeDetail.gift).detail} · Pour {activeDetail.recipient}</p></div><StatusPill status={activeDetail.status} /></article><div className="profile-gift-detail__grid"><article><span><Users size={18} /></span><div><small>Destinataire prévu</small><strong>{activeDetail.recipient}</strong><p>{activeDetail.recipientSource}</p></div></article><article><span><Rocket size={18} /></span><div><small>Distribution</small><strong>À effectuer en Room</strong><p>{activeDetail.delivery}</p></div></article><article><span><LockKeyhole size={18} /></span><div><small>État local</small><strong>{localDraftStatus(activeDetail.status)}</strong><p>Le Profil n’a ni envoyé ni réservé ce cadeau.</p></div></article></div><footer className="profile-gift-detail__actions"><button type="button" onClick={() => editEntry(activeDetail)}><Pencil size={15} /> Modifier</button>{activeDetail.status !== "Annulé" && <a className="is-primary" href="/rooms"><Radio size={15} /> Distribuer en Room</a>}</footer></div>}

    {confirm?.kind === "cancel" && <GiftConfirm title="Archiver ce brouillon ?" detail="Le brouillon local restera consultable dans la section Archivés. Aucun cadeau ne sera débité." confirmLabel="Archiver" danger icon={X} onCancel={() => setConfirm(null)} onConfirm={() => { setEntries((current) => current.map((entry) => entry.id === confirm.id ? { ...entry, status: "Annulé", delivery: "Brouillon archivé" } : entry)); setConfirm(null); setFilter("Archivés"); onDone("Brouillon archivé localement"); }} />}
    {confirm?.kind === "delete" && <GiftConfirm title="Supprimer ce brouillon ?" detail="Seul le brouillon local sera retiré. Ton inventaire Room ne sera pas modifié." confirmLabel="Supprimer" danger icon={Trash2} onCancel={() => setConfirm(null)} onConfirm={() => { setEntries((current) => current.filter((entry) => entry.id !== confirm.id)); setConfirm(null); onDone("Brouillon supprimé"); }} />}
  </section>;
}
