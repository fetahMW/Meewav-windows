import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessagingServiceError } from "./messaging.errors";
import type { MessagingMessageViewModel } from "./messaging.adapters";
import type { MessagingRepository } from "./messaging.service";
import type {
  MessageableProfileRow,
  MessagingConversationRow,
  MessagingMessageRow,
} from "./messaging.types";
import { useMessagingLive } from "./useMessagingLive";

const CURRENT_PROFILE_ID = "51000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "51000000-0000-4000-8000-000000000002";
const THIRD_PROFILE_ID = "51000000-0000-4000-8000-000000000003";
const CONVERSATION_A = "52000000-0000-4000-8000-000000000001";
const CONVERSATION_B = "52000000-0000-4000-8000-000000000002";
const MESSAGE_A = "53000000-0000-4000-8000-000000000001";
const MESSAGE_B = "53000000-0000-4000-8000-000000000002";
const CLIENT_MESSAGE_ID = "54000000-0000-4000-8000-000000000001";

function conversationRow(id: string, counterpartId: string, name: string): MessagingConversationRow {
  return {
    conversation_id: id,
    kind: "direct",
    title: null,
    last_message_id: null,
    last_message_at: null,
    last_message_body: null,
    last_message_kind: null,
    last_message_sender_profile_id: null,
    unread_count: 1,
    pinned_at: null,
    muted_until: null,
    archived_at: null,
    notifications_enabled: true,
    member_count: 2,
    counterpart_profile_id: counterpartId,
    counterpart_username: name.toLocaleLowerCase("fr-FR"),
    counterpart_display_name: name,
    counterpart_avatar_url: null,
    counterpart_avatar_style_key: null,
    counterpart_primary_role_key: "producer",
    counterpart_is_verified: false,
    counterpart_grade_level: 3,
    counterpart_grade_code: "confirmed",
    counterpart_grade_label: "Confirmé",
    counterpart_grade_visual_key: "grade-green",
    page_cursor: {
      pinned: false,
      pinned_at: null,
      activity_at: "2026-07-18T12:00:00Z",
      conversation_id: id,
    },
  };
}

