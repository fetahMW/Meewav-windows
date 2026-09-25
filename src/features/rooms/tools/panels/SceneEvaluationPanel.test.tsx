import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import SceneEvaluationPanel from "./SceneEvaluationPanel";

afterEach(cleanup);
const fixture = () => createRoomToolsFixture("scene", "scene-evaluation-test").scene!;

describe("SceneEvaluationPanel", () => {
  it("starts with the completed performance's feedback and targets the selected passage when sharing", async () => {
    const execute = vi.fn(async () => undefined);
    render(<SceneEvaluationPanel scene={fixture()} disabled={false} execute={execute} />);
    expect(screen.getByLabelText("Choisir une prestation")).toHaveValue("perf-6");
    expect(screen.getByText("4,5")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rendre les résultats publics pour Deux voix" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.evaluation.configure", performanceId: "perf-6", enabled: true, resultsVisibility: "public" }));
    fireEvent.change(screen.getByLabelText("Choisir une prestation"), { target: { value: "perf-4" } });
    expect(screen.getByText("Les avis sont désactivés pour cette prestation.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Activer l’évaluation pour Corps électrique" }));
    await waitFor(() => expect(execute).toHaveBeenLastCalledWith({ type: "scene.evaluation.configure", performanceId: "perf-4", enabled: true }));
  });

  it("waits until a whole threshold has been entered before persisting", async () => {
    const execute = vi.fn(async () => undefined);
    render(<SceneEvaluationPanel scene={fixture()} disabled={false} execute={execute} />);
    const input = screen.getByLabelText("Seuil de réponses pour Deux voix");
    fireEvent.change(input, { target: { value: "12" } });
    expect(execute).not.toHaveBeenCalled();
    fireEvent.blur(input);
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.evaluation.configure", performanceId: "perf-6", enabled: true, minimumResponses: 12 }));
  });

  it("distinguishes scheduled sharing from published results and keeps configuration read-only", () => {
    const scene = fixture();
    scene.evaluation.byPerformance["perf-6"].resultsVisibility = "public";
    scene.evaluation.byPerformance["perf-6"].minimumResponses = 10;
    render(<SceneEvaluationPanel scene={scene} disabled execute={vi.fn()} />);
    expect(screen.getByText("Partage programmé")).toBeInTheDocument();
    expect(screen.getByText("Publication à partir de 10 avis.")).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Rendre les résultats privés pour Deux voix" })).toBeDisabled();
    expect(screen.getByLabelText("Seuil de réponses pour Deux voix")).toBeDisabled();
    expect(screen.getByLabelText("Choisir une prestation")).not.toBeDisabled();
  });

  it("reports a failed change without hiding the current feedback", async () => {
    render(<SceneEvaluationPanel scene={fixture()} disabled={false} execute={vi.fn().mockRejectedValue(new Error("offline"))} />);
    fireEvent.click(screen.getByRole("button", { name: "Rendre les résultats publics pour Deux voix" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("n’a pas été enregistrée");
    expect(screen.getByText("4,5")).toBeInTheDocument();
  });
});
