import type {
  MessagingArtistGroupActivityRow,
  MessagingArtistGroupActivityViewModel,
  MessagingArtistGroupInvitationRow,
  MessagingArtistGroupInvitationViewModel,
  MessagingArtistGroupRow,
  MessagingArtistGroupSummaryViewModel,
} from "./messaging.groups.types";

const FALLBACK_AVATAR = "/avatars/utilisateur.png";

const activityLabels: Record<MessagingArtistGroupActivityRow["event_type"], string> = {
  group_created: "Groupe créé",
  group_updated: "Informations du groupe mises à jour",
  group_archived: "Groupe archivé",
  group_restored: "Groupe restauré",
  group_deleted: "Groupe supprimé",
  member_invited: "Invitation envoyée",
  invitation_accepted: "Invitation acceptée",
  invitation_declined: "Invitation refusée",
  invitation_cancelled: "Invitation annulée",
  member_role_updated: "Rôle mis à jour",
  member_preferences_updated: "Préférences mises à jour",
  ownership_transferred: "Propriété transférée",
  member_removed: "Membre retiré",
  member_left: "Membre parti",
};

export function mapArtistGroupRow(row: MessagingArtistGroupRow): MessagingArtistGroupSummaryViewModel {
  return {
    id: row.group_id,
    name: row.name.trim(),
    description: row.description?.trim() ?? "",
    visibility: row.visibility,
    lifecycle: row.lifecycle_status,
    conversationId: row.conversation_id,
    memberCount: Number(row.active_member_count),
    memberLimit: Number(row.member_limit),
    pendingInvitationCount: Number(row.pending_invitation_count),
    authorityRole: row.my_authority_role,
    artisticRole: row.my_artistic_role?.trim() || null,
    notificationsEnabled: row.my_notifications_enabled,
    rosterVisibility: row.my_roster_visibility,
    personallyArchived: Boolean(row.my_archived_at),
    updatedAt: row.updated_at,
    cursor: row.page_cursor,
    server: row,
  };
}

export function mapArtistGroupInvitationRow(
  row: MessagingArtistGroupInvitationRow,
): MessagingArtistGroupInvitationViewModel {
  return {
    id: row.invitation_id,
    groupId: row.group_id,
    groupName: row.group_name.trim(),
    conversationId: row.conversation_id,
    inviterProfileId: row.invited_by_profile_id,
    inviterName: row.inviter_display_name.trim() || row.inviter_username?.trim() || "Membre Meewav",
    inviterAvatar: row.inviter_avatar_url?.trim() || FALLBACK_AVATAR,
    artisticRole: row.artistic_role?.trim() || null,
    message: row.message?.trim() || "Invitation à rejoindre le groupe",
    expiresAt: row.expires_at,
    cursor: row.page_cursor,
    server: row,
  };
}

export function mapArtistGroupActivityRow(
  row: MessagingArtistGroupActivityRow,
): MessagingArtistGroupActivityViewModel {
  return {
    id: row.activity_id,
    label: activityLabels[row.event_type],
    actorName: row.actor_display_name.trim() || "Compte supprimé",
    subjectProfileId: row.subject_profile_id,
    createdAt: row.created_at,
    payload: row.payload,
    cursor: row.page_cursor,
    server: row,
  };
}
