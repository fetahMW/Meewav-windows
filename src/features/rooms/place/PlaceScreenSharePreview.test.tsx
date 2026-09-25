import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlaceScreenSharePreview from "./PlaceScreenSharePreview";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PlaceScreenSharePreview", () => {
  const host = { displayName: "Naya Oris", avatarUrl: "/avatars/naya.webp" };

  it("garde l’image du Host dans la prévisualisation même sans source", () => {
    render(<PlaceScreenSharePreview stream={null} host={host} />);

    expect(screen.getByRole("img", { name: "Aperçu permanent du Host Naya Oris" })).toHaveAttribute("src", host.avatarUrl);
    expect(screen.getByText("HOST · Naya Oris")).toBeVisible();
    expect(screen.queryByLabelText("Prévisualisation locale de la source sélectionnée")).not.toBeInTheDocument();
  });

  it("branche le vrai MediaStream sur une vidéo locale muette et le détache au démontage", () => {
    const stream = {} as MediaStream;
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { unmount } = render(<PlaceScreenSharePreview stream={stream} host={host} />);
    const video = screen.getByLabelText("Prévisualisation locale de la source sélectionnée") as HTMLVideoElement;

    expect(video.srcObject).toBe(stream);
    expect(video.muted).toBe(true);
    expect(video.autoplay).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.play).toHaveBeenCalledTimes(1);

    unmount();
    expect(video.srcObject).toBeNull();
  });

  it("déplace le calque au clavier et permet de réinitialiser sa position", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(<PlaceScreenSharePreview stream={{} as MediaStream} host={host} />);
    const layer = screen.getByRole("group", { name: /Position de la fenêtre partagée/i });

    expect(layer.style.getPropertyValue("--place-screen-x")).toBe("40%");
    expect(layer.style.getPropertyValue("--place-screen-y")).toBe("10%");
    fireEvent.keyDown(layer, { key: "ArrowRight" });
    fireEvent.keyDown(layer, { key: "ArrowDown", shiftKey: true });
    expect(layer.style.getPropertyValue("--place-screen-x")).toBe("42%");
    expect(layer.style.getPropertyValue("--place-screen-y")).toBe("18%");
    expect(layer).toHaveAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown Home");

    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser la position de la fenêtre" }));
    expect(layer.style.getPropertyValue("--place-screen-x")).toBe("40%");
    expect(layer.style.getPropertyValue("--place-screen-y")).toBe("10%");
  });

  it("borne le déplacement pointer pour que la fenêtre reste dans l’aperçu", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<PlaceScreenSharePreview stream={{} as MediaStream} host={host} />);
    const canvas = container.querySelector(".place-tool-screen__canvas") as HTMLDivElement;
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      toJSON: () => ({}),
    });
    const layer = screen.getByRole("group", { name: /Position de la fenêtre partagée/i });

    fireEvent.pointerDown(layer, { pointerId: 7, clientX: 100, clientY: 40 });
    fireEvent.pointerMove(layer, { pointerId: 7, clientX: 1_000, clientY: 1_000 });
    expect(layer.style.getPropertyValue("--place-screen-x")).toBe("48%");
    expect(layer.style.getPropertyValue("--place-screen-y")).toBe("52%");
    fireEvent.pointerUp(layer, { pointerId: 7 });

    fireEvent.pointerDown(layer, { pointerId: 8, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(layer, { pointerId: 8, clientX: -1_000, clientY: -1_000 });
    expect(layer.style.getPropertyValue("--place-screen-x")).toBe("0%");
    expect(layer.style.getPropertyValue("--place-screen-y")).toBe("0%");
  });
});
