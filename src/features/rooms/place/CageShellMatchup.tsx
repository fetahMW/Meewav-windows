import { useEffect, useId, useState } from "react";
import { MeewavGradeBadge } from "../../grades/MeewavGradeBadge";
import { normalizeOptionalGradeLevel } from "../../grades/gradeBadges";
import {
  cageEntrants,
  cageEvent,
  cageOpenMicEntries,
  normalizedCageFormat,
} from "../tools/cageTools.domain";
import type { CageState, RoomPerson } from "../tools/roomTools.types";
import { useRoomTools } from "../tools/useRoomTools";
import { formatCageStageTime, useCageStageClock } from "./cageStageClock";
import type { PlaceRoomState } from "./place.types";
import CageRingDisplay from "./CageRingDisplay";
import { ROOM_TOOL_PEOPLE } from "../tools/roomTools.fixtures";

const CAGE_BATTLE_STATUS_LABEL: Record<CageState["battleStatus"], string> = {
  ready: "PRÊT À LANCER",
  countdown: "DÉCOMPTE",
  "live-a": "EN DIRECT",
  "live-b": "EN DIRECT",
  paused: "EN PAUSE",
  incident: "INCIDENT",
  done: "MATCH TERMINÉ",
};

function activeSide(cage: CageState): "A" | "B" | null {
  if (cage.battleStatus === "live-a") return "A";
  if (cage.battleStatus === "live-b") return "B";
  if (cage.battleStatus === "paused" || cage.battleStatus === "incident") return cage.battleActiveSide ?? null;
  return null;
}

function bracketRoundLabel(cage: CageState, matchRound: number) {
  return normalizedCageFormat(cage.format) === "open-mic-battle" ? `DUEL ${matchRound}` : normalizedCageFormat(cage.format) === "championship" ? `JOURNÉE ${matchRound}` : `TOUR ${matchRound}`;
}

function eventTypeLabel(cage: CageState) {
  const format = normalizedCageFormat(cage.format);
  if (format === "open-mic-battle") return "OPEN MIC BATTLE";
  if (format === "championship") return "CHAMPIONNAT";
  if (format === "open-mic") return "OPEN MIC";
  return "TOURNOI";
}

export function CageBannerPerson({ person, side, status, onOpenProfile }: {
  person: RoomPerson;
  side: "left" | "right";
  status: string;
  onOpenProfile: (profileId: string) => void;
}) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const grade = normalizeOptionalGradeLevel(person.gradeLevel);
  const initials = person.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");

  return <button type="button" className={`cage-battle-banner__clock-person is-${side}`} onClick={() => onOpenProfile(person.id)} aria-label={`Voir le profil de ${person.name}`}>
    <span className="cage-battle-banner__person-portrait">
      {person.avatarUrl && failedAvatar !== person.avatarUrl
        ? <img src={person.avatarUrl} alt={`Portrait de ${person.name}`} onError={() => setFailedAvatar(person.avatarUrl)} />
        : <span className="cage-battle-banner__person-initials" aria-hidden="true">{initials}</span>}
    </span>
    <span className="cage-battle-banner__person-copy"><small>{status}</small><span className="cage-battle-banner__person-name"><strong>{person.name}</strong>{grade ? <MeewavGradeBadge className="cage-battle-banner__person-grade" level={grade} size="xs" variant="icon" /> : null}</span><em>{person.role}</em></span>
  </button>;
}

function withBannerGrade(person: RoomPerson, room: PlaceRoomState): RoomPerson {
  // Respect an explicitly hidden grade. Demo-only fallbacks also support older saved fixtures.
  if (person.gradeLevel !== undefined) return person;
  const participant = room.participants.find((candidate) => candidate.profile.id === person.id);
  const gradeLevel = participant
    ? participant.profile.gradeLevel
    : room.source === "demo" ? ROOM_TOOL_PEOPLE.cage.find((candidate) => candidate.id === person.id)?.gradeLevel : undefined;
  return { ...person, gradeLevel };
}

