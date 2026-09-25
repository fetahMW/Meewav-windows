import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMarketplaceViewerState,
  mapMarketplaceCatalogRows,
  mapMarketplaceViewerState,
} from "./market.adapters";
import { resolveMarketRuntimeMode, type MarketRuntimeMode } from "./market.flags";
import {
  createMarketplaceIdempotencyKey,
  DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES,
  marketplaceCatalogCursorFromRow,
  marketplaceRepository,
  normalizeMarketplaceCatalogFilters,
  resolveMarketplaceCatalogSort,
  type MarketplaceRepository,
} from "./market.service";
import { toMarketplaceServiceError } from "./market.errors";
import type { MarketProductView } from "./marketDemoData";
import type {
  MarketplaceCatalogCursor,
  MarketplaceCatalogInput,
  MarketplaceCatalogSortFallback,
  MarketplaceIntentResult,
  MarketplaceSellerKind,
} from "./market.types";

export type MarketLiveStatus = "idle" | "loading" | "ready" | "error";
export type MarketPrivateProductsStatus = "idle" | "loading" | "ready" | "partial" | "error";
export type MarketCartProductsStatus = MarketPrivateProductsStatus;

export type MarketLiveUserError = {
  code: string;
  message: string;
};

export type UseMarketLiveOptions = {
  enabled?: boolean;
  viewerId?: string | null;
  mode?: MarketRuntimeMode;
  repository?: MarketplaceRepository;
  catalog?: MarketplaceCatalogInput;
};

type CoalescedMutationQueue<T> = {
  desired: T;
  confirmed: T;
  running: boolean;
  cancelled: boolean;
  waiters: Array<(success: boolean) => void>;
};

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  invalid_request: "Cette action Marketplace n’est pas valide.",
  unauthenticated: "Reconnecte-toi pour continuer dans le Marketplace.",
  forbidden: "Tu n’as pas l’autorisation d’effectuer cette action.",
  not_found: "Cette annonce n’est plus disponible.",
  conflict: "L’annonce a changé. Actualise-la avant de continuer.",
  rate_limited: "Trop de demandes rapprochées. Réessaie dans un instant.",
  load_failed: "Impossible de charger le Marketplace pour le moment.",
  mutation_failed: "L’action n’a pas pu être enregistrée. Rien n’a été perdu.",
};

const PRIVATE_PRODUCTS_HYDRATION_BATCH_SIZE = 100;

function userError(error: unknown, fallback: "load_failed" | "mutation_failed"): MarketLiveUserError {
  const normalized = toMarketplaceServiceError(error, fallback);
  return {
    code: normalized.code,
    message: ERROR_MESSAGES[normalized.code] ?? ERROR_MESSAGES[fallback],
  };
}

function mergeProducts(current: MarketProductView[], incoming: MarketProductView[]) {
  const byId = new Map(current.map((product) => [product.id, product]));
  incoming.forEach((product) => byId.set(product.id, product));
  return [...byId.values()];
}

