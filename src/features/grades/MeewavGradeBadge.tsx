import { type CSSProperties, useId } from "react";

import {
  getGradeBadgeMeta,
  normalizeGradeLevel,
  type GradeLevel,
} from "./gradeBadges";
import "./MeewavGradeBadge.css";

type BadgeSize = "xs" | "sm" | "md" | "lg" | "xl" | "hero";
type BadgeVariant = "icon" | "pill" | "compact-pill";
type BadgeLabelMode = "none" | "label" | "title" | "full";

export type MeewavGradeBadgeProps = {
  level: GradeLevel | number | null | undefined;
  size?: BadgeSize;
  variant?: BadgeVariant;
  labelMode?: BadgeLabelMode;
  className?: string;
  title?: string;
  interactive?: boolean;
};

type StarSpec = {
  x: number;
  y: number;
  size: number;
};

const SIZE_PX: Record<BadgeSize, number> = {
  xs: 20,
  sm: 34,
  md: 48,
  lg: 66,
  xl: 84,
  hero: 116,
};

const STAR_PATH =
  "M50 5 L61.6 35.2 L94 36.8 L69.1 57.2 L77.6 88.4 L50 71.1 L22.4 88.4 L30.9 57.2 L6 36.8 L38.4 35.2 Z";
const MW_SIGNATURE_STROKE_PATH =
  "M106.75 22.0844C106.75 22.0844 109.74 18.3119 112.684 11.5627C115.996 3.97318 114.33 22.5971 115.875 19.6707C119.577 12.6589 119.823 4.51723 121.428 9.15285C123.46 15.0211 122.877 22.3987 124.262 18.7178C125.647 15.0369 125.59 6.78716 127.263 15.4913C128.937 24.1954 134.73 5.24531 134.73 5.24531";
const LEGENDARY_RAY_ROTATIONS = Array.from({ length: 12 }, (_, index) => index * 30);

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function sanitizeSvgId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, "");
}

function getStars(level: GradeLevel): StarSpec[] {
  if (level === 1) return [{ x: 64, y: 14, size: 24 }];
  if (level === 2) {
    return [
      { x: 50, y: 16, size: 24 },
      { x: 78, y: 16, size: 24 },
    ];
  }
  if (level === 3) {
    return [
      { x: 64, y: 12, size: 24 },
      { x: 43, y: 24, size: 24 },
      { x: 85, y: 24, size: 24 },
    ];
  }
  if (level === 4) {
    return [
      { x: 22, y: 30, size: 24 },
      { x: 50, y: 16, size: 24 },
      { x: 78, y: 16, size: 24 },
      { x: 106, y: 30, size: 24 },
    ];
  }
  if (level === 5) {
    return [
      { x: 64, y: 12, size: 24 },
      { x: 43, y: 24, size: 24 },
      { x: 85, y: 24, size: 24 },
      { x: 25, y: 35, size: 24 },
      { x: 103, y: 35, size: 24 },
    ];
  }

  return [{ x: 64, y: 20, size: 44 }];
}

function BadgeStar({
  spec,
  fill,
  stroke,
  legendary,
}: {
  spec: StarSpec;
  fill: string;
  stroke: string;
  legendary: boolean;
}) {
  const scale = spec.size / 100;

  return (
    <g
      transform={`translate(${spec.x} ${spec.y}) scale(${scale}) translate(-50 -50)`}
    >
      <path
        d={STAR_PATH}
        fill={fill}
        stroke={stroke}
        strokeLinejoin="round"
        strokeWidth={legendary ? 4.2 : 3.2}
      />
    </g>
  );
}

