import {
  Bookmark,
  Clock3,
  EyeOff,
  Flag,
  ListPlus,
  MoreVertical,
  Pause,
  Play,
  Share2,
  UserRound,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { MeewavGradeBadge } from "../grades/MeewavGradeBadge";
import { GRADE_BADGES } from "../grades/gradeBadges";
import FloatingSceneCardMenu from "./FloatingSceneCardMenu";
import type { ShortsVideoItem } from "./shorts-wall-data";

export type VerticalMediaCardActions = {
  onAddToPlaylist: (item: ShortsVideoItem) => void;
  onNotInterested: (item: ShortsVideoItem) => void;
  onReport: (item: ShortsVideoItem) => void;
};

type VerticalMediaCardProps = {
  item: ShortsVideoItem;
  instanceId?: string;
  isSaved: boolean;
  menuOpen: boolean;
  publishedLabel: string;
  progressPercent?: number;
  onSelect: (item: ShortsVideoItem) => void;
  onToggleMenu: (item: ShortsVideoItem) => void;
  onToggleSaved: (item: ShortsVideoItem) => void;
  onShare: (item: ShortsVideoItem) => void;
  onViewProfile: (item: ShortsVideoItem) => void;
  actions: VerticalMediaCardActions;
};

export default function VerticalMediaCard({
  item,
  instanceId,
  isSaved,
  menuOpen,
  publishedLabel,
  progressPercent,
  onSelect,
  onToggleMenu,
  onToggleSaved,
  onShare,
  onViewProfile,
  actions,
}: VerticalMediaCardProps) {
  const previewTimerRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewMuted, setPreviewMuted] = useState(true);
  const menuId = `scene-vertical-card-menu-${instanceId ?? item.id}`;

  const stopPreview = useCallback(() => {
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    previewRef.current?.pause();
    setPreviewReady(false);
    setPreviewPlaying(false);
    setPreviewMuted(true);
  }, []);

  const schedulePreview = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia?.("(hover: none), (pointer: coarse)").matches) return;
    if (document.querySelector<HTMLElement>(".shorts-home")?.dataset.scrollActive === "true") return;
    if (previewTimerRef.current !== null || previewReady) return;
    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      setPreviewReady(true);
      setPreviewPlaying(true);
    }, 720);
  }, [previewReady]);

  useEffect(() => () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewRef.current?.pause();
  }, []);

  useEffect(() => {
    if (!previewReady) return undefined;
    const scrollRoot = document.querySelector<HTMLElement>(".shorts-home");
    if (!scrollRoot) return undefined;
    scrollRoot.addEventListener("scroll", stopPreview, { passive: true });
    return () => scrollRoot.removeEventListener("scroll", stopPreview);
  }, [previewReady, stopPreview]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const options = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    );
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
    if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = options.length - 1;
    if (event.key === "Escape") {
      event.preventDefault();
      onToggleMenu(item);
      window.requestAnimationFrame(() => optionsRef.current?.focus());
      return;
    }
    if (nextIndex !== null && options.length > 0) {
      event.preventDefault();
      options[nextIndex]?.focus();
    }
  };

  const stopCardClick = (event: ReactMouseEvent) => event.stopPropagation();

  return (
    <article className={`scene-vertical-card${menuOpen ? " has-open-menu" : ""}${isSaved ? " is-saved" : ""}`}>
      <div
        className="scene-vertical-card__media"
        onPointerEnter={schedulePreview}
        onPointerLeave={stopPreview}
      >
        <button
          type="button"
          className="scene-vertical-card__media-hit"
          aria-label={`Regarder ${item.title} de ${item.artist}`}
          onClick={() => onSelect(item)}
        >
          {previewReady ? (
            <video
              ref={previewRef}
              src={item.video}
              poster={item.image}
              autoPlay
              loop
              muted={previewMuted}
              playsInline
              preload="metadata"
              aria-hidden="true"
              onPlay={() => setPreviewPlaying(true)}
              onPause={() => setPreviewPlaying(false)}
            />
          ) : (
            <img src={item.image} alt={item.alt} loading="lazy" decoding="async" />
          )}
        </button>

        {item.isAiArtist ? <span className="scene-vertical-card__format">Artiste IA</span> : null}
        <span className="scene-vertical-card__duration">{item.duration}</span>
        {isSaved ? <span className="scene-vertical-card__saved"><Bookmark fill="currentColor" /> Sélection</span> : null}
        {typeof progressPercent === "number" ? (
          <span className="scene-vertical-card__progress" aria-label={`Lecture à ${Math.round(progressPercent)} %`}>
            <i style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
          </span>
        ) : null}

        <div className="scene-vertical-card__title">
          <h3>{item.title}</h3>
        </div>

        {previewReady ? (
          <div className="scene-vertical-card__preview-actions" onClick={stopCardClick}>
            <button
              type="button"
              aria-label={previewPlaying ? "Mettre l’aperçu en pause" : "Reprendre l’aperçu"}
              onClick={() => {
                const preview = previewRef.current;
                if (!preview) return;
                if (preview.paused) void preview.play();
                else preview.pause();
              }}
            >
              {previewPlaying ? <Pause /> : <Play fill="currentColor" />}
            </button>
            <button
              type="button"
              aria-label={previewMuted ? "Activer le son de l’aperçu" : "Couper le son de l’aperçu"}
              onClick={() => setPreviewMuted((current) => !current)}
            >
              {previewMuted ? <VolumeX /> : <Volume2 />}
            </button>
            <button
              type="button"
              className={isSaved ? "is-saved" : undefined}
              aria-label={isSaved ? "Retirer de ma sélection" : "Ajouter à ma sélection"}
              onClick={() => onToggleSaved(item)}
            >
              <Bookmark fill={isSaved ? "currentColor" : "none"} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="scene-vertical-card__meta">
        <div>
          <p>
            <button type="button" onClick={() => onViewProfile(item)}>{item.artist}</button>
            <MeewavGradeBadge
              level={item.gradeLevel}
              size="xs"
              variant="icon"
              labelMode="none"
              className="scene-vertical-card__grade"
              title={`Niveau ${item.gradeLevel} — ${GRADE_BADGES[item.gradeLevel].label}`}
            />
          </p>
          <span>{item.views} · {publishedLabel}</span>
        </div>
        <button
          ref={optionsRef}
          type="button"
          className="scene-vertical-card__options"
          aria-label={`Plus d’options pour ${item.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={menuId}
          onClick={() => onToggleMenu(item)}
        >
          <MoreVertical />
        </button>
      </div>

      <FloatingSceneCardMenu
        anchorRef={optionsRef}
        id={menuId}
        open={menuOpen}
        ariaLabel={`Options pour ${item.title}`}
        className="scene-vertical-card__menu"
        onKeyDown={handleMenuKeyDown}
        onRequestClose={() => onToggleMenu(item)}
        preferredMaxHeight={330}
        preferredWidth={250}
      >
        <button type="button" role="menuitem" onClick={() => onToggleSaved(item)}>
          <Clock3 /> {isSaved ? "Retirer des vidéos à regarder" : "À regarder plus tard"}
        </button>
        <button type="button" role="menuitem" onClick={() => actions.onAddToPlaylist(item)}>
          <ListPlus /> Ajouter à une sélection
        </button>
        <button type="button" role="menuitem" onClick={() => onShare(item)}>
          <Share2 /> Partager
        </button>
        <button type="button" role="menuitem" onClick={() => onViewProfile(item)}>
          <UserRound /> Voir le profil
        </button>
        <button type="button" role="menuitem" onClick={() => actions.onNotInterested(item)}>
          <EyeOff /> Pas intéressé
        </button>
        <button type="button" role="menuitem" onClick={() => actions.onReport(item)}>
          <Flag /> Signaler
        </button>
      </FloatingSceneCardMenu>
    </article>
  );
}
