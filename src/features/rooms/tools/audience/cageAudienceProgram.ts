import type { CageCompetitionMatch } from "../cageCompetition.types";
import type { CageState, RoomPerson } from "../roomTools.types";

export type AudienceMatch = {
  id: string; round: number; ordinal: number; a?: RoomPerson; b?: RoomPerson;
  completed: boolean; winner?: RoomPerson;
};

/** Public projection, following iOS rooms-goal cd2d40d7. Never show a host's draft roster. */
export function cageAudienceProgram(cage: CageState, accountId: string | undefined, now: number) {
  const runtime = cage.runtime;
  const published = runtime ? runtime.publicBracketVisible : ["published", "live", "completed"].includes(cage.event?.status ?? "");
  const format = runtime?.config.format ?? cage.format;
  const formatTitle = !published ? "Programme" : format === "championship" ? "Championnat" : format === "tournament" ? "Tournoi" : "Duel";
  const person = (id: string | null) => runtime?.participants.find(item => item.id === id)?.person;
  const project = (match: CageCompetitionMatch): AudienceMatch => ({
    id: match.id, round: match.round, ordinal: match.order, a: person(match.participantAId), b: person(match.participantBId),
    completed: ["RESOLVED", "CLOSED"].includes(match.status),
    winner: !cage.resultsHidden || runtime?.publicResults && (!runtime.publicResults.matchId || runtime.publicResults.matchId === match.id) ? person(match.winnerId) : undefined,
  });
  const legacy = cage.matches.map((match, index): AudienceMatch => ({
    id: match.id, round: match.round, ordinal: index + 1, a: match.competitorA, b: match.competitorB,
    completed: match.status === "done", winner: !cage.resultsHidden ? [match.competitorA, match.competitorB].find(p => p.id === match.winnerId) : undefined,
  }));
  const matches = published ? runtime ? runtime.matches.map(project).sort((a, b) => a.round - b.round || a.ordinal - b.ordinal) : legacy : [];
  const current = runtime?.matches.find(match => match.id === runtime.activeMatchId);
  const onAir = current && ["ON_STAGE", "IN_PROGRESS", "PAUSED", "READY_FOR_VOTE", "VOTING", "TIE_BREAK", "RESOLVED", "CLOSED"].includes(current.status);
  const active = runtime ? current && (published || onAir) ? project(current) : undefined : published ? legacy.find(match => match.id === cage.currentMatchId) : undefined;
  const legacySide = cage.battleStatus === "live-b" ? "B" : cage.battleActiveSide ?? "A";
  const step = current?.steps[current.stepIndex] ?? (!runtime && active ? { side: legacySide, durationSeconds: cage.passageDurationSeconds ?? 90 } : undefined);
  const nextStep = current?.steps[current.stepIndex + 1] ?? (!runtime && legacySide === "A" ? { side: "B" } : undefined);
  const performing = runtime ? current?.status === "IN_PROGRESS" : Boolean(active && ["live-a", "live-b", "countdown"].includes(cage.battleStatus));
  const currentPerson = step?.side === "A" ? active?.a : step?.side === "B" ? active?.b : undefined;
  const nextPerson = nextStep?.side === "A" ? active?.a : nextStep?.side === "B" ? active?.b : undefined;
  const mine = Boolean(accountId && currentPerson?.id === accountId);
  const voting = runtime ? current?.status === "VOTING" && Boolean(current.vote?.open) : cage.votingOpen;
  const deadline = voting ? current?.vote?.endsAt ?? cage.votingEndsAt : null;
  const countdown = performing && cage.battleCountdownEndsAt && Date.parse(cage.battleCountdownEndsAt) > now ? Date.parse(cage.battleCountdownEndsAt) : null;
  const startedAt = runtime ? current?.timer.startedAt : cage.battleStartedAt;
  const elapsed = (runtime ? current?.timer.elapsedSeconds ?? 0 : cage.battleElapsedSeconds ?? 0) + (performing && startedAt ? Math.max(0, (now - Date.parse(startedAt)) / 1000) : 0);
  const seconds = countdown ? Math.ceil((countdown - now) / 1000) : deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now) / 1000)) : step && (performing || current?.status === "PAUSED") ? Math.max(0, Math.ceil(step.durationSeconds - elapsed)) : null;
  const competing = Boolean(accountId && [active?.a?.id, active?.b?.id].includes(accountId));
  let title = published ? "Programme confirmé" : "La Cage se prépare";
  let detail = published ? "Le Host annoncera le prochain duel." : "Les duels apparaîtront après confirmation.";
  if (active) {
    title = "Le duel se prépare"; detail = "Les artistes rejoignent la scène.";
    if (performing) {
      title = countdown ? mine ? "Prépare-toi, c’est ton tour" : `${currentPerson?.name ?? "Les artistes"} va commencer` : mine ? "C’est ton tour de performer" : step?.side === "BOTH" ? "Les deux artistes performent" : `${currentPerson?.name ?? "Le combattant"} performe`;
      detail = nextPerson ? nextPerson.id === accountId ? "Ensuite, ce sera ton tour." : `Ensuite · ${nextPerson.name}` : "Dernier passage de ce duel";
    } else if (voting) {
      title = "Vote ouvert"; detail = competing ? "Tu combats dans ce duel : le vote est réservé aux autres membres du public." : "Le choix de vote s’affiche directement sur le live.";
    } else if (current?.status === "PAUSED" || !runtime && ["paused", "incident"].includes(cage.battleStatus)) {
      title = "Passage en pause"; detail = "Le Host reprendra le passage depuis la régie.";
    } else if (current?.status === "READY_FOR_VOTE") {
      title = "Passages terminés"; detail = "Le vote sera annoncé par le Host.";
    } else if (active.completed) {
      title = runtime?.status === "COMPLETED" ? "Compétition terminée" : "Duel terminé";
      detail = active.winner ? `${active.winner.name} ${runtime?.status === "COMPLETED" ? "remporte la Cage" : "remporte le duel"}` : "Les résultats seront annoncés par le Host.";
    }
  }
  if (runtime?.status === "CANCELLED") { title = "Compétition interrompue"; detail = "Le Host a clôturé cette compétition."; }
  return { published, formatTitle, matches, active, title, detail, seconds: seconds !== null && Number.isFinite(seconds) ? seconds : null,
    performing, voting, mine, passage: performing && step ? current ? `${current.stepIndex + 1}/${current.steps.length}` : `${legacySide === "A" ? 1 : 2}/2` : null,
    currentVote: accountId ? runtime ? current?.vote?.ballots[accountId] : cage.votes[accountId] : undefined,
    artistCount: new Set(matches.flatMap(match => [match.a?.id, match.b?.id].filter(Boolean))).size,
  };
}