function Laurel({
  side,
  fillId,
  stroke,
  legendary,
}: {
  side: -1 | 1;
  fillId: string;
  stroke: string;
  legendary: boolean;
}) {
  const leaves = [
    { x: 38, y: 48, r: -58, s: 0.72 },
    { x: 30, y: 57, r: -43, s: 0.79 },
    { x: 25, y: 68, r: -28, s: 0.86 },
    { x: 24, y: 80, r: -10, s: 0.94 },
    { x: 28, y: 92, r: 10, s: 0.9 },
    { x: 36, y: 102, r: 29, s: 0.8 },
  ];

  return (
    <g opacity={legendary ? 0.98 : 0.94}>
      {leaves.map((leaf, index) => {
        const x = side === -1 ? leaf.x : 128 - leaf.x;
        const rotation = side === -1 ? leaf.r : -leaf.r;

        return (
          <path
            key={`${side}-${index}`}
            d="M0 2 C7 -8 18 -8 24 0 C17 10 7 12 0 3 Z"
            fill={`url(#${fillId})`}
            stroke={stroke}
            strokeLinejoin="round"
            strokeWidth="0.9"
            transform={`translate(${x} ${leaf.y}) rotate(${rotation}) scale(${side * leaf.s} ${leaf.s})`}
          />
        );
      })}
    </g>
  );
}

