import { canCastRoomVote } from "../voting/roomVoting";
import { useRoomVotingPolicy } from "../voting/useRoomVotingPolicy";
import { isRoomVotingCommand } from "../voting/roomVotingCommands";
import { useCallback, useEffect, useState } from "react";
import { roomToolsRepository, type RoomToolsRepository } from "./roomTools.service";
import { liveRoomToolsRepository } from "./roomTools.supabase";
import type { RoomActorRole, RoomToolsCommand, RoomToolsState, SpecializedRoomId } from "./roomTools.types";

export function useRoomTools({
  roomType,
  roomId,
  role,
  accountId,
  source = "demo",
  repository = source === "live" ? liveRoomToolsRepository : roomToolsRepository,
}: {
  roomType: SpecializedRoomId;
  roomId: string;
  role: RoomActorRole;
  accountId: string;
  source?: "demo" | "live";
  repository?: RoomToolsRepository;
}) {
  const {policy: votingPolicy} = useRoomVotingPolicy(roomId,source);
  const [state, setState] = useState<RoomToolsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const projectedClasseRole = state?.audience?.actorRole;
  const hasDemoClasseSeat = source === "demo"
    && state?.classe?.seats.some((seat) => seat.person?.id === accountId);
  const effectiveRole: RoomActorRole = roomType === "classe"
    && (role === "viewer" || role === "visitor")
    && (projectedClasseRole === "premium_participant" || hasDemoClasseSeat)
    ? "premium_participant"
    : role;

  useEffect(() => {
    let active = true;
    setState(null);
    setError(null);
    const applyProjection = (next: RoomToolsState) => {
      if (!active) return;
      next.votingPolicy = votingPolicy;
      if (next.wave) next.wave.votingPolicy = votingPolicy;
      if (next.cage?.runtime) next.cage.runtime.votingPolicy = votingPolicy;
      setState((current) => !current || next.revision >= current.revision ? next : current);
    };
    void repository.projectionForRole(roomType, roomId, role, accountId).then(applyProjection).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : "room_tools_load_failed");
    });
    const subscription = repository.subscribe(roomType, roomId, () => {
      void repository.projectionForRole(roomType, roomId, role, accountId)
        .then(applyProjection)
        .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "room_tools_sync_failed"); });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [accountId, repository, role, roomId, roomType, votingPolicy.revision]);

  const execute = useCallback(async (command: RoomToolsCommand) => {
    setBusy(true);
    setError(null);
    try {
      if (isRoomVotingCommand(command) && !canCastRoomVote(votingPolicy, accountId)) throw new Error("Ce vote est réservé au jury.");
      await repository.execute(roomType, roomId, effectiveRole, command, accountId);
      const next = await repository.projectionForRole(roomType, roomId, effectiveRole, accountId);
      next.votingPolicy = votingPolicy;
      if (next.wave) next.wave.votingPolicy = votingPolicy;
      if (next.cage?.runtime) next.cage.runtime.votingPolicy = votingPolicy;
      setState((current) => !current || next.revision >= current.revision ? next : current);
      return next;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "room_tool_action_failed";
      setError(message);
      throw reason;
    } finally {
      setBusy(false);
    }
  }, [accountId, effectiveRole, repository, roomId, roomType, votingPolicy]);

  const clearError = useCallback(() => setError(null), []);

  return { state, busy, error, clearError, execute, role: effectiveRole, votingPolicy, canVote: canCastRoomVote(votingPolicy,accountId) };
}
