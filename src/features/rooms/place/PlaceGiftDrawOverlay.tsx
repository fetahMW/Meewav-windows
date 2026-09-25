import { useEffect, useState } from "react";
import { Gift, Sparkles, Trophy } from "lucide-react";
import type { RoomGiftDraw } from "./place.types";
import "./place-gift-draw-overlay.css";

type PlaceGiftDrawOverlayProps = {
  draw: RoomGiftDraw | null;
};

const RESULT_VISIBLE_MS = 12_000;

function timestamp(value: string | null) {
  if (!value) return Number.NaN;
  return new Date(value).getTime();
}

export default function PlaceGiftDrawOverlay({ draw }: PlaceGiftDrawOverlayProps) {
  const [now, setNow] = useState(() => Date.now());
  const [resultHidden, setResultHidden] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    setResultHidden(false);
  }, [draw?.id]);

  useEffect(() => {
    if (!draw || draw.status !== "spinning") return;
    const timer = window.setInterval(() => setNow(Date.now()), 160);
    return () => window.clearInterval(timer);
  }, [draw?.id, draw?.status]);

  useEffect(() => {
    if (!draw || draw.status !== "revealed" || !draw.winner) {
      setResultHidden(false);
      return;
    }
    // `revealAt` is the planned deadline, not the instant at which this client
    // actually received the public winner. A delayed RPC/Realtime event used
    // to consume part (or all) of the 12-second result window before paint.
    // Every connected client now gets the complete window from observation.
    setResultHidden(false);
    const timer = window.setTimeout(() => setResultHidden(true), RESULT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [draw?.id, draw?.status, draw?.winner?.key]);

  if (!draw || (draw.status !== "spinning" && draw.status !== "revealed")) return null;

  const revealAt = timestamp(draw.revealAt);
  if (draw.status === "revealed" && resultHidden) return null;

  const secondsRemaining = Number.isFinite(revealAt)
    ? Math.max(0, Math.ceil((revealAt - now) / 1_000))
    : 0;
  const isRevealed = draw.status === "revealed" && Boolean(draw.winner);

  return (
    <aside
      className={`place-gift-draw-overlay${isRevealed ? " is-revealed" : " is-spinning"}`}
      aria-live={isRevealed ? "assertive" : "off"}
      aria-atomic="true"
      data-testid="place-gift-draw-overlay"
    >
      <span className="place-gift-draw-overlay__aura" aria-hidden="true"><i /><i /><i /></span>
      <header>
        <span className="place-gift-draw-overlay__gift-icon"><Gift aria-hidden="true" /></span>
        <span><small>TIRAGE AU SORT · CADEAU</small><strong>{draw.giftLabel}</strong></span>
      </header>

      {isRevealed && draw.winner ? (
        <div className="place-gift-draw-overlay__winner">
          <span className="place-gift-draw-overlay__trophy"><Trophy aria-hidden="true" /></span>
          {draw.winner.avatarUrl ? <img src={draw.winner.avatarUrl} alt="" /> : <span className="place-gift-draw-overlay__avatar-fallback" aria-hidden="true">{draw.winner.displayName.slice(0, 1)}</span>}
          <span><small>LE CADEAU EST POUR</small><strong>{draw.winner.displayName}</strong></span>
          <Sparkles aria-hidden="true" />
        </div>
      ) : (
        <div className="place-gift-draw-overlay__drawing">
          <span className="place-gift-draw-overlay__countdown" aria-label={`${secondsRemaining} secondes`}>{secondsRemaining}</span>
          <span><strong>Le hasard choisit…</strong><small>{draw.eligibleCount.toLocaleString("fr-FR")} personnes participent</small></span>
        </div>
      )}
    </aside>
  );
}