function BattleBanner({ cage, left, right, leftStatus, rightStatus, matchRound, remaining, countdown, demo, onOpenProfile }: {
  cage: CageState;
  left: RoomPerson;
  right: RoomPerson | null;
  leftStatus: string;
  rightStatus: string;
  matchRound: number;
  remaining: number;
  countdown: number | null;
  demo: boolean;
  onOpenProfile: (profileId: string) => void;
}) {
  const event = cageEvent(cage);
  const format = normalizedCageFormat(cage.format);
  const timerExpired = remaining === 0 && (cage.battleStatus === "live-a" || cage.battleStatus === "live-b");
  const status = cage.votingOpen ? format === "open-mic" ? "RÉACTIONS OUVERTES" : "VOTE OUVERT" : timerExpired ? "TEMPS ÉCOULÉ" : format === "open-mic" && cage.battleStatus === "done" ? "PASSAGE TERMINÉ" : CAGE_BATTLE_STATUS_LABEL[cage.battleStatus];
  const rightName = right?.name ?? "À VENIR";
  const [eventName, ...eventLocationParts] = (demo ? "Tournoi Paris vs Marseille" : event.title).split(/\s+[—–-]\s+/);
  const eventLocation = eventLocationParts.join(" · ");
  const round = cage.battleRound ?? 1;
  const roundCount = cage.battleRoundCount ?? 3;
  const chassisId = useId();

  return (
    <div
      className={`cage-battle-banner is-clock-only is-motion-banner is-${format} is-${cage.battleStatus}${timerExpired ? " is-expired" : ""}${right ? "" : " is-solo"}`}
      role="group"
      aria-label={`${left.name}${right ? format === "open-mic" ? `, prochain artiste : ${rightName}` : ` contre ${rightName}` : " à l’antenne"}, ${status}, ${formatCageStageTime(remaining)}`}
    >
      <svg className="cage-battle-banner__display-chassis" viewBox="0 0 1000 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <defs>
          <path id={`${chassisId}-outline`} d="M 26 1 H 974 Q 999 1 999 26 V 72 Q 999 97 974 97 H 802 C 778 97 778 139 748 139 H 252 C 222 139 222 97 198 97 H 26 Q 1 97 1 72 V 26 Q 1 1 26 1 Z" vectorEffect="non-scaling-stroke" />
          <clipPath id={`${chassisId}-interior`}><use href={`#${chassisId}-outline`} /></clipPath>
          {/* Same black lacquer and machined rim as the shared studio chassis. */}
          <linearGradient id={`${chassisId}-surface`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="#101216" />
            <stop offset=".08" stopColor="#07090c" />
            <stop offset=".24" stopColor="#020304" />
            <stop offset=".54" stopColor="#000" />
            <stop offset=".79" stopColor="#000" />
            <stop offset="1" stopColor="#040506" />
          </linearGradient>
          <radialGradient id={`${chassisId}-reflection`} cx=".42" cy="0" r=".76" gradientTransform="translate(0 -.035) scale(1 .38)">
            <stop stopColor="#e6eefa" stopOpacity=".08" />
            <stop offset=".5" stopColor="#b9c9df" stopOpacity=".025" />
            <stop offset="1" stopColor="#b9c9df" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${chassisId}-rim`} x1="0" y1="0" x2="1" y2=".4">
            <stop stopColor="#aeb7c4" />
            <stop offset=".13" stopColor="#555d68" />
            <stop offset=".27" stopColor="#252b34" />
            <stop offset=".56" stopColor="#10141a" />
            <stop offset=".84" stopColor="#424b58" />
            <stop offset="1" stopColor="#778391" />
          </linearGradient>
          <linearGradient id={`${chassisId}-edge`} x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#ecf4ff" stopOpacity=".55" />
            <stop offset=".22" stopColor="#b8c1cc" stopOpacity=".4" />
            <stop offset=".52" stopColor="#363d47" stopOpacity=".5" />
            <stop offset=".8" stopColor="#929dab" stopOpacity=".45" />
            <stop offset="1" stopColor="#d3e3f9" stopOpacity=".45" />
          </linearGradient>
        </defs>
        <use href={`#${chassisId}-outline`} fill={`url(#${chassisId}-surface)`} />
        <use href={`#${chassisId}-outline`} fill={`url(#${chassisId}-reflection)`} />
        <g clipPath={`url(#${chassisId}-interior)`} fill="none">
          <use href={`#${chassisId}-outline`} stroke="#030405" strokeWidth="5" vectorEffect="non-scaling-stroke" />
          <use href={`#${chassisId}-outline`} stroke={`url(#${chassisId}-rim)`} strokeWidth="3" vectorEffect="non-scaling-stroke" />
        </g>
        <use href={`#${chassisId}-outline`} fill="none" stroke={`url(#${chassisId}-edge)`} strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
      </svg>
      <CageBannerPerson key={left.id} person={left} side="left" status={leftStatus} onOpenProfile={onOpenProfile} />
      <CageRingDisplay
        key={`${cage.currentMatchId}:${left.id}:${right?.id}:${cage.battleStatus}:${round}:${cage.votingOpen}:${cage.votingMode}:${format}:${demo}`}
        cage={cage}
        left={left}
        right={right}
        remaining={remaining}
        countdown={countdown}
        roundLabel={format === "open-mic" ? `PASSAGE ${matchRound}` : `${bracketRoundLabel(cage, matchRound)} · MANCHE ${round}/${roundCount}`}
        demo={demo}
      />
      {right ? <CageBannerPerson key={right.id} person={right} side="right" status={rightStatus} onOpenProfile={onOpenProfile} /> : null}
      <span className="cage-battle-banner__clock-event" aria-hidden="true">
        <i /><b>{status}</b><span>·</span><em>{eventTypeLabel(cage)}</em><span>·</span><strong>{eventName}{eventLocation ? ` · ${eventLocation}` : ""}</strong>
      </span>
    </div>
  );
}

export default function CageShellMatchup({ room, onOpenProfile }: {
  room: PlaceRoomState;
  onOpenProfile: (profileId: string) => void;
}) {
  const accountId = room.currentUserProfile?.id ?? `anonymous-cage-${room.id}`;
  const { state } = useRoomTools({ roomType: "cage", roomId: room.id, role: accountId === room.host.id ? "host" : "viewer", accountId, source: room.source });
  const [preview, setPreview] = useState<CageState | null>(null);
  useEffect(() => {
    if (room.source !== "demo") return;
    const receive = (event: Event) => setPreview((event as CustomEvent<CageState | null>).detail);
    window.addEventListener("cage-viewer-preview-state", receive);
    return () => window.removeEventListener("cage-viewer-preview-state", receive);
  }, [room.source]);
  const cage = preview ?? state?.cage ?? null;
  const { remaining, countdown } = useCageStageClock(cage);
  if (!cage) return null;

  const format = normalizedCageFormat(cage.format);
  if (format === "open-mic") {
    const entrants = cageEntrants(cage);
    const entries = cageOpenMicEntries(cage);
    const activeEntry = cage.runtime?.openMicEntries?.find((entry) => entry.id === cage.runtime?.activeEntryId);
    const foundIndex = activeEntry
      ? entries.findIndex((entry) => entry.id === activeEntry.id)
      : entries.findIndex((entry) => entry.status === "live" || entry.status === "ready");
    const currentIndex = foundIndex < 0 ? 0 : foundIndex;
    const currentEntry = entries[currentIndex];
    const nextEntry = entries.slice(currentIndex + 1).find((entry) => (entry.status === "scheduled" || entry.status === "ready") && cage.runtime?.openMicEntries?.find((passage) => passage.id === entry.id)?.status !== "POSTPONED");
    const current = entrants.find((person) => person.id === currentEntry?.personId) ?? entrants[0];
    const next = entrants.find((person) => person.id === nextEntry?.personId) ?? null;
    if (!current) return null;

    return (
      <BattleBanner cage={cage} left={withBannerGrade(current, room)} right={next ? withBannerGrade(next, room) : null} leftStatus={currentEntry?.status === "live" ? "SUR SCÈNE" : activeEntry?.status === "PERFORMED" ? "DERNIER PASSAGE" : "PROGRAMME"} rightStatus="À SUIVRE" matchRound={currentEntry?.order ?? 1} remaining={remaining} countdown={countdown} demo={room.source === "demo"} onOpenProfile={onOpenProfile} />
    );
  }

  const match = cage.matches.find((candidate) => candidate.id === (cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId));
  if (!match) {
    const upcoming = cage.matches.find(candidate => candidate.status !== "done");
    const people = cage.runtime?.participants.map(candidate => candidate.person) ?? cageEntrants(cage);
    const left: RoomPerson = upcoming?.competitorA ?? people[0] ?? { id: room.host.id, name: room.host.displayName, avatarUrl: room.host.avatarUrl, gradeLevel: room.host.gradeLevel, role: "Host", microphone: "off", camera: "off" };
    const right = upcoming?.competitorB ?? people[1] ?? null;
    if (!left) return null;
    return <BattleBanner cage={{ ...cage, battleStatus: "ready", votingOpen: false }} left={withBannerGrade(left, room)} right={right ? withBannerGrade(right, room) : null} leftStatus="À VENIR" rightStatus="À VENIR" matchRound={upcoming?.round ?? 1} remaining={remaining} countdown={countdown} demo={room.source === "demo"} onOpenProfile={onOpenProfile} />;
  }
  if (format === "open-mic-battle" && match.status === "done" && match.winnerId) {
    const winner = match.winnerId === match.competitorA.id ? match.competitorA : match.competitorB;
    const next = cage.runtime?.matches.find((candidate) => candidate.sourceA?.matchId === match.id);
    const challenger = cage.runtime?.participants.find((person) => person.id === next?.participantBId)?.person;
    return <BattleBanner cage={cage} left={withBannerGrade(winner, room)} right={challenger ? withBannerGrade(challenger, room) : null} leftStatus="RESTE SUR SCÈNE" rightStatus="PROCHAIN CHALLENGER" matchRound={match.round} remaining={remaining} countdown={countdown} demo={room.source === "demo"} onOpenProfile={onOpenProfile} />;
  }
  const liveSide = activeSide(cage);
  const revealed = !cage.resultsHidden && match.status === "done";
  const winnerLabel = format === "championship" ? "VAINQUEUR" : cage.runtime?.status === "COMPLETED" ? "CHAMPION" : "QUALIFIÉ";

  return (
    <BattleBanner cage={cage} left={withBannerGrade(match.competitorA, room)} right={withBannerGrade(match.competitorB, room)} leftStatus={revealed && match.winnerId === match.competitorA.id ? winnerLabel : liveSide === "A" ? "LIVE" : "CHALLENGER"} rightStatus={revealed && match.winnerId === match.competitorB.id ? winnerLabel : liveSide === "B" ? "LIVE" : "CHALLENGER"} matchRound={match.round} remaining={remaining} countdown={countdown} demo={room.source === "demo"} onOpenProfile={onOpenProfile} />
  );
}
