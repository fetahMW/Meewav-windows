import { ExternalLink } from "lucide-react";
import type { GlobeItem } from "../types/globe.types";

type GlobePopupProps = {
  item: GlobeItem | null;
  onClose: () => void;
};

export default function GlobePopup({ item, onClose }: GlobePopupProps) {
  if (!item) return null;

  if (item.type === "cluster") {
    return (
      <aside className="globe-popup" aria-label="Cluster Globe">
        <button className="globe-popup__close" type="button" onClick={onClose} aria-label="Fermer">×</button>
        <div className="globe-popup__cluster-count">{item.count}</div>
        <div>
          <p className="globe-popup__eyebrow">Cluster Meewav</p>
          <h2>{item.count} profils dans cette zone</h2>
          <p>Zoome pour afficher les avatars individuels et ouvrir les profils.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="globe-popup" aria-label={`Profil ${item.name}`}>
      <button className="globe-popup__close" type="button" onClick={onClose} aria-label="Fermer">×</button>
      <img className="globe-popup__avatar" src={item.avatarUrl} alt="" />
      <div className="globe-popup__content">
        <p className="globe-popup__eyebrow">{item.city || item.type}</p>
        <h2>{item.name}</h2>
        <p>{item.role || item.type}</p>
        <div className="globe-popup__badges">
          {item.isOnline && <span>Online</span>}
        </div>
        <button type="button" className="globe-popup__profile-button">
          Ouvrir profil <ExternalLink size={15} />
        </button>
      </div>
    </aside>
  );
}
