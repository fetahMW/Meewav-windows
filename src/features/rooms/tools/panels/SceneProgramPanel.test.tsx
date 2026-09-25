import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import SceneProgramPanel from "./SceneProgramPanel";

const fixture = () => createRoomToolsFixture("scene", "scene-program-tests").scene!;
afterEach(cleanup);

describe("SceneProgramPanel", () => {
  it("announces and fully locks the creation form when Scene becomes read-only", () => {
    const scene = fixture();
    const view = render(<SceneProgramPanel scene={scene} disabled={false} execute={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "Ajouter un passage" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const form = screen.getByRole("form", { name: "Nouveau passage" });
    expect(toggle).toHaveAttribute("aria-controls", form.id);
    view.rerender(<SceneProgramPanel scene={scene} disabled execute={vi.fn()} />);
    within(form).getAllByRole("textbox").forEach((control) => expect(control).toBeDisabled());
    within(form).getAllByRole("combobox").forEach((control) => expect(control).toBeDisabled());
    within(form).getAllByRole("spinbutton").forEach((control) => expect(control).toBeDisabled());
    expect(within(form).getByRole("checkbox")).toBeDisabled();
    expect(within(form).getByRole("button", { name: "Ajouter au programme" })).toBeDisabled();
  });

  it("advances to the first available passage in running order, without controlling guests", async () => {
    const scene = fixture();
    scene.program[1].participantStatus = "absent";
    scene.program[3].status = "ready";
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<SceneProgramPanel scene={scene} disabled={false} execute={execute} />);
    const pilot = screen.getByRole("region", { name: "Pilotage du programme" });
    expect(within(pilot).getByText("Soul Transit")).toBeVisible();
    expect(within(pilot).queryByText("Corps électrique")).not.toBeInTheDocument();
    fireEvent.click(within(pilot).getByRole("button", { name: "Enchaîner" }));
    await waitFor(() => expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "scene.program.status", entryId: "perf-3", status: "live" }));
  });

  it("preserves the programmed display name and saves a complete inline edit including cleared links", async () => {
    const scene = fixture();
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<SceneProgramPanel scene={scene} disabled={false} execute={execute} />);
    const list = screen.getByRole("list", { name: "Passages à venir" });
    expect(within(list).getByText(/Collectif Neon/)).toBeVisible();
    fireEvent.click(within(list).getByRole("button", { name: /Nuit acoustique/ }));
    fireEvent.click(screen.getByRole("button", { name: "Modifier Nuit acoustique" }));
    const form = screen.getByRole("form", { name: "Modifier Nuit acoustique" });
    fireEvent.change(within(form).getByLabelText("Titre du passage"), { target: { value: "Final acoustique" } });
    fireEvent.change(within(form).getByLabelText("Durée · min"), { target: { value: "9" } });
    fireEvent.change(within(form).getByLabelText("Horaire prévu · facultatif"), { target: { value: "" } });
    fireEvent.change(within(form).getByLabelText("Texte du prompteur"), { target: { value: "" } });
    fireEvent.click(within(form).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.program.patch", entryId: "perf-2", patch: expect.objectContaining({ title: "Final acoustique", durationMinutes: 9, artistName: scene.program[1].artistName, scheduledAt: "", prompterTextId: "" }) }));
    await waitFor(() => expect(screen.queryByRole("form")).not.toBeInTheDocument());
  });

  it("allows a production interlude with its own name and no evaluation", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<SceneProgramPanel scene={fixture()} disabled={false} execute={execute} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un passage" }));
    const form = screen.getByRole("form", { name: "Nouveau passage" });
    fireEvent.change(within(form).getByLabelText("Titre du passage"), { target: { value: "Entracte" } });
    fireEvent.change(within(form).getByLabelText("Intervenant"), { target: { value: "" } });
    fireEvent.change(within(form).getByLabelText("Nom au programme"), { target: { value: "Régie" } });
    fireEvent.change(within(form).getByLabelText("Type"), { target: { value: "Autre" } });
    fireEvent.click(within(form).getByRole("button", { name: "Ajouter au programme" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.program.add", entry: expect.objectContaining({ title: "Entracte", artistId: "", artistName: "Régie", kind: "Autre", evaluationEnabled: false, status: "upcoming" }) }));
  });

  it("moves an upcoming passage within the queue without moving the current one", async () => {
    const scene = fixture();
    const execute = vi.fn().mockResolvedValue(undefined);
    render(<SceneProgramPanel scene={scene} disabled={false} execute={execute} />);
    fireEvent.click(screen.getByRole("button", { name: /Soul Transit.*Morceau/ }));
    fireEvent.click(screen.getByRole("button", { name: "Avancer Soul Transit" }));
    await waitFor(() => expect(execute).toHaveBeenCalledExactlyOnceWith({ type: "scene.program.reorder", entryId: "perf-3", toIndex: 1 }));
  });

  it("keeps the draft available after a failed save", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("offline"));
    render(<SceneProgramPanel scene={fixture()} disabled={false} execute={execute} />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un passage" }));
    fireEvent.change(screen.getByLabelText("Titre du passage"), { target: { value: "Ouverture" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter au programme" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Le programme n’a pas été modifié");
    expect(screen.getByLabelText("Titre du passage")).toHaveValue("Ouverture");
  });

  it("opens the dedicated guest and linked text tools without changing the running order", () => {
    const execute = vi.fn();
    const onOpenGuests = vi.fn();
    const onOpenPrompter = vi.fn();
    render(<SceneProgramPanel scene={fixture()} disabled={false} execute={execute} onOpenGuests={onOpenGuests} onOpenPrompter={onOpenPrompter} />);
    fireEvent.click(screen.getByRole("button", { name: "Gérer les invités" }));
    expect(onOpenGuests).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Nuit acoustique.*Instrumental/ }));
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le texte" }));
    expect(onOpenPrompter).toHaveBeenCalledExactlyOnceWith("text-2");
    fireEvent.click(screen.getByRole("button", { name: "Prompteur" }));
    expect(onOpenPrompter).toHaveBeenLastCalledWith("text-1");
    expect(execute).not.toHaveBeenCalled();
  });
});
