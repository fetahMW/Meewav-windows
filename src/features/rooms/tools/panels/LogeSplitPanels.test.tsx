import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import LogeDedicationPanel from "./LogeDedicationPanel";
import LogeFaceToFacePanel from "./LogeFaceToFacePanel";

afterEach(cleanup);

function logeFixture(id: string) {
  return createRoomToolsFixture("loge", id).loge!;
}

describe("standalone Loge tools", () => {
  it("keeps the existing Face-à-face invitations and lifecycle actions wired", () => {
    const execute = vi.fn(async () => undefined);
    render(<LogeFaceToFacePanel loge={logeFixture("face-panel")} disabled={false} execute={execute} />);

    expect(screen.getByRole("region", { name: "Gestion des face-à-face" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Inviter /i })[0]);

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.moment.add",
      moment: expect.objectContaining({ kind: "face-to-face", status: "pending" }),
    }));
  });

  it("keeps Moment VIP limited to its three real fan actions", () => {
    const waitingGuest = logeFixture("dedication-panel").questions[0].author;
    render(<LogeDedicationPanel loge={logeFixture("dedication-panel")} waitingGuests={[waitingGuest]} initialFanIds={[waitingGuest.id]} disabled={false} execute={vi.fn(async () => undefined)} roomId="52000000-0000-4000-8000-000000000001" source="demo" />);

    expect(screen.getByRole("region", { name: "1 sélectionné" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: new RegExp(`Créer pour ${waitingGuest.name}`, "i") })).toBeInTheDocument();
    expect(screen.getByText("Dédicace audio")).toBeInTheDocument();
    expect(screen.getByText("Dédicace vidéo")).toBeInTheDocument();
    expect(screen.getByText("Monter avec moi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dédicace audio pour/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Dédicace vidéo pour/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monter avec moi pour/i })).toBeInTheDocument();
    expect(screen.getByRole("region", {name:"Inscriptions des fans"})).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Dédicace audio pour/i }));
    expect(screen.getByRole("button", { name: /Enregistrer/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retour aux moments" }));
    fireEvent.click(screen.getByRole("button", { name: /Monter avec moi pour/i }));
    expect(screen.getByRole("button", { name: "5 min" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Inviter le groupe/i })).toBeInTheDocument();
  });
});
