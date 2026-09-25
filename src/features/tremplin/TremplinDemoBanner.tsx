import { FlaskConical } from "lucide-react";
import { TREMPLIN_COPY } from "./tremplinCopy";
import { TREMPLIN_FEATURE_FLAGS } from "./tremplinFeatureFlags";

export default function TremplinDemoBanner({ compact = false, context = "transaction" }: { compact?: boolean; context?: "transaction" | "application" | "fixtures" }) {
  if (!TREMPLIN_FEATURE_FLAGS.demoMode) return null;
  const title = context === "application"
    ? "Mode démonstration — aucune demande réelle n’est envoyée."
    : context === "fixtures"
      ? "Mode démonstration — les profils et contenus affichés sont fictifs."
      : TREMPLIN_COPY.demoMode;
  const detail = context === "application"
    ? "Le brouillon reste local à cette démonstration et aucune équipe n’est réellement sollicitée."
    : context === "fixtures"
      ? "Les sélections servent à valider l’expérience et ne constituent pas une recommandation réelle."
      : "Les montants et répartitions affichés sont des exemples configurables, pas le modèle économique définitif.";
  return (
    <aside className={`tremplin-demo-banner${compact ? " is-compact" : ""}`} role="note">
      <FlaskConical aria-hidden="true" />
      <span><strong>{title}</strong>{compact ? null : <small>{detail}</small>}</span>
    </aside>
  );
}
