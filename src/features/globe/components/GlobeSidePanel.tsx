import { X } from "lucide-react";

type GlobeSidePanelProps = {
  open: boolean;
  onClose: () => void;
};

export default function GlobeSidePanel({
  open,
  onClose,
}: GlobeSidePanelProps) {
  return (
    <aside className={`globe-side-panel ${open ? "is-open" : ""}`} aria-hidden={!open}>
      <div className="globe-side-panel__header">
        <div>
          <span>Meewav Globe</span>
          <strong>Filtres</strong>
        </div>
        <button type="button" className="map-control-button premium-icon-button" onClick={onClose} aria-label="Fermer les filtres">
          <X size={18} />
        </button>
      </div>

      <p className="globe-side-panel__intro">Les filtres avancés seront ajoutés ici.</p>

      <div className="globe-side-panel__section">
        <span>À venir</span>
        <div className="globe-side-panel__placeholders">
          <span>Disponibilité</span>
          <span>Distance</span>
          <span>Genres</span>
          <span>Activité</span>
        </div>
      </div>
    </aside>
  );
}
