import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlaceTimeCues from "./PlaceTimeCues";
import { placeTransportCues } from "./placeTransportCues";
import { placeTwistAudio } from "./placeTwistAudio";
import { profileMediaRepository } from "../../profile/profile.media.service";

vi.mock("../../profile/profile.media.service", () => ({ profileMediaRepository: { listOwnerMedia: vi.fn(async () => []) } }));
beforeEach(() => {
  vi.spyOn(placeTwistAudio, "play").mockResolvedValue();
  vi.spyOn(placeTwistAudio, "stop").mockImplementation(() => {});
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:custom-cue") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); placeTransportCues.reset(); vi.restoreAllMocks(); });

describe("Time sound controls", () => {
  it("offers four combinations independently for each sound, without playing on activation", () => {
    render(<PlaceTimeCues ownerId="test-owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Début avec le chrono" }));
    fireEvent.click(screen.getByRole("button", { name: "Début avec le lecteur" }));
    fireEvent.click(screen.getByRole("button", { name: "Fin avec le lecteur" }));
    expect(placeTransportCues.getSnapshot().start).toMatchObject({ chrono: true, player: true });
    expect(placeTransportCues.getSnapshot().end).toMatchObject({ chrono: false, player: true });
    expect(placeTwistAudio.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Début avec le chrono" }));
    fireEvent.click(screen.getByRole("button", { name: "Début avec le lecteur" }));
    expect(placeTransportCues.getSnapshot().start).toMatchObject({ chrono: false, player: false });
  });
  it("imports a local sound, keeps its associations and can restore the real default asset", async () => {
    render(<PlaceTimeCues ownerId="test-owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Début avec le lecteur" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remplacer" })[0]);
    await screen.findByText(/Aucun fichier audio/);
    fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [new File(["sound"], "Mon départ.wav", { type: "audio/wav" })] } });
    expect(placeTransportCues.getSnapshot().start).toMatchObject({ player: true, sound: { title: "Mon départ", source: "blob:custom-cue", local: true } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Rétablir le son de début par défaut" }));
    expect(placeTransportCues.getSnapshot().start.sound).toMatchObject({ builtin: "countdown" });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:custom-cue");
  });
  it("uses only the current owner's actual audio library and does not play a selection", async () => {
    vi.mocked(profileMediaRepository.listOwnerMedia).mockResolvedValueOnce([
      { id: "a", kind: "audio", title: "Outro profil", sourceUrl: "https://example.test/private-signed-audio" },
      { id: "b", kind: "video", title: "Ma vidéo", sourceUrl: "https://example.test/video" },
    ] as Awaited<ReturnType<typeof profileMediaRepository.listOwnerMedia>>);
    render(<PlaceTimeCues ownerId="test-owner" />);
    fireEvent.click(screen.getAllByRole("button", { name: "Remplacer" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: /Outro profil/ }));
    expect(profileMediaRepository.listOwnerMedia).toHaveBeenCalledWith("test-owner");
    expect(placeTransportCues.getSnapshot().end.sound.source).toBe("https://example.test/private-signed-audio");
    expect(placeTwistAudio.play).not.toHaveBeenCalled();
  });
  it("can preview and cancel without changing activation or starting a transport", async () => {
    render(<PlaceTimeCues />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Écouter le son de début" })); });
    expect(placeTransportCues.getSnapshot()).toMatchObject({ playing: "start", waiting: false, start: { chrono: false, player: false } });
    fireEvent.click(screen.getByRole("button", { name: "Arrêter le son de début" }));
    await waitFor(() => expect(placeTransportCues.getSnapshot().playing).toBeNull());
  });
});
