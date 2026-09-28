import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TremplinGradeProgression from "./TremplinGradeProgression";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function prepareMotion(reduced = false) {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.stubGlobal("matchMedia", () => ({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("IntersectionObserver", class {
    private callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() {}
    unobserve() {}
  });
}

describe("animated tour of the original grade cards", () => {
  it("lights grades cumulatively, holds the finale for five seconds, then resets", () => {
    prepareMotion();
    const { container } = render(<TremplinGradeProgression landing />);
    expect(container.querySelectorAll(".is-illuminated")).toHaveLength(0);
    expect(container.querySelector(".is-active")).toBeNull();
    act(() => vi.advanceTimersByTime(700));
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const showcased = container.querySelectorAll(".is-showcased");
      expect(showcased).toHaveLength(1);
      expect(showcased[0]).toHaveAccessibleName(new RegExp(`Niveau ${level},`));
      expect(showcased[0].classList.contains("is-showcase-finale")).toBe(level === 6);
      expect(container.querySelectorAll(".is-illuminated")).toHaveLength(level);
      expect(container.querySelector(".is-active")).toBeNull();
      act(() => vi.advanceTimersByTime(level === 6 ? 4999 : 1999));
      expect(container.querySelector(".is-showcased")).toHaveAccessibleName(new RegExp(`Niveau ${level},`));
      act(() => vi.advanceTimersByTime(1));
    }
    expect(container.querySelectorAll(".is-illuminated")).toHaveLength(0);
    expect(container.querySelector(".is-showcased")).toBeNull();
    act(() => vi.advanceTimersByTime(700));
    expect(container.querySelectorAll(".is-illuminated")).toHaveLength(1);
    expect(container.querySelector(".is-showcased")).toHaveAccessibleName(/Niveau 1,/);
    fireEvent.click(screen.getByRole("article", { name: /Niveau 2,/ }));
    expect(container.querySelector(".is-active")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps reduced-motion and the education page static", () => {
    prepareMotion(true);
    const { container, rerender } = render(<TremplinGradeProgression landing />);
    act(() => vi.advanceTimersByTime(7000));
    expect(container.querySelector(".is-showcased")).toBeNull();
    rerender(<TremplinGradeProgression key="education" id="tremplin-grades" />);
    expect(screen.getByRole("button", { name: /Niveau 4, Élite/ })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".tremplin-grades-open")).toBeNull();
    expect(container.querySelector(".is-showcased")).toBeNull();
  });
});
