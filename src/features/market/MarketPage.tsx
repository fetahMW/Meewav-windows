import RailEdgeNavigation from "../../components/shared/rail/RailEdgeNavigation";
import {
  ArrowRight,
  BadgeEuro,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FilePenLine,
  Heart,
  Home,
  MessageCircle,
  PackageOpen,
  Plus,
  ReceiptText,
  Repeat2,
  Search,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Star,
  Store,
  Truck,
  UserRound,
  UsersRound,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import MeewavPillarTabs, { type MeewavPillarTabItem } from "../../components/navigation/MeewavPillarTabs";
import { useAuth } from "../auth/AuthContext";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import MeewavPrimaryNav from "../globe/components/MeewavPrimaryNav";
import {
  MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
  MON_GLOBE_ROUTE,
} from "../globe/monGlobeContract";
import {
  buildMarketplaceListingReturnPath,
  buildMessagingRoute,
  getMarketplaceListingId,
  isMessagingUuid,
} from "../messaging/messaging.route";
import { profileMediaRepository } from "../profile/profile.media.service";
import {
  MARKET_PILLARS,
  MARKET_FEATURED_PRODUCT_IDS,
  MARKET_HOME_RAILS,
  getMarketProductsByPillar,
  initialMarketCart,
  initialMarketFavorites,
  marketProductViews,
  type MarketPillarId,
  type MarketProductView,
} from "./marketDemoData";
import MarketCartPanel from "./MarketCartPanel";
import MarketIntentCenter from "./MarketIntentCenter";
import MarketFiltersPanel, {
  countMarketFilterCriteria,
  createDefaultMarketFilters,
  filterMarketProducts,
  type MarketFilterValue,
} from "./MarketFiltersPanel";
import MarketListingComposer from "./MarketListingComposer";
import type { MarketListingDraft, MarketListingPublicationResult } from "./MarketListingComposer";
import { MarketSellerDraftCenter } from "./MarketSellerDraftCenter";
import {
  applyMarketplaceViewerState,
  mapMarketplaceCatalogRows,
  marketplaceCategoryCodes,
} from "./market.adapters";
import { MarketplaceServiceError } from "./market.errors";
import { resolveMarketRuntimeMode } from "./market.flags";
import { toMarketplaceListingDraftInput, toMarketListingDraftResumePatch } from "./market.listing";
import { createMarketplaceIdempotencyKey, marketplaceRepository } from "./market.service";
import type {
  MarketplaceCatalogFilters,
  MarketplaceIntentRole,
  MarketplaceOwnerDraft,
  MarketplaceSellerKind,
} from "./market.types";
import { useMarketLive } from "./useMarketLive";
import { getMarketSellerIdentity } from "./marketSellerIdentity";
import { buildMarketWallSequence } from "./marketWallSequence";
import "./market-page.css";
import "./market-home.css";
import "./market-double-band.css";
import "./market-home-premium.css";

type DrawerView = "cart" | null;
type PopoverView = "menu" | "notifications" | null;

const PILLAR_ICONS: Record<MarketPillarId, LucideIcon> = {
  new: PackageOpen,
  used: Repeat2,
  rental: CalendarDays,
  services: Sparkles,
  collective: UsersRound,
};

type MarketNavigationTabId = "home" | MarketPillarId;

const MARKET_NAV_ITEMS: readonly MeewavPillarTabItem<MarketNavigationTabId>[] = [
  { id: "home", label: "Accueil", icon: Home, accent: "#f7f5ff" },
  ...MARKET_PILLARS.map((pillar) => ({
    id: pillar.id,
    label: pillar.label,
    icon: PILLAR_ICONS[pillar.id],
    accent: {
      new: "#5B7CFF",
      used: "#E9A23B",
      rental: "#27C2D1",
      services: "#C65BFF",
      collective: "#39C889",
    }[pillar.id],
  })),
];

const PILLAR_FILTERS: Record<MarketPillarId, string[]> = {
  new: ["Tout", "Synthétiseurs", "Guitares", "Interfaces audio", "Microphones", "Casques"],
  used: ["Tout", "Autour de toi", "Excellent", "Négociable", "Pièces rares"],
  rental: ["Tout", "Aujourd’hui", "Ce week-end", "Studio", "DJ & vinyle"],
  services: ["Tout", "Mix & mastering", "Cours & coaching", "Billetterie", "Rooms & studios"],
  collective: ["Tout", "Bientôt débloqué", "Fin imminente", "Meilleure remise"],
};

const LIVE_PILLAR_FILTERS: Record<MarketPillarId, string[]> = {
  new: ["Tout", "Synthétiseurs", "Guitares", "Interfaces audio", "Microphones", "Casques"],
  used: ["Tout", "Excellent"],
  rental: ["Tout", "Aujourd’hui", "DJ & vinyle"],
  services: ["Tout", "Mix & mastering", "Cours & coaching", "Billetterie", "Rooms & studios"],
  collective: ["Tout"],
};

const LIVE_QUICK_FILTER_CATEGORIES: Partial<Record<
  string,
  MarketFilterValue["categories"][number]
>> = {
  Synthétiseurs: "Synthétiseurs",
  Guitares: "Guitares",
  "Interfaces audio": "Interfaces audio",
  Microphones: "Microphones",
  Casques: "Casques",
  "DJ & vinyle": "DJ & vinyle",
  "Mix & mastering": "Mix & mastering",
  "Cours & coaching": "Cours & coaching",
  Billetterie: "Billetterie",
  "Rooms & studios": "Rooms & studios",
};

function applyLiveQuickFilter(
  current: MarketFilterValue,
  pillarId: MarketPillarId,
  quickFilter: string,
): MarketFilterValue {
  const next: MarketFilterValue = {
    ...current,
    pillarId,
    categories: [],
    conditions: [],
    availability: "any",
  };
  const category = LIVE_QUICK_FILTER_CATEGORIES[quickFilter];
  if (category) return { ...next, categories: [category] };
  if (quickFilter === "Excellent") return { ...next, conditions: ["excellent", "mint"] };
  if (quickFilter === "Aujourd’hui") return { ...next, availability: "now" };
  return next;
}

function toLiveCatalogFilters(
  filters: MarketFilterValue,
  search: string,
): MarketplaceCatalogFilters {
  return {
    pillar: filters.pillarId === "all" ? null : filters.pillarId,
    categoryCodes: filters.categories.length > 0
      ? marketplaceCategoryCodes(filters.categories)
      : null,
    minimumPriceMinor: filters.priceMin === null ? null : Math.round(filters.priceMin * 100),
    maximumPriceMinor: filters.priceMax === null ? null : Math.round(filters.priceMax * 100),
    conditionCodes: filters.conditions.length > 0 ? filters.conditions : null,
    fulfillment: filters.fulfillment.length > 0 ? filters.fulfillment : null,
    availability: filters.availability,
    sellerKinds: filters.sellerKinds.length > 0 ? filters.sellerKinds : null,
    verifiedOnly: filters.verifiedOnly,
    minimumGrade: filters.minimumGrade,
    // Distance is intentionally unavailable until the catalogue can compute
    // a consented viewer-relative distance. Never fabricate proximity.
    sort: filters.sort === "distance" ? "recommended" : filters.sort,
    favoritesOnly: filters.favoritesOnly,
    search: search || null,
  };
}

const NAV_MENU_ITEMS = [
  { label: "Mes demandes", icon: ReceiptText, intentRole: "buyer" as const },
  { label: "Demandes reçues", icon: PackageOpen, intentRole: "seller" as const },
  { label: "Mes annonces", icon: FilePenLine, intentRole: null },
  { label: "Mes favoris", icon: Heart, intentRole: null },
];

function formatPrice(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function priceUnitLabel(unit: MarketProductView["price"]["unit"], compact = false) {
  if (unit === "day") return compact ? "/j" : "par jour";
  if (unit === "session") return compact ? "/session" : "par session";
  if (unit === "ticket") return compact ? "/place" : "par place";
  if (unit === "participant") return compact ? "/participant" : "par participant";
  return "";
}

function addIsoDateDays(value: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  date.setUTCDate(date.getUTCDate() + Math.max(0, Math.trunc(days)));
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function latestIsoDate(...values: string[]) {
  const validValues = values.filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  return validValues[validValues.length - 1] ?? todayIsoDate();
}

function nextSundayIsoDate() {
  const date = new Date();
  date.setDate(date.getDate() + ((7 - date.getDay()) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMarketDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function getListingFulfilment(product: MarketProductView) {
  const place = `${product.location.area}, ${product.location.city}`;
  const options = [
    product.location.pickup ? `remise en main propre à ${place}` : null,
    product.location.shipping ? "expédition possible" : null,
  ].filter((value): value is string => Boolean(value));
  return options.length > 0 ? options.join(" ou ") : `disponible à ${place}`;
}

function getListingNarrative(product: MarketProductView) {
  const price = formatPrice(product.price.amount);

  if (product.pillarId === "new") {
    return {
      label: "Le mot du shop",
      text: `${product.description} ${product.conditionLabel}. ${product.seller.name} le propose à ${price}, avec ${getListingFulfilment(product)}.`,
    };
  }

  if (product.pillarId === "used") {
    return {
      label: "Le mot du vendeur",
      text: `Je me sépare de ${product.title}. ${product.description} Il est en ${product.conditionLabel.toLocaleLowerCase("fr-FR")}. J’en demande ${price}, avec ${getListingFulfilment(product)}.`,
    };
  }

  if (product.pillarId === "rental" && product.rental) {
    return {
      label: "Conditions du propriétaire",
      text: `Je mets ${product.title} à disposition pour vos sessions. Comptez ${formatPrice(product.rental.dailyPrice)} par jour, ${formatPrice(product.rental.weekendPrice)} le week-end ou ${formatPrice(product.rental.weeklyPrice)} la semaine. Caution de ${formatPrice(product.rental.deposit)}, disponible dès le ${formatMarketDate(product.rental.availableFrom)}. ${product.rental.instantBook ? "Réponse rapide annoncée par le propriétaire ; la demande reste à confirmer." : "Validation sur demande."}`,
    };
  }

  if (product.pillarId === "services" && product.service) {
    if (product.service.kind === "ticket") {
      return {
        label: "L’invitation",
        text: `${product.description} Accès ${product.service.format} pendant ${product.service.durationLabel}. Rendez-vous ${product.service.nextAvailability}, ${product.service.deliveryLabel.toLocaleLowerCase("fr-FR")}. Billet à ${price}.`,
      };
    }
    if (product.service.kind === "room") {
      return {
        label: "Le mot du studio",
        text: `Nous ouvrons cet espace pour une session de ${product.service.durationLabel} en ${product.service.format.toLocaleLowerCase("fr-FR")}. ${product.description} ${product.service.deliveryLabel}. Prochain créneau : ${product.service.nextAvailability}, tarif ${price}.`,
      };
    }
    return {
      label: product.service.kind === "coaching" ? "La proposition du coach" : "Le brief du prestataire",
      text: `Je propose ${product.title} au format ${product.service.format.toLocaleLowerCase("fr-FR")} pendant ${product.service.durationLabel}. ${product.description} ${product.service.deliveryLabel}. Prochaine disponibilité : ${product.service.nextAvailability}, tarif ${price}.`,
    };
  }

  if (product.pillarId === "collective" && product.collective) {
    return {
      label: "L’objectif collectif",
      text: `${product.description} Nous sommes déjà ${product.collective.joined} participants sur ${product.collective.target}. À ${product.collective.progressPercent} %, le tarif visé est de ${formatPrice(product.collective.unlockedUnitPrice)} au lieu de ${formatPrice(product.collective.retailUnitPrice)}, soit ${product.collective.savingsPercent} % d’économie. Encore ${product.collective.daysRemaining} jours pour rejoindre la commande.`,
    };
  }

  return { label: "L’annonce", text: product.description };
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function productSearchText(product: MarketProductView) {
  return [
    product.title,
    product.brand,
    product.model,
    product.category,
    product.seller.name,
    product.location.city,
  ].join(" ").toLocaleLowerCase("fr-FR");
}

function productMatchesFilter(product: MarketProductView, filter: string) {
  if (filter === "Tout") return true;
  if (filter === product.category) return true;
  if (filter === "Autour de toi") return product.location.distanceKm <= 12;
  if (filter === "Excellent") return product.condition === "excellent" || product.condition === "mint";
  if (filter === "Négociable") return product.negotiable === true;
  if (filter === "Pièces rares") return product.price.amount > 700;
  if (filter === "Aujourd’hui") return Boolean(product.rental?.availableFrom && product.rental.availableFrom <= new Date().toISOString().slice(0, 10));
  if (filter === "Ce week-end") return Boolean(product.rental && product.rental.weekendPrice > 0 && product.rental.availableFrom <= nextSundayIsoDate());
  if (filter === "Studio") return product.seller.kind === "studio";
  if (filter === "Bientôt débloqué") return (product.collective?.progressPercent ?? 0) >= 75;
  if (filter === "Fin imminente") return (product.collective?.daysRemaining ?? 99) <= 4;
  if (filter === "Meilleure remise") return (product.collective?.savingsPercent ?? 0) >= 20;
  return true;
}

const FEATURED_PRODUCTS_PER_PILLAR = 8;
const curatedFeaturedProductIds = new Set(MARKET_FEATURED_PRODUCT_IDS);
const marketPillarLabels = Object.fromEntries(
  MARKET_PILLARS.map((pillar) => [pillar.id, pillar.label]),
) as Record<MarketPillarId, string>;

const featuredProductsByPillar = Object.fromEntries(
  MARKET_PILLARS.map((pillar) => {
    const products = [...getMarketProductsByPillar(pillar.id)]
      .sort((left, right) => {
        const curatedPriority = Number(curatedFeaturedProductIds.has(right.id)) - Number(curatedFeaturedProductIds.has(left.id));
        if (curatedPriority !== 0) return curatedPriority;
        const featuredPriority = Number(right.featured) - Number(left.featured);
        if (featuredPriority !== 0) return featuredPriority;
        const ratingPriority = right.rating.score - left.rating.score;
        if (ratingPriority !== 0) return ratingPriority;
        return right.rating.count - left.rating.count;
      })
      .slice(0, FEATURED_PRODUCTS_PER_PILLAR);

    return [pillar.id, products] as const;
  }),
) as Record<MarketPillarId, MarketProductView[]>;

const featuredMarketProducts = Array.from(
  { length: FEATURED_PRODUCTS_PER_PILLAR },
  (_, productIndex) => MARKET_PILLARS.map((pillar) => featuredProductsByPillar[pillar.id][productIndex]),
).flat().filter((product): product is MarketProductView => Boolean(product));

const marketHomeRails = MARKET_HOME_RAILS.map((rail) => ({
  ...rail,
  products: [
    ...rail.productIds
    .map((id) => marketProductViews.find((product) => product.id === id))
    .filter((product): product is MarketProductView => Boolean(product)),
    ...getMarketProductsByPillar(rail.pillarId),
  ]
    .filter((product, index, products) => products.findIndex((candidate) => candidate.id === product.id) === index)
    .slice(0, 30),
}));

function buildLiveFeaturedProducts(products: readonly MarketProductView[]) {
  const byPillar = Object.fromEntries(MARKET_PILLARS.map((pillar) => {
    const candidates = products
      .filter((product) => product.pillarId === pillar.id)
      .sort((left, right) => {
        const curatedPriority = Number(curatedFeaturedProductIds.has(right.id)) - Number(curatedFeaturedProductIds.has(left.id));
        if (curatedPriority !== 0) return curatedPriority;
        const featuredPriority = Number(right.featured) - Number(left.featured);
        if (featuredPriority !== 0) return featuredPriority;
        return right.rating.score - left.rating.score;
      })
      .slice(0, FEATURED_PRODUCTS_PER_PILLAR);
    return [pillar.id, candidates] as const;
  })) as Record<MarketPillarId, MarketProductView[]>;

  return Array.from(
    { length: FEATURED_PRODUCTS_PER_PILLAR },
    (_, productIndex) => MARKET_PILLARS.map((pillar) => byPillar[pillar.id][productIndex]),
  ).flat().filter((product): product is MarketProductView => Boolean(product));
}

function authMetadataText(metadata: unknown, ...keys: string[]) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function sellerKindFromAuthMetadata(metadata: unknown): MarketplaceSellerKind {
  const explicitKind = authMetadataText(metadata, "marketplace_seller_kind", "seller_kind")
    ?.toLocaleLowerCase("en-US");
  if (explicitKind === "artist" || explicitKind === "studio" || explicitKind === "store") {
    return explicitKind;
  }
  const profileRole = authMetadataText(metadata, "primary_role_key", "artist_type")
    ?.toLocaleLowerCase("en-US");
  return profileRole === "studio" ? "studio" : "artist";
}

function buildLiveHomeRails(products: readonly MarketProductView[]) {
  return MARKET_HOME_RAILS.map((rail) => ({
    ...rail,
    products: products.filter((product) => product.pillarId === rail.pillarId).slice(0, 30),
  }));
}

type MarketRailProps = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  products: MarketProductView[];
  variant?: "featured" | "catalog";
  favorites: Set<string>;
  onOpen: (product: MarketProductView, sourceProducts: readonly MarketProductView[]) => void;
  onFavorite: (productId: string, event?: MouseEvent) => void;
  onSeeAll?: () => void;
};

function MarketCardSeller({ product }: { product: MarketProductView }) {
  const isStore = product.seller.kind === 'store';
  const label = isStore ? 'Boutique' : product.seller.kind === 'studio' ? 'Studio' : 'Particulier';
  const Icon = isStore ? Store : UserRound;
  return <span className="market-card-seller" title={`${label} · ${product.seller.name} · ${product.location.city}`}>
    <span className="market-card-seller__icon" aria-label={label}><Icon aria-hidden="true" /></span>
    <span>{product.seller.name} · {product.location.city}</span>
  </span>;
}

function MarketHeroContent({ product, isLoopClone }: { product: MarketProductView; isLoopClone: boolean }) {
  return (
    <>
      <span className="market-home-hero__visual">
        <img src={product.imageUrl} alt={isLoopClone ? "" : product.imageAlt} loading="lazy" decoding="async" />
        <span className="market-rail-card__badge">{marketPillarLabels[product.pillarId]}</span>
      </span>
      <span className="market-home-hero__body">
        <span className="market-rail-card__category">{product.category}</span>
        <strong className="market-home-hero__title">{product.title}</strong>
        <span className="market-home-hero__seller"><MarketCardSeller product={product} /></span>
        <span className="market-home-hero__description">{product.description}</span>
        <span className="market-home-hero__detail">{product.collective
          ? product.collective.joined + "/" + product.collective.target + " participants · " + product.collective.progressPercent + "% réunis"
          : product.service
            ? product.service.durationLabel + " · " + product.service.nextAvailability
            : product.conditionLabel}</span>
        <span className="market-home-hero__footer">
          <span className="market-home-hero__price"><b>{formatPrice(product.price.amount)}</b><small>{priceUnitLabel(product.price.unit, true)}</small></span>
          <span className="market-home-hero__cta">Découvrir <ArrowRight aria-hidden="true" /></span>
        </span>
      </span>
    </>
  );
}

function MarketRail({
  id,
  eyebrow,
  title,
  description,
  products,
  variant = "catalog",
  favorites,
  onOpen,
  onFavorite,
  onSeeAll,
}: MarketRailProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | null>(null);
  const loopCloneCount = Math.min(8, products.length);
  const initialIndex = loopCloneCount;
  const loopedProducts = useMemo(() => [
    ...products.slice(-loopCloneCount).map((product, index) => ({ product, loopCopy: "before" as const, renderKey: `before-${index}-${product.id}` })),
    ...products.map((product, index) => ({ product, loopCopy: "original" as const, renderKey: `original-${index}-${product.id}` })),
    ...products.slice(0, loopCloneCount).map((product, index) => ({ product, loopCopy: "after" as const, renderKey: `after-${index}-${product.id}` })),
  ], [loopCloneCount, products]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const target = viewport?.querySelectorAll<HTMLElement>("[data-market-rail-card]")[initialIndex];
    if (!viewport || !target) return;
    const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
    const left = target.offsetLeft - viewportPadding;
    const previousScrollBehavior = viewport.style.scrollBehavior;
    viewport.style.scrollBehavior = "auto";
    viewport.scrollLeft = left;
    viewport.style.scrollBehavior = previousScrollBehavior;
  }, [id, initialIndex, products.length]);

  useEffect(() => () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  const updateActiveCard = () => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(() => {
      settleTimerRef.current = null;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const track = viewport.querySelector<HTMLElement>(".market-rail__track");
      const cards = viewport.querySelectorAll<HTMLElement>("[data-market-rail-card]");
      const firstCard = cards[0];
      if (!track || !firstCard) return;
      const gap = Number.parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      const stride = firstCard.offsetWidth + gap;
      if (stride <= 0 || products.length <= 1) return;

      const rawIndex = Math.round(viewport.scrollLeft / stride);
      let recenteredIndex: number | null = null;
      if (rawIndex < loopCloneCount) recenteredIndex = rawIndex + products.length;
      if (rawIndex >= loopCloneCount + products.length) recenteredIndex = rawIndex - products.length;

      if (recenteredIndex !== null) {
        const target = cards[recenteredIndex];
        if (!target) return;
        const viewportPadding = Number.parseFloat(getComputedStyle(viewport).paddingLeft) || 0;
        const previousScrollBehavior = viewport.style.scrollBehavior;
        viewport.style.scrollBehavior = "auto";
        viewport.scrollLeft = target.offsetLeft - viewportPadding;
        viewport.style.scrollBehavior = previousScrollBehavior;
      }
    }, 96);
  };

  const scrollByPage = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    const track = viewport?.querySelector<HTMLElement>(".market-rail__track");
    const firstCard = viewport?.querySelector<HTMLElement>("[data-market-rail-card]");
    if (!viewport || !track || !firstCard) return;

    const trackStyles = getComputedStyle(track);
    const gap = Number.parseFloat(trackStyles.columnGap || trackStyles.gap) || 0;
    const stride = firstCard.offsetWidth + gap;
    const usableWidth = Math.max(stride, viewport.clientWidth - 96);
    const minimumPageSize = variant === "featured" ? 1 : viewport.clientWidth >= 760 ? 2 : 1;
    const cardsPerPage = Math.max(minimumPageSize, Math.floor(usableWidth / stride));
    viewport.scrollBy({ left: direction * cardsPerPage * stride, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };

  return (
    <section className={`market-rail market-rail--${variant}`} aria-labelledby={`${id}-title`}>
      <header className="market-rail__header">
        <div>
          <span className="market-rail__eyebrow">{eyebrow}</span>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="market-rail__tools">
          {onSeeAll && (
            <button type="button" className="market-rail__more" onClick={onSeeAll} aria-label={`Voir toutes les offres de ${title}`}>
              Voir plus <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="market-rail__viewport-shell">
        <div
          id={`${id}-viewport`}
          ref={viewportRef}
          className="market-rail__viewport"
          onScroll={updateActiveCard}
          data-market-magnetic-rail
          data-market-looping="true"
        >
          <div className="market-rail__track">
          {loopedProducts.map(({ product, loopCopy, renderKey }) => {
            const isFavorite = favorites.has(product.id);
            const isLoopClone = loopCopy !== "original";

            return (
              <article
                key={`${id}-${renderKey}`}
                className={`market-rail-card ${variant === "featured" ? "market-home-hero" : "market-mini"}`}
                data-market-rail-card
                data-market-loop-clone={loopCopy === "original" ? undefined : loopCopy}
                data-market-pillar={product.pillarId}
                data-market-service-kind={product.service?.kind}
                aria-hidden={isLoopClone || undefined}
                inert={isLoopClone || undefined}
              >
                <button type="button" tabIndex={isLoopClone ? -1 : undefined} className="market-rail-card__main" onClick={() => onOpen(product, products)} aria-label={`Voir ${product.title}`}>
                  {variant === "featured" ? <MarketHeroContent product={product} isLoopClone={isLoopClone} /> : (<>
                  <span className="market-rail-card__visual">
                    <img src={product.imageUrl} alt={isLoopClone ? "" : product.imageAlt} loading="lazy" decoding="async" />
                    <span className="market-rail-card__badge">
                      {marketPillarLabels[product.pillarId]}
                    </span>
                  </span>
                  <span className="market-rail-card__body">
                    <span className="market-rail-card__category">{product.category}</span>
                    <strong>{product.title}</strong>
                    <span className="market-rail-card__seller"><MarketCardSeller product={product} /></span>
                    {product.collective ? (
                      <span className="market-rail-card__progress">
                        <span><b>{product.collective.progressPercent}%</b> · {product.collective.joined}/{product.collective.target}</span>
                        <i><span style={{ width: `${product.collective.progressPercent}%` }} /></i>
                      </span>
                    ) : product.service ? (
                      <span className="market-rail-card__service">{product.service.durationLabel} · {product.service.nextAvailability}</span>
                    ) : null}
                    <span className="market-rail-card__price">
                      <b>{formatPrice(product.price.amount)}</b>
                      <span>{priceUnitLabel(product.price.unit, true) || product.conditionLabel}</span>
                    </span>
                  </span>
                  </>)}
                </button>
                <button
                  type="button"
                  className={`market-rail-card__favorite ${isFavorite ? "is-active" : ""}`}
                  onClick={(event) => onFavorite(product.id, event)}
                  tabIndex={isLoopClone ? -1 : undefined}
                  aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                >
                  <Heart fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
                </button>
              </article>
            );
            })}
          </div>
        </div>

        <RailEdgeNavigation legacyPrefix="market-rail" title={title} viewportId={`${id}-viewport`} disabled={products.length <= 1} onPrevious={() => scrollByPage(-1)} onNext={() => scrollByPage(1)} />
      </div>
    </section>
  );
}

export default function MarketPage() {
  const navigate = useNavigate();
  const [marketSearchParams] = useSearchParams();
  const requestedListingId = getMarketplaceListingId(marketSearchParams);
  const { user } = useAuth();
  const runtimeMode = resolveMarketRuntimeMode();
  const [activePillar, setActivePillar] = useState<MarketPillarId>("new");
  const [activeFilter, setActiveFilter] = useState("Tout");
  const [query, setQuery] = useState("");
  const [liveSearch, setLiveSearch] = useState("");
  const [demoFavorites, setDemoFavorites] = useState<Set<string>>(() => new Set(initialMarketFavorites));
  const [demoCart, setDemoCart] = useState<Map<string, number>>(() => new Map(initialMarketCart));
  const [demoJoinedCollectives, setDemoJoinedCollectives] = useState<Set<string>>(() => new Set());
  const [selectedProduct, setSelectedProduct] = useState<MarketProductView | null>(null);
  const [detailProductIds, setDetailProductIds] = useState<string[]>([]);
  const [drawer, setDrawer] = useState<DrawerView>(null);
  const [popover, setPopover] = useState<PopoverView>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sellerDraftsOpen, setSellerDraftsOpen] = useState(false);
  const [editingOwnerDraft, setEditingOwnerDraft] = useState<MarketplaceOwnerDraft | null>(null);
  const [draftCenterRevision, setDraftCenterRevision] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [marketFilters, setMarketFilters] = useState<MarketFilterValue>(() => createDefaultMarketFilters("all"));
  const [sellerKindOverride, setSellerKindOverride] = useState<MarketplaceSellerKind | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [intentCenterRole, setIntentCenterRole] = useState<MarketplaceIntentRole | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [rentalStart, setRentalStart] = useState(todayIsoDate);
  const [rentalEnd, setRentalEnd] = useState(() => addIsoDateDays(todayIsoDate(), 1));
  const [viewMode, setViewMode] = useState<"home" | "catalog">("home");
  const marketScrollRef = useRef<HTMLDivElement>(null);
  const marketCenterTriggerRef = useRef<HTMLButtonElement>(null);
  const notificationsTriggerRef = useRef<HTMLButtonElement>(null);
  const marketCenterPopoverRef = useRef<HTMLElement>(null);
  const notificationsPopoverRef = useRef<HTMLElement>(null);
  const marketSearchInputRef = useRef<HTMLInputElement>(null);
  const detailModalRef = useRef<HTMLElement>(null);
  const detailScrollRef = useRef<HTMLDivElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const listingUploadCacheRef = useRef<Map<string, string>>(new Map());
  const listingUploadOwnerRef = useRef<string | null>(null);
  const listingIdempotencyKeyRef = useRef<string | null>(null);
  const listingPublishInFlightRef = useRef(false);
  const listingCleanupAfterPublishRef = useRef(false);
  const discardCachedUpload = (mediaId: string) => {
    const ownerId = listingUploadOwnerRef.current;
    return ownerId
      ? profileMediaRepository.discardNewMarketplaceUpload(ownerId, mediaId)
      : profileMediaRepository.archiveOwnerMedia(mediaId);
  };
  const deepLinkHydrationRequestRef = useRef(0);
  const deepLinkHydrationAttemptRef = useRef<string | null>(null);
  const hasSelectedProduct = selectedProduct !== null;
  const closeIntentCenter = useCallback(() => {
    setIntentCenterRole(null);
    window.requestAnimationFrame(() => marketCenterTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLiveSearch(query.trim()), 280);
    return () => window.clearTimeout(timeout);
  }, [query]);

  const liveCatalogFilters = useMemo(
    () => toLiveCatalogFilters(marketFilters, liveSearch),
    [liveSearch, marketFilters],
  );

  const marketLive = useMarketLive({
    enabled: Boolean(user),
    viewerId: user?.id ?? null,
    mode: runtimeMode,
    catalog: {
      limit: 60,
      filters: liveCatalogFilters,
    },
  });
  const marketProducts = marketLive.active ? marketLive.products : marketProductViews;
  const favorites = marketLive.active ? marketLive.favorites : demoFavorites;
  const cart = marketLive.active ? marketLive.cart : demoCart;
  const joinedCollectives = marketLive.active ? marketLive.joinedCollectives : demoJoinedCollectives;
  const marketActionError = marketLive.actionError;
  const clearMarketActionError = marketLive.clearActionError;
  const requireMarketAccount = () => {
    if (runtimeMode === "supabase" && !user) {
      setToast("Connecte-toi pour utiliser les favoris, le panier ou contacter un vendeur.");
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!marketActionError) return;
    setToast(marketActionError.message);
    clearMarketActionError();
  }, [clearMarketActionError, marketActionError]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey)
        && !event.altKey
        && event.key.toLocaleLowerCase("fr-FR") === "k"
        && !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        setPopover(null);
        marketSearchInputRef.current?.focus();
        return;
      }
      if (event.defaultPrevented) return;
      if (event.key !== "Escape") return;
      if (document.querySelector(".market-cart-panel, .market-listing-composer, .market-intents, .market-filters-panel")) return;
      setDrawer(null);
      setSelectedProduct(null);
      setDetailProductIds([]);
      setPopover(null);
      setListingOpen(false);
      if (requestedListingId) navigate("/market", { replace: true });
      window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, requestedListingId]);

  useEffect(() => {
    if (!popover) return;
    const popoverElement = popover === "menu"
      ? marketCenterPopoverRef.current
      : notificationsPopoverRef.current;
    const triggerElement = popover === "menu"
      ? marketCenterTriggerRef.current
      : notificationsTriggerRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstAction = popoverElement?.querySelector<HTMLButtonElement>('button:not([disabled])');
      (firstAction ?? popoverElement)?.focus();
    });

    const closeAndRestoreFocus = () => {
      setPopover(null);
      window.requestAnimationFrame(() => triggerElement?.focus());
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverElement?.contains(target) || triggerElement?.contains(target)) return;
      closeAndRestoreFocus();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverElement?.contains(target) || triggerElement?.contains(target)) return;
      setPopover(null);
    };
    const onPopoverKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeAndRestoreFocus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    window.addEventListener("keydown", onPopoverKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("keydown", onPopoverKeyDown, true);
    };
  }, [popover]);

  useEffect(() => {
    if (!hasSelectedProduct) return;
    const modal = detailModalRef.current;
    const backgroundLayers = document.querySelectorAll<HTMLElement>(".market-shell, .market-primary-rail");
    backgroundLayers.forEach((layer) => layer.setAttribute("inert", ""));

    const trapFocus = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Tab" || !modal) return;
      const focusable = [...modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
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

    modal?.addEventListener("keydown", trapFocus);
    return () => {
      modal?.removeEventListener("keydown", trapFocus);
      backgroundLayers.forEach((layer) => layer.removeAttribute("inert"));
    };
  }, [hasSelectedProduct]);

  const queryNormalized = query.trim().toLocaleLowerCase("fr-FR");
  const appliedFilterCount = Math.max(
    0,
    countMarketFilterCriteria(marketFilters) - (marketFilters.pillarId === "all" ? 0 : 1),
  );
  const isAllCatalog = viewMode === "catalog" && !queryNormalized && marketFilters.pillarId === "all";
  const baseProducts = useMemo(() => {
    if (marketLive.active) {
      if (showFavoritesOnly
        && marketFilters.pillarId === "all"
        && appliedFilterCount <= 1
        && !queryNormalized) {
        return marketLive.favoriteProducts;
      }
      return marketProducts;
    }
    if (queryNormalized) return marketProducts;
    if (viewMode === "catalog" && marketFilters.pillarId === "all") return marketProducts;
    const pillarId = marketFilters.pillarId === "all" ? activePillar : marketFilters.pillarId;
    return marketProducts.filter((product) => product.pillarId === pillarId);
  }, [activePillar, appliedFilterCount, marketLive.active, marketLive.favoriteProducts, marketFilters.pillarId, marketProducts, queryNormalized, showFavoritesOnly, viewMode]);

  const visibleProducts = useMemo(() => {
    // Supabase owns filtering, searching and ordering across the complete
    // catalogue. Re-filtering one loaded page creates false negatives and
    // breaks the order tied to the pagination cursor.
    if (marketLive.active) return baseProducts;
    return filterMarketProducts(baseProducts, marketFilters, { favoriteIds: favorites }).filter((product) => {
      if (queryNormalized && !productSearchText(product).includes(queryNormalized)) return false;
      if (!queryNormalized && !isAllCatalog && !productMatchesFilter(product, activeFilter)) return false;
      if (showFavoritesOnly && !favorites.has(product.id)) return false;
      return true;
    });
  }, [activeFilter, baseProducts, favorites, isAllCatalog, marketFilters, marketLive.active, queryNormalized, showFavoritesOnly]);

  const wallProducts = useMemo(() => {
    if (queryNormalized || showFavoritesOnly || appliedFilterCount > 0 || isAllCatalog) return visibleProducts;
    return buildMarketWallSequence(visibleProducts);
  }, [appliedFilterCount, isAllCatalog, queryNormalized, showFavoritesOnly, visibleProducts]);

  const cartCount = useMemo(
    () => [...cart.values()].reduce((total, quantity) => total + quantity, 0),
    [cart],
  );
  const pendingCartProductIds = useMemo(() => new Set(
    [...marketLive.pendingActions]
      .filter((action) => action.startsWith("cart:"))
      .map((action) => action.slice("cart:".length)),
  ), [marketLive.pendingActions]);
  const heroProduct = marketProducts.find((product) => product.id === "new-moog-subsequent-37") ?? marketProducts[0];
  const heroCollective = marketProducts.find((product) => product.id === "collective-arturia-minifreak");
  const isHome = !sellerDraftsOpen
    && viewMode === "home"
    && !queryNormalized
    && !showFavoritesOnly
    && appliedFilterCount === 0;
  const discoveryProducts = useMemo(
    () => marketLive.active ? buildLiveFeaturedProducts(marketProducts) : featuredMarketProducts,
    [marketLive.active, marketProducts],
  );
  const homeRails = useMemo(
    () => marketLive.active ? buildLiveHomeRails(marketProducts) : marketHomeRails.map((rail) => rail),
    [marketLive.active, marketProducts],
  );

  const resetMarketScroll = () => {
    if (marketScrollRef.current) marketScrollRef.current.scrollTop = 0;
  };

  useEffect(() => {
    if (marketScrollRef.current) marketScrollRef.current.scrollTop = 0;
  }, []);

  useEffect(() => () => {
    if (listingPublishInFlightRef.current) {
      listingCleanupAfterPublishRef.current = true;
      return;
    }
    const orphanedMediaIds = [...listingUploadCacheRef.current.values()];
    listingUploadCacheRef.current.clear();
    if (orphanedMediaIds.length === 0) return;
    void Promise.allSettled(
      orphanedMediaIds.map(discardCachedUpload),
    );
  }, []);

  const handlePillarChange = (pillarId: MarketPillarId) => {
    resetMarketScroll();
    setSellerDraftsOpen(false);
    setActivePillar(pillarId);
    setActiveFilter("Tout");
    setQuery("");
    setShowFavoritesOnly(false);
    setMarketFilters(createDefaultMarketFilters(pillarId));
    setViewMode("catalog");
  };

  const handleHome = () => {
    resetMarketScroll();
    setSellerDraftsOpen(false);
    setActivePillar("new");
    setActiveFilter("Tout");
    setQuery("");
    setShowFavoritesOnly(false);
    setMarketFilters(createDefaultMarketFilters("all"));
    setViewMode("home");
  };

  const handleFilter = (filter: string) => {
    setActiveFilter(filter);
    if (marketLive.active) {
      setMarketFilters((current) => applyLiveQuickFilter(current, activePillar, filter));
    }
  };

  const handleFavorite = (productId: string, event?: MouseEvent) => {
    event?.stopPropagation();
    if (!requireMarketAccount()) return;
    if (marketLive.active) {
      void marketLive.toggleFavorite(productId);
      return;
    }
    setDemoFavorites((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const openProduct = useCallback((
    product: MarketProductView,
    requestedSourceProducts?: readonly MarketProductView[],
  ) => {
    const sourceProducts = requestedSourceProducts
      ?? marketProducts.filter((candidate) => candidate.pillarId === product.pillarId);
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailProductIds((sourceProducts.some((candidate) => candidate.id === product.id)
      ? sourceProducts
      : [product, ...sourceProducts])
      .filter((candidate, index, products) => products.findIndex((item) => item.id === candidate.id) === index)
      .map((candidate) => candidate.id));
    setSelectedProduct(product);
    setDrawer(null);
    setPopover(null);
    if (product.rental?.availableFrom) {
      const earliestStart = latestIsoDate(product.rental.availableFrom, todayIsoDate());
      setRentalStart(earliestStart);
      setRentalEnd(addIsoDateDays(earliestStart, product.rental.minimumDays));
    }
  }, [marketProducts]);

  const closeProductDetail = () => {
    setSelectedProduct(null);
    setDetailProductIds([]);
    if (requestedListingId) navigate("/market", { replace: true });
    window.requestAnimationFrame(() => detailTriggerRef.current?.focus());
  };

  const navigateProduct = (direction: -1 | 1) => {
    if (!selectedProduct) return;
    const sourceIds = detailProductIds.length > 0
      ? detailProductIds
      : marketProducts.filter((product) => product.pillarId === selectedProduct.pillarId).map((product) => product.id);
    if (sourceIds.length <= 1) return;
    const currentIndex = Math.max(0, sourceIds.indexOf(selectedProduct.id));
    const nextId = sourceIds[(currentIndex + direction + sourceIds.length) % sourceIds.length];
    const navigationProducts = showFavoritesOnly && marketLive.active
      ? marketLive.favoriteProducts
      : marketProducts;
    const nextProduct = navigationProducts.find((product) => product.id === nextId);
    if (!nextProduct) return;
    detailScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
    setSelectedProduct(nextProduct);
    if (requestedListingId) {
      navigate(buildMarketplaceListingReturnPath(nextProduct.id), { replace: true });
    }
    if (nextProduct.rental?.availableFrom) {
      const earliestStart = latestIsoDate(nextProduct.rental.availableFrom, todayIsoDate());
      setRentalStart(earliestStart);
      setRentalEnd(addIsoDateDays(earliestStart, nextProduct.rental.minimumDays));
    }
  };

  useEffect(() => {
    if (!requestedListingId) {
      deepLinkHydrationAttemptRef.current = null;
      ++deepLinkHydrationRequestRef.current;
      return;
    }
    if (selectedProduct?.id === requestedListingId) return;

    const productCollections: readonly MarketProductView[][] = marketLive.active
      ? [marketProducts, marketLive.favoriteProducts, marketLive.cartProducts]
      : [marketProductViews];
    const availableCollection = productCollections.find((products) => (
      products.some((product) => product.id === requestedListingId)
    ));
    const availableProduct = availableCollection?.find((product) => product.id === requestedListingId);
    if (availableProduct && availableCollection) {
      deepLinkHydrationAttemptRef.current = requestedListingId;
      openProduct(availableProduct, availableCollection);
      return;
    }

    if (!marketLive.active) {
      if (deepLinkHydrationAttemptRef.current !== requestedListingId) {
        deepLinkHydrationAttemptRef.current = requestedListingId;
        setToast("Cette annonce n’est plus disponible.");
      }
      return;
    }
    if (marketLive.status === "idle" || marketLive.status === "loading") return;
    if (deepLinkHydrationAttemptRef.current === requestedListingId) return;

    deepLinkHydrationAttemptRef.current = requestedListingId;
    const requestId = ++deepLinkHydrationRequestRef.current;
    let cancelled = false;

    void marketplaceRepository.listCatalog({
      listingIds: [requestedListingId],
      limit: 1,
    }).then((rows) => {
      if (cancelled || requestId !== deepLinkHydrationRequestRef.current) return;
      const [mappedProduct] = mapMarketplaceCatalogRows(rows);
      if (!mappedProduct) {
        setToast("Cette annonce n’est plus disponible.");
        return;
      }
      const hydratedProduct = applyMarketplaceViewerState(mappedProduct, {
        favorite_listing_ids: [...favorites],
        cart_items: [...cart].map(([listing_id, quantity]) => ({ listing_id, quantity })),
      });
      openProduct(hydratedProduct, [hydratedProduct]);
    }).catch(() => {
      if (cancelled || requestId !== deepLinkHydrationRequestRef.current) return;
      setToast("Impossible de rouvrir cette annonce pour le moment.");
    });

    return () => {
      cancelled = true;
    };
  }, [
    cart,
    favorites,
    marketLive.active,
    marketLive.cartProducts,
    marketLive.favoriteProducts,
    marketLive.status,
    marketProducts,
    openProduct,
    requestedListingId,
    selectedProduct?.id,
  ]);

  const handleAddToCart = async (product: MarketProductView) => {
    if (!requireMarketAccount()) return;
    if (!product.cart.eligible) {
      setToast("Cette offre se réserve directement depuis sa fiche.");
      return;
    }
    const quantity = cart.get(product.id) ?? 0;
    const targetQuantity = Math.min(quantity + 1, product.cart.maxQuantity || 1);
    if (targetQuantity === quantity) {
      setToast(`${product.title} est déjà au maximum disponible.`);
      return;
    }
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`cart:${product.id}`)) return;
      const saved = await marketLive.setCartQuantity(product.id, targetQuantity);
      if (!saved) return;
    } else {
      setDemoCart((current) => {
      const next = new Map(current);
      const currentQuantity = next.get(product.id) ?? 0;
      const nextQuantity = Math.min(currentQuantity + 1, product.cart.maxQuantity || 1);
      if (nextQuantity === currentQuantity) return current;
      next.set(product.id, nextQuantity);
      return next;
      });
    }
    setToast(`${product.title} a été ajouté au panier.`);
  };

  const handleRemoveFromCart = (productId: string) => {
    if (!requireMarketAccount()) return;
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`cart:${productId}`)) return;
      void marketLive.setCartQuantity(productId, 0);
      return;
    }
    setDemoCart((current) => {
      const next = new Map(current);
      next.delete(productId);
      return next;
    });
  };

  const handleCartQuantityChange = (productId: string, quantity: number) => {
    if (!requireMarketAccount()) return;
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`cart:${productId}`)) return;
      void marketLive.setCartQuantity(productId, quantity);
      return;
    }
    setDemoCart((current) => {
      const next = new Map(current);
      const product = marketProducts.find((candidate) => candidate.id === productId);
      if (!product || quantity <= 0) {
        next.delete(productId);
        return next;
      }
      next.set(productId, Math.min(quantity, Math.max(1, product.cart.maxQuantity)));
      return next;
    });
  };

  const handleRentalRequest = async (product: MarketProductView) => {
    if (!requireMarketAccount()) return;
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`rental:${product.id}`)) return;
      const saved = await marketLive.requestRental(product.id, rentalStart, rentalEnd);
      if (!saved) return;
    }
    setToast(`Demande envoyée à ${product.seller.name} pour ${rentalStart} → ${rentalEnd}.`);
    closeProductDetail();
  };

  const handleCollectiveJoin = async (product: MarketProductView) => {
    if (!requireMarketAccount()) return;
    if (!product.collective || product.collective.daysRemaining <= 0) {
      setToast("Cette campagne collective est terminée.");
      return;
    }
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`collective:${product.id}`)) return;
      const saved = await marketLive.joinCollective(product.id);
      if (!saved) return;
    } else {
      setDemoJoinedCollectives((current) => new Set(current).add(product.id));
    }
    setToast(`Tu as rejoint l’achat groupé ${product.title}.`);
  };

  const handleServiceBooking = async (product: MarketProductView) => {
    if (!requireMarketAccount()) return;
    if (marketLive.active) {
      if (marketLive.pendingActions.has(`service:${product.id}`)) return;
      const saved = await marketLive.bookService(product.id);
      if (!saved) return;
    }
    setToast(`Demande envoyée à ${product.seller.name} pour ${product.title}.`);
    closeProductDetail();
  };

  const handleProductAction = (product: MarketProductView) => {
    if (product.pillarId === "rental") {
      void handleRentalRequest(product);
      return;
    }
    if (product.pillarId === "collective") {
      void handleCollectiveJoin(product);
      return;
    }
    if (product.pillarId === "services") {
      void handleServiceBooking(product);
      return;
    }
    void handleAddToCart(product);
  };

  const openSellerConversation = (product: MarketProductView) => {
    if (!requireMarketAccount()) return;
    const sellerProfileId = product.seller.profileId;
    navigate(buildMessagingRoute({
      space: "messages",
      intent: "message",
      source: "marketplace",
      mode: sellerProfileId && isMessagingUuid(sellerProfileId) ? "real" : "demo",
      profileId: sellerProfileId,
      mockArtistId: sellerProfileId && isMessagingUuid(sellerProfileId) ? null : product.seller.id,
      mockArtistName: product.seller.name,
      mockArtistRole: product.seller.kind === "artist" ? "Artiste" : product.seller.kind === "studio" ? "Studio" : "Boutique musicale",
      mockArtistAvatar: product.seller.avatarUrl ?? null,
      mockArtistGradeLevel: product.seller.gradeLevel ?? null,
      marketListingId: product.id,
      marketListingTitle: product.title,
      returnTo: buildMarketplaceListingReturnPath(product.id),
    }));
  };

  const openSellerProfile = (product: MarketProductView) => {
    const profileReference = product.seller.profileId || product.seller.id;
    const canonical = isMessagingUuid(product.seller.profileId);
    const demoParams = canonical ? "" : `?${new URLSearchParams({
      name: product.seller.name,
      role: product.seller.kind === "artist" ? "Artiste" : product.seller.kind === "studio" ? "Studio" : "Boutique musicale",
      city: product.location.city,
      ...(product.seller.avatarUrl ? { portrait: product.seller.avatarUrl } : {}),
      ...(product.seller.gradeLevel ? { grade: String(product.seller.gradeLevel) } : {}),
    }).toString()}`;
    navigate(`/profile/view/${encodeURIComponent(profileReference)}${demoParams}`, {
      state: { from: buildMarketplaceListingReturnPath(product.id) },
    });
  };

  const actionLabel = selectedProduct?.pillarId === "rental"
    ? marketLive.active ? "Envoyer la demande" : "Réserver ces dates"
    : selectedProduct?.pillarId === "services"
      ? marketLive.active
        ? selectedProduct.service?.kind === "ticket" ? "Demander cette place" : "Envoyer la demande"
        : selectedProduct.service?.kind === "ticket"
          ? "Prendre ma place"
          : selectedProduct.service?.kind === "room" ? "Réserver la Room" : "Réserver la prestation"
    : selectedProduct?.pillarId === "collective"
      ? (selectedProduct.collective?.daysRemaining ?? 0) <= 0
        ? "Campagne terminée"
        : joinedCollectives.has(selectedProduct.id) ? "Participation enregistrée" : "Rejoindre l’achat groupé"
      : "Ajouter au panier";
  const selectedActionKey = selectedProduct
    ? selectedProduct.pillarId === "rental"
      ? `rental:${selectedProduct.id}`
      : selectedProduct.pillarId === "services"
        ? `service:${selectedProduct.id}`
        : selectedProduct.pillarId === "collective"
          ? `collective:${selectedProduct.id}`
          : `cart:${selectedProduct.id}`
    : null;
  const selectedActionPending = Boolean(
    marketLive.active
    && selectedActionKey
    && marketLive.pendingActions.has(selectedActionKey),
  );
  const selectedFavoritePending = Boolean(
    marketLive.active
    && selectedProduct
    && marketLive.pendingActions.has(`favorite:${selectedProduct.id}`),
  );
  const selectedCollectiveExpired = Boolean(
    selectedProduct?.pillarId === "collective"
    && (selectedProduct.collective?.daysRemaining ?? 0) <= 0
  );
  const selectedNarrative = selectedProduct ? getListingNarrative(selectedProduct) : null;
  const selectedDetailIndex = selectedProduct ? Math.max(0, detailProductIds.indexOf(selectedProduct.id)) : 0;
  const SelectedProductIcon = selectedProduct ? PILLAR_ICONS[selectedProduct.pillarId] : Store;
  const demoSelectedSellerIdentity = selectedProduct
    ? getMarketSellerIdentity(selectedProduct.seller.id)
    : null;
  const selectedSellerPortrait = marketLive.active
    ? selectedProduct?.seller.avatarUrl ?? null
    : demoSelectedSellerIdentity?.portraitUrl ?? null;
  const selectedSellerGradeLevel = marketLive.active
    ? selectedProduct?.seller.gradeLevel ?? null
    : demoSelectedSellerIdentity?.gradeLevel ?? null;
  const minimumRentalEnd = selectedProduct?.rental
    ? addIsoDateDays(rentalStart, selectedProduct.rental.minimumDays)
    : rentalStart;
  const showSellerIdentityPlaque = selectedProduct?.pillarId === "used"
    || selectedProduct?.pillarId === "services";
  const marketNavigationId = sellerDraftsOpen
    ? "seller-drafts"
    : queryNormalized || isAllCatalog ? "search" : isHome ? "home" : activePillar;
  const sellerName = authMetadataText(user?.user_metadata, "full_name", "display_name", "name")
    ?? user?.email?.split("@")[0]
    ?? "Profil Meewav";
  const sellerIdentity = {
    sellerName,
    sellerKind: sellerKindOverride
      ?? marketLive.sellerKind
      ?? sellerKindFromAuthMetadata(user?.user_metadata),
    sellerMonogram: initials(sellerName).slice(0, 3),
    responseTime: "Répond généralement sous 2 h",
    sellerBio: authMetadataText(user?.user_metadata, "bio") ?? "Membre de la communauté Meewav.",
  };
  const currentUserAvatar = authMetadataText(
    user?.user_metadata,
    "avatar_url",
    "picture",
    "profile_image_url",
  ) ?? "/images/preprofile/portraits/profile-21.webp";

  const closeListingComposer = () => {
    if (listingPublishInFlightRef.current) {
      setToast("Enregistrement en cours : attendez la confirmation avant de fermer.");
      return;
    }
    const closedOwnerDraft = editingOwnerDraft;
    setListingOpen(false);
    setEditingOwnerDraft(null);
    if (closedOwnerDraft) setDraftCenterRevision((current) => current + 1);
    listingIdempotencyKeyRef.current = null;
    if (!marketLive.active || listingUploadCacheRef.current.size === 0) return;
    const orphanedMediaIds = [...listingUploadCacheRef.current.values()];
    listingUploadCacheRef.current.clear();
    void Promise.allSettled(
      orphanedMediaIds.map(discardCachedUpload),
    );
  };

  const publishListing = async (draft: MarketListingDraft): Promise<MarketListingPublicationResult> => {
    if (!marketLive.active) {
      const pillarLabel = MARKET_PILLARS.find((pillar) => pillar.id === draft.pillarId)?.label ?? "Market";
      setToast(`${draft.title} · annonce ${pillarLabel} validée en démonstration.`);
      return { listingId: null, mode: "demo" };
    }
    if (!user) throw new Error("Reconnecte-toi pour enregistrer cette annonce.");

    listingPublishInFlightRef.current = true;

    try {

    const mediaFileIds: string[] = [];
    const uniqueMediaFileIds = new Set<string>();
    const appendMediaFileId = (mediaFileId: string) => {
      if (uniqueMediaFileIds.has(mediaFileId)) return;
      uniqueMediaFileIds.add(mediaFileId);
      mediaFileIds.push(mediaFileId);
    };
    const coverMediaId = draft.media.find((media) => media.kind === "image" && media.isCover)?.id
      ?? draft.media.find((media) => media.kind === "image")?.id;
    if (!coverMediaId) throw new Error("Ajoute une image de couverture avant d’enregistrer ce brouillon.");
    const orderedMedia = [...draft.media].sort(
      (left, right) => Number(right.id === coverMediaId) - Number(left.id === coverMediaId),
    );
    for (const media of orderedMedia) {
      if (media.mediaFileId) {
        appendMediaFileId(media.mediaFileId);
        continue;
      }
      const cachedMediaId = listingUploadCacheRef.current.get(media.id);
      if (cachedMediaId) {
        appendMediaFileId(cachedMediaId);
        continue;
      }
      if (!media.file) {
        throw new Error("Réimporte les visuels locaux avant d’enregistrer ce brouillon sécurisé.");
      }
      const uploaded = await profileMediaRepository.uploadOwnerMedia(
        user.id,
        media.file,
        { sourcePillar: "marketplace" },
      );
      listingUploadOwnerRef.current = user.id;
      listingUploadCacheRef.current.set(media.id, uploaded.id);
      appendMediaFileId(uploaded.id);
    }

    const listingIdempotencyKey = listingIdempotencyKeyRef.current
      ?? createMarketplaceIdempotencyKey(editingOwnerDraft ? "draft-update" : "listing-draft");
    listingIdempotencyKeyRef.current = listingIdempotencyKey;
    const listingInput = toMarketplaceListingDraftInput(draft, mediaFileIds);
    const listingResult = editingOwnerDraft
      ? await marketplaceRepository.updateListingDraft({
          listingId: editingOwnerDraft.listingId,
          expectedVersion: editingOwnerDraft.version,
          input: listingInput,
          idempotencyKey: listingIdempotencyKey,
        })
      : await marketplaceRepository.createListingDraft(listingInput, listingIdempotencyKey);
    const usedMediaIds = new Set(mediaFileIds);
    const supersededUploads = [...listingUploadCacheRef.current.values()]
      .filter((mediaId) => !usedMediaIds.has(mediaId));
    listingUploadCacheRef.current.clear();
    listingIdempotencyKeyRef.current = null;
    if (supersededUploads.length > 0) {
      void Promise.allSettled(
        supersededUploads.map(discardCachedUpload),
      );
    }
    setDraftCenterRevision((current) => current + 1);
    setSellerKindOverride(draft.sellerKind);
    setToast(`${draft.title} · brouillon ${editingOwnerDraft ? "mis à jour" : "enregistré"}.`);
    return { listingId: listingResult.listing_id, mode: "draft" };
    } catch (error) {
      if (editingOwnerDraft && error instanceof MarketplaceServiceError && error.code === "conflict") {
        const orphanedMediaIds = [...new Set(listingUploadCacheRef.current.values())];
        listingUploadCacheRef.current.clear();
        listingIdempotencyKeyRef.current = null;
        if (orphanedMediaIds.length > 0) {
          void Promise.allSettled(
            orphanedMediaIds.map(discardCachedUpload),
          );
        }
        setListingOpen(false);
        setEditingOwnerDraft(null);
        setSellerDraftsOpen(true);
        setDraftCenterRevision((current) => current + 1);
        setToast("Ce brouillon a changé ailleurs. La version récente est rechargée ; tes champs locaux restent récupérables.");
      }
      throw error;
    } finally {
      listingPublishInFlightRef.current = false;
      if (listingCleanupAfterPublishRef.current) {
        listingCleanupAfterPublishRef.current = false;
        const orphanedMediaIds = [...new Set(listingUploadCacheRef.current.values())];
        listingUploadCacheRef.current.clear();
        if (orphanedMediaIds.length > 0) {
          void Promise.allSettled(
            orphanedMediaIds.map(discardCachedUpload),
          );
        }
      }
    }
  };

  return (
    <main
      className="market-page"
      data-market-pillar={activePillar}
      data-market-navigation={marketNavigationId}
    >
      <div className="market-page__background" aria-hidden="true" />

      <div className="market-primary-rail">
        <MeewavPrimaryNav
          activeView="globe"
          activeDestination="market"
          onGlobe={() => navigate(MON_GLOBE_ROUTE, {
            state: MON_GLOBE_HOST_POSITION_NAVIGATION_STATE,
          })}
          onMessages={() => navigate("/messages")}
        />
      </div>

      <section className="market-shell">
        <header className="market-topbar">
          <div className="market-brand">
            <span className="market-brand__copy">
              <MeewavPillarBrand pillar="Marketplace" />
            </span>
          </div>

          <div className="market-contextbar__toolbar">
            <MeewavPillarTabs
              className="market-pillar-tabs is-fine-indicator is-unframed-icons"
              items={MARKET_NAV_ITEMS}
              activeId={marketNavigationId}
              ariaLabel="Espaces de la Marketplace"
              onSelect={(id) => {
                if (id === "home") handleHome();
                else handlePillarChange(id);
              }}
            />
          </div>

          <div className="market-topbar__actions">
            <button
              type="button"
              className={`market-icon-button ${showFavoritesOnly ? "is-active" : ""}`}
              aria-label="Afficher mes favoris"
              onClick={() => {
                if (!requireMarketAccount()) return;
                setSellerDraftsOpen(false);
                setShowFavoritesOnly((current) => {
                  const next = !current;
                  setMarketFilters((filters) => ({ ...filters, favoritesOnly: next }));
                  return next;
                });
                setViewMode("catalog");
              }}
            >
              <Heart aria-hidden="true" />
              {favorites.size > 0 && <span className="market-icon-button__badge">{favorites.size}</span>}
            </button>
            <button
              ref={notificationsTriggerRef}
              type="button"
              className="market-icon-button"
              aria-label="Notifications Market"
              aria-haspopup="dialog"
              aria-expanded={popover === "notifications"}
              aria-controls="market-notifications-popover"
              onClick={() => { if (requireMarketAccount()) setPopover((current) => current === "notifications" ? null : "notifications"); }}
            >
              <Bell aria-hidden="true" />
              {!marketLive.active ? <span className="market-icon-button__badge">3</span> : null}
            </button>
            <button
              type="button"
              className="market-icon-button market-cart-button"
              aria-label="Ouvrir le panier"
              onClick={() => { if (!requireMarketAccount()) return; setSelectedProduct(null); setDrawer("cart"); setPopover(null); }}
            >
              <ShoppingCart aria-hidden="true" />
              {cartCount > 0 && <span className="market-icon-button__badge">{cartCount}</span>}
            </button>
            <button
              ref={marketCenterTriggerRef}
              type="button"
              className="market-brand__portrait"
              aria-label="Ouvrir Market Center"
              title={`${sellerName} · en ligne`}
              aria-haspopup="dialog"
              aria-expanded={popover === "menu"}
              aria-controls="market-center-popover"
              onClick={() => setPopover((current) => current === "menu" ? null : "menu")}
            >
              <img src={currentUserAvatar} alt="" />
              <span className="market-brand__presence" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div ref={marketScrollRef} className="market-scroll">
          {sellerDraftsOpen ? (
            <MarketSellerDraftCenter
              key={draftCenterRevision}
              enabled={marketLive.active && Boolean(user)}
              onCatalogChanged={() => { void marketLive.refresh(); }}
              onResume={(draft) => {
                listingIdempotencyKeyRef.current = null;
                listingUploadCacheRef.current.clear();
                setEditingOwnerDraft(draft);
                setListingOpen(true);
              }}
              onCreate={() => {
                listingIdempotencyKeyRef.current = null;
                listingUploadCacheRef.current.clear();
                setEditingOwnerDraft(null);
                setListingOpen(true);
              }}
            />
          ) : <>
          <div className="market-contentbar">
            <div className="market-search">
              <Search aria-hidden="true" />
              <input
                ref={marketSearchInputRef}
                type="search"
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  resetMarketScroll();
                  setSellerDraftsOpen(false);
                  setQuery(nextQuery);
                  if (nextQuery.trim()) setViewMode("catalog");
                }}
                placeholder="Rechercher un instrument, une marque…"
                aria-label="Rechercher dans le Market"
              />
              <button
                type="button"
                className="market-search__filter"
                aria-label={appliedFilterCount > 0
                  ? `Ouvrir les filtres du Market, ${appliedFilterCount} actif${appliedFilterCount > 1 ? "s" : ""}`
                  : "Ouvrir les filtres du Market"}
                aria-expanded={filtersOpen}
                aria-controls="market-filters-dialog"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal aria-hidden="true" />
                {appliedFilterCount > 0 && (
                  <span className="market-search__filter-count" aria-hidden="true">{appliedFilterCount}</span>
                )}
              </button>
            </div>
            <h1>{isHome ? <>La boutique où la musique <span>prend vie.</span></> : (
              <>{MARKET_PILLARS.find((pillar) => pillar.id === activePillar)?.label ?? "Market"} <span>sélection MeeWav.</span></>
            )}</h1>
            <button type="button" className="market-contextbar__create" onClick={() => {
              if (!requireMarketAccount()) return;
              setEditingOwnerDraft(null);
              setListingOpen(true);
            }}>
              <Plus aria-hidden="true" /> <span>Déposer une annonce</span>
            </button>
          </div>
          {marketLive.active && marketLive.status === "loading" ? (
            <section className="market-live-state" role="status">
              <Sparkles aria-hidden="true" />
              <div><strong>Le Market se prépare</strong><span>Catalogue, favoris et panier sont en cours de synchronisation.</span></div>
            </section>
          ) : null}
          {marketLive.active && marketLive.status === "error" ? (
            <section className="market-live-state is-error" role="alert">
              <CircleHelp aria-hidden="true" />
              <div><strong>Le Market est momentanément indisponible</strong><span>{marketLive.error?.message}</span></div>
              <button type="button" onClick={() => { void marketLive.refresh(); }}>Réessayer</button>
            </section>
          ) : null}
          {isHome && (
            <div className="market-discovery">
              <MarketRail
                id="market-featured"
                variant="featured"
                eyebrow="À la une"
                title="Le meilleur de chaque univers"
                description="Neuf, occasion, location, services et achats groupés sélectionnés pour toi."
                products={discoveryProducts}
                favorites={favorites}
                onOpen={openProduct}
                onFavorite={handleFavorite}
              />
            </div>
          )}

          {isHome ? (
            <div className="market-home-rails">
              {homeRails.map((rail) => (
                <MarketRail
                  key={rail.id}
                  id={rail.id}
                  eyebrow={rail.eyebrow}
                  title={rail.title}
                  description={rail.description}
                  products={rail.products}
                  favorites={favorites}
                  onOpen={openProduct}
                  onFavorite={handleFavorite}
                  onSeeAll={() => handlePillarChange(rail.pillarId)}
                />
              ))}
            </div>
          ) : (
          <section className="market-catalog" aria-live="polite">
            {!queryNormalized && !showFavoritesOnly && !isAllCatalog && (
              <div className="market-filter-chips" aria-label="Filtres rapides">
                {(marketLive.active ? LIVE_PILLAR_FILTERS : PILLAR_FILTERS)[activePillar].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`market-filter-chip ${activeFilter === filter ? "is-active" : ""}`}
                    aria-pressed={activeFilter === filter}
                    onClick={() => handleFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            )}

            {showFavoritesOnly && marketLive.active && marketLive.favoriteProductsStatus !== "ready" && (
              <div className={`market-private-products-state is-${marketLive.favoriteProductsStatus}`} role={marketLive.favoriteProductsStatus === "error" ? "alert" : "status"}>
                <Heart aria-hidden="true" />
                <div>
                  <strong>{marketLive.favoriteProductsStatus === "loading" || marketLive.favoriteProductsStatus === "idle"
                    ? "Synchronisation de tes favoris…"
                    : marketLive.favoriteProductsStatus === "partial"
                      ? "Certains favoris ne sont plus accessibles"
                      : "Impossible de charger tous tes favoris"}</strong>
                  <span>{marketLive.favoriteProductsStatus === "partial"
                    ? `${marketLive.favoriteProducts.length} sur ${favorites.size} favoris sont affichés. Rien n’a été retiré.`
                    : marketLive.favoriteProductsStatus === "error"
                      ? "Un incident réseau empêche la vérification. Tes favoris restent enregistrés."
                      : "Nous récupérons les annonces enregistrées sur ton compte."}</span>
                </div>
                {marketLive.favoriteProductsStatus === "error" && (
                  <button type="button" onClick={() => { void marketLive.refresh(); }}>Réessayer</button>
                )}
              </div>
            )}

            {wallProducts.length > 0 ? (
              <div className="market-product-grid">
                {wallProducts.map((product, productIndex) => {
                  const collective = product.collective;
                  const isFavorite = favorites.has(product.id);
                  const CardActionIcon = product.pillarId === "rental"
                    ? CalendarDays
                    : product.pillarId === "services" ? Sparkles : product.pillarId === "collective" ? UsersRound : ShoppingCart;
                  return (
                    <article
                      key={`${product.id}-${productIndex}`}
                      className="market-product-card"
                      data-market-pillar={product.pillarId}
                      data-market-service-kind={product.service?.kind}
                    >
                      <button type="button" className="market-product-card__main" onClick={() => openProduct(product, wallProducts)} aria-label={`Voir ${product.title}`}>
                        <div className="market-product-card__visual">
                          <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" decoding="async" />
                          <span className="market-badge">{product.badge ?? marketPillarLabels[product.pillarId]}</span>
                        </div>
                        <div className="market-product-card__body">
                          <span className="market-product-card__category">{product.category}</span>
                          <h3>{product.title}</h3>
                          <div className="market-product-card__meta">
                            <MarketCardSeller product={product} />
                            <span className="market-card-rating"><Star size={11} fill="currentColor" aria-hidden="true" /> {product.rating.score}</span>
                          </div>

                          {collective && (
                            <div className="market-product-card__collective">
                              <div className="market-product-card__collective-row">
                                <span>{collective.joined}/{collective.target} participants</span>
                                <span>{collective.progressPercent}%</span>
                              </div>
                              <div className="market-progress"><span style={{ width: `${collective.progressPercent}%` }} /></div>
                            </div>
                          )}

                          <div className="market-product-card__footer">
                            <div className="market-product-card__price">
                              <strong>{formatPrice(product.price.amount)}</strong>
                              <span>{priceUnitLabel(product.price.unit) || product.conditionLabel}</span>
                            </div>
                            <span className="market-product-card__action"><CardActionIcon aria-hidden="true" /></span>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`market-favorite-button ${isFavorite ? "is-active" : ""}`}
                        aria-label={isFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                        onClick={(event) => handleFavorite(product.id, event)}
                      >
                        <Heart aria-hidden="true" />
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (!marketLive.active || (marketLive.status === "ready" && (!showFavoritesOnly || marketLive.favoriteProductsStatus === "ready"))) ? (
              <div className="market-empty">
                <div>
                  <Search aria-hidden="true" />
                  <h3>Aucune offre dans ce filtre</h3>
                  <p>Essaie une autre catégorie ou désactive l’affichage des favoris.</p>
                </div>
              </div>
            ) : null}
            {marketLive.active && !showFavoritesOnly && marketLive.hasMore ? (
              <button
                type="button"
                className="market-load-more"
                disabled={marketLive.loadingMore}
                onClick={() => { void marketLive.loadMore(); }}
              >
                {marketLive.loadingMore ? "Chargement…" : "Afficher plus d’offres"}
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </section>
          )}
          </>}
        </div>
      </section>

      {popover === "menu" && (
        <aside
          ref={marketCenterPopoverRef}
          id="market-center-popover"
          className="market-popover market-popover--account"
          role="dialog"
          aria-label="Market Center"
          tabIndex={-1}
        >
          <div className="market-popover__title">
            {sellerName} · {sellerIdentity.sellerKind === "artist" ? "Artiste" : "Vendeur"}
          </div>
          {NAV_MENU_ITEMS.map(({ label, icon: Icon, intentRole }) => (
            <button key={label} type="button" onClick={() => {
              setPopover(null);
              if (intentRole) {
                if (!requireMarketAccount()) return;
                if (marketLive.active) {
                  setSelectedProduct(null);
                  setDrawer(null);
                  setIntentCenterRole(intentRole);
                } else {
                  setToast(`Simulation non connectée : ${label.toLocaleLowerCase("fr-FR")} sera disponible avec un compte Supabase.`);
                }
                return;
              }
              if (label === "Mes annonces") {
                if (!requireMarketAccount()) return;
                if (marketLive.active) {
                  setSelectedProduct(null);
                  setDrawer(null);
                  setShowFavoritesOnly(false);
                  setMarketFilters((filters) => ({ ...filters, favoritesOnly: false }));
                  setQuery("");
                  setSellerDraftsOpen(true);
                  window.requestAnimationFrame(resetMarketScroll);
                } else {
                  setToast("Les brouillons du compte sont disponibles avec une session Supabase.");
                }
                return;
              }
              if (label === "Mes favoris") {
                if (!requireMarketAccount()) return;
                setSellerDraftsOpen(false);
                setShowFavoritesOnly(true);
                setMarketFilters((filters) => ({ ...filters, favoritesOnly: true }));
                setViewMode("catalog");
              }
            }}>
              <Icon aria-hidden="true" /> <span>{label}</span><ChevronRight size={14} aria-hidden="true" />
            </button>
          ))}
          <button type="button" onClick={() => {
            if (!requireMarketAccount()) return;
            setPopover(null);
            setEditingOwnerDraft(null);
            setListingOpen(true);
          }}>
            <Plus aria-hidden="true" /> <span>Créer une annonce</span><ChevronRight size={14} aria-hidden="true" />
          </button>
        </aside>
      )}

      {popover === "notifications" && (
        <aside
          ref={notificationsPopoverRef}
          id="market-notifications-popover"
          className="market-popover"
          role="dialog"
          aria-labelledby="market-notifications-popover-title"
          tabIndex={-1}
        >
          <div id="market-notifications-popover-title" className="market-popover__title">{marketLive.active ? "Alertes Market" : "3 alertes Market"}</div>
          {marketLive.active ? (
            <div className="market-popover__empty">Aucune alerte Market pour le moment.</div>
          ) : <>
          <button type="button" onClick={() => setToast("Le prix du MiniFreak vient de baisser de 30 €.")}>
            <BadgeEuro aria-hidden="true" /> <span>MiniFreak : nouveau prix</span><ChevronRight size={14} />
          </button>
          <button type="button" disabled={!heroCollective && !heroProduct} onClick={() => {
            const highlightedProduct = heroCollective ?? heroProduct;
            if (highlightedProduct) openProduct(highlightedProduct);
          }}>
            <UsersRound aria-hidden="true" /> <span>Achat groupé presque débloqué</span><ChevronRight size={14} />
          </button>
          <button type="button" onClick={() => setToast("Simulation : la location Apollo Twin X est pré-validée.")}>
            <CalendarDays aria-hidden="true" /> <span>Location pré-validée · démo</span><ChevronRight size={14} />
          </button>
          </>}
        </aside>
      )}

      {selectedProduct && (
        <button
          type="button"
          className="market-overlay market-overlay--product"
          aria-hidden="true"
          tabIndex={-1}
          onClick={closeProductDetail}
        />
      )}

      {selectedProduct && selectedNarrative && (
        <article
          ref={detailModalRef}
          className="market-product-modal"
          data-market-pillar={selectedProduct.pillarId}
          data-market-service-kind={selectedProduct.service?.kind}
          role="dialog"
          aria-modal="true"
          aria-label={`Annonce ${selectedProduct.title}`}
        >
          <button
            type="button"
            className="market-product-modal__nav market-product-modal__nav--previous"
            aria-label="Annonce précédente"
            onClick={() => navigateProduct(-1)}
            disabled={detailProductIds.length <= 1}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="market-product-modal__nav market-product-modal__nav--next"
            aria-label="Annonce suivante"
            onClick={() => navigateProduct(1)}
            disabled={detailProductIds.length <= 1}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <button
            type="button"
            className="market-product-modal__close"
            aria-label="Fermer l’annonce"
            onClick={closeProductDetail}
            autoFocus
          >
            <X aria-hidden="true" />
          </button>

          <div className="market-product-modal__media">
            <img src={selectedProduct.imageUrl} alt={selectedProduct.imageAlt} />
            <span className="market-badge">{selectedProduct.badge ?? selectedProduct.conditionLabel}</span>
            {showSellerIdentityPlaque && (
              <div
                className={`market-product-modal__seller-identity ${selectedSellerGradeLevel === null ? "is-grade-hidden" : ""}`}
                aria-label={selectedSellerGradeLevel === null
                  ? `Proposé par ${selectedProduct.seller.name}`
                  : `${selectedProduct.seller.name}, grade ${selectedSellerGradeLevel}`}
              >
                {selectedSellerPortrait ? (
                  <img
                    src={selectedSellerPortrait}
                    alt={`Portrait de ${selectedProduct.seller.name}`}
                  />
                ) : (
                  <i className="market-product-modal__seller-monogram" aria-hidden="true">
                    {selectedProduct.seller.monogram || initials(selectedProduct.seller.name)}
                  </i>
                )}
                <span>
                  <small>Proposé par</small>
                  <strong>{selectedProduct.seller.name}</strong>
                </span>
                {selectedSellerGradeLevel !== null ? (
                  <MeewavGradeBadge
                    className="market-product-modal__seller-grade"
                    level={selectedSellerGradeLevel}
                    size="sm"
                    variant="icon"
                  />
                ) : null}
              </div>
            )}
            <div className="market-product-modal__media-copy">
              <span><SelectedProductIcon aria-hidden="true" /> {MARKET_PILLARS.find((pillar) => pillar.id === selectedProduct.pillarId)?.label}</span>
              <strong>{selectedProduct.brand}</strong>
              <small>{selectedProduct.location.city} · {selectedProduct.location.area}</small>
            </div>
          </div>

          <div className="market-product-modal__content">
            <header className="market-product-modal__heading" aria-live="polite">
              <div>
                <span className="market-product-modal__eyebrow">
                  <SelectedProductIcon aria-hidden="true" />
                  {selectedProduct.category}
                  <i>{selectedDetailIndex + 1} / {Math.max(1, detailProductIds.length)}</i>
                </span>
                <h2>{selectedProduct.title}</h2>
                <p>{selectedProduct.brand} · {selectedProduct.model}</p>
              </div>
              <strong>{formatPrice(selectedProduct.price.amount)}{priceUnitLabel(selectedProduct.price.unit, true)}</strong>
            </header>

            <div ref={detailScrollRef} className="market-product-modal__scroll">
              <section className="market-product-modal__story">
                <span><MessageCircle aria-hidden="true" /> {selectedNarrative.label}</span>
                <p>{selectedNarrative.text}</p>
              </section>

              {selectedProduct.collective && (
                <div className="market-product-card__collective market-product-modal__collective">
                  <div className="market-product-card__collective-row">
                    <span>{selectedProduct.collective.joined + (joinedCollectives.has(selectedProduct.id) ? 1 : 0)} / {selectedProduct.collective.target} artistes</span>
                    <span>{selectedProduct.collective.daysRemaining} jours · -{selectedProduct.collective.savingsPercent}%</span>
                  </div>
                  <div className="market-progress">
                    <span style={{ width: `${Math.min(100, selectedProduct.collective.progressPercent + (joinedCollectives.has(selectedProduct.id) ? 2 : 0))}%` }} />
                  </div>
                </div>
              )}

              <div className="market-detail__facts">
                <div className="market-detail__fact"><span>{selectedProduct.service ? "Format" : "État"}</span><strong>{selectedProduct.service?.format ?? selectedProduct.conditionLabel}</strong></div>
                <div className="market-detail__fact"><span>{selectedProduct.service ? "Disponibilité" : "Localisation"}</span><strong>{selectedProduct.service?.nextAvailability ?? `${selectedProduct.location.city} · ${selectedProduct.location.area}`}</strong></div>
                <div className="market-detail__fact"><span>Confiance</span><strong>{selectedProduct.rating.score}/5 · {selectedProduct.rating.count} avis</strong></div>
              </div>

              {selectedProduct.rental && (
                <div className="market-date-grid">
                  <div className="market-date-field">
                    <label htmlFor="market-rental-start">Départ</label>
                    <input
                      id="market-rental-start"
                      type="date"
                      value={rentalStart}
                      min={latestIsoDate(selectedProduct.rental.availableFrom, todayIsoDate())}
                      onChange={(event) => {
                        const nextStart = event.target.value;
                        const nextMinimumEnd = addIsoDateDays(nextStart, selectedProduct.rental?.minimumDays ?? 1);
                        setRentalStart(nextStart);
                        if (rentalEnd < nextMinimumEnd) setRentalEnd(nextMinimumEnd);
                      }}
                    />
                  </div>
                  <div className="market-date-field">
                    <label htmlFor="market-rental-end">Retour</label>
                    <input id="market-rental-end" type="date" value={rentalEnd} min={minimumRentalEnd} onChange={(event) => setRentalEnd(event.target.value)} />
                  </div>
                </div>
              )}

              <div className="market-detail__seller">
                <span className="market-detail__seller-avatar">
                  {selectedSellerPortrait ? (
                    <img src={selectedSellerPortrait} alt="" />
                  ) : (
                    selectedProduct.seller.monogram || initials(selectedProduct.seller.name)
                  )}
                </span>
                <div className="market-detail__seller-copy">
                  <strong>{selectedProduct.seller.name} {!marketLive.active && selectedProduct.seller.verified ? "· Vérifié (démo)" : ""}</strong>
                  <span>{selectedProduct.seller.responseTime} · {marketLive.active ? "profil public" : `${selectedProduct.seller.salesCount} transactions fictives`}</span>
                </div>
                <button type="button" className="market-close-button" aria-label={`Voir le profil de ${selectedProduct.seller.name}`} onClick={() => openSellerProfile(selectedProduct)}><UserRound /></button>
                <button type="button" className="market-close-button" aria-label="Contacter le vendeur" onClick={() => openSellerConversation(selectedProduct)}><MessageCircle /></button>
              </div>

              <div className="market-detail__guarantees">
                {marketLive.active ? <>
                  <div className="market-detail__guarantee"><ShoppingCart /> Panier et demandes synchronisés</div>
                  <div className="market-detail__guarantee"><Truck /> Remise selon les conditions de l’annonce</div>
                  {selectedProduct.rental && <div className="market-detail__guarantee"><Zap /> Dépôt indicatif {formatPrice(selectedProduct.rental.deposit)}</div>}
                  {selectedProduct.collective && <div className="market-detail__guarantee"><UsersRound /> Tarif du palier à confirmer</div>}
                </> : <>
                  <div className="market-detail__guarantee"><ShieldCheck /> Paiement sécurisé · démo</div>
                  <div className="market-detail__guarantee"><Truck /> Livraison ou retrait · démo</div>
                  {selectedProduct.rental && <div className="market-detail__guarantee"><Zap /> Caution fictive {formatPrice(selectedProduct.rental.deposit)}</div>}
                  {selectedProduct.collective && <div className="market-detail__guarantee"><UsersRound /> Prix simulé au palier</div>}
                </>}
              </div>
            </div>

            <footer className="market-product-modal__actions">
              <button
                type="button"
                className="market-secondary-cta"
                disabled={selectedFavoritePending}
                onClick={() => handleFavorite(selectedProduct.id)}
              >
                <Heart aria-hidden="true" /> {selectedFavoritePending ? "Mise à jour…" : favorites.has(selectedProduct.id) ? "Sauvegardé" : "Favori"}
              </button>
              <button type="button" className="market-secondary-cta" onClick={() => openSellerConversation(selectedProduct)}>
                <MessageCircle aria-hidden="true" /> Contacter
              </button>
              <button
                type="button"
                className="market-primary-cta"
                disabled={selectedActionPending || selectedCollectiveExpired || (selectedProduct.pillarId === "collective" && joinedCollectives.has(selectedProduct.id))}
                onClick={() => handleProductAction(selectedProduct)}
              >
                {selectedProduct.pillarId === "rental" ? <CalendarDays /> : selectedProduct.pillarId === "services" ? <Sparkles /> : selectedProduct.pillarId === "collective" ? <UsersRound /> : <ShoppingCart />}
                {selectedActionPending ? "Envoi…" : actionLabel}
              </button>
            </footer>
          </div>
        </article>
      )}

      {drawer === "cart" && (
        <MarketCartPanel
          cart={cart}
          products={marketLive.active ? marketLive.cartProducts : marketProducts}
          productsStatus={marketLive.active ? marketLive.cartProductsStatus : "ready"}
          pricingMode={marketLive.active ? "live" : "demo"}
          pendingProductIds={pendingCartProductIds}
          onRetryProducts={marketLive.active ? marketLive.refresh : undefined}
          onClose={() => setDrawer(null)}
          onContinueShopping={() => setDrawer(null)}
          onQuantityChange={handleCartQuantityChange}
          onRemove={handleRemoveFromCart}
          onCheckout={({ itemCount, total }) => {
            setDrawer(null);
            setToast(`${itemCount} article${itemCount > 1 ? "s" : ""} · commande de démonstration à ${formatPrice(total)} prête pour le paiement.`);
          }}
          checkoutEnabled={!marketLive.active}
          checkoutLabel={marketLive.active ? "Paiement non disponible" : "Continuer vers le paiement démo"}
          footerNote={marketLive.active
            ? "Le panier est synchronisé. Aucun paiement n’est initié dans cette version."
            : "Démonstration : aucun débit ne sera effectué."}
        />
      )}

      {intentCenterRole && marketLive.active && (
        <MarketIntentCenter
          initialRole={intentCenterRole}
          onClose={closeIntentCenter}
          onIntentChanged={() => { void marketLive.refresh(); }}
        />
      )}

      {filtersOpen && (
        <MarketFiltersPanel
          products={marketProducts}
          initialFilters={marketFilters}
          contextPillar={isHome || queryNormalized || isAllCatalog ? "all" : activePillar}
          lockPillar={!isHome && !queryNormalized && !isAllCatalog}
          favoriteIds={favorites}
          title="Filtres Market"
          viewer={{
            name: sellerName,
            role: sellerIdentity.sellerKind === "artist" ? "Artiste Meewav" : "Vendeur Meewav",
            imageUrl: currentUserAvatar,
          }}
          serverBackedResults={marketLive.active}
          distanceSortAvailable={!marketLive.active || marketLive.catalogCapabilities.sorts.distance.supported}
          onClose={() => setFiltersOpen(false)}
          onApply={(nextFilters, results) => {
            setMarketFilters(nextFilters);
            setShowFavoritesOnly(nextFilters.favoritesOnly);
            if (nextFilters.pillarId !== "all") setActivePillar(nextFilters.pillarId);
            setActiveFilter("Tout");
            setViewMode("catalog");
            resetMarketScroll();
            setFiltersOpen(false);
            setToast(marketLive.active
              ? "Filtres appliqués à tout le catalogue Market."
              : `${results.length} offre${results.length > 1 ? "s" : ""} affichée${results.length > 1 ? "s" : ""} avec tes filtres.`);
          }}
        />
      )}

      {listingOpen && (
        <MarketListingComposer
          key={editingOwnerDraft ? `${editingOwnerDraft.listingId}:${editingOwnerDraft.version}` : "new-listing"}
          initialPillar={editingOwnerDraft || sellerDraftsOpen || isHome ? undefined : activePillar}
          initialDraft={editingOwnerDraft ? toMarketListingDraftResumePatch(editingOwnerDraft) : undefined}
          onClose={closeListingComposer}
          onCreateAnother={editingOwnerDraft ? () => {
            listingIdempotencyKeyRef.current = null;
            listingUploadCacheRef.current.clear();
            setEditingOwnerDraft(null);
          } : undefined}
          draftOwnerKey={`${user?.id ?? "local-preview"}:${editingOwnerDraft?.listingId ?? "new"}`}
          publicationMode={marketLive.active ? "supabase" : "demo"}
          sellerIdentity={sellerIdentity}
          sellerIdentityLocked={marketLive.active}
          allowDemoMedia={!marketLive.active}
          onPublish={publishListing}
        />
      )}

      {toast && <div className="market-toast" role="status"><CheckCircle2 aria-hidden="true" /> {toast}</div>}
    </main>
  );
}
