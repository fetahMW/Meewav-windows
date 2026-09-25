import { useRef, type ReactNode } from "react";
import RailEdgeNavigation from "../../components/shared/rail/RailEdgeNavigation";

export default function SceneBrowseChips({ children }: { children: ReactNode }) {
  const track = useRef<HTMLElement>(null);
  const scroll = (direction: number) => track.current?.scrollBy({
    left: direction * track.current.clientWidth * .7,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  });
  return <div className="scene-browse-chips-shell">
    <nav className="scene-browse-chips" id="scene-browse-chips" ref={track} aria-label="Catégories vidéo">{children}</nav>
    <RailEdgeNavigation title="les catégories vidéo" viewportId="scene-browse-chips" disabled={false} onPrevious={() => scroll(-1)} onNext={() => scroll(1)} />
  </div>;
}