function messageRow(id: string, conversationId: string, body: string, sequence = 1): MessagingMessageRow {
  return {
    id,
    conversation_id: conversationId,
    sender_profile_id: OTHER_PROFILE_ID,
    client_message_id: id,
    sequence,
    kind: "text",
    body,
    payload: {},
    reply_to_message_id: null,
    edited_at: null,
    deleted_at: null,
    moderation_status: "visible",
    reactions: [],
    created_at: "2026-07-18T12:00:00Z",
    updated_at: "2026-07-18T12:00:00Z",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function repository(overrides: Partial<MessagingRepository> = {}) {
  return {
    listConversations: vi.fn().mockResolvedValue([]),
    searchMessageableProfiles: vi.fn().mockResolvedValue([]),
    getOrCreateDirectConversation: vi.fn(),
    createGroupConversation: vi.fn(),
    listConversationInvitations: vi.fn().mockResolvedValue([]),
    respondToConversationInvitation: vi.fn(),
    listMessages: vi.fn().mockResolvedValue([]),
    listMembers: vi.fn().mockResolvedValue([]),
    sendTextMessage: vi.fn(),
    markConversationRead: vi.fn().mockResolvedValue({ ok: true, conversation_id: CONVERSATION_A, last_read_sequence: 1 }),
    setConversationPreferences: vi.fn(),
    setConversationHidden: vi.fn(),
    leaveGroupConversation: vi.fn(),
    setMessageReaction: vi.fn(),
    setMessagePinned: vi.fn(),
    deleteMessage: vi.fn(),
    forwardMessage: vi.fn(),
    setUserBlock: vi.fn(),
    reportContent: vi.fn(),
    ...overrides,
  } as unknown as MessagingRepository;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useMessagingLive", () => {
  it("loads only the direct and group inbox contract", async () => {
    const listConversations = vi.fn().mockResolvedValue([
      conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
    ]);
    const liveRepository = repository({ listConversations });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));

    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    expect(result.current.conversations).toHaveLength(1);
    expect(listConversations).toHaveBeenCalledWith(expect.objectContaining({ kinds: ["direct", "group"] }));
  });

  it("refreshes a selected thread after Realtime without writing a new read cursor", async () => {
    const markConversationRead = vi.fn().mockResolvedValue({
      ok: true,
      conversation_id: CONVERSATION_A,
      last_read_sequence: 1,
    });
    const listMessages = vi.fn().mockResolvedValue([
      messageRow(MESSAGE_A, CONVERSATION_A, "Message temps réel"),
    ]);
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([
        conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
      ]),
      listMessages,
      markConversationRead,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    await act(async () => {
      await result.current.openConversation(CONVERSATION_A);
    });
    await waitFor(() => expect(markConversationRead).toHaveBeenCalledTimes(1));
    markConversationRead.mockClear();

    await act(async () => {
      await result.current.refreshSelectedConversation();
    });

    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(markConversationRead).not.toHaveBeenCalled();
  });

  it("ignores a late conversation response after the user opens another thread", async () => {
    const first = deferred<MessagingMessageRow[]>();
    const second = deferred<MessagingMessageRow[]>();
    const listMessages = vi.fn((input: { conversationId: string }) => (
      input.conversationId === CONVERSATION_A ? first.promise : second.promise
    ));
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([
        conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
        conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Nadir"),
      ]),
      listMessages,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    let openFirst!: Promise<MessagingMessageViewModel[]>;
    let openSecond!: Promise<MessagingMessageViewModel[]>;
    act(() => {
      openFirst = result.current.openConversation(CONVERSATION_A);
      openSecond = result.current.openConversation(CONVERSATION_B);
    });
    await act(async () => {
      second.resolve([messageRow(MESSAGE_B, CONVERSATION_B, "Réponse récente")]);
      await openSecond;
    });
    await act(async () => {
      first.resolve([messageRow(MESSAGE_A, CONVERSATION_A, "Réponse en retard")]);
      await openFirst;
    });

    expect(result.current.selectedConversationId).toBe(CONVERSATION_B);
    expect(result.current.selectedMessages.map((message) => message.body)).toEqual(["Réponse récente"]);
  });

  it("retries a failed optimistic message with the exact same client UUID", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(CLIENT_MESSAGE_ID);
    const sendTextMessage = vi.fn()
      .mockRejectedValueOnce(new MessagingServiceError("mutation_failed"))
      .mockResolvedValueOnce({
        ok: true,
        idempotent: true,
        message_id: MESSAGE_A,
        sequence: 2,
        created_at: "2026-07-18T12:02:00Z",
      });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya")]),
      sendTextMessage,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_A));

    await act(() => result.current.sendText("Salut Maya"));
    expect(result.current.selectedMessages[0]).toMatchObject({
      body: "Salut Maya",
      deliveryStatus: "failed",
      sourceId: CLIENT_MESSAGE_ID,
    });

    await act(() => result.current.retryMessage(CLIENT_MESSAGE_ID));
    expect(result.current.selectedMessages[0]).toMatchObject({
      id: MESSAGE_A,
      deliveryStatus: "sent",
      sourceId: CLIENT_MESSAGE_ID,
    });
    expect(sendTextMessage).toHaveBeenCalledTimes(2);
    expect(sendTextMessage.mock.calls[0][0].clientMessageId).toBe(CLIENT_MESSAGE_ID);
    expect(sendTextMessage.mock.calls[1][0].clientMessageId).toBe(CLIENT_MESSAGE_ID);
  });

  it("sends a reply with its real server message target", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(CLIENT_MESSAGE_ID);
    const sendTextMessage = vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      message_id: MESSAGE_B,
      sequence: 2,
      created_at: "2026-07-18T12:02:00Z",
    });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya")]),
      listMessages: vi.fn().mockResolvedValue([messageRow(MESSAGE_A, CONVERSATION_A, "Message original")]),
      sendTextMessage,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_A));

    await act(() => result.current.sendText("Réponse", MESSAGE_A));

    expect(sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({
      body: "Réponse",
      replyToMessageId: MESSAGE_A,
    }));
    expect(result.current.selectedMessages[result.current.selectedMessages.length - 1]?.replyToId).toBe(MESSAGE_A);
  });

  it("persists shared pins and soft-deletes a loaded message", async () => {
    const setMessagePinned = vi.fn().mockResolvedValue({
      ok: true,
      message_id: MESSAGE_A,
      conversation_id: CONVERSATION_A,
      pinned: true,
      pinned_at: "2026-07-18T12:03:00Z",
      pinned_by_profile_id: CURRENT_PROFILE_ID,
    });
    const deleteMessage = vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      message_id: MESSAGE_A,
      conversation_id: CONVERSATION_A,
      deleted_at: "2026-07-18T12:04:00Z",
    });
    const ownMessage = {
      ...messageRow(MESSAGE_A, CONVERSATION_A, "Mon message"),
      sender_profile_id: CURRENT_PROFILE_ID,
    };
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya")]),
      listMessages: vi.fn().mockResolvedValue([ownMessage]),
      setMessagePinned,
      deleteMessage,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_A));

    await act(() => result.current.setMessagePinned(MESSAGE_A, true));
    expect(result.current.selectedMessages[0]).toMatchObject({
      pinned: true,
      server: { pinnedAt: "2026-07-18T12:03:00Z" },
    });

    await act(() => result.current.deleteMessage(MESSAGE_A));
    expect(result.current.selectedMessages[0]).toMatchObject({
      body: "Message supprimé",
      pinned: false,
      server: { deleted: true },
    });
    expect(setMessagePinned).toHaveBeenCalledWith(MESSAGE_A, true);
    expect(deleteMessage).toHaveBeenCalledWith(MESSAGE_A);
  });

  it("forwards through the target conversation contract without switching threads", async () => {
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(CLIENT_MESSAGE_ID);
    const forwardMessage = vi.fn().mockResolvedValue({
      ok: true,
      idempotent: false,
      message_id: MESSAGE_B,
      sequence: 3,
      created_at: "2026-07-18T12:05:00Z",
      source_message_id: MESSAGE_A,
      target_conversation_id: CONVERSATION_B,
    });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([
        conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
        conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Nadir"),
      ]),
      listMessages: vi.fn().mockResolvedValue([messageRow(MESSAGE_A, CONVERSATION_A, "À transférer")]),
      forwardMessage,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_A));

    await act(() => result.current.forwardMessage(MESSAGE_A, CONVERSATION_B));

    expect(forwardMessage).toHaveBeenCalledWith({
      sourceMessageId: MESSAGE_A,
      targetConversationId: CONVERSATION_B,
      clientMessageId: CLIENT_MESSAGE_ID,
    });
    expect(result.current.selectedConversationId).toBe(CONVERSATION_A);
  });

  it("updates preferences optimistically and restores the server state", async () => {
    const setConversationPreferences = vi.fn().mockResolvedValue({
      ok: true,
      conversation_id: CONVERSATION_A,
      pinned_at: "2026-07-18T12:00:00Z",
      muted_until: null,
      archived_at: null,
      notifications_enabled: true,
    });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya")]),
      setConversationPreferences,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    await act(() => result.current.updateConversationPreferences(CONVERSATION_A, { pinned: true }));
    expect(result.current.conversations[0].pinned).toBe(true);
    expect(setConversationPreferences).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: CONVERSATION_A,
      pinned: true,
    }));
  });

  it("removes an archived conversation from the active inbox", async () => {
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya")]),
      setConversationPreferences: vi.fn().mockResolvedValue({
        ok: true,
        conversation_id: CONVERSATION_A,
        pinned_at: null,
        muted_until: null,
        archived_at: "2026-07-18T12:10:00Z",
        notifications_enabled: true,
      }),
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_A));

    await act(() => result.current.updateConversationPreferences(CONVERSATION_A, { archived: true }));

    expect(result.current.conversations).toEqual([]);
    expect(result.current.selectedConversationId).toBeNull();
  });

  it("leaves a group through the server and removes it from the active inbox", async () => {
    const groupRow = {
      ...conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Groupe"),
      kind: "group" as const,
      title: "Studio Nuit",
    };
    const leaveGroupConversation = vi.fn().mockResolvedValue({
      ok: true,
      conversation_id: CONVERSATION_B,
      idempotent: false,
      transferred_owner_to: OTHER_PROFILE_ID,
    });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([groupRow]),
      leaveGroupConversation,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
    await act(() => result.current.openConversation(CONVERSATION_B));

    await act(() => result.current.leaveGroupConversation(CONVERSATION_B));

    expect(leaveGroupConversation).toHaveBeenCalledWith(CONVERSATION_B);
    expect(result.current.conversations).toEqual([]);
    expect(result.current.selectedConversationId).toBeNull();
  });

  it("searches safe contacts and creates direct and group conversations", async () => {
    const profile: MessageableProfileRow = {
      profile_id: OTHER_PROFILE_ID,
      username: "maya",
      display_name: "Maya",
      avatar_url: null,
      avatar_style_key: null,
      primary_role_key: "producer",
      city: "Paris",
      country_code: "FR",
      is_verified: true,
      grade_level: 3,
      grade_code: "confirmed",
      grade_label: "Confirmé",
      grade_visual_key: "grade-green",
      recognitions: [],
    };
    const getOrCreateDirectConversation = vi.fn().mockResolvedValue({
      ok: true, conversation_id: CONVERSATION_A, kind: "direct", idempotent: false,
    });
    const createGroupConversation = vi.fn().mockResolvedValue({
      ok: true, conversation_id: CONVERSATION_B, kind: "group", idempotent: false, invitation_count: 1,
    });
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([
        conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
        { ...conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Groupe"), kind: "group", title: "Studio Nuit" },
      ]),
      searchMessageableProfiles: vi.fn().mockResolvedValue([profile]),
      getOrCreateDirectConversation,
      createGroupConversation,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    await act(() => result.current.searchContacts("Maya"));
    expect(result.current.contacts[0]).toMatchObject({ id: OTHER_PROFILE_ID, displayName: "Maya" });

    await act(() => result.current.createDirectConversation(OTHER_PROFILE_ID, "direct:test-0001"));
    await act(() => result.current.createGroupConversation("Studio Nuit", [OTHER_PROFILE_ID], "group:test-0001"));
    expect(getOrCreateDirectConversation).toHaveBeenCalledWith(OTHER_PROFILE_ID, "direct:test-0001");
    expect(createGroupConversation).toHaveBeenCalledWith("Studio Nuit", [OTHER_PROFILE_ID], "group:test-0001");
  });

  it("loads group invitations and opens the real conversation after acceptance", async () => {
    const groupRow = {
      ...conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Groupe"),
      kind: "group" as const,
      title: "Studio Nuit",
    };
    const listConversations = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue([groupRow]);
    const listConversationInvitations = vi.fn().mockResolvedValue([{
      conversation_id: CONVERSATION_B,
      title: "Studio Nuit",
      inviter_profile_id: OTHER_PROFILE_ID,
      inviter_username: "maya",
      inviter_display_name: "Maya",
      inviter_avatar_url: null,
      invited_at: "2026-07-18T12:00:00Z",
      requested_member_count: 3,
    }]);
    const respondToConversationInvitation = vi.fn().mockResolvedValue({
      ok: true,
      conversation_id: CONVERSATION_B,
      accepted: true,
      idempotent: false,
    });
    const liveRepository = repository({
      listConversations,
      listConversationInvitations,
      respondToConversationInvitation,
      listMessages: vi.fn().mockResolvedValue([]),
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));

    await waitFor(() => expect(result.current.invitationStatus).toBe("ready"));
    expect(result.current.conversationInvitations).toHaveLength(1);

    await act(() => result.current.respondToConversationInvitation(CONVERSATION_B, true));

    expect(respondToConversationInvitation).toHaveBeenCalledWith(CONVERSATION_B, true);
    expect(result.current.conversationInvitations).toEqual([]);
    expect(result.current.selectedConversationId).toBe(CONVERSATION_B);
  });

  it("blocks a direct counterpart once and removes that thread from the inbox", async () => {
    const pendingBlock = deferred<{ ok: boolean; blocked_profile_id: string; is_blocked: boolean }>();
    const setUserBlock = vi.fn().mockReturnValue(pendingBlock.promise);
    const liveRepository = repository({
      listConversations: vi.fn().mockResolvedValue([
        conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
      ]),
      setUserBlock,
    });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.setUserBlocked(OTHER_PROFILE_ID, true, "harassment");
      second = result.current.setUserBlocked(OTHER_PROFILE_ID, true, "harassment");
    });
    expect(setUserBlock).toHaveBeenCalledTimes(1);
    await act(async () => pendingBlock.resolve({
      ok: true,
      blocked_profile_id: OTHER_PROFILE_ID,
      is_blocked: true,
    }));
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(result.current.conversations).toEqual([]);
  });

  it("deduplicates a rapid report submission", async () => {
    const pendingReport = deferred<{ ok: boolean; report_id: string; status: string }>();
    const reportContent = vi.fn().mockReturnValue(pendingReport.promise);
    const liveRepository = repository({ reportContent });
    const { result } = renderHook(() => useMessagingLive({
      enabled: true,
      currentProfileId: CURRENT_PROFILE_ID,
      repository: liveRepository,
      pollIntervalMs: 0,
    }));
    await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));

    const input = {
      subjectType: "conversation" as const,
      subjectId: CONVERSATION_A,
      category: "spam" as const,
      comment: "Messages répétés",
    };
    let first!: Promise<string | null>;
    let second!: Promise<string | null>;
    act(() => {
      first = result.current.reportContent(input);
      second = result.current.reportContent(input);
    });
    expect(reportContent).toHaveBeenCalledTimes(1);
    await act(async () => pendingReport.resolve({
      ok: true,
      report_id: MESSAGE_B,
      status: "open",
    }));
    await expect(first).resolves.toBe(MESSAGE_B);
    await expect(second).resolves.toBe(MESSAGE_B);
  });
});


