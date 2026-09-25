import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { marketProductViews, type MarketProductView } from "./marketDemoData";

const mocks = vi.hoisted(() => ({
  listCatalog: vi.fn(),
  listDrafts: vi.fn(),
  updateDraft: vi.fn(),
  mapCatalog: vi.fn(),
  live: {} as Record<string, unknown>,
  liveOptions: null as Record<string, unknown> | null,
}));

vi.mock("../auth/AuthContext", () => ({
  useAuth: () => ({ user: { id: "51000000-0000-4000-8000-000000000001", user_metadata: {} } }),
}));

vi.mock("../globe/components/MeewavPrimaryNav", () => ({
  default: () => <nav aria-label="Navigation Meewav" />,
}));

vi.mock("./market.flags", () => ({
  resolveMarketRuntimeMode: () => "supabase",
}));

vi.mock("./useMarketLive", () => ({
  useMarketLive: (options: Record<string, unknown>) => {
    mocks.liveOptions = options;
    return mocks.live;
  },
}));

vi.mock("./market.service", () => ({
  createMarketplaceIdempotencyKey: () => "test:idempotency",
  marketplaceRepository: {
    listCatalog: mocks.listCatalog,
    listMyListingDrafts: mocks.listDrafts,
    updateListingDraft: mocks.updateDraft,
  },
}));

vi.mock("../profile/profile.media.service", () => ({
  profileMediaRepository: {
    uploadOwnerMedia: vi.fn(),
    archiveOwnerMedia: vi.fn(),
  },
}));

vi.mock("./market.adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./market.adapters")>();
  return { ...actual, mapMarketplaceCatalogRows: mocks.mapCatalog };
});

import MarketPage from "./MarketPage";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function liveState(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    mode: "supabase",
    status: "ready",
    error: null,
    actionError: null,
    pendingActions: new Set<string>(),
    lastIntent: null,
    products: [],
    cartProducts: [],
    cartProductsStatus: "ready",
    favoriteProducts: [],
    favoriteProductsStatus: "ready",
    favorites: new Set<string>(),
    cart: new Map<string, number>(),
    joinedCollectives: new Set<string>(),
    sellerKind: "artist",
    hasMore: false,
    loadingMore: false,
    catalogCapabilities: {
      sorts: { distance: { supported: false } },
    },
    catalogSortFallback: null,
    refresh: vi.fn(),
    loadMore: vi.fn(),
    toggleFavorite: vi.fn(),
    setCartQuantity: vi.fn(),
    joinCollective: vi.fn(),
    requestRental: vi.fn(),
    bookService: vi.fn(),
    clearActionError: vi.fn(),
    ...overrides,
  };
}

