import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import MeewavPillarBrand from "../../components/navigation/MeewavPillarBrand";
import type { PreProfileDemoArtist } from "../globe/components/preProfile/demoPreProfileArtist";
import { ProfileViewerExperience } from "./ProfileViewerPage";

type ProfileViewerOverlayProps = {
  profileId: string;
  artist: PreProfileDemoArtist;
  isOwner?: boolean;
  returnPath?: string;
  onClose: () => void;
};

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>([
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "audio[controls]",
    "video[controls]",
    "[tabindex]:not([tabindex='-1'])",
  ].join(","))).filter((element) => {
    if (element.hasAttribute("hidden") || element.closest("[inert]")) return false;
    let current: HTMLElement | null = element;
    while (current && current !== container) {
      const style = window.getComputedStyle(current);
      if (style.display === "none" || style.visibility === "hidden") return false;
      current = current.parentElement;
    }
    return true;
  });
}

export default function ProfileViewerOverlay({
  profileId,
  artist,
  isOwner = false,
  returnPath = "/globe",
  onClose,
}: ProfileViewerOverlayProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const applicationRoot = document.getElementById("root");
    const rootWasInert = applicationRoot?.hasAttribute("inert") ?? false;
    document.body.style.overflow = "hidden";
    if (applicationRoot && !rootWasInert) applicationRoot.setAttribute("inert", "");
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = getFocusableElements(dialogRef.current);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (applicationRoot && !rootWasInert) applicationRoot.removeAttribute("inert");
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div className="profile-viewer-overlay-backdrop">
      <section
        ref={dialogRef}
        className="profile-viewer-overlay-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-viewer-overlay-title"
        tabIndex={-1}
      >
        <header className="profile-viewer-overlay-header">
          <div className="profile-viewer-overlay-header__brand">
            <MeewavPillarBrand pillar="Profil" />
            <span className="profile-viewer-overlay-identity">
              <small>VUE VISITEUR · PROFIL PUBLIC</small>
              <strong id="profile-viewer-overlay-title">{artist.name}</strong>
            </span>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="profile-viewer-overlay-close"
            aria-label={returnPath.startsWith("/profile") ? "Fermer l’aperçu et revenir à mon profil" : "Fermer le profil et revenir au Globe"}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="profile-viewer-overlay-content">
          <ProfileViewerExperience
            profileId={profileId}
            artist={artist}
            isOwner={isOwner}
            returnPath={returnPath}
            presentation="overlay"
            onClose={onClose}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
