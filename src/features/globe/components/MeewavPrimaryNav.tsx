import {
  Box,
  Globe2,
  Mail,
  Play,
  Rocket,
  Store,
  UserRound
} from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEventHandler } from "react";
import type { LucideIcon } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { SCENE_NAME, SCENE_ROUTE } from "../../shorts/sceneContract";
import { resolvePrimaryChromeTopbarHeight } from "./primaryChromeGeometry";
import "./MeewavPrimaryNav.css";
import "./MeewavPrimaryNav.glass.css";
import NavGlobeTexture from "./NavGlobeTexture";

export type MeewavNavView = "position" | "city" | "country" | "globe";

export type PrimaryDestinationId = "map" | "messages" | "rooms" | "profile" | "shorts" | "market" | "tremplin";

type PrimaryDestination = {
  id: PrimaryDestinationId;
  label: string;
  icon: LucideIcon;
  accent: string;
  glow: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

type MeewavPrimaryNavProps = {
  activeView: MeewavNavView;
  activeDestination?: PrimaryDestinationId;
  onGlobe: MouseEventHandler<HTMLButtonElement>;
  onMessages?: MouseEventHandler<HTMLButtonElement>;
};

type PrimaryChromeFrame = {
  height: number;
  railWidth: number;
  topbarHeight: number;
  width: number;
};

export function getPrimaryDestinationFromPathname(pathname: string): PrimaryDestinationId | undefined {
  const [firstSegment = ""] = pathname.toLocaleLowerCase("fr-FR").split("/").filter(Boolean);

  if (firstSegment === "messages" || firstSegment === "messagerie") return "messages";
  if (firstSegment === "profile" || firstSegment === "profil") return "profile";
  if (firstSegment === "market") return "market";
  if (firstSegment === "tremplin") return "tremplin";
  if (firstSegment === "scene" || firstSegment === "shorts") return "shorts";
  if (firstSegment === "rooms" || firstSegment === "room") return "rooms";
  return undefined;
}

export default function MeewavPrimaryNav({
  activeView,
  activeDestination = "map",
  onGlobe,
  onMessages,
}: MeewavPrimaryNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const [chromeFrame, setChromeFrame] = useState<PrimaryChromeFrame | null>(() => {
    if (typeof window === "undefined") return null;
    return {
      height: window.innerHeight,
      railWidth: Math.min(80, Math.max(68, window.innerWidth * 0.04)),
      topbarHeight: Math.min(68, Math.max(62, window.innerHeight * 0.062)),
      width: window.innerWidth,
    };
  });
  const navigate = useNavigate();
  const location = useLocation();
  const glassChromeId = useId();
  // Le châssis validé sur l’accueil Rooms est désormais le bandeau unique de
  // l’infrastructure : toutes les features partagent exactement sa pièce,
  // sa courbe et ses reflets au lieu de maintenir des variantes divergentes.
  const isRoomsLandingChrome = true;
  const routeDestination = getPrimaryDestinationFromPathname(location.pathname);
  // Only the app destinations opt in; Globe routes retain their approved chrome.
  const hasGlassChrome = routeDestination !== undefined;
  const pillarDestinations: PrimaryDestination[] = [
    { id: "map", label: "Globe / Carte", icon: Globe2, accent: "#63B3FF", glow: "rgba(99, 179, 255, 0.42)", onClick: onGlobe },
    { id: "messages", label: "Messagerie", icon: Mail, accent: "#19B8FF", glow: "rgba(25, 184, 255, 0.42)", onClick: onMessages ?? (() => navigate("/messages")) },
    { id: "rooms", label: "Rooms", icon: Box, accent: "#FF7A18", glow: "rgba(255, 122, 24, 0.42)", onClick: () => navigate("/rooms/home") },
    { id: "shorts", label: SCENE_NAME, icon: Play, accent: "#FF3DF2", glow: "rgba(255, 61, 242, 0.38)", onClick: () => navigate(SCENE_ROUTE) },
    {
      id: "market",
      label: "Marketplace",
      icon: Store,
      accent: "#FFE45E",
      glow: "rgba(255, 228, 94, 0.42)",
      onClick: () => navigate("/market"),
    },
    {
      id: "tremplin",
      label: "Tremplin",
      icon: Rocket,
      accent: "#39FF88",
      glow: "rgba(57, 255, 136, 0.42)",
      onClick: () => navigate("/tremplin"),
    }
  ];
  const profileDestination: PrimaryDestination = {
    id: "profile",
    label: "Profil",
    icon: UserRound,
    accent: "#FFFFFF",
    glow: "rgba(255, 255, 255, 0.38)",
    onClick: () => navigate("/profile"),
  };
  const resolvedActiveDestination = routeDestination ?? activeDestination;

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof window === "undefined") return undefined;

    const measureCssLength = (property: string) => {
      const probe = document.createElement("span");
      probe.style.cssText = `position:fixed;visibility:hidden;pointer-events:none;height:var(${property});`;
      nav.appendChild(probe);
      const value = probe.getBoundingClientRect().height;
      probe.remove();
      return value;
    };

    const syncFrame = () => {
      const railRect = nav.parentElement?.getBoundingClientRect();
      if (!railRect || railRect.width <= 0) return;
      const configuredTopbarHeight = measureCssLength("--mw-l-chassis-topbar-height");
      const topbarHeight = resolvePrimaryChromeTopbarHeight(configuredTopbarHeight, railRect.top);
      if (topbarHeight <= 0) return;

      const nextFrame = {
        height: window.innerHeight,
        railWidth: railRect.width,
        topbarHeight,
        width: window.innerWidth,
      };
      setChromeFrame((current) => (
        current &&
        current.height === nextFrame.height &&
        current.railWidth === nextFrame.railWidth &&
        current.topbarHeight === nextFrame.topbarHeight &&
        current.width === nextFrame.width
          ? current
          : nextFrame
      ));
    };

    syncFrame();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncFrame) : null;
    if (nav.parentElement) resizeObserver?.observe(nav.parentElement);
    window.addEventListener("resize", syncFrame);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncFrame);
    };
  }, []);

  const chromeGeometry = chromeFrame
    ? (() => {
        const { height, railWidth, topbarHeight, width } = chromeFrame;

        if (isRoomsLandingChrome) {
          const verticalX = railWidth + Math.min(8, railWidth * 0.095);
          const cornerRadius = Math.min(64, Math.max(54, topbarHeight * 0.86));
          const bezierControl = cornerRadius * 0.5522847498;
          const horizontalTangentX = verticalX + cornerRadius;
          const verticalTangentY = topbarHeight + cornerRadius;
          const edge = [
            `M${width} ${topbarHeight}`,
            `H${horizontalTangentX}`,
            `C${horizontalTangentX - bezierControl} ${topbarHeight} ${verticalX} ${verticalTangentY - bezierControl} ${verticalX} ${verticalTangentY}`,
            `V${height}`,
          ].join(" ");
          const hotspot = [
            `M${verticalX} ${verticalTangentY + 8}`,
            `L${verticalX} ${verticalTangentY}`,
            `C${verticalX} ${verticalTangentY - bezierControl} ${horizontalTangentX - bezierControl} ${topbarHeight} ${horizontalTangentX} ${topbarHeight}`,
            `H${horizontalTangentX + 18}`,
          ].join(" ");

          return {
            edge,
            hotspot,
            piece: [`M0 0 H${width}`, `V${topbarHeight}`, edge.replace(/^M[^H]+/, ""), `H0 Z`].join(" "),
          };
        }

        const cornerRadius = Math.min(
          48,
          Math.max(40, Math.min(railWidth, topbarHeight) * 0.72),
        );
        const edge = [
          `M${width} ${topbarHeight}`,
          `H${railWidth + cornerRadius}`,
          `Q${railWidth} ${topbarHeight} ${railWidth} ${topbarHeight + cornerRadius}`,
          `V${height}`,
        ].join(" ");
        return {
          edge,
          hotspot: null,
          piece: [`M0 0 H${width}`, `V${topbarHeight}`, edge.replace(/^M[^H]+/, ""), `H0 Z`].join(" "),
        };
      })()
    : null;
  const chromePath = chromeGeometry?.piece ?? "";
  const chromeEdgePath = chromeGeometry?.edge ?? "";
  const chromeHotspotPath = chromeGeometry?.hotspot ?? "";

  const renderDestination = (destination: PrimaryDestination) => {
    const Icon = destination.icon;
    const isActive = resolvedActiveDestination
      ? destination.id === resolvedActiveDestination
      : destination.id === "map" && (
          activeView === "position" ||
          activeView === "city" ||
          activeView === "country" ||
          activeView === "globe"
        );

    return (
      <button
        key={destination.id}
        type="button"
        className={`meewav-primary-nav__item ${isActive ? "is-active" : ""} is-${destination.id}`}
        aria-label={destination.label}
        aria-pressed={isActive}
        aria-current={isActive ? "page" : undefined}
        onClick={destination.onClick}
        style={{
          "--accent": destination.accent,
          "--accent-glow": destination.glow
        } as CSSProperties}
      >
        {destination.id === "map" && hasGlassChrome ? (
          <span className="meewav-primary-nav__pole-wordmark" aria-hidden="true">
            <svg viewBox="0 0 72 24" focusable="false">
              <defs>
                <path id={`${glassChromeId}-curve`} d="M4 14 Q36 15 68 14" />
                <linearGradient id={`${glassChromeId}-ink`} x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#9b7bce" />
                  <stop offset="0.4" stopColor="#d8c6f4" />
                  <stop offset="0.7" stopColor="#bda3e5" />
                  <stop offset="1" stopColor="#8162b7" />
                </linearGradient>
              </defs>
              <text fill={`url(#${glassChromeId}-ink)`}>
                <textPath href={`#${glassChromeId}-curve`} startOffset="50%" textAnchor="middle">MEEWAV</textPath>
              </text>
            </svg>
          </span>
        ) : null}
        {destination.id === "map" ? (
          <span className="meewav-primary-nav__globe" aria-hidden="true">
            <NavGlobeTexture />
            <span className="meewav-primary-nav__globe-light" />
          </span>
        ) : (
          <Icon aria-hidden="true" />
        )}
        <span className="meewav-primary-nav__material-glint" aria-hidden="true" />
        <span className="meewav-primary-nav__label">{destination.label}</span>
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      className={`meewav-primary-nav${isRoomsLandingChrome ? " is-rooms-landing-chassis" : ""}${hasGlassChrome ? " is-glass-chassis" : ""}`}
      aria-label="Navigation principale MeeWav"
    >
      {chromeFrame && chromePath ? (
        <span className="meewav-primary-nav__l-chassis" aria-hidden="true">
          <svg
            viewBox={`0 0 ${chromeFrame.width} ${chromeFrame.height}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient
                id="meewav-l-chassis-fill-gradient"
                x1="0"
                y1="0"
                x2="0"
                y2={chromeFrame.height}
                gradientUnits="userSpaceOnUse"
              >
                {isRoomsLandingChrome ? (
                  <>
                    <stop offset="0" stopColor="#04050a" />
                    <stop offset={Math.min(1, (chromeFrame.topbarHeight * 0.7) / chromeFrame.height)} stopColor="#05060c" />
                    <stop offset={Math.min(1, chromeFrame.topbarHeight / chromeFrame.height)} stopColor="#080711" />
                    <stop offset={Math.min(1, (chromeFrame.topbarHeight + 72) / chromeFrame.height)} stopColor="#2b1b5c" />
                    <stop offset={Math.min(1, (chromeFrame.topbarHeight + 188) / chromeFrame.height)} stopColor="#4e349f" />
                    <stop offset="0.7" stopColor="#5137a1" />
                    <stop offset="1" stopColor="#372574" />
                  </>
                ) : (
                  <>
                    <stop offset="0" stopColor="#05050c" />
                    <stop offset={Math.min(1, (chromeFrame.topbarHeight * 0.58) / chromeFrame.height)} stopColor="#06060e" />
                    <stop offset={Math.min(1, chromeFrame.topbarHeight / chromeFrame.height)} stopColor="#1d1038" />
                    <stop offset={Math.min(1, (chromeFrame.topbarHeight + 96) / chromeFrame.height)} stopColor="#5c38af" />
                    <stop offset="1" stopColor="#7148c9" />
                  </>
                )}
              </linearGradient>
              <radialGradient
                id="meewav-l-chassis-edge-gradient"
                cx={isRoomsLandingChrome ? chromeFrame.railWidth + 8.5 : chromeFrame.railWidth + 12}
                cy={isRoomsLandingChrome ? chromeFrame.topbarHeight + 38 : chromeFrame.topbarHeight + 48}
                r={isRoomsLandingChrome ? "44" : "38"}
                gradientUnits="userSpaceOnUse"
                gradientTransform={isRoomsLandingChrome
                  ? `translate(${chromeFrame.railWidth + 8.5} ${chromeFrame.topbarHeight + 38}) rotate(143) scale(1.9 1) rotate(-143) translate(${-chromeFrame.railWidth - 8.5} ${-chromeFrame.topbarHeight - 38})`
                  : undefined}
              >
                <stop offset="0" stopColor={isRoomsLandingChrome ? "#fffaff" : "#fffaff"} stopOpacity="1" />
                <stop offset="0.08" stopColor={isRoomsLandingChrome ? "#f4ddff" : "#faeeff"} stopOpacity="0.99" />
                <stop offset="0.22" stopColor={isRoomsLandingChrome ? "#efc5ff" : "#ead0ff"} stopOpacity="0.96" />
                <stop offset="0.46" stopColor={isRoomsLandingChrome ? "#9f55f5" : "#b66fff"} stopOpacity={isRoomsLandingChrome ? "0.82" : "0.42"} />
                <stop offset="0.72" stopColor="#8744eb" stopOpacity={isRoomsLandingChrome ? "0.18" : "0.16"} />
                <stop offset="1" stopColor="#7137d7" stopOpacity={isRoomsLandingChrome ? "0.02" : "0.08"} />
              </radialGradient>
              <linearGradient
                id="meewav-l-chassis-edge-tail-gradient"
                x1={chromeFrame.railWidth}
                y1="0"
                x2={chromeFrame.width}
                y2="0"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#b271fb" stopOpacity="0.64" />
                <stop offset="0.055" stopColor="#a661f3" stopOpacity="0.58" />
                <stop offset="0.16" stopColor="#9750eb" stopOpacity="0.52" />
                <stop offset="0.2" stopColor="#9750eb" stopOpacity="0.68" />
                <stop offset="0.48" stopColor="#7c3cd3" stopOpacity="0.55" />
                <stop offset="1" stopColor="#6b32bd" stopOpacity="0.035" />
              </linearGradient>
              <linearGradient
                id="meewav-l-chassis-hotspot-gradient"
                x1={chromeFrame.railWidth + 4}
                y1={chromeFrame.topbarHeight + 89}
                x2={chromeFrame.railWidth + 85}
                y2={chromeFrame.topbarHeight + 13}
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0" stopColor="#c877ff" stopOpacity="0" />
                <stop offset="0.055" stopColor="#f3dfff" stopOpacity="0.94" />
                <stop offset="0.16" stopColor="#fffaff" stopOpacity="0.99" />
                <stop offset="0.34" stopColor="#fffaff" stopOpacity="0.98" />
                <stop offset="0.41" stopColor="#eed1ff" stopOpacity="1" />
                <stop offset="0.46" stopColor="#d08aff" stopOpacity="0.74" />
                <stop offset="0.5" stopColor="#9d52f4" stopOpacity="0.4" />
                <stop offset="0.6" stopColor="#9d52f4" stopOpacity="0.2" />
                <stop offset="0.7" stopColor="#9d52f4" stopOpacity="0" />
                <stop offset="1" stopColor="#9d52f4" stopOpacity="0" />
              </linearGradient>
              <path
                id="meewav-l-chassis-piece-path"
                d={chromePath}
                vectorEffect="non-scaling-stroke"
              />
              <path
                id="meewav-l-chassis-edge-path"
                d={chromeEdgePath}
                vectorEffect="non-scaling-stroke"
              />
              {hasGlassChrome ? (
                <>
                  <clipPath id={`${glassChromeId}-lintel-piece`}>
                    <use href="#meewav-l-chassis-piece-path" />
                  </clipPath>
                  <linearGradient
                    id={`${glassChromeId}-lintel-material`}
                    x1={chromeFrame.railWidth}
                    x2={Math.min(chromeFrame.width, chromeFrame.railWidth + 920)}
                    y1="0" y2="0" gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0" stopColor="#6c4fba" stopOpacity="0" />
                    <stop offset="0.025" stopColor="#6c4fba" stopOpacity="0" />
                    <stop offset="0.065" stopColor="#6c4fba" stopOpacity="0.3" />
                    <stop offset="0.13" stopColor="#5137a1" stopOpacity="0.7" />
                    <stop offset="0.28" stopColor="#372574" stopOpacity="0.55" />
                    <stop offset="0.5" stopColor="#21183c" stopOpacity="0.24" />
                    <stop offset="0.8" stopColor="#100b1c" stopOpacity="0.08" />
                    <stop offset="1" stopColor="#080711" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient
                    id={`${glassChromeId}-lintel-reflection`}
                    x1={chromeFrame.railWidth}
                    x2={Math.min(chromeFrame.width, chromeFrame.railWidth + 1100)}
                    y1="0" y2="0" gradientUnits="userSpaceOnUse"
                  >
                    <stop offset="0" stopColor="#bda2de" stopOpacity="0" />
                    <stop offset="0.03" stopColor="#bda2de" stopOpacity="0" />
                    <stop offset="0.065" stopColor="#bda2de" stopOpacity="0.22" />
                    <stop offset="0.12" stopColor="#cbb9ef" stopOpacity="0.65" />
                    <stop offset="0.3" stopColor="#7b609d" stopOpacity="0.5" />
                    <stop offset="0.58" stopColor="#352940" stopOpacity="0.24" />
                    <stop offset="1" stopColor="#080711" stopOpacity="0" />
                  </linearGradient>
                </>
              ) : null}
            </defs>
            <use
              className="meewav-primary-nav__l-chassis-piece"
              href="#meewav-l-chassis-piece-path"
              vectorEffect="non-scaling-stroke"
            />
            {hasGlassChrome ? (
              <g className="meewav-primary-nav__glass-lintel" clipPath={`url(#${glassChromeId}-lintel-piece)`}>
                <use className="meewav-primary-nav__glass-lintel-body" href="#meewav-l-chassis-edge-path" stroke={`url(#${glassChromeId}-lintel-material)`} />
                <use className="meewav-primary-nav__glass-lintel-glaze" href="#meewav-l-chassis-edge-path" stroke={`url(#${glassChromeId}-lintel-material)`} />
                <use className="meewav-primary-nav__glass-lintel-reflection" href="#meewav-l-chassis-edge-path" stroke={`url(#${glassChromeId}-lintel-reflection)`} />
              </g>
            ) : null}
            <use
              className="meewav-primary-nav__l-chassis-edge-tail"
              href="#meewav-l-chassis-edge-path"
              vectorEffect="non-scaling-stroke"
            />
            <use
              className="meewav-primary-nav__l-chassis-edge-main"
              href="#meewav-l-chassis-edge-path"
              vectorEffect="non-scaling-stroke"
            />
            {chromeHotspotPath ? (
              <path
                className="meewav-primary-nav__l-chassis-hotspot"
                d={chromeHotspotPath}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        </span>
      ) : null}
      <div
        className="meewav-primary-nav__pillars"
        role="group"
        aria-label="Piliers MeeWav"
      >
        {pillarDestinations.map(renderDestination)}
      </div>
      <div
        className="meewav-primary-nav__account"
        role="group"
        aria-label="Compte MeeWav"
      >
        {renderDestination(profileDestination)}
      </div>
    </nav>
  );
}
