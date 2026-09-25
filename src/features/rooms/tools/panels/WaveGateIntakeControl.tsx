import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { RoomToolsCommand, WaveLoopCategory, WaveState } from "../roomTools.types";
import { WAVE_LOOP_CATEGORIES, waveAcceptedCategories } from "../waveLoopCategories";
import WaveCategoryChip from "./WaveCategoryChip";
import "./wave-gate-intake.css";

export default function WaveGateIntakeControl({ wave, disabled, execute }: {
  wave: WaveState;
  disabled: boolean;
  execute: (command: RoomToolsCommand) => Promise<unknown>;
}) {
  const accepted = waveAcceptedCategories(wave);
  const accepting = wave.submissionsOpen !== false && accepted.length > 0;
  const filtered = accepted.length < WAVE_LOOP_CATEGORIES.length;
  const selectionLabel = WAVE_LOOP_CATEGORIES.filter(({ id }) => accepted.includes(id)).map(({ label }) => label).join(", ");
  const label = !accepting ? "Fermé" : filtered ? `Filtré · ${accepted.length}` : "Ouvert";
  const [open, setOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(accepting);
  const [draftCategories, setDraftCategories] = useState<WaveLoopCategory[]>(accepted);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 400 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const show = () => {
    setDraftOpen(accepting);
    setDraftCategories(accepted);
    setError("");
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!triggerRef.current || !panelRef.current) return;
      const anchor = triggerRef.current.getBoundingClientRect();
      const bounds = panelRef.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft ?? 0) + 8;
      const top = (viewport?.offsetTop ?? 0) + 8;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const maxTop = Math.max(top, top + height - bounds.height - 16);
      const below = anchor.bottom + 6;
      setPosition({
        left: Math.max(left, Math.min(anchor.right - bounds.width, left + width - bounds.width - 16)),
        top: Math.max(top, Math.min(below <= maxTop ? below : anchor.top - bounds.height - 6, maxTop)),
        maxHeight: Math.max(80, height - 16),
      });
    };
    place();
    panelRef.current?.querySelector<HTMLButtonElement>('[role="switch"]')?.focus({ preventScroll: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (panelRef.current) observer?.observe(panelRef.current);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "Tab") {
      const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled)") ?? []);
      if (event.shiftKey && event.target === controls[0]) { event.preventDefault(); close(); }
      else if (!event.shiftKey && event.target === controls[controls.length - 1]) close();
    }
  };

  const save = async () => {
    if (disabled || saving || (draftOpen && !draftCategories.length)) return;
    setSaving(true);
    setError("");
    try {
      await execute({ type: "wave.submissions.setOpen", open: draftOpen, acceptedCategories: draftCategories });
      close();
    } catch {
      setError("Le réglage n’a pas été enregistré. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return <>
    <button ref={triggerRef} type="button" className={`wave-sas__intake is-${accepting ? "open" : "closed"}`}
      aria-label={accepting ? `Soumissions ouvertes${filtered ? ` : ${selectionLabel}` : ""}` : "Soumissions fermées"}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled || saving}
      onClick={() => open ? close() : show()} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }}>
      <i aria-hidden="true" /><span>{label}</span><ChevronDown className="wave-sas__intake-chevron" aria-hidden="true" />
    </button>
    {open ? createPortal(<div ref={panelRef} id={id} className="wave-gate-intake-menu" role="dialog"
      aria-label="Ouverture du sas" style={position} onKeyDown={keyboard}>
      <header><strong>Ouverture du sas</strong><button type="button" aria-label="Fermer les réglages du sas" onClick={close}><X /></button></header>
      <button type="button" className="wave-gate-intake-menu__switch" role="switch" aria-checked={draftOpen}
        disabled={disabled || saving} onClick={() => setDraftOpen(!draftOpen)}>
        <span>Recevoir des boucles</span><i aria-hidden="true" />
      </button>
      <fieldset disabled={disabled || saving}>
        <legend>Catégories acceptées</legend>
        <button type="button" className="wave-gate-intake-menu__all" onClick={() => { setDraftCategories(WAVE_LOOP_CATEGORIES.map(({ id: categoryId }) => categoryId)); setDraftOpen(true); }}>Tout accepter</button>
        {WAVE_LOOP_CATEGORIES.map(({ id: categoryId, label: categoryLabel, badge, color }) => <label key={categoryId}>
          <input type="checkbox" aria-label={categoryLabel} checked={draftCategories.includes(categoryId)} onChange={(event) => {
            const checked = event.currentTarget.checked;
            setDraftCategories((current) => checked ? [...current, categoryId] : current.filter((value) => value !== categoryId));
            if (checked) setDraftOpen(true);
          }} />
          <WaveCategoryChip label={badge} accent={color} />
          <span className="wave-gate-intake-menu__check" aria-hidden="true"><Check /></span>
        </label>)}
      </fieldset>
      <p>{draftOpen && !draftCategories.length ? "Choisissez au moins une catégorie, ou fermez le sas." : "Les boucles déjà reçues restent dans le sas."}</p>
      {error ? <p role="alert" className="is-error">{error}</p> : null}
      <footer><button type="button" onClick={close}>Annuler</button><button type="button" className="is-primary"
        disabled={disabled || saving || (draftOpen && !draftCategories.length)} onClick={() => void save()}>{saving ? "Enregistrement…" : "Appliquer"}</button></footer>
    </div>, document.body) : null}
  </>;
}
