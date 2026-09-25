import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { demoPreProfileArtist } from "../globe/components/preProfile/demoPreProfileArtist";
import ProfileViewerOverlay from "./ProfileViewerOverlay";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderOverlay({ isOwner = false, onClose = vi.fn() } = {}) {
  render(
    <MemoryRouter>
      <ProfileViewerOverlay
        profileId={demoPreProfileArtist.id}
        artist={demoPreProfileArtist}
        isOwner={isOwner}
        onClose={onClose}
      />
    </MemoryRouter>,
  );
  return onClose;
}

describe("ProfileViewerOverlay", () => {
  it("ouvre le profil public au-dessus du Globe sans exposer les outils Host", () => {
    renderOverlay();

    expect(screen.getByRole("dialog", { name: demoPreProfileArtist.name })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /SiaDrums/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivre gratuitement" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Modifier le profil/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Espace privé")).not.toBeInTheDocument();
  });

  it("ne ferme pas sur un clic extérieur mais se ferme avec la croix", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderOverlay({ onClose });

    await user.click(document.querySelector(".profile-viewer-overlay-backdrop") as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Fermer le profil et revenir au Globe" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("se ferme également avec Échap", () => {
    const onClose = vi.fn();
    renderOverlay({ onClose });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ferme uniquement le compositeur Collab avec Échap lorsqu’il est imbriqué", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderOverlay({ onClose });

    await user.click(screen.getByRole("button", { name: "Demande de collab" }));
    expect(screen.getByRole("dialog", {
      name: `Proposer un projet à ${demoPreProfileArtist.name}`,
    })).toBeInTheDocument();
    expect(document.querySelector(".profile-viewer-mobile-dock")).not.toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", {
      name: `Proposer un projet à ${demoPreProfileArtist.name}`,
    })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: demoPreProfileArtist.name })).toBeInTheDocument();
  });

  it("isole le Globe des lecteurs d’écran puis restaure le focus à la fermeture", () => {
    const appRoot = document.createElement("div");
    appRoot.id = "root";
    const trigger = document.createElement("button");
    trigger.textContent = "Ouvrir le profil";
    appRoot.append(trigger);
    document.body.append(appRoot);
    trigger.focus();

    const rendered = render(
      <MemoryRouter>
        <ProfileViewerOverlay
          profileId={demoPreProfileArtist.id}
          artist={demoPreProfileArtist}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(appRoot).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Fermer le profil et revenir au Globe" })).toHaveFocus();

    rendered.unmount();
    expect(appRoot).not.toHaveAttribute("inert");
    expect(trigger).toHaveFocus();
    appRoot.remove();
  });

  it("masque les actions relationnelles sur son propre profil", () => {
    renderOverlay({ isOwner: true });

    expect(screen.queryByRole("button", { name: "Suivre gratuitement" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Message" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Partager ce profil" })).toBeEnabled();
  });

  it("conserve un monogramme lisible quand l’avatar public ne charge pas", () => {
    render(
      <MemoryRouter>
        <ProfileViewerOverlay
          profileId={demoPreProfileArtist.id}
          artist={demoPreProfileArtist}
          onClose={vi.fn()}
        />
      </MemoryRouter>,
    );

    fireEvent.error(screen.getByAltText(`Portrait de ${demoPreProfileArtist.name}`));
    expect(screen.queryByAltText(`Portrait de ${demoPreProfileArtist.name}`)).not.toBeInTheDocument();
    expect(document.querySelector(".profile-viewer-hero__portrait-fallback")).toHaveTextContent(
      demoPreProfileArtist.portraitFallback,
    );
  });
});
