import { useId, type SVGProps } from "react";
import signatureMarkSrc from "../../assets/signature-mw.svg";

type MeewavTokenIconProps = SVGProps<SVGSVGElement> & {
  title?: string;
};

/**
 * Jeton de talent propriétaire MeeWav.
 * Sa face utilise directement la signature MW officielle placée sous les
 * badges de grade, entourée d'un double biseau violet et d'une face obsidienne.
 */
export default function MeewavTokenIcon({
  className,
  title,
  width,
  height,
  ...props
}: MeewavTokenIconProps) {
  const id = `mw-token-${useId().replace(/:/g, "")}`;

  return (
    <svg
      {...props}
      className={["meewav-token-icon", className].filter(Boolean).join(" ")}
      viewBox="0 0 48 48"
      width={width ?? 32}
      height={height ?? 32}
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <radialGradient id={`${id}-core`} cx="0" cy="0" r="1" gradientTransform="translate(18 14) rotate(47) scale(31)" gradientUnits="userSpaceOnUse">
          <stop stopColor="#51309A" />
          <stop offset=".32" stopColor="#241044" />
          <stop offset=".72" stopColor="#10091E" />
          <stop offset="1" stopColor="#07050E" />
        </radialGradient>
        <linearGradient id={`${id}-outer-rim`} x1="7" y1="5" x2="41" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" />
          <stop offset=".12" stopColor="#D7C5FF" />
          <stop offset=".31" stopColor="#7542E8" />
          <stop offset=".5" stopColor="#32116C" />
          <stop offset=".72" stopColor="#A777FF" />
          <stop offset=".9" stopColor="#5A27C4" />
          <stop offset="1" stopColor="#E7DCFF" />
        </linearGradient>
        <linearGradient id={`${id}-inner-rim`} x1="12" y1="8" x2="36" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5F0FF" />
          <stop offset=".25" stopColor="#9C74F4" />
          <stop offset=".55" stopColor="#42168D" />
          <stop offset=".78" stopColor="#C4AAFF" />
          <stop offset="1" stopColor="#6C36DC" />
        </linearGradient>
        <radialGradient id={`${id}-aura`} cx="0" cy="0" r="1" gradientTransform="translate(24 24) rotate(90) scale(24)" gradientUnits="userSpaceOnUse">
          <stop offset=".55" stopColor="#A66CFF" stopOpacity="0" />
          <stop offset=".82" stopColor="#A66CFF" stopOpacity=".26" />
          <stop offset="1" stopColor="#DCCBFF" stopOpacity=".08" />
        </radialGradient>
        <linearGradient id={`${id}-shine`} x1="12" y1="8" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity=".72" />
          <stop offset=".42" stopColor="#FFFFFF" stopOpacity=".08" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-shadow`} x="-35%" y="-35%" width="170%" height="185%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.6" floodColor="#17052F" floodOpacity=".78" />
          <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#9D66FF" floodOpacity=".42" />
        </filter>
        <filter id={`${id}-signature`} x="-25%" y="-45%" width="150%" height="190%">
          <feColorMatrix type="matrix" values="0 0 0 0 0.97  0 0 0 0 0.94  0 0 0 0 1  0 0 0 1 0" />
          <feDropShadow dx="0" dy="1" stdDeviation=".65" floodColor="#C5A7FF" floodOpacity=".9" />
        </filter>
      </defs>

      <g filter={`url(#${id}-shadow)`}>
        <circle cx="24" cy="24" r="21.5" fill="#16082E" stroke={`url(#${id}-outer-rim)`} strokeWidth="2.25" />
        <circle cx="24" cy="24" r="18.45" fill={`url(#${id}-core)`} stroke={`url(#${id}-inner-rim)`} strokeWidth="1.45" />
        <circle cx="24" cy="24" r="15.65" fill="#090611" fillOpacity=".42" stroke="#E9DEFF" strokeOpacity=".22" strokeWidth=".75" />
        <circle cx="24" cy="24" r="20.1" fill={`url(#${id}-aura)`} />
        <path d="M12.4 14.6A16.1 16.1 0 0 1 29.8 8.9" stroke={`url(#${id}-shine)`} strokeWidth="1.55" strokeLinecap="round" />
        <path d="M35.2 34.9A16.1 16.1 0 0 1 20.1 39.3" stroke="#B997FF" strokeOpacity=".3" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M24 2.9v3.2M24 41.9v3.2M2.9 24h3.2M41.9 24h3.2" stroke="#F0E7FF" strokeOpacity=".82" strokeWidth="1.15" strokeLinecap="round" />
        <path d="m8.95 8.95 2.15 2.15m25.8 25.8 2.15 2.15m0-30.1-2.15 2.15M11.1 36.9l-2.15 2.15" stroke="#A97AFF" strokeOpacity=".58" strokeWidth="1" strokeLinecap="round" />
        <image
          href={signatureMarkSrc}
          x="8.5"
          y="14.5"
          width="31"
          height="19"
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${id}-signature)`}
        />
      </g>
    </svg>
  );
}
