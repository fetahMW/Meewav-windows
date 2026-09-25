import {
  Check,
  ChevronRight,
  CreditCard,
  LockKeyhole,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MarketProductView } from "./marketDemoData";
import type { MarketCartProductsStatus } from "./useMarketLive";
import "./market-cart.css";

export type MarketCartDeliveryMode = "shipping" | "pickup";

export interface MarketCartCheckoutSummary {
  itemCount: number;
  lineCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryMode: MarketCartDeliveryMode;
}

export interface MarketCartPanelProps {
  cart: ReadonlyMap<string, number>;
  products: readonly MarketProductView[];
  productsStatus?: MarketCartProductsStatus;
  pricingMode?: "demo" | "live";
  pendingProductIds?: ReadonlySet<string>;
  onRetryProducts?: () => void;
  onClose: () => void;
  onContinueShopping: () => void;
  onQuantityChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
  onCheckout: (summary: MarketCartCheckoutSummary) => void;
  onDeliveryModeChange?: (mode: MarketCartDeliveryMode) => void;
  initialDeliveryMode?: MarketCartDeliveryMode;
  checkoutLabel?: string;
  checkoutEnabled?: boolean;
  footerNote?: string;
  className?: string;
}

interface MarketCartLine {
  product: MarketProductView;
  quantity: number;
}

const FREE_SHIPPING_THRESHOLD = 750;
const STANDARD_SHIPPING_FEE = 14.9;

