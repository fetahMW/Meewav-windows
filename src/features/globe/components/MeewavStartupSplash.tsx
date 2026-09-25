import { memo, useEffect, useState } from "react";
import type { CSSProperties } from "react";

import "./MeewavStartupSplash.css";

type MeewavStartupSplashProps = {
  dismissed: boolean;
  progress: number;
  stage: string;
};

const EXIT_DURATION_MS = 420;

function clampProgress(progress: number) {
  return Math.min(100, Math.max(0, progress));
}

function MeewavStartupSplash({ dismissed, progress, stage }: MeewavStartupSplashProps) {
  const [mounted, setMounted] = useState(!dismissed);
  const safeProgress = clampProgress(progress);
  const roundedProgress = Math.round(safeProgress);

  useEffect(() => {
    if (!dismissed) {
      setMounted(true);
      return;
    }

    const timeoutId = window.setTimeout(() => setMounted(false), EXIT_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [dismissed]);

  if (!mounted) return null;

  return (
    <div
      className={`meewav-startup-splash mw-startup ${dismissed ? "is-complete" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-hidden={dismissed}
      style={{ "--mw-startup-progress": safeProgress / 100 } as CSSProperties}
    >
      <div className="mw-startup__vignette" aria-hidden="true" />

      <div className="mw-startup__hud" aria-hidden="true">
        <div className="mw-startup__brand">
          <img src="/assets/meewav-logo.svg" alt="" width="241" height="78" />
          <span>Expérience Mon Globe</span>
        </div>

        <div className="mw-startup__telemetry">
          <div className="mw-startup__telemetry-head">
            <span className="mw-startup__stage">
              <i />
              {stage}
            </span>
            <span className="mw-startup__channel">CANAL ORBITAL / 07</span>
          </div>
          <div className="mw-startup__energy-rail">
            <span className="mw-startup__energy-fill">
              <i />
            </span>
            <b />
          </div>
          <div className="mw-startup__telemetry-foot">
            <span>Vecteur d’approche actif</span>
            <span>Signal stable</span>
            <span>Temps réel</span>
          </div>
        </div>
      </div>

      <span className="mw-startup__sr-status">{stage}, {roundedProgress} %</span>
    </div>
  );
}

export default memo(MeewavStartupSplash);
