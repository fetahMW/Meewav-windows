import type {
  CageEventFormat,
  CageMatch,
  CageOpenMicEntry,
  CageSeedingMode,
  CageState,
  RoomPerson,
} from "./roomTools.types";

export const DEFAULT_CAGE_EVENT: NonNullable<CageState["event"]> = {
  title: "Cage Masters — Paris",
  discipline: "Toutes disciplines",
  status: "ready",
  seeding: "ranking",
  updatedAt: "2026-08-21T16:00:00.000Z",
};

export function cageEvent(cage: CageState): NonNullable<CageState["event"]> {
  return { ...DEFAULT_CAGE_EVENT, ...cage.event };
}

export function normalizedCageFormat(format: CageState["format"]): CageEventFormat {
  return format === "championship" || format === "open-mic" || format === "open-mic-battle" ? format : "tournament";
}

export function cageEntrants(cage: CageState): RoomPerson[] {
  if (cage.runtime) return cage.runtime.participants.map((participant) => participant.person);
  const entrants = new Map<string, RoomPerson>();
  cage.matches.forEach((match) => {
    entrants.set(match.competitorA.id, match.competitorA);
    entrants.set(match.competitorB.id, match.competitorB);
  });
  return Array.from(entrants.values());
}

export function cageOpenMicSlot(index: number) {
  const minutes = 21 * 60 + index * 4;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function cageOpenMicEntries(cage: CageState): CageOpenMicEntry[] {
  if (cage.openMicEntries?.length) return [...cage.openMicEntries].sort((a, b) => a.order - b.order);
  return cageEntrants(cage).map((person, index) => ({
    id: `open-mic-${person.id}`,
    personId: person.id,
    order: index + 1,
    status: index === 0 ? "ready" : "scheduled",
    slot: cageOpenMicSlot(index),
  }));
}

function seededEntrants(entrants: RoomPerson[], mode: CageSeedingMode, seed: number) {
  if (mode !== "random" || entrants.length < 3) return [...entrants];
  // Stable inside one revision, but a new generation produces a visibly new draw.
  const shuffled = [...entrants];
  let state = (seed || 1) >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const destination = state % (index + 1);
    [shuffled[index], shuffled[destination]] = [shuffled[destination], shuffled[index]];
  }
  return shuffled;
}

function tournamentMatches(entrants: RoomPerson[]): CageMatch[] {
  if (entrants.length < 2) return [];
  const size = 2 ** Math.floor(Math.log2(entrants.length));
  const bracketEntrants = entrants.slice(0, Math.max(2, size));
  const rounds = Math.log2(bracketEntrants.length);
  const matches: CageMatch[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    const matchCount = bracketEntrants.length / 2 ** round;
    for (let index = 0; index < matchCount; index += 1) {
      const firstRoundIndex = index * 2 ** round;
      const competitorA = round === 1
        ? bracketEntrants[index * 2]
        : bracketEntrants[firstRoundIndex];
      const competitorB = round === 1
        ? bracketEntrants[index * 2 + 1]
        : bracketEntrants[Math.min(firstRoundIndex + 2 ** (round - 1), bracketEntrants.length - 1)];
      matches.push({
        id: `tournament-r${round}-m${index + 1}`,
        round,
        competitorA,
        competitorB,
        status: round === 1 ? "ready" : "scheduled",
        scoreA: 0,
        scoreB: 0,
      });
    }
  }
  return matches;
}

function championshipMatches(entrants: RoomPerson[]): CageMatch[] {
  if (entrants.length < 2) return [];
  const rotation = [...entrants];
  if (rotation.length % 2) rotation.push(rotation[rotation.length - 1]);
  const rounds = rotation.length - 1;
  const matches: CageMatch[] = [];

  for (let round = 1; round <= rounds; round += 1) {
    for (let index = 0; index < rotation.length / 2; index += 1) {
      const competitorA = rotation[index];
      const competitorB = rotation[rotation.length - 1 - index];
      matches.push({
        id: `championship-r${round}-m${index + 1}`,
        round,
        competitorA,
        competitorB,
        status: round === 1 ? "ready" : "scheduled",
        scoreA: 0,
        scoreB: 0,
      });
    }
    rotation.splice(1, 0, rotation.pop()!);
  }
  return matches;
}

export function generateCageStructure(cage: CageState, format: CageEventFormat, seeding: CageSeedingMode, seed: number) {
  const entrants = seededEntrants(cageEntrants(cage), seeding, seed);
  const now = new Date().toISOString();
  const event = { ...cageEvent(cage), seeding, status: "ready" as const, updatedAt: now };

  if (format === "open-mic") {
    const openMicEntries = entrants.map((person, index): CageOpenMicEntry => ({
      id: `open-mic-${person.id}`,
      personId: person.id,
      order: index + 1,
      status: index === 0 ? "ready" : "scheduled",
      slot: cageOpenMicSlot(index),
    }));
    return {
      format,
      event,
      openMicEntries,
      battleRound: 1,
      battleStatus: "ready" as const,
      battleStartedAt: null,
      battleElapsedSeconds: 0,
      battleActiveSide: null,
      battleCountdownEndsAt: null,
      votingOpen: false,
      votingEndsAt: null,
      resultsHidden: true,
      votes: {},
    };
  }

  const matches = format === "championship"
    ? championshipMatches(entrants)
    : tournamentMatches(entrants);
  return {
    format,
    event,
    matches,
    currentMatchId: matches[0]?.id ?? cage.currentMatchId,
    currentRound: 1,
    battleRound: 1,
    battleStatus: "ready" as const,
    battleActiveSide: null,
    battleCountdownEndsAt: null,
    votingOpen: false,
    votingEndsAt: null,
    resultsHidden: true,
    votes: {},
    resultHistory: [],
  };
}

export function cageStandings(cage: CageState) {
  return cageEntrants(cage).map((person) => {
    const played = cage.matches.filter((match) => match.status === "done" && (match.competitorA.id === person.id || match.competitorB.id === person.id));
    const wins = played.filter((match) => match.winnerId === person.id).length;
    const draws = played.filter((match) => !match.winnerId && match.scoreA === match.scoreB).length;
    const scoreFor = played.reduce((sum, match) => sum + (match.competitorA.id === person.id ? match.scoreA : match.scoreB), 0);
    const scoreAgainst = played.reduce((sum, match) => sum + (match.competitorA.id === person.id ? match.scoreB : match.scoreA), 0);
    return {
      person,
      played: played.length,
      wins,
      draws,
      losses: Math.max(0, played.length - wins - draws),
      points: wins * 3 + draws,
      difference: scoreFor - scoreAgainst,
    };
  }).sort((a, b) => b.points - a.points || b.difference - a.difference || a.person.name.localeCompare(b.person.name, "fr"));
}
