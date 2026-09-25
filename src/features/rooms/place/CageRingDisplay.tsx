import { Pause, Play, TimerReset } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { normalizedCageFormat } from "../tools/cageTools.domain";
import type { CageState, RoomPerson } from "../tools/roomTools.types";
import { formatCageStageTime } from "./cageStageClock";
import "./cage-ring-display.css";
import { formatPlaceRoomTime, usePlaceRoomTime } from "./placeRoomTime";

type RingAnnouncement = {
  id: string;
  label: string;
  lines: [string, string?];
  tone: "neutral" | "left" | "right";
};

type CageRingDisplayProps = {
  cage: CageState;
  left: RoomPerson;
  right: RoomPerson | null;
  remaining: number;
  countdown: number | null;
  roundLabel: string;
  demo: boolean;
};

function ringAnnouncements({ cage, left, right }: CageRingDisplayProps): RingAnnouncement[] {
  if (cage.battleStatus === "paused") return [{ id: "paused", label: "PAUSE RÉGIE", lines: ["On reprend bientôt.", "Restez avec nous."], tone: "neutral" }];
  if (cage.battleStatus === "incident") return [{ id: "incident", label: "RÉGIE", lines: ["Le direct reste avec vous.", "La régie intervient."], tone: "neutral" }];
  const current = cage.runtime?.matches.find((match) => match.id === cage.runtime?.activeMatchId);
  if (current?.status === "VOTING") return [
    { id: "vote", label: "LES VOTES SONT OUVERTS", lines: ["Le public a le dernier mot.", "Faites entendre votre voix !"], tone: "neutral" },
    { id: "vote-hidden", label: "À VOUS DE JUGER", lines: ["Deux talents. Une seule voix.", "À vous de faire la différence."], tone: "neutral" },
  ];
  if (current?.status === "TIE_BREAK") return [{ id: "tie-break", label: "ÉGALITÉ", lines: ["Le duel continue !", "Place à la manche décisive."], tone: "neutral" }];
  if (current?.winnerId) {
    const winner = cage.runtime?.participants.find((person) => person.id === current.winnerId)?.person.name ?? "Le vainqueur";
    return [
      { id: "verdict", label: cage.runtime?.status === "COMPLETED" ? "COMPÉTITION TERMINÉE" : "LE VERDICT", lines: [winner, "remporte la rencontre !"], tone: "neutral" },
      { id: "respect", label: "RESPECT AUX ARTISTES", lines: ["Bravo aux deux talents.", "Merci pour cette rencontre !"], tone: "neutral" },
    ];
  }
  if (current?.status === "READY_FOR_VOTE") return [{ id: "ready-vote", label: "LES PERFORMANCES SONT TERMINÉES", lines: ["Deux univers se sont exprimés.", "Le vote va bientôt ouvrir."], tone: "neutral" }];
  if (current?.status === "IN_PROGRESS" && cage.runtime) {
    const step = current.steps[current.stepIndex];
    const artist = step?.side === "B" ? right ?? left : left;
    const following = cage.runtime.matches.find((match) => match.id === cage.runtime?.preparedMatchId);
    const nextNames = following ? [following.participantAId, following.participantBId].map((id) => cage.runtime?.participants.find((person) => person.id === id)?.person.name).filter((name): name is string => Boolean(name)) : [];
    return [
      { id: `performance-${artist.id}`, label: "SOUS LES PROJECTEURS", lines: step?.side === "BOTH" ? ["Deux univers sur le ring.", "Faites vibrer La Cage !"] : [artist.name, "À toi de faire vibrer La Cage !"], tone: step?.side === "B" ? "right" : "left" },
      { id: "audience-listening", label: "LE PUBLIC DÉCIDERA", lines: ["Écoutez chaque performance.", "Votre voix fera la différence."], tone: "neutral" },
      ...(nextNames.length === 2 ? [{ id: `next-${following?.id}`, label: "SE PRÉPARENT EN COULISSES", lines: [nextNames[0], `face à ${nextNames[1]}`] as [string, string], tone: "neutral" as const }] : []),
    ];
  }
  if (normalizedCageFormat(cage.format) === "open-mic") return [
    { id: "open-mic", label: "OPEN MIC", lines: [left.name, "Une scène. Ton univers."], tone: "neutral" },
    { id: "open-mic-public", label: "LE TALENT SE PARTAGE", lines: ["Faites vibrer toute la salle.", "Chaque passage est unique."], tone: "neutral" },
  ];
  return [
    { id: "starting", label: "LE RING SE PRÉPARE", lines: ["Le battle va bientôt commencer.", "Préparez-vous à vibrer !"], tone: "neutral" },
    { id: "contenders", label: "FACE À FACE", lines: [left.name, right ? `face à ${right.name}` : "Le talent entre dans l’arène."], tone: "neutral" },
    { id: "warmup", label: "FAITES DU BRUIT", lines: ["Le combat approche.", "Montrez votre soutien !"], tone: "neutral" },
    { id: "listen", label: "À VOUS DE JUGER", lines: ["Deux univers, une rencontre.", "Écoutez chaque détail."], tone: "neutral" },
  ];
}

