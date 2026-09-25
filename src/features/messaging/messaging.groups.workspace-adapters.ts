import type { ArtistGroup } from "./ArtistGroupsWorkspace";
import type {
  MessagingArtistGroupDetail,
  MessagingArtistGroupSummaryViewModel,
} from "./messaging.groups.types";

const GROUP_COVERS = [
  "/images/messaging/groups/group_1.png",
  "/images/messaging/groups/group_2.png",
  "/images/messaging/groups/group_3.png",
  "/images/messaging/groups/group_4.png",
  "/images/messaging/groups/group_5.png",
];
const FALLBACK_AVATAR = "/avatars/utilisateur.png";

function stableCover(groupId: string) {
  const seed = [...groupId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return GROUP_COVERS[seed % GROUP_COVERS.length];
}

function humanizeRole(value: string | null | undefined) {
  if (!value) return "Artiste";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toLocaleUpperCase("fr-FR"));
}

export function mapMessagingArtistGroupToWorkspace(
  summary: MessagingArtistGroupSummaryViewModel,
  detail: MessagingArtistGroupDetail | null = null,
): ArtistGroup {
  const selectedDetail = detail?.group_id === summary.id ? detail : null;
  const memberCount = selectedDetail?.members.length ?? summary.memberCount;
  const pendingInvitationCount = selectedDetail?.pending_invitations.length ?? summary.pendingInvitationCount;

  return {
    id: summary.id,
    name: summary.name,
    style: summary.artisticRole
      ? `Groupe d’artistes • ${humanizeRole(summary.artisticRole)}`
      : summary.visibility === "discoverable" ? "Groupe d’artistes • Découvrable" : "Groupe d’artistes • Privé",
    description: summary.description || "Espace de collaboration du groupe.",
    cover: stableCover(summary.id),
    statusInfo: `${memberCount} membre${memberCount > 1 ? "s" : ""}${pendingInvitationCount > 0 ? ` • ${pendingInvitationCount} invitation${pendingInvitationCount > 1 ? "s" : ""} en attente` : ""}`,
    lastMessage: summary.lifecycle === "archived" ? "Groupe archivé" : "Discussion du groupe",
    messages: [],
    members: selectedDetail ? [
      ...selectedDetail.members.map((member) => ({
        id: member.profile_id,
        name: member.display_name || member.username || "Artiste Meewav",
        role: humanizeRole(member.artistic_role ?? member.primary_role_key),
        avatar: member.avatar_url || FALLBACK_AVATAR,
        online: false,
        authorityRole: member.authority_role,
      })),
      ...selectedDetail.pending_invitations.map((invitation) => ({
        id: invitation.invitee_profile_id,
        name: invitation.invitee_display_name || invitation.invitee_username || "Artiste invité",
        role: humanizeRole(invitation.artistic_role),
        avatar: FALLBACK_AVATAR,
        online: false,
        status: "pending" as const,
        authorityRole: "member" as const,
        invitationId: invitation.invitation_id,
      })),
    ] : [],
    relatedProjectIds: [],
    server: {
      conversationId: summary.conversationId,
      authorityRole: summary.authorityRole,
      visibility: summary.visibility,
      lifecycle: summary.lifecycle,
      notificationsEnabled: summary.notificationsEnabled,
      rosterVisibility: summary.rosterVisibility,
      personallyArchived: summary.personallyArchived,
      pendingInvitationCount,
    },
  };
}
