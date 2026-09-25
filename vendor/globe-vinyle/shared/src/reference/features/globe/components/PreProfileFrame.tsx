import type { ReactNode } from "react";
import "./HoverPreProfileBubble.css";

/** The same glass frame is used by the Globe bubble and in-place previews. */
export function PreProfileFrame({ children, arrow = false }: { children: ReactNode; arrow?: boolean }) {
  return <div className="mw-hover-preprofile-bubble__shell is-black-glass">
    <div className="mw-hover-preprofile-bubble__glass" />
    <span className="mw-preprofile-frame__mark" aria-hidden="true">MEEWAV <i /> PRÉ-PROFIL</span>
    {arrow ? <span className="mw-hover-preprofile-bubble__arrow" /> : null}
    <div className="mw-hover-preprofile-bubble__surface">{children}</div>
  </div>;
}
