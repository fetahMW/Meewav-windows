import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ShortsVideoPlayer, { type ShortsPlayerItem } from "./ShortsVideoPlayer";

const LANDSCAPE_ITEM: ShortsPlayerItem = {
  id: "player-test",
  title: "Session de test",
  artist: "NAYA K.",
  image: "/images/shorts/catalog-v3/daily-01-soul-singer.webp",
  video: "/media/shorts-demo/landscape-dj.mp4",
  format: "landscape",
  role: "Chanteuse · Interprète",
  city: "Paris",
  views: "1,2 k vues",
  meta: "Soul · Performance",
  availability: "Recherche un projet",
  verified: true,
  gradeLevel: 3,
  likeCount: 1_248,
  goldenLikeCount: 36,
};

const MULTICAM_ITEM: ShortsPlayerItem = {
  ...LANDSCAPE_ITEM,
  id: "player-multicam-test",
  title: "Session multi-cam",
  secondaryVideo: "/media/shorts-demo/landscape-guitar.mp4",
  multicamLayout: "pip",
};

const AUDIO_VISUALIZER_ITEM: ShortsPlayerItem = {
  ...LANDSCAPE_ITEM,
  id: "player-audio-visualizer-test",
  title: "Voix de minuit",
  video: "/media/profile-demo/vocal-session-audio.mp3",
  audioUrl: "/media/profile-demo/vocal-session-audio.mp3",
  presentationFormat: "audio_visualizer",
};

const PLAYER_PREFERENCES_KEY = "meewav:shorts:player-preferences";

const originalRequestFullscreen = Object.getOwnPropertyDescriptor(Element.prototype, "requestFullscreen");
const originalFullscreenElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
const originalExitFullscreen = Object.getOwnPropertyDescriptor(document, "exitFullscreen");
const originalPictureInPictureEnabled = Object.getOwnPropertyDescriptor(document, "pictureInPictureEnabled");
const originalPictureInPictureElement = Object.getOwnPropertyDescriptor(document, "pictureInPictureElement");
const originalExitPictureInPicture = Object.getOwnPropertyDescriptor(document, "exitPictureInPicture");
const originalRequestPictureInPicture = Object.getOwnPropertyDescriptor(
  HTMLVideoElement.prototype,
  "requestPictureInPicture",
);

function restoreProperty(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
  } else {
    Reflect.deleteProperty(target, key);
  }
}

