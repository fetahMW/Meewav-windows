import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import SceneFundraiserPanel from "./SceneFundraiserPanel";

afterEach(cleanup);
const fixture = () => createRoomToolsFixture("scene", "scene-fundraiser-test").scene!;

function openEditor() { fireEvent.click(screen.getByRole("button", { name: "Modifier l’objectif" })); }

describe("SceneFundraiserPanel", () => {
  it("shows live controls first and locks all editable fields in read-only mode", () => {
    render(<SceneFundraiserPanel scene={fixture()} disabled execute={vi.fn()} />);
    expect(screen.queryByLabelText("Titre")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Masquer du live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mettre en avant" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clôturer" })).toBeDisabled();
    openEditor();
    for (const label of ["Titre", "Bénéficiaire", "Montant cible (€)", "Date de fin", "Description", "Image (URL)"]) expect(screen.getByLabelText(label)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  });

  it("previews a host's edits and persists all edited fields without changing collected money", async () => {
    const scene = fixture();
    const execute = vi.fn(async () => undefined);
    render(<SceneFundraiserPanel scene={scene} disabled={false} execute={execute} />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Notre prochain concert" } });
    fireEvent.change(screen.getByLabelText("Bénéficiaire"), { target: { value: "Collectif Minuit" } });
    fireEvent.change(screen.getByLabelText("Montant cible (€)"), { target: { value: "4200" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Une scène et de la lumière pour le prochain live." } });
    fireEvent.change(screen.getByLabelText("Image (URL)"), { target: { value: "https://example.com/concert.jpg" } });
    fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2026-12-20T21:30" } });
    expect(within(screen.getByRole("region", { name: "Aperçu de la cagnotte" })).getByText("Notre prochain concert")).toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({ type: "scene.fundraiser.patch", patch: {
      title: "Notre prochain concert", beneficiary: "Collectif Minuit", targetAmount: 4200,
      description: "Une scène et de la lumière pour le prochain live.", imageUrl: "https://example.com/concert.jpg",
      endAt: new Date("2026-12-20T21:30").toISOString(),
    } });
    expect(await screen.findByRole("status")).toHaveTextContent("Objectif enregistré.");
    expect(screen.queryByLabelText("Titre")).not.toBeInTheDocument();
  });

  it("retains the edit form and draft when saving fails", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("offline"));
    render(<SceneFundraiserPanel scene={fixture()} disabled={false} execute={execute} />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Titre conservé" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("n’a pas été enregistrée");
    expect(screen.getByLabelText("Titre")).toHaveValue("Titre conservé");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not publish discarded edits when reopening a closed campaign", async () => {
    const scene = fixture();
    scene.fundraiser.status = "closed";
    const execute = vi.fn(async () => undefined);
    render(<SceneFundraiserPanel scene={scene} disabled={false} execute={execute} />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Modification abandonnée" } });
    fireEvent.click(screen.getByRole("button", { name: "Fermer l’édition" }));
    fireEvent.click(screen.getByRole("button", { name: "Rouvrir la cagnotte" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.fundraiser.patch", patch: expect.objectContaining({ title: scene.fundraiser.title, status: "live" }) }));
  });

  it("prevents publishing an incomplete draft and launches a completed one", async () => {
    const scene = fixture();
    scene.fundraiser = { ...scene.fundraiser, status: "draft", title: "", beneficiary: "", targetAmount: 0 };
    const execute = vi.fn(async () => undefined);
    render(<SceneFundraiserPanel scene={scene} disabled={false} execute={execute} />);
    expect(screen.getByRole("button", { name: "Lancer la cagnotte" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Titre"), { target: { value: "Un album" } });
    fireEvent.change(screen.getByLabelText("Bénéficiaire"), { target: { value: "Les artistes" } });
    fireEvent.change(screen.getByLabelText("Montant cible (€)"), { target: { value: "1000" } });
    fireEvent.click(screen.getByRole("button", { name: "Lancer la cagnotte" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.fundraiser.patch", patch: expect.objectContaining({ title: "Un album", beneficiary: "Les artistes", targetAmount: 1000, status: "live", visibleInLive: true }) }));
  });

  it("uses the actual payment availability and supports hiding a live campaign", async () => {
    const scene = fixture();
    const execute = vi.fn(async () => undefined);
    const view = render(<SceneFundraiserPanel scene={scene} disabled={false} execute={execute} />);
    expect(screen.getByText("Les contributions sont indisponibles pour le moment.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Masquer du live" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "scene.fundraiser.patch", patch: { visibleInLive: false } }));
    view.rerender(<SceneFundraiserPanel scene={{ ...scene, fundraiser: { ...scene.fundraiser, visibleInLive: false, paymentAvailable: true } }} disabled={false} execute={execute} />);
    expect(screen.queryByText("Les contributions sont indisponibles pour le moment.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mettre en avant" })).toBeDisabled();
  });
});
