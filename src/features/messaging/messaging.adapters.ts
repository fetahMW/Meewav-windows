import type {
  DemoContact,
  DemoConversation,
  DemoMessage,
} from "./messagingDemoData";
import type {
  MessageableProfileRow,
  MessagingConversationInvitationRow,
  MessagingConversationRow,
  MessagingInvitationViewModel,
  MessagingMemberRow,
  MessagingMessageRow,
  MessagingReactionRow,
} from "./messaging.types";

const FALLBACK_AVATAR = "/avatars/utilisateur.png";
const FALLBACK_GROUP_AVATAR = "/images/messaging/groups/group_1.png";

export type MessagingConversationViewModel = DemoConversation & {
  server: {
    kind: MessagingConversationRow["kind"];
    cursor: MessagingConversationRow["page_cursor"];
    memberCount: number;
    counterpartProfileId: string | null;
    pinnedAt: string | null;
    mutedUntil: string | null;
    archivedAt: string | null;
    archived: boolean;
    notificationsEnabled: boolean;
  };
};

export type MessagingMessageViewModel = DemoMessage & {
  server: {
    conversationId: string;
    senderProfileId: string | null;
    clientMessageId: string;
    sequence: number;
    createdAt: string;
    editedAt: string | null;
    deleted: boolean;
    pinnedAt?: string | null;
    pinnedByProfileId?: string | null;
    reactionRows: MessagingReactionRow[];
  };
  deliveryStatus?: "pending" | "sent" | "failed";
};

function asNonNegativeInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
}

function normalizedGrade(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 6) return undefined;
  return numeric;
}

function humanizeRole(value: string | null | undefined) {
  const normalized = value?.trim().replace(/[_-]+/g, " ") ?? "";
  if (!normalized) return "Artiste Meewav";
  return normalized.charAt(0).toLocaleUpperCase("fr-FR") + normalized.slice(1);
}

function safeAvatar(value: string | null | undefined, group = false) {
  const normalized = value?.trim();
  if (normalized) return normalized;
  return group ? FALLBACK_GROUP_AVATAR : FALLBACK_AVATAR;
}

function safeHandle(username: string | null | undefined) {
  const normalized = username?.trim().replace(/^@+/, "") ?? "";
  return normalized ? `@${normalized}` : "@profil";
}

function formatMessagingTime(value: string | null | undefined, now = new Date()) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const sameDay = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const elapsedDays = Math.round((dayStart - messageDayStart) / 86_400_000);
  if (elapsedDays === 1) return "Hier";
  if (elapsedDays > 1 && elapsedDays < 7) {
    return date.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
  }
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }).replace(".", "");
}

function reactionRows(value: MessagingMessageRow["reactions"]): MessagingReactionRow[] {
  if (!Array.isArray(value)) return [];
  const entries = value as unknown[];
  return entries.filter((entry): entry is MessagingReactionRow => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const record = entry as unknown as Record<string, unknown>;
    return typeof record.profile_id === "string"
      && typeof record.emoji === "string"
      && typeof record.created_at === "string";
  });
}

function isForwardedPayload(value: MessagingMessageRow["payload"]) {
  return Boolean(
    value
    && typeof value === "object"
    && !Array.isArray(value)
    && value.is_forwarded === true,
  );
}

export function summarizeMessagingReactions(rows: MessagingReactionRow[]) {
  const counts = new Map<string, number>();
  for (const reaction of rows) {
    counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
  }
  return [...counts].map(([emoji, count]) => `${emoji} ${count}`);
}

