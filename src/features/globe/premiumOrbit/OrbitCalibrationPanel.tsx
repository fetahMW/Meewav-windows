import { memo } from "react";
import type { OrbitCalibration } from "./types";
import "./PremiumGlobeOrbit.css";

interface OrbitCalibrationPanelProps {
  value: OrbitCalibration;
  onChange: (value: OrbitCalibration) => void;
  onReset: () => void;
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="mw-orbit-calibrator__row">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <output>{value.toFixed(step < 1 ? 3 : 1)}</output>
    </label>
  );
}

export const OrbitCalibrationPanel = memo(function OrbitCalibrationPanel({
  value,
  onChange,
  onReset,
}: OrbitCalibrationPanelProps) {
  const patch = <Key extends keyof OrbitCalibration>(
    key: Key,
    next: OrbitCalibration[Key],
  ) => {
    onChange({ ...value, [key]: next });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
  };

  return (
    <aside className="mw-orbit-calibrator">
      <header>
        <strong>Orbit calibration</strong>
        <button type="button" onClick={onReset}>Reset</button>
      </header>

      <Slider label="Center X" value={value.centerOffsetX} min={-300} max={300} step={1} onChange={(next) => patch("centerOffsetX", next)} />
      <Slider label="Center Y" value={value.centerOffsetY} min={-300} max={300} step={1} onChange={(next) => patch("centerOffsetY", next)} />
      <Slider label="Globe width" value={value.globeRadiusViewportWidth} min={0.15} max={0.5} step={0.005} onChange={(next) => patch("globeRadiusViewportWidth", next)} />
      <Slider label="Globe height" value={value.globeRadiusViewportHeight} min={0.2} max={0.6} step={0.005} onChange={(next) => patch("globeRadiusViewportHeight", next)} />
      <Slider label="Orbit X" value={value.orbitRxMultiplier} min={1.05} max={2.2} step={0.01} onChange={(next) => patch("orbitRxMultiplier", next)} />
      <Slider label="Orbit Y" value={value.orbitRyMultiplier} min={0.15} max={0.8} step={0.01} onChange={(next) => patch("orbitRyMultiplier", next)} />
      <Slider label="Rotation" value={value.orbitRotationDeg} min={-30} max={30} step={0.1} onChange={(next) => patch("orbitRotationDeg", next)} />
      <Slider label="Profile size" value={value.profileBaseSizePx} min={44} max={130} step={1} onChange={(next) => patch("profileBaseSizePx", next)} />

      <button className="mw-orbit-calibrator__copy" type="button" onClick={copy}>
        Copy calibration JSON
      </button>
    </aside>
  );
});
