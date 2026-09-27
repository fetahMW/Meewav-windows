import type { ComponentType, CSSProperties } from "react";
export type VinylProps = {
  playing?: boolean;
  rpm?: number;
  rotateReflections?: boolean;
  label?: string;
  resetKey?: string | number;
  reducedMotion?: boolean;
  onToggle?: () => void;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
};
declare const Vinyl: ComponentType<VinylProps>;
export default Vinyl;