export function mapConversationRowToViewModel(
  row: MessagingConversationRow,
  now = new Date(),
): MessagingConversationViewModel {
  const group = row.kind !== "direct";
  const missingDirectCounterpart = !group && !row.counterpart_profile_id;
  const name = group
    ? row.title?.trim() || "Conversation de groupe"
    : row.counterpart_display_name?.trim()
      || row.counterpart_username?.trim()
      || row.title?.trim()
      || "Membre Meewav";
  const mutedUntil = row.muted_until ? new Date(row.muted_until) : null;
  const muted = Boolean(mutedUntil && !Number.isNaN(mutedUntil.getTime()) && mutedUntil > now);
  const preview = row.last_message_body?.trim()
    || (row.last_message_id ? "Message indisponible" : "Commence la conversation");

  return {
    id: row.conversation_id,
    name,
    handle: group
      ? "Groupe d’artistes"
      : missingDirectCounterpart ? "Compte supprimé" : safeHandle(row.counterpart_username),
    role: group
      ? `${asNonNegativeInteger(row.member_count)} membres`
      : humanizeRole(row.counterpart_primary_role_key),
    avatar: safeAvatar(row.counterpart_avatar_url, group),
    status: group
      ? "Conversation de groupe"
      : missingDirectCounterpart ? "Historique conservé" : "Conversation directe",
    online: false,
    gradeLevel: group ? undefined : normalizedGrade(row.counterpart_grade_level),
    pinned: Boolean(row.pinned_at),
    muted,
    unread: asNonNegativeInteger(row.unread_count),
    preview,
    time: formatMessagingTime(row.last_message_at, now),
    messages: [],
    conversationKind: row.kind,
    collaborationRequestId: row.collaboration_request_id ?? null,
    readOnlyReason: missingDirectCounterpart
      ? "Ce compte n’existe plus. Tu peux consulter l’historique, mais plus lui écrire."
      : undefined,
    server: {
      kind: row.kind,
      cursor: row.page_cursor,
      memberCount: asNonNegativeInteger(row.member_count),
      counterpartProfileId: row.counterpart_profile_id,
      pinnedAt: row.pinned_at,
      mutedUntil: row.muted_until,
      archivedAt: row.archived_at,
      archived: Boolean(row.archived_at),
      notificationsEnabled: row.notifications_enabled,
    },
  };
}

export function mapMessageRowToViewModel(
  row: MessagingMessageRow,
  currentProfileId: string,
  now = new Date(),
): MessagingMessageViewModel {
  const rows = reactionRows(row.reactions);
  const deleted = Boolean(row.deleted_at);

  return {
    id: row.id,
    sourceId: row.client_message_id,
    author: row.sender_profile_id === currentProfileId ? "me" : "them",
    kind: "text",
    body: deleted ? "Message supprimé" : row.body?.trim() || "",
    time: formatMessagingTime(row.created_at, now),
    reactions: summarizeMessagingReactions(rows),
    replyToId: row.reply_to_message_id ?? undefined,
    pinned: Boolean(row.pinned_at),
    deleted,
    forwardedFrom: isForwardedPayload(row.payload) ? "Message transféré" : undefined,
    deliveryStatus: "sent",
    server: {
      conversationId: row.conversation_id,
      senderProfileId: row.sender_profile_id,
      clientMessageId: row.client_message_id,
      sequence: asNonNegativeInteger(row.sequence),
      createdAt: row.created_at,
      editedAt: row.edited_at,
      deleted,
      pinnedAt: row.pinned_at ?? null,
      pinnedByProfileId: row.pinned_by_profile_id ?? null,
      reactionRows: rows,
    },
  };
}

export function mapMessageableProfileToContact(row: MessageableProfileRow): DemoContact {
  return {
    id: row.profile_id,
    username: safeHandle(row.username),
    displayName: row.display_name?.trim() || row.username?.trim() || "Membre Meewav",
    avatar: safeAvatar(row.avatar_url),
    online: false,
    role: humanizeRole(row.primary_role_key),
    status: [row.city, row.country_code].filter(Boolean).join(" · ") || undefined,
    gradeLevel: normalizedGrade(row.grade_level),
  };
}

export function mapMemberRowToContact(row: MessagingMemberRow): DemoContact {
  return {
    id: row.profile_id,
    username: safeHandle(row.username),
    displayName: row.display_name?.trim() || row.username?.trim() || "Membre Meewav",
    avatar: safeAvatar(row.profile_image_url || row.avatar_url),
    online: false,
    role: humanizeRole(row.primary_role_key),
    gradeLevel: normalizedGrade(row.grade_level),
  };
}

export function mapInvitationRowToViewModel(
  row: MessagingConversationInvitationRow,
): MessagingInvitationViewModel {
  return {
    conversationId: row.conversation_id,
    title: row.title?.trim() || "Invitation de groupe",
    inviterProfileId: row.inviter_profile_id,
    inviterName: row.inviter_display_name?.trim() || row.inviter_username?.trim() || "Membre Meewav",
    inviterHandle: safeHandle(row.inviter_username),
    inviterAvatar: safeAvatar(row.inviter_avatar_url),
    invitedAt: row.invited_at,
    memberCount: asNonNegativeInteger(row.requested_member_count),
  };
}

export function sortOldestMessageFirst<T extends MessagingMessageRow>(rows: T[]) {
  return [...rows].sort((left, right) => left.sequence - right.sequence);
}
