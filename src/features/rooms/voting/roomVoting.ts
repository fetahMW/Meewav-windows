export type RoomVoteMode = "public" | "mixed" | "jury";
export type RoomVotingPolicy = { mode: RoomVoteMode; jurorIds: string[]; revision: number };
export const PUBLIC_VOTING: RoomVotingPolicy = { mode: "public", jurorIds: [], revision: 0 };
export const VOTE_MODE_LABELS: Record<RoomVoteMode, string> = { public: "Public", mixed: "Public + jury", jury: "Jury uniquement" };

export function canCastRoomVote(policy: RoomVotingPolicy = PUBLIC_VOTING, accountId: string) {
  return Boolean(accountId) && (policy.mode !== "jury" || policy.jurorIds.includes(accountId));
}

/** Each juror has one ballot and never also belongs to the public group. */
export function tallyRoomVote<T extends string | number>(policy: RoomVotingPolicy = PUBLIC_VOTING, ballots: Record<string, T>, choices: readonly T[]) {
  const publicCounts = choices.map(() => 0), juryCounts = choices.map(() => 0);
  for (const [id, choice] of Object.entries(ballots)) {
    const index = choices.indexOf(choice);
    if (index < 0) continue;
    (policy.mode !== "public" && policy.jurorIds.includes(id) ? juryCounts : publicCounts)[index]++;
  }
  const publicTotal = publicCounts.reduce((a,b) => a+b,0), juryTotal = juryCounts.reduce((a,b) => a+b,0);
  const ready = policy.mode === "mixed" ? publicTotal > 0 && juryTotal > 0 : policy.mode === "jury" ? juryTotal > 0 : publicTotal > 0;
  const percentages = choices.map((_,index) => policy.mode === "mixed"
    ? (publicTotal ? 50 * publicCounts[index] / publicTotal : 0) + (juryTotal ? 50 * juryCounts[index] / juryTotal : 0)
    : policy.mode === "jury" ? (juryTotal ? 100 * juryCounts[index] / juryTotal : 0)
    : publicTotal ? 100 * publicCounts[index] / publicTotal : 0);
  return { publicCounts, juryCounts, publicTotal, juryTotal, percentages, ready,
    total: policy.mode === "jury" ? juryTotal : policy.mode === "public" ? publicTotal : publicTotal + juryTotal };
}

export function validateRoomVotingPolicy(mode: RoomVoteMode, jurorIds: string[], backstageIds: readonly string[]) {
  if (!["public", "mixed", "jury"].includes(mode)) throw new Error("Mode de vote invalide.");
  const ids = [...new Set(jurorIds)];
  if (ids.length > 4 || (mode !== "public" && !ids.length)) throw new Error("Choisis de 1 à 4 jurés dans les coulisses.");
  if (ids.some(id => !backstageIds.includes(id))) throw new Error("Les jurés doivent être présents dans les coulisses au moment de la sélection.");
  return ids;
}
