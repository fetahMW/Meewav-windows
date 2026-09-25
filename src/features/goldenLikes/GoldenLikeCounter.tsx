import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { giveGoldenLike } from "./goldenLikeApi";
import "./GoldenLikeCounter.css";

type GoldenLikeCounterProps = {
  artistId: string;
  initialCount: number;
  interactive?: boolean;
  lockedOpen?: boolean;
  initialGivenToday?: boolean;
  onCountChange?: (count: number) => void;
  onNeedAuth?: () => void;
};

function formatCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function GoldenLikeCounter({
  artistId,
  initialCount,
  interactive = true,
  lockedOpen = false,
  initialGivenToday = false,
  onCountChange,
  onNeedAuth,
}: GoldenLikeCounterProps) {
  const [count, setCount] = useState(initialCount ?? 0);
  const [givenToday, setGivenToday] = useState(initialGivenToday);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const formattedCount = useMemo(() => formatCount(count), [count]);

  useEffect(() => {
    setCount(initialCount ?? 0);
    setGivenToday(initialGivenToday);
    setConfirmOpen(false);
  }, [initialCount, initialGivenToday, artistId]);

  const handleClick = () => {
    if (!interactive || !lockedOpen || givenToday) return;
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const result = await giveGoldenLike(artistId);

      if (result.ok && typeof result.goldenLikesCount === "number") {
        setCount(result.goldenLikesCount);
        onCountChange?.(result.goldenLikesCount);
        setGivenToday(true);
      } else {
        if (result.reason === "not_authenticated") {
          onNeedAuth?.();
        }
        if (result.reason === "already_used_today") {
          setGivenToday(true);
        }
      }

      setConfirmOpen(false);
    } catch (error) {
      void error;
    } finally {
      setLoading(false);
    }
  };

  const canGiveGoldenLike = interactive && lockedOpen && !givenToday;
  const counterClassName = [
    "mw-golden-like__button",
    canGiveGoldenLike ? "is-available" : "",
    givenToday ? "is-given" : "",
    !canGiveGoldenLike ? "is-readonly" : "",
  ].join(" ");
  const counterTitle = `${formattedCount} Golden Likes reçus`;
  const counterContent = (
    <>
      <span className="mw-golden-like__star" aria-hidden="true">
        <Star size={13} strokeWidth={2.35} fill="currentColor" />
      </span>
      <span className="mw-golden-like__count">{formattedCount}</span>
    </>
  );

  return (
    <div className="mw-golden-like">
      {canGiveGoldenLike ? (
        <button
          type="button"
          className={counterClassName}
          onClick={handleClick}
          title={counterTitle}
          aria-label={counterTitle}
        >
          {counterContent}
        </button>
      ) : (
        <div
          className={counterClassName}
          title={counterTitle}
          aria-label={counterTitle}
          role="status"
        >
          {counterContent}
        </div>
      )}

      {confirmOpen && (
        <div className="mw-golden-like__confirm" role="dialog" aria-label="Golden Like">
          <strong>Offrir ton Golden Like du jour ?</strong>
          <p>Un Golden Like est rare. Tu n'en as qu'un par jour.</p>

          <div className="mw-golden-like__confirm-actions">
            <button type="button" onClick={() => setConfirmOpen(false)} disabled={loading}>
              Annuler
            </button>
            <button type="button" className="primary" onClick={handleConfirm} disabled={loading}>
              {loading ? "Envoi..." : "Offrir"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
