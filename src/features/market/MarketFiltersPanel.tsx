import {
  ArrowDownAZ,
  CalendarClock,
  Check,
  Heart,
  MapPin,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Truck,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { GradeLevel } from "../grades/gradeBadges";
import {
  MARKET_PILLARS,
  type MarketCategory,
  type MarketCondition,
  type MarketPillarId,
  type MarketProductView,
  type MarketSeller,
} from "./marketDemoData";
import { getMarketSellerIdentity } from "./marketSellerIdentity";
import "./market-filters.css";
import "./market-filters-premium.css";

export type MarketFilterPillar = MarketPillarId | "all";
export type MarketFilterAvailability = "any" | "now" | "7-days" | "30-days";
export type MarketFilterFulfillment = "shipping" | "pickup" | "remote";
export type MarketFilterSort =
  | "recommended"
  | "price-asc"
  | "price-desc"
  | "rating"
  | "popular"
  | "distance";

export interface MarketFilterValue {
  pillarId: MarketFilterPillar;
  categories: MarketCategory[];
  priceMin: number | null;
  priceMax: number | null;
  conditions: MarketCondition[];
  fulfillment: MarketFilterFulfillment[];
  availability: MarketFilterAvailability;
  sellerKinds: MarketSeller["kind"][];
  verifiedOnly: boolean;
  minimumGrade: GradeLevel | null;
  sort: MarketFilterSort;
  favoritesOnly: boolean;
}

export interface MarketFilterEvaluationOptions {
  favoriteIds?: ReadonlySet<string>;
  now?: Date;
}

export interface MarketFiltersPanelProps {
  products: readonly MarketProductView[];
  initialFilters?: Partial<MarketFilterValue>;
  contextPillar?: MarketFilterPillar;
  lockPillar?: boolean;
  favoriteIds?: ReadonlySet<string>;
  title?: string;
  inertSelectors?: string;
  className?: string;
  viewer?: MarketFilterViewer;
  /**
   * The visible products are only the currently loaded server page. When this
   * is enabled, a zero-item preview must not prevent the authoritative RPC
   * from applying the filters to the full catalogue.
   */
  serverBackedResults?: boolean;
  /** Hide the proximity sort when the backend cannot return a real distance. */
  distanceSortAvailable?: boolean;
  onApply: (filters: MarketFilterValue, products: MarketProductView[]) => void;
  onClose: () => void;
  onReset?: (filters: MarketFilterValue) => void;
  onDraftChange?: (filters: MarketFilterValue, resultCount: number) => void;
}

export interface MarketFilterViewer {
  name: string;
  role: string;
  imageUrl: string;
}

export interface MarketFiltersTriggerProps {
  activeCriteriaCount?: number;
  expanded?: boolean;
  className?: string;
  onClick: () => void;
}

type ChoiceMeta<T extends string> = {
  id: T;
  label: string;
  hint?: string;
  icon?: LucideIcon;
};

const CONDITION_CHOICES: ChoiceMeta<MarketCondition>[] = [
  { id: "new", label: "Neuf" },
  { id: "mint", label: "Comme neuf" },
  { id: "excellent", label: "Excellent" },
  { id: "very-good", label: "Très bon" },
];

const MARKET_CATEGORY_CHOICES: readonly MarketCategory[] = [
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
  "Mix & mastering",
  "Cours & coaching",
  "Billetterie",
  "Rooms & studios",
  "Autres",
];

const FULFILLMENT_CHOICES: ChoiceMeta<MarketFilterFulfillment>[] = [
  { id: "shipping", label: "Livraison", hint: "Expédition suivie", icon: Truck },
  { id: "pickup", label: "Retrait", hint: "Remise en main propre", icon: MapPin },
  { id: "remote", label: "À distance", hint: "Service en ligne", icon: Sparkles },
];

const AVAILABILITY_CHOICES: ChoiceMeta<MarketFilterAvailability>[] = [
  { id: "any", label: "Toutes" },
  { id: "now", label: "Maintenant" },
  { id: "7-days", label: "Sous 7 jours" },
  { id: "30-days", label: "Sous 30 jours" },
];

const SELLER_KIND_CHOICES: ChoiceMeta<MarketSeller["kind"]>[] = [
  { id: "store", label: "Boutiques", icon: Store },
  { id: "studio", label: "Studios", icon: PackageCheck },
  { id: "artist", label: "Artistes", icon: UsersRound },
];

const SORT_CHOICES: ChoiceMeta<MarketFilterSort>[] = [
  { id: "recommended", label: "Recommandés" },
  { id: "price-asc", label: "Prix croissant" },
  { id: "price-desc", label: "Prix décroissant" },
  { id: "rating", label: "Mieux notés" },
  { id: "popular", label: "Plus populaires" },
  { id: "distance", label: "Plus proches" },
];

const PILLAR_ICONS: Record<MarketPillarId, LucideIcon> = {
  new: PackageCheck,
  used: Store,
  rental: CalendarClock,
  services: Sparkles,
  collective: UsersRound,
};

const MARKET_PILLAR_ACCENTS: Record<MarketFilterPillar, string> = {
  all: "126, 72, 238",
  new: "91, 124, 255",
  used: "233, 162, 59",
  rental: "39, 194, 209",
  services: "198, 91, 255",
  collective: "57, 200, 137",
};

const DEFAULT_MARKET_VIEWER: MarketFilterViewer = {
  name: "FETAh",
  role: "Host beatmaker",
  imageUrl: "/assets/orbit/founder-puff.png",
};

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

export function createDefaultMarketFilters(
  pillarId: MarketFilterPillar = "all",
): MarketFilterValue {
  return {
    pillarId,
    categories: [],
    priceMin: null,
    priceMax: null,
    conditions: [],
    fulfillment: [],
    availability: "any",
    sellerKinds: [],
    verifiedOnly: false,
    minimumGrade: null,
    sort: "recommended",
    favoritesOnly: false,
  };
}

function normalizeFilters(
  filters: Partial<MarketFilterValue> | undefined,
  contextPillar: MarketFilterPillar,
): MarketFilterValue {
  const defaults = createDefaultMarketFilters(contextPillar);
  const minimum = filters?.priceMin;
  const maximum = filters?.priceMax;

  return {
    ...defaults,
    ...filters,
    pillarId: filters?.pillarId ?? contextPillar,
    categories: unique(filters?.categories ?? []),
    conditions: unique(filters?.conditions ?? []),
    fulfillment: unique(filters?.fulfillment ?? []),
    sellerKinds: unique(filters?.sellerKinds ?? []),
    priceMin: typeof minimum === "number" && Number.isFinite(minimum) && minimum >= 0 ? minimum : null,
    priceMax: typeof maximum === "number" && Number.isFinite(maximum) && maximum >= 0 ? maximum : null,
  };
}

export function countMarketFilterCriteria(filters: MarketFilterValue) {
  return (
    (filters.pillarId === "all" ? 0 : 1)
    + filters.categories.length
    + (filters.priceMin === null ? 0 : 1)
    + (filters.priceMax === null ? 0 : 1)
    + filters.conditions.length
    + filters.fulfillment.length
    + (filters.availability === "any" ? 0 : 1)
    + filters.sellerKinds.length
    + (filters.verifiedOnly ? 1 : 0)
    + (filters.minimumGrade === null ? 0 : 1)
    + (filters.sort === "recommended" ? 0 : 1)
    + (filters.favoritesOnly ? 1 : 0)
  );
}

function isRemoteProduct(product: MarketProductView) {
  if (typeof product.location.remote === "boolean") return product.location.remote;
  if (product.pillarId !== "services" || !product.service) return false;
  return /distance|visio|remote|hybride/i.test(product.service.format);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getProductAvailabilityDate(product: MarketProductView, now: Date) {
  if (product.rental?.availableFrom) {
    const parsed = new Date(`${product.rental.availableFrom}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (!product.service) return startOfDay(now);
  if (product.service.eventDate) {
    const parsed = new Date(`${product.service.eventDate}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const label = product.service.nextAvailability.toLocaleLowerCase("fr-FR");
  if (/maintenant|aujourd|disponible/.test(label)) return startOfDay(now);
  if (/demain/.test(label)) return addDays(startOfDay(now), 1);
  if (/semaine/.test(label)) return addDays(startOfDay(now), 7);
  return null;
}

function productMatchesAvailability(
  product: MarketProductView,
  availability: MarketFilterAvailability,
  now: Date,
) {
  if (availability === "any") return true;
  if (product.availabilityBucket) {
    if (availability === "now") return product.availabilityBucket === "now";
    if (availability === "7-days") {
      return product.availabilityBucket === "now" || product.availabilityBucket === "7-days";
    }
    return product.availabilityBucket !== "later";
  }
  const availableAt = getProductAvailabilityDate(product, now);
  if (!availableAt) return false;
  const today = startOfDay(now);
  const limit = availability === "now" ? today : addDays(today, availability === "7-days" ? 7 : 30);
  return availableAt.getTime() <= limit.getTime();
}

export function filterMarketProducts(
  products: readonly MarketProductView[],
  filters: MarketFilterValue,
  options: MarketFilterEvaluationOptions = {},
) {
  const favoriteIds = options.favoriteIds;
  const now = options.now ?? new Date();
  const minimum = filters.priceMin ?? 0;
  const maximum = filters.priceMax ?? Number.POSITIVE_INFINITY;

  const filtered = products.filter((product) => {
    if (filters.pillarId !== "all" && product.pillarId !== filters.pillarId) return false;
    if (filters.categories.length && !filters.categories.includes(product.category)) return false;
    if (product.price.amount < minimum || product.price.amount > maximum) return false;
    if (filters.conditions.length && !filters.conditions.includes(product.condition)) return false;
    if (filters.sellerKinds.length && !filters.sellerKinds.includes(product.seller.kind)) return false;
    if (filters.verifiedOnly && !product.seller.verified) return false;
    const sellerGrade = product.seller.gradeLevel ?? getMarketSellerIdentity(product.seller.id).gradeLevel;
    if (filters.minimumGrade !== null && sellerGrade < filters.minimumGrade) return false;
    if (filters.favoritesOnly && !(favoriteIds?.has(product.id) ?? product.favorite)) return false;
    if (!productMatchesAvailability(product, filters.availability, now)) return false;

    if (filters.fulfillment.length) {
      const matchesFulfillment = filters.fulfillment.some((mode) => {
        if (mode === "shipping") return product.location.shipping;
        if (mode === "pickup") return product.location.pickup;
        return isRemoteProduct(product);
      });
      if (!matchesFulfillment) return false;
    }
    return true;
  });

  return [...filtered].sort((left, right) => {
    if (filters.sort === "price-asc") return left.price.amount - right.price.amount;
    if (filters.sort === "price-desc") return right.price.amount - left.price.amount;
    if (filters.sort === "rating") return right.rating.score - left.rating.score || right.rating.count - left.rating.count;
    if (filters.sort === "popular") return right.seller.salesCount - left.seller.salesCount;
    if (filters.sort === "distance") return left.location.distanceKm - right.location.distanceKm;
    return 0;
  });
}

function toggleArrayValue<T>(values: readonly T[], value: T) {
  return values.includes(value) ? values.filter((candidate) => candidate !== value) : [...values, value];
}

function parseMoneyInput(value: string) {
  if (!value.trim()) return null;
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number < 0) return null;
  // Mirrors the catalogue RPC bigint ceiling (1e12 cents). A pasted value
  // can therefore never crash filter normalization during render.
  return Math.min(number, 10_000_000_000);
}

export function MarketFiltersTrigger({
  activeCriteriaCount = 0,
  expanded = false,
  className = "",
  onClick,
}: MarketFiltersTriggerProps) {
  return (
    <button
      type="button"
      className={`market-filters-trigger ${activeCriteriaCount > 0 ? "is-active" : ""} ${className}`.trim()}
      aria-label={activeCriteriaCount > 0 ? `Filtres Market, ${activeCriteriaCount} critères actifs` : "Ouvrir les filtres Market"}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-controls="market-filters-dialog"
      onClick={onClick}
    >
      <SlidersHorizontal aria-hidden="true" />
      {activeCriteriaCount > 0 && <span aria-hidden="true">{activeCriteriaCount > 99 ? "99+" : activeCriteriaCount}</span>}
    </button>
  );
}

export default function MarketFiltersPanel({
  products,
  initialFilters,
  contextPillar = "all",
  lockPillar = false,
  favoriteIds,
  title = "Affiner le Market",
  inertSelectors = ".market-shell, .market-primary-rail",
  className = "",
  viewer = DEFAULT_MARKET_VIEWER,
  serverBackedResults = false,
  distanceSortAvailable = true,
  onApply,
  onClose,
  onReset,
  onDraftChange,
}: MarketFiltersPanelProps) {
  const [draft, setDraft] = useState<MarketFilterValue>(() => normalizeFilters(initialFilters, contextPillar));
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [closing, setClosing] = useState(false);
  const [anchorStyle, setAnchorStyle] = useState<CSSProperties>({});
  const dismissTimerRef = useRef<number | null>(null);
  const dismiss = useCallback((finish: () => void) => {
    if (dismissTimerRef.current !== null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    setClosing(true);
    dismissTimerRef.current = window.setTimeout(finish, 180);
  }, []);

  useEffect(() => () => {
    if (dismissTimerRef.current !== null) window.clearTimeout(dismissTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    const search = document.querySelector<HTMLElement>(".market-contentbar .market-search");
    if (!search) return;
    const align = () => {
      const rect = search.getBoundingClientRect();
      setAnchorStyle({
        "--filter-anchor-left": rect.left + "px",
        "--filter-anchor-top": rect.bottom + 10 + "px",
        "--filter-anchor-width": rect.width + "px",
      } as CSSProperties);
    };
    align();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    observer?.observe(search);
    window.addEventListener("resize", align);
    return () => { observer?.disconnect(); window.removeEventListener("resize", align); };
  }, []);


  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!lockPillar) return;
    setDraft((current) => ({ ...current, pillarId: contextPillar }));
  }, [contextPillar, lockPillar]);

  useEffect(() => {
    if (distanceSortAvailable) return;
    setDraft((current) => current.sort === "distance"
      ? { ...current, sort: "recommended" }
      : current);
  }, [distanceSortAvailable]);

  const contextProducts = useMemo(
    () => draft.pillarId === "all" ? products : products.filter((product) => product.pillarId === draft.pillarId),
    [draft.pillarId, products],
  );

  const categoryFacets = useMemo(() => {
    const counts = new Map<MarketCategory, number>();
    contextProducts.forEach((product) => counts.set(product.category, (counts.get(product.category) ?? 0) + 1));
    if (serverBackedResults) {
      return MARKET_CATEGORY_CHOICES.map((category) => [category, counts.get(category) ?? 0] as const);
    }
    return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "fr-FR"));
  }, [contextProducts, serverBackedResults]);

  const pillarCounts = useMemo(() => {
    const counts = new Map<MarketPillarId, number>();
    products.forEach((product) => counts.set(product.pillarId, (counts.get(product.pillarId) ?? 0) + 1));
    return counts;
  }, [products]);

  const resultProducts = useMemo(
    () => filterMarketProducts(products, draft, { favoriteIds }),
    [draft, favoriteIds, products],
  );
  const criteriaCount = countMarketFilterCriteria(draft);
  const priceError = draft.priceMin !== null && draft.priceMax !== null && draft.priceMin > draft.priceMax;

  useEffect(() => {
    onDraftChange?.(draft, resultProducts.length);
  }, [draft, onDraftChange, resultProducts.length]);

  useEffect(() => {
    if (document.activeElement instanceof HTMLElement && !dialogRef.current?.contains(document.activeElement)) {
      previousFocusRef.current = document.activeElement;
    }
    const bodyOverflow = document.body.style.overflow;
    const backgroundLayers = [...document.querySelectorAll<HTMLElement>(inertSelectors)].map((element) => ({
      element,
      hadInert: element.hasAttribute("inert"),
    }));
    document.body.style.overflow = "hidden";
    backgroundLayers.forEach(({ element }) => element.setAttribute("inert", ""));
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        dismiss(() => onCloseRef.current());
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = bodyOverflow;
      backgroundLayers.forEach(({ element, hadInert }) => {
        if (!hadInert) element.removeAttribute("inert");
      });
      window.requestAnimationFrame(() => previousFocusRef.current?.focus());
    };
  }, [inertSelectors, dismiss]);

  const update = <Key extends keyof MarketFilterValue>(key: Key, value: MarketFilterValue[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const reset = () => {
    const next = createDefaultMarketFilters(contextPillar);
    setDraft(next);
    onReset?.(next);
  };

  const apply = () => {
    if (priceError) return;
    dismiss(() => onApply(draft, resultProducts));
  };

  const activePillarMeta = draft.pillarId === "all"
    ? { label: "Tous les univers", accent: "#7E48EE" }
    : MARKET_PILLARS.find((pillar) => pillar.id === draft.pillarId) ?? MARKET_PILLARS[0];

  return (
    <div
      className={`market-filters-layer ${closing ? "is-closing" : ""} ${className}`.trim()}
      data-pillar={draft.pillarId}
      style={{ ...anchorStyle, "--market-filter-accent": MARKET_PILLAR_ACCENTS[draft.pillarId] } as CSSProperties}
    >
      <button type="button" className="market-filters-layer__backdrop" tabIndex={-1} aria-hidden="true" onClick={() => dismiss(() => onCloseRef.current())} />
      <aside
        id="market-filters-dialog"
        ref={dialogRef}
        className="market-filters-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="market-filters-title"
        aria-describedby="market-filters-description"
      >
        <header className="market-filters-panel__header">
          <div className="market-filters-panel__heading-icon"><SlidersHorizontal aria-hidden="true" /></div>
          <div className="market-filters-panel__heading">
            <span>CURATION MARKET</span>
            <h2 id="market-filters-title">{title}</h2>
            <p id="market-filters-description">Précise l’offre idéale sans quitter le catalogue.</p>
          </div>
          <div className="market-filters-panel__header-actions">
            {criteriaCount > 0 && <span className="market-filters-panel__count" aria-label={`${criteriaCount} critères actifs`}>{criteriaCount}</span>}
            <button ref={closeButtonRef} type="button" className="market-filters-panel__close" onClick={() => dismiss(() => onCloseRef.current())} aria-label="Fermer les filtres"><X aria-hidden="true" /></button>
          </div>
        </header>

        <div className="market-filters-panel__summary" aria-live="polite">
          <span style={{ "--summary-accent": activePillarMeta.accent } as CSSProperties}><Sparkles aria-hidden="true" /></span>
          <div>
            <strong>
              {resultProducts.length} offre{resultProducts.length > 1 ? "s" : ""}
              {serverBackedResults ? " dans l’aperçu" : ""}
            </strong>
            <small>
              {activePillarMeta.label} · {serverBackedResults
                ? "catalogue complet après application"
                : "mise à jour instantanée"}
            </small>
          </div>
          <div className="market-filters-panel__viewer">
            <img src={viewer.imageUrl} alt="" />
            <span><strong>{viewer.name}</strong><small>{viewer.role}</small></span>
          </div>
        </div>

        <div className="market-filters-panel__scroll">
          <fieldset className="market-filter-section market-filter-section--universe">
            <legend><span>01</span><div>Univers<small>Le code couleur reste contextuel</small></div></legend>
            {lockPillar ? (
              <div className="market-filter-context"><Check aria-hidden="true" /><div><strong>{activePillarMeta.label}</strong><small>Univers verrouillé par la vue actuelle</small></div></div>
            ) : (
              <div className="market-filter-universes">
                <button type="button" aria-pressed={draft.pillarId === "all"} className={draft.pillarId === "all" ? "is-active" : ""} onClick={() => update("pillarId", "all")}>
                  <SlidersHorizontal aria-hidden="true" /><span><strong>Tout</strong><small>{products.length}</small></span>
                </button>
                {MARKET_PILLARS.map((pillar) => {
                  const Icon = PILLAR_ICONS[pillar.id];
                  return (
                    <button key={pillar.id} type="button" data-pillar={pillar.id} aria-pressed={draft.pillarId === pillar.id} className={draft.pillarId === pillar.id ? "is-active" : ""} onClick={() => update("pillarId", pillar.id)}>
                      <Icon aria-hidden="true" /><span><strong>{pillar.label}</strong><small>{serverBackedResults && !pillarCounts.has(pillar.id) ? "—" : pillarCounts.get(pillar.id) ?? 0}</small></span>
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <fieldset className="market-filter-section">
            <legend><span>02</span><div>Catégories<small>{categoryFacets.length} familles disponibles</small></div></legend>
            <div className="market-filter-chips market-filter-chips--categories">
              {categoryFacets.map(([category, count]) => (
                <button key={category} type="button" aria-pressed={draft.categories.includes(category)} className={draft.categories.includes(category) ? "is-active" : ""} onClick={() => update("categories", toggleArrayValue(draft.categories, category))}>
                  {category}<small>{serverBackedResults && count === 0 ? "—" : count}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="market-filter-section">
            <legend><span>03</span><div>Budget & état<small>Des limites claires, sans surprise</small></div></legend>
            <div className="market-filter-price" data-error={priceError ? "true" : "false"}>
              <label><span>Prix minimum</span><div><input type="text" inputMode="decimal" value={draft.priceMin ?? ""} onChange={(event) => update("priceMin", parseMoneyInput(event.target.value))} placeholder="0" aria-label="Prix minimum en euros" /><b>€</b></div></label>
              <i aria-hidden="true" />
              <label><span>Prix maximum</span><div><input type="text" inputMode="decimal" value={draft.priceMax ?? ""} onChange={(event) => update("priceMax", parseMoneyInput(event.target.value))} placeholder="Sans limite" aria-label="Prix maximum en euros" /><b>€</b></div></label>
            </div>
            {priceError && <p className="market-filter-error" role="alert">Le maximum doit être supérieur ou égal au minimum.</p>}
            <div className="market-filter-chips">
              {CONDITION_CHOICES.map((choice) => (
                <button key={choice.id} type="button" aria-pressed={draft.conditions.includes(choice.id)} className={draft.conditions.includes(choice.id) ? "is-active" : ""} onClick={() => update("conditions", toggleArrayValue(draft.conditions, choice.id))}>{choice.label}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="market-filter-section">
            <legend><span>04</span><div>Réception & disponibilité<small>Où et quand l’offre est accessible</small></div></legend>
            <div className="market-filter-methods">
              {FULFILLMENT_CHOICES.map((choice) => {
                const Icon = choice.icon ?? Truck;
                const active = draft.fulfillment.includes(choice.id);
                return <button key={choice.id} type="button" aria-pressed={active} className={active ? "is-active" : ""} onClick={() => update("fulfillment", toggleArrayValue(draft.fulfillment, choice.id))}><Icon aria-hidden="true" /><span><strong>{choice.label}</strong><small>{choice.hint}</small></span><i><Check aria-hidden="true" /></i></button>;
              })}
            </div>
            <div className="market-filter-segmented" role="group" aria-label="Disponibilité">
              {AVAILABILITY_CHOICES.map((choice) => <button key={choice.id} type="button" aria-pressed={draft.availability === choice.id} className={draft.availability === choice.id ? "is-active" : ""} onClick={() => update("availability", choice.id)}>{choice.label}</button>)}
            </div>
          </fieldset>

          <fieldset className="market-filter-section">
            <legend><span>05</span><div>Vendeur & grade<small>Choisis le niveau de confiance</small></div></legend>
            <div className="market-filter-sellers">
              {SELLER_KIND_CHOICES.map((choice) => {
                const Icon = choice.icon ?? Store;
                const active = draft.sellerKinds.includes(choice.id);
                return <button key={choice.id} type="button" aria-pressed={active} className={active ? "is-active" : ""} onClick={() => update("sellerKinds", toggleArrayValue(draft.sellerKinds, choice.id))}><Icon aria-hidden="true" />{choice.label}</button>;
              })}
            </div>
            <button type="button" className={`market-filter-toggle ${draft.verifiedOnly ? "is-active" : ""}`} role="switch" aria-checked={draft.verifiedOnly} onClick={() => update("verifiedOnly", !draft.verifiedOnly)}>
              <span><ShieldCheck aria-hidden="true" /></span><div><strong>Vendeurs vérifiés</strong><small>Identité contrôlée par Meewav</small></div><i><b /></i>
            </button>
            <div className="market-filter-grade">
              <div><Star aria-hidden="true" /><span><strong>Grade minimum</strong><small>Réputation Meewav du vendeur</small></span></div>
              <div role="group" aria-label="Grade minimum du vendeur">
                <button type="button" className={draft.minimumGrade === null ? "is-active" : ""} aria-pressed={draft.minimumGrade === null} onClick={() => update("minimumGrade", null)}>Tous</button>
                {([3, 4, 5, 6] as GradeLevel[]).map((grade) => <button key={grade} type="button" className={draft.minimumGrade === grade ? "is-active" : ""} aria-pressed={draft.minimumGrade === grade} onClick={() => update("minimumGrade", grade)}>{grade}+</button>)}
              </div>
            </div>
          </fieldset>

          <fieldset className="market-filter-section market-filter-section--last">
            <legend><span>06</span><div>Ordre & préférences<small>La dernière touche de curation</small></div></legend>
            <label className="market-filter-sort"><ArrowDownAZ aria-hidden="true" /><span><strong>Trier les résultats</strong><small>{distanceSortAvailable ? "Recommandation, prix ou proximité" : "Recommandation, prix ou réputation"}</small></span><select value={draft.sort} onChange={(event) => update("sort", event.target.value as MarketFilterSort)} aria-label="Trier les résultats">{SORT_CHOICES.map((choice) => <option key={choice.id} value={choice.id} disabled={choice.id === "distance" && !distanceSortAvailable}>{choice.label}{choice.id === "distance" && !distanceSortAvailable ? " · bientôt" : ""}</option>)}</select></label>
            <button type="button" className={`market-filter-toggle ${draft.favoritesOnly ? "is-active" : ""}`} role="switch" aria-checked={draft.favoritesOnly} onClick={() => update("favoritesOnly", !draft.favoritesOnly)}>
              <span><Heart aria-hidden="true" /></span><div><strong>Mes favoris uniquement</strong><small>Retrouver les offres déjà sauvegardées</small></div><i><b /></i>
            </button>
          </fieldset>
        </div>

        <footer className="market-filters-panel__footer">
          <button type="button" className="market-filters-panel__reset" onClick={reset} disabled={criteriaCount === 0}><RotateCcw aria-hidden="true" />Réinitialiser</button>
          <button
            type="button"
            className="market-filters-panel__apply"
            onClick={apply}
            disabled={priceError || (!serverBackedResults && resultProducts.length === 0)}
          >
            <span><SlidersHorizontal aria-hidden="true" />Appliquer {criteriaCount > 0 ? `${criteriaCount} critère${criteriaCount > 1 ? "s" : ""}` : "les filtres"}</span>
            <b>{resultProducts.length}</b>
          </button>
        </footer>
      </aside>
    </div>
  );
}
