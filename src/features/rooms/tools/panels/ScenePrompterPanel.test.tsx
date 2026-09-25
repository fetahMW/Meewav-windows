import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { RoomToolsCommand, SceneState } from "../roomTools.types";
import ScenePrompterPanel from "./ScenePrompterPanel";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function StatefulPrompter({ initialScene, onCommand = vi.fn(), busyDelay = 0 }: { initialScene: SceneState; onCommand?: (command: RoomToolsCommand) => void; busyDelay?: number }) {
  const [scene, setScene] = useState(initialScene);
  const [busy, setBusy] = useState(false);
  const execute = async (command: RoomToolsCommand) => {
    onCommand(command);
    setBusy(true);
    if (busyDelay) await new Promise((resolve) => setTimeout(resolve, busyDelay));
    setScene((current) => {
      if (command.type === "scene.prompter.patch") return { ...current, prompter: { ...current.prompter, ...command.patch } };
      if (command.type === "scene.prompter.update") return { ...current, prompter: { ...current.prompter, texts: current.prompter.texts.map((text) => text.id === command.textId ? { ...text, ...command.patch } : text) } };
      return current;
    });
    setBusy(false);
  };
  return <ScenePrompterPanel scene={scene} role="host" disabled={busy} execute={execute} />;
}

const advance = async (milliseconds: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); }); };
const launch = async () => { await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Démarrer sur mon écran/ })); }); };

