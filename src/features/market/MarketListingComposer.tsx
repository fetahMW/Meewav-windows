import {
  ArrowLeft,
  ArrowRight,
  BadgeEuro,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileImage,
  GripVertical,
  ImagePlus,
  Info,
  MapPin,
  PackageCheck,
  Plus,
  Repeat2,
  Save,
  ShieldCheck,
  Sparkles,
  Store,
  Ticket,
  Trash2,
  Truck,
  UploadCloud,
  UserRound,
  UsersRound,
  Video,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
} from "react";
import {
  MARKET_PILLARS,
  type MarketCategory,
  type MarketCondition,
  type MarketPillarId,
  type MarketServiceTerms,
} from "./marketDemoData";
import {
  classifyMarketplaceMediaFile,
  MARKETPLACE_MEDIA_ACCEPT,
} from "../profile/profile.media.service";
import { createMarketLocalMediaId } from "./market.media";
import {
  getCurrentMarketListingDateTime,
  getMarketListingRelativeDate,
  getMarketListingRelativeDateTime,
} from "./market.dates";
import "./market-listing-composer.css";

type ServiceKind = MarketServiceTerms["kind"];
export type MarketListingSellerKind = "artist" | "studio" | "store";

export type MarketListingMedia = {
  id: string;
  name: string;
  kind: "image" | "video";
  url: string;
  isCover: boolean;
  sizeLabel: string;
  file?: File;
  mediaFileId?: string;
};

export type MarketListingDraft = {
  pillarId: MarketPillarId | "";
  serviceKind: ServiceKind;
  category: MarketCategory | "";
  brand: string;
  model: string;
  title: string;
  shortDescription: string;
  description: string;
  condition: MarketCondition;
  conditionNotes: string;
  purchaseYear: string;
  negotiable: boolean;
  price: number;
  compareAtPrice: number;
  stock: number;
  warrantyMonths: number;
  dailyPrice: number;
  weekendPrice: number;
  weeklyPrice: number;
  deposit: number;
  minimumDays: number;
  availableFrom: string;
  instantBook: boolean;
  serviceFormat: string;
  durationLabel: string;
  deliveryLabel: string;
  nextAvailability: string;
  eventDate: string;
  eventCapacity: number;
  venueName: string;
  includedEquipment: string;
  retailUnitPrice: number;
  unlockedUnitPrice: number;
  collectiveTarget: number;
  collectiveJoined: number;
  collectiveDays: number;
  city: string;
  area: string;
  pickup: boolean;
  shipping: boolean;
  remote: boolean;
  shippingPrice: number;
  preparationDays: number;
  media: MarketListingMedia[];
  sellerName: string;
  sellerKind: MarketListingSellerKind;
  sellerMonogram: string;
  responseTime: string;
  sellerBio: string;
  acceptAccuracy: boolean;
  acceptTerms: boolean;
};

export type MarketListingPublicationResult = {
  listingId: string | null;
  mode: "demo" | "draft";
};

export type MarketListingComposerProps = {
  initialPillar?: MarketPillarId;
  initialDraft?: Partial<MarketListingDraft>;
  onClose?: () => void;
  onCreateAnother?: () => void;
  onPublish?: (draft: MarketListingDraft) => MarketListingPublicationResult | Promise<MarketListingPublicationResult>;
  draftOwnerKey?: string;
  publicationMode?: "demo" | "supabase";
  sellerIdentity?: Partial<Pick<MarketListingDraft,
    "sellerName" | "sellerKind" | "sellerMonogram" | "responseTime" | "sellerBio">>;
  sellerIdentityLocked?: boolean;
  sellerKindLocked?: boolean;
  allowDemoMedia?: boolean;
};

type StepDefinition = {
  id: string;
  label: string;
  hint: string;
  icon: LucideIcon;
};

const STEPS: StepDefinition[] = [
  { id: "offer", label: "Type d’offre", hint: "Le bon parcours", icon: Sparkles },
  { id: "listing", label: "L’annonce", hint: "Titre & histoire", icon: FileImage },
  { id: "terms", label: "Conditions", hint: "Prix & détails", icon: BadgeEuro },
  { id: "media", label: "Médias & remise", hint: "Visuels & logistique", icon: Camera },
  { id: "identity", label: "Vérification", hint: "Identité & publication", icon: ShieldCheck },
];

const PHYSICAL_CATEGORIES: MarketCategory[] = [
  "Synthétiseurs",
  "Interfaces audio",
  "Microphones",
  "Casques",
  "Guitares",
  "Batteries électroniques",
  "DJ & vinyle",
  "Contrôleurs MIDI",
  "Monitoring",
  "Enregistreurs",
];

const SERVICE_CATEGORIES: MarketCategory[] = [
  "Mix & mastering",
  "Cours & coaching",
  "Rooms & studios",
  "Billetterie",
  "Guitares",
];

const PILLAR_META: Record<MarketPillarId, { icon: LucideIcon; accent: string; short: string }> = {
  new: { icon: PackageCheck, accent: "91, 124, 255", short: "Produit neuf, stock et garantie" },
  used: { icon: Repeat2, accent: "233, 162, 59", short: "État réel et histoire du matériel" },
  rental: { icon: CalendarDays, accent: "39, 194, 209", short: "Tarifs, caution et calendrier" },
  services: { icon: Sparkles, accent: "198, 91, 255", short: "Talent, Room ou billetterie" },
  collective: { icon: UsersRound, accent: "57, 200, 137", short: "Objectif, palier et économie" },
};

const SERVICE_KIND_META: Record<ServiceKind, { label: string; hint: string; icon: LucideIcon }> = {
  production: { label: "Prestation", hint: "Mix, mastering, arrangement…", icon: Zap },
  coaching: { label: "Cours & coaching", hint: "Accompagnement individuel ou collectif", icon: UserRound },
  ticket: { label: "Billetterie / Rooms", hint: "Live, showcase ou session publique", icon: Ticket },
  room: { label: "Room & studio", hint: "Espace, équipement et créneau", icon: Building2 },
};

const DEMO_MEDIA: Record<MarketPillarId, string> = {
  new: "/images/market/moog-subsequent-37.jpg",
  used: "/images/market/gibson-les-paul-used.jpg",
  rental: "/images/market/nord-stage-4.jpg",
  services: "/images/market/unique/services/service-recording-vocals.png",
  collective: "/images/market/apollo-twin-x.jpg",
};

const BASE_STORAGE_KEY = "meewav-market-listing-draft-v2";

function getInitialDraft(initialPillar?: MarketPillarId): MarketListingDraft {
  return {
    pillarId: initialPillar ?? "",
    serviceKind: "production",
    category: "",
    brand: "",
    model: "",
    title: "",
    shortDescription: "",
    description: "",
    condition: "excellent",
    conditionNotes: "",
    purchaseYear: "",
    negotiable: false,
    price: 0,
    compareAtPrice: 0,
    stock: 1,
    warrantyMonths: 24,
    dailyPrice: 0,
    weekendPrice: 0,
    weeklyPrice: 0,
    deposit: 0,
    minimumDays: 1,
    availableFrom: getMarketListingRelativeDate(3),
    instantBook: true,
    serviceFormat: "À distance",
    durationLabel: "1 session",
    deliveryLabel: "Livraison sous 5 jours",
    nextAvailability: "Cette semaine",
    eventDate: getMarketListingRelativeDateTime(7, 20, 30),
    eventCapacity: 40,
    venueName: "",
    includedEquipment: "",
    retailUnitPrice: 0,
    unlockedUnitPrice: 0,
    collectiveTarget: 25,
    collectiveJoined: 0,
    collectiveDays: 12,
    city: "Paris",
    area: "11e",
    pickup: true,
    shipping: true,
    remote: false,
    shippingPrice: 9,
    preparationDays: 2,
    media: [],
    sellerName: "Nadir Msassi",
    sellerKind: "artist",
    sellerMonogram: "NM",
    responseTime: "Répond en moins d’une heure",
    sellerBio: "Identité artiste de démonstration pour la prévisualisation locale.",
    acceptAccuracy: false,
    acceptTerms: false,
  };
}

