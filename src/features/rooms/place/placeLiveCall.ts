import type { MessagingConversationRow } from "../../messaging/messaging.types";

const FALLBACK_CONTACT_AVATAR = "/avatars/utilisateur.png";

export type PlaceLiveCallContact = {
  profileId: string;
  conversationId: string;
  displayName: string;
  username: string | null;
  avatarUrl: string;
  isVerified: boolean;
};

export type PlaceLiveCallRequest = {
  roomId: string;
  contacts: PlaceLiveCallContact[];
  mode: "private" | "public";
};

export type PlaceLiveCallRequestHandler = (
  request: PlaceLiveCallRequest,
) => void | Promise<void>;

export function liveCallContactsFromConversations(rows: MessagingConversationRow[]) {
  const contacts = new Map<string, PlaceLiveCallContact>();

  for (const row of rows) {
    const profileId = row.counterpart_profile_id?.trim();
    if (row.kind !== "direct" || !profileId || contacts.has(profileId)) continue;

    const username = row.counterpart_username?.trim().replace(/^@+/, "") || null;
    const displayName = row.counterpart_display_name?.trim()
      || username
      || "Contact Meewav";

    contacts.set(profileId, {
      profileId,
      conversationId: row.conversation_id,
      displayName,
      username,
      avatarUrl: row.counterpart_avatar_url?.trim() || FALLBACK_CONTACT_AVATAR,
      isVerified: row.counterpart_is_verified === true,
    });
  }

  return [...contacts.values()].sort((left, right) => (
    left.displayName.localeCompare(right.displayName, "fr", { sensitivity: "base" })
  ));
}
