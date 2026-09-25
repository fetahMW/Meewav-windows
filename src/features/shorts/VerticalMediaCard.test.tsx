import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import VerticalMediaCard from "./VerticalMediaCard";
import { SHORTS_WALLS } from "./shorts-wall-data";

describe("VerticalMediaCard", () => {
  afterEach(cleanup);

  it("closes after an action instead of toggling the menu open again", async () => {
    const user = userEvent.setup();
    const item = SHORTS_WALLS.vertical.items[0];
    const onToggleSaved = vi.fn();
    const onToggleMenu = vi.fn();

    function Harness() {
      const [menuOpen, setMenuOpen] = useState(true);
      return (
        <VerticalMediaCard
          item={item}
          isSaved={false}
          menuOpen={menuOpen}
          publishedLabel="aujourd’hui"
          onSelect={vi.fn()}
          onToggleMenu={() => {
            onToggleMenu();
            setMenuOpen((current) => !current);
          }}
          onToggleSaved={() => {
            onToggleSaved();
            setMenuOpen(false);
          }}
          onShare={vi.fn()}
          onViewProfile={vi.fn()}
          actions={{
            onAddToPlaylist: vi.fn(),
            onNotInterested: vi.fn(),
            onReport: vi.fn(),
          }}
        />
      );
    }

    render(<Harness />);
    await user.click(screen.getByRole("menuitem", { name: "À regarder plus tard" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });
    expect(onToggleSaved).toHaveBeenCalledTimes(1);
    expect(onToggleMenu).not.toHaveBeenCalled();
  });
});
