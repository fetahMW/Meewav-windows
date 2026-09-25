import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneNavigationProgress from "./SceneNavigationProgress";

describe("SceneNavigationProgress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
  const progress = (container: HTMLElement) => Number(container.querySelector("span")!.style.transform.match(/scaleX\((.+)\)/)![1]);

  it("keeps a ready route visible while the stroke travels, then completes and hides", () => {
    const { container } = render(<SceneNavigationProgress navigationKey="home" pending={false} />);
    advance(450);
    expect(progress(container)).toBeGreaterThan(.15);
    expect(progress(container)).toBeLessThan(.35);
    expect(container.firstChild).toHaveClass("is-loading");
    advance(1000);
    expect(progress(container)).toBeGreaterThan(.7);
    expect(progress(container)).toBeLessThan(.85);
    advance(700);
    expect(progress(container)).toBe(1);
    expect(container.firstChild).toHaveClass("is-complete");
    advance(300);
    expect(container.firstChild).toHaveClass("is-hidden");
  });

  it("waits for the request and finishes from its current position without jumping back", () => {
    const view = render(<SceneNavigationProgress navigationKey="home" pending />);
    advance(12000);
    const before = progress(view.container);
    expect(before).toBeGreaterThan(.85);
    expect(before).toBeLessThan(.93);
    expect(view.container.firstChild).toHaveClass("is-loading");
    view.rerender(<SceneNavigationProgress navigationKey="home" pending={false} />);
    advance(150);
    expect(progress(view.container)).toBeGreaterThanOrEqual(before);
    expect(progress(view.container)).toBeLessThan(1);
    advance(1000);
    expect(view.container.firstChild).toHaveClass("is-hidden");
  });

  it("restarts for a new route and cancels the previous completion", () => {
    const view = render(<SceneNavigationProgress navigationKey="home" pending={false} />);
    advance(1900);
    view.rerender(<SceneNavigationProgress navigationKey="studio" pending={false} />);
    expect(progress(view.container)).toBe(0);
    advance(600);
    expect(view.container.firstChild).toHaveClass("is-loading");
    expect(progress(view.container)).toBeLessThan(.4);
  });

  it("shows a new request on the same route after the previous cue disappeared", () => {
    const view = render(<SceneNavigationProgress navigationKey="home" pending={false} />);
    advance(3000);
    view.rerender(<SceneNavigationProgress navigationKey="home" pending />);
    advance(600);
    expect(view.container.firstChild).toHaveClass("is-loading");
    expect(progress(view.container)).toBeGreaterThan(0);
    expect(progress(view.container)).toBeLessThan(.4);
  });
});
