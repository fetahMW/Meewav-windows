import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import TremplinPublicHome from "./TremplinPublicHome";
import type { TremplinArtist } from "./tremplinArtistData";

afterEach(cleanup);

type HomeCallbacks = {
  onOpenArtist: Mock<(artist: TremplinArtist) => void>;
  onOpenArtistSupport: Mock<(artist: TremplinArtist) => void>;
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
      onArtistAction={() => undefined}
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
  it("ouvre par une promesse de landing page et un visuel collectif", () => {
    renderPublicHome();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Le talent se construit. Le Tremplin le rend visible.");
    expect(screen.getByText(/Suis les artistes qui t’inspirent, comprends leur évolution/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Quatre artistes créent ensemble dans un studio/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Explorer le Tremplin/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /Comprendre comment ça marche/ })).toHaveLength(2);
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

    expect(screen.getByRole("heading", { name: "Des projets, pas un classement." })).toBeInTheDocument();
    expect(screen.getByText(/Une sélection fondée sur le talent, les projets documentés et l’évolution des artistes dans MeeWav/)).toBeInTheDocument();
    expect(screen.getByText(/La sélection est indépendante du prix et des achats de jetons/)).toBeInTheDocument();
    expect(screen.queryByText(/top hausses|meilleure performance|24 h/i)).not.toBeInTheDocument();
  });
});

describe("progression MeeWav interactive", () => {
  it("ouvre le niveau 1 par défaut puis déplace l’explication au survol", () => {
    renderPublicHome();

    expectOnlyLevelPressed(1);
    expect(screen.getByRole("status")).toHaveTextContent("Le profil pose ses premiers repères.");

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

describe("protections du jeton de talent", () => {
  it("ouvre l’explication dédiée et garde les risques lisibles", () => {
    const { onUnderstandToken } = renderPublicHome();

    expect(screen.getByText("Achat payant et facultatif")).toBeInTheDocument();
    expect(screen.getByText("Valeur variable, aucun gain garanti")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Comprendre le jeton de talent/ }));

    expect(onUnderstandToken).toHaveBeenCalledTimes(1);
  });
});
