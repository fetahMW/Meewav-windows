import type { DemoCollab } from "./messagingDemoData";
import type {
  MessagingCollaborationRequestRow,
  MessagingCollaborationStatus,
  MessagingCollaborationViewModel,
} from "./messaging.collaboration.types";
import type { MessagingOriginSource } from "./messaging.route";

const FALLBACK_AVATAR = "/avatars/utilisateur.png";
const COLLABORATION_SOURCES = new Set<MessagingOriginSource>([
  "globe", "profile", "messaging", "rooms", "shorts", "marketplace", "tremplin",
]);

function collaborationSource(value: string): MessagingOriginSource | undefined {
  return COLLABORATION_SOURCES.has(value as MessagingOriginSource)
    ? value as MessagingOriginSource
    : undefined;
}

function normalizedGrade(value: unknown) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 6) return undefined;
  return numeric;
}

function humanizeRole(value: string | null) {
  const normalized = value?.trim().replace(/[_-]+/g, " ") ?? "";
  if (!normalized) return "Artiste Meewav";
  return normalized.charAt(0).toLocaleUpperCase("fr-FR") + normalized.slice(1);
}

function relativeTime(value: string, now = new Date()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "À l’instant";
  if (minutes < 60) return `Il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Il y a ${days} j`;
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" }).replace(".", "");
}

function demoStatus(row: MessagingCollaborationRequestRow): Pick<DemoCollab, "status" | "requestStatus" | "sentState" | "acceptedState"> {
  if (row.status === "accepted") {
    return {
      status: "accepted",
      requestStatus: "accepted",
      sentState: "accepted",
      acceptedState: "inProgress",
    };
  }
  if (row.status === "pending" && row.direction === "received") {
    return { status: "pending", requestStatus: "pending" };
  }
  if (row.status === "pending") {
    // The projection exposes the current participant's viewed_at, not the
    // recipient's read receipt. Do not invent an unread/read state here.
    return { status: "sent", requestStatus: "pending" };
  }
  if (row.status === "declined") {
    return { status: "sent", requestStatus: "rejected", sentState: "rejected" };
  }
  return { status: "sent", requestStatus: "rejected" };
}

export function mapCollaborationRowToViewModel(
  row: MessagingCollaborationRequestRow,
  currentProfileId: string,
  now = new Date(),
): MessagingCollaborationViewModel {
  const gradeLevel = normalizedGrade(row.other_grade_level);
  const status = demoStatus(row);
  const senderProfileId = row.direction === "received" ? row.other_profile_id : currentProfileId;
  const recipientProfileId = row.direction === "received" ? currentProfileId : row.other_profile_id;

  return {
    id: row.request_id,
    userId: row.other_profile_id,
    name: row.other_display_name?.trim() || row.other_username?.trim() || "Membre Meewav",
    role: humanizeRole(row.other_primary_role_key),
    avatar: row.other_avatar_url?.trim() || FALLBACK_AVATAR,
    verified: Boolean(row.other_is_verified),
    message: row.message?.trim() || "Demande de collaboration",
    meta: relativeTime(row.created_at, now),
    rank: gradeLevel ?? 1,
    gradeLevel,
    ...status,
    isReceived: row.direction === "received",
    attachments: [],
    origin: row.source === "globe" ? "globe" : undefined,
    requestSource: collaborationSource(row.source),
    senderProfileId,
    recipientProfileId,
    createdAt: row.created_at,
    server: {
      direction: row.direction,
      status: row.status,
      source: row.source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      respondedAt: row.responded_at,
      viewedAt: row.viewed_at,
      unread: row.is_unread,
      canAccept: row.can_accept,
      canDecline: row.can_decline,
      canCancel: row.can_cancel,
      relationshipBlocked: row.relationship_blocked,
      otherProfileId: row.other_profile_id,
      otherUsername: row.other_username,
      otherAvatarStyleKey: row.other_avatar_style_key,
      otherCity: row.other_city,
      otherCountryCode: row.other_country_code,
      otherGradeCode: row.other_grade_code,
      otherGradeLabel: row.other_grade_label,
      otherGradeVisualKey: row.other_grade_visual_key,
      conversationId: row.conversation_id,
      cursor: row.page_cursor,
    },
  };
}

export function replaceCollaborationStatus(
  row: MessagingCollaborationRequestRow,
  status: MessagingCollaborationStatus,
  conversationId?: string | null,
): MessagingCollaborationRequestRow {
  const terminal = status !== "pending";
  return {
    ...row,
    status,
    conversation_id: conversationId === undefined ? row.conversation_id : conversationId,
    responded_at: terminal ? new Date().toISOString() : row.responded_at,
    updated_at: new Date().toISOString(),
    can_accept: false,
    can_decline: false,
    can_cancel: false,
    is_unread: false,
  };
}
