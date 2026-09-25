import { useId } from "react";
export function LiveMonetizationIcon() {
  const id = useId();
  return <svg className="live-action-bar__money" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-gold`} x1="10" y1="10" x2="34" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor="#fffac4" /><stop offset=".35" stopColor="#ffe66d" /><stop offset=".72" stopColor="#ffd456" /><stop offset="1" stopColor="#dc9f29" /></linearGradient>
      <linearGradient id={`${id}-edge`} x1="12" y1="8" x2="39" y2="43" gradientUnits="userSpaceOnUse"><stop stopColor="#fffccd" /><stop offset="1" stopColor="#b87918" /></linearGradient>
    </defs>
    <path d="M24 13c-3-3-6-7-3-8 2-1 4 1 5 2 2-4 7-6 8-2 1 3-3 6-6 9" fill={`url(#${id}-gold)`} stroke={`url(#${id}-edge)`} strokeWidth="1.1" />
    <path d="M23 14c-5 3-11 9-14 15-4 9 1 14 14 14 13 0 21-3 16-12-3-7-8-13-11-17Z" fill={`url(#${id}-gold)`} stroke={`url(#${id}-edge)`} strokeWidth="1.1" />
    <path d="m20 16 10-2m-9-1 9-2" stroke="#c99329" strokeWidth="2" strokeLinecap="round" />
    <path d="M28 24c-1-2-3-2-5-2-4 0-6 3-6 8 0 5 2 8 6 8 2 0 4-1 5-2m-13-8h10m-10 4h9" stroke="#533a0f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 26c2-4 5-7 8-9" stroke="#fffcd1" strokeWidth="1.1" strokeLinecap="round" opacity=".65" />
  </svg>;
}
