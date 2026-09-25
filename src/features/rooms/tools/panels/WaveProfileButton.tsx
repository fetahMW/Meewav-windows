import { lazy, Suspense, useRef, useState, type ReactNode } from "react";
import { getRoomPreProfileBounds } from "./roomPreProfileBounds";
import { UserRound } from "lucide-react";
import type { RoomPerson } from "../roomTools.types";
const ClassStudentPreProfile = lazy(() => import("./ClassStudentPreProfile"));

export default function WaveProfileButton({ person, source, children, className = "" }: { person?: RoomPerson; source: "demo" | "live"; children?: ReactNode; className?: string }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => { setOpen(false); setClosing(false); };
  return <>
    <button ref={trigger} type="button" className={`wave-profile-button ${className}${open ? " is-active" : ""}`} title="Pré-profil"
      aria-label={person ? `${open ? "Fermer" : "Ouvrir"} le pré-profil de ${person.name}` : "Sélectionner une personne"}
      aria-haspopup="dialog" aria-expanded={open} disabled={!person}
      onClick={() => { if (open) setClosing(true); else setOpen(true); }}>{children ?? <UserRound />}</button>
    {open && person ? <Suspense fallback={null}><ClassStudentPreProfile key={person.id} person={person} source={source} returnFocusTo={trigger.current} {...getRoomPreProfileBounds(trigger.current)} closeRequested={closing} onClose={close} /></Suspense> : null}
  </>;
}