function formatPrice(amount: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getPillarLabel(product: MarketProductView) {
  return product.pillarId === "used" ? "Occasion" : "Neuf";
}

function getAvailabilityLabel(product: MarketProductView, quantity: number) {
  const remaining = Math.max(0, product.cart.maxQuantity - quantity);
  const inventory = product.pillarId === "used" || product.cart.maxQuantity === 1
    ? "Pièce unique"
    : remaining <= 2
      ? `${remaining} encore disponible${remaining > 1 ? "s" : ""}`
      : "En stock";
  const preparation = typeof product.preparationDays !== "number"
    ? "délai de préparation à confirmer"
    : product.preparationDays <= 0
      ? "préparation annoncée le jour même"
      : `préparation annoncée sous ${product.preparationDays} jour${product.preparationDays > 1 ? "s" : ""}`;
  return `${inventory} · ${preparation}`;
}

export function MarketCartPanel({
  cart,
  products,
  productsStatus = "ready",
  pricingMode = "demo",
  pendingProductIds = new Set<string>(),
  onRetryProducts,
  onClose,
  onContinueShopping,
  onQuantityChange,
  onRemove,
  onCheckout,
  onDeliveryModeChange,
  initialDeliveryMode = "shipping",
  checkoutLabel = "Continuer vers le paiement",
  checkoutEnabled = true,
  footerNote = "Démonstration : aucun débit ne sera effectué.",
  className = "",
}: MarketCartPanelProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const shippingButtonRef = useRef<HTMLButtonElement>(null);
  const pickupButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const [deliveryMode, setDeliveryMode] = useState<MarketCartDeliveryMode>(initialDeliveryMode);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const lines = useMemo<MarketCartLine[]>(() => {
    const productsById = new Map(products.map((product) => [product.id, product]));
    return [...cart.entries()].flatMap(([productId, rawQuantity]) => {
      const product = productsById.get(productId);
      if (!product || rawQuantity <= 0) return [];
      return [{ product, quantity: Math.min(rawQuantity, Math.max(1, product.cart.maxQuantity)) }];
    });
  }, [cart, products]);

  const unresolvedEntries = useMemo(() => {
    const productIds = new Set(products.map((product) => product.id));
    return [...cart.entries()].filter(([productId, quantity]) => quantity > 0 && !productIds.has(productId));
  }, [cart, products]);
  const itemCount = [...cart.values()].reduce((total, quantity) => total + Math.max(0, quantity), 0);
  const subtotal = lines.reduce((total, line) => total + line.product.price.amount * line.quantity, 0);
  const shippingAvailable = lines.length > 0 && lines.every(({ product }) => (
    product.location.shipping
    && (pricingMode === "demo" || typeof product.shippingAmount === "number")
  ));
  const pickupAvailable = lines.length > 0 && lines.every(({ product }) => product.location.pickup);
  const liveShippingFee = lines.reduce((totalFee, { product, quantity }) => (
    totalFee + (product.shippingAmount ?? 0) * (product.price.unit === "item" ? quantity : 1)
  ), 0);
  const deliveryFee = deliveryMode !== "shipping" || !shippingAvailable
    ? 0
    : pricingMode === "live"
      ? liveShippingFee
      : subtotal < FREE_SHIPPING_THRESHOLD ? STANDARD_SHIPPING_FEE : 0;
  const total = subtotal + deliveryFee;
  const amountUntilFreeShipping = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const selectedDeliveryAvailable = deliveryMode === "shipping"
    ? shippingAvailable
    : pickupAvailable;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const inertedSiblings: Array<{ element: HTMLElement; wasInert: boolean }> = [];
    let activeBranch: HTMLElement | null = layerRef.current;
    while (activeBranch?.parentElement) {
      const parent: HTMLElement = activeBranch.parentElement;
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === activeBranch) continue;
        inertedSiblings.push({ element: sibling, wasInert: sibling.inert });
        sibling.inert = true;
      }
      activeBranch = parent;
      if (parent === document.body) break;
    }
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden") && element.getClientRects().length > 0);
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
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      inertedSiblings.forEach(({ element, wasInert }) => {
        element.inert = wasInert;
      });
      previouslyFocused?.focus();
    };
  }, []);

  useEffect(() => {
    if (lines.length === 0) return;
    if (deliveryMode === "shipping" && !shippingAvailable && pickupAvailable) setDeliveryMode("pickup");
    if (deliveryMode === "pickup" && !pickupAvailable && shippingAvailable) setDeliveryMode("shipping");
  }, [deliveryMode, lines.length, pickupAvailable, shippingAvailable]);

  const chooseDeliveryMode = (mode: MarketCartDeliveryMode) => {
    setDeliveryMode(mode);
    onDeliveryModeChange?.(mode);
  };

  const handleDeliveryKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentMode: MarketCartDeliveryMode,
  ) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    const options = [
      { mode: "shipping" as const, available: shippingAvailable, ref: shippingButtonRef },
      { mode: "pickup" as const, available: pickupAvailable, ref: pickupButtonRef },
    ].filter((option) => option.available);
    if (!options.length) return;
    event.preventDefault();
    const currentIndex = Math.max(0, options.findIndex((option) => option.mode === currentMode));
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (currentIndex - 1 + options.length) % options.length
          : (currentIndex + 1) % options.length;
    const next = options[nextIndex];
    chooseDeliveryMode(next.mode);
    next.ref.current?.focus();
  };

  const checkout = () => {
    if (
      lines.length === 0
      || unresolvedEntries.length > 0
      || productsStatus === "error"
      || !checkoutEnabled
      || !selectedDeliveryAvailable
    ) return;
    onCheckout({
      itemCount,
      lineCount: lines.length,
      subtotal,
      deliveryFee,
      total,
      deliveryMode,
    });
  };

  return (
    <div ref={layerRef} className="market-cart-layer">
      <button
        type="button"
        className="market-cart-layer__backdrop"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
      ref={panelRef}
      className={`market-cart-panel ${className}`.trim()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="market-cart-title"
    >
      <header className="market-cart-panel__header">
        <div className="market-cart-panel__heading">
          <span className="market-cart-panel__eyebrow">
            {pricingMode === "live" ? <ShoppingCart aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            {pricingMode === "live" ? "Panier synchronisé" : "Parcours de démonstration"}
          </span>
          <h2 id="market-cart-title">Mon panier <small>{itemCount}</small></h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="market-cart-panel__close"
          aria-label="Fermer le panier"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="market-cart-panel__steps" aria-label="Étapes de la commande">
        <span className="is-active"><b>1</b> Panier</span>
        <i aria-hidden="true" />
        <span><b>2</b> Réception</span>
        <i aria-hidden="true" />
        <span><b>3</b> {pricingMode === "live" ? "Paiement à venir" : "Paiement démo"}</span>
      </div>

      {cart.size === 0 ? (
        <div className="market-cart-empty">
          <div className="market-cart-empty__icon"><ShoppingCart aria-hidden="true" /></div>
          <span>Ton prochain son commence ici</span>
          <h3>Le panier attend sa première pépite.</h3>
          <p>Ajoute une référence neuve ou une occasion de la communauté. Elle apparaîtra ici avec son vendeur et ses options de livraison.</p>
          <button type="button" className="market-cart-empty__cta" onClick={onContinueShopping}>
            Explorer le Market <ChevronRight aria-hidden="true" />
          </button>
          <div className="market-cart-empty__trust">
            {pricingMode === "live" ? <>
              <span><ShoppingCart aria-hidden="true" /> Panier lié à ton compte</span>
              <span><PackageCheck aria-hidden="true" /> Disponibilité à confirmer</span>
            </> : <>
              <span><ShieldCheck aria-hidden="true" /> Paiement simulé</span>
              <span><PackageCheck aria-hidden="true" /> Vendeurs fictifs</span>
            </>}
          </div>
        </div>
      ) : (
        <>
          <div className="market-cart-panel__scroll">
            <section className="market-cart-section" aria-labelledby="market-cart-products-title">
              <div className="market-cart-section__title">
                <div>
                  <span>Ta sélection</span>
                  <h3 id="market-cart-products-title">{cart.size} référence{cart.size > 1 ? "s" : ""}</h3>
                </div>
                <small>{itemCount} article{itemCount > 1 ? "s" : ""}</small>
              </div>

              <div className="market-cart-lines">
                {lines.map(({ product, quantity }) => {
                  const isPending = pendingProductIds.has(product.id);
                  const canDecrease = quantity > 1;
                  const canIncrease = product.cart.eligible && quantity < product.cart.maxQuantity;
                  return (
                    <article key={product.id} className="market-cart-line" data-market-pillar={product.pillarId}>
                      <div className="market-cart-line__media">
                        <img src={product.imageUrl} alt={product.imageAlt} loading="lazy" decoding="async" />
                        <span>{getPillarLabel(product)}</span>
                      </div>

                      <div className="market-cart-line__body">
                        <div className="market-cart-line__topline">
                          <div>
                            <span className="market-cart-line__context">{product.category} · {product.conditionLabel}</span>
                            <h4>{product.title}</h4>
                          </div>
                          <strong>{formatPrice(product.price.amount * quantity)}</strong>
                        </div>

                        <p className="market-cart-line__seller">
                          Vendu par <b>{product.seller.name}</b> · {product.location.city}, {product.location.area}
                        </p>

                        <div className="market-cart-line__availability">
                          <Check aria-hidden="true" /> {getAvailabilityLabel(product, quantity)}
                        </div>

                        <div className="market-cart-line__actions">
                          <div className="market-cart-quantity" role="group" aria-label={`Quantité de ${product.title}`}>
                            <button
                              type="button"
                              aria-label={`Diminuer la quantité de ${product.title}`}
                              disabled={!canDecrease || isPending}
                              onClick={() => onQuantityChange(product.id, quantity - 1)}
                            >
                              <Minus aria-hidden="true" />
                            </button>
                            <output aria-live="polite" aria-label={`Quantité ${quantity}`}>{quantity}</output>
                            <button
                              type="button"
                              aria-label={`Augmenter la quantité de ${product.title}`}
                              disabled={!canIncrease || isPending}
                              onClick={() => onQuantityChange(product.id, quantity + 1)}
                            >
                              <Plus aria-hidden="true" />
                            </button>
                          </div>
                          <button
                            type="button"
                            className="market-cart-line__remove"
                            aria-label={`Supprimer ${product.title} du panier`}
                            disabled={isPending}
                            onClick={() => onRemove(product.id)}
                          >
                            <Trash2 aria-hidden="true" /> {isPending ? "Mise à jour…" : "Supprimer"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {(unresolvedEntries.length > 0 || productsStatus === "error") && (
                <div className={`market-cart-unresolved ${productsStatus === "error" ? "is-error" : ""}`} role={productsStatus === "error" ? "alert" : "status"} aria-live={productsStatus === "error" ? "assertive" : "polite"}>
                  <div className="market-cart-unresolved__heading">
                    <span className={productsStatus === "loading" ? "is-loading" : productsStatus === "error" ? "is-error" : ""} aria-hidden="true" />
                    <div>
                      <strong>{productsStatus === "loading"
                        ? "Synchronisation du panier…"
                        : productsStatus === "error"
                          ? "Impossible de charger les annonces du panier"
                          : "Certaines annonces ne sont plus disponibles"}</strong>
                      <p>{productsStatus === "loading"
                        ? "Nous récupérons les informations de ta sélection."
                        : productsStatus === "error"
                          ? "Un incident réseau empêche de vérifier ces références. Rien n’a été retiré de ton panier."
                          : "Tu peux retirer les références indisponibles sans perdre le reste du panier."}</p>
                    </div>
                    {productsStatus === "error" && (
                      <button type="button" className="market-cart-unresolved__retry" onClick={onRetryProducts} disabled={!onRetryProducts}>
                        Réessayer
                      </button>
                    )}
                  </div>
                  {productsStatus !== "loading" && productsStatus !== "error" && unresolvedEntries.map(([productId, quantity], index) => (
                    <div key={productId} className="market-cart-unresolved__line">
                      <span><PackageCheck aria-hidden="true" /></span>
                      <div><b>Annonce indisponible</b><small>{quantity} article{quantity > 1 ? "s" : ""} · référence {index + 1}</small></div>
                      <button
                        type="button"
                        disabled={pendingProductIds.has(productId)}
                        onClick={() => onRemove(productId)}
                        aria-label={`Retirer l’annonce indisponible ${index + 1} du panier`}
                      >
                        <Trash2 aria-hidden="true" /> {pendingProductIds.has(productId) ? "Retrait…" : "Retirer"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {unresolvedEntries.length === 0 && productsStatus !== "error" && <section className="market-cart-section" aria-labelledby="market-cart-delivery-title">
              <div className="market-cart-section__title">
                <div>
                  <span>Réception</span>
                  <h3 id="market-cart-delivery-title">Comment veux-tu récupérer ta sélection ?</h3>
                </div>
              </div>

              <div className="market-cart-delivery" role="radiogroup" aria-label="Mode de réception">
                <button
                  ref={shippingButtonRef}
                  type="button"
                  role="radio"
                  aria-checked={deliveryMode === "shipping"}
                  tabIndex={deliveryMode === "shipping" || !pickupAvailable ? 0 : -1}
                  disabled={!shippingAvailable}
                  className={deliveryMode === "shipping" ? "is-selected" : ""}
                  onClick={() => chooseDeliveryMode("shipping")}
                  onKeyDown={(event) => handleDeliveryKeyDown(event, "shipping")}
                >
                  <span className="market-cart-delivery__icon"><Truck aria-hidden="true" /></span>
                  <span><b>{pricingMode === "live" ? "Livraison proposée" : "Livraison simulée"}</b><small>{pricingMode === "live"
                    ? liveShippingFee === 0 ? "Offerte par le vendeur" : `${formatPrice(liveShippingFee)} · tarif vendeur`
                    : subtotal >= FREE_SHIPPING_THRESHOLD ? "Offerte dans la démo" : `${formatPrice(STANDARD_SHIPPING_FEE)} · estimation démo`}</small></span>
                  <i><Check aria-hidden="true" /></i>
                </button>
                <button
                  ref={pickupButtonRef}
                  type="button"
                  role="radio"
                  aria-checked={deliveryMode === "pickup"}
                  tabIndex={deliveryMode === "pickup" || !shippingAvailable ? 0 : -1}
                  disabled={!pickupAvailable}
                  className={deliveryMode === "pickup" ? "is-selected" : ""}
                  onClick={() => chooseDeliveryMode("pickup")}
                  onKeyDown={(event) => handleDeliveryKeyDown(event, "pickup")}
                >
                  <span className="market-cart-delivery__icon"><Store aria-hidden="true" /></span>
                  <span><b>{pricingMode === "live" ? "Retrait proposé" : "Retrait simulé"}</b><small>Gratuit · rendez-vous avec le vendeur</small></span>
                  <i><Check aria-hidden="true" /></i>
                </button>
              </div>

              {pricingMode === "demo" && deliveryMode === "shipping" && amountUntilFreeShipping > 0 && (
                <div className="market-cart-shipping-progress">
                  <div><span>Livraison offerte dès {formatPrice(FREE_SHIPPING_THRESHOLD)}</span><b>Encore {formatPrice(amountUntilFreeShipping)}</b></div>
                  <span><i style={{ width: `${Math.min(100, subtotal / FREE_SHIPPING_THRESHOLD * 100)}%` }} /></span>
                </div>
              )}
            </section>}

            {unresolvedEntries.length === 0 && productsStatus !== "error" && <section className="market-cart-protection" aria-label={pricingMode === "live" ? "État du parcours de commande" : "Protection simulée de la commande"}>
              <span>{pricingMode === "live" ? <ShoppingCart aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}</span>
              <div>
                <strong>{pricingMode === "live" ? "Panier synchronisé" : "Protection simulée"}</strong>
                <p>{pricingMode === "live"
                  ? "Aucun paiement ni séquestre n’est lancé dans cette version."
                  : "Démonstration d’un futur parcours protégé : aucun débit ne sera effectué."}</p>
              </div>

              {!shippingAvailable && !pickupAvailable ? (
                <div className="market-cart-unresolved is-error" role="alert">
                  <div className="market-cart-unresolved__heading">
                    <span className="is-error" aria-hidden="true" />
                    <div>
                      <strong>Aucun mode de réception commun</strong>
                      <p>Sépare cette sélection en plusieurs commandes pour respecter les options proposées par chaque vendeur.</p>
                    </div>
                  </div>
                </div>
              ) : null}
              {pricingMode === "live" ? <Check aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}
            </section>}
          </div>

          <footer className="market-cart-summary">
            <div className="market-cart-summary__rows">
              <p><span>{unresolvedEntries.length > 0 ? "Sous-total connu" : "Sous-total"}</span><strong>{formatPrice(subtotal)}</strong></p>
              <p><span>{deliveryMode === "pickup" ? "Retrait" : "Livraison"}</span><strong className={deliveryFee === 0 && unresolvedEntries.length === 0 ? "is-free" : ""}>{unresolvedEntries.length > 0 ? "À confirmer" : deliveryFee === 0 ? "Offert" : formatPrice(deliveryFee)}</strong></p>
              <p><span>{pricingMode === "live" ? "Paiement" : "Protection acheteur (démo)"}</span><strong>{pricingMode === "live" ? "Non activé" : "Simulée"}</strong></p>
            </div>
            <div className="market-cart-summary__total">
              <span>{unresolvedEntries.length > 0 || productsStatus === "error" ? "Total connu" : "Total"} {pricingMode === "demo" && <small>Estimation de démonstration</small>}</span>
              <strong>{formatPrice(total)}</strong>
            </div>
            <button
              type="button"
              className="market-cart-summary__checkout"
              onClick={checkout}
              disabled={
                !checkoutEnabled
                || unresolvedEntries.length > 0
                || productsStatus === "error"
                || !selectedDeliveryAvailable
              }
            >
              <span><CreditCard aria-hidden="true" /> {checkoutLabel}</span>
              <ChevronRight aria-hidden="true" />
            </button>
            <p className="market-cart-summary__demo"><LockKeyhole aria-hidden="true" /> {footerNote}</p>
          </footer>
        </>
      )}
      </aside>
    </div>
  );
}

export default MarketCartPanel;