it("opens a dedicated collaboration chat without creating a friends DM or stealing the current selection", async () => {
  const requestId = "55000000-0000-4000-8000-000000000001";
  const getOrCreateCollaborationConversation = vi.fn().mockResolvedValue({ ok: true, conversation_id: CONVERSATION_B, kind: "direct", idempotent: false });
  const liveRepository = repository({
    getOrCreateCollaborationConversation,
    listConversations: vi.fn().mockResolvedValue([
      conversationRow(CONVERSATION_A, OTHER_PROFILE_ID, "Maya"),
      { ...conversationRow(CONVERSATION_B, THIRD_PROFILE_ID, "Nadir"), collaboration_request_id: requestId },
    ]),
  });
  const { result } = renderHook(() => useMessagingLive({ enabled: true, currentProfileId: CURRENT_PROFILE_ID, repository: liveRepository, pollIntervalMs: 0 }));
  await waitFor(() => expect(result.current.inboxStatus).toBe("ready"));
  await act(() => result.current.openConversation(CONVERSATION_A));
  await act(() => result.current.createCollaborationConversation(requestId));
  expect(getOrCreateCollaborationConversation).toHaveBeenCalledWith(requestId);
  expect(liveRepository.getOrCreateDirectConversation).not.toHaveBeenCalled();
  expect(result.current.selectedConversationId).toBe(CONVERSATION_A);
  expect(result.current.conversations.find((item) => item.id === CONVERSATION_B)?.collaborationRequestId).toBe(requestId);
});
