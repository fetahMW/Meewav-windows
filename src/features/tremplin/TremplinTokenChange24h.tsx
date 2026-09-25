type TremplinTokenChange24hProps = {
  value: number | null;
  className?: string;
};

export default function TremplinTokenChange24h({
  value,
  className = "",
}: TremplinTokenChange24hProps) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`tremplin-token-change24h is-unavailable ${className}`.trim()}>24 h · Donnée indisponible</span>;
  }

  const direction = value > 0 ? "up" : value < 0 ? "down" : "flat";
  const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "→";
  const formatted = `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString("fr-FR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
  const directionLabel = direction === "up" ? "hausse" : direction === "down" ? "baisse" : "stable";

  return (
    <span
      className={`tremplin-token-change24h is-${direction} ${className}`.trim()}
      aria-label={`Variation sur 24 heures : ${directionLabel}, ${formatted}`}
    >
      <span>24 h</span>
      <span aria-hidden="true">{arrow}</span>
      <strong>{formatted}</strong>
    </span>
  );
}
