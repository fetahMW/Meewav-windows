import { useEffect, useState } from "react";
import type { CageState } from "../tools/roomTools.types";

export function formatCageStageTime(seconds: number) {
  const safe = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function cageStageRemaining(cage: CageState, now = Date.now()) {
  if (cage.runtime) {
    if (cage.runtime.config.format === "open-mic") {
      const entry = cage.runtime.openMicEntries?.find((item) => item.id === (cage.runtime?.activeEntryId ?? cage.runtime?.preparedEntryId));
      if (!entry || ["PERFORMED", "POSTPONED", "SKIPPED"].includes(entry.status)) return 0;
      const elapsed = entry.timer.elapsedSeconds + (entry.status === "IN_PROGRESS" && entry.timer.startedAt ? Math.max(0, (now - Date.parse(entry.timer.startedAt)) / 1000) : 0);
      return Math.max(0, entry.durationSeconds - elapsed);
    }
    const current = cage.runtime.matches.find((match) => match.id === (cage.runtime?.activeMatchId ?? cage.runtime?.preparedMatchId));
    if (current?.vote?.open && current.vote.endsAt) return Math.max(0, Math.ceil((Date.parse(current.vote.endsAt) - now) / 1000));
    if (!current || ["READY_FOR_VOTE", "RESOLVED", "CLOSED", "POSTPONED"].includes(current.status)) return 0;
    const step = current.steps[current.stepIndex];
    const elapsed = current.timer.elapsedSeconds + (current.status === "IN_PROGRESS" && current.timer.startedAt ? Math.max(0, (now - Date.parse(current.timer.startedAt)) / 1000) : 0);
    return Math.max(0, (step?.durationSeconds ?? 0) - elapsed);
  }
  const live = cage.battleStatus === "live-a" || cage.battleStatus === "live-b";
  const startedAt = cage.battleStartedAt ? new Date(cage.battleStartedAt).getTime() : Number.NaN;
  const elapsedLive = live && Number.isFinite(startedAt)
    ? Math.max(0, Math.floor((now - startedAt) / 1_000))
    : 0;
  return Math.max(0, (cage.passageDurationSeconds ?? 120) - (cage.battleElapsedSeconds ?? 0) - elapsedLive);
}

export function useCageStageClock(cage: CageState | null) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = cage?.battleStatus === "live-a"
    || cage?.battleStatus === "live-b"
    || cage?.votingOpen
    || cage?.battleStatus === "countdown";

  useEffect(() => {
    if (!ticking) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), cage?.battleStatus === "countdown" ? 200 : 1_000);
    return () => window.clearInterval(interval);
  }, [cage?.battleStatus, ticking]);

  const remaining = cage ? cageStageRemaining(cage, now) : 0;
  const countdown = cage?.battleStatus === "countdown" && cage.battleCountdownEndsAt
    ? Math.max(0, Math.ceil((new Date(cage.battleCountdownEndsAt).getTime() - now) / 1_000))
    : null;
  return { remaining, countdown };
}
