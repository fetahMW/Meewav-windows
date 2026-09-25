import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Trophy, X, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../auth";
import { useRuntime } from "../../../runtime/RuntimeProvider";
import CageLaunchDialog from "../launch/CageLaunchDialog";
import { readCageLaunchTemplates, stageCageLaunchDraft } from "../launch/cageLaunch";

export default function CagePreparedCompetitions() {
  const { user } = useAuth();
  const desktop = useRuntime().canPrepareHostRoom;
  const scope = user?.id ?? "demo";
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [bounds, setBounds] = useState<CSSProperties>({ visibility: "hidden" });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chosen, setChosen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState(() => readCageLaunchTemplates(scope));
  const trigger = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => { setOpen(false); setChosen(false); setClosing(false); }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 260);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const consolePanel = trigger.current?.closest(".place-studio-panel");
    if (!consolePanel) return;
    const measure = () => {
      const rect = consolePanel.getBoundingClientRect();
      setBounds({ top: Math.max(0, rect.top), left: Math.max(0, rect.left), right: Math.max(0, window.innerWidth - rect.right), bottom: Math.max(0, window.innerHeight - rect.bottom) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(consolePanel);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    return () => { trigger.current?.focus(); };
  }, [open]);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [chosen, open]);
  return <>
    <button ref={trigger} type="button" className="place-guests__add-contact cage-prepared-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setTemplates(readCageLaunchTemplates(scope)); setError(null); setChosen(false); setOpen(true); }}><Trophy aria-hidden="true" /><span>Mes compétitions</span></button>
    {open && createPortal(<div style={desktop && chosen ? undefined : bounds} className={`${desktop && chosen ? "" : "cage-prepared-overlay "}rooms-home-launch-dialog${closing ? " is-closing" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current?.click(); }} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); closeRef.current?.click(); }
      if (event.key !== "Tab" || chosen) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'));
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
      {chosen ? <CageLaunchDialog fromProfile closeRef={closeRef} onClose={close} /> : <section className="cage-prepared-panel" role="dialog" aria-modal="true" aria-labelledby="cage-prepared-title">
        <header><div><small>DEPUIS MON PROFIL</small><h2 id="cage-prepared-title">Mes compétitions</h2></div><button ref={closeRef} type="button" onClick={close} aria-label="Fermer"><X /></button></header>
        <p>Retrouve tes règles et tes invités. Tu gardes la main sur la préparation du tableau et le lancement des matchs.</p>
        <div className="cage-prepared-list">{templates.length ? templates.map((template) => <button type="button" key={template.id} onClick={() => {
          try { stageCageLaunchDraft(scope, { ...template.configuration, templateId: template.id }); setError(null); setChosen(true); }
          catch { setError("Impossible d’ouvrir cette préparation : le stockage du navigateur est indisponible."); }
        }}>
          <Trophy aria-hidden="true" /><span><strong>{template.configuration.title}</strong><small>{{ tournament: "Tournoi", championship: "Championnat", "open-mic": "Open Mic libre", "open-mic-battle": "Open Mic Battle" }[template.configuration.format]} · {template.configuration.participantCount} places · {template.configuration.rosterProfileIds.length} invités préparés</small></span><ArrowRight aria-hidden="true" />
        </button>) : <p>Aucune compétition enregistrée dans ce profil pour le moment.</p>}</div>
        {error ? <p role="alert">{error}</p> : null}
        <Link to="/profile/creations/studio/cage" onClick={close}>Préparer une compétition dans mon profil <ArrowRight aria-hidden="true" /></Link>
      </section>}
    </div>, document.body)}
  </>;
}
