import { useEffect, useRef, type ReactNode } from "react";

/** Uses the reserved desktop column; becomes an overlay on small screens. */
export default function SceneWatchMenu({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>("a[href]")?.focus({ preventScroll: true });
  }, []);
  return <div className="scene-watch-menu" ref={root} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Escape") { event.preventDefault(); onClose(); }
    if (event.key === "Tab") {
      const items = [...(root.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]):not([tabindex="-1"])') ?? [])];
      const edge = event.shiftKey ? items[0] : items[items.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? items[items.length - 1] : items[0])?.focus();
      }
    }
  }}>
    <button className="scene-watch-menu__backdrop" aria-label="Fermer le menu vidéo" onClick={onClose} tabIndex={-1} />
    {children}
  </div>;
}
