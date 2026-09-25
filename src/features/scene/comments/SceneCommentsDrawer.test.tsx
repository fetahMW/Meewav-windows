import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneCommentsDrawer from "./SceneCommentsDrawer";

describe("SceneCommentsDrawer", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(cleanup);

  it("affiche une discussion, publie un commentaire et reste fermable", () => {
    const onClose = vi.fn();
    const onNotify = vi.fn();
    render(<SceneCommentsDrawer videoId="video-demo" videoTitle="Sous la lumière" onClose={onClose} onNotify={onNotify} />);

    expect(screen.getByRole("dialog", { name: "Commentaires" })).toBeInTheDocument();
    expect(screen.getByText(/La direction live donne une autre dimension/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Ajoute un commentaire respectueux…"), {
      target: { value: "Une superbe session." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Publier" }));
    expect(screen.getByText("Une superbe session.")).toBeInTheDocument();
    expect(onNotify).toHaveBeenCalledWith("Commentaire publié.");

    fireEvent.click(screen.getAllByRole("button", { name: "Fermer les commentaires" })[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
