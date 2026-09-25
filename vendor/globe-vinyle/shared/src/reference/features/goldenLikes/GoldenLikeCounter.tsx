import { Star } from "lucide-react";
import "./GoldenLikeCounter.css";

// Rooms counter presentation, read-only for the orbit's demonstration profiles.
export function GoldenLikeCounter({ initialCount }: { initialCount: number; [key: string]: unknown }) {
  const count = Math.max(0, initialCount || 0);
  const formatted = count >= 1_000_000 ? `${(count / 1_000_000).toFixed(1)}M`
    : count >= 1_000 ? `${(count / 1_000).toFixed(1)}K` : String(count);
  const title = `${formatted} Golden Likes reçus`;
  return <div className="mw-golden-like">
    <div className="mw-golden-like__button is-readonly" title={title} aria-label={title} role="status">
      <span className="mw-golden-like__star" aria-hidden="true"><Star size={13} strokeWidth={2.35} fill="currentColor" /></span>
      <span className="mw-golden-like__count">{formatted}</span>
    </div>
  </div>;
}
