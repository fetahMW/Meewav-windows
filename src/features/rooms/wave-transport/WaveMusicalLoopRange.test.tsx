import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaceMixerLoopRange } from "../place/PlaceMixerLoopControls";
import { musicalRegion, type WaveBars } from "./waveMusicalGrid";

const grid = { bpm: 120, beatsPerBar: 4, origin: 0 };
beforeEach(() => {
  vi.stubGlobal("PointerEvent", class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Harness({ bars, onChange, duration = 80 }: { bars: WaveBars; onChange: (edge: string, seconds: number) => void; duration?: number }) {
  const [region, setRegion] = useState(() => musicalRegion(8, bars, grid, duration));
  return <><PlaceMixerLoopRange region={region} duration={duration} musical={{ grid, bars }} onChange={(edge, seconds) => {
    onChange(edge, seconds); setRegion(musicalRegion(seconds, bars, grid, duration));
  }} /><output data-testid="region">{JSON.stringify(region)}</output></>;
}
function pointerTarget(label: string) {
  const target = screen.getByRole("button", { name: label });
  Object.defineProperty(target, "setPointerCapture", { value: vi.fn(), configurable: true });
  vi.spyOn(screen.getByRole("group", { name: "Zone de boucle A–B" }), "getBoundingClientRect").mockReturnValue({ width: 800 } as DOMRect);
  return target;
}

describe("zone musicale aimantée par blocs de quatre mesures", () => {
  it.each([4, 8, 16] as const)("déplace une zone de %s mesures avec les chevrons sans la redimensionner", bars => {
    const onChange = vi.fn(); render(<Harness bars={bars} onChange={onChange} />);
    const right = screen.getByRole("button", { name: "Avancer la zone de 4 mesures" });
    const left = screen.getByRole("button", { name: "Reculer la zone de 4 mesures" });
    expect(right.querySelector(".lucide-chevron-right")).toBeInTheDocument();
    expect(left.querySelector(".lucide-chevron-left")).toBeInTheDocument();
    expect(right.querySelector("span")).toHaveTextContent("");
    fireEvent.click(right);
    expect(screen.getByTestId("region")).toHaveTextContent(JSON.stringify({ start: 16, end: 16 + bars * 2 }));
    fireEvent.click(left);
    expect(screen.getByTestId("region")).toHaveTextContent(JSON.stringify({ start: 8, end: 8 + bars * 2 }));
    expect(onChange).toHaveBeenNthCalledWith(1, "start", 16);
    expect(onChange).toHaveBeenNthCalledWith(2, "start", 8);
  });
  it.each([4, 8, 16] as const)("aimante le glissement tout en conservant %s mesures, puis valide au relâchement", bars => {
    const onChange = vi.fn(); render(<Harness bars={bars} onChange={onChange} />);
    const zone = pointerTarget("Déplacer toute la zone par blocs de 4 mesures");
    fireEvent.pointerDown(zone, { pointerId: 1, clientX: 100, button: 0 });
    fireEvent.pointerMove(zone, { pointerId: 1, clientX: 230 }); // 8 + 13 seconds -> 24s (bar 13)
    expect(zone.style.left).toBe("30%");
    expect(zone.style.width).toBe(`${bars * 2 / 80 * 100}%`);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.pointerUp(zone, { pointerId: 1, clientX: 230 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("start", 24);
    expect(screen.getByTestId("region")).toHaveTextContent(JSON.stringify({ start: 24, end: 24 + bars * 2 }));
  });
  it("ne rajoute pas un pas après avoir glissé un chevron", () => {
    const onChange = vi.fn(); render(<Harness bars={8} onChange={onChange} />);
    const right = pointerTarget("Avancer la zone de 4 mesures");
    fireEvent.pointerDown(right, { pointerId: 2, clientX: 100, button: 0 });
    fireEvent.pointerMove(right, { pointerId: 2, clientX: 230 });
    fireEvent.pointerUp(right, { pointerId: 2, clientX: 230 });
    fireEvent.lostPointerCapture(right, { pointerId: 2 });
    fireEvent.click(right, { detail: 1 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("start", 24);
  });
  it("reconnaît un clic malgré un léger mouvement et annule proprement un glissement", () => {
    const onChange = vi.fn(); render(<Harness bars={8} onChange={onChange} />);
    const right = pointerTarget("Avancer la zone de 4 mesures");
    fireEvent.pointerDown(right, { pointerId: 1, clientX: 100, button: 0 });
    fireEvent.pointerMove(right, { pointerId: 1, clientX: 102 });
    fireEvent.pointerUp(right, { pointerId: 1 });
    fireEvent.click(right, { detail: 1 });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("start", 16);
    onChange.mockClear();
    fireEvent.pointerDown(right, { pointerId: 2, clientX: 100, button: 0 });
    fireEvent.pointerMove(right, { pointerId: 2, clientX: 400 });
    fireEvent.pointerCancel(right, { pointerId: 2 });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("region")).toHaveTextContent('{"start":16,"end":32}');
  });
  it("utilise le même pas au clavier et garde les limites sur la grille", () => {
    const onChange = vi.fn(); render(<Harness bars={8} duration={37} onChange={onChange} />);
    const right = screen.getByRole("button", { name: "Avancer la zone de 4 mesures" });
    fireEvent.keyDown(right, { key: "ArrowRight" });
    expect(screen.getByTestId("region")).toHaveTextContent('{"start":16,"end":32}');
    fireEvent.keyDown(right, { key: "End" });
    expect(screen.getByTestId("region")).toHaveTextContent('{"start":16,"end":32}');
    fireEvent.keyDown(right, { key: "Home" });
    expect(screen.getByTestId("region")).toHaveTextContent('{"start":0,"end":16}');
  });
});
