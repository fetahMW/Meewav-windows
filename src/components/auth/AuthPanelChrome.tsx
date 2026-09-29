import React from "react";
import "./auth-panel.css";

const PANEL_SHAPE_D =
  "M4 56.7774C4 42.6659 16.1072 31.5421 30.2028 32.2135C51.7791 33.2412 82.423 33.7889 105.25 30.5C146.124 24.6109 165.204 0 206.5 0C247.796 0 266.876 24.6109 307.75 30.5C330.577 33.7889 361.221 33.2412 382.797 32.2135C396.893 31.5421 409 42.6659 409 56.7774C415.5 175.4 415.5 411.3 409 530C409 558 322 580 206.5 580C91 580 4 558 4 530C-2.5 411.3 -2.5 175.4 4 56.7774Z";

const PANEL_BOTTOM_ARC_D =
  "M409 530C409 558 322 580 206.5 580C91 580 4 558 4 530";

type AuthPanelChromeProps = {
  children?: React.ReactNode;
  className?: string;
};

export function AuthPanelChrome({
  children,
  className = "",
}: AuthPanelChromeProps) {
  return (
    <div className={`auth-panel-shell ${className}`}>
      <svg
        className="auth-panel-stroke"
        viewBox="0 0 413 600"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <path id="panel-shape" d={PANEL_SHAPE_D} />
          <path id="panel-bottom-arc" d={PANEL_BOTTOM_ARC_D} />

          {/* Fond intérieur profond */}
          <radialGradient
            id="panel-bg-radial"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(206.5 120) rotate(90) scale(470 360)"
          >
            <stop offset="0%" stopColor="#16082C" />
            <stop offset="18%" stopColor="#0B0319" />
            <stop offset="42%" stopColor="#020105" />
            <stop offset="78%" stopColor="#020105" />
            <stop offset="92%" stopColor="#0C0317" />
            <stop offset="100%" stopColor="#17072F" />
          </radialGradient>

          {/* Halo atmosphérique externe */}
          <linearGradient
            id="panel-glow-atmo"
            x1="30"
            y1="0"
            x2="383"
            y2="580"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0.50" />
            <stop offset="16%" stopColor="#9464F5" stopOpacity="0.36" />
            <stop offset="38%" stopColor="#7C4FE0" stopOpacity="0.42" />
            <stop offset="64%" stopColor="#9D78F0" stopOpacity="0.38" />
            <stop offset="84%" stopColor="#8B5CF6" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#A78BF0" stopOpacity="0.24" />
          </linearGradient>

          {/* Biseau argent-violet */}
          <linearGradient
            id="panel-glow-core"
            x1="24"
            y1="8"
            x2="386"
            y2="576"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#D3C7F5" />
            <stop offset="16%" stopColor="#A98EF0" />
            <stop offset="38%" stopColor="#514A62" />
            <stop offset="64%" stopColor="#292431" />
            <stop offset="84%" stopColor="#807394" />
            <stop offset="100%" stopColor="#A98EF0" />
          </linearGradient>

          {/* Filament lumineux fin */}
          <linearGradient
            id="panel-glow-filament"
            x1="28"
            y1="2"
            x2="384"
            y2="578"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#F4F0FF" stopOpacity=".7" />
            <stop offset="18%" stopColor="#D3C7F5" stopOpacity=".1" />
            <stop offset="42%" stopColor="#A98EF0" stopOpacity="0" />
            <stop offset="78%" stopColor="#A98EF0" stopOpacity=".12" />
            <stop offset="100%" stopColor="#DED3FC" stopOpacity=".45" />
          </linearGradient>

          {/* Arc inférieur glow */}
          <linearGradient
            id="panel-bottom-glow"
            x1="4"
            y1="580"
            x2="409"
            y2="580"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0" />
            <stop offset="16%" stopColor="#8B5CF6" stopOpacity="0.16" />
            <stop offset="35%" stopColor="#9464F5" stopOpacity="0.34" />
            <stop offset="50%" stopColor="#9D78F0" stopOpacity="0.52" />
            <stop offset="65%" stopColor="#9464F5" stopOpacity="0.34" />
            <stop offset="84%" stopColor="#8B5CF6" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>

          {/* Arc inférieur cœur lumineux */}
          <linearGradient
            id="panel-bottom-core"
            x1="4"
            y1="580"
            x2="409"
            y2="580"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#8B5CF6" stopOpacity="0" />
            <stop offset="20%" stopColor="#9D78F0" stopOpacity="0.45" />
            <stop offset="42%" stopColor="#B6A0F5" stopOpacity="0.73" />
            <stop offset="58%" stopColor="#B6A0F5" stopOpacity="0.73" />
            <stop offset="80%" stopColor="#9D78F0" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </linearGradient>

          {/* Filtres */}
          <filter
            id="panel-blur-heavy"
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>

          <filter
            id="panel-blur-medium"
            x="-24%"
            y="-24%"
            width="148%"
            height="148%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.7" />
          </filter>

          <filter
            id="panel-inner-soft"
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
          </filter>
        </defs>

        {/* Fond */}
        <use
          href="#panel-shape"
          fill="url(#panel-bg-radial)"
          fillOpacity="0.94"
        />

        {/* Ombre fine du biseau */}
        <use
          href="#panel-shape"
          stroke="#000000"
          strokeOpacity="0.46"
          strokeWidth="2.6"
          filter="url(#panel-inner-soft)"
        />

        {/* Reflet diffus discret */}
        <use
          href="#panel-shape"
          stroke="url(#panel-glow-atmo)"
          strokeWidth="2.2"
          opacity="0.14"
          filter="url(#panel-blur-heavy)"
        />

        {/* Biseau net */}
        <use
          href="#panel-shape"
          stroke="url(#panel-glow-core)"
          strokeWidth="1"
          opacity="0.72"
        />

        {/* Filament fin */}
        <use
          href="#panel-shape"
          stroke="url(#panel-glow-filament)"
          strokeWidth="0.4"
          opacity="0.60"
        />

        {/* Arc inférieur - halo */}
        <use
          href="#panel-bottom-arc"
          stroke="url(#panel-bottom-glow)"
          strokeWidth="2"
          opacity="0.18"
          filter="url(#panel-blur-heavy)"
          strokeLinecap="round"
        />

        {/* Arc inférieur - cœur */}
        <use
          href="#panel-bottom-arc"
          stroke="url(#panel-bottom-core)"
          strokeWidth="0.65"
          opacity="0.45"
          strokeLinecap="round"
        />
      </svg>

      <div className="auth-panel-content">{children}</div>
    </div>
  );
}

export function SubtitleDivider() {
  return <div className="subtitle-divider" aria-hidden="true" />;
}

export function MidSeparator() {
  return (
    <div className="mid-separator" aria-hidden="true">
      <span className="mid-separator-line" />
      <span className="mid-separator-eq">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="mid-separator-line" />
    </div>
  );
}