/** Two unbroken lines, fitted to the actual available width, including long stage names. */
function RingHeadline({ lines }: { lines: RingAnnouncement["lines"] }) {
  const ref = useRef<HTMLElement>(null);
  const text = lines.join("\n");
  useLayoutEffect(() => {
    const element = ref.current;
    const screen = element?.closest(".cage-ring-display__screen");
    if (!element || !screen) return;
    const fit = () => {
      const spans = [...element.querySelectorAll("span")];
      spans.forEach((span) => { span.style.fontSize = ""; });
      const available = element.clientWidth - 8;
      const widest = Math.max(...spans.map((span) => span.scrollWidth));
      if (available > 0 && widest > available) {
        const size = parseFloat(getComputedStyle(element).fontSize) * available / widest;
        spans.forEach((span) => { span.style.fontSize = `${size}px`; });
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(screen);
    let mounted = true;
    void document.fonts.ready.then(() => { if (mounted) fit(); });
    return () => { mounted = false; observer.disconnect(); };
  }, [text]);
  return <strong ref={ref}>{lines.filter(Boolean).map((line, index) => <span key={index}>{line}</span>)}</strong>;
}

export default function CageRingDisplay(props: CageRingDisplayProps) {
  const { cage, remaining, countdown, roundLabel, demo } = props;
  const roomTime = usePlaceRoomTime();
  const controlled = !cage.runtime && roomTime.enabled;
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const announcements = ringAnnouncements(props);
  const interrupted = cage.battleStatus === "paused" || cage.battleStatus === "incident";
  const urgentClock = cage.battleStatus === "countdown"
    || ((cage.battleStatus === "live-a" || cage.battleStatus === "live-b") && remaining > 0 && remaining <= 10);
  const announcementVisible = !urgentClock && (interrupted || step % 2 === 1);
  const announcement = announcements[interrupted ? 0 : Math.floor(step / 2) % announcements.length];
  const canRotate = !interrupted && !urgentClock;
  const formattedTime = controlled ? formatPlaceRoomTime(roomTime.remainingMs) : formatCageStageTime(remaining);

  useEffect(() => { setStep(0); }, [controlled, roomTime.durationSeconds]);

  useEffect(() => {
    if (!canRotate || paused) return undefined;
    const timeout = window.setTimeout(() => {
      setStep((current) => (current + 1) % (announcements.length * 2));
    }, step % 2 === 0 ? 4_500 : 5_500);
    return () => window.clearTimeout(timeout);
  }, [announcements.length, canRotate, paused, step]);

  return <span
    className={`cage-battle-banner__clock-core cage-ring-display${announcementVisible ? " is-announcement" : ""}${interrupted ? " is-interrupted" : ""} is-${announcement.tone}`}
    data-ring-slide={announcementVisible ? announcement.id : "clock"}
  >
    <span className="cage-ring-display__screen">
      <span className="cage-ring-display__clock" aria-hidden={announcementVisible}>
        {!controlled && cage.battleStatus === "countdown" ? (
          <strong className="cage-battle-banner__clock-countdown">{countdown === null ? <TimerReset aria-hidden="true" /> : countdown || "GO"}</strong>
        ) : <time aria-label="Temps restant">{formattedTime}</time>}
      </span>
      <span className="cage-ring-display__announcement" aria-hidden={!announcementVisible} aria-live={demo ? "off" : "polite"} aria-atomic="true">
        <small>{announcement.label}</small>
        <RingHeadline lines={announcement.lines} />
      </span>
    </span>
    <em>{roundLabel}<span className="cage-ring-display__backup-clock" aria-hidden={!announcementVisible}>{formattedTime}</span></em>
    {canRotate ? <button
      type="button"
      className="cage-ring-display__playback"
      aria-label={paused ? "Reprendre les annonces" : "Mettre les annonces en pause"}
      title={paused ? "Reprendre les annonces" : "Mettre les annonces en pause"}
      aria-pressed={paused}
      onClick={() => setPaused((current) => !current)}
    >{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button> : null}
  </span>;
}
