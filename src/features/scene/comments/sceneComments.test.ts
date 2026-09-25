import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCENE_COMMENTS_STORAGE_KEY, sceneCommentsRepository } from "./sceneComments";

const AUTHOR = {
  authorId: "viewer-max",
  authorName: "Max",
  authorAvatarUrl: "/assets/orbit/founder-puff.png",
};

describe("sceneCommentsRepository", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("crypto", { randomUUID: () => "comment-new" });
  });

  it("fournit une conversation de démonstration cohérente sans écran vide", () => {
    const comments = sceneCommentsRepository.list("video-1");
    expect(comments).toHaveLength(3);
    expect(comments.find(({ parentId }) => parentId)?.authorBadge).toBe("Artiste");
  });

  it("ajoute et normalise un commentaire puis le persiste", () => {
    sceneCommentsRepository.add({
      videoId: "video-1",
      body: "  Très   belle session.  ",
      author: AUTHOR,
      now: new Date("2026-08-08T09:00:00Z"),
    });
    const comments = sceneCommentsRepository.list("video-1");
    expect(comments[comments.length - 1]).toMatchObject({
      id: "comment-new",
      body: "Très belle session.",
    });
    expect(window.localStorage.getItem(SCENE_COMMENTS_STORAGE_KEY)).toContain("Très belle session.");
  });

  it("bloque le spam immédiat d’un même compte", () => {
    sceneCommentsRepository.add({ videoId: "video-1", body: "Premier", author: AUTHOR, now: new Date("2026-08-08T09:00:00Z") });
    expect(() => sceneCommentsRepository.add({
      videoId: "video-1",
      body: "Deuxième",
      author: AUTHOR,
      now: new Date("2026-08-08T09:00:03Z"),
    })).toThrow("COMMENT_RATE_LIMITED");
  });

  it("permet aimer, signaler et supprimer uniquement son propre commentaire", () => {
    const added = sceneCommentsRepository.add({ videoId: "video-1", body: "À supprimer", author: AUTHOR, now: new Date("2026-08-08T09:00:00Z") });
    expect(sceneCommentsRepository.toggleLike("video-1", added.id).find(({ id }) => id === added.id)).toMatchObject({ likedByViewer: true, likeCount: 1 });
    expect(sceneCommentsRepository.report("video-1", added.id).find(({ id }) => id === added.id)?.reported).toBe(true);
    expect(sceneCommentsRepository.removeOwn("video-1", added.id, "another-user").some(({ id }) => id === added.id)).toBe(true);
    expect(sceneCommentsRepository.removeOwn("video-1", added.id, AUTHOR.authorId).some(({ id }) => id === added.id)).toBe(false);
  });
});
