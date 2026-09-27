import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import TremplinPublicHome from "./TremplinPublicHome";
import type { TremplinArtist } from "./tremplinArtistData";

afterEach(cleanup);

type HomeCallbacks = {
  onOpenArtist: Mock<(artist: TremplinArtist) => void>;
  onOpenArtistSupport: Mock<(artist: TremplinArtist) => void>;
  onArtistAction: Mock<() => void>;
  onMyArtists: Mock<() => void>;
  onUnderstand: Mock<() => void>;
  onUnderstandGrades: Mock<() => void>;
  onUnderstandToken: Mock<() => void>;
  onOpenRoute: Mock<(route: string) => void>;
  onSearch: Mock<(query: string) => void>;
  onToggleArtistAudio: Mock<(artistId: string) => void>;
};

function renderPublicHome(overrides: Partial<HomeCallbacks> = {}, followedArtistIds: ReadonlySet<string> = new Set()) {
  const callbacks: HomeCallbacks = {
    onOpenArtist: vi.fn<(artist: TremplinArtist) => void>(),
    onOpenArtistSupport: vi.fn<(artist: TremplinArtist) => void>(),
    onArtistAction: vi.fn<() => void>(),
    onMyArtists: vi.fn<() => void>(),
    onUnderstand: vi.fn<() => void>(),
    onUnderstandGrades: vi.fn<() => void>(),
    onUnderstandToken: vi.fn<() => void>(),
    onOpenRoute: vi.fn<(route: string) => void>(),
    onSearch: vi.fn<(query: string) => void>(),
    onToggleArtistAudio: vi.fn<(artistId: string) => void>(),
    ...overrides,
  };

  render(
    <TremplinPublicHome
      playingArtistId={null}
      followedArtistIds={followedArtistIds}
      userState="visitor"
      onToggleArtistAudio={callbacks.onToggleArtistAudio}
      onOpenArtist={callbacks.onOpenArtist}
      onOpenArtistSupport={callbacks.onOpenArtistSupport}
      onMyArtists={callbacks.onMyArtists}
      onUnderstand={callbacks.onUnderstand}
      onUnderstandGrades={callbacks.onUnderstandGrades}
      onUnderstandToken={callbacks.onUnderstandToken}
      onOpenRoute={callbacks.onOpenRoute}
      onSearch={callbacks.onSearch}
      artistActionLabel="Je suis artiste"
      artistActionDetail="Découvrir les conditions"
      onArtistAction={callbacks.onArtistAction}
    />,
  );

  return callbacks;
}

