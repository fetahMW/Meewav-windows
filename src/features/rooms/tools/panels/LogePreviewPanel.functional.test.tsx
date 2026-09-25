import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoomToolsFixture } from "../roomTools.fixtures";
import type { LogePreviewTransportStatus, LogeState, RoomToolsCommand } from "../roomTools.types";
import LogePreviewPanel from "./LogePreviewPanel";

const mediaService = vi.hoisted(() => ({
  remove: vi.fn(),
  requestUrl: vi.fn(),
  upload: vi.fn(),
  validate: vi.fn(),
}));
const waveformService = vi.hoisted(() => ({ decode: vi.fn() }));

vi.mock("../audio/logePreviewMedia.service", () => ({
  removeLogePreviewMedia: mediaService.remove,
  requestLogePreviewMediaUrl: mediaService.requestUrl,
  uploadLogePreviewMedia: mediaService.upload,
  validateLogePreviewMediaFile: mediaService.validate,
}));
vi.mock("../audio/previewWaveform", async (importOriginal) => ({
  ...await importOriginal<typeof import("../audio/previewWaveform")>(),
  decodeAudioWaveform: waveformService.decode,
}));

const ROOM_ID = "51000000-0000-4000-8000-000000000098";
const MEDIA_PATH = `${ROOM_ID}/52000000-0000-4000-8000-000000000098/53000000-0000-4000-8000-000000000098.wav`;

function loge(status: LogePreviewTransportStatus = "idle", kind: "audio" | "video" | "image" = "audio"): LogeState {
  const base = createRoomToolsFixture("loge", ROOM_ID).loge!;
  const extension = kind === "video" ? "mp4" : kind === "image" ? "png" : "wav";
  return {
    ...base,
    preview: {
      ...base.preview,
      mediaName: `exclusive.${extension}`,
      mediaPath: MEDIA_PATH.replace(/\.wav$/, `.${extension}`),
      mediaKind: kind,
      durationSeconds: kind === "image" ? null : 42,
      volume: .7,
      transportStatus: status,
      sessionId: status === "idle" ? null : "preview:session-1",
      positionSeconds: status === "finished" ? 42 : 4,
      startedAt: status === "playing" ? new Date().toISOString() : null,
      playing: status === "playing",
    },
  };
}

function mount(value = loge()) {
  const execute = vi.fn<(command: RoomToolsCommand) => Promise<unknown>>().mockResolvedValue(undefined);
  const result = render(<LogePreviewPanel roomId={ROOM_ID} source="live" loge={value} disabled={false} execute={execute} />);
  return { ...result, execute };
}

beforeEach(() => {
  mediaService.requestUrl.mockResolvedValue({
    signedUrl: "https://media.example.test/exclusive.wav?token=private",
    expiresAt: "2099-01-01T00:00:00.000Z",
  });
  mediaService.remove.mockResolvedValue(undefined);
  waveformService.decode.mockResolvedValue({
    durationSeconds: 1,
    channels: 1,
    sampleRate: 44_100,
    peaks: [{ min: -.25, max: .5 }],
  });
  mediaService.upload.mockImplementation(async ({ file }: { file: File }) => MEDIA_PATH.replace(/\.wav$/, `.${file.name.split(".").pop()!.toLowerCase()}`));
  mediaService.validate.mockImplementation((file: File) => {
    const extension = file.name.split(".").pop()!.toLowerCase();
    return {
      extension,
      contentType: file.type,
      kind: file.type.startsWith("video/") ? "video" : file.type.startsWith("image/") ? "image" : "audio",
    };
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("LogePreviewPanel functional transport", () => {
  it.each([
    ["audio", "replacement.wav", "audio/wav"],
    ["video", "replacement.mp4", "video/mp4"],
    ["image", "replacement.png", "image/png"],
  ] as const)("replaces the selected content with a validated %s file", async (kind, name, type) => {
    const { container, execute } = mount();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const inputClick = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Remplacer le contenu" }));
    expect(inputClick).toHaveBeenCalledOnce();

    const file = new File([new Uint8Array([1, 2, 3])], name, { type });
    if (kind === "audio") Object.defineProperty(file, "arrayBuffer", { value: vi.fn().mockResolvedValue(new ArrayBuffer(3)) });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(mediaService.validate).toHaveBeenCalledWith(file));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.preview.patch",
      patch: expect.objectContaining({ mediaName: name, mediaKind: kind }),
    })));
  });

  it("routes the media-library CTA through the same private file picker", () => {
    const { container } = mount();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const inputClick = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter depuis mes médias" }));
    expect(inputClick).toHaveBeenCalledOnce();
  });

  it.each(["audio", "video", "image"] as const)("opens a private %s preview through a signed URL", async (kind) => {
    const { container } = mount(loge("idle", kind));
    fireEvent.click(screen.getByRole("button", { name: "Prévisualiser" }));

    await waitFor(() => expect(mediaService.requestUrl).toHaveBeenCalledWith(ROOM_ID));
    if (kind === "image") {
      expect(await screen.findByRole("img", { name: "Prévisualisation de exclusive.png" })).toHaveAttribute("src", expect.stringContaining("token=private"));
    } else {
      await waitFor(() => expect(container.querySelector(kind)).toHaveAttribute("src", expect.stringContaining("token=private")));
    }
  });

  it("launches publicly even when the browser refuses local monitoring playback", async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("autoplay_blocked"));
    const { execute } = mount();

    fireEvent.click(screen.getByRole("button", { name: "Lancer dans La Loge" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      type: "loge.preview.launch",
      expectedMedia: { mediaName: "exclusive.wav", mediaPath: MEDIA_PATH },
      positionSeconds: 0,
      volume: .7,
    })));
    expect(screen.queryByText("Le lancement dans La Loge a échoué.")).not.toBeInTheDocument();
  });

  it("sends pause, resume, restart, volume and stop through the active session", async () => {
    const active = loge("playing");
    const { execute, rerender } = mount(active);

    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.pause", sessionId: "preview:session-1" })));

    rerender(<LogePreviewPanel roomId={ROOM_ID} source="live" loge={loge("paused")} disabled={false} execute={execute} />);
    fireEvent.click(screen.getByRole("button", { name: "Reprendre" }));
    fireEvent.click(screen.getByRole("button", { name: "Revenir au début" }));
    fireEvent.change(screen.getByRole("slider", { name: /^Volume/ }), { target: { value: ".35" } });
    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.resume", sessionId: "preview:session-1" })));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.restart", sessionId: "preview:session-1" })));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.volume", sessionId: "preview:session-1", volume: .35 }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.stop", sessionId: "preview:session-1" })));
  });

  it("marks a naturally ended media session as finished and offers a relaunch", async () => {
    const { container, execute, rerender } = mount(loge("playing"));
    fireEvent.ended(container.querySelector("audio")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "loge.preview.finish", sessionId: "preview:session-1" })));

    rerender(<LogePreviewPanel roomId={ROOM_ID} source="live" loge={loge("finished")} disabled={false} execute={execute} />);
    expect(screen.getByText("Avant-première terminée")).toBeVisible();
    expect(screen.getByRole("button", { name: "Relancer dans La Loge" })).toBeEnabled();
  });

  it("removes the selected media and its private object", async () => {
    const { execute } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith({
      type: "loge.preview.patch",
      expectedMedia: { mediaName: "exclusive.wav", mediaPath: MEDIA_PATH },
      patch: { mediaName: "", mediaPath: null, mediaKind: undefined },
    }));
    await waitFor(() => expect(mediaService.remove).toHaveBeenCalledWith(MEDIA_PATH));
  });
});
