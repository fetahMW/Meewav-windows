import { useRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import FloatingSceneCardMenu from "./FloatingSceneCardMenu";

function MenuHarness({
  onRequestClose,
  open = true,
}: {
  onRequestClose: () => void;
  open?: boolean;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  return (
    <section data-testid="card-container">
      <button ref={anchorRef} type="button" data-menu-anchor>Options</button>
      <FloatingSceneCardMenu
        anchorRef={anchorRef}
        ariaLabel="Actions pour la vidéo"
        id="floating-scene-menu"
        open={open}
        onKeyDown={() => undefined}
        onRequestClose={onRequestClose}
      >
        <button type="button" role="menuitem">Partager</button>
      </FloatingSceneCardMenu>
    </section>
  );
}

describe("FloatingSceneCardMenu", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(
      this: HTMLElement,
    ) {
      if (this.hasAttribute("data-menu-anchor")) {
        return {
          x: 900,
          y: 700,
          top: 700,
          right: 980,
          bottom: 732,
          left: 900,
          width: 80,
          height: 32,
          toJSON: () => ({}),
        };
      }
      return {
        x: 0,
        y: 0,
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      };
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("portals the menu to the viewport and aligns it with the trigger", () => {
    render(<MenuHarness onRequestClose={vi.fn()} />);

    const menu = screen.getByRole("menu", { name: "Actions pour la vidéo" });
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getByTestId("card-container")).not.toContainElement(menu);
    expect(menu).toHaveClass("scene-card-floating-menu");
    expect(menu).toHaveStyle({
      top: "302px",
      left: "720px",
      width: "260px",
      maxHeight: "390px",
    });
  });

  it("closes once when an enclosing rail starts scrolling", () => {
    const onRequestClose = vi.fn();
    render(<MenuHarness onRequestClose={onRequestClose} />);

    fireEvent.scroll(document.body);
    fireEvent.scroll(document.body);

    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("does not close while the menu itself is scrolling", () => {
    const onRequestClose = vi.fn();
    render(<MenuHarness onRequestClose={onRequestClose} />);

    fireEvent.scroll(screen.getByRole("menu", { name: "Actions pour la vidéo" }));

    expect(onRequestClose).not.toHaveBeenCalled();
  });
});
