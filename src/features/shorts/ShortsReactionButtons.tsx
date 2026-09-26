import type { ReactNode } from "react";
import { Heart, Star } from "lucide-react";
import "./ShortsReactionButtons.css";

export type ShortsReactionButtonsProps = {
  variant: "compact" | "player";
  artistName: string;
  likeCount: number;
  exactLikeCount?: boolean;
  goldenLikeCount: number;
  liked: boolean;
  goldenGiven: boolean;
  goldenUnavailable: boolean;
  readOnly?: boolean;
  ariaLabel?: string;
  onToggleLike?: () => void;
  onGiveGoldenLike?: () => void;
  goldenFeedback?: ReactNode;
  goldenOnly?: boolean;
};

function normalizeCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function compactValue(value: number, divisor: number, suffix: string) {
  const scaled = value / divisor;
  const truncated = scaled < 10
    ? Math.floor(scaled * 10) / 10
    : Math.floor(scaled);
  const displayed = Number.isInteger(truncated)
    ? String(truncated)
    : truncated.toFixed(1).replace(".", ",");
  return `${displayed} ${suffix}`;
}

// Exported alongside the component so its abbreviated output can be unit-tested.
// eslint-disable-next-line react-refresh/only-export-components
export function formatShortsCount(value: number) {
  const normalized = normalizeCount(value);
  if (normalized >= 1_000_000_000) {
    return compactValue(normalized, 1_000_000_000, "Md");
  }
  if (normalized >= 1_000_000) {
    return compactValue(normalized, 1_000_000, "M");
  }
  if (normalized >= 1_000) {
    return compactValue(normalized, 1_000, "k");
  }
  return String(normalized);
}

function formatFullCount(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  }).format(normalizeCount(value));
}

function likeCountLabel(value: number) {
  const normalized = normalizeCount(value);
  return `${formatFullCount(normalized)} ${normalized > 1 ? "Likes" : "Like"}`;
}

function goldenLikeCountLabel(value: number) {
  const normalized = normalizeCount(value);
  return `${formatFullCount(normalized)} Golden Like${normalized > 1 ? "s" : ""} reçu${normalized > 1 ? "s" : ""}`;
}

export function ShortsReactionButtons({
  variant,
  artistName,
  likeCount,
  exactLikeCount = false,
  goldenLikeCount,
  liked,
  goldenGiven,
  goldenUnavailable,
  readOnly = false,
  ariaLabel,
  onToggleLike,
  onGiveGoldenLike,
  goldenFeedback,
  goldenOnly = false,
}: ShortsReactionButtonsProps) {
  const likeLabel = liked
    ? `Retirer mon Like de la vidéo de ${artistName}, ${likeCountLabel(likeCount)}`
    : `Aimer la vidéo de ${artistName}, ${likeCountLabel(likeCount)}`;
  const goldenCountLabel = goldenLikeCountLabel(goldenLikeCount);
  const goldenCountSuffix = goldenOnly ? "" : `, ${goldenCountLabel}`;
  const goldenLabel = goldenGiven
    ? `Golden Like déjà offert à ${artistName}${goldenCountSuffix}`
    : goldenUnavailable
      ? `Golden Like indisponible aujourd’hui pour ${artistName}${goldenCountSuffix}`
      : `Offrir un Golden Like à ${artistName}${goldenCountSuffix}`;
  const likeContent = (
    <>
      <span className="shorts-reaction__icon" aria-hidden="true">
        <Heart fill={liked ? "currentColor" : "none"} />
      </span>
      {variant === "player" ? <span className="shorts-reaction__label" aria-hidden="true">{liked ? "Aimé" : "J’aime"}</span> : null}
      <span className="shorts-reaction__count" aria-hidden="true">{exactLikeCount ? formatFullCount(likeCount) : formatShortsCount(likeCount)}</span>
    </>
  );
  const goldenContent = (
    <>
      <span className="shorts-reaction__icon" aria-hidden="true">
        <Star fill={goldenGiven ? "currentColor" : "none"} />
      </span>
      {variant === "player" ? <span className="shorts-reaction__label" aria-hidden="true">Golden Like</span> : null}
      {!goldenOnly ? <span className="shorts-reaction__count" aria-hidden="true">{formatShortsCount(goldenLikeCount)}</span> : null}
    </>
  );

  return (
    <div
      className={`shorts-reactions shorts-reactions--${variant}`}
      aria-label={ariaLabel || `Réactions pour la vidéo de ${artistName}`}
      role="group"
    >
      {!goldenOnly && (readOnly ? (
        <span className={`shorts-reaction shorts-reaction--like is-readonly${liked ? " is-active" : ""}`} aria-label={likeCountLabel(likeCount)} title={likeCountLabel(likeCount)} role="status">{likeContent}</span>
      ) : (
        <button type="button" className={`shorts-reaction shorts-reaction--like${liked ? " is-active" : ""}`} aria-label={likeLabel} aria-pressed={liked} title={likeLabel} onClick={() => onToggleLike?.()}>{likeContent}</button>
      ))}

      {readOnly ? (
        <span className="shorts-reaction shorts-reaction--golden is-readonly" aria-label={goldenOnly ? `Golden Like pour ${artistName}` : goldenCountLabel} title={goldenOnly ? `Golden Like pour ${artistName}` : goldenCountLabel} role="status">{goldenContent}</span>
      ) : (
        <button type="button" className={["shorts-reaction", "shorts-reaction--golden", goldenGiven ? "is-active is-given" : ""].filter(Boolean).join(" ")} aria-label={goldenLabel} aria-pressed={goldenGiven} disabled={goldenUnavailable} title={goldenLabel} onClick={() => { if (!goldenGiven) onGiveGoldenLike?.(); }}>{goldenContent}{goldenFeedback}</button>
      )}
    </div>
  );
}

export default ShortsReactionButtons;
