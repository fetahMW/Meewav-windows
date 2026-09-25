import { scenePrivateKey, setScenePrivateScope } from "../scene/scenePrivateStorage";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShortsPage from "./ShortsPage";
import { SHORTS_WALLS } from "./shorts-wall-data";
import {
  getSceneArtistPath,
  getSceneVerticalPath,
  getSceneWatchPath,
  SCENE_NAME,
} from "./sceneContract";
import {
  SCENE_ARTIST_ROLE_OPTIONS,
  SCENE_STYLE_OPTIONS,
} from "../scene/sceneDiscoveryModel";
import {
  SCENE_PLAYLISTS_STORAGE_KEY,
  SCENE_WATCH_LATER_PLAYLIST_ID,
  parseScenePlaylists,
  scenePlaylistRepository,
} from "../scene/scenePlaylists";
import {
  AuthContext,
  type AuthContextValue,
} from "../auth/AuthContext";

const { submitCollaborationRequest } = vi.hoisted(() => ({
  submitCollaborationRequest: vi.fn(),
}));

vi.mock("../messaging/collaborationRequestBridge", () => ({
  submitGlobeCollaborationRequest: (...args: unknown[]) => submitCollaborationRequest(...args),
}));

vi.mock("../auth/localAuthPreview", () => ({
  isLocalAuthPreviewEnabled: () => true,
}));

function LocationProbe() {
  const location = useLocation();
  return (
    <output
      aria-label="Route La Scène active"
      data-state={JSON.stringify(location.state)}
    >
      {location.pathname}{location.search}
    </output>
  );
}

const ARTIST_AUTH_VALUE = {
  session: null,
  user: {
    id: "51000000-0000-4000-8000-000000000001",
    user_metadata: { primary_role_key: "vocalist" },
  },
  status: "authenticated",
  needsOnboarding: false,
  onboardingStatus: "complete",
  error: null,
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  markOnboardingComplete: vi.fn(),
} as unknown as AuthContextValue;

