import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PreProfileFrame } from "./reference/features/globe/components/PreProfileFrame";
import HoverPreProfileContent from "./reference/features/globe/components/preProfile/HoverPreProfileContent";
import { getPreProfileArtistForSeed } from "./reference/features/globe/components/preProfile/demoPreProfileArtist";
import { getGradeBadgeMeta } from "./reference/features/grades/gradeBadges";
import "./ring-artist-preprofile.css";

export type GroundAvatarSelection = {
  id: string;
  name: string;
  role: string;
  icon: string;
  zoneName: string;
  city?: string;
  grade: number;
  isHost?: boolean;
  wasConsulted?: boolean;
  anchor: { x: number; y: number; clearance: number; viewportWidth: number; viewportHeight: number };
};

const PINNED_AVATARS_KEY = "globelab.pinnedAvatars.v1";

function readPinnedColor(id: string) {
  try {
    const stored = JSON.parse(localStorage.getItem(PINNED_AVATARS_KEY) || "null");
    const color = stored?.[id];
    return typeof color === "string" && color ? color : null;
  } catch {
    return null;
  }
}

export default function GroundArtistPreProfile({
  selection,
  onClose,
}: {
  selection: GroundAvatarSelection;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [notice, setNotice] = useState("");
  const [restored, setRestored] = useState(false);
  const [pinnedColor, setPinnedColor] = useState(() => readPinnedColor(selection.id));
  const showRestoreAvatar = Boolean(
    selection.wasConsulted && !selection.isHost && !pinnedColor && !restored,
  );
  const grade = getGradeBadgeMeta(selection.grade);
  const artist = useMemo(() => getPreProfileArtistForSeed({
    profileId: selection.id,
    displayName: selection.name,
    mainRole: selection.role,
    iconId: selection.icon,
    zoneName: selection.zoneName || selection.city,
    gradeLevel: grade.level,
    gradeColor: grade.mainColor,
  }), [selection, grade.level, grade.mainColor]);

  const margin = 16, leftGuard = viewport.width > 760 ? 112 : 88;
  const scale = Math.min(1, (viewport.width - leftGuard - margin * 2) / 413, (viewport.height - 104) / 588);
  const width = 413 * scale, height = 588 * scale;
  const gapFromAvatar = -20;
  const arrowSize = 8;
  const anchor = selection.anchor;
  const x = anchor.x * viewport.width / anchor.viewportWidth;
  const y = anchor.y * viewport.height / anchor.viewportHeight;
  const clearance = anchor.clearance * viewport.width / anchor.viewportWidth;
  const right = x + clearance + gapFromAvatar + arrowSize;
  const left = x - clearance - gapFromAvatar - arrowSize - width;
  const placement = right + width <= viewport.width - margin ? "right"
    : left >= leftGuard ? "left" : viewport.width - x >= x - leftGuard ? "right" : "left";
  const popupLeft = Math.max(leftGuard, Math.min(viewport.width - margin - width, placement === "right" ? right : left));
  const popupTop = Math.max(88, Math.min(viewport.height - margin - height, y - height / 2));

  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      if (trigger?.isConnected && (document.activeElement === document.body || panel.current?.contains(document.activeElement))) {
        trigger.focus({ preventScroll: true });
      }
    };
  }, []);
  useEffect(() => {
    const resize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    const outside = (event: Event) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) closeRef.current();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation(); closeRef.current();
    };
    window.addEventListener("resize", resize);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("wheel", outside, { capture: true, passive: true });
    document.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("wheel", outside, true);
      document.removeEventListener("keydown", escape, true);
    };
  }, []);
  useEffect(() => {
    setRestored(false);
    setPinnedColor(readPinnedColor(selection.id));
  }, [selection.id, selection.wasConsulted]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return createPortal(<div ref={panel} className="ring-artist-preprofile" role="dialog" aria-modal="false"
    aria-label={`Pré-profil de ${selection.name}`} data-placement={placement}
    style={{ left: popupLeft, top: popupTop, transform: `scale(${scale})`,
      "--mw-arrow-y": `${Math.max(40, Math.min(548, (y - popupTop) / scale))}px` } as CSSProperties}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <PreProfileFrame arrow>
      <HoverPreProfileContent artist={artist} demoFollow showMapPin={!selection.isHost}
        isOwner={Boolean(selection.isHost)}
        pinnedColor={pinnedColor}
        showRestoreAvatar={showRestoreAvatar}
        onRestoreAvatar={(id) => {
          setRestored(true);
          window.dispatchEvent(new CustomEvent("meewav:ground-avatar-restore", { detail: { id } }));
        }}
        onPin={(id, color, active) => {
          setPinnedColor(active ? color : null);
          window.dispatchEvent(new CustomEvent("meewav:ground-avatar-pin", { detail: { id, color, active } }));
        }}
        onOpenProfile={() => setNotice("Le profil complet sera bientôt disponible.")}
        onContact={() => setNotice("La messagerie sera bientôt disponible.")}
        onCollabRequest={() => setNotice("Les demandes de collaboration seront bientôt disponibles.")} />
    </PreProfileFrame>
    <button ref={closeButton} className="ring-artist-preprofile__close" type="button" onClick={onClose} aria-label="Fermer le pré-profil">
      <X aria-hidden="true" />
    </button>
    <span className="ring-artist-preprofile__demo">Pré-profil de démonstration</span>
    {notice && <div className="ring-artist-preprofile__notice" role="status">{notice}</div>}
  </div>, document.body);
}
