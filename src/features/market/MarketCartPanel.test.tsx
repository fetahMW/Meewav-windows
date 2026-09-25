import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketCartPanel from "./MarketCartPanel";
import { marketProductViews } from "./marketDemoData";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const callbacks = {
  onClose: vi.fn(),
  onContinueShopping: vi.fn(),
  onQuantityChange: vi.fn(),
  onRemove: vi.fn(),
  onCheckout: vi.fn(),
  onRetryProducts: vi.fn(),
};

describe("MarketCartPanel live consistency", () => {
  it("never presents a non-empty remote cart as empty while products are loading", () => {
    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([["71000000-0000-4000-8000-000000000001", 2]])}
      products={[]}
      productsStatus="loading"
      checkoutEnabled={false}
    />);

    expect(screen.getByRole("heading", { name: /Mon panier/ })).toHaveTextContent("2");
    expect(screen.getByRole("status")).toHaveTextContent("Synchronisation du panier");
    expect(screen.queryByText("Le panier attend sa première pépite.")).not.toBeInTheDocument();
  });

  it("keeps an unavailable remote line removable instead of silently hiding it", async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<MarketCartPanel
      {...callbacks}
      onRemove={onRemove}
      cart={new Map([["71000000-0000-4000-8000-000000000001", 1]])}
      products={[]}
      productsStatus="partial"
      checkoutEnabled={false}
    />);

    expect(screen.getByText("Certaines annonces ne sont plus disponibles")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retirer l’annonce indisponible 1 du panier" }));
    expect(onRemove).toHaveBeenCalledWith("71000000-0000-4000-8000-000000000001");
  });

  it("presents a recoverable incident and never suggests removing entries when hydration fails", async () => {
    const onRetryProducts = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<MarketCartPanel
      {...callbacks}
      onRetryProducts={onRetryProducts}
      onRemove={onRemove}
      cart={new Map([["71000000-0000-4000-8000-000000000001", 1]])}
      products={[]}
      productsStatus="error"
      pricingMode="live"
      checkoutEnabled={false}
    />);

    expect(screen.getByRole("alert")).toHaveTextContent("Impossible de charger les annonces du panier");
    expect(screen.getByRole("alert")).toHaveTextContent("Rien n’a été retiré");
    expect(screen.queryByRole("button", { name: /Retirer l’annonce indisponible/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(onRetryProducts).toHaveBeenCalledTimes(1);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("uses the canonical per-listing shipping amount in live mode", () => {
    const baseProduct = marketProductViews.find((product) => product.cart.eligible && product.location.shipping);
    expect(baseProduct).toBeDefined();
    const product = { ...baseProduct!, shippingAmount: 23.4 };
    const secondProduct = {
      ...baseProduct!,
      id: `${baseProduct!.id}-second`,
      title: `${baseProduct!.title} seconde ligne`,
      shippingAmount: 5.1,
    };
    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([[product.id, 2], [secondProduct.id, 1]])}
      products={[product, secondProduct]}
      pricingMode="live"
      checkoutEnabled={false}
    />);

    expect(screen.getByText("51,90 € · tarif vendeur")).toBeInTheDocument();
    expect(screen.queryByText(/14,90/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Livraison offerte dès/)).not.toBeInTheDocument();
  });

  it("shows the seller preparation delay instead of inferring speed from stock", () => {
    const baseProduct = marketProductViews.find((product) => product.cart.eligible && product.cart.maxQuantity > 2);
    expect(baseProduct).toBeDefined();
    const product = { ...baseProduct!, preparationDays: 4 };
    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([[product.id, 1]])}
      products={[product]}
      pricingMode="live"
      checkoutEnabled={false}
    />);

    expect(screen.getByText(/En stock · préparation annoncée sous 4 jours/)).toBeInTheDocument();
    expect(screen.queryByText(/expédition rapide/)).not.toBeInTheDocument();
  });

  it("moves and selects delivery radios with the arrow keys", async () => {
    const baseProduct = marketProductViews.find((product) => (
      product.cart.eligible && product.location.shipping && product.location.pickup
    ));
    expect(baseProduct).toBeDefined();
    const onDeliveryModeChange = vi.fn();
    const user = userEvent.setup();
    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([[baseProduct!.id, 1]])}
      products={[baseProduct!]}
      onDeliveryModeChange={onDeliveryModeChange}
    />);

    const shipping = screen.getByRole("radio", { name: /Livraison simulée/ });
    const pickup = screen.getByRole("radio", { name: /Retrait simulé/ });
    shipping.focus();
    await user.keyboard("{ArrowRight}");
    expect(pickup).toHaveFocus();
    expect(pickup).toHaveAttribute("aria-checked", "true");
    expect(onDeliveryModeChange).toHaveBeenCalledWith("pickup");
  });

  it("blocks checkout when the selected sellers have no common delivery mode", () => {
    const baseProduct = marketProductViews.find((product) => product.cart.eligible);
    expect(baseProduct).toBeDefined();
    const shippingOnly = {
      ...baseProduct!,
      id: `${baseProduct!.id}-shipping-only`,
      title: `${baseProduct!.title} livraison`,
      location: { ...baseProduct!.location, shipping: true, pickup: false },
    };
    const pickupOnly = {
      ...baseProduct!,
      id: `${baseProduct!.id}-pickup-only`,
      title: `${baseProduct!.title} retrait`,
      location: { ...baseProduct!.location, shipping: false, pickup: true },
    };

    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([[shippingOnly.id, 1], [pickupOnly.id, 1]])}
      products={[shippingOnly, pickupOnly]}
    />);

    expect(screen.getByRole("alert")).toHaveTextContent("Aucun mode de réception commun");
    expect(screen.getByRole("button", { name: /Continuer vers le paiement/ })).toBeDisabled();
  });

  it("locks only the line whose remote quantity is being synchronized", async () => {
    const onQuantityChange = vi.fn();
    const onRemove = vi.fn();
    const firstProduct = marketProductViews.find((product) => product.cart.eligible && product.cart.maxQuantity > 1);
    const secondProduct = marketProductViews.find((product) => (
      product.cart.eligible
      && product.id !== firstProduct?.id
    ));
    expect(firstProduct).toBeDefined();
    expect(secondProduct).toBeDefined();

    const user = userEvent.setup();
    render(<MarketCartPanel
      {...callbacks}
      onQuantityChange={onQuantityChange}
      onRemove={onRemove}
      cart={new Map([[firstProduct!.id, 2], [secondProduct!.id, 1]])}
      products={[firstProduct!, secondProduct!]}
      pendingProductIds={new Set([firstProduct!.id])}
      checkoutEnabled={false}
    />);

    expect(screen.getByRole("button", { name: `Diminuer la quantité de ${firstProduct!.title}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Augmenter la quantité de ${firstProduct!.title}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Supprimer ${firstProduct!.title} du panier` })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: `Supprimer ${secondProduct!.title} du panier` }));
    expect(onRemove).toHaveBeenCalledWith(secondProduct!.id);
  });

  it("keeps Phase A live claims honest", () => {
    const product = marketProductViews.find((candidate) => candidate.cart.eligible && candidate.location.shipping);
    expect(product).toBeDefined();
    render(<MarketCartPanel
      {...callbacks}
      cart={new Map([[product!.id, 1]])}
      products={[{ ...product!, shippingAmount: 8 }]}
      productsStatus="ready"
      pricingMode="live"
      checkoutEnabled={false}
      checkoutLabel="Paiement non disponible"
    />);

    expect(screen.getByText("Panier synchronisé", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/Aucun paiement ni séquestre/)).toBeInTheDocument();
    expect(screen.getByText("Non activé")).toBeInTheDocument();
    expect(screen.queryByText(/TVA incluse|Paiement protégé|Vendeurs vérifiés|Retrait vérifié|Pièce unique réservée/)).not.toBeInTheDocument();
  });

  it("makes the background inert and restores focus when the modal closes", () => {
    const backgroundButton = document.createElement("button");
    backgroundButton.textContent = "Arrière-plan";
    document.body.appendChild(backgroundButton);
    backgroundButton.focus();

    const view = render(<MarketCartPanel
      {...callbacks}
      cart={new Map()}
      products={[]}
    />);

    expect(backgroundButton.inert).toBe(true);
    expect(screen.getByRole("button", { name: "Fermer le panier" })).toHaveFocus();

    view.unmount();
    expect(backgroundButton.inert).not.toBe(true);
    expect(backgroundButton).toHaveFocus();
    backgroundButton.remove();
  });

  it("closes from its dedicated backdrop", async () => {
    const onClose = vi.fn();
    const { container } = render(<MarketCartPanel {...callbacks} onClose={onClose} cart={new Map()} products={[]} />);

    const backdrop = container.querySelector(".market-cart-layer__backdrop");
    expect(backdrop).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
