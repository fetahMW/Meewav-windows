import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MarketListingComposer, { type MarketListingPublicationResult } from "./MarketListingComposer";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

describe("MarketListingComposer publication concurrency", () => {
  it("keeps the composer immutable and open until the publication promise settles", async () => {
    let confirmPublication: ((result: MarketListingPublicationResult) => void) | undefined;
    const publication = new Promise<MarketListingPublicationResult>((resolve) => {
      confirmPublication = resolve;
    });
    const onPublish = vi.fn(() => publication);
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MarketListingComposer
        initialPillar="used"
        publicationMode="supabase"
        allowDemoMedia
        onPublish={onPublish}
        onClose={onClose}
        draftOwnerKey="publishing-test"
      />,
    );

    await user.selectOptions(screen.getByLabelText(/Catégorie/), "Interfaces audio");
    await user.type(screen.getByLabelText(/Titre public/), "Interface audio documentée");
    await user.type(
      screen.getByLabelText(/Description détaillée/),
      "Une description suffisamment précise et honnête pour publier cette interface audio.",
    );
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    await user.type(screen.getByLabelText(/Prix demandé/), "245");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));
    await user.click(screen.getByRole("button", { name: /Ajouter un visuel démo/ }));
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    await user.click(screen.getByRole("checkbox", { name: /informations et visuels sont fidèles/ }));
    await user.click(screen.getByRole("checkbox", { name: /règles de publication du Market/ }));
    await user.click(screen.getByRole("button", { name: /Enregistrer le brouillon/ }));
    await waitFor(() => expect(onPublish).toHaveBeenCalledTimes(1));

    expect(screen.getByRole("button", { name: /Enregistrement/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fermer le compositeur" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Brouillon/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Réinitialiser/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Retour/ })).toBeDisabled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    confirmPublication?.({
      listingId: "71000000-0000-4000-8000-000000000001",
      mode: "draft",
    });
    await waitFor(() => expect(screen.getByText(/Brouillon enregistré sur votre compte/)).toBeInTheDocument());
    expect(screen.getByText(/71000000-0000-4000-8000-000000000001/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fermer le compositeur" })).toBeEnabled();
  }, 15_000);

  it("isolates the mobile preview, focuses its close action and restores the trigger", async () => {
    const user = userEvent.setup();
    render(<MarketListingComposer onClose={vi.fn()} draftOwnerKey="preview-focus-test" />);

    const trigger = screen.getByRole("button", { name: "Aperçu" });
    await user.click(trigger);

    const close = screen.getByRole("button", { name: "Fermer l’aperçu" });
    expect(close).toHaveFocus();
    expect(document.querySelector(".market-listing-form")).toHaveProperty("inert", true);
    expect(document.querySelector(".market-listing-composer__footer")).toHaveProperty("inert", true);

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.querySelector(".market-listing-form")).not.toHaveProperty("inert", true);
  });

  it("reopens a server draft without replacing its content with local defaults", async () => {
    const user = userEvent.setup();
    render(
      <MarketListingComposer
        publicationMode="supabase"
        draftOwnerKey="server-draft-test"
        initialDraft={{
          pillarId: "used",
          category: "Interfaces audio",
          title: "Brouillon serveur retrouvé",
          shortDescription: "Accroche serveur conservée",
          description: "Description conservée depuis le brouillon privé du vendeur.",
          conditionNotes: "Une rayure sous le châssis.",
          price: 245,
        }}
      />,
    );

    expect(screen.getByLabelText(/Catégorie/)).toHaveValue("Interfaces audio");
    expect(screen.getByLabelText(/Titre public/)).toHaveValue("Brouillon serveur retrouvé");
    expect(screen.getByLabelText(/Accroche courte/)).toHaveValue("Accroche serveur conservée");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));
    expect(screen.getByLabelText(/Traces d’usage/)).toHaveValue("Une rayure sous le châssis.");
    await user.click(screen.getByRole("button", { name: /Retour/ }));
    expect(screen.getByLabelText(/Description détaillée/)).toHaveValue("Description conservée depuis le brouillon privé du vendeur.");
  });

  it("keeps the used-listing tagline independent from condition history", async () => {
    const user = userEvent.setup();
    render(<MarketListingComposer initialPillar="used" draftOwnerKey="independent-copy-test" />);

    await user.selectOptions(screen.getByLabelText(/Catégorie/), "Interfaces audio");
    await user.type(screen.getByLabelText(/Titre public/), "Interface mobile documentée");
    await user.type(screen.getByLabelText(/Description détaillée/), "Une interface fiable et précise pensée pour les sessions de studio nomades.");
    await user.type(screen.getByLabelText(/Accroche courte/), "Prête pour le studio nomade");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));
    await user.type(screen.getByLabelText(/Traces d’usage/), "Une rayure discrète sous le châssis");

    expect(screen.getByLabelText(/Traces d’usage/)).toHaveValue("Une rayure discrète sous le châssis");
    await user.click(screen.getByRole("button", { name: /Retour/ }));
    expect(screen.getByLabelText(/Accroche courte/)).toHaveValue("Prête pour le studio nomade");
  }, 15_000);

  it("rejects past rental availability and exposes today as the minimum", async () => {
    const user = userEvent.setup();
    const today = new Date();
    const pad = (part: number) => String(part).padStart(2, "0");
    const todayValue = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayValue = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}`;

    render(<MarketListingComposer initialPillar="rental" draftOwnerKey="rental-date-test" />);
    await user.selectOptions(screen.getByLabelText(/Catégorie/), "Interfaces audio");
    await user.type(screen.getByLabelText(/Titre public/), "Location interface mobile");
    await user.type(screen.getByLabelText(/Description détaillée/), "Une interface fiable disponible pour vos sessions et répétitions en studio.");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    const dateInput = screen.getByLabelText(/Disponible dès le/);
    expect(dateInput).toHaveAttribute("min", todayValue);
    fireEvent.change(dateInput, { target: { value: yesterdayValue } });
    await user.type(screen.getByLabelText(/Tarif \/ jour/), "42");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("ne peut pas être dans le passé");
    expect(dateInput).toHaveAttribute("aria-invalid", "true");
  });

  it("rejects a past ticket date and exposes the current local time as the minimum", async () => {
    const user = userEvent.setup();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const pad = (part: number) => String(part).padStart(2, "0");
    const yesterdayValue = `${yesterday.getFullYear()}-${pad(yesterday.getMonth() + 1)}-${pad(yesterday.getDate())}T20:00`;

    render(<MarketListingComposer initialPillar="services" draftOwnerKey="ticket-date-test" />);
    await user.click(screen.getByRole("button", { name: /Billetterie \/ Rooms/ }));
    await user.type(screen.getByLabelText(/Titre public/), "Billet live acoustique");
    await user.type(screen.getByLabelText(/Description détaillée/), "Une rencontre live avec accueil sur place et une jauge clairement documentée.");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    await user.type(screen.getByLabelText(/Prix du billet/), "25");
    await user.type(screen.getByLabelText(/Lieu/), "Room Meewav Paris");
    const eventDateInput = screen.getByLabelText(/Date & heure/);
    expect(eventDateInput.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    fireEvent.change(eventDateInput, { target: { value: yesterdayValue } });
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("ne peut pas être dans le passé");
    expect(eventDateInput).toHaveAttribute("aria-invalid", "true");
  });

  it("configures ticket and Room services as onsite offers accepted by the Supabase contract", async () => {
    const user = userEvent.setup();
    render(
      <MarketListingComposer
        initialPillar="services"
        publicationMode="supabase"
        onClose={vi.fn()}
        draftOwnerKey="onsite-service-test"
      />,
    );

    await user.click(screen.getByRole("button", { name: /Billetterie \/ Rooms/ }));
    await user.type(screen.getByLabelText(/Titre public/), "Live acoustique intimiste");
    await user.type(
      screen.getByLabelText(/Description détaillée/),
      "Une session publique documentée avec un accueil sur place et une capacité limitée.",
    );
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    expect(screen.getByLabelText(/Format/)).toHaveValue("Sur place");
    await user.type(screen.getByLabelText(/Prix du billet/), "25");
    await user.type(screen.getByLabelText(/Lieu/), "Room Meewav Paris");
    await user.click(screen.getByRole("button", { name: /Continuer/ }));

    expect(screen.getByRole("switch", { name: /Prestation sur place/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("switch", { name: /Disponible à distance/ })).toHaveAttribute("aria-checked", "false");
  });

  it("autosaves edited fields on Escape without persisting a private signed URL", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketListingComposer
        publicationMode="supabase"
        draftOwnerKey="server-safe-close"
        onClose={onClose}
        initialDraft={{
          pillarId: "used",
          category: "Interfaces audio",
          title: "Brouillon privé",
          description: "Description privée du brouillon vendeur.",
          media: [{
            id: "media-local-id",
            mediaFileId: "74000000-0000-4000-8000-000000000001",
            name: "cover.webp",
            kind: "image",
            url: "https://signed.example.test/private.webp?token=secret",
            isCover: true,
            sizeLabel: "1 Mo",
          }],
        }}
      />,
    );

    await user.clear(screen.getByLabelText(/Titre public/));
    await user.type(screen.getByLabelText(/Titre public/), "Brouillon privé modifié");
    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    const raw = window.localStorage.getItem("meewav-market-listing-draft-v2:server-safe-close");
    expect(raw).toContain("Brouillon privé modifié");
    expect(raw).toContain("74000000-0000-4000-8000-000000000001");
    expect(raw).not.toContain("signed.example.test");
    expect(raw).not.toContain("token=secret");
  });

  it("rejects a structurally invalid local draft instead of crashing the composer", async () => {
    window.localStorage.setItem(
      "meewav-market-listing-draft-v2:corrupt-draft",
      JSON.stringify({ pillarId: "not-a-pillar", media: "not-an-array" }),
    );
    const user = userEvent.setup();
    render(<MarketListingComposer draftOwnerKey="corrupt-draft" />);

    await user.click(await screen.findByRole("button", { name: "Restaurer" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("n’était plus lisible");
    expect(window.localStorage.getItem("meewav-market-listing-draft-v2:corrupt-draft")).toBeNull();
  });
});
