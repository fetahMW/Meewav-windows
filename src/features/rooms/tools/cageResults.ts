import type { CageCompetitionRuntime } from "./cageCompetition.types";
import type { RoomPerson } from "./roomTools.types";
export type CageResultRow = { person: RoomPerson; rank: number; score: number; label: string };
export function cageResults(runtime: CageCompetitionRuntime, matchId?: string | null): CageResultRow[] {
  const finished = runtime.matches.filter((match) => ["RESOLVED", "CLOSED"].includes(match.status));
  if (matchId) {
    const match = finished.find((item) => item.id === matchId);
    if (!match?.winnerId) return [];
    return [match.winnerId, match.participantAId === match.winnerId ? match.participantBId : match.participantAId].flatMap((id, index) => {
      const person = runtime.participants.find((item) => item.id === id)?.person;
      const weighted = match.vote?.votingMode && match.vote.votingMode !== "public";
      const score = weighted ? (id === match.participantAId ? match.vote?.weightedScoreA ?? 0 : match.vote?.weightedScoreB ?? 0) : id === match.participantAId ? match.vote?.scoreA ?? 0 : match.vote?.scoreB ?? 0;
      return person ? [{person, rank:index+1, score, label: match.resolution === "forfeit" ? index === 0 ? "Victoire par forfait" : "Forfait" : weighted ? `${score.toFixed(1)} %` : `${score} votes`}] : [];
    });
  }
  if (runtime.status !== "COMPLETED") return [];
  if (runtime.config.format === "open-mic" && runtime.config.rules.openMicFeedback === "none") return [];
  const finalRound = Math.max(0, ...finished.map((match) => match.round));
  const rows = runtime.participants.filter((participant) => participant.seed !== null).flatMap((participant) => {
    let score = 0, label = "";
    if (runtime.config.format === "open-mic") {
      const entry = runtime.openMicEntries?.find((item) => item.participantId === participant.id);
      if (!entry?.feedback?.closedAt || entry.status !== "PERFORMED") return [];
      score = runtime.config.rules.openMicFeedback === "scored" ? entry.feedback.average ?? 0 : entry.feedback.count;
      label = runtime.config.rules.openMicFeedback === "scored" ? `${score.toFixed(1)} / 5 · ${entry.feedback.count} votes` : `${score} votes`;
    } else if (runtime.config.format === "championship") {
      score = finished.filter((match) => match.winnerId === participant.id).length;
      label = `${score} victoire${score > 1 ? "s" : ""}`;
    } else {
      const rounds = finished.filter((match) => [match.participantAId, match.participantBId].includes(participant.id));
      const last = rounds.sort((a,b) => b.round-a.round)[0];
      if (!last) return [];
      score = last.round + (last.round === finalRound && last.winnerId === participant.id ? 1 : 0);
      label = runtime.config.format === "open-mic-battle" ? `${score > finalRound ? "Dernier gagnant" : `Sorti au duel ${last.round}`} · ${finished.filter((match) => match.winnerId === participant.id).length} victoire(s)` : score > finalRound ? "Vainqueur" : last.round === finalRound ? "Finaliste" : last.round === finalRound-1 ? "Demi-finaliste" : `Tour ${last.round}`;
    }
    return [{person:participant.person, rank:0, score, label}];
  }).sort((a,b) => b.score-a.score || a.person.name.localeCompare(b.person.name));
  rows.forEach((row,index) => { row.rank = index && row.score === rows[index-1].score ? rows[index-1].rank : index+1; });
  return rows;
}
