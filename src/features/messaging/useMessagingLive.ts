import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  mapConversationRowToViewModel,
  mapMessageRowToViewModel,
  mapMessageableProfileToContact,
  sortOldestMessageFirst,
  summarizeMessagingReactions,
  type MessagingConversationViewModel,
  type MessagingMessageViewModel,
} from "./messaging.adapters";
import {
  MessagingServiceError,
  toMessagingServiceError,
} from "./messaging.errors";
import {
  createMessagingClientMessageId,
  createMessagingIdempotencyKey,
  messagingRepository,
  type MessagingRepository,
} from "./messaging.service";
import type { DemoContact } from "./messagingDemoData";
import { mapServerMessageToDemoMessage } from "./messaging.attachments.workspace-adapters";
import type { MessagingMessageWithAttachments } from "./messaging.attachments.types";
import type {
  MessagingConversationCursor,
  MessagingConversationInvitationRow,
  MessagingPreferencesInput,
  MessagingReportCategory,
  MessagingReportSubject,
  MessagingMessageRow,
  MessagingSendTextInput,
} from "./messaging.types";

export type MessagingLiveStatus = "idle" | "loading" | "ready" | "error";

export type MessagingUserError = {
  code: string;
  message: string;
};

export type MessagingPreferencePatch = {
  pinned?: boolean;
  mutedUntil?: string | null;
  archived?: boolean;
  notificationsEnabled?: boolean;
};

export type UseMessagingLiveOptions = {
  enabled: boolean;
  currentProfileId: string | null;
  repository?: MessagingRepository;
  pageSize?: number;
  pollIntervalMs?: number;
};

const MIN_POLL_INTERVAL_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 20_000;

function userError(error: unknown, fallback: "load_failed" | "mutation_failed"): MessagingUserError {
  const normalized = toMessagingServiceError(error, fallback);
  return { code: normalized.code, message: normalized.message };
}

function mergeMessages(
  current: MessagingMessageViewModel[],
  incoming: MessagingMessageViewModel[],
) {
  const byClientId = new Map<string, MessagingMessageViewModel>();
  for (const message of current) byClientId.set(message.server.clientMessageId, message);
  for (const message of incoming) byClientId.set(message.server.clientMessageId, message);
  return [...byClientId.values()].sort((left, right) => {
    const sequenceOrder = left.server.sequence - right.server.sequence;
    if (sequenceOrder !== 0) return sequenceOrder;
    return left.server.createdAt.localeCompare(right.server.createdAt);
  });
}

function mapLiveMessage(
  row: MessagingMessageRow,
  currentProfileId: string,
): MessagingMessageViewModel {
  const base = mapMessageRowToViewModel(row, currentProfileId);
  if (!("attachments" in row) || !Array.isArray(row.attachments)) return base;
  const structured = mapServerMessageToDemoMessage({
    message: row as MessagingMessageWithAttachments,
    currentProfileId,
    time: base.time,
  });
  return {
    ...base,
    ...structured,
    reactions: base.reactions,
    deliveryStatus: base.deliveryStatus,
    server: base.server,
  };
}

