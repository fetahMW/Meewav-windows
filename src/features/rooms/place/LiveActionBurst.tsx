import { Star } from "lucide-react";
import { formatSupportAmount } from "./roomSupport";
import "./live-action-burst.css";

export default function LiveActionBurst({ kind, cents }: { kind: "support" | "golden"; cents?: number }) {
  return <span className={`live-action-burst live-action-burst--${kind}`} aria-hidden="true">
    <span className="live-action-burst__halo" />
    {[0, 1, 2, 3, 4].map((index) => <span className={`live-action-burst__particle live-action-burst__particle--${index}`} key={index}>{kind === "golden" ? <Star fill="currentColor" /> : "€"}</span>)}
    <span className="live-action-burst__label">{kind === "golden" ? "Golden Like offert" : `+ ${formatSupportAmount(cents ?? 0)}`}</span>
  </span>;
}
