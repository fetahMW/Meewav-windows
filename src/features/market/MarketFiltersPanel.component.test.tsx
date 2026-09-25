import { StrictMode, useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MarketFiltersPanel from "./MarketFiltersPanel";

afterEach(cleanup);

describe("MarketFiltersPanel server catalogue", () => {
  it("allows an empty loaded preview to query the complete catalogue", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketFiltersPanel
        products={[]}
        serverBackedResults
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("0 offre dans l’aperçu")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: /Appliquer les filtres/i });
    expect(apply).toBeEnabled();
    await user.click(apply);
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
  });

  it("does not offer a fictional proximity sort in live mode", () => {
    render(
      <MarketFiltersPanel
        products={[]}
        serverBackedResults
        distanceSortAvailable={false}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("option", { name: "Plus proches · bientôt" })).toBeDisabled();
  });

  it("bounds pasted prices to the server monetary contract", async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    render(
      <MarketFiltersPanel
        products={[]}
        serverBackedResults
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    const minimum = screen.getByRole("textbox", { name: "Prix minimum en euros" });
    await user.type(minimum, "999999999999999999999");
    expect(minimum).toHaveValue("10000000000");
    await user.click(screen.getByRole("button", { name: /^Appliquer/i }));
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({ priceMin: 10_000_000_000 }),
      expect.any(Array),
    ));
  });
});


describe("MarketFiltersPanel dismissal", () => {
  it("restores focus after animated close and Escape in StrictMode", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><div className="market-shell"><button onClick={() => setOpen(true)}>Ouvrir les filtres</button></div>
        {open && <MarketFiltersPanel products={[]} onApply={vi.fn()} onClose={() => setOpen(false)} />}</>;
    }
    const user = userEvent.setup();
    render(<StrictMode><Harness /></StrictMode>);
    const trigger = screen.getByRole("button", { name: "Ouvrir les filtres" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Fermer les filtres" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