function pendingMessage(
  input: MessagingSendTextInput,
  currentProfileId: string,
  sequence: number,
): MessagingMessageViewModel {
  const createdAt = new Date().toISOString();
  return {
    id: `pending:${input.clientMessageId}`,
    sourceId: input.clientMessageId,
    author: "me",
    kind: "text",
    body: input.body.trim(),
    time: new Date(createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    replyToId: input.replyToMessageId ?? undefined,
    reactions: [],
    deliveryStatus: "pending",
    server: {
      conversationId: input.conversationId,
      senderProfileId: currentProfileId,
      clientMessageId: input.clientMessageId,
      sequence,
      createdAt,
      editedAt: null,
      deleted: false,
      pinnedAt: null,
      pinnedByProfileId: null,
      reactionRows: [],
    },
  };
}

export function useMessagingLive({
  enabled,
  currentProfileId,
  repository = messagingRepository,
  pageSize = 30,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: UseMessagingLiveOptions) {
  const active = enabled && Boolean(currentProfileId);
  const [conversations, setConversations] = useState<MessagingConversationViewModel[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessagingMessageViewModel[]>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inboxStatus, setInboxStatus] = useState<MessagingLiveStatus>("idle");
  const [messagesStatus, setMessagesStatus] = useState<MessagingLiveStatus>("idle");
  const [inboxError, setInboxError] = useState<MessagingUserError | null>(null);
  const [messagesError, setMessagesError] = useState<MessagingUserError | null>(null);
  const [actionError, setActionError] = useState<MessagingUserError | null>(null);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [contacts, setContacts] = useState<DemoContact[]>([]);
  const [contactsStatus, setContactsStatus] = useState<MessagingLiveStatus>("idle");
  const [contactsError, setContactsError] = useState<MessagingUserError | null>(null);
  const [conversationInvitations, setConversationInvitations] = useState<MessagingConversationInvitationRow[]>([]);
  const [invitationStatus, setInvitationStatus] = useState<MessagingLiveStatus>("idle");
  const [invitationError, setInvitationError] = useState<MessagingUserError | null>(null);
  const [invitationMutations, setInvitationMutations] = useState<Record<string, boolean>>({});
  const [safetyMutations, setSafetyMutations] = useState<Record<string, boolean>>({});

  const conversationsRef = useRef(conversations);
  const messagesRef = useRef(messagesByConversation);
  const selectedRef = useRef(selectedConversationId);
  const inboxRequestRef = useRef(0);
  const messageRequestRef = useRef(0);
  const contactRequestRef = useRef(0);
  const invitationRequestRef = useRef(0);
  const invitationPromisesRef = useRef(new Map<string, Promise<boolean>>());
  const safetyPromisesRef = useRef(new Map<string, Promise<unknown>>());
  const messageActionPromisesRef = useRef(new Map<string, Promise<unknown>>());
  const outboxRef = useRef(new Map<string, MessagingSendTextInput>());

  const replaceConversations = useCallback((updater: (current: MessagingConversationViewModel[]) => MessagingConversationViewModel[]) => {
    setConversations((current) => {
      const next = updater(current);
      conversationsRef.current = next;
      return next;
    });
  }, []);

  const replaceMessages = useCallback((
    conversationId: string,
    updater: (current: MessagingMessageViewModel[]) => MessagingMessageViewModel[],
  ) => {
    setMessagesByConversation((current) => {
      const next = {
        ...current,
        [conversationId]: updater(current[conversationId] ?? []),
      };
      messagesRef.current = next;
      return next;
    });
  }, []);

  const refreshInbox = useCallback(async (options: {
    append?: boolean;
    silent?: boolean;
    cursor?: MessagingConversationCursor | null;
  } = {}) => {
    if (!active) return [];
    const requestId = ++inboxRequestRef.current;
    if (!options.silent) setInboxStatus("loading");
    if (!options.silent) setInboxError(null);

    try {
      const rows = await repository.listConversations({
        cursor: options.cursor ?? null,
        limit: pageSize,
        kinds: ["direct", "group"],
      });
      if (requestId !== inboxRequestRef.current) return [];
      const mapped = rows.map((row) => mapConversationRowToViewModel(row));
      replaceConversations((current) => {
        if (!options.append) return mapped;
        const merged = new Map(current.map((conversation) => [conversation.id, conversation]));
        mapped.forEach((conversation) => merged.set(conversation.id, conversation));
        return [...merged.values()];
      });
      setHasMoreConversations(rows.length >= pageSize);
      setInboxStatus("ready");
      setInboxError(null);
      return mapped;
    } catch (error) {
      if (requestId !== inboxRequestRef.current) return [];
      const normalized = userError(error, "load_failed");
      setInboxError(normalized);
      if (!options.silent) setInboxStatus("error");
      return [];
    }
  }, [active, pageSize, replaceConversations, repository]);

  const loadMoreConversations = useCallback(async () => {
    if (!hasMoreConversations || inboxStatus === "loading") return [];
    const lastConversation = conversationsRef.current[conversationsRef.current.length - 1];
    const cursor = lastConversation?.server.cursor ?? null;
    return refreshInbox({ append: true, cursor });
  }, [hasMoreConversations, inboxStatus, refreshInbox]);

  const refreshConversationInvitations = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!active) return [];
    const requestId = ++invitationRequestRef.current;
    if (!options.silent) setInvitationStatus("loading");
    if (!options.silent) setInvitationError(null);
    try {
      const rows = await repository.listConversationInvitations(30);
      if (requestId !== invitationRequestRef.current) return [];
      setConversationInvitations(rows);
      setInvitationStatus("ready");
      setInvitationError(null);
      return rows;
    } catch (error) {
      if (requestId !== invitationRequestRef.current) return [];
      setInvitationError(userError(error, "load_failed"));
      if (!options.silent) setInvitationStatus("error");
      return [];
    }
  }, [active, repository]);

  const markConversationRead = useCallback(async (
    conversationId = selectedRef.current,
    throughSequence?: number | null,
  ) => {
    if (!active || !conversationId) return false;
    try {
      await repository.markConversationRead(conversationId, throughSequence);
      replaceConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? { ...conversation, unread: 0 }
        : conversation));
      return true;
    } catch (error) {
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [active, replaceConversations, repository]);

  const loadConversationMessages = useCallback(async (
    conversationId: string,
    options: { select?: boolean; silent?: boolean; markRead?: boolean } = {},
  ) => {
    if (!active || !currentProfileId) return [];
    const select = options.select ?? true;
    if (select) {
      selectedRef.current = conversationId;
      setSelectedConversationId(conversationId);
    }
    const requestId = ++messageRequestRef.current;
    if (!options.silent) setMessagesStatus("loading");
    if (!options.silent) setMessagesError(null);

    try {
      const rows = await repository.listMessages({ conversationId, limit: 50 });
      if (requestId !== messageRequestRef.current || selectedRef.current !== conversationId) return [];
      const mapped = sortOldestMessageFirst(rows).map((row) => mapLiveMessage(row, currentProfileId));
      replaceMessages(conversationId, (current) => mergeMessages(
        current.filter((message) => message.deliveryStatus === "pending" || message.deliveryStatus === "failed"),
        mapped,
      ));
      setHasMoreMessages(rows.length >= 50);
      setMessagesStatus("ready");
      setMessagesError(null);
      if (options.markRead ?? true) {
        const lastMessage = mapped[mapped.length - 1];
        const lastSequence = lastMessage?.server.sequence ?? null;
        void markConversationRead(conversationId, lastSequence);
      }
      return mapped;
    } catch (error) {
      if (requestId !== messageRequestRef.current || selectedRef.current !== conversationId) return [];
      setMessagesError(userError(error, "load_failed"));
      if (!options.silent) setMessagesStatus("error");
      return [];
    }
  }, [active, currentProfileId, markConversationRead, replaceMessages, repository]);

  const openConversation = useCallback((conversationId: string) => (
    loadConversationMessages(conversationId, { select: true, markRead: true })
  ), [loadConversationMessages]);

  const refreshSelectedConversation = useCallback(() => {
    const conversationId = selectedRef.current;
    if (!conversationId) return Promise.resolve([]);
    return loadConversationMessages(conversationId, {
      select: false,
      silent: true,
      markRead: false,
    });
  }, [loadConversationMessages]);

  const respondToConversationInvitation = useCallback((conversationId: string, accept: boolean) => {
    // One in-flight decision per invitation prevents a fast accept/decline
    // double click from racing two opposite transitions.
    const operationKey = conversationId;
    const existing = invitationPromisesRef.current.get(operationKey);
    if (existing) return existing;
    const promise = (async () => {
      setInvitationMutations((current) => ({ ...current, [conversationId]: true }));
      try {
        await repository.respondToConversationInvitation(conversationId, accept);
        setConversationInvitations((current) => current.filter((item) => item.conversation_id !== conversationId));
        setActionError(null);
        if (accept) {
          await refreshInbox({ silent: true });
          await openConversation(conversationId);
        }
        return true;
      } catch (error) {
        setActionError(userError(error, "mutation_failed"));
        return false;
      } finally {
        invitationPromisesRef.current.delete(operationKey);
        setInvitationMutations((current) => {
          const next = { ...current };
          delete next[conversationId];
          return next;
        });
      }
    })();
    invitationPromisesRef.current.set(operationKey, promise);
    return promise;
  }, [openConversation, refreshInbox, repository]);

  const loadOlderMessages = useCallback(async () => {
    const conversationId = selectedRef.current;
    const currentProfile = currentProfileId;
    if (!active || !conversationId || !currentProfile || !hasMoreMessages || messagesStatus === "loading") return [];
    const current = messagesRef.current[conversationId] ?? [];
    const firstServerSequence = current
      .filter((message) => message.deliveryStatus !== "pending" && message.deliveryStatus !== "failed")
      .reduce<number | null>((minimum, message) => minimum === null ? message.server.sequence : Math.min(minimum, message.server.sequence), null);
    if (firstServerSequence === null) return [];

    try {
      const rows = await repository.listMessages({
        conversationId,
        beforeSequence: firstServerSequence,
        limit: 50,
      });
      if (selectedRef.current !== conversationId) return [];
      const mapped = sortOldestMessageFirst(rows).map((row) => mapLiveMessage(row, currentProfile));
      replaceMessages(conversationId, (existing) => mergeMessages(mapped, existing));
      setHasMoreMessages(rows.length >= 50);
      return mapped;
    } catch (error) {
      setMessagesError(userError(error, "load_failed"));
      return [];
    }
  }, [active, currentProfileId, hasMoreMessages, messagesStatus, replaceMessages, repository]);

  const deliverMessage = useCallback(async (clientMessageId: string) => {
    const input = outboxRef.current.get(clientMessageId);
    if (!input) return false;
    replaceMessages(input.conversationId, (current) => current.map((message) => message.server.clientMessageId === clientMessageId
      ? { ...message, deliveryStatus: "pending" }
      : message));
    setActionError(null);

    try {
      const result = await repository.sendTextMessage(input);
      replaceMessages(input.conversationId, (current) => current.map((message) => {
        if (message.server.clientMessageId !== clientMessageId) return message;
        return {
          ...message,
          id: result.message_id,
          deliveryStatus: "sent",
          time: new Date(result.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
          server: {
            ...message.server,
            sequence: result.sequence,
            createdAt: result.created_at,
          },
        };
      }));
      outboxRef.current.delete(clientMessageId);
      void refreshInbox({ silent: true });
      return true;
    } catch (error) {
      replaceMessages(input.conversationId, (current) => current.map((message) => message.server.clientMessageId === clientMessageId
        ? { ...message, deliveryStatus: "failed" }
        : message));
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [refreshInbox, replaceMessages, repository]);

  const sendText = useCallback(async (body: string, replyToMessageId?: string | null) => {
    const conversationId = selectedRef.current;
    if (!active || !currentProfileId || !conversationId || !body.trim()) return null;
    const clientMessageId = createMessagingClientMessageId();
    const input: MessagingSendTextInput = {
      conversationId,
      clientMessageId,
      body: body.trim(),
      replyToMessageId: replyToMessageId ?? null,
    };
    outboxRef.current.set(clientMessageId, input);
    const messages = messagesRef.current[conversationId] ?? [];
    const sequence = messages.reduce((maximum, message) => Math.max(maximum, message.server.sequence), 0) + 1;
    replaceMessages(conversationId, (current) => [...current, pendingMessage(input, currentProfileId, sequence)]);
    const delivered = await deliverMessage(clientMessageId);
    return delivered ? clientMessageId : null;
  }, [active, currentProfileId, deliverMessage, replaceMessages]);

  const retryMessage = useCallback((clientMessageId: string) => deliverMessage(clientMessageId), [deliverMessage]);

  const updateConversationPreferences = useCallback(async (
    conversationId: string,
    patch: MessagingPreferencePatch,
  ) => {
    const previous = conversationsRef.current.find((conversation) => conversation.id === conversationId);
    if (!active || !previous) return false;
    const input: MessagingPreferencesInput = {
      conversationId,
      pinned: patch.pinned ?? Boolean(previous.pinned),
      mutedUntil: patch.mutedUntil === undefined ? previous.server.mutedUntil : patch.mutedUntil,
      archived: patch.archived ?? previous.server.archived,
      notificationsEnabled: patch.notificationsEnabled ?? previous.server.notificationsEnabled,
    };
    const muted = Boolean(input.mutedUntil && new Date(input.mutedUntil) > new Date());
    replaceConversations((current) => current.map((conversation) => conversation.id === conversationId
      ? {
        ...conversation,
        pinned: input.pinned,
        muted,
        server: {
          ...conversation.server,
          mutedUntil: input.mutedUntil ?? null,
          archived: input.archived,
          notificationsEnabled: input.notificationsEnabled ?? true,
        },
      }
      : conversation));

    try {
      const result = await repository.setConversationPreferences(input);
      replaceConversations((current) => current.map((conversation) => conversation.id === conversationId
        ? {
          ...conversation,
          pinned: Boolean(result.pinned_at),
          muted: Boolean(result.muted_until && new Date(result.muted_until) > new Date()),
          server: {
            ...conversation.server,
            pinnedAt: result.pinned_at,
            mutedUntil: result.muted_until,
            archivedAt: result.archived_at,
            archived: Boolean(result.archived_at),
            notificationsEnabled: result.notifications_enabled,
          },
        }
        : conversation));
      if (result.archived_at) {
        replaceConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
        if (selectedRef.current === conversationId) {
          selectedRef.current = null;
          setSelectedConversationId(null);
          setMessagesStatus("idle");
        }
      }
      setActionError(null);
      return true;
    } catch (error) {
      replaceConversations((current) => current.map((conversation) => conversation.id === conversationId ? previous : conversation));
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [active, replaceConversations, repository]);

  const setConversationHidden = useCallback(async (conversationId: string, hidden: boolean) => {
    const previous = conversationsRef.current;
    if (!active) return false;
    if (hidden) replaceConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
    try {
      await repository.setConversationHidden(conversationId, hidden);
      if (selectedRef.current === conversationId && hidden) {
        selectedRef.current = null;
        setSelectedConversationId(null);
        setMessagesStatus("idle");
      }
      if (!hidden) await refreshInbox({ silent: true });
      setActionError(null);
      return true;
    } catch (error) {
      conversationsRef.current = previous;
      setConversations(previous);
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [active, refreshInbox, replaceConversations, repository]);

  const leaveGroupConversation = useCallback(async (conversationId: string) => {
    const previous = conversationsRef.current;
    const target = previous.find((conversation) => conversation.id === conversationId);
    if (!active || target?.server.kind !== "group") return false;
    try {
      await repository.leaveGroupConversation(conversationId);
      replaceConversations((current) => current.filter((conversation) => conversation.id !== conversationId));
      if (selectedRef.current === conversationId) {
        selectedRef.current = null;
        setSelectedConversationId(null);
        setMessagesStatus("idle");
      }
      setActionError(null);
      return true;
    } catch (error) {
      conversationsRef.current = previous;
      setConversations(previous);
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [active, replaceConversations, repository]);

  const setMessageReaction = useCallback(async (messageId: string, emoji: string, desiredActive: boolean) => {
    const conversationId = selectedRef.current;
    const profileId = currentProfileId;
    if (!active || !conversationId || !profileId) return false;

    const apply = (activeState: boolean) => replaceMessages(conversationId, (current) => current.map((message) => {
      if (message.id !== messageId) return message;
      const withoutMine = message.server.reactionRows.filter((reaction) => !(reaction.profile_id === profileId && reaction.emoji === emoji));
      const reactionRows = activeState
        ? [...withoutMine, { profile_id: profileId, emoji, created_at: new Date().toISOString() }]
        : withoutMine;
      return {
        ...message,
        reactions: summarizeMessagingReactions(reactionRows),
        server: { ...message.server, reactionRows },
      };
    }));
    const previousActive = Boolean((messagesRef.current[conversationId] ?? [])
      .find((message) => message.id === messageId)?.server.reactionRows
      .some((reaction) => reaction.profile_id === profileId && reaction.emoji === emoji));
    apply(desiredActive);

    try {
      await repository.setMessageReaction(messageId, emoji, desiredActive);
      setActionError(null);
      return true;
    } catch (error) {
      apply(previousActive);
      setActionError(userError(error, "mutation_failed"));
      return false;
    }
  }, [active, currentProfileId, replaceMessages, repository]);

  const setMessagePinned = useCallback((messageId: string, pinned: boolean) => {
    const conversationId = selectedRef.current;
    if (!active || !conversationId) return Promise.resolve(false);
    const operationKey = `pin:${messageId}`;
    const existing = messageActionPromisesRef.current.get(operationKey);
    if (existing) return existing as Promise<boolean>;

    const previous = (messagesRef.current[conversationId] ?? []).find((message) => message.id === messageId);
    if (!previous || previous.server.deleted || previous.deliveryStatus === "pending") {
      return Promise.resolve(false);
    }

    const apply = (nextPinned: boolean, pinnedAt: string | null, pinnedByProfileId: string | null) => {
      replaceMessages(conversationId, (current) => current.map((message) => message.id === messageId
        ? {
          ...message,
          pinned: nextPinned,
          server: {
            ...message.server,
            pinnedAt,
            pinnedByProfileId,
          },
        }
        : message));
    };

    apply(pinned, pinned ? new Date().toISOString() : null, pinned ? currentProfileId : null);
    const operation = (async () => {
      try {
        const result = await repository.setMessagePinned(messageId, pinned);
        apply(result.pinned, result.pinned_at, result.pinned_by_profile_id);
        setActionError(null);
        return true;
      } catch (error) {
        replaceMessages(conversationId, (current) => current.map((message) => (
          message.id === messageId ? previous : message
        )));
        setActionError(userError(error, "mutation_failed"));
        return false;
      } finally {
        messageActionPromisesRef.current.delete(operationKey);
      }
    })();
    messageActionPromisesRef.current.set(operationKey, operation);
    return operation;
  }, [active, currentProfileId, replaceMessages, repository]);

  const deleteMessage = useCallback((messageId: string) => {
    const conversationId = selectedRef.current;
    if (!active || !conversationId) return Promise.resolve(false);
    const operationKey = `delete:${messageId}`;
    const existing = messageActionPromisesRef.current.get(operationKey);
    if (existing) return existing as Promise<boolean>;

    const previous = (messagesRef.current[conversationId] ?? []).find((message) => message.id === messageId);
    if (!previous || previous.server.deleted || previous.deliveryStatus === "pending") {
      return Promise.resolve(false);
    }

    replaceMessages(conversationId, (current) => current.map((message) => message.id === messageId
      ? {
        ...message,
        body: "Message supprimé",
        deleted: true,
        reactions: [],
        attachments: [],
        pinned: false,
        server: {
          ...message.server,
          deleted: true,
          pinnedAt: null,
          pinnedByProfileId: null,
          reactionRows: [],
        },
      }
      : message));

    const operation = (async () => {
      try {
        await repository.deleteMessage(messageId);
        setActionError(null);
        void refreshInbox({ silent: true });
        return true;
      } catch (error) {
        replaceMessages(conversationId, (current) => current.map((message) => (
          message.id === messageId ? previous : message
        )));
        setActionError(userError(error, "mutation_failed"));
        return false;
      } finally {
        messageActionPromisesRef.current.delete(operationKey);
      }
    })();
    messageActionPromisesRef.current.set(operationKey, operation);
    return operation;
  }, [active, refreshInbox, replaceMessages, repository]);

  const forwardMessage = useCallback((messageId: string, targetConversationId: string) => {
    if (!active || !currentProfileId) return Promise.resolve(false);
    const clientMessageId = createMessagingClientMessageId();
    const operationKey = `forward:${messageId}:${targetConversationId}`;
    const existing = messageActionPromisesRef.current.get(operationKey);
    if (existing) return existing as Promise<boolean>;

    const operation = (async () => {
      try {
        const result = await repository.forwardMessage({
          sourceMessageId: messageId,
          targetConversationId,
          clientMessageId,
        });
        setActionError(null);
        await refreshInbox({ silent: true });
        if (selectedRef.current === targetConversationId) {
          await refreshSelectedConversation();
        }
        return Boolean(result.message_id);
      } catch (error) {
        setActionError(userError(error, "mutation_failed"));
        return false;
      } finally {
        messageActionPromisesRef.current.delete(operationKey);
      }
    })();
    messageActionPromisesRef.current.set(operationKey, operation);
    return operation;
  }, [active, currentProfileId, refreshInbox, refreshSelectedConversation, repository]);

  const setUserBlocked = useCallback(async (
    profileId: string,
    blocked: boolean,
    reasonCode?: string | null,
  ) => {
    const key = `block:${profileId}`;
    if (!active) return false;
    const existing = safetyPromisesRef.current.get(key);
    if (existing) return existing as Promise<boolean>;
    setSafetyMutations((current) => ({ ...current, [key]: true }));
    const operation = (async () => {
      try {
        await repository.setUserBlock(profileId, blocked, reasonCode);
        if (blocked) {
          const removedIds = new Set(conversationsRef.current
            .filter((conversation) => conversation.server.counterpartProfileId === profileId)
            .map((conversation) => conversation.id));
          replaceConversations((current) => current.filter((conversation) => !removedIds.has(conversation.id)));
          if (selectedRef.current && removedIds.has(selectedRef.current)) {
            selectedRef.current = null;
            setSelectedConversationId(null);
            setMessagesStatus("idle");
          }
        } else {
          await refreshInbox({ silent: true });
        }
        setActionError(null);
        return true;
      } catch (error) {
        setActionError(userError(error, "mutation_failed"));
        return false;
      } finally {
        safetyPromisesRef.current.delete(key);
        setSafetyMutations((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    })();
    safetyPromisesRef.current.set(key, operation);
    return operation;
  }, [active, refreshInbox, replaceConversations, repository]);

  const reportContent = useCallback(async (input: {
    subjectType: MessagingReportSubject;
    subjectId: string;
    category: MessagingReportCategory;
    comment?: string | null;
  }) => {
    const key = `report:${input.subjectType}:${input.subjectId}`;
    if (!active) return null;
    const existing = safetyPromisesRef.current.get(key);
    if (existing) return existing as Promise<string | null>;
    setSafetyMutations((current) => ({ ...current, [key]: true }));
    const idempotencyKey = createMessagingIdempotencyKey("report");
    const operation = (async () => {
      try {
        const result = await repository.reportContent({
          ...input,
          idempotencyKey,
        });
        setActionError(null);
        return result.report_id;
      } catch (error) {
        setActionError(userError(error, "mutation_failed"));
        return null;
      } finally {
        safetyPromisesRef.current.delete(key);
        setSafetyMutations((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
      }
    })();
    safetyPromisesRef.current.set(key, operation);
    return operation;
  }, [active, repository]);

  const searchContacts = useCallback(async (query: string) => {
    const normalized = query.trim().replace(/^@/, "");
    const requestId = ++contactRequestRef.current;
    if (!active || normalized.length < 2) {
      setContacts([]);
      setContactsStatus("idle");
      setContactsError(null);
      return [];
    }
    setContactsStatus("loading");
    setContactsError(null);
    try {
      const rows = await repository.searchMessageableProfiles(normalized);
      if (requestId !== contactRequestRef.current) return [];
      const mapped = rows.map(mapMessageableProfileToContact);
      setContacts(mapped);
      setContactsStatus("ready");
      return mapped;
    } catch (error) {
      if (requestId !== contactRequestRef.current) return [];
      setContacts([]);
      setContactsStatus("error");
      setContactsError(userError(error, "load_failed"));
      return [];
    }
  }, [active, repository]);

  const createCollaborationConversation = useCallback(async (requestId: string) => {
    if (!active) return null;
    try {
      const result = await repository.getOrCreateCollaborationConversation(requestId);
      await refreshInbox({ silent: true });
      setActionError(null);
      return result.conversation_id;
    } catch (error) {
      setActionError(userError(error, "mutation_failed"));
      return null;
    }
  }, [active, refreshInbox, repository]);

  const createDirectConversation = useCallback(async (profileId: string, idempotencyKey?: string) => {
    if (!active) return null;
    try {
      const result = await repository.getOrCreateDirectConversation(
        profileId,
        idempotencyKey ?? createMessagingIdempotencyKey("direct"),
      );
      await refreshInbox({ silent: true });
      await openConversation(result.conversation_id);
      setActionError(null);
      return result.conversation_id;
    } catch (error) {
      setActionError(userError(error, "mutation_failed"));
      return null;
    }
  }, [active, openConversation, refreshInbox, repository]);

  const createGroupConversation = useCallback(async (
    title: string,
    memberProfileIds: string[],
    idempotencyKey?: string,
  ) => {
    if (!active) return null;
    try {
      const result = await repository.createGroupConversation(
        title,
        memberProfileIds,
        idempotencyKey ?? createMessagingIdempotencyKey("group"),
      );
      await refreshInbox({ silent: true });
      await openConversation(result.conversation_id);
      setActionError(null);
      return result.conversation_id;
    } catch (error) {
      setActionError(userError(error, "mutation_failed"));
      return null;
    }
  }, [active, openConversation, refreshInbox, repository]);

  useEffect(() => {
    inboxRequestRef.current += 1;
    messageRequestRef.current += 1;
    contactRequestRef.current += 1;
    invitationRequestRef.current += 1;
    invitationPromisesRef.current.clear();
    safetyPromisesRef.current.clear();
    conversationsRef.current = [];
    messagesRef.current = {};
    selectedRef.current = null;
    outboxRef.current.clear();
    setConversations([]);
    setMessagesByConversation({});
    setSelectedConversationId(null);
    setInboxStatus(active ? "loading" : "idle");
    setMessagesStatus("idle");
    setInboxError(null);
    setMessagesError(null);
    setActionError(null);
    setContacts([]);
    setContactsStatus("idle");
    setConversationInvitations([]);
    setInvitationMutations({});
    setSafetyMutations({});
    setInvitationStatus(active ? "loading" : "idle");
    setInvitationError(null);
    if (active) {
      void refreshInbox();
      void refreshConversationInvitations();
    }
  }, [active, currentProfileId, refreshConversationInvitations, refreshInbox]);

  useEffect(() => {
    if (!active || typeof window === "undefined") return undefined;
    if (pollIntervalMs < MIN_POLL_INTERVAL_MS) return undefined;
    const interval = pollIntervalMs;
    const refreshVisibleSurface = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshInbox({ silent: true });
      void refreshConversationInvitations({ silent: true });
      const conversationId = selectedRef.current;
      if (conversationId) {
        void loadConversationMessages(conversationId, { select: false, silent: true, markRead: true });
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshVisibleSurface();
    };
    window.addEventListener("focus", refreshVisibleSurface);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(refreshVisibleSurface, interval);
    return () => {
      window.removeEventListener("focus", refreshVisibleSurface);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(timer);
    };
  }, [active, loadConversationMessages, pollIntervalMs, refreshConversationInvitations, refreshInbox]);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const selectedMessages = selectedConversationId ? messagesByConversation[selectedConversationId] ?? [] : [];

  return {
    conversations,
    selectedConversation,
    selectedConversationId,
    selectedMessages,
    inboxStatus,
    messagesStatus,
    inboxError,
    messagesError,
    actionError,
    hasMoreConversations,
    hasMoreMessages,
    contacts,
    contactsStatus,
    contactsError,
    conversationInvitations,
    invitationStatus,
    invitationError,
    invitationMutations,
    safetyMutations,
    refreshInbox,
    loadMoreConversations,
    refreshConversationInvitations,
    respondToConversationInvitation,
    openConversation,
    refreshSelectedConversation,
    loadOlderMessages,
    markConversationRead,
    sendText,
    retryMessage,
    updateConversationPreferences,
    setConversationHidden,
    leaveGroupConversation,
    setMessageReaction,
    setMessagePinned,
    deleteMessage,
    forwardMessage,
    setUserBlocked,
    reportContent,
    searchContacts,
    createDirectConversation,
    createCollaborationConversation,
    createGroupConversation,
    clearActionError: () => setActionError(null),
  };
}

export function isRetryableMessagingError(error: MessagingUserError | null) {
  if (!error) return false;
  return !new Set([
    "authentication_required",
    "blocked_relationship",
    "not_a_conversation_member",
    "not_an_active_conversation_member",
    "conversation_deleted",
    "idempotency_conflict",
    "idempotency_result_not_found",
  ]).has(error.code);
}

export function isMessagingServiceError(error: unknown): error is MessagingServiceError {
  return error instanceof MessagingServiceError;
}
