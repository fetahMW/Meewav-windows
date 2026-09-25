import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { RoomsHomeCollectionDefinition, RoomsHomeRoom } from "./roomsHome.types";
import { RoomCard } from "./RoomCard";
import "./rooms-home-components.css";
import "../../../components/shared/rail/rail-edge-navigation.css";

const RAIL_END_TOLERANCE = 3;

export interface RoomRailProps {
  collection: RoomsHomeCollectionDefinition;
  title: string;
  items: RoomsHomeRoom[];
  featured?: boolean;
  initialScrollLeft?: number;
  onScrollPosition?: (collection: RoomsHomeCollectionDefinition, scrollLeft: number) => void;
  onOpen: (room: RoomsHomeRoom) => void;
  onSeeMore: (collection: RoomsHomeCollectionDefinition) => void;
}

function prefersReducedMotion() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function safeRailId(slug: string) {
  return `rooms-home-rail-${slug.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function RoomRail({
  collection,
  title,
  items,
  featured = false,
  initialScrollLeft = 0,
  onScrollPosition,
  onOpen,
  onSeeMore,
}: RoomRailProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [canGoBackward, setCanGoBackward] = useState(false);
  const [canGoForward, setCanGoForward] = useState(items.length > 1);
  const [progress, setProgress] = useState(0);
  const railId = safeRailId(collection.slug);
  const titleId = `${railId}-title`;

  const measure = useCallback((reportPosition = false) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
    const position = Math.min(maximum, Math.max(0, viewport.scrollLeft));
    setCanGoBackward(position > RAIL_END_TOLERANCE);
    setCanGoForward(position < maximum - RAIL_END_TOLERANCE);
    setProgress(maximum > 0 ? position / maximum : 1);
    if (reportPosition) onScrollPosition?.(collection, position);
  }, [collection, onScrollPosition]);

  const scheduleMeasure = useCallback((reportPosition = false) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measure(reportPosition);
    });
  }, [measure]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const restoreFrame = window.requestAnimationFrame(() => {
      const maximum = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      viewport.scrollLeft = Math.min(maximum, Math.max(0, initialScrollLeft));
      measure();
    });

    const handleResize = () => scheduleMeasure();
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(handleResize)
      : null;
    resizeObserver?.observe(viewport);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [collection.slug, initialScrollLeft, items.length, measure, scheduleMeasure]);

  const cardStride = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return 0;
    const cards = viewport.querySelectorAll<HTMLElement>(".rooms-home-card");
    if (cards.length > 1) {
      const first = cards[0].getBoundingClientRect();
      const second = cards[1].getBoundingClientRect();
      const stride = Math.abs(second.left - first.left);
      if (stride > 0) return stride;
    }
    return Math.max(240, viewport.clientWidth * 0.82);
  }, []);

  const scrollByCards = useCallback((direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const stride = cardStride();
    const visibleCardCount = Math.max(1, Math.floor(viewport.clientWidth / Math.max(1, stride)));
    viewport.scrollBy({
      left: direction * stride * visibleCardCount,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [cardStride]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      scrollByCards(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      viewport.scrollTo({
        left: event.key === "Home" ? 0 : viewport.scrollWidth - viewport.clientWidth,
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  };

  const progressStyle = { "--rooms-home-rail-progress": progress } as CSSProperties;

  return (
    <section
      className={[
        "rooms-home-rail",
        featured ? "rooms-home-rail--featured" : "",
        canGoBackward ? "can-go-backward" : "is-at-start",
        canGoForward ? "can-go-forward" : "is-at-end",
      ].join(" ")}
      aria-labelledby={titleId}
      style={progressStyle}
    >
      <header className="rooms-home-rail__header">
        <h2 id={titleId}>{title}</h2>
        <div className="rooms-home-rail__header-actions">
          <button
            type="button"
            className="rooms-home-rail__more"
            onClick={() => onSeeMore(collection)}
            aria-label={`Voir toute la collection ${title}`}
          >
            <span>Voir plus</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="rooms-home-rail__viewport-shell">
        {items.length > 0 ? (
          <div
            id={railId}
            ref={viewportRef}
            className="rooms-home-rail__viewport"
            tabIndex={0}
            role="region"
            aria-label={`${title}, ${items.length} Rooms`}
            onScroll={() => scheduleMeasure(true)}
            onKeyDown={handleKeyDown}
          >
            {items.map((room, index) => (
              <RoomCard
                key={room.id}
                room={room}
                featured={featured}
                priority={featured && index < 2}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <div className="rooms-home-rail__empty" role="status">
            <strong>Aucune Room dans ce format</strong>
            <span>Choisis un autre format pour découvrir les Rooms disponibles.</span>
          </div>
        )}
        {items.length > 0 ? (
          <div className="rooms-home-rail__edge-navigation meewav-rail-surface" role="group" aria-label={`Naviguer dans ${title}`}>
            <button
              type="button"
              className="rooms-home-rail__edge-button rooms-home-rail__edge-button--previous meewav-rail-edge meewav-rail-edge--previous"
              onClick={() => scrollByCards(-1)}
              disabled={!canGoBackward}
              aria-controls={railId}
              aria-label={`Voir les Rooms précédentes dans ${title}`}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="rooms-home-rail__edge-button rooms-home-rail__edge-button--next meewav-rail-edge meewav-rail-edge--next"
              onClick={() => scrollByCards(1)}
              disabled={!canGoForward}
              aria-controls={railId}
              aria-label={`Voir les Rooms suivantes dans ${title}`}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      {items.length > 0 ? (
        <span className="rooms-home-rail__position" aria-hidden="true">
          <span />
        </span>
      ) : null}
    </section>
  );
}

export default RoomRail;
