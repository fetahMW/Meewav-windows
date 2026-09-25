import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { decodeAudioWaveform } from "../rooms/tools/audio/previewWaveform";
import { StemWaveform, stemWaveformPath } from "./StemWaveform";

vi.mock("../rooms/tools/audio/previewWaveform", () => ({ decodeAudioWaveform: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("conserve les transitoires, l’asymétrie et les silences lors de la réduction", () => {
  expect(stemWaveformPath([{ min: -.9, max: .2 }, { min: -.1, max: .8 }], 1)).toBe("M0.50,8.80V58.10");
  expect(stemWaveformPath([{ min: 0, max: 0 }], 100)).toBe("M50.50,32.00V32.00");
  expect(stemWaveformPath([], 100)).toBe("");
});

it("décode le vrai fichier avec l’algorithme Rooms à 4096 points", async () => {
  const bytes = new ArrayBuffer(8);
  const fetchAudio = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
  vi.stubGlobal("fetch", fetchAudio);
  vi.mocked(decodeAudioWaveform).mockResolvedValue({ durationSeconds: 2, channels: 1, sampleRate: 48000, peaks: [{ min: -.9, max: .2 }] });
  const { container } = render(<StemWaveform mediaUrls={["/audio/stem-test.wav"]} progress={50} />);
  await screen.findByRole("img", { name: "Forme d’onde du fichier audio" });
  expect(fetchAudio).toHaveBeenCalledWith("/audio/stem-test.wav");
  expect(decodeAudioWaveform).toHaveBeenCalledWith(bytes, 4096);
  expect(container.querySelector("path")?.getAttribute("d")).toBe("M320.50,26.20V58.10");
});

it("ne fabrique pas de signal en l’absence de fichier ou après une erreur", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  const { container, rerender } = render(<StemWaveform mediaUrls={[]} />);
  expect(screen.getByText("Fichier audio manquant")).toBeInTheDocument();
  expect(container.querySelector("path")).toBeNull();
  rerender(<StemWaveform mediaUrls={["/audio/missing-stem.wav"]} />);
  await waitFor(() => expect(screen.getByText("Analyse audio indisponible")).toBeInTheDocument());
  expect(container.querySelector("path")).toBeNull();
});
