import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import { WAVE_LOOP_CATEGORIES } from "../waveLoopCategories";
import WaveGateIntakeControl from "./WaveGateIntakeControl";

afterEach(cleanup);

function setup() {
  const execute = vi.fn().mockResolvedValue(undefined);
  const wave = createRoomToolsFixture("wave").wave!;
  render(<WaveGateIntakeControl wave={wave} disabled={false} execute={execute} />);
  const trigger = screen.getByRole("button", { name: "Soumissions ouvertes" });
  fireEvent.click(trigger);
  return { execute, trigger, dialog: screen.getByRole("dialog", { name: "Ouverture du sas" }) };
}

describe("catégories d’ouverture du sas", () => {
  it("affiche les cinq chips partagés sans les anciens points et garde des noms accessibles", () => {
    const { dialog } = setup();
    for (const category of WAVE_LOOP_CATEGORIES) {
      const checkbox = within(dialog).getByRole("checkbox", { name: category.label });
      const label = checkbox.closest("label")!;
      const chip = within(label).getByText(category.badge);
      expect(chip).toHaveClass("wave-category-chip");
      expect(chip.style.getPropertyValue("--wave-loop-accent")).toBe(category.color);
      expect(label.querySelector("i")).not.toBeInTheDocument();
      expect(checkbox).toBeChecked();
    }
  });

  it("permet de filtrer avec les chips sans envoyer de commande avant Appliquer", async () => {
    const { execute, dialog } = setup();
    for (const category of WAVE_LOOP_CATEGORIES.filter(category => category.id !== "drums")) {
      fireEvent.click(within(dialog).getByText(category.badge));
    }
    expect(within(dialog).getByRole("checkbox", { name: "Drums" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Basses" })).not.toBeChecked();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "wave.submissions.setOpen", open: true, acceptedCategories: ["drums"],
    }));
  });

  it("conserve la protection contre une sélection vide et le raccourci Tout accepter", () => {
    const { dialog, execute } = setup();
    for (const category of WAVE_LOOP_CATEGORIES) fireEvent.click(within(dialog).getByText(category.badge));
    expect(within(dialog).getByRole("button", { name: "Appliquer" })).toBeDisabled();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Tout accepter" }));
    for (const checkbox of within(dialog).getAllByRole("checkbox")) expect(checkbox).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Appliquer" })).toBeEnabled();
  });

  it("annule les modifications par Échap et rend le focus au déclencheur", () => {
    const { dialog, trigger, execute } = setup();
    fireEvent.click(within(dialog).getByText("BASSE"));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(screen.getByRole("checkbox", { name: "Basses" })).toBeChecked();
  });
});