function renderMarket(initialEntry = "/market") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/market" element={<><MarketPage /><LocationProbe /></>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("MarketPage listing navigation", () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.listCatalog.mockReset();
    mocks.listDrafts.mockReset();
    mocks.listDrafts.mockResolvedValue([]);
    mocks.updateDraft.mockReset();
    mocks.mapCatalog.mockReset();
    mocks.live = liveState();
    mocks.liveOptions = null;
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("navigates inside the hydrated favorites collection, not the current catalog page", async () => {
    const favoriteProducts = marketProductViews.slice(0, 2);
    mocks.live = liveState({
      products: [],
      favoriteProducts,
      favorites: new Set(favoriteProducts.map((product) => product.id)),
    });

    renderMarket();
    fireEvent.click(screen.getByRole("button", { name: "Afficher mes favoris" }));
    fireEvent.click(await screen.findByRole("button", { name: `Voir ${favoriteProducts[0].title}` }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: favoriteProducts[0].title })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Annonce suivante" }));
    expect(within(dialog).getByRole("heading", { name: favoriteProducts[1].title })).toBeInTheDocument();
  });

  it("hydrates and reopens an exact listing that is absent from the current catalog", async () => {
    const listingId = "51000000-0000-4000-8000-000000000099";
    const linkedProduct: MarketProductView = { ...marketProductViews[0], id: listingId, title: "Annonce retrouvée" };
    mocks.listCatalog.mockResolvedValue([{ listing_id: listingId }]);
    mocks.mapCatalog.mockReturnValue([linkedProduct]);

    renderMarket(`/market?listing=${listingId}`);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: linkedProduct.title })).toBeInTheDocument();
    expect(mocks.listCatalog).toHaveBeenCalledWith({ listingIds: [listingId], limit: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Fermer l’annonce" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location")).toHaveTextContent("/market");
  });

  it("focuses the search with Ctrl+K when no modal is open", async () => {
    renderMarket();
    const search = screen.getByRole("searchbox", { name: "Rechercher dans le Market" });

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    await waitFor(() => expect(search).toHaveFocus());
  });

  it("sends the redesigned filter contract to the complete live catalogue", async () => {
    const product = marketProductViews.find((candidate) => candidate.category === "Interfaces audio");
    if (!product) throw new Error("Missing Interfaces audio fixture");
    mocks.live = liveState({ products: [product] });
    renderMarket();

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir les filtres du Market" }));
    const dialog = await screen.findByRole("dialog", { name: "Filtres Market" });
    fireEvent.click(within(dialog).getByRole("button", { name: /Interfaces audio/ }));
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Prix minimum en euros" }), {
      target: { value: "125" },
    });
    fireEvent.click(within(dialog).getByRole("switch", { name: /Vendeurs vérifiés/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "4+" }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Appliquer/ }));

    await waitFor(() => expect(mocks.liveOptions).toMatchObject({
      catalog: {
        limit: 60,
        filters: {
          categoryCodes: expect.arrayContaining(["interfaces_audio", "interfaces-audio"]),
          minimumPriceMinor: 12_500,
          verifiedOnly: true,
          minimumGrade: 4,
          sort: "recommended",
        },
      },
    }));
  });

  it("routes live quick filters through the complete server catalogue", async () => {
    renderMarket();
    const navigation = screen.getByRole("navigation", { name: "Espaces de la Marketplace" });
    fireEvent.click(within(navigation).getByRole("button", { name: "Neuf" }));
    const quickFilters = screen.getByLabelText("Filtres rapides");
    fireEvent.click(within(quickFilters).getByRole("button", { name: "Synthétiseurs" }));

    await waitFor(() => expect(mocks.liveOptions).toMatchObject({
      catalog: {
        filters: {
          pillar: "new",
          categoryCodes: expect.arrayContaining(["synthetiseurs", "synthesizers"]),
        },
      },
    }));
  });

  it("keeps a server search result found through its description", async () => {
    const product = {
      ...marketProductViews[0],
      description: "Une texture spectrale uniquement présente dans la description.",
    };
    mocks.live = liveState({ products: [product] });
    renderMarket();

    fireEvent.change(screen.getByRole("searchbox", { name: "Rechercher dans le Market" }), {
      target: { value: "texture spectrale" },
    });

    expect(await screen.findByRole("button", { name: `Voir ${product.title}` })).toBeInTheDocument();
  });

  it("does not leak favorites from another pillar into a live filtered view", async () => {
    const newProduct = marketProductViews.find((product) => product.pillarId === "new");
    const usedProduct = marketProductViews.find((product) => product.pillarId === "used");
    if (!newProduct || !usedProduct) throw new Error("Missing Market pillar fixtures");
    mocks.live = liveState({
      products: [usedProduct],
      favoriteProducts: [newProduct, usedProduct],
      favorites: new Set([newProduct.id, usedProduct.id]),
    });
    renderMarket();

    const navigation = screen.getByRole("navigation", { name: "Espaces de la Marketplace" });
    fireEvent.click(within(navigation).getByRole("button", { name: "Occasion" }));
    fireEvent.click(screen.getByRole("button", { name: "Afficher mes favoris" }));

    expect(await screen.findByRole("button", { name: `Voir ${usedProduct.title}` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Voir ${newProduct.title}` })).not.toBeInTheDocument();
  });

  it("moves focus into Market Center and restores it after an outside click", async () => {
    renderMarket();
    const trigger = screen.getByRole("button", { name: "Ouvrir Market Center" });

    fireEvent.click(trigger);
    const center = await screen.findByRole("dialog", { name: "Market Center" });
    await waitFor(() => expect(within(center).getByRole("button", { name: /Mes demandes/ })).toHaveFocus());

    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Market Center" })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes Market Center when keyboard focus leaves the popover", async () => {
    renderMarket();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Market Center" }));
    expect(await screen.findByRole("dialog", { name: "Market Center" })).toBeInTheDocument();

    fireEvent.focusIn(screen.getByRole("searchbox", { name: "Rechercher dans le Market" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Market Center" })).not.toBeInTheDocument());
  });

  it("closes an announcement from its outside overlay", async () => {
    const product = marketProductViews[0];
    mocks.live = liveState({ products: [product] });
    const view = renderMarket();
    const [productTrigger] = await screen.findAllByRole("button", { name: `Voir ${product.title}` });
    fireEvent.click(productTrigger);

    const overlay = view.container.querySelector(".market-overlay--product");
    expect(overlay).toBeInstanceOf(HTMLButtonElement);
    fireEvent.click(overlay!);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: `Annonce ${product.title}` })).not.toBeInTheDocument());
  });

  it("opens the authenticated seller draft workspace from Market Center", async () => {
    renderMarket();

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir Market Center" }));
    fireEvent.click(await screen.findByRole("button", { name: /Mes annonces/ }));

    expect(await screen.findByRole("heading", { name: "Mes annonces" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.listDrafts).toHaveBeenCalledWith(50));
  });
});
