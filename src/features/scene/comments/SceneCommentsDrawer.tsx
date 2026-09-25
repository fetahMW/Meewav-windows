import { Flag, Heart, MessageSquareReply, Pin, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  appendMeeWavEmoticon,
  MeeWavEmoticonComposer,
  MeeWavEmoticonPicker,
  MeeWavRichText,
} from "../../emoticons/MeewavEmoticons";
import { useShortsDialog } from "../../shorts/useShortsDialog";
import { sceneCommentsRepository, type SceneComment } from "./sceneComments";
import "./scene-comments.css";

const VIEWER = {
  authorId: "viewer-max",
  authorName: "Max",
  authorAvatarUrl: "/assets/orbit/founder-puff.png",
};

type SceneCommentsDrawerProps = {
  videoId: string;
  videoTitle: string;
  onClose: () => void;
  onNotify: (message: string) => void;
};

function commentDate(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Date inconnue";
  const ageMinutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (ageMinutes < 1) return "À l’instant";
  if (ageMinutes < 60) return `Il y a ${ageMinutes} min`;
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) return `Il y a ${ageHours} h`;
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(timestamp));
}

function CommentCard({
  comment,
  replies,
  onLike,
  onReply,
  onReport,
  onDelete,
}: {
  comment: SceneComment;
  replies: readonly SceneComment[];
  onLike: (id: string) => void;
  onReply: (comment: SceneComment) => void;
  onReport: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <article className="scene-comment" data-reported={comment.reported || undefined}>
      <img src={comment.authorAvatarUrl} alt="" width="38" height="38" loading="lazy" />
      <div>
        <header>
          <strong>{comment.authorName}</strong>
          {comment.authorBadge ? <span>{comment.authorBadge}</span> : null}
          <time dateTime={comment.createdAt}>{commentDate(comment.createdAt)}</time>
          {comment.pinned ? <em><Pin aria-hidden="true" /> Épinglé</em> : null}
        </header>
        <p>{comment.reported ? "Commentaire signalé — examen en attente." : <MeeWavRichText emoticonSize={32}>{comment.body}</MeeWavRichText>}</p>
        <footer>
          <button type="button" aria-pressed={comment.likedByViewer} onClick={() => onLike(comment.id)}>
            <Heart fill={comment.likedByViewer ? "currentColor" : "none"} aria-hidden="true" /> {comment.likeCount}
          </button>
          {!comment.reported ? <button type="button" onClick={() => onReply(comment)}><MessageSquareReply aria-hidden="true" /> Répondre</button> : null}
          {comment.authorId === VIEWER.authorId
            ? <button type="button" onClick={() => onDelete(comment.id)}><Trash2 aria-hidden="true" /> Supprimer</button>
            : <button type="button" onClick={() => onReport(comment.id)}><Flag aria-hidden="true" /> Signaler</button>}
        </footer>
        {replies.length > 0 ? (
          <div className="scene-comment__replies">
            {replies.map((reply) => (
              <div key={reply.id}>
                <img src={reply.authorAvatarUrl} alt="" width="28" height="28" loading="lazy" />
                <p><strong>{reply.authorName}</strong>{reply.authorBadge ? <span>{reply.authorBadge}</span> : null}<MeeWavRichText emoticonSize={28}>{reply.body}</MeeWavRichText></p>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function SceneCommentsDrawer({ videoId, videoTitle, onClose, onNotify }: SceneCommentsDrawerProps) {
  const dialogRef = useShortsDialog<HTMLDivElement>(true, onClose);
  const [comments, setComments] = useState(() => sceneCommentsRepository.list(videoId));
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<SceneComment | null>(null);
  const rootComments = useMemo(() => comments.filter(({ parentId }) => parentId === null), [comments]);

  const submit = () => {
    try {
      sceneCommentsRepository.add({
        videoId,
        body,
        author: VIEWER,
        parentId: replyTo?.id ?? null,
      });
      setComments(sceneCommentsRepository.list(videoId));
      setBody("");
      setReplyTo(null);
      onNotify(replyTo ? "Réponse publiée." : "Commentaire publié.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "COMMENT_RATE_LIMITED") onNotify("Patiente quelques secondes avant de publier à nouveau.");
      else if (message === "COMMENT_TOO_LONG") onNotify("Le commentaire dépasse 800 caractères.");
      else onNotify("Écris un commentaire avant de publier.");
    }
  };

  return (
    <div className="scene-comments-layer" role="presentation">
      <button type="button" className="scene-comments-layer__backdrop" aria-label="Fermer les commentaires" onClick={onClose} />
      <section
        ref={dialogRef}
        className="scene-comments"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scene-comments-title"
        tabIndex={-1}
      >
        <header>
          <div><span>DISCUSSION</span><h2 id="scene-comments-title">Commentaires</h2><p>{videoTitle}</p></div>
          <button type="button" aria-label="Fermer les commentaires" onClick={onClose}><X /></button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); submit(); }}>
          {replyTo ? <div>Réponse à <strong>{replyTo.authorName}</strong><button type="button" onClick={() => setReplyTo(null)}>Annuler</button></div> : null}
          <label>
            <span className="sr-only">Écrire un commentaire</span>
            <MeeWavEmoticonComposer value={body} onChange={setBody} maxLength={800} multiline placeholder="Ajoute un commentaire respectueux…" ariaLabel="Écrire un commentaire" />
          </label>
          <footer>
            <small>{body.length}/800</small>
            <div>
              <MeeWavEmoticonPicker onSelect={(emoticon) => setBody((value) => appendMeeWavEmoticon(value, emoticon.name, 800))} />
              <button type="submit" disabled={!body.trim()}><Send aria-hidden="true" /> Publier</button>
            </div>
          </footer>
        </form>
        <div className="scene-comments__list" aria-live="polite">
          {rootComments.map((comment) => (
            <CommentCard
              key={comment.id}
              comment={comment}
              replies={comments.filter(({ parentId }) => parentId === comment.id)}
              onLike={(id) => setComments(sceneCommentsRepository.toggleLike(videoId, id))}
              onReply={setReplyTo}
              onReport={(id) => {
                setComments(sceneCommentsRepository.report(videoId, id));
                onNotify("Commentaire signalé à la modération.");
              }}
              onDelete={(id) => {
                setComments(sceneCommentsRepository.removeOwn(videoId, id, VIEWER.authorId));
                onNotify("Commentaire supprimé.");
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
