import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AudioEnginePlugin } from "../audio-engine/audioEngine.types";
import PlacePluginManager from "./PlacePluginManager";

afterEach(cleanup);

const plugins: AudioEnginePlugin[] = [
  {
    id: "sixthsample.spoton",
    name: "Spoton",
    vendor: "Sixth Sample",
    version: "1.1.2",
    format: "vst3",
    status: "ready",
    licensed: true,
    hasEditor: true,
    latencySamples: 0,
    capabilities: ["pitch_correction"],
  },
  {
    id: "auburnsounds.graillon3",
    name: "Graillon 3",
    vendor: "Auburn Sounds",
    version: "3.2.0",
    format: "vst3",
    status: "ready",
    licensed: true,
    hasEditor: true,
    latencySamples: 1_074,
    capabilities: ["pitch_correction"],
  },
];

function renderManager(overrides: Partial<ComponentProps<typeof PlacePluginManager>> = {}) {
  const props: ComponentProps<typeof PlacePluginManager> = {
    plugins,
    activePluginId: "sixthsample.spoton",
    onUse: vi.fn(),
    onRemoveFromChain: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
  render(<PlacePluginManager {...props} />);
  return props;
}

describe("PlacePluginManager", () => {
  it("shows complete detected plugin identities and explicit chain actions", async () => {
    const props = renderManager();

    expect(screen.getByText("Spoton")).toBeVisible();
    expect(screen.getByText("Sixth Sample · version 1.1.2")).toBeVisible();
    expect(screen.getByText("Graillon 3")).toBeVisible();
    expect(screen.getByText("Auburn Sounds · version 3.2.0")).toBeVisible();
    expect(screen.getByText("Effets casque actifs")).toBeVisible();

    const graillonRow = screen.getByText("Graillon 3").closest("article");
    fireEvent.click(within(graillonRow!).getByRole("button", { name: "Vérifier et utiliser" }));
    expect(props.onUse).toHaveBeenCalledWith("auburnsounds.graillon3");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retirer Spoton de MeeWav" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Retirer Spoton de MeeWav" }));
    expect(props.onRemoveFromChain).toHaveBeenCalledWith("sixthsample.spoton");
  });

  it("refreshes through the supplied API action", async () => {
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderManager({ onRefresh });

    fireEvent.click(screen.getByRole("button", { name: "Scanner mon PC pour détecter les plugins" }));

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
  });

  it("opens an official-only catalogue without file picker or Web uninstall action", () => {
    renderManager();

    fireEvent.click(screen.getByRole("button", { name: "Installer un plugin" }));

    expect(screen.getByText("Installer depuis le site officiel")).toBeVisible();
    expect(screen.getByText(/MeeWav ne reçoit aucun chemin de fichier/i)).toBeVisible();
    expect(screen.queryByRole("textbox", { name: /chemin/i })).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByRole("button", { name: /Désinstaller/i })).not.toBeInTheDocument();

    const links = screen.getAllByRole("link", { name: /Site officiel/i });
    expect(links).toHaveLength(4);
    expect(links[0]).toHaveAttribute("href", "https://www.antarestech.com/products/auto-tune/pro");
    expect(links[0]).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(links[2]).toHaveAttribute("href", "https://sixthsample.com/spoton/");
    expect(links[3]).toHaveAttribute("href", "https://www.auburnsounds.com/products/Graillon.html");
  });

  it("keeps unavailable plugins out of the usable list", () => {
    renderManager({ plugins: [] });

    expect(screen.getByText("Aucun plugin utilisable affiché")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Vérifier et utiliser" })).not.toBeInTheDocument();
  });

  it("removes a plugin from MeeWav without pretending to uninstall Windows and restores it on rescan", async () => {
    const onRemoveFromChain = vi.fn().mockResolvedValue(undefined);
    const onRefresh = vi.fn().mockResolvedValue(undefined);
    renderManager({ onRemoveFromChain, onRefresh });

    fireEvent.click(screen.getByRole("button", { name: "Retirer Spoton de MeeWav" }));
    await waitFor(() => expect(screen.queryByText("Spoton")).not.toBeInTheDocument());
    expect(onRemoveFromChain).toHaveBeenCalledWith("sixthsample.spoton");
    expect(screen.getByText(/sans le désinstaller/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Scanner mon PC pour détecter les plugins" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByText("Spoton")).toBeVisible();
  });

  it("lets the native host verify a detected candidate without claiming its vendor licence", () => {
    const onUse = vi.fn();
    renderManager({
      activePluginId: null,
      onUse,
      plugins: [{
        id: "antares.autotune",
        name: "Auto-Tune Pro",
        vendor: "Antares",
        version: "11.0.0",
        format: "vst3",
        status: "disabled",
        licensed: false,
        hasEditor: false,
        latencySamples: 2_670,
        capabilities: ["pitch_correction", "detected_local", "local_monitoring", "probe_required", "native_host_available"],
      }],
    });

    expect(screen.getByText("À vérifier")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Vérifier et utiliser" }));
    expect(onUse).toHaveBeenCalledWith("antares.autotune");
  });
});
