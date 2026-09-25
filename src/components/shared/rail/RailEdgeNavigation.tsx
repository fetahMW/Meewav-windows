import { ChevronLeft, ChevronRight } from "lucide-react";
import "./rail-edge-navigation.css";

export default function RailEdgeNavigation({ title, viewportId, disabled, onPrevious, onNext, legacyPrefix }: {
  title: string;
  viewportId: string;
  disabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  legacyPrefix?: string;
}) {
  return <div className={`meewav-rail-edges ${legacyPrefix ? `${legacyPrefix}__edge-navigation` : ""}`} role="group" aria-label={`Naviguer dans ${title}`}>
    {(["previous", "next"] as const).map((direction) => <button key={direction} type="button"
      className={`meewav-rail-edge meewav-rail-edge--${direction} ${legacyPrefix ? `${legacyPrefix}__edge-button ${legacyPrefix}__edge-button--${direction}` : ""}`}
      disabled={disabled} aria-controls={viewportId} aria-label={`${direction === "previous" ? "Éléments précédents" : "Éléments suivants"} : ${title}`}
      onClick={direction === "previous" ? onPrevious : onNext}>
      {direction === "previous" ? <ChevronLeft aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </button>)}
  </div>;
}
