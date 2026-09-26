import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import RoomsHome from "./RoomsHome";

vi.mock("./roomsHome.live", () => ({ loadLiveRoomsCatalog: async () => [] }));
vi.mock("../../auth", () => ({ useAuth: () => ({ user: null }) }));

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(HTMLElement.prototype, "scrollBy", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  delete window.meewavDesktop;
  window.sessionStorage.clear();
});

function CollectionRoute() {
  const { collectionSlug } = useParams();
  return <RoomsHome collectionSlug={collectionSlug} />;
}

function DestinationProbe() {
  const location = useLocation();
  return <output data-testid="destination">{`${location.pathname}${location.search}`}</output>;
}

function renderRoomsHome(initialEntry = "/rooms/home") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/rooms/home" element={<RoomsHome />} />
        <Route path="/rooms/collections/:collectionSlug" element={<CollectionRoute />} />
        <Route path="/rooms/:roomType" element={<DestinationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RoomsHome", () => {
  it("shows no simulated cards when the live catalogue is empty", async () => {
    window.meewavDesktop = { version: 1 } as NonNullable<Window["meewavDesktop"]>;
    sessionStorage.setItem("meewav:desktop:application-mode:v1", "live");
    renderRoomsHome();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    await screen.findByText(/Aucune Room avec ces critères/);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.queryByText(/directs simulés/)).toBeNull();
  });
  it("renders exactly seven rails with ten real cards each", () => {
    renderRoomsHome();

    const rails = screen.getAllByRole("region", { name: /, 10 Rooms$/ });
    expect(rails).toHaveLength(7);
    for (const rail of rails) {
      expect(within(rail).getAllByRole("article")).toHaveLength(10);
    }
    expect(screen.queryByText(/^LIVE$/i)).not.toBeInTheDocument();
  });

  it("fills portrait card side space with a blurred copy of the same poster", () => {
    const { container } = renderRoomsHome();
    const verticalCard = container.querySelector(".rooms-home-card--vertical-media");
    const ambientPoster = verticalCard?.querySelector<HTMLImageElement>(
      ".rooms-home-card__vertical-ambient",
    );
    const foregroundPoster = verticalCard?.querySelector<HTMLImageElement>(
      ".rooms-home-card__vertical-window > img",
    );

    expect(verticalCard).not.toBeNull();
    expect(ambientPoster).not.toBeNull();
    expect(foregroundPoster).not.toBeNull();
    expect(ambientPoster?.getAttribute("src")).toBe(foregroundPoster?.getAttribute("src"));
  });

  it("opens the launch sequencer information dialog", async () => {
    const user = userEvent.setup();
    renderRoomsHome();

    await user.click(screen.getByRole("button", { name: "Ouvrir le séquenceur de lancement" }));

    const dialog = screen.getByRole("dialog", { name: "Quel espace veux-tu ouvrir ?" });
    expect(within(dialog).getByRole("button", { name: /^La Cage/ })).toBeVisible();
    expect(within(dialog).getByRole("button", { name: /^La Wave/ })).toBeVisible();
  });

  it("applies an artist filter by its role key and can clear it again", async () => {
    const user = userEvent.setup();
    renderRoomsHome();

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    const panel = screen.getByRole("dialog", { name: "Filtrer les Rooms" });
    await user.click(within(panel).getByRole("button", { name: "Violoniste", exact: true }));

    expect(within(panel).getByRole("button", { name: "Violoniste", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("288 Rooms en direct")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "Afficher 9 Rooms" }));
    expect(screen.getByText("9 Rooms en direct")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    expect(within(panel).getByRole("button", { name: "Violoniste", exact: true })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(panel).getByRole("button", { name: "Tout effacer" }));
    await user.click(within(panel).getByRole("button", { name: "Afficher 288 Rooms" }));
    expect(screen.getByText("288 Rooms en direct")).toBeInTheDocument();
  });

  it("opens a complete vertical collection wall from Voir plus", async () => {
    const user = userEvent.setup();
    renderRoomsHome();

    await user.click(screen.getByRole("button", {
      name: "Voir toute la collection Battles qui chauffent",
    }));

    const collection = screen.getByRole("main", { name: "Battles qui chauffent" });
    expect(within(collection).getAllByRole("article").length).toBeGreaterThan(10);
    expect(screen.getByRole("button", { name: "Retour à l’accueil" })).toBeInTheDocument();
  });

  it("navigates a card to its own typed Room identifier", async () => {
    const user = userEvent.setup();
    renderRoomsHome();

    const firstRail = screen.getAllByRole("region", { name: /, 10 Rooms$/ })[0];
    const firstCard = within(firstRail).getAllByRole("article")[0];
    await user.click(within(firstCard).getByRole("button", { name: /^Ouvrir Finale des nouveaux flows/ }));

    const destination = screen.getByTestId("destination").textContent ?? "";
    expect(destination).toMatch(
      /^\/rooms\/(cage|wave|place|classe|loge|scene)\?homeRoom=room-home-/,
    );
    expect(destination).toContain("demoRole=viewer");
  });
});
