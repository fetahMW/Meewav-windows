import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapMessagingProjectRow } from "./messaging.projects.adapters";
import { toMessagingProjectsError } from "./messaging.projects.errors";
import {
  createMessagingProjectMessageId,
  messagingProjectsRepository,
  type MessagingProjectsRepository,
} from "./messaging.projects.service";
import type {
  MessagingCreateProjectInput,
  MessagingInviteProjectMemberInput,
  MessagingProjectInvitationDecision,
  MessagingProjectInvitationRow,
  MessagingProjectRow,
  MessagingProjectStatus,
  MessagingProjectWorkspace,
  MessagingUpdateProjectInput,
  MessagingUpdateProjectMemberInput,
  MessagingUpsertProjectTaskInput,
} from "./messaging.projects.types";
import type { MessagingMessageRow } from "./messaging.types";

export type MessagingProjectsLiveStatus = "idle" | "loading" | "ready" | "error";
export type MessagingProjectsMutation =
  | "create"
  | "update"
  | "invite"
  | "respond"
  | "member"
  | "task"
  | "status"
  | "delete"
  | "message";

export type MessagingProjectsUserError = { code: string; message: string };

export type UseMessagingProjectsLiveOptions = {
  enabled: boolean;
  currentProfileId: string | null;
  repository?: MessagingProjectsRepository;
  pageSize?: number;
  pollIntervalMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 25_000;
const MIN_POLL_INTERVAL_MS = 10_000;

function userError(error: unknown, fallback: "load_failed" | "mutation_failed"): MessagingProjectsUserError {
  const normalized = toMessagingProjectsError(error, fallback);
  return { code: normalized.code, message: normalized.message };
}

function mergeById(current: MessagingProjectRow[], incoming: MessagingProjectRow[]) {
  const rows = new Map(current.map((row) => [row.project_id, row]));
  for (const row of incoming) rows.set(row.project_id, row);
  return [...rows.values()].sort((left, right) => (
    right.activity_at.localeCompare(left.activity_at)
    || right.project_id.localeCompare(left.project_id)
  ));
}

export function useMessagingProjectsLive({
  enabled,
  currentProfileId,
  repository = messagingProjectsRepository,
  pageSize = 30,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseMessagingProjectsLiveOptions) {
  const active = enabled && Boolean(currentProfileId);
  const [rows, setRows] = useState<MessagingProjectRow[]>([]);
  const [invitations, setInvitations] = useState<MessagingProjectInvitationRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<MessagingProjectWorkspace | null>(null);
  const [messages, setMessages] = useState<MessagingMessageRow[]>([]);
  const [hasMoreProjects, setHasMoreProjects] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [status, setStatus] = useState<MessagingProjectsLiveStatus>("idle");
  const [detailStatus, setDetailStatus] = useState<MessagingProjectsLiveStatus>("idle");
  const [error, setError] = useState<MessagingProjectsUserError | null>(null);
  const [actionError, setActionError] = useState<MessagingProjectsUserError | null>(null);
  const [mutations, setMutations] = useState<Record<string, MessagingProjectsMutation>>({});

  const generationRef = useRef(0);
  const listRequestRef = useRef(0);
  const detailRequestRef = useRef(0);
  const rowsRef = useRef(rows);
  const selectedRef = useRef<MessagingProjectWorkspace | null>(selectedProject);
  const mutationPromisesRef = useRef(new Map<string, Promise<unknown>>());
  rowsRef.current = rows;
  selectedRef.current = selectedProject;

  const setMutation = useCallback((key: string, mutation: MessagingProjectsMutation | null) => {
    setMutations((current) => {
      if (mutation) return { ...current, [key]: mutation };
      if (!(key in current)) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const loadInvitations = useCallback(async () => {
    if (!active) return [];
    const generation = generationRef.current;
    const [received, sent] = await Promise.all([
      repository.listInvitations({ scope: "received", statuses: ["pending"], limit: pageSize }),
      repository.listInvitations({ scope: "sent", statuses: ["pending"], limit: pageSize }),
    ]);
    const byId = new Map([...received, ...sent].map((row) => [row.invitation_id, row]));
    const next = [...byId.values()].sort((left, right) => right.created_at.localeCompare(left.created_at));
    if (generation === generationRef.current) setInvitations(next);
    return next;
  }, [active, pageSize, repository]);

  const refresh = useCallback(async (options: { silent?: boolean; append?: boolean } = {}) => {
    if (!active) return [];
    const generation = generationRef.current;
    const request = ++listRequestRef.current;
    if (!options.silent) {
      setStatus("loading");
      setError(null);
    }
    try {
      const current = rowsRef.current;
      const incoming = await repository.listProjects({
        cursor: options.append && current.length > 0 ? current[current.length - 1].page_cursor : null,
        limit: pageSize,
      });
      if (generation !== generationRef.current || request !== listRequestRef.current) return [];
      setRows((existing) => options.append ? mergeById(existing, incoming) : incoming);
      setHasMoreProjects(incoming.length === pageSize);
      if (!options.append) await loadInvitations();
      if (generation === generationRef.current && request === listRequestRef.current) {
        setStatus("ready");
        setError(null);
      }
      return incoming;
    } catch (caught) {
      if (generation === generationRef.current && request === listRequestRef.current) {
        setStatus("error");
        setError(userError(caught, "load_failed"));
      }
      throw toMessagingProjectsError(caught, "load_failed");
    }
  }, [active, loadInvitations, pageSize, repository]);

  const selectProject = useCallback(async (projectId: string | null, options: { silent?: boolean } = {}) => {
    const generation = generationRef.current;
    const request = ++detailRequestRef.current;
    setSelectedProjectId(projectId);
    if (!projectId || !active) {
      setSelectedProject(null);
      setMessages([]);
      setHasMoreMessages(false);
      setDetailStatus("idle");
      return null;
    }
    if (!options.silent) setDetailStatus("loading");
    try {
      const workspace = await repository.getProject(projectId);
      const loadedMessages = await repository.listProjectMessages(workspace.conversation_id, null, 50);
      if (generation !== generationRef.current || request !== detailRequestRef.current) return null;
      setSelectedProject(workspace);
      setMessages(loadedMessages);
      setHasMoreMessages(loadedMessages.length === 50);
      setDetailStatus("ready");
      setActionError(null);
      return workspace;
    } catch (caught) {
      if (generation === generationRef.current && request === detailRequestRef.current) {
        setDetailStatus("error");
        setActionError(userError(caught, "load_failed"));
      }
      throw toMessagingProjectsError(caught, "load_failed");
    }
  }, [active, repository]);

  const refreshSelected = useCallback(async () => {
    if (!selectedProjectId) return null;
    return selectProject(selectedProjectId, { silent: true });
  }, [selectProject, selectedProjectId]);

  const runMutation = useCallback(<T,>(
    key: string,
    mutation: MessagingProjectsMutation,
    operation: () => Promise<T>,
    options: { refreshDetail?: boolean; refreshInvitations?: boolean } = {},
  ): Promise<T> => {
    const existing = mutationPromisesRef.current.get(key);
    if (existing) return existing as Promise<T>;
    const generation = generationRef.current;
    setMutation(key, mutation);
    const promise = (async () => {
      try {
        const result = await operation();
        if (generation !== generationRef.current) return result;
        setActionError(null);
        await refresh({ silent: true });
        if (generation !== generationRef.current) return result;
        if (options.refreshInvitations) await loadInvitations();
        if (generation !== generationRef.current) return result;
        if (options.refreshDetail !== false && selectedProjectId) await refreshSelected();
        return result;
      } catch (caught) {
        const normalized = toMessagingProjectsError(caught, "mutation_failed");
        if (generation === generationRef.current) {
          setActionError({ code: normalized.code, message: normalized.message });
        }
        throw normalized;
      } finally {
        mutationPromisesRef.current.delete(key);
        if (generation === generationRef.current) setMutation(key, null);
      }
    })();
    mutationPromisesRef.current.set(key, promise);
    return promise;
  }, [loadInvitations, refresh, refreshSelected, selectedProjectId, setMutation]);

  const loadOlderMessages = useCallback(async () => {
    const workspace = selectedRef.current;
    if (!workspace || messages.length === 0 || !hasMoreMessages) return [];
    const generation = generationRef.current;
    const projectId = workspace.project_id;
    const oldest = Math.min(...messages.map((message) => Number(message.sequence)));
    const incoming = await repository.listProjectMessages(workspace.conversation_id, oldest, 50);
    if (generation !== generationRef.current || selectedRef.current?.project_id !== projectId) return [];
    setMessages((current) => {
      const byId = new Map([...current, ...incoming].map((message) => [message.id, message]));
      return [...byId.values()].sort((left, right) => Number(left.sequence) - Number(right.sequence));
    });
    setHasMoreMessages(incoming.length === 50);
    return incoming;
  }, [hasMoreMessages, messages, repository]);

  const sendText = useCallback(async (body: string, clientMessageId = createMessagingProjectMessageId()) => {
    const workspace = selectedRef.current;
    if (!workspace) throw toMessagingProjectsError({ message: "project_not_found" }, "mutation_failed");
    return runMutation(
      `message:${clientMessageId}`,
      "message",
      () => repository.sendProjectText(workspace.conversation_id, body, clientMessageId),
    );
  }, [repository, runMutation]);

  useEffect(() => {
    generationRef.current += 1;
    listRequestRef.current += 1;
    detailRequestRef.current += 1;
    setRows([]);
    setInvitations([]);
    setSelectedProjectId(null);
    setSelectedProject(null);
    setMessages([]);
    setHasMoreProjects(false);
    setHasMoreMessages(false);
    setError(null);
    setActionError(null);
    setMutations({});
    mutationPromisesRef.current.clear();
    setStatus(active ? "loading" : "idle");
    setDetailStatus("idle");
    if (active) void refresh().catch(() => undefined);
  }, [active, currentProfileId, refresh]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    if (pollIntervalMs < MIN_POLL_INTERVAL_MS) return undefined;
    const interval = pollIntervalMs;
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh({ silent: true }).catch(() => undefined);
      if (selectedRef.current) void refreshSelected().catch(() => undefined);
    };
    window.addEventListener("focus", refreshVisible);
    const timer = window.setInterval(refreshVisible, interval);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      window.clearInterval(timer);
    };
  }, [active, pollIntervalMs, refresh, refreshSelected]);

  const items = useMemo(() => rows.map(mapMessagingProjectRow), [rows]);

  return {
    rows,
    items,
    invitations,
    selectedProjectId,
    selectedProject,
    messages,
    hasMoreProjects,
    hasMoreMessages,
    status,
    detailStatus,
    error,
    actionError,
    mutations,
    refresh,
    loadMore: () => refresh({ silent: true, append: true }),
    selectProject,
    refreshSelected,
    loadOlderMessages,
    createProject: (input: MessagingCreateProjectInput) => runMutation(
      `create:${input.idempotencyKey}`, "create", () => repository.createProject(input),
      { refreshDetail: false },
    ),
    updateProject: (input: MessagingUpdateProjectInput) => runMutation(
      `project:${input.projectId}`, "update", () => repository.updateProject(input),
    ),
    inviteMember: (input: MessagingInviteProjectMemberInput) => runMutation(
      `invite:${input.idempotencyKey}`, "invite", () => repository.inviteMember(input),
      { refreshInvitations: true },
    ),
    respondToInvitation: (
      invitationId: string,
      decision: MessagingProjectInvitationDecision,
      idempotencyKey: string,
    ) => runMutation(
      `invitation:${invitationId}`, "respond",
      () => repository.respondToInvitation(invitationId, decision, idempotencyKey),
      { refreshInvitations: true },
    ),
    cancelInvitation: (invitationId: string) => runMutation(
      `invitation:${invitationId}`, "respond", () => repository.cancelInvitation(invitationId),
      { refreshInvitations: true },
    ),
    updateMember: (input: MessagingUpdateProjectMemberInput) => runMutation(
      `member:${input.profileId}`, "member", () => repository.updateMember(input),
    ),
    transferOwnership: (projectId: string, successorProfileId: string) => runMutation(
      `member:${successorProfileId}`, "member", () => repository.transferOwnership(projectId, successorProfileId),
    ),
    removeMember: (projectId: string, profileId: string) => runMutation(
      `member:${profileId}`, "member", () => repository.removeOrLeave(projectId, profileId),
    ),
    leaveProject: async (projectId: string) => {
      const result = await runMutation(
        `project:${projectId}`, "member", () => repository.removeOrLeave(projectId),
        { refreshDetail: false },
      );
      if (selectedRef.current?.project_id === projectId) await selectProject(null);
      return result;
    },
    upsertTask: (input: MessagingUpsertProjectTaskInput) => runMutation(
      `task:${input.taskId}`, "task", () => repository.upsertTask(input),
    ),
    deleteTask: (projectId: string, taskId: string) => runMutation(
      `task:${taskId}`, "task", () => repository.deleteTask(projectId, taskId),
    ),
    setProjectStatus: (projectId: string, nextStatus: MessagingProjectStatus, expectedUpdatedAt?: string | null) => runMutation(
      `project:${projectId}`, "status", () => repository.setStatus(projectId, nextStatus, expectedUpdatedAt),
    ),
    deleteProject: async (projectId: string) => {
      const result = await runMutation(
        `project:${projectId}`, "delete", () => repository.deleteProject(projectId),
        { refreshDetail: false },
      );
      if (selectedRef.current?.project_id === projectId) await selectProject(null);
      return result;
    },
    sendText,
    isMutating: (key: string) => Boolean(mutations[key]),
    clearActionError: () => setActionError(null),
  };
}
