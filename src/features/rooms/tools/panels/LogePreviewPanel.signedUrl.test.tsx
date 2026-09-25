import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { LogeState, RoomToolsCommand } from "../roomTools.types";
import LogePreviewPanel from "./LogePreviewPanel";

const mediaService = vi.hoisted(() => ({
  remove: vi.fn(),
  requestUrl: vi.fn(),
  upload: vi.fn(),
  validate: vi.fn(),
}));

vi.mock("../audio/logePreviewMedia.service", () => ({
  removeLogePreviewMedia: mediaService.remove,
  requestLogePreviewMediaUrl: mediaService.requestUrl,
  uploadLogePreviewMedia: mediaService.upload,
  validateLogePreviewMediaFile: mediaService.validate,
}));

const ROOM_ID = "51000000-0000-4000-8000-000000000099";
const USER_ID = "52000000-0000-4000-8000-000000000099";
const FIRST_PATH = `${ROOM_ID}/${USER_ID}/53000000-0000-4000-8000-000000000099.wav`;
const SECOND_PATH = `${ROOM_ID}/${USER_ID}/54000000-0000-4000-8000-000000000099.wav`;

function liveLoge(mediaName = "first.wav", mediaPath = FIRST_PATH): LogeState {
  const base = createRoomToolsFixture("loge", ROOM_ID).loge!;
  return {
    ...base,
    preview: {
      ...base.preview,
      mediaName,
      mediaPath,
      expiresAt: "2099-01-01T00:00:00.000Z",
      durationSeconds: 127,
      channels: 2,
      sampleRate: 48_000,
      waveformPeaks: [-8_192, 12_288, -16_384, 20_480],
    },
  };
}

function renderPanel(loge: LogeState, execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined)) {
  const result = render(<LogePreviewPanel roomId={ROOM_ID} source="live" loge={loge} disabled={false} execute={execute} />);
  return { ...result, execute };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
  mediaService.requestUrl.mockReset();
  mediaService.remove.mockReset();
  mediaService.upload.mockReset();
  mediaService.validate.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LogePreviewPanel signed Host media", () => {
  it("requests on Play and ignores a late URL after the preview identity changes", async () => {
    let resolveFirst!: (value: { signedUrl: string; expiresAt: string }) => void;
    mediaService.requestUrl
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/second.wav?token=fresh", expiresAt: "2099-01-01T00:00:00.000Z" });

    const { container, rerender } = renderPanel(liveLoge());
    expect(mediaService.requestUrl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
    expect(mediaService.requestUrl).toHaveBeenCalledWith(ROOM_ID);

    rerender(<LogePreviewPanel roomId={ROOM_ID} source="live" loge={liveLoge("second.wav", SECOND_PATH)} disabled={false} execute={vi.fn().mockResolvedValue(undefined)} />);
    await act(async () => {
      resolveFirst({ signedUrl: "https://media.example.test/first.wav?token=stale", expiresAt: "2099-01-01T00:00:00.000Z" });
      await Promise.resolve();
    });
    const audio = container.querySelector("audio")!;
    expect(audio).not.toHaveAttribute("src");
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
    await act(async () => { await Promise.resolve(); });
    expect(audio).toHaveAttribute("src", "https://media.example.test/second.wav?token=fresh");
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(1));
  });

  it("fails closed at signed-URL expiry and obtains a fresh URL on the next Play", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T18:00:00.000Z"));
    mediaService.requestUrl
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/first.wav?token=short", expiresAt: "2026-08-20T18:00:01.000Z" })
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/first.wav?token=fresh", expiresAt: "2026-08-20T19:00:00.000Z" });
    const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
    const { container } = renderPanel({ ...liveLoge(), preview: { ...liveLoge().preview, playing: true } }, execute);
    const audio = container.querySelector("audio")!;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
      await Promise.resolve();
    });
    expect(audio).toHaveAttribute("src", "https://media.example.test/first.wav?token=short");

    act(() => { vi.advanceTimersByTime(1_001); });
    expect(audio).not.toHaveAttribute("src");
    expect(execute).not.toHaveBeenCalled();
    expect(mediaService.requestUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
      await Promise.resolve();
    });
    expect(mediaService.requestUrl).toHaveBeenCalledTimes(2);
    expect(audio).toHaveAttribute("src", "https://media.example.test/first.wav?token=fresh");
  });

  it("clears a failed signed URL and retries only after an explicit Play", async () => {
    mediaService.requestUrl
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/first.wav?token=broken", expiresAt: "2099-01-01T00:00:00.000Z" })
      .mockResolvedValueOnce({ signedUrl: "https://media.example.test/first.wav?token=recovered", expiresAt: "2099-01-01T00:00:00.000Z" });
    const { container } = renderPanel(liveLoge());
    const audio = container.querySelector("audio")!;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
      await Promise.resolve();
    });
    fireEvent.error(audio);
    expect(audio).not.toHaveAttribute("src");
    expect(mediaService.requestUrl).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Lire la prévisualisation privée" }));
      await Promise.resolve();
    });
    expect(mediaService.requestUrl).toHaveBeenCalledTimes(2);
    expect(audio).toHaveAttribute("src", "https://media.example.test/first.wav?token=recovered");
  });
});
