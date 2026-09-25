import { getDesktopApplicationMode } from "../../../runtime/applicationMode";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Gift,
  Grid2X2,
  Handshake,
  Headphones,
  Heart,
  ListMusic,
  LoaderCircle,
  Maximize2,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Radio,
  Search,
  Share2,
  ShoppingBag,
  Sparkles,
  Trophy,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth";
import { isProfileLocalPreviewEnabled } from "../profile.preview";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { getGradeBadgeMeta, type GradeLevel } from "../../grades/gradeBadges";
import {
  earnedBadges,
  mediaItems as initialMediaItems,
  type MediaItem,
  type MediaKind,
  type MediaSectionId,
} from "../profile.data";
import {
  filterOwnerMedia,
  profileMediaRepository,
  type MediaLibraryFilter,
  type OwnerMediaItem,
} from "../profile.media.service";
import ProfileStudioWorkspace, { type StudioMode } from "./ProfileStudioWorkspace";
import ProfileCertifEndorsementsPanel from "../gifts/ProfileCertifEndorsementsPanel";

type ProfileMediaViewProps = {
  section: MediaSectionId;
  onSectionChange: (section: MediaSectionId) => void;
  onOpenMedia: (item: MediaItem) => void;
  gradeLevel: GradeLevel;
  gradeProgress: number;
  pointsToNextGrade: number;
  onToast: (message: string) => void;
};

type MediaWorkspaceId = Exclude<MediaSectionId, "studio"> | StudioMode;

const mediaWorkspaces: Array<{ id: MediaWorkspaceId; label: string; detail: string; accent: string; icon: typeof Archive }> = [
  { id: "library", label: "Médiathèque", detail: "Tous tes contenus", accent: "#8b5cff", icon: Archive },
  { id: "cage", label: "La Cage", detail: "Sessions et formats live", accent: "#ff465d", icon: Radio },
  { id: "setlist", label: "Setlist", detail: "Passages et mixeur", accent: "#d946ef", icon: ListMusic },
  { id: "gifts", label: "Cadeaux", detail: "Fans et communauté", accent: "#19b8ff", icon: Gift },
  { id: "badges", label: "Badges", detail: "Grade et reconnaissances", accent: "#f4b942", icon: BadgeCheck },
];

const kindFilters: Array<{ id: MediaLibraryFilter; label: string }> = [
  { id: "all", label: "Tout" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Vidéo" },
  { id: "image", label: "Images" },
  { id: "document", label: "Documents" },
  { id: "meewav", label: "Produit sur Meewav" },
];

const kindIcons = { audio: FileAudio, video: Film, image: FileImage, document: FileText };
const kindLabels: Record<MediaKind, string> = { audio: "Audio", video: "Vidéo", image: "Image", document: "Document" };

type RecognitionStatus = "earned" | "progress" | "locked";

type Recognition = {
  id: string;
  label: string;
  detail: string;
  accent: string;
  category: string;
  icon: LucideIcon;
  status: RecognitionStatus;
  earnedAt?: string;
  progress?: { current: number; target: number };
  nextAction?: string;
};

const recognitionMeta: Record<string, Pick<Recognition, "category" | "icon" | "earnedAt" | "progress" | "nextAction">> = {
  "badge-regular": { category: "Habitude", icon: CalendarClock, earnedAt: "12 avr. 2024" },
  "badge-golden": { category: "Impact", icon: Heart, earnedAt: "03 mai 2024" },
  "badge-live": { category: "Live", icon: Radio, earnedAt: "21 mai 2024" },
  "badge-collab": { category: "Collab", icon: Handshake, progress: { current: 18, target: 25 }, nextAction: "7 collaborations uniques" },
};

const recognitionCatalog: Recognition[] = [
  ...earnedBadges.map((badge) => ({
    ...badge,
    ...recognitionMeta[badge.id],
    status: (badge.earned ? "earned" : "progress") as RecognitionStatus,
  })),
  {
    id: "badge-tremplin",
    label: "Talent repéré",
    detail: "Être sélectionné dans un Tremplin",
    accent: "#9b5cff",
    category: "Reconnaissance",
    icon: Sparkles,
    status: "locked",
    nextAction: "Participer à un Tremplin",
  },
  {
    id: "badge-marketplace",
    label: "Marchand validé",
    detail: "Réaliser 5 ventes sur le Marketplace",
    accent: "#34d399",
    category: "Business",
    icon: ShoppingBag,
    status: "locked",
    progress: { current: 2, target: 5 },
    nextAction: "3 ventes restantes",
  },
];

const durationInSeconds = (duration?: string) => {
  if (!duration) return 0;
  const [minutes, seconds] = duration.split(":").map(Number);
  return (minutes || 0) * 60 + (seconds || 0);
};

const formatPlaybackTime = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.round(seconds));
  return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

type LibraryDialogState =
  | { type: "rename-item"; itemId: string }
  | { type: "delete-items"; itemIds: string[] }
  | null;

