import { useRef } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLocalVideoOverlay } from "./useLocalVideoOverlay";

let resize: () => void;
let width = 800;
function Overlay({ viewerId = "one", enabled = true }) {
  const container = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLDivElement>(null);
  const overlay = useLocalVideoOverlay(container, item, enabled, viewerId);
  return <div ref={container} data-testid="area"><div ref={item} data-testid="host" style={overlay.style}><button {...overlay.handleProps}>Déplacer</button></div></div>;
}
beforeEach(() => {
  localStorage.clear(); width = 800;
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: this.dataset.testid === "area" ? width : 100, height: this.dataset.testid === "area" ? 600 : 140, toJSON: () => ({}) };
  });
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("bounds dragging and persists only a viewer preference at the end of the drag", () => {
  render(<Overlay />);
  const host = screen.getByTestId("host");
  const handle = screen.getByRole("button");
  expect(host).toHaveStyle({ left: "690px", top: "450px" });
  fireEvent.pointerDown(handle, { button: 0, clientX: 700, clientY: 450 });
  fireEvent.pointerMove(handle, { clientX: -500, clientY: -500 });
  expect(host).toHaveStyle({ left: "10px", top: "10px" });
  expect(localStorage.length).toBe(0);
  fireEvent.pointerUp(handle);
  expect(JSON.parse(localStorage.getItem("meewav:cage:host-overlay:v1:one")!)).toEqual({ x: 0, y: 0 });
  cleanup();
  render(<Overlay />);
  expect(screen.getByTestId("host")).toHaveStyle({ left: "10px", top: "10px" });
});

it("keeps the host contained after resizing and does not share its position with another viewer", () => {
  const ui = render(<Overlay />);
  width = 220;
  act(() => resize());
  expect(screen.getByTestId("host")).toHaveStyle({ left: "110px" });
  fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowLeft", shiftKey: true });
  expect(screen.getByTestId("host")).toHaveStyle({ left: "70px" });
  ui.rerender(<Overlay viewerId="two" />);
  expect(screen.getByTestId("host")).toHaveStyle({ left: "110px" });
  ui.rerender(<Overlay viewerId="two" enabled={false} />);
  expect(screen.getByTestId("host").style.left).toBe("");
});