describe("ShortsVideoPlayer", () => {
  let fullscreenElement: Element | null;
  let pictureInPictureElement: Element | null;
  let requestFullscreen: ReturnType<typeof vi.fn>;
  let exitFullscreen: ReturnType<typeof vi.fn>;
  let requestPictureInPicture: ReturnType<typeof vi.fn>;
  let exitPictureInPicture: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fullscreenElement = null;
    pictureInPictureElement = null;
    window.sessionStorage.clear();

    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function play(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("play"));
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function pause(this: HTMLMediaElement) {
      this.dispatchEvent(new Event("pause"));
    });
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);

    requestFullscreen = vi.fn(function (this: Element) {
      fullscreenElement = this;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    exitFullscreen = vi.fn(() => {
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
      return Promise.resolve();
    });
    Object.defineProperty(Element.prototype, "requestFullscreen", {
      configurable: true,
      value: requestFullscreen,
    });
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });

    requestPictureInPicture = vi.fn(() => {
      pictureInPictureElement = document.querySelector("video");
      pictureInPictureElement?.dispatchEvent(new Event("enterpictureinpicture"));
      return Promise.resolve();
    });
    exitPictureInPicture = vi.fn(() => {
      pictureInPictureElement?.dispatchEvent(new Event("leavepictureinpicture"));
      pictureInPictureElement = null;
      return Promise.resolve();
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      get: () => pictureInPictureElement,
    });
    Object.defineProperty(document, "exitPictureInPicture", {
      configurable: true,
      value: exitPictureInPicture,
    });
    Object.defineProperty(HTMLVideoElement.prototype, "requestPictureInPicture", {
      configurable: true,
      value: requestPictureInPicture,
    });
  });

  afterEach(() => {
    cleanup();
    restoreProperty(Element.prototype, "requestFullscreen", originalRequestFullscreen);
    restoreProperty(document, "fullscreenElement", originalFullscreenElement);
    restoreProperty(document, "exitFullscreen", originalExitFullscreen);
    restoreProperty(document, "pictureInPictureEnabled", originalPictureInPictureEnabled);
    restoreProperty(document, "pictureInPictureElement", originalPictureInPictureElement);
    restoreProperty(document, "exitPictureInPicture", originalExitPictureInPicture);
    restoreProperty(
      HTMLVideoElement.prototype,
      "requestPictureInPicture",
      originalRequestPictureInPicture,
    );
  });

  it("keeps playback alive through settings, cinema and mini-player modes", async () => {
    const user = userEvent.setup();
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    const dialog = screen.getByRole("dialog", { name: "Lecteur de Session de test" });
    const video = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: "Réglages, vitesse 1×" }));
    const slowestRate = screen.getByRole("menuitemradio", { name: "0.25×" });
    slowestRate.focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("menuitemradio", { name: "0.5×" })).toHaveFocus();
    await user.click(screen.getByRole("menuitemradio", { name: "1.5×" }));
    expect(video.playbackRate).toBe(1.5);
    expect(screen.getByRole("button", { name: "Réglages, vitesse 1.5×" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Mode cinéma (t)" }));
    expect(dialog).toHaveClass("is-theater");

    await user.click(screen.getByRole("button", { name: "Réduire en mini-lecteur (i)" }));
    expect(dialog).toHaveClass("is-miniplayer");
    expect(dialog).toHaveAttribute("role", "region");
    expect(dialog).not.toHaveAttribute("aria-modal");
    expect(screen.queryByText(/Raccourcis :/)).not.toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Agrandir le lecteur" })[0]);
    expect(dialog).not.toHaveClass("is-miniplayer");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(video).toBeInTheDocument();
  });

  it("supports fullscreen and Picture-in-Picture with browser APIs", async () => {
    const user = userEvent.setup();
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Plein écran (f)" }));
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Quitter le plein écran (f)" })).toBeVisible();
    expect(document.fullscreenElement).toHaveClass("shorts-player-frame");
    expect(document.fullscreenElement).toContainElement(document.querySelector("video"));

    await user.click(screen.getByRole("button", { name: "Quitter le plein écran (f)" }));
    expect(exitFullscreen).toHaveBeenCalledOnce();

    const pipButton = screen.getByRole("button", { name: "Mode image dans l’image" });
    expect(pipButton).toBeEnabled();
    await user.click(pipButton);
    expect(requestPictureInPicture).toHaveBeenCalledOnce();
    expect(pipButton).toHaveClass("is-active");
    await user.click(pipButton);
    expect(exitPictureInPicture).toHaveBeenCalledOnce();
  });

  it("plays an audio-only publication through a visualizer", () => {
    render(
      <ShortsVideoPlayer
        item={AUDIO_VISUALIZER_ITEM}
        onClose={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(screen.getByRole("dialog", { name: /Lecteur de Voix de minuit/i }))
      .toHaveClass("is-audio-visualizer");
    expect(screen.getByLabelText("Lecture de Voix de minuit"))
      .toHaveAttribute("src", AUDIO_VISUALIZER_ITEM.audioUrl);
    expect(document.querySelector(".scene-audio-visualizer__bars")).not.toBeNull();
  });

  it("keeps likes, Golden Likes and artist actions visible and wired after opening a video", async () => {
    const user = userEvent.setup();
    const onToggleLike = vi.fn();
    const onGiveGoldenLike = vi.fn();
    const onContact = vi.fn();
    const onCollaborate = vi.fn();
    const onViewProfile = vi.fn();

    render(
      <ShortsVideoPlayer
        item={LANDSCAPE_ITEM}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onToggleLike={onToggleLike}
        onGiveGoldenLike={onGiveGoldenLike}
        onContact={onContact}
        onCollaborate={onCollaborate}
        onViewProfile={onViewProfile}
      />,
    );

    const grade = screen.getByLabelText("Grade MeeWav de NAYA K.");
    expect(grade).toHaveClass("mw-grade-badge--icon", "mw-grade-badge--sm");
    expect(grade).not.toHaveClass("mw-grade-badge--compact-pill");

    const like = screen.getByRole("button", { name: /Aimer la vidéo de NAYA K\./ });
    const goldenLike = screen.getByRole("button", { name: /Offrir un Golden Like à NAYA K\./ });
    expect(like).toBeVisible();
    expect(like).toHaveTextContent("1,2 k");
    expect(goldenLike).toBeVisible();
    expect(goldenLike).toHaveTextContent("36");

    await user.click(like);
    await user.click(goldenLike);
    await user.click(screen.getByRole("button", { name: "Contacter" }));
    await user.click(screen.getByRole("button", { name: "Demande de collab" }));
    await user.click(screen.getByRole("button", { name: "Voir le profil" }));

    expect(onToggleLike).toHaveBeenCalledOnce();
    expect(onGiveGoldenLike).toHaveBeenCalledOnce();
    expect(onContact).toHaveBeenCalledOnce();
    expect(onCollaborate).toHaveBeenCalledOnce();
    expect(onViewProfile).toHaveBeenCalledOnce();
  });

  it("supports familiar playback, seek, mute and numeric keyboard shortcuts", async () => {
    const user = userEvent.setup();
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    const video = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    fireEvent.durationChange(video);
    video.currentTime = 20;
    fireEvent.timeUpdate(video);

    await user.keyboard("l");
    expect(video.currentTime).toBe(30);
    await user.keyboard("5");
    expect(video.currentTime).toBe(60);

    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "0.4" } });
    expect(video.volume).toBe(.4);
    await user.keyboard("m");
    expect(video.muted).toBe(true);

    await user.keyboard("k");
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    await user.keyboard("k");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });

  it("preserves browser shortcuts, restores focus and stops playback on close", async () => {
    const user = userEvent.setup();
    const origin = document.createElement("button");
    origin.textContent = "Miniature d’origine";
    document.body.append(origin);
    origin.focus();
    const onClose = vi.fn();

    const { unmount } = render(
      <ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={onClose} onNotify={vi.fn()} />,
    );

    await user.keyboard("{Control>}f{/Control}");
    expect(requestFullscreen).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Fermer le lecteur" })[0]);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();

    unmount();
    expect(origin).toHaveFocus();
    origin.remove();
  });

  it("shows a recoverable state when a media file cannot be loaded", async () => {
    const user = userEvent.setup();
    const onNotify = vi.fn();
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={onNotify} />);

    const video = screen.getByLabelText("Lecture de Session de test");
    fireEvent.error(video);

    expect(screen.getByRole("status")).toHaveTextContent("Lecture impossible");
    expect(onNotify).toHaveBeenCalledWith(expect.stringMatching(/n’a pas pu être chargée/));

    await user.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("shows buffering feedback until the media can play", () => {
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    const video = screen.getByLabelText("Lecture de Session de test");
    expect(screen.getByRole("status", { name: "Chargement de la vidéo" }))
      .toHaveTextContent("Chargement");
    expect(screen.getByLabelText("Position de lecture")).toBeDisabled();

    fireEvent.canPlay(video);
    expect(screen.queryByRole("status", { name: "Chargement de la vidéo" }))
      .not.toBeInTheDocument();

    fireEvent.waiting(video);
    expect(screen.getByRole("status", { name: "Chargement de la vidéo" }))
      .toBeVisible();

    fireEvent.canPlay(video);
    expect(screen.queryByRole("status", { name: "Chargement de la vidéo" }))
      .not.toBeInTheDocument();
  });

  it("offers replay at the end and restarts from the beginning", async () => {
    const user = userEvent.setup();
    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    const video = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    fireEvent.durationChange(video);
    fireEvent.canPlay(video);
    video.currentTime = 120;

    fireEvent.ended(video);
    const replay = screen.getByRole("button", { name: "Rejouer la vidéo" });
    expect(replay).toBeVisible();
    expect(screen.queryByRole("button", { name: "Lire la vidéo" })).not.toBeInTheDocument();

    const playCallsBeforeReplay = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    await user.click(replay);

    expect(video.currentTime).toBe(0);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playCallsBeforeReplay + 1);
    expect(screen.queryByRole("button", { name: "Rejouer la vidéo" })).not.toBeInTheDocument();
  });

  it("restores volume, mute and playback speed from session preferences", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />,
    );

    const firstVideo = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    fireEvent.canPlay(firstVideo);
    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "0.35" } });
    await user.click(screen.getByRole("button", { name: "Couper le son (m)" }));
    await user.click(screen.getByRole("button", { name: "Réglages, vitesse 1×" }));
    await user.click(screen.getByRole("menuitemradio", { name: "1.75×" }));

    await waitFor(() => {
      expect(JSON.parse(window.sessionStorage.getItem(PLAYER_PREFERENCES_KEY) ?? "{}"))
        .toEqual({ volume: 0.35, muted: true, playbackRate: 1.75 });
    });

    firstRender.unmount();
    render(
      <ShortsVideoPlayer
        item={{ ...LANDSCAPE_ITEM, id: "player-preferences-restored" }}
        onClose={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    const restoredVideo = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    await waitFor(() => {
      expect(restoredVideo.volume).toBe(0.35);
      expect(restoredVideo.muted).toBe(true);
      expect(restoredVideo.playbackRate).toBe(1.75);
    });
    expect(screen.getByRole("button", { name: "Activer le son (m)" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Réglages, vitesse 1.75×" })).toBeVisible();
  });

  it("does not intercept player shortcuts when an external button owns focus in mini-player mode", async () => {
    const user = userEvent.setup();
    const externalButton = document.createElement("button");
    externalButton.textContent = "Action extérieure";
    document.body.append(externalButton);
    externalButton.focus();

    render(<ShortsVideoPlayer item={LANDSCAPE_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Réduire en mini-lecteur (i)" }));

    expect(externalButton).toHaveFocus();
    const playCalls = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    const pauseCalls = vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;

    fireEvent.keyDown(externalButton, { key: "k" });

    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(playCalls);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalledTimes(pauseCalls);
    externalButton.remove();
  });

  it("renders and synchronizes the secondary video in multi-camera mode", async () => {
    const user = userEvent.setup();
    render(<ShortsVideoPlayer item={MULTICAM_ITEM} onClose={vi.fn()} onNotify={vi.fn()} />);

    const primary = screen.getByLabelText("Lecture de Session multi-cam") as HTMLVideoElement;
    const secondary = screen.getByLabelText("Seconde caméra de Session multi-cam") as HTMLVideoElement;
    const frame = primary.closest(".shorts-player-frame");

    expect(frame).toHaveClass("has-multicam", "is-layout-pip");
    expect(primary).toHaveAttribute("src", LANDSCAPE_ITEM.video);
    expect(secondary).toHaveAttribute("src", MULTICAM_ITEM.secondaryVideo);
    expect(secondary.muted).toBe(true);

    primary.currentTime = 18;
    secondary.currentTime = 0;
    fireEvent.timeUpdate(primary);
    expect(secondary.currentTime).toBe(18);

    await user.click(screen.getByRole("button", { name: "Réglages, vitesse 1×" }));
    await user.click(screen.getByRole("menuitemradio", { name: "1.25×" }));
    expect(primary.playbackRate).toBe(1.25);
    expect(secondary.playbackRate).toBe(1.25);

    const pauseCallsBefore = vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Mettre en pause (k)" }));
    expect(vi.mocked(HTMLMediaElement.prototype.pause).mock.calls.length - pauseCallsBefore)
      .toBeGreaterThanOrEqual(2);
  });

  it("restores a saved position and reports throttled progress plus completion", () => {
    let now = 1_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const onProgress = vi.fn();
    const onCompleted = vi.fn();
    render(
      <ShortsVideoPlayer
        item={LANDSCAPE_ITEM}
        initialTime={42}
        progressThrottleMs={1_000}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onProgress={onProgress}
        onCompleted={onCompleted}
      />,
    );

    const video = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    expect(video).toHaveAttribute("preload", "metadata");
    Object.defineProperty(video, "duration", { configurable: true, value: 120 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);

    video.currentTime = 44;
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      itemId: LANDSCAPE_ITEM.id,
      currentTime: 44,
      duration: 120,
      completed: false,
    }));

    now = 1_400;
    video.currentTime = 48;
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(1);

    now = 2_100;
    video.currentTime = 54;
    fireEvent.timeUpdate(video);
    expect(onProgress).toHaveBeenCalledTimes(2);

    video.currentTime = 120;
    fireEvent.ended(video);
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      currentTime: 120,
      percent: 100,
      completed: true,
    }));
    expect(onCompleted).toHaveBeenCalledOnce();
  });

  it("isolates failing progress observers from media playback", () => {
    render(
      <ShortsVideoPlayer
        item={LANDSCAPE_ITEM}
        progressThrottleMs={0}
        onClose={vi.fn()}
        onNotify={vi.fn()}
        onProgress={() => { throw new Error("storage blocked"); }}
        onCompleted={() => { throw new Error("observer blocked"); }}
      />,
    );

    const video = screen.getByLabelText("Lecture de Session de test") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { configurable: true, value: 60 });
    video.currentTime = 12;
    expect(() => fireEvent.timeUpdate(video)).not.toThrow();
    video.currentTime = 60;
    expect(() => fireEvent.ended(video)).not.toThrow();
  });
});