export default function ProfileMediaView({
  section,
  onSectionChange,
  onOpenMedia,
  gradeLevel,
  gradeProgress,
  pointsToNextGrade,
  onToast,
}: ProfileMediaViewProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, status: authStatus } = useAuth();
  const localAuthPreviewEnabled = isProfileLocalPreviewEnabled();
  const demoFallbackEnabled = getDesktopApplicationMode() !== "live" && (localAuthPreviewEnabled
    || (import.meta.env.DEV && import.meta.env.VITE_PROFILE_DEMO_FALLBACK === "true"));
  const [items, setItems] = useState<OwnerMediaItem[]>([]);
  const [kind, setKind] = useState<MediaLibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [activeItemMenuId, setActiveItemMenuId] = useState<string | null>(null);
  const [libraryDialog, setLibraryDialog] = useState<LibraryDialogState>(null);
  const [libraryDraftName, setLibraryDraftName] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const [playbackProgress, setPlaybackProgress] = useState<Record<string, number>>({});
  const [playbackDuration, setPlaybackDuration] = useState<Record<string, number>>({});
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<"loading" | "ready" | "error" | "fallback">("loading");
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryReloadKey, setLibraryReloadKey] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const [pendingItemIds, setPendingItemIds] = useState<string[]>([]);
  const [recognitionFilter, setRecognitionFilter] = useState<"all" | "earned" | "progress">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaElementRefs = useRef<Record<string, HTMLMediaElement | null>>({});
  const mediaScrollRef = useRef<HTMLDivElement>(null);
  const mediaDragRef = useRef({ pointerId: -1, startY: 0, scrollTop: 0, moved: false, suppressClick: false });
  const studioRouteMatch = location.pathname.match(/\/(?:profile|profil)\/(?:creations|créations)\/studio\/(cage|setlist|gifts)(?:\/|$)/);
  const activeStudioMode = studioRouteMatch?.[1] as StudioMode | undefined;
  const routedMediaSection = location.pathname.match(/\/(?:profile|profil)\/(?:creations|créations)\/(library|badges)(?:\/|$)/)?.[1] as Exclude<MediaSectionId, "studio"> | undefined;
  const routedMediaId = new URLSearchParams(location.search).get("media");
  const activeMediaSection: MediaSectionId = activeStudioMode ? "studio" : routedMediaSection ?? (section === "studio" ? "library" : section);
  const activeWorkspaceId: MediaWorkspaceId = activeStudioMode ?? (activeMediaSection === "studio" ? "library" : activeMediaSection);
  const gradeMeta = getGradeBadgeMeta(gradeLevel);
  const nextGradeLevel = Math.min(6, gradeLevel + 1) as GradeLevel;
  const nextGradeMeta = getGradeBadgeMeta(nextGradeLevel);
  const earnedBadgeCount = recognitionCatalog.filter((badge) => badge.status === "earned").length;
  const recognitionProgressCount = recognitionCatalog.filter((badge) => badge.status === "progress").length;
  const visibleRecognitions = recognitionCatalog.filter((badge) => recognitionFilter === "all" || badge.status === recognitionFilter);
  const mediaWorkspaceMetrics: Record<MediaWorkspaceId, string> = {
    library: String(items.length),
    cage: "4",
    setlist: "3",
    gifts: "12",
    badges: String(earnedBadgeCount),
  };

  const visibleItems = useMemo(() => filterOwnerMedia(items, kind, query), [items, kind, query]);

  useEffect(() => {
    if (!routedMediaId || !items.some(({ id }) => id === routedMediaId)) return;
    setOpenPlayerId(routedMediaId);
    window.requestAnimationFrame(() => document.getElementById(`profile-media-${routedMediaId}`)?.scrollIntoView({ block: "center" }));
  }, [items, routedMediaId]);

  useEffect(() => {
    if (authStatus === "loading") {
      setLibraryStatus("loading");
      return undefined;
    }
    if (!user) {
      if (localAuthPreviewEnabled) {
        setItems(initialMediaItems.map((item) => ({ ...item, isPublic: item.status === "Publié" })));
        setSelected([]);
        setLibraryError(null);
        setLibraryStatus("fallback");
        return undefined;
      }
      setItems([]);
      setLibraryError("Reconnecte-toi pour accéder à ta médiathèque.");
      setLibraryStatus("error");
      return undefined;
    }

    let active = true;
    setLibraryStatus("loading");
    setLibraryError(null);
    void profileMediaRepository.listOwnerMedia(user.id).then((ownerItems) => {
      if (!active) return;
      setItems(ownerItems);
      setSelected([]);
      setLibraryStatus("ready");
    }).catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "Impossible de charger la médiathèque pour le moment.";
      setLibraryError(message);
      if (demoFallbackEnabled) {
        setItems(initialMediaItems.map((item) => ({ ...item, isPublic: item.status === "Publié" })));
        setLibraryStatus("fallback");
      } else {
        setItems([]);
        setLibraryStatus("error");
      }
    });

    return () => { active = false; };
  }, [authStatus, demoFallbackEnabled, libraryReloadKey, localAuthPreviewEnabled, user]);

  useEffect(() => () => {
    Object.values(mediaElementRefs.current).forEach((element) => element?.pause());
  }, []);

  const toggleSelection = (itemId: string) => {
    setSelected((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  };

  const startSelectionMode = () => {
    setSelectionMode(true);
    setActiveItemMenuId(null);
    setPlayingId(null);
    setOpenPlayerId(null);
    Object.values(mediaElementRefs.current).forEach((element) => element?.pause());
  };

  const cancelSelectionMode = () => {
    setSelectionMode(false);
    setSelected([]);
  };

  const selectAllVisible = () => {
    const visibleIds = visibleItems.map((item) => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
    setSelected((current) => allVisibleSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : Array.from(new Set([...current, ...visibleIds])));
  };

  const togglePlayback = (itemId: string) => {
    setOpenPlayerId(itemId);
    const element = mediaElementRefs.current[itemId];
    if (!element) {
      onToast("Aperçu indisponible pour ce contenu");
      return;
    }

    Object.entries(mediaElementRefs.current).forEach(([id, candidate]) => {
      if (id !== itemId) candidate?.pause();
    });

    if (element.paused) {
      void element.play().catch(() => onToast("Lecture impossible dans ce navigateur"));
    } else {
      element.pause();
    }
  };

  const seekPlayback = (itemId: string, progress: number) => {
    const safeProgress = Math.max(0, Math.min(100, progress));
    setPlaybackProgress((current) => ({ ...current, [itemId]: safeProgress }));
    const element = mediaElementRefs.current[itemId];
    if (element?.duration) {
      element.currentTime = element.duration * safeProgress / 100;
    }
  };

  const toggleMute = (itemId: string) => {
    const element = mediaElementRefs.current[itemId];
    if (!element) return;
    element.muted = !element.muted;
    setMutedIds((current) => element.muted ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId));
  };

  const openFullscreen = (itemId: string) => {
    const element = mediaElementRefs.current[itemId];
    if (!element?.requestFullscreen) return;
    void element.requestFullscreen();
  };

  const handleImport = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    if (!user) {
      onToast("Reconnecte-toi pour importer un contenu");
      return;
    }

    setIsImporting(true);
    const results = await Promise.allSettled(files.map((file) => profileMediaRepository.uploadOwnerMedia(user.id, file)));
    const uploadedItems = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const failures = results.filter((result) => result.status === "rejected");
    if (uploadedItems.length) {
      setItems((current) => [...uploadedItems, ...current]);
      setKind("all");
      setLibraryStatus("ready");
      onToast(uploadedItems.length === 1
        ? `${uploadedItems[0].title} ajouté à la médiathèque`
        : `${uploadedItems.length} fichiers ajoutés à la médiathèque`);
    }
    if (failures.length) {
      const firstReason = failures[0].status === "rejected" ? failures[0].reason : null;
      onToast(firstReason instanceof Error ? firstReason.message : `${failures.length} import${failures.length > 1 ? "s ont" : " a"} échoué`);
    }
    setIsImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const openRenameItemDialog = (item: OwnerMediaItem) => {
    setLibraryDraftName(item.title);
    setLibraryDialog({ type: "rename-item", itemId: item.id });
    setActiveItemMenuId(null);
  };

  const closeLibraryDialog = () => {
    setLibraryDialog(null);
    setLibraryDraftName("");
  };

  const submitLibraryName = async () => {
    const name = libraryDraftName.trim();
    if (!name || !libraryDialog) return;

    if (libraryDialog.type === "rename-item") {
      if (!user) return;
      const itemId = libraryDialog.itemId;
      setPendingItemIds((current) => [...new Set([...current, itemId])]);
      try {
        const updatedItem = await profileMediaRepository.renameOwnerMedia(user.id, itemId, name);
        setItems((current) => current.map((item) => item.id === itemId ? updatedItem : item));
        onToast("Contenu renommé");
      } catch (error) {
        onToast(error instanceof Error ? error.message : "Le contenu n’a pas pu être renommé");
        return;
      } finally {
        setPendingItemIds((current) => current.filter((id) => id !== itemId));
      }
    }

    closeLibraryDialog();
  };

  const deleteItems = async (itemIds: string[]) => {
    setPendingItemIds((current) => [...new Set([...current, ...itemIds])]);
    const results = await Promise.allSettled(itemIds.map((itemId) => profileMediaRepository.archiveOwnerMedia(itemId)));
    const archivedIds = itemIds.filter((_, index) => results[index].status === "fulfilled");
    archivedIds.forEach((itemId) => mediaElementRefs.current[itemId]?.pause());
    if (archivedIds.length) {
      setItems((current) => current.filter((item) => !archivedIds.includes(item.id)));
      setPlayingId((current) => current && archivedIds.includes(current) ? null : current);
      setOpenPlayerId((current) => current && archivedIds.includes(current) ? null : current);
      onToast(`${archivedIds.length} contenu${archivedIds.length > 1 ? "s archivés" : " archivé"}`);
    }
    if (archivedIds.length !== itemIds.length) onToast("Certains contenus n’ont pas pu être archivés");
    setPendingItemIds((current) => current.filter((id) => !itemIds.includes(id)));
    cancelSelectionMode();
    closeLibraryDialog();
  };

  const toggleItemVisibility = async (itemId: string) => {
    const target = items.find((item) => item.id === itemId);
    if (!target || !user) return;
    setPendingItemIds((current) => [...new Set([...current, itemId])]);
    try {
      const updatedItem = await profileMediaRepository.setOwnerMediaVisibility(user.id, itemId, !target.isPublic);
      setItems((current) => current.map((item) => item.id === itemId ? updatedItem : item));
      onToast(target.isPublic ? "Contenu rendu privé" : "Contenu rendu public");
    } catch (error) {
      onToast(error instanceof Error ? error.message : "La visibilité n’a pas pu être modifiée");
    } finally {
      setPendingItemIds((current) => current.filter((id) => id !== itemId));
    }
    setActiveItemMenuId(null);
  };

  const shareSelection = async () => {
    const links = selected.map((id) => `${window.location.origin}/profile/creations/library?media=${encodeURIComponent(id)}`).join("\n");
    try {
      await navigator.clipboard.writeText(links);
      onToast(`${selected.length} lien${selected.length > 1 ? "s copiés" : " copié"}`);
    } catch {
      onToast("Impossible de copier la sélection automatiquement");
    }
  };

  const openStudioWorkspace = (mode: StudioMode) => {
    onSectionChange("studio");
    navigate(`/profile/creations/studio/${mode}`);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const closeStudioWorkspace = () => {
    onSectionChange("library");
    navigate("/profile/creations/library");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const changeWorkspace = (nextWorkspace: MediaWorkspaceId) => {
    if (nextWorkspace === "cage" || nextWorkspace === "setlist" || nextWorkspace === "gifts") {
      openStudioWorkspace(nextWorkspace);
      return;
    }

    navigate(`/profile/creations/${nextWorkspace}`);
    onSectionChange(nextWorkspace);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const startMediaDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label, video, audio, [role='button'], [contenteditable='true']")) return;

    const surface = mediaScrollRef.current;
    if (!surface) return;
    const bounds = surface.getBoundingClientRect();
    if (event.clientX >= bounds.right - 18) return;

    mediaDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      scrollTop: surface.scrollTop,
      moved: false,
      suppressClick: false,
    };
    surface.setPointerCapture(event.pointerId);
  };

  const moveMediaDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = mediaScrollRef.current;
    const drag = mediaDragRef.current;
    if (!surface || drag.pointerId !== event.pointerId) return;

    const deltaY = event.clientY - drag.startY;
    if (!drag.moved && Math.abs(deltaY) < 5) return;
    drag.moved = true;
    drag.suppressClick = true;
    surface.classList.add("is-grab-scrolling");
    surface.scrollTop = drag.scrollTop - deltaY;
    event.preventDefault();
  };

  const stopMediaDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const surface = mediaScrollRef.current;
    const drag = mediaDragRef.current;
    if (!surface || drag.pointerId !== event.pointerId) return;

    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    surface.classList.remove("is-grab-scrolling");
    drag.pointerId = -1;
    if (drag.suppressClick) window.setTimeout(() => { mediaDragRef.current.suppressClick = false; }, 0);
  };

  const suppressDraggedClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaDragRef.current.suppressClick) return;
    event.preventDefault();
    event.stopPropagation();
    mediaDragRef.current.suppressClick = false;
  };

  return (
    <div className={`profile-view profile-media-view is-${activeMediaSection}`} aria-label="Média du profil">
      <header className="profile-private-shell-header profile-media-shell-header">
        <h2>Créations du profil</h2>
        <div className="profile-private-shell-header__row">
          <nav aria-label="Outils média">
            {mediaWorkspaces.map((item) => {
              const WorkspaceIcon = item.icon;
              const isActive = activeWorkspaceId === item.id;
              return (
                <button
                  key={item.id}
                  id={`profile-media-tab-${item.id}`}
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  className={isActive ? "is-active" : ""}
                  style={{ "--private-tab-accent": item.accent } as React.CSSProperties}
                  onClick={() => changeWorkspace(item.id)}
                >
                  <WorkspaceIcon size={15} />
                  <strong>{item.label}</strong>
                  <span>{mediaWorkspaceMetrics[item.id]}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>
      <input
        ref={fileInputRef}
        className="profile-visually-hidden"
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/flac,video/mp4,video/quicktime,video/webm,image/jpeg,image/png,image/webp,image/avif,application/pdf"
        multiple
        disabled={isImporting}
        onChange={(event) => { void handleImport(event.target.files); }}
      />

      <div
        ref={mediaScrollRef}
        className="profile-media-content-stage profile-media-full-workspace"
        key={activeStudioMode ?? activeMediaSection}
        onPointerDown={startMediaDrag}
        onPointerMove={moveMediaDrag}
        onPointerUp={stopMediaDrag}
        onPointerCancel={stopMediaDrag}
        onClickCapture={suppressDraggedClick}
      >
      {activeMediaSection === "library" && (
        <div id="profile-media-panel-library" className="profile-media-library" role="tabpanel" aria-labelledby="profile-media-tab-library">
          <div className="profile-library-toolbar">
            <div className="profile-library-filters" aria-label="Filtrer les médias">
              {kindFilters.map((filter) => (
                <button key={filter.id} type="button" className={kind === filter.id ? "is-active" : ""} aria-pressed={kind === filter.id} onClick={() => setKind(filter.id)}>
                  {filter.id === "meewav" && <Sparkles size={13} />}
                  {filter.label}
                  <span>{filter.id === "all" ? items.length : filter.id === "meewav" ? items.filter((item) => item.producedOnMeewav).length : items.filter((item) => item.kind === filter.id).length}</span>
                </button>
              ))}
            </div>
            <div className="profile-library-actions">
              <label className="profile-library-search">
                <Search size={18} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans tes contenus" />
              </label>
              <div className="profile-library-primary-actions">
                <button type="button" disabled={isImporting || libraryStatus === "loading"} onClick={() => fileInputRef.current?.click()}>
                  {isImporting ? <LoaderCircle size={16} /> : <Upload size={16} />} {isImporting ? "Importation…" : "Importer"}
                </button>
                <button type="button" disabled={libraryStatus !== "ready" && libraryStatus !== "fallback"} className={selectionMode ? "is-active" : ""} onClick={() => selectionMode ? cancelSelectionMode() : startSelectionMode()}><Check size={16} /> {selectionMode ? "Annuler" : "Sélectionner"}</button>
              </div>
            </div>
          </div>

          {libraryStatus === "loading" && (
            <div className="profile-empty-state" role="status"><LoaderCircle size={32} /><h3>Synchronisation de la médiathèque</h3><p>Tes contenus sécurisés arrivent…</p></div>
          )}

          {libraryStatus === "error" && (
            <div className="profile-empty-state" role="alert"><AlertTriangle size={32} /><h3>Médiathèque indisponible</h3><p>{libraryError}</p><button type="button" onClick={() => setLibraryReloadKey((value) => value + 1)}>Réessayer</button></div>
          )}

          {selectionMode && (
            <div className="profile-selection-bar" role="status">
              <span><Check size={15} /> {selected.length} sélectionné{selected.length > 1 ? "s" : ""}</span>
              <div>
                <button type="button" onClick={selectAllVisible}>{visibleItems.length > 0 && visibleItems.every((item) => selected.includes(item.id)) ? "Tout désélectionner" : "Tout sélectionner"}</button>
                <button type="button" disabled={selected.length === 0} onClick={() => void shareSelection()}><Share2 size={15} /> Partager</button>
                <button type="button" disabled={selected.length === 0} onClick={() => setLibraryDialog({ type: "delete-items", itemIds: selected })}><Trash2 size={15} /> Archiver</button>
                <button type="button" onClick={cancelSelectionMode}>Annuler</button>
              </div>
            </div>
          )}

          {(libraryStatus === "ready" || libraryStatus === "fallback") && <div className="profile-media-grid">
            {visibleItems.map((item) => {
              const KindIcon = kindIcons[item.kind];
              const isSelected = selected.includes(item.id);
              const isPlaying = playingId === item.id;
              const isPlayable = item.kind === "audio" || item.kind === "video";
              const isPlayerOpen = openPlayerId === item.id;
              const isMuted = mutedIds.includes(item.id);
              const progress = playbackProgress[item.id] ?? 0;
              const totalSeconds = playbackDuration[item.id] ?? durationInSeconds(item.duration);
              return (
                <article id={`profile-media-${item.id}`} key={item.id} aria-busy={pendingItemIds.includes(item.id)} className={`profile-media-card ${isSelected ? "is-selected" : ""} ${isPlayerOpen ? "is-player-open" : ""} ${selectionMode ? "is-selection-mode" : ""} ${activeItemMenuId === item.id ? "is-menu-open" : ""}`} style={{ "--media-accent": item.accent } as React.CSSProperties}>
                  {selectionMode && <button type="button" className="profile-media-card__select" onClick={() => toggleSelection(item.id)} aria-label={`${isSelected ? "Désélectionner" : "Sélectionner"} ${item.title}`}>
                    {isSelected ? <Check size={13} /> : null}
                  </button>}
                  {!selectionMode && <button type="button" className="profile-media-card__menu" onClick={() => setActiveItemMenuId((current) => current === item.id ? null : item.id)} aria-label={`Options pour ${item.title}`}><MoreHorizontal size={17} /></button>}
                  {activeItemMenuId === item.id && (
                    <div className="profile-library-context-menu is-media" role="menu">
                      <button type="button" role="menuitem" onClick={() => openRenameItemDialog(item)}><Pencil size={15} /> Renommer</button>
                      <button type="button" role="menuitem" disabled={pendingItemIds.includes(item.id)} onClick={() => { void toggleItemVisibility(item.id); }}>{item.isPublic ? <EyeOff size={15} /> : <Eye size={15} />}{item.isPublic ? "Rendre privé" : "Rendre public"}</button>
                      <button type="button" role="menuitem" className="is-danger" onClick={() => { setLibraryDialog({ type: "delete-items", itemIds: [item.id] }); setActiveItemMenuId(null); }}><Trash2 size={15} /> Archiver</button>
                    </div>
                  )}
                  <div className={`profile-media-card__visual ${isPlaying ? "is-playing" : ""}`}>
                    {item.kind === "video" && item.sourceUrl ? (
                      <video
                        ref={(element) => { mediaElementRefs.current[item.id] = element; }}
                        src={item.sourceUrl}
                        poster={item.cover}
                        preload="metadata"
                        playsInline
                        onLoadedMetadata={(event) => {
                          const mediaDuration = event.currentTarget.duration || durationInSeconds(item.duration);
                          setPlaybackDuration((current) => ({ ...current, [item.id]: mediaDuration }));
                        }}
                        onTimeUpdate={(event) => {
                          const element = event.currentTarget;
                          if (element.duration) setPlaybackProgress((current) => ({ ...current, [item.id]: element.currentTime / element.duration * 100 }));
                        }}
                        onPlay={() => { setPlayingId(item.id); setOpenPlayerId(item.id); }}
                        onPause={() => setPlayingId((current) => current === item.id ? null : current)}
                        onEnded={() => { setPlaybackProgress((current) => ({ ...current, [item.id]: 100 })); setPlayingId(null); }}
                      />
                    ) : item.cover ? (
                      <img src={item.cover} alt="" />
                    ) : item.kind === "document" && item.previewLines ? (
                      <span className="profile-media-card__document-preview">
                        <i><FileText size={18} /> Note de production</i>
                        <strong>{item.previewLines[0]}</strong>
                        {item.previewLines.slice(1).map((line) => <small key={line}>{line}</small>)}
                      </span>
                    ) : (
                      <span className={`profile-media-card__abstract ${item.kind === "audio" ? "is-audio" : ""}`}>
                        {!isPlayable && <KindIcon size={28} />}
                        {item.kind === "audio" && <span className="profile-media-card__ambient-bars" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <i key={index} style={{ height: `${24 + (index * 19) % 64}%` }} />)}</span>}
                      </span>
                    )}
                    {item.kind === "audio" && item.sourceUrl && (
                      <audio
                        ref={(element) => { mediaElementRefs.current[item.id] = element; }}
                        src={item.sourceUrl}
                        preload="metadata"
                        onLoadedMetadata={(event) => {
                          const mediaDuration = event.currentTarget.duration || durationInSeconds(item.duration);
                          setPlaybackDuration((current) => ({ ...current, [item.id]: mediaDuration }));
                        }}
                        onTimeUpdate={(event) => {
                          const element = event.currentTarget;
                          if (element.duration) setPlaybackProgress((current) => ({ ...current, [item.id]: element.currentTime / element.duration * 100 }));
                        }}
                        onPlay={() => { setPlayingId(item.id); setOpenPlayerId(item.id); }}
                        onPause={() => setPlayingId((current) => current === item.id ? null : current)}
                        onEnded={() => { setPlaybackProgress((current) => ({ ...current, [item.id]: 100 })); setPlayingId(null); }}
                      />
                    )}
                    {isPlayable ? (
                      <button type="button" className={`profile-media-card__visual-play ${isPlaying ? "is-playing" : ""}`} onClick={() => selectionMode ? toggleSelection(item.id) : togglePlayback(item.id)} aria-label={selectionMode ? `${isSelected ? "Désélectionner" : "Sélectionner"} ${item.title}` : `${isPlaying ? "Mettre en pause" : "Lire"} ${item.title}`}>
                        {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
                      </button>
                    ) : (
                      <button type="button" className="profile-media-card__visual-open" onClick={() => selectionMode ? toggleSelection(item.id) : onOpenMedia(item)} aria-label={selectionMode ? `${isSelected ? "Désélectionner" : "Sélectionner"} ${item.title}` : `Ouvrir ${item.title}`} />
                    )}
                    <span className={`profile-media-card__type is-${item.kind}`}>{kindLabels[item.kind]}</span>
                    <span className="profile-media-card__visual-meta">{item.duration ?? item.fileSize}</span>
                    {isPlayable && isPlayerOpen && (
                      <section className="profile-media-card__compact-player" aria-label={`Lecteur de ${item.title}`} onClick={(event) => event.stopPropagation()}>
                        <label className="profile-media-card__timeline">
                          <span>{formatPlaybackTime(totalSeconds * progress / 100)}</span>
                          <input type="range" min="0" max="100" step="0.1" value={progress} style={{ "--playback-progress": `${progress}%` } as React.CSSProperties} onChange={(event) => seekPlayback(item.id, Number(event.target.value))} aria-label={`Position de lecture de ${item.title}`} />
                          <span>{formatPlaybackTime(totalSeconds)}</span>
                        </label>
                        <div className="profile-media-card__compact-actions">
                          <span>{item.kind === "audio" ? "Piste originale Meewav" : "Aperçu vidéo"}</span>
                          <button type="button" onClick={() => toggleMute(item.id)} aria-label={isMuted ? "Réactiver le son" : "Couper le son"}>{isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
                          {item.kind === "video" && <button type="button" onClick={() => openFullscreen(item.id)} aria-label="Plein écran"><Maximize2 size={15} /></button>}
                        </div>
                      </section>
                    )}
                  </div>
                  <div className="profile-media-card__body">
                    <div className="profile-media-card__title-row"><h3>{item.title}</h3><span title={item.isPublic ? "Public" : "Privé"}>{item.isPublic ? <Eye size={13} /> : <EyeOff size={13} />}</span></div>
                    <div className="profile-media-card__footer">
                      <p>{item.meta}</p>
                      <span className="profile-media-card__engagement">
                        <span><Headphones size={14} /> {item.plays}</span>
                        <span><Heart size={14} /> {item.likes}</span>
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>}

          {libraryStatus === "ready" && visibleItems.length === 0 && (
            <div className="profile-empty-state"><Archive size={32} /><h3>Aucun contenu ici</h3><p>Change le filtre ou importe un nouveau fichier.</p></div>
          )}
        </div>
      )}

      {activeMediaSection === "studio" && activeStudioMode && (
        <ProfileStudioWorkspace
          key={`${activeStudioMode}:${user?.id ?? "signed-out"}`}
          mode={activeStudioMode}
          storageScope={user?.id ?? null}
          onBack={closeStudioWorkspace}
          onDone={onToast}
        />
      )}

      {activeMediaSection === "badges" && !localAuthPreviewEnabled && (
        <div id="profile-media-panel-badges" className="profile-badges-dashboard" role="tabpanel" aria-labelledby="profile-media-tab-badges">
          <aside className="profile-badges-rail">
            <article className="profile-grade-overview">
              <div className="profile-grade-overview__identity">
                <div className="profile-grade-overview__badge"><MeewavGradeBadge level={gradeLevel} size="xl" variant="icon" /></div>
                <div><span className="profile-kicker">Grade Meewav actuel</span><h3>{gradeMeta.label}</h3><p>{gradeMeta.description}</p></div>
              </div>
              <div className="profile-grade-overview__progress" role="progressbar" aria-label={`Progression vers ${nextGradeMeta.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={gradeProgress}>
                <span><i style={{ width: `${gradeProgress}%` }} /></span>
                <div><strong>{gradeProgress} % du parcours</strong><small>{gradeLevel === 6 ? "Grade maximal atteint" : `${pointsToNextGrade.toLocaleString("fr-FR")} points avant ${nextGradeMeta.label}`}</small></div>
              </div>
            </article>
          </aside>
          <section className="profile-recognition-catalog" aria-label="Validations reçues">
            {user ? <ProfileCertifEndorsementsPanel profileId={user.id} onDone={onToast} />
              : <div className="profile-empty-state"><BadgeCheck size={32} /><h3>Connecte-toi pour retrouver tes validations</h3></div>}
          </section>
        </div>
      )}

      {activeMediaSection === "badges" && localAuthPreviewEnabled && (
        <div id="profile-media-panel-badges" className="profile-badges-dashboard" role="tabpanel" aria-labelledby="profile-media-tab-badges">
          <aside className="profile-badges-rail" aria-label="Progression du grade et prochain objectif">
            <article className="profile-grade-overview">
              <div className="profile-grade-overview__identity">
                <div className="profile-grade-overview__badge"><MeewavGradeBadge level={gradeLevel} size="xl" variant="icon" /></div>
                <div><span className="profile-kicker">Grade Meewav actuel</span><h3>{gradeMeta.label}</h3><p>{gradeMeta.description} Chaque signal utile fait avancer ton parcours.</p></div>
              </div>
              <div className="profile-grade-overview__progress" role="progressbar" aria-label={`Progression vers ${nextGradeMeta.label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={gradeProgress}>
                <span><i style={{ width: `${gradeProgress}%` }} /></span>
                <div><strong>{gradeProgress} % du parcours</strong><small>{gradeLevel === 6 ? "Grade maximal atteint" : `${pointsToNextGrade.toLocaleString("fr-FR")} points avant ${nextGradeMeta.label}`}</small></div>
              </div>
              <div className="profile-grade-signals" aria-label="Signaux du grade">
                <div><span><CalendarClock size={16} /></span><div><small>Régularité</small><strong>14 jours actifs</strong></div><em>Élevée</em></div>
                <div><span><Users size={16} /></span><div><small>Audience</small><strong>+28 % ce mois</strong></div><em>Engagée</em></div>
                <div><span><Handshake size={16} /></span><div><small>Collaborations</small><strong>18 validées</strong></div></div>
              </div>
            </article>

            <article id="profile-badge-roadmap" className="profile-recognition-roadmap">
              <div className="profile-recognition-roadmap__heading"><span className="profile-kicker"><Grid2X2 size={14} /> Reconnaissance en progression</span><h3>Maître des collaborations</h3><p>Encore 7 collaborations uniques pour atteindre le prochain palier.</p></div>
              <div className="profile-recognition-roadmap__milestones" role="progressbar" aria-label="18 collaborations sur 25" aria-valuemin={0} aria-valuemax={25} aria-valuenow={18}>
                <span className="profile-recognition-roadmap__line"><i style={{ width: "72%" }} /></span>
                {[5, 10, 18, 25].map((milestone) => (
                  <span key={milestone} className={`${milestone <= 18 ? "is-complete" : ""} ${milestone === 18 ? "is-current" : ""}`}><i>{milestone < 18 ? <Check size={13} /> : milestone}</i><small>{milestone}</small></span>
                ))}
              </div>
              <div className="profile-recognition-roadmap__next">
                <div><strong>18 / 25</strong><small>collaborations validées</small></div>
                <div><span><Users size={18} /></span><p><small>Prochaine action</small><strong>Collaborer avec 7 créateurs uniques</strong></p></div>
              </div>
            </article>
          </aside>

          <section className="profile-recognition-catalog" aria-labelledby="profile-recognition-title">
            <header className="profile-recognition-header">
              <div><span className="profile-kicker"><BadgeCheck size={14} /> Récompenses métier</span><h3 id="profile-recognition-title">Reconnaissances métier</h3><p>{earnedBadgeCount} obtenues · {recognitionProgressCount} en progression · {recognitionCatalog.length - earnedBadgeCount - recognitionProgressCount} à découvrir</p></div>
              {recognitionFilter !== "all" && <button className="profile-recognition-header__reset" type="button" onClick={() => setRecognitionFilter("all")}>Tout afficher</button>}
            </header>

            <div className="profile-recognition-summary" aria-label="Résumé des reconnaissances">
              <button type="button" className={recognitionFilter === "earned" ? "is-active" : ""} aria-pressed={recognitionFilter === "earned"} onClick={() => setRecognitionFilter((current) => current === "earned" ? "all" : "earned")}>
                <span><Trophy size={19} /></span><small>Débloquées</small><strong>{earnedBadgeCount}</strong>
              </button>
              <button type="button" className={recognitionFilter === "progress" ? "is-active" : ""} aria-pressed={recognitionFilter === "progress"} onClick={() => setRecognitionFilter((current) => current === "progress" ? "all" : "progress")}>
                <span className="is-progress"><Sparkles size={19} /></span><small>En progression</small><strong>{recognitionProgressCount}</strong>
              </button>
              <button type="button" onClick={() => document.getElementById("profile-badge-roadmap")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                <span><ArrowRight size={19} /></span><small>Prochain palier</small><strong>7 actions</strong>
              </button>
            </div>

            <div className="profile-recognition-grid" key={recognitionFilter}>
              {visibleRecognitions.map((recognition) => {
                const RecognitionIcon = recognition.icon;
                const progressRatio = recognition.progress ? recognition.progress.current / recognition.progress.target : 0;
                const statusLabel = recognition.status === "earned" ? "Obtenu" : recognition.status === "progress" ? "En progression" : "À découvrir";
                return (
                  <button
                    key={recognition.id}
                    type="button"
                    className={`profile-recognition-card is-${recognition.status}`}
                    style={{ "--recognition-accent": recognition.accent } as React.CSSProperties}
                    onClick={() => {
                      if (recognition.status === "progress") document.getElementById("profile-badge-roadmap")?.scrollIntoView({ behavior: "smooth", block: "center" });
                      onToast(`${recognition.label} · ${recognition.nextAction ?? recognition.detail}`);
                    }}
                  >
                    <span className="profile-recognition-card__icon"><RecognitionIcon size={24} /></span>
                    <div className="profile-recognition-card__copy"><h4>{recognition.label}</h4><p>{recognition.detail}</p></div>
                    {recognition.progress && (
                      <div className="profile-recognition-card__progress" role="progressbar" aria-label={`${recognition.label} : ${recognition.progress.current} sur ${recognition.progress.target}`} aria-valuemin={0} aria-valuemax={recognition.progress.target} aria-valuenow={recognition.progress.current}>
                        <span>{Array.from({ length: 10 }, (_, index) => <i key={index} className={index < Math.round(progressRatio * 10) ? "is-filled" : ""} />)}</span>
                        <strong>{recognition.progress.current} / {recognition.progress.target}</strong>
                      </div>
                    )}
                    <div className="profile-recognition-card__footer">
                      <span className="profile-recognition-card__status">{recognition.status === "earned" ? <CheckCircle2 size={14} /> : recognition.status === "progress" ? <Sparkles size={14} /> : <Archive size={14} />} {statusLabel}</span>
                      <time>{recognition.earnedAt ?? recognition.nextAction}</time>
                    </div>
                    <span className="profile-recognition-card__tag">{recognition.category}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
      </div>

      {libraryDialog && (
        <div className="profile-library-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeLibraryDialog(); }}>
          <section className="profile-library-dialog" role="dialog" aria-modal="true" aria-label={libraryDialog.type === "delete-items" ? "Confirmer l’archivage" : "Nommer le contenu"}>
            <header>
              <div>
                <span className="profile-kicker">Médiathèque</span>
                <h3>{libraryDialog.type === "rename-item" ? "Renommer le contenu" : "Confirmer l’archivage"}</h3>
              </div>
              <button type="button" onClick={closeLibraryDialog} aria-label="Fermer"><X size={18} /></button>
            </header>

            {libraryDialog.type === "rename-item" && (
              <form onSubmit={(event) => { event.preventDefault(); void submitLibraryName(); }}>
                <label><span>Nom</span><input autoFocus value={libraryDraftName} onChange={(event) => setLibraryDraftName(event.target.value)} placeholder="Nouveau nom" /></label>
                <div className="profile-library-dialog__actions"><button type="button" onClick={closeLibraryDialog}>Annuler</button><button type="submit" className="is-primary" disabled={!libraryDraftName.trim() || pendingItemIds.includes(libraryDialog.itemId)}><Check size={16} /> Enregistrer</button></div>
              </form>
            )}

            {libraryDialog.type === "delete-items" && (
              <div className="profile-library-delete-confirm">
                <span><Trash2 size={21} /></span>
                <p><strong>Archiver {libraryDialog.itemIds.length} contenu{libraryDialog.itemIds.length > 1 ? "s" : ""} ?</strong>La sélection disparaîtra de ta médiathèque sans supprimer brutalement les fichiers source.</p>
                <div className="profile-library-dialog__actions"><button type="button" onClick={closeLibraryDialog}>Annuler</button><button type="button" className="is-danger" disabled={libraryDialog.itemIds.some((id) => pendingItemIds.includes(id))} onClick={() => { void deleteItems(libraryDialog.itemIds); }}><Trash2 size={16} /> Archiver</button></div>
              </div>
            )}

          </section>
        </div>
      )}
    </div>
  );
}
