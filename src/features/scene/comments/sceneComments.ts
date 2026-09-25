import { scenePrivateKey } from "../scenePrivateStorage";
export const SCENE_COMMENTS_STORAGE_KEY = "meewav:scene:comments:v1";

export type SceneComment = {
  id: string;
  videoId: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string;
  authorBadge?: "Artiste" | "Collaborateur" | "Équipe MeeWav";
  body: string;
  createdAt: string;
  likeCount: number;
  likedByViewer: boolean;
  pinned: boolean;
  reported: boolean;
};

type StoredSceneComments = {
  version: 1;
  comments: SceneComment[];
};

type SceneCommentAuthor = Pick<SceneComment, "authorId" | "authorName" | "authorAvatarUrl" | "authorBadge">;

const COMMENT_LIMIT = 800;
const COMMENT_RATE_LIMIT_MS = 5_000;

function storageAvailable() {
  try { return typeof window !== "undefined" && Boolean(window.localStorage); } catch { return false; }
}

function demoComments(videoId: string): SceneComment[] {
  return [
    {
      id: `demo-${videoId}-1`,
      videoId,
      parentId: null,
      authorId: "alya-flow",
      authorName: "Alya Flow",
      authorAvatarUrl: "/images/shorts/catalog-v3/daily-01-soul-singer.webp",
      authorBadge: "Artiste",
      body: "La direction live donne une autre dimension au morceau. Très belle prise.",
      createdAt: "2026-08-08T00:12:00+02:00",
      likeCount: 42,
      likedByViewer: false,
      pinned: true,
      reported: false,
    },
    {
      id: `demo-${videoId}-2`,
      videoId,
      parentId: null,
      authorId: "isaac-low",
      authorName: "Isaac Low",
      authorAvatarUrl: "/images/shorts/catalog-v2/creator-beatmaker-studio.webp",
      body: "Le passage à 1:42 est magnifique. Les crédits de la Session sont très clairs aussi.",
      createdAt: "2026-08-07T22:48:00+02:00",
      likeCount: 18,
      likedByViewer: false,
      pinned: false,
      reported: false,
    },
    {
      id: `demo-${videoId}-3`,
      videoId,
      parentId: `demo-${videoId}-1`,
      authorId: "naya-k",
      authorName: "Naya K.",
      authorAvatarUrl: "/images/shorts/catalog-v3/tv-09-sound-engineer-portrait.webp",
      authorBadge: "Artiste",
      body: "Merci Alya. La version acoustique arrive bientôt dans La Scène.",
      createdAt: "2026-08-08T00:24:00+02:00",
      likeCount: 11,
      likedByViewer: true,
      pinned: false,
      reported: false,
    },
  ];
}

function parseStored(value: string | null): StoredSceneComments {
  if (!value) return { version: 1, comments: [] };
  try {
    const parsed = JSON.parse(value) as Partial<StoredSceneComments>;
    return {
      version: 1,
      comments: Array.isArray(parsed.comments)
        ? parsed.comments.filter((comment): comment is SceneComment => (
          Boolean(comment)
          && typeof comment.id === "string"
          && typeof comment.videoId === "string"
          && typeof comment.body === "string"
        ))
        : [],
    };
  } catch {
    return { version: 1, comments: [] };
  }
}

function readStored() {
  if (!storageAvailable()) return { version: 1, comments: [] } satisfies StoredSceneComments;
  try {
    return parseStored(window.localStorage.getItem(scenePrivateKey(SCENE_COMMENTS_STORAGE_KEY)));
  } catch {
    return { version: 1, comments: [] } satisfies StoredSceneComments;
  }
}

function writeStored(document: StoredSceneComments) {
  if (!storageAvailable()) throw new Error("COMMENT_STORAGE_UNAVAILABLE");
  try {
    window.localStorage.setItem(scenePrivateKey(SCENE_COMMENTS_STORAGE_KEY), JSON.stringify(document));
  } catch {
    throw new Error("COMMENT_STORAGE_UNAVAILABLE");
  }
}

