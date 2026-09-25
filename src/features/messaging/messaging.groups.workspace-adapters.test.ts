import { describe, expect, it } from "vitest";
import { mapMessagingArtistGroupToWorkspace } from "./messaging.groups.workspace-adapters";
import type {
  MessagingArtistGroupDetail,
  MessagingArtistGroupSummaryViewModel,
} from "./messaging.groups.types";

const summary: MessagingArtistGroupSummaryViewModel = {
  id: "71000000-0000-4000-8000-000000000001",
  name: "Midnight Echo",
  description: "Collectif live",
  visibility: "private",
  lifecycle: "active",
  conversationId: "72000000-0000-4000-8000-000000000001",
  memberCount: 2,
  memberLimit: 50,
  pendingInvitationCount: 1,
  authorityRole: "owner",
  artisticRole: "beatmaker",
  notificationsEnabled: true,
  rosterVisibility: "visible",
  personallyArchived: false,
  updatedAt: "2026-07-18T12:00:00Z",
  cursor: { updated_at: "2026-07-18T12:00:00Z", group_id: "71000000-0000-4000-8000-000000000001" },
  server: {} as MessagingArtistGroupSummaryViewModel["server"],
};

const detail: MessagingArtistGroupDetail = {
  group_id: summary.id,
  name: summary.name,
  description: summary.description,
  visibility: "private",
  lifecycle_status: "active",
  conversation_id: summary.conversationId,
  member_limit: 50,
  created_at: "2026-07-18T11:00:00Z",
  updated_at: summary.updatedAt,
  my_authority_role: "owner",
  my_artistic_role: "beatmaker",
  my_notifications_enabled: true,
  my_roster_visibility: "visible",
  my_archived_at: null,
  members: [{
    profile_id: "73000000-0000-4000-8000-000000000001",
    username: "luna",
    display_name: "Luna",
    avatar_url: null,
    avatar_style_key: null,
    primary_role_key: "singer",
    authority_role: "admin",
    artistic_role: "chanteuse",
    joined_at: "2026-07-18T11:00:00Z",
    roster_visibility: "visible",
  }],
  pending_invitations: [],
};

describe("mapMessagingArtistGroupToWorkspace", () => {
  it("préserve les identifiants serveur et distingue le rôle artistique de l’autorité", () => {
    const mapped = mapMessagingArtistGroupToWorkspace(summary, detail);

    expect(mapped).toEqual(expect.objectContaining({
      id: summary.id,
      name: "Midnight Echo",
      style: "Groupe d’artistes • Beatmaker",
      relatedProjectIds: [],
      server: expect.objectContaining({
        conversationId: summary.conversationId,
        authorityRole: "owner",
      }),
    }));
    expect(mapped.members).toEqual([
      expect.objectContaining({
        id: detail.members[0].profile_id,
        name: "Luna",
        role: "Chanteuse",
        authorityRole: "admin",
      }),
    ]);
  });

  it("n’invente ni session, ni vote, ni projet quand seul le core serveur existe", () => {
    const mapped = mapMessagingArtistGroupToWorkspace(summary);

    expect(mapped.nextSessionTitle).toBeUndefined();
    expect(mapped.pendingDecisionTitle).toBeUndefined();
    expect(mapped.relatedProjectIds).toEqual([]);
    expect(mapped.members).toEqual([]);
  });
});