function serializableDraft(draft: MarketListingDraft) {
  return {
    ...draft,
    media: draft.media
      .filter((media) => !media.url.startsWith("blob:"))
      .map(({ file: _file, ...media }) => ({
        ...media,
        // Signed private URLs are short-lived credentials. Only their stable
        // media UUID is persisted; restore resolves the fresh URL from the
        // server draft supplied to the composer.
        url: media.mediaFileId ? "" : media.url,
      })),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLocalDraft(raw: string, baseline: MarketListingDraft): Partial<MarketListingDraft> {
  const parsed: unknown = JSON.parse(raw);
  if (!isPlainRecord(parsed)) throw new Error("invalid-local-draft");

  const safe: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(baseline)) {
    if (key === "media" || !(key in parsed)) continue;
    const candidate = parsed[key];
    if (typeof candidate !== typeof defaultValue) throw new Error("invalid-local-draft");
    if (typeof candidate === "number" && !Number.isFinite(candidate)) throw new Error("invalid-local-draft");
    safe[key] = candidate;
  }
  if (safe.pillarId !== undefined
    && safe.pillarId !== ""
    && !MARKET_PILLARS.some((pillar) => pillar.id === safe.pillarId)) {
    throw new Error("invalid-local-draft");
  }
  if (safe.serviceKind !== undefined
    && !["production", "coaching", "ticket", "room"].includes(String(safe.serviceKind))) {
    throw new Error("invalid-local-draft");
  }
  if (safe.sellerKind !== undefined
    && !["artist", "studio", "store"].includes(String(safe.sellerKind))) {
    throw new Error("invalid-local-draft");
  }

  const rawMedia = parsed.media;
  if (!Array.isArray(rawMedia) || rawMedia.length > 8) throw new Error("invalid-local-draft");
  const baselineMediaById = new Map(
    baseline.media
      .filter((media) => media.mediaFileId)
      .map((media) => [media.mediaFileId as string, media]),
  );
  const media = rawMedia.map((value): MarketListingMedia => {
    if (!isPlainRecord(value)
      || typeof value.id !== "string"
      || typeof value.name !== "string"
      || (value.kind !== "image" && value.kind !== "video")
      || typeof value.isCover !== "boolean"
      || typeof value.sizeLabel !== "string"
      || (value.mediaFileId !== undefined && typeof value.mediaFileId !== "string")) {
      throw new Error("invalid-local-draft");
    }
    const serverMedia = typeof value.mediaFileId === "string"
      ? baselineMediaById.get(value.mediaFileId)
      : undefined;
    const localUrl = typeof value.url === "string" ? value.url : "";
    const safeLocalUrl = localUrl.startsWith("/") && !localUrl.startsWith("//") && !localUrl.includes("\\")
      ? localUrl
      : null;
    if (value.mediaFileId && !serverMedia) throw new Error("stale-local-media");
    if (!value.mediaFileId && !safeLocalUrl) throw new Error("invalid-local-media");
    return {
      id: value.id,
      name: value.name,
      kind: value.kind,
      url: serverMedia?.url ?? safeLocalUrl ?? "",
      isCover: value.isCover,
      sizeLabel: value.sizeLabel,
      mediaFileId: typeof value.mediaFileId === "string" ? value.mediaFileId : undefined,
    };
  });

  return { ...safe, media } as Partial<MarketListingDraft>;
}

function formatEuro(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      className="market-listing-toggle"
      data-checked={checked ? "true" : "false"}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span className="market-listing-toggle__copy">
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <span className="market-listing-toggle__track" aria-hidden="true">
        <span />
      </span>
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <span className="market-listing-field__error" role="alert">{message}</span> : null;
}

function ListingPreview({
  draft,
  publicationMode,
}: {
  draft: MarketListingDraft;
  publicationMode: "demo" | "supabase";
}) {
  const pillar = draft.pillarId || "new";
  const pillarData = MARKET_PILLARS.find((item) => item.id === pillar) ?? MARKET_PILLARS[0];
  const cover = draft.media.find((media) => media.isCover) ?? draft.media[0];
  const Icon = PILLAR_META[pillar].icon;
  const serviceLabel = draft.pillarId === "services" ? SERVICE_KIND_META[draft.serviceKind].label : null;
  const collectiveProgress = Math.min(
    100,
    Math.max(0, Math.round((draft.collectiveJoined / Math.max(1, draft.collectiveTarget)) * 100)),
  );

  let priceLabel = formatEuro(draft.price);
  if (pillar === "rental") priceLabel = `${formatEuro(draft.dailyPrice || draft.price)} / jour`;
  if (pillar === "services" && draft.serviceKind === "ticket") priceLabel = `${formatEuro(draft.price)} / billet`;
  if (pillar === "collective") priceLabel = `${formatEuro(draft.unlockedUnitPrice || draft.price)} visé`;

  return (
    <aside className="market-listing-preview" data-pillar={pillar} aria-label="Aperçu de l’annonce">
      <div className="market-listing-preview__topline">
        <span><Sparkles size={14} /> Aperçu en direct</span>
        <span className="market-listing-preview__live"><i /> Prévisualisation locale</span>
      </div>

      <article className="market-listing-preview__card">
        <div className="market-listing-preview__media">
          {cover?.kind === "image" ? (
            <img src={cover.url} alt="Aperçu de la couverture" />
          ) : cover?.kind === "video" ? (
            <div className="market-listing-preview__video"><Video size={34} /><span>{cover.name}</span></div>
          ) : (
            <div className="market-listing-preview__placeholder"><ImagePlus size={34} /><span>Votre visuel principal</span></div>
          )}
          <span className="market-listing-preview__badge"><Icon size={14} /> {pillarData.label}</span>
          {serviceLabel ? <span className="market-listing-preview__service">{serviceLabel}</span> : null}
        </div>

        <div className="market-listing-preview__body">
          <div className="market-listing-preview__category">{draft.category || "Catégorie à choisir"}</div>
          <h3>{draft.title || "Le titre de votre annonce"}</h3>
          <p>{draft.description || "Votre description apparaîtra ici, avec les informations qui donnent confiance."}</p>

          <div className="market-listing-preview__price-row">
            <strong>{priceLabel}</strong>
            {draft.compareAtPrice > draft.price && pillar !== "rental" ? <del>{formatEuro(draft.compareAtPrice)}</del> : null}
          </div>

          {pillar === "collective" ? (
            <div className="market-listing-preview__progress">
              <div><span>{draft.collectiveJoined} participants</span><strong>{collectiveProgress} %</strong></div>
              <span><i style={{ width: `${collectiveProgress}%` }} /></span>
            </div>
          ) : null}

          <div className="market-listing-preview__facts">
            <span><MapPin size={14} /> {draft.remote && pillar === "services" ? "À distance" : `${draft.city || "Ville"} · ${draft.area || "Secteur"}`}</span>
            {pillar === "rental" ? <span><CalendarCheck2 size={14} /> Dès le {draft.availableFrom || "—"}</span> : null}
            {pillar === "services" ? <span><Clock3 size={14} /> {draft.nextAvailability || "Disponibilité à préciser"}</span> : null}
            {pillar === "new" ? <span><ShieldCheck size={14} /> Garantie {draft.warrantyMonths} mois</span> : null}
            {pillar === "used" ? <span><Repeat2 size={14} /> {draft.condition === "mint" ? "Comme neuf" : draft.condition === "very-good" ? "Très bon état" : "Excellent état"}</span> : null}
          </div>
        </div>
      </article>

      <div className="market-listing-preview__seller">
        <span>{draft.sellerMonogram || "MW"}</span>
        <div><strong>{draft.sellerName || "Votre identité"}</strong><small>{draft.responseTime}</small></div>
        <ShieldCheck
          size={18}
          aria-label={publicationMode === "demo" ? "Identité simulée" : "Identité issue du profil connecté"}
        />
      </div>
    </aside>
  );
}

export default function MarketListingComposer({
  initialPillar,
  initialDraft,
  onClose,
  onCreateAnother,
  onPublish,
  draftOwnerKey = "anonymous",
  publicationMode = "demo",
  sellerIdentity,
  sellerIdentityLocked = false,
  sellerKindLocked = false,
  allowDemoMedia = publicationMode === "demo",
}: MarketListingComposerProps) {
  const STORAGE_KEY = `${BASE_STORAGE_KEY}:${draftOwnerKey}`;
  const resumePillar = initialDraft?.pillarId || initialPillar;
  const buildInitialDraft = () => ({
    ...getInitialDraft(resumePillar),
    ...initialDraft,
    ...sellerIdentity,
  });
  const [draft, setDraft] = useState<MarketListingDraft>(buildInitialDraft);
  const [activeStep, setActiveStep] = useState(resumePillar ? 1 : 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [mobilePreviewOpen, setMobilePreviewOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [publicationResult, setPublicationResult] = useState<MarketListingPublicationResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const fileInputId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const mobilePreviewTriggerRef = useRef<HTMLButtonElement>(null);
  const mobilePreviewCloseRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const mobilePreviewOpenRef = useRef(mobilePreviewOpen);
  const publishedRef = useRef(published);
  const draftRef = useRef(draft);
  const mediaRef = useRef(draft.media);
  const publishingRef = useRef(false);
  const initialSnapshotRef = useRef(JSON.stringify(serializableDraft(draft)));
  const persistDraftSnapshot = useCallback((showNotice: boolean) => {
    const currentDraft = draftRef.current;
    const snapshot = JSON.stringify(serializableDraft(currentDraft));
    if (!showNotice && snapshot === initialSnapshotRef.current) return;
    window.localStorage.setItem(STORAGE_KEY, snapshot);
    setHasSavedDraft(true);
    if (showNotice) {
      setNotice(currentDraft.media.some((media) => media.url.startsWith("blob:"))
        ? "Brouillon sauvegardé. Les fichiers locaux seront à recharger."
        : "Brouillon sauvegardé sur cet appareil.");
    }
  }, [STORAGE_KEY]);

  const pillar = draft.pillarId || "new";
  const pillarMeta = PILLAR_META[pillar];
  const categories = draft.pillarId === "services" ? SERVICE_CATEGORIES : PHYSICAL_CATEGORIES;
  const minimumListingDate = getMarketListingRelativeDate(0);
  const minimumEventDateTime = getCurrentMarketListingDateTime();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    mobilePreviewOpenRef.current = mobilePreviewOpen;
  }, [mobilePreviewOpen]);

  useEffect(() => {
    publishedRef.current = published;
  }, [published]);

  useEffect(() => {
    if (!mobilePreviewOpen || !dialogRef.current) return undefined;
    const isolatedLayers = [
      dialogRef.current.querySelector<HTMLElement>(".market-listing-composer__header"),
      dialogRef.current.querySelector<HTMLElement>(".market-listing-steps"),
      dialogRef.current.querySelector<HTMLElement>(".market-listing-form"),
      dialogRef.current.querySelector<HTMLElement>(".market-listing-composer__footer"),
    ].filter((layer): layer is HTMLElement => Boolean(layer));
    const previousInert = isolatedLayers.map((layer) => ({ layer, inert: layer.inert }));
    const previewTrigger = mobilePreviewTriggerRef.current;
    isolatedLayers.forEach((layer) => {
      layer.inert = true;
    });
    mobilePreviewCloseRef.current?.focus();
    return () => {
      previousInert.forEach(({ layer, inert }) => {
        layer.inert = inert;
      });
      if (previewTrigger?.isConnected) previewTrigger.focus();
    };
  }, [mobilePreviewOpen]);

  useEffect(() => {
    draftRef.current = draft;
    mediaRef.current = draft.media;
  }, [draft]);

  useEffect(() => {
    publishingRef.current = publishing;
    if (!publishing) return undefined;
    const blockPageUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", blockPageUnload);
    return () => window.removeEventListener("beforeunload", blockPageUnload);
  }, [publishing]);

  useEffect(() => () => {
    mediaRef.current.forEach((media) => {
      if (media.url.startsWith("blob:")) URL.revokeObjectURL(media.url);
    });
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgroundLayers = document.querySelectorAll<HTMLElement>(".market-shell, .market-primary-rail");
    backgroundLayers.forEach((layer) => layer.setAttribute("inert", ""));
    setHasSavedDraft(Boolean(window.localStorage.getItem(STORAGE_KEY)));
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (publishingRef.current) {
          setNotice("Enregistrement en cours : cette fenêtre restera ouverte jusqu’à la confirmation du serveur.");
          return;
        }
        if (mobilePreviewOpenRef.current) {
          setMobilePreviewOpen(false);
          return;
        }
        if (!publishedRef.current) persistDraftSnapshot(false);
        setDismissed(true);
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => (
        !element.hasAttribute("hidden")
        && !element.closest("[inert]")
        && element.tabIndex >= 0
        && element.getClientRects().length > 0
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialogRef.current.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || activeElement === dialogRef.current || !dialogRef.current.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      backgroundLayers.forEach((layer) => layer.removeAttribute("inert"));
      previouslyFocused?.focus();
    };
  }, [STORAGE_KEY, persistDraftSnapshot]);

  const completion = useMemo(() => {
    const checks = [
      Boolean(draft.pillarId),
      Boolean(draft.category && draft.title.trim().length >= 4 && draft.description.trim().length >= 30),
      draft.pillarId === "rental" ? draft.dailyPrice > 0 : draft.pillarId === "collective" ? draft.unlockedUnitPrice > 0 : draft.price > 0,
      draft.media.length > 0,
      Boolean(draft.sellerName && draft.acceptAccuracy && draft.acceptTerms),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft]);

  function update<K extends keyof MarketListingDraft>(key: K, value: MarketListingDraft[K]) {
    if (publishingRef.current) return;
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[String(key)]) return current;
      const next = { ...current };
      delete next[String(key)];
      return next;
    });
    setPublished(false);
    setPublicationResult(null);
  }

  function choosePillar(pillarId: MarketPillarId) {
    if (publishingRef.current) return;
    const category = pillarId === "services" ? "Mix & mastering" : "";
    setDraft((current) => ({
      ...current,
      pillarId,
      category,
      price: pillarId === "rental" ? 0 : current.price,
      remote: pillarId === "services",
      pickup: pillarId !== "services",
      shipping: pillarId === "new" || pillarId === "used" || pillarId === "collective",
    }));
    setErrors({});
  }

  function chooseServiceKind(serviceKind: ServiceKind) {
    if (publishingRef.current) return;
    const requiresVenue = serviceKind === "ticket" || serviceKind === "room";
    const categoryByKind: Record<ServiceKind, MarketCategory> = {
      production: "Mix & mastering",
      coaching: "Cours & coaching",
      ticket: "Billetterie",
      room: "Rooms & studios",
    };
    setDraft((current) => ({
      ...current,
      serviceKind,
      category: categoryByKind[serviceKind],
      serviceFormat: requiresVenue ? "Sur place" : "À distance",
      remote: !requiresVenue,
      pickup: requiresVenue,
      shipping: false,
    }));
    setErrors({});
    setPublished(false);
    setPublicationResult(null);
  }

  function validateStep(step: number) {
    const nextErrors: Record<string, string> = {};
    if (step === 0 && !draft.pillarId) nextErrors.pillarId = "Choisissez le type d’offre à publier.";
    if (step === 1) {
      if (!draft.category) nextErrors.category = "Sélectionnez une catégorie.";
      if (draft.title.trim().length < 4) nextErrors.title = "Ajoutez un titre clair (4 caractères minimum).";
      if (draft.description.trim().length < 30) nextErrors.description = "Décrivez précisément l’offre en au moins 30 caractères.";
    }
    if (step === 2) {
      if (draft.pillarId === "rental") {
        if (draft.dailyPrice <= 0) nextErrors.dailyPrice = "Indiquez le tarif journalier.";
        if (draft.deposit < 0) nextErrors.deposit = "La caution ne peut pas être négative.";
        if (!draft.availableFrom) nextErrors.availableFrom = "Indiquez la première disponibilité.";
        else if (draft.availableFrom < minimumListingDate) nextErrors.availableFrom = "La disponibilité ne peut pas être dans le passé.";
      } else if (draft.pillarId === "collective") {
        if (draft.retailUnitPrice <= 0) nextErrors.retailUnitPrice = "Indiquez le prix public.";
        if (draft.unlockedUnitPrice <= 0) nextErrors.unlockedUnitPrice = "Indiquez le prix collectif visé.";
        if (draft.unlockedUnitPrice >= draft.retailUnitPrice) nextErrors.unlockedUnitPrice = "Le prix collectif doit être inférieur au prix public.";
        if (draft.collectiveTarget < 2) nextErrors.collectiveTarget = "L’objectif doit réunir au moins 2 personnes.";
      } else {
        if (draft.price <= 0) nextErrors.price = "Indiquez un prix supérieur à 0 €.";
      }
      if (draft.pillarId === "services") {
        if (!draft.serviceFormat.trim()) nextErrors.serviceFormat = "Précisez le format de la prestation.";
        if (!draft.durationLabel.trim()) nextErrors.durationLabel = "Précisez la durée.";
        if (!draft.nextAvailability.trim()) nextErrors.nextAvailability = "Précisez la prochaine disponibilité.";
        if (draft.serviceKind === "ticket") {
          if (!draft.eventDate) nextErrors.eventDate = "Indiquez la date et l’heure de l’événement.";
          else if (new Date(draft.eventDate).getTime() < Date.now()) nextErrors.eventDate = "La date de l’événement ne peut pas être dans le passé.";
          if (draft.eventCapacity < 1) nextErrors.eventCapacity = "La capacité doit être supérieure à zéro.";
          if (!draft.venueName.trim()) nextErrors.venueName = "Indiquez le lieu de l’événement.";
        }
        if (draft.serviceKind === "room") {
          if (!draft.venueName.trim()) nextErrors.venueName = "Indiquez le nom de la Room ou du studio.";
          if (draft.eventCapacity < 1) nextErrors.eventCapacity = "Indiquez la capacité du lieu.";
          if (!draft.includedEquipment.trim()) nextErrors.includedEquipment = "Précisez l’équipement inclus.";
        }
      }
    }
    if (step === 3) {
      if (!draft.media.some((media) => media.kind === "image")) {
        nextErrors.media = "Ajoutez au moins une image de couverture.";
      }
      if (!draft.remote && !draft.city.trim()) nextErrors.city = "Indiquez une ville.";
      if (!draft.remote && !draft.pickup && !draft.shipping) nextErrors.logistics = "Activez au moins une option de remise.";
    }
    if (step === 4) {
      if (draft.sellerName.trim().length < 2) nextErrors.sellerName = "Votre nom public est requis.";
      if (!draft.acceptAccuracy) nextErrors.acceptAccuracy = "Confirmez l’exactitude de l’annonce.";
      if (!draft.acceptTerms) nextErrors.acceptTerms = "Acceptez les règles du Market.";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goNext() {
    if (publishingRef.current) return;
    if (!validateStep(activeStep)) {
      setNotice("Corrige les champs signalés avant de continuer.");
      window.requestAnimationFrame(() => {
        const section = dialogRef.current?.querySelector<HTMLElement>(".market-listing-section");
        const error = section?.querySelector<HTMLElement>('.market-listing-field__error');
        const control = section?.querySelector<HTMLElement>('[aria-invalid="true"], [data-error="true"] input')
          ?? error?.closest("label")?.querySelector<HTMLElement>("input, select, textarea, button")
          ?? section?.querySelector<HTMLElement>("button, input, select, textarea");
        control?.focus();
      });
      return;
    }
    setActiveStep((step) => Math.min(STEPS.length - 1, step + 1));
    dialogRef.current?.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function goBack() {
    if (publishingRef.current) return;
    setErrors({});
    setActiveStep((step) => Math.max(0, step - 1));
  }

  function saveDraft() {
    if (publishingRef.current) return;
    persistDraftSnapshot(true);
  }

  function restoreDraft() {
    if (publishingRef.current) return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    try {
      const baseline = buildInitialDraft();
      const restored = parseLocalDraft(raw, baseline);
      setDraft({ ...baseline, ...restored, ...sellerIdentity, media: restored.media ?? baseline.media });
      setActiveStep(restored.pillarId ? 1 : 0);
      setNotice("Votre brouillon a été restauré.");
      setErrors({});
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setHasSavedDraft(false);
      setNotice("Ce brouillon n’était plus lisible et a été supprimé.");
    }
  }

  function resetComposer() {
    if (publishingRef.current) return;
    draft.media.forEach((media) => {
      if (media.url.startsWith("blob:")) URL.revokeObjectURL(media.url);
    });
    setDraft(buildInitialDraft());
    setActiveStep(resumePillar ? 1 : 0);
    setErrors({});
    setPublished(false);
    setPublicationResult(null);
    setNotice("Nouveau brouillon prêt.");
    window.localStorage.removeItem(STORAGE_KEY);
    setHasSavedDraft(false);
  }

  function ingestFiles(files: File[]) {
    if (publishingRef.current) return;
    const room = Math.max(0, 8 - draft.media.length);
    const validFiles: Array<{ file: File; kind: "image" | "video" }> = [];
    let firstRejection = "";
    files.forEach((file) => {
      try {
        const classified = classifyMarketplaceMediaFile(file);
        validFiles.push({ file, kind: classified.kind });
      } catch (error) {
        if (!firstRejection) {
          firstRejection = error instanceof Error ? error.message : "Ce fichier n’est pas accepté par le Market.";
        }
      }
    });
    const accepted = validFiles.slice(0, room);
    if (!accepted.length) {
      setNotice(firstRejection || (room === 0
        ? "Vous avez déjà atteint la limite de 8 médias."
        : "Aucun fichier ajouté. JPG, PNG, WebP, AVIF, MP4, MOV ou WebM · 12 Mo maximum."));
      return;
    }
    const hasImageCover = draft.media.some((media) => media.kind === "image" && media.isCover);
    let assignsImageCover = !hasImageCover;
    const next = accepted.map<MarketListingMedia>(({ file, kind }) => {
      const isCover = kind === "image" && assignsImageCover;
      if (isCover) assignsImageCover = false;
      return {
        id: createMarketLocalMediaId(),
        name: file.name,
        kind,
        url: URL.createObjectURL(file),
        isCover,
        sizeLabel: formatBytes(file.size),
        file,
      };
    });
    update("media", [...draft.media, ...next]);
    const rejectedCount = files.length - accepted.length;
    setNotice(`${accepted.length} média${accepted.length > 1 ? "s" : ""} ajouté${accepted.length > 1 ? "s" : ""}.${rejectedCount > 0 ? ` ${rejectedCount} fichier${rejectedCount > 1 ? "s" : ""} refusé${rejectedCount > 1 ? "s" : ""}.` : ""}`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    ingestFiles(Array.from(event.dataTransfer.files));
  }

  function addDemoMedia() {
    if (publishingRef.current) return;
    const id = `demo-${pillar}`;
    if (draft.media.some((media) => media.id === id)) {
      setNotice("Le visuel de démonstration est déjà présent.");
      return;
    }
    update("media", [
      ...draft.media,
      {
        id,
        name: `visuel-${pillar}-demo.jpg`,
        kind: "image",
        url: DEMO_MEDIA[pillar],
        isCover: draft.media.length === 0,
        sizeLabel: "Démo",
      },
    ]);
    setNotice("Visuel de démonstration ajouté.");
  }

  function removeMedia(id: string) {
    if (publishingRef.current) return;
    const target = draft.media.find((media) => media.id === id);
    if (target?.url.startsWith("blob:")) URL.revokeObjectURL(target.url);
    let remaining = draft.media.filter((media) => media.id !== id);
    if (target?.isCover && remaining.length) {
      const nextCoverId = remaining.find((media) => media.kind === "image")?.id;
      remaining = remaining.map((media) => ({ ...media, isCover: media.id === nextCoverId }));
    }
    update("media", remaining);
  }

  function setCover(id: string) {
    if (publishingRef.current) return;
    if (draft.media.find((media) => media.id === id)?.kind !== "image") {
      setNotice("Choisissez une image comme couverture ; la vidéo restera consultable dans la galerie.");
      return;
    }
    update("media", draft.media.map((media) => ({ ...media, isCover: media.id === id })));
  }

  async function publish(event?: Pick<FormEvent, "preventDefault">) {
    event?.preventDefault();
    if (publishingRef.current || published) return;
    for (let step = 0; step < STEPS.length; step += 1) {
      if (!validateStep(step)) {
        setActiveStep(step);
        setNotice("Quelques informations sont encore nécessaires avant publication.");
        return;
      }
    }
    publishingRef.current = true;
    setPublishing(true);
    setNotice("");
    try {
      persistDraftSnapshot(false);
      const result = await onPublish?.(draft);
      window.localStorage.removeItem(STORAGE_KEY);
      setHasSavedDraft(false);
      setPublicationResult(result ?? null);
      setPublished(true);
      setNotice(publicationMode === "demo"
        ? "Annonce publiée en démonstration."
        : "Brouillon enregistré sur votre compte. Aucune publication ni paiement n’a été lancé.");
    } catch (error) {
      setPublished(false);
      setPublicationResult(null);
      setNotice(error instanceof Error
        ? error.message
        : "L’annonce n’a pas pu être enregistrée. Vos informations restent dans ce formulaire.");
    } finally {
      publishingRef.current = false;
      setPublishing(false);
    }
  }

  function closeComposer() {
    if (publishingRef.current) {
      setNotice("Enregistrement en cours : attendez la confirmation avant de fermer.");
      return;
    }
    if (!publishedRef.current) persistDraftSnapshot(false);
    setDismissed(true);
    onClose?.();
  }

  if (dismissed) return null;

  return (
    <div className="market-listing-composer" data-pillar={pillar} style={{ "--listing-accent": pillarMeta.accent } as CSSProperties}>
      <div className="market-listing-composer__backdrop" aria-hidden="true" />
      <div
        className="market-listing-composer__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-listing-title"
        tabIndex={-1}
        ref={dialogRef}
        aria-busy={publishing}
      >
        <header className="market-listing-composer__header">
          <div className="market-listing-composer__brand">
            <span><Store size={20} /></span>
            <div>
              <small>MARKET · ESPACE VENDEUR</small>
              <h1 id="market-listing-title">Déposer une annonce</h1>
            </div>
          </div>

          <div className="market-listing-composer__completion" aria-label={`Annonce complétée à ${completion} %`}>
            <div><span>Qualité de l’annonce</span><strong>{completion} %</strong></div>
            <span><i style={{ width: `${completion}%` }} /></span>
          </div>

          <div className="market-listing-composer__header-actions">
            <button type="button" className="market-listing-composer__ghost" onClick={saveDraft} disabled={publishing || published}><Save size={17} /> Brouillon</button>
            <button type="button" className="market-listing-composer__close" onClick={closeComposer} disabled={publishing} aria-label="Fermer le compositeur"><X size={21} /></button>
          </div>
        </header>

        <div className="market-listing-composer__workspace">
          <nav className="market-listing-steps" aria-label="Étapes de publication">
            <div className="market-listing-steps__eyebrow">Votre parcours</div>
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  type="button"
                  className="market-listing-steps__item"
                  data-active={index === activeStep ? "true" : "false"}
                  data-complete={index < activeStep ? "true" : "false"}
                  disabled={publishing || published}
                  onClick={() => {
                    if (index <= activeStep || validateStep(activeStep)) setActiveStep(index);
                  }}
                  aria-current={index === activeStep ? "step" : undefined}
                >
                  <span>{index < activeStep ? <Check size={17} /> : <Icon size={17} />}</span>
                  <div><strong>{step.label}</strong><small>{step.hint}</small></div>
                  <ChevronRight size={16} />
                </button>
              );
            })}

            <div className="market-listing-steps__trust">
              <ShieldCheck size={20} />
              <div><strong>Brouillon contrôlé</strong><small>Validation des champs et aperçu avant envoi.</small></div>
            </div>
          </nav>

          <form className="market-listing-form" onSubmit={publish} noValidate aria-busy={publishing}>
            {notice ? <div className="market-listing-notice" role="status"><Info size={17} /> <span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fermer le message"><X size={15} /></button></div> : null}

            {activeStep === 0 ? (
              <section className="market-listing-section" aria-labelledby="listing-step-offer">
                <div className="market-listing-section__intro">
                  <span>01 · LE BON PARCOURS</span>
                  <h2 id="listing-step-offer">Que souhaitez-vous proposer ?</h2>
                  <p>Le formulaire s’adapte immédiatement au modèle économique choisi.</p>
                </div>

                {hasSavedDraft ? (
                  <div className="market-listing-restore">
                    <div><Save size={19} /><span><strong>Un brouillon est disponible</strong><small>Reprenez là où vous vous étiez arrêté.</small></span></div>
                    <button type="button" onClick={restoreDraft} disabled={publishing}>Restaurer</button>
                  </div>
                ) : null}

                <div className="market-listing-offer-grid">
                  {MARKET_PILLARS.map((item) => {
                    const meta = PILLAR_META[item.id];
                    const Icon = meta.icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className="market-listing-offer-card"
                        data-selected={draft.pillarId === item.id ? "true" : "false"}
                        aria-pressed={draft.pillarId === item.id}
                        style={{ "--offer-accent": meta.accent } as CSSProperties}
                        onClick={() => choosePillar(item.id)}
                      >
                        <span className="market-listing-offer-card__icon"><Icon size={24} /></span>
                        <span className="market-listing-offer-card__check"><Check size={14} /></span>
                        <strong>{item.label}</strong>
                        <small>{meta.short}</small>
                        <em>{item.description}</em>
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.pillarId} />
              </section>
            ) : null}

            {activeStep === 1 ? (
              <section className="market-listing-section" aria-labelledby="listing-step-listing">
                <div className="market-listing-section__intro">
                  <span>02 · RACONTER L’OFFRE</span>
                  <h2 id="listing-step-listing">Une annonce claire, sans jargon inutile.</h2>
                  <p>Les informations saisies alimentent déjà l’aperçu à droite.</p>
                </div>

                {draft.pillarId === "services" ? (
                  <fieldset className="market-listing-fieldset">
                    <legend>Nature du service</legend>
                    <div className="market-listing-service-grid">
                      {(Object.entries(SERVICE_KIND_META) as [ServiceKind, (typeof SERVICE_KIND_META)[ServiceKind]][]).map(([id, item]) => {
                        const Icon = item.icon;
                        return (
                          <button type="button" key={id} data-selected={draft.serviceKind === id ? "true" : "false"} aria-pressed={draft.serviceKind === id} onClick={() => chooseServiceKind(id)}>
                            <Icon size={19} /><span><strong>{item.label}</strong><small>{item.hint}</small></span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                ) : null}

                <div className="market-listing-fields market-listing-fields--two">
                  <label className="market-listing-field">
                    <span>Catégorie *</span>
                    <select value={draft.category} onChange={(event) => update("category", event.target.value as MarketCategory)} aria-invalid={Boolean(errors.category)}>
                      <option value="">Choisir une catégorie</option>
                      {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                    <FieldError message={errors.category} />
                  </label>

                  {draft.pillarId !== "services" ? (
                    <label className="market-listing-field">
                      <span>Marque</span>
                      <input value={draft.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Ex. Moog, Fender, Neumann" />
                    </label>
                  ) : (
                    <label className="market-listing-field">
                      <span>Spécialité</span>
                      <input value={draft.brand} onChange={(event) => update("brand", event.target.value)} placeholder="Ex. Voix, mix club, acoustique" />
                    </label>
                  )}

                  <label className="market-listing-field market-listing-field--wide">
                    <span>Titre public *</span>
                    <input value={draft.title} onChange={(event) => update("title", event.target.value)} maxLength={72} placeholder={draft.pillarId === "services" ? "Ex. Mix complet d’un single jusqu’à 40 pistes" : "Ex. Synthétiseur analogique avec flight case"} aria-invalid={Boolean(errors.title)} />
                    <small>{draft.title.length}/72</small>
                    <FieldError message={errors.title} />
                  </label>

                  {draft.pillarId !== "services" ? (
                    <label className="market-listing-field">
                      <span>Modèle / référence</span>
                      <input value={draft.model} onChange={(event) => update("model", event.target.value)} placeholder="Référence exacte" />
                    </label>
                  ) : null}

                  <label className={`market-listing-field ${draft.pillarId === "services" ? "market-listing-field--wide" : ""}`}>
                    <span>Accroche courte</span>
                    <input value={draft.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} maxLength={280} placeholder="Ce qui rend l’offre différente" />
                  </label>

                  <label className="market-listing-field market-listing-field--wide">
                    <span>Description détaillée *</span>
                    <textarea value={draft.description} onChange={(event) => update("description", event.target.value)} maxLength={900} rows={7} placeholder="Décrivez le contexte, ce qui est inclus, l’état réel ou votre méthode de travail…" aria-invalid={Boolean(errors.description)} />
                    <small>{draft.description.length}/900 · 30 caractères minimum</small>
                    <FieldError message={errors.description} />
                  </label>
                </div>
              </section>
            ) : null}

            {activeStep === 2 ? (
              <section className="market-listing-section" aria-labelledby="listing-step-terms">
                <div className="market-listing-section__intro">
                  <span>03 · CONDITIONS CONTEXTUELLES</span>
                  <h2 id="listing-step-terms">{draft.pillarId === "rental" ? "Cadrez la réservation." : draft.pillarId === "services" ? "Cadrez votre prestation." : draft.pillarId === "collective" ? "Construisez le palier collectif." : "Fixez un prix transparent."}</h2>
                  <p>Seuls les champs utiles à votre type d’offre sont affichés.</p>
                </div>

                {draft.pillarId === "new" ? (
                  <div className="market-listing-fields market-listing-fields--three">
                    <label className="market-listing-field"><span>Prix TTC *</span><div className="market-listing-money"><input type="number" min="0" value={draft.price || ""} onChange={(event) => update("price", Number(event.target.value))} /><b>€</b></div><FieldError message={errors.price} /></label>
                    <label className="market-listing-field"><span>Prix conseillé</span><div className="market-listing-money"><input type="number" min="0" value={draft.compareAtPrice || ""} onChange={(event) => update("compareAtPrice", Number(event.target.value))} /><b>€</b></div></label>
                    <label className="market-listing-field"><span>Stock disponible</span><input type="number" min="1" value={draft.stock} onChange={(event) => update("stock", Number(event.target.value))} /></label>
                    <label className="market-listing-field"><span>Garantie</span><select value={draft.warrantyMonths} onChange={(event) => update("warrantyMonths", Number(event.target.value))}><option value={12}>12 mois</option><option value={24}>24 mois</option><option value={36}>36 mois</option></select></label>
                    <div className="market-listing-context-card market-listing-field--span-two"><PackageCheck size={21} /><div><strong>Produit neuf</strong><p>La garantie et le stock renseignés seront associés au brouillon.</p></div></div>
                  </div>
                ) : null}

                {draft.pillarId === "used" ? (
                  <div className="market-listing-fields market-listing-fields--two">
                    <label className="market-listing-field"><span>Prix demandé *</span><div className="market-listing-money"><input type="number" min="0" value={draft.price || ""} onChange={(event) => update("price", Number(event.target.value))} /><b>€</b></div><FieldError message={errors.price} /></label>
                    <label className="market-listing-field"><span>État réel</span><select value={draft.condition} onChange={(event) => update("condition", event.target.value as MarketCondition)}><option value="mint">Comme neuf</option><option value="excellent">Excellent</option><option value="very-good">Très bon</option></select></label>
                    <label className="market-listing-field"><span>Année d’achat</span><input value={draft.purchaseYear} onChange={(event) => update("purchaseYear", event.target.value)} inputMode="numeric" placeholder="2024" /></label>
                    <Toggle checked={draft.negotiable} onChange={(checked) => update("negotiable", checked)} label="Prix négociable" hint="Signale que le prix peut être discuté. L’offre chiffrée n’est pas encore disponible." />
                    <label className="market-listing-field market-listing-field--wide"><span>Traces d’usage et historique</span><textarea rows={5} value={draft.conditionNotes} onChange={(event) => update("conditionNotes", event.target.value)} placeholder="Soyez précis : rayure, révision, pièces remplacées, facture disponible…" /></label>
                  </div>
                ) : null}

                {draft.pillarId === "rental" ? (
                  <div className="market-listing-fields market-listing-fields--three">
                    <label className="market-listing-field"><span>Tarif / jour *</span><div className="market-listing-money"><input type="number" min="0" value={draft.dailyPrice || ""} onChange={(event) => { update("dailyPrice", Number(event.target.value)); update("price", Number(event.target.value)); }} /><b>€</b></div><FieldError message={errors.dailyPrice} /></label>
                    <label className="market-listing-field"><span>Forfait week-end</span><div className="market-listing-money"><input type="number" min="0" value={draft.weekendPrice || ""} onChange={(event) => update("weekendPrice", Number(event.target.value))} /><b>€</b></div></label>
                    <label className="market-listing-field"><span>Forfait semaine</span><div className="market-listing-money"><input type="number" min="0" value={draft.weeklyPrice || ""} onChange={(event) => update("weeklyPrice", Number(event.target.value))} /><b>€</b></div></label>
                    <label className="market-listing-field"><span>Caution</span><div className="market-listing-money"><input type="number" min="0" value={draft.deposit || ""} onChange={(event) => update("deposit", Number(event.target.value))} /><b>€</b></div><FieldError message={errors.deposit} /></label>
                    <label className="market-listing-field"><span>Durée minimale</span><div className="market-listing-suffix"><input type="number" min="1" value={draft.minimumDays} onChange={(event) => update("minimumDays", Number(event.target.value))} /><b>jour(s)</b></div></label>
                    <label className="market-listing-field"><span>Disponible dès le *</span><input type="date" min={minimumListingDate} value={draft.availableFrom} onChange={(event) => update("availableFrom", event.target.value)} aria-invalid={Boolean(errors.availableFrom)} /><FieldError message={errors.availableFrom} /></label>
                    <Toggle
                      checked={draft.instantBook}
                      onChange={(checked) => update("instantBook", checked)}
                      label={publicationMode === "demo" ? "Réservation instantanée · démo" : "Demande directe"}
                      hint={publicationMode === "demo"
                        ? "Comportement simulé uniquement dans cette démonstration."
                        : "L’acheteur peut envoyer sa demande immédiatement ; vous gardez la validation finale."}
                    />
                  </div>
                ) : null}

                {draft.pillarId === "services" ? (
                  <div className="market-listing-fields market-listing-fields--two">
                    <label className="market-listing-field"><span>{draft.serviceKind === "ticket" ? "Prix du billet" : draft.serviceKind === "room" ? "Tarif du créneau" : "Prix de la prestation"} *</span><div className="market-listing-money"><input type="number" min="0" value={draft.price || ""} onChange={(event) => update("price", Number(event.target.value))} /><b>€</b></div><FieldError message={errors.price} /></label>
                    <label className="market-listing-field"><span>Format *</span><input value={draft.serviceFormat} onChange={(event) => update("serviceFormat", event.target.value)} placeholder="À distance, sur place, hybride…" /><FieldError message={errors.serviceFormat} /></label>
                    <label className="market-listing-field"><span>Durée *</span><input value={draft.durationLabel} onChange={(event) => update("durationLabel", event.target.value)} placeholder="2 heures, 1 morceau, 4 séances…" /><FieldError message={errors.durationLabel} /></label>
                    <label className="market-listing-field"><span>{draft.serviceKind === "ticket" ? "Ouverture des portes" : "Livraison / résultat"}</span><input value={draft.deliveryLabel} onChange={(event) => update("deliveryLabel", event.target.value)} placeholder="Livraison sous 5 jours" /></label>
                    <label className="market-listing-field market-listing-field--wide"><span>Prochaine disponibilité *</span><input value={draft.nextAvailability} onChange={(event) => update("nextAvailability", event.target.value)} placeholder="Deux créneaux cette semaine" /><FieldError message={errors.nextAvailability} /></label>

                    {draft.serviceKind === "ticket" ? <>
                      <label className="market-listing-field"><span>Date & heure *</span><input type="datetime-local" min={minimumEventDateTime} value={draft.eventDate} onChange={(event) => update("eventDate", event.target.value)} aria-invalid={Boolean(errors.eventDate)} /><FieldError message={errors.eventDate} /></label>
                      <label className="market-listing-field"><span>Capacité *</span><div className="market-listing-suffix"><input type="number" min="1" value={draft.eventCapacity} onChange={(event) => update("eventCapacity", Number(event.target.value))} /><b>places</b></div><FieldError message={errors.eventCapacity} /></label>
                      <label className="market-listing-field market-listing-field--wide"><span>Lieu *</span><input value={draft.venueName} onChange={(event) => update("venueName", event.target.value)} placeholder="Nom de la Room ou de la salle" /><FieldError message={errors.venueName} /></label>
                    </> : null}

                    {draft.serviceKind === "room" ? <>
                      <label className="market-listing-field"><span>Nom du studio / Room *</span><input value={draft.venueName} onChange={(event) => update("venueName", event.target.value)} placeholder="Ex. Studio B · Room Meewav" /><FieldError message={errors.venueName} /></label>
                      <label className="market-listing-field"><span>Capacité *</span><div className="market-listing-suffix"><input type="number" min="1" value={draft.eventCapacity} onChange={(event) => update("eventCapacity", Number(event.target.value))} /><b>personnes</b></div><FieldError message={errors.eventCapacity} /></label>
                      <label className="market-listing-field market-listing-field--wide"><span>Équipement inclus *</span><textarea rows={4} value={draft.includedEquipment} onChange={(event) => update("includedEquipment", event.target.value)} placeholder="Console, micros, retours, backline, ingénieur…" /><FieldError message={errors.includedEquipment} /></label>
                    </> : null}
                  </div>
                ) : null}

                {draft.pillarId === "collective" ? (
                  <div className="market-listing-fields market-listing-fields--three">
                    <label className="market-listing-field"><span>Prix public *</span><div className="market-listing-money"><input type="number" min="0" value={draft.retailUnitPrice || ""} onChange={(event) => { update("retailUnitPrice", Number(event.target.value)); update("compareAtPrice", Number(event.target.value)); }} /><b>€</b></div><FieldError message={errors.retailUnitPrice} /></label>
                    <label className="market-listing-field"><span>Prix débloqué *</span><div className="market-listing-money"><input type="number" min="0" value={draft.unlockedUnitPrice || ""} onChange={(event) => { update("unlockedUnitPrice", Number(event.target.value)); update("price", Number(event.target.value)); }} /><b>€</b></div><FieldError message={errors.unlockedUnitPrice} /></label>
                    <label className="market-listing-field"><span>Objectif</span><div className="market-listing-suffix"><input type="number" min="2" value={draft.collectiveTarget} onChange={(event) => update("collectiveTarget", Number(event.target.value))} /><b>membres</b></div><FieldError message={errors.collectiveTarget} /></label>
                    <label className="market-listing-field"><span>Déjà engagés</span><input type="number" min="0" max={draft.collectiveTarget} value={draft.collectiveJoined} onChange={(event) => update("collectiveJoined", Number(event.target.value))} /></label>
                    <label className="market-listing-field"><span>Durée de campagne</span><div className="market-listing-suffix"><input type="number" min="1" value={draft.collectiveDays} onChange={(event) => update("collectiveDays", Number(event.target.value))} /><b>jours</b></div></label>
                    <div className="market-listing-context-card"><UsersRound size={21} /><div><strong>{Math.max(0, Math.round((1 - (draft.unlockedUnitPrice || 0) / Math.max(1, draft.retailUnitPrice)) * 100))} % d’économie</strong><p>Calculé en direct à partir du prix public.</p></div></div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {activeStep === 3 ? (
              <section className="market-listing-section" aria-labelledby="listing-step-media">
                <div className="market-listing-section__intro">
                  <span>04 · DONNER CONFIANCE</span>
                  <h2 id="listing-step-media">De vrais visuels, une remise sans surprise.</h2>
                  <p>La première image devient la couverture. Vous pouvez la changer à tout moment.</p>
                </div>

                <div
                  className="market-listing-dropzone"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={onDrop}
                  data-error={errors.media ? "true" : "false"}
                >
                  <input
                    id={fileInputId}
                    type="file"
                    accept={MARKETPLACE_MEDIA_ACCEPT}
                    multiple
                    disabled={publishing}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = "";
                      ingestFiles(files);
                    }}
                  />
                  <UploadCloud size={30} />
                  <div><strong>Glissez vos photos ou vidéos ici</strong><span>JPG, PNG, WebP, MP4 · 12 Mo max · 8 médias</span></div>
                  <label htmlFor={fileInputId}>Choisir des fichiers</label>
                  {allowDemoMedia ? <button type="button" onClick={addDemoMedia} disabled={publishing}><Sparkles size={15} /> Ajouter un visuel démo</button> : null}
                </div>
                <FieldError message={errors.media} />

                {draft.media.length ? (
                  <div className="market-listing-media-grid">
                    {draft.media.map((media) => (
                      <article key={media.id} data-cover={media.isCover ? "true" : "false"}>
                        <span className="market-listing-media-grid__drag" aria-hidden="true"><GripVertical size={16} /></span>
                        {media.kind === "image" && media.url
                          ? <img src={media.url} alt="" loading="lazy" decoding="async" />
                          : <div className="market-listing-media-grid__video">{media.kind === "video" ? <Video size={27} /> : <FileImage size={27} />}</div>}
                        <div><strong>{media.isCover ? "Couverture" : media.name}</strong><small>{media.sizeLabel}</small></div>
                        {!media.isCover && media.kind === "image" ? <button type="button" onClick={() => setCover(media.id)} disabled={publishing}>Définir en couverture</button> : null}
                        <button type="button" className="market-listing-media-grid__delete" onClick={() => removeMedia(media.id)} disabled={publishing} aria-label={`Supprimer ${media.name}`}><Trash2 size={16} /></button>
                      </article>
                    ))}
                  </div>
                ) : null}

                <div className="market-listing-logistics">
                  <div className="market-listing-logistics__header"><Truck size={21} /><div><strong>Disponibilité et remise</strong><span>Ces choix sont contextualisés dans la carte finale.</span></div></div>
                  <div className="market-listing-fields market-listing-fields--two">
                    {draft.pillarId === "services" ? <Toggle checked={draft.remote} onChange={(checked) => update("remote", checked)} label="Disponible à distance" hint="Le lieu devient facultatif." /> : null}
                    <label className="market-listing-field"><span>Ville *</span><input value={draft.city} onChange={(event) => update("city", event.target.value)} disabled={draft.remote && draft.pillarId === "services"} aria-invalid={Boolean(errors.city)} /><FieldError message={errors.city} /></label>
                    <label className="market-listing-field"><span>Quartier / secteur</span><input value={draft.area} onChange={(event) => update("area", event.target.value)} disabled={draft.remote && draft.pillarId === "services"} /></label>
                    <Toggle
                      checked={draft.pickup}
                      onChange={(checked) => update("pickup", checked)}
                      label={draft.pillarId === "services" ? "Prestation sur place" : "Remise en main propre"}
                      hint={draft.pillarId === "services" ? "Le lieu exact reste privé jusqu’à la confirmation." : "L’adresse exacte reste privée."}
                    />
                    <Toggle checked={draft.shipping} onChange={(checked) => update("shipping", checked)} label="Expédition possible" hint="Les frais et le délai seront affichés dans l’annonce." />
                    {draft.shipping ? <>
                      <label className="market-listing-field"><span>Frais d’expédition</span><div className="market-listing-money"><input type="number" min="0" value={draft.shippingPrice} onChange={(event) => update("shippingPrice", Number(event.target.value))} /><b>€</b></div></label>
                      <label className="market-listing-field"><span>Préparation</span><div className="market-listing-suffix"><input type="number" min="0" value={draft.preparationDays} onChange={(event) => update("preparationDays", Number(event.target.value))} /><b>jours</b></div></label>
                    </> : null}
                  </div>
                  <FieldError message={errors.logistics} />
                </div>
              </section>
            ) : null}

            {activeStep === 4 ? (
              <section className="market-listing-section" aria-labelledby="listing-step-identity">
                <div className="market-listing-section__intro">
                  <span>05 · SIGNER L’ANNONCE</span>
                  <h2 id="listing-step-identity">Votre identité inspire la confiance.</h2>
                  <p>Le profil public accompagne l’offre, jamais votre adresse personnelle.</p>
                </div>

                <div className="market-listing-identity-card">
                  <div className="market-listing-identity-card__portrait">{draft.sellerMonogram || "MW"}<span><ShieldCheck size={14} /></span></div>
                  <div>
                    <strong>{draft.sellerName || "Votre nom public"}</strong>
                    <small>
                      {draft.sellerKind === "artist" ? "Artiste" : draft.sellerKind === "studio" ? "Studio" : "Boutique"}
                      {publicationMode === "demo" ? " · Identité de démonstration" : " · Profil connecté"}
                    </small>
                  </div>
                  <span>{draft.responseTime}</span>
                </div>

                <div className="market-listing-fields market-listing-fields--two">
                  <label className="market-listing-field"><span>Nom public *</span><input value={draft.sellerName} readOnly={sellerIdentityLocked} onChange={(event) => update("sellerName", event.target.value)} aria-invalid={Boolean(errors.sellerName)} /><FieldError message={errors.sellerName} /></label>
                  <label className="market-listing-field"><span>Type de profil</span><select value={draft.sellerKind} disabled={sellerKindLocked} onChange={(event) => update("sellerKind", event.target.value as MarketListingSellerKind)}><option value="artist">Artiste</option><option value="studio">Studio</option><option value="store">Boutique</option></select></label>
                  <label className="market-listing-field"><span>Monogramme</span><input value={draft.sellerMonogram} readOnly={sellerIdentityLocked} onChange={(event) => update("sellerMonogram", event.target.value.slice(0, 3).toUpperCase())} maxLength={3} /></label>
                  <label className="market-listing-field"><span>Délai de réponse</span><select value={draft.responseTime} onChange={(event) => update("responseTime", event.target.value)}><option>Répond en moins de 15 minutes</option><option>Répond en moins d’une heure</option><option>Répond dans la journée</option></select></label>
                  <label className="market-listing-field market-listing-field--wide"><span>Présentation vendeur</span><textarea rows={4} value={draft.sellerBio} readOnly={sellerIdentityLocked} onChange={(event) => update("sellerBio", event.target.value)} /></label>
                </div>

                <div className="market-listing-review">
                  <h3>Contrôle avant publication</h3>
                  <div className="market-listing-review__grid">
                    <span data-ok={draft.title.length >= 4 ? "true" : "false"}><CheckCircle2 size={18} /> Titre & description</span>
                    <span data-ok={draft.media.some((media) => media.kind === "image") ? "true" : "false"}><CheckCircle2 size={18} /> Image de couverture</span>
                    <span data-ok={(draft.price > 0 || draft.dailyPrice > 0 || draft.unlockedUnitPrice > 0) ? "true" : "false"}><CheckCircle2 size={18} /> Prix & conditions</span>
                    <span data-ok={draft.sellerName.length >= 2 ? "true" : "false"}><CheckCircle2 size={18} /> Identité publique</span>
                  </div>
                </div>

                <div className="market-listing-consents">
                  <label data-error={errors.acceptAccuracy ? "true" : "false"}><input type="checkbox" checked={draft.acceptAccuracy} onChange={(event) => update("acceptAccuracy", event.target.checked)} /><span><strong>Je confirme que les informations et visuels sont fidèles.</strong><small>La transparence protège les artistes et les acheteurs.</small></span></label>
                  <FieldError message={errors.acceptAccuracy} />
                  <label data-error={errors.acceptTerms ? "true" : "false"}><input type="checkbox" checked={draft.acceptTerms} onChange={(event) => update("acceptTerms", event.target.checked)} /><span><strong>J’accepte les règles de publication du Market.</strong><small>{publicationMode === "demo" ? "Simulation locale : aucun paiement ni échange réel n’est lancé." : "Cette étape enregistre un brouillon : aucun paiement ni échange n’est lancé."}</small></span></label>
                  <FieldError message={errors.acceptTerms} />
                </div>

                {published ? (
                  <div className="market-listing-published" role="status">
                    <span><Check size={25} /></span>
                    <div>
                      <strong>{publicationMode === "demo" ? "Annonce publiée en mode démonstration" : "Brouillon enregistré"}</strong>
                      <p>{publicationMode === "demo" ? "Le payload complet a été validé localement." : "Le serveur a enregistré l’annonce sans l’auto-publier."}</p>
                      {publicationResult?.listingId ? <small>Référence : {publicationResult.listingId}</small> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCreateAnother ? onCreateAnother() : resetComposer()}
                      disabled={publishing}
                    >
                      <Plus size={16} /> Créer une autre annonce
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}
          </form>

          <div className={`market-listing-composer__preview ${mobilePreviewOpen ? "is-open" : ""}`}>
            <button ref={mobilePreviewCloseRef} type="button" className="market-listing-composer__preview-close" onClick={() => setMobilePreviewOpen(false)} disabled={publishing} tabIndex={mobilePreviewOpen ? 0 : -1} aria-label="Fermer l’aperçu"><X size={18} /></button>
            <ListingPreview draft={draft} publicationMode={publicationMode} />
          </div>
        </div>

        <footer className="market-listing-composer__footer">
          <div>
            <button ref={mobilePreviewTriggerRef} type="button" className="market-listing-composer__mobile-preview" onClick={() => setMobilePreviewOpen(true)} disabled={publishing}><FileImage size={17} /> Aperçu</button>
            <button type="button" className="market-listing-composer__reset" onClick={resetComposer} disabled={publishing || published}>Réinitialiser</button>
          </div>
          <span>Étape {activeStep + 1} sur {STEPS.length}</span>
          <div>
            {activeStep > 0 ? <button type="button" className="market-listing-composer__back" onClick={goBack} disabled={publishing || published}><ArrowLeft size={17} /> Retour</button> : null}
            {activeStep < STEPS.length - 1 ? (
              <button type="button" className="market-listing-composer__next" onClick={goNext} disabled={publishing || published}>Continuer <ArrowRight size={17} /></button>
            ) : (
              <button type="button" className="market-listing-composer__publish" onClick={(event) => { void publish(event); }} disabled={publishing || published}><Zap size={17} /> {publishing ? "Enregistrement…" : publicationMode === "demo" ? "Publier l’annonce" : "Enregistrer le brouillon"}</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
