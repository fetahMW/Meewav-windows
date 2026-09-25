import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mapArtistGroupActivityRow,
  mapArtistGroupInvitationRow,
  mapArtistGroupRow,
} from "./messaging.groups.adapters";
import { toMessagingArtistGroupsError } from "./messaging.groups.errors";
import {
  createMessagingArtistGroupIdempotencyKey,
  messagingArtistGroupsRepository,
  type MessagingArtistGroupsRepository,
} from "./messaging.groups.service";
import type {
  MessagingArtistGroupActivityViewModel,
  MessagingArtistGroupAuthorityRole,
  MessagingArtistGroupDetail,
  MessagingArtistGroupInvitationDecision,
  MessagingArtistGroupInvitationViewModel,
  MessagingArtistGroupMutationResult,
  MessagingArtistGroupRosterVisibility,
  MessagingArtistGroupScope,
  MessagingArtistGroupSummaryViewModel,
  MessagingArtistGroupVisibility,
} from "./messaging.groups.types";

export type MessagingArtistGroupsLiveStatus = "idle" | "loading" | "ready" | "error";
export type MessagingArtistGroupsUserError = { code: string; message: string };

export type UseMessagingGroupsLiveOptions = {
  enabled: boolean;
  currentProfileId: string | null;
  repository?: MessagingArtistGroupsRepository;
  scope?: MessagingArtistGroupScope;
  pageSize?: number;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 20_000;
const MIN_POLL_INTERVAL_MS = 10_000;

function userError(error: unknown, fallback: "load_failed" | "mutation_failed"): MessagingArtistGroupsUserError {
  const normalized = toMessagingArtistGroupsError(error, fallback);
  return { code: normalized.code, message: normalized.message };
}

export function useMessagingGroupsLive({
  enabled,
  currentProfileId,
  repository = messagingArtistGroupsRepository,
  scope = "active",
  pageSize = 30,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseMessagingGroupsLiveOptions) {
  const active = enabled && Boolean(currentProfileId);
  const [groups, setGroups] = useState<MessagingArtistGroupSummaryViewModel[]>([]);
  const [invitations, setInvitations] = useState<MessagingArtistGroupInvitationViewModel[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<MessagingArtistGroupDetail | null>(null);
  const [activity, setActivity] = useState<MessagingArtistGroupActivityViewModel[]>([]);
  const [status, setStatus] = useState<MessagingArtistGroupsLiveStatus>("idle");
  const [invitationsStatus, setInvitationsStatus] = useState<MessagingArtistGroupsLiveStatus>("idle");
  const [detailStatus, setDetailStatus] = useState<MessagingArtistGroupsLiveStatus>("idle");
  const [error, setError] = useState<MessagingArtistGroupsUserError | null>(null);
  const [invitationsError, setInvitationsError] = useState<MessagingArtistGroupsUserError | null>(null);
  const [actionError, setActionError] = useState<MessagingArtistGroupsUserError | null>(null);
  const [mutations, setMutations] = useState<Record<string, boolean>>({});
  const generationRef = useRef(0);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const selectedRef = useRef<string | null>(null);
  const mutationPromisesRef = useRef(new Map<string, Promise<MessagingArtistGroupMutationResult>>());

  const refreshGroups = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!active) return [];
    const request = ++listRequestRef.current;
    if (!options.silent) setStatus("loading");
    if (!options.silent) setError(null);
    try {
      const rows = await repository.listMyArtistGroups({ scope, limit: pageSize });
      if (request !== listRequestRef.current) return [];
      const mapped = rows.map(mapArtistGroupRow);
      setGroups(mapped);
      setStatus("ready");
      setError(null);
      return mapped;
    } catch (caught) {
      if (request !== listRequestRef.current) return [];
      const normalized = userError(caught, "load_failed");
      setError(normalized);
      if (!options.silent) setStatus("error");
      return [];
    }
  }, [active, pageSize, repository, scope]);

  const refreshInvitations = useCallback(async () => {
    if (!active) return [];
    setInvitationsStatus("loading");
    setInvitationsError(null);
    try {
      const rows = await repository.listMyArtistGroupInvitations(null, pageSize);
      const mapped = rows.map(mapArtistGroupInvitationRow);
      setInvitations(mapped);
      setInvitationsStatus("ready");
      return mapped;
    } catch (caught) {
      setInvitationsError(userError(caught, "load_failed"));
      setInvitationsStatus("error");
      return [];
    }
  }, [active, pageSize, repository]);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    const [nextGroups] = await Promise.all([
      refreshGroups(options),
      refreshInvitations(),
    ]);
    return nextGroups;
  }, [refreshGroups, refreshInvitations]);

  const openGroup = useCallback(async (groupId: string) => {
    if (!active) return null;
    const generation = generationRef.current;
    const request = ++detailRequestRef.current;
    selectedRef.current = groupId;
    setSelectedGroupId(groupId);
    setDetailStatus("loading");
    try {
      const [detail, activityRows] = await Promise.all([
        repository.getArtistGroupDetail(groupId),
        repository.listArtistGroupActivity(groupId, null, 50),
      ]);
      if (generation !== generationRef.current || request !== detailRequestRef.current || selectedRef.current !== groupId) {
        return null;
      }
      setSelectedGroup(detail);
      setActivity(activityRows.map(mapArtistGroupActivityRow));
      setDetailStatus("ready");
      setActionError(null);
      return detail;
    } catch (caught) {
      if (generation !== generationRef.current || request !== detailRequestRef.current) return null;
      setSelectedGroup(null);
      setActivity([]);
      setDetailStatus("error");
      setActionError(userError(caught, "load_failed"));
      return null;
    }
  }, [active, repository]);

  const refreshSelected = useCallback(async () => {
    const groupId = selectedRef.current;
    return groupId ? openGroup(groupId) : null;
  }, [openGroup]);

  const runMutation = useCallback((
    mutationKey: string,
    operation: () => Promise<MessagingArtistGroupMutationResult>,
    after: (result: MessagingArtistGroupMutationResult) => Promise<unknown> = async () => undefined,
  ) => {
    const existing = mutationPromisesRef.current.get(mutationKey);
    if (existing) return existing;
    setMutations((current) => ({ ...current, [mutationKey]: true }));
    const promise = (async () => {
      try {
        const result = await operation();
        await after(result);
        setActionError(null);
        return result;
      } catch (caught) {
        setActionError(userError(caught, "mutation_failed"));
        throw caught;
      } finally {
        mutationPromisesRef.current.delete(mutationKey);
        setMutations((current) => {
          const next = { ...current };
          delete next[mutationKey];
          return next;
        });
      }
    })();
    mutationPromisesRef.current.set(mutationKey, promise);
    return promise;
  }, []);

  const createGroup = useCallback((input: {
    name: string;
    description?: string | null;
    visibility?: MessagingArtistGroupVisibility;
    artisticRole?: string | null;
  }) => runMutation("create", () => repository.createArtistGroup({
    ...input,
    idempotencyKey: createMessagingArtistGroupIdempotencyKey("group-create"),
  }), async (result) => {
    await refreshGroups({ silent: true });
    await openGroup(result.group_id);
  }), [openGroup, refreshGroups, repository, runMutation]);

  const updateGroup = useCallback((groupId: string, input: {
    name: string;
    description: string | null;
    visibility: MessagingArtistGroupVisibility;
  }) => runMutation(`update:${groupId}`, () => repository.updateArtistGroup(
    groupId, input.name, input.description, input.visibility,
    createMessagingArtistGroupIdempotencyKey("group-update"),
  ), async () => {
    await refreshGroups({ silent: true });
    await openGroup(groupId);
  }), [openGroup, refreshGroups, repository, runMutation]);

  const inviteMember = useCallback((groupId: string, profileId: string, input: {
    artisticRole?: string | null;
    message?: string | null;
  } = {}) => runMutation(`invite:${groupId}:${profileId}`, () => repository.inviteArtistGroupMember({
    groupId, profileId, ...input,
    idempotencyKey: createMessagingArtistGroupIdempotencyKey("group-invite"),
  }), async () => { await openGroup(groupId); }), [openGroup, repository, runMutation]);

  const respondInvitation = useCallback((invitationId: string, decision: MessagingArtistGroupInvitationDecision) => (
    runMutation(`invitation:${invitationId}`, () => repository.respondToArtistGroupInvitation(
      invitationId, decision, createMessagingArtistGroupIdempotencyKey(`group-${decision}`),
    ), async (result) => {
      await refresh();
      if (decision === "accept") await openGroup(result.group_id);
    })
  ), [openGroup, refresh, repository, runMutation]);

  const cancelInvitation = useCallback((invitationId: string, groupId: string) => (
    runMutation(`cancel-invitation:${invitationId}`, () => repository.cancelArtistGroupInvitation(
      invitationId, createMessagingArtistGroupIdempotencyKey("group-cancel-invite"),
    ), async () => { await openGroup(groupId); })
  ), [openGroup, repository, runMutation]);

  const setPreferences = useCallback((input: {
    groupId: string;
    notificationsEnabled?: boolean;
    rosterVisibility?: MessagingArtistGroupRosterVisibility;
    archived?: boolean;
  }) => runMutation(`preferences:${input.groupId}`, () => repository.setMyArtistGroupPreferences({
    ...input,
    idempotencyKey: createMessagingArtistGroupIdempotencyKey("group-preferences"),
  }), async () => { await refreshGroups({ silent: true }); await openGroup(input.groupId); }), [openGroup, refreshGroups, repository, runMutation]);

  const setAuthorityRole = useCallback((groupId: string, profileId: string, role: Exclude<MessagingArtistGroupAuthorityRole, "owner">) => (
    runMutation(`authority:${groupId}:${profileId}`, () => repository.setArtistGroupAuthorityRole(
      groupId, profileId, role, createMessagingArtistGroupIdempotencyKey("group-authority"),
    ), async () => { await openGroup(groupId); })
  ), [openGroup, repository, runMutation]);

  const setArtisticRole = useCallback((groupId: string, profileId: string, role: string | null) => (
    runMutation(`artistic:${groupId}:${profileId}`, () => repository.setArtistGroupArtisticRole(
      groupId, profileId, role, createMessagingArtistGroupIdempotencyKey("group-artistic"),
    ), async () => { await openGroup(groupId); })
  ), [openGroup, repository, runMutation]);

  const transferOwnership = useCallback((groupId: string, profileId: string, previousOwnerRole: "admin" | "member" = "admin") => (
    runMutation(`transfer:${groupId}`, () => repository.transferArtistGroupOwnership(
      groupId, profileId, previousOwnerRole, createMessagingArtistGroupIdempotencyKey("group-transfer"),
    ), async () => { await openGroup(groupId); })
  ), [openGroup, repository, runMutation]);

  const removeMember = useCallback((groupId: string, profileId: string) => (
    runMutation(`remove:${groupId}:${profileId}`, () => repository.removeArtistGroupMember(
      groupId, profileId, createMessagingArtistGroupIdempotencyKey("group-remove"),
    ), async () => { await openGroup(groupId); })
  ), [openGroup, repository, runMutation]);

  const leaveGroup = useCallback((groupId: string) => runMutation(`leave:${groupId}`, () => repository.leaveArtistGroup(
    groupId, createMessagingArtistGroupIdempotencyKey("group-leave"),
  ), async () => {
    selectedRef.current = null;
    setSelectedGroupId(null);
    setSelectedGroup(null);
    setActivity([]);
    await refreshGroups({ silent: true });
  }), [refreshGroups, repository, runMutation]);

  const setGroupArchived = useCallback((groupId: string, archived: boolean) => (
    runMutation(`archive:${groupId}`, () => repository.setArtistGroupArchived(
      groupId, archived, createMessagingArtistGroupIdempotencyKey(archived ? "group-archive" : "group-restore"),
    ), async () => { await refreshGroups({ silent: true }); await openGroup(groupId); })
  ), [openGroup, refreshGroups, repository, runMutation]);

  const deleteGroup = useCallback((groupId: string, confirmationName: string) => (
    runMutation(`delete:${groupId}`, () => repository.deleteArtistGroup(
      groupId, confirmationName, createMessagingArtistGroupIdempotencyKey("group-delete"),
    ), async () => {
      selectedRef.current = null;
      setSelectedGroupId(null);
      setSelectedGroup(null);
      setActivity([]);
      await refreshGroups({ silent: true });
    })
  ), [refreshGroups, repository, runMutation]);

  useEffect(() => {
    generationRef.current += 1;
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    mutationPromisesRef.current.clear();
    selectedRef.current = null;
    setGroups([]);
    setInvitations([]);
    setSelectedGroupId(null);
    setSelectedGroup(null);
    setActivity([]);
    setError(null);
    setInvitationsError(null);
    setActionError(null);
    setStatus(active ? "loading" : "idle");
    setInvitationsStatus(active ? "loading" : "idle");
    setDetailStatus("idle");
    if (active) void refresh();
  }, [active, currentProfileId, refresh, scope]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    if (pollIntervalMs < MIN_POLL_INTERVAL_MS) return undefined;
    const interval = pollIntervalMs;
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh({ silent: true });
      if (selectedRef.current) void refreshSelected();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshVisible();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(refreshVisible, interval);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(timer);
    };
  }, [active, pollIntervalMs, refresh, refreshSelected]);

  const selectedSummary = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

  return {
    groups,
    invitations,
    selectedGroupId,
    selectedSummary,
    selectedGroup,
    activity,
    status,
    invitationsStatus,
    detailStatus,
    error,
    invitationsError,
    actionError,
    mutations,
    isMutating: (key: string) => Boolean(mutations[key]),
    refresh,
    refreshGroups,
    refreshInvitations,
    openGroup,
    refreshSelected,
    createGroup,
    updateGroup,
    inviteMember,
    respondInvitation,
    cancelInvitation,
    setPreferences,
    setAuthorityRole,
    setArtisticRole,
    transferOwnership,
    removeMember,
    leaveGroup,
    setGroupArchived,
    deleteGroup,
    clearActionError: () => setActionError(null),
  };
}
