import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceCorrectionAbxPanel } from "./VoiceCorrectionAbxPanel";

afterEach(cleanup);

describe("VoiceCorrectionAbxPanel", () => {
  const recordings = {
    dry: "blob:dry-reference",
    processed: "blob:processed-reference",
    durationMs: 4_200,
  };

  it("keeps X blind until reveal and reports only a discrimination result", () => {
    render(<VoiceCorrectionAbxPanel recordings={recordings} random={() => 0.2} />);

    expect(screen.getByLabelText("Écouter la référence A sèche")).toHaveAttribute("src", recordings.dry);
    expect(screen.getByLabelText("Écouter la référence B corrigée")).toHaveAttribute("src", recordings.processed);
    expect(screen.getByLabelText("Écouter l’extrait X à identifier")).toHaveAttribute("src", recordings.dry);
    expect(screen.queryByText(/X était la référence/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Réponse A" }));
    fireEvent.click(screen.getByRole("button", { name: "Révéler le résultat" }));

    expect(screen.getByRole("status")).toHaveTextContent("Bonne réponse");
    expect(screen.getByRole("status")).toHaveTextContent("ne mesure ni la qualité, ni le naturel");
    expect(screen.getByRole("button", { name: "Réponse A" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Réponse B" })).toBeDisabled();
  });

  it("randomizes a fresh X and clears the previous answer on reset", () => {
    const random = vi.fn()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.9);
    render(<VoiceCorrectionAbxPanel recordings={recordings} random={random} />);

    fireEvent.click(screen.getByRole("button", { name: "Réponse A" }));
    fireEvent.click(screen.getByRole("button", { name: "Révéler le résultat" }));
    expect(screen.getByRole("status")).toHaveTextContent("Bonne réponse");

    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser l’essai" }));

    expect(random).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réponse A" })).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Réponse B" })).not.toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Écouter l’extrait X à identifier")).toHaveAttribute("src", recordings.processed);
  });
});
