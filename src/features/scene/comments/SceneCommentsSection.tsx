import { scenePrivateKey } from "../scenePrivateStorage";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Heart, Pin } from "lucide-react";
import { sceneCommentsRepository, type SceneComment } from "./sceneComments";

const DEMO_VIEWER = { authorId: "viewer-max", authorName: "Max", authorAvatarUrl: "/assets/orbit/founder-puff.png" };
export function sortCommentThreads(comments: SceneComment[], sort: "top" | "recent") {
  return comments.filter((item) => !item.parentId).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (sort === "top" ? b.likeCount - a.likeCount : 0) || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
function Comment({ comment, replies, onReply, onChange, onSeek, revealReplies }: { comment: SceneComment; replies: SceneComment[]; onReply: (comment: SceneComment) => void; onChange: () => void; onSeek?: (seconds: number) => void; revealReplies?: boolean }) {
  const [expanded, setExpanded] = useState(false), [replyCount, setReplyCount] = useState(0), [editing, setEditing] = useState(false), [draft, setDraft] = useState(comment.body), [error, setError] = useState("");
  useEffect(() => { if (revealReplies) setReplyCount(replies.length); }, [revealReplies, replies.length]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const body = comment.body.split(/(\b\d{1,2}:\d{2}(?::\d{2})?\b)/g).map((part, index) => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(part) && onSeek ? <button className="scene-comment-timestamp" key={index} onClick={() => onSeek(part.split(":").reduce((value, digits) => value * 60 + Number(digits), 0))}>{part}</button> : part);
  const mutate = (fn: () => unknown) => { try { fn(); setError(""); onChange(); } catch { setError("Modification non enregistrée. Réessaie."); } };
  return <article id={`scene-comment-${comment.id}`} tabIndex={-1} className="scene-inline-comment"><img src={comment.authorAvatarUrl} alt="" loading="lazy" /><div>
    <header><strong>{comment.authorName}</strong>{comment.authorBadge && <span>{comment.authorBadge}</span>}<time dateTime={comment.createdAt}>{new Date(comment.createdAt).toLocaleDateString("fr-FR")}</time>{comment.pinned && <span><Pin /> Épinglé</span>}</header>
    {editing ? <form onSubmit={(e) => { e.preventDefault(); mutate(() => { sceneCommentsRepository.editOwn(comment.videoId, comment.id, DEMO_VIEWER.authorId, draft); setEditing(false); }); }}><textarea aria-label="Modifier le commentaire" maxLength={800} value={draft} onChange={(e) => setDraft(e.target.value)} /><button type="button" onClick={() => setEditing(false)}>Annuler</button><button disabled={!draft.trim()}>Enregistrer</button></form> : <><p className={expanded ? "" : "is-clamped"}>{body}</p>{comment.body.length > 240 && <button onClick={() => setExpanded(!expanded)}>{expanded ? "Réduire" : "Lire la suite"}</button>}</>}
    <div className="scene-comment-actions"><button aria-label={`Aimer le commentaire de ${comment.authorName}`} aria-pressed={comment.likedByViewer} onClick={() => mutate(() => sceneCommentsRepository.toggleLike(comment.videoId, comment.id))}><Heart fill={comment.likedByViewer ? "currentColor" : "none"} /> {comment.likeCount}</button><button onClick={() => onReply(comment)}>Répondre</button>{comment.authorId === DEMO_VIEWER.authorId && <><button onClick={() => setEditing(true)}>Modifier</button><button onClick={() => setConfirmDelete(true)}>Supprimer</button></>}</div>
    {confirmDelete && <div role="group" aria-label="Confirmer la suppression"><span>Supprimer ce commentaire ?</span><button onClick={() => setConfirmDelete(false)}>Conserver</button><button onClick={() => mutate(() => sceneCommentsRepository.removeOwn(comment.videoId, comment.id, DEMO_VIEWER.authorId))}>Confirmer la suppression</button></div>}
    {error && <p role="alert">{error}</p>}
    {replies.length > 0 && <button className="scene-comment-replies-toggle" aria-expanded={replyCount > 0} onClick={() => setReplyCount(replyCount ? 0 : 5)}><ChevronDown />{replyCount ? "Masquer les réponses" : `${replies.length} réponse${replies.length > 1 ? "s" : ""}`}</button>}
    {replies.slice(0, replyCount).map((reply) => <Comment key={reply.id} comment={reply} replies={[]} onReply={() => onReply(comment)} onChange={onChange} onSeek={onSeek} />)}
    {replyCount > 0 && replyCount < replies.length && <button onClick={() => setReplyCount((n) => n + 5)}>Afficher d’autres réponses</button>}
  </div></article>;
}
export default function SceneCommentsSection({ videoId, demo, onSeek, targetCommentId }: { videoId: string; demo: boolean; onSeek?: (seconds: number) => void; targetCommentId?: string | null }) {
  const draftKey = scenePrivateKey(`meewav:scene:comment-draft:${videoId}`);
  const readDraft = () => { try { const stored = sessionStorage.getItem(draftKey); if (!stored) return { body: "", parentId: null }; try { const parsed = JSON.parse(stored); return { body: typeof parsed.body === "string" ? parsed.body : "", parentId: typeof parsed.parentId === "string" ? parsed.parentId : null }; } catch { return { body: stored, parentId: null }; } } catch { return { body: "", parentId: null }; } };
  const restoredDraft = useRef(readDraft());
  const [lastReplyParent, setLastReplyParent] = useState<string | null>(null);
  const [comments, setComments] = useState<SceneComment[]>([]), [loading, setLoading] = useState(true), [sort, setSort] = useState<"top" | "recent">("top");
  const [draft, setDraft] = useState(restoredDraft.current.body), [replyTo, setReplyTo] = useState<SceneComment | null>(null), [pending, setPending] = useState(false), [error, setError] = useState(""), [count, setCount] = useState(12);
  const sentinel = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { try { if (draft) sessionStorage.setItem(draftKey, JSON.stringify({ body: draft, parentId: replyTo?.parentId ?? replyTo?.id ?? restoredDraft.current.parentId })); else sessionStorage.removeItem(draftKey); } catch { /* Draft stays in memory. */ } }, [draft, draftKey, replyTo]);
  const refresh = () => { if (demo) setComments(sceneCommentsRepository.list(videoId)); };
  useEffect(() => { refresh(); setLoading(false); }, [videoId, demo]);
  useEffect(() => {
    if (restoredDraft.current.parentId && comments.length) { setReplyTo(comments.find((comment) => comment.id === restoredDraft.current.parentId) ?? null); restoredDraft.current.parentId = null; }
  }, [comments]);
  const [targetMissing, setTargetMissing] = useState(false);
  useEffect(() => {
    if (!targetCommentId || loading) return;
    const target = comments.find((comment) => comment.id === targetCommentId);
    if (!target) { setTargetMissing(true); return; }
    setTargetMissing(false); setCount(comments.length); if (target.parentId) setLastReplyParent(target.parentId);
    const frame = requestAnimationFrame(() => { const element = document.getElementById(`scene-comment-${targetCommentId}`); element?.scrollIntoView({ block: "center" }); element?.focus({ preventScroll: true }); });
    return () => cancelAnimationFrame(frame);
  }, [targetCommentId, loading, comments]);
  const roots = useMemo(() => sortCommentThreads(comments, sort), [comments, sort]);
  useEffect(() => {
    if (!sentinel.current || !window.IntersectionObserver || !window.matchMedia("(min-width: 1101px)").matches) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setCount((n) => Math.min(n + 12, roots.length)); }, { rootMargin: "250px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [count, roots.length]);
  const submit = async () => {
    if (!draft.trim() || pending || !demo) return;
    setPending(true); setError("");
    try {
      await Promise.resolve();
      sceneCommentsRepository.add({ videoId, body: draft, author: DEMO_VIEWER, parentId: replyTo?.parentId ?? replyTo?.id ?? null });
      refresh(); setLastReplyParent(replyTo?.parentId ?? replyTo?.id ?? null); setDraft(""); setReplyTo(null); setSort("recent"); setCount((n) => Math.max(n, 12));
    } catch (cause) { setError(cause instanceof Error && cause.message === "COMMENT_RATE_LIMITED" ? "Patiente quelques secondes avant de publier à nouveau." : "Ton commentaire n’a pas été enregistré. Ton texte est conservé ; tu peux réessayer."); }
    finally { setPending(false); }
  };
  return <section tabIndex={-1} id="scene-watch-comments" className="scene-inline-comments" aria-label="Commentaires">
    <header><h2>{comments.length ? `${comments.length} commentaires` : "Commentaires"}</h2><label>Trier par <select value={sort} onChange={(e) => { setSort(e.target.value as "top" | "recent"); setCount(12); }}><option value="top">Les meilleurs</option><option value="recent">Les plus récents</option></select></label></header>
    {demo ? <><p className="scene-comments-local">Discussion de démonstration · enregistrée sur cet appareil.</p><form className="scene-comment-composer" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {replyTo && <div>Réponse à {replyTo.authorName} <button type="button" onClick={() => setReplyTo(null)}>Annuler</button></div>}
      <textarea ref={composer} aria-label={replyTo ? "Ta réponse" : "Ajouter un commentaire"} placeholder={replyTo ? "Ta réponse…" : "Ajouter un commentaire…"} maxLength={800} value={draft} onChange={(e) => setDraft(e.target.value)} disabled={pending} />
      <footer><span>{draft.length}/800</span><button type="button" onClick={() => { setDraft(""); setReplyTo(null); }} disabled={pending || !draft}>Annuler</button><button className="is-primary" disabled={pending || !draft.trim()}>{pending ? "Enregistrement…" : error ? "Réessayer" : replyTo ? "Répondre" : "Commenter"}</button></footer>
    </form></> : <p>Les commentaires de cette vidéo ne sont pas encore disponibles.</p>}
    {error && <p role="alert">{error}</p>}
    {targetMissing && <p role="status">Ce commentaire n’est plus disponible ou n’est pas accessible.</p>}
    {loading && <p role="status">Chargement des commentaires…</p>}
    {!loading && demo && roots.length === 0 && <p>Sois la première personne à commenter.</p>}
    {roots.slice(0, count).map((comment) => <Comment key={comment.id} comment={comment} replies={comments.filter((reply) => reply.parentId === comment.id)} onChange={refresh} onSeek={onSeek} revealReplies={lastReplyParent === comment.id} onReply={(item) => { setReplyTo(item); composer.current?.focus(); composer.current?.scrollIntoView({ behavior: "smooth", block: "center" }); }} />)}
    {count < roots.length && <div ref={sentinel}><button onClick={() => setCount((n) => n + 12)}>Afficher plus de commentaires</button></div>}
  </section>;
}
