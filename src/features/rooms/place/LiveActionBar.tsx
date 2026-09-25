import { useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";
import "./live-action-bar.css";
import "./live-glass-material.css";

/** Visual chassis only: its children keep their existing actions and state. */
export default function LiveActionBar({ className = "", children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const bar = useRef<HTMLDivElement>(null);
  const [mobileBottom, setMobileBottom] = useState(12);
  useLayoutEffect(() => {
    const stage = bar.current?.closest<HTMLElement>(".place-stage");
    const consolePanel = stage?.closest(".place-room-workspace")?.querySelector<HTMLElement>(".place-studio-panel");
    if (!stage || !consolePanel) return;
    // On mobile the console is a fixed drawer. Keep the controls in the
    // visible part of the video without moving either surface.
    const measure = () => {
      const video = stage.getBoundingClientRect(); const panel = consolePanel.getBoundingClientRect();
      const overlaps = innerWidth <= 600 && !document.fullscreenElement && getComputedStyle(consolePanel).position === "fixed" && panel.top < video.bottom && panel.bottom > video.top;
      setMobileBottom(overlaps ? Math.max(12, video.bottom - panel.top + 12) : 12);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage); observer.observe(consolePanel);
    window.addEventListener("resize", measure); document.addEventListener("fullscreenchange", measure);
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); document.removeEventListener("fullscreenchange", measure); };
  }, []);
  return <div {...props} ref={bar} className={`${className} live-action-bar`} style={{ ...props.style, "--live-controls-bottom": `${mobileBottom}px` } as CSSProperties}>{children}</div>;
}

export { LiveMonetizationIcon } from "./LiveMonetizationIcon";
