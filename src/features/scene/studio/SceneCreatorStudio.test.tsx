import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SceneCreatorStudio from "./SceneCreatorStudio";

vi.mock("../../auth/AuthContext", () => ({ useAuth: () => ({ user: null }) }));

describe("SceneCreatorStudio", () => {
  afterEach(cleanup);
  it("montre un tableau de bord créateur rempli et ouvre le flux de publication", () => {
    const onPublish = vi.fn();
    render(<SceneCreatorStudio pathname="/scene/studio" onNavigate={vi.fn()} onPublish={onPublish} />);

    expect(screen.getByRole("heading", { name: "Studio La Scène" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bonjour Naya." })).toBeInTheDocument();
    expect(screen.getByText("Sous la lumière | MeeWav Session")).toBeInTheDocument();
    expect(screen.getByText("Ce qui demande ton attention")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("sépare les droits de publication et la diffusion TV", () => {
    render(<SceneCreatorStudio pathname="/scene/studio/rights" onNavigate={vi.fn()} onPublish={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Droits & collaborations" })).toBeInTheDocument();
    expect(screen.getByText(/Une autorisation La Scène ne vaut jamais automatiquement/)).toBeInTheDocument();
    const tvGrant = screen.getByText("MeeWav TV", { selector: ".scene-studio-grants span" }).parentElement!;
    expect(within(tvGrant).getByText("Non autorisé")).toBeInTheDocument();
  });

  it("utilise des routes réelles pour les sections", () => {
    const onNavigate = vi.fn();
    render(<SceneCreatorStudio pathname="/scene/studio/analytics" onNavigate={onNavigate} onPublish={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Analyses" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Contenus" }));
    expect(onNavigate).toHaveBeenCalledWith("/scene/studio/content");
  });
});
