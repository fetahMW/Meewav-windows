import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./live-action-popover.css";

/** Keeps the panel attached to its triggering control, including fullscreen. */
export default function LiveActionPopover({ anchor, children }: { anchor: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const position = () => {
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const vx = viewport?.offsetLeft ?? 0;
      const vy = viewport?.offsetTop ?? 0;
      const button = anchor?.getBoundingClientRect();
      const above = button ? button.top - vy > height / 2 : false;
      const available = button ? (above ? button.top - vy - 24 : vy + height - button.bottom - 24) : height - 24;
      panel.style.width = `${Math.min(400, width - 24)}px`;
      panel.style.setProperty("--popover-height", `${Math.max(100, available)}px`);
      const bounds = panel.getBoundingClientRect();
      const x = Math.max(vx + 12, Math.min((button ? button.left + button.width / 2 : vx + width / 2) - bounds.width / 2, vx + width - bounds.width - 12));
      const y = button ? (above ? button.top - bounds.height - 12 : button.bottom + 12) : vy + 12;
      // Convert viewport coordinates into the portal's positioned containing block.
      const parent = panel.offsetParent as HTMLElement | null;
      const origin = parent?.getBoundingClientRect();
      panel.style.left = `${x - (origin?.left ?? 0) + (parent?.scrollLeft ?? 0)}px`;
      panel.style.top = `${Math.max(vy + 12, y) - (origin?.top ?? 0) + (parent?.scrollTop ?? 0)}px`;
      panel.style.visibility = "visible";
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(panel);
    if (anchor) observer.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); window.removeEventListener("scroll", position, true); window.visualViewport?.removeEventListener("resize", position); };
  }, [anchor]);
  return <div ref={ref} className="live-action-popover">{children}</div>;
}
