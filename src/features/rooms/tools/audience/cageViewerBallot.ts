import type { CageState, RoomToolsCommand, RoomToolsState } from "../roomTools.types";

export function cageViewerBallot(cage: CageState, accountId: string, now = Date.now()) {
  const matchId = cage.runtime ? cage.runtime.activeMatchId : cage.currentMatchId;
  const match = cage.matches.find((item) => item.id === matchId);
  const runtimeMatch = cage.runtime?.matches.find((item) => item.id === matchId);
  if (!match || (cage.runtime && !runtimeMatch)) return null;
  const vote = runtimeMatch?.vote;
  const endsAt = cage.runtime ? vote?.endsAt : cage.votingEndsAt;
  const deadline = endsAt ? Date.parse(endsAt) : null;
  const remaining = deadline === null ? null : Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
  const open = Boolean(cage.runtime ? vote?.open && runtimeMatch?.status === "VOTING" : cage.votingOpen)
    && remaining !== 0 && !["COMPLETED", "CANCELLED"].includes(cage.runtime?.status ?? "");
  return {
    match, open, remaining,
    roundKey: `${match.id}:${vote?.roundId ?? endsAt ?? "legacy"}`,
    choice: cage.runtime ? vote?.ballots[accountId] : cage.votes[accountId],
    competing: [match.competitorA.id, match.competitorB.id].includes(accountId),
  };
}

/** Bind the vote to the match the viewer saw, never to a subsequently fetched match. */
export function cageViewerVoteCommand(state: RoomToolsState, accountId: string, choice: "A" | "B"): RoomToolsCommand {
  if (!state.cage?.runtime) return { type: "cage.vote.cast", accountId, choice };
  return { type: "cage.competition.command", action: "vote.cast", payload: { choice },
    idempotencyKey: crypto.randomUUID(), expectedRevision: state.revision,
    expectedMatchId: state.cage.runtime.activeMatchId ?? undefined };
}

export function cageAbstentionStorageKey(roomId: string, accountId: string) {
  return `meewav:cage:viewer-abstention:${encodeURIComponent(roomId)}:${encodeURIComponent(accountId)}`;
}

export function readCageAbstention(key: string) {
  try { return localStorage.getItem(key); } catch { return null; }
}

// The Windows RPC accepts A/B only. Abstaining casts no ballot; remember that
// choice on this device, including across reloads, without claiming a server vote.
export function rememberCageAbstention(key: string, roundKey: string) {
  try { localStorage.setItem(key, roundKey); } catch { /* The in-memory choice still dismisses this round. */ }
}
