import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MeewavTooltip from "./MeewavTooltip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("MeewavTooltip", () => {
  it("replaces the native title with the shared premium tooltip", () => {
    render(
      <MeewavTooltip content="Une information utile">
        <button type="button" title="Ancienne info native">Action</button>
      </MeewavTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Action" });
    expect(trigger).not.toHaveAttribute("title");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(trigger);

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("Une information utile");
    expect(tooltip).toHaveClass("meewav-tooltip");
    expect(tooltip.parentElement).toBe(document.body);
    expect(trigger).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("opens after a short hover and closes when the pointer leaves", () => {
    vi.useFakeTimers();
    render(
      <MeewavTooltip content="Survol premium">
        <button type="button">Survoler</button>
      </MeewavTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Survoler" });
    fireEvent.mouseEnter(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(320));
    expect(screen.getByRole("tooltip")).toHaveTextContent("Survol premium");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes with Escape without changing the trigger action", () => {
    const onClick = vi.fn();
    render(
      <MeewavTooltip content="Aide clavier">
        <button type="button" onClick={onClick}>Déclencher</button>
      </MeewavTooltip>,
    );

    const trigger = screen.getByRole("button", { name: "Déclencher" });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("flips and stays inside the viewport near an edge", () => {
    vi.stubGlobal("innerWidth", 320);
    vi.stubGlobal("innerHeight", 240);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function width(
      this: HTMLElement,
    ) {
      return this.getAttribute("role") === "tooltip" ? 200 : 30;
    });
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function height(
      this: HTMLElement,
    ) {
      return this.getAttribute("role") === "tooltip" ? 50 : 30;
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function rect(
      this: HTMLElement,
    ) {
      if (this.getAttribute("role") === "tooltip") {
        return {
          x: 0,
          y: 0,
          top: 0,
          right: 193,
          bottom: 48,
          left: 0,
          width: 193,
          height: 48,
          toJSON: () => ({}),
        };
      }
      return {
        x: 280,
        y: 20,
        top: 20,
        right: 310,
        bottom: 50,
        left: 280,
        width: 30,
        height: 30,
        toJSON: () => ({}),
      };
    });

    render(
      <MeewavTooltip content="Toujours dans l’écran">
        <button type="button">Près du bord</button>
      </MeewavTooltip>,
    );

    fireEvent.focus(screen.getByRole("button", { name: "Près du bord" }));
    const tooltip = screen.getByRole("tooltip");

    expect(tooltip).toHaveAttribute("data-placement", "bottom");
    expect(tooltip).toHaveStyle({ left: "108px", top: "62px" });
  });
});
