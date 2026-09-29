import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import "./meewav-pillar-tabs.css";

export type MeewavPillarTabItem<Id extends string = string> = {
  id: Id;
  label: string;
  icon: LucideIcon;
  accent?: string;
};

export const MEEWAV_PILLAR_SEMANTIC_ACCENTS = {
  home: "#f7f5ff",
  statistics: "#45dfa8",
  media: "#c56cff",
  fallback: "#a77cff",
} as const;

export function resolveMeewavPillarAccent(
  item: Pick<MeewavPillarTabItem, "id" | "label" | "accent">,
) {
  const normalizedLabel = item.label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");

  if (item.id === "home" || normalizedLabel === "accueil") {
    return MEEWAV_PILLAR_SEMANTIC_ACCENTS.home;
  }

  if (normalizedLabel.startsWith("statistique")) {
    return MEEWAV_PILLAR_SEMANTIC_ACCENTS.statistics;
  }

  if (normalizedLabel === "medias" || normalizedLabel === "media") {
    return MEEWAV_PILLAR_SEMANTIC_ACCENTS.media;
  }

  return item.accent ?? MEEWAV_PILLAR_SEMANTIC_ACCENTS.fallback;
}

type MeewavPillarTabsProps<Id extends string> = {
  items: readonly MeewavPillarTabItem<Id>[];
  activeId: string;
  ariaLabel: string;
  onSelect: (id: Id) => void;
  className?: string;
};

export default function MeewavPillarTabs<Id extends string>({
  items,
  activeId,
  ariaLabel,
  onSelect,
  className,
}: MeewavPillarTabsProps<Id>) {
  const navigationRef = useRef<HTMLElement>(null);
  const activeIndex = items.findIndex((item) => item.id === activeId);
  const activeAccent = activeIndex >= 0
    ? resolveMeewavPillarAccent(items[activeIndex])
    : undefined;
  const [indicatorPosition, setIndicatorPosition] = useState({ left: 0, top: 0, width: 0 });
  useLayoutEffect(() => {
    const navigation = navigationRef.current;
    const activeTab = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !activeTab) return;
    let disposed = false;
    const measure = () => {
      if (disposed) return;
      const label = activeTab.querySelector<HTMLElement>("strong");
      const icon = activeTab.querySelector<HTMLElement>(".meewav-pillar-tabs__icon");
      const anchor = label && label.getBoundingClientRect().height > 0 ? label : icon ?? activeTab;
      const navBounds = navigation.getBoundingClientRect();
      const tabBounds = activeTab.getBoundingClientRect();
      const gap = Number.parseFloat(getComputedStyle(navigation).getPropertyValue("--mw-nav-label-gap")) || 6;
      const next = {
        left: tabBounds.left - navBounds.left - navigation.clientLeft + navigation.scrollLeft,
        top: anchor.getBoundingClientRect().bottom - navBounds.top - navigation.clientTop + navigation.scrollTop + gap,
        width: tabBounds.width,
      };
      setIndicatorPosition(previous =>
        previous.left === next.left && previous.top === next.top && previous.width === next.width ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(navigation);
    observer?.observe(activeTab);
    const label = activeTab.querySelector<HTMLElement>("strong");
    if (label) observer?.observe(label);
    void document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => { disposed = true; observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, [activeId, items.length]);
  const indicatorStyle = {
    width: indicatorPosition.width,
    top: indicatorPosition.top,
    transform: `translateX(${indicatorPosition.left}px)`,
    opacity: activeIndex >= 0 && indicatorPosition.width > 0 ? 1 : 0,
    "--meewav-pillar-tab-accent": activeAccent ?? MEEWAV_PILLAR_SEMANTIC_ACCENTS.fallback,
  } as CSSProperties;

  useEffect(() => {
    const navigation = navigationRef.current;
    const activeTab = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !activeTab) return;
    // Scroll only the tab rail. scrollIntoView also scrolls hidden vertical
    // containers, moving the marker and sometimes the whole conversation.
    const left = activeTab.offsetLeft;
    const right = left + activeTab.offsetWidth;
    const visibleLeft = navigation.scrollLeft;
    const visibleRight = visibleLeft + navigation.clientWidth;
    if (left < visibleLeft) navigation.scrollLeft = left;
    else if (right > visibleRight) navigation.scrollLeft = right - navigation.clientWidth;
  }, [activeId]);

  return (
    <nav
      ref={navigationRef}
      className={["meewav-pillar-tabs", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      style={{ "--meewav-pillar-tab-count": items.length } as CSSProperties}
    >
      {items.map((item) => {
        const { id, label, icon: Icon } = item;
        const active = id === activeId;
        const resolvedAccent = resolveMeewavPillarAccent(item);
        return (
          <button
            key={id}
            type="button"
            className={active ? "is-active" : ""}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect(id)}
            style={{ "--meewav-pillar-tab-accent": resolvedAccent } as CSSProperties}
          >
            <span className="meewav-pillar-tabs__icon"><Icon aria-hidden="true" /></span>
            <strong>{label}</strong>
          </button>
        );
      })}
      <span className="meewav-pillar-tabs__indicator" style={indicatorStyle} aria-hidden="true" />
    </nav>
  );
}
