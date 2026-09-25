import {
  Building2,
  CalendarDays,
  Compass,
  DoorOpen,
  LocateFixed,
  Menu,
  Minus,
  Plus,
  Route,
  Search,
  UserRound,
  Users,
  X,
} from "lucide-react";
import type { Map } from "maplibre-gl";
import type { GlobeFilters, GlobePointType } from "../types/globe.types";

const CATEGORY_CHIPS: Array<{ id: GlobePointType; label: string; icon: typeof Users }> = [
  { id: "artist", label: "Artistes", icon: Users },
  { id: "studio", label: "Studios", icon: Building2 },
  { id: "event", label: "Events", icon: CalendarDays },
  { id: "room", label: "Rooms", icon: DoorOpen },
  { id: "user", label: "Membres", icon: UserRound },
];

type GlobeControlsProps = {
  map: Map | null;
  filters: GlobeFilters;
  filtersPanelOpen: boolean;
  streetModeEnabled: boolean;
  streetModeActive: boolean;
  onRecenter: () => void;
  onResetNorth: () => void;
  onTogglePerspective: () => void;
  onToggleStreetMode: () => void;
  onToggleFiltersPanel: () => void;
  onSearch: (value: string) => void;
  onToggleType: (type: GlobePointType) => void;
};

export default function GlobeControls({
  map,
  filters,
  filtersPanelOpen,
  streetModeEnabled,
  streetModeActive,
  onRecenter,
  onResetNorth,
  onTogglePerspective,
  onToggleStreetMode,
  onToggleFiltersPanel,
  onSearch,
  onToggleType,
}: GlobeControlsProps) {
  return (
    <>
      <div className="globe-search-hub" aria-label="Recherche Globe">
        <label className="globe-search compact-search premium-search">
          <Search size={17} />
          <input
            type="search"
            value={filters.search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Ville, artiste, rôle"
          />
        </label>
        <div className="globe-category-chips" aria-label="Catégories Globe">
          {CATEGORY_CHIPS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`control-chip premium-chip ${!filters.types.includes(item.id) ? "premium-button-active is-active" : ""}`}
                onClick={() => onToggleType(item.id)}
              >
                <Icon size={14} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        className={`globe-burger-button map-control-button premium-icon-button ${filtersPanelOpen ? "is-active" : ""}`}
        type="button"
        onClick={onToggleFiltersPanel}
        aria-label={filtersPanelOpen ? "Fermer les filtres" : "Ouvrir les filtres"}
        aria-expanded={filtersPanelOpen}
      >
        {filtersPanelOpen ? <X size={18} /> : <Menu size={18} />}
      </button>

      <div className="globe-zoom-controls map-control-stack" aria-label="Contrôles de carte">
        <button className="map-control-button premium-icon-button" type="button" onClick={onRecenter} aria-label="Me recentrer">
          <LocateFixed size={18} />
        </button>
        <div className="globe-zoom-controls__group">
          <button className="map-control-button premium-icon-button" type="button" onClick={() => map?.zoomIn()} aria-label="Zoomer">
            <Plus size={18} />
          </button>
          <button className="map-control-button premium-icon-button" type="button" onClick={() => map?.zoomOut()} aria-label="Dézoomer">
            <Minus size={18} />
          </button>
        </div>
        <button className="map-control-button premium-icon-button" type="button" onClick={onResetNorth} aria-label="Remettre le nord">
          <Compass size={18} />
        </button>
        <button className="map-control-button premium-icon-button globe-perspective-button" type="button" onClick={onTogglePerspective} aria-label="Basculer la vue 3D">
          3D
        </button>
        {streetModeEnabled && (
          <button
            className={`map-control-button premium-icon-button globe-street-button ${streetModeActive ? "is-active" : ""}`}
            type="button"
            onClick={onToggleStreetMode}
            aria-label={streetModeActive ? "Quitter Street Mode" : "Activer Street Mode"}
          >
            <Route size={18} />
          </button>
        )}
      </div>
    </>
  );
}
