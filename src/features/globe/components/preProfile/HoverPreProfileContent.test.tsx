import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import {
  disableLocalAuthPreview,
  enableLocalAuthPreview,
} from "../../../auth/localAuthPreview";
import { demoPreProfileArtist } from "./demoPreProfileArtist";
import { HoverPreProfileContent } from "./HoverPreProfileContent";

afterEach(() => {
  cleanup();
  disableLocalAuthPreview();
});

describe("HoverPreProfileContent visitor pin", () => {
  it("masque les repères de carte dans un pré-profil de room", () => {
    render(<MemoryRouter><HoverPreProfileContent artist={demoPreProfileArtist} showMapPin={false} /></MemoryRouter>);
    expect(screen.queryByLabelText("Épingler le profil")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Couleurs de repère")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suivre" })).toBeVisible();
  });
  it("permet d’épingler immédiatement avec la première couleur visiteur", async () => {
    const onPin = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HoverPreProfileContent
          artist={demoPreProfileArtist}
          onPin={onPin}
        />
      </MemoryRouter>,
    );

    const pinButton = screen.getByRole("button", {
      name: "Épingler avec la couleur choisie",
    });
    expect(pinButton).toBeEnabled();

    await user.click(pinButton);

    expect(onPin).toHaveBeenCalledWith(
      demoPreProfileArtist.id,
      "#692BE0",
      true,
    );
  });
});

describe("HoverPreProfileContent visitor follow", () => {
  it("conserve le suivi de la maquette Classe sans activer l'aperçu d'authentification", async () => {
    const user = userEvent.setup();
    const artist = { ...demoPreProfileArtist, id: "class-follow-demo" };
    const view = () => <MemoryRouter><HoverPreProfileContent artist={artist} demoFollow /></MemoryRouter>;
    const first = render(view());
    await user.click(screen.getByRole("button", { name: "Suivre" }));
    await user.click(screen.getByRole("tab", { name: "Aperçu" }));
    expect(screen.getByRole("button", { name: "Suivi" })).toHaveAttribute("aria-pressed", "true");
    first.unmount();
    render(view());
    expect(screen.getByRole("button", { name: "Suivi" })).toHaveClass("is-active");
    await user.click(screen.getByRole("button", { name: "Suivi" }));
    expect(screen.getByRole("button", { name: "Suivre" })).toHaveAttribute("aria-pressed", "false");
  });
  it("suit et désuit un avatar en aperçu local sans session Supabase", async () => {
    enableLocalAuthPreview();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HoverPreProfileContent artist={demoPreProfileArtist} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Suivre" }));
    expect(screen.getByRole("button", { name: "Suivi" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Suivi" }));
    expect(screen.getByRole("button", { name: "Suivre" })).toHaveAttribute("aria-pressed", "false");
  });

  it("conserve le suivi quand la popup est remontée dans la même session", async () => {
    enableLocalAuthPreview();
    const user = userEvent.setup();
    const firstRender = render(
      <MemoryRouter>
        <HoverPreProfileContent artist={demoPreProfileArtist} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Suivre" }));
    firstRender.unmount();

    render(
      <MemoryRouter>
        <HoverPreProfileContent artist={demoPreProfileArtist} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Suivi" })).toBeInTheDocument();
  });
});

describe("HoverPreProfileContent profile viewer", () => {
  it("ouvre le profil public depuis la popup Globe", async () => {
    const onOpenProfile = vi.fn();
    const onConsult = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <HoverPreProfileContent
          artist={demoPreProfileArtist}
          onOpenProfile={onOpenProfile}
          onConsult={onConsult}
        />
      </MemoryRouter>,
    );

    const profileButton = screen.getByRole("button", { name: "Voir profil" });
    expect(profileButton).toBeEnabled();
    await user.click(profileButton);

    expect(onConsult).toHaveBeenCalledWith(demoPreProfileArtist.id, "profile");
    expect(onOpenProfile).toHaveBeenCalledWith(demoPreProfileArtist.id);
  });
});
