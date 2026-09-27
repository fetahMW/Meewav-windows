import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RingTopOnePlayer from "../../../vendor/globe-vinyle/shared/src/RingTopOnePlayer";
vi.mock("../../../vendor/globe-vinyle/node_modules/react/index.js", async () => import("react"));
vi.mock("../../../vendor/globe-vinyle/node_modules/lucide-react", () => ({ Crown: () => null, Pause: () => null, Play: () => null, Volume2: () => null, VolumeX: () => null }));
vi.mock("../../../vendor/globe-vinyle/shared/src/nationalTopArtists", () => ({
  NATIONAL_TOP_ONE: { name: "NOVA KEYS", portraitUrl: "/portrait.webp" },
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("lecteur du Top 1", () => {
  it("charge KING uniquement sur demande et met le lecteur en pause au démontage", async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container, unmount } = render(<RingTopOnePlayer profileOpen={false} />);
    const audio = container.querySelector("audio")!;
    expect(audio.src).toContain("/media/vinyl/003-king.mp3");
    expect(audio.preload).toBe("none");
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Écouter 003 KING" }));
    expect(play).toHaveBeenCalledTimes(1);
    fireEvent.play(audio);
    expect(screen.getByRole("button", { name: "Mettre 003 KING en pause" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    expect(pause).toHaveBeenCalled();
  });
  it("coupe le son et suspend la piste avant la préécoute d’un profil", () => {
    const pause = vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const { container, rerender } = render(<RingTopOnePlayer profileOpen={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Couper le son du vinyle" }));
    expect(container.querySelector("audio")!.muted).toBe(true);
    rerender(<RingTopOnePlayer profileOpen />);
    expect(pause).toHaveBeenCalled();
  });
});
