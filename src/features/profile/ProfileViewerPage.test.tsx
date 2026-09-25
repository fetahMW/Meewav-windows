import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { demoPreProfileArtist } from "../globe/components/preProfile/demoPreProfileArtist";
import ProfileViewerPage from "./ProfileViewerPage";

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={[{
      pathname: `/profile/view/${demoPreProfileArtist.id}`,
      state: {
        from: "/globe",
        artist: demoPreProfileArtist,
        isOwner: false,
      },
    }]}>
      <Routes>
        <Route path="/profile/view/:profileId" element={<ProfileViewerPage />} />
        <Route path="/globe" element={<LocationProbe />} />
        <Route path="/scene" element={<LocationProbe />} />
        <Route path="/messages" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfileViewerPage", () => {
  it("affiche un véritable hub public sans outils privés du Host", async () => {
    renderViewer();
    const user = userEvent.setup();

    expect(screen.getByRole("heading", { level: 1, name: /SiaDrums/i })).toBeInTheDocument();
    expect(screen.getByText("PROFIL PUBLIC")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivre gratuitement" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Tout ce qui compte, sans chercher" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Créations/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Créations/ }));
    expect(screen.getByRole("heading", { name: "Écouter et regarder" })).toBeInTheDocument();
    expect(screen.getAllByText(/Média local de démonstration/).length).toBeGreaterThan(1);
    expect(screen.getAllByLabelText(/^Lire /).length).toBeGreaterThan(1);
    expect(screen.queryByText("Espace privé")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Modifier le profil/i })).not.toBeInTheDocument();
  });

  it("ouvre les statistiques publiques depuis le niveau 2", async () => {
    renderViewer();
    const user = userEvent.setup();

    await user.click(screen.getAllByRole("button", { name: "Statistiques" })[0]);
    expect(screen.getByRole("heading", { name: "Comprendre son activité récente" })).toBeInTheDocument();
    expect(screen.getByText("Vues du profil")).toBeInTheDocument();
    expect(screen.queryByText(/portefeuille/i)).not.toBeInTheDocument();
  });

  it("permet le suivi local puis le retour au Globe", async () => {
    renderViewer();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Suivre gratuitement" }));
    expect(screen.getByRole("button", { name: "Suivi" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Retour au Globe" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/globe");
  });

  it("ouvre les vidéos de l’artiste sur la route canonique de La Scène", async () => {
    renderViewer();
    const user = userEvent.setup();
    const sceneButtons = screen.getAllByRole("button", { name: /La Scène/ });

    await user.click(sceneButtons[sceneButtons.length - 1]);

    expect(screen.getByTestId("location")).toHaveTextContent("/scene");
  });

  it("met le grade en avant et branche message et collaboration sur la Messagerie", async () => {
    const user = userEvent.setup();
    const { unmount } = renderViewer();

    expect(screen.queryByLabelText("Profil vérifié")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Grade MeeWav de SiaDrums/i))
      .toHaveClass("mw-grade-badge--compact-pill", "mw-grade-badge--md");
    expect(screen.getByRole("button", { name: "Demande de collab" })).toBeEnabled();

    await user.click(screen.getAllByRole("button", { name: "Message" })[0]);
    expect(screen.getByTestId("location")).toHaveTextContent("/messages?space=messages");
    expect(screen.getByTestId("location")).toHaveTextContent("intent=message");
    expect(screen.getByTestId("location")).toHaveTextContent("source=profile");

    unmount();
    renderViewer();
    await user.click(screen.getByRole("button", { name: "Demande de collab" }));
    expect(screen.getByRole("dialog", { name: /Proposer un projet à SiaDrums/i })).toBeVisible();
    expect(screen.getByRole("textbox", { name: /^Idée de collaboration/ })).toBeEnabled();
  });
});
