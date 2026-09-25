import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WaveListeningSelector from "./WaveListeningSelector";

afterEach(cleanup);

describe("sélecteur compact du lecteur Wave", () => {
  it.each(["base", "loop", "mix"] as const)("affiche le choix %s sans action de lecture implicite", (mode) => {
    const onChange = vi.fn();
    render(<WaveListeningSelector mode={mode} hasCandidate onChange={onChange} />);
    const labels = { base: "BASE", loop: "BOUCLE", mix: "MIX" };
    expect(screen.getByRole("radio", { name: labels[mode] })).toHaveAttribute("aria-checked", "true");
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "MIX" }));
    expect(onChange).toHaveBeenCalledWith("mix");
  });
  it("désactive l’audition sans candidate et permet de naviguer au clavier dès sa sélection", () => {
    const onChange = vi.fn();
    const { rerender } = render(<WaveListeningSelector mode="base" hasCandidate={false} onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "BASE" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "BOUCLE" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "MIX" })).toBeDisabled();
    rerender(<WaveListeningSelector mode="base" hasCandidate onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("radio", { name: "BASE" }), { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: "BOUCLE" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("loop");
  });

  it("réserve BEAT au moteur interne et présente BASE comme premier choix", () => {
    render(<WaveListeningSelector mode="beat" hasCandidate onChange={vi.fn()} />);
    expect(screen.queryByRole("radio", { name: "BEAT" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "BASE" })).toHaveAttribute("tabindex", "0");
  });
});
