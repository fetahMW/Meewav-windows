import { useId, type CSSProperties } from "react";

/** Decorative endpoint: the chart keeps its data coordinates and interactive targets. */
export function PolishedChartPoint({ x, y, radius = 7 }: { x: number; y: number; radius?: number }) {
  const id = useId().replace(/:/g, "");
  return <g className="mw-chart-orb" aria-hidden="true" pointerEvents="none" style={{
    "--mw-orb-paint": `url(#${id}-body)`,
    "--mw-orb-shine": `url(#${id}-shine)`,
  } as CSSProperties}>
    <defs>
      <radialGradient id={id + "-body"} cx="35%" cy="28%" r="72%">
        <stop offset="0" stopColor="#ae95df" /><stop offset=".33" stopColor="#7457a5" />
        <stop offset=".65" stopColor="#291b43" /><stop offset=".83" stopColor="#483077" /><stop offset="1" stopColor="#a98ef0" />
      </radialGradient>
      <radialGradient id={id + "-shine"}>
        <stop offset="0" stopColor="#f4edff" stopOpacity=".94" /><stop offset=".48" stopColor="#d3c1f6" stopOpacity=".4" /><stop offset="1" stopColor="#d3c1f6" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle className="mw-chart-orb__body" cx={x} cy={y} r={radius} vectorEffect="non-scaling-stroke" />
    <ellipse className="mw-chart-orb__shine" cx={x - radius * .3} cy={y - radius * .4} rx={radius * .55} ry={radius * .35} />
  </g>;
}
