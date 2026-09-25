import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeDisplayMediaError, usePlaceScreenShare } from "./usePlaceScreenShare";

class FakeTrack extends EventTarget {
  readyState: MediaStreamTrackState = "live";
  readonly stop = vi.fn(() => {
    this.readyState = "ended";
  });

  constructor(
    readonly kind: "video" | "audio",
    private readonly displaySurface?: DisplayCaptureSurfaceType,
  ) {
    super();
  }

  getSettings() {
    return this.displaySurface ? { displaySurface: this.displaySurface } : {};
  }

  end() {
    this.readyState = "ended";
    this.dispatchEvent(new Event("ended"));
  }
}

class FakeStream extends EventTarget {
  active = true;

  constructor(readonly tracks: FakeTrack[]) {
    super();
  }

  getTracks() {
    return this.tracks as unknown as MediaStreamTrack[];
  }

  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video") as unknown as MediaStreamTrack[];
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio") as unknown as MediaStreamTrack[];
  }

  inactivate() {
    this.active = false;
    this.dispatchEvent(new Event("inactive"));
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const originalMediaDevices = navigator.mediaDevices;

function installDisplayMedia(getDisplayMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getDisplayMedia },
  });
}

afterEach(() => {
  cleanup();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: originalMediaDevices,
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePlaceScreenShare", () => {
  it("garde la sélection en aperçu local jusqu’à la confirmation explicite", async () => {
    const video = new FakeTrack("video", "window");
    const audio = new FakeTrack("audio");
    const stream = new FakeStream([video, audio]) as unknown as MediaStream;
    const getDisplayMedia = vi.fn().mockResolvedValue(stream);
    installDisplayMedia(getDisplayMedia);
    const notice = vi.fn();
    const { result } = renderHook(() => usePlaceScreenShare({ roomId: "room-a", roomIsLive: true, onNotice: notice }));

    await act(async () => result.current.selectSource({ includeAudio: true }));

    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: true });
    expect(result.current.previewStream).toBe(stream);
    expect(result.current.publishedStream).toBeNull();
    expect(result.current.isPublished).toBe(false);
    expect(result.current.hasAudio).toBe(true);
    expect(result.current.sourceLabel).toBe("Fenêtre");

    act(() => result.current.publish());
    expect(result.current.publishedStream).toBe(stream);
    expect(result.current.isPublished).toBe(true);

    act(() => result.current.stop());
    act(() => result.current.stop());
    expect(result.current.previewStream).toBeNull();
    expect(result.current.publishedStream).toBeNull();
    expect(video.stop).toHaveBeenCalledTimes(1);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(notice).not.toHaveBeenCalled();
  });

  it("annule une réponse getDisplayMedia obsolète et conserve la dernière sélection", async () => {
    const firstRequest = deferred<MediaStream>();
    const secondRequest = deferred<MediaStream>();
    const firstVideo = new FakeTrack("video", "monitor");
    const secondVideo = new FakeTrack("video", "browser");
    const firstStream = new FakeStream([firstVideo]) as unknown as MediaStream;
    const secondStream = new FakeStream([secondVideo]) as unknown as MediaStream;
    installDisplayMedia(vi.fn()
      .mockImplementationOnce(() => firstRequest.promise)
      .mockImplementationOnce(() => secondRequest.promise));
    const { result } = renderHook(() => usePlaceScreenShare({ roomId: "room-a", roomIsLive: true, onNotice: vi.fn() }));

    let firstSelection!: Promise<MediaStream | null>;
    let secondSelection!: Promise<MediaStream | null>;
    act(() => {
      firstSelection = result.current.selectSource();
      secondSelection = result.current.selectSource();
    });
    await act(async () => {
      secondRequest.resolve(secondStream);
      await secondSelection;
    });
    await act(async () => {
      firstRequest.resolve(firstStream);
      await firstSelection;
    });

    expect(result.current.previewStream).toBe(secondStream);
    expect(result.current.sourceLabel).toBe("Onglet du navigateur");
    expect(firstVideo.stop).toHaveBeenCalledTimes(1);
    expect(secondVideo.stop).not.toHaveBeenCalled();
  });

  it("nettoie la capture lors d’un changement de room, d’une fin vidéo et d’un unmount", async () => {
    const firstVideo = new FakeTrack("video");
    const firstAudio = new FakeTrack("audio");
    const firstStream = new FakeStream([firstVideo, firstAudio]) as unknown as MediaStream;
    const secondVideo = new FakeTrack("video");
    const secondStream = new FakeStream([secondVideo]) as unknown as MediaStream;
    installDisplayMedia(vi.fn().mockResolvedValueOnce(firstStream).mockResolvedValueOnce(secondStream));
    const { result, rerender, unmount } = renderHook(
      ({ roomId }) => usePlaceScreenShare({ roomId, roomIsLive: true, onNotice: vi.fn() }),
      { initialProps: { roomId: "room-a" } },
    );

    await act(async () => result.current.selectSource());
    rerender({ roomId: "room-b" });
    expect(firstVideo.stop).toHaveBeenCalledTimes(1);
    expect(firstAudio.stop).toHaveBeenCalledTimes(1);
    expect(result.current.previewStream).toBeNull();

    await act(async () => result.current.selectSource());
    act(() => secondVideo.end());
    expect(result.current.previewStream).toBeNull();
    expect(result.current.isPublished).toBe(false);

    const pendingRequest = deferred<MediaStream>();
    const lateVideo = new FakeTrack("video");
    const lateStream = new FakeStream([lateVideo]) as unknown as MediaStream;
    installDisplayMedia(vi.fn(() => pendingRequest.promise));
    let pending!: Promise<MediaStream | null>;
    act(() => {
      pending = result.current.selectSource();
    });
    unmount();
    pendingRequest.resolve(lateStream);
    await pending;
    expect(lateVideo.stop).toHaveBeenCalledTimes(1);
  });

  it("réagit à l’événement inactive du flux et reflète l’audio réellement fourni", async () => {
    const video = new FakeTrack("video");
    const streamObject = new FakeStream([video]);
    const stream = streamObject as unknown as MediaStream;
    installDisplayMedia(vi.fn().mockResolvedValue(stream));
    const { result } = renderHook(() => usePlaceScreenShare({ roomId: "room-a", roomIsLive: true, onNotice: vi.fn() }));

    await act(async () => result.current.selectSource({ includeAudio: true }));
    expect(result.current.hasAudio).toBe(false);
    act(() => streamObject.inactivate());
    expect(result.current.previewStream).toBeNull();
  });
});

describe("describeDisplayMediaError", () => {
  it.each([
    [new DOMException("", "AbortError"), "interrompue"],
    [new DOMException("", "NotAllowedError"), "refusée ou annulée"],
    [new DOMException("", "NotFoundError"), "Aucune source"],
    [new DOMException("", "NotReadableError"), "ne peut pas être capturée"],
    [new DOMException("", "InvalidStateError"), "depuis le bouton"],
    [new TypeError("invalid constraints"), "refuse les réglages"],
  ])("distingue %s", (error, expected) => {
    expect(describeDisplayMediaError(error)).toContain(expected);
  });
});
