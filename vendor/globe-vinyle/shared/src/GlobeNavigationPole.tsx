import React from "react";
import type { CSSProperties } from "react";
import { Box, Mail, Play, Rocket, Store, UserRound } from "lucide-react";
import NavGlobeTexture from "./reference/features/globe/components/NavGlobeTexture";
import { NAVBAR_GLOBE_PALETTE } from "./globe-palette.mjs";
import "./reference/features/globe/components/MeewavPrimaryNav.css";
import "./reference/features/globe/components/MeewavPrimaryNav.glass.css";

// RoomsPage uses this glass material, these Lucide icons and NavGlobeTexture.
// Keep only its destinations and soft globe depression, without the L-shaped header.
const destinations = [
  { id: "messages", label: "Messagerie", icon: Mail, path: "/messages", accent: "#19B8FF" },
  { id: "rooms", label: "Rooms", icon: Box, path: "/rooms/home", accent: "#FF7A18" },
  { id: "shorts", label: "La Scène", icon: Play, path: "/scene", accent: "#FF3DF2" },
  { id: "market", label: "Marketplace", icon: Store, path: "/market", accent: "#FFE45E" },
  { id: "tremplin", label: "Tremplin", icon: Rocket, path: "/tremplin", accent: "#39FF88" },
  { id: "profile", label: "Profil", icon: UserRound, path: "/profile", accent: "#FFFFFF" },
];

export default function GlobeNavigationPole({ onGlobe, onNavigate }: {
  onGlobe: () => void;
  onNavigate: (path: string) => void;
}) {
  const renderDestination = ({ id, label, icon: Icon, path, accent }: typeof destinations[number]) => (
    <button key={id} type="button" className={`meewav-primary-nav__item is-${id}`}
      aria-label={label} title={label} onClick={() => onNavigate(path)}
      style={{ "--accent": accent } as CSSProperties}>
      <Icon aria-hidden="true" />
      <span className="meewav-primary-nav__material-glint" aria-hidden="true" />
    </button>
  );
  return <nav className="meewav-primary-nav is-glass-chassis globe-navigation-pole" aria-label="Navigation principale MeeWav">
    <button type="button" className="meewav-primary-nav__item is-map is-active" onClick={onGlobe}
      aria-label="Globe / Carte" title="Globe / Carte" aria-current="page">
      <span className="meewav-primary-nav__globe" aria-hidden="true"
        style={{ "--nav-globe-ocean": NAVBAR_GLOBE_PALETTE.ocean } as CSSProperties}>
        <NavGlobeTexture landColor={NAVBAR_GLOBE_PALETTE.land} />
        <span className="meewav-primary-nav__globe-light" />
      </span>
    </button>
    <div className="meewav-primary-nav__pillars" role="group" aria-label="Piliers MeeWav">
      {destinations.slice(0, -1).map(renderDestination)}
    </div>
    <div className="meewav-primary-nav__account" role="group" aria-label="Compte MeeWav">
      {renderDestination(destinations[destinations.length - 1])}
    </div>
  </nav>;
}
