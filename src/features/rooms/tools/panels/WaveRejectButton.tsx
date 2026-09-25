import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WaveReviewReason } from "../roomTools.types";
import "./wave-reject-menu.css";

const REASONS: { reason: WaveReviewReason; label: string }[] = [
  { reason: "fit", label: "Ne convient pas à ce beat" },
  { reason: "duplicate", label: "Catégorie déjà complète" },
  { reason: "quality", label: "À retravailler" },
];

export default function WaveRejectButton({ title, className, disabled, onReject }: {
  title: string; className: string; disabled: boolean;
  onReject: (reason: WaveReviewReason, feedback: string) => Promise<void>;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locked = useRef(false);
  const focusOnOpen = useRef(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  const close = () => { cancelClose(); if (!locked.current) setOpen(false); };
  const leave = () => { cancelClose(); timer.current = setTimeout(close, 200); };
  const show = (focus: boolean) => {
    if (disabled || locked.current) return;
    cancelClose(); focusOnOpen.current = focus; setOpen(true);
    if (focus && open) menu.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { if (disabled && !locked.current) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const anchor = trigger.current.getBoundingClientRect(), bounds = menu.current.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(anchor.right - bounds.width, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, anchor.top >= bounds.height + 8 ? anchor.top - bounds.height - 6 : Math.min(anchor.bottom + 6, window.innerHeight - bounds.height - 8)) });
    if (focusOnOpen.current) menu.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open, error]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); }
    };
    const scroll = (event: Event) => { if (!(event.target instanceof Node) || !menu.current?.contains(event.target)) close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close); window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);
  const reject = async (choice: typeof REASONS[number]) => {
    if (locked.current || disabled) return;
    locked.current = true; setPending(true); setError(""); cancelClose();
    try { await onReject(choice.reason, choice.label); setOpen(false); }
    catch { setError("Le refus n’a pas été enregistré. Réessaie."); }
    finally { locked.current = false; setPending(false); }
  };
  return <>
    <button ref={trigger} type="button" className={className} aria-label={`Refuser ${title}`} disabled={disabled || pending}
      aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
      onMouseEnter={() => show(false)} onMouseLeave={leave}
      onClick={event => { event.stopPropagation(); show(true); }}
      onKeyDown={event => { if (event.key === "ArrowDown") { event.preventDefault(); show(true); } }}
      onBlur={event => { if (!menu.current?.contains(event.relatedTarget)) leave(); }}>Refuser</button>
    {open ? createPortal(<div ref={menu} id={id} className="wave-reject-menu" role="menu" aria-label={`Motif du refus de ${title}`} aria-busy={pending}
      style={position} onMouseEnter={cancelClose} onMouseLeave={leave} onFocus={cancelClose}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) close(); }}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }}>
      <span className="wave-reject-menu__title">Motif du refus</span>
      {REASONS.map(choice => <button type="button" role="menuitem" key={choice.reason} disabled={pending || disabled} onClick={() => void reject(choice)}>{choice.label}</button>)}
      {error ? <p role="alert">{error}</p> : null}
    </div>, document.body) : null}
  </>;
}
