import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ClasseScreenShareToolPanel from "./ClasseScreenShareToolPanel";

const screenShare = {
  host: { displayName: "Host Test", avatarUrl: "" },
  disabled: false,
  previewStream: null,
  published: false,
  requesting: false,
  hasAudio: false,
  sourceLabel: null,
  onSelect: vi.fn(async () => undefined),
  onPublish: vi.fn(),
  onStop: vi.fn(),
};

afterEach(cleanup);

describe("shared screen-share panel", () => {
  it.each(["La Classe", "La Wave"])("keeps the canonical live status and stop action for %s", async (roomLabel) => {
    const onStop = vi.fn();
    render(<ClasseScreenShareToolPanel {...screenShare} roomLabel={roomLabel} published onStop={onStop} />);
    expect(await screen.findByText("SCÈNE")).toBeVisible();
    expect(screen.getByText("● Partage d’écran actif")).toHaveClass("sr-only");
    fireEvent.click(screen.getByRole("button", { name: "Arrêter le partage" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("allows any selected screen source without requiring DAW audio", async () => {
    const onPublish = vi.fn();
    render(<ClasseScreenShareToolPanel {...screenShare} roomLabel="La Wave" previewStream={{} as MediaStream} sourceLabel="Fenêtre" onPublish={onPublish} />);
    const publish = await screen.findByRole("button", { name: "Démarrer le partage" });
    expect(publish).toBeEnabled();
    expect(screen.queryByText("Audio système manquant")).not.toBeInTheDocument();
    fireEvent.click(publish);
    expect(onPublish).toHaveBeenCalledOnce();
  });
});
