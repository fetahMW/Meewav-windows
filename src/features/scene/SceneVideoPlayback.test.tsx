import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SceneVideoPlayback from "./SceneVideoPlayback";
import type { ShortsVideoPlayerProps } from "../shorts/ShortsVideoPlayer";

vi.mock("../shorts/ShortsVideoPlayer", async (original) => {
  const module = await original<typeof import("../shorts/ShortsVideoPlayer")>();
  return { ...module, default: (props: ShortsVideoPlayerProps) => <div data-testid="content-player">{props.item.title}</div> };
});
const props: ShortsVideoPlayerProps = { item: { id: "one", title: "Première vidéo", artist: "Naya", image: "/image.webp", video: "/content.mp4", role: "Artiste", city: "Paris", views: "12", meta: "Live" }, presentation: "watch", onClose: vi.fn(), onNotify: vi.fn() };
const time = (seconds: number) => { const video = screen.getByLabelText("Publicité : découvre MeeWav") as HTMLVideoElement; video.currentTime = seconds; fireEvent.timeUpdate(video); };

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Publicité commune de La Scène", () => {
  it("attend cinq secondes de média, puis monte la vidéo seulement après Ignorer", () => {
    vi.useFakeTimers();
    render(<SceneVideoPlayback {...props} />);
    expect(screen.queryByTestId("content-player")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("button", { name: "Ignorer dans 5 s" })).toBeDisabled();
    time(4.9);
    expect(screen.getByRole("button", { name: "Ignorer dans 1 s" })).toBeDisabled();
    time(5);
    fireEvent.click(screen.getByRole("button", { name: "Ignorer la publicité" }));
    expect(screen.getByTestId("content-player")).toHaveTextContent("Première vidéo");
    expect(screen.queryByLabelText("Publicité : découvre MeeWav")).not.toBeInTheDocument();
  });
  it("enchaîne automatiquement après les quinze secondes du spot", () => {
    render(<SceneVideoPlayback {...props} />);
    time(15);
    expect(screen.getByTestId("content-player")).toBeVisible();
  });
  it("permet de continuer si le média publicitaire échoue", () => {
    render(<SceneVideoPlayback {...props} />);
    fireEvent.error(screen.getByLabelText("Publicité : découvre MeeWav"));
    expect(screen.getByRole("status")).toHaveTextContent("La publicité n’est pas disponible");
    fireEvent.click(screen.getByRole("button", { name: "Ignorer la publicité" }));
    expect(screen.getByTestId("content-player")).toBeVisible();
  });
  it("conserve le volume pour la vidéo et relance le spot pour une autre vidéo", () => {
    const view = render(<SceneVideoPlayback key="one" {...props} />);
    fireEvent.change(screen.getByRole("slider", { name: "Volume" }), { target: { value: "0.4" } });
    expect((screen.getByLabelText("Publicité : découvre MeeWav") as HTMLVideoElement).volume).toBe(.4);
    expect(JSON.parse(sessionStorage.getItem("meewav:shorts:player-preferences")!).volume).toBe(.4);
    time(5);
    fireEvent.click(screen.getByRole("button", { name: "Ignorer la publicité" }));
    view.rerender(<SceneVideoPlayback key="two" {...props} item={{ ...props.item, id: "two" }} />);
    expect(screen.getByRole("button", { name: "Ignorer dans 5 s" })).toBeDisabled();
    expect(screen.queryByTestId("content-player")).not.toBeInTheDocument();
  });
  it("libère le média en quittant la publicité et annule son délai de secours", () => {
    vi.useFakeTimers();
    const timer = vi.spyOn(window, "setTimeout");
    const clear = vi.spyOn(window, "clearTimeout");
    const view = render(<SceneVideoPlayback {...props} />);
    const timeoutIndex = timer.mock.calls.findIndex((call) => call[1] === 12000);
    const timeoutId = timer.mock.results[timeoutIndex].value;
    view.unmount();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(timeoutId);
  });
});