function BadgeSvg({ level }: { level: GradeLevel }) {
  const rawId = useId();
  const uid = `mw-grade-${sanitizeSvgId(rawId)}-${level}`;
  const meta = getGradeBadgeMeta(level);
  const legendary = level === 6;
  const starFill = legendary ? `url(#${uid}-legend-star)` : `url(#${uid}-star)`;
  const ringStroke = legendary ? `url(#${uid}-legend-ring)` : `url(#${uid}-rim)`;
  const starStroke = legendary ? "#FFFFFF" : "rgba(255,255,255,0.92)";

  return (
    <svg
      aria-hidden="true"
      className="mw-grade-badge__svg"
      focusable="false"
      viewBox="0 0 128 128"
    >
      <defs>
        <radialGradient id={`${uid}-star`} cx="38%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="34%" stopColor={meta.softColor} />
          <stop offset="100%" stopColor={meta.mainColor} />
        </radialGradient>
        <linearGradient id={`${uid}-rim`} x1="16%" y1="5%" x2="89%" y2="102%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="23%" stopColor={meta.softColor} />
          <stop offset="58%" stopColor={meta.mainColor} />
          <stop offset="100%" stopColor={meta.darkColor} />
        </linearGradient>
        <linearGradient id={`${uid}-leaf`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.86" />
          <stop offset="18%" stopColor={meta.softColor} />
          <stop offset="58%" stopColor={meta.mainColor} />
          <stop offset="100%" stopColor={meta.darkColor} />
        </linearGradient>
        <radialGradient id={`${uid}-core`} cx="46%" cy="34%" r="72%">
          <stop offset="0%" stopColor={legendary ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.15)"} />
          <stop offset="58%" stopColor="rgba(16,10,35,0.96)" />
          <stop offset="100%" stopColor={meta.darkColor} />
        </radialGradient>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="52%" r="64%">
          <stop offset="0%" stopColor={meta.softColor} stopOpacity={legendary ? 0.62 : 0.34} />
          <stop offset="100%" stopColor={meta.mainColor} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${uid}-legend-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="16%" stopColor="#8FF3FF" />
          <stop offset="35%" stopColor="#F0D5FF" />
          <stop offset="54%" stopColor="#D946EF" />
          <stop offset="72%" stopColor="#7C3CFF" />
          <stop offset="88%" stopColor="#FFE8A3" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
        <radialGradient id={`${uid}-legend-star`} cx="38%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="16%" stopColor="#D7FAFF" />
          <stop offset="38%" stopColor="#F0D5FF" />
          <stop offset="62%" stopColor="#CF56FF" />
          <stop offset="82%" stopColor="#7C2DFF" />
          <stop offset="100%" stopColor="#350078" />
        </radialGradient>
        <radialGradient id={`${uid}-legend-core`} cx="44%" cy="32%" r="74%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.34)" />
          <stop offset="36%" stopColor="rgba(106,0,255,0.34)" />
          <stop offset="70%" stopColor="rgba(16,8,38,0.98)" />
          <stop offset="100%" stopColor="#16002F" />
        </radialGradient>
        <linearGradient id={`${uid}-legend-glass`} x1="18%" y1="4%" x2="84%" y2="91%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.62)" />
          <stop offset="34%" stopColor="rgba(240,213,255,0.16)" />
          <stop offset="100%" stopColor="rgba(106,0,255,0)" />
        </linearGradient>
        <radialGradient id={`${uid}-legend-aura`} cx="50%" cy="46%" r="54%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="18%" stopColor="#8FF3FF" stopOpacity="0.72" />
          <stop offset="48%" stopColor="#C346FF" stopOpacity="0.48" />
          <stop offset="100%" stopColor="#6A00FF" stopOpacity="0" />
        </radialGradient>
        <filter id={`${uid}-legend-glow`} x="-45%" y="-55%" width="190%" height="205%">
          <feGaussianBlur stdDeviation="2.8" result="blur" />
          <feColorMatrix
            in="blur"
            type="matrix"
            values="0 0 0 0 0.55 0 0 0 0 0.05 0 0 0 0 1 0 0 0 0.78 0"
            result="purpleGlow"
          />
          <feMerge>
            <feMergeNode in="purpleGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="64" cy="72" rx={legendary ? 56 : 50} ry={legendary ? 53 : 49} fill={`url(#${uid}-halo)`} opacity={legendary ? 0.95 : 0.8} />

      {legendary && (
        <>
          <circle cx="64" cy="66" r="58" fill={`url(#${uid}-legend-aura)`} opacity="0.58" />
          <g opacity="0.9">
            {LEGENDARY_RAY_ROTATIONS.map((rotation, index) => (
              <path
                key={rotation}
                d={index % 2 === 0 ? "M64 2 L68 18 L64 26 L60 18 Z" : "M64 7 L67 20 L64 25 L61 20 Z"}
                fill={`url(#${uid}-legend-ring)`}
                opacity={index % 2 === 0 ? 0.92 : 0.62}
                transform={`rotate(${rotation} 64 66)`}
              />
            ))}
          </g>
          <ellipse
            cx="64"
            cy="69"
            rx="56"
            ry="43"
            fill="none"
            stroke={`url(#${uid}-legend-ring)`}
            strokeDasharray="29 7 5 8"
            strokeLinecap="round"
            strokeWidth="1.55"
            transform="rotate(-11 64 69)"
            opacity="0.88"
          />
          <circle cx="64" cy="70" r="48" fill="none" stroke="#6A00FF" strokeOpacity="0.28" strokeWidth="8" />
          <circle cx="64" cy="70" r="44" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" />
          <path d="M15 48 L17.5 53.5 L23 56 L17.5 58.5 L15 64 L12.5 58.5 L7 56 L12.5 53.5 Z" fill="#8FF3FF" />
          <path d="M111 35 L113 39.5 L117.5 41.5 L113 43.5 L111 48 L109 43.5 L104.5 41.5 L109 39.5 Z" fill="#FFE8A3" />
          <circle cx="106" cy="89" r="2.2" fill="#FFFFFF" opacity="0.9" />
        </>
      )}

      {getStars(level).map((spec, index) => (
        <g key={`${level}-${index}`} filter={legendary ? `url(#${uid}-legend-glow)` : undefined}>
          <BadgeStar
            spec={spec}
            fill={starFill}
            stroke={starStroke}
            legendary={legendary}
          />
        </g>
      ))}

      {legendary && (
        <g transform="translate(64 20) scale(0.3) translate(-50 -50)">
          <path
            d={STAR_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.88)"
            strokeLinejoin="round"
            strokeWidth="3"
          />
        </g>
      )}

      {legendary && (
        <>
          <path
            d="M21 99 C9 75 16 48 38 33 C29 59 34 84 51 105"
            fill="none"
            stroke={`url(#${uid}-legend-ring)`}
            strokeLinecap="round"
            strokeWidth="5.8"
            opacity="0.96"
          />
          <path
            d="M107 99 C119 75 112 48 90 33 C99 59 94 84 77 105"
            fill="none"
            stroke={`url(#${uid}-legend-ring)`}
            strokeLinecap="round"
            strokeWidth="5.8"
            opacity="0.96"
          />
        </>
      )}

      <Laurel side={-1} fillId={`${uid}-leaf`} stroke={legendary ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)"} legendary={legendary} />
      <Laurel side={1} fillId={`${uid}-leaf`} stroke={legendary ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.45)"} legendary={legendary} />

      <circle
        cx="64"
        cy="70"
        r="36"
        fill={legendary ? `url(#${uid}-legend-core)` : "rgba(7, 7, 20, 0.96)"}
        stroke={ringStroke}
        strokeWidth={legendary ? 4.2 : 3.4}
      />
      {legendary && (
        <path
          d="M36 58 C46 42 76 35 93 56 C75 49 54 50 36 66 Z"
          fill={`url(#${uid}-legend-glass)`}
          opacity="0.9"
        />
      )}
      <circle
        cx="64"
        cy="70"
        r="29"
        fill={`url(#${uid}-core)`}
        stroke={legendary ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.22)"}
        strokeWidth={legendary ? 1.45 : 1.2}
      />
      <circle
        cx="64"
        cy="70"
        r={legendary ? 42.5 : 40.5}
        fill="none"
        stroke={ringStroke}
        strokeOpacity={legendary ? 0.78 : 0.45}
        strokeWidth={legendary ? 1.45 : 1.15}
      />

      <text
        x="64"
        y="85"
        fill={legendary ? "#FFFFFF" : "#FFFFFF"}
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="43"
        fontWeight="950"
        letterSpacing="0"
        textAnchor="middle"
      >
        {meta.badgeNumber}
      </text>

      <svg x="40" y="96" width="48" height="27" viewBox="105 3 31 21" fill="none">
        <path
          d={MW_SIGNATURE_STROKE_PATH}
          stroke={legendary ? "#F7E5FF" : "#FFFFFF"}
          strokeLinecap="round"
          strokeWidth={legendary ? "3.5" : "3.1"}
        />
      </svg>
    </svg>
  );
}

export function MeewavGradeBadge({
  level,
  size = "md",
  variant = "icon",
  labelMode = "none",
  className,
  title,
  interactive = false,
}: MeewavGradeBadgeProps) {
  const normalizedLevel = normalizeGradeLevel(level);
  const meta = getGradeBadgeMeta(normalizedLevel);
  const px = SIZE_PX[size];
  const label =
    labelMode === "full"
      ? `${meta.title} ${meta.label}`
      : labelMode === "title"
        ? meta.title
        : labelMode === "label"
          ? meta.label
          : "";
  const accessibleTitle = title ?? `${meta.title} ${meta.label}`;

  return (
    <span
      aria-label={accessibleTitle}
      className={cx(
        "mw-grade-badge",
        `mw-grade-badge--${variant}`,
        `mw-grade-badge--${size}`,
        `mw-grade-badge--${meta.colorName}`,
        interactive && "mw-grade-badge--interactive",
        className,
      )}
      style={{
        "--mw-grade-size": `${px}px`,
        "--mw-grade-main": meta.mainColor,
        "--mw-grade-soft": meta.softColor,
        "--mw-grade-dark": meta.darkColor,
      } as CSSProperties}
      title={accessibleTitle}
    >
      <span className="mw-grade-badge__icon">
        <BadgeSvg level={normalizedLevel} />
      </span>

      {variant !== "icon" && labelMode !== "none" && (
        <span className="mw-grade-badge__text">{label}</span>
      )}
    </span>
  );
}
