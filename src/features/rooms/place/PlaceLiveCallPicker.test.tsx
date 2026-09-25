import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MessagingConversationRow } from "../../messaging/messaging.types";
import type { RoomLiveCallContact } from "../live-call/roomLiveCall.service";
import PlaceLiveCallPicker from "./PlaceLiveCallPicker";
import { liveCallContactsFromConversations } from "./placeLiveCall";

const liveCalls = vi.hoisted(() => ({
  listContacts: vi.fn(),
}));

vi.mock("../live-call/roomLiveCall.service", () => ({
  ROOM_LIVE_CALL_MAX_CONTACTS: 8,
  roomLiveCallRepository: {
    listContacts: liveCalls.listContacts,
  },
}));

const ROOM_ID = "12000000-0000-4000-8000-000000000001";

function liveCallContact(profileId: string, conversationId: string, displayName: string): RoomLiveCallContact {
  return {
    profileId,
    conversationId,
    displayName,
    username: displayName.toLocaleLowerCase("fr-FR"),
    avatarUrl: "/avatars/utilisateur.png",
    isVerified: false,
    isOnline: true,
    activeInvitationId: null,
    activeInvitationStatus: null,
    activeCallMode: null,
    activeRouteMode: null,
    activeInvitationExpiresAt: null,
  };
}

function directConversation(
  conversationId: string,
  profileId: string | null,
  displayName: string | null,
  overrides: Partial<MessagingConversationRow> = {},
): MessagingConversationRow {
  return {
    conversation_id: conversationId,
    kind: "direct",
    title: null,
    last_message_id: null,
    last_message_at: null,
    last_message_body: null,
    last_message_kind: null,
    last_message_sender_profile_id: null,
    unread_count: 0,
    pinned_at: null,
    muted_until: null,
    archived_at: null,
    notifications_enabled: true,
    member_count: 2,
    counterpart_profile_id: profileId,
    counterpart_username: displayName?.toLocaleLowerCase("fr-FR") ?? null,
    counterpart_display_name: displayName,
    counterpart_avatar_url: null,
    counterpart_avatar_style_key: null,
    counterpart_primary_role_key: "artist",
    counterpart_is_verified: false,
    counterpart_grade_level: null,
    counterpart_grade_code: null,
    counterpart_grade_label: null,
    counterpart_grade_visual_key: null,
    page_cursor: {
      pinned: false,
      pinned_at: null,
      activity_at: "2026-08-15T10:00:00.000Z",
      conversation_id: conversationId,
    },
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  liveCalls.listContacts.mockReset();
});

describe("PlaceLiveCallPicker", () => {
  it("keeps only unique, valid direct messaging contacts", () => {
    const result = liveCallContactsFromConversations([
      directConversation("conversation-b", "profile-b", "Zoé"),
      directConversation("conversation-a", "profile-a", "Amel", { counterpart_is_verified: true }),
      directConversation("conversation-duplicate", "profile-a", "Amel"),
      directConversation("conversation-deleted", null, null),
      directConversation("conversation-group", "profile-group", "Groupe", { kind: "group" }),
    ]);

    expect(result.map((contact) => contact.profileId)).toEqual(["profile-a", "profile-b"]);
    expect(result[0]).toMatchObject({
      conversationId: "conversation-a",
      displayName: "Amel",
      isVerified: true,
    });
  });

  it("loads direct conversations lazily and emits one structured multi-contact request", async () => {
    liveCalls.listContacts.mockResolvedValue([
      liveCallContact("12000000-0000-4000-8000-000000000002", "12000000-0000-4000-8000-000000000003", "Amel"),
      liveCallContact("12000000-0000-4000-8000-000000000004", "12000000-0000-4000-8000-000000000005", "Zoé"),
    ]);
    const onLiveCallRequest = vi.fn().mockResolvedValue(undefined);

    render(<PlaceLiveCallPicker roomId={ROOM_ID} onLiveCallRequest={onLiveCallRequest} />);

    expect(liveCalls.listContacts).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Appeler des contacts dans le live" }));

    expect(await screen.findByRole("dialog", { name: "Appeler dans le live" })).toBeVisible();
    await waitFor(() => expect(liveCalls.listContacts).toHaveBeenCalledWith(ROOM_ID, null, 50));

    fireEvent.click(await screen.findByRole("checkbox", { name: /Amel/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Zoé/i }));
    expect(document.querySelector(".place-live-call__footer > span")).toHaveTextContent("2 contacts sélectionnés");

    expect(screen.getByRole("radio", { name: /Appel privé/i })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Appel public/i }));
    fireEvent.click(screen.getByRole("button", { name: "Appeler en public" }));
    await waitFor(() => expect(onLiveCallRequest).toHaveBeenCalledWith({
      roomId: ROOM_ID,
      mode: "public",
      contacts: [
        expect.objectContaining({ profileId: "12000000-0000-4000-8000-000000000002", conversationId: "12000000-0000-4000-8000-000000000003" }),
        expect.objectContaining({ profileId: "12000000-0000-4000-8000-000000000004", conversationId: "12000000-0000-4000-8000-000000000005" }),
      ],
    }));
    expect(screen.queryByRole("dialog", { name: "Appeler dans le live" })).not.toBeInTheDocument();
  });

  it("exposes loading failures and lets the host retry", async () => {
    liveCalls.listContacts
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([]);

    render(<PlaceLiveCallPicker roomId={ROOM_ID} onLiveCallRequest={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Appeler des contacts dans le live" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Contacts indisponibles");
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));

    expect(await screen.findByText("Aucun contact direct")).toBeVisible();
    expect(liveCalls.listContacts).toHaveBeenCalledTimes(2);
  });

  it("restores focus to the phone trigger when Escape closes the panel", async () => {
    liveCalls.listContacts.mockResolvedValue([]);
    render(<PlaceLiveCallPicker roomId={ROOM_ID} onLiveCallRequest={vi.fn()} />);

    const trigger = screen.getByRole("button", { name: "Appeler des contacts dans le live" });
    fireEvent.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Appeler dans le live" })).toBeVisible();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "Appeler dans le live" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
