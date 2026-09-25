import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { PreProfileFrame } from "../../../globe/components/PreProfileFrame";
import HoverPreProfileContent from "../../../globe/components/preProfile/HoverPreProfileContent";
import { getPreProfileArtistForSeed, type PreProfileDemoArtist } from "../../../globe/components/preProfile/demoPreProfileArtist";
import type { RoomPerson } from "../roomTools.types";
import "./class-student-pre-profile.css";

export default function ClassStudentPreProfile({ person, source, onClose, returnFocusTo, boundsElement, topBoundaryElement, bottomBoundaryElement, closeRequested = false }: {
  person: RoomPerson; source: "demo" | "live"; onClose: () => void; returnFocusTo: HTMLElement | null;
  boundsElement?: HTMLElement | null; closeRequested?: boolean;
  bottomBoundaryElement?: HTMLElement | null;
  topBoundaryElement?: HTMLElement | null;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 0, height: 0 });
  // Preserve the profile's original composition while letting its frame stay tall.
  const scale = bounds.width > 0 && bounds.height > 0
    ? Math.min(1, bounds.width * 0.96 / 413, bounds.height / 588)
    : 1;
  const requestClose = () => {
    if (closeTimer.current) return;
    setClosing(true);
    closeTimer.current = setTimeout(onClose, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 180);
  };
  useEffect(() => { if (closeRequested) requestClose(); }, [closeRequested]);
  const artist = useMemo<PreProfileDemoArtist>(() => {
    if (source === "demo") return {
      ...getPreProfileArtistForSeed({ profileId: person.id, displayName: person.name, mainRole: person.role, gradeLevel: person.gradeLevel }),
      portraitUrl: person.avatarUrl,
    };
    // The shared content hydrates canonical live profiles; never seed fictitious media/stats.
    return {
      id: person.id, name: person.name, role: person.role, portraitUrl: person.avatarUrl,
      portraitFallback: person.name.slice(0, 1), verified: false, online: false,
      location: "", followersLabel: "", bio: "", gradeLevel: person.gradeLevel ?? null,
      gradeStars: person.gradeLevel ?? null, gradeTier: "", gradeColor: "#a6aec0",
      publicStatsPublished: false, pinColors: [], shorts: [], audios: [],
      stats: { shorts: 0, audios: 0, collabAvailable: false },
    };
  }, [person, source]);
  useEffect(() => {
    const trigger = returnFocusTo;
    const roster = boundsElement ?? trigger?.closest(".is-classroom")?.querySelector(".classroom-roster");
    const resize = () => {
      const rect = roster?.getBoundingClientRect();
      if (!rect) return;
      const bottom = bottomBoundaryElement?.getBoundingClientRect().top;
      const top = Math.max(rect.top, (topBoundaryElement?.getBoundingClientRect().bottom ?? rect.top) + (topBoundaryElement ? 7 : 0));
      const height = Math.max(0, Math.min(rect.bottom, bottom !== undefined ? bottom - 8 : rect.bottom) - top);
      setBounds({ left: rect.left, top, width: rect.width, height });
    };
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("scroll", resize, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    if (roster) observer?.observe(roster);
    if (bottomBoundaryElement) observer?.observe(bottomBoundaryElement);
    if (topBoundaryElement) observer?.observe(topBoundaryElement);
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", resize, true);
      observer?.disconnect();
      if (closeTimer.current) clearTimeout(closeTimer.current);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="class-student-pre-profile-viewport" style={bounds}>
    <div role="dialog" aria-modal="false" className={`class-student-pre-profile${closing ? " is-closing" : ""}`}
    aria-label={`Pré-profil de ${person.name}`}
    style={{ zoom: scale, height: bounds.height > 0 ? bounds.height / scale : 588 }}
    onKeyDown={(event) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); requestClose(); } }}>
    <PreProfileFrame><HoverPreProfileContent artist={artist} demoFollow={source === "demo"} showMapPin={false} /></PreProfileFrame>
    <button ref={closeButton} type="button" className="class-student-pre-profile__close" aria-label="Fermer le pré-profil" onClick={requestClose}><X aria-hidden="true" /></button>
  </div></div>, document.body);
}
