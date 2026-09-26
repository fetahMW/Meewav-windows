import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CageViewerShowcase from "./CageViewerShowcase";
afterEach(()=>{ cleanup(); vi.useRealTimers(); });
it("starts only on request and leaves exactly two seconds between resolved matches",()=>{
 vi.useFakeTimers();
 render(<CageViewerShowcase enabled><p>Programme réel</p></CageViewerShowcase>);
 expect(screen.queryByText(/Simulation · Tournoi/)).toBeNull();
 fireEvent.click(screen.getByRole("button", { name: "Simuler" }));
 expect(screen.getByText(/Simulation · Tournoi/)).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(4000));
 fireEvent.click(screen.getAllByRole("button",{name:"Je valide"})[0]);
 expect(screen.getByText("Votre choix")).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(6000));
 expect(screen.getByText(/RÉSULTAT DU BATTLE/)).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(1999));
 expect(screen.getByText(/RÉSULTAT DU BATTLE/)).toBeInTheDocument();
 act(()=>vi.advanceTimersByTime(1));
 expect(screen.getByText(/BATTLE EN COURS/)).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Quitter la simulation"}));
 expect(screen.getByText("Programme réel")).toBeInTheDocument();
});
it("never exposes or starts a simulation in a live room", () => {
 render(<CageViewerShowcase enabled={false}><p>Programme réel</p></CageViewerShowcase>);
 expect(screen.queryByRole("button", { name: "Simuler" })).toBeNull();
 act(() => window.dispatchEvent(new Event("cage-viewer-simulation-ready")));
 expect(screen.getByText("Programme réel")).toBeInTheDocument();
});
it.each(["championship", "open-mic", "open-mic-battle"])("starts and clears an isolated %s preview", format => {
 vi.useFakeTimers();
 const preview = vi.fn();
 window.addEventListener("cage-viewer-preview-state", preview);
 try {
   render(<CageViewerShowcase enabled><p>Programme réel</p></CageViewerShowcase>);
   fireEvent.change(screen.getByRole("combobox", { name: "Format de la simulation" }), { target: { value: format } });
   fireEvent.click(screen.getByRole("button", { name: "Simuler" }));
   expect(screen.queryByText("Programme réel")).toBeNull();
   expect(preview.mock.calls.at(-1)?.[0].detail.runtime.config.format).toBe(format);
   act(() => vi.advanceTimersByTime(4000));
   expect(screen.queryByRole("alert")).toBeNull();
   fireEvent.click(screen.getByRole("button", { name: "Quitter la simulation" }));
   expect(screen.getByText("Programme réel")).toBeInTheDocument();
   expect(preview.mock.calls.at(-1)?.[0].detail).toBeNull();
 } finally { window.removeEventListener("cage-viewer-preview-state", preview); }
});
