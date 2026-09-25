import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mapCollaborationRowToViewModel, replaceCollaborationStatus } from "./messaging.collaboration.adapters";
import { withServerCollaborationAttachments } from "./messaging.attachments.workspace-adapters";
import {
  MessagingCollaborationError,
  toMessagingCollaborationError,
} from "./messaging.collaboration.errors";
import {
  createMessagingCollaborationIdempotencyKey,
  messagingCollaborationRepository,
  type MessagingCollaborationRepository,
} from "./messaging.collaboration.service";
import type {
  MessagingCollaborationDecision,
  MessagingCollaborationRequestRow,
  MessagingCollaborationRequestWithAttachmentsRow,
  MessagingCollaborationScope,
  MessagingCollaborationStatus,
  MessagingCollaborationTransitionResult,
  MessagingCollaborationViewedResult,
} from "./messaging.collaboration.types";

export type MessagingCollaborationsLiveStatus = "idle" | "loading" | "ready" | "error";

export type MessagingCollaborationUserError = {
  code: string;
  message: string;
};

export type MessagingCollaborationMutation = "view" | "accept" | "decline" | "cancel";

export type UseMessagingCollaborationsLiveOptions = {
  enabled: boolean;
  currentProfileId: string | null;
  repository?: MessagingCollaborationRepository;
  scopes?: readonly MessagingCollaborationScope[];
  statusesByScope?: Partial<Record<MessagingCollaborationScope, MessagingCollaborationStatus[] | null>>;
  pageSize?: number;
  pollIntervalMs?: number;
};

const DEFAULT_SCOPES: readonly MessagingCollaborationScope[] = ["received", "sent"];
const DEFAULT_POLL_INTERVAL_MS = 20_000;
const MIN_POLL_INTERVAL_MS = 10_000;

function userError(error: unknown, fallback: "load_failed" | "mutation_failed"): MessagingCollaborationUserError {
  const normalized = toMessagingCollaborationError(error, fallback);
  return { code: normalized.code, message: normalized.message };
}

function uniqueScopes(scopes: readonly MessagingCollaborationScope[]) {
  return [...new Set(scopes)];
}

function stableStatusesKey(
  scopes: readonly MessagingCollaborationScope[],
  statuses: UseMessagingCollaborationsLiveOptions["statusesByScope"],
) {
  return JSON.stringify(scopes.map((scope) => [scope, statuses?.[scope] ?? null]));
}

function scopeCursor(rows: MessagingCollaborationRequestRow[]) {
  return rows.length > 0 ? rows[rows.length - 1].page_cursor : null;
}

