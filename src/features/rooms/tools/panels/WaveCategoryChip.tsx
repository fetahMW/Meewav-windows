import type { CSSProperties } from "react";
import "./wave-category-chip.css";

export default function WaveCategoryChip({ label, accent }: { label: string; accent?: string }) {
  return <b className="wave-category-chip" style={accent ? { "--wave-loop-accent": accent } as CSSProperties : undefined}>{label}</b>;
}