describe("ScenePrompterPanel", () => {
  it("opens a private viewport portal and counts down before advancing the focused line", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.countdown = 3;
    const execute = vi.fn();
    const { container } = render(<StatefulPrompter initialScene={scene} onCommand={execute} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await launch();
    const dialog = screen.getByRole("dialog", { name: /Prompteur privé/ });
    expect(dialog.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
    expect(within(dialog).getByRole("status")).toHaveTextContent("3");
    expect(execute).toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { playing: false, line: 0 } });
    await advance(1_000);
    expect(within(dialog).getByRole("status")).toHaveTextContent("2");
    await advance(1_000);
    expect(within(dialog).getByRole("status")).toHaveTextContent("1");
    expect(execute).not.toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { playing: true } });
    await advance(1_000);
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(execute).toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { playing: true } });
    await advance(2_000);
    expect(execute).toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { line: 1 } });
    expect(within(dialog).getByText("Je garde le tempo, je garde le nom")).toHaveAttribute("aria-current", "true");
  });

  it("does not open or advance a reader from remote playing state", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.playing = true;
    const execute = vi.fn();
    render(<ScenePrompterPanel scene={scene} role="host" disabled={false} execute={execute} />);
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    fireEvent.keyDown(document.body, { key: "ArrowDown" });
    await advance(5_000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
  });

  it("cancels the countdown on Escape, pauses, and restores the background and focus", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    const execute = vi.fn();
    const { container } = render(<StatefulPrompter initialScene={scene} onCommand={execute} />);
    const start = screen.getByRole("button", { name: /Démarrer sur mon écran/ });
    start.focus();
    await launch();
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog")).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await advance(5_000);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { playing: false } });
    expect(execute).not.toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { playing: true } });
    expect(container.inert).not.toBe(true);
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(start).toHaveFocus();
  });

  it("supports pause, line navigation, Home and focus containment only inside the open reader", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.countdown = 0;
    const execute = vi.fn();
    render(<StatefulPrompter initialScene={scene} onCommand={execute} />);
    await launch();
    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { code: "Space", key: " " });
    await advance(3_000);
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { playing: false } });
    expect(execute).not.toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { line: 1 } });
    fireEvent.keyDown(dialog, { key: "ArrowDown", ctrlKey: true });
    expect(execute).not.toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { line: 1 } });
    await act(async () => { fireEvent.keyDown(dialog, { key: "ArrowDown" }); });
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { line: 1 } });
    await act(async () => { fireEvent.keyDown(dialog, { key: "Home" }); });
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { line: 0, playing: false } });
    const close = within(dialog).getByRole("button", { name: "Fermer le prompteur" });
    const mirror = within(dialog).getByRole("button", { name: "Mode miroir" });
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(mirror).toHaveFocus();
    fireEvent.keyDown(mirror, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("centers the newly focused lyric in the reading viewport", async () => {
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.countdown = 0;
    const execute = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ScenePrompterPanel scene={scene} role="host" disabled={false} execute={execute} />);
    await launch();
    const reader = screen.getByLabelText("Paroles");
    const nextLine = within(reader).getByText("Je garde le tempo, je garde le nom");
    Object.defineProperty(reader, "clientHeight", { value: 600 });
    vi.spyOn(reader, "getBoundingClientRect").mockReturnValue({ top: 80, height: 600 } as DOMRect);
    vi.spyOn(nextLine, "getBoundingClientRect").mockReturnValue({ top: 1_080, height: 80 } as DOMRect);
    const scrollTo = vi.fn();
    reader.scrollTo = scrollTo;
    rerender(<ScenePrompterPanel scene={{ ...scene, prompter: { ...scene.prompter, line: 1 } }} role="host" disabled={false} execute={execute} />);
    expect(scrollTo).toHaveBeenCalledWith({ top: 740, behavior: "smooth" });
  });

  it("saves edited lyrics before launching even when the shell is temporarily busy", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.countdown = 0;
    const execute = vi.fn();
    render(<StatefulPrompter initialScene={scene} onCommand={execute} busyDelay={100} />);
    fireEvent.click(screen.getByRole("button", { name: "Modifier le texte et les repères" }));
    fireEvent.change(screen.getByLabelText("Paroles et repères"), { target: { value: "Mes paroles corrigées\nMon refrain" } });
    await launch();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(100);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Mes paroles corrigées")).toBeInTheDocument();
    expect(execute).toHaveBeenNthCalledWith(1, { type: "scene.prompter.update", textId: "text-1", patch: { title: "Lumière noire", body: "Mes paroles corrigées\nMon refrain" } });
    expect(execute).toHaveBeenNthCalledWith(2, { type: "scene.prompter.patch", patch: { playing: true, line: 0 } });
    // Closing during the playback command still queues a pause after that write.
    fireEvent.click(screen.getByRole("button", { name: "Fermer le prompteur" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(100);
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { playing: false } });
    await advance(100);
  });

  it("restarts a finished text with one atomic playback command", async () => {
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.countdown = 0;
    scene.prompter.line = scene.prompter.texts[0].body.split("\n").length - 1;
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<ScenePrompterPanel scene={scene} role="host" disabled={false} execute={execute} />);
    await launch();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith({ type: "scene.prompter.patch", patch: { playing: true, line: 0 } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Recommencer" })); });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenLastCalledWith({ type: "scene.prompter.patch", patch: { line: 0, playing: true } });
  });

  it("locks command controls while disabled and never leaks lyrics to viewers", async () => {
    vi.useFakeTimers();
    const scene = createRoomToolsFixture("scene").scene!;
    scene.prompter.playing = true;
    const execute = vi.fn();
    const { container, rerender } = render(<ScenePrompterPanel scene={scene} role="host" disabled execute={execute} />);
    const controls = Array.from(container.querySelectorAll("button, input, select, textarea"));
    expect(controls.length).toBeGreaterThan(10);
    controls.forEach((control) => expect(control).toBeDisabled());
    fireEvent.keyDown(document.body, { code: "Space", key: " " });
    await advance(5_000);
    expect(execute).not.toHaveBeenCalled();
    rerender(<ScenePrompterPanel scene={scene} role="viewer" disabled={false} execute={execute} />);
    expect(screen.getByText(/Le Prompteur est privé/)).toBeInTheDocument();
    expect(screen.queryByText("La ville s'endort sous les néons")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await advance(5_000);
    expect(execute).not.toHaveBeenCalled();
  });
});