function renderScene(initialEntry = "/scene", authValue = ARTIST_AUTH_VALUE) {
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ShortsPage />
        <LocationProbe />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function mockReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("La Scène page interactions", () => {
  beforeEach(() => {
  setScenePrivateScope(ARTIST_AUTH_VALUE.user!.id);
  scenePlaylistRepository.clear();
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
    submitCollaborationRequest.mockReset();
    submitCollaborationRequest.mockReturnValue({ id: "scene-collab-demo-request" });
    window.localStorage.clear();
    scenePlaylistRepository.clear();
    window.sessionStorage.clear();
    mockReducedMotion(false);
    Element.prototype.scrollTo = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function play(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function pause(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("exposes subscriptions, personal library and a compact home grid", () => {
    renderScene();
    expect(screen.getByRole("navigation", { name: `Navigation ${SCENE_NAME}` })).toBeVisible();
    const sidebar = screen.getByRole("complementary", { name: "Navigation vidéo" });
    expect(within(sidebar).getByRole("link", { name: "À regarder plus tard" })).toHaveAttribute("href", "/scene/playlist/watch-later");
    expect(within(sidebar).getByRole("link", { name: "Votre chaîne" })).toHaveAttribute("href", "/profile");
    expect(screen.getByRole("navigation", { name: "Artistes suivis" }).querySelectorAll("a").length).toBeGreaterThan(0);
    const feed = screen.getByRole("region", { name: "Vidéos recommandées" });
    expect(feed.querySelector(".scene-home-feed__grid")?.children).toHaveLength(3);
    expect(feed.querySelectorAll(".scene-video-card")).toHaveLength(24);
    expect(within(feed).getByRole("region", { name: "Shorts" })).toBeVisible();
    expect(document.querySelector(".scene-featured-rail")).toBeNull();
  });

  it("preserves the Artiste IA disclosure in the home feed", () => {
    renderScene();
    const item = SHORTS_WALLS["for-you"].items.find((video) => video.isAiArtist)!;
    const link = screen.getByRole("link", { name: `Regarder ${item.title} de ${item.artist}` });
    expect(link.closest("article")?.querySelector(".shorts-card-badge")).toHaveTextContent("Artiste IA");
    const human = SHORTS_WALLS["for-you"].items[0];
    expect(screen.getByRole("link", { name: `Regarder ${human.title} de ${human.artist}` }).closest("article")?.querySelector(".shorts-card-badge")).toBeNull();
  });

  it("offers the compact Accueil, Explorer, Suivis and TV navigation", async () => {
    const user = userEvent.setup();
    renderScene();

    const navigation = screen.getByRole("navigation", { name: `Navigation ${SCENE_NAME}` });
    const home = within(navigation).getByRole("button", { name: "Accueil" });
    const following = within(navigation).getByRole("button", { name: "Suivis" });
    const tv = within(navigation).getByRole("button", { name: "TV" });
    const explore = within(navigation).getByRole("button", { name: "Explorer" });

    expect(home).toHaveAttribute("aria-current", "page");
    expect(following).not.toHaveAttribute("aria-current");
    expect(tv).not.toHaveAttribute("aria-current");
    expect(explore).not.toHaveAttribute("aria-current");

    await user.click(following);
    expect(following).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Les nouveautés des artistes que tu suis" })).toBeVisible();
    expect(screen.getByRole("navigation", { name: "Filtrer les publications suivies" })).toBeVisible();

    await user.click(tv);
    expect(tv).toHaveAttribute("aria-current", "page");
    expect(tv.style.getPropertyValue("--meewav-pillar-tab-accent")).toBe("#ff9f4a");
    expect(screen.getByRole("region", { name: /MeeWav TV/i })).toBeVisible();
    expect(screen.getByRole("heading", { name: /MeeWav TV/i })).toBeVisible();
    expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent("/scene/tv");

    await user.click(explore);
    expect(explore).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Explore toute La Scène." })).toBeVisible();

    await user.click(home);
    expect(home).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "Vidéos recommandées" })).toBeVisible();
  }, 15_000);

  it("extends the home grid without duplicating cards", async () => {
    const user = userEvent.setup();
    renderScene();
    const feed = screen.getByRole("region", { name: "Vidéos recommandées" });
    const before = feed.querySelectorAll(".scene-video-card").length;
    await user.click(within(feed).getByRole("button", { name: "Afficher plus de vidéos" }));
    expect(feed.querySelectorAll(".scene-video-card").length).toBeGreaterThan(before);
    const links = Array.from(feed.querySelectorAll(".scene-video-card__media-hit"), (link) => link.getAttribute("href"));
    expect(new Set(links).size).toBe(links.length);
  });

  it("renders Explorer progressively instead of mounting the whole catalog", async () => {
    const user = userEvent.setup();
    renderScene("/scene?view=explore");

    const explorer = screen.getByRole("region", { name: "Explore toute La Scène." });
    expect(within(explorer).getByText("Clips, performances, sessions et créations longues, pensés pour le grand écran.")).toBeVisible();
    expect(screen.getByRole("searchbox", { name: "Rechercher dans La Scène" }).closest(".shorts-topbar")).not.toBeNull();
    expect(document.querySelector(".scene-context-bar")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Trier les créations" })).toHaveValue("relevance");
    expect(within(explorer).getByRole("button", { name: "Vue grille" })).toHaveAttribute("aria-pressed", "true");
    expect(within(explorer).getByRole("button", { name: "Vue compacte" })).toHaveAttribute("aria-pressed", "false");
    expect(within(explorer).getAllByRole("article")).toHaveLength(24);
    expect(within(explorer).getByText(/24 sur \d+ créations/)).toBeVisible();

    await user.click(within(explorer).getByRole("button", { name: "Vue compacte" }));
    expect(within(explorer).getByRole("button", { name: "Vue compacte" })).toHaveAttribute("aria-pressed", "true");
    expect(explorer.querySelector(".scene-explore__catalog")).toHaveClass("is-compact");

    await user.click(within(explorer).getByRole("button", { name: /Charger la suite/ }));

    expect(within(explorer).getAllByRole("article")).toHaveLength(48);
    expect(within(explorer).getByText(/48 sur \d+ créations/)).toBeVisible();
  }, 15_000);

  it("opens /scene/tv as one linear channel with the shared navbar and no VOD shelf", () => {
    renderScene("/scene/tv");

    const tv = screen.getByRole("region", { name: /MeeWav TV/i });
    expect(within(tv).getByRole("group", { name: "Contrôles de MeeWav TV" })).toBeVisible();
    expect(document.querySelectorAll("video")).toHaveLength(1);
    expect(screen.getByRole("searchbox", { name: "Rechercher dans La Scène" }).closest(".shorts-topbar")).not.toBeNull();
    expect(screen.queryByText("À voir sur MeeWav TV")).not.toBeInTheDocument();
    expect(screen.queryByText(/Top Rooms|Rooms populaires|Rooms à venir/i)).not.toBeInTheDocument();
  });

  it("exposes the shared search as a La Scène video search and keeps it in the canonical URL", async () => {
    const user = userEvent.setup();
    renderScene();

    const searchbox = screen.getByRole("searchbox", { name: "Rechercher dans La Scène" });
    expect(searchbox).toHaveAttribute(
      "placeholder",
      "Rechercher sur La Scène",
    );

    await user.type(searchbox, "studio{Enter}");

    expect(screen.getByRole("heading", { name: /résultats? pour studio/i })).toBeVisible();
    const route = screen.getByLabelText("Route La Scène active");
    await waitFor(() => expect(route).toHaveTextContent("/scene/explorer?q=studio"));
  }, 15_000);

  it("focuses and selects the command search with Ctrl+K", () => {
    renderScene("/scene?q=studio");

    const searchbox = screen.getByRole("searchbox", { name: "Rechercher dans La Scène" }) as HTMLInputElement;
    const navigation = screen.getByRole("navigation", { name: `Navigation ${SCENE_NAME}` });
    within(navigation).getByRole("button", { name: "Accueil" }).focus();

    expect(searchbox).toHaveAttribute("aria-keyshortcuts", "Control+K Meta+K");
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });

    expect(searchbox).toHaveFocus();
    expect(searchbox.selectionStart).toBe(0);
    expect(searchbox.selectionEnd).toBe(searchbox.value.length);
  });

  it("keeps Publier with the account actions instead of the search content bar", () => {
    const { container } = renderScene();
    const topbarActions = container.querySelector<HTMLElement>(".shorts-topbar__actions");
    const contentbar = container.querySelector<HTMLElement>(".scene-contentbar");

    expect(topbarActions).not.toBeNull();
    expect(contentbar).not.toBeNull();
    expect(within(topbarActions as HTMLElement).getByRole("button", {
      name: "Publier une vidéo dans La Scène",
    })).toHaveClass("scene-topbar-publish");
    expect(contentbar?.querySelector(".shorts-create-button")).toBeNull();
    expect(contentbar?.querySelector("kbd")).toBeNull();
  });

  it("hides Publier from viewer accounts", () => {
    renderScene("/scene", {
      ...ARTIST_AUTH_VALUE,
      user: {
        ...ARTIST_AUTH_VALUE.user,
        user_metadata: { primary_role_key: "viewer" },
      } as NonNullable<AuthContextValue["user"]>,
    });

    expect(screen.queryByRole("button", {
      name: "Publier une vidéo dans La Scène",
    })).not.toBeInTheDocument();
  });

  it("uses Globe illustrations for 28 artistic professions and keeps music styles distinct", async () => {
    const user = userEvent.setup();
    const { container } = renderScene();

    const contentbar = container.querySelector<HTMLElement>(".scene-contentbar");
    const search = container.querySelector<HTMLElement>(".scene-context-search .meewav-search-filter-bar");
    expect(contentbar).not.toBeNull();
    expect(search).toHaveClass("meewav-search-filter-bar", "is-flow");

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    const filterDialog = screen.getByRole("dialog", { name: "Affiner les vidéos" });
    const sectionLabels = within(filterDialog)
      .getAllByRole("region")
      .map((section) => section.getAttribute("aria-label"));
    expect(sectionLabels.slice(0, 2)).toEqual([
      "Grade MeeWav",
      "Styles d’avatar",
    ]);
    expect(sectionLabels.length).toBeGreaterThan(2);
    const professionGrid = within(filterDialog).getByRole("group", {
      name: "Sélection multiple des styles d’avatar",
    });
    const professionButtons = within(professionGrid).getAllByRole("button");
    expect(professionButtons).toHaveLength(28);
    expect(SCENE_ARTIST_ROLE_OPTIONS).toHaveLength(28);
    expect(SCENE_ARTIST_ROLE_OPTIONS.map(({ key }) => key)).not.toEqual(
      expect.arrayContaining(["avatar_3", "avatar_4"]),
    );
    for (const { label } of SCENE_ARTIST_ROLE_OPTIONS) {
      const option = within(professionGrid).getByRole("button", {
        name: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`),
      });
      expect(within(option).getByText(label)).toBeVisible();
      expect(option.querySelector(".artist-filter-option__avatar img")).toHaveAttribute("src", expect.stringContaining("/images/V4/"));
      expect(option).toHaveAttribute("aria-pressed", "false");
    }

    const styleGrid = within(filterDialog).getByRole("group", {
      name: "Sélection multiple des styles musicaux",
    });
    const styleButtons = within(styleGrid).getAllByRole("button");

    expect(styleButtons).toHaveLength(SCENE_STYLE_OPTIONS.length);
    for (const { label } of SCENE_STYLE_OPTIONS) {
      const option = within(styleGrid).getByRole("button", { name: label });
      expect(option).toHaveClass("meewav-filter-choice");
      expect(option.querySelector("img")).toBeNull();
      expect(option).toHaveAttribute("aria-pressed", "false");
    }
  }, 15_000);

  it("applies and resets an artistic profession through the canonical URL", async () => {
    const user = userEvent.setup();
    renderScene();

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    let filterDialog = screen.getByRole("dialog", { name: "Affiner les vidéos" });
    const professionGrid = within(filterDialog).getByRole("group", {
      name: "Sélection multiple des styles d’avatar",
    });
    await user.click(within(professionGrid).getByRole("button", { name: /^DJ,/ }));
    await user.click(within(filterDialog).getByRole("button", { name: /^Afficher \d+ contenus?/ }));

    const route = screen.getByLabelText("Route La Scène active");
    await waitFor(() => expect(route).toHaveTextContent("role=avatar_17"));
    expect(within(screen.getByLabelText("Filtres actifs")).getByRole("button", { name: "DJ" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    filterDialog = screen.getByRole("dialog", { name: "Affiner les vidéos" });
    await user.click(within(filterDialog).getByRole("button", { name: "Réinitialiser" }));
    await user.click(within(filterDialog).getByRole("button", { name: /^Afficher \d+ contenus?/ }));
    await waitFor(() => expect(route).not.toHaveTextContent("role="));
  }, 15_000);

  it("shows only the graphical grade beside the artist and keeps actions off thumbnails", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene();

    expect(screen.queryByLabelText("Profil vérifié")).not.toBeInTheDocument();
    const profileAvatar = screen.getAllByRole("link", {
      name: `Voir le profil de ${item.artist}`,
    })[0];
    const card = profileAvatar.closest("article");
    expect(card).not.toBeNull();
    const cardBody = (card as HTMLElement).querySelector<HTMLElement>(".scene-video-card__body");
    expect(cardBody?.querySelector(":scope > .scene-video-card__avatar-slot .scene-video-card__avatar"))
      .toBe(profileAvatar);
    expect(profileAvatar.querySelector("img")).toHaveAttribute("src", item.artistPortrait);
    expect(item.artistPortrait).not.toBe(item.image);
    expect(cardBody?.querySelector(":scope > .scene-video-card__artist-actions"))
      .toBeNull();
    expect(within(card as HTMLElement).getByLabelText(`Grade MeeWav de ${item.artist}`))
      .toHaveClass("mw-grade-badge--icon", "mw-grade-badge--xs");
    expect(card?.querySelector(".mw-grade-badge__text")).toBeNull();
    expect(within(card as HTMLElement).queryByRole("button", { name: "Profil" })).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole("button", { name: "Message" })).not.toBeInTheDocument();
    expect(within(card as HTMLElement).queryByRole("button", { name: "Collab" })).not.toBeInTheDocument();

    await user.click(profileAvatar);
    await waitFor(() => expect(screen.getByLabelText("Route La Scène active"))
      .toHaveTextContent(`/profile/view/${item.mockArtistId}`));
  }, 15_000);

  function skipPreroll() {
    const ad = screen.getByLabelText("Publicité : découvre MeeWav") as HTMLVideoElement;
    expect(screen.getByRole("button", { name: "Ignorer dans 5 s" })).toBeDisabled();
    ad.currentTime = 5;
    fireEvent.timeUpdate(ad);
    fireEvent.click(screen.getByRole("button", { name: "Ignorer la publicité" }));
  }

  it("keeps direct contact and collaboration in the expanded player", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    const watchLabel = `Regarder ${item.title} de ${item.artist}`;
    const { unmount } = renderScene();

    await user.click(screen.getByRole("link", { name: watchLabel }));
    skipPreroll();
    await user.click(screen.getByText("Plus d’actions"));
    await user.click(screen.getByRole("button", { name: "Contacter" }));
    await waitFor(() => {
      const route = screen.getByLabelText("Route La Scène active").textContent ?? "";
      expect(route).toContain("/messages?space=messages");
      expect(route).toContain(`mockArtistId=${encodeURIComponent(item.mockArtistId)}`);
      expect(route).toContain("intent=message");
      expect(route).toContain("source=shorts");
    });

    unmount();
    renderScene();
    await user.click(screen.getByRole("link", { name: watchLabel }));
    skipPreroll();
    await user.click(screen.getByRole("button", { name: "Demande de collab" }));

    const dialog = screen.getByRole("dialog", { name: `Proposer un projet à ${item.artist}` });
    expect(within(dialog).getByText(/Messagerie → Collabs → Envoyées/)).toBeVisible();
    expect(within(dialog).queryByLabelText("Profil vérifié")).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(`Grade MeeWav de ${item.artist}`)).toBeVisible();
  }, 30_000);

  it("filters the catalogue through chips and restores all videos", async () => {
    const user = userEvent.setup();
    renderScene();
    const chips = screen.getByRole("navigation", { name: "Catégories vidéo" });
    await user.click(within(chips).getByRole("button", { name: "Jazz", exact: true }));
    expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent("jazz");
    expect(within(chips).getByRole("button", { name: "Jazz", exact: true })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(chips).getByRole("button", { name: "Tous", exact: true }));
    expect(screen.getByRole("region", { name: "Vidéos recommandées" })).toBeVisible();
  });

  it("opens subscriptions and watch later from the sidebar", async () => {
    const user = userEvent.setup();
    renderScene();
    const sidebar = screen.getByRole("complementary", { name: "Navigation vidéo" });
    await user.click(within(sidebar).getAllByRole("link", { name: "Abonnements" })[0]);
    expect(screen.getByRole("heading", { name: "Les nouveautés des artistes que tu suis" })).toBeVisible();
    await user.click(within(sidebar).getByRole("link", { name: "À regarder plus tard" }));
    expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent("/scene/playlist/watch-later");
  });

  it("starts the muted card preview after 720 ms and removes it on pointer leave", () => {
    vi.useFakeTimers();
    renderScene();
    const lead = SHORTS_WALLS["for-you"].items[0];
    const hero = screen.getByRole("region", { name: "Vidéos recommandées" });
    const leadButton = within(hero).getByRole("link", {
      name: `Regarder ${lead.title} de ${lead.artist}`,
    });

    expect(leadButton.querySelector("video")).not.toBeInTheDocument();
    fireEvent.pointerEnter(leadButton.parentElement!);
    act(() => vi.advanceTimersByTime(719));
    expect(leadButton.querySelector("video")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1));
    const preview = leadButton.querySelector("video") as HTMLVideoElement | null;
    expect(preview).toBeInTheDocument();
    expect(preview?.muted).toBe(true);
    expect(preview).toHaveAttribute("autoplay");
    expect(preview).toHaveAttribute("playsinline");

    fireEvent.pointerLeave(leadButton.parentElement!);
    expect(leadButton.querySelector("video")).not.toBeInTheDocument();
    expect(leadButton.querySelector("img")).toBeInTheDocument();
  });

  it("starts a muted preview on another home card without changing its accessible label", () => {
    vi.useFakeTimers();
    renderScene();
    const nextItem = SHORTS_WALLS["for-you"].items[1];
    const hero = screen.getByRole("region", { name: "Vidéos recommandées" });
    const nextButton = within(hero).getByRole("link", {
      name: `Regarder ${nextItem.title} de ${nextItem.artist}`,
    });

    fireEvent.pointerEnter(nextButton.parentElement!);
    act(() => vi.advanceTimersByTime(720));

    const preview = nextButton.querySelector("video") as HTMLVideoElement | null;
    expect(preview).toBeInTheDocument();
    expect(preview?.muted).toBe(true);
    expect(preview).toHaveAttribute("autoplay");
    expect(nextButton).toHaveAccessibleName(`Regarder ${nextItem.title} de ${nextItem.artist}`);

    fireEvent.pointerLeave(nextButton.parentElement!);
    expect(nextButton.querySelector("video")).not.toBeInTheDocument();
    expect(nextButton.querySelector("img")).toBeInTheDocument();
  });

  it("does not start the card preview when reduced motion is requested", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    renderScene();
    const lead = SHORTS_WALLS["for-you"].items[0];
    const hero = screen.getByRole("region", { name: "Vidéos recommandées" });
    const leadButton = within(hero).getByRole("link", {
      name: `Regarder ${lead.title} de ${lead.artist}`,
    });

    fireEvent.pointerEnter(leadButton.parentElement!);
    act(() => vi.advanceTimersByTime(2_000));

    expect(leadButton.querySelector("video")).not.toBeInTheDocument();
    expect(leadButton.querySelector("img")).toBeInTheDocument();
  });

  it("opens the side menu on a video without replacing the player, and closes it with Escape", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene(`/scene?video=${item.id}`);
    skipPreroll();
    const video = screen.getByLabelText(`Lecture de ${item.title}`);
    const toggle = screen.getByRole("button", { name: "Ouvrir le menu vidéo" });
    expect(screen.queryByRole("complementary", { name: "Navigation vidéo" })).not.toBeInTheDocument();
    await user.click(toggle);
    const menu = screen.getByRole("complementary", { name: "Navigation vidéo" });
    expect(within(menu).getByRole("region", { name: "Tes abonnements" })).toBeVisible();
    expect(within(menu).getByRole("link", { name: "Vous" })).toBeVisible();
    expect(screen.getByLabelText(`Lecture de ${item.title}`)).toBe(video);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Navigation vidéo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Lecture de ${item.title}`)).toBe(video);
    expect(toggle).toHaveFocus();
    await user.click(toggle);
    await user.click(within(screen.getByRole("complementary", { name: "Navigation vidéo" })).getByRole("link", { name: "Historique" }));
    expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent("/scene/history");
    expect(document.querySelector(".scene-watch-menu")).not.toBeInTheDocument();
  }, 15_000);

  it("keeps focus in the open menu when the advertisement finishes", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene(`/scene?video=${item.id}`);
    await user.click(screen.getByRole("button", { name: "Ouvrir le menu vidéo" }));
    const menu = screen.getByRole("complementary", { name: "Navigation vidéo" });
    const focusedLink = within(menu).getByRole("link", { name: "Accueil" });
    expect(focusedLink).toHaveFocus();
    fireEvent.ended(screen.getByLabelText("Publicité : découvre MeeWav"));
    expect(screen.getByLabelText(`Lecture de ${item.title}`)).toBeInTheDocument();
    expect(focusedLink).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Navigation vidéo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText(`Lecture de ${item.title}`)).toBeInTheDocument();
  });

  it("uses the Rooms confirmation and celebrates a Golden Like only after confirmation", async () => {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function(this: HTMLDialogElement) { this.removeAttribute("open"); } });
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene(`/scene?video=${item.id}`);
    skipPreroll();
    await user.click(screen.getByRole("button", { name: /Offrir un Golden Like/ }));
    expect(screen.getByRole("dialog", { name: `Offrir ton Golden Like à ${item.artist} ?` })).toHaveClass("room-golden-like");
    expect(document.querySelector(".live-action-burst--golden")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Offrir un Golden Like/ }));
    await user.click(screen.getByRole("button", { name: "Offrir mon Golden Like" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.querySelector(".live-action-burst--golden")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Golden Like déjà offert/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText(`Lecture de ${item.title}`)).toBeInTheDocument();
  }, 15_000);

  it("opens the complete on-demand player from the home grid", async () => {
    const user = userEvent.setup();
    const headline = SHORTS_WALLS["for-you"].items[0];
    renderScene();

    const hero = screen.getByRole("region", { name: "Vidéos recommandées" });
    await user.click(within(hero).getByRole("link", {
      name: `Regarder ${headline.title} de ${headline.artist}`,
    }));

    skipPreroll();
    const playerDialog = screen.getByRole("region", { name: `Lecteur de ${headline.title}` });
    const player = within(playerDialog).getByLabelText(`Lecture de ${headline.title}`);

    expect(player).toHaveAttribute("src", headline.video);
    expect(player).toHaveAttribute("autoplay");
    expect(player).toHaveAttribute("playsinline");
    expect(within(playerDialog).getByRole("button", { name: /Réduire en mini-lecteur/ })).toBeVisible();
    expect(within(playerDialog).getByRole("button", { name: /Mode cinéma/ })).toBeVisible();
    expect(within(playerDialog).getByRole("button", { name: /Plein écran/ })).toBeVisible();

    await waitFor(() => {
      expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent(
        getSceneWatchPath(`${headline.title
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLocaleLowerCase("fr-FR")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")}-${headline.id}`),
      );
    });
  });

  it("resolves canonical vertical and artist deep links", () => {
    const vertical = SHORTS_WALLS.vertical.items[0];
    const { unmount } = renderScene(getSceneVerticalPath(vertical.id));
    skipPreroll();
    expect(screen.getByRole("dialog", { name: `Lecteur de ${vertical.title}` })).toBeVisible();
    expect(screen.getByLabelText("Route La Scène active"))
      .toHaveTextContent(getSceneVerticalPath(vertical.id));

    unmount();
    const artistVideo = SHORTS_WALLS["for-you"].items[0];
    renderScene(getSceneArtistPath(artistVideo.mockArtistId));
    expect(screen.getByRole("heading", {
      name: `Les créations de ${artistVideo.artist}`,
    })).toBeVisible();
  });

  it("opens the creator drawer from /scene/upload and returns to La Scène when closed", async () => {
    const user = userEvent.setup();
    renderScene("/scene/upload");

    expect(await screen.findByRole("dialog", { name: "Publier dans La Scène" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.getByLabelText("Route La Scène active"))
      .toHaveTextContent("/scene"));
  });

  it("uses the shared MeeWav filter panel and synchronizes active filters with /scene", async () => {
    const user = userEvent.setup();
    renderScene();

    await user.click(screen.getByRole("button", { name: "Ouvrir les filtres" }));
    const filterDialog = screen.getByRole("dialog", { name: "Affiner les vidéos" });
    const performanceFilter = within(filterDialog).getByRole("button", { name: "Performance" });

    expect(performanceFilter).toHaveAttribute("aria-pressed", "false");
    await user.click(performanceFilter);
    expect(performanceFilter).toHaveAttribute("aria-pressed", "true");
    await user.click(within(filterDialog).getByRole("button", {
      name: /Afficher \d+ contenus?/,
    }));

    expect(screen.getAllByRole("button", { name: "Performance" }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Explore toute La Scène." })).toBeVisible();
    await waitFor(() => {
      const routeText = screen.getByLabelText("Route La Scène active").textContent ?? "";
      const [pathname, search = ""] = routeText.split("?");
      const params = new URLSearchParams(search);
      expect(pathname).toBe("/scene");
      expect(params.getAll("type")).toContain("performance");
      expect(params.get("view")).toBe("explore");
    });
  }, 15_000);

  it("keeps live Room catalogs and Tremplin financial data outside La Scène", () => {
    renderScene();

    const page = screen.getByRole("main", { name: SCENE_NAME });
    expect(within(page).getByRole("navigation", { name: "Catégories vidéo" })).toHaveTextContent("Replay de Room");

    expect(page).not.toHaveTextContent(/Rooms qui buzzent/i);
    expect(page).not.toHaveTextContent(/Top Rooms/i);
    expect(page).not.toHaveTextContent(/prochaines Rooms/i);
    expect(page).not.toHaveTextContent(/valeur actuelle/i);
    expect(page).not.toHaveTextContent(/variation (sur )?24 h/i);
    expect(page).not.toHaveTextContent(/prix du jeton/i);
  });

  it("persists a video in the accessible À regarder plus tard playlist", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene();

    const optionsButton = screen.getAllByRole("button", {
      name: `Actions pour ${item.title}`,
    })[0];
    expect(optionsButton).toHaveAttribute("aria-expanded", "false");
    await user.click(optionsButton);

    const cardMenu = screen.getByRole("menu", { name: `Actions pour ${item.title}` });
    await user.click(within(cardMenu).getByRole("menuitem", {
      name: "À regarder plus tard",
    }));

    await waitFor(() => {
      expect(scenePlaylistRepository.containsVideo(
        SCENE_WATCH_LATER_PLAYLIST_ID,
        item.id,
      )).toBe(true);
      const persisted = parseScenePlaylists(
        window.localStorage.getItem(scenePrivateKey(SCENE_PLAYLISTS_STORAGE_KEY)),
      );
      expect(persisted.find(({ id }) => id === SCENE_WATCH_LATER_PLAYLIST_ID)?.videoIds)
        .toContain(item.id);
    });
    expect(optionsButton.closest("article")).toHaveClass("is-saved");
  });

  it("adds a video to the named default playlist", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene();

    await user.click(screen.getAllByRole("button", {
      name: `Actions pour ${item.title}`,
    })[0]);
    await user.click(within(
      screen.getByRole("menu", { name: `Actions pour ${item.title}` }),
    ).getByRole("menuitem", { name: "Ajouter à une playlist" }));

    await waitFor(() => {
      const playlist = scenePlaylistRepository.read().find(({ title }) => title === "Ma playlist");
      expect(playlist?.videoIds).toContain(item.id);
    });
    expect(screen.getByText(`${item.title} ajouté à « Ma playlist ».`))
      .toHaveAttribute("role", "status");
  });

  it("keeps compact video menus focused on media actions", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS["for-you"].items[0];
    renderScene();

    await user.click(screen.getAllByRole("button", {
      name: `Actions pour ${item.title}`,
    })[0]);

    const menu = screen.getByRole("menu", { name: `Actions pour ${item.title}` });
    expect(within(menu).getByRole("menuitem", { name: "À regarder plus tard" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Ajouter à une playlist" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Partager la vidéo" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Voir le profil" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Pas intéressé" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Ne plus recommander cet artiste" })).toBeVisible();
    expect(within(menu).getByRole("menuitem", { name: "Signaler" })).toBeVisible();
    expect(within(menu).queryByText(/collab|message|jeton/i)).not.toBeInTheDocument();
  });

  it("uses La Scène wording for notifications", async () => {
    const user = userEvent.setup();
    renderScene();

    const notificationButton = screen.getByRole("button", {
      name: "Notifications de La Scène, 3 non lues",
    });
    await user.click(notificationButton);

    const panel = screen.getByRole("region", { name: "Notifications de La Scène" });
    const markAllRead = within(panel).getByRole("button", { name: /Tout lire/ });
    await user.click(markAllRead);

    expect(screen.getByRole("button", { name: "Notifications de La Scène" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(markAllRead).toBeDisabled();
  });

  it("opens and closes a published Room replay deep link on the canonical /scene route", async () => {
    const user = userEvent.setup();
    const wall = SHORTS_WALLS.replays;
    const video = wall.items[0];
    renderScene(`/scene?feed=${wall.id}&video=${video.id}`);
    skipPreroll();
    expect(screen.getByRole("region", { name: `Lecteur de ${video.title}` })).toBeVisible();
    expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent(
      `/scene?feed=${wall.id}&video=${video.id}`,
    );

    await user.click(screen.getByRole("button", { name: "Fermer le lecteur" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Route La Scène active")).toHaveTextContent(
        `/scene?feed=${wall.id}`,
      );
    });
    expect(screen.queryByRole("region", { name: `Lecteur de ${video.title}` })).not.toBeInTheDocument();
  }, 15_000);
});