export function useMarketLive({
  enabled = true,
  viewerId = null,
  mode = resolveMarketRuntimeMode(),
  repository = marketplaceRepository,
  catalog = {},
}: UseMarketLiveOptions = {}) {
  // Public listings remain server-backed even before sign-in. `enabled` only
  // authorizes loading and mutating the viewer's private Market state.
  const active = mode === "supabase";
  const limit = catalog.limit ?? 48;
  const pillar = catalog.pillar ?? null;
  const categoryCode = catalog.categoryCode?.trim() || null;
  const search = catalog.search?.trim() || null;
  const hasCatalogFilters = catalog.filters !== null && catalog.filters !== undefined;
  const normalizedCatalogFiltersValue = normalizeMarketplaceCatalogFilters(catalog.filters);
  const catalogFiltersKey = JSON.stringify(normalizedCatalogFiltersValue);
  const catalogFilters = useMemo(
    () => JSON.parse(catalogFiltersKey) as ReturnType<typeof normalizeMarketplaceCatalogFilters>,
    [catalogFiltersKey],
  );
  const catalogSortFallback: MarketplaceCatalogSortFallback | null = useMemo(
    () => resolveMarketplaceCatalogSort(
      catalogFilters.sort,
      DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES,
    ).fallback,
    [catalogFilters.sort],
  );

  const [baseProducts, setBaseProducts] = useState<MarketProductView[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [productCache, setProductCache] = useState<Map<string, MarketProductView>>(new Map());
  const [cartProductsStatus, setCartProductsStatus] = useState<MarketCartProductsStatus>("idle");
  const [favoriteProductsStatus, setFavoriteProductsStatus] = useState<MarketPrivateProductsStatus>("idle");
  const [joinedCollectives, setJoinedCollectives] = useState<Set<string>>(new Set());
  const [sellerKind, setSellerKind] = useState<MarketplaceSellerKind | null>(null);
  const [status, setStatus] = useState<MarketLiveStatus>("idle");
  const [error, setError] = useState<MarketLiveUserError | null>(null);
  const [actionError, setActionError] = useState<MarketLiveUserError | null>(null);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [lastIntent, setLastIntent] = useState<MarketplaceIntentResult | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const favoritesRef = useRef(favorites);
  const cartRef = useRef(cart);
  const productCacheRef = useRef(productCache);
  const joinedRef = useRef(joinedCollectives);
  const cursorRef = useRef<MarketplaceCatalogCursor | null>(null);
  const loadRequestRef = useRef(0);
  const cartHydrationRequestRef = useRef(0);
  const favoriteHydrationRequestRef = useRef(0);
  const mutationTokensRef = useRef(new Map<string, symbol>());
  const viewerStateRevisionRef = useRef(0);
  const favoriteQueuesRef = useRef(new Map<string, CoalescedMutationQueue<boolean>>());
  const cartQueuesRef = useRef(new Map<string, CoalescedMutationQueue<number>>());
  const pendingActionsRef = useRef(pendingActions);

  const replaceFavorites = useCallback((updater: (current: Set<string>) => Set<string>) => {
    setFavorites((current) => {
      const next = updater(current);
      favoritesRef.current = next;
      return next;
    });
  }, []);

  const replaceCart = useCallback((updater: (current: Map<string, number>) => Map<string, number>) => {
    setCart((current) => {
      const next = updater(current);
      cartRef.current = next;
      return next;
    });
  }, []);

  const cacheProducts = useCallback((incoming: readonly MarketProductView[]) => {
    if (incoming.length === 0) return;
    setProductCache((current) => {
      const next = new Map(current);
      incoming.forEach((product) => next.set(product.id, product));
      productCacheRef.current = next;
      return next;
    });
  }, []);

  const replaceJoinedCollectives = useCallback((updater: (current: Set<string>) => Set<string>) => {
    setJoinedCollectives((current) => {
      const next = updater(current);
      joinedRef.current = next;
      return next;
    });
  }, []);

  const replacePendingActions = useCallback((updater: (current: Set<string>) => Set<string>) => {
    setPendingActions((current) => {
      const next = updater(current);
      pendingActionsRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    viewerStateRevisionRef.current += 1;
    favoritesRef.current = new Set();
    cartRef.current = new Map();
    joinedRef.current = new Set();
    setFavorites(new Set());
    setCart(new Map());
    setJoinedCollectives(new Set());
    setSellerKind(null);
    favoriteQueuesRef.current.forEach((queue) => {
      queue.cancelled = true;
      queue.waiters.splice(0).forEach((resolve) => resolve(false));
    });
    cartQueuesRef.current.forEach((queue) => {
      queue.cancelled = true;
      queue.waiters.splice(0).forEach((resolve) => resolve(false));
    });
    favoriteQueuesRef.current.clear();
    cartQueuesRef.current.clear();
    mutationTokensRef.current.clear();
    pendingActionsRef.current = new Set();
    setPendingActions(new Set());
    setLastIntent(null);
  }, [active, viewerId]);

  const load = useCallback(async (append = false) => {
    if (!active) return false;
    if (append && !cursorRef.current) return false;
    const requestId = ++loadRequestRef.current;
    const viewerStateRevision = viewerStateRevisionRef.current;
    if (append) setLoadingMore(true);
    else {
      setStatus("loading");
      setBaseProducts([]);
      cursorRef.current = null;
    }
    setError(null);

    try {
      const [rows, viewerState, loadedSellerKind] = await Promise.all([
        repository.listCatalog({
          cursor: append ? cursorRef.current : null,
          limit,
          pillar,
          categoryCode,
          search,
          ...(hasCatalogFilters ? { filters: catalogFilters } : {}),
        }),
        append || !enabled ? Promise.resolve(null) : repository.getViewerState(),
        append || !enabled ? Promise.resolve(null) : repository.getSellerKind(),
      ]);
      if (requestId !== loadRequestRef.current) return false;

      const mapped = mapMarketplaceCatalogRows(rows);
      cacheProducts(mapped);
      const nextCursor = rows.length > 0 ? marketplaceCatalogCursorFromRow(rows[rows.length - 1]) : null;
      cursorRef.current = nextCursor;
      setHasMore(Boolean(nextCursor));
      setBaseProducts((current) => append ? mergeProducts(current, mapped) : mapped);
      if (!enabled && !append) {
        favoritesRef.current = new Set();
        cartRef.current = new Map();
        joinedRef.current = new Set();
        setFavorites(new Set());
        setCart(new Map());
        setJoinedCollectives(new Set());
        setSellerKind(null);
      } else if (loadedSellerKind) setSellerKind(loadedSellerKind);

      const viewerMutationPending = favoriteQueuesRef.current.size > 0
        || cartQueuesRef.current.size > 0
        || [...mutationTokensRef.current.keys()].some((key) => key.startsWith("collective:"));
      if (viewerState
        && viewerStateRevisionRef.current === viewerStateRevision
        && !viewerMutationPending) {
        const mappedState = mapMarketplaceViewerState(viewerState);
        favoritesRef.current = mappedState.favorites;
        cartRef.current = mappedState.cart;
        joinedRef.current = mappedState.joinedCollectives;
        setFavorites(mappedState.favorites);
        setCart(mappedState.cart);
        setJoinedCollectives(mappedState.joinedCollectives);
      }
      setStatus("ready");
      return true;
    } catch (caught) {
      if (requestId !== loadRequestRef.current) return false;
      setError(userError(caught, "load_failed"));
      setStatus("error");
      setHasMore(false);
      cursorRef.current = null;
      return false;
    } finally {
      if (requestId === loadRequestRef.current) setLoadingMore(false);
    }
  }, [active, enabled, viewerId, cacheProducts, catalogFilters, categoryCode, hasCatalogFilters, limit, pillar, repository, search]);

  useEffect(() => {
    if (!active) {
      ++loadRequestRef.current;
      setBaseProducts([]);
      setFavorites(new Set());
      setCart(new Map());
      setProductCache(new Map());
      setCartProductsStatus("idle");
      setFavoriteProductsStatus("idle");
      setJoinedCollectives(new Set());
      setSellerKind(null);
      favoritesRef.current = new Set();
      cartRef.current = new Map();
      productCacheRef.current = new Map();
      joinedRef.current = new Set();
      cursorRef.current = null;
      ++cartHydrationRequestRef.current;
      ++favoriteHydrationRequestRef.current;
      mutationTokensRef.current.clear();
      viewerStateRevisionRef.current += 1;
      favoriteQueuesRef.current.forEach((queue) => {
        queue.cancelled = true;
        queue.waiters.splice(0).forEach((resolve) => resolve(false));
      });
      cartQueuesRef.current.forEach((queue) => {
        queue.cancelled = true;
        queue.waiters.splice(0).forEach((resolve) => resolve(false));
      });
      favoriteQueuesRef.current.clear();
      cartQueuesRef.current.clear();
      setStatus("idle");
      setError(null);
      setActionError(null);
      setPendingActions(new Set());
      pendingActionsRef.current = new Set();
      setLastIntent(null);
      setHasMore(false);
      setLoadingMore(false);
      return;
    }
    void load(false);
  }, [active, load]);

  useEffect(() => {
    if (!active) return;
    if (status === "idle" || status === "loading") {
      setCartProductsStatus(status === "loading" ? "loading" : "idle");
      return;
    }
    if (status === "error") {
      setCartProductsStatus("error");
      return;
    }

    const listingIds = [...cart.keys()];
    if (listingIds.length === 0) {
      ++cartHydrationRequestRef.current;
      setCartProductsStatus("ready");
      return;
    }

    const missingAtStart = listingIds.filter((listingId) => !productCacheRef.current.has(listingId));
    if (missingAtStart.length === 0) {
      ++cartHydrationRequestRef.current;
      setCartProductsStatus("ready");
      return;
    }

    const requestId = ++cartHydrationRequestRef.current;
    let cancelled = false;
    setCartProductsStatus("loading");

    const hydrate = async () => {
      const missing = new Set(missingAtStart);
      const found: MarketProductView[] = [];

      try {
        for (let offset = 0; offset < missingAtStart.length; offset += PRIVATE_PRODUCTS_HYDRATION_BATCH_SIZE) {
          const listingIds = missingAtStart.slice(offset, offset + PRIVATE_PRODUCTS_HYDRATION_BATCH_SIZE);
          const rows = await repository.listCatalog({
            listingIds,
            limit: listingIds.length,
          });
          if (cancelled || requestId !== cartHydrationRequestRef.current) return;

          const mapped = mapMarketplaceCatalogRows(rows);
          mapped.forEach((product) => {
            if (!missing.delete(product.id)) return;
            found.push(product);
          });
        }

        if (cancelled || requestId !== cartHydrationRequestRef.current) return;
        cacheProducts(found);
        setCartProductsStatus(missing.size === 0 ? "ready" : "partial");
      } catch {
        if (cancelled || requestId !== cartHydrationRequestRef.current) return;
        cacheProducts(found);
        setCartProductsStatus("error");
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [active, cacheProducts, cart, repository, status]);

  useEffect(() => {
    if (!active) return;
    if (status === "idle" || status === "loading") {
      setFavoriteProductsStatus(status === "loading" ? "loading" : "idle");
      return;
    }
    if (status === "error") {
      setFavoriteProductsStatus("error");
      return;
    }

    const listingIds = [...favorites];
    if (listingIds.length === 0) {
      ++favoriteHydrationRequestRef.current;
      setFavoriteProductsStatus("ready");
      return;
    }

    const missingAtStart = listingIds.filter((listingId) => !productCacheRef.current.has(listingId));
    if (missingAtStart.length === 0) {
      ++favoriteHydrationRequestRef.current;
      setFavoriteProductsStatus("ready");
      return;
    }

    const requestId = ++favoriteHydrationRequestRef.current;
    let cancelled = false;
    setFavoriteProductsStatus("loading");

    const hydrate = async () => {
      const missing = new Set(missingAtStart);
      const found: MarketProductView[] = [];

      try {
        for (let offset = 0; offset < missingAtStart.length; offset += PRIVATE_PRODUCTS_HYDRATION_BATCH_SIZE) {
          const ids = missingAtStart.slice(offset, offset + PRIVATE_PRODUCTS_HYDRATION_BATCH_SIZE);
          const rows = await repository.listCatalog({
            listingIds: ids,
            limit: ids.length,
          });
          if (cancelled || requestId !== favoriteHydrationRequestRef.current) return;

          const mapped = mapMarketplaceCatalogRows(rows);
          mapped.forEach((product) => {
            if (!missing.delete(product.id)) return;
            found.push(product);
          });
        }

        if (cancelled || requestId !== favoriteHydrationRequestRef.current) return;
        cacheProducts(found);
        setFavoriteProductsStatus(missing.size === 0 ? "ready" : "partial");
      } catch {
        if (cancelled || requestId !== favoriteHydrationRequestRef.current) return;
        cacheProducts(found);
        setFavoriteProductsStatus("error");
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [active, cacheProducts, favorites, repository, status]);

  const products = useMemo(() => {
    const state = {
      favorite_listing_ids: [...favorites],
      cart_items: [...cart].map(([listing_id, quantity]) => ({ listing_id, quantity })),
    };
    return baseProducts.map((product) => applyMarketplaceViewerState(product, state));
  }, [baseProducts, cart, favorites]);

  const cartProducts = useMemo(() => [...cart.keys()].flatMap((listingId) => {
    const product = productCache.get(listingId);
    return product ? [applyMarketplaceViewerState(product, {
      favorite_listing_ids: [...favorites],
      cart_items: [...cart].map(([listing_id, quantity]) => ({ listing_id, quantity })),
    })] : [];
  }), [cart, favorites, productCache]);

  const favoriteProducts = useMemo(() => [...favorites].flatMap((listingId) => {
    const product = productCache.get(listingId);
    return product ? [applyMarketplaceViewerState(product, {
      favorite_listing_ids: [...favorites],
      cart_items: [...cart].map(([listing_id, quantity]) => ({ listing_id, quantity })),
    })] : [];
  }), [cart, favorites, productCache]);

  const beginMutation = useCallback((key: string) => {
    const token = Symbol(key);
    mutationTokensRef.current.set(key, token);
    setActionError(null);
    replacePendingActions((current) => new Set(current).add(key));
    return token;
  }, [replacePendingActions]);

  const isLatestMutation = useCallback((key: string, token: symbol) => (
    mutationTokensRef.current.get(key) === token
  ), []);

  const finishMutation = useCallback((key: string, token: symbol) => {
    if (mutationTokensRef.current.get(key) !== token) return;
    mutationTokensRef.current.delete(key);
    replacePendingActions((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  }, [replacePendingActions]);

  const runFavoriteQueue = useCallback(async (
    listingId: string,
    queue: CoalescedMutationQueue<boolean>,
  ) => {
    if (queue.running) return;
    queue.running = true;
    const mutationKey = `favorite:${listingId}`;
    setActionError(null);
    replacePendingActions((current) => new Set(current).add(mutationKey));
    let success = true;
    // Let synchronous clicks collapse to their final desired value before the
    // first network call. Changes arriving in-flight are serialized below.
    await Promise.resolve();
    try {
      while (!queue.cancelled && queue.desired !== queue.confirmed) {
        const target = queue.desired;
        try {
          const result = await repository.setFavorite(
            listingId,
            target,
            createMarketplaceIdempotencyKey("favorite"),
          );
          if (result.listing_id !== listingId || result.favorite !== target) {
            throw toMarketplaceServiceError(null, "mutation_failed");
          }
          queue.confirmed = target;
        } catch (caught) {
          if (queue.cancelled) break;
          // A superseded failure is harmless when the latest desired value is
          // already the last server-confirmed value.
          if (target !== queue.desired || queue.desired === queue.confirmed) continue;
          success = false;
          setActionError(userError(caught, "mutation_failed"));
          break;
        }
      }
      if (!queue.cancelled) {
        const displayed = success ? queue.desired : queue.confirmed;
        replaceFavorites((current) => {
          const next = new Set(current);
          if (displayed) next.add(listingId);
          else next.delete(listingId);
          return next;
        });
      }
    } finally {
      viewerStateRevisionRef.current += 1;
      if (favoriteQueuesRef.current.get(listingId) === queue) {
        favoriteQueuesRef.current.delete(listingId);
      }
      replacePendingActions((current) => {
        const next = new Set(current);
        next.delete(mutationKey);
        return next;
      });
      queue.waiters.splice(0).forEach((resolve) => resolve(
        success && !queue.cancelled && queue.desired === queue.confirmed,
      ));
    }
  }, [replaceFavorites, replacePendingActions, repository]);

  const toggleFavorite = useCallback((listingId: string, nextFavorite?: boolean) => {
    if (!active || !enabled) return Promise.resolve(false);
    let queue = favoriteQueuesRef.current.get(listingId);
    if (!queue) {
      const confirmed = favoritesRef.current.has(listingId);
      queue = { desired: confirmed, confirmed, running: false, cancelled: false, waiters: [] };
      favoriteQueuesRef.current.set(listingId, queue);
    }
    queue.desired = nextFavorite ?? !queue.desired;
    viewerStateRevisionRef.current += 1;
    replaceFavorites((current) => {
      const next = new Set(current);
      if (queue?.desired) next.add(listingId);
      else next.delete(listingId);
      return next;
    });
    const result = new Promise<boolean>((resolve) => queue?.waiters.push(resolve));
    void runFavoriteQueue(listingId, queue);
    return result;
  }, [active, enabled, replaceFavorites, runFavoriteQueue]);

  const runCartQueue = useCallback(async (
    listingId: string,
    queue: CoalescedMutationQueue<number>,
  ) => {
    if (queue.running) return;
    queue.running = true;
    const mutationKey = `cart:${listingId}`;
    setActionError(null);
    replacePendingActions((current) => new Set(current).add(mutationKey));
    let success = true;
    await Promise.resolve();
    try {
      while (!queue.cancelled && queue.desired !== queue.confirmed) {
        const target = queue.desired;
        try {
          const result = await repository.setCartQuantity(
            listingId,
            target,
            createMarketplaceIdempotencyKey("cart"),
          );
          if (result.listing_id !== listingId || result.quantity !== target) {
            throw toMarketplaceServiceError(null, "mutation_failed");
          }
          queue.confirmed = target;
        } catch (caught) {
          if (queue.cancelled) break;
          if (target !== queue.desired || queue.desired === queue.confirmed) continue;
          success = false;
          setActionError(userError(caught, "mutation_failed"));
          break;
        }
      }
      if (!queue.cancelled) {
        const displayed = success ? queue.desired : queue.confirmed;
        replaceCart((current) => {
          const next = new Map(current);
          if (displayed > 0) next.set(listingId, displayed);
          else next.delete(listingId);
          return next;
        });
      }
    } finally {
      viewerStateRevisionRef.current += 1;
      if (cartQueuesRef.current.get(listingId) === queue) {
        cartQueuesRef.current.delete(listingId);
      }
      replacePendingActions((current) => {
        const next = new Set(current);
        next.delete(mutationKey);
        return next;
      });
      queue.waiters.splice(0).forEach((resolve) => resolve(
        success && !queue.cancelled && queue.desired === queue.confirmed,
      ));
    }
  }, [replaceCart, replacePendingActions, repository]);

  const setCartQuantity = useCallback((listingId: string, quantity: number) => {
    if (!active || !enabled || !Number.isInteger(quantity) || quantity < 0 || quantity > 99) {
      return Promise.resolve(false);
    }
    let queue = cartQueuesRef.current.get(listingId);
    if (!queue) {
      const confirmed = cartRef.current.get(listingId) ?? 0;
      queue = { desired: confirmed, confirmed, running: false, cancelled: false, waiters: [] };
      cartQueuesRef.current.set(listingId, queue);
    }
    queue.desired = quantity;
    viewerStateRevisionRef.current += 1;
    replaceCart((current) => {
      const next = new Map(current);
      if (quantity > 0) next.set(listingId, quantity);
      else next.delete(listingId);
      return next;
    });
    const result = new Promise<boolean>((resolve) => queue?.waiters.push(resolve));
    void runCartQueue(listingId, queue);
    return result;
  }, [active, enabled, replaceCart, runCartQueue]);

  const joinCollective = useCallback(async (listingId: string, quantity = 1) => {
    if (!active || !enabled || !Number.isInteger(quantity) || quantity < 1) return false;
    if (joinedRef.current.has(listingId)) return true;
    const mutationKey = `collective:${listingId}`;
    const token = beginMutation(mutationKey);
    viewerStateRevisionRef.current += 1;
    setLastIntent(null);
    replaceJoinedCollectives((current) => new Set(current).add(listingId));
    try {
      const result = await repository.joinCollective({
        listingId,
        quantity,
        idempotencyKey: createMarketplaceIdempotencyKey("collective"),
      });
      if (isLatestMutation(mutationKey, token)) setLastIntent(result);
      return true;
    } catch (caught) {
      if (isLatestMutation(mutationKey, token)) {
        replaceJoinedCollectives((current) => {
          const next = new Set(current);
          next.delete(listingId);
          return next;
        });
        setActionError(userError(caught, "mutation_failed"));
      }
      return false;
    } finally {
      viewerStateRevisionRef.current += 1;
      finishMutation(mutationKey, token);
    }
  }, [active, enabled, beginMutation, finishMutation, isLatestMutation, replaceJoinedCollectives, repository]);

  const requestRental = useCallback(async (
    listingId: string,
    startsOn: string,
    endsOn: string,
    note?: string | null,
  ) => {
    if (!active || !enabled) return null;
    const mutationKey = `rental:${listingId}`;
    const token = beginMutation(mutationKey);
    setLastIntent(null);
    try {
      const result = await repository.createRentalRequest({
        listingId,
        startsOn,
        endsOn,
        note,
        idempotencyKey: createMarketplaceIdempotencyKey("rental"),
      });
      if (isLatestMutation(mutationKey, token)) setLastIntent(result);
      return result;
    } catch (caught) {
      if (isLatestMutation(mutationKey, token)) {
        setActionError(userError(caught, "mutation_failed"));
      }
      return null;
    } finally {
      finishMutation(mutationKey, token);
    }
  }, [active, enabled, beginMutation, finishMutation, isLatestMutation, repository]);

  const bookService = useCallback(async (
    listingId: string,
    requestedFor?: string | null,
    note?: string | null,
  ) => {
    if (!active || !enabled) return null;
    const mutationKey = `service:${listingId}`;
    const token = beginMutation(mutationKey);
    setLastIntent(null);
    try {
      const result = await repository.createServiceBooking({
        listingId,
        requestedFor,
        note,
        idempotencyKey: createMarketplaceIdempotencyKey("service"),
      });
      if (isLatestMutation(mutationKey, token)) setLastIntent(result);
      return result;
    } catch (caught) {
      if (isLatestMutation(mutationKey, token)) {
        setActionError(userError(caught, "mutation_failed"));
      }
      return null;
    } finally {
      finishMutation(mutationKey, token);
    }
  }, [active, enabled, beginMutation, finishMutation, isLatestMutation, repository]);

  const clearActionError = useCallback(() => {
    setActionError(null);
    setLastIntent(null);
  }, []);

  const isActionPending = useCallback((key: string) => pendingActionsRef.current.has(key), []);
  const isFavoritePending = useCallback(
    (listingId: string) => pendingActionsRef.current.has(`favorite:${listingId}`),
    [],
  );
  const isCartPending = useCallback(
    (listingId: string) => pendingActionsRef.current.has(`cart:${listingId}`),
    [],
  );

  return {
    active,
    mode,
    status,
    error,
    actionError,
    pendingActions,
    isActionPending,
    isFavoritePending,
    isCartPending,
    lastIntent,
    products,
    cartProducts,
    cartProductsStatus,
    favoriteProducts,
    favoriteProductsStatus,
    favorites,
    cart,
    joinedCollectives,
    sellerKind,
    hasMore,
    loadingMore,
    catalogCapabilities: DEFAULT_MARKETPLACE_CATALOG_CAPABILITIES,
    catalogSortFallback,
    refresh: () => load(false),
    loadMore: () => load(true),
    toggleFavorite,
    setCartQuantity,
    joinCollective,
    requestRental,
    bookService,
    clearActionError,
  };
}