function expectOnlyLevelPressed(level: number) {
  const group = screen.getByRole("group", { name: "Explorer les six niveaux MeeWav" });
  const buttons = within(group).getAllByRole("button");

  expect(buttons).toHaveLength(6);
  expect(buttons.filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(1);
  expect(screen.getByRole("button", { name: new RegExp(`Niveau ${level},`) })).toHaveAttribute("aria-pressed", "true");
}

describe("accueil passerelle du Tremplin", () => {
  it("ouvre par la promesse éditoriale et garde des entrées réelles vers les talents", () => {
    renderPublicHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Les grands noms ont de petits débuts.");
    expect(screen.getByText(/Repère le talent avant le bruit/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Portrait de Kylian Osei" })).toHaveAttribute("src", "/images/tremplin/artists/generated/kylian-osei-home-studio-v1.png");
    expect(document.querySelector(".tremplin-home__sleeve")).toHaveTextContent("Lunaé");
    expect(screen.getAllByRole("button", { name: /Découvrir les talents/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Comprendre le Tremplin/ })).toHaveLength(1);
    expect(screen.getByRole("list", { name: "Ce qui reste sous ton contrôle" })).toHaveTextContent("Donner de la force est facultatif");
  });

  it("retrouve un artiste par son nom ou son symbole puis consulte volontairement son jeton de talent", () => {
    const { onOpenArtistSupport, onSearch } = renderPublicHome();
    const search = screen.getByRole("combobox", { name: "Rechercher un artiste, un projet ou un jeton de talent" });

    fireEvent.change(search, { target: { value: "LUNAE" } });
    const suggestions = screen.getByRole("listbox", { name: "Artistes et jetons correspondants" });
    fireEvent.click(within(suggestions).getByRole("option", { name: /Lunaé/ }));

    expect(onOpenArtistSupport).not.toHaveBeenCalled();
    const resultPanel = screen.getByRole("article", { name: /Lunaé/ });
    fireEvent.click(within(resultPanel).getByRole("button", { name: /Voir le jeton de talent/ }));
    expect(onOpenArtistSupport).toHaveBeenCalledTimes(1);
    expect(onOpenArtistSupport.mock.calls[0][0]).toMatchObject({ name: "Lunaé" });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("transmet une recherche libre au catalogue si aucun artiste précis n’est sélectionné", () => {
    const { onSearch } = renderPublicHome();
    const search = screen.getByRole("combobox", { name: "Rechercher un artiste, un projet ou un jeton de talent" });

    fireEvent.change(search, { target: { value: "Projet introuvable" } });
    fireEvent.submit(search.closest("form")!);

    expect(onSearch).toHaveBeenCalledWith("Projet introuvable");
  });

  it("ne sélectionne pas un résultat au survol et permet de le choisir puis de le fermer au clavier", () => {
    const { onOpenArtist, onOpenArtistSupport } = renderPublicHome();
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "LUNAE" } });
    const option = within(screen.getByRole("listbox")).getByRole("option", { name: /Lunaé/ });
    fireEvent.mouseEnter(option);
    expect(screen.queryByRole("article", { name: /Lunaé/ })).not.toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.submit(search.closest("form")!);
    expect(screen.getByRole("article", { name: /Lunaé/ })).toBeInTheDocument();
    expect(onOpenArtist).not.toHaveBeenCalled();
    expect(onOpenArtistSupport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Fermer le résultat" }));
    expect(screen.queryByRole("article", { name: /Lunaé/ })).not.toBeInTheDocument();
    expect(search).toHaveValue("");
  });

  it("filtre la découverte sans quitter la page et rétablit tous les talents", () => {
    const { onOpenRoute } = renderPublicHome();
    const firstNames = screen.getAllByRole("button", { name: /^Voir le projet de/ }).map(button => button.getAttribute("aria-label"));
    fireEvent.click(screen.getByRole("button", { name: "Production" }));
    expect(screen.getByRole("button", { name: "Production" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Voir le projet de/ }).map(button => button.getAttribute("aria-label"))).not.toEqual(firstNames);
    expect(onOpenRoute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tous les talents", pressed: false }));
    expect(screen.getAllByRole("button", { name: /^Voir le projet de/ }).map(button => button.getAttribute("aria-label"))).toEqual(firstNames);
    fireEvent.click(screen.getAllByRole("button", { name: "Découvrir les talents" })[1]);
    expect(onOpenRoute).toHaveBeenCalledWith("/tremplin/decouvrir");
  });

  it("garde l’écoute comme aperçu tertiaire et ne déclenche jamais un achat depuis l’accueil", () => {
    const { onToggleArtistAudio, onOpenArtistSupport } = renderPublicHome();
    const search = screen.getByRole("combobox", { name: "Rechercher un artiste, un projet ou un jeton de talent" });

    fireEvent.change(search, { target: { value: "LUNAE" } });
    fireEvent.click(within(screen.getByRole("listbox", { name: "Artistes et jetons correspondants" })).getByRole("option", { name: /Lunaé/ }));

    const preview = screen.getByRole("button", { name: /Écouter un bref aperçu/ });
    expect(screen.getAllByText("Écouter l’extrait")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /^Acheter/ })).not.toBeInTheDocument();

    fireEvent.click(preview);
    fireEvent.click(screen.getAllByRole("button", { name: "Voir le jeton de talent" })[0]);

    expect(onToggleArtistAudio).toHaveBeenCalledTimes(1);
    expect(onOpenArtistSupport).toHaveBeenCalledTimes(1);
  });

  it("présente les projets éditoriaux sans classement financier", () => {
    renderPublicHome();

    expect(screen.getByRole("heading", { name: "Ton prochain coup de cœur." })).toBeInTheDocument();
    expect(screen.getByText(/Sélection éditoriale · Le talent, les projets documentés et leur évolution/)).toBeInTheDocument();
    expect(screen.getByText(/La sélection est indépendante du prix et des achats de jetons/)).toBeInTheDocument();
    expect(screen.queryByText(/top hausses|meilleure performance|24 h/i)).not.toBeInTheDocument();
  });
});

describe("progression MeeWav interactive", () => {
  it("préserve le niveau 4 initial puis déplace l’explication au survol", () => {
    renderPublicHome();

    expectOnlyLevelPressed(4);
    expect(screen.getByRole("status")).toHaveTextContent("Le parcours professionnel est structuré.");

    fireEvent.mouseEnter(screen.getByRole("button", { name: /Niveau 3, Confirmé/ }));

    expectOnlyLevelPressed(3);
    expect(screen.getByRole("status")).toHaveTextContent("Les étapes du parcours sont documentées.");
  });

  it("reste utilisable au clavier et au toucher", () => {
    renderPublicHome();

    const level4 = screen.getByRole("button", { name: /Niveau 4, Élite/ });
    level4.focus();
    fireEvent.focus(level4);
    expect(level4).toHaveFocus();
    expectOnlyLevelPressed(4);

    const level6 = screen.getByRole("button", { name: /Niveau 6, Légendaire/ });
    fireEvent.pointerDown(level6);
    fireEvent.pointerUp(level6);
    fireEvent.click(level6);

    expectOnlyLevelPressed(6);
    expect(screen.getByRole("status")).toHaveTextContent("L’expérience acquise hors de MeeWav");
  });
});

describe("hiérarchie de l’accueil", () => {
  it("ne conserve que les quatre blocs demandés et le parcours artiste existant", () => {
    const { onArtistAction } = renderPublicHome();
    const home = document.querySelector(".tremplin-home")!;
    expect(Array.from(home.children).map(element => element.className)).toEqual([
      "tremplin-home__hero",
      "tremplin-home__grades",
      "tremplin-home__section tremplin-home__discover",
      "tremplin-home__invitation",
    ]);
    expect(home.querySelectorAll(".tremplin-home__talent")).toHaveLength(4);
    expect(home.querySelectorAll(".vinyl-rotor")).toHaveLength(5);
    expect(home.querySelectorAll(".vinyl-specular")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Je suis artiste" }));
    expect(onArtistAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: /J’étais là au début/ })).toBeInTheDocument();
  });
});
