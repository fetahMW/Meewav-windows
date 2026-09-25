import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import type { ShortsVideoItem } from "../shorts/shorts-wall-data";
import { useSceneListWindow } from "./watch/useSceneListWindow";

export default function SceneHomeFeed({ videos, shorts, renderVideo, renderShort }: {
  videos: ShortsVideoItem[];
  shorts: ShortsVideoItem[];
  renderVideo: (item: ShortsVideoItem) => ReactNode;
  renderShort: (item: ShortsVideoItem) => ReactNode;
}) {
  const [count, setCount] = useSceneListWindow("scene-home-grid", 24);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || count >= videos.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setCount((value) => Math.min(value + 24, videos.length));
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, videos.length, setCount]);
  return <section className="scene-home-feed" aria-label="Vidéos recommandées">
    <h1 className="sr-only">Accueil de La Scène</h1>
    <div className="scene-home-feed__grid">{videos.slice(0, 3).map(renderVideo)}</div>
    {shorts.length > 0 && <section className="scene-home-feed__shorts" aria-label="Shorts">
      <header><h2><Play aria-hidden="true" /> Shorts</h2><Link to="/scene/explore?media=vertical">Tout voir</Link></header>
      <div className="scene-home-feed__shorts-track">{shorts.slice(0, 8).map(renderShort)}</div>
    </section>}
    <div className="scene-home-feed__grid">{videos.slice(3, count).map(renderVideo)}</div>
    <div ref={sentinel} className="scene-home-feed__more">
      {count < videos.length && <button onClick={() => setCount((value) => Math.min(value + 24, videos.length))}>Afficher plus de vidéos</button>}
    </div>
  </section>;
}
