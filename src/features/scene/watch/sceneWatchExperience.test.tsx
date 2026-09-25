import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortsVideoPlayer from "../../shorts/ShortsVideoPlayer";
import SceneCommentsSection from "../comments/SceneCommentsSection";
import { moveQueuedVideo, parsePlaybackQueue } from "./useScenePlaybackQueue";

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("La Scène — continuité de lecture", () => {
  it("la page Watch ne verrouille ni la page ni le focus et conserve la même vidéo en mini-lecteur", () => {
    const item = { id: "watch-test", title: "Session", artist: "Alya", role: "Chanteuse", city: "Paris", image: "/image.webp", video: "/test.mp4", views: "12 vues", meta: "Live" };
    const props = { item, onClose: vi.fn(), onNotify: vi.fn(), presentation: "watch" as const, watchContent: <div>Commentaires dans la page</div> };
    const page = render(<><button>Accueil</button><ShortsVideoPlayer {...props} collapsed={false} /></>);
    const video = page.container.querySelector("video");
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accueil" }).closest('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText("Commentaires dans la page")).toBeVisible();
    if (video) video.currentTime = 8;
    page.rerender(<><button>Accueil</button><ShortsVideoPlayer {...props} collapsed /></>);
    expect(page.container.querySelector("video")).toBe(video);
    expect(video?.currentTime).toBe(8);
    expect(screen.queryByText("Commentaires dans la page")).not.toBeInTheDocument();
    page.rerender(<><button>Accueil</button><ShortsVideoPlayer {...props} collapsed={false} /></>);
    expect(page.container.querySelector("video")).toBe(video);
    expect(video?.currentTime).toBe(8);
  });
  it("restaure une file valide et respecte l’ordre manuel", () => {
    expect(parsePlaybackQueue('{"ids":["b","a","b",3],"autoplay":true}')).toEqual({ ids: ["b", "a"], autoplay: true });
    expect(parsePlaybackQueue("broken")).toEqual({ ids: [], autoplay: false });
    expect(moveQueuedVideo(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"]);
    expect(moveQueuedVideo(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });
});
describe("Commentaires dans le flux", () => {
  it("ne présente pas une conversation fictive sur une vidéo réelle", () => {
    render(<SceneCommentsSection videoId="real-video" demo={false} />);
    expect(screen.queryByText("Alya Flow")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Les commentaires de cette vidéo ne sont pas encore disponibles.")).toBeVisible();
  });
  it("conserve le brouillon après une navigation et ne publie pas de texte vide", async () => {
    const user = userEvent.setup();
    const view = render(<SceneCommentsSection videoId="draft-video" demo />);
    expect(screen.getByRole("button", { name: "Commenter" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Ajouter un commentaire" }), "Belle session, je reprends mon message.");
    view.unmount(); render(<SceneCommentsSection videoId="draft-video" demo />);
    expect(screen.getByRole("textbox")).toHaveValue("Belle session, je reprends mon message.");
  });
  it("ouvre les réponses à la demande puis insère une nouvelle réponse dans le bon fil", async () => {
    const user = userEvent.setup();
    render(<SceneCommentsSection videoId="reply-video" demo />);
    expect(screen.queryByText(/Merci Alya/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "1 réponse" }));
    expect(screen.getByText(/Merci Alya/)).toBeVisible();
    const parent = screen.getByText("Alya Flow").closest("article")!;
    await user.click(within(parent).getAllByRole("button", { name: "Répondre" })[0]);
    await user.type(screen.getByRole("textbox", { name: "Ta réponse" }), "Merci pour cette prise !");
    await user.click(within(screen.getByRole("textbox").closest("form")!).getByRole("button", { name: "Répondre" }));
    expect(within(parent).getByText("Merci pour cette prise !")).toBeVisible();
  });
  it("les timestamps cherchent la vidéo sans naviguer", async () => {
    const onSeek = vi.fn(); render(<SceneCommentsSection videoId="timestamp-video" demo onSeek={onSeek} />);
    fireEvent.click(screen.getByRole("button", { name: "1:42" })); expect(onSeek).toHaveBeenCalledWith(102);
  });
});
