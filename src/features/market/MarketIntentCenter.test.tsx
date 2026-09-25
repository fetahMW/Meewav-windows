import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketplaceRepository } from "./market.service";
import type { MarketplaceIntentRow } from "./market.types";
import MarketIntentCenter from "./MarketIntentCenter";

const INTENT_ID = "73000000-0000-4000-8000-000000000001";
const LISTING_ID = "71000000-0000-4000-8000-000000000001";
const BUYER_ID = "72000000-0000-4000-8000-000000000001";
const SELLER_ID = "72000000-0000-4000-8000-000000000002";

function intent(overrides: Partial<MarketplaceIntentRow> = {}): MarketplaceIntentRow {
  return {
    intent_id: INTENT_ID,
    status: "pending",
    listing_id: LISTING_ID,
    kind: "service_booking",
    requested_quantity: 1,
    starts_on: null,
    ends_on: null,
    requested_for: "2026-07-25T20:00:00Z",
    note: "Mixage de quatre titres",
    pricing_snapshot: { unit_amount_minor: 14_900, currency_code: "EUR" },
    buyer_profile_id: BUYER_ID,
    buyer_display_name: "Nox Amani",
    seller_profile_id: SELLER_ID,
    seller_display_name: "Fetah",
    listing_title: "Session mix et mastering",
    listing_pillar: "services",
    created_at: "2026-07-19T10:00:00Z",
    updated_at: "2026-07-19T10:00:00Z",
    responded_at: null,
    ...overrides,
  };
}

function repository(overrides: Partial<MarketplaceRepository> = {}) {
  return {
    listMyIntents: vi.fn().mockResolvedValue([intent()]),
    updateIntentStatus: vi.fn().mockResolvedValue({
      intent_id: INTENT_ID,
      listing_id: LISTING_ID,
      kind: "service_booking",
      status: "accepted",
    }),
    cancelIntent: vi.fn().mockResolvedValue({
      intent_id: INTENT_ID,
      listing_id: LISTING_ID,
      kind: "service_booking",
      status: "cancelled",
    }),
    ...overrides,
  } as unknown as MarketplaceRepository;
}

afterEach(() => cleanup());

describe("MarketIntentCenter", () => {
  it("loads the buyer activity without inventing an order or payment", async () => {
    const marketRepository = repository();
    render(<MarketIntentCenter repository={marketRepository} onClose={vi.fn()} />);

    expect(await screen.findByText("Session mix et mastering")).toBeInTheDocument();
    expect(screen.getByText("Avec").parentElement).toHaveTextContent("Fetah");
    expect(screen.getByText("149,00 €")).toBeInTheDocument();
    expect(screen.queryByText(/paiement|commande/i)).not.toBeInTheDocument();
    expect(marketRepository.listMyIntents).toHaveBeenCalledWith({ role: "buyer", status: null, limit: 100 });
  });

  it("requires confirmation before a seller accepts a request", async () => {
    const marketRepository = repository();
    const onIntentChanged = vi.fn();
    render(<MarketIntentCenter initialRole="seller" repository={marketRepository} onClose={vi.fn()} onIntentChanged={onIntentChanged} />);

    await screen.findByText("Session mix et mastering");
    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    expect(marketRepository.updateIntentStatus).not.toHaveBeenCalled();
    expect(screen.getByText("Accepter cette demande ?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(marketRepository.updateIntentStatus).toHaveBeenCalledWith(
      INTENT_ID,
      "accepted",
      expect.stringMatching(/^intent-accept:/),
    ));
    expect(await screen.findByText("Acceptée")).toBeInTheDocument();
    expect(onIntentChanged).toHaveBeenCalledWith(expect.objectContaining({
      intent_id: INTENT_ID,
      status: "accepted",
    }));
  });

  it("removes a request after its status no longer matches the active filter", async () => {
    const listMyIntents = vi.fn().mockResolvedValue([intent()]);
    const marketRepository = repository({ listMyIntents });
    render(<MarketIntentCenter initialRole="seller" repository={marketRepository} onClose={vi.fn()} />);

    await screen.findByText("Session mix et mastering");
    fireEvent.click(screen.getByRole("button", { name: "En attente" }));
    await waitFor(() => expect(listMyIntents).toHaveBeenLastCalledWith({
      role: "seller",
      status: "pending",
      limit: 100,
    }));

    fireEvent.click(screen.getByRole("button", { name: "Accepter" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    await waitFor(() => expect(screen.queryByText("Session mix et mastering")).not.toBeInTheDocument());
    expect(screen.getByText("Aucune demande ne correspond à ce filtre.")).toBeInTheDocument();
  });

  it("keeps the previous state when a cancellation fails", async () => {
    const marketRepository = repository({ cancelIntent: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<MarketIntentCenter repository={marketRepository} onClose={vi.fn()} />);

    await screen.findByText("Session mix et mastering");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("état précédent est conservé");
    expect(screen.getByText("En attente", { selector: ".market-intent-card__status" })).toBeInTheDocument();
  });

  it("dismisses a confirmation with Escape before closing the center", async () => {
    const onClose = vi.fn();
    render(<MarketIntentCenter repository={repository()} onClose={onClose} />);

    await screen.findByText("Session mix et mastering");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(screen.getByText("Annuler cette demande ?")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText("Annuler cette demande ?")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes linked tabs and supports arrow-key role navigation", async () => {
    const marketRepository = repository();
    render(<MarketIntentCenter repository={marketRepository} onClose={vi.fn()} />);

    await screen.findByText("Session mix et mastering");
    const buyerTab = screen.getByRole("tab", { name: /Mes demandes/ });
    const sellerTab = screen.getByRole("tab", { name: /Demandes reçues/ });
    const panel = screen.getByRole("tabpanel");
    expect(buyerTab).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", buyerTab.id);

    buyerTab.focus();
    fireEvent.keyDown(buyerTab, { key: "ArrowRight" });
    expect(sellerTab).toHaveFocus();
    expect(sellerTab).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(marketRepository.listMyIntents).toHaveBeenLastCalledWith({ role: "seller", status: null, limit: 100 }));
  });

  it("allows a buyer to cancel an already accepted request", async () => {
    const marketRepository = repository({ listMyIntents: vi.fn().mockResolvedValue([intent({ status: "accepted" })]) });
    render(<MarketIntentCenter repository={marketRepository} onClose={vi.fn()} />);

    await screen.findByText("Session mix et mastering");
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(marketRepository.cancelIntent).toHaveBeenCalledWith(
      INTENT_ID,
      expect.stringMatching(/^intent-cancel:/),
    ));
  });

  it("makes the 100-row display ceiling explicit", async () => {
    const rows = Array.from({ length: 100 }, (_, index) => intent({
      intent_id: `73000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      listing_title: `Demande ${index + 1}`,
    }));
    render(<MarketIntentCenter repository={repository({ listMyIntents: vi.fn().mockResolvedValue(rows) })} onClose={vi.fn()} />);

    expect(await screen.findByText(/100 demandes les plus récentes/)).toBeInTheDocument();
  });
});
