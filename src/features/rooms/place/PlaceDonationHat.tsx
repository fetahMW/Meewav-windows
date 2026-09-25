import { useId } from "react";

type PlaceDonationHatProps = {
  className?: string;
  presentation?: "compact" | "railHeader";
};

/**
 * Virtual hat used across La Place.
 * The on-air tip counter reuses the exact iOS asset; the other presentations
 * keep the scalable bespoke SVG used by the donation controls.
 */
export default function PlaceDonationHat({ className = "", presentation = "compact" }: PlaceDonationHatProps) {
  const uid = useId().replace(/:/g, "");
  const id = (name: string) => `${uid}-${name}`;
  const isTipJar = className.split(/\s+/).includes("is-tip-jar");

  if (isTipJar) {
    return (
      <span className={`place-donation-hat place-donation-hat--${presentation} ${className}`} aria-hidden="true">
        <img
          className="place-donation-hat__image place-donation-hat__image--tip-jar"
          src="/images/rooms/place/hat_magic.png"
          alt=""
          width={57}
          height={45}
          draggable={false}
        />
      </span>
    );
  }

  return (
    <span className={`place-donation-hat place-donation-hat--${presentation}${className ? ` ${className}` : ""}`} aria-hidden="true">
      <span className="place-donation-hat__halo" />
      <svg
        className="place-donation-hat__svg"
        viewBox="0 0 128 100"
        role="presentation"
        focusable="false"
      >
        <defs>
          <linearGradient id={id("body")} x1="30" y1="22" x2="101" y2="72" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#b58aff" />
            <stop offset="0.22" stopColor="#8450e8" />
            <stop offset="0.58" stopColor="#5a2ba7" />
            <stop offset="1" stopColor="#2a124f" />
          </linearGradient>
          <linearGradient id={id("bodyShade")} x1="34" y1="44" x2="99" y2="61" gradientUnits="userSpaceOnUse">
            <stop stopColor="#ffffff" stopOpacity="0.22" />
            <stop offset="0.3" stopColor="#d9bfff" stopOpacity="0.04" />
            <stop offset="0.72" stopColor="#160525" stopOpacity="0.34" />
            <stop offset="1" stopColor="#09040f" stopOpacity="0.58" />
          </linearGradient>
          <linearGradient id={id("brim")} x1="13" y1="61" x2="112" y2="88" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a976ff" />
            <stop offset="0.34" stopColor="#7240ce" />
            <stop offset="0.7" stopColor="#482183" />
            <stop offset="1" stopColor="#24103f" />
          </linearGradient>
          <linearGradient id={id("brimEdge")} x1="20" y1="73" x2="109" y2="84" gradientUnits="userSpaceOnUse">
            <stop stopColor="#50258f" />
            <stop offset="0.42" stopColor="#32165d" />
            <stop offset="1" stopColor="#160a29" />
          </linearGradient>
          <linearGradient id={id("band")} x1="33" y1="53" x2="97" y2="64" gradientUnits="userSpaceOnUse">
            <stop stopColor="#29123f" />
            <stop offset="0.44" stopColor="#160921" />
            <stop offset="0.72" stopColor="#3a1760" />
            <stop offset="1" stopColor="#12081e" />
          </linearGradient>
          <linearGradient id={id("clasp")} x1="69" y1="53" x2="80" y2="65" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f4e8ff" />
            <stop offset="0.28" stopColor="#cda9ff" />
            <stop offset="0.62" stopColor="#8550e8" />
            <stop offset="1" stopColor="#3c1b6c" />
          </linearGradient>
          <radialGradient id={id("cavity")} cx="0" cy="0" r="1" gradientTransform="translate(63 25) rotate(90) scale(13 32)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#08030d" />
            <stop offset="0.72" stopColor="#160724" />
            <stop offset="1" stopColor="#48217b" />
          </radialGradient>
          <radialGradient id={id("glow")} cx="0" cy="0" r="1" gradientTransform="translate(65 66) rotate(90) scale(35 58)" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a96eff" stopOpacity="0.5" />
            <stop offset="1" stopColor="#6d32d5" stopOpacity="0" />
          </radialGradient>
          <filter id={id("shadow")} x="-28%" y="-32%" width="156%" height="180%" colorInterpolationFilters="sRGB">
            <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#050208" floodOpacity="0.7" />
          </filter>
          <filter id={id("softGlow")} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        <ellipse cx="64" cy="72" rx="58" ry="27" fill={`url(#${id("glow")})`} />

        <g filter={`url(#${id("shadow")})`}>
          <path
            d="M13 68.7C20.8 61.1 39.7 57.8 64.1 58.1c24.8.3 44.1 4 51.3 11.7 6.3 6.7-8.8 14.8-48.8 16.1-40.7 1.3-62-8.4-53.6-17.2Z"
            fill={`url(#${id("brimEdge")})`}
          />
          <path
            d="M12.7 65.7c9.2-7.7 28.1-11.2 51.4-10.9 24.4.3 44.4 4.6 51.8 12.2 4.3 4.4-14.2 11.2-50 12.2-35.1 1-58.7-8.9-53.2-13.5Z"
            fill={`url(#${id("brim")})`}
            stroke="#c5a0ff"
            strokeOpacity="0.38"
            strokeWidth="1.15"
          />
          <path
            d="M24.2 68.9c17.4 5.7 64.5 7.1 86.6-.2-7 6.2-24.9 9.6-45.4 10.2-19.3.5-35.9-3.7-41.2-10Z"
            fill="#150825"
            fillOpacity="0.42"
          />

          <path
            d="M36.7 25.3c1.2-7 12.9-11.5 27.8-11.3 14.9.2 25.9 4.7 27 11.8l5 40.1c.8 7.1-13.3 11-31.4 10.9-18.2-.1-32.3-4.5-31.2-11.6l2.8-39.9Z"
            fill={`url(#${id("body")})`}
            stroke="#c9aaff"
            strokeOpacity="0.32"
            strokeWidth="1"
          />
          <path
            d="M37.8 29.3c4.3 3.7 13.7 5.9 25.9 6.1 13.1.2 23.3-2.3 27.1-6.2l4.3 35.6c.5 5.3-12.3 9-30 8.9-17.1-.1-29.6-4.2-28.9-9.4l1.6-35Z"
            fill={`url(#${id("bodyShade")})`}
          />
          <path
            d="M42 30.2c2.2 10.9 1.2 23.8-.5 32.8-.6 3.4 3.1 5.5 8.6 6.7-7.7-1.1-13.6-3.4-13.2-7.4l2.3-32.9 2.8.8Z"
            fill="#f0ddff"
            fillOpacity="0.13"
          />

          <path
            d="M34.7 51.8c13.6 4.1 46.9 4.8 59.7.4l1.6 13.1c-13.2 5.4-49.4 4.9-62-.5l.7-13Z"
            fill={`url(#${id("band")})`}
            stroke="#c89eff"
            strokeOpacity="0.22"
            strokeWidth="0.8"
          />
          <path d="M38.2 54.3c13 3.2 42.7 3.8 55.6.1" fill="none" stroke="#d7bdff" strokeOpacity="0.18" strokeWidth="1" />

          <g transform="translate(73.7 59.2) rotate(2)">
            <rect x="-6.8" y="-6.3" width="13.6" height="12.6" rx="3" fill="#100719" stroke="#c5a2ff" strokeOpacity="0.62" strokeWidth="1.1" />
            <path d="M0-4.1 4.2 0 0 4.1-4.2 0 0-4.1Z" fill={`url(#${id("clasp")})`} />
            <path d="M0-2.5 2.5 0 0 2.5-2.5 0 0-2.5Z" fill="#ead9ff" fillOpacity="0.4" />
          </g>

          <ellipse cx="64.2" cy="25.4" rx="28.5" ry="12.4" fill="#3b176b" stroke="#c9a9ff" strokeOpacity="0.45" strokeWidth="1.1" />
          <ellipse cx="64.2" cy="24.7" rx="24.7" ry="9.2" fill={`url(#${id("cavity")})`} />
          <path d="M42.3 23.6c6.7-5 27.6-7.4 42.7-.7" fill="none" stroke="#e6d2ff" strokeOpacity="0.34" strokeWidth="1.35" strokeLinecap="round" />
          <path d="M44.3 28.8c8.2 4.2 30.8 4.6 39.9.2" fill="none" stroke="#7c43d4" strokeOpacity="0.48" strokeWidth="1" strokeLinecap="round" />
        </g>

        <g opacity="0.82">
          <path d="m103.5 20.5 1.4 3.7 3.7 1.4-3.7 1.4-1.4 3.7-1.4-3.7-3.7-1.4 3.7-1.4 1.4-3.7Z" fill="#e8d6ff" />
          <circle cx="101" cy="33.5" r="1.6" fill="#a972ff" filter={`url(#${id("softGlow")})`} />
          <circle cx="101" cy="33.5" r="0.9" fill="#f1e7ff" />
        </g>
      </svg>
      <span className="place-donation-hat__shadow" />
    </span>
  );
}
