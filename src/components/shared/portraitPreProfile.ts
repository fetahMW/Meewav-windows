import type { HTMLAttributes } from "react";

export type PortraitIdentity = { id: string; name?: string; avatarUrl?: string; role?: string; gradeLevel?: number | null };
export const PORTRAIT_EVENT = "meewav:portrait-preprofile";
export type PortraitRequest = { person: PortraitIdentity; trigger: HTMLElement | null };
export function openPortraitPreProfile(person: PortraitIdentity, trigger: HTMLElement | null = null) {
  if (!person.id?.trim() || trigger?.closest('[data-preprofile-exempt="volumes"]')) return;
  window.dispatchEvent(new CustomEvent<PortraitRequest>(PORTRAIT_EVENT, { detail: { person, trigger } }));
}
/** Attach only to a person's portrait, never to a conversation/group identifier. */
export function portraitProps(person: PortraitIdentity | null | undefined): HTMLAttributes<HTMLElement> {
  if (!person?.id) return {};
  return {
    role: "button", tabIndex: 0,
    "aria-label": `Ouvrir le pré-profil de ${person.name || "cet artiste"}`,
    "aria-haspopup": "dialog",
    ...{ "data-preprofile-portrait": person.id },
    onClick(event) { event.preventDefault(); event.stopPropagation(); openPortraitPreProfile(person, event.currentTarget); },
    onKeyDown(event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault(); event.stopPropagation(); openPortraitPreProfile(person, event.currentTarget);
    },
  };
}