export function useMessagingCollaborationsLive({
  enabled,
  currentProfileId,
  repository = messagingCollaborationRepository,
  scopes: requestedScopes = DEFAULT_SCOPES,
  statusesByScope,
  pageSize = 30,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseMessagingCollaborationsLiveOptions) {
  const scopesKey = [...requestedScopes].sort().join("|");
  const scopes = useMemo(
    () => uniqueScopes(requestedScopes),
    // The key intentionally makes equivalent caller-created arrays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopesKey],
  );
  const statusesKey = stableStatusesKey(scopes, statusesByScope);
  const active = enabled && Boolean(currentProfileId) && scopes.length > 0;
  const [rowsByScope, setRowsByScope] = useState<Partial<Record<MessagingCollaborationScope, MessagingCollaborationRequestRow[]>>>({});
  const [status, setStatus] = useState<MessagingCollaborationsLiveStatus>("idle");
  const [error, setError] = useState<MessagingCollaborationUserError | null>(null);
  const [actionError, setActionError] = useState<MessagingCollaborationUserError | null>(null);
  const [hasMoreByScope, setHasMoreByScope] = useState<Partial<Record<MessagingCollaborationScope, boolean>>>({});
  const [mutations, setMutations] = useState<Record<string, MessagingCollaborationMutation>>({});

  const rowsRef = useRef(rowsByScope);
  const statusesByScopeRef = useRef(statusesByScope);
  statusesByScopeRef.current = statusesByScope;
  const generationRef = useRef(0);
  const requestVersionRef = useRef(new Map<MessagingCollaborationScope, number>());
  const transitionKeysRef = useRef(new Map<string, string>());
  const transitionPromisesRef = useRef(new Map<string, Promise<MessagingCollaborationTransitionResult>>());
  const viewPromisesRef = useRef(new Map<string, Promise<MessagingCollaborationViewedResult>>());

  const replaceScopeRows = useCallback((
    scope: MessagingCollaborationScope,
    updater: (current: MessagingCollaborationRequestRow[]) => MessagingCollaborationRequestRow[],
  ) => {
    setRowsByScope((current) => {
      const next = { ...current, [scope]: updater(current[scope] ?? []) };
      rowsRef.current = next;
      return next;
    });
  }, []);

  const replaceRequest = useCallback((
    requestId: string,
    updater: (row: MessagingCollaborationRequestRow) => MessagingCollaborationRequestRow,
  ) => {
    setRowsByScope((current) => {
      let changed = false;
      const next = { ...current };
      for (const scope of Object.keys(current) as MessagingCollaborationScope[]) {
        const rows = current[scope] ?? [];
        const mapped = rows.map((row) => {
          if (row.request_id !== requestId) return row;
          changed = true;
          return updater(row);
        });
        if (changed) next[scope] = mapped;
      }
      if (!changed) return current;
      rowsRef.current = next;
      return next;
    });
  }, []);

  const setMutation = useCallback((requestId: string, mutation: MessagingCollaborationMutation | null) => {
    setMutations((current) => {
      if (mutation) return { ...current, [requestId]: mutation };
      if (!(requestId in current)) return current;
      const next = { ...current };
      delete next[requestId];
      return next;
    });
  }, []);

  const refreshScope = useCallback(async (
    scope: MessagingCollaborationScope,
    options: { append?: boolean } = {},
  ) => {
    if (!active) return [];
    const generation = generationRef.current;
    const requestVersion = (requestVersionRef.current.get(scope) ?? 0) + 1;
    requestVersionRef.current.set(scope, requestVersion);
    const currentRows = rowsRef.current[scope] ?? [];
    try {
      const incoming = await repository.listMyCollaborationRequests({
        scope,
        statuses: statusesByScopeRef.current?.[scope] ?? null,
        cursor: options.append ? scopeCursor(currentRows) : null,
        limit: pageSize,
      });
      if (generation !== generationRef.current || requestVersionRef.current.get(scope) !== requestVersion) {
        return [];
      }
      replaceScopeRows(scope, (current) => {
        if (!options.append) return incoming;
        const byId = new Map(current.map((row) => [row.request_id, row]));
        for (const row of incoming) byId.set(row.request_id, row);
        return [...byId.values()];
      });
      setHasMoreByScope((current) => ({ ...current, [scope]: incoming.length === pageSize }));
      return incoming;
    } catch (caught) {
      if (generation === generationRef.current && requestVersionRef.current.get(scope) === requestVersion) {
        throw toMessagingCollaborationError(caught, "load_failed");
      }
      return [];
    }
  }, [active, pageSize, replaceScopeRows, repository]);

  const refresh = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!active) return [];
    if (!options.silent) setStatus("loading");
    if (!options.silent) setError(null);
    const generation = generationRef.current;
    const results = await Promise.allSettled(scopes.map((scope) => refreshScope(scope)));
    if (generation !== generationRef.current) return [];
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (rejected) {
      const normalized = userError(rejected.reason, "load_failed");
      setError(normalized);
      setStatus("error");
      return [];
    }
    setError(null);
    setStatus("ready");
    return results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  }, [active, refreshScope, scopes]);

  const loadMore = useCallback(async (scope: MessagingCollaborationScope) => {
    if (!hasMoreByScope[scope]) return [];
    try {
      return await refreshScope(scope, { append: true });
    } catch (caught) {
      const normalized = userError(caught, "load_failed");
      setError(normalized);
      throw toMessagingCollaborationError(caught, "load_failed");
    }
  }, [hasMoreByScope, refreshScope]);

  const markViewed = useCallback((requestId: string) => {
    const existing = viewPromisesRef.current.get(requestId);
    if (existing) return existing;
    const generation = generationRef.current;
    const promise = (async () => {
      setMutation(requestId, "view");
      replaceRequest(requestId, (row) => ({
        ...row,
        is_unread: false,
        viewed_at: row.viewed_at ?? new Date().toISOString(),
      }));
      try {
        const result = await repository.markCollaborationRequestViewed(requestId);
        if (generation === generationRef.current) {
          replaceRequest(requestId, (row) => ({ ...row, is_unread: false, viewed_at: result.viewed_at }));
          setActionError(null);
        }
        return result;
      } catch (caught) {
        const normalized = toMessagingCollaborationError(caught, "mutation_failed");
        if (generation === generationRef.current) {
          setActionError({ code: normalized.code, message: normalized.message });
          void refresh({ silent: true });
        }
        throw normalized;
      } finally {
        if (generation === generationRef.current) {
          viewPromisesRef.current.delete(requestId);
          setMutation(requestId, null);
        }
      }
    })();
    viewPromisesRef.current.set(requestId, promise);
    return promise;
  }, [refresh, replaceRequest, repository, setMutation]);

  const transition = useCallback((requestId: string, mutation: Exclude<MessagingCollaborationMutation, "view">) => {
    // A collaboration request has one terminal transition. Keying only by the
    // request closes the accept/decline/cancel double-click race in the client;
    // the database lock remains the final authority.
    const operationKey = requestId;
    const existing = transitionPromisesRef.current.get(operationKey);
    if (existing) return existing;
    const idempotencyKey = transitionKeysRef.current.get(operationKey)
      ?? createMessagingCollaborationIdempotencyKey(`collab-${mutation}`);
    transitionKeysRef.current.set(operationKey, idempotencyKey);
    const generation = generationRef.current;
    const promise = (async () => {
      setMutation(requestId, mutation);
      try {
        const result = mutation === "cancel"
          ? await repository.cancelCollaborationRequest(requestId, idempotencyKey)
          : await repository.respondToCollaborationRequest(
            requestId,
            mutation as MessagingCollaborationDecision,
            idempotencyKey,
          );
        if (generation === generationRef.current) {
          replaceRequest(requestId, (row) => replaceCollaborationStatus(
            row,
            result.status,
            result.conversation_id,
          ));
          setActionError(null);
        }
        return result;
      } catch (caught) {
        const normalized = toMessagingCollaborationError(caught, "mutation_failed");
        if (generation === generationRef.current) {
          setActionError({ code: normalized.code, message: normalized.message });
        }
        throw normalized;
      } finally {
        if (generation === generationRef.current) {
          transitionPromisesRef.current.delete(operationKey);
          setMutation(requestId, null);
        }
      }
    })();
    transitionPromisesRef.current.set(operationKey, promise);
    return promise;
  }, [replaceRequest, repository, setMutation]);

  useEffect(() => {
    generationRef.current += 1;
    requestVersionRef.current.clear();
    transitionPromisesRef.current.clear();
    transitionKeysRef.current.clear();
    viewPromisesRef.current.clear();
    rowsRef.current = {};
    setRowsByScope({});
    setHasMoreByScope({});
    setMutations({});
    setError(null);
    setActionError(null);
    setStatus(active ? "loading" : "idle");
    if (active) void refresh();
  }, [active, currentProfileId, refresh, scopesKey, statusesKey]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    if (pollIntervalMs < MIN_POLL_INTERVAL_MS) return undefined;
    const interval = pollIntervalMs;
    const refreshVisible = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refresh({ silent: true });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshVisible();
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const timer = window.setInterval(refreshVisible, interval);
    return () => {
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(timer);
    };
  }, [active, pollIntervalMs, refresh]);

  const rows = useMemo(() => {
    const byId = new Map<string, MessagingCollaborationRequestRow>();
    for (const scope of scopes) {
      for (const row of rowsByScope[scope] ?? []) byId.set(row.request_id, row);
    }
    return [...byId.values()].sort((left, right) => {
      const leftDate = left.page_cursor?.sort_at ?? left.created_at;
      const rightDate = right.page_cursor?.sort_at ?? right.created_at;
      return rightDate.localeCompare(leftDate) || right.request_id.localeCompare(left.request_id);
    });
  }, [rowsByScope, scopes]);

  const items = useMemo(
    () => currentProfileId
      ? rows.map((row) => {
        const item = mapCollaborationRowToViewModel(row, currentProfileId);
        const attachments = (row as Partial<MessagingCollaborationRequestWithAttachmentsRow>).attachments;
        return Array.isArray(attachments)
          ? withServerCollaborationAttachments(item, attachments)
          : item;
      })
      : [],
    [currentProfileId, rows],
  );

  return {
    rows,
    items,
    status,
    error,
    actionError,
    unreadCount: rows.filter((row) => row.is_unread).length,
    hasMoreByScope,
    mutations,
    refresh,
    refreshScope,
    loadMore,
    markViewed,
    acceptRequest: (requestId: string) => transition(requestId, "accept"),
    declineRequest: (requestId: string) => transition(requestId, "decline"),
    cancelRequest: (requestId: string) => transition(requestId, "cancel"),
    isMutating: (requestId: string) => Boolean(mutations[requestId]),
    clearActionError: () => setActionError(null),
  };
}

export function isMessagingCollaborationError(error: unknown): error is MessagingCollaborationError {
  return error instanceof MessagingCollaborationError;
}