function commentsForVideo(document: StoredSceneComments, videoId: string) {
  const stored = document.comments.filter((comment) => comment.videoId === videoId);
  return stored.length > 0 ? stored : demoComments(videoId);
}

export const sceneCommentsRepository = {
  editOwn(videoId: string, commentId: string, viewerId: string, body: string) {
    const normalizedBody = body.trim();
    if (!normalizedBody || normalizedBody.length > COMMENT_LIMIT) throw new Error("COMMENT_INVALID");
    const document = readStored();
    const existing = commentsForVideo(document, videoId);
    const next = existing.map((comment) => comment.id === commentId && comment.authorId === viewerId ? { ...comment, body: normalizedBody } : comment);
    writeStored({ version: 1, comments: [...document.comments.filter((comment) => comment.videoId !== videoId), ...next] });
    return next.map((comment) => ({ ...comment }));
  },
  list(videoId: string) {
    return commentsForVideo(readStored(), videoId).map((comment) => ({ ...comment }));
  },

  add({
    videoId,
    body,
    author,
    parentId = null,
    now = new Date(),
  }: {
    videoId: string;
    body: string;
    author: SceneCommentAuthor;
    parentId?: string | null;
    now?: Date;
  }) {
    const normalizedBody = body.trim().replace(/\s+/g, " ");
    if (!normalizedBody) throw new Error("EMPTY_COMMENT");
    if (normalizedBody.length > COMMENT_LIMIT) throw new Error("COMMENT_TOO_LONG");

    const document = readStored();
    const existing = commentsForVideo(document, videoId);
    const latestOwnComment = existing
      .filter((comment) => comment.authorId === author.authorId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];
    if (latestOwnComment && now.getTime() - Date.parse(latestOwnComment.createdAt) < COMMENT_RATE_LIMIT_MS) {
      throw new Error("COMMENT_RATE_LIMITED");
    }
    if (parentId && !existing.some((comment) => comment.id === parentId && comment.parentId === null)) {
      throw new Error("UNKNOWN_PARENT_COMMENT");
    }

    const comment: SceneComment = {
      id: typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `comment-${now.getTime()}`,
      videoId,
      parentId,
      ...author,
      body: normalizedBody,
      createdAt: now.toISOString(),
      likeCount: 0,
      likedByViewer: false,
      pinned: false,
      reported: false,
    };
    const withoutVideo = document.comments.filter((item) => item.videoId !== videoId);
    writeStored({ version: 1, comments: [...withoutVideo, ...existing, comment] });
    return { ...comment };
  },

  toggleLike(videoId: string, commentId: string) {
    const document = readStored();
    const existing = commentsForVideo(document, videoId);
    const next = existing.map((comment) => comment.id === commentId
      ? {
        ...comment,
        likedByViewer: !comment.likedByViewer,
        likeCount: Math.max(0, comment.likeCount + (comment.likedByViewer ? -1 : 1)),
      }
      : comment);
    writeStored({
      version: 1,
      comments: [
        ...document.comments.filter((comment) => comment.videoId !== videoId),
        ...next,
      ],
    });
    return next.map((comment) => ({ ...comment }));
  },

  report(videoId: string, commentId: string) {
    const document = readStored();
    const existing = commentsForVideo(document, videoId);
    const next = existing.map((comment) => comment.id === commentId
      ? { ...comment, reported: true }
      : comment);
    writeStored({ version: 1, comments: [...document.comments.filter((comment) => comment.videoId !== videoId), ...next] });
    return next.map((comment) => ({ ...comment }));
  },

  removeOwn(videoId: string, commentId: string, viewerId: string) {
    const document = readStored();
    const existing = commentsForVideo(document, videoId);
    const target = existing.find((comment) => comment.id === commentId);
    if (!target || target.authorId !== viewerId) return existing.map((comment) => ({ ...comment }));
    const removedIds = new Set([commentId, ...existing.filter(({ parentId }) => parentId === commentId).map(({ id }) => id)]);
    const next = existing.filter(({ id }) => !removedIds.has(id));
    writeStored({ version: 1, comments: [...document.comments.filter((comment) => comment.videoId !== videoId), ...next] });
    return next.map((comment) => ({ ...comment }));
  },
};
